const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { performance } = require('node:perf_hooks')
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file)
require('./canal-section-engine-runtime.cjs')
const canal = require('../src/renderer/src/lib/canal.ts')
const drainage = require('../src/renderer/src/lib/canalDrainageDesign.ts')
const adapter = require('../src/renderer/src/lib/canalBankExport.ts')
const engine = require('../src/renderer/src/lib/canalBankSection.ts')
const { canalDrainageWorkRanges } = drainage

function fixture(intervals) {
  let data = canal.defaultCanalData()
  data.configured = true
  data.lengthM = intervals * 50
  Object.assign(data.design, { bedLevelAtStart: 100, bedSlope: 0, heartingTrenchEnabled: false })
  data.sections = Array.from({ length: intervals + 1 }, (_, i) => ({
    id: `s${i}`, chainage: i * 50, designPopulated: true, strataTopRl: i % 2 ? 98 : 100,
    ground: [{ offset: -80, rl: i % 2 ? 98 : 100 }, { offset: 80, rl: i % 2 ? 98 : 100 }]
  }))
  for (const tier of data.design.bankConfig.leftTiers) {
    data = drainage.saveCanalDrainageTier(data, 'left', tier.id, {
      blanket: tier.id === 'tier-low' ? '5-4' : '5-5', blanketThickness: .3,
      horizontalFilter: true, filterThickness: .3
    })
  }
  return canal.migrateCanalData(data)
}

const originalBuild = adapter.buildCanalBankExportInput
let builds = 0
adapter.buildCanalBankExportInput = (...args) => { builds++; return originalBuild(...args) }
try {
  // More reaches than the old cache limit: changing a tier used to remeasure
  // every section once per reach, then repeat that work for the other bank.
  const data = fixture(60)
  const start = performance.now()
  const root = canal.syncCanalItems({ id: 'root', kind: 'root', name: 'R', children: [
    { id: 'canal', kind: 'component', name: 'Canal', canal: data, children: [] }
  ] }, 'canal')
  const saveMs = performance.now() - start
  const saved = root.children[0].canal
  const items = canal.canalTierFoundationItems(saved)
  assert.equal(builds, 1, 'Saving and rendering summaries must share one whole-canal quantity schedule')
  assert.ok(items.some(item => item.code === 'IRR-CAW-5-4' && item.unit === 'sq.m' && item.quantity > 0))
  assert.ok(items.some(item => item.code === 'IRR-CAW-5-5' && item.unit === 'cu.m' && item.quantity > 0))
  for (const item of items) {
    assert.equal(root.children[0].children.find(node => node.itemCode === item.code).computedQuantity, item.quantity,
      'The saved estimate and drainage summary must agree')
  }
  const ranges = canalDrainageWorkRanges(saved, 'left').filter(r => r.tierId === 'tier-low')
  const scope = { from: 0, to: saved.lengthM, ranges }
  const summary = canal.canalTierFoundationQuantities(saved, undefined, scope)
  canal.canalTierToeProtectionQuantities(saved, undefined, scope)
  canal.canalTierToeProtectionQuantities(saved)
  assert.ok(summary.blanketItems.length)
  assert.equal(builds, 1, 'Existing reach boundaries must reuse the saved project schedule')
  assert.equal(engine.measureCanalBankQuantities(saved), engine.measureCanalBankQuantities(structuredClone(saved)),
    'Equivalent saved snapshots reuse measurement after migration or item registry changes')
  engine.measureCanalBankQuantities(canal.migrateCanalData(saved))
  assert.equal(builds, 1, 'Rendering the migrated saved data must reuse the save calculation')

  const base = engine.measureCanalBankQuantities(saved)
  const split = engine.measureCanalBankQuantities(saved, [25, 25])
  assert.equal(builds, 2, 'A genuinely new within-section boundary requires a separate measurement')
  assert.ok(split.rows.length > base.rows.length)
  assert.equal(engine.measureCanalBankQuantities(saved, [25]), split, 'Duplicate boundaries share the same cache entry')
  assert.equal(builds, 2)
  const immutableEdit = drainage.saveCanalDrainageTier(saved, 'left', 'tier-low', { filterThickness: .45 })
  assert.notDeepEqual(engine.measureCanalBankQuantities(immutableEdit).rows, base.rows)
  assert.equal(builds, 3, 'An edited drainage design must be recalculated')
  const disabled = drainage.saveCanalDrainageTier(immutableEdit, 'left', 'tier-low', {
    blanket: 'none', horizontalFilter: false, rockToe: false, toeFilter: false
  })
  const disabledSummary = canal.canalTierFoundationQuantities(disabled, 'tier-low')
  assert.equal(disabledSummary.blanketQuantity, 0)
  assert.equal(disabledSummary.filterVolume, 0, 'Turning drainage off must remove its saved quantities')
  console.log(`Drainage save regression passed: 61 sections, 60 reaches, one quantity schedule, ${saveMs.toFixed(0)} ms save`)
} finally {
  adapter.buildCanalBankExportInput = originalBuild
}
