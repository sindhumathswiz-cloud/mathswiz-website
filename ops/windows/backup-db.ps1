# Backs up the live database (Supabase Postgres) to this PC with pg_dump, keeping the 14 newest backups.
# The free Supabase plan keeps no backups of its own, so these are the only copies.
#
#   Back up now:            powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\backup-db.ps1"
#   Schedule it nightly:    ... backup-db.ps1 -Register        (task "Mathswiz Database Backup", 02:00 every day)
#
# Each backup is one file, mathswiz-YYYY-MM-DD_HHmm.dump (pg_dump custom format, compressed), of the "public" schema:
# every table the app uses. Supabase's own auth and storage schemas are not used by the app and are left out.
# After writing a backup the script reads its table of contents back with pg_restore, so a cut-off file is caught.
# How to restore: see README.md in this folder.

param(
    [switch]$Register,
    [string]$Destination = 'D:\Mathswiz Backups',
    [int]$Keep = 14,
    [string]$PgBin = 'D:\Mathswiz WebAppln\tools\pgsql\bin',
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\..\frontend\.env.local')
)

$ErrorActionPreference = 'Stop'

if ($Register) {
    $user = "$env:USERDOMAIN\$env:USERNAME"
    $action = New-ScheduledTaskAction -Execute 'conhost.exe' `
        -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
    # StartWhenAvailable: if the PC was off or asleep at 02:00, the backup runs as soon as it is back.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName 'Mathswiz Database Backup' -Force -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal `
        -Description "Backs up the live Mathswiz database to $Destination every night. See ops\windows\README.md." | Out-Null
    Write-Host "Registered 'Mathswiz Database Backup' (daily 02:00) -> $PSCommandPath"
    return
}

New-Item -ItemType Directory -Force $Destination | Out-Null
$log = Join-Path $Destination 'backup.log'
function Write-Log([string]$message) {
    $line = "[$(Get-Date -Format s)] $message"
    $line | Out-File $log -Append -Encoding utf8
    Write-Host $line
}

try {
    $pgDump = Join-Path $PgBin 'pg_dump.exe'
    $pgRestore = Join-Path $PgBin 'pg_restore.exe'
    if (-not (Test-Path $pgDump)) { throw "pg_dump not found at $pgDump" }

    # Connection details come from the live settings file; the password goes to pg_dump through PGPASSWORD,
    # never on its command line.
    $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if (-not $line) { throw "DATABASE_URL not found in $EnvFile" }
    $url = [Uri](($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'"))
    $userInfo = $url.UserInfo.Split(':', 2)
    $env:PGHOST = $url.Host
    $env:PGPORT = if ($url.Port -gt 0) { "$($url.Port)" } else { '5432' }
    $env:PGUSER = [Uri]::UnescapeDataString($userInfo[0])
    $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1])
    $env:PGDATABASE = $url.AbsolutePath.TrimStart('/')
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '30'

    $file = Join-Path $Destination ('mathswiz-{0:yyyy-MM-dd_HHmm}.dump' -f (Get-Date))
    $partial = "$file.partial"
    Write-Log "starting backup to $file"
    # Windows PowerShell turns a native program's messages on stderr into errors; under 'Stop' the first warning
    # from pg_dump would abort the backup. Its exit code is what decides success.
    $ErrorActionPreference = 'Continue'
    & $pgDump --format=custom --compress=6 --schema=public --no-owner --no-privileges --file=$partial 2>&1 |
        ForEach-Object { Write-Log "pg_dump: $_" }
    $dumpExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($dumpExit -ne 0) { throw "pg_dump failed (exit $dumpExit)" }

    $tables = (& $pgRestore --list $partial | Select-String ' TABLE DATA public ').Count
    if ($LASTEXITCODE -ne 0 -or $tables -eq 0) { throw "the backup file could not be read back (pg_restore exit $LASTEXITCODE)" }
    Move-Item $partial $file -Force
    Write-Log ("done: {0:N1} MB, {1} tables" -f ((Get-Item $file).Length / 1MB), $tables)

    Get-ChildItem $Destination -Filter 'mathswiz-*.dump' | Sort-Object Name -Descending | Select-Object -Skip $Keep |
        ForEach-Object { Remove-Item $_.FullName; Write-Log "removed old backup $($_.Name)" }
    exit 0
} catch {
    Write-Log "FAILED: $($_.Exception.Message)"
    Get-ChildItem $Destination -Filter '*.partial' -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
    exit 1
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
