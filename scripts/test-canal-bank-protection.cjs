const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const protection = require('../src/renderer/src/lib/canalBankProtection.ts')
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.01, `${label}: expected ${expected}, got ${actual}`)
const spec = (patch = {}) => ({ ...protection.defaultBankProtection(), kind: 'stone', ...patch })
function fixture(ground = 100) {
  const data = canal.defaultCanalData()
  data.configured = true
  data.lengthM = 100
  data.design.bedLevelAtStart = 100
  data.design.bedSlope = 0
  data.design.bankConfig = canal.defaultCanalBankDesignConfig()
  data.design.bankConfig.leftTiers[0].bankProtection = spec()
  data.sections = [0, 100].map((chainage) => ({ id: `s${chainage}`, chainage, ground: [{ offset: -100, rl: ground }, { offset: 100, rl: ground }], designPopulated: true }))
  return data
}
const data = fixture()
const slope = Math.hypot(2.1, 2.1 * 1.5)
near(protection.bankProtectionSlopeLength(data, data.sections[0], 'left'), slope, 'actual developed slope')
const quantities = protection.bankProtectionQuantities(data)
assert.equal(quantities.length, 2, 'linked specification applies to both banks')
near(quantities.reduce((sum, row) => sum + row.area, 0), slope * 200, 'slope area over reach')
assert.equal(quantities[0].code, 'IRR-CAW-8-1')

const codes = new Set()
for (const thickness of [0.225, 0.25, 0.3, 0.45]) for (const headers of [true, false]) codes.add(protection.bankProtectionCode(spec({ thickness, headers })))
for (const headers of [true, false]) codes.add(protection.bankProtectionCode(spec({ bedding: 'mortar', thickness: 0.3, headers })))
for (const bedding of ['dry', 'mortar']) for (const thickness of [0.3, 0.45]) codes.add(protection.bankProtectionCode(spec({ stone: 'khandki', bedding, thickness })))
for (const sand of [true, false]) codes.add(protection.bankProtectionCode(spec({ kind: 'grass', sand })))
assert.equal(codes.size, 16, 'all sixteen CAW 8 items resolve')
assert.equal(protection.bankProtectionCode(spec({ stone: 'khandki', headers: false })), null, 'unsupported combinations do not invent codes')
assert.equal(protection.bankProtectionCode(spec({ bedding: 'mortar' })), null)
assert.equal(protection.bankProtectionCode(spec({ kind: 'none' })), null)

const independent = fixture()
independent.design.bankConfig.linkSymmetrical = false
assert.equal(protection.bankProtectionQuantities(independent).length, 1, 'independent right bank is not silently protected')
independent.design.bankConfig.rightTiers[0].bankProtection = spec({ kind: 'grass', sand: false })
assert.deepEqual(protection.bankProtectionQuantities(independent).map((row) => row.code), ['IRR-CAW-8-1', 'IRR-CAW-8-16'])

assert.deepEqual(protection.bankProtectionQuantities(fixture(110)), [], 'cutting-only sections have no bund protection')
const missing = fixture()
missing.sections[1].designPopulated = false
assert.deepEqual(protection.bankProtectionQuantities(missing), [], 'missing section geometry does not create estimates')
const maintenance = fixture()
maintenance.design.bankConfig.leftTiers[0].bankProtection = spec({ thickness: 0.225 })
assert.deepEqual(protection.bankProtectionQuantities(maintenance), [], 'maintenance thickness excluded from new work')
maintenance.mode = 'repair'
assert.equal(protection.bankProtectionQuantities(maintenance)[0].code, 'IRR-CAW-8-2')

