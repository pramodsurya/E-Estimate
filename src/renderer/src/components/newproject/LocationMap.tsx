import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MapLayers from '../map/MapLayers'

// Custom pin avoids the broken default-marker asset paths under bundlers.
const pinIcon = L.divIcon({
  className: 'ee-pin',
  html:
    '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#0e639c;' +
    'border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 5px rgba(0,0,0,.55)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 18]
})

const TELANGANA_CENTER: [number, number] = [17.9, 79.6]

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }): null {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng)
  })
  return null
}

function Recenter({ lat, lng, token }: { lat: number; lng: number; token: number }): null {
  const map = useMap()
  useEffect(() => {
    if (token > 0) map.flyTo([lat, lng], Math.max(map.getZoom(), 12))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  return null
}

interface Props {
  value: { lat: number; lng: number } | null
  onPick: (lat: number, lng: number) => void
  recenterToken: number
}

export default function LocationMap({ value, onPick, recenterToken }: Props): JSX.Element {
  return (
    <div className="map-wrap">
      <MapContainer
        center={value ? [value.lat, value.lng] : TELANGANA_CENTER}
        zoom={value ? 12 : 7}
        scrollWheelZoom
      >
        <MapLayers />
        <ClickPicker onPick={onPick} />
        {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
        {value && <Recenter lat={value.lat} lng={value.lng} token={recenterToken} />}
      </MapContainer>
    </div>
  )
}
