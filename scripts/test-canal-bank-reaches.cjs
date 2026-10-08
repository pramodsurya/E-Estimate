const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')
const reaches = require('../src/renderer/src/lib/canalTierReaches.ts')
const protection = require('../src/renderer/src/lib/canalBankProtection.ts')
const cns = require('../src/renderer/src/lib/canalCns.ts')
const { updateCanalBankTierBoundary, saveCanalBankTierHeightRange } = require('../src/renderer/src/lib/canalBankTiers.ts')
const manualDesign = require('../src/renderer/src/lib/canalManualBankReaches.ts')
const near = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`)
function fixture() {
  const data = canal.defaultCanalData()
  data.lengthM = 1000
  data.design.bedLevelAtStart = 100
  data.design.bedSlope = 0
  data.sections = [0, 400, 500, 1000].map(chainage => ({ id: `s${chainage}`, chainage, strataTopRl: 101.1,
    ground: [{offset:-100,rl:98},{offset:100,rl:98}], designPopulated:true }))
  const config = data.design.bankConfig
  config.leftTiers = config.leftTiers.map(tier => ({ ...tier, sectionType:'homogeneous', berms:[], baseSlope:tier.id==='tier-high'?3:1.5,
    foundationTreatment:{...canal.defaultCanalTierFoundationConfig(),toeFilter:tier.id==='tier-high',toeFilterKind:'5-7',toeFilterWidth:2,toeFilterDepth:1,toeFilterSide:'both'},
    bankProtection:{...protection.defaultBankProtection(),kind:tier.id==='tier-high'?'grass':'none'} }))
  return data
}
let data = fixture()
assert.equal(canal.canalSectionBankTier(data,data.sections[0],'left').id,'tier-low', 'Top RL assignment takes priority over a different surveyed fill height')
near(canal.canalSectionBankFillHeight(data,data.sections[0],'left'),4.1)
const rows=[{id:'low',from:0,to:400,tierId:'tier-low',status:'fill'},{id:'high',from:400,to:1000,tierId:'tier-high',status:'fill'}]
data={...data,design:{...data.design,bankConfig:{...data.design.bankConfig,leftReachOverrides:rows}}}
function at(ch) { return {...data.sections[0],chainage:ch} }
assert.equal(canal.canalSectionBankTier(data,at(399),'left').id,'tier-low')
assert.equal(canal.canalSectionBankTier(data,at(400),'left').id,'tier-high','shared boundaries use the following reach')
assert.equal(canal.canalSectionBankTier(data,at(1000),'left').id,'tier-high','last endpoint is included')
// Geometry, toe filters and pitching must all apply the edited high profile over exactly 600 m.
const high = data.design.bankConfig.leftTiers.find(t=>t.id==='tier-high')
const side = canal.canalSideProfile(data,at(500),'left')
near(Math.max(...side.filter(p=>Math.abs(p.rl-102.1)<1e-6).map(p=>Math.abs(p.offset))), data.design.bedWidth/2+data.design.sideSlope*2.1+high.crestWidth)
near(canal.canalTierToeProtectionQuantities(data,'tier-high').toeFilterGradedVolume,2400)
near(protection.bankProtectionQuantities(data).reduce((s,r)=>s+r.area,0),4.1*Math.hypot(1,3)*600*2)
const integration = canal.canalBankIntegrationSections(data)
assert.deepEqual(integration.map(s=>s.chainage),[0,400,400,500,1000])
assert.deepEqual(integration.map(s=>canal.canalSectionBankTier(data,s,'left').id),['tier-low','tier-low','tier-high','tier-high','tier-high'])
const moved = reaches.editCanalBankReach(data,'left',rows,'low',{to:500})
assert.equal(moved.error,null); assert.equal(moved.rows[1].from,500)
assert.deepEqual(rows.map(r=>r.to),[400,1000], 'editing does not mutate saved rows')
assert.ok(reaches.editCanalBankReach(data,'left',rows,'low',{to:1100}).error)
assert.ok(reaches.editCanalBankReach(data,'left',rows,'low',{to:422}).error, 'Reject a synthetic chainage absent from both pages')
assert.ok(reaches.validateCanalBankReaches(data,'left',[{...rows[0],to:500},rows[1]]))
assert.ok(reaches.validateCanalBankReaches(data,'left',[{...rows[0],from:NaN}]))
data={...data,design:{...data.design,bankConfig:{...data.design.bankConfig,leftReachOverrides:moved.rows}}}
near(canal.canalTierToeProtectionQuantities(data,'tier-high').toeFilterGradedVolume,2000)
const restored=canal.migrateCanalData(JSON.parse(JSON.stringify(data)))
assert.deepEqual(restored.design.bankConfig.leftReachOverrides,moved.rows)
near(canal.canalTierToeProtectionQuantities(restored,'tier-high').toeFilterGradedVolume,2000)
const treatment = cns.measureTreatmentReach(restored,{id:'treatment',fromChainage:0,toChainage:1000},()=>[
  {offset:-2,rl:100},{offset:2,rl:100},{offset:2,rl:99},{offset:-2,rl:99}])
assert.deepEqual(treatment.errors,[])
assert.deepEqual(treatment.rows.map(r=>r.chainage),[0,400,500,500,1000],'lining treatment shares the edited bank boundaries')
near(treatment.cns,4000)
const crest = row => Math.max(...row.profile.filter(p=>Math.abs(p.rl-102.1)<1e-6).map(p=>Math.abs(p.offset)))
assert.ok(crest(treatment.rows[2]) < crest(treatment.rows[3]), 'one-sided treatment samples use their respective bank profiles')
const dense={...restored,sections:[0,250,500,750,1000].map(ch=>({...restored.sections[0],id:`dense${ch}`,chainage:ch}))}
assert.deepEqual(canal.canalBankIntegrationSections(dense).map(s=>s.chainage),[0,250,500,500,750,1000],'ordinary survey samples are not duplicated')
const oldSurvey=fixture()
oldSurvey.sections=oldSurvey.sections.map(s=>({...s,strataTopRl:undefined,ground:s.ground.map(p=>({...p,rl:100-2*s.chainage/1000}))}))
oldSurvey.design.bankConfig.leftTiers[1].foundationTreatment={...canal.defaultCanalTierFoundationConfig(),toeFilter:true,toeFilterKind:'5-7',toeFilterWidth:2,toeFilterDepth:1,toeFilterSide:'both'}
near(canal.canalTierToeProtectionQuantities(oldSurvey,'tier-medium').toeFilterGradedVolume,2000)
assert.deepEqual(reaches.canalBankReaches(oldSurvey,'left').map(r=>[r.from,r.to,r.tierId]),[[0,500,'tier-low'],[500,1000,'tier-medium']], 'Sections-only reaches use entered stations too')
// Manual reaches work without strata levels and without meeting any height bracket.
data=fixture()
data={...data,sections:data.sections.map(s=>({...s,strataTopRl:undefined})),design:{...data.design,bankConfig:{...data.design.bankConfig,mode:'manual',linkSymmetrical:false,
  leftManualReaches:[{...rows[0],to:1000}],rightManualReaches:[{...rows[1],from:250,to:750}],
  rightTiers:data.design.bankConfig.leftTiers.map(t=>({...t,minFillHeight:100,maxFillHeight:200}))}}}
assert.equal(canal.canalSectionBankTier(data,at(500),'left').id,'tier-low')
assert.equal(canal.canalSectionBankTier(data,at(500),'right').id,'tier-high')
assert.equal(canal.canalSectionBankTier(data,at(100),'right'),null)
near(canal.canalTierToeProtectionQuantities(data,'tier-high').toeFilterGradedVolume,1000)
data={...data,design:{...data.design,bedLevelAtStart:120}}
assert.equal(canal.canalSectionBankTier(data,at(500),'left').id,'tier-low', 'manual assignment stays fixed when heights change')
assert.deepEqual(canal.migrateCanalData(JSON.parse(JSON.stringify(data))).design.bankConfig.rightManualReaches,data.design.bankConfig.rightManualReaches)

// Older interpolated overrides migrate to the next entered station and remain shared.
const old=fixture()
old.design.bankConfig.leftReachOverrides=rows.map(r=>({...r,from:r.from===400?422.093:r.from,to:r.to===400?422.093:r.to}))
const aligned=canal.migrateCanalData(JSON.parse(JSON.stringify(old)))
assert.deepEqual(aligned.design.bankConfig.leftReachOverrides.map(r=>[r.from,r.to]),[[0,500],[500,1000]])
assert.deepEqual(reaches.canalBankReaches(old,'left').map(r=>[r.from,r.to]),[[0,500],[500,1000]])
near(canal.canalTierToeProtectionQuantities(aligned,'tier-high').toeFilterGradedVolume,2000)
assert.equal(old.design.bankConfig.leftReachOverrides[0].to,422.093, 'Migration does not mutate input')

// A section created outside Soil Strata is both a legal boundary and a height sample.
const mixed=fixture()
mixed.sections[1]={...mixed.sections[1],strataTopRl:undefined,isManual:true,ground:[{offset:-100,rl:94},{offset:100,rl:94}]}
assert.ok(reaches.canalBankReachStations(mixed).includes(400))
assert.equal(reaches.validateCanalBankReaches(mixed,'left',rows),null)
assert.deepEqual(reaches.canalBankReaches(mixed,'left').map(r=>[r.from,r.to,r.tierId]),[[0,400,'tier-low'],[400,500,'tier-high'],[500,1000,'tier-low']])
assert.equal(canal.canalSectionBankTier(mixed,mixed.sections[1],'left').id,'tier-high')
assert.equal(reaches.canalBankReaches(mixed,'left')[1].intervals[0].fromTopRl,94)

// Height limits are shared, exclusive, and cascade across all added tiers.
const originals=fixture().design.bankConfig.leftTiers
const originalJson=JSON.stringify(originals)
let brackets=updateCanalBankTierBoundary(originals,'tier-low','max',4)
assert.deepEqual(brackets.map(t=>[t.minFillHeight,t.maxFillHeight]),[[0,4],[4,6],[6,9999]])
brackets=updateCanalBankTierBoundary(brackets,'tier-medium','min',5)
assert.deepEqual(brackets.map(t=>[t.minFillHeight,t.maxFillHeight]),[[0,5],[5,6],[6,9999]])
brackets=updateCanalBankTierBoundary(originals,'tier-low','max',8)
assert.deepEqual(brackets.map(t=>[t.minFillHeight,t.maxFillHeight]),[[0,8],[8,11],[11,9999]])
const extra=[...originals.slice(0,2),{...originals[2],maxFillHeight:9},{...originals[2],id:'extra',minFillHeight:9}]
for (const [id,edge,value] of [['tier-low','max',10],['extra','min',2],['tier-medium','max',.5]]) {
  const result=updateCanalBankTierBoundary(extra,id,edge,value)
  assert.equal(result[0].minFillHeight,0)
  assert.equal(result.at(-1).maxFillHeight,9999)
  result.forEach((t,i)=>{assert.ok(t.maxFillHeight>t.minFillHeight);if(i)assert.equal(t.minFillHeight,result[i-1].maxFillHeight)})
}
assert.equal(JSON.stringify(originals),originalJson,'Height edits do not mutate saved tiers')
const savedHeights=saveCanalBankTierHeightRange(originals,'tier-medium',4,7)
assert.equal(savedHeights.error,null)
assert.deepEqual(savedHeights.tiers.map(t=>[t.minFillHeight,t.maxFillHeight]),[[0,4],[4,7],[7,9999]],'Save adjusts both boundaries together')
const pushedHeights=saveCanalBankTierHeightRange(extra,'tier-low',0,10)
assert.equal(pushedHeights.error,null)
pushedHeights.tiers.forEach((t,i)=>{assert.ok(t.maxFillHeight>t.minFillHeight);if(i)assert.equal(t.minFillHeight,pushedHeights.tiers[i-1].maxFillHeight)})
for(const [id,min,max] of [['tier-medium',NaN,6],['tier-medium',6,4],['tier-low',1,4],['tier-high',6,9]]) {
  const invalid=saveCanalBankTierHeightRange(originals,id,min,max)
  assert.ok(invalid.error)
  assert.strictEqual(invalid.tiers,originals,'Invalid draft leaves the saved tiers intact')
}
assert.strictEqual(saveCanalBankTierHeightRange(originals,'tier-low',0,3).tiers,originals,'Unchanged save needs no recalculation')
assert.equal(JSON.stringify(originals),originalJson,'Saving height limits does not mutate the source tiers')
const adjusted=fixture()
adjusted.sections=[0,100,200,300,400].map((chainage,i)=>({...adjusted.sections[0],id:`height${i}`,chainage,strataTopRl:102.1-[2,3.5,5.5,7,7][i]}))
adjusted.lengthM=400
adjusted.design.bankConfig.leftTiers=updateCanalBankTierBoundary(adjusted.design.bankConfig.leftTiers,'tier-low','max',4)
assert.deepEqual(reaches.canalBankReaches(adjusted,'left').map(r=>[r.from,r.to,r.tierId]),[[0,200,'tier-low'],[200,300,'tier-medium'],[300,400,'tier-high']])

// Extending across multiple bund tiers trims or consumes them without overlap.
const exclusive=fixture()
const three=[rows[0],{id:'medium',from:400,to:500,tierId:'tier-medium',status:'fill'},{...rows[1],from:500}]
const consumed=reaches.editCanalBankReach(exclusive,'left',three,'low',{to:1000})
assert.equal(consumed.error,null)
assert.deepEqual(consumed.rows.map(r=>[r.from,r.to,r.tierId]),[[0,1000,'tier-low']])
const inserted=reaches.assignCanalBankReach(exclusive,'left',[{...rows[0],to:1000}],{...three[1],tierId:'tier-high'})
assert.equal(inserted.error,null)
assert.deepEqual(inserted.rows.map(r=>[r.from,r.to]),[[0,400],[400,500],[500,1000]])
assert.equal(new Set(inserted.rows.map(r=>r.id)).size,3)
for(const tierId of ['tier-low','tier-medium','tier-high']) {
  assert.equal(reaches.editCanalBankReach(exclusive,'left',[{...three[1],status:'unassigned',tierId:null}],'medium',{status:'fill',tierId}).error,null,'An unassigned positive reach can choose any bund')
}

// Mixed reaches are allowed; only pure cutting is barred from a bund assignment.
const cutting=fixture()
cutting.sections[1]={...cutting.sections[1],strataTopRl:110}
cutting.sections[2]={...cutting.sections[2],strataTopRl:110}
const positive=reaches.canalBankReaches(cutting,'left').map(({id,from,to,tierId,status})=>({id,from,to,tierId,status}))
const partial=reaches.editCanalBankReach(cutting,'left',positive,positive[0].id,{to:500})
assert.equal(partial.error,null,'Extending a filling reach into partial cutting is allowed')
assert.deepEqual(partial.rows.map(r=>[r.from,r.to]),[[0,500],[500,1000]])
const partialSaved={...cutting,design:{...cutting.design,bankConfig:{...cutting.design.bankConfig,leftReachOverrides:partial.rows}}}
assert.deepEqual(reaches.canalBankReaches(partialSaved,'left').map(r=>[r.from,r.to,r.status]),[[0,500,'fill'],[500,1000,'cut']],'The accepted mixed reach retains its full range')
near(reaches.canalBankReaches(partialSaved,'left')[0].minHeight,-7.9)
near(reaches.canalBankReaches(partialSaved,'left')[0].maxHeight,1)
assert.equal(canal.canalSectionBankTier(partialSaved,cutting.sections[1],'left').id,'tier-low','All bank chapters retain the mixed reach profile')
assert.deepEqual(reaches.canalBankReaches(canal.migrateCanalData(JSON.parse(JSON.stringify(partialSaved))),'left').map(r=>[r.from,r.to,r.status]),[[0,500,'fill'],[500,1000,'cut']],'Mixed reaches persist through save/load')
const rejected=reaches.editCanalBankReach(cutting,'left',positive,positive[0].id,{from:400,to:500})
assert.match(rejected.error,/pure cutting.*Soil Strata.*Ground RL in Sections/)
assert.strictEqual(rejected.rows,positive,'A rejected edit preserves the partition')
assert.equal(reaches.validateCanalBankReaches(cutting,'left',[{...rows[0],to:400}]),null,'The exclusive To endpoint may be the start of cutting')
assert.match(reaches.assignCanalBankReach(cutting,'left',positive,{...rows[0],id:'cut-bund',from:400,to:500}).error,/cutting/)
assert.equal(reaches.assignCanalBankReach(cutting,'left',positive,{...rows[0],id:'mixed-bund',from:400,to:1000}).error,null,'A negative-to-positive interval is partial cutting even when its starting station is cutting')
const groundCut={...cutting,sections:cutting.sections.map((s,i)=>i===1?{...s,strataTopRl:undefined,ground:s.ground.map(p=>({...p,rl:110}))}:s)}
assert.equal(reaches.canalAutomaticBankReaches(groundCut,'left').find(r=>r.from===400).status,'cut')
assert.match(reaches.validateCanalBankReaches(groundCut,'left',[{...rows[0],from:400,to:500}]),/pure cutting/)
assert.equal(reaches.validateCanalBankReaches(groundCut,'left',[{...rows[0],to:500}]),null,'Sections Ground RL also permits a mixed fill/cut reach')
const changed={...cutting,design:{...cutting.design,bankConfig:{...cutting.design.bankConfig,leftReachOverrides:[{...rows[0],to:1000}]}}}
assert.deepEqual(reaches.canalBankReaches(changed,'left').map(r=>[r.from,r.to,r.status]),[[0,1000,'fill']],'Partial cutting does not split the edited bund range')
const pure={...changed,sections:changed.sections.map(s=>({...s,strataTopRl:110,ground:s.ground.map(p=>({...p,rl:110}))}))}
assert.match(reaches.validateCanalBankReaches(pure,'left',[{...rows[0],to:1000}]),/pure cutting/)
assert.deepEqual(reaches.canalBankReaches(pure,'left').map(r=>r.status),['cut'],'An RL change to pure cutting removes the old bund assignment')
assert.equal(canal.canalTierToeProtectionQuantities(pure,'tier-low').toeFilterGradedVolume,0)
assert.equal(canal.canalBankVolumeTotals(pure).homogeneous,0,'Pure cutting cannot bill bank fill')
const gapCut={...cutting,design:{...cutting.design,bankConfig:{...cutting.design.bankConfig,leftReachOverrides:[]}}}
assert.deepEqual(reaches.canalBankReaches(gapCut,'left').map(r=>r.status),['unassigned','cut'],'Unassigned choices exclude automatic cutting')
const atLevel={...cutting,sections:cutting.sections.map((s,i)=>i===1||i===2?{...s,strataTopRl:102.1}:s)}
assert.match(reaches.validateCanalBankReaches(atLevel,'left',[{...rows[0],from:400,to:500}]),/no positive bund height/)
assert.equal(reaches.validateCanalBankReaches(atLevel,'left',[{...rows[0],to:500}]),null,'Level intervals may join a reach containing positive filling')
const unknown={...cutting,sections:cutting.sections.map((s,i)=>i===1?{...s,strataTopRl:undefined,ground:[],designPopulated:false}:s)}
assert.match(reaches.validateCanalBankReaches(unknown,'left',[{...rows[0],to:500}]),/Levels are missing/)
data={...fixture(),design:{...fixture().design,bankConfig:{...fixture().design.bankConfig,mode:'manual'}}}
assert.equal(canal.canalBankVolumeTotals(data).homogeneous,0,'unassigned manual reaches cannot silently bill default bank profiles')
assert.deepEqual(reaches.canalBankReaches(data,'left').map(r=>r.status),['unassigned'])
const empty=fixture()
empty.sections=empty.sections.map(s=>({...s,strataTopRl:undefined,ground:[],designPopulated:false}))
assert.deepEqual(reaches.canalBankReaches(empty,'left').map(r=>r.status),['missing'],'empty sections cannot invent a provisional fill height')

// Manual mode creates one independent design per range, without any height groups.
let manual=fixture()
manual.lengthM=7000
manual.sections=[0,3500,7000].map(ch=>({...manual.sections[0],id:`manual${ch}`,chainage:ch,strataTopRl:110}))
const programProfiles=structuredClone(manual.design.bankConfig.leftTiers)
manual.design.bankConfig=manualDesign.switchCanalBankDesignMode(manual.design.bankConfig,'manual',canal.defaultCanalBankDesignConfig())
assert.deepEqual(manual.design.bankConfig.leftTiers,[],'Manual mode has no preset Low/Medium/High cards')
const firstProfile={...manualDesign.newCanalManualBankProfile('reach-one','profile-one','Reach 1'),crestWidth:4}
const secondProfile={...manualDesign.newCanalManualBankProfile('reach-two','profile-two','Reach 2'),crestWidth:8,baseSlope:3,
  foundationTreatment:{...canal.defaultCanalTierFoundationConfig(),toeFilter:true,toeFilterKind:'5-7',toeFilterWidth:2,toeFilterDepth:1,toeFilterSide:'both'}}
const firstReach={id:'reach-one',from:0,to:2300,tierId:firstProfile.id,status:'fill'}
const secondReach={id:'reach-two',from:3000,to:6000,tierId:secondProfile.id,status:'fill'}
for (const [row,profile] of [[firstReach,firstProfile],[secondReach,secondProfile]]) {
  const saved=manualDesign.saveCanalManualBankReach(manual,'left',row,profile)
  assert.equal(saved.error,null)
  manual={...manual,design:{...manual.design,bankConfig:saved.config}}
}
assert.equal(canal.canalSectionBankTier(manual,{...manual.sections[0],chainage:1000},'left').crestWidth,4)
assert.equal(canal.canalSectionBankTier(manual,{...manual.sections[0],chainage:4000},'left').crestWidth,8)
assert.equal(canal.canalSectionBankTier(manual,{...manual.sections[0],chainage:2500},'left'),null,'Gaps stay outside the user-created designs')
near(canal.canalTierToeProtectionQuantities(manual,'profile-two').toeFilterGradedVolume,12000)
const overlapping=manualDesign.saveCanalManualBankReach(manual,'left',{id:'overlap',from:2000,to:4000,tierId:'overlap-profile',status:'fill'},manualDesign.newCanalManualBankProfile('overlap','overlap-profile','Overlap'))
assert.match(overlapping.error,/overlap/)
assert.strictEqual(overlapping.config,manual.design.bankConfig)
const loaded=canal.migrateCanalData(JSON.parse(JSON.stringify(manual)))
assert.deepEqual(loaded.design.bankConfig.leftManualReaches.map(r=>[r.from,r.to]),[[0,2300],[3000,6000]])
assert.deepEqual(loaded.design.bankConfig.leftTiers.map(t=>t.crestWidth),[4,8])
const programAgain=manualDesign.switchCanalBankDesignMode(loaded.design.bankConfig,'tiered',canal.defaultCanalBankDesignConfig())
assert.deepEqual(programAgain.leftTiers,programProfiles,'Programmatic settings are preserved separately')
const manualAgain=manualDesign.switchCanalBankDesignMode(programAgain,'manual',canal.defaultCanalBankDesignConfig())
assert.deepEqual(manualAgain.leftTiers.map(t=>t.crestWidth),[4,8],'Manual designs survive mode switching')
const removed=manualDesign.removeCanalManualBankReach(manualAgain,'left','reach-one')
assert.deepEqual(removed.leftManualReaches.map(r=>r.id),['reach-two'])
assert.deepEqual(removed.leftTiers.map(t=>t.id),['profile-two'])
const independentManual={...manual,design:{...manual.design,bankConfig:{...manual.design.bankConfig,linkSymmetrical:false,rightManualReaches:[],rightTiers:[]}}}
const rightProfile=manualDesign.newCanalManualBankProfile('right-reach','right-profile','Right reach')
const rightSaved=manualDesign.saveCanalManualBankReach(independentManual,'right',{id:'right-reach',from:800,to:4000,tierId:rightProfile.id,status:'fill'},rightProfile)
assert.equal(rightSaved.error,null)
assert.deepEqual(rightSaved.config.leftManualReaches,manual.design.bankConfig.leftManualReaches)
assert.equal(rightSaved.config.rightManualReaches.length,1)
const legacyManual=fixture().design.bankConfig
legacyManual.mode='manual'
legacyManual.leftManualReaches=[{...firstReach,tierId:'tier-low'},
  {id:'old-gap',from:2300,to:3000,tierId:null,status:'unassigned'},
  {...secondReach,tierId:'tier-low'}]
const legacySeparated=manualDesign.normalizeCanalManualBankConfig(legacyManual)
assert.equal(legacySeparated.leftManualReaches.length,2,'Older derived gaps are not stored as user-created reaches')
assert.equal(new Set(legacySeparated.leftManualReaches.map(r=>r.tierId)).size,2,'Older shared profiles become independent reach designs')
const gapProfile=manualDesign.newCanalManualBankProfile('gap-reach','gap-profile','Gap reach')
const gapSaved=manualDesign.saveCanalManualBankReach({...manual,design:{...manual.design,bankConfig:legacySeparated}},'left',
  {id:'gap-reach',from:2300,to:3000,tierId:gapProfile.id,status:'fill'},gapProfile)
assert.equal(gapSaved.error,null,'A user can create a reach in an older derived gap')
legacySeparated.leftTiers[0].foundationTreatment.blanket='5-4'
assert.equal(legacySeparated.leftTiers[1].foundationTreatment.blanket,'none','Nested design settings are not shared between reaches')
assert.equal(legacyManual.leftTiers[0].foundationTreatment.blanket,'none','Migration does not mutate the original settings')

// The manual screen lists reach cards and shares the existing bund controls.
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename)
require.extensions['.css']=()=>{}
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const BankDesign=require('../src/renderer/src/components/canal/v2/chapters/CanalBankDesign.tsx').default
const manualMarkup=renderToStaticMarkup(React.createElement(BankDesign,{data:manual,sections:manual.sections,onCommit:()=>{}}))
for(const text of ['Km 2.300','Km 3.000','Km 6.000','Crest Width','Upper Slope','Outer Berm Shelves']) assert.ok(manualMarkup.includes(text),`Manual screen missing ${text}`)
for(const text of ['Low Bund','Medium Bund','High Bund','Continuous Fill-Height Bracket Scale','At bank-top level','Missing Top RL','Add Bank Profile']) assert.ok(!manualMarkup.includes(text),`Manual screen must not show ${text}`)
console.log('Shared bank reaches: geological selection, editable boundaries, geometry, exact filter and protection lengths, save/load, independent manual profiles and unassigned billing passed.')
// Drainage/filter decisions are per reach even when the geometry profile is shared.
for (const mode of ['tiered','manual']) {
  let drainage=fixture(); drainage.configured=true
  const cfg=drainage.design.bankConfig; cfg.mode=mode
  cfg.leftTiers=cfg.leftTiers.map(t=>({...t,foundationTreatment:canal.defaultCanalTierFoundationConfig()}))
  const shared=[{id:'dr1',from:0,to:400,tierId:'tier-low',status:'fill'},{id:'dr2',from:400,to:1000,tierId:'tier-low',status:'fill'}]
  if(mode==='tiered')cfg.leftReachOverrides=shared;else cfg.leftManualReaches=shared
  const first=reaches.canalBankReaches(drainage,'left')[0], second=reaches.canalBankReaches(drainage,'left')[1]
  const gross=canal.canalBankVolumeTotals(drainage).homogeneous
  drainage=canal.saveCanalBankReachTreatment(drainage,'left',first,{blanket:'5-4',blanketWidthMode:'manual',blanketLeftWidth:1,blanketRightWidth:1,horizontalFilter:true,filterLengthMode:'manual',filterLeftLength:1,filterRightLength:1,filterThickness:.5})
  assert.equal(canal.canalBankTreatmentForReach(drainage,'left',second).blanket,'none','same-profile adjacent reach remains unchanged')
  near(canal.canalTierFoundationQuantities(drainage,undefined,{from:0,to:400}).blanketQuantity,800)
  near(canal.canalTierFoundationQuantities(drainage,undefined,{from:0,to:400}).filterVolume,400)
  near(canal.canalTierFoundationQuantities(drainage,undefined,{from:400,to:1000}).blanketQuantity,0)
  near(canal.canalTierFoundationQuantities(drainage,undefined,{from:0,to:400,side:'left'}).blanketQuantity,400)
  drainage=canal.saveCanalBankReachTreatment(drainage,'left',second,{blanket:'5-5',blanketWidthMode:'manual',blanketLeftWidth:1,blanketRightWidth:1,blanketThickness:.3})
  const items=canal.canalTierFoundationItems(drainage)
  near(items.find(i=>i.code==='IRR-CAW-5-4').quantity,800)
  assert.equal(items.find(i=>i.code==='IRR-CAW-5-4').unit,'sq.m')
  near(items.find(i=>i.code==='IRR-CAW-5-5').quantity,360)
  assert.equal(items.find(i=>i.code==='IRR-CAW-5-5').unit,'cu.m')
  near(gross-canal.canalBankVolumeTotals(drainage).homogeneous,960)
  drainage=canal.saveCanalBankReachTreatment(drainage,'left',first,{toeFilter:true,toeFilterKind:'5-12',toeFilterWidth:2,toeFilterSide:'both'})
  near(canal.canalTierToeProtectionQuantities(drainage,undefined,{from:0,to:400}).toeFilterFabric200Area,1600)
  assert.equal(canal.canalBankTreatmentForReach(drainage,'left',first).blanket,'5-4','saving filter changes retains saved blanket')
  const loaded=canal.migrateCanalData(JSON.parse(JSON.stringify(drainage)))
  near(canal.canalTierFoundationItems(loaded).find(i=>i.code==='IRR-CAW-5-5').quantity,360)
  const synced=canal.syncCanalItems({id:'root',kind:'title',name:'R',children:[{id:'canal',kind:'component',name:'Canal',canal:loaded,children:[]}]},'canal')
  const billed=synced.children[0].children
  assert.ok(billed.some(i=>i.templateItemRole==='sand-blanket' && Math.abs(i.computedQuantity-800)<.01),'fixed blanket billed over selected reach only')
  assert.ok(billed.some(i=>i.templateItemRole==='sand-blanket' && Math.abs(i.computedQuantity-360)<.01),'variable blanket billed separately')
  const independent={...drainage,design:{...drainage.design,bankConfig:{...drainage.design.bankConfig,linkSymmetrical:false}}}
  assert.equal(canal.canalSectionBankTreatment(independent,independent.sections[0],'right').blanket,'none','independent right bank unaffected')
}
console.log('Per-reach drainage: exact scopes, independent same-profile reaches, mixed blanket units, fill deduction, toe filters, manual mode and save/load passed.')

// Drainage owns its own design mode and ranges, independently of bank geometry.
const drainageDesign = require('../src/renderer/src/lib/canalDrainageDesign.ts')
let independentDrainage = fixture()
independentDrainage.configured = true
independentDrainage.design.bankConfig.leftTiers = independentDrainage.design.bankConfig.leftTiers.map(t => ({...t, foundationTreatment:canal.defaultCanalTierFoundationConfig()}))
const geometryBefore = structuredClone(independentDrainage.design.bankConfig)
const fillBefore = canal.canalBankVolumeTotals(independentDrainage).homogeneous
independentDrainage = {...independentDrainage, design:{...independentDrainage.design,bankDrainage:{mode:'manual'}}}
const fixed = {blanket:'5-4',blanketWidthMode:'manual',blanketLeftWidth:1,blanketRightWidth:1}
const variable = {...fixed,blanket:'5-5',blanketThickness:.3}
for (const row of [{id:'d1',from:0,to:175,treatment:fixed},{id:'d2',from:225,to:800,treatment:variable}]) {
  const result = drainageDesign.saveCanalManualDrainageReach(independentDrainage,'left',row)
  assert.equal(result.error,null)
  independentDrainage = result.data
}
assert.deepEqual(independentDrainage.design.bankConfig,geometryBefore,'drainage ranges do not alter geometry mode/profiles/reaches')
const independentItems = canal.canalTierFoundationItems(independentDrainage)
near(independentItems.find(i=>i.code==='IRR-CAW-5-4').quantity,350)
near(independentItems.find(i=>i.code==='IRR-CAW-5-5').quantity,345)
near(fillBefore-canal.canalBankVolumeTotals(independentDrainage).homogeneous,432.5)
assert.equal(canal.canalSectionBankTreatment(independentDrainage,{...independentDrainage.sections[0],chainage:200},'left').blanket,'none','drainage gaps have no works')
assert.equal(canal.canalSectionBankTreatment(independentDrainage,{...independentDrainage.sections[0],chainage:225},'left').blanket,'5-5','exact shared work boundary uses next reach')
assert.match(drainageDesign.saveCanalManualDrainageReach(independentDrainage,'left',{id:'bad',from:150,to:250,treatment:fixed}).error,/overlaps/)
assert.match(drainageDesign.saveCanalManualDrainageReach(independentDrainage,'left',{id:'bad',from:800,to:1001,treatment:fixed}).error,/within/)
assert.match(drainageDesign.saveCanalManualDrainageReach(independentDrainage,'left',{id:'bad',from:800.5,to:900,treatment:fixed}).error,/whole metres/)
let programDrainage = drainageDesign.saveCanalDrainageTier(independentDrainage,'left','tier-low',fixed)
near(canal.canalTierFoundationItems(programDrainage).find(i=>i.code==='IRR-CAW-5-4').quantity,2000)
assert.deepEqual(programDrainage.design.bankDrainage.leftReaches,independentDrainage.design.bankDrainage.leftReaches,'programmatic save preserves inactive manual works')
programDrainage = {...programDrainage,design:{...programDrainage.design,bankDrainage:{...programDrainage.design.bankDrainage,mode:'manual'}}}
near(canal.canalTierFoundationItems(canal.migrateCanalData(JSON.parse(JSON.stringify(programDrainage)))).find(i=>i.code==='IRR-CAW-5-5').quantity,345)
const rightDrainage = {...independentDrainage,design:{...independentDrainage.design,bankConfig:{...independentDrainage.design.bankConfig,linkSymmetrical:false}}}
near(canal.canalTierFoundationItems(rightDrainage).find(i=>i.code==='IRR-CAW-5-4').quantity,175)
// Height-tier drainage remains available over manual bank geometry.
let manualGeometry = {...programDrainage,design:{...programDrainage.design,bankConfig:{...programDrainage.design.bankConfig,mode:'manual',leftManualReaches:[{id:'mg',from:0,to:1000,tierId:'tier-low',status:'fill'}]}}}
manualGeometry = drainageDesign.saveCanalDrainageTier(manualGeometry,'left','tier-low',fixed)
assert.equal(drainageDesign.canalDrainageTiers(manualGeometry,'left').length,3)
near(canal.canalTierFoundationItems(manualGeometry).find(i=>i.code==='IRR-CAW-5-4').quantity,2000)
const independentSync = canal.syncCanalItems({id:'root',kind:'title',name:'R',children:[{id:'canal',kind:'component',name:'Canal',canal:independentDrainage,children:[]}]},'canal').children[0].children
assert.ok(independentSync.some(i=>i.templateItemRole==='sand-blanket'&&Math.abs(i.computedQuantity-350)<.01))
assert.ok(independentSync.some(i=>i.templateItemRole==='sand-blanket'&&Math.abs(i.computedQuantity-345)<.01))
console.log('Independent drainage modes: tier groups, exact manual ranges/gaps, mixed billing, fill deductions, validation, save/load and independent banks passed.')

// Rock toe / open ditch uses its own scopes without changing internal drainage.
let toeData = independentDrainage
const toeChapter = 'bankToeDrainage'
const rockSpec = {rockToeProtection:true,rockToeProtectionSide:'both',rockToeTopWidth:1,rockToeProtectionHeight:1,rockToeInnerSlope:1,rockToeFilter:true}
const rubbleSpec = {toeDrain:true,toeDrainSide:'both',toeDrainBottomWidth:2,toeDrainDepth:1,toeDrainLeftSlope:1,toeDrainRightSlope:1,toeDrainProtection:'rubble'}
const concreteSpec = {...rubbleSpec,toeDrainBottomWidth:1.5,toeDrainDepth:.5,toeDrainLeftSlope:.5,toeDrainProtection:'concrete'}
for (const row of [{id:'rock-work',from:0,to:333,treatment:rockSpec},{id:'rubble-work',from:375,to:700,treatment:rubbleSpec},{id:'concrete-work',from:700,to:1000,treatment:concreteSpec}]) {
  const result = drainageDesign.saveCanalManualDrainageReach(toeData,'left',row,toeChapter)
  assert.equal(result.error,null)
  toeData=result.data
}
assert.deepEqual(toeData.design.bankDrainage,independentDrainage.design.bankDrainage,'toe works leave the internal drainage chapter unchanged')
assert.deepEqual(toeData.design.bankConfig,geometryBefore,'toe work reaches leave bank geometry unchanged')
const toeQ = canal.canalTierToeProtectionQuantities(toeData)
near(toeQ.rockToeVolume,333*2*(1+.5*(1+1.5)))
near(toeQ.rockToeFilterVolume,333*2*(1+1+1.5+.5*Math.sqrt(2)))
near(toeQ.toeDrainExcavationVolume,325*2*3+300*2*(1.5*.5+.5*.5*.5*1.5))
near(toeQ.toeDrainRubbleArea,325*2*(2+2*Math.sqrt(2)))
near(toeQ.toeDrainConcreteVolume,300*2*(1.5+.5*Math.hypot(1,.5)+.5*Math.hypot(1,1))*.1)
near(canal.canalTierToeProtectionQuantities(toeData,undefined,{from:0,to:1000,ranges:[{from:0,to:333}]}).rockToeVolume,1498.5)
const atToeGap = canal.canalSectionBankTreatment(toeData,{...toeData.sections[0],chainage:350},'left')
assert.equal(atToeGap.rockToeProtection,false)
assert.equal(atToeGap.toeDrain,false)
assert.equal(atToeGap.blanket,'5-5','internal blanket continues across a gap in the separate toe chapter')
near(canal.canalTierFoundationItems(toeData).find(i=>i.code==='IRR-CAW-5-4').quantity,350)
near(canal.canalTierFoundationItems(toeData).find(i=>i.code==='IRR-CAW-5-5').quantity,345)
const toeLoaded = canal.migrateCanalData(JSON.parse(JSON.stringify(toeData)))
near(canal.canalTierToeProtectionQuantities(toeLoaded).rockToeVolume,toeQ.rockToeVolume)
const toeSynced = canal.syncCanalItems({id:'root',kind:'title',name:'R',children:[{id:'canal',kind:'component',name:'Canal',canal:toeLoaded,children:[]}]},'canal').children[0].children
for (const [code,qty] of [['IRR-CAW-5-6',toeQ.rockToeVolume],['IRR-CAW-5-11',toeQ.rockToeFilterVolume],['IRR-CAW-8-4',toeQ.toeDrainRubbleArea],['IRR-CAW-7-15',toeQ.toeDrainConcreteVolume]])
  assert.ok(toeSynced.some(i=>i.name.includes(code)&&Math.abs(i.computedQuantity-qty)<.01),`Missing generated toe work ${code}`)
assert.match(drainageDesign.saveCanalManualDrainageReach(toeData,'left',{id:'bad-toe',from:332,to:500,treatment:rockSpec},toeChapter).error,/overlaps/)
let autoToe = drainageDesign.saveCanalDrainageTier(toeData,'left','tier-low',rockSpec,toeChapter)
near(canal.canalTierToeProtectionQuantities(autoToe).rockToeVolume,4500)
assert.deepEqual(autoToe.design.bankToeDrainage.leftReaches,toeData.design.bankToeDrainage.leftReaches)
autoToe={...autoToe,design:{...autoToe.design,bankToeDrainage:{...autoToe.design.bankToeDrainage,mode:'manual'}}}
near(canal.canalTierToeProtectionQuantities(autoToe).toeDrainConcreteVolume,toeQ.toeDrainConcreteVolume)
const rightToe = {...toeData,design:{...toeData.design,bankConfig:{...toeData.design.bankConfig,linkSymmetrical:false}}}
near(canal.canalTierToeProtectionQuantities(rightToe).rockToeVolume,toeQ.rockToeVolume/2)
const removeRock = drainageDesign.removeCanalManualDrainageReach(toeData,'left','rock-work',toeChapter)
near(canal.canalTierToeProtectionQuantities(removeRock).rockToeVolume,0)
near(canal.canalTierToeProtectionQuantities(removeRock).toeDrainConcreteVolume,toeQ.toeDrainConcreteVolume)
const crossingToe = {...toeData,design:{...toeData.design,
  bankConfig:{...toeData.design.bankConfig,leftReachOverrides:[{id:'geom-low',from:0,to:400,tierId:'tier-low',status:'fill'},{id:'geom-high',from:400,to:1000,tierId:'tier-high',status:'fill'}]},
  bankToeDrainage:{mode:'manual',leftReaches:[{id:'crossing-work',from:0,to:1000,treatment:rockSpec}]}}}
near(canal.canalTierToeProtectionQuantities(crossingToe).rockToeVolume,400*2*(1+.5*(1+1.5))+600*2*(1+.5*(1+3)))
assert.equal(crossingToe.design.bankToeDrainage.leftReaches.length,1,'one manual work reach spans different bank profiles')
console.log('Independent rock toe/open ditch: exact reaches, gaps, mixed linings, filter volume, separate chapter ownership, generated items and save/load passed.')
