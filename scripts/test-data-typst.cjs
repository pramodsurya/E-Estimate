const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

const root = path.resolve(__dirname, '..')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) {
    return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  }
  return originalLoad.call(this, request, parent, isMain)
}

function loadTs(filePath, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  loaded.require = (request) => request in mocks ? mocks[request] : Module.createRequire(filePath)(request)
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const documentSettings = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'))
const rateAnalysisMock = {
  calculateBaseRateAnalysis: () => ({
    sectionTotals: { materials: 250, machinery: 0, labour: 100 }, labourBaseCost: 100,
    baseCost: 350, overheadAmount: 49, areaAllowanceAmount: 10, totalCost: 409,
    labourUnitBase: 110, labourUnitProfit: 15.4, labourUnitTotal: 125.4, ratePerUnit: 409
  }),
  calculateRateAnalysis: () => ({
    sectionTotals: { materials: 250, machinery: 0, labour: 100 },
    baseCost: 350, overheadAmount: 49, areaAllowanceAmount: 10, totalCost: 409, ratePerUnit: 409
  }),
  calculateOptionalAddition: () => null,
  labourRowsForDisplay: (recipe) => recipe.storedValues?.labourExtract ?? []
}
const visibilityMock = {
  defaultRateAnalysisLayout: () => ({
    codeVisible: true, descriptionVisible: true, unitQuantityVisible: true,
    sections: { materials: { visible: true }, machinery: { visible: true }, labour: { visible: true } },
    labourSummary: { visible: true }, abstract: { visible: true }, descriptionRuns: []
  }),
  descriptionRunsForDisplay: (text, runs) => runs && runs.length ? runs : [{ text, bold: false, italic: false, underline: false }]
}
const dataPresentation = loadTs(path.join(root, 'src/renderer/src/lib/dataPresentation.ts'), {
  './rateAnalysis': rateAnalysisMock,
  './leadApplicability': { parseLeadInfo: () => ({}), addonLeadRuleForVariant: () => null },
  './rateAnalysisVisibility': visibilityMock
})
const data = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/dataTypst.ts'), {
  '../rateAnalysisVisibility': visibilityMock,
  '../dataPresentation': dataPresentation,
  './documentSettings': documentSettings,
  '../signatureFooter': {
    DATA_SIGNATURE_SCOPE: 'data',
    printableSignatureRows: (settings) => settings.rows,
    resolveSignatureFooter: () => ({ enabled: true, placement: 'subject_end', rows: [] })
  }
})

