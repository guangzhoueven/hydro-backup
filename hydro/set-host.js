/** 设置 Hydro 监听地址：node set-host.js <host>  （0.0.0.0 = 监听所有网卡，localhost+局域网IP 都可访问） */
const { MongoClient } = require('mongodb');
const host = process.argv[2] || '0.0.0.0';

(async () => {
    const c = await MongoClient.connect('mongodb://127.0.0.1:27017/hydro');
    const r = await c.db('hydro').collection('system').updateOne(
        { _id: 'server.host' },
        { $set: { value: host } },
        { upsert: true },
    );
    console.log(`server.host -> ${host} (modified=${r.modifiedCount}, upserted=${r.upsertedCount})`);
    await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
