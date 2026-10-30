const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const XLSX = require('xlsx')
const recalculate = require('xlsx-calc')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const erm = require('../src/renderer/src/lib/canalErm.ts')
const {measureCanalCutting,measureCanalCuttingSection} = require('../src/renderer/src/lib/canalCutting.ts')
const {buildCanalCuttingExcel} = require('../src/renderer/src/lib/canalCuttingExcel.ts')
const near = (actual, expected, tolerance=1e-8) => assert.ok(Math.abs(actual-expected)<=tolerance, `Expected ${expected}, got ${actual}`)
const area = points => Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.offset*q.rl-q.offset*p.rl},0))/2
function fixture() {
  const data = canal.defaultCanalData()
  data.configured=true;data.lengthM=100;data.strippingDepth=0
  Object.assign(data.design,{bedLevelAtStart:94,bedSlope:0,bedWidth:3,fullSupplyDepth:1.5,freeBoard:0.6,sideSlope:1.5})
  data.design.bankConfig.mode='legacy';data.design.cutBermConfig.enabled=false
  data.sections=[0,100].map(chainage=>({id:String(chainage),chainage,designPopulated:true,ground:[{offset:-30,rl:99.98},{offset:30,rl:99.98}]}))
  return data
}
const data=fixture()
const section=measureCanalCuttingSection(data,data.sections[0])
const h=5.98, analytical=3*h+1.5*h*h
near(section.areas.cutting, Math.round(analytical*1000)/1000)
near(section.geometry.cutPolygons.reduce((sum,p)=>sum+area(p.points),0), analytical)
assert.deepEqual(section.materialAreas,[0,0,0,0,section.areas.cutting], 'Missing investigation is unclassified, never silently hard rock')
const result=measureCanalCutting(data)
near(result.totalVolume,section.areas.cutting*100)
near(result.totalVolume,canal.canalEarthworkTotals(data).excavation)
near(result.reaches[0].start.areas.cutting,section.areas.cutting)
assert.equal(result.reaches[0].length,100)

let investigated=erm.applyErmRows(data,[0,100].map(chainage=>({chainage,topRl:99.98,bottoms:[98,96,95],end:'hard-rock',hardRockBottomRl:90})))
const classified=measureCanalCuttingSection(investigated,investigated.sections[0])
const primitive=depth=>3*depth+1.5*depth*depth
const boundaries=[5.98,4,2,1,0]
for(let i=0;i<4;i++) near(classified.materialAreas[i],Math.round((primitive(boundaries[i])-primitive(boundaries[i+1]))*1000)/1000)
near(classified.materialAreas[4],0,0.002)
near(classified.materialAreas.reduce((a,b)=>a+b,0),classified.areas.cutting,0.002)

const limited=structuredClone(data)
limited.sections=limited.sections.map(s=>({...s,strataExtent:'limited',strata:[{id:'soil',name:'Soil',ermClass:'all-soils',thickness:1,slope:1.5}]}))
assert.ok(measureCanalCuttingSection(limited,limited.sections[0]).materialAreas[4]>0,'Uninvestigated depth remains unclassified')

const uneven=structuredClone(investigated)
uneven.sections[0].ground=[{offset:-30,rl:99},{offset:-4,rl:99.8},{offset:0,rl:93},{offset:6,rl:100.4},{offset:30,rl:101}]
const surveyed=measureCanalCuttingSection(uneven,uneven.sections[0])
assert.ok(surveyed.areas.cutting>0&&surveyed.areas.filling>0,'Mixed cutting is measured even when centre GL is below bed')
near(surveyed.areas.cutting,canal.canalSectionAreas(uneven,uneven.sections[0]).cutting)
near(measureCanalCutting(uneven).totalVolume,canal.canalEarthworkTotals(uneven).excavation)

const benched=fixture()
benched.sections.forEach(s=>s.ground.forEach(p=>p.rl=110))
Object.assign(benched.design.cutBermConfig,{enabled:true,mode:'manual',manualBaseSlope:1.5,manualBerms:[{id:'b',heightAboveBed:6,width:2,slope:1}]})
const bench=measureCanalCuttingSection(benched,benched.sections[0])
assert.equal(bench.shelves.length,2,'Bench widths come from the actual left and right profile')
assert.ok(bench.shelves.every(s=>s.rl===100&&s.width===2))
near(bench.areas.cutting,canal.canalSectionAreas(benched,benched.sections[0]).cutting)

const taper=fixture()
taper.sections[1].ground.forEach(p=>p.rl=90)
const tapered=measureCanalCutting(taper)
near(tapered.reaches[0].end.areas.cutting,0)
near(tapered.totalVolume,section.areas.cutting/2*100)
taper.sections.reverse()
near(measureCanalCutting(taper).totalVolume,tapered.totalVolume)
const unpopulated=fixture()
unpopulated.sections[1].designPopulated=false
assert.equal(measureCanalCutting(unpopulated).totalVolume,0)
const one=fixture();one.sections=one.sections.slice(0,1)
assert.equal(measureCanalCutting(one).sections.length,1,'One valid section is exportable, without inventing a reach volume')

// Recalculate every exported polygon and reach formula independently in an Excel engine.
function verifyWorkbook(measurement) {
  const payload=buildCanalCuttingExcel(measurement)
  const book=XLSX.utils.book_new()
  for(const {name,grid} of [{name:payload.page.name,grid:payload.page.grid},...payload.page.extraSheets]) {
    const sheet={}
    for(const cell of grid.cells) {
      const address=XLSX.utils.encode_cell({r:cell.r,c:cell.c})
      sheet[address]={t:typeof cell.value==='number'?'n':'s',v:cell.value??''}
      if(cell.formula)sheet[address].f=cell.formula.replace(/^=/,'')
    }
    sheet['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(...grid.cells.map(c=>c.r)),c:grid.colWidthsChars.length-1}})
    XLSX.utils.book_append_sheet(book,sheet,name)
  }
  recalculate(book)
  for(const sheet of [{name:payload.page.name,grid:payload.page.grid},...payload.page.extraSheets]) {
    for(const cell of sheet.grid.cells.filter(c=>c.formula)) near(book.Sheets[sheet.name][XLSX.utils.encode_cell({r:cell.r,c:cell.c})].v,cell.value,1e-7)
  }
  return book
}
for(const source of [data,investigated,uneven,benched,taper,one,unpopulated]) verifyWorkbook(measureCanalCutting(source))
console.log('Canal cutting: analytic cut areas, material clipping, unclassified depth, surveyed mixed cutting, benches, taper volumes, ordering and independent Excel formula recalculation passed.')
