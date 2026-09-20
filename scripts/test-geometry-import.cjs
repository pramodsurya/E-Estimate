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

const geometry = loadTsModule(
  path.join(root, 'src/renderer/src/lib/geometryImport.ts')
)
const {
  analyzeImportedGeometry,
  chainLoosePoints,
  decodeUploadText,
  extractKmlFromKmz,
  haversineM,
  looksLikeZip,
  mergeTouchingLines,
  parseGeoJsonGeometry,
  parseKmlGeometry,
  parseShpGeometry,
  parseTrackCoordToken,
  polylineLengthM,
  resolveTemplateGeometryEdit,
  trimLine
} = geometry

const DEG = 1 / 111195
const pt = (lat, lng) => ({ lat, lng })

// Sanity: one degree of latitude is ~111 km.
assert.ok(
  Math.abs(haversineM(pt(0, 0), pt(1, 0)) - 111195) < 500,
  'haversine must measure a degree of latitude as ~111195 m'
)

// Ten evenly spaced points (~20 m) join into one line.
const evenPoints = Array.from({ length: 10 }, (_, index) => pt(index * 20 * DEG, 0))
const even = analyzeImportedGeometry({ lines: [], points: evenPoints, ignored: 0 }, 50)
assert.equal(even.proposals.length, 1, 'ten even points must form one line')
assert.equal(even.proposals[0].kind, 'component')
assert.equal(even.proposals[0].vertices.length, 10)

// A lone pair can't help: reported, never created.
const pair = analyzeImportedGeometry(
  { lines: [], points: [pt(0, 0), pt(20 * DEG, 0)], ignored: 0 },
  50
)
assert.equal(pair.proposals.length, 0, 'a lone pair must not become a component')
assert.equal(pair.pairs.length, 1, 'a lone pair must be reported')

// Two parallel lines ~67 m apart are independent: two components, never split.
const twoLines = analyzeImportedGeometry(
  {
    lines: [
      [pt(0, 0), pt(0, 0.001)],
      [pt(0.0006, 0), pt(0.0006, 0.001)]
    ],
    points: [],
    ignored: 0
  },
  50
)
assert.equal(
  twoLines.proposals.filter((p) => p.kind === 'component').length,
  2,
  'two parallel lines ~67 m apart must propose two components'
)

// One connected zigzag is always one component — never split by shape.
const zigzag = analyzeImportedGeometry(
  {
    lines: [[pt(0, 0), pt(0.0002, 0.0002), pt(0, 0.0004), pt(0.0002, 0.0006)]],
    points: [],
    ignored: 0
  },
  50
)
assert.equal(zigzag.proposals.length, 1, 'a connected zigzag must stay one component')

// A smaller line touching the main line's middle becomes a sub-component.
const branched = analyzeImportedGeometry(
  {
    lines: [
      [pt(0, 0), pt(0.002, 0)],
      [pt(0.001, 0.0002), pt(0.001, 0.0004)]
    ],
    points: [],
    ignored: 0
  },
  50
)
const branch = branched.proposals.find((p) => p.kind === 'subcomponent')
assert.ok(branch, 'a T-touching line must become a sub-component')
assert.equal(
  branched.proposals.filter((p) => p.kind === 'component').length,
  1,
  'the main line must stay one component'
)
assert.ok(branch.parentKey, 'the branch must reference its owning component')

// Chaining respects the tolerance: a 60 m jump breaks the chain.
const broken = chainLoosePoints(
  [pt(0, 0), pt(20 * DEG, 0), pt(40 * DEG, 0), pt(100 * DEG, 0)],
  50
)
assert.equal(broken.length, 2, 'a 60 m jump must break point chaining')

// Touching ends merge; distant ends do not.
const merged = mergeTouchingLines(
  [
    [pt(0, 0), pt(0.001, 0)],
    [pt(0.0012, 0), pt(0.002, 0)]
  ],
  50
)
assert.equal(merged.length, 1, 'ends ~22 m apart must merge')
assert.equal(merged[0].length, 3, 'the shared join vertex must not duplicate')

