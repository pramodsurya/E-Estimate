const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  })
  const loadedModule = new Module(filePath, module)
  loadedModule.filename = filePath
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  loadedModule.require = (request) => request in mocks ? mocks[request] : require(request)
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const { buildDataVariantSpec, applyDataVariantToRecipe } = loadTsModule(
  path.join(root, 'src/renderer/src/lib/dataVariants.ts'),
  { './supabase': { supabase: {} } }
)

function recipe(overrides = {}) {
  return {
    schemaVersion: 1,
    itemKey: 'test',
    itemSource: 'SSR',
    categoryKey: 'ssr_item',
    itemCode: 'TEST',
    description: 'Test DATA',
    unit: 'TONNE',
    outputQuantity: 15.44,
    year: '2026-27',
    overheadPercent: 13.615,
    sections: [],
    publishedRate: 58231.1,
    publishedRateBlocks: [
      {
        key: 'weight', label: 'Rate per tonne wt', outputQuantity: 15.44,
        unit: 'tonne wt', totalCost: 5240801.94, rate: 339430.2,
        abstractEndIndex: 1, primary: false
      },
      {
        key: 'capacity', label: 'Rate per tonne capacity of hoist', outputQuantity: 90,
        unit: 't capacity', totalCost: 5240801.94, rate: 58231.1,
        abstractEndIndex: 2, primary: true
      }
    ],
    ...overrides
  }
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-GAW-1-3',
    year: '2026-27',
    baseRate: 58231.1,
    rateStructure: { multi_rate_classification: 'dual_measurement_basis' },
    rateValues: [
      { label: 'Rate per tonne wt', value: 339430.2 },
      { label: 'Rate per tonne capacity of hoist', value: 58231.1 }
    ],
    abstract: [
      { label: 'Total cost for', basis: '15.440', unit: 'tonne wt', amount: '5240801.94' },
      { label: '', basis: '90.00', unit: 't capacity', amount: '' }
    ]
  })
  assert.equal(spec.classification, 'dual_measurement_basis')
  assert.equal(spec.requiresSelection, false)
  const prepared = applyDataVariantToRecipe(recipe(), spec, undefined)
  assert.equal(prepared.outputQuantity, 90)
  assert.equal(prepared.unit, 't capacity')
  assert.equal(prepared.publishedRate, 58231.1)
  assert.equal(prepared.multiRateClassification.sourceQuantity, 15.44)
}

const dawStages = [
  ['Upto 6 m from surface', 'Beyond 6 m upto 12 m from surface', '28.59', '314.50'],
  ['For 6 m to 12 m from surface', 'Beyond 12 m upto 18 m from surface', '31.45', '346.00'],
  ['For 12 m to 18 m from surface', 'Beyond 18 m upto 24 m from surface', '34.60', '380.60'],
  ['For 18 m to 24 m from surface', 'Beyond 24 m upto 30 m from surface', '38.06', '418.70'],
  ['For 24 m to 30 m from surface', 'Beyond 30 m upto 36 m from surface', '41.87', '460.60'],
  ['For 30 m to 36 m from surface', 'Beyond 36 m upto 42 m from surface', '46.06', '506.70']
]
const dawAbstract = [
  { label: 'A. Cost of Materials', amount: '8664.22' },
  { label: 'B. Hire charges of Machinery', amount: '8230.00' },
  { label: 'C. Cost of Labour', amount: '7265.20' },
  { label: '', unit: 'Total', amount: '24159.42' },
  { label: "D. Add for contractor's profit and overheads", amount: '3289.31' },
  { label: 'Total cost for', basis: '96.00', unit: 'Rm', amount: '27448.73' },
  { label: 'Rate per Rm', basis: '(A+B+C+D)/96', amount: '285.90' },
  { label: 'Upto 6 m from surface', amount: '285.90' },
  ...dawStages.flatMap(([prior, result, addition, rate]) => [
    { label: `${result} :`, amount: '' },
    { label: prior, basis: 'Rate per', unit: 'Rm', amount: prior.startsWith('Upto') ? '285.90' : '' },
    { label: 'Add for redrilling through partially set grout / additional', amount: '' },
    { label: 'extension rods / reduction in rate of drilling etc @', unit: '10%', percent: '10%', amount: addition },
    { label: result, unit: 'Rate / Rm', amount: rate }
  ])
].map((row) => ({ value: '', unit: '', basis: '', percent: '', ...row }))

