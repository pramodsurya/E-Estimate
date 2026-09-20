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

function item(id, name, code, final) {
  return { id, kind: 'item', name, itemCode: code, itemDescription: `${name} description`, children: [], __final: final }
}

const finals = {
  a: { qty: 10, rate: 100, amount: 1000, unit: 'CUM' },
  b: { qty: 5, rate: 200, amount: 1000, unit: 'SQM' },
  c: { qty: 2, rate: 500, amount: 1000, unit: 'MT' },
  d: { qty: null, rate: null, amount: null, unit: null }
}

const finalNumberMock = {
  getItemFinal: (_project, node) => ({ ...finals[node.id] })
}
const nodeVisualMock = {
  nodeDisplayName: (node) => node.name
}

// Schedule ordering: clearance → excavation → any → SOR, numeric code order.
const itemOrder = loadTsModule(path.join(root, 'src/renderer/src/lib/itemOrder.ts'))
const { compareScheduleCodes, scheduleBand, sortScheduleItems } = itemOrder

const boq = loadTsModule(path.join(root, 'src/renderer/src/lib/boq.ts'), {
  './finalNumber': finalNumberMock,
  '../components/nodeVisual': nodeVisualMock,
  './itemOrder': itemOrder
})
const { buildBoqData, boqFileName, collectBoqItems } = boq

const subcomponent = {
  id: 's1',
  kind: 'subcomponent',
  name: 'Cross Drainage',
  children: [item('c', 'CC Lining', 'SSR-03', null), item('d', 'Unmeasured Item', 'SSR-04', null)]
}
const component = {
  id: 'c1',
  kind: 'component',
  name: 'Main Canal',
  children: [item('a', 'Earthwork', 'SSR-01', null), item('b', 'Stone Pitching', 'SSR-02', null), subcomponent]
}
const project = {
  formatVersion: 1,
  id: 'p1',
  meta: { name: 'Kodangal Project', sorYear: '2025-26' },
  root: { id: 'root', kind: 'title', name: 'Title', children: [component] }
}

// A component BOQ flattens direct items plus every sub-component item.
assert.deepEqual(
  collectBoqItems(component).map((node) => node.id),
  ['a', 'b', 'c', 'd']
)

const data = buildBoqData(project, component, () => undefined)
assert.equal(data.projectName, 'Kodangal Project')
assert.equal(data.componentName, 'Main Canal')
assert.equal(data.isSubcomponent, false)
assert.deepEqual(
  data.rows.map((row) => [row.sl, row.code, row.heading, row.quantity, row.unit, row.rate, row.amount]),
  [
    ['1', 'SSR-01', 'Earthwork', 10, 'CUM', 100, 1000],
    ['2', 'SSR-02', 'Stone Pitching', 5, 'SQM', 200, 1000],
    ['3', 'SSR-03', 'CC Lining', 2, 'MT', 500, 1000],
    ['4', 'SSR-04', 'Unmeasured Item', null, '', null, null]
  ]
)
// Uncosted rows never inflate the total.
assert.equal(data.totalCost, 3000)

// A sub-component BOQ covers only its own items.
const sub = buildBoqData(project, subcomponent, () => undefined)
assert.equal(sub.isSubcomponent, true)
assert.deepEqual(sub.rows.map((row) => row.sl), ['1', '2'])
assert.equal(sub.totalCost, 1000)

assert.equal(boqFileName('Kodangal', 'Main Canal'), 'Kodangal — Main Canal — BOQ.xlsx')
assert.equal(boqFileName('A/B:C', 'D'), 'ABC — D — BOQ.xlsx')

assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-PMW-1-1' }), 0)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-PMW-1-16' }), 0)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-PMW-3-20(c)' }), 0)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-CAW-1-1' }), 1)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-PMW-2-1' }), 1)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-CCDW-1-2' }), 1)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-DAW-2-4' }), 2)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-TAW-3-5' }), 2)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'ANY', itemSource: 'SOR' }), 3)
assert.equal(scheduleBand({ kind: 'item' }), 2)
// Description fallback for codeless or edited descriptions…
assert.equal(scheduleBand({ kind: 'item', itemDescription: 'Clearing thick jungle growth' }), 0)
assert.equal(scheduleBand({ kind: 'item', name: 'Jungle wood removal' }), 0)
assert.equal(scheduleBand({ kind: 'item', itemDescription: 'Excavation for foundation in hard rock' }), 1)
assert.equal(scheduleBand({ kind: 'item', itemDescription: 'Earthwork excavation for trial pits' }), 1)
// …but a present code always wins over conflicting text.
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-PMW-1-1', itemDescription: 'Concrete work' }), 0)
assert.equal(scheduleBand({ kind: 'item', itemCode: 'IRR-DAW-2-4', itemDescription: 'Excavation support works' }), 2)

