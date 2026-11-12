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
const bedCore=structuredClone(zoned)
bedCore.sections=bedCore.sections.map(section=>({...section,ground:[{offset:-80,rl:96},{offset:80,rl:96}]}))
bedCore.design.bankConfig.leftTiers=bedCore.design.bankConfig.leftTiers.map(tier=>({...tier,heartingTopWidth:1.5,heartingSideSlope:1}))
bedCore.design.heartingConnection='continuous'
check('bed-refill-zoned',bedCore,result=>{
  assert.equal(result.groups.length,1)
  const bankWidth=result.rows.slice(0,2).reduce((sum,row)=>sum+row.start.foundationWidth,0)
  assert.ok(Math.abs(result.totals.stripping-(bankWidth+bedCore.design.bedWidth)*bedCore.strippingDepth*bedCore.lengthM)<1e-6,'The full bed width is stripped and refilled once')
  assert.ok(result.totals.hearting>0&&result.totals.casing>0,'Continuous core and casing both remain measured')
})
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
const itemNos=fixture()
itemNos.design.bankConfig.linkSymmetrical=false
itemNos.design.bankToeDrainage={mode:'manual',leftReaches:[{id:'one-bank-toe',from:0,to:400,treatment:{rockToeProtection:true,rockToeProtectionSide:'left',rockToeTopWidth:.5,rockToeProtectionHeight:1,rockToeInnerSlope:1}}],rightReaches:[]}
check('item-specific-nos',itemNos,result=>assert.equal(result.groups.length,1))
const itemUnits=fixture()
itemUnits.design.bankConfig.linkSymmetrical=false
const ditch={toeDrain:true,toeDrainSide:'both',toeDrainBottomWidth:.8,toeDrainDepth:.6,toeDrainLeftSlope:1,toeDrainRightSlope:1,toeDrainBermWidth:.6}
itemUnits.design.bankToeDrainage={mode:'manual',leftReaches:[{id:'rubble-side',from:0,to:400,treatment:{...ditch,toeDrainProtection:'rubble'}}],rightReaches:[{id:'concrete-side',from:0,to:400,treatment:{...ditch,toeDrainProtection:'concrete'}}]}
check('different-item-units',itemUnits,result=>{
  assert.equal(result.groups.length,1)
  assert.equal(result.works.find(work=>work.key==='ditch_rubble').unit,'m²')
  assert.equal(result.works.find(work=>work.key==='ditch_concrete').unit,'m³')
})
const varyingOthers=fixture()
varyingOthers.design.bankConfig.leftReachOverrides=[{id:'varying-bank',from:0,to:400,tierId:'tier-low',status:'fill'}]
varyingOthers.design.bankConfig.leftTiers=varyingOthers.design.bankConfig.leftTiers.map(tier=>({...tier,baseSlope:1.5,
  berms:[{id:'conditional-shelf',dropHeight:1,shelfWidth:2,clearance:1.5,slopeAfterBerm:3}],bankBermProtection:{...protection.defaultBankProtection(),kind:'grass'}}))
varyingOthers.sections=varyingOthers.sections.map((section,i)=>({...section,ground:[{offset:-80,rl:[101,100.5,99,98,97][i]},{offset:80,rl:[101,100.5,99,98,97][i]}]}))
varyingOthers.design.bankToeDrainage={mode:'manual',leftReaches:[{id:'toe-and-ditch',from:0,to:400,treatment:{...ditch,
  rockToeProtection:true,rockToeProtectionSide:'both',rockToeTopWidth:.5,rockToeProtectionHeight:1,rockToeInnerSlope:1}}],rightReaches:[]}
