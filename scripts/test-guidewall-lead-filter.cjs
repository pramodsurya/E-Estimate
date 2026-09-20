const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const fs = require('node:fs')
const ts = require('typescript')

const rootDir = path.resolve(__dirname, '..')

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

const { syncGuideWallItems } = loadTsModule(path.join(rootDir, 'src/renderer/src/lib/guideWall.ts'))
const { projectItemGroups } = loadTsModule(path.join(rootDir, 'src/renderer/src/lib/projectItems.ts'))
const { fallbackLeadApplicability, parseLeadInfo, materialRefsForLeadInfo } = loadTsModule(path.join(rootDir, 'src/renderer/src/lib/leadApplicability.ts'))

function ensureTemplateComponentsSynced(root) {
  let next = root
  const visit = (node) => {
    if (node.templateId === 'guide-wall' || node.guideWall) {
      const gw = node.guideWall
      const hasLength =
        (gw?.lengthM ?? 0) > 0 ||
        (node.workingLine && node.workingLine.length >= 2) ||
        (gw?.alignment && gw.alignment.length >= 2)
      const hasItems = (node.children || []).some((c) => c.kind === 'item')
      if (hasLength && (!hasItems || !gw?.sections?.length)) {
        next = syncGuideWallItems(next, node.id)
      }
    }
    ;(node.children || []).forEach(visit)
  }
  visit(root)
  return next
}

// Mock project tree with 1 Guide Wall and 1 Other Component
const projectRoot = {
  id: 'root-1',
  kind: 'title',
  name: 'Project Root',
  children: [
    {
      id: 'gw-comp-1',
      kind: 'component',
      name: 'Guide Wall Left Bank',
      templateId: 'guide-wall',
      workingLine: [
        { lat: 17.5, lng: 78.5 },
        { lat: 17.51, lng: 78.51 }
      ],
      guideWall: {
        templateId: 'guide-wall',
        name: 'Guide Wall Left Bank',
        unit: 'M',
        startChainageM: 0,
        lengthM: 1000,
        alignment: [
          { lat: 17.5, lng: 78.5 },
          { lat: 17.51, lng: 78.51 }
        ],
        wallMaterial: { code: 'IRR-CCDW-2-9', side: 'SSR', unit: 'CUM' },
        baseMaterial: { code: 'IRR-CCDW-2-9', side: 'SSR', unit: 'CUM' },
        excavationMaterial: { code: 'IRR-CCDW-1-1', side: 'SSR', unit: 'CUM' },
        sections: []
      },
      children: []
    },
    {
      id: 'other-comp-2',
      kind: 'component',
      name: 'Canal Stretch 1',
      children: [
        {
          id: 'other-item-1',
          kind: 'item',
          name: 'Plain Cement Concrete M15',
          itemCode: 'IRR-CCDW-2-5',
          itemSource: 'SSR',
          categoryKey: 'ssr_item',
          unit: 'CUM',
          children: []
        }
      ]
    }
  ]
}

console.log('1. Testing ensureTemplateComponentsSynced on Guide Wall...')
const syncedRoot = ensureTemplateComponentsSynced(projectRoot)
const gwNode = syncedRoot.children.find((c) => c.id === 'gw-comp-1')
assert.ok(gwNode, 'Guide wall component must exist')
assert.ok(gwNode.children.length > 0, 'Guide wall must have materialized child items')
console.log(`   Materialized ${gwNode.children.length} items in Guide Wall:`, gwNode.children.map(c => `${c.name} (${c.itemCode})`))

console.log('2. Testing projectItemGroups on synced tree...')
const groups = projectItemGroups(syncedRoot)
assert.ok(groups.length >= 2, 'Should have groups for GW and other component')
const gwConcreteGroup = groups.find(g => g.code === 'IRR-CCDW-2-9')
assert.ok(gwConcreteGroup, 'IRR-CCDW-2-9 group must exist')
assert.equal(gwConcreteGroup.source, 'SSR', 'IRR-CCDW-2-9 must be marked as SSR')
console.log('   IRR-CCDW-2-9 found with usages:', gwConcreteGroup.usages.map(u => u.node.id))

