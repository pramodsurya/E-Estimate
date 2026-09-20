import type { ProjectAreaAllowance } from '../types/project'

/**
 * Intelligent geometry import for the Draw a line step.
 *
 * KML, GeoJSON and SHP uploads are reduced to loose points and polylines,
 * then analysed: nearby points join into lines, connected ends merge, truly
 * disconnected lines become separate components, and a smaller line touching
 * a main line's middle becomes a sub-component. Everything is pure and
 * dependency-free so the analyzer is unit-testable in Node.
 */

export interface ImportVertex {
  lat: number
  lng: number
}

export interface ParsedImportGeometry {
  lines: ImportVertex[][]
  points: ImportVertex[]
  /** Geometries skipped because their shape is unsupported. */
  ignored: number
}

export interface ImportChainReport {
  points: number
  minGapM: number
  maxGapM: number
  irregular: boolean
}

export interface ImportProposal {
  key: string
  /** component or subcomponent. */
  kind: 'component' | 'subcomponent'
  /** Proposal key of the owning component, for branches. */
  parentKey: string | null
  /** Trimmed working line; empty for point-components. */
  vertices: ImportVertex[]
  /** Work point: the line middle, or the isolated point itself. */
  point: ImportVertex
  lengthM: number
  trimStartM: number
  trimEndM: number
  chain: ImportChainReport | null
  note: string | null
}

export interface ImportAnalysis {
  proposals: ImportProposal[]
  /** Human-readable assumptions shown under the preview. */
  assumptions: string[]
  /** Loose pairs reported but never auto-created (two points can't help). */
  pairs: ImportVertex[][]
  isolatedCount: number
}

export interface ImportedComponentSpec {
  key: string
  name: string
  kind: 'component' | 'subcomponent'
  parentKey: string | null
  location: { lat: number; lng: number; label?: string } | null
  workingLine: { lat: number; lng: number }[] | null
  allowance: ProjectAreaAllowance | null
  /** Template alignment preset (bund/canal/guide-wall batch creation). */
  alignment?: { lat: number; lng: number }[] | null
}

export const IMPORT_TOLERANCES_M = [30, 40, 50] as const
export const DEFAULT_IMPORT_TOLERANCE_M = 50
/** Duplicate collapse distance and the vertex processing cap (stated in UI). */
export const IMPORT_DEDUPE_M = 1
export const IMPORT_MAX_VERTICES = 20000
/** A chain whose max/min gap ratio exceeds this is flagged irregular. */
export const IMPORT_IRREGULAR_RATIO = 3

const EARTH_RADIUS_M = 6371000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance in meters. */
export function haversineM(a: ImportVertex, b: ImportVertex): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Cumulative length of a polyline in meters. */
export function polylineLengthM(vertices: ImportVertex[]): number {
  let total = 0
  for (let index = 1; index < vertices.length; index += 1) {
    total += haversineM(vertices[index - 1], vertices[index])
  }
  return total
}

