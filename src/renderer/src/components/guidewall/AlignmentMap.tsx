import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  useMap,
  useMapEvents
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MapLayers from '../map/MapLayers'
import type { GuideWallPoint } from '../../types/project'
import {
  bearingAtChainage,
  chainageAtPoint,
  formatChainage,
  perpendicularTick,
  pointAtChainage,
  sublineBetween
} from '../../lib/guideWall'

export type AlignmentMapMode = 'draw' | 'mark' | 'view'

interface Props {
  points: GuideWallPoint[]
  mode: AlignmentMapMode
  totalLengthM: number
  /** Draw mode: a map click appends an alignment vertex. */
  onAddPoint?: (point: GuideWallPoint) => void
  /** Mark mode: a click near the line reports the chainage of the nearest point. */
  onPlaceBreak?: (ch: number) => void
  /** Chainages rendered as short perpendicular section marks. */
  ticks?: number[]
  /** Chainage range highlighted on the line (the selected section). */
  highlight?: { fromCh: number; toCh: number } | null
  /** Fallback centre before any point exists (component/project location). */
  fallbackCenter?: { lat: number; lng: number } | null
}

const TELANGANA_CENTER: [number, number] = [17.9, 79.6]

function chLabelIcon(text: string): L.DivIcon {
  return L.divIcon({
    className: 'gw-ch-label',
    html: `<span>${text}</span>`,
    iconSize: [0, 0]
  })
}

function arrowIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: 'gw-arrow',
    html: `<span style="transform: rotate(${bearing}deg)">▲</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  })
}

function ClickHandler({
  mode,
  points,
  onAddPoint,
  onPlaceBreak
}: Pick<Props, 'mode' | 'points' | 'onAddPoint' | 'onPlaceBreak'>): null {
  useMapEvents({
    click: (event) => {
      const clicked = { lat: event.latlng.lat, lng: event.latlng.lng }
      if (mode === 'draw') onAddPoint?.(clicked)
      if (mode === 'mark') {
        const ch = chainageAtPoint(points, clicked)
        if (ch != null) onPlaceBreak?.(Math.round(ch * 10) / 10)
      }
    }
  })
  return null
}

function FitToAlignment({ points }: { points: GuideWallPoint[] }): null {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (points.length < 2 || fitted.current) return
    fitted.current = true
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30] })
  }, [map, points])
  return null
}

export default function AlignmentMap({
  points,
  mode,
  totalLengthM,
  onAddPoint,
  onPlaceBreak,
  ticks = [],
  highlight,
  fallbackCenter
}: Props): JSX.Element {
  const positions = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points])
  const hasLine = points.length >= 2

  const tickLines = useMemo(() => {
    if (!hasLine) return []
    return ticks
      .map((ch) => perpendicularTick(points, ch, 10))
      .filter((pair): pair is [GuideWallPoint, GuideWallPoint] => pair !== null)
      .map((pair) => pair.map((p) => [p.lat, p.lng] as [number, number]))
  }, [hasLine, points, ticks])

  const highlightLine = useMemo(() => {
    if (!hasLine || !highlight) return []
    return sublineBetween(points, highlight.fromCh, highlight.toCh).map(
      (p) => [p.lat, p.lng] as [number, number]
    )
  }, [hasLine, points, highlight])

  const endLabels = useMemo(() => {
    if (!hasLine) return []
    const start = points[0]
    const end = points[points.length - 1]
    return [
      { key: 'start', at: start, text: 'Ch 0' },
      { key: 'end', at: end, text: `Ch ${formatChainage(Math.round(totalLengthM))}` }
    ]
  }, [hasLine, points, totalLengthM])

  const arrow = useMemo(() => {
    if (!hasLine) return null
    const midCh = polyMid(totalLengthM)
    const at = pointAtChainage(points, midCh)
    const bearing = bearingAtChainage(points, midCh)
    if (!at || bearing == null) return null
    return { at, bearing }
  }, [hasLine, points, totalLengthM])

  const center: [number, number] = hasLine
    ? positions[0]
    : fallbackCenter
      ? [fallbackCenter.lat, fallbackCenter.lng]
      : TELANGANA_CENTER

  return (
    <div className={`gw-map ${mode !== 'view' ? 'gw-map-editing' : ''}`}>
      <MapContainer center={center} zoom={hasLine || fallbackCenter ? 14 : 7} scrollWheelZoom>
        <MapLayers />
        <ClickHandler mode={mode} points={points} onAddPoint={onAddPoint} onPlaceBreak={onPlaceBreak} />
        {hasLine && <FitToAlignment points={points} />}
        {hasLine && <Polyline positions={positions} pathOptions={{ color: '#1d7fd4', weight: 4 }} />}
        {tickLines.map((line, index) => (
          <Polyline
            key={`tick-${index}`}
            positions={line}
            pathOptions={{ color: '#e8b93e', weight: 2, opacity: 0.9 }}
          />
        ))}
        {highlightLine.length >= 2 && (
          <Polyline positions={highlightLine} pathOptions={{ color: '#e24b4a', weight: 7, opacity: 0.95 }} />
        )}
        {mode === 'draw' &&
          points.map((p, index) => (
            <CircleMarker
              key={`v-${index}`}
              center={[p.lat, p.lng]}
              radius={4}
              pathOptions={{ color: '#ffffff', fillColor: '#1d7fd4', fillOpacity: 1, weight: 1.5 }}
            />
          ))}
        {endLabels.map((label) => (
          <Marker
            key={label.key}
            position={[label.at.lat, label.at.lng]}
            icon={chLabelIcon(label.text)}
            interactive={false}
          />
        ))}
        {arrow && (
          <Marker
            position={[arrow.at.lat, arrow.at.lng]}
            icon={arrowIcon(arrow.bearing)}
            interactive={false}
          />
        )}
      </MapContainer>
    </div>
  )
}

function polyMid(totalLengthM: number): number {
  return totalLengthM > 0 ? totalLengthM / 2 : 0
}
