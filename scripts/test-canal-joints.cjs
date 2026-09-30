const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
require.extensions['.ts']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:filename}).outputText,filename)
const canal=require('../src/renderer/src/lib/canal.ts')
const lining=require('../src/renderer/src/lib/canalLiningChapter.ts')
const cns=require('../src/renderer/src/lib/canalCns.ts')
const joints=require('../src/renderer/src/lib/canalJoints.ts')
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`)
function fixture(){
  const data={...canal.defaultCanalData(),lengthM:100,configured:true}
  data.design.bedLevelAtStart=100;data.design.bedSlope=0;data.strippingDepth=0
  data.sections=canal.materializeCanalSections(data,[]).map(s=>({...s,designPopulated:true,ground:[{offset:-30,rl:104},{offset:30,rl:104}],leftToeRl:104,rightToeRl:104}))
  const reach={...canal.defaultCanalLiningReach(0,100),cnsChapter:{...cns.defaultCnsChapter(),required:false},liningChapter:lining.defaultLiningChapter(),jointsChapter:joints.defaultJointsChapter()}
  const c=reach.liningChapter;c.surfaces=['bed','left','right'];c.sameSpecification=true;c.membrane=false
  c.specifications.bed={...lining.defaultChapterSpec(),method:'concrete',placement:'conventional',code:'IRR-CAW-7-15',thicknessMm:100,reinforced:false}
  const j=reach.jointsChapter;j.required=true
  Object.assign(j.mastic,{enabled:true,surfaces:['bed','left','right'],direction:'transverse',placement:'spacing',firstChainage:10,spacingM:10})
  data.liningReaches=[reach];return {data,reach,j,c}
}
function generated(data){return canal.syncCanalItems({id:'root',kind:'root',name:'Root',children:[{id:'c',kind:'component',name:'Canal',componentTemplate:'canal',canal:data,children:[]}]},'c').children[0].children.filter(i=>i.kind==='item')}
let f=fixture(),q=joints.measureJointsChapter(f.data,f.reach)
assert.deepEqual(q.errors,[]);assert.equal(q.works[0].locations.length,10)
const side=(f.data.design.fullSupplyDepth+f.data.design.freeBoard)*Math.hypot(1,f.data.design.sideSlope)
near(q.totalLength,10*(3+2*side));near(q.works[0].rows[0].lengths.bed,3)
near(generated(f.data).find(i=>i.itemCode==='IRR-CAW-7-37').computedQuantity,q.totalLength)
// Joints must not inflate excavation or change ordinary fill/CNS treatment.
const baseline={...f.data,liningReaches:[{...f.reach,jointsChapter:undefined}]}
near(canal.canalEarthworkTotals(f.data).excavation,canal.canalEarthworkTotals(baseline).excavation)
assert.deepEqual(canal.canalBankVolumeTotals(f.data),canal.canalBankVolumeTotals(baseline));assert.equal(q.extraExcavation,0)
// Paver contraction joints/strips cannot bill an unconfirmed duplicate mastic scope.
f.c.specifications.bed.placement='paver';f.c.specifications.bed.code='IRR-CAW-7-8'
q=joints.measureJointsChapter(f.data,f.reach);assert.ok(q.errors.some(e=>e.includes('includes contraction joints')))
assert.equal(generated(f.data).some(i=>i.itemCode==='IRR-CAW-7-37'),false)
f.j.mastic.distinctScope=true;assert.deepEqual(joints.measureJointsChapter(f.data,f.reach).errors,[])
// No means no separate item, irrespective of previously saved work cards.
f.j.required=false;assert.deepEqual(joints.measureJointsChapter(f.data,f.reach).lines,[])
assert.equal(generated(f.data).some(i=>i.itemCode==='IRR-CAW-7-37'),false)
// Explicit location parsing deduplicates numbers and never drops malformed/outside entries silently.
f=fixture();Object.assign(f.j.mastic,{placement:'locations',locationsText:'10, 10 20\n30'})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.works[0].locations,[10,20,30])
f.j.mastic.locationsText='10, not-a-number';assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.length)
f.j.mastic.locationsText='10, 101';assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.length)
f=fixture();f.j.mastic.spacingM=0;assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.length)
f.j.mastic.spacingM=.0001;assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.some(e=>e.includes('10,000')))
// All three expansion-board codes resolve from selected lining specifications.
f=fixture();f.j.mastic.enabled=false;Object.assign(f.j.expansion,{...f.j.mastic,enabled:true})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[]);assert.equal(q.lines[0].code,'IRR-CAW-7-35')
Object.assign(f.c.specifications.bed,{code:'IRR-CAW-7-14',thicknessMm:150})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[]);assert.equal(q.lines[0].code,'IRR-CAW-7-36')
Object.assign(f.c.specifications.bed,{code:'IRR-CAW-7-6',placement:'paver',thicknessMm:75})
assert.equal(joints.jointSurfaceCode(f.reach,'expansion','bed'),null)
f=fixture();f.c.sameSpecification=false;f.c.surfaces=['bed','left']
f.c.specifications.left={...lining.defaultChapterSpec(),method:'masonry',code:'IRR-CAW-7-45',thicknessMm:300}
f.j.mastic.enabled=false;Object.assign(f.j.expansion,{enabled:true,surfaces:['bed','left'],direction:'transverse',placement:'locations',locationsText:'10,20'})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(l=>l.code==='IRR-CAW-7-35').quantity,6);near(q.lines.find(l=>l.code==='IRR-CAW-7-34').quantity,2*side)
// Longitudinal lengths come from surface schedules and remain grouped by the appropriate codes.
Object.assign(f.j.expansion,{direction:'longitudinal',longitudinalLengths:{bed:200,left:350,right:null}})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(l=>l.code==='IRR-CAW-7-35').quantity,200);near(q.lines.find(l=>l.code==='IRR-CAW-7-34').quantity,350)
// Full-reach longitudinal lines derive RM from count and reach length.
Object.assign(f.j.expansion,{longitudinalMode:'full',longitudinalLines:{bed:2,left:3,right:null}})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(l=>l.code==='IRR-CAW-7-35').quantity,200);near(q.lines.find(l=>l.code==='IRR-CAW-7-34').quantity,300)
// Different partial intervals on each surface are summed from their chainages.
Object.assign(f.j.expansion,{longitudinalMode:'parts',longitudinalRuns:{bed:[{fromChainage:10,toChainage:40,lines:2},{fromChainage:60,toChainage:80,lines:1}],left:[{fromChainage:20,toChainage:70,lines:3}],right:[]}})
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
near(q.lines.find(l=>l.code==='IRR-CAW-7-35').quantity,80);near(q.lines.find(l=>l.code==='IRR-CAW-7-34').quantity,150)
f.j.expansion.longitudinalRuns.left[0].toChainage=110
assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.some(e=>e.includes('within this reach')))
f.j.expansion.longitudinalMode='approved';f.j.expansion.longitudinalRuns.left[0].toChainage=70
near(joints.measureJointsChapter(f.data,f.reach).totalLength,550)
// Spatially identical mastic and expansion locations cannot double bill.
f=fixture();Object.assign(f.j.expansion,{...f.j.mastic,enabled:true})
assert.ok(joints.measureJointsChapter(f.data,f.reach).errors.some(e=>e.includes('overlap')))
// A scheduled shared boundary belongs to the following reach once, surface by surface.
f=fixture();f.reach.toChainage=50
const next=JSON.parse(JSON.stringify(f.reach));next.id='next';next.fromChainage=50;next.toChainage=100;next.jointsChapter.mastic.firstChainage=50
f.data.liningReaches.push(next)
q=joints.measureJointsChapter(f.data,f.reach);assert.deepEqual(q.errors,[])
assert.deepEqual(q.works[0].rows.at(-1).shared,['bed','left','right']);near(q.works[0].rows.at(-1).total,0)
const nextQ=joints.measureJointsChapter(f.data,next);assert.deepEqual(nextQ.errors,[])
near(q.totalLength+nextQ.totalLength,10*(3+2*side))
// An invalid following worksheet cannot steal a billable boundary from the valid reach.
next.jointsChapter.expansion={...next.jointsChapter.mastic,enabled:true}
q=joints.measureJointsChapter(f.data,f.reach)
assert.deepEqual(q.errors,[]);assert.deepEqual(q.works[0].rows.at(-1).shared,[])
near(q.works[0].rows.at(-1).total,3+2*side)
// Joint types can change at a boundary; the following valid detail still owns the line.
next.jointsChapter.mastic.enabled=false
q=joints.measureJointsChapter(f.data,f.reach)
assert.deepEqual(q.works[0].rows.at(-1).shared,['bed','left','right'])
// Save/reload preserves layouts and completion, and range changes remain validated.
f=fixture();f.j.completed=true
const restored=canal.migrateCanalData(JSON.parse(JSON.stringify(f.data)))
assert.deepEqual(restored.liningReaches[0].jointsChapter,joints.normalizeJointsChapter(f.j))
near(joints.measureJointsChapter(restored,restored.liningReaches[0]).totalLength,joints.measureJointsChapter(f.data,f.reach).totalLength)
console.log('chapter 3 joints: RM geometry, SSR codes, paver inclusion, schedules, boundaries, duplicate prevention, excavation invariance and persistence passed')
