// Compile semantic edge cases against the real Univer sheet Typst prelude.
// The expectations follow Univer's saved cell types and UTF-16 rich-run offsets.
const fs = require('node:fs')
const path = require('node:path')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const { parseSvgScene } = require('./svg-scene.cjs')

const root = path.resolve(__dirname, '..')
const prelude = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/univerSheet.typ'), 'utf8')
const compiler = NodeCompiler.create({ workspace: root })
const crossingHeader = {
  sheetOrder: ['sheet'], styles: {},
  sheets: { sheet: {
    cellData: { 0: { 0: { v: 'Merged title', t: 1 } } },
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 1, endColumn: 0 }],
    rowData: {}, columnData: {}, defaultRowHeight: 24, defaultColumnWidth: 88
  } }
}
const cases = [
  [
    'boolean ignores numeric format',
    '#assert.eq(cell-display-text((v: 1, t: 3), (n: (pattern: "0.00"))), "TRUE")\n' +
    '#assert.eq(cell-display-text((v: 0, t: 3), (n: (pattern: "0.00"))), "FALSE")'
  ],
  [
    'forced text ignores numeric format',
    '#assert.eq(cell-display-text((v: 123, t: 4), (n: (pattern: "0.00"))), "123")'
  ],
  [
    'rich run after CRLF keeps saved offset',
    '#let cell = (p: (body: (dataStream: "A\\r\\nB", textRuns: ((st: 3, ed: 4, ts: (bl: 1)),))))\n' +
    '#let parts = rich-segments(rich-stream(cell), rich-runs(cell))\n' +
    '#assert(parts.any(p => p.text == "B" and p.ts != none and p.ts.at("bl", default: 0) == 1))'
  ],
  [
    'rich offsets count astral UTF-16 units and removed controls',
    '#let cell = (p: (body: (dataStream: "😀\\r\\nX\\u{0001}B", textRuns: ((st: 6, ed: 7, ts: (it: 1)),))))\n' +
    '#let parts = rich-segments(rich-stream(cell), rich-runs(cell))\n' +
    '#assert(parts.any(p => p.text == "B" and p.ts != none and p.ts.at("it", default: 0) == 1))'
  ],
  [
    'merge crossing repeated header compiles',
    '#render-univer-sheet(sys.inputs.at("ee-data"), repeat-header-rows: 1, range-override: (0, 0, 1, 0))',
    { 'ee-data': JSON.stringify(crossingHeader) }
  ],
  [
    'zero saved row height follows Univer RowManager',
    '#assert.eq(row-resolved-px(0, ("0": (h: 0, ia: 0)), 24), 0)\n' +
    '#assert.eq(row-resolved-px(0, ("0": (ah: 0)), 24), 0)'
  ]
]

let failed = 0
for (const [name, check, inputs = {}] of cases) {
  try {
    compiler.pdf({ mainFileContent: `${prelude}\n${check}\nOK`, inputs })
    console.log(`PASS ${name}`)
  } catch (error) {
    failed++
    const detail = Object.fromEntries(Object.getOwnPropertyNames(error).map(key => [key, String(error[key]).slice(0, 1000)]))
    console.error(`FAIL ${name}: ${JSON.stringify(detail)}`)
  }
}
if (failed) process.exitCode = 1

const zeroDimensions = {
  sheetOrder: ['sheet'], styles: {},
  sheets: { sheet: {
    cellData: {
      0: { 0: { v: 'HIDDEN_BOTH' }, 1: { v: 'HIDDEN_ROW' } },
      1: { 0: { v: 'HIDDEN_COLUMN' }, 1: { v: 'VISIBLE_CELL' } }
    },
    mergeData: [], rowData: { 0: { h: 0, ia: 0 } },
    columnData: { 0: { w: 0 } }, defaultRowHeight: 24, defaultColumnWidth: 88
  } }
}
try {
  const svg = compiler.svg({
    mainFileContent: `${prelude}\n#render-univer-sheet(sys.inputs.at("ee-data"), range-override: (0, 0, 1, 1))`,
    inputs: { 'ee-data': JSON.stringify(zeroDimensions) }
  })
  const printed = parseSvgScene(svg).texts.map(run => run.text).join(' ')
  if (!printed.includes('VISIBLE_CELL') || printed.includes('HIDDEN_')) throw new Error(`unexpected painted text: ${printed}`)
  console.log('PASS zero-height row and zero-width column do not paint cells')
} catch (error) {
  process.exitCode = 1
  console.error(`FAIL zero-dimension render: ${String(error.code || error)}`)
}
