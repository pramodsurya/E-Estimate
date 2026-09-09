// Regression test for Component Print Studio & Typst rendering engine.
// Verifies:
// 1. Component Report compilation with Abstract of Estimate and child items.
// 2. Both Univer Spreadsheet and Univer Document child items render faithfully.
// 3. Document Settings block parsing and bidirectional live injection.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) {
    return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  }
  if (request.includes('.png')) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  }
  if (request.includes('nodeVisual')) {
    return { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' }
  }
  if (request.includes('projectItems')) {
    return { rateAnalysisOverrideForNode: () => null }
  }
  if (request.includes('supabase')) {
    return { supabase: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')

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

const componentApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/componentTypst.ts'), {
  '../../components/nodeVisual': { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' },
  '../finalNumber': {
    componentItemsTotal: () => 216800,
    getItemFinal: (_p, item) => ({
      qty: item.id === 'item-1' ? 450 : 380,
      rate: item.id === 'item-1' ? 220 : 310,
      amount: item.id === 'item-1' ? 99000 : 117800,
      unit: 'cum'
    })
  },
  '../nodeSettings': {
    resolveNodeSettings: () => ({
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 15, bottom: 20, left: 25 }
    })
  },
  '../signatureFooter': {
    resolveSignatureFooter: () => ({ enabled: true, signatures: [{ designation: 'Executive Engineer', office: 'Irrigation Division' }] }),
    printableSignatureRows: () => [{ designation: 'Executive Engineer', office: 'Irrigation Division' }]
  },
  '../dashboardSync': {
    dashboardContextMatches: () => false,
    dashboardItemIsSynced: () => false
  }
})

const settingsApi = require('../src/renderer/src/lib/typist-output/documentSettings.ts')

async function run() {
  console.log('Testing Component Typst pipeline...')

  // 1. Check Scope Key & Default Template
  const mockNode = {
    id: 'comp-101',
    name: 'Earthwork & Cross Drainage',
    itemCode: 'COMP-01',
    kind: 'component',
    children: [
      {
        id: 'item-1',
        name: 'Excavation in hard soil',
        itemCode: 'EW-01',
        kind: 'item',
        itemEditorType: 'spreadsheet',
        itemDescription: 'Excavation in all classes of soil including shoring and strutting',
        unit: 'cum',
        spreadsheet: {
          snapshot: {
            id: 'wb-1',
            sheetOrder: ['s-1'],
            styles: {
              'bold-h': { bl: 1, fs: 11, cl: { rgb: '#0b3d5c' } },
              'num': { fs: 10 }
            },
            sheets: {
              's-1': {
                id: 's-1',
                name: 'Measurement',
                rowCount: 5,
                columnCount: 4,
                cellData: {
                  '0': {
                    '0': { v: 'Sl. No.', s: 'bold-h' },
                    '1': { v: 'Particulars', s: 'bold-h' },
                    '2': { v: 'Quantity', s: 'bold-h' },
                    '3': { v: 'Unit', s: 'bold-h' }
                  },
                  '1': {
                    '0': { v: '1', s: 'num' },
                    '1': { v: 'Main canal reach 0 to 100m', s: 'num' },
                    '2': { v: 450, s: 'num' },
                    '3': { v: 'cum', s: 'num' }
                  }
                },
                rowData: {
                  '0': { h: 25 },
                  '1': { h: 20 }
                },
                columnData: {
                  '0': { w: 50 },
                  '1': { w: 250 },
                  '2': { w: 80 },
                  '3': { w: 60 }
                }
              }
            }
          }
        },
        print: {
          range: { startRow: 0, startColumn: 0, endRow: 1, endColumn: 3 },
          repeatHeaderRows: 1
        },
        children: []
      },
      {
        id: 'item-2',
        name: 'Technical Specifications & Quality Criteria',
        itemCode: 'SPEC-01',
        kind: 'item',
        itemEditorType: 'document',
        itemDescription: 'Standard specifications as per MoRTH Section 300',
        unit: 'LS',
        documentData: {
          id: 'doc-1',
          body: {
            dataStream: 'General Requirements\nCompaction shall be carried out with 8-10 ton vibratory rollers to achieve 98% Proctor density.\n\r',
            textRuns: [
              { st: 0, ed: 20, ts: { bl: 1, fs: 12, cl: { rgb: '#0b3d5c' } } },
              { st: 21, ed: 110, ts: { fs: 10, it: 1 } }
            ],
            paragraphs: [
              { startIndex: 20 },
              { startIndex: 111 }
            ]
          }
        },
        children: []
      }
    ]
  }

  const mockProject = {
    meta: { name: 'Main Canal Modernization' },
    root: { id: 'root', children: [mockNode] }
  }

  const scopeKey = componentApi.componentScopeKey(mockNode)
  assert.equal(scopeKey, 'component-comp-101')
  console.log('✓ Scope key verified:', scopeKey)

  // 2. Build Render Data
  const renderData = componentApi.buildComponentRenderData(mockProject, mockNode)
  assert.equal(renderData.component.name, 'Earthwork & Cross Drainage')
  assert.equal(renderData.abstract.length, 2)
  assert.equal(renderData.abstract[0].sl, '1')
  assert.equal(renderData.abstract[0].code, 'EW-01')
  assert.equal(renderData.abstract[0].heading, 'Excavation in hard soil')
  assert.equal(renderData.abstract[0].unit, 'cum')
  assert.equal(renderData.items.length, 2)
  assert.equal(renderData.items[0].editorType, 'spreadsheet')
  assert.equal(renderData.items[1].editorType, 'document')
  console.log('✓ Render data verified: 2 abstract rows, 2 items (spreadsheet & document)')

  // 3. Document Settings Bidirectional Parsing & Live Injection
  const defaultTemplate = componentApi.defaultComponentTypstSource()
  const initialSettings = settingsApi.parseDocumentSettingsFromTypst(defaultTemplate)
  assert.ok(initialSettings, 'Initial document settings parsed from template')
  assert.equal(initialSettings.pageSize, 'A4')
  assert.equal(initialSettings.orientation, 'portrait')

  const modifiedSettings = {
    ...initialSettings,
    pageSize: 'A4',
    orientation: 'landscape',
    fontSizePt: 10.5
  }
  const injectedSource = settingsApi.applyDocumentSettingsToTypst(defaultTemplate, modifiedSettings)
  const parsedBack = settingsApi.parseDocumentSettingsFromTypst(injectedSource)
  assert.equal(parsedBack.orientation, 'landscape')
  assert.equal(parsedBack.fontSizePt, 10.5)
  console.log('✓ Document Settings bidirectional parsing verified')

  // 4. Compile Component PDF with NodeCompiler
  const prelude = componentApi.componentCompilePrelude()
  const fullSource = `${prelude}\n${defaultTemplate}`

  const compiler = NodeCompiler.create({
    workspace: root
  })

  const compileInputs = {
    'ee-data': JSON.stringify(renderData)
  }

  const pdfBytes = compiler.pdf({
    mainFileContent: fullSource,
    inputs: compileInputs
  })

  assert.ok(pdfBytes, 'PDF compilation succeeded')
  const auditApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts'), {})
  const audit = auditApi.preparePrintAudit(compileInputs)
  assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: fullSource, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default component satisfies current content obligations')
  assert.ok(pdfBytes.length > 5000, `Generated PDF is valid (${pdfBytes.length} bytes)`)
  console.log(`✓ Real Component PDF compiled successfully (${pdfBytes.length} bytes)!`)

  console.log('\nAll Component Print Studio regression tests passed!')
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
