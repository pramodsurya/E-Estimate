const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function compileTs(m, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  m._compile(outputText, filename)
}

const bund = require(path.join(root, 'src/renderer/src/lib/bund.ts'))

const near = (a, e, tol, what) =>
  assert.ok(Math.abs(a - e) <= tol, `${what}: expected ~${e}, got ${a}`)

// --- free-board design -----------------------------------------------------
const design = {
  ...bund.defaultBundDesign(),
  mwl: 98,
  ftl: 97,
  freeBoard: 1.5,
  topWidth: 6,
  usSlope: 2,
  dsSlope: 2,
  stripDepth: 0.3
}
assert.equal(bund.topLevelFromFreeBoard(design), 99.5, 'TBL = MWL + free board')
assert.equal(bund.topLevelFromFreeBoard({ mwl: null, freeBoard: 1.5 }), null, 'no MWL → no TBL')
assert.equal(
  bund.usesFreeBoardDesign({ mode: 'new', embankmentType: 'homogeneous' }),
  true,
  'new homogeneous uses free board'
)
assert.equal(
  bund.usesFreeBoardDesign({ mode: 'restoration', embankmentType: 'homogeneous' }),
  false,
  'repair keeps its typed TBL'
)
assert.equal(
  bund.usesFreeBoardDesign({ mode: 'new', embankmentType: 'zoned' }),
  true,
  'a new zoned bund is designed to a free board too'
)

// --- new bund measured from a surveyed profile -----------------------------
const base = bund.defaultBundData()
// Flat natural ground at RL 95 across 40 m, TBL 100 → 5 m high, 6 m crest,
// 1:2 both faces → base 6 + 2*(5+0.3)*2 ... measured against the stripped base.
const flatPre = [
  { offset: -40, rl: 95 },
  { offset: 0, rl: 95 },
  { offset: 40, rl: 95 }
]
const mkSection = (id, chainage) => ({
  id,
  chainage,
  groundLevel: null,
  pre: flatPre.map((p) => ({ ...p })),
  stripped: null,
  projected: null
})

const newBund = {
  ...base,
  mode: 'new',
  embankmentType: 'homogeneous',
  configured: true,
  lengthM: 30,
  design: { ...design, topLevel: 100, berms: [] },
  fillBasis: 'stripped',
  strippingExcavationFamily: 'foundation',
  sections: [mkSection('a', 0), mkSection('b', 30)]
}

assert.equal(
  bund.usesSurveyedGroundEntry(newBund),
  true,
  'new homogeneous enters levels through the survey table'
)
assert.equal(
  bund.usesFlatGround(newBund, newBund.sections[0]),
  false,
  'a section with a surveyed profile is not on the flat-ground model'
)
assert.equal(
  bund.hasMeasurableGround(newBund, newBund.sections[0]),
  true,
  'two toe RLs alone are enough on a new bund'
)

const areas = bund.sectionAreas(newBund, newBund.sections[0])
// The proposed faces meet existing ground (95) at the toes, so the section is a
// 6 m crest at RL 100 widening 1:2 over 5 m to a 26 m base; the fill then
// continues down through the 0.3 m foundation cut under that whole base.
const seating = 6 + 2 * 2 * 5
const expectedFill = ((6 + seating) / 2) * 5 + seating * 0.3
near(areas.formation, expectedFill, 0.05, 'new-bund fill area from the surveyed ground')
near(areas.stripping, seating * 0.3, 0.05, 'foundation excavation over the seating')
near(
  bund.rowsTotal(bund.formationRows(newBund)),
  expectedFill * 30,
  1,
  'fill total = mean section area × length'
)

// A section still untouched measures nothing, it does not fall back to a chord.
const emptySection = { ...mkSection('c', 15), pre: [] }
assert.equal(
  bund.hasMeasurableGround(newBund, emptySection),
  false,
  'a section with no levels measures nothing'
)