const transition = fixture()
transition.sections[1].ground.forEach((point) => { point.rl = 98 })
transition.sections.splice(1,0,{...transition.sections[0],id:'s50',chainage:50,ground:[{offset:-100,rl:99},{offset:100,rl:99}]})
transition.design.bankConfig.leftTiers[1].bankProtection = spec({ kind: 'grass' })
const split = protection.bankProtectionQuantities(transition)
const lowEnd = 50
const lowExpected = (2.1 + 3.1) / 2 * Math.hypot(1, 1.5) * lowEnd
near(split.find((row) => row.side === 'left' && row.tierId === 'tier-low').area, lowExpected, 'tier change uses the entered section at 50 m')
const mediumExpected = ((3 * Math.hypot(1, 1.5) + 0.1 * Math.hypot(1, 2)) + (3 * Math.hypot(1, 1.5) + 1.1 * Math.hypot(1, 2))) / 2 * (100 - lowEnd)
near(split.find((row) => row.side === 'left' && row.tierId === 'tier-medium').area, mediumExpected, 'horizontal berm omitted from slope area')

const road = fixture()
road.design.serviceRoadReaches = [{ id: 'road', fromChainage: 20, toChainage: 80, side: 'left', heightMode: 'tbl', heightAboveBed: 2.1, width: 8, shoulderWidth: 1, constructionType: 'earthen' }]
near(protection.bankProtectionQuantities(road).reduce((sum, row) => sum + row.area, 0), slope * 200, 'wider crest road adds no pitching area')

const root = { id: 'r', kind: 'title', name: 'R', children: [{ id: 'c', kind: 'component', name: 'C', canal: data, children: [] }] }
const synced = canal.syncCanalItems(root, 'c')
const billed = synced.children[0].children.filter((item) => item.templateItemRole === 'bank-protection')
assert.equal(billed.length, 1, 'same code on both banks is billed once')
near(billed[0].computedQuantity, slope * 200, 'estimate quantity matches measured area')
assert.equal(canal.syncCanalItems(synced, 'c').children[0].children.filter((item) => item.templateItemRole === 'bank-protection').length, 1, 'repeat sync does not duplicate')
const changed = JSON.parse(JSON.stringify(synced))
changed.children[0].canal.design.bankConfig.leftTiers[0].bankProtection.kind = 'none'
assert.equal(canal.syncCanalItems(changed, 'c').children[0].children.filter((item) => item.templateItemRole === 'bank-protection').length, 0, 'turning off protection removes generated item')
assert.deepEqual(canal.migrateCanalData(JSON.parse(JSON.stringify(data))).design.bankConfig.leftTiers[0].bankProtection, spec(), 'selection survives save and migration')
// Distinct chainage reaches sharing a height tier must not share edits.
const reachLib = require('../src/renderer/src/lib/canalTierReaches.ts')
let perReach = fixture(98)
perReach.sections.splice(1,0,{...perReach.sections[0],id:'s40',chainage:40})
perReach.design.bankConfig.leftReachOverrides = [
  {id:'r1',from:0,to:40,tierId:'tier-low',status:'fill'},
  {id:'r2',from:40,to:100,tierId:'tier-low',status:'fill'}
]
perReach.design.bankConfig.leftTiers[0].bankProtection = protection.defaultBankProtection()
perReach.design.bankConfig.leftTiers[0].berms = [{id:'berm',dropHeight:1,shelfWidth:2,slopeAfterBerm:1.5}]
const r1 = reachLib.canalBankReaches(perReach,'left').find(r=>r.id==='r1')
const r2 = reachLib.canalBankReaches(perReach,'left').find(r=>r.id==='r2')
perReach = protection.saveBankReachProtection(perReach,'left',r1,{slopes:spec(),berms:spec({kind:'grass',sand:false})})
assert.equal(protection.bankProtectionForReach(perReach,'left',r2).slopes.kind,'none','same-tier neighbour stays unchanged')
assert.equal(protection.bankProtectionAt(perReach,{...perReach.sections[0],chainage:40},'left').slopes.kind,'none','shared boundary belongs to following reach')
const local = protection.bankProtectionQuantities(perReach)
assert.equal(local.length,4,'two surfaces measured on both linked banks only for selected reach')
assert.ok(local.every(row=>row.from===0 && row.to===40),'protection respects exact reach endpoints')
near(local.filter(row=>row.surface==='berms').reduce((sum,row)=>sum+row.area,0),2*40*2,'berm width times selected reach length, both banks')
near(local.filter(row=>row.surface==='slopes').reduce((sum,row)=>sum+row.area,0),4.1*Math.hypot(1,1.5)*40*2,'slopes do not include berm shelves')
const protectedRoot = { ...root, children:[{...root.children[0],canal:perReach,children:[]}] }
const billedLocal = canal.syncCanalItems(protectedRoot,'c').children[0].children.filter(item=>item.templateItemRole==='bank-protection')
assert.equal(billedLocal.length,2,'slope and berm treatment codes become generated estimate items')
assert.ok(billedLocal.some(item=>Math.abs(item.computedQuantity-160)<0.01),'berm item uses reach quantity')
assert.deepEqual(canal.migrateCanalData(JSON.parse(JSON.stringify(perReach))).design.bankConfig.leftReachProtection,perReach.design.bankConfig.leftReachProtection,'reach protection survives save/load')

