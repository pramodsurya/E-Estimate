import type {
  CompiledDataDashboardEntry,
  CompiledDataScope,
  CompiledLeadDashboardEntry,
  DashboardDataSnapshot,
  EestimateProject,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import {
  calculateLeadVariantChargeFromRows,
  fetchLeadRates,
  fetchSsrLeadApplicability
} from './lead'
import {
  projectItemKey,
  projectNodePath,
  rateAnalysisOverrideForNode,
  rateAnalysisOverrideResolution
} from './projectItems'
import { scopedLeadRateAddition } from './leadApplications'
import { calculateRateAnalysis } from './rateAnalysis'
import { fetchGstRateRules } from './projectTax'
import { fetchRateAnalysis } from './rateAnalysis'
import {
  fetchSeigniorageCharges,
  fetchSeignioragePolicies,
  projectSeigniorageItemCodes
} from './seigniorage'
import { componentItemsTotal, readFinalValueFromSnapshot } from './finalNumber'

export interface DashboardItemData {
  rates: Record<string, number>
  recipes: Record<string, RateAnalysisRecipe>
}

interface DashboardItemFetchRow {
  id: string
  rate: number | null
  recipe: RateAnalysisRecipe | null
  sourceFailure?: {
    code: string
    message: string
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function dashboardContext(project: EestimateProject): DashboardDataSnapshot['context'] {
  return {
    sorYear: project.meta.sorYear ?? '',
    sorZone: project.meta.sorZone ?? 'zone_3',
    areaAllowancePercent: project.meta.areaAllowancePercent ?? 0,
    areaAllowanceLabel: project.meta.areaAllowanceLabel
  }
}

export function dashboardContextMatches(
  snapshot: DashboardDataSnapshot | undefined,
  project: EestimateProject
): boolean {
  if (!snapshot) return false
  const context = dashboardContext(project)
  return (
    snapshot.context.sorYear === context.sorYear &&
    snapshot.context.sorZone === context.sorZone &&
    snapshot.context.areaAllowancePercent === context.areaAllowancePercent &&
    snapshot.context.areaAllowanceLabel === context.areaAllowanceLabel
  )
}

export function collectDashboardItems(node: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') {
      items.push(current)
      return
    }
    current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return items
}

export function dashboardItemSignature(item: ProjectNode): string {
  return JSON.stringify({
    itemCode: item.itemCode ?? '',
    categoryKey: item.categoryKey ?? '',
    itemSource: item.itemSource ?? '',
    unit: item.unit ?? '',
    dataVariant: item.dataVariant ?? null,
    sorCatalogue: item.sorCatalogue
      ? {
          catalogueCode: item.sorCatalogue.catalogueCode,
          dimensions: item.sorCatalogue.dimensions
        }
      : null
  })
}

export function dashboardItemIsSynced(
  snapshot: DashboardDataSnapshot | undefined,
  item: ProjectNode
): boolean {
  return Boolean(
    snapshot?.syncedItemIds.includes(item.id) &&
      snapshot.itemSignatures?.[item.id] === dashboardItemSignature(item)
  )
}

export function dashboardItemsSignature(items: ProjectNode[]): string {
  return items
    .map((item) => `${item.id}:${dashboardItemSignature(item)}`)
    .sort()
    .join('|')
}

/** DATA identity/rate state plus the fixed quantities represented by a Component Sync. */
export function dashboardComponentCompileSignature(
  project: EestimateProject,
  items: ProjectNode[]
): string {
  return JSON.stringify({
    data: dashboardDataCompileSignature(project, items),
    quantities: items
      .map((item) => ({ id: item.id, quantity: readFinalValueFromSnapshot(item) }))
      .sort((left, right) => left.id.localeCompare(right.id))
  })
}

export function dashboardRecipeForNode(
  project: EestimateProject,
  snapshot: DashboardDataSnapshot | undefined,
  item: ProjectNode
): RateAnalysisRecipe | undefined {
  const source = dashboardItemIsSynced(snapshot, item) ? snapshot?.recipes[item.id] : undefined
  const saved = rateAnalysisOverrideForNode(project, item)
  if (!source) return saved ?? undefined
  if (!saved) return source
  return {
    ...source,
    ...saved,
    year: source.year,
    zone: source.zone,
    layout: source.layout,
    sourceFigures: source.sourceFigures,
    publishedRateBlocks: source.publishedRateBlocks
  }
}

export async function fetchDashboardItemData(
  project: EestimateProject,
  items: ProjectNode[]
): Promise<DashboardItemData> {
  const context = dashboardContext(project)
  const sourceGroups = new Map<string, ProjectNode[]>()
  for (const item of items) {
    const sourceKey = dashboardItemSignature(item)
    const group = sourceGroups.get(sourceKey) ?? []
    group.push(item)
    sourceGroups.set(sourceKey, group)
  }
  const groups = Array.from(sourceGroups.values())
  const groupedRows = await mapWithConcurrency<ProjectNode[], DashboardItemFetchRow[]>(
    groups,
    8,
    async (group) => {
    const representative = group[0]
    let fetchedRecipe: RateAnalysisRecipe | null = null
    let fetchFailure: string | null = null
    try {
      fetchedRecipe = await fetchRateAnalysis(representative, context.sorYear, {
        zone: context.sorZone,
        areaAllowancePercent: context.areaAllowancePercent,
        areaAllowanceLabel: context.areaAllowanceLabel
      })
    } catch (reason) {
      fetchFailure = errorMessage(reason)
    }
    const fetchedRate = fetchedRecipe ? dashboardRateFromRecipe(fetchedRecipe) : null
    return group.map((item) => {
      const saved = rateAnalysisOverrideForNode(project, item)
      const sourceFailure =
        fetchFailure && (item.itemSource === 'SSR' || item.itemSource === 'SOR')
          ? {
              code: item.itemCode?.trim() || item.name,
              message: fetchFailure
            }
          : undefined
      return {
        id: item.id,
        rate: fetchedRate,
        recipe: fetchedRecipe ?? saved,
        sourceFailure
      }
    })
    }
  )
  const rows = groupedRows.flat()
  const failures = Array.from(
    new Map(
      rows.flatMap((row) =>
        row.sourceFailure
          ? [[`${row.sourceFailure.code}:${row.sourceFailure.message}`, row.sourceFailure] as const]
          : []
      )
    ).values()
  )
  if (failures.length) {
    const examples = failures
      .slice(0, 4)
      .map((failure) => `${failure.code}: ${failure.message}`)
      .join('; ')
    const remaining = failures.length > 4 ? `; and ${failures.length - 4} more` : ''
    throw new Error(
      `Could not prepare ${failures.length} source DATA entr${
        failures.length === 1 ? 'y' : 'ies'
      } for SOR ${context.sorYear}. ${examples}${remaining}`
    )
  }

  const rates: Record<string, number> = {}
  const recipes: Record<string, RateAnalysisRecipe> = {}
  for (const row of rows) {
    if (typeof row.rate === 'number') rates[row.id] = row.rate
    if (row.recipe) recipes[row.id] = row.recipe
  }
  return { rates, recipes }
}

function dashboardRateFromRecipe(recipe: RateAnalysisRecipe): number | null {
  if (recipe.itemSource === 'SOR') {
    return typeof recipe.publishedRate === 'number' && Number.isFinite(recipe.publishedRate)
      ? recipe.publishedRate
      : null
  }
  const usesLinkedInputs = recipe.sections.some((section) =>
    section.lines.some((line) => Boolean(line.linkedRate))
  )
  if (
    !usesLinkedInputs &&
    !(typeof recipe.areaAllowancePercent === 'number' && recipe.areaAllowancePercent > 0) &&
    !recipe.dataVariant?.postRate &&
    !(
      recipe.dataVariant?.kind === 'optional_addition' &&
      recipe.dataVariant.additionAnalysis !== undefined
    ) &&
    typeof recipe.publishedRate === 'number' &&
    Number.isFinite(recipe.publishedRate)
  ) {
    return recipe.publishedRate
  }
  try {
    const rate = calculateRateAnalysis(recipe).ratePerUnit
    return Number.isFinite(rate) ? rate : null
  } catch {
    return null
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(values[index])
      }
    }
  )
  await Promise.all(workers)
  return results
}