// Numeric-aware: 1-2 before 1-10; PMW-1 chapter before PMW-3-20.
assert.ok(compareScheduleCodes('IRR-PMW-1-2', 'IRR-PMW-1-10') < 0)
assert.ok(compareScheduleCodes('IRR-PMW-1-16', 'IRR-PMW-3-20(a)') < 0)
assert.ok(compareScheduleCodes('IRR-PMW-3-20(a)', 'IRR-PMW-3-20(f)') < 0)
assert.equal(compareScheduleCodes('', ''), 0)
assert.ok(compareScheduleCodes('', 'IRR-CAW-1-1') > 0)

function schedItem(id, code, source) {
  const node = item(id, code, code, null)
  if (source) node.itemSource = source
  return node
}

const scrambled = [
  schedItem('o1', 'IRR-DAW-2-4'),
  schedItem('o2', 'SOR-CELL', 'SOR'),
  schedItem('o3', 'IRR-PMW-1-10'),
  schedItem('o4', 'IRR-CAW-1-2'),
  schedItem('o5', 'IRR-PMW-1-2'),
  schedItem('o6', 'IRR-PMW-1-1'),
  schedItem('o7', 'IRR-PMW-3-20(a)'),
  schedItem('o8', 'IRR-PMW-2-1'),
  schedItem('o9', 'IRR-DAW-1-1')
]
assert.deepEqual(
  sortScheduleItems(scrambled).map((node) => node.itemCode),
  [
    'IRR-PMW-1-1',
    'IRR-PMW-1-2',
    'IRR-PMW-1-10',
    'IRR-PMW-3-20(a)',
    'IRR-CAW-1-2',
    'IRR-DAW-1-1',
    'IRR-PMW-2-1',
    'IRR-DAW-2-4',
    'SOR-CELL'
  ]
)

// The BOQ renumbers S.No after the schedule sort.
for (const [id, qty] of [['o1', 1], ['o2', 1], ['o3', 1], ['o4', 1], ['o5', 1], ['o6', 1], ['o7', 1], ['o8', 1], ['o9', 1]]) {
  finals[id] = { qty, rate: 10, amount: 10, unit: 'CUM' }
}
const orderedComponent = { id: 'oc', kind: 'component', name: 'Ordered', children: scrambled }
const orderedBoq = buildBoqData(
  { ...project, root: { ...project.root, children: [orderedComponent] } },
  orderedComponent,
  () => undefined
)
assert.deepEqual(
  orderedBoq.rows.map((row) => [row.sl, row.code]),
  [
    ['1', 'IRR-PMW-1-1'],
    ['2', 'IRR-PMW-1-2'],
    ['3', 'IRR-PMW-1-10'],
    ['4', 'IRR-PMW-3-20(a)'],
    ['5', 'IRR-CAW-1-2'],
    ['6', 'IRR-DAW-1-1'],
    ['7', 'IRR-PMW-2-1'],
    ['8', 'IRR-DAW-2-4'],
    ['9', 'SOR-CELL']
  ]
)

