import template from './individualItems.typ?raw'
import { individualItemsOutput } from '../individualItemsOutput'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import type { EestimateProject } from '../../types/project'
import {
  applyDocumentSettingsToTypst,
  resolveProjectDocumentSettings
} from './documentSettings'

export const INDIVIDUAL_ITEMS_SCOPE = 'individual-items'
export const individualItemsTypstTemplate = () => template
export function resolvedIndividualItemsTypstSource(project: EestimateProject) {
  return applyDocumentSettingsToTypst(
    project.printStudioDocuments?.[INDIVIDUAL_ITEMS_SCOPE] ?? template,
    project.printStudioDocumentSettings?.[INDIVIDUAL_ITEMS_SCOPE] ??
      resolveProjectDocumentSettings(project.projectPrintSettings)
  )
}
export function individualItemsCompileInputs(
  project: EestimateProject,
  recipes: RateAnalysisRecipe[]
) {
  const rows = individualItemsOutput(recipes).rows.map((row) => ({
    ...row,
    rate_text:
      row.rate === null
        ? 'Rate pending'
        : row.rate.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
          }),
    source_label: row.owner === 'MORTH' ? 'MoRTH' : 'SSR'
  }))
  return {
    'ee-individual-items': JSON.stringify({
      project_name: project.meta.name || project.root?.name || 'Estimate',
      year: project.meta.sorYear,
      zone: project.meta.sorZone || 'zone_3',
      individual_items: rows
    })
  }
}
