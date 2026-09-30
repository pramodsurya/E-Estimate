const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// --- Resolver library ---------------------------------------------------------
const lib = read('src/renderer/src/lib/itemCellRef.ts')
for (const fn of ['parseCellA1', 'findItemByCode', 'resolveItemCell', 'itemCellFormula', 'collectItemCodes']) {
  assert.ok(lib.includes(`export function ${fn}`), `itemCellRef.ts must export ${fn}`)
}

// --- Editor: ITEMCELL registered, disposed, and inserted by clicking ------------
const editor = read('src/renderer/src/components/editors/UniverSpreadsheet.tsx')
assert.ok(editor.includes('IRegisterFunctionService'), 'editor must use the formula register service')
assert.ok(editor.includes("name: 'ITEMCELL'"), 'editor must register ITEMCELL')
assert.ok(editor.includes('itemCellDisposable?.dispose()'), 'ITEMCELL registration must be disposed')
assert.ok(editor.includes("range.setFormula(link.text.replace(/^=+/, '='))"), 'point mode must write a single-equals linked formula')
assert.ok(editor.includes('resolveItemCell(project.root'), 'registered function must resolve source values')

// --- Behaviour mirrors (same semantics as itemCellRef.ts) -----------------------
const colIndex = (letters) => {
  let column = 0
  for (const ch of letters.toUpperCase()) column = column * 26 + (ch.charCodeAt(0) - 64)
  return column - 1
}
const parseCellA1 = (ref) => {
  const match = typeof ref === 'string' ? ref.trim().match(/^\$?([A-Za-z]+)\$?(\d+)$/) : null
  if (!match) return null
  const row = Number(match[2]) - 1
  const column = colIndex(match[1])
  if (!Number.isInteger(row) || row < 0 || column < 0 || row > 999999) return null
  return { row, column }
}
assert.deepEqual(parseCellA1('C18'), { row: 17, column: 2 })
assert.deepEqual(parseCellA1('$a$1'), { row: 0, column: 0 })
assert.deepEqual(parseCellA1('AA10'), { row: 9, column: 26 })
assert.equal(parseCellA1('C0'), null, 'row 0 is invalid')
assert.equal(parseCellA1('C18:D20'), null, 'ranges are not single cells')
assert.equal(parseCellA1('hello'), null, 'bare words are not cells')
assert.equal(parseCellA1(''), null, 'empty is not a cell')

const firstSheetCell = (snapshot, row, column) => {
  const sheets = snapshot?.sheets
  if (!sheets || typeof sheets !== 'object') return undefined
  const firstId = Array.isArray(snapshot.sheetOrder) ? snapshot.sheetOrder[0] : undefined
  const sheet = (firstId && sheets[firstId]) || Object.values(sheets)[0]
  return sheet?.cellData?.[row]?.[column]?.v
}
const findItemByCode = (node, code) => {
  const want = typeof code === 'string' ? code.trim().toLowerCase() : ''
  if (!want) return null
  let found = null
  const visit = (n) => {
    if (found) return
    if (n.kind === 'item' && typeof n.itemCode === 'string' && n.itemCode.trim().toLowerCase() === want) {
      found = n
      return
    }
    ;(n.children || []).forEach(visit)
  }
  visit(node)
  return found
}
const resolveItemCell = (rootNode, code, ref) => {
  const item = findItemByCode(rootNode, code)
  if (!item) return { ok: false, error: 'REF' }
  const parsed = parseCellA1(ref)
  if (!parsed) return { ok: false, error: 'VALUE' }
  const raw = firstSheetCell(item.spreadsheet, parsed.row, parsed.column)
  if (raw === undefined || raw === null) return { ok: true, value: 0 }
  if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') {
    return { ok: true, value: raw }
  }
  return { ok: false, error: 'VALUE' }
}
const tree = {
  kind: 'title', children: [
    { kind: 'item', itemCode: 'CON-12', children: [], spreadsheet: { sheetOrder: ['s'], sheets: { s: { cellData: { 17: { 2: { v: 1447.666 } } } } } } },
    { kind: 'item', itemCode: 'EXC-01', children: [], spreadsheet: { sheetOrder: ['s'], sheets: { s: { cellData: { 0: { 0: { v: 'words' } } } } } } },
    { kind: 'item', itemCode: 'EMPTY-1', children: [] }
  ]
}
// The reported want: a formula in one sheet reading a cell of another sheet.
assert.deepEqual(resolveItemCell(tree, 'CON-12', 'C18'), { ok: true, value: 1447.666 })
assert.deepEqual(resolveItemCell(tree, 'con-12', 'c18'), { ok: true, value: 1447.666 }, 'code match is case-insensitive')
assert.deepEqual(resolveItemCell(tree, 'EXC-01', 'A1'), { ok: true, value: 'words' }, 'text passes through raw')
assert.deepEqual(resolveItemCell(tree, 'CON-12', 'Z99'), { ok: true, value: 0 }, 'missing cell reads as 0')
assert.deepEqual(resolveItemCell(tree, 'EMPTY-1', 'A1'), { ok: true, value: 0 }, 'item without a sheet reads as 0')
assert.deepEqual(resolveItemCell(tree, 'NOPE-9', 'A1'), { ok: false, error: 'REF' }, 'unknown code is #REF!')
assert.deepEqual(resolveItemCell(tree, 'CON-12', 'bogus'), { ok: false, error: 'VALUE' }, 'bad address is #VALUE!')
assert.deepEqual(resolveItemCell(tree, '', 'A1'), { ok: false, error: 'REF' }, 'blank code is #REF!')

