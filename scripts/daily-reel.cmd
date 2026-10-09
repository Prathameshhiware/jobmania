@echo off
REM Builds today's reel and uploads it, so the phone can fetch it from the site.
REM
REM This is what Windows Task Scheduler runs. It exists because the scheduler
REM cannot call npm directly: npm is a shell script, so it needs cmd around
REM it, and the working directory has to be set explicitly or node resolves
REM nothing.
REM
REM Register it to run every morning at 08:30 with:
REM
REM   Register-ScheduledTask -TaskName "JoBmania daily reel" -Action (
REM     New-ScheduledTaskAction -Execute "<this file>") -Trigger (
REM     New-ScheduledTaskTrigger -Daily -At 08:30)
REM
REM Remove it again with:
REM
REM   schtasks /delete /tn "JoBmania daily reel" /f
REM
REM The machine has to be awake at that time. Nothing is lost if it is not —
REM the next run picks up from the same history and simply covers whatever
REM has gone longest without a turn.
REM
REM The reel lands at jobmania.dpdns.org/social/today.

setlocal
cd /d "%~dp0.."

echo [%date% %time%] building daily reel >> "%~dp0..\.reel-log.txt"
call npm run reel:deliver >> "%~dp0..\.reel-log.txt" 2>&1

if errorlevel 1 (
  echo [%date% %time%] FAILED with code %errorlevel% >> "%~dp0..\.reel-log.txt"
  exit /b %errorlevel%
)

echo [%date% %time%] done >> "%~dp0..\.reel-log.txt"
endlocal
