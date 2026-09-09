import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import type { BundData, BundHeartingTrench, BundSection, TemplateMaterialRef } from '../../../../types/project'
import {
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  deepestBundToe,
  formatChainage,
  heartingTrenchArea,
  heartingTrenchEnabled,
  heartingTrenchRows,
  heartingTrenchTopWidth,
  orderedSections,
  resolvedHeartingTrenchDepth,
  rowsTotal,
  standardHeartingTrenchDepth,
  steepestSection
} from '../../../../lib/bund'
import type { MasterItem } from '../../../../lib/masterData'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'
import BundHeartingDiagram from '../../BundHeartingDiagram'

const numberText = (value: number): string => (Number.isFinite(value) ? String(value) : '')

function DraftDecimalField({
  label,
  value,
  unit,
  disabled,
  onCommit
}: {
  label: string
  value: number
  unit?: string
  disabled?: boolean
  onCommit: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(() => numberText(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(numberText(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(numberText(value))
      return
    }
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <label className={`bund-v2-field${disabled ? ' is-disabled' : ''}`}>
      <span>
        {label} {unit ? `(${unit})` : ''}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(numberText(value))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function SlopeRatioField({
  label,
  value,
  disabled,
  onCommit
}: {
  label: string
  value: number
  disabled?: boolean
  onCommit: (value: number) => void
}): JSX.Element {
  const [horizontal, setHorizontal] = useState(() => numberText(value))
  const [vertical, setVertical] = useState('1')
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) {
      setHorizontal(numberText(value))
      setVertical('1')
    }
  }, [value])

  const commit = (): void => {
    const h = Number(horizontal)
    const v = Number(vertical)
    if (!Number.isFinite(h) || !Number.isFinite(v) || h < 0 || v <= 0) {
      setHorizontal(numberText(value))
      setVertical('1')
      return
    }
    const ratio = h / v
    if (ratio !== value) onCommit(ratio)
  }

  return (
    <div className={`bund-v2-field${disabled ? ' is-disabled' : ''}`}>
      <span>{label} (H : 1V)</span>
      <div className="bund-v2-slope-input">
        <input
          type="text"
          inputMode="decimal"
          value={horizontal}
          disabled={disabled}
          aria-label={`${label} horizontal run`}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(event) => setHorizontal(event.target.value)}
          onBlur={() => {
            focused.current = false
            commit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setHorizontal(numberText(value))
              setVertical('1')
              event.currentTarget.blur()
            }
          }}
        />
        <span>:</span>
        <input
          type="text"
          inputMode="decimal"
          value={vertical}
          disabled={disabled}
          aria-label={`${label} vertical drop`}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(event) => setVertical(event.target.value)}
          onBlur={() => {
            focused.current = false
            commit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setHorizontal(numberText(value))
              setVertical('1')
              event.currentTarget.blur()
            }
          }}
        />
      </div>
    </div>
  )
}

const materialFromItem = (item: MasterItem): TemplateMaterialRef => ({
  code: item.code,
  description: item.description,
  unit: item.dataVariant?.unit ?? item.unit,
  categoryKey: item.category,
  side: item.side,
  dataVariant: item.dataVariant
})