// Trimming cuts by distance with live chainage: 100 m less 20 m first trim.
const straight = [pt(0, 0), pt(0.0009, 0)]
const full = polylineLengthM(straight)
assert.ok(Math.abs(full - 100) < 1, `fixture line must be ~100 m, got ${full}`)
const trimmed = trimLine(straight, 20, 0)
assert.ok(
  Math.abs(polylineLengthM(trimmed) - 80) < 1,
  'trimming 20 m off the start must leave ~80 m'
)
const bothEnds = trimLine(straight, 20, 30)
assert.ok(
  Math.abs(polylineLengthM(bothEnds) - 50) < 1,
  'trimming both ends must leave ~50 m'
)

// GeoJSON parsing runs in Node (no DOM needed).
const geojson = parseGeoJsonGeometry(
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [79.0, 17.0] }, properties: {} },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[79.0, 17.0], [79.001, 17.001]] },
        properties: {}
      },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} }
    ]
  })
)
assert.equal(geojson.points.length, 1, 'GeoJSON points must be read')
assert.equal(geojson.lines.length, 1, 'GeoJSON lines must be read')
assert.equal(geojson.ignored, 1, 'GeoJSON polygons must be counted as ignored')

// SHP parsing runs in Node: one Point record in a hand-built buffer.
const shpBuffer = new ArrayBuffer(128)
const shp = new DataView(shpBuffer)
shp.setInt32(0, 9994, false)
shp.setInt32(24, 64, false)
shp.setInt32(28, 1000, true)
shp.setInt32(32, 1, true)
shp.setInt32(100, 1, false)
shp.setInt32(104, 10, false)
shp.setInt32(108, 1, true)
shp.setFloat64(112, 79.5, true)
shp.setFloat64(120, 17.5, true)
const shpParsed = parseShpGeometry(shpBuffer)
assert.equal(shpParsed.points.length, 1, 'SHP point records must be read')
assert.deepEqual(
  [shpParsed.points[0].lat, shpParsed.points[0].lng],
  [17.5, 79.5],
  'SHP X/Y must map to lng/lat'
)

// KML parsing is pure string matching, so it runs in Node too.
const kmlLine = parseKmlGeometry(
  `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><Placemark>
<name>Reach</name><LineString><coordinates>79.0,17.0,0 79.001,17.001,0</coordinates></LineString>
</Placemark></Folder></Document></kml>`
)
assert.equal(kmlLine.lines.length, 1, 'KML LineStrings must be read')
assert.deepEqual(
  [kmlLine.lines[0][0].lat, kmlLine.lines[0][0].lng],
  [17.0, 79.0],
  'KML coordinates are lon,lat'
)

// GPS tracks read gx:coord pairs, which are lat,lng (reversed vs coordinates).
const kmlTrack = parseKmlGeometry(
  `<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark>
<gx:Track><gx:coord>17.0 79.0 0</gx:coord><gx:coord>17.001 79.001 0</gx:coord></gx:Track>
</Placemark></kml>`
)
assert.equal(kmlTrack.lines.length, 1, 'KML GPS tracks must become lines')
assert.deepEqual(
  [kmlTrack.lines[0][0].lat, kmlTrack.lines[0][0].lng],
  [17.0, 79.0],
  'gx:coord pairs are lat,lng'
)
assert.deepEqual(
  parseTrackCoordToken('17.5 79.5 12'),
  { lat: 17.5, lng: 79.5 },
  'track tokens parse as lat lng alt'
)

// Polygon outer rings are kept as closed lines; holes are never read.
const kmlPolygon = parseKmlGeometry(
  `<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>79.0,17.0 79.001,17.0 79.001,17.001 79.0,17.001 79.0,17.0</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>78.0,16.0 78.001,16.0 78.001,16.001 78.0,16.0</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark></kml>`
)
assert.equal(kmlPolygon.lines.length, 1, 'polygon outer rings must become one line')
assert.equal(kmlPolygon.lines[0].length, 5, 'outer rings stay closed')
const ringAnalysis = analyzeImportedGeometry(kmlPolygon, 50)
assert.equal(ringAnalysis.proposals.length, 1, 'a closed ring must propose one component')

