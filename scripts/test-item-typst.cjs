// Validates the single-item, spreadsheet-only Typst template. The sheet body is
// rendered faithfully through `worksheetToTypst` (the Typst twin of the HTML
// path), so gridlines/merges/widths/formatting survive; item identity + signature
// are runtime inputs. Builds data from a fixture, resolves the source, then
// compiles it to a real PDF with the NodeCompiler.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

// Vite raw template imports in Node's standalone regression runner.
const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  if (request.includes('.png?')) return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')

// A .ts loader so `itemTypst.ts` can require the real `./worksheetTypst`,
// `./printRender`, `./univerSpreadsheet`, `./documentSettings` (all pure TS).
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

const api = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/itemTypst.ts'), {
  '../../components/nodeVisual': { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' },
  '../finalNumber': {
    readFinalValueFromSnapshot: (node) => node.finalCell ?? node.computedQuantity ?? 10.5,
    getItemRate: () => 185.5
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
const documentTypstApi = require(path.join(root, 'src/renderer/src/lib/typist-output/documentTypst.ts'))

const item = {
  id: 'item-1',
  name: 'Excavation in Bed of Canal',
  itemCode: 'IRR-CAW-7-1',
  itemDescription: 'Excavation in soft soil including dressing.',
  itemUnit: 'cum',
  unit: 'cum',
  itemEditorType: 'spreadsheet',
  finalCell: 10.5,
  print: { range: { startRow: 0, startColumn: 0, endRow: 3, endColumn: 2 }, showGridlines: true },
  charts: [
    {
      id: 'ch-1',
      type: 'bar',
      title: 'Excavation Profile',
      position: { startX: 50, startY: 120, width: 150, height: 100 },
      png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    }
  ],
  spreadsheet: {
    styles: { head: { ht: 2, bl: 1, bg: { rgb: '#f1f3f5' } }, num: { ht: 3 } },
    sheetOrder: ['sheet-1'],
    sheets: {
      'sheet-1': {
        columnCount: 3,
        defaultColumnWidth: 80,
        columnData: { 0: { w: 40 }, 1: { w: 200 }, 2: { w: 90 } },
        cellData: {
          0: { 0: { v: 'Sl', s: 'head' }, 1: { v: 'Description', s: 'head' }, 2: { v: 'Qty', s: 'head' } },
          1: { 0: { v: 1, s: 'num' }, 1: { v: 'I. Reach 0 to 1 km' }, 2: { v: '500.00', s: 'num' } },
          2: { 0: { v: 2, s: 'num' }, 1: { v: 'II. Reach 1 to 2 km' }, 2: { v: '350.00', s: 'num' } },
          3: { 0: { v: 3, s: 'num' }, 1: { v: 'Total' }, 2: { v: '850.00', s: 'num' } }
        }
      }
    }
  }
}

const project = {
  id: 'proj-1',
  meta: { name: 'Tank Restoration Project' },
  root: { name: 'Root' },
  signatureFooter: {
    enabled: true,
    rows: [{ designation: 'Assistant Engineer', office: 'Sub-Division 1' }]
  }
}

// 1. Runtime data (item identity + signature + page setup)
const data = api.buildItemSheetRenderData(project, item)
assert.equal(data.item, 'Excavation in Bed of Canal')
assert.equal(data.final.qty, '10.50')
assert.equal(data.final.rate, '185.50')
assert.equal(data.signature.length, 1)
assert.equal(data.setup.paper, 'a4')
assert.equal(data.setup.flipped, false)
assert.equal(data.setup.fontSizePt, 11)
assert.ok(Array.isArray(data.setup.fontFamily) && data.setup.fontFamily.length > 0)
assert.equal(data.images.length, 1, 'contains 1 chart image')
assert.equal(data.images[0].path, 'images/chart_1.png')
assert.equal(data.gallery.length, 1, 'contains 1 gallery item')

const shadowFiles = api.itemSheetShadowFiles(item)
assert.ok(shadowFiles['images/chart_1.png'], 'shadow file extracted for chart')

// 2. The default template embeds a faithful sheet table rendered natively via #render-univer-sheet
const source = api.resolvedItemSheetTypstSource(project, item)
assert.match(source, /#table\(/, 'emits a Typst table')
assert.match(source, /render-univer-sheet/, 'calls render-univer-sheet')
assert.match(source, /stroke: cell-stroke|show-gridlines/, 'keeps gridline strokes')
// The page setup is directly injected into the template as concrete Typst settings
// (#set page / #set text), without abstract variables.
assert.match(source, /#set page\(/, 'template declares the page')
assert.match(source, /paper: "a4"/, 'page paper is directly set without variable')
assert.match(source, /E-Estimate document settings: begin/, 'injects live document settings block')
assert.equal(
  /Final Quantity[\s\S]*Amount/.test(source),
  false,
  'default layout has no Final summary block'
)
assert.equal(
  /item-cells\(/.test(source),
  false,
  'no longer uses the thin data-dump cell builder'
)

// 3. Compile to a real PDF with in-memory shadow virtual files
const inputs = api.itemSheetCompileInputs(project, item)
const compiler = NodeCompiler.create({ workspace: root })

for (const [vpath, b64] of Object.entries(shadowFiles)) {
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  compiler.mapShadow(path.resolve(root, vpath), Buffer.from(clean, 'base64'))
}

let svg
let pdf
try {
  svg = compiler.svg({ mainFileContent: source, inputs })
  assert(svg.length > 0, 'SVG rendered')
  const text = svg.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
  assert(text.includes('Excavation in Bed of Canal'), 'item title in SVG')
  assert(text.includes('I. Reach 0 to 1 km'), 'row description in SVG')
  assert(text.includes('Assistant Engineer'), 'signatory in SVG')

  pdf = compiler.pdf({ mainFileContent: source, inputs })
  const auditApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts'), {})
  const audit = auditApi.preparePrintAudit(inputs)
  assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: source, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default item sheet satisfies current content obligations')
  assert(pdf.length > 4000, 'PDF rendered')
} finally {
  compiler.resetShadow()
}

console.log(`Item Typst (faithful sheet + images): all assertions passed (${pdf.length} bytes PDF compiled)`)

// 4. Test bidirectional parsing: does Document Setup know what changes were made in Typst code?
const docSettingsApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'), {})
const modifiedCode = `
// E-Estimate document settings: begin
#set page(
  paper: "a3",
  flipped: true,
  margin: (top: 12mm, right: 14mm, bottom: 12mm, left: 18mm)
)
#set text(font: ("Times New Roman", "Liberation Serif"), size: 11pt)
// E-Estimate document settings: end
`
const parsed = docSettingsApi.parseDocumentSettingsFromTypst(modifiedCode)
assert.equal(parsed.pageSize, 'A3', 'parses A3 paper size from code')
assert.equal(parsed.orientation, 'landscape', 'parses landscape orientation from flipped: true')
assert.equal(parsed.margins.top, 12, 'parses top margin from code')
assert.equal(parsed.margins.right, 14, 'parses right margin from code')
assert.equal(parsed.margins.left, 18, 'parses left margin from code')
assert.equal(parsed.fontSizePt, 11, 'parses font size from code')
assert.equal(parsed.fontFamily, 'times', 'parses times font family from code')
console.log('Bidirectional Document Setup parser: all assertions passed')

// 5. Test Univer Document item with itemdoc.typ
const docItem = {
  id: 'doc-item-1',
  name: 'Technical Specification & General Notes',
  itemCode: 'SPEC-01',
  itemDescription: 'Comprehensive technical specification and execution notes.',
  itemUnit: 'LS',
  unit: 'LS',
  itemEditorType: 'document',
  documentData: {
    id: 'doc_1',
    documentStyle: { textStyle: { ff: 'Arial', fs: 11 }, defaultTabStop: 48 },
    body: {
      dataStream: '1. SCOPE OF WORK\rThe contractor shall execute all excavation as per standard drawings.\r\b\r2. QUALITY CONTROL\rAll materials must conform to IS 456-2000.\r',
      textRuns: [
        { st: 0, ed: 16, ts: { bl: 1, fs: 12 } },
        { st: 17, ed: 87, ts: { it: 1 } },
        { st: 92, ed: 110, ts: { bl: 1, ul: { s: 1 } } }
      ],
      paragraphs: [
        { startIndex: 16, paragraphStyle: { spaceBelow: { v: 8 }, shading: { backgroundColor: { rgb: '#fffbe6' } } } },
        { startIndex: 87, paragraphStyle: { spaceBelow: { v: 12 } } },
        { startIndex: 89, paragraphStyle: { spaceBelow: { v: 6 } } },
        { startIndex: 110, paragraphStyle: { spaceBelow: { v: 6 } } },
        { startIndex: 154, paragraphStyle: { spaceBelow: { v: 10 } } }
      ],
      customBlocks: [
        { startIndex: 88, blockId: 'doc_img_1' }
      ]
    },
    drawings: {
      doc_img_1: {
        source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        title: 'Execution Detail',
        docTransform: {
          size: { width: 120, height: 80 }
        }
      }
    }
  }
}

assert.equal(api.itemSheetScopeKey(docItem), 'item-doc-doc-item-1', 'isolated document scope key')
const docTemplate = api.itemSheetTypstTemplate(project, docItem)
assert(docTemplate.includes('render-univer-doc'), 'uses itemdoc.typ with render-univer-doc')

const docSource = api.resolvedItemSheetTypstSource(project, docItem)
assert(docSource.includes('render-univer-doc'), 'resolved source includes render-univer-doc')
assert(docSource.includes('// E-Estimate document settings: begin'), 'has document settings block')

const docShadowFiles = api.itemSheetShadowFiles(docItem)
assert(Object.keys(docShadowFiles).some(k => k.includes('doc_img_1')), 'extracts document drawings into shadow files')

const docInputs = api.itemSheetCompileInputs(project, docItem)
const docCompiler = NodeCompiler.create({ workspace: root })

for (const [vpath, b64] of Object.entries(docShadowFiles)) {
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  docCompiler.mapShadow(path.resolve(root, vpath), Buffer.from(clean, 'base64'))
}

let docSvg
let docPdf
try {
  docSvg = docCompiler.svg({ mainFileContent: docSource, inputs: docInputs })
  assert(docSvg.length > 0, 'Document SVG rendered')
  const docText = docSvg.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
  assert(docText.includes('Technical Specification'), 'item title in SVG')
  assert(docText.includes('SCOPE OF WORK'), 'paragraph 1 heading in SVG')
  assert(docText.includes('The contractor shall execute'), 'paragraph 1 body in SVG')
  assert(docText.includes('QUALITY CONTROL'), 'paragraph 2 heading in SVG')

  docPdf = docCompiler.pdf({ mainFileContent: docSource, inputs: docInputs })
  assert(docPdf.length > 4000, 'Document PDF rendered')
} finally {
  docCompiler.resetShadow()
}

console.log(`Document Item Typst (itemdoc.typ + rich runs + drawings): all assertions passed (${docPdf.length} bytes PDF compiled)`)

// 5b. Univer paragraph geometry and list numbering must survive conversion.
const fidelityDoc = documentTypstApi.parseDocumentToTypstData({
  id: 'spacing-list-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 11 } },
  lists: {
    decimal: {
      listType: 'decimal',
      nestingLevel: [{
        bulletAlignment: 1,
        glyphFormat: '%1.',
        glyphType: 2,
        startNumber: 1,
        paragraphProperties: { indentStart: { v: 36 }, hanging: { v: 18 } }
      }]
    }
  },
  body: {
    dataStream: 'First\rSecond\r',
    textRuns: [{ st: 0, ed: 5, ts: { bg: { rgb: '#fff2a8' }, va: 3, sa: 1 } }],
    paragraphs: [
      { startIndex: 5, bullet: { listType: 'decimal', listId: 'list-1', nestingLevel: 0 }, paragraphStyle: { lineSpacing: 1.25 } },
      { startIndex: 12, bullet: { listType: 'decimal', listId: 'list-1', nestingLevel: 0 }, paragraphStyle: { spaceBelow: { v: 8 } } }
    ]
  }
})
assert.equal(fidelityDoc.paragraphs[0].listMarker, '1.', 'preserves first numbered-list marker')
assert.equal(fidelityDoc.paragraphs[1].listMarker, '2.', 'increments numbered-list marker')
assert.equal(fidelityDoc.paragraphs[0].indentStartPt, 27, 'preserves Univer paragraph indentation')
assert.equal(fidelityDoc.paragraphs[0].hangingPt, 13.5, 'preserves Univer hanging indentation')
assert.equal(fidelityDoc.paragraphs[0].lineSpacing, 1.25, 'preserves Univer line spacing')
assert.equal(fidelityDoc.paragraphs[1].spaceBelowPt, 6, 'preserves exact paragraph spacing')
assert.equal(fidelityDoc.paragraphs[0].runs[0].fontFamily, 'Arial', 'inherits document font family')
assert.equal(fidelityDoc.paragraphs[0].runs[0].sizePt, 11, 'inherits document font size')
assert.equal(fidelityDoc.paragraphs[0].runs[0].backgroundHex, '#fff2a8', 'preserves text highlight')
assert.equal(fidelityDoc.paragraphs[0].runs[0].baseline, 'superscript', 'preserves baseline offset')
console.log('Document paragraph spacing, indentation, and list numbering: all assertions passed')

// 5c. Univer's saved documents only carry custom lists, but bullets/numbered
// paragraphs are tagged with built-in preset IDs (BULLET_LIST, ORDER_LIST,
// ORDER_LIST_QUICK_*, CHECK_LIST, …). The converter must fall back to the
// @univerjs/core PRESET_LIST_TYPE map so those markers are rendered.
// In Univer, `paragraph.startIndex` is the position of the `\r` that closes
// the paragraph (i.e. `dataStream.length` for the last one).
const presetBulletDoc = documentTypstApi.parseDocumentToTypstData({
  id: 'preset-bullet-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 11 } },
  // NOTE: no `lists` field — the document references a built-in preset
  body: {
    dataStream: 'Earthwork\rConcrete\rSteelwork\r',
    paragraphs: [
      { startIndex: 9,  bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } },
      { startIndex: 18, bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } },
      { startIndex: 28, bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } }
    ]
  }
})
assert.equal(presetBulletDoc.paragraphs[0].listMarker, '●', 'preset BULLET_LIST resolves to its first-level glyph (●)')
assert.equal(presetBulletDoc.paragraphs[1].listMarker, '●', 'preset BULLET_LIST glyph repeats for each item')
assert.equal(presetBulletDoc.paragraphs[2].listMarker, '●', 'preset BULLET_LIST glyph on third item')

const presetOrderDoc = documentTypstApi.parseDocumentToTypstData({
  id: 'preset-order-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 11 } },
  body: {
    dataStream: 'General\rEarthwork\rMaterials\r',
    paragraphs: [
      { startIndex: 7,  bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } },
      { startIndex: 17, bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } },
      { startIndex: 27, bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } }
    ]
  }
})
assert.equal(presetOrderDoc.paragraphs[0].listMarker, '1.', 'preset ORDER_LIST starts with 1.')
assert.equal(presetOrderDoc.paragraphs[1].listMarker, '2.', 'preset ORDER_LIST increments to 2.')
assert.equal(presetOrderDoc.paragraphs[2].listMarker, '3.', 'preset ORDER_LIST increments to 3.')

