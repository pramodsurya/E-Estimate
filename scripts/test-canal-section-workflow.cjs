const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const canal = require('../src/renderer/src/lib/canal.ts')

// Execute the real page event handlers with local hook state, without maps or files.
function page(file, overrides = {}, exportName = 'default') {
  const slots = []
  let cursor = 0
  const hooks = {
    ...React,
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], update => { slots[i] = typeof update === 'function' ? update(slots[i]) : update }]
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = {current:initial}; return slots[i] },
    useEffect() {},
    useMemo(factory, deps) {
      const i = cursor++
      const previous = slots[i]
      if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps[index]))) slots[i] = {deps, value:factory()}
      return slots[i].value
    },
    useCallback(callback) { return callback }
  }
  const filename = path.resolve(__dirname, '../src/renderer/src/components/canal/v2/chapters', file)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = mod.require.bind(mod)
  mod.require = name => name === 'react' ? hooks : name in overrides ? overrides[name] : originalRequire(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop:true }
  }).outputText, filename)
  return props => { cursor = 0; return mod.exports[exportName](props) }
}
function elements(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate))
  if (!React.isValidElement(node)) return []
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children, predicate)]
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('')
  if (React.isValidElement(node)) return text(node.props.children)
  return node == null ? '' : String(node)
}
let data = {...canal.defaultCanalData(),lengthM:100,sections:[
  {id:'a',chainage:0,ground:[],designPopulated:false},
  {id:'b',chainage:100,ground:[],designPopulated:false}
]}
data.design.bedLevelAtStart = 100
const onCommit = update => {data = update(data)}
const strata = page('CanalErmStrata.tsx', {
  '../../../../lib/canalErmExcel': {ERM_ROCK_BOTTOM_LABEL:'Hard Rock bottom RL'}
})
let ui = strata({data,onCommit})
assert.ok(!text(ui).includes('Save all & create sections'))
const saveButtons = node => elements(node, n => n.type === 'button' && text(n) === 'Save all')
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Save all starts disabled without edits')
const paste = elements(ui, n => n.type === 'textarea')[0]
paste.props.onChange({target:{value:'0\t111\t108\t105\t101\t81\n100\t90\t87\t-\t83\t60'}})
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => !button.props.disabled), 'New valid pasted levels enable every Save all button')
elements(ui, n => n.type === 'button' && text(n) === 'Save all')[0].props.onClick()
assert.deepEqual(data.sections.map(s => s.strataTopRl), [111,90])
assert.ok(data.sections.every(s => !s.designPopulated && s.ground.length===0), 'Saving strata must not populate geometry')
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Save all disables after saving')
const setPaste = value => elements(ui, n => n.type === 'textarea')[0].props.onChange({target:{value}})
setPaste('0\t111\t108\t105\t101\t81\n100\t90\t87\t-\t83\t60')
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Pasting already saved levels needs no save')
setPaste('0\t111\t108\t105\t101\t82')
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => !button.props.disabled), 'A changed rock bottom enables Save all')
setPaste('0\t111\t112\t105\t101\t81')
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Invalid pasted levels cannot be saved')
setPaste('')
ui = strata({data,onCommit})
const rowEditor = () => elements(ui, n => typeof n.type === 'function' && n.props.section?.id === 'a')[0]
rowEditor().props.onDirtyChange(true)
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => !button.props.disabled), 'Manual edits enable Save all')
rowEditor().props.onDirtyChange(false)
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Reverting manual edits disables Save all')
rowEditor().props.onDirtyChange(true)
ui = strata({data,onCommit})
rowEditor().props.onSave({chainage:0,topRl:111,bottoms:[108,105,101],end:'hard-rock',hardRockBottomRl:81})
ui = strata({data,onCommit})
assert.ok(saveButtons(ui).every(button => button.props.disabled), 'Saving the edited row clears the pending change')

