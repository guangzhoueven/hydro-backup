<#
.SYNOPSIS
    Hydro OJ 自动部署脚本（在已 clone 到 D:\hydro 的仓库根目录运行）。

.DESCRIPTION
    依次完成：npm 依赖安装 -> GeoIP 数据库就位 -> MongoDB 8.0.24 下载/解压 ->
    启动 mongod -> 恢复全部数据 -> 创建运行目录 -> 启动站点。
    前置条件：Windows + D: 盘 + 已安装 Node.js(18+) 与 git；已执行
        git clone https://github.com/guangzhoueven/hydro-backup D:\hydro

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1
#>
$ErrorActionPreference = 'Stop'
$Root = 'D:\hydro'
Set-Location $Root
$log = Join-Path $Root 'deploy.log'
function Log([string]$m, [string]$color = 'Gray') {
    $line = "[deploy $(Get-Date -Format 'HH:mm:ss')] $m"
    Write-Host $line -ForegroundColor $color
    Add-Content -Path $log -Value $line
}

try { Log "Node $(node -v) / npm $(npm -v)" 'Cyan' } catch {
    throw '未检测到 node/npm，请先安装 Node.js 18+ 并重试。'
}

# ---------- 1. npm 依赖 ----------
Log '1/6 安装 npm 依赖（约 2-5 分钟）...' 'Cyan'
if (-not (Test-Path (Join-Path $Root 'node_modules\hydrooj'))) {
    npm install --registry=https://registry.npmmirror.com 2>&1 | Select-Object -Last 5 | Tee-Object -FilePath $log -Append
    if ($LASTEXITCODE -ne 0) { throw 'npm install 失败，见 deploy.log' }
} else { Log 'node_modules 已存在，跳过' }

# ---------- 2. GeoIP 数据库 ----------
Log '2/6 就位 GeoLite2-City.mmdb...' 'Cyan'
$geoDir = Join-Path $Root 'node_modules\@hydrooj\geoip'
New-Item -ItemType Directory -Force $geoDir | Out-Null
Copy-Item (Join-Path $Root 'backup-assets\GeoLite2-City.mmdb') $geoDir -Force

# ---------- 3. MongoDB 8.0.24 ----------
$mongoBin = Join-Path $Root 'mongo\mongodb-win32-x86_64-windows-8.0.24\bin\mongod.exe'
if (-not (Test-Path $mongoBin)) {
    Log '3/6 下载 MongoDB 8.0.24（约 60MB）...' 'Cyan'
    $zip = Join-Path $Root 'mongo\mongodb.zip'
    New-Item -ItemType Directory -Force (Join-Path $Root 'mongo') | Out-Null
    $urls = @(
        'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.24.zip',
        'https://registry.npmmirror.com/-/binary/mongodb/windows/mongodb-windows-x86_64-8.0.24.zip'
    )
    $ok = $false
    foreach ($u in $urls) {
        try { Log "  尝试 $u"; Invoke-WebRequest $u -OutFile $zip -UseBasicParsing -TimeoutSec 600; $ok = $true; break }
        catch { Log "  失败: $($_.Exception.Message)" 'Yellow' }
    }
    if (-not $ok) { throw 'MongoDB 下载失败，请手动下载 zip 解压后重试' }
    Log '  解压中...'
    $tmpEx = Join-Path $Root 'mongo\_extract'
    Expand-Archive $zip -DestinationPath $tmpEx -Force
    $binDir = Get-ChildItem $tmpEx -Recurse -Filter 'mongod.exe' | Select-Object -First 1
    if (-not $binDir) { throw '解压后未找到 mongod.exe' }
    $ver = Split-Path (Split-Path $binDir.FullName) -Leaf
    New-Item -ItemType Directory -Force (Join-Path $Root "mongo\$ver") | Out-Null
    Move-Item (Join-Path (Split-Path $binDir.FullName) '*') (Join-Path $Root "mongo\$ver\") -Force
    Remove-Item $tmpEx -Recurse -Force
    Remove-Item $zip -Force
}
if (-not (Test-Path $mongoBin)) { throw "MongoDB 就位失败：$mongoBin 不存在" }

# ---------- 4. 启动 mongod 并恢复数据 ----------
Log '4/6 启动 MongoDB 并恢复数据...' 'Cyan'
$dataDir = Join-Path $Root 'mongo\data'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$mongod = Join-Path (Split-Path $mongoBin) 'mongod.exe'
$port27017 = $false
try { $t = New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1', 27017); $t.Close(); $port27017 = $true } catch {}
if (-not $port27017) {
    Start-Process -FilePath $mongod -ArgumentList @(
        '--dbpath', $dataDir, '--bind_ip', '127.0.0.1', '--port', '27017',
        '--logpath', (Join-Path $Root 'mongo\mongod.log')
    ) -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        try { $t = New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1', 27017); $t.Close(); $port27017 = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $port27017) {
        # VC++ 运行库缺失时 mongod 无法启动，zip 内自带安装器
        Log '  mongod 启动失败，尝试安装 VC++ 运行库...' 'Yellow'
        Start-Process (Join-Path (Split-Path $mongoBin) 'vc_redist.x64.exe') -ArgumentList '/install', '/quiet', '/norestart' -Wait
        Start-Process -FilePath $mongod -ArgumentList @(
            '--dbpath', $dataDir, '--bind_ip', '127.0.0.1', '--port', '27017',
            '--logpath', (Join-Path $Root 'mongo\mongod.log')
        ) -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds(120)
        while ((Get-Date) -lt $deadline) {
            try { $t = New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1', 27017); $t.Close(); $port27017 = $true; break } catch { Start-Sleep -Milliseconds 500 }
        }
    }
    if (-not $port27017) { throw 'MongoDB 启动失败，查看 mongo\mongod.log' }
}
Log '  MongoDB 就绪 (27017)'

$restore = Join-Path $Root 'deploy\restore-db.js'
if (Test-Path (Join-Path $Root 'restore-db.js')) { $restore = Join-Path $Root 'restore-db.js' }
Log '  恢复数据库（18486 题目 + 用户 + 设置，约 1-3 分钟）...'
node $restore 2>&1 | Tee-Object -FilePath $log -Append

# ---------- 5. 目录 ----------
foreach ($d in 'tmp', 'cache\judge', 'go-judge\cache', 'logs') {
    New-Item -ItemType Directory -Force (Join-Path $Root $d) | Out-Null
}

# ---------- 6. 启动站点 ----------
Log '6/6 启动站点...' 'Cyan'
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'start.ps1')

Log '部署完成！访问 http://127.0.0.1:8888/ （账号与原站一致）' 'Green'
Log '管理员账号 uid=2（密码同原站）。评测前请确认编译器路径，见 DEPLOY.md 第 3 步。' 'Green'