const presetOrderLowerLetterDoc = documentTypstApi.parseDocumentToTypstData({
  id: 'preset-order-lower-letter-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 11 } },
  body: {
    dataStream: 'Excavation\rFilling\rCompaction\r',
    paragraphs: [
      { startIndex: 10, bullet: { listType: 'ORDER_LIST_QUICK_3', listId: 'ORDER_LIST_QUICK_3', nestingLevel: 0 } },
      { startIndex: 18, bullet: { listType: 'ORDER_LIST_QUICK_3', listId: 'ORDER_LIST_QUICK_3', nestingLevel: 0 } },
      { startIndex: 29, bullet: { listType: 'ORDER_LIST_QUICK_3', listId: 'ORDER_LIST_QUICK_3', nestingLevel: 0 } }
    ]
  }
})
assert.equal(presetOrderLowerLetterDoc.paragraphs[0].listMarker, 'a.', 'ORDER_LIST_QUICK_3 (a.) starts with a.')
assert.equal(presetOrderLowerLetterDoc.paragraphs[1].listMarker, 'b.', 'ORDER_LIST_QUICK_3 (a.) increments to b.')
assert.equal(presetOrderLowerLetterDoc.paragraphs[2].listMarker, 'c.', 'ORDER_LIST_QUICK_3 (a.) increments to c.')

