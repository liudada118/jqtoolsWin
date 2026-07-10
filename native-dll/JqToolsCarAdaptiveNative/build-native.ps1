param(
    [string]$Configuration = "Release",
    [string]$BuildDir = "build"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildPath = Join-Path $root $BuildDir

cmake -S $root -B $buildPath -A x64
cmake --build $buildPath --config $Configuration

Write-Host "Native DLL output:"
Get-ChildItem -Recurse -Filter JqToolsCarAdaptiveNative.dll $buildPath | Select-Object -ExpandProperty FullName
