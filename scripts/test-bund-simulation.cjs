const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

// Same loader pattern as the other suites: transpile TS on require so the pure
// renderer libs load without any build step.
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
const sim = require(path.join(root, 'src/renderer/src/lib/bundSimulation.ts'))
const simTypes = require(path.join(root, 'src/renderer/src/types/bundSimulation.ts'))

// ── Case thresholds (IS 7894) ──────────────────────────────────────────────
assert.equal(simTypes.BUND_SIMULATION_CASES.construction.requiredFs, 1.0,
  'Case I minimum desired FS is 1.0')
assert.equal(simTypes.BUND_SIMULATION_CASES['steady-seepage'].requiredFs, 1.5,
  'Case IV minimum desired FS is 1.5')

// ── Defaults ───────────────────────────────────────────────────────────────
const defaults = sim.defaultBundSimulationData()
assert.equal(sim.DEFAULT_LEM_CONTROLS.method, 'ordinary',
  'the default LEM choice is the circular-arc method described by IS 7894')
assert.equal(defaults.schemaVersion, 1)
assert.equal(defaults.materials.length, 2,
  'one row for the fill and one for the foundation')
assert.equal(defaults.foundationThicknessM, 10)

// ── Geometry mapping ───────────────────────────────────────────────────────
const data = bund.defaultBundData()
data.design = {
  ...data.design,
  topLevel: 106,
  ftl: 105,
  mwl: 104
}
data.configured = true
const section = {
  id: 'sec0',
  chainage: 0,
  groundLevel: 100,
  pre: [],
  stripped: null,
  projected: null
}
data.sections = [section]

const emb = sim.simulationEmbankmentLine(data, section)
assert.ok(emb && emb.length >= 4, 'embankment outline has both faces and the crest')
// Crest edges sit half the crest width either side of the centre-line at TBL.
const crestPts = emb.filter(([, rl]) => rl === 106)
assert.deepEqual(
  crestPts.map(([x]) => x),
  [-1.5, 1.5],
  'crest edges are at ±topWidth/2 about the centre-line'
)
// Toes sit on the stripped surface below the centre-line ground level.
const strippedRl = 100 - data.design.stripDepth
for (const [x, rl] of emb) {
  assert.ok(Math.abs(rl - 106) < 1e-6 || Math.abs(rl - strippedRl) < 0.01 || rl > strippedRl,
    `outline point ${x},${rl} stays above the stripped surface`)
}

const ground = sim.simulationGroundLine(data, section)
assert.ok(ground, 'new mode produces a level ground line')
assert.equal(ground[0][1], strippedRl,
  'the modelled ground is the surface the fill seats on')
assert.ok(ground[0][0] < Math.min(...emb.map((p) => p[0])),
  'ground extends past the upstream toe')
assert.ok(ground[ground.length - 1][0] > Math.max(...emb.map((p) => p[0])),
  'ground extends past the downstream toe')

// Restoration surveys may cross the fixed proposal. They are quantity inputs,
// not a second solver layer: simulation support is assumed at the two proposed
// toes and remains below the completed outline.
section.pre = [
  { offset: -14, rl: 99.8 },
  { offset: 0, rl: 107 },
  { offset: 14, rl: 99.7 }
]
section.projected = emb.map(([offset, rl]) => ({ offset, rl }))
data.mode = 'restoration'
const repairOutline = sim.simulationEmbankmentLine(data, section)
const surveyed = sim.simulationGroundLine(data, section)
assert.ok(repairOutline && surveyed, 'crossing restoration still maps to simulation')
assert.equal(
  surveyed[0][1],
  repairOutline[0][1],
  'assumed foundation starts at the proposed upstream toe'
)
assert.equal(
  surveyed[surveyed.length - 1][1],
  repairOutline[repairOutline.length - 1][1],
  'assumed foundation ends at the proposed downstream toe'
)
for (const [x, rl] of repairOutline) {
  const groundRl = interpolate(surveyed, x)
  assert.ok(groundRl <= rl + 1e-8, `assumed support stays below proposal at x=${x}`)
}
assert.ok(
  !surveyed.some(([, rl]) => rl === 107),
  'the crossing surveyed point is not sent as a foundation boundary'
)
section.pre = []
section.projected = null

// ── Request building ───────────────────────────────────────────────────────
const request = sim.buildBundSimulationRequest(
  data, section, defaults, 'steady-seepage', 'run-1'
)
assert.ok(request, 'a complete section maps to an engine request')
assert.equal(request.runId, 'run-1')
assert.equal(request.water.reservoirLevel, 105,
  'FTL is the seepage reservoir level when present')
assert.equal(request.materials.length, 2)
assert.ok('kx' in request.materials[0], 'seepage requests carry permeabilities')
assert.ok(!('kx' in sim.buildBundSimulationRequest(
  data, section, defaults, 'construction', 'r2').materials[0]),
  'construction requests carry no permeabilities')

const constructionRequest = sim.buildBundSimulationRequest(
  data, section, defaults, 'construction', 'r2'
)
assert.equal(constructionRequest.water.reservoirLevel, null,
  'construction carries no reservoir condition')
assert.ok(request.geometry.materialPolygons.length >= 2,
  'request uses polygon-sheet material zones')
assert.ok(request.geometry.materialPolygons.every((polygon) => polygonArea(polygon.points) > 0),
  'every material polygon has a positive area')

