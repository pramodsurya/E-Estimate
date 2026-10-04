const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const cns = require('../src/renderer/src/lib/canalCns.ts')
const near = (a,b) => assert.ok(Math.abs(a-b)<.002, `${a} != ${b}`)
function fixture(gl=104) {
  const data = {...canal.defaultCanalData(),lengthM:100,configured:true}
  data.design.bedLevelAtStart=100; data.design.bedSlope=0;data.strippingDepth=0
  data.sections=canal.materializeCanalSections(data,[]).map(s=>({...s,designPopulated:true,ground:[{offset:-30,rl:gl},{offset:30,rl:gl}],leftToeRl:gl,rightToeRl:gl}))
  const reach={...canal.defaultCanalLiningReach(0,100),cnsChapter:{...cns.defaultCnsChapter(),required:true,coverage:'bed',bedThicknessMm:300,source:'borrow',compaction:98}}
  data.liningReaches=[reach];return {data,reach,c:reach.cnsChapter}
}
function generated(data) {
  return canal.syncCanalItems({id:'root',kind:'root',name:'Root',children:[{id:'c',kind:'component',name:'Canal',componentTemplate:'canal',canal:data,children:[]}]},'c').children[0].children.filter(i=>i.kind==='item')
}
let f=fixture(),q=cns.measureCnsReach(f.data,f.reach)
assert.deepEqual(q.errors,[]);near(q.cns,90);near(q.excavation,90);near(q.replacement,0)
near(canal.canalEarthworkTotals(f.data).excavation-canal.canalEarthworkTotals({...f.data,liningReaches:[]}).excavation,90)
let items=generated(f.data)
near(items.find(i=>i.itemCode==='IRR-CAW-7-1').computedQuantity,90)
assert.equal(items.some(i=>i.itemCode==='IRR-CAW-7-6'),false)
near(items.find(i=>i.itemCode==='IRR-CAW-1-1').computedQuantity,canal.canalEarthworkTotals(f.data).excavation)
f.c.compaction=95;assert.equal(cns.measureCnsReach(f.data,f.reach).code,'IRR-CAW-7-2')
f.c.source='excavated-heaps';assert.equal(cns.measureCnsReach(f.data,f.reach).code,'IRR-CAW-7-3')
f.c.required=false;near(cns.canalCnsTotals(f.data).cns,0);assert.equal(generated(f.data).some(i=>i.itemCode.startsWith('IRR-CAW-7-')),false)
f=fixture(98);q=cns.measureCnsReach(f.data,f.reach);assert.deepEqual(q.errors,[]);near(q.replacement,90);near(q.excavation,0)
near(canal.canalBankVolumeTotals({...f.data,liningReaches:[]}).homogeneous-canal.canalBankVolumeTotals(f.data).homogeneous,90)
f=fixture(99.85);q=cns.measureCnsReach(f.data,f.reach);near(q.excavation,45);near(q.replacement,45)
f=fixture();f.c.coverage='bed-and-sides';f.c.sideThicknessMm=200
q=cns.measureCnsReach(f.data,f.reach);assert.deepEqual(q.errors,[]);assert.ok(q.cns>90);near(q.excavation,q.cns)
// Signed polygon area agrees with measured area: joined corners occur once.
const p=q.rows[0].polygon;let area=0
for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a.offset*b.rl-b.offset*a.rl}
near(q.rows[0].cns,Math.abs(area)/2)
// Arbitrary reach limits interpolate sections, preserving volume and geology.
f=fixture();f.reach.fromChainage=15;f.reach.toChainage=85;q=cns.measureCnsReach(f.data,f.reach)
assert.deepEqual(q.errors,[]);near(q.cns,63);assert.equal(q.rows[0].chainage,15);assert.equal(q.rows.at(-1).chainage,85)
f=fixture();f.data.sections[0].ground=[];assert.ok(cns.measureCnsReach(f.data,f.reach).errors.length);near(cns.canalCnsTotals(f.data).cns,0)
f=fixture();f.c.compaction=null;assert.ok(cns.measureCnsReach(f.data,f.reach).errors.length);near(cns.canalCnsTotals(f.data).cns,0)
// CNS crosses the soil/rock boundary and bills only its additional cut by class.
f=fixture(100.2);f.c.bedThicknessMm=400
f.data.sections.forEach(s=>{s.strata=[{id:'soil',name:'Soil',thickness:.4,slope:1.5},{id:'rock',name:'Rock',thickness:5,slope:1.5}]})
q=cns.measureCnsReach(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.excavationByCode['IRR-CAW-1-1'],60);near(q.excavationByCode['IRR-CAW-1-4'],60)
items=generated(f.data);near(items.find(i=>i.itemCode==='IRR-CAW-1-4').computedQuantity,60)
f=fixture();f.data.liningReaches.push({...f.reach,id:'overlap',fromChainage:50})
assert.ok(cns.measureCnsReach(f.data,f.reach).errors.some(e=>e.includes('overlap')));near(cns.canalCnsTotals(f.data).cns,0)
f=fixture();const restored=canal.migrateCanalData(JSON.parse(JSON.stringify(f.data)))
assert.deepEqual(restored.liningReaches[0].cnsChapter,cns.normalizeCnsChapter(f.c));near(cns.canalCnsTotals(restored).cns,90)
f.reach.toChainage=-1;assert.equal(canal.migrateCanalData(f.data).liningReaches[0].toChainage,-1)
// Already counted foundation removal is never billed again as additional cut.
f=fixture();f.data.foundationExcavationReaches=[{id:'foundation',kind:'excavation',fromChainage:0,toChainage:100,foundationRl:99,bands:[]}]
q=cns.measureCnsReach(f.data,f.reach);near(q.excavation,90) // bed lies outside the bank foundation footprint
// Inner shelves are part of the side treatment and retain joined corners.
f=fixture();f.c.coverage='bed-and-sides';f.c.sideThicknessMm=200
f.data.design.berms=[{id:'shelf',face:'left-canal',heightAboveBed:1,width:.5}]
q=cns.measureCnsReach(f.data,f.reach);assert.deepEqual(q.errors,[]);near(q.cns,q.excavation)
// In zoned banks, replacement is taken from the actual hearting/casing regions.
f=fixture(98);f.c.coverage='bed-and-sides';f.c.sideThicknessMm=400
f.data.design.bankSectionType='zoned';f.data.design.zonedReaches=[{id:'z',fromChainage:0,toChainage:100}]
f.data.design.minimumHeartingHeight=0
q=cns.measureCnsReach(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.zones.hearting+q.zones.casing,q.replacement);near(q.zones.homogeneous,0)
const before=canal.canalBankVolumeTotals({...f.data,liningReaches:[]}),after=canal.canalBankVolumeTotals(f.data)
near(before.hearting-after.hearting,q.zones.hearting);near(before.casing-after.casing,q.zones.casing)
console.log('canal CNS: SSR decisions, section polygons, cut/fill replacement, geology, arbitrary reaches, overlap and persistence passed')

