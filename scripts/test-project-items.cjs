const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  })
  const loadedModule = new Module(filePath, module)
  loadedModule.filename = filePath
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const {
  collectProjectItemGroups,
  projectItemDisplayName,
  projectItemGroupIndex,
  projectItemGroups,
  projectItemKey,
  rateAnalysisOverrideForNode
} = loadTsModule(path.join(root, 'src/renderer/src/lib/projectItems.ts'))
const { removeNode } = loadTsModule(path.join(root, 'src/renderer/src/lib/tree.ts'))

function item(id, extra = {}) {
  return {
    id,
    kind: 'item',
    name: 'IRR-GAW-1-10',
    children: [],
    itemSource: 'SSR',
    categoryKey: 'ssr_item',
    itemCode: 'IRR-GAW-1-10',
    ...extra
  }
}

function component(id, children) {
  return { id, kind: 'component', name: id, children }
}

{
  const rootNode = {
    id: 'title', kind: 'title', name: 'Project', children: [
      component('a', [item('master-a'), item('master-b')]),
      component('b', [
        item('clone-a', {
          name: 'IRR-GAW_Gate A', splitFromItemKey: 'SSR:ssr_item:IRR-GAW-1-10',
          createdDataId: 'created-1'
        }),
        item('clone-b', {
          name: 'IRR-GAW_Gate A', splitFromItemKey: 'SSR:ssr_item:IRR-GAW-1-10',
          createdDataId: 'created-1'
        })
      ])
    ]
  }
  const groups = collectProjectItemGroups(rootNode)
  assert.equal(groups.length, 2)
  assert.equal(groups.find((group) => group.key === 'SSR:ssr_item:IRR-GAW-1-10').usages.length, 2)
  assert.equal(groups.find((group) => group.key === 'SPLIT:created-1').usages.length, 2)

  const onceDeleted = removeNode(rootNode, 'clone-a')
  assert.equal(
    collectProjectItemGroups(onceDeleted).find((group) => group.key === 'SPLIT:created-1').usages.length,
    1
  )
  const lastDeleted = removeNode(onceDeleted, 'clone-b')
  assert.equal(
    collectProjectItemGroups(lastDeleted).some((group) => group.key === 'SPLIT:created-1'),
    false
  )
}

{
  const sor = item('sor-pipe', {
    name: 'PH_MATERIAL_01_7B2047AC47D9',
    itemSource: 'SOR',
    categoryKey: 'sor_catalogue',
    itemCode: 'PH_MATERIAL_01_7B2047AC47D9',
    itemDescription: 'RCC plain-ended pipes — 1000 mm dia'
  })
  assert.equal(
    projectItemDisplayName(sor),
    'RCC plain-ended pipes — 1000 mm dia',
    'SOR item codes must remain internal and the description must be the visible identity'
  )
  assert.equal(
    collectProjectItemGroups(component('sor-root', [sor]))[0].displayName,
    'RCC plain-ended pipes — 1000 mm dia'
  )
}

{
  const projectData = item('project-data-a', {
    name: 'Project sand supply',
    itemSource: 'PROJECT_DATA',
    itemCode: 'DATA-SOR-001',
    itemDescription: 'Supplying sand',
    projectDataId: 'data-sor-001'
  })
  assert.equal(
    projectItemKey(projectData),
    'PROJECT_DATA:data-sor-001',
    'a project DATA definition must group all its Component usages together'
  )
  assert.equal(projectItemDisplayName(projectData), 'DATA-SOR-001')
}

{
  const usageA = item('usage-a')
  const usageB = item('usage-b')
  const rootNode = {
    id: 'title', kind: 'title', name: 'Project', children: [
      component('component-a', [usageA]),
      component('component-b', [usageB])
    ]
  }
  const key = projectItemKey(usageA)
  const shared = { itemKey: key, description: 'Shared DATA' }
  const scoped = { itemKey: key, description: 'Component A DATA' }
  const project = {
    root: rootNode,
    rateAnalysisOverrides: { [key]: shared },
    rateAnalysisScopedOverrides: { 'component-a': { [key]: scoped } }
  }
  assert.equal(rateAnalysisOverrideForNode(project, usageA), scoped)
  assert.equal(rateAnalysisOverrideForNode(project, usageB), shared)
}

// --- The grouping is computed once per project version ----------------------
// `getItemLeadRate` needs one group per item it prices. Walking the tree for
// each of them made totalling a component quadratic in the size of the project.
{
  const first = item('mem-1')
  const second = item('mem-2', { itemCode: 'IRR-GAW-2-20', name: 'IRR-GAW-2-20' })
  const treeRoot = { id: 'root', kind: 'title', name: 'P', children: [component('c1', [first, second])] }

  assert.equal(
    projectItemGroups(treeRoot),
    projectItemGroups(treeRoot),
    'the same project version must reuse one grouping, not walk the tree again'
  )
  assert.deepEqual(
    projectItemGroups(treeRoot),
    collectProjectItemGroups(treeRoot),
    'the memoised grouping must be exactly what the walk produces'
  )

  const index = projectItemGroupIndex(treeRoot)
  assert.equal(index, projectItemGroupIndex(treeRoot), 'the key index must be reused too')
  // Identity, not equality: the index must address the shared grouping itself.
  for (const group of projectItemGroups(treeRoot)) {
    assert.equal(index.get(group.key), group, `the index must address ${group.key} directly`)
  }
  assert.equal(index.get('no-such-key'), undefined, 'an unknown key must miss cleanly')

  // A mutation replaces the root, so the next version must not read the old
  // grouping — that is the whole reason the root is the cache key.
  const nextRoot = { ...treeRoot, children: [component('c1', [first])] }
  assert.notEqual(
    projectItemGroups(nextRoot),
    projectItemGroups(treeRoot),
    'a new project version must be grouped afresh'
  )
  assert.equal(projectItemGroups(nextRoot).length, 1, 'the new version must reflect the edit')
  assert.equal(projectItemGroups(treeRoot).length, 2, 'the old version must be untouched')
}

console.log('project Item/DATA ownership tests passed')
