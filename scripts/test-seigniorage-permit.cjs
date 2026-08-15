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
  loadedModule.require = (request) => (request in mocks ? mocks[request] : require(request))
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const {
  computeSeigniorageTable,
  permitMultiplierFor,
  permitPercentFor,
  DEFAULT_PERMIT_MULTIPLIER
} = loadTsModule(path.join(root, 'src/renderer/src/lib/seigniorage.ts'), {
  './supabase': { supabase: {} },
  './projectItems': {
    projectItemKey: (node) => node.itemCode ?? node.name,
    rateAnalysisOverrideForNode: () => undefined
  },
  './finalNumber': {
    readFinalValueFromSnapshot: (node) =>
      typeof node.computedQuantity === 'number' ? node.computedQuantity : null
  }
})

function charge(seigCode, mineralName, ratePerM3, ratePerMt) {
  return {
    seig_code: seigCode,
    mineral_name: mineralName,
    rate_per_mt: ratePerMt ?? null,
    rate_per_m3: ratePerM3 ?? null,
    schedule: 'I',
    go_reference: null,
    effective_from: null,
    confidence: null,
    notes: null
  }
}

function item(id, code, quantity) {
  return {
    id,
    kind: 'item',
    name: code,
    itemCode: code,
    itemSource: 'SSR',
    categoryKey: 'ssr_item',
    unit: 'cum',
    computedQuantity: quantity,
    children: []
  }
}

function project(items) {
  return {
    formatVersion: 1,
    id: 'p1',
    meta: { name: 'Test', sorYear: '2025-26', location: null, flags: [] },
    root: { id: 'root', kind: 'title', name: 'Title', children: items },
    createdAt: '',
    updatedAt: ''
  }
}

function policy(seigCode) {
  return {
    applicable: true,
    rows: [
      {
        seig_code: seigCode,
        mode: 'FULL_ITEM_QUANTITY',
        charge_unit: 'cum',
        material_label: seigCode
      }
    ]
  }
}

function materialPolicy(rows) {
  return {
    applicable: true,
    rows: rows.map(({ seigCode, ratio, label, key }) => ({
      seig_code: seigCode,
      mode: 'RECIPE_MATERIAL_RATIO',
      quantity_basis: 'ITEM_QTY_X_RATIO',
      quantity_ratio: ratio,
      conversion_factor: 1,
      charge_unit: 'cum',
      material_key: key,
      material_label: label,
      material_desc: label
    }))
  }
}

// --- Multiplier resolution follows the G.O. of 31.03.2022 -------------------

assert.equal(DEFAULT_PERMIT_MULTIPLIER, 0.8)

// 0.8x for minor minerals.
assert.equal(permitMultiplierFor('SEIG_BUILDING_STONE'), 0.8)
assert.equal(permitMultiplierFor('SEIG_MORRAM_GRAVEL_EARTH'), 0.8)
assert.equal(permitMultiplierFor('SEIG_ORDINARY_SAND'), 0)
// 0.4x for Colour Granite and Black Granite, all four published codes.
assert.equal(permitMultiplierFor('SEIG_BLACK_GRANITE_BELOW'), 0.4)
assert.equal(permitMultiplierFor('SEIG_BLACK_GRANITE_GANGSAW'), 0.4)
assert.equal(permitMultiplierFor('SEIG_COLOUR_GRANITE_BELOW'), 0.4)
assert.equal(permitMultiplierFor('SEIG_COLOUR_GRANITE_GANGSAW'), 0.4)
// An unmatched charge falls back to the minor-mineral rate.
assert.equal(permitMultiplierFor(null), 0.8)

// The percentage shown in the detailed table and the printed statement.
assert.equal(permitPercentFor('SEIG_BUILDING_STONE'), 80)
assert.equal(permitPercentFor('SEIG_BLACK_GRANITE_BELOW'), 40)

// --- Permit fee flows through the calculation table -------------------------

const charges = [
  charge('SEIG_BUILDING_STONE', 'Building Stone', 117, 78),
  charge('SEIG_ORDINARY_SAND', 'Ordinary Sand', 40.5, 27),
  charge('SEIG_BLACK_GRANITE_BELOW', 'Black Granite - Below Gangsaw', 3588, 1252)
]

