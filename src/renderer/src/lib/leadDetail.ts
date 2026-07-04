import { supabase } from './supabase'
import type {
  LeadDetailDerivation,
  LeadDetailLine,
  LeadDetailReconstruction
} from '../types/project'

type JsonRecord = Record<string, unknown>

export async function fetchLeadDetailReconstructions(
  year: string
): Promise<LeadDetailReconstruction[]> {
  const [{ data: itemData, error: itemError }, { data: yearData, error: yearError }] =
    await Promise.all([
      supabase.from('lead_detail_item').select('detail_code,charge_code,title'),
      supabase
        .from('lead_detail_year')
        .select('detail_code,year,title_lines,derivations')
        .eq('year', year)
    ])

  if (itemError) throw new Error(`Unable to load DTL lead items: ${itemError.message}`)
  if (yearError) throw new Error(`Unable to load DTL lead reconstruction: ${yearError.message}`)

  const items = new Map(
    ((itemData ?? []) as JsonRecord[]).map((row) => [
      text(row.detail_code),
      {
        chargeCode: text(row.charge_code),
        title: text(row.title)
      }
    ])
  )

  return ((yearData ?? []) as JsonRecord[])
    .map((row) => {
      const detailCode = text(row.detail_code)
      const item = items.get(detailCode)
      return {
        detailCode,
        chargeCode: item?.chargeCode ?? '',
        title: item?.title ?? detailCode,
        year: text(row.year),
        titleLines: stringArray(row.title_lines),
        derivations: derivations(row.derivations)
      }
    })
    .sort((a, b) => a.detailCode.localeCompare(b.detailCode, undefined, { numeric: true }))
}

export function recalculateLeadDetail(
  detail: LeadDetailReconstruction
): LeadDetailReconstruction {
  return {
    ...detail,
    derivations: detail.derivations.map(recalculateDerivation)
  }
}

export function recalculateDerivation(derivation: LeadDetailDerivation): LeadDetailDerivation {
  const rows = derivation.rows.map((row) => {
    const amount =
      row.quantity !== null && row.rate !== null ? roundMoney(row.quantity * row.rate) : row.amount
    return { ...row, amount }
  })
  const lineTotal = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  const total = rows.length ? roundMoney(lineTotal) : derivation.total ?? null
  const overheadAmount =
    total !== null && derivation.overhead_pct !== null && derivation.overhead_pct !== undefined
      ? roundMoney((total * derivation.overhead_pct) / 100)
      : derivation.overhead_amount ?? null
  const grossTotal =
    total !== null && overheadAmount !== null
      ? roundMoney(total + overheadAmount)
      : derivation.gross_total ?? null
  const divisor = derivation.gross_qty ?? derivation.unit_qty
  const rate =
    grossTotal !== null && divisor !== null && divisor !== undefined && divisor !== 0
      ? roundRate(grossTotal / divisor)
      : derivation.rate ?? null

  return {
    ...derivation,
    rows,
    total,
    overhead_amount: overheadAmount,
    gross_total: grossTotal,
    rate_formula:
      grossTotal !== null && divisor
        ? `${formatNumber(grossTotal)}/${formatNumber(divisor)}`
        : derivation.rate_formula,
    rate
  }
}

function derivations(value: unknown): LeadDetailDerivation[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((row, index) => ({
        sequence: numberOrNull(row.sequence) ?? index + 1,
        category: text(row.category),
        label: text(row.label),
        unit: text(row.unit),
        unit_qty: numberOrNull(row.unit_qty),
        rows: lines(row.rows),
        total: numberOrNull(row.total),
        overhead_pct: numberOrNull(row.overhead_pct),
        overhead_amount: numberOrNull(row.overhead_amount),
        gross_qty: numberOrNull(row.gross_qty),
        gross_unit: text(row.gross_unit),
        gross_total: numberOrNull(row.gross_total),
        rate_formula: text(row.rate_formula),
        rate_unit: text(row.rate_unit),
        rate: numberOrNull(row.rate),
        summary_ref: summaryRef(row.summary_ref)
      }))
    : []
}

function lines(value: unknown): LeadDetailLine[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((row) => ({
        sl_no: text(row.sl_no),
        description: text(row.description),
        unit: text(row.unit),
        quantity: numberOrNull(row.quantity),
        rate: numberOrNull(row.rate),
        amount: numberOrNull(row.amount)
      }))
    : []
}

function summaryRef(value: unknown): LeadDetailDerivation['summary_ref'] {
  if (!isRecord(value)) return undefined
  return {
    charge_code: text(value.charge_code),
    slab_key: text(value.slab_key),
    column_key: text(value.column_key),
    summary_rate: numberOrNull(value.summary_rate) ?? undefined,
    summary_unit: text(value.summary_unit),
    matches_summary: value.matches_summary === true
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
