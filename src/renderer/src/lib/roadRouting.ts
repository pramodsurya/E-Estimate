import type { LeadMapCoordinate } from '../types/project'

const DEFAULT_OSRM_URL = 'https://router.project-osrm.org'

export interface RoadRouteResult {
  points: LeadMapCoordinate[]
  distanceKm: number
  durationSeconds: number
}

interface OsrmRouteResponse {
  code?: string
  message?: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: {
      coordinates?: Array<[number, number]>
    }
  }>
}

function routingBaseUrl(): string {
  const configured = (import.meta.env.VITE_OSRM_URL as string | undefined)?.trim()
  return (configured || DEFAULT_OSRM_URL).replace(/\/+$/, '')
}

export function buildOsrmRouteUrl(points: LeadMapCoordinate[]): string {
  const coordinates = points.map((point) => `${point.lon},${point.lat}`).join(';')
  return `${routingBaseUrl()}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`
}

interface OsrmTableResponse {
  code?: string
  message?: string
  distances?: Array<Array<number | null>>
}

function buildOsrmTableUrl(
  sources: LeadMapCoordinate[],
  destinations: LeadMapCoordinate[],
  sourceIndexes: number[],
  destinationIndexes: number[]
): string {
  const coordinates = [...sources, ...destinations]
    .map((point) => `${point.lon},${point.lat}`)
    .join(';')
  return (
    `${routingBaseUrl()}/table/v1/driving/${coordinates}` +
    `?annotations=distance&sources=${sourceIndexes.join(';')}` +
    `&destinations=${destinationIndexes.join(';')}`
  )
}

/**
 * Road distances in km, rows = sources, columns = destinations. Null marks
 * an unroutable pair. OSRM caps a request at 100 coordinates; callers chunk.
 */
export async function fetchOsrmTableKm(
  sources: LeadMapCoordinate[],
  destinations: LeadMapCoordinate[],
  signal?: AbortSignal
): Promise<(number | null)[][]> {
  if (sources.length === 0 || destinations.length === 0) return []
  const sourceIndexes = sources.map((_, index) => index)
  const destinationIndexes = destinations.map(
    (_, index) => sources.length + index
  )
  const response = await fetch(
    buildOsrmTableUrl(sources, destinations, sourceIndexes, destinationIndexes),
    { signal }
  )
  if (!response.ok) throw new Error(`Road table failed (${response.status}).`)
  const payload = (await response.json()) as OsrmTableResponse
  if (payload.code !== 'Ok' || !payload.distances) {
    throw new Error(payload.message || 'No road table was returned for these points.')
  }
  return payload.distances.map((row) =>
    destinationIndexes.map((_, column) => {
      const metres = row[column]
      return typeof metres === 'number' && Number.isFinite(metres) && metres >= 0
        ? metres / 1000
        : null
    })
  )
}

export async function calculateRoadRoute(
  stops: LeadMapCoordinate[],
  signal?: AbortSignal
): Promise<RoadRouteResult> {
  if (stops.length < 2) throw new Error('Choose at least a starting and ending point.')

  const response = await fetch(buildOsrmRouteUrl(stops), { signal })
  if (!response.ok) throw new Error(`Road routing failed (${response.status}).`)

  const payload = (await response.json()) as OsrmRouteResponse
  const route = payload.routes?.[0]
  const coordinates = route?.geometry?.coordinates
  if (payload.code !== 'Ok' || !route || !coordinates || coordinates.length < 2) {
    throw new Error(payload.message || 'No road route was found for these points.')
  }
  if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new Error('The routing service returned an invalid route distance.')
  }

  return {
    points: coordinates.map(([lon, lat]) => ({ lat, lon })),
    distanceKm: route.distance! / 1000,
    durationSeconds: route.duration!
  }
}
