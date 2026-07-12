// E-Estimate project model. Serialized as JSON into a `.eestimate` file.

import type { RateAnalysisRecipe } from './rateAnalysis'
import type { IWorkbookData } from '@univerjs/core'

export type NodeKind = 'title' | 'page' | 'component' | 'subcomponent' | 'item'

export type ItemSource = 'SSR' | 'SOR' | 'OTHERS'
export type ItemEditorType = 'spreadsheet' | 'document'

export type PaperSize = 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface NodeSettings {
  pageSize?: PaperSize
  orientation?: Orientation
  margins?: Margins
  borders?: boolean
  /** Default print-area constraint for spreadsheets (Part 1: stored only). */
  printArea?: 'constrain-columns' | 'free'
}

/** A rectangular cell range (zero-based, inclusive). */
export interface CellRange {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
}

export type ScaleMode = 'percent' | 'fit-width' | 'fit-height' | 'fit-sheet' | 'fit-page'

export interface HeaderFooterParts {
  left?: string
  center?: string
  right?: string
}

/**
 * Per-item Print Layout configuration. Page-geometry fields (pageSize,
 * orientation, margins) default to the node's inherited NodeSettings when
 * unset. Stored on the item node so it persists in the project file and can be
 * reused by the future project-wide PDF Maker.
 */
export interface PrintConfig {
  /** Explicit print area; null/undefined means the whole used range. */
  range?: CellRange | null

  /** Page geometry overrides (fall back to inherited NodeSettings). */
  pageSize?: PaperSize
  orientation?: Orientation
  margins?: Margins

  /** Scaling. */
  scaleMode?: ScaleMode
  /** Used when scaleMode === 'percent' (10–400). */
  scalePercent?: number
  /** Used when scaleMode === 'fit-page': fit content across this many pages wide. */
  fitToWidthPages?: number

  /** Header / footer. Text supports tokens: {page} {pages} {date} {project} {title}. */
  showHeader?: boolean
  header?: HeaderFooterParts
  showFooter?: boolean
  footer?: HeaderFooterParts

  /** Sheet options. */
  showGridlines?: boolean
  /** Number of leading rows in the print area repeated on every page. */
  repeatHeaderRows?: number
  /** Print the A/B/C column letters and 1/2/3 row numbers. */
  showRowColHeaders?: boolean

}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter'

/**
 * A live chart anchored over the sheet. Rendered with Chart.js inside a Univer
 * floating-DOM layer; the data is recomputed from `range` whenever cells change.
 * Stored on the item node so it persists in the project file and prints.
 */
export interface ChartDef {
  id: string
  /** Source data range. */
  range: CellRange
  type: ChartType
  title?: string
  /** First row of the range holds series names (column headers). Default true. */
  firstRowIsHeader?: boolean
  /** First column of the range holds category (x-axis) labels. Default true. */
  firstColumnIsLabels?: boolean
  /** Swap rows<->columns so series/categories (X<->Y) are flipped. */
  transpose?: boolean
  /** X-axis title (axis chart types only). */
  xAxisTitle?: string
  /** Y-axis title (axis chart types only). */
  yAxisTitle?: string
  /** Show the legend. Default: shown when there is more than one series. */
  showLegend?: boolean
  legendPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Stack series (bar / area only). */
  stacked?: boolean
  /** Absolute pixel placement over the grid (A1 origin), matching image transforms. */
  position: { startX: number; startY: number; width: number; height: number }
  /** Most recent rendered PNG (data URL) — used for the print/PDF output. */
  png?: string
}

export interface SpreadsheetCell {
  value?: string
  formula?: string
}

export interface LegacySpreadsheetDocument {
  rows: number
  columns: number
  cells: Record<string, SpreadsheetCell>
}

export type SpreadsheetDocument = IWorkbookData | LegacySpreadsheetDocument

export interface ProjectNode {
  id: string
  kind: NodeKind
  name: string
  children: ProjectNode[]

  /** Page/document item nodes: free-form document content. */
  document?: string

  /** Spreadsheet item nodes: Univer workbook data stored in the project file. */
  spreadsheet?: SpreadsheetDocument

