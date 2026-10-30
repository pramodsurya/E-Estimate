// Read-only catalogue audit using the application's actual starting-rate resolver.
// Run: node scripts/audit-morth-pricing.cjs [--refresh]
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'output', 'morth-pricing-audit');
fs.mkdirSync(directory, { recursive: true });
const config = fs.readFileSync(path.join(root, 'src/renderer/src/lib/supabase.ts'), 'utf8');
const url = process.env.VITE_SUPABASE_URL || config.match(/'https:\/\/[^']+\.supabase\.co'/)[0].slice(1, -1);
const key = process.env.VITE_SUPABASE_KEY || config.match(/'sb_publishable_[^']+'/)[0].slice(1, -1);
const live = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const rpcCache = new Map();
const allowed = new Set(['morth_resource_defaults', 'morth_resource_starting_quote', 'individual_cost_choices', 'sor_resource_quote', 'sor_unit_rate_factor']);
const client = { rpc: async (name, args) => {
  if (!allowed.has(name)) throw Error(`Unexpected RPC: ${name}`);
  const id = JSON.stringify([name, args]);
  if (!rpcCache.has(id)) rpcCache.set(id, live.rpc(name, args));
  return rpcCache.get(id);
} };
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`);
  const m = new Module(file, module);
  modules.set(name, m);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r === './supabase' ? { supabase: client } : r.startsWith('./') ? load(r.slice(2)) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
async function catalogue() {
  const file = path.join(directory, 'source.json');
  if (!process.argv.includes('--refresh') && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const partial = path.join(directory, 'source.partial.json');
  const result = fs.existsSync(partial) ? JSON.parse(fs.readFileSync(partial, 'utf8')) : [];
  for (;;) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      let request = live.from('morth').select('code,materials,machinery,labour,component_links,pricing_additions:recipe->pricing_additions').order('code').limit(60);
      if (result.length) request = request.gt('code', result.at(-1).code);
      response = await request;
      if (!response.error) break;
      console.log(`Retrying catalogue page: ${response.error.message}`);
    }
    const { data, error } = response;
    if (error) throw error;
    result.push(...data);
    fs.writeFileSync(partial, JSON.stringify(result));
    if (result.length % 300 === 0 || data.length < 60) console.log(`Loaded ${result.length} analyses`);
    if (data.length < 60) break;
  }
  fs.writeFileSync(file, JSON.stringify(result));
  return result;
}
async function main() {
  if (process.argv.includes('--report-only')) {
    writeReport(JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(directory, 'audit.json'), 'utf8')));
    return;
  }
  const costs = load('individualCosts');
  const source = await catalogue();
  const groups = new Map();
  const totals = {};
  function add(kind, row, code, route, candidates) {
    totals[route] = (totals[route] || 0) + 1;
    const raw = { desc: row.desc ?? row.description, unit: row.unit, resource_key: row.resource_key,
      resource_identity: row.resource_identity, price_lookup: row.price_lookup,
      sor_ref: row.sor_ref, sor_refs: row.sor_refs, rate: row.rate, starting_rate: row.starting_rate,
      mock_rate: row.mock_rate, _candidates: candidates ?? row._candidates ?? [] };
    const id = JSON.stringify([kind, raw]);
    if (!groups.has(id)) groups.set(id, { kind, route, raw, occurrences: 0, analyses: new Set(), options: !!row.costing_options });
    const entry = groups.get(id);
    entry.occurrences++;
    entry.analyses.add(code);
  }
  for (const m of source) {
    const links = new Map((m.component_links || []).map(x => [x.resource_key, x.candidates || []]));
    for (const kind of ['materials', 'machinery', 'labour']) {
      for (const row of m[kind] || []) {
        add(kind, row, m.code, 'base', links.get(row.resource_key));
        for (const [option, data] of Object.entries(row.costing_options?.options || {})) {
          if (option === 'source') continue;
          for (const component of data.components || []) add(component.section || kind,
            { ...row, ...component, costing_options: undefined }, m.code, `option:${option}`, links.get(row.resource_key));
        }
      }
      for (const row of m.pricing_additions?.[kind] || []) add(kind, row, m.code, 'addition');
    }
  }
  const codes = [...new Set([...groups.values()].map(g => costs.morthResourceCode(g.raw)).filter(Boolean))];
  for (let n = 0; n < codes.length; n += 500) await costs.preloadMorthResourceDefaults(codes.slice(n, n + 500));
  const entries = [...groups.values()];
  // Reuse the inventory's recorded choices when checking a corrected resolver.
  // Annual quotes still go through the live read-only RPC for the exact basis.
  const previousFile = path.join(directory, 'audit.before.json');
  const previous = process.argv.includes('--reprice') && fs.existsSync(previousFile)
    ? new Map(JSON.parse(fs.readFileSync(previousFile, 'utf8')).rows.map(r => [JSON.stringify([r.kind, r.raw]), r.choices]))
    : new Map();
  const result = [];
  let index = 0;
  async function worker() {
    while (index < entries.length) {
      const entry = entries[index++];
      const { raw } = entry;
      const item = { ...entry, analyses: [...entry.analyses] };
      try {
        if (raw.price_lookup?.table === 'morth') item.skipped = 'appendix dependency';
        else if (raw.price_lookup?.table === 'project_quote') item.skipped = 'project quotation input';
        else {
          item.choices = previous.get(JSON.stringify([entry.kind, raw])) ?? await costs.costChoices(raw);
          item.selected = costs.defaultCostChoice(item.choices);
          item.resolved = await costs.resolveIndividualCost(raw, raw.unit || '', 'MORTH', undefined, '2026-27', 'zone_3', item.choices);
          if (item.resolved.pricing) {
            const pricing = item.resolved.pricing;
            item.selected = { code: pricing.recipeCode, component: pricing.component };
            const { data, error } = await client.rpc('sor_resource_quote', {
              p_recipe_code: pricing.recipeCode, p_year: '2026-27', p_zone: 'zone_3',
              p_component: pricing.component, p_unit: pricing.quoteUnit,
            });
            if (error) throw error;
            item.quote = data;
          }
        }
      } catch (e) { item.error = e.message; }
      result.push(item);
      if (result.length % 100 === 0) console.log(`Resolved ${result.length}/${entries.length} distinct price routes`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  const summary = { checkedAt: new Date().toISOString(), year: '2026-27', zone: 'zone_3', analyses: source.length,
    totals, priceRoutes: result.length, byKind: {}, sources: {}, quoteStatus: {}, converted: [], errors: [] };
  for (const r of result) {
    summary.byKind[r.kind] = (summary.byKind[r.kind] || 0) + 1;
    const origin = r.resolved?.source || r.skipped || (r.error ? 'error' : 'unpriced');
    summary.sources[origin] = (summary.sources[origin] || 0) + 1;
    const status = r.quote?.status || 'none';
    summary.quoteStatus[status] = (summary.quoteStatus[status] || 0) + 1;
    if (r.resolved?.pricing && r.resolved.pricing.conversionFactor !== 1)
      summary.converted.push({ kind: r.kind, desc: r.raw.desc, unit: r.raw.unit, selected: r.selected,
        factor: r.resolved.pricing.conversionFactor, rate: r.resolved?.rate, occurrences: r.occurrences });
    if (r.error) summary.errors.push({ desc: r.raw.desc, error: r.error });
  }
  fs.writeFileSync(path.join(directory, 'audit.json'), JSON.stringify({ summary, rows: result }, null, 2) + '\n');
  writeReport(source, { summary, rows: result });
  console.log(JSON.stringify({ ...summary, converted: summary.converted.length }, null, 2));
}
function writeReport(source, audit) {
  const beforeFile = path.join(directory, 'audit.before.json');
  const before = fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, 'utf8')) : undefined;
  const old = new Map((before?.rows || []).map(r => [JSON.stringify([r.kind, r.raw]), r]));
  const changed = audit.rows.filter(r => old.has(JSON.stringify([r.kind, r.raw])) &&
    old.get(JSON.stringify([r.kind, r.raw])).resolved?.rate !== r.resolved?.rate);
  const base = source.flatMap(m => ['materials', 'machinery', 'labour'].flatMap(kind =>
    (m[kind] || []).map(row => ({ code: m.code, kind, row }))));
  const machine = base.filter(r => r.kind === 'machinery');
  const converters = {};
  for (const { row } of base) {
    const type = row.price_lookup?.unit_conversion?.type;
    if (type) converters[type] = (converters[type] || 0) + 1;
  }
  const priced = audit.rows.filter(r => typeof r.resolved?.rate === 'number');
  const unresolved = audit.rows.filter(r => !r.skipped && typeof r.resolved?.rate !== 'number');
  const splitFuel = audit.rows.filter(r => r.raw.price_lookup?.rate_component === 'fuel_charge' && r.raw.price_lookup?.table === 'SOR_Year');
  const wrongFuel = splitFuel.filter(r => r.resolved?.pricing?.component !== 'fuel_charge' ||
    r.resolved?.pricing?.recipeCode !== r.raw.price_lookup.recipe_code);
  const summary = { ...audit.summary, pricedRoutes: priced.length, unresolvedRoutes: unresolved.length,
    changedRoutes: changed.length, baseMachineryOccurrences: machine.length,
    baseMachineryKeys: new Set(machine.map(r => r.row.resource_key)).size,
    conversionMetadataOccurrences: converters,
    dependencyQuantityMultiplierOccurrences: base.filter(r => r.row.price_lookup?.quantity_multiplier != null).length,
    explicitSorFuelRoutes: splitFuel.length, fuelBindingMismatches: wrongFuel.length,
    historicalRoutes: priced.filter(r => r.resolved.source === 'benchmark').length,
    approximateSorRoutes: priced.filter(r => r.resolved.source === 'starting-sor').length,
  };
  fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const escape = value => {
    let text = value == null ? '' : String(value);
    if (/^[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [['kind', 'route', 'description', 'resource_key', 'unit', 'binding_table', 'binding_component',
    'quoted_sor_code', 'quoted_component', 'rate', 'source', 'conversion_factor', 'status', 'label', 'occurrences', 'analysis_count', 'example_analysis']];
  for (const r of audit.rows) csv.push([r.kind, r.route, r.raw.desc, r.raw.resource_key, r.raw.unit,
    r.raw.price_lookup?.table, r.raw.price_lookup?.rate_component, r.resolved?.pricing?.recipeCode,
    r.resolved?.pricing?.component, r.resolved?.rate, r.resolved?.source,
    r.resolved?.pricing?.conversionFactor, r.skipped || r.resolved?.pricing?.status || (r.resolved?.rate == null ? 'unpriced' : 'stored'),
    r.resolved?.label || r.error, r.occurrences, r.analyses.length, r.analyses[0]]);
  fs.writeFileSync(path.join(directory, 'all-price-routes.csv'), '\ufeff' + csv.map(row => row.map(escape).join(',')).join('\n'));
  const examples = audit.rows.filter(r => /Water tanker 12 KL|PVC pipe for horizontal drainage|Sand for CM1:1|Fly ash for PQC/.test(r.raw.desc || '') && r.route === 'base');
  const exampleRows = [...new Map(examples.map(r => [JSON.stringify([r.raw.desc, r.raw.unit, r.resolved?.rate, r.resolved?.label]), r])).values()].slice(0, 12);
  const scaledTanker = examples.find(r => r.resolved?.pricing?.capacityFactor);
  const text = `# MoRTH fuel and conversion audit — 25 October 2026

