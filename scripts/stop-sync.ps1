#Requires -Version 5.1
<#
.SYNOPSIS
    Cancels the currently running background sync job.
    Calls DELETE /api/dashboard/sync/run.
    Exit code 0 = cancelled (or nothing was running), Exit code 1 = error.

.EXAMPLE
    .\scripts\stop-sync.ps1
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

$url     = "http://localhost:$port/api/dashboard/sync/run"
$headers = @{ 'Content-Type' = 'application/json' }
if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

try {
    $response = Invoke-WebRequest `
        -Uri $url `
        -Method DELETE `
        -Headers $headers `
        -UseBasicParsing `
        -TimeoutSec 10

    $body = $response.Content | ConvertFrom-Json
    Write-Host "Stop requested. $($body.detail)"
    exit 0
}
catch [System.Net.WebException] {
    if ($_.Exception.Response) {
        $status  = [int]$_.Exception.Response.StatusCode
        $stream  = $_.Exception.Response.GetResponseStream()
        $reader  = [System.IO.StreamReader]::new($stream)
        $errBody = $reader.ReadToEnd()
        if ($status -eq 404) {
            Write-Host "No sync is currently running."
            exit 0
        }
        Write-Error "HTTP $status - $errBody"
    } else {
        Write-Error "Cannot reach $url. Is the server running?"
    }
    exit 1
}
catch {
    Write-Error "Unexpected error: $($_.Exception.Message)"
    exit 1
}
