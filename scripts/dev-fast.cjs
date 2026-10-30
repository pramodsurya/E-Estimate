/** UI development in the real desktop shell, using the last debug executable. */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')

function devPaths(root = path.resolve(__dirname, '..'), env = process.env) {
  const cacheRoot = env.LOCALAPPDATA || env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
  const target = path.resolve(root, env.CARGO_TARGET_DIR || path.join(cacheRoot, 'e-estimate', 'cargo-target'))
  const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  return {
    root,
    exe: path.join(target, 'debug', process.platform === 'win32' ? 'e-estimate.exe' : 'e-estimate'),
    url: config.build.devUrl
  }
}

function probeServer(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const request = http.get(url, { agent: false }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(
        response.statusCode === 200 && body.includes('/@vite/client') && body.includes('/src/main.tsx') && /<title>\s*E-Estimate\s*<\/title>/.test(body)
          ? 'app' : 'other'
      ))
      response.on('error', () => resolve('other'))
    })
    request.setTimeout(timeoutMs, () => {
      resolve('unresponsive')
      request.destroy()
    })
    request.on('error', (error) => resolve(error.code === 'ECONNREFUSED' ? 'absent' : 'unresponsive'))
  })
}

function executableInUse(exe) {
  if (process.platform !== 'win32') return false
  try {
    fs.closeSync(fs.openSync(exe, 'r+'))
    return false
  } catch (error) {
    return ['EBUSY', 'EPERM', 'EACCES'].includes(error.code)
  }
}

function nativeInputsNewer(root, exeMtime) {
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['target', 'node_modules', '.git'].includes(entry.name)) continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (walk(file)) return true
      } else if (/\.(rs|toml|lock|json)$/.test(entry.name) && fs.statSync(file).mtimeMs > exeMtime) {
        return true
      }
    }
    return false
  }
  return walk(path.join(root, 'src-tauri'))
}

async function main() {
  const started = Date.now()
  const paths = devPaths()
  if (!fs.existsSync(paths.exe)) {
    throw new Error('No debug desktop build exists yet. Run npm run dev once, then use npm run dev:fast.')
  }
  const stale = nativeInputsNewer(paths.root, fs.statSync(paths.exe).mtimeMs)
  console.log(`\n  Fast UI development: reusing ${paths.exe}`)
  console.log('  Rust compilation and the Rust watcher are skipped. React/CSS changes still hot reload.')
  console.log('  After changing Rust, Cargo dependencies or Tauri configuration, run npm run dev to rebuild.')
  if (stale) console.warn('  Native inputs are newer than the executable; this session uses the previous native build.')
  if (process.argv.includes('--check')) return

  let server
  let desktop
  let closing = false
  async function close(code = 0) {
    if (closing) return
    closing = true
    desktop?.kill()
    await server?.close()
    process.exitCode = code
  }
  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
  try {
    const existing = await probeServer(paths.url)
    if (closing) return
    if (existing === 'other') throw new Error(`${paths.url} is occupied by another server. Stop it before starting dev:fast.`)
    if (existing === 'unresponsive') throw new Error(`The server at ${paths.url} did not respond. Wait for it to finish starting, then retry dev:fast.`)
    if (executableInUse(paths.exe)) {
      throw new Error('The debug desktop executable is already running or locked. Keep editing in that session, or close its window before starting dev:fast.')
    }
    if (existing === 'absent') {
      const { createServer } = await import('vite')
      if (closing) return
      const url = new URL(paths.url)
      server = await createServer({
        configFile: path.join(paths.root, 'vite.config.ts'),
        root: path.join(paths.root, 'src', 'renderer'),
        server: { host: url.hostname, port: Number(url.port), strictPort: true }
      })
      if (closing) { await server.close(); return }
      await server.listen()
    } else {
      console.log(`  Reusing the running Vite server at ${paths.url}.`)
    }
    if (closing) return
    desktop = spawn(paths.exe, [], { cwd: path.join(paths.root, 'src-tauri'), stdio: 'inherit' })
    desktop.once('spawn', () => console.log(`  Desktop process launched in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`))
    desktop.once('error', (error) => { console.error(error.message); void close(1) })
    desktop.once('exit', (code) => void close(code ?? 0))
  } catch (error) {
    console.error(`  ${error.message}`)
    await close(1)
  }
}

module.exports = { devPaths, probeServer, nativeInputsNewer }
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
