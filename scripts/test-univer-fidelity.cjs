// Real-Univer fidelity laboratory proofs (Univer 0.25.0 runtime output).
//
// Fixture: scripts/fixtures/univer-fidelity/real-univer-workbook.json — saved
// by FWorkbook.save() after facade mutations (generator:
// scripts/create-univer-fidelity.cjs); manifest.json lists labeled cases.
// Styles are real API inputs assigned by Univer, never hand-authored.
//
// Layers (no execution is faked):
//  1. Fixture integrity: pure-JSON asserts that every manifest case resolves
//     and the serialized shapes match real runtime output.
//  2. Snapshot preservation: the app data path (buildItemSheetRenderData)
//     keeps every sheet's values, styles, geometry and merges intact.
//  3. Excel payloads: flattenSheet/mapUniverStyle in plain node — values,
//     types, numFmt, alignment tokens, borders, rotation, runs, merges,
//     hidden dimensions and geometry. Needs only node + typescript.
//  2b. Installed display text: the TS producer (univerDisplayText.ts) runs
//     the same getPatternPreview call as the runtime preview; compile inputs
//     carry cell._ee (text verbatim, section color as upfront theme hex)
//     while the saved snapshot and render data stay pristine.
//  4. Typst rev marker: generated sources carry ee-sheet-rev: 15.
//  5. Rendered SVG geometry (compiler-gated): display strings (dates,
//     percent, currency, fractions, scientific, leading zeros, negatives),
//     alignment placement, rotations (source-row→band mapping derived by
//     tiling gaps against saved heights; page-break gaps proven to span
//     the page boundary — never an offset constant), vertical placement,
//     font-size order, unicode order, padding insets. Without the compiler
//     package this section SKIPs distinctly — never proof. Artifacts save
//     BEFORE asserts.
//
// Coverage boundaries (classify, don't over-claim): charts/images, theme
// colors, conditional-format rules, paragraph lists, live formula results
// and canvas auto-height are not in this workbook. Diagonal borders have no
// Typst equivalent and Excel drops them today. Decoration dash variants
// render as single solid in both writers. Section colors ([Red]) win over
// an explicit font color in PDF, mirroring the installed composition
// ({ ...style, ...interceptStyle }); only defaultTheme names resolve
// (black/white/cyan/magenta fall back to default ink, like the canvas).
// Excel superscript / subscript / overline / cell padding have no payload
// field and are dropped (values survive); PDF renders them.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { parseSvgScene, findText, boundaries, bandContaining, textHeight } = require('./svg-scene.cjs')

const root = path.resolve(__dirname, '..')
const workbookPath = path.join(__dirname, 'fixtures', 'univer-fidelity', 'real-univer-workbook.json')
const manifestPath = path.join(__dirname, 'fixtures', 'univer-fidelity', 'manifest.json')
const artifactDir = path.join(__dirname, 'output', 'univer-fidelity')

// Vite query imports in Node's standalone regression runner (established
// loader: test-item-typst.cjs). Every branch resolves relative to the
// IMPORTING file (`path.dirname(parent.filename)`): `?raw` returns file
// text; `?inline` assets return a data URI; `?url` assets return the
// absolute file path; `.png?` returns a 1px placeholder.
const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  if (request.endsWith('?inline')) {
    const file = path.resolve(path.dirname(parent.filename), request.slice(0, -7))
    const ext = path.extname(file).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream'
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
  }
  if (request.endsWith('?url')) return path.resolve(path.dirname(parent.filename), request.slice(0, -4))
  if (request.includes('.png?')) return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return originalLoad.call(this, request, parent, isMain)
}

function loadTsModule(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  loaded.require = (request) => {
    if (request in mocks) return mocks[request]
    // Vite query imports resolve relative to the IMPORTING TS file
    // (`path.dirname(filePath)`), never through this runner's own module:
    // a bare `require(request)` fallback would resolve `./item.typ?raw`
    // against scripts/ instead of the TS file's directory.
    if (request.endsWith('?raw')) return fs.readFileSync(path.resolve(path.dirname(filePath), request.slice(0, -4)), 'utf8')
    if (request.endsWith('?inline')) {
      const inlineFile = path.resolve(path.dirname(filePath), request.slice(0, -7))
      const inlineExt = path.extname(inlineFile).toLowerCase()
      const inlineMime = inlineExt === '.png' ? 'image/png' : inlineExt === '.svg' ? 'image/svg+xml' : 'application/octet-stream'
      return `data:${inlineMime};base64,${fs.readFileSync(inlineFile).toString('base64')}`
    }
    if (request.endsWith('?url')) return path.resolve(path.dirname(filePath), request.slice(0, -4))
    if (request.includes('.png?')) return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile, mocks)
    }
    return require(request)
  }
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const SHEETS = [
  'Fonts and decoration',
  'Alignment wrap rotation',
  'Border enum matrix',
  'Number formats',
  'Geometry merges unicode',
  'Advanced cell styles'
]