function validVertex(lat: number, lng: number): ImportVertex | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function parseLonLatPair(token: string): ImportVertex | null {
  const parts = token.trim().split(',')
  if (parts.length < 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  return validVertex(lat, lng)
}

/**
 * KML Placemark geometries, parsed as pure string matching (no DOMParser, so
 * this runs in Node tests as well as the browser). Reads LineString and Point
 * coordinates (lon,lat[,alt]), GPS tracks (gx:Track / Track with gx:coord
 * "lat lng [alt]" pairs — the order is reversed versus coordinates), and
 * Polygon outer rings (kept as closed lines; holes are never read).
 */
export function parseKmlGeometry(text: string): ParsedImportGeometry {
  const lines: ImportVertex[][] = []
  const points: ImportVertex[] = []
  let ignored = 0
  const placemarks = matchTagBlocks(text, 'Placemark')
  if (!placemarks.length && !/<kml[\s>]/i.test(text)) {
    throw new Error('Not a KML file: no Placemark geometries found.')
  }
  for (const placemark of placemarks) {
    const lineStrings = matchTagBlocks(placemark, 'LineString')
    const pointTags = matchTagBlocks(placemark, 'Point')
    const tracks = [...matchTagBlocks(placemark, 'gx:Track'), ...matchTagBlocks(placemark, 'Track')]
    const polygons = matchTagBlocks(placemark, 'Polygon')
    if (!lineStrings.length && !pointTags.length && !tracks.length && !polygons.length) {
      ignored += 1
      continue
    }
    for (const line of lineStrings) {
      const coords = parseLonLatList(firstCoordinatesText(line))
      if (coords.length >= 2) lines.push(coords)
      else ignored += 1
    }
    for (const pointTag of pointTags) {
      const coords = parseLonLatList(firstCoordinatesText(pointTag))
      if (coords[0]) points.push(coords[0])
      else ignored += 1
    }
    for (const track of tracks) {
      const coords = matchTagTexts(track, 'gx:coord')
        .concat(matchTagTexts(track, 'coord'))
        .map(parseLatLngToken)
        .filter((vertex): vertex is ImportVertex => vertex !== null)
      if (coords.length >= 2) lines.push(coords)
      else ignored += 1
    }
    for (const polygon of polygons) {
      const outers = matchTagBlocks(polygon, 'outerBoundaryIs')
      const rings = outers.length
        ? outers.flatMap((outer) => matchTagBlocks(outer, 'LinearRing'))
        : matchTagBlocks(polygon, 'LinearRing')
      if (!rings.length) {
        ignored += 1
        continue
      }
      for (const ring of rings) {
        const coords = parseLonLatList(firstCoordinatesText(ring))
        if (coords.length >= 2) lines.push(coords)
        else ignored += 1
      }
    }
  }
  return { lines, points, ignored }
}

/** Inner XML of every <tag …>…</tag> block (case-insensitive). */
function matchTagBlocks(text: string, tag: string): string[] {
  const out: string[] = []
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>((?:(?!<\\/?${tag}[\\s>])[\\s\\S])*)<\\/${tag}\\s*>`, 'gi')
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = pattern.exec(text)) !== null && guard < 100000) {
    guard += 1
    out.push(match[1])
  }
  return out
}

/** Inner texts of every <tag …>…</tag> occurrence (leaf elements). */
function matchTagTexts(text: string, tag: string): string[] {
  const out: string[] = []
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}\\s*>`, 'gi')
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = pattern.exec(text)) !== null && guard < 100000) {
    guard += 1
    out.push(match[1])
  }
  return out
}

function firstCoordinatesText(block: string): string {
  return matchTagTexts(block, 'coordinates')[0] ?? ''
}

function parseLonLatList(text: string): ImportVertex[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(parseLonLatPair)
    .filter((vertex): vertex is ImportVertex => vertex !== null)
}

/** A GPS-track fix: "lat lng [alt]" — reversed versus KML coordinates. */
export function parseTrackCoordToken(token: string): ImportVertex | null {
  const parts = token.trim().split(/[\s,]+/)
  if (parts.length < 2) return null
  const lat = Number(parts[0])
  const lng = Number(parts[1])
  return validVertex(lat, lng)
}

function parseLatLngToken(token: string): ImportVertex | null {
  return parseTrackCoordToken(token)
}

