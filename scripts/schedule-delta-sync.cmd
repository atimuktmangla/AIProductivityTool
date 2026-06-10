@echo off
::
:: schedule-delta-sync.cmd
::
:: For Windows Task Scheduler: sync only developers missing from SQLite (90-day window).
:: Does NOT use start /MIN — Task Scheduler already runs the job in the background.
::
:: PREREQUISITE: API server must be running (npm run dev or npm start).
::
:: ── Task Scheduler setup ─────────────────────────────────────────────────────
::
::   General
::     Name: AI Productivity Tool - Delta Sync
::     Run whether user is logged on or not (if server runs as service / at boot)
::
::   Triggers
::     Daily at 06:00 (or after your server start task)
::
::   Actions
::     Program/script : cmd.exe
::     Add arguments  : /c "C:\full\path\to\AIProductivityTool\scripts\schedule-delta-sync.cmd"
::     Start in       : C:\full\path\to\AIProductivityTool
::
::   Settings
::     If the task is already running: Do not start a new instance
::     Stop task if runs longer than: 4 hours (adjust for team size)
::
:: Logs: logs\schedule-delta-sync.log (under project root)
::
:: Related scripts:
::   run-sync.cmd           - sync ALL configured users (not cache-miss filter)
::   sync-delta-users.cmd   - same delta logic, interactive or start /MIN background
::

setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "LOG_DIR=%PROJECT_ROOT%\logs"
set "LOG_FILE=%LOG_DIR%\schedule-delta-sync.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo. >> "%LOG_FILE%"
echo ===== %DATE% %TIME% schedule-delta-sync ===== >> "%LOG_FILE%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive ^
  -File "%SCRIPT_DIR%sync-delta-users.ps1" >> "%LOG_FILE%" 2>&1

set "RC=%ERRORLEVEL%"
echo Exit code: %RC% >> "%LOG_FILE%"

exit /b %RC%
