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

assert.match(studio, /const mapFixed = storedMapImage/)
assert.match(studio, /const editorLocked = mapFixed \|\| busy/)
assert.match(studio, /mapFixed \? \([\s\S]*?Clear[\s\S]*?\) : \([\s\S]*?Fix/)
assert.doesNotMatch(studio, /Save changes/)
assert.match(studio, /locked=\{editorLocked\}/)
assert.match(studio, /onUpdatePrintSettings=\{editorLocked \? undefined : onUpdatePrintSettings\}/)
assert.match(studio, /interactive=\{!editorLocked\}/)

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

console.log('Lead map Fix/Clear workflow guards passed')
