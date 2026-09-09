import type { BundData, BundSection } from '../types/project'
import type {
  BundSimulationAnalysisType,
  BundFoundationSource,
  BundSimulationCaseId,
  BundSimulationControls,
  BundSimulationData,
  BundSimulationMaterial,
  BundSimulationMaterialPolygon,
  BundSimulationMaterialRole,
  BundSimulationRun,
  BundSimulationWaterInputs
} from '../types/bundSimulation'
import { BUND_SIMULATION_CASES } from '../types/bundSimulation'
import { applySoilPreset } from './bundSoilPresets'
import {
  downstreamDesignToePointAt,
  downstreamToeFaceSlope,
  heartingTrenchEnabled,
  heartingTrenchTopWidth,
  resolvedHeartingTrenchDepth,
  projectedProfile,
  rockToeBaseWidth,
  rockToeFilterBehindThicknessM,
  rockToeFilterBelowThicknessM,
  rockToeHeightAt
} from './bund'

/**
 * Pure bridge between the bund quantity engine and the stability simulation:
 * the cross-section sent to XSLOPE is derived here from exactly the same
 * functions the estimate uses, so the simulation can never describe a
 * different section than the drawings and quantities. Kept framework-free so
 * `.cjs` tests load it directly.
 */

export const BUND_SIMULATION_SCHEMA_VERSION = 1

type LemControls = Extract<BundSimulationControls, { analysisType: 'lem' }>
type FemControls = Extract<BundSimulationControls, { analysisType: 'fem-ssrm' }>

/** Narrowly typed so discriminated-union narrowing survives their use. */
export const DEFAULT_LEM_CONTROLS: LemControls = {
  analysisType: 'lem',
  method: 'ordinary',
  slices: 40
}

export const DEFAULT_FEM_CONTROLS: FemControls = {
  analysisType: 'fem-ssrm',
  method: 'fem-ssrm',
  meshSizeM: 2,
  tolerance: 0.02,
  maxIterations: 3000
}

/** Margin of ground modelled beyond each toe (m). */
const GROUND_MARGIN = 20
const GEOMETRY_EPSILON = 1e-7

export function defaultBundSimulationMaterials(): BundSimulationMaterial[] {
  return [
    {
      role: 'embankment',
      name: 'Embankment fill',
      gamma: 18,
      gammaSat: 19.5,
      cPrime: 12,
      phiPrime: 26,
      kx: 1e-4,
      ky: null,
      elasticModulusKpa: 30000,
      poissonRatio: 0.3
    },
    {
      role: 'foundation',
      name: 'Foundation',
      gamma: 18.5,
      gammaSat: 19.8,
      cPrime: 8,
      phiPrime: 30,
      kx: 1e-3,
      ky: null,
      elasticModulusKpa: 40000,
      poissonRatio: 0.3
    }
  ]
}

function defaultMaterialForRole(
  role: BundSimulationMaterialRole,
  zoned: boolean
): BundSimulationMaterial {
  if (role === 'embankment') {
    return {
      ...defaultBundSimulationMaterials()[0],
      role,
      name: zoned ? 'Casing / shell fill' : 'Embankment fill'
    }
  }
  if (role === 'foundation') return defaultBundSimulationMaterials()[1]
  if (role === 'hearting') {
    return {
      role,
      name: 'Impervious hearting',
      gamma: 19,
      gammaSat: 20,
      cPrime: 15,
      phiPrime: 22,
      kx: 1e-7,
      ky: null,
      elasticModulusKpa: 25000,
      poissonRatio: 0.32
    }
  }
  if (role === 'rocktoe') {
    return {
      role,
      name: 'Rubble rock toe',
      gamma: 20,
      gammaSat: 21,
      cPrime: 0,
      phiPrime: 40,
      kx: 1e-2,
      ky: null,
      elasticModulusKpa: 50000,
      poissonRatio: 0.28
    }
  }
  if (role === 'rocktoe-filter') {
    return {
      role,
      name: 'Graded rock-toe filter',
      gamma: 18,
      gammaSat: 20,
      cPrime: 0,
      phiPrime: 35,
      kx: 1e-3,
      ky: null,
      elasticModulusKpa: 30000,
      poissonRatio: 0.3
    }
  }
  return {
    role,
    name: 'Cut-off trench backfill',
    gamma: 19,
    gammaSat: 20,
    cPrime: 15,
    phiPrime: 22,
    kx: 1e-7,
    ky: null,
    elasticModulusKpa: 25000,
    poissonRatio: 0.32
  }
}

/**
 * Give every active zone one stable material row while preserving legacy and
 * engineer-edited values. The first release stored only two unlabelled rows,
 * so those continue to map by position to embankment and foundation.
 */
export function simulationMaterialsForBund(
  data: BundData,
  stored: BundSimulationMaterial[] = []
): BundSimulationMaterial[] {
  const zoned = data.embankmentType === 'zoned'
  const roles: BundSimulationMaterialRole[] = ['embankment', 'foundation']
  if (zoned) roles.push('hearting')
  if (zoned && heartingTrenchEnabled(data)) roles.push('cutoff-trench')
  if (data.rockToeMaterial) roles.push('rocktoe')
  if (data.rockToeMaterial && data.rockToeFilterMaterial) roles.push('rocktoe-filter')

  const byRole = new Map<BundSimulationMaterialRole, BundSimulationMaterial>()
  for (const material of stored) {
    if (material.role) byRole.set(material.role, material)
  }
  const legacyByRole: Partial<Record<BundSimulationMaterialRole, BundSimulationMaterial>> = {
    embankment: stored[0],
    foundation: stored[1],
    hearting: stored[2],
    'cutoff-trench': stored[3]
  }
  return roles.map((role) => {
    const saved = byRole.get(role) ?? legacyByRole[role]
    const defaults = defaultMaterialForRole(role, zoned)
    const designReference =
      role === 'rocktoe'
        ? data.rockToeMaterial
        : role === 'rocktoe-filter'
        ? data.rockToeFilterMaterial
        : null
    const material: BundSimulationMaterial = {
      ...defaults,
      ...(!saved && designReference
        ? {
            name:
              designReference.description?.trim() ||
              `${defaults.name} (${designReference.code})`
          }
        : {}),
      ...(saved ?? {}),
      role
    }
    const selectedPresetId =
      zoned && role === 'embankment'
        ? data.casingSoilType
        : !zoned && role === 'embankment'
          ? data.homogeneousSoilType
        : zoned && (role === 'hearting' || role === 'cutoff-trench')
          ? data.heartingSoilType
          : null
    return selectedPresetId &&
      (!saved ||
        (saved.propertiesSource === 'preliminary-default' &&
          saved.soilPresetId !== selectedPresetId))
      ? applySoilPreset(material, selectedPresetId, role)
      : material
  })
}

