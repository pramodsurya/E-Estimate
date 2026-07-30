const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const titleBar = read('src/renderer/src/components/TitleBar.tsx')
const exportLib = read('src/renderer/src/lib/projectExport.tsx')
const exportModal = read('src/renderer/src/components/modals/ExportPdfModal.tsx')
const projectView = read('src/renderer/src/components/print/ProjectPrintView.tsx')
const titleDashboard = read('src/renderer/src/components/dashboard/TitleDashboard.tsx')
const ipc = read('src/main/ipc.ts')
const previewPrint = read('src/renderer/src/lib/previewPrint.ts')
const componentPrint = read('src/renderer/src/lib/componentPrint.ts')

// --- File > Export > PDF ----------------------------------------------------
assert.ok(
  !/label="Export"[^>]*\bsoon\b/.test(titleBar),
  'Export must no longer be marked as coming soon'
)
assert.ok(
  /<span>Export<\/span>[\s\S]*?<MenuItem\s+label="PDF"[\s\S]*?openExportPdf\(\)/.test(titleBar),
  'File > Export must open a submenu whose PDF entry starts the export'
)

// --- The export is the Project Print View ------------------------------------
for (const [source, why] of [
  ['GeneralAbstractPage', 'the General Abstract page'],
  ['LeadPrintPreviewModal', 'the Lead print preview'],
  ['SeignioragePrintPages', 'the Seigniorage print pages'],
  ['buildCombinedComponentPdf', "each component's own print build"],
  ['buildDocumentPrintHtml', 'the document print pipeline for Front Page/Introduction/Pages'],
  ['buildDataSheetsPrintPdf', 'the DATA code sheet flow']
]) {
  assert.ok(
    new RegExp(source).test(exportLib),
    `Export must reuse ${why} rather than redrawing it`
  )
}
assert.ok(
  /GeneralAbstractPage/.test(projectView),
  'The print view and the export must share one General Abstract implementation'
)
assert.ok(
  !/computeProjectAbstract\(|getItemFinal\(|\.reduce\(/.test(exportLib),
  'Export must not perform estimate calculation of its own'
)
assert.ok(
  /computeProjectPrintInputs/.test(exportLib) &&
    /computeProjectPrintInputs/.test(titleDashboard),
  'Dashboard and export must read the same derived project figures'
)

// Explorer order: cover, introduction, abstract, tree children, lead, seigniorage, data.
const order = [
  "settings.sections.cover",
  "settings.sections.introduction",
  "settings.sections.abstract",
  "for (const child of bodyChildren)",
  "settings.sections.lead",
  "settings.sections.seigniorage",
  "settings.sections.data"
].map((needle) => exportLib.indexOf(needle))
assert.ok(
  order.every((index) => index >= 0) &&
    order.every((index, position) => position === 0 || index > order[position - 1]),
  'Export must assemble sections in the Project Print View order'
)

// --- Built in dependency order, bound in print order -------------------------
const stages = /const STAGE = \{([\s\S]*?)\} as const/.exec(exportLib)?.[1] ?? ''
const stageOrder = ['lead', 'data', 'components', 'seigniorage', 'abstract', 'covers'].map(
  (name) => Number(new RegExp(`${name}:\\s*(\\d+)`).exec(stages)?.[1] ?? NaN)
)
assert.ok(
  stageOrder.every((value) => Number.isFinite(value)) &&
    stageOrder.every((value, position) => position === 0 || value > stageOrder[position - 1]),
  'Rendering must follow Lead → DATA → Components → Seigniorage → Abstract → covers'
)
assert.ok(
  /task\('Lead Print Preview', STAGE\.lead/.test(exportLib) &&
    /task\('DATA code sheets', STAGE\.data/.test(exportLib) &&
    /STAGE\.components,\s*async \(phase\) =>/.test(exportLib) &&
    /task\('Seigniorage Print Preview', STAGE\.seigniorage/.test(exportLib) &&
    /task\('General Abstract', STAGE\.abstract/.test(exportLib) &&
    /task\('Front Page', STAGE\.covers/.test(exportLib),
  'Each section must declare the stage its figures depend on'
)
assert.ok(
  /entry\.stage === STAGE\.lead[\s\S]*?laterStages[\s\S]*?await mapWithConcurrency\(inStage/.test(
    exportLib
  ),
  'Lead must run alongside the later stages instead of blocking them on its map tiles'
)
assert.ok(
  /Built in dependency order above; bound in print-view order here/.test(exportLib),
  'The merge must still follow print-view order'
)

// --- Rendering completes before anything is written --------------------------
assert.ok(
  /const result = await buildProjectExportPdf\([\s\S]*?await saveRendered\(\)/.test(exportModal) &&
    /const saveRendered[\s\S]*?window\.api\.export\.pdf\(/.test(exportModal),
  'The save dialog must only open after every page has been rendered'
)
assert.ok(
  /rendered\.current = result\.bytes/.test(exportModal) &&
    /Try again/.test(exportModal) &&
    /Save to downloads/.test(exportModal),
  'A failed save must keep the rendered document and offer to save it again'
)
// A running app whose background process predates Export answers that it has
// never heard of the channel. The document exists; saving it must still work.
assert.ok(
  /No handler registered\/i\.test\(message\)[\s\S]*?downloadRendered\(\)/.test(exportModal),
  'A missing save channel must fall back to the download instead of failing'
)
assert.ok(
  /Rendering \$\{only\.label\}/.test(exportModal) && /export-bar/.test(exportModal),
  'The export must show a loading screen naming the sections being rendered'
)
assert.ok(
  /mapWithConcurrency\(inStage, RENDER_CONCURRENCY/.test(exportLib),
  'Sections within a stage must render several at a time, not one after another'
)
assert.ok(
  /const merged = await PDFDocument\.create\(\)[\s\S]*?for \(const \[position, parts\] of produced\.entries\(\)\)/.test(
    exportLib
  ),
  'Parallel section results must still be merged in print-view order'
)
assert.ok(
  /sections: ExportSection\[\] = tasks\.map[\s\S]*?state: 'queued'[\s\S]*?report\(\)/.test(exportLib),
  'The whole section plan must be reported before rendering starts'
)

// --- Save location and default file name -------------------------------------
assert.ok(
  /ipcMain\.handle\('export:pdf'[\s\S]*?showSaveDialog[\s\S]*?defaultPath: defaultPath \|\| `\$\{sanitize\(name\)\}\.pdf`/.test(
    ipc
  ),
  'Export must ask for a location, defaulting the file name to the project name'
)
assert.ok(
  /endsWith\('\.pdf'\)/.test(ipc),
  'A typed file name without the extension must still be written as a PDF'
)

// --- Preview pages keep their own paper --------------------------------------
assert.ok(
  /classOrientation/.test(previewPrint) && /minHeight/.test(previewPrint),
  'Page geometry must be read back off the rendered pages, including per-page orientation'
)
assert.ok(
  /@media print\{body,body \*\{visibility:visible!important\}\}/.test(previewPrint),
  "Preview markup must undo the app's own print blanking"
)

// --- Cancelling and stalls ---------------------------------------------------
assert.ok(
  /Cancel export/.test(exportModal) && /new AbortController\(\)/.test(exportModal),
  'The export must offer a cancel button backed by a real abort signal'
)
// A store subscription would hand the effect a new project object every time
// anything saves, tearing the export down half way through.
assert.ok(
  /const \[project\] = useState\(\(\) => useStore\.getState\(\)\.project\)/.test(exportModal) &&
    !/useStore\(\(state\) => state\.project\)/.test(exportModal),
  'The export must run against one project snapshot, not a live store subscription'
)
assert.ok(
  /activity\('collating pages into one document'\)/.test(exportLib) &&
    /activity\(`writing \$\{merged\.getPageCount\(\)\} pages`\)/.test(exportLib) &&
    /STAGE_NAMES\[stage\]/.test(exportLib),
  'Work after the last section must report itself too: stages, collating, writing'
)
assert.ok(
  /signal\?: AbortSignal/.test(exportLib) && /throwIfAborted\(signal\)/.test(exportLib),
  'Export must stop at the next section boundary once cancelled'
)
assert.ok(
  /withTimeout\(entry\.produce\(phase\), entry\.label\)/.test(exportLib),
  'A section that never returns must fail by name instead of hanging the export'
)

const mainPrint = read('src/main/print.ts')
assert.ok(
  /Promise\.race\(\[\s*win\.loadFile/.test(mainPrint) && /LOAD_TIMEOUT_MS/.test(mainPrint),
  'A page whose sub-resources stall must still be printed instead of waiting for ever'
)
assert.ok(
  /let printQueue: Promise<unknown>/.test(mainPrint) &&
    /printQueue\.then\(\(\) => renderPdf\(req\)\)/.test(mainPrint) &&
    /return enqueue\(req\)/.test(mainPrint),
  'Print requests must be rendered one at a time; concurrent printToPDF calls wedge'
)
assert.ok(
  /withTimeout\(\s*win\.webContents\.printToPDF/.test(mainPrint) && /PRINT_TIMEOUT_MS/.test(mainPrint),
  'A wedged printToPDF must fail rather than hold the whole print queue open'
)

// --- A stall must name its own step ------------------------------------------
assert.ok(
  /phase\('printing'\)/.test(exportLib) &&
    /entry\.produce\(phase\)/.test(exportLib) &&
    /console\.info\(`\[export\] \$\{entry\.label\}: \$\{detail\}/.test(exportLib),
  'Each section must report the step it has reached, to screen and to the console'
)
assert.ok(
  /yieldToUi\(\)/.test(exportLib),
  'The export must hand the UI a turn so its timings keep ticking'
)
assert.ok(
  /section\.detail && <small className="export-step-detail">/.test(exportModal),
  'The progress list must show the step each section is on'
)

const dataSheetPrint = read('src/renderer/src/lib/dataSheetPrint.tsx')
assert.ok(
  /withDeadline\(\s*supabase\.storage/.test(dataSheetPrint),
  'A figure download that never arrives must not hold the export open'
)

// --- A cover saved with the bundler's asset path still prints its emblem -----
const documentHtml = read('src/renderer/src/lib/documentHtml.ts')
const emblem = read('src/renderer/src/lib/emblem.ts')
const abstractPage = read('src/renderer/src/components/print/GeneralAbstractPage.tsx')
const smartAbstract = read('src/renderer/src/lib/smartAbstractPagination.ts')
assert.ok(
  /printableImageSource\(drawing\.source\)/.test(documentHtml) &&
    /isEmblemSource\(source\) \? emblemSource\(\)/.test(documentHtml),
  'A Front Page storing the emblem as an asset path must still print the emblem'
)
// `?inline` is a transform: a dev server answers a request for that path with
// the JavaScript module, not the image.
assert.ok(
  /png\?url'/.test(emblem) &&
    /looksLikePng\(bytes\)/.test(emblem) &&
    /for \(const candidate of candidates\)/.test(emblem),
  'The emblem must try both asset forms and accept only real PNG bytes'
)
assert.ok(
  /\[emblem\] not embedded/.test(emblem),
  'Failing to embed the emblem must say so rather than print a broken image silently'
)
assert.ok(
  /await ensureEmblemInlined\(\)/.test(exportLib),
  'The Front Page export must embed its saved emblem'
)
const abstractExportTask =
  /task\('General Abstract', STAGE\.abstract,[\s\S]*?\n    \}\)/.exec(exportLib)?.[0] ?? ''
assert.ok(
  !/emblemSource|ga-sheet-masthead|Schedule of Rates|Government of Telangana/.test(
    abstractPage
  ),
  'The General Abstract must begin with its own title, without a Government masthead'
)

// --- Sheets must not spend a page on their own footer ------------------------
assert.ok(
  /\.pp-page-tag,\.pp-section-heading[^}]*display:none!important/.test(previewPrint),
  'On-screen page labels must not print, nor cost the sheet their height'
)
assert.ok(
  /tr\.ga-row-total,tr\.ga-row-grand,\.ga-sheet-total\{break-before:avoid/.test(previewPrint),
  'A total must not be orphaned from the rows it totals'
)
// The sheet uses readable type and owns its page breaks before printing.
const abstractCss = read('src/renderer/src/styles/styles.css')
assert.ok(
  /\.ga-sheet-frame \{[\s\S]*?font-size: max\(14px, 0\.875em\)/.test(abstractCss) &&
    !/\.pp-ga-frame/.test(abstractCss),
  'The General Abstract must use its own print sheet with a 14 px body minimum'
)
// Rows stay compact; hidden capacity probes still measure the available sheet.
assert.ok(
  /\.ga-sheet-schedule \{[\s\S]*?flex: none/.test(abstractCss) &&
    /\.ga-sheet-table \{[\s\S]*?height: auto/.test(abstractCss) &&
    /\.ga-sheet-probe:not\(\.ga-sheet-row-probe\) \.ga-sheet-schedule \{[\s\S]*?flex: 1 1 auto/.test(abstractCss),
  'Continuation rows must remain compact while probes still measure each page capacity'
)
// Printed in black and white, colour alone cannot carry a distinction.
assert.ok(
  /\.ga-sheet-total strong \{[\s\S]*?color: #fff/.test(abstractCss),
  'The sanctioned figure must be reversed white, not a tint that greys out in mono'
)
assert.ok(
  !/fitToOnePage|SMALLEST_ABSTRACT_ZOOM|\.ga-sheet-frame\{zoom:/.test(exportLib),
  'The General Abstract export must never zoom below its 14 px readability floor'
)
assert.ok(
  /height: `\$\{height\}mm`/.test(projectView) &&
    /height: `\$\{height\}mm`/.test(exportLib) &&
    /preservePageBox: true/.test(abstractExportTask),
  'Every General Abstract PDF page must preserve the exact fixed sheet shown in View Print View'
)
assert.ok(
  /data-ga-row-probe/.test(abstractPage) &&
    /getBoundingClientRect\(\)\.height/.test(abstractPage) &&
    /data-ga-capacity/.test(abstractPage) &&
    /chooseSmartAbstractPlan\(profiles\)/.test(abstractPage),
  'The General Abstract must measure real rows and final signature capacity before choosing pages'
)
assert.ok(
  !/ABSTRACT_FLOW_CSS|abstractFitsOnePage|neededHeight = frame\.scrollHeight/.test(exportLib) &&
    /querySelectorAll\('\.ga-sheet\.pp-page'\)/.test(abstractExportTask),
  'PDF export must consume the settled smart pages instead of reflowing one preview page'
)
assert.ok(
  /page\.isContinuation[\s\S]*?<AbstractTitle continuation=\{page\.isContinuation\}/.test(abstractPage) &&
    /<TableHead \/>/.test(abstractPage) &&
    /page\.isFinal && <FinalBlock/.test(abstractPage),
  'Continuation sheets must repeat the Abstract furniture while totals/signatures remain final-page-only'
)
assert.ok(
  /MIN_FINAL_DETAIL_ROWS = 4/.test(smartAbstract) &&
    /keepWithPrevious/.test(smartAbstract) &&
    /forcedFinalTail/.test(smartAbstract) &&
    /removesPage \|\| removesOrphan/.test(smartAbstract),
  'Smart Abstract pagination must balance orphan rows and compact only when that resolves the orphan'
)
assert.ok(
  /preservePageBox/.test(previewPrint) &&
    /overflow:hidden!important/.test(previewPrint) &&
    /width:auto!important;height:auto!important;min-height:0!important/.test(previewPrint),
  'The preview PDF wrapper must support both fixed-page fidelity and normal-flow pagination'
)
assert.ok(
  /const COMPONENT_MIN_FONT_SIZE = 11/.test(componentPrint) &&
    /enforceComponentMinimumFontSize\(request\.html\)/.test(componentPrint) &&
    /enforceComponentMinimumFontSize\([\s\S]*?withItemDescription/.test(componentPrint) &&
    /const readableHtml[\s\S]*?applySignatureFooterToPdf\([\s\S]*?readableHtml/.test(componentPrint),
  'component renders must lift only tiny fonts before adding exempt signature fields'
)
// The signature is a non-shrinking member of the abstract's page frame.
assert.ok(
  /\.ga-sheet \.signature-print-footer \{[\s\S]*?flex: none/.test(abstractCss),
  'The General Abstract signature block must not be squeezed out by its schedule'
)
assert.ok(
  /\.ga-sheet \.signature-print-footer \{[\s\S]*?align-items: flex-start/.test(abstractCss) &&
    /\.ga-sheet \.signature-print-footer \{[\s\S]*?min-height: 32mm/.test(abstractCss) &&
    /\.ga-sheet \.signature-print-footer strong \{[\s\S]*?font-size: max\(11px, \.82em\)/.test(abstractCss),
  'The General Abstract signatures must share one row with a deep signing area and compact names'
)
assert.ok(
  /SEIGNIORAGE_FOOTER_CSS/.test(exportLib) &&
    /\.seig-print-page\{padding-bottom:6mm!important\}/.test(exportLib),
  'The seigniorage signatures must sit in the band reserved for them, not on a new page'
)

console.log('export pdf: all assertions passed')
