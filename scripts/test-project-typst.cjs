const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

function pdfContains(pdf, needle) {
  const latin = Buffer.isBuffer(pdf) ? pdf.toString('latin1') : String(pdf)
  if (latin.includes(needle)) return true
  const re = /stream\r?\n([\s\S]*?)\rendstream/g
  let match
  while ((match = re.exec(latin))) {
    const raw = Buffer.from(match[1], 'latin1')
    for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
      try {
        const text = inflate(raw).toString('latin1')
        if (text.includes(needle)) return true
      } catch {
        // not this filter
      }
    }
  }
  return false
}

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/typist-output/project.typ'),
  'utf8'
)
const univerComponent = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/typist-output/univerComponent.typ'),
  'utf8'
)
const componentTypstSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/typist-output/componentTypst.ts'),
  'utf8'
)
assert.match(
  componentTypstSource,
  /\(isBund \|\| isGuideWall\) && savedTypstSource[\s\S]*?ensureTemplateExternalItems\(source, renderData\)/,
  'saved component templates must dynamically include external items added later'
)
assert.match(
  componentTypstSource,
  /not item\.at\("templateGenerated", default: false\)[\s\S]*?#render-component-item\(item\)/,
  'the template external-item loop must exclude generated measurement items'
)
const externalItemsLoop = /const EXTERNAL_ITEMS_LOOP = `[\s\S]*?`/.exec(componentTypstSource)?.[0] ?? ''
assert.doesNotMatch(
  externalItemsLoop,
  /#pagebreak/,
  'external component items must flow instead of forcing every item onto a new page'
)

const prelude = `
#let signature-cells(rows) = {
  let cells = ()
  for signatory in rows {
    cells.push([
      #text(weight: "bold")[#signatory.designation]
      #linebreak()
      #signatory.office
    ])
  }
  cells
}
#let signature-footer(rows) = if rows.len() > 0 {
  block(width: 100%, height: 1fr, breakable: false)[#align(bottom)[
    #line(length: 100%, stroke: 0.65pt)
    #v(3mm)
    #grid(columns: (1fr,) * rows.len(), gutter: 10mm, align: center,
      ..rows.map(signatory => [
        #v(11mm)
        #line(length: 82%, stroke: 0.7pt)
        #v(2mm)
        #text(9pt, weight: "bold")[#signatory.designation]
        #if signatory.office != "" [#linebreak() #text(8pt)[#signatory.office]]
      ]))
  ]]
}
#let render-markup(t) = if t == none or t == "" { [] } else { [#t] }
#let render-description(item) = [#item.at("description", default: "")]
#let render-univer-sheet(data, repeat-header-rows: 0, show-gridlines: true, range-override: none, images: none) = []
#let render-univer-doc(data) = []
${univerComponent}
`

const payload = {
  layout_kind: 'general-abstract',
  project: 'Restoration of Mallampet Tank',
  year: '2025-26',
  zone: 'Zone I',
  village: 'Mallampet',
  mandal: 'Dharur',
  district: 'Vikarabad',
  synced: true,
  title: 'GENERAL ABSTRACT OF ESTIMATE',
  lines: [
    { sl: '1', label: 'Earthwork Embankment', amount: '10,00,000.00', kind: 'component', basis: '' },
    { sl: '', label: 'TOTAL', amount: '10,00,000.00', kind: 'total', basis: '' },
    { sl: '2', label: 'Add Seigniorage charges', amount: '12,000.00', kind: 'charge', basis: '' },
    { sl: '3', label: 'LS Add G.S.T @ 18%', amount: '1,82,160.00', kind: 'gst', basis: '18% of Total + charges' },
    { sl: '', label: 'GRAND TOTAL', amount: '11,94,160.00', kind: 'grand', basis: '' }
  ],
  pages: [{ id: 'p1', name: 'Introduction' }],
  signature: [{ designation: 'Executive Engineer', office: 'Irrigation Circle' }],
  summary: {
    components: '10,00,000.00',
    charges: '12,000.00',
    miscellaneous: '0.00',
    gst: '1,82,160.00',
    gst_rate: '18',
    grand_total: '11,94,160.00'
  },
  tax: {
    gst_rate: '18',
    earthwork_percent: '82.00',
    earthwork_predominant: true,
    gst_note: 'Predominant earthwork GST slab'
  }
}

