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
