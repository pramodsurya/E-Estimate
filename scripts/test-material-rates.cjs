// Per-project monthly cement/steel rates: alias resolution, circular selection,
// unit conversion, and re-pricing of published DATA lines.
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.join(__dirname, '..')

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
  applyMaterialRateOverrides,
  usageLabel,
  circularsFromPeriods,
  convertMasterRate,
  normalizeMaterialDesc,
  periodAt,
  periodForDate,
  resolveMaterialRate
} = loadTsModule(path.join(root, 'src/renderer/src/lib/materialRates.ts'), {
  './supabase': { supabase: {} }
})

// --- normalization must match the SQL that seeded ssr_material_alias ---------
assert.equal(normalizeMaterialDesc('  Cement   for  Mix '), 'cement for mix')
assert.equal(normalizeMaterialDesc('Rein.Steel with 5 % wastage'), 'rein.steel with 5 % wastage')
assert.equal(
  normalizeMaterialDesc('Structural steel\nplates / flats'),
  'structural steel plates / flats'
)

// --- master rates are quoted per tonne; DATA lines are usually per kg --------
assert.equal(convertMasterRate(5100, 'tonne', 'kg'), 5.1)
assert.equal(convertMasterRate(5100, 'MT', 'Kg'), 5.1)
assert.equal(convertMasterRate(56000, 'tonne', 'tonne'), 56000)
assert.equal(convertMasterRate(5100, 'tonne', 'cum'), null, 'volume is not weight-comparable')
assert.equal(convertMasterRate(20, 'tonne', 'LS'), null, 'lump sum must never be converted')

// --- circular selection ------------------------------------------------------
const periods = [
  {
    materialCode: 'CEM_OPC43',
    rate: 5100,
    effectiveFrom: '2025-06-01',
    effectiveTo: '2026-04-30',
    sorYear: '2025-26',
    source: 'SoR 2025-26'
  },
  {
    materialCode: 'CEM_OPC43',
    rate: 4900,
    effectiveFrom: '2026-05-01',
    effectiveTo: '2026-05-31',
    sorYear: '2025-26',
    source: 'G.O. monthly material circular - May 2026'
  },
  {
    materialCode: 'STEEL_TMT_A',
    rate: 56000,
    effectiveFrom: '2026-05-01',
    effectiveTo: '2026-05-31',
    sorYear: '2025-26',
    source: 'G.O. monthly material circular - May 2026'
  }
]

assert.equal(periodForDate(periods, 'CEM_OPC43', '2026-05-15').rate, 4900)
assert.equal(periodForDate(periods, 'CEM_OPC43', '2025-12-01').rate, 5100)
assert.equal(
  periodForDate(periods, 'CEM_OPC43', '2025-01-01'),
  null,
  'a date before the first circular must not borrow a later rate'
)
assert.equal(
  periodForDate(periods, 'CEM_OPC43', '2026-06-15'),
  null,
  'an expired circular must not apply after its effective_to'
)
assert.equal(periodAt(periods, 'STEEL_TMT_A', '2026-05-01').rate, 56000)

const circulars = circularsFromPeriods(periods)
assert.equal(circulars.length, 2, 'rows sharing an effective_from are one circular')
assert.equal(circulars[0].effectiveFrom, '2026-05-01', 'newest circular sorts first')
assert.deepEqual(circulars[0].materialCodes.sort(), ['CEM_OPC43', 'STEEL_TMT_A'])

// --- resolution order: override > monthly > yearly > none --------------------
const yearlyRates = new Map([['CEM_OPC43', 5000], ['CEM_PPC', 4800]])
const baseContext = { overrides: {}, periods, yearlyRates, asOf: '2026-05-15', sorYear: '2025-26' }

assert.equal(resolveMaterialRate('CEM_OPC43', baseContext).origin, 'MONTHLY')
assert.equal(resolveMaterialRate('CEM_OPC43', baseContext).rate, 4900)
assert.equal(
  resolveMaterialRate('CEM_PPC', baseContext).origin,
  'YEARLY',
  'a material with no circular falls back to the published SOR rate'
)
assert.equal(resolveMaterialRate('PH_PIG_IRON_FOUNDRY', baseContext).origin, 'NONE')