{
  const spec = buildDataVariantSpec({
    code: 'IRR-CAW-8-1',
    year: '2026-27',
    baseRate: 330.1,
    rateStructure: {
      multi_rate_classification: 'optional_addition',
      optional_addition_label: 'Add 15 cm thick murum bed below pitching'
    },
    rateValues: [
      { label: 'Base rate', value: 330.1 },
      { label: 'Murum bed', value: 92.9 }
    ],
    abstract: [
      { label: 'A. Cost of Materials', amount: '20977.75' },
      { label: 'B. Hire charges of Machinery', amount: '0.00' },
      { label: 'C. Cost of Labour', amount: '8080.00' },
      { label: '', unit: 'Total', amount: '29057.75' },
      { label: "D. Add for contractor's profit and overheads on (A+B+C)", unit: '13.615%', amount: '3956.21' },
      { label: 'Total cost for', basis: '100.00', unit: 'sqm', amount: '33013.96' },
      { label: 'Rate per sqm', basis: '(A+B+C+D)/100.0', amount: '330.10' },
      { label: 'Note: If 15 cm thick murum bed is to be provided below', basis: 'pitching' },
      { label: '(Murum : 0.18 cum/sqm)' },
      { label: 'RATE ANALYSIS', unit: 'UNIT :', amount: 'sqm' },
      { label: 'A. MATERIALS:' },
      { label: '1 Murum', basis: 'cum', unit: '18.00', amount: '5634.00' },
      { label: 'Total cost of Materials', amount: '5634.00' },
      { label: 'B. MACHINERY:' },
      { label: '1 Nill', unit: '0.00', amount: '0.00' },
      { label: 'Total hire charges of Machinery', amount: '0.00' },
      { label: 'C. LABOUR:' },
      { label: '1 mazdoor', basis: 'Day', unit: '4.00', amount: '2540.00' },
      { label: 'Total cost of Labour', amount: '2540.00' },
      { label: "D. Add for contractor's profit and overheads on (A+B+C)", percent: '13.615%', amount: '1112.89' },
      { label: 'Total cost for', basis: '100.00', unit: 'sqm', amount: '9286.89' },
      { label: 'Rate per sqm', basis: '(A+B+C+D)/100.0', amount: '92.90' }
    ]
  })
  assert.equal(spec.kind, 'optional_addition')
  assert.equal(spec.options[0].rate, 330.1)
  assert.equal(spec.options[1].rate, 423)
  assert.deepEqual(
    spec.options[1].additionAnalysis.sections.map((section) => section.key),
    ['materials', 'labour']
  )
  assert.equal(spec.options[1].additionAnalysis.sections[0].lines[0].description, 'Murum')
  assert.equal(spec.options[1].additionAnalysis.sections[1].lines[0].description, 'mazdoor')
  assert.deepEqual(spec.options[1].leadMaterials, [{
    name: 'Murum', conveyanceClass: 'EARTH', quantity: 18, unit: 'cum',
    basisQuantity: 100, basisUnit: 'sqm'
  }])
  const prepared = applyDataVariantToRecipe(
    recipe({
      unit: 'SQM',
      outputQuantity: 100,
      leadApplicability: {
        classes: ['STONE'],
        materials: { 'Uncoursed rubble stones at quarry': 'STONE' }
      },
      storedValues: {
        sectionTotals: {},
        labourExtract: [],
        abstract: [
          { label: 'A. Cost of Materials', value: '', unit: '', basis: '', percent: '', amount: '20977.75' },
          { label: 'B. Hire charges of Machinery', value: '', unit: '', basis: '', percent: '', amount: '0.00' },
          { label: 'C. Cost of Labour', value: '', unit: '', basis: '', percent: '', amount: '8080.00' },
          { label: '', value: '', unit: 'Total', basis: '', percent: '', amount: '29057.75' },
          { label: "D. Add for contractor's profit and overheads on (A+B+C)", value: '', unit: '13.615%', basis: '', percent: '13.615%', amount: '3956.21' },
          { label: 'Total cost for', value: '', unit: 'sqm', basis: '100.00', percent: '', amount: '33013.96' },
          { label: 'Rate per sqm', value: '', unit: '', basis: '(A+B+C+D)/100.0', percent: '', amount: '330.10' },
          { label: 'Note: If 15 cm thick murum bed is to be provided below', value: '', unit: '', basis: 'pitching', percent: '', amount: '' },
          { label: 'RATE ANALYSIS', value: '', unit: 'UNIT :', basis: '', percent: '', amount: 'sqm' }
        ]
      }
    }),
    spec,
    {
      kind: 'optional_addition', key: 'optional:included',
      label: spec.options[1].label, sourceYear: '2026-27'
    }
  )
  assert.equal(prepared.publishedRate, 423)
  assert.deepEqual(prepared.dataVariant.componentRates, [330.1, 92.9])
  assert.equal(prepared.publishedRateBlocks, undefined)
  assert.equal(prepared.storedValues.abstract.length, 7)
  assert.equal(prepared.dataVariant.additionAnalysis.sections.length, 2)
  assert.deepEqual(prepared.leadApplicability.materials, {
    'Uncoursed rubble stones at quarry': 'STONE'
  })
  assert.deepEqual(prepared.leadApplicability.classes, ['STONE'])
}