// --- legacy flat-ground new bund still works -------------------------------
const legacy = {
  ...newBund,
  sections: [
    { ...mkSection('a', 0), pre: [], groundLevel: 95 },
    { ...mkSection('b', 30), pre: [], groundLevel: 95 }
  ]
}
assert.equal(bund.usesFlatGround(legacy, legacy.sections[0]), true, 'legacy section stays flat')
near(
  bund.sectionAreas(legacy, legacy.sections[0]).formation,
  expectedFill,
  0.05,
  'a saved single-RL new bund measures the same fill as before'
)

// --- no rock-toe excavation on a new bund ----------------------------------
const withRockToe = {
  ...newBund,
  rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
  rockToeExcavationMaterial: { code: 'IRR-CAW-1-2', unit: 'CUM' },
  rockToeExcavationDepth: 0.5,
  rockToeHeight: 2,
  rockToeTopWidth: 1,
  rockToeInnerSlope: 1
}
assert.equal(
  bund.rockToeExcavationAvailable(withRockToe),
  false,
  'a new bund measures no separate rock-toe excavation'
)
assert.equal(
  bund.rockToeExcavationAt(withRockToe.sections[0], withRockToe),
  null,
  'no rock-toe excavation geometry on a new bund'
)
assert.equal(
  bund.rowsTotal(bund.rockToeExcavationRows(withRockToe)),
  0,
  'rock-toe excavation quantity is zero on a new bund'
)
assert.ok(
  !bund
    .requiredItems(withRockToe)
    .some((item) => item.role === 'rocktoe-exc'),
  'no rock-toe excavation item is generated on a new bund'
)
assert.ok(
  bund.requiredItems(withRockToe).some((item) => item.role === 'rocktoe'),
  'the rock toe itself is still billed'
)
assert.equal(
  bund.rockToeExcavationAvailable({ ...withRockToe, mode: 'restoration' }),
  true,
  'a repair keeps its rock-toe excavation'
)

// --- internal filters are available and measured ---------------------------
const withFilters = {
  ...newBund,
  horizontalFilterMaterial: { code: 'IRR-CAW-5-10', unit: 'CUM' },
  horizontalFilterLength: 8,
  horizontalFilterThickness: 0.3,
  verticalFilterMaterial: { code: 'IRR-DAW-9-1', unit: 'CUM' },
  verticalFilterWidth: 1,
  verticalFilterHeight: 3
}
assert.equal(bund.internalFiltersAvailable(withFilters), true, 'filters offered on a new bund')
near(
  bund.rowsTotal(bund.horizontalFilterRows(withFilters)),
  8 * 0.3 * 30,
  0.01,
  'blanket volume = length × thickness × chainage'
)
near(
  bund.rowsTotal(bund.verticalFilterRows(withFilters)),
  1 * 3 * 30,
  0.01,
  'chimney volume = width × height × chainage'
)
const filterItems = bund.requiredItems(withFilters).map((i) => i.role)
assert.ok(filterItems.includes('hfilter'), 'blanket item generated')
assert.ok(filterItems.includes('vfilter'), 'chimney item generated')

// --- migration back-fills the free board -----------------------------------
const migrated = bund.migrateBundData({
  ...newBund,
  design: { ...newBund.design, freeBoard: undefined, mwl: 98, topLevel: 99.5 }
})
assert.equal(
  migrated.design.freeBoard,
  1.5,
  'a saved new bund reads its free board back out of MWL and TBL'
)

// --- excavation family switch ---------------------------------------------
const switched = bund.withStrippingExcavationFamily(base, 'foundation')
assert.equal(switched.strippingExcavationFamily, 'foundation')
assert.equal(switched.fillBasis, 'stripped')
assert.ok(
  switched.excavationBands.stripping.every((b) => b.material.code.startsWith('IRR-DAW')),
  'foundation family uses DAW codes'
)

// --- new zoned bund: cut-off trench under the hearting ---------------------
const zonedNew = {
  ...newBund,
  embankmentType: 'zoned',
  heartingDesign: {
    topLevel: 99,
    topWidth: 2,
    usSlope: 0.5,
    dsSlope: 0.5,
    centerOffset: 0
  },
  heartingMaterial: { code: 'IRR-DAW-5-1', unit: 'CUM' },
  formationMaterial: { code: 'IRR-DAW-5-3', unit: 'CUM' },
  heartingTrench: {
    depth: 1,
    bottomWidth: 2,
    usSlope: 1,
    dsSlope: 1,
    fillMaterial: { code: 'IRR-DAW-5-2', unit: 'CUM' },
    excavationMaterial: { code: 'IRR-DAW-1-1', unit: 'CUM' }
  }
}

