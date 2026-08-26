import type { BundSection } from './project'

/**
 * Stability & seepage simulation for a bund component, powered by a headless
 * XSLOPE bridge (see BUND_SIMULATION_PLAN.md). Everything here is stored on
 * `BundData.simulation`, so it travels inside the `.eestimate` project and the
 * estimate itself is never touched by any result.
 */

export type BundSimulationCaseId =
  | 'construction' // IS 7894 Case I — end of construction, u = 0
  | 'partial-pool' // IS 7894 Case II — reservoir partial pool
  | 'drawdown-us' // IS 7894 Case III-A — sudden drawdown, u/s slope
  | 'drawdown-ds' // IS 7894 Case III-B — sudden tail-water drawdown, d/s slope
  | 'steady-seepage' // IS 7894 Case IV — reservoir full, d/s slope
  | 'rainfall' // IS 7894 Case V — steady seepage with sustained rainfall
  | 'quake-seepage' // IS 7894 Case VI-A — earthquake during steady seepage
  | 'quake-full' // IS 7894 Case VI-B — earthquake with reservoir full

/**
 * IS 7894:1975 case families with their minimum desired factors of safety.
 * Thresholds live here — configuration data, never scattered UI literals — and
 * each stored run records the requiredFs it was judged against.
 */
export const BUND_SIMULATION_CASES: Record<
  BundSimulationCaseId,
  {
    label: string
    short: string
    slope: string
    requiredFs: number
    /** How the pore-pressure field behind the run is established. */
    treatment: string
    /** True when the case needs a solved seepage field. */
    seepage: boolean
  }
> = {
  construction: {
    label: 'Case I — End of construction',
    short: 'Case I',
    slope: 'Upstream and downstream',
    requiredFs: 1.0,
    treatment: 'End of construction (u = 0, total stress)',
    seepage: false
  },
  'partial-pool': {
    label: 'Case II — Reservoir partial pool',
    short: 'Case II',
    slope: 'Upstream',
    requiredFs: 1.3,
    treatment: 'Steady seepage at the trial pool level',
    seepage: true
  },
  'drawdown-us': {
    label: 'Case III-A — Sudden drawdown (upstream)',
    short: 'Case III-A',
    slope: 'Upstream',
    requiredFs: 1.3,
    treatment: 'Staged rapid drawdown: max-pool field held, pool dropped',
    seepage: true
  },
  'drawdown-ds': {
    label: 'Case III-B — Sudden tail-water drawdown',
    short: 'Case III-B',
    slope: 'Downstream',
    requiredFs: 1.3,
    treatment: 'Staged rapid drawdown: reservoir full, tail dropped',
    seepage: true
  },
  'steady-seepage': {
    label: 'Case IV — Steady seepage, reservoir full',
    short: 'Case IV',
    slope: 'Downstream',
    requiredFs: 1.5,
    treatment: 'Steady finite-element seepage coupled to stability',
    seepage: true
  },
  rainfall: {
    label: 'Case V — Steady seepage with sustained rainfall',
    short: 'Case V',
    slope: 'Downstream',
    requiredFs: 1.3,
    treatment: 'Steady seepage with the d/s face held saturated to the entered level',
    seepage: true
  },
  'quake-seepage': {
    label: 'Case VI-A — Earthquake, steady seepage',
    short: 'Case VI-A',
    slope: 'Downstream',
    requiredFs: 1.0,
    treatment: 'Steady seepage + pseudo-static horizontal seismic coefficient',
    seepage: true
  },
  'quake-full': {
    label: 'Case VI-B — Earthquake, reservoir full',
    short: 'Case VI-B',
    slope: 'Upstream',
    requiredFs: 1.0,
    treatment: 'Steady seepage + pseudo-static horizontal seismic coefficient',
    seepage: true
  }
}

