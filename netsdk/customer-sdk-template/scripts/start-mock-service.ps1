param(
    [string]$HostName = "127.0.0.1",
    [int]$HttpPort = 19345,
    [int]$WsPort = 19399,
    [switch]$OpenDebugPage
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serviceDir = Join-Path $sdkRoot "mock-service"
$pidFile = Join-Path $sdkRoot ".mock-service.pid"
$logFile = Join-Path $sdkRoot "mock-service.log"

function Get-PortOwner {
    param([int]$Port)
    Get-NetTCPConnection -LocalAddress $HostName -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

if (-not (Test-Path -LiteralPath (Join-Path $serviceDir "mock-service.js"))) {
    throw "Mock service is missing: $serviceDir"
}

$owners = @()
$owners += Get-PortOwner -Port $HttpPort
$owners += Get-PortOwner -Port $WsPort
$owners = $owners | Where-Object { $_ } | Select-Object -Unique

if ($owners.Count -gt 0) {
    Write-Host "Port is already in use. Stop it first:" -ForegroundColor Yellow
    foreach ($owner in $owners) {
        Write-Host "  Stop-Process -Id $owner -Force"
    }
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $serviceDir "node_modules"))) {
    Push-Location $serviceDir
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

$command = "cd /d `"$serviceDir`" && set `"JQTOOLS_MOCK_HOST=$HostName`" && set `"JQTOOLS_MOCK_HTTP_PORT=$HttpPort`" && set `"JQTOOLS_MOCK_WS_PORT=$WsPort`" && npm start > `"$logFile`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru
$process.Id | Set-Content -LiteralPath $pidFile -Encoding ASCII

Start-Sleep -Milliseconds 800

Write-Host "Mock service started."
Write-Host "PID: $($process.Id)"
Write-Host "HTTP: http://${HostName}:${HttpPort}"
Write-Host "WS: ws://${HostName}:${WsPort}"

if ($OpenDebugPage) {
    Start-Process "http://${HostName}:${HttpPort}/debug"
}