/** GeoJSON geometries. Coordinates are [lon, lat]. */
export function parseGeoJsonGeometry(text: string): ParsedImportGeometry {
  const lines: ImportVertex[][] = []
  const points: ImportVertex[] = []
  let ignored = 0
  const geometries: unknown[] = []
  const root = JSON.parse(text) as Record<string, unknown>
  const collect = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
      record.features.forEach(collect)
    } else if (record.type === 'Feature') {
      collect(record.geometry)
    } else if (record.type === 'GeometryCollection' && Array.isArray(record.geometries)) {
      record.geometries.forEach(collect)
    } else if (typeof record.type === 'string' && 'coordinates' in record) {
      geometries.push(record)
    }
  }
  collect(root)
  const toVertex = (coord: unknown): ImportVertex | null => {
    if (!Array.isArray(coord) || coord.length < 2) return null
    const lng = Number(coord[0])
    const lat = Number(coord[1])
    return validVertex(lat, lng)
  }
  for (const geometry of geometries) {
    const record = geometry as { type: string; coordinates: unknown }
    if (record.type === 'Point') {
      const vertex = toVertex(record.coordinates)
      if (vertex) points.push(vertex)
      else ignored += 1
    } else if (record.type === 'MultiPoint' && Array.isArray(record.coordinates)) {
      for (const coord of record.coordinates) {
        const vertex = toVertex(coord)
        if (vertex) points.push(vertex)
        else ignored += 1
      }
    } else if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
      const vertices = (record.coordinates as unknown[])
        .map(toVertex)
        .filter((vertex): vertex is ImportVertex => vertex !== null)
      if (vertices.length >= 2) lines.push(vertices)
      else ignored += 1
    } else if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
      for (const part of record.coordinates as unknown[]) {
        if (!Array.isArray(part)) {
          ignored += 1
          continue
        }
        const vertices = (part as unknown[])
          .map(toVertex)
          .filter((vertex): vertex is ImportVertex => vertex !== null)
        if (vertices.length >= 2) lines.push(vertices)
        else ignored += 1
      }
    } else {
      ignored += 1
    }
  }
  return { lines, points, ignored }
}

/**
 * ESRI Shapefile Point (1) and PolyLine (13) records straight from the .shp
 * buffer. Coordinates are assumed WGS84 lat/lng (X=lon, Y=lat); any .prj
 * sidecar is ignored — stated in the preview assumptions.
 */
export function parseShpGeometry(buffer: ArrayBuffer): ParsedImportGeometry {
  const lines: ImportVertex[][] = []
  const points: ImportVertex[] = []
  let ignored = 0
  const view = new DataView(buffer)
  if (buffer.byteLength < 100) throw new Error('Not a shapefile: header is incomplete.')
  if (view.getInt32(0, false) !== 9994) throw new Error('Not a shapefile: bad file code.')
  let offset = 100
  let guard = 0
  while (offset + 8 <= buffer.byteLength && guard < 1000000) {
    guard += 1
    const contentWords = view.getInt32(offset + 4, false)
    const contentBytes = contentWords * 2
    if (contentBytes < 4 || offset + 8 + contentBytes > buffer.byteLength) break
    const shapeType = view.getInt32(offset + 8, true)
    if (shapeType === 1 && contentBytes >= 20) {
      const vertex = validVertex(
        view.getFloat64(offset + 20, true),
        view.getFloat64(offset + 12, true)
      )
      if (vertex) points.push(vertex)
      else ignored += 1
    } else if (shapeType === 13 && contentBytes >= 44) {
      const numParts = view.getInt32(offset + 44, true)
      const numPoints = view.getInt32(offset + 48, true)
      if (numParts < 0 || numPoints < 0 || numParts > numPoints + 1) {
        ignored += 1
      } else {
        const partsOffset = offset + 52
        const pointsOffset = partsOffset + numParts * 4
        for (let part = 0; part < numParts; part += 1) {
          const start = view.getInt32(partsOffset + part * 4, true)
          const end = part + 1 < numParts
            ? view.getInt32(partsOffset + (part + 1) * 4, true)
            : numPoints
          const vertices: ImportVertex[] = []
          for (let index = start; index < end; index += 1) {
            const base = pointsOffset + index * 16
            if (base + 16 > offset + 8 + contentBytes) break
            const vertex = validVertex(
              view.getFloat64(base + 8, true),
              view.getFloat64(base, true)
            )
            if (vertex) vertices.push(vertex)
          }
          if (vertices.length >= 2) lines.push(vertices)
          else ignored += 1
        }
      }
    } else if (shapeType !== 0) {
      ignored += 1
    }
    offset += 8 + contentBytes
  }
  return { lines, points, ignored }
}

/** Drop near-duplicate vertices closer than the dedupe distance. */
export function dedupeVertices(
  vertices: ImportVertex[],
  minGapM = IMPORT_DEDUPE_M
): ImportVertex[] {
  const out: ImportVertex[] = []
  for (const vertex of vertices) {
    if (!out.length || haversineM(out[out.length - 1], vertex) >= minGapM) {
      out.push(vertex)
    }
  }
  return out
}

