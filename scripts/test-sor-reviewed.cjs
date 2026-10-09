const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const fixtures = require('./fixtures/sor-reviewed-rpc.json')
const root = path.resolve(__dirname, '..')
const modules = new Map()
const calls = []
let rpcHandler

function load(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename).exports
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  modules.set(filename, loaded)
  loaded.require = request => {
    if (request === './supabase') return { supabase: { rpc: async (name, args) => {
      calls.push({ name, args })
      return rpcHandler(name, args)
    } } }
    if (request === '@univerjs/core') return { BooleanNumber: { FALSE: 0, TRUE: 1 }, CellValueType: { NUMBER: 2, STRING: 1 }, LocaleType: { EN_US: 'enUS' } }
    if (request.startsWith('.')) {
      const candidate = path.resolve(path.dirname(filename), request + '.ts')
      if (fs.existsSync(candidate)) return load(candidate)
    }
    return require(request)
  }
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true
  }, fileName: filename }).outputText, filename)
  return loaded.exports
}

const api = load('src/renderer/src/lib/sorReviewed.ts')
const estimate = load('src/renderer/src/lib/reviewedSorEstimate.ts')
const { projectItemKey } = load('src/renderer/src/lib/projectItems.ts')
const { readFinalValueFromSnapshot } = load('src/renderer/src/lib/finalNumber.ts')
const detailFixture = data => ({ observation: api.normalizeReviewedObservation(data.observation), payload: data.observation,
  sourceContext: data.observation.source_context, recipe: data.recipe, rules: data.rules })
const tray = detailFixture(fixtures.tray)
const cooler = detailFixture(fixtures.cooler)
const water = detailFixture(fixtures.thousand)
const blocked = detailFixture(fixtures.blocked)

function node(item, id = 'item-1') {
  return { id, name: item.description, kind: 'item', children: [], itemSource: item.side,
    categoryKey: item.category, itemCode: item.code, itemDescription: item.description,
    unit: item.unit, sorCatalogue: item.sorCatalogue, itemEditorType: 'spreadsheet' }
}

