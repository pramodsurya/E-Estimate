const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

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

const detail = read('src/renderer/src/components/lead/LeadDetailDashboard.tsx')

// Create Lead offers Normal Lead | Avg Lead; Normal keeps today's flow.
assert.ok(
  detail.includes("useState<'normal' | 'avg'>('normal')"),
  'create dialog must track the Normal | Avg choice, defaulting to Normal'
)
assert.ok(detail.includes('<strong>Normal Lead</strong>'), 'chooser must offer Normal Lead')
assert.ok(detail.includes('Create Source'), 'point creation must read as Create Source')
assert.ok(detail.includes('Map Print Studio'), 'page header must offer Map Print Studio')
assert.ok(detail.includes('lead-map-heading-actions'), 'route card keeps its source/map actions')
assert.ok(detail.includes('dash-actions'), 'page header offers the source/map actions too')
assert.ok(detail.includes('<strong>Avg Lead</strong>'), 'chooser must offer Avg Lead')
assert.ok(
  detail.includes('{!editingVariantId && !createKindChosen && ('),
  'chooser popup must show first when creating, never when editing'
)
assert.ok(detail.includes('Work at one place'), 'chooser must say when Normal Lead applies')
assert.ok(detail.includes('Work across a stretch'), 'chooser must say when Avg Lead applies')
assert.ok(
  detail.includes('{!editingVariantId && createKindChosen && createKind === \'avg\' && ('),
  'avg form must wait for the chooser'
)
assert.ok(
  detail.includes('!isAvgCreating && (editingVariantId || createKindChosen) && !isEditingAvg && ('),
  'normal form must wait for the chooser'
)
// The normal-form gate renders siblings (map, error, form), so it must wrap them in a fragment.
const detailLf = detail.replace(/\r\n/g, '\n')
const normalGateOpen = detailLf.indexOf('!isAvgCreating && (editingVariantId || createKindChosen)')
assert.ok(
  normalGateOpen >= 0 &&
    detailLf.slice(normalGateOpen, detailLf.indexOf('<VariantRoutePreviewMap', normalGateOpen)).includes('<>'),
  'normal-form gate must open a fragment for its map/error/form siblings'
)
assert.ok(
  detailLf.includes('</>\n          )}\n          <div className="lead-variant-dialog-actions">'),
  'normal-form gate must close the fragment before the shared save row'
)
// The Create Lead button must clear the previous Normal|Avg pick so the chooser opens first.
const createLeadOpen = detail.slice(
  Math.max(0, detail.indexOf('<Plus size={15} /> Create Lead') - 600),
  detail.indexOf('<Plus size={15} /> Create Lead')
)
assert.ok(
  createLeadOpen.includes('setCreateKindChosen(false)'),
  'Create Lead must reset the Normal|Avg choice so the chooser shows first'
)
assert.ok(
  detail.includes("createKind === 'avg'"),
  'dialog must branch on the Avg choice'
)

