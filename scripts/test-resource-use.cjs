// Resources the app holds while it is just sitting there.
//
// Every check here guards something that was found consuming memory, CPU or
// disk for no benefit: history entries spent per keystroke, catalogues that
// never aged out, an asset limit that inlined the whole assets folder into the
// JS heap, and a preview that rasterised every page of a document nobody had
// scrolled to.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

function loadModule(relative) {
  const source = read(relative)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  })
  const module_ = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module_, module_.exports, require)
  return module_.exports
}

// --- Undo: a typing run is one step, not one step per 600 ms ---------------
const history = loadModule('src/renderer/src/store/history.ts')
const { foldsIntoPreviousEntry, HISTORY_COALESCE_MS, MAX_HISTORY } = history

assert.ok(
  HISTORY_COALESCE_MS > 600,
  'the coalesce window must outlast the editor persist debounce, or nothing ever folds'
)

const run = (key, at) => ({ key, at })
const now = 10_000

// Consecutive saves of one document share an entry.
assert.equal(
  foldsIntoPreviousEntry(run('document:a', now - 600), 'document:a', now, 5),
  true,
  'a save that continues a typing run must fold into the run’s entry'
)
// A pause ends the run.
assert.equal(
  foldsIntoPreviousEntry(run('document:a', now - HISTORY_COALESCE_MS - 1), 'document:a', now, 5),
  false,
  'a pause longer than the window must start a new undo step'
)
// A different document is a different run.
assert.equal(
  foldsIntoPreviousEntry(run('document:a', now - 100), 'document:b', now, 5),
  false,
  'switching documents must not fold two documents into one undo step'
)
// An edit with no run key never folds — that is every other kind of edit.
assert.equal(
  foldsIntoPreviousEntry(run('document:a', now - 100), undefined, now, 5),
  false,
  'an edit that names no run must always spend its own entry'
)
assert.equal(
  foldsIntoPreviousEntry(null, 'document:a', now, 5),
  false,
  'the first edit after a run has ended must spend its own entry'
)
// Nothing to fold into on a freshly opened project.
assert.equal(
  foldsIntoPreviousEntry(run('document:a', now - 100), 'document:a', now, 0),
  false,
  'the first edit after opening a project must spend an entry, whatever the run says'
)
assert.ok(MAX_HISTORY > 0, 'history depth must be positive')

// The store must actually use the policy, name its runs, and end them.
const store = read('src/renderer/src/store/useStore.ts')
assert.ok(
  /foldsIntoPreviousEntry\(historyRun, coalesceKey, now, s\.past\.length\)/.test(store) &&
    /`document:\$\{id\}`/.test(store),
  'the store must fold document saves through the shared history policy'
)
for (const action of ['undo', 'redo', 'deleteNode', 'saveRateAnalysis', 'restoreRateAnalysisDefaults']) {
  assert.ok(
    new RegExp(`${action}: \\(.*?\\) =>\\s*(\\{\\s*)?endHistoryRun\\(\\)`, 's').test(store),
    `${action} must end the current run so a later save cannot fold into its entry`
  )
}
assert.ok(
  /function mutateProject[\s\S]{0,80}endHistoryRun\(\)/.test(store),
  'a project-level mutation must end the run too'
)

// --- Catalogues must age out of memory -------------------------------------
const masterData = read('src/renderer/src/lib/masterData.ts')
assert.ok(
  /const MAX_CACHED_CATALOGUES/.test(masterData) &&
    /evictOldest\(cache\)/.test(masterData) &&
    /if \(!settled\.has\(entry\)\) continue/.test(masterData),
  'the in-memory catalogue caches must be bounded, and never evict a fetch in flight'
)
assert.ok(
  /cache\.delete\(key\)\s*\n\s*cache\.set\(key, existing\)/.test(masterData),
  'a cache hit must move the entry to the most-recently-used end'
)

// --- The bundle must not carry the assets folder as base64 -----------------
const viteConfig = read('electron.vite.config.ts')
assert.ok(
  !/assetsInlineLimit/.test(viteConfig),
  'the emblem is inlined by its own `?inline` import; raising the limit inlines everything else too'
)
for (const [file, relative] of [
  ['emblem.ts', 'src/renderer/src/lib/emblem.ts'],
  ['univerDocument.ts', 'src/renderer/src/lib/univerDocument.ts']
]) {
  assert.ok(
    /emblem-telangana\.png\?inline/.test(read(relative)),
    `${file} must keep the explicit ?inline import the Front Cover snapshot depends on`
  )
}
assert.ok(
  /emblem-telangana\.png\?url/.test(read('src/renderer/src/lib/emblem.ts')),
  'the servable-address fallback must stay a real file URL, not a second data URL'
)

// --- Previews must rasterise what is on screen, not the whole document -----
const pageStack = read('src/renderer/src/components/print/PdfPageStack.tsx')
assert.ok(
  /const RETAINED_PAGES/.test(pageStack) &&
    /new IntersectionObserver/.test(pageStack) &&
    /evictFurthest/.test(pageStack),
  'the page stack must render on demand and release pages that scroll away'
)
assert.ok(
  /getViewport\(\{ scale: 1 \}\)/.test(pageStack) &&
    /aspectRatio/.test(pageStack),
  'page shapes must be measured up front so placeholders hold their place in the scroll'
)
assert.ok(
  /if \(visibleRef\.current\.has\(index\)\) continue/.test(pageStack),
  'a page that is actually on screen must never be evicted'
)
assert.ok(
  /generationRef/.test(pageStack) &&
    /generationRef\.current !== generation/.test(pageStack),
  'a render awaiting the old document must not publish into the new one'
)
assert.ok(
  /canvas\.width = 0/.test(pageStack),
  'the canvas backing store must be released once the PNG exists'
)
assert.ok(
  /function nearestScroller/.test(pageStack) &&
    /root: nearestScroller\(containerRef\.current\)/.test(pageStack),
  'the observer must watch whichever element actually scrolls the list'
)

console.log('resource use: all assertions passed')