// A non-KML file is rejected instead of silently proposing nothing.
assert.throws(
  () => parseKmlGeometry('PK\x03\x04 not xml at all'),
  /Not a KML file/,
  'binary garbage must be rejected as not-KML'
)

// Misnamed uploads are sniffed by content, not extension.
const zipMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer
assert.equal(looksLikeZip(zipMagic), true, 'PK magic must sniff as zip')
const textBytes = new TextEncoder().encode('<kml>').buffer
assert.equal(looksLikeZip(textBytes), false, 'XML text must not sniff as zip')
assert.equal(decodeUploadText(textBytes), '<kml>', 'upload bytes must decode as UTF-8')

// Template length rule shared by creation and editing.
const longLine = [pt(0, 0), pt(0.0009, 0)]
const redrawn = resolveTemplateGeometryEdit({
  line: longLine,
  typedLengthM: 250,
  currentLengthM: 100,
  currentAlignment: [pt(1, 1)],
  currentSource: 'manual'
})
assert.deepEqual(
  [redrawn.source, redrawn.lengthM],
  ['map', 250],
  'a redrawn line with a typed length uses the typed length'
)
const measured = resolveTemplateGeometryEdit({
  line: longLine,
  typedLengthM: null,
  currentLengthM: 100,
  currentAlignment: [pt(1, 1)],
  currentSource: 'manual'
})
assert.ok(
  measured.source === 'map' && Math.abs(measured.lengthM - 100) < 1,
  'a redrawn line without a typed length uses the measured length'
)
const kept = resolveTemplateGeometryEdit({
  line: null,
  typedLengthM: 250,
  currentLengthM: 100,
  currentAlignment: [pt(1, 1)],
  currentSource: 'manual'
})
assert.deepEqual(
  [kept.source, kept.lengthM, kept.alignment.length],
  ['manual', 250, 1],
  'a typed length without a redraw keeps the stored alignment'
)
const untouched = resolveTemplateGeometryEdit({
  line: null,
  typedLengthM: null,
  currentLengthM: 100,
  currentAlignment: [pt(1, 1), pt(1, 2)],
  currentSource: 'map'
})
assert.deepEqual(
  [untouched.source, untouched.lengthM, untouched.alignment.length],
  ['map', 100, 2],
  'no redraw and no typed length keeps everything stored'
)

// Empty uploads say so.
const empty = analyzeImportedGeometry({ lines: [], points: [], ignored: 0 }, 50)
assert.equal(empty.proposals.length, 0, 'nothing usable must propose nothing')

// --- Source shape: upload lives in Draw a line mode only. ---
const modalSource = read('src/renderer/src/components/modals/AddStructureModal.tsx')
const panelSource = read('src/renderer/src/components/newproject/GeometryImportPanel.tsx')
const mapSource = read('src/renderer/src/components/newproject/WorkingPointMap.tsx')
const storeSource = read('src/renderer/src/store/useStore.ts')
const kmlSource = read('src/renderer/src/lib/geometryImport.ts')