check('varying-other-sections',varyingOthers,result=>{
  for(const key of ['rock_toe','berm_protection_IRR-CAW-8-15'])assert.ok(result.rows.some(bank=>Math.abs((bank.start.values[key]??0)-(bank.end.values[key]??0))>1e-8),`${key} can vary with section geometry`)
  assert.ok(result.rows.every(bank=>Math.abs((bank.start.values.toe_ditch??0)-(bank.end.values.toe_ditch??0))<1e-8),'Fixed ditch dimensions retain their area while the surveyed ground changes')
})
const fixedOthers=structuredClone(varyingOthers)
fixedOthers.sections=fixedOthers.sections.map(section=>({...section,ground:[{offset:-80,rl:98},{offset:80,rl:98}]}))
check('fixed-other-sections',fixedOthers,result=>{
  assert.ok(result.totals['berm_protection_IRR-CAW-8-15']>0)
  assert.ok(result.totals.rock_toe>0&&result.totals.toe_ditch>0)
})
const ditchRanges=fixture()
ditchRanges.design.bankConfig.linkSymmetrical=false
ditchRanges.design.bankToeDrainage={mode:'manual',leftReaches:[
  {id:'small-ditch',from:0,to:100,treatment:{...ditch,toeDrainDepth:.6}},
  {id:'large-ditch',from:200,to:300,treatment:{...ditch,toeDrainDepth:1}}
],rightReaches:[{id:'right-ditch',from:0,to:400,treatment:{...ditch,toeDrainDepth:.8}}]}
check('ditch-size-ranges',ditchRanges,result=>assert.ok(result.totals.toe_ditch>0))
const gradedDitch=drainage.saveCanalDrainageTier(fixture(),'left','tier-low',{
  ...ditch,toeDrainInvertRl:97.4,toeDrainStartChainage:0,toeDrainSlope:1000,toeDrainProtection:'concrete'
},'bankToeDrainage')
check('graded-ditch',gradedDitch,result=>{
  const left=result.rows.filter(bank=>bank.side==='left')
  assert.ok(Math.abs(left[0].start.values.toe_ditch-.84)<1e-8)
  assert.ok(Math.abs(left.at(-1).end.values.toe_ditch-1.8)<1e-8)
  assert.ok(left.every(bank=>bank.start.values.toe_ditch<bank.end.values.toe_ditch),'The grade makes depth vary at successive sections')
  const restored=canal.migrateCanalData(JSON.parse(JSON.stringify(gradedDitch)))
  assert.deepEqual(measureCanalBankQuantities(restored).rows,measureCanalBankQuantities(gradedDitch).rows,'Ditch level, reference chainage and slope survive save/load')
  for(const section of gradedDitch.sections){
    const grade=canal.canalToeDitchAtSection(gradedDitch,section,'left')
    assert.ok(Math.abs(grade.invertRl-(97.4-section.chainage/1000))<1e-8)
  }
})
const independentGrades=fixture()
independentGrades.design.bankConfig.linkSymmetrical=false
independentGrades.design.bankToeDrainage={mode:'manual',leftReaches:[{id:'left-grade',from:100,to:400,treatment:{...ditch,toeDrainInvertRl:97.2,toeDrainStartChainage:100,toeDrainSlope:500}}],
  rightReaches:[{id:'right-grade',from:0,to:400,treatment:{...ditch,toeDrainInvertRl:97.5,toeDrainStartChainage:0,toeDrainSlope:2000,toeDrainProtection:'rubble'}}]}
check('independent-ditch-grades',independentGrades,result=>{
  const left=result.rows.filter(bank=>bank.side==='left'&&bank.from===100)[0]
  const right=result.rows.filter(bank=>bank.side==='right'&&bank.from===100)[0]
  assert.ok(Math.abs(left.start.values.toe_ditch-(.8*.8+.8*.8))<1e-8)
  assert.notEqual(left.start.values.toe_ditch,right.start.values.toe_ditch,'Each bank uses its own invert and slope')
})
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
const compressed=fixture();compressed.lengthM=500
compressed.sections=[0,30,60,90,120,240,300,400,500].map(chainage=>({...compressed.sections[0],id:`compressed-${chainage}`,chainage}))
compressed.design.bankConfig.leftReachOverrides=[
  {id:'first',from:0,to:30,tierId:'tier-low',status:'fill'},
  {id:'elsewhere',from:30,to:400,tierId:'tier-medium',status:'fill'},
  {id:'last',from:400,to:500,tierId:'tier-low',status:'fill'}]
compressed.design.bankConfig.leftTiers=compressed.design.bankConfig.leftTiers.map(t=>({...t,sectionType:t.id==='tier-medium'?'zoned':'homogeneous',heartingTopWidth:1,heartingSideSlope:.25}))
check('compressed-off-sheet',compressed,result=>assert.equal(result.groups.length,2))
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

