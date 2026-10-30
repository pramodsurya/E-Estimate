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

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`
}

const startedAt = Date.now()
let progressTimer = null
let phase = 'Starting the frontend dev server'

if (command === 'dev' || command === 'build') {
  console.log('\n  Native build cache:')
  console.log(`    ${targetDir}`)
  if (command === 'dev') {
    console.log('  Cargo checks the native build before opening the desktop window.')
    console.log('  For React/CSS work with the existing native build: npm run dev:fast')
    console.log('  Keep this session running while editing; Vite hot reloads the UI.')
    console.log('  Browser UI: http://localhost:5173')
  }
  console.log('')
}

if (command === 'dev') {
  progressTimer = setInterval(() => {
    console.log(`  [dev] ${phase} (${formatElapsed(Date.now() - startedAt)}).`)
  }, 30000)
}

const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const child = spawn(process.execPath, [tauriCli, command, ...extra], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
  windowsHide: false
})
// Read Tauri/Cargo output rather than guessing readiness from a file timestamp
// or a locked executable. A cached build need not write that executable at all.
let output = ''
let launched = false
function forward(stream, chunk) {
  stream.write(chunk)
  if (command !== 'dev') return
  output = (output + chunk.toString().replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')).slice(-8192)
  for (const line of output.split(/\r?\n/)) {
    if (line.includes('Running DevCommand')) phase = 'Cargo checking/building the native app'
    if (line.includes('Blocking waiting for file lock')) phase = 'Waiting for another Cargo process to release its lock'
    if (/Compiling\s|Checking\s/.test(line)) phase = 'Cargo compiling the native app'
    if (line.includes('Finished `dev` profile')) phase = 'Launching the desktop app'
    if (!launched && line.includes('Running `') && line.includes(exeName)) {
      launched = true
      clearInterval(progressTimer)
      progressTimer = null
      console.log(`  [dev] Desktop process launched (${formatElapsed(Date.now() - startedAt)}).`)
    }
  }
}
child.stdout.on('data', (chunk) => forward(process.stdout, chunk))
child.stderr.on('data', (chunk) => forward(process.stderr, chunk))
child.on('error', (error) => {
  if (progressTimer) clearInterval(progressTimer)
  console.error(error.message)
  process.exitCode = 1
})
child.on('close', (code, signal) => {
  if (progressTimer) clearInterval(progressTimer)
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
