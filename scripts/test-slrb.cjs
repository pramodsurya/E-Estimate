const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const Module=require('node:module')
const ts=require('typescript')
const root=path.resolve(__dirname,'..')
const lib=name=>path.join(root,'src/renderer/src/lib',name+'.ts')
const original=Module._load
Module._load=function(request,parent,isMain){
  if(request.endsWith('?raw'))return fs.readFileSync(path.resolve(path.dirname(parent.filename),request.slice(0,-4)),'utf8')
  if(request.endsWith('?inline')){const file=path.resolve(path.dirname(parent.filename),request.slice(0,-7));return `data:${file.endsWith('.svg')?'image/svg+xml':'image/png'};base64,${fs.readFileSync(file).toString('base64')}`}
  if(request.endsWith('?url'))return path.resolve(path.dirname(parent.filename),request.slice(0,-4))
  if(request.includes('nodeVisual'))return {nodeDisplayName:node=>node.name||node.itemCode||'Item'}
  if(request.includes('supabase'))return {supabase:{}}
  return original.call(this,request,parent,isMain)
}
function load(file,mocks={}){
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file))
  m.require=request=>request in mocks?mocks[request]:Module.createRequire(file)(request)
  const {outputText}=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX},fileName:file})
  m._compile(outputText,file);return m.exports
}
require.extensions['.ts']=(m,file)=>{
  const {outputText}=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:file})
  m._compile(outputText,file)
}
const api=load(lib('slrb'))
const context=load(lib('slrbContext'))
const tree=load(lib('tree'))
const canal=load(lib('canal'))
const reports=load(lib('slrbReport'))
const examples=load(lib('slrbExamples'))
const defaults=load(lib('projectDataDefaults'))
const files=load(lib('projectFile'))
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
const ref=(code='IRR-CCDW-2-10',unit='CUM')=>({code,unit,categoryKey:'ssr_item',side:'SSR',reviewed:true,includesFormwork:true,includesBackfill:false,scopeNote:'Reviewed project specification and physical scope'})
function ready(){
  const data=api.resizeSlrbLayout(api.defaultSlrbData(),2)
  Object.assign(data,{purpose:'drawing',reference:'B-04 Rev C',sourceStatus:'reviewed',estimateBasis:'irrigation-ssr',crossingAngle:90,slabWidth:5.2,carriagewayWidth:4.25,
    wearingPresence:'none',wallsPresence:'none',fittingsPresence:'none',reinforcementPresence:'none'})
  data.spans=data.spans.map(s=>({...s,clearSpan:4.7,panelLength:5.1,thickness:0.46,grade:'M20'}))
  data.supports=data.supports.map(s=>({...s,body:{shape:'rectangle',length:4.7,width:0.6,bottomWidth:null,height:2,grade:'M20'},capPresence:'none',footingType:'spread',
    footing:{shape:'rectangle',length:2,width:3,bottomWidth:null,height:0.5,grade:'M20'},beddingPresence:'none',excavationPresence:'none'}))
  data.approaches=data.approaches.map(a=>({...a,presence:'none'}))
  data.materials={'deck.M20':ref('IRR-CCDW-2-25'),'abutment.M20':ref(),'pier.M20':ref(),'footing.M20':ref()}
  return data
}
function scene(data=ready()){
  const bridge={id:'bridge',kind:'component',name:'General bridge',templateId:'slrb',slrb:data,location:{lat:17,lng:78},children:[]}
  const rootNode={id:'root',kind:'title',name:'Project',children:[bridge]}
  const project={id:'project',formatVersion:1,meta:{name:'Bridge estimate',sorYear:'2026-27',sorZone:'zone_3'},root:rootNode}
  return {bridge,root:rootNode,project}
}
function withCanal(data=ready()){
  const {bridge,root,project}=scene(data)
  bridge.kind='subcomponent';bridge.location={lat:17,lng:78.0005}
  const parent={id:'canal',kind:'component',name:'Parent Canal',templateId:'canal',canal:{...canal.defaultCanalData(),configured:true,
    lengthM:106.328,alignment:[{lat:17,lng:78},{lat:17,lng:78.001}],design:{...canal.defaultCanalDesign(),bedLevelAtStart:100,bedSlope:2000,fullSupplyDepth:1.3,freeBoard:0.6}},children:[bridge]}
  root.children=[parent];return {bridge,root,project,parent}
}
const initial=scene(api.defaultSlrbData())
let model=api.buildSlrbOutputModel(initial.root,initial.bridge)
assert.equal(model.measurementsReady,false)
assert.ok(model.measurements.every(m=>m.quantity===null),'empty dimensions remain pending, never 0')
assert.equal(api.parseSlrbDetailId(api.slrbDetailId('bridge')),'bridge')
const basic=scene()
model=api.buildSlrbOutputModel(basic.root,basic.bridge)
assert.equal(model.context.mode,'manual');assert.equal(model.measurementsReady,true);assert.equal(model.mappingsReady,true)
assert.equal(model.designStatus,'Review required')
close(model.measurements.find(m=>m.id===basic.bridge.slrb.spans[0].id+'.deck').quantity,5.1*5.2*0.46)
assert.deepEqual(basic.bridge.slrb.supports.map(s=>s.id),['A1','P1','A2'])
let changed=api.resizeSlrbLayout(basic.bridge.slrb,3)
assert.equal(changed.spans[0].id,basic.bridge.slrb.spans[0].id);assert.equal(changed.supports[0],basic.bridge.slrb.supports[0])
assert.deepEqual(changed.supports.map(s=>s.id),['A1','P1','P2','A2'])
close(api.slrbSolidVolume({shape:'stadium',length:3,width:0.8,bottomWidth:null,height:2,grade:'M20'}),((3-0.8)*0.8+Math.PI*0.8**2/4)*2)
close(api.slrbSolidVolume({shape:'trapezoid',length:4,width:0.4,bottomWidth:1.2,height:3,grade:'M15'}),9.6)
assert.equal(api.slrbSolidVolume({shape:'stadium',length:0.5,width:1,height:2}),null)
assert.equal(api.slrbSolidVolume({shape:'rectangle',length:3,width:1,height:-2}),null)
const manual=tree.createNode('item','Hand-added work',{computedQuantity:17,itemCode:'MANUAL'})
basic.bridge.children=[manual]
const originalTree=JSON.stringify(basic.root)
let synced=api.syncAllSlrbItems(basic.root)
assert.equal(JSON.stringify(basic.root),originalTree,'the item adapter is immutable')
let owned=tree.findNode(synced,'bridge')
assert.equal(owned.children.length,9,'eight ordinary quantity items plus the manual row')
assert.equal(owned.children[0],manual)
const ids=owned.slrb.materialItems.map(m=>m.itemNodeId)
assert.equal(api.syncAllSlrbItems(synced),synced,'unchanged sync keeps tree identity')
changed=structuredClone(owned.slrb);changed.spans[0].thickness=0.5
synced=api.syncAllSlrbItems(tree.patchNode(synced,'bridge',{slrb:changed}))
owned=tree.findNode(synced,'bridge')
assert.deepEqual(owned.slrb.materialItems.map(m=>m.itemNodeId),ids,'dimension edits update generated rows in place')
assert.equal(owned.children[0],manual)
const first=owned.children.find(item=>item.templateMeasurementKey===changed.spans[0].id+'.deck')
close(first.computedQuantity,5.1*5.2*0.5)
changed=structuredClone(owned.slrb);changed.spans[0].panelLength=null
const pending=tree.findNode(api.syncAllSlrbItems(tree.patchNode(synced,'bridge',{slrb:changed})),'bridge')
assert.ok(!pending.children.some(item=>item.templateMeasurementKey===changed.spans[0].id+'.deck'),'incomplete dimensions remove stale billed work')
assert.equal(pending.children[0],manual)
// Optional work: unknown != absent. Tapered walls use both endpoint heights.
const walls=scene();walls.bridge.slrb.wallsPresence='provided'
walls.bridge.slrb.walls=[{id:'W1',label:'Return W1',length:10,startHeight:2,endHeight:4,topThickness:0.3,bottomThickness:0.6,grade:'M15',footingPresence:'none',footing:api.slrbSolid()}]
model=api.buildSlrbOutputModel(walls.root,walls.bridge);close(model.measurements.find(m=>m.memberId==='W1').quantity,13.5)
walls.bridge.slrb.approaches[0].presence='unknown'
model=api.buildSlrbOutputModel(walls.root,walls.bridge)
assert.ok(model.measurements.some(m=>m.memberId==='AP1'&&m.quantity===null))
walls.bridge.slrb.approaches[0].presence='none'
assert.ok(!api.buildSlrbOutputModel(walls.root,walls.bridge).measurements.some(m=>m.memberId==='AP1'))
// BBS uses complete reviewed cut lengths, not spacing or a concrete percentage.
const steel=scene();steel.bridge.slrb.reinforcementPresence='provided'
steel.bridge.slrb.bars=[{id:'B1',memberId:steel.bridge.slrb.spans[0].id,mark:'D1',diameterMm:16,count:24,cutLengthM:6.4,shape:'Reviewed straight with anchorage included',reference:'BBS Rev C',reviewed:true}]
model=api.buildSlrbOutputModel(steel.root,steel.bridge)
close(model.measurements.find(m=>m.id==='B1.steel').quantity,24*6.4*Math.PI/4*0.016**2*7850)
steel.bridge.slrb.bars[0].count=24.5
assert.equal(api.buildSlrbOutputModel(steel.root,steel.bridge).measurements.find(m=>m.id==='B1.steel').quantity,null)
steel.bridge.slrb.bars[0].count=24;steel.bridge.slrb.bars[0].reviewed=false
assert.equal(api.buildSlrbOutputModel(steel.root,steel.bridge).measurements.find(m=>m.id==='B1.steel').quantity,null)
// M25 adopts the existing project DATA, not a duplicate M20 recipe or fixed price.
const wearing=scene();wearing.project=defaults.ensureBuiltInProjectData(wearing.project)
const def=wearing.project.projectData[0]
Object.assign(wearing.bridge.slrb,{wearingPresence:'provided',wearingThickness:0.075,wearingWidth:4.25,wearingGrade:'M25'})
wearing.bridge.slrb.materials['wearing.M25']={...ref(def.code),categoryKey:'project_data',projectDataId:def.id,includesFormwork:false}
owned=tree.findNode(api.syncAllSlrbItems(wearing.root),'bridge')
const coat=owned.children.find(item=>item.templateMeasurementKey.endsWith('.wearing'))
assert.equal(coat.projectDataId,def.id);close(coat.computedQuantity,5.1*4.25*0.075)
wearing.bridge.slrb.materials['wearing.M25']=ref('IRR-CCDW-2-29')
assert.ok(api.buildSlrbOutputModel(wearing.root,wearing.bridge).measurements.filter(m=>m.mappingKey==='wearing.M25').every(m=>!m.billable),'M20 code cannot bill M25 coat')
// Deep excavation, ingredients, wrong units and included work cannot be adopted silently.
const scope=scene();scope.bridge.slrb.supports[0].excavationPresence='provided'
scope.bridge.slrb.supports[0].excavation={shape:'rectangle',length:4,width:3,height:4,grade:'unknown'}
scope.bridge.slrb.materials.excavation={...ref('IRR-CCDW-1-2'),includesBackfill:true}
model=api.buildSlrbOutputModel(scope.root,scope.bridge)
assert.equal(model.measurements.find(m=>m.mappingKey==='excavation').billable,false)
scope.bridge.slrb.materials['deck.M20']={...ref('P1_007'),side:'SOR',categoryKey:'material'}
assert.ok(api.buildSlrbOutputModel(scope.root,scope.bridge).measurements.filter(m=>m.mappingKey==='deck.M20').every(m=>!m.billable))
scope.bridge.slrb.materials['deck.M20']=ref('IRR-CCDW-2-25','KG')
assert.ok(api.buildSlrbOutputModel(scope.root,scope.bridge).measurements.filter(m=>m.mappingKey==='deck.M20').every(m=>!m.billable))
scope.bridge.slrb.materials['deck.M20']=ref('IRR-CCDW-2-25')
scope.bridge.slrb.fittingsPresence='provided';scope.bridge.slrb.materials.formwork=ref('APPROVED-FORM','SQM')
scope.bridge.slrb.works=[{id:'FW',kind:'formwork',label:'Separate formwork',presence:'provided',quantity:25,grade:'unknown',distinctScope:false,reference:''}]
assert.equal(api.buildSlrbOutputModel(scope.root,scope.bridge).measurements.find(m=>m.id==='FW.work').billable,false)
scope.bridge.slrb.works[0].distinctScope=true;scope.bridge.slrb.works[0].reference='Separate site structure F-03'
assert.equal(api.buildSlrbOutputModel(scope.root,scope.bridge).measurements.find(m=>m.id==='FW.work').billable,true)
// Canal context follows the saved crossing, then the bridge's explicit level stack.
const inherited=withCanal();Object.assign(inherited.bridge.slrb,{datum:'Survey BM-04',roadLevelMode:'above-bank',roadBankOffset:0.8,wearingPresence:'none'})
inherited.bridge.slrb.supports=inherited.bridge.slrb.supports.map(s=>({...s,bearingStack:0,footingLevelMode:'below-bed',footingBedOffset:1}))
model=api.buildSlrbOutputModel(inherited.root,inherited.bridge)
assert.equal(model.context.mode,'canal');assert.ok(model.context.chainage>40&&model.context.chainage<60)
close(model.heights.P1,1.3+0.6+0.8-0.46+1)
const parentBefore=JSON.stringify(inherited.parent.canal)
synced=api.syncAllSlrbItems(inherited.root)
assert.equal(JSON.stringify(inherited.parent.canal),parentBefore,'child resolution never edits the parent')
const priorHeight=api.buildSlrbOutputModel(synced,tree.findNode(synced,'bridge')).heights.P1
const revised={...tree.findNode(synced,'canal').canal,design:{...inherited.parent.canal.design,freeBoard:0.9}}
synced=api.syncAllSlrbItems(tree.patchNode(synced,'canal',{canal:revised}))
owned=tree.findNode(synced,'bridge');model=api.buildSlrbOutputModel(synced,owned)
close(model.heights.P1,priorHeight+0.3)
assert.notEqual(owned.slrb.lastResolvedParent.revision,api.buildSlrbOutputModel(inherited.root,inherited.bridge).context.revision)
const detached={...inherited.root,children:[owned]}
model=api.buildSlrbOutputModel(detached,owned)
assert.equal(model.context.needsParentReview,true)
assert.ok(model.measurements.every(m=>m.quantity===null),'reparenting cannot adopt manual heights silently')
const accepted={...owned,slrb:{...owned.slrb,acceptedParentId:null}}
const detachedAccepted={...detached,children:[accepted]}
assert.equal(api.buildSlrbOutputModel(detachedAccepted,accepted).heights.P1,2,'manual inputs survive inheritance and reparenting')
inherited.bridge.location={lat:18,lng:79}
assert.equal(context.resolveSlrbContext(inherited.root,inherited.bridge,inherited.bridge.slrb).chainage,null,'distant points cannot select a nearby-looking reach')
inherited.bridge.slrb.chainageOverride=50;inherited.bridge.slrb.crossingConfirmationKey=context.slrbLocationKey(inherited.bridge,inherited.parent)
assert.equal(context.resolveSlrbContext(inherited.root,inherited.bridge,inherited.bridge.slrb).chainage,50)
inherited.bridge.location={lat:18.001,lng:79}
assert.equal(context.resolveSlrbContext(inherited.root,inherited.bridge,inherited.bridge.slrb).chainage,null,'location changes invalidate manual crossing confirmation')
const loop=withCanal();loop.parent.canal.alignment=[{lat:17,lng:78},{lat:17,lng:78.001},{lat:17.00005,lng:78.001},{lat:17.00005,lng:78}];loop.parent.canal.lengthM=220
assert.ok(context.slrbCrossingCandidates(loop.bridge,loop.parent).length>1)
assert.equal(context.resolveSlrbContext(loop.root,loop.bridge,loop.bridge.slrb).chainage,null,'ambiguous parallel reaches need confirmation')
// Historical cases retain source conflicts and never import effective span as actual panel length.
for(const key of ['100835','102215']){const example=examples.slrbReferenceExample(key);const c=scene(example);const result=api.buildSlrbOutputModel(c.root,c.bridge)
  assert.ok(example.sourceConflicts.some(c=>!c.resolved));assert.ok(example.spans.every(s=>s.panelLength===null));assert.ok(result.measurements.every(m=>m.quantity===null))}
