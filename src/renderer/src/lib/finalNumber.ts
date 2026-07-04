// "Fix Final Number": read an item's designated total cell and roll it up into
// the component dashboard (quantity, and amount when a rate is available).

import type { IWorkbookData } from '@univerjs/core'
import type { EestimateProject, ProjectNode } from '../types/project'
import { isUniverWorkbookData } from './univerSpreadsheet'
import { projectItemKey } from './projectItems'
import { calculateRateAnalysis } from './rateAnalysis'

export function colLabel(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

export function cellToA1(row: number, column: number): string {
  return `${colLabel(column)}${row + 1}`
}

function firstSheet(snapshot: IWorkbookData): IWorkbookData['sheets'][string] | undefined {
  const id = snapshot.sheetOrder?.[0]
  if (id && snapshot.sheets?.[id]) return snapshot.sheets[id]
  const sheets = snapshot.sheets
  const firstKey = sheets ? Object.keys(sheets)[0] : undefined
  return firstKey ? sheets[firstKey] : undefined
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]+/g, ''))
    return v.trim() !== '' && Number.isFinite(n) ? n : null
  }
  return null
}

/** Read the live value at the item's fixed final cell from its saved snapshot. */
export function readFinalValueFromSnapshot(node: ProjectNode): number | null {
  const fc = node.finalCell
  if (!fc) return null
  const snap = node.spreadsheet
  if (!isUniverWorkbookData(snap)) return null
  const sheet = firstSheet(snap)
  const cell = sheet?.cellData?.[fc.row]?.[fc.column]
  if (!cell) return null
  return toNumber(cell.v)
}

/** Item rate per unit, if a rate analysis recipe exists for the item. */
export function getItemRate(project: EestimateProject | null, node: ProjectNode): number | null {
  if (!project) return null
  const recipe = project.rateAnalysisOverrides?.[projectItemKey(node)]
  if (!recipe) return null
  try {
    const r = calculateRateAnalysis(recipe).ratePerUnit
    return Number.isFinite(r) ? r : null
  } catch {
    return null
  }
}

export interface ItemFinal {
  qty: number | null
  rate: number | null
  amount: number | null
  unit: string | null
}

/**
 * @param dataRate rate fetched from Supabase data for this item (preferred).
 */
export function getItemFinal(
  project: EestimateProject | null,
  node: ProjectNode,
  dataRate?: number | null
): ItemFinal {
  const qty = readFinalValueFromSnapshot(node)
  // Priority: manual override on the node, then the data rate, then the
  // rate-analysis recipe rate.
  const manual =
    typeof node.rate === 'number' && Number.isFinite(node.rate) ? node.rate : null
  const rate = manual ?? (typeof dataRate === 'number' ? dataRate : null) ?? getItemRate(project, node)
  const amount = qty != null && rate != null ? qty * rate : null
  return { qty, rate, amount, unit: node.unit ?? null }
}

/** Recursive total of all descendant item amounts under a component/sub. */
export function componentItemsTotal(
  project: EestimateProject | null,
  node: ProjectNode,
  rateOf?: (n: ProjectNode) => number | null | undefined
): number {
  let total = 0
  const visit = (n: ProjectNode): void => {
    if (n.kind === 'item') {
      const amount = getItemFinal(project, n, rateOf?.(n)).amount
      if (amount != null) total += amount
      return
    }
    n.children.forEach(visit)
  }
  node.children.forEach(visit)
  return total
}