// Avg flow: component (line or manual table), starts, spacing, tolerance.
assert.ok(detail.includes('Select a component…'), 'avg must pick the source component')
assert.ok(detail.includes('Point every (km)'), 'avg line mode must ask the point spacing')
assert.ok(detail.includes('Tolerance (km)'), 'avg line mode must ask the tolerance')
assert.ok(detail.includes('Starting points'), 'avg must pick source points with a count')
assert.ok(detail.includes('toggleAvgStart(point.id)'), 'source points must toggle as cards')
assert.ok(detail.includes("avgProgress || 'Creating lead…'"), 'avg generation button must read Create Lead')
assert.ok(detail.includes('Distances (km)'), 'avg table mode must take entered distances')
assert.ok(detail.includes('avgMarkers={avgMapMarkers}'), 'generated points must preview on the map')
assert.ok(detail.includes('<AvgLeadPreviewMap'), 'avg creation must show its own points-and-routes map')
assert.ok(detail.includes('markers={avgComponentVertexMarkers}'), 'avg creation map must plot the component vertices so the line is visible before generating')
assert.ok(detail.includes('{point.name || point.code}'), 'starting-point chips must prefer the given name')
assert.ok(detail.includes("start.label ?? 'Start'"), 'map start markers must prefer the given name')
assert.ok(detail.includes('FitPreviewBounds'), 'preview map must refit when the component or routes change')
assert.ok(detail.includes('fitBounds'), 'preview map must fit the component line and routes into view')
assert.ok(detail.includes('invalidateSize'), 'preview map must reset its size when the avg dialog content changes')
assert.ok(detail.includes('id: `avg-vertex-${pointIndex}`'), 'each component vertex must get a map dot')
assert.ok(detail.includes("id: 'avg-component-line'"), 'the chosen component line must draw on the avg map')
assert.ok(detail.includes('sourceRoutes={avgComponentLineRoutes}'), 'the component line must reach the preview map')
assert.ok(detail.includes('<CircleMarker'), 'component vertices must render as map dots')
assert.ok(detail.includes('routes={avgMapRoutes}'), 'avg creation map must draw the accepted road routes')
assert.ok(detail.includes('starts={avgStarts}'), 'avg creation map must show the starting points')
assert.ok(detail.includes('hideMapLabel: routeIndex > 0'), 'dashboard map must pin one label per avg lead, not one per route')
assert.ok(detail.includes("Avg ${avgRoutes.length}"), 'the single avg card must summarize the route count')

// Saving an Avg Lead requires a computed average and remembers the component.
assert.ok(
  detail.includes("createKind === 'avg' && !avgReady"),
  'avg save must stay disabled until the average is ready'
)
assert.ok(
  detail.includes('editingVariantId || isAvgCreating'),
  'avg create must save through Save Lead after generating'
)
assert.ok(detail.includes('isEditingAvg'), 'editing must know an avg lead from a normal one')
assert.ok(
  detail.includes('|| isEditingAvg) && ('),
  'editing an avg lead must stay in the avg UI'
)
assert.ok(
  detail.includes('&& !isEditingAvg && ('),
  'editing an avg lead must hide the normal form'
)
assert.ok(detail.includes('setAvgComponentId(detail.componentId)'), 'avg edits must prefill the source component')
assert.ok(
  detail.includes('{variant.avgLead && <span>Avg Lead</span>}'),
  'lead cards must call out avg leads'
)
assert.ok(detail.includes('function scopeNodeIdsForVariant'), 'selected leads must scope DATA by source')
assert.ok(detail.includes('variant.avgLead?.componentId ?? variant.componentId'), 'avg leads must scope to the chosen component')
assert.ok(detail.includes('NODE_POINT_PREFIX'), 'normal leads must scope to the working-point component')
assert.ok(detail.includes('Set<string> | null'), 'scope ids are a Set, so filtering must use .has')
assert.ok(detail.includes('scopeNodeIds.has(usage.node.id)'), 'DATA panel must list only the source scope')
assert.ok(detail.includes('Show all'), 'DATA panel must offer the full list back')
assert.ok(detail.includes('avgLead: avgSaveDetail'), 'saved lead must carry the avg audit detail')
assert.ok(detail.includes('componentId: avgSaveDetail.componentId'), 'saved lead must remember the component')

// Every new Avg/chooser/weighted class must have CSS behind it.
const css = read('src/renderer/src/styles/styles.css')
for (const cls of ['.lead-create-kind', '.lead-avg-form', '.lead-start-chip', '.lead-avg-summary', '.lead-avg-map-hint', '.lead-weighted-row', '.lead-variant-card-weighted', '.lead-weighted-title']) {
  assert.ok(css.includes(cls), `missing CSS for ${cls}`)
}
assert.ok(css.includes('lead-boss-shine'), 'weighted card must have its boss shine sweep')
assert.ok(css.includes('prefers-reduced-motion'), 'boss shine must switch off under reduced motion')

