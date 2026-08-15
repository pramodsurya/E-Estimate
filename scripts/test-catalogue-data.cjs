const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

/**
 * Resolve a relative import the way the module itself would see it.
 *
 * The loaded module's `require` used to hand every unmocked request to this
 * file's own `require`, which resolves against scripts/. A relative import like
 * './materialRates' therefore looked for scripts/materialRates and failed. It
 * only stayed quiet while every relative import happened to be mocked.
 */
function resolveRelative(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Keyed by file and mock set, so a diamond import is compiled once, not twice. */
const tsModuleCache = new Map()

function loadTsModule(filePath, mocks = {}) {
  const cacheKey = `${filePath}::${Object.keys(mocks).sort().join(',')}`
  const cached = tsModuleCache.get(cacheKey)
  if (cached) return cached.exports
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
  // Seed the cache before compiling: a cycle must see the half-built exports
  // rather than compile the same file again forever.
  tsModuleCache.set(cacheKey, loadedModule)
  loadedModule.require = (request) => {
    if (request in mocks) return mocks[request]
    if (request.startsWith('.')) {
      const resolved = resolveRelative(filePath, request)
      // The Supabase client reads import.meta.env, which cannot be emitted as
      // CommonJS - Node then detects ESM and refuses the module. Nothing under
      // test wants a live client, so it is always the stub unless a caller
      // mocked it with something richer above.
      if (resolved && resolved.endsWith(`${path.sep}supabase.ts`)) return { supabase: {} }
      if (resolved) return loadTsModule(resolved, mocks)
    }
    return require(request)
  }
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
  const source = catalogueNode()

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
      './pipeLead': {
        pipeLeadSourceFromContext: () => undefined
      },
      './materialRates': {
        applyMaterialRateOverrides: (recipe) => ({ recipe, applications: [] }),
        fetchMaterialAliases: async () => new Map(),
        fetchMonthlyMaterials: async () => []
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

  const projectData = loadTsModule(
    path.join(root, 'src/renderer/src/lib/projectData.ts'),
    {
      './rateAnalysis': {
        recalculateRateAnalysis: (recipe) => recipe
      },
      './rateAnalysisVisibility': {
        defaultRateAnalysisLayout: (description) => ({ description })
      },
      './projectItems': {
        projectItemKey: (node) => `PROJECT_DATA:${node.projectDataId}`
      }
    }
  )
  const projectDataDefinition = {
    id: 'project-data-1',
    kind: 'sor',
    code: 'DATA-SOR-001',
    description: 'Supplying approved sand',
    unit: 'Cum',
    rate: 1350,
    lead: {
      applicable: true,
      materialName: 'Sand',
      conveyanceClass: 'EARTH'
    }
  }
  const projectDataNode = {
    ...source,
    id: 'project-data-node',
    itemSource: 'PROJECT_DATA',
    itemCode: 'DATA-SOR-001',
    itemDescription: projectDataDefinition.description,
    projectDataId: projectDataDefinition.id
  }
  // Awaited: the recipe became async when project material rate overrides were
  // applied inside it. Without this every assertion below reads a property off
  // a Promise and compares undefined.
  const projectDataRecipe = await projectData.projectDataRecipe(
    projectDataDefinition,
    projectDataNode,
    '2025-26',
    'zone_3'
  )
  assert.equal(projectDataRecipe.itemSource, 'SOR')
  assert.equal(projectDataRecipe.publishedRate, 1350)
  assert.equal(projectDataRecipe.sections[0].lines[0].description, projectDataDefinition.description)
  assert.deepEqual(projectDataRecipe.leadApplicability, {
    classes: ['EARTH'],
    materials: { Sand: 'EARTH' }
  })
  assert.equal(projectDataRecipe.seigniorageApplicability.applicable, true)
  assert.equal(
    projectDataRecipe.seigniorageApplicability.rows[0].material_desc,
    projectDataDefinition.description
  )
  assert.equal(
    (
      await projectData.projectDataRecipe(
        { ...projectDataDefinition, seigniorage: { applicable: false } },
        projectDataNode,
        '2025-26',
        'zone_3'
      )
    ).seigniorageApplicability.applicable,
    false,
    'a user-disabled Project DATA must not enter the Seigniorage dashboard'
  )

  const projectSsrDataDefinition = {
    id: 'project-ssr-data-1',
    kind: 'ssr',
    code: 'DATA-SSR-001',
    description: 'Providing and removing scaffolding',
    unit: 'Sqm',
    imageDataUrl: 'data:image/png;base64,project-data-image',
    outputQuantity: 2,
    overheadPercent: 0,
    lead: { applicable: false },
    sections: [
      {
        key: 'materials',
        label: 'A. Materials',
        lines: [
          // Both rows carry the flag because that is what the app writes:
          // CreateProjectDataModal marks every Materials row applicable, and the
          // estimator unticks the ones that are not minerals. A fixture without
          // it models a DATA the app cannot produce.
          {
            id: 'mat-1',
            slNo: '1',
            description: 'Sand filling',
            unit: 'Cum',
            quantity: 2,
            rate: 100,
            amount: 200,
            seigniorageApplicable: true,
            lead: {
              applicable: true,
              materialName: 'Sand',
              conveyanceClass: 'EARTH'
            }
          },
          {
            id: 'mat-2',
            slNo: '2',
            description: 'Scaffolding allowance',
            unit: 'Each',
            quantity: 1,
            rate: 0,
            rateFormula: '=MAT1_RATE * 10%',
            amount: 0,
            seigniorageApplicable: true
          }
        ]
      },
      {
        key: 'machinery',
        label: 'B. Machinery',
        lines: [{
          id: 'mac-1',
          slNo: '1',
          description: 'Steel lifting frame',
          unit: 'Each',
          quantity: 1,
          rate: 20,
          amount: 20,
          lead: {
            applicable: true,
            materialName: 'Steel',
            conveyanceClass: 'STEEL'
          },
          seigniorageApplicable: false
        }]
      },
      { key: 'labour', label: 'C. Labour', lines: [] }
    ]
  }
  const resolvedSsrSections = projectData.resolveProjectSsrSections(projectSsrDataDefinition.sections)
  assert.equal(resolvedSsrSections[0].lines[1].rate, 10)
  assert.equal(resolvedSsrSections[0].lines[1].amount, 10)
  assert.equal(projectData.projectDataRate(projectSsrDataDefinition), 115)
  const projectSsrRecipe = await projectData.projectDataRecipe(
    projectSsrDataDefinition,
    { ...projectDataNode, projectDataId: projectSsrDataDefinition.id, itemCode: projectSsrDataDefinition.code },
    '2025-26',
    'zone_3'
  )
  assert.equal(projectSsrRecipe.itemSource, 'SSR')
  assert.equal(projectSsrRecipe.sections[0].lines[1].rate, 10)
  assert.equal(projectSsrRecipe.sections[0].lines[1].amount, 10)
  assert.equal(projectSsrRecipe.projectDataImageUrl, 'data:image/png;base64,project-data-image')
  assert.equal(projectSsrRecipe.seigniorageApplicability.rows.length, 2)
  assert.deepEqual(projectData.projectDataLeadApplicability(projectSsrDataDefinition), {
    classes: ['EARTH', 'STEEL'],
    materials: { Sand: 'EARTH', Steel: 'STEEL' }
  })

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
        projectItemDisplayName: (node) =>
          node.itemSource === 'SOR' ? node.itemDescription ?? node.name : node.itemCode ?? node.name,
        projectItemKey: (node) => `${node.itemSource}:${node.categoryKey}:${node.itemCode}`,
        projectNodePath: () => [],
        rateAnalysisOverrideForNode: () => null,
        rateAnalysisOverrideResolution: () => ({ recipe: null, scope: 'shared' })
      },
      './projectData': {
        projectDataForNode: projectData.projectDataForNode,
        projectDataLeadApplicability: projectData.projectDataLeadApplicability,
        projectDataRecipe: projectData.projectDataRecipe,
        projectDataRate: projectData.projectDataRate
      },
      './leadApplications': { scopedLeadRateAddition: () => 0 },
      './rateAnalysis': {
        calculateRateAnalysis: () => ({ ratePerUnit: 0 }),
        fetchRateAnalysis: (...args) => dashboardFetch(...args)
      },
      './projectTax': { fetchGstRateRules: async () => [] },
      './pipeLead': {
        fetchPipeLeadQuote: async () => ({}),
        fetchPipeLeadQuoteForMaterial: async () => ({}),
        pipeLeadQuoteBreakdown: () => ({})
      },
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

  const customCompiled = await dashboardSync.fetchDashboardItemData(
    { ...project, projectData: [projectDataDefinition] },
    [projectDataNode]
  )
  assert.equal(customCompiled.rates[projectDataNode.id], 1350)
  assert.equal(customCompiled.recipes[projectDataNode.id].itemCode, 'DATA-SOR-001')

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
  // The per-item "Sync this DATA" button was replaced by a project-wide "Sync
  // All DATA". syncIndividualDataSnapshot still works - it is asserted directly
  // above - but nothing in the UI reaches it any more.
  assert.match(rateDashboardSource, /syncDataDashboardSnapshot/)
  assert.match(rateDashboardSource, /Sync All DATA/)

  console.log('SOR catalogue DATA preparation tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