// Cached measurements must skip geometry preparation and still detect edited inputs.
const adapter=require('../src/renderer/src/lib/canalBankExport.ts')
const buildInput=adapter.buildCanalBankExportInput
let builds=0
adapter.buildCanalBankExportInput=(...args)=>{builds++;return buildInput(...args)}
try{
  const cached=fixture()
  const first=measureCanalBankQuantities(cached)
  assert.equal(measureCanalBankQuantities(cached),first)
  assert.equal(builds,1,'A repeated measurement must not rebuild the geometry schedule')
  cached.design.bedWidth+=1
  const redesigned=measureCanalBankQuantities(cached)
  assert.equal(builds,2)
  assert.notDeepEqual(redesigned.rows[0].quantities,first.rows[0].quantities,'In-place design edits invalidate the cache')
  cached.sections[0].ground[0].rl-=.3
  const surveyed=measureCanalBankQuantities(cached)
  assert.equal(builds,3)
  assert.notDeepEqual(surveyed.rows[0].quantities,redesigned.rows[0].quantities,'Survey edits invalidate the cache')
  const split=measureCanalBankQuantities(cached,[50])
  assert.ok(split.rows.length>surveyed.rows.length,'Work boundaries keep their own measurements')
  assert.equal(measureCanalBankQuantities(cached,[50]),split)
  assert.equal(builds,4)
}finally{adapter.buildCanalBankExportInput=buildInput}

