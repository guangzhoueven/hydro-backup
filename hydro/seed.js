/**
 * Hydro 初始化种子脚本（幂等，可重复执行）
 * 写入 MongoDB system 集合：
 *   - hydrooj.langs : 仅 C++ 的语言配置（编译器为 RedPanda C++ / MinGW-W64 g++）
 *   - server.url    : 站点 BaseURL
 *   - config        : 插件配置（hydrojudge 评测机参数）
 */
const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://127.0.0.1:27017/hydro';

// 语言配置单一数据源在 langs.txt：
//  - seed.js（本文件，首次初始化 $setOnInsert）与 fix-langs.js（$set 覆盖写）都读取它。
//  - 修改语言后运行 node fix-langs.js 并重启 Hydro。
const LANGS = require('fs').readFileSync(require('path').join(__dirname, 'langs.txt'), 'utf8');

const CONFIG = `hydrojudge:
  cache_dir: D:/hydro/cache/judge
  tmp_dir: D:/hydro/tmp/judge
  sandbox_host: http://127.0.0.1:5050
  parallelism: 2
  detail: full
  # 注意：必须用 |- （剥离结尾换行）。若用 | ，结尾换行会被 split('\n') 拆成一个空字符串，
  # 混进沙箱 env 后会破坏子进程环境块，导致 GCC 报 "Cannot create temporary file ... Permission denied"。
  env: |-
    PATH=C:\\Tool\\App\\RedPanda-Cpp\\mingw64\\bin;C:\\Windows\\System32;C:\\Windows
    TEMP=D:\\hydro\\tmp
    TMP=D:\\hydro\\tmp
    TMPDIR=D:\\hydro\\tmp
`;

async function main() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db('hydro');
  const coll = db.collection('system');
  const ops = [
    { _id: 'hydrooj.langs', value: LANGS },
    { _id: 'server.url', value: 'http://127.0.0.1:8888/' },
    { _id: 'config', value: CONFIG },
  ];
  for (const op of ops) {
    // 只在不存在时写入，避免覆盖用户后续修改
    const r = await coll.updateOne({ _id: op._id }, { $setOnInsert: { value: op.value } }, { upsert: true });
    console.log(`${op._id}: ${r.upsertedCount ? 'inserted' : 'kept existing'}`);
  }
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
