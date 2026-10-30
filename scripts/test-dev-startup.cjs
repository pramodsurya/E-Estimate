const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { devPaths, probeServer, nativeInputsNewer } = require('./dev-fast.cjs')

test('fast desktop resolves the same local target and configured dev URL', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-dev-paths-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'src-tauri'))
  fs.writeFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ build: { devUrl: 'http://localhost:5173' } }))
  const paths = devPaths(root, { LOCALAPPDATA: path.join(root, 'local') })
  assert.equal(paths.url, 'http://localhost:5173')
  assert.equal(path.dirname(paths.exe), path.join(root, 'local', 'e-estimate', 'cargo-target', 'debug'))
  assert.equal(path.dirname(devPaths(root, { CARGO_TARGET_DIR: 'custom' }).exe), path.join(root, 'custom', 'debug'))

  const source = path.join(root, 'src-tauri', 'main.rs')
  fs.writeFileSync(source, 'fn main() {}')
  assert.equal(nativeInputsNewer(root, Date.now() + 1000), false)
  assert.equal(nativeInputsNewer(root, 0), true)
  // Generated build artifacts must not produce a false stale-source warning.
  fs.mkdirSync(path.join(root, 'src-tauri', 'target'))
  fs.writeFileSync(path.join(root, 'src-tauri', 'target', 'generated.rs'), '')
  fs.utimesSync(source, new Date(0), new Date(0))
  fs.utimesSync(path.join(root, 'src-tauri', 'tauri.conf.json'), new Date(0), new Date(0))
  assert.equal(nativeInputsNewer(root, 1000), false)
})

test('server reuse distinguishes this Vite app, an unrelated service, and a closed port', async (t) => {
  let body = '<title>E-Estimate</title><script src="/@vite/client"></script><script src="/src/main.tsx"></script>'
  const server = http.createServer((req, res) => res.end(body))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const url = `http://127.0.0.1:${server.address().port}`
  assert.equal(await probeServer(url), 'app')
  body = body.replace('E-Estimate', 'Another Vite app')
  assert.equal(await probeServer(url), 'other')
  await new Promise((resolve) => server.close(resolve))
  assert.equal(await probeServer(url), 'absent')
})

test('a slow service is not mistaken for an unrelated app or a free port', async (t) => {
  const server = http.createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  assert.equal(await probeServer(`http://127.0.0.1:${server.address().port}`, 30), 'unresponsive')
})
