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
$realBackendDir = Join-Path $sdkRoot "real-backend"
$customerSeatModelFileName = 'FAST27-' +
    [char]0x524D +
    [char]0x6392 +
    [char]0x5EA7 +
    [char]0x6905 +
    '.glb'
$customerSeatModel = Join-Path $frontendDir (Join-Path "model" $customerSeatModelFileName)
$nodeExe = Join-Path $sdkRoot "runtime\node\node.exe"
$appExe = Join-Path $sdkRoot "app\JqTools.CarAdaptive.ClientWpf.exe"
$wpfDll = Join-Path $sdkRoot "wpf-control\JqTools.CarAdaptive.Wpf.dll"
$nativeDll = Join-Path $sdkRoot "native-dll\JqToolsCarAdaptiveNative.dll"
$apiDoc = Join-Path $sdkRoot "docs\API.md"
$quickStartDoc = Join-Path $sdkRoot "docs\QUICKSTART.md"
$realApiDoc = Join-Path $sdkRoot "docs\REAL_API.md"
$logFile = Join-Path ([System.IO.Path]::GetTempPath()) "jqtools-customer-sdk-verify-$PID.log"
$verificationHomeUrl = "http://customer.local/home"

function Assert-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required file missing: $Path"
    }
    Write-Host "[OK] $Path"
}

function Assert-PathMissing {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        throw "Plaintext first-party source must not be shipped: $Path"
    }
    Write-Host "[OK] source removed: $Path"
}

function Stop-TestPorts {
    Get-NetTCPConnection -LocalPort $HttpPort,$WsPort -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -gt 0 } |
        ForEach-Object { Start-Process -FilePath taskkill.exe -ArgumentList "/PID", $_, "/T", "/F" -WindowStyle Hidden -Wait | Out-Null }
}

function Wait-ServiceHealth {
    param([int]$TimeoutSeconds = 20)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = "service did not return a response"
    do {
        try {
            $health = Invoke-RestMethod "http://${HostName}:${HttpPort}/health" -TimeoutSec 2
            if ($health.code -eq 0) {
                return $health
            }
            $lastError = "health code was $($health.code)"
        } catch {
            $lastError = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    throw "Service health check timed out after ${TimeoutSeconds}s: $lastError"
}

function Invoke-AlgorithmFrame {
    param(
        [int]$SensorId,
        [object[]]$SensorData
    )

    $body = @{
        sensorId = $SensorId
        sensorData = $SensorData
        writeSerial = $false
    } | ConvertTo-Json -Depth 4 -Compress

    return Invoke-RestMethod `
        -Uri "http://${HostName}:${HttpPort}/carAdaptive/processFrame" `
        -Method Post `
        -ContentType "application/json; charset=utf-8" `
        -Body $body
}

function Receive-WebSocketText {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [System.Threading.CancellationToken]$CancellationToken
    )

    $buffer = New-Object byte[] 1048576
    $offset = 0
    do {
        $segment = [System.ArraySegment[byte]]::new($buffer, $offset, $buffer.Length - $offset)
        $result = $Socket.ReceiveAsync($segment, $CancellationToken).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw "WebSocket closed before dual sensor data arrived."
        }
        $offset += $result.Count
    } while (-not $result.EndOfMessage)

    return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $offset)
}

function Send-WebSocketJson {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [object]$Payload,
        [System.Threading.CancellationToken]$CancellationToken
    )

    $json = $Payload | ConvertTo-Json -Depth 8 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    [void]$Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        $CancellationToken
    ).GetAwaiter().GetResult()
}

Write-Host "Checking customer SDK files..."
Assert-File $appExe
Assert-File $wpfDll
Assert-File $nativeDll
Assert-File (Join-Path $serviceDir "mock-service.js")
Assert-File (Join-Path $frontendDir "index.html")
Assert-File (Join-Path $frontendDir "model\seat2.glb")
Assert-File $customerSeatModel
Assert-File $apiDoc
Assert-File $quickStartDoc
Assert-File $realApiDoc
Assert-File $nodeExe
Assert-File (Join-Path $realBackendDir "backend-host.exe")
Assert-File (Join-Path $realBackendDir "backend.jqpack")
Assert-File (Join-Path $realBackendDir "protection-manifest.json")
Assert-File (Join-Path $realBackendDir "python\Python311\python.exe")
Assert-File (Join-Path $realBackendDir "python\app\server.pyc")
Assert-File (Join-Path $realBackendDir "python\app\integrated_system.pyc")
Assert-File (Join-Path $realBackendDir "node_modules\express\package.json")
Assert-PathMissing (Join-Path $realBackendDir "server\serialServer.js")
Assert-PathMissing (Join-Path $realBackendDir "pyWorker.js")
Assert-PathMissing (Join-Path $realBackendDir "python\app\server.py")
Assert-PathMissing (Join-Path $realBackendDir "util")

