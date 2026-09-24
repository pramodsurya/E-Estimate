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

async function runTests() {
  console.log('--- Testing print-area clipping, hidden flags, anchors ---')

  const detailGrid = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts'),
    { '../typist-output/documentTypst': {} }
  )

  // toRangeLike: object, tuple, reversed, invalid.
  assert.deepEqual(
    detailGrid.toRangeLike({ startRow: 1, startColumn: 2, endRow: 5, endColumn: 5 }),
    { startRow: 1, startColumn: 2, endRow: 5, endColumn: 5 }
  )
  assert.deepEqual(detailGrid.toRangeLike([5, 5, 1, 2]), { startRow: 1, startColumn: 2, endRow: 5, endColumn: 5 })
  assert.equal(detailGrid.toRangeLike(null), null)
  assert.equal(detailGrid.toRangeLike({ startRow: 1 }), null)
  assert.equal(detailGrid.toRangeLike({ startRow: NaN, startColumn: 0, endRow: 1, endColumn: 1 }), null)

  // Offset print area C2:F6 (0-based rows 1..5, cols 2..5): exactly 4 Excel
  // columns, formulas rebased, outside refs downgraded to values.
  const range = { startRow: 1, startColumn: 2, endRow: 5, endColumn: 5 }
  const sheet = {
    cellData: {
      2: {
        2: { v: 3, f: '=C3*2' },
        3: { v: 99, f: '=A1+C3' },
        4: { v: 7, f: '=$F$6+1' }
      }
    }
  }
  const verdicts = []
  const grid = detailGrid.flattenSheet(sheet, range, { sheetName: 'Detail', verdicts })
  assert.equal(grid.colWidthsChars.length, 4, 'only the set area exports')
  const byAddr = new Map(grid.cells.map((c) => [`${c.c},${c.r}`, c]))
  assert.equal(byAddr.get('0,1').formula, '=A2*2', 'in-area ref rebases to grid origin')
  assert.equal(byAddr.get('0,1').value, 3, 'cached value stays beside the formula')
  assert.equal(byAddr.get('1,1').formula, undefined, 'outside-area ref downgrades')
  assert.equal(byAddr.get('1,1').value, 99)
  assert.equal(byAddr.get('2,1').formula, '=$D$5+1', 'absolute refs shift with $ kept')
  assert.deepEqual(
    verdicts.map((v) => v.ok),
    [true, false, true]
  )

  // Hidden rows/columns zero out (Typst parity); refs into them still pass.
  const hidden = detailGrid.flattenSheet(
    {
      cellData: { 0: { 0: { v: 1, f: '=B1*2' }, 1: { v: 5 } } },
      columnData: { 1: { w: 100, hd: 1 } },
      rowData: { 0: { h: 30, hd: 1 } }
    },
    { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }
  )
  assert.equal(hidden.colWidthsChars[1], 0, 'hidden column exports zero width')
  assert.equal(hidden.rowHeightsPt[0], 0, 'hidden row exports zero height')
  const hcell = hidden.cells.find((c) => c.c === 0 && c.r === 0)
  assert.equal(hcell.formula, '=B1*2', 'teacher still sees hidden cells')

  // Anchors walk zero geometry: hidden col contributes no pixels.
  assert.deepEqual(detailGrid.anchorCellAt([88, 0, 88], [24], 88, 0), { r: 0, c: 2 })
  assert.deepEqual(detailGrid.anchorCellAt([88, 88], [24, 0, 24], 0, 24), { r: 2, c: 0 })

  console.log('print-area tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
