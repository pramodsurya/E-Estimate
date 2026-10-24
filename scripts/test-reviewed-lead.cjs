const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const fixture = require('./fixtures/reviewed-lead.json')
const pipeFixture = require('./fixtures/reviewed-pipe-lead.json')
const sourcePath = path.resolve(__dirname, '../src/renderer/src/lib/lead.ts')

function load(supabase, target = sourcePath) {
  const { outputText } = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  const loaded = new Module(target, module)
  loaded.filename = target
  loaded.paths = Module._nodeModulePaths(path.dirname(target))
  loaded.require = request => request === './supabase' ? { supabase } : request === './lead' ? load(supabase) : require(request)
  loaded._compile(outputText, target)
  return loaded.exports
}

const calls = []
const definitions = [...new Map(fixture.tariffs.map(row => [row.recipe_code, {
  recipe_code: row.recipe_code, unit: row.unit, cell: row.cell
}])).values()]
function client() {
  return {
    from(table) {
      calls.push(table)
      assert.ok(['SOR_Recipie', 'SOR_Year', 'SOR_Lead_Rule'].includes(table), 'No retired Lead store is allowed')
      let year, version
      const query = {
        select() { return query },
        eq(key, value) { if (key === 'year') year = value; if (key === 'rules->>schema_version') version = value; return query },
        then(resolve, reject) {
          const data = table === 'SOR_Recipie' ? definitions : table === 'SOR_Year'
            ? fixture.tariffs.filter(row => row.year === year).map(row => ({ ...row, status: row.status }))
            : fixture.rules.filter(row => row.year === year && String(row.rules.schema_version) === version)
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        }
      }
      return query
    },
    async rpc(name, args) {
      calls.push(name)
      assert.equal(name, 'morth_pricing_snapshot')
      return { error: null, data: {
        year: args.p_year, zone: args.p_zone,
        quotes: args.p_requests.map(request => {
          const source = fixture.tariffs.find(row => row.recipe_code === request.recipe_code && row.year === args.p_year)
          const rate = typeof source.rate === 'number' ? source.rate : source.rate?.[args.p_zone]
          return { recipe_code: request.recipe_code, quote: {
            status: typeof rate === 'number' ? 'priced' : 'component_rate_unavailable',
            recipe_code: request.recipe_code, year_row_code: source.year_row_code,
            year: args.p_year, zone: args.p_zone, unit: source.unit, rate
          } }
        })
      } }
    }
  }
}

