import type { CompiledLeadDashboardEntry, EestimateProject, LeadChargeCode } from '../../types/project'
import { fmtMoney } from './dataTypst'
import { isDisposalLeadMaterial } from '../leadApplicability'

export type LeadChartChargeCode = Exclude<LeadChargeCode, 'AUTO'>

export interface LeadSourceChartColumn {
  key: string
  label: string
}

export interface LeadSourceChartRow {
  sl: string
  label: string
  values: string[]
}

export interface LeadSourceChart {
  code: LeadChartChargeCode
  title: string
  note: string
  columns: LeadSourceChartColumn[]
  rows: LeadSourceChartRow[]
}

const CHARGE_CODE_ORDER: LeadChartChargeCode[] = [
  'COM-LDLFT-1',
  'COM-LDLFT-2',
  'COM-LDLFT-3',
  'COM-LDLFT-4',
  'COM-LDLFT-5',
  'COM-LDLFT-6'
]

const SLAB_ORDER = [
  'upto_100m',
  'upto_150m',
  'upto_1km',
  'upto_2km',
  'upto_3km',
  'upto_4km',
  'upto_5km',
  'per_km_5_30',
  'per_km_beyond_30',
  'loading',
  'unloading',
  'per_1m_beyond_3m'
]

const COLUMN_ORDER = [
  'EARTH',
  'EARTH_STONE',
  'STONE',
  'STONE_LIME',
  'CEMENT',
  'STEEL',
  'CEMENT_STEEL',
  'CEMENT_STEEL_PACKED',
  'SLAB_WOOD',
  'WATER',
  'BRICKS',
  'RCC_PIPE'
]

export const LEAD_CHART_TITLES: Record<LeadChartChargeCode, string> = {
  'COM-LDLFT-1': 'A. (Lead) Conveyance Charges for materials by head load',
  'COM-LDLFT-2':
    'B. (Lead) Conveyance charges for machinery per kilometre for transporting materials by tippers and trucks excluding loading, unloading and idle hire charges of machinery.',
  'COM-LDLFT-3': 'C. Loading and unloading charges by manual means (idle hire charges of trucks are not added)',
  'COM-LDLFT-4': 'D. Loading and unloading charges by manual means (including idle hire charges of trucks)',
  'COM-LDLFT-5': 'E. Loading and unloading charges by mechanical means (including idle hire charges of trucks)',
  'COM-LDLFT-6': 'F. Lift charges for materials by head load'
}

const COLUMN_LABELS: Record<string, string> = {
  EARTH: 'Earth / Sand / Gravel / Murrum / Lime / Surki',
  EARTH_STONE: 'Earth / Sand / Stone / Aggregate',
  STONE: 'Rubble / Size stone / Cut stone / Coarse aggregate',
  STONE_LIME: 'Stone / Lime',
  CEMENT: 'Cement',
  STEEL: 'Steel',
  CEMENT_STEEL: 'Cement / Steel',
  CEMENT_STEEL_PACKED: 'Cement / Steel / Packed materials',
  SLAB_WOOD: 'PCC / Shahbad / Wood',
  WATER: 'Water',
  BRICKS: 'Bricks',
  RCC_PIPE: 'RCC pipe'
}

const CHART_NOTE = 'The Lead Charges are inclusive of 13.615% Contractor Profit and Overhead charges.'

function orderIndex(order: string[], key: string): number {
  const index = order.indexOf(key)
  return index === -1 ? order.length : index
}

export function appliedLeadChartCodes(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[]
): LeadChartChargeCode[] {
  const variantsById = new Map((project.leadChart?.variants ?? []).map((variant) => [variant.id, variant]))
  const codes = new Set<LeadChartChargeCode>()
  for (const entry of entries) {
    if (entry.applications.length === 0) continue
    const variant = variantsById.get(entry.variantId)
    if (variant?.pipeLead) continue
    const disposal = isDisposalLeadMaterial(entry.materialName)
    if (entry.leadKm > 0.05) {
      codes.add(disposal || entry.leadKm > 0.15 ? 'COM-LDLFT-2' : 'COM-LDLFT-1')
    }
    if (variant?.handlingMode === 'manual_no_idle') codes.add('COM-LDLFT-3')
    if (variant?.handlingMode === 'manual_with_idle') codes.add('COM-LDLFT-4')
    if (variant?.handlingMode === 'mechanical') codes.add('COM-LDLFT-5')
    if (entry.liftM > 3) codes.add('COM-LDLFT-6')
  }
  return CHARGE_CODE_ORDER.filter((code) => codes.has(code))
}

