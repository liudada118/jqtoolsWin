$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$exePath = Join-Path $sdkRoot "app\JqTools.CarAdaptive.ClientWpf.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "WPF app is missing: $exePath"
}

Start-Process -FilePath $exePath -WorkingDirectory (Split-Path $exePath -Parent)
