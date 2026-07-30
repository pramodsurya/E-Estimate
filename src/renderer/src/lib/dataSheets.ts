/**
 * Resolution of the exact DATA sheet an individual SSR/SOR code dashboard
 * shows. The DATA Dashboard print flow reuses this so the printed sheets are
 * the same sheets — no second calculation is ever performed for printing.
 */

import { recalculateRateAnalysis } from './rateAnalysis'
import { collectProjectItemGroups, type ProjectItemGroup } from './projectItems'
import { dashboardContextMatches, dashboardItemIsSynced } from './dashboardSync'
import { findNode } from './tree'
import type {
  CompiledDataDashboardEntry,
  EestimateProject,
  LeadApplication,
  LeadVariant,
  ProjectNode
} from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'

/** One resolved code sheet, exactly as the individual DATA dashboard renders it. */
export interface DataSheet {
  /** Stable identity of the sheet (item key plus component scope, when scoped). */
  id: string
  itemKey: string
  itemNode: ProjectNode
  group: ProjectItemGroup | null
  scopeNode: ProjectNode | null
  recipe: RateAnalysisRecipe
  leadApplications: LeadApplication[]
  leadVariants: LeadVariant[]
}

export function cloneRecipe(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  return JSON.parse(JSON.stringify(recipe)) as RateAnalysisRecipe
}

/**
 * Merge a saved project edit onto the compiled Supabase recipe. Published
 * source data (year, zone, layout, figures, rate blocks) always stays with the
 * compiled recipe; only user-owned values come from the saved edit.
 */
export function adoptSavedRecipe(
  loaded: RateAnalysisRecipe,
  saved: RateAnalysisRecipe
): RateAnalysisRecipe {
  const merged = {
    ...loaded,
    ...saved,
    year: loaded.year,
    zone: loaded.zone,
    areaAllowancePercent: loaded.areaAllowancePercent,
    areaAllowanceLabel: loaded.areaAllowanceLabel,
    layout: loaded.layout,
    sourceFigures: loaded.sourceFigures,
    publishedRateBlocks: loaded.publishedRateBlocks,
    multiRateClassification: loaded.multiRateClassification,
    dataVariant: loaded.dataVariant
  }
  return cloneRecipe(
    merged.itemSource === 'SOR'
      ? {
          ...merged,
          areaAllowancePercent: undefined,
          areaAllowanceLabel: undefined,
          overheadPercent: 0,
          recalculation: undefined,
          calculationStale: false
        }
      : recalculateRateAnalysis({ ...merged, recalculation: undefined })
  )
}

/** The Lead rows the individual DATA dashboard shows for one item usage. */
export function leadApplicationsForSheet(
  project: EestimateProject,
  itemKey: string,
  itemNode: ProjectNode,
  group: ProjectItemGroup | null
): LeadApplication[] {
  return (project.leadChart?.applications ?? []).filter(
    (application) =>
      application.itemKey === itemKey &&
      (application.itemNodeId
        ? application.itemNodeId === itemNode.id
        : group?.usages[0]?.node.id === itemNode.id)
  )
}

/**
 * Resolve one code sheet the way the individual DATA dashboard does: the
 * compiled snapshot recipe, with the component-scoped edit taking precedence
 * over the shared project edit.
 */
export function resolveDataSheet(
  project: EestimateProject,
  selection: { itemKey: string; itemNodeId: string; scopeNodeId?: string },
  groups?: ProjectItemGroup[]
): DataSheet | null {
  const itemNode = findNode(project.root, selection.itemNodeId)
  if (!itemNode || itemNode.kind !== 'item') return null

  const allGroups = groups ?? collectProjectItemGroups(project.root)
  const group = allGroups.find((candidate) => candidate.key === selection.itemKey) ?? null
  const scopeNode = selection.scopeNodeId ? findNode(project.root, selection.scopeNodeId) : null

  const loaded =
    dashboardContextMatches(project.dashboardSnapshot, project) &&
    dashboardItemIsSynced(project.dashboardSnapshot, itemNode)
      ? project.dashboardSnapshot?.recipes[itemNode.id] ?? null
      : null
  const globalOverride = project.rateAnalysisOverrides?.[selection.itemKey] ?? null
  const scopedOverride = selection.scopeNodeId
    ? project.rateAnalysisScopedOverrides?.[selection.scopeNodeId]?.[selection.itemKey] ?? null
    : null
  const override = scopedOverride ?? globalOverride

  const recipe = loaded
    ? override
      ? adoptSavedRecipe(loaded, override)
      : cloneRecipe(loaded)
    : override
      ? cloneRecipe(override)
      : null
  if (!recipe) return null

  return {
    id: selection.scopeNodeId
      ? `${selection.itemKey}::${selection.scopeNodeId}`
      : selection.itemKey,
    itemKey: selection.itemKey,
    itemNode,
    group,
    scopeNode: scopeNode ?? null,
    recipe,
    leadApplications: leadApplicationsForSheet(project, selection.itemKey, itemNode, group),
    leadVariants: project.leadChart?.variants ?? []
  }
}

/** Resolve every compiled DATA Dashboard row into its own code sheet, in list order. */
export function collectDataSheets(
  project: EestimateProject,
  entries: CompiledDataDashboardEntry[]
): DataSheet[] {
  const groups = collectProjectItemGroups(project.root)
  return entries.flatMap((entry) => {
    const sheet = resolveDataSheet(
      project,
      {
        itemKey: entry.baseKey,
        itemNodeId: entry.representativeNodeId,
        scopeNodeId: entry.scopeNodeId
      },
      groups
    )
    return sheet ? [sheet] : []
  })
}
