# Hydro OJ 完整迁移部署指南（给部署机的 AI）

本仓库是 [hydro.gzeven.cc.cd / D:\hydro](hydro/README.md) 站点的**完整备份**，目标是把一模一样的 Hydro OJ 部署到新电脑。请**严格按本文档执行**，大部分步骤已由 `deploy.ps1` 自动化。

## 数据概览（部署完成后应当一致）

| 项目 | 数量/内容 |
| --- | --- |
| 题目 | **18482 道**（4 个域：system、srqc 深入浅出、ybtbas 一本通、luogu 洛谷；后三个域为洛谷远程评测题） |
| 用户 | 3 个（uid=1 系统用户、uid=2 admin 超级管理员、uid=0 guest） |
| 文件存储 | 18487 个文件（约 63MB，题目数据/题面/剪贴板） |
| 插件 | hydrojudge、ui-default、fps-importer、import-hoj、onsite-toolkit、scoreboard-xcpcio、onlyoffice、prom-client、migrate、blog、@hydrooj/vjudge(远程评测框架)、hydroac-client(洛谷开放平台)、badge-for-hydrooj(徽章)、access-log(访问日志+设备封禁)、ip-ban(IP黑名单)、hydrooj-training-scoreboard(训练成绩表)、hydrooj-secondary-copy(题库批量复制)、hydrooj-vjudge-qoj(QOJ远程评测适配)、countdown-33oj(首页倒计时)、checkin-33oj(首页签到)、pastebin-33oj(剪贴板)、realname-33oj(实名/用户名前缀)、coin-33oj(金币)、geoip |
| 命令行工具 | `tools\` 下 4 个独立工具（不进 addon.json）：hydrooj-problem-transmission(题目传输)、luogu-problem-export(洛谷题导出)、codeforces-testdata(CF测试数据)、xmoj-crawl(xmoj爬取)；进目录 `npm install` 后 `npx tsc` 即可用 |
| 语言 | 仅 C++（cc 及 cc.cc98/11/14/17/20），编译器为 RedPanda C++ 自带 MinGW-W64 g++ |
| 记录/日志 | 评测记录、访问日志、IP/设备黑名单等全部保留 |

## 前置条件

1. **Windows**，且有 **D: 盘**（存储路径 `D:\data\file\hydro` 与编译器路径都是绝对路径）。
2. 已安装 **Node.js 18+**（含 npm）与 **git**。
3. 已安装 **RedPanda C++**（自带 MinGW-W64 g++），默认期望路径：
   `C:\Tool\App\RedPanda-Cpp\mingw64\bin\g++.exe`
   若没有：到 https://cloud.redpanda-cpp.org/ 下载安装；装到别的路径的适配方法见第 3 步。
4. 网络：npm 走 npmmirror 镜像（脚本已指定）；MongoDB 下载优先官方源、失败自动切 npmmirror。如需代理，脚本用系统代理。

## 第 0 步：克隆仓库

```powershell
git config --global core.protectNTFS false
git clone https://github.com/guangzhoueven/hydro-backup D:\hydro
cd D:\hydro
```

> 第一行**必须先执行**：文件存储里有名为 `aux/` 的目录（Windows 保留设备名），git 默认拒绝检出，关闭该保护后可正常检出（本仓库已验证）。

> 仓库约 300MB（含 18486 题的数据、文件存储、GeoIP 库、go-judge 可执行文件），clone 需要几分钟。

## 第 1 步：一键自动部署

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1
```

脚本自动完成（全程日志写入 `D:\hydro\deploy.log`）：

1. `npm install`（npmmirror 镜像，装 hydrooj 5.1.0 全家桶）
2. 就位 GeoLite2-City.mmdb → `node_modules\@hydrooj\geoip\`
3. 下载并解压 MongoDB 8.0.24 → `mongo\`
4. 启动 mongod（端口 27017，失败会自动装 VC++ 运行库后重试）
5. **恢复全部数据**（`node deploy\restore-db.js`，EJSON → MongoDB）
6. 创建运行目录并运行 `start.ps1` 启动站点

成功标志：最后一行输出 `部署完成！访问 http://127.0.0.1:8888/`。

## 第 2 步：自检

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check.ps1
```

全部 PASS 即部署成功。然后浏览器打开 http://127.0.0.1:8888/ ，用原站账号登录（uid=2 admin，密码同原站）。

## 第 3 步：编译器适配（重要！）

评测编译命令写的是绝对路径 `C:/Tool/App/RedPanda-Cpp/mingw64/bin/g++.exe`。

- 新机器如果 RedPanda C++ 安装路径**相同** → 无需任何操作。
- 不同路径 → 编辑 `langs.txt`，把里面所有 `C:/Tool/App/RedPanda-Cpp/mingw64/bin/g++.exe` 替换为新机器的 g++ 路径（**正斜杠**），然后：

```powershell
node fix-langs.js     # 写入数据库
.\stop.ps1 ; .\start.ps1   # 重启生效
```

验证：提交一次 A+B Problem（system 域 P1000）应当 Accepted。

## 第 4 步（可选）：cloudflared 内网穿透

原站通过 cloudflared 隧道对外提供 `https://oj.gzeven.cc.cd`，并在 Cloudflare 侧绑定自定义域名。新机器如需同样对外：

