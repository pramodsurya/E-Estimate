/**
 * Run Tauri with a Cargo target dir off OneDrive.
 *
 * This repo lives under OneDrive\Desktop. Cargo incremental artifacts in
 * src-tauri/target get synced, locked, or deleted, so `npm run dev` recompiles
 * hundreds of crates (Typst/krilla) from scratch. LOCALAPPDATA is a normal NTFS folder.
 *
 * Usage: node scripts/tauri-run.cjs dev|build [...tauri args]
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const command = process.argv[2] || 'dev'
const extra = process.argv.slice(3)
const root = path.resolve(__dirname, '..')
const cacheRoot =
  process.env.LOCALAPPDATA ||
  process.env.XDG_CACHE_HOME ||
  path.join(os.homedir(), '.cache')
const targetDir = process.env.CARGO_TARGET_DIR || path.join(cacheRoot, 'e-estimate', 'cargo-target')
const exeName = process.platform === 'win32' ? 'e-estimate.exe' : 'e-estimate'
const exePath = path.join(targetDir, 'debug', exeName)
const lockPath = path.join(root, 'src-tauri', 'Cargo.lock')

fs.mkdirSync(targetDir, { recursive: true })
process.env.CARGO_TARGET_DIR = targetDir

// Cargo's default progress bar often vanishes in npm/Windows consoles, so the
// minutes after "Watching src-tauri" look frozen. Force color + progress, and
// keep stderr flowing (Tauri already passes `--color always` to cargo).
process.env.CARGO_TERM_COLOR = process.env.CARGO_TERM_COLOR || 'always'
process.env.CARGO_TERM_PROGRESS = process.env.CARGO_TERM_PROGRESS || 'always'
process.env.CARGO_TERM_PROGRESS_WHEN = process.env.CARGO_TERM_PROGRESS_WHEN || 'always'
if (!process.env.CARGO_TERM_PROGRESS_WIDTH) {
  process.env.CARGO_TERM_PROGRESS_WIDTH = '80'
}

function crateCount() {
  try {
    const n = (fs.readFileSync(lockPath, 'utf8').match(/\[\[package\]\]/g) || []).length
    return n > 0 ? n : 695
  } catch {
    return 695
  }
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`
}

function debugLastWrite() {
  try {
    return fs.statSync(path.join(targetDir, 'debug')).mtime.toLocaleTimeString()
  } catch {
    return 'not created yet'
  }
}

const startedAt = Date.now()
let progressTimer = null

if (command === 'dev' || command === 'build') {
  const n = crateCount()
  console.log('')
  console.log(`  Cargo is compiling ~${n} crates into:`)
  console.log(`    ${targetDir}`)
  console.log('  First Typst/krilla debug build can take 30–90 minutes; the first')
  console.log('  "Compiling ..." line can take several minutes. That is rustc working,')
  console.log('  not a hang. "Watching src-tauri" is Tauri\'s file watcher — compile starts after it.')
  console.log('  `--no-default-features` is normal (Tauri CLI). Do not cargo clean.')
  if (command === 'dev') {
    console.log('  Vite UI while Rust compiles:  http://localhost:5173')
    console.log('  Desktop window opens only after this compile finishes.')
  }
  console.log('  Leave this terminal running — stopping it cancels the compile.')
  console.log('')
}

if (command === 'dev') {
  progressTimer = setInterval(() => {
    let exeMtime = 0
    try {
      exeMtime = fs.statSync(exePath).mtimeMs
    } catch {
      exeMtime = 0
    }
    const elapsed = Date.now() - startedAt
    if (exeMtime >= startedAt - 2000) {
      console.log(
        `  [cargo] ${exeName} is ready (${formatElapsed(elapsed)}). The desktop window should open.`
      )
      clearInterval(progressTimer)
      progressTimer = null
      return
    }
    console.log(
      `  [cargo] still compiling (${formatElapsed(elapsed)}) into LOCALAPPDATA — debug last write ${debugLastWrite()}. Keep waiting.`
    )
  }, 30000)
}

const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const child = spawn(process.execPath, [tauriCli, command, ...extra], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  windowsHide: false
})
child.on('exit', (code, signal) => {
  if (progressTimer) clearInterval(progressTimer)
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
