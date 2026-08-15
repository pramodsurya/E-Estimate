import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { MapPinned, Printer, Settings, X } from 'lucide-react'
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
import MapLayers, { type MapLayerType } from '../map/MapLayers'
import { conveyanceClassLabel, leadRouteColor, type LeadRateRow } from '../../lib/lead'
import {
  LEAD_PRINT_PAGE_LABELS,
  MIN_MAP_BOX_HEIGHT_MM,
  normalizeLeadPrintSettings,
  routeGeometryIntersectsBounds
} from '../../lib/leadPrintLayout'
import type {
  ConveyanceClass,
  LeadApplication,
  LeadAssignment,
  LeadChargeCode,
  LeadMapDirection,
  LeadPoint,
  LeadPrintPageKey,
  LeadPrintSettings,
  LeadVariant,
  ProjectLocation,
  SignatureFooterSettings,
  SorZone
} from '../../types/project'
import LeadMapPrintLayout from './LeadMapPrintLayout'
import SignatureFooterPrint from '../signature/SignatureFooterPrint'
import { pipeLeadCatalogueLabel } from '../../lib/pipeLead'

type AppliedChargeCode = Exclude<LeadChargeCode, 'AUTO'>

interface LeadSelectablePoint extends LeadPoint {
  deletable?: boolean
}

interface AppliedLead {
  application: LeadApplication
  variant: LeadVariant
  codes: AppliedChargeCode[]
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
  from: RoutePoint
  to: RoutePoint
  color: string
  geometry?: [number, number][]
  variantId?: string
  dashed?: boolean
  suppressEndpoints?: boolean
  suppressLabel?: boolean
}

interface Props {
  year: string
  zone: SorZone
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  printSettings?: LeadPrintSettings
  signatureFooter?: SignatureFooterSettings
  onUpdatePrintSettings: (settings: LeadPrintSettings) => void
  onClose: () => void
  /** Already-synced dashboard rows. Print Preview never fetches its own data. */
  rates?: LeadRateRow[]
  /** Omits dialog chrome so the same preview pages can be mounted in Project VPV. */
  embedded?: boolean
  /** Opens a popup editor with controls beside only the printed map page. */
  mapLayoutEditor?: boolean
}

const PROJECT_WORK_POINT_ID = '__project_work_location__'

function zoneLabel(zone: SorZone): string {
  if (zone === 'zone_1') return 'Zone I'
  if (zone === 'zone_2') return 'Zone II'
  return 'Zone III'
}

const CHARGE_CODE_ORDER: AppliedChargeCode[] = [
  'COM-LDLFT-1',
  'COM-LDLFT-2',
  'COM-LDLFT-3',
  'COM-LDLFT-4',
  'COM-LDLFT-5',
  'COM-LDLFT-6'
]

const SLAB_ORDER = [
  'upto_100m',
  'upto_150m',
  'upto_1km',
  'upto_2km',
  'upto_3km',
  'upto_4km',
  'upto_5km',
  'per_km_5_30',
  'per_km_beyond_30',
  'loading',
  'unloading',
  'per_1m_beyond_3m'
]

const COLUMN_ORDER = [
  'EARTH',
  'EARTH_STONE',
  'STONE',
  'STONE_LIME',
  'CEMENT',
  'STEEL',
  'CEMENT_STEEL',
  'CEMENT_STEEL_PACKED',
  'SLAB_WOOD',
  'WATER',
  'BRICKS'
]

const CHARGE_TITLES: Record<AppliedChargeCode, string> = {
  'COM-LDLFT-1': 'A. (Lead) Conveyance Charges for materials by head load',
  'COM-LDLFT-2':
    'B. (Lead) Conveyance charges for machinery per kilometer for transporting materials by tippers and trucks excluding loading, unloading and idle hire charges of machinery.',
  'COM-LDLFT-3': 'C. Loading and unloading charges by manual means (idle hire charges of trucks are not added)',
  'COM-LDLFT-4': 'D. Loading and unloading charges by manual means (including idle hire charges of trucks)',
  'COM-LDLFT-5': 'E. Loading and unloading charges by mechanical means (including idle hire charges of trucks)',
  'COM-LDLFT-6': 'F. Lift charges for materials by head load'
}

const COLUMN_LABELS: Record<string, string> = {
  EARTH: 'Earth / Sand / Gravel / Murrum / Lime / Surki Rs / cum',
  EARTH_STONE:
    'Earth / Sand / Gravel / Murrum / Lime / Surki / Size stone / Cut stone rubble / Coarse aggregate Rs / cum',
  STONE: 'Rubble / Size stones / Cut stones / Coarse aggregate Rs / cum',
  STONE_LIME: 'Rubble / Size stone / Cut stone / Coarse aggregate / Lime Rs / cum',
  CEMENT: 'Cement Rs / tonne',
  STEEL: 'Steel Rs / tonne',
  CEMENT_STEEL: 'Cement / Reinforcement steel / Structural steel Rs / tonne',
  CEMENT_STEEL_PACKED:
    'Cement / Steel / RCC poles / AC & GI sheets / Packed materials Rs / tonne',
  SLAB_WOOD: 'PCC slab / Shahbad slab / CC block / BS slab / Laterite / Wood Rs / cum',
  WATER: 'Water Rs / 1000 litres',
  BRICKS: 'Bricks Rs / 1000 Nos.'
}

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const km = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3
})

const PAGE_LABELS: Record<LeadPrintPageKey, string> = {
  chart: `Lead Print 1 - ${LEAD_PRINT_PAGE_LABELS.chart}`,
  calculation: `Lead Print 2 - ${LEAD_PRINT_PAGE_LABELS.calculation}`,
  map: `Lead Print 3 - ${LEAD_PRINT_PAGE_LABELS.map}`
}

