# =====================================================================
#  Запуск «Интеллектуального тренажёра для подготовки к собеседованиям»
#  Один сервер: FastAPI раздаёт API + собранный React.
#
#  Использование:
#    .\scripts\start.ps1              # собрать фронтенд (если нужно) и запустить
#    .\scripts\start.ps1 -SkipBuild   # запустить как есть
#    .\scripts\start.ps1 -Port 9000   # другой порт
# =====================================================================
param(
    [switch]$SkipBuild,
    [int]$Port = 8000,
    [string]$HostAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

# --- Обход ограничения среды: временные папки только внутри проекта ---
$env:PYTHONPATH = Join-Path $root "tools\pyfix"
$env:TMP = Join-Path $root ".tmp"
$env:TEMP = Join-Path $root ".tmp"
New-Item -ItemType Directory -Force -Path $env:TMP | Out-Null

if (-not (Test-Path $python)) {
    Write-Host "Виртуальное окружение не найдено. Запустите .\scripts\setup.ps1" -ForegroundColor Yellow
    exit 1
}

# --- .env (если нет — создаём из примера, офлайн-режим ИИ работает сразу) ---
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "backend\.env.example") $envFile
    Write-Host "Создан backend\.env из примера (ИИ в офлайн-режиме)." -ForegroundColor Yellow
}

# --- Сборка фронтенда, если её ещё нет ---
$indexHtml = Join-Path $root "backend\app\static\index.html"
if (-not $SkipBuild -and -not (Test-Path $indexHtml)) {
    Write-Host "Сборка фронтенда..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "build_frontend.ps1")
    if ($LASTEXITCODE -ne 0) { Write-Host "Сборка фронтенда не удалась." -ForegroundColor Red; exit 1 }
}

# --- Проверка свободного порта ---
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "Порт $Port уже занят. Запустите с другим портом: .\scripts\start.ps1 -Port 8100" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Тренажёр запускается: http://${HostAddress}:$Port" -ForegroundColor Green
Write-Host "  API-документация:     http://${HostAddress}:$Port/api/docs" -ForegroundColor DarkGray
Write-Host "  Остановка: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

Set-Location (Join-Path $root "backend")
& $python -m uvicorn app.main:app --host $HostAddress --port $Port
