# hydro-backup — Hydro OJ 完整站点备份

这是运行于 `D:\hydro` 的 Hydro OJ 5.1.0 站点的**完整可迁移备份**，包含：

- **18482 道题目**（4 个域：system / srqc / ybtbas / luogu）与全部评测记录
- **全部插件**（含 4 个自研插件：IP 黑名单、访问日志+设备封禁、徽章、洛谷开放平台客户端）
- **全部数据**：用户、文件存储（18486 个文件）、GeoIP 数据库、站点配置
- 部署与自检脚本，目标机器只需 git + Node.js

## 快速开始（新机器）

```powershell
git clone https://github.com/guangzhoueven/hydro-backup D:\hydro
cd D:\hydro
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\check.ps1
```

详细步骤、编译器适配、已知坑见 **[DEPLOY.md](DEPLOY.md)**（写给部署机 AI 的执行手册）。

## 仓库内容

| 路径 | 说明 |
| --- | --- |
| `hydro/` | 站点文件（clone 到 D:\hydro 后即为其工作目录） |
| `hydro/backup/hydro-ejson/` | 全库数据（29 个集合，EJSON 格式，`deploy/restore-db.js` 负责恢复） |
| `hydro/backup-assets/GeoLite2-City.mmdb` | GeoIP 数据库（部署脚本自动就位） |
| `hydro/go-judge/go-judge.exe` | go-judge 沙箱 v1.14.1 |
| `filestorage/` | 文件存储内容（部署后位于 `D:\data\file\hydro`） |
| `deploy.ps1` / `check.ps1` / `deploy/restore-db.js` | 自动部署 / 自检 / 数据恢复 |
| `DEPLOY.md` | 给部署机 AI 的完整执行手册 |

## 访问入口

- 本机：http://127.0.0.1:8888/
- 对外：https://oj.gzeven.cc.cd （cloudflared 隧道，访客真实 IP 已接入 GeoIP 与封禁体系）

管理员：uid=2（admin），密码与原站一致。
