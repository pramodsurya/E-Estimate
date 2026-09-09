# E-Estimate Release trigger (CI builds in the cloud).
#
# Usage: .\scripts\publish.ps1            # patch bump
#        .\scripts\publish.ps1 minor      # or major / an explicit version
#        .\scripts\publish.ps1 patch -Local   # build on THIS machine instead
#
# DEFAULT (recommended): keys/secrets/version are prepared, then the version
# commit + tag are pushed — the GitHub Actions `release.yml` workflow builds the
# analysis engine + signed installer IN THE CLOUD and uploads it to the release.
# You can close this window immediately; it completes on GitHub.
#
# -Local: builds + uploads on this machine (needs the Python deps + Rust). Note
#         it still pushes the tag, so the cloud workflow will also run on it.

param(
    [string]$bumpType = "patch",
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

$repoSlug = "pramodsurya/E-Estimate"

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  E-Estimate - Release" -ForegroundColor Cyan
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

$privateKeyContent = (Get-Content -LiteralPath $keyFile -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY = $privateKeyContent
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyFile

# ----------------------------------------------------------------------------
# 3. GitHub CLI + publish the signing key as a repo secret
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

& $gh secret set TAURI_SIGNING_PRIVATE_KEY --repo $repoSlug --body $privateKeyContent
Write-Host "[OK] TAURI_SIGNING_PRIVATE_KEY secret updated (CI will sign)" -ForegroundColor Green

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
# 4. Commit any uncommitted source so the release builds the latest code.
#    Only project source paths are staged — generated/tooling/temp dirs
#    (tmp/, outputs/, scratch/, vendor/, node_modules/, .env, etc.) are left.
# ----------------------------------------------------------------------------
$sourcePaths = @(
    '.gitignore', '.github', 'analysis', 'BUND_SIMULATION_PLAN.md', 'docs',
    'package.json', 'package-lock.json', 'README.md', 'scripts', 'src',
    'src-tauri', 'supabase', 'tsconfig.node.json', 'tsconfig.web.json', 'vite.config.ts'
)
git add -A -- $sourcePaths
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "chore: commit working tree before releasing"
    Write-Host "[OK] Committed uncommitted project source so the tag builds it" -ForegroundColor Green
} else {
    Write-Host "[OK] No uncommitted project source (or only generated/untracked dirs)" -ForegroundColor Green
}

# ----------------------------------------------------------------------------
# 5. Version bump (package.json + tauri.conf.json + Cargo.toml)
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
# 5. Commit + tag + push (this triggers the cloud release)
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

if (-not $Local) {
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "  Cloud release triggered for v$newVersion" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "GitHub Actions is now building the analysis engine + installer" -ForegroundColor Cyan
    Write-Host "in the cloud. You can close this window and walk away." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Watch:  https://github.com/$repoSlug/actions" -ForegroundColor Cyan
    Write-Host "Result: https://github.com/$repoSlug/releases/tag/$tagName" -ForegroundColor Cyan
    exit 0
}

# ============================================================================
# -Local: build and upload from this machine (CI will also run on the tag).
# ============================================================================
$python = if ($env:EESTIMATE_PYTHON) { $env:EESTIMATE_PYTHON } else { 'python' }
& $python -c "import PyInstaller, xslope, numpy, scipy, shapely, openpyxl, gmsh" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: analysis-engine Python deps missing. Run: python -m pip install -r analysis/requirements-packaging.txt" -ForegroundColor Red
    exit 1
}

Write-Host "Building analysis engine + Tauri installer locally (10-60+ min)..." -ForegroundColor Cyan
npm run publish:win
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: build failed" -ForegroundColor Red; exit 1 }

$engine = Join-Path $root "vendor\bund-analysis\bund-analysis.exe"
if (-not (Test-Path -LiteralPath $engine)) { Write-Host "ERROR: bund-analysis.exe not produced" -ForegroundColor Red; exit 1 }
$nsisDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem $nsisDir -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $installer) { Write-Host "ERROR: NSIS installer not found" -ForegroundColor Red; exit 1 }
$sigFile = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $sigFile)) { Write-Host "ERROR: installer signature not produced" -ForegroundColor Red; exit 1 }

& $gh release view $tagName --repo $repoSlug *> $null
if ($LASTEXITCODE -ne 0) {
    & $gh release create $tagName --repo $repoSlug --target master --title $tagName --notes "Automated release $tagName" *> $null
}
$installerName = $installer.Name
$sigContent = (Get-Content -LiteralPath $sigFile -Raw).Trim()
$assetUrl = "https://github.com/$repoSlug/releases/download/$tagName/$installerName"
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$latest = [ordered]@{
    version = $newVersion; notes = ""; pub_date = $pubDate
    platforms = [ordered]@{ "windows-x86_64" = [ordered]@{ signature = $sigContent; url = $assetUrl } }
}
$latestPath = Join-Path $root "latest.json"
$latest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $latestPath -Encoding utf8
& $gh release upload $tagName $installer.FullName $sigFile $latestPath --repo $repoSlug --clobber
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: upload failed" -ForegroundColor Red; exit 1 }
Remove-Item -LiteralPath $latestPath -Force

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  RELEASED v$newVersion (local build)" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
