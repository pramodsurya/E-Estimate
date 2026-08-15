/**
 * What actually goes into a `.eestimate` file.
 *
 * The dashboard snapshot holds every item's rate analysis several times over.
 * A rate analysis is not small — sections, lines, `sourceValues`, the column
 * layout, published rate blocks, figure metadata — and the same one is stored:
 *
 *   - once published, in `recipes`;
 *   - once merged, in `componentRecipes` for the component it sits in;
 *   - again in `componentRecipes` for every ancestor component, because
 *     `collectDashboardItems` gathers all descendants;
 *   - again in `projectRecipes`, which is literally the merge of the top-level
 *     component maps.
 *
 * In memory those are shared references and cost nothing. JSON has no shared
 * references, so all of them are written out in full — three copies for an item
 * in a top-level component, four for one in a sub-component. On an estimate
 * with a few hundred items that is the dominant term in the file.
 *
 * None of it is extra *information*. The merged recipe for an item with no
 * project edit is the published one, unchanged; the component maps are the same
 * recipes indexed by node; `projectRecipes` is a union of those. So the file
 * stores each recipe once and the indexes as lists of item ids, and the maps
 * are rebuilt on load — the same objects, in the same shape, with nothing
 * recomputed and no behaviour depending on it.
 *
 * Files written before this keep their expanded maps and load unchanged.
 */

import type { DashboardDataSnapshot, EestimateProject, ProjectNode } from '../types/project'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'

/** Rough JSON size of a value, for reporting what the compaction saved. */
export function approximateBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}

function sameRecipe(left: RateAnalysisRecipe, right: RateAnalysisRecipe): boolean {
  // Identity first: an item with no project edit gets the published object back
  // from `dashboardRecipeForNode`, so this is the common case and it is free.
  if (left === right) return true
  return approximateBytes(left) === approximateBytes(right) &&
    JSON.stringify(left) === JSON.stringify(right)
}

/** Top-level components, in tree order — what `projectRecipes` was built from. */
function topLevelComponentIds(root: ProjectNode): string[] {
  return root.children.filter((child) => child.kind === 'component').map((child) => child.id)
}

/**
 * The snapshot with its indexes reduced to item ids and each merged recipe
 * stored once, and only where it differs from the published one.
 */
function compactSnapshot(
  snapshot: DashboardDataSnapshot,
  root: ProjectNode
): DashboardDataSnapshot {
  const componentRecipes = snapshot.componentRecipes
  if (!componentRecipes) return snapshot

  const published = snapshot.recipes ?? {}
  const mergedRecipes: Record<string, RateAnalysisRecipe> = {}
  const componentItemIds: Record<string, string[]> = {}

  for (const [nodeId, recipes] of Object.entries(componentRecipes)) {
    componentItemIds[nodeId] = Object.keys(recipes)
    for (const [itemId, recipe] of Object.entries(recipes)) {
      if (mergedRecipes[itemId]) continue
      const source = published[itemId]
      // Identical to what was published: the loader can read it from `recipes`.
      if (source && sameRecipe(recipe, source)) continue
      mergedRecipes[itemId] = recipe
    }
  }

  return {
    ...snapshot,
    componentRecipes: undefined,
    // A pure union of the top-level component maps; rebuilt from them on load.
    projectRecipes: undefined,
    componentItemIds,
    mergedRecipes: Object.keys(mergedRecipes).length > 0 ? mergedRecipes : undefined,
    projectComponentIds: topLevelComponentIds(root)
  }
}

/** Put the indexes back, exactly as they were before the file was written. */
function expandSnapshot(snapshot: DashboardDataSnapshot): DashboardDataSnapshot {
  const itemIds = snapshot.componentItemIds
  // Written before compaction, or already expanded.
  if (!itemIds) return snapshot

  const published = snapshot.recipes ?? {}
  const merged = snapshot.mergedRecipes ?? {}
  const recipeFor = (itemId: string): RateAnalysisRecipe | undefined =>
    merged[itemId] ?? published[itemId]

  const componentRecipes: Record<string, Record<string, RateAnalysisRecipe>> = {}
  for (const [nodeId, ids] of Object.entries(itemIds)) {
    const entries: Record<string, RateAnalysisRecipe> = {}
    for (const id of ids) {
      const recipe = recipeFor(id)
      if (recipe) entries[id] = recipe
    }
    componentRecipes[nodeId] = entries
  }

  const projectRecipes: Record<string, RateAnalysisRecipe> = {}
  for (const nodeId of snapshot.projectComponentIds ?? Object.keys(componentRecipes)) {
    Object.assign(projectRecipes, componentRecipes[nodeId] ?? {})
  }

  return {
    ...snapshot,
    componentRecipes,
    projectRecipes,
    componentItemIds: undefined,
    mergedRecipes: undefined,
    projectComponentIds: undefined
  }
}

/**
 * The project as it should be written to disk.
 *
 * Never mutates the live project: the compaction exists only in the bytes.
 */
export function compactProjectForSave(project: EestimateProject): EestimateProject {
  if (!project.dashboardSnapshot) return project
  return {
    ...project,
    dashboardSnapshot: compactSnapshot(project.dashboardSnapshot, project.root)
  }
}

/** The project as it should be held in memory, whatever form the file used. */
export function expandLoadedProject(project: EestimateProject): EestimateProject {
  if (!project.dashboardSnapshot) return project
  return {
    ...project,
    dashboardSnapshot: expandSnapshot(project.dashboardSnapshot)
  }
}