assert.equal(source.includes('#for (index, comp) in EE.at("components"'), false, 'project.typ must not loop components')
assert.equal(source.includes('#render-project-component'), false, 'project.typ must not render components')
assert.equal(source.includes('render-component-item(item)'), false, 'project.typ must not print component items')
assert(source.includes('counter(page)'), 'book chrome must number pages')
assert(source.includes('GENERAL ABSTRACT'), 'template is the General Abstract')

const compiler = NodeCompiler.create({ workspace: root })
const pdf = compiler.pdf({
  mainFileContent: prelude + '\n' + source,
  inputs: { 'ee-data': JSON.stringify(payload) }
})

assert(pdf?.length > 8_000, 'project Typst (General Abstract only) must compile')

const out = path.join(root, 'tmp/pdfs/project-typst.pdf')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, pdf)
console.log(`Project Typst abstract passed (${pdf.length} bytes)`)

function loadBookApi() {
  const filePath = path.join(root, 'src/renderer/src/lib/typist-output/projectPrintBook.ts')
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  const mocks = {
    '../projectPrintInputs': {
      computeProjectPrintInputs: () => ({ recipes: {}, rateOf: () => undefined, seigniorage: { rows: [] } })
    },
    '../dataSheets': {
      collectDataSheets: () => []
    },
    '../dataSheetPrint': {
      buildDataFigureBundle: async () => ({ shadowFiles: {}, figurePaths: {} })
    },
    './coverTypst': {
      COVER_STUDIO_SCOPE: 'front-cover',
      coverCompileInputs: () => ({ 'ee-cover': JSON.stringify({ estimated_cost: '₹ 1 Cr' }) }),
      coverShadowFiles: () => ({
        'telangana-emblem.svg': Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#155d45"/></svg>'
        ).toString('base64')
      }),
      resolvedCoverTypstSource: () =>
        '#let Cover = json(bytes(sys.inputs.at("ee-cover")))\n#image("telangana-emblem.svg", width: 10mm)\n= Cover\n#Cover.estimated_cost\n'
    },
    './itemTypst': {
      EE_ITEM_TABLE_PRELUDE: '',
      itemSheetCompileInputs: () => ({ 'ee-data': '{}' }),
      itemSheetShadowFiles: () => ({}),
      itemSheetTypstTemplate: () => '= Page\n',
      resolveItemSheetDocumentSettings: () => ({}),
      itemSheetScopeKey: (node) => `item-sheet-${node.id}`
    },
    './documentSettings': {
      applyDocumentSettingsToTypst: (src) => src
    },
    './componentTypst': {
      resolveComponentPrintPart: (project, node, _recipes, _rateOf, options) => ({
        scopeKey: `component-${node.id}`,
        label: node.name,
        source:
          project.printStudioDocuments?.[`component-${node.id}`] ??
          '#let EE = json(bytes(sys.inputs.at("ee-data")))\n#for item in EE.items [#render-component-item(item)]\n',
        compilePrelude: '',
        compileInputs: {
          'ee-data': JSON.stringify({
            component: { name: node.name },
            items: [],
            itemScope: options?.itemScope ?? 'all'
          })
        },
        shadowFiles: {}
      })
    },
    './dataTypst': {
      dataSheetsCompileInputs: () => ({ 'ee-data': '{}' }),
      dataSignatureSettings: () => ({ enabled: false, rows: [] }),
      resolvedDataTypstSource: () => '#let DataBook = json(bytes(sys.inputs.at("ee-data")))\n= DATA\n'
    },
    './leadTypst': {
      leadCompileInputs: () => ({ 'ee-data': '{}' }),
      leadCompileSource: (value) => value,
      leadMapCaptureFromProject: () => null,
      leadMapShadowFilesFromProject: () => ({}),
      resolvedLeadTypstSource: () => '#let Lead = json(bytes(sys.inputs.at("ee-data")))\n= LEAD\n'
    },
    './seigniorageTypst': {
      resolvedSeigniorageTypstSource: () => '#let Seigniorage = json(bytes(sys.inputs.at("ee-data")))\n= SEIGNIORAGE\n',
      seigniorageCompileInputs: () => ({ 'ee-data': '{}' })
    },
    './projectTypst': {
      PROJECT_ABSTRACT_SCOPE: 'general-abstract',
      projectCompileInputs: () => ({ 'ee-data': JSON.stringify(payload) }),
      projectCompilePrelude: () => prelude,
      resolvedProjectTypstSource: () => source
    }
  }
  loaded.require = (request) => {
    if (request in mocks) return mocks[request]
    throw new Error(`Unexpected import in projectPrintBook test: ${request}`)
  }
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const bookApi = loadBookApi()
const {
  remapSysInputBindings,
  uniquePartInputKey,
  assembleProjectBookFromParts,
  typstSourcePrintsChildItems,
  collectProjectTypstParts,
  aliasShadowPathForIncludedPart,
  upgradeLegacyTypstApis
} = bookApi

