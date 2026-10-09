const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const fixture = require('./fixtures/sor-navigation-rpc.json')
const root = path.resolve(__dirname, '..')
const cache = new Map()
const calls = []
let handler
let receivedSignal
const supabase = { rpc(name, args) {
  calls.push({ name, args })
  const promise = Promise.resolve().then(() => handler(name, args))
  promise.abortSignal = signal => { receivedSignal = signal; return signal.aborted ? Promise.resolve({ error: { message: 'Request aborted' } }) : promise }
  return promise
} }
function load(relative) {
  const filename = path.resolve(root, relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod)
  mod.require = request => {
    if (request === './supabase') return { supabase }
    if (request === './sorCatalogue') return {}
    if (request.startsWith('.')) {
      const candidate = path.resolve(path.dirname(filename), request + '.ts')
      if (fs.existsSync(candidate)) return load(candidate)
    }
    return require(request)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true
  } }).outputText, filename)
  return mod.exports
}
const api = load('src/renderer/src/lib/sorNavigation.ts')
const reviewed = load('src/renderer/src/lib/sorReviewed.ts')
const zoneFixture = require('./fixtures/sor-project-zone-rpc.json')
const entries = fixture.pages.flatMap(page => page.page.entries)
const electrical = entries.find(entry => entry.node_type === 'table' && entry.catalogue_code === 'ELECTRICAL')
const families = entries.filter(entry => entry.node_type === 'family')
const vrf = families.find(entry => entry.printed_reference.includes('6.9.1'))
const tray = families.find(entry => entry.printed_reference.includes('4.10.1'))
const variants = fixture.pages.find(page => page.node_id === tray.node_id).page.entries
const paths = new Map()
const nodes = new Map(entries.filter(entry => entry.node_type !== 'variant').map(entry => [entry.node_id, entry]))
for (const row of variants) {
  const path = []; let node = tray
  while (node) { path.unshift(node); node = nodes.get(node.parent_node_id) }
  paths.set(row.observation.occurrence_id, { occurrence_id: row.observation.occurrence_id, sor_year: '2026-27', parent_node_id: tray.node_id, path })
}
async function run() {
  handler = (name, args) => {
    if (name === 'browse_sor_reviewed_children') return { data: fixture.pages.find(page => page.node_id === args.p_parent_node_id && page.page.offset === args.p_offset)?.page }
    if (name === 'search_sor_reviewed_items') return { data: variants.map(entry => entry.observation) }
    if (name === 'get_sor_reviewed_locations') return { data: args.p_occurrence_ids.map(id => paths.get(id)) }
    throw new Error(`Unexpected RPC ${name}`)
  }
  const first = await api.browseReviewedSor('2026-27', electrical.node_id)
  const second = await api.browseReviewedSor('2026-27', electrical.node_id, 50)
  assert.equal(first.entries.length, 50)
  assert.equal(first.has_more, true)
  assert(first.entries.at(-1).source_order < second.entries[0].source_order)
  assert.equal(new Set([...first.entries, ...second.entries].map(row => row.node_id)).size, first.entries.length + second.entries.length)
  const cableSection = first.entries.find(entry => entry.display_title.includes('COPPER FLEXIBLE'))
  assert(cableSection)
  const cableFamilies = await api.browseReviewedSor('2026-27', cableSection.node_id)
  assert(cableFamilies.entries.some(entry => entry.node_type === 'family'))
  assert(cableFamilies.entries.every(entry => ['family', 'variant'].includes(entry.node_type)))
  assert(cableFamilies.entries.some(entry => entry.node_type === 'family' && entry.display_title.includes('HFFR')))
  assert(cableFamilies.entries.some(entry => entry.node_type === 'family' && entry.display_title.includes('FRLSH')))
  const capacityPage = await api.browseReviewedSor('2026-27', vrf.node_id)
  assert.deepEqual(capacityPage.entries.slice(0, 3).map(row => row.observation.variant_label), ['6 HP', '8 HP', '10 HP'])
  assert(capacityPage.entries.every(entry => entry.observation.unit !== 'HP'))
  const trayPage = await api.browseReviewedSor('2026-27', tray.node_id, 0, variants[0].observation.occurrence_id)
  assert.equal(trayPage.entries[0].observation.rate, 2058)
  assert.equal(trayPage.entries[0].observation.basis_quantity, 1)
  assert.equal(calls.at(-1).args.p_anchor_occurrence_id, variants[0].observation.occurrence_id)
  const results = await api.searchReviewedSorWithLocations('2026-27', 'ELEC-4.10.1.a', 'ELECTRICAL')
  assert.equal(results.rows[0].location.parent_node_id, tray.node_id)
  assert.deepEqual(results.rows[0].location.path.map(node => node.node_type), ['table', 'section', 'family'])
  assert.equal(calls.at(-1).name, 'get_sor_reviewed_locations')
  assert.equal(calls.at(-1).args.p_occurrence_ids.length, variants.length)
  await api.searchReviewedSorWithLocations('2025-26', 'R&B Sl. No. 230', 'RB_WORK', 100)
  const searchCall = calls.findLast(call => call.name === 'search_sor_reviewed_items')
  assert.equal(searchCall.args.p_sor_year, '2025-26'); assert.equal(searchCall.args.p_serial_number, '230'); assert.equal(searchCall.args.p_offset, 100)
  handler = (name, args) => {
    const zone = zoneFixture.zones.find(z => z.zone === args.p_sor_zone)
    if (name === 'browse_sor_reviewed_children') return { data: zone.page }
    if (name === 'search_sor_reviewed_items') return { data: zone.search }
    if (name === 'list_sor_reviewed_catalogues') return { data: zone.catalogues }
    if (name === 'get_sor_reviewed_locations') return { data: zoneFixture.locations.filter(l => args.p_occurrence_ids.includes(l.occurrence_id)) }
    if (name === 'get_sor_reviewed_project_observation') return { data: args.p_sor_year === '2026-27' ? zone.resolved : null }
    throw new Error(`Unexpected RPC ${name}`)
  }
  for (const [i, zone] of zoneFixture.zones.entries()) {
    const page = await api.browseReviewedSor('2026-27', zoneFixture.locations[0].parent_node_id, 0, null, undefined, zone.zone)
    assert.equal(calls.at(-1).args.p_sor_zone, zone.zone)
    assert.equal(page.total_count, 47)
    const rows = page.entries.filter(e => e.node_type === 'variant').map(e => e.observation)
    assert.equal(rows.length, 45)
    assert(rows.every(row => row.features.specifications.zone === i + 1))
    assert.equal(rows.filter(row => row.variant_label === 'Bar bender').length, 1)
    const search = await api.searchReviewedSorWithLocations('2026-27', 'bar bender', 'RB_LABOUR', 0, undefined, zone.zone)
    assert.equal(search.rows.length, 1)
    assert.equal(search.rows[0].observation.rate, [925, 885, 845][i])
    const catalogues = await reviewed.listReviewedSorCatalogues('2026-27', zone.zone)
    assert.equal(catalogues[0].published_variants, 110)
    const resolved = await reviewed.getReviewedSorProjectObservation(zoneFixture.zones[0].search[0].item_id, '2026-27', zone.zone)
    assert.equal(resolved.occurrence_id, zone.search[0].occurrence_id)
    assert.equal(reviewed.matchesReviewedProjectZone(resolved, zone.zone), true)
    assert.equal(reviewed.matchesReviewedProjectZone(resolved, zone.zone === 'zone_1' ? 'zone_2' : 'zone_1'), false)
    assert.equal(await reviewed.getReviewedSorProjectObservation(resolved.item_id, '2025-26', zone.zone), null)
  }
  assert.equal(reviewed.matchesReviewedProjectZone(variants[0].observation, 'zone_1'), true, 'Universal rates apply to every zone')
  const wrong = zoneFixture.zones[0].resolved
  handler = () => ({ data: wrong })
  assert.equal(await reviewed.getReviewedSorProjectObservation(wrong.item_id, '2026-27', 'zone_3'), null, 'Reject mismatched zone even if server returns one')
  handler = (name, args) => ({ data: fixture.pages.find(page => page.node_id === args.p_parent_node_id && page.page.offset === args.p_offset)?.page })
  const controller = new AbortController()
  await api.browseReviewedSor('2026-27', null, 0, null, controller.signal)
  assert.equal(receivedSignal, controller.signal)
  controller.abort()
  await assert.rejects(api.browseReviewedSor('2026-27', null, 0, null, controller.signal), /aborted/)
  handler = () => ({ error: { message: 'This section does not belong to the active edition' } })
  await assert.rejects(api.browseReviewedSor('2025-26', electrical.node_id), /active edition/)
  handler = () => ({ data: null })
  await assert.rejects(api.browseReviewedSor('2026-27', null), /index is unavailable/)
  console.log('SOR navigation: captured book hierarchy, distinct cable families, source-order pagination, capacities, search locations, tariff basis, project zones, counterpart resolution, anchors and cancellation passed')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
