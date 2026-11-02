# =====================================================================
#  Сборка React-фронтенда в backend/app/static (раздаётся FastAPI).
# =====================================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:npm_config_cache = Join-Path $root ".npm-cache"
$env:npm_config_tmp = Join-Path $root ".npm-tmp"
$env:TMP = Join-Path $root ".tmp"
$env:TEMP = Join-Path $root ".tmp"
New-Item -ItemType Directory -Force -Path $env:TMP, $env:npm_config_cache | Out-Null

$frontend = Join-Path $root "frontend"
if (-not (Test-Path $frontend)) {
    Write-Host "Папка frontend не найдена." -ForegroundColor Red
    exit 1
}

Push-Location $frontend
try {
    if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
        Write-Host "Устанавливаю npm-зависимости..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install завершился с ошибкой" }
    }
    Write-Host "Собираю production-бандл..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build завершился с ошибкой" }
} finally {
    Pop-Location
}

$indexHtml = Join-Path $root "backend\app\static\index.html"
if (Test-Path $indexHtml) {
    Write-Host "Готово: $indexHtml" -ForegroundColor Green
} else {
    Write-Host "Сборка не создала backend\app\static\index.html — проверьте vite.config.ts." -ForegroundColor Red
    exit 1
}
