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

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) {
    $ghCandidates = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "C:\Program Files (x86)\GitHub CLI\gh.exe"
    )
    $gh = $ghCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $gh) {
    Write-Host "ERROR: GitHub CLI executable not found. Install GitHub CLI or add it to PATH." -ForegroundColor Red
    exit 1
}

# 2. Ensure GH_TOKEN is set
try {
    $env:GH_TOKEN = & $gh auth token 2>$null
} catch { }
if (-not $env:GH_TOKEN) {
    Write-Host "ERROR: Not logged into GitHub CLI. Run 'gh auth login' first." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] GitHub authenticated" -ForegroundColor Green

$repoSlug = "pramodsurya/E-Estimate"

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

# 6. Ensure release exists first (avoids electron-builder race on create-release)
$tagName = "v$newVersion"
& $gh release view $tagName --repo $repoSlug *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating GitHub release $tagName..." -ForegroundColor Cyan
    & $gh release create $tagName --repo $repoSlug --target master --title $tagName --notes "Automated release $tagName" *> $null
    if ($LASTEXITCODE -ne 0) {
        # If creation failed due to a parallel create, a second view will succeed.
        & $gh release view $tagName --repo $repoSlug *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to create or locate GitHub release $tagName" -ForegroundColor Red
            exit 1
        }
    }
}
Write-Host "[OK] Release $tagName is ready" -ForegroundColor Green

# 7. Build & Publish to GitHub Releases
Write-Host ""
Write-Host "Building & publishing to GitHub Releases..." -ForegroundColor Cyan
Write-Host "  (this will take 2-5 minutes)" -ForegroundColor Gray
Write-Host ""

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

$electronBuilder = Join-Path $root "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path $electronBuilder)) {
    Write-Host "ERROR: electron-builder executable not found in node_modules\.bin" -ForegroundColor Red
    exit 1
}

& $electronBuilder --win nsis --x64 --publish always
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: electron-builder publish failed. Trying direct release asset upload..." -ForegroundColor Yellow
    $exePath = Join-Path $root "release\E-Estimate-$newVersion-windows-x64.exe"
    $blockMapPath = "$exePath.blockmap"

    if (-not (Test-Path $exePath)) {
        Write-Host "ERROR: Publish failed and installer not found at $exePath" -ForegroundColor Red
        exit 1
    }

    & $gh release upload $tagName $exePath --repo $repoSlug --clobber
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Fallback upload failed for installer" -ForegroundColor Red
        exit 1
    }

    if (Test-Path $blockMapPath) {
        & $gh release upload $tagName $blockMapPath --repo $repoSlug --clobber
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Fallback upload failed for blockmap" -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "[OK] Fallback asset upload completed" -ForegroundColor Green
}

# 8. Ensure latest.yml exists, upload it, and verify the release asset.
Write-Host ""
Write-Host "Publishing latest.yml..." -ForegroundColor Cyan
$exeFile = Get-ChildItem "release" -Filter "E-Estimate-$newVersion-windows-x64.exe" | Select-Object -First 1
$latestYmlPath = Join-Path $root "release\latest.yml"

if (-not $exeFile) {
    Write-Host "ERROR: Installer not found; latest.yml cannot be published." -ForegroundColor Red
    exit 1
}

# electron-builder normally creates this file with the required base64 SHA-512
# checksum. Regenerate it only if it is missing or belongs to another version.
$generateLatestYml = -not (Test-Path $latestYmlPath)
if (-not $generateLatestYml) {
    $latestYmlContent = Get-Content $latestYmlPath -Raw -Encoding UTF8
    $expectedVersionLine = "(?m)^version:\s*$([regex]::Escape($newVersion))\s*$"
    $generateLatestYml = $latestYmlContent -notmatch $expectedVersionLine
}

if ($generateLatestYml) {
    Write-Host "Generating latest.yml for v$newVersion..." -ForegroundColor Cyan
    $stream = [System.IO.File]::OpenRead($exeFile.FullName)
    $sha512 = [System.Security.Cryptography.SHA512]::Create()
    try {
        $hash = [Convert]::ToBase64String($sha512.ComputeHash($stream))
    } finally {
        $sha512.Dispose()
        $stream.Dispose()
    }

    $size = $exeFile.Length
    $date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $yml = @"
version: $newVersion
files:
  - url: E-Estimate-$newVersion-windows-x64.exe
    sha512: $hash
    size: $size
path: E-Estimate-$newVersion-windows-x64.exe
sha512: $hash
releaseDate: '$date'
"@
    [System.IO.File]::WriteAllText($latestYmlPath, $yml, [System.Text.Encoding]::ASCII)
} else {
    Write-Host "[OK] Using latest.yml generated by electron-builder" -ForegroundColor Green
}

$uploadSucceeded = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
    & $gh release upload $tagName $latestYmlPath --repo $repoSlug --clobber
    if ($LASTEXITCODE -eq 0) {
        $uploadSucceeded = $true
        break
    }

    if ($attempt -lt 3) {
        Write-Host "WARNING: latest.yml upload attempt $attempt failed; retrying..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if (-not $uploadSucceeded) {
    Write-Host "ERROR: Failed to upload latest.yml after 3 attempts." -ForegroundColor Red
    exit 1
}

$releaseJson = & $gh release view $tagName --repo $repoSlug --json assets
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not verify assets for release $tagName." -ForegroundColor Red
    exit 1
}

$latestAsset = (($releaseJson | ConvertFrom-Json).assets |
    Where-Object { $_.name -eq "latest.yml" -and $_.state -eq "uploaded" } |
    Select-Object -First 1)
$localLatestYmlSize = (Get-Item $latestYmlPath).Length
if (-not $latestAsset -or $latestAsset.size -ne $localLatestYmlSize) {
    Write-Host "ERROR: GitHub release verification failed for latest.yml." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] latest.yml uploaded and verified" -ForegroundColor Green

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "  PUBLISHED: v$newVersion" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Release: https://github.com/pramodsurya/E-Estimate/releases/tag/v$newVersion" -ForegroundColor Cyan
Write-Host ""
Write-Host "Users will get the update notification next time they open the app!" -ForegroundColor Yellow
Write-Host ""