/**
 * Greedy nearest-neighbor chains from loose points. Each unvisited point
 * starts a chain that grows from both ends while the nearest free point is
 * within tolerance. Returns chains of every size; the caller decides which
 * become lines (≥3 points), reported pairs (exactly 2), or isolated points.
 */
export function chainLoosePoints(
  points: ImportVertex[],
  toleranceM: number
): ImportVertex[][] {
  const remaining = points.slice()
  const chains: ImportVertex[][] = []
  const nearestIndex = (from: ImportVertex): number => {
    let best = -1
    let bestDist = toleranceM
    for (let index = 0; index < remaining.length; index += 1) {
      const dist = haversineM(from, remaining[index])
      if (dist <= bestDist) {
        bestDist = dist
        best = index
      }
    }
    return best
  }
  while (remaining.length) {
    const chain: ImportVertex[] = [remaining.shift() as ImportVertex]
    for (;;) {
      const head = nearestIndex(chain[0])
      const tail = nearestIndex(chain[chain.length - 1])
      if (head === -1 && tail === -1) break
      if (tail !== -1 && (head === -1 || head === tail)) {
        chain.push(...remaining.splice(tail, 1))
      } else if (head !== -1) {
        chain.unshift(...remaining.splice(head, 1))
      } else {
        break
      }
    }
    chains.push(chain)
  }
  return chains
}

function chainReport(chain: ImportVertex[]): ImportChainReport {
  let minGap = Number.POSITIVE_INFINITY
  let maxGap = 0
  for (let index = 1; index < chain.length; index += 1) {
    const gap = haversineM(chain[index - 1], chain[index])
    if (gap < minGap) minGap = gap
    if (gap > maxGap) maxGap = gap
  }
  return {
    points: chain.length,
    minGapM: Number.isFinite(minGap) ? minGap : 0,
    maxGapM: maxGap,
    irregular:
      chain.length >= 3 &&
      minGap > 0 &&
      maxGap / minGap > IMPORT_IRREGULAR_RATIO
  }
}

function reversed(line: ImportVertex[]): ImportVertex[] {
  return line.slice().reverse()
}

function endsWithin(a: ImportVertex, b: ImportVertex, toleranceM: number): boolean {
  return haversineM(a, b) <= toleranceM
}

/**
 * Join line ends within tolerance until stable. Returns the merged lines;
 * lines that never touch stay separate and later become their own components.
 */
export function mergeTouchingLines(
  lines: ImportVertex[][],
  toleranceM: number
): ImportVertex[][] {
  const pool = lines.map((line) => line.slice())
  for (;;) {
    let joined = false
    outer: for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const a = pool[i]
        const b = pool[j]
        const aStart = a[0]
        const aEnd = a[a.length - 1]
        const bStart = b[0]
        const bEnd = b[b.length - 1]
        let merged: ImportVertex[] | null = null
        if (endsWithin(aEnd, bStart, toleranceM)) merged = [...a, ...b.slice(1)]
        else if (endsWithin(aEnd, bEnd, toleranceM)) merged = [...a, ...reversed(b).slice(1)]
        else if (endsWithin(aStart, bStart, toleranceM)) merged = [...reversed(b), ...a.slice(1)]
        else if (endsWithin(aStart, bEnd, toleranceM)) merged = [...b, ...a.slice(1)]
        if (merged) {
          pool[i] = dedupeVertices(merged)
          pool.splice(j, 1)
          joined = true
          break outer
        }
      }
    }
    if (!joined) return pool
  }
}

/** Equirectangular point-to-segment distance in meters (fine under ~1 km). */
function pointSegmentDistanceM(
  point: ImportVertex,
  segA: ImportVertex,
  segB: ImportVertex
): number {
  const latRef = toRadians((point.lat + segA.lat + segB.lat) / 3)
  const kx = EARTH_RADIUS_M * Math.cos(latRef) * (Math.PI / 180)
  const ky = EARTH_RADIUS_M * (Math.PI / 180)
  const px = (point.lng - segA.lng) * kx
  const py = (point.lat - segA.lat) * ky
  const bx = (segB.lng - segA.lng) * kx
  const by = (segB.lat - segA.lat) * ky
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  const cx = bx * t - px
  const cy = by * t - py
  return Math.sqrt(cx * cx + cy * cy)
}