const erm = require('../src/renderer/src/lib/canalErm.ts')
const ermFixture = fixture(110)
const ermRows = ermFixture.data.sections.map((section) => ({ chainage: section.chainage, topRl: 110, bottoms: [108, null, 103], end: 'hard-rock' }))
const ermKnown = erm.applyErmRows(ermFixture.data, ermRows)
const ermKnownQuantity = cns.measureCnsReach(ermKnown, ermFixture.reach)
assert.deepEqual(ermKnownQuantity.errors, [], 'CNS uses saved ERM top datum and continuing rock')
assert.ok(ermKnownQuantity.excavationByCode[canal.CANAL_EXC_HR_CODE] > 0, 'CNS preparation below ERM hard rock start resolves to hard rock')
const ermUnknown = erm.applyErmRows(ermFixture.data, ermRows.map((row) => ({ ...row, end: 'unknown' })))
const continuedCns = cns.measureCnsReach(ermUnknown, ermFixture.reach)
assert.deepEqual(continuedCns.errors, [], 'CNS excavation uses continued deepest material')
assert.ok(continuedCns.excavationByCode['IRR-CAW-1-6'] > 0, 'continued F&F resolves its excavation code')
assert.ok(!continuedCns.excavationByCode[canal.CANAL_EXC_HR_CODE], 'absent hard rock is not charged')

const customErmCns = erm.addErmColumn(ermKnown, { id: 'extra', name: 'Murrum', excavationClass: 'all-soils' }, 1)
const customErmCnsQuantity = cns.measureCnsReach(customErmCns, ermFixture.reach)
assert.deepEqual(customErmCnsQuantity.errors, [], 'CNS remains classified after adding a material column')
near(customErmCnsQuantity.excavationByCode[canal.CANAL_EXC_HR_CODE], ermKnownQuantity.excavationByCode[canal.CANAL_EXC_HR_CODE])