// Case III-A is a full-pool staged drawdown, not a Case II trial-pool job.
// Its expanded job therefore carries no derived pool level, but it must still
// reach request construction and take the entered full reservoir elevation.
const drawdownWater = {
  ...defaults.water,
  reservoirFull: 98,
  minHeadwater: 91,
  tailWaterMax: 90
}
const drawdownJobs = sim.caseJobs('drawdown-us', drawdownWater, 90, 106)
assert.equal(drawdownJobs.length, 1)
assert.equal(drawdownJobs[0].reservoirLevel, null,
  'Case III-A does not use a derived Case II trial-pool level')
assert.equal(sim.isUnresolvedPartialPoolJob(drawdownJobs[0]), false,
  'Case III-A is not rejected by the Case II trial-pool guard')
const drawdownRequest = sim.buildBundSimulationRequest(
  data,
  section,
  { ...defaults, water: drawdownWater },
  'drawdown-us',
  'drawdown-us-regression',
  sim.DEFAULT_LEM_CONTROLS,
  drawdownJobs[0]
)
assert.ok(drawdownRequest, 'Case III-A reaches engine request construction')
assert.equal(drawdownRequest.water.reservoirLevel, 98,
  'Case III-A establishes its initial seepage field at the full reservoir level')
assert.equal(drawdownRequest.water.minHeadwater, 91,
  'Case III-A carries the post-drawdown minimum head-water level')

const missingRapidPair = sim.validateBundSimulationInputs(
  { ...defaults, water: drawdownWater },
  ['drawdown-us'],
  98,
  'lem',
  sim.DEFAULT_LEM_CONTROLS,
  null
)
assert.ok(
  missingRapidPair.errors.some((error) => error.includes('enter both d and ψ')),
  'Case III-A preflight names the missing d/ψ pair instead of silently doing nothing'
)
const onlyRapidPsi = sim.validateBundSimulationInputs(
  {
    ...defaults,
    water: drawdownWater,
    materials: defaults.materials.map((material, index) =>
      index === 0 ? { ...material, rapidPsi: 22 } : material
    )
  },
  ['drawdown-us'],
  98,
  'lem',
  sim.DEFAULT_LEM_CONTROLS,
  null
)
assert.ok(
  onlyRapidPsi.errors.some((error) => error.includes('enter both d and ψ')),
  'one drawdown-strength value alone is not accepted as a pair'
)
const completeRapidPair = sim.validateBundSimulationInputs(
  {
    ...defaults,
    water: drawdownWater,
    materials: defaults.materials.map((material, index) =>
      index === 0 ? { ...material, rapidD: 0, rapidPsi: 22 } : material
    )
  },
  ['drawdown-us'],
  98,
  'lem',
  sim.DEFAULT_LEM_CONTROLS,
  null
)
assert.ok(
  !completeRapidPair.errors.some((error) => error.includes('enter both d and ψ')),
  'an explicit d/ψ pair passes the rapid-strength gate'
)

const staleCaseIIIMinimum = {
  ...defaults,
  water: {
    ...drawdownWater,
    tailWaterMax: 92,
    tailWaterMin: 1
  },
  materials: defaults.materials.map((material, index) =>
    index === 0 ? { ...material, rapidD: 0, rapidPsi: 22 } : material
  )
}
const caseIIIAWithStaleIIIBValue = sim.validateBundSimulationInputs(
  staleCaseIIIMinimum,
  ['drawdown-us'],
  98,
  'lem',
  sim.DEFAULT_LEM_CONTROLS,
  90
)
assert.ok(
  !caseIIIAWithStaleIIIBValue.errors.some((error) =>
    error.includes('Tail-water levels are absolute RLs')
  ),
  'Case III-A ignores the stored Case III-B minimum tail-water level'
)
const caseIIIBWithLowMinimum = sim.validateBundSimulationInputs(
  staleCaseIIIMinimum,
  ['drawdown-ds'],
  98,
  'lem',
  sim.DEFAULT_LEM_CONTROLS,
  90
)
assert.ok(
  caseIIIBWithLowMinimum.errors.some((error) =>
    error.includes('Tail-water levels are absolute RLs')
  ),
  'Case III-B still rejects its own minimum tail-water at or below the toe'
)

const unresolvedPartialPool = sim.caseJobs(
  'partial-pool',
  { ...defaults.water, reservoirFull: 90 },
  90,
  106
)[0]
assert.equal(sim.isUnresolvedPartialPoolJob(unresolvedPartialPool), true,
  'Case II still reports an unresolved trial pool when full level is not above the toe')

// ── Zoned polygon mapping ──────────────────────────────────────────────────
const zonedRepair = bund.defaultBundData()
zonedRepair.configured = true
zonedRepair.mode = 'restoration'
zonedRepair.embankmentType = 'zoned'
zonedRepair.design = {
  ...zonedRepair.design,
  topLevel: 100,
  topWidth: 6,
  usSlope: 2,
  dsSlope: 2,
  stripDepth: 0
}
zonedRepair.heartingDesign = {
  topLevel: 100,
  topWidth: 1,
  usSlope: 0.5,
  dsSlope: 0.5,
  centerOffset: 0
}
const zonedRepairSection = {
  id: 'zoned-repair',
  chainage: 0,
  groundLevel: null,
  pre: [
    { offset: -13, rl: 95 },
    { offset: -3, rl: 95 },
    { offset: 0, rl: 95 },
    { offset: 3, rl: 95 },
    { offset: 13, rl: 95 }
  ],
  stripped: null,
  projected: null
}
zonedRepair.sections = [zonedRepairSection]
// A repair carries no cut-off trench by construction; selecting backfill or
// excavation codes must not make the simulation invent one.
zonedRepair.heartingTrench.fillMaterial = { code: 'TEST-HEARTING-FILL' }
zonedRepair.heartingTrench.excavationMaterial = { code: 'TEST-FOUNDATION-EXC' }
const zonedRepairSim = sim.normalizeBundSimulationData(zonedRepair)
assert.deepEqual(
  zonedRepairSim.materials.map((material) => material.role),
  ['embankment', 'foundation', 'hearting'],
  'zoned repair adds a separate hearting material row'
)
const zonedRepairRequest = sim.buildBundSimulationRequest(
  zonedRepair,
  zonedRepairSection,
  zonedRepairSim,
  'construction',
  'zoned-repair-run'
)
assert.ok(zonedRepairRequest, 'zoned repair maps to solver polygons')
assert.ok(
  zonedRepairRequest.geometry.materialPolygons.some((polygon) => polygon.role === 'hearting'),
  'repair hearting is a separate polygon-sheet material zone'
)
assert.ok(
  !zonedRepairRequest.geometry.materialPolygons.some(
    (polygon) => polygon.role === 'cutoff-trench'
  ),
  'repair never invents a new cut-off trench, even with trench codes selected'
)
assertTiledDomain(zonedRepairRequest)