function emptySnapshot(project: EestimateProject): DashboardDataSnapshot {
  return {
    syncedAt: new Date().toISOString(),
    context: dashboardContext(project),
    syncedItemIds: [],
    itemSignatures: {},
    rates: {},
    recipes: {},
    gstRules: [],
    seigniorageCharges: [],
    seignioragePolicies: {}
  }
}

export function mergeDashboardItemData(
  project: EestimateProject,
  items: ProjectNode[],
  data: DashboardItemData
): DashboardDataSnapshot {
  const previous = dashboardContextMatches(project.dashboardSnapshot, project)
    ? project.dashboardSnapshot
    : undefined
  const next = previous ? { ...previous } : emptySnapshot(project)
  const rates = { ...next.rates }
  const recipes = { ...next.recipes }
  const syncedItemIds = new Set(next.syncedItemIds)
  const itemSignatures = { ...(next.itemSignatures ?? {}) }

  for (const item of items) {
    delete rates[item.id]
    delete recipes[item.id]
    syncedItemIds.add(item.id)
    itemSignatures[item.id] = dashboardItemSignature(item)
  }

  return {
    ...next,
    syncedAt: new Date().toISOString(),
    context: dashboardContext(project),
    syncedItemIds: Array.from(syncedItemIds),
    itemSignatures,
    rates: { ...rates, ...data.rates },
    recipes: { ...recipes, ...data.recipes }
  }
}