export default function LeadPrintPreviewModal({
  year,
  zone,
  variants,
  applications,
  assignments,
  points,
  site,
  mapDirections,
  printSettings,
  signatureFooter,
  onUpdatePrintSettings,
  onClose,
  rates = [],
  embedded = false,
  mapLayoutEditor = false
}: Props): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mapSettingsOpen, setMapSettingsOpen] = useState(mapLayoutEditor)
  const layoutEditing = !embedded && (mapLayoutEditor || mapSettingsOpen)

  const layout = normalizeLeadPrintSettings(printSettings)

  const updateLayout = (patch: LeadPrintSettings): void => {
    onUpdatePrintSettings(normalizeLeadPrintSettings({ ...layout, ...patch }))
  }

  const updatePageOrientation = (
    page: LeadPrintPageKey,
    orientation: 'portrait' | 'landscape'
  ): void => {
    updateLayout({
      ...layout,
      pages: {
        ...layout.pages,
        [page]: { ...layout.pages[page], orientation }
      }
    })
  }

  const updateMargin = (side: keyof NonNullable<LeadPrintSettings['margins']>, value: string): void => {
    const next = Number(value)
    if (!Number.isFinite(next) || next < 0) return
    updateLayout({
      ...layout,
      margins: { ...layout.margins, [side]: next }
    })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const variantsById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants]
  )

  const applied = useMemo<AppliedLead[]>(
    () => {
      const seen = new Map<string, AppliedLead>()
      for (const application of applications) {
        const variant = variantsById.get(application.variantId)
        if (!variant || seen.has(variant.id)) continue
        seen.set(variant.id, {
          application,
          variant,
          codes: chargeCodesForApplication(variant, application)
        })
      }
      return Array.from(seen.values()).sort((a, b) =>
        `${a.variant.materialName} ${variantDisplayName(a.variant)}`
          .localeCompare(
            `${b.variant.materialName} ${variantDisplayName(b.variant)}`,
            undefined,
            { numeric: true }
          )
      )
    },
    [applications, variantsById]
  )

  const usedCodes = useMemo(
    () =>
      CHARGE_CODE_ORDER.filter((code) =>
        applied.some((row) => row.codes.includes(code))
      ),
    [applied]
  )
  const appliedPipeLeads = useMemo(
    () => applied.filter((row) => Boolean(row.variant.pipeLead)),
    [applied]
  )

  return (
    <div className={embedded ? 'lead-print-embedded' : 'lead-print-overlay'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'}>
      <div className={`${embedded ? 'lead-print-embedded-shell' : 'lead-print-shell'} ${layoutEditing ? 'map-layout-editor' : ''}`}>
        {!embedded && <div className="lead-print-toolbar">
          <div>
            <strong>{layoutEditing ? 'Map Print Layout' : 'Lead Chart Print Preview'}</strong>
            <span>{year} | {zoneLabel(zone)} SOR rates | {applied.length} applied item(s)</span>
          </div>
          <div>
            {!mapLayoutEditor && <button
              className={`btn ghost ${settingsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setSettingsOpen((open) => !open)
                setMapSettingsOpen(false)
              }}
            >
              <Settings size={14} /> Settings
            </button>}
            {!mapLayoutEditor && <button
              className={`btn ghost ${mapSettingsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setMapSettingsOpen((open) => !open)
                setSettingsOpen(false)
              }}
            >
              <MapPinned size={14} /> Map Print Layout
            </button>}
            <button className="btn ghost" type="button" onClick={() => window.print()}>
              <Printer size={14} /> {layoutEditing ? 'Print Map' : 'Print'}
            </button>
            <button className="btn ghost" type="button" onClick={onClose}>
              <X size={14} /> Close
            </button>
          </div>
        </div>}
        <div className={layoutEditing ? 'lead-map-layout-editor-body' : undefined}>
        {!embedded && settingsOpen && !layoutEditing && (
          <PrintSettingsPanel
            settings={layout}
            onUpdate={updateLayout}
            onUpdateMargin={updateMargin}
            onUpdatePageOrientation={updatePageOrientation}
          />
        )}
        {layoutEditing && (
          <LeadMapPrintLayout
            settings={layout}
            onChange={onUpdatePrintSettings}
            embedded
          />
        )}
        <div className="lead-print-scroll">
          {!layoutEditing && <>
          <article
            className={`lead-print-page ${layout.pages.chart.orientation}`}
            style={printPageStyle(layout, 'chart', signatureFooter)}
          >
            <header className="lead-print-page-header">
              <div>
                <h1>Lead/Lift/Loading & Unloading Charges {year}</h1>
                <p>{zoneLabel(zone)} SOR rates used by the applied Lead variants in this project.</p>
              </div>
              <strong>E-Estimate</strong>
            </header>

            {usedCodes.length === 0 && appliedPipeLeads.length === 0 ? (
              <div className="lead-print-empty">
                No Lead/Lift variant has been applied to any item yet.
              </div>
            ) : usedCodes.length > 0 && rates.length === 0 ? (
              <div className="lead-print-empty">
                Lead chart rows are not in the dashboard snapshot. Close Print Preview and click Sync.
              </div>
            ) : (
              usedCodes.map((code) => (
                <RateChartSourceTable
                  key={code}
                  chargeCode={code}
                  rows={rates.filter((row) => row.charge_code === code)}
                />
              ))
            )}
            {appliedPipeLeads.length > 0 && <PipeLeadSourceTable rows={appliedPipeLeads} />}
            {signatureFooter?.enabled && signatureFooter.placement === 'every_page' && (
              <SignatureFooterPrint settings={signatureFooter} />
            )}
          </article>

          <article
            className={`lead-print-page ${layout.pages.calculation.orientation}`}
            style={printPageStyle(layout, 'calculation', signatureFooter)}
          >
            <header className="lead-print-section-header">
              <h2>Applied Variant Rate Calculations</h2>
              <p>
                Only applied Lead variants are included. Common Lead uses {zoneLabel(zone)} SOR;
                RCC pipes use the statewide Public Health Table 6/7 rate.
              </p>
            </header>
            {applied.length === 0 ? (
              <div className="lead-print-empty">Apply a Lead variant to an item to show calculations.</div>
            ) : (
              <div className="lead-print-calculation-grid">
                {applied.map((row) => (
                  <AppliedCalculationBlock
                    key={row.application.id}
                    row={row}
                    zone={zone}
                    routeLabel={routeLabelForVariant(row.variant, assignments, points, site)}
                  />
                ))}
              </div>
            )}
            {signatureFooter?.enabled && signatureFooter.placement === 'every_page' && (
              <SignatureFooterPrint settings={signatureFooter} />
            )}
          </article>
          </>}

          <article
            className={`lead-print-page map-page ${layout.pages.map.orientation}`}
            style={printPageStyle(layout, 'map', signatureFooter)}
          >
            {layout.showMapHeader && (
              <header className="lead-print-section-header">
                <h2>{layout.mapTitle || 'Lead Route Map'}</h2>
                {layout.mapSubtitle && <p>{layout.mapSubtitle}</p>}
              </header>
            )}
            <LeadPrintRouteMap
              applied={applied}
              assignments={assignments}
              points={points}
              site={site}
              mapDirections={mapDirections}
              mapLayerType={layout.mapLayerType}
              showPointLabels={layout.showMapPointLabels}
              showRouteLabels={layout.showMapRouteLabels}
              pointLabelMode={layout.mapPointLabelMode}
              labelSize={layout.mapLabelSize}
              showRouteArrows={layout.showRouteArrows}
              showBaseMap={layout.showBaseMap}
              showLegend={layout.showMapLegend}
              legendPosition={layout.mapLegendPosition}
              showScale={layout.showMapScale}
              boxHeightMm={layout.mapBoxHeightMm}
              boxWidthPercent={layout.mapBoxWidthPercent}
              view={layout.mapView}
              interactive={layoutEditing}
              onViewChange={(mapView) => updateLayout({ ...layout, mapView })}
              onViewReset={() => updateLayout({ ...layout, mapView: null })}
              onBoxHeightChange={(mapBoxHeightMm) =>
                updateLayout({ ...layout, mapBoxHeightMm })
              }
            />
            {signatureFooter?.enabled && (
              <SignatureFooterPrint settings={signatureFooter} />
            )}
          </article>
        </div>
        </div>
      </div>
    </div>
  )
}

