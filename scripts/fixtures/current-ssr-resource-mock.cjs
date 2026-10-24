// Reuse the recorded rate numbers while exercising the current RPC contract.
const fixture = require('./m25-project-data.json')
exports.identity = (original) => original.resource_identity && ({
  sourceTable: original.sor_ref ? 'SOR_Year' : null,
  masterCode: original.sor_ref ? `SOR-TEST-${original.resource_identity.master_code}` : null,
  rateComponent: original.resource_identity.rate_component,
  resourceKey: original.resource_identity.resource_key
})
exports.quote = (name, args, missing) => {
  if (name !== 'ssr_linked_resource_quote') throw new Error(`Unexpected RPC ${name}`)
  const original = fixture.base[args.p_analysis_scope][args.p_line_index]
  const ref = original.sor_ref
  const rows = ref.table === 'labour_rate' ? fixture.labour : fixture.machinery
  const key = ref.table === 'labour_rate' ? 'labour_code' : 'machinery_code'
  const row = rows.find(row => row[key] === ref.code && row.sor_year === args.p_year)
  const component = ref.component || 'rate'
  const zoned = row?.zone_rates?.[args.p_zone]
  const rate = Number((typeof zoned === 'object' ? zoned[component] : zoned) ?? row?.[component])
  return Promise.resolve({data: missing || !row || !Number.isFinite(rate)
    ? {status:'unavailable'} : {status:'priced',rate,unit:original.unit,year:args.p_year,zone:args.p_zone},error:null})
}
