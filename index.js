require("dotenv").config();
require('console-stamp')(console, { pattern: 'yyyy-mm-dd HH:MM:ss.l' });
const { ApiPromise, WsProvider } = require("@polkadot/api");
const { encodeAddress } = require('@polkadot/util-crypto');
const { formatBalance } = require('@polkadot/util');
const BN = require("bn.js");
const DB = require("./database.js");
const UTIL = require("./util.js");


async function main() {
    const wsEndpoint = `ws://${process.env.SUBSTRATE_WS_HOST}:${process.env.SUBSTRATE_WS_PORT}`;
    console.log("===========" + wsEndpoint)
    const provider = new WsProvider(wsEndpoint);
    const api = await ApiPromise.create({ provider });
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

    const getNickName = async (accountId) => {
        const accountInfo = await api.derive.accounts.info(accountId);
        // console.info(`==============accountInfo: ${JSON.stringify(accountInfo)}`);
        return accountInfo.identity;
    };
    const getHeaderAtIndex = async (index) => {
        const blockHash = await api.rpc.chain.getBlockHash(index);
        return api.derive.chain.getHeader(blockHash);
    };

    const getBestNumber = async () => {
        const bestNum = await api.derive.chain.bestNumber();
        return bestNum.toNumber();
    };

    const checkTokenInfo = async () => {
        console.log('----checkTokenInfo start');
        const [bestNum, sessionInfo, electedValidators, allStakingValidators, totalIss] = await Promise.all([
            api.derive.chain.bestNumber(),
            api.derive.session.info(),
            api.query.session.validators(),
            api.derive.staking.stashes(),
            api.query.balances.totalIssuance()
        ]);
        const totalIssuance = UTIL.parseBalance(totalIss);
        const validatorsCount = electedValidators.length;
        const allValidatorStakingInfo = await Promise.all(
            allStakingValidators.map(authorityId => api.derive.staking.account(authorityId))
        );
        // console.log('----allValidatorStakingInfo:' + JSON.stringify(allValidatorStakingInfo[1]));
        let totalBond = new BN(0);
        allValidatorStakingInfo.forEach(validator => {
            totalBond = totalBond.add(UTIL.parseBalance(validator.exposure.total));
        });

        let stakingRatio = totalBond / totalIssuance;
        /*
        todo 现在是固定inflation是0.1，按照一定的算法分配给验证人和国库
             先暂时根据上一次staking.Reward event 的分配比例来计算节点的日预计收益
             等网络稳定之后再根据inflation来计算
         */
        let inflation = 0.1;
        let inflationForValidators;
        if (stakingRatio <= 0.5) {
            inflationForValidators = 0.025 + stakingRatio * (0.2 - 0.025 / 0.5);
        } else {
            inflationForValidators = 0.025 + (0.1 - 0.025) * (2 ** ((0.5 - stakingRatio) / 0.05));
        }
        let lastRewardPercent = await DB.getLastRewardEventPercent();
        let inflationKsm = totalIssuance * inflation;
        let inflationKsmToValidators = lastRewardPercent ? lastRewardPercent.percent * inflationKsm : inflationKsm;
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
        console.log('----checkTokenInfo end');
    };

    const checkValidatorOverview = async (header) => {
        console.log('----checkValidatorOverview start');
        let data = {};
        const overview = await api.derive.staking.overview();
        const individual = overview.eraPoints.individual;
        let arr = new Map();
        individual.forEach((value, key) => {
            arr.set(String(key), value);
        })
        // console.log('----length:' +overview.validators.length+'------------'+ individual.size);
        overview.validators.forEach((validatorId, idx) => {
            data[validatorId] = {
                online: 0,
                height: header.number,
                currentEra: overview.currentEra,
                currentIndex: overview.currentIndex,
                eraPoint: arr.get(String(validatorId)) || 0,
            };
        });

        const beatsInfo = await api.derive.imOnline.receivedHeartbeats();
        const validatorStaking = await Promise.all(
            overview.validators.map(validatorId => api.derive.staking.account(validatorId))
        );

        for (const v of validatorStaking) {
            let row = data[v.accountId];
            if (beatsInfo[v.accountId] && beatsInfo[v.accountId].isOnline) {
                row.online = 1
            }

            row.validatorAddr = formatAddress(v.accountId);
            let identity = await getNickName(v.accountId);
            if (identity.other) {
                identity.other = '';
            }
            row.validatorName = JSON.stringify(identity);
            row.controllerAddr = formatAddress(v.controllerId);
            row.controllerName = await (await getNickName(v.controllerId)).display;

            row.rewardDestination = v.rewardDestination.toString();
            // console.info('==============v:' + JSON.stringify(v));
            row.commission = UTIL.parseCommissionRate(v.validatorPrefs.commission);
            row.totalBonded = UTIL.parseBalance(v.exposure.total).toString();
            row.selfBonded = UTIL.parseBalance(v.exposure.own).toString();

            let nominators = v.exposure.others.map(nominator => {
                return {
                    who: formatAddress(nominator.who),
                    value: UTIL.parseBalance(nominator.value.toString()).toString(),
                };
            });
            row.nominators = JSON.stringify(nominators)
        }

        await DB.saveValidators(header, Object.values(data));
        // console.log('--saveValidators:' + JSON.stringify(data));
    };
    //era数据处理
    const checkEraInfo = async () => {
        let currentEra = await api.query.staking.activeEra();
        let eranum = Number(currentEra.raw.get('index'));
        let slashEra = await DB.getSlashEra();
        if (eranum - 1 >= (slashEra[0].era || 0)) {
            console.log('-----checkSlashStart:' + (eranum-1));
            await dealEraSlash(eranum - 1);
        }

        let rewardsEra = await DB.getRewardsEra();
        if (eranum - 1 >= (rewardsEra[0].era || 0)) {
            let erasRewards = await api.derive.staking.erasRewards(eranum - 1);
            console.info('=======checkSlashStart=======erasRewards:' + JSON.stringify(erasRewards));
            if (erasRewards.length > 0) {
                await DB.saveRewardEra(erasRewards);
            }
        }

        let pointEra = await DB.getPointEra();
        if (eranum >= (pointEra[0].era || 0)) {
            console.log('-----checkPointStart:' + (eranum-1));
            await dealPointEra(eranum);
        }
    }
    //处理slash历史数据
    const dealHisSlash = async function (currentEra) {
        let era = await DB.getSlashEra();
        console.info('era:' + JSON.stringify(era));
        let num = era[0].era || 0;
        if (num === currentEra) {
            return;
        }
        for (num; num < currentEra; num++) {
            let a = num + 1;
            await dealEraSlash(a);
        }
    };
    const dealEraSlash = async function (currentEra) {
        let slashList = [];
        let eraSlashes = await api.derive.staking.eraSlashes(currentEra);
        console.info('currentEra:' + currentEra + '==============eraSlashes:' + JSON.stringify(eraSlashes));
        if (eraSlashes.nominators.length > 0) {
            let num = 1;
            await eraSlashes.nominators.forEach((value, key) => {
                let slash = {};
                let nickName = getNickName(key);
                slash.accountAddr = key;
                slash.amount = value;
                slash.slashType = 0;
                slash.index = num;
                slash.nickName = nickName;
                slash.currentEra = currentEra;
                num++;
                slashList.push(slash);
                if (slashList.length > 50) {
                    DB.saveSlashEra(slashList);
                    slashList = [];
                }
            });
        }
        if (eraSlashes.validators.length > 0) {
            let num = 1;
            await eraSlashes.validators.forEach((value, key) => {
                let slash = {};
                let nickName = getNickName(key);
                slash.accountAddr = key;
                slash.amount = value;
                slash.index = num;
                slash.slashType = 1;
                slash.nickName = nickName;
                slash.currentEra = currentEra;
                num++;
                slashList.push(slash);
                if (slashList.length > 50) {
                    DB.saveSlashEra(slashList);
                    slashList = [];
                }
            });
        }
        await DB.saveSlashEra(slashList);
    }

    //处理rewards历史数据
    const dealHisReward = async function (currentEra) {
        let era = await DB.getRewardsEra();
        console.info('era:' + JSON.stringify(era));
        let num = era[0].era || 0;
        if (num === currentEra) {
            return;
        }
        let a = num + 1;
        let erasRewards = await api.derive.staking.erasRewards(a);
        console.info('currentEra:' + a + '==============erasRewards:' + JSON.stringify(erasRewards));
        if (erasRewards.length > 0) {
            await DB.saveRewardEra(erasRewards);
        }

    };
    //处理Point历史数据
    const dealHisPoint = async function (currentEra) {
        let era = await DB.getPointEra();
        console.info('era:' + JSON.stringify(era));
        let num = era[0].era || 0;
        console.info("=================currentEra" + currentEra)
        if (num === currentEra.index) {
            return;
        }
        for (num; num < currentEra; num++) {
            let a = num + 1;
            await dealPointEra(a);
        };

    }
    const dealPointEra = async function (currentEra) {
        let pointList = [];
        let erasRewardPoints = await api.query.staking.erasRewardPoints(currentEra);
        console.info('currentEra:' + currentEra + '==============total:' + erasRewardPoints.total);
        // console.info(a+'==============erasRewardPoints:' + JSON.stringify(erasRewardPoints));
        if (!erasRewardPoints.individual.isEmpty) {
            await erasRewardPoints.individual.forEach((value, key) => {
                let nickName = getNickName(key);
                let point = {
                    point: value,
                    totalPoint: erasRewardPoints.total,
                    accountAddr: key,
                    nickName,
                    currentEra
                }
                pointList.push(point);
                if (pointList > 100) {
                    DB.savePointEra(pointList);
                    pointList = [];
                }
            });
            await DB.savePointEra(pointList);
        }
    }
    const lastProcessed = await DB.getLastBlockProcessed();
    let start = lastProcessed && lastProcessed > 0 ? lastProcessed - 1 : 0; // 上一个区块的数据可能没有处理完
    let bestNumber = await getBestNumber();
    let blocksCache = [];
    while (start <= bestNumber) {
        bestNumber = await getBestNumber();
        const header = await getHeaderAtIndex(start);
        header.authorAddr = formatAddress(header.author);
        console.info(`Get header: #${header.number}, ${header.hash}`);
        let currentIndex = await api.query.session.currentIndex.at(header.hash);
        header.currentSession = currentIndex.toNumber();
        await DB.saveAuthor(header);
        blocksCache.push(header);
        if (blocksCache.length >= 100 || start === bestNumber) {
            await DB.saveBlocks(blocksCache);
            blocksCache = [];
        }
        start += 1;
    }


    let currentEra = await api.query.staking.activeEra();
    let eranum = Number(currentEra.value.index);
    await Promise.all([
        dealHisReward(eranum),
        dealHisSlash(eranum),
        dealHisPoint(eranum)
    ]).catch(error => console.error('dealHis=>error:', error));

    api.derive.chain.subscribeNewHeads(async (header) => {
        header.authorAddr = formatAddress(header.author);
        console.info(`subscribeNewHeads start Listen header: #${header.number}, ${header.hash}`);
        let currentIndex = await api.query.session.currentIndex.at(header.hash);
        header.currentSession = currentIndex.toNumber();
        await Promise.all([
            DB.saveBlocks([header]),
            DB.saveAuthor(header)
        ]).catch(error => console.error('subscribeNewHeads=>error:', error));

        if (header.number % process.env.CHECK_ERA_INTERVAL === 0) {
            await checkEraInfo().catch(error => console.error('=====checkEraInfo=>error:', error));
        }
        if (header.number % process.env.CHECK_TOKEN_BLOCK_INTERVAL === 0) {
            await checkTokenInfo().catch(error => console.error('=====checkTokenInfo=>error:', error));
        }
        if (header.number % process.env.CHECK_VALIDATORS_BLOCK_INTERVAL === 0) {
            await checkValidatorOverview(header).catch(error => console.error('=====checkValidatorOverview=>error:', error));
        }
        console.info('--subscribeNewHeads--end:')
    });
}

main().catch(error => {
    console.error(error);
    process.exit(-1);
});