Read-only audit of all ${source.length} stored MoRTH analysis records, including all project-size variants, base rows, equipment alternatives and pricing additions. Prices were checked for 2026–27, Zone 3 using the actual application resolver. This verifies pricing routes and arithmetic, not physical equivalence of every suggested machine or material.

## Coverage and findings

- ${base.length.toLocaleString('en-IN')} base ingredient occurrences; ${machine.length.toLocaleString('en-IN')} machinery occurrences across ${summary.baseMachineryKeys} resource keys.
- ${audit.rows.length} distinct pricing input combinations, including conditional alternatives; ${priced.length} resolve to a number and ${unresolved.length} lack a default number. Appendix dependencies and quotation-only inputs are recorded separately.
- ${summary.historicalRoutes} priced combinations use a historical benchmark; ${summary.approximateSorRoutes} use review-labelled starting SOR candidates. These counts are not approvals of technical equivalence or current-year market prices.
- ${splitFuel.length} explicit SOR fuel combinations were checked; ${wrongFuel.length} select a component other than fuel after the correction.
- ${changed.length} input combinations have a changed default price relative to the pre-fix audit. Repeated occurrences and alternatives are aggregated, so this is not a count of physical products.
- Stored special conversion rules cover ${converters.fixed_supply_length || 0} fixed supply-length occurrences, ${converters.bulk_density_kg_per_cum || 0} density-dependent occurrences, and ${summary.dependencyQuantityMultiplierOccurrences} dependency quantity-basis occurrences.

