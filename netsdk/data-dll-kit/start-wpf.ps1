$ErrorActionPreference = "Stop"

$exePath = Join-Path $PSScriptRoot "wpf-app\JqTools.CarAdaptive.ClientWpf.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "WPF app is missing. Run netsdk\build-data-dll-kit.ps1 first."
}

Start-Process -FilePath $exePath -WorkingDirectory (Split-Path $exePath -Parent)
