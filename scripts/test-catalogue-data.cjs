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
  loadedModule.require = (request) => request in mocks ? mocks[request] : require(request)
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

function catalogueNode(extra = {}) {
  return {
    id: 'catalogue-node',
    kind: 'item',
    name: 'PH_MATERIAL_01_CC59135EC852',
    children: [],
    itemSource: 'SOR',
    categoryKey: 'sor_catalogue',
    itemCode: 'PH_MATERIAL_01_CC59135EC852',
    itemDescription: 'RCC plain-ended pipes — 600 mm dia',
    unit: 'Metre',
    itemEditorType: 'spreadsheet',
    sorCatalogue: {
      catalogueCode: 'PH_MATERIAL_01',
      catalogueName: 'RCC plain-ended pipes',
      part: 'PART_8_PUBLIC_HEALTH',
      section: 'Materials',
      dimensions: {
        pipe_class: 'NP3',
        diameter_mm: 600,
        column_label: 'NP - 3 Class',
        row_label: '600 mm dia'
      },
      selectedYear: '2025-26',
      publishedRate: 2846,
      rateText: null,
      effectiveFrom: '2025-06-01',
      source: 'Telangana SOR',
      sourcePage: 647,
      sourceTitle: 'Telangana SOR 2025-26',
      commercialTerms: {
        basis: 'ex_factory',
        transportation: 'excluded',
        taxes: 'excluded'
      }
    },
    ...extra
  }
}

