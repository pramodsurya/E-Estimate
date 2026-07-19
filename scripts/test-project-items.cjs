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

console.log('project Item/DATA ownership tests passed')
