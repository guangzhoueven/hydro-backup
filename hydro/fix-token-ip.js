/** 给手工创建的 session token 补 createIp/updateIp 字段（geoip 插件需要） */
const { MongoClient } = require('mongodb');

(async () => {
    const c = await MongoClient.connect('mongodb://127.0.0.1:27017/hydro');
    const r = await c.db('hydro').collection('token').updateMany(
        { tokenType: 0, createIp: { $exists: false } },
        { $set: { createIp: '127.0.0.1', updateIp: '127.0.0.1' } },
    );
    console.log('已补全 IP 字段的 session 数:', r.modifiedCount);
    await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
