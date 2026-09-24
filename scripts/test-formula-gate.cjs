const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

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

function pass(excel) {
  return { ok: true, excel }
}

async function runTests() {
  console.log('--- Testing formula teacher (pass safe formulas, downgrade the rest to values) ---')

  const gate = loadTsModule(path.join(root, 'src/renderer/src/lib/excel-output/formulaGate.ts'))
  const detailGrid = loadTsModule(path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts'))

  const full = { startRow: 0, startColumn: 0, endRow: 20, endColumn: 10 }
  const clip = { startRow: 2, startColumn: 1, endRow: 5, endColumn: 3 }

  // Plain arithmetic and SUM pass through untouched on a full range.
  assert.deepEqual(gate.qualifyFormula('=A1+B2', full), pass('=A1+B2'))
  assert.deepEqual(gate.qualifyFormula('A1*2', full), pass('=A1*2'))
  assert.deepEqual(gate.qualifyFormula('=SUM(A1:A10)', full), pass('=SUM(A1:A10)'))

  // References rebase: sheet rows 2..5 / cols 1..3 become grid rows 1..4 /
  // columns A..C, matching flattenSheet's 0,0-rebased cell layout.
  assert.deepEqual(gate.qualifyFormula('SUM(B3:B6)', clip), pass('=SUM(A1:A4)'))
  assert.deepEqual(gate.qualifyFormula('=$B$3*2', clip), pass('=$A$1*2'))
  assert.deepEqual(gate.qualifyFormula('=sum(b3:b4)', clip), pass('=SUM(A1:A2)'))

  // Same-sheet qualifier is stripped; other sheets fail.
  assert.deepEqual(
    gate.qualifyFormula("='Detail'!B3*2", { ...clip, sheetName: 'Detail' }),
    pass('=A1*2')
  )
  let v = gate.qualifyFormula('=Other!A1+5', { ...clip, sheetName: 'Detail' })
  assert.equal(v.ok, false)
  assert.match(v.reason, /cross-sheet/)
  v = gate.qualifyFormula('=Detail!B3', clip)
  assert.equal(v.ok, false, 'qualifier without a sheetName must fail')

  // Exotic / unsafe functions fail and name the function.
  for (const f of ['=XLOOKUP(A1,B1:B5,C1:C5)', '=LAMBDA(x,x+1)(A1)', '=INDIRECT("A"&B1)', '=ROW()', '=FILTER(A1:A5,A1:A5>0)']) {
    v = gate.qualifyFormula(f, full)
    assert.equal(v.ok, false, `${f} must downgrade`)
  }
  v = gate.qualifyFormula('=XLOOKUP(A1,B1:B5,C1:C5)', full)
  assert.match(v.reason, /XLOOKUP/)

  // Out-of-range, whole-column/row, errors and syntax hazards fail.
  assert.equal(gate.qualifyFormula('=A10*2', clip).ok, false)
  assert.equal(gate.qualifyFormula('=A:A', full).ok, false)
  assert.equal(gate.qualifyFormula('=1:3', full).ok, false)
  assert.equal(gate.qualifyFormula('=IFERROR(A1,#REF!)', full).ok, false)
  assert.equal(gate.qualifyFormula('=A1;B1', full).ok, false)
  assert.equal(gate.qualifyFormula('=@A1:A5', full).ok, false)
  assert.equal(gate.qualifyFormula('={1,2}', full).ok, false)
  assert.equal(gate.qualifyFormula('=SUM(A1', full).ok, false)
  assert.equal(gate.qualifyFormula('', full).ok, false)
  assert.equal(gate.qualifyFormula('=MyName+1', full).ok, false)
  assert.equal(gate.qualifyFormula('=ABCD1+1', full).ok, false)

  // Strings, scientific notation, booleans and lowercase pass.
  assert.deepEqual(gate.qualifyFormula('=A1&" ref B9 "', full), pass('=A1&" ref B9 "'))
  assert.deepEqual(gate.qualifyFormula('="Other!A1"', full), pass('="Other!A1"'))
  assert.deepEqual(gate.qualifyFormula('=1E3*A1', full), pass('=1E3*A1'))
  assert.deepEqual(gate.qualifyFormula('=IF(A1>0,TRUE,FALSE)', full), pass('=IF(A1>0,TRUE,FALSE)'))

  // flattenSheet keeps live formulas plus cached values, downgrades the rest.
  const sheet = {
    cellData: {
      2: {
        1: { v: 20, f: '=B3*2' },
        2: { v: 7, f: '=XLOOKUP(C3,D1:D5,E1:E5)' },
        3: { v: 5 }
      },
      3: { 1: { v: 10 } }
    }
  }
  const verdicts = []
  const grid = detailGrid.flattenSheet(sheet, clip, { sheetName: 'Detail', verdicts })
  const byAddr = new Map(grid.cells.map((c) => [`${c.c},${c.r}`, c]))
  const live = byAddr.get('0,0')
  assert.equal(live.formula, '=A1*2')
  assert.equal(live.value, 20, 'cached value stays beside the live formula')
  const down = byAddr.get('1,0')
  assert.equal(down.formula, undefined)
  assert.equal(down.value, 7, 'downgraded cell keeps its computed value')
  assert.equal(verdicts.length, 2)
  assert.equal(verdicts[0].addr, 'B3')
  assert.equal(verdicts[0].ok, true)
  assert.equal(verdicts[0].reason, undefined)
  assert.equal(verdicts[1].ok, false)
  assert.match(verdicts[1].reason, /XLOOKUP/)

  // Formula-only cell (no cached value) is still emitted.
  const only = detailGrid.flattenSheet({ cellData: { 0: { 0: { f: '=B1*2' }, 1: { v: 4 } } } }, full)
  const onlyCell = only.cells.find((c) => c.c === 0 && c.r === 0)
  assert.equal(onlyCell.formula, '=B1*2')

  // Threading: buildComponentDetailSheets exposes verdicts per detail.
  const componentExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/componentExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )
  const details = componentExcel.buildComponentDetailSheets([
    { kind: 'sheet', sheet, range: clip, sheetNameHint: 'Earthwork' }
  ])
  assert.equal(details.length, 1)
  assert.equal(details[0].formulaVerdicts.length, 2)
  assert.equal(details[0].formulaVerdicts[0].ok, true)

  console.log('formula teacher tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
