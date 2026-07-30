const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

// guideWall.ts imports runtime helpers from ./tree, so register a .ts loader
// and let Node's resolver walk the relative imports for us.
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
void Module

const gw = require(path.join(root, 'src/renderer/src/lib/guideWall.ts'))

// A 100 m guide wall in four 25 m sections, mirrored walls on a 10 x 0.5 base.
function makeData() {
  const data = gw.defaultGuideWallData()
  data.configured = true
  data.source = 'manual'
  data.lengthM = 100
  data.intervalM = 25
  data.wallMaterial = { code: 'IRR-CCDW-2-9', unit: 'CUM', side: 'SSR', categoryKey: 'ssr_item' }
  data.baseMaterial = { code: 'IRR-CCDW-2-3', unit: 'CUM', side: 'SSR', categoryKey: 'ssr_item' }
  data.sections = gw.materializeSections(data, [])
  return data
}

// --- Default codes: everything lands in one group per role ------------------
{
  const data = makeData()
  data.baseMaterial = {
    ...data.baseMaterial,
    dataVariant: {
      kind: 'optional_addition',
      key: 'addon:none',
      label: 'Base DATA only',
      sourceYear: '2026-27'
    }
  }
  assert.equal(data.sections.length, 4, 'four 25 m sections')

  const wall = gw.wallMaterialGroups(data)
  const base = gw.baseMaterialGroups(data)
  assert.equal(wall.length, 1, 'one wall group when all sections use the default')
  assert.equal(wall[0].ref.code, 'IRR-CCDW-2-9')
  assert.equal(base.length, 1)
  assert.equal(base[0].ref.code, 'IRR-CCDW-2-3')

  // Every row names its section so the computed table can retarget its code.
  const sectionIds = data.sections.map((s) => s.id)
  for (const row of [...wall[0].rows, ...base[0].rows]) {
    assert.ok(sectionIds.includes(row.sectionId), 'row carries a real sectionId')
  }

  // Mirror doubles: ((0.60 + 1.50)/2 * 3.00) * 25 * 2 = 157.5 per section.
  assert.equal(wall[0].rows.length, 4)
  assert.equal(wall[0].total, 630, 'wall total = 4 x 157.5')
  // Base: 10 * 0.5 * 25 = 125 per section.
  assert.equal(base[0].total, 500, 'base total = 4 x 125')
}

// --- Per-section override splits into its own group ------------------------
{
  const data = makeData()
  data.sections[1] = {
    ...data.sections[1],
    wallMaterial: { code: 'IRR-CCDW-2-30', unit: 'CUM', side: 'SSR', categoryKey: 'ssr_item' }
  }

  const wall = gw.wallMaterialGroups(data)
  assert.equal(wall.length, 2, 'overridden section forms a second wall group')
  const byCode = Object.fromEntries(wall.map((g) => [g.ref.code, g]))
  assert.equal(byCode['IRR-CCDW-2-9'].total, 472.5, 'default keeps the other 3 sections')
  assert.equal(byCode['IRR-CCDW-2-30'].total, 157.5, 'override carries just its section')
  assert.equal(byCode['IRR-CCDW-2-30'].ref.unit, 'CUM', 'override ref keeps its metadata')

  // The base role is untouched by a wall override.
  assert.equal(gw.baseMaterialGroups(data).length, 1)
}

// --- Changing the default must not disturb an overridden section -----------
{
  const data = makeData()
  data.sections[0] = {
    ...data.sections[0],
    wallMaterial: { code: 'CUSTOM-1', unit: 'CUM' }
  }
  const changed = { ...data, wallMaterial: { code: 'NEW-DEFAULT', unit: 'CUM' } }

  const codes = gw.wallMaterialGroups(changed).map((g) => g.ref.code).sort()
  assert.deepEqual(codes, ['CUSTOM-1', 'NEW-DEFAULT'], 'override survives a default change')
  assert.equal(
    gw.effectiveWallRef(changed, changed.sections[0]).code,
    'CUSTOM-1',
    'overridden section still uses its own code'
  )
  assert.equal(
    gw.effectiveWallRef(changed, changed.sections[1]).code,
    'NEW-DEFAULT',
    'non-overridden sections follow the new default'
  )
}

// --- syncGuideWallItems creates one item per (role, code) ------------------
{
  const data = makeData()
  data.baseMaterial = {
    ...data.baseMaterial,
    dataVariant: {
      kind: 'optional_addition',
      key: 'addon:none',
      label: 'Base DATA only',
      sourceYear: '2026-27'
    }
  }
  data.sections[1] = { ...data.sections[1], wallMaterial: { code: 'IRR-CCDW-2-30', unit: 'CUM' } }
  data.excavationMaterial = { code: 'IRR-CCDW-1-2', unit: 'CUM' }
  data.excavationRows = [
    { id: 'e1', fromCh: 0, toCh: 100, length: null, breadth: 10, height: 1.2 }
  ]

  const component = { id: 'c1', kind: 'component', name: 'Guide Wall', children: [], guideWall: data }
  const root = { id: 'root', kind: 'title', name: 'Title', children: [component] }

  const next = gw.syncGuideWallItems(root, 'c1')
  const comp = next.children[0]
  const items = comp.children.filter((c) => c.kind === 'item')

  // 2 wall codes + 1 base code + 1 excavation code.
  assert.equal(items.length, 4, 'one item per distinct (role, code)')
  const byCode = Object.fromEntries(items.map((i) => [i.itemCode, i]))
  assert.equal(byCode['IRR-CCDW-2-9'].computedQuantity, 472.5)
  assert.equal(byCode['IRR-CCDW-2-30'].computedQuantity, 157.5)
  assert.equal(byCode['IRR-CCDW-2-3'].computedQuantity, 500)
  assert.equal(
    byCode['IRR-CCDW-2-3'].dataVariant.key,
    'addon:none',
    'generated guide-wall item preserves the selected DATA variant'
  )
  // Excavation length is derived from the chainage span: 100 * 10 * 1.2.
  assert.equal(byCode['IRR-CCDW-1-2'].computedQuantity, 1200)

  for (const item of items) {
    assert.equal(item.templateGenerated, true, 'generated items are flagged')
    assert.equal(item.templateOwnerId, 'c1')
    assert.equal(item.spreadsheet, undefined, 'no spreadsheet is created')
  }
  assert.equal(comp.guideWall.materialItems.length, 4, 'registry matches the items')

  // Re-syncing is idempotent (no duplicate items).
  const again = gw.syncGuideWallItems(next, 'c1')
  assert.equal(again.children[0].children.filter((c) => c.kind === 'item').length, 4)

  // Dropping the override removes its item again.
  const reverted = JSON.parse(JSON.stringify(again))
  delete reverted.children[0].guideWall.sections[1].wallMaterial
  const cleaned = gw.syncGuideWallItems(reverted, 'c1')
  const cleanedCodes = cleaned.children[0].children.map((c) => c.itemCode).sort()
  assert.deepEqual(cleanedCodes, ['IRR-CCDW-1-2', 'IRR-CCDW-2-3', 'IRR-CCDW-2-9'])
  assert.equal(
    cleaned.children[0].children.find((c) => c.itemCode === 'IRR-CCDW-2-9').computedQuantity,
    630,
    'quantity folds back into the default code'
  )
}

// --- Excavation length derives from the chainage span ----------------------
{
  assert.equal(gw.excavationRowLength({ fromCh: 1, toCh: 100, length: 5 }), 99)
  assert.equal(gw.excavationRowLength({ fromCh: null, toCh: null, length: 5 }), 5)
}

console.log('guide wall per-section code tests passed')
