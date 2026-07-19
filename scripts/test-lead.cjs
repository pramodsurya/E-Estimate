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
      target: ts.ScriptTarget.ES2020
    },
    fileName: filePath
  })

  const loadedModule = new Module(filePath, module)
  loadedModule.filename = filePath
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  loadedModule.require = (request) => {
    if (request in mocks) return mocks[request]
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const leadPath = path.join(root, 'src/renderer/src/lib/lead.ts')
const leadExports = loadTsModule(leadPath, {
  './supabase': { supabase: {} }
})
const {
  calculateLeadChargeFromRows,
  calculateLeadVariantChargeFromRows,
  loadingUnloadingCautionForBreakdown
} = leadExports
const {
  basisForData,
  canonicalLeadConveyanceClass,
  handlingModeForData,
  liftInfoForData,
  materialNameFor,
  materialRefsForLeadInfo,
  parseLeadInfo,
  quantityForVariant
} = loadTsModule(
  path.join(root, 'src/renderer/src/lib/leadApplicability.ts'),
  { './lead': leadExports }
)

{
  const info = parseLeadInfo({
    classes: ['STONE', 'EARTH'],
    materials: {
      'Uncoursed rubble stones at quarry': 'STONE',
      Murum: 'EARTH'
    },
    builtin: { initial_lead_m: 50 }
  })
  assert.equal(materialNameFor('Murum', 'EARTH'), 'Earth')
  assert.ok(
    materialRefsForLeadInfo(info).some(
      (ref) => ref.name === 'Earth' && ref.conveyanceClass === 'EARTH'
    )
  )
  const quantity = quantityForVariant(
    {
      outputQuantity: 100,
      unit: 'SQM',
      sections: [],
      dataVariant: {
        leadMaterials: [{
          name: 'Murum',
          conveyanceClass: 'EARTH',
          quantity: 18,
          unit: 'cum',
          basisQuantity: 100,
          basisUnit: 'sqm'
        }]
      }
    },
    { materialName: 'Earth', conveyanceClass: 'EARTH' },
    info
  )
  assert.equal(quantity.quantity, 18)
  assert.equal(quantity.unit, 'cum')
  assert.match(quantity.source, /Selected optional DATA material quantity/)
}

{
  const variant = { materialName: 'Earth', conveyanceClass: 'EARTH', handlingMode: 'mechanical' }
  const selected = parseLeadInfo({
    classes: ['STONE'],
    materials: { Rubble: 'STONE' },
    selected_addon_ids: ['murum_bed_15cm'],
    addons: [{
      addon_id: 'murum_bed_15cm', applicable: true, material_desc: 'Murum',
      material_unit: 'CUM', quantity_ratio: 0.18, conveyance_class: 'EARTH',
      included_lead_m: 50, distance_rule: 'CHARGE_BEYOND_INCLUDED',
      loading: { add_charge: false }, unloading: { add_charge_by_default: false }
    }]
  })
  assert.deepEqual(selected.classes, ['STONE'], 'add-on EARTH must not enter base classes')
  assert.ok(materialRefsForLeadInfo(selected).some((ref) => ref.name === 'Earth'))
  assert.equal(basisForData(selected, 'none', '', variant), 'initial_50m')
  assert.equal(handlingModeForData(selected, variant, 'mechanical'), 'none')
  const quantity = quantityForVariant(
    { outputQuantity: 500, unit: 'SQM', sections: [] },
    variant,
    selected
  )
  assert.equal(quantity.quantity, 90)

  const unselected = parseLeadInfo({
    classes: ['STONE'], materials: { Rubble: 'STONE' },
    addons: [{
      addon_id: 'murum_bed_15cm', applicable: true, material_desc: 'Murum',
      material_unit: 'CUM', quantity_ratio: 0.18, conveyance_class: 'EARTH'
    }]
  })
  assert.equal(materialRefsForLeadInfo(unselected).some((ref) => ref.name === 'Earth'), false)

  const fullDistance = parseLeadInfo({
    selected_addon_ids: ['murum_bed_15cm'],
    addons: [{
      addon_id: 'murum_bed_15cm', applicable: true, material_desc: 'Murum',
      material_unit: 'CUM', quantity_ratio: 0.18, conveyance_class: 'EARTH',
      included_lead_m: 0, distance_rule: 'FULL_SOURCE_TO_SITE'
    }]
  })
  assert.equal(basisForData(fullDistance, 'initial_50m', '', variant), 'none')
}
const {
  normalizeLeadApplications,
  scopedLeadRateAddition,
  upsertUniqueLeadApplication
} = loadTsModule(path.join(root, 'src/renderer/src/lib/leadApplications.ts'))

{
  const applications = [
    {
      id: 'base-earth', variantId: 'earth', itemKey: 'item', itemNodeId: 'node',
      quantity: 1, unit: 'cum', grossAmount: 10, outputQuantity: 1
    },
    {
      id: 'murum-addon-earth', variantId: 'earth', addonId: 'murum_bed_15cm',
      itemKey: 'item', itemNodeId: 'node', quantity: 1, unit: 'cum',
      grossAmount: 20, outputQuantity: 1
    }
  ]
  assert.equal(scopedLeadRateAddition(applications, 'item', 'node', false, 1), 10)
  assert.equal(
    scopedLeadRateAddition(applications, 'item', 'node', false, 1, 'murum_bed_15cm'),
    30
  )
}

function rate(chargeCode, slabKey, rateValue, conveyanceClass = 'EARTH') {
  return {
    charge_code: chargeCode,
    year: '2025-26',
    slab_key: slabKey,
    column_key: conveyanceClass,
    applies_to: [conveyanceClass],
    unit: 'cum',
    basis: 'cumulative_total',
    slab_label: slabKey,
    range_from: null,
    range_to: null,
    range_unit: null,
    rate: rateValue
  }
}

const rows = [
  rate('COM-LDLFT-1', 'upto_100m', 10),
  rate('COM-LDLFT-1', 'upto_150m', 20),
  rate('COM-LDLFT-2', 'upto_1km', 100),
  rate('COM-LDLFT-2', 'upto_2km', 200),
  rate('COM-LDLFT-2', 'upto_3km', 300),
  rate('COM-LDLFT-2', 'upto_4km', 400),
  rate('COM-LDLFT-2', 'upto_5km', 500),
  rate('COM-LDLFT-2', 'per_km_5_30', 50),
  rate('COM-LDLFT-2', 'per_km_beyond_30', 30),
  rate('COM-LDLFT-2', 'upto_1km', 100, 'STONE'),
  rate('COM-LDLFT-2', 'upto_2km', 200, 'STONE'),
  rate('COM-LDLFT-4', 'loading', 12),
  rate('COM-LDLFT-4', 'unloading', 13),
  rate('COM-LDLFT-6', 'per_1m_beyond_3m', 5)
]

function calculate(input) {
  return calculateLeadChargeFromRows(rows, {
    year: '2025-26',
    conveyanceClass: 'EARTH',
    handlingMode: 'none',
    ...input
  })
}

{
  const result = calculate({ distanceKm: 0.1, liftM: 6 })
  assert.equal(result.mode, 'head_load')
  assert.equal(result.leadRate, 10)
  assert.equal(result.liftRate, 15)
  assert.equal(result.grossRate, 25)
}

{
  const result = calculate({
    distanceKm: 2,
    liftM: 6,
    mechanicalConveyanceReachesFinalPoint: true
  })
  assert.equal(result.mode, 'mechanical')
  assert.equal(result.leadRate, 200)
  assert.equal(result.liftRate, 0)
  assert.equal(result.grossRate, 200)
}

{
  const result = calculate({
    distanceKm: 2.1,
    liftM: 6,
    mechanicalConveyanceReachesFinalPoint: false
  })
  assert.equal(result.mode, 'mechanical')
  assert.equal(result.leadRate, 300)
  assert.equal(result.liftRate, 15)
  assert.equal(result.grossRate, 315)
}

{
  const result = calculate({
    distanceKm: 2.1,
    liftM: 6,
    includesAllLifts: true,
    mechanicalConveyanceReachesFinalPoint: false
  })
  assert.equal(result.mode, 'mechanical')
  assert.equal(result.leadRate, 300)
  assert.equal(result.liftRate, 0)
  assert.equal(result.grossRate, 300)
}

{
  const result = calculate({ distanceKm: 0, liftM: 6 })
  assert.equal(result.mode, 'head_load')
  assert.equal(result.leadRate, 0)
  assert.equal(result.liftRate, 15)
  assert.equal(result.grossRate, 15)
}

{
  const exampleRows = [
    rate('COM-LDLFT-2', 'upto_1km', 44.9),
    rate('COM-LDLFT-2', 'upto_5km', 119.7),
    rate('COM-LDLFT-2', 'per_km_5_30', 18),
    rate('COM-LDLFT-2', 'per_km_beyond_30', 15)
  ]
  const result = calculateLeadVariantChargeFromRows(exampleRows, {
    year: '2025-26',
    conveyanceClass: 'EARTH',
    distanceKm: 35,
    quantity: 1,
    handlingMode: 'none',
    includedBasis: 'initial_1km'
  })
  assert.equal(result.leadRate, 599.8)
  assert.equal(result.grossRate, 599.8)
  assert.equal(result.calculation.fullLeadRate, 644.7)
  assert.equal(result.calculation.deductedLeadRate, 44.9)
  assert.equal(result.calculation.netLeadRate, 599.8)
  assert.deepEqual(
    result.calculation.rows.map((row) => row.expression),
    ['119.70', '25 x 18.00', '5 x 15.00', '-44.90', '644.70 - 44.90']
  )
}

{
  const result = calculateLeadVariantChargeFromRows(rows, {
    year: '2025-26',
    conveyanceClass: 'EARTH',
    distanceKm: 2,
    quantity: 1,
    handlingMode: 'manual_with_idle',
    includedBasis: 'initial_1km'
  })
  assert.equal(result.leadRate, 100)
  assert.equal(result.loadingRate, 12)
  assert.equal(result.unloadingRate, 13)
  assert.equal(result.grossRate, 125)
  assert.match(
    loadingUnloadingCautionForBreakdown(result, 'manual_with_idle'),
    /1 km initial lead/
  )
}

{
  const result = calculateLeadVariantChargeFromRows(rows, {
    year: '2025-26',
    conveyanceClass: 'STONE',
    materialName: 'Disposal Lead',
    distanceKm: 2,
    quantity: 1,
    liftM: 6,
    handlingMode: 'manual_with_idle',
    includedBasis: 'initial_1km'
  })
  assert.equal(result.leadRate, 100)
  assert.equal(result.loadingRate, 0)
  assert.equal(result.unloadingRate, 0)
  assert.equal(result.liftRate, 0)
  assert.equal(result.grossRate, 100)
}

{
  const result = calculateLeadVariantChargeFromRows(rows, {
    year: '2025-26',
    conveyanceClass: 'STONE',
    materialName: 'Disposal Lead',
    distanceKm: 2,
    quantity: 1,
    liftM: 6,
    handlingMode: 'manual_with_idle',
    includedBasis: 'none'
  })
  assert.equal(result.leadRate, 200)
  assert.equal(result.loadingRate, 0)
  assert.equal(result.unloadingRate, 0)
  assert.equal(result.liftRate, 0)
  assert.equal(result.grossRate, 200)
  assert.equal(result.calculation.deductedLeadRate, 0)
}

{
  const result = calculateLeadVariantChargeFromRows(rows, {
    year: '2025-26',
    conveyanceClass: 'STONE',
    materialName: 'Disposal Lead',
    distanceKm: 0.1,
    quantity: 1,
    liftM: 6,
    handlingMode: 'manual_with_idle',
    includedBasis: 'initial_1km'
  })
  assert.equal(result.leadRate, 0)
  assert.equal(result.loadingRate, 0)
  assert.equal(result.unloadingRate, 0)
  assert.equal(result.liftRate, 0)
  assert.equal(result.grossRate, 0)
}

{
  const liftInfo = liftInfoForData(
    parseLeadInfo({ builtin: {} }),
    'Providing concrete including initial lift up to 6 m and all ordinary leads.'
  )
  assert.equal(liftInfo.includedInitialLiftM, 6)
  assert.equal(liftInfo.includesAllLifts, false)
}

{
  const liftInfo = liftInfoForData(
    parseLeadInfo({ builtin: {} }),
    'Supplying and placing material including all leads and lifts complete.'
  )
  assert.equal(liftInfo.includesAllLifts, true)
}

{
  for (const itemCode of ['IRR-TAW-1-1', 'IRR-DAW-1-1', 'IRR-CAW-7-11', 'IRR-CCDW-1-1']) {
    const liftInfo = liftInfoForData(
      parseLeadInfo({ builtin: {} }),
      'Providing and laying standard work item.',
      itemCode
    )
    assert.equal(liftInfo.includesAllLifts, true, `${itemCode} should default to all lifts`)
  }
}

{
  const liftInfo = liftInfoForData(
    parseLeadInfo({ builtin: {} }),
    'Providing item including initial lift up to 3 m.',
    'IRR-CAW-1-1'
  )
  assert.equal(liftInfo.includedInitialLiftM, 3)
  assert.equal(liftInfo.includesAllLifts, false)
}

{
  const liftInfo = liftInfoForData(
    parseLeadInfo({ builtin: { initial_lift_m: 5, all_lifts: true } }),
    'Item text mentions initial lift up to 3 m.'
  )
  assert.equal(liftInfo.includedInitialLiftM, 5)
  assert.equal(liftInfo.includesAllLifts, true)
}

{
  assert.equal(
    basisForData(
      parseLeadInfo({ builtin: {} }),
      'none',
      'Providing concrete including initial lead up to 1 km and initial lift up to 3 m.'
    ),
    'initial_1km'
  )
  assert.equal(
    basisForData(
      parseLeadInfo({ builtin: {} }),
      'none',
      'Supplying materials with lead upto 1000 m complete.'
    ),
    'initial_1km'
  )
  assert.equal(
    basisForData(parseLeadInfo({ builtin: { initial_lead_m: 1000 } }), 'none', ''),
    'initial_1km'
  )
}

{
  const refs = materialRefsForLeadInfo(
    parseLeadInfo({
      classes: ['EARTH'],
      earthwork: true,
      builtin: { initial_lead_m: 1000, all_lifts: true },
      lead_policy: {
        purpose: 'EXCAVATED_DISPOSAL',
        included_lead_m: 1000,
        included_lift_m: 0,
        includes_all_lifts: true,
        quantity_basis: 'PARENT_CUM',
        allow_loading: false,
        allow_unloading: false,
        scrutiny_required: false,
        default_conveyance_class: 'STONE'
      }
    })
  )
  assert.deepEqual(refs, [
    {
      name: 'Disposal Lead',
      conveyanceClass: 'STONE',
      source: 'Reviewed DATA lead policy'
    }
  ])
}

{
  const refs = materialRefsForLeadInfo(
    parseLeadInfo({
      classes: ['EARTH'],
      earthwork: true,
      lead_policy: {
        purpose: 'MATERIAL_SUPPLY',
        included_lead_m: 0,
        included_lift_m: 0,
        includes_all_lifts: false,
        quantity_basis: 'PARENT_CUM',
        allow_loading: true,
        allow_unloading: true,
        scrutiny_required: false
      }
    }),
    'Excavation wording should not create disposal without policy purpose.'
  )
  assert.ok(!refs.some((ref) => ref.name === 'Disposal Lead'))
}

{
  const info = parseLeadInfo({
    classes: ['CEMENT', 'STONE'],
    materials: {
      'Cement for mix': 'CEMENT',
      'Cement for incidentals @ 5 Kg / cum': 'CEMENT',
      'Coarse aggregate 40mm': 'STONE',
      'Coarse aggregate 20 mm': 'STONE',
      'Coarse aggregate 10 mm': 'STONE',
      'Fine aggregate (Un-Screened)': 'STONE'
    }
  })
  const refs = materialRefsForLeadInfo(info)
  assert.ok(refs.some((ref) => ref.name === 'Sand' && ref.conveyanceClass === 'EARTH'))
  assert.ok(refs.some((ref) => ref.name === 'Stone' && ref.conveyanceClass === 'STONE'))
  assert.ok(info.classes.includes('EARTH'))

  const recipe = {
    unit: 'CUM',
    outputQuantity: 27,
    sections: [
      {
        key: 'materials',
        lines: [
          { description: 'Cement for mix', unit: 'kg', quantity: 6750 },
          { description: 'Cement for incidentals @ 5 Kg / cum', unit: 'kg', quantity: 135 },
          { description: 'Coarse aggregate 40mm', unit: 'cum', quantity: 12.15 },
          { description: 'Coarse aggregate 20 mm', unit: 'cum', quantity: 7.29 },
          { description: 'Coarse aggregate 10 mm', unit: 'cum', quantity: 4.86 },
          { description: 'Fine aggregate (Un-Screened)', unit: 'cum', quantity: 10.8 }
        ]
      }
    ]
  }
  const cement = quantityForVariant(recipe, { materialName: 'Cement', conveyanceClass: 'CEMENT' }, info)
  assert.equal(cement.quantity, 6.885)
  assert.equal(cement.unit, 'tonne')

  const sand = quantityForVariant(recipe, { materialName: 'Sand', conveyanceClass: 'EARTH' }, info)
  assert.equal(sand.quantity, 10.8)
  assert.equal(sand.unit, 'cum')

  const staleSand = quantityForVariant(recipe, { materialName: 'Sand', conveyanceClass: 'STONE' }, info)
  assert.equal(canonicalLeadConveyanceClass('Sand', 'STONE'), 'EARTH')
  assert.equal(staleSand.quantity, 10.8)
  assert.equal(staleSand.unit, 'cum')

  const stone = quantityForVariant(recipe, { materialName: 'Stone', conveyanceClass: 'STONE' }, info)
  assert.equal(stone.quantity, 24.3)
  assert.equal(stone.unit, 'cum')
}

{
  const variants = [
    { id: 'cement-near', materialName: 'Cement' },
    { id: 'cement-far', materialName: '  CEMENT  ' },
    { id: 'sand-near', materialName: 'Sand' }
  ]
  const application = (id, variantId, itemKey, itemNodeId) => ({
    id,
    variantId,
    itemKey,
    ...(itemNodeId ? { itemNodeId } : {})
  })
  const legacy = [
    application('old-cement', 'cement-near', 'data-1'),
    application('sand', 'sand-near', 'data-1'),
    application('new-cement', 'cement-far', 'data-1')
  ]

  assert.deepEqual(
    normalizeLeadApplications(legacy, variants).map((candidate) => candidate.id),
    ['sand', 'new-cement']
  )

  assert.deepEqual(
    upsertUniqueLeadApplication(
      [
        application('old-cement', 'cement-near', 'data-1'),
        application('sand', 'sand-near', 'data-1')
      ],
      variants,
      application('new-cement', 'cement-far', 'data-1')
    ).map((candidate) => candidate.id),
    ['sand', 'new-cement']
  )

  assert.deepEqual(
    upsertUniqueLeadApplication(
      [
        application('bridge-near', 'cement-near', 'data-1', 'item-bridge'),
        application('spillway-near', 'cement-near', 'data-1', 'item-spillway')
      ],
      variants,
      application('bridge-far', 'cement-far', 'data-1', 'item-bridge')
    ).map((candidate) => candidate.id),
    ['spillway-near', 'bridge-far'],
    'the same shared DATA may keep different Lead variants in different Item/component usages'
  )

  const scopedApplications = [
    { ...application('bridge-lead', 'cement-far', 'data-1', 'item-bridge'), grossAmount: 900, outputQuantity: 90 },
    { ...application('spillway-lead', 'cement-near', 'data-1', 'item-spillway'), grossAmount: 450, outputQuantity: 90 }
  ]
  assert.equal(scopedLeadRateAddition(scopedApplications, 'data-1', 'item-bridge', false), 10)
  assert.equal(scopedLeadRateAddition(scopedApplications, 'data-1', 'item-spillway', false), 5)
}

{
  const info = parseLeadInfo({
    classes: ['STEEL'],
    materials: { 'Fabricated parts': 'STEEL' },
    builtin: { all_leads: false, builtin_lead_km: 1 },
    lead_policy: {
      purpose: 'MATERIAL_SUPPLY',
      included_lead_m: 1000,
      included_lift_m: 0,
      includes_all_lifts: true,
      quantity_basis: 'PUBLISHED_FABRICATED_WEIGHT_TONNE',
      allow_loading: false,
      allow_unloading: false,
      scrutiny_required: false,
      default_conveyance_class: 'STEEL',
      haul_legs: 2
    }
  })
  assert.equal(info.policy.haulLegs, 2)
  assert.equal(basisForData(info, 'none', ''), 'initial_1km')
  assert.deepEqual(materialRefsForLeadInfo(info), [
    { name: 'Fabricated Parts', conveyanceClass: 'STEEL', source: 'Fabricated parts' }
  ])
  const quantity = quantityForVariant(
    {
      outputQuantity: 90,
      unit: 't capacity',
      sections: [],
      multiRateClassification: {
        kind: 'dual_measurement_basis',
        sourceQuantity: 15.44,
        sourceUnit: 'tonne wt'
      }
    },
    { materialName: 'Fabricated Parts', conveyanceClass: 'STEEL' },
    info
  )
  assert.equal(quantity.quantity, 15.44)
  assert.equal(quantity.unit, 'tonne')
}

{
  const steelRows = [
    rate('COM-LDLFT-2', 'upto_1km', 29, 'STEEL'),
    rate('COM-LDLFT-2', 'upto_2km', 40.7, 'STEEL')
  ]
  const result = calculateLeadVariantChargeFromRows(steelRows, {
    year: '2026-27',
    conveyanceClass: 'STEEL',
    materialName: 'Fabricated Parts',
    distanceKm: 2,
    quantity: 15.44,
    handlingMode: 'none',
    includedBasis: 'initial_1km',
    leadMultiplier: 2
  })
  assert.equal(result.leadRate, 23.4)
  assert.equal(result.calculation.fullLeadRate, 81.4)
  assert.equal(result.calculation.deductedLeadRate, 58)
  assert.equal(result.calculation.netLeadRate, 23.4)
  assert.equal(result.grossAmount, 361.3)
}

console.log('lead rule tests passed')
