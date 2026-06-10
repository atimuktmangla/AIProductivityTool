@echo off
::
:: sync-delta-users.cmd
::
:: Queues background sync for team members NOT in SQLite cache (rolling 90 days).
:: Delta = cache miss only; already-cached users are skipped.
::
:: Team list: data\sync-config.json (UI) or SYNC_DEVELOPER_IDS in .env — both git-ignored
:: Requires API server running: npm run dev
::
:: Usage:
::   sync-delta-users.cmd              - check cache, queue uncached users
::   sync-delta-users.cmd background   - same, detached (log: logs\sync-delta.log)
::   schedule-delta-sync.cmd           - for Windows Task Scheduler (log: logs\schedule-delta-sync.log)
::   sync-delta-users.cmd persist      - also save team to data\sync-config.json
::

setlocal
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "LOG_DIR=%PROJECT_ROOT%\logs"
set "LOG_FILE=%LOG_DIR%\sync-delta.log"

if /I "%~1"=="background" goto :background
if /I "%~1"=="persist" goto :persist
if /I "%~1"=="background-persist" goto :background_persist

powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%SCRIPT_DIR%sync-delta-users.ps1"
exit /b %ERRORLEVEL%

:persist
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%SCRIPT_DIR%sync-delta-users.ps1" -PersistConfig
exit /b %ERRORLEVEL%

:background_persist
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
start "" /MIN powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden ^
  -File "%SCRIPT_DIR%sync-delta-users.ps1" -PersistConfig >> "%LOG_FILE%" 2>&1
echo Delta sync started in background (uncached users only). Log: %LOG_FILE%
exit /b 0

:background
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
start "" /MIN powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden ^
  -File "%SCRIPT_DIR%sync-delta-users.ps1" >> "%LOG_FILE%" 2>&1
echo Delta sync started in background (uncached users only). Log: %LOG_FILE%
exit /b 0
