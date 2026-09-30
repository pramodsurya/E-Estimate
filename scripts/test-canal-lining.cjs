const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const lining = require('../src/renderer/src/lib/canalLiningDesign.ts')
const catalogue = require('../src/renderer/src/lib/canalLiningCatalogue.ts')
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .0011, `${actual} != ${expected}`)
const fixture = () => {
  const data = { ...canal.defaultCanalData(), lengthM: 100, configured: true }
  data.design.bedLevelAtStart = 100; data.design.bedSlope = 0
  data.sections = canal.materializeCanalSections(data, [])
  const reach = { ...canal.defaultCanalLiningReach(0, 100), designV2: lining.defaultLiningDesign() }
  reach.designV2.drainageDecision = 'none'
  data.liningReaches = [reach]
  return { data, reach, design: reach.designV2 }
}
const measure = ({ data, reach }) => lining.measureLiningWorksheet(data, reach)
const generated = (data) => canal.syncCanalItems({ id: 'root', kind: 'root', name: 'Root', children: [{ id: 'c', kind: 'component', name: 'Canal', componentTemplate: 'canal', canal: data, children: [] }] }, 'c').children[0].children.filter((item) => item.kind === 'item')
const work = (f, kind, patch = {}) => {
  const value = { ...lining.defaultLiningWork(kind, 0), ...patch }
  f.design.works.push(value)
  return value
}

assert.equal(catalogue.CANAL_LINING_CATALOGUE.filter((item) => item.code.startsWith('IRR-CAW-7-')).length, 48)
let f = fixture()
let q = measure(f)
assert.deepEqual(q.errors, [])
near(q.areas.bed, 300)
near(q.areas.left, 100 * 2.1 * Math.hypot(1, 1.5))
assert.equal(q.lines.filter((line) => line.billable).length, 3)
near(generated(f.data).find((item) => item.itemCode === 'IRR-CAW-7-6').computedQuantity, 300 + q.areas.left + q.areas.right)
f.design.drainageDecision = 'pending'
assert.equal(measure(f).lines.filter((line) => line.billable).length, 0)
assert.equal(generated(f.data).length, 0)

// Unit-aware concrete selection and persisted incompatible thickness detection.
f = fixture(); f.design.surfaces.bed = { ...lining.defaultLiningSurface(), code: 'IRR-CAW-7-15', thicknessMm: 100 }
q = measure(f)
near(q.lines.find((line) => line.surface === 'bed').quantity, 30)
assert.equal(q.lines.find((line) => line.surface === 'bed').unit, 'CUM')
near(generated(f.data).find((item) => item.itemCode === 'IRR-CAW-7-15').computedQuantity, 30)
f.design.surfaces.bed.thicknessMm = 75
assert.equal(measure(f).lines.find((line) => line.surface === 'bed').billable, false)

// Asymmetric extents and endpoint integration, including partial section ranges.
f = fixture(); f.design.sameSides = false; f.design.leftFreeboard = 0; f.design.rightFreeboard = .3
q = measure(f); near(q.areas.left, 150 * Math.hypot(1, 1.5)); near(q.areas.right, 180 * Math.hypot(1, 1.5))
f.reach.fromChainage = 12; f.reach.toChainage = 88
near(measure(f).areas.bed, 228)
f.design.topMode = 'rl'; f.design.topRl = 101.5; f.data.design.bedSlope = 1000
near(measure(f).areas.left, 76 * 1.55 * Math.hypot(1, 1.5))

// CNS and membrane are separate units; repeated layers are blocked.
f = fixture(); const cns = lining.defaultLiningLayer('cns'); cns.surfaces = ['bed']; cns.thicknessMm = 200
const ldpe = lining.defaultLiningLayer('ldpe'); ldpe.surfaces = ['bed']; ldpe.returnsArea = 5
f.design.layers.push(cns, ldpe)
q = measure(f); near(q.lines.find((line) => line.cardId === cns.id).quantity, 60); near(q.lines.find((line) => line.cardId === ldpe.id).quantity, 305)
f.design.layers.push({ ...ldpe, id: 'duplicate' })
assert.ok(measure(f).lines.filter((line) => line.ref.code === 'IRR-CAW-7-31').every((line) => !line.billable))

// PCC manufacturing requires a confirmed count and never merges with area fixing.
f = fixture(); f.design.sameSides = false; f.design.surfaces.left = lining.defaultLiningSurface('pcc')
q = measure(f); assert.equal(q.lines.find((line) => line.ref.code === 'IRR-CAW-7-28').billable, false)
f.design.surfaces.left.slabCount = 1300; f.design.surfaces.left.manufacture = true
q = measure(f); near(q.lines.find((line) => line.ref.code === 'IRR-CAW-7-28').quantity, q.areas.left)
assert.equal(q.lines.find((line) => line.ref.code === 'IRR-CAW-7-38').quantity, 1300)
assert.ok(q.lines.filter((line) => line.surface === 'left').every((line) => line.billable))

// Included joint work requires a distinct referenced scope.
f = fixture(); const mastic = work(f, 'mastic', { spacing: 25 })
assert.equal(measure(f).lines.find((line) => line.cardId === mastic.id).billable, false)
mastic.distinctScope = true; mastic.note = 'Drawing J1: separate construction joints'
assert.equal(measure(f).lines.find((line) => line.cardId === mastic.id).billable, true)

