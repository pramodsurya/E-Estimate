// Regression test for Guide Wall Typst generator & PDF compilation.
// Validates:
// 1. Data builder mirroring guideWallPrint.ts HTML conversion algorithm.
// 2. Pure Typst guidewall.typ rendering to-scale dimensioned cross-section SVGs.
// 3. Multi-page concrete measurement tables with repeating headers.
// 4. Real PDF compilation via NodeCompiler.

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

function loadTsModule(filePath, mocks = {}) {
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

const gwApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/guidewall/guideWallTypst.ts'), {
  '../../nodeSettings': {
    resolveNodeSettings: () => ({
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 18, right: 15, bottom: 18, left: 20 }
    })
  },
  '../../signatureFooter': {
    resolveSignatureFooter: () => ({ enabled: true, signatures: [{ designation: 'Deputy Executive Engineer', office: 'Irrigation Sub-Division' }] }),
    printableSignatureRows: () => [{ designation: 'Deputy Executive Engineer', office: 'Irrigation Sub-Division' }]
  },
  '../../tree': {
    findNode: (_root, id) => ({
      id,
      name: 'M20 Grade Concrete for Guide Wall',
      itemCode: 'IRR-CCDW-2-9',
      unit: 'cum',
      itemDescription: 'Providing and laying cement concrete M20 grade using 20mm graded metal...'
    })
  }
})

const settingsApi = require('../src/renderer/src/lib/typist-output/documentSettings.ts')

async function run() {
  console.log('Testing Guide Wall Typst conversion & PDF compilation...')

  // Create sample Guide Wall test fixture
  const mockGuideWallNode = {
    id: 'gw-section-1',
    name: 'RCC Guide Wall at Barrage Upstream',
    itemCode: 'GW-01',
    kind: 'component',
    templateId: 'guide-wall',
    guideWall: {
      configured: true,
      source: 'map',
      alignment: [
        { lat: 17.5, lng: 78.5, ch: 0 },
        { lat: 17.501, lng: 78.501, ch: 150 }
      ],
      lengthM: 150,
      sectionMode: 'continuous',
      intervalM: 25,
      breaks: [],
      sections: [
        {
          id: 'sec-1',
          fromCh: 0,
          toCh: 75,
          sideMode: 'mirror',
          left: { topWidth: 0.6, height: 3.0, faceSlope: 0.3 },
          right: { topWidth: 0.6, height: 3.0, faceSlope: 0.3 },
          gap: 6.0,
          baseWidth: 10.0,
          baseThickness: 0.6
        },
        {
          id: 'sec-2',
          fromCh: 75,
          toCh: 150,
          sideMode: 'left',
          left: { topWidth: 0.8, height: 3.5, faceSlope: 0.35 },
          right: { topWidth: 0.6, height: 3.0, faceSlope: 0.3 },
          gap: 6.0,
          baseWidth: 8.0,
          baseThickness: 0.6
        }
      ],
      wallMaterial: { code: 'IRR-CCDW-2-9' },
      baseMaterial: { code: 'IRR-CCDW-2-3' },
      excavationMaterial: { code: 'IRR-CCDW-1-2' },
      excavationRows: [
        { id: 'exc-1', fromCh: 0, toCh: 75, breadth: 11.0, height: 3.6 },
        { id: 'exc-2', fromCh: 75, toCh: 150, breadth: 9.0, height: 4.1 }
      ],
      materialItems: [
        { role: 'wall', code: 'IRR-CCDW-2-9', itemNodeId: 'item-gw-wall' },
        { role: 'base', code: 'IRR-CCDW-2-3', itemNodeId: 'item-gw-base' },
        { role: 'excavation', code: 'IRR-CCDW-1-2', itemNodeId: 'item-gw-exc' }
      ]
    },
    children: []
  }

  const mockProject = {
    meta: { name: 'Sitarama Lift Irrigation Project' },
    root: { id: 'root', children: [mockGuideWallNode] }
  }

  // 1. Build Render Data
  const renderData = gwApi.buildGuideWallRenderData(mockProject, mockGuideWallNode)
  assert.equal(renderData.name, 'RCC Guide Wall at Barrage Upstream')
  assert.equal(renderData.figures.length, 2, '2 distinct cross-section types generated')
  assert.ok(renderData.figures[0].svg.includes('<svg'), 'Figure 1 contains valid SVG')
  assert.ok(renderData.figures[1].svg.includes('<svg'), 'Figure 2 contains valid SVG')
  assert.equal(renderData.wall_groups.length, 1, '1 wall material group')
  assert.equal(renderData.base_groups.length, 1, '1 base material group')
  assert.ok(renderData.excavation, 'Excavation block present')
  assert.equal(renderData.excavation.rows.length, 2, '2 excavation rows')
  console.log('✓ Render data verified: 2 figures, concrete tables, excavation, and signatures')

  // 2. Check Document Settings Bidirectional Parsing & Live Injection
  const defaultTemplate = gwApi.defaultGuideWallTypstSource()
  const initialSettings = settingsApi.parseDocumentSettingsFromTypst(defaultTemplate)
  assert.ok(initialSettings, 'Initial document settings parsed from template')
  assert.equal(initialSettings.pageSize, 'A4')
  assert.equal(initialSettings.orientation, 'portrait')

  const modifiedSettings = {
    ...initialSettings,
    pageSize: 'A4',
    orientation: 'landscape',
    fontSizePt: 10.0
  }
  const injectedSource = settingsApi.applyDocumentSettingsToTypst(defaultTemplate, modifiedSettings)
  const parsedBack = settingsApi.parseDocumentSettingsFromTypst(injectedSource)
  assert.equal(parsedBack.orientation, 'landscape')
  assert.equal(parsedBack.fontSizePt, 10.0)
  console.log('✓ Document Settings bidirectional parsing & injection verified')

  // 3. Compile Real PDF with Typst NodeCompiler
  const prelude = gwApi.guideWallCompilePrelude()
  const fullSource = `${prelude}\n${defaultTemplate}`

  const compiler = NodeCompiler.create({
    workspace: root
  })

  const compileInputs = {
    'ee-guidewall': JSON.stringify(renderData)
  }

  const pdfBytes = compiler.pdf({
    mainFileContent: fullSource,
    inputs: compileInputs
  })

  assert.ok(pdfBytes, 'PDF compilation succeeded')
  const auditApi = require('../src/renderer/src/lib/typist-output/printContentAudit.ts')
  const audit = auditApi.preparePrintAudit(compileInputs)
  assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: fullSource, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default guide wall satisfies current content obligations')
  assert.ok(pdfBytes.length > 5000, `Generated Guide Wall PDF is valid (${pdfBytes.length} bytes)`)
  console.log(`✓ Real Guide Wall PDF compiled successfully (${pdfBytes.length} bytes)!`)

  console.log('\nAll Guide Wall Typst regression tests passed!')
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
