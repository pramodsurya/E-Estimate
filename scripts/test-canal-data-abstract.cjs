const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
require.extensions['.ts'] = (mod, filename) => mod._compile(compile(fs.readFileSync(filename, 'utf8')), filename)

const tree = require('../src/renderer/src/lib/tree.ts')
const canal = require('../src/renderer/src/lib/canal.ts')
const items = require('../src/renderer/src/lib/projectItems.ts')
const final = require('../src/renderer/src/lib/finalNumber.ts')
const { computeProjectAbstract } = require('../src/renderer/src/lib/projectAbstract.ts')

// Execute the production store actions without starting the desktop or network.
function storeFunction(name, context) {
  const filename = 'src/renderer/src/store/useStore.ts'
  const source = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true)
  let expression
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === name) expression = node.initializer.getText(source)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = `(${node.getText(source).replace(/^export\s+/, '')})`
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `Missing production function ${name}`)
  return new vm.Script(compile(`const action = ${expression}; action;`)).runInNewContext({ ...context })
}

function load(file, mocks) {
  const filename = path.join(root, file)
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = mod.require.bind(mod)
  mod.require = name => name in mocks ? mocks[name] : originalRequire(name)
  mod._compile(compile(fs.readFileSync(filename, 'utf8')), filename)
  return mod.exports
}

