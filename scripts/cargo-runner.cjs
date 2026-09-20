const { spawnSync } = require('child_process')
const path = require('path')
const os = require('os')

const root = path.resolve(__dirname, '..', 'src-tauri')
const cacheRoot = process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache')
const targetDir = path.join(cacheRoot, 'e-estimate', 'cargo-target')

const args = process.argv.slice(2)
console.log(`Running: cargo ${args.join(' ')} with CARGO_TARGET_DIR=${targetDir}`)

const res = spawnSync('cargo', args, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CARGO_TARGET_DIR: targetDir
  }
})

process.exit(res.status ?? 0)
