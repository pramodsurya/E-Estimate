const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file)
const canal = require('../src/renderer/src/lib/canal.ts')
const drainage = require('../src/renderer/src/lib/canalDrainageDesign.ts')
const protection = require('../src/renderer/src/lib/canalBankProtection.ts')
const { buildCanalBankExportInput, buildCanalBankSectionInput } = require('../src/renderer/src/lib/canalBankExport.ts')
const { measureCanalBankSection, measureCanalBankQuantities, canalBankReachSummary } = require('../src/renderer/src/lib/canalBankSection.ts')
function fixture() {
  const data = canal.defaultCanalData()
  data.configured = true; data.lengthM = 400
  data.design.bedLevelAtStart = 100; data.design.bedSlope = 0
  data.sections = [0,100,200,300,400].map(chainage => ({ id: `s${chainage}`,chainage, designPopulated:true,
    ground:[{offset:-80,rl:98},{offset:80,rl:98}],strataTopRl:100 }))
  data.design.bankConfig.leftTiers = data.design.bankConfig.leftTiers.map(t=>({...t,sectionType:'homogeneous',berms:[]}))
  return data
}
const cases = []
function check(name,data,checkOutput) {
  const saved = JSON.stringify(data)
  const input = buildCanalBankExportInput(data)
  assert.equal(JSON.stringify(data),saved,'Export preparation never mutates the saved design')
  assert.equal(input.intervals[0].from,0);assert.equal(input.intervals.at(-1).to,data.lengthM)
  input.intervals.forEach((r,i)=>{
    assert.ok(r.to>r.from)
    if(i)assert.equal(r.from,input.intervals[i-1].to)
    assert.equal(r.start.chainage,r.from);assert.equal(r.end.chainage,r.to)
    assert.equal(r.start.banks[0].reachId,r.end.banks[0].reachId)
  })
  cases.push({name,data,input,checkOutput})
  return input
}
const plain = fixture()
check('plain',plain)
const slope=fixture();slope.sections=slope.sections.map(s=>({...s,ground:[{offset:-80,rl:96.5},{offset:-5,rl:98},{offset:3,rl:99},{offset:80,rl:98.5}]}))
check('survey',slope)
const berm=fixture();berm.design.bankConfig.leftTiers=berm.design.bankConfig.leftTiers.map(t=>({...t,berms:[{id:'b',dropHeight:1,shelfWidth:2,clearance:2,slopeAfterBerm:2}]}))
check('berm',berm)
let blanket=drainage.saveCanalDrainageTier(fixture(),'left','tier-low',{blanket:'5-4'})
check('blanket',blanket,(result)=>assert.ok(result.totals.blanket_25>0))
let filters=drainage.saveCanalDrainageTier(fixture(),'left','tier-low',{horizontalFilter:true,filterThickness:.3,rockToe:true,rockToeWidth:.5,rockToeHeight:1,rockToeSide:'both'})
check('filters',filters,(result)=>{
  assert.equal(result.groups.length,1)
  for(const key of ['horizontal_filter','vertical_filter']) assert.ok(result.totals[key]>0)
})
const capped=drainage.saveCanalDrainageTier(fixture(),'left','tier-low',{horizontalFilter:true,filterLengthMode:'manual',filterLeftLength:2,filterRightLength:2,filterThickness:.3,rockToe:true,rockToeWidth:50,rockToeHeight:1,rockToeSide:'both'})
check('capped-chimney',capped,result=>assert.ok(Math.abs(result.totals.vertical_filter-1600)<1e-8))
const cappedSection=measureCanalBankSection(capped,capped.sections[0])
const polygonArea=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.offset*q.rl-q.offset*p.rl},0))/2
for(const bank of cappedSection.banks){
  assert.equal(bank.values.vertical_filter,2,'Quantity uses the drawn 2 m width, although 50 m was entered')
  for(const key of ['horizontal_filter','vertical_filter'])assert.ok(Math.abs(bank.shapes.filter(shape=>shape.key===key).reduce((sum,shape)=>sum+polygonArea(shape.points),0)-bank.values[key])<1e-8,'Drawn polygon and its measured section agree')
}
const cappedItems=canal.syncCanalItems({id:'root',kind:'root',name:'R',children:[{id:'canal',kind:'component',name:'Canal',canal:capped,children:[]}]},'canal').children[0].children
assert.equal(cappedItems.find(item=>item.itemCode==='IRR-CAW-5-10').computedQuantity,1600,'Generated estimate uses the diagram engine quantity')
assert.ok(canalBankReachSummary(capped).totalBankVolume>0,'The reach abstract uses the shared measured result')
let zoned=fixture();zoned.design.bankConfig.leftTiers=zoned.design.bankConfig.leftTiers.map(t=>({...t,sectionType:'zoned',heartingTopWidth:1,heartingSideSlope:.25}))
zoned.design.heartingConnection='separate'
check('zoned',zoned,result=>assert.ok(result.totals.hearting>0))
const edited=fixture();edited.design.bankConfig.leftReachOverrides=[
  {id:'edited-a',from:0,to:100,tierId:'tier-low',status:'fill'},
  {id:'edited-b',from:100,to:300,tierId:'tier-medium',status:'fill'},
  {id:'edited-c',from:300,to:400,tierId:'tier-low',status:'fill'}]
