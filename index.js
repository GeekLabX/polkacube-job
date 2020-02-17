require("dotenv").config();
require('console-stamp')(console, {pattern: 'yyyy-mm-dd HH:MM:ss.l'});
const {ApiPromise, WsProvider} = require("@polkadot/api");
const {encodeAddress} = require('@polkadot/util-crypto');
const {formatBalance} = require('@polkadot/util');
const BN = require("bn.js");
const DB = require("./database.js");
const UTIL = require("./util.js");


async function main() {
    const wsEndpoint = `ws://${process.env.SUBSTRATE_WS_HOST}:${process.env.SUBSTRATE_WS_PORT}`;
    const provider = new WsProvider(wsEndpoint);
    const api = await ApiPromise.create({provider});
    provider.on('disconnected', () => {
        console.error(`Substrate websocket has been disconnected from the endpoint ${wsEndpoint}`);
        process.exit(-1);
    });

    let chainInfo = {};
    [chainInfo.chain, chainInfo.nodeName, chainInfo.nodeVersion, chainInfo.properties] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version(),
        api.rpc.system.properties()
    ]);

    console.info(`Connected to chain: ${chainInfo.chain}, using: ${chainInfo.nodeName} v${chainInfo.nodeVersion}`);
    console.info(`Node specific properties: ${JSON.stringify(chainInfo.properties)}`);
    formatBalance.setDefaults({
        decimals: chainInfo.properties.tokenDecimals,
        unit: chainInfo.properties.tokenSymbol
    });

    const formatAddress = (address) => address ? encodeAddress(address, chainInfo.properties.ss58Format) : '';

    const getHeaderAtIndex = async (index) => {
        const blockHash = await api.rpc.chain.getBlockHash(index);
        return api.derive.chain.getHeader(blockHash);
    };

    const getNickName = async (accountId) => {
        const accountInfo = await api.derive.accounts.info(accountId);
        return accountInfo.nickname;
    };

    const getBestNumber = async () => {
        const bestNum = await api.derive.chain.bestNumber();
        return bestNum.toNumber();
    };

    const checkTokenInfo = async () => {
        const [bestNum, sessionInfo, electedValidators, allStakingValidators, totalIss] = await Promise.all([
            api.derive.chain.bestNumber(),
            api.derive.session.info(),
            api.query.session.validators(),
            api.query.staking.validators(),
            api.query.balances.totalIssuance()
        ]);
        const totalIssuance = UTIL.parseBalance(totalIss);
        const validatorsCount = electedValidators.length;

        const allValidators = allStakingValidators[0];
        const allValidatorStakingInfo = await Promise.all(
            allValidators.map(authorityId => api.derive.staking.account(authorityId))
        );

        let totalBond = new BN(0);
        allValidatorStakingInfo.forEach(validator => {
            totalBond = totalBond.add(UTIL.parseBalance(validator.stakers.total));
        });

        let stakingRatio = totalBond / totalIssuance;
        let inflation = 0.1;
        let inflationForValidators;
        if (stakingRatio <= 0.5) {
            inflationForValidators = 0.025 + stakingRatio * (0.2 - 0.025 / 0.5);
        } else {
            inflationForValidators = 0.025 + (0.1 - 0.025) * (2 ** ((0.5 - stakingRatio) / 0.05));
        }
        let lastRewardPercent = await DB.getLastRewardEventPercent();
        let inflationKsm = totalIssuance * inflation;
        let inflationKsmToValidators = lastRewardPercent ? lastRewardPercent * inflationKsm : inflationKsm;
        let rewardPerValPerDay = Math.round(inflationKsmToValidators / (365 * validatorsCount));

        await DB.saveTokenDistribution({
            height: bestNum.toNumber(),
            currentEra: sessionInfo.currentEra,
            currentIndex: sessionInfo.currentIndex,
            totalIssuance: totalIssuance.toString(),
            totalBond: totalBond.toString(),
            validatorsCount: validatorsCount,
            stakingRatio: stakingRatio,
            inflation: inflationForValidators,
            rewardPerValPerDay: rewardPerValPerDay,
        });
    };

    const parseBlockEventsByHeader = async (header) => {
        api.query.system.events.at(header.hash.toString())
            .then(async (events) => {
                let rewardDataList = [];
                let slashDataList = [];

                for (let idx = 0; idx < events.length; idx++) {
                    const {event, phase} = events[idx];
                    if (!(event.section && event.method && event.section.toString() === "staking")) {
                        continue;
                    }
                    const section = event.section.toString();
                    const method = event.method.toString();

                    let data = {
                        index: idx,
                        section: section,
                        method: method,
                        meta: event.meta.documentation.toString(),
                        data: JSON.parse(event.data.toString()),
                        phase: phase.toString(),
                    };
                    if (method === "Reward") {
                        data.validatorsAmount = UTIL.parseBalance(data.data[0]).toString();
                        data.treasuryAmount = data.data.length > 1 ? UTIL.parseBalance(data.data[1]).toString() : '0';
                        rewardDataList.push(data);
                    } else if (method === "Slash") {
                        data.accountAddr = formatAddress(data.data[0]);
                        data.nickname = await getNickName(data.data[0]);
                        data.amount = UTIL.parseBalance(data.data[1]).toString();
                        slashDataList.push(data);
                    }
                }

                if (rewardDataList.length > 0) {
                    await DB.saveRewardEvents(header, rewardDataList);
                }

                if (slashDataList.length > 0) {
                    await DB.saveSlashEvents(header, slashDataList);
                }
            })
            .catch((error) => console.info(`getEventsError at #${header.number}: ${error}`));
    };

    const checkValidatorOverview = async (header) => {
        let data = {};
        const overview = await api.derive.staking.overview();
        overview.currentElected.forEach((validatorId, idx) => {
            data[validatorId] = {
                online: 0,
                height: header.number,
                currentEra: overview.currentEra,
                currentIndex: overview.currentIndex,
                eraPoint: overview.eraPoints.individual[idx] ? overview.eraPoints.individual[idx] : 0,
            };
        });

        const beatsInfo = await api.derive.imOnline.receivedHeartbeats();
        const validatorStaking = await Promise.all(
            overview.currentElected.map(validatorId => api.derive.staking.account(validatorId))
        );

        for (const v of validatorStaking) {
            let row = data[v.accountId];
            if (beatsInfo[v.accountId] && beatsInfo[v.accountId].isOnline) {
                row.online = 1
            }

            row.validatorAddr = formatAddress(v.accountId);
            row.validatorName = await getNickName(v.accountId);
            row.controllerAddr = formatAddress(v.controllerId);
            row.controllerName = await getNickName(v.controllerId);

            row.rewardDestination = v.rewardDestination.toString();
            // row.commission = UTIL.parseBalance(v.validatorPrefs.validatorPayment).toString();
            row.commission = UTIL.parseCommissionRate(v.validatorPrefs.commission);

            row.totalBonded = UTIL.parseBalance(v.stakers.total).toString();
            row.selfBonded = UTIL.parseBalance(v.stakers.own).toString();

            let nominators = v.stakers.others.map(nominator => {
                return {
                    who: formatAddress(nominator.who),
                    value: UTIL.parseBalance(nominator.value.toString()).toString(),
                };
            });
            row.nominators = JSON.stringify(nominators)
        }

        await DB.saveValidators(header, Object.values(data));
    };

    const parseBlockEventsByNum = async (num) => {
        const header = await getHeaderAtIndex(num);
        console.info(`Get Block: #${header.number}, ${header.hash}`);
        await parseBlockEventsByHeader(header);
    };

    const lastProcessed = await DB.getLastBlockProcessed();
    let start = lastProcessed && lastProcessed > 0 ? lastProcessed - 1 : 0; 
    let bestNumber = await getBestNumber();
    let blocksCache = [];
    while (start <= bestNumber) {
        bestNumber = await getBestNumber();
        const header = await getHeaderAtIndex(start);
        header.authorAddr = formatAddress(header.author);
        console.info(`Get header: #${header.number}, ${header.hash}`);
        await parseBlockEventsByHeader(header);
        await DB.saveAuthor(header);
        blocksCache.push(header);
        if (blocksCache.length >= 100 || start === bestNumber) {
            await DB.saveBlocks(blocksCache);
            blocksCache = [];
        }
        start += 1;
    }

    api.derive.chain.subscribeNewHeads(async (header) => {
        header.authorAddr = formatAddress(header.author);
        console.info(`Listen header: #${header.number}, ${header.hash}`);
        await parseBlockEventsByHeader(header);
        await DB.saveBlocks([header]);
        await DB.saveAuthor(header);
        if (header.number % process.env.CHECK_TOKEN_BLOCK_INTERVAL === 0) {
            await checkTokenInfo();
        }
        if (header.number % process.env.CHECK_VALIDATORS_BLOCK_INTERVAL === 0) {
            await checkValidatorOverview(header);
        }
    });
}

main().catch(error => {
    console.error(error);
    process.exit(-1);
});