const sections = page('CanalCrossSections.tsx', {
  '../../CanalSectionDiagram': {__esModule:true, default:()=>null},
  './CanalSectionSoilProfile': {__esModule:true, default:()=>null}
})
ui = sections({data,onCommit})
const draft = elements(ui, n => typeof n.type === 'function' && n.props.label === 'Average Ground RL (m)')[0]
assert.equal(draft.props.value, 111, 'Saved Top RL prefills the active section ground field')
const selectAll = elements(ui, n => n.type === 'label' && text(n).includes('Select all'))[0]
elements(selectAll, n => n.type === 'input')[0].props.onChange()
ui = sections({data,onCommit})
const bulk = elements(ui, n => n.type === 'button' && text(n) === 'Populate all selected (2)')[0]
assert.equal(bulk.props.disabled, false)
bulk.props.onClick()
assert.ok(data.sections.every(s => s.designPopulated && s.designPointOffsets.length>1))
assert.deepEqual(data.sections.map(s => s.leftToeRl), [111,90], 'Select all uses each row Top RL')
assert.ok(data.sections.every(s => s.ground.length>=2))
ui = sections({data,onCommit})
const clearAll = elements(ui, n => n.type === 'label' && text(n).includes('Select all'))[0]
elements(clearAll, n => n.type === 'input')[0].props.onChange()
ui = sections({data,onCommit})
assert.equal(elements(ui, n => n.type === 'button' && text(n) === 'Populate all selected')[0].props.disabled, true)
console.log('Canal page workflow: Save all only, Top RL prefill, Select all, Populate all selected and deselection passed.')

