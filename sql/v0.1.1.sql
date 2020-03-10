ALTER TABLE `hq_polkacube`.`ksm_validator`
MODIFY COLUMN `validatorName`  varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT '' AFTER `validatorAddr`;

