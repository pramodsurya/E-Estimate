// Every project carries a Front Page then an Introduction as its first two
// children — created with new projects, and back-filled into ones saved before
// those pages existed.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const store = fs.readFileSync(path.join(root, 'src/renderer/src/store/useStore.ts'), 'utf8')

// The helper is the single place these pages get added.
assert.ok(/function ensurePinnedPages\(/.test(store), 'ensurePinnedPages helper is missing')

const helper = /function ensurePinnedPages\([\s\S]*?\n\}/.exec(store)[0]

// Both pinned pages are declared, front first.
assert.ok(/'front'/.test(helper), 'the front page template must be declared')
assert.ok(/'introduction'/.test(helper), 'the introduction template must be declared')
assert.ok(
  helper.indexOf("template: 'front'") < helper.indexOf("template: 'introduction'"),
  'the Front Page must be declared before the Introduction'
)

// It must skip a template that is already present rather than duplicating it.
assert.ok(
  /child\.pageTemplate === template/.test(helper),
  'ensurePinnedPages must skip templates that are already present'
)
// Pages are inserted at the front of the child list.
assert.ok(/\.\.\.children\]/.test(helper), 'pinned pages must be inserted at the front')
// An unchanged tree keeps its identity, so opening a project cannot mark it dirty.
assert.ok(
  /children === root\.children \? root :/.test(helper),
  'ensurePinnedPages must return the original root when nothing was added'
)

// Both entry points use it: creating a project, and loading one from disk.
assert.ok(
  /normalizeLoaded[\s\S]*?root: ensurePinnedPages\(/.test(store),
  'normalizeLoaded must back-fill the pinned pages for existing projects'
)
assert.ok(
  /createProject: \(meta\) => \{[\s\S]*?ensurePinnedPages\(/.test(store),
  'createProject must create the pinned pages'
)

// normalizeLoaded is what both open paths run through.
for (const action of ['openProjectFromDisk', 'openRecent']) {
  const body = new RegExp(`${action}: async \\([\\s\\S]*?\\n    \\},`).exec(store)
  assert.ok(body, `${action} not found`)
  assert.ok(
    /normalizeLoaded\(/.test(body[0]),
    `${action} must run the project through normalizeLoaded`
  )
}

// --- Behavioural check of the insert/skip logic ----------------------------

function ensure(children) {
  // Mirrors the helper: insert back to front so 'front' ends up on top.
  let next = children
  for (const template of ['introduction', 'front']) {
    if (next.some((c) => c.pageTemplate === template)) continue
    next = [{ kind: 'page', pageTemplate: template }, ...next]
  }
  return next
}

// A legacy project with neither page gains both, in order, at the front.
const legacy = [{ kind: 'component', name: 'Bund' }, { kind: 'component', name: 'Drops' }]
const filled = ensure(legacy)
assert.equal(filled.length, 4)
assert.deepEqual(
  filled.slice(0, 2).map((c) => c.pageTemplate),
  ['front', 'introduction'],
  'Front Page must come before Introduction'
)
assert.equal(filled[2].name, 'Bund', 'existing children must keep their order')

// Running it again changes nothing — reopening must not stack pages.
assert.equal(ensure(filled).length, 4)
assert.equal(ensure(ensure(ensure(filled))).length, 4)

// A project that already has an Introduction only gains the Front Page.
const partial = [{ kind: 'component', name: 'Bund' }, { kind: 'page', pageTemplate: 'introduction' }]
const topped = ensure(partial)
assert.equal(topped.length, 3)
assert.equal(topped[0].pageTemplate, 'front')
assert.equal(
  topped.filter((c) => c.pageTemplate === 'introduction').length,
  1,
  'the existing Introduction must not be duplicated'
)

// --- Pinned pages are locked in the tree -----------------------------------

const nodeVisual = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/nodeVisual.tsx'),
  'utf8'
)
assert.ok(
  /if \(node\.pageTemplate\) return false/.test(nodeVisual),
  'pinned pages must not be renamable'
)

const tree = fs.readFileSync(path.join(root, 'src/renderer/src/lib/tree.ts'), 'utf8')
assert.ok(
  /if \(a\.pageTemplate \|\| b\.pageTemplate\) return false/.test(tree),
  'pinned pages must not be drag-reorderable'
)

// --- Images are enabled on the Front Page only -----------------------------

const pageEditor = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/editors/PageEditor.tsx'),
  'utf8'
)
assert.ok(
  /const isFrontPage = node\.pageTemplate === 'front'/.test(pageEditor) &&
    /allowImages=\{isFrontPage\}/.test(pageEditor),
  'image support must be limited to the Front Page'
)

// --- Front-cover migration and village lookup -----------------------------

const univerDocument = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/univerDocument.ts'),
  'utf8'
)
assert.ok(
  /node\.pageTemplate === 'front'[\s\S]*?!node\.frontCoverInitialized[\s\S]*?isUniverDocumentBlank\(existing\)/.test(
    univerDocument
  ),
  'a genuinely blank legacy Front Page must receive the cover template once'
)
assert.ok(
  /if \(existing\)[\s\S]*?withoutFrontCoverParagraphBorders\(existing\)[\s\S]*?: existing/.test(univerDocument),
  'an existing customized Front Page must be preserved apart from obsolete paragraph rules'
)

const documentEditor = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/editors/UniverDocument.tsx'),
  'utf8'
)
assert.ok(
  /resolveVillageLocation\(projectMeta\.location\)/.test(documentEditor),
  'the Front Page must resolve village details from the village_allowance lookup'
)
assert.ok(
  !/FUniver/.test(documentEditor) &&
    /UniverInstanceType\.UNIVER_DOC/.test(documentEditor) &&
    /get\(ICommandService\)/.test(documentEditor),
  'Docs must use their own core model so Sheets facade services are not requested during export'
)
assert.ok(
  /flush\(true\)/.test(documentEditor) &&
    /JSON\.stringify\(currentDocumentData\) !== lastSerialized/.test(documentEditor),
  'a retiring Front Page editor must not overwrite a newly added cost object'
)

