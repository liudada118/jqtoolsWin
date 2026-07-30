param(
    [string]$HostName = "127.0.0.1",
    [int]$HttpPort = 19245,
    [int]$WsPort = 19999,
    [string]$RemoteControlToken = "",
    [string]$HomeUrl = "",
    [switch]$OpenDebugPage,
    [switch]$OpenRemoteControlPage
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serviceDir = Join-Path $sdkRoot "mock-service"
$frontendDir = Join-Path $sdkRoot "frontend-build"
$realBackendDir = Join-Path $sdkRoot "real-backend"
$nodeExe = Join-Path $sdkRoot "runtime\node\node.exe"
$pidFile = Join-Path $sdkRoot ".mock-service.pid"
$logFile = Join-Path $sdkRoot "mock-service.log"

function Get-PortOwner {
    param([int]$Port)
    Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

if (-not (Test-Path -LiteralPath (Join-Path $serviceDir "mock-service.js"))) {
    throw "Mock service is missing: $serviceDir"
}
if (-not (Test-Path -LiteralPath $nodeExe)) {
    throw "Bundled Node.js is missing: $nodeExe"
}
if (
    -not (
        (
            (Test-Path -LiteralPath (Join-Path $realBackendDir "backend-host.exe")) -and
            (Test-Path -LiteralPath (Join-Path $realBackendDir "backend.jqpack"))
        ) -or
        (Test-Path -LiteralPath (Join-Path $realBackendDir "server\serialServer.js"))
    )
) {
    throw "Standalone real backend is missing: $realBackendDir"
}

$owners = @()
$owners += Get-PortOwner -Port $HttpPort
$owners += Get-PortOwner -Port $WsPort
$owners = $owners | Where-Object { $_ -gt 0 } | Select-Object -Unique

if ($owners.Count -gt 0) {
    Write-Host "Port is already in use. Stop it first:" -ForegroundColor Yellow
    foreach ($owner in $owners) {
        Write-Host "  Stop-Process -Id $owner -Force"
    }
    exit 1
}

$command = "cd /d `"$serviceDir`" && set `"JQTOOLS_REAL_BACKEND_ROOT=$realBackendDir`" && set `"JQTOOLS_MOCK_HOST=$HostName`" && set `"JQTOOLS_MOCK_HTTP_PORT=$HttpPort`" && set `"JQTOOLS_MOCK_WS_PORT=$WsPort`" && set `"JQTOOLS_MOCK_FRONTEND_DIR=$frontendDir`" && set `"JQTOOLS_REMOTE_CONTROL_TOKEN=$RemoteControlToken`" && set `"JQTOOLS_HOME_URL=$HomeUrl`" && `"$nodeExe`" mock-service.js > `"$logFile`" 2>&1"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru
$process.Id | Set-Content -LiteralPath $pidFile -Encoding ASCII

Start-Sleep -Milliseconds 800

Write-Host "Mock service started."
Write-Host "PID: $($process.Id)"
Write-Host "HTTP: http://${HostName}:${HttpPort}"
Write-Host "WS: ws://${HostName}:${WsPort}"
Write-Host "Same UI controller: http://${HostName}:${HttpPort}/app?remoteControl=1&showTitle=1"
Write-Host "Remote control: http://${HostName}:${HttpPort}/app#/remote-control"

if ($OpenDebugPage) {
    Start-Process "http://${HostName}:${HttpPort}/app"
}

if ($OpenRemoteControlPage) {
    Start-Process "http://${HostName}:${HttpPort}/app#/remote-control"
}
