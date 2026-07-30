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

const bund = require(path.join(root, 'src/renderer/src/lib/bund.ts'))

// ---------------------------------------------------------------------------
// Material-ref resolution. Codes are seeded as bare `{ code }` refs; until the
// master row is attached the generated item has no categoryKey, which makes
// fetchRateAnalysis treat an ordinary SSR item as custom and leaves the
// abstract with no description.
// ---------------------------------------------------------------------------

const data = bund.defaultBundData()

const pending = bund.unresolvedBundMaterialCodes(data)
assert.ok(pending.length > 0, 'a fresh bund starts with unresolved codes')
assert.ok(
  pending.includes(bund.BUND_DEFAULT_STRIPPING_CODE),
  'stripping is seeded as a bare code'
)
assert.ok(!bund.isResolvedMaterialRef(data.strippingMaterial), 'a bare ref is not resolved')

const meta = (code) => ({
  description: `desc ${code}`,
  unit: 'CUM',
  category: 'ssr_item',
  side: 'SSR'
})

const filled = bund.applyBundMasterMetadata(
  data,
  new Map(pending.map((code) => [code, meta(code)]))
)
assert.equal(
  bund.unresolvedBundMaterialCodes(filled).length,
  0,
  'every seeded code resolves once its master is supplied'
)
assert.equal(filled.strippingMaterial.categoryKey, 'ssr_item', 'categoryKey is filled')
assert.equal(
  filled.strippingMaterial.description,
  `desc ${bund.BUND_DEFAULT_STRIPPING_CODE}`,
  'description is filled'
)
assert.equal(filled.strippingMaterial.side, 'SSR', 'itemSource is filled')

// A partial lookup improves what it can and leaves the rest pending, rather
// than latching everything as done.
const partial = bund.applyBundMasterMetadata(
  data,
  new Map([[bund.BUND_DEFAULT_STRIPPING_CODE, meta(bund.BUND_DEFAULT_STRIPPING_CODE)]])
)
assert.ok(bund.isResolvedMaterialRef(partial.strippingMaterial))
assert.ok(
  bund.unresolvedBundMaterialCodes(partial).length > 0,
  'codes with no master stay pending'
)

// An already-resolved ref is never rewritten by a later lookup.
const rewritten = bund.applyBundMasterMetadata(
  filled,
  new Map([[bund.BUND_DEFAULT_STRIPPING_CODE, { description: 'CLOBBERED', unit: 'X', category: 'y' }]])
)
assert.equal(
  rewritten.strippingMaterial.description,
  `desc ${bund.BUND_DEFAULT_STRIPPING_CODE}`,
  'a resolved ref is left alone'
)

// Nested refs are walked, not just the top-level fields.
const nested = {
  ...data,
  upstreamToe: { ...data.upstreamToe, excavationMaterial: { code: 'IRR-TEST-9-9' } },
  design: {
    ...data.design,
    berms: [
      {
        id: 'b1',
        side: 'ds',
        level: 94.5,
        width: 3,
        crossFall: 40,
        slopeBelow: null,
        surfaceMaterial: { code: 'IRR-TEST-8-8' },
        drainLiningMaterial: null,
        drainExcavationMaterial: null,
        surfaceThickness: 0.1,
        drainWidth: 0.6,
        drainDepth: 0.3,
        drainLiningThickness: 0.1
      }
    ]
  }
}
const nestedPending = bund.unresolvedBundMaterialCodes(nested)
assert.ok(nestedPending.includes('IRR-TEST-9-9'), 'a toe excavation ref is walked')
assert.ok(nestedPending.includes('IRR-TEST-8-8'), 'a berm surfacing ref is walked')

const nestedFilled = bund.applyBundMasterMetadata(
  nested,
  new Map([['IRR-TEST-9-9', meta('IRR-TEST-9-9')], ['IRR-TEST-8-8', meta('IRR-TEST-8-8')]])
)
assert.equal(nestedFilled.upstreamToe.excavationMaterial.categoryKey, 'ssr_item')
assert.equal(nestedFilled.design.berms[0].surfaceMaterial.categoryKey, 'ssr_item')

// Excavation soil bands carry refs too.
assert.ok(
  bund.unresolvedBundMaterialCodes(data).includes(bund.BUND_EXC_ALL_SOILS_CODE) ||
    Object.keys(data.excavationBands ?? {}).length === 0,
  'excavation band refs are reachable'
)

