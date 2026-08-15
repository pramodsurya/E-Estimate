// The arithmetic a comparative statement is read for.
//
// Both columns are priced by the live dashboard path (see
// comparativeStatement.ts); what is checked here is the comparison itself —
// which rows appear, what a variation is, and when a percentage would be an
// invention rather than a figure.

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

const { variation, compareAbstractLines, compareItemRows, totalOf } = loadTsModule(
  'src/renderer/src/lib/comparativeRows.ts'
)

const abstractLine = (over = {}) => ({
  key: 'component:a',
  slNo: 1,
  label: 'Bund',
  amount: 100,
  kind: 'component',
  ...over
})

// --- Variation -------------------------------------------------------------
assert.deepEqual(variation(100, 125), { difference: 25, percent: 25 })
assert.deepEqual(variation(100, 80), { difference: -20, percent: -20 })
assert.deepEqual(variation(0, 50), { difference: 50, percent: null }, 'no base, no percentage')
assert.deepEqual(
  variation(null, 50),
  { difference: 50, percent: null },
  'a row that did not exist has no percentage change to report'
)
assert.deepEqual(variation(100, 100), { difference: 0, percent: 0 })
assert.deepEqual(
  variation(-100, -50),
  { difference: 50, percent: 50 },
  'a negative base compares against its magnitude, so the sign is the movement'
)

// --- The General Abstract, line for line ----------------------------------
{
  const left = [
    abstractLine({ key: 'component:a', label: 'Bund', amount: 1000 }),
    abstractLine({ key: 'charge:gst', label: 'GST', amount: 180, kind: 'charge' }),
    abstractLine({ key: 'grand', label: 'GRAND TOTAL', amount: 1180, kind: 'grand' })
  ]
  const right = [
    abstractLine({ key: 'component:a', label: 'Bund', amount: 1200 }),
    abstractLine({ key: 'charge:gst', label: 'GST', amount: 216, kind: 'charge' }),
    abstractLine({ key: 'grand', label: 'GRAND TOTAL', amount: 1416, kind: 'grand' })
  ]
  const rows = compareAbstractLines(left, right)
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows.map((row) => [row.key, row.left, row.right, row.difference]),
    [
      ['component:a', 1000, 1200, 200],
      ['charge:gst', 180, 216, 36],
      ['grand', 1180, 1416, 236]
    ]
  )
  assert.equal(rows[2].kind, 'grand', 'the grand total must keep its kind for the print sheet')
}

// A charge only the new year carries must still appear, or the right column
// stops adding up to its own grand total.
{
  const left = [abstractLine({ key: 'component:a', amount: 1000 })]
  const right = [
    abstractLine({ key: 'component:a', amount: 1000 }),
    abstractLine({ key: 'charge:new-cess', label: 'New cess', amount: 20, kind: 'charge' })
  ]
  const rows = compareAbstractLines(left, right)
  assert.equal(rows.length, 2, 'the new charge must appear')
  const added = rows.find((row) => row.key === 'charge:new-cess')
  assert.equal(added.left, null, 'it has no earlier figure')
  assert.equal(added.right, 20)
  assert.equal(added.percent, null)
  assert.equal(totalOf(rows, 'right'), 1020, 'the new column must add up to itself')
  assert.equal(totalOf(rows, 'left'), 1000, 'and the old column to itself')
}

// A component dropped in the new year keeps its earlier figure on the left.
{
  const left = [
    abstractLine({ key: 'component:a', amount: 1000 }),
    abstractLine({ key: 'component:b', label: 'Sluice', amount: 400 })
  ]
  const right = [abstractLine({ key: 'component:a', amount: 1000 })]
  const rows = compareAbstractLines(left, right)
  const dropped = rows.find((row) => row.key === 'component:b')
  assert.equal(dropped.left, 400)
  assert.equal(dropped.right, null)
  assert.equal(dropped.difference, -400, 'dropping a component is a reduction of its whole value')
}