// Manual reaches keep their exact ranges, including a gap; no height classification is needed.
let manual = fixture(98)
manual.design.bankConfig.mode='manual'
manual.design.bankConfig.leftTiers[0].bankProtection=protection.defaultBankProtection()
manual.design.bankConfig.leftManualReaches=[{id:'m1',from:0,to:23,tierId:'tier-low',status:'fill'},{id:'m2',from:30,to:60,tierId:'tier-low',status:'fill'}]
manual.design.bankConfig.linkSymmetrical=false
manual.design.bankConfig.rightManualReaches=[{id:'right',from:0,to:100,tierId:'tier-low',status:'fill'}]
const m1=reachLib.canalBankReaches(manual,'left').find(r=>r.id==='m1')
manual=protection.saveBankReachProtection(manual,'left',m1,{slopes:spec({kind:'grass'}),berms:protection.defaultBankProtection()})
assert.equal(protection.bankProtectionAt(manual,{...manual.sections[0],chainage:25},'left').slopes.kind,'none','manual gap receives no protection')
assert.equal(protection.bankProtectionAt(manual,manual.sections[0],'right').slopes.kind,'none','independent right bank unchanged')
near(protection.bankProtectionQuantities(manual).reduce((sum,row)=>sum+row.area,0),4.1*Math.hypot(1,1.5)*23,'manual protection measured only over 0–23 m')
const endPreview={...manual.sections[0],chainage:23,bankReachLookupChainageBySide:{left:10}}
assert.equal(protection.bankProtectionAt(manual,endPreview,'left').slopes.kind,'grass','selected reach endpoint preview retains selected treatment')
manual={...manual,design:{...manual.design,bankConfig:{...manual.design.bankConfig,leftManualReaches:manual.design.bankConfig.leftManualReaches.map(r=>r.id==='m1'?{...r,to:24}:r)}}}
assert.equal(protection.bankProtectionAt(manual,{...manual.sections[0],chainage:23},'left').slopes.kind,'grass','manual treatment follows edited reach identity')
assert.equal(protection.bankProtectionSectionAt(manual,23).chainage,23,'preview uses exact requested chainage')
assert.equal(protection.bankProtectionSectionAt(manual,101),undefined,'preview does not extrapolate outside survey')
let automatic=fixture(100)
automatic.design.bankConfig.leftTiers[0].bankProtection=protection.defaultBankProtection()
const automaticReach=reachLib.canalBankReaches(automatic,'left')[0]
automatic=protection.saveBankReachProtection(automatic,'left',automaticReach,{slopes:spec({kind:'grass'}),berms:protection.defaultBankProtection()})
assert.equal(protection.bankProtectionAt(automatic,automatic.sections[0],'right').slopes.kind,'grass','automatic linked right bank uses same range despite its distinct reach ID')
automatic={...automatic,sections:[automatic.sections[0],{...automatic.sections[1],id:'s50',chainage:50,ground:[{offset:-100,rl:98},{offset:100,rl:98}]},automatic.sections[1]]}
assert.equal(protection.bankProtectionAt(automatic,automatic.sections[0],'left').slopes.kind,'none','regenerated automatic indices cannot transfer old treatment to a different range')
console.log('Canal bank protection tests passed')
