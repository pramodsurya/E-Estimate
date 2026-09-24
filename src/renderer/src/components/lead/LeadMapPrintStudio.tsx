import { useEffect, useRef, useState } from 'react'
import { Download, Eraser, LoaderCircle, LockKeyhole, Minimize2, Printer, X } from 'lucide-react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ScaleControl,
  Tooltip,
  useMap,
  useMapEvents
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MapLayers from '../map/MapLayers'
import LeadMapPrintLayout from './LeadMapPrintLayout'
import SignatureFooterPrint from '../signature/SignatureFooterPrint'
import { leadRouteColor } from '../../lib/lead'
import { LEAD_MAP_IMAGE_PATH, mapPageStyle } from '../../lib/leadMapGeometry'
import { captureLeadMapPng, formatMapCaptureError, prepareLeadMapForCapture } from '../../lib/leadMapCapture'
import { normalizeLeadPrintSettings } from '../../lib/leadPrintLayout'
import { compileSavedLeadMapPdf } from '../../lib/typist-output/leadMapTypst'
import { applyDocumentSettingsToTypst } from '../../lib/typist-output/documentSettings'
import {
  injectSavedLeadMapTypst,
  leadTypstTemplate,
  resolveLeadDocumentSettings
} from '../../lib/typist-output/leadTypst'
import PdfPageStack from '../print/PdfPageStack'
import { useStore } from '../../store/useStore'
import type {
  LeadApplication,
  LeadAssignment,
  LeadMapDirection,
  LeadPoint,
  LeadPrintSettings,
  LeadVariant,
  ProjectLocation,
  SignatureFooterSettings
} from '../../types/project'

interface Props {
  year: string
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  points: LeadPoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  printSettings?: LeadPrintSettings
  signatureFooter?: SignatureFooterSettings
  onUpdatePrintSettings: (settings: LeadPrintSettings) => void
  onClose: () => void
}

export interface LeadMapPrintPageProps {
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  points: LeadPoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  printSettings?: LeadPrintSettings
  signatureFooter?: SignatureFooterSettings
  onUpdatePrintSettings?: (settings: LeadPrintSettings) => void
  interactive?: boolean
  ref?: React.Ref<HTMLElement>
}

interface RoutePoint {
  id: string
  code: string
  label: string
  lat: number
  lon: number
}

interface RouteLine {
  id: string
  label: string
  color: string
  from: RoutePoint
  to: RoutePoint
  geometry: [number, number][]
  variantId?: string
  dashed?: boolean
  hideEndpoints?: boolean
  hideLabel?: boolean
}

