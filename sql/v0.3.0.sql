delete from `hq_polkacube`.`ksm_rewards_era` where amount =0;
ALTER TABLE `hq_polkacube`.`ksm_rewards_era` DROP INDEX uniq_era_rewards;
ALTER TABLE `hq_polkacube`.`ksm_rewards_era` ADD UNIQUE KEY `uniq_era` (`currentEra`); 
DROP TABLE IF EXISTS `hq_polkacube`.`ksm_stashes`;
CREATE TABLE `hq_polkacube`.`ksm_stashes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `currentEra` int(64) NOT NULL,
  `height` int(64) DEFAULT NULL,
  `validatorAddr` varchar(100) NOT NULL DEFAULT '',
  `validatorName` varchar(500) DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_currentEra_stashes` (`currentEra`,`validatorAddr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提名人账户信息表';

DROP TABLE IF EXISTS `hq_polkacube`.`ksm_staker_reward_era`;
CREATE TABLE `hq_polkacube`.`ksm_staker_reward_era` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `currentEra` bigint(20) NOT NULL,
  `exposureNominating` MEDIUMTEXT NOT NULL ,
  `exposureValidators` MEDIUMTEXT NOT NULL ,
  `eraPoints` int(10) NOT NULL  COMMENT 'era最终区块确认总数',
  `allValPoints` text NOT NULL  COMMENT 'era所有验证人区块确认数',
  `erasPrefs` text NOT NULL  COMMENT 'era所有验证人佣金率',
  `eraReward` varchar(100) NOT NULL  COMMENT 'era奖励金额',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_currentEra` (`currentEra`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提取收益统计信息表';