@echo off
REM ============================================================
REM  AIProductivityTool - dev launcher (Windows)
REM  Backend (Express/tsx) on :3000, frontend (Vite) on :5173.
REM  Requires Node.js 20+ and a .env in this folder.
REM ============================================================
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo [WARN] No .env found. Copy the variables from README.md / .env.example first.
  echo        Required: JIRA_BASE_URL, JIRA_TOKEN, BITBUCKET_BASE_URL, BITBUCKET_TOKEN, API_KEY
  echo.
)

if not exist "node_modules" (
  echo [setup] Installing backend dependencies...
  call npm install || goto :err
)
if not exist "frontend\node_modules" (
  echo [setup] Installing frontend dependencies...
  pushd frontend & call npm install & popd
)

echo [start] Backend  -> http://localhost:3000
start "AIProductivityTool API" cmd /k "npm run dev"

echo [start] Frontend -> http://localhost:5173
start "AIProductivityTool UI" cmd /k "cd frontend && npm run dev"

timeout /t 4 >nul
start "" http://localhost:5173
echo [ok] Launched. Close the two terminal windows to stop.
goto :eof

:err
echo [ERROR] Dependency install failed. See output above.
exit /b 1
