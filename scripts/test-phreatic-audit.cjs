const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

const root = path.resolve(__dirname, '..')
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  return originalLoad.call(this, request, parent, isMain)
}

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)

const bund = require('../src/renderer/src/lib/bund.ts')
const figures = require('../src/renderer/src/lib/bundFigures.ts')
const phreaticFigure = require('../src/renderer/src/lib/typist-output/bund/bundPhreaticFigure.ts')
const bundGeometry = require('../src/renderer/src/lib/typist-output/bund/bundGeometry.ts')
const adapter = require('../src/renderer/src/lib/typist-output/bund/bundTypst.ts')

const base = bund.defaultBundData()
const data = {
  ...base,
  mode: 'new',
  embankmentType: 'homogeneous',
  configured: true,
  lengthM: 60,
  includePhreaticInPrint: true,
  design: {
    ...base.design,
    topLevel: 100,
    mwl: 94,
    ftl: 93,
    freeBoard: 2,
    topWidth: 6,
    usSlope: 2,
    dsSlope: 2,
    stripDepth: 0.3,
    berms: [bund.defaultBundBerm('us', 95)]
  },
  rockToeMaterial: { code: 'IRR-CAW-5-6', unit: 'CUM' },
  rockToeHeight: 1.5,
  rockToeTopWidth: 1,
  rockToeInnerSlope: 1,
  rockToeFilterMaterial: { code: 'IRR-CAW-5-5', unit: 'CUM' },
  horizontalFilterMaterial: { code: 'IRR-CAW-5-5', unit: 'CUM' },
  horizontalFilterLength: 10,
  horizontalFilterThickness: 0.6,
  verticalFilterMaterial: { code: 'IRR-DAW-6-8', unit: 'CUM' },
  verticalFilterWidth: 0.45,
  verticalFilterHeight: 2,
  chuteDrainLiningMaterial: { code: 'IRR-CAW-6-1', unit: 'CUM' },
  chuteDrainExcavationMaterial: { code: 'IRR-CAW-1-1', unit: 'CUM' },
  upstreamToe: { ...base.upstreamToe, topWidth: 1.2, bottomWidth: 0.8, depth: 1.2, excavationMaterial: { code: 'IRR-DAW-1-1' } },
  downstreamToe: { ...base.downstreamToe, excavationMaterial: { code: 'IRR-CAW-1-1' } },
  sections: [0, 30, 60].map((chainage, index) => ({
    ...bund.createSection(chainage),
    id: `section-${index}`,
    pre: [
      { offset: -50, rl: 88 },
      { offset: 0, rl: 88 },
      { offset: 50, rl: 88 }
    ]
  }))
}

const ph = phreaticFigure.phreaticFigureData(data)
assert.ok(ph, 'phreatic figure data should be generated')
assert.ok(ph.svg, 'phreatic svg should exist')

// 1. Audit Phreatic SVG
const matchVb = ph.svg.match(/viewBox="0 0 (\d+) (\d+)"/)
assert.ok(matchVb, 'svg has viewBox')
const phW = Number(matchVb[1])
const phH = Number(matchVb[2])
console.log(`Phreatic SVG viewBox: ${phW} x ${phH}`)
assert.ok(phH < 280, `Phreatic height (${phH}) should be dynamic and compact (much less than old 380px)`)
assert.ok(!ph.svg.includes('NaN'), 'no NaN in phreatic svg')
assert.ok(ph.svg.includes('Reference — plain bund, no drainage'), 'legend contains reference line')
assert.ok(ph.svg.includes('Actual — with rock toe + filter + berm'), 'legend contains actual line')

// 2. Audit Detail Figures in bundFigures.ts
const usToeSvg = figures.usToeFigure(data)
const usToeH = Number(usToeSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`usToe SVG height: ${usToeH} (old fixed: 360)`)
assert.ok(usToeH > 100 && usToeH < 650, `usToe height (${usToeH}) should be dynamic and snug`)

const dsDrainSvg = figures.dsDrainFigure(data, 1.2)
const dsDrainH = Number(dsDrainSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`dsDrain SVG height: ${dsDrainH} (old fixed: 360)`)
assert.ok(dsDrainH > 100 && dsDrainH < 400, `dsDrain height (${dsDrainH}) should be dynamic and snug`)

const rockToeSvg = figures.rockToeFigure(data)
const rockToeH = Number(rockToeSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`rockToe SVG height: ${rockToeH} (old fixed: 270)`)
assert.ok(rockToeH > 100 && rockToeH < 450, `rockToe height (${rockToeH}) should be dynamic and snug`)

const chuteSvg = figures.chuteFigure(data)
const chuteH = Number(chuteSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`chute SVG height: ${chuteH} (old fixed: 210)`)
assert.ok(chuteH > 100 && chuteH < 450, `chute height (${chuteH}) should be dynamic and snug`)

const bermSvg = figures.bermFigure(data, data.design.berms[0])
const bermH = Number(bermSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`berm SVG height: ${bermH} (old fixed: 260)`)
assert.ok(bermH > 100 && bermH < 350, `berm height (${bermH}) should be dynamic and snug`)

const filterSvg = figures.filterFigure(data, data.sections[0])
const filterH = Number(filterSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`filter SVG height: ${filterH} (old fixed: 280)`)
assert.ok(filterH > 100 && filterH < 270, `filter height (${filterH}) should be dynamic and snug`)

const assemblySvg = figures.assemblyFigure(data, data.sections[0])
const assemblyH = Number(assemblySvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`assembly SVG height: ${assemblyH} (old fixed: 330)`)
assert.ok(assemblyH > 100 && assemblyH < 250, `assembly height (${assemblyH}) should be dynamic and snug`)

// 3. Audit Section SVG in bundGeometry.ts
const secSvg = bundGeometry.sectionSvg(data, data.sections[0], 0)
const secH = Number(secSvg.match(/viewBox="0 0 (\d+) (\d+)"/)[2])
console.log(`section SVG height: ${secH} (old fixed: 210)`)
assert.ok(secH > 50 && secH < 140, `section height (${secH}) should be dynamic and snug, eliminating all empty space`)

// 4. Test PDF compilation with all diagrams enabled
const node = { id: 'bund-1', kind: 'component', name: 'Bund #1 [Audit]', templateId: 'bund', bund: data, children: [] }
const project = { id: 'test', meta: { name: 'Audit reservoir' }, root: { id: 'root', kind: 'root', children: [node] } }
const render = adapter.buildBundRenderData(project, node)
const source = adapter.bundTypstTemplate(data)
const inputs = adapter.bundCompileInputs(project, node)

const compiler = NodeCompiler.create({ workspace: root })
const pdf = compiler.pdf({ mainFileContent: source, inputs })
assert.ok(pdf?.length > 5000, 'PDF should compile successfully with all diagrams')
fs.writeFileSync(path.join(root, 'tmp/pdfs/bund-typst/audit-homogeneous-all-diagrams.pdf'), pdf)
console.log(`Compiled audit PDF with all diagrams (${pdf.length} bytes)`)

console.log('ALL DIAGRAM COMPACTNESS AUDIT CHECKS PASSED!')