// Full-depth repair hearting: the surveyed profile crosses above the
// foundation, yet the proposed hearting must run from its designed top all the
// way down to the modelled foundation surface at the toes — not stop at
// Existing RL or at the measured repair-fill bands.
const raisedSurvey = [
  { offset: -16, rl: 94 },
  { offset: -10, rl: 95 },
  { offset: -4, rl: 97 },
  { offset: 0, rl: 97.5 },
  { offset: 4, rl: 97 },
  { offset: 10, rl: 95 },
  { offset: 16, rl: 94 }
]
const deepRepairSection = {
  ...zonedRepairSection,
  id: 'zoned-repair-deep',
  pre: raisedSurvey
}
const deepRepairRequest = sim.buildBundSimulationRequest(
  zonedRepair,
  deepRepairSection,
  zonedRepairSim,
  'construction',
  'zoned-repair-deep-run'
)
assert.ok(deepRepairRequest, 'a raised-survey repair still maps to solver polygons')
assertFullDepthHearting(deepRepairRequest, zonedRepair)
assertTiledDomain(deepRepairRequest)

const zonedNew = JSON.parse(JSON.stringify(zonedRepair))
zonedNew.mode = 'new'
const zonedNewSection = {
  ...zonedRepairSection,
  id: 'zoned-new',
  groundLevel: 95,
  pre: []
}
zonedNew.sections = [zonedNewSection]
const zonedNewSim = sim.normalizeBundSimulationData(zonedNew)
assert.deepEqual(
  zonedNewSim.materials.map((material) => material.role),
  ['embankment', 'foundation', 'hearting', 'cutoff-trench'],
  'new zoned bund adds separate hearting and cut-off material rows'
)
const zonedNewRequest = sim.buildBundSimulationRequest(
  zonedNew,
  zonedNewSection,
  zonedNewSim,
  'steady-seepage',
  'zoned-new-run'
)
assert.ok(zonedNewRequest, 'new zoned bund with cut-off maps to solver polygons')
for (const role of ['hearting', 'cutoff-trench']) {
  assert.ok(
    zonedNewRequest.geometry.materialPolygons.some((polygon) => polygon.role === role),
    `${role} is emitted as its own material zone`
  )
}
// New-work hearting is also the complete finished core: designed top down to
// the prepared formation surface, not truncated at any surveyed line.
assertFullDepthHearting(zonedNewRequest, zonedNew)
assertHeartingMatchesDesign(zonedNewRequest, zonedNew, zonedNewSection)

// ── Complete core even where it rides above the casing ────────────────────
// Design draws and measures the full designed trapezoid. Wherever the core
// rises above the finished casing — a hearting top above the crest, or a flat
// top reaching past the crest edge — the solver used to receive a hearting
// clipped to the casing face, dropping the two side wings from the FS model.
const tallCoreData = JSON.parse(JSON.stringify(zonedNew))
tallCoreData.design = { ...tallCoreData.design, topLevel: 108 }
tallCoreData.heartingDesign = {
  topLevel: 110,
  topWidth: 3,
  usSlope: 0.5,
  dsSlope: 0.5,
  centerOffset: 0
}
const tallCoreSection = { ...zonedNewSection, id: 'tall-core', groundLevel: 100 }
tallCoreData.sections = [tallCoreSection]
const tallCoreRequest = sim.buildBundSimulationRequest(
  tallCoreData,
  tallCoreSection,
  sim.normalizeBundSimulationData(tallCoreData),
  'construction',
  'tall-core-run'
)
assert.ok(tallCoreRequest, 'a core taller than the casing maps to solver polygons')
// Height 10, top width 3, 0.5H:1V both sides -> base 13, area 80.
assertHeartingMatchesDesign(tallCoreRequest, tallCoreData, tallCoreSection)
assertHeartingArea(tallCoreRequest, 80)
assertNoOverlappingPolygons(tallCoreRequest.geometry.materialPolygons)