const presetOrderRomanDoc = documentTypstApi.parseDocumentToTypstData({
  id: 'preset-order-roman-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 11 } },
  body: {
    dataStream: 'Step 1\rStep 2\rStep 3\r',
    paragraphs: [
      { startIndex: 6,  bullet: { listType: 'ORDER_LIST_QUICK_4', listId: 'ORDER_LIST_QUICK_4', nestingLevel: 0 } },
      { startIndex: 13, bullet: { listType: 'ORDER_LIST_QUICK_4', listId: 'ORDER_LIST_QUICK_4', nestingLevel: 0 } },
      { startIndex: 20, bullet: { listType: 'ORDER_LIST_QUICK_4', listId: 'ORDER_LIST_QUICK_4', nestingLevel: 0 } }
    ]
  }
})
assert.equal(presetOrderRomanDoc.paragraphs[0].listMarker, 'i.', 'ORDER_LIST_QUICK_4 (i.) starts with i.')
assert.equal(presetOrderRomanDoc.paragraphs[1].listMarker, 'ii.', 'ORDER_LIST_QUICK_4 (i.) increments to ii.')
assert.equal(presetOrderRomanDoc.paragraphs[2].listMarker, 'iii.', 'ORDER_LIST_QUICK_4 (i.) increments to iii.')

