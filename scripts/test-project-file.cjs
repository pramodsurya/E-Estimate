// What a .eestimate file carries, and what it must not carry twice.
//
// The dashboard snapshot indexes every rate analysis several times over. In
// memory those are shared references; in JSON they are full copies. The
// compaction removes the copies, and the only thing that matters is that the
// project that comes back out is the one that went in.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(relative) {
  const filePath = path.join(root, relative)
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filePath
  })
  const module_ = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(module_, module_.exports, require)
  return module_.exports
}

const { compactProjectForSave, expandLoadedProject, approximateBytes } = loadTsModule(
  'src/renderer/src/lib/projectFile.ts'
)

/** A recipe big enough that copying it matters, as the real ones are. */
const recipe = (code, over = {}) => ({
  itemKey: `SSR:${code}`,
  itemCode: code,
  itemSource: 'SSR',
  year: '2026-27',
  zone: 'zone_3',
  description: 'Providing and laying '.repeat(12),
  outputQuantity: 10,
  layout: {
    codeVisible: true,
    descriptionVisible: true,
    descriptionRuns: Array.from({ length: 8 }, (_, i) => ({
      text: `run ${i} `.repeat(6),
      bold: false,
      italic: false,
      underline: false
    })),
    sections: {}
  },
  sections: [
    {
      key: 'materials',
      label: 'Materials',
      lines: Array.from({ length: 12 }, (_, i) => ({
        id: `materials-${i}-${i}`,
        slNo: String(i + 1),
        description: `Resource ${i} `.repeat(5),
        unit: 'cum',
        quantity: i + 1,
        rate: 100 + i,
        amount: (i + 1) * (100 + i),
        sourceValues: { quantity: String(i + 1), rate: String(100 + i), amount: '0' }
      }))
    }
  ],
  ...over
})

const itemIds = ['i1', 'i2', 'i3', 'i4']
const published = Object.fromEntries(itemIds.map((id) => [id, recipe(id)]))
// i4 carries a project edit, so its merged form genuinely differs.
const editedMerged = recipe('i4', { outputQuantity: 99 })

const project = {
  id: 'p1',
  meta: { name: 'Test', sorYear: '2026-27' },
  root: {
    id: 'root',
    kind: 'title',
    name: 'Test',
    children: [
      {
        id: 'c1',
        kind: 'component',
        name: 'Bund',
        children: [
          { id: 'i1', kind: 'item', name: 'i1', children: [] },
          {
            id: 's1',
            kind: 'subcomponent',
            name: 'Sub',
            children: [
              { id: 'i2', kind: 'item', name: 'i2', children: [] },
              { id: 'i3', kind: 'item', name: 'i3', children: [] }
            ]
          }
        ]
      },
      {
        id: 'c2',
        kind: 'component',
        name: 'Sluice',
        children: [{ id: 'i4', kind: 'item', name: 'i4', children: [] }]
      }
    ]
  },
  dashboardSnapshot: {
    syncedAt: 'now',
    context: { sorYear: '2026-27', sorZone: 'zone_3', areaAllowancePercent: 0 },
    syncedItemIds: itemIds,
    rates: { i1: 1, i2: 2, i3: 3, i4: 4 },
    recipes: published,
    gstRules: [],
    // The parent component carries its sub-component's items too, exactly as
    // `collectDashboardItems` gathers them.
    componentRecipes: {
      c1: { i1: published.i1, i2: published.i2, i3: published.i3 },
      s1: { i2: published.i2, i3: published.i3 },
      c2: { i4: editedMerged }
    },
    projectRecipes: {
      i1: published.i1,
      i2: published.i2,
      i3: published.i3,
      i4: editedMerged
    }
  }
}

// --- Nothing is lost -------------------------------------------------------
const compacted = compactProjectForSave(project)
const restored = expandLoadedProject(JSON.parse(JSON.stringify(compacted)))