const itemCellFormula = (code, ref) =>
  `=ITEMCELL(${JSON.stringify(code.trim())},${JSON.stringify(ref.trim().toUpperCase())})`
assert.equal(itemCellFormula('CON-12', 'c18'), '=ITEMCELL("CON-12","C18")')
assert.equal(itemCellFormula('  EXC-01 ', 'a1'), '=ITEMCELL("EXC-01","A1")')

// --- Export: ITEMCELL rewrites to native cross-sheet refs + extra tabs -------
const gate = read('src/renderer/src/lib/excel-output/formulaGate.ts')
assert.ok(gate.includes('export function rewriteItemCellRefs'), 'gate must rewrite ITEMCELL calls')
assert.ok(gate.includes('extraSheets'), 'gate scope must admit exported reference tabs')
const detail = read('src/renderer/src/lib/excel-output/detailGrid.ts')
assert.ok(detail.includes('itemCellTabs'), 'flatten must accept the code-to-tab map')
const page = read('src/renderer/src/lib/excel-output/pageExcel.ts')
for (const s of ['collectItemCellCodes', 'buildItemCellExtraSheets', 'extraSheets']) {
  assert.ok(page.includes(s), `pageExcel must implement ${s}`)
}
const compExcel = read('src/renderer/src/lib/excel-output/componentExcel.ts')
assert.ok(compExcel.includes('itemCellTabs'), 'detail builder must thread the tab map')
const coverRs = read('src-tauri/src/excel_compile/models/cover.rs')
assert.ok(coverRs.includes('extra_sheets'), 'Rust page payload must carry extra sheets')
assert.ok(coverRs.includes('struct ExtraSheetPayload'), 'Rust must model the extra tab')
const pageRs = read('src-tauri/src/excel_compile/page.rs')
assert.ok(pageRs.includes('payload.extra_sheets'), 'Rust page writer must emit extra tabs')