const stoneCalc = computeSeigniorageTable(
  project([item('i1', 'IRR-A-1', 100)]),
  charges,
  [],
  { 'IRR-A-1': policy('SEIG_BUILDING_STONE') }
)
assert.equal(stoneCalc.rows.length, 1)
assert.equal(stoneCalc.totalSeigniorage, 11700)
assert.equal(stoneCalc.totalDmft, 3510)
assert.equal(stoneCalc.totalSmft, 234)
// 11700 x 0.8
assert.equal(stoneCalc.totalPermit, 9360)
assert.equal(stoneCalc.grandTotal, 11700 + 3510 + 234 + 9360)

// A manual/extract Project DATA resource may be marked for Seigniorage, but
// it must not guess a mineral rate from its typed description. The estimator
// selects the official mineral code before any charge is calculated.
const manualSelectionRequired = computeSeigniorageTable(
  project([item('manual-1', 'DATA-SSR-001', 10)]),
  charges,
  [],
  {
    'DATA-SSR-001': {
      applicable: true,
      rows: [{
        seig_code: null,
        mode: 'RECIPE_MATERIAL_RATIO',
        quantity_basis: 'ITEM_QTY_X_RATIO',
        quantity_ratio: 0.4,
        conversion_factor: 1,
        charge_unit: 'cum',
        material_key: 'manual-sand',
        material_label: 'Hand-entered filling',
        material_desc: 'Hand-entered filling',
        status: 'PROJECT_DATA_MANUAL_SELECTION_REQUIRED'
      }]
    }
  }
)
assert.equal(manualSelectionRequired.rows[0].seigRate, null)
assert.equal(manualSelectionRequired.rows[0].seigniorage, null)

const manualSelectionConfirmed = computeSeigniorageTable(
  project([item('manual-1', 'DATA-SSR-001', 10)]),
  charges,
  [],
  {
    'DATA-SSR-001': {
      applicable: true,
      rows: [{
        seig_code: 'SEIG_ORDINARY_SAND',
        mode: 'RECIPE_MATERIAL_RATIO',
        quantity_basis: 'ITEM_QTY_X_RATIO',
        quantity_ratio: 0.4,
        conversion_factor: 1,
        charge_unit: 'cum',
        material_key: 'manual-sand',
        material_label: 'Hand-entered filling',
        material_desc: 'Hand-entered filling'
      }]
    }
  }
)
assert.equal(manualSelectionConfirmed.rows[0].seigRate, 40.5)
assert.equal(manualSelectionConfirmed.rows[0].seigniorage, 4 * 40.5)

const graniteCalc = computeSeigniorageTable(
  project([item('i2', 'IRR-B-1', 100)]),
  charges,
  [],
  { 'IRR-B-1': policy('SEIG_BLACK_GRANITE_BELOW') }
)
assert.equal(graniteCalc.totalSeigniorage, 358800)
// Granite is charged at 0.4x, not 0.8x.
assert.equal(graniteCalc.totalPermit, 143520)

// Each row carries the percentage it was charged at.
assert.equal(stoneCalc.rows[0].permitPercent, 80)
assert.equal(graniteCalc.rows[0].permitPercent, 40)

// Two rows of the same mineral both use the GO rate, with no project settings.
const multiCalc = computeSeigniorageTable(
  project([item('i1', 'IRR-A-1', 100), item('i3', 'IRR-A-2', 50)]),
  charges,
  [],
  { 'IRR-A-1': policy('SEIG_BUILDING_STONE'), 'IRR-A-2': policy('SEIG_BUILDING_STONE') }
)
assert.equal(multiCalc.rows.length, 2)
assert.equal(multiCalc.totalSeigniorage, 11700 + 5850)
assert.equal(multiCalc.totalPermit, (11700 + 5850) * 0.8)

// Repeated project occurrences of one code contribute to one total quantity.
const repeatedCodeCalc = computeSeigniorageTable(
  project([item('i4', 'IRR-C-1', 100), item('i5', 'IRR-C-1', 50)]),
  charges,
  [],
  {
    'IRR-C-1': materialPolicy([
      {
        seigCode: 'SEIG_BUILDING_STONE',
        ratio: 0.4,
        label: 'Stone',
        key: 'STONE'
      }
    ])
  }
)
assert.equal(repeatedCodeCalc.rows.length, 1)
assert.equal(repeatedCodeCalc.rows[0].itemQuantity, 150)
assert.equal(repeatedCodeCalc.rows[0].quantityRatio, 0.4)
assert.equal(repeatedCodeCalc.rows[0].quantity, 60)
assert.equal(repeatedCodeCalc.rows[0].seigniorage, 60 * 117)

