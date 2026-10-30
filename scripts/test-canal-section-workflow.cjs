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
function page(file, overrides = {}) {
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
    useMemo(factory) { return factory() },
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
  return props => { cursor = 0; return mod.exports.default(props) }
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
testCutPreview().catch(error => {console.error(error); process.exitCode = 1})