console.log('Univer preset bullet and order lists (BULLET_LIST, ORDER_LIST, ORDER_LIST_QUICK_*): all assertions passed')

// 5d. End-to-end: a Univer document with a preset bullet list and a preset
// ordered list must render the markers into the compiled PDF (not just be
// present in the intermediate JSON).
const presetListDocItem = {
  id: 'preset-list-doc-item',
  name: 'Material & Workmanship',
  itemCode: 'MW-1',
  itemDescription: 'General material and workmanship notes.',
  itemUnit: 'LS',
  unit: 'LS',
  itemEditorType: 'document',
  documentData: {
    id: 'preset-list-doc',
    documentStyle: { textStyle: { ff: 'Arial', fs: 11 }, defaultTabStop: 48 },
    // NOTE: no `lists` here — paragraphs reference built-in presets.
    // Univer strips the auto-generated "1. " / "a) " prefix from the stream
    // when a list is applied, so the stream contains only the body text.
    body: {
      dataStream: 'Earthwork\rConcrete\rSteelwork\rGeneral\rEarthwork\rMaterials\r',
      paragraphs: [
        { startIndex: 9,  bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } },
        { startIndex: 18, bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } },
        { startIndex: 28, bullet: { listType: 'BULLET_LIST', listId: 'BULLET_LIST', nestingLevel: 0 } },
        { startIndex: 36, bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } },
        { startIndex: 46, bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } },
        { startIndex: 56, bullet: { listType: 'ORDER_LIST', listId: 'ORDER_LIST', nestingLevel: 0 } }
      ]
    }
  }
}
const presetListSource = api.resolvedItemSheetTypstSource(project, presetListDocItem)
const presetListInputs = api.itemSheetCompileInputs(project, presetListDocItem)
assert(presetListInputs['ee-data'].includes('"listMarker":"●"'), 'inputs carry the bullet marker (●)')
assert(/"listMarker":"[123]\."/.test(presetListInputs['ee-data']), 'inputs carry 1./2./3. number markers')
const presetListCompiler = NodeCompiler.create({ workspace: root })
let presetListPdf
let presetListSvg
try {
  presetListSvg = presetListCompiler.svg({ mainFileContent: presetListSource, inputs: presetListInputs })
  const presetListText = presetListSvg.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ')
  assert(presetListText.includes('●'), 'bullet glyph (●) rendered in compiled SVG')
  assert(presetListText.includes('1.') && presetListText.includes('2.') && presetListText.includes('3.'),
    'numbered list markers 1. 2. 3. rendered in compiled SVG')
  presetListPdf = presetListCompiler.pdf({ mainFileContent: presetListSource, inputs: presetListInputs })
  assert(presetListPdf.length > 4000, 'preset list PDF rendered')
} finally {
  presetListCompiler.resetShadow()
}
console.log(`Univer preset list end-to-end PDF: all assertions passed (${presetListPdf.length} bytes PDF compiled)`)

