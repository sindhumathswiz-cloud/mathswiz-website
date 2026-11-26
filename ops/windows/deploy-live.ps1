# Updates the live site to a commit (default: the local main branch) with a few seconds of downtime:
#  1. moves the live copy (the git worktree this script sits in) to that commit,
#  2. installs packages only if package-lock.json changed,
#  3. builds into whichever of .next-a / .next-b is not being served, while the current build keeps serving,
#  4. records the new build in frontend\.live-build and stops the running server; start-live.ps1 starts it again
#     from the new build within about five seconds.
# If the build fails, nothing is switched and the site keeps running the previous build.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\deploy-live.ps1"

param([string]$Ref = 'main')

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontend = Join-Path $root 'frontend'
$port = if ($env:MATHSWIZ_LIVE_PORT) { $env:MATHSWIZ_LIVE_PORT } else { '3000' }

function Invoke-Step([string]$label, [scriptblock]$step) {
    Write-Host "== $label"
    & $step
    if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE). The live site is unchanged." }
}

$lockBefore = (Get-FileHash (Join-Path $frontend 'package-lock.json')).Hash
# The build adds its folder to tsconfig.json; the live copy keeps no edits of its own, so they are discarded.
Invoke-Step "Move the live copy to $Ref" { git -C $root checkout --force --detach $Ref }
Write-Host ("   now at " + (git -C $root log --oneline -1))

Set-Location $frontend
if ((Get-FileHash 'package-lock.json').Hash -ne $lockBefore -or -not (Test-Path 'node_modules')) {
    Invoke-Step 'Install packages' { npm.cmd ci --no-audit --no-fund }
}
Invoke-Step 'Generate the database client' { npx.cmd prisma generate }

$current = if (Test-Path '.live-build') { (Get-Content '.live-build' -TotalCount 1).Trim() } else { '.next' }
$next = if ($current -eq '.next-a') { '.next-b' } else { '.next-a' }
$env:NEXT_DIST_DIR = $next
Invoke-Step "Build into $next (the site keeps serving $current)" { npm.cmd run build }
git -C $root checkout --force -- frontend/tsconfig.json 2>$null

Set-Content '.live-build' $next
$listener = netstat -ano | Select-String "LISTENING" | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1
if ($listener) {
    Write-Host "== Restart: stopping the server on port $port (pid $listener); start-live.ps1 brings it back on $next"
    Stop-Process -Id ([int]$listener) -Force
} else {
    Write-Host "== No server is running on port $port. Start it with start-live.ps1."
}
Write-Host 'Deployed.'