// Absolute layouts and endpoint ownership survive a reach split.
f = fixture(); f.design.drainageDecision = 'provided'; const drain = work(f, 'transverse-drain', { spacing: 25 })
assert.deepEqual(lining.liningWorkLocations(f.data, f.reach, drain), [0, 25, 50, 75, 100])
const originalQuantity = measure(f).lines.find((line) => line.cardId === drain.id).quantity
const split = lining.splitLiningReach(f.reach, 50); assert.equal(split.length, 2); f.data.liningReaches = split
near(split.reduce((sum, reach) => sum + lining.measureLiningWorksheet(f.data, reach).lines.find((line) => line.cardId === drain.id).quantity, 0), originalQuantity)
assert.deepEqual(lining.liningWorkLocations(f.data, split[0], split[0].designV2.works[0]), [0, 25])
assert.deepEqual(lining.liningWorkLocations(f.data, split[1], split[1].designV2.works[0]), [50, 75, 100])
f.data.liningReaches = [split[0]]
assert.deepEqual(lining.liningWorkLocations(f.data, split[0], split[0].designV2.works[0]), [0, 25, 50], 'isolated lined-reach end is retained')

// Invalid drainage dimensions and duplicate rows do not bill.
f = fixture(); f.design.drainageDecision = 'provided'; const longitudinal = work(f, 'longitudinal-drain', { rows: 2, offsets: [-.5, .5] })
near(measure(f).lines.find((line) => line.cardId === longitudinal.id).quantity, 200)
longitudinal.offsets = [-2, 2]
assert.equal(measure(f).lines.find((line) => line.cardId === longitudinal.id).billable, false)
longitudinal.offsets = [-.5, .5]; work(f, 'longitudinal-drain', { offsets: [.5] })
assert.ok(measure(f).lines.filter((line) => line.ref.code === 'IRR-CAW-5-8').every((line) => !line.billable))

// Relief assembly emits separate pipe / filter / rock hole counts.
f = fixture(); f.design.drainageDecision = 'provided'; f.design.subgrade = 'rock'
const relief = work(f, 'relief', { placement: 'manual', chainages: [25, 50], filterPocket: true, rockHole: true })
q = measure(f); assert.deepEqual(q.lines.filter((line) => line.cardId === relief.id).map((line) => [line.ref.code, line.quantity]), [['IRR-CAW-7-19', 2], ['IRR-CAW-7-26', 2], ['IRR-CAW-7-25', 2]])
f.design.subgrade = 'soil'; assert.ok(measure(f).lines.filter((line) => line.cardId === relief.id).every((line) => !line.billable))

// Disabled components retain configuration but emit no quantity.
relief.enabled = false; assert.equal(measure(f).lines.filter((line) => line.cardId === relief.id).length, 0)

// Overlapping surface treatments are blocked; different surfaces can coexist.
f = fixture(); const overlap = { ...structuredClone(f.reach), id: 'overlap' }; f.data.liningReaches.push(overlap)
assert.ok(measure(f).errors.some((error) => error.includes('Overlapping')))
f.design.surfaces.left = lining.defaultLiningSurface('none'); f.design.surfaces.right = lining.defaultLiningSurface('none')
overlap.designV2.surfaces.bed = lining.defaultLiningSurface('none')
assert.ok(!measure(f).errors.some((error) => error.includes('Overlapping')))

// Atomic adoption removes the old billing source and preserves the plug count.
f = fixture(); f.data.filterDrainReaches = [{ id: 'old-drain', fromChainage: 0, toChainage: 100, kind: '5-9', orientation: 'local', side: 'bed', width: .6, depth: .75, thickness: .1, spacing: 25, count: 7, material: { code: 'IRR-CAW-5-9' } }]
assert.ok(measure(f).errors.some((error) => error.includes('standalone')))
const adopted = lining.adoptStandaloneLiningDrainage(f.data, f.reach.id, 'old-drain')
assert.equal(adopted.filterDrainReaches.length, 0)
assert.equal(generated(adopted).filter((item) => item.itemCode === 'IRR-CAW-5-9').length, 1)
assert.equal(generated(adopted).find((item) => item.itemCode === 'IRR-CAW-5-9').computedQuantity, 7)

// JSON save/load retains all versioned fields; legacy reaches stay legacy.
const roundtrip = canal.migrateCanalData(JSON.parse(JSON.stringify(adopted)))
assert.equal(roundtrip.liningReaches[0].designV2.version, 2)
assert.equal(roundtrip.liningReaches[0].designV2.works[0].manualQuantity, 7)
const legacy = canal.migrateCanalData({ ...f.data, liningReaches: [canal.defaultCanalLiningReach(0, 100)] })
assert.equal(legacy.liningReaches[0].designV2, undefined)
const converted = lining.convertLegacyLining(legacy, legacy.liningReaches[0])
assert.equal(converted.drainageDecision, 'pending')
assert.ok(converted.works.some((work) => work.kind === 'profile-wall' && work.placement === 'quantity'), 'legacy profile walls retain their own named scope')
const reversed = canal.migrateCanalData({ ...adopted, liningReaches: [{ ...adopted.liningReaches[0], fromChainage: 80, toChainage: 20 }] })
assert.equal(reversed.liningReaches[0].fromChainage, 80, 'invalid new extents remain visible for correction')
assert.ok(lining.measureLiningWorksheet(reversed, reversed.liningReaches[0]).errors.length > 0)

// Explicit counts and returns cannot be duplicated by splitting.
f = fixture(); work(f, 'reinforcement', { manualQuantity: 25 })
assert.equal(lining.splitLiningReach(f.reach, 50).length, 1)
console.log('canal lining: item units, surfaces, layers, slab schedules, included scopes, split ownership, drainage assemblies, duplicate prevention, adoption and save/load passed')
