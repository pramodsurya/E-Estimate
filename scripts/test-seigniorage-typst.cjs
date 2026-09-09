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
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')
const file = path.join(root, 'src/renderer/src/lib/typist-output/seigniorageTypst.ts')

function loadTsModule(filePath, mocks) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  loaded.require = (request) => request in mocks ? mocks[request] : Module.createRequire(filePath)(request)
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const escapeTypst = (value) => String(value).replace(/([#*$@_\\])/g, '\\$1')
const groupByMat = (rows) => [{
  key: 'stone', label: 'Stone', rows,
  s: rows.reduce((sum, row) => sum + (row.seigniorage || 0), 0),
  d: rows.reduce((sum, row) => sum + (row.dmft || 0), 0),
  m: rows.reduce((sum, row) => sum + (row.smft || 0), 0),
  p: rows.reduce((sum, row) => sum + (row.permit || 0), 0)
}]

// Real documentSettings so the source is wrapped the same way the app does.
const documentSettings = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'), {})

const { resolvedSeigniorageTypstSource, seigniorageCompileInputs, resolveSeigniorageDocumentSettings, buildSeigniorageRenderData, defaultSeigniorageRowDescription } =
  loadTsModule(file, {
    '../seigniorage': {
      PERMIT_GO_REFERENCE: 'G.O.Ms.No.21, dt. 31.03.2022',
      seigniorageItemDisplayName: (row) => row.itemCode
    },
    '../seignioragePrintLayout': {
      groupByMat,
      seigQtyCalc: (row) => `${row.itemQuantity} × 0.5 = ${row.quantity} ${row.unit}`
    },
    './dataTypst': {
      escapeTypst,
      fmtMoney: (value) => Number(value).toFixed(2),
      fmtQty: (value) => Number(value).toFixed(3)
    },
    './documentSettings': documentSettings,
    '../signatureFooter': {
      SEIGNIORAGE_SIGNATURE_SCOPE: 'seigniorage',
      resolveSignatureFooter: () => ({
        enabled: true,
        placement: 'subject_end',
        rows: [{ id: 's1', designation: 'Chief Engineer', office: 'Irrigation' }]
      })
    }
  })

const row = {
  id: 'row-1', itemCode: 'IRR-CCDW-1', description: 'Stone masonry', unit: 'cum',
  itemQuantity: 20, quantity: 10, seigRate: 75, seigniorage: 750,
  dmft: 225, smft: 15, permit: 600, permitPercent: 80,
  materialLabel: 'Stone', recipeMaterialDesc: 'Machine crushed stone'
}
const calculation = {
  rows: [row], totalSeigniorage: 750, totalDmft: 225, totalSmft: 15,
  totalPermit: 600, grandTotal: 1590, roundedSeigniorage: 750,
  roundedDmft: 225, roundedSmft: 15, roundedPermit: 600, roundedGrandTotal: 1590
}
const project = {
  meta: { name: 'Test Project', sorYear: '2025-26' },
  root: { name: 'Test Project' }
}

assert.equal(
  defaultSeigniorageRowDescription(row),
  'IRR-CCDW-1 — Machine crushed stone',
  'the default description must identify the chargeable recipe material, not the parent work item'
)
assert.equal(
  defaultSeigniorageRowDescription({
    ...row,
    recipeMaterialDesc: '',
    materialLabel: '',
    description: 'Legacy item description'
  }),
  'IRR-CCDW-1 — Legacy item description',
  'legacy rows without material details must retain their item description fallback'
)

assert.equal(resolveSeigniorageDocumentSettings(project).orientation, 'landscape')
const source = resolvedSeigniorageTypstSource(project, calculation)
const inputs = seigniorageCompileInputs(project, calculation)

// The template reads data at runtime from sys.inputs and never bakes numbers.
assert.match(source, /sys\.inputs\.at\("ee-data",\s*default:/, 'reads data from sys.inputs')
assert.match(source, /#assert\(/, 'guards on a missing runtime input')
assert.doesNotMatch(source, /EE-DATA-BEGIN/, 'no generated data block')
assert.doesNotMatch(source, /Rs\. 750\.00/, 'no baked project figures in the source')
assert.match(source, /SEIGNIORAGE STATEMENT/)
assert.match(source, /table\.header\(\s*repeat:\s*true/)
assert.match(source, /Rounded Grand Total/)
assert.match(source, /#signature-footer\(Seigniorage\.signature\)/, 'signature uses the shared bottom footer')

// Sync must keep the source byte-identical; only the compile inputs change.
const sourceAfterSync = resolvedSeigniorageTypstSource(project, {
  ...calculation, totalSeigniorage: 999, grandTotal: 2999
})
assert.equal(sourceAfterSync, source, 'Sync must not rewrite the user template')

const compiler = NodeCompiler.create({ workspace: root })
const pdf = compiler.pdf({ mainFileContent: source, inputs })
assert.ok(pdf && pdf.length > 4000, 'Seigniorage Typst PDF must compile and be non-empty')

// Render to SVG and assert the row loop produced real cells, not loop source.
const svg = compiler.svg({ mainFileContent: source, inputs })
assert.doesNotMatch(svg, /table\.cell\(\)/, 'row loop must render cells, not literal table.cell() text')
const text = svg.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
assert.match(text, /IRR-CCDW-1/, 'row data renders')
assert.match(text, /Machine crushed stone/, 'chargeable recipe material renders as the row description')
assert.doesNotMatch(text, /Stone masonry/, 'parent work-item description does not replace the recipe material')
assert.doesNotMatch(text, /permit_note\.len/, 'permit #if must not print as literal source')
assert.match(text, /@ 80\.0+%/, 'permit note renders')
assert.match(text, /Chief Engineer/, 'signature renders')
assert.match(source, /#let Seigniorage =/)

// Compiling without the runtime input must surface a real, readable diagnostic
// (the NAPI error lives on `code`, not `message`), proving the guard works.
let missingInputFailed = false
try {
  compiler.pdf({ mainFileContent: source, inputs: {} })
} catch (err) {
  missingInputFailed = true
  const detail = String((err && (err.code ?? err.message)) || '')
  assert.match(detail, /ee-data|E-Estimate runtime/i, 'missing-input diagnostic is surfaced')
}
assert.ok(missingInputFailed, 'compiling without the input must fail')

const dashboard = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/seigniorage/SeigniorageDashboard.tsx'),
  'utf8'
)
assert.match(dashboard, /<EEstimatePrintStudio/)
assert.match(dashboard, /<SeignioragePrintPreview/)
assert.doesNotMatch(dashboard, /SeignioragePrintPreviewModal|View Print View/)
// Verify seignioragePrintOverrides (custom title, year, permitBasis, groupHeadings, groupSubtotals, and rowDescriptions)
const projectWithOverrides = {
  ...project,
  seignioragePrintOverrides: {
    title: 'CUSTOM SEIGNIORAGE STATEMENT',
    year: '2026-27',
    permitBasis: 'Custom G.O. Reference 2026',
    groupHeadings: {
      'Stone': 'Custom Quarry Stone Heading'
    },
    groupSubtotals: {
      'Stone': 'Subtotal — All Custom Stone Materials'
    },
    rowDescriptions: {
      'row-1': 'Custom edited stone description for bund'
    }
  }
}
const renderData = buildSeigniorageRenderData(projectWithOverrides, calculation)
assert.equal(renderData.project, 'CUSTOM SEIGNIORAGE STATEMENT')
assert.equal(renderData.year, '2026-27')
assert.equal(renderData.permit_basis, 'Custom G.O. Reference 2026')
assert.equal(renderData.groups[0].label, 'Custom Quarry Stone Heading')
assert.equal(renderData.groups[0].subtotal_label, 'Subtotal — All Custom Stone Materials')
assert.equal(renderData.groups[0].rows[0].description, 'Custom edited stone description for bund')

const sourceWithOverrides = resolvedSeigniorageTypstSource(projectWithOverrides, calculation)
assert.match(sourceWithOverrides, /#render-material-groups\(\s*Seigniorage\.material_groups/)

const inputsWithOverrides = seigniorageCompileInputs(projectWithOverrides, calculation)
const pdfWithOverrides = compiler.pdf({ mainFileContent: sourceWithOverrides, inputs: inputsWithOverrides })
assert.ok(pdfWithOverrides && pdfWithOverrides.length > 4000)
const svgWithOverrides = compiler.svg({ mainFileContent: sourceWithOverrides, inputs: inputsWithOverrides })
const textWithOverrides = svgWithOverrides.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
assert.match(textWithOverrides, /Custom Quarry Stone Heading/)
assert.match(textWithOverrides, /Subtotal — All Custom Stone Materials/)
assert.match(textWithOverrides, /Custom edited stone description for bund/)
assert.match(textWithOverrides, /Custom G.O. Reference 2026/)

console.log(`seigniorage Typst runtime-input: all assertions passed (${pdf.length} bytes)`)

const defaultLayout = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/seigniorage.typ'), 'utf8')
const auditApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/printContentAudit.ts'), {})
const audit = auditApi.preparePrintAudit(inputs)
assert.deepEqual(auditApi.auditPrintContent(audit.obligations, compiler.query({ mainFileContent: defaultLayout, inputs: audit.inputs }, { selector: 'metadata', field: 'value' })), [], 'default seigniorage satisfies current content obligations')
assert(compiler.pdf({ mainFileContent: defaultLayout, inputs }).length > 4000, 'default compiles without hidden helper code')
assert(compiler.pdf({ mainFileContent: defaultLayout, inputs: { 'ee-data': '{}' } }).length > 1000, 'empty optional collections are safe')
const savedDesign = '#let EE = json(bytes(sys.inputs.at("ee-data")))\n= My saved design\n#ee-group-table(EE.groups)'
const savedProject = { ...project, printStudioDocuments: { 'seigniorage-statement': savedDesign } }
const resolvedSaved = resolvedSeigniorageTypstSource(savedProject, calculation)
assert(resolvedSaved.endsWith(savedDesign), 'legacy saved design remains unchanged')
assert(compiler.pdf({ mainFileContent: resolvedSaved, inputs }).length > 4000)
console.log('Seigniorage full default, empty collections and legacy saved layout passed')
