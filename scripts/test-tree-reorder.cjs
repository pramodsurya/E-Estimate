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

const { reorderSibling, canReorderBetween, uniqueChildName, patchNode, addChildren, removeNode, moveNode, canMoveNode } = loadTsModule(
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

// --- One-step move (Explorer up/down arrows) ---------------------------------

// Move an item one step within its component.
assert.deepEqual(order(moveNode(tree(), 'i3', 'up'), 'cA'), ['i1', 'i3', 'i2'])
assert.deepEqual(order(moveNode(tree(), 'i1', 'down'), 'cA'), ['i2', 'i1', 'i3'])
// Move a component past an ordinary sibling, leaving the pinned page untouched.
assert.deepEqual(order(moveNode(tree(), 'cC', 'up'), 'root'), ['intro', 'cA', 'cC', 'cB'])
// A pinned page in the way blocks the move entirely (no partial swaps).
const pinnedTree = tree()
assert.equal(moveNode(pinnedTree, 'cA', 'up'), pinnedTree)
assert.ok(canMoveNode(tree(), 'cB', 'up'))
assert.ok(canMoveNode(tree(), 'cA', 'down'))
assert.ok(!canMoveNode(tree(), 'cA', 'up'), 'pinned Introduction blocks an upward move')
assert.ok(!canMoveNode(tree(), 'cC', 'down'), 'no sibling below to move onto')
assert.ok(!canMoveNode(tree(), 'intro', 'up'), 'pinned page never moves')

// Template-generated rows are hidden and skipped rather than treated as targets.
const withGen = node('root', 'title', [
  node('comp', 'component', [
    node('gen', 'item', [], { templateGenerated: true }),
    node('a', 'item'),
    node('b', 'item')
  ])
])
assert.ok(!canMoveNode(withGen, 'a', 'up'), 'first visible item has nothing above it')
assert.deepEqual(order(moveNode(withGen, 'b', 'up'), 'comp'), ['gen', 'b', 'a'])
assert.equal(moveNode(withGen, 'a', 'up'), withGen)
assert.deepEqual(order(moveNode(withGen, 'a', 'down'), 'comp'), ['gen', 'b', 'a'])

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

// Tree edits preserve untouched references and never mutate the input.
const editSource = tree()
const editSnapshot = JSON.stringify(editSource)
const added = node('i4', 'item')
for (const edited of [
  patchNode(editSource, 'i2', { name: 'Renamed' }),
  addChildren(editSource, 'cA', [added]),
  removeNode(editSource, 'i2')
]) {
  assert.notEqual(edited, editSource)
  assert.notEqual(edited.children[1], editSource.children[1])
  assert.equal(edited.children[0], editSource.children[0])
  assert.equal(edited.children[2], editSource.children[2])
  assert.equal(edited.children[1].children[0], editSource.children[1].children[0])
}
assert.equal(patchNode(editSource, 'i2', { name: 'Renamed' }).children[1].children[1].name, 'Renamed')
assert.deepEqual(order(addChildren(editSource, 'cA', [added]), 'cA'), ['i1', 'i2', 'i3', 'i4'])
assert.deepEqual(order(removeNode(editSource, 'i2'), 'cA'), ['i1', 'i3'])
assert.equal(patchNode(editSource, 'missing', {}), editSource)
assert.equal(addChildren(editSource, 'missing', [added]), editSource)
assert.equal(addChildren(editSource, 'cA', []), editSource)
assert.equal(removeNode(editSource, 'missing'), editSource)
assert.equal(removeNode(editSource, 'root'), editSource)
assert.equal(JSON.stringify(editSource), editSnapshot)

// Preserve first-match semantics, including direct-child priority for removal.
const duplicateTree = node('root', 'title', [
  node('branch', 'component', [node('duplicate', 'item')]),
  node('duplicate', 'item')
])
const patchedDuplicate = patchNode(duplicateTree, 'duplicate', { name: 'First' })
assert.equal(patchedDuplicate.children[0].children[0].name, 'First')
assert.equal(patchedDuplicate.children[1], duplicateTree.children[1])
const removedDuplicate = removeNode(duplicateTree, 'duplicate')
assert.deepEqual(removedDuplicate.children, [duplicateTree.children[0]])

console.log('tree edits and reorder: all assertions passed')