const PROJECT_POINT_ID = '__project_work_location__'
const km = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export default function LeadMapPrintStudio({
  year,
  variants,
  applications,
  assignments,
  points,
  site,
  mapDirections,
  printSettings,
  signatureFooter,
  onUpdatePrintSettings,
  onClose
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const minimizedRef = useRef(false)
  const pageRef = useRef<HTMLElement>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const captureEpochRef = useRef(0)
  const layout = normalizeLeadPrintSettings(printSettings)
  const routes = (buildRouteLines(variants, applications, assignments, points, site, mapDirections))
  const storedMapImage = useStore((state) =>
    Boolean(state.project?.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH])
  )
  const mapFixed = storedMapImage
  const editorLocked = mapFixed || busy

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleCloseOrMinimize = (): void => {
    if (downloading) {
      minimizedRef.current = true
      setMinimized(true)
      useStore.getState().upsertAppNotification({
        id: 'lead-map-image',
        kind: 'map',
        status: 'running',
        title: 'Fixing route map in background',
        message: 'Downloading map tiles and stitching image in background. You can continue working in other tabs.'
      })
    } else {
      onClose()
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (previewUrl) {
        setPreviewUrl(null)
        return
      }
      if (downloading) {
        minimizedRef.current = true
        setMinimized(true)
        useStore.getState().upsertAppNotification({
          id: 'lead-map-image',
          kind: 'map',
          status: 'running',
          title: 'Fixing route map in background',
          message: 'Downloading map tiles and stitching image in background. You can continue working in other tabs.'
        })
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [downloading, onClose, previewUrl])

  const fixMap = async (): Promise<void> => {
    if (busy || downloading) return
    setBusy(true)
    setDownloading(true)
    const epoch = ++captureEpochRef.current
    const notificationId = 'lead-map-image'
    let committed = false
    try {
      setStatus('Capturing map for the project…')
      const current = useStore.getState().project
      if (!current) throw new Error('No project is open.')
      useStore.getState().upsertAppNotification({
        id: notificationId,
        kind: 'map',
        status: 'running',
        title: 'Fixing route map',
        message: 'Capturing the adjusted map image…',
        progress: 0
      })
      await prepareLeadMapForCapture(pageRef.current)
      if (epoch !== captureEpochRef.current) return
      const capture = await captureLeadMapPng(
        pageRef.current,
        layout,
        signatureFooter,
        true,
        current.printStudioShadowFiles ?? {},
        (step, downloaded, total) => {
          if (step === 'tiles') {
            const pct = total > 0 ? Math.min(80, Math.round((downloaded / total) * 80)) : 0
            const msg = `Downloading map tiles (${downloaded}/${total})…`
            setStatus(msg)
            useStore.getState().upsertAppNotification({
              id: notificationId,
              kind: 'map',
              status: 'running',
              title: 'Fixing route map',
              message: msg,
              progress: pct
            })
          } else if (step === 'stitching') {
            const msg = 'Stitching map image…'
            setStatus(msg)
            useStore.getState().upsertAppNotification({
              id: notificationId,
              kind: 'map',
              status: 'running',
              title: 'Fixing route map',
              message: msg,
              progress: 85
            })
          }
        }
      )
      if (epoch !== captureEpochRef.current) return
      const typstSource = injectSavedLeadMapTypst(
        current.printStudioDocuments?.['lead-statement'],
        layout,
        signatureFooter,
        applyDocumentSettingsToTypst(leadTypstTemplate(), resolveLeadDocumentSettings(current))
      )
      useStore.getState().commitLeadMapPrint({
        pngDataUrl: capture.dataUrl,
        typstSource,
        printSettings: layout,
        tileFiles: capture.tileFiles
      })
      committed = true
      setDownloading(false)
      setStatus('Storing fixed map inside the project…')
      useStore.getState().upsertAppNotification({
        id: notificationId,
        kind: 'map',
        status: 'running',
        title: 'Route map fixed',
        message: 'The map is locked. Saving continues in the background; you can close Map Print Studio.',
        progress: 95
      })
      await useStore.getState().saveProject({ requireSaved: true })
      if (epoch !== captureEpochRef.current) return
      setStatus('Map fixed and stored inside the project.')
      useStore.getState().upsertAppNotification({
        id: notificationId,
        kind: 'map',
        status: 'complete',
        title: 'Route map image ready',
        message: 'The fixed image is stored in the project and is ready to download.',
        progress: 100
      }, true)
      if (minimizedRef.current) {
        onClose()
      }
    } catch (error) {
      if (committed) useStore.getState().clearLeadMapPrint()
      const message = formatMapCaptureError(error)
      setStatus(message)
      useStore.getState().upsertAppNotification({
        id: notificationId,
        kind: 'map',
        status: 'error',
        title: 'Route map could not be fixed',
        message,
        progress: undefined
      }, true)
      if (minimizedRef.current) {
        onClose()
      }
    } finally {
      setDownloading(false)
      setBusy(false)
    }
  }

  const downloadMapImage = async (): Promise<void> => {
    const current = useStore.getState().project
    const dataUrl = current?.printStudioShadowFiles?.[LEAD_MAP_IMAGE_PATH]
    if (!dataUrl) return
    try {
      const result = await window.api.export.png(
        dataUrl.replace(/^data:image\/png;base64,/, ''),
        `${current?.meta.name || 'Lead Route Map'} - route map`
      )
      if (!result.canceled) setStatus('Fixed map image downloaded.')
    } catch (error) {
      setStatus(formatMapCaptureError(error))
    }
  }

  const clearMap = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    captureEpochRef.current += 1
    setDownloading(false)
    useStore.getState().clearLeadMapPrint()
    try {
      await useStore.getState().saveProject({ requireSaved: true })
      setStatus('Map cleared. Adjust the settings and map, then Fix again.')
    } catch (error) {
      setStatus(formatMapCaptureError(error))
    } finally {
      setBusy(false)
    }
  }

  const printMap = async (): Promise<void> => {
    if (busy || !mapFixed) return
    setBusy(true)
    try {
      setStatus('Compiling Typst print preview…')
      const current = useStore.getState().project
      if (!current) throw new Error('No project is open.')
      const pdf = await compileSavedLeadMapPdf(current)
      const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setStatus('')
    } catch (error) {
      setStatus(formatMapCaptureError(error))
    } finally {
      setBusy(false)
    }
  }

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed',
          left: -99999,
          top: 0,
          width: 1400,
          height: 1000,
          pointerEvents: 'none',
          opacity: 0,
          zIndex: -1000
        }}
        aria-hidden="true"
      >
        <div className="lead-print-scroll">
          <LeadMapPrintPage
            ref={pageRef}
            variants={variants}
            applications={applications}
            assignments={assignments}
            points={points}
            site={site}
            mapDirections={mapDirections}
            printSettings={layout}
            signatureFooter={signatureFooter}
            interactive={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="lead-print-overlay" role="dialog" aria-modal="true">
      <div className="lead-print-shell map-layout-editor">
        <div className="lead-print-toolbar">
          <div>
            <strong>Route Map Print Studio</strong>
            <span>{year} · {routes.filter((route) => !route.hideLabel).length} route(s) · separate map page</span>
          </div>
          <div>
            {mapFixed ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void clearMap()}>
                {busy ? <LoaderCircle className="spin" size={14} /> : <Eraser size={14} />}
                {busy ? 'Clearing…' : 'Clear'}
              </button>
            ) : (
              <button className="btn primary" type="button" disabled={busy || downloading} onClick={() => void fixMap()}>
                {busy || downloading ? <LoaderCircle className="spin" size={14} /> : <LockKeyhole size={14} />}
                {busy || downloading ? 'Fixing…' : 'Fix'}
              </button>
            )}
            <button
              className="btn ghost"
              type="button"
              disabled={busy || !mapFixed}
              onClick={() => void printMap()}
            >
              {downloading ? <LoaderCircle className="spin" size={14} /> : <Printer size={14} />}
              Print Map
            </button>
            {mapFixed && (
              <button className="btn ghost" type="button" onClick={() => void downloadMapImage()}>
                <Download size={14} /> Download Image
              </button>
            )}
            {downloading && (
              <button
                className="btn ghost"
                type="button"
                onClick={handleCloseOrMinimize}
                title="Continue downloading map tiles and stitching in background"
              >
                <Minimize2 size={14} /> Run in background
              </button>
            )}
            <button className="btn ghost" type="button" onClick={handleCloseOrMinimize}>
              <X size={14} /> {downloading ? 'Close (background)' : 'Close'}
            </button>
          </div>
        </div>
        {status && <div className="lead-map-pdf-status" role="status">{status}</div>}
        <div className="lead-map-layout-editor-body">
          <LeadMapPrintLayout
            settings={layout}
            onChange={onUpdatePrintSettings}
            embedded
            locked={editorLocked}
          />
          <div className="lead-print-scroll">
            <LeadMapPrintPage
              ref={pageRef}
              variants={variants}
              applications={applications}
              assignments={assignments}
              points={points}
              site={site}
              mapDirections={mapDirections}
              printSettings={layout}
              signatureFooter={signatureFooter}
              onUpdatePrintSettings={editorLocked ? undefined : onUpdatePrintSettings}
              interactive={!editorLocked}
            />
          </div>
        </div>
      </div>
      {previewUrl && (
        <div className="lead-map-typst-preview" role="dialog" aria-modal="true" aria-label="Map Typst print preview">
          <div className="lead-print-shell">
            <div className="lead-print-toolbar">
              <div>
                <strong>Print Map</strong>
                <span>Typst preview of the saved map page</span>
              </div>
              <div>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => printFrameRef.current?.contentWindow?.print()}
                >
                  <Printer size={14} /> Print
                </button>
                <button className="btn ghost" type="button" onClick={() => setPreviewUrl(null)}>
                  <X size={14} /> Close
                </button>
              </div>
            </div>
            <div className="lead-map-typst-preview-body">
              <PdfPageStack src={previewUrl} zoom={100} />
            </div>
            <iframe ref={printFrameRef} className="data-dashboard-print-source" src={previewUrl} title="Print map" />
          </div>
        </div>
      )}
    </div>
  )
}

