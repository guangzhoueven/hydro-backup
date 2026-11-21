# Hydro OJ 本地实例（D:\hydro）

单机版 Hydro OJ 5.1.0，评测只开放 **C++**，编译器为 RedPanda C++ 自带的 MinGW-W64 g++。

## 组成与端口

| 组件 | 说明 | 地址 |
| --- | --- | --- |
| MongoDB 8.0.24 | 数据库，数据在 `mongo\data` | `127.0.0.1:27017` |
| go-judge 1.14.1 | 评测沙箱（Windows 受限令牌） | `127.0.0.1:5050` |
| Hydro 5.1.0 | Web 服务 + 内置评测机（hydrojudge 以 addon 方式跑在同一进程） | `127.0.0.1:8888` |

三个服务都只监听 127.0.0.1。

## 启动 / 停止

```powershell
cd D:\hydro
.\start.ps1          # MongoDB + go-judge 后台，Hydro 前台（看日志，Ctrl+C 退出）
.\start.ps1 -Daemon  # 三个全部后台
.\stop.ps1           # 依次停掉三个
```

`start.ps1` 会自动补齐 `tmp`、`cache\judge`、`go-judge\cache`、`mongo\data` 目录。

### 启动 Hydro 必需的环境变量

```powershell
$env:USERPROFILE = 'D:\hydro'        # 决定配置目录 D:\hydro\.hydro
$env:TEMP = 'D:\hydro\tmp'
$env:TMP = 'D:\hydro\tmp'
$env:NODE_APP_INSTANCE = '0'         # 不设为 0 则静态资源拷贝、数据库迁移、内置评测机都不会启用
Set-Location D:\hydro
node node_modules\hydrooj\bin\hydrooj.js
```

## 账号

- 首个注册用户 uid=2，已通过 `hydrooj cli user setSuperAdmin 2` 提升为超级管理员（`priv = -1`）。
- 题库自带示例题 **A+B Problem**（`system/1`，显示为 P1000），含 `1.in/1.out`、`2.in/2.out` 与 `config.yaml`（`time: 1s` / `memory: 64m`）。

## 命令行（CLI）

在 `D:\hydro` 下直接敲 `hydrooj` 即可（cmd 会优先用当前目录的 `hydrooj.cmd` 启动脚本）：

```powershell
cd D:\hydro
hydrooj cli user setSuperAdmin 2          # 提权
hydrooj cli record judge system <rid>     # 触发重测
hydrooj cli                               # 交互模式
```

`hydrooj.cmd` 内部会补齐上面那四个环境变量，所以不需要手动设置。

## 语言配置

只有 C++（`cc` 及 `cc.cc98/11/14/17/20` 变体）。**语言配置的唯一数据源是 `langs.txt`**，
`seed.js`（首次初始化）和 `fix-langs.js`（覆盖更新）都从它读取：

```powershell
# 修改 langs.txt 后：
node fix-langs.js     # $set 覆盖写入 MongoDB
# 然后重启 Hydro
```

配置存在 MongoDB `system` 集合：`hydrooj.langs`（语言）、`config`（hydrojudge 参数）、`server.url`。

> 改完 `config` 后需要重启 Hydro 才生效（直接写库不会触发 `system/setting` 广播）。

## 已知坑

### 1. 沙箱 env 末尾不能有空行（本实例曾因此评测全挂）

hydrojudge 组装沙箱环境变量时是 `getConfig('env').split('\n')` 后只过滤掉 `#` 注释行，**不会过滤空字符串**。
如果 YAML 用 `env: |`（保留结尾换行），末尾会被拆出一个 `""` 混进 env 数组，
破坏子进程环境块，GCC 随即报：

```
Cannot create temporary file in C:\WINDOWS\: Permission denied
```

**必须写成 `env: |-`（剥离结尾换行）。** 已在 `seed.js` / `fix-env.js` 中修正并加了注释。

### 2. 沙箱只能写自己的工作目录

go-judge 在 Windows 用 `CreateRestrictedToken` 跑子进程，**除工作目录外任何路径都写不进去**
（`D:\hydro\tmp`、`C:\Windows`、用户 Temp 全部 `Permission denied`）。
所以不要给沙箱 env 传 `TEMP`/`TMP`/`TMPDIR` 指向外部目录，让 GCC 用 cwd 即可。

### 3. 编译命令必须用正斜杠路径

hydrojudge 用 `shell-quote` 解析编译命令，反斜杠会被当转义符吞掉：

