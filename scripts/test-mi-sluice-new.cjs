const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function compileTs(loadedModule, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  loadedModule._compile(outputText, filename)
}

const sluice = require(path.join(root, 'src/renderer/src/lib/miSluiceNew.ts'))
const figure = require(path.join(root, 'src/renderer/src/lib/miSluiceFigure.ts'))

{
  const data = sluice.defaultMiSluiceNewData()
  data.configured = true
  assert.equal(sluice.openingArea(data), 1.44, '1.2 m square vent area')
  assert.equal(sluice.crownCover(data), 0.3, 'default minimum level gives 0.3 m crown cover')
  assert.equal(sluice.hydraulicCapacity(data), 3.631, 'orifice capacity uses Cd A sqrt(2gh)')

  const rows = sluice.miSluiceQuantityRows(data)
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]))
  assert.equal(byLabel['Excavation for sluice structure'].quantity, 576)
  assert.equal(byLabel['M10 levelling / foundation concrete'].quantity, 13.2)
  assert.equal(byLabel['Barrel concrete less clear vent'].quantity, 77.76)
  assert.equal(sluice.quantityForRole(data, 'rcc'), 235.448)
  assert.equal(sluice.quantityForRole(data, 'reinforcement'), 7393.067)
}

{
  const data = sluice.defaultMiSluiceNewData()
  data.openingShape = 'circular'
  data.vents = 2
  data.opening.diameter = 1
  assert.equal(sluice.openingArea(data), 1.571, 'two circular openings use 2 pi d2 / 4')
}

{
  const data = sluice.defaultMiSluiceNewData()
  data.mechanical = {
    embeddedTonnes: 0.35,
    gateTonnes: 0.42,
    hoistTonnes: 0.5,
    embeddedPaintSqm: 5,
    gatePaintSqm: 7,
    hoistPaintSqm: 9
  }
  data.materials.rcc = {
    code: 'IRR-CCDW-2-9',
    unit: 'CUM',
    description: 'M15 concrete',
    categoryKey: 'ssr_item',
    side: 'SSR',
    dataVariant: {
      kind: 'optional_addition',
      key: 'addon:none',
      label: 'Base DATA only',
      sourceYear: '2026-27'
    }
  }
  const component = {
    id: 'c1',
    kind: 'component',
    name: 'New MI Sluice',
    children: [],
    templateId: 'mi-sluice-new',
    miSluiceNew: data
  }
  const rootNode = { id: 'root', kind: 'title', name: 'Title', children: [component] }
  const next = sluice.syncMiSluiceNewItems(rootNode, 'c1')
  const items = next.children[0].children
  assert.equal(items.length, 10, 'all civil, mechanical and painting roles become items')
  const rcc = items.find((item) => item.templateItemRole === 'rcc')
  assert.equal(rcc.computedQuantity, 235.448)
  assert.equal(rcc.dataVariant.key, 'addon:none', 'selected DATA variant survives item sync')
  assert.ok(items.every((item) => item.templateGenerated && item.templateOwnerId === 'c1'))

  const again = sluice.syncMiSluiceNewItems(next, 'c1')
  assert.equal(again.children[0].children.length, 10, 're-sync does not duplicate generated items')

  const reduced = JSON.parse(JSON.stringify(again))
  reduced.children[0].miSluiceNew.mechanical.gatePaintSqm = 0
  const cleaned = sluice.syncMiSluiceNewItems(reduced, 'c1')
  assert.equal(cleaned.children[0].children.length, 9, 'zero quantity removes the obsolete item')
}

{
  const data = sluice.defaultMiSluiceNewData()
  data.levels.minimumOperating = 100.5
  assert.ok(
    sluice.miSluiceIssues(data).some((issue) => issue.kind === 'error'),
    'impossible operating level is flagged'
  )
}

{
  const data = sluice.defaultMiSluiceNewData()
  const groups = sluice.miSluiceQuantityGroups(data)
  const roles = groups.map((group) => group.role)
  assert.deepEqual(
    roles,
    ['excavation', 'pcc', 'rcc', 'reinforcement'],
    'only roles with a quantity are grouped, in role order'
  )
  const rcc = groups.find((group) => group.role === 'rcc')
  assert.equal(rcc.total, sluice.quantityForRole(data, 'rcc'), 'group total matches the role total')
  assert.equal(rcc.rows.length, 7, 'every structural concrete line stays visible in its group')
  assert.equal(rcc.unit, 'CUM')

  data.mechanical.gateTonnes = 0.42
  assert.ok(
    sluice.miSluiceQuantityGroups(data).some((group) => group.role === 'gate'),
    'entering a BOM weight adds its group'
  )
}

{
  const data = sluice.defaultMiSluiceNewData()
  assert.equal(sluice.openingLabel(data), '1.20 × 1.20 m')
  data.openingShape = 'circular'
  data.vents = 2
  assert.equal(sluice.openingLabel(data), '2 × ⌀ 1.20 m')

  const svg = figure.miSluiceSectionSvg(sluice.defaultMiSluiceNewData())
  assert.ok(svg.startsWith('<svg'), 'the section is returned as SVG markup')
  assert.ok(svg.includes('T.B.L 106.50'), 'levels are labelled from the data')
  assert.ok(svg.includes('Vent 1.20 × 1.20 m'), 'the vent carries its size')
  assert.ok(!/NaN|Infinity/.test(svg), 'no degenerate geometry reaches the drawing')

  const empty = sluice.defaultMiSluiceNewData()
  empty.barrel.length = 0
  empty.intake.length = 0
  empty.stillingBasin.length = 0
  empty.cutoffWalls.count = 0
  assert.ok(
    !/NaN|Infinity/.test(figure.miSluiceSectionSvg(empty)),
    'a half-entered sluice still draws'
  )
}

console.log('new MI sluice template tests passed')
