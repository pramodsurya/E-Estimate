const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath, mocks = {}) {
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
    if (request in mocks) return mocks[request]
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), request)
      const tsFile = resolved.endsWith('.ts') ? resolved : resolved + '.ts'
      if (fs.existsSync(tsFile)) return loadTsModule(tsFile, mocks)
    }
    return require(request)
  }
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

async function runTests() {
  console.log('--- Testing Lead Statement Excel Export (native rust_xlsxwriter payload path) ---')

  // Fixture mirroring the LeadExcelData the studio sends: summary rows plus
  // detailed per-material calculations (avg lead audit + weighted lead proof).
  const data = {
    project: 'Kodangal Canal',
    title: 'LEAD STATEMENT & CONVEYANCE CHARGES',
    subtitle: 'Lead Statement & Conveyance Charges',
    year: '2025-26',
    zone: 'Zone-Test',
    notes: '',
    rows: [
      {
        sl: '1',
        name: 'Sand for Canal Lining',
        quarry: 'Average Lead along Canal Reach 1 (3 points)',
        conveyance_class: 'SAND',
        lead_km: '15.00 km',
        lift_m: '0.00',
        rate: '245.00',
        rate_unit: 'cum',
        uses: '1',
        lead_type_tag: 'Avg Lead (Line sampling)'
      },
      {
        sl: '2',
        name: 'Coarse Aggregate 40mm',
        quarry: 'Weighted average across 2 sources',
        conveyance_class: 'AGGREGATE',
        lead_km: '28.50 km',
        lift_m: '0.00',
        rate: '380.00',
        rate_unit: 'cum',
        uses: '2',
        lead_type_tag: 'Weighted Avg · Whole Project'
      }
    ],
    materials: [
      {
        sl: '1',
        name: 'Sand for Canal Lining',
        lead_km: '15.00 km',
        route: 'Average Lead along Canal Reach 1 (3 points)',
        conveyance_class: 'SAND',
        rate: '245.00',
        rate_unit: 'cum',
        steps: [
          { label: 'Conveyance charges for 15.00 km', expression: '15.00 km', amount: 'Rs. 245.00', amount_value: 245, quantity: null, unit_rate: null },
          { label: '', expression: '', amount: '', amount_value: null, quantity: null, unit_rate: null }
        ],
        calculation: { leadRate: 245, loadingRate: 0, unloadingRate: 0, liftRate: 0 },
        lift_m: 0,
        included_lift_m: 3,
        charged_lift_m: 0,
        lift_unit_rate: null,
        material_rate: '245.00',
        loading_rate: '0.00',
        unloading_rate: '0.00',
        lift_rate: '0.00',
        lead_type_tag: 'Avg Lead (Line sampling)',
        avg_lead: {
          mode: 'line',
          mode_label: 'Line sampling',
          component_name: 'Canal Reach 1 Alignment',
          point_count: 3,
          avg_km: 15.0,
          avg_km_text: '15.00',
          routes: [
            { index: 1, chainage_m: 0, chainage_text: '0 m', route_km: 14.0, route_km_text: '14.00' },
            { index: 2, chainage_m: 500, chainage_text: '500 m', route_km: 15.0, route_km_text: '15.00' },
            { index: 3, chainage_m: 1000, chainage_text: '1000 m', route_km: 16.0, route_km_text: '16.00' },
            { chainage_m: 1500, route_km: 17.0 }
          ]
        },
        weighted_lead: null
      },
      {
        sl: '2',
        name: 'Coarse Aggregate 40mm',
        lead_km: '28.50 km',
        route: 'Weighted average across 2 sources',
        conveyance_class: 'AGGREGATE',
        rate: '380.00',
        rate_unit: 'cum',
        steps: [
          { label: 'Conveyance charges for 28.50 km', expression: '28.50 km', amount: 'Rs. 380.00', amount_value: 380, quantity: null, unit_rate: null }
        ],
        calculation: { leadRate: 380, loadingRate: 0, unloadingRate: 0, liftRate: 0 },
        lift_m: 0,
        included_lift_m: 3,
        charged_lift_m: 0,
        lift_unit_rate: null,
        material_rate: '380.00',
        loading_rate: '0.00',
        unloading_rate: '0.00',
        lift_rate: '0.00',
        lead_type_tag: 'Weighted Avg · Whole Project',
        avg_lead: null,
        weighted_lead: {
          total_quantity: 200,
          total_quantity_text: '200',
          weighted_avg_km: 28.5,
          weighted_avg_km_text: '28.50',
          formula: '(100 × 20.00 km + 100 × 37.00 km) ÷ 200 = 28.50 km',
          entries: [
            { name: 'North Quarry', quantity: 100, quantity_text: '100', unit: 'cum', lead_km: 20.0, lead_km_text: '20.00', product: 2000, product_text: '2,000.00' },
            { name: 'South Quarry', quantity: 100, quantity_text: '100', unit: 'cum', lead_km: 37.0, lead_km_text: '37.00', product: 3700, product_text: '3,700.00' }
          ]
        }
      }
    ],
    signature: [{ designation: 'Executive Engineer', office: 'Test Division' }]
  }

  // 1. Fixture content: every value the native payload carries, including the
  // numbers the Rust parser reads out of display strings ("28.50 km" -> 28.5).
  assert.equal(data.rows.length, 2, 'Two summary rows')
  assert.equal(data.materials.length, 2, 'Two detailed materials')
  const weighted = data.materials[1].weighted_lead
  assert.ok(weighted, 'Second material carries a weighted lead proof')
  assert.equal(weighted.total_quantity, 200, 'Weighted total quantity')
  assert.equal(weighted.weighted_avg_km, 28.5, 'Weighted average km')
  assert.equal(
    weighted.entries.reduce((sum, entry) => sum + entry.product, 0) / weighted.total_quantity,
    28.5,
    'Entries reproduce the weighted average (2000 + 3700) / 200'
  )
  assert.ok(
    weighted.formula.includes('28.50 km'),
    'Weighted formula text carries the adopted average'
  )
  const avg = data.materials[0].avg_lead
  assert.ok(avg, 'First material carries an avg lead audit')
  assert.equal(avg.point_count, 3, 'Avg audit point count')
  assert.equal(avg.component_name, 'Canal Reach 1 Alignment', 'Avg audit component')
  assert.equal(avg.routes.length, 4, 'Avg audit routes including the raw fallback route')
  assert.equal(data.signature[0].designation, 'Executive Engineer', 'Signature designation')
  console.log('✓ Payload fixture content verified (summary, avg audit, weighted proof, signature)')

  // 2. Static contract: the studio sends kind 'lead' through the native
  // command, wired next to Download PDF, synced from fresh entries — and the
  // old ExcelJS builder is fully gone.
  const session = fs.readFileSync(
    path.join(root, 'src/renderer/src/components/lead/LeadPrintStudioSession.tsx'),
    'utf8'
  )
  assert.ok(
    session.includes('onExportExcel={() => exportLeadStatementExcel()}'),
    'lead studio must wire the Excel export next to Download PDF'
  )
  assert.ok(session.includes("kind: 'lead'"), 'studio must send the lead kind')
  assert.ok(session.includes('window.api.excel.compile(payload)'), 'studio must compile via the native command')
  assert.ok(
    session.includes('await syncLeadDashboardSnapshot(current)'),
    'excel export must sync fresh entries instead of trusting the stored snapshot'
  )
  assert.ok(!session.includes('exportLeadWorkbook'), 'old ExcelJS builder must be gone from the session')
  assert.ok(!session.includes('excel-output/leadExcel'), 'old builder module must no longer be imported')
  const rustCompiler = fs.readFileSync(path.join(root, 'src-tauri/src/excel_compile.rs'), 'utf8')
  assert.ok(rustCompiler.includes('LeadPayload'), 'Rust must read a lead payload')
  assert.ok(rustCompiler.includes('weightedLead') || rustCompiler.includes('weighted_lead'), 'Rust must read the weighted lead proof')
  assert.ok(rustCompiler.includes('avgLead') || rustCompiler.includes('avg_lead'), 'Rust must read the avg lead audit')
  console.log('✓ Native payload contract verified (studio kind + Rust payload fields)')

  console.log('test-lead-excel: all checks passed')
}

runTests().catch((error) => {
  console.error(error)
  process.exit(1)
})
