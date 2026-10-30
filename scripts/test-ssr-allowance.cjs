const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/ccdw-5-4-source.json');
const mocks = {
  supabase: { supabase: { from(table) {
    const result = table === 'ssr_item' ? fixture.item : table === 'ssr_year' ? fixture.year : { value_num: 13.615 };
    return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: result, error: null }) };
  } } },
  individualCosts: { applyIndividualCosts: async r => r }, morthEstimate: {}, sorSource: {}, sorEstimate: {},
  pipeLead: { pipeLeadSourceFromContext: () => undefined },
  materialRates: { applyMaterialRateOverrides: r => ({ recipe: r, applications: [] }), fetchMaterialAliases: async () => new Map(), fetchMonthlyMaterials: async () => [] },
  projectItems: { projectItemKey: n => `${n.itemSource}:${n.itemCode}`, projectNodePath: () => [], projectItemGroupIndex: () => new Map(), rateAnalysisOverrideForNode: (p, n) => p.rateAnalysisOverrides?.[n.itemCode] },
  dashboardSync: {}, tree: {},
};
const cache = new Map();
function load(name) {
  if (name in mocks) return mocks[name];
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`), m = new Module(file, module);
  cache.set(name, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = r => r.endsWith('?raw') ? fs.readFileSync(path.resolve(path.dirname(file), r.slice(0, -4)), 'utf8')
    : r.startsWith('.') ? load(path.relative(path.join(root, 'src/renderer/src/lib'), path.resolve(path.dirname(file), r)).replaceAll('\\', '/')) : require(r);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, file);
  return m.exports;
}
function native(recipe, base) {
  const run = spawnSync(process.env.RATE_ANALYSIS_CLI || path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe'), base ? ['--base'] : [], {
    input: JSON.stringify(recipe), encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout);
}
global.window = { api: { rateAnalysis: { calculate: async r => native(r), calculateBase: async r => native(r, true) } } };
async function main() {
  const api = load('rateAnalysis'), merge = load('recipeMerge');
  const node = { itemCode: 'IRR-CCDW-5-4', categoryKey: 'ccdw', itemSource: 'SSR' };
  const published = await api.fetchRateAnalysis(node, '2026-27');
  assert.equal((await api.calculateRateAnalysis(published)).ratePerUnit, 8738.1);
  const source = { ...published, areaAllowancePercent: 40, areaAllowanceLabel: 'Greater Hyderabad (GHMC) area allowance' };
  const prepared = await api.prepareRateAnalysis(source);
  const summary = await api.calculateRateAnalysis(prepared);
  assert.equal(summary.areaAllowanceAmount, 15597.05);
  assert.equal(summary.sectionTotals.labour, 54589.68);
  assert.equal(summary.baseCost, 128424.09);
  assert.equal(summary.overheadAmount, 17484.94);
  assert.equal(summary.totalCost, 145909.03);
  assert.equal(summary.ratePerUnit, 9946.08);
  assert.deepEqual(prepared.recalculation.abstract.map(r => r.amount),
    ['71042.46', '2791.95', '54589.68', '128424.09', '17484.94', '145909.03', '9946.08']);
  assert.equal(await api.prepareRateAnalysis(prepared), prepared, 'An unchanged allowance must not be applied twice');
  const reduced = await api.prepareRateAnalysis({ ...prepared, areaAllowancePercent: 20 });
  assert.equal((await api.calculateRateAnalysis(reduced)).sectionTotals.labour, 46791.16);
  const removed = await api.prepareRateAnalysis({ ...prepared, areaAllowancePercent: 0 });
  assert.equal((await api.calculateRateAnalysis(removed)).ratePerUnit, 8738.1);
  const legacy = { ...source, recalculation: { ...prepared.recalculation, areaAllowancePercent: undefined, calculatedRate: '8738.10' } };
  assert.equal((await api.calculateRateAnalysis(legacy)).ratePerUnit, 9946.08, 'Old cached rates must refresh against their allowance');
  const saved = await api.recalculateRateAnalysis(published);
  const merged = merge.mergeSavedRecipe(source, saved);
  assert.equal(merged.calculationStale, true);
  assert.equal((await api.calculateRateAnalysis(merged)).ratePerUnit, 9946.08);
  const [sheet] = await load('dataSheets').calculateDataSheets([{ recipe: merged, calculatedSummary: { ratePerUnit: 8738.1 }, leadApplications: [], leadVariants: [] }]);
  assert.equal(sheet.calculatedSummary.ratePerUnit, 9946.08);
  assert.equal(sheet.recipe.recalculation.abstract[3].amount, '128424.09');
  const presentation = load('dataPresentation').buildDataPresentation(sheet.recipe, [], [], sheet.calculatedSummary);
  assert.equal(presentation.normalizedAbstractRows.at(-1).amount, '9946.08');
  const output = load('typist-output/dataTypst');
  const inputs = await output.rateAnalysisCompileInputs(merged, null);
  const render = JSON.parse(inputs['ee-data']).recipes[0];
  assert.equal(render.abstract_rows.at(-1).amount, '9946.08');
  assert.equal(render.totals.labour_total, 38992.63, 'The labour detail total excludes the allowance displayed separately');
  assert.ok(Math.abs(render.totals.labour_unit_base - 54589.68 / 14.67) < 1e-8, 'The PDF must not add the allowance twice');
  const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');
  const compiler = NodeCompiler.create({ workspace: root });
  const pdf = compiler.pdf({ mainFileContent: output.dataTypstTemplate(), inputs });
  const dir = path.join(root, 'output/concrete-rate-audit'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ccdw-40-percent.pdf'), pdf);
  assert.ok(pdf.length > 4000);
  const excel = load('excel-output/dataExcel').buildDataExcelPayload({ meta: { name: 'CCDW allowance QA', sorYear: '2026-27', sorZone: 'zone_3' } }, [{ ...sheet, id: 'ccdw-5-4' }]);
  assert.equal(excel.recipes[0].abstract_rows.at(-1).amount, '9946.08', 'Excel receives the same rebuilt abstract as the screen and PDF');
  assert.equal(load('finalNumber').getItemRate({ rateAnalysisOverrides: { [node.itemCode]: sheet.recipe } }, node), 9946.08);
  const staleProject = { rateAnalysisOverrides: { [node.itemCode]: saved }, dashboardSnapshot: { recipes: { usage: sheet.recipe } } };
  assert.equal(load('finalNumber').getItemFinal(staleProject, { ...node, id: 'usage', kind: 'item', computedQuantity: 2 }, 9946.08).amount, 19892.16,
    'A saved pre-allowance rate must not override the newly compiled component price');
  assert.equal(source.storedValues.abstract[3].amount, '112827.03', 'The published source stays unchanged');
  console.log('CCDW 5-4 allowance: on/change/off, saved edits, anonymous subtotal, adopted rate, DATA export and native PDF passed: Rs 9946.08/cum');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
