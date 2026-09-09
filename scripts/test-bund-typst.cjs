const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const root = path.resolve(__dirname, '..')
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  return originalLoad.call(this, request, parent, isMain)
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const bund = require('../src/renderer/src/lib/bund.ts')
const adapter = require('../src/renderer/src/lib/typist-output/bund/bundTypst.ts')
const compiler = NodeCompiler.create({ workspace: root })
const out = path.join(root, 'tmp/pdfs/bund-typst')
fs.mkdirSync(out, { recursive: true })
for (const mode of ['new', 'restoration']) for (const embankmentType of ['homogeneous', 'zoned']) {
  const data = bund.defaultBundData()
  Object.assign(data, { configured: true, mode, embankmentType, lengthM: 60,
    sameToeLevels: true,
    rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
    rockToeFilterMaterial: { code: 'IRR-CAW-5-11', unit: 'CUM' },
    chuteDrainLiningMaterial: { code: 'IRR-CAW-7-15', unit: 'CUM' },
    chuteDrainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
    turfingMaterial: { code: 'IRR-DAW-6-15', unit: 'SQM' },
    design: { ...data.design, topLevel: 100, mwl: 98.5, ftl: 98, freeBoard: 1.5, topWidth: 6, usSlope: 2, dsSlope: 2, stripDepth: 0.3,
      berms: [
        { ...bund.defaultBundBerm('us', 96),
          surfaceMaterial: { code: 'IRR-CAW-8-15', unit: 'SQM' },
          drainLiningMaterial: { code: 'IRR-CAW-7-12', unit: 'CUM' },
          drainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' } },
        { ...bund.defaultBundBerm('ds', 97),
          surfaceMaterial: { code: 'IRR-CAW-8-15', unit: 'SQM' },
          drainLiningMaterial: { code: 'IRR-CAW-7-12', unit: 'CUM' },
          drainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
          chuteDrainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' } }
      ] },
    sections: [0, 30, 60].map((chainage, index) => ({ ...bund.createSection(chainage), id: `section-${index}`,
      separateToeLevels: mode === 'new' && index === 0,
      upstreamGroundLevel: mode === 'new' && index === 0 ? 94 : 95,
      downstreamGroundLevel: 95,
      pre: mode === 'new' ? (index === 0
        ? [{ offset: -40, rl: 94 }, { offset: 40, rl: 95 }]
        : [{ offset: -40, rl: 95 }, { offset: 0, rl: index === 1 ? 94.5 : 95 }, { offset: 40, rl: 95 }])
        : [{ offset: -40, rl: 95 }, { offset: -10, rl: 95 }, { offset: -2, rl: 98 }, { offset: 2, rl: 98 }, { offset: 10, rl: 95 }, { offset: 40, rl: 95 }] }))
  })
  const node = { id: 'bund-1', kind: 'component', name: 'Bund #1 [West]', templateId: 'bund', bund: data, children: [] }
  const project = { id: 'test', meta: { name: 'Test reservoir' }, root: { id: 'root', kind: 'root', children: [node] } }
  const render = adapter.buildBundRenderData(project, node)
  const source = adapter.bundTypstTemplate(data)
  const inputs = adapter.bundCompileInputs(project, node)
  assert.equal(source, fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/bund/bund.typ'), 'utf8'))
  assert.equal(render.schedules.foundation.total, bund.rowsTotal(bund.strippingRows(bund.migrateBundData(data)) ))
  assert.deepEqual(render.payable_items.map(item => item.quantity), bund.requiredItems(bund.migrateBundData(data)).map(item => item.quantity))
  const excavationRoles = new Set(['stripping', 'ustoe-exc', 'dstoe-exc', 'rocktoe-exc', 'chute-exc', 'berm-drain-exc', 'hearting-trench-exc'])
  const excavationCodes = new Set(render.excavation_by_code.map(item => item.code))
  assert(render.payable_items.some(item => excavationRoles.has(item.role)), 'payable_items still include excavation roles for the dedicated excavation section')
  assert(render.payable_items.some(item => !excavationRoles.has(item.role) && !excavationCodes.has(item.code)), 'non-excavation payable items must remain available')
  assert.equal(render.excavation.filter(item => item.role === 'berm-drain-exc').length, 1, 'berm catch-water drain excavation must be classified once')
  assert.match(source, /other-payable-items/, 'print must filter excavation items out of the general quantity list')
  assert.match(source, /payable-by-code/, 'non-excavation payables must reuse the excavation-by-code addition layout')
  assert.match(source, /excavation-payable-roles/, 'print exclusion must use BundExcavationRole roles')
  assert.match(
    source,
    /Total quantities of Excavation[\s\S]*?#heading\(level: 2\)\[Total quantities\]\s[\s\S]*?\[Component details\][\s\S]*?\[Phreatic-line comparison\]/,
    'non-excavation totals must sit immediately after excavation totals, before component details and phreatic'
  )
  assert.equal((source.match(/#heading\(level: 2\)\[Total quantities\]\s/g) || []).length, 1, 'total quantities table must appear once')
  const fillPayable = render.payable_by_code.find(item =>
    embankmentType === 'zoned' ? item.terms.some(term => term.label === 'Casing') : item.code === bund.BUND_DEFAULT_FORMATION_CODE
  )
  assert(fillPayable, 'embankment payable group must exist')
  assert(fillPayable.terms.some(term => term.label === 'Bund' || term.label === 'Casing'), 'fill addition must start with the bund/casing body')
  assert(fillPayable.terms.some(term => term.label.includes('u/s Berm (RL')), 'fill addition must include the u/s berm')
  assert(fillPayable.terms.some(term => term.label.includes('d/s Berm (RL')), 'fill addition must include the d/s berm')
  assert(fillPayable.terms.some(term => term.label === 'Less: Rock toe' && term.quantity < 0), 'fill addition must visibly deduct the rock toe')
  assert.equal(
    Math.round(fillPayable.terms.reduce((sum, term) => sum + term.quantity, 0) * 1000) / 1000,
    Math.round(fillPayable.total * 1000) / 1000
  )
  const billedFill = render.payable_items.find(item =>
    item.code === fillPayable.code && (item.role === 'formation' || item.role === 'rolling' || item.role === 'casing' || item.role === 'casing-rolling')
  )
  assert(billedFill, 'billed fill quantity must remain available')
  assert.equal(Math.round(fillPayable.total * 1000) / 1000, Math.round(billedFill.quantity * 1000) / 1000)
  const turfingPayable = render.payable_by_code.find(item => item.code === 'IRR-DAW-6-15')
  assert(turfingPayable, 'turfing payable group must exist')
  assert(turfingPayable.terms.some(term => term.label === 'Bund'), 'turfing addition must include the bund face')
  assert(!render.payable_by_code.some(item => excavationCodes.has(item.code)), 'excavation codes must not repeat in payable_by_code')
  assert.equal(Boolean(render.schedules.hearting), embankmentType === 'zoned')
  assert.equal(render.is_new, mode === 'new')
  assert.equal(render.is_zoned, embankmentType === 'zoned')
  assert.equal(render.show_freeboard, mode === 'new')
  assert.equal(render.show_hearting, embankmentType === 'zoned')
  assert.equal(render.show_cutoff_trench, mode === 'new' && embankmentType === 'zoned')
  assert.equal(render.show_repair_kind, mode !== 'new' && embankmentType === 'zoned')
  assert.equal(adapter.bundTypstTemplate(data), adapter.bundTypstTemplate(bund.defaultBundData()))
  const chuteExc = render.excavation.find(e => e.role === 'chute-exc')
  assert(chuteExc, 'chute-exc must be in excavation sources')
  assert.equal(chuteExc.classes.length, 1)
  assert.equal(chuteExc.classes[0].soil, 'All Soils')
  assert.equal(chuteExc.classes[0].percent, 100)
  assert.equal(chuteExc.classes[0].code, 'IRR-CAW-1-1')
  if (mode === 'new' && embankmentType === 'homogeneous') {
    assert.deepEqual(render.sections.map(section => section.separate_toe_levels), [true, false, false])
    assert.deepEqual(render.sections.map(section => section.detailed_ground_profile), [true, true, false])
    assert.deepEqual(
      [render.sections[0].upstream_toe_rl, render.sections[0].downstream_toe_rl],
      [94, 95]
    )
  }
  const pdf = compiler.pdf({ mainFileContent: source, inputs })
  assert(pdf?.length > 4000, `${render.layout_kind} must compile`)
  fs.writeFileSync(path.join(out, `${render.layout_kind}.pdf`), pdf)
  fs.writeFileSync(path.join(out, `${render.layout_kind}.json`), JSON.stringify(render, null, 2))
  const svg = compiler.svg({ mainFileContent: source, inputs })
  fs.writeFileSync(path.join(out, `${render.layout_kind}.svg`), svg)
  const key = adapter.bundDocumentKey(node)
  const custom = source + '\nCustom saved design\n'
  project.printStudioDocuments = { [key]: custom }
  assert.equal(adapter.resolvedBundTypstSource(project, node), custom)
  data.sections.push({ ...data.sections[0], id: 'extra', chainage: 90 })
  assert.equal(adapter.buildBundRenderData(project, node).sections.length, 4)
  assert.equal(adapter.resolvedBundTypstSource(project, node), custom)
  assert(compiler.pdf({ mainFileContent: custom, inputs: adapter.bundCompileInputs(project, node) }).length > 4000)
  console.log(`${render.layout_kind}: PDF, geometry, payable quantities and saved-layout refresh passed (${pdf.length} bytes)`)
}
const assemblyHost = fs.readFileSync(path.join(root, 'src/renderer/src/components/bund/BundAssemblyDiagram.tsx'), 'utf8')
assert.match(assemblyHost, /assemblyFigure/, 'dashboard assembly must reuse the print SVG function')
assert.match(adapter.bundTypstTemplate(), /drawings\.assembly/, 'print cover must use the shared assembly drawing')
assert.doesNotMatch(adapter.bundTypstTemplate(), /new-homogeneous|repair-zoned/)
console.log('shared bund.typ and assemblyFigure pipeline pinned')