export function buildLeadSourceCharts(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[]
): LeadSourceChart[] {
  const rates = project.dashboardSnapshot?.leadRates ?? []
  const used = appliedLeadChartCodes(project, entries)
  return used.map((code) => {
    const codeRates = rates.filter((row) => row.charge_code === code)
    const columns = Array.from(new Set(codeRates.map((row) => row.column_key)))
      .sort((a, b) => orderIndex(COLUMN_ORDER, a) - orderIndex(COLUMN_ORDER, b))
      .map((key) => ({
        key,
        label: COLUMN_LABELS[key] ?? key.replaceAll('_', ' ')
      }))
    const slabKeys = Array.from(new Set(codeRates.map((row) => row.slab_key)))
      .sort((a, b) => orderIndex(SLAB_ORDER, a) - orderIndex(SLAB_ORDER, b))
    const includeHeadInitial = code === 'COM-LDLFT-1'
    const includeLiftInitial = code === 'COM-LDLFT-6'
    const preface: LeadSourceChartRow[] = []
    if (includeHeadInitial) {
      preface.push({
        sl: '1',
        label: 'Total lead upto 50 m (covered by item rate)',
        values: columns.map(() => 'initial lead')
      })
    }
    if (includeLiftInitial) {
      preface.push({
        sl: '1',
        label: 'Total lift upto 3 m (covered by item rate)',
        values: columns.map(() => 'initial lift')
      })
    }
    const offset = preface.length
    const rows = [
      ...preface,
      ...slabKeys.map((slabKey, index) => {
        const sample = codeRates.find((row) => row.slab_key === slabKey)
        const byColumn = new Map(
          codeRates.filter((row) => row.slab_key === slabKey).map((row) => [row.column_key, row.rate])
        )
        return {
          sl: String(index + 1 + offset),
          label: sample?.slab_label ?? slabKey,
          values: columns.map((column) => {
            const rate = byColumn.get(column.key)
            return rate == null ? '—' : fmtMoney(rate)
          })
        }
      })
    ]
    return {
      code,
      title: LEAD_CHART_TITLES[code],
      note: CHART_NOTE,
      columns,
      rows
    }
  }).filter((chart) => chart.columns.length > 0 && chart.rows.length > 0)
}

/** Appended at compile time when a saved Lead layout does not already loop Lead.charts. */
export const LEAD_CHART_APPENDIX = `
#if Lead.charts.len() > 0 [
  #heading(level: 2)[Lead Chart — Source tables]
  #for chart in Lead.charts [
    #heading(level: 3)[#chart.code]
    #emph[#chart.title]
    #table(
      columns: (12mm, 1.6fr, ..chart.columns.map(column => 1fr)),
      align: (center, left, ..chart.columns.map(column => center)),
      stroke: 0.45pt + luma(180),
      inset: 4pt,
      fill: (col, row) => if row == 0 { rgb("#0b3d5c") } else if calc.even(row) { rgb("#f8fafc") } else { none },
      table.header(
        repeat: true,
        [#text(fill: white, size: 0.72em)[*Sl*]],
        [#text(fill: white, size: 0.72em)[*Description*]],
        ..chart.columns.map(column => [#text(fill: white, size: 0.62em)[*#column.label*]])
      ),
      ..chart.rows.map(chart_row => (
        [#text(size: 0.72em)[#chart_row.sl]],
        [#text(size: 0.72em)[#chart_row.label]],
        ..chart_row.values.map(value => [#text(size: 0.72em)[#value]])
      )).flatten()
    )
    #text(size: 0.72em, style: "italic")[#chart.note]
    #v(10pt)
  ]
]
`

export function withLeadChartAppendix(source: string): string {
  if (/\bLead\.charts\b/.test(source)) return source
  return source + LEAD_CHART_APPENDIX
}