// LeadVariant carries the component link and the avg audit trail.
const types = read('src/renderer/src/types/project.ts')
assert.ok(types.includes("export type AvgLeadMode = 'line' | 'table'"), 'AvgLeadMode must exist')
assert.ok(types.includes('export interface AvgLeadDetail'), 'AvgLeadDetail must exist')
assert.ok(types.includes('componentId?: string'), 'LeadVariant must remember the component')
assert.ok(types.includes('avgLead?: AvgLeadDetail'), 'LeadVariant must carry the avg detail')

// --- Avg Lead math (dependency-free lib, stubbed road matrix) ---
const avg = loadTsModule(path.join(root, 'src/renderer/src/lib/avgLead.ts'))
const DEG = 1 / 111195
const pt = (lat, lng) => ({ lat, lng })

assert.ok(
  Math.abs(avg.haversineM(pt(0, 0), pt(1, 0)) - 111195) < 500,
  'haversine must measure a degree of latitude as ~111195 m'
)

// 100 km line at every 2 km gives 50 targets, first at 2 km, last at 100 km.
const targets = avg.targetChainages(100000, 2000)
assert.equal(targets.length, 50, '100 km at 2 km spacing must give 50 targets')
assert.equal(targets[0], 2000, 'first target sits one spacing along the line')
assert.equal(targets[49], 100000, 'last target sits at the line end')