edited.design.bankConfig.leftTiers=edited.design.bankConfig.leftTiers.map(t=>({...t,baseSlope:t.id==='tier-medium'?3:1.5}))
const editedInput=check('edited',edited,result=>assert.equal(result.groups.length,1))
assert.equal(editedInput.intervals[0].end.banks[0].reachId,'edited-a')
assert.equal(editedInput.intervals[1].start.banks[0].reachId,'edited-b')
const independent=structuredClone(edited)
independent.design.bankConfig.linkSymmetrical=false
independent.design.bankConfig.rightReachOverrides=structuredClone(independent.design.bankConfig.leftReachOverrides)
const boundaryScene=buildCanalBankSectionInput(independent,{...independent.sections[1],bankReachLookupChainageBySide:{left:50,right:150}}).sample
assert.equal(boundaryScene.banks[0].reachId,'edited-a','Left bank retains the requested side of a shared reach boundary')
assert.equal(boundaryScene.banks[1].reachId,'edited-b','Right bank can preview the opposite side of the same boundary')
const manual=structuredClone(edited);manual.design.bankConfig.mode='manual';manual.design.bankConfig.leftManualReaches=manual.design.bankConfig.leftReachOverrides
check('manual',manual)
const road=fixture();road.design.serviceRoadReaches=[{id:'road',fromChainage:150,toChainage:250,side:'left',width:10,shoulderWidth:1,heightMode:'tbl',heightAboveBed:2}]
const roadInput=check('road',road)
assert.ok(roadInput.intervals.some(r=>r.to===150));assert.ok(roadInput.intervals.some(r=>r.from===250))
assert.notDeepEqual(roadInput.intervals.find(r=>r.to===150).end.design,roadInput.intervals.find(r=>r.from===150).start.design,'Road endpoints keep one-sided geometry')
let mixed=fixture()
mixed.design.bankConfig.linkSymmetrical=false
mixed.design.bankConfig.leftReachOverrides=edited.design.bankConfig.leftReachOverrides
mixed.design.bankConfig.rightReachOverrides=edited.design.bankConfig.leftReachOverrides
mixed.design.bankConfig.leftTiers=mixed.design.bankConfig.leftTiers.map(t=>({...t,sectionType:t.id==='tier-medium'?'zoned':'homogeneous',heartingTopWidth:1,heartingSideSlope:.25,
  bankProtection:{...protection.defaultBankProtection(),kind:t.id==='tier-low'?'grass':'none'}}))
