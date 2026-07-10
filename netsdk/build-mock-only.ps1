param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outRoot = Join-Path $PSScriptRoot "mock-only"

function Invoke-Robocopy {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    robocopy $Source $Destination /E
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
        Get-ChildItem -LiteralPath $resolved.Path -Force |
            Where-Object { $_.Name -ne "README.md" } |
            Remove-Item -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

Push-Location $repoRoot
try {
    if (-not $SkipBuild) {
        npm install

        Push-Location (Join-Path $repoRoot "mock-sdk")
        npm install
        Pop-Location

        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj" -c Release

        & "C:\Program Files\CMake\bin\cmake.exe" -S ".\native-dll\JqToolsCarAdaptiveNative" -B ".\native-dll\JqToolsCarAdaptiveNative\build" -G "Visual Studio 17 2022" -A x64
        & "C:\Program Files\CMake\bin\cmake.exe" --build ".\native-dll\JqToolsCarAdaptiveNative\build" --config Release
    }

    Reset-OutputDirectory $outRoot

    $serviceOut = Join-Path $outRoot "mock-service"
    $wpfOut = Join-Path $outRoot "wpf-control"
    $nativeOut = Join-Path $outRoot "native-dll"

    New-Item -ItemType Directory -Force -Path $serviceOut, $wpfOut, $nativeOut | Out-Null

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination $serviceOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows") `
        -Destination $wpfOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\build\Release") `
        -Destination $nativeOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\wpf-loader") `
        -Destination (Join-Path $nativeOut "wpf-loader")

    Write-Host "mock-only output completed: $outRoot"
    Write-Host "Mock service: $serviceOut"
    Write-Host "WPF mock UI control: $wpfOut"
    Write-Host "Native mock DLL: $nativeOut"
}
finally {
    Pop-Location
}
