param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outRoot = Join-Path $PSScriptRoot "customer-sdk"

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
    param([Parameter(Mandatory = $true)][string]$Path)

    $netsdkRoot = Resolve-Path $PSScriptRoot
    if (Test-Path -LiteralPath $Path) {
        $resolved = Resolve-Path -LiteralPath $Path
        if (-not $resolved.Path.StartsWith($netsdkRoot.Path, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to delete unexpected path: $($resolved.Path)"
        }

        Remove-Item -LiteralPath $resolved.Path -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

Push-Location $repoRoot
try {
    if (-not $SkipBuild) {
        Push-Location (Join-Path $repoRoot "mock-sdk")
        npm install
        Pop-Location

        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj" -c Release
        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.ClientWpf\JqTools.CarAdaptive.ClientWpf.csproj" -c Release

        & "C:\Program Files\CMake\bin\cmake.exe" -S ".\native-dll\JqToolsCarAdaptiveNative" -B ".\native-dll\JqToolsCarAdaptiveNative\build" -G "Visual Studio 17 2022" -A x64
        & "C:\Program Files\CMake\bin\cmake.exe" --build ".\native-dll\JqToolsCarAdaptiveNative\build" --config Release
    }

    Reset-OutputDirectory $outRoot

    $appOut = Join-Path $outRoot "app"
    $serviceOut = Join-Path $outRoot "mock-service"
    $wpfControlOut = Join-Path $outRoot "wpf-control"
    $nativeOut = Join-Path $outRoot "native-dll"
    $docsOut = Join-Path $outRoot "docs"
    $scriptsOut = Join-Path $outRoot "scripts"

    New-Item -ItemType Directory -Force -Path $appOut, $serviceOut, $wpfControlOut, $nativeOut, $docsOut, $scriptsOut | Out-Null

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.ClientWpf\bin\Release\net8.0-windows") `
        -Destination $appOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination (Join-Path $appOut "mock-sdk") `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination $serviceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows") `
        -Destination $wpfControlOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination (Join-Path $wpfControlOut "mock-sdk") `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\build\Release") `
        -Destination $nativeOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination (Join-Path $nativeOut "mock-sdk") `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\wpf-loader") `
        -Destination (Join-Path $nativeOut "wpf-loader")

    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\README.md") -Destination (Join-Path $outRoot "README.md") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\FAKE_API.md") -Destination (Join-Path $docsOut "FAKE_API.md") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\start-wpf.ps1") -Destination (Join-Path $scriptsOut "start-wpf.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\start-mock-service.ps1") -Destination (Join-Path $scriptsOut "start-mock-service.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\stop-mock-service.ps1") -Destination (Join-Path $scriptsOut "stop-mock-service.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "customer-sdk-template\scripts\verify-sdk.ps1") -Destination (Join-Path $scriptsOut "verify-sdk.ps1") -Force

    Write-Host "customer sdk output completed: $outRoot"
    Write-Host "WPF app: $appOut"
    Write-Host "Mock service: $serviceOut"
    Write-Host "WPF control DLL: $wpfControlOut"
    Write-Host "Native DLL: $nativeOut"
    Write-Host "Docs: $docsOut"
    Write-Host "Scripts: $scriptsOut"
}
finally {
    Pop-Location
}
