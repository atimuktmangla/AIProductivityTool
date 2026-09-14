@echo off
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%~dp0sync-all.ps1"
exit /b %ERRORLEVEL%
