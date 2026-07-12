import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { MapPinned, Plus, Printer, Settings, X } from 'lucide-react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { conveyanceClassLabel, fetchLeadRates, type LeadRateRow } from '../../lib/lead'
import { newId } from '../../lib/tree'
import type {
  ConveyanceClass,
  LeadApplication,
  LeadAssignment,
  LeadChargeCode,
  LeadMapDirection,
  LeadPoint,
  LeadPointKind,
  LeadPrintPageKey,
  LeadPrintSettings,
  LeadVariant,
  ProjectLocation
} from '../../types/project'
import LeadMapDirectionEditor, {
  blankLeadMapDirectionDraft,
  draftFromLeadMapDirection,
  type LeadMapDirectionDraft
} from './LeadMapDirectionEditor'

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
}

interface Props {
  year: string
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  printSettings?: LeadPrintSettings
  onUpdatePrintSettings: (settings: LeadPrintSettings) => void
  onUpsertPoint: (point: LeadPoint) => void
  onUpsertMapDirection: (direction: LeadMapDirection) => void
  onRemoveMapDirection: (directionId: string) => void
  onClose: () => void
}

const PROJECT_WORK_POINT_ID = '__project_work_location__'

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

const DEFAULT_PRINT_SETTINGS: Required<Pick<LeadPrintSettings, 'pageSize' | 'margins' | 'showMapLabels' | 'showRouteArrows' | 'showBaseMap'>> & {
  pages: Record<LeadPrintPageKey, { orientation: 'portrait' | 'landscape' }>
} = {
  pageSize: 'A4',
  margins: { top: 15, right: 12, bottom: 15, left: 12 },
  pages: {
    chart: { orientation: 'portrait' },
    calculation: { orientation: 'portrait' },
    map: { orientation: 'landscape' }
  },
  showMapLabels: true,
  showRouteArrows: true,
  showBaseMap: true
}

const PAGE_LABELS: Record<LeadPrintPageKey, string> = {
  chart: 'Lead Print 1 - Source chart',
  calculation: 'Lead Print 2 - Rate calculations',
  map: 'Lead Print 3 - Map'
}

const POINT_KINDS: Array<{ value: LeadPointKind; label: string }> = [
  { value: 'quarry', label: 'Quarry' },
  { value: 'sand_reach', label: 'Sand reach' },
  { value: 'godown', label: 'Godown' },
  { value: 'stockyard', label: 'Stockyard' },
  { value: 'water', label: 'Water source' },
  { value: 'other', label: 'Other' }
]

interface PrintPointDraft {
  code: string
  name: string
  kind: LeadPointKind
  lat: string
  lon: string
}