async function main() {
  const data = canal.defaultCanalData()
  Object.assign(data, { configured: true, lengthM: 100, jungleClearanceMode: 'manual', jungleClearanceRows: [{ id: 'clear', length: 100, breadth: 20 }] })
  data.design.bedLevelAtStart = 100
  data.sections = [0, 100].map(chainage => ({ id: `s-${chainage}`, chainage, ground: [{ offset: -50, rl: 110 }, { offset: 50, rl: 110 }], designPopulated: true }))
  const component = tree.createNode('component', 'Main Canal', { templateId: 'canal', canal: data })
  const manualItem = tree.createNode('item', 'Survey note item', { itemSource: 'OTHERS' })
  component.children.push(manualItem)
  let project = tree.createDraftProject()
  project.meta = { ...project.meta, name: 'Canal estimate', sorYear: '2026-27' }
  project.root.children.push(component)
  const context = {
    ...tree, ...canal,
    get: () => ({ project }),
    mutate: fn => { project = { ...project, root: fn(project.root) } },
    syncAllSlrbItems: node => node
  }
  const save = storeFunction('setCanal', context)
  const resolve = storeFunction('resolveCanalMaterials', context)
  const restore = storeFunction('ensureTemplateComponentsSynced', context)
  const current = () => tree.findNode(project.root, component.id)
  const generated = () => current().children.filter(item => item.templateGenerated)

  save(component.id, data)
  assert.ok(generated().length >= 2, 'Saving canal design generates clearance and excavation DATA usages')
  assert.equal(generated().find(item => item.itemCode === canal.CANAL_JUNGLE_CLEARANCE_CODE).computedQuantity, 2000)
  assert.ok(generated().some(item => item.templateItemRole === 'excavation' && item.computedQuantity > 0))
  for (const item of generated()) {
    assert.equal(item.itemSource, 'SSR', 'Bare canal codes must fetch SSR recipes')
    assert.equal(item.categoryKey, 'ssr_item')
  }
  assert.ok(items.projectItemGroups(project.root).some(group => group.code === canal.CANAL_JUNGLE_CLEARANCE_CODE), 'Generated canal items appear in the Data tree')

  const ids = generated().map(item => item.id)
  save(component.id, current().canal)
  assert.deepEqual(generated().map(item => item.id), ids, 'Repeated saves retain item identity and DATA edits')

  const masters = generated().map(item => ({ code: item.itemCode, side: 'SSR', category: 'ssr_item', description: `Published ${item.itemCode}`, unit: item.templateItemRole === 'clearance' ? 'SQM' : 'CUM' }))
  const fetchedPrefixes = []
  const template = load('src/renderer/src/lib/templateDashboardSync.ts', {
    './masterData': { fetchSsrItems: async prefix => { fetchedPrefixes.push(prefix); return masters.filter(master => master.code.startsWith(prefix)) } }
  })
  await template.resolveTemplateDashboardMaterials(project.root, {
    resolveCanalMaterials: resolve,
    resolveBundMaterials: () => { throw new Error('Unexpected bund') },
    setGuideWallMaterial: () => { throw new Error('Unexpected guide wall') }
  })
  assert.deepEqual(fetchedPrefixes.sort(), ['IRR-CAW', 'IRR-PMW'])
  assert.deepEqual(canal.unresolvedCanalMaterialCodes(current()), [])
  for (const item of generated()) {
    assert.equal(item.itemDescription, `Published ${item.itemCode}`)
    assert.ok(item.unit)
  }
  save(component.id, { ...current().canal, jungleClearanceRows: [{ id: 'clear', length: 100, breadth: 30 }] })
  assert.deepEqual(generated().map(item => item.id), ids)
  assert.ok(generated().every(item => item.itemDescription && item.unit), 'Catalogue metadata survives later quantity edits')

  const sync = load('src/renderer/src/lib/dashboardSync.ts', {
    './lead': {}, './leadApplicability': {}, './pipeLead': {}, './projectTax': {}, './seigniorage': {},
    './projectData': { projectDataForNode: () => null },
    './rateAnalysis': {
      fetchRateAnalysis: async node => {
        assert.equal(node.itemSource, 'SSR')
        assert.equal(node.categoryKey, 'ssr_item')
        return { itemSource: 'SSR', itemCode: node.itemCode, description: node.itemDescription, unit: node.unit, sections: [], publishedRate: node.templateItemRole === 'clearance' ? 2 : 10, outputQuantity: 1 }
      }
    }
  })
  // Exclude the unpriced custom item from the source-fetch phase; it remains in the component tree.
  const snapshot = await sync.syncDataDashboardSnapshot(project, generated())
  assert.equal(snapshot.dataDashboardEntries.length, generated().length)
  assert.ok(snapshot.dataDashboardEntries.every(entry => entry.synced && entry.rate > 0))
  const compiled = sync.compileComponentDashboardSnapshots(project, snapshot, [current()])
  const excavationQty = generated().filter(item => item.templateItemRole === 'excavation').reduce((sum, item) => sum + item.computedQuantity, 0)
  const expected = 3000 * 2 + excavationQty * 10
  assert.equal(compiled.componentTotals[component.id], expected, 'Component abstract costs measured quantities at compiled DATA rates')
  const abstract = computeProjectAbstract({ project, componentTotals: compiled.componentTotals, seigniorage: { totalSeigniorage: 0, totalDmft: 0, totalSmft: 0, totalPermit: 0 }, gstRate: 18 })
  assert.equal(abstract.componentsTotal, expected)
  assert.equal(abstract.componentLines[0].label, 'Main Canal')
  assert.ok(Math.abs(abstract.gstAmount - expected * 1.011 * 0.18) < 0.001)

  const rebuilt = restore(JSON.parse(JSON.stringify(project.root)))
  assert.deepEqual(tree.findNode(rebuilt, component.id).children.filter(item => item.templateGenerated).map(item => item.id), ids)
  const oldRoot = JSON.parse(JSON.stringify(project.root))
  const oldCanal = tree.findNode(oldRoot, component.id)
  oldCanal.children = [manualItem]
  oldCanal.canal.materialItems = []
  assert.ok(tree.findNode(restore(oldRoot), component.id).children.some(item => item.templateGenerated), 'Older projects regenerate canal items even with manually added items')

  save(component.id, { ...current().canal, jungleClearanceRows: [], sections: [] })
  assert.equal(generated().length, 0, 'Removing measurements removes stale canal DATA usages and quantities')
  assert.ok(current().children.some(item => item.id === manualItem.id), 'Manual items remain intact')
  assert.equal(final.componentItemsTotal(project, current()), 0)

  // The same code can have two chosen DATA variants. They need distinct, stable item IDs.
  const variants = ['a', 'b'].map(key => ({ kind: 'optional_addition', key, label: key, addonId: key }))
  const variantData = { ...data, excavationBands: variants.map(dataVariant => ({ pct: 50, label: dataVariant.label, material: { code: canal.CANAL_EXC_ALL_SOILS_CODE, dataVariant } })) }
  save(component.id, variantData)
  const variantItems = generated().filter(item => item.templateItemRole === 'excavation')
  assert.equal(variantItems.length, 2)
  const variantIds = variantItems.map(item => item.id)
  save(component.id, current().canal)
  assert.deepEqual(generated().filter(item => item.templateItemRole === 'excavation').map(item => item.id), variantIds)
  assert.equal(new Set(variantIds).size, 2)

  console.log('Canal DATA and abstracts: production saves, catalogue resolution, stable identities/variants, compiled rates/totals, old project recovery and stale item removal passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
