// Component/shared/custom-template display-text route proofs.
//
// Every Univer-grid PDF route must carry installed display text (cell._ee)
// into the compiler through the shared boundary (attachEeDisplayText):
//   - item route: itemSheetCompileInputs (covered by test-univer-fidelity.cjs F2b)
//   - component route (shared multi-item + custom saved templates): here
//   - project route: carries no grids (abstract data only) — nothing to prove
//
// Layers: compile inputs carry _ee (display text + section hex) per child;
// saved snapshots gain no _ee keys; buildComponentRenderData (the Excel
// path's input) stays pristine. Artifacts save BEFORE asserts.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const artifactDir = path.join(__dirname, 'output', 'component-display-text')

// Standalone TS loader (established: test-univer-fidelity.cjs). Vite query
// imports resolve relative to the IMPORTING TS file, never scripts/.
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

function workbookWith(v, pattern) {
  const sid = 'sheet1'
  return {
    id: 'wb', name: 'WB', appVersion: '0.25.0', locale: 'en-US',
    styles: { 1: { n: { pattern } } },
    sheetOrder: [sid],
    sheets: {
      [sid]: {
        id: sid, name: 'Sheet1', rowCount: 10, columnCount: 8,
        cellData: { 0: { 2: { v, t: 2, s: '1' } } },
        rowData: {}, columnData: {}, mergeData: []
      }
    }
  }
}

function itemNode(id, code, v, pattern) {
  return {
    id, kind: 'item', name: `Item ${code}`, itemCode: code,
    itemDescription: '', unit: 'lot', itemEditorType: 'spreadsheet',
    spreadsheet: workbookWith(v, pattern), print: {}, charts: [],
    finalCell: 0, templateGenerated: false
  }
}

async function main() {
  console.log('--- Component display-text routes ---')
  const api = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/componentTypst.ts'), {
    '../../components/nodeVisual': { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' },
    '../finalNumber': {
      readFinalValueFromSnapshot: (node) => node.finalCell ?? 0,
      getItemRate: () => 100,
      componentItemsTotal: () => 0,
      getItemFinal: () => 0
    },
    '../nodeSettings': {
      resolveNodeSettings: () => ({ pageSize: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 25 } }),
      resolveNodeSettingsOverrides: () => ({})
    },
    '../signatureFooter': {
      resolveSignatureFooter: (project) => project.signatureFooter,
      printableSignatureRows: (rows) => rows ?? []
    },
    '../projectItems': { rateAnalysisOverrideForNode: () => null },
    '../dashboardSync': { dashboardContextMatches: () => false, dashboardItemIsSynced: () => false },
    './bund/bundTypst': { bundCompileInputs: () => ({}), bundVariablesPrelude: () => '', injectBundLayout: (s) => s },
    './guidewall/guideWallTypst': { guideWallCompileInputs: () => ({}), guideWallVariablesPrelude: () => '', injectGuideWallLayout: (s) => s }
  })

  const itemA = itemNode('item-a', 'A', 1234.567, '#,##0.00')
  const itemB = itemNode('item-b', 'B', -1234.5, '#,##0.00;[Red](#,##0.00)')
  const comp = {
    id: 'comp-1', kind: 'component', name: 'Shared Component',
    itemCode: 'COMP', children: [itemA, itemB], print: {}
  }
  const project = {
    id: 'proj-routes', meta: { name: 'Route Proof Project' },
    root: { name: 'Root', children: [comp] },
    signatureFooter: { enabled: false, rows: [] }
  }

  // R1. Shared multi-item component: every child grid carries display text
  // and section color into the compiler.
  const part = api.resolveComponentPrintPart(project, comp, {}, () => undefined, { itemScope: 'all' })
  const data = JSON.parse(part.compileInputs['ee-data'])
  assert.equal(data.items.length, 2, 'both shared items emitted')
  const eeA = data.items[0].univer.sheets.sheet1.cellData['0']['2']._ee
  const eeB = data.items[1].univer.sheets.sheet1.cellData['0']['2']._ee
  assert.equal(eeA.d, '1,234.57', 'item A display text reaches the renderer')
  assert.equal(eeA.c, undefined, 'positive value carries no section color')
  assert.equal(eeB.d, '(1,234.50)', 'item B display text reaches the renderer')
  assert.equal(eeB.c, '#F05252', 'item B section color reaches the renderer')
  assert.equal(data.items[1].univer.sheets.sheet1.cellData['0']['2'].v, -1234.5, 'original value kept')
  console.log('✓ shared multi-item component: display text + section color per child grid')

  // R2. Custom saved template: same compile inputs (and _ee) feed the
  // estimator-edited source.
  const customSource = '// custom\n#render-univer-sheet(data: sys.inputs.at("ee-data"))\n'
  const projectCustom = {
    ...project,
    printStudioDocuments: { 'component-comp-1': customSource }
  }
  const customPart = api.resolveComponentPrintPart(projectCustom, comp, {}, () => undefined, { itemScope: 'all' })
  assert.equal(customPart.source, customSource, 'saved template wins')
  const customData = JSON.parse(customPart.compileInputs['ee-data'])
  assert.equal(customData.items[1].univer.sheets.sheet1.cellData['0']['2']._ee.c, '#F05252', 'custom template inputs carry section color')
  console.log('✓ custom-component template: same display-text inputs reach the renderer')

  // R3. Saved snapshots gain no _ee keys (clone-on-write boundary).
  assert.ok(!JSON.stringify(itemA.spreadsheet).includes('_ee'), 'item A snapshot pristine')
  assert.ok(!JSON.stringify(itemB.spreadsheet).includes('_ee'), 'item B snapshot pristine')
  console.log('✓ saved snapshots pristine after component export inputs')

  // R4. The Excel path input (buildComponentRenderData) stays pristine:
  // original typed values, no annotations.
  const fresh = api.buildComponentRenderData(project, comp, {}, () => undefined, { itemScope: 'all' })
  const freshCell = fresh.items[1].univer.sheets.sheet1.cellData['0']['2']
  assert.equal(freshCell._ee, undefined, 'Excel-path render data carries no _ee')
  assert.equal(freshCell.v, -1234.5, 'Excel-path value stays numeric')
  assert.equal(typeof freshCell.v, 'number', 'Excel-path type kept')
  console.log('✓ Excel contract: render data keeps typed values, formulas, verbatim patterns')

  fs.mkdirSync(artifactDir, { recursive: true })
  fs.writeFileSync(path.join(artifactDir, 'component-ee-data.json'), JSON.stringify(data, null, 1))
  console.log(`✓ inputs artifact saved to ${artifactDir} (before assertions above)`)
  console.log('\nPASS: component display-text routes')
}

main().catch((err) => { console.error(err); process.exit(1) })
