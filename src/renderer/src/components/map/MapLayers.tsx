import { LayerGroup, LayersControl, TileLayer } from 'react-leaflet'
import {
  KmzOpaqueToposheetLayer,
  KmzTransparentToposheetLayer
} from './KmzToposheetLayers'

const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
export type MapLayerType = 'map' | 'satellite' | 'toposheet' | 'toposheet_transparent'

/** Compact, shared base-map and transparent topographic overlay control. */
export default function MapLayers({
  printQuality = false,
  selected = 'toposheet',
  showControl = true
}: {
  printQuality?: boolean
  selected?: MapLayerType
  showControl?: boolean
}): JSX.Element {
  const toposheetQualityBias = printQuality ? 4 : 0
  if (!showControl) {
    if (selected === 'map') {
      return <TileLayer attribution={OSM_ATTRIBUTION} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    }
    if (selected === 'satellite') {
      return (
        <TileLayer
          attribution={SATELLITE_ATTRIBUTION}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
      )
    }
    if (selected === 'toposheet_transparent') {
      return (
        <LayerGroup>
          <TileLayer
            attribution={SATELLITE_ATTRIBUTION}
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <KmzTransparentToposheetLayer qualityBias={toposheetQualityBias} />
        </LayerGroup>
      )
    }
    return <KmzOpaqueToposheetLayer qualityBias={toposheetQualityBias} />
  }
  return (
    <LayersControl position="topright" collapsed>
      <LayersControl.BaseLayer checked={selected === 'map'} name="Map">
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked={selected === 'satellite'} name="Satellite">
        <TileLayer
          attribution={SATELLITE_ATTRIBUTION}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked={selected === 'toposheet'} name="Toposheet">
        <KmzOpaqueToposheetLayer qualityBias={toposheetQualityBias} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked={selected === 'toposheet_transparent'} name="Transparent Toposheet">
        <LayerGroup>
          <TileLayer
            attribution={SATELLITE_ATTRIBUTION}
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <KmzTransparentToposheetLayer qualityBias={toposheetQualityBias} />
        </LayerGroup>
      </LayersControl.BaseLayer>
    </LayersControl>
  )
}
