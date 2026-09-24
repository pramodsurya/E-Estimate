const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const readExcelRust = require('./read-excel-rust.cjs')

const root = path.resolve(__dirname, '..')

const defaultMocks = {
  '../typist-output/componentTypst': {},
  '../typist-output/documentTypst': {},
  '@univerjs/core': {}
}

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
  const allMocks = { ...defaultMocks, ...mocks }
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
    if (request in allMocks) return allMocks[request]
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile, allMocks)
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

async function runTests() {
  console.log('--- Testing Component Statement Excel Export (native rust_xlsxwriter payload path) ---')

  // The payload module is type-only over componentTypst: no runtime mocks needed.
  const componentExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/componentExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )
  assert.equal(typeof componentExcel.buildComponentExcelPayload, 'function', 'buildComponentExcelPayload must exist')
  assert.equal(typeof componentExcel.componentExcelFileName, 'function', 'componentExcelFileName must exist')

  // Fixture mirroring buildComponentRenderData: two direct items, one
  // sub-component roll-up (S-prefixed), two detail items plus one
  // template-generated item the Typst detail loop skips.
  const renderData = {
    project: 'Kodangal Project',
    component: {
      id: 'c1',
      name: 'Main Canal',
      code: 'CMP-01',
      isSubcomponent: false,
      totalCost: 4500,
      totalFormatted: '4,500.00'
    },
    abstract: [
      { sl: '1', code: 'SSR-01', heading: 'Earthwork', description: 'Earthwork description', qty: '10', rawQty: 10, unit: 'CUM', rate: '100.00', rawRate: 100, amount: '1,000.00', rawAmount: 1000 },
      { sl: '2', code: 'SSR-02', heading: 'Stone Pitching', description: '', qty: '5', rawQty: 5, unit: 'SQM', rate: '200.00', rawRate: 200, amount: '1,000.00', rawAmount: 1000 },
      { sl: 'S1', code: '', heading: 'Cross Drainage', description: 'Sub-component · separate General Abstract follows', qty: '1', rawQty: 1, unit: 'LS', rate: '2,500.00', rawRate: 2500, amount: '2,500.00', rawAmount: 2500 }
    ],
    items: [
      { id: 'a', code: 'SSR-01', name: 'Earthwork', unit: 'CUM', description: 'Earthwork description', templateGenerated: false },
      { id: 'b', code: 'SSR-02', name: 'Stone Pitching', unit: 'SQM', description: '', templateGenerated: false },
      { id: 't1', code: 'GEN-01', name: 'Template Bed', unit: 'm', description: '', templateGenerated: true }
    ],
    signature: [{ designation: 'Executive Engineer', office: 'Test Division' }]
  }

  // 1. Payload mapping mirrors the Typst algorithm.
  const payload = componentExcel.buildComponentExcelPayload(renderData)
  assert.equal(payload.projectName, 'Kodangal Project', 'Project name passes through')
  assert.equal(payload.componentName, 'Main Canal', 'Component name passes through')
  assert.equal(payload.componentCode, 'CMP-01', 'Component code passes through')
  assert.equal(payload.isSubcomponent, false, 'Subcomponent flag passes through')
  assert.equal(payload.abstractRows.length, 3, 'All abstract rows carried')
  assert.deepEqual(
    payload.abstractRows.map((row) => [row.sl, row.quantity, row.rate, row.amount, row.subtotal]),
    [
      ['1', 10, 100, 1000, false],
      ['2', 5, 200, 1000, false],
      ['S1', 1, 2500, 2500, true]
    ],
    'Raw numbers flow (not display strings); S-rows flagged subtotal'
  )
  assert.equal(payload.totalCost, 4500, 'Total cost passes through')
  assert.equal(payload.items, undefined, 'no Items register — Abstract plus detail sheets only')
  assert.deepEqual(
    payload.signatures,
    [{ designation: 'Executive Engineer', office: 'Test Division' }],
    'Signatures pass through'
  )
  console.log('✓ Payload mapping verified (abstract + S-rows + signatures)')

  // 2. Filename mirrors boqFileName sanitizing.
  assert.equal(
    componentExcel.componentExcelFileName('Kodangal', 'Main Canal'),
    'Kodangal — Main Canal — Component Statement.xlsx',
    'Filename shape matches the BOQ convention'
  )
  assert.equal(
    componentExcel.componentExcelFileName('A/B:C', 'D'),
    'ABC — D — Component Statement.xlsx',
    'Filename strips illegal characters like boqFileName'
  )
  console.log('✓ Filename verified')

  // 2b. Detail sheets: spreadsheet grid, document grid, images, formulas.
  assert.equal(typeof componentExcel.buildComponentDetailSheets, 'function', 'buildComponentDetailSheets must exist')
  const detailGrid = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts')
  )
  assert.equal(detailGrid.columnLabel(0), 'A', 'Column A')
  assert.equal(detailGrid.columnLabel(27), 'AB', 'Column AB')
  assert.equal(detailGrid.sanitizeSheetName('A/B:C*D?E[F]G'), 'A B C D E F G', 'Sheet name strips illegal chars')
  assert.equal(
    detailGrid.splitDataUrl('data:image/png;base64,QUJD').mime,
    'image/png',
    'Data URL mime splits out'
  )
  assert.equal(
    detailGrid.splitDataUrl('data:image/png;base64,QUJD').dataBase64,
    'QUJD',
    'Data URL bytes split out'
  )

  // Spreadsheet grid: values, styles, merges rebased to the range origin.
  const sheetDetails = componentExcel.buildComponentDetailSheets([
    {
      kind: 'sheet',
      sheetNameHint: 'Earthwork/Detail:1',
      range: { startRow: 1, startColumn: 1, endRow: 2, endColumn: 2 },
      sheet: {
        cellData: {
          1: {
            1: { v: 'Qty', s: 'h1' },
            2: { v: 10, s: { bl: 1, n: { pattern: '#,##0' } } }
          },
          2: { 1: { v: 'Rate', s: 'h1' }, 2: { v: 100.5 } }
        },
        mergeData: [{ startRow: 0, startColumn: 1, endRow: 0, endColumn: 2 }],
        styles: { h1: { bl: 1, ht: 'c' } },
        defaultColW: 88,
        defaultRowH: 24
      },
      colWidthsPx: [88, 88],
      rowHeightsPx: [24, 24],
      qtyRef: { r: 0, c: 1 },
      images: [
        {
          relLeftPx: 100,
          relTopPx: 10,
          widthPx: 44,
          heightPx: 12,
          origWPx: 88,
          origHPx: 24,
          dataBase64: 'QUJD',
          mime: 'image/png'
        }
      ]
    },
    {
      kind: 'document',
      sheetNameHint: 'Stone Pitching',
      doc: {
        paragraphs: [
          {
            align: 'left',
            runs: [
              { text: 'Provide ', bold: false },
              { text: 'stone pitching', bold: true }
            ]
          },
          {
            align: 'left',
            runs: [],
            table: {
              columnsPt: [100, 100],
              align: 'left',
              rows: [{ cells: [{ text: 'A', colSpan: 1, rowSpan: 1 }, { text: 'B', colSpan: 1, rowSpan: 1 }] }]
            }
          }
        ],
        floatingImages: []
      }
    },
    { kind: null, sheetNameHint: 'Template Bed' }
  ])
  assert.equal(sheetDetails.length, 3, 'Detail entries stay index-aligned')
  assert.equal(sheetDetails[0].name, 'Earthwork Detail 1', 'Sheet name sanitized')
  assert.equal(sheetDetails[0].qtyRef.r, 0, 'Quantity ref row passes through')
  assert.deepEqual(
    sheetDetails[0].grid.cells.map((cell) => [cell.r, cell.c, cell.value ?? null]),
    [
      [0, 0, 'Qty'],
      [0, 1, 10],
      [1, 0, 'Rate'],
      [1, 1, 100.5]
    ],
    'Cells rebased to the range origin with values intact'
  )
  assert.equal(sheetDetails[0].grid.cells[1].numFmt, '#,##0', 'Number pattern passes through')
  assert.equal(sheetDetails[0].grid.cells[1].style.bold, true, 'Bold passes through')
  assert.deepEqual(sheetDetails[0].grid.merges, [], 'Out-of-range merges clipped away')
  assert.equal(sheetDetails[0].grid.images.length, 1, 'Image anchored')
  assert.deepEqual(
    [sheetDetails[0].grid.images[0].r, sheetDetails[0].grid.images[0].c],
    [0, 1],
    'Image anchors at the nearest cell by px walk'
  )
  assert.equal(sheetDetails[0].grid.images[0].scaleW, 0.5, 'Image scale from measured dims')
  assert.equal(sheetDetails[1].name, 'Stone Pitching', 'Document sheet named')
  assert.ok(
    sheetDetails[1].grid.cells.some((cell) => cell.runs && cell.runs.some((run) => run.text === 'stone pitching' && run.style.bold === true)),
    'Document rich runs survive with styles'
  )
  assert.ok(
    sheetDetails[1].grid.cells.some((cell) => cell.value === 'A') &&
    sheetDetails[1].grid.cells.some((cell) => cell.value === 'B'),
    'Document table cells land in the grid'
  )
  assert.equal(sheetDetails[2], null, 'Template item passes null through')
  console.log('✓ Detail grids verified (sheet values/styles/merges, doc runs/tables, image anchors)')

  // 2c. Abstract formulas reference the detail sheets; mismatch degrades to values.
  const withDetails = componentExcel.buildComponentExcelPayload(renderData, sheetDetails)
  assert.equal(
    withDetails.abstractRows[0].qtyFormula,
    "='Earthwork Detail 1'!B1",
    'Quantity is a live reference into the detail sheet'
  )
  assert.equal(
    withDetails.abstractRows[0].amountFormula,
    "='Earthwork Detail 1'!B1*F6",
    'Amount multiplies the referenced quantity by the abstract rate cell'
  )
  assert.equal(
    withDetails.abstractRows[1].qtyFormula,
    null,
    'Document detail without a qty cell falls back to values'
  )
  assert.equal(withDetails.abstractRows[1].amountFormula, null, 'No phantom formula without a qty cell')
  assert.equal(withDetails.abstractRows[2].qtyFormula, null, 'Subtotal rows never reference')
  assert.equal(withDetails.detailSheets.length, 2, 'Only real detail sheets ship')
  assert.deepEqual(
    withDetails.detailSheets.map((sheet) => sheet.name),
    ['Earthwork Detail 1', 'Stone Pitching'],
    'Detail sheet order follows the abstract'
  )
  const withTemplateTotal = componentExcel.buildComponentExcelPayload(
    renderData,
    sheetDetails,
    null,
    [{ sheet: 'Guide Wall', ref: { r: 20, c: 5 } }]
  )
  assert.equal(
    withTemplateTotal.abstractRows[0].qtyFormula,
    "='Guide Wall'!F21",
    'An exact template total overrides the normal Detailed quantity source'
  )
  const short = componentExcel.buildComponentExcelPayload(renderData, [])
  assert.ok(
    short.abstractRows.every((row) => row.qtyFormula === null && row.amountFormula === null),
    'Missing details degrade to static values, never wrong references'
  )
  console.log('✓ Live formulas verified (qty refs, amount refs, safe degradation)')

  // 3. Static contract: component studio wires the export next to Download PDF
  // with no base64 fallback, and Rust owns the component kind.
  const dashboard = fs.readFileSync(
    path.join(root, 'src/renderer/src/components/dashboard/ComponentDashboard.tsx'),
    'utf8'
  )
  assert.ok(dashboard.includes("kind: 'component'"), 'dashboard sends the component kind')
  assert.ok(dashboard.includes('window.api.excel.compile(payload)'), 'dashboard compiles via the native command')
  assert.ok(dashboard.includes('onExportExcel={() => exportComponentExcel()}'), 'component studio wires the Excel export')
  assert.ok(dashboard.includes('prepareComponentExcelParts'), 'dashboard uses the shared component Excel preparation')
  const componentPrep = fs.readFileSync(
    path.join(root, 'src/renderer/src/lib/excel-output/componentDetailPrep.ts'),
    'utf8'
  )
  assert.ok(componentPrep.includes('buildComponentDetailSheets'), 'shared preparation builds detail sheets from the same walk')
  assert.ok(componentPrep.includes('directComponentItems'), 'detail inputs align with the abstract rows')
  assert.ok(!dashboard.includes('decodeBase64(result.data)'), 'component export has no base64 fallback')
  const rustCompiler = readExcelRust(root)
  assert.ok(rustCompiler.includes('ComponentPayload'), 'Rust reads a component payload')
  assert.ok(rustCompiler.includes('generate_excel_component_workbook'), 'Rust builds the component workbook')
  assert.ok(rustCompiler.includes("kind is 'component'"), 'Rust dispatches the component kind')
  assert.ok(rustCompiler.includes('ws.set_name("Abstract")'), 'Rust renders the Abstract sheet')
  assert.ok(rustCompiler.includes('detailed_sheet') && rustCompiler.includes('detail_sheets'), 'Rust renders stacked or per-item detail sheets')
  assert.ok(rustCompiler.includes('DetailGridPayload'), 'Rust reads detail grids')
  assert.ok(rustCompiler.includes('write_detail_grid'), 'Rust renders detail grids')
  assert.ok(rustCompiler.includes('qty_formula') && rustCompiler.includes('amount_formula'), 'Rust writes live formulas')
  assert.ok(rustCompiler.includes('SUM(G'), 'Rust totals live over the Cost column')
  assert.ok(rustCompiler.includes('write_rich_string') || rustCompiler.includes('RichString'), 'Rust keeps rich runs')
  assert.ok(rustCompiler.includes('insert_image'), 'Rust embeds images')
  console.log('✓ Native payload contract verified (dashboard kind + Rust builder + both sheets)')

  console.log('test-component-excel: all checks passed')
}

runTests().catch((error) => {
  console.error(error)
  process.exit(1)
})