export default function LeadPrintPreviewModal({
  year,
  variants,
  applications,
  assignments,
  points,
  site,
  mapDirections,
  printSettings,
  onUpdatePrintSettings,
  onUpsertPoint,
  onUpsertMapDirection,
  onRemoveMapDirection,
  onClose
}: Props): JSX.Element {
  const [rates, setRates] = useState<LeadRateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false)
  const [directionDraft, setDirectionDraft] = useState<LeadMapDirectionDraft>(() =>
    blankLeadMapDirectionDraft()
  )
  const [directionDrawing, setDirectionDrawing] = useState(false)
  const [pointDraft, setPointDraft] = useState<PrintPointDraft>(() => blankPrintPointDraft(points))

  const layout = normalizePrintSettings(printSettings)

  const updateLayout = (patch: LeadPrintSettings): void => {
    onUpdatePrintSettings(normalizePrintSettings({ ...layout, ...patch }))
  }

  const updatePageOrientation = (
    page: LeadPrintPageKey,
    orientation: 'portrait' | 'landscape'
  ): void => {
    updateLayout({
      ...layout,
      pages: {
        ...layout.pages,
        [page]: { orientation }
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchLeadRates(year)
      .then((rows) => {
        if (!cancelled) setRates(rows)
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to load Lead chart rates.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [year])

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

  const addPrintPoint = (): void => {
    const code = pointDraft.code.trim().toUpperCase()
    const lat = Number(pointDraft.lat)
    const lon = Number(pointDraft.lon)
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    onUpsertPoint({
      id: newId(),
      code,
      name: pointDraft.name.trim(),
      kind: pointDraft.kind,
      lat,
      lon
    })
    setPointDraft(blankPrintPointDraft([...points, {
      id: code,
      code,
      name: pointDraft.name.trim(),
      kind: pointDraft.kind,
      lat,
      lon
    }]))
  }

  const handleMapClick = (lat: number, lon: number): void => {
    if (directionDrawing) {
      setDirectionDraft((current) => ({
        ...current,
        points: [...current.points, { lat, lon }]
      }))
      return
    }
    setPointDraft((current) => ({
      ...current,
      lat: lat.toFixed(6),
      lon: lon.toFixed(6)
    }))
  }

  return (
    <div className="lead-print-overlay" role="dialog" aria-modal="true">
      <div className="lead-print-shell">
        <div className="lead-print-toolbar">
          <div>
            <strong>Lead Chart Print Preview</strong>
            <span>{year} | {applied.length} applied item(s)</span>
          </div>
          <div>
            <button
              className={`btn ghost ${settingsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings size={14} /> Settings
            </button>
            <button
              className={`btn ghost ${mapSettingsOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setMapSettingsOpen((open) => !open)}
            >
              <MapPinned size={14} /> Map Print Settings
            </button>
            <button className="btn ghost" type="button" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            <button className="btn ghost" type="button" onClick={onClose}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        {settingsOpen && (
          <PrintSettingsPanel
            settings={layout}
            onUpdate={updateLayout}
            onUpdateMargin={updateMargin}
            onUpdatePageOrientation={updatePageOrientation}
          />
        )}
        {mapSettingsOpen && (
          <MapPrintSettingsPanel
            pointDraft={pointDraft}
            onPointDraftChange={setPointDraft}
            onAddPoint={addPrintPoint}
            variants={applied.map((row) => row.variant)}
            assignments={assignments}
            directions={mapDirections}
            points={points}
            site={site}
            directionDraft={directionDraft}
            drawing={directionDrawing}
            onDirectionDraftChange={setDirectionDraft}
            onDrawingChange={setDirectionDrawing}
            onSaveDirection={(direction) => {
              onUpsertMapDirection(direction)
              setDirectionDraft(draftFromLeadMapDirection(direction))
              setDirectionDrawing(false)
            }}
            onDeleteDirection={onRemoveMapDirection}
          />
        )}
        <div className="lead-print-scroll">
          <article
            className={`lead-print-page ${layout.pages.chart.orientation}`}
            style={printPageStyle(layout, 'chart')}
          >
            <header className="lead-print-page-header">
              <div>
                <h1>Lead/Lift/Loading & Unloading Charges {year}</h1>
                <p>Source chart tables used by the applied Lead variants in this project.</p>
              </div>
              <strong>E-Estimate</strong>
            </header>

            {loading ? (
              <div className="lead-print-empty">Loading Supabase Lead chart tables...</div>
            ) : error ? (
              <div className="lead-print-empty">{error}</div>
            ) : usedCodes.length === 0 ? (
              <div className="lead-print-empty">
                No Lead/Lift variant has been applied to any item yet.
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
          </article>

          <article
            className={`lead-print-page ${layout.pages.calculation.orientation}`}
            style={printPageStyle(layout, 'calculation')}
          >
            <header className="lead-print-section-header">
              <h2>Applied Variant Rate Calculations</h2>
              <p>Only Lead variants currently applied to items are included.</p>
            </header>
            {applied.length === 0 ? (
              <div className="lead-print-empty">Apply a Lead variant to an item to show calculations.</div>
            ) : (
              <div className="lead-print-calculation-grid">
                {applied.map((row) => (
                  <AppliedCalculationBlock
                    key={row.application.id}
                    row={row}
                    routeLabel={routeLabelForVariant(row.variant, assignments, points, site)}
                  />
                ))}
              </div>
            )}
          </article>

          <article
            className={`lead-print-page ${layout.pages.map.orientation}`}
            style={printPageStyle(layout, 'map')}
          >
            <header className="lead-print-section-header">
              <h2>Lead Route Map</h2>
              <p>Printed route schematic for points and applied Lead variant directions.</p>
            </header>
            <LeadPrintRouteMap
              applied={applied}
              assignments={assignments}
              points={points}
              site={site}
              mapDirections={mapDirections}
              directionDraft={directionDraft}
              showLabels={layout.showMapLabels}
              showRouteArrows={layout.showRouteArrows}
              showBaseMap={layout.showBaseMap}
              editing={mapSettingsOpen}
              drawing={directionDrawing}
              onMapClick={handleMapClick}
            />
          </article>
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
  settings: ReturnType<typeof normalizePrintSettings>
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
      <div className="lead-print-map-toggles">
        <label>
          <input
            type="checkbox"
            checked={settings.showMapLabels}
            onChange={(event) => onUpdate({ ...settings, showMapLabels: event.target.checked })}
          />
          Show map labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showRouteArrows}
            onChange={(event) => onUpdate({ ...settings, showRouteArrows: event.target.checked })}
          />
          Show route direction arrows
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showBaseMap}
            onChange={(event) => onUpdate({ ...settings, showBaseMap: event.target.checked })}
          />
          Show base map
        </label>
      </div>
    </div>
  )
}

function MapPrintSettingsPanel({
  pointDraft,
  onPointDraftChange,
  onAddPoint,
  variants,
  assignments,
  directions,
  points,
  site,
  directionDraft,
  drawing,
  onDirectionDraftChange,
  onDrawingChange,
  onSaveDirection,
  onDeleteDirection
}: {
  pointDraft: PrintPointDraft
  onPointDraftChange: (draft: PrintPointDraft) => void
  onAddPoint: () => void
  variants: LeadVariant[]
  assignments: LeadAssignment[]
  directions: LeadMapDirection[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  directionDraft: LeadMapDirectionDraft
  drawing: boolean
  onDirectionDraftChange: (draft: LeadMapDirectionDraft) => void
  onDrawingChange: (drawing: boolean) => void
  onSaveDirection: (direction: LeadMapDirection) => void
  onDeleteDirection: (directionId: string) => void
}): JSX.Element {
  const canAddPoint =
    pointDraft.code.trim().length > 0 &&
    Number.isFinite(Number(pointDraft.lat)) &&
    Number.isFinite(Number(pointDraft.lon))

  return (
    <div className="lead-print-map-settings">
      <section>
        <strong>Set New Point</strong>
        <div className="lead-form-grid">
          <label>
            Code
            <input
              className="text-input"
              value={pointDraft.code}
              onChange={(event) =>
                onPointDraftChange({ ...pointDraft, code: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label>
            Kind
            <select
              className="select-input"
              value={pointDraft.kind}
              onChange={(event) =>
                onPointDraftChange({ ...pointDraft, kind: event.target.value as LeadPointKind })
              }
            >
              {POINT_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Name
            <input
              className="text-input"
              value={pointDraft.name}
              onChange={(event) => onPointDraftChange({ ...pointDraft, name: event.target.value })}
            />
          </label>
          <label>
            Latitude
            <input
              className="text-input"
              value={pointDraft.lat}
              onChange={(event) => onPointDraftChange({ ...pointDraft, lat: event.target.value })}
            />
          </label>
          <label>
            Longitude
            <input
              className="text-input"
              value={pointDraft.lon}
              onChange={(event) => onPointDraftChange({ ...pointDraft, lon: event.target.value })}
            />
          </label>
        </div>
        <div className="lead-point-actions">
          <button className="btn" type="button" disabled={!canAddPoint} onClick={onAddPoint}>
            <Plus size={14} /> Add Point
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={!pointDraft.lat && !pointDraft.lon}
            onClick={() => onPointDraftChange({ ...pointDraft, lat: '', lon: '' })}
          >
            Clear Point
          </button>
        </div>
        <small>When the line tool is off, clicking the map fills this point location.</small>
      </section>
      <section>
        <strong>Direction / Line Tool</strong>
        <LeadMapDirectionEditor
          variants={variants}
          assignments={assignments}
          directions={directions}
          points={points}
          site={site}
          draft={directionDraft}
          drawing={drawing}
          onDraftChange={onDirectionDraftChange}
          onDrawingChange={onDrawingChange}
          onSave={onSaveDirection}
          onDelete={onDeleteDirection}
        />
      </section>
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

function AppliedCalculationBlock({
  row,
  routeLabel
}: {
  row: AppliedLead
  routeLabel: string
}): JSX.Element {
  const { application, variant, codes } = row
  return (
    <section className="lead-print-calc-block">
      <div className="lead-print-calc-heading">
        <div>
          <strong>{variant.materialName} - {variantDisplayName(variant)}</strong>
          <span>{routeLabel}</span>
        </div>
        <b>{codes.join(' + ') || 'No charge'}</b>
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
  directionDraft,
  showLabels,
  showRouteArrows,
  showBaseMap,
  editing,
  drawing,
  onMapClick
}: {
  applied: AppliedLead[]
  assignments: LeadAssignment[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  mapDirections: LeadMapDirection[]
  directionDraft: LeadMapDirectionDraft
  showLabels: boolean
  showRouteArrows: boolean
  showBaseMap: boolean
  editing: boolean
  drawing: boolean
  onMapClick: (lat: number, lon: number) => void
}): JSX.Element {
  const routes = useMemo(
    () => buildRouteLines(applied, assignments, points, site, mapDirections),
    [applied, assignments, points, site, mapDirections]
  )
  const draftRoute = useMemo<RouteLine | null>(() => {
    if (directionDraft.points.length < 2) return null
    const from = routePointFromCoordinate('draft-from', 'Draft start', directionDraft.points[0])
    const to = routePointFromCoordinate(
      'draft-to',
      'Draft end',
      directionDraft.points[directionDraft.points.length - 1]
    )
    return {
      id: 'draft-direction',
      label: directionDraft.label || 'Draft direction',
      from,
      to,
      color: directionDraft.color || '#0e639c',
      geometry: directionDraft.points.map((point) => [point.lat, point.lon])
    }
  }, [directionDraft])
  const visibleRoutes = useMemo(
    () => (draftRoute ? [...routes, draftRoute] : routes),
    [draftRoute, routes]
  )
  const displayPoints = useMemo(
    () => uniqueRoutePoints([
      ...visibleRoutes,
      ...(editing ? points.map((point) => pointRouteLine(point)) : []),
      ...(editing && site
        ? [
            pointRouteLine({
              id: PROJECT_WORK_POINT_ID,
              code: 'Work Location',
              name: site.label || 'Project work location',
              kind: 'site',
              lat: site.lat,
              lon: site.lng
            })
          ]
        : [])
    ]),
    [editing, points, site, visibleRoutes]
  )

  const [osmRoutes, setOsmRoutes] = useState<Record<string, [number, number][]>>({})
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (visibleRoutes.length === 0) return
    const controller = new AbortController()
    let cancelled = false

    async function fetchAll(): Promise<void> {
      const results: Record<string, [number, number][]> = {}
      let anySuccess = false
      await Promise.all(
        visibleRoutes.map(async (route) => {
          if (route.geometry) {
            results[route.id] = route.geometry
            anySuccess = true
            return
          }
          try {
            const url =
              `https://router.project-osrm.org/route/v1/driving/` +
              `${route.from.lon},${route.from.lat};${route.to.lon},${route.to.lat}` +
              `?geometries=geojson&overview=full`
            const resp = await fetch(url, { signal: controller.signal })
            if (!resp.ok) throw new Error(`OSRM ${resp.status}`)
            const data = (await resp.json()) as {
              routes?: { geometry?: { coordinates?: [number, number][] } }[]
            }
            const coords = data.routes?.[0]?.geometry?.coordinates
            if (coords && coords.length > 0) {
              results[route.id] = coords.map(([lon, lat]) => [lat, lon])
              anySuccess = true
            } else {
              throw new Error('No route geometry')
            }
          } catch {
            // Fallback: straight line between points
            results[route.id] = [
              [route.from.lat, route.from.lon],
              [route.to.lat, route.to.lon]
            ]
          }
        })
      )
      if (!cancelled) {
        setOsmRoutes(results)
        setFetchError(!anySuccess && visibleRoutes.length > 0)
      }
    }

    void fetchAll()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [visibleRoutes])

  const bounds = useMemo(() => {
    if (displayPoints.length === 0) return undefined
    return L.latLngBounds(displayPoints.map((p) => [p.lat, p.lon]))
  }, [displayPoints])

  if (displayPoints.length === 0) {
    return <div className="lead-print-empty">No mapped Lead variant routes are available.</div>
  }

  return (
    <div className={`lead-print-map ${editing ? 'editing' : ''}`}>
      {bounds && (
        <MapContainer
          bounds={bounds}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={editing}
          dragging={editing}
          attributionControl={false}
        >
          {showBaseMap && (
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}
          {editing && <EditableMapClick onPick={onMapClick} />}
          <FitBoundsOnce bounds={bounds} />
          {Object.entries(osmRoutes).map(([routeId, coords]) => {
            const route = visibleRoutes.find((r) => r.id === routeId)
            if (!route || coords.length < 2) return null
            return (
              <Polyline
                key={routeId}
                positions={coords}
                color={route.color}
                weight={route.id === 'draft-direction' ? 5 : 4}
                opacity={0.85}
                dashArray={route.id === 'draft-direction' ? '6 7' : undefined}
              >
                {showLabels && <Popup>{route.label}</Popup>}
              </Polyline>
            )
          })}
          {showRouteArrows &&
            visibleRoutes.map((route) => {
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
              {showLabels && (
                <Tooltip permanent direction="top" offset={[0, -38]}>
                  {point.code}
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
      {editing && (
        <p className="lead-print-map-edit-note">
          {drawing
            ? 'Line tool active: click the map to add direction points.'
            : 'Click the map to set a new point location.'}
        </p>
      )}
      {fetchError && (
        <p className="lead-print-warning">
          Could not fetch road directions from OSRM — straight lines shown instead.
        </p>
      )}
    </div>
  )
}

function FitBoundsOnce({ bounds }: { bounds: L.LatLngBounds }): null {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] })
  }, [bounds, map])
  return null
}

function EditableMapClick({ onPick }: { onPick: (lat: number, lon: number) => void }): null {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng)
  })
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
  const routes: RouteLine[] = mapDirections
    .filter(
      (direction) =>
        direction.active !== false &&
        direction.points.length >= 2 &&
        (!direction.variantId || appliedVariantIds.has(direction.variantId))
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
    const from =
      pointFromLeadPoint(pointsById.get(row.variant.startPointId || '')) ??
      pointFromLeadPoint(pointsById.get(assignmentPointId || '')) ??
      workPoint
    const to = pointFromLeadPoint(pointsById.get(row.variant.endPointId || '')) ?? workPoint
    if (!from || !to || (from.id === to.id && !row.variant.startPointId && !row.variant.endPointId)) continue
    routes.push({
      id: `${row.application.id}:${row.variant.id}`,
      from,
      to,
      label: `${row.variant.materialName} ${km.format(row.variant.leadKm)} km`,
      color: colors[index % colors.length],
      variantId: row.variant.id
    })
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
  return `${route.from.code} -> ${route.to.code}`
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

function pointRouteLine(point: LeadSelectablePoint): RouteLine {
  const routePoint = pointFromLeadPoint(point)!
  return {
    id: `point:${point.id}`,
    label: routePoint.label,
    from: routePoint,
    to: routePoint,
    color: '#0e639c'
  }
}

function uniqueRoutePoints(routes: RouteLine[]): RoutePoint[] {
  const map = new Map<string, RoutePoint>()
  for (const route of routes) {
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

function normalizePrintSettings(settings?: LeadPrintSettings) {
  return {
    pageSize: settings?.pageSize ?? DEFAULT_PRINT_SETTINGS.pageSize,
    margins: settings?.margins ?? DEFAULT_PRINT_SETTINGS.margins,
    pages: {
      chart: {
        orientation:
          settings?.pages?.chart?.orientation ?? DEFAULT_PRINT_SETTINGS.pages.chart.orientation
      },
      calculation: {
        orientation:
          settings?.pages?.calculation?.orientation ??
          DEFAULT_PRINT_SETTINGS.pages.calculation.orientation
      },
      map: {
        orientation: settings?.pages?.map?.orientation ?? DEFAULT_PRINT_SETTINGS.pages.map.orientation
      }
    },
    showMapLabels: settings?.showMapLabels ?? DEFAULT_PRINT_SETTINGS.showMapLabels,
    showRouteArrows: settings?.showRouteArrows ?? DEFAULT_PRINT_SETTINGS.showRouteArrows,
    showBaseMap: settings?.showBaseMap ?? DEFAULT_PRINT_SETTINGS.showBaseMap
  }
}

function printPageStyle(
  settings: ReturnType<typeof normalizePrintSettings>,
  page: LeadPrintPageKey
): CSSProperties {
  const size = paperSizeMm(settings.pageSize)
  const orientation = settings.pages[page].orientation
  const width = orientation === 'landscape' ? size.height : size.width
  const height = orientation === 'landscape' ? size.width : size.height
  const margins = settings.margins
  return {
    width: `${width}mm`,
    minHeight: `${height}mm`,
    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
  }
}

function paperSizeMm(pageSize: LeadPrintSettings['pageSize']): { width: number; height: number } {
  if (pageSize === 'A3') return { width: 297, height: 420 }
  if (pageSize === 'Letter') return { width: 216, height: 279 }
  if (pageSize === 'Legal') return { width: 216, height: 356 }
  return { width: 210, height: 297 }
}

function blankPrintPointDraft(points: LeadSelectablePoint[]): PrintPointDraft {
  const used = new Set(points.map((point) => point.code.toUpperCase()))
  let code = 'P1'
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `P${index}`
    if (!used.has(candidate)) {
      code = candidate
      break
    }
  }
  return {
    code,
    name: '',
    kind: 'other',
    lat: '',
    lon: ''
  }
}

function formatRate(value: number | undefined): string {
  return value === undefined ? '' : money.format(value)
}

function formatSignedMoney(value: number): string {
  if (value < 0) return `-Rs. ${money.format(Math.abs(value))}`
  return `Rs. ${money.format(value)}`
}