async function main() {
  const createdData = loadTsModule(
    path.join(root, 'src/renderer/src/lib/createdData.ts')
  )
  const source = catalogueNode()
  assert.equal(createdData.canCreateDataFromItem(source), true)
  assert.equal(
    createdData.canCreateDataFromItem({ ...source, itemSource: 'SOR', sorCatalogue: undefined }),
    false,
    'basic SOR rows are inputs, not independently cloned catalogue DATAs'
  )
  assert.equal(
    createdData.canCreateDataFromItem({ ...source, itemSource: 'SSR', sorCatalogue: undefined }),
    true
  )

  const copied = createdData.createdDataSourceFields(source)
  assert.deepEqual(copied.sorCatalogue, source.sorCatalogue)
  assert.notEqual(copied.sorCatalogue, source.sorCatalogue)
  assert.notEqual(copied.sorCatalogue.dimensions, source.sorCatalogue.dimensions)
  assert.notEqual(copied.sorCatalogue.commercialTerms, source.sorCatalogue.commercialTerms)
  copied.sorCatalogue.dimensions.diameter_mm = 900
  assert.equal(source.sorCatalogue.dimensions.diameter_mm, 600)

  const legacyCreated = {
    ...source,
    id: 'legacy-created',
    name: 'PH_MATERIAL_01_Custom pipe DATA',
    splitFromNodeId: source.id,
    splitFromItemKey: `SOR:sor_catalogue:${source.itemCode}`,
    createdDataId: 'legacy-created',
    sorCatalogue: undefined
  }
  const repairedRoot = createdData.repairCreatedDataCatalogueSelections({
    id: 'root',
    kind: 'title',
    name: 'Project',
    children: [source, legacyCreated]
  })
  const repairedCreated = repairedRoot.children.find((node) => node.id === 'legacy-created')
  assert.deepEqual(repairedCreated.sorCatalogue, source.sorCatalogue)
  assert.notEqual(repairedCreated.sorCatalogue, source.sorCatalogue)

  let catalogueMatches = [{
    item_code: source.itemCode,
    item_name: '600 mm dia',
    unit: 'Metre',
    dimensions: source.sorCatalogue.dimensions,
    rate: 2846,
    rate_text: '',
    effective_from: '2025-06-01',
    source: 'Telangana SOR',
    source_page: 647,
    source_context: {
      title: 'Telangana SOR 2025-26',
      commercial_terms: source.sorCatalogue.commercialTerms
    }
  }]
  const rateAnalysis = loadTsModule(
    path.join(root, 'src/renderer/src/lib/rateAnalysis.ts'),
    {
      './supabase': { supabase: {} },
      './dataVariants': {
        applyDataVariantToRecipe: (recipe) => recipe,
        buildDataVariantSpec: () => ({})
      },
      './projectItems': {
        projectItemKey: () => `SOR:sor_catalogue:${source.itemCode}`
      },
      './rateAnalysisVisibility': {
        parseRateAnalysisVisibility: () => ({})
      },
      './sorCatalogue': {
        SOR_CATALOGUE_CATEGORY: 'sor_catalogue',
        fetchSorCataloguePrice: async () => catalogueMatches,
        sorCommercialTerms: (context) => context.commercial_terms,
        sourceContextTitle: () => 'Telangana SOR 2025-26'
      }
    }
  )

  const numericRecipe = await rateAnalysis.fetchRateAnalysis(source, '2025-26')
  assert.equal(numericRecipe.itemSource, 'SOR')
  assert.equal(numericRecipe.publishedRate, 2846)
  assert.equal(numericRecipe.unit, 'Metre')
  assert.equal(numericRecipe.sections[0].lines[0].rate, 2846)
  assert.deepEqual(
    numericRecipe.sorCatalogueSource.dimensions,
    source.sorCatalogue.dimensions
  )
  assert.equal(numericRecipe.sorCatalogueSource.commercialTerms.transportation, 'excluded')

  catalogueMatches = [{
    ...catalogueMatches[0],
    rate: null,
    rate_text: 'To follow as per Standard Data'
  }]
  const referenceRecipe = await rateAnalysis.fetchRateAnalysis(source, '2025-26')
  assert.equal(referenceRecipe.publishedRate, undefined)
  assert.equal(referenceRecipe.publishedRateText, 'To follow as per Standard Data')
  assert.equal(referenceRecipe.unresolvedLines, 1)
  assert.equal(
    referenceRecipe.sections.every((section) => section.lines.length === 0),
    true,
    'a printed reference must not be converted to a zero-valued DATA line'
  )

  let dashboardFetch = async () => {
    throw new Error('This item does not contain a saved SOR catalogue selection.')
  }
  const dashboardSync = loadTsModule(
    path.join(root, 'src/renderer/src/lib/dashboardSync.ts'),
    {
      './lead': {
        calculateLeadVariantChargeFromRows: () => ({}),
        fetchLeadRates: async () => [],
        fetchSsrLeadApplicability: async () => ({})
      },
      './projectItems': {
        projectItemKey: (node) => `${node.itemSource}:${node.categoryKey}:${node.itemCode}`,
        projectNodePath: () => [],
        rateAnalysisOverrideForNode: () => null,
        rateAnalysisOverrideResolution: () => ({ recipe: null, scope: 'shared' })
      },
      './leadApplications': { scopedLeadRateAddition: () => 0 },
      './rateAnalysis': {
        calculateRateAnalysis: () => ({ ratePerUnit: 0 }),
        fetchRateAnalysis: (...args) => dashboardFetch(...args)
      },
      './projectTax': { fetchGstRateRules: async () => [] },
      './seigniorage': {
        fetchSeigniorageCharges: async () => [],
        fetchSeignioragePolicies: async () => ({}),
        projectSeigniorageItemCodes: () => []
      },
      './finalNumber': {
        componentItemsTotal: () => 0,
        readFinalValueFromSnapshot: () => 0
      }
    }
  )
  const project = {
    id: 'project',
    meta: {
      name: 'Test',
      sorYear: '2025-26',
      sorZone: 'zone_3',
      areaAllowancePercent: 0
    },
    root: { id: 'root', kind: 'title', name: 'Test', children: [source] }
  }

  await assert.rejects(
    dashboardSync.fetchDashboardItemData(project, [source]),
    /Could not prepare 1 source DATA entry.*PH_MATERIAL_01_CC59135EC852.*saved SOR catalogue selection/,
    'source-backed failures must stop Sync instead of being marked as compiled'
  )

  dashboardFetch = async () => numericRecipe
  const compiled = await dashboardSync.fetchDashboardItemData(project, [source])
  assert.equal(compiled.rates[source.id], 2846)
  assert.equal(compiled.recipes[source.id].sorCatalogueSource.catalogueCode, 'PH_MATERIAL_01')

  project.dashboardSnapshot = {
    syncedAt: '2026-07-01T00:00:00.000Z',
    dataSyncedAt: '2026-07-01T00:00:00.000Z',
    dataCompileSignature: 'old-total-data',
    componentSyncedAt: { component: '2026-07-01T00:00:00.000Z' },
    projectSyncedAt: '2026-07-01T00:00:00.000Z',
    context: {
      sorYear: '2025-26',
      sorZone: 'zone_3',
      areaAllowancePercent: 0
    },
    syncedItemIds: [],
    itemSignatures: {},
    rates: {},
    recipes: {},
    gstRules: [],
    seigniorageCharges: [],
    seignioragePolicies: {}
  }
  const individuallySynced = await dashboardSync.syncIndividualDataSnapshot(project, [source])
  assert.equal(individuallySynced.rates[source.id], 2846)
  assert.equal(
    individuallySynced.recipes[source.id].sorCatalogueSource.catalogueCode,
    'PH_MATERIAL_01'
  )
  assert.equal(individuallySynced.syncedItemIds.includes(source.id), true)
  assert.equal(individuallySynced.dataSyncedAt, undefined)
  assert.equal(individuallySynced.dataCompileSignature, undefined)
  assert.deepEqual(individuallySynced.componentSyncedAt, {})
  assert.equal(individuallySynced.projectSyncedAt, undefined)

  const rateDashboardSource = fs.readFileSync(
    path.join(
      root,
      'src/renderer/src/components/rateanalysis/RateAnalysisDashboard.tsx'
    ),
    'utf8'
  )
  assert.match(rateDashboardSource, /syncIndividualDataSnapshot/)
  assert.match(rateDashboardSource, /Sync this DATA/)

  console.log('SOR catalogue DATA preparation tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
