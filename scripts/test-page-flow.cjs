const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/pageFlowPlanner.ts'),
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
const { planPageFlow } = module_.exports

const rows = (count, height = 90, prefix = 'row') =>
  Array.from({ length: count }, (_, index) => ({
    value: `${prefix}-${index + 1}`,
    height,
    detail: true
  }))

const flatten = (plan) => plan.pages.flatMap((page) => page.blocks.map((b) => b.value))
const shape = (plan) => plan.pages.map((page) => page.blocks.length)

// --- Nothing is lost, nothing is duplicated, order is preserved ---------------
const conserve = (plan, blocks, why) => {
  assert.deepEqual(flatten(plan), blocks.map((b) => b.value), why)
}

// --- A short sheet stays on one page and is never called sparse ---------------
const short = planPageFlow([
  { density: 'normal', blocks: rows(3), geometry: { body: 1000, closing: 200 } }
])
assert.equal(short.pages.length, 1)
assert.equal(short.pages[0].role, 'only')
assert.equal(short.hasSparsePage, false, 'a one-page document is never an orphan')
assert.equal(short.pages[0].carriesClosing, true, 'the only page carries the signatures')

// --- The reported bug: one lonely row on a page of its own -------------------
// Twelve rows against a page that fits eleven. A greedy fill leaves row 12
// stranded with no heading above it and no signatures below it.
const spillBlocks = rows(12)
const spill = planPageFlow([
  { density: 'normal', blocks: spillBlocks, geometry: { body: 1000, closing: 200 } }
])
assert.equal(spill.pages.length, 2, 'balancing must not invent a third sheet')
assert.equal(spill.hasSparsePage, false, 'no page may read as empty')
assert.ok(
  spill.pages[1].blocks.length >= 3,
  `the closing page needs a real body, got ${JSON.stringify(shape(spill))}`
)
assert.ok(
  spill.pages[0].blocks.length < 11,
  'earlier pages must give rows back — this is the backward recalibration'
)
assert.equal(spill.pages[0].role, 'first')
assert.equal(spill.pages[1].role, 'last')
assert.equal(spill.pages[0].carriesClosing, false, 'only the closing page reserves signatures')
assert.equal(spill.pages[1].repeatsLead, true, 'a continuation repeats the subject lead')
conserve(spill, spillBlocks, 'every measurement row survives rebalancing')

// --- Page count is never traded away for looks -------------------------------
// 1080px of rows against a 1000px page genuinely needs two sheets; a prettier
// three-sheet split must lose.
const tight = planPageFlow([
  { density: 'normal', blocks: rows(12), geometry: { body: 1000 } }
])
assert.equal(tight.pages.length, 2, 'minimum sheets wins over balance')

// --- A total never opens a page ----------------------------------------------
const totalBlocks = [
  ...rows(10, 100),
  { value: 'total', height: 100, detail: false, keepWithPrevious: true }
]
const withTotal = planPageFlow([
  { density: 'normal', blocks: totalBlocks, geometry: { body: 500 } }
])
const lastOfTotal = withTotal.pages[withTotal.pages.length - 1]
assert.notEqual(
  lastOfTotal.blocks[0].value,
  'total',
  'the total must keep the rows it totals on its own page'
)
assert.ok(
  lastOfTotal.blocks.some((block) => block.value === 'total'),
  'the total still prints'
)
conserve(withTotal, totalBlocks, 'adding a total drops no rows')

// --- A heading never closes a page -------------------------------------------
// Two subjects flowing into one stream: the second subject's heading must not
// be the last thing on a sheet with its rows overleaf.
const headingBlocks = [
  ...rows(7, 100, 'a'),
  { value: 'heading-b', height: 100, detail: false, keepWithNext: true },
  ...rows(7, 100, 'b')
]
const merged = planPageFlow([
  { density: 'normal', blocks: headingBlocks, geometry: { body: 500 } }
])
for (const page of merged.pages.slice(0, -1)) {
  assert.notEqual(
    page.blocks[page.blocks.length - 1].value,
    'heading-b',
    'a subject heading must never be stranded at the foot of a page'
  )
}
conserve(merged, headingBlocks, 'merging two subjects into one flow loses nothing')

// --- Density is escalated only when it actually rescues the layout -----------
// Five rows that will not fit one normal-density sheet, and cannot be split
// into two without stranding the second. Compact trims both the rows and the
// page padding, so the whole thing lands on a single clean sheet.
const escalated = planPageFlow([
  { density: 'normal', blocks: rows(5, 100), geometry: { body: 400, closing: 150 } },
  { density: 'compact', blocks: rows(5, 80), geometry: { body: 560, closing: 150 } }
])
assert.equal(escalated.density, 'compact', 'a denser profile is taken when it rescues the page')

// Ordinary documents are never shrunk for no reason.
assert.equal(
  planPageFlow([
    { density: 'normal', blocks: rows(4), geometry: { body: 1000, closing: 200 } },
    { density: 'compact', blocks: rows(4, 70), geometry: { body: 1000, closing: 200 } }
  ]).density,
  'normal',
  'a healthy layout keeps normal typography'
)

// --- Degenerate input still produces a usable plan ---------------------------
assert.deepEqual(planPageFlow([]).pages, [])
const oversize = planPageFlow([
  { density: 'normal', blocks: [{ value: 'huge', height: 5000, detail: true }], geometry: { body: 800 } }
])
assert.equal(oversize.pages.length, 1, 'a block taller than the page still lands somewhere')

// --- The planner stays fast on a long component ------------------------------
const bigBlocks = rows(400, 30)
const started = Date.now()
const big = planPageFlow([
  { density: 'normal', blocks: bigBlocks, geometry: { body: 900, opening: 160, continuationLead: 40, closing: 180 } }
])
const elapsed = Date.now() - started
conserve(big, bigBlocks, '400 rows survive the solver')
assert.equal(big.hasSparsePage, false, 'a long component ends on a full-looking page')
assert.ok(elapsed < 1500, `planner must stay interactive, took ${elapsed}ms`)

console.log('page flow planner OK')
