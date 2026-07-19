import { useEffect, useMemo, useReducer, useState } from 'react'
import L from 'leaflet'
import { ImageOverlay, LayerGroup, useMap, useMapEvents } from 'react-leaflet'

const TILE_ROOT = 'https://pub-1f022f4a6cbd43dab0ae7f7752d325b4.r2.dev/tiles'
const TOPO_ATTRIBUTION = 'Toposheet imagery: supplied KMZ'
const TOPO_PANE = 'eestimate-toposheet'
const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

const MOSAIC_BOUNDS = {
  west: 77,
  south: 15.75,
  east: 81.5,
  north: 20
}

type SheetEntry = readonly [id: string, west: number, south: number]

// Extracted from "Toposheet and Survey Layer (1).kmz". Every sheet is 0.25° square.
const TRANSPARENT_SHEETS: SheetEntry[] = [
  ['D43F13_57E13', 77.75, 15.75],
  ['D43F9_57E9', 77.5, 15.75],
  ['D44A1_57I1', 78, 15.75],
  ['D44A5_57I5', 78.25, 15.75],
  ['E43F15_56E15', 77.75, 19.25],
  ['E43F16_56E16', 77.75, 19],
  ['E43L10_56F10', 77.5, 18.5],
  ['E43L11_56F11', 77.5, 18.25],
  ['E43L12_56F12', 77.5, 18],
  ['E43L13_56F13', 77.75, 18.75],
  ['E43L14_56F14', 77.75, 18.5],
  ['E43L15_56F15', 77.75, 18.25],
  ['E43L16_56F16', 77.75, 18],
  ['E43R10_56G10', 77.5, 17.5],
  ['E43R11_56G11', 77.5, 17.25],
  ['E43R12_56G12', 77.5, 17],
  ['E43R13_56G13', 77.75, 17.75],
  ['E43R14_56G14', 77.75, 17.5],
  ['E43R15_56G15', 77.75, 17.25],
  ['E43R16_56G16', 77.75, 17],
  ['E43R6_56G6', 77.25, 17.5],
  ['E43R7_56G7', 77.25, 17.25],
  ['E43R8_56G8', 77.25, 17],
  ['E43R9_56G9', 77.5, 17.75],
  ['E43X10_56H10', 77.5, 16.5],
  ['E43X11_56H11', 77.5, 16.25],
  ['E43X12_56H12', 77.5, 16],
  ['E43X13_56H13', 77.75, 16.75],
  ['E43X14_56H14', 77.75, 16.5],
  ['E43X15_56H15', 77.75, 16.25],
  ['E43X16_56H16', 77.75, 16],
  ['E43X3_56H3', 77, 16.25],
  ['E43X5_56H5', 77.25, 16.75],
  ['E43X6_56H6', 77.25, 16.5],
  ['E43X7_56H7', 77.25, 16.25],
  ['E43X8_56H8', 77.25, 16],
  ['E43X9_56H9', 77.5, 16.75],
  ['E44A10_56I10', 78.5, 19.5],
  ['E44A12_56I12', 78.5, 19],
  ['E44A13_56I13', 78.75, 19.75],
  ['E44A14_56I14', 78.75, 19.5],
  ['E44A15_56I15', 78.75, 19.25],
  ['E44A16_56I16', 78.75, 19],
  ['E44A3_56I3', 78, 19.25],
  ['E44A4_56I4', 78, 19],
  ['E44A5_56I5', 78.25, 19.75],
  ['E44A6_56I6', 78.25, 19.5],
  ['E44A7_56I7', 78.25, 19.25],
  ['E44A8_56I8', 78.25, 19],
  ['E44A9_56I9', 78.5, 19.75],
  ['E44B10_56M10', 79.5, 19.5],
  ['E44B11_56M11', 79.5, 19.25],
  ['E44B12_56M12', 79.5, 19],
  ['E44B14_56M14', 79.75, 19.5],
  ['E44B15_56M15', 79.75, 19.25],
  ['E44B16_56M16', 79.75, 19],
  ['E44B2_56M2', 79, 19.5],
  ['E44B3_56M3', 79, 19.25],
  ['E44B4_56M4', 79, 19],
  ['E44B6_56M6', 79.25, 19.5],
  ['E44B7_56M7', 79.25, 19.25],
  ['E44B8_56M8', 79.25, 19],
  ['E44G10_56J10', 78.5, 18.5],
  ['E44G11_56J11', 78.5, 18.25],
  ['E44G12_56J12', 78.5, 18],
  ['E44G13_56J13', 78.75, 18.75],
  ['E44G14_56J14', 78.75, 18.5],
  ['E44G15_56J15', 78.75, 18.25],
  ['E44G16_56J16', 78.75, 18],
  ['E44G1_56J1', 78, 18.75],
  ['E44G2_56J2', 78, 18.5],
  ['E44G3_56J3', 78, 18.25],
  ['E44G4_56J4', 78, 18],
  ['E44G5_56J5', 78.25, 18.75],
  ['E44G6_56J6', 78.25, 18.5],
  ['E44G7_56J7', 78.25, 18.25],
  ['E44G8_56J8', 78.25, 18],
  ['E44G9_56J9', 78.5, 18.75],
  ['E44H10_56N10', 79.5, 18.5],
  ['E44H11_56N11', 79.5, 18.25],
  ['E44H12_56N12', 79.5, 18],
  ['E44H13_56N13', 79.75, 18.75],
  ['E44H14_56N14', 79.75, 18.5],
  ['E44H15_56N15', 79.75, 18.25],
  ['E44H16_56N16', 79.75, 18],
  ['E44H1_56N1', 79, 18.75],
  ['E44H3_56N3', 79, 18.25],
  ['E44H4_56N4', 79, 18],
  ['E44H5_56N5', 79.25, 18.75],
  ['E44H6_56N6', 79.25, 18.5],
  ['E44H7_56N7', 79.25, 18.25],
  ['E44H8_56N8', 79.25, 18],
  ['E44H9_56N9', 79.5, 18.75],
  ['E44I10_65B10', 80.5, 18.5],
  ['E44I11_65B11', 80.5, 18.25],
  ['E44I12_65B12', 80.5, 18],
  ['E44I15_65B15', 80.75, 18.25],
  ['E44I16_65B16', 80.75, 18],
  ['E44I1_65B1', 80, 18.75],
  ['E44I2_65B2', 80, 18.5],
  ['E44I3_65B3', 80, 18.25],
  ['E44I4_65B4', 80, 18],
  ['E44I6_65B6', 80.25, 18.5],
  ['E44I7_65B7', 80.25, 18.25],
  ['E44I8_65B8', 80.25, 18],
  ['E44M10_56K10', 78.5, 17.5],
  ['E44M11_56K11', 78.5, 17.25],
  ['E44M12_56K12', 78.5, 17],
  ['E44M13_56K13', 78.75, 17.75],
  ['E44M14_56K14', 78.75, 17.5],
  ['E44M15_56k15', 78.75, 17.25],
  ['E44M16_56k16', 78.75, 17],
  ['E44M1_56K1', 78, 17.75],
  ['E44M2_56k2', 78, 17.5],
  ['E44M3_56k3', 78, 17.25],
  ['E44M4_56k4', 78, 17],
  ['E44M5_56K5', 78.25, 17.75],
  ['E44M6_56K6', 78.25, 17.5],
  ['E44M7_56K7', 78.25, 17.25],
  ['E44M8_56K8', 78.25, 17],
  ['E44M9_56K9', 78.5, 17.75],
  ['E44N10_56O10', 79.5, 17.5],
  ['E44N11_56O11', 79.5, 17.25],
  ['E44N12_56O12', 79.5, 17],
  ['E44N13_56O13', 79.75, 17.75],
  ['E44N14_56O14', 79.75, 17.5],
  ['E44N15_56O15', 79.75, 17.25],
  ['E44N16_56O16', 79.75, 17],
  ['E44N1_56O1', 79, 17.75],
  ['E44N2_56O2', 79, 17.5],
  ['E44N3_56O3', 79, 17.25],
  ['E44N4_56O4', 79, 17],
  ['E44N5_56O5', 79.25, 17.75],
  ['E44N6_56O6', 79.25, 17.5],
  ['E44N7_56O7', 79.25, 17.25],
  ['E44N8_56O8', 79.25, 17],
  ['E44N9_56O9', 79.5, 17.75],
  ['E44O10_65C10', 80.5, 17.5],
  ['E44O11_65C11', 80.5, 17.25],
  ['E44O12_65C12', 80.5, 17],
  ['E44O13_65C13', 80.75, 17.75],
  ['E44O14_65C14', 80.75, 17.5],
  ['E44O15_65C15', 80.75, 17.25],
  ['E44O16_65C16', 80.75, 17],
  ['E44O1_65C1', 80, 17.75],
  ['E44O2_65C2', 80, 17.5],
  ['E44O3_65C3', 80, 17.25],
  ['E44O4_65C4', 80, 17],
  ['E44O5_65C5', 80.25, 17.75],
  ['E44O6_65C6', 80.25, 17.5],
  ['E44O7_65C7', 80.25, 17.25],
  ['E44O8_65C8', 80.25, 17],
  ['E44O9_65C9', 80.5, 17.75],
  ['E44P1_65G1', 81, 17.75],
  ['E44P2_65G2', 81, 17.5],
  ['E44P3_65G3', 81, 17.25],
  ['E44P4_65G4', 81, 17],
  ['E44P7_65G7', 81.25, 17.25],
  ['E44S10_56L10', 78.5, 16.5],
  ['E44S11_56L11', 78.5, 16.25],
  ['E44S12_56L12', 78.5, 16],
  ['E44S13_56L13', 78.75, 16.75],
  ['E44S14_56L14', 78.75, 16.5],
  ['E44S15_56L15', 78.75, 16.25],
  ['E44S16_56L16', 78.75, 16],
  ['E44S1_56L1', 78, 16.75],
  ['E44S2_56L2', 78, 16.5],
  ['E44S3_56L3', 78, 16.25],
  ['E44S4_56L4', 78, 16],
  ['E44S5_56L5', 78.25, 16.75],
  ['E44S6_56L6', 78.25, 16.5],
  ['E44S7_56L7', 78.25, 16.25],
  ['E44S8_56L8', 78.25, 16],
  ['E44S9_56L9', 78.5, 16.75],
  ['E44T10_56P10', 79.5, 16.5],
  ['E44T13_56P13', 79.75, 16.75],
  ['E44T14_56P14', 79.75, 16.5],
  ['E44T1_56P1', 79, 16.75],
  ['E44T2_56P2', 79, 16.5],
  ['E44T3_56P3', 79, 16.25],
  ['E44T4_56P4', 79, 16],
  ['E44T5_56P5', 79.25, 16.75],
  ['E44T6_56P6', 79.25, 16.5],
  ['E44T9_56P9', 79.5, 16.75],
  ['E44U1_65D1', 80, 16.75],
  ['E44U2_65D2', 80, 16.5],
  ['E44U5_65D5', 80.25, 16.75],
  ['E44U9_65D9', 80.5, 16.75]
]

