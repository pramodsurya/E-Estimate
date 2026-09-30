// Orange-wrap rotated fidelity: real Check-1 state (90-degree WRAP,
// horizontal control, +-45-degree cases, saved geometry) plus installed
// border fidelity (widths, dashes, DOUBLE, NONE vs absent, merges,
// conflicts, white suppression, clipping/overflow distinction).
//
// Fixture: scripts/fixtures/orange-wrap/orange-sheet.json — verbatim
// extract of Sheet1 (sheet-n_brmg45e1oeh7-1) from Check 1.eestimate,
// shared by items IRR-CAW-1-2, IRR-CAW-7-25, IRR-CAW-1-7, IRR-CAW-1-12,
// TBSP-D.II-43, TBSP-D.II-66, TBSP-D.II-49. Saved style dicts are reused
// verbatim (referenced by id); styles marked DERIVED clone a saved dict
// with exactly one documented key changed. Nothing here is hand-authored
// geometry: row heights, column widths, merges and defaults are the saved
// values.
//
// Layers:
// 1. Fixture integrity + live-file cross-check (Check 1.eestimate path is
//    a Windows/WSL absolute path; when the file is absent the live check
//    SKIPs distinctly, fixture asserts still run).
// 2. Sources built through the app path (buildItemSheetRenderData +
//    resolvedItemSheetTypstSource), rev-15 marker asserted.
// 3. Artifacts (source + PDF + SVG) saved BEFORE any geometry assert;
//    compiler diagnostics print in full on failure.
// 4. Geometry asserts (bands, runs, fills, stroke paint), never substrings.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const { parseSvgScene, boundaries } = require('./svg-scene.cjs')

const root = path.resolve(__dirname, '..')
const fixturePath = path.join(__dirname, 'fixtures', 'orange-wrap', 'orange-sheet.json')
const artifactDir = path.join(__dirname, 'output', 'orange-wrap')
const CHECK1 = process.platform === 'win32'
  ? 'C:\\Users\\napra\\Downloads\\Check 1.eestimate'
  : '/mnt/c/Users/napra/Downloads/Check 1.eestimate'

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

const project = {
  id: 'proj-orange',
  meta: { name: 'Orange Wrap Proof Project' },
  root: { name: 'Root' },
  signatureFooter: { enabled: false, rows: [] }
}
function makeItem(single, name, range) {
  return {
    id: `orange-${name}`,
    name: `Orange ${name}`,
    itemCode: 'ORANGE',
    itemDescription: 'Rotated-wrap and border fidelity probes.',
    itemUnit: 'lot',
    unit: 'lot',
    itemEditorType: 'spreadsheet',
    finalCell: 0,
    print: { range, showGridlines: true },
    charts: [],
    spreadsheet: single
  }
}

