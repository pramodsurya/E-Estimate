const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
require.extensions['.ts'] = function compileTs(loadedModule, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  loadedModule._compile(outputText, filename)
}

const bund = require(path.join(root, 'src/renderer/src/lib/bund.ts'))
const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`
  )

const flatExisting = [
  { offset: -13, rl: 95 },
  { offset: -3, rl: 95 },
  { offset: 0, rl: 95 },
  { offset: 3, rl: 95 },
  { offset: 13, rl: 95 }
]
const data = bund.defaultBundData()
data.configured = true
data.mode = 'restoration'
data.embankmentType = 'zoned'
data.zonedRepairKind = 'breached'
data.zonedSoilSource = 'borrow'
data.source = 'manual'
data.lengthM = 30
data.design = {
  ...data.design,
  topLevel: 100,
  topWidth: 6,
  usSlope: 2,
  dsSlope: 2,
  stripDepth: 0
}
data.heartingDesign = {
  topLevel: 100,
  topWidth: 1,
  usSlope: 0.5,
  dsSlope: 0.5,
  centerOffset: 0
}
const repairCodes = bund.zonedSsrCodePair(data)
data.formationMaterial = { code: repairCodes.casing }
data.heartingMaterial = { code: repairCodes.hearting }
data.sections = [0, 30].map((chainage) => ({
  id: `z-${chainage}`,
  chainage,
  groundLevel: null,
  pre: flatExisting,
  stripped: null,
  projected: null
}))

const split = bund.zonedRepairAreas(data, data.sections[0])
near(split.totalFormation, 80, 0.001, 'total repair formation')
near(split.hearting, 17.5, 0.001, 'hearting bounded automatically by Existing RL')
near(split.casing, 62.5, 0.001, 'casing after hearting deduction')
near(split.casing + split.hearting, split.totalFormation, 0.001, 'area conservation')
near(bund.rowsTotal(bund.heartingRows(data)), 525, 0.001, 'hearting volume')
near(bund.rowsTotal(bund.casingRows(data)), 1875, 0.001, 'casing volume')
assert.equal(bund.heartingRepairIssues(data, data.sections[0]).length, 0)
assert.deepEqual(
  bund.requiredItems(data).filter((item) => ['casing', 'hearting'].includes(item.role))
    .map((item) => [item.role, item.ref.code, item.quantity]),
  [
    ['casing', 'IRR-PMW-3-9', 1875],
    ['hearting', 'IRR-PMW-3-8', 525]
  ]
)
assert.ok(
  bund
    .heartingRepairIssues(data, {
      ...data.sections[0],
      pre: []
    })
    .some((issue) => issue.code === 'missing-boundary')
)

const narrowSurvey = {
  ...data.sections[0],
  pre: [
    { offset: -1, rl: 95 },
    { offset: 1, rl: 95 }
  ]
}
assert.ok(
  bund
    .heartingRepairIssues(data, narrowSurvey)
    .some((issue) => issue.code === 'no-intersection')
)

const newZoned = {
  ...data,
  mode: 'new',
  sections: [0, 30].map((chainage) => ({
    id: `new-z-${chainage}`,
    chainage,
    groundLevel: 95,
    pre: [],
    stripped: null,
    projected: null
  }))
}
const newCodes = bund.zonedSsrCodePair(newZoned)
newZoned.formationMaterial = { code: newCodes.casing }
newZoned.heartingMaterial = { code: newCodes.hearting }
const newSplit = bund.zonedRepairAreas(newZoned, newZoned.sections[0])
near(newSplit.totalFormation, 80, 0.001, 'total new-zoned formation')
near(newSplit.hearting, 17.5, 0.001, 'full new hearting to formation base')
near(newSplit.casing, 62.5, 0.001, 'new casing after hearting deduction')
assert.equal(bund.heartingRepairIssues(newZoned, newZoned.sections[0]).length, 0)
assert.deepEqual(
  bund.requiredItems(newZoned).filter((item) => ['casing', 'hearting'].includes(item.role))
    .map((item) => [item.role, item.ref.code, item.quantity]),
  [
    ['casing', 'IRR-DAW-5-3', 1875],
    ['hearting', 'IRR-DAW-5-1', 525]
  ]
)

assert.deepEqual(
  bund.zonedSsrCodePair({
    mode: 'restoration',
    zonedRepairKind: 'breached',
    zonedSoilSource: 'dump'
  }),
  {
    casing: 'IRR-PMW-3-11',
    hearting: 'IRR-PMW-3-10',
    category: 'IRR-PMW'
  }
)
assert.deepEqual(
  bund.zonedSsrCodePair({
    mode: 'restoration',
    zonedRepairKind: 'raising',
    zonedSoilSource: 'dump'
  }),
  {
    casing: 'IRR-DAW-5-3',
    hearting: 'IRR-DAW-5-1',
    category: 'IRR-DAW'
  }
)

const zonedWithoutSeparateOperations = {
  ...data,
  formationEnabled: false,
  compactionEnabled: false
}
assert.deepEqual(
  bund.requiredItems(zonedWithoutSeparateOperations)
    .filter((item) =>
      ['casing', 'hearting', 'casing-rolling', 'hearting-rolling'].includes(item.role)
    )
    .map((item) => item.role),
  ['casing', 'hearting']
)

const migratedLegacyZoned = bund.migrateBundData({
  ...data,
  zonedSsrVersion: undefined,
  formationMaterial: { code: 'IRR-DAW-5-6' },
  heartingMaterial: { code: 'IRR-DAW-5-6' }
})
assert.equal(migratedLegacyZoned.formationMaterial.code, 'IRR-PMW-3-9')
assert.equal(migratedLegacyZoned.heartingMaterial.code, 'IRR-PMW-3-8')
assert.equal(migratedLegacyZoned.formationEnabled, true)
assert.equal(migratedLegacyZoned.compactionEnabled, true)

console.log('Zoned bund automatic hearting checks passed.')
