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
  /** Project-side row inserted by the user. */
  userAdded?: boolean
  /** Exact cells changed directly by the user; sourceValues remain immutable. */
  editedFields?: Array<'sl_no' | 'description' | 'unit' | 'quantity' | 'rate' | 'amount'>
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

export interface RateAnalysisOptionalAdditionAnalysis {
  label: string
  outputQuantity: number
  unit: string
  sections: RateAnalysisSection[]
  sectionTotals: Partial<Record<RateAnalysisSectionKey, number>>
  overheadPercent?: number
  overheadAmount?: number
  totalCost?: number
  rate: number
}

export interface RateAnalysisVariantLeadMaterial {
  name: string
  conveyanceClass: 'EARTH' | 'STONE'
  quantity: number
  unit: string
  basisQuantity: number
  basisUnit: string
}

export interface RateAnalysisAddonLeadSummary {
  applicable: boolean
  materialName: string
  conveyanceClass?: 'EARTH' | 'STONE'
  quantityRatio: number | null
  materialUnit: string
  includedLeadM: number
  distanceRule: 'CHARGE_BEYOND_INCLUDED' | 'FULL_SOURCE_TO_SITE' | 'NOT_APPLICABLE'
  loadingIncluded: boolean
  unloadingAddedByDefault: boolean
  note?: string
}

