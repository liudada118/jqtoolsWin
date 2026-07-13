param(
    [string]$HostName = "127.0.0.1",
    [int]$HttpPort = 19545,
    [int]$WsPort = 19599,
    [switch]$IncludeWpfSmokeTest,
    [switch]$ConnectSerial
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serviceDir = Join-Path $sdkRoot "mock-service"
$frontendDir = Join-Path $sdkRoot "frontend-build"
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
    Get-NetTCPConnection -LocalPort $HttpPort,$WsPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host "Checking customer SDK files..."
Assert-File $appExe
Assert-File $wpfDll
Assert-File $nativeDll
Assert-File (Join-Path $serviceDir "mock-service.js")
Assert-File (Join-Path $frontendDir "index.html")
Assert-File (Join-Path $frontendDir "model\seat2.glb")
Assert-File $apiDoc

Stop-TestPorts

$process = $null
try {
    $command = "cd /d `"$serviceDir`" && set `"JQTOOLS_MOCK_HOST=$HostName`" && set `"JQTOOLS_MOCK_HTTP_PORT=$HttpPort`" && set `"JQTOOLS_MOCK_WS_PORT=$WsPort`" && set `"JQTOOLS_MOCK_FRONTEND_DIR=$frontendDir`" && node mock-service.js > `"$logFile`" 2>&1"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 1

    $health = Invoke-RestMethod "http://${HostName}:${HttpPort}/health"
    if ($health.code -ne 0) {
        throw "Health check failed."
    }
    Write-Host "[OK] HTTP /health"

    $appPage = Invoke-WebRequest "http://${HostName}:${HttpPort}/app" -UseBasicParsing
    if ($appPage.StatusCode -ne 200 -or $appPage.Content -notmatch "JQTOOLS") {
        throw "Frontend /app verification failed."
    }
    Write-Host "[OK] HTTP /app current frontend"

    $modelHead = Invoke-WebRequest "http://${HostName}:${HttpPort}/model/seat2.glb" -Method Head -UseBasicParsing
    if ($modelHead.StatusCode -ne 200) {
        throw "Frontend model verification failed."
    }
    Write-Host "[OK] Three.js model asset /model/seat2.glb"

    $ports = Invoke-RestMethod "http://${HostName}:${HttpPort}/getPort"
    if ($ports.code -ne 0) {
        throw "Serial port list verification failed."
    }
    Write-Host "[OK] HTTP /getPort real serial backend"

    if ($ConnectSerial) {
        $connect = Invoke-RestMethod "http://${HostName}:${HttpPort}/connPort"
        if ($connect.code -ne 0) {
            throw "Serial connect failed: $($connect.message)"
        }
        Write-Host "[OK] HTTP /connPort real serial connect"
    }

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

    Write-Host "CUSTOMER_SDK_REAL_VERIFY_OK"
}
finally {
    Stop-TestPorts
    if ($process) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}
