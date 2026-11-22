/**
 * 恢复数据库：读取 backup/hydro-ejson/*.json（EJSON 格式），重建 hydro 库全部集合。
 * 用法: node restore-db.js
 */
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'backup', 'hydro-ejson');

(async () => {
    if (!fs.existsSync(dir)) throw new Error(`找不到数据目录: ${dir}`);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
    const c = await MongoClient.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/hydro');
    const db = c.db('hydro');
    for (const f of files) {
        const name = f.replace(/\.json$/, '');
        const docs = EJSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { relaxed: false });
        if (!docs.length) { console.log(`${name}: 0 条，跳过`); continue; }
        const col = db.collection(name);
        try { await col.drop(); } catch (e) { /* 集合不存在时忽略 */ }
        for (let i = 0; i < docs.length; i += 500) {
            await col.insertMany(docs.slice(i, i + 500), { ordered: false });
        }
        console.log(`${name}: ${docs.length} 条已恢复`);
    }
    console.log('数据库恢复完成');
    await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
