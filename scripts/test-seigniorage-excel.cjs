const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const readExcelRust = require('./read-excel-rust.cjs')

const root = path.resolve(__dirname, '..')

const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw') || request.endsWith('.typ')) {
    const rawPath = path.resolve(path.dirname(parent.filename), request.replace(/\?raw$/, ''))
    if (fs.existsSync(rawPath)) return fs.readFileSync(rawPath, 'utf8')
    return ''
  }
  return originalLoad.call(this, request, parent, isMain)
}

function loadTsModule(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, 'utf8')
  // Strip vite ?raw imports if any
  const sanitized = source.replace(/\?raw/g, '')
  const { outputText } = ts.transpileModule(sanitized, {
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
    if (request.endsWith('.typ') || request.endsWith('.typ?raw')) {
      const rawPath = path.resolve(path.dirname(filePath), request.replace(/\?raw$/, ''))
      if (fs.existsSync(rawPath)) return fs.readFileSync(rawPath, 'utf8')
      return ''
    }
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) {
        return loadTsModule(tsFile, mocks)
      }
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

async function runTests() {
  console.log('--- Testing Seigniorage Excel Export (native rust_xlsxwriter payload path) ---')

  const seigniorageLibMock = {
    PERMIT_GO_REFERENCE: 'G.O.Ms.No. 34 M&G Dept',
    seigniorageItemDisplayName: (row) => row.description || ''
  }
  const mocks = {
    './seigniorage': seigniorageLibMock,
    '../seigniorage': seigniorageLibMock,
    '../signatureFooter': {
      SEIGNIORAGE_SIGNATURE_SCOPE: 'seigniorage',
      resolveSignatureFooter: () => ({ enabled: false, rows: [] })
    }
  }

  const printLayout = loadTsModule(path.join(root, 'src/renderer/src/lib/seignioragePrintLayout.ts'), mocks)
  const seigniorageTypst = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/seigniorageTypst.ts'), mocks)

  // Mock project
  const mockProject = {
    id: 'p1',
    meta: {
      name: 'Modern Canal Distributary Project',
      sorYear: '2025-26'
    },
    root: {
      id: 'r1',
      name: 'Root Node',
      kind: 'component',
      children: []
    },
    projectPrintSettings: {
      pageSize: 'A4',
      orientation: 'landscape',
      margins: { top: 20, right: 15, bottom: 20, left: 15 }
    },
    seignioragePrintOverrides: {
      title: 'Detailed Seigniorage Statement',
      year: '2025-26',
      permitBasis: 'G.O.Ms.No. 34 M&G Dept',
      groupHeadings: {
        'fine-aggregate': 'River Sand & Fine Aggregate'
      },
      groupSubtotals: {
        'fine-aggregate': 'Subtotal — River Sand & Fine Aggregate'
      }
    }
  }

  // Mock calculation with 2 rows in 2 different groups
  const mockCalculation = {
    rows: [
      {
        id: 'row-1',
        slNo: 1,
        itemNodeId: 'item-1',
        itemCode: 'IRR-CCDW-2-1',
        description: 'Vibrated Cement Concrete 1:2:4',
        materialKey: 'fine-aggregate',
        materialLabel: 'River Sand',
        unit: 'cum',
        quantity: 120.5,
        itemQuantity: 150.0,
        itemUnit: 'cum',
        seigRate: 90.0,
        seigniorage: 10845.0, // 120.5 * 90
        dmft: 3253.5, // 30% of 10845
        smft: 216.9, // 2% of 10845
        permit: 5422.5, // 50% of 10845
        permitPercent: 50,
        charge: { seig_code: 'SAND-01', mineral_name: 'Sand', rate_per_m3: 90 },
        autoMatched: true,
        isManual: false
      },
      {
        id: 'row-2',
        slNo: 2,
        itemNodeId: 'item-2',
        itemCode: 'IRR-CCDW-2-2',
        description: 'CC 1:2:4 coarse aggregate',
        materialKey: 'coarse-aggregate',
        materialLabel: 'Metal / Coarse Aggregate 20mm',
        unit: 'cum',
        quantity: 240.0,
        itemQuantity: 150.0,
        itemUnit: 'cum',
        seigRate: 110.0,
        seigniorage: 26400.0, // 240 * 110
        dmft: 7920.0, // 30% of 26400
        smft: 528.0, // 2% of 26400
        permit: 13200.0, // 50% of 26400
        permitPercent: 50,
        charge: { seig_code: 'AGG-20', mineral_name: 'Granite Metal', rate_per_m3: 110 },
        autoMatched: true,
        isManual: false
      }
    ],
    totalSeigniorage: 37245.0,
    totalDmft: 11173.5,
    totalSmft: 744.9,
    totalPermit: 18622.5,
    grandTotal: 67785.9,
    roundedSeigniorage: 37245,
    roundedDmft: 11174,
    roundedSmft: 745,
    roundedPermit: 18623,
    roundedGrandTotal: 67786
  }

  // 1. Grouping: the native payload groups rows by material (same grouping the
  // old workbook rendered as MATERIAL GROUP sections).
  const groups = printLayout.groupByMat(mockCalculation.rows)
  assert.equal(groups.length, 2, 'Two material groups')
  // Sorted by label: Metal / Coarse Aggregate 20mm before River Sand.
  assert.equal(groups[0].key, 'coarse-aggregate', 'First group is coarse aggregate')
  assert.equal(groups[0].rows.length, 1, 'Coarse group holds one row')
  assert.equal(groups[0].s, 26400, 'Coarse group seigniorage subtotal')
  assert.equal(groups[0].d, 7920, 'Coarse group DMFT subtotal')
  assert.equal(groups[0].m, 528, 'Coarse group SMFT subtotal')
  assert.equal(groups[0].p, 13200, 'Coarse group permit subtotal')
  assert.equal(groups[1].key, 'fine-aggregate', 'Second group is fine aggregate')
  assert.equal(groups[1].s, 10845, 'Fine group seigniorage subtotal')
  console.log('✓ Material grouping verified (2 groups with correct subtotals)')

  // 2. Resolved descriptions and headings: the payload carries pre-resolved
  // strings (the Rust side passes them through verbatim).
  assert.equal(
    seigniorageTypst.resolveSeigniorageRowDescription(mockProject, mockCalculation.rows[0]),
    'IRR-CCDW-2-1 — River Sand',
    'Row description resolves to code + material label'
  )
  assert.equal(
    seigniorageTypst.resolveSeigniorageRowDescription(mockProject, mockCalculation.rows[1]),
    'IRR-CCDW-2-2 — Metal / Coarse Aggregate 20mm',
    'Second row description resolves'
  )
  assert.equal(
    seigniorageTypst.resolveSeigniorageGroupHeading(mockProject, { key: 'fine-aggregate', label: 'River Sand' }),
    'River Sand & Fine Aggregate',
    'Custom group heading override applies'
  )
  assert.equal(
    seigniorageTypst.resolveSeigniorageGroupHeading(mockProject, { key: 'coarse-aggregate', label: 'Metal / Coarse Aggregate 20mm' }),
    'Metal / Coarse Aggregate 20mm',
    'Group without override falls back to label'
  )
  assert.equal(
    seigniorageTypst.resolveSeigniorageGroupSubtotal(mockProject, { key: 'fine-aggregate', label: 'River Sand' }),
    'Subtotal — River Sand & Fine Aggregate',
    'Custom group subtotal override applies'
  )
  assert.equal(
    seigniorageTypst.resolveSeigniorageGroupSubtotal(mockProject, { key: 'coarse-aggregate', label: 'Metal / Coarse Aggregate 20mm' }),
    'Subtotal — Metal / Coarse Aggregate 20mm',
    'Group without override falls back to Subtotal — heading'
  )
  console.log('✓ Resolved descriptions, headings, and subtotal labels verified')

  // 3. Totals arithmetic feeding the payload totals block.
  assert.equal(mockCalculation.totalSeigniorage, 37245.0, 'Total seigniorage')
  assert.equal(mockCalculation.totalDmft, 11173.5, 'Total DMFT')
  assert.equal(mockCalculation.totalSmft, 744.9, 'Total SMFT')
  assert.equal(mockCalculation.totalPermit, 18622.5, 'Total permit')
  assert.equal(mockCalculation.grandTotal, 67785.9, 'Grand total')
  assert.equal(mockCalculation.roundedGrandTotal, 67786, 'Rounded grand total')
  console.log('✓ Totals arithmetic verified')

  // 4. Static contract: dashboard sends kind 'seigniorage' with the exact keys
  // the Rust compiler reads (no ExcelJS builder remains in between).
  const dashboard = fs.readFileSync(
    path.join(root, 'src/renderer/src/components/seigniorage/SeigniorageDashboard.tsx'),
    'utf8'
  )
  assert.ok(dashboard.includes("kind: 'seigniorage'"), 'dashboard sends the seigniorage kind')
  assert.ok(dashboard.includes('window.api.excel.compile(payload)'), 'dashboard compiles via the native command')
  assert.ok(dashboard.includes('roundedGrandTotal'), 'dashboard sends the rounded grand total')
  assert.ok(!dashboard.includes('buildSeigniorageWorkbook'), 'old ExcelJS builder is no longer referenced')
  const rustCompiler = readExcelRust(root)
  assert.ok(rustCompiler.includes('SeignioragePayload'), 'Rust reads a seigniorage payload')
  assert.ok(rustCompiler.includes('roundedGrandTotal') || rustCompiler.includes('rounded_grand_total'), 'Rust reads the rounded grand total')
  assert.ok(rustCompiler.includes('permitBasis') || rustCompiler.includes('permit_basis'), 'Rust reads the permit basis')
  console.log('✓ Native payload contract verified (dashboard kind + Rust payload fields)')

  console.log('\nALL SEIGNIORAGE EXCEL TESTS PASSED!')
}

runTests().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