export function defaultBundSimulationData(): BundSimulationData {
  return {
    schemaVersion: 1,
    materials: defaultBundSimulationMaterials(),
    foundationThicknessM: 10,
    foundationSource: 'assumed',
    foundationReference: '',
    water: defaultBundSimulationWaterInputs(),
    loading: { kh: 0, kv: 0, source: '' },
    analysisChoices: {},
    results: []
  }
}

/**
 * Water levels imported from the bund template where they exist. Tail-water,
 * drawdown and rainfall levels have no template source — the engineer enters
 * them per the investigation; the app never invents them.
 */
export function defaultBundSimulationWaterInputs(): BundSimulationWaterInputs {
  return {
    reservoirFull: null,
    tailWaterMax: null,
    tailWaterMin: null,
    minHeadwater: null,
    rainfallLevel: null
  }
}

/** Migrate/complete saved simulation inputs for the live bund configuration. */
export function normalizeBundSimulationData(
  data: BundData,
  stored?: BundSimulationData
): BundSimulationData {
  const base = stored ?? defaultBundSimulationData()
  return {
    schemaVersion: 1,
    materials: simulationMaterialsForBund(data, stored ? base.materials : []),
    foundationThicknessM:
      Number.isFinite(base.foundationThicknessM)
        ? base.foundationThicknessM
        : 10,
    // Projects saved before the field existed ran on engineer-entered
    // (untested) foundation inputs; keep calling them what they are.
    foundationSource:
      base.foundationSource === 'tested' ? 'tested' : 'assumed',
    foundationReference: base.foundationReference ?? '',
    water: {
      ...defaultBundSimulationWaterInputs(),
      ...(base.water ?? {}),
      // The full level defaults from the template until overridden.
      reservoirFull:
        base.water?.reservoirFull ?? simulationReservoirLevel(data)
    },
    loading: {
      kh: Number.isFinite(base.loading?.kh) ? (base.loading?.kh as number) : 0,
      kv: Number.isFinite(base.loading?.kv) ? (base.loading?.kv as number) : 0,
      source: base.loading?.source ?? ''
    },
    analysisChoices:
      base.analysisChoices && typeof base.analysisChoices === 'object'
        ? base.analysisChoices
        : {},
    results: Array.isArray(base.results) ? base.results : []
  }
}

/**
 * Add completed runs to the latest simulation record. `current` deliberately
 * wins over the run-start fallback for every editable input, so a background
 * result cannot roll back material, water, foundation or Design-side changes.
 */
export function mergeBundSimulationRuns(
  current: BundSimulationData | undefined,
  fallback: BundSimulationData,
  incoming: BundSimulationRun[],
  historyLimit = 40
): BundSimulationData {
  const existing = current?.results ?? fallback.results
  const incomingIds = new Set(incoming.map((run) => run.id))
  return {
    ...fallback,
    ...current,
    schemaVersion: BUND_SIMULATION_SCHEMA_VERSION,
    results: [
      ...existing.filter((run) => !incomingIds.has(run.id)),
      ...incoming
    ].slice(-historyLimit)
  }
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function simplifyLine(points: [number, number][]): [number, number][] {
  const byOffset = new Map<number, [number, number]>()
  for (const [x, y] of points) byOffset.set(round3(x), [round3(x), round3(y)])
  const sorted = [...byOffset.values()].sort((a, b) => a[0] - b[0])
  if (sorted.length <= 2) return sorted
  const out: [number, number][] = [sorted[0]]
  for (let index = 1; index < sorted.length - 1; index += 1) {
    const a = out[out.length - 1]
    const b = sorted[index]
    const c = sorted[index + 1]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) > 1e-7) out.push(b)
  }
  out.push(sorted[sorted.length - 1])
  return out
}

/** The proposed outline as [offset, rl] pairs, u/s → d/s. */
export function simulationEmbankmentLine(
  data: BundData,
  section: BundSection
): [number, number][] | null {
  const profile = projectedProfile(section, data.design)
  if (!profile || profile.length < 2) return null
  return simplifyLine(profile.map((p) => [round3(p.offset), round3(p.rl)]))
}

/**
 * The surface the simulated embankment seats on, spanning past both proposed
 * toes.
 *
 * New work knows its construction geometry: the support is the prepared
 * formation base (existing ground less the strip), clamped below the finished
 * outline so the model can never float above the bund it carries.
 *
 * A restoration survey describes the bund being repaired; it is not another
 * solver layer. Closing the finished outline against that surveyed line made a
 * bow-tie whenever existing earth crossed the proposal. The model therefore
 * seats the proposed bund at its two toes and carries a conservative lower
 * support through its interior vertices. This touches both toes and can never
 * cross above the proposed outline. In both modes the engineer-entered
 * foundation thickness and properties below this line are what the solver sees.
 */
export function simulationGroundLine(
  data: BundData,
  section: BundSection
): [number, number][] | null {
  const embankment = simulationEmbankmentLine(data, section)
  if (!embankment) return null
  const left = Math.min(...embankment.map((p) => p[0])) - GROUND_MARGIN
  const right = Math.max(...embankment.map((p) => p[0])) + GROUND_MARGIN
  const outlineMin = Math.min(...embankment.map((point) => point[1]))
  let supportRl = outlineMin
  if (data.mode === 'new' && section.groundLevel != null) {
    const formation = section.groundLevel - data.design.stripDepth
    if (Number.isFinite(formation)) {
      supportRl = Math.min(formation, outlineMin)
    }
  }
  const support: [number, number][] = embankment.map(([x, y], index) => [
    x,
    index === 0 || index === embankment.length - 1 ? y : supportRl
  ])
  return simplifyLine([
    [round3(left), embankment[0][1]],
    ...support,
    [round3(right), embankment[embankment.length - 1][1]]
  ])
}

/** Reservoir surface the seepage boundary conditions are drawn to. */
export function simulationReservoirLevel(data: BundData): number | null {
  return data.design.ftl ?? data.design.mwl ?? null
}

function lineLevelAt(line: [number, number][], x: number): number {
  if (line.length === 0) return Number.NaN
  if (x <= line[0][0]) return line[0][1]
  if (x >= line[line.length - 1][0]) return line[line.length - 1][1]
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1]
    const b = line[index]
    if (x > b[0] + GEOMETRY_EPSILON) continue
    const span = b[0] - a[0]
    if (span <= GEOMETRY_EPSILON) return b[1]
    return a[1] + ((x - a[0]) / span) * (b[1] - a[1])
  }
  return line[line.length - 1][1]
}

