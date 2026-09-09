const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

const rawModule = require('node:module')
const originalLoad = rawModule._load
rawModule._load = function (request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  if (request.includes('.png?')) return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
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

const itemApi = loadTsModule(path.join(root, 'src/renderer/src/lib/typist-output/itemTypst.ts'), {
  '../../components/nodeVisual': { nodeDisplayName: (node) => node.name || node.itemCode || 'Item' },
  '../finalNumber': {
    readFinalValueFromSnapshot: () => 100,
    getItemRate: () => 250
  },
  '../nodeSettings': {
    resolveNodeSettings: () => ({ pageSize: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 25 } })
  },
  '../signatureFooter': {
    resolveSignatureFooter: () => ({ enabled: false, rows: [] })
  },
  '../projectItems': {
    rateAnalysisOverrideForNode: () => null
  },
  '../rateAnalysisVisibility': {
    descriptionRunsForDisplay: () => [],
    plainTextRun: (t) => ({ text: t })
  },
  '../dashboardSync': {
    dashboardContextMatches: () => false,
    dashboardItemIsSynced: () => false
  }
})

const p = 'C:\\\\Users\\\\napra\\\\Downloads\\\\Bund.eestimate'
const project = JSON.parse(fs.readFileSync(p, 'utf-8'))

function findNode(node, name) {
  if (node.name === name) return node
  for (const c of node.children || []) {
    const f = findNode(c, name)
    if (f) return f
  }
  return null
}
const item = findNode(project.root, 'IRR-CAW-5-8')

const renderData = itemApi.buildItemSheetRenderData(project, item)
console.log('Images in renderData:', JSON.stringify(renderData.images, null, 2))
console.log('Effective range:', renderData.printConfig?.range)

const shadowFiles = itemApi.itemSheetShadowFiles(item, renderData.printConfig?.range ?? null)
console.log('Shadow files keys:', Object.keys(shadowFiles))

const source = itemApi.resolvedItemSheetTypstSource(project, item)
const compiler = NodeCompiler.create({ workspace: root })

for (const [vpath, b64] of Object.entries(shadowFiles)) {
  const cleanB64 = b64.replace(/^data:[^;]+;base64,/, '')
  const absPath = path.resolve(root, vpath)
  compiler.mapShadow(absPath, Buffer.from(cleanB64, 'base64'))
}

try {
  const svg = compiler.svg({
    mainFileContent: source,
    inputs: { 'ee-data': JSON.stringify(renderData) }
  })
  console.log('SUCCESS! SVG generated, length:', svg.length)
  fs.writeFileSync(path.join(root, 'tmp/item-bund-fixed.svg'), svg)

  const pdf = compiler.pdf({
    mainFileContent: source,
    inputs: { 'ee-data': JSON.stringify(renderData) }
  })
  fs.writeFileSync(path.join(root, 'tmp/item-bund-fixed.pdf'), pdf)
  console.log('SUCCESS! PDF generated, length:', pdf.length)

  const imgIdx = svg.indexOf('<image')
  if (imgIdx !== -1) {
    console.log('SVG image tag snippet:', svg.slice(imgIdx, imgIdx + 200))
  }
  let pos = 0
  while ((pos = svg.indexOf('translate(', pos)) !== -1) {
    if (pos > imgIdx - 300 && pos < imgIdx + 100) {
      console.log('Nearby transform translate:', svg.slice(pos, pos + 50))
    }
    pos += 10
  }
} catch (e) {
  console.error('Compilation failed:', e)
}
