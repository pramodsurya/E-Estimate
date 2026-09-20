const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const studio = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/lead/LeadMapPrintStudio.tsx'),
  'utf8'
)
const layout = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/lead/LeadMapPrintLayout.tsx'),
  'utf8'
)
const capture = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/leadMapCapture.ts'),
  'utf8'
)
const layers = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/map/MapLayers.tsx'),
  'utf8'
)
const styles = fs.readFileSync(
  path.join(root, 'src/renderer/src/styles/styles.css'),
  'utf8'
)

assert.match(studio, /const mapFixed = storedMapImage/)
assert.match(studio, /const editorLocked = mapFixed \|\| busy/)
assert.match(studio, /mapFixed \? \([\s\S]*?Clear[\s\S]*?\) : \([\s\S]*?Fix/)
assert.doesNotMatch(studio, /Save changes/)
assert.match(studio, /locked=\{editorLocked\}/)
assert.match(studio, /onUpdatePrintSettings=\{editorLocked \? undefined : onUpdatePrintSettings\}/)
assert.match(studio, /interactive=\{!editorLocked\}/)
assert.match(studio, /for \(const handler of handlers\)[\s\S]*?handler\.disable\(\)/, 'fixed state must disable already-created Leaflet handlers')
assert.match(studio, /disabled=\{downloading\}[\s\S]*?<X size=\{14\} \/> Close/, 'Close becomes available after capture finishes')
assert.match(studio, /kind: 'map'[\s\S]*?status: 'complete'/, 'background map completion must reach notifications')
assert.match(studio, /window\.api\.export\.png/, 'fixed map image must be downloadable')
assert.match(styles, /\.lead-print-map\.static \.leaflet-container[\s\S]*?pointer-events: none/, 'fixed map must reject pointer and wheel input at the DOM boundary')

for (const interaction of [
  'zoomControl',
  'scrollWheelZoom',
  'doubleClickZoom',
  'dragging',
  'touchZoom',
  'boxZoom',
  'keyboard'
]) {
  assert.match(studio, new RegExp(`${interaction}=\\{interactive\\}`))
}

assert.match(layout, /<fieldset[^>]*disabled=\{locked\}/)
assert.match(studio, /commitLeadMapPrint\([\s\S]*?saveProject\(\{ requireSaved: true \}\)/)
assert.match(studio, /clearLeadMapPrint\(\)[\s\S]*?saveProject\(\{ requireSaved: true \}\)/)
assert.match(capture, /inlineRemoteMapImages\(mapElement, existingCache\)/)
assert.match(capture, /A visible map tile could not be downloaded/)
assert.match(capture, /unresolvedTiles[\s\S]*?visible map tiles are not fully available/)
assert.match(capture, /toPng\(mapElement, \{/)
assert.match(layers, /detectRetina=\{printQuality\}/)
assert.match(studio, /weightedLead\?\.entries/, 'weighted leads must resolve their member entries for the map')
assert.match(studio, /pushWeightedMemberRoutes/, 'weighted basis must draw through member routes')
assert.match(studio, /appliedIds\.has\(entry\.variantId\)/, 'members that already draw must not duplicate')
assert.match(studio, /Weighted Avg · /, 'weighted member routes must carry the weighted label')
assert.match(studio, /directGeometry/, 'geometry-less variants must not draw fake dots')

console.log('Lead map Fix/Clear workflow guards passed')
