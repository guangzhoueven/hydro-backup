/**
 * 更新 hydrooj.langs（$set 覆盖写）+ 监视回写。
 * 用法：node fix-langs.js [监视秒数，默认0]
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URL = 'mongodb://127.0.0.1:27017/hydro';
const LANGS = fs.readFileSync(path.join(__dirname, 'langs.txt'), 'utf8');
const watchSeconds = Number(process.argv[2] || 0);

async function main() {
    const client = await MongoClient.connect(MONGO_URL);
    const coll = client.db('hydro').collection('system');
    await coll.updateOne({ _id: 'hydrooj.langs' }, { $set: { value: LANGS } }, { upsert: true });
    const doc = await coll.findOne({ _id: 'hydrooj.langs' });
    console.log(`[${new Date().toISOString()}] 已写入，含 code_file: ${doc.value.includes('code_file')}`);
    if (!watchSeconds) { await client.close(); return; }
    let last = doc.value;
    const deadline = Date.now() + watchSeconds * 1000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const d = await coll.findOne({ _id: 'hydrooj.langs' });
        if (d.value !== last) {
            console.log(`[${new Date().toISOString()}] !!! 值被改写: code_file=${d.value.includes('code_file')} CRLF=${d.value.includes('\r\n')} 长度=${d.value.length}`);
            console.log('--- 新值前 200 字符 ---');
            console.log(JSON.stringify(d.value.slice(0, 200)));
            last = d.value;
        }
    }
    console.log(`[${new Date().toISOString()}] 监视结束，当前含 code_file: ${last.includes('code_file')}`);
    await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
