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

function schedule(rows, total, unit = 'm³') {
  return { unit, rows, total }
}

function bundFixture(overrides = {}) {
  return {
    component_name: 'Test Bund',
    layout_label: 'NEW · HOMOGENEOUS',
    is_new: true,
    is_zoned: false,
    length_m: 120,
    datum_rl: 100,
    design: {
      mwl: 105, freeBoard: 1, topLevel: 106, ftl: 104,
      usSlope: 2, dsSlope: 2, stripDepth: 0.3, topWidth: 2.5
    },
    chainageUnit: undefined,
    schedules: {
      foundation: schedule(
        [
          { start_section: 10, end_section: 12, quantity: 660 },
          { start_section: 12, end_section: 14, quantity: 780 }
        ],
        1440
      ),
      formation: schedule(
        [
          { start_section: 50, end_section: 55, quantity: 3150 },
          { start_section: 55, end_section: 60, quantity: 3450 }
        ],
        6600
      )
    },
    sections: [
      {
        chainage: '0+000', chainage_m: 0, average_toe_rl: 100, height_m: 6,
        base_width_m: 30, detailed_ground_profile: true, svg: '',
        areas: { stripping: 3 }, ground_perimeter_m: 32,
        stations: [
          { distance_m: 0, existing_rl: 100, proposed_rl: 100, width_m: null, start_depth_m: null, end_depth_m: null, signed_area_m2: null },
          { distance_m: 10, existing_rl: 100, proposed_rl: 106, width_m: 10, start_depth_m: 0, end_depth_m: 6, signed_area_m2: 30 }
        ],
        hearting_stations: []
      },
      {
        chainage: '0+060', chainage_m: 60, average_toe_rl: 100.5, height_m: 5.5,
        base_width_m: 28, detailed_ground_profile: true, svg: '',
        areas: { stripping: 3.2 }, ground_perimeter_m: 30,
        stations: [
          { distance_m: 0, existing_rl: 100.5, proposed_rl: 100.5, width_m: null, start_depth_m: null, end_depth_m: null, signed_area_m2: null },
          { distance_m: 8, existing_rl: 100.5, proposed_rl: 106, width_m: 8, start_depth_m: 0, end_depth_m: 5.5, signed_area_m2: 22 }
        ],
        hearting_stations: []
      },
      {
        chainage: '0+120', chainage_m: 120, average_toe_rl: 101, height_m: 5,
        base_width_m: 26, detailed_ground_profile: true, svg: '',
        areas: { stripping: 3.4 }, ground_perimeter_m: 28,
        stations: [
          { distance_m: 0, existing_rl: 101, proposed_rl: 101, width_m: null, start_depth_m: null, end_depth_m: null, signed_area_m2: null },
          { distance_m: 6, existing_rl: 101, proposed_rl: 106, width_m: 6, start_depth_m: 0, end_depth_m: 5, signed_area_m2: 15 }
        ],
        hearting_stations: []
      }
    ],
    drawings: {
      assembly: '', upstream_toe: '', downstream_drain: '',
      rock_toe: '', filters: '', chute: ''
    },
    berms: [],
    excavation: [
      {
        role: 'stripping', quantity: 1440,
        classes: [
          { soil: 'Ordinary soil', percent: 70, code: 'E-1', description: '', quantity: 1008 },
          { soil: 'Hard soil', percent: 30, code: 'E-2', description: '', quantity: 432 }
        ]
      }
    ],
    excavation_by_code: [
      {
        code: 'E-1', description: 'Earthwork in ordinary soil', total: 1208, item_node_id: 'bund-exc-item',
        terms: [
          { role: 'stripping', label: 'Foundation stripping', quantity: 1008 },
          { role: 'ustoe-exc', label: 'Upstream toe wall', quantity: 200 }
        ]
      }
    ],
    payable_by_code: [
      {
        code: 'B-1', description: 'Homogeneous bund filling', unit: 'm³', total: 6600, item_node_id: 'bund-fill-item',
        terms: [{ role: 'bund', label: 'Bund', quantity: 6600 }]
      }
    ],
    clearance_manual: [{ length: 120, breadth: 2, quantity: 240 }],
    chute_geometry: {},
    configuration: {},
    document_settings: { paper: 'legal', flipped: false, margins: { top: 12, right: 10, bottom: 14, left: 16 } },
    phreatic: null,
    signature: [],
    ...overrides
  }
}

