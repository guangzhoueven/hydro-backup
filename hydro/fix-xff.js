/**
 * 设置 server.xff：让 Hydro 从指定请求头读取访客 IP。
 * 设为 CF-Connecting-IP 后，经 cloudflared 隧道访问的请求
 * （session 记录、/home/security、内部日志）都会使用真实公网 IP。
 * 本机直连（无该头）自动回退到套接字 IP。
 */
const { MongoClient } = require('mongodb');

(async () => {
    const c = await MongoClient.connect('mongodb://127.0.0.1:27017/hydro');
    await c.db('hydro').collection('system').updateOne(
        { _id: 'server.xff' },
        { $set: { value: 'CF-Connecting-IP' } },
        { upsert: true },
    );
    console.log('server.xff -> CF-Connecting-IP 已写入');
    await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