  /** Item nodes. */
  itemSource?: ItemSource
  itemCode?: string
  itemDescription?: string
  splitFromNodeId?: string
  splitFromItemKey?: string
  /** Optional work point for a component/sub-component. Defaults to project location. */
  location?: ProjectLocation | null
  /** Items open as a spreadsheet by default, but can be changed from Settings. */
  itemEditorType?: ItemEditorType
  unit?: string | null
  /** Source table key, e.g. 'ssr_item' (SSR) or 'material' (SOR). */
  categoryKey?: string

  /** Per-node layout settings (inherited from parent when unset). */
  settings?: NodeSettings

  /** Per-item Print Layout configuration (spreadsheet items). */
  print?: PrintConfig

  /** Live charts anchored over the spreadsheet. */
  charts?: ChartDef[]

  /**
   * Cell (zero-based) in the item spreadsheet holding the item's final total
   * quantity. Its live value rolls up into the component dashboard.
   */
  finalCell?: { row: number; column: number }

  /**
   * Manual rate per unit for this item. Used for quantity x rate = amount in
   * the dashboard. Falls back to the rate-analysis rate when unset.
   */
  rate?: number
}

export interface ProjectLocation {
  lat: number
  lng: number
  label?: string
}

export type ConveyanceClass =
  | 'EARTH'
  | 'STONE'
  | 'CEMENT'
  | 'STEEL'
  | 'SLAB_WOOD'
  | 'WATER'
  | 'BRICKS'

export type LeadPointKind = 'site' | 'quarry' | 'sand_reach' | 'godown' | 'water' | 'stockyard' | 'other'
export type LeadHandlingMode = 'none' | 'manual_no_idle' | 'manual_with_idle' | 'mechanical'
export type LeadIncludedBasis = 'none' | 'initial_50m' | 'initial_1km' | 'all_leads'
export type LeadRateSource = 'chart' | 'dtl' | 'manual'
export type LeadRoadCondition = 'normal' | 'certified_ghat' | 'ce_exceptional'
export type LeadTransportPurpose =
  | 'EXCAVATED_DISPOSAL'
  | 'MATERIAL_SUPPLY'
  | 'REUSE_FROM_DUMP'
  | 'REUSE_FROM_HEAP'
  | 'NO_EXTRA_LEAD'
  | 'REVIEW_REQUIRED'
export type LeadQuantityBasis = 'PARENT_CUM' | 'DERIVED_LOOSE_CUM' | 'MANUAL_LOOSE_CUM'
export interface LeadPolicy {
  purpose: LeadTransportPurpose
  includedLeadM: number
  includedLiftM: number
  includesAllLifts: boolean
  quantityBasis: LeadQuantityBasis
  allowLoading: boolean
  allowUnloading: boolean
  scrutinyRequired: boolean
  defaultConveyanceClass?: ConveyanceClass
  note?: string
  policyVersion?: string
}
export type LeadChargeCode =
  | 'AUTO'
  | 'COM-LDLFT-1'
  | 'COM-LDLFT-2'
  | 'COM-LDLFT-3'
  | 'COM-LDLFT-4'
  | 'COM-LDLFT-5'
  | 'COM-LDLFT-6'

export interface LeadPoint {
  id: string
  code: string
  name?: string
  kind: LeadPointKind
  lat: number
  lon: number
}

export interface LeadMapCoordinate {
  lat: number
  lon: number
}

export interface LeadMapDirection {
  id: string
  label: string
  color: string
  points: LeadMapCoordinate[]
  variantId?: string
  active: boolean
  createdAt: string
  updatedAt?: string
}

export type LeadPrintPageKey = 'chart' | 'calculation' | 'map'

export interface LeadPrintPageSettings {
  orientation?: Orientation
}

export interface LeadPrintSettings {
  pageSize?: PaperSize
  margins?: Margins
  pages?: Partial<Record<LeadPrintPageKey, LeadPrintPageSettings>>
  showMapLabels?: boolean
  showRouteArrows?: boolean
  showBaseMap?: boolean
}

export interface SeignioragePrintSettings {
  pageSize?: PaperSize
  orientation?: Orientation
  margins?: Margins
}

export interface LeadAssignment {
  id: string
  pointId: string
  conveyanceClass?: ConveyanceClass
  materialCode?: string
  osmKm?: number | null
  manualKm?: number | null
  active: boolean
}

export interface ItemLeadChoice {
  itemCode: string
  conveyanceClass: ConveyanceClass
  assignmentId: string
  qtyShare: number
}

