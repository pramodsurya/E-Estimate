// What survives a change of SOR year, row by row and field by field.
//
// The rule, in the estimator's words:
//   - rate edited      -> that row keeps the edited rate, nothing else is held back
//   - quantity edited  -> the quantity is kept, the rate comes from the new year
//   - both edited      -> the row is left alone, and everything recalculates around it

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(relative) {
  const filePath = path.join(root, relative)
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filePath
  })
  const module_ = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module_, module_.exports, require)
  return module_.exports
}

const { mergeSavedRecipe, mergeRecipeSections, mergeRecipeSectionsWithReport } = loadTsModule(
  'src/renderer/src/lib/recipeMerge.ts'
)

const line = (over = {}) => ({
  id: 'materials-1-0',
  slNo: '1',
  description: 'Cement',
  unit: 'tonne',
  quantity: 2,
  rate: 100,
  amount: 200,
  ...over
})

const section = (lines) => ({ key: 'materials', label: 'Materials', lines })
const recipe = (sections, over = {}) => ({
  itemKey: 'SSR:x',
  itemSource: 'SSR',
  year: '2026-27',
  zone: 'zone_3',
  sections,
  ...over
})

// --- Rate edited: the rate is kept, everything else revalues ---------------
{
  const source = section([line({ quantity: 3, rate: 130, amount: 390 })])
  const saved = section([
    line({ quantity: 2, rate: 100, amount: 200, editedFields: ['rate'] })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 100, 'an edited rate must survive the new year')
  assert.equal(merged.quantity, 3, 'the quantity must come from the new year')
  assert.deepEqual(merged.editedFields, ['rate'], 'the row must stay marked as rate-edited')
}

// --- Quantity edited: the quantity is kept, the rate is the new year's -----
{
  const source = section([line({ quantity: 3, rate: 130, amount: 390 })])
  const saved = section([
    line({ quantity: 5, rate: 100, amount: 500, editedFields: ['quantity'] })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.quantity, 5, 'an edited quantity must survive the new year')
  assert.equal(merged.rate, 130, 'the rate must come from the backend for the new year')
}

// --- Both edited: the row is left entirely alone --------------------------
{
  const source = section([line({ quantity: 3, rate: 130, amount: 390 })])
  const saved = section([
    line({ quantity: 5, rate: 100, amount: 500, editedFields: ['quantity', 'rate'] })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.quantity, 5, 'both-edited rows keep their quantity')
  assert.equal(merged.rate, 100, 'both-edited rows keep their rate')
}

// --- One edit must not hold back the rest of the sheet --------------------
// This is the behaviour that was wrong: editing one cell froze every row.
{
  const source = section([
    line({ id: 'a', description: 'Cement', rate: 130 }),
    line({ id: 'b', description: 'Sand', rate: 55, quantity: 4 }),
    line({ id: 'c', description: 'Steel', rate: 700, quantity: 1 })
  ])
  const saved = section([
    line({ id: 'a', description: 'Cement', rate: 100, editedFields: ['rate'] }),
    line({ id: 'b', description: 'Sand', rate: 40, quantity: 4 }),
    line({ id: 'c', description: 'Steel', rate: 600, quantity: 1 })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged[0].rate, 100, 'the edited row keeps its rate')
  assert.equal(merged[1].rate, 55, 'an untouched row must revalue to the new year')
  assert.equal(merged[2].rate, 700, 'every untouched row must revalue, not just the first')
}

// --- Rows are matched by what they are, not by position -------------------
// `id` is `section-display_order-index`, so it shifts the moment a row is
// inserted upstream. Matching on it would land the edit on the wrong resource.
{
  const source = section([
    line({ id: 'materials-0-0', description: 'Admixture', rate: 900, quantity: 1 }),
    line({ id: 'materials-1-1', description: 'Cement', rate: 130, quantity: 3 })
  ])
  const saved = section([
    line({ id: 'materials-0-0', description: 'Cement', rate: 100, editedFields: ['rate'] })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged[0].description, 'Admixture', 'the newly published row must appear')
  assert.equal(merged[0].rate, 900, 'the new row must not inherit an unrelated edit')
  assert.equal(merged[1].rate, 100, 'the edit must follow its own resource')
}

// A resource code identifies a row even when the description is reworded.
{
  const source = section([
    line({ description: 'Cement, OPC 53 grade', resourceCode: 'CEM53', rate: 130 })
  ])
  const saved = section([
    line({ description: 'Cement', resourceCode: 'CEM53', rate: 100, editedFields: ['rate'] })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 100, 'the edit must follow the resource code')
  assert.equal(
    merged.description,
    'Cement, OPC 53 grade',
    'an unedited description must take the new wording'
  )
}

// --- Identity is a cascade, because the strongest name is not always shared --
// A resource priced through the labour table one year and as a literal the next
// carries a code on one side only. A single key would drop the edit silently.
{
  const source = section([line({ description: 'Mason, 1st class', rate: 900 })])
  const saved = section([
    line({
      description: 'Mason, 1st class',
      resourceCode: 'LAB-07',
      rateSource: 'labour_rate.mason',
      rate: 800,
      editedFields: ['rate']
    })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 800, 'the edit must still be found by description and unit')
}

// A bare code is qualified by the table it came from, so codes cannot collide
// across rate tables.
{
  const source = section([
    line({ description: 'Labour item', resourceCode: '01', rateSource: 'labour_rate.a', rate: 500 }),
    line({ description: 'Material item', resourceCode: '01', rateSource: 'material_rate.a', rate: 60 })
  ])
  const saved = section([
    line({
      description: 'Material item',
      resourceCode: '01',
      rateSource: 'material_rate.a',
      rate: 40,
      editedFields: ['rate']
    })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged[0].rate, 500, 'a labour "01" must not take a material "01" edit')
  assert.equal(merged[1].rate, 40, 'the edit must land on the material row')
}

// --- Rows the estimator added are theirs ----------------------------------
{
  const source = section([
    line({ description: 'Cement', rate: 130 }),
    line({ description: 'Sand', rate: 55 })
  ])
  const saved = section([
    line({ description: 'Cement', rate: 100 }),
    line({ description: 'Curing water', rate: 12, userAdded: true }),
    line({ description: 'Sand', rate: 40 })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.deepEqual(
    merged.map((row) => row.description),
    ['Cement', 'Curing water', 'Sand'],
    'an added row must be carried across, in the place the estimator put it'
  )
  assert.equal(merged[1].rate, 12, 'an added row keeps its own rate')
}

// A row added before anything published still comes first.
{
  const source = section([line({ description: 'Cement', rate: 130 })])
  const saved = section([
    line({ description: 'Site charge', rate: 5, userAdded: true }),
    line({ description: 'Cement', rate: 100 })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.deepEqual(merged.map((row) => row.description), ['Site charge', 'Cement'])
}

// An added row whose anchor is withdrawn this year must not vanish with it.
{
  const source = section([line({ description: 'Sand', rate: 55 })])
  const saved = section([
    line({ description: 'Cement', rate: 100 }),
    line({ description: 'Curing water', rate: 12, userAdded: true })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.ok(
    merged.some((row) => row.description === 'Curing water'),
    'an added row must survive its anchor being withdrawn'
  )
}

// --- Estimator decisions about a row survive too --------------------------
{
  const source = section([line({ description: 'Cement', rate: 130 })])
  const saved = section([
    line({
      description: 'Cement',
      rate: 100,
      lead: { applicable: true, conveyanceClass: 'EARTH' },
      seigniorageApplicable: true,
      seigniorageCode: 'MIN-1'
    })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.deepEqual(merged.lead, { applicable: true, conveyanceClass: 'EARTH' })
  assert.equal(merged.seigniorageApplicable, true)
  assert.equal(merged.seigniorageCode, 'MIN-1')
  assert.equal(merged.rate, 130, 'those flags must not freeze the published rate')
}

// --- A globally applied material rate is not a hand-typed one -------------
// The Cement/Steel page marks the rows it re-prices as rate-edited and leaves a
// `rateOverride` on them. `materialRates.ts` reads exactly that pair to tell the
// two apart, and so must this: holding it would pin the project to whatever the
// cement rate was when the sheet was last opened.
{
  const source = section([line({ description: 'Cement', rate: 145 })])
  const saved = section([
    line({
      description: 'Cement',
      rate: 100,
      editedFields: ['rate'],
      rateOverride: {
        materialCode: 'CEM',
        label: 'Project rate',
        masterRate: 100,
        masterUnit: 'tonne',
        publishedRate: 90
      }
    })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 145, 'a globally applied material rate must re-price')
}

// A hand-typed rate on the same material is still held.
{
  const source = section([line({ description: 'Cement', rate: 145 })])
  const saved = section([
    line({ description: 'Cement', rate: 100, editedFields: ['rate'] })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 100, 'a hand-typed rate must still be held')
}

// --- A removed row stays removed; a new one still arrives -----------------
{
  const source = section([
    line({ description: 'Cement', rate: 130 }),
    line({ description: 'Sand', rate: 55 }),
    line({ description: 'Admixture', rate: 900 })
  ])
  const saved = section([
    line({ description: 'Cement', rate: 100 }),
    line({ description: 'Sand', rate: 40 })
  ])
  // Without the record, "Admixture" and the deleted "Curing water" look alike.
  const removed = ['text:curing water|tonne']
  const merged = mergeRecipeSections([source], [saved], removed)[0].lines
  assert.deepEqual(
    merged.map((row) => row.description),
    ['Cement', 'Sand', 'Admixture'],
    'a resource published for the first time this year must appear'
  )
}

{
  const source = section([
    line({ description: 'Cement', rate: 130 }),
    line({ description: 'Curing water', rate: 15 })
  ])
  const saved = section([line({ description: 'Cement', rate: 100 })])
  const merged = mergeRecipeSections(
    [source],
    [saved],
    ['text:curing water|tonne']
  )[0].lines
  assert.deepEqual(
    merged.map((row) => row.description),
    ['Cement'],
    'a row the estimator removed must not come back with the new year'
  )
}

// Adding the resource back is enough to undo the removal.
{
  const source = section([
    line({ description: 'Cement', rate: 130 }),
    line({ description: 'Curing water', rate: 15 })
  ])
  const saved = section([
    line({ description: 'Cement', rate: 100 }),
    line({ description: 'Curing water', rate: 12 })
  ])
  const merged = mergeRecipeSections(
    [source],
    [saved],
    ['text:curing water|tonne']
  )[0].lines
  assert.deepEqual(
    merged.map((row) => row.description),
    ['Cement', 'Curing water'],
    'a re-added resource must return, whatever the removal record still says'
  )
  assert.equal(merged[1].rate, 15, 'and it must revalue to the new year')
}

// The record travels with the recipe, so it survives the next year too.
{
  const source = recipe([
    section([line({ description: 'Cement', rate: 130 }), line({ description: 'Curing water', rate: 15 })])
  ])
  const saved = recipe([section([line({ description: 'Cement', rate: 100 })])], {
    removedLines: ['text:curing water|tonne']
  })
  const merged = mergeSavedRecipe(source, saved)
  assert.deepEqual(merged.sections[0].lines.map((row) => row.description), ['Cement'])
  assert.deepEqual(
    merged.removedLines,
    ['text:curing water|tonne'],
    'the removal must survive onto the merged recipe for the year after'
  )
}

// --- Published identity always comes from the new year --------------------
{
  const source = recipe([section([line({ rate: 130 })])], {
    year: '2026-27',
    zone: 'zone_3',
    publishedRate: 130,
    layout: { unitLabel: 'new' },
    sourceFigures: ['new.png']
  })
  const saved = recipe([section([line({ rate: 100 })])], {
    year: '2025-26',
    zone: 'zone_2',
    publishedRate: 100,
    layout: { unitLabel: 'old' },
    sourceFigures: ['old.png'],
    outputQuantity: 7
  })
  const merged = mergeSavedRecipe(source, saved)
  assert.equal(merged.year, '2026-27', 'the year must be the project year')
  assert.equal(merged.zone, 'zone_3', 'the zone must be the published zone')
  assert.equal(merged.publishedRate, 130, 'a SOR published rate must revalue')
  assert.deepEqual(merged.layout, { unitLabel: 'new' })
  assert.deepEqual(merged.sourceFigures, ['new.png'])
  assert.equal(merged.outputQuantity, 7, 'estimator-owned recipe values still carry across')
}

// --- Sections follow the new year ----------------------------------------
{
  const source = [section([line({ rate: 130 })]), { key: 'labour', label: 'Labour', lines: [] }]
  const saved = [section([line({ rate: 100, editedFields: ['rate'] })])]
  const merged = mergeRecipeSections(source, saved)
  assert.deepEqual(
    merged.map((entry) => entry.key),
    ['materials', 'labour'],
    'a section published this year must appear even if the saved edit predates it'
  )
  assert.equal(merged[0].lines[0].rate, 100, 'edits in a shared section still apply')
}

// --- The extractor's identity outranks everything inferred ---------------
// A row reworded *and* renumbered upstream is exactly the case description
// matching gets wrong; the published identity carries the edit through it.
{
  const source = section([
    line({
      id: 'materials-9-9',
      description: 'Ordinary Portland cement, 53 grade',
      rate: 145,
      resourceIdentity: { sourceTable: 'material_rate', masterCode: 'CEM53' }
    })
  ])
  const saved = section([
    line({
      id: 'materials-1-0',
      description: 'Cement',
      rate: 100,
      editedFields: ['rate'],
      resourceIdentity: { sourceTable: 'material_rate', masterCode: 'CEM53' }
    })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 100, 'the edit must follow the published identity')
  assert.equal(merged.description, 'Ordinary Portland cement, 53 grade')
}

// One master serving two lines is separated by its rate component.
{
  const identity = (rateComponent) => ({
    sourceTable: 'labour_rate',
    masterCode: 'MAS',
    rateComponent
  })
  const source = section([
    line({ description: 'Mason — day work', rate: 900, resourceIdentity: identity('day') }),
    line({ description: 'Mason — night work', rate: 1200, resourceIdentity: identity('night') })
  ])
  const saved = section([
    line({
      description: 'Mason — night work',
      rate: 1000,
      editedFields: ['rate'],
      resourceIdentity: identity('night')
    })
  ])
  const merged = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged[0].rate, 900, 'the day row must not take the night row’s edit')
  assert.equal(merged[1].rate, 1000, 'the edit must land on its own component')
}

// A row with no master at all is named by its item-scoped key.
{
  const source = section([
    line({ description: 'Site allowance (revised wording)', rate: 60,
      resourceIdentity: { resourceKey: 'site-allowance' } })
  ])
  const saved = section([
    line({ description: 'Site allowance', rate: 50, editedFields: ['rate'],
      resourceIdentity: { resourceKey: 'site-allowance' } })
  ])
  const [merged] = mergeRecipeSections([source], [saved])[0].lines
  assert.equal(merged.rate, 50, 'a resource_key must carry the edit as well')
}

// --- Unresolved edits are reported, not swallowed ------------------------
{
  const source = section([line({ description: 'Cement', rate: 130 })])
  const saved = section([
    line({ description: 'Cement', rate: 100, editedFields: ['rate'] }),
    line({ description: 'Withdrawn resource', rate: 70, editedFields: ['quantity'] })
  ])
  const report = mergeRecipeSectionsWithReport([source], [saved])
  const dropped = report.unresolved.filter((entry) => entry.reason === 'dropped')
  assert.equal(dropped.length, 1, 'an edit with nowhere to go must be reported')
  assert.equal(dropped[0].description, 'Withdrawn resource')
  assert.equal(dropped[0].sectionKey, 'materials')
}

// Matched only on wording is carried, but flagged as unproven.
{
  const source = section([line({ description: 'Cement', rate: 130 })])
  const saved = section([line({ description: 'Cement', rate: 100, editedFields: ['rate'] })])
  const report = mergeRecipeSectionsWithReport([source], [saved])
  assert.equal(report.unresolved.length, 1)
  assert.equal(report.unresolved[0].reason, 'weak-match')
  assert.equal(report.sections[0].lines[0].rate, 100, 'it is still carried')
}

// Matched on the published identity is not flagged at all.
{
  const identity = { sourceTable: 'material_rate', masterCode: 'CEM53' }
  const source = section([line({ description: 'Cement', rate: 130, resourceIdentity: identity })])
  const saved = section([
    line({ description: 'Cement', rate: 100, editedFields: ['rate'], resourceIdentity: identity })
  ])
  const report = mergeRecipeSectionsWithReport([source], [saved])
  assert.deepEqual(report.unresolved, [], 'a proven match needs no warning')
}

// A deliberate removal is not a lost edit.
{
  const source = section([line({ description: 'Cement', rate: 130 })])
  const saved = section([])
  const report = mergeRecipeSectionsWithReport([source], [saved], ['text:cement|tonne'])
  assert.deepEqual(report.unresolved, [], 'removing a row on purpose must not warn')
}

// --- A warning the estimator has answered must not come back -------------
{
  const source = recipe([section([line({ description: 'Cement', rate: 130 })])])
  const saved = recipe([
    section([
      line({ description: 'Cement', rate: 100, editedFields: ['rate'] }),
      line({ description: 'Withdrawn', rate: 70, editedFields: ['rate'] })
    ])
  ])
  const first = mergeSavedRecipe(source, saved)
  const dropped = (first.unresolvedEdits ?? []).find((entry) => entry.reason === 'dropped')
  assert.ok(dropped, 'the lost edit is reported the first time')
  assert.ok(dropped.saved, 'the row is carried so the sheet can offer to put it back')
  assert.equal(dropped.saved.rate, 70)

  // Answering it records the key; the next merge must stay quiet about it.
  const answered = { ...saved, acknowledgedEdits: [dropped.key] }
  const second = mergeSavedRecipe(source, answered)
  assert.ok(
    !(second.unresolvedEdits ?? []).some((entry) => entry.key === dropped.key),
    'an answered warning must not be asked again'
  )
  assert.deepEqual(
    second.acknowledgedEdits,
    [dropped.key],
    'the answer must travel with the recipe into the year after'
  )
}

// A restored row is the estimator's own, so it is never matched again.
{
  const source = recipe([section([line({ description: 'Cement', rate: 130 })])])
  const saved = recipe([
    section([
      line({ description: 'Cement', rate: 100 }),
      line({ description: 'Withdrawn', rate: 70, userAdded: true, editedFields: ['rate'] })
    ])
  ])
  const merged = mergeSavedRecipe(source, saved)
  assert.deepEqual(
    merged.sections[0].lines.map((row) => row.description),
    ['Cement', 'Withdrawn'],
    'a row put back as the estimator’s own is carried, not re-matched'
  )
  assert.deepEqual(merged.unresolvedEdits, undefined, 'and it raises no warning')
}

console.log('recipe merge: all assertions passed')

// --- The editor must record the removal, not just drop the row ------------
const table = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/rateanalysis/RateAnalysisTable.tsx'),
  'utf8'
)
assert.ok(
  /const identity = lineIdentity\(removedLine\)/.test(table) &&
    /removedLines: removedLines\.includes\(identity\)/.test(table),
  'deleting a published row must record its identity, or it returns with the next year'
)
assert.ok(
  /if \(removedLine && !removedLine\.userAdded\)/.test(table),
  'a row the estimator added has no published counterpart to suppress'
)
