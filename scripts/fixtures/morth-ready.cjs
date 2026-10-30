// Upgrade legacy source fixtures through the real material-Lead path before export.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript'), { spawnSync } = require('node:child_process');
module.exports = async function readyMorthFixture(source) {
  const root = path.resolve(__dirname, '../..'), lib = path.join(root, 'src/renderer/src/lib'), cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const m = new Module(file, module); cache.set(file, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    m.require = r => r === './supabase' ? { supabase: { rpc: () => { throw Error('Fixture preparation must be offline'); } } }
      : r.startsWith('.') ? load(path.resolve(path.dirname(file), r) + '.ts') : require(r);
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, file); return m.exports;
  }
  const previous = global.window;
  global.window = { api: { rateAnalysis: { calculateBase: async recipe => {
    const run = spawnSync(path.join(root, 'src-tauri/target/debug/rate_analysis_cli.exe'), ['--base'], {
      input: JSON.stringify(recipe), encoding: 'utf8',
    });
    if (run.status !== 0) throw Error(run.stderr); return JSON.parse(run.stdout);
  } } } };
  try {
    const recipe = await load(path.join(lib, 'morthEstimate.ts')).prepareMorthRecipe(structuredClone(source));
    const lead = load(path.join(lib, 'morthMaterialLead.ts'));
    const variants = [...new Map(lead.morthMaterialInventory(recipe).map(row => [row.name, {
      id: row.name, materialName: row.name, conveyanceClass: row.conveyanceClass, active: true,
      rateSource: 'manual', customGrossRate: 0, leadKm: 0, handlingMode: 'none',
    }])).values()];
    const applications = variants.flatMap(v => lead.morthLeadScopes(recipe, v.materialName, v.conveyanceClass).map(scope => ({
      id: `${v.id}:${scope.path.join('/')}`, variantId: v.id, itemKey: recipe.itemKey,
      morthAppendixPath: scope.path, morthRootFactor: scope.factor, morthRootOutputQuantity: recipe.outputQuantity,
      ...lead.morthQuantityForLead(scope.recipe, v, true), morthLeadVariantSignature: lead.morthLeadVariantSignature(v),
      grossRate: 0, grossAmount: 0, rateYear: recipe.year, rateZone: recipe.zone, outputQuantity: scope.recipe.outputQuantity,
    })));
    const issues = lead.morthLeadIssues(recipe, applications, variants);
    if (issues.length) throw Error(issues.join('; '));
    return { recipe: await load(path.join(lib, 'morthLeadPricing.ts')).priceMorthLead(recipe, applications, variants), applications, variants };
  } finally { global.window = previous; }
};