/** The numerical family selected by the engineer for a run. */
export type BundSimulationAnalysisType = 'lem' | 'fem-ssrm'
/** The seven limit-equilibrium methods XSLOPE implements. */
export type BundSimulationLemMethod =
  | 'ordinary' // Ordinary / Fellenius
  | 'bishop' // Bishop simplified
  | 'janbu' // Janbu simplified
  | 'corps' // Corps of Engineers
  | 'lowe' // Lowe & Karafiath
  | 'spencer' // Spencer
  | 'mprice' // Morgenstern–Price

export type BundSimulationControls =
  | {
      analysisType: 'lem'
      method: BundSimulationLemMethod
      slices: number
    }
  | {
      analysisType: 'fem-ssrm'
      method: 'fem-ssrm'
      /** Target triangular finite-element size (m). */
      meshSizeM: number
      /** Strength-reduction factor bisection tolerance. */
      tolerance: number
      maxIterations: number
    }

/** Stable material purposes used to map editable rows onto solver polygons. */
export type BundSimulationMaterialRole =
  | 'embankment'
  | 'foundation'
  | 'hearting'
  | 'cutoff-trench'
  | 'rocktoe'
  | 'rocktoe-filter'

/**
 * The engineer-entered properties of one material zone. `role` is the stable
 * solver mapping while names stay free text. Legacy homogeneous rows still
 * migrate from [0] embankment fill and [1] foundation.
 */
export interface BundSimulationMaterial {
  /**
   * Added after the first homogeneous-only release. Older saved rows have no
   * role and are migrated by position ([0] fill, [1] foundation).
   */
  role?: BundSimulationMaterialRole
  name: string
  /** Moist unit weight (kN/m³). */
  gamma: number | null
  /** Saturated unit weight (kN/m³). */
  gammaSat: number | null
  /** Effective cohesion c′ (kPa). */
  cPrime: number | null
  /** Effective friction angle φ′ (degrees). */
  phiPrime: number | null
  /** Horizontal permeability kx (m/s); seepage cases only. */
  kx: number | null
  /** Vertical permeability ky (m/s); null = same as kx. */
  ky: number | null
  /** Young's modulus (kPa); used only by FEM/SSRM. */
  elasticModulusKpa: number | null
  /** Poisson's ratio; used only by FEM/SSRM. */
  poissonRatio: number | null
  /**
   * Rapid-drawdown parameters for low-permeability materials (XSLOPE staged
   * drawdown): drained cohesion intercept d (kPa) and friction angle ψ
   * (degrees) of the strength envelope that governs after drawdown. Required
   * for Case III runs; null = not entered.
   */
  rapidD?: number | null
  rapidPsi?: number | null
}

/** One non-overlapping XSLOPE polygon-sheet material block. */
export interface BundSimulationMaterialPolygon {
  role: BundSimulationMaterialRole
  /** Zero-based index into the request's materials array. */
  materialIndex: number
  points: [number, number][]
}

/**
 * Where the modelled foundation inputs came from. A repair cannot expose its
 * foundation, so the engineer's thickness/layers are `assumed` until they
 * attach a test or an approved report (`tested`). Assumed values run with a
 * visible warning; they never silently pass as investigation data.
 */
export type BundFoundationSource = 'assumed' | 'tested'

/** At-failure mesh + fields the renderer draws as a native FEM diagram. */
export interface BundFemField {
  nodes: [number, number][]
  triangles: [number, number, number][]
  dispMag?: number[]
  /** Per-node displacement components (m) for the deformed outline. */
  dispX?: number[]
  dispY?: number[]
  shearStrain?: number[]
  plastic?: boolean[]
  deformScale?: number
}

export interface BundFemRunResult {
  finalInterval: [number, number] | null
  failureCriterion: string
  iterations: number | null
  nodeCount: number | null
  elementCount: number | null
  maxDisplacementM: number | null
  field?: BundFemField
}

/** Seepage mesh + total-head field for XSLOPE-style filled-contour drawing. */
export interface BundSeepField {
  nodes: [number, number][]
  triangles: [number, number, number][]
  head: number[]
}

