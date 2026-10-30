const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const ts = require('typescript'), { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..'), lib = path.join(root, 'src/renderer/src/lib'), cache = new Map()
const layout = () => ({ codeVisible:true, descriptionVisible:true, unitQuantityVisible:true, sections:{materials:{visible:true},machinery:{visible:true},labour:{visible:true}},labourSummary:{visible:true},abstract:{visible:true},descriptionRuns:[] })
const mocks = {
  supabase: { supabase: { rpc: () => { throw Error('Unexpected network request') } } },
  rateAnalysis: { labourRowsForDisplay: () => [] },
  projectData: {}, projectTax: {}, seigniorage: {}, pipeLead: {},
  rateAnalysisVisibility: { defaultRateAnalysisLayout:layout, descriptionRunsForDisplay:text=>[{text}] },
  signatureFooter: { DATA_SIGNATURE_SCOPE:'data', printableSignatureRows:()=>[], resolveSignatureFooter:()=>({enabled:false}) },
  univerSpreadsheet: { isUniverWorkbookData:()=>false }, documentFinal:{resolveDocumentFinal:()=>({value:null})}
}
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const m = new Module(file,module); cache.set(file,m); m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file))
  m.require = request => {
    if (request.endsWith('?raw')) return fs.readFileSync(path.resolve(path.dirname(file),request.slice(0,-4)),'utf8')
    if (!request.startsWith('.')) return require(request)
    const target=path.resolve(path.dirname(file),request)+'.ts', name=path.basename(target,'.ts')
    return mocks[name] ?? load(target)
  }
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText,file)
  return m.exports
}
const api = name => load(path.join(lib,name+'.ts'))
function renderMorthSheet(recipe, leadApplications=[], leadVariants=[]) {
  const file=path.join(root,'src/renderer/src/components/data/MorthAnalysisSheet.tsx'),m=new Module(file,module)
  m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file))
  m.require=request=>{
    if(request.endsWith('.css'))return {}
    if(request.includes('/store/useStore'))return {useStore:()=>({})}
    if(request==='../sor/SorPicker')return {__esModule:true,default:()=>null}
    if (!request.startsWith('.')) return require(request)
    const target=path.resolve(path.dirname(file),request)
    return load(target+(fs.existsSync(target+'.tsx')?'.tsx':'.ts'))
  }
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText,file)
  return require('react-dom/server').renderToStaticMarkup(require('react').createElement(m.exports.default,{recipe,leadApplications,leadVariants}))
}
const native = recipe => {
  const result = spawnSync(path.join(root,'src-tauri/target/debug',process.platform==='win32'?'rate_analysis_cli.exe':'rate_analysis_cli'),['--base'],{input:JSON.stringify(recipe),encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  return JSON.parse(result.stdout)
}
function renderLeadNavigation(relativeFile,project) {
  const file=path.join(root,'src/renderer/src/components',relativeFile),m=new Module(file,module)
  m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file))
  m.require=request=>request.includes('/store/useStore')
    ? {useStore:selector=>selector({project,leadSelection:null,openLeadMaterial:()=>{},setActivity:()=>{},setDashboardSnapshot:()=>{}})}
    : request.startsWith('.')?load(path.resolve(path.dirname(file),request)+'.ts'):require(request)
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText,file)
  return require('react-dom/server').renderToStaticMarkup(require('react').createElement(m.exports.default))
}
global.window={api:{rateAnalysis:{calculateBase:async recipe=>native(recipe)}}}
function simple(materials=[],machinery=[]) {
  const recipe={schemaVersion:1,itemKey:'MORTH:T',itemCode:'T',itemSource:'MORTH',categoryKey:'morth',description:'Test',unit:'cum',year:'2026-27',zone:'zone_3',outputQuantity:10,overheadPercent:0,sections:[],morth:{source:{materials,machinery,labour:[],rate_divisor:10,calculation:{overhead_percent:10,contractor_profit_percent:10,overhead_base:'direct_cost',profit_base:'direct_cost_plus_overheads'}},parameters:{},inputs:{},printedItem:'T',pending:[]}}
  recipe.sections=['materials','machinery','labour'].map(key=>({key,label:key,lines:(recipe.morth.source[key]??[]).map((raw,index)=>{
    const id=`${key}-${index}`
    recipe.morth.inputs[id]={raw,rate:100}
    return {id,slNo:String(index+1),description:raw.desc,unit:raw.unit,quantity:raw.quantity??0,rate:100,amount:0,individualCostInput:{owner:'MORTH',kind:key,context:'test',raw}}
  })}))
  return recipe
}
async function main() {
  const lead=api('morthMaterialLead'),morth=api('morthEstimate'),applicability=api('leadApplicability'),data=api('typist-output/dataTypst')
  const raw=structuredClone(require('./fixtures/morth-slab-appendix.json'))
  function removeOldDistanceParameters(recipe){for(const key of Object.keys(recipe.morth.parameters))if(/lead_km/.test(key))delete recipe.morth.parameters[key];for(const input of Object.values(recipe.morth.inputs))if(input.dependency)removeOldDistanceParameters(input.dependency)}
  removeOldDistanceParameters(raw)
  const slab=await morth.prepareMorthRecipe(raw)
  const incompleteHtml=renderMorthSheet(slab),incompleteAbstract=incompleteHtml.match(/<table class="morth-sheet-abstract">([\s\S]*?)<\/table>/)[1]
  assert.ok(incompleteAbstract.includes(new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(slab.morth.startingSummary.ratePerUnit)),'The calculated rate stays visible while material Lead is unresolved')
  assert.ok(!incompleteAbstract.includes('Pending'))
  assert.equal((incompleteAbstract.match(/Rate per cum/g)||[]).length,1,'The abstract has one unit-rate row, without a duplicate final-rate row')
  assert.ok(!incompleteAbstract.includes('direct cost'))
  assert.ok(incompleteHtml.includes('Lead to add or review'),'The sheet explains missing Lead separately from the calculated rate')
  assert.ok(incompleteHtml.includes('before finalising'))
  const qaDir=path.join(root,'output/playwright');fs.mkdirSync(qaDir,{recursive:true})
  const sheetCss=['styles/styles.css','components/morth/morth.css','components/data/morthSheet.css'].map(file=>fs.readFileSync(path.join(root,'src/renderer/src',file),'utf8')).join('\n')
  fs.writeFileSync(path.join(qaDir,'morth-calculated-rate.html'),`<!doctype html><html><head><meta charset="utf-8"><title>MoRTH calculated rate QA</title><style>${sheetCss}\nbody{margin:0;background:#f1f5f9;padding:24px}.rate-sheet{max-width:1400px;margin:auto}</style></head><body>${incompleteHtml}</body></html>`)
  assert.equal(slab.morth.startingSummary.costReady,true,'No travel parameters are needed for the material-Lead base')
  const variant=(name,cls='EARTH',rateSource='chart')=>({id:name,materialName:name,conveyanceClass:cls,rateSource,leadKm:1,...(rateSource==='manual'?{customGrossRate:10}:{})})
  const sand=variant('Sand'),info=applicability.parseLeadInfo(slab.leadApplicability)
  assert.equal(applicability.quantityForVariant(slab,sand,info).quantity,54,'162 × 120/360 is exact sand consumption')
  assert.equal(lead.morthQuantityForLead(slab,variant('Stone','STONE')).quantity,108)
  assert.ok(Math.abs(lead.morthQuantityForLead(slab,variant('Cement','CEMENT')).quantity-48.38)<1e-9)
  assert.ok(Math.abs(lead.morthQuantityForLead(slab,variant('Water','WATER')).quantity-82.352)<1e-9,'Nested water is scaled once and converted from kL')
  assert.equal(applicability.basisForData(info,'initial_1km','including all leads'), 'none')
  assert.equal(applicability.handlingModeForData(info,variant('Water','WATER'),'manual_no_idle'),'none','Fixed water handling is never added again')
  assert.equal(applicability.handlingModeForData(info,sand,'manual_no_idle'),'manual_no_idle','Material supply handling remains available when DATA does not include it')
  assert.ok(applicability.isEligibleForLead({source:'MORTH',description:'Slab'},sand,info))
  const refs=applicability.materialRefsForLeadInfo(info)
  assert.ok(refs.some(ref=>ref.name==='Sand'))
  assert.ok(refs.some(ref=>ref.name==='Concrete delivery'),'Processed concrete delivery is distinct from its ingredients')
  assert.equal(lead.morthQuantityForLead(slab,variant('Concrete delivery','STEEL')).unit,'km')
  assert.equal(lead.morthQuantityForLead(slab,variant('Concrete delivery','STEEL')).quantity,1)
  const nativeTransport=slab.sections.flatMap(s=>s.lines).find(l=>l.id==='machinery-0')
  assert.equal(nativeTransport.quantity,300,'Default 1 km evaluates original 300 × L1 tonne-km')
  assert.ok(nativeTransport.amount>0,'Default transport is priced in the original machinery row')
  assert.equal(slab.morth.inputs['machinery-0'].rate,2299/180,'Matching truck hourly rate uses original chapter 1 travel model')
  assert.equal(slab.morth.parameters.concrete_plant_haul_lead_km,1)
  assert.equal(slab.sections.find(s=>s.key==='machinery').lines.find(l=>l.id==='machinery-3').quantity,3.5)
  assert.equal(slab.morth.source.machinery[0].quantity_expression.coefficient,300,'Source carriage evidence is preserved')
  const costs=api('projectIndividualCosts').collectProjectIndividualCosts([{node:{id:'slab',name:'Slab'},recipe:slab,path:'A'}])
  assert.ok(costs.some(row=>String(row.sample.resource_key).endsWith('transport_tkm')),'Original native transport remains an identifiable resource')
  assert.ok(costs.some(row=>row.sample.resource_key==='morth:water_tanker_12_kl'),'Fixed tanker operations retain their source rate group')

  const shared=structuredClone(slab),child=shared.morth.inputs['materials-0'].dependency
  shared.morth.source.materials.push({...shared.morth.source.materials[0],quantity:60})
  shared.morth.inputs['materials-2']={raw:shared.morth.source.materials[2],rate:null,dependency:child}
  assert.equal(lead.morthQuantityForLead(await morth.prepareMorthRecipe(shared),sand).quantity,81,'Two edges into a shared appendix each contribute consumption')
  const broken=structuredClone(slab);broken.morth.inputs['materials-0'].dependency.outputQuantity=0
  assert.throws(()=>lead.morthQuantityForLead(broken,sand),/exact Sand quantity/,'Missing scale never invents a preview quantity')
  const signed=await morth.prepareMorthRecipe(simple([{resource_key:'morth:coarse_sand_appendix',desc:'Sand credit',quantity:2,sign:-1,unit:'cum'}]))
  assert.equal(lead.morthQuantityForLead(signed,sand).quantity,-2)
  assert.equal(lead.morthFinalRate(signed,-10.05,[]),-1.01,'Negative credit rates use the same half-away-from-zero rounding as native and Excel')
  const weight=await morth.prepareMorthRecipe(simple([{resource_key:'morth:steel_sections_wrought_MS_quintal',desc:'Steel',quantity:2,unit:'quintal'}]))
  assert.equal(lead.morthQuantityForLead(weight,variant('Steel','STEEL')).quantity,.2)

  const carriage={resource_key:'morth:tipper_14_cum_transport_tkm',desc:'Carriage',unit:'tonne-km',quantity:null,quantity_expression:{type:'affine',constant:0,coefficient:30,parameter:'material_haul_lead_km',parameter_unit:'km'}}
  const water={resource_key:'morth:water_tanker_12_kl',desc:'Water tanker',unit:'hour',quantity:null,quantity_expression:{type:'affine',constant:3.5,coefficient:.583,parameter:'water_supply_lead_km',parameter_unit:'km'}}
  const materials=[{resource_key:'morth:coarse_sand_appendix',desc:'Sand',quantity:2,unit:'cum'},{resource_key:'morth:water',desc:'Water',quantity:3,unit:'kL'}]
  const split=await morth.prepareMorthRecipe(simple(materials,[carriage,water]))
  assert.equal(split.morth.startingSummary.costReady,true,JSON.stringify(split.morth.startingSummary.missing))
  assert.equal(split.morth.startingSummary.baseCost,850,'Material 500 + fixed operations 350; carriage excluded')
  const noRate=structuredClone(split);noRate.morth.inputs['machinery-0'].rate=null
  assert.equal(native(noRate).costReady,true,'Excluded carriage rate is never validated')
  const far=structuredClone(split);far.morth.parameters.water_supply_lead_km=100
  assert.equal(native(far).baseCost,850,'Legacy distance cannot reintroduce carriage')
  const zero=structuredClone(split);zero.morth.parameters.water_supply_lead_km=0
  assert.equal(native(zero).baseCost,850,'Fixed operations survive zero distance')
  const unknown=await morth.prepareMorthRecipe(simple([],[{resource_key:'morth:smooth_steel_tandem_roller_static_vibratory',desc:'Roller',unit:'hour',quantity_expression:{type:'parameter',parameter:'missing_recycled_bc_I_roller_hours'}}]))
  assert.equal(unknown.morth.startingSummary.costReady,false,'A non-Lead missing quantity remains in DATA')
  const fixedCarriage=await morth.prepareMorthRecipe(simple([],[{...carriage,quantity:30,quantity_expression:undefined}]))
  assert.ok(lead.morthLeadIssues(fixedCarriage,[],[]).some(s=>s.includes('physical material quantity')),'Fixed carriage without a reviewed distance cannot be silently free')
  const ordinaryTanker=await morth.prepareMorthRecipe(simple([],[{resource_key:'morth:water_tanker_12_kl',desc:'Filling only',quantity:.533,unit:'hour'}]))
  assert.equal(ordinaryTanker.morth.startingSummary.sectionTotals.machinery,53.3,'Fixed source rows are not classified by machine name alone')

  // Exercise the actual fetch/option expansion boundary without network calls.
  const costsApi=api('individualCosts'),oldCosts={...costsApi}
  const optionWater={...water,costing_options:{selection_parameter:'water_method',options:{source:{},small:{quantity_expression:{type:'parameter',parameter:'small_tanker_hours',positive:true},components:[{desc:'Alternative tanker',unit:'hour',section:'machinery'}]}}}}
  costsApi.costRpc=async()=>({code:'T',recipe:simple(materials,[optionWater]).morth.source,context:{},candidates:{}})
  costsApi.resolveIndividualCost=async()=>({rate:100,label:'Test price'})
  costsApi.preloadMorthResourceDefaults=async()=>{}
  const optionNode={id:'option',itemSource:'MORTH',itemCode:'T',morth:{category:'medium',parameters:{water_method:'small',small_tanker_hours:99}}}
  const oldHours=await morth.fetchMorthRecipe(optionNode,'2026-27','zone_3')
  assert.equal(oldHours.morth.startingSummary.costReady,false,'Legacy total equipment hours cannot be reused after the split')
  optionNode.morth.parameters.small_tanker_hours_fixed_operations=2
  const revised=await morth.fetchMorthRecipe(optionNode,'2026-27','zone_3')
  assert.equal(revised.morth.startingSummary.costReady,true)
  assert.equal(revised.morth.startingSummary.sectionTotals.machinery,200,'Alternative capacity uses explicitly revised fixed-operation hours')
  Object.assign(costsApi,oldCosts)

  assert.equal(data.buildRateAnalysisRenderData(slab).totals.rate_per_unit,slab.morth.startingSummary.ratePerUnit,'Pending Lead must not block the current print preview')
  const variants=[...new Map(lead.morthMaterialInventory(slab).map(row=>[row.name,variant(row.name,row.conveyanceClass,'manual')])).values()]
  const pricing=api('morthLeadPricing')
  const applications=variants.flatMap(v=>lead.morthLeadScopes(slab,v.materialName,v.conveyanceClass).map(scope=>{
    const quantity=lead.morthQuantityForLead(scope.recipe,v,true)
    return {id:`${v.id}:${scope.path.join('/')}`,variantId:v.id,itemKey:slab.itemKey,itemNodeId:'slab',morthAppendixPath:scope.path,morthAppendixLabel:scope.label,morthRootFactor:scope.factor,morthRootOutputQuantity:slab.outputQuantity,...quantity,morthLeadVariantSignature:lead.morthLeadVariantSignature(v),grossRate:10,grossAmount:Math.round(quantity.quantity*10*100)/100,rateYear:slab.year,rateZone:slab.zone,outputQuantity:scope.recipe.outputQuantity}
  }))
  assert.deepEqual(lead.morthLeadIssues(slab,applications,variants),[])
  const unique=api('leadApplications')
  assert.equal(unique.normalizeLeadApplications(applications,variants).length,applications.length,'Direct and nested Water applications coexist on the same parent item')
  assert.ok(lead.morthLeadIssues(slab,applications.slice(1),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,rateYear:'2025-26'})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,quantity:a.quantity+1})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,loadingRate:1})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications,variants.map(v=>({...v,leadKm:20}))).some(issue=>issue.includes('changed')),'A changed route must be synced or reapplied')
  assert.deepEqual(lead.morthLeadIssues(slab,applications.map(a=>({...a,grossRate:0,grossAmount:0})),variants),[],'Explicit zero additional Lead is resolved')
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,morthAppendixPath:undefined})),variants).some(issue=>issue.includes('Reapply')),'Legacy aggregate applications need an explicit appendix selection')
  const priced=await pricing.priceMorthLead(slab,applications,variants)
  const stoneApplications=applications.filter(app=>app.variantId==='Stone')
  const stoneOnly=await pricing.priceMorthLead(slab,stoneApplications,variants)
  const stoneAppendix=stoneOnly.morth.inputs['materials-0'].dependency
  const stoneRows=stoneAppendix.sections.flatMap(section=>section.lines).filter(line=>stoneAppendix.morth.inputs[line.id]?.raw.material_lead_charge===true)
  assert.deepEqual(stoneRows.map(line=>line.description.split(' Lead')[0]),['Stone'],'CA Lead belongs only to the concrete appendix')
  assert.equal(stoneRows[0].amount,stoneApplications[0].grossAmount)
  assert.equal(stoneOnly.sections[0].lines[0].rate,(stoneAppendix.morth.startingSummary.baseCost+stoneAppendix.morth.startingSummary.morthLeadAmount)/stoneAppendix.outputQuantity,'Parent DATA reads the CA Lead-inclusive appendix rate even when other material Leads are pending')
  assert.ok(stoneOnly.morth.startingSummary.ratePerUnit>slab.morth.startingSummary.ratePerUnit)
  assert.ok(!stoneOnly.sections.flatMap(section=>section.lines).some(line=>line.description.startsWith('Stone Lead')),'No second CA charge at the parent')
  assert.match(renderMorthSheet(stoneOnly,stoneApplications,variants),/includes material Lead/,'The parent identifies the adopted appendix rate as Lead-inclusive')
  const legacyStone=stoneApplications.map(app=>({...app,quantity:app.quantity*app.morthRootFactor,outputQuantity:slab.outputQuantity,
    quantitySource:`${slab.itemCode}/morth:dependency_RCC_M25_21_07:0/aggregate`,grossAmount:Math.round(app.quantity*app.morthRootFactor*app.grossRate*100)/100}))
  assert.equal(legacyStone[0].quantity,108,'Reproduces the saved Apron parent-basis application')
  const recoveredStone=await pricing.priceMorthLead(slab,legacyStone,variants)
  const recoveredAppendix=recoveredStone.morth.inputs['materials-0'].dependency
  assert.equal(recoveredAppendix.morth.appliedLeadApplications[0].quantity,324,'Restore the concrete appendix 360 cum basis')
  assert.equal(recoveredAppendix.morth.appliedLeadApplications[0].grossAmount,stoneApplications[0].grossAmount)
  assert.equal(recoveredStone.morth.startingSummary.totalCost,stoneOnly.morth.startingSummary.totalCost)
  assert.equal(lead.morthLeadPricingReady(recoveredStone,legacyStone),true,'Saved parent-basis inputs do not cause repeated recalculation')
  assert.ok(!lead.morthLeadIssues(recoveredStone,legacyStone,variants).some(issue=>issue.includes('Stone Lead pending')))
  assert.equal((await pricing.priceMorthLead(recoveredStone,legacyStone,variants)).morth.startingSummary.totalCost,recoveredStone.morth.startingSummary.totalCost)
  assert.equal(legacyStone[0].quantity,108,'Pricing never mutates the saved source')
  assert.equal(lead.normalizeMorthLeadApplications(slab,legacyStone.map(app=>({...app,quantityManuallyEdited:true})),variants)[0].quantity,108,'Explicit quantity edits are not silently rewritten')
  assert.equal(lead.normalizeMorthLeadApplications(slab,legacyStone.map(app=>({...app,quantity:107})),variants)[0].quantity,107,'Unrelated invalid quantities remain pending')
  const transport=api('morthTransport'),routeVariant={...variants.find(v=>v.materialName==='Concrete delivery'),rateSource:'morth_transport',customGrossRate:null,leadKm:20,actualLeadKm:10}
  const routeVariants=variants.map(v=>v.id===routeVariant.id?routeVariant:v)
  const routeApps=applications.map(app=>app.variantId===routeVariant.id?{...app,grossRate:0,grossAmount:0,morthLeadVariantSignature:lead.morthLeadVariantSignature(routeVariant)}:app)
  const routed=await pricing.priceMorthLead(slab,routeApps,routeVariants)
  const machinery=r=>r.sections.find(s=>s.key==='machinery').lines.find(l=>l.id==='machinery-0')
  assert.equal(machinery(routed).quantity,3000,'Actual 10 km, not equivalent 20 km, drives original tonne-km')
  assert.match(renderMorthSheet(routed,routeApps,routeVariants),/300 × 10/,'DATA shows the coefficient multiplied by actual lead instead of the evaluated tonne-km')
  const transportPrint=api('typist-output/dataTypst').buildRateAnalysisRenderData(routed,routeApps,routeVariants).machinery[0]
  assert.equal(transportPrint.qty_text,'300 × 10')
  assert.match(transportPrint.description,/Lead = 10 km/)
  assert.equal(transportPrint.quantity,3000,'Numeric quantity is retained for calculations and exports')
  assert.equal(transportPrint.amount,machinery(routed).amount)
  const alternateTransport=structuredClone(routed.morth.inputs['machinery-0'].raw)
  alternateTransport.quantity_expression.coefficient=301
  assert.equal(transport.morthTransportQuantityLabel(routed,alternateTransport),'301 × 10','Display uses the selected source coefficient')
  assert.equal(transport.morthTransportQuantityLabel(slab,slab.morth.inputs['machinery-0'].raw),'300 × 1','Default distance is shown as a number')
  assert.equal(transport.morthTransportDistance(routed,'concrete_plant_haul_lead_km').source,'From Lead')
  assert.ok(!routed.sections.flatMap(s=>s.lines).some(l=>l.description.startsWith('Concrete delivery Lead')),'No second transport charge')
  const manual=await pricing.priceMorthLead(transport.withMorthManualDistance(routed,[],'concrete_plant_haul_lead_km',4),routeApps,routeVariants)
  assert.equal(machinery(manual).quantity,1200,'Manual km takes precedence')
  assert.equal(transport.morthTransportQuantityLabel(manual,manual.morth.inputs['machinery-0'].raw),'300 × 4')
  assert.ok(manual.morth.startingSummary.totalCost<routed.morth.startingSummary.totalCost,'Full analysis recalculates when distance changes')
  const zeroTransport=await pricing.priceMorthLead(transport.withMorthManualDistance(manual,[],'concrete_plant_haul_lead_km',0),routeApps,routeVariants)
  assert.equal(machinery(zeroTransport).quantity,0,'Explicit zero is not replaced by default')
  assert.equal(transport.morthTransportQuantityLabel(zeroTransport,zeroTransport.morth.inputs['machinery-0'].raw),'300 × 0')
  assert.equal(machinery(zeroTransport).amount,0)
  const returned=await pricing.priceMorthLead(transport.withMorthManualDistance(zeroTransport,[],'concrete_plant_haul_lead_km',undefined),routeApps,routeVariants)
  assert.equal(machinery(returned).quantity,3000,'Clearing manual returns to applied Lead')
  const removedRoute=await pricing.priceMorthLead(returned,routeApps.filter(app=>app.variantId!==routeVariant.id),routeVariants)
  assert.equal(machinery(removedRoute).quantity,300,'Removing route returns to default 1 km')
  const adopted=structuredClone(slab);const adoptedLine=machinery(adopted);adoptedLine.rate=18;adoptedLine.editedFields=['rate'];
  assert.equal(machinery(await morth.prepareMorthRecipe(adopted)).rate,18,'Directly adopted tonne-km rate overrides derived rate')
  const changedHourly=structuredClone(slab);changedHourly.morth.inputs['machinery-1'].rate=3600
  assert.equal(machinery(await morth.prepareMorthRecipe(changedHourly)).rate,20,'Hourly rate adoption updates bare haulage rate')
  const missingHourly=structuredClone(slab);missingHourly.morth.inputs['machinery-1'].rate=null
  assert.equal((await morth.prepareMorthRecipe(missingHourly)).morth.startingSummary.costReady,false,'Missing hourly price cannot leave a stale derived transport rate')
  const merged=api('recipeMerge').mergeSavedRecipe(slab,manual)
  assert.equal(machinery(await pricing.priceMorthLead(merged,routeApps,routeVariants)).quantity,1200,'Manual km survives source refresh')
  const restored=await pricing.priceMorthLead(JSON.parse(JSON.stringify(manual)),routeApps,routeVariants)
  assert.equal(machinery(restored).quantity,1200,'Manual distance survives save/reopen')
  assert.equal(machinery(slab).quantity,300,'Per-usage edits do not mutate shared source')
  const parent=simple([{desc:'Concrete dependency',quantity:120,unit:'cum'}]);parent.morth.inputs['materials-0'].dependency=slab
  const nestedManual=transport.withMorthManualDistance(parent,['materials-0'],'concrete_plant_haul_lead_km',7)
  assert.equal(nestedManual.morth.inputs['materials-0'].dependency.morth.transportManualKm.concrete_plant_haul_lead_km,7,'Distance belongs to the consuming appendix path')
  assert.equal(parent.morth.inputs['materials-0'].dependency.morth.transportManualKm,undefined,'Shared appendix source remains untouched')
  const nextYear=structuredClone(parent);nextYear.year='2027-28'
  assert.equal(api('recipeMerge').mergeMorthTransport(nextYear,nestedManual).inputs['materials-0'].dependency.morth.transportManualKm.concrete_plant_haul_lead_km,7,'Appendix override survives annual source refresh')
  assert.throws(()=>transport.withMorthManualDistance(slab,[],'concrete_plant_haul_lead_km',-1),/nonnegative/)
  assert.throws(()=>transport.withMorthManualDistance(slab,[],'concrete_plant_haul_lead_km',NaN),/nonnegative/)
  const completeHtml=renderMorthSheet(priced,applications,variants)
  assert.ok(completeHtml.includes('Rate includes the Lead currently applied.'))
  assert.ok(!completeHtml.includes('Lead to add or review'))
  assert.deepEqual(lead.morthLeadIssues(priced,applications,variants),[])
  assert.equal(lead.morthLeadPricingReady(priced,applications),true)
  assert.equal((await pricing.priceMorthLead(priced,applications,variants)).morth.startingSummary.totalCost,priced.morth.startingSummary.totalCost,'Repeated pricing never compounds Lead')
  const cement=applications.find(app=>app.variantId==='Cement')
  assert.equal(unique.upsertUniqueLeadApplication([{...cement,id:'old-aggregate',morthAppendixPath:undefined}],variants,cement).length,1,'Explicit appendix reapplication replaces the legacy aggregate charge')
  assert.deepEqual(cement.morthAppendixPath,['materials-0'])
  assert.equal(cement.quantity,145.14,'Appendix cement Lead uses its own 360 cum production basis')
  assert.ok(Math.abs(cement.quantity*cement.morthRootFactor-48.38)<1e-9,'Parent consumption scales the appendix basis exactly once')
  const concrete=priced.morth.inputs['materials-0'].dependency
  const chargeRows=r=>r.sections.flatMap(s=>s.lines).filter(line=>r.morth.inputs[line.id]?.raw.material_lead_charge===true)
  assert.deepEqual(chargeRows(concrete).map(line=>line.description.split(' Lead')[0]).sort(),['Cement','Sand','Stone'])
  assert.deepEqual(chargeRows(priced).map(line=>line.description.split(' Lead')[0]).sort(),['Water'],'Only direct material Lead is added at the parent; native concrete transport stays in machinery')
  assert.ok(concrete.morth.startingSummary.baseCost>slab.morth.inputs['materials-0'].dependency.morth.startingSummary.baseCost)
  assert.equal(priced.sections[0].lines[0].rate,(concrete.morth.startingSummary.baseCost+concrete.morth.startingSummary.morthLeadAmount)/concrete.outputQuantity,'The parent reads the Lead-inclusive direct appendix rate')
  const nested=lead.morthLeadScopes(priced,'Water','WATER').find(scope=>scope.path.length===2)
  assert.ok(chargeRows(nested.recipe).some(line=>line.description.startsWith('Water Lead')),'Nested water Lead stays in its own consuming appendix')
  const weighted=api('weightedLead'),waterVariant=variants.find(v=>v.id==='Water'),farWater={...waterVariant,id:'far-water',leadKm:20}
  const waterApps=applications.filter(app=>app.variantId==='Water').map(app=>app.morthAppendixPath.length?{...app,variantId:farWater.id}:app)
  const waterWeights=weighted.weightedLeadEntriesFromSeigniorage([waterVariant,farWater],waterApps,[{materialLabel:'Water',unit:'kL',quantityTerms:[{itemNodeId:'slab',quantity:82.352}]}])
  assert.ok(Math.abs(waterWeights.find(row=>row.variantId==='Water').quantity-63)<1e-9)
  assert.ok(Math.abs(waterWeights.find(row=>row.variantId==='far-water').quantity-19.352)<1e-9,'Weighted Lead allocates the parent material quantity among its consuming scopes without duplication')
  const expected=structuredClone(slab)
  for(const scope of lead.morthLeadScopes(expected)){
    for(const row of lead.morthMaterialInventory(scope.recipe).filter(row=>row.analysisPath.length===0)){
      if(row.name==='Concrete delivery')continue
      const index=scope.recipe.morth.source.materials.findIndex(raw=>raw.resource_key===row.identity)
      assert.ok(index>=0)
      const raw=scope.recipe.morth.source.materials[index]
      const sourceQ=scope.recipe.morth.startingSummary.computedLines[`materials-${index}`].quantity
      scope.recipe.morth.inputs[`materials-${index}`].rate+=10*row.quantity/sourceQ
    }
  }
  assert.ok(priced.morth.startingSummary.totalCost<native(expected).totalCost,'SSR-style local Lead must not acquire the parent overhead/profit charged by delivered-material prices')
  assert.equal(priced.morth.startingSummary.totalCost,Math.round((priced.morth.startingSummary.morthAbstract.find(row=>row.id==='total').amount+priced.morth.startingSummary.morthLeadAmount)*100)/100,'Native final cost adds local Lead once after the base abstract')
  const render=data.buildRateAnalysisRenderData(priced,applications,variants)
  const money=new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
  assert.equal(render.lead_summary.final_amount_text,money.format(priced.morth.startingSummary.totalCost), 'Export uses the native Lead-inclusive DATA amount exactly once')
  assert.equal(render.lead_summary.final_rate_text,money.format(priced.morth.startingSummary.ratePerUnit))
  assert.deepEqual(render.leads.map(row=>row.material),['Water'],'Only direct DATA Lead appears below the parent abstract')
  const appendixRender=data.buildMorthAppendixRenderData([priced]).find(a=>a.description===concrete.description)
  assert.ok(appendixRender.leads.some(row=>row.material==='Cement'))
  assert.ok(!appendixRender.materials.some(row=>row.description.startsWith('Cement Lead')))
  const registry=api('morthAppendices'),routes=variants.map(v=>({...v,id:`second-${v.id}`,leadKm:20,customGrossRate:20}))
  const secondApplications=applications.map(app=>{const v=routes.find(v=>v.materialName===variants.find(first=>first.id===app.variantId).materialName);return {...app,id:`second-${app.id}`,itemNodeId:'second-slab',variantId:v.id,morthLeadVariantSignature:lead.morthLeadVariantSignature(v),grossRate:20,grossAmount:Math.round(app.quantity*20*100)/100}})
  const secondPriced=await pricing.priceMorthLead(slab,secondApplications,routes)
  assert.ok(secondPriced.morth.startingSummary.totalCost>priced.morth.startingSummary.totalCost,'Two components may use the same appendix code with different Lead rates')
  assert.equal(registry.collectMorthAppendices([priced,secondPriced]).length,4,'Different concrete and nested-water Lead configurations remain separate appendix sheets')
  assert.equal(registry.collectMorthAppendices([priced,await pricing.priceMorthLead(slab,applications.map(app=>({...app,id:`same-${app.id}`})),variants)]).length,2,'Identical source routes and rates can still share appendix sheets')
  const equalRateRoutes=variants.map(v=>({...v,id:`equal-rate-${v.id}`,startPointId:'different-quarry',leadKm:50}))
  const equalRateApps=applications.map(app=>{const v=equalRateRoutes.find(v=>v.materialName===variants.find(first=>first.id===app.variantId).materialName);return {...app,id:`equal-${app.id}`,variantId:v.id,morthLeadVariantSignature:lead.morthLeadVariantSignature(v)}})
  const equalRatePriced=await pricing.priceMorthLead(slab,equalRateApps,equalRateRoutes)
  assert.equal(registry.collectMorthAppendices([priced,equalRatePriced]).length,2,'Same code and calculated rate share appendices even when route identities differ')
  const repeated=await morth.prepareMorthRecipe(shared)
  const repeatedApplications=variants.flatMap(v=>lead.morthLeadScopes(repeated,v.materialName,v.conveyanceClass).map(scope=>{
    const q=lead.morthQuantityForLead(scope.recipe,v,true)
    return {...applications.find(app=>app.variantId===v.id),id:`${v.id}:${scope.path.join('/')}`,morthAppendixPath:scope.path,morthAppendixLabel:scope.label,morthRootFactor:scope.factor,...q,grossAmount:Math.round(q.quantity*10*100)/100,outputQuantity:scope.recipe.outputQuantity}
  }))
  const alternateCement={...variants.find(v=>v.id==='Cement'),id:'alternate-cement',leadKm:15,customGrossRate:30}
  const repeatedWithRoutes=repeatedApplications.map(app=>app.variantId==='Cement'&&app.morthAppendixPath[0]==='materials-2'?{...app,variantId:alternateCement.id,morthLeadVariantSignature:lead.morthLeadVariantSignature(alternateCement),grossRate:30,grossAmount:Math.round(app.quantity*30*100)/100}:app)
  const repeatedVariants=[...variants,alternateCement]
  assert.equal(unique.normalizeLeadApplications(repeatedWithRoutes,repeatedVariants).filter(app=>app.variantId==='Cement'||app.variantId===alternateCement.id).length,2,'Repeated appendix edges keep independent material routes')
  const repeatedPriced=await pricing.priceMorthLead(repeated,repeatedWithRoutes,repeatedVariants)
  assert.deepEqual(lead.morthLeadIssues(repeatedPriced,repeatedWithRoutes,repeatedVariants),[])
  assert.notEqual(repeatedPriced.morth.inputs['materials-0'].dependency.morth.startingSummary.ratePerUnit,repeatedPriced.morth.inputs['materials-2'].dependency.morth.startingSummary.ratePerUnit,'One parent can consume separate Lead configurations of the same appendix')
  const roundTrip=JSON.parse(JSON.stringify(priced))
  assert.equal(lead.morthLeadPricingReady(roundTrip,applications),true,'Lead pricing and appendix identities survive a saved-project round trip')
  const removed=await pricing.priceMorthLead(priced,applications.filter(app=>app.id!==cement.id),variants)
  assert.ok(!chargeRows(removed.morth.inputs['materials-0'].dependency).some(row=>row.description.startsWith('Cement Lead')))
  assert.ok(lead.morthLeadIssues(removed,applications.filter(app=>app.id!==cement.id),variants).some(issue=>issue.includes('Cement Lead pending')))
  const dashboard=api('dashboardSync'),items=api('projectItems'),final=api('finalNumber')
  const node={id:'slab',kind:'item',itemSource:'MORTH',categoryKey:'morth',itemCode:slab.itemCode,name:'Slab',unit:'cum',computedQuantity:240,children:[]}
  const second={...node,id:'second-slab'}
  const project={id:'p',meta:{sorYear:slab.year,sorZone:slab.zone},root:{id:'root',kind:'project',name:'Project',children:[node,second]},leadChart:{variants,applications:applications.map(a=>({...a,itemKey:items.projectItemKey(node),rateAddition:99999}))}}
  const snapshot={context:dashboard.dashboardContext(project),syncedItemIds:[node.id,second.id],itemSignatures:{[node.id]:dashboard.dashboardItemSignature(node),[second.id]:dashboard.dashboardItemSignature(second)},recipes:{[node.id]:priced,[second.id]:slab},rates:{[node.id]:slab.morth.startingSummary.ratePerUnit,[second.id]:slab.morth.startingSummary.ratePerUnit}}
  project.dashboardSnapshot=snapshot
  const leadSummary=api('leadMaterialSummary')
  const oneRouteProject={...project,leadChart:{variants:[routeVariant],applications:[]},dashboardSnapshot:{...snapshot,leadDashboardEntries:[{materialName:'Concrete delivery',conveyanceClass:'STEEL',applications:[]}]}}
  const sidebarMaterials=leadSummary.projectLeadMaterials(oneRouteProject)
  for(const name of ['Cement','Sand','Stone','Water','Concrete delivery']) assert.ok(sidebarMaterials.some(row=>row.name===name),`${name} remains visible before its route is created`)
  assert.equal(sidebarMaterials.find(row=>row.name==='Cement').variantCount,0)
  assert.equal(sidebarMaterials.find(row=>row.name==='Concrete delivery').variantCount,1)
  assert.equal(sidebarMaterials.reduce((sum,row)=>sum+row.linkedCount,0),0,'Inventory sync never applies routes automatically')
  const fullLeadSidebar=renderLeadNavigation('lead/LeadSidebarPanel.tsx',oneRouteProject)
  const bottomLeadPanel=renderLeadNavigation('data/EstimateLeadPanel.tsx',oneRouteProject)
  for(const material of sidebarMaterials) {
    assert.ok(fullLeadSidebar.includes(`data-tour-material="${material.name.toLowerCase()}"`))
    assert.ok(bottomLeadPanel.includes(`data-tour-material="${material.name.toLowerCase()}"`))
  }
  assert.match(fullLeadSidebar,/aria-label="Sync Lead materials"/)
  assert.doesNotMatch(bottomLeadPanel,/tonne \/ cum/,'Concrete delivery shows its native km model')
  const liveSummary=leadSummary.projectLeadMaterials(project)
  assert.equal(liveSummary.reduce((sum,row)=>sum+row.variantCount,0),variants.length,'Route counts use live Lead state')
  assert.equal(liveSummary.reduce((sum,row)=>sum+row.linkedCount,0),project.leadChart.applications.length)
  const workspace=api('leadWorkspace'), group=items.projectItemGroups(project.root)[0]
  const workspaceInfo=applicability.parseLeadInfo(workspace.leadMetadataForGroup(group,undefined,snapshot.recipes))
  assert.ok(applicability.isEligibleForLead(group,variant('Cement','CEMENT'),workspaceInfo),'Cement in an appendix is selectable after DATA Sync, before separate Lead metadata exists')
  const sources=workspace.leadAppendixSources(slab,'Cement')
  assert.equal(sources.length,1)
  assert.match(sources[0],/Appendix 21\.07/)
  assert.match(sources[0],/48\.38 tonne per DATA basis/,'The appendix shows scaled cement consumption without floating-point noise')
  assert.match(workspace.leadAppendixSources(slab,'Water').join('; '),/21\.22/,'Nested appendix references remain visible')
  assert.deepEqual(workspace.leadAppendixSources(slab,'Concrete delivery'),[],'Direct concrete delivery is not mislabeled as appendix cement')
  assert.equal(workspace.showAllLeadData('new-lead',null,false,false),true,'A new normal Lead displays eligible DATA before it has links')
  assert.equal(workspace.showAllLeadData('linked-lead',null,false,true),false,'Existing linked Leads retain their source filter')
  assert.equal(workspace.showAllLeadData('scoped-lead',null,true,false),false,'Component-specific Leads retain their component filter')
  assert.equal(workspace.showAllLeadData('scoped-lead','scoped-lead',true,false),true)
  const noCement=await morth.prepareMorthRecipe(simple([{resource_key:'morth:water',desc:'Water',quantity:3,unit:'kL'}]))
  const withoutCement=workspace.leadMetadataForGroup({...group,usages:[group.usages[0]]},slab.leadApplicability,{slab:noCement})
  assert.ok(!applicability.materialRefsForLeadInfo(applicability.parseLeadInfo(withoutCement)).some(ref=>ref.name==='Cement'),'Current per-usage DATA overrides stale code-level material metadata')
  assert.ok(!lead.morthLeadIssues(slab,[],[]).join('; ').includes('48.379999'),'Pending quantities use readable precision')
  const entries=dashboard.compileDataDashboardEntries(project,snapshot)
  const finalRate=priced.morth.startingSummary.ratePerUnit
  assert.equal(entries.find(e=>e.representativeNodeId===node.id).rate,finalRate,'Project final rate uses the current amount and rounds once, ignoring a stale saved rateAddition')
  assert.equal(entries.find(e=>e.representativeNodeId===second.id).rate,null,'Lead applied to one usage never completes another usage')
  assert.equal(final.getItemFinal(project,second,slab.morth.startingSummary.ratePerUnit).rate,null,'Uncompiled item totals also block missing material Lead')
  assert.equal(final.getItemFinal(project,node,slab.morth.startingSummary.ratePerUnit).amount,240*finalRate,'Project quantity scales the final per-unit rate once')
  const both={...project,leadChart:{variants:[...variants,...routes],applications:[...project.leadChart.applications,...secondApplications.map(app=>({...app,itemKey:items.projectItemKey(second)}))]},dashboardSnapshot:{...snapshot,recipes:{...snapshot.recipes,[second.id]:secondPriced}}}
  const bothEntries=dashboard.compileDataDashboardEntries(both,both.dashboardSnapshot)
  assert.equal(bothEntries.find(entry=>entry.representativeNodeId===node.id).rate,priced.morth.startingSummary.ratePerUnit)
  assert.equal(bothEntries.find(entry=>entry.representativeNodeId===second.id).rate,secondPriced.morth.startingSummary.ratePerUnit,'Separate component appendix routes reach separate final project rates')
  const refreshed=await dashboard.refreshMorthLeadSnapshot({...project,dashboardSnapshot:{...snapshot,recipes:{[node.id]:slab,[second.id]:slab}}})
  assert.equal(refreshed.recipes[node.id].morth.startingSummary.totalCost,priced.morth.startingSummary.totalCost,'Applying Lead refreshes the cached private appendix tree without a backend fetch')
  const legacyProject={...project,leadChart:{...project.leadChart,applications:legacyStone.map(app=>({...app,itemKey:items.projectItemKey(node)}))},dashboardSnapshot:{...snapshot,recipes:{[node.id]:slab,[second.id]:slab}}}
  const repairedSnapshot=await dashboard.refreshMorthLeadSnapshot(legacyProject)
  assert.equal(repairedSnapshot.leadApplicationUpdates.find(app=>app.id===legacyStone[0].id).quantity,324,'Lead refresh supplies the repaired quantity for normal project persistence')
  assert.equal(repairedSnapshot.leadApplicationUpdates.find(app=>app.id===legacyStone[0].id).outputQuantity,360)
  assert.equal(repairedSnapshot.recipes[node.id].morth.startingSummary.totalCost,stoneOnly.morth.startingSummary.totalCost)
  const routeProject={...project,leadChart:{variants:routeVariants,applications:routeApps.map(app=>({...app,itemKey:items.projectItemKey(node)}))},dashboardSnapshot:{...snapshot,recipes:{[node.id]:slab,[second.id]:slab}}}
  const routeSnapshot=await dashboard.refreshMorthLeadSnapshot(JSON.parse(JSON.stringify(routeProject)))
  assert.equal(machinery(routeSnapshot.recipes[node.id]).quantity,3000,'Applying route refreshes project native transport')
  assert.equal(machinery(routeSnapshot.recipes[second.id]).quantity,300,'Route applies only to selected usage')
  const zeroProject=JSON.parse(JSON.stringify({...routeProject,rateAnalysisScopedOverrides:{[node.id]:{[items.projectItemKey(node)]:zeroTransport}}}))
  assert.equal(items.rateAnalysisOverrideResolution(zeroProject,node).scope,'item','A distance saved by Apply km belongs to this item usage')
  assert.equal(items.rateAnalysisOverrideForNode(zeroProject,node).morth.transportManualKm.concrete_plant_haul_lead_km,0,'Zero is retained when resolving a saved item override')
  assert.equal(items.rateAnalysisOverrideForNode(zeroProject,second),null,'The item override does not affect another usage')
  const zeroSnapshot=await dashboard.refreshMorthLeadSnapshot(zeroProject)
  assert.equal(machinery(zeroSnapshot.recipes[node.id]).quantity,0,'Snapshot refresh reads the saved zero override rather than the route or default')
  assert.equal(machinery(zeroSnapshot.recipes[node.id]).amount,0)
  assert.equal(machinery(zeroSnapshot.recipes[second.id]).quantity,300,'Other usages keep their own distance')
  const zeroEntry=dashboard.compileDataDashboardEntries(zeroProject,zeroSnapshot).find(entry=>entry.representativeNodeId===node.id)
  assert.equal(zeroEntry.scope,'item_edit')
  assert.equal(zeroEntry.rate,zeroTransport.morth.startingSummary.ratePerUnit,'Compiled DATA uses the zero-distance native total')
  assert.equal(dashboard.compileDataDashboardEntries(routeProject,routeSnapshot).find(entry=>entry.representativeNodeId===node.id).rate,routed.morth.startingSummary.ratePerUnit,'Project abstract reads native transport-inclusive rate')
  assert.deepEqual(chargeRows(slab),[],'The shared source recipe is never mutated by per-component pricing')
  const old=structuredClone(slab);delete old.morth.costingBasis
  assert.ok(lead.morthLeadIssues(old,applications,variants).some(s=>s.includes('Sync')))
  console.log('MoRTH material Lead passed: exact nested/shared quantities, stable exclusions, fixed operations, strict units, pending editor status with printable current rate, annual context, manual delivery scope and SSR-compatible eligibility')
}
main().catch(error=>{console.error(error);process.exitCode=1})
