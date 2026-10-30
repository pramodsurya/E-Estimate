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
  if(name==='rateAnalysis.ts')return {labourRowsForDisplay:()=>[],prepareRateAnalysis:async recipe=>recipe}
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
global.window={api:{rateAnalysis:{calculateBase:async r=>native(r),calculate:async r=>native(r)}}}
async function main(){
 const registry=load(path.join(lib,'morthAppendices.ts')),misc=load(path.join(lib,'miscellaneousCosts.ts')),morth=load(path.join(lib,'morthEstimate.ts')),data=load(path.join(lib,'typist-output/dataTypst.ts')),excel=load(path.join(lib,'excel-output/dataExcel.ts'))
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/morth-slab-appendix.json'),'utf8'))
 async function prepare(r,settings){let next=structuredClone(r);for(const input of Object.values(next.morth.inputs))if(input.dependency)input.dependency=await prepare(input.dependency,settings);return morth.prepareMorthRecipe(misc.applyMiscellaneousCosts(next,settings))}
 let recipe=await prepare(original),copy=structuredClone(recipe);copy.itemKey='second-slab'
 const appendices=registry.collectMorthAppendices([recipe,copy]);assert.equal(appendices.length,2,'Concrete and nested water appendices are collected once each')
 assert.deepEqual(appendices.map(a=>a.recipe.morth.printedItem),['21.07','21.22'])
 const reordered=structuredClone(recipe);reordered.morth.inputs=Object.fromEntries(Object.entries(reordered.morth.inputs).reverse());assert.deepEqual(registry.collectMorthAppendices([reordered]).map(a=>a.recipe.itemCode),appendices.map(a=>a.recipe.itemCode),'Appendix order follows source rows, not asynchronous rate completion');assert.equal(registry.morthAnalysisIdentity(reordered),registry.morthAnalysisIdentity(recipe));
 const unused=structuredClone(recipe);Object.values(unused.morth.inputs).find(i=>i.dependency).dependency.morth.parameters.unused_parent_setting=123;assert.equal(registry.collectMorthAppendices([recipe,unused]).length,2,'Unused parent inputs must not duplicate shared appendices')
 const changed=structuredClone(recipe);const concrete=Object.values(changed.morth.inputs).find(i=>i.dependency).dependency;concrete.morth.inputs[concrete.sections[0].lines[0].id].rate+=1
 assert.equal(registry.collectMorthAppendices([recipe,await morth.prepareMorthRecipe(changed)]).length,3,'Different calculated appendix rates must retain separate sheets')
 const rules=misc.miscellaneousDefinitions(recipe),profit=rules.find(r=>r.id==='profit'),overhead=rules.find(r=>r.id==='overhead');assert.equal(profit.defaultPercent,10);assert.equal(overhead.defaultPercent,20)
 const settings={[profit.key]:{percent:15,updatedAt:''}},repriced=await prepare(original,settings)
 assert.ok(repriced.morth.startingSummary.ratePerUnit>recipe.morth.startingSummary.ratePerUnit)
 assert.equal(repriced.morth.startingSummary.morthAbstract.find(r=>r.id==='profit').percent,15)
 assert.equal(Object.values(repriced.morth.inputs).find(i=>i.dependency).dependency.morth.startingSummary.profitAmount,0,'A parent profit change never adds markup to a direct-cost appendix')
 assert.equal((await prepare(original,{})).morth.startingSummary.ratePerUnit,recipe.morth.startingSummary.ratePerUnit,'Source default can be restored')
 const ssr={schemaVersion:1,itemKey:'SSR:test',itemCode:'SSR:test',description:'SSR test',itemSource:'SSR',outputQuantity:1,unit:'cum',overheadPercent:14,sections:[{key:'labour',label:'Labour',lines:[{id:'labour-0',slNo:'1',description:'Labour',unit:'day',quantity:1,rate:100,amount:100}]}]};const ssrRule=misc.miscellaneousDefinitions(ssr)[0];assert.notEqual(ssrRule.key,overhead.key);assert.equal(misc.applyMiscellaneousCosts(ssr,{[ssrRule.key]:{percent:12,updatedAt:''}}).overheadPercent,12);assert.equal(native(misc.applyMiscellaneousCosts(ssr,{[ssrRule.key]:{percent:12,updatedAt:''}})).ratePerUnit,112)
 const lead=load(path.join(lib,'morthMaterialLead.ts'))
 const beforePreview=JSON.stringify(recipe),pendingIssues=lead.morthLeadIssues(recipe,[],[])
 assert.ok(pendingIssues.some(issue=>issue.includes('Cement Lead pending')),'Fixture reproduces pending appendix Lead')
 const previewInputs=await data.rateAnalysisCompileInputs(recipe,null),previewBook=JSON.parse(previewInputs['ee-data'])
 assert.equal(previewBook.appendices.length,2,'Pending Lead still renders the nested appendix pages')
 assert.equal(previewBook.recipes[0].totals.rate_per_unit,recipe.morth.startingSummary.ratePerUnit,'Preview uses the current calculated rate')
 assert.ok(previewBook.recipes[0].materials.length>0)
 assert.equal(JSON.stringify(recipe),beforePreview,'Printing never clears pending Lead or changes review data')
 assert.deepEqual(lead.morthLeadIssues(recipe,[],[]),pendingIssues)
 const unreviewed=structuredClone(recipe);unreviewed.morth.pending=['Check adopted pump capacity'];unreviewed.morth.startingSummary.costReady=false
 assert.doesNotThrow(()=>data.dataSheetsCompileInputs([{recipe:unreviewed,leadApplications:[],leadVariants:[]}]),'Readiness is an editor concern, not a document-rendering gate')
 // Nonzero scoped Lead must print inside the consuming appendix and flow through linked rates.
 const leadVariants=[...new Map(lead.morthMaterialInventory(recipe).map(row=>[row.name,{id:row.name,materialName:row.name,conveyanceClass:row.conveyanceClass,leadKm:7,rateSource:'manual',customGrossRate:25}])).values()]
 const leadApplications=leadVariants.flatMap(v=>lead.morthLeadScopes(recipe,v.materialName,v.conveyanceClass).map(scope=>{
  const quantity=lead.morthQuantityForLead(scope.recipe,v,true)
  return {id:`${v.id}:${scope.path.join('/')}`,variantId:v.id,...quantity,morthAppendixPath:scope.path,morthAppendixLabel:scope.label,morthRootFactor:scope.factor,morthRootOutputQuantity:recipe.outputQuantity,morthLeadVariantSignature:lead.morthLeadVariantSignature(v),grossRate:25,grossAmount:Math.round(quantity.quantity*25*100)/100,rateYear:recipe.year,rateZone:recipe.zone,outputQuantity:scope.recipe.outputQuantity}
 }))
 const pricing=load(path.join(lib,'morthLeadPricing.ts'))
 recipe=await pricing.priceMorthLead(recipe,leadApplications,leadVariants);copy=await pricing.priceMorthLead(copy,leadApplications,leadVariants)
 const appliedPreview=JSON.parse((await data.rateAnalysisCompileInputs(recipe,null,leadApplications,leadVariants))['ee-data'])
 assert.equal(appliedPreview.recipes[0].totals.rate_per_unit,recipe.morth.startingSummary.ratePerUnit,'Applied Lead stays included once in the single-analysis preview')
 assert.deepEqual(appliedPreview.recipes[0].leads.map(row=>row.material),['Water'])
 const sheets=[recipe,copy].map((r,i)=>({id:`slab-${i}`,recipe:r,calculatedSummary:r.morth.startingSummary,leadApplications,leadVariants})),project={meta:{name:'MoRTH shared appendix — QA',sorYear:'2026-27',sorZone:'zone_3'}}
 const upgrade=load(path.join(lib,'typist-output/dataTemplateUpgrade.ts'));
 for(const name of ['data-before-morth-appendices.typ','data-before-morth-ssr-style.typ']){
 const previous=fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
 const upgraded=upgrade.upgradeBuiltInDataTemplate(previous,data.dataTypstTemplate());assert.ok(upgraded.includes('appendix-recipes'));assert.ok(upgraded.includes('RATE ANALYSIS*'));assert.equal(upgrade.upgradeBuiltInDataTemplate(previous+'\n// My custom layout',data.dataTypstTemplate()),previous+'\n// My custom layout')}

 const inputs=data.dataSheetsCompileInputs(sheets,{projectName:project.meta.name,sorYear:project.meta.sorYear}),book=JSON.parse(inputs['ee-data']);assert.equal(book.appendices.length,2);assert.equal(book.recipes.length,2);assert.equal(book.recipes[0].materials.find(r=>r.appendix_key).appendix_key,'MA001');assert.equal(book.appendices[0].materials.find(r=>r.appendix_key).appendix_key,'MA002')
 assert.equal(book.recipes[0].visibility.labour_summary,false,'MoRTH does not print an SSR labour-profit extract')
 assert.ok(book.recipes[0].abstract_rows.some(r=>r.label==='Contractor profit'&&r.qualifier==='10%'))
 assert.ok(book.appendices[0].leads.some(row=>row.material==='Cement'&&row.amount>0))
 assert.ok(book.appendices[0].leads.some(row=>row.material==='Sand'&&row.amount>0))
 assert.ok(book.appendices[0].leads.some(row=>row.material==='Stone'&&row.amount>0))
 assert.ok(!book.recipes[0].materials.some(row=>/^(Cement|Sand|Stone) Lead/.test(row.description)))
 assert.deepEqual(book.recipes[0].leads.map(row=>row.material),['Water'],'Parent shows its own direct Lead, without appendix Lead duplication')
 const {NodeCompiler}=require('@myriaddreamin/typst-ts-node-compiler'),compiler=NodeCompiler.create({workspace:root}),source=data.dataTypstTemplate()
 const pdf=compiler.pdf({mainFileContent:source,inputs});assert.ok(pdf.byteLength>1000);fs.writeFileSync(path.join(out,'morth-data.pdf'),pdf)
 const previewPdf=compiler.pdf({mainFileContent:source,inputs:previewInputs});assert.ok(previewPdf.byteLength>1000);fs.writeFileSync(path.join(out,'morth-pending-lead-preview.pdf'),previewPdf)
 const previewText=JSON.stringify(compiler.query({mainFileContent:'#show text: it => { metadata(it.text); it }\n'+source,inputs:previewInputs},{selector:'metadata',field:'value'}))
 assert.match(previewText,/RATE ANALYSIS/);assert.match(previewText,/Appendix 21.07/);assert.match(previewText,/Cement/)
 assert.doesNotMatch(previewText,/Resolve material Lead|Lead pending|before exporting|before finalising/,'Workflow reminders never replace or annotate the printed analysis')
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
  const stoneAddress=Object.keys(child).find(address=>child[address].v?.startsWith?.('Stone\n'))
  const stoneRow=require('xlsx').utils.decode_cell(stoneAddress).r+1
  assert.equal(child[`G${stoneRow}`].v,leadApplications.find(app=>app.variantId==='Stone').grossAmount,'CA Lead amount is written inside the concrete appendix')
  const concreteRecipe=recipe.morth.inputs['materials-0'].dependency
  assert.ok(Object.values(parent).some(cell=>cell.f==='MORTH_MA001_DIRECT*1'&&cell.v===(concreteRecipe.morth.startingSummary.baseCost+concreteRecipe.morth.startingSummary.morthLeadAmount)/concreteRecipe.outputQuantity),'The workbook parent adopts the Lead-inclusive appendix rate')
 }
 // Ten parent DATA items produce thirteen appendix occurrences. Seven use one
 // code, four of those have the same rate despite different Lead routes.
 async function rateRecipe(code, rate, route, dependencies=[]) {
  const raw=dependencies.length?dependencies.map((child,index)=>({desc:`Concrete from ${child.itemCode}`,quantity:1,unit:'cum',price_lookup:{require_direct_cost_only:true}}))
    :[{desc:`Stone · Quarry ${route}`,resource_key:`morth:aggregate:${route}`,quantity:1,unit:'cum'}]
  const inputs=Object.fromEntries(raw.map((row,index)=>[`materials-${index}`,{raw:row,rate:dependencies.length?null:rate,...(dependencies[index]?{dependency:dependencies[index]}:{})}]))
  return morth.prepareMorthRecipe({schemaVersion:1,itemKey:code,itemCode:code,itemSource:'MORTH',categoryKey:'morth',description:`Analysis ${code}`,unit:'cum',year:'2026-27',zone:'zone_3',outputQuantity:1,overheadPercent:0,
   sections:[{key:'materials',label:'Materials',lines:raw.map((row,index)=>({id:`materials-${index}`,slNo:String(index+1),description:row.desc,unit:row.unit,quantity:1,rate:dependencies.length?0:rate,amount:0}))}],
   morth:{source:{materials:raw,machinery:[],labour:[],rate_divisor:1,calculation:{overhead_percent:0,contractor_profit_percent:0,overhead_base:'direct_cost',profit_base:'direct_cost_plus_overheads'}},parameters:{},inputs,printedItem:code,pending:[]}})
 }
 const occurrences=[]
 const innerA=await rateRecipe('INNER',100,'inner-a'),innerB=await rateRecipe('INNER',200,'inner-b')
 const offsetA=await rateRecipe('OFFSET',200,'offset-a'),offsetB=await rateRecipe('OFFSET',100,'offset-b')
 const outerA=await rateRecipe('OUTER',0,'',[innerA,offsetA]),outerB=await rateRecipe('OUTER',0,'',[innerB,offsetB])
 const nestedRoots=[await rateRecipe('ROOT-A',0,'',[outerA]),await rateRecipe('ROOT-B',0,'',[outerB])]
 const nestedGroups=registry.collectMorthAppendices(nestedRoots)
 assert.equal(nestedGroups.filter(entry=>entry.recipe.itemCode==='OUTER').length,1,'Equal outer appendix rates share one definition')
 assert.equal(nestedGroups.filter(entry=>entry.recipe.itemCode==='INNER').length,2,'Sharing an outer appendix must not hide different nested rates')
 assert.equal(nestedGroups.filter(entry=>entry.recipe.itemCode==='OFFSET').length,2)
 for(let index=0;index<13;index++)occurrences.push(await rateRecipe(index<7?'CA':`OTHER-${index}`,index<4?100:index<7?100*(index-2):100,`route-${index}`))
 const parents=[];let cursor=0
 for(let index=0;index<10;index++){const count=index<3?2:1;parents.push(await rateRecipe(`P${index+1}`,0,'',occurrences.slice(cursor,cursor+=count)))}
 const grouped=registry.collectMorthAppendices(parents)
 assert.equal(grouped.length,10,'13 occurrences minus the 3 duplicate equal-rate appendices prints 10 definitions')
 assert.equal(grouped.filter(entry=>entry.recipe.itemCode==='CA').length,4,'Seven uses of the same code retain four distinct calculated rates')
 const sharedKey=registry.appendixForRecipe(grouped,occurrences[0]).key
 for(const child of occurrences.slice(0,4))assert.equal(registry.appendixForRecipe(grouped,child).key,sharedKey)
 for(const child of occurrences.slice(4,7))assert.notEqual(registry.appendixForRecipe(grouped,child).key,sharedKey)
 const groupedSheets=parents.map((r,index)=>({id:`parent-${index}`,recipe:r,calculatedSummary:r.morth.startingSummary,leadApplications:[],leadVariants:[]}))
 const groupedInputs=data.dataSheetsCompileInputs(groupedSheets),groupedBook=JSON.parse(groupedInputs['ee-data']),groupedPayload=excel.buildDataExcelPayload(project,groupedSheets)
 assert.equal(groupedBook.recipes.length,10);assert.equal(groupedBook.appendices.length,10);assert.equal(groupedPayload.morthAppendices.length,10)
 for(const parent of [...groupedBook.recipes,...groupedPayload.morth])for(const row of parent.materials)assert.ok(grouped.some(entry=>entry.key===row.appendix_key),'Every parent references a retained appendix')
 fs.writeFileSync(path.join(out,'appendix-rate-groups.pdf'),compiler.pdf({mainFileContent:source,inputs:groupedInputs}))
 const groupedAudit=audit.preparePrintAudit(groupedInputs)
 assert.deepEqual(audit.auditPrintContent(groupedAudit.obligations,compiler.query({mainFileContent:source,inputs:groupedAudit.inputs},{selector:'metadata',field:'value'})),[],'Typst renders every retained parent and appendix once')
 fs.writeFileSync(path.join(out,'appendix-rate-groups.json'),JSON.stringify(groupedPayload,null,2))
 if(process.argv.includes('--excel')){
  const executable=path.join(process.env.LOCALAPPDATA,'e-estimate/cargo-target/debug/e-estimate.exe'),xlsx=path.join(out,'appendix-rate-groups.xlsx'),run=spawnSync(executable,['--compile-excel',path.join(out,'appendix-rate-groups.json'),xlsx],{encoding:'utf8'});assert.equal(run.status,0,run.stderr)
  const wb=require('xlsx').readFile(xlsx,{cellFormula:true})
  assert.equal(wb.Workbook.Names.filter(name=>name.Name.startsWith('MORTH_MA')&&name.Name.endsWith('_DIRECT')).length,10,'XLSX defines exactly ten linked appendix rates')
  const parentRates=Object.values(wb.Sheets['MoRTH Items']).filter(cell=>cell.f?.startsWith('MORTH_MA')&&cell.f.includes('_DIRECT'))
  assert.equal(parentRates.length,13,'All thirteen consumption edges remain in the parent calculations')
  assert.equal(parentRates.filter(cell=>cell.f===`MORTH_${sharedKey}_DIRECT*1`).length,4,'Four parents/edges use one equal-rate appendix reference')
 }
 console.log('Appendix rate grouping passed: 10 DATA items, 13 occurrences, 7 uses of one code, 4 equal-rate occurrences share one appendix; 10 definitions in Typst and Excel')
 console.log('MoRTH presentation passed: pending Lead preview, editor-only readiness, native abstract, zero-markup appendices, shared deduplication, variant isolation, linked Typst PDF and Excel payload'+(process.argv.includes('--excel')?' + native XLSX':''))
}
main().catch(e=>{console.error(e);process.exitCode=1})
