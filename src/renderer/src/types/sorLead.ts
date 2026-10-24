/** Reviewed lead rules and exact annual tariff evidence retained in saved snapshots. */
export interface SorLeadRule {
  rule_code: string
  year: string
  material_codes: string[]
  scope_label: string
  effective_from: string
  rules: Record<string, unknown>
  review: Record<string, unknown>
}

export interface SorLeadRateSource {
  recipeCode: string
  resolvedRecipeCode: string
  yearRowCode: string
  year: string
  zone: string
}
