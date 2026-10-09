const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const fixture = require('./fixtures/m25-project-data.json')
const lib = name => path.join(root, 'src/renderer/src/lib', name + '.ts')

function load(file, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file
  })
  const mod = new Module(file, module)
  mod.filename = file
  mod.paths = Module._nodeModulePaths(path.dirname(file))
  mod.require = request => request in mocks ? mocks[request] : require(request)
  mod._compile(outputText, file)
  return mod.exports
}

const rateLinks = load(lib('projectDataRateLinks'))
const defaults = load(lib('projectDataDefaults'), {'./projectDataRateLinks':rateLinks})
const visibility = load(lib('rateAnalysisVisibility'))
const project = { id: 'project-a', meta: { sorYear: '2025-26' }, root: { id: 'root', children: [] } }
const seeded = defaults.ensureBuiltInProjectData(project)
assert.equal(seeded.projectData.length, 1)
assert.equal(seeded.projectData[0].kind, 'ssr')
assert.equal(seeded.projectData[0].code, 'DATA-SOR-001')
assert.equal(seeded.root, project.root, 'available library DATA must not silently create a billed Item')
assert.equal(defaults.ensureBuiltInProjectData(seeded), seeded, 'reopening must not duplicate the default')
const custom = { id: 'custom', kind: 'sor', code: 'DATA-SOR-007', rate: 1 }
const withCustom = defaults.ensureBuiltInProjectData({ ...project, projectData: [custom] })
assert.equal(withCustom.projectData[0], custom)
assert.equal(withCustom.projectData[1].code, 'DATA-SOR-008', 'the default must not collide with existing created DATA')
const other = defaults.ensureBuiltInProjectData({ ...project, id: 'project-b' })
assert.notEqual(other.projectData[0].id, seeded.projectData[0].id)

