// Every printed/dashboard figure must produce well-formed SVG from a fully
// loaded bund. A figure that silently emits NaN coordinates draws nothing on
// the page and nobody notices until the estimate is issued.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function compileTs(m, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  m._compile(outputText, filename)
}

const bund = require(path.join(root, 'src/renderer/src/lib/bund.ts'))
const figures = require(path.join(root, 'src/renderer/src/lib/bundFigures.ts'))

const flatPre = [
  { offset: -40, rl: 95 },
  { offset: 0, rl: 95 },
  { offset: 40, rl: 95 }
]
const mkSection = (id, chainage) => ({
  id,
  chainage,
  groundLevel: null,
  pre: flatPre.map((p) => ({ ...p })),
  stripped: null,
  projected: null
})

// A new zoned bund with every optional element switched on at once.
const base = bund.defaultBundData()
const loaded = {
  ...base,
  mode: 'new',
  embankmentType: 'zoned',
  configured: true,
  lengthM: 30,
  design: {
    ...base.design,
    topLevel: 100,
    mwl: 98,
    ftl: 97,
    freeBoard: 2,
    topWidth: 6,
    usSlope: 2,
    dsSlope: 2,
    stripDepth: 0.3,
    berms: [bund.defaultBundBerm('ds', 97.5)]
  },
  heartingDesign: { topLevel: 99, topWidth: 2, usSlope: 0.5, dsSlope: 0.5, centerOffset: 0 },
  heartingMaterial: { code: 'IRR-DAW-5-1', unit: 'CUM' },
  formationMaterial: { code: 'IRR-DAW-5-3', unit: 'CUM' },
  heartingTrench: {
    depth: 1,
    bottomWidth: 2,
    usSlope: 1,
    dsSlope: 1,
    fillMaterial: { code: 'IRR-DAW-5-2', unit: 'CUM' },
    excavationMaterial: { code: 'IRR-DAW-1-1', unit: 'CUM' }
  },
  pitchingMaterial: { code: 'IRR-CAW-8-8', unit: 'SQM' },
  turfingMaterial: { code: 'IRR-CAW-8-15', unit: 'SQM' },
  rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
  rockToeHeight: 2,
  rockToeTopWidth: 1,
  rockToeInnerSlope: 1,
  horizontalFilterMaterial: { code: 'IRR-CAW-5-5', unit: 'CUM' },
  horizontalFilterLength: 6,
  horizontalFilterThickness: 0.6,
  verticalFilterMaterial: { code: 'IRR-DAW-6-8', unit: 'CUM' },
  verticalFilterWidth: 0.45,
  verticalFilterHeight: 2,
  chuteDrainLiningMaterial: { code: 'IRR-CAW-6-1', unit: 'CUM' },
  chuteDrainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
  upstreamToe: { ...base.upstreamToe, excavationMaterial: { code: 'IRR-DAW-1-1' } },
  downstreamToe: {
    ...base.downstreamToe,
    excavationMaterial: { code: 'IRR-CAW-1-1' },
    invertLevel: 94
  },
  sections: [mkSection('a', 0), mkSection('b', 30)]
}

const section = loaded.sections[0]

