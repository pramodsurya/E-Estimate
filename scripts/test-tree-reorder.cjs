const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  })
  const loadedModule = new Module(filePath, module)
  loadedModule.filename = filePath
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const { reorderSibling, canReorderBetween, uniqueChildName } = loadTsModule(
  path.join(root, 'src/renderer/src/lib/tree.ts')
)

function node(id, kind, children = [], extra = {}) {
  return { id, kind, name: id, children, ...extra }
}

function order(tree, parentId) {
  const find = (n) => (n.id === parentId ? n : n.children.map(find).find(Boolean))
  return find(tree).children.map((child) => child.id)
}

function tree() {
  return node('root', 'title', [
    node('intro', 'page', [], { pageTemplate: 'introduction' }),
    node('cA', 'component', [node('i1', 'item'), node('i2', 'item'), node('i3', 'item')]),
    node('cB', 'component', []),
    node('cC', 'component', [])
  ])
}

// --- Moving down the list ---------------------------------------------------

// i1 dropped above i3 lands between i2 and i3.
assert.deepEqual(order(reorderSibling(tree(), 'i1', 'i3', 'above'), 'cA'), ['i2', 'i1', 'i3'])
// i1 dropped below i3 lands last.
assert.deepEqual(order(reorderSibling(tree(), 'i1', 'i3', 'below'), 'cA'), ['i2', 'i3', 'i1'])

// --- Moving up the list -----------------------------------------------------

assert.deepEqual(order(reorderSibling(tree(), 'i3', 'i1', 'above'), 'cA'), ['i3', 'i1', 'i2'])
assert.deepEqual(order(reorderSibling(tree(), 'i3', 'i1', 'below'), 'cA'), ['i1', 'i3', 'i2'])

// --- Components reorder under the Title, leaving the Introduction in place ---

assert.deepEqual(order(reorderSibling(tree(), 'cC', 'cA', 'above'), 'root'), [
  'intro',
  'cC',
  'cA',
  'cB'
])
assert.deepEqual(order(reorderSibling(tree(), 'cA', 'cC', 'below'), 'root'), [
  'intro',
  'cB',
  'cC',
  'cA'
])

// --- No-ops return the original tree object ---------------------------------

const original = tree()
// Same node.
assert.equal(reorderSibling(original, 'i1', 'i1', 'above'), original)
// Not siblings.
assert.equal(reorderSibling(original, 'i1', 'cB', 'above'), original)
// Unknown ids.
assert.equal(reorderSibling(original, 'nope', 'i1', 'above'), original)
assert.equal(reorderSibling(original, 'i1', 'nope', 'above'), original)
// A move that changes nothing (i1 above i2 when i1 is already before i2).
assert.equal(reorderSibling(original, 'i1', 'i2', 'above'), original)

// --- Drop eligibility -------------------------------------------------------

const item = node('x', 'item')
const otherItem = node('y', 'item')
const component = node('c', 'component')
const intro = node('p', 'page', [], { pageTemplate: 'introduction' })
const plainPage = node('q', 'page')
const generated = node('g', 'item', [], { templateGenerated: true })

assert.equal(canReorderBetween(item, otherItem), true)
// Different ordinary kinds may mix, so a Page can sit between DATA or Components.
assert.equal(canReorderBetween(item, component), true)
assert.equal(canReorderBetween(plainPage, component), true)
assert.equal(canReorderBetween(plainPage, item), true)
// The Introduction page is pinned at both ends of the check.
assert.equal(canReorderBetween(intro, plainPage), false)
assert.equal(canReorderBetween(plainPage, intro), false)
// Template-generated items are driven by their component dashboard.
assert.equal(canReorderBetween(generated, item), false)
assert.equal(canReorderBetween(item, generated), false)
assert.equal(canReorderBetween(item, item), false)

// --- Sibling-safe structure names -------------------------------------------

const namedParent = node('named', 'title', [
  node('g1', 'component', [], { name: 'Guide Wall' }),
  node('g2', 'component', [], { name: 'Guide Wall (2)' }),
  node('b1', 'component', [], { name: 'Bund' })
])
assert.equal(uniqueChildName(namedParent, 'Guide Wall'), 'Guide Wall (3)')
assert.equal(uniqueChildName(namedParent, 'guide wall'), 'guide wall (3)')
assert.equal(uniqueChildName(namedParent, 'New Structure'), 'New Structure')
assert.equal(uniqueChildName(namedParent, '  Bund  '), 'Bund (2)')

// --- The source tree is never mutated ---------------------------------------

const before = JSON.stringify(original)
reorderSibling(original, 'i1', 'i3', 'below')
assert.equal(JSON.stringify(original), before)

console.log('tree reorder: all assertions passed')