const offsetCoreData = JSON.parse(JSON.stringify(zonedNew))
offsetCoreData.design = { ...offsetCoreData.design, topLevel: 108 }
offsetCoreData.heartingDesign = {
  topLevel: 108,
  topWidth: 3,
  usSlope: 0.5,
  dsSlope: 0.5,
  centerOffset: 2
}
const offsetCoreSection = { ...zonedNewSection, id: 'offset-core', groundLevel: 100 }
offsetCoreData.sections = [offsetCoreSection]
const offsetCoreRequest = sim.buildBundSimulationRequest(
  offsetCoreData,
  offsetCoreSection,
  sim.normalizeBundSimulationData(offsetCoreData),
  'construction',
  'offset-core-run'
)
assert.ok(offsetCoreRequest, 'an offset core grazing the casing face maps to solver polygons')
// Height 8, top width 3, 0.5H:1V both sides -> base 11, area 56; its flat top
// passes the downstream crest edge, which used to shave the wing tip.
assertHeartingMatchesDesign(offsetCoreRequest, offsetCoreData, offsetCoreSection)
assertHeartingArea(offsetCoreRequest, 56)
assertNoOverlappingPolygons(offsetCoreRequest.geometry.materialPolygons)
const newGroundMin = Math.min(...zonedNewRequest.geometry.ground.map((p) => p[1]))
const trenchDepth = zonedNew.heartingTrench.depth
const trenchPolygons = zonedNewRequest.geometry.materialPolygons.filter(
  (polygon) => polygon.role === 'cutoff-trench'
)
assert.ok(trenchPolygons.length > 0, 'the enabled cut-off trench is emitted')
for (const polygon of trenchPolygons) {
  const invert = Math.min(...polygon.points.map(([, rl]) => rl))
  assert.ok(
    Math.abs(invert - (newGroundMin - trenchDepth)) < 1e-6,
    'the cut-off trench reaches its designed invert below the formation base'
  )
}
assertTiledDomain(zonedNewRequest)

// ── Rock toe + graded filter imported from Design ─────────────────────────
const rockToeData = bund.defaultBundData()
rockToeData.configured = true
rockToeData.mode = 'new'
rockToeData.design = {
  ...rockToeData.design,
  topLevel: 106,
  topWidth: 4,
  usSlope: 2.5,
  dsSlope: 2,
  ftl: 105,
  mwl: 104,
  stripDepth: 0
}
rockToeData.rockToeMaterial = {
  code: bund.BUND_DEFAULT_ROCKTOE_CODE,
  unit: 'CUM',
  description: 'Designed rubble rock toe'
}
rockToeData.rockToeFilterMaterial = {
  code: bund.BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  unit: 'CUM',
  description: 'Designed graded toe filter'
}
rockToeData.rockToeHeight = 2
rockToeData.rockToeTopWidth = 1
rockToeData.rockToeInnerSlope = 1
const rockToeSection = {
  id: 'rock-toe-new',
  chainage: 0,
  groundLevel: 100,
  pre: [],
  stripped: null,
  projected: null
}
rockToeData.sections = [rockToeSection]

const rockToeSim = sim.normalizeBundSimulationData(rockToeData)
assert.deepEqual(
  rockToeSim.materials.map((material) => material.role),
  ['embankment', 'foundation', 'rocktoe', 'rocktoe-filter'],
  'enabled design items add separate rock-toe and filter material rows'
)
assert.equal(
  rockToeSim.materials.find((material) => material.role === 'rocktoe').name,
  'Designed rubble rock toe',
  'the rock-toe row takes its identity from the selected design item'
)
const embankmentK = rockToeSim.materials.find(
  (material) => material.role === 'embankment'
).kx
const rockToeK = rockToeSim.materials.find((material) => material.role === 'rocktoe').kx
const filterK = rockToeSim.materials.find(
  (material) => material.role === 'rocktoe-filter'
).kx
assert.ok(
  rockToeK > filterK && filterK > embankmentK,
  'starting conductivities make the rock toe and graded filter free-draining relative to fill'
)

const designToeZones = sim.simulationRockToeZones(rockToeData, rockToeSection)
assert.ok(designToeZones, 'enabled rock toe produces solver geometry')
assert.ok(designToeZones.filterBehind, 'the design filter is mapped behind the inner face')
assert.ok(designToeZones.filterBelow, 'the design filter is mapped below the base')
assert.ok(
  Math.abs(
    polygonArea(designToeZones.rockToe) - bund.rockToeAreaAt(rockToeSection, rockToeData)
  ) <= 0.01,
  'solver rock-toe geometry has the same area as the Design quantity geometry'
)

const rockToeRequest = sim.buildBundSimulationRequest(
  rockToeData,
  rockToeSection,
  rockToeSim,
  'steady-seepage',
  'rock-toe-run'
)
assert.ok(rockToeRequest, 'enabled rock toe and filter map to a solver request')
for (const role of ['rocktoe', 'rocktoe-filter']) {
  assert.ok(
    rockToeRequest.geometry.materialPolygons.some((polygon) => polygon.role === role),
    `${role} is emitted as its own material zone`
  )
}
const rockToePolygonArea = rockToeRequest.geometry.materialPolygons
  .filter((polygon) => polygon.role === 'rocktoe')
  .reduce((sum, polygon) => sum + polygonArea(polygon.points), 0)
const filterPolygonArea = rockToeRequest.geometry.materialPolygons
  .filter((polygon) => polygon.role === 'rocktoe-filter')
  .reduce((sum, polygon) => sum + polygonArea(polygon.points), 0)
assert.ok(
  Math.abs(rockToePolygonArea - bund.rockToeAreaAt(rockToeSection, rockToeData)) <= 0.02,
  'the material sheet replaces the lower shell with the full designed rock toe'
)
assert.ok(
  Math.abs(filterPolygonArea - bund.rockToeFilterAreaAt(rockToeSection, rockToeData)) <= 0.02,
  'the material sheet carries the full standard behind-and-below filter area'
)
assertTiledDomain(rockToeRequest)
const rockToeCheck = sim.validateBundSimulationInputs(
  rockToeSim,
  ['steady-seepage'],
  rockToeRequest.water.reservoirLevel
)
assert.ok(
  rockToeCheck.warnings.some((warning) => warning.includes('geometry come from Design')),
  'the UI warns that design geometry does not prove geotechnical properties'
)