/** Minimum distance from a point to a polyline's interior (excludes end caps). */
function distanceToLineInterior(
  point: ImportVertex,
  line: ImportVertex[],
  endGuardM: number
): number {
  let best = Number.POSITIVE_INFINITY
  for (let index = 1; index < line.length; index += 1) {
    const dist = pointSegmentDistanceM(point, line[index - 1], line[index])
    if (dist < best) best = dist
  }
  if (haversineM(point, line[0]) <= endGuardM) return Number.POSITIVE_INFINITY
  if (haversineM(point, line[line.length - 1]) <= endGuardM) return Number.POSITIVE_INFINITY
  return best
}

/**
 * Cut meters off the start and/or end of a polyline, interpolating the new
 * endpoint on the segment the cut falls on. Chainage restarts at ch 0.
 */
export function trimLine(
  line: ImportVertex[],
  trimStartM: number,
  trimEndM: number
): ImportVertex[] {
  const total = polylineLengthM(line)
  const start = Math.max(0, Math.min(trimStartM, Math.max(0, total - 1)))
  const end = Math.max(0, Math.min(trimEndM, Math.max(0, total - 1 - start)))
  if (line.length < 2 || (start <= 0 && end <= 0)) return line.slice()
  const cutFrom = (vertices: ImportVertex[], distance: number): ImportVertex[] => {
    let remaining = distance
    for (let index = 1; index < vertices.length; index += 1) {
      const segLen = haversineM(vertices[index - 1], vertices[index])
      if (segLen >= remaining) {
        const ratio = segLen === 0 ? 0 : remaining / segLen
        const prev = vertices[index - 1]
        const next = vertices[index]
        return [
          {
            lat: prev.lat + (next.lat - prev.lat) * ratio,
            lng: prev.lng + (next.lng - prev.lng) * ratio
          },
          ...vertices.slice(index)
        ]
      }
      remaining -= segLen
    }
    return vertices.slice(-1)
  }
  let trimmed = cutFrom(line, start)
  trimmed = reversed(cutFrom(reversed(trimmed), end))
  return trimmed.length >= 2 ? trimmed : line.slice(0, 2)
}

export interface TemplateGeometryEdit {
  /** Redrawn alignment, or null when the stored alignment is kept. */
  line: ImportVertex[] | null
  /** Typed length in metres, or null when nothing was typed. */
  typedLengthM: number | null
  currentLengthM: number
  currentAlignment: ImportVertex[]
  currentSource: 'map' | 'manual'
}

/**
 * Shared template length rule for creation and editing: a redrawn line sets
 * the map alignment (a typed length overrides its measured length); with no
 * redraw a typed length wins, otherwise the stored length is kept.
 */
export function resolveTemplateGeometryEdit(edit: TemplateGeometryEdit): {
  alignment: ImportVertex[]
  source: 'map' | 'manual'
  lengthM: number
} {
  const measured = edit.line ? Math.round(polylineLengthM(edit.line)) : 0
  const typed = edit.typedLengthM != null && edit.typedLengthM > 0
    ? Math.round(edit.typedLengthM)
    : null
  const alignment = edit.line ?? edit.currentAlignment
  const source: 'map' | 'manual' = edit.line
    ? 'map'
    : typed != null && alignment.length < 2
      ? 'manual'
      : edit.currentSource
  const lengthM = edit.line ? typed ?? measured : typed ?? Math.round(edit.currentLengthM)
  return { alignment, source, lengthM }
}

export function middleOfLine(line: ImportVertex[]): ImportVertex {
  if (line.length < 2) return line[0]
  const total = polylineLengthM(line)
  let walked = 0
  for (let index = 1; index < line.length; index += 1) {
    const segLen = haversineM(line[index - 1], line[index])
    if (walked + segLen >= total / 2) {
      const ratio = segLen === 0 ? 0 : (total / 2 - walked) / segLen
      const prev = line[index - 1]
      const next = line[index]
      return {
        lat: prev.lat + (next.lat - prev.lat) * ratio,
        lng: prev.lng + (next.lng - prev.lng) * ratio
      }
    }
    walked += segLen
  }
  return line[line.length - 1]
}