function polygonArea(points: [number, number][]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    twiceArea += points[index][0] * next[1] - next[0] * points[index][1]
  }
  return Math.abs(twiceArea) / 2
}

function bandPolygon(
  from: number,
  to: number,
  lowerFrom: number,
  lowerTo: number,
  upperFrom: number,
  upperTo: number
): [number, number][] | null {
  if (to <= from + GEOMETRY_EPSILON) return null
  const raw: [number, number][] = [
    [round3(from), round3(lowerFrom)],
    [round3(from), round3(upperFrom)],
    [round3(to), round3(upperTo)],
    [round3(to), round3(lowerTo)]
  ]
  const points = raw.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point[0] - raw[index - 1][0]) > GEOMETRY_EPSILON ||
      Math.abs(point[1] - raw[index - 1][1]) > GEOMETRY_EPSILON
  )
  if (
    points.length >= 2 &&
    Math.abs(points[0][0] - points[points.length - 1][0]) <= GEOMETRY_EPSILON &&
    Math.abs(points[0][1] - points[points.length - 1][1]) <= GEOMETRY_EPSILON
  ) {
    points.pop()
  }
  return points.length >= 3 && polygonArea(points) > GEOMETRY_EPSILON ? points : null
}

export interface BundSimulationRockToeZones {
  /** Rubble trapezium that replaces the lower downstream shell. */
  rockToe: [number, number][]
  /** Combined 0.50 m graded filter band behind the inner rock-toe face. */
  filterBehind: [number, number][] | null
  /** Combined 1.00 m graded filter bed below the rock-toe base. */
  filterBelow: [number, number][] | null
  /** Free-draining outlet where the rock toe meets the downstream design toe. */
  outlet: [number, number]
}

/**
 * Solver geometry for the design's enabled rock toe and CAW-5-11 filter.
 * Dimensions come from the same helpers/constants used by the quantity and
 * assembly drawings; Simulation never owns a duplicate height or thickness.
 */
export function simulationRockToeZones(
  data: BundData,
  section: BundSection
): BundSimulationRockToeZones | null {
  if (!data.rockToeMaterial) return null
  const toe = downstreamDesignToePointAt(section, data)
  const height = rockToeHeightAt(section, data)
  if (!toe || height <= GEOMETRY_EPSILON) return null

  const outerSlope = downstreamToeFaceSlope(section, data)
  const outerX = toe.offset
  const innerX = outerX - rockToeBaseWidth(height, data, outerSlope)
  const crestInnerX = innerX + Math.max(0, data.rockToeInnerSlope) * height
  const crestOuterX = crestInnerX + Math.max(0, data.rockToeTopWidth)
  const crestRl = toe.rl + height
  const rockToe: [number, number][] = [
    [round3(innerX), round3(toe.rl)],
    [round3(crestInnerX), round3(crestRl)],
    [round3(crestOuterX), round3(crestRl)],
    [round3(outerX), round3(toe.rl)]
  ]
  if (polygonArea(rockToe) <= GEOMETRY_EPSILON) return null

  let filterBehind: [number, number][] | null = null
  let filterBelow: [number, number][] | null = null
  if (data.rockToeFilterMaterial) {
    const behindThickness = rockToeFilterBehindThicknessM(data)
    const belowThickness = rockToeFilterBelowThicknessM(data)
    // Offset the inner face normally into the embankment so its area is the
    // design thickness times the true sloping-face length.
    const dx = crestInnerX - innerX
    const dy = height
    const faceLength = Math.hypot(dx, dy)
    if (faceLength > GEOMETRY_EPSILON) {
      const nx = -dy / faceLength
      const ny = dx / faceLength
      const ox = nx * behindThickness
      const oy = ny * behindThickness
      filterBehind = [
        [round3(innerX + ox), round3(toe.rl + oy)],
        [round3(crestInnerX + ox), round3(crestRl + oy)],
        [round3(crestInnerX), round3(crestRl)],
        [round3(innerX), round3(toe.rl)]
      ]
    }
    filterBelow = [
      [round3(innerX), round3(toe.rl - belowThickness)],
      [round3(innerX), round3(toe.rl)],
      [round3(outerX), round3(toe.rl)],
      [round3(outerX), round3(toe.rl - belowThickness)]
    ]
  }

  return {
    rockToe,
    filterBehind,
    filterBelow,
    outlet: [round3(outerX), round3(toe.rl)]
  }
}

/** Vertical slice through a simple polygon at x, including vertex/vertical edges. */
function polygonVerticalInterval(
  polygon: [number, number][],
  x: number
): [number, number] | null {
  const ys: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const lo = Math.min(a[0], b[0]) - GEOMETRY_EPSILON
    const hi = Math.max(a[0], b[0]) + GEOMETRY_EPSILON
    if (x < lo || x > hi) continue
    const dx = b[0] - a[0]
    if (Math.abs(dx) <= GEOMETRY_EPSILON) {
      if (Math.abs(x - a[0]) <= GEOMETRY_EPSILON) ys.push(a[1], b[1])
      continue
    }
    const t = (x - a[0]) / dx
    if (t >= -GEOMETRY_EPSILON && t <= 1 + GEOMETRY_EPSILON) {
      ys.push(a[1] + t * (b[1] - a[1]))
    }
  }
  if (!ys.length) return null
  return [Math.min(...ys), Math.max(...ys)]
}

/** X offsets where a polygon edge crosses a model boundary polyline. */
function polygonLineIntersectionOffsets(
  polygon: [number, number][],
  line: [number, number][]
): number[] {
  const out: number[] = []
  const cross = (a: [number, number], b: [number, number]): number =>
    a[0] * b[1] - a[1] * b[0]
  for (let pIndex = 0; pIndex < polygon.length; pIndex += 1) {
    const a = polygon[pIndex]
    const b = polygon[(pIndex + 1) % polygon.length]
    const r: [number, number] = [b[0] - a[0], b[1] - a[1]]
    for (let lIndex = 1; lIndex < line.length; lIndex += 1) {
      const c = line[lIndex - 1]
      const d = line[lIndex]
      const s: [number, number] = [d[0] - c[0], d[1] - c[1]]
      const denominator = cross(r, s)
      if (Math.abs(denominator) <= GEOMETRY_EPSILON) continue
      const ca: [number, number] = [c[0] - a[0], c[1] - a[1]]
      const t = cross(ca, s) / denominator
      const u = cross(ca, r) / denominator
      if (
        t >= -GEOMETRY_EPSILON &&
        t <= 1 + GEOMETRY_EPSILON &&
        u >= -GEOMETRY_EPSILON &&
        u <= 1 + GEOMETRY_EPSILON
      ) {
        out.push(round3(a[0] + t * r[0]))
      }
    }
  }
  return out
}

