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

const canal = require(path.join(root, 'src/renderer/src/lib/canal.ts'))
const registry = require(path.join(root, 'src/renderer/src/templates/registry.ts'))

const near = (a, e, tol, what) =>
  assert.ok(Math.abs(a - e) <= tol, `${what}: expected ~${e}, got ${a}`)

// --- registry offers Canal -------------------------------------------------
assert.ok(
  registry.COMPONENT_TEMPLATES.some((entry) => entry.id === 'canal'),
  'component registry offers canal'
)

// --- defaults ---------------------------------------------------------------
const fresh = canal.defaultCanalData()
assert.equal(fresh.configured, false)
assert.equal(fresh.mode, 'new')
assert.equal(fresh.source, 'map')
assert.deepEqual(fresh.sections, [])
assert.deepEqual(fresh.materialItems, [])
assert.deepEqual(fresh.design.bedWidth, 3)
assert.equal(fresh.design.discharge, 2, 'Q heads the Chapter 1 design table')
assert.equal(fresh.strippingDepth, 0.6, 'canal stripping defaults to 0.6 m')
assert.equal(fresh.laLeftMargin, 3, 'left LA margin defaults to 3 m')
assert.equal(fresh.laRightMargin, 3, 'right LA margin defaults to 3 m')
assert.equal(fresh.excavationBands.length, 4)
assert.equal(fresh.excavationBands.reduce((sum, band) => sum + band.pct, 0), 100)
assert.deepEqual(
  fresh.excavationBands.map((band) => band.material.code),
  ['IRR-CAW-1-1', 'IRR-CAW-1-4', 'IRR-CAW-1-6', 'IRR-CAW-1-7'],
  'default canal excavation classification uses CAW codes'
)
assert.equal(fresh.jungleClearanceMode, 'automatic')
assert.equal(fresh.jungleClearanceMaterial.code, 'IRR-PMW-1-2')
assert.deepEqual(fresh.design.serviceRoadReaches, [], 'service roads begin as opt-in reaches')

// --- detail id round-trip ----------------------------------------------------
assert.equal(canal.canalDetailId('abc'), 'abc::canaldetail')
assert.equal(canal.parseCanalDetailId('abc::canaldetail'), 'abc')
assert.equal(canal.parseCanalDetailId('abc::gwdetail'), null)
assert.equal(canal.parseCanalDetailId(null), null)

// --- Chapter 1 derived geometry ----------------------------------------------
// B=3, D=1.5, FB=0.6, s=1.5: depth 2.1, top 9.3, wetted 8.4083
const design = { ...canal.defaultCanalDesign() }
assert.equal(canal.canalSectionDepth(design), 2.1)
assert.equal(canal.canalTopWidth(design), 9.3)
near(canal.canalWettedPerimeter(design), 8.408326913, 1e-9, 'wetted perimeter')

// --- IS 3873 lining thickness --------------------------------------------------
assert.equal(canal.liningThicknessForDischarge(2), 0.225)
assert.equal(canal.liningThicknessForDischarge(3), 0.225)
assert.equal(canal.liningThicknessForDischarge(5), 0.35)
assert.equal(canal.liningThicknessForDischarge(10), 0.35)
assert.equal(canal.liningThicknessForDischarge(12), 0.55)

