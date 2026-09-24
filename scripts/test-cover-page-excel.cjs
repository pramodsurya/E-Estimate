const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

require.extensions['.ts'] = function (m, filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  })
  m._compile(outputText, filename)
}

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
  loadedModule.require = (request) => {
    if (request in mocks) return mocks[request]
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile, mocks)
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

async function runTests() {
  console.log('--- Testing Front Page + Introduction page Excel payloads ---')

  // Cover fields resolve exactly like the Typst template literals.
  const coverTypst = loadTsModule(
    path.join(root, 'src/renderer/src/lib/typist-output/coverTypst.ts'),
    {
      './cover.typ?raw': '',
      '../../assets/emblem-telangana.svg?raw': '<svg></svg>',
      '../projectPrintInputs': { resolveProjectEstimatedCost: () => null },
      '../nodeSettings': { resolveNodeSettings: () => ({}) },
      './documentSettings': {
        applyDocumentSettingsToTypst: () => '',
        normalizeDocumentSettings: (s) => s,
        resolveProjectDocumentSettings: () => ({})
      }
    }
  )
  const project = {
    meta: {
      name: 'Kodangal Lift',
      sorYear: '2024-25',
      estimatedCost: 12_50_00_000,
      areaAllowance: { village: 'kodangal', mandal: 'Kodangal', district: 'Vikarabad' }
    }
  }
  const fields = coverTypst.coverExcelFields(project)
  assert.equal(fields.workName, 'Kodangal Lift')
  assert.equal(fields.ssrYear, '2024-25')
  assert.match(fields.estimatedCost, /Cr/)
  assert.equal(fields.village, 'Kodangal', 'place names are normalized like the template')

  const coverExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/coverExcel.ts'),
    {
      '../typist-output/coverTypst': { ...coverTypst, telanganaEmblemSvg: () => '<svg></svg>' },
      './svgRaster': { rasterizeSvg: async () => null }
    }
  )
  const cover = await coverExcel.buildCoverExcelPayload(project)
  assert.equal(cover.workName, 'Kodangal Lift')
  assert.equal(coverExcel.coverExcelFileName('Kodangal Lift'), 'Kodangal Lift — Front Page.xlsx')

  // Document page: paragraphs + tables flatten, page breaks survive shifted.
  const docTypstData = {
    paragraphs: [
      {
        runs: [{ text: 'Scope of work' }],
        pageBreakBefore: false
      },
      {
        runs: [{ text: 'Continued' }],
        pageBreakBefore: true
      }
    ]
  }
  const renderData = {
    project: 'Kodangal Lift',
    item: 'Introduction',
    code: '',
    unit: '',
    description: 'Estimate for the lift scheme.',
    descriptionRuns: [{ text: 'Estimate for the lift scheme.', bold: true, italic: false, underline: false }],
    setup: {
      paper: 'us-legal', flipped: true,
      marginTop: 12, marginRight: 10, marginBottom: 14, marginLeft: 16
    },
    final: { qty: '1', rate: '—', amount: '—', unit: 'job' },
    signature: [{ designation: 'Assistant Engineer', office: 'Irrigation' }]
  }
  const pageExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/pageExcel.ts'),
    {
      '../../components/nodeVisual': { nodeDisplayName: (n) => n.name },
      '../univerSpreadsheet': { createUniverWorkbookData: () => ({}), usedCellRange: () => null },
      '../typist-output/itemTypst': {
        buildItemSheetRenderData: () => renderData,
        extractItemMedia: () => ({ images: [], shadowFiles: {} })
      },
      '../typist-output/documentTypst': {
        extractDocumentMedia: () => ({ images: [], shadowFiles: {} }),
        parseDocumentToTypstData: () => docTypstData
      }
    }
  )
  const node = { id: 'intro', kind: 'page', name: 'Introduction' }
  const input = await pageExcel.preparePageDetailInput(node)
  assert.equal(input.kind, 'document')
  await assert.rejects(
    pageExcel.measureMediaImages([
      { path: '/missing.png', name: 'Missing section image', width: 100, height: 50 }
    ], {}),
    /could not resolve image.*missing\.png/i,
    'referenced images must never disappear silently from Excel'
  )

  const componentExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/componentExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {},
      './detailGrid': loadTsModule(
        path.join(root, 'src/renderer/src/lib/excel-output/detailGrid.ts'),
        { '../typist-output/documentTypst': {} }
      )
    }
  )
  const details = componentExcel.buildComponentDetailSheets([input])
  assert.equal(details.length, 1)
  // Doc rows: para0 -> grid r0, para1 -> grid r1. pageBreakBefore stays
  // Typst-only: Excel pagination is automatic, no forced breaks.
  assert.deepEqual(details[0].grid.rowBreaks, [])

  const payload = pageExcel.buildPageExcelPayload(project, node, details[0])
  assert.ok(payload, 'printable detail must yield a payload')
  assert.equal(payload.name, details[0].name)
  const title = payload.grid.cells.find((c) => c.r === 0 && c.c === 0)
  assert.equal(title.value, 'Introduction')
  assert.equal(payload.landscape, true, 'page orientation follows the Typst document settings')
  assert.equal(payload.grid.pageSetup.paperSize, 'Legal', 'page paper setting reaches native Excel')
  assert.deepEqual(payload.grid.pageSetup.marginsMm, { top: 12, right: 10, bottom: 14, left: 16 })
  assert.ok(payload.grid.cells.some((c) => c.r === 1 && Array.isArray(c.runs)), 'description keeps rich text runs')
  // No breaks to shift: pagination stays automatic on page sheets too.
  assert.deepEqual(payload.grid.rowBreaks, [])
  const sig = payload.grid.cells.find((c) => typeof c.value === 'string' && c.value.includes('Assistant Engineer'))
  assert.ok(sig && sig.r > 3, 'signature lands after content')

  // Nothing printable -> null payload so the caller fails loudly.
  assert.equal(pageExcel.buildPageExcelPayload(project, node, null), null)
  assert.equal(pageExcel.pageExcelFileName('P', 'Introduction'), 'P — Introduction.xlsx')

  console.log('cover + page excel tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
