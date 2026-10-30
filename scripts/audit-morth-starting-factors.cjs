// Live read-only verification of backend capacity quotes and frontend defaults.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'output/morth-pricing-audit');
const config = fs.readFileSync(path.join(root, 'src/renderer/src/lib/supabase.ts'), 'utf8');
const live = createClient(config.match(/'https:\/\/[^']+\.supabase\.co'/)[0].slice(1, -1),
  config.match(/'sb_publishable_[^']+'/)[0].slice(1, -1), { auth: { persistSession: false } });
const modules = new Map();
const allowed = new Set(['morth_resource_defaults', 'morth_resource_starting_quote', 'morth_picker_detail',
  'individual_cost_choices', 'sor_resource_quote', 'sor_unit_rate_factor']);
const client = { rpc: (name, args) => {
  assert.ok(allowed.has(name), `Unexpected RPC ${name}`);
  return live.rpc(name, args);
} };
function load(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`), m = new Module(file, module);
  modules.set(name, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r === './supabase' ? { supabase: client } : r.startsWith('./') ? load(r.slice(2)) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, file);
  return m.exports;
}
async function main() {
  const api = load('individualCosts');
  const codes = ['MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168', 'MORTH_PM_035', 'MORTH_SRC_5395D38AAA3590B03A00'];
  await api.preloadMorthResourceDefaults(codes);
  const quotes = [];
  for (const code of codes) {
    const large = ['MORTH_PM_035', 'MORTH_SRC_5395D38AAA3590B03A00'].includes(code);
    const raw = { desc: large ? 'Water tanker 16 KL' : 'Water tanker 12 KL', unit: 'hour',
      price_lookup: { table: 'analysis_resource', resource_code: code, rate_component: 'hire_total' } };
    const resolved = await api.resolveIndividualCost(raw, 'hour', 'MORTH', undefined, '2026-27', 'zone_3');
    assert.equal(resolved.rate, large ? 2363.9 : 1846.3);
    assert.equal(resolved.pricing.capacityFactor, large ? 2 : 1.5);
    assert.equal(resolved.pricing.components.crew_charge, 293.5);
    assert.equal(resolved.pricing.includesFuel, true);
    assert.equal(resolved.reviewRequired, true);
    quotes.push({ code, ...resolved });
  }
  global.window = { api: { rateAnalysis: { calculateBase: async recipe => {
    const run = spawnSync(path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe'), ['--base'], {
      input: JSON.stringify(recipe), encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  } } } };
  const recipe = await load('morthEstimate').fetchMorthRecipe({ id: 'factor-audit', itemSource: 'MORTH',
    itemCode: 'MORTH-2019-14.01-B-i-p-medium', categoryKey: 'morth',
    morth: { category: 'medium', printedItem: '14.01', parameters: {} } }, '2026-27', 'zone_3', {},
    { concrete_plant_haul_lead_km: 0, water_supply_lead_km: 0 });
  const tanker = recipe.sections.flatMap(s => s.lines).find(line => line.description.startsWith('Water tanker 12 KL'));
  assert.ok(tanker);
  assert.equal(tanker.rate, 1846.3);
  assert.equal(tanker.quantity, 3.5, 'Operating hours are not capacity-scaled a second time');
  assert.equal(tanker.amount, 6462.05);
  console.log('Live anonymous API → frontend resolver → native slab DATA: tanker Rs1846.30/hour ×3.5 hours = Rs6462.05');
  const { data: resources, error } = await live.from('analysis_resource')
    .select('resource_code,description,unit,starting_rate_basis:source_definition->starting_rate_basis');
  if (error) throw error;
  assert.ok(resources.length < 1000, 'Paginate if the resource inventory reaches the API row limit');
  const configured = new Map(resources.filter(r => r.starting_rate_basis?.enabled).map(r => [r.resource_code, r]));
  const audit = JSON.parse(fs.readFileSync(path.join(dir, 'audit.json'), 'utf8'));
  const counts = {}, review = [];
  const csv = [['kind', 'resource', 'unit', 'factor_decision', 'factor_or_input', 'source_key', 'example_analysis']];
  for (const entry of audit.rows.filter(r => r.route === 'base')) {
    const { raw } = entry, lookup = raw.price_lookup || {}, conversion = lookup.unit_conversion || {};
    const code = api.morthResourceCode(raw), basis = configured.get(code)?.starting_rate_basis;
    let decision, factor;
    if (basis) { decision = 'Capacity-based starting estimate; hire/fuel scaled, crew once'; factor = basis.capacity_factor; }
    else if (conversion.type === 'fixed_supply_length') { decision = 'Stored supply-length conversion'; factor = `1/${conversion.metres_per_supply_item}`; }
    else if (conversion.type === 'bulk_density_kg_per_cum') { decision = 'Density input required; no universal factor'; factor = conversion.parameter; }
    else if (lookup.quantity_multiplier != null) { decision = 'Stored linked-analysis basis conversion'; factor = lookup.quantity_multiplier; }
    else if (lookup.rate_multiplier != null) { decision = 'Stored analysis percentage adjustment'; factor = lookup.rate_multiplier; }
    else if (entry.resolved?.pricing?.conversionFactor != null && entry.resolved.pricing.conversionFactor !== 1) {
      decision = 'Ordinary compatible-unit conversion already applied'; factor = entry.resolved.pricing.conversionFactor;
    } else if (entry.resolved?.source === 'benchmark') { decision = 'Current-year price needed; historical benchmark does not establish a capacity factor'; }
    else if (entry.resolved?.source === 'starting-sor') { decision = 'Specification/cost-scope review; candidate match does not establish a numeric factor'; }
    else if (entry.skipped === 'appendix dependency') { decision = 'Linked analysis; no additional explicit factor declared'; }
    else if (typeof entry.resolved?.rate !== 'number') { decision = 'Missing price or basis; no justified automatic factor'; }
    else { decision = 'No additional unit factor on current binding'; }
    counts[decision] = (counts[decision] || 0) + entry.occurrences;
    csv.push([entry.kind, raw.desc, raw.unit, decision, factor ?? '', raw.resource_key, entry.analyses[0]]);
    if (/Specification|Missing price|Current-year/.test(decision)) review.push({ kind: entry.kind, description: raw.desc,
      unit: raw.unit, decision, sourceKey: raw.resource_key, exampleAnalysis: entry.analyses[0] });
  }
  const escape = v => {
    const text = String(v ?? '');
    return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  fs.writeFileSync(path.join(dir, 'factor-decisions.csv'), '\ufeff' + csv.map(r => r.map(escape).join(',')).join('\n'));
  fs.writeFileSync(path.join(dir, 'starting-factor-verification.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), configuredResources: [...configured.values()], quotes,
    slabTanker: { rate: tanker.rate, quantity: tanker.quantity, amount: tanker.amount },
    otherFactorDecisionOccurrences: counts, remainingReview: review,
    inventorySource: audit.summary.checkedAt,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ configuredResources: configured.size, otherFactorDecisionOccurrences: counts }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