## How fuel is identified

The explicit machinery price binding supplies its SOR recipe code and component. A fuel row quotes that same machine's fuel_charge for the project year/zone and uses the selected option's operating hours. It does not select a generic diesel rate by matching the description. Crew uses crew_charge under labour when the selected equipment method explicitly separates it. The split method must replace the inclusive total, rather than add to it.

Existing explicit split alternatives cover 6/12/16 kL tanker substitutions and centrifugal/dewatering pump options. Other machines may use a complete SOR tariff, an inclusive historical benchmark, or a review-labelled candidate. Their fuel/crew inclusions and separately listed operators, diesel and generators still need source review before restructuring the analysis. No global automatic fuel surcharge was added.

## Corrections in application source

1. An explicit SOR code/component takes precedence over inherited source identities and nearby candidates. Component choices retain their hire/fuel/crew basis.
2. Quotation-only inputs stay unpriced until a rate is adopted; no silent SOR substitute is used.
3. Legacy machinery hire_total and sor_year fields are recognised. An exact historical benchmark is labelled with its actual year, rather than replaced by a nearby current SOR machine.
4. Normal unit factors returned by sor_resource_quote are already applied and are not multiplied twice. Conversion factors now appear in the rate-source label.
5. Stored 3-metre PVC supply rules divide the per-item quote by three; an explicitly selected pressure-class case is respected.
6. Density conversions use the analysis's positive entered density. No density is invented. Individual Costs previews retain that basis.
7. The native dependency calculator applies the stored quantity_multiplier once. The twelve affected reinforcement occurrences convert a tonne-based analysis to the parent's kg rate. Existing rate_multiplier handling remains separate.

