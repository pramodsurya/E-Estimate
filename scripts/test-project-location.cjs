const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const libDir = path.join(root, 'src/renderer/src/lib')

function loadTs(relativePath, mocks = {}) {
  const filePath = path.join(libDir, relativePath)
  const loaded = new Module(filePath, module)
  loaded.filename = filePath
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath))
  loaded.require = (request) => {
    if (request in mocks) return mocks[request]
    if (request === './placeNormalization' || request === '../placeNormalization') {
      return loadTs('placeNormalization.ts')
    }
    if (request === './printLocation' || request === '../printLocation') {
      return loadTs('printLocation.ts')
    }
    throw new Error(`Unexpected import in location test: ${request}`)
  }
  const { outputText } = ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filePath
  })
  loaded._compile(outputText, filePath)
  return loaded.exports
}

const { resolveProjectPrintLocation } = loadTs('printLocation.ts')

function comp(id, allowance, children = [], kind = 'component') {
  return { id, kind, name: id, children, areaAllowance: allowance ?? null }
}

function projectWith(metaAllowance, nodes) {
  return {
    meta: { areaAllowance: metaAllowance ?? null, location: null },
    root: { id: 'root', kind: 'root', name: 'Root', children: nodes }
  }
}

const mallampet = { village: 'Mallampet', mandal: 'Dharur', district: 'Vikarabad' }

// 1. No component data anywhere: legacy project-level values, unchanged.
{
  const place = resolveProjectPrintLocation(projectWith(mallampet, []))
  assert.equal(place.samePlace, true)
  assert.equal(place.village, 'Mallampet')
  assert.equal(place.mandal, 'Dharur')
  assert.equal(place.district, 'Vikarabad')
}

// 2. No data at all: same place, empty strings (legacy behavior).
{
  const place = resolveProjectPrintLocation(projectWith(null, [comp('c1', null)]))
  assert.equal(place.samePlace, true)
  assert.equal(place.village, '')
  assert.equal(place.mandal, '')
  assert.equal(place.district, '')
}

// 3. All components in the same place (explicit + inherited): show it.
{
  const place = resolveProjectPrintLocation(
    projectWith(mallampet, [comp('c1', mallampet), comp('c2', null)])
  )
  assert.equal(place.samePlace, true)
  assert.equal(place.village, 'Mallampet')
}

// 4. Point works in two villages: hide everything, no fillers.
{
  const place = resolveProjectPrintLocation(
    projectWith(mallampet, [
      comp('c1', mallampet),
      comp('c2', { village: 'Kowkuntla', mandal: 'Dharur', district: 'Vikarabad' })
    ])
  )
  assert.equal(place.samePlace, false)
  assert.equal(place.village, '')
  assert.equal(place.mandal, '')
  assert.equal(place.district, '')
}

// 5. Same village, different mandal: different places.
{
  const place = resolveProjectPrintLocation(
    projectWith(null, [
      comp('c1', { village: 'Mallampet', mandal: 'Dharur', district: 'Vikarabad' }),
      comp('c2', { village: 'Mallampet', mandal: 'Kulkacherla', district: 'Vikarabad' })
    ])
  )
  assert.equal(place.samePlace, false)
}

// 6. Same village and mandal, different district: different places.
{
  const place = resolveProjectPrintLocation(
    projectWith(null, [
      comp('c1', { village: 'Mallampet', mandal: 'Dharur', district: 'Vikarabad' }),
      comp('c2', { village: 'Mallampet', mandal: 'Dharur', district: 'Sangareddy' })
    ])
  )
  assert.equal(place.samePlace, false)
}

// 7. Canal + bund + custom in one village: one rule for all work types.
{
  const canal = comp('canal1', mallampet)
  canal.templateId = 'canal'
  canal.canal = { lengthM: 30000 }
  const bund = comp('bund1', mallampet)
  bund.templateId = 'bund'
  bund.bund = { lengthM: 1200 }
  const place = resolveProjectPrintLocation(
    projectWith(null, [canal, bund, comp('point1', mallampet)])
  )
  assert.equal(place.samePlace, true)
  assert.equal(place.village, 'Mallampet')
}

// 8. Sub-component inherits its parent component's allowance.
{
  const parent = comp('c1', mallampet, [comp('s1', null, [], 'subcomponent')])
  const place = resolveProjectPrintLocation(projectWith(null, [parent]))
  assert.equal(place.samePlace, true)
  assert.equal(place.village, 'Mallampet')
}