// Rows are matched by key, never by position.
{
  const left = [
    abstractLine({ key: 'component:a', label: 'Bund', amount: 1000 }),
    abstractLine({ key: 'component:b', label: 'Sluice', amount: 400 })
  ]
  const right = [
    abstractLine({ key: 'component:b', label: 'Sluice', amount: 450 }),
    abstractLine({ key: 'component:a', label: 'Bund', amount: 1100 })
  ]
  const rows = compareAbstractLines(left, right)
  assert.equal(rows.find((row) => row.key === 'component:a').right, 1100)
  assert.equal(rows.find((row) => row.key === 'component:b').right, 450)
}

// --- Item rows -------------------------------------------------------------
{
  const rows = compareItemRows([
    {
      id: 'i1',
      label: 'IRR-DAW-2-11',
      unit: 'CUM',
      quantity: 1017.9,
      leftRate: 6000,
      rightRate: 6439.29,
      leftAmount: 6107400,
      rightAmount: 6554553.29
    }
  ])
  assert.equal(rows[0].slNo, 1)
  assert.equal(rows[0].quantity, 1017.9, 'the quantity is the estimator’s and serves both years')
  assert.equal(rows[0].leftRate, 6000)
  assert.equal(rows[0].rightRate, 6439.29)
  assert.ok(Math.abs(rows[0].difference - 447153.29) < 0.01)
  assert.ok(Math.abs(rows[0].percent - 7.32) < 0.01)
}

// An item that could not be priced in one year must not read as free work.
{
  const rows = compareItemRows([
    {
      id: 'i2',
      label: 'Unpriced',
      quantity: 10,
      leftRate: null,
      rightRate: 50,
      leftAmount: null,
      rightAmount: 500
    }
  ])
  assert.equal(rows[0].left, null, 'an unpriced year stays blank rather than showing zero')
  assert.equal(rows[0].percent, null)
  assert.equal(rows[0].difference, 500)
}

console.log('comparative statement: all assertions passed')

// --- Both columns must be priced by the live path, not re-implemented -----
const engine = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/comparativeStatement.ts'),
  'utf8'
)
assert.ok(
  /syncProjectDashboardSnapshot\(shadow, items\)/.test(engine) &&
    /const priced = \{ \.\.\.shadow, dashboardSnapshot: snapshot \}/.test(engine) &&
    /computeProjectPrintInputs\(priced, items\)/.test(engine),
  'each side must be priced through the same sync the Project Dashboard uses'
)
assert.ok(
  /dashboardSnapshot: undefined/.test(engine),
  'a side must fetch its own year rather than inherit the project’s snapshot'
)
assert.ok(
  !/rateAnalysisOverrides: project\.rateAnalysisOverrides,/.test(engine) &&
    /withRateAnswers\(recipe, itemKey, undefined, side\.rateAnswers\)/.test(engine),
  'the side’s hand-typed answers must reach the shadow project'
)
// Nothing may be written back: a comparison is a question, not an edit.
assert.ok(
  !/useStore|setDashboardSnapshot|updateMeta/.test(engine),
  'building a statement must never write to the project'
)

// --- Only hand-typed rates are asked for ---------------------------------
assert.ok(
  /line\.editedFields\?\.includes\('rate'\) === true && !line\.rateOverride/.test(engine),
  'a rate written by the Cement/Steel page follows those boxes and must not be asked for again'
)

// --- The printed statement must carry a margin on every sheet ------------
const panel = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/comparative/ComparativeStatementPanel.tsx'),
  'utf8'
)
assert.ok(
  /const PRINT_MARGIN_MM = \{ top: 12, bottom: 12, left: 10, right: 10 \}/.test(panel) &&
    /margins: PRINT_MARGINS/.test(panel) &&
    /padding:0!important/.test(panel),
  'page-box padding reaches only the first and last sheet; the frame must be a page margin'
)
assert.ok(
  /sheet \$\{index \+ 1\} of \$\{sheets\.length\}/.test(panel),
  'a component running past one sheet must say so on each of them'
)

console.log('comparative statement: engine and print guards passed')

