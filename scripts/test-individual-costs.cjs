const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),cache=new Map()
let calls=[]
const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='sor_resource_quote')return {data:{status:'priced',year:args.p_year,zone:args.p_zone,rate:args.p_year==='2026-27'?100:80}};if(name==='individual_cost_choices')return {data:[{code:'SOR-FIRST',component:'rate'},{code:'SOR-MIDDLE',component:'rate',medium:true}]};throw Error(name)}}
function load(name){if(cache.has(name))return cache.get(name);const file=path.join(root,'src/renderer/src/lib',name+'.ts');const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=req=>req==='./supabase'?{supabase:client}:req==='./projectItems'?{projectItemKey:node=>node.itemSource+':'+node.itemCode}:req.startsWith('./')?load(req.slice(2)):require(req);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);cache.set(name,m.exports);return m.exports}
async function main(){
 const api=load('individualCosts'),raw={desc:'Cement',unit:'kg',resource_key:'cement',resource_identity:{master_code:'SOR-FIRST',rate_component:'rate'},rate:'5.10'},input={owner:'SSR',kind:'materials',raw,context:'x:base:0'}
 const key=api.individualCostKey(input),morthKey=api.individualCostKey({...input,owner:'MORTH'})
 assert.notEqual(key,morthKey,'source groups must never merge')
 assert.deepEqual(JSON.parse(key),['SSR','materials','kg','SOR-FIRST','rate','1'])
 assert.equal((await api.resolveIndividualCost(raw,'kg','SSR',undefined,'2026-27','zone_3')).rate,5.1)
 assert.equal(calls.length,0,'SSR defaults must not query SOR')
 const manual={mode:'manual',rate:0,updatedAt:''}
 assert.equal((await api.resolveIndividualCost(raw,'kg','MORTH',manual,'2026-27','zone_3')).rate,0)
 assert.equal(calls.length,0,'manual requires no quote/approval request')
 await api.resolveIndividualCost(raw,'kg','MORTH',undefined,'2026-27','zone_3')
 assert.equal(calls.at(-1).args.p_recipe_code,'SOR-MIDDLE','explicit Medium is preferred')
 await api.resolveIndividualCost(raw,'kg','MORTH',undefined,'2025-26','zone_1')
 assert.equal(calls.at(-1).args.p_year,'2025-26');assert.equal(calls.at(-1).args.p_zone,'zone_1')
 const recipe={itemSource:'SSR',year:'2026-27',sections:[{key:'materials',lines:[{id:'a',description:'Cement',quantity:2,rate:5.1,unit:'kg',amount:10.2,individualCostInput:input}]}]}
 const applied=await api.applyIndividualCosts(recipe,{[key]:{mode:'manual',rate:20,updatedAt:''}},'zone_3')
 assert.equal(applied.sections[0].lines[0].rate,20);assert.equal(recipe.sections[0].lines[0].rate,5.1)
 const restored=await api.applyIndividualCosts(recipe,{},'zone_3');assert.equal(restored.sections[0].lines[0].rate,5.1)
 const isolated=await api.applyIndividualCosts(recipe,{[morthKey]:manual},'zone_3');assert.equal(isolated.sections[0].lines[0].rate,5.1)
 const locked=structuredClone(recipe);locked.sections[0].lines[0].editedFields=['rate'];locked.sections[0].lines[0].rate=77
 assert.equal((await api.applyIndividualCosts(locked,{[key]:manual},'zone_3')).sections[0].lines[0].rate,77)
 assert.equal(api.costConfidence({_evidence:{method:'role_equivalence',status:'approved'}}),'Maybe')
 assert.equal(api.costConfidence({resource_identity:{unresolved:true}}),'Review Required')
 if(process.argv.includes('--live')){
  const {createClient}=require('@supabase/supabase-js'),live=createClient('https://hqddsxnykndgcmxwqwmn.supabase.co','sb_publishable_TUvTjZ--anWcRNGSOnJGhw_q4Z3z9ES',{auth:{persistSession:false}})
  client.rpc=async(name,args)=>live.rpc(name,args)
  for(const owner of ['SSR','MORTH'])for(const kind of ['materials','machinery','labour']){
   const started=Date.now(),page=await api.fetchIndividualCosts(owner,kind,'2026-27','',0)
   assert.ok(page.total>0);for(const row of page.rows){const ctx='unknown';const computed=api.individualCostKey({owner,kind,raw:row.sample,context:ctx});if(!JSON.stringify(row.key).includes(':base:')&&!JSON.stringify(row.key).includes(':addon:'))assert.equal(computed,JSON.stringify(row.key))}
   console.log(owner,kind,page.total,'groups;',Date.now()-started,'ms')
  }
  const {data:detail,error}=await live.rpc('morth_picker_detail',{p_code:'MORTH-2019-12.01-I-A-i-medium',p_category:'medium'});if(error)throw error
  fs.writeFileSync(path.join(root,'scripts/fixtures/morth-foundation.json'),JSON.stringify(detail,null,2)+'\n')
  const binary=path.join(root,'src-tauri/target/debug/rate_analysis_cli.exe')
  global.window={api:{rateAnalysis:{calculateBase:async recipe=>{const result=spawnSync(binary,['--base'],{input:JSON.stringify(recipe),encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);return JSON.parse(result.stdout)}}}}
  const compiler=load('morthEstimate'),node={id:'m',name:'Foundation',itemCode:detail.code,itemSource:'MORTH',categoryKey:'morth',morth:{category:'medium',parameters:{},printedItem:'12.01'}}
  const result=await compiler.fetchMorthRecipe(node,'2026-27','zone_3',{}, {bridge_project_type:'new_or_widening',dewatering_required:false,shoring_strutting_required:false,approved_design_and_material_specifications:true})
  assert.deepEqual(result.morth.pending,[]);assert.equal(result.sections.find(s=>s.key==='labour').lines[0].rate,685)
  const native=await window.api.rateAnalysis.calculateBase(result);assert.equal(native.costReady,true);assert.equal(native.ratePerUnit,306.03)
  const groupKey=result.sections.find(s=>s.key==='labour').lines[0].individualCost.key
  const canonicalKey=api.individualCostGroupKey(result.sections.find(s=>s.key==='labour').lines[0].individualCostInput)
  const manualResult=await compiler.fetchMorthRecipe(node,'2026-27','zone_3',{[canonicalKey]:{mode:'manual',rate:700,updatedAt:''}},result.morth.parameters)
  assert.equal(manualResult.sections.find(s=>s.key==='labour').lines[0].rate,700)
  console.log('Live MoRTH → SOR → native DATA calculation passed')
 }
 console.log('Individual Costs: isolation, defaults, manual zero, year/zone refresh, restore, locks and confidence passed')
}
main().catch(e=>{console.error(e);process.exitCode=1})
