# Connects www.sindhusmathswizclasses.com (and the bare domain) to the live site on this PC through Cloudflare
# Tunnel, and reconnects whenever cloudflared stops. Started at logon by the scheduled task "Mathswiz Tunnel".
#
# The tunnel ("mathswiz") and its routes are set in %USERPROFILE%\.cloudflared\config.yml; its credentials sit
# beside it and never go into the repo.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$logDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..\frontend')).Path 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

while ($true) {
    $log = Join-Path $logDir ('tunnel-{0:yyyy-MM-dd}.log' -f (Get-Date))
    "[$(Get-Date -Format s)] starting the tunnel" | Out-File $log -Append -Encoding utf8
    & $cloudflared tunnel --no-autoupdate run mathswiz 2>&1 | ForEach-Object { "$_" } | Out-File $log -Append -Encoding utf8
    "[$(Get-Date -Format s)] tunnel stopped (exit $LASTEXITCODE); restarting in 10 seconds" | Out-File $log -Append -Encoding utf8
    Start-Sleep -Seconds 10
}
