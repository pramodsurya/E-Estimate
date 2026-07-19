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