```
# 正确
compile: C:/Tool/App/RedPanda-Cpp/mingw64/bin/g++.exe -O2 -Wall -std=c++17 -o foo.exe foo.cc -lm
```

### 4. 机器上另有一份坏掉的全局 hydrooj

`C:\Users\admin\AppData\Roaming\npm\node_modules\hydrooj` 是 **5.0.0-beta.9**，缺 `@cordisjs/plugin-logger`，直接跑会报 `MODULE_NOT_FOUND`。
本实例用的是 `D:\hydro\node_modules` 里的 5.1.0。在 `D:\hydro` 目录下敲 `hydrooj` 会走本地启动脚本，不受影响；
若在别的目录敲 `hydrooj` 仍会命中全局那份。彻底清理可执行 `npm uninstall -g hydrooj`。

### 5. C++ 变体（cc.cc17 等）报 "foo.cc: No such file or directory"

`parseLang`（@hydrooj/common/lang.ts）给没写 `code_file` 的语言默认值 `foo.<key>`：
`cc` 恰好得到 `foo.cc`（侥幸正确），但 `cc.cc17` 会得到 **`foo.cc.cc17`**——
copyIn 里放的是 `foo.cc.cc17`，编译命令里写的却是 `foo.cc`，于是编译必挂。

**修复：在 `cc` 基键显式写 `code_file: foo.cc`**，变体通过 parseLang 的继承机制获得该字段（已写入 langs.txt）。
改完必须重启 Hydro 才生效——语言配置是启动时读入内存的。

### 6. 残留的旧 Hydro 进程会"抢走"评测任务

评测任务走 MongoDB 队列，**谁启动早谁内存里的语言配置就是旧的**。
如果重启时旧进程没杀干净（例如 taskkill 参数错误、或 start.ps1 检测到 8888 端口还活着直接跳过），
旧进程会继续消费任务，导致"改了配置还是旧结果"的诡异现象。排查方法：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*hydrooj*bin\hydrooj.js*' } |
    Select-Object ProcessId, CreationDate
```

**必须确认只剩 0 个再启动新进程**；用 `.\stop.ps1` 停最稳妥。

### 7. 守护模式日志

`.\start.ps1 -Daemon` 会把 Hydro 输出重定向到 `logs\hydro.log`（stderr 到 `logs\hydro.err.log`），
排查问题先看这里。

### 8. 日志里的无害噪音

- `Module require via hydrooj/src/model/setting is deprecated.` —— 上游弃用提示，不影响运行。
- `Not launched by PM2.` —— 控制面板仪表盘接口的提示，非 PM2 部署时正常。
- `model/task [I] No replica set found.` —— 单机 MongoDB 没有副本集，事件总线自动降级为轮询，正常。
- `/bin/bash: ... ulimit -s` 失败 —— `stackSize()` 在 Windows 上跑 bash，属预期。
- MongoDB 被强杀后重启恢复较慢（WiredTiger 日志回放），可能超过 1 分钟，start.ps1 已放宽等待。

## 目录结构

```
D:\hydro\
├─ start.ps1 / stop.ps1      启停脚本（守护模式日志在 logs\hydro.log）
├─ hydrooj.cmd               CLI 启动脚本（补齐环境变量）
├─ langs.txt                 语言配置单一数据源（seed.js / fix-langs.js 共用）
├─ seed.js                   首次种子配置（幂等，$setOnInsert）
├─ fix-langs.js              覆盖写入 hydrooj.langs（改语言后跑这个）
├─ fix-env.js                覆盖写入 hydrojudge config
├─ config.json               MongoDB 连接串
├─ .hydro\                   Hydro 运行时目录（addon.json、静态资源、迁移标记）
├─ node_modules\             hydrooj 5.1.0 + hydrojudge + ui-default
├─ mongo\                    MongoDB 程序与数据
├─ go-judge\                 沙箱程序、缓存、proxy.js 请求日志代理
├─ cache\judge\              评测缓存
└─ tmp\                      临时目录
```

## 排查评测问题

怀疑 hydrojudge 发出的沙箱请求不对时，可用请求日志代理抓包：

```powershell
node D:\hydro\go-judge\proxy.js        # 监听 5051，转发到 5050，日志写入 proxy.log
```

然后把 `config` 里的 `sandbox_host` 改成 `http://127.0.0.1:5051`，重启 Hydro，重测一次即可在
`D:\hydro\go-judge\proxy.log` 看到完整的 `args` / `env` / `copyIn`。排查完记得改回 `5050`。