function sourceRecipe(year) {
  const annual = fixture.years.find(row => row.year === year)
  if (!annual) throw new Error(`No SSR for ${year}`)
  const base = fixture.base
  return {
    itemCode: base.code, itemSource: 'SSR', description: base.description, outputQuantity: Number(base.quantity),
    unit: base.unit, year, overheadPercent: Number(annual.abstract.find(row => /overhead/i.test(row.label)).percent.replace('%', '')),
    leadApplicability: base.lead_applicability, seigniorageApplicability: base.seigniorage_applicability,
    unresolvedLines: 0,
    sections: ['materials','machinery','labour'].map(key => ({ key, label: key,
      lines: annual.rates[key].map((row, index) => {
        const original = base[key][index]
        return { id: `${key}-${index}`, slNo: row.sl ?? '', description: row.desc, unit: row.unit,
          quantity: Number(row.quantity), rate: Number(row.rate), amount: Number(row.amount),
          resourceIdentity: original.resource_identity && {
            sourceTable: original.resource_identity.source_table, masterCode: original.resource_identity.master_code,
            resourceKey: original.resource_identity.resource_key, rateComponent: original.resource_identity.rate_component
          }, sorRef: original.sor_ref, sourceValues: { quantity: row.quantity, rate: row.rate, amount: row.amount } }
      })
    }))
  }
}
let missingResource = false
const calls = []
const supabase = { from(table) {
  let year, codes, column
  const query = { select(){return query},eq(key,value){if(key === 'sor_year') year=value;else {column=key;codes=[value]} return query},in(key,value){column=key;codes=value;return query},
    maybeSingle(){return query.then(value=>({data:value.data?.[0]??null}))},
    then(resolve,reject) {
      const rows = (table === 'labour_rate' ? fixture.labour : fixture.machinery)
        .filter(row => row.sor_year === year && codes.includes(row[column]))
      return Promise.resolve({ data: missingResource ? [] : rows }).then(resolve,reject)
    } }
  return query
} }
const nativeCalculator = path.join(root, 'src-tauri/target/debug', process.platform === 'win32' ? 'rate_analysis_cli.exe' : 'rate_analysis_cli')
function runNative(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', value => { stdout += value })
    child.stderr.on('data', value => { stderr += value })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Native calculator exited ${code}`)))
    child.stdin.end(input)
  })
}
const analysis = load(lib('rateAnalysis'), {
  './supabase': { supabase },
  './dataVariants': { applyDataVariantToRecipe: recipe => recipe, buildDataVariantSpec: () => ({}) },
  './pipeLead': { pipeLeadSourceFromContext: () => undefined },
  './sorReviewed': {}, './reviewedSorEstimate': {},
  './materialRates': { applyMaterialRateOverrides: recipe => ({ recipe, applications: [] }),
    fetchMaterialAliases: async () => new Map(), fetchMonthlyMaterials: async () => [] },
  './projectItems': { projectItemKey: () => 'test' },
  './rateAnalysisVisibility': visibility,
  './seigniorageClassification': { canonicalSeigniorageCode: code => code },
  './sorCatalogue': { SOR_CATALOGUE_CATEGORY: 'sor_catalogue', fetchSorCataloguePrice: async () => [],
    sorCommercialTerms: () => undefined, sourceContextTitle: () => null }
})
global.window = { api: { rateAnalysis: {
  calculate: async recipe => JSON.parse(await runNative(nativeCalculator, [], JSON.stringify(recipe))),
  calculateBase: async recipe => JSON.parse(await runNative(nativeCalculator, ['--base'], JSON.stringify(recipe)))
} } }
const engine = { fetchRateAnalysis: async (node, year, options) => {
  calls.push({ code: node.itemCode, year, zone: options.zone })
  return node.itemCode === defaults.M25_WEARING_MIX_CODE
    ? { description: fixture.mix.description } : sourceRecipe(year)
}, recalculateRateAnalysis: analysis.recalculateRateAnalysis }
const builtin = load(lib('builtInProjectData'), {
  './rateAnalysis': engine, './projectDataDefaults': defaults, './supabase': { supabase },
  './leadApplicability': { parseLeadInfo: value => ({ materials: value.materials }) }
})
const timely = load(lib('projectDataTimelyRates'), {
  './rateAnalysis':engine,'./builtInProjectData':builtin,'./projectDataDefaults':defaults,
  './projectDataRateLinks':rateLinks,'./supabase':{supabase}
})
const projectData = load(lib('projectData'), {
  './rateAnalysis': engine, './builtInProjectData': builtin,
  './projectDataRateLinks':rateLinks,'./projectDataTimelyRates':timely,
  './rateAnalysisVisibility': visibility,
  './projectItems': { projectItemKey: node => 'PROJECT_DATA:' + node.projectDataId },
  './materialRates': { applyMaterialRateOverrides: recipe => ({ recipe, applications: [] }),
    fetchMaterialAliases: async () => new Map(), fetchMonthlyMaterials: async () => [] }
})
const documentSettings = load(lib('typist-output/documentSettings'))
const presentation = load(lib('dataPresentation'), {
  './rateAnalysis': analysis, './rateAnalysisVisibility': visibility,
  './leadApplicability': { parseLeadInfo: () => ({}), addonLeadRuleForVariant: () => null }
})
const typst = load(lib('typist-output/dataTypst'), {
  './data.typ?raw': fs.readFileSync(path.join(root,'src/renderer/src/lib/typist-output/data.typ'),'utf8'),
  '../rateAnalysisVisibility': visibility, '../dataPresentation': presentation,
  './documentSettings': documentSettings,
  '../signatureFooter': { DATA_SIGNATURE_SCOPE: 'data', printableSignatureRows: () => [],
    resolveSignatureFooter: () => ({ enabled: false, placement: 'subject_end', rows: [] }) }
})
const excel = load(lib('excel-output/dataExcel'), {
  '../typist-output/dataTypst': typst, '../dataSheets': { calculateDataSheets: async sheets => sheets },
  './excelDocumentSettings': {}, './excelSignature': { excelSignatureSettings: () => ({ rows: [] }) }
})
const material = (def, pattern) => def.sections.find(section => section.key === 'materials').lines.find(line => pattern.test(line.description))
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`)