const rockToeWithoutFilter = {
  ...rockToeData,
  rockToeFilterMaterial: null
}
const rockToeOnlySim = sim.normalizeBundSimulationData(rockToeWithoutFilter)
assert.ok(
  rockToeOnlySim.materials.some((material) => material.role === 'rocktoe') &&
    !rockToeOnlySim.materials.some((material) => material.role === 'rocktoe-filter'),
  'disabling only the filter keeps the buttressing rock toe without inventing drainage layers'
)
const rockToeOnlyZones = sim.simulationRockToeZones(rockToeWithoutFilter, rockToeSection)
assert.ok(
  rockToeOnlyZones && !rockToeOnlyZones.filterBehind && !rockToeOnlyZones.filterBelow,
  'filter polygons are absent when the filter item is disabled in Design'
)

const rockToeDisabled = {
  ...rockToeData,
  rockToeMaterial: null,
  rockToeFilterMaterial: null
}
assert.equal(
  sim.simulationRockToeZones(rockToeDisabled, rockToeSection),
  null,
  'no rock-toe geometry is invented when the Design item is disabled'
)
assert.ok(
  !sim
    .normalizeBundSimulationData(rockToeDisabled)
    .materials.some(
      (material) => material.role === 'rocktoe' || material.role === 'rocktoe-filter'
    ),
  'disabled design items create no solver material rows'
)

// ── Foundation source metadata + legacy row migration ──────────────────────
const normAssumed = sim.normalizeBundSimulationData(zonedNew)
assert.equal(normAssumed.foundationSource, 'assumed',
  'foundation inputs default to assumed')
const storedTested = { ...sim.defaultBundSimulationData(), foundationSource: 'tested' }
assert.equal(sim.normalizeBundSimulationData(zonedNew, storedTested).foundationSource,
  'tested', 'a saved tested status is preserved')
// Projects saved before the field existed normalize to assumed.
assert.equal(
  sim.normalizeBundSimulationData(zonedNew, {
    schemaVersion: 1,
    materials: [],
    foundationThicknessM: 10,
    results: []
  }).foundationSource,
  'assumed',
  'legacy simulation data without a foundation source normalizes to assumed'
)

const assumedRequest = sim.buildBundSimulationRequest(
  zonedNew, zonedNewSection, normAssumed, 'construction', 'fs-assumed'
)
assert.equal(assumedRequest.foundationSource, 'assumed',
  'the engine request carries the foundation source')
const testedRequest = { ...assumedRequest, foundationSource: 'tested' }
assert.notEqual(
  sim.requestFingerprint(assumedRequest),
  sim.requestFingerprint(testedRequest),
  'switching the foundation source moves the run fingerprint'
)
const assumedCheck = sim.validateBundSimulationInputs(normAssumed, ['construction'], null)
assert.ok(assumedCheck.warnings.some((w) => w.toLowerCase().includes('assumed')),
  'assumed foundation properties warn before a run')
const testedCheck = sim.validateBundSimulationInputs(
  sim.normalizeBundSimulationData(zonedNew, storedTested), ['construction'], null
)
assert.ok(!testedCheck.warnings.some((w) => w.toLowerCase().includes('assumed')),
  'tested foundation properties do not raise the assumption warning')

// Saved rows from before roles existed keep their engineer-edited values.
const legacyStored = {
  schemaVersion: 1,
  foundationThicknessM: 12,
  results: [],
  materials: [
    { name: 'Old fill', gamma: 17.5, gammaSat: 18.5, cPrime: 5, phiPrime: 20, kx: null, ky: null },
    { name: 'Old foundation', gamma: 18.5, gammaSat: 19.5, cPrime: 4, phiPrime: 25, kx: null, ky: null }
  ]
}
const legacySim = sim.normalizeBundSimulationData(zonedNew, legacyStored)
assert.equal(legacySim.materials[0].role, 'embankment')
assert.equal(legacySim.materials[0].name, 'Old fill',
  'the first unlabelled saved row stays the embankment fill')
assert.equal(legacySim.materials[0].gamma, 17.5,
  'engineer-edited values survive role migration')
assert.equal(legacySim.materials[1].role, 'foundation')
assert.equal(legacySim.materials[1].name, 'Old foundation',
  'the second unlabelled saved row stays the foundation')
assert.equal(legacySim.foundationThicknessM, 12)

// ── Fingerprints ───────────────────────────────────────────────────────────
const fp = sim.requestFingerprint(request)
const changed = JSON.parse(JSON.stringify(request))
changed.geometry.embankment[0][1] += 0.5
assert.notEqual(fp, sim.requestFingerprint(changed),
  'any geometry change moves the fingerprint')
changed.geometry.embankment = request.geometry.embankment
changed.materials[0].cPrime += 1
assert.notEqual(fp, sim.requestFingerprint(changed),
  'a material change moves the fingerprint too')
assert.equal(fp, sim.requestFingerprint(JSON.parse(JSON.stringify(request))),
  'identical inputs hash identically')

// ── Validation gates ───────────────────────────────────────────────────────
const bad = JSON.parse(JSON.stringify(defaults))
bad.materials[0].gammaSat = 17 // below moist
bad.materials[0].phiPrime = 61 // outside 0–50°
bad.materials[1].kx = null // seepage needs permeability
const check = sim.validateBundSimulationInputs(bad, ['steady-seepage'], null)
for (const fragment of [
  'saturated unit weight',
  'friction angle',
  'permeability',
  'full tank level'
]) {
  assert.ok(
    check.errors.some((e) => e.toLowerCase().includes(fragment)),
    `validation blocks: ${fragment}`
  )
}
const fine = sim.validateBundSimulationInputs(defaults, ['construction'], null)
assert.equal(fine.errors.length, 0,
  'defaults pass validation for the construction case')
