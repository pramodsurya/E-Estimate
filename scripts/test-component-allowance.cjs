const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const modalSource = read('src/renderer/src/components/modals/AddStructureModal.tsx')
const mapSource = read('src/renderer/src/components/newproject/WorkingPointMap.tsx')
const allowanceLib = read('src/renderer/src/lib/componentAllowance.ts')
const syncSource = read('src/renderer/src/lib/dashboardSync.ts')
const projectDataSource = read('src/renderer/src/lib/projectData.ts')
const storeSource = read('src/renderer/src/store/useStore.ts')
const typesSource = read('src/renderer/src/types/project.ts')
const componentDashboard = read('src/renderer/src/components/dashboard/ComponentDashboard.tsx')

// No map on the Add Component first step: details (name) then a type chooser.
assert.doesNotMatch(
  modalSource,
  /LocationMap/,
  'Add Component must not render the LocationMap picker'
)
assert.doesNotMatch(
  modalSource,
  /What kind of/,
  'Add Component must not use a separate type page'
)
assert.match(
  modalSource,
  /template-choice-list/,
  'Add Component must offer the component types in the main dialog'
)
assert.match(
  modalSource,
  /setStep\('location'\)/,
  'Add Component must open the locate step for a custom component'
)

// Custom components place a point or draw a line; the allowance resolves
// from it and is shown before saving.
assert.match(
  mapSource,
  /Polyline/,
  'WorkingPointMap must support drawing a line'
)
assert.match(
  modalSource,
  /resolveAreaAllowance\(\{ lat: lookup\.lat, lng: lookup\.lng \}, sorYear\)/,
  'Add Component must resolve the allowance from the placed point/line'
)
assert.match(
  modalSource,
  /line\.length >= 2/,
  'A drawn line must need at least two vertices'
)
assert.match(
  modalSource,
  /workingLineCentroid\(line\)/,
  'A drawn line allowance must resolve from the line middle'
)
assert.match(
  modalSource,
  /removeVertex/,
  'A drawn line must let the user remove vertices'
)

// Per-component allowance model and resolution.
assert.match(
  typesSource,
  /areaAllowance\?: ProjectAreaAllowance \| null/,
  'ProjectNode must carry an explicit component allowance'
)
assert.match(
  typesSource,
  /workingLine\?: \{ lat: number; lng: number \}\[\] \| null/,
  'ProjectNode must carry the drawn working line'
)
assert.match(
  allowanceLib,
  /export function effectiveAllowanceForNode\(/,
  'componentAllowance must resolve the allowance in force for a node'
)
assert.match(
  allowanceLib,
  /export function componentAllowanceAudit\(/,
  'componentAllowance must audit tree allowances for signatures'
)
assert.match(
  storeSource,
  /setNodeAreaAllowance: \(nodeId: string, allowance: ProjectAreaAllowance \| null\) => void/,
  'The store must expose a per-node allowance update'
)
assert.match(
  storeSource,
  /setNodeWorkingLocation: \(/,
  'The store must expose a working-location update'
)
assert.match(
  storeSource,
  /areaAllowance: extra\?\.areaAllowance \?\? null,/,
  'createStructureNode must persist the component allowance'
)

// Sync must price items with their component allowance and invalidate on change.
assert.match(
  syncSource,
  /effectiveAllowanceForNode\(project, item\.id\)/,
  'Dashboard sync must resolve the allowance per item'
)
assert.match(
  syncSource,
  /areaAllowancePercent: allowance\.percent,/,
  'Dashboard sync must fetch rates with the item allowance'
)
assert.match(
  syncSource,
  /componentAllowances: componentAllowanceAudit\(project\),/,
  'Dashboard compile signatures must include component allowances'
)
assert.match(
  projectDataSource,
  /allowance\?: \{ percent: number; label: string \}/,
  'projectDataRecipe must accept the item allowance'
)

// The component dashboard must show and change the allowance.
assert.match(
  componentDashboard,
  /ComponentAllowanceCard/,
  'ComponentDashboard must render the allowance card'
)
assert.match(
  componentDashboard,
  /Edit location/,
  'The allowance card must offer location editing'
)
assert.match(
  componentDashboard,
  /openEditGeometry\(node\.id\)/,
  'The allowance card must reopen the creation wizard for edits'
)
assert.doesNotMatch(
  componentDashboard,
  /WorkingPointMap/,
  'The dashboard must not host its own locate editor'
)
assert.match(
  modalSource,
  /setNodeWorkingLocation\(/,
  'Saving an edited location must go through the store'
)
assert.match(
  componentDashboard,
  /setNodeAreaAllowance\(node\.id, null\)/,
  'The allowance card must offer falling back to the project allowance'
)
assert.match(
  componentDashboard,
  /Apply automatic|Refresh automatic/,
  'The allowance card must keep the automatic map-based mode'
)
assert.match(
  componentDashboard,
  /Component area classification/,
  'The allowance card must keep the manual classification mode'
)

console.log('component-allowance: ok')
