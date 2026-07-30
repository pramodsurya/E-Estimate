const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const file = path.join(root, 'src/renderer/src/lib/signatureFooter.ts')
const source = fs.readFileSync(file, 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  },
  fileName: file
})
const loaded = new Module(file, module)
loaded.filename = file
loaded.paths = Module._nodeModulePaths(path.dirname(file))
loaded._compile(outputText, file)

const {
  applySignatureFooterToPdf,
  resolveDocumentSignatureFooter,
  resolveSignatureFooter,
  PROJECT_SIGNATURE_SCOPE
} = loaded.exports

const rows = [
  { id: 'one', designation: 'Assistant Engineer', office: 'Division One' },
  { id: 'two', designation: 'Executive Engineer', office: 'Circle Office' }
]
const project = {
  signatureFooter: { enabled: true, placement: 'every_page', rows },
  signatureFooterOverrides: {
    componentA: {
      enabled: true,
      placement: 'subject_end',
      rows: [{ id: 'local', designation: 'Deputy Engineer', office: 'Local Office' }]
    }
  }
}

assert.equal(resolveSignatureFooter(project, PROJECT_SIGNATURE_SCOPE).rows[0].id, 'one')
assert.equal(resolveSignatureFooter(project, 'componentA').rows[0].id, 'local')
assert.equal(resolveSignatureFooter(project, 'componentB').rows[1].id, 'two')
assert.equal(
  resolveDocumentSignatureFooter(project, { id: 'front', pageTemplate: 'front' }).enabled,
  false,
  'The Front Page must remain a clean cover without inherited signatures'
)
assert.equal(
  resolveDocumentSignatureFooter(project, { id: 'ordinaryPage' }).rows[1].id,
  'two',
  'Ordinary Pages must continue to inherit the project signature'
)

const options = {
  pageSize: 'A4',
  landscape: false,
  margins: { top: 0.5, right: 0.5, bottom: 0.2, left: 0.5 },
  printBackground: true,
  scale: 1,
  displayHeaderFooter: false,
  headerTemplate: '<span></span>',
  footerTemplate: '<span></span>',
  preferCSSPageSize: false
}

const everyPage = applySignatureFooterToPdf(
  '<html><body>Estimate</body></html>',
  options,
  project.signatureFooter
)
assert.equal(everyPage.options.displayHeaderFooter, true)
assert.ok(everyPage.options.margins.bottom >= 24 / 25.4)
assert.ok(everyPage.options.footerTemplate.indexOf('Assistant Engineer') <
  everyPage.options.footerTemplate.indexOf('Executive Engineer'))
assert.ok(everyPage.options.footerTemplate.includes('padding:0 10mm 4mm'))

const subjectEnd = applySignatureFooterToPdf(
  '<html><head></head><body>Estimate</body></html>',
  options,
  project.signatureFooterOverrides.componentA
)
assert.ok(subjectEnd.html.includes('estimate-signature-footer'))
assert.ok(subjectEnd.html.includes('Deputy Engineer'))
assert.equal(subjectEnd.options.displayHeaderFooter, false)

const dashboardFiles = [
  'components/dashboard/TitleDashboard.tsx',
  'components/dashboard/ComponentDashboard.tsx',
  'components/data/DataDashboard.tsx',
  'components/lead/LeadDashboard.tsx',
  'components/seigniorage/SeigniorageDashboard.tsx'
]
for (const relative of dashboardFiles) {
  const dashboard = fs.readFileSync(
    path.join(root, 'src/renderer/src', relative),
    'utf8'
  )
  assert.ok(
    dashboard.includes('<SignatureFooterCard'),
    `${relative} must expose the shared Signature / Footer card`
  )
}

const detailedFiles = [
  'components/guidewall/GuideWallDetail.tsx',
  'components/bund/BundDetail.tsx',
  'components/rateanalysis/RateAnalysisDashboard.tsx',
  'components/lead/LeadDetailDashboard.tsx',
  'components/editors/PageEditor.tsx'
]
for (const relative of detailedFiles) {
  const detailed = fs.readFileSync(
    path.join(root, 'src/renderer/src', relative),
    'utf8'
  )
  assert.ok(
    !detailed.includes('<SignatureFooterCard'),
    `${relative} must not expose Signature / Footer controls`
  )
}

for (const relative of [
  'components/print/DocumentPrintPreviewStack.tsx',
  'components/print/PrintLayoutModal.tsx',
  'lib/projectExport.tsx'
]) {
  const printPath = fs.readFileSync(path.join(root, 'src/renderer/src', relative), 'utf8')
  assert.ok(
    printPath.includes('resolveDocumentSignatureFooter(project, node)'),
    `${relative} must apply the shared Front Page signature exception`
  )
}

console.log('signature/footer inheritance and print placement tests passed')
