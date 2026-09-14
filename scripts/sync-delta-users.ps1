#Requires -Version 5.1
<#
.SYNOPSIS
    Queues background sync for team members missing from SQLite cache (rolling 90 days).

.DESCRIPTION
    "Delta users" = configured developers with NO metrics row in SQLite for the rolling
    90-day window. Cached users are skipped.

    Developer list comes from the server (data/sync-config.json or SYNC_DEVELOPER_IDS
    in .env) — nothing is stored in the repo.

    Calls POST /api/dashboard/sync/warmup; the server queues sync only for cache misses.

    Exit codes:
        0 - queued misses (202), all cached (200), or sync already running (409)
        1 - connectivity / auth error
        2 - no developers configured

.EXAMPLE
    .\scripts\sync-delta-users.ps1
    .\scripts\sync-delta-users.ps1 -PersistConfig
#>

param(
    [switch]$PersistConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Api {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [string]$Body   = $null,
        [hashtable]$Headers
    )
    $params = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        UseBasicParsing = $true
        TimeoutSec      = 30
    }
    if ($null -ne $Body -and $Method -ne 'GET') {
        $params['Body'] = $Body
    }
    return Invoke-WebRequest @params
}

function Read-DotEnv {
    param([string]$Path)
    $result = @{ PORT = 3000; API_KEY = '' }
    if (-not (Test-Path $Path)) { return $result }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        $parts = $line -split '=', 2
        if ($parts.Length -ne 2) { return }
        $k = $parts[0].Trim()
        $v = $parts[1].Trim().Trim('"').Trim("'")
        switch ($k) {
            'PORT' {
                $parsed = 0
                if ([int]::TryParse($v, [ref]$parsed) -and $parsed -gt 0) { $result.PORT = $parsed }
            }
            'API_KEY' { $result.API_KEY = $v }
        }
    }
    return $result
}

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$envFile     = Join-Path $projectRoot '.env'

$envVars  = Read-DotEnv -Path $envFile
$port     = $envVars.PORT
$apiKey   = $envVars.API_KEY
$hostAddr = '127.0.0.1'
$baseUrl  = "http://${hostAddr}:$port/api/dashboard/sync"

$headers = @{ 'Content-Type' = 'application/json' }
if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Delta sync - SQLite cache misses only (rolling 90 days)"

try {
    Invoke-Api -Uri "http://${hostAddr}:$port/health" -Method GET -Headers @{} | Out-Null
}
catch {
    Write-Error "API not reachable at http://${hostAddr}:$port - start the server first: npm run dev"
    exit 1
}

try {
    $config  = (Invoke-Api -Uri "$baseUrl/config" -Method GET -Headers $headers).Content | ConvertFrom-Json
    $teamIds = @($config.developerIds | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne '' })
}
catch {
    Write-Error "Failed to read sync config from $baseUrl/config"
    exit 1
}

if ($teamIds.Count -eq 0) {
    Write-Error @"
No developers configured. Set SYNC_DEVELOPER_IDS in .env (comma-separated) or save a team via Sync Jobs UI.
Config is stored in data/sync-config.json (git-ignored) — not in the repo.
"@
    exit 2
}

Write-Host "Configured developers ($($teamIds.Count)): $($teamIds -join ', ')"

if ($PersistConfig) {
    $intervalMinutes = if ($null -ne $config.intervalMinutes) { [int]$config.intervalMinutes } else { 1440 }
    $configBody = @{
        developerIds    = $teamIds
        intervalMinutes = $intervalMinutes
    } | ConvertTo-Json -Compress

    try {
        Invoke-Api -Uri "$baseUrl/config" -Method POST -Body $configBody -Headers $headers | Out-Null
        Write-Host "Persisted team to data/sync-config.json."
    }
    catch {
        Write-Warning "Failed to persist sync config: $($_.Exception.Message)"
    }
}

$warmupBody = @{ developerIds = $teamIds } | ConvertTo-Json -Compress

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Checking SQLite cache and queueing uncached users ..."

try {
    $response = Invoke-Api -Uri "$baseUrl/warmup" -Method POST -Body $warmupBody -Headers $headers
    $body     = $response.Content | ConvertFrom-Json

    if ($body.queued -eq 0) {
        Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] All $($body.skipped) developer(s) already in SQLite cache. Nothing queued."
    } else {
        Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Queued $($body.queued) uncached user(s): $($body.queuedUsers -join ', ')"
        Write-Host "Skipped $($body.skipped) already cached."
    }
    Write-Host "Monitor: GET http://${hostAddr}:$port/api/dashboard/sync/status"
    exit 0
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status  = [int]$_.Exception.Response.StatusCode
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = [System.IO.StreamReader]::new($stream)
        $errBody = $reader.ReadToEnd()

        if ($status -eq 409) {
            Write-Host "Sync already running. Use scripts\stop-sync.cmd to cancel first."
            exit 0
        }
        if ($status -eq 401) {
            Write-Error "401 Unauthorized - check API_KEY in .env"
        } else {
            Write-Error "HTTP $status - $errBody"
        }
    } else {
        Write-Error "Cannot reach $baseUrl/warmup"
    }
    exit 1
}
