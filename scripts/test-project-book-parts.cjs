const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const { PDFDocument } = require('pdf-lib')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/typist-output/projectBookPartsPdf.ts')
const source = fs.readFileSync(filePath, 'utf8')
const loaded = new Module(filePath, module)
loaded.filename = filePath
loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
loaded.require = (request) => {
  if (request === '@tauri-apps/api/core') return { convertFileSrc: (value) => value }
  if (request === 'pdf-lib') return require('pdf-lib')
  if (request === './printContentAudit') return {
    preparePrintAudit: (inputs) => ({ inputs, obligations: [] }),
    auditPrintContent: () => []
  }
  if (request === './projectPrintBook') return {
    collectProjectTypstPartsWithAssets: async () => (
      [
        { id: 'cover', label: 'Cover', kind: 'cover', prelude: '', source: '= Cover', inputs: {} },
        { id: 'abstract', label: 'General Abstract', kind: 'abstract', prelude: '', source: '= Abstract', inputs: {} },
        { id: 'component', label: 'Bund', kind: 'component', prelude: '', source: '= Bund\n#pagebreak()\n= Bund continued', inputs: {} }
      ]
    ),
    upgradeLegacySignatureLayout: (value) => value,
    upgradeLegacyTypstApis: (value) => value
  }
  throw new Error(`Unexpected import: ${request}`)
}
loaded._compile(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filePath
}).outputText, filePath)

const compiler = NodeCompiler.create({ workspace: root })
const rows = Array.from({ length: 40 }, (_, index) => ({ label: `Section ${index + 1}`, page: index * 3 + 4 }))
const pdf = compiler.pdf({
  mainFileContent: loaded.exports.projectBookIndexSource(),
  inputs: { 'ee-data': JSON.stringify(rows) }
})
assert(pdf?.length > 1000, 'multi-page project index should compile')
console.log(`Project book index passed (${pdf.length} bytes)`)

const produced = new Map()
global.window = { api: { typst: { compile: async (mainFileContent, inputs) => {
  const bytes = compiler.pdf({ mainFileContent, inputs })
  const pdfPath = `test-pdf-${produced.size}`
  produced.set(pdfPath, bytes)
  return { ok: true, pdfPath }
} } } }
global.fetch = async (pdfPath) => ({
  ok: produced.has(pdfPath),
  arrayBuffer: async () => Uint8Array.from(produced.get(pdfPath)).buffer
})

loaded.exports.compileProjectBookInParts({}, '= Abstract', () => undefined).then(async ({ bytes, issues }) => {
  assert.deepEqual(issues, [])
  const merged = await PDFDocument.load(bytes)
  assert.equal(merged.getPageCount(), 5, 'cover, index, abstract and two bund pages should merge')
  console.log('Project book segmented compilation passed (5 pages)')
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
