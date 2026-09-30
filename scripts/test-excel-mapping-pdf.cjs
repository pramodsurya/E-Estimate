// B1 proof through the REAL application renderer, on the ACTUAL workbook.
//
// Fixture: scripts/output/b1-proof/actual-check1-workbook.json, extracted from
// the user's Check 1.eestimate (B1 = 'fgfgfgfgffgfg', 13 chars, tb:3 +
// tr:{a:0,v:1}; row 0 = {ah: 85.5032} only; C1 = unstyled 'zdvfdssv';
// C7:C10 bold 14 with formula results; E8 = 12). The short synthetic marker
// fixture is NOT used here. Pipeline: createUniverWorkbookData ->
// buildItemSheetRenderData -> resolvedItemSheetTypstSource ->
// render-univer-sheet.
//
// Root cause under test: the rotation box re-constrained content to the
// narrower rotated width, so the already-wrapped block wrapped a SECOND time
// inside the box — manufacturing extra vertical runs that spread across
// neighbouring columns. Univer wraps vertical text first per tb EXACTLY like
// ordinary text (B1's tb:3 yields two lines — the two vertical runs), then
// rotates the whole laid-out block. Causality is established by asserting
// the ~90-degree runs spell the exact 13-char string, each run's local rect
// is a horizontal line rect (wrapped before rotating), and the painted group
// rect is tall and stays inside column B / row 1, plus geometry.
//
// Geometry is read from the compiled SVG: selectable text lives in
// <foreignObject> elements (the compiler emits glyph <path>/<use>, zero
// <text>), positioned via ancestor transforms which are always composed.
// Fixture geometry: every column is the 88px default (no columnData) and
// row 1 resolves to ah 85.5px — internally consistent (the tall auto height
// matches a ~85px-wide vertical column). If the live sheet is resized after
// extraction (e.g. B narrower than A/C), wrapping changes with it: refresh
// the fixture from the live .eestimate before final sign-off. All geometry
// asserts below are relative to gridline bands, so they hold for whatever
// geometry the fixture carries.
// Gridline segments give row/column bands. Fresh PDF/SVG artifacts are saved
// BEFORE assertions under scripts/output/b1-proof/actual/ so failures remain
// inspectable. Without the compiler package, snapshot + source checks run and
// compile steps SKIP (reported distinctly, never proof).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const workbookPath = path.join(__dirname, 'output', 'b1-proof', 'actual-check1-workbook.json')
const artifactDir = path.join(__dirname, 'output', 'b1-proof', 'actual')

// Vite raw template imports in Node's standalone regression runner.
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

// A .ts loader so `itemTypst.ts` can require the real sibling modules.
require.extensions['.ts'] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  module._compile(outputText, filename)
}

