import defaultTemplate from './seigniorage.typ?raw'
import legacyHelpers from './seigniorage-legacy.typ?raw'
import {
  applyDocumentSettingsToTypst,
  type DocumentSettings,
  resolveProjectDocumentSettings
} from './documentSettings'
import {
  PERMIT_GO_REFERENCE,
  seigniorageItemDisplayName,
  type SeigniorageCalculation,
  type SeigniorageItemRow
} from '../seigniorage'
import {
  groupByMat,
  seigQtyCalc
} from '../seignioragePrintLayout'
import {
  resolveSignatureFooter,
  SEIGNIORAGE_SIGNATURE_SCOPE
} from '../signatureFooter'
import type { EestimateProject } from '../../types/project'

/* ------------------------------------------------------------------ */
/* Data contracts (shared by compiler, preview, and Typst script)      */
/* ------------------------------------------------------------------ */

export interface SeigniorageRenderData {
  material_groups: SeigniorageRenderData['groups']
  project: string
  year: string
  permit_basis: string
  summary: {
    seigniorage: string
    dmft: string
    smft: string
    permit_fee: string
    grand_total: string
    rounded_grand_total: string
  }
  groups: Array<{
    label: string
    subtotal_label?: string
    subtotal: {
      seigniorage: string
      dmft: string
      smft: string
      permit_fee: string
    }
    rows: Array<{
      sl: string
      description: string
      total_qty: string
      seigniorage_qty: string
      rate: string
      seigniorage: string
      dmft: string
      smft: string
      permit_fee: string
      permit_note: string
    }>
  }>
  signature: Array<{ designation: string; office: string }>
}

/* ------------------------------------------------------------------ */
/* Helpers for formatting and row description resolution               */
/* ------------------------------------------------------------------ */

function amount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0.00'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0'
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

function totalQuantity(row: SeigniorageCalculation['rows'][number]): string {
  const parts: string[] = []
  if (row.itemQuantity != null && Number.isFinite(row.itemQuantity)) {
    parts.push(fmtQty(row.itemQuantity))
  }
  if (row.itemUnit) parts.push(row.itemUnit)
  return parts.join(' ')
}

function permitPercent(row: SeigniorageCalculation['rows'][number]): string {
  if (row.permit == null) return ''
  return row.permitPercent === 0 ? 'Exempt' : `@ ${fmtQty(row.permitPercent)}%`
}

export function defaultSeigniorageRowDescription(row: SeigniorageItemRow): string {
  const code = row.itemCode ? `${row.itemCode} — ` : ''
  // A seigniorage row represents the chargeable recipe material, not the
  // parent work item. Keep that material visible (for example, "Coarse
  // aggregate 20 mm") and use the work-item description only for legacy rows
  // that do not carry material-level policy data.
  const desc = row.recipeMaterialDesc || row.materialLabel || row.description || seigniorageItemDisplayName(row)
  return `${code}${desc}`
}

export function resolveSeigniorageRowDescription(
  project?: EestimateProject | null,
  row?: SeigniorageItemRow
): string {
  if (!row) return ''
  const custom = project?.seignioragePrintOverrides?.rowDescriptions?.[row.id]
  if (custom && custom.trim()) return custom.trim()
  return defaultSeigniorageRowDescription(row)
}

export function resolveSeigniorageGroupHeading(
  project?: EestimateProject | null,
  group?: { key: string; label: string }
): string {
  if (!group) return ''
  const headings = project?.seignioragePrintOverrides?.groupHeadings
  if (!headings) return group.label
  const custom = headings[group.key] || headings[group.label] || headings[group.key.toLowerCase()]
  if (custom && custom.trim()) return custom.trim()
  return group.label
}

export function resolveSeigniorageGroupSubtotal(
  project?: EestimateProject | null,
  group?: { key: string; label: string }
): string {
  if (!group) return ''
  const subtotals = project?.seignioragePrintOverrides?.groupSubtotals
  const heading = resolveSeigniorageGroupHeading(project, group)
  if (subtotals) {
    const custom = subtotals[group.key] || subtotals[group.label] || subtotals[group.key.toLowerCase()]
    if (custom && custom.trim()) return custom.trim()
  }
  return `Subtotal — ${heading}`
}