export function LeadMapPrintPage({
  variants,
  applications,
  assignments,
  points,
  site,
  mapDirections,
  printSettings,
  signatureFooter,
  onUpdatePrintSettings,
  interactive = true,
  ref
}: LeadMapPrintPageProps): JSX.Element {
  const layout = normalizeLeadPrintSettings(printSettings)
  const routes = (buildRouteLines(variants, applications, assignments, points, site, mapDirections))
  const update = onUpdatePrintSettings ?? (() => undefined)
  return (
    <article
      ref={ref}
      className={`lead-print-page map-page ${layout.pages.map.orientation}`}
      style={mapPageStyle(layout, signatureFooter)}
    >
      {layout.showMapHeader && (
        <header className="lead-print-section-header">
          <div>
            <h2>{layout.mapTitle || 'Lead Route Map'}</h2>
            {layout.mapSubtitle && <p>{layout.mapSubtitle}</p>}
          </div>
        </header>
      )}
      <RouteMap
        routes={routes}
        layout={layout}
        interactive={interactive}
        onViewChange={(mapView) => update({ ...layout, mapView })}
        onViewReset={() => update({ ...layout, mapView: null })}
      />
      {signatureFooter?.enabled && <SignatureFooterPrint settings={signatureFooter} />}
    </article>
  )
}

