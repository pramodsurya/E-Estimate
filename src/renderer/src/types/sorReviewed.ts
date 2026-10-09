export interface ReviewedSorObservation {
  occurrence_id: string
  item_id: string
  sor_year: string
  catalogue_code: string
  table_name: string
  printed_code: string
  serial_number: string
  pdf_page: number | null
  description: string
  effective_description: string
  family_label: string
  variant_label: string
  group_label: string
  rate: number | null
  unit: string
  basis_quantity: number | null
  assessment_status: string
  cost_ready: boolean
  has_reviewed_correction: boolean
  features: Record<string, unknown>
}

export interface ReviewedSorRule {
  rule_id: string
  sor_year: string
  label: string
  kind: string
  base: string
  selection?: string
  value_pct?: number
  exclusive_group?: string
  calculation_ready: boolean
  applies_to_occurrences: string[]
  source_note?: { text?: string; page?: number }
}

export interface ReviewedSorDetail {
  observation: ReviewedSorObservation
  payload: Record<string, unknown>
  sourceContext: Record<string, unknown>
  recipe: Record<string, unknown>
  rules: ReviewedSorRule[]
}

export interface ReviewedSorCalculation {
  release_id: string
  occurrence_id: string
  item_id: string
  sor_year: string
  quantity: number
  quantity_unit: string
  basis_quantity: number
  published_rate: number
  adjusted_rate_per_basis: number
  base_amount: number
  extra_amount: number
  total_amount: number
  adjustments: Array<{
    rule_id: string
    label: string
    value_pct: number
    base: string
    extra_per_basis: number
  }>
}

/** Immutable insertion evidence. Refreshes are stored on the DATA recipe. */
export interface ReviewedSorSelection {
  recipeId: string
  observationId: string
  releaseId: string
  year: string
  quantity: number
  basisQuantity: number
  selectedRuleIds: string[]
  calculation: ReviewedSorCalculation
  observation: ReviewedSorObservation
  sourceContext: Record<string, unknown>
  rules: ReviewedSorRule[]
}
