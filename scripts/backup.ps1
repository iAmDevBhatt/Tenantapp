# Backs up both named volumes (SQLite DB + all uploaded files) to a single
# tar.gz on the host. Run from the machine hosting Docker Desktop.
#
# Usage: .\scripts\backup.ps1 [-OutDir .\backups]
param(
    [string]$OutDir = ".\backups"
)

$ErrorActionPreference = "Stop"

$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$project = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { Split-Path -Leaf (Get-Location) }
$dbVolume = "${project}_app_data"
$uploadsVolume = "${project}_uploads_data"
$outDirAbs = (Resolve-Path $OutDir).Path

Write-Host "Backing up volumes: $dbVolume, $uploadsVolume"

docker run --rm `
  -v "${dbVolume}:/data/app_data:ro" `
  -v "${uploadsVolume}:/data/uploads_data:ro" `
  -v "${outDirAbs}:/backup" `
  alpine sh -c "tar czf /backup/rentledger-backup-$stamp.tar.gz -C /data app_data uploads_data"

Write-Host "Backup written to $OutDir\rentledger-backup-$stamp.tar.gz"
