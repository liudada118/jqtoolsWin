param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outRoot = Resolve-Path $PSScriptRoot

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

    $resolvedParent = Resolve-Path (Split-Path $Path -Parent)
    if (-not $resolvedParent.Path.StartsWith($outRoot.Path, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset output outside netsdk: $Path"
    }

    if (Test-Path -LiteralPath $Path) {
        $resolved = Resolve-Path -LiteralPath $Path
        if (-not $resolved.Path.StartsWith($outRoot.Path, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to delete unexpected path: $($resolved.Path)"
        }
        Remove-Item -LiteralPath $resolved.Path -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

Push-Location $repoRoot
try {
    if (-not $SkipBuild) {
        npm install

        Push-Location (Join-Path $repoRoot "sdk")
        npm install
        Pop-Location

        Push-Location (Join-Path $repoRoot "mock-sdk")
        npm install
        Pop-Location

        python -m pip install -r ".\sdk\python\app\requirements.txt"

        dotnet build ".\dotnet-wrapper\JqTools.CarAdaptive.Wpf\JqTools.CarAdaptive.Wpf.csproj" -c Release

        & "C:\Program Files\CMake\bin\cmake.exe" -S ".\native-dll\JqToolsCarAdaptiveNative" -B ".\native-dll\JqToolsCarAdaptiveNative\build" -G "Visual Studio 17 2022" -A x64
        & "C:\Program Files\CMake\bin\cmake.exe" --build ".\native-dll\JqToolsCarAdaptiveNative\build" --config Release
    }

    $wpfOut = Join-Path $outRoot "wpf-control"
    $nativeOut = Join-Path $outRoot "native-dll"
    $sdkOut = Join-Path $outRoot "sdk-service"
    $mockOut = Join-Path $outRoot "mock-service"

    Reset-OutputDirectory $wpfOut
    Reset-OutputDirectory $nativeOut
    Reset-OutputDirectory $sdkOut
    Reset-OutputDirectory $mockOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "dotnet-wrapper\JqTools.CarAdaptive.Wpf\bin\Release\net8.0-windows") `
        -Destination $wpfOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\build\Release") `
        -Destination $nativeOut

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "native-dll\JqToolsCarAdaptiveNative\wpf-loader") `
        -Destination (Join-Path $nativeOut "wpf-loader")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "sdk") `
        -Destination $sdkOut `
        -ExtraArgs @("/XD", ".git")

    Invoke-Robocopy `
        -Source (Join-Path $repoRoot "mock-sdk") `
        -Destination $mockOut `
        -ExtraArgs @("/XD", ".git")

    Write-Host "netsdk output completed: $outRoot"
    Write-Host "WPF UI control: $wpfOut"
    Write-Host "Native DLL: $nativeOut"
    Write-Host "SDK service: $sdkOut"
    Write-Host "Mock service: $mockOut"
}
finally {
    Pop-Location
}
