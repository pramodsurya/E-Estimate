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
  return originalLoad.call(this, request, parent, isMain)
}

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath, mocks = {}) {
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

const documentSettings = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/documentSettings.ts'), {})
const leadPrintLayout = loadTsModule(path.join(root, 'src/renderer/src/lib/leadPrintLayout.ts'), {})
const leadMapGeometry = loadTsModule(path.join(root, 'src/renderer/src/lib/leadMapGeometry.ts'), {
  './printRender': { PX_PER_MM: 96 / 25.4 }
})
const dataTypst = {
  escapeTypst: (v) => String(v ?? ''),
  fmtMoney: (v) => (v == null ? '—' : Number(v).toFixed(2)),
  fmtQty: (v) => (v == null ? '—' : Number(v).toFixed(2))
}
const leadSourceChart = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/leadSourceChart.ts'), {
  './dataTypst': dataTypst,
  '../leadApplicability': { isDisposalLeadMaterial: () => false }
})
const leadTypst = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/leadTypst.ts'), {
  './dataTypst': dataTypst,
  './documentSettings': documentSettings,
  './leadSourceChart': leadSourceChart,
  '../signatureFooter': {
    LEAD_SIGNATURE_SCOPE: 'lead',
    resolveSignatureFooter: (project) => project.signatureFooter
  },
  '../leadPrintLayout': leadPrintLayout,
  '../leadMapGeometry': leadMapGeometry
})

const {
  applyLeadMapLayoutToTypst,
  extractLeadMapPageTypst,
  injectSavedLeadMapTypst,
  leadTypstTemplate
} = leadTypst

const { resolvedLeadMapTypstSource, leadMapShadowFiles } = loadTsModule(
  path.join(root, 'src/renderer/src/lib/typist-output/leadMapTypst.ts'),
  {
    './leadTypst': leadTypst,
    '../leadMapGeometry': leadMapGeometry,
    '../leadMapCapture': {}
  }
)

const layout = leadPrintLayout.normalizeLeadPrintSettings({
  mapPageSize: 'A4',
  pages: { map: { orientation: 'landscape' } },
  mapTitle: 'Lead Route Map',
  mapSubtitle: 'Test schematic',
  showMapHeader: true
})

const signatureFooter = {
  enabled: true,
  placement: 'every_page',
  rows: [
    { id: 's1', designation: 'Assistant Engineer', office: 'Sub-Division 1' },
    { id: 's2', designation: 'Executive Engineer', office: 'Irrigation Division' }
  ]
}

const injected = applyLeadMapLayoutToTypst(leadTypstTemplate(), layout, signatureFooter, false)
assert(injected.includes('// E-Estimate lead map page: begin'), 'map Typst lives in lead.typ as a managed block')
assert(injected.includes('Test schematic'), 'GUI subtitle is injected into lead.typ')
assert(injected.includes('flipped: true'), 'GUI landscape is injected as flipped Typst page')

const source = resolvedLeadMapTypstSource(layout, signatureFooter, false)
assert.equal(source, extractLeadMapPageTypst(injected))
assert(source.includes('paper: "a4"'), 'map page uses configured paper size')
assert(source.startsWith('// E-Estimate lead map page: begin'), 'map-only compile uses the injected lead.typ block')

const dummyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const shadow = leadMapShadowFiles(`data:image/png;base64,${dummyPng}`)
assert(Object.keys(shadow).includes('images/lead-route-map.png'), 'shadow file path matches template')

const compiler = NodeCompiler.create({ workspace: root })
for (const [vpath, b64] of Object.entries(shadow)) {
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  compiler.mapShadow(path.join(root, vpath), Buffer.from(clean, 'base64'))
  compiler.mapShadow(vpath, Buffer.from(clean, 'base64'))
}

const svg = compiler.svg({ mainFileContent: source, inputs: {} })
const text = svg.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ')
assert(text.includes('Lead Route Map'), 'title appears in rendered SVG')
assert(text.includes('Test schematic'), 'subtitle appears in rendered SVG')
assert(text.includes('Assistant Engineer'), 'signature designation appears in SVG')

const pdf = compiler.pdf({ mainFileContent: source, inputs: {} })
assert(pdf.length > 3000, 'map PDF compiled from lead.typ map block')

const oneSignatory = { ...signatureFooter, rows: [signatureFooter.rows[0]] }
const oneSignatorySource = resolvedLeadMapTypstSource(layout, oneSignatory, false)
assert.match(oneSignatorySource, /height: 1fr[\s\S]*Sub-Division 1\]\],\)\s*\r?\n\s*\)/)
const oneSignatoryPdf = compiler.pdf({ mainFileContent: oneSignatorySource, inputs: {} })
assert(oneSignatoryPdf.length > 3000, 'one-signatory map footer compiles as a one-item tuple')

const geometry = leadMapGeometry.computeLeadMapPageGeometry(layout, signatureFooter, true)
assert.equal(geometry.page.widthMm, 297, 'A4 landscape page width')
assert.equal(geometry.page.heightMm, 210, 'A4 landscape page height')

console.log(`Lead map Typst (injected into lead.typ): all assertions passed (${pdf.length} bytes PDF compiled)`)

const customBody = '#let EE = json(bytes(sys.inputs.at("ee-data")))\n= My saved lead typ\n#if Lead.map.available [\n  #pagebreak()\n  // E-Estimate lead map page: begin\n  old map\n  // E-Estimate lead map page: end\n]'
const committed = injectSavedLeadMapTypst(customBody, layout, signatureFooter, leadTypstTemplate())
assert(committed.includes('= My saved lead typ'), 'Map Save keeps the saved lead Typst body')
assert(committed.includes('Test schematic'), 'Map Save injects GUI values into the map block')
assert(!committed.includes('old map'), 'Map Save replaces the previous managed map block')
