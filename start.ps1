$ErrorActionPreference = "Stop"

$localPython = Get-Command python -ErrorAction SilentlyContinue
if ($localPython) {
    $env:CLASSROOM_HOST = if ($env:CLASSROOM_HOST) { $env:CLASSROOM_HOST } else { "127.0.0.1" }
    $env:CLASSROOM_PORT = if ($env:CLASSROOM_PORT) { $env:CLASSROOM_PORT } else { "8000" }
    & $localPython.Source "$PSScriptRoot\server.py"
    exit $LASTEXITCODE
}

$bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (Test-Path $bundledPython) {
    $env:CLASSROOM_HOST = if ($env:CLASSROOM_HOST) { $env:CLASSROOM_HOST } else { "127.0.0.1" }
    $env:CLASSROOM_PORT = if ($env:CLASSROOM_PORT) { $env:CLASSROOM_PORT } else { "8000" }
    & $bundledPython "$PSScriptRoot\server.py"
    exit $LASTEXITCODE
}

Write-Error "Python was not found. Install Python or run with the Codex bundled Python runtime."