assert.equal(
  bund.BUND_HEARTING_TRENCH_FILL_CODE,
  'IRR-DAW-5-2',
  'the trench fills on the SSR cut-off-trench filling item'
)
assert.equal(bund.heartingTrenchAvailable(zonedNew), true, 'offered on a new zoned bund')
assert.equal(
  bund.heartingTrenchAvailable({ ...zonedNew, mode: 'restoration' }),
  false,
  'never offered on a repair — the bund already stands on its foundation'
)
assert.equal(
  bund.heartingTrenchAvailable({ ...zonedNew, embankmentType: 'homogeneous' }),
  false,
  'a homogeneous bund has no core to carry down'
)

// Trapezium: (2 + (1+1)*1/2) * 1 = 3.00 sq.m; top width 2 + 2*1 = 4.00 m
near(bund.heartingTrenchArea(zonedNew), 3, 1e-9, 'trapezoidal trench section')
near(bund.heartingTrenchTopWidth(zonedNew), 4, 1e-9, 'trench top width')
near(
  bund.rowsTotal(bund.heartingTrenchRows(zonedNew)),
  3 * 30,
  0.01,
  'trench volume = section × chainage length'
)

const trenchProfile = bund.heartingTrenchProfile(zonedNew, zonedNew.sections[0])
assert.equal(trenchProfile.top.length >= 2, true, 'trench has a top on the formation base')
// Formation base is the stripped surface: ground 95 less the 0.3 m cut.
near(trenchProfile.bottom[0].rl, 95 - 0.3 - 1, 1e-6, 'invert is depth below the formation base')
near(trenchProfile.bottom[0].offset, -2 + 1, 1e-6, 'invert corner steps in by the u/s batter')
near(trenchProfile.bottom[1].offset, 2 - 1, 1e-6, 'invert corner steps in by the d/s batter')

const zonedItems = bund.requiredItems(zonedNew)
const trenchFillItem = zonedItems.find((item) => item.role === 'hearting-trench')
const trenchExcItem = zonedItems.find((item) => item.role === 'hearting-trench-exc')
assert.ok(trenchFillItem, 'the trench filling is generated as its own item')
assert.equal(
  trenchFillItem.ref.code,
  'IRR-DAW-5-2',
  'filling bills on the cut-off-trench code, not the hearting embankment code'
)
assert.ok(trenchExcItem, 'the trench excavation is generated and classified')
near(
  trenchFillItem.quantity,
  trenchExcItem.quantity,
  1e-6,
  'one solid: the cut and the backfill are the same volume'
)
assert.ok(
  zonedItems.some((item) => item.role === 'hearting') &&
    zonedItems.some((item) => item.role === 'casing'),
  'casing and hearting are still billed alongside the trench'
)

// Off by default, and off means nothing measured.
const trenchOff = {
  ...zonedNew,
  heartingTrench: { ...zonedNew.heartingTrench, fillMaterial: null }
}
assert.equal(bund.heartingTrenchEnabled(trenchOff), false, 'no code attached = trench off')
assert.equal(bund.rowsTotal(bund.heartingTrenchRows(trenchOff)), 0, 'nothing measured when off')
assert.ok(
  !bund.requiredItems(trenchOff).some((item) => item.role.startsWith('hearting-trench')),
  'no trench items generated when off'
)
assert.equal(
  bund.defaultBundHeartingTrench().fillMaterial,
  null,
  'the trench starts with no code attached'
)

// A trench wider than the hearting's own footprint is reported, not measured away.
const wideTrench = {
  ...zonedNew,
  heartingTrench: { ...zonedNew.heartingTrench, bottomWidth: 40 }
}
assert.ok(
  bund
    .heartingTrenchIssues(wideTrench, wideTrench.sections[0])
    .some((issue) => issue.code === 'too-wide'),
  'a trench wider than the hearting base is flagged'
)

console.log('OK — all new-bund checks passed')
