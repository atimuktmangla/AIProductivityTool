$lines = [System.IO.File]::ReadAllLines('c:\sumtotal\MyProjects\AIProductivityTool\scripts\warm-cache.ps1')
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
