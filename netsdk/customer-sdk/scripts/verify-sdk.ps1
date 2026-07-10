param(
    [string]$HostName = "127.0.0.1",
    [int]$HttpPort = 19545,
    [int]$WsPort = 19599,
    [switch]$IncludeWpfSmokeTest
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serviceDir = Join-Path $sdkRoot "mock-service"
$appExe = Join-Path $sdkRoot "app\JqTools.CarAdaptive.ClientWpf.exe"
$wpfDll = Join-Path $sdkRoot "wpf-control\JqTools.CarAdaptive.Wpf.dll"
$nativeDll = Join-Path $sdkRoot "native-dll\JqToolsCarAdaptiveNative.dll"
$apiDoc = Join-Path $sdkRoot "docs\FAKE_API.md"
$logFile = Join-Path $sdkRoot "verify-mock-service.log"

function Assert-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required file missing: $Path"
    }
    Write-Host "[OK] $Path"
}

function Stop-TestPorts {
    Get-NetTCPConnection -LocalAddress $HostName -LocalPort $HttpPort,$WsPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host "Checking customer SDK files..."
Assert-File $appExe
Assert-File $wpfDll
Assert-File $nativeDll
Assert-File (Join-Path $serviceDir "mock-service.js")
Assert-File $apiDoc

Stop-TestPorts

$process = $null
try {
    $command = "cd /d `"$serviceDir`" && set `"JQTOOLS_MOCK_HOST=$HostName`" && set `"JQTOOLS_MOCK_HTTP_PORT=$HttpPort`" && set `"JQTOOLS_MOCK_WS_PORT=$WsPort`" && node mock-service.js > `"$logFile`" 2>&1"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 1

    $health = Invoke-RestMethod "http://${HostName}:${HttpPort}/health"
    if ($health.code -ne 0) {
        throw "Health check failed."
    }
    Write-Host "[OK] HTTP /health"

    Invoke-RestMethod -Method Post "http://${HostName}:${HttpPort}/fake/connect" | Out-Null
    Write-Host "[OK] HTTP /fake/connect"

    Push-Location $serviceDir
    try {
        $nodeCode = @"
const WebSocket = require('ws');
const out = [];
const ws = new WebSocket('ws://${HostName}:${WsPort}');
ws.on('message', (message) => {
  const data = JSON.parse(message);
  out.push({
    keys: Object.keys(data),
    sitLen: data.sitData?.carAir?.arr?.length || 0,
    feedLen: data.algorFeed?.length || 0,
    sensorLen: data.algorData?.sensor_data_144?.length || 0,
    commandLen: data.algorData?.control_command?.length || 0
  });
  const hasSit = out.some((item) => item.sitLen === 144);
  const hasFeed = out.some((item) => item.feedLen === 24);
  const hasAlgor = out.some((item) => item.sensorLen === 144 && item.commandLen === 51);
  if (hasSit && hasFeed && hasAlgor) {
    console.log(JSON.stringify(out, null, 2));
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => {
  console.log(JSON.stringify(out, null, 2));
  process.exit(2);
}, 5000);
"@
        node -e $nodeCode
        if ($LASTEXITCODE -ne 0) {
            throw "WebSocket protocol verification failed."
        }
    }
    finally {
        Pop-Location
    }
    Write-Host "[OK] WebSocket real protocol: {}, sitData(144), algorFeed(24), algorData(144/51)"

    if ($IncludeWpfSmokeTest) {
        $wpf = Start-Process -FilePath $appExe -WorkingDirectory (Split-Path $appExe -Parent) -PassThru
        Start-Sleep -Seconds 5
        $running = Get-Process -Id $wpf.Id -ErrorAction SilentlyContinue
        if (-not $running) {
            throw "WPF app exited during smoke test."
        }
        Stop-Process -Id $wpf.Id -Force
        Write-Host "[OK] WPF app smoke test"
    }

    Write-Host "CUSTOMER_SDK_VERIFY_OK"
}
finally {
    Stop-TestPorts
    if ($process) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}
