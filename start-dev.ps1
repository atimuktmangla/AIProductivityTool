$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  AIProductivityTool - starting local dev environment"
Write-Host ""

# 1. Kill anything on 3000 or 5173
foreach ($port in @(3000, 5173)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -gt 0) {
            Write-Host "  [INFO] Killing PID $($c.OwningProcess) on port $port"
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}
Start-Sleep -Seconds 1

# 2. Check .env files
if (-not (Test-Path "$root\.env")) {
    Write-Host "  [ERROR] Missing $root\.env  -  copy .env.example and fill it in"
    Read-Host "Press Enter to exit"
    exit 1
}
if (-not (Test-Path "$root\UI\.env")) {
    Write-Host "  [ERROR] Missing $root\UI\.env  -  copy UI\.env.example and fill it in"
    Read-Host "Press Enter to exit"
    exit 1
}

# 3. Install dependencies if needed
if (-not (Test-Path "$root\node_modules")) {
    Write-Host "  [INFO] Running npm install (backend)..."
    Push-Location $root
    npm install
    Pop-Location
}
if (-not (Test-Path "$root\UI\node_modules")) {
    Write-Host "  [INFO] Running npm install (UI)..."
    Push-Location "$root\UI"
    npm install
    Pop-Location
}

# 4. Build server and UI
Write-Host "  [INFO] Building server..."
Push-Location $root
npm run build
Pop-Location

Write-Host "  [INFO] Building UI..."
Push-Location "$root\UI"
npm run build
Pop-Location

# 5. Start backend in a new window
Write-Host "  [INFO] Starting backend on http://localhost:3000 ..."
Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"cd '$root'; npm run dev`"" -WindowStyle Normal

Start-Sleep -Seconds 3

# 6. Start UI in a new window
Write-Host "  [INFO] Starting UI on http://localhost:5173 ..."
Start-Process powershell -ArgumentList "-NoProfile -NoExit -Command `"cd '$root\UI'; npm run dev`"" -WindowStyle Normal

Start-Sleep -Seconds 4

# 7. Open browser
Write-Host "  [INFO] Opening http://localhost:5173 ..."
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "  Both servers are running. Close their windows to stop them."
Write-Host ""
