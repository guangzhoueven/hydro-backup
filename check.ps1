<#
.SYNOPSIS
    部署后自检脚本：端口、首页、数据完整性、插件、语言配置。
#>
$Root = 'D:\hydro'
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok, [string]$detail = '') {
    $tag = if ($ok) { 'PASS' } else { 'FAIL' }
    $color = if ($ok) { 'Green' } else { 'Red' }
    Write-Host "[$tag] $name $(if($detail){ "- $detail"})" -ForegroundColor $color
    if ($ok) { $script:pass++ } else { $script:fail++ }
}

function Test-Port([int]$p) {
    try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true } catch { return $false }
}

Check 'MongoDB 端口 27017' (Test-Port 27017)
Check 'go-judge 端口 5050' (Test-Port 5050)
Check 'Hydro 端口 8888' (Test-Port 8888)

try {
    $r = Invoke-WebRequest 'http://127.0.0.1:8888/' -UseBasicParsing -TimeoutSec 15
    Check '首页 HTTP 200' ($r.StatusCode -eq 200)
} catch { Check '首页 HTTP 200' $false $_.Exception.Message }

try {
    $env:NODE_PATH = Join-Path $Root 'node_modules'
    $out = node -e "const{MongoClient}=require('mongodb');(async()=>{const c=await MongoClient.connect('mongodb://127.0.0.1:27017/hydro');const db=c.db('hydro');const out={};out.problems=await db.collection('document').countDocuments({docType:10});out.users=await db.collection('user').countDocuments({});out.domains=await db.collection('domain').countDocuments({});out.storage=await db.collection('storage').countDocuments({});out.langs=(await db.collection('system').findOne({_id:'hydrooj.langs'})).value.includes('g++.exe');out.xff=(await db.collection('system').findOne({_id:'server.xff'})).value;console.log(JSON.stringify(out));await c.close();})().catch(e=>{console.error(e.message);process.exit(1)})" 2>$null
    $d = $out | ConvertFrom-Json
    Check '题目数量 = 18482' ($d.problems -eq 18482) "实际 $($d.problems)"
    Check '语言配置(C++ g++)' ($d.langs -eq $true)
    Check 'server.xff = CF-Connecting-IP' ($d.xff -eq 'CF-Connecting-IP')
    Check '文件存储存在' ((Get-ChildItem 'D:\data\file\hydro' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count -gt 18000)
    Check 'GeoLite2 mmdb 就位' (Test-Path (Join-Path $Root 'node_modules\@hydrooj\geoip\GeoLite2-City.mmdb'))
    Check '编译器存在' (Test-Path 'C:\Tool\App\RedPanda-Cpp\mingw64\bin\g++.exe') '不存在则见 DEPLOY.md 第 3 步'
} catch { Check '数据完整性检查' $false $_.Exception.Message }

Write-Host ''
Write-Host "结果: $pass 通过, $fail 失败" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { Write-Host '排查指引见 DEPLOY.md「常见问题」一节' -ForegroundColor Yellow }
