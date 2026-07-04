# E-Estimate One-Click Publish Script
# Usage: .\scripts\publish.ps1 [patch|minor|major|version]
# Example: .\scripts\publish.ps1 patch

param(
    [string]$bumpType = "patch"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  E-Estimate - Publish Update" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Refresh PATH so gh is available
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path    = "$machinePath;$userPath"

# 2. Ensure GH_TOKEN is set
try {
    $env:GH_TOKEN = gh auth token 2>$null
} catch { }
if (-not $env:GH_TOKEN) {
    Write-Host "ERROR: Not logged into GitHub CLI. Run 'gh auth login' first." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] GitHub authenticated" -ForegroundColor Green

# 3. Read & bump version
$pkgPath = Join-Path $root "package.json"
$pkgJson = Get-Content $pkgPath -Raw -Encoding UTF8
$oldVersion = ($pkgJson | Select-String -Pattern '"version"\s*:\s*"([^"]+)"').Matches.Groups[1].Value
Write-Host ""
Write-Host "Current version: $oldVersion" -ForegroundColor Yellow

$validBumps = @("patch", "minor", "major")
if ($bumpType -in $validBumps) {
    $parts = $oldVersion -split '\.'
    if ($parts.Count -ne 3) {
        Write-Host "ERROR: Version must be X.Y.Z (got: $oldVersion)" -ForegroundColor Red
        exit 1
    }
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]
    switch ($bumpType) {
        "major" { $major++; $minor=0; $patch=0 }
        "minor" { $minor++; $patch=0 }
        "patch" { $patch++ }
    }
    $newVersion = "$major.$minor.$patch"
} else {
    $newVersion = $bumpType
}

Write-Host "New version:     $newVersion" -ForegroundColor Green
Write-Host ""

# 4. Update package.json (regex replace preserves all formatting)
$pkgJson = $pkgJson -replace '("version"\s*:\s*)"[^"]+"', ('$1"' + $newVersion + '"')
$pkgJson = $pkgJson.TrimEnd() + "`n"
# Use .NET to write without BOM (Byte Order Mark) which breaks JSON parsers
[System.IO.File]::WriteAllText($pkgPath, $pkgJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] package.json updated" -ForegroundColor Green

# 5. Git commit & push
Write-Host ""
Write-Host "Committing version bump..." -ForegroundColor Cyan
git add package.json
git commit -m "v$newVersion" --allow-empty
git push origin master
Write-Host "[OK] Pushed v$newVersion to GitHub" -ForegroundColor Green

# 6. Build & Publish to GitHub Releases
Write-Host ""
Write-Host "Building & publishing to GitHub Releases..." -ForegroundColor Cyan
Write-Host "  (this will take 2-5 minutes)" -ForegroundColor Gray
Write-Host ""

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

electron-builder --win nsis --x64 --publish always
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Publish failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  PUBLISHED: v$newVersion" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Release: https://github.com/pramodsurya/E-Estimate/releases/tag/v$newVersion" -ForegroundColor Cyan
Write-Host ""
Write-Host "Users will get the update notification next time they open the app!" -ForegroundColor Yellow
Write-Host ""

