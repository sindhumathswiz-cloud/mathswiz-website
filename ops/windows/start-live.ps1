# Runs the live Mathswiz site from the live copy of the code (a git worktree beside the main checkout) and restarts
# it whenever it stops. Meant to be started once at logon; see README.md in this folder.
#
# The build it serves is the one deploy-live.ps1 last finished, named in frontend\.live-build (".next" if none yet).

$ErrorActionPreference = 'Continue'
# Read Node's output as UTF-8, so its log reads correctly.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$frontend = (Resolve-Path (Join-Path $PSScriptRoot '..\..\frontend')).Path
$port = if ($env:MATHSWIZ_LIVE_PORT) { $env:MATHSWIZ_LIVE_PORT } else { '3000' }
$logDir = Join-Path $frontend 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Location $frontend

while ($true) {
    $log = Join-Path $logDir ('live-{0:yyyy-MM-dd}.log' -f (Get-Date))
    # A server left running by an earlier copy of this script still serves the site: leave it, and check again later.
    if (netstat -ano | Select-String 'LISTENING' | Select-String ":$port\s") { Start-Sleep -Seconds 15; continue }
    $buildFile = Join-Path $frontend '.live-build'
    $build = if (Test-Path $buildFile) { (Get-Content $buildFile -TotalCount 1).Trim() } else { '.next' }
    $env:NEXT_DIST_DIR = $build
    $env:NODE_ENV = 'production'
    "[$(Get-Date -Format s)] starting on port $port from $build" | Out-File $log -Append -Encoding utf8
    # Plain UTF-8 text, so the log reads in any editor (PowerShell 5.1 would otherwise write UTF-16).
    & npm.cmd run start -- -p $port 2>&1 | ForEach-Object { "$_" } | Out-File $log -Append -Encoding utf8
    "[$(Get-Date -Format s)] stopped (exit $LASTEXITCODE); restarting in 5 seconds" | Out-File $log -Append -Encoding utf8
    Start-Sleep -Seconds 5
}
