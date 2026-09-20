// E-Estimate project model. Serialized as JSON into a `.eestimate` file.

import type {
  RateAnalysisRecipe,
  RateAnalysisSection,
  SeigniorageApplicabilityPolicy
} from './rateAnalysis'
import type { IDocumentData, IWorkbookData } from '@univerjs/core'
import type { DocumentFontFamily } from '../lib/typist-output/documentSettings'

export type NodeKind = 'title' | 'page' | 'component' | 'subcomponent' | 'item'

export type ItemSource = 'SSR' | 'SOR' | 'PROJECT_DATA' | 'OTHERS'
export type ItemEditorType = 'spreadsheet' | 'document'

export type DataVariantKind = 'upto' | 'type' | 'optional_addition' | 'quantity_band'

export interface DataVariantSelection {
  kind: DataVariantKind
  /** Stable semantic key (limit/basis), resolved again against the active SOR year. */
  key: string
  label: string
  sourceYear: string
  /** Adopted display unit when a type variant changes the published rate basis. */
  unit?: string
  /** Exact ssr_item.addon_table id. The containing ProjectNode supplies the estimate-line scope. */
  addonId?: string
}

interface ProjectDataDefinitionBase {
  id: string
  code: string
  description: string
  unit: string
  /** Optional image supplied by the estimator when creating this DATA. */
  imageDataUrl?: string
  /**
   * Whole-DATA Lead. Used when a published SSR carries one transport rule for
   * the complete work (for example excavated disposal or fabricated parts),
   * rather than a particular Material/Machinery row.
   */
  lead?: {
    applicable: boolean
    /** Common lead classification selected by the estimator when lead is applicable. */
    conveyanceClass?: ConveyanceClass
    materialName?: string
    /** Published or estimator-selected whole-DATA transport rule. */
    policy?: LeadPolicy
  }
  /**
   * Project DATA can opt into the normal material-to-seigniorage matching flow.
   * Existing project files without this field retain automatic matching.
   */
  /** @deprecated Legacy item-wide Seigniorage flag. New SSR DATA stores it per resource row. */
  seigniorage?: {
    applicable: boolean
  }
  createdAt: string
  updatedAt: string
}

/** A reusable simple SOR-type project DATA definition. */
export interface ProjectSorDataDefinition extends ProjectDataDefinitionBase {
  kind: 'sor'
  rate: number
}

/** A reusable custom SSR DATA definition. Its Abstract is always derived from these sections. */
export interface ProjectSsrDataDefinition extends ProjectDataDefinitionBase {
  kind: 'ssr'
  outputQuantity: number
  overheadPercent: number
  sections: RateAnalysisSection[]
}

export type ProjectDataDefinition = ProjectSorDataDefinition | ProjectSsrDataDefinition

export type ProjectDataDefinitionInput =
  | Omit<ProjectSorDataDefinition, 'id' | 'code' | 'createdAt' | 'updatedAt'>
  | Omit<ProjectSsrDataDefinition, 'id' | 'code' | 'createdAt' | 'updatedAt'>

export type SorCatalogueDimensionValue = string | number | boolean | null

export interface SorCatalogueCommercialTerms {
  basis?: string
  transportation?: string
  taxes?: string
}

/**
 * Exact RCC pipe-conveyance cell linked by `get_sor_catalogue_price`.
 *
 * These rates come from Public Health Tables 6/7 and deliberately remain
 * separate from both the ordinary SOR catalogue and the common Lead chart.
 */
export interface PipeLeadSource {
  materialItemCode: string
  pipeLeadItemCode: string
  pipeLeadCatalogueCode: string
  catalogueName?: string
  pipeEndType?: string
  pipeClassGroup: string
  diameterMm: number
  unit?: string
  rateScope?: string
  autoApply: boolean
  distanceInputRequired: boolean
  handlingIncluded: string[]
}

export interface PipeLeadQuote {
  status: string
  sorYear: string
  materialItemCode?: string
  pipeLeadItemCode: string
  pipeLeadCatalogueCode: string
  catalogueName: string
  pipeEndType: string
  pipeClassGroup: string
  pipeClasses: string[]
  diameterMm: number
  unit: string
  distanceKm: number
  quantity: number
  upto5KmRate: number
  additionalPerStartedKmRate: number
  additionalStartedKm: number
  leadRatePerMetre: number
  amount: number
  rateScope: string
  selectedZone: string | null
  sourcePage: number | null
  handlingIncluded: string[]
}

/**
 * Exact logical SOR catalogue cell selected when an Item is attached.
 *
 * The annual price is retained as an audit snapshot, but dashboard Sync resolves
 * the same logical dimensions again for the project's active SOR year.
 */
export interface SorCatalogueItemSelection {
  catalogueCode: string
  catalogueName: string
  part: string
  section: string
  dimensions: Record<string, SorCatalogueDimensionValue>
  selectedYear: string
  publishedRate: number | null
  rateText: string | null
  effectiveFrom: string | null
  source: string | null
  sourcePage: number | null
  sourceTitle?: string | null
  commercialTerms?: SorCatalogueCommercialTerms
  /** Automatic Public Health Table 6/7 conveyance link, when this is an RCC pipe. */
  pipeLead?: PipeLeadSource
}

/**
 * A document item's final quantity. `startIndex`/`endIndex` point into the
 * document text stream and are re-read live, so editing the figure updates the
 * estimate. The captured value and text are kept so drift can be detected when
 * text above the range is edited and the offsets no longer hold a number.
 */
export interface DocumentFinalNumber {
  startIndex: number
  endIndex: number
  capturedValue: number
  capturedText: string
}

/**
 * A document item's print area. Stored as a paragraph span rather than a pixel
 * band so it survives the document reflowing. Only the Y axis is selectable.
 */
export interface DocumentPrintArea {
  startParagraph: number
  endParagraph: number
}

export type PaperSize = 'A4' | 'A3' | 'A2' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export type SignatureFooterPlacement = 'every_page' | 'subject_end'

export interface SignatureFooterRow {
  id: string
  /** First editor column and the primary printed label. */
  designation: string
  /** Second editor column and the secondary printed label. */
  office: string
}

export interface SignatureFooterSettings {
  enabled: boolean
  placement: SignatureFooterPlacement
  /** Printed left-to-right in this saved order. */
  rows: SignatureFooterRow[]
}

