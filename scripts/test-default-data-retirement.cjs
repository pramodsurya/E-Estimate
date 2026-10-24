const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),ts=require('typescript')
const filename=path.resolve(__dirname,'../src/renderer/src/lib/projectDataDefaults.ts')
const mod=new Module(filename,module);mod.filename=filename;mod.require=id=>id==='./projectDataRateLinks'?{projectDataUsesTimelyRates:()=>false}:require(id)
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename)
const {retireDefaultCreatedData}=mod.exports
const custom={id:'custom',code:'DATA-SOR-001',description:'User M25',kind:'ssr'},generated={id:'p:builtin:m25-wearing-coat',builtIn:{key:'m25-wearing-coat'}}
const project={id:'p',projectData:[custom,generated],root:{id:'root',children:[{id:'component',children:[{id:'auto',projectDataId:generated.id,children:[]},{id:'user',projectDataId:custom.id,children:[]}]}]},dashboardSnapshot:{},rateAnalysisOverrides:{['PROJECT_DATA:'+generated.id]:{},['PROJECT_DATA:'+custom.id]:{}},rateAnalysisScopedOverrides:{component:{['PROJECT_DATA:'+generated.id]:{},other:{}}}}
const cleaned=retireDefaultCreatedData(project)
assert.deepEqual(cleaned.projectData,[custom]);assert.equal(cleaned.root.children[0].children[0].id,'user');assert.equal(cleaned.root.children[0].children.length,1)
assert.equal(cleaned.dashboardSnapshot,undefined);assert.equal(Object.keys(cleaned.rateAnalysisOverrides).length,1);assert.deepEqual(Object.keys(cleaned.rateAnalysisScopedOverrides.component),['other'])
assert.equal(project.root.children[0].children.length,2,'cleanup must not mutate an opened file')
assert.equal(retireDefaultCreatedData(cleaned),cleaned,'retirement must be idempotent')
const empty={id:'new',root:{children:[]}};assert.equal(retireDefaultCreatedData(empty),empty,'new projects must remain empty')
console.log('Default DATA retirement tests passed')