if(process.argv.includes('--native')){
  const {spawnSync}=require('node:child_process')
  const xlsx=require('xlsx')
  const recalculate=require('xlsx-calc')
  const folder=path.resolve('output/canal-bank-export');fs.mkdirSync(folder,{recursive:true})
  for(const c of cases){
    const file=path.join(folder,`${c.name}.json`);fs.writeFileSync(file,JSON.stringify(c.input))
    const run=spawnSync('cargo',['test','--manifest-path','src-tauri/estimate-core/Cargo.toml','--test','bank_excel','export_actual_app_fixture_when_requested','--','--exact'],{
      encoding:'utf8',windowsHide:true,env:{...process.env,CARGO_TARGET_DIR:path.join(process.env.LOCALAPPDATA,'e-estimate/cargo-target'),CANAL_BANK_EXPORT_FIXTURE:file}})
    assert.equal(run.status,0,run.stdout+run.stderr)
    const result=JSON.parse(fs.readFileSync(`${file}.statement.json`,'utf8'))
    if(c.checkOutput)c.checkOutput(result)
    const workbook=xlsx.readFile(`${file}.xlsx`)
    assert.deepEqual(workbook.SheetNames,result.groups.length
      ? [...result.groups.map(group=>group.sheetName),'Bank Sections']
      : ['Statement of Quantities'],`${c.name}: calculation sheets and diagrams only`)
    const cached=[]
    for(const name of workbook.SheetNames){
      for(const [address,cell] of Object.entries(workbook.Sheets[name])){
        if(cell.f)cached.push({name,address,value:cell.v})
      }
    }
    recalculate(workbook)
    for(const {name,address,value} of cached){
      const cell=workbook.Sheets[name][address]
      assert.equal(cell.t,'n',`${c.name}: formula error at ${name}!${address}`)
      assert.ok(Math.abs(cell.v-value)<1e-6,`${c.name}: recalculated ${name}!${address} differs from saved quantity`)
    }
    for(const [groupIndex,group] of result.groups.entries()){
      const sheet=workbook.Sheets[group.sheetName]
      assert.equal(sheet.B3.v,'Length (m)','No global Nos. column')
      const owned=result.rows.filter(bank=>bank.groupIndex===groupIndex)
      const fixed=group.works.filter(work=>work.block==='Others'&&owned.every(bank=>Math.abs((bank.start.values[work.key]??0)-(bank.end.values[work.key]??0))<=1e-8))
      const detailed=group.works.filter(work=>!fixed.includes(work))
      const items=sheet['!merges'].filter(range=>range.s.r===3&&range.e.r===3&&range.s.c>=5).sort((a,b)=>a.s.c-b.s.c)
      assert.equal(items.length,detailed.length,'Only section-dependent works repeat in the chainage table')
      const cell=(row,col)=>sheet[xlsx.utils.encode_cell({r:row-1,c:col})]
      const chainages=[c.input.intervals[0].from,...c.input.intervals.map(interval=>interval.to)]
      const intervals=c.input.intervals.map(interval=>({
        ...interval,banks:result.rows.filter(bank=>bank.from===interval.from&&bank.to===interval.to)
      }))
      const retained=new Set([0,intervals.length])
      intervals.forEach((interval,i)=>{
        if(interval.banks.some(bank=>bank.groupIndex===groupIndex)){retained.add(i);retained.add(i+1)}
        if(i&&interval.banks.map(bank=>bank.groupIndex).join('/')!==intervals[i-1].banks.map(bank=>bank.groupIndex).join('/'))retained.add(i)
      })
      const visible=chainages.filter((_,i)=>retained.has(i))
      const totalRow=6+visible.length
      assert.equal(sheet[`A${totalRow}`].v,'GROUP TOTAL','There are no duplicate station rows')
      visible.forEach((chainage,i)=>{
        const row=6+i
        assert.equal(sheet[`A${row}`].v,chainage,`${c.name}: chainage occurs once and in order`)
        if(i)assert.ok(chainage>visible[i-1],'Strictly increasing chainages')
        const station=chainages.indexOf(chainage)
        const interval=intervals[Math.max(0,station-1)]
        const banks=interval.banks.filter(bank=>bank.groupIndex===groupIndex)
        if(!banks.length){
          assert.equal(cell(row,1)?.v??null,null,'Reference boundary has no measured length')
          for(const item of items)for(let col=item.s.c;col<=item.e.c;col++){
            assert.equal(cell(row,col)?.v??null,null,`${c.name}: reference boundary measurements are blank`)
            assert.ok(!cell(row,col)?.f,'Reference boundary contributes no quantity')
          }
          assert.ok(cell(row,4).v.includes(' m: '),'Excluded ranges identify their chainage limits')
          return
        }
        if(station===0)return
        assert.equal(sheet[`B${row}`].v,interval.to-interval.from,'Measured length never crosses an excluded range')
        for(const [j,item] of items.entries()){
          const key=detailed[j].key
          const width=item.e.c-item.s.c+1
          assert.ok([5,9].includes(width),'Each item contains its own section, average, Nos. and quantity')
          const counts=[cell(row,item.s.c+3).v,...(width===9?[cell(row,item.s.c+7).v]:[])]
          assert.ok(counts.every(nos=>[0,1,2].includes(nos)))
          assert.equal(counts.reduce((sum,value)=>sum+value,0),banks.filter(bank=>(bank.start.values[key]??0)!==0||(bank.end.values[key]??0)!==0).length,`${c.name}: ${key} counts applicable banks once`)
          const quantity=cell(row,item.e.c)
          assert.ok(quantity.f.endsWith(`*$B${row}`),'Item quantities use this row’s interval length')
          const expected=banks.reduce((sum,bank)=>sum+(bank.quantities[key]??0),0)
          assert.ok(Math.abs(quantity.v-expected)<1e-6,`${c.name}: ${key} reconciles on chainage ${chainage}`)
        }
      })
      const fixedTables=new Map()
      for(const work of fixed){
        const title=`${work.label}${work.code?`\n${work.code}`:''}`
        const heading=Object.entries(sheet).find(([address,cell])=>/^A\d+$/.test(address)&&cell.v===title)
        assert.ok(heading,`${c.name}: ${work.key} has a compact range calculation`)
        const headingRow=Number(heading[0].slice(1))
        assert.ok(headingRow>totalRow)
        const separate=cell(headingRow+1,3).v.startsWith('Section LB')
        const lengthCol=separate?7:5,quantityCol=lengthCol+1
        assert.equal(cell(headingRow+1,quantityCol).v,`Quantity (${work.unit})`)
        const spans=[]
        let row=headingRow+2
        for(;typeof cell(row,0)?.v==='number';row++){
          const from=cell(row,0).v,to=cell(row,1).v
          const banks=owned.filter(bank=>bank.from>=from&&bank.to<=to)
          const expected=banks.reduce((sum,bank)=>sum+(bank.quantities[work.key]??0),0)
          assert.ok(expected>0,'Compact ranges never contain zero-only work rows')
          assert.equal(cell(row,lengthCol).v,to-from)
          assert.ok(Math.abs(cell(row,quantityCol).v-expected)<1e-6,`${c.name}: ${work.key} range quantity reconciles`)
          const first=banks.filter(bank=>bank.from===from)
          const nos=[cell(row,4).v,...(separate?[cell(row,6).v]:[])]
          assert.equal(nos.reduce((sum,n)=>sum+n,0),first.filter(bank=>(bank.quantities[work.key]??0)>0).length)
          spans.push({from,to,row,quantity:cell(row,quantityCol).v})
        }
        assert.equal(cell(row,0).v,'TOTAL')
        assert.ok(Math.abs(cell(row,quantityCol).v-(group.totals[work.key]??0))<1e-6)
        for(const bank of owned.filter(bank=>(bank.quantities[work.key]??0)>0))assert.equal(spans.filter(span=>span.from<=bank.from&&span.to>=bank.to).length,1,`${c.name}: ${work.key} interval is counted in exactly one range`)
        fixedTables.set(work.key,spans)
      }
      if(c.name==='compressed-off-sheet'&&group.sheetName==='Homogeneous Unprotected'){
        assert.deepEqual(visible,[0,30,400,500])
        for(const row of [7,8])assert.ok(cell(row,4).v.includes('30.000–400.000 m: See sheet Zoned Unprotected'))
        assert.equal(sheet.B9.v,100)
      }
      if(c.name==='item-specific-nos'){
        const stripping=items[detailed.findIndex(work=>work.key==='stripping')]
        const toe=fixedTables.get('rock_toe')[0]
        assert.equal(cell(7,stripping.s.c+3).v,2,'Matching stripping uses Nos. = 2 even when another item differs')
        assert.equal(cell(toe.row,4).v,1)
        assert.equal(cell(toe.row,6).v,0)
      }
    }
    if(c.name==='plain'){
      const sheet=workbook.Sheets[result.groups[0].sheetName]
      assert.equal(sheet.I7.v,2)
      const before=sheet.J7.v,otherItem=sheet.O7.v
      sheet.I7.v=1;recalculate(workbook)
      assert.ok(Math.abs(sheet.J7.v-before/2)<1e-6,'Changing an item’s Nos. from 2 to 1 halves its quantity')
      assert.equal(sheet.O7.v,otherItem,'Another item keeps its own Nos. and quantity')
      sheet.I7.v=2;recalculate(workbook)
      assert.ok(Math.abs(sheet.J7.v-before)<1e-6)
    }
    const allocated=new Map()
    for(const group of result.groups){
      const sheet=workbook.Sheets[group.sheetName]
      for(const material of result.materials){
        const key=material.zone==='homogeneous'?'filling':material.zone
        const quantity=(group.totals[key]??0)+(material.zone==='hearting'?(group.totals.cutoff_filling??0):0)
        const source=Object.entries(sheet).filter(([address,cell])=>/^A\d+$/.test(address)&&cell.v===`${material.zone} / ${material.source}`)
        if(!quantity){assert.equal(source.length,0);continue}
        assert.equal(source.length,1,`${c.name}: source allocation belongs on ${group.sheetName}`)
        const row=source[0][0].slice(1)
        const cell=sheet[`F${row}`]
        assert.ok(cell.f&&!cell.f.includes('!'),'Allocation links to totals on its own sheet')
        assert.ok(Math.abs(cell.v-quantity*material.percentage/100)<1e-6,`${c.name}: group material allocation`)
        const allocationKey=`${material.zone}/${material.source}`
        allocated.set(allocationKey,(allocated.get(allocationKey)??0)+cell.v)
      }
    }
    for(const material of result.materials){
      assert.ok(Math.abs((allocated.get(`${material.zone}/${material.source}`)??0)-material.quantity)<1e-6,`${c.name}: source allocations reconcile across groups`)
    }
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
