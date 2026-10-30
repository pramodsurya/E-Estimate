const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const calls = [];
const client = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (name === 'morth_picker_detail') return { data: { code: 'MORTH-TEST', candidates: {}, context: {}, recipe: {
    description: 'Explicit equipment component integration', unit: 'cum', rate_divisor: 1,
    materials: [], labour: [], calculation: { overhead_percent: 0, contractor_profit_percent: 0 },
    machinery: [{ desc: 'Original equipment', resource_key: 'morth:test_equipment', unit: 'hour', quantity: 2,
      resource_identity: { source_table: 'analysis_resource', resource_code: 'MORTH_PM_036' },
      costing_options: { selection_parameter: 'equipment', options: { source: {}, sor: {
        quantity_expression: { type: 'parameter', parameter: 'operating_hours', positive: true },
        components: ['hire_charge', 'fuel_charge', 'crew_charge'].map(component => ({
          desc: component, section: component === 'crew_charge' ? 'labour' : 'machinery',
          price_lookup: { table: 'SOR_Year', recipe_code: 'TANKER', rate_component: component },
        })),
      } } },
    }],
  } } };
  if (name === 'morth_resource_defaults') return { data: args.p_resource_codes.map(code => ({
    resource_code: code, unit: 'hour', candidates: [],
    ...(code.startsWith('CAP_') ? { starting_rate_basis: {
      enabled: true, reference_recipe_code: 'TANKER', capacity_factor: code === 'CAP_16' ? 2 : 1.5,
      component_factors: { hire_charge: code === 'CAP_16' ? 2 : 1.5, fuel_charge: code === 'CAP_16' ? 2 : 1.5, crew_charge: 1 },
    } } : {}),
    pricing_records: [{ sor_year: '2019-20', hire_total: 1270, fuel_charge: null }],
  })) };
  if (name === 'morth_resource_starting_quote') {
    if (args.p_year === '2028-29') return { data: { status: 'starting_reference_unavailable', rate: null } };
    const large = args.p_resource_code === 'CAP_16';
    const components = large ? { hire_charge: 991.2, fuel_charge: 1079.2, crew_charge: 293.5 }
      : { hire_charge: 743.4, fuel_charge: 809.4, crew_charge: 293.5 };
    const total = ['rate', 'total', 'hire_total'].includes(args.p_component);
    return { data: { status: 'priced', year: args.p_year, zone: args.p_zone, description: large ? 'Water tanker 16 KL' : 'Water tanker 12 KL',
      rate: total ? large ? 2363.9 : 1846.3 : components[args.p_component], capacity_factor: large ? 2 : 1.5,
      component_factors: { hire_charge: large ? 2 : 1.5, fuel_charge: large ? 2 : 1.5, crew_charge: 1 },
      rate_detailed: components, includes_fuel: total, includes_crew: total, unit_conversion_factor: 1,
    } };
  }
  if (name === 'individual_cost_choices') return { data: [{ code: 'TANKER', component: 'rate', description: 'Water tanker 8000 ltr' }] };
  if (name === 'sor_unit_rate_factor') {
    const factors = { 'metre:metre': 1, 'kg:kg': 1, 'kg:tonne': 1000 };
    return { data: factors[`${args.p_source_unit}:${args.p_requested_unit}`] ?? null };
  }
  if (name === 'sor_resource_quote') {
    if (args.p_recipe_code === 'TANKER') return { data: {
      status: 'priced', year: args.p_year, zone: args.p_zone,
      rate: { hire_charge: 495.6, fuel_charge: 539.6, crew_charge: 293.5, rate: 1328.7 }[args.p_component],
    } };
    const rates = { PIPE: [594, 'Each'], PIPE6: [690, 'Each'], SAND: [1023, 'cum'], FLY: [91, 'Cum'], STEEL: [60, 'tonne'], OTHER: [77, 'metre'] };
    const [rate, source] = rates[args.p_recipe_code];
    return { data: { status: 'priced', year: args.p_year, zone: args.p_zone,
      rate, source_unit: source, conversion_factor: args.p_recipe_code === 'STEEL' ? 0.001 : 1 } };
  }
  throw Error(name);
} };
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`), m = new Module(file, module);
  cache.set(name, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r === './supabase' ? { supabase: client } : r.startsWith('./') ? load(r.slice(2)) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
async function main() {
  const api = load('individualCosts');
  const quote = (raw, unit, code, parameters = {}, adoption) => api.resolveIndividualCost(raw, unit, 'MORTH', adoption, '2026-27', 'zone_3', [{ code, component: 'rate', description: code }], parameters);
  const pipe = { price_lookup: { table: 'SOR_Year', cases: { four: { recipe_code: 'PIPE' } }, unit_conversion: { type: 'fixed_supply_length', metres_per_supply_item: 3 } } };
  assert.equal((await quote(pipe, 'metre', 'PIPE')).rate, 198, 'A 3m supply item at Rs594 costs Rs198 per metre');
  assert.equal(calls.at(-1).args.p_unit, 'Each');
  assert.match((await quote(pipe, 'metre', 'PIPE')).label, /×0\.333/);
  const pressurePipe = { price_lookup: { ...pipe.price_lookup, selection_parameter: 'pressure', cases: {
    four: { recipe_code: 'PIPE' }, six: { recipe_code: 'PIPE6' },
  } } };
  assert.equal((await quote(pressurePipe, 'metre', 'PIPE', { pressure: 'six' })).rate, 230,
    'A selected source case must override the first/default tariff');
  assert.equal((await quote(pipe, 'metre', 'OTHER', {}, { mode: 'sor', code: 'OTHER' })).rate, 77, 'An unrelated adopted tariff must not inherit the pipe conversion');
  assert.equal((await quote(pipe, 'metre', 'PIPE', {}, { mode: 'manual', rate: 198 })).rate, 198, 'Manual rate is already per requested unit');
  const sand = { price_lookup: { recipe_code: 'SAND', unit_conversion: { type: 'bulk_density_kg_per_cum', parameter: 'density' } } };
  assert.equal((await quote(sand, 'kg', 'SAND')).rate, null, 'No assumed density');
  assert.equal((await quote(sand, 'kg', 'SAND', { density: 0 })).rate, null);
  assert.equal((await quote(sand, 'kg', 'SAND', { density: 1600 })).rate, 1023 / 1600);
  assert.equal((await api.resolveIndividualCost({ ...sand, _pricing_parameters: { density: 1600 } }, 'kg', 'MORTH', undefined,
    '2026-27', 'zone_3', [{ code: 'SAND', component: 'rate' }])).rate, 1023 / 1600,
    'Individual Costs previews retain the analysis density');
  const fly = { price_lookup: { recipe_code: 'FLY', unit_conversion: { type: 'bulk_density_kg_per_cum', parameter: 'density' } } };
  assert.equal((await quote(fly, 'tonne', 'FLY', { density: 800 })).rate, 113.75, 'Per-tonne rate uses 1000/density');
  const steel = await quote({ price_lookup: { recipe_code: 'STEEL' } }, 'kg', 'STEEL');
  assert.equal(steel.rate, 60, 'The RPC has already converted tonne to kg; do not multiply twice');
  assert.match(steel.label, /×0\.001 \(tonne → kg\)/);
  const tanker = { price_lookup: { table: 'analysis_resource', resource_code: 'MORTH_PM_036', rate_component: 'hire_total' } };
  const benchmark = await quote(tanker, 'hour', 'OTHER');
  assert.equal(benchmark.rate, 1270, 'Read the actual source equipment benchmark before approximate SOR candidates');
  assert.equal(benchmark.source, 'benchmark');
  assert.match(benchmark.label, /no SOR item adopted/, 'A historical resource benchmark must not imply its SOR candidate was adopted');
  assert.match(benchmark.label, /2019-20.*review required/);
  const configuredTanker = { desc: 'Water tanker 12 KL', price_lookup: {
    table: 'analysis_resource', resource_code: 'CAP_12', rate_component: 'hire_total',
  } };
  const scaled = await quote(configuredTanker, 'hour', 'OTHER');
  assert.equal(scaled.rate, 1846.3, 'Configured current-year starting basis takes precedence over the 2019 benchmark');
  assert.equal(scaled.pricing.capacityFactor, 1.5);
  assert.equal(scaled.pricing.includesFuel, true);
  assert.equal(scaled.pricing.includesCrew, true);
  assert.equal(scaled.pricing.components.crew_charge, 293.5, 'Crew is retained once, not capacity-scaled');
  assert.equal(scaled.pricing.conversionFactor, 1, 'Capacity and unit-conversion factors are distinct');
  assert.match(scaled.label, /hire\/fuel ×1.5; crew ×1/);
  const scaledFuel = await quote({ ...configuredTanker, price_lookup: { ...configuredTanker.price_lookup, rate_component: 'fuel_charge' } }, 'hour', 'OTHER');
  assert.equal(scaledFuel.rate, 809.4);
  assert.equal((await quote({ price_lookup: { ...configuredTanker.price_lookup, resource_code: 'CAP_16' } }, 'hour', 'OTHER')).rate, 2363.9);
  assert.equal((await quote(configuredTanker, 'hour', 'OTHER', {}, { mode: 'manual', rate: 1700 })).rate, 1700);
  assert.equal((await quote(configuredTanker, 'hour', 'OTHER', {}, { mode: 'sor', code: 'TANKER', component: 'rate' })).rate, 1328.7,
    'An explicit SOR adoption remains the rate selected by the user');
  const unavailableYear = await api.resolveIndividualCost(configuredTanker, 'hour', 'MORTH', undefined, '2028-29', 'zone_3', []);
  assert.equal(unavailableYear.rate, null, 'A missing configured-year quote must not fall back to 2019 silently');
  const fuel = { price_lookup: { ...tanker.price_lookup, rate_component: 'fuel_charge' } };
  const unavailableFuel = await api.resolveIndividualCost(fuel, 'hour', 'MORTH', undefined, '2026-27', 'zone_3', []);
  assert.equal(unavailableFuel.rate, null, 'An inclusive benchmark is never reused as a separate fuel rate');
  const alternative = {
    price_lookup: { table: 'SOR_Year', recipe_code: 'TANKER', rate_component: 'fuel_charge' },
    resource_identity: { source_table: 'analysis_resource', resource_code: 'MORTH_PM_036' },
  };
  const wrongParentChoice = [{ code: 'OTHER', component: 'rate', description: 'Inherited source candidate' }];
  assert.equal((await api.resolveIndividualCost(alternative, 'hour', 'MORTH', undefined, '2026-27', 'zone_3', wrongParentChoice)).rate, 539.6,
    'An explicit fuel binding must use that machine and fuel component, never an inherited total/candidate');
  assert.equal(api.morthResourceCode(alternative), undefined);
  assert.equal((await api.costChoices(alternative))[0].component, 'fuel_charge', 'The picker also retains the fuel component');
  const quoted = { ...alternative, price_lookup: { table: 'project_quote', parameter: 'tanker', rate_component: 'fuel_charge' } };
  assert.equal((await api.resolveIndividualCost(quoted, 'hour', 'MORTH', undefined, '2026-27', 'zone_3', wrongParentChoice)).rate, null,
    'A quotation route cannot silently select an approximate SOR rate');
  assert.equal((await api.resolveIndividualCost(quoted, 'hour', 'MORTH', { mode: 'manual', rate: 500 }, '2026-27', 'zone_3')).rate, 500);
  global.window = { api: { rateAnalysis: { calculateBase: async recipe => {
    const binary = path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe');
    const result = spawnSync(binary, ['--base'], { input: JSON.stringify(recipe), encoding: 'utf8' });
    if (result.status !== 0) throw Error(result.stderr);
    return JSON.parse(result.stdout);
  } } } };
  const compiler = load('morthEstimate');
  const recipe = await compiler.fetchMorthRecipe({ id: 'test', itemCode: 'MORTH-TEST', itemSource: 'MORTH',
    morth: { category: 'medium', parameters: {}, printedItem: 'test' } }, '2026-27', 'zone_3', {},
    { equipment: 'sor', operating_hours: 2 });
  const lines = recipe.sections.flatMap(section => section.lines);
  assert.deepEqual(lines.map(line => [line.description, line.quantity, line.rate]), [
    ['hire_charge', 2, 495.6], ['fuel_charge', 2, 539.6], ['crew_charge', 2, 293.5],
  ], 'The actual recipe expansion uses one machine, exact components and the same operating hours');
  assert.equal(recipe.morth.startingSummary.baseCost, 2657.4, 'Components sum once, with no additional inclusive total');
  console.log('MoRTH price basis: fixed supply length, explicit density, no double conversion, manual/adoption boundaries and historical inclusive machinery passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