console.log('3. Testing fallbackLeadApplicability on IRR-CCDW-2-9...')
const meta = fallbackLeadApplicability('IRR-CCDW-2-9', 'M20 grade concrete')
assert.ok(meta, 'Fallback metadata must exist for IRR-CCDW-2-9')
assert.deepEqual(meta.classes, ['CEMENT', 'SAND', 'STONE'], 'Must expose CEMENT, SAND, STONE')
const leadInfo = parseLeadInfo(meta)
const refs = materialRefsForLeadInfo(leadInfo, 'M20 grade concrete')
assert.ok(refs.some(r => r.name.toLowerCase() === 'sand'), 'Must include Sand ref')
assert.ok(refs.some(r => r.name.toLowerCase() === 'cement'), 'Must include Cement ref')
assert.ok(refs.some(r => r.name.toLowerCase() === 'stone'), 'Must include Stone ref')
console.log('   Material refs for IRR-CCDW-2-9:', refs.map(r => `${r.name} (${r.conveyanceClass})`))

console.log('4. Testing scopeNodeIdsForVariant with Avg Lead on Guide Wall...')
function findNodeById(root, id) {
  if (!root) return null
  if (root.id === id) return root
  for (const child of root.children || []) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}
function collectSubtreeNodeIds(node) {
  const ids = [node.id]
  for (const child of node.children || []) {
    ids.push(...collectSubtreeNodeIds(child))
  }
  return ids
}
function scopeNodeIdsForVariant(variant, root) {
  if (!variant) return null
  const compId = variant.avgLead?.componentId ?? variant.componentId
  let targetId = compId
  if (!targetId) {
    const checkPointId = (pointId) => {
      if (pointId && pointId.startsWith('node:')) return pointId.replace('node:', '')
      return undefined
    }
    targetId = checkPointId(variant.endPointId) ?? checkPointId(variant.startPointId)
  }
  if (!targetId) return null
  if (!root) return [targetId]
  const targetNode = findNodeById(root, targetId)
  if (!targetNode) return [targetId]
  return collectSubtreeNodeIds(targetNode)
}

const avgVariant = {
  id: 'var-gw-sand',
  materialName: 'Sand',
  conveyanceClass: 'SAND',
  componentId: 'gw-comp-1',
  avgLead: {
    mode: 'line',
    componentId: 'gw-comp-1',
    componentName: 'Guide Wall Left Bank',
    avgKm: 12.5,
    pointCount: 5,
    routes: []
  },
  leadKm: 12.5,
  liftM: 0,
  handlingMode: 'none',
  rateSource: 'chart',
  includedBasis: 'none',
  active: true,
  createdAt: new Date().toISOString()
}

const scopeIds = scopeNodeIdsForVariant(avgVariant, syncedRoot)
assert.ok(scopeIds.includes('gw-comp-1'), 'Scope must include gw-comp-1')
for (const child of gwNode.children) {
  assert.ok(scopeIds.includes(child.id), `Scope must include GW child ${child.id}`)
}
assert.ok(!scopeIds.includes('other-comp-2'), 'Scope must NOT include other-comp-2')
assert.ok(!scopeIds.includes('other-item-1'), 'Scope must NOT include other-item-1')
console.log('   Scope node IDs:', scopeIds)

console.log('5. Testing filtering of groups by scopeIds...')
const scopedGroups = groups.filter((group) =>
  group.usages.some(
    (usage) =>
      scopeIds.includes(usage.node.id) ||
      usage.path.some((p) => scopeIds.includes(p.id))
  )
)
assert.equal(scopedGroups.length, 1, 'Only Guide Wall group should be in scopedGroups')
assert.equal(scopedGroups[0].code, 'IRR-CCDW-2-9', 'Scoped group must be Guide Wall concrete')
console.log('   Filtered groups for Guide Wall:', scopedGroups.map(g => `${g.displayName} (${g.code})`))

console.log('All Guide Wall lead filter checks passed successfully!')