function uniqueOffsets(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite).map(round3))].sort((a, b) => a - b)
}

function newHeartingTopAt(data: BundData, x: number): number {
  const design = data.heartingDesign
  const left = design.centerOffset - design.topWidth / 2
  const right = design.centerOffset + design.topWidth / 2
  if (x >= left - GEOMETRY_EPSILON && x <= right + GEOMETRY_EPSILON) {
    return design.topLevel
  }
  if (x < left && design.usSlope > GEOMETRY_EPSILON) {
    return design.topLevel - (left - x) / design.usSlope
  }
  if (x > right && design.dsSlope > GEOMETRY_EPSILON) {
    return design.topLevel - (x - right) / design.dsSlope
  }
  return Number.NEGATIVE_INFINITY
}

function addLinearCrossings(
  offsets: number[],
  differenceAt: (x: number) => number
): number[] {
  const out = [...offsets]
  for (let index = 1; index < offsets.length; index += 1) {
    const from = offsets[index - 1]
    const to = offsets[index]
    const a = differenceAt(from)
    const b = differenceAt(to)
    if (!Number.isFinite(a) || !Number.isFinite(b) || a * b >= -1e-12) continue
    out.push(from + (a / (a - b)) * (to - from))
  }
  return uniqueOffsets(out)
}

function roleIndex(
  materials: BundSimulationMaterial[],
  role: BundSimulationMaterialRole
): number {
  return materials.findIndex((material) => material.role === role)
}

/**
 * Tile the section into non-overlapping polygon-sheet blocks. Vertical cells
 * keep every shared boundary numerically identical, which avoids both polygon
 * overlaps and the self-touching shell that a core-shaped hole would create.
 *
 * The hearting is mapped identically in new and repair modes: it runs from its
 * designed top down to the modelled foundation surface at the toes — the
 * complete finished proposed bund is analysed, never just the measured repair
 * bands above the surveyed profile. An enabled rock toe and its filter replace
 * the corresponding shell/foundation cells with the geometry already owned by
 * Design, so the solver receives one connected, non-overlapping material sheet.
 */