export interface BundSimulationRun {
  id: string
  createdAt: string
  caseId: BundSimulationCaseId
  sectionId: string
  chainage: number
  /** Absent only on results saved before analysis-type selection existed. */
  analysisType?: BundSimulationAnalysisType
  method: string
  slices: number
  requiredFs: number
  calculatedFs: number | null
  status: 'pass' | 'fail' | 'error' | 'not-evaluated'
  message?: string
  /**
   * Subcase label — e.g. the governing partial-pool level of a Case II run —
   * kept so history rows stay distinguishable.
   */
  subcase?: string
  /**
   * Runs executed together in one press (Case II's two pool levels) share a
   * group id and are shown as a single run with both results inside.
   */
  groupId?: string
  /**
   * The water/loading condition actually solved, recorded per run (plan §4:
   * every result carries its loading case and pore-pressure treatment).
   */
  treatment?: string
  engine: { name: string; version: string; bridgeVersion: number } | null
  criticalSurface: {
    center: [number, number] | null
    radius: number | null
    surface: [number, number][]
  } | null
  phreaticLine: [number, number][]
  /** Primary field: pre-drawdown for Case III, solved field otherwise. */
  seepField?: BundSeepField
  /** Post-drawdown boundary field used by the staged Case III procedure. */
  postDrawdownPhreaticLine?: [number, number][]
  postDrawdownSeepField?: BundSeepField
  /** Section outline sent to the engine, kept so old diagrams stay drawable. */
  geometry: {
    embankment: [number, number][]
    ground: [number, number][]
    /** Absent on results saved by the former profile-line bridge. */
    materialPolygons?: BundSimulationMaterialPolygon[]
  } | null
  warnings: string[]
  diagnostics: Record<string, unknown>
  femResult?: BundFemRunResult
  /** Geometry fingerprint at run time — stale results are kept but flagged. */
  geometryFingerprint: string
}

export interface BundSimulationData {
  schemaVersion: 1
  materials: BundSimulationMaterial[]
  foundationThicknessM: number
  /**
   * Status of the engineer-entered foundation model. Optional only so projects
   * saved before this field exist keep loading; normalization defaults them to
   * 'assumed'.
   */
  foundationSource?: BundFoundationSource
  /** Test/report/borehole reference supporting the modelled foundation. */
  foundationReference?: string
  /**
   * Case-specific water levels (plan §4/§D). Imported from the bund template
   * where available, editable here without touching the estimate. Optional
   * fields keep pre-case-matrix projects loading; normalization fills them.
   */
  water?: BundSimulationWaterInputs
  /** Pseudo-static seismic coefficients and their source (Cases VI-A/VI-B). */
  loading?: BundSimulationLoadingInputs
  /**
   * Analysis method chosen per case family (e.g. Spencer for drawdown,
   * Bishop for steady seepage). Keys are case ids, values are AnalysisChoice
   * strings; absent keys default to Bishop.
   */
  analysisChoices?: Partial<Record<BundSimulationCaseId, string>>
  results: BundSimulationRun[]
}

/** Engineer-editable water levels, imported from the design where available. */
export interface BundSimulationWaterInputs {
  /** Full tank / maximum reservoir level (m RL). */
  reservoirFull: number | null
  /** Maximum tail water level (m RL); null = no tail water modelled. */
  tailWaterMax: number | null
  /** Minimum tail water level (m RL); null = drains to the same as max. */
  tailWaterMin: number | null
  /** Minimum head-water level after sudden drawdown (m RL). */
  minHeadwater: number | null
  /**
   * Sustained-rainfall saturation level held on the d/s face (m RL). The
   * adopted rainfall boundary condition — never invented by the app.
   */
  rainfallLevel: number | null
}

/** Pseudo-static earthquake inputs for Cases VI-A/VI-B. */
export interface BundSimulationLoadingInputs {
  /** Horizontal seismic coefficient (fraction of g). */
  kh: number
  /** Vertical seismic coefficient — recorded; the engine applies kh only. */
  kv: number
  /** Where the coefficients came from (code clause, departmental memo…). */
  source?: string
}

/** Inputs the tab derives purely from the live bund template. */
export interface BundSimulationContext {
  section: BundSection | null
}
