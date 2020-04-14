DROP TABLE IF EXISTS `hq_polkacube`.`ksm_rewards_era`;
CREATE TABLE `hq_polkacube`.`ksm_rewards_era` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `amount` varchar(100) NOT NULL COMMENT '系统奖励给validator的金额',
  `currentEra` int(12) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_era_rewards` (`currentEra`,`amount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证人奖励记录表';

DROP TABLE IF EXISTS `hq_polkacube`.`ksm_slash_era`;
CREATE TABLE `hq_polkacube`.`ksm_slash_era` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `amount` varchar(100) NOT NULL COMMENT '系统slash验证人的金额',
  `nickname` varchar(1000) DEFAULT NULL,
  `index` int(11) NOT NULL COMMENT 'slash的validator地址在区块内的编号',
  `slashType` int(11) NOT NULL COMMENT 'slash类型 0:nominators 1:validators',
  `accountAddr` varchar(100) NOT NULL DEFAULT '' COMMENT '被slash的validator地址',
  `currentEra` int(12) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_era_slash` (`currentEra`,`index`,`slashType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证人slash记录表';

DROP TABLE IF EXISTS `hq_polkacube`.`ksm_point_era`;
CREATE TABLE `hq_polkacube`.`ksm_point_era` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `point` int(10) NOT NULL COMMENT '最终区块确认数',
  `totalPoint` int(10) NOT NULL COMMENT 'era最终区块确认总数',
  `accountAddr` varchar(100) NOT NULL DEFAULT '' COMMENT '验证节点地址',
  `currentEra` int(12) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_era_point` (`currentEra`,`accountAddr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='验证人最终确认数记录表';

