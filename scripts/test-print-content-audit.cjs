const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request.endsWith('.typ?raw')) return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8')
  return originalLoad.call(this, request, parent, isMain)
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename)
const { preparePrintAudit, auditPrintContent, auditShadowFiles, printIssuesForAi } = require('../src/renderer/src/lib/typist-output/printContentAudit.ts')
const bund = require('../src/renderer/src/lib/bund.ts')
const adapter = require('../src/renderer/src/lib/typist-output/bund/bundTypst.ts')
const compiler = NodeCompiler.create({ workspace: path.resolve(__dirname, '..') })
function markers(source, inputs) {
  return compiler.query({ mainFileContent: source, inputs }, { selector: 'metadata', field: 'value' })
}
const data = bund.defaultBundData()
Object.assign(data, { configured: true, mode: 'new', lengthM: 30,
  design: { ...data.design, topLevel: 100, topWidth: 5 },
  sections: [0, 30].map(chainage => ({ ...bund.createSection(chainage), groundLevel: 95, upstreamGroundLevel: 95, downstreamGroundLevel: 95 }))
})
const node = { id: 'bund-a', kind: 'component', name: 'Bund A', templateId: 'bund', bund: data, children: [] }
const project = { id: 'audit-test', meta: { name: 'Audit reservoir' }, root: { id: 'root', children: [node] } }
const before = preparePrintAudit(adapter.bundCompileInputs(project, node))
data.turfingMaterial = { code: 'TURF-1', unit: 'SQM' }
const inputs = adapter.bundCompileInputs(project, node)
const audit = preparePrintAudit(inputs)
assert(audit.obligations.length > before.obligations.length, 'adding turfing creates independent print obligations')
assert.equal(inputs['ee-bund'].includes('_ee_print_id'), false, 'audit never mutates project data')
const source = adapter.bundTypstTemplate(data)
const printed = markers(source, audit.inputs)
assert(Array.isArray(printed), 'compiler returns rendered metadata')
assert.deepEqual(auditPrintContent(audit.obligations, printed), [], 'built-in bund prints all contractual content')
// Saved custom layout predates turfing: its filter silently omits the new work.
const custom = source.replace('for payable-code in payable-by-code {', 'for payable-code in payable-by-code.filter(item => item.code != "TURF-1") {')
const issues = auditPrintContent(audit.obligations, markers(custom, audit.inputs))
assert(issues.some(i => i.expected.includes('TURF-1')), 'omitted turfing gets an issue')
assert(issues.some(i => i.label.includes('turfing')), 'issue identifies turfing by name')
assert(issues.every(i => i.status === 'missing'))
assert(printIssuesForAi(issues).includes('_ee_print_id'))
const ignored = markers('#let unused = [#metadata("ee-print:unused")]\n#if false [#metadata("ee-print:hidden")]\nPrinted', {})
assert(!ignored.includes('ee-print:unused') && !ignored.includes('ee-print:hidden'), 'unused/conditional source is not render evidence')
assert(auditPrintContent(audit.obligations, []).every(i => i.status === 'unverified'), 'legacy templates are honestly unverified')
assert(auditPrintContent(audit.obligations).every(i => i.status === 'unverified'), 'older compiler cannot falsely pass')
assert.deepEqual(preparePrintAudit({ 'ee-data': JSON.stringify({ margins: { top: 20 }, paper: 'a3', setup: { font: 'Arial' } }) }).obligations, [])
const shadows = auditShadowFiles(audit.inputs, { 'parts/ee-bund.json': 'old', 'image.png': 'untouched' })
assert.equal(Buffer.from(shadows['parts/ee-bund.json'], 'base64').toString(), audit.inputs['ee-bund'])
assert.equal(shadows['image.png'], 'untouched')
const sheetAudit = preparePrintAudit({ 'ee-data': JSON.stringify({ univer: { sheetOrder: ['s'], sheets: { s: { cellData: { 0: { 0: { v: 0 }, 1: { v: 12 } }, 1: { 0: { v: 30 } } }, rowData: { 1: { hd: 1 } } } } }, printConfig: { range: [0, 0, 0, 0] } }) })
assert.equal(sheetAudit.obligations.length, 1, 'zero is content, hidden and explicitly out-of-range cells are excluded')
const duplicates = preparePrintAudit({ 'ee-data': JSON.stringify({ lines: [{ label: 'Work A', amount: 10 }, { label: 'Work B', amount: 10 }], summary: {} }) })
assert.equal(auditPrintContent(duplicates.obligations, ['ee-print-audit:v1', duplicates.obligations[0].id]).length, 1, 'equal values cannot satisfy another record')
const { compactProjectForSave, expandLoadedProject } = require('../src/renderer/src/lib/projectFile.ts')
const saved = { ...project, printStudioDocuments: { 'component-bund-a': custom, 'lead-statement': '', 'item-sheet-a': '#set page(paper: "a3")\nCustom text' } }
const reopened = expandLoadedProject(JSON.parse(JSON.stringify(compactProjectForSave(saved))))
assert.deepEqual(reopened.printStudioDocuments, saved.printStudioDocuments, 'all saved sources, including empty source, round-trip unchanged')
console.log('Print content audit: live turfing, rendered omissions, legacy layouts, layout exclusion, records, and book inputs passed')
