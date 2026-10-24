import type {
  CanalData,
  CanalCutBermConfig,
  CanalManualCutBerm,
  CanalStrataSlopeConfig
} from './project'
import type { RateAnalysisRecipe, RateAnalysisSummary } from './rateAnalysis'

export interface CanalQuantityRow {
  from_ch: number
  to_ch: number
  length_m: number
  area_from: number
  area_to: number
  mean_area: number
  qty: number
  item_code?: string
  description?: string
}

export interface CanalEarthworkTotals {
  excavation: number
  stripping: number
  foundationExcavation: number
  cutoffTrench: number
}

export interface CanalLiningTotals {
  reaches: number
  length: number
  liningBedArea: number
  liningSlopeArea: number
  modelWallVolume: number
  soffitVolume: number
  stepsVolume: number
  sleepersVolume: number
  plugsSlope: number
  plugsBed: number
  masticLongitudinal: number
  masticTransverse: number
  tarfeltLength: number
}

export interface CanalCalculationResult {
  earthwork: CanalEarthworkTotals
  lining: CanalLiningTotals
  summary_rows: CanalQuantityRow[]
}

export interface CanalCuttingInput {
  bedWidth: number
  fullSupplyDepth: number
  freeBoard: number
  sideSlope: number
  bedSlope: number
  bedLevelAtStart: number
  bermConfig: CanalCutBermConfig
  strataSlopes?: CanalStrataSlopeConfig
  sections: Array<{
    id: string
    chainage: number
    groundLevel: number
    bedLevel?: number
    soilPct?: number
    hdrPct?: number
    ffPct?: number
    hrPct?: number
  }>
}

export interface CanalCuttingStratumSlice {
  stratumName: string
  bottomRl: number
  topRl: number
  depth: number
  bottomWidth: number
  topWidth: number
  slope: number
  area: number
}

export interface CanalCuttingTrapezoidTier {
  tierIndex: number
  tierName: string
  bottomRl: number
  topRl: number
  totalDepth: number
  startingBottomWidth: number
  endingTopWidth: number
  strataSlices: CanalCuttingStratumSlice[]
  totalTierArea: number
  leftShelfWidth: number
  rightShelfWidth: number
  hasBerm: boolean
}

export interface CanalCuttingTrapezoidLayer {
  layerIndex: number
  name: string
  bottomRl: number
  topRl: number
  depth: number
  bottomWidth: number
  topWidth: number
  meanWidth: number
  sideSlope: number
  shelfWidth: number
  area: number
}

export interface CanalCuttingActiveBerm {
  index: number
  heightAboveBed: number
  rl: number
  shelfWidth: number
  leftShelfWidth?: number
  rightShelfWidth?: number
  slopeAfter: number
}

export interface CanalCuttingSectionResult {
  sectionId: string
  chainage: number
  groundLevel: number
  bedLevel: number
  tblLevel: number
  cutDepth: number
  cutDepthAboveTbl: number
  activeBerms: CanalCuttingActiveBerm[]
  discardedBerms: CanalManualCutBerm[]
  tiers?: CanalCuttingTrapezoidTier[]
  layers?: CanalCuttingTrapezoidLayer[]
  totalCutArea: number
  strataAreas: {
    soilArea: number
    hdrArea: number
    ffArea: number
    hrArea: number
  }
  diagramSvg: string
}

export interface CanalCuttingReach {
  reachIndex: number
  reachName: string
  fromChainage: number
  toChainage: number
  lengthM: number
  bermCount: number
  activeBermElevations: number[]
  sectionCount: number
  sectionIndices: number[]
  totalVolumeM3: number
  soilVolumeM3: number
  hdrVolumeM3: number
  ffVolumeM3: number
  hrVolumeM3: number
}

export interface CanalCuttingCalculationResponse {
  tblHeight: number
  reaches: CanalCuttingReach[]
  sections: CanalCuttingSectionResult[]
  totalCuttingVolumeM3: number
  totalSoilVolumeM3: number
  totalHdrVolumeM3: number
  totalFfVolumeM3: number
  totalHrVolumeM3: number
}

export interface CanalCuttingExcelExportResponse {
  ok: boolean
  filePath?: string
  data?: string
  error?: string
}

export interface CanalBankSideConfig {
  topWidth: number
  innerSlope: number
  outerSlope: number
  bermIntervalM?: number
  bermWidth?: number
}

export interface CanalBankBermStepInput {
  id?: string
  dropHeight: number
  shelfWidth: number
  slopeAfterBerm: number
}

