const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/ccdw-5-4-source.json');
const mocks = {
  supabase: { supabase: { from(table) {
    const result = table === 'ssr_item' ? fixture.item : table === 'ssr_year' ? fixture.year : { value_num: 13.615 };
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: result, error: null }) };
  } } },
  sorSource: {}, sorEstimate: {},
  pipeLead: { pipeLeadSourceFromContext: () => undefined },
  materialRates: { applyMaterialRateOverrides: r => ({ recipe: r, applications: [] }), fetchMaterialAliases: async () => new Map(), fetchMonthlyMaterials: async () => [] },
  projectItems: { projectItemKey: n => `${n.itemSource}:${n.itemCode}`, projectNodePath: () => [], projectItemGroupIndex: () => new Map(), rateAnalysisOverrideForNode: (p, n) => p.rateAnalysisOverrides?.[n.itemCode] },
  dashboardSync: {}, tree: {},
};
const cache = new Map();
function load(name) {
  if (name in mocks) return mocks[name];
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`), m = new Module(file, module);
  cache.set(name, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r.endsWith('?raw') ? fs.readFileSync(path.resolve(path.dirname(file), r.slice(0, -4)), 'utf8')
    : r.startsWith('.') ? load(path.relative(path.join(root, 'src/renderer/src/lib'), path.resolve(path.dirname(file), r)).replaceAll('\\', '/')) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, file);
  if(name === 'individualCosts') m.exports.applyIndividualCosts=async recipe=>recipe;
  return m.exports;
}
function native(recipe, base) {
  const run = spawnSync(process.env.RATE_ANALYSIS_CLI || path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe'), base ? ['--base'] : [], {
    input: JSON.stringify(recipe), encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout);
}
global.window = { api: { rateAnalysis: { calculate: async r => native(r), calculateBase: async r => native(r, true) } } };

async function main() {
  const api=load('rateAnalysis'), excel=load('excel-output/dataExcel'), output=load('individualItemsOutput'), typst=load('typist-output/individualItemsTypst');
  const published=await api.fetchRateAnalysis({itemCode:'IRR-CCDW-5-4',categoryKey:'ccdw',itemSource:'SSR'},'2026-27');
  const recipe=await api.prepareRateAnalysis({...published,areaAllowancePercent:40});
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/morth-slab-appendix.json'),'utf8'));
  async function prepare(r) {const next=structuredClone(r);for(const input of Object.values(next.morth.inputs))if(input.dependency)input.dependency=await prepare(input.dependency);return load('morthEstimate').prepareMorthRecipe(next)}
  const morth=await prepare(source);
  const project={id:'output-qa',meta:{name:'Individual Items — mixed source QA',sorYear:'2026-27',sorZone:'zone_3'},root:{name:'Mixed project'}};
  const sheets=[recipe,morth].map((recipe,index)=>({id:'data-'+index,recipe,calculatedSummary:native(recipe,true),leadApplications:[],leadVariants:[]}));
  const payload=excel.buildDataExcelPayload(project,sheets),dir=path.join(root,'output/individual-items-qa');fs.mkdirSync(dir,{recursive:true});
  assert.ok(payload.individualItems.some(row=>row.owner==='SSR'));assert.ok(payload.individualItems.some(row=>row.owner==='MORTH'));
  assert.ok(payload.morthAppendices.flatMap(recipe=>recipe.materials).some(line=>line.individual_key),'Appendix ingredients link to the same register');
  assert.ok(payload.recipes[0].abstract_rows.filter(row=>row.is_rate)[0].excel_formula);
  const json=path.join(dir,'linked-data.json'),xlsx=path.join(dir,'linked-data.xlsx');fs.writeFileSync(json,JSON.stringify(payload));
  const compiler=process.env.EXCEL_QA_CLI || path.join(process.env.LOCALAPPDATA,'e-estimate/cargo-target/debug/e-estimate.exe');
  const compile=(json,xlsx)=>spawnSync(compiler,process.env.EXCEL_QA_CLI?[json,xlsx]:['--compile-excel',json,xlsx],{encoding:'utf8'});
  const run=compile(json,xlsx);assert.equal(run.status,0,run.stderr);
  const XLSX=require('xlsx'),calc=require('xlsx-calc');
  const workbook=XLSX.readFile(xlsx,{cellFormula:true}),ssr=workbook.Sheets['SSR Items'];
  assert.ok(workbook.SheetNames.includes('Individual Items'));
  const rateCells=Object.keys(ssr).filter(key=>ssr[key].f?.includes("'Individual Items'!"));assert.ok(rateCells.length>0);
  const finalAddress=Object.keys(ssr).find(key=>key.startsWith('G')&&ssr[key].f&&ssr[key].v===sheets[0].calculatedSummary.ratePerUnit);
  assert.ok(finalAddress,'SSR final rate is a live formula');
  const original=ssr[finalAddress].v;calc(workbook);assert.equal(ssr[finalAddress].v,original,'Excel formulas reproduce the native rate before edits');
  const cement=payload.individualItems.findIndex(row=>row.owner==='SSR'&&/cement/i.test(row.description));assert.ok(cement>=0);
  const resourceCell=workbook.Sheets['Individual Items']['F'+(cement+5)];resourceCell.v+=1;calc(workbook);
  assert.ok(ssr[finalAddress].v>original,'Changing the register rate recalculates the final SSR DATA rate');
  const morthSheet=workbook.Sheets['MoRTH Items'];
  const morthFinal=Object.keys(morthSheet).filter(key=>key.startsWith('G')&&morthSheet[key].f&&morthSheet[key].v===morth.morth.startingSummary.ratePerUnit).at(-1);
  assert.ok(morthFinal);assert.equal(morthSheet[morthFinal].v,morth.morth.startingSummary.ratePerUnit,'SSR edits do not alter MoRTH rates');
  const originalMorth=morthSheet[morthFinal].v;
  const concreteCement=payload.individualItems.findIndex(row=>row.owner==='MORTH'&&/cement/i.test(row.description)&&row.unit==='tonne');
  workbook.Sheets['Individual Items']['F'+(concreteCement+5)].v+=1000;calc(workbook);
  assert.ok(morthSheet[morthFinal].v>originalMorth,'Appendix cement rate edits flow through to the parent MoRTH rate');
  const truck=payload.individualItems.findIndex(row=>row.owner==='MORTH'&&/agitator/.test(row.description)&&row.unit==='hour');
  const haulage=payload.individualItems.findIndex(row=>row.derived_from===payload.individualItems[truck].key);
  const oldHaulage=workbook.Sheets['Individual Items']['F'+(haulage+5)].v;
  workbook.Sheets['Individual Items']['F'+(truck+5)].v+=180;calc(workbook);
  assert.ok(Math.abs(workbook.Sheets['Individual Items']['F'+(haulage+5)].v-oldHaulage-1)<0.000001,'Hourly truck edits rederive carriage without an extra fuel charge');
  const beforeLabour=ssr[finalAddress].v,labour=payload.individualItems.findIndex(row=>row.owner==='SSR'&&row.kind==='labour');
  workbook.Sheets['Individual Items']['F'+(labour+5)].v+=100;calc(workbook);assert.ok(ssr[finalAddress].v>beforeLabour,'Labour edits recalculate allowance and markup');
  const projectPayload={...payload,kind:'project',cover:{},lead:{},seigniorage:{},project:{coverCostRef:"'General Abstract'!$C$3",sheets:[{name:'General Abstract',grid:{cells:[{r:0,c:0,value:'Project QA'},{r:1,c:0,value:10},{r:1,c:1,value:0},{r:2,c:2,formula:'=A2*B2'}]}}],links:[{sheet:'General Abstract',r:1,c:1,kind:'data-rate',key:'data-0'}]}};
  const projectJson=path.join(dir,'linked-project.json'),projectXlsx=path.join(dir,'linked-project.xlsx');fs.writeFileSync(projectJson,JSON.stringify(projectPayload));
  const projectRun=compile(projectJson,projectXlsx);assert.equal(projectRun.status,0,projectRun.stderr);
  const projectBook=XLSX.readFile(projectXlsx);calc(projectBook);const projectBefore=projectBook.Sheets['General Abstract'].C3.v;
  projectBook.Sheets['Individual Items']['F'+(cement+5)].v+=1;calc(projectBook);
  assert.ok(projectBook.Sheets['General Abstract'].C3.v>projectBefore,'Resource edit flows through DATA to the final project abstract');
  const standalone={...payload,individualOnly:true};const standaloneJson=path.join(dir,'individual-only.json');fs.writeFileSync(standaloneJson,JSON.stringify(standalone));
  const onlyXlsx=path.join(dir,'individual-items.xlsx');assert.equal(compile(standaloneJson,onlyXlsx).status,0);
  assert.deepEqual(XLSX.readFile(onlyXlsx).SheetNames,['Individual Items']);
  const localCopy=structuredClone(recipe);localCopy.sections[0].lines[0].editedFields=['rate'];
  const localOther=structuredClone(localCopy),localOutput=output.individualItemsOutput([localCopy,localOther]);
  assert.notEqual(localOutput.lineKeys.get(localCopy.sections[0].lines[0]),localOutput.lineKeys.get(localOther.sections[0].lines[0]),'Local rates in separate DATA usages retain their own input cells');
  async function verifyVariant(variant,name,editAddon=false) {
    const summary=native(variant,false),bundle=excel.buildDataExcelPayload(project,[{id:name,recipe:variant,calculatedSummary:summary,leadApplications:[],leadVariants:[]}]);
    const input=path.join(dir,name+'.json'),destination=path.join(dir,name+'.xlsx');fs.writeFileSync(input,JSON.stringify(bundle));
    const run=compile(input,destination);assert.equal(run.status,0,run.stderr);
    const book=XLSX.readFile(destination),sheet=book.Sheets['SSR Items'];
    const last=Object.keys(sheet).filter(address=>address.startsWith('G')&&sheet[address].f&&sheet[address].v===summary.ratePerUnit).at(-1);
    assert.ok(last);calc(book);assert.equal(sheet[last].v,summary.ratePerUnit,name+' starts at the native adopted rate');
    if(editAddon) {
      const resource=bundle.individualItems.findIndex(row=>row.description==='Selected extra resource');
      assert.ok(resource>=0);book.Sheets['Individual Items']['F'+(resource+5)].v+=10;calc(book);
      assert.ok(sheet[last].v>summary.ratePerUnit,'Selected add-on resources recalculate their adopted DATA rate');
    }
  }
  const extra=structuredClone(recipe);extra.dataVariant={kind:'optional_addition',label:'Selected extra',baseRate:9946.08,rate:10000,additionAnalysis:{label:'Extra',outputQuantity:1,unit:'cum',sections:[{key:'materials',label:'Materials',lines:[{id:'extra-0',description:'Selected extra resource',unit:'kg',quantity:2,rate:100,amount:200}]}],sectionTotals:{materials:200},overheadPercent:13.615,rate:227.23}};
  await verifyVariant(extra,'optional-addition',true);
  const post=structuredClone(recipe);post.dataVariant={kind:'upto',label:'Extra depth',postRate:true,postRateMultiplier:1.1,addPercent:10,baseRate:9946.08,rate:10940.69};
  await verifyVariant(post,'post-rate-variant');
  const explicit=structuredClone(recipe);delete explicit.recalculation;
  explicit.storedValues.abstract.splice(5,0,{label:'Add special amount',value:'',unit:'',basis:'',percent:'',amount:'=MAT1_RATE*2'});
  await verifyVariant(await api.recalculateRateAnalysis(explicit),'explicit-resource-formula');
  const inputs=typst.individualItemsCompileInputs(project,[recipe,morth]),{NodeCompiler}=require('@myriaddreamin/typst-ts-node-compiler'),typstCompiler=NodeCompiler.create({workspace:root});
  const audit=load('typist-output/printContentAudit'),audited=audit.preparePrintAudit(inputs);
  const pdf=typstCompiler.pdf({mainFileContent:typst.individualItemsTypstTemplate(),inputs:audited.inputs});assert.ok(pdf.byteLength>1000);fs.writeFileSync(path.join(dir,'individual-items.pdf'),pdf);
  assert.deepEqual(audit.auditPrintContent(audited.obligations,typstCompiler.query({mainFileContent:typst.individualItemsTypstTemplate(),inputs:audited.inputs},{selector:'metadata',field:'value'})),[]);
  fs.writeFileSync(path.join(dir,'recipes.json'),JSON.stringify([recipe,morth]));
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({resourceRows:payload.individualItems.length,originalSsrRate:original,cementEditedRate:beforeLabour,labourEditedRate:ssr[finalAddress].v},null,2));
  console.log('Individual Items output passed: mixed register, native linked XLSX, edited rates, allowance, source isolation, appendices and audited Typst PDF');
}
main().catch(error=>{console.error(error);process.exitCode=1});