function downsample(line: ImportVertex[], maxVertices: number): ImportVertex[] {
  if (line.length <= maxVertices) return line
  const stride = Math.ceil(line.length / maxVertices)
  const out = line.filter((_, index) => index % stride === 0)
  const last = line[line.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * Full intelligence pass: chains loose points, merges touching ends, splits
 * only genuinely disconnected lines into components, and attaches branches
 * as sub-components. Never splits by length — one connected line is always
 * one component.
 */
export function analyzeImportedGeometry(
  parsed: ParsedImportGeometry,
  toleranceM: number
): ImportAnalysis {
  const assumptions: string[] = [
    `Coordinates are read as WGS84 lat/lng (SHP .prj files are ignored). Gaps of ${toleranceM} m or less join; larger gaps stay separate components.`
  ]
  let totalVertices = parsed.lines.reduce((total, line) => total + line.length, 0) + parsed.points.length
  let downsampled = false
  let lines = parsed.lines.map((line) => dedupeVertices(line)).filter((line) => line.length >= 2)
  let loose = parsed.points.slice()
  if (totalVertices > IMPORT_MAX_VERTICES) {
    downsampled = true
    const budget = Math.max(2, Math.floor(IMPORT_MAX_VERTICES / Math.max(1, lines.length + 1)))
    lines = lines.map((line) => downsample(line, budget))
    loose = downsample(loose, budget)
    totalVertices = lines.reduce((total, line) => total + line.length, 0) + loose.length
  }
  if (downsampled) {
    assumptions.push(
      `Large file: vertices were thinned to ${totalVertices} to keep the map responsive.`
    )
  }
  if (parsed.ignored > 0) {
    assumptions.push(
      `${parsed.ignored} shape${parsed.ignored === 1 ? ' was' : 's were'} skipped (KML Point, LineString, GPS track and Polygon outer ring / SHP Point / PolyLine are read).`
    )
  }

  // Loose points: chains of 3+ become lines, pairs are reported, singles wait.
  const chains = chainLoosePoints(loose, toleranceM)
  const pairs: ImportVertex[][] = []
  const isolated: ImportVertex[] = []
  const chainLines: { vertices: ImportVertex[]; report: ImportChainReport }[] = []
  for (const chain of chains) {
    if (chain.length >= 3) {
      const report = chainReport(chain)
      chainLines.push({ vertices: chain, report })
      if (report.irregular) {
        assumptions.push(
          `A ${chain.length}-point chain has uneven spacing (${report.minGapM.toFixed(0)}–${report.maxGapM.toFixed(0)} m). It is still joined — remove it below if it looks wrong.`
        )
      }
    } else if (chain.length === 2) {
      pairs.push(chain)
    } else {
      isolated.push(chain[0])
    }
  }
  if (pairs.length) {
    assumptions.push(
      `${pairs.length} point pair${pairs.length === 1 ? '' : 's'} found — two points alone can't form a line, so ${pairs.length === 1 ? 'it is' : 'they are'} listed but not created.`
    )
  }
  const merged = mergeTouchingLines(
    [...lines, ...chainLines.map((entry) => entry.vertices)],
    toleranceM
  )
  const closedLoops = merged.filter(
    (line) => line.length >= 3 && haversineM(line[0], line[line.length - 1]) <= toleranceM
  ).length
  if (closedLoops) {
    assumptions.push(
      `${closedLoops} closed loop${closedLoops === 1 ? ' is' : 's are'} kept as ${closedLoops === 1 ? 'one line' : 'one line each'}.`
    )
  }

  // Branches: an endpoint touching another line's middle becomes a sub-component.
  const order = merged
    .map((line, index) => ({ line, index, length: polylineLengthM(line) }))
    .sort((a, b) => b.length - a.length)
  const branchOf = new Map<number, number>()
  for (const candidate of order) {
    for (const owner of order) {
      if (owner.index === candidate.index || branchOf.has(candidate.index)) continue
      if (owner.length < candidate.line.length) continue
      const touchesMiddle =
        distanceToLineInterior(candidate.line[0], owner.line, toleranceM) <= toleranceM ||
        distanceToLineInterior(candidate.line[candidate.line.length - 1], owner.line, toleranceM) <= toleranceM
      if (touchesMiddle) {
        branchOf.set(candidate.index, owner.index)
        break
      }
    }
  }
  if (branchOf.size) {
    assumptions.push(
      `${branchOf.size} smaller line${branchOf.size === 1 ? '' : 's'} touch${branchOf.size === 1 ? 'es' : ''} a main line's middle and ${branchOf.size === 1 ? 'becomes' : 'become'} sub-components.`
    )
  }

  const proposals: ImportProposal[] = []
  const topLines = order.filter((entry) => !branchOf.has(entry.index))
  topLines.forEach((entry) => {
    const lengthM = polylineLengthM(entry.line)
    proposals.push({
      key: `line-${entry.index}`,
      kind: 'component',
      parentKey: null,
      vertices: entry.line,
      point: middleOfLine(entry.line),
      lengthM,
      trimStartM: 0,
      trimEndM: 0,
      chain: chainLines.find((chain) => chain.vertices === entry.line)?.report ?? null,
      note: null
    })
  })
  // Name reaches in discovery order, not length order.
  const reachNumber = new Map<number, number>()
  topLines
    .slice()
    .sort((a, b) => a.index - b.index)
    .forEach((entry, reach) => reachNumber.set(entry.index, reach + 1))

  const branchCountByParent = new Map<number, number>()
  for (const [branchIndex, ownerIndex] of branchOf) {
    const line = merged[branchIndex]
    const count = (branchCountByParent.get(ownerIndex) ?? 0) + 1
    branchCountByParent.set(ownerIndex, count)
    proposals.push({
      key: `line-${branchIndex}`,
      kind: 'subcomponent',
      parentKey: `line-${ownerIndex}`,
      vertices: line,
      point: middleOfLine(line),
      lengthM: polylineLengthM(line),
      trimStartM: 0,
      trimEndM: 0,
      chain: null,
      note: `Branch ${count} of Reach ${reachNumber.get(ownerIndex) ?? '?'}`
    })
  }
  isolated.forEach((point, index) => {
    proposals.push({
      key: `point-${index}`,
      kind: 'component',
      parentKey: null,
      vertices: [],
      point,
      lengthM: 0,
      trimStartM: 0,
      trimEndM: 0,
      chain: null,
      note: 'Single point'
    })
  })
  return { proposals, assumptions, pairs, isolatedCount: isolated.length }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  const stream = new Blob([bytes.buffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** True when the buffer starts with the PK zip magic (a misnamed .kmz). */
export function looksLikeZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false
  const view = new DataView(buffer)
  return view.getUint8(0) === 0x50 && view.getUint8(1) === 0x4b
}

/** Decode bytes as UTF-8 text (a .kmz that is really plain KML). */
export function decodeUploadText(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer)
}

/**
 * KMZ is a zip archive holding KML (usually doc.kml). Walk the local file
 * headers, inflate the first .kml entry, and return its text for the KML
 * line parser. Lines only — same as KML.
 */
export async function extractKmlFromKmz(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  let offset = 0
  let kml: Uint8Array | null = null
  let guard = 0
  while (offset + 30 <= bytes.length && guard < 10000) {
    guard += 1
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.length) break
    if (flags & 0x08) {
      throw new Error('This KMZ uses data descriptors, which are not supported.')
    }
    if (!name.endsWith('/') && /\.kml$/i.test(name) && !kml) {
      const data = bytes.subarray(dataStart, dataEnd)
      if (method === 0) kml = data.slice()
      else if (method === 8) kml = await inflateRaw(data)
      else throw new Error(`This KMZ uses compression method ${method}, which is not supported.`)
    }
    offset = dataEnd
  }
  if (!kml) throw new Error('No KML file found inside this KMZ.')
  return decoder.decode(kml)
}
