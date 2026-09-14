@echo off
::
:: run-sync.cmd
::
:: Thin CMD wrapper for run-sync.ps1.
:: Use this file as the Task Scheduler action so no PowerShell
:: execution-policy changes are needed on the host.
::
:: Task Scheduler setup:
::   Program : cmd.exe
::   Arguments: /c "%~dp0run-sync.cmd"
::   Start in : (leave blank - script resolves its own root)
::
powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "%~dp0run-sync.ps1"
exit /b %ERRORLEVEL%
