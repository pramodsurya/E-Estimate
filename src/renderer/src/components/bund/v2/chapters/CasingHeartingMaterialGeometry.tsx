import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Eye, Layers, Mountain, Pencil, ShieldCheck } from 'lucide-react'
import type {
  BundCasingSoilType,
  BundData,
  BundHeartingSoilType,
  BundSection
} from '../../../../types/project'
import {
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE,
  casingRows,
  formationRows,
  formatChainage,
  heartingRows,
  orderedSections,
  rowsTotal,
  sectionAreas,
  steepestSection,
  zonedRepairAreas,
  zonedSsrCodePair
} from '../../../../lib/bund'
import {
  CASING_SOIL_OPTIONS,
  HEARTING_SOIL_OPTIONS,
  recommendedZonedSlopes
} from '../../../../lib/bundSoilPresets'
import BundHeartingDiagram from '../../BundHeartingDiagram'
import BundAssemblyDiagram from '../../BundAssemblyDiagram'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'
import { fetchSsrItems, type MasterItem } from '../../../../lib/masterData'

const numberText = (value: number): string => (Number.isFinite(value) ? String(value) : '')

const qty2 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const qty3 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const zonedCombinedCodes = new Set([
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE
])
const withKnownZonedUnit = (item: MasterItem): MasterItem =>
  zonedCombinedCodes.has(item.code) && !item.unit ? { ...item, unit: 'CUM' } : item

