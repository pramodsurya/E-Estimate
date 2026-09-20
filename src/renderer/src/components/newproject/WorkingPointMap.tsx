import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MapLayers from '../map/MapLayers'
import { cumulativeLengthsM, formatLengthM } from '../../lib/guideWall'

// Custom pins avoid the broken default-marker asset paths under bundlers.
const pinIcon = L.divIcon({
  className: 'ee-pin',
  html:
    '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#0e639c;' +
    'border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 5px rgba(0,0,0,.55)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 18]
})

const vertexIcon = L.divIcon({
  className: 'ee-vertex',
  html:
    '<div style="width:10px;height:10px;border-radius:50%;background:#0e639c;' +
    'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
})

const TELANGANA_CENTER: [number, number] = [17.9, 79.6]

export type WorkingGeometryMode = 'point' | 'line'

function ClickHandler({
  mode,
  frozen,
  onPickPoint,
  onAddVertex
}: {
  mode: WorkingGeometryMode
  frozen: boolean
  onPickPoint: (lat: number, lng: number) => void
  onAddVertex: (lat: number, lng: number) => void
}): null {
  useMapEvents({
    click: (event) => {
      if (frozen) return
      if (mode === 'point') onPickPoint(event.latlng.lat, event.latlng.lng)
      else onAddVertex(event.latlng.lat, event.latlng.lng)
    }
  })
  return null
}

function overlayIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'ee-overlay-vertex',
    html:
      `<div style="width:12px;height:12px;border-radius:50%;background:${color};` +
      'border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  })
}

/** Recenters on the current geometry when the parent bumps `token`. */
function FitOnToken({
  token,
  bounds
}: {
  token: number
  bounds: [number, number][]
}): null {
  const map = useMap()
  useEffect(() => {
    if (token <= 0 || bounds.length === 0) return
    if (bounds.length === 1) {
      map.flyTo(bounds[0], Math.max(map.getZoom(), 12))
    } else {
      map.flyToBounds(
        L.latLngBounds(bounds.map(([lat, lng]) => L.latLng(lat, lng))).pad(0.2)
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  return null
}

export default function WorkingPointMap({
  mode,
  point,
  line,
  fitToken,
  frozen = false,
  overlays = [],
  onPickPoint,
  onAddVertex
}: {
  mode: WorkingGeometryMode
  point: { lat: number; lng: number } | null
  line: { lat: number; lng: number }[]
  fitToken: number
  frozen?: boolean
  overlays?: { points: { lat: number; lng: number }[]; color: string }[]
  onPickPoint: (lat: number, lng: number) => void
  onAddVertex: (lat: number, lng: number) => void
}): JSX.Element {
  const focus = point ?? line[0] ?? overlays[0]?.points[0] ?? null
  const cum = cumulativeLengthsM(line)
  const bounds: [number, number][] = [
    ...(point ? [[point.lat, point.lng] as [number, number]] : []),
    ...line.map((vertex) => [vertex.lat, vertex.lng] as [number, number]),
    ...overlays.flatMap((overlay) =>
      overlay.points.map((vertex) => [vertex.lat, vertex.lng] as [number, number])
    )
  ]
  return (
    <div className="map-wrap">
      <MapContainer
        center={focus ? [focus.lat, focus.lng] : TELANGANA_CENTER}
        zoom={focus ? 12 : 7}
        scrollWheelZoom
        keyboard={false}
      >
        <MapLayers />
        <ClickHandler mode={mode} frozen={frozen} onPickPoint={onPickPoint} onAddVertex={onAddVertex} />
        {point && <Marker position={[point.lat, point.lng]} icon={pinIcon} />}
        {line.length > 0 && (
          <Polyline
            positions={line.map((vertex) => [vertex.lat, vertex.lng] as [number, number])}
            pathOptions={{ color: '#0e639c', weight: 3 }}
          />
        )}
        {line.map((vertex, index) => (
          <Marker
            key={`${vertex.lat},${vertex.lng},${index}`}
            position={[vertex.lat, vertex.lng]}
            icon={vertexIcon}
          >
            <Tooltip permanent direction="top" offset={[0, -10]} opacity={1}>
              <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {index === 0
                  ? `#${index + 1} Start`
                  : `#${index + 1} +${formatLengthM(cum[index] - cum[index - 1])} · ${formatLengthM(cum[index])}`}
              </span>
            </Tooltip>
          </Marker>
        ))}
        {overlays.map((overlay, overlayIndex) =>
          overlay.points.length >= 2 ? (
            <Polyline
              key={`overlay-${overlayIndex}`}
              positions={overlay.points.map(
                (vertex) => [vertex.lat, vertex.lng] as [number, number]
              )}
              pathOptions={{ color: overlay.color, weight: 4 }}
            />
          ) : overlay.points.length === 1 ? (
            <Marker
              key={`overlay-${overlayIndex}`}
              position={[overlay.points[0].lat, overlay.points[0].lng]}
              icon={overlayIcon(overlay.color)}
            />
          ) : null
        )}
        <FitOnToken token={fitToken} bounds={bounds} />
      </MapContainer>
    </div>
  )
}
