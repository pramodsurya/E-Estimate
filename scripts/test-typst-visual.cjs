// Source-authoritative CodeMirror prototype — verifies the pure scanner that maps
// E-Estimate runtime expressions and the semantic `#ee-group-table(...)` call to
// exact source ranges, and that runtime VALUES are never baked into the source.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

// Register a .ts loader so modules can import their `.ts` siblings and the
// @codemirror/* packages resolve normally, then require the source directly.
require.extensions['.ts'] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  })
  module._compile(outputText, filename)
}

const { scanVariables, scanGroupTable, parseHeaderCells, valueFor, resolvePath } = require(path.join(root, 'src/renderer/src/lib/typstVisualScan.ts'))

const runtime = {
  project: 'Bund',
  year: '2025-26',
  summary: { grand_total: 'Rs. 14,32,27,440.13' },
  groups: [{ label: 'Building Stone', rows: [{ sl: '1', description: 'Building Stone', total_qty: '8,136.00 CUM', rate: 'Rs. 117.00' }] }]
}

const doc = `#align(center)[Standard Schedule of Rates: #EE_YEAR]

#ee-group-table(
  EE.groups,
  headers: ([Sl], [Description], [Total Qty], [Rate]),
)
`

function run() {
  // 1. Variables map to exact source ranges and resolve to runtime values.
  const vars = scanVariables(doc)
  const year = vars.find((v) => v.expression === '#EE_YEAR')
  assert.ok(year, 'finds #EE_YEAR')
  assert.equal(doc.slice(year.from, year.to), '#EE_YEAR', 'source range is the untouched expression')

  const yearValue = valueFor(year.expr, runtime)
  assert.equal(yearValue.value, '2025-26', 'runtime value resolves (not baked into source)')
  assert.notEqual(doc.slice(year.from, year.to), yearValue.value, 'the source still holds #EE_YEAR, not the value')

  // 2. Semantic table call → header ranges editable, rows come from runtime.
  const tables = scanGroupTable(doc)
  assert.equal(tables.length, 1, 'finds the #ee-group-table call')
  const tbl = tables[0]
  assert.equal(doc.slice(tbl.from, tbl.to).startsWith('#ee-group-table('), true, 'whole call range')

  assert.deepEqual(tbl.headers.map((h) => h.text), ['Sl', 'Description', 'Total Qty', 'Rate'], 'header texts parsed')
  // Header ranges are inside the source (editable-back), and do NOT include runtime rows.
  for (const h of tbl.headers) {
    assert.ok(h.from >= tbl.bodyFrom && h.to <= tbl.bodyTo, 'header range is within the call body')
    assert.notEqual(h.text, 'Building Stone', 'runtime rows are never parsed as editable cells')
  }

  // 3. Simulate editing a header → only that source range changes; rest unchanged.
  const desc = tbl.headers[1]
  const edited = doc.slice(0, desc.from) + '[Item Description]' + doc.slice(desc.to)
  const editedTables = scanGroupTable(edited)
  assert.equal(editedTables[0].headers[1].text, 'Item Description', 'header edit maps back to source')
  assert.equal(scanGroupTable(edited)[0].headers[0].text, 'Sl', 'other headers untouched')
  assert.ok(scanVariables(edited).some((v) => v.expression === '#EE_YEAR'), 'source-authoritative: other source ranges survive')
  assert.notEqual(edited, doc, 'doc changed (edit applied)')

  // 4. Runtime lookup via dotted path.
  assert.equal(resolvePath(runtime, 'summary.grand_total'), 'Rs. 14,32,27,440.13')
  assert.equal(resolvePath(runtime, 'missing.path'), '', 'missing path → empty (chip shows the expr)')

  // 5. The CodeMirror decoration field reads the runtime Facet and builds widgets
  //    that display VALUES (not the expression) for chips, and carry runtime rows.
  const { EditorState } = require('C:/Users/napra/OneDrive/Desktop/Software E-estimate/node_modules/@codemirror/state')
  const vis = require(path.join(root, 'src/renderer/src/lib/typstVisual.ts'))
  const state = EditorState.create({
    doc,
    extensions: [vis.eeRuntime.of(runtime), vis.visualMarkupExtension()]
  })
  const set = state.field(vis.visualDecorationField)
  let chip = null
  let tw = null
  set.between(0, doc.length, (from, to, deco) => {
    const w = deco.spec && deco.spec.widget
    if (w && w.constructor.name === 'EeVariableWidget') chip = { from, to, display: w.display }
    if (w && w.constructor.name === 'EeTableWidget') tw = { from, to, headers: w.headers, rows: (w.runtime?.groups ?? []).reduce((n, g) => n + (g.rows?.length ?? 0), 0) }
  })
  assert.ok(chip, 'variable gets a chip decoration')
  assert.equal(doc.slice(chip.from, chip.to), '#EE_YEAR', 'chip covers the untouched #EE_YEAR range')
  assert.equal(chip.display, '2025-26', 'chip displays the runtime value, not baked into source')
  assert.ok(tw, 'semantic table gets a block decoration')
  assert.equal(tw.rows, 1, 'table widget carries runtime rows (read-only)')
  assert.deepEqual(tw.headers.map((h) => h.text), ['Sl', 'Description', 'Total Qty', 'Rate'], 'headers are source-backed edits')

  console.log(`POC: typst-visual passed (${vars.length} vars, ${tables.length} table, chips/table wired to runtime)`)
}

run()
