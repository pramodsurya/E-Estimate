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

function grid(cells, cols, opts = {}) {
  return {
    cells,
    merges: opts.merges ?? [],
    colWidthsChars: cols,
    rowHeightsPt: cols.map(() => null),
    images: opts.images ?? [],
    rowBreaks: []
  }
}

async function runTests() {
  console.log('--- Testing stacked Detailed_<name> component sheet ---')

  const componentExcel = loadTsModule(
    path.join(root, 'src/renderer/src/lib/excel-output/componentExcel.ts'),
    {
      '../typist-output/componentTypst': {},
      '../typist-output/documentTypst': {}
    }
  )

  // Two printable details with a template-covered null slot between them.
  const details = [
    {
      name: 'Earthwork',
      grid: grid(
        [
          { r: 0, c: 0, value: 'Cutting' },
          { r: 1, c: 0, value: 10, formula: '=A1*2' }
        ],
        [20, 14]
      ),
      qtyRef: { r: 1, c: 0 },
      formulaVerdicts: []
    },
    null,
    {
      name: 'Pitching',
      grid: grid([{ r: 0, c: 0, value: 'Stone', style: { wrap: true } }], [30]),
      qtyRef: null,
      formulaVerdicts: []
    }
  ]
  const headers = [
    { code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Earthwork in excavation' },
    { code: '', name: 'Template bund', unit: '', description: '' },
    { code: 'SSR-02', name: 'Stone Pitching', unit: 'sqm', description: 'Stone Pitching' }
  ]

  const detailed = componentExcel.buildComponentDetailedSheet('Main Canal', headers, details)
  assert.ok(detailed, 'printable details must stack')
  assert.equal(detailed.name, 'Detailed_Main Canal')

  const texts = detailed.grid.cells.map((c) => c.value)
  const byValue = (v) => detailed.grid.cells.find((c) => c.value === v)
  // STANDARD DATA book layout: narrow A, code across A:B, Unit at right,
  // description directly below across the width, then Univer at B.
  const codeCell = byValue('SSR-01')
  assert.ok(codeCell && codeCell.r === 0 && codeCell.c === 0, 'code starts in column A')
  assert.deepEqual(
    codeCell.style,
    { bold: true, sizePt: 10, fontName: 'Trebuchet MS', align: 'left' },
    'code is Trebuchet 10 bold like the reference book'
  )
  assert.equal(byValue('Unit: cum').r, 0, 'unit sits right of the code row')
  assert.deepEqual(detailed.grid.colWidthsChars.slice(0, 2), [5.5, 30], 'narrow A precedes the shared Univer column width')
  assert.ok(
    detailed.grid.merges.some((m) => m.r1 === 0 && m.c1 === 0 && m.r2 === 0 && m.c2 === 1),
    'code merges across A:B'
  )
  const descCell = byValue('Earthwork in excavation')
  assert.ok(descCell && descCell.r === 1 && descCell.c === 0, 'description starts below code in column A')
  assert.equal(descCell.style.wrap, true, 'description wraps')
  assert.equal(descCell.style.fontName, 'Trebuchet MS', 'description is Trebuchet like the book')
  assert.ok(!descCell.style.bold, 'description is regular, not bold')
  assert.deepEqual(
    detailed.grid.rowHeightsPt.slice(0, 2),
    [15.75, 16.5],
    'code row and wrapped description row use fitted heights'
  )
  assert.ok(texts.includes('Cutting'), 'print-area cells follow in order')
  assert.ok(byValue('SSR-02'), 'second block stacks after the first')
  assert.equal(
    texts.filter((v) => v === 'Stone Pitching').length,
    1,
    'name shown once when description equals the name'
  )
  assert.ok(!texts.some((v) => v === 'Template bund'), 'null slots are skipped')

  // Qty refs remap into stacked coordinates: code r0, desc r1, grid starts r2/B.
  assert.deepEqual(detailed.qtyRefs[0], { r: 3, c: 1 })
  const finalCell = detailed.grid.cells.find((c) => c.r === 3 && c.c === 1)
  assert.equal(finalCell.style.bgRgb, 'FFF2CC', 'fixed final cell is highlighted')
  assert.equal(detailed.qtyRefs[1], null)
  assert.equal(detailed.qtyRefs[2], null, 'document detail without qtyRef stays static')
  assert.equal(detailed.grid.rowBreaks.length, 0, 'no forced breaks — Excel paginates automatically')

  const richDetailed = componentExcel.buildComponentDetailedSheet(
    'Rich Description',
    [{
      code: 'R-1', name: 'Rich', unit: 'cum', description: 'Bold and italic',
      descriptionRuns: [
        { text: 'Bold\n', style: { bold: true, fontName: 'Trebuchet MS', sizePt: 10 } },
        { text: 'and italic', style: { italic: true, fontName: 'Trebuchet MS', sizePt: 10 } }
      ]
    }],
    [{ ...details[0], landscape: false }]
  )
  const richDescription = richDetailed.grid.cells.find((c) => c.r === 1 && c.c === 0)
  assert.equal(richDescription.runs.map((run) => run.text).join(''), 'Bold and italic', 'embedded newlines become automatic wrap')
  assert.equal(richDescription.runs[0].style.bold, true, 'rich bold styling is retained')
  assert.equal(richDescription.runs[1].style.italic, true, 'rich italic styling is retained')
  assert.equal(richDetailed.landscape, false, 'portrait item setting carries to the combined Detailed sheet')

  // Document finals become real Excel cells so the same formula chain works
  // for spreadsheet and document item details.
  const documentDetails = componentExcel.buildComponentDetailSheets([
    {
      kind: 'document',
      doc: {
        paragraphs: [{ align: 'left', runs: [{ text: '12.5' }], sourceStartIndex: 10, sourceEndIndex: 14 }],
        floatingImages: []
      },
      documentFinal: { startIndex: 10, endIndex: 14, value: 12.5, text: '12.5' },
      sheetNameHint: 'Document item'
    }
  ])
  assert.deepEqual(documentDetails[0].qtyRef, { r: 0, c: 0 })
  assert.equal(documentDetails[0].grid.cells.find((c) => c.r === 0 && c.c === 0).value, 12.5)
  const stackedDocument = componentExcel.buildComponentDetailedSheet(
    'Document Component',
    [{ code: 'DOC-1', name: 'Document item', unit: 'cum', description: '' }],
    documentDetails
  )
  assert.ok(stackedDocument)
  assert.ok(stackedDocument.qtyRefs[0], 'document final quantity remaps into the combined Detailed sheet')

  const inlineDocument = componentExcel.buildComponentDetailSheets([
    {
      kind: 'document',
      doc: {
        paragraphs: [{ align: 'left', runs: [{ text: 'Adopted quantity: 12.5 cum' }], sourceStartIndex: 10, sourceEndIndex: 36 }],
        floatingImages: []
      },
      documentFinal: { startIndex: 28, endIndex: 32, value: 12.5, text: '12.5' },
      sheetNameHint: 'Inline document final'
    }
  ])[0]
  assert.equal(
    inlineDocument.grid.cells.find((c) => c.r === 0 && c.c === 0).runs.map((run) => run.text).join(''),
    'Adopted quantity: 12.5 cum',
    'surrounding document wording is retained'
  )
  assert.deepEqual(inlineDocument.qtyRef, { r: 0, c: 1 }, 'numeric substring lands on the same converted row')
  assert.equal(inlineDocument.grid.cells.find((c) => c.r === 0 && c.c === 1).value, 12.5)

  const mixedOrientation = componentExcel.buildComponentDetailedSheet(
    'Mixed orientation',
    headers.slice(0, 2),
    [{ ...details[0], landscape: false }, { ...details[2], landscape: true }]
  )
  assert.equal(mixedOrientation.landscape, true, 'any wide item makes the one combined sheet landscape')

  // Abstract quantities point into the stacked sheet at the remapped cells.
  const renderData = {
    project: 'Kodangal Project',
    component: { name: 'Main Canal', code: 'CMP-01', isSubcomponent: false, totalCost: 2000 },
    abstract: [
      { sl: '1', code: 'SSR-01', heading: 'Earthwork', description: '', rawQty: 10, unit: 'cum', rawRate: 100, rawAmount: 1000 },
      { sl: '2', code: 'SSR-02', heading: 'Stone Pitching', description: '', rawQty: 5, unit: 'sqm', rawRate: 200, rawAmount: 1000 }
    ],
    items: [],
    signature: []
  }
  const payload = componentExcel.buildComponentExcelPayload(renderData, details, detailed)
  assert.equal(payload.abstractRows[0].qtyFormula, "='Detailed_Main Canal'!B4")
  assert.equal(payload.abstractRows[1].qtyFormula, null, 'no qtyRef, no formula — never a wrong reference')
  assert.deepEqual(payload.detailSheets, [], 'stacked sheet replaces per-item sheets')
  assert.equal(payload.detailedSheet.name, 'Detailed_Main Canal')
  assert.ok(payload.detailedSheet.grid.cells.length > 0)

  // Header resolution: node first, Abstract direct row as fallback.
  assert.deepEqual(
    componentExcel.resolveDetailedHeaders([
      {
        itemCode: '', displayName: '', unit: null, itemDescription: '',
        abstractCode: 'SSR-01', abstractHeading: 'Earthwork', abstractUnit: 'cum', abstractDescription: 'Cutting soil'
      },
      {
        itemCode: 'O-1', displayName: 'Extra', unit: 'lot', itemDescription: 'Node text',
        abstractCode: 'X', abstractHeading: 'Y', abstractUnit: 'Z', abstractDescription: 'W'
      }
    ]),
    [
      { code: 'SSR-01', name: 'Earthwork', unit: 'cum', description: 'Cutting soil' },
      { code: 'O-1', name: 'Extra', unit: 'lot', description: 'Node text' }
    ]
  )

  // All-null details: null stacked sheet, legacy per-item path untouched.
  assert.equal(componentExcel.buildComponentDetailedSheet('X', [], [null, null]), null)
  const legacy = componentExcel.buildComponentExcelPayload(renderData, details, null)
  assert.equal(legacy.detailedSheet, null)
  assert.equal(legacy.detailSheets.length, 2)
  assert.equal(legacy.abstractRows[0].qtyFormula, "='Earthwork'!A2")

  console.log('stacked detailed sheet tests passed')
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