function loadWorkbook() {
  return JSON.parse(fs.readFileSync(workbookPath, 'utf8'))
}
function sheetByName(wb, name) {
  for (const id of wb.sheetOrder) {
    if (wb.sheets[id] && wb.sheets[id].name === name) return { id, sheet: wb.sheets[id] }
  }
  assert.fail(`sheet ${name} missing from workbook`)
  return null
}
function cellAt(sheet, row, col) {
  return sheet.cellData?.[String(row)]?.[String(col)]
}
// SVG root height in pt (typst-ts stacks whole A4 pages vertically).
function svgRootHeight(svg) {
  const m = /<svg[^>]*\sheight="([\d.]+)"/.exec(svg)
  assert.ok(m, 'SVG root carries a height')
  return Number(m[1])
}
// Source-row → SVG-band mapping by tiling: detected gridline gaps are
// matched in order against the saved visible row heights (pt). The grid
// paginates — a page break leaves a margin gap matching no row — so bands
// do NOT equal rows past the break, and no offset constant is assumed.
// Tiling must consume every row exactly once, identically top-down and
// bottom-up, or the mapping is refused as ambiguous. Gaps matching no row
// are returned as artifacts; each must exactly span a page boundary (page
// remainder + next-page start), proving break whitespace rather than a
// missing gridline (a missing line would leave a row-inexplicable shift
// that the exact-consumption check refuses).
function deriveRowBands(bounds, heightsPt, svgHeightPt, label) {
  const TOL = 1.5
  const near = (a, b) => Math.abs(a - b) <= TOL
  const gapsFor = () => bounds.slice(0, -1).map((v, i) => ({ i, g: bounds[i + 1] - v }))
  const tile = (rows, gaps) => {
    const map = new Map()
    const artifactGaps = new Set()
    let gi = 0
    for (const { r, h } of rows) {
      if (gi < gaps.length && near(gaps[gi].g, h)) {
        map.set(r, gaps[gi].i)
        gi++
      } else if (gi < gaps.length) {
        artifactGaps.add(gaps[gi].i)
        gi++
        if (gi >= gaps.length || !near(gaps[gi].g, h)) return null
        map.set(r, gaps[gi].i)
        gi++
      } else return null
    }
    if (gi !== gaps.length) return null
    return { map, artifactGaps }
  }
  const rowsFwd = heightsPt.map((h, r) => ({ r, h }))
  const fwd = tile(rowsFwd, gapsFor())
  const rev = tile([...rowsFwd].reverse(), gapsFor().reverse())
  assert.ok(fwd && rev, `${label}: row/band tiling completes both directions`)
  const byRow = (m) => [...m.entries()].sort((a, b) => a[0] - b[0])
  assert.deepEqual(byRow(fwd.map), byRow(rev.map), `${label}: tiling direction-agrees (ambiguous otherwise)`)
  assert.deepEqual([...fwd.artifactGaps].sort(), [...rev.artifactGaps].sort(), `${label}: artifact gaps direction-agree`)
  // Pagination identity: stacked A4 pages (the compiled template sets
  // paper a4, 841.89pt); each artifact gap must exactly cross one page
  // boundary, otherwise it is unexplained and refused.
  const pages = Math.round(svgHeightPt / 841.89)
  assert.ok(pages >= 1 && Math.abs(svgHeightPt / pages - 841.89) < 1, `${label}: stacked A4 pages (svg height ${svgHeightPt})`)
  const PAGE = svgHeightPt / pages
  const artifacts = []
  for (const gi of [...fwd.artifactGaps].sort((a, b) => a - b)) {
    const prev = bounds[gi]
    const next = bounds[gi + 1]
    const composed = (PAGE - (prev % PAGE)) + (next % PAGE)
    const height = next - prev
    assert.ok(Math.abs(composed - height) < 2,
      `${label}: gap ${height.toFixed(2)}pt at bound ${gi} spans a page boundary ` +
      `(page remainder ${(PAGE - (prev % PAGE)).toFixed(2)} + next-page start ${(next % PAGE).toFixed(2)})`)
    artifacts.push({ gapIndex: gi, height })
  }
  return { rowToBand: fwd.map, artifacts }
}
// Style ids are assigned by Univer at save time: resolve, never hard-code.
function styleOf(wb, cell) {
  const s = cell?.s
  if (s === undefined || s === null) return null
  if (typeof s === 'object') return s
  return wb.styles[String(s)] ?? null
}
// Fresh single-sheet copy per test so suites never mutate the source artifact.
function workbookForSheet(wb, name) {
  const { id, sheet } = sheetByName(wb, name)
  return {
    id: wb.id, name: wb.name, appVersion: wb.appVersion, locale: wb.locale,
    styles: wb.styles, sheetOrder: [id], sheets: { [id]: JSON.parse(JSON.stringify(sheet)) }
  }
}
function makeItem(single, name) {
  return {
    id: `fidelity-${name}`,
    name: `Fidelity ${name}`,
    itemCode: 'FIDELITY',
    itemDescription: 'Real-Univer fidelity laboratory.',
    itemUnit: 'lot',
    unit: 'lot',
    itemEditorType: 'spreadsheet',
    finalCell: 0,
    print: { range: { startRow: 0, startColumn: 0, endRow: 31, endColumn: 8 }, showGridlines: true },
    charts: [],
    spreadsheet: single
  }
}
const project = {
  id: 'proj-fidelity',
  meta: { name: 'Fidelity Proof Project' },
  root: { name: 'Root' },
  signatureFooter: { enabled: false, rows: [] }
}
const RANGE = { startRow: 0, startColumn: 0, endRow: 31, endColumn: 8 }
function gridInput(sheet, wb) {
  return {
    cellData: sheet.cellData,
    mergeData: sheet.mergeData,
    styles: wb.styles,
    rowData: sheet.rowData,
    columnData: sheet.columnData,
    defaultColW: sheet.defaultColumnWidth,
    defaultRowH: sheet.defaultRowHeight,
    defaultStyle: sheet.defaultStyle ?? wb.defaultStyle
  }
}

