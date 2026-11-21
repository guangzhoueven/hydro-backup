/**
 * 导出 hydro 数据库全部集合为 EJSON 文件（可精确还原 ObjectId/Date 等 BSON 类型）。
 * 用法: node export-db.js [输出目录] （默认 D:\hydro-backup\backup\hydro-ejson）
 * 恢复: deploy 里的 restore-db.js
 */
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || 'D:\\hydro-backup\\backup\\hydro-ejson';

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const c = await MongoClient.connect('mongodb://127.0.0.1:27017/hydro');
    const db = c.db('hydro');
    const cols = await db.listCollections().toArray();
    const manifest = [];
    for (const col of cols) {
        const docs = await db.collection(col.name).find({}).toArray();
        const file = path.join(outDir, col.name + '.json');
        fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }));
        manifest.push({ collection: col.name, count: docs.length });
        console.log(`${col.name}: ${docs.length} 条`);
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`共 ${cols.length} 个集合 -> ${outDir}`);
    await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