assert.ok(fine.warnings.some((w) => w.toLowerCase().includes('isotropic')),
  'missing ky warns as isotropic')

// ── Persistence migration keeps simulation data ────────────────────────────
const migrated = bund.migrateBundData({
  ...bund.defaultBundData(),
  configured: true,
  simulation: { ...sim.defaultBundSimulationData(), results: [{ marker: true }] }
})
assert.ok(migrated.simulation, 'migrateBundData preserves stored simulations')
assert.equal(migrated.simulation.results.length, 1)
// And old projects without one open normally.
assert.equal(bund.migrateBundData({ ...bund.defaultBundData(), configured: true }).simulation,
  undefined, 'projects predating the simulation open without one')

// A background result must merge into the latest simulation settings rather
// than restoring the water/material snapshot captured when Run was pressed.
const fallbackDuringRun = {
  ...sim.defaultBundSimulationData(),
  water: { ...sim.defaultBundSimulationWaterInputs(), reservoirFull: 98 },
  results: [{ id: 'old', createdAt: '2026-01-01' }]
}
const editedWhileRunning = {
  ...fallbackDuringRun,
  water: { ...fallbackDuringRun.water, reservoirFull: 99 },
  foundationThicknessM: 14
}
const mergedAfterNavigation = sim.mergeBundSimulationRuns(
  editedWhileRunning,
  fallbackDuringRun,
  [{ id: 'fresh', createdAt: '2026-01-02' }]
)
assert.equal(mergedAfterNavigation.water.reservoirFull, 99,
  'background completion preserves the latest water input')
assert.equal(mergedAfterNavigation.foundationThicknessM, 14,
  'background completion preserves the latest foundation edit')
assert.deepEqual(mergedAfterNavigation.results.map((run) => run.id), ['old', 'fresh'],
  'background completion appends its result without losing history')

// ── Engine contract pins (source text) ─────────────────────────────────────
const sidecar = fs.readFileSync(path.join(root, 'analysis/bund_analysis.py'), 'utf8')
assert.match(sidecar, /"steady-seepage"/, 'sidecar implements the steady-seepage case')
assert.match(sidecar, /"construction"/, 'sidecar implements the construction case')
assert.match(sidecar, /run_lem_analysis/, 'sidecar runs the xslope LEM search')
assert.match(sidecar, /run_seepage_analysis/, 'sidecar solves finite-element seepage')
assert.match(sidecar, /apply_steady_stability_field/,
  'seepage pore pressures feed the stability slices')
assert.match(sidecar, /seepage_contours\(mesh, solution2\)/,
  'rapid drawdown returns the post-drawdown phreatic line')
assert.match(sidecar, /seep_field_payload\(mesh, solution2\)/,
  'rapid drawdown returns the post-drawdown total-head field')
assert.match(sidecar, /"postDrawdownSeepField"/,
  'the engine response distinguishes the second drawdown field')
assert.match(sidecar, /wb\["polygon"\]/,
  'sidecar writes the XSLOPE polygon sheet')
assert.match(sidecar, /row=5[\s\S]*value="material"/,
  'polygon sheet writes v21 Type on row 5')
assert.match(sidecar, /redirect_stdout|dup2/,
  'engine chatter is kept off the JSON stdout channel')