const tableStream = '\x1a\x1b\x1cA\r\x1d\x1cB\r\x1d\x1e\x1b\x1c10\r\x1d\x1c20\r\x1d\x1e\x1f'
const tableDocumentData = {
  id: 'table-doc',
  documentStyle: { textStyle: { ff: 'Arial', fs: 10 } },
  tableSource: {
    quantities: {
      tableId: 'quantities', align: 1, indent: { v: 0 }, textWrap: 0,
      position: {}, dist: {}, size: { type: 0, width: { v: 200 } },
      tableColumns: [{ size: { type: 1, width: { v: 100 } } }, { size: { type: 1, width: { v: 100 } } }],
      tableRows: [
        { trHeight: { val: { v: 20 }, hRule: 0 }, tableCells: [{ backgroundColor: { rgb: '#eeeeee' } }, {}] },
        { trHeight: { val: { v: 20 }, hRule: 0 }, tableCells: [{}, {}] }
      ]
    }
  },
  body: {
    dataStream: tableStream,
    textRuns: [], paragraphs: [],
    tables: [{ startIndex: 0, endIndex: tableStream.length - 1, tableId: 'quantities' }]
  }
}
const parsedTableDoc = documentTypstApi.parseDocumentToTypstData(tableDocumentData)
assert.equal(parsedTableDoc.paragraphs[0].table.rows[0].cells[0].text, 'A', 'reads first Univer table cell')
assert.equal(parsedTableDoc.paragraphs[0].table.rows[1].cells[1].text, '20', 'reads last Univer table cell')
const tableItem = { ...docItem, id: 'table-item', documentData: tableDocumentData }
const tableCompiler = NodeCompiler.create({ workspace: root })
let tablePdf
try {
  tablePdf = tableCompiler.pdf({
    mainFileContent: api.resolvedItemSheetTypstSource(project, tableItem),
    inputs: api.itemSheetCompileInputs(project, tableItem)
  })
  assert(tablePdf.length > 4000, 'Univer document table compiles through Typst')
} finally {
  tableCompiler.resetShadow()
}
console.log(`Document table structure: all assertions passed (${tablePdf.length} bytes PDF compiled)`)

