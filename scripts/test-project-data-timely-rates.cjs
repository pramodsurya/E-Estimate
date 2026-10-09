const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const ts = require('typescript')
const fixture = require('./fixtures/m25-project-data.json')
const root = path.resolve(__dirname, '..')
const lib = name => path.join(root, 'src/renderer/src/lib', `${name}.ts`)
function load(file, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX }, fileName: file
  })
  const loaded = new Module(file, module)
  loaded.filename = file
  loaded.paths = Module._nodeModulePaths(path.dirname(file))
  loaded.require = request => request in mocks ? mocks[request] : Module.createRequire(file)(request)
  loaded._compile(outputText, file)
  return loaded.exports
}
const links = load(lib('projectDataRateLinks'))
const defaults = load(lib('projectDataDefaults'), { './projectDataRateLinks': links })
const visibility = load(lib('rateAnalysisVisibility'))
const calls = []
let missingReferences = false
const supabase = { from(table) {
  const filters = {}
  const query = {
    select() { return query }, eq(key,value) { filters[key]=value;return query },
    async maybeSingle() {
      const rows = table === 'labour_rate' ? fixture.labour : fixture.machinery
      return { data: missingReferences ? null : rows.find(row => Object.entries(filters).every(([key,value]) => row[key] === value)) ?? null }
    }
  }
  return query
} }
const materialMocks = { applyMaterialRateOverrides: recipe => ({recipe,applications:[]}),
  fetchMaterialAliases: async () => new Map(), fetchMonthlyMaterials: async () => [] }
const analysis = load(lib('rateAnalysis'), {
  './supabase': {supabase}, './projectItems': {projectItemKey:node=>`PROJECT_DATA:${node.projectDataId}`},
  './rateAnalysisVisibility':visibility, './dataVariants':{applyDataVariantToRecipe:r=>r,buildDataVariantSpec:()=>({})},
  './pipeLead':{pipeLeadSourceFromContext:()=>undefined}, './materialRates':materialMocks,
  './sorReviewed':{}, './reviewedSorEstimate':{},
  './seigniorageClassification':{canonicalSeigniorageCode:code=>code},
  './sorCatalogue':{SOR_CATALOGUE_CATEGORY:'sor_catalogue',fetchSorCataloguePrice:async()=>[],sorCommercialTerms:()=>undefined,sourceContextTitle:()=>null}
})
const native = path.join(root,'src-tauri/target/debug',process.platform === 'win32' ? 'rate_analysis_cli.exe' : 'rate_analysis_cli')
function run(command,args,input) {
  return new Promise((resolve,reject) => {
    const child = spawn(command,args,{cwd:root,stdio:['pipe','pipe','pipe']})
    let output='',error=''
    child.stdout.on('data',chunk=>output+=chunk)
    child.stderr.on('data',chunk=>error+=chunk)
    child.on('error',reject)
    child.on('close',code=>code===0?resolve(output):reject(new Error(error || `Native exit ${code}`)))
    child.stdin.end(input)
  })
}
global.window = {api:{rateAnalysis:{
  calculate:async recipe=>JSON.parse(await run(native,[],JSON.stringify(recipe))),
  calculateBase:async recipe=>JSON.parse(await run(native,['--base'],JSON.stringify(recipe)))
}}}
function ssr(year) {
  const annual = fixture.years.find(row=>row.year === year)
  if (!annual) throw new Error(`No SSR exists for ${year}`)
  return {itemCode:fixture.base.code,itemSource:'SSR',year,unit:fixture.base.unit,description:fixture.base.description,
    outputQuantity:Number(fixture.base.quantity),overheadPercent:Number(annual.abstract[4].percent.replace('%','')),unresolvedLines:0,
    sections:['materials','machinery','labour'].map(key=>({key,label:key,
      lines:annual.rates[key].map((row,index)=>{
        const original=fixture.base[key][index], identity=original.resource_identity
        return {id:`${key}-${index}`,slNo:row.sl??'',description:row.desc,unit:row.unit,
          quantity:Number(row.quantity),rate:Number(row.rate),amount:Number(row.amount),sorRef:original.sor_ref,
          sourceValues:{quantity:row.quantity,rate:row.rate,amount:row.amount},
          resourceIdentity:identity && {sourceTable:identity.source_table,masterCode:identity.master_code,rateComponent:identity.rate_component,resourceKey:identity.resource_key}}
      })
    }))}
}
const engine={recalculateRateAnalysis:analysis.recalculateRateAnalysis,fetchRateAnalysis:async(node,year,options)=>{
  calls.push({node,year,zone:options.zone})
  if (node.itemSource === 'SSR') return ssr(year)
  if (!['2025-26','2026-27'].includes(year)) throw new Error(`No ${year} SOR`)
  const catalogue=node.categoryKey === 'sor_catalogue'
  return {itemSource:'SOR',itemCode:node.itemCode,unit:catalogue?'Nos.':'kg',year,zone:options.zone,
    publishedRate:node.itemCode === 'missing' ? 0 : catalogue ? year==='2025-26'?1000:1100 : year==='2025-26'?100:120,
    unresolvedLines:node.itemCode === 'missing'?1:0}
}}
const builtin=load(lib('builtInProjectData'),{'./rateAnalysis':engine,'./projectDataDefaults':defaults,'./supabase':{supabase},
  './leadApplicability':{parseLeadInfo:value=>({materials:value?.materials??{}})}})