const wellFormed = (svg, what) => {
  assert.ok(svg && svg.length > 0, `${what}: produced no SVG`)
  assert.ok(svg.startsWith('<svg'), `${what}: does not start with <svg`)
  assert.ok(svg.trimEnd().endsWith('</svg>'), `${what}: is not closed`)
  assert.ok(!/NaN/.test(svg), `${what}: contains NaN coordinates`)
  assert.ok(!/Infinity/.test(svg), `${what}: contains Infinity coordinates`)
  assert.ok(!/undefined/.test(svg), `${what}: contains an undefined value`)
  // Balanced tags for the elements the figures actually emit.
  for (const tag of ['path', 'polygon', 'rect', 'line', 'text']) {
    const open = (svg.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
    const closed =
      (svg.match(new RegExp(`</${tag}>`, 'g')) || []).length +
      (svg.match(new RegExp(`<${tag}[^>]*/>`, 'g')) || []).length
    assert.equal(open, closed, `${what}: unbalanced <${tag}> (${open} open, ${closed} closed)`)
  }
}

wellFormed(figures.assemblyFigure(loaded, section), 'assemblyFigure (everything on)')
wellFormed(figures.filterFigure(loaded, section), 'filterFigure')
wellFormed(figures.chuteFigure(loaded), 'chuteFigure')
wellFormed(figures.bermFigure(loaded, loaded.design.berms[0]), 'bermFigure')
wellFormed(figures.usToeFigure(loaded), 'usToeFigure')
wellFormed(figures.dsDrainFigure(loaded, 1.2), 'dsDrainFigure')
wellFormed(figures.rockToeFigure(loaded), 'rockToeFigure')

// The assembly sketch must show only what is enabled: with the optional work
// off, the elements' fills disappear from the drawing.
const bare = {
  ...loaded,
  pitchingMaterial: null,
  turfingMaterial: null,
  rockToeMaterial: null,
  horizontalFilterMaterial: null,
  verticalFilterMaterial: null,
  upstreamToe: { ...loaded.upstreamToe, excavationMaterial: null },
  downstreamToe: { ...loaded.downstreamToe, excavationMaterial: null },
  heartingTrench: { ...loaded.heartingTrench, fillMaterial: null }
}
const bareSvg = figures.assemblyFigure(bare, section)
wellFormed(bareSvg, 'assemblyFigure (everything off)')
// The hatch patterns are always declared in <defs>; what matters is whether
// anything actually fills with them.
const fills = (svg, id) => svg.includes(`url(#${id})`)
assert.ok(!fills(bareSvg, 'bfRubble'), 'no rock toe drawn when it is off')
assert.ok(!fills(bareSvg, 'bfStone'), 'no pitching drawn when it is off')
assert.ok(!fills(bareSvg, 'bfFilter'), 'no filters drawn when they are off')
assert.ok(fills(bareSvg, 'bfMurum'), 'the hearting zone itself is still drawn')

const fullSvg = figures.assemblyFigure(loaded, section)
assert.ok(fills(fullSvg, 'bfRubble'), 'the enabled rock toe is drawn')
assert.ok(fills(fullSvg, 'bfStone'), 'the enabled pitching is drawn')
assert.ok(fills(fullSvg, 'bfFilter'), 'the enabled filters are drawn')
assert.ok(fills(fullSvg, 'bfMurum'), 'the hearting and its trench are drawn')

// A homogeneous bund still renders an arrangement sketch, minus the core.
const homogeneous = { ...loaded, embankmentType: 'homogeneous' }
wellFormed(figures.assemblyFigure(homogeneous, section), 'assemblyFigure (homogeneous)')
assert.ok(
  !fills(figures.assemblyFigure(homogeneous, section), 'bfMurum'),
  'a homogeneous bund draws no hearting zone'
)

// A repair never carries internal filters, so that figure stays empty.
assert.equal(
  figures.filterFigure({ ...loaded, mode: 'restoration' }, section),
  '',
  'no internal-filter figure on a repair'
)

// --- the printed cross-sections carry the hearting on a zoned bund ---------
// bundDetailPages renders the whole document; the cross-section drawings are
// inside it, so checking the document is checking what actually prints.
const print = require(path.join(root, 'src/renderer/src/lib/bundPrint.ts'))

const projectRoot = {
  id: 'root',
  kind: 'title',
  name: 'Test project',
  children: [{ id: 'c1', kind: 'component', name: 'Bund', children: [], bund: loaded }]
}
const project = { meta: { sorYear: '2025-26' }, root: projectRoot }
const componentNode = projectRoot.children[0]

const htmlOf = (bundData) => {
  const node = { ...componentNode, bund: bundData }
  const proj = {
    ...project,
    root: { ...projectRoot, children: [node] }
  }
  return print
    .bundDetailPages(proj, node, bundData, 1, {})
    .map((page) => page.html ?? page)
    .join('\n')
}

const zonedHtml = htmlOf(loaded)
assert.ok(zonedHtml.includes('<h3>Cross-sections</h3>'), 'the cross-sections block prints')
assert.ok(
  /<pattern id="bph0"/.test(zonedHtml),
  'the printed cross-section defines the hearting hatch'
)
assert.ok(
  zonedHtml.includes('url(#bph0)'),
  'the printed cross-section actually fills the hearting zone'
)
assert.ok(zonedHtml.includes('>Hearting'), 'the printed cross-section carries a hearting key')
assert.ok(zonedHtml.includes('— hearting</td>'), 'the per-section areas split out the hearting')
assert.ok(zonedHtml.includes('— casing</td>'), 'the per-section areas split out the casing')
assert.ok(!/NaN|Infinity/.test(zonedHtml), 'no NaN or Infinity anywhere in the printed pages')

// A repair is zoned too, and must print the same core on its sections.
const zonedRepair = { ...loaded, mode: 'restoration' }
const repairHtml = htmlOf(zonedRepair)
assert.ok(
  repairHtml.includes('url(#bph0)'),
  'a zoned repair prints its hearting on the cross-sections as well'
)
assert.ok(repairHtml.includes('— hearting</td>'), 'a zoned repair splits its section areas too')

// A homogeneous bund has no core, so nothing extra is drawn or tabulated.
const homogeneousHtml = htmlOf({ ...loaded, embankmentType: 'homogeneous' })
assert.ok(
  !homogeneousHtml.includes('url(#bph0)'),
  'a homogeneous bund prints no hearting hatch'
)
assert.ok(
  !homogeneousHtml.includes('— hearting</td>'),
  'a homogeneous bund prints no hearting area row'
)

// --- the arrangement drawing: impervious bunds only, always, up front ------
assert.equal(
  loaded.includePhreaticInPrint,
  false,
  'the fixture leaves the phreatic switch off, so the next check is meaningful'
)
assert.ok(
  zonedHtml.includes('<h4>Bund arrangement</h4>'),
  'a new impervious bund prints its arrangement without the phreatic switch'
)
assert.ok(
  repairHtml.includes('<h4>Bund arrangement</h4>'),
  'an impervious repair prints its arrangement too'
)
assert.ok(
  zonedHtml.indexOf('<h4>Bund arrangement</h4>') <
    zonedHtml.indexOf('Jungle clearance'),
  'the arrangement is drawn ahead of jungle clearance'
)
assert.ok(
  !homogeneousHtml.includes('<h4>Bund arrangement</h4>'),
  'a homogeneous bund prints no arrangement drawing'
)
assert.ok(
  !zonedHtml.includes('Hearting zone with its cut-off trench'),
  'the standalone hearting zone figure is gone'
)

console.log('OK — all bund figure checks passed')
