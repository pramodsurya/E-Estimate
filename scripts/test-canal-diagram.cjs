const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const compile = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText, file)
require.extensions['.ts'] = compile
require.extensions['.tsx'] = compile
const canal = require('../src/renderer/src/lib/canal.ts')
const drainage = require('../src/renderer/src/lib/canalDrainageDesign.ts')
const Diagram = require('../src/renderer/src/components/canal/CanalSectionDiagram.tsx').default
const { inCorePolygons } = require('../src/renderer/src/lib/canalCoreGeometry.ts')
function fixture(rl = 100) {
  const data = canal.defaultCanalData()
  data.configured = true; data.lengthM = 100
  data.design.bedLevelAtStart = 100; data.design.bedSlope = 0
  data.sections = [0, 100].map(chainage => ({ id: String(chainage), chainage, ground: [{ offset: -40, rl }, { offset: 40, rl }], designPopulated: true }))
  return data
}
const draw = data => renderToStaticMarkup(React.createElement(Diagram, { data, section: data.sections[0] }))
const preparedPaths = html => [...html.matchAll(/<path d="([^"]*)" class="canal-diagram-stripping-line"/g)].map(match => match[1])
const base = fixture()
const continuous = preparedPaths(draw(base))
assert.equal(continuous.length, 1, 'No cutting: one prepared-level line crosses both banks and the bed')
const yValues = [...continuous[0].matchAll(/[ML] [\d.e+-]+ ([\d.e+-]+)/g)].map(match => Number(match[1]))
assert.ok(yValues.length >= 2 && yValues.every(y => Math.abs(y - yValues[0]) < 1e-8), 'Flat ground produces one straight horizontal prepared line')
assert.equal(preparedPaths(draw(fixture(101))).length, 2, 'Mixed cutting retains separate prepared lines beneath the two banks')
assert.equal(preparedPaths(draw(fixture(110))).length, 0, 'Full cutting has no bank prepared-level line')

const area = points => Math.abs(points.reduce((sum,p,i) => {
  const next=points[(i+1)%points.length];return sum+p.offset*next.rl-next.offset*p.rl
},0))/2
for(const construction of ['homogeneous','zoned']){
  const data=fixture(98)
  data.design.bankConfig.leftTiers=data.design.bankConfig.leftTiers.map(tier=>({...tier,sectionType:construction,heartingTopWidth:1,heartingSideSlope:.25}))
  const geometry=canal.canalSectionGeometry(data,data.sections[0])
  const fill=geometry.bands.filter(band=>!band.cutting).map(band=>band.points)
  assert.ok(Math.abs(fill.reduce((sum,polygon)=>sum+area(polygon),0)-geometry.areas.filling)<.001,`${construction}: painted fill includes all measured bank foundation refill`)
  const strip=geometry.bankSection.banks[0].strippingPolygons[0]
  const x=Math.min(...strip.map(p=>p.offset))+.2
  assert.ok(inCorePolygons(fill,x,97.7),`${construction}: casing below natural ground is visibly filled`)
  assert.ok(inCorePolygons(fill,0,97.7),'The bed is stripped and refilled down to the prepared level')
  assert.ok(Math.abs(geometry.bankSection.banks.reduce((sum,bank)=>sum+bank.values.stripping,0)-canal.canalEarthworkTotals(data).stripping/100)<.001,'The section and Earthwork chapter include the same stripping area')
  assert.ok(!draw(data).includes('NaN'),'Foundation refill has finite SVG coordinates')
}

const connectedBed=fixture(96)
connectedBed.design.heartingConnection='continuous'
connectedBed.design.heartingTrenchEnabled=false
connectedBed.design.bankConfig.leftTiers=connectedBed.design.bankConfig.leftTiers.map(tier=>({...tier,sectionType:'zoned',heartingTopWidth:1.5,heartingSideSlope:1}))
const connectedCore=canal.canalHeartingSection(connectedBed,connectedBed.sections[0])
assert.deepEqual(connectedCore.errors,[])
assert.ok(inCorePolygons(connectedCore.profiles.flatMap(profile=>profile.pieces),0,95.5),'The connected impervious core fills the newly prepared central strip')
const connectedGeometry=canal.canalSectionGeometry(connectedBed,connectedBed.sections[0])
assert.ok(Math.abs(connectedCore.profiles.flatMap(profile=>profile.pieces).reduce((sum,poly)=>sum+area(poly),0)-connectedGeometry.bankSection.banks.reduce((sum,bank)=>sum+bank.values.hearting,0))<1e-6,'Painted core area and measured hearting agree, counting central overlap once')
assert.ok(draw(connectedBed).includes('Continuous core beneath bed'),'The drawing recognises a core connected inside the bed refill')
const separateBed={...connectedBed,design:{...connectedBed.design,heartingConnection:'separate'}}
assert.ok(canal.canalHeartingSection(separateBed,separateBed.sections[0]).errors.some(error=>error.includes('overlap')),'Separate cores still reject overlaps in the newly prepared soil')

