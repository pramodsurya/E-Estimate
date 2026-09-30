const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// --- Data model: shared-sheet group fields on ProjectNode ------------------
const types = read('src/renderer/src/types/project.ts')
assert.ok(types.includes('sharedSheetId?: string'), 'ProjectNode must carry sharedSheetId')
assert.ok(types.includes('sharedSheetName?: string'), 'ProjectNode must carry sharedSheetName')

// --- Pure helpers ------------------------------------------------------------
const helpers = read('src/renderer/src/lib/sharedSheet.ts')
for (const fn of ['collectSharedMembers', 'collectSharedGroups', 'findSharedOwner', 'resolveSharedSheetName', 'sharedSyncTargets']) {
  assert.ok(helpers.includes(`export function ${fn}`), `sharedSheet.ts must export ${fn}`)
}

// --- Store: group creation, attach/detach, save fan-out ----------------------
const store = read('src/renderer/src/store/useStore.ts')
for (const action of [
  'addSharedItemsFromMaster',
  'addProjectDataItemsToSharedSheet',
  'attachItemToSharedSheet',
  'detachItemFromSharedSheet'
]) {
  assert.ok(store.includes(action), `useStore must implement ${action}`)
}
assert.ok(
  store.includes('collectSharedMembers(root, edited.sharedSheetId)'),
  'setNodeSpreadsheet must fan grid saves out to every shared member'
)
assert.ok(store.includes('collectSharedMembers(root, item.sharedSheetId)'), 'one print config must fan out to all shared members')
assert.ok(store.includes('findSharedPrintSource(p.root, opts.sharedSheetId)?.print'), 'new members inherit the group print range')
assert.ok(
  store.includes("findSharedOwner(p.root, opts.sharedSheetId)?.spreadsheet"),
  'shared creation must seed new members from the owner snapshot'
)

// --- Creation UI: storage step -----------------------------------------------
const modal = read('src/renderer/src/components/modals/AddItemModal.tsx')
assert.ok(modal.includes('StorageChoice'), 'AddItemModal must offer a storage step')
assert.ok(modal.includes('openStorageStep'), 'AddItemModal must route confirm through the storage step')
assert.ok(modal.includes('existing-shared'), 'AddItemModal must support appending to an existing sheet')
assert.ok(modal.includes('addSharedItemsFromMaster'), 'AddItemModal must create shared members')

// --- Editor: per-item Fix Final + print area on one workbook ------------------
const editor = read('src/renderer/src/components/editors/UniverSpreadsheet.tsx')
const workArea = read('src/renderer/src/components/WorkArea.tsx')
assert.ok(workArea.includes('`shared:${item.sharedSheetId}`'), 'all members must retain one mounted workbook')
assert.ok(workArea.includes('focusedItemId={item.id}'), 'member changes must still update item focus')
assert.ok(editor.includes('onClick={() => select(member.id)}'), 'shared rail must select the logical item')
assert.ok(editor.includes('focusNode'), 'UniverSpreadsheet must scope Fix Final/print to a focused member')
assert.ok(editor.includes('et-shared-rail'), 'UniverSpreadsheet must render the shared member rail')
assert.ok(editor.includes('setNodePrint(node.id, { ...printSource.print, range })'), 'shared print area must target the workbook')
assert.ok(editor.includes('setNodeFinalCell(focusNode.id, cell)'), 'final quantity must stay local to the selected item')
assert.ok(editor.includes('Add item to sheet'), 'shared rail must offer adding items later')
assert.ok(editor.includes('Detach'), 'shared rail must offer detaching a member')
assert.ok(
  editor.includes('setNodeFinalCell(focusNode.id, cell)'),
  'Fix Final must write the focused member finalCell'
)
assert.ok(
  editor.includes('setNodePrint(focusNode.id,'),
  'Set Print Area must write the focused member print config'
)

