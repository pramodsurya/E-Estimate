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
    useEffect() {}
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
const paste = elements(ui, n => n.type === 'textarea')[0]
paste.props.onChange({target:{value:'0\t111\t108\t105\t101\t81\n100\t90\t87\t-\t83\t60'}})
ui = strata({data,onCommit})
elements(ui, n => n.type === 'button' && text(n) === 'Save all')[0].props.onClick()
assert.deepEqual(data.sections.map(s => s.strataTopRl), [111,90])
assert.ok(data.sections.every(s => !s.designPopulated && s.ground.length===0), 'Saving strata must not populate geometry')

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
