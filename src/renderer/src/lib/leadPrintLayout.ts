import type {
  LeadPrintPageKey,
  LeadPrintSettings,
  Margins,
  Orientation,
  PaperSize
} from '../types/project'

export interface NormalizedLeadPrintPageSettings {
  orientation: Orientation
}

export interface NormalizedLeadPrintSettings {
  pageSize: PaperSize
  margins: Margins
  pages: Record<LeadPrintPageKey, NormalizedLeadPrintPageSettings>
  mapPageSize: PaperSize
  mapLayerType: 'map' | 'satellite' | 'toposheet' | 'toposheet_transparent'
  showMapLabels: boolean
  showMapPointLabels: boolean
  showMapRouteLabels: boolean
  mapPointLabelMode: 'code' | 'name' | 'code_name'
  mapLabelSize: 'small' | 'medium' | 'large'
  showRouteArrows: boolean
  showBaseMap: boolean
  showMapLegend: boolean
  mapLegendPosition: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  showMapScale: boolean
  showMapHeader: boolean
  mapTitle: string
  mapSubtitle: string
  /** 0 means "fill whatever page height is left below the heading". */
  mapBoxHeightMm: number
  mapBoxWidthPercent: number
  mapView: { lat: number; lon: number; zoom: number } | null
}

/** Below this the box stops being a map and starts being a stamp. */
export const MIN_MAP_BOX_HEIGHT_MM = 40
export const MIN_MAP_BOX_WIDTH_PERCENT = 30

export interface LeadMapBounds {
  south: number
  west: number
  north: number
  east: number
}

/**
 * True when at least one route point or segment is actually visible in a map
 * frame. Checking the complete route-bounds rectangle is not enough: separate
 * routes can surround an empty centre, which is exactly where a highly zoomed
 * saved view can otherwise produce a blank printed map.
 */
export function routeGeometryIntersectsBounds(
  routes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  bounds: LeadMapBounds
): boolean {
  if (
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.east) ||
    bounds.south > bounds.north ||
    bounds.west > bounds.east
  ) {
    return false
  }

  for (const route of routes) {
    let previous: readonly [number, number] | undefined
    for (const coordinate of route) {
      const [lat, lon] = coordinate
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        previous = undefined
        continue
      }
      if (coordinateIsInsideBounds(lat, lon, bounds)) return true
      if (previous && segmentIntersectsBounds(previous, coordinate, bounds)) return true
      previous = coordinate
    }
  }
  return false
}

function coordinateIsInsideBounds(lat: number, lon: number, bounds: LeadMapBounds): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lon >= bounds.west &&
    lon <= bounds.east
  )
}

/** Liang-Barsky clipping for a latitude/longitude segment and rectangular frame. */
function segmentIntersectsBounds(
  from: readonly [number, number],
  to: readonly [number, number],
  bounds: LeadMapBounds
): boolean {
  const x0 = from[1]
  const y0 = from[0]
  const dx = to[1] - x0
  const dy = to[0] - y0
  const p = [-dx, dx, -dy, dy]
  const q = [x0 - bounds.west, bounds.east - x0, y0 - bounds.south, bounds.north - y0]
  let start = 0
  let end = 1

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return false
      continue
    }
    const ratio = q[index] / p[index]
    if (p[index] < 0) start = Math.max(start, ratio)
    else end = Math.min(end, ratio)
    if (start > end) return false
  }
  return true
}

export const LEAD_PRINT_PAGE_LABELS: Record<LeadPrintPageKey, string> = {
  chart: 'Source chart',
  calculation: 'Rate calculations',
  map: 'Route map'
}

