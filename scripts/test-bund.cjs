const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

// bund.ts imports runtime helpers from ./tree, so register a .ts loader and let
// Node's resolver walk the relative imports for us.
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

const near = (actual, expected, tol, what) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ~${expected}, got ${actual} (tolerance ${tol})`
  )

const repairDefaults = bund.defaultBundDesign()
assert.equal(repairDefaults.topWidth, 3, 'repair default crest width is 3 m')
assert.equal(repairDefaults.usSlope, 1.5, 'repair default upstream slope is 1.5:1')
assert.equal(repairDefaults.dsSlope, 2, 'repair default downstream slope is 2:1')
assert.equal(repairDefaults.stripDepth, 0.3, 'repair default stripping depth is 0.3 m')
const excavationDefaults = bund.defaultBundData().excavationBands
for (const role of ['stripping', 'ustoe-exc', 'dstoe-exc', 'rocktoe-exc', 'chute-exc']) {
  const channelRole = ['stripping', 'dstoe-exc', 'chute-exc'].includes(role)
  assert.deepEqual(
    excavationDefaults[role].map((row) => [row.label, row.pct, row.material.code]),
    channelRole
      ? [
          ['All Soils', 100, 'IRR-CAW-1-1'],
          ['HDR', 0, 'IRR-CAW-1-4'],
          ['F&F', 0, 'IRR-CAW-1-6'],
          ['HR', 0, 'IRR-CAW-1-7']
        ]
      : [
          ['All Soils', 100, 'IRR-DAW-1-1'],
          ['HDR', 0, 'IRR-DAW-1-2'],
          ['F&F', 0, 'IRR-DAW-1-3'],
          ['HR', 0, 'IRR-DAW-1-5']
        ],
    `${role} starts with the four approved excavation classifications`
  )
}

const sevenPointGround = [
  { offset: -20, rl: 95 },
  { offset: 0, rl: 95 },
  { offset: 20, rl: 95 }
]
const sevenPointDesign = {
  ...repairDefaults,
  topLevel: 100,
  topWidth: 3,
  usSlope: 1.5,
  dsSlope: 2
}
const sevenPoints = bund.sevenPointDesignProfile(sevenPointGround, sevenPointDesign)
assert.equal(sevenPoints.length, 7, 'repair design produces seven standard points')
assert.deepEqual(
  sevenPoints.map((point) => point.offset),
  [-9, -5.25, -1.5, 0, 1.5, 6.5, 11.5],
  'seven points are toe, face midpoint, three crest points, face midpoint and toe'
)
assert.deepEqual(
  sevenPoints.map((point) => point.rl),
  [95, 97.5, 100, 100, 100, 97.5, 95],
  'seven point RLs follow TBL and the selected side slopes'
)

const sectionSevenPoints = bund.sevenPointDesignFromGroundLevels(95, 96, sevenPointDesign)
assert.deepEqual(
  sectionSevenPoints.map((point) => point.offset),
  [-9, -5.25, -1.5, 0, 1.5, 5.5, 9.5],
  'section toe RLs locate both toes using the global crest width and side slopes'
)
assert.deepEqual(
  sectionSevenPoints.map((point) => point.rl),
  [95, 97.5, 100, 100, 100, 98, 96],
  'section design produces toe, midpoint and crest RLs'
)

const incompleteGeneratedSection = {
  id: 'incomplete-seven',
  chainage: 0,
  groundLevel: null,
  pre: [
    { offset: sectionSevenPoints[0].offset, rl: 95 },
    { offset: sectionSevenPoints[6].offset, rl: 96 }
  ],
  stripped: null,
  projected: null,
  designPointOffsets: sectionSevenPoints.map((point) => point.offset)
}
assert.equal(
  bund.hasCompleteRestorationGround(incompleteGeneratedSection),
  false,
  'two toe RLs alone are not treated as a complete existing-ground line'
)
const incompleteGeneratedData = bund.defaultBundData()
incompleteGeneratedData.configured = true
incompleteGeneratedData.mode = 'restoration'
incompleteGeneratedData.design = sevenPointDesign
assert.deepEqual(
  bund.sectionAreas(incompleteGeneratedData, incompleteGeneratedSection),
  { clearanceWidth: 0, stripping: 0, formation: 0, usFace: 0, dsFace: 0 },
  'an incomplete seven-point ground survey is not joined or measured'
)

// A generated section becomes measurable as soon as ONE existing RL is entered
// between the toes: the missing intermediate points follow the interpolated line
// the chart already draws, so quantities stop reading zero.
const partialGroundSection = {
  id: 'partial-seven',
  chainage: 0,
  groundLevel: null,
  pre: [
    { offset: sectionSevenPoints[0].offset, rl: 95 },
    { offset: sectionSevenPoints[3].offset, rl: 99 },
    { offset: sectionSevenPoints[6].offset, rl: 96 }
  ],
  stripped: null,
  projected: null,
  designPointOffsets: sectionSevenPoints.map((point) => point.offset)
}
assert.equal(
  bund.hasCompleteRestorationGround(partialGroundSection),
  true,
  'one entered RL between the toes is enough to measure the section'
)
{
  const partialData = bund.defaultBundData()
  partialData.configured = true
  partialData.mode = 'restoration'
  partialData.design = sevenPointDesign
  const partialAreas = bund.sectionAreas(partialData, partialGroundSection)
  assert.ok(partialAreas.stripping > 0, 'a partly entered survey still measures stripping')
  assert.ok(partialAreas.formation > 0, 'a partly entered survey still measures formation')
}

// Distances are shown measured from the u/s toe (tape convention), while the
// levels stay stored about the centre-line that the crest and slopes need.
{
  const toeData = bund.defaultBundData()
  toeData.mode = 'restoration'
  toeData.design = sevenPointDesign
  const origin = bund.upstreamToeOffset(partialGroundSection, toeData)
  near(origin, sectionSevenPoints[0].offset, 1e-9, 'origin is the u/s toe offset')
  near(
    sectionSevenPoints[0].offset - origin,
    0,
    1e-9,
    'u/s toe reads 0 on the displayed tape'
  )
  near(
    sectionSevenPoints[6].offset - origin,
    sectionSevenPoints[6].offset - sectionSevenPoints[0].offset,
    1e-9,
    'd/s toe reads the full toe-to-toe width'
  )
  assert.ok(
    sectionSevenPoints.every((pt) => pt.offset - origin >= -1e-9),
    'no displayed distance is negative'
  )
}

const sparseOverrideSection = {
  id: 'override',
  chainage: 0,
  groundLevel: null,
  pre: sevenPointGround,
  stripped: null,
  projected: null,
  projectedOverrides: [
    { offset: 0, rl: 101 },
    { offset: -5.25, rl: 99.25 }
  ],
  designPointOffsets: sectionSevenPoints.map((point) => point.offset)
}
const overriddenBefore = bund.projectedProfile(sparseOverrideSection, sevenPointDesign)
assert.equal(
  overriddenBefore.find((point) => point.offset === 0).rl,
  101,
  'typed proposed value overrides only its own point'
)
assert.equal(
  overriddenBefore.find((point) => point.offset === -5.25).rl,
  99.25,
  'a proposed override is retained even without an existing-ground point at that offset'
)
const overriddenAfter = bund.projectedProfile(sparseOverrideSection, {
  ...sevenPointDesign,
  topLevel: 102
})
assert.equal(
  overriddenAfter.find((point) => point.offset === 0).rl,
  101,
  'typed proposed override remains fixed after a design change'
)
assert.equal(
  overriddenAfter.find((point) => point.offset === -1.5).rl,
  102,
  'non-overridden proposed points continue following TBL'
)
assert.ok(
  overriddenAfter.some((point) => point.offset === -5.25),
  'section-specific design midpoint remains in the automatic proposed profile'
)

// ---------------------------------------------------------------------------
// Reference case 1 — "2.Pedda Cheruvu, Fasal (V).xlsx", sheet '1.', chainage 0.
// A restoration section carrying three surveyed profiles reduced to datum 94.
// The workbook computes: after-formation 92.950, before-formation 87.797,
// stripped 86.295, giving stripping 1.502 and formation 5.153 sq.m.
// ---------------------------------------------------------------------------

const pre = [
  { offset: -7.5, rl: 98.716 },
  { offset: -5, rl: 99.63 },
  { offset: -1.2, rl: 100.935 },
  { offset: 0, rl: 100.955 },
  { offset: 1.5, rl: 100.985 },
  { offset: 7, rl: 98.725 }
]

// Note the toes are not stripped, so this is an explicit table rather than a
// uniform drop off `pre` — exactly why sections carry an optional override.
const stripped = [
  { offset: -7.5, rl: 98.716 },
  { offset: -5, rl: 99.48 },
  { offset: -1.2, rl: 100.79 },
  { offset: 0, rl: 100.86 },
  { offset: 1.5, rl: 100.831 },
  { offset: 7, rl: 98.725 }
]

const projected = [
  { offset: -7.5, rl: 98.75 },
  { offset: -5, rl: 99.9 },
  { offset: -1.5, rl: 101.5 },
  { offset: 0, rl: 101.5 },
  { offset: 1.5, rl: 101.5 },
  { offset: 7, rl: 98.75 }
]

near(bund.profileArea(pre, 94), 87.797, 0.002, 'before-formation area')
near(bund.profileArea(stripped, 94), 86.295, 0.002, 'stripped area')
near(bund.profileArea(projected, 94), 92.95, 0.002, 'after-formation area')

// Offsets entered out of order must not flip the sign of a strip.
near(
  bund.profileArea([...pre].reverse(), 94),
  bund.profileArea(pre, 94),
  1e-9,
  'profileArea is order-independent'
)

function restorationData(overrides = {}) {
  const data = bund.defaultBundData()
  data.configured = true
  data.mode = 'restoration'
  data.source = 'manual'
  data.datum = 94
  data.design = { ...data.design, stripDepth: 0.15 }
  return Object.assign(data, overrides)
}

const oneSection = restorationData()
oneSection.sections = [
  { id: 'a', chainage: 0, groundLevel: null, pre, stripped, projected }
]

const areas = bund.sectionAreas(oneSection, oneSection.sections[0])
near(areas.stripping, 1.502, 0.002, 'stripping area (pre - stripped)')
near(areas.formation, 5.153, 0.002, 'formation area on the existing basis')

// The other basis measures off the stripped surface instead, which is the
// 29 % difference the dashboard has to make visible.
const strippedBasis = bund.sectionAreas(
  { ...oneSection, fillBasis: 'stripped' },
  oneSection.sections[0]
)
near(strippedBasis.formation, 6.655, 0.002, 'formation area on the stripped basis')

// ---------------------------------------------------------------------------
// Mean Sectional Area. Two chainages 30 m apart, areas 1.502 and 1.472, give
// mean 1.487 and 1.487 x 30 = 44.61 cu.m — the shape of every row in the
// workbook's 'Bund Rest.' sheet.
// ---------------------------------------------------------------------------

const twoSections = restorationData()
const pre2 = pre.map((p) => ({ ...p, rl: p.rl - 0.03 }))
twoSections.sections = [
  { id: 'a', chainage: 0, groundLevel: null, pre, stripped, projected },
  {
    id: 'b',
    chainage: 30,
    groundLevel: null,
    pre: pre2,
    stripped: stripped.map((p) => ({ ...p, rl: p.rl - 0.03 })),
    projected
  }
]

const stripRows = bund.strippingRows(twoSections)
assert.equal(stripRows.length, 1, 'two chainages produce one MSA row')
near(stripRows[0].meanArea, 1.502, 0.002, 'mean area of equal-area sections')
near(stripRows[0].qty, 1.502 * 30, 0.05, 'MSA quantity = mean area x length')
near(stripRows[0].lengthM, 30, 1e-9, 'row length')

// A repeated chainage contributes no length and must not emit a zero row.
const duplicate = restorationData()
duplicate.sections = [
  { id: 'a', chainage: 0, groundLevel: null, pre, stripped, projected },
  { id: 'b', chainage: 0, groundLevel: null, pre, stripped, projected }
]
assert.equal(bund.strippingRows(duplicate).length, 0, 'zero-length rows are skipped')

// Sections given out of order are measured in chainage order.
const unordered = restorationData()
unordered.sections = [
  { id: 'b', chainage: 30, groundLevel: null, pre: pre2, stripped, projected },
  { id: 'a', chainage: 0, groundLevel: null, pre, stripped, projected }
]
assert.equal(bund.strippingRows(unordered)[0].fromCh, 0, 'rows run in chainage order')

// ---------------------------------------------------------------------------
// Reference case 2 — "8______Bund estimate_1.320TMC.xlsx", parametric new bund.
// Crest 6 m, combined side slopes 4.5 (u/s 2.5:1 + d/s 2:1), TBL 450, strip
// 0.34 m. The sheet's width-at-stripped-level column is 6 + 4.5H.
// ---------------------------------------------------------------------------

function newBundData() {
  const data = bund.defaultBundData()
  data.configured = true
  data.mode = 'new'
  data.source = 'manual'
  data.design = {
    topLevel: 450,
    topWidth: 6,
    usSlope: 2.5,
    dsSlope: 2,
    stripDepth: 0.34
  }
  return data
}

const nb = newBundData()

// Row 16 of the sheet: GL 449.854 -> stripped 449.514, height 0.486, width 8.187.
const h16 = bund.bundHeight(449.854, nb.design)
near(h16, 0.486, 0.001, 'height above stripped level')
near(bund.bundBaseWidth(h16, nb.design), 8.187, 0.002, 'width at stripped level (6 + 4.5H)')

// Ground already above TBL contributes nothing, matching IF(GL > TBL, 0, ...).
assert.equal(bund.bundHeight(450.9, nb.design), 0, 'no bund where ground is above TBL')
assert.equal(bund.designedArea(bund.bundHeight(450.9, nb.design), nb.design), 0, 'no area either')

// Trapezium area: (top + bottom)/2 x H, with bottom = top + (us+ds)H.
const h = 10
near(
  bund.designedArea(h, nb.design),
  ((6 + (6 + 4.5 * h)) / 2) * h,
  1e-9,
  'designed area is the trapezium of crest, slopes and height'
)

// The projected profile drawn for the diagram must enclose that same area.
const parametricSection = {
  id: 'p',
  chainage: 0,
  groundLevel: 440,
  pre: [],
  stripped: null,
  projected: null
}
const profile = bund.projectedProfile(parametricSection, nb.design)
assert.equal(profile.length, 4, 'projected profile is a trapezium')
const hp = bund.bundHeight(440, nb.design)
near(
  bund.profileArea(profile, 440 - nb.design.stripDepth),
  bund.designedArea(hp, nb.design),
  0.001,
  'diagram profile area matches the computed area'
)

// ---------------------------------------------------------------------------
// Formation / compaction operation selection and item sync.
// ---------------------------------------------------------------------------

const combined = restorationData()
combined.sections = twoSections.sections
const combinedItems = bund.requiredItems(combined)
assert.deepEqual(
  combinedItems.map((i) => i.role),
  ['clearance', 'stripping', 'formation'],
  'combined billing produces one earthwork item'
)

const formationOnly = {
  ...combined,
  billing: 'split',
  formationEnabled: true,
  compactionEnabled: false,
  formationMaterial: { code: 'IRR-PMW-3-17', unit: 'CUM' }
}
const formationOnlyItems = bund.requiredItems(formationOnly)
assert.deepEqual(
  formationOnlyItems.map((i) => i.role),
  ['clearance', 'stripping', 'formation'],
  'formation-only billing produces the PMW formation operation'
)
const compactionOnly = {
  ...combined,
  billing: 'split',
  formationEnabled: false,
  compactionEnabled: true,
  rollingMaterial: { code: 'IRR-PMW-3-18', unit: 'CUM' }
}
const compactionOnlyItems = bund.requiredItems(compactionOnly)
assert.deepEqual(
  compactionOnlyItems.map((i) => i.role),
  ['clearance', 'stripping', 'rolling'],
  'compaction-only billing produces only the PMW rolling operation'
)
assert.equal(
  compactionOnlyItems.find((i) => i.role === 'rolling').quantity,
  formationOnlyItems.find((i) => i.role === 'formation').quantity,
  'formation-only and compaction-only use the same computed embankment volume'
)

// Clearance is a plan area, so it is measured in sq.m, not cu.m.
assert.equal(
  combinedItems.find((i) => i.role === 'clearance').measure,
  'area',
  'clearance is measured as an area'
)

// Dropping the clearance code removes the item rather than billing zero.
const noClearance = bund.requiredItems({ ...combined, clearanceMaterial: null })
assert.ok(!noClearance.some((i) => i.role === 'clearance'), 'clearance can be turned off')

// The fill-basis comparison the dashboard shows must reflect both bases.
const delta = bund.fillBasisDelta(combined)
assert.ok(
  delta.stripped > delta.existing,
  'measuring from the stripped surface bills more than from existing ground'
)

// ---------------------------------------------------------------------------
// Chainage units and section materialization.
// ---------------------------------------------------------------------------

assert.equal(bund.toDisplayChainage(90, 'chains'), 3, '90 m is 3 chains')
assert.equal(bund.fromDisplayChainage(3, 'chains'), 90, '3 chains is 90 m')
assert.equal(bund.toDisplayChainage(90, 'm'), 90, 'metres pass through')

const mat = restorationData()
mat.lengthM = 120
mat.intervalM = 30
const built = bund.materializeSections(mat, [])
assert.deepEqual(
  built.map((s) => s.chainage),
  [0, 30, 60, 90, 120],
  'continuous mode tiles the length at the interval'
)

// A trailing part-section still gets its own chainage at the far end.
const ragged = restorationData()
ragged.lengthM = 100
ragged.intervalM = 30
assert.deepEqual(
  bund.materializeSections(ragged, []).map((s) => s.chainage),
  [0, 30, 60, 90, 100],
  'the far end always gets a section'
)

// Re-materializing keeps the survey already entered at a surviving chainage.
const kept = bund.materializeSections(mat, [
  { id: 'x', chainage: 60, groundLevel: null, pre, stripped, projected }
])
assert.equal(kept.find((s) => s.chainage === 60).pre.length, 6, 'existing survey is carried over')
assert.equal(kept.find((s) => s.chainage === 30).pre.length, 0, 'new chainages start empty')

// Discontinuous mode ignores breaks outside the bund.
const disc = restorationData()
disc.lengthM = 100
disc.sectionMode = 'discontinuous'
disc.breaks = [-5, 0, 40, 100, 130]
assert.deepEqual(
  bund.sectionChainages(disc),
  [0, 40, 100],
  'out-of-range breaks are dropped'
)

// ---------------------------------------------------------------------------
// Auto-derived proposed profile (the new restoration flow): the user enters
// only the existing ground and the proposed bund is drawn from the design.
// Flat ground at RL 95, TBL 100, crest 6 m, both slopes 1:2, no strip.
//   crest corners at x=±3 (RL 100); faces reach ground (95) after a 5 m drop,
//   i.e. 10 m out, toes at x=±13. Fill is a 5 m-high, 6 m-crest trapezium
//   tapering to points at ±13: 6×5 + 2×(½×10×5) = 30 + 50 = 80 m².
// ---------------------------------------------------------------------------

const flatPre = [
  { offset: -13, rl: 95 },
  { offset: -3, rl: 95 },
  { offset: 0, rl: 95 },
  { offset: 3, rl: 95 },
  { offset: 13, rl: 95 }
]

const derivedData = restorationData()
derivedData.design = {
  topLevel: 100,
  mwl: 98,
  ftl: 97,
  topWidth: 6,
  usSlope: 2,
  dsSlope: 2,
  stripDepth: 0
}
// No stored proposed/stripped — everything derived from the design.
derivedData.sections = [
  { id: 'd', chainage: 0, groundLevel: null, pre: flatPre, stripped: null, projected: null }
]

const derivedProfile = bund.deriveProposedProfile(flatPre, derivedData.design)
near(bund.designSurfaceAt(0, derivedData.design), 100, 1e-9, 'crest is at TBL')
near(bund.designSurfaceAt(-13, derivedData.design), 95, 1e-9, 'face reaches ground at the toe')
assert.ok(
  derivedProfile.some((p) => Math.abs(p.offset - 3) < 1e-6 && Math.abs(p.rl - 100) < 1e-6),
  'derived proposed has a crest corner at +3 / RL 100'
)

const derivedAreas = bund.sectionAreas(derivedData, derivedData.sections[0])
near(derivedAreas.formation, 80, 0.01, 'auto-derived fill area from the design')
assert.equal(derivedAreas.stripping, 0, 'no stripping when strip depth is zero')

// ---------------------------------------------------------------------------
// Zoned repair. Each side automatically stops at its first intersection with
// the surveyed Existing RL; the user does not select start/end points.
// ---------------------------------------------------------------------------

const zonedRepair = {
  ...derivedData,
  embankmentType: 'zoned',
  zonedRepairKind: 'breached',
  zonedSoilSource: 'borrow',
  heartingDesign: {
    topLevel: 100,
    topWidth: 1,
    usSlope: 0.5,
    dsSlope: 0.5,
    centerOffset: 0
  },
  sections: [
    {
      ...derivedData.sections[0],
      id: 'zh-a',
      chainage: 0
    },
    {
      ...derivedData.sections[0],
      id: 'zh-b',
      chainage: 30
    }
  ]
}
const zonedRepairCodes = bund.zonedSsrCodePair(zonedRepair)
zonedRepair.formationMaterial = { code: zonedRepairCodes.casing }
zonedRepair.heartingMaterial = { code: zonedRepairCodes.hearting }
const zonedAreas = bund.zonedRepairAreas(zonedRepair, zonedRepair.sections[0])
near(zonedAreas.hearting, 17.5, 0.001, 'repair hearting bounded by Existing RL')
near(zonedAreas.casing, 62.5, 0.001, 'casing is total repair fill less hearting')
near(
  zonedAreas.casing + zonedAreas.hearting,
  zonedAreas.totalFormation,
  0.001,
  'zoned repair conserves total formation area'
)
near(bund.rowsTotal(bund.heartingRows(zonedRepair)), 525, 0.001, 'hearting MSA volume')
near(bund.rowsTotal(bund.casingRows(zonedRepair)), 1875, 0.001, 'casing MSA volume')
assert.equal(
  bund.heartingRepairIssues(zonedRepair, zonedRepair.sections[0]).length,
  0,
  'valid repair hearting needs no foundation-level validation'
)
assert.ok(
  bund
    .heartingRepairIssues(
      zonedRepair,
      { ...zonedRepair.sections[0], pre: [] }
    )
    .some((issue) => issue.code === 'missing-boundary'),
  'surveyed Existing RL is required for automatic repair contacts'
)
assert.deepEqual(
  bund.requiredItems(zonedRepair).filter((item) => ['casing', 'hearting'].includes(item.role))
    .map((item) => [item.role, item.ref.code, item.quantity]),
  [
    ['casing', 'IRR-PMW-3-9', 1875],
    ['hearting', 'IRR-PMW-3-8', 525]
  ],
  'zoned repair generates separate casing and hearting items'
)

// An empty stored proposed must derive, not read as a zero-length override.
assert.ok(
  bund.projectedProfile(derivedData.sections[0], derivedData.design).length >= 2,
  'empty stored proposed still derives from the design'
)

// ---------------------------------------------------------------------------
// Standard tank-bund dimensions (Table 26.1) and auto-sizing.
// ---------------------------------------------------------------------------

assert.deepEqual(bund.standardTankBundDims(2), { freeBoard: 0.9, topWidth: 1.2 }, '1.5–3.0 m band')
assert.deepEqual(bund.standardTankBundDims(4), { freeBoard: 1.2, topWidth: 1.5 }, '3.0–4.5 m band')
assert.deepEqual(bund.standardTankBundDims(5), { freeBoard: 1.5, topWidth: 1.8 }, '4.5–6.0 m band')
assert.deepEqual(bund.standardTankBundDims(7), { freeBoard: 1.8, topWidth: 2.7 }, 'over 6.0 m band')

// FTL 100, deepest bed 96 → 4 m depth → free board 1.2, TBL 101.2, crest 1.5.
const sizedDesign = bund.designedFromTankLevels({
  ...bund.defaultBundDesign(),
  ftl: 100,
  deepBedLevel: 96
})
assert.ok(sizedDesign, 'auto-size returns a design when levels are present')
near(sizedDesign.topLevel, 101.2, 1e-6, 'TBL = FTL + free board')
near(sizedDesign.topWidth, 1.5, 1e-6, 'crest width from the table')

// Missing bed level → no auto-size.
assert.equal(
  bund.designedFromTankLevels({ ...bund.defaultBundDesign(), ftl: 100, deepBedLevel: null }),
  null,
  'auto-size needs both FTL and the bed level'
)

// ---------------------------------------------------------------------------
// Optional items: turfing (d/s), pitching (u/s), rock toe (d/s), soil split.
// Flat ground 95, TBL 100, crest 6, both slopes 1:2 → toes at ±13. Each face
// runs 10 m out and 5 m up: slope length √(10²+5²) = 11.180 m.
// ---------------------------------------------------------------------------

const faceLen = Math.hypot(10, 5)
const faces = bund.faceSlopeLengths(derivedData.sections[0], derivedData.design)
near(faces.us, faceLen, 0.01, 'u/s face slope length')
near(faces.ds, faceLen, 0.01, 'd/s face slope length')

// Two identical sections 30 m apart, so MSA(face) = faceLen and total = ×30.
const extrasData = {
  ...derivedData,
  // Ground 95, strip 0.3 → stripped 94.7. Water is capped at TBL 100,
  // so the phreatic construction uses a 5.3 m head.
  design: { ...derivedData.design, stripDepth: 0.3, mwl: 104.7 },
  turfingMaterial: { code: 'IRR-CAW-8-15' },
  pitchingMaterial: { code: 'IRR-CAW-8-6' },
  rockToeMaterial: { code: 'IRR-CAW-5-6' },
  sections: [
    { id: 'a', chainage: 0, groundLevel: null, pre: flatPre, stripped: null, projected: null },
    { id: 'b', chainage: 30, groundLevel: null, pre: flatPre, stripped: null, projected: null }
  ]
}

assert.equal(
  bund.BUND_DEFAULT_PITCHING_CODE,
  'IRR-CAW-8-8',
  'default upstream revetment is the verified 450 mm dry-rubble pitching code'
)

{
  const variantData = {
    ...extrasData,
    pitchingMaterial: {
      code: 'IRR-CAW-8-8',
      unit: 'SQM',
      side: 'SSR',
      dataVariant: {
        kind: 'optional_addition',
        key: 'addon:murum_bed_15cm',
        label: 'Add for 15 cm thick murum bed below pitching',
        sourceYear: '2026-27',
        addonId: 'murum_bed_15cm'
      }
    }
  }
  const component = {
    id: 'bund-variant',
    kind: 'component',
    name: 'Bund',
    children: [],
    bund: variantData
  }
  const rootNode = { id: 'root', kind: 'title', name: 'Title', children: [component] }
  const synced = bund.syncBundItems(rootNode, component.id)
  const pitchingItem = synced.children[0].children.find(
    (item) => item.templateItemRole === 'pitching'
  )
  assert.equal(
    pitchingItem.dataVariant.addonId,
    'murum_bed_15cm',
    'generated bund item preserves the selected pitching-bed add-on'
  )
}

const extrasRockToeHeight = bund.rockToeHeightAt(extrasData.sections[0], extrasData)
const exposedDsFace =
  faceLen - extrasRockToeHeight * Math.hypot(1, extrasData.design.dsSlope)
near(
  bund.rowsTotal(bund.turfingRows(extrasData)),
  exposedDsFace * 30,
  0.1,
  'turfing excludes the downstream slope occupied by the rock toe'
)
near(
  bund.rowsTotal(bund.turfingRows({ ...extrasData, rockToeMaterial: null })),
  faceLen * 30,
  0.1,
  'turfing uses the full downstream slope when the rock toe is off'
)
near(
  bund.requiredItems(extrasData).find((item) => item.role === 'turfing').quantity,
  exposedDsFace * 30,
  0.1,
  'generated turfing item uses the net exposed downstream slope'
)
near(bund.rowsTotal(bund.pitchingRows(extrasData)), faceLen * 30, 0.1, 'pitching area (u/s slope)')

const pitchingWithBedding = {
  ...extrasData,
  pitchingBeddingMaterial: { code: 'IRR-DAW-6-7', unit: 'CUM' },
  pitchingBeddingThickness: 0.2
}
near(
  bund.pitchingBeddingQuantity(pitchingWithBedding),
  faceLen * 30 * 0.2,
  0.05,
  'graded-sand bedding = u/s slope area × 200 mm'
)
const beddingItem = bund
  .requiredItems(pitchingWithBedding)
  .find((item) => item.role === 'pitching-bedding')
assert.ok(beddingItem, 'graded-sand bedding generates its own item')
assert.equal(beddingItem.measure, 'volume', 'graded-sand bedding is measured in cu.m')
assert.ok(
  !bund
    .requiredItems({ ...pitchingWithBedding, pitchingMaterial: null })
    .some((item) => item.role === 'pitching-bedding'),
  'graded-sand bedding is removed when upstream pitching is off'
)

const pitchingWithMetal = {
  ...extrasData,
  pitchingMetalEnabled: true,
  pitchingMetalMaterial: { code: 'FILTER-CODE', unit: 'CUM' },
  pitchingMetalThickness: 0.2
}
near(
  bund.pitchingMetalQuantity(pitchingWithMetal),
  faceLen * 30 * 0.2,
  0.05,
  'graded-metal filter = u/s slope area × 200 mm'
)
assert.ok(
  !bund
    .requiredItems(pitchingWithMetal)
    .some((item) => item.role === 'pitching-metal'),
  'legacy graded-metal fields no longer generate an upstream payment item'
)
assert.equal(
  bund.pitchingMetalQuantity({ ...pitchingWithMetal, pitchingMaterial: null }),
  0,
  'graded-metal filter is controlled by upstream pitching'
)

// The rock-toe height is the entered one — it is a design decision, not a
// solved value. It is only capped by the face available above the toe. The
// outer face still follows the bund D/S slope.
const autoToeHeight = bund.rockToeHeightAt(extrasData.sections[0], extrasData)
const autoToeGeo = bund.phreaticGeometry(extrasData, extrasData.sections[0])
const autoToeProj = bund
  .projectedProfile(extrasData.sections[0], extrasData.design)
  .sort((a, b) => a.offset - b.offset)
const autoToeDs = autoToeProj[autoToeProj.length - 1]
near(
  autoToeHeight,
  extrasData.rockToeHeight,
  1e-9,
  'the rock toe is measured at the height that was entered'
)
{
  const capped = bund.rockToeMaxHeightAt(extrasData.sections[0], extrasData)
  assert.ok(
    capped == null || extrasData.rockToeHeight <= capped + 1e-9,
    'and that height fits under the crest here'
  )
  const tooTall = { ...extrasData, rockToeHeight: 99 }
  near(
    bund.rockToeHeightAt(tooTall.sections[0], tooTall),
    bund.rockToeMaxHeightAt(tooTall.sections[0], tooTall),
    1e-9,
    'a height that does not fit is cut back to the face available above the toe'
  )
}
const autoToeBaseWidth = bund.rockToeBaseWidth(autoToeHeight, extrasData)
const autoToeArea =
  extrasData.rockToeTopWidth * autoToeHeight +
  0.5 *
    autoToeHeight ** 2 *
    (extrasData.rockToeInnerSlope + extrasData.design.dsSlope)
near(
  bund.rockToeAreaAt(extrasData.sections[0], extrasData),
  autoToeArea,
  1e-6,
  'rock-toe outer face follows the bund D/S slope'
)
near(
  bund.rowsTotal(bund.rockToeRows(extrasData)),
  autoToeArea * 30,
  0.1,
  'auto-sized rock toe volume = mean section × length'
)

const rockToeWithFilter = {
  ...extrasData,
  rockToeFilterMaterial: { code: 'IRR-CAW-5-11', unit: 'CUM' },
  rockToeExcavationMaterial: { code: 'IRR-CAW-1-2', unit: 'CUM' }
}
assert.equal(
  bund.BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  'IRR-CAW-5-11',
  'rock-toe filter uses the dedicated downstream filter SSR code'
)
near(
  bund.rockToeFilterAreaAt(rockToeWithFilter.sections[0], rockToeWithFilter),
  autoToeBaseWidth * 1 +
    Math.hypot(
      autoToeHeight,
      extrasData.rockToeInnerSlope * autoToeHeight
    ) *
      0.5,
  0.001,
  'CAW-5-11 total area includes its three media layers: 1.00 m below and 0.50 m behind'
)
assert.equal(
  bund.rockToeFoundationExcavationDepth({
    ...rockToeWithFilter,
    rockToeExcavationDepth: 0.2
  }),
  1,
  'the 1.00 m below-filter occupies the excavation instead of adding below a separate 0.20 m cut'
)
// The 0.50 m filter behind the inner face projects upstream of the rubble base,
// so the cut is that much wider than the base. Over the extra strip the general
// stripping is *transferred* into this code rather than added to it:
// bundNetStrippingBands removes the same span from the stripping item, so total
// earthwork is unchanged and only which code pays for it moves.
const behindHorizontal =
  bund.BUND_ROCKTOE_FILTER_BEHIND_M / Math.hypot(1, extrasData.rockToeInnerSlope)
const behindStripping = behindHorizontal * extrasData.design.stripDepth
near(
  bund.rowsTotal(
    bund.rockToeExcavationRows({
      ...rockToeWithFilter,
      rockToeExcavationDepth: 0.2
    })
  ),
  (autoToeBaseWidth * 1 + behindStripping) * 30,
  0.1,
  'filter excavation is base width × the 1.00 m depth, plus the stripping over the strip behind it'
)
assert.ok(
  bund.requiredItems(rockToeWithFilter).some((item) => item.role === 'rocktoe-filter'),
  'enabled rock-toe filter generates its own downstream filter item'
)
assert.ok(
  bund.requiredItems(rockToeWithFilter).some((item) => item.role === 'rocktoe-exc'),
  'enabled below-filter with an excavation code generates its excavation item'
)
assert.ok(
  !bund
    .requiredItems({ ...rockToeWithFilter, rockToeExcavationMaterial: null })
    .some((item) => item.role === 'rocktoe-exc'),
  'rock toe excavation is not billed until its separate switch/code is enabled'
)

// The water level no longer sizes the rock toe. It is rubble the designer has
// decided to build, so it measures at its entered height whatever MWL says —
// with no MWL at all, and with MWL below the ground. Whether it is tall enough
// to catch the seepage line is reported by the seepage diagram, not silently
// applied to the quantity.
for (const [label, mwl] of [
  ['no MWL entered', null],
  ['MWL below the ground', 90],
  ['MWL well above', 99]
]) {
  assert.equal(
    bund.rockToeHeightAt(extrasData.sections[0], {
      ...extrasData,
      design: { ...extrasData.design, mwl }
    }),
    1.5,
    `rock toe keeps its entered height — ${label}`
  )
}

// Foundation excavation under the toe: base width × depth × length.
const withExc = {
  ...extrasData,
  rockToeExcavationDepth: 0.5,
  rockToeExcavationMaterial: { code: 'IRR-CAW-1-2', unit: 'CUM' }
}
const baseW = bund.rockToeBaseWidth(
  bund.rockToeHeightAt(withExc.sections[0], withExc),
  withExc
)
near(bund.rowsTotal(bund.rockToeExcavationRows(withExc)), baseW * 0.5 * 30, 0.1, 'toe excavation volume')
assert.ok(
  bund.requiredItems(withExc).some((i) => i.role === 'rocktoe-exc'),
  'rock toe excavation item generated when a depth is set'
)

// Thickness parsed from the code description.
near(bund.parseThicknessM('45 cm thick dry rubble pitching'), 0.45, 1e-9, '45 cm → 0.45 m')
near(bund.parseThicknessM('225 mm thick pitching'), 0.225, 1e-9, '225 mm → 0.225 m')
assert.equal(bund.parseThicknessM('no thickness here'), null, 'no thickness → null')

// A CUM pitching code bills by volume = slope area × the code's thickness.
const pitchVol = {
  ...extrasData,
  pitchingMaterial: {
    code: 'X-CUM',
    unit: 'CUM',
    description: 'Providing and constructing 45 cm thick dry rubble stone pitching'
  }
}
assert.ok(bund.pitchingIsVolume(pitchVol), 'CUM code → volume billing')
near(bund.pitchingThicknessM(pitchVol), 0.45, 1e-9, 'thickness comes from the code')
const pItem = bund.requiredItems(pitchVol).find((i) => i.role === 'pitching')
assert.equal(pItem.measure, 'volume', 'CUM pitching code billed by volume')
near(
  pItem.quantity,
  bund.rowsTotal(bund.pitchingRows(pitchVol)) * 0.45,
  0.05,
  'pitching volume = slope area × code thickness'
)
// An SQM code (default) bills the slope area.
assert.equal(
  bund.requiredItems(extrasData).find((i) => i.role === 'pitching').measure,
  'area',
  'SQM pitching code billed by area'
)

const extraItems = bund.requiredItems(extrasData)
const roles = extraItems.map((i) => i.role)
assert.ok(roles.includes('turfing'), 'turfing item generated')
assert.ok(roles.includes('pitching'), 'pitching item generated')
assert.ok(roles.includes('rocktoe'), 'rock toe item generated')
assert.equal(
  extraItems.find((i) => i.role === 'turfing').measure,
  'area',
  'turfing measured as area (sq.m)'
)
assert.equal(
  extraItems.find((i) => i.role === 'rocktoe').measure,
  'volume',
  'rock toe measured as volume (cu.m)'
)

// Off by default — no optional items when the materials are null.
const noExtras = bund.requiredItems({
  ...extrasData,
  turfingMaterial: null,
  pitchingMaterial: null,
  rockToeMaterial: null
})
assert.ok(
  !noExtras.some((i) => ['turfing', 'pitching', 'rocktoe'].includes(i.role)),
  'optional items are off unless a code is attached'
)

// D/S chute drains: two manual chutes, each following the developed face.
// A 0.6 × 0.3 m rectangular channel gives 0.18 sq.m excavation per metre.
// Bed + two sides have a 1.2 m wetted perimeter and 100 mm lining.
const chuteData = {
  ...extrasData,
  chuteDrainLiningMaterial: { code: 'IRR-CAW-7-15', unit: 'CUM' },
  chuteDrainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
  chuteDrainUseSpacing: false,
  chuteDrainCount: 2,
  chuteDrainWidth: 0.6,
  chuteDrainDepth: 0.3,
  chuteDrainLiningThickness: 0.1
}
assert.equal(bund.resolvedChuteDrainCount(chuteData), 2, 'manual chute count')
near(
  bund.averageDownstreamSlopeLength(chuteData),
  faceLen,
  0.01,
  'chutes use the developed d/s face length'
)
near(bund.chuteDrainTotalLength(chuteData), 2 * faceLen, 0.01, 'total chute length')
near(
  bund.chuteDrainExcavationQuantity(chuteData),
  0.6 * 0.3 * 2 * faceLen,
  0.01,
  'chute excavation = width × depth × total length'
)
near(
  bund.chuteDrainLiningQuantity(chuteData),
  (0.6 + 2 * 0.3) * 0.1 * 2 * faceLen,
  0.01,
  'chute lining = wetted perimeter × thickness × total length'
)
// The chute cutting resolves to the same SOR code as the general stripping, and
// requiredItems merges items sharing a code because one code is one line of the
// abstract. So the role disappears while the quantity does not: what has to be
// checked is that the excavation is billed, not which line carries it.
const chuteItems = bund.requiredItems(chuteData)
const billedVolume = (items) =>
  items
    .filter((item) => item.measure === 'volume')
    .reduce((sum, item) => sum + item.quantity, 0)
const chuteBilled = billedVolume(chuteItems)
const withoutChuteExcavation = billedVolume(
  bund.requiredItems({ ...chuteData, chuteDrainExcavationMaterial: null })
)
near(
  chuteBilled - withoutChuteExcavation,
  bund.chuteDrainExcavationQuantity(chuteData),
  0.01,
  'chute excavation reaches the estimate, inside the line that carries its code'
)
assert.ok(chuteItems.some((i) => i.role === 'chute-lining'), 'chute lining item generated')
const stoneChuteData = {
  ...chuteData,
  chuteDrainProtectionType: 'stone',
  chuteDrainLiningMaterial: { code: 'IRR-CAW-8-10', unit: 'SQM' }
}
const stoneProtection = bund.chuteDrainProtectionMeasurement(stoneChuteData)
assert.equal(stoneProtection.measure, 'area', 'SQM stone pitching is measured by surface area')
near(
  stoneProtection.quantity,
  (0.6 + 2 * 0.3) * 2 * faceLen,
  0.01,
  'stone chute protection = bed-and-side area'
)
assert.equal(
  bund.requiredItems(stoneChuteData).find((i) => i.role === 'chute-lining').measure,
  'area',
  'generated stone protection item retains SQM measurement'
)
assert.equal(
  bund.resolvedChuteDrainCount({
    ...chuteData,
    chuteDrainUseSpacing: true,
    chuteDrainSpacing: 20,
    lengthM: 30
  }),
  2,
  'spacing mode rounds up to cover the bund length'
)
assert.deepEqual(
  bund
    .chuteDrainRows({
      ...chuteData,
      chuteDrainUseSpacing: true,
      chuteDrainSpacing: 20,
      lengthM: 30
    })
    .map((row) => row.chainage),
  [0, 20],
  'spacing mode assigns an explicit chainage to every chute'
)

const variableChuteData = bund.defaultBundData()
variableChuteData.configured = true
variableChuteData.mode = 'new'
variableChuteData.lengthM = 30
variableChuteData.design = {
  ...variableChuteData.design,
  topLevel: 100,
  topWidth: 6,
  usSlope: 2,
  dsSlope: 2,
  stripDepth: 0
}
variableChuteData.sections = [
  { id: 'vc0', chainage: 0, groundLevel: 95, pre: [], stripped: null, projected: null },
  { id: 'vc1', chainage: 15, groundLevel: 94, pre: [], stripped: null, projected: null },
  { id: 'vc2', chainage: 30, groundLevel: 90, pre: [], stripped: null, projected: null }
]
variableChuteData.chuteDrainLiningMaterial = {
  code: 'IRR-CAW-7-15',
  unit: 'CUM'
}
variableChuteData.chuteDrainExcavationMaterial = {
  code: 'IRR-CAW-1-1',
  unit: 'CUM'
}
variableChuteData.chuteDrainUseSpacing = false
variableChuteData.chuteDrainCount = 3
variableChuteData.chuteDrainWidth = 0.6
variableChuteData.chuteDrainDepth = 0.3
variableChuteData.chuteDrainLiningThickness = 0.1
const variableChuteRows = bund.chuteDrainRows(variableChuteData)
assert.deepEqual(
  variableChuteRows.map((row) => row.chainage),
  [0, 15, 30],
  'manual chute count is distributed over the entered section chainages'
)
variableChuteRows.forEach((row, index) =>
  near(
    row.slopeLength,
    bund.faceSlopeLengths(
      variableChuteData.sections[index],
      variableChuteData.design
    ).ds,
    0.001,
    `chute ${index + 1} uses its local downstream slope`
  )
)
near(
  bund.chuteDrainTotalLength(variableChuteData),
  variableChuteRows.reduce((sum, row) => sum + row.slopeLength, 0),
  0.001,
  'total chute length sums local chute slopes instead of count × average slope'
)
assert.ok(
  Math.abs(
    bund.chuteDrainTotalLength(variableChuteData) -
      variableChuteRows.length * bund.averageDownstreamSlopeLength(variableChuteData)
  ) > 0.1,
  'varying sections are not collapsed into one average chute slope'
)
near(
  bund.chuteDrainExcavationQuantity(variableChuteData),
  variableChuteRows.reduce((sum, row) => sum + row.excavationQty, 0),
  0.001,
  'chute excavation sums the chainage-wise rows'
)
near(
  bund.chuteDrainProtectionMeasurement(variableChuteData).quantity,
  variableChuteRows.reduce((sum, row) => sum + row.protectionQty, 0),
  0.001,
  'chute protection sums the chainage-wise rows'
)
assert.ok(
  !bund
    .requiredItems({ ...chuteData, chuteDrainLiningMaterial: null })
    .some((i) => i.role === 'chute-exc' || i.role === 'chute-lining'),
  'turning the chute card off removes both generated items'
)
const splitChuteData = {
  ...chuteData,
  excavationBands: {
    ...chuteData.excavationBands,
    'chute-exc': [
      { id: 'cs1', label: 'All Soils', pct: 60, material: { code: 'IRR-CAW-1-1' } },
      { id: 'cs2', label: 'HDR', pct: 40, material: { code: 'IRR-CAW-1-4' } }
    ]
  }
}
// The class split is checked by code rather than by role: the All Soils share
// uses the same code as the general stripping and merges into that line, while
// the HDR share has a code of its own and stays separate. What must hold either
// way is that each class is billed its own percentage.
const billedByCode = (data) => {
  const totals = new Map()
  for (const item of bund.requiredItems(data)) {
    if (item.measure !== 'volume') continue
    totals.set(item.ref.code, (totals.get(item.ref.code) ?? 0) + item.quantity)
  }
  return totals
}
const withSplit = billedByCode(splitChuteData)
const withoutChute = billedByCode({ ...splitChuteData, chuteDrainExcavationMaterial: null })
const chuteShare = (code) => (withSplit.get(code) ?? 0) - (withoutChute.get(code) ?? 0)
near(
  chuteShare('IRR-CAW-1-1'),
  bund.chuteDrainExcavationQuantity(chuteData) * 0.6,
  0.01,
  'chute all-soils share'
)
near(
  chuteShare('IRR-CAW-1-4'),
  bund.chuteDrainExcavationQuantity(chuteData) * 0.4,
  0.01,
  'chute HDR share'
)

// Soil-class split: the stripping total is divided by the band percentages.
const strippingTotal = bund.rowsTotal(bund.strippingRows(extrasData))
assert.ok(strippingTotal > 0, 'there is stripping to split')
assert.equal(
  bund
    .requiredItems({
      ...extrasData,
      excavationBands: {
        ...extrasData.excavationBands,
        stripping: extrasData.excavationBands.stripping.map((row) => ({ ...row, pct: 0 }))
      }
    })
    .filter((item) => item.role === 'stripping').length,
  0,
  'zero central percentages never fall back silently to the legacy stripping code'
)
const soilSplitData = {
  ...extrasData,
  soilBands: [
    { id: '1', label: 'All soils', pct: 70, material: { code: 'IRR-CAW-1-2' } },
    { id: '2', label: 'Hard rock', pct: 30, material: { code: 'IRR-CAW-1-6' } }
  ]
}
const soilStripItems = bund.requiredItems(soilSplitData).filter((i) => i.role === 'stripping')
assert.equal(soilStripItems.length, 2, 'two stripping items, one per band')
near(
  soilStripItems.find((i) => i.ref.code === 'IRR-CAW-1-2').quantity,
  strippingTotal * 0.7,
  0.05,
  '70% band'
)
near(
  soilStripItems.find((i) => i.ref.code === 'IRR-CAW-1-6').quantity,
  strippingTotal * 0.3,
  0.05,
  '30% band'
)

// ---------------------------------------------------------------------------
// Jungle clearance measurement modes, and migration of older saved bunds.
// ---------------------------------------------------------------------------

near(bund.developedGroundLength(flatPre), 26, 1e-6, 'flat ground developed length = its width')
assert.ok(
  bund.developedGroundLength(pre) > bund.profileWidth(pre),
  'a sloped ground line develops longer than its horizontal width'
)

near(
  bund.clearanceTotal({
    ...extrasData,
    clearanceMode: 'manual',
    clearanceManualRows: [
      { id: 'c1', length: 100, breadth: 5 },
      { id: 'c2', length: 20, breadth: 3 }
    ]
  }),
  560,
  1e-9,
  'manual clearance sums repeatable length × breadth rows'
)

const automaticClearance = bund.defaultBundData()
automaticClearance.configured = true
automaticClearance.mode = 'restoration'
automaticClearance.sections = [
  // TBL 100, crest 3, u/s 1:1.5, d/s 1:2. Flat ground at RL 95 seats the bund
  // over 1.5 + 1.5×5 + 1.5 + 2×5 = 20.5 m; at RL 93 it seats over 27.5 m. The
  // cleared perimeter is the developed ground across that seating, so it grows
  // with the height of the bund, not with how far the tape happened to run.
  {
    id: 'ca',
    chainage: 0,
    groundLevel: null,
    pre: [
      { offset: -20, rl: 95 },
      { offset: 20, rl: 95 }
    ],
    stripped: null,
    projected: null
  },
  {
    id: 'cb',
    chainage: 30,
    groundLevel: null,
    pre: [
      { offset: -20, rl: 93 },
      { offset: 20, rl: 93 }
    ],
    stripped: null,
    projected: null
  }
]
const automaticClearanceRows = bund.clearancePerimeterRows(automaticClearance)
assert.equal(automaticClearanceRows.length, 1, 'chainage zero creates no standalone clearance row')
near(automaticClearanceRows[0].areaFrom, 20.5, 1e-6, 'P1 is the section A seating')
near(automaticClearanceRows[0].areaTo, 27.5, 1e-6, 'P2 is the section B seating')
near(automaticClearanceRows[0].meanArea, 24, 1e-6, 'automatic clearance averages P1 and P2')
near(automaticClearanceRows[0].qty, 720, 1e-6, 'average perimeter × section length')
assert.equal(
  bund.clearancePerimeterRows({
    ...automaticClearance,
    sections: [
      automaticClearance.sections[0],
      { ...automaticClearance.sections[1], pre: [] }
    ]
  }).length,
  0,
  'automatic clearance waits until both bounding sections have existing levels'
)

const newBundClearance = newBundData()
newBundClearance.sections = [
  { id: 'nca', chainage: 0, groundLevel: 440, pre: [], stripped: null, projected: null },
  { id: 'ncb', chainage: 30, groundLevel: 442, pre: [], stripped: null, projected: null }
]
const newBundClearanceRows = bund.clearancePerimeterRows(newBundClearance)
const newBundWidthA = bund.sectionAreas(
  newBundClearance,
  newBundClearance.sections[0]
).clearanceWidth
const newBundWidthB = bund.sectionAreas(
  newBundClearance,
  newBundClearance.sections[1]
).clearanceWidth
assert.equal(newBundClearanceRows.length, 1, 'new-bund clearance creates an MSA row')
near(
  newBundClearanceRows[0].areaFrom,
  newBundWidthA,
  1e-9,
  'new-bund clearance uses the designed seating width at section A'
)
near(
  newBundClearanceRows[0].areaTo,
  newBundWidthB,
  1e-9,
  'new-bund clearance uses the designed seating width at section B'
)
near(
  newBundClearanceRows[0].qty,
  ((newBundWidthA + newBundWidthB) / 2) * 30,
  0.01,
  'new-bund clearance = mean seating width × chainage length'
)

// Migration backfills fields that a bund saved before they existed will lack.
const legacyBund = bund.defaultBundData()
delete legacyBund.soilBands
delete legacyBund.excavationBands
delete legacyBund.turfingMaterial
delete legacyBund.rockToeInnerSlope
delete legacyBund.rockToeAutoHeight
delete legacyBund.clearanceMode
delete legacyBund.clearanceManualRows
delete legacyBund.chuteDrainLiningMaterial
delete legacyBund.chuteDrainExcavationMaterial
delete legacyBund.chuteDrainProtectionType
delete legacyBund.chuteDrainSpacing
delete legacyBund.chuteDrainLiningThickness
delete legacyBund.pitchingBeddingMaterial
delete legacyBund.pitchingBeddingThickness
delete legacyBund.pitchingMetalEnabled
delete legacyBund.pitchingMetalMaterial
delete legacyBund.pitchingMetalThickness
const migrated = bund.migrateBundData(legacyBund)
assert.ok(Array.isArray(migrated.soilBands), 'migration restores soilBands array')
assert.equal(
  migrated.excavationBands['chute-exc'][1].material.code,
  'IRR-CAW-1-4',
  'migration restores chute excavation with the drain/channel code family'
)
assert.equal(migrated.turfingMaterial, null, 'migration restores turfingMaterial')
assert.equal(migrated.clearanceMode, 'perimeter', 'migration restores automatic perimeter mode')
assert.ok(Array.isArray(migrated.clearanceManualRows), 'migration restores manual clearance rows')
assert.equal(typeof migrated.rockToeInnerSlope, 'number', 'migration restores rock-toe geometry')
assert.equal(
  migrated.rockToeAutoHeight,
  false,
  'a project saved with the old auto height reopens on its entered height'
)
assert.equal(migrated.chuteDrainLiningMaterial, null, 'migration keeps chute drains off')
assert.equal(migrated.chuteDrainProtectionType, 'concrete', 'migration restores protection type')
assert.equal(migrated.chuteDrainSpacing, 30, 'migration restores chute spacing')
assert.equal(migrated.chuteDrainLiningThickness, 0.1, 'migration restores chute lining thickness')
assert.equal(migrated.pitchingBeddingMaterial, null, 'migration keeps pitching bedding off')

const priorExcavationLayout = bund.defaultBundData()
delete priorExcavationLayout.excavationClassificationVersion
priorExcavationLayout.excavationBands = {
  ...priorExcavationLayout.excavationBands,
  stripping: [
    { id: 'old-s1', label: 'All soils', pct: 100, material: { code: 'IRR-CAW-1-2' } },
    { id: 'old-s2', label: 'Rock', pct: 0, material: { code: 'IRR-CAW-1-2' } }
  ],
  'chute-exc': [
    { id: 'old-c1', label: 'All Soils', pct: 100, material: { code: 'IRR-CAW-1-1' } },
    { id: 'old-c2', label: 'HDR', pct: 0, material: { code: 'IRR-DAW-1-2' } },
    { id: 'old-c3', label: 'F&F', pct: 0, material: { code: 'IRR-DAW-1-3' } },
    { id: 'old-c4', label: 'HR', pct: 0, material: { code: 'IRR-DAW-1-5' } }
  ]
}
const correctedExcavationLayout = bund.migrateBundData(priorExcavationLayout)
assert.deepEqual(
  correctedExcavationLayout.excavationBands.stripping.map((row) => row.material.code),
  ['IRR-CAW-1-1', 'IRR-CAW-1-4', 'IRR-CAW-1-6', 'IRR-CAW-1-7'],
  'old stripping card upgrades to the seating/drain excavation family'
)
assert.deepEqual(
  correctedExcavationLayout.excavationBands['chute-exc'].map(
    (row) => row.material.code
  ),
  ['IRR-CAW-1-1', 'IRR-CAW-1-4', 'IRR-CAW-1-6', 'IRR-CAW-1-7'],
  'old mixed chute card upgrades away from DAW foundation codes'
)
assert.equal(migrated.pitchingBeddingThickness, 0.15, 'migration restores 150 mm filter input')
assert.equal(migrated.pitchingMetalEnabled, false, 'migration keeps graded metal off')
assert.equal(migrated.pitchingMetalMaterial, null, 'migration restores empty metal SSR code')
assert.equal(migrated.pitchingMetalThickness, 0.2, 'migration restores 200 mm metal thickness')

const legacyManualClearance = bund.defaultBundData()
legacyManualClearance.clearanceMode = 'manual'
delete legacyManualClearance.clearanceManualRows
legacyManualClearance.clearanceLength = 12
legacyManualClearance.clearanceBreadth = 10
const migratedManualClearance = bund.migrateBundData(legacyManualClearance)
assert.deepEqual(
  migratedManualClearance.clearanceManualRows.map((row) => [row.length, row.breadth]),
  [[12, 10]],
  'legacy single manual clearance dimensions migrate into one repeatable row'
)

// ---------------------------------------------------------------------------
// U/S stone-pitching toe trench: trapezoidal excavation × length.
// 1.9 / 1.0 / 1.3 → area (1.9+1)/2 × 1.3 = 1.885 m².
// Over the 30 m between the two sections → 56.55 cu.m.
// ---------------------------------------------------------------------------

const usToe = {
  topWidth: 1.9,
  bottomWidth: 1.0,
  depth: 1.3,
  excavationMaterial: { code: 'IRR-CAW-1-2' },
  buildMaterial: null,
  buildArea: 0,
  liningThickness: 0
}
near(bund.toeExcavationArea(usToe), 1.885, 1e-9, 'toe trench area = (top+bottom)/2 × depth')

const toeData = { ...extrasData, upstreamToe: usToe, downstreamToe: bund.defaultBundToe({ topWidth: 2.5, bottomWidth: 1, depth: 1.3 }) }
near(bund.rowsTotal(bund.toeExcavationRows(toeData, usToe)), 1.885 * 30, 0.1, 'toe excavation volume = area × length')

const toeItems = bund.requiredItems(toeData)
assert.ok(toeItems.some((i) => i.role === 'ustoe-exc'), 'u/s toe excavation item generated')
assert.ok(!toeItems.some((i) => i.role === 'dstoe-exc'), 'd/s toe off until a code is attached')
assert.ok(
  !toeItems.some((i) => i.role === 'ustoe-build'),
  'u/s anchorage construction remains optional when no build code is attached'
)

const builtToeData = {
  ...toeData,
  upstreamToe: {
    ...usToe,
    buildMaterial: {
      code: bund.BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
      unit: 'CUM',
      description: 'M-15 plain concrete works using 40 mm down aggregate'
    }
  }
}
const usToeBuildItem = bund.requiredItems(builtToeData).find((i) => i.role === 'ustoe-build')
assert.ok(usToeBuildItem, 'u/s toe-wall / anchorage construction is generated separately')
assert.equal(usToeBuildItem.measure, 'volume', 'u/s anchorage construction is measured in CUM')
near(
  usToeBuildItem.quantity,
  1.885 * 30,
  0.1,
  'u/s anchorage construction uses its full modelled section × bund length'
)
assert.equal(
  bund.BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
  'IRR-DAW-2-11',
  'default rigid u/s anchorage is the M15 PCC item'
)

// The u/s toe wall/anchorage is its own module now — it works as a standalone
// cut-off trench whether or not stone pitching is enabled.
const toeWithoutPitching = { ...toeData, pitchingMaterial: null }
assert.ok(
  bund.requiredItems(toeWithoutPitching).some((i) => i.role === 'ustoe-exc'),
  'u/s toe trench still bills with stone pitching off'
)

// D/S toe-drain revetment is automatically measured over the bottom bed and
// both sloping sides. The selected SQM code already includes its 300 mm depth.
const dsToe = {
  ...bund.defaultBundToe({ topWidth: 2.5, bottomWidth: 1, depth: 1.3 }),
  excavationMaterial: { code: 'IRR-CAW-1-2', unit: 'CUM' },
  buildMaterial: {
    code: 'IRR-CAW-8-6',
    unit: 'SQM',
    description: 'Providing and constructing 30 cm thick dry rubble stone pitching'
  },
  buildArea: 0
}
const dsToeData = { ...toeData, downstreamToe: dsToe }
const expectedToeLiningWidth = 1 + 2 * Math.hypot(1.3, 0.75)
near(
  bund.toeLiningDevelopedWidth(dsToe),
  expectedToeLiningWidth,
  0.001,
  'toe-drain developed width = bottom + two sloping sides'
)
near(
  bund.rowsTotal(bund.toeBuildRows(dsToeData, dsToe)),
  expectedToeLiningWidth * 30,
  0.1,
  'toe-drain revetment area = developed width × bund length'
)
// The revetment shares the pitching code, so requiredItems merges it into that
// line — one code is one line of the abstract. Check that it is billed, and
// billed by area, rather than that it kept a role of its own.
const toeBuildCode = bund.BUND_DEFAULT_TOE_BUILD_CODE
const areaBilledFor = (data, code) =>
  bund
    .requiredItems(data)
    .filter((item) => item.ref.code === code && item.measure === 'area')
    .reduce((sum, item) => sum + item.quantity, 0)
near(
  areaBilledFor(dsToeData, toeBuildCode) -
    areaBilledFor({ ...dsToeData, downstreamToe: { ...dsToe, buildMaterial: null } }, toeBuildCode),
  bund.rowsTotal(bund.toeBuildRows(dsToeData, dsToe)),
  0.1,
  'toe-drain revetment is billed by area, without a manual section area'
)
assert.equal(
  bund.BUND_DEFAULT_TOE_BUILD_CODE,
  'IRR-CAW-8-6',
  'default toe-drain revetment is the 300 mm dry-rubble pitching code'
)

// The same developed bed-and-side area may instead receive CC. A CUM code
// bills area × lining thickness rather than the SQM rubble-revetment area.
const dsToeCc = {
  ...dsToe,
  buildMaterial: {
    code: bund.BUND_DEFAULT_TOE_CC_CODE,
    unit: 'CUM',
    description: 'Providing 100 mm thick M15 cement concrete lining'
  },
  liningThickness: 0.1
}
const dsToeCcData = { ...toeData, downstreamToe: dsToeCc }
const dsToeCcMeasurement = bund.toeBuildMeasurement(dsToeCcData, dsToeCc)
assert.equal(dsToeCcMeasurement.measure, 'volume', 'CC toe-drain lining uses CUM basis')
near(
  dsToeCcMeasurement.quantity,
  expectedToeLiningWidth * 30 * 0.1,
  0.1,
  'CC toe-drain quantity = developed area × lining thickness'
)
const dsToeCcItem = bund.requiredItems(dsToeCcData).find((i) => i.role === 'dstoe-build')
assert.ok(dsToeCcItem, 'CC toe-drain lining generates the protection item')
assert.equal(dsToeCcItem.measure, 'volume', 'CC toe-drain estimate item is measured in CUM')
near(
  dsToeCcItem.quantity,
  dsToeCcMeasurement.quantity,
  0.001,
  'CC toe-drain estimate item receives the calculated concrete volume'
)
assert.equal(
  bund.BUND_DEFAULT_TOE_CC_CODE,
  'IRR-CAW-7-15',
  'default toe-drain CC option uses the M15 bed-and-side lining code'
)

const gradedToeData = {
  ...dsToeData,
  sections: [
    dsToeData.sections[0],
    {
      ...dsToeData.sections[1],
      pre: dsToeData.sections[1].pre.map((point) => ({ ...point, rl: point.rl + 1 }))
    }
  ],
  downstreamToe: {
    ...dsToe,
    invertLevel: 94,
    leftSlope: 1,
    rightSlope: 2
  }
}
assert.equal(
  bund.toeDrainInvertLevelAt(gradedToeData.sections[0], gradedToeData),
  94,
  'toe-drain uses the single entered invert RL'
)
assert.equal(
  bund.toeDrainInvertLevelAt(gradedToeData.sections[1], gradedToeData),
  94,
  'toe-drain invert RL remains constant at every chainage'
)
near(
  bund.toeDrainDepthAt(gradedToeData.sections[0], gradedToeData),
  1,
  0.001,
  'toe-drain depth is calculated from local downstream ground to start invert'
)
near(
  bund.toeDrainDepthAt(gradedToeData.sections[1], gradedToeData),
  2,
  0.001,
  'toe-drain depth increases automatically where local ground rises'
)
near(
  bund.toeDrainTopWidthAt(gradedToeData.sections[0], gradedToeData),
  4,
  0.001,
  'trapezoidal drain top width includes the base width and left/right side slopes'
)
near(
  bund.rowsTotal(bund.toeExcavationRows(gradedToeData, gradedToeData.downstreamToe)),
  ((2.5 + 8) / 2) * 30,
  0.05,
  'toe-drain excavation uses mean variable trapezoidal areas above one invert RL'
)

// A CUM pitching code is still restricted to the developed u/s slope. Toe
// excavation and construction remain separate items.
const toePitchVolume = {
  ...toeData,
  pitchingMaterial: {
    code: 'X-CUM',
    unit: 'CUM',
    description: 'Providing and constructing 45 cm thick dry rubble stone pitching'
  }
}
const toePitchItem = bund.requiredItems(toePitchVolume).find((i) => i.role === 'pitching')
near(
  toePitchItem.quantity,
  bund.rowsTotal(bund.pitchingRows(toePitchVolume)) * 0.45,
  0.05,
  'CUM pitching excludes toe-wall / anchorage volume'
)

// ---------------------------------------------------------------------------
// Internal drainage: phreatic line (Casagrande) and the two filters.
// Flat ground 95, strip 0.3 → base 94.7; TBL 100; MWL 98 → H = 3.3 m.
// ---------------------------------------------------------------------------

const drainData = {
  ...extrasData,
  // Internal filters are only buildable into new fill, so the filter cases run
  // in 'new' mode (flat ground RL 95, strip 0.3 → base 94.7, MWL 98 → H 3.3).
  mode: 'new',
  design: { ...extrasData.design, mwl: 98 },
  horizontalFilterMaterial: { code: 'IRR-CAW-5-5', unit: 'CUM' },
  horizontalFilterLength: 6,
  horizontalFilterThickness: 0.6,
  sections: [
    { id: 'a', chainage: 0, groundLevel: 95, pre: [], stripped: null, projected: null },
    { id: 'b', chainage: 30, groundLevel: 95, pre: [], stripped: null, projected: null }
  ]
}

// A repair must never offer or bill internal filters — they cannot be placed
// under a bund that already exists. A rock toe still can (built at the outside).
{
  const repairFilters = {
    ...drainData,
    mode: 'restoration',
    rockToeAutoHeight: false,
    rockToeHeight: 1.5,
    sections: extrasData.sections
  }
  assert.equal(bund.internalFiltersAvailable(repairFilters), false, 'repair: no internal filters')
  const roles = bund.requiredItems(repairFilters).map((i) => i.role)
  assert.ok(!roles.includes('hfilter'), 'repair does not bill a horizontal filter')
  assert.ok(!roles.includes('vfilter'), 'repair does not bill a chimney filter')
  assert.ok(roles.includes('rocktoe'), 'repair still bills the rock toe')
  assert.equal(bund.internalFiltersAvailable(drainData), true, 'new fill: filters available')
}

// Horizontal filter: 6 × 0.6 = 3.6 m² section × 30 m = 108 cu.m.
near(bund.rowsTotal(bund.horizontalFilterRows(drainData)), 3.6 * 30, 0.1, 'blanket volume')

// Phreatic geometry (REPAIR model): the line is fixed by MWL + geometry + the
// d/s toe — the focus always sits at the d/s toe, and drainage is checked for
// whether it intercepts the line, never for moving it.
const geo = bund.phreaticGeometry(drainData, drainData.sections[0])
assert.ok(geo, 'phreatic line computes with MWL + levels')
near(geo.waterDepth, 3.3, 1e-6, 'water depth = MWL − stripped base')
{
  const b = geo.focusX - geo.startX
  near(geo.s, Math.sqrt(b * b + geo.waterDepth ** 2) - b, 0.001, 'S = √(b²+H²) − b')
}
near(geo.focusX, geo.dsToeX, 1e-6, 'repair: focus is always the d/s toe')
assert.ok(!geo.cutsFace, 'the blanket at the toe catches the descending line')
// With a rock toe also present it catches the line first; isolate the blanket.
{
  const blanketOnly = bund.phreaticGeometry(
    { ...drainData, rockToeMaterial: null },
    drainData.sections[0]
  )
  assert.equal(blanketOnly.interceptedBy, 'blanket', 'blanket alone catches it at the toe')
}
// The line ends at the focus at height S above the base.
const lastPt = geo.points[geo.points.length - 1]
near(lastPt.rl - geo.baseRl, geo.s, 0.01, 'parabola passes the focus at y = S')

// Changing the blanket length must NOT move the fixed line (repair).
const longer = bund.phreaticGeometry(
  { ...drainData, horizontalFilterLength: 12 },
  drainData.sections[0]
)
near(longer.s, geo.s, 1e-9, 'blanket length does not change the line (S unchanged)')
near(longer.focusX, geo.focusX, 1e-9, 'focus stays at the d/s toe')

// A rock toe intercepts only when it is tall enough to reach the line.
const rockToeTall = bund.phreaticGeometry(
  {
    ...drainData,
    horizontalFilterMaterial: null,
    rockToeAutoHeight: false,
    rockToeHeight: 2
  },
  drainData.sections[0]
)
assert.equal(rockToeTall.interceptedBy, 'rocktoe', 'a tall rock toe catches the line')
const rockToeShort = bund.phreaticGeometry(
  {
    ...drainData,
    horizontalFilterMaterial: null,
    rockToeAutoHeight: false,
    rockToeHeight: 0.5
  },
  drainData.sections[0]
)
assert.ok(rockToeShort.cutsFace, 'a too-short rock toe lets the line pass over it')

// Undrained: the phreatic line reaches the d/s face (warning case).
const undrained = bund.phreaticGeometry(
  { ...drainData, horizontalFilterMaterial: null, rockToeMaterial: null },
  drainData.sections[0]
)
assert.ok(undrained.cutsFace, 'no drainage → line cuts the d/s face')

// A chimney on the blanket intercepts the line where it stands: the drawn line
// stops at the chimney (blanket inner end), not at the toe.
const chimneyGeo = bund.phreaticGeometry(
  {
    ...drainData,
    verticalFilterMaterial: { code: 'IRR-DAW-6-8', unit: 'CUM' },
    verticalFilterWidth: 0.45,
    verticalFilterHeight: 0
  },
  drainData.sections[0]
)
assert.equal(chimneyGeo.interceptedBy, 'chimney', 'chimney intercepts the line')
near(chimneyGeo.interceptX, chimneyGeo.dsToeX - 6, 0.05, 'the line is caught at the chimney')
// The full undrained line is still returned — it always runs to the toe.
near(
  chimneyGeo.points[chimneyGeo.points.length - 1].offset,
  chimneyGeo.focusX,
  0.05,
  'the undrained reference line always runs to the d/s toe'
)

// The drawn rock-toe trapezium must enclose exactly the billed area:
// crest·h + ½·h²·(inner + d/s slope), with base = crest + h·(inner + d/s).
{
  const rtData = {
    ...drainData,
    horizontalFilterMaterial: null,
    rockToeAutoHeight: false,
    rockToeHeight: 2,
    rockToeTopWidth: 1,
    rockToeInnerSlope: 1
  }
  const h = 2
  const ds = rtData.design.dsSlope
  near(
    bund.rockToeBaseWidth(h, rtData),
    1 + h * (1 + ds),
    1e-9,
    'toe base = crest + h × (inner + d/s slope)'
  )
  near(
    bund.rockToeAreaAt(rtData.sections[0], rtData),
    1 * h + 0.5 * h * h * (1 + ds),
    1e-9,
    'toe area = trapezium of crest, height and the two slopes'
  )
  // Trapezium area from the four drawn corners must equal the billed area.
  const base = bund.rockToeBaseWidth(h, rtData)
  const crestSpan = base - h * (1 + ds)
  near(((base + crestSpan) / 2) * h, bund.rockToeAreaAt(rtData.sections[0], rtData), 1e-9,
    'drawn corners enclose the billed area')
}

// Vertical filter: auto height = MWL − base = 3.3; 0.45 wide × 30 m = 44.55 cu.m.
const vData = {
  ...drainData,
  verticalFilterMaterial: { code: 'IRR-DAW-6-8', unit: 'CUM' },
  verticalFilterWidth: 0.45,
  verticalFilterHeight: 0
}
near(
  bund.verticalFilterHeightAt(vData.sections[0], vData),
  3.3,
  1e-6,
  'chimney auto height = up to MWL'
)
near(bund.rowsTotal(bund.verticalFilterRows(vData)), 0.45 * 3.3 * 30, 0.1, 'chimney volume')

const vItems = bund.requiredItems(vData).map((i) => i.role)
assert.ok(vItems.includes('hfilter') && vItems.includes('vfilter'), 'both filter items generated')

// The chimney needs the blanket: without the horizontal filter it must not bill.
const orphanChimney = bund
  .requiredItems({ ...vData, horizontalFilterMaterial: null })
  .map((i) => i.role)
assert.ok(!orphanChimney.includes('vfilter'), 'vertical filter needs the horizontal filter')

// ---------------------------------------------------------------------------
// Dangerous-section selection and the lowest-ground water depth.
// Section 'a' sits on flat ground 95; section 'low' has one toe down at 93 —
// lower ground → deeper water → it governs the drainage design.
// ---------------------------------------------------------------------------

const lowPre = flatPre.map((p) => (p.offset === 13 ? { ...p, rl: 93 } : { ...p }))
const twoLevels = {
  ...drainData,
  // Survey-driven sections — this is the repair behaviour.
  mode: 'restoration',
  sections: [
    { id: 'a', chainage: 0, groundLevel: null, pre: flatPre, stripped: null, projected: null },
    { id: 'low', chainage: 30, groundLevel: null, pre: lowPre, stripped: null, projected: null }
  ]
}
assert.equal(
  bund.criticalSection(twoLevels).id,
  'low',
  'dangerous section = the one with the lowest ground RL'
)
near(
  bund.lowestStrippedLevelAt(twoLevels.sections[1], twoLevels),
  93 - 0.3,
  1e-9,
  'lowest stripped level uses the lowest surveyed point, not the centre'
)
// Water depth at the dangerous section measures from that lowest level.
const lowGeo = bund.phreaticGeometry(twoLevels, twoLevels.sections[1])
near(lowGeo.waterDepth, 98 - (93 - 0.3), 1e-6, 'depth = MWL − lowest stripped ground')

// The geometry is the REAL profile: toes from the proposed section, and the
// entry point interpolated where MWL crosses the actual u/s face.
{
  const proj = bund
    .projectedProfile(drainData.sections[0], drainData.design)
    .sort((a, b) => a.offset - b.offset)
  const realGeo = bund.phreaticGeometry(drainData, drainData.sections[0])
  near(realGeo.usToeX, proj[0].offset, 1e-6, 'u/s toe from the real profile')
  near(realGeo.dsToeX, proj[proj.length - 1].offset, 1e-6, 'd/s toe from the real profile')
  // Flat ground 95, face 1:2 → MWL 98 crosses the u/s face at x = −13 + 2·3 = −7.
  near(realGeo.entryX, -7, 0.01, 'entry where MWL crosses the real u/s face')
}

// ---------------------------------------------------------------------------
// Berms. Crest 3 m at TBL 100, u/s 1:1.5, d/s 1:2, one d/s shelf 3 m wide at
// RL 96. Ground RL 95, strip 0.3 → base 94.7, so the bund is 5.3 m tall and the
// shelf is 1.3 m above its base.
// ---------------------------------------------------------------------------

const bermDesign = {
  topLevel: 100,
  mwl: null,
  ftl: null,
  deepBedLevel: null,
  topWidth: 3,
  usSlope: 1.5,
  dsSlope: 2,
  stripDepth: 0.3,
  berms: [
    {
      id: 'b1',
      side: 'ds',
      level: 96,
      width: 3,
      crossFall: 40,
      slopeBelow: null,
      surfaceMaterial: null,
      surfaceThickness: 0.1,
      drainLiningMaterial: null,
      drainExcavationMaterial: null,
      drainWidth: 0.6,
      drainDepth: 0.3,
      drainLiningThickness: 0.1
    }
  ]
}
const plainDesign = { ...bermDesign, berms: [] }

// The face: 8 m of 1:2 slope down to the shelf, 3 m of shelf, then 1:2 again.
near(bund.designSurfaceAt(1.5, bermDesign), 100, 1e-9, 'crest edge stays at TBL')
near(bund.designSurfaceAt(9.5, bermDesign), 96, 1e-9, 'face reaches the shelf after 8 m')
near(bund.designSurfaceAt(11, bermDesign), 96, 1e-9, 'the shelf itself is level')
near(bund.designSurfaceAt(12.5, bermDesign), 96, 1e-9, 'shelf ends 3 m further out')
near(bund.designSurfaceAt(14.5, bermDesign), 95, 1e-9, 'the face resumes below the shelf')
near(
  bund.designSurfaceAt(-9.5, bermDesign),
  100 - 8 / 1.5,
  1e-9,
  'a d/s berm leaves the u/s face untouched'
)
near(bund.faceDistanceToLevel(bermDesign, 'ds', 94), 8 + 3 + 4, 1e-9, 'distance out to RL 94')
near(bund.faceDistanceToLevel(plainDesign, 'ds', 94), 12, 1e-9, 'plain face for comparison')

// A shelf pushes everything below it outward: base width and section area grow
// by exactly the shelf width times the height of bund below the shelf.
near(bund.bundBaseWidth(6, bermDesign), 3 + 9 + 15, 1e-9, 'base width includes the shelf')
near(
  bund.designedArea(6, bermDesign) - bund.designedArea(6, plainDesign),
  3 * (96 - 94),
  1e-6,
  'berm fill = shelf width × height of bund below it'
)
near(
  bund.designedArea(6, plainDesign),
  (3 + ((1.5 + 2) / 2) * 6) * 6,
  1e-9,
  'a design with no berms still measures as the plain trapezium'
)

const bermSections = [
  { id: 'a', chainage: 0, groundLevel: 95, pre: [], stripped: null, projected: null },
  { id: 'b', chainage: 30, groundLevel: 95, pre: [], stripped: null, projected: null }
]
const bermData = {
  ...bund.defaultBundData(),
  configured: true,
  mode: 'new',
  lengthM: 30,
  design: bermDesign,
  sections: bermSections
}
const plainData = { ...bermData, design: plainDesign }

// The drawn section steps through the shelf, and the hinges are real points.
{
  const profile = bund
    .projectedProfile(bermSections[0], bermDesign)
    .sort((a, b) => a.offset - b.offset)
  const shelf = profile.filter((p) => Math.abs(p.rl - 96) < 1e-6)
  assert.equal(shelf.length, 2, 'the shelf draws as its two hinges')
  near(shelf[0].offset, 9.5, 1e-6, 'inner hinge 8 m out from the crest edge')
  near(shelf[1].offset, 12.5, 1e-6, 'outer hinge 3 m further')
  near(profile[profile.length - 1].offset, 1.5 + 8 + 3 + 2.6, 1e-6, 'd/s toe past the shelf')
}

// Turfing/pitching are slope work: the horizontal shelf is not part of either.
{
  const faces = bund.faceSlopeLengths(bermSections[0], bermDesign)
  near(
    faces.ds,
    Math.hypot(8, 4) + Math.hypot(2.6, 1.3),
    1e-3,
    'd/s slope length excludes the 3 m shelf'
  )
  near(faces.us, Math.hypot(1.5 * 5.3, 5.3), 1e-3, 'u/s face is untouched')
}

// The shelf is fill, so it is already paid inside the formation item. On the
// 'existing' basis the wider seating is also stripped 0.3 m deeper, and that
// layer is not paid twice — so the berm adds 3 m × (1.3 − 0.3) m × 30 m.
near(
  bund.rowsTotal(bund.formationRows(bermData)) -
    bund.rowsTotal(bund.formationRows(plainData)),
  3 * (1.3 - 0.3) * 30,
  0.01,
  'berm fill lands in the formation quantity, not in a separate item'
)
near(
  bund.rowsTotal(bund.formationRows({ ...bermData, fillBasis: 'stripped' })) -
    bund.rowsTotal(bund.formationRows({ ...plainData, fillBasis: 'stripped' })),
  3 * 1.3 * 30,
  0.01,
  'measured off the stripped surface, the whole shelf is paid'
)
near(
  bund.rowsTotal(bund.strippingRows(bermData)) -
    bund.rowsTotal(bund.strippingRows(plainData)),
  3 * 0.3 * 30,
  0.01,
  'a berm widens the seating, so it is stripped wider too'
)

// Presence follows the geometry: a shelf below the toe simply never forms.
{
  const lowBerm = { ...bermDesign.berms[0], id: 'low', level: 94 }
  const lowData = { ...bermData, design: { ...bermDesign, berms: [lowBerm] } }
  assert.equal(bund.bermWidthAt(bermSections[0], lowData, lowBerm), 0, 'below the toe: no shelf')
  near(bund.bermPresentLength(lowData, lowBerm), 0, 1e-9, 'and no length')
  assert.ok(
    bund.bermIssues(lowData, lowBerm).some((issue) => issue.level === 'error'),
    'a berm that never forms is reported as an error'
  )
  assert.equal(bund.bermWidthAt(bermSections[0], bermData, bermDesign.berms[0]), 3, 'shelf forms')
  near(bund.bermPresentLength(bermData, bermDesign.berms[0]), 30, 1e-6, 'over the full length')
}

// On a repair the shelf is judged against the surveyed ground under it, so a
// berm tapers out across the section where the ground rises above its RL.
{
  const groundAt = (rl) => [
    { offset: -30, rl },
    { offset: 0, rl },
    { offset: 30, rl }
  ]
  const repairBerm = {
    ...bermData,
    mode: 'restoration',
    sections: [
      { id: 'a', chainage: 0, groundLevel: null, pre: groundAt(95), stripped: null, projected: null },
      { id: 'b', chainage: 30, groundLevel: null, pre: groundAt(97), stripped: null, projected: null }
    ]
  }
  const berm = bermDesign.berms[0]
  assert.equal(bund.bermWidthAt(repairBerm.sections[0], repairBerm, berm), 3, 'shelf clears RL 95')
  assert.equal(
    bund.bermWidthAt(repairBerm.sections[1], repairBerm, berm),
    0,
    'ground at RL 97 buries a shelf at RL 96'
  )
  near(bund.bermPresentLength(repairBerm, berm), 15, 1e-6, 'the berm tapers out over the run')
  assert.deepEqual(
    bund.bermSectionCoverage(repairBerm, berm),
    { present: 1, total: 2 },
    'coverage counts the sections that actually carry the shelf'
  )
}

// Berms push the toe outward by a shelf width each, which regularly takes it
// past the end of the survey. The proposed face must still run down to the
// ground there instead of stopping in mid-air at the last surveyed offset.
{
  // Ground RL 95 surveyed only to ±12 m. On a repair the fill is clamped to the
  // existing ground, so a plain d/s face meets it at 1.5 + 2 × 5 = 11.50 —
  // inside the tape. One 3 m shelf pushes that out to 14.50, past the end of it.
  const shortSurvey = [
    { offset: -12, rl: 95 },
    { offset: 0, rl: 95 },
    { offset: 12, rl: 95 }
  ]
  const section = {
    id: 'a',
    chainage: 0,
    groundLevel: null,
    pre: shortSurvey,
    stripped: null,
    projected: null
  }
  const plain = { ...bermData, mode: 'restoration', design: plainDesign, sections: [section] }
  const withBerm = { ...plain, design: bermDesign }

  const plainProfile = bund
    .projectedProfile(section, plainDesign)
    .sort((a, b) => a.offset - b.offset)
  near(
    plainProfile[plainProfile.length - 1].offset,
    11.5,
    1e-3,
    'plain face ends at its own toe, inside the survey'
  )

  const bermProfile = bund
    .projectedProfile(section, bermDesign)
    .sort((a, b) => a.offset - b.offset)
  const toe = bermProfile[bermProfile.length - 1]
  near(toe.offset, 14.5, 1e-3, 'the shelf pushes the toe 3 m past the surveyed 12 m')
  near(toe.rl, 95, 1e-6, 'and the face still runs all the way down to the ground')
  // The shelf is drawn end to end (a survey offset may land on it as well).
  const onShelf = bermProfile.filter((p) => Math.abs(p.rl - 96) < 1e-6)
  near(onShelf[0].offset, 9.5, 1e-6, 'shelf starts at its inner hinge')
  near(onShelf[onShelf.length - 1].offset, 12.5, 1e-6, 'and runs to its outer hinge')

  // Areas stay honest: every profile is measured over the one common span, so
  // the extra wedge of fill beyond the tape is counted, not silently dropped.
  const fill = bund.sectionAreas(withBerm, section).formation
  const plainFill = bund.sectionAreas(plain, section).formation
  near(fill - plainFill, 3 * (96 - 95), 0.05, 'the berm adds its shelf of fill above the ground')

  // The invariant that catches a toe drawn as a chord instead of a kink: over
  // flat ground the surveyed measurement must equal the closed-form trapezium.
  near(
    plainFill,
    bund.designedArea(5, plainDesign),
    1e-6,
    'surveyed fill agrees with the trapezium formula'
  )
  near(
    fill,
    bund.designedArea(5, bermDesign),
    1e-6,
    'and still agrees once a shelf interrupts the face'
  )
}

// Surfacing and the catch-water drain, measured like every other longitudinal
// element: value per section, averaged, times the length between them.
{
  const surfaced = {
    ...bermDesign.berms[0],
    surfaceMaterial: { code: 'IRR-CAW-8-15', unit: 'SQM' },
    drainLiningMaterial: { code: 'IRR-CAW-7-15', unit: 'CUM' },
    drainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
    drainWidth: 0.6,
    drainDepth: 0.3,
    drainLiningThickness: 0.1
  }
  const surfacedData = { ...bermData, design: { ...bermDesign, berms: [surfaced] } }
  const surfacing = bund.bermSurfaceMeasurement(surfacedData, surfaced)
  assert.equal(surfacing.measure, 'area', 'an SQM code bills the shelf area')
  near(surfacing.quantity, (3 - 0.6) * 30, 0.01, 'the drain channel is not surfaced as well')
  near(
    bund.rowsTotal(bund.bermDrainExcavationRows(surfacedData, surfaced)),
    0.6 * 0.3 * 30,
    0.01,
    'drain excavation = channel section × length'
  )
  const protection = bund.bermDrainProtectionMeasurement(surfacedData, surfaced)
  assert.equal(protection.measure, 'volume', 'a CUM lining bills by volume')
  near(protection.quantity, (0.6 + 2 * 0.3) * 30 * 0.1, 0.01, 'bed and two sides × thickness')

  const items = bund.requiredItems(surfacedData)
  const roles = items.map((item) => item.role)
  assert.ok(roles.includes('berm-surface'), 'berm surfacing generates an item')
  assert.ok(roles.includes('berm-drain-lining'), 'berm drain protection generates an item')
  assert.ok(roles.includes('berm-drain-exc'), 'berm drain excavation generates an item')
  assert.equal(
    bund.requiredItems(bermData).some((item) => item.role.startsWith('berm-')),
    false,
    'an unsurfaced, undrained earth berm bills nothing of its own'
  )
}

// The rock toe belongs at the downstream toe, whatever the berms do. A berm
// moves that toe outward and the rock toe follows it there — it is never built
// at the end of a shelf, which is halfway up the face.
{
  const rockDesign = (berms) => ({ ...bermDesign, mwl: 98, berms })
  const rockData = (berms) => ({
    ...bermData,
    design: rockDesign(berms),
    rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
    rockToeAutoHeight: true,
    rockToeTopWidth: 0,
    rockToeInnerSlope: 1,
    turfingMaterial: { code: 'IRR-CAW-8-15', unit: 'SQM' }
  })
  const shelf = (over) => ({ ...bermDesign.berms[0], ...over })
  const toeOf = (data) => {
    const profile = bund
      .projectedProfile(data.sections[0], data.design)
      .sort((a, b) => a.offset - b.offset)
    return profile[profile.length - 1]
  }

  const plainRock = rockData([])
  const bermRock = rockData([shelf({})])
  near(toeOf(plainRock).offset, 12.1, 1e-3, 'plain d/s toe')
  near(toeOf(bermRock).offset, 15.1, 1e-3, 'a 3 m shelf pushes the toe 3 m out')
  near(
    toeOf(bermRock).rl,
    toeOf(plainRock).rl,
    1e-9,
    'the rock toe still sits on the same ground, just further out'
  )

  // It cannot rise through a shelf: a berm low on the face caps its height.
  const lowShelf = rockData([shelf({ id: 'low', level: 95.5 })])
  const section = lowShelf.sections[0]
  near(bund.rockToeMaxHeightAt(section, lowShelf), 95.5 - 94.7, 1e-6, 'capped by the shelf')
  assert.equal(
    bund.rockToeShelfLimit(section, lowShelf)?.level,
    95.5,
    'and reports which shelf is doing the capping'
  )
  const cappedHeight = bund.rockToeHeightAt(section, lowShelf)
  assert.ok(
    cappedHeight + toeOf(lowShelf).rl <= 95.5 + 1e-6,
    'the rock toe crest never rises above the shelf it sits under'
  )
  // Manual heights are capped by the same shelf, not just automatic ones.
  const manualTall = { ...lowShelf, rockToeAutoHeight: false, rockToeHeight: 4 }
  near(bund.rockToeHeightAt(section, manualTall), 0.8, 1e-6, 'a typed height is capped too')

  // The exposed face follows the slope handed down below the lowest shelf, so
  // the rock toe and the bund line stay continuous.
  const flatterBelow = rockData([shelf({ id: 'flat', slopeBelow: 3 })])
  const flatSection = flatterBelow.sections[0]
  near(
    bund.downstreamToeFaceSlope(flatSection, flatterBelow),
    3,
    1e-6,
    'face slope at the toe is the shelf s slope below, not the one above it'
  )
  near(
    bund.rockToeBaseWidthAt(flatSection, flatterBelow),
    bund.rockToeHeightAt(flatSection, flatterBelow) * (1 + 3),
    1e-3,
    'and the base width is set out from that slope'
  )
  near(
    bund.downstreamToeFaceSlope(plainRock.sections[0], plainRock),
    2,
    1e-6,
    'with no berm it is simply the d/s slope'
  )
}

// Everything anchored to the toe must use the real toe. A survey run wider than
// the bund leaves surveyed points beyond it, and taking the last of them as the
// toe strands the rock toe, the toe drain and the seepage focus out on open
// ground — which is what a berm makes obvious, by moving the toe further out.
{
  // Ground falling 94 → 90 across a 60 m tape; the bund only occupies part of it.
  const falling = [
    { offset: -30, rl: 94 },
    { offset: 0, rl: 92 },
    { offset: 30, rl: 90 }
  ]
  const section = {
    id: 'a',
    chainage: 30,
    groundLevel: null,
    pre: falling,
    stripped: null,
    projected: null
  }
  const shelf = { ...bermDesign.berms[0], level: 94 }
  const wideDesign = { ...bermDesign, mwl: 95, berms: [shelf] }
  const wide = {
    ...bermData,
    mode: 'restoration',
    design: wideDesign,
    sections: [{ ...section, id: 'z', chainage: 0 }, section],
    rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
    rockToeAutoHeight: true,
    rockToeTopWidth: 0,
    rockToeInnerSlope: 1
  }

  const profile = bund
    .projectedProfile(section, wideDesign)
    .sort((a, b) => a.offset - b.offset)

  const toe = bund.downstreamToePointAt(section, wide)
  near(toe.offset, 23.65, 0.01, 'the toe is where the face meets the ground')
  near(toe.rl, 90.423, 0.01, 'at the interpolated ground level there')
  assert.ok(toe.offset < 30 - 1e-6, 'the toe is not the last surveyed point, 6 m further out')
  near(
    profile[profile.length - 1].offset,
    toe.offset,
    0.01,
    'and the drawn profile ends there too'
  )

  // The rock toe hangs off that toe, nowhere near the shelf.
  const shelfSpan = bund.bermShelfOffsets(wideDesign, shelf)
  const height = bund.rockToeHeightAt(section, wide)
  const innerEdge = toe.offset - bund.rockToeBaseWidthAt(section, wide)
  assert.ok(height > 0, 'the rock toe still has a height')
  assert.ok(
    innerEdge > shelfSpan[1],
    'the rock toe sits beyond the shelf, at the toe — never on the berm'
  )

  // The head is measured from the ground the bund stands on, not from lower
  // ground outside it, or the whole construction sinks below the toe.
  const datum = bund.lowestStrippedLevelAt(section, wide)
  near(datum, 90.423 - 0.3, 0.01, 'seepage datum = stripped ground under the bund')

  // A rock toe sized onto the line must then report itself as catching it.
  // Where the phreatic focus sits is the seepage model's business, and is
  // asserted with the rest of the phreatic construction — not here. What this
  // block owns is that the toe itself is the real toe.
}

// The suggestion follows the height of the bund, not the user's memory.
{
  assert.deepEqual(bund.suggestedBermLevels(bermData), [], '5.3 m of bund needs no berm')
  const tall = {
    ...bermData,
    design: { ...plainDesign, topLevel: 115 },
    sections: bermSections
  }
  near(bund.maxBundHeight(tall), 115 - 94.7, 1e-6, 'height above the stripped base')
  // 20.3 m of bund: shelves at 6 m intervals below the crest. RL 97 would sit
  // only 2.3 m above the toe, which is not worth a shelf, so it is not offered.
  assert.deepEqual(
    bund.suggestedBermLevels(tall),
    [109, 103],
    'a berm every 6 m of fall, stopping clear of the toe'
  )
}

console.log('bund: all assertions passed')
