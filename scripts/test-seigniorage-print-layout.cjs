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
  buildPages,
  groupByMat,
  rowHeight,
  seigQtyCalc,
  paperMm,
  HDR_H,
  SUMMARY_H,
  SEC_HEADING_H,
  TBL_HEADER_H,
  SUBTOTAL_H,
  GRAND_H
} = loadTsModule(path.join(root, 'src/renderer/src/lib/seignioragePrintLayout.ts'), {
  './seigniorage': {
    seigniorageItemDisplayName: (row) =>
      row.itemSource === 'SOR' ? row.description || '' : row.itemCode || ''
  }
})

let seq = 0
// `materialDescLength` drives the height, because the description cell renders
// itemCode plus "materialLabel - recipeMaterialDesc" — never `description`.
function row(materialKey, label, materialDescLength = 25) {
  seq += 1
  return {
    id: `r${seq}`,
    slNo: seq,
    itemNodeId: `n${seq}`,
    itemCode: 'IRR-CCDW-2-3',
    description: 'Providing and laying insitu vibrated M-10 grade cement concrete',
    unit: 'CUM',
    quantity: 1447.666,
    itemQuantity: 3217.5,
    itemUnit: 'CUM',
    mode: 'RECIPE_MATERIAL_RATIO',
    quantityRatio: 0.45,
    materialKey,
    materialLabel: label,
    recipeMaterialDesc: 'A'.repeat(materialDescLength),
    charge: { seig_code: materialKey, mineral_name: label },
    autoMatched: true,
    seigRate: 78,
    seigniorage: 112917.95,
    dmft: 33875.38,
    smft: 2258.36,
    permit: 90334.36,
    permitPercent: 80,
    isManual: false
  }
}

// A4 landscape with 12 mm margins — the preview default.
const A4 = paperMm('A4')
const PAGE_H = A4.w - 12 - 12

function allSections(pages) {
  return pages.flatMap((page, index) => page.sections.map((section) => ({ ...section, page: index })))
}

assert.match(
  seigQtyCalc({
    ...row('SEIG_BUILDING_STONE', 'Building Stone'),
    itemQuantity: 10,
    quantityRatio: 4.7,
    conversionFactor: 0.001,
    quantity: 0.047,
    unit: 'MT'
  }),
  /0\.001/,
  'kg-to-MT conversion must never be rounded to 0.00 in the printed working'
)

/** Re-derives the height the layout budgeted for a page. */
function pageHeight(page, isFirst, fontScale = 1) {
  let used = (HDR_H + (isFirst ? SUMMARY_H : 0)) * fontScale
  for (const section of page.sections) {
    used += (SEC_HEADING_H + TBL_HEADER_H) * fontScale
    for (let i = section.rowStart; i < section.rowEnd; i += 1) {
      used += rowHeight(section.group.rows[i], fontScale)
    }
    if (section.showSubtotal) used += SUBTOTAL_H * fontScale
  }
  if (page.showGrandTotal) used += GRAND_H * fontScale
  return used
}