// --- Short flow: 1 item = own sheet, 2+ ask, single grows into shared -------
assert.ok(modal.includes('if (count <= 1)'), 'single item must skip the storage question')
assert.ok(
  modal.includes("addPreparedItemsWith('separate', null)"),
  'single item must go straight to its own sheet'
)
assert.ok(modal.includes('setStorageStep(true)'), 'two or more items must be asked shared vs separate')
assert.ok(
  modal.includes('presetSharedSheet'),
  'AddItemModal must honour the convert-to-shared preset'
)
assert.ok(
  editor.includes('convertToSharedAndAddItems'),
  'single sheet must offer growing into a shared sheet'
)
assert.ok(editor.includes('Add items to sheet'), 'single sheet toolbar must show the grow action')
assert.ok(
  editor.includes('growFromItemId: node.id'),
  'grow action must defer conversion into the picker preset'
)
assert.ok(
  !editor.includes('attachItemToSharedSheet(node.id'),
  'closing the picker without adding must leave the single sheet untouched'
)
assert.ok(
  modal.includes("if (presetSharedSheet?.growFromItemId)"),
  'grow flow must skip the storage question and convert only on add'
)
assert.ok(
  store.includes('openAddItem: (parentId, presetSharedSheet)'),
  'openAddItem must carry the shared-sheet preset'
)

// --- Sync guard: blank mount-seed must never wipe group content ---------------
assert.ok(helpers.includes('export function workbookHasContent'), 'sharedSheet.ts must export workbookHasContent')
assert.ok(helpers.includes('export function findSharedContentSource'), 'sharedSheet.ts must export findSharedContentSource')
assert.ok(
  editor.includes('findSharedContentSource('),
  'UniverSpreadsheet must adopt the group content source at mount'
)
assert.ok(
  editor.includes('workbookHasContent(node.spreadsheet)'),
  'mount must only adopt when the member copy itself is blank'
)

// --- Behaviour: group helpers over a fake tree --------------------------------
// Mirrors collectSharedMembers/findSharedOwner semantics without importing TS.
const visit = (node, out) => {
  if (node.kind === 'item' && node.sharedSheetId === 's1') out.push(node)
  node.children.forEach((c) => visit(c, out))
}
const fake = {
  id: 'root', kind: 'title', name: 'T', children: [
    { id: 'a', kind: 'item', name: 'A', children: [], sharedSheetId: 's1' },
    { id: 'b', kind: 'item', name: 'B', children: [], sharedSheetId: 's1' },
    { id: 'c', kind: 'item', name: 'C', children: [] }
  ]
}
const members = []
visit(fake, members)
assert.deepEqual(members.map((m) => m.id), ['a', 'b'])
assert.equal(members[0].id, 'a', 'owner is the first member in tree order')

// --- Behaviour: canonical content adoption (mirrors sharedSheet.ts) -----------
const hasContent = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return false
  const sheets = snapshot.sheets
  if (!sheets || typeof sheets !== 'object') return false
  return Object.values(sheets).some(
    (sheet) => !!sheet?.cellData && Object.keys(sheet.cellData).length > 0
  )
}
const contentSource = (all, sharedSheetId) =>
  all.find((m) => m.sharedSheetId === sharedSheetId && hasContent(m.spreadsheet)) ?? null
// Reproduces the reported bug: A holds words, B opens blank.
const withWords = {
  id: 'a', kind: 'item', sharedSheetId: 's1',
  spreadsheet: { sheetOrder: ['s'], sheets: { s: { cellData: { 0: { 0: { v: 'words' } } } } } }
}
const blankMember = { id: 'b', kind: 'item', sharedSheetId: 's1' }
assert.equal(contentSource([withWords, blankMember], 's1')?.id, 'a', 'blank member adopts the content source')
assert.equal(contentSource([blankMember, withWords], 's1')?.id, 'a', 'adoption finds content regardless of order')
assert.equal(contentSource([blankMember], 's1'), null, 'all-blank group has no source (fresh blank sheet)')
// A member holding its own content never adopts.
assert.ok(hasContent(withWords.spreadsheet), 'content detection reads cellData')
assert.ok(!hasContent(blankMember.spreadsheet), 'missing snapshot counts as blank')
assert.ok(!hasContent({ sheets: { s: { cellData: {} } } }), 'empty cellData counts as blank')

