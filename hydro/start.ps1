<#
.SYNOPSIS
    Hydro OJ 一键启动脚本。

.DESCRIPTION
    依次拉起 MongoDB (27017)、go-judge 沙箱 (5050)，最后启动 Hydro (8888)。
    前两个已在运行时会跳过。Hydro 启动完成后本脚本自动退出（日志写入 logs\hydro.log）。

.PARAMETER Foreground
    前台运行 Hydro：实时显示日志，Ctrl+C 退出（go-judge / MongoDB 仍在后台）。
    不加该参数时 Hydro 以后台方式运行，脚本在启动完成后自动结束。

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Foreground
#>
param([switch]$Daemon, [switch]$Foreground)

$Root = 'D:\hydro'
$MongoExe = Join-Path $Root 'mongo\mongodb-win32-x86_64-windows-8.0.24\bin\mongod.exe'
$GoJudgeExe = Join-Path $Root 'go-judge\go-judge.exe'
$HydroEntry = Join-Path $Root 'node_modules\hydrooj\bin\hydrooj.js'

function Test-Port([int]$Port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $Port)
        $c.Close()
        return $true
    } catch { return $false }
}

function Wait-Port([int]$Port, [int]$Seconds, [string]$Name) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $Port) { Write-Host "[start] $Name 就绪 ($Port)" -ForegroundColor Green; return }
        Start-Sleep -Milliseconds 300
    }
    throw "[start] $Name 启动超时（端口 $Port）"
}

# ---------- 0. 目录 ----------
$dirs = @(
    (Join-Path $Root 'tmp')
    (Join-Path $Root 'cache\judge')
    (Join-Path $Root 'go-judge\cache')
    (Join-Path $Root 'mongo\data')
    (Join-Path $Root 'logs')
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

# ---------- 1. MongoDB ----------
if (Test-Port 27017) {
    Write-Host '[start] MongoDB 已在运行 (27017)' -ForegroundColor DarkGray
} else {
    if (-not (Test-Path $MongoExe)) { throw "[start] 找不到 mongod：$MongoExe" }
    Start-Process -FilePath $MongoExe -ArgumentList @(
        '--dbpath', (Join-Path $Root 'mongo\data'),
        '--bind_ip', '127.0.0.1',
        '--port', '27017',
        '--logpath', (Join-Path $Root 'mongo\mongod.log')
    ) -WindowStyle Hidden
    Write-Host '[start] MongoDB 启动中...' -ForegroundColor Cyan
    Wait-Port 27017 180 'MongoDB'
}

# ---------- 2. go-judge 沙箱 ----------
if (Test-Port 5050) {
    Write-Host '[start] go-judge 已在运行 (5050)' -ForegroundColor DarkGray
} else {
    if (-not (Test-Path $GoJudgeExe)) { throw "[start] 找不到 go-judge：$GoJudgeExe" }
    Start-Process -FilePath $GoJudgeExe -ArgumentList @(
        '-http-addr', '127.0.0.1:5050',
        '-dir', (Join-Path $Root 'go-judge\cache'),
        '-file-timeout', '30m'
    ) -WindowStyle Hidden
    Write-Host '[start] go-judge 启动中...' -ForegroundColor Cyan
    Wait-Port 5050 30 'go-judge'
}

# ---------- 3. Hydro ----------
# 这四个环境变量缺一不可：
#   USERPROFILE        -> 决定配置目录 ~/.hydro（即 D:\hydro\.hydro）
#   TEMP / TMP         -> Hydro 自身临时目录
#   NODE_APP_INSTANCE=0 -> 才会执行静态资源拷贝、数据库迁移与内置评测机
$env:USERPROFILE = $Root
$env:TEMP = Join-Path $Root 'tmp'
$env:TMP = $env:TEMP
$env:NODE_APP_INSTANCE = '0'

if (Test-Port 8888) {
    Write-Host '[start] Hydro 已在运行 (8888)' -ForegroundColor DarkGray
    Write-Host '[start] 全部就绪：http://127.0.0.1:8888/' -ForegroundColor Yellow
    return
}

Set-Location $Root
if ($Foreground) {
    # 前台模式：实时看日志，Ctrl+C 退出
    Write-Host '[start] Hydro 前台运行中，Ctrl+C 退出' -ForegroundColor Cyan
    Write-Host '[start] http://127.0.0.1:8888/' -ForegroundColor Yellow
    node $HydroEntry
} else {
    # 默认：后台启动，日志重定向到 logs\hydro.log，脚本随后自动结束
    Start-Process -FilePath 'node.exe' -ArgumentList $HydroEntry -WorkingDirectory $Root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Root 'logs\hydro.log') `
        -RedirectStandardError (Join-Path $Root 'logs\hydro.err.log')
    Write-Host '[start] Hydro 启动中（日志 logs\hydro.log）...' -ForegroundColor Cyan
    Wait-Port 8888 240 'Hydro'
    Write-Host '[start] 全部完成：http://127.0.0.1:8888/' -ForegroundColor Yellow
}