assert.match(
  panelSource,
  /accept="\.kml,\.kmz,\.geojson,\.json,\.shp"/,
  'The import panel must accept KML, KMZ, GeoJSON and SHP'
)
assert.match(
  modalSource,
  /locateMode === 'line'[\s\S]{0,120}GeometryImportPanel/,
  'The import panel must render in Draw a line mode only'
)
assert.doesNotMatch(
  mapSource,
  /type="file"/,
  'The map itself must not host the upload'
)
assert.match(
  storeSource,
  /createComponentsFromImport: \(parentId: string, proposals: ImportedComponentSpec\[\]\) => void/,
  'The store must expose batch creation for import proposals'
)
assert.match(
  modalSource,
  /createComponentsFromImport\(/,
  'The modal must create imported components in one batch'
)
assert.match(
  panelSource,
  /First trim \(m\)/,
  'Proposals must offer a first trim'
)
assert.match(
  panelSource,
  /Last trim \(m\)/,
  'Proposals must offer a last trim'
)
assert.match(
  panelSource,
  /No line found\. KML lines, GPS tracks and polygon boundaries/,
  'Empty uploads must say no line was found'
)
assert.match(
  kmlSource,
  /matchTagBlocks\(text, 'Placemark'\)/,
  'KML parsing must read Placemarks'
)
assert.doesNotMatch(
  kmlSource,
  /new DOMParser\(\)/,
  'KML parsing must stay pure string matching (no DOMParser)'
)
assert.match(
  kmlSource,
  /gx:coord/,
  'KML parsing must read GPS tracks'
)
assert.match(
  kmlSource,
  /outerBoundaryIs/,
  'KML parsing must read polygon outer rings'
)
assert.match(
  panelSource,
  /looksLikeZip\(buffer\)/,
  'Misnamed KML/KMZ uploads must be sniffed by content'
)

// --- Template attachments: same 50 m module in Bund/Canal/GuideWall. ---
const bundSetup = read('src/renderer/src/components/bund/BundSetup.tsx')
const canalSetup = read('src/renderer/src/components/canal/CanalSetup.tsx')
const guideWallSetup = read('src/renderer/src/components/guidewall/GuideWallSetup.tsx')
const uploadButton = read('src/renderer/src/components/guidewall/AlignmentUploadButton.tsx')

for (const [label, source] of [
  ['BundSetup', bundSetup],
  ['CanalSetup', canalSetup],
  ['GuideWallSetup', guideWallSetup]
]) {
  assert.match(
    source,
    /AlignmentUploadButton/,
    `${label} must offer the alignment file upload`
  )
}
assert.match(
  uploadButton,
  /analyzeImportedGeometry/,
  'The setup upload must use the same analyser module'
)
assert.match(
  uploadButton,
  /sort\(\(a, b\) => b\.lengthM - a\.lengthM\)/,
  'The setup upload must fill the longest distinct line'
)
assert.match(
  storeSource,
  /createTemplatedComponentsFromImport: \(/,
  'The store must expose template batch creation for import proposals'
)
assert.doesNotMatch(
  modalSource,
  /template-import/,
  'Add Component must not use a separate template step'
)
assert.doesNotMatch(
  modalSource,
  /setStep\('location'\)/,
  'Add Component must not use a separate location step'
)
assert.match(
  modalSource,
  /handleCreate/,
  'Add Component must create from a single dialog'
)
assert.match(
  modalSource,
  /createTemplatedComponentsFromImport\(/,
  'The single dialog must batch-create template components'
)
assert.match(
  panelSource,
  /Extend line/,
  'Proposal rows must offer line extension'
)
assert.match(
  panelSource,
  /appendVertex/,
  'Extension must append map clicks to the selected line'
)
assert.match(
  panelSource,
  /Vertices \(/,
  'Proposal lines must offer per-vertex editing'
)

// KMZ: a hand-built stored (uncompressed) archive must yield its inner KML.
const innerKml =
  '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark>' +
  '<LineString><coordinates>79.0,17.0 79.001,17.001</coordinates></LineString>' +
  '</Placemark></kml>'
const innerBytes = Buffer.from(innerKml, 'utf8')
const kmzName = Buffer.from('doc.kml', 'utf8')
const kmzBuffer = new ArrayBuffer(30 + kmzName.length + innerBytes.length)
const kmzView = new DataView(kmzBuffer)
kmzView.setUint32(0, 0x04034b50, true)
kmzView.setUint16(4, 20, true)
kmzView.setUint16(6, 0, true)
kmzView.setUint16(8, 0, true)
kmzView.setUint32(14, 0, true)
kmzView.setUint32(18, innerBytes.length, true)
kmzView.setUint32(22, innerBytes.length, true)
kmzView.setUint16(26, kmzName.length, true)
kmzView.setUint16(28, 0, true)
new Uint8Array(kmzBuffer).set(kmzName, 30)
new Uint8Array(kmzBuffer).set(innerBytes, 30 + kmzName.length)

extractKmlFromKmz(kmzBuffer)
  .then((text) => {
    assert.ok(
      text.includes('79.0,17.0 79.001,17.001'),
      'KMZ extraction must yield the inner KML coordinates'
    )
    console.log('geometry-import: ok')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
