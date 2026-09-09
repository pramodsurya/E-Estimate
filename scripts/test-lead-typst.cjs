const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

// Vite raw template imports in Node's standalone regression runner.
const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')
const file = path.join(root, 'src/renderer/src/lib/typist-output/leadTypst.ts')

function loadTsModule(filePath, mocks) {
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

const documentSettings = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'), {})
const leadPrintLayout = loadTsModule(path.join(root, 'src/renderer/src/lib/leadPrintLayout.ts'), {})
const leadMapGeometry = loadTsModule(path.join(root, 'src/renderer/src/lib/leadMapGeometry.ts'), {
  './printRender': { PX_PER_MM: 96 / 25.4 }
})

const dataTypst = {
  escapeTypst: (v) => String(v ?? ''),
  fmtMoney: (v) => (v == null ? '—' : Number(v).toFixed(2)),
  fmtQty: (v) => (v == null ? '—' : Number(v).toFixed(2))
}
const leadSourceChart = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/leadSourceChart.ts'), {
  './dataTypst': dataTypst,
  '../leadApplicability': { isDisposalLeadMaterial: () => false }
})

const {
  resolvedLeadTypstSource,
  leadCompileInputs,
  leadCompileSource,
  buildLeadRenderData,
  resolveLeadMaterialPrintName,
  leadTypstTemplate,
  LEAD_TABLE_PRELUDE,
  routeLabelForVariant
} = loadTsModule(file, {
  './dataTypst': dataTypst,
  './documentSettings': documentSettings,
  './leadSourceChart': leadSourceChart,
  '../signatureFooter': {
    LEAD_SIGNATURE_SCOPE: 'lead',
    resolveSignatureFooter: (project) => project.signatureFooter
  },
  '../leadPrintLayout': leadPrintLayout,
  '../leadMapGeometry': leadMapGeometry
})

const entries = [
  {
    variantId: 'v1',
    variantName: 'Sand - Quarry A',
    materialName: 'Sand for Mortar',
    conveyanceClass: 'Mechanical Transit',
    leadKm: 15.0,
    liftM: 0,
    variantRate: 185.5,
    rateUnit: 'cum',
    applications: [{ applicationId: 'app-1', itemCode: 'IRR-1', appliedPath: 'Earth Work' }],
    breakdown: [
      { label: 'Initial 1st Km', expression: 'Flat rate', amount: 45.0 },
      { label: 'Next 4 Km (2 to 5 Km)', expression: '4 × 20.00', amount: 80.0 },
      { label: 'Beyond 5 Km (6 to 15 Km)', expression: '10 × 6.05', amount: 60.5 }
    ]
  },
  {
    variantId: 'v2',
    variantName: 'Rough Stone - Quarry B',
    materialName: 'Rough Stone / Boulders',
    conveyanceClass: 'Head Load',
    leadKm: 0.5,
    liftM: 2.0,
    variantRate: 75.0,
    rateUnit: 'cum',
    applications: [{ applicationId: 'app-2', itemCode: 'IRR-2', appliedPath: 'Masonry' }],
    breakdown: [
      { label: 'Head load up to 50m', expression: 'Initial', amount: 50.0 },
      { label: 'Lift beyond 1.5m', expression: '2.0m lift', amount: 25.0 }
    ]
  }
]

const project = {
  id: 'proj-1',
  meta: { name: 'Tank Restoration Project', sorYear: '2025-26' },
  root: { name: 'Root' },
  leadPrintOverrides: {
    title: 'CUSTOM LEAD STATEMENT',
    subtitle: 'Conveyance Charges for Tank Restoration',
    notes: 'Rates adopted as per Board of Chief Engineers G.O.Ms.No. 45.',
    variantNames: {
      v1: 'River Sand from Godavari Quarry'
    }
  },
  signatureFooter: {
    enabled: true,
    rows: [
      { designation: 'Assistant Engineer', office: 'Sub-Division 1' },
      { designation: 'Executive Engineer', office: 'Irrigation Division' }
    ]
  }
}

// 1. Check resolveLeadMaterialPrintName
assert.equal(
  resolveLeadMaterialPrintName(project, entries[0]),
  'River Sand from Godavari Quarry'
)
assert.equal(
  resolveLeadMaterialPrintName(project, entries[1]),
  'Rough Stone - Quarry B'
)

// 2. Build render data
const data = buildLeadRenderData(project, entries)
assert.equal(data.title, 'CUSTOM LEAD STATEMENT')
assert.equal(data.subtitle, 'Conveyance Charges for Tank Restoration')
assert.equal(data.notes, 'Rates adopted as per Board of Chief Engineers G.O.Ms.No. 45.')
assert.equal(data.rows[0].name, 'River Sand from Godavari Quarry')
assert.equal(data.rows[1].name, 'Rough Stone - Quarry B')
assert.equal(data.signature.length, 2)
assert.equal(data.map.available, false)
assert.equal(data.map.path, 'images/lead-route-map.png')
assert.equal(data.charts.length, 0)

