const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), modules = new Map()
let fetched = [], rpcCalls = [], recipes = {}
const collectItems = n => n.kind === 'item' ? [n] : (n.children ?? []).flatMap(collectItems)
const signature = n => JSON.stringify([n.itemSource, n.itemCode, n.dataVariant, n.morth])
const stubs = {
  './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push(name); if(name === 'individual_cost_choices') return {data:[]}; throw Error('Unexpected global catalogue request: '+name) } } },
  './dashboardSync': {collectDashboardItems: collectItems, dashboardItemSignature: signature, dashboardDataCompileSignature:()=>'', dashboardContextMatches: (s,p) => s?.year === p.meta.sorYear, dashboardItemIsSynced: (s,n) => s?.signatures?.[n.id] === signature(n)},
  './projectItems': {projectNodePath: (root,id) => { const walk=(n,p)=>n.id===id?p:(n.children??[]).map(c=>walk(c,[...p,n])).find(Boolean);return walk(root,[])??[] },rateAnalysisOverrideForNode:(p,n)=>p.overrides?.[n.id]},
  './componentAllowance': {effectiveAllowanceForNode:()=>({percent:0,label:'None'})},
  './projectData': {projectDataForNode:(defs,n)=>defs?.find(d=>d.id===n.projectDataId),projectDataRecipe:async d=>({itemSource:'SSR',sections:d.sections})},
  './rateAnalysis': {fetchRateAnalysis:async(n,year)=>{fetched.push([n.itemCode,year]);if(n.itemCode==='BROKEN')throw Error('Unavailable DATA');return structuredClone(recipes[n.itemCode])}},
}
function load(name){if(modules.has(name))return modules.get(name);const file=path.join(root,'src/renderer/src/lib',name+'.ts'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=r=>stubs[r]??(r.startsWith('./')?load(r.slice(2)):require(r));m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);modules.set(name,m.exports);return m.exports}
const input=(owner='SSR',extra={})=>({owner,kind:'materials',context:'x:base:0',raw:{desc:'Cement OPC 43',unit:'kg',rate:'5',resource_key:'cement',resource_identity:{master_code:'SOR-CEMENT',rate_component:'rate'},...extra}})
const line=(i,id='a')=>({id,description:i.raw.desc,unit:i.raw.unit,quantity:1,rate:5,amount:5,individualCostInput:i})
const recipe=(i)=>({itemSource:i.owner,itemCode:'A',year:'2026-27',sections:[{key:i.kind,label:i.kind,lines:[line(i)]}]})
const node=(id,code='A',owner='SSR')=>({id,kind:'item',name:'DATA '+id,itemCode:code,itemSource:owner,categoryKey:'ssr_item',children:[]})
const project=(items)=>({id:'p',meta:{sorYear:'2026-27',sorZone:'zone_3'},root:{id:'root',kind:'project',name:'Project',children:items},projectData:[{id:'UNUSED',kind:'ssr',sections:[{lines:[line(input())]}]}],overrides:{unused:recipe(input())}})
function renderCombinedCosts(project,inventory,editId) {
 const React=require('react'),file=path.join(root,'src/renderer/src/components/data/IndividualCostsPanel.tsx'),m=new Module(file,module)
 let state=0
 const values={4:{project,...inventory},9:editId?{id:editId,view:'edit'}:null}
 m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file))
 m.require=request=>{
  if(request==='react')return {...React,useState:initial=>[++state in values?values[state]:typeof initial==='function'?initial():initial,()=>{}],useMemo:fn=>fn(),useEffect:()=>{}}
  if(request.endsWith('.css'))return {}
  if(request.endsWith('/store/useStore'))return {useStore:selector=>selector({project,updateMeta:()=>{}})}
  if(request.endsWith('/SorPicker')||request==='./MiscellaneousCostsPanel'||request==='./IndividualItemsPrintStudio')return {__esModule:true,default:()=>null}
  if(request.endsWith('/catalogueGuidance'))return {compareCatalogueCodes:(a,b)=>a.localeCompare(b)}
  if(request.includes('/lib/'))return request.endsWith('/dashboardSync')?stubs['./dashboardSync']:load(path.basename(request))
  return require(request)
 }
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText,file)
 return require('react-dom/server').renderToStaticMarkup(React.createElement(m.exports.default))
}
async function main(){
 const api=load('projectIndividualCosts'),cost=load('individualCosts'),ssr=input(),morth=input('MORTH')
 const a=node('a'),b=node('b'),m=node('m','M','MORTH')
 recipes={A:recipe(ssr),M:recipe(morth)}
 let p=project([a,b,m]),result=await api.loadProjectIndividualCosts(p)
 assert.equal(result.rows.length,2,'Only used DATA resources; SSR and MoRTH never merge')
 const combined=renderCombinedCosts(p,result)
 assert.equal((combined.match(/<tr[^>]*data-cost-source=/g)??[]).length,2,'Both source resources appear together in Materials')
 assert.match(combined,/class="cost-source-badge" data-cost-source="MORTH"/)
 assert.match(combined,/class="cost-source-badge" data-cost-source="SSR"/)
 assert.doesNotMatch(combined,/aria-pressed=|cost-source-tabs/,'Source labels are a legend, not separate source tabs')
 assert.match(combined,/2 unique resources/)
 for(const row of result.rows) {
  const edit=renderCombinedCosts(p,result,row.id)
  assert.ok(edit.includes(`Applies to matching ${row.owner==='MORTH'?'MoRTH':'SSR'}`),'Mixed-list editing retains the row source')
  assert.ok(edit.includes(row.owner==='SSR'?'SSR_Year / project default':'Default starting rate'))
 }
 assert.equal(fetched.filter(([code])=>code==='A').length,1,'Repeated DATA source fetched once')
 assert.equal(result.rows.find(r=>r.owner==='SSR').analyses,2)
 assert.equal(result.rows.find(r=>r.owner==='SSR').usages,2)
 assert.deepEqual(result.errors,[]);assert.equal(rpcCalls.length,0,'Inventory never queries the full catalogue or global usages')
 result=await api.loadProjectIndividualCosts(project([m]));assert.equal(result.rows.length,1,'Removed DATA resources disappear even when source remains cached')
 result=await api.loadProjectIndividualCosts(project([]));assert.equal(result.rows.length,0,'Unused definitions and overrides never populate an empty project')
 const custom=project([{...node('placed-custom'),itemSource:'PROJECT_DATA',projectDataId:'UNUSED'}]);result=await api.loadProjectIndividualCosts(custom);assert.equal(result.rows.length,1,'Source rows in placed project DATA are included')
 const other=input('MORTH',{resource_key:'cement-in-another-analysis',desc:'  Cement OPC 43  '})
 assert.notEqual(cost.individualCostKey(morth),cost.individualCostKey(other))
 assert.equal(cost.individualCostGroupKey(morth),cost.individualCostGroupKey(other),'Same resource and binding merge despite occurrence keys')
 const entries=[{node:a,recipe:recipe(morth),path:'Component A'},{node:b,recipe:recipe(other),path:'Component B'}]
 let groups=api.collectProjectIndividualCosts(entries);assert.equal(groups.length,1);assert.equal(groups[0].memberKeys.length,2);assert.equal(groups[0].locations.length,2)
 const adoption={mode:'manual',rate:17,updatedAt:''},saved={[groups[0].id]:adoption}
 assert.equal(cost.individualCostAdoption(morth,saved),adoption);assert.equal(cost.individualCostAdoption(other,saved),adoption)
 assert.equal(cost.individualCostAdoption(input('MORTH',{resource_key:'new-occurrence'}),saved),adoption,'New matching DATA joins existing adoption')
 assert.equal(cost.individualCostAdoption(ssr,saved),undefined,'MoRTH adoption cannot affect SSR')
 const alias=input('MORTH',{desc:'OPC cement grade 43'});groups=api.collectProjectIndividualCosts([...entries,{node:node('alias'),recipe:recipe(alias),path:'C'}]);assert.equal(groups.length,1,'Published identity merges description aliases transitively');assert.equal(groups[0].adoptionKeys.length,2);assert.equal(groups[0].analyses,3)
 assert.notEqual(cost.individualCostGroupKey(morth),cost.individualCostGroupKey(input('MORTH',{unit:'tonne'})))
 assert.notEqual(cost.individualCostGroupKey(morth),cost.individualCostGroupKey(input('MORTH',{desc:'Cement PPC'})))
 assert.notEqual(cost.individualCostGroupKey(morth),cost.individualCostGroupKey(input('MORTH',{resource_identity:{master_code:'OTHER',rate_component:'rate'}})))
 assert.notEqual(cost.individualCostGroupKey(morth),cost.individualCostGroupKey(input('MORTH',{resource_identity:{master_code:'SOR-CEMENT',rate_component:'hire'}})))
 const complex=recipe(ssr);complex.sections[0].lines.push({...line(ssr,'b'),editedFields:['rate']});complex.dataVariant={additionAnalysis:{sections:[{key:'labour',lines:[line({...input('SSR',{desc:'Mate',unit:'day',resource_identity:{master_code:'LAB'}}),kind:'labour'},'addon')]}]}}
 groups=api.collectProjectIndividualCosts([{node:a,recipe:complex,path:'A'}]);assert.equal(groups.length,2);assert.equal(groups.find(r=>r.kind==='materials').usages,2);assert.ok(groups.find(r=>r.kind==='materials').locations.some(u=>u.locked));assert.ok(groups.find(r=>r.kind==='labour').locations[0].via.includes('addition'))
 const placeholder=(desc,id)=>({...line(input('SSR',{desc,rate:'0',quantity:'0',amount:'0',resource_identity:{resource_key:id}}),id),quantity:0,rate:0,amount:0})
 const inventoryRecipe=recipe(ssr);inventoryRecipe.itemCode='IRR-CCDW-5-4';inventoryRecipe.sections[0].lines=[
  placeholder('NIL','nil'),placeholder('','blank'),placeholder('—','dash'),
  {...placeholder('','header'),individualCostInput:input('SSR',{desc:'',rate:'in Rs.',amount:'in Rs',quantity:'',resource_identity:{}})},
  {...placeholder('Cement with rate to adopt','real-zero'),individualCostInput:input('SSR',{desc:'Cement with rate to adopt',rate:'0',resource_identity:{master_code:'REAL-ZERO'}})},
  {...placeholder('','unnamed-value'),quantity:2,amount:10},
  {...placeholder('','unnamed-linked'),individualCostInput:input('SSR',{desc:'',rate:'0',quantity:'0',amount:'0',resource_identity:{master_code:'REAL-UNNAMED'}})},
 ]
 const inventoryBefore=JSON.stringify(inventoryRecipe)
 groups=api.collectProjectIndividualCosts([{node:node('inventory','IRR-CCDW-5-4'),recipe:inventoryRecipe,path:'Project / Apron'}])
 assert.equal(groups.length,3,'NIL, blank zero rows and copied headers do not become editable resources')
 assert.ok(groups.some(r=>r.description==='Cement with rate to adopt'&&r.minRate===0),'A named zero-rate resource stays visible')
 assert.equal(groups.filter(r=>r.descriptionMissing).length,2,'Unlabelled value or a real binding remains traceable for correction')
 assert.ok(groups.every(r=>r.locations[0].dataCode==='IRR-CCDW-5-4'&&r.locations[0].analysisCode==='IRR-CCDW-5-4'&&r.locations[0].rowLabel.includes('row')))
 assert.equal(JSON.stringify(inventoryRecipe),inventoryBefore,'Inventory filtering does not change the source analysis or its totals')
 const repeated=recipe(ssr);repeated.sections[0].lines.push(line(ssr,'same-resource-again'))
 groups=api.collectProjectIndividualCosts([{node:a,recipe:repeated,path:'A'}]);assert.equal(groups[0].locations.length,2,'Usage details identify every contributing resource row');assert.equal(groups[0].analyses,1)
 const nested=recipe(morth);nested.morth={inputs:{a:{dependency:recipe(ssr)}}};groups=api.collectProjectIndividualCosts([{node:a,recipe:nested,path:'A'}]);assert.equal(groups.length,1);assert.equal(groups[0].owner,'SSR','Dependency assembly is expanded into its actual resource rows')
 const appendix=recipe(morth);appendix.itemCode='MORTH-APPENDIX-21.07';appendix.morth={printedItem:'21.07',inputs:{}}
 const parent=recipe(morth);parent.itemCode='MORTH-PARENT-14.01';parent.morth={inputs:{a:{dependency:appendix}}}
 groups=api.collectProjectIndividualCosts([{node:node('parent','MORTH-PARENT-14.01','MORTH'),recipe:parent,path:'Apron'}]);
 assert.equal(groups[0].locations[0].dataCode,'MORTH-PARENT-14.01');assert.equal(groups[0].locations[0].analysisCode,'MORTH-APPENDIX-21.07');assert.equal(groups[0].locations[0].analysisLabel,'MoRTH 21.07','Appendix resources retain both parent DATA and consuming analysis identity')
 const snapshot=project([a]);snapshot.dashboardSnapshot={year:'2026-27',signatures:{a:signature(a)},recipes:{a:recipe(ssr)}};fetched=[];await api.loadProjectIndividualCosts(snapshot);assert.equal(fetched.length,0,'Current compiled recipes require no source fetch')
 p=project([a,node('broken','BROKEN')]);result=await api.loadProjectIndividualCosts(p);assert.equal(result.rows.length,1);assert.equal(result.errors.length,1,'One failed DATA does not hide other project resources')
 p.meta.sorYear='2025-26';await api.loadProjectIndividualCosts(p);assert.ok(fetched.some(([code,year])=>code==='A'&&year==='2025-26'),'Year change uses current annual rows')
 fetched=[];await api.loadProjectIndividualCosts(project([node('cancelled','CANCELLED')]),()=>true);assert.equal(fetched.length,0,'Cancelled views do not queue source requests')
 console.log('Project Individual Costs passed: project scoping, source caching, removal, grouping, isolation, nested/selected additions, local locks, partial failures and year refresh')
}
main().catch(e=>{console.error(e);process.exitCode=1})