mixed.design.bankConfig.rightTiers=mixed.design.bankConfig.leftTiers.map(t=>({...t,bankProtection:{...protection.defaultBankProtection(),kind:t.id==='tier-medium'?'grass':'none'}}))
for(const side of ['left','right']){
  mixed=drainage.saveCanalDrainageTier(mixed,side,'tier-low',{blanket:'5-4',horizontalFilter:true,filterThickness:.3})
  mixed=drainage.saveCanalDrainageTier(mixed,side,'tier-medium',{blanket:'5-5',blanketThickness:.3,horizontalFilter:true,rockToe:true,rockToeSide:'both',rockToeWidth:.5,rockToeHeight:1})
}
mixed.design.bankToeDrainage={mode:'manual',leftReaches:[{id:'toe',from:50,to:250,treatment:{rockToeProtection:true,rockToeProtectionSide:'left',rockToeTopWidth:.5,rockToeProtectionHeight:1,rockToeInnerSlope:1,rockToeFilter:true,toeDrain:true,toeDrainSide:'left',toeDrainBottomWidth:.6,toeDrainDepth:.6,toeDrainLeftSlope:1,toeDrainRightSlope:1,toeDrainBermWidth:.6,toeDrainProtection:'rubble'}}],rightReaches:[{id:'ditch',from:175,to:325,treatment:{toeDrain:true,toeDrainSide:'right',toeDrainBottomWidth:.6,toeDrainDepth:.6,toeDrainLeftSlope:1,toeDrainRightSlope:1,toeDrainBermWidth:.6,toeDrainProtection:'concrete'}}]}
check('mixed',mixed,result=>{
  assert.equal(result.groups.length,4)
  for(const key of ['rock_toe','rock_toe_filter','toe_ditch','ditch_rubble','ditch_concrete'])assert.ok(result.totals[key]>0)
  for(const group of result.groups)assert.ok(group.works.some(w=>w.key==='horizontal_filter')&&group.works.some(w=>w.key==='vertical_filter'))
  const variants=result.rows.filter(r=>r.side==='left'&&r.reachId==='edited-a')
  assert.equal(new Set(variants.map(r=>r.designVariant)).size,2,'Partial toe works retain separate section exhibits')
  assert.equal(new Set(variants.map(r=>r.groupIndex)).size,1,'Separate exhibits keep one quantity group')
})
const cns=fixture();cns.liningReaches=[{...canal.defaultCanalLiningReach(0,400),cnsChapter:{version:1,required:true,coverage:'bed-and-sides',bedThicknessMm:300,sideThicknessMm:300,source:'borrow',compaction:95}}]
check('cns',cns,result=>assert.ok(result.totals.cns_replacement>0))
const lining=require('../src/renderer/src/lib/canalLiningChapter.ts')
const lined=structuredClone(cns)
lined.liningReaches[0].liningChapter={...lining.defaultLiningChapter(),surfaces:['bed','left','right'],sameSpecification:true,membrane:false}
lined.liningReaches[0].liningChapter.specifications.bed={...lining.defaultChapterSpec(),method:'concrete',placement:'paver',code:'IRR-CAW-7-6',thicknessMm:75,reinforced:false}
check('lined-cns',lined,result=>assert.ok(result.totals.cns_replacement>0))
const gap=fixture();gap.design.bankConfig.mode='manual';gap.design.bankConfig.leftManualReaches=[{id:'partial',from:0,to:200,tierId:'tier-low',status:'fill'}]
assert.throws(()=>buildCanalBankExportInput(gap),/Assign a bank profile/,'Unassigned filling fails before a workbook can be produced')
const missing=fixture();missing.sections=missing.sections.slice(1)
assert.throws(()=>buildCanalBankExportInput(missing),/cover the canal/)

if(process.argv.includes('--native')){
  const {spawnSync}=require('node:child_process')
  const folder=path.resolve('output/canal-bank-export');fs.mkdirSync(folder,{recursive:true})
  for(const c of cases){
    const file=path.join(folder,`${c.name}.json`);fs.writeFileSync(file,JSON.stringify(c.input))
    const run=spawnSync('cargo',['test','--manifest-path','src-tauri/estimate-core/Cargo.toml','--test','bank_excel','export_actual_app_fixture_when_requested','--','--exact'],{
      encoding:'utf8',windowsHide:true,env:{...process.env,CARGO_TARGET_DIR:path.join(process.env.LOCALAPPDATA,'e-estimate/cargo-target'),CANAL_BANK_EXPORT_FIXTURE:file}})
    assert.equal(run.status,0,run.stdout+run.stderr)
    const result=JSON.parse(fs.readFileSync(`${file}.statement.json`,'utf8'))
    if(c.checkOutput)c.checkOutput(result)
    {
      const expected=canal.canalBankVolumeTotals(c.data)
      for(const [native,key] of [['filling','homogeneous'],['hearting','hearting'],['casing','casing']]){
        assert.ok(Math.abs((result.totals[native]??0)-expected[key])<.25,`${c.name} ${native}: ${result.totals[native]} != ${expected[key]}`)
      }
    }
    const live=measureCanalBankQuantities(c.data)
    for(const row of result.rows){
      const shared=live.rows.find(candidate=>candidate.from===row.from&&candidate.to===row.to&&candidate.side===row.side)
      assert.ok(shared,`${c.name}: live interval missing`)
      for(const key of new Set([...Object.keys(shared.quantities),...Object.keys(row.quantities)]))assert.ok(Math.abs((shared.quantities[key]??0)-(row.quantities[key]??0))<1e-7,`${c.name} ${key}: live and Excel disagree`)
    }
    console.log(`Native bank export ${c.name}: ${result.groups.length} groups, quantities reconciled`)
  }
}
console.log('Canal bank export adapter: saved reaches, survey coordinates, one-sided boundaries and modes passed.')
