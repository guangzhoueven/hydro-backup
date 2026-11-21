/**
 * 修正 hydrojudge 的 env 配置：
 * go-judge 在 Windows 用 CreateRestrictedToken 跑子进程，子进程只能写自己的工作目录，
 * 任何指向外部目录的 TEMP/TMP/TMPDIR 都会让 GCC 报 "Cannot create temporary file ... Permission denied"。
 * 因此沙箱 env 只保留 PATH/SystemRoot/windir，让 GCC 退回 cwd 创建临时文件。
 */
const { MongoClient } = require('mongodb');

const MONGO_URL = 'mongodb://127.0.0.1:27017/hydro';

const CONFIG = `hydrojudge:
  cache_dir: D:/hydro/cache/judge
  tmp_dir: D:/hydro/tmp/judge
  sandbox_host: http://127.0.0.1:5050
  parallelism: 2
  detail: full
  env: |-
    PATH=C:\\Tool\\App\\RedPanda-Cpp\\mingw64\\bin;C:\\Windows\\System32;C:\\Windows
    SystemRoot=C:\\Windows
    windir=C:\\Windows
`;

async function main() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db('hydro');
  const coll = db.collection('system');
  await coll.updateOne({ _id: 'config' }, { $set: { value: CONFIG } }, { upsert: true });
  const doc = await coll.findOne({ _id: 'config' });
  console.log('config 已更新为：\n' + doc.value);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
