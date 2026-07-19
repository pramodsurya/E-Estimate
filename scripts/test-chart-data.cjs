const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/chartData.ts')
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
loadedModule._compile(outputText, filePath)

const {
  buildChartConfig,
  chartValuesContainData,
  readChartValuesFromSnapshot
} = loadedModule.exports

const snapshot = {
  sheetOrder: ['sheet-1'],
  sheets: {
    'sheet-1': {
      cellData: {
        3: { 4: { v: 1 }, 5: { v: 2 } },
        4: { 4: { v: 2 }, 5: { v: 4 } },
        5: { 4: { v: 3 }, 5: { v: 6 } },
        6: { 4: { v: 4 }, 5: { v: 8 } },
        7: { 4: { v: 5 }, 5: { v: 10 } }
      }
    }
  }
}

const range = { startRow: 3, startColumn: 4, endRow: 7, endColumn: 5 }
const restored = readChartValuesFromSnapshot(snapshot, range)
assert.deepEqual(restored, [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]])
assert.equal(chartValuesContainData(restored), true)
assert.equal(chartValuesContainData([[null, ''], [undefined, null]]), false)
assert.deepEqual(readChartValuesFromSnapshot(snapshot, undefined), [])

const config = buildChartConfig(restored, {
  id: 'restored-chart',
  range,
  type: 'line',
  firstRowIsHeader: false,
  firstColumnIsLabels: true,
  position: { startX: 0, startY: 0, width: 480, height: 300 }
})
assert.deepEqual(config.data.labels, ['1', '2', '3', '4', '5'])
assert.deepEqual(config.data.datasets[0].data, [2, 4, 6, 8, 10])

console.log('chart snapshot restore tests passed')
