const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(name){const file=path.resolve(__dirname,'../src/renderer/src/lib',name+'.ts');const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {SorRequestCache}=load('sorCache'),{SorTreeIndex}=load('sorTree');
async function main(){
  let now=0,calls=0,finish;
  const cache=new SorRequestCache(2,()=>now);
  const request=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const controller=new AbortController();
  const aborted=cache.get('2026-27:zone_1',10,request,controller.signal);
  const joined=cache.get('2026-27:zone_1',10,request);
  const rejection=assert.rejects(aborted,{name:'AbortError'});
  controller.abort();
  await Promise.resolve();finish(845);
  await rejection;assert.equal(await joined,845);assert.equal(calls,1,'one canceled consumer must not cancel or duplicate a shared quote');
  assert.equal(await cache.get('2026-27:zone_1',10,async()=>999),845);
  assert.equal(await cache.get('2026-27:zone_3',10,async()=>777),777,'zones have distinct request identities');
  now=11;assert.equal(await cache.get('2026-27:zone_1',10,async()=>900),900,'expired prices refresh');
  assert.equal(await cache.get('2026-27:zone_1',10,async()=>910,undefined,true),910,'explicit Sync bypasses the quote cache');
  await assert.rejects(cache.get('failure',10,async()=>{throw Error('network');}),/network/);
  assert.equal(await cache.get('failure',10,async()=>42),42,'errors are retriable, not cached');
  await cache.get('third',10,async()=>3);
  assert.equal(await cache.get('2026-27:zone_1',10,async()=>920),920,'least recently used entries are bounded');
  const tree=new SorTreeIndex([
    {part:'1',heading:'Work items',section:'Materials',subsection:'',count:2,page:33,first_code:'A'},
    {part:'1',heading:'Work items',section:'Equipment',subsection:'',count:3,page:40,first_code:'B'},
    {part:'4',heading:'Public Health Items',section:'Pipes',subsection:'Supply',count:140,page:747,first_code:'C'},
    {part:'4',heading:'Public Health Items',section:'Pipes',subsection:'Laying',count:20,page:748,first_code:'D'}
  ]);
  assert.deepEqual(tree.nodes({},'part').map(n=>[n.key,n.count]),[['1',5],['4',160]]);
  const next=tree.advance([{level:'part',key:'4',label:'Public Health'}],'heading');
  assert.equal(next.level,'subsection','single heading and section are skipped locally in one step');
  assert.deepEqual(next.crumbs.map(c=>c.key),['4','Public Health Items','Pipes']);
  const path={part:'4',heading:'Public Health Items',section:'Pipes'};
  assert.deepEqual(tree.nodes(path,'subsection').map(n=>n.key),['Supply','Laying']);
  assert.deepEqual(tree.nodes({part:'1',heading:'Work items'},'section').map(n=>n.key),['Materials','Equipment'],'groups with similar labels never leak across Parts');
  console.log('SOR browser: shared request cancellation, bounded/expiring caches, fresh Sync, retry and local tree navigation passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