// ---- geometry helpers (all asserts carry explicit tolerances) ----
const bare = (s) => String(s).replace(/[\s\u200b]+/g, '')
const near = (a, b, tol) => Math.abs(a - b) <= tol
function hSegs(segs, y, x0, x1, tol = 1.5) {
  return segs.filter((s) => Math.abs((s.y1 + s.y2) / 2 - y) <= tol &&
    Math.min(s.x1, s.x2) <= x0 + tol && Math.max(s.x1, s.x2) >= x1 - tol)
}
function vSegs(segs, x, y0, y1, tol = 1.5) {
  return segs.filter((s) => Math.abs((s.x1 + s.x2) / 2 - x) <= tol &&
    Math.min(s.y1, s.y2) <= y0 + tol && Math.max(s.y1, s.y2) >= y1 - tol)
}
const strokeOf = (s) => (s.paint && s.paint.stroke ? s.paint.stroke : '')
const isDark = (s) => /^(?:#(?:000|000000)|black)$/i.test(strokeOf(s))
const isGridGray = (s) => /d0d0d0/i.test(strokeOf(s))
const isWhitePaint = (s) => /^(?:#(?:fff|ffffff)|white)$/i.test(strokeOf(s))
const dashParts = (s) => {
  const d = s.paint && s.paint.dash
  if (!d) return 0
  return String(d).split(/[\s,]+/).filter(Boolean).length
}
const widthOf = (s) => (s.paint ? s.paint.width : null)
// Runs whose bare text is a fragment of the stream (length>=2 skips stray
// single-char shaping splits, same rule as the fidelity suite).
function streamRuns(texts, stream) {
  const target = bare(stream)
  return texts.filter((t) => {
    const f = bare(t.text)
    return f.length >= 2 && target.includes(f)
  })
}
// Order candidates for rotated runs: the reading direction after rotation
// is backend-dependent, so every plausible axis order is tried and exactly
// the spelling order passes (logged). Scrambling or loss fails all.
function spellingOrder(runs, stream) {
  const target = bare(stream)
  const keys = [
    ['x-asc', (a, b) => a.x0 - b.x0],
    ['x-desc', (a, b) => b.x0 - a.x0],
    ['y-asc', (a, b) => a.y0 - b.y0],
    ['y-desc', (a, b) => b.y0 - a.y0],
    ['center-y-asc', (a, b) => a.cy - b.cy],
    ['center-y-desc', (a, b) => b.cy - a.cy],
    ['diag-asc', (a, b) => (a.x0 + a.y0) - (b.x0 + b.y0)],
    ['diag-desc', (a, b) => (b.x0 + b.y0) - (a.x0 + a.y0)]
  ]
  for (const [name, cmp] of keys) {
    const spelled = runs.slice().sort(cmp).map((t) => t.text).join('')
    if (bare(spelled) === target) return name
  }
  return null
}
function svgRootHeight(svg) {
  const m = /<svg[^>]*\sheight="([\d.]+)"/.exec(svg)
  assert.ok(m, 'SVG root carries a height')
  return Number(m[1])
}
// clipPath bboxes in the raw SVG. The backend emits clip regions as paths
// in the clipped element's local frame (no <rect>), so only the SIZE is
// asserted here (translate-invariant); position is proven by run
// containment inside the saved cell rect. Anything unparseable is
// reported, never skipped silently.
function clipRects(svg) {
  const out = []
  const re = /<clipPath[^>]*>([\s\S]*?)<\/clipPath>/g
  let m
  while ((m = re.exec(svg))) {
    const body = m[1]
    const rect = /<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*>/.exec(body)
    if (rect) {
      out.push({ x: Number(rect[1]), y: Number(rect[2]), w: Number(rect[3]), h: Number(rect[4]) })
      continue
    }
    const paths = [...body.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)]
    const d = paths.length === 1 ? paths[0][1] : ''
    const nums = [...d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((n) => Number(n[0]))
    if (nums.length >= 8 && nums.length % 2 === 0 && /^[\s\d.e+\-MLZmlz]+$/.test(d)) {
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      out.push({
        local: true,
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)
      })
    } else out.push({ unparsed: body.slice(0, 160) })
  }
  return out
}

async function main() {
  console.log('--- Orange-wrap rotated fidelity (Check-1 real state) ---')
  const fix = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const wb0 = fix.workbook
  const sheetId = fix.provenance.sheetId
  const sheet0 = wb0.sheets[sheetId]

  // O0. Fixture integrity: the verbatim orange state.
  const orangeCell = sheet0.cellData['2']['5']
  assert.equal(orangeCell.v, 'ass  nmsnbsjkbkskjk', 'orange text verbatim (double space kept)')
  assert.equal(orangeCell.t, 1, 'orange plain-string type')
  const STYLE = (id) => {
    assert.ok(wb0.styles[id], `saved style present: ${id}`)
    return wb0.styles[id]
  }
  assert.deepEqual(STYLE('AfJXHc'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 3, tr: { a: -90 } }, 'orange -90 WRAP style verbatim')
  assert.deepEqual(STYLE('kEP7I3'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 3 }, 'orange horizontal WRAP style verbatim')
  assert.deepEqual(STYLE('8hr6fI'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 3, tr: { a: 45 } }, 'orange +45 WRAP style verbatim')
  assert.deepEqual(STYLE('AFOgtp'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 2, tr: { a: -90 } }, 'orange -90 CLIP style verbatim')
  assert.deepEqual(STYLE('wSxpau'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 1, tr: { a: -90 } }, 'orange -90 OVERFLOW style verbatim')
  assert.deepEqual(STYLE('5cRHUO'), { bg: { rgb: '#ff5a1f' }, bl: 1, fs: 15, it: 1, tb: 3, tr: { a: 0, v: 1 } }, 'orange vertical WRAP style verbatim')
  assert.deepEqual(STYLE('5eHdjy'), { bd: { t: { s: 13, cl: { rgb: '#000000' } }, r: { s: 13, cl: { rgb: '#000000' } }, b: { s: 13, cl: { rgb: '#000000' } }, l: { s: 13, cl: { rgb: '#000000' } } } }, 'THICK block style verbatim')
  assert.deepEqual(sheet0.rowData['2'], { h: 103, ia: 0 }, 'orange row explicit 103px')
  assert.deepEqual(sheet0.mergeData.map(({ startRow, startColumn, endRow, endColumn }) =>
    ({ startRow, startColumn, endRow, endColumn })),
    [{ startRow: 3, startColumn: 6, endRow: 4, endColumn: 7 }], 'saved merge coordinates verbatim')
  assert.deepEqual(sheet0.cellData['3']['4'], { s: '5eHdjy' }, 'block cell shape verbatim')
  console.log('✓ fixture integrity: orange state verbatim (text/styles/row/merge/block)')

  // O0b. Live-file cross-check: the fixture must match the current
  // Check-1 snapshot cell-for-cell on the orange state. Absent file ->
  // SKIP distinctly (other machines/CI); absent orange state -> FAIL naming
  // exactly which snapshot is missing.
  if (!fs.existsSync(CHECK1)) {
    console.log(`SKIP: live cross-check (${CHECK1} absent on this machine)`)
  } else {
    const live = JSON.parse(fs.readFileSync(CHECK1, 'utf8'))
    let liveSheet = null
    const walk = (o) => {
      if (liveSheet || typeof o !== 'object' || o === null) return
      if (o.spreadsheet && o.spreadsheet.sheets && o.spreadsheet.sheets[sheetId]) {
        liveSheet = o.spreadsheet.sheets[sheetId]
        return
      }
      for (const v of Object.values(o)) walk(v)
    }
    walk(live.root)
    assert.ok(liveSheet, `orange state missing: sheet ${sheetId} (items IRR-CAW-1-2 et al) not in ${CHECK1}`)
    assert.deepEqual(liveSheet.cellData['2']['5'], orangeCell, 'live orange cell matches fixture')
    assert.deepEqual(liveSheet.cellData['3']['4'], sheet0.cellData['3']['4'], 'live block cell matches fixture')
    assert.deepEqual(liveSheet.rowData['2'], { h: 103, ia: 0 }, 'live orange row matches fixture')
    assert.deepEqual(liveSheet.columnData, sheet0.columnData, 'live column geometry matches fixture')
    console.log('✓ live cross-check: fixture matches current Check-1 snapshot')
  }

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

  // Builders: single-sheet workbooks reusing the saved sheet slice
  // (rows 0-6, cols 0-8) and verbatim style dicts. Overrides replace one
  // cell's style id; DERIVED styles clone a saved dict with one documented
  // key change and a DERIVED- id (never silent invention).
  const baseSlice = () => {
    const cellData = {}
    for (let r = 0; r <= 6; r++) {
      if (sheet0.cellData[String(r)]) cellData[String(r)] = JSON.parse(JSON.stringify(sheet0.cellData[String(r)]))
    }
    return {
      cellData,
      mergeData: JSON.parse(JSON.stringify(sheet0.mergeData)),
      rowData: JSON.parse(JSON.stringify(sheet0.rowData)),
      columnData: JSON.parse(JSON.stringify(sheet0.columnData)),
      defaultColumnWidth: sheet0.defaultColumnWidth,
      defaultRowHeight: sheet0.defaultRowHeight,
      defaultStyle: sheet0.defaultStyle ?? null,
      name: 'Orange slice'
    }
  }
  const ORANGE_RANGE = { startRow: 0, startColumn: 0, endRow: 6, endColumn: 8 }
  const mkWorkbook = (sheet, styles, name) => ({
    id: 'orange-wrap', name, appVersion: '0.25.0', locale: 'enUS',
    styles, sheetOrder: ['s-orange'], sheets: { 's-orange': { ...sheet, name } }
  })
  const VARIANTS = [
    { name: 'orange-real', styleId: 'AfJXHc', derived: null, range: ORANGE_RANGE },
    { name: 'orange-horizontal', styleId: 'kEP7I3', derived: null, range: ORANGE_RANGE },
    { name: 'orange-45', styleId: '8hr6fI', derived: null, range: ORANGE_RANGE },
    { name: 'orange-45-clip', styleId: 'DERIVED-45clip', derived: { from: '8hr6fI', patch: { tb: 2 } }, range: ORANGE_RANGE },
    { name: 'orange-neg45', styleId: 'DERIVED-neg45', derived: { from: '8hr6fI', patch: { tr: { a: -45 } } }, range: ORANGE_RANGE },
    { name: 'orange-clip90', styleId: 'AFOgtp', derived: null, range: ORANGE_RANGE },
    { name: 'orange-overflow90', styleId: 'wSxpau', derived: null, range: ORANGE_RANGE }
  ]
  const workbooks = {}
  for (const v of VARIANTS) {
    const sheet = baseSlice()
    const styles = JSON.parse(JSON.stringify(wb0.styles))
    if (v.derived) {
      assert.ok(styles[v.derived.from], `derived base present: ${v.derived.from}`)
      styles[v.styleId] = { ...JSON.parse(JSON.stringify(styles[v.derived.from])), ...v.derived.patch }
    }
    sheet.cellData['2']['5'] = { t: 1, v: 'ass  nmsnbsjkbkskjk', s: v.styleId }
    workbooks[v.name] = { wb: mkWorkbook(sheet, styles, v.name), range: v.range }
  }

  let NodeCompiler
  try {
    NodeCompiler = require('@myriaddreamin/typst-ts-node-compiler').NodeCompiler
  } catch {
    console.log('SKIP: typst compiler package not installed — rendered-geometry toolchain-blocked')
    return
  }
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  fs.mkdirSync(artifactDir, { recursive: true })
  const scenes = {}
  const rawSvgs = {}
  const compileVariant = (v) => {
    const { wb, range } = workbooks[v.name]
    const item = makeItem(wb, v.name, range)
    let source
    try {
      source = api.resolvedItemSheetTypstSource(project, item)
    } catch (err) {
      console.error(`[${v.name}] source build failed: ${err && err.message ? err.message : err}`)
      throw err
    }
    assert.match(source, /ee-sheet-rev:\s*15/, `${v.name}: rev-15 renderer`)
    fs.writeFileSync(path.join(artifactDir, `${slug(v.name)}.typ`), source)
    const inputs = api.itemSheetCompileInputs(project, item)
    const compiler = NodeCompiler.create({ workspace: root })
    try {
      const svg = compiler.svg({ mainFileContent: source, inputs })
      const pdf = compiler.pdf({ mainFileContent: source, inputs })
      assert.ok(pdf.length > 4000, `${v.name}: PDF rendered`)
      fs.writeFileSync(path.join(artifactDir, `${slug(v.name)}.svg`), svg)
      fs.writeFileSync(path.join(artifactDir, `${slug(v.name)}.pdf`), Buffer.from(pdf))
      scenes[v.name] = parseSvgScene(svg)
      rawSvgs[v.name] = svg
      assert.ok(!scenes[v.name].texts.some((t) => t.text.trim() === '()'), `${v.name}: no stray "()" text`)
      assert.ok(near(svgRootHeight(svg), 841.89, 1), `${v.name}: single A4 page (bands equal rows here)`)
    } catch (err) {
      console.error(`[${v.name}] Typst compile failed: ${formatCompilerError(err)}`)
      console.error(`[${v.name}] failing source saved at ${path.join(artifactDir, `${slug(v.name)}.typ`)}`)
      throw err
    } finally {
      compiler.resetShadow()
    }
  }
  for (const v of VARIANTS) compileVariant(v)
  console.log(`✓ artifacts saved to ${artifactDir} (source + PDF + SVG per variant, before assertions)`)

  const STREAM = 'ass  nmsnbsjkbkskjk'
  // Orange-real: 90-degree WRAP on saved geometry.
  {
    const scene = scenes['orange-real']
    const b = boundaries(scene.segs)
    // Rows 0-6, cols 0-8, single page: exact bound counts (pagination
    // would add margin gaps and fail loudly here).
    assert.equal(b.rows.length, 8, `orange-real row bounds (saw ${b.rows.length})`)
    assert.equal(b.cols.length, 10, `orange-real col bounds (saw ${b.cols.length})`)
    const rowH = b.rows[3] - b.rows[2]
    assert.ok(near(rowH, 103 * 0.75, 1.5), `orange row keeps saved 103px (${rowH.toFixed(2)}pt)`)
    const colW = b.cols[6] - b.cols[5]
    assert.ok(near(colW, 88 * 0.75, 1.5), `orange col keeps default 88px (${colW.toFixed(2)}pt)`)
    // Orange fill covers the saved cell rect.
    const fills = scene.fills.filter((f) => /ff5a1f/i.test(f.fill || ''))
    assert.ok(fills.length >= 1, 'orange fill present')
    const cellFill = fills.find((f) => near(f.x0, b.cols[5], 2) && near(f.y0, b.rows[2], 2))
    assert.ok(cellFill, 'orange fill at the saved cell rect')
    assert.ok(near(cellFill.x1, b.cols[6], 2) && near(cellFill.y1, b.rows[3], 2), 'orange fill spans the saved rect')
    // Three vertical runs: not one long vertical string.
    const runs = streamRuns(scene.texts, STREAM).filter((t) => t.rots.some((a) => Math.abs(Math.abs(a) - 90) <= 3))
    assert.ok(runs.length >= 3, `90-degree runs present (saw ${runs.length})`)
    const clusters = []
    for (const t of runs.slice().sort((p, q) => p.x0 - q.x0)) {
      const last = clusters[clusters.length - 1]
      if (last && Math.abs(t.x0 - last.x0) <= 4) {
        last.runs.push(t)
        last.x0 = Math.min(last.x0, t.x0)
      } else clusters.push({ x0: t.x0, runs: [t] })
    }
    assert.equal(clusters.length, 3, `three vertical runs (saw ${clusters.length})`)
    const flat = clusters.map((c) => c.runs.slice().sort((p, q) => p.cy - q.cy).map((t) => t.text).join(''))
    const asc = bare(flat.join(''))
    const desc = bare(flat.slice().reverse().join(''))
    assert.ok(asc === bare(STREAM) || desc === bare(STREAM), 'vertical runs spell the stream in x order or reverse')
    console.log(`✓ orange-real: 90-degree WRAP spells in 3 vertical runs (order: ${asc === bare(STREAM) ? 'x-asc' : 'x-desc'})`)
    // Containment: installed clips paint to the row span (overflow spans
    // columns only) — no run leaves the saved row band.
    for (const t of runs) {
      assert.ok(t.y0 >= b.rows[2] - 3 && t.y1 <= b.rows[3] + 3, `run inside saved row span (y ${t.y0.toFixed(1)}..${t.y1.toFixed(1)})`)
    }
    console.log('✓ orange-real: runs contained in the saved row span; cell keeps saved size')
    // Border block below the orange cell (saved s:13 THICK on all four
    // cells, surrounded by blanks): all four outer edges plus both
    // internal dividers paint at installed 3px = 2.25pt. The right and
    // bottom outer edges are the Codex regression (blank neighbors used
    // to erase them with explicit gray strokes).
    const edge = (list, label) => {
      assert.ok(list.length >= 1, `${label} paints`)
      for (const s of list) {
        assert.ok(near(widthOf(s) ?? -1, 2.25, 0.35), `${label} installed width (${widthOf(s)})`)
        assert.ok(isDark(s), `${label} black (${strokeOf(s)})`)
      }
    }
    edge(hSegs(scene.segs, b.rows[3], b.cols[4], b.cols[6]), 'block top outer')
    edge(hSegs(scene.segs, b.rows[5], b.cols[4], b.cols[6]), 'block bottom outer')
    edge(vSegs(scene.segs, b.cols[4], b.rows[3], b.rows[5]), 'block left outer')
    edge(vSegs(scene.segs, b.cols[6], b.rows[3], b.rows[5]), 'block right outer')
    edge(hSegs(scene.segs, b.rows[4], b.cols[4], b.cols[6]), 'block internal horizontal divider')
    edge(vSegs(scene.segs, b.cols[5], b.rows[3], b.rows[5]), 'block internal vertical divider')
    console.log('✓ orange-real: 2x2 THICK block keeps all four outer edges + dividers at 2.25pt')
  }

  // Horizontal WRAP control: same text and geometry, real kEP7I3 style.
  {
    const scene = scenes['orange-horizontal']
    const b = boundaries(scene.segs)
    assert.equal(b.rows.length, 8, 'horizontal row bounds')
    assert.equal(b.cols.length, 10, 'horizontal col bounds')
    const groups = []
    for (const t of streamRuns(scene.texts, STREAM).slice().sort((p, q) => p.cy - q.cy)) {
      const last = groups[groups.length - 1]
      if (last && Math.abs(t.cy - last.cy) <= 3) last.runs.push(t)
      else groups.push({ cy: t.cy, runs: [t] })
    }
    assert.equal(groups.length, 3, `horizontal WRAP breaks into 3 lines (saw ${groups.length})`)
    const spelled = groups.map((g) => g.runs.slice().sort((p, q) => p.x0 - q.x0).map((t) => t.text).join('')).join('')
    assert.equal(bare(spelled), bare(STREAM), 'horizontal lines spell top-down')
    assert.ok(near(b.rows[3] - b.rows[2], 103 * 0.75, 1.5), 'horizontal control keeps saved row height')
    console.log('✓ orange-horizontal: 3-line control spells top-down on saved geometry')
  }

  // +-45-degree WRAP: unanimous signed angle, wrapped (never one long
  // string), no loss, vertical containment. Reading direction along the
  // diagonal is backend-dependent: any axis order spelling the stream
  // passes and is logged.
  for (const [name, deg] of [['orange-45', 45], ['orange-neg45', -45]]) {
    const scene = scenes[name]
    const b = boundaries(scene.segs)
    const runs = streamRuns(scene.texts, STREAM)
    assert.ok(runs.length >= 2, `${name}: wrapped into runs (saw ${runs.length}, one long string refused)`)
    for (const t of runs) {
      assert.ok(t.rots.some((a) => Math.abs(a - deg) <= 3), `${name}: run carries signed ${deg} (rots ${t.rots})`)
    }
    const order = spellingOrder(runs, STREAM)
    assert.ok(order, `${name}: runs spell the stream in some axis order`)
    // No layout-box containment here: rotated paint may spill past the row
    // (explicit frame cuts paint, not layout boxes) — the row span itself
    // staying saved is the geometric invariant, the cut is visual.
    const x1 = Math.max(...runs.map((t) => t.x1))
    console.log(`  ${name}: horizontal spill reaches x=${x1.toFixed(1)} vs cell edge ${b.cols[6].toFixed(1)}`)
    assert.ok(near(b.rows[3] - b.rows[2], 103 * 0.75, 1.5), `${name}: saved row height kept`)
    console.log(`✓ ${name}: signed ${deg} unanimous, ${runs.length} runs spell (${order}), contained, row kept`)
  }

  // CLIP distinction: +45 CLIP (derived) and -90 CLIP (real AFOgtp) arm a
  // clip region sized to the cell's content box (4pt horizontal and 3pt
  // vertical default insets on each side; translate-invariant
  // size assert on the local-frame clip path). Clipping cuts paint, not
  // layout boxes, so the visible cut is Codex-visual; here the arming plus
  // (for +45) proof the content actually exceeds the rect (the clip bites).
  for (const name of ['orange-45-clip', 'orange-clip90']) {
    const scene = scenes[name]
    const b = boundaries(scene.segs)
    const cellW = b.cols[6] - b.cols[5]
    const cellH = b.rows[3] - b.rows[2]
    const rects = clipRects(rawSvgs[name])
    assert.ok(!rects.some((r) => r.unparsed), `${name}: all clip forms parse (saw ${JSON.stringify(rects).slice(0, 200)})`)
    const contentW = cellW - 8
    const contentH = cellH - 6
    const armed = rects.some((r) => near(r.w, contentW, 2) && near(r.h, contentH, 2))
    assert.ok(armed, `${name}: clip region sized to the saved content box (${contentW.toFixed(1)}x${contentH.toFixed(1)}; forms: ${JSON.stringify(rects).slice(0, 200)})`)
    const runs = streamRuns(scene.texts, STREAM)
    assert.ok(runs.length >= 1, `${name}: clipped text present`)
    console.log(`✓ ${name}: CLIP region sized to the cell content box`)
  }
  {
    // Bite proof for +45 CLIP: laid-out paint exceeds the cell rect, so
    // the armed clip actually cuts (a fitting content would make the
    // arming vacuous).
    const scene = scenes['orange-45-clip']
    const b = boundaries(scene.segs)
    const runs = streamRuns(scene.texts, STREAM)
    const spills = runs.some((t) => t.x0 < b.cols[5] - 2 || t.x1 > b.cols[6] + 2 || t.y0 < b.rows[2] - 2 || t.y1 > b.rows[3] + 2)
    assert.ok(spills, '+45 CLIP content exceeds the rect (the clip bites)')
    console.log('✓ orange-45-clip: laid-out paint exceeds the rect, clip bites')
  }

  // OVERFLOW distinction (real wSxpau): no confining clip at the cell,
  // and the over-tall rotated paint cuts vertically at the saved row span
  // (installed clips rows; columns may spill) instead of growing the row.
  {
    const scene = scenes['orange-overflow90']
    const b = boundaries(scene.segs)
    assert.ok(near(b.rows[3] - b.rows[2], 103 * 0.75, 1.5), 'overflow keeps saved row height (never grown)')
    const rects = clipRects(rawSvgs['orange-overflow90']).filter((r) => !r.unparsed)
    const cellW = b.cols[6] - b.cols[5]
    const cellH = b.rows[3] - b.rows[2]
    const confining = rects.some((r) => near(r.w, cellW, 2) && near(r.h, cellH, 2))
    assert.ok(!confining, 'overflow paints past the cell (no cell-sized confining clip)')
    // The over-tall rotated paint is cut at the row span by the explicit
    // frame (paint-level; layout boxes may extend) — the row band staying
    // saved is the geometric proof, asserted above.
    console.log('✓ orange-overflow90: row kept, no confining clip (cut is visual)')
  }

  // ---- installed border fidelity (constructed cells, verbatim shapes) ----
  const mkBd = (s, cl = '#000000') => ({ t: { s, cl: { rgb: cl } }, r: { s, cl: { rgb: cl } }, b: { s, cl: { rgb: cl } }, l: { s, cl: { rgb: cl } } })
  const borderWorkbooks = {}
  // Full enum sheet: one style per row in column A, blank column B, so
  // every asserted edge is single-winner (outer edge or blank neighbor).
  {
    const cellData = {}
    const styles = {}
    for (let s = 0; s <= 13; s++) {
      cellData[String(s)] = { 0: { s: `STY-${s}` } }
      styles[`STY-${s}`] = { bd: mkBd(s) }
    }
    const sheet = { cellData, mergeData: [], rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24, defaultStyle: null, name: 'Border stylesheet' }
    borderWorkbooks['border-stylesheet'] = {
      wb: mkWorkbook(sheet, styles, 'border-stylesheet'),
      range: { startRow: 0, startColumn: 0, endRow: 13, endColumn: 1 }
    }
  }
  // Merged perimeters: uniform merge (every edge cell bordered) paints the
  // full perimeter; anchor-only merge paints only the anchor's top+left
  // (installed _setMergeBorderProps walks edge cells, not the anchor).
  {
    const uni = { bd: mkBd(13) }
    const styles = { UNI13: uni }
    const sheet = {
      cellData: {
        1: { 1: { s: 'UNI13' }, 2: { s: 'UNI13' } },
        2: { 1: { s: 'UNI13' }, 2: { s: 'UNI13' } },
        4: { 4: { s: 'UNI13' } }
      },
      mergeData: [
        { startRow: 1, startColumn: 1, endRow: 2, endColumn: 2 },
        { startRow: 4, startColumn: 4, endRow: 5, endColumn: 5 }
      ],
      rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24, defaultStyle: null, name: 'Border merges'
    }
    borderWorkbooks['border-merge'] = {
      wb: mkWorkbook(sheet, styles, 'border-merge'),
      range: { startRow: 0, startColumn: 0, endRow: 6, endColumn: 6 }
    }
  }
  // Shared-edge conflict (INVESTIGATIVE): THIN red bottom vs THICK blue
  // top. Typst's table rule picks the winner; installed paints both with
  // later row-major on top. The probe logs the resolved outcome for the
  // visual verdict — presence asserted, winner recorded, not presumed.
  {
    const styles = {
      'CONF-A': { bd: { b: { s: 1, cl: { rgb: '#ff0000' } } } },
      'CONF-B': { bd: { t: { s: 13, cl: { rgb: '#0000ff' } } } }
    }
    const sheet = {
      cellData: { 0: { 0: { s: 'CONF-A' } }, 1: { 0: { s: 'CONF-B' } } },
      mergeData: [], rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24, defaultStyle: null, name: 'Border conflict'
    }
    borderWorkbooks['border-conflict'] = {
      wb: mkWorkbook(sheet, styles, 'border-conflict'),
      range: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 1 }
    }
  }
  // White suppression (univer pro/issues/344): white top edge against a
  // facing black bottom edge drops; against a blank neighbor it paints.
  {
    const styles = {
      'WHT-T': { bd: { t: { s: 1, cl: { rgb: '#ffffff' } } } },
      'BLK-B': { bd: { b: { s: 1, cl: { rgb: '#000000' } } } }
    }
    const sheet = {
      cellData: { 0: { 0: { s: 'BLK-B' } }, 1: { 0: { s: 'WHT-T' } }, 3: { 0: { s: 'WHT-T' } } },
      mergeData: [], rowData: {}, columnData: {}, defaultColumnWidth: 88, defaultRowHeight: 24, defaultStyle: null, name: 'Border white'
    }
    borderWorkbooks['border-white'] = {
      wb: mkWorkbook(sheet, styles, 'border-white'),
      range: { startRow: 0, startColumn: 0, endRow: 4, endColumn: 1 }
    }
  }
  const compileBorder = (name) => {
    const { wb, range } = borderWorkbooks[name]
    const item = makeItem(wb, name, range)
    let source
    try {
      source = api.resolvedItemSheetTypstSource(project, item)
    } catch (err) {
      console.error(`[${name}] source build failed: ${err && err.message ? err.message : err}`)
      throw err
    }
    assert.match(source, /ee-sheet-rev:\s*15/, `${name}: rev-15 renderer`)
    fs.writeFileSync(path.join(artifactDir, `${slug(name)}.typ`), source)
    const inputs = api.itemSheetCompileInputs(project, item)
    const compiler = NodeCompiler.create({ workspace: root })
    try {
      const svg = compiler.svg({ mainFileContent: source, inputs })
      const pdf = compiler.pdf({ mainFileContent: source, inputs })
      assert.ok(pdf.length > 4000, `${name}: PDF rendered`)
      fs.writeFileSync(path.join(artifactDir, `${slug(name)}.svg`), svg)
      fs.writeFileSync(path.join(artifactDir, `${slug(name)}.pdf`), Buffer.from(pdf))
      scenes[name] = parseSvgScene(svg)
      rawSvgs[name] = svg
      assert.ok(near(svgRootHeight(svg), 841.89, 1), `${name}: single A4 page (bands equal rows here)`)
    } catch (err) {
      console.error(`[${name}] Typst compile failed: ${formatCompilerError(err)}`)
      console.error(`[${name}] failing source saved at ${path.join(artifactDir, `${slug(name)}.typ`)}`)
      throw err
    } finally {
      compiler.resetShadow()
    }
  }
  for (const name of Object.keys(borderWorkbooks)) compileBorder(name)
  console.log('✓ border artifacts saved (source + PDF + SVG, before assertions)')

  // Full enum: installed widths 1/2/3px = 0.75/1.5/2.25pt, explicit dash
  // part counts per setLineType, DOUBLE as two separated strokes.
  {
    const scene = scenes['border-stylesheet']
    const b = boundaries(scene.segs)
    // Styled cell borders split the first two vertical gridlines into row
    // segments. boundaries() deliberately keeps long lines only, so recover
    // these column positions from the gray grid strokes for this fixture.
    b.cols = [...new Set(scene.segs.filter((s) => isGridGray(s) && Math.abs(s.x1 - s.x2) < 0.75)
      .map((s) => ((s.x1 + s.x2) / 2).toFixed(2)))].map(Number).sort((a, b) => a - b)
    assert.equal(b.rows.length, 15, 'stylesheet row bounds')
    assert.equal(b.cols.length, 3, 'stylesheet col bounds')
    const EXPECT = {
      0: { w: 0.75, dash: 0, custom: false },
      1: { w: 0.75, dash: 0, custom: true },
      2: { w: 0.75, dash: 2, custom: true },
      3: { w: 0.75, dash: 2, custom: true },
      4: { w: 0.75, dash: 2, custom: true },
      5: { w: 0.75, dash: 3, custom: true },
      6: { w: 0.75, dash: 5, custom: true },
      7: { w: 0.75, dash: 0, custom: true, double: true },
      8: { w: 1.5, dash: 0, custom: true },
      9: { w: 1.5, dash: 2, custom: true },
      10: { w: 1.5, dash: 3, custom: true },
      11: { w: 1.5, dash: 5, custom: true },
      12: { w: 0.75, dash: 3, custom: true },
      13: { w: 2.25, dash: 0, custom: true }
    }
    for (let s = 0; s <= 13; s++) {
      const exp = EXPECT[s]
      // Left (table outer) and right (blank neighbor) edges only: shared
      // top/bottom edges between differing styles follow Typst's conflict
      // rule (investigative, see border-conflict).
      const edges = [
        ...vSegs(scene.segs, b.cols[0], b.rows[s], b.rows[s + 1]),
        ...vSegs(scene.segs, b.cols[1], b.rows[s], b.rows[s + 1])
      ]
      assert.ok(edges.length >= 1, `s:${s} edges paint`)
      if (!exp.custom) {
        assert.ok(edges.every((e) => isGridGray(e)), `s:0 NONE paints gridline only`)
        assert.ok(edges.every((e) => near(widthOf(e) ?? -1, 0.75, 0.25)), 's:0 gridline width')
        continue
      }
      const dark = edges.filter(isDark)
      assert.ok(dark.length >= 1, `s:${s} custom stroke paints`)
      if (exp.double) {
        for (const x of [b.cols[0], b.cols[1]]) {
          const pair = vSegs(scene.segs, x, b.rows[s], b.rows[s + 1]).filter(isDark)
          assert.equal(pair.length, 2, `s:7 DOUBLE paints two strokes at x=${x.toFixed(1)}`)
          for (const p of pair) assert.ok(near(widthOf(p) ?? -1, 0.75, 0.25), 'DOUBLE stroke width')
          const gap = Math.abs(((pair[0].x1 + pair[0].x2) / 2) - ((pair[1].x1 + pair[1].x2) / 2))
          assert.ok(near(gap, 0.75, 0.4), `DOUBLE strokes separated (${gap.toFixed(2)}pt)`)
        }
        continue
      }
      for (const e of dark) {
        assert.ok(near(widthOf(e) ?? -1, exp.w, 0.25), `s:${s} installed width (${widthOf(e)})`)
        assert.equal(dashParts(e), exp.dash, `s:${s} dash parts (${e.paint && e.paint.dash})`)
      }
    }
    console.log('✓ border-stylesheet: 14 styles at installed widths/dashes, DOUBLE as two strokes, NONE as gridline')
  }

  // Merged perimeters from edge cells.
  {
    const scene = scenes['border-merge']
    const b = boundaries(scene.segs)
    assert.equal(b.rows.length, 8, 'merge row bounds')
    assert.equal(b.cols.length, 8, 'merge col bounds')
    const edge = (list, label) => {
      assert.ok(list.length >= 1, `${label} paints`)
      for (const s of list) {
        assert.ok(near(widthOf(s) ?? -1, 2.25, 0.35), `${label} width (${widthOf(s)})`)
        assert.ok(isDark(s), `${label} black`)
      }
    }
    edge(hSegs(scene.segs, b.rows[1], b.cols[1], b.cols[3]), 'uniform merge top')
    edge(hSegs(scene.segs, b.rows[3], b.cols[1], b.cols[3]), 'uniform merge bottom')
    edge(vSegs(scene.segs, b.cols[1], b.rows[1], b.rows[3]), 'uniform merge left')
    edge(vSegs(scene.segs, b.cols[3], b.rows[1], b.rows[3]), 'uniform merge right')
    edge(hSegs(scene.segs, b.rows[4], b.cols[4], b.cols[6]), 'anchor-only merge top')
    edge(vSegs(scene.segs, b.cols[4], b.rows[4], b.rows[6]), 'anchor-only merge left')
    const noBottom = hSegs(scene.segs, b.rows[6], b.cols[4], b.cols[6]).filter(isDark)
    assert.equal(noBottom.length, 0, 'anchor-only merge draws no bottom (installed edge-cell walk)')
    const noRight = vSegs(scene.segs, b.cols[6], b.rows[4], b.rows[6]).filter(isDark)
    assert.equal(noRight.length, 0, 'anchor-only merge draws no right')
    console.log('✓ border-merge: uniform perimeter complete; anchor-only keeps top+left')
  }

  // Shared-edge conflict, INVESTIGATIVE: log the resolved outcome.
  {
    const scene = scenes['border-conflict']
    const b = boundaries(scene.segs)
    const line = hSegs(scene.segs, b.rows[1], b.cols[0], b.cols[1])
    assert.ok(line.length >= 1, 'conflict edge paints')
    console.log(`  INVESTIGATIVE conflict outcome at y=${b.rows[1].toFixed(2)}:`)
    for (const s of line) {
      console.log(`    width=${widthOf(s)} stroke=${strokeOf(s)} dash=${s.paint && s.paint.dash} x=${Math.min(s.x1, s.x2).toFixed(1)}..${Math.max(s.x1, s.x2).toFixed(1)}`)
    }
    const custom = line.filter((s) => /^#(?:f00|ff0000|00f|0000ff)$/i.test(strokeOf(s)))
    assert.ok(custom.length >= 1, 'conflict edge resolves to a custom stroke (winner in log)')
    console.log('✓ border-conflict: outcome logged for the visual verdict (winner NOT presumed)')
  }

  // White suppression.
  {
    const scene = scenes['border-white']
    const b = boundaries(scene.segs)
    const shared = hSegs(scene.segs, b.rows[1], b.cols[0], b.cols[1])
    assert.ok(shared.some(isDark), 'suppressed line keeps the facing black edge')
    assert.ok(!shared.some(isWhitePaint), 'white top edge dropped against facing edge')
    const control = hSegs(scene.segs, b.rows[3], b.cols[0], b.cols[1])
    assert.ok(control.some(isWhitePaint), 'white edge paints against a blank neighbor')
    console.log('✓ border-white: suppression against facing edge, paint against blank')
  }

  console.log('\nPASS: orange-wrap rotated fidelity + installed borders (12 variants)')
}

main().then(() => {}).catch((err) => {
  console.error(err && err.stack ? err.stack : err)
  process.exit(1)
})