// Recipe materials with the same mineral/rate become one row and add ratios.
const combinedMaterialCalc = computeSeigniorageTable(
  project([item('i6', 'IRR-D-1', 100), item('i7', 'IRR-D-1', 50)]),
  [
    charge('SEIG_BUILDING_STONE', 'Building Stone', 117, 78),
    charge('SEIG_ORDINARY_SAND', 'Ordinary Sand', 40.5, 27)
  ],
  [],
  {
    'IRR-D-1': materialPolicy([
      {
        seigCode: 'SEIG_BUILDING_STONE',
        ratio: 0.1,
        label: 'Coarse aggregate 10-20 mm',
        key: 'CA_10_20'
      },
      {
        seigCode: 'SEIG_BUILDING_STONE',
        ratio: 0.2,
        label: 'Coarse aggregate 20-40 mm',
        key: 'CA_20_40'
      },
      {
        seigCode: 'SEIG_ORDINARY_SAND',
        ratio: 0.4,
        label: 'Sand',
        key: 'SAND'
      }
    ])
  }
)
assert.equal(combinedMaterialCalc.rows.length, 2)
const combinedStone = combinedMaterialCalc.rows.find(
  (row) => row.charge?.seig_code === 'SEIG_BUILDING_STONE'
)
const combinedSand = combinedMaterialCalc.rows.find(
  (row) => row.charge?.seig_code === 'SEIG_ORDINARY_SAND'
)
assert.ok(combinedStone)
assert.ok(combinedSand)
assert.equal(combinedStone.itemQuantity, 150)
assert.equal(combinedStone.quantityRatio, 0.3)
assert.equal(combinedStone.quantity, 45)
assert.equal(combinedStone.seigniorage, 45 * 117)
assert.equal(combinedStone.materialLabel, 'Building Stone')
assert.equal(combinedSand.itemQuantity, 150)
assert.equal(combinedSand.quantityRatio, 0.4)
assert.equal(combinedSand.quantity, 60)
assert.equal(combinedSand.seigniorage, 60 * 40.5)
assert.equal(combinedSand.permitPercent, 0)
assert.equal(combinedSand.permit, 0)

// A live Supabase policy must replace an older policy embedded in a saved
// project recipe; otherwise existing projects would keep Sand (Others).
const refreshedSandProject = project([item('sand-refresh', 'IRR-SAND-1', 10)])
refreshedSandProject.dashboardSnapshot = {
  recipes: {
    'sand-refresh': {
      seigniorageApplicability: policy('SEIG_SAND_OTHERS')
    }
  }
}
const refreshedSandCalc = computeSeigniorageTable(
  refreshedSandProject,
  [
    charge('SEIG_SAND_OTHERS', 'Sand (Others)', 141, 94),
    charge('SEIG_ORDINARY_SAND', 'Ordinary Sand', 40.5, 27)
  ],
  [],
  { 'IRR-SAND-1': policy('SEIG_ORDINARY_SAND') }
)
assert.equal(refreshedSandCalc.rows.length, 1)
assert.equal(refreshedSandCalc.rows[0].charge?.seig_code, 'SEIG_ORDINARY_SAND')
assert.equal(refreshedSandCalc.rows[0].seigRate, 40.5)
assert.equal(refreshedSandCalc.rows[0].seigniorage, 405)
assert.equal(refreshedSandCalc.rows[0].permit, 0)

// A full-item earth quantity stored in CUM uses the M3 rate, while the MT
// value remains only as the statutory reference rate.
const fullMorramCalc = computeSeigniorageTable(
  project([item('morram-full', 'IRR-PMW-3-9', 100)]),
  [charge('SEIG_MORRAM_GRAVEL_EARTH', 'Morram / Gravel & Ordinary Earth', 39, 26)],
  [],
  {
    'IRR-PMW-3-9': {
      applicable: true,
      rows: [
        {
          seig_code: 'SEIG_MORRAM_GRAVEL_EARTH',
          mode: 'FULL_ITEM_QUANTITY',
          quantity_basis: 'ITEM_QTY',
          quantity_ratio: 1,
          charge_unit: 'CUM',
          item_unit: 'CUM',
          conversion_factor: 1,
          conversion_required: false,
          material_label: 'Morram / Gravel & Ordinary Earth'
        }
      ]
    }
  }
)
assert.equal(fullMorramCalc.rows.length, 1)
assert.equal(fullMorramCalc.rows[0].unit, 'CUM')
assert.equal(fullMorramCalc.rows[0].seigRate, 39)
assert.equal(fullMorramCalc.rows[0].seigniorage, 3900)