const recipe = {
  itemKey: 'variant::bund-addon', itemCode: 'IRR-BUND-1', itemSource: 'SSR',
  description: 'Resolved bund add-on DATA', unit: 'cum', outputQuantity: 1,
  overheadPercent: 14, areaAllowancePercent: 10, areaAllowanceLabel: '10%',
  sections: [
    { key: 'materials', lines: [
      { slNo: '1', description: 'Selected stone variant', unit: 'cum', quantity: 2, rate: 125, amount: 250, editedFields: ['rate'], userAdded: false },
      { slNo: '', description: 'grouped continuation row', unit: '', quantity: 0, rate: 0, amount: 0 }
    ] },
    { key: 'machinery', lines: [] },
    { key: 'labour', lines: [{ slNo: '1', description: 'Labour', unit: 'day', quantity: 1, rate: 100, amount: 100 }] }
  ],
  storedValues: {
    sectionTotals: { materials: '250.00', machinery: '0.00', labour: '100.00' },
    labourExtract: [
      { label: 'Labour component per unit', value: '', unit: '', basis: '', percent: '', amount: '110.00' },
      { label: 'Labour component including profit', value: '', unit: '', basis: '', percent: '', amount: '125.40' }
    ],
    abstract: [
      { label: 'A. Cost of Materials', value: '', unit: '', basis: '', percent: '', amount: '250.00' },
      { label: 'D. Add for contractor\'s profit and overheads on (A+B+C)', value: '', unit: '', basis: '', percent: '14%', amount: '49.00' },
      { label: 'Lead Charges for 1 Km for CA', value: '', unit: 'cum @', basis: '2.00', percent: '', amount: '20.00' },
      { label: 'Total cost for', value: '', unit: 'cum', basis: '1.00', percent: '', amount: '409.00' },
      { label: 'Rate per Cum', value: '', unit: '', basis: '(A+B+C+D)/1', percent: '', amount: '409.00' }
    ]
  },
  publishedRateBlocks: [
    { key: 'one', label: 'Rate per Cum', outputQuantity: 1, unit: 'cum', totalCost: 409, rate: 409, primary: true },
    { key: 'two', label: 'Rate per 10 Cum', outputQuantity: 10, unit: 'cum', totalCost: 4090, rate: 409, primary: false }
  ],
  multiRateClassification: { kind: 'type_variants', label: 'Published alternatives', adoptedRate: 409, sourceRates: [409], note: 'Keep published bases separate.' }
}
const sheet = {
  id: 'variant::bund-addon', recipe,
  leadApplications: [{
    id: 'lead-stone', variantId: 'stone-v2', itemCode: 'STONE', quantity: 2, unit: 'cum',
    quantitySource: 'DATA resource quantity: Selected stone variant (2 cum)', grossRate: 20, grossAmount: 40,
    calculation: { rows: [{ label: 'Deduct initial 1 km lead', expression: '20 - 5', amount: -5 }], fullLeadRate: 25, deductedLeadRate: 5, netLeadRate: 20, unit: 'cum' }
  }],
  leadVariants: [{ id: 'stone-v2', materialName: 'Selected Quarry Stone', leadKm: 12.5, liftM: 1.5, handlingMode: 'none', conveyanceClass: 'STONE' }],
  sorPrintRate: null
}
const signature = { enabled: true, placement: 'subject_end', rows: [{ designation: 'Executive Engineer', office: 'Irrigation' }] }
const inputs = data.dataSheetsCompileInputs([sheet], {
  projectName: 'DATA Typst Test', sorYear: '2026-27', pageSize: 'Legal', orientation: 'landscape',
  figurePaths: { [sheet.id]: [{ path: '/test-figure.png', caption: 'Published source figure' }] }, signature
})
const payload = JSON.parse(inputs['ee-data'])
assert.equal(payload.recipes[0].materials[0].description, 'Selected stone variant')
assert.equal(payload.recipes[0].materials[0].edited.rate, true)
assert.equal(payload.recipes[0].materials[1].sl, '', 'grouped continuation rows must keep a blank serial number')
assert.equal(payload.recipes[0].abstract_rows[2].label, 'Lead Charges for 1 Km for CA')
assert.equal(payload.recipes[0].leads[0].material, 'Selected Quarry Stone')
assert.equal(payload.recipes[0].leads[0].deduction.label, 'Rate of Lead after removing 1 km of Initial Lead')
assert.match(payload.recipes[0].leads[0].quantity_source, /DATA resource quantity/)
assert.equal(payload.recipes[0].lead_summary.final_amount_text, '449.00')
assert.equal(payload.recipes[0].figures[0].path, '/test-figure.png')
assert.equal(payload.signature.rows[0].designation, 'Executive Engineer')
assert.equal(payload.setup.paper, 'us-legal')

const project = { projectPrintSettings: { pageSize: 'Legal', orientation: 'landscape' } }
const source = data.resolvedDataTypstSource(project)
const compiler = NodeCompiler.create({ workspace: root })
compiler.mapShadow(path.join(root, 'test-figure.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const pdf = compiler.pdf({ mainFileContent: source, inputs })
const auditApi = loadTs(path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts'))
const audit = auditApi.preparePrintAudit(inputs)
assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: source, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default DATA satisfies current content obligations')
assert(pdf.byteLength > 1000, 'DATA Typst must compile a real PDF')
const qaDir = path.join(root, 'tmp', 'pdfs', 'data-typst')
fs.mkdirSync(qaDir, { recursive: true })
fs.writeFileSync(path.join(qaDir, 'data-nuance-qa.pdf'), pdf)
console.log(`DATA Typst variants, add-ons, figures, signatures and Legal landscape passed (${pdf.byteLength} bytes)`)