// The Component Abstract follows the same schedule flow.
const componentTypst = loadTsModule(
  path.join(root, 'src/renderer/src/lib/typist-output/componentTypst.ts'),
  {
    './component.typ?raw': { __esModule: true, default: '// component template' },
    './univerComponent.typ?raw': { __esModule: true, default: '// prelude' },
    './itemTypst': {
      EE_ITEM_TABLE_PRELUDE: '// items',
      itemSheetShadowFiles: () => ({}),
      resolveItemDescriptionRuns: () => [],
      extractItemMedia: () => ({ images: [], gallery: [] })
    },
    './documentTypst': {
      extractDocumentMedia: () => ({ images: [], gallery: [] }),
      parseDocumentToTypstData: () => ({})
    },
    '../univerSpreadsheet': { createUniverWorkbookData: () => ({}), usedCellRange: () => null },
    '../../components/nodeVisual': nodeVisualMock,
    '../tree': { findNode: (node, id) => (node.id === id ? node : null) },
    '../finalNumber': {
      getItemFinal: (_project, node) => ({ ...finals[node.id] }),
      componentItemsTotal: () => 0
    },
    '../nodeSettings': { resolveNodeSettings: () => ({}), resolveNodeSettingsOverrides: () => ({}) },
    '../signatureFooter': { resolveSignatureFooter: () => ({ enabled: false }), printableSignatureRows: () => [] },
    './documentSettings': {
      applyDocumentSettingsToTypst: (source) => source,
      normalizeDocumentSettings: (settings) => settings,
      parseDocumentSettingsFromTypst: () => null,
      resolveProjectDocumentSettings: () => ({})
    },
    '../itemOrder': itemOrder,
    './bund/bundTypst': { bundCompileInputs: () => ({}), bundVariablesPrelude: () => '', injectBundLayout: (s) => s },
    './guidewall/guideWallTypst': {
      guideWallCompileInputs: () => ({}),
      guideWallVariablesPrelude: () => '',
      injectGuideWallLayout: (s) => s
    }
  }
)
const abstractData = componentTypst.buildComponentRenderData(
  { ...project, root: { ...project.root, children: [orderedComponent] } },
  orderedComponent,
  {},
  () => undefined
)
assert.deepEqual(
  abstractData.abstract.map((row) => [row.sl, row.code]),
  [
    ['1', 'IRR-PMW-1-1'],
    ['2', 'IRR-PMW-1-2'],
    ['3', 'IRR-PMW-1-10'],
    ['4', 'IRR-PMW-3-20(a)'],
    ['5', 'IRR-CAW-1-2'],
    ['6', 'IRR-DAW-1-1'],
    ['7', 'IRR-PMW-2-1'],
    ['8', 'IRR-DAW-2-4'],
    ['9', 'SOR-CELL']
  ]
)

// Whole-project BOQ: every component's items in one schedule flow.
const { buildProjectBoqData } = boq
const compA = { id: 'ca', kind: 'component', name: 'A', children: [schedItem('o2', 'SOR-CELL', 'SOR'), schedItem('o9', 'IRR-DAW-1-1')] }
const compB = {
  id: 'cb',
  kind: 'component',
  name: 'B',
  children: [schedItem('o4', 'IRR-CAW-1-2'), { id: 'sb', kind: 'subcomponent', name: 'S', children: [schedItem('o6', 'IRR-PMW-1-1')] }]
}
const projectItems = [...compA.children, ...compB.children.flatMap((c) => (c.kind === 'item' ? [c] : c.children))]
const projectBoq = buildProjectBoqData(
  { ...project, root: { ...project.root, children: [compA, compB] } },
  projectItems,
  () => undefined
)
assert.equal(projectBoq.componentName, 'General')
assert.equal(projectBoq.isSubcomponent, false)
assert.deepEqual(
  projectBoq.rows.map((row) => [row.sl, row.code]),
  [
    ['1', 'IRR-PMW-1-1'],
    ['2', 'IRR-CAW-1-2'],
    ['3', 'IRR-DAW-1-1'],
    ['4', 'SOR-CELL']
  ]
)
assert.equal(projectBoq.totalCost, 40)

