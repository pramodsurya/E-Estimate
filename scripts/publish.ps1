# E-Estimate One-Click Release (signing + analysis engine + auto-update manifest).
#
# Usage: .\scripts\publish.ps1            # patch bump
#        .\scripts\publish.ps1 minor      # or major / an explicit version
#
# It wires the full release end-to-end so running it IS the release:
#   1. Ensures the signing keypair exists in ~/.tauri (generates if missing).
#   2. Mounts the private key + pushes it to GitHub Secrets (so CI runs match).
#   3. Writes the public key into src-tauri/tauri.conf.json.
#   4. Bumps package.json + tauri.conf.json + Cargo.toml to the same version.
#   5. Pre-flights the analysis-engine Python deps.
#   6. Commits the version bump, tags it, pushes, creates the GitHub release.
#   7. Builds the Python analysis engine + the Tauri installer (signed).
#   8. Verifies the bund-analysis.exe sidecar was bundled.
#   9. Uploads installer + signature + latest.json for auto-update.
#
# Requires: GitHub CLI (`gh`) logged in with push access to pramodsurya/E-Estimate,
# and a Python that can build the bund-analysis sidecar (see step 5).

param(
    [string]$bumpType = "patch"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

$repoSlug = "pramodsurya/E-Estimate"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  E-Estimate - One-Click Release" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# ----------------------------------------------------------------------------
# 1/2. Signing keys (local, gitignored) + mount private key
# ----------------------------------------------------------------------------
$keyFile = Join-Path $HOME ".tauri\eestimate.key"
$pubFile = "$keyFile.pub"
if (-not (Test-Path -LiteralPath $keyFile) -or -not (Test-Path -LiteralPath $pubFile)) {
    Write-Host "Generating a fresh signing keypair at $keyFile ..." -ForegroundColor Yellow
    & npx tauri signer generate -w $keyFile --ci
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: could not generate signing keys" -ForegroundColor Red; exit 1 }
    Write-Host "[OK] Keys generated" -ForegroundColor Green
} else {
    Write-Host "[OK] Using existing keys in $HOME\.tauri" -ForegroundColor Green
}

# The private key is never committed; it is mounted for the build AND mirrored to
# the repo secrets so the CI release job reproduces the exact same signature key.
$privateKeyContent = (Get-Content -LiteralPath $keyFile -Raw).Trim()
$null = New-Item -ItemType Directory -Path (Split-Path $keyFile) -Force
$env:TAURI_SIGNING_PRIVATE_KEY = $privateKeyContent
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyFile

# ----------------------------------------------------------------------------
# 3. GitHub CLI + secrets + public key sync
# ----------------------------------------------------------------------------
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path    = "$machinePath;$userPath"

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = "C:\Program Files\GitHub CLI\gh.exe"; $gh = if (Test-Path $gh) { $gh } else { "C:\Program Files (x86)\GitHub CLI\gh.exe" } }
if (-not (Test-Path $gh)) { Write-Host "ERROR: GitHub CLI not found (https://cli.github.com)" -ForegroundColor Red; exit 1 }
try { $env:GH_TOKEN = & $gh auth token 2>$null } catch { }
if (-not $env:GH_TOKEN) { Write-Host "ERROR: run 'gh auth login' first" -ForegroundColor Red; exit 1 }
Write-Host "[OK] GitHub authenticated" -ForegroundColor Green

# Keep CI reproducible: mirror the signing key to the repo secrets (idempotent).
# No password is set because the generated key is unencrypted.
& $gh secret set TAURI_SIGNING_PRIVATE_KEY --repo $repoSlug --body $privateKeyContent
Write-Host "[OK] TAURI_SIGNING_PRIVATE_KEY secret updated" -ForegroundColor Green

