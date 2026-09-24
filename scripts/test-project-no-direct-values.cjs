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
    cover: { workName: 'Kodangal Lift', ssrYear: '2026-27' },
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
      { kind: 'misc', label: 'Site clearance', staticAmount: 25000 },
      { kind: 'gst', label: 'LS Add G.S.T @ 18%', percent: 18 }
    ]
  }
}

async function runTests() {
  console.log('--- Testing project dashboard: no undeclared direct values ---')

  const projectExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )

  const payload = projectExcel.buildProjectDashboardPayload(fixture())
  const allowed = new Set(payload.inputs.map((i) => `${i.sheet}|${i.r}|${i.c}`))
  assert.ok(allowed.size > 0, 'declared inputs must exist')

  // 1. Every static NUMERIC cell authored by this builder must be a
  // declared input. Detailed_* sheets are estimator-carried content
  // (values downgraded by formulaGate), covered by the detail tests.
  const undeclared = []
  for (const sheet of payload.sheets) {
    if (sheet.name.startsWith('Detailed_')) continue
    for (const cell of sheet.grid.cells) {
      if (typeof cell.value === 'number' && !allowed.has(`${sheet.name}|${cell.r}|${cell.c}`)) {
        undeclared.push(`${sheet.name}!${cell.r},${cell.c}=${cell.value}`)
      }
    }
  }
  assert.deepEqual(undeclared, [], `static numbers must all be declared inputs, found: ${undeclared.join('; ')}`)

  // 2. Every declared input points at a real static numeric cell.
  for (const i of payload.inputs) {
    const sheet = payload.sheets.find((s) => s.name === i.sheet)
    assert.ok(sheet, `input sheet '${i.sheet}' must exist`)
    const cell = sheet.grid.cells.find((cell) => cell.r === i.r && cell.c === i.c)
    assert.ok(cell && typeof cell.value === 'number', `input ${i.sheet}|${i.r}|${i.c} must be a static number`)
    assert.ok(!cell.formula, `input ${i.sheet}|${i.r}|${i.c} must not also carry a formula`)
    assert.ok(i.reason && i.reason.length > 3, 'input needs an audit reason')
  }

  // 3. Spot-check the allowlist covers every source-input class.
  const reasons = payload.inputs.map((i) => i.reason)
  for (const prefix of ['charge-percent:gst', 'static-qty-no-detail:', 'misc-amount:']) {
    assert.ok(reasons.some((reason) => reason.startsWith(prefix)), `allowlist covers ${prefix}`)
  }

  console.log('no-direct-values tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
