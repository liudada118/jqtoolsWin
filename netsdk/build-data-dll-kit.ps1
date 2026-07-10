param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outRoot = Join-Path $PSScriptRoot "data-dll-kit"

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

        $preserve = @(
            "README.md",
            "FAKE_API.md",
            "start-wpf.ps1",
            "start-data-service.ps1",
            "stop-data-service.ps1",
            "open-debug-page.ps1"
        )

        Get-ChildItem -LiteralPath $resolved.Path -Force -File |
            Where-Object { $preserve -notcontains $_.Name } |
            Remove-Item -Force -ErrorAction SilentlyContinue
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

    $serviceOut = Join-Path $outRoot "data-service"
    $wpfAppOut = Join-Path $outRoot "wpf-app"
    $wpfOut = Join-Path $outRoot "wpf-control"
    $nativeOut = Join-Path $outRoot "native-dll"

    New-Item -ItemType Directory -Force -Path $serviceOut, $wpfAppOut, $wpfOut, $nativeOut | Out-Null

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination $serviceOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows") `
        -Destination $wpfOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.ClientWpf\bin\Release\net8.0-windows") `
        -Destination $wpfAppOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\build\Release") `
        -Destination $nativeOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\wpf-loader") `
        -Destination (Join-Path $nativeOut "wpf-loader")

    Write-Host "data + dll kit output completed: $outRoot"
    Write-Host "Customer WPF app: $wpfAppOut"
    Write-Host "Data service and debug web: $serviceOut"
    Write-Host "WPF UI control DLL: $wpfOut"
    Write-Host "Native DLL: $nativeOut"
}
finally {
    Pop-Location
}
