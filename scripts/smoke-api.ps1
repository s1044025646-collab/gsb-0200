# API 冒烟脚本：启动服务器、调用全部端点、关闭服务器。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:LLL_PORT = "8799"
$env:LLL_DATA_DIR = Join-Path $root "data-smoke"

$proc = Start-Process -FilePath "node" -ArgumentList "dist/server/index.js" -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Seconds 2
  $health = Invoke-RestMethod "http://localhost:8799/health"
  Write-Host "health ok=$($health.ok)"

  $b = Invoke-RestMethod -Method Post -Uri "http://localhost:8799/api/bases" `
    -ContentType "application/json" -Body '{"basis":[["5","3"],["3","5"]],"name":"api"}'
  Write-Host "basisId=$($b.data.id) version=$($b.data.basisVersion.Substring(0,8))"

  $r = Invoke-RestMethod -Method Post -Uri "http://localhost:8799/api/bases/$($b.data.id)/reduce" `
    -ContentType "application/json" -Body "{}"
  Write-Host "reductionId=$($r.data.reductionId) status=$($r.data.status)"

  $v = Invoke-RestMethod -Uri "http://localhost:8799/api/reductions/$($r.data.reductionId)/verify"
  Write-Host "verify valid=$($v.data.valid) detU=$($v.data.detU)"

  $t = Invoke-RestMethod -Method Post -Uri "http://localhost:8799/api/bases/$($b.data.id)/targets" `
    -ContentType "application/json" -Body '{"target":["-6","2"]}'
  $a = Invoke-RestMethod -Method Post `
    -Uri "http://localhost:8799/api/reductions/$($r.data.reductionId)/approx/$($t.data.id)" `
    -ContentType "application/json" -Body '{"boxRadius":3}'
  Write-Host "point=$($a.data.point -join ',') d2=$($a.data.distanceSq.num)/$($a.data.distanceSq.den)"
  Write-Host "inLattice=$($a.data.pointInOriginalLattice) boxOpt=$($a.data.box.babaiIsBoxOptimal)"

  $s = Invoke-RestMethod -Uri "http://localhost:8799/api/reductions/$($r.data.reductionId)/summary"
  Write-Host "summary complete=$($s.data.complete) steps=$($s.data.totalSteps)"
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