assert.deepEqual(
  restored.dashboardSnapshot.componentRecipes,
  project.dashboardSnapshot.componentRecipes,
  'every component map must come back exactly as it went in'
)
assert.deepEqual(
  restored.dashboardSnapshot.projectRecipes,
  project.dashboardSnapshot.projectRecipes,
  'the project map must come back exactly as it went in'
)
assert.deepEqual(
  restored.dashboardSnapshot.recipes,
  project.dashboardSnapshot.recipes,
  'the published recipes are untouched'
)
assert.equal(
  restored.dashboardSnapshot.projectRecipes.i4.outputQuantity,
  99,
  'an item whose merged recipe differs from the published one keeps its own'
)

// The on-disk form must not carry the expanded maps at all.
assert.equal(compacted.dashboardSnapshot.componentRecipes, undefined)
assert.equal(compacted.dashboardSnapshot.projectRecipes, undefined)
assert.deepEqual(compacted.dashboardSnapshot.componentItemIds.c1, ['i1', 'i2', 'i3'])
// Only the edited one needed storing; the other three are read from `recipes`.
assert.deepEqual(Object.keys(compacted.dashboardSnapshot.mergedRecipes), ['i4'])

// --- The live project is never touched ------------------------------------
assert.ok(
  project.dashboardSnapshot.componentRecipes.c1.i1,
  'compacting must not mutate the project being edited'
)
assert.equal(project.dashboardSnapshot.projectRecipes.i4.outputQuantity, 99)

// --- A file written before this still loads -------------------------------
{
  const legacy = JSON.parse(JSON.stringify(project))
  const loaded = expandLoadedProject(legacy)
  assert.deepEqual(
    loaded.dashboardSnapshot.componentRecipes,
    project.dashboardSnapshot.componentRecipes,
    'an older file keeps its expanded maps and loads unchanged'
  )
}

// --- A project with no snapshot survives ----------------------------------
{
  const bare = { id: 'p2', meta: {}, root: { id: 'r', kind: 'title', name: 'x', children: [] } }
  assert.deepEqual(compactProjectForSave(bare), bare)
  assert.deepEqual(expandLoadedProject(bare), bare)
}

// --- And it is actually smaller -------------------------------------------
const before = approximateBytes(project)
const after = approximateBytes(compacted)
const saved = 1 - after / before
assert.ok(
  saved > 0.5,
  `compaction must remove most of the duplication (removed ${(saved * 100).toFixed(1)}%)`
)
console.log(
  `project file: all assertions passed — snapshot ${(saved * 100).toFixed(1)}% smaller ` +
    `(${before} → ${after} bytes on the fixture)`
)

// --- A new project must be given a file before work starts ---------------
// The autosave is gated on the project having a path, so until one exists
// nothing typed is being kept.
const store = fs.readFileSync(path.join(root, 'src/renderer/src/store/useStore.ts'), 'utf8')
assert.ok(
  /createProject: \(meta\) =>[\s\S]*?void get\(\)\.saveProjectAs\(\)/.test(store),
  'creating a project must ask where it should live'
)
assert.ok(
  /startNewProject: \(\) =>[\s\S]{0,400}filePath: null/.test(store),
  'starting a new project must clear the previous file, or the autosave would overwrite it'
)
assert.ok(
  /if \(!project \|\| !filePath \|\| !dirty\) return/.test(
    fs.readFileSync(path.join(root, 'src/renderer/src/App.tsx'), 'utf8')
  ),
  'the autosave gate is what makes the notice necessary; it must still be there'
)
const app = fs.readFileSync(path.join(root, 'src/renderer/src/App.tsx'), 'utf8')
assert.ok(
  /function UnsavedProjectNotice/.test(app) &&
    /if \(!project \|\| filePath\) return null/.test(app) &&
    /showShell && <UnsavedProjectNotice \/>/.test(app),
  'a cancelled save must be said plainly, on every screen, until there is a file'
)

// --- Saving must write the compacted form --------------------------------
assert.ok(
  /compactProjectForSave\(project\)/.test(store) &&
    /const data = expandLoadedProject\(rawData\)/.test(store),
  'the file is written compacted and expanded on load'
)

console.log('project file: save-gate and compaction wiring guards passed')
