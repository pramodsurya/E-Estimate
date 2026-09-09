$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceScript = Join-Path $projectRoot 'analysis\bund_analysis.py'
$outputRoot = Join-Path $projectRoot 'vendor\bund-analysis'
$workRoot = Join-Path $projectRoot 'build\bund-analysis'
$python = if ($env:EESTIMATE_PYTHON) { $env:EESTIMATE_PYTHON } else { 'python' }

if (-not (Test-Path -LiteralPath $sourceScript -PathType Leaf)) {
  throw "Analysis source not found: $sourceScript"
}

& $python -c 'import PyInstaller, xslope, numpy, scipy, shapely, openpyxl, gmsh' 2>$null
if ($LASTEXITCODE -ne 0) {
  throw @"
The packaging Python is missing one or more solver build dependencies.
Run `python -m pip install -r analysis/requirements-packaging.txt`, or set
EESTIMATE_PYTHON to an interpreter where those packages are installed.
"@
}

if (Test-Path -LiteralPath $outputRoot) {
  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
if (Test-Path -LiteralPath $workRoot) {
  Remove-Item -LiteralPath $workRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null

Write-Host 'Building the self-contained bund analysis engine...'
& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --distpath $outputRoot `
  --workpath (Join-Path $workRoot 'work') `
  (Join-Path $projectRoot 'analysis\bund-analysis.spec')

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE."
}

$nestedOutput = Join-Path $outputRoot 'bund-analysis'
if (-not (Test-Path -LiteralPath (Join-Path $nestedOutput 'bund-analysis.exe'))) {
  throw 'PyInstaller completed without producing bund-analysis.exe.'
}

Get-ChildItem -LiteralPath $nestedOutput -Force | Move-Item -Destination $outputRoot
Remove-Item -LiteralPath $nestedOutput -Recurse -Force

Write-Host "Analysis engine ready: $(Join-Path $outputRoot 'bund-analysis.exe')"
