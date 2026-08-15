import { Eye, MapPinned, Maximize2, Printer, Tags, Type } from 'lucide-react'
import {
  MIN_MAP_BOX_HEIGHT_MM,
  MIN_MAP_BOX_WIDTH_PERCENT,
  normalizeLeadPrintSettings,
  type NormalizedLeadPrintSettings
} from '../../lib/leadPrintLayout'
import type { LeadPrintSettings, Orientation } from '../../types/project'

interface Props {
  settings?: LeadPrintSettings
  onChange: (settings: LeadPrintSettings) => void
  onOpenPreview?: () => void
  embedded?: boolean
}

export default function LeadMapPrintLayout({
  settings,
  onChange,
  onOpenPreview,
  embedded = false
}: Props): JSX.Element {
  const layout = normalizeLeadPrintSettings(settings)
  const commit = (next: NormalizedLeadPrintSettings): void => onChange(next)

  const setMapOrientation = (orientation: Orientation): void => {
    commit({
      ...layout,
      pages: {
        ...layout.pages,
        map: { ...layout.pages.map, orientation }
      }
    })
  }

  return (
    <div className={`lead-map-print-layout ${embedded ? 'embedded' : ''}`}>
      <div className="lead-map-print-layout-heading">
        <div>
          <strong><MapPinned size={16} /> Map Print Layout</strong>
          <small>Control only the route map page shown in Lead Print Preview.</small>
        </div>
        {onOpenPreview && (
          <div className="lead-map-print-layout-actions">
            <button className="btn" type="button" onClick={onOpenPreview}>
              <Eye size={14} /> Open Preview
            </button>
          </div>
        )}
      </div>

      <div className="lead-map-print-layout-grid map-only">
        <section>
          <div className="lead-map-print-section-title">
            <Printer size={15} /> Map page
          </div>
          <div className="lead-map-print-field-grid">
            <label>
              Map paper size
              <select
                className="select-input"
                value={layout.mapPageSize}
                onChange={(event) =>
                  commit({
                    ...layout,
                    mapPageSize: event.target.value as NormalizedLeadPrintSettings['mapPageSize']
                  })
                }
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="A2">A2</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </label>
            <label>
              Map orientation
              <OrientationButtons
                value={layout.pages.map.orientation}
                onChange={setMapOrientation}
              />
            </label>
            <label>
              Map box height
              <div className="lead-segmented">
                <button
                  type="button"
                  className={layout.mapBoxHeightMm === 0 ? 'active' : ''}
                  onClick={() => commit({ ...layout, mapBoxHeightMm: 0 })}
                >
                  Fill page
                </button>
                <button
                  type="button"
                  className={layout.mapBoxHeightMm > 0 ? 'active' : ''}
                  onClick={() =>
                    commit({
                      ...layout,
                      mapBoxHeightMm: layout.mapBoxHeightMm || 150
                    })
                  }
                >
                  Fixed
                </button>
              </div>
            </label>
            <label>
              Height (mm)
              <input
                className="text-input"
                type="number"
                min={MIN_MAP_BOX_HEIGHT_MM}
                max={1000}
                step={5}
                disabled={layout.mapBoxHeightMm === 0}
                value={layout.mapBoxHeightMm || ''}
                placeholder="Fills the page"
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  commit({ ...layout, mapBoxHeightMm: Math.max(MIN_MAP_BOX_HEIGHT_MM, next) })
                }}
              />
            </label>
            <label>
              Map box width (%)
              <input
                className="text-input"
                type="number"
                min={MIN_MAP_BOX_WIDTH_PERCENT}
                max={100}
                step={5}
                value={layout.mapBoxWidthPercent}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (!Number.isFinite(next)) return
                  commit({
                    ...layout,
                    mapBoxWidthPercent: Math.min(100, Math.max(MIN_MAP_BOX_WIDTH_PERCENT, next))
                  })
                }}
              />
            </label>
            <label>
              Map view
              <button
                className="btn ghost"
                type="button"
                disabled={!layout.mapView}
                onClick={() => commit({ ...layout, mapView: null })}
              >
                <Maximize2 size={14} /> Reset to fit routes
              </button>
            </label>
            <label className="span-2">
              Map type
              <select
                className="select-input"
                value={layout.mapLayerType}
                onChange={(event) =>
                  commit({
                    ...layout,
                    mapLayerType: event.target.value as NormalizedLeadPrintSettings['mapLayerType']
                  })
                }
              >
                <option value="map">Map</option>
                <option value="satellite">Satellite</option>
                <option value="toposheet">Toposheet</option>
                <option value="toposheet_transparent">Transparent Toposheet</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <div className="lead-map-print-section-title">
            <Type size={15} /> Map heading
          </div>
          <PrintToggle
            label="Show map title and description"
            checked={layout.showMapHeader}
            onChange={(checked) => commit({ ...layout, showMapHeader: checked })}
          />
          <div className="lead-map-print-field-grid map-heading-fields">
            <label>
              Map title
              <input
                className="text-input"
                disabled={!layout.showMapHeader}
                value={layout.mapTitle}
                onChange={(event) => commit({ ...layout, mapTitle: event.target.value })}
              />
            </label>
            <label>
              Description
              <input
                className="text-input"
                disabled={!layout.showMapHeader}
                value={layout.mapSubtitle}
                onChange={(event) => commit({ ...layout, mapSubtitle: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section>
          <div className="lead-map-print-section-title">
            <Tags size={15} /> Map labels
          </div>
          <div className="lead-map-print-content-options labels">
            <PrintToggle
              label="Point labels"
              checked={layout.showMapPointLabels}
              onChange={(checked) => commit({ ...layout, showMapPointLabels: checked })}
            />
            <PrintToggle
              label="Route labels"
              checked={layout.showMapRouteLabels}
              onChange={(checked) => commit({ ...layout, showMapRouteLabels: checked })}
            />
          </div>
          <div className="lead-map-print-field-grid">
            <label>
              Point label text
              <select
                className="select-input"
                disabled={!layout.showMapPointLabels}
                value={layout.mapPointLabelMode}
                onChange={(event) =>
                  commit({
                    ...layout,
                    mapPointLabelMode: event.target.value as NormalizedLeadPrintSettings['mapPointLabelMode']
                  })
                }
              >
                <option value="code">Point code only</option>
                <option value="name">Point name only</option>
                <option value="code_name">Point code and name</option>
              </select>
            </label>
            <label>
              Label size
              <select
                className="select-input"
                value={layout.mapLabelSize}
                onChange={(event) =>
                  commit({
                    ...layout,
                    mapLabelSize: event.target.value as NormalizedLeadPrintSettings['mapLabelSize']
                  })
                }
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <div className="lead-map-print-section-title">
            <MapPinned size={15} /> Map elements
          </div>
          <div className="lead-map-print-content-options">
            <PrintToggle
              label="Base map and roads"
              checked={layout.showBaseMap}
              onChange={(checked) => commit({ ...layout, showBaseMap: checked })}
            />
            <PrintToggle
              label="Route direction arrows"
              checked={layout.showRouteArrows}
              onChange={(checked) => commit({ ...layout, showRouteArrows: checked })}
            />
            <PrintToggle
              label="Route colour legend"
              checked={layout.showMapLegend}
              onChange={(checked) => commit({ ...layout, showMapLegend: checked })}
            />
            <PrintToggle
              label="Metric map scale"
              checked={layout.showMapScale}
              onChange={(checked) => commit({ ...layout, showMapScale: checked })}
            />
          </div>
          <label className="lead-map-print-legend-position">
            Legend position
            <select
              className="select-input"
              disabled={!layout.showMapLegend}
              value={layout.mapLegendPosition}
              onChange={(event) =>
                commit({
                  ...layout,
                  mapLegendPosition: event.target.value as NormalizedLeadPrintSettings['mapLegendPosition']
                })
              }
            >
              <option value="top_left">Top left</option>
              <option value="top_right">Top right</option>
              <option value="bottom_left">Bottom left</option>
              <option value="bottom_right">Bottom right</option>
            </select>
          </label>
        </section>
      </div>
      <small className="lead-map-print-help">
        These settings affect only the printed route map and are saved with the project.
      </small>
    </div>
  )
}

function OrientationButtons({
  value,
  onChange
}: {
  value: Orientation
  onChange: (orientation: Orientation) => void
}): JSX.Element {
  return (
    <div className="lead-segmented">
      <button
        type="button"
        className={value === 'portrait' ? 'active' : ''}
        onClick={() => onChange('portrait')}
      >
        Portrait
      </button>
      <button
        type="button"
        className={value === 'landscape' ? 'active' : ''}
        onClick={() => onChange('landscape')}
      >
        Landscape
      </button>
    </div>
  )
}

function PrintToggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <label className="lead-map-print-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
