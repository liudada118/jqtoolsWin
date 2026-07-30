param(
    [string]$RemoteControlToken,
    [string]$HomeUrl
)

$ErrorActionPreference = "Stop"

$sdkRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$exePath = Join-Path $sdkRoot "app\JqTools.CarAdaptive.ClientWpf.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "WPF app is missing: $exePath"
}

$previousToken = [Environment]::GetEnvironmentVariable("JQTOOLS_REMOTE_CONTROL_TOKEN", "Process")
$previousHomeUrl = [Environment]::GetEnvironmentVariable("JQTOOLS_HOME_URL", "Process")
try {
    if ($PSBoundParameters.ContainsKey("RemoteControlToken")) {
        [Environment]::SetEnvironmentVariable(
            "JQTOOLS_REMOTE_CONTROL_TOKEN",
            $RemoteControlToken,
            "Process"
        )
    }
    if ($PSBoundParameters.ContainsKey("HomeUrl")) {
        [Environment]::SetEnvironmentVariable(
            "JQTOOLS_HOME_URL",
            $HomeUrl,
            "Process"
        )
    }

    Start-Process -FilePath $exePath -WorkingDirectory (Split-Path $exePath -Parent)
}
finally {
    [Environment]::SetEnvironmentVariable(
        "JQTOOLS_REMOTE_CONTROL_TOKEN",
        $previousToken,
        "Process"
    )
    [Environment]::SetEnvironmentVariable(
        "JQTOOLS_HOME_URL",
        $previousHomeUrl,
        "Process"
    )
}
