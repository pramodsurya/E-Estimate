// "Fix Final Number": read an item's designated total cell and roll it up into
// the component dashboard (quantity, and amount when a rate is available).

import type { IWorkbookData } from '@univerjs/core'
import type { EestimateProject, ProjectNode } from '../types/project'
import { isUniverWorkbookData } from './univerSpreadsheet'
import {
  collectProjectItemGroups,
  projectItemKey,
  rateAnalysisOverrideForNode
} from './projectItems'
import { scopedLeadRateAddition } from './leadApplications'
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
  const recipe = rateAnalysisOverrideForNode(project, node)
  if (!recipe) return null
  try {
    const r = calculateRateAnalysis(recipe).ratePerUnit
    return Number.isFinite(r) ? r : null
  } catch {
    return null
  }
}

/** Lead rate additions assigned to this exact Item/component usage. */
export function getItemLeadRate(project: EestimateProject | null, node: ProjectNode): number {
  if (!project || node.kind !== 'item') return 0
  const itemKey = projectItemKey(node)
  const group = collectProjectItemGroups(project.root).find((candidate) => candidate.key === itemKey)
  const isLegacyTarget = group?.usages[0]?.node.id === node.id
  const recipe = rateAnalysisOverrideForNode(project, node)
  const outputQuantity = recipe?.outputQuantity || 0

  return scopedLeadRateAddition(
    project.leadChart?.applications ?? [],
    itemKey,
    node.id,
    isLegacyTarget,
    outputQuantity,
    recipe?.dataVariant?.addonId ?? node.dataVariant?.addonId
  )
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
  // Priority: manual Item rate, then the applicable shared/component DATA
  // override, then the untouched Supabase rate.
  const manual =
    typeof node.rate === 'number' && Number.isFinite(node.rate) ? node.rate : null
  const projectDataRate = getItemRate(project, node)
  const baseRate = manual ?? projectDataRate ?? (typeof dataRate === 'number' ? dataRate : null)
  const rate = baseRate == null ? null : baseRate + getItemLeadRate(project, node)
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