const runner = fs.readFileSync(path.join(root, 'src/main/bundSimulation.ts'), 'utf8')
assert.doesNotMatch(runner, /\bshell:\s*true|exec\(/,
  'the sidecar spawns without any shell')
assert.match(runner, /RUN_TIMEOUT_MS/, 'the sidecar run has a timeout')
assert.match(runner, /activeBundProcesses[\s\S]*cancelBundSimulation/s,
  'the main process owns and can cancel navigation-independent solver children')
assert.match(runner, /seepage-stage-1[\s\S]*seepage-stage-2[\s\S]*slip-search/s,
  'the solver reports meaningful calculation phases')

const ipc = fs.readFileSync(path.join(root, 'src/main/ipc.ts'), 'utf8')
assert.match(ipc, /'bund:simulate'/, 'the simulate handler is registered')
assert.match(ipc, /'bund:cancel'/, 'the simulation cancellation handler is registered')

const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8')
assert.match(preload, /bund:\s*\{[\s\S]*simulate:/s,
  'the preload bridge exposes bund.simulate')
assert.match(preload, /onProgress:[\s\S]*bund:simulation-progress/s,
  'the preload bridge exposes persistent main-process progress')

// ── Simulation UI explanations ────────────────────────────────────────────
const simulationTab = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/bund/BundSimulationTab.tsx'),
  'utf8'
)
assert.match(simulationTab, /role="tooltip"[\s\S]*tabIndex|tabIndex=\{0\}[\s\S]*role="tooltip"/,
  'technical help is available on keyboard focus as well as pointer hover')
assert.match(simulationTab, /Maximum tail-water \(m RL\)[\s\S]*absolute RL, not depth/s,
  'maximum tail water explains absolute RL rather than water depth')
assert.match(simulationTab, /term="Slip circle"[\s\S]*not a physical circular crack/s,
  'the result explains that the slip circle is a mathematical failure surface')
assert.match(simulationTab, /term="Seepage coloured graph"[\s\S]*not a safety or danger colour scale/s,
  'the seepage figure explains its total-head colours')
assert.match(simulationTab, /function DrawdownSeepageComparison[\s\S]*Stage 1 — Before drawdown[\s\S]*Stage 2 — After drawdown/s,
  'Case III results compare the pre- and post-drawdown seepage fields')
assert.match(simulationTab, /both diagrams use one shared head-colour scale/,
  'drawdown fields use a shared colour scale for an honest comparison')
assert.match(simulationTab, /predates post-drawdown visualization[\s\S]*rerun this case/s,
  'old stored Case III runs explain why their second field is absent')
assert.match(simulationTab, /not a time-history or transient seepage simulation/,
  'the UI does not misrepresent staged steady fields as transient seepage')
assert.match(simulationTab, /role="alert"[\s\S]*Run \{caseMeta\.short\} did not start/s,
  'a rejected run explains the failure beside the Run button')
assert.match(simulationTab, /try \{[\s\S]*await executeCase[\s\S]*catch \(error\)/s,
  'unexpected IPC or renderer failures are caught and reported')
assert.match(simulationTab, /slip-circle search can take several[\s\S]*minutes/s,
  'rapid drawdown explains that a genuine search can take several minutes')
assert.match(simulationTab, /cannot start yet[\s\S]*Enter both <strong>d<\/strong>[\s\S]*<strong>ψ<\/strong>/s,
  'Case III exposes its missing drawdown-strength pair before Run')
assert.match(simulationTab, /Select all[\s\S]*Delete selected/s,
  'the current case run list provides select-all and bulk-delete actions')
assert.match(simulationTab, /type="checkbox"[\s\S]*toggleRunGroupSelection/s,
  'individual stored run groups can be selected')
assert.match(simulationTab, /window\.confirm\([\s\S]*cannot be undone/s,
  'bulk run deletion requires confirmation')
assert.match(simulationTab, /results:\s*sim\.results\.filter\([\s\S]*selectedKeys\.has\(run\.groupId \?\? run\.id\)/s,
  'deletion removes only the selected run groups and preserves all others')
assert.match(simulationTab, /Current run —[\s\S]*RUNNING|RUNNING[\s\S]*Current run —/s,
  'the active simulation is identified as the current running job')
assert.match(simulationTab, /caseRunGroups\.length > 0[\s\S]*Previous completed runs[\s\S]*className="bund-sim-runs"/s,
  'completed run history remains rendered beneath an active analysis')
assert.doesNotMatch(simulationTab, /useState<BundSimulationJob\[\] \| null>/,
  'running-job ownership is no longer local to the Simulation tab')
assert.match(simulationTab, /appendSimulationRuns\(projectId, node\.id, sim, outcome\.runs\)/,
  'completion atomically appends fresh runs through the global store')

const appSource = fs.readFileSync(path.join(root, 'src/renderer/src/App.tsx'), 'utf8')
assert.match(appSource, /bund\.onProgress[\s\S]*updateBundSimulationProgress/s,
  'the application shell receives progress while other pages are open')
assert.doesNotMatch(appSource, /SimulationActivityNotice|bund-global-job/s,
  'simulation progress never returns as an obstructive floating card')
const titleBarSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/TitleBar.tsx'),
  'utf8'
)
assert.match(titleBarSource, /Bell[\s\S]*NotificationPanel[\s\S]*appNotifications/s,
  'the title bar bell owns the persistent notification centre')
assert.match(titleBarSource, /Cancel simulation[\s\S]*update\.download[\s\S]*update\.install/s,
  'the bell exposes simulation cancellation and updater actions')
const updaterSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/UpdateNotification.tsx'),
  'utf8'
)
assert.match(updaterSource, /deliberately headless[\s\S]*upsertAppNotification[\s\S]*return null/s,
  'the updater feeds the bell without drawing another floating toast')
const mainIndex = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8')
assert.match(mainIndex, /hasActiveBundSimulations[\s\S]*Cancel simulation and close/s,
  'closing the application warns before cancelling an active analysis')
const storeSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/store/useStore.ts'),
  'utf8'
)
assert.match(storeSource, /confirmProjectReplacementWhileSimulation[\s\S]*unfinished[\s\S]*not be saved/s,
  'replacing or closing a project warns about its active simulation')
assert.match(simulationTab, /term="FEM coloured graph"[\s\S]*not automatic code failure/s,
  'the FEM figure explains the strain or displacement colour ramp')
assert.match(simulationTab, /closest\('\.bund-sim'\)[\s\S]*rightLimit[\s\S]*arrowLeft/s,
  'help tooltips are clamped to the simulation workspace while keeping their pointer aligned')
const simulationStyles = fs.readFileSync(
  path.join(root, 'src/renderer/src/styles/styles.css'),
  'utf8'
)
assert.match(simulationStyles, /\.bund-sim-tooltip\s*\{[\s\S]*position:\s*fixed/s,
  'help tooltips use viewport positioning so fixed navigation cannot clip them')
assert.doesNotMatch(simulationStyles, /\.bund-global-job\s*\{/,
  'the old page-covering simulation card style has been removed')
assert.match(simulationStyles, /\.tb-notification-panel\s*\{[\s\S]*\.tb-notification-progress/s,
  'the bell panel includes live notification and update-progress styling')

console.log('test-bund-simulation: all assertions passed')

function interpolate(line, x) {
  if (x <= line[0][0]) return line[0][1]
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]
    const b = line[i]
    if (x > b[0]) continue
    return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])
  }
  return line[line.length - 1][1]
}

function polygonArea(points) {
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length]
    twice += points[i][0] * next[1] - next[0] * points[i][1]
  }
  return Math.abs(twice) / 2
}

