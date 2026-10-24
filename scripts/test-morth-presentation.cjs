const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..'),lib=path.join(root,'src/renderer/src/lib'),cache=new Map(),out=path.join(root,'output/morth-redesign')
fs.mkdirSync(out,{recursive:true})
const layout=()=>({codeVisible:true,descriptionVisible:true,unitQuantityVisible:true,sections:{materials:{visible:true},machinery:{visible:true},labour:{visible:true}},labourSummary:{visible:true},abstract:{visible:true},descriptionRuns:[]})
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports
 const m=new Module(file,module);cache.set(file,m);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file))
 m.require=request=>{
  if(request.endsWith('?raw'))return fs.readFileSync(path.resolve(path.dirname(file),request.slice(0,-4)),'utf8')
  if(!request.startsWith('.'))return require(request)
  const target=path.resolve(path.dirname(file),request)+'.ts',name=path.basename(target)
  if(name==='rateAnalysis.ts')return {labourRowsForDisplay:()=>[]}
  if(name==='dataSheets.ts')return {calculateDataSheets:async s=>s}
  if(name==='supabase.ts')return {supabase:{rpc:()=>{throw Error('Unexpected database request')}}}
  if(name==='projectItems.ts')return {projectItemKey:n=>`${n.itemSource}:${n.itemCode}`}
  if(name==='leadApplicability.ts')return {parseLeadInfo:()=>({}),addonLeadRuleForVariant:()=>null}
  if(name==='rateAnalysisVisibility.ts')return {defaultRateAnalysisLayout:layout,descriptionRunsForDisplay:text=>[{text,bold:false,italic:false,underline:false}]}
  if(name==='signatureFooter.ts')return {DATA_SIGNATURE_SCOPE:'data',printableSignatureRows:()=>[],resolveSignatureFooter:()=>({enabled:false})}
  return load(target)
 }
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file)
 return m.exports
}
const native=recipe=>{const r=spawnSync(path.join(root,'src-tauri/target/debug',process.platform==='win32'?'rate_analysis_cli.exe':'rate_analysis_cli'),['--base'],{input:JSON.stringify(recipe),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
global.window={api:{rateAnalysis:{calculateBase:async r=>native(r)}}}
async function main(){
 const registry=load(path.join(lib,'morthAppendices.ts')),misc=load(path.join(lib,'miscellaneousCosts.ts')),morth=load(path.join(lib,'morthEstimate.ts')),data=load(path.join(lib,'typist-output/dataTypst.ts')),excel=load(path.join(lib,'excel-output/dataExcel.ts'))
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/morth-slab-appendix.json'),'utf8'))
 async function prepare(r,settings){let next=structuredClone(r);for(const input of Object.values(next.morth.inputs))if(input.dependency)input.dependency=await prepare(input.dependency,settings);return morth.prepareMorthRecipe(misc.applyMiscellaneousCosts(next,settings))}
 const recipe=await prepare(original),copy=structuredClone(recipe);copy.itemKey='second-slab'
 const appendices=registry.collectMorthAppendices([recipe,copy]);assert.equal(appendices.length,2,'Concrete and nested water appendices are collected once each')
 assert.deepEqual(appendices.map(a=>a.recipe.morth.printedItem),['21.07','21.22'])
 const reordered=structuredClone(recipe);reordered.morth.inputs=Object.fromEntries(Object.entries(reordered.morth.inputs).reverse());assert.deepEqual(registry.collectMorthAppendices([reordered]).map(a=>a.recipe.itemCode),appendices.map(a=>a.recipe.itemCode),'Appendix order follows source rows, not asynchronous rate completion');assert.equal(registry.morthAnalysisIdentity(reordered),registry.morthAnalysisIdentity(recipe));
 const unused=structuredClone(recipe);Object.values(unused.morth.inputs).find(i=>i.dependency).dependency.morth.parameters.unused_parent_setting=123;assert.equal(registry.collectMorthAppendices([recipe,unused]).length,2,'Unused parent inputs must not duplicate shared appendices')
 const changed=structuredClone(recipe);const concrete=Object.values(changed.morth.inputs).find(i=>i.dependency).dependency;concrete.sections[0].lines[0].rate+=1
 assert.equal(registry.collectMorthAppendices([recipe,changed]).length,3,'Different appendix costs must retain separate sheets')
 const rules=misc.miscellaneousDefinitions(recipe),profit=rules.find(r=>r.id==='profit'),overhead=rules.find(r=>r.id==='overhead');assert.equal(profit.defaultPercent,10);assert.equal(overhead.defaultPercent,20)
 const settings={[profit.key]:{percent:15,updatedAt:''}},repriced=await prepare(original,settings)
 assert.ok(repriced.morth.startingSummary.ratePerUnit>recipe.morth.startingSummary.ratePerUnit)
 assert.equal(repriced.morth.startingSummary.morthAbstract.find(r=>r.id==='profit').percent,15)
 assert.equal(Object.values(repriced.morth.inputs).find(i=>i.dependency).dependency.morth.startingSummary.profitAmount,0,'A parent profit change never adds markup to a direct-cost appendix')
 assert.equal((await prepare(original,{})).morth.startingSummary.ratePerUnit,recipe.morth.startingSummary.ratePerUnit,'Source default can be restored')
 const ssr={schemaVersion:1,itemKey:'SSR:test',itemCode:'SSR:test',description:'SSR test',itemSource:'SSR',outputQuantity:1,unit:'cum',overheadPercent:14,sections:[{key:'labour',label:'Labour',lines:[{id:'labour-0',slNo:'1',description:'Labour',unit:'day',quantity:1,rate:100,amount:100}]}]};const ssrRule=misc.miscellaneousDefinitions(ssr)[0];assert.notEqual(ssrRule.key,overhead.key);assert.equal(misc.applyMiscellaneousCosts(ssr,{[ssrRule.key]:{percent:12,updatedAt:''}}).overheadPercent,12);assert.equal(native(misc.applyMiscellaneousCosts(ssr,{[ssrRule.key]:{percent:12,updatedAt:''}})).ratePerUnit,112)
 const lead=load(path.join(lib,'morthMaterialLead.ts'))
 assert.throws(()=>data.buildRateAnalysisRenderData(recipe),/material Lead/,'A base rate cannot be exported as a complete MoRTH rate')
 // Explicitly resolve every material for this presentation fixture. The focused
 // material-Lead tests cover annual quotations, quantities and nonzero additions.
 const leadVariants=[...new Map(lead.morthMaterialInventory(recipe).map(row=>[row.name,{id:row.name,materialName:row.name,conveyanceClass:row.conveyanceClass,rateSource:'manual',customGrossRate:0}])).values()]
 const leadApplications=leadVariants.map(v=>({id:v.id,variantId:v.id,...lead.morthQuantityForLead(recipe,v),morthLeadVariantSignature:lead.morthLeadVariantSignature(v),grossAmount:0,rateYear:recipe.year,rateZone:recipe.zone,outputQuantity:recipe.outputQuantity}))
 const sheets=[recipe,copy].map((r,i)=>({id:`slab-${i}`,recipe:r,calculatedSummary:r.morth.startingSummary,leadApplications,leadVariants})),project={meta:{name:'MoRTH shared appendix — QA',sorYear:'2026-27',sorZone:'zone_3'}}
 const upgrade=load(path.join(lib,'typist-output/dataTemplateUpgrade.ts'));
 for(const name of ['data-before-morth-appendices.typ','data-before-morth-ssr-style.typ']){
 const previous=fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
 const upgraded=upgrade.upgradeBuiltInDataTemplate(previous,data.dataTypstTemplate());assert.ok(upgraded.includes('appendix-recipes'));assert.ok(upgraded.includes('RATE ANALYSIS*'));assert.equal(upgrade.upgradeBuiltInDataTemplate(previous+'\n// My custom layout',data.dataTypstTemplate()),previous+'\n// My custom layout')}

 const inputs=data.dataSheetsCompileInputs(sheets,{projectName:project.meta.name,sorYear:project.meta.sorYear}),book=JSON.parse(inputs['ee-data']);assert.equal(book.appendices.length,2);assert.equal(book.recipes.length,2);assert.equal(book.recipes[0].materials.find(r=>r.appendix_key).appendix_key,'MA001');assert.equal(book.appendices[0].materials.find(r=>r.appendix_key).appendix_key,'MA002')
 assert.equal(book.recipes[0].visibility.labour_summary,false,'MoRTH does not print an SSR labour-profit extract')
 assert.ok(book.recipes[0].abstract_rows.some(r=>r.label==='Contractor profit'&&r.qualifier==='10%'))
 const {NodeCompiler}=require('@myriaddreamin/typst-ts-node-compiler'),compiler=NodeCompiler.create({workspace:root}),source=data.dataTypstTemplate()
 const pdf=compiler.pdf({mainFileContent:source,inputs});assert.ok(pdf.byteLength>1000);fs.writeFileSync(path.join(out,'morth-data.pdf'),pdf)
 const edited=structuredClone(recipe);Object.values(edited.morth.inputs).find(i=>i.dependency).dependency.morth.inputs['materials-0'].rate+=100;
 fs.writeFileSync(path.join(out,'expected.json'),JSON.stringify({original:recipe.morth.startingSummary.ratePerUnit,edited:native(edited).ratePerUnit}));
 const audit=load(path.join(lib,'typist-output/printContentAudit.ts'));const audited=audit.preparePrintAudit(inputs);assert.deepEqual(audit.auditPrintContent(audited.obligations,compiler.query({mainFileContent:source,inputs:audited.inputs},{selector:'metadata',field:'value'})),[],'Shared appendices participate in print completeness auditing');
 const payload=excel.buildDataExcelPayload(project,sheets);assert.equal(payload.morthAppendices.length,2);fs.writeFileSync(path.join(out,'morth-data.json'),JSON.stringify(payload,null,2));fs.writeFileSync(path.join(out,'recipe.json'),JSON.stringify(recipe,null,2))
 if(process.argv.includes('--excel')){
  const executable=path.join(process.env.LOCALAPPDATA,'e-estimate/cargo-target/debug/e-estimate.exe'),xlsx=path.join(out,'morth-data.xlsx'),r=spawnSync(executable,['--compile-excel',path.join(out,'morth-data.json'),xlsx],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.ok(fs.existsSync(xlsx),r.stdout)
  const wb=require('xlsx').readFile(xlsx,{cellFormula:true});assert.ok(wb.SheetNames.includes('MoRTH Items'));assert.equal(wb.SheetNames.at(-1),'MoRTH Appendix');assert.equal(wb.Workbook.Names.filter(n=>n.Name.endsWith('_DIRECT')).length,2)
  const parent=wb.Sheets['MoRTH Items'],child=wb.Sheets['MoRTH Appendix'];assert.ok(Object.values(parent).some(c=>c.f?.includes('MORTH_MA001_DIRECT')));assert.ok(Object.values(child).some(c=>c.f?.includes('MORTH_MA002_')))
  assert.equal(Object.values(child).filter(c=>c.v==='Appendix 21.07').length,1);assert.equal(Object.values(child).filter(c=>c.v==='Appendix 21.22').length,1)
  assert.ok(Object.values(parent).some(c=>c.v===recipe.morth.startingSummary.ratePerUnit&&c.f?.startsWith('ROUND(')))
 }
 console.log('MoRTH presentation passed: native abstract, separate SSR/MoRTH percentages, zero-markup appendices, shared deduplication, variant isolation, linked Typst PDF and Excel payload'+(process.argv.includes('--excel')?' + native XLSX':''))
}
main().catch(e=>{console.error(e);process.exitCode=1})
