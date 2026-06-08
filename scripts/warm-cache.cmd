@echo off
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%~dp0warm-cache.ps1"
exit /b %ERRORLEVEL%
