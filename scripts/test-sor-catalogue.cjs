const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/sorCatalogue.ts')
const source = fs.readFileSync(filePath, 'utf8')
const catalogueColumnSource = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/modals/SorCatalogueColumn.tsx'),
  'utf8'
)
const catalogueSearchMigration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260730154500_add_sor_catalogue_item_search.sql'
  ),
  'utf8'
)
const catalogueSearchIndexMigration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260731083000_preserve_sor_search_dimensions.sql'
  ),
  'utf8'
)

assert.match(
  source,
  /searchSorCatalogueItems[\s\S]*?supabase\.rpc\('search_sor_catalogue_items'/,
  'SOR item search must query the year-aware catalogue search RPC'
)
assert.match(
  catalogueColumnSource,
  /Search SOR item descriptions or catalogues/,
  'Add Item must tell the user that catalogue descriptions are searchable'
)
assert.match(
  catalogueColumnSource,
  /Catalogue item matches[\s\S]*?chooseSearchMatch\(match\)/,
  'Catalogue search results must open the exact published item cell'
)
assert.match(
  catalogueSearchMigration,
  /rate\.sor_year = p_sor_year[\s\S]*?to_tsvector\('simple'/,
  'Catalogue item search must be limited to the selected SOR year and search item text'
)
assert.match(
  catalogueSearchIndexMigration,
  /search_vector tsvector[\s\S]*?using gin \(search_vector\)/,
  'Catalogue description search must use a GIN full-text index'
)
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
  sorPublishedReference,
  sorPublishedReferenceLabel,
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

// Actual extracted hard-metal row: the printed serial is 230, the S.S. item is b,
// and the matrix row r183 / generated hash must never become the serial number.
const hardMetalReference = sorPublishedReference('Roads and Bridges work items', {
  title: '',
  headers: ['Sl. No', 'S.S. Item No', 'Description', 'Unit', 'Scheduled Rate', 'Remarks'],
  raw_row: ['230', 'b', '50 mm thickness', '10 sqm', 'detailed analysis as per MoRTH Data', ''],
  row_key: 'r183',
  item_code: 'RB_WORK_6411571526E0'
}, { row_label: '50 mm thickness b', column_label: 'Scheduled Rate' })
assert.equal(hardMetalReference.serialNumber, '230')
assert.equal(hardMetalReference.scheduleItemNumber, 'b')
assert.equal(sorPublishedReferenceLabel(hardMetalReference), 'Roads and Bridges work items · Sl. No. 230')

// Actual pipe matrix: blank Sl. No., but a published table title and row/column.
const pipeReference = sorPublishedReference('RCC plain-ended pipes', {
  title: '1. R.C.C. PLAIN ENDED PIPES',
  headers: ['Sl. No.', 'Description / Size', 'Unit', 'Rate in Rs. / NP - 2 Class'],
  raw_row: ['', '80 mm dia', 'Metre', '182'],
  row_key: 'r2',
  sort_order: 2
}, { row_label: '80 mm dia', column_label: 'Rate in Rs. / NP - 2 Class' })
assert.equal(pipeReference.serialNumber, undefined)
assert.equal(sorPublishedReferenceLabel(pipeReference), '1. R.C.C. PLAIN ENDED PIPES · 80 mm dia · Rate in Rs. / NP - 2 Class')
assert.equal(sorPublishedReference('Work', { headers: ['Description', 'Sl. No.'], raw_row: ['Test', '12(a)'] }).serialNumber, '12(a)')
assert.equal(sorPublishedReference('Work', { headers: ['S.S. Item No'], raw_row: ['8a'] }).serialNumber, undefined)
assert.equal(sorPublishedReference('Work', { table_name: 'Printed table', serial_number: '7(b)', headers: [], raw_row: [] }).serialNumber, '7(b)')
assert.equal(sorPublishedReferenceLabel(sorPublishedReference('Work', { raw_row: ['123'], headers: [] })), 'Work')

console.log('SOR catalogue selection and published-reference tests passed')