export interface CanalBankTierInput {
  id: string
  name: string
  minFillHeight: number
  maxFillHeight: number
  crestWidth: number
  baseSlope: number
  innerSlope: number
  sectionType: string
  berms: CanalBankBermStepInput[]
  heartingTopWidth?: number
  heartingSideSlope?: number
}

export interface CanalBankManualReachInput {
  from: number
  to: number
  tierId: string
  status?: string
}

export interface ExcavationBandInput {
  label: string
  pct: number
  bankReusePct: number
}

export interface BankMaterialAllocationInput {
  id?: string
  zone: string
  source: string
  percentage: number
  compaction: number
  watering: boolean
}

export interface SoilAllocationItem {
  zone: string
  source: string
  percentage: number
  volumeM3: number
  compaction: number
  watering: boolean
  itemCode: string
  itemDescription: string
}

export interface SoilAllocationSummary {
  totalFillVolumeM3: number
  suitableCutAvailableM3: number
  allocatedFromCutM3: number
  allocatedFromBorrowM3: number
  allocatedFromDumpM3: number
  items: SoilAllocationItem[]
}

export interface CanalEmbankmentInput {
  bedWidth: number
  fullSupplyDepth: number
  freeBoard: number
  bedSlope: number
  bedLevelAtStart: number
  strippingDepth: number
  mode?: string
  linkSymmetrical?: boolean
  leftTiers?: CanalBankTierInput[]
  rightTiers?: CanalBankTierInput[]
  leftManualReaches?: CanalBankManualReachInput[]
  rightManualReaches?: CanalBankManualReachInput[]
  leftBank?: CanalBankSideConfig
  rightBank?: CanalBankSideConfig
  excavationBands?: ExcavationBandInput[]
  materialAllocations?: BankMaterialAllocationInput[]
  totalCutVolume?: number
  sections: CanalCuttingSectionInput[]
}

export interface CanalEmbankmentSectionResult {
  sectionId: string
  chainage: number
  groundLevel: number
  bedLevel: number
  tblLevel: number
  fslLevel: number
  netBankingHeight: number
  strippingDepth: number
  grossBankingHeight: number
  leftTopWidth: number
  leftBottomWidth: number
  leftBankArea: number
  leftTierName: string
  rightTopWidth: number
  rightBottomWidth: number
  rightBankArea: number
  rightTierName: string
  strippingArea: number
  totalBankArea: number
  heartingArea: number
  casingArea: number
  homogeneousArea: number
  diagramSvg: string
}

export interface CanalEmbankmentReachResult {
  reachIndex: number
  reachName: string
  fromChainage: number
  toChainage: number
  length: number
  isPureCut: boolean
  tierName: string
  sectionCount: number
  leftVolume: number
  rightVolume: number
  totalBankVolume: number
  strippingVolume: number
  heartingVolume: number
  casingVolume: number
  homogeneousVolume: number
}

export interface CanalEmbankmentCalculationResponse {
  tblHeight: number
  sections: CanalEmbankmentSectionResult[]
  reaches: CanalEmbankmentReachResult[]
  soilAllocation: SoilAllocationSummary
  totalBankVolume: number
  totalStrippingVolume: number
  totalLeftBankVolume: number
  totalRightBankVolume: number
  totalHeartingVolume: number
  totalCasingVolume: number
  totalHomogeneousVolume: number
}

export interface CanalEmbankmentExcelExportResponse {
  ok: boolean
  filePath?: string
  data?: string
  error?: string
}

export interface TypstCompileResult {
  ok: boolean
  /** base64-encoded PDF when ok (absent when pdfPath is returned). */
  data?: string
  /** Session cache file path when preferPath was requested. Missing on older engines. */
  pdfPath?: string
  /** True when the bytes came from the server result cache. Missing on older engines. */
  cacheHit?: boolean
  error?: string
  durationMs?: number
  /** Invisible metadata emitted beside rendered project content. Missing on older engines. */
  printedContent?: string[]
}

export interface RecentEntry {
  path: string
  name: string
  openedAt: string
}

export interface SaveResult {
  canceled: boolean
  path?: string
}

export interface OpenResult {
  canceled: boolean
  path?: string
  data?: EestimateProject
  error?: string
}