export interface LeadVariant {
  id: string
  variantName?: string
  materialName: string
  conveyanceClass: ConveyanceClass
  assignmentId?: string
  startPointId?: string
  endPointId?: string
  chargeCode?: LeadChargeCode
  mechanicalConveyanceReachesFinalPoint?: boolean
  includedInitialLiftM?: number | null
  includesAllLifts?: boolean
  /** Actual measured route distance. `leadKm` remains the payable/equivalent chart lead. */
  actualLeadKm?: number | null
  roadCondition?: LeadRoadCondition
  roadSegmentKm?: number
  roadMultiplier?: number
  hasSECertificate?: boolean
  hasCEApproval?: boolean
  leadKm: number
  liftM: number
  handlingMode: LeadHandlingMode
  includedBasis: LeadIncludedBasis
  rateSource: LeadRateSource
  customGrossRate?: number | null
  active: boolean
  createdAt: string
}

export interface LeadApplication {
  id: string
  variantId: string
  itemKey: string
  itemCode: string
  itemNodeId?: string
  quantity: number
  quantityManuallyEdited?: boolean
  quantitySource: string
  unit: string
  leadRate: number
  loadingRate: number
  unloadingRate: number
  liftRate: number
  grossRate: number
  grossAmount: number
  netRate: number
  netAmount: number
  calculation?: LeadRateCalculationDetail
  handlingWarning?: string
  handlingOverrideReason?: string
  deliveryAtSiteOverrideReason?: string
  deliveryAtSiteWarning?: string
  appliedAt: string
}

export interface LeadRateCalculationLine {
  label: string
  expression: string
  amount: number
}

export interface LeadRateCalculationDetail {
  rows: LeadRateCalculationLine[]
  fullLeadRate: number
  deductedLeadRate: number
  netLeadRate: number
  unit: string
}

export interface LeadDetailLine {
  sl_no: string
  description: string
  unit: string
  quantity: number | null
  rate: number | null
  amount: number | null
}

export interface LeadDetailDerivation {
  sequence?: number
  category?: string
  label?: string
  unit?: string
  unit_qty?: number | null
  rows: LeadDetailLine[]
  total?: number | null
  overhead_pct?: number | null
  overhead_amount?: number | null
  gross_qty?: number | null
  gross_unit?: string
  gross_total?: number | null
  rate_formula?: string
  rate_unit?: string
  rate?: number | null
  summary_ref?: {
    charge_code?: string
    slab_key?: string
    column_key?: string
    summary_rate?: number
    summary_unit?: string
    matches_summary?: boolean
  }
}

export interface LeadDetailReconstruction {
  detailCode: string
  chargeCode: string
  title: string
  year: string
  titleLines: string[]
  derivations: LeadDetailDerivation[]
}

export interface LeadChart {
  points: LeadPoint[]
  assignments: LeadAssignment[]
  itemChoices: ItemLeadChoice[]
  variants?: LeadVariant[]
  applications?: LeadApplication[]
  mapDirections?: LeadMapDirection[]
  printSettings?: LeadPrintSettings
}

export interface ProjectMeta {
  name: string
  sorYear: string
  /** Active annual-rate zone. Zone III is the display/calculation default. */
  sorZone?: 'zone_1' | 'zone_2' | 'zone_3'
  /**
   * Area allowance is separate from zone. It is applied, when used, to the
   * labour component only.
   */
  areaAllowancePercent?: number
  areaAllowanceLabel?: string
  location: ProjectLocation | null
  flags: string[]
}

export interface EestimateProject {
  formatVersion: 1
  /** Stable id for the project. */
  id: string
  meta: ProjectMeta
  /** The Title node — root of the project tree. */
  root: ProjectNode
  leadChart?: LeadChart
  /** Project-local recipe edits, shared by every usage of the same item code. */
  rateAnalysisOverrides?: Record<string, RateAnalysisRecipe>
  /** Project-local DTL Lead reconstruction edits keyed by detailCode:year. */
  leadDetailOverrides?: Record<string, LeadDetailReconstruction>
  /** Per-item seigniorage charge overrides keyed by projectItemKey. */
  seigniorageOverrides?: Record<string, { seigCode: string | null; rate?: number | null }>
  /** Seigniorage print preview layout settings. */
  seignioragePrintSettings?: SeignioragePrintSettings
  createdAt: string
  updatedAt: string
}