function PrintSettingsPanel({
  settings,
  onUpdate,
  onUpdateMargin,
  onUpdatePageOrientation
}: {
  settings: ReturnType<typeof normalizeLeadPrintSettings>
  onUpdate: (settings: LeadPrintSettings) => void
  onUpdateMargin: (side: keyof NonNullable<LeadPrintSettings['margins']>, value: string) => void
  onUpdatePageOrientation: (page: LeadPrintPageKey, orientation: 'portrait' | 'landscape') => void
}): JSX.Element {
  return (
    <div className="lead-print-settings">
      <div className="lead-print-settings-grid">
        <label>
          Page size
          <select
            className="select-input"
            value={settings.pageSize}
            onChange={(event) => onUpdate({ ...settings, pageSize: event.target.value as LeadPrintSettings['pageSize'] })}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="A2">A2</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
        </label>
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <label key={side}>
            Margin {side} mm
            <input
              className="text-input"
              type="number"
              min="0"
              value={settings.margins[side]}
              onChange={(event) => onUpdateMargin(side, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="lead-print-page-options">
        {(Object.keys(PAGE_LABELS) as LeadPrintPageKey[]).map((page) => (
          <div className="lead-print-page-option" key={page}>
            <span>{PAGE_LABELS[page]}</span>
            <div className="lead-segmented">
              <button
                type="button"
                className={settings.pages[page].orientation === 'portrait' ? 'active' : ''}
                onClick={() => onUpdatePageOrientation(page, 'portrait')}
              >
                Portrait
              </button>
              <button
                type="button"
                className={settings.pages[page].orientation === 'landscape' ? 'active' : ''}
                onClick={() => onUpdatePageOrientation(page, 'landscape')}
              >
                Landscape
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RateChartSourceTable({
  chargeCode,
  rows
}: {
  chargeCode: AppliedChargeCode
  rows: LeadRateRow[]
}): JSX.Element {
  const columns = Array.from(new Set(rows.map((row) => row.column_key))).sort(
    (a, b) => orderIndex(COLUMN_ORDER, a) - orderIndex(COLUMN_ORDER, b)
  )
  const slabKeys = Array.from(new Set(rows.map((row) => row.slab_key))).sort(
    (a, b) => orderIndex(SLAB_ORDER, a) - orderIndex(SLAB_ORDER, b)
  )
  const rowsBySlab = slabKeys.map((slabKey) => ({
    slabKey,
    label: rows.find((row) => row.slab_key === slabKey)?.slab_label ?? slabKey,
    values: new Map(
      rows
        .filter((row) => row.slab_key === slabKey)
        .map((row) => [row.column_key, row.rate])
    )
  }))
  const includeHeadInitial = chargeCode === 'COM-LDLFT-1'
  const includeLiftInitial = chargeCode === 'COM-LDLFT-6'

  return (
    <section className="lead-print-source-block">
      <h2>{chargeCode}</h2>
      <h3>{CHARGE_TITLES[chargeCode]}</h3>
      <table className="lead-print-source-table">
        <thead>
          <tr>
            <th>Sl No.</th>
            <th>{chargeCode === 'COM-LDLFT-6' ? 'Total lift' : chargeCodeForDescription(chargeCode)}</th>
            {columns.map((column) => (
              <th key={column}>{COLUMN_LABELS[column] ?? column.replaceAll('_', ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {includeHeadInitial && (
            <tr>
              <td>1</td>
              <td>Total lead upto 50 m (covered by item rate)</td>
              {columns.map((column) => (
                <td key={column}>initial lead</td>
              ))}
            </tr>
          )}
          {includeLiftInitial && (
            <tr>
              <td>1</td>
              <td>Total lift upto 3 m (covered by item rate)</td>
              {columns.map((column) => (
                <td key={column}>initial lift</td>
              ))}
            </tr>
          )}
          {rowsBySlab.map((row, index) => (
            <tr key={row.slabKey}>
              <td>{index + 1 + (includeHeadInitial || includeLiftInitial ? 1 : 0)}</td>
              <td>{row.label}</td>
              {columns.map((column) => (
                <td key={column}>{formatRate(row.values.get(column))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lead-print-note">
        Note: The Lead Charges are inclusive of 13.615% Contractor Profit and Overhead charges.
      </p>
    </section>
  )
}

function PipeLeadSourceTable({ rows }: { rows: AppliedLead[] }): JSX.Element {
  return (
    <section className="lead-print-source-block">
      <h2>RCC pipe conveyance rates</h2>
      <h3>Public Health RCC pipe conveyance — statewide published rates</h3>
      <table className="lead-print-source-table">
        <thead>
          <tr>
            <th>Pipe / class group</th>
            <th>Diameter</th>
            <th>Actual lead</th>
            <th>Adopted rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ application, variant }) => (
            <tr key={variant.id}>
              <td>
                {variant.pipeLead ? pipeLeadCatalogueLabel(variant.pipeLead) : 'RCC pipe conveyance'} ·{' '}
                {variant.pipeLead?.pipeClassGroup.replaceAll('_', ' / ')}
              </td>
              <td>{variant.pipeLead?.diameterMm} mm</td>
              <td>{km.format(variant.actualLeadKm ?? variant.leadKm)} km</td>
              <td>Rs. {money.format(application.grossRate)} / {application.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lead-print-note">
        Up to 5 km rate plus each started kilometre thereafter. Loading, unloading, and stacking
        are included.
      </p>
    </section>
  )
}

function AppliedCalculationBlock({
  row,
  zone,
  routeLabel
}: {
  row: AppliedLead
  zone: SorZone
  routeLabel: string
}): JSX.Element {
  const { application, variant, codes } = row
  // Applications saved before zoned Lead support used the generic database
  // rate, which is the published Zone III value for the zoned 2026-27 chart.
  const calculationZone = application.rateZone ?? 'zone_3'
  const pipeLead = variant.pipeLead
  return (
    <section className="lead-print-calc-block">
      <div className="lead-print-calc-heading">
        <div>
          <strong>{variant.materialName} - {variantDisplayName(variant)}</strong>
          <span>{routeLabel}</span>
        </div>
        <b>
          {pipeLead
            ? `${pipeLeadCatalogueLabel(pipeLead)} · Statewide`
            : `${codes.join(' + ') || 'No charge'} · ${zoneLabel(calculationZone)}`}
        </b>
      </div>
      <table className="lead-print-calc-table">
        <tbody>
          <tr>
            <th>Material class</th>
            <td>{conveyanceClassLabel(variant.conveyanceClass)}</td>
            <th>Lead</th>
            <td>{variantPrintLeadLabel(variant)}</td>
          </tr>
          {application.calculation?.rows.map((line, index) => (
            <tr key={`${line.label}-${index}`}>
              <th>{index === 0 ? 'Lead rate' : ''}</th>
              <td>{line.label}</td>
              <td>{line.expression}</td>
              <td>{formatSignedMoney(line.amount)}</td>
            </tr>
          ))}
          {application.loadingRate > 0 && (
            <tr>
              <th>Loading</th>
              <td>{handlingLabel(variant.handlingMode)}</td>
              <td>Once</td>
              <td>Rs. {money.format(application.loadingRate)}</td>
            </tr>
          )}
          {application.unloadingRate > 0 && (
            <tr>
              <th>Unloading</th>
              <td>{handlingLabel(variant.handlingMode)}</td>
              <td>Once</td>
              <td>Rs. {money.format(application.unloadingRate)}</td>
            </tr>
          )}
          {application.liftRate > 0 && (
            <tr>
              <th>Lift</th>
              <td>COM-LDLFT-6</td>
              <td>{money.format(variant.liftM)} m total lift</td>
              <td>Rs. {money.format(application.liftRate)}</td>
            </tr>
          )}
          <tr className="lead-print-total-row">
            <th>Gross rate</th>
            <td colSpan={2}>Lead/Lift/Loading-Unloading rate</td>
            <td>Rs. {money.format(application.grossRate)} / {application.unit}</td>
          </tr>
        </tbody>
      </table>
      {!pipeLead && calculationZone !== zone && (
        <p className="lead-print-warning">
          This saved calculation uses {zoneLabel(calculationZone)}. Open its Lead dashboard to
          refresh it with the project&apos;s selected {zoneLabel(zone)} rates.
        </p>
      )}
      {(application.deliveryAtSiteWarning || application.handlingWarning) && (
        <p className="lead-print-warning">
          {application.deliveryAtSiteWarning || application.handlingWarning}
        </p>
      )}
    </section>
  )
}

function leadPrintPinIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'lead-map-logo-pin lead-print-marker',
    html: `<span style="background:${color}"><b>${label}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42]
  })
}

function LeadPrintRouteMap({
  applied,
  assignments,
  points,
  site,
  mapDirections,
  mapLayerType,
  showPointLabels,
  showRouteLabels,
  pointLabelMode,
  labelSize,
  showRouteArrows,
  showBaseMap,
  showLegend,
  legendPosition,
  showScale,
  boxHeightMm,
  boxWidthPercent,
  view,
  interactive = false,
  onViewChange,
  onViewReset,
  onBoxHeightChange
}: {
  applied: AppliedLead[]
  assignments: LeadAssignment[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  mapLayerType: MapLayerType
  showPointLabels: boolean
  showRouteLabels: boolean
  pointLabelMode: 'code' | 'name' | 'code_name'
  labelSize: 'small' | 'medium' | 'large'
  showRouteArrows: boolean
  showBaseMap: boolean
  showLegend: boolean
  legendPosition: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'
  showScale: boolean
  /** 0 fills the page below the heading. */
  boxHeightMm: number
  boxWidthPercent: number
  view: { lat: number; lon: number; zoom: number } | null
  /** Layout editing: pan/zoom the map and drag its bottom edge. */
  interactive?: boolean
  onViewChange?: (view: { lat: number; lon: number; zoom: number }) => void
  onViewReset?: () => void
  onBoxHeightChange?: (heightMm: number) => void
}): JSX.Element {
  const routes = useMemo(
    () => buildRouteLines(applied, assignments, points, site, mapDirections),
    [applied, assignments, points, site, mapDirections]
  )
  const visibleRoutes = routes
  const displayPoints = useMemo(
    () => uniqueRoutePoints(visibleRoutes),
    [visibleRoutes]
  )
  // One swatch per associated route. First/last-mile connectors are drawn in
  // their parent route's own colour and already carry no label on the map, so
  // listing them here only repeated the same colour three times over.
  const legendRoutes = useMemo(
    () => visibleRoutes.filter((route) => !route.suppressLabel),
    [visibleRoutes]
  )

  const osmRoutes = useMemo<Record<string, [number, number][]>>(() => {
    return Object.fromEntries(
      visibleRoutes.map((route) => {
        const geometry = (route.geometry ?? []).filter(
          ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)
        )
        const fallback = [
          [route.from.lat, route.from.lon],
          [route.to.lat, route.to.lon]
        ].filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)) as [number, number][]
        return [route.id, geometry.length >= 2 ? geometry : fallback]
      })
    )
  }, [visibleRoutes])
  const routeCoordinates = useMemo(() => Object.values(osmRoutes), [osmRoutes])

  const bounds = useMemo(() => {
    // Frame the markers AND every drawn route line, so a route whose two
    // endpoint markers sit close together (e.g. disposal lead) still shows
    // its full site-to-dump polyline.
    const coords: [number, number][] = displayPoints
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [p.lat, p.lon])
    for (const route of visibleRoutes) {
      for (const [lat, lon] of route.geometry ?? []) {
        if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lat, lon])
      }
    }
    if (coords.length === 0) return undefined
    const box = L.latLngBounds(coords)
    if (!box.isValid()) return undefined
    // A single display point (e.g. a Disposal Lead whose route starts and ends
    // at the same dump point) yields a zero-area box. Leaflet fits zero-area
    // bounds at zoom Infinity (maxZoom is unset before layers mount), which
    // turns the map center into (NaN, NaN) and crashes every overlay. Buffer
    // tiny boxes into a real area (~1km) so the fit zoom stays finite.
    const sw = box.getSouthWest()
    const ne = box.getNorthEast()
    if (Math.abs(ne.lat - sw.lat) < 0.0005 && Math.abs(ne.lng - sw.lng) < 0.0005) {
      return L.latLngBounds([
        [sw.lat - 0.005, sw.lng - 0.005],
        [ne.lat + 0.005, ne.lng + 0.005]
      ])
    }
    return box
  }, [displayPoints, visibleRoutes])

  // Leaflet derives the initial center/zoom from `bounds` using the container's
  // pixel size. If the MapContainer mounts while the print page is still laying
  // out (container 0x0), that math yields a NaN center and the first overlay
  // render throws "Invalid LatLng object: (NaN, NaN)". Gate mounting on the
  // container having a real measured size.
  const [mapHost, setMapHost] = useState<HTMLDivElement | null>(null)
  const [mapSized, setMapSized] = useState(false)
  useEffect(() => {
    if (!mapHost) return
    const check = (): void => {
      // The flex map can briefly be only its 2px border while the print page is
      // laying out. Mounting Leaflet at that moment makes bounds-fit resolve to
      // max zoom and that empty view used to be persisted as a user map view.
      if (mapHost.clientWidth >= 64 && mapHost.clientHeight >= 64) setMapSized(true)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(mapHost)
    return () => observer.disconnect()
  }, [mapHost])

  if (displayPoints.length === 0 || !bounds) {
    return <div className="lead-print-empty">No mapped Lead variant routes are available.</div>
  }

  return (
    <div
      ref={setMapHost}
      className={`lead-print-map ${boxHeightMm > 0 ? 'fixed-height' : 'fill-page'} ${
        interactive ? 'interactive' : ''
      }`}
      style={{
        ...(boxHeightMm > 0 ? { height: `${boxHeightMm}mm`, flex: '0 0 auto' } : {}),
        width: `${boxWidthPercent}%`
      }}
    >
      {bounds && mapSized && (
        <MapContainer
          // A saved pan/zoom wins over the automatic fit; without one the map
          // still frames every route the way it always has.
          {...(view
            ? { center: [view.lat, view.lon] as [number, number], zoom: view.zoom }
            : { bounds })}
          // Explicit cap so a bounds-fit can never resolve to zoom Infinity
          // (Leaflet's default maxZoom before any tile layer mounts).
          maxZoom={18}
          // The host is flex-sized (`height: auto`). Percentage height on the
          // Leaflet child can therefore resolve to zero even though the host's
          // used height fills the printed page. Absolute insets follow that used
          // box size and keep the live preview/PDF map visible.
          style={{ position: 'absolute', inset: 0, height: 'auto', width: 'auto' }}
          zoomControl={interactive}
          scrollWheelZoom={interactive}
          doubleClickZoom={interactive}
          dragging={interactive}
          attributionControl={false}
        >
          {showBaseMap && (
            <MapLayers key={mapLayerType} printQuality selected={mapLayerType} showControl={false} />
          )}
          <SyncMapToPrintBox bounds={bounds} autoFit={!view} />
          {view && (
            <EnsureRouteContentVisible
              bounds={bounds}
              routes={routeCoordinates}
              onEmptyView={onViewReset}
            />
          )}
          {interactive && onViewChange && (
            <MapViewRecorder
              bounds={bounds}
              routes={routeCoordinates}
              onChange={onViewChange}
              onEmptyView={onViewReset}
            />
          )}
          {showScale && <ScaleControl imperial={false} position="bottomleft" />}
          {Object.entries(osmRoutes).map(([routeId, coords]) => {
            const route = visibleRoutes.find((r) => r.id === routeId)
            if (!route || coords.length < 2) return null
            return (
              <Polyline
                key={routeId}
                positions={coords}
                color={route.color}
                weight={4}
                opacity={0.85}
                dashArray={route.dashed ? '6 7' : undefined}
              >
                {!route.suppressLabel && <Popup>{route.label}</Popup>}
                {showRouteLabels && !route.suppressLabel && (
                  <Tooltip
                    permanent
                    direction="center"
                    className={`lead-print-route-label ${labelSize}`}
                  >
                    {route.label}
                  </Tooltip>
                )}
              </Polyline>
            )
          })}
          {showRouteArrows &&
            visibleRoutes.filter((route) => !route.suppressEndpoints).map((route) => {
              const end = osmRoutes[route.id]?.at(-1)
              if (!end) return null
              return (
                <Marker
                  key={`arrow-${route.id}`}
                  position={end}
                  icon={directionArrowIcon(route.color)}
                  interactive={false}
                />
              )
            })}
          {displayPoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lon]}
              icon={leadPrintPinIcon(
                routePointLogoLabel(point),
                routePointColor(point, visibleRoutes) ?? '#0e639c'
              )}
            >
              {showPointLabels && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -38]}
                  className={`lead-print-point-label ${labelSize}`}
                >
                  {pointPrintLabel(point, pointLabelMode)}
                </Tooltip>
              )}
              <Popup>
                <strong>{point.code}</strong>
                <br />
                {point.label}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
      {showLegend && legendRoutes.length > 0 && (
        <div className={`lead-print-map-legend ${legendPosition}`}>
          <strong>Route legend</strong>
          {legendRoutes.map((route) => (
            <span key={route.id}>
              <i style={{ background: route.color }} />
              {route.label}
            </span>
          ))}
        </div>
      )}
      {interactive && onBoxHeightChange && (
        <MapBoxResizeHandle host={mapHost} onChange={onBoxHeightChange} />
      )}
    </div>
  )
}

/** How many screen px one printed mm currently occupies, including any scale. */
function measurePxPerMm(host: HTMLElement): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:0;height:100mm'
  host.appendChild(probe)
  const perMm = probe.getBoundingClientRect().height / 100
  probe.remove()
  return perMm > 0 ? perMm : 96 / 25.4
}

function mapContainsRoute(map: L.Map, routes: ReadonlyArray<ReadonlyArray<[number, number]>>): boolean {
  const frame = map.getBounds()
  if (!frame.isValid()) return false
  return routeGeometryIntersectsBounds(routes, {
    south: frame.getSouth(),
    west: frame.getWest(),
    north: frame.getNorth(),
    east: frame.getEast()
  })
}

function fitRouteBounds(map: L.Map, bounds: L.LatLngBounds): void {
  if (!bounds.isValid()) return
  try {
    map.fitBounds(bounds, { padding: [30, 30], animate: false })
  } catch {
    // A transient map/layout state can reject fitBounds; ignore rather than crash.
  }
}

/** Repairs a legacy/saved viewport when it contains no part of any printed route. */
function EnsureRouteContentVisible({
  bounds,
  routes,
  onEmptyView
}: {
  bounds: L.LatLngBounds
  routes: ReadonlyArray<ReadonlyArray<[number, number]>>
  onEmptyView?: () => void
}): null {
  const map = useMap()
  const checkedRoutes = useRef<ReadonlyArray<ReadonlyArray<[number, number]>> | null>(null)
  useEffect(() => {
    if (routes.length === 0 || checkedRoutes.current === routes) return
    checkedRoutes.current = routes
    if (mapContainsRoute(map, routes)) return
    fitRouteBounds(map, bounds)
    // Null restores automatic route fitting, so later route edits also remain visible.
    onEmptyView?.()
  }, [bounds, map, onEmptyView, routes])
  return null
}

/** Keeps the printed view in step with deliberate user pan/zoom interactions. */
function MapViewRecorder({
  bounds,
  routes,
  onChange,
  onEmptyView
}: {
  bounds: L.LatLngBounds
  routes: ReadonlyArray<ReadonlyArray<[number, number]>>
  onChange: (view: { lat: number; lon: number; zoom: number }) => void
  onEmptyView?: () => void
}): null {
  const map = useMap()
  const userInteractionPending = useRef(false)

  useEffect(() => {
    const container = map.getContainer()
    const markInteraction = (): void => {
      userInteractionPending.current = true
    }
    const markKeyboardInteraction = (event: KeyboardEvent): void => {
      if (['+', '=', '-', '_'].includes(event.key)) markInteraction()
    }
    container.addEventListener('pointerdown', markInteraction, true)
    container.addEventListener('wheel', markInteraction, true)
    container.addEventListener('keydown', markKeyboardInteraction, true)
    return () => {
      container.removeEventListener('pointerdown', markInteraction, true)
      container.removeEventListener('wheel', markInteraction, true)
      container.removeEventListener('keydown', markKeyboardInteraction, true)
    }
  }, [map])

  const recordUserView = (): void => {
    if (!userInteractionPending.current) return
    userInteractionPending.current = false
    if (!mapContainsRoute(map, routes)) {
      fitRouteBounds(map, bounds)
      onEmptyView?.()
      return
    }
    const center = map.getCenter()
    onChange({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
  }

  useMapEvents({
    moveend: recordUserView,
    zoomend: recordUserView
  })
  return null
}

/**
 * Drag the bottom edge to grow the map down the page. Height is committed in
 * mm so the printed box matches what was dragged, whatever the preview zoom.
 */
function MapBoxResizeHandle({
  host,
  onChange
}: {
  host: HTMLDivElement | null
  onChange: (heightMm: number) => void
}): JSX.Element {
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!host) return
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startHeightPx = host.getBoundingClientRect().height
    // Measured, not assumed: the preview may be scaled, and a transformed
    // ancestor would otherwise make every drag off by that factor.
    const pxPerMm = measurePxPerMm(host)
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent): void => {
      const nextPx = startHeightPx + (moveEvent.clientY - startY)
      onChange(Math.max(MIN_MAP_BOX_HEIGHT_MM, Math.round(nextPx / pxPerMm)))
    }
    const stop = (): void => {
      handle.releasePointerCapture(event.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }

  return (
    <div
      className="lead-print-map-resize"
      role="separator"
      aria-label="Drag to resize the map box"
      title="Drag to resize the map box"
      onPointerDown={startDrag}
    >
      <span />
    </div>
  )
}

function pointPrintLabel(
  point: RoutePoint,
  mode: 'code' | 'name' | 'code_name'
): string {
  if (mode === 'code') return point.code
  if (mode === 'name') return point.label || point.code
  return point.label && point.label !== point.code ? `${point.code} - ${point.label}` : point.code
}

/** Keep Leaflet's internal pixel grid synchronized with the flex-sized print box. */
function SyncMapToPrintBox({
  bounds,
  autoFit
}: {
  bounds: L.LatLngBounds
  autoFit: boolean
}): null {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    let frame = 0
    const sync = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (container.clientWidth < 2 || container.clientHeight < 2) return
        map.invalidateSize({ animate: false, pan: false })
        if (autoFit) fitRouteBounds(map, bounds)
      })
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(container)
    void document.fonts?.ready.then(sync)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [autoFit, bounds, map])
  return null
}

function routePointFromCoordinate(
  id: string,
  label: string,
  point: { lat: number; lon: number }
): RoutePoint {
  return {
    id,
    code: label,
    label,
    lat: point.lat,
    lon: point.lon
  }
}

function routePointColor(point: RoutePoint, routes: RouteLine[]): string | null {
  for (const route of routes) {
    const candidates = route.geometry ?? [
      [route.from.lat, route.from.lon] as [number, number],
      [route.to.lat, route.to.lon] as [number, number]
    ]
    if (
      candidates.some(
        ([lat, lon]) => Math.abs(lat - point.lat) < 0.000001 && Math.abs(lon - point.lon) < 0.000001
      )
    ) {
      return route.color
    }
  }
  return null
}

function routePointLogoLabel(point: RoutePoint): string {
  const text = `${point.code} ${point.label}`.toLowerCase()
  if (text.includes('work location') || text.includes('project')) return 'P'
  if (text.includes('cement') || text.startsWith('c')) return 'C'
  if (text.includes('sand') || text.startsWith('s')) return 'S'
  if (text.includes('stone') || text.includes('rock')) return 'ST'
  if (text.includes('dump') || text.includes('disposal')) return 'D'
  if (text.includes('water')) return 'W'
  return point.code.slice(0, 2).toUpperCase()
}

function directionArrowIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'lead-map-arrow',
    html: `<span style="color:${color}">&rarr;</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

function chargeCodesForApplication(
  variant: LeadVariant,
  application: LeadApplication
): AppliedChargeCode[] {
  if (variant.pipeLead) return []
  const codes = new Set<AppliedChargeCode>()
  if (
    application.leadRate > 0 ||
    (application.calculation?.fullLeadRate ?? 0) > 0 ||
    variant.leadKm > 0.05
  ) {
    codes.add(variant.leadKm <= 0.15 && !isDisposalLead(variant) ? 'COM-LDLFT-1' : 'COM-LDLFT-2')
  }
  if ((application.loadingRate > 0 || application.unloadingRate > 0) && variant.handlingMode === 'manual_no_idle') {
    codes.add('COM-LDLFT-3')
  }
  if ((application.loadingRate > 0 || application.unloadingRate > 0) && variant.handlingMode === 'manual_with_idle') {
    codes.add('COM-LDLFT-4')
  }
  if ((application.loadingRate > 0 || application.unloadingRate > 0) && variant.handlingMode === 'mechanical') {
    codes.add('COM-LDLFT-5')
  }
  if (application.liftRate > 0) codes.add('COM-LDLFT-6')
  return CHARGE_CODE_ORDER.filter((code) => codes.has(code))
}

function buildRouteLines(
  applied: AppliedLead[],
  assignments: LeadAssignment[],
  points: LeadSelectablePoint[],
  site: ProjectLocation | null,
  mapDirections: LeadMapDirection[] = []
): RouteLine[] {
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment]))
  const workPoint = pointFromLeadPoint(
    pointsById.get(PROJECT_WORK_POINT_ID) ??
      (site
        ? {
            id: PROJECT_WORK_POINT_ID,
            code: 'Work Location',
            name: site.label || 'Project work location',
            kind: 'site',
            lat: site.lat,
            lon: site.lng
          }
        : null)
  )
  const colors = ['#0e639c', '#4ec9b0', '#ce9178', '#c586c0', '#dcdcaa', '#569cd6']
  const appliedVariantIds = new Set(applied.map((row) => row.variant.id))
  const routedVariantIds = new Set(
    applied
      .filter((row) => (row.variant.routeGeometry?.length ?? 0) >= 2)
      .map((row) => row.variant.id)
  )
  const routes: RouteLine[] = mapDirections
    .filter(
      (direction) =>
        direction.active !== false &&
        direction.points.length >= 2 &&
        (!direction.variantId ||
          (appliedVariantIds.has(direction.variantId) && !routedVariantIds.has(direction.variantId)))
    )
    .map((direction) => {
      const from = routePointFromCoordinate(
        `${direction.id}:from`,
        `${direction.label} start`,
        direction.points[0]
      )
      const to = routePointFromCoordinate(
        `${direction.id}:to`,
        `${direction.label} end`,
        direction.points[direction.points.length - 1]
      )
      return {
        id: direction.id,
        from,
        to,
        label: direction.label,
        color: direction.color || '#0e639c',
        geometry: direction.points.map((point) => [point.lat, point.lon] as [number, number]),
        variantId: direction.variantId
      }
    })
  const customVariantIds = new Set(routes.map((route) => route.variantId).filter(Boolean))
  for (const [index, row] of applied.entries()) {
    if (customVariantIds.has(row.variant.id)) continue
    const assignmentPointId = row.variant.assignmentId
      ? assignmentsById.get(row.variant.assignmentId)?.pointId
      : undefined
    let from =
      pointFromLeadPoint(pointsById.get(row.variant.startPointId || '')) ??
      pointFromLeadPoint(pointsById.get(assignmentPointId || '')) ??
      workPoint
    const to = pointFromLeadPoint(pointsById.get(row.variant.endPointId || '')) ?? workPoint
    // Disposal-style variants can resolve both endpoints to the same point
    // (the assignment and endPointId are the same dump point). The material
    // actually moves work site -> dump, so show the work location as the
    // source marker instead of collapsing to a single pin.
    if (from && to && from.id === to.id && workPoint && workPoint.id !== to.id) {
      from = workPoint
    }
    if (!from || !to || (from.id === to.id && !row.variant.startPointId && !row.variant.endPointId)) continue
    routes.push({
      id: `${row.application.id}:${row.variant.id}`,
      from,
      to,
      label: `${row.variant.materialName} ${km.format(row.variant.leadKm)} km`,
      color: leadRouteColor(row.variant, index),
      geometry: row.variant.routeGeometry?.map(
        (point) => [point.lat, point.lon] as [number, number]
      ),
      variantId: row.variant.id
    })
    if ((row.variant.firstMileGeometry?.length ?? 0) >= 2) {
      const firstGeometry = row.variant.firstMileGeometry!
      routes.push({
        id: `${row.application.id}:${row.variant.id}:first-mile`,
        from: routePointFromCoordinate(
          `${row.variant.id}:first-mile:from`,
          'First mile start',
          firstGeometry[0]
        ),
        to: routePointFromCoordinate(
          `${row.variant.id}:first-mile:to`,
          'First routed road position',
          firstGeometry.at(-1)!
        ),
        label: `First mile ${km.format(row.variant.firstMileKm ?? 0)} km`,
        color: leadRouteColor(row.variant, index),
        geometry: firstGeometry.map((point) => [point.lat, point.lon] as [number, number]),
        variantId: row.variant.id,
        dashed: true,
        suppressEndpoints: true,
        suppressLabel: true
      })
    }
    if ((row.variant.lastMileGeometry?.length ?? 0) >= 2) {
      const lastGeometry = row.variant.lastMileGeometry!
      routes.push({
        id: `${row.application.id}:${row.variant.id}:last-mile`,
        from: routePointFromCoordinate(
          `${row.variant.id}:last-mile:from`,
          'Last routed road position',
          lastGeometry[0]
        ),
        to: routePointFromCoordinate(
          `${row.variant.id}:last-mile:to`,
          'Last mile end',
          lastGeometry.at(-1)!
        ),
        label: `Last mile ${km.format(row.variant.lastMileKm ?? 0)} km`,
        color: leadRouteColor(row.variant, index),
        geometry: lastGeometry.map((point) => [point.lat, point.lon] as [number, number]),
        variantId: row.variant.id,
        dashed: true,
        suppressEndpoints: true,
        suppressLabel: true
      })
    }
  }
  return routes
}

function routeLabelForVariant(
  variant: LeadVariant,
  assignments: LeadAssignment[],
  points: LeadSelectablePoint[],
  site: ProjectLocation | null
): string {
  const route = buildRouteLines(
    [{ application: {} as LeadApplication, variant, codes: [] }],
    assignments,
    points,
    site
  )[0]
  if (!route) return variant.variantName || 'Manual lead without mapped route'
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const viaLabels = (variant.viaPointIds ?? []).map(
    (pointId) => pointsById.get(pointId)?.code ?? 'Work Location'
  )
  return [route.from.code, ...viaLabels, route.to.code].join(' -> ')
}

function pointFromLeadPoint(point: LeadSelectablePoint | null | undefined): RoutePoint | null {
  if (!point) return null
  return {
    id: point.id,
    code: point.code,
    label: point.name || point.kind.replaceAll('_', ' '),
    lat: point.lat,
    lon: point.lon
  }
}

function uniqueRoutePoints(routes: RouteLine[]): RoutePoint[] {
  const map = new Map<string, RoutePoint>()
  for (const route of routes) {
    if (route.suppressEndpoints) continue
    map.set(route.from.id, route.from)
    map.set(route.to.id, route.to)
  }
  return Array.from(map.values())
}

function chargeCodeForDescription(chargeCode: AppliedChargeCode): string {
  if (chargeCode === 'COM-LDLFT-2') return 'Distance'
  if (chargeCode === 'COM-LDLFT-3' || chargeCode === 'COM-LDLFT-4' || chargeCode === 'COM-LDLFT-5') {
    return 'Description of item'
  }
  return 'Total distance (total lead includes initial lead)'
}

function variantDisplayName(variant: LeadVariant): string {
  return variant.variantName || `${variant.materialName} variant`
}

function handlingLabel(mode: LeadVariant['handlingMode']): string {
  if (mode === 'manual_no_idle') return 'Manual L/U, idle hire not added'
  if (mode === 'manual_with_idle') return 'Manual L/U including idle hire'
  if (mode === 'mechanical') return 'Mechanical L/U'
  return 'No L/U'
}

function variantPrintLeadLabel(variant: LeadVariant): string {
  const actualLeadKm = variant.actualLeadKm ?? variant.leadKm
  const multiplier = variant.roadMultiplier ?? 1
  const segmentKm = variant.roadSegmentKm ?? 0
  if (multiplier > 1 && Math.abs(actualLeadKm - variant.leadKm) > 0.0005) {
    const normalKm = Math.max(actualLeadKm - segmentKm, 0)
    return `${km.format(variant.leadKm)} km equivalent (${km.format(normalKm)} km + ${km.format(segmentKm)} km x ${multiplier})`
  }
  return `${km.format(variant.leadKm)} km`
}

function isDisposalLead(variant: LeadVariant): boolean {
  return variant.materialName.trim().toLowerCase() === 'disposal lead'
}

function orderIndex(order: string[], value: string): number {
  const index = order.indexOf(value)
  return index === -1 ? order.length : index
}

function printPageStyle(
  settings: ReturnType<typeof normalizeLeadPrintSettings>,
  page: LeadPrintPageKey,
  signatureFooter?: SignatureFooterSettings
): CSSProperties {
  const size = paperSizeMm(page === 'map' ? settings.mapPageSize : settings.pageSize)
  const orientation = settings.pages[page].orientation
  const width = orientation === 'landscape' ? size.height : size.width
  const height = orientation === 'landscape' ? size.width : size.height
  const margins = {
    ...settings.margins,
    bottom:
      signatureFooter?.enabled && signatureFooter.placement === 'every_page'
        ? Math.max(settings.margins.bottom, 28)
        : settings.margins.bottom
  }
  return {
    width: `${width}mm`,
    minHeight: `${height}mm`,
    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  }
}

function paperSizeMm(pageSize: LeadPrintSettings['pageSize']): { width: number; height: number } {
  if (pageSize === 'A2') return { width: 420, height: 594 }
  if (pageSize === 'A3') return { width: 297, height: 420 }
  if (pageSize === 'Letter') return { width: 216, height: 279 }
  if (pageSize === 'Legal') return { width: 216, height: 356 }
  return { width: 210, height: 297 }
}

function formatRate(value: number | undefined): string {
  return value === undefined ? '' : money.format(value)
}

function formatSignedMoney(value: number): string {
  if (value < 0) return `-Rs. ${money.format(Math.abs(value))}`
  return `Rs. ${money.format(value)}`
}
