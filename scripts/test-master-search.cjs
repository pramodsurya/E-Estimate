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

console.log('master SOR/SSR search tests passed')