export interface NodeSettings {
  pageSize?: PaperSize
  orientation?: Orientation
  margins?: Margins
  borders?: boolean
  /** Default print-area constraint for spreadsheets (Part 1: stored only). */
  printArea?: 'constrain-columns' | 'free'
  /** Report font scale (%) for this node's dashboard and printed pages. */
  reportFontPercent?: number
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

// ---------------------------------------------------------------------------
// Component templates. A template turns a component node into a purpose-built
// dashboard (Guide Wall and Bund today; Box Culvert / Weir later) whose
// computed quantities are written into ordinary item children, so component
// totals and the Lead / Seigniorage / Abstract prints keep working unchanged.
// ---------------------------------------------------------------------------

export type ComponentTemplateId = 'guide-wall' | 'bund' | 'canal'

export interface GuideWallPoint {
  lat: number
  lng: number
}

/** One wall: vertical inner face, battered outer face (1 : faceSlope). */
export interface GuideWallWallParams {
  /** Wall top width (m). */
  topWidth: number
  /** Wall height above the base slab (m). */
  height: number
  /** Battered-face slope: horizontal metres per 1 m vertical (e.g. 0.3 for 1:0.3). */
  faceSlope: number
}

/**
 * Which walls exist in a section. `mirror` = both walls, identical (edited
 * once, quantities ×2). `both` = both walls, dimensioned independently.
 */
export type GuideWallSideMode = 'left' | 'right' | 'mirror' | 'both'

/** A material code and the metadata needed to build/print its item. */
export interface TemplateMaterialRef {
  code: string
  description?: string
  unit?: string | null
  categoryKey?: string
  side?: ItemSource
  /** Published DATA variant/add-on selected when this SSR code was attached. */
  dataVariant?: DataVariantSelection
  /** Exact SOR catalogue cell selected through the unified code picker. */
  sorCatalogue?: SorCatalogueItemSelection
}

export type GuideWallMaterialRef = TemplateMaterialRef

/** One chainage section: its walls, wall spacing, and rectangular base slab. */
export interface GuideWallSection {
  id: string
  fromCh: number
  toCh: number
  sideMode: GuideWallSideMode
  left: GuideWallWallParams
  right: GuideWallWallParams
  /** Clear gap between the two inner wall faces (m); used when both walls exist. */
  gap: number
  /** Base slab is always one rectangle: width × thickness, per section. */
  baseWidth: number
  baseThickness: number
  /** Per-section code overrides. Unset → the component default code is used. */
  wallMaterial?: GuideWallMaterialRef
  baseMaterial?: GuideWallMaterialRef
}

/** Hand-entered excavation measurement (never derived from the drawing). */
export interface GuideWallExcavationRow {
  id: string
  fromCh: number | null
  toCh: number | null
  length: number | null
  breadth: number | null
  height: number | null
}

/** One generated item, keyed by the (role, code) it aggregates. */
export interface GuideWallMaterialItem {
  role: 'wall' | 'base' | 'excavation'
  code: string
  itemNodeId: string
}

export interface GuideWallData {
  /** False until the setup wizard finishes; Edit setup reopens the wizard. */
  configured: boolean
  /** Manual mode has no alignment; the map panel is hidden. */
  source: 'map' | 'manual'
  alignment: GuideWallPoint[]
  lengthM: number
  sectionMode: 'continuous' | 'discontinuous'
  intervalM: number
  /** Interior section chainages for discontinuous mode (sorted, 0 < ch < lengthM). */
  breaks: number[]
  /** Materialized sections tiling 0..lengthM, each individually editable. */
  sections: GuideWallSection[]
  /** Default codes (the top cards); sections may override wall/base. */
  wallMaterial: GuideWallMaterialRef
  baseMaterial: GuideWallMaterialRef
  excavationMaterial: GuideWallMaterialRef | null
  excavationRows: GuideWallExcavationRow[]
  /** Generated items, one per distinct (role, code) actually in use. */
  materialItems: GuideWallMaterialItem[]
}

// ---------------------------------------------------------------------------
// Bund (earthen tank bund). Quantities follow the Mean Sectional Area method
// used throughout Indian irrigation practice: an area per chainage, averaged
// with the previous chainage, times the length between them.
// ---------------------------------------------------------------------------

/**
 * Which kind of job this is. It also picks how sections are dimensioned, so
 * the user never chooses an input style separately:
 *  - 'new'         → parametric: design section + ground level per chainage.
 *  - 'restoration' → levels: surveyed cross-section levels per chainage.
 */
export type BundMode = 'new' | 'restoration'

/**
 * Embankment section type, asked alongside the mode in setup:
 *  - 'homogeneous' → a single fill material across the whole section.
 *  - 'zoned'       → outer casing plus an impervious hearting zone.
 */
export type BundEmbankmentType = 'homogeneous' | 'zoned'
/** Zoned repair condition controls whether DAW construction or PMW breach items apply. */
export type BundZonedRepairKind = 'breached' | 'raising'
/** Source of soil for the dedicated breached/damaged PMW pair. */
export type BundZonedSoilSource = 'borrow' | 'dump'

/** Chainages are entered in metres, or in chains of `BUND_CHAIN_M` metres. */
export type BundChainageUnit = 'm' | 'chains'

/**
 * Earthwork billing. The SSR only lets formation and rolling be priced apart
 * in the IRR-PMW-3 (maintenance) chapter; every new-works embankment code
 * bundles compaction into the formation item.
 */
export type BundBillingMode = 'combined' | 'split'

/**
 * Derived formation base:
 *  - 'existing' → stripping/seating: projected bund minus existing ground.
 *  - 'stripped' → foundation excavation: projected bund minus excavated surface.
 */
export type BundFillBasis = 'existing' | 'stripped'

/** One surveyed level: horizontal offset from the centre-line, and its RL. */
export interface BundPoint {
  /** Metres from the centre-line; negative = u/s side, positive = d/s side. */
  offset: number
  /** Reduced level (m). */
  rl: number
}

/**
 * The proposed bund section. The crest and slopes generate the proposed profile
 * at every chainage, so a restoration only needs the existing levels entered.
 */
export interface BundDesign {
  /** Top bund level (TBL) — the finished crest RL. */
  topLevel: number
  /** Maximum water level (MWL) — drawn as a reference line. */
  mwl: number | null
  /** Full tank level (FTL / FRL) — drawn as a reference line. */
  ftl: number | null
  /** Deepest tank bed level (RL); used only to auto-size a new bund from FTL. */
  deepBedLevel: number | null
  /**
   * Free board above MWL (m). A new bund is designed by free board rather than
   * by a typed crest RL: `topLevel` is then MWL + this, and is not editable.
   * Null on a repair, where TBL is entered directly.
   */
  freeBoard: number | null
  /** Crest width (m). */
  topWidth: number
  /** Upstream face slope, horizontal metres per 1 m vertical (1.5 = 1:1.5). */
  usSlope: number
  /** Downstream face slope, horizontal metres per 1 m vertical. */
  dsSlope: number
  /** Depth of top soil removed before filling (m). */
  stripDepth: number
  /** Horizontal shelves that interrupt the faces; empty = plain faces. */
  berms: BundBerm[]
}

/**
 * Proposed impervious hearting geometry inside a zoned embankment.
 *
 * In repair mode the side lines stop automatically where they first meet the
 * surveyed Existing RL. In new mode they continue to the formation base.
 */
export interface BundHeartingDesign {
  /** Finished top RL of the hearting. */
  topLevel: number
  /** Width of the hearting at its finished top (m). */
  topWidth: number
  /** Upstream hearting batter, horizontal metres per 1 m vertical. */
  usSlope: number
  /** Downstream hearting batter, horizontal metres per 1 m vertical. */
  dsSlope: number
  /** Horizontal shift from the bund centre-line (m); 0 = centred. */
  centerOffset: number
}

/**
 * The cut-off trench carried under the impervious hearting of a new zoned bund.
 *
 * It is a trapezoidal key cut down from the prepared formation base into the
 * tighter soil below, then backfilled with the same selected impervious soil as
 * the zone above it, so seepage cannot pass beneath the core. It belongs to new
 * work only: on a repair the bund already stands on its foundation and the
 * trench cannot be dug without taking that bund down.
 */
export interface BundHeartingTrench {
  /** How the cut-off depth is fixed: automatically from the water depth, or entered by hand. */
  depthMode: 'auto' | 'manual'
  /** Depth below the formation base (m). */
  depth: number
  /** Clear width at the trench bottom (m). */
  bottomWidth: number
  /** Upstream side batter, horizontal metres per 1 m vertical. */
  usSlope: number
  /** Downstream side batter, horizontal metres per 1 m vertical. */
  dsSlope: number
  /** Backfill code (impervious cut-off trench filling); null = trench is off. */
  fillMaterial: TemplateMaterialRef | null
  /** Trench excavation code; null while the trench is off. */
  excavationMaterial: TemplateMaterialRef | null
}

/** Which face a berm interrupts. */
export type BundBermSide = 'us' | 'ds'

/**
 * A berm: a horizontal shelf cut into one face of the bund. It flattens the
 * effective slope, breaks the run of rainwater before it can scour the face,
 * and gives an inspection path. The shelf is normally surfaced and drained by
 * a longitudinal catch-water drain along its inner edge, which outfalls down
 * the face through the chute drains.
 *
 * The shelf is modelled horizontal. `crossFall` is the specified fall towards
 * that drain — at 1 in 30-plus it changes no measured quantity, so it is
 * carried for the drawing and the specification note only.
 *
 * A berm exists at a chainage only while the face still falls below its RL, so
 * a berm placed low down simply disappears where the bund becomes shallow.
 */
export interface BundBerm {
  id: string
  side: BundBermSide
  /** RL of the shelf. */
  level: number
  /** Horizontal width of the shelf (m). */
  width: number
  /** Specified cross-fall towards the bund, 1 in N. 0 = flat. */
  crossFall: number
  /** Face slope below the shelf (horizontal per 1 m vertical); null = keep the face slope. */
  slopeBelow: number | null
  /** Shelf surfacing; null = an unsurfaced earth berm that bills nothing. */
  surfaceMaterial: TemplateMaterialRef | null
  /** Surfacing thickness (m); used when the chosen code is measured by volume. */
  surfaceThickness: number
  /** Longitudinal catch-water drain along the inner edge; null = no drain. */
  drainLiningMaterial: TemplateMaterialRef | null
  /** Excavation for that drain; generated only while the drain is on. */
  drainExcavationMaterial: TemplateMaterialRef | null
  /** Clear rectangular channel dimensions and lining thickness (m). */
  drainWidth: number
  drainDepth: number
  drainLiningThickness: number
  /** Chute drain surge lining material; null = no chute drain. */
  chuteDrainLiningMaterial: TemplateMaterialRef | null
  /** Chute drain excavation; generated only while the chute drain is on. */
  chuteDrainExcavationMaterial: TemplateMaterialRef | null
  /** Chute drain lining/protection type (e.g. concrete or stone). */
  chuteDrainProtectionType: 'concrete' | 'stone'
}

/** One chainage. Which fields matter depends on the component's mode. */
export interface BundSection {
  id: string
  /** Position along the bund, always stored in metres. */
  chainage: number
  /** 'new' mode: existing ground level at the centre-line. */
  groundLevel: number | null
  /** 'restoration' mode: the surveyed existing profile, ordered by offset. */
  pre: BundPoint[]
  /**
   * Null → ordinary strip depth where design is above ground; where ground is
   * higher, only the excess down to the fixed proposed design is cut.
   */
  stripped: BundPoint[] | null
  /** Null → derived from the fixed design parameters, independent of existing ground. */
  projected: BundPoint[] | null
  /** Sparse user overrides; every unlisted stripped point remains automatic. */
  strippedOverrides?: BundPoint[]
  /** Sparse user overrides; every unlisted proposed point remains automatic. */
  projectedOverrides?: BundPoint[]
  /** Ground RL used to locate the designed upstream toe for this chainage. */
  upstreamGroundLevel?: number | null
  /** Ground RL used to locate the designed downstream toe for this chainage. */
  downstreamGroundLevel?: number | null
  /** Use one surveyed toe RL for both faces instead of separate u/s and d/s levels. */
  separateToeLevels?: boolean
  /** Offsets inserted by the seven-point design button; manual points are kept separately. */
  designPointOffsets?: number[]
  /** Generated level rows hidden by the user's Rearrange points action. */
  hiddenLevelOffsets?: number[]
}

/** One generated item, keyed by the (role, code) it aggregates. */
export interface BundMaterialItem {
  role: BundItemRole
  code: string
  itemNodeId: string
}

export type BundItemRole =
  | 'clearance'
  | 'stripping'
  | 'formation'
  | 'rolling'
  | 'casing'
  | 'casing-rolling'
  | 'hearting'
  | 'hearting-rolling'
  | 'hearting-trench'
  | 'hearting-trench-exc'
  | 'turfing'
  | 'pitching'
  | 'pitching-bedding'
  | 'pitching-metal'
  | 'rocktoe'
  | 'rocktoe-filter'
  | 'rocktoe-exc'
  | 'hfilter'
  | 'vfilter'
  | 'ustoe-exc'
  | 'ustoe-build'
  | 'dstoe-exc'
  | 'dstoe-build'
  | 'chute-exc'
  | 'chute-lining'
  | 'berm-surface'
  | 'berm-drain-exc'
  | 'berm-drain-lining'

/**
 * A toe trench. The u/s trench anchors stone pitching and has a separately
 * selected PCC, masonry, or approved rock-fill construction item; the d/s toe
 * drain may have a separately measured revetment. Quantities follow the
 * measurement basis of the selected construction.
 */
export interface BundToe {
  /** Excavation code; null = this toe is off (nothing measured). */
  excavationMaterial: TemplateMaterialRef | null
  /** Trench trapezium: widths at top and bottom, and the depth (m). */
  topWidth: number
  bottomWidth: number
  /**
   * Legacy/fixed depth (m). Used by the U/S anchorage trench and retained as
   * the fallback for older D/S toe-drain projects until invert RLs are entered.
   */
  depth: number
  /** D/S toe-drain constant bottom/invert RL; null retains legacy geometry. */
  invertLevel: number | null
  /** How the invert level is fixed: automatically derived or entered by hand. */
  invertMode: 'auto' | 'manual' | null
  /** Lever arm / top width datum (m). */
  bermWidth: number
  /** D/S trapezoidal-drain side slopes expressed as horizontal to 1 vertical. */
  leftSlope: number
  rightSlope: number
  /** @deprecated Older two-reference longitudinal-invert model. */
  invertStartLevel: number | null
  /** @deprecated Older two-reference longitudinal-invert model. */
  invertEndLevel: number | null
  /** U/S anchorage construction or D/S drain revetment; null = excavation only. */
  buildMaterial: TemplateMaterialRef | null
  /**
   * Legacy built-element cross-section area, retained only so older saved
   * projects continue to open. D/s toe-drain revetment is now derived from the
   * trench bed and side dimensions.
   */
  buildArea: number
  /**
   * Concrete lining thickness (m), also retained for saved-project
   * compatibility. SQM stone-revetment codes specify thickness in their rate.
   */
  liningThickness: number
}

/** One soil-hardness band the stripping/excavation volume is split into. */
export interface BundSoilBand {
  id: string
  /** Short label, e.g. "All soils", "Ordinary rock", "Hard rock". */
  label: string
  /** Share of the total stripping volume (0–100). */
  pct: number
  material: TemplateMaterialRef
}

/** Bund excavation quantities that may each be split across soil/rock classes. */
export type BundExcavationRole =
  | 'stripping'
  | 'ustoe-exc'
  | 'dstoe-exc'
  | 'rocktoe-exc'
  | 'chute-exc'
  | 'berm-drain-exc'
  | 'hearting-trench-exc'

/** Percentage/code rows for one independently measured excavation quantity. */
export type BundExcavationBands = Partial<Record<BundExcavationRole, BundSoilBand[]>> &
  Record<
    | 'stripping'
    | 'ustoe-exc'
    | 'dstoe-exc'
    | 'rocktoe-exc'
    | 'chute-exc'
    | 'berm-drain-exc'
    | 'hearting-trench-exc',
    BundSoilBand[]
  >

/** One manually measured jungle-clearance patch (area = length × breadth). */
export interface BundClearanceManualRow {
  id: string
  length: number | null
  breadth: number | null
}

/** Soil type id selected for the outer (casing/random) zone of a zoned bund. */
export type BundCasingSoilType =
  | 'well-graded-gravel'
  | 'poorly-graded-gravel'
  | 'gravelly-well-graded-sand'
  | 'gravelly-poorly-graded-sand'
  | 'clayey-gravel'
  | 'clayey-sand'

/** Soil type id selected for the impervious hearting zone. */
export type BundHeartingSoilType =
  | 'clayey-sand'
  | 'silty-sand'
  | 'low-plasticity-clay'
  | 'low-plasticity-silt'
  | 'high-plasticity-clay'
  | 'high-plasticity-silt'

/** Soil type id selected for the single matrix of a homogeneous bund. */
export type BundHomogeneousSoilType =
  | 'well-graded-gravel'
  | 'poorly-graded-gravel'
  | 'gravelly-well-graded-sand'
  | 'gravelly-poorly-graded-sand'
  | 'clayey-gravel'
  | 'silty-gravel'
  | 'clayey-sand'
  | 'silty-sand'
  | 'low-plasticity-clay'
  | 'low-plasticity-silt'
  | 'high-plasticity-clay'
  | 'high-plasticity-silt'

/** Impervious-core geometry profile used to recommend zoned side slopes. */
export type BundHeartingSlopeProfile = 'broad-core' | 'compact-core'
/**
 * Which side of the drawn alignment (chainage direction Ch 0 → end) carries
 * the tank water (u/s). Asked in bund setup step 2 instead of the length;
 * 'left' preserves the historical assumption.
 */
export type BundWaterSide = 'left' | 'right'

export interface BundData {
  /** False until the setup wizard finishes; Edit setup reopens the wizard. */
  configured: boolean
  mode: BundMode
  /** Asked alongside mode in setup step 1; selects homogeneous or zoned quantities. */
  embankmentType: BundEmbankmentType
  /** Selected soil for the outer casing of a zoned bund; null until chosen. */
  casingSoilType: BundCasingSoilType | null
  /** Selected soil for the impervious hearting; null until chosen. */
  heartingSoilType: BundHeartingSoilType | null
  /** Impervious-core profile used to recommend zoned side slopes. */
  heartingSlopeProfile: BundHeartingSlopeProfile
  /** Whether zoned side slopes are derived automatically or set by hand. */
  zonedSlopeMode: 'automatic' | 'manual'
  /** Selected soil for a homogeneous bund; null until chosen. */
  homogeneousSoilType: BundHomogeneousSoilType | null
  /** Whether homogeneous side slopes are derived automatically or set by hand. */
  homogeneousSlopeMode: 'automatic' | 'manual'
  /** How far upstream of MWL the slope protection/extent reaches. */
  pitchingExtent: 'mwl' | 'full'
  /** Whether the horizontal filter length is derived or entered by hand. */
  horizontalFilterLengthMode: 'auto' | 'manual'
  /** Repair only: breached/damaged restoration or general raising/strengthening. */
  zonedRepairKind: BundZonedRepairKind
  /** Breached/damaged repair only: approved borrow area or approved dump area. */
  zonedSoilSource: BundZonedSoilSource
  /** Migration marker for dedicated hearting/casing combined SSR items. */
  zonedSsrVersion?: 1
  /** Manual mode has no alignment; the map panel is hidden. */
  source: 'map' | 'manual'
  alignment: GuideWallPoint[]
  lengthM: number
  /** Tank-water (u/s) side of the alignment; asked in setup step 2. */
  waterSide: BundWaterSide
  chainageUnit: BundChainageUnit
  /**
   * Include the phreatic-line diagram in the printed component details. Off by
   * default: it is a design check, not every estimate carries it.
   */
  includePhreaticInPrint: boolean
  sectionMode: 'continuous' | 'discontinuous'
  intervalM: number
  /** Interior section chainages for discontinuous mode (sorted, 0 < ch < lengthM). */
  breaks: number[]
  /** Datum that surveyed levels are reduced to when computing areas. */
  datum: number
  design: BundDesign
  /** Proposed impervious-zone geometry for a zoned new or repair section. */
  heartingDesign: BundHeartingDesign
  /** Cut-off trench under the hearting; new zoned bunds only. */
  heartingTrench: BundHeartingTrench
  /** Legacy storage used to migrate the former combined/split radio choice. */
  billing: BundBillingMode
  /** Bill approved-soil excavation, transport, spreading and sectioning. */
  formationEnabled: boolean
  /** Bill watering and density-controlled rolling/compaction. */
  compactionEnabled: boolean
  /** Migration marker for the two-operation earthwork selector. */
  earthworkOperationVersion?: number
  /** Derived from the selected stripping/foundation excavation basis. */
  fillBasis: BundFillBasis
  /** Jungle clearance is optional; null hides it and bills nothing. */
  clearanceMaterial: TemplateMaterialRef | null
  /**
   * How the clearance area is measured:
   *  - 'perimeter' → mean developed existing-ground length × section length
   *  - 'manual'    → sum of repeatable Length × Breadth rows
   */
  clearanceMode: 'perimeter' | 'manual'
  clearanceManualRows: BundClearanceManualRow[]
  /** @deprecated Migrated into clearanceManualRows when an older project opens. */
  clearanceLength?: number
  /** @deprecated Migrated into clearanceManualRows when an older project opens. */
  clearanceBreadth?: number
  strippingMaterial: TemplateMaterialRef
  formationMaterial: TemplateMaterialRef
  /** PMW compaction code used when compaction is billed without formation. */
  rollingMaterial: TemplateMaterialRef
  /** Zoned hearting formation/combined-operation code. */
  heartingMaterial: TemplateMaterialRef
  /** Zoned hearting compaction code when compaction is billed alone. */
  heartingRollingMaterial: TemplateMaterialRef
  /** Optional turfing on the downstream slope (SQM); null = off. */
  turfingMaterial: TemplateMaterialRef | null
  /** Turfing layer thickness (m) — shown on the drawing; turfing bills by area. */
  turfingThickness: number
  /** Optional stone pitching on the upstream slope; null = off. */
  pitchingMaterial: TemplateMaterialRef | null
  /** Pitching layer thickness (m); drawn, and used when billing by volume. */
  pitchingThickness: number
  /**
   * How pitching is billed:
   *  - false → by slope area (SQM), thickness is in the code (default).
   *  - true  → by volume (CUM) = slope area × thickness, like the Excel.
   */
  pitchingAsVolume: boolean
  /** Optional design-specific clean-sand filter below u/s revetment. */
  pitchingBeddingMaterial: TemplateMaterialRef | null
  /** Design filter thickness (m); new projects start at 0.15 m. */
  pitchingBeddingThickness: number
  /** @deprecated Legacy project field; rock-toe filter now belongs downstream. */
  pitchingMetalEnabled: boolean
  /** @deprecated Legacy project field; no longer generates an upstream item. */
  pitchingMetalMaterial: TemplateMaterialRef | null
  /** @deprecated Legacy project field retained for saved-project compatibility. */
  pitchingMetalThickness: number
  /**
   * Horizontal drainage filter (sand/gravel blanket) laid on the stripped base
   * from the d/s toe running upstream. Its inner end is the focus the phreatic
   * line is drawn to; null = off.
   */
  horizontalFilterMaterial: TemplateMaterialRef | null
  /** How far the horizontal filter runs in from the d/s toe (m). */
  horizontalFilterLength: number
  /** Horizontal filter blanket thickness (m). */
  horizontalFilterThickness: number
  /**
   * Vertical (chimney) filter standing on the horizontal blanket — an add-on:
   * it needs the horizontal filter to carry its water out, so it is only
   * generated while the horizontal filter is on. null = off.
   */
  verticalFilterMaterial: TemplateMaterialRef | null
  /** Chimney width/thickness (m). */
  verticalFilterWidth: number
  /** Chimney height (m); 0 = auto, up to MWL above the stripped base. */
  verticalFilterHeight: number
  /** Optional rubble rock toe at the downstream toe (CUM); null = off. */
  rockToeMaterial: TemplateMaterialRef | null
  /** Graded sand/aggregate filter below and behind the downstream rock toe. */
  rockToeFilterMaterial: TemplateMaterialRef | null
  /** Rock-toe cross-section: crest width (breadth) and the two side slopes. */
  rockToeTopWidth: number
  rockToeInnerSlope: number
  /** @deprecated The exposed face now automatically follows design.dsSlope. */
  rockToeOuterSlope: number
  /**
   * @deprecated Height is always the entered one now. Retained so older saved
   * projects still open; nothing reads it.
   */
  rockToeAutoHeight: boolean
  /** Rock-toe height (m), capped by the crest or the lowest berm shelf above it. */
  rockToeHeight: number
  /** Foundation excavation depth below the toe (m); 0 = no excavation item. */
  rockToeExcavationDepth: number
  /** Code for the rock-toe foundation excavation; null → uses the stripping code. */
  rockToeExcavationMaterial: TemplateMaterialRef | null
  /** @deprecated Migrated into excavationBands.stripping when an older project opens. */
  soilBands: BundSoilBand[]
  /** Central soil/rock classification for every independently measured excavation. */
  excavationBands: BundExcavationBands
  /**
   * How the cut below the bund footprint is billed: CAW embankment seating or
   * DAW foundation excavation.
   */
  strippingExcavationFamily: 'seating' | 'foundation'
  /** Migration marker for role-specific foundation vs channel excavation families. */
  excavationClassificationVersion?: number
  /** Stone-pitching toe trench on the upstream side. */
  upstreamToe: BundToe
  /** Downstream toe drain (trench + optional lining). */
  downstreamToe: BundToe
  /** Optional protected chute drains running down the downstream slope. */
  chuteDrainLiningMaterial: TemplateMaterialRef | null
  /** Surface protection system used in the chute channel. */
  chuteDrainProtectionType: 'concrete' | 'stone'
  /** Excavation for the chute channel; generated only while chute drains are on. */
  chuteDrainExcavationMaterial: TemplateMaterialRef | null
  /** True derives the count from spacing; false uses chuteDrainCount directly. */
  chuteDrainUseSpacing: boolean
  /** Centre-to-centre spacing along the bund alignment (m). */
  chuteDrainSpacing: number
  /** Manual number of drains when chuteDrainUseSpacing is false. */
  chuteDrainCount: number
  /** Clear rectangular channel dimensions and concrete lining thickness (m). */
  chuteDrainWidth: number
  chuteDrainDepth: number
  chuteDrainLiningThickness: number
  /** In the 7-point toe design, treat both toes as the same (level ground). */
  sameToeLevels: boolean
  /** Materialized sections along 0..lengthM, each individually editable. */
  sections: BundSection[]
  /** Generated items, one per distinct (role, code) actually in use. */
  materialItems: BundMaterialItem[]
  /**
   * Stability & seepage simulation inputs and results (XSLOPE bridge). Purely
   * a verification record: nothing here feeds back into quantities.
   */
  simulation?: import('./bundSimulation').BundSimulationData
}

// ---------------------------------------------------------------------------
// Canal (new or repair irrigation canal). Chapter 1 captures the canal-level
// design; per-reach designs, earthwork, LA width and lining follow in later
// chapters. Like Bund, quantities sync into ordinary generated items.
// ---------------------------------------------------------------------------

export type CanalMode = 'new' | 'repair';

/**
 * Water-flow direction along a drawn canal alignment. `start-to-end` means
 * water flows from the first drawn point (Ch 0) to the last; `end-to-start`
 * is the reverse. Null until the user chooses or inherits it.
 */
export type CanalFlowDirection = 'start-to-end' | 'end-to-start';

export type CanalBankMaterialSource = 'canal-excavation' | 'dump-area' | 'borrow-area';
export type CanalBankMaterialZone = 'homogeneous' | 'hearting' | 'casing';

/** One share of a bank zone supplied and billed from a particular material source. */
export interface CanalBankMaterialAllocation {
  id: string;
  zone: CanalBankMaterialZone;
  source: CanalBankMaterialSource;
  /** Share of this zone's measured volume. Allocations for a zone should total 100%. */
  percentage: number;
  compaction: 95 | 98;
  watering: boolean;
}

export interface CanalDesign {
  /** Design bed RL at canal Ch 0 (m). */
  bedLevelAtStart: number;
  /** Design discharge Q (cumecs); sizes the section and drives lining thickness. */
  discharge: number;
  /** Bed width B (m). */
  bedWidth: number;
  /** Full supply depth FSD (m). */
  fullSupplyDepth: number;
  /** Freeboard above FSL (m). */
  freeBoard: number;
  /** Bed slope expressed as 1 in N. */
  bedSlope: number;
  /** Side slope: horizontal metres per 1 m vertical. */
  sideSlope: number;
  /** Left bank crest width (m). */
  leftBankCrestWidth: number;
  /** Left bank outer slope, horizontal metres per 1 m vertical. */
  leftBankOuterSlope: number;
  /** Right bank crest width (m). */
  rightBankCrestWidth: number;
  /** Right bank outer slope, horizontal metres per 1 m vertical. */
  rightBankOuterSlope: number;
  /** Repeatable shelves on the two canal-side and two outer-bank faces. */
  berms: CanalBerm[];
  /** Chainage reaches carrying service-road platforms on either canal bank. */
  serviceRoadReaches: CanalServiceRoadReach[];
  /** Bank material arrangement. */
  bankSectionType: 'homogeneous' | 'zoned';
  /** Repeatable chainage ranges where impervious zoned bank construction applies. */
  zonedReaches: Array<{ id: string; fromChainage: number; toChainage: number }>;
  /** Signed vertical offset of the hearting top from FSL; capped at freeboard. */
  heartingLevelOffsetFromFsl: number;
  /** Minimum hearting height above prepared ground for the zone to apply (m). */
  minimumHeartingHeight: number;
  /** Finished width of the impervious hearting at its top (m). */
  heartingTopWidth: number;
  heartingLeftSlope: number;
  heartingRightSlope: number;
  heartingTrenchEnabled: boolean;
  /** Finished bottom width of the cutoff trench (m). */
  heartingTrenchWidth: number;
  /** Cutoff-trench side slopes, horizontal metres per 1 m vertical. */
  heartingTrenchLeftSlope: number;
  heartingTrenchRightSlope: number;
  /** Source shares for homogeneous fill or the two zones of a zoned bank. */
  bankMaterialAllocations: CanalBankMaterialAllocation[];
  /** @deprecated Retained only when loading older project files. */
  bankSoil: string;
  /** @deprecated Retained only when loading older project files. */
  heartingSoil: string;
  billBankFormation: boolean;
  billBankCompaction: boolean;
  billHearting: boolean;
  billCasing: boolean;
  billHeartingTrench: boolean;
  /** Optional user overrides; blank retains the recommended SSR operation. */
  bankFormationCodeOverride: string;
  bankCompactionCodeOverride: string;
  heartingCodeOverride: string;
  casingCodeOverride: string;
  bankFormationItemOverride?: TemplateMaterialRef | null;
  bankCompactionItemOverride?: TemplateMaterialRef | null;
  heartingItemOverride?: TemplateMaterialRef | null;
  casingItemOverride?: TemplateMaterialRef | null;
  /** Parent canal / offtake reference, e.g. the RD chainage. */
  offtake: string;
}

/** One point of a canal cross-section profile (metres from the centre-line, RL). */
export interface CanalPoint {
  /** Horizontal distance from the canal centre-line (m); negative = left of flow. */
  offset: number;
  /** Reduced level (m). */
  rl: number;
}

/** One chainage cross-section along 0..lengthM. */
export interface CanalSection {
  id: string;
  chainage: number;
  /** User-created section that is retained independently of interval generation. */
  isManual?: boolean;
  /** Quick-entry mode retained independently at each chainage. */
  groundEntryMode?: 'average' | 'separate';
  /** Entered left toe RL, or the common RL when groundEntryMode is average. */
  leftToeRl?: number | null;
  /** Entered right toe RL, equal to leftToeRl in average mode. */
  rightToeRl?: number | null;
  /** Surveyed existing ground profile (offset, RL), ordered by offset. */
  ground: CanalPoint[];
  /** False after Clear Proposed; surveyed ground remains available. */
  designPopulated?: boolean;
  /** Important generated canal breakpoints shown in the Section Levels table. */
  designPointOffsets?: number[];
}

export type CanalBermFace = 'left-outer' | 'left-canal' | 'right-canal' | 'right-outer';

export interface CanalBerm {
  id: string;
  face: CanalBermFace;
  /** Vertical elevation of the shelf above the canal bed (m). */
  heightAboveBed: number;
  /** Horizontal shelf width (m). */
  width: number;
}

export interface CanalServiceRoadReach {
  id: string;
  fromChainage: number;
  toChainage: number;
  side: 'left' | 'right' | 'both';
  heightMode: 'tbl' | 'manual';
  /** Used only in manual mode; vertical height above canal bed (m). */
  heightAboveBed: number;
  /** Usable carriageway width, excluding shoulders (m). */
  width: number;
  /** Edge shoulder/tolerance width on each side of the usable road (m). */
  shoulderWidth: number;
  constructionType: 'earthen' | 'traditional-metal';
  hardMetalThickness: number;
  hardMetalCode: string;
  blindageCode: string;
  hardMetalItem?: TemplateMaterialRef | null;
  blindageItem?: TemplateMaterialRef | null;
}

export type CanalItemRole =
  | 'clearance'
  | 'excavation'
  | 'banking'
  | 'lining'
  | 'foundation'
  | 'sand-blanket'
  | 'filter'
  | 'rock-toe'
  | 'road-metal'
  | 'road-blindage';

export interface CanalMaterialItem {
  role: CanalItemRole;
  code: string;
  itemNodeId: string;
}

export interface CanalExcavationBand {
  id: string;
  label: string;
  pct: number;
  /** Percentage of this excavated class confirmed suitable for reuse in bank fill. */
  bankReusePct: number;
  material: TemplateMaterialRef;
}

export interface CanalClearanceRow {
  id: string;
  length: number | null;
  breadth: number | null;
}

export interface CanalFoundationExcavationReach {
  id: string;
  fromChainage: number;
  toChainage: number;
  kind: 'foundation' | 'stripping';
  /** Target formation RL beneath the bank-fill footprint. */
  foundationRl: number;
  /** Stripping depth below existing ground when kind is stripping. */
  strippingDepth: number;
  /** Independent soil/rock classification for this reach. */
  bands: CanalExcavationBand[];
}

export type CanalFoundationFillKind = '5-1' | '5-2' | '5-3' | '5-4' | '5-5' | '5-7' | '5-10';

export interface CanalFoundationFillReach {
  id: string;
  /** Groups foundation fill, blanket and rock-toe selections saved for one reach. */
  workReachId: string;
  fromChainage: number;
  toChainage: number;
  kind: CanalFoundationFillKind;
  /** Share of foundation-excavation void replaced by 5-1/5-2/5-3. */
  percentage: number;
  /** Vertical replacement-fill depth above the foundation excavation bottom RL. */
  foundationDepth: number;
  /** Blanket thickness; 5-4 is fixed at 0.25 m. */
  thickness: number;
  /** Plan width for blankets, or base width for a rock toe/filter. */
  width: number;
  blanketWidthMode: 'automatic' | 'manual';
  blanketLeftWidth: number;
  blanketRightWidth: number;
  /** Rock-toe height or filter depth. */
  height: number;
  side: 'left' | 'right' | 'both';
  material: TemplateMaterialRef;
}

export type CanalFilterDrainKind = '5-6' | '5-7' | '5-8' | '5-9' | '5-11' | '5-12' | '5-13';

export interface CanalFilterDrainReach {
  id: string;
  fromChainage: number;
  toChainage: number;
  kind: CanalFilterDrainKind;
  orientation: 'longitudinal' | 'cross' | 'local';
  side: 'left' | 'right' | 'both' | 'bed';
  width: number;
  depth: number;
  thickness: number;
  spacing: number;
  count: number;
  /** Rock-toe crest width; CAW-5-6 follows the Bund geometry model. */
  rockToeTopWidth?: number;
  /** Rock-toe inner batter, horizontal metres per metre vertical. */
  rockToeInnerSlope?: number;
  /** Developed length of one transverse or local drain. */
  crossDrainLength?: number;
  /** Physical system; SSR code is resolved from this design object. */
  system?: 'rock-toe' | 'toe-drain' | 'bed-drainage' | 'porous-plug';
  coverage?: 'entire' | 'selected';
  placementMode?: 'spacing' | 'count' | 'manual';
  manualChainages?: number[];
  plugLocations?: Array<'bed' | 'left' | 'right'>;
  offsetMode?: 'centre' | 'left' | 'right' | 'custom';
  offset?: number;
  material: TemplateMaterialRef;
}

/** Lining item keys: each key feeds one billing toggle and one code override. */
export type CanalLiningItemKey =
  | 'lining'
  | 'modelWall'
  | 'steps'
  | 'sleepers'
  | 'porousPlugs'
  | 'masticJoints'
  | 'tarfeltJoints';

/** Which lining operations are billed in a reach. */
export interface CanalLiningBilling {
  lining: boolean;
  modelWall: boolean;
  steps: boolean;
  sleepers: boolean;
  porousPlugs: boolean;
  masticJoints: boolean;
  tarfeltJoints: boolean;
}

/**
 * One lined chainage reach (Chapter 6 new / 5 repair). Section geometry stays
 * in Chapter 1; every field here is lining-specific and `null` means "use the
 * documented automatic value" so the reach can be added without decisions.
 */
export interface CanalLiningReach {
  id: string;
  fromChainage: number;
  toChainage: number;
  /** False skips this reach; other reaches still measure. */
  provide: boolean;
  /** Lining thickness (mm); null = default (75 mm). */
  thicknessMm: number | null;
  /** Lining freeboard on the slopes above FSD (m); null = design freeBoard. */
  liningFb: number | null;
  /** Coping / lug width (m); null = from design discharge. */
  copingWidthM: number | null;
  /** Panel length between transverse contraction joints (m); null = 3.5. */
  panelLengthM: number | null;
  /** Model / profile wall interval along the reach (m); null = 17.5. */
  modelWallIntervalM: number | null;
  /** Steps interval along the reach (m); null = 300. */
  stepsIntervalM: number | null;
  /** Porous plug spacing on the slopes (sq.m per plug); null = 40. */
  plugSlopeSpacingSqm: number | null;
  /** Porous plug spacing in the bed (sq.m per plug); null = 100. */
  plugBedSpacingSqm: number | null;
  bill: CanalLiningBilling;
  /** Per-item SSR code overrides; a blank key keeps the default code. */
  itemOverrides: Partial<Record<CanalLiningItemKey, TemplateMaterialRef>>;
}

export interface CanalData {
  /** False until the setup wizard finishes; Edit setup reopens the wizard. */
  configured: boolean;
  /** Repair is modelled but not built yet; setup offers New only. */
  mode: CanalMode;
  /**
   * How the length is fixed:
   *  - 'map'    → the alignment is drawn on the map; the length is measured
   *               from it (a sub-component only trusts its line when it
   *               follows the parent canal alignment).
   *  - 'manual' → the length is typed in.
   */
  source: 'map' | 'manual';
  alignment: GuideWallPoint[];
  lengthM: number;
  /** Water-flow direction along the drawn alignment; null when not set. */
  flowDirection: CanalFlowDirection | null;
  /** True when flowDirection was inherited from the parent canal alignment. */
  flowInherited: boolean;
  sectionMode: 'continuous' | 'discontinuous';
  intervalM: number;
  /** Interior section chainages for discontinuous mode (sorted, 0 < ch < lengthM). */
  breaks: number[];
  /** Canal-level design (Chapter 1); per-reach designs arrive later. */
  design: CanalDesign;
  /** Topsoil/preparation stripping depth used in Chapter 4 (m). */
  strippingDepth: number;
  /** New-canal bank-foundation excavation; replaces stripping in new work. */
  foundationExcavationReaches: CanalFoundationExcavationReach[];
  /** Optional treatments placed in or beside saved foundation-excavation reaches. */
  foundationFillReaches: CanalFoundationFillReach[];
  /** Optional filter and drain works. */
  filterDrainReaches: CanalFilterDrainReach[];
  /** Soil/rock classification percentages for canal cut and stripping. */
  excavationBands: CanalExcavationBand[];
  /** Separately classified cut-off-trench excavation. */
  trenchExcavationBands: CanalExcavationBand[];
  /** Lining reaches (Chapter 6 new / 5 repair); blank fields use defaults. */
  liningReaches: CanalLiningReach[];
  jungleClearanceMode: 'automatic' | 'manual';
  jungleClearanceMaterial: TemplateMaterialRef | null;
  jungleClearanceRows: CanalClearanceRow[];
  /** Extra acquisition margin beyond the designed footprint on each side (m). */
  laLeftMargin: number;
  laRightMargin: number;
  /** Materialized sections along 0..lengthM. */
  sections: CanalSection[];
  /** Generated items, one per distinct (role, code) actually in use. */
  materialItems: CanalMaterialItem[];
}


/**
 * Pinned pages every project carries. 'front' is the cover canvas (rich text
 * plus images); 'introduction' is a plain rich document.
 */
export type PageTemplateId = 'introduction' | 'front'

export interface ProjectNode {
  id: string
  kind: NodeKind
  name: string
  children: ProjectNode[]

