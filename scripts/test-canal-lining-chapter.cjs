const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const cns = require('../src/renderer/src/lib/canalCns.ts')
const lining = require('../src/renderer/src/lib/canalLiningChapter.ts')
const catalogue = require('../src/renderer/src/lib/canalLiningDesign.ts')
const near = (a,b) => assert.ok(Math.abs(a-b)<.002, `${a} != ${b}`)
function fixture(gl=104) {
  const data = {...canal.defaultCanalData(),lengthM:100,configured:true}
  data.design.bedLevelAtStart=100;data.design.bedSlope=0;data.strippingDepth=0
  data.sections=canal.materializeCanalSections(data,[]).map(s=>({...s,designPopulated:true,ground:[{offset:-30,rl:gl},{offset:30,rl:gl}],leftToeRl:gl,rightToeRl:gl}))
  const reach={...canal.defaultCanalLiningReach(0,100),cnsChapter:{...cns.defaultCnsChapter(),required:false,completed:true},liningChapter:lining.defaultLiningChapter()}
  const c=reach.liningChapter;c.surfaces=['bed'];c.membrane=false
  c.specifications.bed={...lining.defaultChapterSpec(),method:'concrete',placement:'paver',code:'IRR-CAW-7-6',thicknessMm:75,reinforced:false}
  data.liningReaches=[reach];return {data,reach,c,s:c.specifications.bed}
}
function generated(data) {
  return canal.syncCanalItems({id:'root',kind:'root',name:'Root',children:[{id:'c',kind:'component',name:'Canal',componentTemplate:'canal',canal:data,children:[]}]},'c').children[0].children.filter(i=>i.kind==='item')
}
let f=fixture(),q=lining.measureLiningChapter(f.data,f.reach)
assert.deepEqual(q.errors,[]);near(q.areas.bed,300);near(q.earthwork.excavation,22.5)
near(generated(f.data).find(i=>i.itemCode==='IRR-CAW-7-6').computedQuantity,300)
near(canal.canalEarthworkTotals(f.data).excavation-canal.canalEarthworkTotals({...f.data,liningReaches:[]}).excavation,22.5)
// Every concrete catalogue choice resolves its published unit and fixed thickness.
for(const spec of catalogue.LINING_SPECIFICATIONS.filter(r=>r.method==='concrete')) {
  f=fixture();Object.assign(f.s,{code:spec.code,placement:spec.paver?'paver':'conventional',thicknessMm:spec.thicknessMm??125})
  q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
  const item=generated(f.data).find(i=>i.itemCode===spec.code)
  near(item.computedQuantity,spec.paver?300:300*f.s.thicknessMm/1000)
}
// CNS is displaced behind the concrete. Extra excavation adds each physical layer once.
f=fixture();Object.assign(f.reach.cnsChapter,{required:true,coverage:'bed',bedThicknessMm:300,source:'borrow',compaction:98})
const cnsQ=cns.measureCnsReach(f.data,f.reach)
assert.deepEqual(cnsQ.errors,[]);near(cnsQ.rows[0].polygon[0].rl,99.925);near(cnsQ.cns,90)
near(cns.canalCnsTotals(f.data).excavation,112.5)
near(generated(f.data).find(i=>i.itemCode==='IRR-CAW-7-1').computedQuantity,90)
// Full-perimeter lining and CNS share corners; their areas equal one combined shell.
f=fixture();f.c.surfaces=['bed','left','right'];f.c.sameSpecification=true
Object.assign(f.reach.cnsChapter,{required:true,coverage:'bed-and-sides',bedThicknessMm:300,sideThicknessMm:200,source:'borrow',compaction:98})
const cq=cns.measureCnsReach(f.data,f.reach),lq=lining.measureLiningChapter(f.data,f.reach)
assert.deepEqual(cq.errors,[]);assert.deepEqual(lq.errors,[])
const combined=cns.measureTreatmentReach(f.data,f.reach,ch=>cns.treatmentLayerPolygon(f.data,ch,{bed:0,left:0,right:0},{bed:.375,left:.275,right:.275}))
near(cq.cns+lq.earthwork.cns,combined.cns)
near(cns.canalCnsTotals(f.data).excavation,combined.excavation)
near(canal.canalLiningTotals(f.data).liningBedArea,lq.areas.bed)
near(canal.canalLiningTotals(f.data).liningSlopeArea,lq.areas.left+lq.areas.right)
// Above-ground canals replace normal fill with both lining and CNS.
f=fixture(98);Object.assign(f.reach.cnsChapter,{required:true,coverage:'bed',bedThicknessMm:300,source:'borrow',compaction:98})
near(cns.canalCnsTotals(f.data).replacement,112.5)
near(canal.canalBankVolumeTotals({...f.data,liningReaches:[]}).homogeneous-canal.canalBankVolumeTotals(f.data).homogeneous,112.5)
// Steel quantity uses only the explicitly reinforced surfaces.
f=fixture();f.c.surfaces=['bed','left','right'];f.c.sameSpecification=true
Object.assign(f.s,{reinforced:true,steelSurfaces:['bed'],steelMode:'area',steelQuantity:4})
q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(generated(f.data).find(i=>i.itemCode==='IRR-CAW-7-5').computedQuantity,1200)
f.s.steelMode='schedule';f.s.steelQuantity=850;near(generated(f.data).find(i=>i.itemCode==='IRR-CAW-7-5').computedQuantity,850)
// LDPE code, area, and physical placement follow the chosen sheet thickness.
for(const [microns,code]of [[500,31],[750,32],[1000,33]]) {
  f=fixture();Object.assign(f.c,{membrane:true,membraneSurfaces:['bed'],membraneMicrons:microns})
  q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
  near(generated(f.data).find(i=>i.itemCode===`IRR-CAW-7-${code}`).computedQuantity,300)
  near(q.earthwork.excavation,22.5+300*microns/1e6)
}
// Mixed concrete bed and manufactured PCC sides; manufacturing and fixing remain separate.
f=fixture();f.c.surfaces=['bed','left'];f.c.sameSpecification=false
f.c.specifications.left={...lining.defaultChapterSpec(),method:'pcc',code:'IRR-CAW-7-38',thicknessMm:55,slabSource:'manufacture',slabCount:800,lugs:true,lugCode:'IRR-CAW-7-39',lugCount:100,lugLengthM:55}
q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
assert.equal(catalogue.LINING_SPECIFICATIONS.filter(spec=>spec.method==='pcc').length,4)
assert.equal(lining.suggestedPccSlabCount(13.5,[450,300,30]),100)
assert.equal(lining.suggestedPccSlabCount(13.51,[450,300,30]),101)
assert.equal(lining.suggestedPccSlabCount(0,[450,300,30]),null)
assert.equal(lining.suggestedPccSlabCount(q.areas.left,catalogue.LINING_SPECIFICATIONS.find(spec=>spec.code==='IRR-CAW-7-38').slabSize),Math.ceil(q.areas.left/(.55*.55)-1e-9))
assert.equal(lining.PCC_LUG_RECOMMENDATIONS['IRR-CAW-7-38'],'IRR-CAW-7-39')
assert.equal(lining.PCC_LUG_RECOMMENDATIONS['IRR-CAW-7-40'],'IRR-CAW-7-41')
assert.equal(lining.PCC_LUG_RECOMMENDATIONS['IRR-CAW-7-43'],'IRR-CAW-7-44')
assert.equal(lining.PCC_LUG_RECOMMENDATIONS['IRR-CAW-7-42'],undefined)
let items=generated(f.data)
near(items.find(i=>i.itemCode==='IRR-CAW-7-28').computedQuantity,q.areas.left)
near(items.find(i=>i.itemCode==='IRR-CAW-7-38').computedQuantity,800)
near(items.find(i=>i.itemCode==='IRR-CAW-7-39').computedQuantity,100)
near(items.find(i=>i.itemCode==='IRR-CAW-7-29').computedQuantity,55)
assert.equal(lining.suggestedPccLugCount(f.data,f.reach,f.c.specifications.left,['left']),100)
// A drawn full-reach lug line is measured from the reach extent, without typing RM.
f.c.specifications.left.lugLayout='along';f.c.specifications.left.lugRows={bed:null,left:2,right:null}
q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(i=>i.code==='IRR-CAW-7-29').quantity,200)
f.c.specifications.left.lugCode='IRR-CAW-7-41'
assert.equal(lining.suggestedPccLugCount(f.data,f.reach,f.c.specifications.left,['left']),446)
f.c.specifications.left.lugCode='IRR-CAW-7-39'
// Regular cross supports use each selected side's developed length at its chainage.
Object.assign(f.c.specifications.left,{lugLayout:'across',lugFirstChainage:10,lugSpacingM:30})
q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(i=>i.code==='IRR-CAW-7-29').quantity,4*(f.data.design.fullSupplyDepth+f.data.design.freeBoard)*Math.hypot(1,f.data.design.sideSlope))
assert.equal(lining.suggestedPccLugCount(f.data,f.reach,f.c.specifications.left,['left']),4*Math.ceil((f.data.design.fullSupplyDepth+f.data.design.freeBoard)*Math.hypot(1,f.data.design.sideSlope)/.55-1e-9))
f.c.specifications.left.lugSpacingM=0
assert.ok(lining.measureLiningChapter(f.data,f.reach).errors.some(e=>e.includes('spacing')))
assert.equal(lining.suggestedPccLugCount(f.data,f.reach,f.c.specifications.left,['left']),null)
f.c.specifications.left.lugLayout='approved';f.c.specifications.left.lugLengthM=55
f.c.specifications.left.lugCode='IRR-CAW-7-41'
assert.deepEqual(lining.measureLiningChapter(f.data,f.reach).errors,[])
f.c.specifications.left.lugCode='IRR-CAW-7-39'
assert.deepEqual(lining.measureLiningChapter(f.data,f.reach).errors,[])
f.c.specifications.left.code='IRR-CAW-7-42';f.c.specifications.left.thicknessMm=100
assert.deepEqual(lining.measureLiningChapter(f.data,f.reach).errors,[])
f.c.specifications.left.code='IRR-CAW-7-38';f.c.specifications.left.thicknessMm=55
f.c.specifications.left.slabSource='supplied';items=generated(f.data)
assert.equal(items.some(i=>i.itemCode==='IRR-CAW-7-38'||i.itemCode==='IRR-CAW-7-39'),false)
assert.ok(items.some(i=>i.itemCode==='IRR-CAW-7-28'))
// Side-only codes cannot be silently used on the bed.
f=fixture();Object.assign(f.s,{method:'masonry',code:'IRR-CAW-7-45',thicknessMm:300})
assert.ok(lining.measureLiningChapter(f.data,f.reach).errors.some(e=>e.includes('side lining only')))
assert.equal(generated(f.data).some(i=>i.itemCode==='IRR-CAW-7-45'),false)
// All masonry sources/specifications and stone slabs resolve by published measurement unit.
for(const spec of catalogue.LINING_SPECIFICATIONS.filter(r=>r.method==='masonry'||r.method==='stone')) {
  f=fixture();f.c.surfaces=['left'];f.c.specifications.left={...lining.defaultChapterSpec(),method:spec.method,code:spec.code,thicknessMm:spec.thicknessMm??(spec.method==='stone'?30:300)}
  q=lining.measureLiningChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
  near(generated(f.data).find(i=>i.itemCode===spec.code).computedQuantity,spec.method==='stone'?q.areas.left:q.areas.left*.3)
}
// Incomplete or overlapping chapter reaches cannot alter earthwork or bill lining.
f=fixture();f.c.membrane=null;near(cns.canalCnsTotals(f.data).excavation,0)
assert.equal(generated(f.data).some(i=>i.itemCode==='IRR-CAW-7-6'),false)
f=fixture();f.data.liningReaches.push({...f.reach,id:'other',fromChainage:50})
assert.ok(lining.measureLiningChapter(f.data,f.reach).errors.some(e=>e.includes('overlap')))
near(cns.canalCnsTotals(f.data).excavation,0)
// Reload preserves answers and completion; range errors remain errors.
f=fixture();f.c.completed=true
const restored=canal.migrateCanalData(JSON.parse(JSON.stringify(f.data)))
assert.deepEqual(restored.liningReaches[0].liningChapter,lining.normalizeLiningChapter(f.c))
assert.deepEqual(lining.measureLiningChapter(restored,restored.liningReaches[0]).errors,[])
f.reach.fromChainage=15;f.reach.toChainage=85;near(lining.measureLiningChapter(f.data,f.reach).earthwork.excavation,15.75)
f.data.sections[0].ground=[];assert.ok(lining.measureLiningChapter(f.data,f.reach).errors.length)
console.log('lining chapter 2: concrete variants, steel, LDPE, precast supply/fixing, mixed surfaces, CNS offsets, earthwork, exclusions and persistence passed')
