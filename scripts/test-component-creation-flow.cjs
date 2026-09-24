const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const modal = read('src/renderer/src/components/modals/AddStructureModal.tsx')
const bundSetup = read('src/renderer/src/components/bund/BundSetup.tsx')
const canalSetup = read('src/renderer/src/components/canal/CanalSetup.tsx')
const guideWallSetup = read('src/renderer/src/components/guidewall/GuideWallSetup.tsx')
const alignmentMap = read('src/renderer/src/components/guidewall/AlignmentMap.tsx')
const store = read('src/renderer/src/store/useStore.ts')
const types = read('src/renderer/src/types/project.ts')
const bundLib = read('src/renderer/src/lib/bund/configuration.ts')
assert.ok(modal.includes("template.comingSoon ? ' — Coming soon' : ''"), 'Canal must be marked coming soon in the picker')
assert.ok(!modal.includes('disabled={template.comingSoon}'), 'Canal creation must remain enabled')

// --- Two-page creation wizard -------------------------------------------
// Page 1 asks name + type only; page 2 locates every component type.
assert.ok(modal.includes('const [page, setPage] = useState<1 | 2>(isEdit ? 2 : 1)'), 'wizard must track page 1/2 (edits open on the locate page)')
assert.ok(modal.includes('(!isComponent || page === 1) && ('), 'name + type must show on page 1 only')
assert.ok(modal.includes('{isComponent && page === 2 && ('), 'geometry must show on page 2 only')
assert.ok(
  modal.includes('mode={templateId ? \'line\' : locateMode}'),
  'template locate mode must be line-only'
)
assert.ok(modal.includes('goPage2'), 'page 1 must continue to the locate page')
assert.ok(
  modal.includes('frozen={batchRows !== null && extendKey === null}'),
  'extend mode must unfreeze the map while proposals show'
)

// Manual length entry feeds template setups (no map).
assert.ok(modal.includes('manual-length'), 'wizard must offer a manual length input')
assert.ok(
  modal.includes('createStructureNode(name, null, templateId, { manualLengthM: typedLength })'),
  'typed length must create a manual template node'
)
assert.ok(
  modal.includes('{ areaAllowance: allowance, workingLine: line }'),
  'drawn template line must create with location, allowance and working line'
)

// Template multi-create stays same-type and needs lines, not points.
assert.ok(
  modal.includes('batchRows.every((row) => row.vertices.length >= 2)'),
  'template batch creation must require line rows'
)
assert.ok(
  modal.includes('createTemplatedComponentsFromImport('),
  'template batch creation must use the templated import action'
)

// --- Template setups take length from creation ---------------------------
// Bund step 2 asks the water side instead of the length.
assert.ok(
  bundSetup.includes('Which side holds the tank water (u/s)?'),
  'bund step 2 must ask the water side'
)
assert.ok(
  bundSetup.includes('hasPresetLength ? ('),
  'bund step 2 must show the preset length instead of asking'
)
assert.ok(
  bundSetup.includes('waterSide={draft.alignment.length >= 2 ? draft.waterSide : null}'),
  'bund setup map must render the water side'
)
// Canal step 2 keeps flow/offtake/sections; length is read-only.
assert.ok(canalSetup.includes('const lengthPreset ='), 'canal must detect the preset length')
assert.ok(
  canalSetup.includes('Flow, offtake and sections'),
  'canal step 2 title must drop the length question when preset'
)
assert.ok(
  canalSetup.includes('— from component creation'),
  'canal must show the creation length read-only'
)
// GuideWall has a single sections screen and only asks for length on old records.
assert.ok(
  guideWallSetup.includes('const hasPresetLength = data.lengthM > 0 || data.alignment.length >= 2') &&
    guideWallSetup.includes('{!hasPresetLength && ('),
  'guidewall must show sections immediately and ask for length only when missing'
)

