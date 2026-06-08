#Requires -Version 5.1
<#
.SYNOPSIS
    Prints the current background sync status.
    Calls GET /api/dashboard/sync/status.
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
}

$headers = @{}
if ($apiKey -ne '') { $headers['X-Api-Key'] = $apiKey }

try {
    $s = Invoke-RestMethod -Uri "http://localhost:$port/api/dashboard/sync/status" -Headers $headers -UseBasicParsing -TimeoutSec 10

    $state = if ($s.running) { 'RUNNING' } else { 'IDLE' }
    Write-Host "Status      : $state"
    Write-Host "Total users : $($s.totalSyncUsers)"
    Write-Host "Completed   : $($s.completedUsers.Count)"
    Write-Host "Failed      : $($s.failedUsers.Count)"

    if ($s.running) {
        $elapsed = if ($s.runStartedAt) { [math]::Round(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $s.runStartedAt) / 1000) } else { '?' }
        Write-Host "Elapsed     : ${elapsed}s"
        Write-Host "Active batch: $($s.activeUsers -join ', ')"
        if ($s.failedUsers.Count -gt 0) {
            Write-Host "Failed users: $($s.failedUsers -join ', ')"
        }
    } else {
        if ($s.lastRunAt) {
            $lastRun = [DateTimeOffset]::FromUnixTimeMilliseconds($s.lastRunAt).LocalDateTime.ToString('yyyy-MM-dd HH:mm:ss')
            Write-Host "Last run    : $lastRun"
        }
        if ($s.nextRunAt) {
            $nextRun = [DateTimeOffset]::FromUnixTimeMilliseconds($s.nextRunAt).LocalDateTime.ToString('yyyy-MM-dd HH:mm:ss')
            Write-Host "Next run    : $nextRun"
        }
        if ($s.failedUsers.Count -gt 0) {
            Write-Host "Failed users: $($s.failedUsers -join ', ')"
        }
    }
    exit 0
}
catch [System.Net.WebException] {
    Write-Error "Cannot reach server at localhost:$port. Is it running?"
    exit 1
}
catch {
    Write-Error "Unexpected error: $($_.Exception.Message)"
    exit 1
}