assert.equal(aliasShadowPathForIncludedPart('telangana-emblem.svg'), 'parts/telangana-emblem.svg')
assert.equal(aliasShadowPathForIncludedPart('images/chart_1.png'), 'parts/images/chart_1.png')
assert.equal(aliasShadowPathForIncludedPart('parts/telangana-emblem.svg'), null)
assert.equal(aliasShadowPathForIncludedPart('../escape.svg'), null)
assert.equal(
  upgradeLegacyTypstApis('#image.decode(bytes("old.png"))'),
  '#image(bytes("old.png"))',
  'legacy image.decode is upgraded only in the compile copy'
)

assert.equal(uniquePartInputKey('ee-data', 'component-c1'), 'ee-part-component-c1')
assert.equal(uniquePartInputKey('ee-cover', 'front-cover'), 'ee-part-front-cover')
assert.equal(uniquePartInputKey('ee-bund', 'component-c1'), 'ee-bund-component-c1')

const remapped = remapSysInputBindings(
  '#let EE = json(bytes(sys.inputs.at("ee-data")))\n#let Bund = json(bytes(sys.inputs.at("ee-bund")))',
  { 'ee-data': 'ee-part-component-c1', 'ee-bund': 'ee-bund-component-c1' }
)
assert(remapped.includes('json("ee-part-component-c1.json")'), 'ee-data remapped to part JSON file')
assert(remapped.includes('json("ee-bund-component-c1.json")'), 'ee-bund remapped to part JSON file')
assert.equal(remapped.includes('sys.inputs.at("ee-data")'), false, 'original ee-data gone')

const remappedDefault = remapSysInputBindings(
  '#let EE = json(bytes(sys.inputs.at("ee-data", default: "{}")))\n#let Cover = json.decode(sys.inputs.at("ee-cover"))',
  { 'ee-data': 'ee-part-general-abstract', 'ee-cover': 'ee-part-front-cover' }
)
assert(remappedDefault.includes('json("ee-part-general-abstract.json")'), 'default: at() remapped')
assert(remappedDefault.includes('json("ee-part-front-cover.json")'), 'json.decode cover remapped')
assert.equal(remappedDefault.includes('ee-data'), false, 'unmapped ee-data must not remain')

assert(typstSourcePrintsChildItems('#for (index, item) in EE.items.enumerate() [\n  #render-component-item(item)\n]'))
assert.equal(typstSourcePrintsChildItems('= Component\nNo items here.'), false)

const savedComponent = `#let EE = json(bytes(sys.inputs.at("ee-data")))
= #EE.component.name
#EE.component.totalFormatted
`

const book = assembleProjectBookFromParts(
  [
    {
      id: 'front-cover',
      label: 'Cover',
      kind: 'cover',
      source:
        '#let Cover = json(bytes(sys.inputs.at("ee-cover")))\n#image("telangana-emblem.svg", width: 10mm)\n= Cover\n#Cover.estimated_cost\n',
      prelude: '',
      inputs: { 'ee-cover': JSON.stringify({ estimated_cost: '₹ 1 Cr' }) },
      shadowFiles: {
        'telangana-emblem.svg': Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#155d45"/></svg>'
        ).toString('base64')
      }
    },
    {
      id: 'general-abstract',
      label: 'General Abstract',
      kind: 'abstract',
      source,
      prelude,
      inputs: { 'ee-data': JSON.stringify(payload) }
    },
    {
      id: 'component-c1',
      label: 'Earthwork',
      kind: 'component',
      source: savedComponent,
      prelude: '',
      inputs: {
        'ee-data': JSON.stringify({
          component: { name: 'Earthwork Embankment', totalFormatted: '10,00,000.00' }
        })
      },
      shadowFiles: {
        'images/chart_1.png': Buffer.from('png').toString('base64')
      }
    }
  ],
  'Restoration of Mallampet Tank'
)