function RouteMap({
  routes,
  layout,
  interactive,
  onViewChange,
  onViewReset
}: {
  routes: RouteLine[]
  layout: ReturnType<typeof normalizeLeadPrintSettings>
  interactive: boolean
  onViewChange: (view: { lat: number; lon: number; zoom: number }) => void
  onViewReset: () => void
}): JSX.Element {
  const points = (uniqueRoutePoints(routes))
  const bounds = (routeBounds(routes))
  if (!bounds || routes.length === 0) {
    return <div className="lead-print-empty">No mapped applied Lead routes are available.</div>
  }
  const center = layout.mapView
    ? ([layout.mapView.lat, layout.mapView.lon] as [number, number])
    : ([bounds.getCenter().lat, bounds.getCenter().lng] as [number, number])

  return (
    <div
      className={`lead-print-map ${interactive ? 'interactive' : 'static'} ${interactive && layout.mapBoxHeightMm > 0 ? 'fixed-height' : 'fill-page'}`}
      style={{
        ...(interactive && layout.mapBoxHeightMm > 0
          ? { height: `${layout.mapBoxHeightMm}mm`, flex: '0 0 auto' }
          : {}),
        width: interactive ? `${layout.mapBoxWidthPercent}%` : '100%'
      }}
    >
        <MapContainer
          center={center}
          zoom={layout.mapView?.zoom ?? 13}
          maxZoom={22}
          preferCanvas
          style={{ position: 'absolute', inset: 0, height: 'auto', width: 'auto' }}
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        dragging={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        attributionControl={false}
      >
        {layout.showBaseMap && (
          <MapLayers key={layout.mapLayerType} printQuality selected={layout.mapLayerType} showControl={false} />
        )}
        <MapViewport
          bounds={bounds}
          routes={routes}
          savedView={layout.mapView}
          onChange={onViewChange}
          onReset={onViewReset}
          interactive={interactive}
        />
        {layout.showMapScale && <ScaleControl imperial={false} position="bottomleft" />}
        {routes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.geometry}
            color={route.color}
            weight={4}
            opacity={0.88}
            dashArray={route.dashed ? '6 7' : undefined}
            interactive={interactive}
          >
            {!route.hideLabel && <Popup>{route.label}</Popup>}
            {layout.showMapRouteLabels && !route.hideLabel && (
              <Tooltip permanent direction="center" className={`lead-print-route-label ${layout.mapLabelSize}`}>
                {route.label}
              </Tooltip>
            )}
          </Polyline>
        ))}
        {layout.showRouteArrows && routes.filter((route) => !route.hideEndpoints).map((route) => (
          <Marker
            key={`arrow:${route.id}`}
            position={route.geometry.at(-1) ?? [route.to.lat, route.to.lon]}
            icon={arrowIcon(route.color)}
            interactive={false}
          />
        ))}
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={pinIcon(point, pointColor(point, routes))}
            interactive={interactive}
            keyboard={interactive}
          >
            {layout.showMapPointLabels && (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -38]}
                className={`lead-print-point-label ${layout.mapLabelSize}`}
              >
                {pointLabel(point, layout.mapPointLabelMode)}
              </Tooltip>
            )}
            <Popup><strong>{point.code}</strong><br />{point.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
      {layout.showMapLegend && routes.some((route) => !route.hideLabel) && (
        <div className={`lead-print-map-legend ${layout.mapLegendPosition}`}>
          <strong>Route legend</strong>
          {routes.filter((route) => !route.hideLabel).map((route) => (
            <span key={route.id}><i style={{ background: route.color }} />{route.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function MapViewport({
  bounds,
  routes,
  savedView,
  onChange,
  onReset,
  interactive
}: {
  bounds: L.LatLngBounds
  routes: RouteLine[]
  savedView: { lat: number; lon: number; zoom: number } | null
  onChange: (view: { lat: number; lon: number; zoom: number }) => void
  onReset: () => void
  interactive: boolean
}): null {
  const map = useMap()
  const userAction = useRef(false)

  useEffect(() => {
    const container = map.getContainer()
    const mark = (): void => { userAction.current = true }
    if (interactive) {
      container.addEventListener('pointerdown', mark, true)
      container.addEventListener('wheel', mark, true)
    }
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ animate: false, pan: false })
      if (!savedView) map.fitBounds(bounds, { padding: [30, 30], animate: false })
      map.getContainer().dataset.leadMapReady = '1'
    })
    return () => {
      cancelAnimationFrame(frame)
      if (interactive) {
        container.removeEventListener('pointerdown', mark, true)
        container.removeEventListener('wheel', mark, true)
      }
    }
  }, [bounds, interactive, map, savedView])

  useEffect(() => {
    const handlers = [
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.dragging,
      map.touchZoom,
      map.boxZoom,
      map.keyboard
    ]
    for (const handler of handlers) {
      if (interactive) handler.enable()
      else handler.disable()
    }
  }, [interactive, map])

  const record = (): void => {
    if (!interactive || !userAction.current) return
    userAction.current = false
    const frame = map.getBounds()
    const routeVisible = routes.some((route) => route.geometry.some(([lat, lon]) => frame.contains([lat, lon])))
    if (!routeVisible) {
      map.fitBounds(bounds, { padding: [30, 30], animate: false })
      onReset()
      return
    }
    const center = map.getCenter()
    onChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
  }
  useMapEvents({ moveend: record, zoomend: record })
  return null
}

/**
 * Draws a weighted lead through its member routes so the average basis stays
 * visible even when a member is no longer applied directly. Members that
 * already draw their own route are skipped to avoid duplicates.
 */
function pushWeightedMemberRoutes(
  routes: RouteLine[],
  variant: LeadVariant,
  entries: { variantId: string }[],
  variantsById: Map<string, LeadVariant>,
  context: {
    pointsById: Map<string, LeadPoint>
    assignmentsById: Map<string, LeadAssignment>
    work: RoutePoint | null
    appliedIds: Set<string>
  },
  index: number
): void {
  const labelPrefix = `${variant.materialName} · Weighted Avg · `
  entries.forEach((entry, memberIndex) => {
    if (context.appliedIds.has(entry.variantId)) return
    const member = variantsById.get(entry.variantId)
    if (!member) return
    const color = leadRouteColor(member, index + memberIndex + 1)
    const memberAvgRoutes = (member.avgLead?.routes ?? []).filter(
      (route) => (route.geometry?.length ?? 0) >= 2
    )
    if (memberAvgRoutes.length > 0) {
      memberAvgRoutes.forEach((route, routeIndex) => {
        const geometry = validGeometry(route.geometry) ?? []
        if (geometry.length < 2) return
        routes.push({
          id: `variant:${variant.id}:weighted-${member.id}-${routeIndex}`,
          label: `${labelPrefix}${member.materialName} avg P${routeIndex + 1} ${km.format(route.routeKm)} km`,
          color,
          from: coordinatePoint(`${variant.id}:weighted-${member.id}-${routeIndex}:from`, 'Avg route start', {
            lat: geometry[0][0],
            lon: geometry[0][1]
          }),
          to: coordinatePoint(`${variant.id}:weighted-${member.id}-${routeIndex}:to`, 'Avg route end', {
            lat: geometry.at(-1)![0],
            lon: geometry.at(-1)![1]
          }),
          geometry,
          variantId: variant.id
        })
      })
      return
    }
    const assignedPoint = member.assignmentId
      ? context.pointsById.get(context.assignmentsById.get(member.assignmentId)?.pointId ?? '')
      : undefined
    let from = pointFromLeadPoint(context.pointsById.get(member.startPointId || '') ?? assignedPoint) ?? context.work
    const to = pointFromLeadPoint(context.pointsById.get(member.endPointId || '')) ?? context.work
    if (from && to && from.id === to.id && context.work && context.work.id !== to.id) from = context.work
    if (!from || !to || from.id === to.id) return
    const geometry = validGeometry(member.routeGeometry) ?? [[from.lat, from.lon], [to.lat, to.lon]]
    routes.push({
      id: `variant:${variant.id}:weighted-${member.id}`,
      label: `${labelPrefix}${member.materialName} ${km.format(member.leadKm)} km`,
      color,
      from,
      to,
      geometry,
      variantId: variant.id
    })
    addConnector(routes, variant, color, 'first', member.firstMileGeometry)
    addConnector(routes, variant, color, 'last', member.lastMileGeometry)
  })
}

function buildRouteLines(
  variants: LeadVariant[],
  applications: LeadApplication[],
  assignments: LeadAssignment[],
  points: LeadPoint[],
  site: ProjectLocation | null,
  directions: LeadMapDirection[]
): RouteLine[] {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]))
  const applied = Array.from(new Set(applications.map((application) => application.variantId)))
    .map((id) => variantsById.get(id))
    .filter((variant): variant is LeadVariant => Boolean(variant))
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const work = pointFromLeadPoint(
    pointsById.get(PROJECT_POINT_ID) ?? (site ? {
      id: PROJECT_POINT_ID,
      code: 'Work Location',
      name: site.label || 'Project work location',
      kind: 'site',
      lat: site.lat,
      lon: site.lng
    } : null)
  )
  const appliedIds = new Set(applied.map((variant) => variant.id))
  const routes: RouteLine[] = directions
    .filter((direction) => direction.active !== false && direction.points.length >= 2 && (!direction.variantId || appliedIds.has(direction.variantId)))
    .map((direction) => ({
      id: direction.id,
      label: direction.label,
      color: direction.color || '#0e639c',
      from: coordinatePoint(`${direction.id}:from`, `${direction.label} start`, direction.points[0]),
      to: coordinatePoint(`${direction.id}:to`, `${direction.label} end`, direction.points.at(-1)!),
      geometry: direction.points.map((point) => [point.lat, point.lon]),
      variantId: direction.variantId
    }))
  const directedIds = new Set(routes.map((route) => route.variantId).filter(Boolean))

  applied.forEach((variant, index) => {
    if (directedIds.has(variant.id)) return
    const assignedPoint = variant.assignmentId
      ? pointsById.get(assignmentsById.get(variant.assignmentId)?.pointId ?? '')
      : undefined
    let from = pointFromLeadPoint(pointsById.get(variant.startPointId || '') ?? assignedPoint) ?? work
    const to = pointFromLeadPoint(pointsById.get(variant.endPointId || '')) ?? work
    if (from && to && from.id === to.id && work && work.id !== to.id) from = work
    if (!from || !to) return
    const color = leadRouteColor(variant, index)
    const weightedEntries = variant.weightedLead?.entries ?? []
    if (weightedEntries.length > 0) {
      pushWeightedMemberRoutes(routes, variant, weightedEntries, variantsById, {
        pointsById,
        assignmentsById,
        work,
        appliedIds
      }, index)
      return
    }
    const avgRoutes = (variant.avgLead?.routes ?? []).filter(
      (route) => (route.geometry?.length ?? 0) >= 2
    )
    if (avgRoutes.length > 0) {
      avgRoutes.forEach((route, routeIndex) => {
        const geometry = validGeometry(route.geometry) ?? []
        if (geometry.length < 2) return
        routes.push({
          id: `variant:${variant.id}:avg-${routeIndex}`,
          label: `${variant.materialName} avg P${routeIndex + 1} ${km.format(route.routeKm)} km`,
          color,
          from: coordinatePoint(`${variant.id}:avg-${routeIndex}:from`, 'Avg route start', {
            lat: geometry[0][0],
            lon: geometry[0][1]
          }),
          to: coordinatePoint(`${variant.id}:avg-${routeIndex}:to`, 'Avg route end', {
            lat: geometry.at(-1)![0],
            lon: geometry.at(-1)![1]
          }),
          geometry,
          variantId: variant.id
        })
      })
      return
    }
    const directGeometry = validGeometry(variant.routeGeometry)
    if (!directGeometry && from.id === to.id) return
    const geometry = directGeometry ?? [[from.lat, from.lon], [to.lat, to.lon]]
    routes.push({
      id: `variant:${variant.id}`,
      label: `${variant.materialName} ${km.format(variant.leadKm)} km`,
      color,
      from,
      to,
      geometry,
      variantId: variant.id
    })
    addConnector(routes, variant, color, 'first', variant.firstMileGeometry)
    addConnector(routes, variant, color, 'last', variant.lastMileGeometry)
  })
  return routes
}

