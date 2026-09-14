@echo off
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%~dp0sync-status.ps1"
exit /b %ERRORLEVEL%