async function run() {
  assert.deepEqual(api.parseReviewedSorSearch('R&B Sl. No. 230'), { query: '', serial: '230', roadsAndBridges: true })
  assert.deepEqual(api.parseReviewedSorSearch('Sl No 230 valve'), { query: 'valve', serial: '230', roadsAndBridges: false })
  assert.equal(api.normallySelectable({ assessment_status: 'deleted' }), false)
  assert.equal(api.normallySelectable({ assessment_status: 'not_applicable' }), false)
  assert.equal(api.reviewedTariff(water.observation), '₹104 per 1,000 litres')
  assert.equal(api.reviewedTariff(cooler.observation, cooler.sourceContext), '₹39,900 per complete installed cooler')
  assert.equal(api.reviewedTariff({ rate: null, unit: 'm', basis_quantity: 1 }), 'Tariff awaiting clarification')
  assert.match(api.reviewedCostStatus(blocked.observation), /Conflicting rates/)
  assert.equal(api.normalizeReviewedObservation({ ...fixtures.rows[0], rate: null }).rate, null)
  assert.equal(api.normalizeReviewedObservation({ ...fixtures.rows[0], rate: '' }).rate, null)

  const ready = api.readyReviewedRules(tray)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].value_pct, 30)
  for (const rule of [
    { ...ready[0], calculation_ready: false }, { ...ready[0], base: '' },
    { ...ready[0], sor_year: '2024-25' }, { ...ready[0], applies_to_occurrences: [] }
  ]) assert.equal(api.readyReviewedRules({ ...tray, rules: [rule] }).length, 0)
  const ladder = api.normalizeReviewedObservation(fixtures.rows.find(row => row.printed_code.startsWith('ELEC-4.10.2.')))
  assert.equal(api.readyReviewedRules({ ...tray, observation: ladder }).length, 0)

  rpcHandler = async (name, args) => {
    if (name === 'search_sor_reviewed_items') return { data: [
      { ...fixtures.rows[0], catalogue_code: 'RB_WORK' },
      { ...fixtures.rows[0], catalogue_code: 'RB_LABOUR', assessment_status: 'deleted' }, fixtures.rows[0]
    ] }
    if (name === 'list_sor_reviewed_catalogues') return { data: fixtures.catalogues }
    if (name === 'get_sor_reviewed_item') return { data: fixtures.tray }
    if (name === 'calculate_sor_reviewed_selection') return { data: args.p_rule_ids.length ? fixtures.tray_cover : fixtures.tray_base }
    throw new Error(`Unexpected RPC ${name}`)
  }
  const search = await api.searchReviewedSorItems('2026-27', 'R&B Sl. No. 230', null)
  assert.equal(search.rows.length, 1)
  assert.equal(calls.at(-1).args.p_serial_number, '230')
  assert.equal(calls.at(-1).args.p_sor_year, '2026-27')
  assert.equal(calls.at(-1).args.p_query, '')
  await api.listReviewedSorCatalogues('2025-26')
  assert.equal(calls.at(-1).args.p_sor_year, '2025-26')
  const fetched = await api.getReviewedSorItem(tray.observation.occurrence_id)
  assert.equal(fetched.observation.sor_year, '2026-27')
  assert.equal(fetched.observation.rate, 2058)

  const priced = await api.calculateReviewedSorSelection(tray.observation.occurrence_id, 1, [ready[0].rule_id])
  assert.equal(priced.published_rate, 2058)
  assert.equal(priced.adjustments[0].extra_per_basis, 617.4)
  assert.equal(priced.total_amount, 2675.4)
  assert.deepEqual(calls.at(-1).args.p_rule_ids, [ready[0].rule_id])
  await assert.rejects(api.calculateReviewedSorSelection(tray.observation.occurrence_id, 0, []), /positive quantity/)
  await assert.rejects(api.calculateReviewedSorSelection(tray.observation.occurrence_id, Infinity, []), /positive quantity/)
  rpcHandler = async () => ({ data: { ...fixtures.tray_cover, total_amount: null } })
  await assert.rejects(api.calculateReviewedSorSelection(tray.observation.occurrence_id, 1, []), /complete costing result/)
  rpcHandler = async () => ({ error: { message: 'Conflicting source rates' } })
  await assert.rejects(api.calculateReviewedSorSelection(blocked.observation.occurrence_id, 1, []), /Conflicting source rates/)
  assert.throws(() => api.makeReviewedMasterItem(blocked, fixtures.tray_base, []), /costing-ready/)

  const item = api.makeReviewedMasterItem(tray, fixtures.tray_cover, [ready[0].rule_id])
  const saved = item.sorCatalogue.reviewed
  assert.equal(saved.recipeId, fixtures.tray_cover.item_id)
  assert.equal(saved.observationId, fixtures.tray_cover.occurrence_id)
  assert.equal(saved.releaseId, fixtures.tray_cover.release_id)
  assert.deepEqual(saved.selectedRuleIds, [ready[0].rule_id])
  const beforeCalls = calls.length
  assert.equal(await api.resolveReviewedSelection(saved, '2026-27'), saved)
  assert.equal(calls.length, beforeCalls, 'Loading an insertion snapshot must not fetch new rates')
  const original = JSON.stringify(saved)
  rpcHandler = async (name, args) => {
    if (name === 'get_sor_reviewed_history') return { data: fixtures.tray_history }
    if (name === 'get_sor_reviewed_item') return { data: args.p_occurrence_id === fixtures.previous_tray.observation.occurrence_id ? fixtures.previous_tray : fixtures.tray }
    if (name === 'calculate_sor_reviewed_selection') return { data: args.p_occurrence_id === fixtures.previous_tray.observation.occurrence_id ? fixtures.previous_cover : { ...fixtures.tray_cover, release_id: 'refreshed-release' } }
    throw new Error(`Unexpected RPC ${name}`)
  }
  const refreshed = await api.resolveReviewedSelection(saved, '2026-27', true)
  assert.equal(refreshed.releaseId, 'refreshed-release')
  assert.equal(JSON.stringify(saved), original, 'Refresh must leave insertion evidence unchanged')
  const previous = await api.resolveReviewedSelection(saved, '2025-26', true)
  assert.equal(previous.recipeId, saved.recipeId)
  assert.equal(previous.year, '2025-26')
  assert.notEqual(previous.observationId, saved.observationId)
  assert.notEqual(previous.selectedRuleIds[0], saved.selectedRuleIds[0])
  const { mergeSavedRecipe } = load('src/renderer/src/lib/recipeMerge.ts')
  const oldRecipe = estimate.reviewedSorRecipe(node(item), saved)
  const updatedRecipe = estimate.reviewedSorRecipe(node(item), previous)
  const merged = mergeSavedRecipe(updatedRecipe, oldRecipe)
  assert.equal(merged.reviewedSor.observationId, previous.observationId, 'A rate refresh must retain the refreshed annual evidence')
  assert.equal(merged.reviewedSor.calculation.published_rate, previous.calculation.published_rate)
  await assert.rejects(api.resolveReviewedSelection(saved, '2024-25', true), /No unique compatible/)
  rpcHandler = async name => ({ data: name === 'get_sor_reviewed_history' ? fixtures.tray_history : { ...fixtures.previous_tray, rules: [] } })
  await assert.rejects(api.resolveReviewedSelection(saved, '2025-26', true), /saved extra is not verified/)

  const seeded = estimate.seedReviewedMeasurement(node(item))
  assert.equal(readFinalValueFromSnapshot(seeded), 1)
  const recipe = estimate.reviewedSorRecipe(seeded, saved)
  assert.equal(recipe.publishedRate, 2675.4)
  assert.equal(recipe.overheadPercent, 0)
  assert.equal(recipe.reviewedSor.calculation.published_rate, 2058)
  const existingEdited = { ...recipe, publishedRate: 2800 }
  const kept = estimate.reviewedRecipeSnapshots([seeded], { [projectItemKey(seeded)]: existingEdited })
  assert.equal(kept[projectItemKey(seeded)], existingEdited, 'Adding another usage must preserve its existing DATA snapshot and user edits')
  const baseItem = api.makeReviewedMasterItem(tray, fixtures.tray_base, [])
  assert.notEqual(projectItemKey(node(baseItem)), projectItemKey(node(item)), 'Base and covered work must retain distinct DATA identities')
  const waterItem = api.makeReviewedMasterItem(water, fixtures.thousand_calculation, [])
  const waterNode = estimate.seedReviewedMeasurement(node(waterItem, 'water'))
  const waterRecipe = estimate.reviewedSorRecipe(waterNode, waterItem.sorCatalogue.reviewed)
  assert.equal(waterRecipe.publishedRate, 0.104, 'A per-1,000 tariff must retain precision when normalized to litres')
  assert.equal(readFinalValueFromSnapshot(waterNode), 1500)
  assert.equal(waterRecipe.publishedRate * readFinalValueFromSnapshot(waterNode), fixtures.thousand_calculation.total_amount)
  const shared = estimate.seedSharedReviewedMeasurements([node(item, 'tray'), node(waterItem, 'water')])
  assert.notEqual(shared[0].finalCell.row, shared[1].finalCell.row)
  assert.equal(readFinalValueFromSnapshot(shared[0]), 1)
  assert.equal(readFinalValueFromSnapshot(shared[1]), 1500)
  const existingSheet = estimate.seedReviewedMeasurement(node(baseItem, 'existing'))
  const appended = estimate.seedSharedReviewedMeasurements([{ ...node(waterItem, 'appended'), spreadsheet: existingSheet.spreadsheet }])[0]
  assert.equal(readFinalValueFromSnapshot({ ...existingSheet, spreadsheet: appended.spreadsheet }), 1, 'Appending must preserve previous shared measurements')
  assert.equal(readFinalValueFromSnapshot(appended), 1500)
  const reopened = JSON.parse(JSON.stringify({ root: seeded, rateAnalysisOverrides: estimate.reviewedRecipeSnapshots([seeded]) }))
  assert.deepEqual(reopened.root.sorCatalogue.reviewed.calculation, fixtures.tray_cover)
  assert.equal(readFinalValueFromSnapshot(reopened.root), 1)
  assert.equal(reopened.rateAnalysisOverrides[projectItemKey(reopened.root)].publishedRate, 2675.4)

  const outdoor = fixtures.vrf_rows.filter(row => row.printed_code.startsWith('ELEC-6.9.1.'))
  assert.deepEqual(outdoor.map(row => row.variant_label), ['6 HP', '8 HP', '10 HP'])
  assert.equal(new Set(outdoor.map(api.reviewedFamilyKey)).size, 1)
  assert.equal(new Set(fixtures.vrf_rows.filter(row => row.group_label).map(row => row.group_label)).size, 3)
  console.log('Reviewed SOR: annual RPC contract, costing gates, exact variants, rule scope, tariff basis, immutable snapshots, refresh and shared measurements passed')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
