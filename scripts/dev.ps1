# =====================================================================
#  Режим разработки: бэкенд с автоперезагрузкой + Vite dev-сервер.
#  Открывайте http://localhost:5173 (Vite проксирует /api на :8000).
# =====================================================================
param([int]$ApiPort = 8000)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$env:PYTHONPATH = Join-Path $root "tools\pyfix"
$env:TMP = Join-Path $root ".tmp"
$env:TEMP = Join-Path $root ".tmp"
$env:npm_config_cache = Join-Path $root ".npm-cache"
$env:npm_config_tmp = Join-Path $root ".npm-tmp"
New-Item -ItemType Directory -Force -Path $env:TMP | Out-Null

$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { Write-Host "Сначала выполните .\scripts\setup.ps1" -ForegroundColor Red; exit 1 }

Write-Host "Бэкенд: http://127.0.0.1:$ApiPort" -ForegroundColor Green
Write-Host "Фронтенд (dev): http://localhost:5173" -ForegroundColor Green

Start-Process -FilePath $python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "$ApiPort" `
    -WorkingDirectory (Join-Path $root "backend")

Push-Location (Join-Path $root "frontend")
try {
    npm run dev
} finally {
    Pop-Location
}