export function simulationMaterialPolygons(
  data: BundData,
  section: BundSection,
  materials: BundSimulationMaterial[],
  foundationThicknessM: number
): BundSimulationMaterialPolygon[] | null {
  const embankment = simulationEmbankmentLine(data, section)
  const ground = simulationGroundLine(data, section)
  if (!embankment || !ground || foundationThicknessM <= 0) return null

  const embankmentIndex = roleIndex(materials, 'embankment')
  const foundationIndex = roleIndex(materials, 'foundation')
  const zoned = data.embankmentType === 'zoned'
  const heartingIndex = roleIndex(materials, 'hearting')
  if (embankmentIndex < 0 || foundationIndex < 0 || (zoned && heartingIndex < 0)) {
    return null
  }

  const polygons: BundSimulationMaterialPolygon[] = []
  const roleCounts = new Map<BundSimulationMaterialRole, number>()
  const add = (
    role: BundSimulationMaterialRole,
    materialIndex: number,
    from: number,
    to: number,
    lowerFrom: number,
    lowerTo: number,
    upperFrom: number,
    upperTo: number
  ): boolean => {
    const points = bandPolygon(
      from,
      to,
      lowerFrom,
      lowerTo,
      upperFrom,
      upperTo
    )
    if (!points) return false
    polygons.push({ role, materialIndex, points })
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1)
    return true
  }

  interface VerticalZone {
    role: BundSimulationMaterialRole
    materialIndex: number
    intervalAt: (x: number) => [number, number] | null
  }

  /**
   * Tile one vertical cell from its lower to upper model boundary. Special
   * zones replace the default material; gaps remain the default. This lets a
   * filter bed cross the fill/foundation contact without overlap or a void.
   */
  const addTiledCell = (
    from: number,
    to: number,
    defaultRole: BundSimulationMaterialRole,
    defaultIndex: number,
    lowerAt: (x: number) => number,
    upperAt: (x: number) => number,
    zones: VerticalZone[]
  ): boolean => {
    const middle = (from + to) / 2
    const bounds = {
      from: [lowerAt(from), upperAt(from)] as [number, number],
      middle: [lowerAt(middle), upperAt(middle)] as [number, number],
      to: [lowerAt(to), upperAt(to)] as [number, number]
    }
    const clip = (
      raw: [number, number] | null,
      limit: [number, number]
    ): [number, number] | null => {
      if (!raw) return null
      const low = Math.max(limit[0], Math.min(raw[0], raw[1]))
      const high = Math.min(limit[1], Math.max(raw[0], raw[1]))
      return high >= low - GEOMETRY_EPSILON ? [low, Math.max(low, high)] : null
    }

    const active = zones
      .map((zone) => {
        const middleInterval = clip(zone.intervalAt(middle), bounds.middle)
        if (!middleInterval || middleInterval[1] <= middleInterval[0] + GEOMETRY_EPSILON) {
          return null
        }
        const fromInterval = clip(zone.intervalAt(from), bounds.from)
        const toInterval = clip(zone.intervalAt(to), bounds.to)
        if (!fromInterval || !toInterval) return null
        return {
          ...zone,
          from: fromInterval,
          middle: middleInterval,
          to: toInterval
        }
      })
      .filter(
        (
          zone
        ): zone is VerticalZone & {
          from: [number, number]
          middle: [number, number]
          to: [number, number]
        } => zone != null
      )
      .sort((a, b) => a.middle[0] - b.middle[0])

    let cursorFrom = bounds.from[0]
    let cursorMiddle = bounds.middle[0]
    let cursorTo = bounds.to[0]
    for (const zone of active) {
      if (
        zone.from[0] < cursorFrom - GEOMETRY_EPSILON ||
        zone.middle[0] < cursorMiddle - GEOMETRY_EPSILON ||
        zone.to[0] < cursorTo - GEOMETRY_EPSILON
      ) {
        return false
      }
      add(
        defaultRole,
        defaultIndex,
        from,
        to,
        cursorFrom,
        cursorTo,
        zone.from[0],
        zone.to[0]
      )
      add(
        zone.role,
        zone.materialIndex,
        from,
        to,
        zone.from[0],
        zone.to[0],
        zone.from[1],
        zone.to[1]
      )
      cursorFrom = zone.from[1]
      cursorMiddle = zone.middle[1]
      cursorTo = zone.to[1]
    }
    add(
      defaultRole,
      defaultIndex,
      from,
      to,
      cursorFrom,
      cursorTo,
      bounds.from[1],
      bounds.to[1]
    )
    return true
  }

  const rockToeZones = simulationRockToeZones(data, section)
  const rockToeIndex = roleIndex(materials, 'rocktoe')
  const rockToeFilterIndex = roleIndex(materials, 'rocktoe-filter')
  if (rockToeZones && rockToeIndex < 0) return null
  if (rockToeZones?.filterBelow && rockToeFilterIndex < 0) return null
  const rockToeFilterPolygons = rockToeZones
    ? [rockToeZones.filterBehind, rockToeZones.filterBelow].filter(
        (polygon): polygon is [number, number][] => polygon != null
      )
    : []
  const specialPolygons = [
    ...(rockToeZones ? [rockToeZones.rockToe] : []),
    ...rockToeFilterPolygons
  ]

  let fillOffsets = uniqueOffsets([
    ...embankment.map(([x]) => x),
    ...specialPolygons.flatMap((polygon) => polygon.map(([x]) => x)),
    ...specialPolygons.flatMap((polygon) => [
      ...polygonLineIntersectionOffsets(polygon, embankment),
      ...polygonLineIntersectionOffsets(polygon, ground)
    ])
  ])
  const fillLeft = embankment[0][0]
  const fillRight = embankment[embankment.length - 1][0]
  if (zoned) {
    // Split cells on the hearting's flat-top edges and wherever its sloping
    // sides cross the finished outline or the modelled foundation surface, so
    // every polygon boundary between zones stays piecewise linear and shared.
    const design = data.heartingDesign
    const left = design.centerOffset - design.topWidth / 2
    const right = design.centerOffset + design.topWidth / 2
    fillOffsets = uniqueOffsets([
      ...fillOffsets,
      ...(left > fillLeft && left < fillRight ? [left] : []),
      ...(right > fillLeft && right < fillRight ? [right] : [])
    ])
    fillOffsets = addLinearCrossings(
      fillOffsets,
      (x) => newHeartingTopAt(data, x) - lineLevelAt(ground, x)
    )
    fillOffsets = addLinearCrossings(
      fillOffsets,
      (x) => newHeartingTopAt(data, x) - lineLevelAt(embankment, x)
    )
  }

  const fillZones: VerticalZone[] = []
  if (zoned) {
    fillZones.push({
      role: 'hearting',
      materialIndex: heartingIndex,
      intervalAt: (x) => {
        const base = lineLevelAt(ground, x)
        const outer = lineLevelAt(embankment, x)
        const top = Math.max(base, Math.min(outer, newHeartingTopAt(data, x)))
        // Keep the zero-thickness contact at each toe of the hearting. The
        // tiler decides whether a zone is active from the cell midpoint, but
        // it still needs both endpoint intervals to form the first/last
        // triangular wing. Returning null here used to discard those entire
        // cells and leave only the narrow central part of the core.
        return [base, top]
      }
    })
  }
  if (rockToeZones) {
    fillZones.push({
      role: 'rocktoe',
      materialIndex: rockToeIndex,
      intervalAt: (x) => polygonVerticalInterval(rockToeZones.rockToe, x)
    })
  }
  for (const filterPolygon of rockToeFilterPolygons) {
    fillZones.push({
      role: 'rocktoe-filter',
      materialIndex: rockToeFilterIndex,
      intervalAt: (x) => polygonVerticalInterval(filterPolygon, x)
    })
  }

  for (let index = 1; index < fillOffsets.length; index += 1) {
    const from = fillOffsets[index - 1]
    const to = fillOffsets[index]
    if (!addTiledCell(
      from,
      to,
      'embankment',
      embankmentIndex,
      (x) => lineLevelAt(ground, x),
      (x) => lineLevelAt(embankment, x),
      fillZones
    )) return null
  }
  if (zoned) {
    // Design draws and measures the complete core trapezoid even where it
    // rises above the finished casing — a hearting top above the crest, or a
    // flat top reaching past the crest edge. Clipping the zone to the outline
    // used to amputate those parts and hand the solver a cored-down hearting.
    // Emit the protruding wedges on the same cell grid so the analysed sheet
    // equals the Design polygon area for granted.
    for (let index = 1; index < fillOffsets.length; index += 1) {
      const from = fillOffsets[index - 1]
      const to = fillOffsets[index]
      const outerFrom = lineLevelAt(embankment, from)
      const outerTo = lineLevelAt(embankment, to)
      const coreFrom = Math.max(lineLevelAt(ground, from), newHeartingTopAt(data, from))
      const coreTo = Math.max(lineLevelAt(ground, to), newHeartingTopAt(data, to))
      const points = bandPolygon(
        from,
        to,
        outerFrom,
        outerTo,
        Math.max(outerFrom, coreFrom),
        Math.max(outerTo, coreTo)
      )
      if (!points) continue
      polygons.push({ role: 'hearting', materialIndex: heartingIndex, points })
      roleCounts.set('hearting', (roleCounts.get('hearting') ?? 0) + 1)
    }
  }
  if (zoned && (roleCounts.get('hearting') ?? 0) === 0) return null

  const trenchOn = heartingTrenchEnabled(data)
  const trenchIndex = roleIndex(materials, 'cutoff-trench')
  const groundMin = Math.min(...ground.map((point) => point[1]))
  const foundationBottom = groundMin - foundationThicknessM
  if (
    rockToeZones?.filterBelow &&
    Math.min(...rockToeZones.filterBelow.map((point) => point[1])) <
      foundationBottom - GEOMETRY_EPSILON
  ) {
    return null
  }
  let foundationOffsets = uniqueOffsets([
    ...ground.map(([x]) => x),
    ...specialPolygons.flatMap((polygon) => polygon.map(([x]) => x)),
    ...specialPolygons.flatMap((polygon) =>
      polygonLineIntersectionOffsets(polygon, ground)
    )
  ])
  let trench:
    | {
        leftTop: number
        leftBottom: number
        rightBottom: number
        rightTop: number
        invertRl: number
      }
    | null = null

  if (trenchOn) {
    if (trenchIndex < 0) return null
    const depth = resolvedHeartingTrenchDepth(data)
    const halfTop = heartingTrenchTopWidth(data) / 2
    const leftTop = data.heartingDesign.centerOffset - halfTop
    const rightTop = data.heartingDesign.centerOffset + halfTop
    const leftBottom = leftTop + Math.max(0, data.heartingTrench.usSlope) * depth
    const rightBottom = rightTop - Math.max(0, data.heartingTrench.dsSlope) * depth
    const invertRl = lineLevelAt(ground, data.heartingDesign.centerOffset) - depth
    if (
      leftTop <= ground[0][0] ||
      rightTop >= ground[ground.length - 1][0] ||
      leftBottom > rightBottom + GEOMETRY_EPSILON ||
      invertRl <= foundationBottom + GEOMETRY_EPSILON
    ) {
      return null
    }
    trench = { leftTop, leftBottom, rightBottom, rightTop, invertRl }
    foundationOffsets = uniqueOffsets([
      ...foundationOffsets,
      leftTop,
      leftBottom,
      rightBottom,
      rightTop
    ])
  }

  const trenchLowerAt = (x: number): number => {
    if (!trench) return Number.NaN
    if (x <= trench.leftBottom) {
      const top = lineLevelAt(ground, trench.leftTop)
      const span = trench.leftBottom - trench.leftTop
      return span <= GEOMETRY_EPSILON
        ? trench.invertRl
        : top + ((x - trench.leftTop) / span) * (trench.invertRl - top)
    }
    if (x <= trench.rightBottom) return trench.invertRl
    const top = lineLevelAt(ground, trench.rightTop)
    const span = trench.rightTop - trench.rightBottom
    return span <= GEOMETRY_EPSILON
      ? trench.invertRl
      : trench.invertRl + ((x - trench.rightBottom) / span) * (top - trench.invertRl)
  }

  const foundationZones: VerticalZone[] = []
  if (trench) {
    foundationZones.push({
      role: 'cutoff-trench',
      materialIndex: trenchIndex,
      intervalAt: (x) => {
        if (!trench || x < trench.leftTop - GEOMETRY_EPSILON || x > trench.rightTop + GEOMETRY_EPSILON) {
          return null
        }
        const top = lineLevelAt(ground, x)
        return [Math.min(top, trenchLowerAt(x)), top]
      }
    })
  }
  if (rockToeZones) {
    foundationZones.push({
      role: 'rocktoe',
      materialIndex: rockToeIndex,
      intervalAt: (x) => polygonVerticalInterval(rockToeZones.rockToe, x)
    })
  }
  for (const filterPolygon of rockToeFilterPolygons) {
    foundationZones.push({
      role: 'rocktoe-filter',
      materialIndex: rockToeFilterIndex,
      intervalAt: (x) => polygonVerticalInterval(filterPolygon, x)
    })
  }

  for (let index = 1; index < foundationOffsets.length; index += 1) {
    const from = foundationOffsets[index - 1]
    const to = foundationOffsets[index]
    if (!addTiledCell(
      from,
      to,
      'foundation',
      foundationIndex,
      () => foundationBottom,
      (x) => lineLevelAt(ground, x),
      foundationZones
    )) return null
  }

  if (rockToeZones && (roleCounts.get('rocktoe') ?? 0) === 0) return null
  if (rockToeZones?.filterBelow && (roleCounts.get('rocktoe-filter') ?? 0) === 0) return null

  return polygons
}