function trapezoidArea(line, lowerAt) {
  let area = 0
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]
    const b = line[i]
    area += ((a[1] - lowerAt(a[0]) + b[1] - lowerAt(b[0])) / 2) * (b[0] - a[0])
  }
  return area
}

function assertTiledDomain(request) {
  const polygons = request.geometry.materialPolygons
  assert.ok(polygons.every((polygon) => polygonArea(polygon.points) > 1e-8))
  const ground = request.geometry.ground
  const embankment = request.geometry.embankment
  const bottom = Math.min(...ground.map((point) => point[1])) - request.water.foundationThicknessM
  const foundationArea = trapezoidArea(ground, () => bottom)
  const fillArea = trapezoidArea(embankment, (x) => interpolate(ground, x))
  const polygonTotal = polygons.reduce((sum, polygon) => sum + polygonArea(polygon.points), 0)
  assert.ok(
    Math.abs(polygonTotal - (foundationArea + fillArea)) <= 0.02,
    `material polygons tile the domain: expected ${foundationArea + fillArea}, got ${polygonTotal}`
  )
  assertNoOverlappingPolygons(polygons)
}

/** Sample the sheet: every interior point must sit in exactly one polygon. */
function assertNoOverlappingPolygons(polygons) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const polygon of polygons) {
    for (const [x, y] of polygon.points) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  const n = 60
  const eps = 1e-6
  let coveredSamples = 0
  for (let i = 0; i <= n; i += 1) {
    const x = minX + ((maxX - minX) * i) / n
    for (let j = 0; j <= n; j += 1) {
      const y = minY + ((maxY - minY) * j) / n
      if (nearAnyEdge(x, y, polygons, eps)) continue
      let coverage = 0
      for (const polygon of polygons) {
        if (pointInPolygon(x, y, polygon.points)) coverage += 1
      }
      assert.ok(
        coverage <= 1,
        `material polygons overlap near (${x.toFixed(3)}, ${y.toFixed(3)})`
      )
      coveredSamples += coverage
    }
  }
  assert.ok(coveredSamples > 0, 'the sampled grid never reached the material sheet')
}

function pointInPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function nearAnyEdge(x, y, polygons, eps) {
  for (const polygon of polygons) {
    const points = polygon.points
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (distanceToSegment(x, y, points[j], points[i]) <= eps) return true
    }
  }
  return false
}

function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(x - a[0], y - a[1])
  let t = ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}

/**
 * The hearting zone of a zoned bund must be the complete finished core in both
 * modes: it reaches its designed top and runs down to the modelled foundation
 * surface at the toes, ignoring any surveyed line crossing the proposal.
 */
function assertFullDepthHearting(request, data) {
  const groundMin = Math.min(...request.geometry.ground.map((p) => p[1]))
  const heartingPolygons = request.geometry.materialPolygons.filter(
    (polygon) => polygon.role === 'hearting'
  )
  assert.ok(heartingPolygons.length > 0, 'the hearting is present as a material zone')
  let minRl = Infinity
  let maxRl = -Infinity
  for (const polygon of heartingPolygons) {
    for (const [, rl] of polygon.points) {
      minRl = Math.min(minRl, rl)
      maxRl = Math.max(maxRl, rl)
    }
  }
  assert.ok(
    Math.abs(maxRl - data.heartingDesign.topLevel) < 1e-6,
    `hearting reaches its designed top ${data.heartingDesign.topLevel}, got ${maxRl}`
  )
  assert.ok(
    Math.abs(minRl - groundMin) < 1e-6,
    `hearting runs down to the modelled foundation surface ${groundMin}, got ${minRl}`
  )
}

function assertHeartingArea(request, expected) {
  const solverArea = request.geometry.materialPolygons
    .filter((polygon) => polygon.role === 'hearting')
    .reduce((sum, polygon) => sum + polygonArea(polygon.points), 0)
  assert.ok(
    Math.abs(solverArea - expected) <= 0.01,
    `Simulation hearting area equals the designed trapezoid: expected ${expected}, got ${solverArea}`
  )
}

/**
 * New-work Simulation must use the complete hearting polygon shown by Design,
 * including the two triangular side wings where its batter reaches formation.
 */
function assertHeartingMatchesDesign(request, data, section) {
  const upper = bund.heartingRepairProfile(data, section)
  const base = bund.heartingBaseProfile(data, section)
  assert.ok(upper.length >= 4 && base.length >= 2, 'Design has a complete hearting zone')
  const designPolygon = [
    ...upper.map((point) => [point.offset, point.rl]),
    ...base.slice().reverse().map((point) => [point.offset, point.rl])
  ]
  const solverPolygons = request.geometry.materialPolygons.filter(
    (polygon) => polygon.role === 'hearting'
  )
  const solverArea = solverPolygons.reduce(
    (sum, polygon) => sum + polygonArea(polygon.points),
    0
  )
  const designArea = polygonArea(designPolygon)
  assert.ok(
    Math.abs(solverArea - designArea) <= 0.01,
    `Simulation hearting area matches Design: expected ${designArea}, got ${solverArea}`
  )

  const designMinX = Math.min(...designPolygon.map(([x]) => x))
  const designMaxX = Math.max(...designPolygon.map(([x]) => x))
  const solverPoints = solverPolygons.flatMap((polygon) => polygon.points)
  assert.ok(
    Math.abs(Math.min(...solverPoints.map(([x]) => x)) - designMinX) <= 1e-6 &&
      Math.abs(Math.max(...solverPoints.map(([x]) => x)) - designMaxX) <= 1e-6,
    'Simulation hearting reaches both Design contacts at the formation base'
  )
}