async function main() {
  if (!fs.existsSync(nativeCalculator)) {
    await runNative('cargo', ['build', '--manifest-path', path.join(root, 'src-tauri/estimate-core/Cargo.toml'), '--bin', 'rate_analysis_cli'])
  }
  assert.ok(Number.isNaN(projectData.projectDataRate(seeded.projectData[0])), 'unpriced default must never show a zero rate')
  await assert.rejects(() => builtin.resolveBuiltInProjectData(seeded.projectData[0], '', 'zone_3'), /Select.*year/)
  const first = await builtin.resolveBuiltInProjectData(seeded.projectData[0], '2025-26', 'zone_3')
  assert.ok(defaults.projectDataRatesReady(first, '2025-26', 'zone_3'))
  assert.equal(first.id, seeded.projectData[0].id)
  assert.equal(first.outputQuantity, 15.76)
  close(material(first, /^Cement for mix/).quantity, 5988.8)
  close(material(first, /^Super Plastic/).quantity, 23.9552)
  close(material(first, /^Coarse aggregate 20/).quantity + material(first, /^Coarse aggregate 10/).quantity, .8 * 15.76)
  assert.match(first.description, /M-25/)
  assert.match(first.description, /25 N/)
  assert.equal(first.builtIn.sourceLeadApplicability.builtin.initial_lead_m, 50)
  assert.equal(projectData.projectDataLeadApplicability(first).builtin.initial_lead_m, 50)
  assert.equal(first.sections.flatMap(section => section.lines).length, 25)
  const beforeRate = projectData.projectDataRate(first)
  const beforeQuantities = first.sections.map(section => section.lines.map(line => [line.id,line.quantity]))
  const next = await builtin.resolveBuiltInProjectData(first, '2026-27', 'zone_3')
  assert.notEqual(projectData.projectDataRate(next), beforeRate, 'new year must change the derived M25 rate')
  assert.deepEqual(next.sections.map(section => section.lines.map(line => [line.id,line.quantity])), beforeQuantities)
  const newCement = fixture.years.find(row => row.year === '2026-27').rates.materials[0]
  assert.equal(material(next, /^Cement for mix/).rate, Number(newCement.rate), 'use annual SSR input price, not the original finished-work rate')
  assert.equal(next.builtIn.quantitySourceYear, '2025-26')
  assert.ok(calls.some(call => call.year === '2025-26'))
  assert.ok(calls.some(call => call.year === '2026-27'))

  const zone1 = await builtin.resolveBuiltInProjectData(next, '2026-27', 'zone_1')
  const mixerCrew = def => def.sections.find(section => section.key === 'labour').lines.find(line => line.description === 'Crew for Concrete mixer')
  assert.equal(mixerCrew(zone1).rate, 417.3)
  assert.equal(mixerCrew(next).rate, 375.7)
  assert.notEqual(projectData.projectDataRate(zone1), projectData.projectDataRate(next))
  assert.ok(!defaults.projectDataRatesReady(zone1, '2026-27', 'zone_3'))

  const edited = structuredClone(first)
  edited.description = 'My wearing coat analysis'
  material(edited, /^Cement for mix/).quantity = 6000
  material(edited, /^Cement for mix/).editedFields = ['quantity']
  material(edited, /^Super Plastic/).rate = 123
  material(edited, /^Super Plastic/).editedFields = ['rate']
  edited.overheadPercent = 10
  edited.sections[0].lines.pop() // deliberate deletion stays deleted
  const editedNext = await builtin.resolveBuiltInProjectData(edited, '2026-27', 'zone_3')
  assert.equal(editedNext.description, edited.description)
  assert.equal(material(editedNext, /^Cement for mix/).quantity, 6000)
  assert.equal(material(editedNext, /^Cement for mix/).rate, Number(newCement.rate))
  assert.equal(material(editedNext, /^Super Plastic/).rate, 123)
  assert.equal(editedNext.overheadPercent, 10)
  assert.equal(editedNext.sections[0].lines.length, edited.sections[0].lines.length)

  const reorderedSource = sourceRecipe('2026-27')
  reorderedSource.sections[0].lines.reverse()
  reorderedSource.sections[0].lines.find(line => line.resourceIdentity.resourceKey === material(first, /^Fine aggregate/).ssrRateLink.resourceIdentity.resourceKey).description = 'Fine aggregate renamed'
  const reordered = builtin.mergeBuiltInSsrRates(first, reorderedSource, undefined, 'zone_3')
  assert.equal(material(reordered, /^Fine aggregate/).quantity, material(first, /^Fine aggregate/).quantity)
  const missingRow = sourceRecipe('2026-27')
  missingRow.sections[0].lines.shift()
  assert.throws(() => builtin.mergeBuiltInSsrRates(first, missingRow, undefined, 'zone_3'), /Cannot match/)
  assert.throws(() => builtin.m25WearingMix('M25 wearing coat with no mix data'), /Missing/)
  assert.throws(() => builtin.mergeBuiltInSsrRates(first, { ...reorderedSource, unresolvedLines: 1 }, undefined, 'zone_3'), /missing rates/)
  await assert.rejects(() => builtin.resolveBuiltInProjectData(first, '2099-00', 'zone_3'), /No SSR/)
  missingResource = true
  await assert.rejects(() => builtin.resolveBuiltInProjectData(first, '2026-27', 'zone_3'), /No 2026-27 rate/)
  missingResource = false

  const node = { id: 'usage', itemSource: 'PROJECT_DATA', projectDataId: first.id }
  const recipe = await projectData.projectDataRecipe(first, node, '2026-27', 'zone_3')
  assert.equal(recipe.itemSource, 'SSR')
  assert.equal(recipe.categoryKey, 'project_data')
  assert.equal(recipe.year, '2026-27')
  assert.equal(recipe.outputQuantity, first.outputQuantity)
  assert.equal(recipe.sections[0].lines[0].rate, Number(newCement.rate))
  assert.equal(recipe.sections[0].lines[0].amount, Math.round(recipe.sections[0].lines[0].quantity * Number(newCement.rate) * 100) / 100)
  assert.equal(recipe.publishedRate, projectData.projectDataRate(next))
  assert.ok(recipe.sections.every(section => section.lines.every(line => line.sourceValues === undefined)), 'M20 printed amounts must not override the new M25 quantity × rate')
  assert.equal(recipe.storedValues, undefined, 'created DATA must not retain an empty published abstract that prices it at zero')
  assert.ok(recipe.recalculation.abstract.length > 0, 'created DATA needs a derived print abstract')
  assert.ok(recipe.recalculation.labourExtract.length > 0, 'created DATA needs a derived labour extract')
  assert.equal(Number(recipe.recalculation.calculatedRate), projectData.projectDataRate(next))
  const summary = await analysis.calculateRateAnalysis(recipe)
  assert.ok(summary.ratePerUnit > 0, 'native unit rate must not silently become zero')
  assert.equal(summary.ratePerUnit, projectData.projectDataRate(next))
  assert.ok(summary.labourUnitBase > 0)
  const outputProject = { meta: { name: 'Built-in M25 wearing-coat DATA', sorYear: '2026-27', sorZone: 'zone_3' } }
  const sheets = [{ id: node.id, recipe, calculatedSummary: summary, leadApplications: [], leadVariants: [] }]
  const excelPayload = excel.buildDataExcelPayload(outputProject,sheets)
  const pdfInputs = typst.dataSheetsCompileInputs(sheets,{projectName:outputProject.meta.name,sorYear:'2026-27',sorZone:'zone_3'})
  const pdfPayload = JSON.parse(pdfInputs['ee-data'])
  for (const payload of [excelPayload,pdfPayload]) {
    assert.equal(Math.round(payload.recipes[0].totals.rate_per_unit * 100) / 100,summary.ratePerUnit)
    assert.equal(payload.recipes[0].abstract_rows.at(-1).amount,summary.ratePerUnit.toFixed(2), 'Excel and PDF must print the native calculated rate')
    assert.equal(payload.recipes[0].materials[0].quantity,5988.8)
  }
  assert.deepEqual(first.sections[0].lines[0].editedFields, [], 'calculation flags must not mutate the editable definition or lock its annual rates')
  const clonedCustom = structuredClone(first)
  delete clonedCustom.builtIn
  clonedCustom.sections[0].lines[0].sourceValues = { quantity: '5200.80', rate: '0', amount: '0' }
  const customRecipe = await projectData.projectDataRecipe(clonedCustom,node,'2025-26','zone_3')
  assert.equal((await analysis.calculateRateAnalysis(customRecipe)).ratePerUnit, beforeRate, 'ordinary created SSR DATA must also derive totals instead of adopting stale cloned amounts')
  for (const [definition, year, zone] of [
    [first,'2025-26','zone_3'], [zone1,'2026-27','zone_1'], [editedNext,'2026-27','zone_3']
  ]) {
    const data = await projectData.projectDataRecipe(definition,node,year,zone)
    const native = await analysis.calculateRateAnalysis(data)
    assert.equal(native.ratePerUnit, projectData.projectDataRate(definition), `${year} ${zone}: display, abstract and native estimate rates must agree`)
    assert.equal(Number(data.recalculation.abstract.at(-1).amount), native.ratePerUnit)
    assert.equal(data.recalculation.warnings.length, 0)
  }
  const allowanceData = await projectData.projectDataRecipe(next,node,'2026-27','zone_3',undefined,{percent:10,label:'Test area'})
  const allowanceSummary = await analysis.calculateRateAnalysis(allowanceData)
  assert.ok(allowanceSummary.ratePerUnit > summary.ratePerUnit, 'area allowance must reach the derived abstract and native estimate')
  assert.equal(allowanceSummary.areaAllowanceAmount, Math.round(summary.labourBaseCost * 10) / 100)
  // Optional native fixtures let environments with restricted Node subprocesses
  // run the same recipe through rate_analysis_cli directly from their shell.
  if (process.env.EESTIMATE_M25_NATIVE_CASES) {
    const directory = process.env.EESTIMATE_M25_NATIVE_CASES
    fs.mkdirSync(directory, { recursive: true })
    const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
    const pdf = NodeCompiler.create({workspace:root}).pdf({mainFileContent:typst.resolvedDataTypstSource(outputProject),inputs:pdfInputs})
    assert.ok(pdf.byteLength > 1000)
    fs.writeFileSync(path.join(directory,'M25-wearing-coat.pdf'),pdf)
    for (const [name, definition, year, zone] of [
      ['2025-26',first,'2025-26','zone_3'], ['2026-27',next,'2026-27','zone_3'],
      ['2026-27-zone1',zone1,'2026-27','zone_1'], ['2026-27-edited',editedNext,'2026-27','zone_3']
    ]) {
      const data = await projectData.projectDataRecipe(definition,node,year,zone)
      fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify(data,null,2))
    }
  }
  console.log('Built-in M25 DATA: default availability, two real catalogue years, zones, preserved edits, safe failures and normal SSR recipe flow passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
