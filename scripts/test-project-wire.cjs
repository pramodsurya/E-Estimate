const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function (m, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  m._compile(outputText, filename)
}

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
  loadedModule.require = (request) => {
    if (request in mocks) return mocks[request]
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile, mocks)
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

function grid(cells, cols) {
  return {
    cells,
    merges: [],
    colWidthsChars: cols,
    rowHeightsPt: cols.map(() => null),
    images: [],
    rowBreaks: []
  }
}

const ITEM_NODE = { id: 'n1', kind: 'item', itemCode: 'SSR-01', unit: 'cum', children: [] }
const COMP_NODE = { id: 'c1', kind: 'component', name: 'Main Canal', itemCode: 'CMP-01', children: [ITEM_NODE] }

function project() {
  return {
    id: 'p1',
    meta: { name: 'Kodangal Lift' },
    root: { id: 'root', children: [COMP_NODE] },
    dashboardSnapshot: {
      componentRates: {},
      componentRecipes: {},
      dataDashboardEntries: [],
      leadDashboardEntries: [
        { variantId: 'v1', materialName: 'Sand', variantName: 'V1', leadKm: 5 }
      ]
    },
    leadChart: {
      variants: [{ id: 'v1', materialName: 'Sand' }],
      applications: [{ id: 'a1', variantId: 'v1', itemNodeId: 'n1' }]
    }
  }
}

function mocks() {
  const parts = {
    renderData: {
      abstract: [
        { sl: '1', code: 'SSR-01', heading: 'Earthwork', description: 'd', rawQty: 10 }
      ],
      component: { name: 'Main Canal' }
    },
    directNodes: [ITEM_NODE],
    headers: [{ code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'd' }],
    details: [
      { name: 'Earthwork', grid: grid([{ r: 0, c: 0, value: 'Cutting' }], [20]), qtyRef: { r: 0, c: 0 } }
    ],
    detailed: null
  }
  const dataSheet = {
    id: 'ds1',
    itemNode: ITEM_NODE,
    recipe: { itemKey: 'rk1', itemCode: 'DAW-1', description: 'Earthwork data', unit: 'cum', outputQuantity: 1 },
    leadApplications: [
      { id: 'a1', variantId: 'v1', itemNodeId: 'n1', quantity: 2, grossRate: 20, unit: 'cum' }
    ],
    leadVariants: [],
    sorPrintRate: null,
    scopeName: undefined,
    usagePath: undefined,
    scope: undefined
  }
  return {
    './componentDetailPrep': {
      prepareComponentExcelParts: async () => parts
    },
    './guideWallExcel': {
      guideWallTotalKey: (role, code) => `${role}::${code}`,
      prepareGuideWallExcelPlan: async () => ({ sheets: [], totalRefs: new Map() }),
      projectGuideWallSheetName: () => 'GuideWall_test'
    },
    './bundExcel': {
      prepareBundExcelPlan: async () => ({ sheets: [], totalRefs: new Map() }),
      projectBundSheetNames: () => ({ statement: 'Bund Qty_test', graphs: 'Bund Graphs_test', others: 'Bund Others_test' })
    },
    './dataExcel': { buildDataExcelPayload: () => ({ recipes: [], sor: [] }) },
    './leadPayload': { buildLeadExcelPayload: () => ({ rows: [], materials: [], signature: [] }) },
    './seignioragePayload': { buildSeigniorageExcelPayload: () => ({ groups: [], totals: {} }) },
    './coverExcel': { buildCoverExcelPayload: async () => ({ workName: 'Kodangal Lift' }) },
    './pageExcel': {
      preparePageExcelPayload: async () => null,
      projectPageSheetName: (node) => `Page_${node.id}`
    },
    '../dataSheets': {
      collectDataSheets: () => [dataSheet],
      calculateDataSheets: async (sheets) => sheets.map((sheet) => ({
        ...sheet, calculatedSummary: { marker: 'native-rate-summary' }
      }))
    },
    '../typist-output/dataTypst': {
      buildRateAnalysisRenderData: (...args) => {
        assert.equal(args[4]?.marker, 'native-rate-summary', 'Project DATA uses the calculated native summary')
        return { totals: { rate_per_unit: 120, lead_total: 40, output_quantity: 1 } }
      }
    },
    '../typist-output/coverTypst': {
      coverExcelFields: () => ({
        workName: 'Kodangal Lift',
        village: 'Kodangal',
        mandal: 'Kodangal',
        district: 'Vikarabad',
        ssrYear: '2026-27'
      })
    },
    '../typist-output/seigniorageTypst': {
      resolveSeigniorageRowDescription: (p, row) => row.materialLabel || 'desc'
    },
    '../typist-output/guidewall/guideWallTypst': {
      buildGuideWallRenderData: () => ({})
    },
    '../typist-output/bund/bundTypst': {
      buildBundOutputModel: () => ({})
    },
    '../projectItems': {
      projectItemKey: (n) => n.id
    },
    '../projectPrintInputs': {
      collectProjectItems: () => [ITEM_NODE],
      computeProjectPrintInputs: () => ({
        recipes: {},
        abstract: {
          componentLines: [{ nodeId: 'c1', label: 'Main Canal' }],
          lines: [
            { kind: 'component', key: 'component:c1', nodeId: 'c1', label: 'Main Canal', amount: 0 },
            { kind: 'total', key: 'components-total', label: 'TOTAL', amount: 0 },
            { kind: 'charge', key: 'seigniorage', label: 'Add Seigniorage charges', amount: 0 },
            { kind: 'gst', key: 'gst', label: 'GST', amount: 0 },
            { kind: 'grand', key: 'grand-total', label: 'GRAND TOTAL', amount: 0 }
          ]
        },
        seigniorage: {
          rows: [
            {
              id: 'sr1', materialKey: 'sand', materialLabel: 'Sand', charge: null,
              seigRate: 50, itemNodeId: 'n1', itemQuantity: 10, quantity: 20,
              unit: 'cum', permitPercent: 80,
              quantityTerms: [{ itemNodeId: 'n1', quantity: 20, factor: 2 }]
            }
          ]
        },
        nacPercent: 1,
        labourCessPercent: 1,
        gstRate: 18
      }),
      projectDashboardIsReady: () => true
    },
    '../dashboardSync': {
      dashboardItemIsSynced: () => true
    },
    '../../store/useStore': {},
    '../typist-output/componentTypst': {},
    '../typist-output/documentTypst': {}
  }
}

