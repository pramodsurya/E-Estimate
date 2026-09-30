const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const lining = require('../src/renderer/src/lib/canalLiningChapter.ts')
const cns = require('../src/renderer/src/lib/canalCns.ts')
const relief = require('../src/renderer/src/lib/canalRelief.ts')

const data = { ...canal.defaultCanalData(), lengthM: 100, configured: true }
data.design.bedLevelAtStart = 100
data.design.bedSlope = 0
data.sections = canal.materializeCanalSections(data, []).map(section => ({ ...section, designPopulated: true, ground: [{ offset: -30, rl: 104 }, { offset: 30, rl: 104 }], leftToeRl: 104, rightToeRl: 104 }))
const reach = { ...canal.defaultCanalLiningReach(0, 100), cnsChapter: { ...cns.defaultCnsChapter(), required: false }, liningChapter: lining.defaultLiningChapter(), reliefChapter: relief.defaultReliefChapter() }
reach.liningChapter.surfaces = ['bed', 'left']
reach.liningChapter.sameSpecification = true
reach.liningChapter.membrane = false
reach.liningChapter.specifications.bed = { ...lining.defaultChapterSpec(), method: 'concrete', placement: 'conventional', code: 'IRR-CAW-7-15', thicknessMm: 100, reinforced: false }
reach.reliefChapter.required = true
const gi = relief.newReliefOutlet('gi', 'gi-1')
Object.assign(gi, { surfaces: ['bed'], code: 'IRR-CAW-7-19', placement: 'spacing', firstChainage: 10, spacingM: 10, rockHoleCount: 2, filterPocketCount: 3 })
const pvc = relief.newReliefOutlet('pvc', 'pvc-1')
Object.assign(pvc, { surfaces: ['left'], placement: 'chainages', chainagesText: '15, 35, 35' })
reach.reliefChapter.outlets = [gi, pvc]
data.liningReaches = [reach]
const generated = () => canal.syncCanalItems({ id: 'root', kind: 'root', name: 'Root', children: [{ id: 'c', kind: 'component', name: 'Canal', componentTemplate: 'canal', canal: data, children: [] }] }, 'c').children[0].children.filter(item => item.kind === 'item')
let measured = relief.measureReliefChapter(data, reach)
assert.deepEqual(measured.errors, [])
assert.deepEqual(Object.fromEntries(measured.lines.map(line => [line.code, line.quantity])), { 'IRR-CAW-7-19': 10, 'IRR-CAW-7-25': 2, 'IRR-CAW-7-26': 3, 'IRR-CAW-7-24': 2 })
for (const line of measured.lines) assert.equal(generated().find(item => item.itemCode === line.code).computedQuantity, line.quantity)
assert.equal(relief.reliefOutletLocations(reach, gi).locations.length, 10)
gi.spacingM = 0
assert.ok(relief.measureReliefChapter(data, reach).errors.some(error => error.includes('positive outlet spacing')))
assert.equal(generated().some(item => item.itemCode === 'IRR-CAW-7-19'), false)
gi.spacingM = 10
const duplicate = relief.newReliefOutlet('pvc', 'pvc-duplicate')
Object.assign(duplicate, { surfaces: ['bed'], placement: 'chainages', chainagesText: '10' })
reach.reliefChapter.outlets.push(duplicate)
assert.ok(relief.measureReliefChapter(data, reach).errors.some(error => error.includes('already scheduled')))
reach.reliefChapter.outlets.pop()
const drain = { id: 'bed-1', fromChainage: 0, toChainage: 100, kind: '5-8', orientation: 'longitudinal', side: 'bed', width: 0.6, depth: 0.75, thickness: 0.1, spacing: 25, count: 1, crossDrainLength: data.design.bedWidth, system: 'bed-drainage', coverage: 'selected', placementMode: 'spacing', material: { code: 'IRR-CAW-5-8' } }
data.filterDrainReaches = [drain]
assert.equal(relief.reliefDrainWorksForReach(data, reach).length, 1)
assert.equal(generated().filter(item => item.itemCode === 'IRR-CAW-5-8').length, 1)
assert.equal(generated().find(item => item.itemCode === 'IRR-CAW-5-8').computedQuantity, 100)
const sharedPlug = { ...drain, id: 'plug-shared', kind: '5-9', system: 'porous-plug', orientation: 'local', fromChainage: 0, toChainage: 100, spacing: 25, placementMode: 'spacing', plugLocations: ['bed'], material: { code: 'IRR-CAW-5-9' } }
data.filterDrainReaches.push(sharedPlug)
const firstHalf = { ...reach, toChainage: 50 }
const secondHalf = { ...reach, fromChainage: 50 }
assert.equal(relief.drainQuantityWithinReach(data, sharedPlug, firstHalf), 2)
assert.equal(relief.drainQuantityWithinReach(data, sharedPlug, secondHalf), 3)
assert.equal(generated().filter(item => item.itemCode === 'IRR-CAW-5-9').length, 1)
assert.equal(generated().find(item => item.itemCode === 'IRR-CAW-5-9').computedQuantity, 5)
sharedPlug.spacing = 0
assert.ok(relief.measureReliefChapter(data, reach).errors.some(error => error.includes('Drainage spacing must be positive')))
sharedPlug.spacing = 25
reach.reliefChapter.completed = true
const restored = canal.migrateCanalData(JSON.parse(JSON.stringify(data)))
assert.deepEqual(restored.liningReaches[0].reliefChapter, relief.normalizeReliefChapter(reach.reliefChapter))
console.log('chapter 4 relief: CAW 7 codes, scheduled counts, included CAW 5 drainage, duplicate prevention and persistence passed')
