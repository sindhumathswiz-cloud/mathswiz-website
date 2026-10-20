@echo off
rem Run by the Windows scheduled task "Mathswiz content sync" every six hours.
rem Publishes approved staging changes to live and copies live changes down (conflicts are never overwritten),
rem then appends what it did to frontend\logs\content-sync.log. Run it by hand to test the task.
cd /d "%~dp0.."
if not exist logs mkdir logs
echo ==== %DATE% %TIME% >> logs\content-sync.log
call npm.cmd run content:sync -- --apply --by=schedule >> logs\content-sync.log 2>&1
echo exit code %ERRORLEVEL% >> logs\content-sync.log