interface VisibleTile {
  key: string
  url: string
  bounds: L.LatLngBoundsExpression
}

function tileRange(
  view: L.LatLngBounds,
  west: number,
  south: number,
  east: number,
  north: number,
  level: number
): Array<{ x: number; y: number; bounds: L.LatLngBoundsExpression }> {
  const divisions = 2 ** level
  const width = (east - west) / divisions
  const height = (north - south) / divisions
  const minX = Math.max(Math.floor((view.getWest() - west) / width), 0)
  const maxX = Math.min(Math.floor((view.getEast() - west) / width), divisions - 1)
  const minY = Math.max(Math.floor((north - view.getNorth()) / height), 0)
  const maxY = Math.min(Math.floor((north - view.getSouth()) / height), divisions - 1)
  const tiles: Array<{ x: number; y: number; bounds: L.LatLngBoundsExpression }> = []
  if (minX > maxX || minY > maxY) return tiles
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tileWest = west + x * width
      const tileEast = tileWest + width
      const tileNorth = north - y * height
      const tileSouth = tileNorth - height
      tiles.push({
        x,
        y,
        bounds: [[tileSouth, tileWest], [tileNorth, tileEast]]
      })
    }
  }
  return tiles
}

function useToposheetMapState(): { map: L.Map; revision: number; paneReady: boolean } {
  const map = useMap()
  const [revision, bump] = useReducer((value: number) => value + 1, 0)
  const [paneReady, setPaneReady] = useState(false)
  useMapEvents({ moveend: bump, zoomend: bump, resize: bump })
  useEffect(() => {
    let pane = map.getPane(TOPO_PANE)
    if (!pane) pane = map.createPane(TOPO_PANE)
    pane.style.zIndex = '250'
    pane.style.pointerEvents = 'none'
    setPaneReady(true)
  }, [map])
  useEffect(() => {
    map.attributionControl?.addAttribution(TOPO_ATTRIBUTION)
    return () => {
      map.attributionControl?.removeAttribution(TOPO_ATTRIBUTION)
    }
  }, [map])
  return { map, revision, paneReady }
}