const overridden = resolveMaterialRate('CEM_OPC43', {
  ...baseContext,
  overrides: {
    CEM_OPC43: { rate: 5250, source: 'MANUAL', label: 'Project rate', setAt: '2026-08-14' }
  }
})
assert.equal(overridden.origin, 'OVERRIDE')
assert.equal(overridden.rate, 5250, 'the project rate must win over any published rate')

// --- re-pricing published DATA lines ----------------------------------------
const aliases = new Map([
  ['cement for mix', 'CEM_OPC43'],
  ['rein.steel with 5 % wastage', 'STEEL_TMT_A'],
  ['steel wedges', 'STEEL_TMT_A']
])
const materials = new Map([
  ['CEM_OPC43', { materialCode: 'CEM_OPC43', name: 'OPC 43', unit: 'tonne', category: 'CEMENT' }],
  ['STEEL_TMT_A', { materialCode: 'STEEL_TMT_A', name: 'TMT A', unit: 'tonne', category: 'STEEL' }]
])
const overrides = {
  CEM_OPC43: {
    rate: 4900,
    source: 'MONTHLY_CIRCULAR',
    effectiveFrom: '2026-05-01',
    label: 'G.O. May 2026',
    setAt: '2026-08-14'
  }
}
const recipe = {
  itemSource: 'SSR',
  categoryKey: 'ssr_item',
  itemCode: 'IRR-CAW-8-10',
  sections: [
    {
      key: 'materials',
      label: 'A. Materials',
      lines: [
        {
          id: 'm1',
          description: 'Cement for mix',
          unit: 'kg',
          quantity: 3232,
          rate: 5.1,
          amount: 16483.2
        },
        {
          id: 'm2',
          description: 'Rein.Steel with 5 % wastage',
          unit: 'kg',
          quantity: 100,
          rate: 57,
          amount: 5700
        },
        // Lump-sum unit: the override must not be forced onto it.
        { id: 'm3', description: 'Steel wedges', unit: 'LS', quantity: 1, rate: 20, amount: 20 }
      ]
    },
    { key: 'labour', label: 'C. Labour', lines: [] }
  ]
}

const applied = applyMaterialRateOverrides(recipe, overrides, aliases, materials)
assert.equal(applied.applications.length, 1, 'only the overridden material re-prices')

const lines = applied.recipe.sections[0].lines
assert.equal(lines[0].rate, 4.9, 'tonne rate converts to the line kg basis')
assert.equal(lines[0].amount, 15836.8, 'amount rebuilds from quantity x new rate')
assert.ok(
  lines[0].editedFields.includes('rate'),
  'the line must be marked as a rate edit so recalculateRateAnalysis rebuilds the abstract'
)
assert.equal(lines[0].rateOverride.publishedRate, 5.1, 'the published rate stays in the audit trail')
assert.equal(lines[1].rate, 57, 'steel has no override and must keep its published rate')
assert.equal(lines[1].editedFields, undefined)
assert.equal(lines[2].rate, 20, 'a lump-sum line is never re-priced')

// An empty override set must leave the recipe object untouched.
const untouched = applyMaterialRateOverrides(recipe, {}, aliases, materials)
assert.equal(untouched.recipe, recipe)
assert.equal(untouched.applications.length, 0)

// Overriding to the same value must not force a recalculation - but the row is
// still governed by the project rate, so it must carry the same provenance as one
// whose number moved. Cement really does sit at 5,100 a tonne in both the yearly
// SOR and the circular, and without this the row read as an untouched published
// rate and lost its marking on the next recompute.
const noop = applyMaterialRateOverrides(
  recipe,
  {
    CEM_OPC43: { rate: 5100, source: 'MANUAL', label: 'Same', setAt: '2026-08-14' }
  },
  aliases,
  materials
)
assert.equal(noop.applications.length, 0, 'an unchanged rate must not force a recalculation')
const noopCement = noop.recipe.sections[0].lines[0]
assert.equal(noopCement.rate, 5.1, 'a coinciding rate leaves the number alone')
assert.ok(
  noopCement.editedFields.includes('rate'),
  'a coinciding project rate is still marked as driven by the project rate'
)
assert.equal(
  noopCement.rateOverride.publishedRate,
  5.1,
  'the coinciding published rate stays in the audit trail'
)
// Applying it twice must settle, or every recompute would report a change.
const noopAgain = applyMaterialRateOverrides(
  noop.recipe,
  {
    CEM_OPC43: { rate: 5100, source: 'MANUAL', label: 'Same', setAt: '2026-08-14' }
  },
  aliases,
  materials
)
assert.equal(noopAgain.recipe, noop.recipe, 'a second identical application is a no-op')