export interface BundSimulationEngineRequest {
  schemaVersion: number
  runId: string
  case: BundSimulationCaseId
  geometry: {
    ground: [number, number][]
    embankment: [number, number][]
    materialPolygons: BundSimulationMaterialPolygon[]
  }
  water: {
    reservoirLevel?: number | null
    tailWaterMax?: number | null
    tailWaterMin?: number | null
    minHeadwater?: number | null
    rainfallLevel?: number | null
    foundationThicknessM: number
  }
  /** Pseudo-static seismic coefficients (Cases VI-A/VI-B). */
  loading?: { kh: number; kv: number; source?: string }
  /** Which slope the case checks — restricts the slip-circle search face. */
  slope: 'upstream' | 'downstream' | 'both'
  /** Status of the engineer-entered foundation model behind this run. */
  foundationSource?: BundFoundationSource
  foundationReference?: string
  materials: Record<string, unknown>[]
  controls: BundSimulationControls
}

/**
 * One executable solver job. Case II runs once per trial pool level, so a
 * case expands to jobs through `subcase`.
 */
export interface BundSimulationJob {
  caseId: BundSimulationCaseId
  /** Subcase label recorded on the run (e.g. "pool at 102.3 m"). */
  subcase: string | null
  /** Pool level this job solves seepage for (partial-pool subcases). */
  reservoirLevel: number | null
  /** True when a derived trial pool is physically meaningless (skip it). */
  invalid?: boolean
}

/** Only Case II depends on a pool level derived while expanding its jobs. */
export function isUnresolvedPartialPoolJob(job: BundSimulationJob): boolean {
  return job.caseId === 'partial-pool' && job.reservoirLevel == null
}

/**
 * Expand selected cases into solver jobs. Case II produces one job per trial
 * pool — approximately one-third and two-thirds of the head above the u/s toe
 * (ground) level, never from a tail-water entry that may sit far below the
 * section. Pools that would fall below the ground surface or at/above the
 * crest are physically meaningless and are skipped by the caller.
 */
export function caseJobs(
  caseId: BundSimulationCaseId,
  water: BundSimulationWaterInputs,
  groundLevel: number | null,
  crestLevel: number | null = null
): BundSimulationJob[] {
  if (caseId === 'partial-pool') {
    const full = water.reservoirFull
    // The pool rises up the u/s face from its toe — the ground level. A
    // tail-water entry is a d/s feature and must not drag the trial pools
    // below the section (the singular-solve failure mode).
    const base = groundLevel
    if (full == null || base == null || full <= base) {
      return [{ caseId, subcase: null, reservoirLevel: null }]
    }
    const levels = [base + (full - base) / 3, base + ((full - base) * 2) / 3]
    return levels.map((level, index) => {
      // A pool at/above the crest submerges the whole bund — not a partial
      // pool; below the ground surface submerges nothing. Flag either for the
      // caller to skip with a clear message.
      const invalid =
        level <= base + 1e-6 || (crestLevel != null && level >= crestLevel - 1e-6)
      return {
        caseId,
        subcase: invalid
          ? `pool at ${level.toFixed(2)} m (invalid)`
          : `pool at ${level.toFixed(2)} m (${index === 0 ? '⅓' : '⅔'} head)`,
        reservoirLevel: level,
        invalid
      }
    })
  }
  return [{ caseId, subcase: null, reservoirLevel: null }]
}

