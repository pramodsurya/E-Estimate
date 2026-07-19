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

const {
  auditPublishedRateAnalysis,
  calculateBaseRateAnalysis,
  calculateOptionalAddition,
  calculateRateAnalysis,
  publishedRateBlocks,
  recalculateRateAnalysis,
  updateRateAnalysisLine
} = loadTsModule(
  path.join(root, 'src/renderer/src/lib/rateAnalysis.ts'),
  {
    './supabase': { supabase: {} },
    './dataVariants': { applyDataVariantToRecipe: (recipe) => recipe, buildDataVariantSpec: () => ({}) },
    './projectItems': { projectItemKey: () => 'test' },
    './rateAnalysisVisibility': { parseRateAnalysisVisibility: () => ({}) }
  }
)

const abstract = [
  { label: 'A. Cost of Materials', amount: '3977420.45' },
  { label: 'B. Hire charges of Machinery', amount: '129608.40' },
  { label: 'C. Cost of Labour', amount: '381955.86' },
  { label: '', unit: 'Total', amount: '4488984.71' },
  { label: 'D. Add for excise duty', unit: '0.00%', percent: '0.00%', amount: '0.00' },
  { label: '(on 75 percent cost excluding cost of materials)', unit: 'Total', amount: '4488984.71' },
  { label: 'E. Add for transportation upto work site @', unit: '3%', percent: '3%', amount: '119322.61' },
  { label: '', unit: 'Total', amount: '4608307.32' },
  { label: "F. Add for contractor's profit and overheads on", amount: '' },
  { label: '', basis: '13.615%', percent: '13.615%', amount: '' },
  { label: '(A+B+C+D+E)', amount: '627421.04' },
  { label: 'Add 2 leads', amount: '' },
  { label: 'Add 1 km lead charges for fabricated parts', unit: 'Rs. 29.00', amount: '895.52' },
  { label: 'Unloading charges of fabricated parts Rs', unit: '135.30', amount: '4178.064' },
  { label: 'Total cost for', basis: '15.440', unit: 'tonne wt', amount: '5240801.94' },
  { label: '', basis: '90.00', unit: 't capacity', amount: '' },
  { label: '', basis: 'Rate per', unit: 'tonne wt', amount: '339430.20' },
  { label: 'Rate per tonne capacity of hoist', amount: '58231.10' }
].map((row) => ({ value: '', basis: '', unit: '', percent: '', ...row }))

const reconstructedDualBlocks = publishedRateBlocks(
  {
    base_rate: '58231.10',
    rate_values: [
      { label: 'Rate per tonne wt', value: '339430.20' },
      { label: 'Rate per tonne capacity of hoist', value: '58231.10' }
    ]
  },
  abstract,
  15.44,
  'tonne wt'
)
assert.equal(reconstructedDualBlocks.length, 2)
assert.deepEqual(
  reconstructedDualBlocks.map((block) => [block.outputQuantity, block.unit, block.rate, block.totalCost]),
  [
    [15.44, 'tonne wt', 339430.2, 5240801.94],
    [90, 't capacity', 58231.1, 5240801.94]
  ]
)
assert.equal(reconstructedDualBlocks[1].primary, true)