function structuralPathLabel(project: EestimateProject, item: ProjectNode): string {
  const names = projectNodePath(project.root, item.id)
    .filter((node) => node.kind === 'component' || node.kind === 'subcomponent')
    .map((node) => node.name)
  return names.length ? names.join(' / ') : project.meta.name || project.root.name
}

/**
 * Signature of the local project state that changes effective DATA identities
 * or rates. Backend rows are versioned separately by the snapshot timestamp.
 */
export function dashboardDataCompileSignature(
  project: EestimateProject,
  items = collectDashboardItems(project.root)
): string {
  return JSON.stringify({
    items: items
      .map((item) => ({
        id: item.id,
        key: projectItemKey(item),
        signature: dashboardItemSignature(item),
        description: item.itemDescription ?? item.name,
        unit: item.unit ?? null,
        rate: item.rate ?? null
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    shared: project.rateAnalysisOverrides ?? {},
    scoped: project.rateAnalysisScopedOverrides ?? {},
    lead: (project.leadChart?.applications ?? [])
      .map((application) => ({
        id: application.id,
        variantId: application.variantId,
        itemKey: application.itemKey,
        itemNodeId: application.itemNodeId,
        addonId: application.addonId,
        grossAmount: application.grossAmount,
        rateAddition: application.rateAddition,
        outputQuantity: application.outputQuantity
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  })
}

export function dashboardLeadCompileSignature(project: EestimateProject): string {
  return JSON.stringify({
    variants: [...(project.leadChart?.variants ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id)
    ),
    applications: [...(project.leadChart?.applications ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  })
}

/** Compile the aggregate DATA rows represented by a dashboard snapshot. */
export function compileDataDashboardEntries(
  project: EestimateProject,
  snapshot: DashboardDataSnapshot,
  items = collectDashboardItems(project.root)
): CompiledDataDashboardEntry[] {
  const entries = new Map<string, CompiledDataDashboardEntry>()
  const firstUsageByKey = new Map<string, string>()
  for (const item of items) {
    const key = projectItemKey(item)
    if (!firstUsageByKey.has(key)) firstUsageByKey.set(key, item.id)
  }
  const applications = project.leadChart?.applications ?? []

  for (const item of items) {
    const baseKey = projectItemKey(item)
    const resolution = rateAnalysisOverrideResolution(project, item)
    const legacyTarget = firstUsageByKey.get(baseKey) === item.id
    const selectedAddonId =
      resolution.recipe?.dataVariant?.addonId ?? item.dataVariant?.addonId
    const linkedLeadApplications = applications.filter(
      (application) =>
        application.itemKey === baseKey &&
        (!application.addonId || application.addonId === selectedAddonId) &&
        (application.itemNodeId === item.id ||
          (!application.itemNodeId && legacyTarget))
    )
    const leadEdited = linkedLeadApplications.length > 0
    const manualEdited = typeof item.rate === 'number' && Number.isFinite(item.rate)
    const scope: CompiledDataScope = manualEdited
      ? 'item_edit'
      : leadEdited
        ? 'lead_edit'
        : resolution.scope === 'component'
          ? 'component_edit'
          : resolution.recipe
            ? 'shared_edit'
            : 'shared'
    const suffixes: string[] = []
    if (resolution.scopeNodeId) suffixes.push(`scope:${resolution.scopeNodeId}`)
    if (manualEdited) suffixes.push(`item:${item.id}`)
    if (leadEdited) suffixes.push(`lead:${item.id}`)
    const key = suffixes.length ? `${baseKey}::${suffixes.join('::')}` : baseKey
    const sourceRecipe = resolution.recipe ?? snapshot.recipes[item.id]
    const leadRate = scopedLeadRateAddition(
      applications,
      baseKey,
      item.id,
      legacyTarget,
      sourceRecipe?.outputQuantity ?? 0,
      selectedAddonId
    )
    let baseRate =
      dashboardItemIsSynced(snapshot, item) &&
      typeof snapshot.rates[item.id] === 'number'
        ? snapshot.rates[item.id]
        : null
    if (manualEdited) {
      baseRate = item.rate as number
    } else if (resolution.recipe) {
      try {
        const calculated = calculateRateAnalysis(resolution.recipe).ratePerUnit
        if (Number.isFinite(calculated)) baseRate = calculated
      } catch {
        // Keep the synced source rate when a project edit is incomplete.
      }
    }
    const rate = baseRate === null ? null : baseRate + leadRate
    const recipe = dashboardRecipeForNode(project, snapshot, item)
    const path = structuralPathLabel(project, item)
    const code = item.itemCode?.trim() || item.name
    const displayName = item.splitFromItemKey
      ? item.name
      : item.dataVariant
        ? `${code} - ${item.dataVariant.label}`
        : code
    const existing = entries.get(key)
    if (existing) {
      existing.usageCount += 1
      existing.usages.push({ nodeId: item.id, path })
      existing.synced = existing.synced && dashboardItemIsSynced(snapshot, item)
      continue
    }

    entries.set(key, {
      key,
      baseKey,
      code,
      displayName,
      description: recipe?.description ?? item.itemDescription ?? item.name,
      unit: recipe?.unit ?? item.unit ?? null,
      source: item.itemSource ?? 'OTHERS',
      categoryKey: item.categoryKey ?? 'custom',
      scope,
      scopeNodeId: resolution.scopeNodeId,
      scopeName: resolution.scopeName,
      baseRate,
      leadRate,
      rate,
      usageCount: 1,
      usages: [{ nodeId: item.id, path }],
      representativeNodeId: item.id,
      synced: dashboardItemIsSynced(snapshot, item)
    })
  }

  return Array.from(entries.values()).sort((left, right) =>
    left.code.localeCompare(right.code, undefined, { numeric: true }) ||
    left.key.localeCompare(right.key)
  )
}

export function compiledDataRatesByNode(
  entries: CompiledDataDashboardEntry[]
): Record<string, number | null> {
  return Object.fromEntries(
    entries.flatMap((entry) =>
      entry.usages.map((usage) => [usage.nodeId, entry.rate] as const)
    )
  )
}

/** Compile all saved Lead variants and their exact application locations. */
export function compileLeadDashboardEntries(
  project: EestimateProject,
  snapshot: DashboardDataSnapshot
): CompiledLeadDashboardEntry[] {
  const items = collectDashboardItems(project.root)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const variants = project.leadChart?.variants ?? []
  const applications = project.leadChart?.applications ?? []
  const rates = snapshot.leadRates ?? []

  return variants
    .map((variant) => {
      let variantRate: number | null = null
      let rateUnit = ''
      if (rates.length) {
        try {
          const breakdown = calculateLeadVariantChargeFromRows(rates, {
            year: project.meta.sorYear,
            zone: project.meta.sorZone ?? 'zone_3',
            conveyanceClass: variant.conveyanceClass,
            distanceKm: variant.leadKm,
            quantity: 1,
            liftM: variant.liftM,
            includedInitialLiftM: 3,
            includesAllLifts: false,
            mechanicalConveyanceReachesFinalPoint:
              variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
            handlingMode: variant.handlingMode,
            materialName: variant.materialName,
            includedBasis: 'none',
            customGrossRate:
              variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
            chargeCode: variant.chargeCode
          })
          variantRate = breakdown.grossRate
          rateUnit = breakdown.unit
        } catch {
          // A stored application below is still a valid last-known cost.
        }
      }
      const linked = applications
        .filter((application) => application.variantId === variant.id)
        .map((application) => {
          const item = application.itemNodeId
            ? itemsById.get(application.itemNodeId)
            : items.find((candidate) => projectItemKey(candidate) === application.itemKey)
          return {
            applicationId: application.id,
            itemKey: application.itemKey,
            itemCode: application.itemCode,
            itemNodeId: application.itemNodeId,
            appliedAt: application.appliedAt,
            appliedPath: item ? structuralPathLabel(project, item) : 'Shared DATA',
            unit: application.unit,
            quantity: application.quantity,
            variantRate: application.grossRate,
            variantAmount: application.grossAmount
          }
        })
      if (variantRate === null && linked.length) {
        variantRate = linked[0].variantRate
        rateUnit = linked[0].unit
      }
      return {
        variantId: variant.id,
        materialName: variant.materialName,
        variantName: variant.variantName?.trim() || 'Variant',
        conveyanceClass: variant.conveyanceClass,
        active: variant.active !== false,
        leadKm: variant.leadKm,
        liftM: variant.liftM,
        rateSource: variant.rateSource,
        variantRate,
        rateUnit,
        applications: linked
      }
    })
    .sort(
      (left, right) =>
        left.materialName.localeCompare(right.materialName) ||
        left.variantName.localeCompare(right.variantName)
    )
}

/** DATA total Sync: refresh source rows, then recompile every effective DATA. */
export async function syncDataDashboardSnapshot(
  project: EestimateProject,
  items = collectDashboardItems(project.root)
): Promise<DashboardDataSnapshot> {
  const data = await fetchDashboardItemData(project, items)
  const merged = mergeDashboardItemData(project, items, data)
  const syncedAt = new Date().toISOString()
  return {
    ...merged,
    syncedAt,
    dataSyncedAt: syncedAt,
    dataCompileSignature: dashboardDataCompileSignature(project, items),
    dataDashboardEntries: compileDataDashboardEntries(project, merged, items),
    componentSyncedAt: {},
    projectSyncedAt: undefined
  }
}

/**
 * Refresh one logical DATA directly from its individual screen.
 *
 * Every usage of that DATA identity is passed in by the caller so its cached
 * recipe remains consistent project-wide. Aggregate DATA, Component, and
 * Project compilations are invalidated because their frozen totals still need
 * an explicit recompile after this source refresh.
 */
export async function syncIndividualDataSnapshot(
  project: EestimateProject,
  items: ProjectNode[]
): Promise<DashboardDataSnapshot> {
  const data = await fetchDashboardItemData(project, items)
  const merged = mergeDashboardItemData(project, items, data)
  return {
    ...merged,
    dataSyncedAt: undefined,
    dataCompileSignature: undefined,
    componentSyncedAt: {},
    projectSyncedAt: undefined
  }
}

function structuralDashboardNodes(sections: ProjectNode[]): ProjectNode[] {
  const nodes: ProjectNode[] = []
  const seen = new Set<string>()
  const visit = (node: ProjectNode): void => {
    if (
      (node.kind === 'component' || node.kind === 'subcomponent') &&
      !seen.has(node.id)
    ) {
      seen.add(node.id)
      nodes.push(node)
    }
    node.children.forEach(visit)
  }
  sections.forEach(visit)
  return nodes
}

/**
 * Component Sync's local compilation phase. DATA must already have been synced.
 * The resulting totals are the only component-cost inputs consumed by Project Sync.
 */
export function compileComponentDashboardSnapshots(
  project: EestimateProject,
  snapshot: DashboardDataSnapshot,
  sections: ProjectNode[]
): DashboardDataSnapshot {
  const syncedAt = new Date().toISOString()
  const compiledRates = compiledDataRatesByNode(
    snapshot.dataDashboardEntries ?? compileDataDashboardEntries(project, snapshot)
  )
  const nodes = structuralDashboardNodes(sections)
  const componentSyncedAt = { ...(snapshot.componentSyncedAt ?? {}) }
  const componentRates = { ...(snapshot.componentRates ?? {}) }
  const componentRecipes = { ...(snapshot.componentRecipes ?? {}) }
  const componentTotals = { ...(snapshot.componentTotals ?? {}) }
  const componentCompileSignatures = {
    ...(snapshot.componentCompileSignatures ?? {})
  }

  for (const node of nodes) {
    const items = collectDashboardItems(node)
    const itemIds = new Set(items.map((item) => item.id))
    const rates = Object.fromEntries(
      Object.entries(compiledRates).filter(([itemId]) => itemIds.has(itemId))
    )
    const recipes: Record<string, RateAnalysisRecipe> = Object.fromEntries(
      items.flatMap((item) => {
        const recipe = dashboardRecipeForNode(project, snapshot, item)
        return recipe ? [[item.id, recipe]] : []
      })
    )
    componentSyncedAt[node.id] = syncedAt
    componentRates[node.id] = rates
    componentRecipes[node.id] = recipes
    componentTotals[node.id] = componentItemsTotal(
      project,
      node,
      (item) => rates[item.id],
      true
    )
    componentCompileSignatures[node.id] = dashboardComponentCompileSignature(
      project,
      items
    )
  }

  return {
    ...snapshot,
    syncedAt,
    projectSyncedAt: undefined,
    componentSyncedAt,
    componentRates,
    componentRecipes,
    componentTotals,
    componentCompileSignatures
  }
}

/** Lead total Sync: refresh Lead rows and compile variants/applications. */
export async function syncLeadDashboardSnapshot(
  project: EestimateProject,
  items = collectDashboardItems(project.root)
): Promise<DashboardDataSnapshot> {
  const leadCodes = Array.from(
    new Set(
      items
        .filter((item) => item.itemSource === 'SSR' && item.itemCode)
        .map((item) => item.itemCode as string)
    )
  )
  const [itemData, leadRates, applicability] = await Promise.all([
    fetchDashboardItemData(project, items),
    fetchLeadRates(project.meta.sorYear, project.meta.sorZone ?? 'zone_3'),
    fetchSsrLeadApplicability(leadCodes)
  ])
  const merged = mergeDashboardItemData(project, items, itemData)
  const syncedAt = new Date().toISOString()
  const withLead: DashboardDataSnapshot = {
    ...merged,
    syncedAt,
    dataSyncedAt: undefined,
    componentSyncedAt: {},
    projectSyncedAt: undefined,
    leadSyncedAt: syncedAt,
    leadCompileSignature: dashboardLeadCompileSignature(project),
    leadRates,
    leadApplicability: Object.fromEntries(
      Array.from(applicability, ([code, row]) => [code, row.lead_applicability])
    )
  }
  return {
    ...withLead,
    leadDashboardEntries: compileLeadDashboardEntries(project, withLead)
  }
}

/** Total Seigniorage Dashboard Sync, shared by its own button and Project Sync. */
export async function syncSeigniorageDashboardSnapshot(
  project: EestimateProject
): Promise<DashboardDataSnapshot> {
  const previous = dashboardContextMatches(project.dashboardSnapshot, project)
    ? project.dashboardSnapshot
    : undefined
  const [seigniorageCharges, seignioragePolicies] = await Promise.all([
    fetchSeigniorageCharges(),
    fetchSeignioragePolicies(projectSeigniorageItemCodes(project))
  ])
  const syncedAt = new Date().toISOString()
  return {
    ...(previous ?? emptySnapshot(project)),
    syncedAt,
    projectSyncedAt: undefined,
    seigniorageSyncedAt: syncedAt,
    context: dashboardContext(project),
    seigniorageCharges,
    seignioragePolicies
  }
}

export async function syncProjectDashboardSnapshot(
  project: EestimateProject,
  items: ProjectNode[]
): Promise<DashboardDataSnapshot> {
  // Project Sync deliberately invokes the same total-dashboard operations in
  // dependency order. Each step receives the stored output of the prior step.
  const withSnapshot = (
    source: EestimateProject,
    dashboardSnapshot: DashboardDataSnapshot
  ): EestimateProject => ({ ...source, dashboardSnapshot })

  // Lead feeds DATA, DATA gives the components their rates and descriptions,
  // and Seigniorage is charged on the quantities those components settle on.
  const lead = await syncLeadDashboardSnapshot(project, items)
  const afterLead = withSnapshot(project, lead)
  const data = await syncDataDashboardSnapshot(afterLead, items)
  const afterData = withSnapshot(afterLead, data)
  const topLevelComponents = project.root.children.filter(
    (node) => node.kind === 'component'
  )
  const components = compileComponentDashboardSnapshots(
    afterData,
    data,
    topLevelComponents
  )
  const afterComponents = withSnapshot(afterData, components)
  // Carries the compiled component output forward: the seigniorage step layers
  // its charge and policy tables onto the snapshot it is given.
  const seigniorage = await syncSeigniorageDashboardSnapshot(afterComponents)
  const gstRules = await fetchGstRateRules()
  const syncedAt = new Date().toISOString()
  const projectRates = Object.assign(
    {},
    ...topLevelComponents.map((component) => components.componentRates?.[component.id] ?? {})
  ) as Record<string, number | null>
  const projectRecipes = Object.assign(
    {},
    ...topLevelComponents.map(
      (component) => components.componentRecipes?.[component.id] ?? {}
    )
  ) as Record<string, RateAnalysisRecipe>

  // `seigniorage` was built on top of the compiled component snapshot, so it
  // already carries the component output as well as the charge tables.
  return {
    ...seigniorage,
    syncedAt,
    projectSyncedAt: syncedAt,
    projectItemsSignature: dashboardItemsSignature(items),
    gstRules,
    projectRates,
    projectRecipes
  }
}