  /** Page templates: which purpose-built editor this page node uses. */
  pageTemplate?: PageTemplateId
  /** Set after the default Telangana front-cover template is seeded once. */
  frontCoverInitialized?: boolean

  /** Component templates: which purpose-built dashboard this node uses. */
  templateId?: ComponentTemplateId
  /** Guide Wall template state (templateId === 'guide-wall'). */
  guideWall?: GuideWallData
  /** Bund template state (templateId === 'bund'). */
  bund?: BundData
  /** Canal template state (templateId === 'canal'). */
  canal?: CanalData
  /** Retired 'mi-sluice-new' template state: never created; old project files ignore it. */
  miSluiceNew?: unknown

  /**
   * Item nodes whose quantity is computed by a component template. Carries the
   * final quantity directly (no spreadsheet), while the DATA/rate still resolves
   * from itemCode — so totals, seigniorage, and prints work unchanged.
   */
  computedQuantity?: number
  /** Marks an item generated and driven by a template dashboard. */
  templateGenerated?: boolean
  /** Component id that owns and edits this generated item. */
  templateOwnerId?: string
  /** Which template role produced this item. */
  templateItemRole?: 'wall' | 'base' | 'excavation' | BundItemRole | CanalItemRole

  /**
   * Page/document item nodes: free-form document content.
   * @deprecated Superseded by `documentData`; still read so older projects
   * migrate, and still written so they remain readable by older builds.
   */
  document?: string

