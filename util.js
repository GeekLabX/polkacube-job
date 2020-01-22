const {isHex} = require('@polkadot/util');
const BN = require("bn.js");

let util = {};

util.parseBalance = function (amount) {
    if (isHex(amount)) {
        return new BN(amount.substring(2, amount.length), 16);
    } else {
        return new BN(amount.toString());
    }
};

util.parseCommissionRate = function (commission) {
    const PERBILL = new BN(1000000000);
    return (commission.unwrap().muln(10000).div(PERBILL).toNumber() / 10000).toFixed(6);
};

module.exports = util;