function addConnector(
  routes: RouteLine[],
  variant: LeadVariant,
  color: string,
  kind: 'first' | 'last',
  coordinates: LeadVariant['routeGeometry']
): void {
  const geometry = validGeometry(coordinates)
  if (!geometry) return
  routes.push({
    id: `${kind}-mile:${variant.id}`,
    label: `${kind === 'first' ? 'First' : 'Last'} mile`,
    color,
    from: coordinatePoint(`${kind}:${variant.id}:from`, `${kind} mile start`, { lat: geometry[0][0], lon: geometry[0][1] }),
    to: coordinatePoint(`${kind}:${variant.id}:to`, `${kind} mile end`, { lat: geometry.at(-1)![0], lon: geometry.at(-1)![1] }),
    geometry,
    variantId: variant.id,
    dashed: true,
    hideEndpoints: true,
    hideLabel: true
  })
}

function validGeometry(points: LeadVariant['routeGeometry']): [number, number][] | null {
  const geometry = (points ?? [])
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .map((point) => [point.lat, point.lon] as [number, number])
  return geometry.length >= 2 ? geometry : null
}

function routeBounds(routes: RouteLine[]): L.LatLngBounds | null {
  const coordinates = routes.flatMap((route) => route.geometry)
  if (coordinates.length === 0) return null
  const bounds = L.latLngBounds(coordinates)
  if (!bounds.isValid()) return null
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  if (Math.abs(ne.lat - sw.lat) < 0.0005 && Math.abs(ne.lng - sw.lng) < 0.0005) {
    return L.latLngBounds([[sw.lat - 0.005, sw.lng - 0.005], [ne.lat + 0.005, ne.lng + 0.005]])
  }
  return bounds
}