const recipe = {
  schemaVersion: 1,
  itemKey: 'test',
  itemSource: 'SSR',
  categoryKey: 'ssr_item',
  itemCode: 'IRR-GAW-1-3',
  description: 'Radial gate rope drum hoist',
  unit: 't capacity',
  outputQuantity: 90,
  year: '2026-27',
  overheadPercent: 13.615,
  sections: [
    {
      key: 'materials',
      label: 'A. Materials',
      lines: [{
        id: 'material-total', slNo: '1', description: 'Published materials', unit: 'LS',
        quantity: 1, rate: 3977420.45, amount: 3977420.45
      }]
    },
    { key: 'machinery', label: 'B. Machinery', lines: [] },
    { key: 'labour', label: 'C. Labour', lines: [] }
  ],
  storedValues: {
    sectionTotals: {
      materials: '3977420.45', machinery: '129608.40', labour: '381955.86'
    },
    labourExtract: [
      { label: 'labour component/unit qty', value: '4244.00', basis: '', unit: '', percent: '', amount: '' },
      { label: "Add contractor's profit and overhead charges", value: '577.80', basis: '', unit: '', percent: '13.615%', amount: '' },
      { label: "labour component/unit qty (including contractor's profit)", value: '4821.80', basis: '', unit: '', percent: '', amount: '' }
    ],
    abstract
  },
  publishedRate: 58231.1,
  publishedRateBlocks: [
    {
      key: 'weight', label: 'Rate per tonne wt', outputQuantity: 15.44,
      unit: 'tonne wt', totalCost: 5240801.94, rate: 339430.2,
      abstractEndIndex: 16, primary: false
    },
    {
      key: 'capacity', label: 'Rate per tonne capacity of hoist', outputQuantity: 90,
      unit: 't capacity', totalCost: 5240801.94, rate: 58231.1,
      abstractEndIndex: 17, primary: true
    }
  ],
  multiRateClassification: {
    kind: 'dual_measurement_basis', label: 'Dual measurement basis', adoptedRate: 58231.1,
    sourceRates: [339430.2, 58231.1], note: 'One cost expressed on two bases.',
    sourceQuantity: 15.44, sourceUnit: 'tonne wt'
  }
}

const published = calculateRateAnalysis(recipe)
assert.equal(published.sectionTotals.materials, 3977420.45)
assert.equal(published.sectionTotals.machinery, 129608.4)
assert.equal(published.sectionTotals.labour, 381955.86)
assert.equal(published.totalCost, 5240801.94)
assert.equal(published.ratePerUnit, 58231.1)

const recalculated = recalculateRateAnalysis(recipe)
assert.equal(recalculated.recalculation.sectionTotals.materials, '3977420.45')
assert.equal(recalculated.recalculation.sectionTotals.machinery, '129608.40')
assert.equal(recalculated.recalculation.sectionTotals.labour, '381955.86')
assert.equal(recalculated.recalculation.subtotal, '4488984.71')
assert.equal(recalculated.recalculation.finalCost, '5240801.94')
assert.equal(recalculated.recalculation.calculatedRate, '58231.10')

const rateRows = recalculated.recalculation.abstract.filter((row) =>
  /rate\s+per/i.test(`${row.label} ${row.basis} ${row.unit}`)
)
assert.equal(rateRows[0].amount, '339430.20')
assert.equal(rateRows[1].amount, '58231.10')

const publishedFirstRecipe = {
  schemaVersion: 1,
  itemKey: 'published-first',
  itemSource: 'SSR',
  categoryKey: 'ssr_item',
  itemCode: 'TEST-SSR-1',
  description: 'Published-first arithmetic test',
  unit: 'unit',
  outputQuantity: 10,
  year: '2026-27',
  overheadPercent: 10,
  sections: [
    {
      key: 'materials',
      label: 'A. Materials',
      lines: [
        {
          id: 'material-1', slNo: '1', description: 'Printed mismatch', unit: 'No.',
          quantity: 2, rate: 100, amount: 205,
          sourceValues: { quantity: '2.00', rate: '100.00', amount: '205.00' }
        },
        {
          id: 'material-2', slNo: '2', description: 'Printed match', unit: 'No.',
          quantity: 1, rate: 95, amount: 95,
          sourceValues: { quantity: '1.00', rate: '95.00', amount: '95.00' }
        }
      ]
    },
    {
      key: 'machinery',
      label: 'B. Machinery',
      lines: [{
        id: 'machine-1', slNo: '1', description: 'Machine', unit: 'Hour',
        quantity: 2, rate: 250, amount: 500,
        sourceValues: { quantity: '2.00', rate: '250.00', amount: '500.00' }
      }]
    },
    {
      key: 'labour',
      label: 'C. Labour',
      lines: [{
        id: 'labour-1', slNo: '1', description: 'Labour', unit: 'Day',
        quantity: 7, rate: 100, amount: 700,
        sourceValues: { quantity: '7.00', rate: '100.00', amount: '700.00' }
      }]
    }
  ],
  storedValues: {
    sectionTotals: { materials: '300.00', machinery: '500.00', labour: '700.00' },
    labourExtract: [],
    abstract: [
      { label: 'A. Cost of Materials', value: '', basis: '', unit: '', percent: '', amount: '300.00' },
      { label: 'B. Hire charges of Machinery', value: '', basis: '', unit: '', percent: '', amount: '500.00' },
      { label: 'C. Cost of Labour', value: '', basis: '', unit: '', percent: '', amount: '700.00' },
      { label: 'Total', value: '', basis: '', unit: 'Total', percent: '', amount: '1500.00' },
      { label: "D. Add contractor's profit and overheads", value: '', basis: '', unit: '', percent: '10%', amount: '150.00' },
      { label: 'Total cost for', value: '', basis: '10', unit: 'unit', percent: '', amount: '1650.00' },
      { label: 'Rate per unit', value: '', basis: '', unit: '', percent: '', amount: '165.00' }
    ]
  },
  publishedRate: 165
}