// --- chainages -----------------------------------------------------------------
const continuous = { ...fresh, lengthM: 1000, sectionMode: 'continuous', intervalM: 100 }
assert.deepEqual(
  canal.canalChainages(continuous),
  [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
)
const broken = { ...fresh, lengthM: 1000, sectionMode: 'discontinuous', breaks: [750, 250] }
assert.deepEqual(canal.canalChainages(broken), [0, 250, 750, 1000])

// --- sections keep identity by chainage ------------------------------------------
const first = canal.materializeCanalSections(continuous, [])
assert.equal(first.length, 11)
const second = canal.materializeCanalSections({ ...continuous, intervalM: 100 }, first)
assert.deepEqual(
  second.map((s) => s.id),
  first.map((s) => s.id),
  'unchanged chainages keep section ids'
)
const manualSection = canal.newManualCanalSection(155.5)
const withManual = canal.materializeCanalSections(continuous, [...first, manualSection])
assert.equal(withManual.find((section) => section.chainage === 155.5)?.id, manualSection.id, 'manual section survives continuous regeneration')
assert.deepEqual(withManual.map((section) => section.chainage), [...canal.canalChainages(continuous), 155.5].sort((a, b) => a - b), 'manual section is sorted among generated chainages')

// --- sync is a safe no-op until later chapters land ---------------------------------
const fakeRoot = {
  id: 'r',
  kind: 'title',
  name: 'R',
  children: [{ id: 'c', kind: 'component', name: 'C', children: [], canal: fresh }]
}
assert.equal(canal.syncCanalItems(fakeRoot, 'c'), fakeRoot)
assert.equal(canal.syncCanalItems(fakeRoot, 'missing'), fakeRoot)

// --- length is optional: no sections until a length exists ---------------------------
assert.deepEqual(canal.materializeCanalSections({ ...fresh, lengthM: 0 }, []), [])

// --- flow direction defaults and migration -------------------------------------------
assert.equal(fresh.flowDirection, null)
assert.equal(fresh.flowInherited, false)
assert.equal(canal.canalFlowLabel(null), 'Not set')
assert.equal(canal.canalFlowLabel('start-to-end'), 'Start → End')
assert.equal(canal.canalFlowLabel('end-to-start'), 'End → Start')
assert.equal(
  canal.migrateCanalData({ ...fresh, flowDirection: 'end-to-start' }).flowDirection,
  'end-to-start'
)
assert.equal(
  canal.migrateCanalData({ ...fresh, flowDirection: 'sideways' }).flowDirection,
  null,
  'unknown flow values fall back to null'
)
assert.equal(
  canal.migrateCanalData({ ...fresh, source: 'skip' }).source,
  'manual',
  'legacy skip length source migrates to a compulsory manual length'
)

// --- sub-component line following the parent canal -----------------------------------
const parentLine = [
  { lat: 17.0, lng: 79.0 },
  { lat: 17.01, lng: 79.0 }
]
const alongLine = [
  { lat: 17.003, lng: 79.0 },
  { lat: 17.004, lng: 79.0 }
]
const reversedLine = [
  { lat: 17.004, lng: 79.0 },
  { lat: 17.003, lng: 79.0 }
]
const parallelFarLine = [
  { lat: 17.003, lng: 79.001 },
  { lat: 17.004, lng: 79.001 }
]
const branchLine = [
  { lat: 17.005, lng: 79.0 },
  { lat: 17.0055, lng: 79.001 }
]

const along = canal.lineFollowsReference(alongLine, parentLine)
assert.equal(along.follows, true, 'line on the parent alignment follows it')
assert.equal(along.reversed, false)
assert.ok(along.maxDistanceM <= canal.CANAL_FOLLOW_TOLERANCE_M)
const reversed = canal.lineFollowsReference(reversedLine, parentLine)
assert.equal(reversed.follows, true)
assert.equal(reversed.reversed, true, 'opposite drawing direction is detected')
const far = canal.lineFollowsReference(parallelFarLine, parentLine)
assert.equal(far.follows, false, 'a parallel line away from the parent does not follow it')
assert.ok(far.maxDistanceM > canal.CANAL_FOLLOW_TOLERANCE_M)
const branch = canal.lineFollowsReference(branchLine, parentLine)
assert.equal(branch.follows, false, 'an offtake branch leaving the parent does not follow it')

assert.equal(canal.inheritedFlowDirection(alongLine, parentLine, 'start-to-end'), 'start-to-end')
assert.equal(canal.inheritedFlowDirection(reversedLine, parentLine, 'start-to-end'), 'end-to-start')
assert.equal(canal.inheritedFlowDirection(alongLine, parentLine, 'end-to-start'), 'end-to-start')
assert.equal(canal.inheritedFlowDirection(alongLine, parentLine, null), null, 'no parent flow -> ask')
assert.equal(canal.inheritedFlowDirection(branchLine, parentLine, 'start-to-end'), null, 'branch -> ask')

// --- parent canal lookup walks up the tree --------------------------------------------
const canalTree = {
  id: 'root',
  kind: 'title',
  name: 'Root',
  children: [
    {
      id: 'canal',
      kind: 'component',
      name: 'Main Canal',
      children: [
        {
          id: 'reach',
          kind: 'subcomponent',
          name: 'Reach 1',
          children: [
            { id: 'lining', kind: 'subcomponent', name: 'Lining 1', children: [] }
          ]
        }
      ],
      canal: { ...fresh, alignment: parentLine }
    }
  ]
}
assert.equal(canal.findParentCanal(canalTree, 'reach')?.id, 'canal')
assert.equal(canal.findParentCanal(canalTree, 'lining')?.id, 'canal')
assert.equal(canal.findParentCanal(canalTree, 'canal'), null)
assert.equal(canal.findParentCanal(canalTree, 'missing'), null)

// --- Chapter 2: cross-section geometry ------------------------------------------------
assert.deepEqual(fresh.sections, [])
assert.equal(fresh.design.bankSectionType, 'homogeneous')
assert.deepEqual(fresh.design.zonedReaches, [])
assert.equal(fresh.design.bankMaterialAllocations.length, 4)
assert.equal(fresh.design.bankMaterialAllocations.find((row) => row.zone === 'homogeneous' && row.source === 'borrow-area').percentage, 100)
assert.equal(fresh.excavationBands[0].bankReusePct, 100)
assert.equal(fresh.design.heartingLevelOffsetFromFsl, 0)
assert.equal(fresh.design.minimumHeartingHeight, 2)
assert.equal(fresh.design.heartingTopWidth, 1)
assert.equal(fresh.design.heartingTrenchLeftSlope, 0.5)
assert.equal(fresh.design.heartingTrenchRightSlope, 0.5)
assert.equal(canal.recommendedCanalCrestWidth(0.15), 1.5)
assert.equal(canal.recommendedCanalCrestWidth(1.5), 1.5)
assert.equal(canal.recommendedCanalCrestWidth(2), 2)
assert.equal(canal.recommendedCanalCrestWidth(5), 2.5)
assert.equal(canal.recommendedCanalCrestWidth(20), 4)
assert.equal(canal.recommendedCanalCrestWidth(30), 5)
assert.equal(canal.CANAL_NEW_HOMOGENEOUS_CODE, 'IRR-CAW-2-7')
assert.equal(canal.CANAL_NEW_HEARTING_CODE, 'IRR-CAW-2-2')
assert.equal(canal.CANAL_NEW_CASING_CODE, 'IRR-CAW-2-4')
assert.equal(canal.CANAL_TRENCH_EXCAVATION_CODE, 'IRR-CAW-1-1')
assert.equal(canal.CANAL_REPAIR_FORMATION_CODE, 'IRR-PMW-3-17')
assert.equal(canal.CANAL_REPAIR_COMPACTION_CODE, 'IRR-PMW-3-18')
assert.equal(canal.CANAL_BANK_ITEM_OPTIONS.length, 24, 'all applicable CAW 2-4 bank choices and homogeneous casing-source aliases are available without the field-channel item')
assert.equal(canal.canalBankItemForAllocation({ id: 'a', zone: 'hearting', source: 'canal-excavation', percentage: 40, compaction: 98, watering: true }).code, 'IRR-CAW-4-1')
assert.equal(canal.canalBankItemForAllocation({ id: 'a', zone: 'casing', source: 'dump-area', percentage: 40, compaction: 95, watering: false }).code, 'IRR-CAW-3-5')
assert.equal(canal.migrateCanalData({ ...fresh, design: { ...fresh.design, bankSectionType: 'homogeneous', heartingTrenchEnabled: true } }).design.heartingTrenchEnabled, false, 'homogeneous bank removes the hearting cutoff trench')

const makeCanal = (overrides = {}) => ({
  ...fresh,
  lengthM: 1000,
  design: { ...canal.defaultCanalDesign(), bedLevelAtStart: 100, ...overrides },
  sections: [{ id: 'reference', chainage: 0, ground: [{ offset: -10, rl: 102.1 }, { offset: 10, rl: 102.1 }] }]
})
const flatGround = (rl, spread = 20) => [
  { offset: -spread, rl },
  { offset: spread, rl }
]

assert.equal(canal.canalBedLevelAt(makeCanal(), 0), 100)
near(canal.canalBedLevelAt(makeCanal(), 500), 99.75, 1e-9, 'bed falls at 1 in 2000')

const zonedCanal = makeCanal({
  bankSectionType: 'zoned',
  zonedReaches: [{ id: 'z1', fromChainage: 0, toChainage: 500 }],
  heartingLevelOffsetFromFsl: 0.5
})
assert.equal(canal.canalHeartingLevelAt(zonedCanal, 600, 99), null, 'outside zoned reach')
assert.equal(canal.canalHeartingLevelAt(zonedCanal, 0, 102), null, 'FSL below ground')
assert.equal(canal.canalHeartingLevelAt(zonedCanal, 0, 100.5), null, 'hearting below 2 m')
assert.equal(
  canal.canalHeartingLevelAt({ ...zonedCanal, design: { ...zonedCanal.design, minimumHeartingHeight: 3.5 } }, 0, 99),
  null,
  'editable minimum hearting height'
)
const migratedFoundation = canal.migrateCanalData({
  ...fresh,
  sections: [
    { id: 'mg0', chainage: 0, ground: [{ offset: -10, rl: 101 }, { offset: 10, rl: 100.5 }] },
    { id: 'mg1', chainage: 100, ground: [{ offset: -10, rl: 99.8 }, { offset: 10, rl: 100.2 }] }
  ],
  foundationExcavationReaches: [{ id: 'legacy-foundation', fromChainage: 0, toChainage: 100, depth: 0.6, bands: [] }]
})
near(migratedFoundation.foundationExcavationReaches[0].foundationRl, 99.2, 1e-9, 'legacy foundation depth migrates from the lowest ground point in its reach')
near(canal.canalHeartingLevelAt(zonedCanal, 0, 99).topRl, 102, 1e-9, 'hearting top from FSL adjustment')
near(canal.canalHeartingLevelAt(zonedCanal, 0, 99).height, 3, 1e-9, 'hearting height from prepared ground')
const cappedHearting = canal.canalHeartingLevelAt(
  makeCanal({
    bankSectionType: 'zoned',
    zonedReaches: [{ id: 'z1', fromChainage: 0, toChainage: 500 }],
    heartingLevelOffsetFromFsl: 5
  }),
  0,
  99
)
near(cappedHearting.topRl, 102.1, 1e-9, 'hearting top capped at bank top')
const heartingProfiles = canal.canalHeartingProfiles(zonedCanal, {
  id: 'hearting-section',
  chainage: 0,
  ground: [{ offset: -20, rl: 99 }, { offset: 20, rl: 99 }],
  designPopulated: true
})
assert.equal(heartingProfiles.length, 2, 'hearting drawn in both banks')
assert.ok(heartingProfiles.every((profile) => profile.points.length === 4), 'hearting profile polygons')
const trenchedProfiles = canal.canalHeartingProfiles({
  ...zonedCanal,
  design: { ...zonedCanal.design, heartingTrenchEnabled: true }
}, {
  id: 'trenched-section', chainage: 0,
  ground: [{ offset: -20, rl: 99 }, { offset: 20, rl: 99 }], designPopulated: true
})
assert.ok(trenchedProfiles.every((profile) => profile.trench.length === 4), 'trapezoidal cutoff trenches drawn')
near(trenchedProfiles[0].level.height / 2, 1.5, 1e-9, 'cutoff trench depth is half hearting height')
near(trenchedProfiles[0].trench[0].rl - trenchedProfiles[0].trench[3].rl, 1.5, 1e-9, 'trench polygon uses automatic half height')
assert.equal(
  canal.canalHeartingProfiles(zonedCanal, { id: 'high-ground', chainage: 0, ground: [{ offset: -20, rl: 102 }, { offset: 20, rl: 102 }], designPopulated: true }).length,
  0,
  'hearting omitted where FSL is below ground'
)
const asymmetricHearting = canal.canalHeartingProfiles(zonedCanal, {
  id: 'asymmetric-ground',
  chainage: 0,
  ground: [{ offset: -20, rl: 97 }, { offset: 20, rl: 104 }],
  designPopulated: true
})
assert.deepEqual(
  asymmetricHearting.map((profile) => profile.bank),
  ['left'],
  'each bank is checked independently; high right ground suppresses only right-bank hearting'
)
const lowBankZoned = {
  ...zonedCanal,
  design: { ...zonedCanal.design, minimumHeartingHeight: 5 },
  sections: [
    { id: 'low-0', chainage: 0, ground: [{ offset: -20, rl: 99 }, { offset: 20, rl: 99 }], designPopulated: true },
    { id: 'low-100', chainage: 100, ground: [{ offset: -20, rl: 99 }, { offset: 20, rl: 99 }], designPopulated: true }
  ]
}
const lowBankVolumes = canal.canalBankVolumeTotals(lowBankZoned)
near(lowBankVolumes.hearting, 0, 1e-9, 'low banks automatically omit hearting')
near(lowBankVolumes.casing, lowBankVolumes.totalFill, 1e-9, 'low banks automatically place the whole bank in casing/homogeneous soil')

// Ground below the bed produces two banks around the raised canal prism.
const fillSection = { id: 's1', chainage: 0, ground: flatGround(99) }
const fillProfile = canal.canalDesignProfile(makeCanal(), fillSection)
near(fillProfile[0].offset, -12.85, 0.001, 'left outer bank meets ground')
near(fillProfile[fillProfile.length - 1].offset, 12.85, 0.001, 'right outer bank meets ground')
const laCanal = {
  ...makeCanal(),
  laLeftMargin: 3,
  laRightMargin: 4,
  sections: [fillSection, { ...fillSection, id: 's100-la', chainage: 100 }]
}
const laRows = canal.canalLaWidthRows(laCanal)
near(laRows[0].designWidth, 25.7, 0.001, 'LA design footprint follows the outer canal toes')
near(laRows[0].acquisitionWidth, 32.7, 0.001, 'LA width adds both side margins')
near(canal.canalLaArea(laCanal), 3260, 0.01, 'LA area uses mean acquisition width between sections')
const leftOuterBermProfile = canal.canalDesignProfile(makeCanal({ berms: [{ id: 'bo', face: 'left-outer', heightAboveBed: 1, width: 3 }] }), fillSection)
near(leftOuterBermProfile[0].offset, -15.85, 0.001, 'left outer-bank berm widens only the left footprint')
near(leftOuterBermProfile.at(-1).offset, 12.85, 0.001, 'left outer-bank berm leaves right bank unchanged')
const leftOuterBermCanal = makeCanal({ berms: [{ id: 'bo', face: 'left-outer', heightAboveBed: 1, width: 3 }] })
const bermToeGround = canal.canalGroundProfileBetweenToes(leftOuterBermCanal, fillSection, 99, 99)
const bermToeProfile = canal.canalDesignProfile(leftOuterBermCanal, { ...fillSection, ground: bermToeGround })
near(bermToeProfile[0].offset, bermToeGround[0].offset, 0.001, 'bermed profile begins at recalculated left toe')
near(bermToeProfile.at(-1).offset, bermToeGround.at(-1).offset, 0.001, 'bermed profile ends at recalculated right toe')
near(bermToeProfile[0].rl, bermToeGround[0].rl, 0.001, 'bermed left design endpoint touches ground RL')
near(bermToeProfile.at(-1).rl, bermToeGround.at(-1).rl, 0.001, 'bermed right design endpoint touches ground RL')
const rightCanalBermProfile = canal.canalDesignProfile(makeCanal({ berms: [{ id: 'bc', face: 'right-canal', heightAboveBed: 1, width: 2 }] }), fillSection)
near(rightCanalBermProfile.at(-1).offset, 14.85, 0.001, 'right canal-side berm shifts the right bank outward')
const toeGround = canal.canalGroundProfileBetweenToes(makeCanal(), fillSection, 99, 99)
near(toeGround[0].offset, fillProfile[0].offset, 0.001, 'section ground starts at left bank toe')
near(toeGround[toeGround.length - 1].offset, fillProfile[fillProfile.length - 1].offset, 0.001, 'section ground ends at right bank toe')
assert.deepEqual(toeGround.map((point) => point.rl), [99, 99], 'entered toe RLs are preserved')
const fillAreas = canal.canalSectionAreas(makeCanal(), fillSection)
near(fillAreas.filling, 47.535, 0.01, 'new canal without a foundation reach fills from existing ground')
near(fillAreas.cutting, 0, 1e-9, 'no cutting on a fill section')
near(
  canal.canalStrippedOrCutLevelAt({ ...makeCanal(), strippingDepth: 0.6 }, fillSection, 0),
  99,
  1e-9,
  'new canal without a foundation reach uses existing ground'
)
const strippingBands = canal.canalStrippingBands({ ...makeCanal(), strippingDepth: 0.6 }, fillSection)
assert.equal(strippingBands.length, 0, 'new canal has no stripping work')
const foundationReachCanal = { ...makeCanal(), foundationExcavationReaches: [{ id: 'f1', fromChainage: 0, toChainage: 100, foundationRl: 98.4, bands: canal.defaultCanalExcavationBands() }] }
near(canal.canalSectionAreas(foundationReachCanal, fillSection).filling, 62.955, 0.01, 'new bank fill is measured from the excavated foundation plane')
const foundationBands = canal.canalFoundationExcavationBands(foundationReachCanal, fillSection)
assert.ok(foundationBands.length > 0, 'foundation excavation is drawn below the bank footprint')
near(Math.min(...foundationBands.flat().map((point) => point.rl)), 98.4, 1e-9, 'drawn foundation excavation uses the active reach depth')

// A shallow central cut must continue into embankment banks rather than
// terminating where the inner canal slope first crosses existing ground.
const mixedSection = { id: 'mixed-50', chainage: 50, ground: flatGround(100), designPopulated: true }
const mixedCanal = {
  ...makeCanal(),
  foundationExcavationReaches: [{ id: 'mixed-foundation', fromChainage: 0, toChainage: 100, foundationRl: 99, bands: canal.defaultCanalExcavationBands() }]
}
const mixedProfile = canal.canalDesignProfile(mixedCanal, mixedSection)
near(mixedProfile[0].offset, -10.8, 0.001, 'mixed section continues through left bank to its outer toe')
near(mixedProfile.at(-1).offset, 10.8, 0.001, 'mixed section continues through right bank to its outer toe')
const mixedAreas = canal.canalSectionAreas(mixedCanal, mixedSection)
near(mixedAreas.cutting, 0.076, 0.00001, 'mixed section retains the small central canal cut')
assert.ok(mixedAreas.filling > 0, 'mixed section measures both embankment banks')
assert.equal(canal.canalFoundationExcavationBands(mixedCanal, mixedSection).length, 2, 'one-metre foundation excavation is drawn beneath both bank-fill footprints')

// Chapter 5 service roads share an existing platform and widen it only when required.
const leftTblRoad = makeCanal({ serviceRoadReaches: [{ id: 'r1', fromChainage: 0, toChainage: 100, side: 'left', heightMode: 'tbl', heightAboveBed: 2.1, width: 4, shoulderWidth: 0.5 }] })
const leftTblProfile = canal.canalDesignProfile(leftTblRoad, fillSection)
near(leftTblProfile[0].offset, -15.85, 0.001, '4 m road plus two 0.5 m shoulders replaces the 2 m crest and widens left toe by 3 m')
near(leftTblProfile.at(-1).offset, 12.85, 0.001, 'left-only service road leaves right bank unchanged')
const narrowTblRoad = makeCanal({ serviceRoadReaches: [{ id: 'r2', fromChainage: 0, toChainage: 100, side: 'left', heightMode: 'tbl', heightAboveBed: 2.1, width: 1, shoulderWidth: 0.5 }] })
near(canal.canalDesignProfile(narrowTblRoad, fillSection)[0].offset, -12.85, 0.001, 'road narrower than crest shares crest without widening it')
const manualRoad = makeCanal({ berms: [{ id: 'b1', face: 'right-outer', heightAboveBed: 1, width: 2 }], serviceRoadReaches: [{ id: 'r3', fromChainage: 0, toChainage: 0, side: 'right', heightMode: 'manual', heightAboveBed: 1, width: 3.5, shoulderWidth: 0.5 }] })
near(canal.canalDesignProfile(manualRoad, fillSection).at(-1).offset, 17.35, 0.001, 'manual-height road plus shoulders shares and widens matching outer berm')
const roadSegments = canal.canalServiceRoadSegments(leftTblRoad, fillSection)
assert.equal(roadSegments.length, 1, 'active one-side reach draws one road platform')
near(roadSegments[0].width, 5, 1e-9, 'drawn platform includes the road and both shoulders')
near(roadSegments[0].carriagewayWidth, 4, 1e-9, 'drawn carriageway uses entered road width')
near(roadSegments[0].shoulderWidth, 0.5, 1e-9, 'drawn road retains each-side shoulder width')
const measuredRoad = { ...leftTblRoad, sections: [fillSection, { ...fillSection, id: 's100', chainage: 100 }] }
const roadQuantities = canal.canalServiceRoadQuantities(measuredRoad, measuredRoad.design.serviceRoadReaches[0])
near(roadQuantities.carriagewayArea, 400, 1e-9, 'road surfacing area is reach length times usable road width')
near(roadQuantities.shoulderArea, 100, 1e-9, 'shoulder area includes both 0.5 m shoulders')
near(roadQuantities.platformArea, 500, 1e-9, 'platform area combines carriageway and shoulders')
assert.ok(roadQuantities.additionalFormation > 0, 'widened road platform automatically measures incremental bank fill')

// Cut section: the Chapter 1 side slopes rise from both bed edges to ground.
const cutSection = { id: 's2', chainage: 0, ground: flatGround(103) }
const cutProfile = canal.canalDesignProfile(makeCanal(), cutSection)
near(cutProfile[0].offset, -6, 0.001, 'left bank where the canal side slope meets ground')
near(cutProfile[cutProfile.length - 1].offset, 6, 0.001, 'right bank where the canal side slope meets ground')
const deepCutToeGround = canal.canalGroundProfileBetweenToes(makeCanal(), cutSection, 110, 110)
const deepCutProfile = canal.canalDesignProfile(makeCanal(), { ...cutSection, ground: deepCutToeGround })
near(deepCutToeGround[0].offset, -16.5, 0.001, 'deep-cut section starts where left slope meets high ground')
near(deepCutToeGround.at(-1).offset, 16.5, 0.001, 'deep-cut section ends where right slope meets high ground')
near(deepCutProfile[0].rl, 110, 0.001, 'left cut contact reaches entered ground RL')
near(deepCutProfile.at(-1).rl, 110, 0.001, 'right cut contact reaches entered ground RL')
const cutAreas = canal.canalSectionAreas(makeCanal(), cutSection)
near(cutAreas.cutting, 22.5, 0.01, 'simple canal excavation area')
near(cutAreas.filling, 0, 1e-9, 'no fill on a cut section')
const balancedCanal = {
  ...makeCanal(),
  sections: [
    { ...cutSection, id: 'balance-cut', chainage: 0 },
    { ...fillSection, id: 'balance-fill', chainage: 100 }
  ]
}
const suitableExcavation = canal.canalSuitableBankExcavation(balancedCanal)
near(suitableExcavation, canal.canalEarthworkTotals(balancedCanal).excavation, 1e-9, 'only the excavation quantity marked suitable feeds bank reuse')
const effectiveHomogeneous = canal.canalEffectiveBankAllocations(balancedCanal, 'homogeneous')
const reused = effectiveHomogeneous.find((row) => row.source === 'canal-excavation')
const borrowed = effectiveHomogeneous.find((row) => row.source === 'borrow-area')
near(reused.percentage + borrowed.percentage, 100, 1e-9, 'automatic canal reuse and borrow balance total 100 percent')
const noReusableRock = {
  ...balancedCanal,
  excavationBands: balancedCanal.excavationBands.map((band) => ({ ...band, bankReusePct: 0 }))
}
near(canal.canalSuitableBankExcavation(noReusableRock), 0, 1e-9, 'unsuitable excavation is excluded from bank reuse')
near(canal.canalEffectiveBankAllocations(noReusableRock, 'homogeneous').find((row) => row.source === 'borrow-area').percentage, 100, 1e-9, 'borrow area automatically fills the full shortage')
near(
  canal.canalStrippedOrCutLevelAt({ ...makeCanal(), strippingDepth: 0.6 }, cutSection, 0),
  100,
  1e-9,
  'deep canal cut uses proposed level below the stripped ground level'
)
assert.equal(canal.canalStrippingBands({ ...makeCanal(), strippingDepth: 0.6 }, cutSection).length, 0, 'no separate stripping band inside full canal cutting')

// Bands split the section into signed cut/fill regions for the drawing.
const cutBands = canal.profileDifferenceBands(
  cutSection.ground,
  canal.canalDesignProfile(makeCanal(), cutSection)
)
assert.ok(cutBands.length >= 1 && cutBands.every((band) => band.cutting), 'cut bands')
const fillBands = canal.profileDifferenceBands(fillProfile, canal.canalDesignProfile(makeCanal(), fillSection))
assert.ok(fillBands.length >= 1 && fillBands.every((band) => !band.cutting), 'fill bands')
assert.equal(canal.canalSectionHasGround({ id: 'x', chainage: 0, ground: [] }), false)
assert.equal(canal.canalSectionHasGround(fillSection), true)

const clearanceSections = [
  { id: 'c0', chainage: 0, ground: [{ offset: -10, rl: 100 }, { offset: 10, rl: 100 }] },
  { id: 'c1', chainage: 100, ground: [{ offset: -15, rl: 100 }, { offset: 15, rl: 100 }] }
]
near(canal.canalJungleClearanceTotal({ ...fresh, mode: 'new', sections: clearanceSections }), 2500, 1e-9, 'new-canal jungle clearance uses toe-to-toe plan width')
near(canal.canalJungleClearanceTotal({ ...fresh, jungleClearanceMode: 'manual', jungleClearanceRows: [{ id: 'p', length: 20, breadth: 5 }] }), 100, 1e-9, 'manual jungle-clearance patches')

// --- Chapter 6: lining reaches ------------------------------------------------------
assert.deepEqual(fresh.liningReaches, [], 'lining starts with no reaches')
assert.equal(canal.canalCopingWidthForDischarge(2), 0.225)
assert.equal(canal.canalCopingWidthForDischarge(5), 0.35)
assert.equal(canal.canalCopingWidthForDischarge(12), 0.55)

// A reach with every field blank measures from Chapter 1 geometry alone.
const liningCanal = {
  ...makeCanal(),
  liningReaches: [canal.defaultCanalLiningReach(0, 100)],
  sections: [
    { id: 'l0', chainage: 0, ground: flatGround(99), designPopulated: true },
    { id: 'l100', chainage: 100, ground: flatGround(99), designPopulated: true }
  ]
}
const liningReach = liningCanal.liningReaches[0]
const liningQ = canal.canalLiningReachQuantities(liningCanal, liningReach)
near(liningQ.slopeLength, 3.785828839, 1e-6, 'one-bank slope length uses FSD + design freeboard')
near(liningQ.perimeter, 10.571657678, 1e-6, 'perimeter runs up to the lining top')
near(liningQ.slopeWidth, 8.021657678, 1e-6, 'slope width adds the automatic coping')
near(liningQ.liningBedArea, 300, 1e-9, 'bed lining area')
near(liningQ.liningSlopeArea, 802.166, 1e-6, 'slope lining area')
near(liningQ.thicknessM, 0.075, 1e-9, 'blank thickness keeps the 75 mm default')
assert.equal(liningQ.modelWallCount, 7, 'model walls follow floor(L / 17.5) + 2')
near(liningQ.modelWallVolume, 2.106, 1e-6, 'model wall volume')
assert.equal(liningQ.stepsCount, 1, 'steps follow ceil(L / 300)')
near(liningQ.stepsVolume, 1.59, 1e-6, 'steps volume')
near(liningQ.soffitVolume, 0.398, 1e-6, 'soffit volume')
near(liningQ.sleepersVolume, 6, 1e-9, 'two sleeper courses along the reach')
assert.equal(liningQ.plugsSlope, 19, 'porous plugs on the slopes')
assert.equal(liningQ.plugsBed, 3, 'porous plugs in the bed')
assert.equal(liningQ.longitudinalJoints, 2, 'longitudinal joints follow the lined width')
near(liningQ.masticLongitudinal, 200, 1e-9, 'longitudinal mastic joints')
assert.equal(liningQ.tarfeltCount, 7, 'tarfelt joints sit at the model sections')
near(liningQ.tarfeltLength, 74.002, 1e-6, 'tarfelt joint length')

// Explicit reach values replace the blanks without touching Chapter 1.
const overriddenQ = canal.canalLiningReachQuantities(liningCanal, {
  ...liningReach,
  thicknessMm: 60,
  liningFb: 0.9,
  copingWidthM: 0.55,
  panelLengthM: 5,
  modelWallIntervalM: 10,
  stepsIntervalM: 100,
  plugBedSpacingSqm: 200
})
near(overriddenQ.thicknessM, 0.06, 1e-9, 'thickness override')
near(overriddenQ.liningFb, 0.9, 1e-9, 'lining freeboard override')
near(overriddenQ.copingWidth, 0.55, 1e-9, 'coping override')
assert.equal(overriddenQ.modelWallCount, 12, 'model-wall interval override')
assert.equal(overriddenQ.stepsCount, 1, 'steps interval override')
assert.equal(overriddenQ.plugsBed, 2, 'plug bed spacing override')

// Totals include only provided reaches.
const liningTotals = canal.canalLiningTotals({
  ...liningCanal,
  liningReaches: [liningReach, { ...canal.defaultCanalLiningReach(0, 100), id: 'off', provide: false }]
})
assert.equal(liningTotals.reaches, 1, 'totals skip reaches without lining')
near(liningTotals.liningBedArea, 300, 1e-9, 'provided reach feeds the totals')

// Old/partial reach state gains defaults on load.
const migratedLining = canal.migrateCanalData({
  ...fresh,
  liningReaches: [{ id: 'old', fromChainage: 80, toChainage: 20, thicknessMm: 'x', bill: { lining: false } }]
})
const migratedReach = migratedLining.liningReaches[0]
assert.equal(migratedReach.fromChainage, 20, 'migrated reach orders its chainages')
assert.equal(migratedReach.toChainage, 80)
assert.equal(migratedReach.provide, true, 'migrated reach is provided by default')
assert.equal(migratedReach.thicknessMm, null, 'invalid override drops back to blank')
assert.equal(migratedReach.bill.lining, false, 'existing billing flags survive migration')
assert.equal(migratedReach.bill.modelWall, true, 'missing billing flags gain defaults')
assert.deepEqual(migratedReach.itemOverrides, {})
assert.deepEqual(canal.migrateCanalData({ ...fresh, liningReaches: 'bad' }).liningReaches, [])

// --- CAW Chapter 5 rock toe and drainage code measurements -------------------
const filterDrainBase = {
  id: 'fd', fromChainage: 0, toChainage: 100,
  orientation: 'longitudinal', side: 'both', width: 0.6, depth: 1.2,
  thickness: 0.1, spacing: 30, count: 1,
  rockToeTopWidth: 0, rockToeInnerSlope: 1, crossDrainLength: 3,
  material: { code: 'IRR-CAW-5-6' }
}
const rockToeQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-6' })
near(rockToeQ.quantity, 432, 1e-9, 'rock toe uses Bund trapezium geometry and both bank slopes')
assert.equal(rockToeQ.unit, 'cu.m')
const rockFilterQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-11' })
near(rockFilterQ.quantity, 889.706, 1e-9, 'CAW-5-11 uses fixed one-metre bed and half-metre backing')
const fixedDrainQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-8', side: 'bed', depth: 0.75 })
assert.deepEqual(fixedDrainQ, { quantity: 100, unit: 'MT' }, 'CAW-5-8 retains the published SSR unit')
const crossDrainQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-8', side: 'bed', depth: 0.75, orientation: 'cross' })
assert.deepEqual(crossDrainQ, { quantity: 12, unit: 'MT' }, 'cross CAW-5-8 uses count from spacing while retaining the published SSR unit')
const plugsQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-9', count: 7 })
assert.deepEqual(plugsQ, { quantity: 7, unit: 'PLUG' }, 'CAW-5-9 is measured per plug')
const fabricQ = canal.canalFilterDrainQuantity(fresh, { ...filterDrainBase, kind: '5-12', width: 1.5 })
assert.deepEqual(fabricQ, { quantity: 300, unit: 'sq.m' }, 'filter fabric is measured by treated area on both banks')

// --- Earthwork bridges unpopulated sections --------------------------------------
// Typical section (B=3, FSD=1.5, FB=0.6, 1.5H:1V) on level ground with a flat
// bed (bedSlope 0) so both ends measure identically: cut 22.5 m2, fill 47.535 m2.
const levelMake = (overrides = {}) => makeCanal({ bedSlope: 0, ...overrides })
const cutGround = [{ offset: -20, rl: 103 }, { offset: 20, rl: 103 }]
const cutTwo = {
  ...levelMake(),
  sections: [
    { id: 'cut-0', chainage: 0, ground: cutGround },
    { id: 'cut-100', chainage: 100, ground: cutGround }
  ]
}
near(canal.canalEarthworkTotals(cutTwo).excavation, 2250, 1, 'cut volume between two populated sections')
const cutGap = {
  ...levelMake(),
  sections: [
    { id: 'cut-0', chainage: 0, ground: cutGround },
    { id: 'cut-50-empty', chainage: 50, ground: [], designPopulated: false },
    { id: 'cut-100', chainage: 100, ground: cutGround }
  ]
}
near(canal.canalEarthworkTotals(cutGap).excavation, 2250, 1, 'unpopulated sections are bridged, not averaged as zero')
const fillGround = [{ offset: -20, rl: 99 }, { offset: 20, rl: 99 }]
const fillTwo = {
  ...levelMake(),
  sections: [
    { id: 'fill-0', chainage: 0, ground: fillGround },
    { id: 'fill-100', chainage: 100, ground: fillGround }
  ]
}
near(canal.canalBankVolumeTotals(fillTwo).totalFill, 4753.5, 1, 'bank fill between two populated sections')
const fillGap = {
  ...levelMake(),
  sections: [
    { id: 'fill-0', chainage: 0, ground: fillGround },
    { id: 'fill-50-empty', chainage: 50, ground: [], designPopulated: false },
    { id: 'fill-100', chainage: 100, ground: fillGround }
  ]
}
near(canal.canalBankVolumeTotals(fillGap).totalFill, 4753.5, 1, 'bank fill bridges unpopulated sections')

// --- syncCanalItems writes chapter quantities into estimate items -------------
const canalComponent = (canalData) => ({
  id: 'r', kind: 'title', name: 'R',
  children: [{ id: 'c', kind: 'component', name: 'C', children: [], canal: canalData }]
})
const generatedItems = (root) => root.children[0].children.filter((child) => child.templateGenerated)
const itemByCode = (root, code) => generatedItems(root).find((child) => child.itemCode === code)

// Cut canal: excavation classified to All soils + jungle clearance.
const cutSynced = canal.syncCanalItems(canalComponent(cutTwo), 'c')
near(itemByCode(cutSynced, 'IRR-CAW-1-1').computedQuantity, 2250, 1, 'canal cut reaches the estimate')
near(itemByCode(cutSynced, 'IRR-PMW-1-2').computedQuantity, 4000, 1, 'jungle clearance reaches the estimate')
assert.equal(cutSynced.children[0].canal.materialItems.length, 2, 'sync registry tracks both items')

// A second sync reuses the same item nodes (no duplicates).
const cutTwice = canal.syncCanalItems(cutSynced, 'c')
assert.equal(generatedItems(cutTwice).length, 2, 're-sync adds no duplicate items')
assert.deepEqual(
  generatedItems(cutTwice).map((child) => child.id),
  generatedItems(cutSynced).map((child) => child.id),
  're-sync keeps item identity'
)

// Cleared quantities remove the generated items again.
const cutCleared = canal.syncCanalItems(
  { ...cutSynced, children: [{ ...cutSynced.children[0], canal: { ...cutTwo, sections: [] } }] },
  'c'
)
assert.equal(generatedItems(cutCleared).length, 0, 'cleared quantities remove generated items')
assert.deepEqual(cutCleared.children[0].canal.materialItems, [], 'registry empties with the items')

// Fill canal: homogeneous bank fill goes to the borrow-area item.
const fillSynced = canal.syncCanalItems(canalComponent(fillTwo), 'c')
near(itemByCode(fillSynced, 'IRR-CAW-2-7').computedQuantity, 4753.5, 1, 'bank fill reaches the estimate')

// Repair canal: stripping is classified with the cut bands.
const repairFill = { ...levelMake(), mode: 'repair', sections: fillTwo.sections }
const repairSynced = canal.syncCanalItems(canalComponent(repairFill), 'c')
near(itemByCode(repairSynced, 'IRR-CAW-1-1').computedQuantity, 1542, 1, 'repair stripping is classified with excavation')

// Lining reach: bed + slope areas combine under one code; plugs count.
const liningSynced = canal.syncCanalItems(canalComponent(liningCanal), 'c')
near(itemByCode(liningSynced, 'IRR-CAW-7-6').computedQuantity, 1102.166, 0.01, 'lining bed and slope areas combine')
assert.equal(itemByCode(liningSynced, 'IRR-CAW-5-9').computedQuantity, 22, 'porous plugs count reaches the estimate')
// Model walls, steps and sleepers share their code and merge volumes.
near(itemByCode(liningSynced, 'IRR-CCDW-2-3').computedQuantity, 2.106 + 0.398 + 1.59 + 6, 0.01, 'shared-code lining operations merge')
// Skipped reaches bill nothing.
const liningOff = { ...liningCanal, liningReaches: liningCanal.liningReaches.map((reach) => ({ ...reach, provide: false })) }
assert.equal(itemByCode(canal.syncCanalItems(canalComponent(liningOff), 'c'), 'IRR-CAW-7-6'), undefined, 'unprovided lining reaches bill nothing')

// Foundation treatment: void replacement bills under its own SSR code.
const treatCanal = {
  ...levelMake(),
  foundationExcavationReaches: [{ id: 'f1', fromChainage: 0, toChainage: 100, kind: 'foundation', foundationRl: 98.4, strippingDepth: 0.6, bands: canal.defaultCanalExcavationBands() }],
  foundationFillReaches: [{ id: 't1', workReachId: 'w1', fromChainage: 0, toChainage: 100, kind: '5-1', percentage: 100, foundationDepth: 0, thickness: 0, width: 0, blanketWidthMode: 'automatic', blanketLeftWidth: 0, blanketRightWidth: 0, height: 0, side: 'both', material: { code: 'IRR-CAW-5-1' } }],
  sections: fillTwo.sections
}
const treatSynced = canal.syncCanalItems(canalComponent(treatCanal), 'c')
near(itemByCode(treatSynced, 'IRR-CAW-5-1').computedQuantity, 1542, 1, 'foundation replacement fill reaches the estimate')
assert.equal(
  treatSynced.children[0].canal.materialItems.find((entry) => entry.code === 'IRR-CAW-5-1').role,
  'foundation',
  'treatment items carry their operation role'
)

// Filter drains: fabric area bills under its SSR code.
const drainCanal = {
  ...levelMake(),
  filterDrainReaches: [{ id: 'd1', fromChainage: 0, toChainage: 100, kind: '5-12', orientation: 'longitudinal', side: 'both', width: 1.5, depth: 0.2, thickness: 0.2, spacing: 30, count: 1, material: { code: 'IRR-CAW-5-12' } }],
  sections: fillTwo.sections
}
near(itemByCode(canal.syncCanalItems(canalComponent(drainCanal), 'c'), 'IRR-CAW-5-12').computedQuantity, 300, 1e-9, 'filter fabric area reaches the estimate')

// Bund-style overlap: drain plugs share the lining plugs code, so both
// chapters merge into one estimate line instead of two.
const plugDrain = { id: 'd9', fromChainage: 0, toChainage: 100, kind: '5-9', orientation: 'longitudinal', side: 'bed', width: 0.6, depth: 0.75, thickness: 0.1, spacing: 30, count: 7, material: { code: 'IRR-CAW-5-9' } }
const mergedPlugs = canal.syncCanalItems(canalComponent({ ...liningCanal, filterDrainReaches: [plugDrain] }), 'c')
const plugItems = generatedItems(mergedPlugs).filter((child) => child.itemCode === 'IRR-CAW-5-9')
assert.equal(plugItems.length, 1, 'same code from two chapters merges into one line')
assert.equal(plugItems[0].computedQuantity, 22 + 7, 'merged plug count sums both chapters')

// Metalled road: hard metal bills; blindage waits for a catalogue pick.
const metalReach = { id: 'r1', fromChainage: 0, toChainage: 100, side: 'left', heightMode: 'tbl', heightAboveBed: 2.1, width: 4, shoulderWidth: 0.5, constructionType: 'traditional-metal', hardMetalThickness: 0.05, hardMetalCode: 'RB_WORK_6411571526E0', blindageCode: 'RB Road Work 8(a) — select/enter catalogue item', hardMetalItem: null, blindageItem: null }
const metalRoad = { ...levelMake(), design: { ...canal.defaultCanalDesign(), bedLevelAtStart: 100, bedSlope: 0, serviceRoadReaches: [metalReach] }, sections: fillTwo.sections }
const metalSynced = canal.syncCanalItems(canalComponent(metalRoad), 'c')
near(itemByCode(metalSynced, 'RB_WORK_6411571526E0').computedQuantity, 20, 1e-9, 'road hard-metal volume reaches the estimate')
assert.equal(generatedItems(metalSynced).some((child) => child.templateItemRole === 'road-blindage'), false, 'placeholder blindage bills nothing until picked')
const pickedBlindage = { ...metalRoad, design: { ...metalRoad.design, serviceRoadReaches: [{ ...metalReach, blindageItem: { code: 'RB_BLIND_1' } }] } }
near(itemByCode(canal.syncCanalItems(canalComponent(pickedBlindage), 'c'), 'RB_BLIND_1').computedQuantity, 400, 1e-9, 'picked blindage bills the carriageway area')
// Earthen roads add no pavement items; their formation already bills in Bank Design.
const earthenRoad = { ...metalRoad, design: { ...metalRoad.design, serviceRoadReaches: [{ ...metalReach, constructionType: 'earthen' }] } }
assert.equal(itemByCode(canal.syncCanalItems(canalComponent(earthenRoad), 'c'), 'RB_WORK_6411571526E0'), undefined, 'earthen roads bill no pavement')

// Foundation Filling tab gating: visible once a foundation reach exists,
// even before sections are populated (quantities read zero until then).
const unpopulatedFoundation = {
  ...levelMake(),
  foundationExcavationReaches: [{ id: 'f1', fromChainage: 0, toChainage: 100, kind: 'foundation', foundationRl: 98.4, strippingDepth: 0.6, bands: canal.defaultCanalExcavationBands() }],
  sections: []
}
assert.equal(canal.canalShowsFoundationFilling(unpopulatedFoundation), true, 'foundation reach shows the chapter before populating')
assert.equal(canal.canalShowsFoundationFilling(levelMake()), false, 'no reaches hides the chapter')
assert.equal(canal.canalShowsFoundationFilling({ ...unpopulatedFoundation, mode: 'repair' }), false, 'repair never shows foundation filling')
const strippingOnly = {
  ...levelMake(),
  foundationExcavationReaches: [{ ...unpopulatedFoundation.foundationExcavationReaches[0], id: 's1', kind: 'stripping' }]
}
assert.equal(canal.canalShowsFoundationFilling(strippingOnly), false, 'stripping-only reaches hide the chapter')

// Nothing measurable shows before Populate Design runs: no design profile,
// no areas, so diagrams and downstream chapters stay empty until saved.
const unpopulatedSection = { id: 'u0', chainage: 0, ground: [], designPopulated: false }
assert.deepEqual(canal.canalDesignProfile(levelMake(), unpopulatedSection), [], 'no design profile before populate')
assert.deepEqual(canal.canalSectionAreas(levelMake(), unpopulatedSection), { cutting: 0, filling: 0 }, 'no areas before populate')

// IRR-CAW-5-4 bills per sq.m at its code-fixed 0.25 m thickness (SSR unit),
// while 5-5 bills by volume: manual 1 m + 1 m blankets over 100 m.
const blanketBase = { ...treatCanal, foundationFillReaches: [] }
const reach54 = { id: 'b4', workReachId: 'w4', fromChainage: 0, toChainage: 100, kind: '5-4', percentage: 100, foundationDepth: 0, thickness: 0.25, width: 2, blanketWidthMode: 'manual', blanketLeftWidth: 1, blanketRightWidth: 1, height: 0, side: 'both', material: { code: 'IRR-CAW-5-4' } }
const measured54 = canal.canalFoundationFillQuantity({ ...blanketBase, foundationFillReaches: [reach54] }, reach54)
assert.equal(measured54.unit, 'sq.m', '5-4 bills in sq.m per SSR')
assert.equal(measured54.quantity, 200, '5-4 bills plan area, not volume')
const reach55 = { ...reach54, id: 'b5', workReachId: 'w5', kind: '5-5', thickness: 0.3, material: { code: 'IRR-CAW-5-5' } }
const measured55 = canal.canalFoundationFillQuantity({ ...blanketBase, foundationFillReaches: [reach55] }, reach55)
assert.equal(measured55.unit, 'cu.m', '5-5 bills in cu.m per SSR')
assert.equal(measured55.quantity, 60, '5-5 bills plan area times thickness')

// Repair banks bill the PMW repair items, never CAW new-work codes: the
// SSR splits homogeneous formation (3-17, placed without compaction) from
// its compaction (3-18). Repair fill fixture measures 6295.5 cu.m.
const repairSyncedBanking = canal.syncCanalItems(canalComponent(repairFill), 'c')
near(itemByCode(repairSyncedBanking, 'IRR-PMW-3-17').computedQuantity, 6295.5, 1, 'repair formation bills PMW-3-17')
near(itemByCode(repairSyncedBanking, 'IRR-PMW-3-18').computedQuantity, 6295.5, 1, 'repair compaction bills PMW-3-18')
assert.equal(itemByCode(repairSyncedBanking, 'IRR-CAW-2-7'), undefined, 'repair bills no CAW bank codes')

// Shared repair helper: homogeneous splits formation and compaction, zoned
// lists hearting then casing, each carrying its full zone volume.
const repairItems = canal.canalBankRepairItems(repairFill)
assert.deepEqual(repairItems.map((item) => item.code), ['IRR-PMW-3-17', 'IRR-PMW-3-18'], 'repair helper splits formation and compaction')
repairItems.forEach((item) => near(item.quantity, 6295.5, 1, 'repair helper carries full zone volumes'))
const zonedRepair = { ...repairFill, design: { ...repairFill.design, bankSectionType: 'zoned' } }
const zonedRepairItems = canal.canalBankRepairItems(zonedRepair)
assert.deepEqual(zonedRepairItems.map((item) => item.code), ['IRR-PMW-3-8', 'IRR-PMW-3-9'], 'zoned repair bills hearting and casing codes')
near(zonedRepairItems[1].quantity, 6295.5, 1, 'zoned repair casing carries the fill')

console.log('canal: defaults, geometry, sections, drainage codes, flow inheritance and sync ok')