export interface EestimateApi {
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (cb: (v: boolean) => void) => () => void
  }
  project: {
    save: (data: unknown, currentPath: string | null, name: string) => Promise<SaveResult>
    saveAs: (data: unknown, name: string) => Promise<SaveResult>
    open: () => Promise<OpenResult>
    openPath: (path: string) => Promise<OpenResult>
  }
  cluster: {
    /** Save cluster JSON to its current file (same writer as projects). */
    save: (data: unknown, currentPath: string | null, name: string) => Promise<SaveResult>
    /** Save cluster JSON with a `.eestimate-cluster` picker. */
    saveAs: (data: unknown, name: string) => Promise<SaveResult>
    /** Open a `.eestimate-cluster` file with a cluster-filtered picker. */
    open: () => Promise<OpenResult>
  }
  recent: {
    list: () => Promise<RecentEntry[]>
    clear: () => Promise<RecentEntry[]>
  }
  bund: {
    /** Run one headless XSLOPE stability case for a bund section. */
    simulate: (request: BundSimulationEngineRequest) => Promise<BundSimulationEngineResponse>
    /** Cancel an active sidecar run by its unique run id. */
    cancel: (runId: string) => Promise<boolean>
    /** Shell phase updates survive Simulation-tab navigation. */
    onProgress: (cb: (progress: BundSimulationProgressUpdate) => void) => () => void
  }
  canal: {
    /** Fast Rust calculation of canal earthwork and lining quantities. */
    calculateQuantities: (data: CanalData) => Promise<CanalCalculationResult>
    /** Fast native Rust Canal Engine: trapezoid layer breakdown, discard rules, reaches grouping, and SVG diagrams */
    calculateCutting: (payload: CanalCuttingInput) => Promise<CanalCuttingCalculationResponse>
    /** Export authentic Canal Cutting Excel spreadsheet with live formulas and reaches */
    exportCuttingExcel: (payload: CanalCuttingInput, preferPath?: boolean) => Promise<CanalCuttingExcelExportResponse>
    /** Fast native Rust Canal Formation of Embankment calculation and SVG diagrams */
    calculateEmbankment: (payload: CanalEmbankmentInput) => Promise<CanalEmbankmentCalculationResponse>
    /** Export authentic Canal Formation of Embankment Excel spreadsheet with live formulas */
    exportEmbankmentExcel: (payload: CanalEmbankmentInput, preferPath?: boolean) => Promise<CanalEmbankmentExcelExportResponse>
  }
  rateAnalysis: {
    /** Fast Rust calculation of SSR rate buildup. */
    calculate: (recipe: RateAnalysisRecipe) => Promise<RateAnalysisSummary>
    calculateBase: (recipe: RateAnalysisRecipe) => Promise<RateAnalysisSummary>
    /** Fast Rust batch recalculation of multiple SSR recipes. */
    batchCalculate: (recipes: RateAnalysisRecipe[]) => Promise<RateAnalysisSummary[]>
  }
  typst: {
    compile: (
      mainContent: string,
      inputs?: Record<string, string>,
      shadowFiles?: Record<string, string>,
      opts?: { contentHash?: string; preferPath?: boolean }
    ) => Promise<TypstCompileResult>
  }
  excel: {
    compile: (payload: unknown) => Promise<{
      ok: boolean
      data?: string
      /** Session cache file path when preferPath was requested. Missing on older engines. */
      filePath?: string
      error?: string
      durationMs?: number
    }>
  }
  image: {
    /** Download an http(s) image in the shell and return a portable data URL. */
    embedRemote: (url: string) => Promise<{ ok: boolean; data?: string; error?: string }>
  }
  export: {
    /** Ask where to save, then write the base64 PDF there (or copy sourcePath when given). */
    pdf: (data: string, name: string, defaultPath?: string, opts?: { sourcePath?: string }) => Promise<SaveResult>
    /** Same, for the workbook the comparative statement is also issued as. */
    workbook: (data: string, name: string, defaultPath?: string, opts?: { sourcePath?: string }) => Promise<SaveResult>
    /** Ask where to save, then write a PNG image there. */
    png: (data: string, name: string, defaultPath?: string, opts?: { sourcePath?: string }) => Promise<SaveResult>
    reveal: (path: string) => Promise<void>
  }
  update: {
    status: () => Promise<unknown>
    check: () => Promise<unknown>
    download: () => Promise<unknown>
    install: () => Promise<void>
    onChecking: (cb: () => void) => () => void
    onAvailable: (cb: (info: unknown) => void) => () => void
    onNotAvailable: (cb: (info: unknown) => void) => () => void
    onDownloadProgress: (cb: (p: { percent: number; bytesPerSecond: number }) => void) => () => void
    onDownloaded: (cb: (info: unknown) => void) => () => void
    onError: (cb: (msg: string) => void) => () => void
  }
}

declare global {
  interface Window {
    api: EestimateApi
  }
}

export {}