const timely=load(lib('projectDataTimelyRates'),{'./rateAnalysis':engine,'./projectDataDefaults':defaults,
  './projectDataRateLinks':links,'./builtInProjectData':builtin,'./supabase':{supabase}})
const data=load(lib('projectData'),{'./rateAnalysis':engine,'./projectDataTimelyRates':timely,'./projectDataRateLinks':links,
  './rateAnalysisVisibility':visibility,'./projectItems':{projectItemKey:node=>`PROJECT_DATA:${node.projectDataId}`},'./materialRates':materialMocks})
const usage={id:'usage',kind:'item',name:'Custom work',children:[],itemSource:'PROJECT_DATA',projectDataId:'custom-data',itemCode:'DATA-SOR-007'}
const definition={id:usage.projectDataId,kind:'ssr',code:usage.itemCode,description:'My wearing-coat analysis',unit:'CUM',
  outputQuantity:2,overheadPercent:10,timelyRates:false,timelyOverhead:false,
  rateSource:{itemSource:'SSR',categoryKey:'ssr_item',itemCode:fixture.base.code},
  sections:links.projectDataSsrRateLinks(ssr('2025-26')),createdAt:'',updatedAt:''}
definition.sections[0].lines[0]={...links.withProjectDataRowTimely(definition.sections[0].lines[0],true),quantity:100}
const annualPrice=year=>Number(fixture.years.find(row=>row.year===year).rates.materials[0].rate)
const sor={id:'simple',kind:'sor',code:'DATA-SOR-008',description:'Custom material',unit:'kg',rate:90,timelyRates:true,
  rateSource:{itemSource:'SOR',categoryKey:'material',itemCode:'MAT-test'},createdAt:'',updatedAt:''}