// 9. Comparison is case- and whitespace-insensitive.
{
  const place = resolveProjectPrintLocation(
    projectWith(null, [
      comp('c1', { village: 'MALLAMPET ', mandal: 'dharur', district: 'vikarabad' }),
      comp('c2', { village: 'mallampet', mandal: 'Dharur', district: 'Vikarabad' })
    ])
  )
  assert.equal(place.samePlace, true)
  assert.equal(place.village, 'Mallampet')
}

console.log('Project print location helper passed (9 cases)')

// ---- Cover wiring: Typst template, Excel fields, saved-studio repair. ----
const coverTemplate = `#table(
  columns: (31mm, 1fr),
  [#text(size: 8pt, weight: "bold")[VILLAGE]], [[VILLAGE_NAME]],
  [#text(size: 8pt, weight: "bold")[MANDAL]], [[MANDAL_NAME]],
  [#text(size: 8pt, weight: "bold")[DISTRICT]], [[DISTRICT_NAME]],
  [#text(size: 8pt, weight: "bold")[SSR YEAR]], [[SSR_YEAR]],
)
`
const coverApi = loadTs('typist-output/coverTypst.ts', {
  '../projectPrintInputs': { resolveProjectEstimatedCost: () => null },
  '../nodeSettings': {},
  './documentSettings': {},
  './cover.typ?raw': coverTemplate,
  '../../assets/emblem-telangana.svg?raw': '<svg></svg>'
})
const { coverExcelFields, coverTypstTemplate, resolveSavedCoverSource } = coverApi

// Same place: legacy underscore fillers for missing fields.
{
  const fields = coverExcelFields(projectWith(mallampet, []))
  assert.equal(fields.village, 'Mallampet')
  assert.equal(fields.mandal, 'Dharur')
}

// Different places: empty strings so Excel omits the rows entirely.
{
  const fields = coverExcelFields(
    projectWith(mallampet, [
      comp('c1', mallampet),
      comp('c2', { village: 'Kowkuntla', mandal: 'Dharur', district: 'Vikarabad' })
    ])
  )
  assert.equal(fields.village, '')
  assert.equal(fields.mandal, '')
  assert.equal(fields.district, '')
  assert.match(fields.ssrYear, /_+/, 'SSR YEAR keeps its filler')
}

// Different places: the Typst cover drops the location rows, keeps SSR YEAR.
{
  const source = coverTypstTemplate(
    projectWith(mallampet, [
      comp('c1', mallampet),
      comp('c2', { village: 'Kowkuntla', mandal: 'Dharur', district: 'Vikarabad' })
    ])
  )
  assert.equal(source.includes('[VILLAGE]'), false, 'village row removed')
  assert.equal(source.includes('[MANDAL]'), false, 'mandal row removed')
  assert.equal(source.includes('[DISTRICT]'), false, 'district row removed')
  assert.equal(source.includes('[SSR YEAR]'), true, 'SSR YEAR row stays')
}

// Same place: rows stay with substituted names.
{
  const source = coverTypstTemplate(projectWith(mallampet, [comp('c1', mallampet)]))
  assert.equal(source.includes('Mallampet'), true)
  assert.equal(source.includes('[SSR YEAR]'), true)
}

// Saved studio copies (tokens already substituted) are stripped the same way.
{
  const saved = coverTemplate
    .replace('[VILLAGE_NAME]', 'Mallampet')
    .replace('[MANDAL_NAME]', 'Dharur')
    .replace('[DISTRICT_NAME]', 'Vikarabad')
    .replace('[SSR_YEAR]', '2025-26')
  const repaired = resolveSavedCoverSource(
    projectWith(mallampet, [
      comp('c1', mallampet),
      comp('c2', { village: 'Kowkuntla', mandal: 'Dharur', district: 'Vikarabad' })
    ]),
    saved
  )
  assert.equal(repaired.includes('Mallampet'), false, 'saved village row removed')
  assert.equal(repaired.includes('2025-26'), true, 'saved SSR YEAR stays')
  const untouched = resolveSavedCoverSource(projectWith(mallampet, [comp('c1', mallampet)]), saved)
  assert.equal(untouched, saved, 'same-place saved copies are untouched')
}

console.log('Cover location wiring passed (5 cases)')