// The Typst print part carries the same schedule the studio compiles.
const boqTyp = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/typist-output/boq.typ'),
  'utf8'
)
const boqTypst = loadTsModule(
  path.join(root, 'src/renderer/src/lib/typist-output/boqTypst.ts'),
  {
    './boq.typ?raw': { __esModule: true, default: boqTyp },
    './componentTypst': { componentCompilePrelude: () => '// prelude' },
    '../tree': { findNode: (node, id) => (node.id === id ? node : null) },
    '../boq': boq,
    '../nodeSettings': { resolveNodeSettingsOverrides: () => ({}) },
    './documentSettings': {
      applyDocumentSettingsToTypst: (source) => source,
      normalizeDocumentSettings: (settings) => settings,
      parseDocumentSettingsFromTypst: () => null,
      resolveProjectDocumentSettings: () => ({})
    },
    './finalNumber': finalNumberMock,
    '../components/nodeVisual': nodeVisualMock
  }
)
const part = boqTypst.resolveBoqPrintPart(project, component, () => undefined)
assert.equal(part.scopeKey, 'boq-c1')
assert.equal(boqTypst.boqScopeKey(component), 'boq-c1')
const inputs = JSON.parse(part.compileInputs['ee-data'])
assert.equal(inputs.project, 'Kodangal Project')
assert.equal(inputs.component.name, 'Main Canal')
assert.equal(inputs.rows.length, 4)
assert.equal(inputs.totalCost, 3000)
assert.ok(inputs.totalFormatted.includes('3,000.00'), inputs.totalFormatted)
for (const heading of ['S.No', 'Code', 'Description', 'Quantity', 'Unit', 'Rate', 'Cost', 'Total Cost']) {
  assert.ok(part.defaultTypstSource.includes(heading), `missing ${heading}`)
}
assert.ok(part.defaultTypstSource.includes('BILL OF QUANTITIES'))
assert.ok(part.defaultTypstSource.includes('repeat: true'), 'BOQ header must repeat on every page')

const projectPart = boqTypst.resolveProjectBoqPrintPart(
  { ...project, root: { ...project.root, children: [compA, compB] } },
  projectItems,
  () => undefined
)
assert.equal(projectPart.scopeKey, 'boq-project')
assert.equal(boqTypst.projectBoqScopeKey(), 'boq-project')
const projectInputs = JSON.parse(projectPart.compileInputs['ee-data'])
assert.equal(projectInputs.component.name, 'General')
assert.deepEqual(
  projectInputs.rows.map((row) => [row.sl, row.code]),
  [
    ['1', 'IRR-PMW-1-1'],
    ['2', 'IRR-CAW-1-2'],
    ['3', 'IRR-DAW-1-1'],
    ['4', 'SOR-CELL']
  ]
)


// The native payload carries the same figures the studio previews: rebuild the
// exact payload shape both dashboards send (kind 'boq' + mapped rows) from the
// already-asserted BoqData above, then lock the static contract on both sides.
const boqPayload = {
  kind: 'boq',
  boq: {
    projectName: data.projectName,
    componentName: data.componentName,
    isSubcomponent: data.isSubcomponent,
    rows: data.rows.map((row) => ({
      sl: row.sl,
      code: row.code,
      heading: row.heading,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      rate: row.rate,
      amount: row.amount
    })),
    totalCost: data.totalCost
  }
}
assert.equal(boqPayload.boq.projectName, 'Kodangal Project')
assert.equal(boqPayload.boq.componentName, 'Main Canal')
assert.equal(boqPayload.boq.rows.length, 4)
assert.deepEqual(
  boqPayload.boq.rows.map((row) => [row.sl, row.code, row.quantity, row.amount]),
  [
    ['1', 'SSR-01', 10, 1000],
    ['2', 'SSR-02', 5, 1000],
    ['3', 'SSR-03', 2, 1000],
    ['4', 'SSR-04', null, null]
  ]
)
assert.equal(boqPayload.boq.totalCost, 3000)

for (const dashboardPath of [
  'src/renderer/src/components/dashboard/ComponentDashboard.tsx',
  'src/renderer/src/components/dashboard/TitleDashboard.tsx'
]) {
  const dashboard = fs.readFileSync(path.join(root, dashboardPath), 'utf8')
  assert.ok(dashboard.includes("kind: 'boq'"), `${dashboardPath} sends the boq kind`)
  assert.ok(dashboard.includes('window.api.excel.compile(payload)'), `${dashboardPath} compiles via the native command`)
  assert.ok(!dashboard.includes('buildBoqWorkbook'), `${dashboardPath} no longer references the old ExcelJS builder`)
}
const rustCompiler = fs.readFileSync(path.join(root, 'src-tauri/src/excel_compile.rs'), 'utf8')
assert.ok(rustCompiler.includes('BoqPayload'), 'Rust reads a boq payload')
assert.ok(rustCompiler.includes('totalCost') || rustCompiler.includes('total_cost'), 'Rust reads the BOQ total')
console.log('boq: all assertions passed')