  /** Rich page content, edited with Univer Docs. */
  documentData?: IDocumentData

  /** Document items: the selection fixed as this item's final quantity. */
  documentFinal?: DocumentFinalNumber
  /** Document items: the paragraph span to print (Y range only). */
  documentPrintArea?: DocumentPrintArea

  /** Spreadsheet item nodes: Univer workbook data stored in the project file. */
  spreadsheet?: SpreadsheetDocument

  /** Item nodes. */
  itemSource?: ItemSource
  itemCode?: string
  itemDescription?: string
  /** Source record in the project DATA library. It is reusable across Components. */
  projectDataId?: string
  /** @deprecated Legacy Create New DATA reference; no longer written by the app. */
  splitFromNodeId?: string
  /** @deprecated Legacy Create New DATA identity; retained to read existing projects. */
  splitFromItemKey?: string
  /** @deprecated Legacy Create New DATA identity; retained to read existing projects. */
  createdDataId?: string
  /** Optional work point for a component/sub-component. Defaults to project location. */
  location?: ProjectLocation | null
  /**
   * Explicit labour area allowance for a component/sub-component. Items under
   * the nearest ancestor carrying one use it instead of the project allowance;
   * null/undefined means inherit.
   */
  areaAllowance?: ProjectAreaAllowance | null
  /** Drawn working line for a custom component; the allowance resolves from its centroid. */
  workingLine?: { lat: number; lng: number }[] | null
  /** Items open as a spreadsheet by default, but can be changed from Settings. */
  itemEditorType?: ItemEditorType
  unit?: string | null
  /** Source table key, e.g. 'ssr_item' (SSR) or 'material' (SOR). */
  categoryKey?: string
  /** SSR DATA choice made before insertion when its annual recipe has variants. */
  dataVariant?: DataVariantSelection
  /** Logical catalogue cell and source audit captured by the SOR catalogue picker. */
  sorCatalogue?: SorCatalogueItemSelection

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

export interface ProjectAreaAllowance {
  /** Spatial classification returned by village_allowance. */
  type: string | null
  label: string
  percent: number
  tier?: string | null
  description?: string | null
  village?: string | null
  mandal?: string | null
  district?: string | null
  ruleYear?: string | null
  goReference?: string | null
  /** Automatic coordinate match, or an explicit user classification override. */
  source?: 'automatic' | 'manual'
}

export type GstRecipientType = 'CENTRAL_STATE_UT_LOCAL' | 'GOVT_ENTITY_OR_AUTHORITY'

export interface ProjectTaxSettings {
  mode: 'automatic' | 'manual'
  recipientType: GstRecipientType
  manualRate?: 12 | 18
}

export interface ProjectMiscellaneousItem {
  id: string
  name: string
  cost: number
  createdAt: string
}

/**
 * How the mineral transit permit fee is derived. `go_multiplier` follows the
 * G.O. of 31.03.2022 (w.e.f. 01.04.2022): permit fee is a multiple of the
 * seigniorage fee — 0.8x for minor minerals, 0.4x for Colour/Black Granite.
 * `manual` is a single lump sum for the whole project.
 */
/** Charges levied on the components total rather than on seigniorage. */
export interface ProjectChargeSettings {
  /** Nature and Conservation / NAC. Default 0.1%. */
  nacPercent?: number
  /** Building & Other Construction Workers labour cess. Default 1%. */
  labourCessPercent?: number
}

export type ConveyanceClass =
  | 'EARTH'
  | 'STONE'
  | 'CEMENT'
  | 'STEEL'
  | 'SLAB_WOOD'
  | 'WATER'
  | 'BRICKS'
  | 'RCC_PIPE'

export type LeadPointKind = 'site' | 'quarry' | 'sand_reach' | 'godown' | 'water' | 'stockyard' | 'other'
export type LeadHandlingMode = 'none' | 'manual_no_idle' | 'manual_with_idle' | 'mechanical'
export type LeadIncludedBasis = 'none' | 'initial_50m' | 'initial_1km' | 'all_leads'
export type LeadRateSource = 'chart' | 'dtl' | 'manual' | 'pipe_catalogue'
export type LeadRoadCondition = 'normal' | 'certified_ghat' | 'ce_exceptional'
export type LeadAccessDistanceMode = 'auto' | 'manual'
export type LeadTransportPurpose =
  | 'EXCAVATED_DISPOSAL'
  | 'MATERIAL_SUPPLY'
  | 'REUSE_FROM_DUMP'
  | 'REUSE_FROM_HEAP'
  | 'NO_EXTRA_LEAD'
  | 'REVIEW_REQUIRED'
export type LeadQuantityBasis =
  | 'PARENT_CUM'
  | 'DERIVED_LOOSE_CUM'
  | 'MANUAL_LOOSE_CUM'
  | 'PUBLISHED_FABRICATED_WEIGHT_TONNE'
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
  /** Number of separately payable haul legs represented by one mapped route. */
  haulLegs?: number
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
  mapPageSize?: PaperSize
  mapLayerType?: 'map' | 'satellite' | 'toposheet' | 'toposheet_transparent'
  showMapLabels?: boolean
  showMapPointLabels?: boolean
  showMapRouteLabels?: boolean
  mapPointLabelMode?: 'code' | 'name' | 'code_name'
  mapLabelSize?: 'small' | 'medium' | 'large'
  showRouteArrows?: boolean
  showBaseMap?: boolean
  showMapLegend?: boolean
  mapLegendPosition?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  showMapScale?: boolean
  showMapHeader?: boolean
  mapTitle?: string
  mapSubtitle?: string
  /** Map box height in mm. Unset (or 0) fills the page below the heading. */
  mapBoxHeightMm?: number
  /** Map box width as a percentage of the printable width. */
  mapBoxWidthPercent?: number
  /** Saved pan/zoom. Unset or null means "fit the routes". */
  mapView?: { lat: number; lon: number; zoom: number } | null
  /** True after Map Print Studio Save; layout is locked until Clear. */
  mapLayoutSaved?: boolean
}

export interface SeignioragePrintSettings {
  pageSize?: PaperSize
  orientation?: Orientation
  margins?: Margins
  /** Report font scale (%) for the seigniorage statement. */
  fontPercent?: number
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

export type AvgLeadMode = 'line' | 'table'

export interface AvgLeadRouteInput {
  chainageM: number
  routeKm: number
  startPointId: string
  /** Accepted road route, stored — never discarded. Empty in table mode. */
  geometry?: { lat: number; lon: number }[]
}

/** Audit trail for an Avg Lead: how the averaged distance was produced. */
export interface AvgLeadDetail {
  mode: AvgLeadMode
  componentId: string
  componentName: string
  spacingM?: number
  toleranceM?: number
  pointCount: number
  avgKm: number
  routes: AvgLeadRouteInput[]
  distancesKm?: number[]
}

export interface WeightedLeadEntry {
  variantId: string
  variantName: string
  leadKm: number
  quantity: number
  /** Quantity unit from the first contributing Lead application ("cum", "MT", …). */
  unit: string
}

/** Project-wide Weighted Average Lead: (w1*l1 + w2*l2 + …) / W over applied leads. */
export interface WeightedLeadDetail {
  entries: WeightedLeadEntry[]
  totalQuantity: number
  weightedAvgKm: number
  createdAt: string
}

export interface LeadVariant {
  id: string
  variantName?: string
  materialName: string
  conveyanceClass: ConveyanceClass
  assignmentId?: string
  startPointId?: string
  /** Ordered intermediate stops used by the road-routing engine. */
  viaPointIds?: string[]
  endPointId?: string
  /** Persisted road-following route returned by the routing engine. */
  routeGeometry?: LeadMapCoordinate[]
  /** First access connector, drawn in the selected haul direction. */
  firstMileGeometry?: LeadMapCoordinate[]
  /** Last access connector, drawn in the selected haul direction. */
  lastMileGeometry?: LeadMapCoordinate[]
  /** Route colour pinned by the user; unset means the automatic cycle. */
  mapColor?: string
  routeSource?: 'osrm' | 'manual' | 'legacy'
  routeCalculatedAt?: string
  roadRouteKm?: number
  firstMileMode?: LeadAccessDistanceMode
  firstMileKm?: number
  lastMileMode?: LeadAccessDistanceMode
  lastMileKm?: number
  chargeCode?: LeadChargeCode
  mechanicalConveyanceReachesFinalPoint?: boolean
  includedInitialLiftM?: number | null
  includesAllLifts?: boolean
  /** Actual measured route distance. `leadKm` remains the payable/equivalent chart lead. */
  actualLeadKm?: number | null
  /** Component the lead was created from (Avg Lead: working line or table). */
  componentId?: string
  componentName?: string
  avgLead?: AvgLeadDetail
  weightedLead?: WeightedLeadDetail
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
  /** Linked Public Health Table 6/7 cell for RCC pipe conveyance variants. */
  pipeLead?: PipeLeadSource
  customGrossRate?: number | null
  active: boolean
  createdAt: string
}

export interface LeadApplication {
  id: string
  variantId: string
  /** Selected optional DATA add-on that owns this Lead application, when applicable. */
  addonId?: string
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
  /** DATA output quantity used to convert this scoped Lead amount to an Item rate. */
  outputQuantity?: number
  /** Lead addition per DATA output unit, applied only to `itemNodeId`. */
  rateAddition?: number
  netRate: number
  netAmount: number
  calculation?: LeadRateCalculationDetail
  /** SOR zone used to calculate the persisted Lead rates. */
  rateZone?: SorZone
  /** SOR year used to calculate the persisted Lead rate. */
  rateYear?: string
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
  /** Quantity used to build the row (distance km, multiplier, etc.). */
  quantity?: number
  /** Unit rate used to derive the row amount. */
  unitRate?: number
}

export interface LeadRateCalculationDetail {
  rows: LeadRateCalculationLine[]
  fullLeadRate: number
  deductedLeadRate: number
  netLeadRate: number
  unit: string
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

export type SorZone = 'zone_1' | 'zone_2' | 'zone_3'

/**
 * A cement/steel/Public-Health rate fixed for THIS project only. Monthly G.O.
 * circulars keep moving in the master data; an estimate must stay on the rate it was
 * sanctioned with, so the value is copied into the project rather than referenced.
 */
export interface MaterialRateOverride {
  /** Rate in the master material's own unit (tonne / MT). */
  rate: number
  source: 'MONTHLY_CIRCULAR' | 'MANUAL'
  /** effective_from of the circular chosen, when source is MONTHLY_CIRCULAR. */
  effectiveFrom?: string
  /** Printed provenance, e.g. "G.O. monthly material circular - May 2026". */
  label?: string
  setAt: string
}

export interface ProjectMeta {
  name: string
  sorYear: string
  /** Latest fully calculated Project Dashboard total, shown on the Front Cover. */
  estimatedCost?: number
  /** Active annual-rate zone. Zone III is the display/calculation default. */
  sorZone?: SorZone
  /**
   * Area allowance is separate from zone. It is applied, when used, to the
   * labour component only.
   */
  areaAllowancePercent?: number
  areaAllowanceLabel?: string
  /** Full location-derived allowance audit trail. */
  areaAllowance?: ProjectAreaAllowance
  location: ProjectLocation | null
  /** @deprecated Retained only so older project files remain readable. */
  flags: string[]
  /** GST selection. Automatic mode resolves the live Supabase slab. */
  taxSettings?: ProjectTaxSettings
  /** Per-project cement/steel/PH rates, keyed by material_code. Never global. */
  materialRateOverrides?: Record<string, MaterialRateOverride>
  /**
   * Date the project prices monthly materials at. Defaults to today when unset, so a
   * project opened later still resolves the circular that was current for it.
   */
  materialRateAsOf?: string
}

export type CompiledDataScope = 'shared' | 'shared_edit' | 'component_edit' | 'item_edit' | 'lead_edit'

export interface CompiledDataUsage {
  nodeId: string
  /** Human-readable component/sub-component path where this DATA is applied. */
  path: string
}

/**
 * One effective DATA identity in the aggregate DATA Dashboard.
 *
 * Unedited usages of the same source DATA remain grouped. A component-scoped
 * recipe edit, an Item rate edit, or a scoped Lead addition receives a separate
 * compiled key so it can never silently replace the shared DATA row.
 */
export interface CompiledDataDashboardEntry {
  key: string
  baseKey: string
  code: string
  displayName: string
  description: string
  unit: string | null
  source: ItemSource
  categoryKey: string
  scope: CompiledDataScope
  scopeNodeId?: string
  scopeName?: string
  baseRate: number | null
  leadRate: number
  rate: number | null
  usageCount: number
  usages: CompiledDataUsage[]
  /** An Item node that can open the corresponding individual DATA view. */
  representativeNodeId: string
  synced: boolean
}

export interface CompiledLeadApplication {
  applicationId: string
  itemKey: string
  itemCode: string
  itemNodeId?: string
  appliedAt: string
  appliedPath: string
  unit: string
  quantity: number
  variantRate: number
  variantAmount: number
}

/** One row of a compiled Lead rate calculation, as stored on a dashboard entry. */
export interface LeadBreakdownEntry {
  label: string
  expression: string
  amount: number
  quantity?: number | null
  unitRate?: number | null
}

/** Minimal shape of a compiled lead charge breakdown read by print/dashboard views. */
export interface LeadChargeBreakdownShape {
  liftRate: number
  leadRate: number
  loadingRate: number
  unloadingRate: number
  deductedLeadRate?: number
  netRate?: number
}

export interface CompiledLeadDashboardEntry {
  variantId: string
  materialName: string
  variantName: string
  conveyanceClass: ConveyanceClass
  active: boolean
  leadKm: number
  liftM: number
  rateSource: LeadRateSource
  pipeLead?: PipeLeadSource
  /** Cost per Lead unit compiled from the synced Lead chart rows. */
  variantRate: number | null
  /** Printed rate-calculation breakdown rows (label, expression, amount). */
  breakdown?: LeadBreakdownEntry[]
  /** Full lead charge breakdown, when the variant was compiled from charges. */
  chargeBreakdown?: LeadChargeBreakdownShape | null
  rateUnit: string
  applications: CompiledLeadApplication[]
}

/**
 * Backend-derived values used by dashboards and print views.
 *
 * This is deliberately stored in the project file. Opening a dashboard or a
 * print preview must be an offline/read-only operation; only an explicit Sync
 * action is allowed to replace these values from the backend.
 */
export interface DashboardDataSnapshot {
  syncedAt: string
  /** Last aggregate DATA recompile, including scoped edits and Lead additions. */
  dataSyncedAt?: string
  /** Project state signature represented by dataDashboardEntries. */
  dataCompileSignature?: string
  dataDashboardEntries?: CompiledDataDashboardEntry[]
  /** Last aggregate Lead recompile. */
  leadSyncedAt?: string
  /** Project Lead state signature represented by leadDashboardEntries. */
  leadCompileSignature?: string
  leadDashboardEntries?: CompiledLeadDashboardEntry[]
  /** Last component compile by component/sub-component node id. */
  componentSyncedAt?: Record<string, string>
  /** Effective final DATA rate frozen by each Component Dashboard Sync. */
  componentRates?: Record<string, Record<string, number | null>>
  componentRecipes?: Record<string, Record<string, RateAnalysisRecipe>>
  /** Quantity × effective rate total frozen by each Component Dashboard Sync. */
  componentTotals?: Record<string, number>
  componentCompileSignatures?: Record<string, string>
  /** Effective final DATA rates frozen by the last Project/Title Sync. */
  projectRates?: Record<string, number | null>
  projectRecipes?: Record<string, RateAnalysisRecipe>
  /**
   * On-disk form of `componentRecipes` / `projectRecipes` — see `projectFile.ts`.
   * Present only in a saved file; expanded back into the maps above on load, and
   * never seen by anything that reads the snapshot.
   */
  componentItemIds?: Record<string, string[]>
  mergedRecipes?: Record<string, RateAnalysisRecipe>
  projectComponentIds?: string[]
  /** Set only when the complete Title dashboard (rates, tax, charges, Lead) synced. */
  projectSyncedAt?: string
  /** Item identity/version set covered by the complete Title sync. */
  projectItemsSignature?: string
  context: {
    sorYear: string
    sorZone: SorZone
    areaAllowancePercent: number
    areaAllowanceLabel?: string
    /** Digest of the project's material rate overrides; a change forces a re-sync. */
    materialRateSignature?: string
  }
  syncedItemIds: string[]
  itemSignatures?: Record<string, string>
  rates: Record<string, number>
  recipes: Record<string, RateAnalysisRecipe>
  gstRules: Array<{
    recipientType: GstRecipientType
    earthworkPredominant: boolean
    ratePct: number
    effectiveFrom: string
    effectiveTo: string | null
    notificationRef: string | null
    description: string | null
  }>
  seigniorageCharges: Array<{
    seig_code: string
    mineral_name: string
    rate_per_mt: number | null
    rate_per_m3: number | null
    schedule: string | null
    go_reference: string | null
    effective_from: string | null
    confidence: string | null
    notes: string | null
  }>
  /** Last total Seigniorage Dashboard Sync. */
  seigniorageSyncedAt?: string
  seignioragePolicies: Record<string, SeigniorageApplicabilityPolicy>
  leadApplicability?: Record<string, unknown>
  /** Current-year Public Health Table 6/7 quotes keyed by Lead variant id. */
  pipeLeadQuotes?: Record<string, PipeLeadQuote>
  /** Pipe applications recalculated during Sync and adopted into project Lead state. */
  leadApplicationUpdates?: LeadApplication[]
  leadRates?: Array<{
    charge_code: string
    year: string
    slab_key: string
    column_key: string
    applies_to: string[]
    unit: string
    basis:
      | 'initial'
      | 'cumulative_total'
      | 'per_km_increment'
      | 'per_m_increment'
      | 'per_operation'
    slab_label: string
    range_from: number | null
    range_to: number | null
    range_unit: string | null
    rate: number
    selectedZone: SorZone
  }>
}

/** User-tweaked wording for the printed Lead Statement and its variants. */
export interface LeadPrintOverrides {
  title?: string
  subtitle?: string
  notes?: string
  /** Re-labelled variant names keyed by variant id. */
  variantNames?: Record<string, string>
}

/** User-tweaked wording and toggles for the printed seigniorage schedules. */
export interface SeignioragePrintOverrides {
  /** Custom schedule title. */
  title?: string
  /** Custom schedule year line. */
  year?: string
  /** Custom group headings keyed by group key. */
  groupHeadings?: Record<string, string>
  /** Per-group subtotal on/off or custom label, keyed by group key. */
  groupSubtotals?: Record<string, string>
  /** Custom row descriptions keyed by row id. */
  rowDescriptions?: Record<string, string>
  /** Optional permit-basis note shown in the schedule header. */
  permitBasis?: string
}

export interface EestimateProject {
  formatVersion: 1
  /** Stable id for the project. */
  id: string
  meta: ProjectMeta
  /** The Title node — root of the project tree. */
  root: ProjectNode
  /** Project DATA library. Definitions only become visible in DATA/Lead once used by an Item. */
  projectData?: ProjectDataDefinition[]
  leadChart?: LeadChart
  /** Project-local recipe edits, shared by every usage of the same item code. */
  rateAnalysisOverrides?: Record<string, RateAnalysisRecipe>
  /**
   * Component/sub-component recipe edits. The first key is the structural node id;
   * the second is projectItemKey. These override the shared recipe only in that branch.
   */
  rateAnalysisScopedOverrides?: Record<string, Record<string, RateAnalysisRecipe>>
  /** Per-item seigniorage charge overrides keyed by projectItemKey. */
  seigniorageOverrides?: Record<string, {
    seigCode: string | null
    rate?: number | null
    slabThicknessMm?: number | null
    quantityRatio?: number
  }>
  /** Seigniorage print preview layout settings. */
  seignioragePrintSettings?: SeignioragePrintSettings
  /** Local seigniorage print headings/subtotals/notes keyed by group or row id. */
  seignioragePrintOverrides?: SeignioragePrintOverrides
  /** Lead statement title/subtitle/notes and variant-name overrides. */
  leadPrintOverrides?: LeadPrintOverrides
  /** NAC / labour cess percentages used by the General Abstract. */
  chargeSettings?: ProjectChargeSettings
  /**
   * Project print preview layout. Typed loosely here so `lib/projectPrint` owns
   * the section list without this module depending on it.
   */
  projectPrintSettings?: {
    pageSize?: PaperSize
    orientation?: Orientation
    margins?: Margins
    fontPercent?: number
    sections?: Record<string, boolean>
  }
  /** Saved Typst layouts keyed by Print Studio scope (e.g. `front-cover`). */
  printStudioDocuments?: Record<string, string>
  printStudioDocumentSettings?: Record<string, {
    pageSize?: PaperSize
    orientation?: Orientation
    margins?: Margins
    fontFamily?: DocumentFontFamily
    fontSizePt?: number
  }>
  /**
   * Virtual files stored in the `.eestimate` (base64 data URLs). The Telangana
   * emblem (`telangana-emblem.svg`), the Lead route-map PNG, and downloaded map
   * tiles (`images/lead-map-cache/`) live here so print stays portable.
   */
  printStudioShadowFiles?: Record<string, string>
  /** Project-wide default inherited by every dashboard, DATA and Page. */
  signatureFooter?: SignatureFooterSettings
  /** Local dashboard/Page overrides keyed by node id or dashboard scope key. */
  signatureFooterOverrides?: Record<string, SignatureFooterSettings>
  /** Project-level named charges entered by the estimator. */
  miscellaneousItems?: ProjectMiscellaneousItem[]
  /** Per-DATA earthwork review keyed by projectItemKey. Missing means automatic. */
  earthworkOverrides?: Record<string, boolean>
  /** Last explicit dashboard synchronization; shared by dashboards and printing. */
  dashboardSnapshot?: DashboardDataSnapshot
  createdAt: string
  updatedAt: string
}
