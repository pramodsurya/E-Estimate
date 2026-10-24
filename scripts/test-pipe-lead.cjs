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
  loadedModule.require = (request) => {
    if (request === './supabase') return { supabase }
    if (request === './lead') {
      const leadPath = path.join(path.dirname(filePath), 'lead.ts')
      const compiled = ts.transpileModule(fs.readFileSync(leadPath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      })
      const lead = new Module(leadPath, module)
      lead.filename = leadPath
      lead.require = name => name === './supabase' ? { supabase } : require(name)
      lead._compile(compiled.outputText, leadPath)
      return lead.exports
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const rpcCalls = []
const api = loadPipeLead({
  from(table) {
    assert.equal(table, 'SOR_Recipie')
    const filters = {}
    const query = { select() { return query }, eq(k, v) { filters[k] = v; return query },
      then(resolve, reject) {
        assert.equal(filters.table_code, 'P04-T07')
        assert.equal(filters['metadata->public_health_cell->row->>id'], '600 mm dia')
        return Promise.resolve({ error: null, data: [
          { recipe_code: 'SOR-P04-T07-M0037', cell: { column: { id: 'NP3/NP4 — up to 5 km' } } },
          { recipe_code: 'SOR-P04-T07-M0038', cell: { column: { id: 'NP3/NP4 — each additional km or part' } } }
        ] }).then(resolve, reject)
      } }
    return query
  },
  rpc: async (name, args) => {
    rpcCalls.push({ name, args })
    assert.equal(name, 'sor_resource_quote', 'Only current tariff quotes are allowed')
    return { error: null, data: {
      status: 'priced', recipe_code: args.p_recipe_code, year_row_code: `annual:${args.p_recipe_code}`,
      year: args.p_year, zone: args.p_zone, unit: 'm',
      rate: args.p_recipe_code.endsWith('0037') ? 154.75 : 7.42
    } }
  }
})

const source={materialItemCode:'PH_MATERIAL_03_TEST',pipeLeadItemCode:'selected-pipe-tariff',pipeLeadCatalogueCode:'PH-PIPELEAD-07',
 pipeEndType:'SOCKET_SPIGOT',pipeClassGroup:'NP3_NP4',diameterMm:600,unit:'m',autoApply:true,distanceInputRequired:true,
 handlingIncluded:['loading','unloading','stacking']}

assert.equal(source.materialItemCode, 'PH_MATERIAL_03_TEST')
assert.equal(source.pipeLeadItemCode, 'selected-pipe-tariff')
assert.equal(source.diameterMm, 600)
assert.match(api.pipeLeadMaterialName(source), /NP3 \/ NP4 · 600 mm/)
assert.equal(
  api.pipeLeadCatalogueLabel(source),
  'RCC socket-and-spigot pipe conveyance',
  'User-facing pipe Lead labels must not expose backend catalogue codes'
)

void (async () => {
  const materialQuote = await api.fetchPipeLeadQuoteForMaterial({
    materialItemCode: 'PH_MATERIAL_03_TEST',
    sorYear: '2025-26',
    distanceKm: 5.1,
    quantity: 100,
    zone: 'zone_2',
    source
  })
  assert.equal(materialQuote.leadRatePerMetre, 162.17)
  assert.equal(materialQuote.selectedZone, 'zone_2')
  assert.deepEqual(rpcCalls.map(call => call.args.p_zone), ['zone_2', 'zone_2'])
  assert.deepEqual(rpcCalls.map(call => call.args.p_year), ['2025-26', '2025-26'])
  assert.equal(materialQuote.pipeLeadItemCode, source.pipeLeadItemCode)
  await assert.rejects(api.fetchPipeLeadQuoteForMaterial({
    materialItemCode: 'UNKNOWN', sorYear: '2025-26', distanceKm: 1, quantity: 1, zone: 'zone_2'
  }), /Select the pipe conveyance/)
  console.log('pipe Lead integration tests passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
