@echo off
rem Usage:
rem   start-dev.cmd          — start dev servers (default)
rem   start-dev.cmd -Test    — run all tests and exit
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