assert.ok(
  /Update Cost/.test(pageEditor) &&
    /updateFrontCoverEstimatedCost\(node, estimatedCost\)/.test(pageEditor),
  'the Front Page toolbar must update only its Dashboard cost object'
)
assert.ok(
  /Add Cost/.test(pageEditor) &&
    /addFrontCoverEstimatedCost\(node, dashboardCost\)/.test(pageEditor) &&
    /applyDrawingSnapshot\(documentData, drawingId\)/.test(pageEditor) &&
    /frontCoverHasEstimatedCost\(node\)/.test(pageEditor),
  'the Front Page toolbar must insert one movable cost image through Univer'
)
assert.ok(
  !/Rebuild Front Cover|window\.confirm|createFrontCoverDocumentData/.test(pageEditor),
  'updating cost must never rebuild or replace a customized Front Cover'
)

const titleDashboard = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/dashboard/TitleDashboard.tsx'),
  'utf8'
)
assert.ok(
  !/Update Cost/.test(titleDashboard),
  'the cost update action must remain on the Front Page'
)

assert.ok(
  !/DETAILED ESTIMATE/.test(univerDocument) &&
    /ESTIMATED COST/.test(univerDocument) &&
    /FRONT_COVER_COST_DESCRIPTION/.test(univerDocument) &&
    /PositionedObjectLayoutType\.WRAP_NONE/.test(univerDocument) &&
    /allowTransform: true/.test(univerDocument) &&
    /GeoID/.test(univerDocument) &&
    /SUB-DIVISION NO\./.test(univerDocument),
  'the default Front Cover must use a movable Dashboard-cost object'
)
assert.ok(
  /export function updateFrontCoverEstimatedCost\(/.test(univerDocument) &&
    /source: replacement\.source/.test(univerDocument) &&
    /\.\.\.storedCost\[1\]/.test(univerDocument),
  'cost refresh must retain the saved drawing transform and replace only its source'
)
assert.ok(
  /export function addFrontCoverEstimatedCost\(/.test(univerDocument) &&
    /setFrontCoverEstimatedCost\(node, value, true\)/.test(univerDocument) &&
    /canvas\.toDataURL\('image\/png'\)/.test(univerDocument) &&
    /export function frontCoverHasEstimatedCost\(/.test(univerDocument),
  'adding cost must create one movable PNG cost object while preventing duplicates'
)

const projectPrintView = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/print/ProjectPrintView.tsx'),
  'utf8'
)
assert.ok(
  /<UniverDocument[\s\S]*?preview/.test(projectPrintView),
  'VPV must render the stored Front Page through Univer itself'
)
assert.ok(
  !/documentToHtml\(node\.documentData\)/.test(projectPrintView),
  'VPV must not reconstruct the Front Page with a separate HTML layout'
)

console.log('pinned pages: all assertions passed')