// 1 km tolerance at 100 m steps gives 11 samples from the target outward.
assert.deepEqual(
  avg.sampleOffsets(1000, 100),
  [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
  'tolerance window must sample outward from the target chainage'
)

// Table mode: the average is all distances over their count.
assert.equal(avg.averageDistancesKm([10, 20, 30]), 20, 'avg must be all distances over count')
assert.equal(avg.averageDistancesKm([]), null, 'no distances means no average')

// Normal and Avg Lead own distinct UIs: while creating Avg, the Normal form hides.
assert.ok(detail.includes('{!isAvgCreating && ('), 'normal form must hide during avg creation')

// Every accepted route is fetched whole, stored, and drawn — none discarded.
assert.ok(
  detail.includes('const route = await calculateRoadRoute(['),
  'each winning point must fetch its full road route'
)
assert.ok(
  detail.includes('geometry: point.geometry ?? []'),
  'saved avg detail must carry every accepted route geometry'
)
assert.ok(detail.includes('avgRoutes={avgMapRoutes}'), 'dialog map must draw all accepted routes')
assert.ok(
  detail.includes('id: `avg-${variant.id}-${routeIndex}`'),
  'workspace map must draw every stored avg route'
)
const printStudio = read('src/renderer/src/components/lead/LeadMapPrintStudio.tsx')
assert.ok(
  printStudio.includes('id: `variant:${variant.id}:avg-${routeIndex}`'),
  'map print studio must print every stored avg route'
)
assert.ok(
  types.includes('geometry?: { lat: number; lon: number }[]'),
  'avg route inputs must store geometry'
)
assert.ok(
  detail.includes('!avgSaveDetail && variantDraft.distanceMode'),
  'normal save guards must yield to a ready avg result'
)
assert.ok(
  detail.includes('(actualLeadKm === null && !avgSaveDetail)'),
  'avg save must not require a drafted lead value'
)

// --- Weighted Average Lead (project-wide, quantity-weighted) ---
assert.ok(types.includes('export interface WeightedLeadDetail'), 'WeightedLeadDetail must exist')
assert.ok(types.includes('weightedLead?: WeightedLeadDetail'), 'LeadVariant must carry the weighted detail')
assert.ok(detail.includes('Weighted Average Lead'), 'materials card must offer the weighted average')
assert.ok(detail.includes('createWeightedLead'), 'weighted creation must be a dedicated flow')
assert.ok(detail.includes('lead-variant-card-weighted'), 'weighted leads must render their own card')
assert.ok(detail.includes('<Crown size={15} />'), 'weighted card must wear the boss crown')
assert.ok(detail.includes('lead-weighted-title'), 'weighted card title must carry the boss styling hook')
assert.ok(detail.includes('Apply to All'), 'weighted card must apply to the whole project')
assert.ok(detail.includes('(total '), 'weighted card must show each total quantity behind the average')
assert.ok(detail.includes('÷ W'), 'weighted card must show the full (Σ w×l) ÷ W calculation')
assert.ok(detail.includes('applyTargets(applyableTargets, variant)'), 'apply-to-all must reuse the apply pipeline')

const weighted = loadTsModule(path.join(root, 'src/renderer/src/lib/weightedLead.ts'))
const wVariants = [
  { id: 'v1', componentName: 'Canal-1', variantName: 'Canal-1 · Stone · 10.00 km', materialName: 'Stone', leadKm: 10, actualLeadKm: 10 },
  { id: 'v2', componentName: 'Bund-2', materialName: 'Stone', leadKm: 20 },
  { id: 'v3', materialName: 'Stone', leadKm: 99, weightedLead: { entries: [], totalQuantity: 0, weightedAvgKm: 99, createdAt: '' } },
  { id: 'v4', materialName: 'Stone', leadKm: 5 }
]
const wApps = [
  { variantId: 'v1', itemKey: 'k1', itemNodeId: 'i1', quantity: 100, outputQuantity: 300, unit: 'cum' },
  { variantId: 'v1', itemKey: 'k1', quantity: 50, unit: 'cum' },
  { variantId: 'v2', itemKey: 'k1', quantity: 600, unit: 'cum' }
]
const entries = weighted.weightedLeadEntries(wVariants, wApps)
assert.equal(entries.length, 2, 'only applied, non-weighted leads enter the average')
assert.equal(entries[0].quantity, 350, 'outputQuantity wins over quantity')
assert.equal(entries[0].variantName, 'Canal-1', 'card lines must name the component, not w1')
assert.equal(entries[0].unit, 'cum', 'card lines must carry the application unit')
assert.equal(entries[1].leadKm, 20, 'missing actual lead falls back to chart lead')
const { avgKm, totalQuantity } = weighted.weightedAverageKm(entries)
assert.equal(totalQuantity, 950, 'W must sum every weight')
assert.ok(Math.abs(avgKm - ((350 * 10 + 600 * 20) / 950)) < 1e-9, '(w1*l1+w2*l2)/W must hold')
assert.deepEqual(weighted.weightedAverageKm([]), { avgKm: 0, totalQuantity: 0 }, 'empty input must not NaN')
const seigEntries = weighted.weightedLeadEntriesFromSeigniorage(
  [
    { id: 's1', variantName: 'Sand source 1', materialName: 'Sand', leadKm: 5 },
    { id: 's2', variantName: 'Sand source 2', materialName: 'Sand', leadKm: 10 },
    { id: 's3', variantName: 'Sand source 3', materialName: 'Sand', leadKm: 15 }
  ],
  [
    { variantId: 's1', itemNodeId: 'i1', itemCode: 'A', unit: 'cum' },
    { variantId: 's1', itemNodeId: 'i2', itemCode: 'B', unit: 'cum' },
    { variantId: 's2', itemNodeId: 'i3', itemCode: 'C', unit: 'cum' },
    { variantId: 's3', itemNodeId: 'i4', itemCode: 'D', unit: 'cum' }
  ],
  [{
    materialLabel: 'Ordinary Sand', unit: 'cum', charge: null,
    quantityTerms: [
      { itemNodeId: 'i1', quantity: 12 },
      { itemNodeId: 'i2', quantity: 8 },
      { itemNodeId: 'i3', quantity: 7 },
      { itemNodeId: 'i4', quantity: 3 }
    ]
  }]
)
assert.deepEqual(
  seigEntries.map((entry) => [entry.variantId, entry.quantity]),
  [['s1', 20], ['s2', 7], ['s3', 3]],
  'Seigniorage terms combine only inside the exact Lead-variant bucket'
)
const adoptedWeightedEntries = weighted.weightedLeadEntriesFromSeigniorage(
  [{ id: 's1', variantName: 'Sand source 1', materialName: 'Sand', leadKm: 5 }],
  [{ variantId: 'weighted', sourceVariantId: 's1', itemNodeId: 'i1', itemCode: 'A', unit: 'cum' }],
  [{ materialLabel: 'Sand', unit: 'cum', charge: null, quantityTerms: [{ itemNodeId: 'i1', quantity: 12 }] }]
)
assert.equal(
  adoptedWeightedEntries[0].quantity,
  12,
  'adopting a weighted Lead must retain the original route bucket'
)
assert.deepEqual(
  weighted.unappliedLeadNames(wVariants, wApps),
  ['Stone'],
  'leads with no applications must block averaging'
)
const wRoot = {
  id: 'root', kind: 'title', name: 'R', children: [
    { id: 'c1', kind: 'component', name: 'Canal-1', children: [
      { id: 'i1', kind: 'item', name: 'Stone work', children: [] }
    ] },
    { id: 'c2', kind: 'component', name: 'Canal-2', children: [
      { id: 'i2', kind: 'item', name: 'Stone work', children: [] }
    ] },
    { id: 'c3', kind: 'component', name: 'Bund-1', children: [] }
  ]
}
const wGroups = [
  { key: 'k1', usages: [{ node: { id: 'i1' }, path: [{ id: 'c1' }] }] },
  { key: 'k2', usages: [{ node: { id: 'i2' }, path: [{ id: 'c2' }] }] }
]
assert.deepEqual(
  weighted.uncoveredLeadScopes(wRoot, wGroups, wApps),
  ['Canal-2'],
  'components without an applied direct item must block averaging'
)

async function main() {
  // Nearest start wins per line point.
  const line = [pt(0, 0), pt(0, 0.036)]
  const plan = avg.buildAvgPlan(line, 2000, 0)
  assert.equal(plan.length, 2, '4 km line at 2 km spacing plans two points')
  const starts = [
    { id: 's1', coord: pt(0.01, 0) },
    { id: 's2', coord: pt(-0.01, 0.036) }
  ]
  const outcome = await avg.resolveAvgPlan(plan, starts, async (sources, destinations) =>
    sources.map((source, sourceIndex) =>
      destinations.map((_, destinationIndex) => 10 * (sourceIndex + 1) + destinationIndex)
    )
  )
  assert.equal(outcome.points.length, 2, 'both targets must resolve')
  assert.equal(outcome.failures, 0, 'no target may fail')
  // Destination 0 is cheapest for s1 (10 < 20): both winners come from s1.
  for (const point of outcome.points) {
    assert.equal(point.startId, 's1', 'nearest start must win each line point')
  }
  assert.equal(outcome.avgKm, 10.5, 'avg must be the mean of the winning routes')

  // A tie breaks toward the smaller chainage so reruns agree.
  const tiePlan = [
    { chainageM: 2000, samples: [{ chainageM: 2000, coord: pt(0, 0) }, { chainageM: 2100, coord: pt(0, 0.001) }] }
  ]
  const tie = await avg.resolveAvgPlan(tiePlan, [starts[0]], async () => [[3.0, 3.0]])
  assert.equal(tie.points[0].chainageM, 2000, 'ties must keep the smaller chainage')

  // Unroutable targets fail loudly and stay out of the average.
  const failed = await avg.resolveAvgPlan(tiePlan, [starts[0]], async () => [[null, null]])
  assert.equal(failed.failures, 1, 'unroutable targets must count as failures')
  assert.equal(failed.avgKm, null, 'failures must not enter the average')
}

main()
  .then(() => console.log('test-lead-creation: all checks passed'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
