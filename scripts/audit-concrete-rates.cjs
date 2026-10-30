// Read-only comparison through the application's real recipe/resolver/calculator path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'src/renderer/src/lib/supabase.ts'), 'utf8');
const client = createClient(config.match(/'https:\/\/[^']+\.supabase\.co'/)[0].slice(1, -1),
  config.match(/'sb_publishable_[^']+'/)[0].slice(1, -1), { auth: { persistSession: false }, global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }),
  } });
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`), m = new Module(file, module);
  cache.set(name, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r === './supabase' ? { supabase: client } : r.startsWith('./') ? load(r.slice(2)) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, file);
  return m.exports;
}
function native(recipe, base = false) {
  const run = spawnSync(process.env.RATE_ANALYSIS_CLI || path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe'), base ? ['--base'] : [], {
    input: JSON.stringify(recipe), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}
global.window = { api: { rateAnalysis: {
  calculate: async r => native(r), calculateBase: async r => native(r, true),
} } };
function describe(recipe) {
  const summary = native(recipe);
  return { code: recipe.itemCode, description: recipe.description, output: recipe.outputQuantity,
    summary, perCum: Object.fromEntries(Object.entries(summary.sectionTotals).map(([k, v]) => [k, +(v / recipe.outputQuantity).toFixed(2)])),
    sections: recipe.sections, recalculation: recipe.recalculation,
    appendices: Object.entries(recipe.morth?.inputs || {}).flatMap(([id, input]) => input.dependency ? [{ via: id, ...describe(input.dependency) }] : []),
  };
}
function flattenCosts(recipe, scale = 1) {
  const totals = { materials: 0, machinery: 0, labour: 0 };
  for (const section of recipe.sections) for (const line of section.lines) {
    const dependency = recipe.morth?.inputs[line.id]?.dependency;
    if (dependency) {
      const nested = flattenCosts(dependency, scale * line.quantity / dependency.outputQuantity);
      for (const key of Object.keys(totals)) totals[key] += nested[key];
    } else totals[section.key] += scale * line.amount;
  }
  return totals;
}
async function gradeCheck(morth, ccdw, dir) {
  const entries = [
    ['RCC slab M20', 'MORTH-2019-14.01-A-i-p-medium'],
    ['RCC slab M25', 'MORTH-2019-14.01-B-i-p-medium'],
    ['RCC slab M30', 'MORTH-2019-14.01-C-i-p-medium'],
    ['PCC production M15', 'MORTH-2019-21.03-medium'],
    ['PCC production M20', 'MORTH-2019-21.04-medium'],
    ['PCC production M25', 'MORTH-2019-21.06-medium'],
  ];
  const prices = [];
  for (const [label, code] of entries) {
    const recipe = code === morth.itemCode ? morth : await load('morthEstimate').fetchMorthRecipe({
      id: code, itemSource: 'MORTH', itemCode: code, categoryKey: 'morth',
      morth: { category: 'medium', parameters: {}, printedItem: code },
    }, '2026-27', 'zone_3', {}, {});
    const summary = native(recipe);
    prices.push({ label, code, rate: summary.ratePerUnit, costReady: summary.costReady,
      output: recipe.outputQuantity, pending: recipe.morth.pending,
      flatPerCum: Object.fromEntries(Object.entries(flattenCosts(recipe)).map(([k,v]) => [k, v / recipe.outputQuantity])),
    });
    console.log(`${label}: Rs ${summary.ratePerUnit}/cum; costReady=${summary.costReady}`);
  }
  const { data: ssr, error } = await client.from('ssr_year').select('code,year,base_rate').eq('year', '2026-27')
    .in('code', ['IRR-DAW-2-5','IRR-DAW-2-3','IRR-DAW-2-4','IRR-CCDW-2-12','IRR-CCDW-2-11','IRR-CCDW-2-10']);
  if (error) throw error;
  const flat = flattenCosts(morth), c = flattenCosts(ccdw);
  const shutter = { materials: 0, labour: 0 }, crew = ccdw.sections.flatMap(s => s.lines)
    .filter(l => /^Crew for /i.test(l.description)).reduce((sum,l) => sum+l.amount, 0);
  for (const s of ccdw.sections) for (const l of s.lines)
    if (/shutter/i.test(l.description) && s.key in shutter) shutter[s.key] += l.amount;
  const quantity = ccdw.outputQuantity;
  const comparison = { ccdw: {
    materialsExcludingFormwork: (c.materials-shutter.materials)/quantity,
    machineryWithCrew: (c.machinery+crew)/quantity,
    siteLabourExcludingFormworkAndMachineCrew: (c.labour-shutter.labour-crew)/quantity,
    formwork: (shutter.materials+shutter.labour)/quantity,
    fuelAlone: ccdw.sections.flatMap(s=>s.lines).filter(l=>/Fuel \/ Energy/i.test(l.description)).reduce((sum,l)=>sum+l.amount,0)/quantity,
  }, morth: Object.fromEntries(Object.entries(flat).map(([k,v])=>[k,v/morth.outputQuantity])) };
  fs.writeFileSync(path.join(dir, 'grade-check.json'), JSON.stringify({checkedAt: new Date().toISOString(),prices,ssr,comparison}, null, 2)+'\n');
  console.log(JSON.stringify({ssr,comparison}, null, 2));
}
async function main() {
  console.log('Loading concrete source and pricing modules');
  const api = load('rateAnalysis');
  const node = { id: 'ccdw-audit', itemSource: 'SSR', itemCode: 'IRR-CCDW-5-4', categoryKey: 'ccdw', name: 'M15 coping slab' };
  const ccdw = await api.fetchRateAnalysis(node, '2026-27', { zone: 'zone_3' });
  console.log('Loaded CCDW 5-4');
  const adjusted = await api.fetchRateAnalysis(node, '2026-27', { zone: 'zone_3', areaAllowancePercent: 40, areaAllowanceLabel: 'Greater Hyderabad (GHMC) area allowance' });
  console.log('Loaded allowance-adjusted CCDW 5-4');
  const morth = await load('morthEstimate').fetchMorthRecipe({ id: 'morth-audit', itemSource: 'MORTH',
    itemCode: 'MORTH-2019-14.01-B-i-p-medium', categoryKey: 'morth',
    morth: { category: 'medium', printedItem: '14.01', parameters: {} } }, '2026-27', 'zone_3', {}, {});
  const dir = path.join(root, 'output/concrete-rate-audit'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ccdw-recipe.json'), JSON.stringify(ccdw, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'morth-recipe.json'), JSON.stringify(morth, null, 2) + '\n');
  const result = { checkedAt: new Date().toISOString(), ccdw: describe(ccdw), withAllowance: describe(adjusted), morth: describe(morth) };
  fs.writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
  if (process.argv.includes('--grades')) { await gradeCheck(morth, ccdw, dir); return; }
  console.log(JSON.stringify(Object.fromEntries(['ccdw', 'withAllowance', 'morth'].map(k => [k, { rate: result[k].summary.ratePerUnit,
    perCum: result[k].perCum, summary: result[k].summary, abstract: result[k].recalculation?.abstract }])), null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