function pointFromLeadPoint(point: LeadPoint | null | undefined): RoutePoint | null {
  if (!point) return null
  return { id: point.id, code: point.code, label: point.name || point.kind.replaceAll('_', ' '), lat: point.lat, lon: point.lon }
}

function coordinatePoint(id: string, label: string, point: { lat: number; lon: number }): RoutePoint {
  return { id, code: label, label, lat: point.lat, lon: point.lon }
}

function uniqueRoutePoints(routes: RouteLine[]): RoutePoint[] {
  const result = new Map<string, RoutePoint>()
  routes.filter((route) => !route.hideEndpoints).forEach((route) => {
    result.set(route.from.id, route.from)
    result.set(route.to.id, route.to)
  })
  return Array.from(result.values())
}

function pointLabel(point: RoutePoint, mode: 'code' | 'name' | 'code_name'): string {
  if (mode === 'code') return point.code
  if (mode === 'name') return point.label || point.code
  return point.label === point.code ? point.code : `${point.code} - ${point.label}`
}

function pointColor(point: RoutePoint, routes: RouteLine[]): string {
  return routes.find((route) => route.from.id === point.id || route.to.id === point.id)?.color ?? '#0e639c'
}

function pinIcon(point: RoutePoint, color: string): L.DivIcon {
  const text = `${point.code} ${point.label}`.toLowerCase()
  const label = text.includes('project') || text.includes('work location') ? 'P'
    : text.includes('stone') || text.includes('rock') ? 'ST'
      : text.includes('sand') ? 'S'
        : text.includes('dump') || text.includes('disposal') ? 'D'
          : point.code.slice(0, 2).toUpperCase()
  return L.divIcon({
    className: 'lead-map-logo-pin lead-print-marker',
    html: `<span style="background:${color}"><b>${label}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42]
  })
}

function arrowIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'lead-map-arrow',
    html: `<span style="color:${color}">&rarr;</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

export { waitForMapAssets } from '../../lib/leadMapAssets'
