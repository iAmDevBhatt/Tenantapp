# Starts Rent Ledger in STANDALONE (no Docker) mode: backend (uvicorn,
# auto-reload) and frontend (Vite dev server) as two local processes, each
# in its own console window so you can see their logs live.
#
# First run sets up a venv + installs backend deps, runs `npm install` for
# the frontend, and creates a dev .env (with a freshly generated JWT_SECRET
# and admin password) if one doesn't exist yet. Subsequent runs are fast.
#
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$runStateFile = Join-Path $root ".dev-run.json"

# --- 1. Python venv + backend deps ---
if (-not (Test-Path $venvPython)) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Error "Python was not found on PATH. Install Python 3.11+ first."
        exit 1
    }
    Write-Host "Creating Python virtual environment (.venv)..."
    python -m venv "$root\.venv"
    & $venvPython -m pip install --upgrade pip --quiet
}

$backendMarker = Join-Path $root ".venv\.backend-deps-installed"
if (-not (Test-Path $backendMarker) -or ((Get-Item "$root\backend\requirements.txt").LastWriteTime -gt (Get-Item $backendMarker).LastWriteTime)) {
    Write-Host "Installing backend dependencies..."
    & $venvPython -m pip install -r "$root\backend\requirements.txt" --quiet
    New-Item -ItemType File -Force -Path $backendMarker | Out-Null
}

# --- 2. Frontend deps ---
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm was not found on PATH. Install Node.js 18+ first."
    exit 1
}
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "Installing frontend dependencies (npm install)..."
    Push-Location "$root\frontend"
    npm install
    Pop-Location
}

# --- 3. Dev .env (JWT_SECRET / admin login) ---
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "No .env found -- creating one for local development."
    $jwtSecret = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
    $passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*'
    $adminPassword = -join ((1..14) | ForEach-Object { $passwordChars[(Get-Random -Maximum $passwordChars.Length)] })
    @"
JWT_SECRET=$jwtSecret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$adminPassword
"@ | Set-Content -Path $envFile -Encoding utf8

    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Yellow
    Write-Host " Created .env with a generated dev admin login (also saved in .env):" -ForegroundColor Yellow
    Write-Host "   username: admin"
    Write-Host "   password: $adminPassword"
    Write-Host "=================================================================" -ForegroundColor Yellow
    Write-Host ""
}

# Load .env into this process's environment so migrate/seed/uvicorn inherit it.
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $key, $value = $_ -split '=', 2
    [System.Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim())
}

# --- 4. Migrate + seed ---
Write-Host "Running migrations..."
& $venvPython -m backend.migrate
Write-Host "Seeding default data..."
& $venvPython -m backend.seed

# --- 5. Launch backend + frontend, each in its own window ---
Write-Host "Starting backend (http://localhost:8000)..."
$backendProc = Start-Process -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "backend.main:app", "--reload", "--port", "8000" `
    -WorkingDirectory $root -PassThru -WindowStyle Normal

Write-Host "Starting frontend (http://localhost:5173)..."
$frontendProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev" `
    -WorkingDirectory "$root\frontend" -PassThru -WindowStyle Normal

@{ backendPid = $backendProc.Id; frontendPid = $frontendProc.Id } | ConvertTo-Json | Set-Content -Path $runStateFile

Write-Host ""
Write-Host "Rent Ledger is running in standalone mode:" -ForegroundColor Green
Write-Host "  App:      http://localhost:5173"
Write-Host "  API docs: http://localhost:8000/docs"
Write-Host ""
Write-Host "Backend and frontend are running in their own windows -- close them"
Write-Host "or run .\stop.ps1 to stop both."