const automaticBlanket = drainage.saveCanalDrainageTier(base, 'left', 'tier-low', { blanket: '5-4' })
const blanketSections = canal.canalSandBlanketsAtSection(automaticBlanket, automaticBlanket.sections[0])
assert.equal(blanketSections.length, 2, 'Blanket ownership stays separate for left/right quantity allocation')
assert.equal(blanketSections.find(b => b.side === 'left').to, 0)
assert.equal(blanketSections.find(b => b.side === 'right').from, 0, 'Automatic blankets meet at the centre-line')
assert.equal((draw(automaticBlanket).match(/data-blanket="5-4"/g) ?? []).length, 1, 'Matching blankets render as one continuous polygon')
const bankWidth = canal.canalFoundationWidthsAtSection(base, base.sections[0]).total
assert.ok(Math.abs(canal.canalTierFoundationQuantities(automaticBlanket).blanketQuantity - (bankWidth + base.design.bedWidth) * 100) < 0.01, 'Fixed blanket counts the bed width exactly once')
const variableBlanket = drainage.saveCanalDrainageTier(base, 'left', 'tier-low', { blanket: '5-5', blanketThickness: 0.3 })
assert.ok(Math.abs(canal.canalTierFoundationQuantities(variableBlanket).blanketQuantity - (bankWidth + base.design.bedWidth) * 100 * 0.3) < 0.01, 'Variable blanket includes the bed extension at its entered thickness')
const manualBlanket = drainage.saveCanalDrainageTier(base, 'left', 'tier-low', { blanket: '5-4', blanketWidthMode: 'manual', blanketLeftWidth: 1, blanketRightWidth: 1 })
assert.equal(canal.canalTierFoundationQuantities(manualBlanket).blanketQuantity, 200, 'Manual blanket widths remain exactly as entered')
assert.equal((draw(manualBlanket).match(/data-blanket="5-4"/g) ?? []).length, 2)
let manualReachBlanket = {...base,design:{...base.design,bankConfig:{...base.design.bankConfig,mode:'manual',leftManualReaches:[{id:'blanket-reach',from:0,to:100,tierId:'tier-low',status:'fill'}]}}}
manualReachBlanket = drainage.saveCanalBankDrainageReach(manualReachBlanket,'left','blanket-reach',{blanket:'5-4'})
assert.equal((draw(manualReachBlanket).match(/data-blanket="5-4"/g) ?? []).length, 1, 'Automatic extent is continuous in manual Bank Design mode too')
assert.equal(canal.canalTierFoundationQuantities(manualReachBlanket).blanketQuantity,canal.canalTierFoundationQuantities(automaticBlanket).blanketQuantity)
const mixedBlanket = drainage.saveCanalDrainageTier(fixture(101), 'left', 'tier-low', { blanket: '5-4' })
assert.ok(canal.canalSandBlanketsAtSection(mixedBlanket, mixedBlanket.sections[0]).every(b => b.side === 'left' ? b.to <= -1.5 : b.from >= 1.5), 'Blankets do not bridge through canal cutting')
const zonedBlanket = {...automaticBlanket,design:{...automaticBlanket.design,bankConfig:{...automaticBlanket.design.bankConfig,leftTiers:automaticBlanket.design.bankConfig.leftTiers.map(t=>({...t,sectionType:'zoned'}))}}}
assert.ok(canal.canalSandBlanketsAtSection(zonedBlanket, zonedBlanket.sections[0]).every(b => b.side === 'left' ? b.to <= -1.5 : b.from >= 1.5), 'Impervious cores keep their separate blanket boundaries')
const netBlanket = canal.canalBankVolumeTotals(automaticBlanket)
assert.ok(Math.abs(netBlanket.totalFill - netBlanket.homogeneous - (bankWidth + base.design.bedWidth) * 100 * .25) < .01, 'The bed blanket replaces the measured bed refill exactly once')