/** Build the runtime data object from the current calculation. */
export function buildSeigniorageRenderData(
  project: EestimateProject,
  calculation: SeigniorageCalculation
): SeigniorageRenderData {
  const overrides = project.seignioragePrintOverrides
  const projectName = overrides?.title || project.meta.name || project.root.name || 'Detailed Estimate'
  const sorYear = overrides?.year || project.meta.sorYear || '2025-26'
  const permitBasis = overrides?.permitBasis || PERMIT_GO_REFERENCE
  const groups = groupByMat(calculation.rows)
  const signature = resolveSignatureFooter(project, SEIGNIORAGE_SIGNATURE_SCOPE)

  const data: Omit<SeigniorageRenderData, 'material_groups'> = {
    project: projectName,
    year: sorYear,
    permit_basis: permitBasis,
    summary: {
      seigniorage: amount(calculation.totalSeigniorage),
      dmft: amount(calculation.totalDmft),
      smft: amount(calculation.totalSmft),
      permit_fee: amount(calculation.totalPermit),
      grand_total: amount(calculation.grandTotal),
      rounded_grand_total: amount(calculation.roundedGrandTotal)
    },
    groups: groups.map((group) => {
      const heading = resolveSeigniorageGroupHeading(project, group)
      const subtotalLabel = resolveSeigniorageGroupSubtotal(project, group)
      return {
        label: heading,
        subtotal_label: subtotalLabel,
        subtotal: {
          seigniorage: amount(group.s),
          dmft: amount(group.d),
          smft: amount(group.m),
          permit_fee: amount(group.p)
        },
        rows: group.rows.map((row, index) => ({
          sl: String(index + 1),
          description: resolveSeigniorageRowDescription(project, row),
          total_qty: totalQuantity(row),
          seigniorage_qty: seigQtyCalc(row),
          rate: amount(row.seigRate),
          seigniorage: amount(row.seigniorage),
          dmft: amount(row.dmft),
          smft: amount(row.smft),
          permit_fee: amount(row.permit),
          permit_note: permitPercent(row)
        }))
      }
    }),
    signature: signature?.enabled
      ? signature.rows.map((row) => ({ designation: row.designation, office: row.office }))
      : []
  }
  return { ...data, material_groups: data.groups }
}

/** The `inputs` map handed to the Typst compiler on every preview/export. */
export function seigniorageCompileInputs(
  project: EestimateProject,
  calculation: SeigniorageCalculation
): Record<string, string> {
  const data = buildSeigniorageRenderData(project, calculation)
  return { 'ee-data': JSON.stringify({ ...data, material_groups: data.groups }) }
}

/* ------------------------------------------------------------------ */
/* Stable user template & helpers                                     */
/* ------------------------------------------------------------------ */

export const EE_GROUP_TABLE_PRELUDE = legacyHelpers

export function seigniorageTypstTemplate(
  _calculation: SeigniorageCalculation,
  _project?: EestimateProject | null
): string {
  return defaultTemplate
}

/** Seigniorage is a wide statutory schedule, so its inherited module default is landscape. */
export function resolveSeigniorageDocumentSettings(
  project: EestimateProject
): DocumentSettings {
  return {
    ...resolveProjectDocumentSettings(project.projectPrintSettings),
    orientation: 'landscape'
  }
}

/**
 * Returns the effective Typst source for seigniorage, prepending the hidden
 * app-owned prelude so the user template stays clean.
 */
export function resolvedSeigniorageTypstSource(
  project: EestimateProject,
  calculation: SeigniorageCalculation
): string {
  const saved = project.printStudioDocuments?.['seigniorage-statement']
  if (saved !== undefined) return `${legacyHelpers}\n${saved}`
  const moduleSettings = resolveSeigniorageDocumentSettings(project)
  return applyDocumentSettingsToTypst(
    defaultTemplate,
    moduleSettings
  )
}