function TileImages({ tiles }: { tiles: VisibleTile[] }): JSX.Element {
  return (
    <>
      {tiles.map((tile) => (
        <ImageOverlay
          key={tile.key}
          url={tile.url}
          bounds={tile.bounds}
          pane={TOPO_PANE}
          interactive={false}
          errorOverlayUrl={EMPTY_IMAGE}
          alt="Toposheet"
        />
      ))}
    </>
  )
}

export function KmzOpaqueToposheetLayer({ qualityBias = 0 }: { qualityBias?: number }): JSX.Element {
  const { map, revision, paneReady } = useToposheetMapState()
  const tiles = useMemo<VisibleTile[]>(() => {
    if (!paneReady) return []
    const level = Math.min(Math.max(Math.floor(map.getZoom()) - 8 + qualityBias, 0), 7)
    const view = map.getBounds().pad(0.05)
    return tileRange(
      view,
      MOSAIC_BOUNDS.west,
      MOSAIC_BOUNDS.south,
      MOSAIC_BOUNDS.east,
      MOSAIC_BOUNDS.north,
      level
    ).map((tile) => ({
      key: `mosaic:${level}:${tile.x}:${tile.y}`,
      url: `${TILE_ROOT}/mosaic/${level}/${tile.x}_${tile.y}.png`,
      bounds: tile.bounds
    }))
  }, [map, paneReady, qualityBias, revision])
  return <LayerGroup>{paneReady && <TileImages tiles={tiles} />}</LayerGroup>
}

export function KmzTransparentToposheetLayer({ qualityBias = 0 }: { qualityBias?: number }): JSX.Element {
  const { map, revision, paneReady } = useToposheetMapState()
  const tiles = useMemo<VisibleTile[]>(() => {
    if (!paneReady || (qualityBias === 0 && map.getZoom() < 10)) return []
    const level = Math.min(Math.max(Math.floor(map.getZoom()) - 12 + qualityBias, 0), 3)
    const view = map.getBounds().pad(0.05)
    const visible: VisibleTile[] = []
    for (const [sheetId, west, south] of TRANSPARENT_SHEETS) {
      const east = west + 0.25
      const north = south + 0.25
      if (!view.intersects([[south, west], [north, east]])) continue
      for (const tile of tileRange(view, west, south, east, north, level)) {
        visible.push({
          key: `${sheetId}:${level}:${tile.x}:${tile.y}`,
          url: `${TILE_ROOT}/transparent/${sheetId}/${level}/${tile.x}_${tile.y}.png`,
          bounds: tile.bounds
        })
      }
    }
    return visible
  }, [map, paneReady, qualityBias, revision])
  return <LayerGroup>{paneReady && <TileImages tiles={tiles} />}</LayerGroup>
}
