#Requires -Version 5.1
<#
.SYNOPSIS
    Triggers a delta cache warm-up for the AI Productivity Tool.
    Calls POST /api/dashboard/sync/warmup and prints a summary.
    Exit code 0 = success (HTTP 2xx), Exit code 1 = error.

.DESCRIPTION
    Reads PORT and API_KEY from a .env file in the project root.
    Falls back to localhost:3000 if the file is absent or the key is unset.

.EXAMPLE
    .\scripts\warm-cache.ps1
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve project root (one level up from scripts/)
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$envFile     = Join-Path $projectRoot '.env'

# Parse .env file
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
        if ($k -eq 'PORT' -or $k -eq 'VITE_DEV_PORT') {
            $parsed = 0
            if ([int]::TryParse($v, [ref]$parsed) -and $parsed -gt 0) {
                $port = $parsed
            }
        }
        if ($k -eq 'API_KEY' -or $k -eq 'VITE_API_KEY') {
            $apiKey = $v
        }
    }
} else {
    Write-Warning "No .env file found at $envFile - using defaults (localhost:$port, no API key)"
}

# Call the warmup endpoint
$url = "http://127.0.0.1:$port/api/dashboard/sync/warmup"

try {
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

    $response = Invoke-WebRequest `
        -Uri $url `
        -Method POST `
        -Headers $headers `
        -Body '{}' `
        -UseBasicParsing `
        -TimeoutSec 30

    $body = $response.Content | ConvertFrom-Json

    if ($body.queued -eq 0) {
        Write-Host "Skipped: $($body.skipped) (cached). Queued: 0. Nothing to warm."
    } else {
        Write-Host "Skipped: $($body.skipped) (cached). Queued: $($body.queued) - $($body.queuedUsers -join ', ')."
    }
    exit 0
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = [System.IO.StreamReader]::new($stream)
        $errBody = $reader.ReadToEnd()
        if ($status -eq 409) {
            # Sync already running - not a failure for a scheduled job
            try   { $runId = ($errBody | ConvertFrom-Json).runId }
            catch { $runId = 'unknown' }
            Write-Host "Sync already running (runId=$runId). Skipping warm-up."
            exit 0
        }
        Write-Error "HTTP $status - $errBody"
    } else {
        Write-Error "Unable to connect to $url. Is the server running?"
    }
    exit 1
}
catch {
    Write-Error "Unexpected error: $($_.Exception.Message)"
    exit 1
}
