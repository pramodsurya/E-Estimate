# One-pass verification for the Univer faithful-export work.
# Run from the repo root on a Windows dev machine with node + cargo installed:
#   powershell -ExecutionPolicy Bypass -File scripts/verify-exports.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/verify-exports.ps1 -SelfTest
# Every suite lands in the summary as PASS, FAIL, SKIP (toolchain-blocked) or
# MISSING. Suite output (including native stderr) is captured to a temp file
# so diagnostics survive even when the child crashes; the file content is
# printed in full. Any FAIL, SKIP or MISSING entry exits nonzero — a passing
# run never prints ALL PASSED while a proof is outstanding. -SelfTest runs one
# canned pass plus one canned failure (asserting the intended exit code) to
# prove the reporter itself reports honestly.

param([switch]$SelfTest)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$script:results = @()

function Add-Result([string]$Name, [string]$Status, [double]$Seconds, [string]$Detail) {
  $script:results += [pscustomobject]@{ Name = $Name; Status = $Status; Seconds = $Seconds; Detail = $Detail }
}

function Invoke-Suite([string]$Name, [string]$Command, [string]$Workdir) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $tmp = [System.IO.Path]::GetTempFileName()
  $code = 1
  try {
    if ($Workdir) { Push-Location $Workdir }
    try {
      # File redirect keeps stdout+stderr even if the child crashes hard.
      Invoke-Expression "$Command > `"$tmp`" 2>&1"
      $code = $LASTEXITCODE
    } finally {
      if ($Workdir) { Pop-Location }
    }
  } catch {
    "HARNESS ERROR: $($_.Exception.Message)" | Out-File -Append -FilePath $tmp -Encoding utf8
    $code = 1
  }
  $sw.Stop()
  $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  $text = ''
  if (Test-Path $tmp) {
    $text = (Get-Content -Raw -Path $tmp -ErrorAction SilentlyContinue)
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  }
  if ($null -eq $text) { $text = '' }
  if ($code -eq 0 -and $text -match '(?m)^SKIP:') {
    $status = 'SKIP'
  } elseif ($code -eq 0) {
    $status = 'PASS'
  } else {
    $status = 'FAIL'
  }
  Add-Result $Name $status $secs "exit=$code"
  Write-Host ''
  Write-Host "=== [$status] $Name (${secs}s) ==="
  if ($text -ne '') { $text -split "`r?`n" | ForEach-Object { Write-Host "  $_" } }
  return @{ Status = $status; Code = $code }
}

if ($SelfTest) {
  $p = Invoke-Suite 'selftest pass probe' 'node -e "process.stdout.write(String(41 + 1))"' $null
  $f = Invoke-Suite 'selftest fail probe' 'node -e "console.error(''boom''); process.exit(3)"' $null
  $selfOk = ($p.Status -eq 'PASS') -and ($f.Status -eq 'FAIL') -and ($f.Code -eq 3)
  Write-Host ''
  Write-Host '===== SELFTEST ====='
  $script:results | Format-Table -AutoSize | Out-String | Write-Host
  if ($selfOk) {
    Write-Host 'SELFTEST OK: pass reported PASS, fail reported FAIL with exit 3'
    exit 0
  }
  Write-Host 'SELFTEST BROKEN: reporter did not reproduce the expected outcomes'
  exit 2
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Add-Result 'node toolchain' 'MISSING' 0 'node not on PATH; all node suites blocked'
} else {
  $nodeSuites = @(
    'test-excel-mapping.cjs',
    'test-excel-mapping-pdf.cjs',
    'test-univer-fidelity.cjs',
    'test-univer-sheet-edgecases.cjs',
    'test-component-display-text.cjs',
    'test-nowrap-layout.cjs',
    'test-orange-wrap.cjs',
    'test-item-typst.cjs',
    'test-component-excel.cjs',
    'test-worksheet-typst.cjs'
  )
  foreach ($s in $nodeSuites) {
    if (Test-Path "scripts/$s") {
      Invoke-Suite "node $s" "node scripts/$s" $null | Out-Null
    } else {
      Add-Result "node $s" 'MISSING' 0 'suite file not found'
      Write-Host ''
      Write-Host "=== [MISSING] node $s ==="
    }
  }
}

if (Get-Command cargo -ErrorAction SilentlyContinue) {
  Invoke-Suite 'cargo test excel_compile' 'cargo test excel_compile' 'src-tauri' | Out-Null
} else {
  Add-Result 'cargo test excel_compile' 'MISSING' 0 'cargo not on PATH; Rust reopen proofs blocked'
  Write-Host ''
  Write-Host '=== [MISSING] cargo test excel_compile (cargo not on PATH) ==='
}

Write-Host ''
Write-Host '===== SUMMARY ====='
$script:results | Format-Table -AutoSize | Out-String | Write-Host
$bad = @($script:results | Where-Object { $_.Status -ne 'PASS' })
if ($bad.Count -gt 0) {
  Write-Host ("NOT COMPLETE: {0} suite(s) not passing ({1})" -f $bad.Count, (($bad | ForEach-Object { "$($_.Name)=$($_.Status)" }) -join ', '))
  exit 1
}
Write-Host 'ALL EXPORT CHECKS PASSED'