async function runTests() {
  console.log('--- Testing project dashboard wiring ---')

  const wire = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectWire.ts'),
    mocks()
  )
  const projectExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )

  const input = await wire.assembleProjectDashboardInput(project())

  // 1. Components, items, DATA linkage.
  assert.equal(input.components.length, 1, 'one component sheet set')
  assert.deepEqual(input.components[0].itemKeys, ['n1'])
  assert.equal(input.items.length, 1)
  assert.equal(input.items[0].dataKey, 'ds1', 'item resolves through the DATA sheet node')
  assert.equal(input.items[0].staticQty, 10, 'static seed from the abstract rawQty')

  // 2. DATA base = estimator final minus lead portion.
  assert.equal(input.data.length, 1)
  assert.equal(input.data[0].sorRate, 80, '120 - 40/1')
  assert.deepEqual(input.data[0].leadKeys, ['ds1::a1'])

  // 3. Lead rows link applications to synced entries.
  assert.equal(input.leads.length, 1)
  assert.deepEqual(
    [input.leads[0].recipeKey, input.leads[0].qtyPerOutput, input.leads[0].grossRate, input.leads[0].km],
    ['ds1', 2, 20, 5]
  )

  // 4. Seigniorage preserves the exact backend term and Lead bucket.
  assert.equal(input.seigniorage.length, 1)
  assert.deepEqual(input.seigniorage[0].terms, [
    { itemKey: 'n1', factor: 2, leadVariantId: 'v1' }
  ])

  // 5. Charges follow the General Abstract; Gen order is top-level.
  assert.deepEqual(input.charges.map((c) => c.kind), ['seigniorage', 'gst'])
  assert.deepEqual(input.genOrder, ['Main Canal'])
  const signedProject = project()
  signedProject.signatureFooter = { enabled: true, placement: 'subject_end', rows: [{ id: 's1', designation: 'Executive Engineer', office: 'Head Office' }] }
  signedProject.signatureFooterOverrides = { c1: { enabled: true, placement: 'subject_end', rows: [{ id: 's2', designation: 'Assistant Engineer', office: 'Canal Division' }] } }
  const signedInput = await wire.assembleProjectDashboardInput(signedProject)
  assert.equal(signedInput.signatures[0].designation, 'Executive Engineer', 'Project signature comes from Project settings')
  assert.equal(signedInput.components[0].signatures[0].designation, 'Assistant Engineer', 'component override takes precedence')
  signedProject.signatureFooterOverrides.c1.enabled = false
  const disabledInput = await wire.assembleProjectDashboardInput(signedProject)
  assert.deepEqual(disabledInput.components[0].signatures, [], 'local disable suppresses inherited signatures')
  // 6. The assembled input compiles through the real builder.
  const payload = projectExcel.buildProjectDashboardPayload(input)
  assert.deepEqual(
    payload.sheets.map((s) => s.name),
    ['Gen Abstract', 'Abstract_Main Canal', 'Detailed_Main Canal']
  )

  // 7. Fail-loud: unsynced lead variant throws naming it.
  const wire2 = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectWire.ts'),
    {
      ...mocks(),
      '../dataSheets': {
        calculateDataSheets: async (sheets) => sheets.map((sheet) => ({
          ...sheet, calculatedSummary: { marker: 'native-rate-summary' }
        })),
        collectDataSheets: () => [
          {
            id: 'ds1',
            itemNode: ITEM_NODE,
            recipe: { itemKey: 'rk1', itemCode: 'DAW-1', description: 'd', unit: 'cum', outputQuantity: 1 },
            leadApplications: [
              { id: 'a9', variantId: 'missing', quantity: 1, grossRate: 1, unit: 'cum' }
            ],
            leadVariants: [],
            sorPrintRate: null,
            scopeName: undefined,
            usagePath: undefined,
            scope: undefined
          }
        ]
      }
    }
  )
  await assert.rejects(
    wire2.assembleProjectDashboardInput(project()),
    /lead variant 'missing' is not synced/,
    'unsynced lead variant throws'
  )

  console.log('project wiring tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
