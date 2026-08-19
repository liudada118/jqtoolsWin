param(
    [switch]$SkipBuild,
    [switch]$SkipProtection
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outRoot = Join-Path $PSScriptRoot "customer-sdk"
$webViewRuntimeDirName = "JqTools.CarAdaptive.ClientWpf.exe.WebView2"
$customerSeatModelFileName = 'FAST27-' +
    [char]0x524D +
    [char]0x6392 +
    [char]0x5EA7 +
    [char]0x6905 +
    '.glb'

function Invoke-Robocopy {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExtraArgs = @()
    )

    robocopy $Source $Destination /E @ExtraArgs
    $code = $LASTEXITCODE
    if ($code -gt 7) {
        throw "robocopy failed with exit code $code. Source=$Source Destination=$Destination"
    }
}

function Reset-OutputDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$PreservePaths = @()
    )

    function Remove-WithRetry {
        param([Parameter(Mandatory = $true)][string]$Target)

        for ($attempt = 1; $attempt -le 10; $attempt++) {
            try {
                Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop
                return
            }
            catch {
                if ($attempt -eq 10) {
                    throw
                }
                Start-Sleep -Milliseconds 250
            }
        }
    }

    function Get-PreserveMode {
        param([Parameter(Mandatory = $true)][string]$Target)

        $targetPath = [IO.Path]::GetFullPath($Target).TrimEnd('\')
        foreach ($preservePath in $PreservePaths) {
            $normalizedPreservePath = [IO.Path]::GetFullPath($preservePath).TrimEnd('\')
            if ($targetPath.Equals($normalizedPreservePath, [StringComparison]::OrdinalIgnoreCase)) {
                return 'Exact'
            }
            if ($normalizedPreservePath.StartsWith(
                "$targetPath\",
                [StringComparison]::OrdinalIgnoreCase
            )) {
                return 'Ancestor'
            }
        }
        return 'None'
    }

    function Clear-WithPreservedPaths {
        param([Parameter(Mandatory = $true)][string]$Directory)

        Get-ChildItem -LiteralPath $Directory -Force | ForEach-Object {
            $mode = Get-PreserveMode -Target $_.FullName
            if ($mode -eq 'Exact') {
                Write-Host "Preserving customer runtime data: $($_.FullName)"
                return
            }
            if ($mode -eq 'Ancestor' -and $_.PSIsContainer) {
                Clear-WithPreservedPaths -Directory $_.FullName
                return
            }
            Remove-WithRetry -Target $_.FullName
        }
    }

    $netsdkRoot = Resolve-Path $PSScriptRoot
    if (Test-Path -LiteralPath $Path) {
        $resolved = Resolve-Path -LiteralPath $Path
        if (-not $resolved.Path.StartsWith($netsdkRoot.Path, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to delete unexpected path: $($resolved.Path)"
        }

        Clear-WithPreservedPaths -Directory $resolved.Path

        if ($PreservePaths.Count -eq 0) {
            try {
                Remove-WithRetry -Target $resolved.Path
            }
            catch {
                Write-Warning "Output root is still in use, reusing existing empty directory: $($resolved.Path)"
            }
        }
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-FrontendBuild {
    param([Parameter(Mandatory = $true)][string]$Destination)

    $frontendSource = Join-Path $repoRoot "client\build"
    if (-not (Test-Path -LiteralPath (Join-Path $frontendSource "index.html"))) {
        throw "Frontend build not found. Expected: $frontendSource"
    }

    $protectedModelPath = Join-Path $Destination (Join-Path "model" $customerSeatModelFileName)
    $copyArgs = @()
    if (Test-Path -LiteralPath $protectedModelPath -PathType Leaf) {
        $copyArgs = @("/XF", $customerSeatModelFileName)
        Write-Host "Preserving customer seat model: $protectedModelPath"
    }

    Invoke-Robocopy `
        -Source $frontendSource `
        -Destination $Destination `
        -ExtraArgs $copyArgs
}

Push-Location $repoRoot
try {
    if (-not $SkipBuild) {
        Push-Location (Join-Path $repoRoot "client")
        npm install
        npm run build
        Pop-Location

        Push-Location (Join-Path $repoRoot "mock-sdk")
        npm install
        Pop-Location

        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj" -c Release
        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.ClientWpf\JqTools.CarAdaptive.ClientWpf.csproj" -c Release

        & "C:\Program Files\CMake\bin\cmake.exe" -S ".\native-dll\JqToolsCarAdaptiveNative" -B ".\native-dll\JqToolsCarAdaptiveNative\build" -G "Visual Studio 17 2022" -A x64
        & "C:\Program Files\CMake\bin\cmake.exe" --build ".\native-dll\JqToolsCarAdaptiveNative\build" --config Release
    }

    $preservedCustomerPaths = @()
    $customerDatabasePath = Join-Path $outRoot "real-backend\db\carAir.db"
    $customerDataPath = Join-Path $outRoot "real-backend\data"
    $customerSeatModelPath = Join-Path $outRoot (Join-Path "frontend-build\model" $customerSeatModelFileName)
    if (Test-Path -LiteralPath $customerDatabasePath -PathType Leaf) {
        $preservedCustomerPaths += $customerDatabasePath
    }
    if (Test-Path -LiteralPath $customerDataPath -PathType Container) {
        $preservedCustomerPaths += $customerDataPath
    }
    if (Test-Path -LiteralPath $customerSeatModelPath -PathType Leaf) {
        $preservedCustomerPaths += $customerSeatModelPath
    }
    Reset-OutputDirectory $outRoot -PreservePaths $preservedCustomerPaths

    $appOut = Join-Path $outRoot "app"
    $serviceOut = Join-Path $outRoot "mock-service"
    $wpfControlOut = Join-Path $outRoot "wpf-control"
    $nativeOut = Join-Path $outRoot "native-dll"
    $docsOut = Join-Path $outRoot "docs"
    $scriptsOut = Join-Path $outRoot "scripts"
    $frontendOut = Join-Path $outRoot "frontend-build"
    $realBackendOut = Join-Path $outRoot "real-backend"
    $backendServerOut = Join-Path $realBackendOut "server"
    $runtimeNodeOut = Join-Path $outRoot "runtime\node"
    $sqliteBuildTemp = Join-Path $realBackendOut "node_modules\sqlite3\build-tmp-napi-v6"

    New-Item -ItemType Directory -Force -Path $appOut, $serviceOut, $wpfControlOut, $nativeOut, $docsOut, $scriptsOut, $frontendOut, $realBackendOut, $backendServerOut, $runtimeNodeOut | Out-Null

    Copy-FrontendBuild -Destination $frontendOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.ClientWpf\bin\Release\net8.0-windows") `
        -Destination $appOut `
        -ExtraArgs @("/XD", $webViewRuntimeDirName)

    $appWebViewRuntimePath = Join-Path $appOut $webViewRuntimeDirName
    if (Test-Path -LiteralPath $appWebViewRuntimePath) {
        throw "WebView2 runtime cache must not be included in customer SDK: $appWebViewRuntimePath"
    }

    $appServiceOut = Join-Path $appOut "mock-sdk"
    Reset-OutputDirectory $appServiceOut
    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "real-service") `
        -Destination $appServiceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "real-service") `
        -Destination $serviceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows") `
        -Destination $wpfControlOut

    $wpfServiceOut = Join-Path $wpfControlOut "mock-sdk"
    Reset-OutputDirectory $wpfServiceOut
    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "real-service") `
        -Destination $wpfServiceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\build\Release") `
        -Destination $nativeOut

    $nativeServiceOut = Join-Path $nativeOut "mock-sdk"
    Reset-OutputDirectory $nativeServiceOut
    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "real-service") `
        -Destination $nativeServiceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\wpf-loader") `
        -Destination (Join-Path $nativeOut "wpf-loader")

    # Copy only the runtime files required by the car-adaptive backend.
    if (-not (Test-Path -LiteralPath $backendServerOut -PathType Container)) {
        throw "Backend server output directory was not initialized: $backendServerOut"
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot "server\serialServer.js") -Destination (Join-Path $backendServerOut "serialServer.js") -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "server\HttpResult.js") -Destination (Join-Path $backendServerOut "HttpResult.js") -Force
    Invoke-Robocopy -Source (Join-Path $repoRoot "util") -Destination (Join-Path $realBackendOut "util")
    Copy-Item -LiteralPath (Join-Path $repoRoot "pyWorker.js") -Destination $realBackendOut -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "config.txt") -Destination $realBackendOut -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "package.json") -Destination $realBackendOut -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "package-lock.json") -Destination $realBackendOut -Force

    New-Item -ItemType Directory -Force -Path (Join-Path $realBackendOut "db"), (Join-Path $realBackendOut "data"), (Join-Path $realBackendOut "python\app") | Out-Null
    $outputDatabasePath = Join-Path $realBackendOut "db\carAir.db"
    if (-not (Test-Path -LiteralPath $outputDatabasePath -PathType Leaf)) {
        Copy-Item -LiteralPath (Join-Path $repoRoot "db\carAir.db") -Destination (Join-Path $realBackendOut "db") -Force
    }
    else {
        Write-Host "Preserved customer database: $outputDatabasePath"
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot "db\init.db") -Destination (Join-Path $realBackendOut "db") -Force

    $pythonAppFiles = @(
        "server.py",
        "integrated_system.py",
        "config.py",
        "control.py",
        "tap_massage.py",
        "sensor_config.yaml"
    )
    foreach ($pythonAppFile in $pythonAppFiles) {
        Copy-Item -LiteralPath (Join-Path $repoRoot "python\app\$pythonAppFile") -Destination (Join-Path $realBackendOut "python\app") -Force
    }

    Invoke-Robocopy -Source (Join-Path $repoRoot "python\Python311") -Destination (Join-Path $realBackendOut "python\Python311") -ExtraArgs @("/XD", "__pycache__", "idlelib", "Doc", "Tools")

    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
    Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $runtimeNodeOut "node.exe") -Force

    Write-Host "Installing standalone production Node dependencies..."
    & npm.cmd ci --omit=dev --no-audit --no-fund --prefix $realBackendOut
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci for standalone real-backend failed with exit code $LASTEXITCODE"
    }

    # sqlite3 安装器可能留下约 60 MB 的原生模块编译临时目录，运行时只需要 lib/binding 下的 DLL。
    $resolvedBackendRoot = [System.IO.Path]::GetFullPath($realBackendOut).TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($sqliteBuildTemp)) {
        throw "sqlite3 build cache path was not initialized"
    }
    if ([System.IO.Directory]::Exists($sqliteBuildTemp)) {
        $resolvedSqliteBuildTemp = (Resolve-Path -LiteralPath $sqliteBuildTemp).Path
        if (-not $resolvedSqliteBuildTemp.StartsWith(
            "$resolvedBackendRoot\node_modules\sqlite3\",
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw "Refusing to delete unexpected sqlite3 build directory: $resolvedSqliteBuildTemp"
        }
        Remove-Item -LiteralPath $resolvedSqliteBuildTemp -Recurse -Force
        Write-Host "Removed sqlite3 native build cache: $resolvedSqliteBuildTemp"
    }

    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\README.md") -Destination (Join-Path $outRoot "README.md") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\QUICKSTART.md") -Destination (Join-Path $docsOut "QUICKSTART.md") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\API.md") -Destination (Join-Path $docsOut "API.md") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\start-wpf.ps1") -Destination (Join-Path $scriptsOut "start-wpf.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\start-mock-service.ps1") -Destination (Join-Path $scriptsOut "start-mock-service.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\stop-mock-service.ps1") -Destination (Join-Path $scriptsOut "stop-mock-service.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\verify-sdk.ps1") -Destination (Join-Path $scriptsOut "verify-sdk.ps1") -Force

    if (-not $SkipProtection) {
        & (Join-Path $PSScriptRoot "protect-customer-backend.ps1") -CustomerSdkRoot $outRoot
    }

    Write-Host "customer sdk output completed: $outRoot"
    Write-Host "WPF app: $appOut"
    Write-Host "Mock service: $serviceOut"
    Write-Host "WPF control DLL: $wpfControlOut"
    Write-Host "Native DLL: $nativeOut"
    Write-Host "Docs: $docsOut"
    Write-Host "Scripts: $scriptsOut"
    Write-Host "Standalone backend: $realBackendOut"
    Write-Host "Bundled Node.js: $runtimeNodeOut"
}
finally {
    Pop-Location
}