{
  const addonTable = [{
    id: 'murum_bed_15cm', kind: 'optional_addition',
    label: 'Add 15 cm thick murum bed below pitching', unit: 'SQM', quantity: '100.00',
    materials: [{ sl: '1', desc: 'Murum', unit: 'cum', quantity: '18.00' }],
    machinery: [{ sl: '1', desc: 'Nill', unit: '', quantity: '0.00' }],
    labour: [{ sl: '1', desc: 'mazdoor', unit: 'Day', quantity: '4.00' }]
  }]
  const addonRates = [{
    id: 'murum_bed_15cm', label: 'Add 15 cm thick murum bed below pitching',
    base_rate: '92.90',
    rates: {
      materials: [{ sl: '1', desc: 'Murum', unit: 'cum', quantity: '18.00', rate: '313.00', amount: '5634.00' }],
      machinery: [{ sl: '1', desc: 'Nill', unit: '', quantity: '0.00', rate: '0.00', amount: '0.00' }],
      labour: [{ sl: '1', desc: 'mazdoor', unit: 'Day', quantity: '4.00', rate: '635.00', amount: '2540.00' }]
    },
    abstract: [
      { label: 'A. Cost of Materials', amount: '5634.00' },
      { label: 'B. Hire charges of Machinery', amount: '0.00' },
      { label: 'C. Cost of Labour', amount: '2540.00' },
      { label: "D. Add for contractor's profit and overheads on (A+B+C)", percent: '13.615%', amount: '1112.89' },
      { label: 'Total cost for', basis: '100.00', unit: 'sqm', amount: '9286.89' }
    ]
  }]
  const leadApplicability = {
    classes: ['STONE'],
    materials: { Rubble: 'STONE' },
    addons: [{
      addon_id: 'murum_bed_15cm', applicable: true, material_desc: 'Murum',
      material_unit: 'CUM', quantity_ratio: 0.18, conveyance_class: 'EARTH',
      included_lead_m: 50, distance_rule: 'CHARGE_BEYOND_INCLUDED'
    }]
  }
  const spec = buildDataVariantSpec({
    code: 'IRR-CAW-8-1', year: '2026-27', baseRate: 330.1,
    addonTable, addonRates, leadApplicability
  })
  assert.deepEqual(spec.options.map((option) => option.key), ['addon:none', 'addon:murum_bed_15cm'])
  assert.equal(spec.options[1].addOnRate, 92.9)
  assert.equal(spec.options[1].additionAnalysis.sections[0].lines[0].rate, 313)
  assert.equal(spec.options[1].additionAnalysis.sections[0].lines[0].description, 'Murum')
  assert.equal(spec.options[1].addonLead.materialName, 'Murum')
  assert.equal(spec.options[1].addonLead.conveyanceClass, 'EARTH')
  const prepared = applyDataVariantToRecipe(
    recipe({ unit: 'SQM', outputQuantity: 100, leadApplicability }),
    spec,
    {
      kind: 'optional_addition', key: 'addon:murum_bed_15cm',
      addonId: 'murum_bed_15cm', label: spec.options[1].label, sourceYear: '2026-27'
    }
  )
  assert.equal(prepared.publishedRate, 423)
  assert.equal(prepared.dataVariant.addonId, 'murum_bed_15cm')
  assert.deepEqual(prepared.leadApplicability.classes, ['STONE'])
  assert.deepEqual(prepared.leadApplicability.selected_addon_ids, ['murum_bed_15cm'])

  const reference = buildDataVariantSpec({
    code: 'IRR-CAW-8-3', year: '2026-27', baseRate: 380.1,
    addonTable: [{
      id: 'murum_bed_15cm', kind: 'reference', label: 'Add Murum bed',
      source_item: 'IRR-CAW-8-1', source_addon_id: 'murum_bed_15cm'
    }],
    addonRates: [{ id: 'murum_bed_15cm', base_rate: '95.00', label: 'Add Murum bed' }],
    sourceAddonTables: { 'IRR-CAW-8-1': addonTable },
    sourceAddonRates: { 'IRR-CAW-8-1': addonRates },
    leadApplicability
  })
  assert.equal(reference.options[1].addOnRate, 95)
  assert.equal(reference.options[1].rate, 475.1)
  assert.equal(reference.options[1].additionAnalysis.sections[0].lines[0].description, 'Murum')
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-DAW-1-10',
    year: '2026-27',
    baseRate: 285.9,
    rateStructure: { multi_rate_classification: 'quantity_depth_bands' },
    rateValues: [
      { label: 'Rate per Rm', value: 285.9 },
      { label: 'Upto 6 m from surface Rate per Rm', value: 285.9 },
      { label: 'For 6 m to 12 m from surface Rate per Rm', value: 314.5 },
      { label: 'For 12 m to 18 m from surface Rate per Rm', value: 346 },
      { label: 'For 18 m to 24 m from surface Rate per Rm', value: 380.6 },
      { label: 'For 24 m to 30 m from surface Rate per Rm', value: 418.7 },
      { label: 'For 30 m to 36 m from surface Rate per Rm', value: 460.6 },
      { label: 'For 36 m to 42 m from surface Rate per Rm', value: 506.7 }
    ],
    abstract: dawAbstract
  })
  assert.equal(spec.kind, 'quantity_band')
  assert.deepEqual(spec.options.map((option) => option.label), [
    'Up to 6 m',
    'Beyond 6 m up to 12 m',
    'Beyond 12 m up to 18 m',
    'Beyond 18 m up to 24 m',
    'Beyond 24 m up to 30 m',
    'Beyond 30 m up to 36 m',
    'Beyond 36 m up to 42 m'
  ])
  assert.equal(spec.options.some((option) => option.label.includes('48 m')), false)
  assert.equal(spec.options.every((option) => option.postRateMultiplier === undefined), true)
  assert.deepEqual(spec.options.map((option) => option.postRateSteps), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(spec.options.every((option) => option.addPercent === undefined), true)

  const storedAbstract = dawAbstract
  const prepared = applyDataVariantToRecipe(
    recipe({ storedValues: { sectionTotals: {}, labourExtract: [], abstract: storedAbstract } }),
    spec,
    {
      kind: 'quantity_band', key: spec.options[2].key,
      label: spec.options[2].label, sourceYear: '2026-27'
    }
  )
  assert.equal(prepared.publishedRate, 346)
  assert.match(prepared.storedValues.abstract.at(-1).label, /Beyond 12 m upto 18 m/i)
  assert.equal(
    prepared.storedValues.abstract.filter((row) => /reduction in rate of drilling/i.test(row.label)).length,
    2
  )
  assert.equal(
    prepared.storedValues.abstract.some((row) => /Beyond 18 m upto 24 m/i.test(row.label)),
    false
  )
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-DAW-5-5',
    year: '2026-27',
    baseRate: 120.6,
    rateStructure: { multi_rate_classification: 'derived_adjustment_chain' },
    rateValues: [
      { label: 'Initial rate', value: 185.5 },
      { label: 'Final rate', value: 120.6 }
    ]
  })
  assert.equal(spec.kind, 'adjustment_chain')
  assert.equal(spec.requiresSelection, false)
  const prepared = applyDataVariantToRecipe(recipe({ publishedRateBlocks: undefined }), spec, undefined)
  assert.equal(prepared.publishedRate, 120.6)
  assert.equal(prepared.dataVariant, undefined)
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-CAW-8-3',
    year: '2026-27',
    baseRate: 380.1,
    rateStructure: {
      variants: [
        { label: 'Rate per Sqm. (A+B+C+D)/100.0', add_percent: null },
        {
          kind: 'additive_value',
          label: 'Add for 15 cm thick murum bed below pitching',
          source_item: 'IRR-CAW-8-1',
          add_percent: null
        }
      ]
    },
    rateValues: [
      { label: 'Rate per Sqm. (A+B+C+D)/100.0', value: 380.1 },
      {
        label: 'Add for 15 cm thick murum bed below pitching',
        value: 92.9,
        add_value: 92.9
      }
    ]
  })
  assert.equal(spec.classification, 'optional_addition')
  assert.equal(spec.options[0].rate, 380.1)
  assert.equal(spec.options[1].label, 'Add for 15 cm thick murum bed below pitching')
  assert.equal(spec.options[1].rate, 473)
  assert.deepEqual(spec.options[1].leadMaterials, [{
    name: 'Murum', conveyanceClass: 'EARTH', quantity: 18, unit: 'cum',
    basisQuantity: 100, basisUnit: 'sqm'
  }])
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-CCDW-6-1',
    year: '2026-27',
    baseRate: 547.8,
    rateStructure: {
      variants: [
        { label: 'Rate per Joint (A+B+C+D)/10.0', add_percent: null },
        {
          kind: 'percent_variant', label: 'NP3 Class',
          base_variant: 'NP2 Class', add_percent: '10%'
        },
        {
          kind: 'percent_variant', label: 'NP4 Class',
          base_variant: 'NP2 Class', add_percent: '20%'
        }
      ]
    },
    rateValues: [
      { label: 'Rate per Joint (A+B+C+D)/10.0', value: 547.8 },
      { label: 'NP3 Class (+10% over NP2)', value: 602.58, add_value: 54.78, add_percent: '10%' },
      { label: 'NP4 Class (+20% over NP2)', value: 657.36, add_value: 109.56, add_percent: '20%' }
    ]
  })
  assert.equal(spec.kind, 'type')
  assert.equal(spec.classification, 'type_variants')
  assert.deepEqual(spec.options.map((option) => [option.label, option.rate]), [
    ['NP2 Class', 547.8],
    ['NP3 Class', 602.58],
    ['NP4 Class', 657.36]
  ])
  assert.equal(spec.options[1].baseVariantLabel, 'NP2 Class')
  assert.equal(spec.options[1].addPercent, 10)
  assert.equal(spec.options[1].addOnRate, 54.78)
  assert.equal(spec.options[2].addPercent, 20)
  assert.equal(spec.options[2].addOnRate, 109.56)

  const np2 = applyDataVariantToRecipe(
    recipe({ unit: 'JOINTS', outputQuantity: 10 }),
    spec,
    {
      kind: 'type', key: spec.options[0].key,
      label: spec.options[0].label, sourceYear: '2026-27'
    }
  )
  assert.equal(np2.publishedRate, 547.8)
  assert.equal(np2.dataVariant.addPercent, undefined)
  assert.equal(np2.dataVariant.addOnRate, undefined)

  const np4 = applyDataVariantToRecipe(
    recipe({ unit: 'JOINTS', outputQuantity: 10 }),
    spec,
    {
      kind: 'type', key: spec.options[2].key,
      label: spec.options[2].label, sourceYear: '2026-27'
    }
  )
  assert.equal(np4.publishedRate, 657.36)
  assert.equal(np4.dataVariant.baseVariantLabel, 'NP2 Class')
  assert.equal(np4.dataVariant.addPercent, 20)
  assert.equal(np4.dataVariant.addOnRate, 109.56)
  assert.deepEqual(np4.dataVariant.componentRates, [547.8, 109.56])
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-CCDW-6-2',
    year: '2026-27',
    baseRate: 609.5,
    rateStructure: {
      variants: [
        { label: 'Rate per Joint (A+B+C+D)/10.0' },
        { kind: 'percent_variant', label: 'NP3 Class', base_variant: 'NP2 Class', add_percent: '10%' },
        { kind: 'percent_variant', label: 'NP4 Class', base_variant: 'NP2 Class', add_percent: '20%' }
      ]
    },
    rateValues: [
      { label: 'Rate per Joint (A+B+C+D)/10.0', value: 609.5 },
      { label: 'NP3 Class (+10% over NP2)', value: 670.45, add_value: 60.95, add_percent: '10%' },
      { label: 'NP4 Class (+20% over NP2)', value: 731.4, add_value: 121.9, add_percent: '20%' }
    ]
  })
  const np3 = applyDataVariantToRecipe(
    recipe({
      unit: 'JOINTS', outputQuantity: 10,
      storedValues: {
        sectionTotals: {}, labourExtract: [],
        abstract: [
          { label: 'A. Cost of Materials', amount: '1244.54' },
          { label: 'B. Hire charges of Machinery', amount: '0.00' },
          { label: 'C. Cost of Labour', amount: '4120.00' },
          { label: '', amount: '5364.54' },
          { label: "D. Add for contractor's profit and overheads", amount: '730.38' },
          { label: 'Total cost for', basis: '10.00', unit: 'Joints', amount: '6094.92' },
          { label: 'Rate per Joint', basis: '(A+B+C+D)/10.0', amount: '609.50' }
        ].map((row) => ({ value: '', unit: '', basis: '', percent: '', ...row }))
      }
    }),
    spec,
    {
      kind: 'type', key: spec.options[1].key,
      label: spec.options[1].label, sourceYear: '2026-27'
    }
  )
  assert.equal(np3.dataVariant.baseRate, 609.5)
  assert.equal(np3.dataVariant.addPercent, 10)
  assert.equal(np3.dataVariant.addOnRate, 60.95)
  assert.equal(np3.dataVariant.rate, 670.45)
  assert.equal(np3.storedValues.abstract.length, 7)
  assert.equal(np3.storedValues.abstract.at(-1).amount, '609.50')
}