// --- Group print/export: one page and one Excel tab, no item description ---
const itemTypst = read('src/renderer/src/lib/typist-output/itemTypst.ts')
const sharedTemplate = read('src/renderer/src/lib/typist-output/sharedSheet.typ')
const printBook = read('src/renderer/src/lib/typist-output/projectPrintBook.ts')
const pageExcel = read('src/renderer/src/lib/excel-output/pageExcel.ts')
const projectExcel = read('src/renderer/src/lib/excel-output/projectWire.ts')
const componentDetail = read('src/renderer/src/lib/excel-output/componentDetailPrep.ts')
const explorer = read('src/renderer/src/components/explorer/TreeNode.tsx')
const icons = read('src/renderer/src/components/nodeVisual.tsx')
assert.ok(itemTypst.includes('sharedSheetScopeKey(node.sharedSheetId)'), 'shared members must use one Print Studio scope')
assert.ok(itemTypst.includes('defaultSharedSheetTemplate'), 'shared print must use a dedicated layout')
assert.ok(sharedTemplate.includes('#render-univer-sheet('), 'shared layout must render the actual workbook')
assert.ok(!sharedTemplate.includes('EE.description') && !sharedTemplate.includes('EE.code'), 'shared layout must omit individual item descriptions')
assert.ok(printBook.includes('emittedSharedSheets.has(child.sharedSheetId)'), 'project PDF must emit each shared workbook once')
assert.ok(pageExcel.includes("if (node.sharedSheetId && node.itemEditorType !== 'document')"), 'shared Excel export needs a raw workbook branch')
assert.ok(projectExcel.includes('projectSharedSheetName(page)'), 'project Excel must add one tab for the shared workbook')
assert.ok(componentDetail.includes('itemNode.sharedSheetId ? null : toRangeLike(itemNode.print?.range)'), 'BOQ final cells must not be limited by the shared print area')
assert.ok(explorer.includes('<SharedSheetTreeGroup'), 'explorer must visually group shared members')
assert.ok(icons.includes('if (node.sharedSheetId)'), 'shared item codes need a different icon')

const { buildSync } = require('esbuild')
const compiled = buildSync({ entryPoints: [path.join(root, 'src/renderer/src/lib/sharedSheet.ts')], bundle: true, platform: 'node', format: 'cjs', write: false })
const mod = { exports: {} }
new Function('module', 'exports', compiled.outputFiles[0].text)(mod, mod.exports)
const actual = mod.exports
const printTree = { id: 'root', kind: 'title', children: [
  { id: 'a', kind: 'item', sharedSheetId: 's1', children: [], print: { range: null } },
  { id: 'b', kind: 'item', sharedSheetId: 's1', children: [], print: { range: { startRow: 1, startColumn: 0, endRow: 9, endColumn: 4 } } }
] }
assert.equal(actual.findSharedPrintSource(printTree, 's1')?.id, 'b', 'legacy member range becomes the group print range')
assert.equal(actual.sharedSheetScopeKey('s1'), 'shared-sheet-s1')

const Module = require('node:module')
const ts = require('typescript')
const pagePath = path.join(root, 'src/renderer/src/lib/excel-output/pageExcel.ts')
const pageModule = new Module(pagePath, module)
pageModule.filename = pagePath
pageModule.require = (request) => {
  if (request === '../typist-output/itemTypst') return {
    buildItemSheetRenderData: () => ({ setup: { paper: 'a4', flipped: false, marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 25 } })
  }
  if (request === './detailGrid') return { sanitizeSheetName: (name) => name }
  return {}
}
pageModule._compile(ts.transpileModule(pageExcel, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, pagePath)
const rawCell = { r: 4, c: 2, value: 300 }
const sharedPayload = pageModule.exports.buildPageExcelPayload(
  {},
  { kind: 'item', id: 'a', sharedSheetId: 's1', sharedSheetName: 'Measurement Sheet' },
  { name: 'Code A', grid: { cells: [rawCell], merges: [], colWidthsChars: [10], rowHeightsPt: [], images: [], rowBreaks: [] } }
)
assert.equal(sharedPayload.name, 'Measurement Sheet')
assert.deepEqual(sharedPayload.grid.cells, [rawCell], 'Excel shared tab keeps the grid without an item header or row shift')

console.log('shared-sheet: ok')
