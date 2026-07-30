const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const projectView = read('src/renderer/src/components/print/ProjectPrintView.tsx')
const leadDashboard = read('src/renderer/src/components/lead/LeadDashboard.tsx')
const leadDetailDashboard = read('src/renderer/src/components/lead/LeadDetailDashboard.tsx')
const dataDashboard = read('src/renderer/src/components/data/DataDashboard.tsx')
const workArea = read('src/renderer/src/components/WorkArea.tsx')
assert.ok(
  /project\.root\.children\.map\(\(child\)/.test(projectView),
  'Project VPV must traverse the Explorer root order'
)
assert.ok(
  /<ComponentPrintPreviewStack/.test(projectView),
  'Project VPV must reuse each Component print-preview PDF stack'
)
assert.ok(
  /<DocumentPrintPreviewStack/.test(projectView),
  'Introduction and supporting Pages must use their paginated document preview'
)
assert.ok(
  !/<SignatureFooterPrint/.test(projectView) && !/pp-cover-page/.test(projectView),
  'The live Front Page must remain a clean cover without a signature block'
)
assert.ok(
  /<LeadPrintPreviewModal/.test(projectView) && /\bembedded\b/.test(projectView),
  'Project VPV must reuse the existing Lead Print Preview page stack'
)
assert.ok(
  /<SeignioragePrintPages/.test(projectView),
  'Project VPV must embed the existing Seigniorage Print Preview pages'
)
assert.ok(
  /<DataDashboardReport/.test(projectView),
  'Project VPV must hook the flowing DATA Dashboard print report'
)
assert.ok(
  /<LeadPrintPreviewModal/.test(leadDashboard) &&
    /renderPrintPreview\(true/.test(leadDashboard) &&
    /<LeadPrintPreviewModal/.test(leadDetailDashboard) &&
    /\bembedded\b/.test(leadDetailDashboard),
  'Lead View Print View must reuse the existing material Print Preview pages'
)
assert.ok(
  /collectDataSheets\(project, entries\)/.test(dataDashboard) &&
    /buildDataSheetsPrintPdf/.test(dataDashboard) &&
    /<PdfPageStack/.test(dataDashboard),
  'DATA View Print View must show the individual code sheets as a continuous page flow'
)
assert.ok(
  !/buildDataDashboardPrintPdf|createUniverWorkbookData/.test(dataDashboard),
  'DATA View Print View must not print the item spreadsheets any more'
)
assert.ok(
  !/DtlLeadDashboard|dtllead/.test(workArea) &&
    !fs.existsSync(path.join(root, 'src/renderer/src/components/lead/DtlLeadDashboard.tsx')),
  'DTL Lead must be removed from the work area and source tree'
)

const componentPrint = read('src/renderer/src/lib/componentPrint.ts')
const orderedWalker = /const appendChildrenInTreeOrder[\s\S]*?\n  \}/.exec(componentPrint)?.[0] ?? ''
assert.ok(
  /for \(const child of section\.children\)/.test(orderedWalker),
  'Component print assembly must follow child order'
)
for (const kind of ["child.kind === 'page'", "child.kind === 'item'", "child.kind === 'subcomponent'"]) {
  assert.ok(orderedWalker.includes(kind), `Component print order must handle ${kind}`)
}
assert.ok(
  /item\.itemEditorType === 'document'[\s\S]*?withItemDescription\(/.test(componentPrint),
  'DOC DATA pages must include their item description heading in Component and Project VPV'
)
assert.ok(
  /pendingSpreadsheetItems[\s\S]*?itemPageRequests\(section,\s*pendingSpreadsheetItems\)/.test(
    componentPrint
  ),
  'Consecutive spreadsheet DATA codes must share one flowing Component print request'
)
const dataSheetPrint = read('src/renderer/src/lib/dataSheetPrint.tsx')
assert.ok(
  /renderToStaticMarkup\(\s*<RateAnalysisTable/.test(dataSheetPrint) &&
    /styles\.css\?inline/.test(dataSheetPrint),
  'DATA Dashboard print must render the individual code sheet component with the app stylesheet'
)
assert.ok(
  /geometry\.pageSize/.test(dataSheetPrint) && /PAPER_MM/.test(dataSheetPrint),
  'DATA Dashboard print must follow the selected paper size instead of assuming A4'
)
assert.ok(
  /margins:\s*\{\s*top:\s*margins\.top\s*\/\s*25\.4/.test(dataSheetPrint) &&
    /html,body\{margin:0;padding:0/.test(dataSheetPrint),
  'DATA sheets must use real page margins on every page, never first-page body padding'
)
assert.ok(
  !/calculate\w*\(|\.reduce\(|getItemFinal\(/.test(dataSheetPrint),
  'DATA Dashboard print must not perform any DATA calculation of its own'
)
assert.ok(
  /child\.itemEditorType === 'document'[\s\S]*?flushSpreadsheetItems\(\)[\s\S]*?itemPageRequests\(section,\s*\[child\]\)/.test(
    componentPrint
  ),
  'A DOC item may form its own exact document boundary without splitting every spreadsheet DATA code'
)
assert.ok(
  /chooseSmartAbstractPlan\(profiles\)/.test(componentPrint) &&
    /abstract-page-break/.test(componentPrint) &&
    /abstract-final-block/.test(componentPrint) &&
    /SIGNATURE_FOOTER_SLOT/.test(componentPrint) &&
    /page-break-inside:avoid/.test(componentPrint) &&
    !/<footer><span>\$\{totalLabel\}/.test(componentPrint),
  'Component and sub-component Abstracts must use smart row balancing and reserve their final signature/total block'
)
assert.ok(
  !/collectProjectItemGroups\(project\.root\)/.test(projectView) &&
    !/<RateAnalysisTable/.test(projectView) &&
    !/leadApplications=/.test(projectView),
  'Project VPV must not rebuild DATA sheets or inject Lead calculation inputs'
)
assert.ok(
  !/\.reduce\(/.test(projectView) && !/getItemFinal\(/.test(projectView),
  'Project VPV must not introduce cost or rate calculation logic'
)

const dashboardSync = read('src/renderer/src/lib/dashboardSync.ts')
const projectSync = dashboardSync.slice(
  dashboardSync.indexOf('export async function syncProjectDashboardSnapshot')
)
// Lead feeds DATA, DATA rates the components, and Seigniorage is charged on the
// quantities those components settle on.
const syncOrder = [
  'syncLeadDashboardSnapshot(',
  'syncDataDashboardSnapshot(',
  'compileComponentDashboardSnapshots(',
  'syncSeigniorageDashboardSnapshot('
].map((call) => projectSync.indexOf(call))
assert.ok(
  syncOrder.every((index) => index >= 0) &&
    syncOrder.every((index, position) => position === 0 || index > syncOrder[position - 1]),
  'Project Sync must invoke every total dashboard Sync in dependency order'
)
assert.ok(
  /const seigniorage = await syncSeigniorageDashboardSnapshot\(afterComponents\)/.test(
    projectSync
  ) && /return \{\s*\.\.\.seigniorage,/.test(projectSync),
  'The seigniorage step must build on the compiled component snapshot and be returned'
)
const titleDashboard = read('src/renderer/src/components/dashboard/TitleDashboard.tsx')
const printInputs = read('src/renderer/src/lib/projectPrintInputs.ts')
assert.ok(
  /componentTotals:\s*Object\.fromEntries/.test(printInputs) &&
    /computeProjectPrintInputs/.test(titleDashboard),
  'Project Dashboard must consume totals frozen by Component Dashboard Sync'
)
assert.ok(
  /componentTotals\[node\.id\]\s*=\s*componentItemsTotal/.test(dashboardSync),
  'Component Dashboard Sync must freeze its own total'
)

const cover = read('src/renderer/src/lib/univerDocument.ts')
assert.ok(
  /withoutFrontCoverParagraphBorders\(existing\)/.test(cover),
  'Existing Front Pages must remove the old text-crossing paragraph rules'
)

console.log('project VPV: all assertions passed')
