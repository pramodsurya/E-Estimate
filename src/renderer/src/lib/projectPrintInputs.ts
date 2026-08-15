/**
 * The figures the Project Dashboard shows, derived once from the synced
 * snapshot. The dashboard, its View Print View and the PDF export all read from
 * here, so an exported estimate can never disagree with the screen.
 */

import type { EestimateProject, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import { getItemFinal } from './finalNumber'
import { projectItemKey } from './projectItems'
import { computeSeigniorageTable, type SeigniorageCalculation } from './seigniorage'
import {
  computeProjectAbstract,
  DEFAULT_LABOUR_CESS_PERCENT,
  DEFAULT_NAC_PERCENT,
  type ProjectAbstract
} from './projectAbstract'
import { classifyEarthwork, resolveGstRateRule } from './projectTax'
import {
  dashboardComponentCompileSignature,
  dashboardContextMatches,
  dashboardDataCompileSignature,
  dashboardItemIsSynced,
  dashboardItemsSignature,
  dashboardLeadCompileSignature
} from './dashboardSync'
import { resolveProjectPrintSettings, type ProjectPrintSettings } from './projectPrintSettings'

export const EMPTY_SEIGNIORAGE: SeigniorageCalculation = {
  rows: [],
  totalSeigniorage: 0,
  totalDmft: 0,
  totalSmft: 0,
  totalPermit: 0,
  grandTotal: 0,
  roundedSeigniorage: 0,
  roundedDmft: 0,
  roundedSmft: 0,
  roundedPermit: 0,
  roundedGrandTotal: 0
}

export interface ProjectPrintInputs {
  items: ProjectNode[]
  recipes: Record<string, RateAnalysisRecipe>
  rateOf: (node: ProjectNode) => number | undefined
  seigniorage: SeigniorageCalculation
  abstract: ProjectAbstract
  settings: ProjectPrintSettings
  gstRate: number
  gstRule: ReturnType<typeof resolveGstRateRule>
  nacPercent: number
  labourCessPercent: number
  earthworkPercent: number
  earthworkPredominant: boolean
  workCost: number
  earthworkCost: number
  itemRows: Array<{
    node: ProjectNode
    key: string
    final: ReturnType<typeof getItemFinal>
    classification: ReturnType<typeof classifyEarthwork>
  }>
}

export function collectProjectItems(node: ProjectNode): ProjectNode[] {
  const items: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'item') items.push(current)
    else current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return items
}

function collectComponentDashboards(node: ProjectNode): ProjectNode[] {
  const dashboards: ProjectNode[] = []
  const visit = (current: ProjectNode): void => {
    if (current.kind === 'component' || current.kind === 'subcomponent') {
      dashboards.push(current)
    }
    current.children.forEach(visit)
  }
  node.children.forEach(visit)
  return dashboards
}

/**
 * True only when the frozen Project Dashboard totals still describe the
 * current tree, DATA inputs, Lead inputs, components and Seigniorage inputs.
 * Cost consumers use this instead of trusting the last number cached in meta.
 */
export function projectDashboardIsReady(
  project: EestimateProject,
  items = collectProjectItems(project.root)
): boolean {
  const snapshot = project.dashboardSnapshot
  if (!dashboardContextMatches(snapshot, project)) return false

  return (
    Boolean(snapshot?.projectSyncedAt) &&
    snapshot?.projectItemsSignature === dashboardItemsSignature(items) &&
    snapshot?.dataCompileSignature === dashboardDataCompileSignature(project, items) &&
    snapshot?.leadCompileSignature === dashboardLeadCompileSignature(project) &&
    Boolean(snapshot?.seigniorageSyncedAt) &&
    items.every((item) => dashboardItemIsSynced(snapshot, item)) &&
    collectComponentDashboards(project.root).every((component) => {
      const componentItems = collectProjectItems(component)
      return (
        Boolean(snapshot?.componentSyncedAt?.[component.id]) &&
        typeof snapshot?.componentTotals?.[component.id] === 'number' &&
        snapshot?.componentCompileSignatures?.[component.id] ===
          dashboardComponentCompileSignature(project, componentItems)
      )
    })
  )
}

/** Current sanctioned project total, or null until Project Dashboard Sync is valid. */
export function resolveProjectEstimatedCost(project: EestimateProject): number | null {
  const items = collectProjectItems(project.root)
  if (!projectDashboardIsReady(project, items)) return null
  const value = computeProjectPrintInputs(project, items).abstract.grandTotal
  return Number.isFinite(value) ? value : null
}

export function computeProjectPrintInputs(
  project: EestimateProject,
  items = collectProjectItems(project.root)
): ProjectPrintInputs {
  const snapshot = dashboardContextMatches(project.dashboardSnapshot, project)
    ? project.dashboardSnapshot
    : undefined
  const rates = snapshot?.projectRates ?? {}
  const recipes: Record<string, RateAnalysisRecipe> = snapshot?.projectRecipes ?? {}
  const gstRules = snapshot?.gstRules ?? []
  const seigniorage = snapshot
    ? computeSeigniorageTable(
        project,
        snapshot.seigniorageCharges,
        [],
        snapshot.seignioragePolicies
      )
    : EMPTY_SEIGNIORAGE

  const rateOf = (node: ProjectNode): number | undefined => {
    const rate = rates[node.id]
    return dashboardItemIsSynced(snapshot, node) && typeof rate === 'number' ? rate : undefined
  }

  const itemRows = items.map((node) => {
    const final = getItemFinal(project, node, rateOf(node), true)
    const key = projectItemKey(node)
    const manual = Object.prototype.hasOwnProperty.call(project.earthworkOverrides ?? {}, key)
      ? project.earthworkOverrides?.[key]
      : undefined
    return { node, key, final, classification: classifyEarthwork(node, recipes[node.id], manual) }
  })
  const workCost = itemRows.reduce((total, row) => total + (row.final.amount ?? 0), 0)
  const earthworkCost = itemRows.reduce(
    (total, row) => total + (row.classification.isEarthwork ? row.final.amount ?? 0 : 0),
    0
  )
  const earthworkPercent = workCost > 0 ? (earthworkCost / workCost) * 100 : 0
  const earthworkPredominant = earthworkPercent > 75

  const taxSettings = project.meta.taxSettings ?? {
    mode: 'automatic' as const,
    recipientType: 'CENTRAL_STATE_UT_LOCAL' as const
  }
  const gstRule = resolveGstRateRule(gstRules, taxSettings.recipientType, earthworkPredominant)
  const gstRate = taxSettings.mode === 'manual' ? taxSettings.manualRate ?? 18 : gstRule?.ratePct ?? 18

  const nacPercent = project.chargeSettings?.nacPercent ?? DEFAULT_NAC_PERCENT
  const labourCessPercent =
    project.chargeSettings?.labourCessPercent ?? DEFAULT_LABOUR_CESS_PERCENT

  const abstract = computeProjectAbstract({
    project,
    componentTotals: Object.fromEntries(
      project.root.children
        .filter((component) => component.kind === 'component')
        .map((component) => [component.id, snapshot?.componentTotals?.[component.id] ?? 0])
    ),
    rateOf,
    seigniorage,
    gstRate,
    nacPercent,
    labourCessPercent,
    useDataRateExactly: true
  })

  return {
    items,
    recipes,
    rateOf,
    seigniorage,
    abstract,
    settings: resolveProjectPrintSettings(project.projectPrintSettings),
    gstRate,
    gstRule,
    nacPercent,
    labourCessPercent,
    earthworkPercent,
    earthworkPredominant,
    workCost,
    earthworkCost,
    itemRows
  }
}