const partialBed=fixture()
partialBed.sections=partialBed.sections.map(section=>({...section,ground:[{offset:-40,rl:99.5},{offset:-1.5,rl:99.5},{offset:1.5,rl:100.5},{offset:40,rl:100.5}]}))
const partialGeometry=canal.canalSectionGeometry(partialBed,partialBed.sections[0])
const strip=partialGeometry.bankSection.banks.flatMap(bank=>bank.strippingPolygons)
assert.ok(inCorePolygons(strip,-.75,99.4),'Bed in filling has prepared-level refill')
assert.ok(!inCorePolygons(strip,.75,99.9),'Bed in cutting is not stripped again')
assert.ok(Math.abs(strip.reduce((sum,poly)=>sum+area(poly),0)-canal.canalStrippingBands(partialBed,partialBed.sections[0]).reduce((sum,poly)=>sum+area(poly),0))<1e-6,'Native and core-adapter preparation agree across a sloping cutting boundary')

let enabled = drainage.saveCanalDrainageTier(base, 'left', 'tier-low', {
  blanket: '5-4', horizontalFilter: true, filterThickness: 0.3, rockToe: true, rockToeSide: 'both', rockToeWidth: 0.5, rockToeHeight: 1,
  toeFilter: true, toeFilterSide: 'both', toeFilterKind: '5-12', toeFilterWidth: 1
})
enabled = drainage.saveCanalDrainageTier(enabled, 'left', 'tier-low', {
  rockToeProtection: true, rockToeProtectionSide: 'both', rockToeTopWidth: 0.5, rockToeProtectionHeight: 1, rockToeInnerSlope: 1, rockToeFilter: true,
  toeDrain: true, toeDrainSide: 'both', toeDrainBottomWidth: 1, toeDrainDepth: 0.5, toeDrainLeftSlope: 1, toeDrainRightSlope: 1, toeDrainBermWidth: 2, toeDrainProtection: 'concrete'
}, 'bankToeDrainage')
const html = draw(enabled)
for (const code of ['5-4', '5-7', '5-10', '5-12', '5-6', '5-11', '7-15']) assert.ok(html.includes(`IRR-CAW-${code}`), `Enabled ${code} must have a visible diagram legend entry`)
for (const kind of ['toe-filter', 'rock-toe', 'rock-toe-filter', 'toe-ditch']) assert.equal((html.match(new RegExp(`data-work="${kind}"`, 'g')) ?? []).length, 2, `${kind} is drawn on both banks`)
assert.ok(!html.includes('NaN') && !html.includes('Infinity'), 'All diagram coordinates are finite')
const works = canal.canalSectionToeWorks(enabled, enabled.sections[0])
assert.equal(works.length, 8)
assert.ok(works.filter(w => w.kind === 'toe-ditch').every(w => w.lining === 'concrete' && w.lines[0].length === 4), 'Concrete lining follows both ditch sides and its bed')
const graded = drainage.saveCanalDrainageTier(enabled, 'left', 'tier-low', { toeFilterKind: '5-7', toeFilterDepth: 0.7, toeFilterSide: 'left' })
const gradedWorks = canal.canalSectionToeWorks(graded, graded.sections[0]).filter(w => w.kind === 'toe-filter')
assert.equal(gradedWorks.length, 1, 'Independent work-side selection is respected')
assert.equal(gradedWorks[0].side, 'left')
assert.ok(Math.abs(gradedWorks[0].points[0].rl - gradedWorks[0].points[2].rl - 0.7) < 1e-9, 'Graded-filter depth matches the entered dimension')
assert.deepEqual(canal.canalSectionToeWorks(fixture(110), fixture(110).sections[0]), [], 'No bank works appear in full cutting')
assert.ok(!draw(base).includes('data-work='), 'Disabled toe works stay hidden')
assert.equal(preparedPaths(html).length, 1, 'Enabling drainage does not split the continuous prepared line')
console.log('Canal diagrams: continuous prepared line, cutting gaps, all enabled filters/toe works, lining, exact dimensions and disabled-work visibility passed.')
