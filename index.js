require("dotenv").config();
require("console-stamp")(console, { pattern: "yyyy-mm-dd HH:MM:ss.l" });
const { ApiPromise, WsProvider } = require("@polkadot/api");
const { encodeAddress } = require("@polkadot/util-crypto");
const { formatBalance } = require("@polkadot/util");
const BN = require("bn.js");
const DB = require("./database.js");
const UTIL = require("./util.js");

async function main() {
  const wsEndpoint = `ws://${process.env.SUBSTRATE_WS_HOST}:${process.env.SUBSTRATE_WS_PORT}`;
  console.log("===========" + wsEndpoint);
  const provider = new WsProvider(wsEndpoint);
  const api = await ApiPromise.create({ provider });
  provider.on("disconnected", () => {
    console.error(`Substrate websocket has been disconnected from the endpoint ${wsEndpoint}`);
    process.exit(-1);
  });

  let chainInfo = {};
  [chainInfo.chain, chainInfo.nodeName, chainInfo.nodeVersion, chainInfo.properties] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version(),
    api.rpc.system.properties(),
  ]);

  console.info(`Connected to chain: ${chainInfo.chain}, using: ${chainInfo.nodeName} v${chainInfo.nodeVersion}`);
  console.info(`Node specific properties: ${JSON.stringify(chainInfo.properties)}`);
  formatBalance.setDefaults({
    decimals: chainInfo.properties.tokenDecimals,
    unit: chainInfo.properties.tokenSymbol,
  });

  const formatAddress = (address) => (address ? encodeAddress(address, chainInfo.properties.ss58Format) : "");

  const getNickName = async (accountId) => {
    const accountInfo = await api.derive.accounts.info(accountId);
    return accountInfo.identity;
  };
  const getHeaderAtIndex = async (index) => {
    const blockHash = await api.rpc.chain.getBlockHash(index);
    return api.derive.chain.getHeader(blockHash.toHex());
  };

  const getBestNumber = async () => {
    const bestNum = await api.derive.chain.bestNumber();
    return bestNum.toNumber();
  };

  const checkStashes = async (header) => {
    console.log("----checkStashes start");
    const stashes = await api.derive.staking.stashes();
    const allStashes = await Promise.all(stashes.map((authorityId) => api.derive.accounts.info(authorityId)));
    let currentEra = await api.query.staking.activeEra();
    let eranum = Number(currentEra.value.index);
    let stashList = [];
    for (const validator of allStashes) {
      let stash = {};
      let identity = validator.identity;
      if (identity.other) {
        identity.other = "";
      }
      stash.validatorName = JSON.stringify(identity);
      stash.currentEra = eranum;
      stash.height = header.number;
      stash.validatorAddr = validator.accountId;
      stashList.push(stash);
      if (stashList.length > 50) {
        await DB.saveStashes(header, stashList);
        stashList = [];
      }
    }
    if (stashList.length > 0) {
      await DB.saveStashes(header, stashList);
    }
    console.log("----checkStashes end");
  };

  const checkTokenInfo = async () => {
    console.log("----checkTokenInfo start");
    const [bestNum, sessionInfo, electedValidators, allStakingValidators, totalIss] = await Promise.all([
      api.derive.chain.bestNumber(),
      api.derive.session.info(),
      api.query.session.validators(),
      api.derive.staking.stashes(),
      api.query.balances.totalIssuance(),
    ]);
    const totalIssuance = UTIL.parseBalance(totalIss);
    const validatorsCount = electedValidators.length;
    const allValidatorStakingInfo = await Promise.all(
      allStakingValidators.map((authorityId) => api.derive.staking.account(authorityId))
    );
    let totalBond = new BN(0);
    allValidatorStakingInfo.forEach((validator) => {
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
      inflationForValidators = 0.025 + (0.1 - 0.025) * 2 ** ((0.5 - stakingRatio) / 0.05);
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
    console.log("----checkTokenInfo end");
  };

  const checkValidatorOverview = async (header) => {
    console.log("----checkValidatorOverview start");
    let data = {};
    const overview = await api.derive.staking.overview();
    const currentPoints = await api.derive.staking.currentPoints();
    const individual = currentPoints.individual;
    let arr = new Map();
    individual.forEach((value, key) => {
      arr.set(String(key), value);
    });
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
      overview.validators.map((validatorId) => api.derive.staking.account(validatorId))
    );

    for (const v of validatorStaking) {
      let row = data[v.accountId];
      if (beatsInfo[v.accountId] && beatsInfo[v.accountId].isOnline) {
        row.online = 1;
      }

      row.validatorAddr = formatAddress(v.accountId);
      let identity = await getNickName(v.accountId);
      if (identity.other) {
        identity.other = "";
      }
      row.validatorName = JSON.stringify(identity);
      row.controllerAddr = formatAddress(v.controllerId);
      row.controllerName = await (await getNickName(v.controllerId)).display;

      row.rewardDestination = v.rewardDestination ? v.rewardDestination.toString():'';
      row.commission =v.validatorPrefs ? UTIL.parseCommissionRate(v.validatorPrefs.commission):0 ;
      row.totalBonded =v.exposure ? UTIL.parseBalance(v.exposure.total).toString():0;
      row.selfBonded = v.exposure ? UTIL.parseBalance(v.exposure.own).toString():0;

      let nominators = v.exposure ? v.exposure.others.map((nominator) => {
        return {
          who: formatAddress(nominator.who),
          value: UTIL.parseBalance(nominator.value.toString()).toString(),
        };
      }):[];
      row.nominators = JSON.stringify(nominators);
    }

    await DB.saveValidators(header, Object.values(data));
  };
  //era数据处理
  const checkEraInfo = async () => {
    let currentEra = await api.query.staking.activeEra();
    let eranum = Number(currentEra.value.index);
    let slashEra = await DB.getSlashEra();
    if (eranum - 1 >= (slashEra[0].era || 0)) {
      await dealEraSlash(eranum - 1);
    }

    let era = await DB.getStakerRewardsEra();
    let num = era[0].era || 0;
    if (eranum - 1 >= (slashEra[0].era || 0)) {
      await dealStakerRewardsEra(eranum-1)
    }
    
    let rewardsEra = await DB.getRewardsEra();
    if (eranum - 1 >= (rewardsEra[0].era || 0)) {
      let erasRewards = await api.derive.staking._erasRewards([eranum - 1]);
      if (erasRewards.length > 0) {
        await DB.saveRewardEra(erasRewards);
      }
    }

    let pointEra = await DB.getPointEra();
    if (eranum >= (pointEra[0].era || 0)) {
      await dealPointEra(eranum - 1);
      await dealPointEra(eranum);
    }
  };
  const dealHisSlash = async function (currentEra) {
    let era = await DB.getSlashEra();
    console.info("era:" + JSON.stringify(era));
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
    let nominators = eraSlashes.nominators;
    let num = 1;
    for (let key in nominators) {
      let slash = {};
      let nickName = await (await getNickName(key)).display;
      slash.accountAddr = key;
      slash.amount = nominators[key];
      slash.slashType = 0;
      slash.index = num;
      slash.nickName = nickName;
      slash.currentEra = currentEra;
      num++;
      slashList.push(slash);
      if (slashList.length > 50) {
        await DB.saveSlashEra(slashList);
        slashList = [];
      }
    }
    let validators = eraSlashes.validators;
    num = 1;
    for (let key in validators) {
      let slash = {};
      let nickName = await (await getNickName(key)).display;
      slash.accountAddr = key;
      slash.amount = validators[key];
      slash.slashType = 1;
      slash.index = num;
      slash.nickName = nickName;
      slash.currentEra = currentEra;
      num++;
      slashList.push(slash);
      if (slashList.length > 50) {
        await DB.saveSlashEra(slashList);
        slashList = [];
      }
    }
    await DB.saveSlashEra(slashList);
  };
  //处理rewards历史数据
  const dealHisReward = async function (currentEra) {
    let era = await DB.getRewardsEra();
    console.info("era:" + JSON.stringify(era));
    let num = era[0].era || 0;
    if (num === currentEra) {
      return;
    }
    let a = num + 1;
    let erasRewards = await api.derive.staking.erasRewards(a);
    if (erasRewards.length > 0) {
      await DB.saveRewardEra(erasRewards);
    }
  };
  //处理Point历史数据
  const dealHisPoint = async function (currentEra) {
    let era = await DB.getPointEra();
    console.info("era:" + JSON.stringify(era));
    let num = era[0].era || 0;
    if (num === currentEra) {
      return;
    }
    for (num; num < currentEra; num++) {
      let a = num + 1;
      await dealPointEra(a);
    }
  };
  const dealPointEra = async function (currentEra) {
    let pointList = [];
    let erasRewardPoints = await api.query.staking.erasRewardPoints(currentEra);
    if (!erasRewardPoints.individual.isEmpty) {
      await erasRewardPoints.individual.forEach((value, key) => {
        let point = {
          point: value,
          totalPoint: erasRewardPoints.total,
          accountAddr: key,
          currentEra,
        };
        pointList.push(point);
        if (pointList > 100) {
          DB.savePointEra(pointList);
          pointList = [];
        }
      });
      await DB.savePointEra(pointList);
    }
  };
  const dealHisStakerRewardsErat = async function (currentEra) {
    let era = await DB.getStakerRewardsEra();
    console.info("dealHisStakerRewardsErat===era:" + JSON.stringify(era));
    let num = era[0].era || 0;
    console.info("=====dealHisStakerRewardsErat============currentEra" + currentEra);
    if ((num+1)>= currentEra) {
      return;
    }
    const erasHistoric= await api.derive.staking.erasHistoric(true);
    console.info("=====erasHistoric=====" + JSON.stringify(erasHistoric));
    for(let idx of erasHistoric){
      await dealStakerRewardsEra(idx);
    } 
  };
  
  const dealStakerRewardsEra = async function (currentEra) {
    const { eraPoints, validators: allValPoints } =  await (await api.derive.staking._erasPoints([currentEra])).pop() || { eraPoints: 0, validators: {} };
    const { validators: allValPrefs } =await  (await api.derive.staking._erasPrefs([currentEra])).pop() || { validators: {}  };
    let { eraReward } = await (await api.derive.staking._erasRewards([currentEra])).pop()|| { eraReward: api.registry.createType('Balance') };;
    const {  nominators: allNominators, validators: allValidators } =  await api.derive.staking.eraExposure([currentEra]);
    if(eraReward===0||allValPrefs.length===0||allValPoints.length===0){
      return;
    }
    await DB.saveStakerRewardsEra([{
      currentEra,
      exposureValidators:JSON.stringify(allValidators),
      exposureNominating:JSON.stringify(allNominators),
      eraPoints,
      allValPoints:JSON.stringify(allValPoints),
      erasPrefs:JSON.stringify(allValPrefs),
      eraReward
    }]);
  };

  let currentEra = await api.query.staking.activeEra();
  let eranum = Number(currentEra.value.index);
  await Promise.all([
     dealHisReward(eranum),
     dealHisSlash(eranum), 
     dealHisPoint(eranum),
     dealHisStakerRewardsErat(eranum)
    ]).catch((error) =>
    console.error("dealHis=>error:", error)
  );

  const lastProcessed = await DB.getLastBlockProcessed();
  let start = lastProcessed && lastProcessed > 0 ? lastProcessed - 1 : 0; // 上一个区块的数据可能没有处理完
  let bestNumber = await getBestNumber();
  let blocksCache = [];
  while (start <= bestNumber) {
    bestNumber = await getBestNumber();
    const header = await getHeaderAtIndex(start).catch((error) => console.error("=====getHeaderAtIndex=>error:", error));
    if(header){
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
    }
    start += 1;
  }

  api.derive.chain.subscribeNewHeads(async (header) => {
    header.authorAddr = formatAddress(header.author);
    console.info(`subscribeNewHeads start Listen header: #${header.number}, ${header.hash}`);
    let currentIndex = await api.query.session.currentIndex.at(header.hash);
    header.currentSession = currentIndex.toNumber();
    await Promise.all([DB.saveBlocks([header]), DB.saveAuthor(header)]).catch((error) =>
      console.error("subscribeNewHeads=>error:", error)
    );

    if (header.number % process.env.CHECK_ERA_INTERVAL === 0) {
      await checkEraInfo().catch((error) => console.error("=====checkEraInfo=>error:", error));
    }
    if (header.number % process.env.CHECK_TOKEN_BLOCK_INTERVAL === 0) {
      await checkTokenInfo().catch((error) => console.error("=====checkTokenInfo=>error:", error));
    }
    if (header.number % process.env.CHECK_VALIDATORS_BLOCK_INTERVAL === 0) {
      await checkValidatorOverview(header).catch((error) =>
        console.error("=====checkValidatorOverview=>error:", error)
      );
    }
    if (header.number % process.env.CHECK_ERA_STASHES === 0) {
      await checkStashes(header).catch((error) => console.error("=====checkStashes=>error:", error));
    }
    console.info("--subscribeNewHeads--end:");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(-1);
});