console.log('bund material-ref resolution OK')

// ---------------------------------------------------------------------------
// One SSR code billed at one rate is one line. Several excavation roles share
// IRR-CAW-1-1; the abstract must not list it four times.
// ---------------------------------------------------------------------------
{
  const resolved = (code) => ({
    code,
    description: `desc ${code}`,
    unit: 'CUM',
    categoryKey: 'ssr_item',
    side: 'SSR'
  })
  const base = bund.defaultBundData()
  const withShared = {
    ...base,
    configured: true,
    mode: 'restoration',
    sections: [
      { id: 's1', chainage: 0, groundLevel: 95, pre: [], stripped: null, projected: null },
      { id: 's2', chainage: 30, groundLevel: 95, pre: [], stripped: null, projected: null }
    ],
    upstreamToe: { ...base.upstreamToe, excavationMaterial: resolved('IRR-CAW-1-1') },
    downstreamToe: { ...base.downstreamToe, excavationMaterial: resolved('IRR-CAW-1-1') },
    chuteDrainExcavationMaterial: resolved('IRR-CAW-1-1')
  }
  const items = bund.requiredItems(withShared)
  const byCode = {}
  for (const item of items) byCode[item.ref.code] = (byCode[item.ref.code] ?? 0) + 1
  for (const [code, count] of Object.entries(byCode)) {
    assert.equal(count, 1, `code ${code} should appear once, saw ${count}`)
  }
  console.log('bund required-item dedupe OK')
}

// ---------------------------------------------------------------------------
// Orphaned generated items. A node reachable only through a registry entry is
// lost the moment that entry goes, and a registry-based cleanup can never see
// it again — so they pile up and reach the abstract as repeated codes with no
// description. The sweep is by ownership, which also repairs existing files.
// ---------------------------------------------------------------------------
{
  const tree = require(path.join(root, 'src/renderer/src/lib/tree.ts'))

  const resolved = (code) => ({
    code,
    description: `desc ${code}`,
    unit: 'CUM',
    categoryKey: 'ssr_item',
    side: 'SSR'
  })
  const base = bund.defaultBundData()
  const data = {
    ...base,
    configured: true,
    mode: 'restoration',
    clearanceMaterial: resolved(bund.BUND_DEFAULT_CLEARANCE_CODE),
    strippingMaterial: resolved(bund.BUND_DEFAULT_STRIPPING_CODE),
    formationMaterial: resolved(bund.BUND_DEFAULT_FORMATION_CODE),
    sections: [
      { id: 's1', chainage: 0, groundLevel: 95, pre: [], stripped: null, projected: null },
      { id: 's2', chainage: 30, groundLevel: 95, pre: [], stripped: null, projected: null }
    ]
  }

  const component = tree.createNode('component', 'Bund', { templateId: 'bund', bund: data })
  let projectRoot = tree.createNode('section', 'Root', {})
  projectRoot = { ...projectRoot, children: [component] }

  // Stale generated children the registry no longer knows about — exactly what
  // the real project carried.
  const orphans = ['IRR-CAW-1-2', 'IRR-CAW-1-2', 'IRR-CAW-7-6'].map((code) =>
    tree.createNode('item', code, {
      itemCode: code,
      templateGenerated: true,
      templateOwnerId: component.id
    })
  )
  const manual = tree.createNode('item', 'Hand-added item', { itemCode: 'IRR-MANUAL-1-1' })
  projectRoot = tree.patchNode(projectRoot, component.id, {
    children: [...orphans, manual]
  })

  const synced = bund.syncBundItems(projectRoot, component.id)
  const after = tree.findNode(synced, component.id)
  const items = after.children.filter((c) => c.kind === 'item')

  assert.ok(
    !items.some((i) => i.templateGenerated && i.itemCode === 'IRR-CAW-7-6'),
    'orphaned generated items are swept'
  )
  assert.ok(
    items.some((i) => i.itemCode === 'IRR-MANUAL-1-1'),
    'a manually added item is never swept'
  )
  const counts = {}
  for (const i of items) counts[i.itemCode] = (counts[i.itemCode] ?? 0) + 1
  for (const [code, n] of Object.entries(counts)) {
    assert.equal(n, 1, `code ${code} appears once after sync, saw ${n}`)
  }
  console.log('bund orphan sweep OK')
}