for (const [code, modifiers] of [
  ['IRR-PMW-2-5', [
    { note: 'rate per Rm by 25 percent.', percent: '25%' },
    { note: 'rate per Rm by 40 percent.', percent: '40%' }
  ]],
  ['IRR-PMW-2-8', [
    { note: 'basic rate for drilling upto 30 m from surface by 25 percent per Rm.', percent: '25%' },
    { note: 'rate for drilling upto 30 m from surface by 40 percent per Rm.', percent: '40%' }
  ]]
]) {
  const spec = buildDataVariantSpec({
    code,
    year: '2026-27',
    description: 'Core drilling complete for depth upto 30 m from surface.',
    baseRate: 100,
    rateValues: [{ label: 'Rate per Rm', value: 100 }],
    modifiers,
    abstract: [{ label: 'Rate per Rm', amount: '100.00' }]
  })
  assert.equal(spec.kind, 'upto')
  assert.deepEqual(spec.options.map((option) => [option.label, option.rate]), [
    ['Up to 30 m', 100],
    ['Up to 60 m', 125],
    ['Up to 90 m', 140]
  ])
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-PMW-2-5', year: '2026-27', baseRate: 8919,
    rateValues: [{ value: 8919, variant_id: 'upto_30m' }],
    rateStructure: {
      multi_rate_classification: 'post_rate_depth_variants',
      variants: [
        { id: 'upto_30m', kind: 'base', label: 'Up to 30 m' },
        { id: '30m_to_60m', kind: 'post_rate_percent', label: 'Beyond 30 m up to 60 m', add_percent: 25, apply_stage: 'after_data_recalculation' },
        { id: '60m_to_90m', kind: 'post_rate_percent', label: 'Beyond 60 m up to 90 m', add_percent: 40, apply_stage: 'after_data_recalculation' }
      ]
    }
  })
  assert.equal(spec.kind, 'quantity_band')
  assert.deepEqual(spec.options.map((option) => [option.key, option.addPercent, option.postRate]), [
    ['variant:upto_30m', undefined, true],
    ['variant:30m_to_60m', 25, true],
    ['variant:60m_to_90m', 40, true]
  ])
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-TAW-1-5', year: '2026-27', baseRate: 2888.6,
    rateValues: [{ value: 2888.6, variant_id: 'standard_mucking' }],
    rateStructure: {
      multi_rate_classification: 'post_rate_method_variants',
      variants: [
        { id: 'standard_mucking', kind: 'base', label: 'Standard mucking arrangement' },
        { id: 'shaft_winch_mucking_tub', kind: 'post_rate_percent', label: 'Mucking through shaft using winch and mucking tub system', add_percent: 8, apply_stage: 'after_data_recalculation' }
      ]
    }
  })
  assert.equal(spec.kind, 'type')
  assert.equal(spec.options[1].addPercent, 8)
  assert.equal(spec.options[1].postRate, true)
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-GAW-1-1', year: '2026-27', baseRate: 221857.3,
    rateValues: [{ label: 'Rate per Tonne', value: 221857.3 }],
    rateStructure: {
      variants: [{ label: 'Rate per Tonne', add_percent: null }],
      calculation_rules: [{ id: 'excise_duty_basis', kind: 'calculation_basis', selectable: false, taxable_fraction_percent: 75 }]
    }
  })
  assert.equal(spec, null, 'non-selectable GAW calculation basis must not become a variant')
}

{
  const spec = buildDataVariantSpec({
    code: 'IRR-TAW-1-5',
    year: '2026-27',
    baseRate: 2888.6,
    rateValues: [{ label: 'Rate per cum (A+B+C+D) / 50.00', value: 2888.6 }],
    modifiers: [{
      note: 'basic rates for items IRR-TAW-1-3, IRR-TAW-1-4 & IRR-TAW-1-5 by 8 percent',
      percent: '8%'
    }]
  })
  assert.equal(spec.kind, 'optional_addition')
  assert.equal(spec.options[1].label, 'Mucking through shaft using winch (+8%)')
  assert.equal(spec.options[1].addOnRate, 231.09)
  assert.equal(spec.options[1].rate, 3119.69)
}

console.log('multi-rate DATA classification tests passed')
