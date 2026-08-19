param(
    [string]$CustomerSdkRoot = (Join-Path $PSScriptRoot "customer-sdk"),
    [switch]$KeepPlaintextSources
)

$ErrorActionPreference = "Stop"

$netsdkRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$customerRoot = (Resolve-Path -LiteralPath $CustomerSdkRoot).Path
$backendRoot = (Resolve-Path -LiteralPath (Join-Path $customerRoot "real-backend")).Path
$nodeExe = (Resolve-Path -LiteralPath (Join-Path $customerRoot "runtime\node\node.exe")).Path
$pythonExe = (Resolve-Path -LiteralPath (Join-Path $backendRoot "python\Python311\python.exe")).Path
$pythonAppRoot = (Resolve-Path -LiteralPath (Join-Path $backendRoot "python\app")).Path
$generator = Join-Path $PSScriptRoot "protected-backend\create-protected-payload.js"
$manifestFinalizer = Join-Path $PSScriptRoot "protected-backend\finalize-protection-manifest.js"
$pythonCompiler = Join-Path $PSScriptRoot "protected-backend\compile-python-bytecode.py"
$workRoot = Join-Path $PSScriptRoot ".protected-backend-work"
$hostExe = Join-Path $backendRoot "backend-host.exe"
$protectionManifestPath = Join-Path $backendRoot "protection-manifest.json"
$seaConfig = Join-Path $workRoot "sea-config.json"
$seaBlob = Join-Path $workRoot "sea-prep.blob"
$pythonSources = @(
    "server.py",
    "integrated_system.py",
    "config.py",
    "control.py",
    "tap_massage.py"
)

function Assert-PathInside {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if (-not $fullPath.StartsWith("$fullParent\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description is outside the allowed directory: $fullPath"
    }
}

function Remove-SafeTree {
    param([Parameter(Mandatory = $true)][string]$Path)

    Assert-PathInside -Path $Path -Parent $netsdkRoot -Description "Delete target"
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

Assert-PathInside -Path $customerRoot -Parent $netsdkRoot -Description "Customer SDK"
Assert-PathInside -Path $backendRoot -Parent $customerRoot -Description "Real backend"
Assert-PathInside -Path $workRoot -Parent $netsdkRoot -Description "Protection work directory"

if (-not (Test-Path -LiteralPath $generator -PathType Leaf)) {
    throw "Protected backend generator not found: $generator"
}
if (-not (Test-Path -LiteralPath $manifestFinalizer -PathType Leaf)) {
    throw "Protection manifest finalizer not found: $manifestFinalizer"
}
if (-not (Test-Path -LiteralPath $pythonCompiler -PathType Leaf)) {
    throw "Python bytecode compiler not found: $pythonCompiler"
}

Remove-SafeTree -Path $workRoot
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null

try {
    Write-Host "Creating encrypted Node.js business package..."
    & $nodeExe $generator $repoRoot $backendRoot $workRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Protected payload generation failed with exit code $LASTEXITCODE"
    }

    Write-Host "Creating Node.js single executable host..."
    & $nodeExe --experimental-sea-config $seaConfig
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $seaBlob -PathType Leaf)) {
        throw "Node.js SEA blob generation failed with exit code $LASTEXITCODE"
    }

    Copy-Item -LiteralPath $nodeExe -Destination $hostExe -Force
    $windowsKitsBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    $signTool = Get-ChildItem -Path (Join-Path $windowsKitsBin "*\x64\signtool.exe") `
        -File -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($signTool) {
        & $signTool.FullName remove /s $hostExe
        if ($LASTEXITCODE -ne 0) {
            throw "Removing the original Node.js signature failed with exit code $LASTEXITCODE"
        }
    }
    else {
        Write-Warning "signtool.exe was not found; postject may report the original Node.js signature as corrupted."
    }

    & npx.cmd --yes postject@1.0.0-alpha.6 $hostExe NODE_SEA_BLOB $seaBlob `
        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js SEA injection failed with exit code $LASTEXITCODE"
    }

    # SEA 注入后宿主文件才最终定型，将宿主哈希写入清单以校验交付文件是否配套。
    Write-Host "Finalizing protected backend manifest..."
    & $nodeExe $manifestFinalizer $protectionManifestPath $hostExe
    if ($LASTEXITCODE -ne 0) {
        throw "Protection manifest finalization failed with exit code $LASTEXITCODE"
    }
    if (-not [System.IO.File]::ReadAllText($protectionManifestPath).Contains('"hostSha256"')) {
        throw "Protection manifest finalization did not write hostSha256"
    }

    Write-Host "Compiling first-party Python algorithms to sourceless bytecode..."
    $previousDontWriteBytecode = $env:PYTHONDONTWRITEBYTECODE
    try {
        $env:PYTHONDONTWRITEBYTECODE = "1"
        & $pythonExe $pythonCompiler (Join-Path $repoRoot "python\app") $pythonAppRoot @pythonSources
    }
    finally {
        if ($null -eq $previousDontWriteBytecode) {
            Remove-Item Env:PYTHONDONTWRITEBYTECODE -ErrorAction SilentlyContinue
        }
        else {
            $env:PYTHONDONTWRITEBYTECODE = $previousDontWriteBytecode
        }
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Python bytecode compilation failed with exit code $LASTEXITCODE"
    }

    foreach ($pythonSource in $pythonSources) {
        $compiledFile = Join-Path $pythonAppRoot ([System.IO.Path]::ChangeExtension($pythonSource, ".pyc"))
        if (-not (Test-Path -LiteralPath $compiledFile -PathType Leaf)) {
            throw "Compiled Python module missing: $compiledFile"
        }
    }

    if (-not $KeepPlaintextSources) {
        Write-Host "Removing plaintext first-party sources from customer SDK..."
        Remove-SafeTree -Path (Join-Path $backendRoot "server")
        Remove-SafeTree -Path (Join-Path $backendRoot "util")
        Remove-Item -LiteralPath (Join-Path $backendRoot "pyWorker.js") -Force -ErrorAction SilentlyContinue
        Remove-SafeTree -Path (Join-Path $pythonAppRoot "__pycache__")
        foreach ($pythonSource in $pythonSources) {
            Remove-Item -LiteralPath (Join-Path $pythonAppRoot $pythonSource) -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Protected backend completed: $backendRoot"
    Write-Host "Host executable: $hostExe"
    Write-Host "Encrypted package: $(Join-Path $backendRoot 'backend.jqpack')"
}
finally {
    Remove-SafeTree -Path $workRoot
}
