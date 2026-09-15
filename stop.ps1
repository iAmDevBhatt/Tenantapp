# Stops the backend + frontend processes started by .\start.ps1 (standalone,
# no-Docker mode). Kills each process's full tree (uvicorn --reload and
# `npm run dev` both spawn child processes that a plain Stop-Process would
# leave orphaned).
#
# Usage: .\stop.ps1

$root = $PSScriptRoot
$runStateFile = Join-Path $root ".dev-run.json"

if (-not (Test-Path $runStateFile)) {
    Write-Host "No running instance found (.dev-run.json is missing) -- nothing to stop."
    Write-Host "If backend/frontend windows are still open, just close them directly."
    exit 0
}

$state = Get-Content $runStateFile | ConvertFrom-Json
$stoppedAny = $false

foreach ($entry in @(
    @{ name = "backend"; pid = $state.backendPid },
    @{ name = "frontend"; pid = $state.frontendPid }
)) {
    if (-not $entry.pid) { continue }
    $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Stopping $($entry.name) (PID $($entry.pid))..."
        # /T kills the whole process tree -- needed because uvicorn --reload
        # and `npm run dev` both spawn child processes that Stop-Process alone
        # would leave running.
        taskkill /PID $entry.pid /T /F 2>$null | Out-Null
        $stoppedAny = $true
    } else {
        Write-Host "$($entry.name) (PID $($entry.pid)) is not running."
    }
}

Remove-Item $runStateFile -ErrorAction SilentlyContinue

if ($stoppedAny) {
    Write-Host "Stopped." -ForegroundColor Green
} else {
    Write-Host "Nothing was running."
}
