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
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
  return m.exports
}
const api = name => load(path.join(lib,name+'.ts'))
const native = recipe => {
  const result = spawnSync(path.join(root,'src-tauri/target/debug',process.platform==='win32'?'rate_analysis_cli.exe':'rate_analysis_cli'),['--base'],{input:JSON.stringify(recipe),encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
  return JSON.parse(result.stdout)
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
  assert.equal(slab.morth.startingSummary.costReady,true,'No travel parameters are needed for the material-Lead base')
  const variant=(name,cls='EARTH',rateSource='chart')=>({id:name,materialName:name,conveyanceClass:cls,rateSource,...(rateSource==='manual'?{customGrossRate:10}:{})})
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
  assert.throws(()=>applicability.quantityForVariant(slab,variant('Concrete delivery','STEEL'),info),/explicit material Lead rate/)
  assert.throws(()=>lead.morthQuantityForLead(slab,{...variant('Concrete delivery','STEEL','manual'),customGrossRate:null}),/explicit material Lead rate/,'An empty manual price never falls back to a general chart tariff')
  assert.equal(lead.morthQuantityForLead(slab,variant('Concrete delivery','STEEL','manual')).quantity,300)
  assert.ok(!slab.sections.flatMap(s=>s.lines).some(l=>l.id==='machinery-0'))
  assert.equal(slab.sections.find(s=>s.key==='machinery').lines.find(l=>l.id==='machinery-3').quantity,3.5)
  assert.equal(slab.morth.source.machinery[0].quantity_expression.coefficient,300,'Source carriage evidence is preserved')
  const costs=api('projectIndividualCosts').collectProjectIndividualCosts([{node:{id:'slab',name:'Slab'},recipe:slab,path:'A'}])
  assert.ok(!costs.some(row=>String(row.sample.resource_key).endsWith('transport_tkm')))
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

  assert.throws(()=>data.buildRateAnalysisRenderData(slab),/material Lead/)
  const variants=[...new Map(lead.morthMaterialInventory(slab).map(row=>[row.name,variant(row.name,row.conveyanceClass,'manual')])).values()]
  const applications=variants.map(v=>({id:v.id,variantId:v.id,itemKey:slab.itemKey,itemNodeId:'slab',...lead.morthQuantityForLead(slab,v),morthLeadVariantSignature:lead.morthLeadVariantSignature(v),grossRate:10,grossAmount:lead.morthQuantityForLead(slab,v).quantity*10,rateYear:slab.year,rateZone:slab.zone,outputQuantity:slab.outputQuantity}))
  assert.deepEqual(lead.morthLeadIssues(slab,applications,variants),[])
  assert.ok(lead.morthLeadIssues(slab,applications.slice(1),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,rateYear:'2025-26'})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,quantity:a.quantity+1})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications.map(a=>({...a,loadingRate:1})),variants).length)
  assert.ok(lead.morthLeadIssues(slab,applications,variants.map(v=>({...v,leadKm:20}))).some(issue=>issue.includes('changed')),'A changed route must be synced or reapplied')
  assert.deepEqual(lead.morthLeadIssues(slab,applications.map(a=>({...a,grossRate:0,grossAmount:0})),variants),[],'Explicit zero additional Lead is resolved')
  const render=data.buildRateAnalysisRenderData(slab,applications,variants)
  const addition=applications.reduce((sum,a)=>sum+a.grossAmount,0)
  const money=new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
  assert.equal(render.lead_summary.final_amount_text,money.format(slab.morth.startingSummary.totalCost+addition), 'Export includes base DATA + material Lead exactly once')
  assert.equal(render.lead_summary.final_rate_text,money.format((slab.morth.startingSummary.totalCost+addition)/120))
  const dashboard=api('dashboardSync'),items=api('projectItems'),final=api('finalNumber')
  const node={id:'slab',kind:'item',itemSource:'MORTH',categoryKey:'morth',itemCode:slab.itemCode,name:'Slab',unit:'cum',computedQuantity:240,children:[]}
  const second={...node,id:'second-slab'}
  const project={id:'p',meta:{sorYear:slab.year,sorZone:slab.zone},root:{id:'root',kind:'project',name:'Project',children:[node,second]},leadChart:{variants,applications:applications.map(a=>({...a,itemKey:items.projectItemKey(node),rateAddition:99999}))}}
  const snapshot={context:dashboard.dashboardContext(project),syncedItemIds:[node.id,second.id],itemSignatures:{[node.id]:dashboard.dashboardItemSignature(node),[second.id]:dashboard.dashboardItemSignature(second)},recipes:{[node.id]:slab,[second.id]:slab},rates:{[node.id]:slab.morth.startingSummary.ratePerUnit,[second.id]:slab.morth.startingSummary.ratePerUnit}}
  project.dashboardSnapshot=snapshot
  const entries=dashboard.compileDataDashboardEntries(project,snapshot)
  const finalRate=Math.round((slab.morth.startingSummary.totalCost+addition)/120*100)/100
  assert.equal(entries.find(e=>e.representativeNodeId===node.id).rate,finalRate,'Project final rate uses the current amount and rounds once, ignoring a stale saved rateAddition')
  assert.equal(entries.find(e=>e.representativeNodeId===second.id).rate,null,'Lead applied to one usage never completes another usage')
  assert.equal(final.getItemFinal(project,second,slab.morth.startingSummary.ratePerUnit).rate,null,'Uncompiled item totals also block missing material Lead')
  assert.equal(final.getItemFinal(project,node,slab.morth.startingSummary.ratePerUnit).amount,240*finalRate,'Project quantity scales the final per-unit rate once')
  const old=structuredClone(slab);delete old.morth.costingBasis
  assert.ok(lead.morthLeadIssues(old,applications,variants).some(s=>s.includes('Sync')))
  console.log('MoRTH material Lead passed: exact nested/shared quantities, stable exclusions, fixed operations, strict units, pending final/export, annual context, manual delivery scope and SSR-compatible eligibility')
}
main().catch(error=>{console.error(error);process.exitCode=1})