// Mirror of rewriteItemCellRefs: code->tab map, natural coordinates, no rebase.
const rewriteItemCellRefs = (raw, tabs) => {
  const call = /ITEMCELL\s*\(\s*"((?:[^"]|"")+)"\s*,\s*"((?:[^"]|"")+)"\s*\)/gi
  const out = []
  let cursor = 0
  for (;;) {
    const m = call.exec(raw)
    if (!m) break
    const tab = tabs.get(m[1].replace(/""/g, '"').trim().toUpperCase())
    if (!tab) return { ok: false }
    const ref = m[2].replace(/""/g, '"').trim().toUpperCase()
    if (!/^\$?[A-Z]{1,3}\$?\d+$/.test(ref)) return { ok: false }
    out.push(raw.slice(cursor, m.index), `'${tab.replace(/'/g, "''")}'!${ref}`)
    cursor = m.index + m[0].length
  }
  out.push(raw.slice(cursor))
  return { ok: true, text: out.join('') }
}
const tabs = new Map([['CON-12', 'CON-12'], ['EXC-01', 'EXC-01']])
assert.deepEqual(
  rewriteItemCellRefs('=SUM(A1,ITEMCELL("CON-12","C18"))', tabs),
  { ok: true, text: "=SUM(A1,'CON-12'!C18)" }
)
assert.deepEqual(
  rewriteItemCellRefs('=itemcell("exc-01","a1")*2', tabs),
  { ok: true, text: "='EXC-01'!A1*2" }
)
assert.equal(rewriteItemCellRefs('=ITEMCELL("NOPE-9","A1")', tabs).ok, false, 'unknown code keeps cached-value fallback')
assert.equal(rewriteItemCellRefs('=ITEMCELL("CON-12","bogus")', tabs).ok, false, 'bad address keeps cached-value fallback')
assert.deepEqual(
  rewriteItemCellRefs('=CONCAT("ITEMCELL(""X"",""Y"")")&ITEMCELL("CON-12","B2")', tabs).text,
  '=CONCAT("ITEMCELL(""X"",""Y"")")&\'CON-12\'!B2',
  'string literals never scan as calls'
)

// --- Point mode: unfinished formula survives sheet switches --------------------
const linkLib = read('src/renderer/src/lib/itemCellRef.ts')
assert.ok(linkLib.includes('export function appendFormulaRef'), 'itemCellRef must export appendFormulaRef')
const storeSrc = read('src/renderer/src/store/useStore.ts')
for (const s of ['formulaLink', 'startFormulaLink', 'appendFormulaLinkText', 'cancelFormulaLink', 'requestFormulaLinkCommit', 'clearFormulaLink']) {
  assert.ok(storeSrc.includes(s), `store must implement ${s}`)
}
assert.ok(editor.includes('captureUnfinishedFormula'), 'editor must capture unfinished edits on switch')
assert.ok(editor.includes('tryConsumeFormulaLink'), 'origin mount must consume committed links')
assert.ok(editor.includes('onSelectionChange'), 'open sheets must intercept picks while linking')
assert.ok(editor.includes('IUniverInstanceService'), 'capture must read the live editor document')
assert.ok(editor.includes('captureBeforeSheetSwitch'), 'capture must run before a tree click closes the editor')
assert.ok(editor.includes('pickArmed'), 'only a pointer selection may add a source cell')
assert.ok(!editor.includes('sheet-point-mode'), 'point mode should start from typed = without a button')
const banner = read('src/renderer/src/components/editors/FormulaLinkBanner.tsx')
assert.ok(banner.includes("event.key === 'Enter'"), 'banner must finish on Enter')
assert.ok(banner.includes("event.key === 'Escape'"), 'banner must cancel on Esc')
assert.ok(banner.includes('Referencing from'), 'banner must name the origin cell')
const workArea = read('src/renderer/src/components/WorkArea.tsx')
assert.ok(workArea.includes('FormulaLinkBanner'), 'banner must live above the editor')

// Mirror of appendFormulaRef: operators join, values take `+`, bare `=` joins.
const appendFormulaRef = (text, ref) => {
  if (!text || text === '=') return `${text}${ref}`
  const last = text[text.length - 1]
  if ('+-*/^(),'.includes(last) || last === '(') return `${text}${ref}`
  return `${text}+${ref}`
}
const REF = 'ITEMCELL("CON-12","C18")'
assert.equal(appendFormulaRef('=2*(', REF), `=2*(${REF}`, 'operator end joins directly')
assert.equal(appendFormulaRef('=', REF), `=${REF}`)
assert.equal(appendFormulaRef('=2', REF), `=2+${REF}`, 'value end takes +')
assert.equal(appendFormulaRef('=SUM(A1', REF), `=SUM(A1+${REF}`, 'open call takes +')
assert.equal(appendFormulaRef('=SUM(A1,', REF), `=SUM(A1,${REF}`, 'comma joins directly')
assert.equal(appendFormulaRef('', REF), REF)

// Exercise the real implementation so replacement, ranges, and duplicate
// item codes cannot pass on the strength of the mirrors above alone.
const { buildSync } = require('esbuild')
const loadTs = (entry) => {
  const compiled = buildSync({ entryPoints: [path.join(root, entry)], bundle: true, platform: 'node', format: 'cjs', write: false })
  const mod = { exports: {} }
  new Function('module', 'exports', compiled.outputFiles[0].text)(mod, mod.exports)
  return mod.exports
}
const actual = loadTs('src/renderer/src/lib/itemCellRef.ts')
const picked1 = actual.replacePickedFormulaRef('=', undefined, actual.itemCellFormula('CON-12', 'E8', 'first').slice(1))
assert.equal(actual.advancePendingFormulaFromKey('=2', '*'), '=2*', 'typing before switching sheets must preserve the operator')
assert.equal(actual.advancePendingFormulaFromKey('=2*', 'Backspace'), '=2')
const multiplied = actual.replacePickedFormulaRef('=2*', undefined, actual.itemCellFormula('CON-12', 'E8', 'first').slice(1))
assert.equal(multiplied.text, '=2*ITEMCELL("CON-12","E8","first")')
const picked2 = actual.replacePickedFormulaRef(picked1.text, picked1.lastPickStart, actual.itemCellFormula('CON-12', 'E9', 'second').slice(1))
assert.equal(picked2.text, '=ITEMCELL("CON-12","E9","second")', 'corrected pick must replace the previous cell and item')
const picked3 = actual.replacePickedFormulaRef(`${picked2.text}+`, undefined, actual.itemCellFormula('CON-12', 'E8:E10', 'first').slice(1))
assert.equal(picked3.text, '=ITEMCELL("CON-12","E9","second")+ITEMCELL("CON-12","E8:E10","first")')
assert.deepEqual(actual.parseCellRange('E10:E8'), { start: { row: 7, column: 4 }, end: { row: 9, column: 4 } })
const duplicateTree = { kind: 'title', id: 'root', children: [
  { kind: 'item', id: 'first', itemCode: 'CON-12', children: [], spreadsheet: { sheets: { s: { cellData: { 7: { 4: { v: 10 } }, 8: { 4: { v: 20 } }, 9: { 4: { v: 30 } } } } } } },
  { kind: 'item', id: 'second', itemCode: 'CON-12', children: [], spreadsheet: { sheets: { s: { cellData: { 7: { 4: { v: 40 } }, 8: { 4: { v: 50 } }, 9: { 4: { v: 60 } } } } } } }
] }
assert.deepEqual(actual.resolveItemCell(duplicateTree, 'CON-12', 'E9', 'second'), { ok: true, value: 50 })
assert.deepEqual(actual.resolveItemCell(duplicateTree, 'CON-12', 'E9'), { ok: false, error: 'REF' }, 'legacy code-only references must not silently choose a duplicate')
assert.deepEqual(actual.resolveItemRange(duplicateTree, 'CON-12', 'E8:E10', 'first'), { ok: true, values: [[10], [20], [30]] })
assert.deepEqual(actual.resolveItemCell(duplicateTree, 'CON-12', 'E9', 'missing'), { ok: false, error: 'REF' })
const actualGate = loadTs('src/renderer/src/lib/excel-output/formulaGate.ts')
assert.deepEqual(actualGate.rewriteItemCellRefs('=SUM(ITEMCELL("CON-12","E8:E10","first"))', new Map([['ID:FIRST', 'CON-12']])), { ok: true, text: "=SUM('CON-12'!E8:E10)" })

console.log('itemcell: ok')