/** The slope face a case's slip-circle search must stay on. */
export function caseSlopeSearch(
  caseId: BundSimulationCaseId
): 'upstream' | 'downstream' | 'both' {
  const slope = BUND_SIMULATION_CASES[caseId].slope
  if (slope === 'Upstream') return 'upstream'
  if (slope === 'Downstream') return 'downstream'
  return 'both'
}

export function buildBundSimulationRequest(
  data: BundData,
  section: BundSection,
  sim: Pick<
    BundSimulationData,
    | 'materials'
    | 'foundationThicknessM'
    | 'foundationSource'
    | 'foundationReference'
    | 'water'
    | 'loading'
  >,
  caseId: BundSimulationCaseId,
  runId: string,
  controls: BundSimulationControls = DEFAULT_LEM_CONTROLS,
  job: BundSimulationJob | null = null
): BundSimulationEngineRequest | null {
  const embankment = simulationEmbankmentLine(data, section)
  const ground = simulationGroundLine(data, section)
  if (!embankment || !ground) return null
  const materials = simulationMaterialsForBund(data, sim.materials)
  const materialPolygons = simulationMaterialPolygons(
    data,
    section,
    materials,
    sim.foundationThicknessM
  )
  if (!materialPolygons) return null
  const water = sim.water ?? defaultBundSimulationWaterInputs()
  const templateLevel = simulationReservoirLevel(data)
  // The pool each case solves seepage for. Case II takes its subcase level;
  // every other seepage case sits at the full level.
  const reservoirLevel =
    caseId === 'construction'
      ? null
      : caseId === 'partial-pool'
      ? job?.reservoirLevel ?? null
      : water.reservoirFull ?? templateLevel
  const loading = sim.loading
  return {
    schemaVersion: BUND_SIMULATION_SCHEMA_VERSION,
    runId,
    case: caseId,
    geometry: { embankment, ground, materialPolygons },
    water: {
      reservoirLevel,
      tailWaterMax: water.tailWaterMax,
      tailWaterMin: water.tailWaterMin,
      minHeadwater: water.minHeadwater,
      rainfallLevel: water.rainfallLevel,
      foundationThicknessM: sim.foundationThicknessM
    },
    ...(loading
      ? { loading: { kh: loading.kh, kv: loading.kv, source: loading.source } }
      : {}),
    slope: caseSlopeSearch(caseId),
    foundationSource: sim.foundationSource === 'tested' ? 'tested' : 'assumed',
    foundationReference: sim.foundationReference?.trim() || undefined,
    materials: materials.map((m) => ({
      role: m.role,
      name: m.name,
      gamma: m.gamma ?? 0,
      gammaSat: m.gammaSat ?? m.gamma ?? 0,
      cPrime: m.cPrime ?? 0,
      phiPrime: m.phiPrime ?? 0,
      elasticModulusKpa: m.elasticModulusKpa ?? 0,
      poissonRatio: m.poissonRatio ?? 0,
      rapidD: m.rapidD ?? 0,
      rapidPsi: m.rapidPsi ?? 0,
      ...(reservoirLevel != null
        ? { kx: m.kx ?? 0, ky: m.ky ?? m.kx ?? 0 }
        : {})
    })),
    controls
  }
}

