# ************************************************************
# Sequel Pro SQL dump
# Version 4096
#
# http://www.sequelpro.com/
# http://code.google.com/p/sequel-pro/
#
# Host: 127.0.0.1 (MySQL 5.7.23)
# Database: hq_polkacube
# Generation Time: 2019-11-22 02:10:10 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table ksm_author
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_author`;

CREATE TABLE `ksm_author` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `authorAddr` varchar(100) NOT NULL DEFAULT '',
  `lastBlockHeight` int(64) NOT NULL,
  `lastBlockHash` varchar(100) NOT NULL DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_authorAddr` (`authorAddr`),
  KEY `idx_authorAddr` (`authorAddr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Dump of table ksm_block
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_block`;

CREATE TABLE `ksm_block` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `height` int(64) NOT NULL,
  `hash` varchar(100) NOT NULL DEFAULT '',
  `authorAddr` varchar(100) NOT NULL DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_height_hash` (`height`,`hash`),
  KEY `idx_authorAddr` (`authorAddr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Dump of table ksm_evt_reward
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_evt_reward`;

CREATE TABLE `ksm_evt_reward` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `height` int(11) NOT NULL COMMENT '高度',
  `index` int(11) NOT NULL COMMENT 'event在区块内的编号',
  `validatorsAmount` varchar(100) NOT NULL COMMENT '系统奖励给validator的金额',
  `treasuryAmount` varchar(100) NOT NULL COMMENT '系统奖励给treasury的金额',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_height_idx` (`height`,`index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Dump of table ksm_evt_slash
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_evt_slash`;

CREATE TABLE `ksm_evt_slash` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `height` int(11) NOT NULL COMMENT '高度',
  `index` int(11) NOT NULL COMMENT 'event在区块内的编号',
  `accountAddr` varchar(100) NOT NULL DEFAULT '' COMMENT '被slash的validator地址',
  `nickname` varchar(1000) DEFAULT NULL,
  `amount` varchar(100) NOT NULL COMMENT '被slash的金额',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_height_idx` (`height`,`index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Dump of table ksm_token
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_token`;

CREATE TABLE `ksm_token` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `currentSession` int(64) NOT NULL,
  `currentEra` int(64) NOT NULL,
  `height` int(64) NOT NULL,
  `totalIssuance` varchar(100) NOT NULL DEFAULT '' COMMENT '总发行量',
  `totalBond` varchar(100) NOT NULL DEFAULT '' COMMENT '总抵押量',
  `validatorsCount` int(64) NOT NULL COMMENT '验证人数量',
  `stakingRatio` decimal(10,8) NOT NULL COMMENT '抵押率',
  `inflation` decimal(10,8) NOT NULL COMMENT '通胀率',
  `valDayRewards` varchar(100) NOT NULL DEFAULT '' COMMENT '每个验证人每天预计收益',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session` (`currentSession`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



# Dump of table ksm_validator
# ------------------------------------------------------------

DROP TABLE IF EXISTS `ksm_validator`;

CREATE TABLE `ksm_validator` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `currentSession` int(64) NOT NULL,
  `currentEra` int(64) NOT NULL,
  `height` int(64) DEFAULT NULL,
  `validatorAddr` varchar(100) NOT NULL DEFAULT '',
  `validatorName` varchar(100) DEFAULT '',
  `controllerAddr` varchar(100) NOT NULL DEFAULT '',
  `controllerName` varchar(100) DEFAULT '',
  `online` int(64) NOT NULL COMMENT '1-online,0-offline',
  `eraPoint` int(64) NOT NULL,
  `rewardDestination` varchar(100) NOT NULL DEFAULT '',
  `commission` varchar(1000) NOT NULL DEFAULT '' COMMENT '佣金',
  `totalBonded` varchar(1000) NOT NULL DEFAULT '' COMMENT '总抵押',
  `selfBonded` varchar(1000) NOT NULL DEFAULT '' COMMENT '自抵押抵押',
  `nominators` mediumtext NOT NULL COMMENT '提名人详情',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session_validator` (`currentSession`,`validatorAddr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;




/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
