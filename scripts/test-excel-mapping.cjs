const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const fixturePath = path.join(__dirname, 'fixtures', 'excel-mapping', 'workbook-matrix.json')

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

async function main() {
  console.log('--- Excel mapping fixtures (Task C): workbook-matrix.json ---')
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  assert.ok(Array.isArray(fixture.sheets) && fixture.sheets.length === 4, 'four fixture sheets')
  const kinds = fixture.sheets.map((s) => s.kind).sort()
  assert.deepEqual(kinds, ['custom-component', 'project-export', 'shared-multi-item', 'single-item'].sort(), 'kinds covered')

  // Every plan bullet the fixtures claim must be present on at least one sheet.
  const blob = JSON.stringify(fixture)
  for (const token of ['"tr"', '"vt"', '"pd"', '"td"', '"va"', '"tb"', '"hd"', '"bd"', '"sharedSheetId"', '"freeze"', '"tabColor"', '"gridlines"', 'dataBase64', 'pageSetup', 'rowBreaks', '"f"']) {
    assert.ok(blob.includes(token), `fixture exercises ${token}`)
  }
  console.log('✓ Fixture manifest covers all plan bullets (4 sheets)')

  const detailGrid = loadTsModule(path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts'))

  // normRgb: 6-hex, 8-hex alpha drop, rgb() form, garbage rejected.
  assert.equal(detailGrid.normRgb('#d9e2f3'), 'D9E2F3')
  assert.equal(detailGrid.normRgb('#FFD9E2F3'), 'D9E2F3')
  assert.equal(detailGrid.normRgb('rgb(255,242,204)'), 'FFF2CC')
  assert.equal(detailGrid.normRgb('bogus'), undefined)
  console.log('✓ normRgb (color/fill via normRgb)')

  // mapUniverStyle: halign 1/2/3, tb2 clip => no wrap, numFmt verbatim, borders.
  // Border codes follow the installed Univer BorderStyleTypes (1 THIN, 2 HAIR,
  // 3 DOTTED, 4 DASHED, 5 DASH_DOT, 6 DASH_DOT_DOT, 7 DOUBLE, 8 MEDIUM,
  // 9 MEDIUM_DASHED, 10 MEDIUM_DASH_DOT, 11 MEDIUM_DASH_DOT_DOT,
  // 12 SLANT_DASH_DOT, 13 THICK).
  assert.equal(detailGrid.mapUniverStyle({ ht: 1 }).cell.align, 'left')
  assert.equal(detailGrid.mapUniverStyle({ ht: 'c' }).cell.align, 'center')
  assert.equal(detailGrid.mapUniverStyle({ ht: 3 }).cell.align, 'right')
  assert.equal(detailGrid.mapUniverStyle({ tb: 2 }).cell.wrap, undefined, 'tb2 CLIP must not wrap')
  assert.equal(detailGrid.mapUniverStyle({ n: { pattern: '#,##0.00' } }).numFmt, '#,##0.00', 'numFmt verbatim')
  const bd = detailGrid.mapUniverStyle({ bd: { t: { s: 2 }, l: { s: 3 }, b: { s: 6 }, r: { s: 1 } } }).border
  assert.equal(bd.top.style, 'hair', 's:2 is HAIR')
  assert.equal(bd.left.style, 'dotted', 's:3 is DOTTED')
  assert.equal(bd.bottom.style, 'dashDotDot', 's:6 is DASH_DOT_DOT')
  assert.equal(bd.right.style, 'thin', 's:1 is THIN')
  const bd2 = detailGrid.mapUniverStyle({ bd: { t: { s: 4 }, l: { s: 5 }, b: { s: 7 }, r: { s: 8 } } }).border
  assert.equal(bd2.top.style, 'dashed', 's:4 is DASHED')
  assert.equal(bd2.left.style, 'dashDot', 's:5 is DASH_DOT')
  assert.equal(bd2.bottom.style, 'double', 's:7 is DOUBLE')
  assert.equal(bd2.right.style, 'medium', 's:8 is MEDIUM')
  const bd3 = detailGrid.mapUniverStyle({ bd: { t: { s: 9 }, l: { s: 10 }, b: { s: 11 }, r: { s: 12 } } }).border
  assert.equal(bd3.top.style, 'mediumDashed', 's:9 is MEDIUM_DASHED')
  assert.equal(bd3.left.style, 'mediumDashDot', 's:10 is MEDIUM_DASH_DOT')
  assert.equal(bd3.bottom.style, 'mediumDashDotDot', 's:11 is MEDIUM_DASH_DOT_DOT')
  assert.equal(bd3.right.style, 'slantDashDot', 's:12 is SLANT_DASH_DOT')
  assert.equal(detailGrid.mapUniverStyle({ bd: { t: { s: 13 } } }).border.top.style, 'thick', 's:13 is THICK')
  assert.equal(detailGrid.mapUniverStyle({ bd: { t: { s: 0 } } }).border, undefined, 's:0 NONE writes no border')
  assert.equal(detailGrid.mapUniverStyle({ bd: { t: { s: 99 } } }).border.top.style, 'thin', 'unknown code falls back to thin')
  console.log('✓ mapUniverStyle (halign/clip/numfmt/borders)')

  // halign JUSTIFIED fallbacks: 4 JUSTIFIED, 5 BOTH, 6 DISTRIBUTED all => justify.
  assert.equal(detailGrid.mapUniverStyle({ ht: 4 }).cell.align, 'justify')
  assert.equal(detailGrid.mapUniverStyle({ ht: 5 }).cell.align, 'justify', 'ht 5 BOTH falls back to JUSTIFIED')
  assert.equal(detailGrid.mapUniverStyle({ ht: 6 }).cell.align, 'justify', 'ht 6 DISTRIBUTED falls back to JUSTIFIED')
  console.log('✓ mapUniverStyle halign justify fallbacks (ht 4/5/6)')

  // valign: vt 1 TOP / 2 MIDDLE / 3 BOTTOM.
  assert.equal(detailGrid.mapUniverStyle({ vt: 1 }).cell.valign, 'top')
  assert.equal(detailGrid.mapUniverStyle({ vt: 2 }).cell.valign, 'middle')
  assert.equal(detailGrid.mapUniverStyle({ vt: 3 }).cell.valign, 'bottom')
  assert.equal(detailGrid.mapUniverStyle({}).cell.valign, undefined, 'vt absent => no valign')
  console.log('✓ mapUniverStyle valign (vt 1/2/3)')

  // rotation: Univer canvas-rotates laid-out lines (convertTextRotation in
  // engine-render), so tr {a, v} maps to a continuous Excel angle rotation:
  // v=1 forces 90deg clockwise reading top-to-bottom => Excel -90, never
  // stacked 255 text. a folds into -90..90 whole degrees; 0/360/NaN => none.
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: 45 } }).cell.rotation, 45)
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: 135 } }).cell.rotation, -45, 'rotation folds into -90..90')
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: -45 } }).cell.rotation, -45)
  assert.equal(detailGrid.mapUniverStyle({ tr: { v: 1 } }).cell.rotation, -90, 'tr.v is continuous -90 rotation')
  assert.equal(detailGrid.mapUniverStyle({ tr: { v: 1 } }).cell.verticalText, undefined, 'no stacked-text flag from tr')
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: 45, v: 1 } }).cell.rotation, -90, 'vertical wins over angle')
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: 0 } }).cell.rotation, undefined, 'angle 0 => no rotation')
  assert.equal(detailGrid.mapUniverStyle({ tr: { a: 360 } }).cell.rotation, undefined, 'angle 360 => no rotation')
  assert.equal(detailGrid.mapUniverStyle({}).cell.rotation, undefined)
  console.log('✓ mapUniverStyle rotation angle + vertical (tr)')

  // readingOrder: td 1 LTR / 2 RTL; absent => omitted.
  assert.equal(detailGrid.mapUniverStyle({ td: 1 }).cell.readingOrder, 1)
  assert.equal(detailGrid.mapUniverStyle({ td: 2 }).cell.readingOrder, 2)
  assert.equal(detailGrid.mapUniverStyle({}).cell.readingOrder, undefined)
  console.log('✓ mapUniverStyle readingOrder (td 1/2)')

  // wrap: only WRAP tb=3 wraps; OVERFLOW 1 / CLIP 2 / UNSPECIFIED 0 never wrap.
  assert.equal(detailGrid.mapUniverStyle({ tb: 3 }).cell.wrap, true)
  assert.equal(detailGrid.mapUniverStyle({ tb: 1 }).cell.wrap, undefined, 'tb1 OVERFLOW must not wrap')
  assert.equal(detailGrid.mapUniverStyle({ tb: 0 }).cell.wrap, undefined)
  console.log('✓ mapUniverStyle wrap gate (tb===3 only)')

  // Style composition (mirrors Univer composeStyles): default <- column <-
  // row <- theme <- cell, per key; only absent keys fall through while
  // explicit null/0/false win. Row precedes column by default; flippable.
  const compSheet = {
    styles: {
      base: { ff: 'Arial', fs: 11, ht: 2 },
      colr: { ht: 3 },
      rowb: { bg: { rgb: '#FFF2CC' } }
    },
    defaultStyle: 'base',
    cellData: { 0: { 0: { v: 'x', s: { bl: 1 } }, 1: { v: 7 } } },
    rowData: { 0: { s: 'rowb' } },
    columnData: { 0: { s: 'colr' }, 1: {} },
    defaultColW: 88,
    defaultRowH: 24
  }
  const comp = detailGrid.flattenSheet(compSheet, { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 })
  const cc = (r, c) => comp.cells.find((cell) => cell.r === r && cell.c === c)
  assert.equal(cc(0, 0).style.fontName, 'Arial', 'default font inherited through partial cell style')
  assert.equal(cc(0, 0).style.sizePt, 11, 'default size inherited')
  assert.equal(cc(0, 0).style.align, 'right', 'column ht wins over default center')
  assert.equal(cc(0, 0).style.bgRgb, 'FFF2CC', 'row bg inherited')
  assert.equal(cc(0, 0).style.bold, true, 'cell bold kept')
  assert.equal(cc(0, 1).style.align, 'center', 'default ht applies where column/row/cell are silent')
  // Explicit null blocks inheritance (Univer: only undefined falls through).
  const compNull = detailGrid.flattenSheet(
    { styles: { rowb: { bg: { rgb: '#FFF2CC' } } }, cellData: { 0: { 0: { v: 'x', s: { bg: null } } } }, rowData: { 0: { s: 'rowb' } } },
    { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
  )
  assert.equal(compNull.cells[0].style?.bgRgb, undefined, 'explicit null bg blocks row fill')
  // Row-versus-column precedence: the active renderer default is column
  // wins (skeleton forces the config to false); explicit true flips to row.
  const compFlip = detailGrid.flattenSheet(
    { styles: { r: { ht: 1 }, c: { ht: 3 } }, cellData: { 0: { 0: { v: 'x' } } }, rowData: { 0: { s: 'r' } }, columnData: { 0: { s: 'c' } } },
    { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
  )
  assert.equal(compFlip.cells[0].style.align, 'right', 'column wins by active-renderer default')
  const compRow = detailGrid.flattenSheet(
    { styles: { r: { ht: 1 }, c: { ht: 3 } }, cellData: { 0: { 0: { v: 'x' } } }, rowData: { 0: { s: 'r' } }, columnData: { 0: { s: 'c' } }, rowPrecedesColumn: true },
    { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
  )
  assert.equal(compRow.cells[0].style.align, 'left', 'row wins when rowPrecedesColumn=true')
  console.log('✓ style composition (property merge, null-blocks, precedence flag)')

  // Resolved row heights: (ia absent|1)+ah wins; ia:0 falls back to h;
  // explicit h enforced even below default; absent datum stays null.
  // Pixel lane carries exact widths (0 hidden) alongside chars.
  const geoSheet = {
    cellData: { 0: { 0: { v: 'a' } }, 1: { 0: { v: 'b' } }, 2: { 0: { v: 'c' } }, 3: { 0: { v: 'd' } }, 4: { 0: { v: 'e' } } },
    rowData: {
      0: { ia: 1, ah: 80 },
      1: { ah: 80 },
      2: { ia: 0, h: 24, ah: 80 },
      3: { h: 12 }
    },
    columnData: { 0: { w: 30 } },
    defaultColW: 88,
    defaultRowH: 24
  }
  const geo = detailGrid.flattenSheet(geoSheet, { startRow: 0, startColumn: 0, endRow: 4, endColumn: 0 })
  assert.deepEqual(geo.rowHeightsPt, [60, 60, 18, 9, 18], 'ia/ah/h resolution; absent datum yields the sheet default')
  assert.deepEqual(geo.colWidthsPx, [30], 'pixel lane carries exact widths')
  assert.equal(geo.colWidthsChars[0], 4.29, 'narrow column not floored (30px -> 4.29 chars)')
  const zeroDims = detailGrid.flattenSheet({
    cellData: { 0: { 0: { v: 'x' } } },
    rowData: { 0: { h: 0, ia: 0 } }, columnData: { 0: { w: 0 } },
    defaultColW: 88, defaultRowH: 24
  }, { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 })
  assert.equal(zeroDims.rowHeightsPt[0], 0, 'zero row height remains zero')
  assert.equal(zeroDims.colWidthsPx[0], 0, 'zero column width remains zero')
  console.log('✓ resolved row heights (ia/ah/h) + exact pixel lane')

  // Conflicting value/type pairs: numeric value with forced-text type stays
  // a string cell; plain numerics stay numeric.
  const typeSheet = {
    cellData: { 0: { 0: { v: 123, t: 4 }, 1: { v: 123, t: 2 }, 2: { v: '007', t: 4 } } }
  }
  const typed = detailGrid.flattenSheet(typeSheet, { startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 })
  const tv = (c) => typed.cells.find((cell) => cell.c === c).value
  assert.strictEqual(tv(0), '123', 't:4 forced text with numeric value stays a string')
  assert.strictEqual(tv(1), 123, 't:2 number stays numeric')
  assert.strictEqual(tv(2), '007', 't:4 keeps leading zeros')
  console.log('✓ forced-text vs numeric value types')

  // flattenSheet on the Matrix fixture: merges skip non-origins, hidden zero-out,
  // numerics stay numeric, rich runs kept, formula+value carried.
  const matrix = fixture.sheets.find((s) => s.name === 'Matrix')
  const verdicts = []
  const grid = detailGrid.flattenSheet(matrix, matrix.range, { verdicts })
  const at = (r, c) => grid.cells.find((cell) => cell.r === r && cell.c === c)
  assert.ok(grid.merges.some((m) => m.r1 === 0 && m.c1 === 0 && m.r2 === 0 && m.c2 === 3), 'title merge rebased')
  assert.equal(at(0, 1), undefined, 'merged non-origin skipped')
  assert.equal(at(2, 1).value, 10, 'numeric regression: stays number')
  assert.equal(typeof at(2, 2).formula, 'string', 'formula cell keeps live formula')
  assert.equal(at(2, 2).formula, '=B3*C3', 'absolute refs rebased to grid origin')
  assert.ok(typeof at(5, 2).formula === 'string' && Array.isArray(at(5, 2).runs), 'formula wins over runs: both carried, Rust writes formula')
  assert.ok(verdicts.length >= 2 && verdicts.every((v) => v.ok === true), `formula gate passes in-range refs (${verdicts.length} verdicts)`)
  const rich = at(4, 0)
  assert.ok(rich && rich.runs && rich.runs.length >= 2 && rich.runs[0].style.bold === true, 'rich runs with bold red lead')
  assert.equal(grid.colWidthsChars[4], 0, 'hidden col -> width 0')
  assert.equal(grid.rowHeightsPt[3], 0, 'hidden row -> height 0')
  assert.equal(grid.rowHeightsPt[0], 67.5, 'tall row 90px -> 67.5pt (vertical-text row kept)')
  assert.equal(grid.colWidthsChars[1], 17.14, '120px col -> 17.14 chars')
  console.log('✓ flattenSheet Matrix (positions/values/richtext/hidden/sizes)')

  // Rotation / valign survive flattening on the Matrix header row: tr.v=1 is
  // a continuous -90 rotation (never stacked text).
  assert.equal(at(1, 1).style.rotation, -90, 'B2 header keeps continuous -90 rotation (tr.v=1)')
  assert.equal(at(1, 1).style.verticalText, undefined, 'no stacked-text flag from tr')
  assert.equal(at(1, 1).style.valign, 'middle', 'B2 header keeps vt=2 middle')
  assert.equal(at(1, 2).style.rotation, 45, 'C2 header keeps 45deg rotation (tr.a=45)')
  assert.equal(at(7, 0).style.valign, 'top', 'vt=1 top')
  assert.equal(at(7, 1).style.valign, 'middle', 'vt=2 middle')
  assert.equal(at(7, 2).style.valign, 'bottom', 'vt=3 bottom')
  // ht unset => no explicit align: Excel's general default rights numbers
  // (the Typst renderer applies the same general rule itself).
  assert.equal(at(7, 0).style.align, undefined, 'ht unset => general, no forced align')
  // B1 tall-row regression: title row keeps its explicit tall height even
  // though the vertical-text header sits below it; header row itself is auto.
  assert.equal(grid.rowHeightsPt[0], 67.5, 'tall title row 90px -> 67.5pt kept')
  assert.equal(grid.rowHeightsPt[1], 18, 'row without datum resolves the sheet default (24px -> 18pt)')
  assert.equal(grid.rowHeightsPt[5], 45, 'wrap row 60px -> 45pt')
  assert.equal(grid.colWidthsChars[0], 12.57, 'default 88px col -> 12.57 chars')
  console.log('✓ flattenSheet Matrix (rotation/valign/tall-row)')

  // Merges: both ranges survive rebased; covered origins stay skipped.
  assert.equal(grid.merges.length, 2, 'title merge + rows 8-9 span')
  assert.ok(grid.merges.some((m) => m.r1 === 8 && m.c1 === 0 && m.r2 === 9 && m.c2 === 0), 'rows 8-9 span rebased')
  assert.equal(at(8, 0).value, 'span rows 8-9', 'span origin keeps value')
  // numFmt verbatim on flattened cells; bool and forced-string types intact.
  assert.equal(at(2, 1).numFmt, '#,##0.00', 'money fmt verbatim')
  assert.equal(at(2, 2).numFmt, '#,##0.00', 'inline numFmt verbatim')
  assert.equal(at(4, 3).numFmt, '0.00%', 'percent fmt verbatim')
  assert.equal(at(5, 3).numFmt, 'yyyy-mm-dd', 'date fmt verbatim')
  assert.equal(at(7, 3).value, true, 'bool stays boolean')
  assert.equal(at(8, 3).value, 'force string 007', 't:4 forces string, leading zeros kept')
  // Print geometry carried by the fixture (caller-level): A3 + margins,
  // rowBreak after grid row 5, print area derived from the used range.
  assert.equal(matrix.pageSetup.paperSize, 'A3')
  assert.deepEqual(matrix.pageSetup.marginsMm, { top: 10, right: 11, bottom: 12, left: 13 })
  assert.deepEqual(matrix.rowBreaks, [5])
  assert.equal(`${detailGrid.columnLabel(matrix.range.startColumn)}${matrix.range.startRow + 1}:${detailGrid.columnLabel(matrix.range.endColumn)}${matrix.range.endRow + 1}`, 'A1:E10', 'print area A1:E10')
  // Image carried by the fixture (caller-level): 44x44 png at scale 1x1.
  assert.equal(matrix.images.length, 1)
  assert.equal(matrix.images[0].mime, 'image/png')
  assert.equal(matrix.images[0].widthPx / matrix.images[0].origWPx, 1, 'image scale 1x1')
  console.log('✓ flattenSheet Matrix (merges/numFmt/bool/print-area/image inputs)')

  // Single-Item: merge + overflow tb:1 is no-wrap.
  const single = fixture.sheets.find((s) => s.kind === 'single-item')
  const g2 = detailGrid.flattenSheet(single, single.range)
  assert.ok(g2.merges.some((m) => m.r2 === 0 && m.c2 === 1), 'single title merge')
  assert.equal(g2.cells.find((c) => c.r === 2 && c.c === 1).style, undefined, 'tb:1 overflow => no wrap style')
  assert.equal(g2.cells.find((c) => c.r === 1 && c.c === 1).value, 7, 'single-item qty stays numeric')
  console.log('✓ flattenSheet Single-Item')

  // Custom-Component: RTL readingOrder + live formula; sheet-level flags carried.
  const custom = fixture.sheets.find((s) => s.kind === 'custom-component')
  const customVerdicts = []
  const g3 = detailGrid.flattenSheet(custom, custom.range, { verdicts: customVerdicts })
  assert.equal(g3.cells.find((c) => c.r === 0 && c.c === 1).style.readingOrder, 1, 'td=1 => readingOrder 1')
  assert.equal(g3.cells.find((c) => c.r === 0 && c.c === 0).style.readingOrder, undefined, 'no td => no readingOrder')
  assert.equal(typeof g3.cells.find((c) => c.r === 1 && c.c === 1).formula, 'string', 'B2 keeps live formula over cached 30')
  assert.ok(customVerdicts.length >= 1 && customVerdicts.every((v) => v.ok === true), 'custom formula passes gate')
  assert.equal(custom.sheetFlags.rtl, true, 'RTL flag carried')
  assert.deepEqual(custom.sheetFlags.freeze, { r: 1, c: 0 }, 'freeze origin carried')
  assert.equal(custom.sheetFlags.gridlines, false, 'gridlines off carried')
  assert.equal(custom.sheetFlags.tabColor, '4472C4', 'tabColor carried')
  console.log('✓ flattenSheet Custom-Component (readingOrder/formula/sheet flags)')

  // Project-Export: cross-sheet formula qualified with the shared sheet name;
  // sharedSheetId ties it to the Matrix sheet for single-sheet dedupe.
  const project = fixture.sheets.find((s) => s.kind === 'project-export')
  assert.equal(project.sharedSheetId, matrix.sharedSheetId, 'project export dedupes onto the Matrix sheet')
  assert.ok(String(project.cellData['0']['1'].f).includes(`'${matrix.name}'`), 'cross-sheet formula qualified with sheet name')
  console.log('✓ Project-Export (cross-sheet link + sharedSheetId)')

  // Shared-single-sheet dedupe: Matrix + Project-Export resolve to ONE sheet.
  const byShared = new Map()
  for (const s of fixture.sheets) {
    if (!s.sharedSheetId) continue
    byShared.set(s.sharedSheetId, [...(byShared.get(s.sharedSheetId) ?? []), s.name])
  }
  assert.deepEqual(byShared.get('SHARED-ABSTRACT').sort(), ['Matrix', 'Project-Export'].sort(), 'two items, one sheet')
  assert.equal(new Set(fixture.sheets.map((s) => s.name)).size, fixture.sheets.length, 'sheet names unique (dedupe targets)')
  assert.ok(String(matrix.cellData['0']['0'].v).includes('CD-01') && String(matrix.cellData['0']['0'].v).includes('CD-02'), 'Matrix title carries both item tags')
  assert.equal(matrix.cellData['2']['0'].v, 'CD-01 Earthwork', 'column A carries the item tag')
  console.log('✓ shared-single-sheet dedupe (two items, one sheet)')

  // Images: anchor + data-url split.
  assert.equal(detailGrid.splitDataUrl('data:image/png;base64,QUJD').mime, 'image/png')
  const anchored = detailGrid.anchorImage([88, 88, 88], [24, 24, 24, 24, 24, 24, 24, 24], {
    relLeftPx: 250, relTopPx: 300, widthPx: 44, heightPx: 44, origWPx: 44, origHPx: 44,
    dataBase64: 'QUJD', mime: 'image/png'
  })
  assert.equal(anchored.scaleW, 1)
  assert.equal(anchored.scaleH, 1)
  assert.ok(anchored.r >= 0 && anchored.c >= 0, 'image anchors to a cell')
  console.log('✓ images (anchor + data URL split)')

  // Sheet-name + column helpers used by shared-sheet dedupe.
  assert.equal(detailGrid.columnLabel(27), 'AB')
  assert.equal(detailGrid.sanitizeSheetName('A/B:C*D?E[F]G'), 'A B C D E F G')
  console.log('✓ naming helpers')

  // Formerly plan-level fields are now implemented in detailGrid.ts and
  // asserted above (ht 4-6, vt, tr, td, tb gate, hd, va, sharedSheetId inputs).
  // Caller-level inputs (images/pageSetup/rowBreaks/sheetFlags/pd) stay in the
  // fixture with closest-stable renderings recorded below.
  for (const key of ['inexactFormatExceptions']) {
    assert.ok(Array.isArray(fixture[key]) && fixture[key].length >= 10, `${key} recorded`)
  }
  console.log('✓ inexact-format exceptions recorded (10 entries)')

  console.log('\nPASS: excel-mapping fixtures verified against detailGrid.ts')
  console.log('Proof routing (this run = node logic proof):')
  console.log('  node scripts/test-excel-mapping.cjs            # this test: mapping logic')
  console.log('  node scripts/test-excel-mapping-pdf.cjs        # B1 vertical-text PDF/SVG compile (skips without typst)')
  console.log('  Rust .xlsx round-trip: reopen + verify          # sibling Rust proof owns the exact cargo invocation')
}

main().catch((err) => { console.error(err); process.exit(1) })
