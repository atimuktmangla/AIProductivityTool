@echo off
powershell.exe -ExecutionPolicy Bypass -File "%~dp0warm-cache.ps1"
exit /b %ERRORLEVEL%
