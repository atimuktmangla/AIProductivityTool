$target = Join-Path $PSScriptRoot 'warm-cache.ps1'
$lines = [System.IO.File]::ReadAllLines($target)
for ($i=0; $i -lt $lines.Length; $i++) {
    $n = $i + 1
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($lines[$i])
    $hasHigh = $bytes | Where-Object { $_ -gt 127 }
    if ($hasHigh) {
        Write-Host "Line $n bytes: $($bytes -join ',')"
        Write-Host "  $($lines[$i])"
    }
}
Write-Host "Done. Total lines: $($lines.Length)"
