const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const formSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/newproject/NewProjectForm.tsx'),
  'utf8'
)
const manualSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/manualAreaAllowance.ts'),
  'utf8'
)
const masterSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/masterData.ts'),
  'utf8'
)
const chapterSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/tutorial/chapters/chapter1.ts'),
  'utf8'
)

// The New Project form must not carry a map: no picker, no place search, and
// no coordinate state.
assert.doesNotMatch(
  formSource,
  /LocationMap/,
  'New Project must not render the LocationMap picker'
)
assert.doesNotMatch(
  formSource,
  /nominatim/i,
  'New Project must not call the OpenStreetMap place search'
)
assert.doesNotMatch(
  formSource,
  /latInput|lngInput|recenterToken|searchLocation|applyLatLng/,
  'New Project must not keep map coordinate/search state'
)
assert.doesNotMatch(
  formSource,
  /data-tour="np-map"/,
  'New Project must not expose the retired np-map tour anchor'
)

// Creating a project must not require a location.
assert.doesNotMatch(
  formSource,
  /Boolean\(location\)/,
  'New Project validity must not depend on a map location'
)
assert.match(
  formSource,
  /location: mode === 'edit' \? \(initialMeta\?\.location \?\? null\) : null,/,
  'New projects must be created with a null location; edits preserve the stored one'
)

// Allowance now resolves from the explicit classification only.
assert.match(
  formSource,
  /resolveManualAreaAllowance\(manualAllowanceType \|\| null, sorYear\)/,
  'New Project must resolve allowance from the manual classification and year'
)
assert.match(
  manualSource,
  /export async function resolveManualAreaAllowance\(/,
  'manualAreaAllowance must export the classification-only resolver'
)
assert.match(
  masterSource,
  /export function allowanceTypeLabel\(/,
  'masterData must share the allowance label helper'
)
assert.match(
  masterSource,
  /export interface AllowanceRuleRow \{/,
  'masterData must share the allowance rule row shape'
)
assert.match(
  formSource,
  /data-tour="np-allowance"/,
  'New Project must keep the allowance section tour anchor'
)

// The onboarding chapter must not point at the removed map.
assert.doesNotMatch(
  chapterSource,
  /np-map/,
  'Tutorial chapter 1 must not reference the removed np-map anchor'
)

console.log('new-project-no-map: ok')
