#Requires -Version 5.1
<#
.SYNOPSIS
    Triggers the background metrics sync for all configured developers.
    Designed for use in Windows Task Scheduler or any cron-equivalent.

.DESCRIPTION
    1. Reads PORT and API_KEY from the project-root .env file.
    2. Calls GET /api/dashboard/sync/config to retrieve the configured developer list.
    3. Posts to POST /api/dashboard/sync/trigger to start the background sync.

    Exit codes:
        0 - sync queued (202), or sync already running (409 - not an error in scheduled context)
        1 - configuration or connectivity error
        2 - no developers configured (nothing to do)

.EXAMPLE
    .\scripts\run-sync.ps1

.NOTES
    Schedule via Task Scheduler:
        Action : powershell.exe -ExecutionPolicy Bypass -File "C:\path\to\scripts\run-sync.ps1"
        Trigger: Daily at 06:00 (or match intervalMinutes in sync-config.json)
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Invoke-Api {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [string]$Body   = $null,
        [hashtable]$Headers
    )
    $params = @{
        Uri            = $Uri
        Method         = $Method
        Headers        = $Headers
        UseBasicParsing = $true
        TimeoutSec     = 30
    }
    if ($null -ne $Body -and $Method -ne 'GET') {
        $params['Body'] = $Body
    }
    return Invoke-WebRequest @params
}

# ---------------------------------------------------------------------------
# Resolve project root and parse .env
# ---------------------------------------------------------------------------

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$envFile     = Join-Path $projectRoot '.env'

$port   = 3000
$apiKey = ''

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        $parts = $line -split '=', 2
        if ($parts.Length -ne 2) { return }
        $k = $parts[0].Trim()
        $v = $parts[1].Trim().Trim('"').Trim("'")
        if ($k -eq 'PORT') {
            $parsed = 0
            if ([int]::TryParse($v, [ref]$parsed) -and $parsed -gt 0) { $port = $parsed }
        }
        if ($k -eq 'API_KEY') { $apiKey = $v }
    }
} else {
    Write-Warning "No .env found at $envFile - using defaults (localhost:$port, no API key)"
}

if ($apiKey -eq '') {
    Write-Warning "API_KEY is not set in .env - requests may be rejected with 401"
}

$baseUrl = "http://localhost:$port/api/dashboard/sync"
$headers = @{ 'Content-Type' = 'application/json' }
if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

# ---------------------------------------------------------------------------
# Step 1: fetch configured developer list
# ---------------------------------------------------------------------------

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Fetching sync config from $baseUrl/config ..."

try {
    $cfgResponse = Invoke-Api -Uri "$baseUrl/config" -Method GET -Headers $headers
    $config      = $cfgResponse.Content | ConvertFrom-Json
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -eq 401) {
            Write-Error "401 Unauthorized - check API_KEY in .env"
        } else {
            Write-Error "HTTP $status fetching sync config"
        }
    } else {
        Write-Error "Cannot reach $baseUrl/config. Is the server running?"
    }
    exit 1
}
catch {
    Write-Error "Unexpected error fetching config: $($_.Exception.Message)"
    exit 1
}

$developerIds = $config.developerIds
if ($null -eq $developerIds -or $developerIds.Count -eq 0) {
    Write-Host "No developers configured. Nothing to sync."
    exit 2
}

Write-Host "Configured developers ($($developerIds.Count)): $($developerIds -join ', ')"

# ---------------------------------------------------------------------------
# Step 2: trigger the sync
# ---------------------------------------------------------------------------

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Triggering sync for $($developerIds.Count) developer(s) ..."

$triggerBody = @{ developerIds = $developerIds } | ConvertTo-Json -Compress

try {
    $triggerResponse = Invoke-Api -Uri "$baseUrl/trigger" -Method POST -Body $triggerBody -Headers $headers
    $result = $triggerResponse.Content | ConvertFrom-Json
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync queued. queued=$($result.queued)"
    exit 0
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode

        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = [System.IO.StreamReader]::new($stream)
        $errBody = $reader.ReadToEnd()

        if ($status -eq 409) {
            # A sync is already running - this is normal when the scheduled interval
            # overlaps with a long-running previous sync. Exit 0 so Task Scheduler
            # does not flag it as a failure.
            try   { $detail = ($errBody | ConvertFrom-Json).runId }
            catch { $detail = $errBody }
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync already running (runId=$detail). Skipping."
            exit 0
        }

        if ($status -eq 401) {
            Write-Error "401 Unauthorized - check API_KEY in .env"
        } else {
            Write-Error "HTTP $status triggering sync - $errBody"
        }
    } else {
        Write-Error "Cannot reach $baseUrl/trigger. Is the server running?"
    }
    exit 1
}
catch {
    Write-Error "Unexpected error triggering sync: $($_.Exception.Message)"
    exit 1
}
