import { LayerGroup, LayersControl, TileLayer } from 'react-leaflet'
import {
  KmzOpaqueToposheetLayer,
  KmzTransparentToposheetLayer
} from './KmzToposheetLayers'

const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
/** Compact, shared base-map and transparent topographic overlay control. */
export default function MapLayers({ printQuality = false }: { printQuality?: boolean }): JSX.Element {
  const toposheetQualityBias = printQuality ? 4 : 0
  return (
    <LayersControl position="topright" collapsed>
      <LayersControl.BaseLayer name="Map">
        <TileLayer
          attribution={OSM_ATTRIBUTION}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <TileLayer
          attribution={SATELLITE_ATTRIBUTION}
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked name="Toposheet">
        <KmzOpaqueToposheetLayer qualityBias={toposheetQualityBias} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Transparent Toposheet">
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