// Created SSR DATA uses the same rate engine. A selected SOR resource remains linked,
// while a resource whose rate was manually typed remains intentionally fixed.
const createdDataRecipe = {
  ...recipe,
  itemCode: 'DATA-SSR-1',
  sections: [
    {
      key: 'materials',
      label: 'A. Materials',
      lines: [
        {
          id: 'linked-steel',
          description: 'Rein.Steel with 5 % wastage',
          unit: 'kg',
          quantity: 100,
          rate: 57,
          amount: 5700,
          materialCode: 'STEEL_TMT_A',
          userAdded: false
        },
        {
          id: 'manual-steel',
          description: 'Manual steel extract',
          unit: 'kg',
          quantity: 10,
          rate: 61,
          amount: 610,
          materialCode: 'STEEL_TMT_A',
          userAdded: true,
          editedFields: ['rate']
        }
      ]
    }
  ]
}
const createdApplied = applyMaterialRateOverrides(
  createdDataRecipe,
  {
    STEEL_TMT_A: {
      rate: 56000,
      source: 'MONTHLY_CIRCULAR',
      effectiveFrom: '2026-05-01',
      label: 'G.O. May 2026',
      setAt: '2026-08-14'
    }
  },
  aliases,
  materials
)
assert.equal(createdApplied.recipe.sections[0].lines[0].rate, 56)
assert.equal(createdApplied.recipe.sections[0].lines[0].rateOverride.publishedRate, 57)
assert.equal(createdApplied.recipe.sections[0].lines[1].rate, 61)
assert.deepEqual(createdApplied.skipped, [{
  materialCode: 'STEEL_TMT_A',
  lineDescription: 'Manual steel extract',
  reason: 'MANUAL_RATE'
}])

// A later adopted circular must retain the original published rate in the audit data,
// rather than treating the previously adopted circular as the source rate.
const laterApplied = applyMaterialRateOverrides(
  createdApplied.recipe,
  {
    STEEL_TMT_A: {
      rate: 58000,
      source: 'MONTHLY_CIRCULAR',
      effectiveFrom: '2026-06-01',
      label: 'G.O. June 2026',
      setAt: '2026-08-14'
    }
  },
  aliases,
  materials
)
assert.equal(laterApplied.recipe.sections[0].lines[0].rate, 58)
assert.equal(laterApplied.recipe.sections[0].lines[0].rateOverride.publishedRate, 57)

// "Used by" identifies an SSR item by its code, because the SSR description is a long
// specification that truncates to nothing useful. SOR and Project DATA use the name.
assert.equal(
  usageLabel({
    code: 'IRR-CAW-8-10',
    description: 'Providing and laying insitu vibrated cement concrete M15 grade...',
    source: 'SSR'
  }),
  'IRR-CAW-8-10',
  'SSR usage must be labelled by code'
)
assert.equal(
  usageLabel({
    code: 'CEM_OPC43',
    description: 'Ordinary Portland Cement 43/53 Grade',
    source: 'SOR'
  }),
  'Ordinary Portland Cement 43/53 Grade',
  'SOR usage must be labelled by description'
)
assert.equal(
  usageLabel({ code: 'PD-1', description: 'Bund formation DATA', source: 'PROJECT_DATA' }),
  'Bund formation DATA',
  'Project DATA usage must be labelled by description'
)
assert.equal(
  usageLabel({ code: 'IRR-GAW-2-1', description: '', source: 'SSR' }),
  'IRR-GAW-2-1',
  'a missing description must fall back to the code'
)
assert.equal(
  usageLabel({ code: 'X_1', description: '', source: 'SOR' }),
  'X_1',
  'a SOR row with no description must fall back to its code'
)

console.log('material rate overrides: all assertions passed')