async function testCutPreview() {
  const Diagram = () => null
  const cutPage = page('CanalCutDesign.tsx', {
    '../../CanalSectionDiagram': {__esModule:true, default:Diagram}
  })
  const cutting = canal.defaultCanalData()
  Object.assign(cutting.design, {bedLevelAtStart:94,bedSlope:0,bedWidth:3,fullSupplyDepth:1.5,freeBoard:0.6,sideSlope:1.5})
  cutting.design.cutBermConfig.enabled = false
  const full = {id:'full',chainage:30,designPopulated:true,ground:[{offset:-25,rl:99.98},{offset:25,rl:99.98}]}
  const uneven = {id:'uneven',chainage:60,designPopulated:true,ground:[
    {offset:-25,rl:97},{offset:-10,rl:99},{offset:0,rl:93},{offset:10,rl:101},{offset:25,rl:100}
  ]}
  const pending = {id:'pending',chainage:0,designPopulated:false,ground:[],strataTopRl:110}
  const fill = {id:'fill',chainage:90,designPopulated:true,ground:[{offset:-25,rl:90},{offset:25,rl:90}]}
  cutting.sections = [pending, full, uneven, fill]
  const props = () => ({data:cutting,sections:cutting.sections,onCommit:()=>{}})
  const preview = tree => elements(tree, n => n.type === Diagram)[0]
  const fullAreas = canal.canalSectionAreas(cutting, full)
  const unevenAreas = canal.canalSectionAreas(cutting, uneven)
  assert.ok(unevenAreas.cutting > 0 && unevenAreas.filling > 0, 'Uneven ground has cutting and filling despite its centre GL being below bed')
  let tree = cutPage(props())
  assert.equal(preview(tree).props.section, full, 'Original section draws before any native calculation result')
  assert.equal(preview(tree).props.data, cutting, 'Original renderer receives the saved design, without a separate sketch model')
  assert.ok(text(tree).includes(`Full Cutting | Cut: ${fullAreas.cutting.toFixed(2)} m² | Fill: 0.00 m²`))
  const picker = elements(tree, n => n.type === 'select')[0]
  assert.deepEqual(elements(picker, n => n.type === 'option').map(n => n.props.value), ['full','uneven'], 'Unpopulated and fill-only sections are excluded')
  picker.props.onChange({target:{value:'uneven'}})
  tree = cutPage(props())
  assert.equal(preview(tree).props.section, uneven, 'Section switching preserves every surveyed ground point')
  assert.ok(text(tree).includes(`Partial Cutting | Cut: ${unevenAreas.cutting.toFixed(2)} m² | Fill: ${unevenAreas.filling.toFixed(2)} m²`))

  const previousWindow = global.window
  try {
    let compiledPayload, savedWorkbook, nativeCalls = 0
    const cuttingMeasure = require('../src/renderer/src/lib/canalCutting.ts')
    const expected = cuttingMeasure.measureCanalCutting(cutting)
    global.window = {api:{
      canal:{calculateCutting:()=>{nativeCalls++; throw new Error('Separate calculator must not run')},exportCuttingExcel:()=>{nativeCalls++; throw new Error('Separate export must not run')}},
      excel:{compile:async payload=>{compiledPayload=payload;return {ok:true,data:'measured-workbook'}}},
      export:{workbook:async (...args)=>{savedWorkbook=args;return {canceled:false,path:'cutting.xlsx'}}}
    }}
    assert.ok(text(tree).includes(`Total Excavation: ${expected.totalVolume.toLocaleString('en-IN', {maximumFractionDigits:3})} m³`))
    elements(tree, n => n.type === 'select')[0].props.onChange({target:{value:'full'}})
    tree = cutPage(props())
    assert.ok(text(tree).includes(`Full Cutting | Cut: ${fullAreas.cutting.toFixed(2)}`))
    assert.equal(elements(tree, n => n.props.dangerouslySetInnerHTML).length, 0)
    assert.ok(text(tree).includes('Section Calculation') && text(tree).includes('Excavation by Material'))
    await elements(tree, n => n.type === 'button' && text(n).includes('Export Cutting'))[0].props.onClick()
    assert.equal(compiledPayload.kind, 'page')
    assert.ok(compiledPayload.page.extraSheets.some(sheet=>sheet.name==='Cut Polygons'), 'Export contains the coordinates actually drawn')
    assert.equal(savedWorkbook[0], 'measured-workbook')
    assert.equal(nativeCalls, 0, 'Display and export never call the independent Rust cutting calculator')
    const totals = compiledPayload.page.grid.cells.filter(cell=>cell.value===expected.totalVolume)
    assert.ok(totals.length>0, 'Export uses the displayed geometry total')
    // Draft edits preserve the saved diagram until Save & Calculate commits both together.
    let patch
    const editable = {...props(),onCommit:value=>{patch=value}}
    elements(tree, n => n.type==='button' && text(n).includes('Edit Cut Parameters'))[0].props.onClick()
    tree = cutPage(editable)
    elements(tree, n=>n.type==='input' && n.props.type==='checkbox')[0].props.onChange({target:{checked:true}})
    tree = cutPage(editable)
    assert.equal(preview(tree).props.data.design.cutBermConfig.enabled, false)
    elements(tree, n=>n.type==='button' && text(n).includes('Save & Calculate'))[0].props.onClick()
    assert.equal(patch.cutBermConfig.enabled, true)
    assert.equal(nativeCalls, 0)
    cutting.sections = [pending, uneven]
    tree = cutPage(props())
    assert.equal(preview(tree).props.section, uneven, 'Removing the selected section falls back to the next cutting section')
    cutting.sections = [pending]
    tree = cutPage(props())
    assert.equal(preview(tree), undefined)
    assert.ok(text(tree).includes('No populated cutting sections'))
    assert.ok(!text(tree).includes('All sections are in embankment'), 'Missing geometry must not be called filling')
  } finally {
    if (previousWindow === undefined) delete global.window
    else global.window = previousWindow
  }
  console.log('Cutting workflow: original geometry, full/mixed sections, shared quantities, coordinate/formula export, saved drafts and no independent native calculator passed.')
}
async function testBankDesign() {
  require.extensions['.css'] = () => {}
  require.extensions['.tsx'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
  }).outputText,file)
  const Diagram = () => null
  let calculations = 0, previews = 0, failSave = false
  const sectionEngine = require('../src/renderer/src/lib/canalBankSection.ts')
  const bankPage = page('CanalBankDesign.tsx', {
    '../../CanalSectionDiagram': {__esModule:true, default:Diagram},
    '../../../../lib/canal': {...canal,
      canalEarthworkTotals:()=>{throw new Error('Unused earthwork must not run during bank form rendering')},
      canalGroundProfileBetweenToes:(...args)=>{previews++;return canal.canalGroundProfileBetweenToes(...args)}
    },
    '../../../../lib/canalBankSection': {...sectionEngine,canalBankReachSummary:(current)=>{calculations++;return sectionEngine.canalBankReachSummary(current)}}
  })
  let bank = canal.defaultCanalData()
  bank.lengthM = 200
  Object.assign(bank.design,{bedLevelAtStart:100,bedSlope:0,heartingTrenchEnabled:false})
  bank.sections = [0,100,200].map(chainage=>({id:`bank-${chainage}`,chainage,designPopulated:true,strataTopRl:100,
    ground:[{offset:-80,rl:98},{offset:80,rl:98}]}))
  const commits = []
  const props = () => ({data:bank,sections:bank.sections,onCommit:patch=>{
    if(failSave)throw new Error('Could not save bank design')
    commits.push(patch); bank={...bank,design:{...bank.design,...patch}}
  }})
  let tree = bankPage(props())
  const button = label => elements(tree,n=>n.type==='button'&&text(n).includes(label))[0]
  const heading = name => elements(tree,n=>n.type==='button'&&n.props['aria-label']===`Select ${name} bank design`)[0]
  const preview = () => elements(tree,n=>n.type===Diagram)[0]
  button('Recalculate').props.onClick()
  tree = bankPage(props())
  assert.equal(calculations,1)
  const originalPreview = preview().props.section
  const originalPreviewCount = previews
  heading('High Bund').props.onClick()
  tree = bankPage(props())
  assert.equal(heading('High Bund').props['aria-pressed'],true)
  const lowCard = elements(tree,n=>n.type==='article'&&text(n).includes('Low Bund'))[0]
  lowCard.props.onClick({target:{closest:()=>null}})
  tree = bankPage(props())
  assert.equal(heading('Low Bund').props['aria-pressed'],true,'The card body also selects its tier')
  heading('High Bund').props.onClick()
  tree = bankPage(props())
  button('Impervious Zoned').props.onClick()
  tree = bankPage(props())
  assert.ok(button('Impervious Zoned').props.className.includes('active-zoned'),'Zoning responds before recalculation')
  assert.equal(bank.design.bankConfig.leftTiers.find(t=>t.id==='tier-high').sectionType,'homogeneous')
  assert.equal(bank.design.heartingTrenchEnabled,false)
  const crest = () => elements(tree,n=>typeof n.type==='function'&&n.props.label==='Crest Width')[0]
  crest().props.onChange(7)
  tree = bankPage(props())
  heading('Medium Bund').props.onClick()
  tree = bankPage(props())
  heading('High Bund').props.onClick()
  tree = bankPage(props())
  assert.equal(crest().props.value,7,'Switching tiers retains edits')
  assert.equal(commits.length,0,'Typing and selecting must not rebuild the project')
  assert.equal(calculations,1,'Draft edits do not recalculate saved totals')
  assert.equal(previews,originalPreviewCount,'Draft edits do not rebuild preview geometry')
  assert.equal(preview().props.section,originalPreview)
  assert.equal(button('Export Bank Quantities').props.disabled,true,'Save before exporting changed designs')
  button('Cancel changes').props.onClick()
  tree = bankPage(props())
  assert.ok(button('Homogeneous Fill').props.className.includes('active-homo'))
  assert.equal(button('Save & Calculate').props.disabled,true)
  assert.equal(commits.length,0)

  const previousWindow = global.window
  global.window = {requestAnimationFrame:callback=>callback(),setTimeout:callback=>callback()}
  try {
    button('Impervious Zoned').props.onClick()
    tree = bankPage(props())
    crest().props.onChange(7)
    tree = bankPage(props())
    button('Save & Calculate').props.onClick()
    await new Promise(resolve=>setImmediate(resolve))
    tree = bankPage(props())
    assert.equal(commits.length,1,'Save applies zoning, cutoff and dimensions in one update')
    for(const side of ['leftTiers','rightTiers']){
      const high = bank.design.bankConfig[side].find(t=>t.id==='tier-high')
      assert.equal(high.sectionType,'zoned');assert.equal(high.crestWidth,7)
    }
    assert.equal(bank.design.heartingTrenchEnabled,true)
    assert.equal(button('Save & Calculate').props.disabled,true)
    assert.notEqual(preview().props.section,originalPreview,'Saved changes rebuild the preview')
    crest().props.onChange(8)
    tree = bankPage(props())
    failSave = true
    button('Save & Calculate').props.onClick()
    await new Promise(resolve=>setImmediate(resolve))
    tree = bankPage(props())
    assert.equal(commits.length,1)
    assert.equal(crest().props.value,8,'A failed save retains the draft')
    assert.ok(text(tree).includes('Could not save bank design'))
    assert.equal(button('Save & Calculate').props.disabled,false,'Failed saves can be retried')
  } finally {
    if(previousWindow===undefined)delete global.window
    else global.window=previousWindow
  }
  console.log('Bank design: tier/card selection, responsive zoning, local drafts, cancel, one save, saved preview and retry passed.')
}