1. 安装 cloudflared，登录同一 Cloudflare 账号，复用原隧道凭据（或新建隧道指向 `http://localhost:8888`）。
2. **无需改 Hydro 配置**：数据库里已设置 `server.xff = CF-Connecting-IP`，隧道访客的真实公网 IP 会被自动记录，GeoIP 显示归属地，IP/设备封禁对其生效。

## 已知坑（原机器踩过的，新机器同样注意）

1. **ps1 脚本必须 UTF-8 with BOM**——不要用记事本另存为 ANSI，否则中文乱码导致语法错误。
2. **沙箱 env 不能以空行结尾**：`hydrojudge.env` 用 `env: |-`（已配置好，勿改 `|`），否则评测报 "Cannot create temporary file ... Permission denied"。
3. **语言配置**：`langs.txt` 是唯一数据源；`cc` 基键必须带 `code_file: foo.cc`，且如需支持洛谷远程语言必须有 `py:` 基键（已配置好）。修改后执行 `node fix-langs.js` 并重启。
4. **残留进程**：重启时确保旧 node 进程已全部退出（`.\stop.ps1` 会处理），否则旧进程继续消费评测任务、配置不生效。
5. **强制杀 mongod 后重启慢**：WiredTiger 日志回放可能超过 1 分钟，`start.ps1` 已放宽等待。
6. **data-copy 属性必须是 base64**：ui-default 的剪贴板组件会对 `data-copy` 做 base64 解码，模板里要写 `data-copy="{{ x | base64_encode }}"`，写明文会弹出乱码通知。
7. **POST operation 命名**：表单里 `operation` 值用下划线命名（如 `ban_ip` → `postBanIp`）；且用 JS `form.submit()` 提交时，按钮上的 `name/value` 不会随表单发送，operation 必须放隐藏域。
8. **geoip 需要毫米级数据库**：`GeoLite2-City.mmdb` 已随仓库提供并会被 deploy.ps1 就位。日后更新：下载新版 mmdb 覆盖 `node_modules\@hydrooj\geoip\GeoLite2-City.mmdb` 后重启。
9. **首页/安全页 IP 显示 Unknown address (127.0.0.1)**：本机 localhost 访问属正常现象；隧道访客显示公网 IP。

## 目录与数据说明

```
D:\hydro\
├─ deploy.ps1 / check.ps1      部署与自检脚本（本仓库）
├─ restore-db.js               数据库恢复脚本（本仓库）
├─ backup\hydro-ejson\         全库数据（29 个集合 EJSON，165MB）
├─ start.ps1 / stop.ps1        启停脚本（启动完成自动退出；-Foreground 看实时日志）
├─ hydrooj.cmd                 CLI 启动脚本（自动补环境变量）
├─ langs.txt                   语言配置唯一数据源
├─ seed.js / fix-env.js / fix-langs.js / fix-xff.js / fix-token-ip.js / set-host.js
│                               各项配置的一次性写入/修复工具
├─ config.json                 MongoDB 连接串
├─ .hydro\addon.json           插件清单
├─ .hydro\addons\              各插件（含 12 个本机目录安装：自研 ip-ban/access-log/badge/hydroac-client + 8 个新装训练成绩表/批量复制/vjudge-qoj/倒计时/签到/剪贴板/实名/金币）
├─ tools\                      4 个独立命令行工具（不进 addon.json，各自 npm install + npx tsc）
├─ node_modules\               npm install 生成（deploy.ps1 自动执行）
├─ go-judge\go-judge.exe       沙箱 v1.14.1（随仓库提供）
├─ backup-assets\              GeoLite2-City.mmdb（deploy.ps1 会拷贝到 geoip 插件目录）
└─ logs\hydro.log              运行日志
D:\data\file\hydro\            文件存储（题目数据等，路径由 USERPROFILE 推导，勿改）
```

关键数据库键（MongoDB `system` 集合，改后需重启）：`hydrooj.langs`（语言）、`config`（hydrojudge 沙箱参数，env 用 `|-`）、`server.xff=CF-Connecting-IP`（隧道真实 IP）、`server.host=0.0.0.0`（监听所有网卡）。

## CLI 速查（在 D:\hydro 下）

```powershell
hydrooj cli user setSuperAdmin 2        # 提权
hydrooj cli record judge system <rid>   # 重测
hydrooj cli                             # 交互模式
```