// A selected optional addition is billed from its own DATA material block.
// Base-only occurrences of the same SSR code must not enter the add-on total.
const baseCawItem = { ...item('caw-base', 'IRR-CAW-8-8', 100), unit: 'SQM' }
const addonCawItem = {
  ...item('caw-addon', 'IRR-CAW-8-8', 50),
  unit: 'SQM',
  dataVariant: {
    kind: 'optional_addition',
    key: 'addon:murum_bed_15cm',
    label: 'Add 15 cm thick murum bed below pitching',
    addonId: 'murum_bed_15cm'
  }
}
const cawProject = project([baseCawItem, addonCawItem])
cawProject.dashboardSnapshot = {
  recipes: {
    'caw-addon': {
      dataVariant: {
        addonId: 'murum_bed_15cm',
        additionAnalysis: {
          outputQuantity: 100,
          unit: 'SQM',
          sections: [
            {
              key: 'materials',
              lines: [
                {
                  description: 'Murum',
                  unit: 'cum',
                  quantity: 18
                }
              ]
            }
          ]
        }
      }
    }
  }
}
const cawPolicy = {
  applicable: true,
  rows: [
    {
      seig_code: 'SEIG_BUILDING_STONE',
      mode: 'RECIPE_MATERIAL_RATIO',
      quantity_basis: 'ITEM_QTY_X_RATIO',
      quantity_ratio: 0.5,
      conversion_factor: 1,
      charge_unit: 'CUM',
      material_key: 'STONE',
      material_label: 'Stone'
    }
  ],
  addons: [
    {
      addon_id: 'murum_bed_15cm',
      applicable: true,
      rows: [
        {
          seig_code: 'SEIG_MORRAM_GRAVEL_EARTH',
          mode: 'ADDON_MATERIAL_RATIO',
          quantity_basis: 'ITEM_QTY_X_RATIO',
          quantity_ratio: 0.18,
          conversion_required: true,
          conversion_factor: null,
          charge_unit: 'MT',
          material_key: 'SOIL_MORRAM_EARTH',
          material_desc: 'Murum'
        }
      ]
    }
  ]
}
const cawCalc = computeSeigniorageTable(
  cawProject,
  [
    charge('SEIG_BUILDING_STONE', 'Building Stone', 117, 78),
    charge('SEIG_MORRAM_GRAVEL_EARTH', 'Morram / Gravel & Ordinary Earth', 39, 26)
  ],
  [],
  { 'IRR-CAW-8-8': cawPolicy }
)
const cawStone = cawCalc.rows.find(
  (row) => row.charge?.seig_code === 'SEIG_BUILDING_STONE'
)
const cawMurum = cawCalc.rows.find(
  (row) => row.charge?.seig_code === 'SEIG_MORRAM_GRAVEL_EARTH'
)
assert.ok(cawStone)
assert.ok(cawMurum)
assert.equal(cawStone.itemQuantity, 150)
assert.equal(cawMurum.itemQuantity, 50)
assert.equal(cawMurum.quantityRatio, 0.18)
assert.equal(cawMurum.quantity, 9)
assert.equal(cawMurum.unit.toLowerCase(), 'cum')
assert.equal(cawMurum.conversionRequired, false)
assert.equal(cawMurum.seigniorage, 9 * 39)

// Fabricated hoist DATA is priced by capacity. Its reference fabricated-weight
// basis and Plummer-block hardware must never create an inferred mineral row.
const fabricatedHoist = item('gaw-2-11', 'IRR-GAW-2-11', 10)
fabricatedHoist.unit = 't capacity'
const fabricatedHoistCalc = computeSeigniorageTable(
  project([fabricatedHoist]),
  charges,
  [],
  {
    'IRR-GAW-2-11': {
      applicable: false,
      rows: [],
      reason: 'Fabricated mechanical item; no evidenced minor-mineral input.'
    }
  }
)
assert.equal(fabricatedHoistCalc.rows.length, 0)
assert.equal(fabricatedHoistCalc.totalSeigniorage, 0)

console.log('seigniorage permit fee: all assertions passed')