## Representative starting prices after correction

| Source resource | Unit | Starting rate | Source/basis |
|---|---|---:|---|
${exampleRows.map(r => `| ${r.raw.desc} | ${r.raw.unit} | ${r.resolved?.rate ?? 'Requires input'} | ${(r.resolved?.label || r.skipped || '').replaceAll('|', '/')} |`).join('\n')}

${scaledTanker
    ? 'The tanker now uses a provisional backend capacity basis. Hire and fuel are scaled and the crew rate is retained once. See morth-starting-capacity-factors.md for the policy and live verification.'
    : 'At this snapshot the 12 kL tanker used the ₹1,270/hour 2019–20 Delhi benchmark. The later backend capacity-factor change is documented in morth-starting-capacity-factors.md; that follow-up supersedes this historical tanker example.'}

## Data and remaining review

The full route inventory is output/morth-pricing-audit/all-price-routes.csv. Before/after snapshots, source records and summary.json are in the same directory. Rerun npm run audit:morth-pricing; --refresh reloads source records, --reprice reuses recorded choices while obtaining live annual quotes, and --report-only regenerates the review files.

This audit is read-only. The separately deployed backend tanker factors are documented in morth-starting-capacity-factors.md. Ordinary unit factors, SSR empirical basis multipliers and MoRTH's explicit supply/density/dependency rules already exist in Supabase. Machine capacity changes need an explicit estimating basis, equipment mapping or quotation; a difference in capacity does not establish a unit-conversion factor.

## Validation

The focused price-basis tests cover real recipe expansion into hire/fuel/crew rows, equal operating hours, summing components once, fixed supply lengths, selected pressure classes, explicit densities, historical inclusive rates, manual overrides and quotation boundaries. Existing Individual Costs/project-scoping tests and material Lead regression tests pass. Web type checking and targeted ESLint pass. Twelve native MoRTH calculator tests pass, including the new reinforcement conversion regression. Native tests were compiled directly against cached dependencies because the running development Cargo process held the package-cache lock. A packaged desktop build was not produced in this audit; the native conversion change requires rebuilding the desktop app.
`;
  fs.writeFileSync(path.join(root, 'docs/morth-fuel-and-conversion-audit-2026-10-25.md'), text);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