// --- Water-side data ------------------------------------------------------
assert.ok(types.includes("export type BundWaterSide = 'left' | 'right'"), 'BundWaterSide type must exist')
assert.ok(types.includes('waterSide: BundWaterSide'), 'BundData must carry the water side')
assert.ok(bundLib.includes("waterSide: 'left',"), 'bund default must assume left water')
assert.ok(
  bundLib.includes("waterSide: raw.waterSide === 'right' ? 'right' : 'left'"),
  'bund migration must backfill the water side'
)
assert.ok(
  alignmentMap.includes('waterSide?: BundWaterSide | null'),
  'alignment map must accept the water side'
)

// --- Store presets template alignment/length -----------------------------
assert.ok(store.includes('manualLengthM?: number'), 'createStructureNode must accept a typed length')
assert.ok(store.includes('hasGeometryPreset'), 'store must detect creation geometry')
assert.ok(
  store.includes('source: presetSource,'),
  'store must preset the template length source'
)

// --- Component page edits creation lengths -------------------------------
const dashboard = read('src/renderer/src/components/dashboard/ComponentDashboard.tsx')
const detail = read('src/renderer/src/components/lead/LeadDetailDashboard.tsx')
assert.ok(dashboard.includes('Change Work Location'), 'component page must offer work-location edits')
assert.ok(dashboard.includes('openEditGeometry(node.id)'), 'edits must reopen the creation wizard, not a dashboard editor')
assert.ok(!dashboard.includes('setLocateMode(isCustom ?'), 'the dashboard must not host its own locate editor')
assert.ok(modal.includes('state.editNodeId'), 'the wizard must support edit mode')
assert.ok(modal.includes('handleSaveEdit'), 'edit mode must save back to the one component')
assert.ok(modal.includes('manual-length'), 'edits must reuse the wizard manual length input')
assert.ok(
  modal.includes("line.length >= 2 ? '' : editLengthSeed"),
  'edits must not prefill a typed length over a stored line (redraws would never change it)'
)
assert.ok(
  modal.includes('Measured ${Math.round(polylineLengthM(line))}'),
  'edits must show the live measured length while a line is drawn'
)
assert.ok(modal.includes('migrateBundData(editNode.bund)'), 'edits must patch the bund setup data')
assert.ok(modal.includes('migrateCanalData(editNode.canal)'), 'edits must patch the canal setup data')
assert.ok(modal.includes('migrateGuideWallData(editNode.guideWall)'), 'edits must patch the guide-wall setup data')
assert.ok(modal.includes('setNodeWorkingLocation('), 'edit saves must go through the store')
assert.ok(store.includes('openEditGeometry'), 'the store must expose opening an edit')
assert.ok(dashboard.includes('storedLengthText'), 'component page must show the stored template length')
assert.ok(
  detail.includes('storedLengthM > 0 ? storedLengthM : polylineLengthM(line)'),
  'avg picker km must follow the stored length, not just the drawn line'
)

// --- Live distances while drawing / importing ---------------------------
const workingMap = read('src/renderer/src/components/newproject/WorkingPointMap.tsx')
assert.ok(workingMap.includes('<Tooltip permanent'), 'drawn vertices must label their distance on the map')
assert.ok(workingMap.includes('cumulativeLengthsM(line)'), 'map labels must use running totals per vertex')
assert.ok(workingMap.includes('#${index + 1} Start'), 'the first drawn vertex must read as the start')
const guideWallLib = read('src/renderer/src/lib/guideWall.ts')
assert.ok(guideWallLib.includes('export function formatLengthM'), 'length labels must share one metres/km formatter')
assert.ok(guideWallLib.includes('export function cumulativeLengthsM'), 'running vertex totals must live beside the length math')
assert.ok(modal.includes('cumulativeLengthsM(line)'), 'the wizard vertex list must show running totals')
assert.ok(modal.includes('measured — keep clicking to extend'), 'template drawing must show its live measured total')
const importPanel = read('src/renderer/src/components/newproject/GeometryImportPanel.tsx')
assert.ok(importPanel.includes('cumLabelByRow'), 'imported vertex lists must show per-vertex distances')
assert.ok(importPanel.includes('formatLengthM(run - prev)'), 'import vertex labels must show segment and running total')

console.log('test-component-creation-flow: all checks passed')
