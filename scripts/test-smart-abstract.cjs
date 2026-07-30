const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/smartAbstractPagination.ts'),
  'utf8'
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText
const module_ = { exports: {} }
new Function('module', 'exports', 'require', compiled)(module_, module_.exports, require)
const { chooseSmartAbstractPlan } = module_.exports

const rows = (count, height = 20) =>
  Array.from({ length: count }, (_, index) => ({
    value: `row-${index + 1}`,
    height,
    detail: true
  }))

// Ordinary short abstracts stay at normal density on one sheet.
const onePage = chooseSmartAbstractPlan([{
  density: 'normal',
  rows: rows(4),
  capacities: { first: 120, continuation: 140, finalFirst: 100, finalContinuation: 110 }
}])
assert.equal(onePage.density, 'normal')
assert.deepEqual(onePage.pages.map((page) => page.rows.length), [4])

// When normal density would leave a signature-only/orphan continuation and a
// slight compaction fits, the compact profile wins instead of printing it.
const orphanRecovered = chooseSmartAbstractPlan([
  {
    density: 'normal',
    rows: rows(5, 20),
    capacities: { first: 110, continuation: 130, finalFirst: 75, finalContinuation: 85 }
  },
  {
    density: 'compact',
    rows: rows(5, 17),
    capacities: { first: 115, continuation: 135, finalFirst: 90, finalContinuation: 100 }
  }
])
assert.equal(orphanRecovered.density, 'compact')
assert.equal(orphanRecovered.pages.length, 1)

// A genuinely long Abstract continues, but its final page gets a balanced set
// detail rows and every source row appears exactly once.
const longRows = rows(30, 20)
const longPlan = chooseSmartAbstractPlan([{
  density: 'normal',
  rows: longRows,
  capacities: { first: 100, continuation: 120, finalFirst: 70, finalContinuation: 80 }
}])
assert.ok(longPlan.pages.length > 1)
assert.ok(longPlan.pages.at(-1).rows.filter((row) => row.detail).length >= 4)
assert.deepEqual(
  longPlan.pages.flatMap((page) => page.rows.map((row) => row.value)),
  longRows.map((row) => row.value)
)

// A total marked keep-with-previous is never the opening row on another sheet.
const withTotal = [
  ...rows(7, 25),
  { value: 'total', height: 25, detail: false, keepWithPrevious: true }
]
const totalPlan = chooseSmartAbstractPlan([{
  density: 'normal',
  rows: withTotal,
  capacities: { first: 100, continuation: 110, finalFirst: 75, finalContinuation: 85 }
}])
for (const page of totalPlan.pages.slice(1)) {
  assert.notEqual(page.rows[0]?.value, 'total')
}

console.log('smart Abstract pagination: all assertions passed')