// --- Ordinary lead must be re-priced at the year being synced -------------
// `lead_rate` is published per year, but only pipe lead was ever recomputed:
// an ordinary conveyance charge kept the amount it was given when applied, and
// that amount goes straight onto the item rate.
const sync = fs.readFileSync(path.join(root, 'src/renderer/src/lib/dashboardSync.ts'), 'utf8')
assert.ok(
  /function repriceLeadApplications\(/.test(sync) &&
    /\.\.\.repriceLeadApplications\(project, leadRates, applicability, items\)/.test(sync),
  'ordinary lead applications must be re-priced during the lead sync'
)
assert.ok(
  /if \(application\.rateYear === year && application\.rateZone === zone\) continue/.test(sync),
  'a charge already priced in this year and zone must be left exactly as it is'
)
assert.ok(
  /if \(!variant \|\| variant\.pipeLead\) continue/.test(sync),
  'pipe lead keeps its own refresh, which also re-derives its quantity'
)
assert.ok(
  /quantity: application\.quantity/.test(sync),
  'the quantity is the estimator’s and must survive a re-pricing'
)
assert.ok(
  /handlingModeForData\(info, variant, variant\.handlingMode\)/.test(sync) &&
    /basisForData\(info, variant\.includedBasis, description, variant\)/.test(sync) &&
    /leadMultiplier: info\.policy\?\.haulLegs \?\? 1/.test(sync),
  'the re-price must apply the same lead policy the dashboards apply'
)

console.log('comparative statement: lead re-pricing guards passed')

// --- The statement's sheets are planned, not left to the print engine -----
assert.ok(
  /chooseSmartAbstractPlan\(\[profile\], FILL_EACH_PAGE\)/.test(panel) &&
    /readMeasuredDocument\(measureHtml, widthPx/.test(panel),
  'sheets must be planned against measured rows, using the fill-each-page policy'
)
assert.ok(
  /keepWithPrevious: row\.kind === 'total' \|\| row\.kind === 'grand'/.test(panel),
  'a total belongs to the rows above it and may not open a sheet'
)
assert.ok(
  /\.cs-page \+ \.cs-page\{break-before:page/.test(panel) &&
    !/\.cs-table thead\{display:table-header-group\}/.test(panel),
  'planned sheets must not be paginated a second time by the engine'
)
assert.ok(
  /if \(!measured\) return \[rows\]/.test(panel),
  'an unmeasurable statement must still print, by the engine as before'
)

// --- Only the cement and steel this estimate uses is asked for ------------
assert.ok(
  /usedCodes\.has\(material\.materialCode\)/.test(panel) &&
    /showAllMaterials \|\| usedCodes\.size === 0/.test(panel),
  'the cement/steel step must offer only what the DATA consumes'
)
// The compiled snapshot is absent until the dashboard is built, and a hand
// edited DATA lives in the override maps. Reading only the snapshot left the
// used set empty on a real estimate, which fell back to every published grade -
// the whole list the estimator was asked to read through.
assert.ok(
  /project\.dashboardSnapshot\?\.projectRecipes/.test(panel) &&
    /project\.rateAnalysisOverrides/.test(panel) &&
    /project\.rateAnalysisScopedOverrides/.test(panel),
  'the used set must be read from the snapshot and both override maps'
)

// --- Each column adopts its own circular ---------------------------------
// One pricing date applied to both columns resolves to one circular, so cement
// and steel came out identical whatever years were chosen. The choice is per
// column, and it has to reach the statement: the shadow project prices from
// materialRateOverrides alone, so a circular that is only displayed is not the
// one billed.
assert.ok(
  /const \[circularFrom, setCircularFrom\]/.test(panel) &&
    /circularOverrides = \(side: Side\)/.test(panel),
  'each column must choose its own published circular'
)
assert.ok(
  /const overrides: Record<string, MaterialRateOverride> = circularOverrides\(side\)/.test(panel),
  'the adopted circular must reach the generated statement, not just the boxes'
)
assert.ok(
  /overrides: circularOverrides\(side\),[\s\S]{0,320}?periods: \[\],/.test(panel),
  'a column with no circular adopted must fall to its own year, not pick one up'
)

// --- A code alone does not tell a reader what moved ----------------------
const engineSrc = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/comparativeStatement.ts'),
  'utf8'
)
assert.ok(
  /description: itemClause\(item,/.test(engineSrc),
  'item rows must carry the published clause, not only the code'
)

console.log('comparative statement: layout and scope guards passed')

// --- Lead is compared, and never double-counted --------------------------
assert.ok(
  /compareLead\(leftSide, rightSide, selection\)/.test(engineSrc) &&
    /repriced\.get\(application\.id\) \?\? application/.test(engineSrc),
  'lead must be compared using each year’s re-priced charges, not the stored ones'
)
assert.ok(
  /Lead is already inside the item rates/.test(panel),
  'the lead page must say it is already inside the item rates, not an addition'
)

// --- The measured table must carry the same columns as the rendered one ---
assert.ok(
  /COLGROUP_HTML\[showRates \? 'items' : 'summary'\]/.test(panel) &&
    /COLUMN_WIDTHS\[showRates \? 'items' : 'summary'\]\.map/.test(panel),
  'measurement and render must share one column model, or the plan is made against the wrong widths'
)

// --- The oversized sheet must stay reachable -----------------------------
const css = fs.readFileSync(path.join(root, 'src/renderer/src/styles/styles.css'), 'utf8')
assert.ok(
  /\.cs-pages \{[\s\S]*?align-items: flex-start/.test(css) &&
    /\.cs-pages > \.cs-page \{ margin: 0 auto; \}/.test(css),
  'a 297 mm sheet centred with align-items cannot be scrolled to on the left'
)

// --- Leaving the statement must not throw away two dashboard syncs -------
const dash = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/dashboard/TitleDashboard.tsx'),
  'utf8'
)
assert.ok(
  /comparativeMounted && \(/.test(dash) &&
    /display: comparativeOpen \? 'contents' : 'none'/.test(dash),
  'the panel must stay mounted so returning lands on the statement, not step one'
)

console.log('comparative statement: lead, layout and navigation guards passed')

// --- The statement reads as a document, not as UI ------------------------
assert.ok(
  /\.cs-table \{[\s\S]*?font-family: "Times New Roman", serif;[\s\S]*?font-size: 14px/.test(css),
  'the statement must print in the estimate’s own face and size'
)

// --- A stale preload must not cost the estimator the workbook ------------
assert.ok(
  /typeof window\.api\.export\.workbook === 'function'/.test(panel) &&
    /anchor\.download = fileName/.test(panel),
  'the workbook exists either way; a missing save channel must fall back to a download'
)

// --- Lead is opt-in from the scope step ----------------------------------
assert.ok(
  /includeLead \? compareLead\(leftSide, rightSide, selection\) : \[\]/.test(engineSrc) &&
    /checked=\{includeLead\}/.test(panel),
  'lead must be tickable in the scope step like everything else'
)

console.log('comparative statement: typography, export and lead-scope guards passed')

// --- An empty rate box must say what it will actually use ----------------
// This is where the panel misled its reader. The box resolved a circular from
// the project's single pricing date while the statement was priced without one,
// so the figure shown was not the figure billed - and because that one date
// served both columns, cement showed no movement whatever years were compared.
assert.ok(
  /const fallbackRate = \(side: Side, materialCode: string\)/.test(panel) &&
    /placeholder=\{fallbackRate\(side, code\)\}/.test(panel),
  'each blank rate box must show the figure and source it will fall back to'
)
assert.ok(
  /resolveMaterialRate\(materialCode, \{\s*overrides: circularOverrides\(side\)/.test(panel),
  'the fallback shown must be resolved from the same overrides that price the side'
)
assert.ok(
  !/asOf: project\.meta\.materialRateAsOf/.test(panel),
  "the project's own pricing date must not decide either column's circular"
)
assert.ok(
  /No published rate — this material will not be priced/.test(panel),
  'a material with no rate at all must say so rather than showing a blank box'
)

console.log('comparative statement: material fallback guards passed')