// 6. Test Spreadsheet Final Cell Gate & Expansion
const finalNumberMod = loadTsModule(path.join(root, 'src/renderer/src/lib/finalNumber.ts'), {
  './univerSpreadsheet': { isUniverWorkbookData: () => false },
  './documentFinal': { resolveDocumentFinal: () => ({ value: null }) },
  './projectItems': { rateAnalysisOverrideForNode: () => null, projectItemGroupIndex: () => new Map(), projectItemKey: () => '' },
  './leadApplications': { scopedLeadRateAddition: () => 0 },
  './rateAnalysis': { calculateRateAnalysis: () => ({ ratePerUnit: 0 }) }
})
const { isFinalCellInPrintRange, expandRangeToIncludeFinalCell } = finalNumberMod

const testRange = { startRow: 0, startColumn: 0, endRow: 5, endColumn: 3 }
assert.equal(isFinalCellInPrintRange(testRange, { row: 2, column: 2 }), true, 'final cell is inside print range')
assert.equal(isFinalCellInPrintRange(testRange, { row: 8, column: 2 }), false, 'final cell row outside print range is gated')
assert.equal(isFinalCellInPrintRange(testRange, { row: 2, column: 5 }), false, 'final cell col outside print range is gated')
assert.equal(isFinalCellInPrintRange(testRange, null), true, 'no gate when final cell is null')

const expanded = expandRangeToIncludeFinalCell(testRange, { row: 8, column: 5 })
assert.deepEqual(expanded, { startRow: 0, startColumn: 0, endRow: 8, endColumn: 5 }, 'expands range to include final cell')
console.log('Spreadsheet Final Cell Gate: all assertions passed')