function check(rows, label, fontScale = 1) {
  const groups = groupByMat(rows)
  const pages = buildPages(groups, PAGE_H, fontScale)
  const sections = allSections(pages)

  // Every row is emitted exactly once, in order, within its group.
  for (const group of groups) {
    const mine = sections.filter((s) => s.group.key === group.key)
    assert.ok(mine.length > 0, `${label}: group ${group.key} was dropped`)
    let cursor = 0
    for (const section of mine) {
      assert.equal(section.rowStart, cursor, `${label}: gap or overlap in ${group.key}`)
      assert.ok(section.rowEnd > section.rowStart, `${label}: empty chunk in ${group.key}`)
      cursor = section.rowEnd
    }
    assert.equal(cursor, group.rows.length, `${label}: ${group.key} lost trailing rows`)

    // The regression: one group must never open two tables on one page.
    const pagesUsed = mine.map((s) => s.page)
    assert.equal(
      new Set(pagesUsed).size,
      pagesUsed.length,
      `${label}: group ${group.key} rendered two tables on one page`
    )
    // Pages advance monotonically.
    assert.deepEqual(pagesUsed, [...pagesUsed].sort((a, b) => a - b), `${label}: pages out of order`)

    // Only the first chunk is a fresh heading; only the last carries a subtotal.
    assert.equal(mine[0].isContinuation, false, `${label}: first chunk marked continued`)
    assert.ok(
      mine.slice(1).every((s) => s.isContinuation),
      `${label}: continuation chunk not marked`
    )
    assert.equal(
      mine.filter((s) => s.showSubtotal).length,
      1,
      `${label}: expected exactly one subtotal for ${group.key}`
    )
    assert.equal(mine[mine.length - 1].showSubtotal, true, `${label}: subtotal not on last chunk`)
  }

  // Page bookkeeping.
  assert.equal(pages[0].isFirst, true, `${label}: first page not flagged`)
  assert.ok(pages.slice(1).every((p) => !p.isFirst), `${label}: extra page flagged as first`)
  const totals = pages.filter((p) => p.showGrandTotal)
  assert.equal(totals.length, 1, `${label}: expected exactly one grand total`)
  assert.equal(pages[pages.length - 1].showGrandTotal, true, `${label}: grand total not on last page`)

  // Nothing is budgeted past the bottom of the page. A single oversized row is
  // allowed to exceed it, since it has to go somewhere.
  pages.forEach((page, index) => {
    const oneOversizedRow =
      page.sections.length === 1 && page.sections[0].rowEnd - page.sections[0].rowStart === 1
    if (oneOversizedRow) return
    const height = pageHeight(page, index === 0, fontScale)
    assert.ok(
      height <= PAGE_H + 0.01,
      `${label}: page ${index + 1} overflows (${height.toFixed(1)}mm > ${PAGE_H}mm)`
    )
  })

  return pages
}

// --- A single short group stays on one page --------------------------------

const small = check([row('STONE', 'Stone / aggregate'), row('STONE', 'Stone / aggregate')], 'small')
assert.equal(small.length, 1)
assert.equal(small[0].sections.length, 1)

// --- A long group splits across pages, once per page -----------------------

const long = check(
  Array.from({ length: 60 }, () => row('STONE', 'Stone / aggregate')),
  'long'
)
assert.ok(long.length > 1, 'a 60-row group should need more than one page')

// --- Several groups interleave without ever doubling up on a page ----------

check(
  [
    ...Array.from({ length: 14 }, () => row('STONE', 'Stone / aggregate')),
    ...Array.from({ length: 14 }, () => row('SAND', 'Sand')),
    ...Array.from({ length: 14 }, () => row('EARTH', 'Morram / Gravel'))
  ],
  'mixed'
)

// --- Tall rows (long descriptions) are budgeted, not over-packed -----------

const tall = check(
  Array.from({ length: 20 }, () => row('STONE', 'Stone', 200)),
  'tall rows'
)
const short = check(
  Array.from({ length: 20 }, () => row('STONE', 'Stone', 1)),
  'short rows'
)
assert.ok(
  tall.length > short.length,
  'taller rows must need more pages than short ones'
)

// --- Row height reflects the permit percentage line ------------------------

// Even the shortest row is two lines tall because of the "@ 80%" line.
assert.ok(rowHeight(row('STONE', 'S', 1)) >= 2 * 4.2, 'row height ignores the permit line')

// --- The font scale is honoured by the page budget -------------------------

const sameRows = () => Array.from({ length: 40 }, () => row('STONE', 'Stone / aggregate'))

// Each font size must still lay out legally (the checks above run per scale).
const at70 = check(sameRows(), 'font 70%', 0.7)
const at100 = check(sameRows(), 'font 100%', 1)
const at150 = check(sameRows(), 'font 150%', 1.5)

// Bigger text means fewer rows per page, so more pages; smaller text, fewer.
assert.ok(
  at150.length > at100.length,
  `150% text should need more pages than 100% (got ${at150.length} vs ${at100.length})`
)
assert.ok(
  at70.length < at100.length,
  `70% text should need fewer pages than 100% (got ${at70.length} vs ${at100.length})`
)

// Row height scales with the font.
const sample = row('STONE', 'Stone / aggregate')
assert.ok(
  rowHeight(sample, 1.5) > rowHeight(sample, 1),
  'rowHeight must grow with the font scale'
)
assert.ok(
  rowHeight(sample, 0.7) < rowHeight(sample, 1),
  'rowHeight must shrink with the font scale'
)

// --- An empty statement still produces a page with the grand total ---------

const empty = buildPages(groupByMat([]), PAGE_H)
assert.equal(empty.length, 1)
assert.equal(empty[0].sections.length, 0)
assert.equal(empty[0].showGrandTotal, true)

console.log('seigniorage print layout: all assertions passed')