# Keep tauri.conf.json's public key in sync with the keypair.
$pubContent = (Get-Content -LiteralPath $pubFile -Raw).Trim()
$confPath = Join-Path $root "src-tauri\tauri.conf.json"
$conf = Get-Content -LiteralPath $confPath -Raw | ConvertFrom-Json
if ($conf.plugins.updater.pubkey -ne $pubContent) {
    $conf.plugins.updater.pubkey = $pubContent
    $conf | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $confPath -Encoding utf8
    Write-Host "[OK] Sync'd public key into src-tauri/tauri.conf.json" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# 4. Version bump (package.json + tauri.conf.json + Cargo.toml)
# ----------------------------------------------------------------------------
$pkgPath = Join-Path $root "package.json"
$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$oldVersion = [string]$pkg.version
Write-Host "Current version: $oldVersion" -ForegroundColor Yellow

$part = $oldVersion -split '\.'
if ($part.Count -ne 3) { Write-Host "ERROR: version must be X.Y.Z (got: $oldVersion)" -ForegroundColor Red; exit 1 }
switch ($bumpType) {
    "major" { $newVersion = "$([int]$part[0]+1).0.0" }
    "minor" { $newVersion = "$($part[0]).$([int]$part[1]+1).0" }
    "patch" { $newVersion = "$($part[0]).$($part[1]).$([int]$part[2]+1)" }
    default { $newVersion = $bumpType }
}
Write-Host "New version:     $newVersion" -ForegroundColor Green

$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $pkgPath -Encoding utf8
$conf.version = $newVersion
$conf | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $confPath -Encoding utf8
$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$cargo = Get-Content -LiteralPath $cargoPath -Raw
$cargo = $cargo -replace '(?m)^version = ".*"$', "version = `"$newVersion`""
Set-Content -LiteralPath $cargoPath -Value $cargo -Encoding utf8
Write-Host "[OK] Version synced across package.json, tauri.conf.json, Cargo.toml" -ForegroundColor Green

# ----------------------------------------------------------------------------
# 5. Analysis-engine Python deps pre-flight
# ----------------------------------------------------------------------------
$python = if ($env:EESTIMATE_PYTHON) { $env:EESTIMATE_PYTHON } else { 'python' }
& $python -c "import PyInstaller, xslope, numpy, scipy, shapely, openpyxl, gmsh" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host @"

ERROR: The analysis-engine build Python is missing solver deps. Install them first:

  python -m pip install -r analysis/requirements-packaging.txt

(or set EESTIMATE_PYTHON to an interpreter that has them.)

"@ -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Analysis-engine Python deps present" -ForegroundColor Green

# ----------------------------------------------------------------------------
# 6. Commit version bump, tag, push, ensure release
# ----------------------------------------------------------------------------
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v$newVersion" --allow-empty
git push origin master
$tagName = "v$newVersion"
git tag -f $tagName
git push --force origin $tagName
Write-Host "[OK] Pushed v$newVersion tag" -ForegroundColor Green

& $gh release view $tagName --repo $repoSlug *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating GitHub release $tagName..." -ForegroundColor Cyan
    & $gh release create $tagName --repo $repoSlug --target master --title $tagName --notes "Automated release $tagName" *> $null
}
Write-Host "[OK] Release $tagName ready" -ForegroundColor Green

# ----------------------------------------------------------------------------
# 7. Build the analysis engine + signed Tauri installer
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "Building analysis engine + Tauri bundle (10-60+ min)..." -ForegroundColor Cyan
npm run publish:win
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: build failed" -ForegroundColor Red; exit 1 }

# ----------------------------------------------------------------------------
# 8. Verify the analysis engine sidecar exists (simulation tab depends on it)
# ----------------------------------------------------------------------------
$engine = Join-Path $root "vendor\bund-analysis\bund-analysis.exe"
if (-not (Test-Path -LiteralPath $engine)) {
    Write-Host "ERROR: bund-analysis.exe was not produced — the simulation tab ships broken." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Analysis engine present: $engine" -ForegroundColor Green

$nsisDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $installer) { Write-Host "ERROR: NSIS installer not found under $nsisDir" -ForegroundColor Red; exit 1 }
$sigFile = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $sigFile)) {
    Write-Host "ERROR: installer signature not produced (createUpdaterArtifacts / signing key?)" -ForegroundColor Red; exit 1
}
Write-Host "[OK] Built signed installer: $($installer.Name)" -ForegroundColor Green

# ----------------------------------------------------------------------------
# 9. Upload installer + signature + latest.json (auto-update)
# ----------------------------------------------------------------------------
$installerName = $installer.Name
$sigContent = (Get-Content -LiteralPath $sigFile -Raw).Trim()
$assetUrl = "https://github.com/$repoSlug/releases/download/$tagName/$installerName"
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$latest = [ordered]@{
    version  = $newVersion
    notes    = ""
    pub_date = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{ signature = $sigContent; url = $assetUrl }
    }
}
$latestPath = Join-Path $root "latest.json"
$latest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $latestPath -Encoding utf8

Write-Host "Uploading installer, signature and latest.json..." -ForegroundColor Cyan
& $gh release upload $tagName $installer.FullName $sigFile $latestPath --repo $repoSlug --clobber
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: upload failed" -ForegroundColor Red; exit 1 }
Remove-Item -LiteralPath $latestPath -Force

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  RELEASED v$newVersion (auto-update ready)" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Release:  https://github.com/$repoSlug/releases/tag/$tagName" -ForegroundColor Cyan
Write-Host "Installer: $installerName (includes the bundled analysis engine)" -ForegroundColor Cyan
