import type { CalculatedValue, CalculationExpression } from './calculation'
import { calcRef } from './calculation'

interface NumericScheduleRow {
  from_chainage: string
  to_chainage: string
  length_m: number
  start_section: number
  end_section: number
  average_section: number
  quantity: number
  calculation?: BundIntervalCalculation
}

export interface BundIntervalCalculation {
  length: CalculatedValue
  startSection: CalculatedValue
  endSection: CalculatedValue
  averageSection: CalculatedValue
  quantity: CalculatedValue
}

interface BundSchedule {
  rows: NumericScheduleRow[]
  total: number
  totalCalculation?: CalculatedValue
}

interface BundOutputShape {
  schedules: Record<string, BundSchedule>
  sections: Array<Record<string, any>>
  statement_total_length_m?: number
  calculation_schema?: string
}

const derived = (id: string, value: number, expression: CalculationExpression): CalculatedValue => ({
  id,
  value,
  expression
})

const source = (id: string, value: number): CalculatedValue => ({ id, value })

/**
 * Final neutral output pass shared by Typst and Excel. It attaches stable
 * identities and formula lineage without changing the legacy numeric fields.
 */
export function finalizeBundOutputModel<T extends BundOutputShape>(componentId: string, model: T): T {
  const scope = `bund.${componentId}`
  for (const [scheduleKey, schedule] of Object.entries(model.schedules)) {
    const quantities: CalculationExpression[] = []
    schedule.rows = schedule.rows.map((row, index) => {
      const prefix = `${scope}.schedule.${scheduleKey}.interval.${index}`
      const length = source(`${prefix}.length`, row.length_m)
      const startSection = source(`${prefix}.startSection`, row.start_section)
      const endSection = source(`${prefix}.endSection`, row.end_section)
      const averageSection = derived(
        `${prefix}.averageSection`,
        row.average_section,
        { op: 'average', values: [calcRef(startSection.id), calcRef(endSection.id)] }
      )
      const quantity = derived(
        `${prefix}.quantity`,
        row.quantity,
        { op: 'multiply', factors: [calcRef(averageSection.id), calcRef(length.id)] }
      )
      quantities.push(calcRef(quantity.id))
      return { ...row, calculation: { length, startSection, endSection, averageSection, quantity } }
    })
    schedule.totalCalculation = derived(
      `${scope}.schedule.${scheduleKey}.total`,
      schedule.total,
      { op: 'sum', values: quantities }
    )
  }
  model.sections = model.sections.map((section, index) => ({
    ...section,
    formation_total_area: (section.stations ?? []).reduce(
      (sum: number, station: { signed_area_m2?: number | null }) => sum + (station.signed_area_m2 ?? 0),
      0
    ),
    hearting_total_area: (section.hearting_stations ?? []).reduce(
      (sum: number, station: { signed_area_m2?: number | null }) => sum + (station.signed_area_m2 ?? 0),
      0
    ),
    calculation_scope: `${scope}.section.${index}`
  }))
  model.statement_total_length_m = model.sections.length < 2
    ? 0
    : Number(model.sections.at(-1)?.chainage_m ?? 0) - Number(model.sections[0]?.chainage_m ?? 0)
  model.calculation_schema = 'eestimate.calculation.v1'
  return model
}