async function runTests() {
  console.log('--- Testing Bund template Excel sheets ---')

  const bundExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/bundExcel.ts')
  )
  const bundModel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/estimate-output/bundOutputModel.ts')
  )
  const model = (overrides = {}) => bundModel.finalizeBundOutputModel('test-bund', bundFixture(overrides))
  const noRaster = () => Promise.resolve(null)

  // Statement sheet: header, live Average/Total, live totals row, manual clearance.
  const rd = model()
  const statement = bundExcel.buildStatementSheet(rd, null)
  assert.equal(statement.cells[0].value, 'Test Bund')
  const avg = statement.cells.find((c) => typeof c.formula === 'string' && c.formula.startsWith('=AVERAGE('))
  assert.ok(avg, 'statement Average must be a live formula')
  const total = statement.cells.find((c) => typeof c.formula === 'string' && /^=SUM\(H\d+:H\d+\)$/.test(c.formula))
  assert.ok(total, 'statement Total column must sum live')
  const longRows = Array.from({ length: 294 }, (_, index) => ({
    from_chainage: String(index), to_chainage: String(index + 1),
    length_m: 1, start_section: 1, end_section: 1,
    average_section: 1, quantity: 1
  }))
  const firstSection = bundFixture().sections[0]
  const longSections = Array.from({ length: 295 }, (_, index) => ({
    ...firstSection, chainage: String(index), chainage_m: index
  }))
  const longStatement = bundExcel.buildStatementSheet(model({
    schedules: { foundation: schedule(longRows, 294) }, sections: longSections
  }), null)
  const longTotal = longStatement.cells.find((cell) =>
    typeof cell.formula === 'string' && /^=SUM\(H\d+:H\d+\)$/.test(cell.formula)
  )
  assert.ok(longTotal, '294-interval Bund subtotal must be a single Excel-safe range')
  const [, firstRow, lastRow] = /^=SUM\(H(\d+):H(\d+)\)$/.exec(longTotal.formula)
  assert.equal(Number(lastRow) - Number(firstRow) + 1, 294)
  const calculation = loadTsModule(
    path.join(root, 'src/renderer/src/lib/estimate-output/calculation.ts')
  )
  const sparseRegistry = new calculation.SemanticCellRegistry()
  const sparseRefs = Array.from({ length: 300 }, (_, index) => {
    const id = `sparse.${index}`
    sparseRegistry.register(id, { r: index * 2, c: 0 })
    return { op: 'ref', id }
  })
  const sparseFormula = calculation.compileCalculationExpression(
    { op: 'sum', values: sparseRefs }, sparseRegistry
  )
  assert.ok(sparseFormula.startsWith('=SUM(SUM('), 'non-contiguous totals must split into nested SUMs')
  const innerSums = [...sparseFormula.matchAll(/SUM\(([^()]*)\)/g)]
  assert.ok(innerSums.length >= 2)
  assert.ok(innerSums.every((match) => match[1].split(',').length <= 255), 'no SUM may exceed 255 arguments')
  const grandTotals = statement.cells.filter((c) => typeof c.formula === 'string' && c.formula.startsWith('=SUM('))
  assert.ok(grandTotals.length >= 3, 'totals row must sum every work column')
  const clearance = statement.cells.find((c) => typeof c.formula === 'string' && /^=A\d+\*B\d+$/.test(c.formula))
  assert.ok(clearance, 'manual clearance area must be live length x breadth')
  assert.ok(statement.rowBreaks.length >= 1, 'general arrangement must print separately from the statement')

  const repairStatement = bundExcel.buildStatementSheet(model({
    is_new: false,
    show_freeboard: false,
    show_repair_kind: true,
    repair_kind: 'Restoration',
    soil_source: 'Borrow area'
  }), null)
  const repairTexts = repairStatement.cells.map((cell) => cell.value)
  assert.ok(!repairTexts.includes('Freeboard (m)'), 'repair hides Freeboard when Typst hides it')
  assert.ok(repairTexts.some((value) => typeof value === 'string' && value.includes('Repair category: Restoration')), 'repair category and soil source retained')

  const zonedStatement = bundExcel.buildStatementSheet(model({
    is_zoned: true,
    show_hearting: true,
    show_cutoff_trench: true,
    hearting_design: { topLevel: 104, topWidth: 3, usSlope: 0.5, dsSlope: 0.5 },
    cutoff_trench: { resolved_depth_m: 2, area_m2: 7, bottomWidth: 2 }
  }), null)
  const zonedTexts = zonedStatement.cells.map((cell) => cell.value)
  assert.ok(zonedTexts.includes('Hearting top RL (m)'))
  assert.ok(zonedTexts.includes('Cut-off trench area (m²)'))

  const wide = model()
  wide.schedules = {
    ...wide.schedules,
    turfing: schedule(wide.schedules.foundation.rows, 10, 'm²'),
    rock_toe: schedule(wide.schedules.foundation.rows, 20),
    horizontal_filter: schedule(wide.schedules.foundation.rows, 30)
  }
  const wideStatement = bundExcel.buildStatementSheet(wide, null)
  assert.ok(wideStatement.cells.some((cell) => cell.value === 'Statement of quantities — continued'), 'wide statements split into printable continuation panels')
  assert.ok(wideStatement.rowBreaks.length >= 2, 'continuation panel starts on a new printed page')

  // Graphs sheet: one block per exhibit section with calculation + live total.
  const graphs = await bundExcel.buildGraphsSheet(rd, noRaster)
  assert.ok(graphs, 'detailed sections must yield a Graphs sheet')
  assert.ok(graphs.cells.some((c) => typeof c.value === 'string' && c.value.startsWith('Ch 0+000')), 'first section block present')
  assert.ok(graphs.cells.some((c) => typeof c.formula === 'string' && c.formula.startsWith('=SUM(E')), 'formation total must be live')
  assert.ok(graphs.cells.some((c) => c.value === 'Start point'), 'calculation text mirrors Typst')
  assert.ok(graphs.cells.some((c) => typeof c.value === 'string' && c.value.startsWith('* Detailed existing-ground')), 'detailed-profile explanation retained')

  const zonedGraphsData = model({ is_zoned: true })
  zonedGraphsData.sections = zonedGraphsData.sections.map((section, index) => ({
    ...section,
    hearting_stations: index === 0 ? section.stations : []
  }))
  const zonedGraphs = await bundExcel.buildGraphsSheet(zonedGraphsData, noRaster)
  assert.ok(zonedGraphs.cells.some((cell) => cell.value === 'Total hearting quantity'), 'hearting total is not mislabeled as formation')

  // New bunds without detailed profiles exhibit nothing: no Graphs sheet.
  const flat = model({
    sections: bundFixture().sections.map((s) => ({ ...s, detailed_ground_profile: false }))
  })
  assert.equal(await bundExcel.buildGraphsSheet(flat, noRaster), null)

  // Others sheet: classification, code totals (live), payable, no bund signature.
  const others = await bundExcel.buildOthersSheet(rd, noRaster)
  const texts = others.cells.map((c) => c.value)
  assert.ok(texts.includes('Earthwork excavation classification'))
  assert.ok(texts.includes('Total quantities of Excavation'))
  assert.ok(texts.includes('Total quantities'))
  const codeTotal = others.cells.find((c) => typeof c.formula === 'string' && c.formula.startsWith('=SUM('))
  assert.ok(codeTotal, 'code totals must sum their terms live')
  assert.ok(!texts.some((v) => typeof v === 'string' && /Executive Engineer|Superintending/i.test(v)), 'bund signature stays out (component keeps its own)')

  const rich = model()
  rich.excavation_by_code[0].descriptionRuns = [
    { text: 'Earthwork ', bold: true },
    { text: 'in ordinary soil', italic: true }
  ]
  rich.payable_by_code[0].descriptionRuns = [{ text: 'Homogeneous bund filling', underline: true }]
  const richOthers = await bundExcel.buildOthersSheet(rich, noRaster)
  assert.ok(richOthers.cells.some((cell) => cell.runs?.some((run) => run.style.italic)), 'excavation rich description retained')
  assert.ok(richOthers.cells.some((cell) => cell.runs?.some((run) => run.style.underline)), 'payable rich description retained')

  const details = model({
    drawings: { assembly: '', upstream_toe: '', downstream_drain: '', rock_toe: '', filters: '', chute: '<svg width="10" height="10"></svg>' },
    chute_geometry: { width_m: 1, depth_m: 0.5, excavation_area_m2: 0.5, lined_perimeter_m: 2, protection_measure: 'volume' },
    berms: [{ side: 'us', level: 103, svg: '', surface: null, drain: null, excavation: null }]
  })
  const detailSheet = await bundExcel.buildOthersSheet(details, noRaster)
  const detailTexts = detailSheet.cells.map((cell) => cell.value)
  assert.ok(detailTexts.some((value) => typeof value === 'string' && value.includes('Per chute, excavation = A × developed length')))
  assert.ok(detailTexts.includes('Berm shelves'))
  assert.ok(detailTexts.includes('U/S berms'))

  // Full assembly order + orientation.
  const plan = await bundExcel.prepareBundExcelPlan(rd)
  const sheets = plan.sheets
  assert.deepEqual(sheets.map((s) => s.name), ['Statement of Quantities', 'Graphs', 'Others'])
  assert.equal(sheets[0].landscape, true)
  assert.equal(sheets[0].grid.pageSetup.paperSize, 'Legal')
  assert.deepEqual(sheets[0].grid.pageSetup.marginsMm, { top: 12, right: 10, bottom: 14, left: 16 })
  const excRef = plan.totalRefs.get('bund-exc-item')
  const fillRef = plan.totalRefs.get('bund-fill-item')
  assert.ok(excRef && excRef.sheet === 'Others', 'excavation item owns an exact Others total cell')
  assert.ok(fillRef && fillRef.sheet === 'Others', 'payable item owns an exact Others total cell')
  const othersSheet = sheets.find((sheet) => sheet.name === 'Others')
  assert.ok(othersSheet.grid.cells.some((cell) => cell.r === excRef.r && cell.c === excRef.c && cell.formula), 'excavation ref lands on its live total formula')
  assert.ok(othersSheet.grid.cells.some((cell) => cell.r === fillRef.r && cell.c === fillRef.c && cell.formula), 'payable ref lands on its live total formula')
  const noGraphs = await bundExcel.prepareBundSheets(flat)
  assert.deepEqual(noGraphs.map((s) => s.name), ['Statement of Quantities', 'Others'])

  assert.equal(
    bundExcel.bundExcelFileName('Kodangal', 'Main Bund'),
    'Kodangal — Main Bund — Bund Statement.xlsx'
  )

  console.log('bund excel tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
