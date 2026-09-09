// Cell -> Typst converter test.
// Loads worksheetTypst.ts via the same `transpileModule` loader the other tests
// use, feeds it a small Univer snapshot exercising every cell feature, and both
// asserts the generated markup and compiles it to a real PDF with the NodeCompiler.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

// Vite raw template imports in Node's standalone regression runner.
const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/typist-output/worksheetTypst.ts')

// Register a .ts loader so the module's own `./dataTypst`, `./printRender` and
// their cascade of runtime imports resolve through CommonJS.
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  })
  module._compile(outputText, filename)
}

const api = require(filePath)

function runTest() {
  // --- fixture ----------------------------------------------------------------
  // A measurement-sheet-like snapshot: a merged 3-column title, a repeated
  // header row, bold+fill+underline numeric cells, a background fill, an
  // explicit bottom border, wide/narrow columns, and a rich-text run.
  const styles = {
    title: { bl: 1, ht: 2, fs: 12, bg: { rgb: '#007791' } },
    header: { bl: 1, ht: 2, bg: { rgb: '#f1f3f5' }, bd: { b: { s: 1, cl: { rgb: '#555555' } } } },
    num: { ht: 3, fs: 11 },
    desc: { ht: 1 }
  }
  const snapshot = {
    styles,
    sheetOrder: ['sheet-1'],
    sheets: {
      'sheet-1': {
        rowCount: 20,
        columnCount: 5,
        defaultColumnWidth: 60,
        defaultRowHeight: 22,
        columnData: { 0: { w: 30 }, 1: { w: 100 }, 2: { w: 80 }, 3: { w: 70 } },
        mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 }],
        cellData: {
          0: { 0: { v: 'MEASUREMENT SHEET', s: 'title' } },
          1: { 0: { v: 'Sl', s: 'header' }, 1: { v: 'Description', s: 'header' }, 2: { v: 'Qty', s: 'header' } },
          2: {
            0: { v: 1, s: 'num' },
            1: {
              v: 'Plain cement concrete',
              s: 'desc',
              p: {
                body: {
                  dataStream: 'Plain cement concrete',
                  textRuns: [{ st: 0, ed: 6, ts: { bl: 1 } }]
                }
              }
            },
            2: { v: '10.50', s: 'num' }
          },
          3: { 0: { v: 2, s: 'num' }, 1: { v: 'Cement 43 grade', s: 'desc' }, 2: { v: '2.00', s: 'num' } }
        }
      }
    }
  }

  const config = {
    range: { startRow: 0, startColumn: 0, endRow: 3, endColumn: 2 },
    repeatHeaderRows: 0,
    showRowColHeaders: true,
    showGridlines: true
  }

  // --- markup assertions ------------------------------------------------------
  const table = api.worksheetToTypst(snapshot, config, [], {
    showRowColHeaders: true,
    repeatHeaderRows: 0
  })

  assert.match(table, /#table\(/, 'emits a Typst table')
  assert.match(table, /table\.header\(/, 'repeats the column-letter header')
  assert.match(table, /repeat: true/, 'header repeats on every page')
  assert.match(table, /colspan: 3/, 'the merged title spans 3 columns')
  assert.match(table, /fill: rgb\("#007791"\)/, 'applies the merged-title background')
  assert.match(table, /weight: "bold"/, 'bolds header/rich cells')
  assert.match(table, /#text\(weight: "bold"\)\[Plain \]/, 'rich run renders bold text')
  assert.match(table, /cement concrete/, 'cell text is shown')
  assert.match(table, /stroke: \(bottom: 0\.5pt \+ rgb\("#555555"\)\)/, 'explicit bottom border')
  assert.match(table, /columns: \(10mm, [0-9.]+mm/, 'column widths converted to mm')
  assert.match(table, /luma\(200\)/, 'gridline appears when no explicit border')

  // --- new cell-feature fixtures -------------------------------------------
  const richSnapshot = {
    styles: {
      num: { ht: 3, vt: 2, pd: { l: 4, r: 4, t: 2, b: 2 }, n: { pattern: '#,##0.00' } },
      rot: { tr: { a: 90 }, ht: 1 }
    },
    sheetOrder: ['s'],
    sheets: {
      s: {
        rowCount: 10,
        columnCount: 3,
        defaultRowHeight: 22,
        defaultColumnWidth: 60,
        rowData: { 1: { h: 60 } },
        cellData: {
          0: { 0: { v: 1250, s: 'num' } },
          1: { 0: { v: 'ABC', s: 'rot' } }
        }
      }
    }
  }
  const richTable = api.worksheetToTypst(richSnapshot, {
    range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 0 },
    showGridlines: false
  }, [], {})
  assert.match(richTable, /1,250\.00/, 'number format groups with decimals')
  assert.match(richTable, /align: \(right \+ horizon\)/, 'vertical alignment is emitted')
  assert.match(richTable, /inset: \(x: 3\.0pt, y: 1\.5pt\)/, 'cell padding becomes a block inset')
  assert.match(richTable, /#block\(height: 15\.87mm\)\[#rotate\(90deg\)/, 'row height + rotation are applied')

  // --- compile to a real PDF -------------------------------------------------
  const doc = api.buildSheetTypstDocument(
    snapshot,
    config,
    { projectName: 'Canal Project', title: 'Measurement Sheet' }
  )
  assert.match(doc, /#set page\(/, 'full document sets the page')

  const compiler = NodeCompiler.create({ workspace: root })
  const target = path.join(root, 'tmp', 'test-worksheet-typst.typ')
  compiler.addSource(target, doc)
  const pdf = compiler.pdf({ mainFilePath: target })
  assert.ok(pdf && pdf.length > 5000, `compiled PDF must be non-empty (got ${pdf && pdf.length})`)

  // The rich fixture (rotation + row height + valign + padding) must compile too.
  const richDoc = api.buildSheetTypstDocument(
    richSnapshot,
    { range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 0 }, showGridlines: false },
    { projectName: 'Test', title: 'Rich' }
  )
  const richTarget = path.join(root, 'tmp', 'test-worksheet-typst-rich.typ')
  compiler.addSource(richTarget, richDoc)
  const richPdf = compiler.pdf({ mainFilePath: richTarget })
  assert.ok(richPdf && richPdf.length > 5000, `rich PDF must be non-empty (got ${richPdf && richPdf.length})`)

  console.log(`test:worksheet-typst passed (${pdf.length} + ${richPdf.length} byte PDFs)`)
}

runTest()
