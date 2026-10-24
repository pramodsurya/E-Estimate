import type { ProjectDataDefinition, ProjectDataRateSource } from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe, RateAnalysisSection } from '../types/rateAnalysis'

/** Retain an exact source when cloning, even while Timely rates is unchecked. */
export function projectDataSsrRateLinks(recipe: RateAnalysisRecipe): RateAnalysisSection[] {
  return recipe.sections.map(section => ({
    ...section,
    lines: section.lines.map(line => ({
      ...line,
      rate: line.rateOverride?.publishedRate ?? line.rate,
      rateOverride: undefined,
      editedFields: line.rateOverride ? line.editedFields?.filter(field => field !== 'rate') : line.editedFields,
      timelyRates: false,
      ssrRateLink: {
        itemCode: recipe.itemCode, section: section.key,
        description: line.description, unit: line.unit,
        resourceIdentity: line.resourceIdentity
      }
    }))
  }))
}

export function projectDataSorRateLink(line: RateAnalysisLine):
  (ProjectDataRateSource & { itemSource: 'SOR'; component?: string }) | undefined {
  if (line.sorRateLink) return line.sorRateLink
  const identity = line.resourceIdentity
  if (identity?.sourceTable === 'SOR_Year' && identity.masterCode) return {
    itemSource:'SOR', categoryKey:'SOR_Recipie', itemCode:identity.masterCode, component:identity.rateComponent
  }
  return undefined
}

export function projectDataRowCanRefresh(line: RateAnalysisLine): boolean {
  return Boolean(line.unit.trim() && !line.rateFormula?.trim() &&
    (line.ssrRateLink || projectDataSorRateLink(line)))
}

export function projectDataRowTimely(line: RateAnalysisLine, legacyBuiltIn = false): boolean {
  return projectDataRowCanRefresh(line) && !line.editedFields?.includes('rate') &&
    (line.timelyRates ?? legacyBuiltIn)
}

export function withProjectDataRowTimely(line: RateAnalysisLine, checked: boolean): RateAnalysisLine {
  return {
    ...line,
    timelyRates: checked && projectDataRowCanRefresh(line),
    // Checking explicitly adopts the catalogue price again. Editing a price in
    // the form switches this option off and restores the manual-rate lock.
    editedFields: checked
      ? line.editedFields?.filter(field => field !== 'rate' && field !== 'amount')
      : line.editedFields
  }
}

export function projectDataUsesTimelyRates(definition: ProjectDataDefinition): boolean {
  if (definition.kind === 'sor') return definition.timelyRates === true
  return definition.timelyOverhead === true || definition.sections.some(section =>
    section.lines.some(line => projectDataRowTimely(line))
  )
}

export function pendingProjectDataRates<T extends ProjectDataDefinition>(definition: T): T {
  if (!projectDataUsesTimelyRates(definition)) return { ...definition, rateRefresh: undefined }
  return {
    ...definition,
    rateRefresh: { status: 'pending' },

  }
}
