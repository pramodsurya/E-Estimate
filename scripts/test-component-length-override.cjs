const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename
}).outputText, filename)
const tree = require('../src/renderer/src/lib/tree.ts')
const canal = require('../src/renderer/src/lib/canal.ts')
const bund = require('../src/renderer/src/lib/bund.ts')
const guide = require('../src/renderer/src/lib/guideWall.ts')
const root = path.resolve(__dirname, '..')

// Run the production handlers rather than reimplementing their length rules.
function handler(file, name, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  let expression
  function visit(node) {
    if ((ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) && node.name.getText(source) === name && node.initializer && ts.isArrowFunction(node.initializer)) expression = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `Missing production handler ${name}`)
  const code = ts.transpileModule(`const handler = ${expression}; handler;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new vm.Script(code).runInNewContext(context)
}
const line = [{ lat: 17.4, lng: 79.2 }, { lat: 17.48, lng: 79.7 }]
const measured = Math.round(guide.polylineLengthM(line))
assert.notEqual(measured, 60964)

function storeFixture() {
  let state = { project: tree.createDraftProject(), addStructure: { kind: 'component', parentId: null }, expanded: {} }
  const context = {
    ...tree,
    ...guide,
    defaultCanalData: canal.defaultCanalData,
    defaultBundData: bund.defaultBundData,
    syncBundItems: bund.syncBundItems,
    get: () => state,
    set: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } },
    mutate: fn => { state = { ...state, project: { ...state.project, root: fn(state.project.root) } } }
  }
  return { create: handler('src/renderer/src/store/useStore.ts', 'createStructureNode', context), node: () => state.project.root.children[0] }
}
function createFromWizard(typed, vertices = line, templateId = 'canal') {
  const store = storeFixture()
  handler('src/renderer/src/components/modals/AddStructureModal.tsx', 'handleCreate', {
    name: 'Length override test', nameConflict: null, batchNameConflict: null,
    pointTemplate: false, batchRows: null, templateId, line: vertices,
    lookup: vertices.length >= 2 ? { lat: 17.44, lng: 79.45 } : null,
    allowance: null, title: 'Canal', manualLengthM: typed,
    createStructureNode: store.create
  })()
  return store.node()
}
let node = createFromWizard('60964')
assert.equal(node.canal.lengthM, 60964, 'Creating from the map must immediately use the typed 60,964 m override')
assert.equal(node.canal.source, 'map')
assert.deepEqual(JSON.parse(JSON.stringify(node.canal.alignment)), line)
assert.deepEqual(JSON.parse(JSON.stringify(node.workingLine)), line)
assert.equal(node.location.lat, 17.44)
assert.equal(canal.migrateCanalData(node.canal).lengthM, 60964)
const configured = canal.resizeCanalSections({ ...node.canal, configured: true, intervalM: 25 }, node.canal.lengthM)
assert.equal(configured.sections.length, 2440)
assert.equal(configured.sections.at(-1).chainage, 60964)
assert.equal(JSON.parse(JSON.stringify(node)).canal.lengthM, 60964)

for (const typed of ['', '0', '-5', 'not-a-number', 'Infinity']) {
  node = createFromWizard(typed)
  assert.equal(node.canal.lengthM, measured, `Invalid/absent override ${typed} should keep map length`)
}
node = createFromWizard('60964', [])
assert.equal(node.canal.lengthM, 60964)
assert.equal(node.canal.source, 'manual')
assert.equal(node.canal.alignment.length, 0)
// The common creation path must retain the override for other line templates too.
for (const [id, field] of [['bund', 'bund'], ['guide-wall', 'guideWall']]) {
  node = createFromWizard('250', line, id)
  assert.equal(node[field].lengthM, 250)
  assert.equal(node[field].source, 'map')
}
// Direct callers also get the same precedence and ignore non-finite inputs.
for (const [length, expected] of [[60964, 60964], [undefined, measured], [NaN, measured], [Infinity, measured], [-5, measured]]) {
  const store = storeFixture()
  store.create('Direct caller', null, 'canal', { workingLine: line, manualLengthM: length })
  assert.equal(store.node().canal.lengthM, expected)
}
console.log('Component creation: typed map override, measured/manual fallbacks, alignment retention, canal section endpoints, persistence and other line templates passed.')
