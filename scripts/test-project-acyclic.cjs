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
        itemKeys: ['k1'],
        headers: [
          { code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Earthwork desc' }
        ],
        details: [
          {
            name: 'Earthwork',
            grid: grid([{ r: 0, c: 0, value: 'Cutting' }], [20, 14]),
            qtyRef: { r: 0, c: 0 }
          }
        ]
      }
    ],
    items: [
      { key: 'k1', component: 'Main Canal', code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Earthwork desc', dataKey: 'd1' }
    ],
    data: [
      { key: 'd1', code: 'DAW-1', description: 'Earthwork data', unit: 'cum', sorRate: 100, outputQty: 1, leadKeys: ['l1'] }
    ],
    leads: [
      { key: 'l1', label: 'Sand lead', unit: 'cum', recipeKey: 'd1', qtyPerOutput: 2, grossRate: 20, km: 5 }
    ],
    seigniorage: [
      { key: 's1', description: 'Sand seigniorage', unit: 'cum', itemKey: 'k1', policyRate: 50 }
    ],
    charges: [
      { kind: 'seigniorage', label: 'Add Seigniorage charges' },
      { kind: 'gst', label: 'LS Add G.S.T @ 18%', percent: 18 }
    ]
  }
}

function colToIndex(letters) {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Cell-level dependencies of one formula cell. Expands ranges so interior
 * cells are not missed. Returns ids as sheet|r|c (0-based).
 */
function cellDeps(sheetName, formula) {
  const deps = new Set()
  const add = (sheet, col, row) => {
    deps.add(`${sheet}|${row - 1}|${colToIndex(col)}`)
  }
  // Cross-sheet ranges first: 'S'!A1:B2.
  let text = formula.replace(/'((?:[^']|'')+)'!(\$?[A-Z]{1,3})(\$?\d+):(\$?[A-Z]{1,3})(\$?\d+)/g,
    (m, s, c1, r1, c2, r2) => {
      const sheet = s.replace(/''/g, "'")
      const a = Math.min(colToIndex(c1.replace('$', '')), colToIndex(c2.replace('$', '')))
      const b = Math.max(colToIndex(c1.replace('$', '')), colToIndex(c2.replace('$', '')))
      const top = Math.min(Number(r1.replace('$', '')), Number(r2.replace('$', '')))
      const bot = Math.max(Number(r1.replace('$', '')), Number(r2.replace('$', '')))
      assert.ok((b - a + 1) * (bot - top + 1) <= 5000, 'range too large to audit')
      for (let c = a; c <= b; c++) for (let r = top; r <= bot; r++) deps.add(`${sheet}|${r - 1}|${c}`)
      return ' '
    })
  // Cross-sheet singles: 'S'!A1.
  text = text.replace(/'((?:[^']|'')+)'!(\$?[A-Z]{1,3})(\$?\d+)/g, (m, s, c, r) => {
    add(s.replace(/''/g, "'"), c.replace('$', ''), Number(r.replace('$', '')))
    return ' '
  })
  // Same-sheet ranges: A1:B2.
  text = text.replace(/\b([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\b/g, (m, c1, r1, c2, r2) => {
    const a = Math.min(colToIndex(c1), colToIndex(c2))
    const b = Math.max(colToIndex(c1), colToIndex(c2))
    const top = Math.min(Number(r1), Number(r2))
    const bot = Math.max(Number(r1), Number(r2))
    assert.ok((b - a + 1) * (bot - top + 1) <= 5000, 'range too large to audit')
    for (let c = a; c <= b; c++) for (let r = top; r <= bot; r++) deps.add(`${sheetName}|${r - 1}|${c}`)
    return ' '
  })
  // Same-sheet singles (function names stripped first).
  text = text.replace(/\b(SUM|ROUND|CEILING|IF|AND|OR|NOT|ABS|MAX|MIN)\b/g, ' ')
  let match
  const single = /\b([A-Z]{1,3})(\d{1,7})\b/g
  while ((match = single.exec(text)) !== null) {
    deps.add(`${sheetName}|${Number(match[2]) - 1}|${colToIndex(match[1])}`)
  }
  return deps
}

/** Sheet-level edges, for flow-direction assertions. */
function sheetEdges(payload) {
  const edges = new Map()
  const refRe = /'((?:[^']|'')+)'!/g
  for (const sheet of payload.sheets) {
    for (const cell of sheet.grid.cells) {
      if (!cell.formula) continue
      let match
      refRe.lastIndex = 0
      while ((match = refRe.exec(cell.formula)) !== null) {
        const target = match[1].replace(/''/g, "'")
        if (target !== sheet.name) {
          if (!edges.has(sheet.name)) edges.set(sheet.name, new Set())
          edges.get(sheet.name).add(target)
        }
      }
    }
  }
  return edges
}

async function runTests() {
  console.log('--- Testing project dashboard: acyclic cell references ---')

  const projectExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/projectExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )

  const payload = projectExcel.buildProjectDashboardPayload(fixture())
  const names = new Set(payload.sheets.map((s) => s.name))

  // 1. Cell-level graph has no cycles. Sheet-level cycles are EXPECTED
  // (Abstract -> DATA -> Lead -> Abstract); only cell cycles are real.
  const formulaCells = new Map()
  for (const sheet of payload.sheets) {
    for (const cell of sheet.grid.cells) {
      if (cell.formula) formulaCells.set(`${sheet.name}|${cell.r}|${cell.c}`, { sheet: sheet.name, cell })
    }
  }
  assert.ok(formulaCells.size > 0, 'live formulas must exist')
  const visiting = new Set()
  const done = new Set()
  const visit = (node, trail) => {
    if (done.has(node)) return
    assert.ok(!visiting.has(node), `circular cell reference: ${[...trail, node].join(' -> ')}`)
    visiting.add(node)
    const entry = formulaCells.get(node)
    if (entry) {
      for (const dep of cellDeps(entry.sheet, entry.cell.formula)) visit(dep, [...trail, node])
    }
    visiting.delete(node)
    done.add(node)
  }
  for (const node of formulaCells.keys()) visit(node, [])

  // 2. Every cross-sheet target exists.
  const edges = sheetEdges(payload)
  for (const [from, targets] of edges) {
    for (const target of targets) {
      assert.ok(names.has(target), `'${from}' references missing sheet '${target}'`)
    }
  }

  // 3. Cover is a pure sink: nothing references it back.
  for (const [from, targets] of edges) {
    assert.ok(!targets.has('Cover'), `'${from}' must not reference Cover back`)
  }

  // 4. Project-owned formulas remain one-way. Reusable DATA -> Lead formulas
  // are authored by the native combined-workbook writer and covered there.
  assert.ok(
    payload.seigniorageLinks.some((link) =>
      link.terms.some((term) => term.formula.includes("'Abstract_Main Canal'"))
    ),
    'reused Seigniorage template receives Abstract-backed quantity terms'
  )
  assert.ok(edges.get('Abstract_Main Canal')?.has('Detailed_Main Canal'), 'Abstract -> Detailed qty flow')
  assert.ok(
    payload.links.some((link) => link.kind === 'data-rate' && link.key === 'd1'),
    'Abstract carries a stable DATA-rate link for the native writer'
  )

  console.log('acyclic reference tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