function testToeDitchGradeEditor() {
  const data=canal.defaultCanalData();data.configured=true;data.lengthM=300
  Object.assign(data.design,{bedLevelAtStart:100,bedSlope:0})
  data.sections=[0,100,200,300].map(chainage=>({id:`ditch-${chainage}`,chainage,designPopulated:true,ground:[{offset:-80,rl:98},{offset:80,rl:98}]}))
  const ranges=[{from:100,to:200}]
  let saved={...canal.defaultCanalTierFoundationConfig(),toeDrain:true,toeDrainDepth:.6}
  let summaries=0
  const codeTag={'../../../templates/SsrCode':{__esModule:true,default:()=>null}}
  const editor=page('CanalFiltersDrains.tsx',{...codeTag,'../../../../lib/canal':{...canal,canalTierToeProtectionQuantities:(...args)=>{summaries++;return canal.canalTierToeProtectionQuantities(...args)}}},'CanalToeWorkEditor')
  const changes=[]
  const props=()=>({data,activeSide:'left',ranges,title:'Ditch reach',saved,onSave:patch=>{changes.push(patch);saved={...saved,...patch};return true}})
  let tree=editor(props())
  const button=label=>elements(tree,node=>node.type==='button'&&text(node)===label)[0]
  const field=label=>elements(elements(tree,node=>node.type==='label'&&text(node).includes(label))[0],node=>node.type==='input')[0]
  assert.ok(text(tree).includes('Ch 100.00 m'),'The invert field identifies the first applicable chainage')
  assert.equal(elements(tree,node=>typeof node.type==='function'&&node.props.label==='Depth').length,0,'Ditch depth is not an editable input')
  button('Edit toe protection & drainage').props.onClick();tree=editor(props())
  button('Save toe protection & drainage').props.onClick();tree=editor(props())
  assert.equal(changes.length,0,'Legacy ditch edits require a new longitudinal slope')
  assert.ok(elements(tree,node=>node.props.role==='alert').length)
  field('Invert RL at first section').props.onChange({target:{value:'97'}});tree=editor(props())
  field('Longitudinal slope').props.onChange({target:{value:'0'}});tree=editor(props())
  button('Save toe protection & drainage').props.onClick();tree=editor(props())
  assert.equal(changes.length,0,'Zero slope denominator is invalid')
  field('Longitudinal slope').props.onChange({target:{value:'1000'}});tree=editor(props())
  assert.ok(text(tree).includes('Calculated depth 1.00 m'))
  assert.equal(summaries,1,'Editing the grade does not recalculate the project schedule')
  button('Save toe protection & drainage').props.onClick();tree=editor(props())
  assert.equal(changes.length,1)
  assert.equal(saved.toeDrainStartChainage,100)
  assert.equal(saved.toeDrainInvertRl,97)
  assert.equal(saved.toeDrainSlope,1000)
  assert.equal(saved.toeDrainDepth,undefined,'New grading clears the legacy editable depth')
  button('Edit toe protection & drainage').props.onClick();tree=editor(props())
  field('Invert RL at first section').props.onChange({target:{value:'-2'}});tree=editor(props())
  assert.equal(field('Invert RL at first section').props.value,-2,'Negative invert RL is accepted')
  button('Cancel').props.onClick();tree=editor(props())
  assert.equal(field('Invert RL at first section').props.value,97,'Cancel restores the saved invert')

  data.design.bankToeDrainage={mode:'manual',leftReaches:[]}
  const designer=page('CanalFiltersDrains.tsx',codeTag,'CanalToeDrainageDesigner')
  let parent=designer({data,onCommit:()=>{}})
  elements(parent,node=>node.type==='button'&&text(node)==='Add reach')[0].props.onClick();parent=designer({data,onCommit:()=>{}})
  const rangeField=label=>elements(elements(parent,node=>node.type==='label'&&text(node)===label)[0],node=>node.type==='input')[0]
  rangeField('From Ch (m)').props.onChange({target:{value:'150'}});parent=designer({data,onCommit:()=>{}})
  rangeField('To Ch (m)').props.onChange({target:{value:'250'}});parent=designer({data,onCommit:()=>{}})
  const child=elements(parent,node=>typeof node.type==='function'&&node.type.name==='CanalToeWorkEditor')[0]
  assert.deepEqual(child.props.ranges,[{from:150,to:250}],'A new manual reach uses its entered start chainage')
  console.log('Toe ditch grading: first chainage, invert RL, slope validation, save/cancel, negative levels, local edits and manual reach limits passed.')
}

testCutPreview().then(testBankDesign).then(testToeDitchGradeEditor).catch(error => {console.error(error); process.exitCode = 1})
