#Requires -Version 5.1
<#
.SYNOPSIS
    Fetches all Bitbucket users and triggers a background sync for all of them.
    Calls POST /api/dashboard/sync/trigger-all — returns immediately (HTTP 202).
    Exit code 0 = queued or already running (409), Exit code 1 = error.

.EXAMPLE
    .\scripts\sync-all.ps1
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    Write-Warning "API_KEY not set in .env - request may be rejected with 401"
}

$url     = "http://localhost:$port/api/dashboard/sync/trigger-all"
$headers = @{ 'Content-Type' = 'application/json' }
if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Triggering sync for all Bitbucket users ..."

try {
    $response = Invoke-WebRequest `
        -Uri $url `
        -Method POST `
        -Headers $headers `
        -Body '{}' `
        -UseBasicParsing `
        -TimeoutSec 30

    $body = $response.Content | ConvertFrom-Json
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync queued. Total users: $($body.total)."
    Write-Host "Monitor progress: GET http://localhost:$port/api/dashboard/sync/status"
    Write-Host "Stop at any time: scripts\stop-sync.cmd"
    exit 0
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status  = [int]$_.Exception.Response.StatusCode
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = [System.IO.StreamReader]::new($stream)
        $errBody = $reader.ReadToEnd()

        if ($status -eq 409) {
            Write-Host "Sync already running. Use stop-sync.cmd to cancel first."
            exit 0
        }
        if ($status -eq 401) {
            Write-Error "401 Unauthorized - check API_KEY in .env"
        } else {
            Write-Error "HTTP $status - $errBody"
        }
    } else {
        Write-Error "Cannot reach $url. Is the server running?"
    }
    exit 1
}
catch {
    Write-Error "Unexpected error: $($_.Exception.Message)"
    exit 1
}
