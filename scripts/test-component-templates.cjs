const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function compileTs(loadedModule, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  loadedModule._compile(outputText, filename)
}

// The MI Sluice ('mi-sluice-new') component template was retired. Only the
// Guide Wall and Bund templates may be offered or referenced by live code.
const registry = require(path.join(root, 'src/renderer/src/templates/registry.ts'))

assert.deepEqual(
  registry.COMPONENT_TEMPLATES.map((entry) => entry.id),
  ['guide-wall', 'bund', 'canal'],
  'component registry offers guide-wall, bund and canal'
)
assert.equal(
  registry.COMPONENT_TEMPLATES.find((entry) => entry.id === 'canal')?.comingSoon,
  true,
  'Canal remains listed with a coming-soon label'
)

const retiredModules = [
  'src/renderer/src/components/sluice',
  'src/renderer/src/lib/miSluiceNew.ts',
  'src/renderer/src/lib/miSluiceFigure.ts',
  'scripts/test-mi-sluice-new.cjs'
]
for (const rel of retiredModules) {
  assert.ok(!fs.existsSync(path.join(root, rel)), `${rel} must not exist`)
}

const TOKEN = /mi-sluice-new|MiSluice|miSluice/i
const offenders = []
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === 'node_modules') continue
      scan(full)
      continue
    }
    if (!/\.(ts|tsx|cjs)$/.test(entry.name)) continue
    if (full === __filename) continue
    const text = fs.readFileSync(full, 'utf8')
    // project.ts keeps one retired-state field so old project files still load.
    const scrubbed =
      full === path.join(root, 'src/renderer/src/types/project.ts')
        ? text
            .replace("Retired 'mi-sluice-new' template state: never created; old project files ignore it.", '')
            .replace('miSluiceNew?: unknown', '')
        : text
    if (TOKEN.test(scrubbed)) offenders.push(path.relative(root, full))
  }
}
scan(path.join(root, 'src/renderer/src'))
scan(path.join(root, 'scripts'))

assert.deepEqual(offenders, [], `sluice references remain in: ${offenders.join(', ')}`)

console.log('component-templates: sluice retired; guide-wall, bund, canal offered')
