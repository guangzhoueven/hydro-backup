<#
.SYNOPSIS
    Hydro OJ 一键停止脚本：依次停止 Hydro、go-judge、MongoDB。

.DESCRIPTION
    只会杀掉属于本实例的进程（按命令行匹配 D:\hydro 路径），
    不会影响机器上其它 node / mongod 进程。
    MongoDB 优先走 mongod --shutdown 优雅关闭，失败再强制结束。

.EXAMPLE
    .\stop.ps1
#>

$Root = 'D:\hydro'

function Stop-ByCommandLine([string]$Name, [string]$Pattern) {
    $targets = Get-CimInstance Win32_Process -Filter "Name='$Name'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like $Pattern }
    foreach ($p in $targets) {
        Write-Host "[stop] 结束 $Name (PID $($p.ProcessId))" -ForegroundColor Cyan
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop }
        catch { Write-Host "[stop]   失败：$($_.Exception.Message)" -ForegroundColor Yellow }
    }
    if (-not $targets) { Write-Host "[stop] $Name 未在运行" -ForegroundColor DarkGray }
}

# 1. Hydro（注意只匹配 hydrooj 的入口脚本，避免误杀其它 node 进程）
Stop-ByCommandLine 'node.exe' '*hydrooj*bin\hydrooj.js*'

# 2. go-judge
Stop-ByCommandLine 'go-judge.exe' "*$Root*"

# 3. MongoDB：先尝试优雅关闭
$MongoExe = Join-Path $Root 'mongo\mongodb-win32-x86_64-windows-8.0.24\bin\mongod.exe'
$mongod = Get-CimInstance Win32_Process -Filter "Name='mongod.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Root*" }
if ($mongod) {
    Write-Host '[stop] MongoDB 优雅关闭中...' -ForegroundColor Cyan
    try {
        & $MongoExe --dbpath (Join-Path $Root 'mongo\data') --shutdown 2>$null | Out-Null
    } catch { }
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline -and (Get-Process mongod -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 300
    }
    if (Get-Process mongod -ErrorAction SilentlyContinue) {
        Write-Host '[stop] 优雅关闭超时，强制结束' -ForegroundColor Yellow
        Stop-ByCommandLine 'mongod.exe' "*$Root*"
    } else {
        Write-Host '[stop] MongoDB 已关闭' -ForegroundColor Green
    }
} else {
    Write-Host '[stop] MongoDB 未在运行' -ForegroundColor DarkGray
}

Write-Host '[stop] 完成' -ForegroundColor Green
