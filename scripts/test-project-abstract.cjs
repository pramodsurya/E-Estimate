const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath, mocks = {}) {
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
  loadedModule.require = (request) => (request in mocks ? mocks[request] : require(request))
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

// Component totals come from finalNumber; here each item simply carries its
// amount so the abstract ladder itself is what is under test.
const estimateAmount = loadTsModule(
  path.join(root, 'src/renderer/src/lib/estimateAmount.ts')
)
const { formatCompactIndianEstimate, roundEstimateTotalUp } = estimateAmount
const { computeProjectAbstract } = loadTsModule(
  path.join(root, 'src/renderer/src/lib/projectAbstract.ts'),
  {
    './estimateAmount': estimateAmount,
    './finalNumber': {
      componentItemsTotal: (_project, node) =>
        node.children.reduce((sum, child) => sum + (child.amount ?? 0), 0)
    }
  }
)

/** Rupee-level comparison: summation order differs between test and lib. */
function close(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${message ?? 'value'}: expected ~${expected}, got ${actual}`
  )
}

function component(id, name, amount) {
  return { id, kind: 'component', name, children: [{ id: `${id}-i`, kind: 'item', amount, children: [] }] }
}

// The worked example from the Bayyaram general abstract.
const project = {
  formatVersion: 1,
  id: 'p1',
  meta: { name: 'Bayyaram', sorYear: '2025-26', location: null, flags: [] },
  root: {
    id: 'root',
    kind: 'title',
    name: 'Title',
    children: [
      component('c1', 'Bund', 74992338),
      component('c2', 'Canal Guide walls', 556522587),
      component('c3', 'Drops', 20980863),
      component('c4', 'Catch drains', 3851745),
      component('c5', 'O.T. Sluices', 6260509),
      component('c6', 'Pipe Culverts', 5920954)
    ]
  },
  miscellaneousItems: [],
  createdAt: '',
  updatedAt: ''
}

const seigniorage = {
  totalSeigniorage: 12116545,
  totalDmft: 3634964,
  totalSmft: 242331,
  totalPermit: 8604626
}

const abstract = computeProjectAbstract({ project, seigniorage, gstRate: 18 })

// Components are numbered in tree order and sum to the TOTAL line.
assert.equal(abstract.componentLines.length, 6)
assert.deepEqual(
  abstract.componentLines.map((line) => line.slNo),
  [1, 2, 3, 4, 5, 6]
)
assert.equal(abstract.componentLines[0].label, 'Bund')
assert.equal(abstract.componentsTotal, 668528996)

// Project Sync consumes the totals frozen by Component Dashboard Sync. It must
// not recalculate the component amounts from the component's Item rows.
const frozenComponentTotals = {
  c1: 101,
  c2: 202,
  c3: 303,
  c4: 404,
  c5: 505,
  c6: 606
}
const fromComponentDashboards = computeProjectAbstract({
  project,
  componentTotals: frozenComponentTotals,
  seigniorage,
  gstRate: 18
})
assert.deepEqual(
  fromComponentDashboards.componentLines.map((line) => line.amount),
  Object.values(frozenComponentTotals)
)
assert.equal(fromComponentDashboards.componentsTotal, 2121)

// Charges continue the numbering after the TOTAL row.
assert.deepEqual(
  abstract.chargeLines.map((line) => [line.slNo, line.key]),
  [
    [7, 'seigniorage'],
    [8, 'dmf'],
    [9, 'smet'],
    [10, 'nac'],
    [11, 'labour-cess'],
    [12, 'permit']
  ]
)

// Seigniorage-derived charges are passed straight through from the dashboard.
assert.equal(abstract.chargeLines[0].amount, 12116545)
assert.equal(abstract.chargeLines[1].amount, 3634964)
assert.equal(abstract.chargeLines[2].amount, 242331)
assert.equal(abstract.chargeLines[5].amount, 8604626)

// NAC 0.1% and labour cess 1% are levied on the components TOTAL.
assert.equal(abstract.chargeLines[3].label, 'NAC @ 0.1%')
assert.equal(abstract.chargeLines[3].amount, 668528.996)
assert.equal(abstract.chargeLines[4].label, 'Labour Cess @ 1%')
assert.equal(abstract.chargeLines[4].amount, 6685289.96)

// GST is charged on components + every charge above it.
const expectedBase =
  668528996 + 12116545 + 3634964 + 242331 + 668528.996 + 6685289.96 + 8604626
close(abstract.gstBase, expectedBase, 'gstBase')
close(abstract.gstAmount, (expectedBase * 18) / 100, 'gstAmount')
close(abstract.calculatedGrandTotal, expectedBase + abstract.gstAmount, 'calculatedGrandTotal')
assert.equal(abstract.grandTotal, Math.ceil(expectedBase + abstract.gstAmount))
assert.equal(abstract.roundedGrandTotal, abstract.grandTotal)

// The ordered line list carries TOTAL and GRAND TOTAL as unnumbered rows.
const totalLine = abstract.lines.find((line) => line.kind === 'total')
assert.equal(totalLine.slNo, null)
assert.equal(totalLine.amount, 668528996)
assert.equal(abstract.lines[abstract.lines.length - 1].kind, 'grand')
assert.equal(abstract.lines[abstract.lines.length - 1].slNo, null)
assert.equal(abstract.lines[abstract.lines.length - 1].amount, abstract.grandTotal)

// Covers use compact Indian notation with one decimal at most.
assert.equal(roundEstimateTotalUp(85986152.33), 85986153)
assert.equal(formatCompactIndianEstimate(85986152.33), '8.6 Crores')
assert.equal(formatCompactIndianEstimate(860000), '8.6 Lakhs')
assert.equal(formatCompactIndianEstimate(9930000), '99.3 Lakhs')
assert.equal(formatCompactIndianEstimate(12000000), '1.2 Crores')
assert.equal(formatCompactIndianEstimate(9995000), '1 Crores')

// Miscellaneous rows sit between the charges and GST, and are taxed.
const withMisc = computeProjectAbstract({
  project: {
    ...project,
    miscellaneousItems: [{ id: 'm1', name: 'Testing charges', cost: 100000, createdAt: '' }]
  },
  seigniorage,
  gstRate: 18
})
assert.equal(withMisc.miscellaneousTotal, 100000)
assert.equal(withMisc.miscellaneousLines[0].slNo, 13)
close(withMisc.gstBase, expectedBase + 100000, 'gstBase with miscellaneous')
// GST is renumbered after the miscellaneous row.
assert.equal(withMisc.lines.find((line) => line.kind === 'gst').slNo, 14)

// Percentages are configurable and reflected in the printed label.
const custom = computeProjectAbstract({
  project,
  seigniorage,
  gstRate: 12,
  nacPercent: 0.25,
  labourCessPercent: 2
})
assert.equal(custom.chargeLines[3].label, 'NAC @ 0.25%')
assert.equal(custom.chargeLines[3].amount, (668528996 * 0.25) / 100)
assert.equal(custom.chargeLines[4].amount, (668528996 * 2) / 100)
assert.equal(custom.lines.find((line) => line.kind === 'gst').label, 'LS Add G.S.T @ 12%')

// An empty project produces a well-formed, all-zero abstract.
const empty = computeProjectAbstract({
  project: { ...project, root: { ...project.root, children: [] } },
  seigniorage: { totalSeigniorage: 0, totalDmft: 0, totalSmft: 0, totalPermit: 0 },
  gstRate: 18
})
assert.equal(empty.componentLines.length, 0)
assert.equal(empty.componentsTotal, 0)
assert.equal(empty.grandTotal, 0)

console.log('project general abstract: all assertions passed')