/** Stable short hash of exactly what was sent — stale results carry an old one. */
export function requestFingerprint(request: BundSimulationEngineRequest): string {
  const json = JSON.stringify({
    g: request.geometry,
    w: request.water,
    f: request.foundationSource,
    fr: request.foundationReference,
    m: request.materials,
    c: request.controls,
    k: request.case
  })
  let hash = 5381
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export interface SimulationValidationResult {
  errors: string[]
  warnings: string[]
}

/** Input gates before any engine time is spent. Never invents properties. */
export function validateBundSimulationInputs(
  sim: Pick<
    BundSimulationData,
    | 'materials'
    | 'foundationThicknessM'
    | 'foundationSource'
    | 'foundationReference'
    | 'water'
    | 'loading'
  >,
  caseIds: BundSimulationCaseId[],
  reservoirLevel: number | null,
  analysisType: BundSimulationAnalysisType = 'lem',
  controls?: BundSimulationControls,
  toeLevel: number | null = null
): SimulationValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const needsSeepage = caseIds.some((c) => BUND_SIMULATION_CASES[c].seepage)
  const water = sim.water ?? defaultBundSimulationWaterInputs()

  if (sim.materials.length < 2) {
    errors.push('Both the embankment fill and one foundation layer are required.')
  }

  for (const [index, m] of sim.materials.entries()) {
    const label = m.name?.trim() || `Material ${index + 1}`
    if (m.gamma == null || m.gamma <= 0) {
      errors.push(`${label}: moist unit weight must be greater than zero.`)
    }
    if (m.gammaSat != null && m.gamma != null && m.gammaSat < m.gamma) {
      errors.push(`${label}: saturated unit weight cannot be below the moist unit weight.`)
    }
    if (m.phiPrime == null || m.phiPrime < 0 || m.phiPrime > 50) {
      errors.push(`${label}: friction angle must be between 0° and 50°.`)
    }
    if (m.cPrime == null || m.cPrime < 0) {
      errors.push(`${label}: cohesion cannot be negative.`)
    }
    if (
      analysisType === 'fem-ssrm' &&
      (m.elasticModulusKpa == null || m.elasticModulusKpa <= 0)
    ) {
      errors.push(`${label}: Young's modulus must be greater than zero for FEM/SSRM.`)
    }
    if (
      analysisType === 'fem-ssrm' &&
      (m.poissonRatio == null || m.poissonRatio < 0 || m.poissonRatio >= 0.5)
    ) {
      errors.push(`${label}: Poisson's ratio must be from 0 up to, but not including, 0.5.`)
    }
    if (needsSeepage && (m.kx == null || m.kx <= 0)) {
      errors.push(`${label}: horizontal permeability is required for the seepage cases.`)
    }
  }

  if (!Number.isFinite(sim.foundationThicknessM) || sim.foundationThicknessM <= 0) {
    errors.push('Modelled foundation thickness must be greater than zero.')
  }

  if (needsSeepage && reservoirLevel == null) {
    errors.push(
      'The seepage cases need a full tank level (FTL) or maximum water level (MWL) — set it under the case boundary conditions.'
    )
  }

  // --- Case-specific gates (plan §6) -------------------------------------
  if (
    analysisType === 'fem-ssrm' &&
    caseIds.some((c) => c === 'drawdown-us' || c === 'drawdown-ds')
  ) {
    errors.push(
      'FEM strength reduction does not support the staged drawdown cases (III-A/III-B) — use a limit-equilibrium method for them.'
    )
  }

  if (caseIds.includes('drawdown-us')) {
    if (water.minHeadwater == null) {
      errors.push(
        'Case III-A needs the minimum head-water level after drawdown — set it under Water & loading.'
      )
    } else if (
      water.reservoirFull != null &&
      water.minHeadwater >= water.reservoirFull
    ) {
      errors.push('Case III-A: the minimum head-water must sit below the full reservoir level.')
    }
    if (water.tailWaterMax == null) {
      errors.push(
        'Case III-A runs with tail water at maximum — enter the maximum tail-water level.'
      )
    }
    const withStrength = sim.materials.some(
      (m) =>
        m.rapidD != null &&
        m.rapidPsi != null &&
        (m.rapidD !== 0 || m.rapidPsi !== 0)
    )
    if (!withStrength) {
      errors.push(
        'Case III-A did not start: enter both d and ψ drawdown-strength parameters on at least one low-permeability material.'
      )
    }
  }

  if (caseIds.includes('drawdown-ds')) {
    if (water.tailWaterMax == null || water.tailWaterMin == null) {
      errors.push(
        'Case III-B needs both the maximum and minimum tail-water levels — set them under Water & loading.'
      )
    } else if (water.tailWaterMin >= water.tailWaterMax) {
      errors.push('Case III-B: the minimum tail-water must sit below the maximum tail-water.')
    }
    const withStrength = sim.materials.some(
      (m) =>
        m.rapidD != null &&
        m.rapidPsi != null &&
        (m.rapidD !== 0 || m.rapidPsi !== 0)
    )
    if (!withStrength) {
      errors.push(
        'Case III-B did not start: enter both d and ψ drawdown-strength parameters on at least one low-permeability material.'
      )
    }
  }

  // A tail-water at or below the modelled ground surface is almost always a
  // "0 = none" data-entry slip; it would drag derived levels underground.
  if (
    (water.tailWaterMax != null && water.tailWaterMax <= 0) ||
    (water.tailWaterMin != null && water.tailWaterMin <= 0)
  ) {
    warnings.push(
      'A tail-water level of 0 m or below was entered — if the bund has no tail water, leave the tail-water fields empty instead.'
    )
  }
  // Tail water and rainfall saturation are absolute RLs, not depths. A value
  // at or below the u/s toe cannot pond against the section at all.
  // Only validate water levels that the selected case actually consumes.
  // Case III-A holds tailWaterMax throughout and never uses tailWaterMin;
  // checking a stale III-B minimum here used to block a valid III-A run.
  const usesTailWaterMax = caseIds.some((caseId) => caseId !== 'construction')
  const usesTailWaterMin = caseIds.includes('drawdown-ds')
  const tailBelowToe =
    toeLevel != null &&
    ((usesTailWaterMax && water.tailWaterMax != null && water.tailWaterMax <= toeLevel) ||
      (usesTailWaterMin && water.tailWaterMin != null && water.tailWaterMin <= toeLevel))
  if (tailBelowToe) {
    const message =
      `Tail-water levels are absolute RLs, not depths — 1 m of water above a toe at ` +
      `${toeLevel.toFixed(2)} m is RL ${(toeLevel + 1).toFixed(2)}, not 1. ` +
      'The entered tail water sits at or below the ground surface.'
    if (caseIds.some((c) => c === 'drawdown-us' || c === 'drawdown-ds')) {
      errors.push(message)
    } else {
      warnings.push(message)
    }
  }
  if (
    caseIds.includes('rainfall') &&
    toeLevel != null &&
    water.rainfallLevel != null &&
    water.rainfallLevel <= toeLevel
  ) {
    errors.push(
      `The rainfall saturation level (${water.rainfallLevel.toFixed(2)} m RL) sits at or ` +
        `below the ground surface (${toeLevel.toFixed(2)} m RL) — enter an absolute RL above the toe.`
    )
  }

  if (caseIds.includes('rainfall')) {
    if (water.rainfallLevel == null) {
      errors.push(
        'Case V needs the sustained-rainfall saturation level held on the downstream face — enter it under Water & loading.'
      )
    }
  }

  for (const quake of ['quake-seepage', 'quake-full'] as BundSimulationCaseId[]) {
    if (caseIds.includes(quake)) {
      const kh = sim.loading?.kh ?? 0
      if (!(kh > 0)) {
        errors.push(
          'The earthquake cases need a horizontal seismic coefficient kh greater than zero.'
        )
      }
      if (kh > 0.5) {
        errors.push('The horizontal seismic coefficient kh must be at most 0.5.')
      }
    }
  }

  if (sim.materials.some((m) => m.ky == null)) {
    warnings.push('Permeability is treated as isotropic where only kx was entered.')
  }
  if (
    sim.materials.some(
      (material) => material.role === 'rocktoe' || material.role === 'rocktoe-filter'
    )
  ) {
    warnings.push(
      'Rock-toe and filter inclusion, names and geometry come from Design, but the design item does not establish unit weight, strength, stiffness or permeability. Confirm these simulation properties against approved material and geotechnical data.'
    )
  }
  const foundationRows = sim.materials.filter(
    (material, index) => material.role === 'foundation' || (!material.role && index === 1)
  )
  if (foundationRows.length === 1) {
    warnings.push('Only one foundation layer is modelled.')
  }

  if ((sim.foundationSource ?? 'assumed') !== 'tested') {
    warnings.push(
      'Foundation thickness and properties are assumed, not laboratory-tested. Confirm against an approved investigation report.'
    )
  } else if (!sim.foundationReference?.trim()) {
    warnings.push('Foundation is marked tested, but no investigation or report reference is recorded.')
  }

  if (analysisType === 'lem') {
    const count = controls?.analysisType === 'lem' ? controls.slices : 40
    if (!Number.isInteger(count) || count < 10 || count > 500) {
      errors.push('LEM slice count must be a whole number between 10 and 500.')
    }
  } else {
    const fem = controls?.analysisType === 'fem-ssrm' ? controls : DEFAULT_FEM_CONTROLS
    if (!Number.isFinite(fem.meshSizeM) || fem.meshSizeM <= 0) {
      errors.push('FEM target mesh size must be greater than zero.')
    }
    if (!Number.isFinite(fem.tolerance) || fem.tolerance <= 0 || fem.tolerance > 0.25) {
      errors.push('FEM SSRM tolerance must be greater than 0 and at most 0.25.')
    }
    if (!Number.isInteger(fem.maxIterations) || fem.maxIterations < 100 || fem.maxIterations > 20000) {
      errors.push('FEM maximum iterations must be a whole number between 100 and 20,000.')
    }
  }

  return { errors, warnings }
}
