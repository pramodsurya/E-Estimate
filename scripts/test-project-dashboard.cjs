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

function fixture() {
  return {
    projectName: 'Kodangal Lift',
    cover: {
      workName: 'Kodangal Lift',
      village: 'Kodangal',
      mandal: 'Kodangal',
      district: 'Vikarabad',
      ssrYear: '2026-27'
    },
    components: [
      {
        name: 'Main Canal',
        code: 'CMP-01',
        itemKeys: ['k1', 'k2'],
        headers: [
          { code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Earthwork desc' },
          { code: 'SSR-02', name: 'Pitching', unit: 'sqm', description: 'Pitching' }
        ],
        details: [
          {
            name: 'Earthwork',
            grid: grid(
              [
                { r: 0, c: 0, value: 'Cutting' },
                { r: 1, c: 0, value: 10 }
              ],
              [20, 14]
            ),
            qtyRef: { r: 1, c: 0 }
          },
          null
        ]
      }
    ],
    items: [
      { key: 'k1', component: 'Main Canal', code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Earthwork desc', dataKey: 'd1' },
      { key: 'k2', component: 'Main Canal', code: 'SSR-02', name: 'Pitching', unit: 'sqm', description: 'Pitching', staticQty: 5, dataKey: 'd1' }
    ],
    data: [
      { key: 'd1', code: 'DAW-1', description: 'Earthwork data', unit: 'cum', sorRate: 100, outputQty: 1, leadKeys: ['l1'] }
    ],
    leads: [
      { key: 'l1', label: 'Sand lead', unit: 'cum', recipeKey: 'd1', qtyPerOutput: 2, grossRate: 20, km: 5 }
    ],
    seigniorage: [
      { key: 's1', description: 'Sand seigniorage', unit: 'cum', itemKey: 'k1', policyRate: 50, permitPercent: 80 }
    ],
    charges: [
      { kind: 'seigniorage', label: 'Add Seigniorage charges' },
      { kind: 'dmf', label: 'DMF 30%', percent: 30 },
      { kind: 'gst', label: 'LS Add G.S.T @ 18%', percent: 18 }
    ]
  }
}

function sheetOf(payload, name) {
  const sheet = payload.sheets.find((s) => s.name === name)
  assert.ok(sheet, `sheet '${name}' must exist`)
  return sheet
}

function cellAt(sheet, r, c) {
  const cell = sheet.grid.cells.find((cell) => cell.r === r && cell.c === c)
  assert.ok(cell, `cell ${r},${c} on '${sheet.name}' must exist`)
  return cell
}

async function runTests() {
  console.log('--- Testing project dashboard workbook ---')

  const projectExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )

  const payload = projectExcel.buildProjectDashboardPayload(fixture())
  const abstractExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/generalAbstractExcel.ts')
  )
  const standalone = abstractExcel.buildStandaloneGeneralAbstractExcelSheet('Kodangal Lift', {
    lines: [
      { key: 'component:c1', slNo: 1, label: 'Main Canal', amount: 100, kind: 'component' },
      { key: 'components-total', slNo: null, label: 'TOTAL', amount: 100, kind: 'total' },
      { key: 'seigniorage', slNo: 2, label: 'Add Seigniorage charges', amount: 5, kind: 'charge' },
      { key: 'dmf', slNo: 3, label: 'DMF 30%', amount: 1.5, kind: 'charge' },
      { key: 'gst', slNo: 4, label: 'LS Add G.S.T @ 18%', amount: 19.17, kind: 'gst' },
      { key: 'grand-total', slNo: null, label: 'GRAND TOTAL', amount: 126, kind: 'grand' }
    ]
  })
  assert.deepEqual(standalone.grid.colWidthsChars, sheetOf(payload, 'Gen Abstract').grid.colWidthsChars,
    'standalone and Project General Abstract use the same column layout')
  assert.equal(cellAt(standalone, 2, 2).value, 100, 'standalone carries the dashboard value')
  assert.equal(cellAt(sheetOf(payload, 'Gen Abstract'), 2, 2).formula, "='Abstract_Main Canal'!G7",
    'Project carries a live component reference in that same cell')

  // 1. Workbook tab order follows the Typst book.
  assert.deepEqual(
    payload.sheets.map((s) => s.name),
    ['Gen Abstract', 'Abstract_Main Canal', 'Detailed_Main Canal'],
    'Project-owned sheets exclude the reusable Lead and DATA templates'
  )

  // 2. Abstract quantities reference the detail cells, rates reference DATA.
  const abs = sheetOf(payload, 'Abstract_Main Canal')
  assert.equal(cellAt(abs, 3, 3).formula, "='Detailed_Main Canal'!B4", 'qty -> detail cell')
  assert.equal(cellAt(abs, 3, 5).formula, '=0', 'native writer owns the DATA formula address')
  assert.deepEqual(
    payload.links.find((link) => link.sheet === 'Abstract_Main Canal' && link.r === 3 && link.c === 5),
    { sheet: 'Abstract_Main Canal', r: 3, c: 5, kind: 'data-rate', key: 'd1' },
    'rate cell carries a stable DATA-key link'
  )
  assert.equal(cellAt(abs, 3, 6).formula, '=D4*F4', 'amount = qty * rate')
  assert.equal(cellAt(abs, 4, 3).value, 5, 'static seed kept for item without detail')
  assert.equal(cellAt(abs, 6, 6).formula, '=SUM(G4:G5)', 'component total sums amounts')

  // 3. Existing Seigniorage template receives exact Abstract-backed terms.
  assert.equal(payload.seigniorageLinks[0].terms[0].formula, "='Abstract_Main Canal'!D4*1")

  // 4. General Abstract exposes the exact live cell consumed by reused Cover.
  const gen = sheetOf(payload, 'Gen Abstract')
  assert.equal(cellAt(gen, 2, 2).formula, "='Abstract_Main Canal'!G7", 'component line -> abstract total')
  assert.equal(cellAt(gen, 4, 2).formula, '=0', 'native writer owns the Seigniorage total address')
  assert.ok(payload.links.some((link) => link.kind === 'seigniorage'))
  assert.match(cellAt(gen, 7, 2).formula, /^=CEILING\(/, 'grand total rounds up')
  assert.equal(payload.coverCostRef, "'Gen Abstract'!C8", 'reused cover -> grand total')

  const signed = fixture()
  signed.signatures = [{ id: 'project-signature', designation: 'Executive Engineer', office: 'Head Office' }]
  signed.components[0].signatures = [{ id: 'component-signature', designation: 'Assistant Engineer', office: 'Canal Division' }]
  const signedPayload = projectExcel.buildProjectDashboardPayload(signed)
  assert.ok(sheetOf(signedPayload, 'Gen Abstract').grid.cells.some((cell) => cell.value === 'Executive Engineer\nHead Office'))
  assert.ok(sheetOf(signedPayload, 'Detailed_Main Canal').grid.cells.some((cell) => cell.value === 'Assistant Engineer\nCanal Division'))
  assert.equal(cellAt(sheetOf(signedPayload, 'Gen Abstract'), 2, 2).formula, "='Abstract_Main Canal'!G7", 'signatures do not move formula cells')
  assert.equal(signedPayload.coverCostRef, payload.coverCostRef, 'signatures do not move the cover link')

  const withPages = fixture()
  withPages.rootPages = [{ name: 'Page_Introduction_Pintro', grid: grid([{ r: 0, c: 0, value: 'Intro' }], [50]), landscape: false }]
  withPages.components[0].pages = [{ name: 'Page_Notes_Pnotes', grid: grid([{ r: 0, c: 0, value: 'Notes' }], [50]), landscape: true }]
  const pagePayload = projectExcel.buildProjectDashboardPayload(withPages)
  assert.deepEqual(
    pagePayload.sheets.map((s) => s.name),
    ['Page_Introduction_Pintro', 'Gen Abstract', 'Abstract_Main Canal', 'Detailed_Main Canal', 'Page_Notes_Pnotes'],
    'root/component pages use their prebuilt standalone grids in project order'
  )

  // 5. Template-owned sheets keep their image payload and can be the exact
  // live quantity source for a generated Abstract item.
  const withGuideWall = fixture()
  withGuideWall.components[0].templateSheets = [{
    name: 'GuideWall_Main_c1',
    grid: {
      ...grid([{ r: 8, c: 5, formula: '=SUM(F6:F8)' }], [10, 10, 10, 10, 10, 16]),
      images: [{ r: 1, c: 0, dataBase64: 'iVBORw0KGgo=', mime: 'image/png' }]
    },
    landscape: false
  }]
  withGuideWall.items[1].detailRef = { sheet: 'GuideWall_Main_c1', r: 8, c: 5 }
  const guidePayload = projectExcel.buildProjectDashboardPayload(withGuideWall)
  assert.deepEqual(
    guidePayload.sheets.map((s) => s.name),
    ['Gen Abstract', 'Abstract_Main Canal', 'GuideWall_Main_c1', 'Detailed_Main Canal']
  )
  assert.equal(
    cellAt(sheetOf(guidePayload, 'Abstract_Main Canal'), 4, 3).formula,
    "='GuideWall_Main_c1'!F9"
  )
  assert.equal(sheetOf(guidePayload, 'GuideWall_Main_c1').grid.images.length, 1, 'cross-section image survives project payload')

  const subOnly = fixture()
  const branch = { ...subOnly.components[0], name: 'Branch' }
  subOnly.components = [
    { name: 'Main Canal', itemKeys: [], headers: [], details: [], subs: ['Branch'] },
    branch
  ]
  subOnly.genOrder = ['Main Canal']
  subOnly.items.forEach((item) => { item.component = 'Branch' })
  const subPayload = projectExcel.buildProjectDashboardPayload(subOnly)
  assert.equal(cellAt(sheetOf(subPayload, 'Abstract_Main Canal'), 5, 6).formula, '=SUM(G4:G4)',
    'a parent containing only sub-components must still roll up its S-row')

  // 6. Fail-loud: missing DATA key and quantity with no source both throw.
  const badData = fixture()
  badData.items[0].dataKey = ''
  assert.throws(
    () => projectExcel.buildProjectDashboardPayload(badData),
    /has no DATA key/,
    'missing DATA key throws'
  )
  const badQty = fixture()
  delete badQty.items[1].staticQty
  assert.throws(
    () => projectExcel.buildProjectDashboardPayload(badQty),
    /neither a detail quantity cell nor a staticQty/,
    'quantity with no source throws'
  )
  const frozenCalculatedQty = fixture()
  frozenCalculatedQty.items[1].requiresDetailQuantity = true
  assert.throws(
    () => projectExcel.buildProjectDashboardPayload(frozenCalculatedQty),
    /calculated item 'k2' has no fixed Detailed quantity cell/,
    'calculated custom items never silently fall back to a frozen quantity'
  )

  console.log('project dashboard workbook tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
