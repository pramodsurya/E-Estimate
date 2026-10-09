import type { ProjectNode } from '../types/project'
import type { ReviewedSorSelection } from '../types/sorReviewed'
import type { RateAnalysisRecipe } from '../types/rateAnalysis'
import { projectItemKey } from './projectItems'
import { parseRateAnalysisVisibility } from './rateAnalysisVisibility'
import { reviewedReference } from './sorReviewed'
import { createUniverWorkbookData, usedCellRange, workbookFromRows } from './univerSpreadsheet'
import type { IWorkbookData } from '@univerjs/core'
import { sorCommercialTerms } from './sorCatalogue'

/** Normalize the explicitly published tariff basis to the estimate's quantity unit. */
export function reviewedSorRecipe(node: ProjectNode, saved: ReviewedSorSelection): RateAnalysisRecipe {
  const row = saved.observation
  const calculation = saved.calculation
  if (!row.cost_ready || row.assessment_status !== 'numeric' || calculation.basis_quantity <= 0 ||
      !Number.isFinite(calculation.adjusted_rate_per_basis)) throw new Error('This reviewed observation is blocked from direct costing.')
  const rate = calculation.adjusted_rate_per_basis / calculation.basis_quantity
  const extras = calculation.adjustments.map(rule => rule.label).join(', ')
  const description = extras ? `${row.effective_description} — ${extras}` : row.effective_description
  return {
    schemaVersion: 1, itemKey: projectItemKey(node), itemSource: 'SOR', categoryKey: node.categoryKey ?? 'sor_catalogue',
    itemCode: saved.recipeId, documentTitle: reviewedReference(row), description, unit: row.unit,
    outputQuantity: 1, year: saved.year, overheadPercent: 0, publishedRate: rate, unresolvedLines: 0,
    sections: [
      { key: 'materials', label: 'A. Materials', lines: [{ id: 'reviewed-published-rate', slNo: '1', description,
        unit: row.unit, quantity: 1, rate, amount: rate, resourceCode: saved.recipeId,
        rateSource: 'calculate_sor_reviewed_selection' }] },
      { key: 'machinery', label: 'B. Machinery', lines: [] },
      { key: 'labour', label: 'C. Labour', lines: [] }
    ],
    layout: parseRateAnalysisVisibility(undefined, description), reviewedSor: saved,
    sorCatalogueSource: { catalogueCode: row.catalogue_code, catalogueName: row.table_name, dimensions: {}, sourcePage: row.pdf_page,
      commercialTerms: sorCommercialTerms({ commercial_terms: row.features.commercial_terms ?? saved.sourceContext.commercial_terms }) }
  }
}

export function seedReviewedMeasurement(node: ProjectNode): ProjectNode {
  const saved = node.sorCatalogue?.reviewed
  if (!saved) return node
  return { ...node, finalCell: { row: 1, column: 1 }, spreadsheet: workbookFromRows(node, [
    ['SOR reference', 'Quantity', 'Unit'],
    [reviewedReference(saved.observation), saved.quantity, saved.observation.unit],
    ['Specification', node.itemDescription ?? node.name]
  ]) }
}

/** Append quantities without replacing existing measurements in a shared sheet. */
export function seedSharedReviewedMeasurements(nodes: ProjectNode[]): ProjectNode[] {
  const reviewed = nodes.filter(node => node.sorCatalogue?.reviewed)
  if (!reviewed.length) return nodes
  const owner = nodes[0]
  const snapshot = structuredClone(createUniverWorkbookData(owner)) as IWorkbookData
  const sheet = snapshot.sheets[snapshot.sheetOrder[0]]
  const start = (usedCellRange(snapshot)?.endRow ?? -2) + 2
  const cells = sheet.cellData ?? {}
  cells[start] = { 0: { v: 'Reviewed SOR reference' }, 1: { v: 'Quantity' }, 2: { v: 'Unit' } }
  const rows = new Map<string, number>()
  reviewed.forEach((node, index) => {
    const saved = node.sorCatalogue!.reviewed!
    const row = start + index + 1
    rows.set(node.id, row)
    cells[row] = { 0: { v: reviewedReference(saved.observation) }, 1: { v: saved.quantity }, 2: { v: saved.observation.unit } }
  })
  sheet.cellData = cells
  sheet.rowCount = Math.max(sheet.rowCount ?? 0, start + reviewed.length + 20)
  return nodes.map(node => ({ ...node, spreadsheet: snapshot,
    ...(rows.has(node.id) ? { finalCell: { row: rows.get(node.id)!, column: 1 } } : {}) }))
}

/** Adding another usage must not refresh existing DATA or replace its user edits. */
export function reviewedRecipeSnapshots(nodes: ProjectNode[], existing: Record<string, RateAnalysisRecipe> = {}): Record<string, RateAnalysisRecipe> {
  const additions = Object.fromEntries(nodes.flatMap(node => node.sorCatalogue?.reviewed
    ? [[projectItemKey(node), reviewedSorRecipe(node, node.sorCatalogue.reviewed)]] : []))
  return { ...additions, ...existing }
}
