import type { ProjectDataDefinition, ProjectDataRateSource } from '../types/project'
import type { RateAnalysisLine, RateAnalysisRecipe, RateAnalysisSection } from '../types/rateAnalysis'

const SOR_TABLES: Record<string, string> = {
  material: 'material', material_rate: 'material',
  labour: 'labour', labour_rate: 'labour',
  machinery: 'machinery', machinery_rate: 'machinery',
  plumbing: 'plumbing', plumbing_rate: 'plumbing',
  electrical: 'electrical', electrical_rate: 'electrical',
  civil: 'civil', civil_rate: 'civil'
}

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
  const table = line.sorRef?.table ?? identity?.sourceTable
  const code = line.sorRef?.code ?? identity?.masterCode
  const category = table && SOR_TABLES[table]
  if (category && code) return {
    itemSource: 'SOR', categoryKey: category, itemCode: code,
    component: line.sorRef?.component ?? identity?.rateComponent ?? (table === 'labour_rate' ? 'rate' : undefined)
  }
  if (line.materialCode) return {
    itemSource: 'SOR', categoryKey: 'material', itemCode: line.materialCode
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
  if (definition.builtIn && !definition.builtIn.initialized) return true
  return definition.timelyOverhead === true || definition.sections.some(section =>
    section.lines.some(line => projectDataRowTimely(line, Boolean(definition.builtIn)))
  )
}

export function pendingProjectDataRates<T extends ProjectDataDefinition>(definition: T): T {
  if (!projectDataUsesTimelyRates(definition)) return { ...definition, rateRefresh: undefined }
  return {
    ...definition,
    rateRefresh: { status: 'pending' },
    ...(definition.kind === 'ssr' && definition.builtIn
      ? { builtIn: { ...definition.builtIn, rateStatus: 'pending', error: undefined } }
      : {})
  }
}