async function main() {
  if (!fs.existsSync(native)) await run('cargo',['build','--manifest-path',path.join(root,'src-tauri/estimate-core/Cargo.toml'),'--bin','rate_analysis_cli'])
  assert.equal(links.projectDataRowCanRefresh({unit:'kg',quantity:1,rate:20}),false,'manual labels must never be guessed into catalogue codes')
  assert.throws(()=>builtin.annualRate({description:'Missing price',quantity:0,rate:0,sourceValues:{}}),/Missing SSR rate/,'an absent source price must not become zero even when its published quantity was zero')
  assert.equal(links.projectDataRowCanRefresh({...definition.sections[0].lines[0],rateFormula:'=MAT1_RATE*10%'}),false,'formula rows follow their dependencies')
  const old=structuredClone(definition)
  const next=await timely.resolveTimelyProjectData(definition,'2026-27','zone_3')
  assert.deepEqual(definition,old,'a pricing pass must not mutate the saved definition')
  assert.equal(next.sections[0].lines[0].quantity,100)
  assert.equal(next.outputQuantity,2)
  assert.equal(next.description,definition.description)
  assert.equal(next.overheadPercent,10,'fixed overhead must not follow the schedule')
  assert.equal(next.sections[0].lines[0].rate,annualPrice('2026-27'))
  assert.equal(next.sections[0].lines[1].rate,definition.sections[0].lines[1].rate,'unchecked rows stay fixed')
  assert.ok(defaults.projectDataRatesReady(next,'2026-27','zone_3'))
  assert.ok(!defaults.projectDataRatesReady(next,'2025-26','zone_3'))
  const count=calls.length
  assert.equal(await timely.resolveTimelyProjectData(next,'2026-27','zone_3'),next,'ready library prices are reused')
  assert.equal(calls.length,count)

  missingReferences=true
  const materialOnly=await timely.resolveTimelyProjectData(definition,'2026-27','zone_3',true)
  assert.equal(materialOnly.sections[0].lines[0].rate,annualPrice('2026-27'),'missing unchecked crew prices must not block a checked material')
  missingReferences=false
  const enabled={...definition,timelyRates:true,timelyOverhead:true,
    sections:definition.sections.map(section=>({...section,lines:section.lines.map(line=>links.withProjectDataRowTimely(line,true))}))}
  const all=await timely.resolveTimelyProjectData(enabled,'2026-27','zone_1')
  assert.equal(all.overheadPercent,13.615)
  assert.equal(all.sections.find(s=>s.key==='labour').lines.find(line=>line.description==='Crew for Concrete mixer').rate,417.3)
  assert.equal(all.sections[1].lines.find(line=>line.description==='Fuel / Energy charges').rate,142.8,'fuel uses its component rather than total machinery hire')
  assert.deepEqual(all.sections.map(s=>s.lines.map(l=>l.quantity)),enabled.sections.map(s=>s.lines.map(l=>l.quantity)))
  const fixed={...all,timelyRates:false,timelyOverhead:false,sections:all.sections.map(s=>({...s,lines:s.lines.map(l=>links.withProjectDataRowTimely(l,false))}))}
  assert.equal(await timely.resolveTimelyProjectData(fixed,'2099-00','zone_3'),fixed,'fully fixed DATA requires no new-year catalogue')
  const pending=links.pendingProjectDataRates(next)
  assert.equal(pending.rateRefresh.status,'pending')
  assert.ok(Number.isNaN(data.projectDataRate(pending)),'pending yearly prices must never appear as zero')
  assert.equal(links.pendingProjectDataRates(fixed).rateRefresh,undefined)
  const manual={...next.sections[0].lines[0],rate:999,editedFields:['rate'],timelyRates:false}
  assert.equal(links.projectDataRowTimely(manual),false)
  assert.equal(links.projectDataRowTimely(links.withProjectDataRowTimely(manual,true)),true,'checking again explicitly restores catalogue pricing')
  assert.ok(!links.withProjectDataRowTimely(manual,true).editedFields.includes('rate'))

  const customRows={...definition,sections:definition.sections.map(s=>({...s,lines:[...s.lines]}))}
  customRows.sections[0].lines.push({id:'manual',slNo:'9',description:'My cost',unit:'kg',quantity:3,rate:123,amount:369,userAdded:true,editedFields:['rate']})
  customRows.sections[0].lines.push({id:'formula',slNo:'10',description:'Dependent cost',unit:'LS',quantity:1,rate:0,amount:0,rateFormula:'=MAT1_RATE*10%'})
  const resolved=await timely.resolveTimelyProjectData(customRows,'2026-27','zone_3')
  assert.equal(resolved.sections[0].lines.at(-2).rate,123)
  const recipe=await data.projectDataRecipe(resolved,usage,'2026-27','zone_3')
  assert.equal(recipe.sections[0].lines.at(-1).rate,annualPrice('2026-27')*.1)
  assert.ok(recipe.sections[0].lines[1].editedFields.includes('rate'),'unchecked rows remain locked against project material circulars too')
  const summary=await analysis.calculateRateAnalysis(recipe)
  assert.equal(summary.ratePerUnit,data.projectDataRate(resolved),'native price agrees with the library after yearly updates')
  assert.equal(Number(recipe.recalculation.abstract.at(-1).amount),summary.ratePerUnit)

  assert.equal((await timely.resolveTimelyProjectData(sor,'2026-27','zone_3')).rate,120)
  assert.equal((await timely.resolveTimelyProjectData({...sor,timelyRates:false},'2099-00','zone_3')).rate,90)
  const sorRecipe=await data.projectDataRecipe(sor,{...usage,projectDataId:sor.id},'2026-27','zone_3')
  assert.equal((await analysis.calculateRateAnalysis(sorRecipe)).ratePerUnit,120)
  assert.equal(sorRecipe.sections[0].lines[0].materialCode,'MAT-test')
  const catalogue={...sor,unit:'Nos.',rateSource:{itemSource:'SOR',categoryKey:'sor_catalogue',itemCode:'CELL-300',sorCatalogue:{catalogueCode:'pipes',catalogueName:'Pipes',dimensions:{diameter:300,class:'NP3'}}}}
  assert.equal((await timely.resolveTimelyProjectData(catalogue,'2026-27','zone_3')).rate,1100)
  assert.deepEqual(calls.at(-1).node.sorCatalogue,catalogue.rateSource.sorCatalogue,'yearly catalogue pricing must retain exact dimensions')
  await assert.rejects(()=>timely.resolveTimelyProjectData({...sor,rateSource:undefined},'2026-27','zone_3'),/Select a SOR code/)
  await assert.rejects(()=>timely.resolveTimelyProjectData({...sor,rateSource:{...sor.rateSource,itemCode:'missing'}},'2026-27','zone_3'),/No numeric/)
  await assert.rejects(()=>timely.resolveTimelyProjectData({...sor,unit:'Tonne'},'2026-27','zone_3'),/catalogue unit/)
  await assert.rejects(()=>timely.resolveTimelyProjectData(definition,'2099-00','zone_3'),/No SSR/)
  await assert.rejects(()=>timely.resolveTimelyProjectData(definition,'','zone_3'),/Select a SOR/)
  missingReferences=true
  await assert.rejects(()=>timely.resolveTimelyProjectData(enabled,'2026-27','zone_3'),/No 2026-27/)
  missingReferences=false

  const compare=load(lib('comparativeStatement'),{
    './recipeMerge':{lineIdentity:line=>line.id},'./comparativeRows':load(lib('comparativeRows')),
    './dashboardSync':{syncProjectDashboardSnapshot:async(project,items)=>{
      const recipes={},rates={}
      for(const item of items){const def=project.projectData.find(d=>d.id===item.projectDataId)
        recipes[item.id]=await data.projectDataRecipe(def,item,project.meta.sorYear,project.meta.sorZone)
        rates[item.id]=(await analysis.calculateRateAnalysis(recipes[item.id])).ratePerUnit}
      return {recipes,rates}
    }},
    './projectPrintInputs':{collectProjectItems:node=>node.children,computeProjectPrintInputs:project=>project.dashboardSnapshot},
    './finalNumber':{},'../components/nodeVisual':{nodeDisplayName:node=>node.name}
  })
  const compared=structuredClone(next)
  compared.sections[0].lines[2]=links.withProjectDataRowTimely(compared.sections[0].lines[2],true)
  const project={id:'comparison',meta:{sorYear:'2026-27',sorZone:'zone_3'},root:{id:'root',children:[usage]},projectData:[links.pendingProjectDataRates(compared)]}
  const original=JSON.stringify(project)
  const side=year=>({year,materialRateOverrides:{},rateAnswers:{}})
  const [left,right]=await Promise.all([compare.evaluateComparativeSide(project,side('2025-26')),compare.evaluateComparativeSide(project,side('2026-27'))])
  assert.notEqual(left.inputs.rates[usage.id],right.inputs.rates[usage.id],'comparison columns independently price the checked rows in each year')
  assert.equal(left.inputs.recipes[usage.id].sections[0].lines[0].rate,annualPrice('2025-26'))
  assert.equal(right.inputs.recipes[usage.id].sections[0].lines[0].rate,annualPrice('2026-27'))
  assert.equal(left.inputs.recipes[usage.id].sections[0].lines[2].rate,1144)
  assert.equal(right.inputs.recipes[usage.id].sections[0].lines[2].rate,1230)
  assert.equal(left.inputs.recipes[usage.id].sections[0].lines[1].rate,right.inputs.recipes[usage.id].sections[0].lines[1].rate)
  assert.equal(JSON.stringify(project),original,'comparative pricing must never change the real project')
  const restored=JSON.parse(JSON.stringify(next))
  assert.equal(restored.sections[0].lines[0].timelyRates,true)
  assert.equal(restored.sections[0].lines[0].ssrRateLink.itemCode,fixture.base.code)
  assert.ok(defaults.projectDataRatesReady(restored,'2026-27','zone_3'),'saved projects retain switches, source links and the rate context')
  const form=fs.readFileSync(path.join(root,'src/renderer/src/components/data/ProjectSsrDataEditor.tsx'),'utf8')
  assert.match(form,/Timely rates — whole DATA/)
  assert.match(form,/aria-label=\{`Timely rates for/)
  const React=require('react')
  const {renderToStaticMarkup}=require('react-dom/server')
  const editor=load(path.join(root,'src/renderer/src/components/data/ProjectSsrDataEditor.tsx'),{
    '../../lib/projectData':data,'../../lib/projectDataRateLinks':links,'../../lib/rateAnalysis':engine,
    '../../lib/masterData':{SOR_CATEGORIES:[],fetchSorItems:async()=>[]},
    '../../lib/seigniorage':{fetchSeigniorageCharges:async()=>[],matchMaterialToSeigniorage:()=>null},
    '../../store/useStore':{useStore:selector=>selector({project:{meta:{}}})},
    '../modals/Modal':{default:props=>props.children,__esModule:true},
    './ProjectDataImageField':{default:()=>null,__esModule:true}
  }).default
  const markup=renderToStaticMarkup(React.createElement(editor,{value:resolved,onChange:()=>{},year:'2026-27',zone:'zone_3'}))
  assert.match(markup,/Timely rates — whole DATA/)
  assert.equal((markup.match(/aria-label="Timely rates for /g)||[]).length,1+resolved.sections.reduce((n,s)=>n+s.lines.length,0),'the real editor renders a checkbox for every resource row and overhead')
  assert.match(markup,/<input[^>]*aria-label="Timely rates for Cement for mix"[^>]*checked=""/)
  assert.match(markup,/<input[^>]*aria-label="Timely rates for My cost"[^>]*disabled=""/)
  assert.match(markup,/Link code/)
  console.log('Timely project DATA: annual SSR/SOR sources, mixed fixed rows, zones, formulas, missing prices, native totals, saved links and independent comparative years passed.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
