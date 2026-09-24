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

function guideWallFixture(overrides = {}) {
  return {
    project: 'Kodangal Lift',
    name: 'Guide Wall 1',
    code: 'GW-1',
    meta: 'Total length 120 m · 2 marked sections',
    figures: [
      { typeCode: 'Type A', caption: 'Type A — Both sides. Applies at: Ch 0–120', svg: '' }
    ],
    wall_groups: [
      {
        heading: 'Wall concrete — W-1',
        code: 'W-1',
        unit: 'cum',
        description: 'CC 1:3:6 for wall',
        descriptionRuns: [{ text: 'CC 1:3:6', bold: true }, { text: ' for wall', italic: true }],
        rows: [
          { sl: '1', chainage: '0–60', side: 'Left', length: '60', formula: '60 × 2.5', quantityFactor: 2.5, qty: '150' },
          { sl: '2', chainage: '60–120', side: 'Left', length: '60', formula: '60 × 2.5', quantityFactor: 2.5, qty: '150' }
        ],
        total: '300'
      }
    ],
    base_groups: [
      {
        heading: 'Base slab concrete — B-1',
        code: 'B-1',
        unit: 'cum',
        description: '',
        descriptionRuns: [],
        rows: [
          { sl: '1', chainage: '0–120', side: 'Both', length: '120', formula: '120 × 1.2', quantityFactor: 1.2, qty: '144' }
        ],
        total: '144'
      }
    ],
    excavation: {
      heading: 'Excavation — E-1',
      code: 'E-1',
      unit: 'cum',
      description: '',
      descriptionRuns: [],
      rows: [
        { sl: '1', fromCh: '0', toCh: '60', length: '60', breadth: '2', height: '1.5', qty: '180' },
        { sl: '2', fromCh: '60', toCh: '120', length: '60', breadth: '2', height: '1', qty: '120' }
      ],
      total: '300'
    },
    signature: [],
    document_settings: {
      pageSize: 'Legal', orientation: 'portrait',
      margins: { top: 12, right: 10, bottom: 14, left: 16 }
    },
    ...overrides
  }
}

async function runTests() {
  console.log('--- Testing Guide Wall Excel sheet ---')

  const guideWallExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/guideWallExcel.ts')
  )

  // fmt3 uses Indian grouping: parse-back must strip it.
  assert.equal(guideWallExcel.parseNum('1,00,000.5'), 100000.5)
  assert.equal(guideWallExcel.parseNum('12.500'), 12.5)
  assert.equal(guideWallExcel.parseNum('—'), null)
  assert.equal(guideWallExcel.parseNum(''), null)
  assert.equal(guideWallExcel.parseNum(null), null)

  const rd = guideWallFixture()
  const plan = await guideWallExcel.prepareGuideWallExcelPlan(rd)
  const sheets = plan.sheets
  assert.equal(sheets.length, 1)
  assert.equal(sheets[0].name, 'Guide Wall')
  assert.equal(sheets[0].landscape, false)
  assert.equal(sheets[0].grid.pageSetup.paperSize, 'Legal')
  assert.deepEqual(sheets[0].grid.pageSetup.marginsMm, { top: 12, right: 10, bottom: 14, left: 16 })

  const grid = sheets[0].grid
  const texts = grid.cells.map((c) => c.value)
  assert.ok(texts.includes('Guide Wall 1'), 'banner name present')
  assert.ok(texts.includes('1. Typical cross-sections'))
  assert.ok(texts.includes('2. Concrete quantities'))
  assert.ok(texts.includes('3. Excavation'))
  assert.ok(
    texts.some((v) => typeof v === 'string' && v.includes('Type A')),
    'figure caption present (figure itself needs a DOM to rasterize)'
  )
  assert.equal(grid.images.length, 0, 'no DOM in node: figures skipped, tables intact')
  const richDescription = grid.cells.find((cell) => cell.runs?.length)
  assert.equal(richDescription.runs[0].style.bold, true, 'rich description bold survives')
  assert.equal(richDescription.runs[1].style.italic, true, 'rich description italic survives')

  const concreteQty = grid.cells.find(
    (c) => typeof c.formula === 'string' && /^=D\d+\*2\.5$/.test(c.formula)
  )
  assert.ok(concreteQty, 'wall quantity must multiply the visible length cell by its shared driver factor')

  // Wall block total is a live SUM over the Qty column (F).
  const wallTotal = grid.cells.find(
    (c) => typeof c.formula === 'string' && /^=SUM\(F\d+:F\d+\)$/.test(c.formula)
  )
  assert.ok(wallTotal, 'concrete block total must sum live')

  // Excavation quantities are live L x B x H; block total sums column G.
  const liveQty = grid.cells.find(
    (c) => typeof c.formula === 'string' && /^=D\d+\*E\d+\*F\d+$/.test(c.formula)
  )
  assert.ok(liveQty, 'excavation quantity must be live L*B*H')
  const excTotal = grid.cells.find(
    (c) => typeof c.formula === 'string' && /^=SUM\(G\d+:G\d+\)$/.test(c.formula)
  )
  assert.ok(excTotal, 'excavation total must sum live')

  // Export consumers receive exact role+code addresses; wall/base sharing a
  // code can never accidentally adopt one another's total.
  const wallRef = plan.totalRefs.get(guideWallExcel.guideWallTotalKey('wall', 'W-1'))
  const baseRef = plan.totalRefs.get(guideWallExcel.guideWallTotalKey('base', 'B-1'))
  const excavationRef = plan.totalRefs.get(guideWallExcel.guideWallTotalKey('excavation', 'E-1'))
  assert.deepEqual(wallRef, { r: wallTotal.r, c: 5 })
  assert.ok(baseRef && baseRef.c === 5, 'base total address recorded')
  assert.deepEqual(excavationRef, { r: excTotal.r, c: 6 })

  const landscape = await guideWallExcel.prepareGuideWallExcelPlan(
    guideWallFixture({ document_settings: { pageSize: 'A4', orientation: 'landscape', margins: { top: 10, right: 10, bottom: 10, left: 10 } } })
  )
  assert.equal(landscape.sheets[0].landscape, true, 'resolved Guide Wall orientation reaches Excel')

  // No excavation data: section omitted, concrete intact.
  const noExc = await guideWallExcel.buildGuideWallSheet(
    guideWallFixture({ excavation: null })
  )
  const noExcTexts = noExc.cells.map((c) => c.value)
  assert.ok(!noExcTexts.includes('3. Excavation'))
  assert.ok(noExcTexts.includes('2. Concrete quantities'))

  assert.equal(
    guideWallExcel.guideWallExcelFileName('Kodangal', 'Guide Wall 1'),
    'Kodangal — Guide Wall 1 — Guide Wall.xlsx'
  )

  console.log('guide wall excel tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