function DraftDecimalField({
  label,
  value,
  unit,
  onCommit
}: {
  label: string
  value: number
  unit?: string
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
    <label className="bund-v2-field">
      <span>{label} {unit ? `(${unit})` : ''}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
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
  onCommit
}: {
  label: string
  value: number
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
    if (!Number.isFinite(h) || !Number.isFinite(v) || h <= 0 || v <= 0) {
      setHorizontal(numberText(value))
      setVertical('1')
      return
    }
    const ratio = h / v
    if (ratio !== value) onCommit(ratio)
  }

  return (
    <div className="bund-v2-field">
      <span>{label} (H : 1V)</span>
      <div className="bund-v2-slope-ratio">
        <input
          type="text"
          inputMode="decimal"
          value={horizontal}
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

export default function CasingHeartingMaterialGeometry({
  data,
  onCommitBund
}: {
  data: BundData
  onCommitBund: (update: (current: BundData) => BundData) => void
}): JSX.Element {
  const sections = useMemo(() => orderedSections(data), [data])
  const highest = useMemo(() => steepestSection(data) ?? sections[0] ?? null, [data, sections])
  const [selectedSectionId, setSelectedSectionId] = useState<string>(highest?.id ?? sections[0]?.id ?? '')
  const [viewMode, setViewMode] = useState<'full' | 'core'>('full')
  const [materialPicker, setMaterialPicker] = useState<'casing' | 'hearting' | null>(null)

  const previewSection: BundSection | null = useMemo(() => {
    return sections.find((s) => s.id === selectedSectionId) ?? highest ?? sections[0] ?? null
  }, [sections, selectedSectionId, highest])

  const selectedCasingSoil = useMemo(
    () => CASING_SOIL_OPTIONS.find((s) => s.id === data.casingSoilType),
    [data.casingSoilType]
  )
  const selectedHeartingSoil = useMemo(
    () => HEARTING_SOIL_OPTIONS.find((s) => s.id === data.heartingSoilType),
    [data.heartingSoilType]
  )

  const handleSelectCasingSoil = (soilId: BundCasingSoilType): void => {
    onCommitBund((current) => ({
      ...current,
      casingSoilType: soilId
    }))
  }

  const handleSelectHeartingSoil = (soilId: BundHeartingSoilType): void => {
    const recommendation = recommendedZonedSlopes(soilId, 'compact-core')
    onCommitBund((current) => ({
      ...current,
      heartingSoilType: soilId,
      zonedSlopeMode: 'automatic',
      design: {
        ...current.design,
        usSlope: recommendation.casing,
        dsSlope: recommendation.casing
      },
      heartingDesign: {
        ...current.heartingDesign,
        usSlope: recommendation.hearting,
        dsSlope: recommendation.hearting
      }
    }))
  }

  const handleSlopeModeChange = (mode: 'automatic' | 'manual'): void => {
    if (mode === 'automatic' && data.heartingSoilType) {
      const recommendation = recommendedZonedSlopes(data.heartingSoilType, 'compact-core')
      onCommitBund((current) => ({
        ...current,
        zonedSlopeMode: 'automatic',
        design: {
          ...current.design,
          usSlope: recommendation.casing,
          dsSlope: recommendation.casing
        },
        heartingDesign: {
          ...current.heartingDesign,
          usSlope: recommendation.hearting,
          dsSlope: recommendation.hearting
        }
      }))
    } else {
      onCommitBund((current) => ({
        ...current,
        zonedSlopeMode: 'manual'
      }))
    }
  }

  const handleCommitCasingSlopes = (patch: { usSlope?: number; dsSlope?: number }): void => {
    onCommitBund((current) => ({
      ...current,
      zonedSlopeMode: 'manual',
      design: {
        ...current.design,
        ...patch
      }
    }))
  }

  const handleCommitHeartingDesign = (patch: Partial<BundData['heartingDesign']>): void => {
    onCommitBund((current) => ({
      ...current,
      zonedSlopeMode:
        patch.usSlope !== undefined || patch.dsSlope !== undefined ? 'manual' : current.zonedSlopeMode,
      heartingDesign: {
        ...current.heartingDesign,
        ...patch
      }
    }))
  }

  const totalEarthwork = useMemo(() => rowsTotal(formationRows(data)), [data])
  const casingTotal = useMemo(() => rowsTotal(casingRows(data)), [data])
  const heartingTotal = useMemo(() => rowsTotal(heartingRows(data)), [data])
  const zonedCodes = useMemo(() => zonedSsrCodePair(data), [data])

  const setZonedSsrBasis = (
    zonedRepairKind: BundData['zonedRepairKind'],
    zonedSoilSource: BundData['zonedSoilSource']
  ): void => {
    const codes = zonedSsrCodePair({ mode: data.mode, zonedRepairKind, zonedSoilSource })
    onCommitBund((current) => ({
      ...current,
      zonedRepairKind,
      zonedSoilSource,
      zonedSsrVersion: 1,
      formationEnabled: true,
      compactionEnabled: true,
      billing: 'combined',
      earthworkOperationVersion: 2,
      formationMaterial: { code: codes.casing },
      heartingMaterial: { code: codes.hearting }
    }))
    void fetchSsrItems(codes.category).then((items) => {
      const casing = items.find((item) => item.code === codes.casing)
      const hearting = items.find((item) => item.code === codes.hearting)
      onCommitBund((current) => {
        if (current.formationMaterial.code !== codes.casing || current.heartingMaterial.code !== codes.hearting) return current
        return {
          ...current,
          formationMaterial: casing ? withKnownZonedUnit(casing) : current.formationMaterial,
          heartingMaterial: hearting ? withKnownZonedUnit(hearting) : current.heartingMaterial
        }
      })
    })
  }

  const curSectionMetrics = useMemo(() => {
    if (!previewSection) return null
    try {
      const zoned = zonedRepairAreas(data, previewSection)
      const secArea = sectionAreas(data, previewSection)
      const gl =
        previewSection.groundLevel ??
        previewSection.pre[0]?.rl ??
        data.design.topLevel
      const height = Math.max(0, data.design.topLevel - gl)
      return {
        height,
        formation: zoned.totalFormation || secArea.formation,
        hearting: zoned.hearting,
        casing: zoned.casing
      }
    } catch {
      return null
    }
  }, [data, previewSection])

  return (
    <div className="bund-v2-section">
      {/* Header */}
      <div className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Chapter 2</span>
          <h2>2. Casing & Hearting Materials & Slopes</h2>
          <p>
            Configure the central impervious clay hearting core and outer granular/murum casing shoulders as per IS:12169.
          </p>
        </div>
        <div className="bund-v2-section-metrics">
          <div className="bund-v2-metric-pill">
            <span>Total Embankment</span>
            <strong>{Math.round(totalEarthwork).toLocaleString('en-IN')} cu.m</strong>
          </div>
          <div className="bund-v2-metric-pill">
            <span>Hearting Top Width</span>
            <strong>{data.heartingDesign.topWidth} m</strong>
          </div>
          <div className="bund-v2-metric-pill">
            <span>Hearting Top RL</span>
            <strong>{data.heartingDesign.topLevel} m</strong>
          </div>
        </div>
      </div>

      <section className="gw-materials bund-earthwork-section">
        <div className="gw-materials-title">Casing and Hearting</div>
        <div className="bund-earthwork-operation-card">
          <div className="bund-earthwork-operation-head">
            <div>
              <div className="gw-panel-label">Complete zoned SSR items</div>
              <small>
                The embankment fill is split into casing and impervious hearting. Each
                selected SSR item includes its required formation and compaction operations.
              </small>
            </div>
            <div className="bund-earthwork-code-status">
              <b>Total embankment fill</b>
              <small>{qty3.format(totalEarthwork)} cu.m</small>
            </div>
          </div>

          <div className="bund-zoned-ssr-basis">
            <div>
              <div className="gw-panel-label">Zoned SSR basis</div>
              <small>
                Placement, watering and compaction are already included in both selected codes.
              </small>
            </div>

            {data.mode === 'restoration' ? (
              <>
                <div className="bund-earthwork-checks">
                  <label className={`bund-earthwork-check${data.zonedRepairKind === 'breached' ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name="zoned-v2-repair-kind"
                      checked={data.zonedRepairKind === 'breached'}
                      onChange={() => setZonedSsrBasis('breached', data.zonedSoilSource)}
                    />
                    <span>
                      <strong>Breached or damaged portion</strong>
                      <small>Use the PMW repair pair in 10–15 cm layers at 98% density.</small>
                    </span>
                  </label>
                  <label className={`bund-earthwork-check${data.zonedRepairKind === 'raising' ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name="zoned-v2-repair-kind"
                      checked={data.zonedRepairKind === 'raising'}
                      onChange={() => setZonedSsrBasis('raising', data.zonedSoilSource)}
                    />
                    <span>
                      <strong>Raising or strengthening</strong>
                      <small>Use the DAW zoned-embankment pair in 25–30 cm layers.</small>
                    </span>
                  </label>
                </div>
                {data.zonedRepairKind === 'breached' && (
                  <div className="bund-zoned-source">
                    <span className="field-label">Where will the soil come from?</span>
                    <label className="gw-radio">
                      <input
                        type="radio"
                        name="zoned-v2-soil-source"
                        checked={data.zonedSoilSource === 'borrow'}
                        onChange={() => setZonedSsrBasis('breached', 'borrow')}
                      />
                      Approved borrow area
                    </label>
                    <label className="gw-radio">
                      <input
                        type="radio"
                        name="zoned-v2-soil-source"
                        checked={data.zonedSoilSource === 'dump'}
                        onChange={() => setZonedSsrBasis('breached', 'dump')}
                      />
                      Approved dump area
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className="settings-note">
                New zoned bund · approved borrow soil · DAW earth/rockfill embankment items.
              </div>
            )}

            <div className="settings-note">
              Selected pair: casing <b>{zonedCodes.casing}</b> · impervious hearting{' '}
              <b>{zonedCodes.hearting}</b>. No separate compaction item will be generated.
            </div>
          </div>

          <div className="bund-zoned-material-grid">
            {([
              {
                key: 'casing' as const,
                title: 'Casing',
                description: 'Outer shell and all embankment fill outside the hearting zone.',
                quantity: casingTotal,
                material: data.formationMaterial
              },
              {
                key: 'hearting' as const,
                title: 'Hearting',
                description: data.mode === 'restoration'
                  ? 'Impervious zone whose side lines stop automatically at the surveyed Existing RL.'
                  : 'Impervious zone extending from its top to the new bund formation base.',
                quantity: heartingTotal,
                material: data.heartingMaterial
              }
            ]).map((zone) => (
              <div className="bund-zoned-material-card" key={zone.key}>
                <div>
                  <div className="gw-panel-label">{zone.title}</div>
                  <small>{zone.description}</small>
                </div>
                <b>{qty3.format(zone.quantity)} cu.m</b>
                <SsrCode code={zone.material.code} description={zone.material.description} className="gw-material-code" />
                <button className="btn ghost" onClick={() => setMaterialPicker(zone.key)}>
                  <Pencil size={13} /> Select {zone.title.toLowerCase()} code
                </button>
                {materialPicker === zone.key && (
                  <MaterialPicker
                    initialCategory={zone.material.code.startsWith('IRR-PMW') ? 'IRR-PMW' : 'IRR-DAW'}
                    initialSearch={zone.key === 'hearting' ? 'impervious hearting' : 'pervious casing'}
                    selectionHint={`${zone.title} material`}
                    onClose={() => setMaterialPicker(null)}
                    onPick={(item) => {
                      const material = withKnownZonedUnit(item)
                      onCommitBund((current) => zone.key === 'casing'
                        ? { ...current, formationMaterial: material }
                        : { ...current, heartingMaterial: material })
                      setMaterialPicker(null)
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Both Layouts Side-by-Side in a Balanced 2-Column Responsive Grid */}
      <div className="bund-v2-zoned-two-col">
        {/* Layout 1: Outer Casing Shoulders */}
        <div className="bund-v2-zoned-card">
          <div className="bund-v2-zoned-card-head">
            <h3>1. Outer Casing Shoulders (Pervious Fill)</h3>
            <span className="bund-v2-zoned-badge is-casing">Pervious Fill</span>
          </div>

          <p className="bund-v2-zoned-desc">
            Select the pervious or semi-pervious shoulder material (murum, gravelly sand) providing structural stability.
          </p>

          <label className="bund-v2-field">
            <span>Casing Soil Classification (IS:1498)</span>
            <select
              value={data.casingSoilType ?? ''}
              onChange={(e) => handleSelectCasingSoil(e.target.value as BundCasingSoilType)}
            >
              <option value="" disabled>
                Select casing soil...
              </option>
              {CASING_SOIL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {selectedCasingSoil && (
            <div className="bund-v2-soil-note">
              <span>{selectedCasingSoil.summary}</span>
            </div>
          )}

          <div className="bund-v2-zoned-grid-2" style={{ marginTop: '8px' }}>
            <SlopeRatioField
              label="U/S Casing Slope"
              value={data.design.usSlope}
              onCommit={(v) => handleCommitCasingSlopes({ usSlope: v })}
            />
            <SlopeRatioField
              label="D/S Casing Slope"
              value={data.design.dsSlope}
              onCommit={(v) => handleCommitCasingSlopes({ dsSlope: v })}
            />
          </div>
        </div>

        {/* Layout 2: Central Impervious Core (Hearting Zone) */}
        <div className="bund-v2-zoned-card">
          <div className="bund-v2-zoned-card-head">
            <h3>2. Central Impervious Core (Hearting Zone)</h3>
            <span className="bund-v2-zoned-badge is-hearting">Clay Barrier</span>
          </div>

          <p className="bund-v2-zoned-desc">
            Watertight clay barrier preventing seepage and phreatic line breakout through the dam body.
          </p>

          <label className="bund-v2-field">
            <span>Hearting Clay Soil Classification (IS:1498)</span>
            <select
              value={data.heartingSoilType ?? ''}
              onChange={(e) => handleSelectHeartingSoil(e.target.value as BundHeartingSoilType)}
            >
              <option value="" disabled>
                Select hearting soil...
              </option>
              {HEARTING_SOIL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {selectedHeartingSoil && (
            <div className="bund-v2-soil-note">
              <span>{selectedHeartingSoil.summary}</span>
            </div>
          )}

          <div className="bund-v2-slope-mode-toggle" style={{ margin: '6px 0' }}>
            <button
              type="button"
              className={`btn small${data.zonedSlopeMode === 'automatic' ? ' primary' : ' ghost'}`}
              onClick={() => handleSlopeModeChange('automatic')}
            >
              Recommended Slopes (IS:12169)
            </button>
            <button
              type="button"
              className={`btn small${data.zonedSlopeMode === 'manual' ? ' primary' : ' ghost'}`}
              onClick={() => handleSlopeModeChange('manual')}
            >
              Custom Slopes
            </button>
          </div>

          <div className="bund-v2-zoned-grid-2">
            <DraftDecimalField
              label="Hearting Top RL"
              value={data.heartingDesign.topLevel}
              unit="m"
              onCommit={(v) => handleCommitHeartingDesign({ topLevel: v })}
            />
            <DraftDecimalField
              label="Hearting Top Width"
              value={data.heartingDesign.topWidth}
              unit="m"
              onCommit={(v) => handleCommitHeartingDesign({ topWidth: v })}
            />
            <SlopeRatioField
              label="U/S Hearting Batter"
              value={data.heartingDesign.usSlope}
              onCommit={(v) => handleCommitHeartingDesign({ usSlope: v })}
            />
            <SlopeRatioField
              label="D/S Hearting Batter"
              value={data.heartingDesign.dsSlope}
              onCommit={(v) => handleCommitHeartingDesign({ dsSlope: v })}
            />
          </div>

          <div style={{ marginTop: '4px' }}>
            <DraftDecimalField
              label="Centre-Line Offset (0 = Centred)"
              value={data.heartingDesign.centerOffset}
              unit="m"
              onCommit={(v) => handleCommitHeartingDesign({ centerOffset: v })}
            />
          </div>
        </div>
      </div>

      {/* Below Both Layouts: Full Bund Section Diagram */}
      <div className="bund-v2-full-bund-section-panel">
        <div className="bund-v2-full-section-head">
          <div>
            <h3>Full zoned bund diagram</h3>
            <p>
              Proposed new-bund arrangement: casing shoulders, impervious hearting, and enabled works on the selected chainage. The same drawing is used in print.
            </p>
          </div>

          <div className="bund-v2-full-section-controls">
            <div className="btn-group">
              <button
                type="button"
                className={`btn small${viewMode === 'full' ? ' primary' : ' ghost'}`}
                onClick={() => setViewMode('full')}
                title="View the proposed new-bund arrangement (same diagram as print)"
              >
                <Mountain size={13} /> Full Bund Section
              </button>
              <button
                type="button"
                className={`btn small${viewMode === 'core' ? ' primary' : ' ghost'}`}
                onClick={() => setViewMode('core')}
                title="View zoomed-in impervious hearting core details and contacts"
              >
                <Eye size={13} /> Hearting Core Detail
              </button>
            </div>

            <label className="bund-v2-section-select">
              <span>Section:</span>
              <select
                value={previewSection?.id ?? ''}
                onChange={(e) => setSelectedSectionId(e.target.value)}
              >
                {sections.map((s, index) => (
                  <option key={s.id} value={s.id}>
                    Ch {formatChainage(s.chainage, data.chainageUnit)} ({index + 1})
                    {s.id === highest?.id ? ' ★ Deepest' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="bund-v2-full-section-canvas">
          {viewMode === 'full' ? (
            <BundAssemblyDiagram data={data} section={previewSection} />
          ) : (
            <BundHeartingDiagram data={data} section={previewSection} />
          )}
        </div>

        <div className="bund-v2-full-section-footer">
          <div className="bund-v2-full-section-legend">
            <div className="bund-v2-full-section-legend-item">
              <span className="bund-v2-full-section-legend-swatch" style={{ background: '#3b82f6' }} />
              <span>Impervious Hearting Core (Clay)</span>
            </div>
            <div className="bund-v2-full-section-legend-item">
              <span className="bund-v2-full-section-legend-swatch" style={{ background: '#94a3b8' }} />
              <span>Outer Casing Shoulder (Pervious Fill)</span>
            </div>
            {data.heartingTrench?.fillMaterial && (
              <div className="bund-v2-full-section-legend-item">
                <span className="bund-v2-full-section-legend-swatch" style={{ background: '#0284c7' }} />
                <span>Cut-Off Trench (CoT)</span>
              </div>
            )}
            <div className="bund-v2-full-section-legend-item">
              <span className="bund-v2-full-section-legend-swatch" style={{ background: '#64748b' }} />
              <span>Existing Ground Profile</span>
            </div>
          </div>

          {curSectionMetrics && (
            <div className="bund-v2-full-section-metrics">
              {curSectionMetrics.height > 0 && (
                <span className="bund-v2-full-section-metric-tag">
                  Height: <strong>{qty2.format(curSectionMetrics.height)} m</strong>
                </span>
              )}
              <span className="bund-v2-full-section-metric-tag">
                Total Formation: <strong>{qty2.format(curSectionMetrics.formation)} sq.m</strong>
              </span>
              <span className="bund-v2-full-section-metric-tag">
                Hearting Core: <strong>{qty2.format(curSectionMetrics.hearting)} sq.m</strong>
              </span>
              <span className="bund-v2-full-section-metric-tag">
                Casing Fill: <strong>{qty2.format(curSectionMetrics.casing)} sq.m</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