Stop-TestPorts

$process = $null
$verificationSucceeded = $false
try {
    $command = "cd /d `"$serviceDir`" && set `"JQTOOLS_REAL_BACKEND_ROOT=$realBackendDir`" && set `"JQTOOLS_MOCK_HOST=$HostName`" && set `"JQTOOLS_MOCK_HTTP_PORT=$HttpPort`" && set `"JQTOOLS_MOCK_WS_PORT=$WsPort`" && set `"JQTOOLS_MOCK_FRONTEND_DIR=$frontendDir`" && set `"JQTOOLS_HOME_URL=$verificationHomeUrl`" && set `"JQTOOLS_CONTROL_MODE=auto`" && `"$nodeExe`" mock-service.js > `"$logFile`" 2>&1"
    $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $command -WindowStyle Hidden -PassThru
    $health = Wait-ServiceHealth
    if ($health.code -ne 0) {
        throw "Health check failed."
    }
    if ($health.data.mode -ne "real" -or $health.data.controlMode -ne "auto") {
        throw "Health state is not the expected real/auto mode."
    }
    Write-Host "[OK] HTTP /health"

    $controlMode = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/mode"
    if (
        $controlMode.code -ne 0 -or
        $controlMode.data.mode -ne "auto" -or
        $controlMode.data.autoWrite -ne $true
    ) {
        throw "Initial car adaptive control mode verification failed."
    }
    Write-Host "[OK] HTTP GET /carAdaptive/mode starts in auto mode"

    $collectionState = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/collection"
    if (
        $collectionState.code -ne 0 -or
        $collectionState.data.collecting -ne $false -or
        $collectionState.data.sensorId -notin 1,2
    ) {
        throw "Initial car adaptive collection state verification failed."
    }
    Write-Host "[OK] HTTP GET /carAdaptive/collection shared collection state"

    $missingCollectionName = "__jqtools_verify_missing_$([Guid]::NewGuid().ToString('N'))"
    $collectionExportRouteVerified = $false
    try {
        Invoke-WebRequest `
            "http://${HostName}:${HttpPort}/carAdaptive/collection/export?fileName=$missingCollectionName&sensorId=1" `
            -UseBasicParsing `
            -ErrorAction Stop | Out-Null
    } catch {
        $response = $_.Exception.Response
        if ($null -ne $response -and [int]$response.StatusCode -eq 404) {
            $collectionExportRouteVerified = $true
        }
    }
    if (-not $collectionExportRouteVerified) {
        throw "Raw collection CSV export route verification failed."
    }
    Write-Host "[OK] HTTP /carAdaptive/collection/export raw CSV route"

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

    $algorithmConfig = Invoke-RestMethod "http://${HostName}:${HttpPort}/algorithm/config"
    if ($algorithmConfig.code -ne 0 -or -not $algorithmConfig.data.'system.hz') {
        throw "Python algorithm config verification failed."
    }
    Write-Host "[OK] HTTP /algorithm/config bundled Python algorithm"
    if (
        [int]($algorithmConfig.data.'matrix.side_rect_size'.value) -ne 4 -or
        [int]($algorithmConfig.data.'matrix.center_matrix_rows'.value) -ne 8 -or
        [int]($algorithmConfig.data.'matrix.center_matrix_cols'.value) -ne 8
    ) {
        throw "Python sensor layout is not 4+4+8x8."
    }
    Write-Host "[OK] Python sensor layout 4+4+8x8"

    $sensorData = @(for ($index = 0; $index -lt 144; $index++) { 0 })
    foreach ($sensorId in 1,2) {
        $algorithm = Invoke-AlgorithmFrame -SensorId $sensorId -SensorData $sensorData
        if ($algorithm.code -ne 0) {
            throw "Sensor $sensorId algorithm verification failed: $($algorithm.message)"
        }
        Write-Host "[OK] sensor $sensorId protected Python algorithm processed 144 points"
    }

    $sensorStates = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/sensors"
    if ($sensorStates.code -ne 0 -or @($sensorStates.data).Count -ne 2) {
        throw "Dual sensor state verification failed."
    }
    Write-Host "[OK] HTTP /carAdaptive/sensors dual algorithm states"

    $webSocket = [System.Net.WebSockets.ClientWebSocket]::new()
    $webSocketTimeout = [System.Threading.CancellationTokenSource]::new()
    try {
        $webSocketTimeout.CancelAfter(20000)
        [void]$webSocket.ConnectAsync(
            [Uri]"ws://${HostName}:${WsPort}/?role=ui-display&clientId=verify-display",
            $webSocketTimeout.Token
        ).GetAwaiter().GetResult()

        Send-WebSocketJson `
            -Socket $webSocket `
            -Payload @{
                type = "carAdaptiveUiReport"
                clientId = "verify-display"
                sensorId = 1
                view = "module"
            } `
            -CancellationToken $webSocketTimeout.Token

        $trigger = Invoke-AlgorithmFrame -SensorId 1 -SensorData $sensorData
        if ($trigger.code -ne 0) {
            throw "WebSocket trigger frame failed."
        }

        $dualMessage = $null
        for ($attempt = 0; $attempt -lt 5 -and -not $dualMessage; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if ($message.PSObject.Properties.Name -contains "carAdaptiveSensorsData") {
                $dualMessage = $message
            }
        }

        $snapshots = @($dualMessage.carAdaptiveSensorsData)
        if ($snapshots.Count -ne 2) {
            throw "WebSocket dual sensor snapshot count verification failed."
        }
        foreach ($snapshot in $snapshots) {
            if (@($snapshot.sitData.carAir.arr).Count -ne 144) {
                throw "WebSocket sensor $($snapshot.sensorId) pressure length is not 144."
            }
        }
        Write-Host "[OK] WebSocket carAdaptiveSensorsData contains two 144-point snapshots"

        $manualModeBody = @{
            mode = "manual"
            reason = "customer-sdk verification"
        } | ConvertTo-Json -Compress
        $manualMode = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/mode" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $manualModeBody
        if (
            $manualMode.code -ne 0 -or
            $manualMode.data.mode -ne "manual" -or
            $manualMode.data.autoWrite -ne $false -or
            $manualMode.data.changed -ne $true
        ) {
            throw "Switching to manual control mode failed."
        }

        $manualModeBroadcast = $null
        for ($attempt = 0; $attempt -lt 12 -and -not $manualModeBroadcast; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if (
                $message.PSObject.Properties.Name -contains "carAdaptiveControlMode" -and
                $message.carAdaptiveControlMode.mode -eq "manual"
            ) {
                $manualModeBroadcast = $message.carAdaptiveControlMode
            }
        }
        if (-not $manualModeBroadcast -or $manualModeBroadcast.autoWrite -ne $false) {
            throw "Manual control mode WebSocket broadcast verification failed."
        }

        $autoModeBody = @{
            mode = "auto"
            reason = "customer-sdk verification complete"
        } | ConvertTo-Json -Compress
        $autoMode = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/mode" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $autoModeBody
        if (
            $autoMode.code -ne 0 -or
            $autoMode.data.mode -ne "auto" -or
            $autoMode.data.autoWrite -ne $true -or
            $autoMode.data.changed -ne $true
        ) {
            throw "Switching back to automatic control mode failed."
        }

        $autoModeBroadcast = $null
        for ($attempt = 0; $attempt -lt 12 -and -not $autoModeBroadcast; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if (
                $message.PSObject.Properties.Name -contains "carAdaptiveControlMode" -and
                $message.carAdaptiveControlMode.mode -eq "auto"
            ) {
                $autoModeBroadcast = $message.carAdaptiveControlMode
            }
        }
        if (-not $autoModeBroadcast -or $autoModeBroadcast.autoWrite -ne $true) {
            throw "Automatic control mode WebSocket broadcast verification failed."
        }
        Write-Host "[OK] HTTP and WebSocket automatic/manual control mode"

        # Driver and passenger control modes must remain independent.
        $driverManualModeBody = @{
            sensorId = 1
            mode = "manual"
            reason = "customer-sdk independent mode verification"
        } | ConvertTo-Json -Compress
        $driverManualMode = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/mode" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $driverManualModeBody
        $independentModes = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/mode?sensorId=1"
        $driverMode = @($independentModes.data.sensors | Where-Object { $_.sensorId -eq 1 })[0]
        $passengerMode = @($independentModes.data.sensors | Where-Object { $_.sensorId -eq 2 })[0]
        if (
            $driverManualMode.code -ne 0 -or
            $driverMode.mode -ne "manual" -or
            $passengerMode.mode -ne "auto"
        ) {
            throw "Independent driver/passenger control mode verification failed."
        }

        $driverAutoModeBody = @{
            sensorId = 1
            mode = "auto"
            reason = "customer-sdk independent mode verification complete"
        } | ConvertTo-Json -Compress
        $driverAutoMode = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/mode" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $driverAutoModeBody
        if ($driverAutoMode.code -ne 0 -or $driverAutoMode.data.mode -ne "auto") {
            throw "Restoring driver automatic mode failed."
        }
        Write-Host "[OK] HTTP independent driver/passenger control modes"

        # Display overrides and API serial writes must be visible in diagnostics.
        $displayGears = @(3) + @(0) * 23
        $displayBody = @{
            sensorId = 2
            gears = $displayGears
        } | ConvertTo-Json -Depth 4 -Compress
        $displayOverride = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/display" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $displayBody
        if (
            $displayOverride.code -ne 0 -or
            $displayOverride.data.source -ne "api" -or
            $displayOverride.data.override -ne $true -or
            @($displayOverride.data.gears).Count -ne 24 -or
            $displayOverride.data.gears[0] -ne 3
        ) {
            throw "Airbag display override verification failed."
        }

        $verificationCommand = @(31)
        for ($airbagIndex = 1; $airbagIndex -le 24; $airbagIndex++) {
            $verificationCommand += $airbagIndex
            $verificationCommand += 0
        }
        $verificationCommand += @(0, 0, 170, 85, 3, 153)
        if ($verificationCommand.Count -ne 55) {
            throw "Verification command is not 55 bytes."
        }
        $apiSerialBody = @{
            sensorId = 2
            controlCommand = $verificationCommand
        } | ConvertTo-Json -Depth 4 -Compress
        $apiSerial = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/writeCommand" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $apiSerialBody
        if ($apiSerial.code -ne 0 -or $apiSerial.data.length -ne 55) {
            throw "API airbag serial command verification failed."
        }

        $commandSnapshot = $null
        for ($attempt = 0; $attempt -lt 12 -and -not $commandSnapshot; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if ($message.PSObject.Properties.Name -contains "carAdaptiveSensorsData") {
                $passengerSnapshot = @(
                    $message.carAdaptiveSensorsData | Where-Object { $_.sensorId -eq 2 }
                )[0]
                if (
                    $passengerSnapshot.airbagDisplaySource -eq "api" -and
                    $passengerSnapshot.airbagDisplayOverride -eq $true -and
                    $passengerSnapshot.airbagCommands.apiSerial.length -eq 55 -and
                    $passengerSnapshot.airbagCommands.apiDisplay.length -eq 55
                ) {
                    $commandSnapshot = $passengerSnapshot
                }
            }
        }
        if (-not $commandSnapshot) {
            throw "WebSocket airbag command telemetry verification failed."
        }

        $displayCleared = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/display/2" `
            -Method Delete
        if (
            $displayCleared.code -ne 0 -or
            $displayCleared.data.override -ne $false -or
            $displayCleared.data.source -eq "api"
        ) {
            throw "Clearing airbag display override failed."
        }
        Write-Host "[OK] HTTP display override and WebSocket airbag command telemetry"

        # The history API must include both display-only and serial API operations.
        $commandHistory = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/commands/history?sensorId=2&limit=20" `
            -Method Get
        $historyTypes = @($commandHistory.data.records | ForEach-Object { $_.type })
        if (
            $commandHistory.code -ne 0 -or
            $commandHistory.data.sensorId -ne 2 -or
            $historyTypes -notcontains "apiSerial" -or
            $historyTypes -notcontains "apiDisplay"
        ) {
            throw "Airbag command history query verification failed."
        }

        $serialHistoryCleared = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/commands/history/2?type=apiSerial" `
            -Method Delete
        if (
            $serialHistoryCleared.code -ne 0 -or
            $serialHistoryCleared.data.removed -lt 1 -or
            $serialHistoryCleared.data.counts.apiSerial -ne 0
        ) {
            throw "Airbag command history type clear verification failed."
        }

        $allHistoryCleared = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/commands/history/2" `
            -Method Delete
        if ($allHistoryCleared.code -ne 0 -or $allHistoryCleared.data.total -ne 0) {
            throw "Airbag command history full clear verification failed."
        }
        Write-Host "[OK] HTTP airbag command history query and clear"

        $uiState = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/ui/state"
        if ($uiState.code -ne 0 -or $uiState.data.displayClients -lt 1) {
            throw "Remote UI display registration verification failed."
        }
        Write-Host "[OK] HTTP /carAdaptive/ui/state sees SDK display client"

        $commandBody = @{
            action = "select-sensor"
            sensorId = 2
        } | ConvertTo-Json -Compress
        $commandResponse = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/ui/command" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $commandBody
        if ($commandResponse.code -ne 0) {
            throw "Remote UI command verification failed: $($commandResponse.message)"
        }

        $remoteCommand = $null
        for ($attempt = 0; $attempt -lt 12 -and -not $remoteCommand; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if ($message.PSObject.Properties.Name -contains "carAdaptiveUiCommand") {
                $remoteCommand = $message.carAdaptiveUiCommand
            }
        }
        if (-not $remoteCommand -or $remoteCommand.action -ne "select-sensor" -or $remoteCommand.sensorId -ne 2) {
            throw "Remote UI WebSocket command payload verification failed."
        }

        Send-WebSocketJson `
            -Socket $webSocket `
            -Payload @{
                type = "carAdaptiveUiAcknowledgement"
                commandId = $remoteCommand.id
                status = "applied"
                sensorId = 2
                view = "module"
            } `
            -CancellationToken $webSocketTimeout.Token
        Start-Sleep -Milliseconds 100

        $acknowledgedState = Invoke-RestMethod "http://${HostName}:${HttpPort}/carAdaptive/ui/state"
        if (
            $acknowledgedState.code -ne 0 -or
            $acknowledgedState.data.selectedSensorId -ne 2 -or
            $acknowledgedState.data.lastAcknowledgement.commandId -ne $remoteCommand.id -or
            $acknowledgedState.data.lastAcknowledgement.status -ne "applied"
        ) {
            throw "Remote UI acknowledgement verification failed."
        }
        Write-Host "[OK] LAN command broadcast and SDK acknowledgement"

        $returnHomeBody = @{ action = "return-home" } | ConvertTo-Json -Compress
        $returnHomeResponse = Invoke-RestMethod `
            -Uri "http://${HostName}:${HttpPort}/carAdaptive/ui/command" `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $returnHomeBody
        if (
            $returnHomeResponse.code -ne 0 -or
            $returnHomeResponse.data.command.homeUrl -ne $verificationHomeUrl
        ) {
            throw "Configured home URL was not returned by the HTTP command endpoint."
        }

        $returnHomeCommand = $null
        for ($attempt = 0; $attempt -lt 12 -and -not $returnHomeCommand; $attempt++) {
            $message = Receive-WebSocketText -Socket $webSocket -CancellationToken $webSocketTimeout.Token |
                ConvertFrom-Json
            if (
                $message.PSObject.Properties.Name -contains "carAdaptiveUiCommand" -and
                $message.carAdaptiveUiCommand.action -eq "return-home"
            ) {
                $returnHomeCommand = $message.carAdaptiveUiCommand
            }
        }
        if (-not $returnHomeCommand -or $returnHomeCommand.homeUrl -ne $verificationHomeUrl) {
            throw "Configured home URL was not included in the WebSocket command."
        }
        Write-Host "[OK] configured home URL HTTP and WebSocket broadcast"
    }
    finally {
        $webSocket.Abort()
        $webSocket.Dispose()
        $webSocketTimeout.Dispose()
    }

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
        [void]$wpf.CloseMainWindow()
        if (-not $wpf.WaitForExit(8000)) {
            Start-Process `
                -FilePath taskkill.exe `
                -ArgumentList "/PID", $wpf.Id, "/T", "/F" `
                -WindowStyle Hidden `
                -Wait | Out-Null
        }
        Write-Host "[OK] WPF app smoke test"
    }

    Write-Host "CUSTOMER_SDK_REAL_VERIFY_OK"
    $verificationSucceeded = $true
}
finally {
    Stop-TestPorts
    if ($process -and (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath taskkill.exe -ArgumentList "/PID", $process.Id, "/T", "/F" -WindowStyle Hidden -Wait | Out-Null
    }
    if ($verificationSucceeded) {
        Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue
    }
    elseif (Test-Path -LiteralPath $logFile) {
        Write-Warning "Verification log retained at: $logFile"
    }
}