// 3. Compile with Typst WASM NodeCompiler
const inputs = leadCompileInputs(project, entries)
const source = resolvedLeadTypstSource(project, entries)
assert(source.includes('Lead.map.at("available"'), 'Default Lead template binds the route map variable')

const compiler = NodeCompiler.create({ workspace: root })
const svg = compiler.svg({ mainFileContent: source, inputs })
assert(svg.length > 0, 'SVG rendered')
const text = svg.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
assert(text.includes('LEAD STATEMENT') && text.includes('CONVEYANCE CHARGES'), 'Literal title in SVG')
assert(text.includes('River Sand from Godavari Quarry'), 'Custom variant name in SVG')
assert(text.includes('Rough Stone - Quarry B'), 'Second variant in SVG')
assert(text.includes('Assistant Engineer'), 'Signatory designation in SVG')
assert(text.includes('Calculation Step / Slab'), 'Section B table header in SVG')
assert(text.includes('Adopted Rate per'), 'Adopted rate label in SVG')

const pdf = compiler.pdf({ mainFileContent: source, inputs })
const auditApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts'), {})
const audit = auditApi.preparePrintAudit(inputs)
assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: source, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default Lead satisfies current content obligations')
assert(pdf.length > 4000, 'PDF rendered')

console.log(`Lead Typst runtime-input: all assertions passed (${pdf.length} bytes PDF compiled)`)

