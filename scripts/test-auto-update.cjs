const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const policySource = fs.readFileSync(path.join(root, 'src/renderer/src/lib/autoUpdatePolicy.ts'), 'utf8')
const compiled = ts.transpileModule(policySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const policy = { exports: {} }
new Function('module', 'exports', compiled)(policy, policy.exports)
const { AUTO_UPDATE_IDLE_MS, canPrepareAutomaticUpdate } = policy.exports

const safe = {
  idleForMs: AUTO_UPDATE_IDLE_MS,
  unsavedProject: false,
  unsavedCluster: false,
  creatingProject: false,
  editorOpen: false,
  simulationRunning: false,
  clusterLoading: false
}
assert.equal(canPrepareAutomaticUpdate(safe), true)
assert.equal(canPrepareAutomaticUpdate({ ...safe, idleForMs: AUTO_UPDATE_IDLE_MS - 1 }), false)
for (const block of ['unsavedProject', 'unsavedCluster', 'creatingProject', 'editorOpen', 'simulationRunning', 'clusterLoading']) {
  assert.equal(canPrepareAutomaticUpdate({ ...safe, [block]: true }), false, `${block} must block installation`)
}

const controller = fs.readFileSync(path.join(root, 'src/renderer/src/components/UpdateNotification.tsx'), 'utf8')
assert.match(controller, /await project\.saveProject\(\{ requireSaved: true \}\)/)
assert.match(controller, /await cluster\.saveCluster\(\)/)
assert.match(controller, /if \(!stillSafe\(\) \|\| project\.dirty \|\| cluster\.clusterDirty\)/)
assert.match(controller, /saveAndInstallUpdate\(api\.update\.install, safeToPrepare\)/)
assert.match(controller, /setInterval\(checkPeriodically, UPDATE_CHECK_INTERVAL_MS\)/)

const native = fs.readFileSync(path.join(root, 'src-tauri/src/update.rs'), 'utf8')
assert.ok(native.indexOf('state.set_bytes(bytes)') < native.lastIndexOf('app.emit("update:downloaded"'),
  'the installer bytes must be stored before the ready event is emitted')
assert.match(native, /"checking" \| "available" \| "downloading" \| "downloaded"/,
  'a periodic check must not discard a prepared update')

console.log('automatic update idle, save, and download-readiness checks passed')
