const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{spawnSync}=require('node:child_process'),{createClient}=require('@supabase/supabase-js')
const root=path.resolve(__dirname,'..'),cache=new Map(),calls=[]
const live=createClient('https://hqddsxnykndgcmxwqwmn.supabase.co','sb_publishable_TUvTjZ--anWcRNGSOnJGhw_q4Z3z9ES',{auth:{persistSession:false}})
const client={rpc:async(name,args)=>{calls.push(name);return live.rpc(name,args)}}
function load(name){if(cache.has(name))return cache.get(name);const file=path.join(root,'src/renderer/src/lib',name+'.ts'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m.require=r=>r==='./supabase'?{supabase:client}:r==='./projectItems'?{projectItemKey:n=>`${n.itemSource}:${n.itemCode}`} :r.startsWith('./')?load(r.slice(2)):require(r);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);cache.set(name,m.exports);return m.exports}
global.window={api:{rateAnalysis:{calculateBase:async recipe=>{const result=spawnSync(path.join(root,'src-tauri/target/debug/rate_analysis_cli.exe'),['--base'],{input:JSON.stringify(recipe),encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);return JSON.parse(result.stdout)}}}}
async function main(){
 const costs=load('individualCosts'),morth=load('morthEstimate')
 const water={unit:'kL',price_lookup:{table:'SOR_Year',recipe_code:'SOR-P02-T03-R0164',rate_component:'rate'}}
 assert.equal((await costs.resolveIndividualCost(water,'kL','MORTH',undefined,'2026-27','zone_3')).rate,81)
 assert.equal((await costs.resolveIndividualCost(water,'kL','MORTH',{mode:'sor',code:'SOR-P02-T03-R0165',updatedAt:''},'2026-27','zone_3')).rate,109)
 const benchmark={unit:'hour',price_lookup:{table:'analysis_resource',resource_code:'MORTH_SRC_54D3FBDD6D7E38FA2AB3'}}
 const stored=await costs.resolveIndividualCost(benchmark,'hour','MORTH',undefined,'2026-27','zone_3');assert.equal(stored.rate,2299);assert.equal(stored.source,'benchmark');assert.ok(stored.label.includes('2019'))
 const labour={unit:'day',price_lookup:{table:'analysis_resource',resource_code:'MORTH_EW_SKILLED_MAZDOOR'}}
 const starting=await costs.resolveIndividualCost(labour,'day','MORTH',undefined,'2026-27','zone_3');assert.equal(starting.rate,685);assert.equal(starting.source,'starting-sor')
 assert.equal((await costs.resolveIndividualCost(labour,'day','MORTH',{mode:'manual',rate:700,updatedAt:''},'2026-27','zone_3')).rate,700)
 assert.equal(morth.morthDependencyCode({code_template:'MORTH-2019-21.22-{project_category}',available_dependency_codes:['MORTH-2019-21.22-medium']},'small'),'MORTH-2019-21.22-medium')
 const node={id:'slab',itemSource:'MORTH',itemCode:'MORTH-2019-14.01-B-i-p-medium',name:'RCC M25 solid slab up to 5m',categoryKey:'morth',morth:{category:'medium',printedItem:'14.01',parameters:{}}}
 const parameters={concrete_plant_haul_lead_km:0,water_supply_lead_km:0}
 const recipe=await morth.fetchMorthRecipe(node,'2026-27','zone_3',{},parameters)
 const material=recipe.sections.find(s=>s.key==='materials').lines.find(l=>l.description.includes('Appendix 21.07'))
 assert.ok(material,'Original parent concrete row is retained');const appendix=recipe.morth.inputs[material.id].dependency;assert.ok(appendix);assert.equal(appendix.morth.printedItem,'21.07')
 assert.ok(material.rate>0,'Calculated appendix costs flow into the parent row');assert.equal(recipe.morth.startingSummary.costReady,true,'Explicit zero haul quantities do not need an unused transport price')
 console.log('Appendix pending:',appendix.morth.pending,'machinery:',appendix.sections.find(s=>s.key==='machinery').lines.map(l=>({description:l.description,rate:l.rate,label:l.individualCost?.label})))
 assert.deepEqual(appendix.morth.pending,[],'Stored component candidates complete the appendix starting rate')
 assert.equal(recipe.sections.find(s=>s.key==='materials').lines.find(l=>l.description.includes('Water delivered')).rate,81)
 const native=await window.api.rateAnalysis.calculateBase(recipe);assert.equal(native.computedLines[material.id].rate,appendix.morth.startingSummary.baseCost/appendix.outputQuantity)
 console.log('Slab known rate',material.rate,'appendix direct cost',appendix.morth.startingSummary.baseCost,'pending:',recipe.morth.pending)
 const plant=appendix.sections.find(s=>s.key==='machinery').lines.find(l=>l.description.includes('Batching plant'))
 const manualKey=costs.individualCostGroupKey(plant.individualCostInput)
 const changed=await morth.fetchMorthRecipe(node,'2026-27','zone_3',{[manualKey]:{mode:'manual',rate:1000,updatedAt:''}},parameters)
 const changedMaterial=changed.sections.find(s=>s.key==='materials').lines.find(l=>l.id===material.id)
 assert.notEqual(changedMaterial.rate,material.rate,'Editing an appendix ingredient updates parent rate without separately adding an item')
 fs.writeFileSync(path.join(root,'scripts/fixtures/morth-slab-appendix.json'),JSON.stringify(recipe,null,2)+'\n')
 console.log('Live MoRTH passed: water units, stored benchmarks, source price choices, automatic appendices, partial cost propagation and ingredient-to-parent recalculation')
}
main().catch(e=>{console.error(e);process.exitCode=1})