const noEdit = recalculateRateAnalysis(publishedFirstRecipe)
assert.deepEqual(noEdit.recalculation.affectedSections, [])
assert.equal(noEdit.recalculation.sectionTotals.materials, '300.00')
assert.equal(noEdit.recalculation.sectionTotals.machinery, '500.00')
assert.equal(noEdit.recalculation.sectionTotals.labour, '700.00')
assert.equal(noEdit.recalculation.finalCost, '1650.00')
assert.equal(noEdit.recalculation.calculatedRate, '165.00')

const audit = auditPublishedRateAnalysis(publishedFirstRecipe)
const materialAudit = audit.sections.find((section) => section.section === 'materials')
const machineryAudit = audit.sections.find((section) => section.section === 'machinery')
assert.equal(materialAudit.publishedTotal, 300)
assert.equal(materialAudit.recalculatedTotal, 295)
assert.equal(materialAudit.difference, -5)
assert.equal(materialAudit.mismatchedRows, 1)
assert.equal(machineryAudit.publishedTotal, 500)
assert.equal(machineryAudit.recalculatedTotal, 500)
assert.equal(audit.rows.find((row) => row.lineId === 'material-1').status, 'mismatch')

const quantityEdited = updateRateAnalysisLine(
  publishedFirstRecipe,
  'materials',
  'material-1',
  { quantity: 3 }
)
const edited = recalculateRateAnalysis(quantityEdited)
assert.deepEqual(edited.recalculation.affectedSections, ['materials'])
assert.deepEqual(edited.sections[0].lines[0].editedFields, ['quantity'])
assert.equal(edited.sections[0].lines[0].amount, 300)
assert.equal(edited.sections[0].lines[1].amount, 95)
assert.equal(edited.recalculation.sectionTotals.materials, '395.00')
assert.equal(edited.recalculation.sectionTotals.machinery, '500.00')
assert.equal(edited.recalculation.sectionTotals.labour, '700.00')
assert.equal(edited.recalculation.finalCost, '1754.50')
assert.equal(edited.recalculation.calculatedRate, '175.45')

const withAddedRow = {
  ...publishedFirstRecipe,
  sections: publishedFirstRecipe.sections.map((section) => section.key !== 'materials'
    ? section
    : {
        ...section,
        lines: [...section.lines, {
          id: 'material-added', slNo: '3', description: 'User addition', unit: 'No.',
          quantity: 1, rate: 20, amount: 0, sourceValues: {}, userAdded: true,
          editedFields: ['description', 'unit', 'quantity', 'rate']
        }]
      })
}
const added = recalculateRateAnalysis(withAddedRow)
assert.equal(added.sections[0].lines[0].amount, 205)
assert.equal(added.sections[0].lines[1].amount, 95)
assert.equal(added.sections[0].lines[2].amount, 20)
assert.equal(added.recalculation.sectionTotals.materials, '320.00')

const allowanceOnly = recalculateRateAnalysis({
  ...publishedFirstRecipe,
  areaAllowancePercent: 40,
  areaAllowanceLabel: 'Test area allowance'
})
assert.deepEqual(allowanceOnly.recalculation.affectedSections, ['labour'])
assert.equal(allowanceOnly.recalculation.sectionTotals.labour, '700.00')
const allowanceSummary = calculateRateAnalysis(allowanceOnly)
assert.equal(allowanceSummary.labourBaseCost, 700)
assert.equal(allowanceSummary.areaAllowanceAmount, 280)
assert.equal(allowanceSummary.sectionTotals.labour, 980)