function loadTsModule(filePath, mocks) {
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  const localRequire = Module.createRequire(filePath)
  loaded.require = (request) =>
    request in mocks ? mocks[request] : localRequire(request)
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const B1_TEXT = 'fgfgfgfgffgfg'
const C1_TEXT = 'zdvfdssv'
// 85.50320434570312px × 0.75 — the snapshot's resolved row-1 height.
const ROW1_PT = 85.50320434570312 * 0.75

function makeItem(workbook, flatB1 = false) {
  const wb = JSON.parse(JSON.stringify(workbook))
  if (flatB1) {
    for (const key of Object.keys(wb.styles)) {
      const st = wb.styles[key]
      if (st && st.tr && st.tr.v === 1) st.tr = { a: 0, v: 0 }
    }
  }
  return {
    id: flatB1 ? 'check1-flat' : 'check1-actual',
    name: 'Check 1 Actual',
    itemCode: 'CHECK1',
    itemDescription: 'Actual-workbook B1 regression.',
    itemUnit: 'cum',
    unit: 'cum',
    itemEditorType: 'spreadsheet',
    finalCell: 600,
    print: { range: { startRow: 0, startColumn: 0, endRow: 9, endColumn: 5 }, showGridlines: true },
    charts: [],
    spreadsheet: { styles: wb.styles, sheetOrder: wb.sheetOrder, sheets: wb.sheets }
  }
}

const project = {
  id: 'proj-check1',
  meta: { name: 'Check 1 Proof Project' },
  root: { name: 'Root' },
  signatureFooter: { enabled: false, rows: [] }
}

// SVG scene reader (shared): foreignObject texts + table-stroke segments.
const { parseSvgScene, findText, boundaries, bandContaining } = require('./svg-scene.cjs')

async function main() {
  console.log('--- B1 proof on the ACTUAL Check 1 workbook ---')
  const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'))
  const sheet = workbook.sheets[workbook.sheetOrder[0]]

  // 1. Record the actual source data under test.
  const b1 = sheet.cellData['0']['1']
  const c1src = sheet.cellData['0']['2']
  assert.equal(b1.v, B1_TEXT, 'B1 text')
  assert.equal(b1.t, 1, 'B1 plain string type')
  assert.deepEqual(workbook.styles[b1.s], { tb: 3, tr: { a: 0, v: 1 } }, 'B1 wrap + vertical style')
  assert.deepEqual(sheet.rowData['0'], { ah: 85.50320434570312 }, 'row 1 auto height only')
  assert.equal(c1src.v, C1_TEXT, 'C1 text')
  assert.ok(c1src.s === undefined || c1src.s === null, 'C1 unstyled')
  assert.deepEqual(workbook.styles['7V5cf7'], { bl: 1, fs: 14 }, 'C7:C10 bold 14 style')
  for (const r of ['6', '7', '8', '9']) {
    assert.ok(sheet.cellData[r]['2'].f, `C${Number(r) + 1} keeps its live formula`)
  }
  assert.equal(sheet.cellData['7']['4'].v, 12, 'E8 = 12')
  console.log('✓ actual source recorded (B1/C1/row1/styles/formulas/E8)')

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

  // 2. Snapshot survives the app data path with rich structures intact.
  const data = api.buildItemSheetRenderData(project, makeItem(workbook))
  const usheet = data.univer.sheets[data.univer.sheetOrder[0]]
  assert.deepEqual(usheet.rowData['0'], { ah: 85.50320434570312 }, 'row-1 auto height preserved')
  assert.equal(usheet.defaultRowHeight, 24, 'default row height preserved')
  assert.equal(usheet.cellData['0']['1'].v, B1_TEXT, 'B1 value preserved')
  const snap = JSON.stringify(data.univer)
  assert.ok(snap.includes(B1_TEXT) && snap.includes(C1_TEXT), 'B1 + C1 preserved')
  assert.ok(snap.includes('ITEMCELL'), 'live formulas preserved')
  console.log('✓ app snapshot preserves actual data + formulas + row geometry')

  // 3. Source built by the current renderer (rev marker proves which one).
  const source = api.resolvedItemSheetTypstSource(project, makeItem(workbook))
  for (const token of ['ee-sheet-rev: 15', 'render-univer-sheet', 'compose-style', 'row-resolved', 'rotation-angle', 'natural(', 'natural-at', 'context']) {
    assert.ok(source.includes(token), `source contains ${token}`)
  }
  console.log('✓ source from ee-sheet-rev 15 renderer')

  // 4. Compile (needs the Typst compiler package).
  let NodeCompiler
  try {
    NodeCompiler = require('@myriaddreamin/typst-ts-node-compiler').NodeCompiler
  } catch {
    console.log('SKIP: typst compiler package not installed — render geometry toolchain-blocked')
    console.log('  snapshot + source + fixture checks verified; rerun with the compiler installed')
    return
  }

  const compileSvg = (item) => {
    const inputs = api.itemSheetCompileInputs(project, item)
    const compiler = NodeCompiler.create({ workspace: root })
    try {
      return compiler.svg({ mainFileContent: api.resolvedItemSheetTypstSource(project, item), inputs })
    } finally {
      compiler.resetShadow()
    }
  }

  const svgVert = compileSvg(makeItem(workbook))
  const svgFlat = compileSvg(makeItem(workbook, true))

  // 5. Artifacts saved BEFORE assertions so failures stay inspectable.
  fs.mkdirSync(artifactDir, { recursive: true })
  const pdfCompiler = NodeCompiler.create({ workspace: root })
  let pdf
  try {
    const item = makeItem(workbook)
    pdf = pdfCompiler.pdf({
      mainFileContent: api.resolvedItemSheetTypstSource(project, item),
      inputs: api.itemSheetCompileInputs(project, item)
    })
    assert.ok(pdf.length > 4000, 'PDF rendered')
  } finally {
    pdfCompiler.resetShadow()
  }
  fs.writeFileSync(path.join(artifactDir, 'actual-b1.pdf'), Buffer.from(pdf))
  fs.writeFileSync(path.join(artifactDir, 'actual-b1-vert.svg'), svgVert)
  fs.writeFileSync(path.join(artifactDir, 'actual-b1-flat.svg'), svgFlat)
  console.log(`✓ artifacts saved to ${artifactDir}`)

  // 6. Wrap-then-rotate: B1's tb:3 wraps its 13-char token (the same
  // long-token break parity as horizontal wrap) into lines, then the whole
  // laid-out block rotates — Univer shows two vertical runs, not one
  // horizontal row. Collect every ~90-degree run whose text belongs to B1
  // (robust to one-FO-per-block vs one-FO-per-line emission); together the
  // runs must spell the exact 13-char string, so a wrapping regression fails
  // here with the wrong runs visible, not on a missing marker.
  const scene = parseSvgScene(svgVert)
  console.log(`  scene: ${scene.segs.length} table-stroke segments kept, ${scene.skippedDefs} in-defs skipped, ${scene.skippedUnstroked} unstroked skipped`)
  const bare = (s) => s.replace(/[\s\u200b]+/g, '')
  const isVert = (t) => t.rots.some((a) => Math.abs(Math.abs(a) - 90) < 3)
  const b1runs = scene.texts.filter((t) => isVert(t) && bare(t.text).length > 0 && B1_TEXT.includes(bare(t.text)))
  assert.ok(b1runs.length >= 1, 'B1 rotated runs present')
  assert.equal(b1runs.map((t) => bare(t.text)).join(''), B1_TEXT, `B1 runs spell the exact string (saw ${b1runs.length} runs)`)
  // Each run's LOCAL (unrotated) rect is a horizontal line rect — wider
  // than tall — proving the layout wrapped before rotating.
  for (const t of b1runs) {
    assert.ok(t.lw > t.lh, `B1 run laid out as a horizontal line (w ${t.lw} vs h ${t.lh})`)
  }
  // Group composed rect over all B1 runs: rotation turns the wide block
  // into a TALL painted rect (the vertical runs), not a wide smear.
  const b1g = {
    x0: Math.min(...b1runs.map((t) => t.x0)),
    x1: Math.max(...b1runs.map((t) => t.x1)),
    y0: Math.min(...b1runs.map((t) => t.y0)),
    y1: Math.max(...b1runs.map((t) => t.y1))
  }
  b1g.cx = (b1g.x0 + b1g.x1) / 2
  b1g.cy = (b1g.y0 + b1g.y1) / 2
  assert.ok(b1g.y1 - b1g.y0 > b1g.x1 - b1g.x0, `B1 painted group is vertical runs (w ${b1g.x1 - b1g.x0} vs h ${b1g.y1 - b1g.y0})`)
  // Per-run diagnostic: local (pre-transform) rect, recorded rotations and
  // composed corners. If a width/containment assert below fails, these lines
  // distinguish bad layout (wrong local rects) from bad coordinates (right
  // local rects, wrong composed corners — a parser/backend transform issue).
  for (const t of b1runs) {
    console.log(`  B1 run: local ${t.lw.toFixed(1)}x${t.lh.toFixed(1)} rots=[${t.rots}] x=[${t.x0.toFixed(1)},${t.x1.toFixed(1)}] y=[${t.y0.toFixed(1)},${t.y1.toFixed(1)}] text=${JSON.stringify(bare(t.text))}`)
  }
  console.log(`✓ B1 wrap-then-rotate: ${b1runs.length} vertical run(s) spell the exact string`)

  // 7. Geometry against gridline bands (SVG user units are points). Bands
  // come from rendered table strokes only: <defs> glyph outlines are
  // excluded, unstroked fills are ignored, and element-level transforms are
  // composed with ancestor transforms.
  const b = boundaries(scene.segs)
  assert.ok(b.rows.length >= 3, `row bands found (${b.rows.length}; ${b.segCount} segments)`)
  assert.ok(b.cols.length >= 3, `column bands found (${b.cols.length})`)
  const c1 = findText(scene.texts, C1_TEXT, 'vertical')
  const e12 = findText(scene.texts, '12', 'vertical')
  const n600 = findText(scene.texts, '600', 'vertical')
  // B1 group (all vertical runs) inside column B and row 1 — no spread
  // into neighbours. Rotation membership was already asserted in section 6.
  const r1 = bandContaining(b.rows, c1.cy)
  assert.ok(r1 >= 0 && r1 + 1 < b.rows.length, 'C1 inside a row band')
  const rowTop = b.rows[r1]
  const rowBottom = b.rows[r1 + 1]
  console.log(`  bands: cols=[${b.cols.map((v) => v.toFixed(1)).join(', ')}] row1=[${rowTop.toFixed(1)}, ${rowBottom.toFixed(1)}]`)
  assert.ok(b1g.cx > b.cols[0] && b1g.cx < b.cols[b.cols.length - 1], `B1 inside table width (cx ${b1g.cx.toFixed(1)}, table [${b.cols[0].toFixed(1)}, ${b.cols[b.cols.length - 1].toFixed(1)}])`)
  const cb = bandContaining(b.cols, b1g.cx)
  const cc = bandContaining(b.cols, c1.cx)
  assert.ok(cb === 1 && cc === 2, `B1 in column B, C1 in column C (saw ${cb}, ${cc})`)
  assert.ok(b1g.x0 >= b.cols[cb] - 2 && b1g.x1 <= b.cols[cb + 1] + 2, 'B1 painted x-range stays in column B')
  assert.ok(b1g.y0 >= rowTop - 2 && b1g.y1 <= rowBottom + 2, 'B1 painted y-range stays in row 1')
  // Row 1 exact resolved height.
  const tall = rowBottom - rowTop
  assert.ok(Math.abs(tall - ROW1_PT) < 3, `row 1 = ${tall.toFixed(1)}pt, expected ${ROW1_PT.toFixed(1)}pt`)
  // C1 bottom-left: lower half of row 1, left part of column C.
  assert.ok(rowBottom - c1.cy < c1.cy - rowTop, 'C1 in lower half of row 1')
  assert.ok(c1.cx - b.cols[cc] < b.cols[cc + 1] - c1.cx, 'C1 in left part of column C')
  // C1 unmoved by the rotation (flat variant comparison).
  const flatScene = parseSvgScene(svgFlat)
  const c1f = findText(flatScene.texts, C1_TEXT, 'flat')
  assert.ok(Math.abs(c1.cx - c1f.cx) < 0.5 && Math.abs(c1.cy - c1f.cy) < 0.5, 'C1 unmoved by B1 rotation')
  // Numerics right-aligned: 600 and E8's 12 sit in their columns' right half.
  const ce = bandContaining(b.cols, e12.cx)
  assert.ok(n600.cx - b.cols[2] > b.cols[3] - n600.cx, '600 right-aligned in column C')
  assert.ok(ce === 4 && e12.cx - b.cols[4] > b.cols[5] - e12.cx, 'E8 12 right-aligned in column E')
  // Right edge against the cell boundary: right-aligned ink ends at the
  // content-box right edge (column gridline minus the 4pt default inset).
  // A center-in-right-half position passes the asserts above but still
  // looks left; this pins the edge the renderer must justify to.
  const INSET_R = 4
  assert.ok(Math.abs(b.cols[3] - INSET_R - n600.x1) < 3, `600 right edge at cell boundary (x1 ${n600.x1.toFixed(1)} vs ${(b.cols[3] - INSET_R).toFixed(1)})`)
  assert.ok(Math.abs(b.cols[ce + 1] - INSET_R - e12.x1) < 3, `E8 12 right edge at cell boundary (x1 ${e12.x1.toFixed(1)} vs ${(b.cols[ce + 1] - INSET_R).toFixed(1)})`)
  console.log(`✓ geometry: B1 in-cell rotated, row 1 = ${tall.toFixed(1)}pt, C1 bottom-left unmoved, numerics right, right edges pinned`)

  // 8. Font: SVG carries no font-family metadata in this pipeline, so runtime
  // font is not asserted here — recorded as notes, not proof. Effective
  // resolution (unstyled → Arial 11) is covered by mapping tests + source.
  const fonts = [...new Set(scene.texts.map((t) => t.font).filter(Boolean))]
  console.log(`  note: SVG font metadata: ${fonts.length ? fonts.join(', ') : 'absent — font proven at source level only'}`)

  console.log('\nPASS: B1 proof on the actual Check 1 workbook')
}

main().catch((err) => { console.error(err); process.exit(1) })
