const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/masterSearch.ts')
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
loadedModule.require = request => {
  if (request !== './catalogueGuidance') return require(request)
  const guidanceFile = path.join(path.dirname(filePath), 'catalogueGuidance.ts')
  const guidance = new Module(guidanceFile, module)
  guidance.filename = guidanceFile
  guidance.paths = loadedModule.paths
  guidance._compile(ts.transpileModule(fs.readFileSync(guidanceFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, guidanceFile)
  return guidance.exports
}
loadedModule._compile(outputText, filePath)

const {
  applySemanticScores,
  normalizeMasterSearchText,
  parseMasterSearch,
  rankMasterItems,
  shouldUseSemanticSearch
} = loadedModule.exports

const items = [
  {
    side: 'SSR',
    category: 'ssr_item',
    code: 'IRR-CCDW-2-5',
    description:
      'Providing and laying insitu vibrated M-10 grade cement concrete using 40 mm aggregates for foundation filling including all materials.',
    unit: 'CUM'
  },
  {
    side: 'SSR',
    category: 'ssr_item',
    code: 'IRR-CCDW-2-6',
    description:
      'Providing and laying insitu vibrated M-10 grade cement concrete using 80 mm aggregates for foundation filling including all materials.',
    unit: 'CUM'
  },
  {
    side: 'SSR',
    category: 'ssr_item',
    code: 'IRR-CCDW-2-19',
    description:
      'Providing and laying insitu vibrated M-10 grade cement concrete using 80 mm aggregates for piers and abutments.',
    unit: 'CUM'
  },
  {
    side: 'SSR',
    category: 'ssr_item',
    code: 'IRR-CAW-7-10',
    description:
      'Providing and laying insitu vibrated M-10 grade cement concrete using 40 mm aggregates for bed and side lining of canal.',
    unit: 'CUM'
  },
  {
    side: 'SSR',
    category: 'ssr_item',
    code: 'IRR-CCDW-3-1',
    description: 'M-15 grade cement concrete for foundation filling.',
    unit: 'CUM'
  }
]

assert.equal(normalizeMasterSearchText('M-10 foundations'), 'm10 foundations')
assert.equal(normalizeMasterSearchText('600 mm NP-3 pipe'), '600mm np3 pipe')
assert.deepEqual(parseMasterSearch('M10 foundations').exactConstraints, ['m10'])
assert.equal(shouldUseSemanticSearch(parseMasterSearch('M10')), false)
assert.equal(shouldUseSemanticSearch(parseMasterSearch('M10 foundations')), true)

{
  const matches = rankMasterItems(items, 'M10')
  assert.equal(matches.length, 4)
  assert.ok(matches.every((match) => match.reasons.includes('M10 exact')))
  assert.ok(matches.every((match) => match.item.code !== 'IRR-CCDW-3-1'))
}

{
  const matches = rankMasterItems(items, 'M10 foundations')
  assert.deepEqual(
    matches.slice(0, 2).map((match) => match.item.code),
    ['IRR-CCDW-2-5', 'IRR-CCDW-2-6']
  )
  assert.ok(matches[0].reasons.includes('Description: foundation filling'))
}

{
  const matches = rankMasterItems(items, 'M10 footing')
  assert.deepEqual(
    matches.slice(0, 2).map((match) => match.item.code),
    ['IRR-CCDW-2-5', 'IRR-CCDW-2-6']
  )
}

{
  const matches = rankMasterItems(items, 'M10 foundation 40 mm')
  assert.deepEqual(matches.map((match) => match.item.code), ['IRR-CCDW-2-5'])
  assert.ok(matches[0].reasons.includes('40 mm exact'))
}

{
  const lexical = rankMasterItems(items, 'M10 foundations')
  const reranked = applySemanticScores(lexical, {
    'SSR:ssr_item:IRR-CCDW-2-6': 8,
    'SSR:ssr_item:IRR-CCDW-2-5': 7
  })
  assert.equal(reranked[0].item.code, 'IRR-CCDW-2-6')
  assert.ok(reranked.every((match) => match.item.code !== 'IRR-CCDW-3-1'))
}

// Grade constraints must be exact; substring matching let M5 through on M50.
assert.deepEqual(rankMasterItems([
  { ...items[0], code: 'grade-5', description: 'M5 plain concrete' },
  { ...items[0], code: 'grade-50', description: 'M50 plain concrete' }
], 'M5').map(match => match.item.code), ['grade-5'])

const scoped = { ...items[4], code: 'dam-item', description: 'M15 plain concrete', guidance: {
  shortSummary: 'M15 dam plain mass concrete', application: 'dam plain mass concrete',
  searchTerms: ['dam works', 'mass concrete'], grades: ['M15'], scope: []
} }
assert.equal(rankMasterItems([scoped, items[4]], 'M15 dam mass')[0].item.code, 'dam-item')
assert.equal(rankMasterItems([scoped], 'M25 dam').length, 0)
assert.equal(rankMasterItems([{ ...scoped, guidance: { ...scoped.guidance,
  descriptionDetail: 'Compare with the separate M25 recipe' } }], 'M25').length, 0)
assert.deepEqual(parseMasterSearch('plaster 1 : 4').exactConstraints, ['mix1x4'])
const { catalogueSourceDifferences, compareCatalogueCodes, catalogueChoiceNote } = loadedModule.require('./catalogueGuidance')
assert.deepEqual(['IRR-TAW-2-1', 'IRR-TAW-1-10', 'IRR-TAW-1-2', 'IRR-TAW-1-1'].sort(compareCatalogueCodes),
  ['IRR-TAW-1-1', 'IRR-TAW-1-2', 'IRR-TAW-1-10', 'IRR-TAW-2-1'])
const noteFor = (family, purpose) => catalogueChoiceNote({ code: 'TEST', description: '', guidance: { family, purpose } })
assert.equal(noteFor('concrete', 'Plain concrete work in dams; select the grade and aggregate size specified for the pour.'), '')
assert.equal(noteFor('concrete', 'Concrete for the coping slab, including its formwork.'), 'Concrete for the coping slab, including its formwork.')
assert.equal(noteFor('plaster', 'Surface finishing coat. Mortar 1:4 means 1 cement : 4 sand by volume.'), 'Mortar 1:4 means 1 cement : 4 sand by volume.')
assert.equal(noteFor('masonry', 'Stonework in regular courses with more closely dressed stones.'), 'Stonework in regular courses with more closely dressed stones.')
const passages = catalogueSourceDifferences([
  { code: 'manual', description: 'Providing embankment with hand ramming including all costs.' },
  { code: 'roller', description: 'Providing embankment with power roller compaction including all costs.' }
])
assert.match(passages[0], /hand ramming/)
assert.match(passages[1], /power roller compaction/)
assert.deepEqual(catalogueSourceDifferences([
  { code: 'a', description: 'Same specification' }, { code: 'b', description: 'Same specification' }
]), ['Same published wording', 'Same published wording'])
console.log('master SOR/SSR search tests passed')