const np3Recipe = {
  ...publishedFirstRecipe,
  publishedRate: 609.5,
  dataVariant: {
    kind: 'type', key: 'type:np3-class', label: 'NP3 Class',
    rate: 670.45, baseRate: 609.5, rateMultiplier: 1.1,
    addOnRate: 60.95, addPercent: 10, baseVariantLabel: 'NP2 Class', postRate: true
  },
  storedValues: {
    ...publishedFirstRecipe.storedValues,
    abstract: publishedFirstRecipe.storedValues.abstract.map((row) =>
      row.label === 'Total cost for' ? { ...row, amount: '7967.30' } : row
    )
  }
}
const calculatedNp2 = calculateBaseRateAnalysis(np3Recipe)
const adoptedNp3 = calculateRateAnalysis(np3Recipe)
assert.equal(calculatedNp2.totalCost, 7967.3)
assert.equal(calculatedNp2.ratePerUnit, 796.73)
assert.equal(adoptedNp3.totalCost, 8764.03)
assert.equal(adoptedNp3.ratePerUnit, 876.4)
assert.notEqual(adoptedNp3.ratePerUnit, 670.45, 'historical NP3 rupee rate must not be adopted')

const recalculatedNp3 = calculateRateAnalysis({ ...edited, dataVariant: np3Recipe.dataVariant })
assert.equal(recalculatedNp3.totalCost, 1929.95)
assert.equal(recalculatedNp3.ratePerUnit, 193)

const missingDerivedRate = calculateBaseRateAnalysis({
  ...publishedFirstRecipe,
  outputQuantity: 10,
  recalculation: {
    sectionTotals: { materials: '1244.54', machinery: '0.00', labour: '5068.00' },
    subtotal: '6469.84', finalCost: '7350.71', calculatedRate: '',
    publishedBaseRate: '609.50', labourExtract: [], abstract: [], trace: [],
    warnings: [], affectedSections: ['labour']
  }
})
assert.equal(missingDerivedRate.ratePerUnit, 735.07)

const ccdwNp3WithAreaAllowance = recalculateRateAnalysis({
  ...publishedFirstRecipe,
  itemCode: 'IRR-CCDW-6-1',
  unit: 'JOINTS',
  outputQuantity: 10,
  overheadPercent: 13.615,
  areaAllowancePercent: 40,
  sections: [
    {
      key: 'materials', label: 'A. Materials',
      lines: [{ id: 'm', description: 'Joint materials', unit: 'LS', quantity: 1, rate: 701.84, amount: 701.84 }]
    },
    { key: 'machinery', label: 'B. Machinery', lines: [] },
    {
      key: 'labour', label: 'C. Labour',
      lines: [{ id: 'l', description: 'Joint labour', unit: 'LS', quantity: 1, rate: 4120, amount: 4120 }]
    }
  ],
  storedValues: {
    sectionTotals: { materials: '701.84', machinery: '0.00', labour: '4120.00' },
    labourExtract: [],
    abstract: [
      { label: 'A. Cost of Materials', amount: '701.84' },
      { label: 'B. Hire charges of Machinery', amount: '0.00' },
      { label: 'C. Cost of Labour', amount: '4120.00' },
      { label: '', amount: '4821.84' },
      { label: "D. Add for contractor's profit and overheads on (A+B+C)", percent: '13.615%', amount: '656.49' },
      { label: 'Total cost for', basis: '10.00', unit: 'Joints', amount: '5478.33' },
      { label: 'Rate per Joint', basis: '(A+B+C+D)/10.0', amount: '547.80' },
      { label: 'NP3 source derivation only', amount: '' },
      { label: 'Add for source variant @', percent: '10%', amount: '54.78' }
    ].map((row) => ({ value: '', unit: '', basis: '', percent: '', ...row }))
  },
  dataVariant: {
    kind: 'type', key: 'type:np3-class', label: 'NP3 Class', rate: 602.58,
    baseRate: 547.8, addPercent: 10, postRate: true, postRateMultiplier: 1.1,
    baseVariantLabel: 'NP2 Class'
  }
})
const ccdwBase = calculateBaseRateAnalysis(ccdwNp3WithAreaAllowance)
const ccdwNp3 = calculateRateAnalysis(ccdwNp3WithAreaAllowance)
assert.equal(ccdwBase.totalCost, 7350.71)
assert.equal(ccdwBase.ratePerUnit, 735.07)
assert.equal(ccdwNp3.ratePerUnit, 808.58)
assert.equal(ccdwNp3WithAreaAllowance.recalculation.abstract.length, 7)
assert.equal(
  ccdwNp3WithAreaAllowance.recalculation.abstract.some((row) => /source variant/i.test(row.label)),
  false
)

