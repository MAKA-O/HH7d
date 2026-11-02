# =====================================================================
#  Установка зависимостей с нуля (Python-venv + npm).
#  Используется, если проект скопирован на чистую машину.
# =====================================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Обход ограничений песочницы: кэши и tmp — внутри проекта
$env:TMP = Join-Path $root ".tmp"
$env:TEMP = Join-Path $root ".tmp"
$env:PIP_CACHE_DIR = Join-Path $root ".pip-cache"
$env:npm_config_cache = Join-Path $root ".npm-cache"
$env:npm_config_tmp = Join-Path $root ".npm-tmp"
New-Item -ItemType Directory -Force -Path $env:TMP | Out-Null

Write-Host "== 1/3. Python-окружение ==" -ForegroundColor Cyan
$venv = Join-Path $root ".venv"
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
    $systemPython = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $systemPython) { Write-Host "Python не найден в PATH." -ForegroundColor Red; exit 1 }
    & $systemPython -m venv $venv
}
$env:PYTHONPATH = Join-Path $root "tools\pyfix"
& $python -m pip install --disable-pip-version-check --upgrade pip
& $python -m pip install --disable-pip-version-check -r (Join-Path $root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) { Write-Host "Не удалось установить Python-зависимости." -ForegroundColor Red; exit 1 }

Write-Host "== 2/3. npm-зависимости ==" -ForegroundColor Cyan
$npm = (Get-Command npm -ErrorAction SilentlyContinue).Source
if ($npm) {
    Push-Location (Join-Path $root "frontend")
    try {
        & npm install
    } finally {
        Pop-Location
    }
} else {
    Write-Host "npm не найден — фронтенд не установлен. Установите Node.js 20+." -ForegroundColor Yellow
}

Write-Host "== 3/3. Конфигурация ==" -ForegroundColor Cyan
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "backend\.env.example") $envFile
    Write-Host "Создан backend\.env (офлайн-режим ИИ). Для живой модели задайте AI_API_KEY." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Готово! Запуск: .\scripts\start.ps1" -ForegroundColor Green