assert(book.mainContent.includes('#include "parts/front-cover.typ"'), 'wrapper includes cover')
assert(book.mainContent.includes('#include "parts/general-abstract.typ"'), 'wrapper includes abstract')
assert(book.mainContent.includes('#include "parts/component-c1.typ"'), 'wrapper includes component')
assert(book.mainContent.includes('#set page(numbering: none)'), 'front cover is unnumbered')
assert(book.mainContent.includes('#counter(page).update(1)'), 'numbering restarts after the cover')
assert(book.mainContent.includes('[INDEX]'), 'wrapper inserts an index after the cover')
assert(book.mainContent.includes('ee-index-row("General Abstract"'), 'index lists the abstract')
assert(book.mainContent.includes('ee-index-row("Earthwork"'), 'index lists component parts')
assert.equal(book.mainContent.includes('pdf-lib'), false)
assert(book.inputs['ee-part-front-cover'])
assert(book.inputs['ee-part-general-abstract'])
assert(book.inputs['ee-part-component-c1'])
assert.equal(Object.prototype.hasOwnProperty.call(book.inputs, 'ee-data'), false, 'shared ee-data must not collide')
assert(
  book.inputs['ee-part-general-abstract'].includes('Restoration of Mallampet Tank'),
  'abstract input JSON carries the project name'
)
assert(
  book.inputs['ee-part-front-cover'].includes('1 Cr'),
  'cover input JSON carries estimated cost'
)
const abstractJsonFile = Buffer.from(book.shadowFiles['parts/ee-part-general-abstract.json'], 'base64').toString('utf8')
assert(
  abstractJsonFile.includes('Restoration of Mallampet Tank'),
  'abstract JSON shadow file next to parts/*.typ contains the project name'
)
assert(
  book.shadowFiles['ee-part-general-abstract.json'] === book.shadowFiles['parts/ee-part-general-abstract.json'],
  'JSON binding also available at temp root'
)
assert(book.shadowFiles['telangana-emblem.svg'], 'cover emblem kept at temp root')
assert(
  book.shadowFiles['parts/telangana-emblem.svg'],
  'cover emblem also aliased under parts/ for #include relative resolution'
)
assert.equal(
  book.shadowFiles['telangana-emblem.svg'],
  book.shadowFiles['parts/telangana-emblem.svg']
)
assert(book.shadowFiles['images/chart_1.png'], 'item/component image kept at original key')
assert(book.shadowFiles['parts/images/chart_1.png'], 'item/component image also aliased under parts/')

const bookCompiler = NodeCompiler.create({ workspace: root })
for (const [vpath, payloadB64] of Object.entries(book.shadowFiles)) {
  const bytes = Buffer.from(payloadB64, 'base64')
  if (vpath.endsWith('.typ')) {
    const text = bytes.toString('utf8')
    if (vpath.includes('component-c1') && vpath.endsWith('.typ')) {
      assert(text.includes('json("ee-part-component-c1.json")'), 'component part remaps ee-data to JSON file')
      assert.equal(text.includes('sys.inputs.at("ee-data")'), false, 'saved component Typst must not keep unmapped ee-data')
      assert(text.includes('Earthwork') || text.includes('EE.component'), 'component saved source is in the part')
    }
    if (vpath.includes('general-abstract') && vpath.endsWith('.typ')) {
      assert(text.includes('json("ee-part-general-abstract.json")'), 'abstract part remaps ee-data to JSON file')
      assert.equal(text.includes('sys.inputs.at("ee-data")'), false, 'abstract must not keep unmapped ee-data')
    }
    if (vpath.includes('front-cover') && vpath.endsWith('.typ')) {
      assert(text.includes('json("ee-part-front-cover.json")'), 'cover part remaps ee-cover to JSON file')
      assert(text.includes('#image("telangana-emblem.svg"'), 'cover part keeps relative emblem path')
    }
  }
  bookCompiler.mapShadow(path.join(root, vpath), bytes)
}

const bookPdf = bookCompiler.pdf({
  mainFileContent: book.mainContent,
  inputs: book.inputs
})
assert(bookPdf?.length > 8_000, 'project book wrapper must compile in one pass')
const bookOut = path.join(root, 'tmp/pdfs/project-book-typst.pdf')
fs.writeFileSync(bookOut, bookPdf)
assert(
  pdfContains(bookPdf, 'Restoration of Mallampet Tank') ||
    pdfContains(bookPdf, 'Mallampet') ||
    pdfContains(bookPdf, 'GENERAL ABSTRACT'),
  'compiled book PDF must contain bound project/abstract text, not empty chrome'
)
assert(
  pdfContains(bookPdf, '1 Cr') || pdfContains(bookPdf, 'Earthwork'),
  'compiled book PDF must contain cover cost or component name'
)
console.log(`Project book assembly passed (${bookPdf.length} bytes)`)