export const DEFAULT_LEAD_PRINT_SETTINGS: NormalizedLeadPrintSettings = {
  pageSize: 'A4',
  margins: { top: 15, right: 12, bottom: 15, left: 12 },
  pages: {
    chart: { orientation: 'portrait' },
    calculation: { orientation: 'portrait' },
    map: { orientation: 'landscape' }
  },
  mapPageSize: 'A4',
  mapLayerType: 'toposheet',
  showMapLabels: true,
  showMapPointLabels: true,
  showMapRouteLabels: true,
  mapPointLabelMode: 'code_name',
  mapLabelSize: 'medium',
  showRouteArrows: true,
  showBaseMap: true,
  showMapLegend: true,
  mapLegendPosition: 'bottom_right',
  showMapScale: true,
  showMapHeader: true,
  mapTitle: 'Lead Route Map',
  mapSubtitle: 'Printed route schematic for points and applied Lead variant directions.',
  mapBoxHeightMm: 0,
  mapBoxWidthPercent: 100,
  mapView: null
}

export function normalizeLeadPrintSettings(
  settings?: LeadPrintSettings
): NormalizedLeadPrintSettings {
  return {
    pageSize: settings?.pageSize ?? DEFAULT_LEAD_PRINT_SETTINGS.pageSize,
    margins: settings?.margins ?? DEFAULT_LEAD_PRINT_SETTINGS.margins,
    pages: {
      chart: {
        orientation:
          settings?.pages?.chart?.orientation ?? DEFAULT_LEAD_PRINT_SETTINGS.pages.chart.orientation
      },
      calculation: {
        orientation:
          settings?.pages?.calculation?.orientation ??
          DEFAULT_LEAD_PRINT_SETTINGS.pages.calculation.orientation
      },
      map: {
        orientation:
          settings?.pages?.map?.orientation ?? DEFAULT_LEAD_PRINT_SETTINGS.pages.map.orientation
      }
    },
    mapPageSize: settings?.mapPageSize ?? settings?.pageSize ?? 'A4',
    mapLayerType: settings?.mapLayerType ?? 'toposheet',
    showMapLabels: settings?.showMapLabels ?? true,
    showMapPointLabels: settings?.showMapPointLabels ?? settings?.showMapLabels ?? true,
    showMapRouteLabels: settings?.showMapRouteLabels ?? settings?.showMapLabels ?? true,
    mapPointLabelMode: settings?.mapPointLabelMode ?? 'code_name',
    mapLabelSize: settings?.mapLabelSize ?? 'medium',
    showRouteArrows: settings?.showRouteArrows ?? true,
    showBaseMap: settings?.showBaseMap ?? true,
    showMapLegend: settings?.showMapLegend ?? true,
    mapLegendPosition: settings?.mapLegendPosition ?? 'bottom_right',
    showMapScale: settings?.showMapScale ?? true,
    showMapHeader: settings?.showMapHeader ?? true,
    mapTitle: settings?.mapTitle ?? 'Lead Route Map',
    mapSubtitle:
      settings?.mapSubtitle ??
      'Printed route schematic for points and applied Lead variant directions.',
    mapBoxHeightMm: clampBoxHeight(settings?.mapBoxHeightMm),
    mapBoxWidthPercent: clampBoxWidth(settings?.mapBoxWidthPercent),
    mapView: normalizeMapView(settings?.mapView)
  }
}

function clampBoxHeight(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return 0
  return Math.max(MIN_MAP_BOX_HEIGHT_MM, Math.min(1000, value as number))
}

function clampBoxWidth(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return 100
  return Math.max(MIN_MAP_BOX_WIDTH_PERCENT, Math.min(100, value as number))
}

function normalizeMapView(
  view: LeadPrintSettings['mapView']
): NormalizedLeadPrintSettings['mapView'] {
  if (
    !view ||
    !Number.isFinite(view.lat) ||
    !Number.isFinite(view.lon) ||
    !Number.isFinite(view.zoom) ||
    view.lat < -90 ||
    view.lat > 90 ||
    view.lon < -180 ||
    view.lon > 180 ||
    view.zoom < 0 ||
    view.zoom > 18
  ) {
    return null
  }
  return { lat: view.lat, lon: view.lon, zoom: view.zoom }
}