async function main() {
  const api = load(client())
  const rows = await api.fetchLeadRates('2026-27', 'zone_3')
  assert.equal(rows.length, 75, 'Included initial cells are not invented numeric tariffs')
  assert.equal(rows[0].reviewedRules.length, 11)
  assert.ok(rows.every(row => row.source.yearRowCode && row.source.zone === 'zone_3'))
  const input = { year: '2026-27', zone: 'zone_3', conveyanceClass: 'EARTH', distanceKm: 7.25, handlingMode: 'none' }
  const calc = (patch = {}, source = rows) => api.calculateLeadVariantChargeFromRows(source, { ...input, ...patch })
  assert.equal(calc().leadRate, 172.03, '128.60 + 2.25 × 19.30; no ceiling after 5 km')
  assert.equal(calc({ distanceKm: 1.2 }).leadRate,
    rows.find(row => row.charge_code === 'COM-LDLFT-2' && row.slab_key === 'upto_2km' && row.applies_to.includes('EARTH')).rate)
  assert.equal(calc({ distanceKm: .05 }).leadRate, 0)
  assert.equal(calc({ distanceKm: .15 }).mode, 'head_load')
  assert.equal(calc({ distanceKm: .150001 }).mode, 'mechanical')
  assert.equal(calc({ distanceKm: 0, liftM: 3.25 }).liftRate, 3, 'Only the extra 0.25 m at 12/m')
  assert.equal(calc({ distanceKm: 0, liftM: 6, includedInitialLiftM: 5 }).liftRate, 12)
  assert.equal(calc({ distanceKm: 0, liftM: 2, includedInitialLiftM: 0 }).liftRate, 0,
    'A smaller parent allowance cannot override the published initial 3 m lift')
  assert.equal(calc({ liftM: 5, mechanicalConveyanceReachesFinalPoint: true }).liftRate, 0)
  assert.equal(calc({ liftM: 5, includesAllLifts: true }).liftRate, 0)
  assert.equal(calc({ handlingMode: 'manual_no_idle' }).loadingRate, 34.2)
  assert.equal(calc({ handlingMode: 'manual_no_idle' }).unloadingRate, 17.1)
  assert.equal(calc({ handlingMode: 'manual_with_idle' }).loadingRate, 175)
  assert.equal(calc({ handlingMode: 'manual_with_idle' }).unloadingRate, 63.9)
  assert.equal(calc({ conveyanceClass: 'CEMENT', leadRuleCode: 'SOR-LEAD-2026-27-CEMENT_AT_SITE', handlingMode: 'manual_no_idle' }).grossRate, 0)
  assert.throws(() => calc({ leadRuleCode: 'SOR-LEAD-2026-27-CEMENT_AT_SITE' }), /material scope/)
  assert.throws(() => calc({ conveyanceClass: 'STEEL', handlingMode: 'mechanical' }), /reviewed material-column match/)
  assert.throws(() => calc({ leadRuleCode: 'unknown' }), /bound Lead rule/)
  assert.throws(() => calc({ year: '2025-26' }), /stale/)
  assert.throws(() => calc({ zone: 'zone_1' }), /stale/)
  const incomplete = rows.filter(row => row.source.recipeCode !== 'SOR-P01-T09-M0002-R0006-C0001')
  assert.throws(() => calc({}, incomplete), /not available|unavailable/)
  const saved = JSON.parse(JSON.stringify(rows))
  assert.deepEqual(calc({}, saved), calc(), 'Offline saved chart retains rule and tariff evidence')
  assert.equal(calc().calculation.evidence.tariffs.length, 2)
  assert.equal(calc({ customGrossRate: 12.5 }, []).grossRate, 12.5, 'Explicit manual prices do not require a published chart')
  assert.throws(() => calc({ customGrossRate: -1 }), /nonnegative/)
  const deducted = calc({ includedBasis: 'initial_1km' })
  assert.equal(deducted.leadRate, 123.83, 'Deduct the current-year 48.20 initial-km tariff')
  const zone1 = await api.fetchLeadRates('2026-27', 'zone_1')
  assert.equal(calc({ zone: 'zone_1' }, zone1).leadRate, 175.73)
  const old = await api.fetchLeadRates('2025-26', 'zone_3')
  assert.equal(calc({ year: '2025-26' }, old).leadRate, 160.2)
  for (const conveyanceClass of ['CEMENT', 'STEEL']) {
    const ssr = calc({ year: '2025-26', conveyanceClass, distanceKm: 2 }, old)
    assert.ok(ssr.leadRate > 0, 'SSR keeps its own payable scope even when SOR supply includes delivery')
    assert.equal(ssr.calculation.evidence.policySource, 'SSR')
    assert.equal(ssr.calculation.evidence.ruleCode, undefined)
    const tariffsOnly = old.map(({ reviewedRules, ...row }) => row)
    assert.deepEqual(calc({ year: '2025-26', conveyanceClass, distanceKm: 2 }, tariffsOnly), ssr,
      'SOR material Lead rules cannot alter the independent SSR calculation')
  }
  assert.equal(calc({ includedBasis: 'all_leads' }).grossRate, 0)
  assert.equal(calc({ leadMultiplier: 2, includedBasis: 'initial_1km' }).leadRate, 247.66)
  await assert.rejects(api.fetchLeadRates('2024-25'), /unavailable/)
  const count = calls.length
  await api.fetchLeadRates('2026-27', 'zone_3')
  assert.equal(calls.length, count, 'Ordinary calculations reuse their selected-context snapshot')
  await api.fetchLeadRates('2026-27', 'zone_3', true)
  assert.ok(calls.length > count, 'Explicit Sync refreshes even the same year/zone')

  const pipeClient = {
    from(table) {
      const filters = {}
      const query = { select() { return query }, eq(k, v) { filters[k] = v; return query },
        then(resolve, reject) {
          assert.equal(table, 'SOR_Recipie', 'SSR pipe tariffs must not read SOR supply policy')
          const data = ['0081', '0082'].map((id, i) => ({ recipe_code: `SOR-P04-T06-M${id}`,
            cell: { column: { id: `NP2 — ${i ? 'each additional km or part' : 'up to 5 km'}` } } }))
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
        async single() {
          const data = table === 'SOR_Recipie' ? pipeFixture.recipe[0]
            : table === 'SOR_Year' ? pipeFixture.annual.find(x => x.year === filters.year && x.recipe_code === filters.recipe_code)
              : pipeFixture.rules.find(x => x.year === filters.year && x.rule_code === filters.rule_code)
          return { data, error: null }
        } }
      return query
    },
    async rpc(name, args) {
      if (name === 'sor_resolve_recipe_year') return { data: { recipe_code: args.p_recipe_code, requires_review: false }, error: null }
      assert.equal(name, 'sor_resource_quote')
      const original = pipeFixture.quotes.find(x => x.year === args.p_year && x.code === args.p_recipe_code)?.quote
      const data = original && { ...original, zone: args.p_zone,
        rate: original.rate + (args.p_zone === 'zone_1' ? 10 : 0) }
      return { data, error: null }
    }
  }
  const pipePath = path.resolve(__dirname, '../src/renderer/src/lib/pipeLead.ts')
  const pipes = load(pipeClient, pipePath)
  const pipeInput = { materialItemCode: 'SOR-P04-T01-M0061', sorYear: '2026-27', distanceKm: 6.2, quantity: 10, zone: 'zone_3' }
  const pipe = await pipes.fetchPipeLeadQuoteForMaterial(pipeInput)
  assert.equal(pipe.leadRatePerMetre, 395.7, '366.58 + two started km × 14.56')
  assert.equal(pipe.amount, 3957)
  assert.equal(pipe.diameterMm, 1800)
  assert.equal(pipe.pipeClassGroup, 'NP2')
  assert.equal(pipe.calculation.evidence.tariffs.length, 2)
  assert.deepEqual(pipes.pipeLeadQuoteBreakdown(pipe).calculation, pipe.calculation)
  const oldPipe = await pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, sorYear: '2025-26' })
  assert.equal(oldPipe.leadRatePerMetre, 376.86)
  await assert.rejects(pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, sorYear: '2024-25' }), /binding/)
  await assert.rejects(pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, quantity: -1 }), /nonnegative/)
  const source = { materialItemCode: 'SSR-PIPE-WORK', pipeLeadItemCode: 'saved-conveyance-selection',
    pipeLeadCatalogueCode: 'PH-PIPELEAD-06', pipeEndType: 'PLAIN_ENDED', pipeClassGroup: 'NP2',
    diameterMm: 1800, unit: 'm', autoApply: true, distanceInputRequired: true,
    handlingIncluded: ['loading', 'unloading', 'stacking'] }
  const ssrPipe = await pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, materialItemCode: 'SSR-PIPE-WORK', source })
  assert.equal(ssrPipe.leadRatePerMetre, 395.7)
  assert.equal(ssrPipe.pipeLeadItemCode, source.pipeLeadItemCode)
  const ssrZone1 = await pipes.fetchPipeLeadQuote({ ...pipeInput, pipeLeadItemCode: source.pipeLeadItemCode,
    zone: 'zone_1', source })
  assert.equal(ssrZone1.leadRatePerMetre, 425.7, 'Both selected-zone tariffs must be used')
  assert.throws(() => pipes.pipeLeadQuoteBreakdown(ssrZone1, 'zone_3'), /stale/)
  assert.equal((await pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, source, distanceKm: 0 })).amount, 0)
  await assert.rejects(pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, source, sorYear: '2024-25' }), /unavailable/)
  await assert.rejects(pipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, source: { ...source, pipeClassGroup: 'UNKNOWN' } }), /supported table/)
  await assert.rejects(pipes.fetchPipeLeadQuote({ ...pipeInput, pipeLeadItemCode: 'PH-PIPELEAD-06-NP2-1800-1234ABCD' }), /current pipe conveyance/)

  if (process.argv.includes('--live')) {
    const { createClient } = require('@supabase/supabase-js')
    const config = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/lib/supabase.ts'), 'utf8')
    const url = /https:\/\/[a-z]+\.supabase\.co/.exec(config)[0]
    const key = /sb_publishable_[A-Za-z0-9_-]+/.exec(config)[0]
    const publicClient = createClient(url, key, { auth: { persistSession: false } })
    const live = load(publicClient)
    const liveRows = await live.fetchLeadRates('2026-27', 'zone_3', true)
    assert.equal(live.calculateLeadVariantChargeFromRows(liveRows, input).leadRate, 172.03)
    const liveZone1 = await live.fetchLeadRates('2026-27', 'zone_1', true)
    assert.equal(live.calculateLeadVariantChargeFromRows(liveZone1, { ...input, zone: 'zone_1' }).leadRate, 175.73)
    const liveOld = await live.fetchLeadRates('2025-26', 'zone_3', true)
    assert.equal(live.calculateLeadVariantChargeFromRows(liveOld, { ...input, year: '2025-26' }).leadRate, 160.2)
    const livePipe = await load(publicClient, pipePath).fetchPipeLeadQuoteForMaterial(pipeInput)
    assert.equal(livePipe.leadRatePerMetre, 395.7)
    const livePipes = load(publicClient, pipePath)
    const liveSsrPipe = await livePipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, materialItemCode: 'SSR-PIPE-WORK', source })
    assert.equal(liveSsrPipe.leadRatePerMetre, 395.7)
    const liveSsrPipeZone1 = await livePipes.fetchPipeLeadQuoteForMaterial({ ...pipeInput, source, zone: 'zone_1' })
    assert.equal(liveSsrPipeZone1.selectedZone, 'zone_1')
    assert.ok(liveSsrPipeZone1.calculation.evidence.tariffs.every(tariff => tariff.zone === 'zone_1'))
    for (const conveyanceClass of ['CEMENT', 'STEEL']) {
      assert.ok(live.calculateLeadVariantChargeFromRows(liveOld, { ...input, year: '2025-26', conveyanceClass }).leadRate > 0)
    }
    console.log('Public API live check: selected-year/zone Lead rules and quoted tariffs passed')
  }
  console.log('Reviewed Lead: year/zone quotes, continuous increments, source rules, handling/lift gates, missing rates, evidence, offline round trip and Sync refresh passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