export default function CutOffTrenchChapter({
  data,
  onCommitBund
}: {
  data: BundData
  onCommitBund: (update: (current: BundData) => BundData) => void
}): JSX.Element {
  const sections = useMemo(() => orderedSections(data), [data])
  const highest = useMemo(() => steepestSection(data) ?? sections[0] ?? null, [data, sections])
  const [selectedSectionId, setSelectedSectionId] = useState<string>(highest?.id ?? sections[0]?.id ?? '')
  const [picker, setPicker] = useState<'fill' | 'excavation' | null>(null)

  const previewSection: BundSection | null = useMemo(() => {
    return sections.find((s) => s.id === selectedSectionId) ?? highest ?? sections[0] ?? null
  }, [sections, selectedSectionId, highest])

  const trench = data.heartingTrench
  const isEnabled = Boolean(trench?.fillMaterial)
  const resolvedDepth = useMemo(() => resolvedHeartingTrenchDepth(data), [data])
  const deepestToe = useMemo(() => deepestBundToe(data), [data])
  const autoDepth = useMemo(
    () =>
      standardHeartingTrenchDepth(
        data.design.ftl ?? data.design.mwl,
        deepestToe?.rl ?? null
      ),
    [data, deepestToe]
  )
  const area = useMemo(() => heartingTrenchArea(data), [data])
  const topWidth = useMemo(() => heartingTrenchTopWidth(data), [data])
  const rows = useMemo(() => heartingTrenchRows(data), [data])
  const totalVolume = useMemo(() => rowsTotal(rows), [rows])

  const toggleTrench = (): void => {
    onCommitBund((current) => ({
      ...current,
      heartingTrench: {
        ...current.heartingTrench,
        fillMaterial: isEnabled
          ? null
          : { code: BUND_HEARTING_TRENCH_FILL_CODE },
        excavationMaterial: isEnabled
          ? null
          : { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
      }
    }))
  }

  const patchTrench = (patch: Partial<BundHeartingTrench>): void => {
    onCommitBund((current) => ({
      ...current,
      heartingTrench: {
        ...current.heartingTrench,
        ...patch
      }
    }))
  }

  return (
    <div className="bund-v2-section">
      <div className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Section 5 · Foundation & Cut-Off</span>
          <h2>COT (Cut-off Trench)</h2>
          <p>
            An impervious trapezoidal key trench excavated beneath the hearting core into impermeable foundation strata and backfilled with compacted clay to block foundation under-seepage.
          </p>
        </div>
        <div className="bund-v2-section-metrics">
          <div className="bund-v2-metric-pill">
            <span>Status</span>
            <strong style={{ color: isEnabled ? 'var(--bund-v2-success)' : 'var(--text-dim)' }}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </strong>
          </div>
          <div className="bund-v2-metric-pill">
            <span>Effective Depth</span>
            <strong>{resolvedDepth.toFixed(2)} m</strong>
          </div>
          <div className="bund-v2-metric-pill">
            <span>Total Backfill Volume</span>
            <strong>{Math.round(totalVolume).toLocaleString('en-IN')} cu.m</strong>
          </div>
        </div>
      </div>

      <div className="bund-v2-grid-2">
        {/* Left Column: Trench Configuration & SSR Items */}
        <div className="bund-v2-form-stack">
          {/* Toggle Panel */}
          <div className="bund-v2-panel">
            <div className="bund-v2-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="bund-v2-panel-title">Cut-off Trench (Key Trench)</div>
                <p className="bund-v2-panel-desc" style={{ marginBottom: 0 }}>
                  Recommended on all pervious or alluvial foundations beneath a zoned earth dam.
                </p>
              </div>
              <button
                type="button"
                className={`btn${isEnabled ? ' primary' : ' ghost'}`}
                onClick={toggleTrench}
              >
                {isEnabled ? 'Trench Active' : 'Enable Trench'}
              </button>
            </div>
          </div>

          {isEnabled && (
            <>
              {/* Geometry Panel */}
              <div className="bund-v2-panel">
                <div className="bund-v2-panel-title">Trench Cross-Section Geometry</div>
                <p className="bund-v2-panel-desc">
                  Specify the invert bottom width, side batters, and depth below the stripped formation base.
                </p>

                <div className="bund-v2-slope-mode-toggle" role="group" aria-label="Trench depth mode">
                  <button
                    type="button"
                    className={`btn small${trench.depthMode === 'auto' ? ' primary' : ' ghost'}`}
                    onClick={() => patchTrench({ depthMode: 'auto' })}
                  >
                    Automatic Depth ({autoDepth.toFixed(2)} m from FTL)
                  </button>
                  <button
                    type="button"
                    className={`btn small${trench.depthMode === 'manual' ? ' primary' : ' ghost'}`}
                    onClick={() => patchTrench({ depthMode: 'manual' })}
                  >
                    Manual Depth
                  </button>
                </div>

                <div className="bund-v2-trench-geometry-grid">
                  <DraftDecimalField
                    label="Depth below formation"
                    value={resolvedDepth}
                    unit="m"
                    disabled={trench.depthMode === 'auto'}
                    onCommit={(v) => patchTrench({ depth: v, depthMode: 'manual' })}
                  />
                  <DraftDecimalField
                    label="Bottom width at invert"
                    value={trench.bottomWidth}
                    unit="m"
                    onCommit={(v) => patchTrench({ bottomWidth: v })}
                  />
                  <SlopeRatioField
                    label="U/S Side Batter"
                    value={trench.usSlope}
                    onCommit={(v) => patchTrench({ usSlope: v })}
                  />
                  <SlopeRatioField
                    label="D/S Side Batter"
                    value={trench.dsSlope}
                    onCommit={(v) => patchTrench({ dsSlope: v })}
                  />
                </div>

                <div className="bund-v2-formula bund-v2-trench-summary">
                  <span>
                    <small>Top width</small>
                    <strong>{topWidth.toFixed(2)} m</strong>
                  </span>
                  <span>
                    <small>Section area</small>
                    <strong>{area.toFixed(2)} sq.m</strong>
                  </span>
                </div>
              </div>

              {/* Material SSR Codes Panel */}
              <div className="bund-v2-panel">
                <div className="bund-v2-panel-title">Trench Excavation & Clay Backfill SSR Items</div>
                <p className="bund-v2-panel-desc">
                  Select the schedule of rates items for trench excavation in foundation and selected clay backfilling with compaction.
                </p>

                <div className="bund-v2-material-slot" style={{ marginBottom: '12px' }}>
                  <div className="bund-v2-material-info">
                    <span className="bund-v2-material-role">Clay Core Backfill:</span>
                    <strong>
                      <SsrCode
                        code={trench.fillMaterial?.code ?? BUND_HEARTING_TRENCH_FILL_CODE}
                        description={trench.fillMaterial?.description}
                      />
                    </strong>
                    <span className="bund-v2-material-desc">
                      {trench.fillMaterial?.description ?? 'Impervious clay backfill in cut-off trench'}
                    </span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => setPicker('fill')}>
                    <Pencil size={12} /> Change Code
                  </button>
                </div>

                <div className="bund-v2-material-slot">
                  <div className="bund-v2-material-info">
                    <span className="bund-v2-material-role">Foundation Excavation:</span>
                    <strong>
                      <SsrCode
                        code={trench.excavationMaterial?.code ?? BUND_DEFAULT_FOUNDATION_EXC_CODE}
                        description={trench.excavationMaterial?.description}
                      />
                    </strong>
                    <span className="bund-v2-material-desc">
                      {trench.excavationMaterial?.description ?? 'Excavation for foundation trench'}
                    </span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => setPicker('excavation')}>
                    <Pencil size={12} /> Change Code
                  </button>
                </div>

                {picker === 'fill' && (
                  <MaterialPicker
                    initialCategory="IRR-DAW"
                    initialSearch="hearting fill"
                    onClose={() => setPicker(null)}
                    onPick={(item: MasterItem) => {
                      patchTrench({ fillMaterial: materialFromItem(item) })
                      setPicker(null)
                    }}
                  />
                )}

                {picker === 'excavation' && (
                  <MaterialPicker
                    initialCategory="IRR-EW"
                    initialSearch="foundation excavation"
                    onClose={() => setPicker(null)}
                    onPick={(item: MasterItem) => {
                      patchTrench({ excavationMaterial: materialFromItem(item) })
                      setPicker(null)
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Visual Preview Diagram & Computation Table */}
        <div className="bund-v2-diagram-panel">
          <div className="bund-v2-diagram-head">
            <div className="bund-v2-panel-title">Cut-off Trench Cross-Section Preview</div>
            <label className="bund-v2-section-select">
              <span>Section:</span>
              <select
                value={previewSection?.id ?? ''}
                onChange={(e) => setSelectedSectionId(e.target.value)}
              >
                {sections.map((s, index) => (
                  <option key={s.id} value={s.id}>
                    Ch {s.chainage} m ({index + 1})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bund-v2-diagram-canvas">
            <BundHeartingDiagram data={data} section={previewSection} />
          </div>

          {isEnabled && (
            <div className="bund-v2-quantity-preview" style={{ marginTop: '14px' }}>
              <div className="bund-v2-panel-title">Chainage-wise Cut-off Trench Measurement</div>
              <div className="bund-v2-table-wrapper" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                <table className="bund-v2-table">
                  <thead>
                    <tr>
                      <th>Chainage</th>
                      <th>Area (sq.m)</th>
                      <th>Mean Area (sq.m)</th>
                      <th>Length (m)</th>
                      <th>Volume (cu.m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>Ch {r.fromCh} to {r.toCh}</td>
                        <td>{r.areaFrom.toFixed(2)}</td>
                        <td>{r.meanArea.toFixed(2)}</td>
                        <td>{r.lengthM.toFixed(2)}</td>
                        <td>
                          <strong>{r.qty.toFixed(2)}</strong>
                        </td>
                      </tr>
                    ))}
                    <tr className="bund-v2-table-total">
                      <td colSpan={4}>Total Trench Backfill Volume:</td>
                      <td>
                        <strong>{Math.round(totalVolume).toLocaleString('en-IN')} cu.m</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