export interface RateAnalysisAddonSeigniorageSummary {
  applicable: boolean
  codes: string[]
  conversionRequired: boolean
  conversionConfigured: boolean
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

/** One complete published quantity/rate result embedded in an SSR DATA abstract. */
export interface RateAnalysisPublishedBlock {
  key: string
  label: string
  outputQuantity: number
  unit: string
  totalCost?: number
  rate: number
  abstractEndIndex: number
  primary: boolean
}

export type RateAnalysisMultiRateKind =
  | 'dual_measurement_basis'
  | 'type_variants'
  | 'optional_addition'
  | 'quantity_depth_bands'
  | 'derived_adjustment_chain'

/** Business meaning assigned to an SSR that publishes more than one rate. */
export interface RateAnalysisMultiRateClassification {
  kind: RateAnalysisMultiRateKind
  label: string
  adoptedRate: number
  sourceRates: number[]
  note: string
  /** Quantity used only for transport/lead when the payable rate has another basis. */
  sourceQuantity?: number
  sourceUnit?: string
}

/** Figure metadata extracted from the published SSR and stored in Supabase Storage. */
export interface RateAnalysisFigure {
  key: string
  sequence: number
  page?: number
  after: string
  storagePath: string
  objectPath: string
  bbox?: number[]
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
  /** Abstract sections whose adopted value changed through an edit or allowance. */
  affectedSections?: RateAnalysisSectionKey[]
}

export type RateAnalysisAuditStatus =
  | 'matched'
  | 'rounding'
  | 'mismatch'
  | 'unverifiable'
  | 'user_added'

export interface RateAnalysisAuditRow {
  section: RateAnalysisSectionKey
  lineId: string
  description: string
  publishedQuantity: number | null
  publishedRate: number | null
  publishedAmount: number | null
  recalculatedAmount: number | null
  difference: number | null
  status: RateAnalysisAuditStatus
}

export interface RateAnalysisSectionAudit {
  section: RateAnalysisSectionKey
  publishedTotal: number | null
  recalculatedTotal: number | null
  difference: number | null
  verifiable: boolean
  mismatchedRows: number
}

export interface RateAnalysisIndependentAudit {
  rows: RateAnalysisAuditRow[]
  sections: RateAnalysisSectionAudit[]
}

export type SeigMode =
  | 'FULL_ITEM_QUANTITY'
  | 'RECIPE_MATERIAL_RATIO'
  | 'DIRECT_RECIPE_QTY'
  | 'ADDON_MATERIAL_RATIO'
export type SeigQtyBasis = 'ITEM_QTY' | 'ITEM_QTY_X_RATIO' | 'RECIPE_MATERIAL_QTY'

export interface SeigniorageMaterialPolicy {
  seig_code: string | null
  mode: SeigMode | null
  quantity_basis: SeigQtyBasis | null
  quantity_ratio: number | null
  item_unit: string | null
  charge_unit: string | null
  conversion_factor: number | null
  conversion_required?: boolean
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

export interface SeigniorageAddonPolicy {
  addon_id: string
  applicable: boolean
  rows: SeigniorageMaterialPolicy[]
}

export interface SeigniorageApplicabilityPolicy {
  schema_version?: number
  applicable?: boolean
  source?: string | null
  policy_basis?: { purpose?: string; evidence?: string[]; review_status?: string } | null
  rows?: SeigniorageMaterialPolicy[]
  /** Conditional rows activated only by an exact selected ssr_item add-on id. */
  addons?: SeigniorageAddonPolicy[]
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
  /** Complete published quantity/rate blocks retained when one SSR contains multiple analyses. */
  publishedRateBlocks?: RateAnalysisPublishedBlock[]
  /** Explicit business classification for a published multi-rate SSR. */
  multiRateClassification?: RateAnalysisMultiRateClassification
  /** Source-document figures associated with this SSR DATA. */
  sourceFigures?: RateAnalysisFigure[]
  /** Explicit editor calculation. Never replaces the stored Supabase source values. */
  recalculation?: RateAnalysisRecalculation
  /** True after an input change invalidates the last derived result. */
  calculationStale?: boolean
  publishedRate?: number
  publishedLabourComponent?: number
  leadApplicability?: unknown
  /** Seigniorage policy from ssr_item.seigniorage_applicability (JSONB). */
  seigniorageApplicability?: SeigniorageApplicabilityPolicy | null
  /** GST earthwork classifier derived from the source DATA metadata. */
  earthworkClassification?: {
    isEarthwork: boolean
    reason: string
    confidence: 'high' | 'review'
  }
  /** Resolved annual DATA variant used to prepare this recipe. */
  dataVariant?: {
    kind: 'upto' | 'type' | 'optional_addition' | 'quantity_band'
    key: string
    label: string
    rate: number
    baseRate: number
    rateMultiplier: number
    basisQuantity?: number
    basisUnit?: string
    /** Individual source rates included in an adopted combined rate. */
    componentRates?: number[]
    /** Separately published amount added to the base DATA rate. */
    addOnRate?: number
    /** Exact ssr_item.addon_table / ssr_year.addon_rates join key. */
    addonId?: string
    addonLead?: RateAnalysisAddonLeadSummary
    addonSeigniorage?: RateAnalysisAddonSeigniorageSummary
    /** Calculate this option from the current DATA total, not its historical annual rate. */
    postRate?: boolean
    postRateMultiplier?: number
    postRateStepPercent?: number
    postRateSteps?: number
    /** Published percentage used to derive this class/type from its base variant. */
    addPercent?: number
    /** Published class/type on which the selected percentage is applied. */
    baseVariantLabel?: string
    /** Clean reconstruction of an embedded optional-addition analysis. */
    additionAnalysis?: RateAnalysisOptionalAdditionAnalysis
    /** Materials introduced only by this selected variant and eligible for Lead. */
    leadMaterials?: RateAnalysisVariantLeadMaterial[]
  }
  unresolvedLines?: number
}

export interface RateAnalysisSummary {
  sectionTotals: Record<RateAnalysisSectionKey, number>
  /** Labour line total before the project location allowance. */
  labourBaseCost: number
  areaAllowancePercent: number
  areaAllowanceAmount: number
  labourCostWithAreaAllowance: number
  baseCost: number
  overheadAmount: number
  totalCost: number
  ratePerUnit: number
  labourUnitBase: number
  labourUnitProfit: number
  labourUnitTotal: number
}
