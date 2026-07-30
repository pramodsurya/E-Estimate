const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/sorCatalogue.ts')
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
loadedModule.require = (request) =>
  request === './supabase' ? { supabase: {} } : require(request)
loadedModule._compile(outputText, filePath)

const {
  dimensionValue,
  groupSorCatalogueOptions,
  nextSorDimension,
  singletonSorDimensions,
  sorCommercialTerms,
  visibleSorDimensions
} = loadedModule.exports

const schema = {
  pipe_class: { type: 'text', values: ['NP2', 'NP3', 'NP4'] },
  diameter_mm: { type: 'number', values: ['300.0', '600.0', '900.0'] },
  column_label: { type: 'text', values: ['NP - 2 Class', 'NP - 3 Class', 'NP - 4 Class'] },
  row_label: { type: 'text', values: ['300 mm dia', '600 mm dia', '900 mm dia'] }
}

{
  const grouped = groupSorCatalogueOptions(
    [
      { dimension_key: 'pipe_class', dimension_value: 'NP2', matching_items: 3 },
      { dimension_key: 'pipe_class', dimension_value: 'NP3', matching_items: 3 },
      { dimension_key: 'pipe_class', dimension_value: 'NP4', matching_items: 3 },
      { dimension_key: 'diameter_mm', dimension_value: '900.0', matching_items: 3 },
      { dimension_key: 'diameter_mm', dimension_value: '300.0', matching_items: 3 },
      { dimension_key: 'diameter_mm', dimension_value: '600.0', matching_items: 3 },
      { dimension_key: 'column_label', dimension_value: 'NP - 2 Class', matching_items: 3 },
      { dimension_key: 'column_label', dimension_value: 'NP - 3 Class', matching_items: 3 },
      { dimension_key: 'column_label', dimension_value: 'NP - 4 Class', matching_items: 3 },
      { dimension_key: 'matrix_row', dimension_value: '5', matching_items: 1 }
    ],
    schema
  )

  assert.equal(nextSorDimension(grouped, {}), 'pipe_class')
  assert.deepEqual(grouped.diameter_mm.map((option) => option.value), [300, 600, 900])
  assert.equal(grouped.matrix_row, undefined)
}

{
  const grouped = groupSorCatalogueOptions(
    [
      { dimension_key: 'pipe_class', dimension_value: 'NP3', matching_items: 3 },
      { dimension_key: 'column_label', dimension_value: 'NP - 3 Class', matching_items: 3 },
      { dimension_key: 'diameter_mm', dimension_value: '300.0', matching_items: 1 },
      { dimension_key: 'diameter_mm', dimension_value: '600.0', matching_items: 1 },
      { dimension_key: 'diameter_mm', dimension_value: '900.0', matching_items: 1 }
    ],
    schema
  )
  const filters = { pipe_class: 'NP3' }
  assert.deepEqual(
    singletonSorDimensions(grouped, filters).map(({ key }) => key),
    ['column_label']
  )
  assert.equal(
    nextSorDimension(grouped, { ...filters, column_label: 'NP - 3 Class' }),
    'diameter_mm'
  )
}

assert.equal(dimensionValue(schema, 'diameter_mm', '600.0'), 600)
assert.deepEqual(
  visibleSorDimensions({ pipe_class: 'NP3', diameter_mm: 600, matrix_row: 4, matrix_column: 2 }),
  { pipe_class: 'NP3', diameter_mm: 600 }
)
assert.deepEqual(
  sorCommercialTerms({
    commercial_terms: {
      basis: 'ex_factory',
      transportation: 'excluded',
      taxes: 'excluded'
    }
  }),
  { basis: 'ex_factory', transportation: 'excluded', taxes: 'excluded' }
)

console.log('SOR catalogue selection tests passed')

