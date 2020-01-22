require("dotenv").config();
require('console-stamp')(console, {pattern: 'yyyy-mm-dd HH:MM:ss.l'});
const {ApiPromise, WsProvider} = require("@polkadot/api");
const {Keyring} = require('@polkadot/api');
const keyring = new Keyring({type: 'sr25519'});
const sleep = require('await-sleep');

const PHRASE = 'tobacco eyebrow stumble payment voyage joke milk upset object genre conduct crush';
const DotStep = 3;

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

    const myAcc = keyring.addFromUri(PHRASE);
    console.log(myAcc.address);

    const sendRemark = async (x, y) => {
        console.log(`sendRemark for (${x}, ${y})`);
        const color = `0x1337${x}${y}FFFFFF`;
        const unsub = await api.tx.system
            .remark(color)
            .signAndSend(myAcc, (result) => {
                if (result.status.isFinalized) {
                    console.log(`Transaction included at blockHash ${result.status.asFinalized}`);
                    unsub();
                }
            });
    };

    let moveLineDot = [
        [616.572, 652.216],
        [624.84, 652.216],
        [624.84, 685.288],
        [642.312, 668.674],
        [652.998, 668.674],
        [635.136, 685.288],
        [654.558, 709],
        [643.95, 709],
        [629.442, 690.592],
        [624.84, 694.882],
        [624.84, 709],
        [616.572, 709],
        [616.572, 652.216],
    ];
    let dots = [];

    for (let idx = 0; idx < moveLineDot.length - 1; idx++) {
        let x0 = Math.round(moveLineDot[idx][0]);
        let y0 = Math.round(moveLineDot[idx][1]);
        let x1 = Math.round(moveLineDot[idx + 1][0]);
        let y1 = Math.round(moveLineDot[idx + 1][1]);

        if (x0 === x1) {
            for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += DotStep) {
                console.log(`[${x0},${y},],`);
                dots.push([x0, y]);
            }
        } else {
            let k = (y0 - y1) / (x0 - x1);
            for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += DotStep) {
                let y = Math.round(k * (x - x1) + y1);
                console.log(`[${x},${y},],`);
                dots.push([x, y]);
            }
        }
    }

    for (const dot of dots) {
        await sendRemark(dot[0], dot[1]);
        await sleep(10000);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(-1);
});