const stubProject = {
  id: 'p1',
  meta: { name: 'Mallampet Tank', sorYear: '2025-26', sorZone: 'zone_1' },
  root: {
    id: 'root',
    kind: 'title',
    name: 'Mallampet Tank',
    children: [
      { id: 'cover', kind: 'page', pageTemplate: 'front', name: 'Front cover', children: [] },
      {
        id: 'c1',
        kind: 'component',
        name: 'Earthwork',
        children: [
          { id: 'item-1', kind: 'item', name: 'Excavation', children: [] }
        ]
      }
    ]
  },
  printStudioDocuments: {
    'component-c1': `${savedComponent}
#for item in EE.items [
  #render-component-item(item)
]
`
  }
}

const collected = collectProjectTypstParts(stubProject)
const kinds = collected.map((part) => part.kind)
assert(kinds.includes('cover'), 'collector includes cover')
assert(kinds.includes('abstract'), 'collector includes abstract')
assert(kinds.includes('component'), 'collector includes component saved source')
assert.deepEqual(
  kinds.slice(-3),
  ['lead', 'seigniorage', 'data'],
  'project book ends with Lead, Seigniorage, then DATA'
)
const componentPart = collected.find((part) => part.kind === 'component')
assert(componentPart.source.includes('EE.component.name'), 'uses saved component Typst')
assert.equal(
  collected.some((part) => part.kind === 'item'),
  false,
  'does not emit items separately when component Typst already prints items'
)
const assembled = assembleProjectBookFromParts(collected, stubProject.meta.name)
assert(assembled.mainContent.includes('#include "parts/front-cover.typ"'))
assert(assembled.mainContent.includes('#include "parts/general-abstract.typ"'))
assert(assembled.mainContent.includes('#include "parts/component-c1.typ"'))
assert(assembled.shadowFiles['telangana-emblem.svg'], 'collector keeps root emblem key')
assert(
  assembled.shadowFiles['parts/telangana-emblem.svg'],
  'collector aliases emblem under parts/ for included cover.typ'
)
console.log(`Project book collector passed (${collected.length} parts)`)

const mixedTemplateProject = {
  ...stubProject,
  root: {
    ...stubProject.root,
    children: [{
      id: 'bund-1',
      kind: 'component',
      name: 'Bund',
      children: [
        { id: 'generated-qty', kind: 'item', name: 'Bund quantity', templateGenerated: true, children: [] },
        { id: 'manual-extra', kind: 'item', name: 'External item', children: [] }
      ]
    }]
  },
  printStudioDocuments: { 'component-bund-1': '= Bund template pages\n' }
}
const mixedParts = collectProjectTypstParts(mixedTemplateProject)
const separateItems = mixedParts.filter((part) => part.kind === 'item')
assert.deepEqual(
  separateItems.map((part) => part.id),
  ['item-sheet-manual-extra'],
  'template-generated items stay owned by the component; only external items become separate pages'
)

// Audit the exact JSON-file input path used by included book parts, with duplicate values in distinct scopes.
const auditFile = path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts')
const auditModule = new Module(auditFile, module)
auditModule._compile(ts.transpileModule(fs.readFileSync(auditFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, auditFile)
const auditApi = auditModule.exports
const auditBook = assembleProjectBookFromParts(['first', 'second'].map(id => ({
  id, label: id, kind: 'abstract', source, prelude, inputs: { 'ee-data': JSON.stringify(payload) }
})), 'Audit book')
const prepared = auditApi.preparePrintAudit(auditBook.inputs)
for (const [name, value] of Object.entries(auditApi.auditShadowFiles(prepared.inputs, auditBook.shadowFiles))) {
  compiler.mapShadow(path.join(root, name), Buffer.from(value, 'base64'))
}
const bookMarkers = compiler.query({ mainFileContent: auditBook.mainContent, inputs: prepared.inputs }, { selector: 'metadata', field: 'value' })
assert.equal(prepared.obligations.length, payload.lines.length * 2)
assert.deepEqual(auditApi.auditPrintContent(prepared.obligations, bookMarkers), [], 'each book part reads its annotated JSON and satisfies only its own obligations')
console.log('Project book content audit passed with separate scopes and shadow JSON inputs')