const dawDepthRecipe = {
  ...publishedFirstRecipe,
  publishedRate: 346,
  dataVariant: {
    kind: 'quantity_band', key: 'band:12:18', label: 'Beyond 12 m up to 18 m',
    rate: 346, baseRate: 285.9, postRate: true,
    postRateStepPercent: 10, postRateSteps: 2,
    baseVariantLabel: 'Up to 6 m'
  },
  recalculation: {
    sectionTotals: { materials: '400.00', machinery: '300.00', labour: '180.00' },
    subtotal: '880.00', finalCost: '1000.00', calculatedRate: '100.00',
    publishedBaseRate: '285.90', labourExtract: [], abstract: [], trace: [],
    warnings: [], affectedSections: ['materials']
  },
  storedValues: {
    ...publishedFirstRecipe.storedValues,
    abstract: publishedFirstRecipe.storedValues.abstract.map((row) =>
      row.label === 'Total cost for' ? { ...row, amount: '1000.00' } : row
    )
  }
}
const calculatedDawBase = calculateBaseRateAnalysis(dawDepthRecipe)
const adoptedDawDepth = calculateRateAnalysis(dawDepthRecipe)
assert.equal(calculatedDawBase.ratePerUnit, 100)
assert.equal(adoptedDawDepth.totalCost, 1210)
assert.equal(adoptedDawDepth.ratePerUnit, 121)
assert.notEqual(adoptedDawDepth.ratePerUnit, 346, 'historical DAW depth-band rate must not be adopted')

const dawFourSteps = calculateRateAnalysis({
  ...dawDepthRecipe,
  outputQuantity: 96,
  dataVariant: {
    ...dawDepthRecipe.dataVariant,
    key: 'band:24:30', label: 'Beyond 24 m up to 30 m',
    rate: 418.7, postRateSteps: 4
  },
  recalculation: {
    ...dawDepthRecipe.recalculation,
    finalCost: '30750.72', calculatedRate: '320.32'
  }
})
assert.equal(dawFourSteps.ratePerUnit, 468.99)
assert.equal(dawFourSteps.totalCost, 45023.04)

const recalculatedDawSteps = recalculateRateAnalysis({
  ...publishedFirstRecipe,
  itemCode: 'IRR-DAW-1-10',
  unit: 'Rm',
  outputQuantity: 10,
  overheadPercent: 0,
  sections: [
    {
      key: 'materials', label: 'A. Materials',
      lines: [{
        id: 'daw-material', description: 'Changed drilling input', unit: 'LS',
        quantity: 1, rate: 1000, amount: 1000, editedFields: ['amount']
      }]
    },
    { key: 'machinery', label: 'B. Machinery', lines: [] },
    { key: 'labour', label: 'C. Labour', lines: [] }
  ],
  storedValues: {
    sectionTotals: { materials: '900.00', machinery: '0.00', labour: '0.00' },
    labourExtract: [],
    abstract: [
      { label: 'A. Cost of Materials', amount: '900.00' },
      { label: 'B. Hire charges of Machinery', amount: '0.00' },
      { label: 'C. Cost of Labour', amount: '0.00' },
      { label: '', unit: 'Total', amount: '900.00' },
      { label: 'Total cost for', basis: '10.00', unit: 'Rm', amount: '900.00' },
      { label: 'Rate per Rm', amount: '90.00' },
      { label: 'Upto 6 m from surface', amount: '90.00' },
      { label: 'Beyond 6 m upto 12 m from surface', amount: '' },
      { label: 'Upto 6 m from surface', basis: 'Rate per', unit: 'Rm', amount: '90.00' },
      { label: 'Add for redrilling through partially set grout / additional', amount: '' },
      { label: 'extension rods / reduction in rate of drilling etc @', percent: '10%', amount: '9.00' },
      { label: 'Beyond 6 m upto 12 m from surface', unit: 'Rate / Rm', amount: '99.00' },
      { label: 'Beyond 12 m upto 18 m from surface', amount: '' },
      { label: 'For 6 m to 12 m from surface', basis: 'Rate per', unit: 'Rm', amount: '99.00' },
      { label: 'Add for redrilling through partially set grout / additional', amount: '' },
      { label: 'extension rods / reduction in rate of drilling etc @', percent: '10%', amount: '9.90' },
      { label: 'Beyond 12 m upto 18 m from surface', unit: 'Rate / Rm', amount: '108.90' }
    ].map((row) => ({ value: '', unit: '', basis: '', percent: '', ...row }))
  },
  dataVariant: {
    kind: 'quantity_band', key: 'band:12:18', label: 'Beyond 12 m up to 18 m',
    rate: 108.9, baseRate: 90, postRate: true,
    postRateStepPercent: 10, postRateSteps: 2,
    baseVariantLabel: 'Up to 6 m'
  }
})
const dawStepAmounts = recalculatedDawSteps.recalculation.abstract
  .filter((row) => /reduction in rate of drilling|Beyond (?:6|12) m.*Rate \/ Rm/i.test(`${row.label} ${row.unit}`))
  .map((row) => Number(row.amount))