async function main() {
  console.log('--- Real-Univer fidelity laboratory (0.25.0 runtime output) ---')
  const wb = loadWorkbook()
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  // F1. Fixture integrity: six populated sheets plus the empty Sheet1, and
  // every manifest case resolves to a real labeled cell.
  const names = wb.sheetOrder.map((id) => wb.sheets[id].name)
  for (const name of SHEETS) assert.ok(names.includes(name), `sheet present: ${name}`)
  assert.equal(wb.sheetOrder.length, 7, 'six labeled sheets plus empty Sheet1')
  for (const c of manifest.cases) {
    const { sheet } = sheetByName(wb, c.sheet)
    const m = /^C(\d+)$/.exec(c.cell)
    assert.ok(m, `case cell parses: ${c.cell}`)
    assert.ok(cellAt(sheet, Number(m[1]) - 1, 2), `case resolves: ${c.sheet} ${c.cell} (${c.label})`)
  }
  console.log(`✓ fixture integrity: ${manifest.cases.length} labeled cases resolve on 6 sheets`)

  // F1b. Serialized shapes are real runtime output, not hand-authored snaps:
  // enum-backed styles, shared-edge border storage, rich-text runs, forced
  // text, merges, hidden flags, explicit geometry.
  const align = sheetByName(wb, 'Alignment wrap rotation').sheet
  assert.deepEqual(styleOf(wb, cellAt(align, 25, 2)), { tb: 3, tr: { a: 0, v: 1 } }, 'C26 vertical-mode + wrap style')
  assert.equal(cellAt(align, 25, 2).t, 1, 'C26 plain string type')
  const borderSides = new Set()
  for (const st of Object.values(wb.styles)) {
    if (st && typeof st === 'object' && st.bd && typeof st.bd === 'object') {
      for (const side of Object.values(st.bd)) {
        if (side && typeof side === 'object' && typeof side.s === 'number') borderSides.add(side.s)
      }
    }
  }
  for (let s = 0; s <= 13; s++) assert.ok(borderSides.has(s), `border enum s:${s} serialized by Univer`)
  const geometry = sheetByName(wb, 'Geometry merges unicode').sheet
  const rich = cellAt(geometry, 10, 2)
  assert.ok(rich && rich.p && rich.p.body && Array.isArray(rich.p.body.textRuns), 'C11 rich-text body with runs')
  assert.deepEqual(rich.p.body.textRuns.map((r) => [r.st, r.ed]), [[0, 4]], 'C11 run offsets (UTF-16 units)')
  assert.ok(rich.p.body.dataStream.startsWith('Bold'), 'C11 stream starts with the styled run')
  // The runtime coerced the submitted number to a string on save (force-string
  // means stored-as-text), so the saved cell is { v: '123', t: 4 }.
  assert.deepEqual(cellAt(geometry, 12, 2), { v: '123', t: 4 }, 'C13 forced numeric text saved as string')
  assert.ok(geometry.mergeData.some((m) => m.startRow === 2 && m.startColumn === 2 && m.endRow === 3 && m.endColumn === 4), 'C3:E4 merge saved')
  assert.equal(geometry.rowData['6'].hd, 1, 'row 7 hidden flag saved')
  assert.equal(geometry.columnData['5'].hd, 1, 'column F hidden flag saved')
  assert.equal(geometry.columnData['2'].w, 50, 'narrow column width saved')
  assert.equal(geometry.columnData['3'].w, 240, 'wide column width saved')
  assert.equal(align.rowData['25'].h, 100, 'explicit forced row height saved')
  // The 'General text' probe did not survive as text: the runtime coerced the
  // numeric string to a number on save, so it duplicates the general-number
  // case as-saved (real text-vs-number coverage lives in the t:4 case).
  assert.deepEqual(cellAt(align, 6, 2), { v: 123.45, t: 2 }, 'C7 coerced to number by the runtime')
  console.log('✓ serialized shapes match real runtime output (enums/edges/runs/merges/hidden/geometry)')

  const api = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/itemTypst.ts'), {
    '../../components/nodeVisual': { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' },
    '../finalNumber': {
      readFinalValueFromSnapshot: (node) => node.finalCell ?? 600,
      getItemRate: () => 100
    },
    '../nodeSettings': {
      resolveNodeSettings: () => ({ pageSize: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 25 } })
    },
    '../signatureFooter': {
      resolveSignatureFooter: (project) => project.signatureFooter
    },
    '../projectItems': {
      rateAnalysisOverrideForNode: () => null
    },
    '../dashboardSync': {
      dashboardContextMatches: () => false,
      dashboardItemIsSynced: () => false
    }
  })
  const detailGrid = loadTsModule(path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts'))

  // F2. Snapshot preservation through the app data path, per sheet.
  for (const name of SHEETS) {
    const single = workbookForSheet(wb, name)
    const data = api.buildItemSheetRenderData(project, makeItem(single, name))
    const usheet = data.univer.sheets[data.univer.sheetOrder[0]]
    assert.equal(usheet.name, name, `${name}: sheet identity preserved`)
    const src = sheetByName(wb, name).sheet
    assert.deepEqual(Object.keys(usheet.cellData).sort(), Object.keys(src.cellData).sort(), `${name}: cell rows preserved`)
    assert.equal((usheet.mergeData ?? []).length, (src.mergeData ?? []).length, `${name}: merges preserved`)
    assert.deepEqual(usheet.rowData?.['0'], src.rowData?.['0'], `${name}: row geometry preserved`)
    assert.deepEqual(usheet.columnData, src.columnData, `${name}: column geometry preserved`)
    for (const c of manifest.cases.filter((c) => c.sheet === name)) {
      const row = Number(/^C(\d+)$/.exec(c.cell)[1]) - 1
      assert.deepEqual(usheet.cellData[String(row)]['2'], src.cellData[String(row)]['2'], `${name} ${c.cell} preserved`)
    }
  }
  console.log('✓ app snapshot preserves all six sheets (values/styles/geometry/merges)')

  // F2b. Installed display text (_ee): the producer mirrors the runtime
  // preview call; compile inputs carry it, sources stay pristine.
  const display = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/univerDisplayText.ts'))
  // Section colors resolve to installed defaultTheme .500 hex upfront;
  // theme misses and non-colors resolve to nothing (canvas default ink).
  assert.equal(display.eeSectionColorToHex('[red]'), '#F05252', '[Red] -> theme red.500')
  assert.equal(display.eeSectionColorToHex('[Blue]'), '#3F83F8', '[Blue] -> theme blue.500')
  assert.equal(display.eeSectionColorToHex('[GREEN]'), '#0DA471', '[Green] -> theme green.500')
  assert.equal(display.eeSectionColorToHex('#AB12CD'), '#AB12CD', 'palette hex passes through')
  assert.equal(display.eeSectionColorToHex('#ABC'), '#ABC', '3-digit hex passes through')
  assert.equal(display.eeSectionColorToHex('#AB12'), '#AB12', '4-digit hex passes through')
  assert.equal(display.eeSectionColorToHex('#AB12CD34'), '#AB12CD34', '8-digit hex passes through')
  assert.equal(display.eeSectionColorToHex('#AB12C'), undefined, '5-digit hex rejected')
  assert.equal(display.eeSectionColorToHex('#AB12CD3'), undefined, '7-digit hex rejected')
  assert.equal(display.eeSectionColorToHex('[black]'), undefined, '[Black] misses the theme')
  assert.equal(display.eeSectionColorToHex('[magenta]'), undefined, '[Magenta] misses the theme')
  assert.equal(display.eeSectionColorToHex('red'), '#F05252', 'bare red (installed formatColor shape) -> theme red.500')
  assert.equal(display.eeSectionColorToHex('Blue'), '#3F83F8', 'bare Blue -> theme blue.500')
  assert.equal(display.eeSectionColorToHex('chartreuse'), undefined, 'unknown bare name misses the theme')
  assert.equal(display.eeSectionColorToHex(undefined), undefined, 'missing color')
  // Display strings for every Number-formats case (same strings the
  // rendered-geometry layer asserts on): text verbatim, color only for the
  // negative section-color cases, nothing for General.
  const numSheet = sheetByName(wb, 'Number formats').sheet
  const annotated = display.attachEeDisplayText(workbookForSheet(wb, 'Number formats'))
  const eeAt = (r) => annotated.sheets[annotated.sheetOrder[0]].cellData[String(r)]['2']._ee
  assert.equal(eeAt(2), undefined, 'General carries no _ee')
  assert.equal(eeAt(3).d, '1234.57', '0.00 display')
  assert.equal(eeAt(4).d, '1,234.57', '#,##0.00 display')
  assert.equal(eeAt(5).d, '12.5%', 'percent display')
  assert.equal(eeAt(6).d, '₹1,234.50', 'quoted-literal display')
  assert.equal(eeAt(7).d, '(1,234.50)', 'negative-parentheses display')
  assert.equal(eeAt(7).c, '#F05252', 'negative [Red] section hex')
  assert.equal(eeAt(8).d, '2023-03-15', 'date display')
  assert.equal(eeAt(9).d, '12:00:00', 'time display')
  assert.equal(eeAt(10).d, '1.23E+06', 'scientific display')
  assert.equal(eeAt(11).d, '1 1/4', 'fraction display')
  assert.equal(eeAt(12).d, '2', 'conditional-section display (installed [<0] omits the minus)')
  assert.equal(eeAt(12).c, '#F05252', 'conditional [Red] section hex')
  assert.equal(eeAt(13).d, '00042', 'zero-pad display')
  assert.ok(!('c' in eeAt(3)), 'positive value carries no section color (installed quirk)')
  // Strings, plain booleans and forced text never reach numfmt: the
  // installed interceptor skips t:3/t:4, so TRUE/FALSE stays explicit.
  const alignSingle = display.attachEeDisplayText(workbookForSheet(wb, 'Alignment wrap rotation'))
  const alignCells = alignSingle.sheets[alignSingle.sheetOrder[0]].cellData
  assert.equal(alignCells['25']['2']._ee, undefined, 'C26 plain string: no _ee')
  assert.equal(alignCells['7']['2']._ee, undefined, 'C8 boolean: no _ee (TRUE/FALSE stays explicit)')
  const geoSingle = display.attachEeDisplayText(workbookForSheet(wb, 'Geometry merges unicode'))
  assert.equal(geoSingle.sheets[geoSingle.sheetOrder[0]].cellData['12']['2']._ee, undefined, 'C13 forced text: no _ee')
  // Clone-on-write: the saved fixture gains no _ee keys.
  assert.ok(!JSON.stringify(numSheet).includes('_ee'), 'fixture snapshot not mutated by attach')
  assert.ok(!JSON.stringify(wb).includes('_ee'), 'workbook artifact not mutated by attach')
  // Compile inputs carry _ee while render data stays pristine (F2 compat).
  const numItem = makeItem(workbookForSheet(wb, 'Number formats'), 'Number formats')
  const compiled = JSON.parse(api.itemSheetCompileInputs(project, numItem)['ee-data'])
  const compiledCell = compiled.univer.sheets[compiled.univer.sheetOrder[0]].cellData['7']['2']
  assert.equal(compiledCell._ee.d, '(1,234.50)', 'compile inputs carry display text')
  assert.equal(compiledCell._ee.c, '#F05252', 'compile inputs carry section hex')
  assert.equal(compiledCell.v, -1234.5, 'compile inputs keep the original value')
  const fresh = api.buildItemSheetRenderData(project, makeItem(workbookForSheet(wb, 'Number formats'), 'Number formats'))
  assert.equal(fresh.univer.sheets[fresh.univer.sheetOrder[0]].cellData['7']['2']._ee, undefined, 'render data stays pristine')
  console.log('✓ installed display text: 12 number displays verbatim, theme hex upfront, sources pristine')

  // F3. Excel payloads in plain node: values, types, numFmt, alignment
  // tokens, borders, rotation, runs, merges, hidden dims, geometry.
  const grids = {}
  for (const name of SHEETS) {
    const { sheet } = sheetByName(wb, name)
    grids[name] = detailGrid.flattenSheet(gridInput(sheet, wb), RANGE, {})
  }
  const at = (name, r, c) => grids[name].cells.find((cell) => cell.r === r && cell.c === c)

  // Number formats: values stay numeric, patterns pass through verbatim —
  // Excel evaluates dates/scientific/fractions natively from serial + numFmt.
  const numCases = [
    [2, 1234.567, 'General'], [3, 1234.567, '0.00'], [4, 1234.567, '#,##0.00'],
    [5, 0.125, '0.0%'], [6, 1234.5, '"₹"#,##0.00'], [7, -1234.5, '#,##0.00;[Red](#,##0.00)'],
    [8, 45000, 'yyyy-mm-dd'], [9, 0.5, 'hh:mm:ss'], [10, 1234567, '0.00E+00'],
    [11, 1.25, '# ?/?'], [12, -2, '[Red][<0]0;[Blue]0'], [13, 42, '00000']
  ]
  for (const [r, v, fmt] of numCases) {
    const cell = at('Number formats', r, 2)
    assert.ok(cell, `number case row ${r} present`)
    assert.equal(cell.value, v, `number value kept (${fmt})`)
    assert.equal(typeof cell.value, 'number', `number type kept (${fmt})`)
    assert.equal(cell.numFmt, fmt, `numFmt verbatim (${fmt})`)
  }
  console.log('✓ Excel payloads: 12 number formats (values + verbatim patterns)')

  // Alignment: explicit ht tokens; general inference only for rotated text
  // (plain types stay unset — Excel native General matches the installed
  // rule: numbers right, booleans center, text left).
  assert.equal(at('Alignment wrap rotation', 2, 2).style.align, 'left', 'C3 numeric left')
  assert.equal(at('Alignment wrap rotation', 3, 2).style.align, 'center', 'C4 numeric center')
  assert.equal(at('Alignment wrap rotation', 4, 2).style.align, 'right', "C5 'normal' serialized as explicit right")
  assert.equal(at('Alignment wrap rotation', 5, 2).style?.align, undefined, 'C6 general number: native General')
  const boolCell = at('Alignment wrap rotation', 7, 2)
  assert.equal(boolCell.value, true, 'C8 stored 1/0 boolean coerced to Bool')
  assert.equal(typeof boolCell.value, 'boolean', 'C8 boolean type (TRUE/FALSE display, native center)')
  assert.equal(boolCell.style?.align, undefined, 'C8 unrotated: native General centers')
  assert.equal(at('Alignment wrap rotation', 9, 2).style.valign, 'top', 'C10 vertical top')
  assert.equal(at('Alignment wrap rotation', 10, 2).style.valign, 'middle', 'C11 vertical middle')
  assert.equal(at('Alignment wrap rotation', 11, 2).style.valign, 'bottom', 'C12 vertical bottom')
  assert.equal(at('Alignment wrap rotation', 13, 2).style.wrap, true, 'C14 WRAP wraps')
  assert.equal(at('Alignment wrap rotation', 14, 2).style?.wrap, undefined, 'C15 CLIP never wraps')
  assert.equal(at('Alignment wrap rotation', 15, 2).style?.wrap, undefined, 'C16 OVERFLOW never wraps')
  assert.equal(at('Alignment wrap rotation', 18, 2).style.rotation, -90, 'C19 angle -90')
  assert.equal(at('Alignment wrap rotation', 18, 2).style.align, 'right', 'C19 rotated-down rights (installed rule)')
  assert.equal(at('Alignment wrap rotation', 19, 2).style.rotation, -45, 'C20 angle -45')
  assert.equal(at('Alignment wrap rotation', 19, 2).style.align, 'left', 'C20 string at -45 falls to type rule')
  assert.equal(at('Alignment wrap rotation', 20, 2).style?.rotation, undefined, 'C21 angle 0: no rotation')
  assert.equal(at('Alignment wrap rotation', 21, 2).style.rotation, 45, 'C22 angle 45')
  assert.equal(at('Alignment wrap rotation', 21, 2).style.align, 'right', 'C22 rotated-down rights')
  assert.equal(at('Alignment wrap rotation', 22, 2).style.rotation, -90, 'C23 angle 90 folds to -90 window')
  assert.equal(at('Alignment wrap rotation', 22, 2).style.align, 'left', 'C23 string at 90 falls to type rule')
  assert.equal(at('Alignment wrap rotation', 25, 2).style.rotation, -90, 'C26 vertical mode is continuous -90')
  assert.equal(at('Alignment wrap rotation', 25, 2).style.align, 'center', 'C26 vertical mode centers (installed rule)')
  assert.equal(at('Alignment wrap rotation', 25, 2).value, 'fgfgfgfgffgfg', 'C26 text kept')
  assert.equal(at('Alignment wrap rotation', 25, 3)?.value, 'zdvfdssv', 'D26 neighbour kept')
  console.log('✓ Excel payloads: alignment/rotation inference mirrors the installed General rule')

  // Fonts and decoration: names, sizes, bold/italic/line-through/color/fill.
  assert.equal(at('Fonts and decoration', 2, 2).style.fontName, 'Arial', 'C3 Arial')
  assert.equal(at('Fonts and decoration', 3, 2).style.fontName, 'Calibri', 'C4 Calibri')
  assert.equal(at('Fonts and decoration', 4, 2).style.fontName, 'Times New Roman', 'C5 Times')
  assert.equal(at('Fonts and decoration', 5, 2).style.fontName, 'Courier New', 'C6 Courier')
  assert.equal(at('Fonts and decoration', 7, 2).style.sizePt, 8, 'C8 size 8')
  assert.equal(at('Fonts and decoration', 8, 2).style.sizePt, 11, 'C9 size 11')
  assert.equal(at('Fonts and decoration', 9, 2).style.sizePt, 14, 'C10 size 14')
  assert.equal(at('Fonts and decoration', 10, 2).style.sizePt, 20, 'C11 size 20')
  assert.equal(at('Fonts and decoration', 12, 2).style.bold, true, 'C13 bold')
  assert.equal(at('Fonts and decoration', 13, 2).style.italic, true, 'C14 italic')
  assert.equal(at('Fonts and decoration', 14, 2).style.underline, true, 'C15 underline object form')
  assert.equal(at('Fonts and decoration', 15, 2).style.strike, true, 'C16 strike object form')
  assert.equal(at('Fonts and decoration', 16, 2).style.colorRgb, 'D02030', 'C17 font color')
  assert.equal(at('Fonts and decoration', 16, 2).style.bgRgb, 'FFF0A0', 'C17 fill')
  console.log('✓ Excel payloads: fonts/sizes/decorations/color/fill')

  // Border enum matrix: every serialized code reaches its Excel token.
  // Only top/left are asserted: Univer stores shared bottom edges once
  // (the row below steals them), so bottom presence varies by neighbour —
  // the edge still renders from the neighbour's top side.
  const borderTokens = [null, 'thin', 'hair', 'dotted', 'dashed', 'dashDot', 'dashDotDot',
    'double', 'medium', 'mediumDashed', 'mediumDashDot', 'mediumDashDotDot',
    'slantDashDot', 'thick']
  for (let s = 0; s <= 13; s++) {
    const cell = at('Border enum matrix', s + 2, 2)
    assert.ok(cell, `border row C${s + 3} present`)
    if (s === 0) {
      assert.equal(cell.border, undefined, 'C3 NONE writes no border')
    } else {
      assert.ok(cell.border, `C${s + 3} border present`)
      assert.equal(cell.border.top.style, borderTokens[s], `C${s + 3} top is ${borderTokens[s]}`)
      assert.equal(cell.border.left.style, borderTokens[s], `C${s + 3} left is ${borderTokens[s]}`)
      assert.equal(cell.border.top.colorRgb, '204080', `C${s + 3} border color kept`)
    }
  }
  console.log('✓ Excel payloads: border enum matrix s:0..13 (NONE writes nothing)')

  // Geometry: merges rebased with origins kept, hidden dims zeroed, column
  // widths exact, rich runs sliced by UTF-16 units, forced text stays text.
  const geo = grids['Geometry merges unicode']
  assert.ok(geo.merges.some((m) => m.r1 === 2 && m.c1 === 2 && m.r2 === 3 && m.c2 === 4), 'C3:E4 merge rebased')
  assert.ok(geo.merges.some((m) => m.r1 === 0 && m.c1 === 0 && m.r2 === 0 && m.c2 === 7), 'title merge rebased')
  assert.equal(at('Geometry merges unicode', 2, 2).value, 'Merged block', 'merge origin keeps value')
  assert.equal(at('Geometry merges unicode', 2, 3), undefined, 'merge non-origin skipped')
  assert.equal(geo.colWidthsPx[5], 0, 'hidden column F -> width 0')
  assert.equal(geo.rowHeightsPt[6], 0, 'hidden row 7 -> height 0')
  assert.equal(geo.colWidthsPx[2], 50, 'narrow column exact pixels')
  assert.equal(geo.colWidthsPx[3], 240, 'wide column exact pixels')
  assert.equal(geo.rowHeightsPt[0], 24, 'forced 32px row -> 24pt')
  const richCell = at('Geometry merges unicode', 10, 2)
  assert.ok(richCell && richCell.runs && richCell.runs.length >= 2, 'C11 rich runs kept')
  assert.equal(richCell.runs[0].text, 'Bold', 'C11 first run is the styled span')
  assert.equal(richCell.runs[0].style.bold, true, 'C11 run bold')
  assert.equal(richCell.runs[0].style.colorRgb, 'D02030', 'C11 run color')
  const stream = cellAt(sheetByName(wb, 'Geometry merges unicode').sheet, 10, 2).p.body.dataStream
  assert.equal(richCell.runs.map((r) => r.text).join(''), stream, 'C11 runs tile the stream (UTF-16 slicing)')
  assert.equal(at('Geometry merges unicode', 12, 2).value, '123', 'C13 forced text stays a string')
  assert.equal(typeof at('Geometry merges unicode', 12, 2).value, 'string', 'C13 string type')
  // Numeric-valued t:4 is an allowed input shape (hand-authored or older
  // saves): the normalizer must still emit a string cell, never a number.
  const forcedNum = detailGrid.flattenSheet({
    cellData: { 0: { 0: { v: 123, t: 4 } } },
    mergeData: [], styles: {}, rowData: {}, columnData: {},
    defaultColW: 88, defaultRowH: 24, defaultStyle: null
  }, { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }, {})
  assert.equal(forcedNum.cells.length, 1, 'numeric t:4 cell kept')
  assert.equal(forcedNum.cells[0].value, '123', 'numeric t:4 coerced to string')
  assert.equal(typeof forcedNum.cells[0].value, 'string', 'numeric t:4 string type')
  const uniCell = at('Geometry merges unicode', 8, 2)
  assert.ok(typeof uniCell.value === 'string' && uniCell.value.includes('中文') && uniCell.value.includes('😀'), 'C9 unicode survives')
  console.log('✓ Excel payloads: merges/hidden/geometry/rich-text/forced-text/unicode')

  // Advanced styles: direction and justification map; superscript,
  // subscript, overline and padding have no Excel payload field, so values
  // survive while PDF alone renders the decoration (classified approximate).
  assert.equal(at('Advanced cell styles', 2, 2).value, 'x2', 'C3 superscript value kept')
  assert.equal(at('Advanced cell styles', 3, 2).value, 'H2O', 'C4 subscript value kept')
  assert.equal(at('Advanced cell styles', 4, 2).value, 'Overline', 'C5 overline value kept')
  assert.equal(at('Advanced cell styles', 5, 2).style.underline, true, 'C6 dash-heavy underline falls back to single')
  assert.equal(at('Advanced cell styles', 6, 2).value, 'Padded', 'C7 padded value kept')
  assert.equal(at('Advanced cell styles', 7, 2).style.readingOrder, 2, 'C8 RTL reading order')
  assert.equal(at('Advanced cell styles', 8, 2).style.readingOrder, 1, 'C9 LTR reading order')
  assert.equal(at('Advanced cell styles', 9, 2).style.align, 'justify', 'C10 justified')
  assert.equal(at('Advanced cell styles', 10, 2).style.align, 'justify', 'C11 both falls back to justified')
  assert.equal(at('Advanced cell styles', 11, 2).style.align, 'justify', 'C12 distributed falls back to justified')
  assert.equal(at('Advanced cell styles', 12, 2).border, undefined, 'C13 diagonal-down has no orthogonal border')
  assert.equal(at('Advanced cell styles', 13, 2).border, undefined, 'C14 diagonal-up has no orthogonal border')
  console.log('✓ Excel payloads: direction/justification; va/overline/padding/diagonals classified')

  // F4. Typst rev marker: every sheet renders through the current prelude.
  for (const name of SHEETS) {
    const source = api.resolvedItemSheetTypstSource(project, makeItem(workbookForSheet(wb, name), name))
    assert.match(source, /ee-sheet-rev:\s*15/, `${name}: rev-15 renderer`)
    assert.ok(source.includes('render-univer-sheet'), `${name}: sheet renderer present`)
  }
  console.log('✓ all six sheets build from the ee-sheet-rev: 15 renderer')

  // F5. Rendered SVG geometry (compiler-gated). Skips distinctly without the
  // compiler package — snapshot, payload and marker checks above still stand.
  let NodeCompiler
  try {
    NodeCompiler = require('@myriaddreamin/typst-ts-node-compiler').NodeCompiler
  } catch {
    console.log('SKIP: typst compiler package not installed — rendered-geometry toolchain-blocked')
    console.log('  fixture + snapshot + payload + marker checks verified; rerun with the compiler installed')
    return
  }
  // Per-sheet compile with the sheet name and compiler diagnostics on
  // failure. Sources save even when compilation throws, so a failure leaves
  // the exact failing input behind; PDF/SVG save before any geometry assert.
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  fs.mkdirSync(artifactDir, { recursive: true })
  const compileSheet = (name) => {
    const item = makeItem(workbookForSheet(wb, name), name)
    let source
    try {
      source = api.resolvedItemSheetTypstSource(project, item)
    } catch (err) {
      console.error(`[${name}] source build failed: ${err && err.message ? err.message : err}`)
      throw err
    }
    fs.writeFileSync(path.join(artifactDir, `${slug(name)}.typ`), source)
    const inputs = api.itemSheetCompileInputs(project, item)
    const compiler = NodeCompiler.create({ workspace: root })
    try {
      const svg = compiler.svg({ mainFileContent: source, inputs })
      const pdf = compiler.pdf({ mainFileContent: source, inputs })
      return { svg, pdf, source }
    } catch (err) {
      console.error(`[${name}] Typst compile failed: ${formatCompilerError(err)}`)
      console.error(`[${name}] failing source saved at ${path.join(artifactDir, `${slug(name)}.typ`)}`)
      throw err
    } finally {
      compiler.resetShadow()
    }
  }
  // Number-format helpers compile independently before any geometry check:
  // one minimal source per branch over the prelude alone, so a failure
  // names the exact helper probe instead of hiding inside a sheet layout.
  const formatCompilerError = (err) => {
    try {
      const own = err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : []
      const info = {}
      for (const key of own) {
        try { info[key] = String(err[key]).slice(0, 2000) } catch { /* keep partial */ }
      }
      return JSON.stringify(info).slice(0, 4000)
    } catch {
      return String(err && err.message ? err.message : err)
    }
  }
  const prelude = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/univerSheet.typ'), 'utf8')
  const probeCases = [
    ['general', '1234.567', 'General', '1234.567'],
    ['decimal', '1234.567', '0.00', '1234.57'],
    ['grouping', '1234.567', '#,##0.00', '1,234.57'],
    ['percent', '0.125', '0.0%', '12.5%'],
    ['negative-parens', '-1234.5', '#,##0.00;[Red](#,##0.00)', '(1,234.50)'],
    ['date', '45000', 'yyyy-mm-dd', '2023-03-15'],
    ['time', '0.5', 'hh:mm:ss', '12:00:00'],
    ['scientific', '1234567', '0.00E+00', '1.23E+06'],
    ['fraction', '1.25', '# ?/?', '1 1/4'],
    ['conditional', '-2', '[Red][<0]0;[Blue]0', '2'],
    ['zero-pad', '42', '00000', '00042']
  ]
  const probeCompiler = NodeCompiler.create({ workspace: root })
  try {
    for (const [name, v, pattern, text] of probeCases) {
      const probeSource = `${prelude}\n// probe: ${name}\n#format-number-pattern(${v}, "${pattern}")\n`
      const probePath = path.join(artifactDir, `number-helpers-${name}.typ`)
      fs.writeFileSync(probePath, probeSource)
      let svg
      try {
        svg = probeCompiler.svg({ mainFileContent: probeSource, inputs: {} })
      } catch (err) {
        console.error(`[helper:${name}] Typst compile failed: ${formatCompilerError(err)}`)
        console.error(`[helper:${name}] failing source saved at ${probePath}`)
        throw err
      }
      findText(parseSvgScene(svg).texts, text, `helper display ${name} (${text})`)
    }
  } finally {
    probeCompiler.resetShadow()
  }
  console.log('✓ number-format helpers compile independently (11 probes)')
  const scenes = {}
  const rawSvgs = {}
  for (const name of SHEETS) {
    const { svg, pdf } = compileSheet(name)
    assert.ok(pdf.length > 4000, `${name}: PDF rendered`)
    fs.writeFileSync(path.join(artifactDir, `${slug(name)}.pdf`), Buffer.from(pdf))
    fs.writeFileSync(path.join(artifactDir, `${slug(name)}.svg`), svg)
    scenes[name] = parseSvgScene(svg)
    rawSvgs[name] = svg
    const kept = scenes[name].segs.length
    assert.ok(kept > 0, `${name}: table strokes parsed (defs/glyphs excluded)`)
    // No stray empty-array rendering: an empty Typst array in content
    // position paints a literal "()" run (overlay-images else-branch).
    assert.ok(!scenes[name].texts.some((t) => t.text.trim() === '()'), `${name}: no stray "()" text`)
  }
  console.log(`✓ artifacts saved to ${artifactDir} (source + PDF + SVG per sheet, before assertions)`)

  // Display strings: the renderer consumes displayed text, so every number
  // format must materialize exactly (findText matches substrings, tolerant
  // to surrounding runs; the rupee sign is skipped — font-dependent).
  const numScene = scenes['Number formats']
  for (const text of ['1234.567', '1234.57', '1,234.57', '12.5%', '1,234.50',
    '(1,234.50)', '2023-03-15', '12:00:00', '1.23E+06', '1 1/4', '2', '00042']) {
    findText(numScene.texts, text, `number display ${text}`)
  }
  console.log('✓ rendered display strings: general/decimal/grouping/percent/currency/negative/date/time/scientific/fraction/conditional/zeros')

  // Vertical mode + wrap on the fixture (Check-1 B1 extended): the ~90°
  // runs spell the string and sit centered in column C (installed General
  // rule), not left-aligned.
  const alignScene = scenes['Alignment wrap rotation']
  const bare = (s) => s.replace(/[\s\u200b]+/g, '')
  const VERTICAL = 'fgfgfgfgffgfg'
  const c26runs = alignScene.texts.filter((t) =>
    t.rots.some((a) => Math.abs(Math.abs(a) - 90) < 3) && bare(t.text).length > 0 && VERTICAL.includes(bare(t.text)))
  assert.ok(c26runs.length >= 1, 'C26 rotated runs present')
  assert.equal(c26runs.map((t) => bare(t.text)).join(''), VERTICAL, 'C26 runs spell the exact string')
  const b = boundaries(alignScene.segs)
  assert.ok(b.cols.length >= 4, `column bands found (${b.cols.length})`)
  const gx0 = Math.min(...c26runs.map((t) => t.x0))
  const gx1 = Math.max(...c26runs.map((t) => t.x1))
  const gcx = (gx0 + gx1) / 2
  const cb = bandContaining(b.cols, gcx)
  assert.equal(cb, 2, `C26 group in column C (band ${cb})`)
  const colW = b.cols[3] - b.cols[2]
  assert.ok(gcx - b.cols[2] > colW * 0.3, `C26 centered, not left (offset ${(gcx - b.cols[2]).toFixed(1)} of ${colW.toFixed(1)})`)
  assert.ok(b.cols[3] - gcx > colW * 0.2, 'C26 centered, not right')
  // General boolean centers under the installed rule.
  const trueRun = findText(alignScene.texts, 'TRUE', 'boolean display')
  const tb = bandContaining(b.cols, trueRun.cx)
  assert.equal(tb, 2, 'TRUE in column C')
  const tw = b.cols[3] - b.cols[2]
  assert.ok(Math.abs(trueRun.cx - (b.cols[2] + b.cols[3]) / 2) < tw * 0.2, 'TRUE centered (installed boolean rule)')
  // Explicit and rotated alignments place across the full content width.
  const leftRun = findText(alignScene.texts, '123.45', 'numeric display')
  assert.ok(leftRun.cx - b.cols[2] < (b.cols[3] - b.cols[2]) * 0.4, 'C3 explicit-left number sits left')
  // Angle cases rotate: each C19..C23 cell (SOURCE rows 18..22) spells
  // 'Rotate 123' across its runs, whole or split by shaping. The grid
  // paginates mid-sheet — the page break between source rows 17 and 18
  // leaves a 162.58pt margin gap matching no row — so SVG bands do NOT
  // equal source rows past the break. The mapping is derived by tiling
  // detected gaps against the saved visible row heights (no offset
  // constant); the artifact gap is proven to span the page boundary.
  // Group fragments by row band; per group verify the SIGNED angle against
  // the saved style and the logical fragment order (x0 order; vertical
  // groups read along the rotated line, so either cy direction is accepted
  // with the sign recorded).
  const alignSheet = sheetByName(wb, 'Alignment wrap rotation').sheet
  const alignHeightsPt = []
  for (let r = 0; r <= 31; r++) {
    const rd = alignSheet.rowData?.[String(r)]
    assert.ok(!(rd && rd.hd), `alignment source row ${r} visible (derived mapping needs no hidden rows)`)
    let h = alignSheet.defaultRowHeight
    const ah = Number(rd?.ah)
    if ((rd?.ia === undefined || rd?.ia === 1) && Number.isFinite(ah) && ah > 0) h = ah
    else if (Number.isFinite(Number(rd?.h)) && Number(rd.h) > 0) h = Number(rd.h)
    alignHeightsPt.push(h * 0.75)
  }
  const { rowToBand, artifacts } = deriveRowBands(b.rows, alignHeightsPt, svgRootHeight(rawSvgs['Alignment wrap rotation']), 'Alignment wrap rotation')
  console.log(`  row→band derived over ${b.rows.length} bounds (${artifacts.map((a) => `pagination gap ${a.height.toFixed(2)}pt at bound ${a.gapIndex}`).join('; ')})`)
  const rotGroups = new Map()
  for (const t of alignScene.texts) {
    const fragment = bare(t.text)
    if (fragment.length < 2 || !'Rotate123'.includes(fragment)) continue
    const r = bandContaining(b.rows, t.cy)
    if (r < 0) continue
    if (!rotGroups.has(r)) rotGroups.set(r, [])
    rotGroups.get(r).push(t)
  }
  const expectedAngles = new Map([[18, -90], [19, -45], [20, 0], [21, 45], [22, 90]])
  const wantedBands = new Set([...expectedAngles.keys()].map((r) => rowToBand.get(r)))
  assert.equal(rotGroups.size, 5, 'five rotation groups (one per cell)')
  for (const key of rotGroups.keys()) assert.ok(wantedBands.has(key), `rotation group owns a mapped expected row (saw band ${key})`)
  for (const [row, deg] of expectedAngles) {
    const group = rotGroups.get(rowToBand.get(row))
    assert.ok(group && group.length > 0, `rotation group in row ${row}`)
    const angs = group.flatMap((t) => t.rots)
    if (deg === 0) {
      assert.equal(angs.length, 0, `row ${row} angle-0 cell unrotated`)
    } else {
      assert.ok(angs.length > 0, `row ${row} runs carry rotation`)
      for (const a of angs) {
        assert.ok(Math.abs(a - deg) < 4, `row ${row} signed angle ${deg} (saw ${a.toFixed(1)})`)
      }
    }
    const byX = [...group].sort((p, q) => p.x0 - q.x0).map((t) => bare(t.text)).join('')
    const byYUp = [...group].sort((p, q) => p.cy - q.cy).map((t) => bare(t.text)).join('')
    const byYDown = [...group].sort((p, q) => q.cy - p.cy).map((t) => bare(t.text)).join('')
    const ordered = byX === 'Rotate123' || ((Math.abs(deg) === 90) && (byYUp === 'Rotate123' || byYDown === 'Rotate123'))
    assert.ok(ordered, `row ${row} fragments spell Rotate123 in order`)
  }
  // Vertical placement thirds in the forced 70px rows (C10/C11/C12).
  const positions = alignScene.texts
    .filter((t) => bare(t.text) === 'Position')
    .sort((p, q) => p.cy - q.cy)
  assert.equal(positions.length, 3, 'three vertical-placement runs')
  const rows = boundaries(alignScene.segs).rows
  const fracs = positions.map((t) => {
    const r1 = bandContaining(rows, t.cy)
    assert.ok(r1 >= 0 && r1 + 1 < rows.length, 'Position inside a row band')
    return (t.cy - rows[r1]) / (rows[r1 + 1] - rows[r1])
  })
  assert.ok(fracs[0] < 0.4, `C10 top third (${fracs[0].toFixed(2)})`)
  assert.ok(fracs[1] > 0.35 && fracs[1] < 0.65, `C11 middle third (${fracs[1].toFixed(2)})`)
  assert.ok(fracs[2] > 0.6, `C12 bottom third (${fracs[2].toFixed(2)})`)
  console.log('✓ rendered geometry: vertical-center placement, boolean center, explicit/rotated alignment, angles, vertical thirds')

  // Font sizes order across the size rows (C8..C11): rendered line height
  // grows with point size. Raw lh is the untransformed local box (equal for
  // every row), so the assertion uses the transformed height vector length.
  // Size rows are r7..r10 (no hidden rows on this sheet).
  const fontScene = scenes['Fonts and decoration']
  const fontRows = boundaries(fontScene.segs).rows
  const aaRuns = fontScene.texts.filter((t) => bare(t.text) === 'Aa0123')
  assert.equal(aaRuns.length, 8, 'eight Aa 0123 runs (4 families + 4 sizes)')
  const sizeHeights = []
  for (const r of [7, 8, 9, 10]) {
    const inRow = aaRuns.filter((t) => bandContaining(fontRows, t.cy) === r)
    assert.equal(inRow.length, 1, `exactly one Aa run in size row C${r + 1}`)
    sizeHeights.push(textHeight(inRow[0]))
  }
  for (let i = 1; i < sizeHeights.length; i++) {
    assert.ok(sizeHeights[i] > sizeHeights[i - 1] + 0.5, `size row order grows (${sizeHeights.map((h) => h.toFixed(1)).join(' < ')})`)
  }
  console.log('✓ rendered geometry: font-size order 8 < 11 < 14 < 20')

  // Geometry sheet: merged block once, unicode present, rich runs in order,
  // forced text present in column C.
  const geoScene = scenes['Geometry merges unicode']
  const geoBands = boundaries(geoScene.segs)
  assert.equal(geoScene.texts.filter((t) => bare(t.text) === 'Mergedblock').length, 1, 'merged block renders once')
  findText(geoScene.texts, '中文', 'unicode display')
  // CJK shares one baseline: 中 and 文 fall in the same row band (a
  // width-driven CJK break would push 文 bands lower). Ownership is by
  // content (each run's text occurs in C9's saved value), never by
  // concatenating neighbours: runs are asserted in place, and later
  // shaped runs may legitimately start past the column edge.
  const c9v = bare(String(cellAt(sheetByName(wb, 'Geometry merges unicode').sheet, 8, 2).v))
  const zhRun = findText(geoScene.texts, '中', 'CJK run')
  const wenRun = findText(geoScene.texts, '文', 'CJK run')
  const geoRows = geoBands.rows
  const zhRow = bandContaining(geoRows, zhRun.cy)
  assert.ok(zhRow >= 0, 'CJK run inside a row band')
  assert.equal(bandContaining(geoRows, wenRun.cy), zhRow, 'CJK single baseline')
  for (const run of [zhRun, wenRun]) {
    assert.ok(bare(run.text).length > 0 && c9v.includes(bare(run.text)), 'CJK run owned by C9 content')
  }
  const richAnchor = findText(geoScene.texts, 'Bold', 'rich run')
  const richRow = bandContaining(geoRows, richAnchor.cy)
  assert.equal(bandContaining(geoBands.cols, richAnchor.x0), 2, 'rich line starts in C11')
  // Follow an anchored, spatially contiguous line past the cell boundary.
  // Each fragment must consume the next source prefix; unrelated neighboring
  // text cannot be appended merely because it shares a row.
  const ordered = []
  let remainingRich = bare(stream)
  let richRight = richAnchor.x0
  for (const t of geoScene.texts.filter(t =>
    bandContaining(geoRows, t.cy) === richRow && t.x0 >= richAnchor.x0 - 0.5 &&
    Math.min(t.y1, richAnchor.y1) - Math.max(t.y0, richAnchor.y0) >=
      Math.min(t.y1 - t.y0, richAnchor.y1 - richAnchor.y0) * 0.5
  ).sort((a, b) => a.x0 - b.x0)) {
    if (!remainingRich) break
    assert.ok(Math.abs(t.x0 - richRight) < 3, 'rich fragments are spatially contiguous')
    const fragment = bare(t.text)
    assert.ok(remainingRich.startsWith(fragment), 'rich fragment consumes next source prefix')
    ordered.push(t)
    remainingRich = remainingRich.slice(fragment.length)
    richRight = t.x1
  }
  assert.equal(ordered.map((t) => bare(t.text)).join(''), bare(stream), 'rich runs tile the stream in order')
  const forcedRun = findText(geoScene.texts, '123', 'forced text display')
  assert.equal(bandContaining(geoBands.cols, forcedRun.cx), 2, 'forced text in column C')
  console.log('✓ rendered geometry: merge-once, unicode, rich order, forced text')

  // Border labels render; padding insets the content box (16px left,
  // 12px right = 12pt/9pt). FO rects are layout boxes: left edge pins the
  // inset while the right edge only needs to stay inside it.
  const borderScene = scenes['Border enum matrix']
  for (const label of ['NONE', 'THIN', 'HAIR', 'DOTTED', 'DASHED', 'DASH_DOT', 'DASH_DOT_DOT',
    'DOUBLE', 'MEDIUM', 'MEDIUM_DASHED', 'MEDIUM_DASH_DOT', 'MEDIUM_DASH_DOT_DOT',
    'SLANT_DASH_DOT', 'THICK']) {
    findText(borderScene.texts, label, `border label ${label}`)
  }
  const advScene = scenes['Advanced cell styles']
  const advBands = boundaries(advScene.segs)
  const padded = findText(advScene.texts, 'Padded', 'padding display')
  assert.ok(padded.x0 >= advBands.cols[2] + 12 - 2, `padding left inset respected (x0 ${padded.x0.toFixed(1)})`)
  assert.ok(padded.x1 <= advBands.cols[3] - 9 + 2, `padding right inset respected (x1 ${padded.x1.toFixed(1)})`)
  findText(advScene.texts, 'x2', 'superscript display')
  findText(advScene.texts, 'H2O', 'subscript display')
  findText(advScene.texts, 'Overline', 'overline display')
  console.log('✓ rendered geometry: 14 border labels, padding insets, decoration content')

  console.log('\nPASS: real-Univer fidelity laboratory (snapshot + payloads + rendered geometry)')
}

main().catch((err) => { console.error(err); process.exit(1) })
