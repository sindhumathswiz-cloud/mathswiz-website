# Creates (or replaces) the two scheduled tasks that keep the live site up on this PC. Run it once as the signed-in
# user (no admin needed), again after moving the live copy:
#
#   powershell -ExecutionPolicy Bypass -File "D:\Mathswiz WebAppln\mathswiz-live\ops\windows\register-tasks.ps1"
#
# Each task:
#  - runs its script through "conhost --headless", so there is no window at all. A plain hidden PowerShell can still
#    end up in a visible terminal window, and closing that window stops the site.
#  - starts at logon, and also every 5 minutes as a watchdog. While the script is running the extra start is ignored;
#    if the script was stopped, it starts again.
#  - may run on battery, never times out, and is not stopped when the watchdog's own schedule ends.
# Running instances are stopped and started again under the new settings (a few seconds of downtime).

$ErrorActionPreference = 'Stop'
$scripts = $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"

$tasks = @(
    @{ Name = 'Mathswiz Live Site'; Script = 'start-live.ps1'
       Description = 'Runs the live Mathswiz site (port 3000) from the live copy of the code. See ops\windows\README.md.' },
    @{ Name = 'Mathswiz Tunnel'; Script = 'start-tunnel.ps1'
       Description = 'Connects www.sindhusmathswizclasses.com to the live Mathswiz site on this PC (Cloudflare Tunnel). See ops\windows\README.md.' }
)

foreach ($t in $tasks) {
    $script = Join-Path $scripts $t.Script
    $action = New-ScheduledTaskAction -Execute 'conhost.exe' `
        -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`""

    $atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
    $watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $watchdog.Repetition.StopAtDurationEnd = $false

    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

    if (Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $t.Name
        Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
    }
    Register-ScheduledTask -TaskName $t.Name -Description $t.Description -Action $action `
        -Trigger $atLogon, $watchdog -Settings $settings -Principal $principal | Out-Null
    Write-Host "Registered '$($t.Name)' -> $($t.Script)"
}

# Stopping a task does not always stop what its script started: free the port and end any old tunnel before starting.
$port = if ($env:MATHSWIZ_LIVE_PORT) { $env:MATHSWIZ_LIVE_PORT } else { '3000' }
netstat -ano | Select-String 'LISTENING' | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } |
    Select-Object -Unique | ForEach-Object { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'start-(live|tunnel)\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($t in $tasks) { Start-ScheduledTask -TaskName $t.Name }
Write-Host 'Both tasks started.'
