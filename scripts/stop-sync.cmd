@echo off
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%~dp0stop-sync.ps1"
exit /b %ERRORLEVEL%
