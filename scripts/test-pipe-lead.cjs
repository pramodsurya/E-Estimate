const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filePath = path.join(root, 'src/renderer/src/lib/pipeLead.ts')

function loadPipeLead(supabase) {
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
    request === './supabase' ? { supabase } : require(request)
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const rpcCalls = []
const api = loadPipeLead({
  rpc: async (name, args) => {
    rpcCalls.push({ name, args })
    return {
      data: {
        status: 'PRICED',
        sor_year: '2025-26',
        material_item_code: 'PH_MATERIAL_03_TEST',
        pipe_lead_item_code: 'PH-PIPELEAD-07-NP3-NP4-0600-TEST',
        pipe_lead_catalogue_code: 'PH-PIPELEAD-07',
        catalogue_name: 'Conveyance of RCC socket-and-spigot pipes',
        pipe_end_type: 'SOCKET_SPIGOT',
        pipe_class_group: 'NP3_NP4',
        pipe_classes: ['NP3', 'NP4'],
        diameter_mm: 600,
        unit: 'metre',
        distance_km: 5.1,
        quantity: 100,
        upto_5km_rate: 154.75,
        additional_per_started_km_rate: 7.42,
        additional_started_km: 1,
        lead_rate_per_metre: 162.17,
        amount: 16217,
        rate_scope: 'STATEWIDE_PUBLISHED',
        selected_zone: null,
        source_page: 654,
        handling_included: ['loading', 'unloading', 'stacking']
      },
      error: null
    }
  }
})

const source = api.pipeLeadSourceFromContext(
  {
    pipe_lead: {
      auto_apply: true,
      diameter_mm: 600,
      pipe_class_group: 'NP3_NP4',
      pipe_end_type: 'SOCKET_SPIGOT',
      handling_included: ['loading', 'unloading', 'stacking'],
      pipe_lead_item_code: 'PH-PIPELEAD-07-NP3-NP4-0600-TEST',
      distance_input_required: true,
      pipe_lead_catalogue_code: 'PH-PIPELEAD-07'
    }
  },
  'PH_MATERIAL_03_TEST'
)

assert.equal(source.materialItemCode, 'PH_MATERIAL_03_TEST')
assert.equal(source.pipeLeadItemCode, 'PH-PIPELEAD-07-NP3-NP4-0600-TEST')
assert.equal(source.diameterMm, 600)
assert.match(api.pipeLeadMaterialName(source), /NP3 \/ NP4 · 600 mm/)
assert.equal(
  api.pipeLeadCatalogueLabel(source),
  'RCC socket-and-spigot pipe conveyance',
  'User-facing pipe Lead labels must not expose backend catalogue codes'
)

const quote = api.normalizePipeLeadQuote({
  status: 'PRICED',
  sor_year: '2025-26',
  pipe_lead_item_code: source.pipeLeadItemCode,
  pipe_lead_catalogue_code: source.pipeLeadCatalogueCode,
  catalogue_name: 'Conveyance of RCC socket-and-spigot pipes',
  pipe_end_type: 'SOCKET_SPIGOT',
  pipe_class_group: 'NP3_NP4',
  pipe_classes: ['NP3', 'NP4'],
  diameter_mm: 600,
  unit: 'metre',
  distance_km: 6.1,
  quantity: 100,
  upto_5km_rate: 154.75,
  additional_per_started_km_rate: 7.42,
  additional_started_km: 2,
  lead_rate_per_metre: 169.59,
  amount: 16959,
  rate_scope: 'STATEWIDE_PUBLISHED',
  selected_zone: null,
  source_page: 654,
  handling_included: ['loading', 'unloading', 'stacking']
})
const breakdown = api.pipeLeadQuoteBreakdown(quote)
assert.equal(breakdown.conveyanceClass, 'RCC_PIPE')
assert.equal(breakdown.grossRate, 169.59)
assert.equal(breakdown.grossAmount, 16959)
assert.equal(breakdown.loadingRate, 0)
assert.equal(breakdown.unloadingRate, 0)
assert.deepEqual(
  breakdown.calculation.rows.map((row) => row.expression),
  ['154.75', '2 x 7.42']
)

void (async () => {
  const materialQuote = await api.fetchPipeLeadQuoteForMaterial({
    materialItemCode: 'PH_MATERIAL_03_TEST',
    sorYear: '2025-26',
    distanceKm: 5.1,
    quantity: 100,
    zone: null
  })
  assert.equal(materialQuote.leadRatePerMetre, 162.17)
  assert.deepEqual(rpcCalls[0], {
    name: 'get_pipe_lead_quote_for_material',
    args: {
      p_material_item_code: 'PH_MATERIAL_03_TEST',
      p_sor_year: '2025-26',
      p_distance_km: 5.1,
      p_quantity: 100,
      p_zone: null
    }
  })
  console.log('pipe Lead integration tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
