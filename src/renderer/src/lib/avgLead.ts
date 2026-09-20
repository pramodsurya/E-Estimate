/**
 * Avg Lead geometry and averaging.
 *
 * Line mode: targets are placed along a working line every `spacingM`
 * (k * spacing while <= length). Each target owns a tolerance window
 * [chainage, chainage + toleranceM] sampled every `sampleStepM`. The created
 * point is the sample whose road route from the nearest starting point is
 * shortest; the Avg Lead is the mean of those winning routes.
 *
 * Table mode (manual-length components with no map line): the user enters
 * distances and the Avg Lead is their mean.
 *
 * This module is dependency-free (own haversine) so the node test harness
 * can load it directly. Road distances arrive through an injected matrix
 * fetcher, which tests stub and the dialog wires to the OSRM table service.
 */

export interface AvgLatLng {
  lat: number
  lng: number
}

export interface AvgStart {
  id: string
  coord: AvgLatLng
  /** Display name for map tooltips and summaries; falls back to a generic label. */
  label?: string
}

export interface AvgSample {
  chainageM: number
  coord: AvgLatLng
}

export interface AvgTargetPlan {
  chainageM: number
  samples: AvgSample[]
}

export interface AvgResolvedPoint {
  chainageM: number
  coord: AvgLatLng
  /** Winner road route, filled by the caller after fetching. */
  geometry?: { lat: number; lon: number }[]
  /** Distance walked inside the tolerance window to reach the road (m). */
  snapOffsetM: number
  startId: string
  routeKm: number
}

export interface AvgResolveOutcome {
  points: AvgResolvedPoint[]
  failures: number
  avgKm: number | null
}

const EARTH_RADIUS_M = 6371000
const DEG_TO_RAD = Math.PI / 180

export function haversineM(a: AvgLatLng, b: AvgLatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD
  const dLng = (b.lng - a.lng) * DEG_TO_RAD
  const sLat = Math.sin(dLat / 2)
  const sLng = Math.sin(dLng / 2)
  const h =
    sLat * sLat +
    Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sLng * sLng
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function polylineLengthM(points: AvgLatLng[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += haversineM(points[i - 1], points[i])
  }
  return total
}

/** Interpolated position at `distM` metres along the polyline; null when out of range. */
export function pointAtDistance(points: AvgLatLng[], distM: number): AvgLatLng | null {
  if (points.length === 0 || distM < 0) return null
  if (distM === 0) return { ...points[0] }
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const leg = haversineM(points[i - 1], points[i])
    if (walked + leg >= distM) {
      const t = leg <= 0 ? 0 : (distM - walked) / leg
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t
      }
    }
    walked += leg
  }
  return null
}

/** Target chainages: spacing, 2 * spacing, … while within the line length. */
export function targetChainages(lengthM: number, spacingM: number): number[] {
  if (!(lengthM > 0) || !(spacingM > 0)) return []
  const out: number[] = []
  for (let chainage = spacingM; chainage <= lengthM + 1e-9; chainage += spacingM) {
    out.push(Math.min(chainage, lengthM))
  }
  return out
}

/** Sample offsets inside one tolerance window: 0, step, … while within tolerance. */
export function sampleOffsets(toleranceM: number, stepM: number): number[] {
  const tolerance = Math.max(0, toleranceM)
  const step = stepM > 0 ? stepM : tolerance
  const out: number[] = [0]
  if (!(tolerance > 0) || !(step > 0)) return out
  for (let offset = step; offset <= tolerance + 1e-9; offset += step) {
    out.push(Math.min(offset, tolerance))
  }
  return out
}

/** Full generation plan for a working line. */
export function buildAvgPlan(
  line: AvgLatLng[],
  spacingM: number,
  toleranceM: number,
  sampleStepM = 100
): AvgTargetPlan[] {
  if (line.length < 2) return []
  const lengthM = polylineLengthM(line)
  return targetChainages(lengthM, spacingM)
    .map((chainageM) => {
      const samples: AvgSample[] = []
      for (const offset of sampleOffsets(toleranceM, sampleStepM)) {
        const at = pointAtDistance(line, Math.min(chainageM + offset, lengthM))
        if (at) samples.push({ chainageM: chainageM + offset, coord: at })
      }
      return { chainageM, samples }
    })
    .filter((target) => target.samples.length > 0)
}

/** Mean of finite positive numbers; null when there is nothing usable. */
export function averageDistancesKm(values: number[]): number | null {
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (usable.length === 0) return null
  return usable.reduce((sum, value) => sum + value, 0) / usable.length
}

/**
 * Distance matrix in km, rows = sources (starts), columns = destinations
 * (flattened samples). Null marks an unroutable pair.
 */
export type AvgMatrixFetcher = (
  sources: AvgLatLng[],
  destinations: AvgLatLng[]
) => Promise<(number | null)[][]>

/**
 * Resolve every target to its best sample: the sample whose nearest starting
 * point gives the shortest road route. Ties break toward the smaller
 * chainage so repeated runs agree. Targets with no routable sample count as
 * failures and are left out of the average.
 */
export async function resolveAvgPlan(
  plan: AvgTargetPlan[],
  starts: AvgStart[],
  fetchMatrix: AvgMatrixFetcher
): Promise<AvgResolveOutcome> {
  const points: AvgResolvedPoint[] = []
  let failures = 0
  if (plan.length === 0 || starts.length === 0) {
    return { points, failures: plan.length, avgKm: null }
  }
  const flat: { targetIndex: number; sample: AvgSample }[] = []
  plan.forEach((target, targetIndex) => {
    target.samples.forEach((sample) => flat.push({ targetIndex, sample }))
  }
  )
  const matrix = await fetchMatrix(
    starts.map((start) => start.coord),
    flat.map((entry) => entry.sample.coord)
  )
  plan.forEach((target, targetIndex) => {
    let best: { sample: AvgSample; startId: string; routeKm: number } | null = null
    target.samples.forEach((sample) => {
      const flatIndex = flat.findIndex(
        (entry) => entry.targetIndex === targetIndex && entry.sample.chainageM === sample.chainageM
      )
      if (flatIndex < 0) return
      matrix.forEach((row, startIndex) => {
        const start = starts[startIndex]
        const routeKm = row[flatIndex]
        if (!start || routeKm == null || !(routeKm >= 0)) return
        if (
          best == null ||
          routeKm < best.routeKm - 1e-9 ||
          (Math.abs(routeKm - best.routeKm) <= 1e-9 && sample.chainageM < best.sample.chainageM)
        ) {
          best = { sample, startId: start.id, routeKm }
        }
      })
    })
    if (best == null) {
      failures += 1
      return
    }
    const winner: { sample: AvgSample; startId: string; routeKm: number } = best
    const base = target.samples[0]?.coord ?? winner.sample.coord
    points.push({
      chainageM: winner.sample.chainageM,
      coord: winner.sample.coord,
      snapOffsetM: haversineM(base, winner.sample.coord),
      startId: winner.startId,
      routeKm: winner.routeKm
    })
  })
  points.sort((a, b) => a.chainageM - b.chainageM)
  return { points, failures, avgKm: averageDistancesKm(points.map((point) => point.routeKm)) }
}
