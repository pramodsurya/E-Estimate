export type RateAnalysisSectionKey = 'materials' | 'machinery' | 'labour'

export interface RateAnalysisTextRun {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
}

export interface RateAnalysisColumnLayout {
  key: 'sl_no' | 'description' | 'unit' | 'quantity' | 'rate' | 'amount'
  label: string
  visible: boolean
}

export interface RateAnalysisSectionLayout {
  title: string
  visible: boolean
  totalLabel: string
  columns: RateAnalysisColumnLayout[]
}

export interface RateAnalysisLayout {
  codeVisible: boolean
  descriptionVisible: boolean
  descriptionRuns: RateAnalysisTextRun[]
  unitQuantityVisible: boolean
  unitLabel: string
  sections: Record<RateAnalysisSectionKey, RateAnalysisSectionLayout>
  labourSummary: {
    visible: boolean
    lines: string[]
  }
  abstract: {
    visible: boolean
    title: string
    lines: string[]
  }
}

export interface RateAnalysisLine {
  id: string
  slNo: string
  description: string
  unit: string
  quantity: number
  rate: number
  amount: number
  /** Original display values from Supabase, retained until that field is edited. */
  sourceValues?: {
    quantity?: string
    rate?: string
    amount?: string
  }
  resourceCode?: string
  rateSource?: string
  sorRef?: {
    table: 'labour_rate' | 'machinery_rate'
    code: string
    component?: string
  }
  linkedRate?: {
    rate: number
    year: string
    zone: 'zone_1' | 'zone_2' | 'zone_3'
    source?: string
  }
}

export interface RateAnalysisSection {
  key: RateAnalysisSectionKey
  label: string
  lines: RateAnalysisLine[]
}

export interface RateAnalysisStoredRow {
  label: string
  value: string
  unit: string
  basis: string
  percent: string
  amount: string
  /** Project-side row inserted by the user; formulas/direct amounts contribute by default. */
  userAdded?: boolean
  /** True when the user typed the amount cell as an explicit override. */
  amountOverride?: boolean
}

export interface RateAnalysisStoredValues {
  sectionTotals: Record<RateAnalysisSectionKey, string>
  labourExtract: RateAnalysisStoredRow[]
  abstract: RateAnalysisStoredRow[]
}

export interface RateAnalysisCalculationTrace {
  kind: 'line_item' | 'section_total' | 'abstract_row'
  section?: RateAnalysisSectionKey
  description?: string
  label?: string
  quantity?: string
  rate?: string
  recordedAmount?: string
  calculatedAmount?: string
  amount: string
  contributes: boolean
  status: 'matched' | 'derived' | 'recorded' | 'recorded_adjustment' | 'heading'
  formula?: string
}

/** A derived editor result. The original Supabase values remain in storedValues. */
export interface RateAnalysisRecalculation {
  sectionTotals: Record<RateAnalysisSectionKey, string>
  subtotal: string
  finalCost: string
  calculatedRate: string
  publishedBaseRate: string
  labourExtract?: RateAnalysisStoredRow[]
  abstract: RateAnalysisStoredRow[]
  trace: RateAnalysisCalculationTrace[]
  warnings: string[]
}

export type SeigMode = 'FULL_ITEM_QUANTITY' | 'RECIPE_MATERIAL_RATIO' | 'DIRECT_RECIPE_QTY'
export type SeigQtyBasis = 'ITEM_QTY' | 'ITEM_QTY_X_RATIO' | 'RECIPE_MATERIAL_QTY'

export interface SeigniorageMaterialPolicy {
  seig_code: string | null
  mode: SeigMode | null
  quantity_basis: SeigQtyBasis | null
  quantity_ratio: number | null
  item_unit: string | null
  charge_unit: string | null
  conversion_factor: number | null
  material_code: string | null
  material_desc: string | null
  material_key?: string
  material_label?: string
  recipe_material_qty: number | null
  recipe_material_unit: string | null
  status: string | null
  notes: string | null
  /** @deprecated v2 names */
  recipe_material_desc?: string
  quantity_unit?: string
}

export interface SeigniorageApplicabilityPolicy {
  schema_version?: number
  applicable?: boolean
  source?: string | null
  policy_basis?: { purpose?: string; evidence?: string[]; review_status?: string } | null
  rows?: SeigniorageMaterialPolicy[]
  /** @deprecated v2 name — use rows */
  materials?: SeigniorageMaterialPolicy[]
  reason?: string | null
  generated_at?: string | null
  /** Legacy */
  seig_code?: string | null
  rate_override?: number | null
  notes?: string | null
}

export interface RateAnalysisRecipe {
  schemaVersion: 1
  itemKey: string
  itemSource: 'SSR' | 'SOR' | 'OTHERS'
  categoryKey: string
  itemCode: string
  documentTitle?: string
  description: string
  unit: string
  outputQuantity: number
  year: string
  zone?: 'zone_1' | 'zone_2' | 'zone_3'
  areaAllowancePercent?: number
  areaAllowanceLabel?: string
  overheadPercent: number
  sections: RateAnalysisSection[]
  /** Source-document formatting and visibility metadata. */
  layout?: RateAnalysisLayout
  /** Supabase summary values. These are displayed without recomputing them. */
  storedValues?: RateAnalysisStoredValues
  /** Explicit editor calculation. Never replaces the stored Supabase source values. */
  recalculation?: RateAnalysisRecalculation
  /** True after an input change invalidates the last derived result. */
  calculationStale?: boolean
  publishedRate?: number
  publishedLabourComponent?: number
  leadApplicability?: unknown
  /** Seigniorage policy from ssr_item.seigniorage_applicability (JSONB). */
  seigniorageApplicability?: SeigniorageApplicabilityPolicy | null
  unresolvedLines?: number
}

export interface RateAnalysisSummary {
  sectionTotals: Record<RateAnalysisSectionKey, number>
  baseCost: number
  overheadAmount: number
  totalCost: number
  ratePerUnit: number
  labourUnitBase: number
  labourUnitProfit: number
  labourUnitTotal: number
}