// Compile the exact prelude + default combination used by preview callers.
assert(compiler.pdf({ mainFileContent: LEAD_TABLE_PRELUDE + leadTypstTemplate(), inputs }).length > 4000)
assert(compiler.pdf({ mainFileContent: LEAD_TABLE_PRELUDE + source, inputs }).length > 4000)
const savedProject = {
  ...project,
  printStudioDocuments: { 'lead-statement': '#let EE = json(bytes(sys.inputs.at("ee-data")))\n= Saved custom layout\n#EE.rows.first().name' }
}
const savedSource = resolvedLeadTypstSource(savedProject, entries)
assert(savedSource.includes('Saved custom layout'), 'Saved layout survives output consolidation')
assert(!savedSource.includes('== A. Summary'), 'Default does not replace a saved template')
assert(compiler.pdf({ mainFileContent: LEAD_TABLE_PRELUDE + savedSource, inputs }).length > 4000)
const leadOnlySource = '= AI layout\n#Lead.project\n#for material in Lead.materials [#material.summary.name #linebreak()]'
assert(
  compiler.pdf({ mainFileContent: leadCompileSource(leadOnlySource), inputs }).length > 4000,
  'a saved layout that references Lead without declaring it receives the app runtime binding'
)
assert.equal((leadCompileSource(leadTypstTemplate()).match(/#let Lead\s*=/g) ?? []).length, 1, 'default source never receives a duplicate Lead binding')
assert.equal(routeLabelForVariant({ startPointId: 'q', viaPointIds: ['v'] }, [], [
  { id: 'q', name: 'Quarry' }, { id: 'v', name: 'Junction' }
], { label: 'Site' }), 'Quarry → Junction → Site')
console.log('Lead default, saved layout, compiler prelude and route checks passed')

// A custom layout stays byte-for-byte intact while fresh inputs add new materials.
const customLayout = '#let EE = json(bytes(sys.inputs.at("ee-data")))\n= My AI layout\n#for row in EE.rows [#row.name #linebreak()]'
const customProject = { ...project, printStudioDocuments: { 'lead-statement': customLayout } }
const newEntries = [...entries, { ...entries[1], variantId: 'v3', variantName: 'New gravel material' }]
assert.equal(resolvedLeadTypstSource(customProject, newEntries), customLayout)
const mapCustom = `${customLayout}\n#if Lead.map.available [\n  #pagebreak()\n  // E-Estimate lead map page: begin\n  custom map block\n  // E-Estimate lead map page: end\n]`
const mapCustomProject = { ...project, printStudioDocuments: { 'lead-statement': mapCustom } }
assert.equal(resolvedLeadTypstSource(mapCustomProject, entries), mapCustom, 'Saved map block is not rewritten on reopen')
const refreshedSvg = compiler.svg({
  mainFileContent: LEAD_TABLE_PRELUDE + customLayout,
  inputs: leadCompileInputs(customProject, newEntries)
})
const refreshedText = refreshedSvg.replace(/<[^>]*>/g, '')
assert(refreshedText.includes('My AI layout'))
assert(refreshedText.includes('New gravel material'), 'New material renders through the existing custom loop')
console.log('Custom layout preserved exactly; new material rendered from updated inputs')

const engine = loadTsModule(path.join(root, 'src/renderer/src/lib/lead.ts'), { './supabase': { supabase: {} } })
const rate = (charge_code, slab_key, value) => ({
  charge_code, slab_key, rate: value, year: '2025-26', column_key: 'EARTH',
  applies_to: ['EARTH'], unit: 'cum', basis: 'cumulative_total'
})
const rates = [
  rate('COM-LDLFT-2', 'upto_5km', 119.70),
  rate('COM-LDLFT-2', 'per_km_5_30', 18),
  rate('COM-LDLFT-2', 'per_km_beyond_30', 15),
  rate('COM-LDLFT-4', 'loading', 30),
  rate('COM-LDLFT-4', 'unloading', 41.90),
  rate('COM-LDLFT-6', 'per_1m_beyond_3m', 5)
]
function detailedEntry(liftM, reachesFinalPoint = false, handlingMode = 'manual_with_idle') {
  const chargeBreakdown = engine.calculateLeadVariantChargeFromRows(rates, {
    year: '2025-26', conveyanceClass: 'EARTH', distanceKm: 30, quantity: 1,
    handlingMode, includedBasis: 'none', liftM,
    includedInitialLiftM: 3, mechanicalConveyanceReachesFinalPoint: reachesFinalPoint
  })
  return { ...entries[0], liftM, leadKm: 30, chargeBreakdown,
    breakdown: chargeBreakdown.calculation.rows, variantRate: chargeBreakdown.grossRate }
}
const fullEntry = detailedEntry(0)
const fullData = buildLeadRenderData(project, [fullEntry]).breakdowns[0]
assert.equal(fullData.material_rate, '569.70')
assert.equal(fullData.rate, '641.60')
assert.equal(fullData.steps[1].quantity, 25)
assert.equal(fullData.steps[1].unit_rate, 18)
assert.equal(fullData.steps[1].amount_value, 450)
const lifted = buildLeadRenderData(project, [detailedEntry(6)]).breakdowns[0]
assert.equal(lifted.charged_lift_m, 3)
assert.equal(lifted.lift_unit_rate, 5)
assert.equal(lifted.calculation.liftRate, 15)
assert.equal(lifted.rate, '656.60')
assert.equal(buildLeadRenderData(project, [detailedEntry(6, true)]).breakdowns[0].charged_lift_m, 0)
const detailedSource = resolvedLeadTypstSource(project, [fullEntry])
assert(!detailedSource.includes('#EE.title') && !detailedSource.includes('#EE.subtitle'))
const fullSvg = compiler.svg({ mainFileContent: detailedSource, inputs: leadCompileInputs(project, [fullEntry, detailedEntry(6)]) })
for (const value of ['Material lead rate', 'With handling/lift', '569.70', '641.60', '656.60', 'Loading', 'Unloading']) {
  assert(fullSvg.replace(/<[^>]*>/g, '').includes(value), value + ' appears in actual Typst output')
}
assert(compiler.pdf({ mainFileContent: detailedSource, inputs: leadCompileInputs(project, [fullEntry, detailedEntry(6)]) }).length > 4000)
console.log('Detailed Lead output: slab operands, handling, lift rules and literal headings passed')

// The same complete template hides optional rows without regenerating its code.
function renderedCalculation(entry) {
  return compiler.svg({ mainFileContent: detailedSource, inputs: leadCompileInputs(project, [entry]) }).replace(/<[^>]*>/g, '')
}
const noExtras = renderedCalculation(detailedEntry(0, false, 'none'))
assert(!noExtras.includes('Loading') && !noExtras.includes('Unloading'))
assert(!noExtras.includes('chargeable') && !noExtras.includes('With handling/lift'))
assert(noExtras.includes('Material lead rate'))
const handlingOnly = renderedCalculation(detailedEntry(0))
assert(handlingOnly.includes('Loading') && handlingOnly.includes('Unloading'))
assert(!handlingOnly.includes('chargeable'))
const liftOnly = renderedCalculation(detailedEntry(6, false, 'none'))
assert(liftOnly.includes('chargeable') && liftOnly.includes('With handling/lift'))
assert(!liftOnly.includes('Loading') && !liftOnly.includes('Unloading'))
console.log('One template conditionally renders no extras, handling only, and lift only')

const chartProject = {
  ...project,
  leadChart: {
    variants: [{ id: 'v1', materialName: 'Sand for Mortar', handlingMode: 'none', leadKm: 15, liftM: 0, conveyanceClass: 'EARTH' }]
  },
  dashboardSnapshot: {
    leadRates: [
      { charge_code: 'COM-LDLFT-2', slab_key: 'upto_5km', column_key: 'EARTH', slab_label: 'Upto 5 km', rate: 119.7 },
      { charge_code: 'COM-LDLFT-2', slab_key: 'per_km_5_30', column_key: 'EARTH', slab_label: 'Per km 5 to 30 km', rate: 18 }
    ]
  }
}
const chartEntries = [{ ...entries[0], conveyanceClass: 'EARTH' }]
const chartData = buildLeadRenderData(chartProject, chartEntries)
assert.equal(chartData.charts.length, 1)
assert.equal(chartData.charts[0].code, 'COM-LDLFT-2')
const chartSvg = compiler.svg({
  mainFileContent: leadTypstTemplate(),
  inputs: leadCompileInputs(chartProject, chartEntries)
}).replace(/<[^>]*>/g, '')
assert(chartSvg.includes('Lead Chart'), 'Source chart heading appears')
assert(chartSvg.includes('COM-LDLFT-2'), 'Charge code appears in source chart')
assert(chartSvg.includes('119.70'), 'Chart rate appears')
console.log('Lead source chart tables compiled into Typst output')