assert.deepEqual(dawStepAmounts, [10, 110, 11, 121])
assert.equal(recalculatedDawSteps.recalculation.calculatedRate, '100.00')

const cawAddonRecipe = {
  ...publishedFirstRecipe,
  itemCode: 'IRR-CAW-8-1',
  unit: 'sqm',
  outputQuantity: 100,
  overheadPercent: 13.615,
  publishedRate: 423,
  storedValues: {
    ...publishedFirstRecipe.storedValues,
    abstract: publishedFirstRecipe.storedValues.abstract.map((row) =>
      row.label === 'Total cost for' ? { ...row, amount: '33013.96' } : row
    )
  },
  dataVariant: {
    kind: 'optional_addition', key: 'addon:murum_bed_15cm',
    label: 'If 15 cm thick Murum bed is provided', rate: 423,
    baseRate: 330.1, addOnRate: 92.9, addonId: 'murum_bed_15cm',
    additionAnalysis: {
      outputQuantity: 100,
      unit: 'sqm',
      overheadPercent: 13.615,
      sections: [
        {
          key: 'materials', label: 'A. Materials',
          lines: [{ id: 'm', slNo: '1', description: 'Murum', unit: 'cum', quantity: 18, rate: 313, amount: 5634 }]
        },
        { key: 'machinery', label: 'B. Machinery', lines: [] },
        {
          key: 'labour', label: 'C. Labour',
          lines: [{ id: 'l', slNo: '1', description: 'Mazdoor', unit: 'Day', quantity: 4, rate: 635, amount: 2540 }]
        }
      ]
    }
  }
}
const calculatedCawBase = calculateBaseRateAnalysis(cawAddonRecipe)
const calculatedCawAddon = calculateOptionalAddition(cawAddonRecipe)
const adoptedCaw = calculateRateAnalysis(cawAddonRecipe)
assert.equal(calculatedCawBase.ratePerUnit, 330.14)
assert.equal(calculatedCawAddon.totalCost, 9286.89)
assert.equal(calculatedCawAddon.ratePerUnit, 92.87)
assert.equal(adoptedCaw.totalCost, 42300.85)
assert.equal(adoptedCaw.ratePerUnit, 423.01)
assert.notEqual(adoptedCaw.ratePerUnit, 423, 'historical combined CAW rate must not be adopted')

const cawAddonWithAreaAllowance = calculateOptionalAddition({
  ...cawAddonRecipe,
  areaAllowancePercent: 25
})
assert.equal(cawAddonWithAreaAllowance.labourAllowanceAmount, 635)
assert.equal(cawAddonWithAreaAllowance.sectionTotals.labour, 3175)
assert.equal(cawAddonWithAreaAllowance.totalCost, 10008.35)

console.log('Rate-analysis published-first, audit, and dual-measurement tests passed.')
