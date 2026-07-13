param(
    [string]$HostName = "127.0.0.1",
    [string]$Ports = "19245,19999"
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$pidFile = Join-Path $sdkRoot ".mock-service.pid"
$processIds = @()

if (Test-Path -LiteralPath $pidFile) {
    $savedPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($savedPid -match "^\d+$") {
        $processIds += [int]$savedPid
    }
}

$portList = $Ports -split "," |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ } |
    ForEach-Object { [int]$_ }

foreach ($port in $portList) {
    $processIds += Get-NetTCPConnection -LocalAddress $HostName -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

$processIds = $processIds | Where-Object { $_ } | Select-Object -Unique

foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Stopping PID $processId ($($process.ProcessName))"
        Stop-Process -Id $processId -Force
    }
}

if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
}

Write-Host "Mock service stopped."
