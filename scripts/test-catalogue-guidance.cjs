// Public-client integration: live backend -> actual fetcher/search -> selection metadata.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'src/renderer/src/lib/supabase.ts'), 'utf8');
const client = createClient(config.match(/'https:\/\/[^']+\.supabase\.co'/)[0].slice(1, -1),
  config.match(/'sb_publishable_[^']+'/)[0].slice(1, -1), {
    auth: { persistSession: false }, global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) })
    }
  });
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const file = path.join(root, 'src/renderer/src/lib', `${name}.ts`);
  const mod = new Module(file, module); cache.set(name, mod);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = r => r === './supabase' ? { supabase: client } : r.startsWith('./') ? load(r.slice(2)) : require(r);
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText, file);
  return mod.exports;
}
async function browse(query, category = 'medium', extra = {}) {
  const result = await client.rpc('morth_picker_browse', {
    p_path: { category }, p_query: query, p_offset: 0, p_limit: 100, ...extra
  });
  assert.ifError(result.error); return result.data;
}
async function main() {
  const { readCatalogueGuidance, catalogueSummary, catalogueChoiceTitle, catalogueChoiceFacts, catalogueDetailsText, concreteGradeExplanation } = load('catalogueGuidance');
  assert.equal(readCatalogueGuidance({ shortSummary: 'unvalidated' }), undefined);
  assert.match(concreteGradeExplanation(['M15']), /15 N\/mm².*28 days/);
  const api = load('masterData'), search = load('masterSearch');
  const [ccdw, daw, caw, gaw] = await Promise.all(['IRR-CCDW','IRR-DAW','IRR-CAW','IRR-GAW'].map(api.fetchSsrItems));
  const coping = ccdw.find(item => item.code === 'IRR-CCDW-5-4');
  assert.equal(coping.category, 'ssr_item', 'selection identity must retain the technical SSR source');
  assert.match(catalogueSummary(coping), /^M15 coping slab.*20 mm.*includes formwork/);
  assert.ok(coping.description.length > 400, 'full source must survive loading');
  assert.equal(coping.guidance.source.descriptionHash, createHash('md5').update(coping.description).digest('hex'));
  assert.match(catalogueDetailsText(coping), /Fuel \/ energy.*Separate fuel/);
  assert.match(catalogueDetailsText(coping), /Machine crew.*under labour/);
  assert.equal(search.rankMasterItems(ccdw, 'M-15 coping')[0].item.code, coping.code);
  assert.equal(search.rankMasterItems(daw, 'M15 dam mass')[0].item.guidance.application, 'dam plain mass concrete');
  assert.ok(search.rankMasterItems(daw, 'M25 dam').every(match => match.item.guidance.grades.includes('M25')));
  assert.equal(daw.find(item => item.code === 'IRR-DAW-2-17').guidance.application, 'RCC solid parapet');
  assert.equal(daw.find(item => item.code === 'IRR-DAW-2-18').guidance.application, 'RCC ornamental parapet');
  assert.match(daw.find(item => item.code === 'IRR-DAW-2-9').guidance.shortSummary, /transit mixer/);
  assert.deepEqual(gaw.find(item => item.code === 'IRR-GAW-2-2').guidance.grades, [], 'metre dimension is not grade M16');
  assert.equal(catalogueChoiceTitle(ccdw.find(item => item.code === 'IRR-CCDW-4-8')), '12 mm cement plaster · CM 1:4');
  assert.equal(catalogueChoiceTitle(ccdw.find(item => item.code === 'IRR-CCDW-4-9')), '20 mm cement plaster · CM 1:3');
  assert.equal(catalogueChoiceTitle(ccdw.find(item => item.code === 'IRR-CCDW-4-10')), '20 mm cement plaster · CM 1:4');
  assert.match(ccdw.find(item => item.code === 'IRR-CCDW-4-3').guidance.purpose, /less stringent stone dressing/);
  assert.match(ccdw.find(item => item.code === 'IRR-CCDW-4-4').guidance.purpose, /more closely dressed/);
  assert.equal(search.rankMasterItems(ccdw, '12 mm plaster 1:4')[0].item.code, 'IRR-CCDW-4-8');
  assert.equal(search.rankMasterItems(ccdw, 'plaster').length, 4, 'pointing help must not make pointing a plaster result');
  assert.ok(search.rankMasterItems(ccdw, 'plaster 1:3').every(match =>
    !match.item.guidance.choiceFacts.some(row => row.label === 'Mortar' && row.value !== '1:3')));
  assert.ok(search.rankMasterItems(ccdw, 'first sort').every(match => match.item.code !== 'IRR-CCDW-4-3'));
  const mortar = item => catalogueChoiceFacts(item).find(row => row.label === 'Mortar').value;
  assert.notEqual(mortar(ccdw.find(item => item.code === 'IRR-CCDW-4-9')), mortar(ccdw.find(item => item.code === 'IRR-CCDW-4-10')));
  assert.deepEqual(ccdw.find(item => item.code === 'IRR-CCDW-2-29').guidance.grades, ['M20'], 'spaced grade M- 20 must resolve');
  assert.equal(new Set(caw.filter(item => ['IRR-CAW-7-31','IRR-CAW-7-32','IRR-CAW-7-33'].includes(item.code)).map(catalogueChoiceTitle)).size, 3);
  const slabs = caw.filter(item => /precast PCC (lining|lug) slabs/.test(item.guidance?.application ?? ''));
  assert.equal(new Set(slabs.map(item => item.guidance.shortSummary)).size, slabs.length, 'precast slab dimensions must distinguish items');

  const m25 = await browse('M-25 solid slab pump');
  assert.equal(m25.total, 3);
  assert.ok(m25.rows.every(row => row.guidance.grades.length === 1 && row.guidance.grades[0] === 'M25'));
  const parent = m25.rows.find(row => row.code === 'MORTH-2019-14.01-B-i-p-medium');
  assert.ok(parent.guidance.scope.some(row => row.label === 'Formwork / staging' && row.detail.startsWith('20%')));
  assert.equal((await browse('M5')).total, 0, 'M5 must not return M50 variants');
  assert.equal((await browse('M15 solid slab')).total, 0, 'no grade substitution');
  assert.ok((await browse('M25 shuttering')).rows.some(row => row.guidance.scope.some(s => s.label === 'Formwork / staging')));
  const appendix = await browse('M25 production appendix');
  assert.ok(appendix.total > 0);
  assert.ok(appendix.rows.every(row => row.guidance.scope.some(s => s.label === 'Rate scope' && /Production sub-analysis/.test(s.detail))));
  const small = await browse('M25 production appendix', 'small');
  assert.ok(small.rows.every(row => row.guidance.source.code === (row.sourceCodes.small || row.code)));
  const all = await browse('M25');
  const paged = await browse('M25', 'medium', { p_limit: 2, p_offset: 2 });
  assert.deepEqual(paged.rows.map(r => r.code), all.rows.slice(2, 4).map(r => r.code));
  assert.equal((await browse('')).level, 'part');
  const detail = await client.rpc('morth_picker_detail', { p_code: parent.code, p_category: 'medium' });
  assert.ifError(detail.error);
  assert.equal(detail.data.recipe.description, parent.description);

  const loading = (await browse('1.01')).rows.filter(row => /^MORTH-2019-1[.]01-[A-D]$/.test(row.code));
  assert.equal(loading.length,4,'All four distinct equipment variants remain selectable');
  assert.deepEqual(loading.map(row => row.code), ['MORTH-2019-1.01-A','MORTH-2019-1.01-B','MORTH-2019-1.01-C','MORTH-2019-1.01-D']);
  assert.deepEqual(loading.map(row => row.guidance.choiceFacts[0].value), ['Tipper 5.5 cum capacity','Tipper 10 cum capacity','Tipper 14 cum capacity','Tipper 18 cum capacity']);
  assert.ok(loading.every(row => readCatalogueGuidance(row.guidance) && row.guidance.descriptionDetail.includes('excluding time for haulage')));
  assert.equal((await browse('tipper 5.5')).rows.filter(row => row.code === 'MORTH-2019-1.01-A').length,1,'Equipment capacity is searchable');
  const factValues=item=>catalogueChoiceFacts(item).map(row=>row.value).join(' | ');
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-2-6')),/98% minimum density/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-2-7')),/95% minimum density/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-2-8')),/Without watering/);
  assert.match(catalogueChoiceTitle(caw.find(item=>item.code==='IRR-CAW-6-1')),/^Rockfill casing/);
  assert.match(catalogueChoiceTitle(caw.find(item=>item.code==='IRR-CAW-1-9')),/line drilling/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-8-1')),/With pin headers/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-8-3')),/not specified in description/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-5-12')),/200 gsm/);
  assert.match(factValues(caw.find(item=>item.code==='IRR-CAW-5-13')),/250 gsm/);
  const tunnel=await api.fetchSsrItems('IRR-TAW');
  assert.match(catalogueChoiceTitle(tunnel.find(item=>item.code==='IRR-TAW-1-1')),/^Adit excavation.*Rock/);
  assert.match(catalogueChoiceTitle(tunnel.find(item=>item.code==='IRR-TAW-1-3')),/no supports required/);
  assert.match(catalogueChoiceTitle(tunnel.find(item=>item.code==='IRR-TAW-1-5')),/Heading and benching/);
  const haulage=(await browse('1.04')).rows.filter(row=>/^MORTH-2019-1[.]04-/.test(row.code));
  assert.equal(haulage.length,14);
  assert.deepEqual(['A','B','C','D'].map(letter=>haulage.find(row=>row.code==='MORTH-2019-1.04-i-'+letter).guidance.choiceFacts[0].value), ['10 tonne payload','18 tonne payload','25 tonne payload','32 tonne payload']);
  assert.match(factValues(haulage.find(row=>row.code==='MORTH-2019-1.04-ii-A')),/20 km\/h loaded/);
  const mixers=(await browse('Transit mixer6cum')).rows;
  assert.match(factValues(mixers.find(row=>row.code==='MORTH-2019-20.079')),/Hourly equipment operation/);
  assert.match(factValues(mixers.find(row=>row.code==='MORTH-2019-20.128')),/Haulage per tonne-km/);
  const guidance = { data: [] };
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from('catalogue_item_guidance').select('source,code,guidance')
      .order('source').order('code').range(offset, offset + 999);
    assert.ifError(page.error); guidance.data.push(...page.data);
    if (page.data.length < 1000) break;
  }
  assert.equal(guidance.data.filter(r => r.source === 'SSR').length, 359);
  assert.equal(guidance.data.filter(r => r.source === 'MORTH').length, 923);
  assert.ok(guidance.data.every(row => readCatalogueGuidance(row.guidance)?.source.code === row.code));
  assert.equal(guidance.data.filter(row => row.source === 'MORTH' && row.guidance.descriptionDetail).length, 44,
    'all longer published MoRTH descriptions must be available, not just the short index description');
  assert.ok(guidance.data.every(row => !('rate' in row.guidance)), 'guidance cannot override a price');
  console.log('Live choice guidance passed: 359 SSR + 923 MoRTH; plaster/masonry distinctions, grade/mortar/sort search, source integrity, variants, pagination and raw detail.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