const restored=files.expandLoadedProject(JSON.parse(JSON.stringify(files.compactProjectForSave({...basic.project,root:synced}))))
assert.deepEqual(tree.findNode(restored.root,'bridge').slrb,tree.findNode(synced,'bridge').slrb,'saved projects retain IDs, sources, mappings and parent snapshots')
assert.equal(api.syncAllSlrbItems(restored.root),restored.root)
// Shared report values and real PDF, including pending data and manual-context omission.
const report=reports.slrbReportData(basic.project,basic.bridge)
const plan=reports.slrbExcelPlan(api.buildSlrbOutputModel(basic.root,basic.bridge))
report.rows.forEach((row,i)=>assert.equal(plan.sheet.grid.cells.find(c=>c.r===i+5&&c.c===3).value,row.quantity))
assert.equal(report.canal,null)
// Repeated SSR/DATA codes share rates, but each member needs its own quantity
// reference in the whole-project workbook (including seigniorage terms).
const projectExcel=load(lib('excel-output/projectExcel'))
const workbookNode=tree.findNode(api.syncAllSlrbItems(basic.root),'bridge')
const sameCodeMembers=workbookNode.children.filter(n=>n.templateMeasurementKey?.endsWith('.deck'))
assert.equal(sameCodeMembers.length,2)
assert.equal(sameCodeMembers[0].itemCode,sameCodeMembers[1].itemCode)
const memberKeys=sameCodeMembers.map(n=>reports.slrbExcelItemKey(n,'shared-deck-code'))
assert.notEqual(memberKeys[0],memberKeys[1])
assert.equal(reports.slrbExcelItemKey(manual,'manual'),'manual')
const workbook=projectExcel.buildProjectDashboardPayload({
  projectName:'Bridge workbook regression',
  components:[{name:'Bridge',itemKeys:memberKeys,headers:[],details:[null,null],templateSheets:[plan.sheet]}],
  items:sameCodeMembers.map((n,i)=>({key:memberKeys[i],component:'Bridge',code:n.itemCode,name:n.name,unit:'CUM',description:n.name,
    staticQty:n.computedQuantity,detailRef:{sheet:plan.sheet.name,...plan.refs.get(n.templateMeasurementKey)},dataKey:'shared-data'})),
  data:[{key:'shared-data',code:sameCodeMembers[0].itemCode,description:'Shared adopted rate',unit:'CUM',sorRate:500,outputQty:1,leadKeys:[]}],
  leads:[],seigniorage:[{key:'sand',description:'Sand',unit:'CUM',policyRate:1,terms:memberKeys.map(itemKey=>({itemKey,factor:0.5}))}],charges:[]
})
const abstract=workbook.sheets.find(s=>s.name==='Abstract_Bridge')
const quantities=memberKeys.map((_,i)=>abstract.grid.cells.find(c=>c.r===i+3&&c.c===3).formula)
sameCodeMembers.forEach((n,i)=>assert.equal(quantities[i],`='${plan.sheet.name}'!D${plan.refs.get(n.templateMeasurementKey).r+1}`))
assert.notEqual(quantities[0],quantities[1],'same-code members retain independent measurement cells')
assert.deepEqual(workbook.links.filter(link=>link.kind==='data-rate').map(link=>link.key),['shared-data','shared-data'])
assert.equal(workbook.seigniorageLinks[0].terms.length,2)
assert.notEqual(workbook.seigniorageLinks[0].terms[0].formula,workbook.seigniorageLinks[0].terms[1].formula)
const typst=load(lib('typist-output/slrb/slrbTypst'))
const {NodeCompiler}=require('@myriaddreamin/typst-ts-node-compiler')
const compiler=NodeCompiler.create({workspace:root})
const layout=fs.readFileSync(path.join(root,'src/renderer/src/lib/typist-output/slrb/slrb.typ'),'utf8')
const pdf=compiler.pdf({mainFileContent:'#set text(font: "Liberation Serif", size: 10pt)\n'+typst.slrbVariablesPrelude()+'\n'+layout,inputs:typst.slrbCompileInputs(basic.project,basic.bridge)})
assert.ok(pdf&&pdf.length>5000,'the real addon layout compiles into PDF')
fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});fs.writeFileSync(path.join(root,'tmp/pdfs/slrb-measurements-qa.pdf'),pdf)
const injected=typst.injectSlrbLayout('// Abstract\n// Section 2: Detailed Estimates (Child Items)\nold items\n// Section 3: Signatures\nsignature',true)
assert.ok(!injected.includes('old items'));assert.match(injected,/not item.at\("templateGenerated"/);assert.equal((injected.match(/\/\/ Section 3: Signatures/g)||[]).length,1)
const componentApi=load(lib('typist-output/componentTypst'))
const componentRoot=api.syncAllSlrbItems(basic.root)
const componentNode=tree.findNode(componentRoot,'bridge')
const completeProject={...tree.createDraftProject(),...basic.project,root:componentRoot}
const part=componentApi.resolveComponentPrintPart(completeProject,componentNode,{},()=>500,{includeExternalItems:false})
assert.ok(part.compileInputs['ee-slrb'],'the normal Component Print Studio receives the addon model')
const componentPdf=compiler.pdf({mainFileContent:part.compilePrelude+'\n'+part.source,inputs:part.compileInputs})
assert.ok(componentPdf&&componentPdf.length>5000,'the complete Component Abstract plus addon layout compiles')
fs.writeFileSync(path.join(root,'tmp/pdfs/slrb-component-qa.pdf'),componentPdf)
// Render the real chapter editor in both context branches; closed catalogue dialogs are mocked.
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
function render(scene,chapter){let first=true;const view=load(path.join(root,'src/renderer/src/components/slrb/SlrbDashboard.tsx'),{
  react:{...React,useState(initial){const value=first?chapter:initial;first=false;return [value,()=>{}]}},
  '../../store/useStore':{useStore:selector=>selector({project:scene.project,setSlrb(){},select(){},openEditGeometry(){}})},
  '../../lib/dashboardSync':{dashboardContextMatches:()=>false,dashboardItemIsSynced:()=>false,dashboardComponentCompileSignature:()=>'',collectDashboardItems:()=>[]},
  '../../lib/masterData':{fetchSsrItems:async()=>[]},'../templates/UnifiedCodePicker':{default:()=>null,__esModule:true},'../modals/Modal':{default:()=>null,__esModule:true}
}).default;return renderToStaticMarkup(React.createElement(view,{node:scene.bridge}))}
const manualMarkup=render(basic,2)
assert.ok(!manualMarkup.includes('<dt>Discharge</dt>'));assert.match(manualMarkup,/A1 body \/ shaft height/)
const freshCanal=withCanal();const canalMarkup=render(freshCanal,2)
assert.match(canalMarkup,/<dt>Discharge<\/dt>/);assert.match(canalMarkup,/From Canal: Parent Canal/);assert.match(canalMarkup,/Footing-top RL/)
const overviewMarkup=render(basic,1)
assert.equal((overviewMarkup.match(/aria-current="step"/g)||[]).length,1);assert.match(overviewMarkup,/9<\/span>Review &amp; outputs/)
const manifest=require('../src/renderer/src/templates/slrb/manifest.json')
assert.equal(manifest.creationGeometry,'point');assert.equal(manifest.chapters.length,9)
console.log(`SLRB: geometry, incomplete states, stable generated items, scope guards, BBS, M25 DATA, Canal inheritance/reparenting, persistence, UI branches, Excel values and real PDF (${pdf.length} bytes) passed.`)
