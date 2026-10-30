import { useState, useMemo } from 'react'
import {
  Info,
  Plus,
  Trash2,
  Wrench,
  Sparkles,
  Edit3,
  Check,
  X,
  FileSpreadsheet,
  Layers,
  CheckCircle2
} from 'lucide-react'
import type {
  CanalData,
  CanalDesign,
  CanalSection,
  CanalCutBermConfig,
  CanalStrataSlopeConfig,
  CanalManualCutBerm
} from '../../../../types/project'
import {
  defaultCanalCutBermConfig,
  defaultCanalStrataSlopeConfig
} from '../../../../lib/canal'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import { CUTTING_MATERIALS, measureCanalCutting, measureCanalCuttingSection } from '../../../../lib/canalCutting'
import { buildCanalCuttingExcel } from '../../../../lib/canalCuttingExcel'

const n3 = (value: number): string => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function NumberField({
  label,
  value,
  onChange,
  disabled = false,
  min = 0,
  step = 'any',
  unit
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  step?: string | number
  unit?: string
}): JSX.Element {
  return (
    <label className={`canal-bank-field ${disabled ? 'opacity-70' : ''}`}>
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input
        type="number"
        min={min}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  )
}

export default function CanalCutDesign({
  data,
  sections,
  onCommit
}: {
  data: CanalData
  sections: CanalSection[]
  onCommit: (patch: Partial<CanalDesign>) => void
}): JSX.Element {
  const { design } = data
  const bermConfig: CanalCutBermConfig = design.cutBermConfig ?? defaultCanalCutBermConfig()
  const strataSlopes: CanalStrataSlopeConfig = design.strataSlopes ?? defaultCanalStrataSlopeConfig()

  // State: Edit Mode vs Saved View
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [draftConfig, setDraftConfig] = useState<CanalCutBermConfig>(bermConfig)
  const [draftStrata, setDraftStrata] = useState<CanalStrataSlopeConfig>(strataSlopes)

  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const calcResult = useMemo(() => measureCanalCutting(data), [data])

  // Active configuration (draft when editing, committed when viewing)
  const activeConfig = isEditing ? draftConfig : bermConfig
  const activeStrata = isEditing ? draftStrata : strataSlopes
  const mode = activeConfig.mode ?? 'manual'
  const manualBerms = activeConfig.manualBerms ?? []
  const tblHeight = Number((design.fullSupplyDepth + design.freeBoard).toFixed(2))

  const cuttingSections = useMemo(() => sections
    .filter((section) => section.designPopulated !== false && section.ground.length >= 2)
    .map((section) => measureCanalCuttingSection(data, section))
    .filter(({ areas }) => areas.cutting > 0.001), [data, sections])
  const selectedCuttingSection = cuttingSections.find(({ section }) => section.id === selectedSectionId)
    ?? cuttingSections[0] ?? null
  const selectedSection = selectedCuttingSection?.section ?? null

  // Keep edits local until the saved geometry is updated.
  const patchDraftBermConfig = (patch: Partial<CanalCutBermConfig>): void => {
    setDraftConfig((prev) => ({ ...prev, ...patch }))
  }

  const patchDraftStrata = (patch: Partial<CanalStrataSlopeConfig>): void => {
    setDraftStrata((prev) => ({ ...prev, ...patch }))
  }

  const addManualBerm = (): void => {
    const sorted = manualBerms.slice().sort((a, b) => a.heightAboveBed - b.heightAboveBed)
    const lastHeight = sorted.length > 0 ? sorted[sorted.length - 1].heightAboveBed : tblHeight
    const nextHeight = Number((lastHeight + 6.0).toFixed(2))
    const lastSlope = sorted.length > 0 ? sorted[sorted.length - 1].slope : 1.0
    const newBerm: CanalManualCutBerm = {
      id: `manual-cut-berm-${Date.now()}`,
      heightAboveBed: nextHeight,
      width: 2.0,
      slope: Math.max(0.25, Number((lastSlope - 0.25).toFixed(2)))
    }
    patchDraftBermConfig({
      manualBerms: [...manualBerms, newBerm]
    })
  }

  const patchManualBerm = (id: string, patch: Partial<CanalManualCutBerm>): void => {
    patchDraftBermConfig({
      manualBerms: manualBerms.map((b) => (b.id === id ? { ...b, ...patch } : b))
    })
  }

  const removeManualBerm = (id: string): void => {
    patchDraftBermConfig({
      manualBerms: manualBerms.filter((b) => b.id !== id)
    })
  }

  const handleSaveAndCalculate = (): void => {
    onCommit({ cutBermConfig: draftConfig, strataSlopes: draftStrata })
    setIsEditing(false)
  }

  // Handle Cancel Edit
  const handleCancelEdit = (): void => {
    setDraftConfig(bermConfig)
    setDraftStrata(strataSlopes)
    setIsEditing(false)
  }

  const handleExportExcel = async (): Promise<void> => {
    setIsExporting(true)
    setExportNotice(null)
    try {
      if (!window.api?.excel?.compile || !window.api?.export?.workbook) {
        throw new Error('Open the desktop app to export the cutting calculation.')
      }
      const result = await window.api.excel.compile(buildCanalCuttingExcel(calcResult))
      if (!result.ok || (!result.data && !result.filePath)) throw new Error(result.error || 'Could not create the cutting workbook.')
      const fromCh = calcResult.sections[0]?.section.chainage ?? 0
      const toCh = calcResult.sections.at(-1)?.section.chainage ?? fromCh
      const saved = await window.api.export.workbook(result.data ?? '',
        `Canal Earthwork Cutting (Ch ${fromCh} to ${toCh}).xlsx`, undefined,
        result.filePath ? { sourcePath: result.filePath } : undefined)
      if (saved && !saved.canceled && saved.path) setExportNotice(`Exported Canal Cutting Excel to: ${saved.path}`)
    } catch (err: unknown) {
      setExportNotice(`Export Error: ${String(err)}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="canal-chapter canal-cut-chapter">
      {/* HEADER WITH EDIT / SAVE / EXCEL ACTION BAR */}
      <header className="canal-v2-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span className="canal-v2-section-kicker">Chapter 4</span>
          <h2>Cut Design &amp; Berms</h2>
          <p className="settings-note">
            Configure cutting slopes and berms, and view the saved canal cross-section at each chainage.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isEditing ? (
            <>
              <button
                type="button"
                className="btn ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={handleCancelEdit}
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#059669', color: '#fff', fontWeight: 600 }}
                onClick={handleSaveAndCalculate}
              >
                <Check size={15} />
                Save &amp; Calculate
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#3b82f6', color: '#60a5fa' }}
                onClick={handleExportExcel}
                disabled={isExporting || calcResult.sections.length === 0}
                title="Export Canal Cutting spreadsheet with live formulas (select save location)"
              >
                <FileSpreadsheet size={15} />
                {isExporting ? 'Exporting...' : 'Export Cutting (.xlsx)'}
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setDraftConfig(bermConfig); setDraftStrata(strataSlopes); setIsEditing(true) }}
              >
                <Edit3 size={15} /> Edit Cut Parameters
              </button>
            </>
          )}
        </div>
      </header>

      {/* EDITING MODE NOTIFICATION BANNER */}
      {isEditing && (
        <div style={{ padding: '10px 16px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: '#93c5fd' }}>
            <Info size={18} />
            <span>
              <strong>Draft Mode Active:</strong> Edit berm elevations, slopes, and widths, then click <strong>&ldquo;Save &amp; Calculate&rdquo;</strong> to update the section diagram and quantities together.
            </span>
          </div>
        </div>
      )}

      {exportNotice && (
        <div style={{ padding: '8px 14px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 6, fontSize: '0.82rem', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={15} />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* SECTION 1: Cut Berm Configuration & Mode Selection */}
      <section className="canal-earthwork-card canal-cut-rules-card">
        <div className="canal-cross-panel-title">
          Cut Berm Placement Options
          <small>
            Choose between automated programmatic clearance rules or user-defined manual benches.
          </small>
        </div>

        <div className="canal-cut-toggle-banner">
          <label className="canal-checkbox-row">
            <input
              type="checkbox"
              checked={activeConfig.enabled}
              disabled={!isEditing}
              onChange={(e) => patchDraftBermConfig({ enabled: e.target.checked })}
            />
            <span className="canal-checkbox-label">
              <strong>Enable Cut Berms in Deep Excavation</strong>
              <small>Place slope stability benches when canal excavation rises above bank level (TBL = {tblHeight.toFixed(2)} m).</small>
            </span>
          </label>
        </div>

        {activeConfig.enabled && (
          <>
            {/* Mode Segmented Selector */}
            <div className="canal-cut-mode-tabs">
              <button
                type="button"
                className={`canal-cut-mode-tab ${mode === 'manual' ? 'active' : ''}`}
                disabled={!isEditing}
                onClick={() => patchDraftBermConfig({ mode: 'manual' })}
              >
                <Wrench size={15} />
                <div className="canal-cut-tab-text">
                  <strong>Manual Cut Benches</strong>
                  <small>User-specified berm elevations &amp; subsequent slopes</small>
                </div>
              </button>
              <button
                type="button"
                className={`canal-cut-mode-tab ${mode === 'programmatic' ? 'active' : ''}`}
                disabled={!isEditing}
                onClick={() => patchDraftBermConfig({ mode: 'programmatic' })}
              >
                <Sparkles size={15} />
                <div className="canal-cut-tab-text">
                  <strong>Programmatic Berm Rules</strong>
                  <small>Auto-spaced by interval with ground clearance threshold</small>
                </div>
              </button>
            </div>

            {/* MANUAL CUT BENCHES MODE */}
            {mode === 'manual' && (
              <div className="canal-cut-manual-view">
                <div className="canal-manual-base-slope-row">
                  <NumberField
                    label="Base Cut Slope above TBL (H : 1V)"
                    value={activeConfig.manualBaseSlope ?? 1.5}
                    disabled={!isEditing}
                    min={0.1}
                    step={0.1}
                    onChange={(v) => patchDraftBermConfig({ manualBaseSlope: Math.max(0.1, v) })}
                  />
                  <span className="canal-manual-note">
                    Applied to excavation climbing from TBL ({tblHeight.toFixed(2)} m) up to the first manual bench.
                  </span>
                </div>

                <div className="canal-manual-table-wrap">
                  <div className="canal-manual-table-head">
                    <strong>Manual Cut Berms Schedule</strong>
                    {isEditing && (
                      <button type="button" className="btn primary" onClick={addManualBerm}>
                        <Plus size={14} /> Add Cut Berm
                      </button>
                    )}
                  </div>

                  {manualBerms.length === 0 ? (
                    <div className="canal-sim-empty">
                      <Info size={16} />
                      <span>No manual cut berms defined yet. {isEditing ? 'Click "Add Cut Berm" above to create a bench.' : 'Click "Edit Cut Parameters" to add benches.'}</span>
                    </div>
                  ) : (
                    <div className="canal-manual-berm-list">
                      {manualBerms
                        .slice()
                        .sort((a, b) => a.heightAboveBed - b.heightAboveBed)
                        .map((berm, idx) => {
                          const bermRl = Number((design.bedLevelAtStart + berm.heightAboveBed).toFixed(2))

                          return (
                            <div key={berm.id} className="canal-manual-berm-row">
                              <div className="canal-manual-row-num">
                                <strong>#{idx + 1}</strong>
                              </div>

                              <div className="canal-manual-row-fields">
                                <label>
                                  <span>Height above Bed (m)</span>
                                  <input
                                    type="number"
                                    min={tblHeight + 0.1}
                                    step={0.5}
                                    disabled={!isEditing}
                                    value={berm.heightAboveBed}
                                    onChange={(e) =>
                                      patchManualBerm(berm.id, {
                                        heightAboveBed: Math.max(tblHeight + 0.1, Number(e.target.value) || 0)
                                      })
                                    }
                                  />
                                </label>

                                <div className="canal-manual-rl-display">
                                  <span>Elevation RL</span>
                                  <strong>{bermRl.toFixed(2)} m</strong>
                                </div>

                                <label>
                                  <span>Shelf Width (m)</span>
                                  <input
                                    type="number"
                                    min={0.5}
                                    step={0.25}
                                    disabled={!isEditing}
                                    value={berm.width}
                                    onChange={(e) =>
                                      patchManualBerm(berm.id, {
                                        width: Math.max(0.5, Number(e.target.value) || 2.0)
                                      })
                                    }
                                  />
                                </label>

                                <label>
                                  <span>Slope After Berm (H : 1V)</span>
                                  <input
                                    type="number"
                                    min={0.05}
                                    step={0.05}
                                    disabled={!isEditing}
                                    value={berm.slope}
                                    onChange={(e) =>
                                      patchManualBerm(berm.id, {
                                        slope: Math.max(0.05, Number(e.target.value) || 1.0)
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              {isEditing && (
                                <button
                                  type="button"
                                  className="canal-earthwork-remove"
                                  title="Delete this berm"
                                  onClick={() => removeManualBerm(berm.id)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                <div className="canal-cut-rule-box">
                  <div className="canal-cut-rule-header">
                    <Info size={15} />
                    <strong>Section Discard Rule</strong>
                  </div>
                  <ul className="canal-cut-rule-list">
                    <li>
                      <strong>Canal Prism Protected:</strong> From Canal Bed to TBL ({tblHeight.toFixed(2)} m), the inner section is governed strictly by Chapter 1 Design (Inner Slope {design.sideSlope}:1).
                    </li>
                    <li>
                      <strong>Dynamic Per-Section Discard Rule:</strong> If a cross-section&apos;s natural ground cut height is less than or equal to a berm&apos;s height (e.g., berm is at 12.0 m, but ground surface is at 10.0 m), that berm is automatically <strong>DISCARDED</strong> for that section.
                    </li>
                    <li>
                      <strong>Reaches Calculation:</strong> Contiguous sections with identical active berms are grouped into continuous <strong>Cutting Reaches</strong>.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* PROGRAMMATIC MODE */}
            {mode === 'programmatic' && (
              <div className="canal-cut-programmatic-view">
                <div className="canal-cut-toggle-sub">
                  <label className="canal-checkbox-row">
                    <input
                      type="checkbox"
                      checked={activeConfig.firstBermAtTbl}
                      disabled={!isEditing}
                      onChange={(e) => patchDraftBermConfig({ firstBermAtTbl: e.target.checked })}
                    />
                    <span className="canal-checkbox-label">
                      <strong>First Berm at TBL (Top of Bank Level)</strong>
                      <small>Place initial berm at TBL ({tblHeight.toFixed(2)} m above bed).</small>
                    </span>
                  </label>
                </div>

                <div className="canal-cut-params-grid">
                  <NumberField
                    label="Berm Vertical Interval"
                    unit="m"
                    value={activeConfig.intervalM}
                    disabled={!isEditing}
                    min={1}
                    step={0.5}
                    onChange={(v) => patchDraftBermConfig({ intervalM: Math.max(1.0, v) })}
                  />
                  <NumberField
                    label="Minimum Clearance to Ground"
                    unit="m"
                    value={activeConfig.minTopClearanceM}
                    disabled={!isEditing}
                    min={1}
                    step={0.5}
                    onChange={(v) => patchDraftBermConfig({ minTopClearanceM: Math.max(1.0, v) })}
                  />
                  <NumberField
                    label="Berm Shelf Width"
                    unit="m"
                    value={activeConfig.width}
                    disabled={!isEditing}
                    min={0.5}
                    step={0.25}
                    onChange={(v) => patchDraftBermConfig({ width: Math.max(0.5, v) })}
                  />
                </div>

                {/* Geotechnical Safe Slopes by Geological Strata */}
                <div className="canal-strata-slopes-container" style={{ marginTop: '18px' }}>
                  <div className="canal-manual-table-head" style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <strong>Excavation Side Slopes by Geological Strata (H : 1V)</strong>
                      <small style={{ fontWeight: 400, color: 'var(--text-dim, #94a3b8)' }}>
                        Geotechnical safe slopes applied to cutting faces in programmatic design
                      </small>
                    </div>
                  </div>

                  <div className="canal-strata-slopes-grid">
                    <div className="canal-strata-slope-card">
                      <div className="canal-strata-slope-header">
                        <div className="stratum-color-dot" style={{ background: '#d97706', width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                        <strong>All Soils &amp; SDR</strong>
                      </div>
                      <p className="canal-strata-slope-desc">Ordinary soil, clay, sand, soft disintegrated rock</p>
                      <div className="canal-strata-slope-input-row">
                        <label>
                          <span>Slope (H : 1V)</span>
                          <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            disabled={!isEditing}
                            value={activeStrata.allSoilsSlope}
                            onChange={(e) => patchDraftStrata({ allSoilsSlope: Math.max(0.1, Number(e.target.value) || 1.5) })}
                          />
                        </label>
                        <span className="canal-slope-ratio-badge">{activeStrata.allSoilsSlope} : 1</span>
                      </div>
                      <div className="canal-strata-slope-note" style={{ color: 'var(--text-dim)', fontSize: '10.5px' }}>Standard soft excavation cut slope</div>
                    </div>

                    <div className="canal-strata-slope-card">
                      <div className="canal-strata-slope-header">
                        <div className="stratum-color-dot" style={{ background: '#b45309', width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                        <strong>Hard Disintegrated Rock (HDR)</strong>
                      </div>
                      <p className="canal-strata-slope-desc">Medium hard rock, shale, weathered stone</p>
                      <div className="canal-strata-slope-input-row">
                        <label>
                          <span>Slope (H : 1V)</span>
                          <input
                            type="number"
                            min={0.1}
                            step={0.05}
                            disabled={!isEditing}
                            value={activeStrata.hdrSlope}
                            onChange={(e) => patchDraftStrata({ hdrSlope: Math.max(0.1, Number(e.target.value) || 0.75) })}
                          />
                        </label>
                        <span className="canal-slope-ratio-badge">{activeStrata.hdrSlope} : 1</span>
                      </div>
                      <div className="canal-strata-slope-note" style={{ color: 'var(--text-dim)', fontSize: '10.5px' }}>Semi-stable rock cutting slope</div>
                    </div>

                    <div className="canal-strata-slope-card">
                      <div className="canal-strata-slope-header">
                        <div className="stratum-color-dot" style={{ background: '#64748b', width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                        <strong>Fissured &amp; Fractured Rock (F&amp;F)</strong>
                      </div>
                      <p className="canal-strata-slope-desc">Jointed rock, fractured limestone/granite</p>
                      <div className="canal-strata-slope-input-row">
                        <label>
                          <span>Slope (H : 1V)</span>
                          <input
                            type="number"
                            min={0.1}
                            step={0.05}
                            disabled={!isEditing}
                            value={activeStrata.ffSlope}
                            onChange={(e) => patchDraftStrata({ ffSlope: Math.max(0.1, Number(e.target.value) || 0.5) })}
                          />
                        </label>
                        <span className="canal-slope-ratio-badge">{activeStrata.ffSlope} : 1</span>
                      </div>
                      <div className="canal-strata-slope-note" style={{ color: 'var(--text-dim)', fontSize: '10.5px' }}>Fractured rock stable cut slope</div>
                    </div>

                    <div className="canal-strata-slope-card">
                      <div className="canal-strata-slope-header">
                        <div className="stratum-color-dot" style={{ background: '#334155', width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                        <strong>Hard Rock (HR)</strong>
                      </div>
                      <p className="canal-strata-slope-desc">Solid unweathered basalt, granite, quartzite</p>
                      <div className="canal-strata-slope-input-row">
                        <label>
                          <span>Slope (H : 1V)</span>
                          <input
                            type="number"
                            min={0.05}
                            step={0.05}
                            disabled={!isEditing}
                            value={activeStrata.hrSlope}
                            onChange={(e) => patchDraftStrata({ hrSlope: Math.max(0.05, Number(e.target.value) || 0.25) })}
                          />
                        </label>
                        <span className="canal-slope-ratio-badge">{activeStrata.hrSlope} : 1</span>
                      </div>
                      <div className="canal-strata-slope-note" style={{ color: 'var(--text-dim)', fontSize: '10.5px' }}>Near-vertical blast rock cut</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {calcResult.reaches.length > 0 && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title">
            Cutting Volume Calculation
            <small>Measured from the section diagrams. Volume = (start cut area + end cut area) / 2 × interval length. Canal prism only; additional CNS/lining excavation is measured in Earthwork.</small>
            <strong>Total Excavation: {n3(calcResult.totalVolume)} m³</strong>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="canal-bank-reach-table" style={{ width: '100%' }}>
              <thead><tr><th>From Ch (m)</th><th>To Ch (m)</th><th>Length (m)</th><th>Start cut (m²)</th><th>End cut (m²)</th><th>Volume (m³)</th>{CUTTING_MATERIALS.map(name => <th key={name}>{name} (m³)</th>)}</tr></thead>
              <tbody>{calcResult.reaches.map((reach, i) => <tr key={i}>
                <td>{n3(reach.start.section.chainage)}</td><td>{n3(reach.end.section.chainage)}</td><td>{n3(reach.length)}</td>
                <td>{n3(reach.start.areas.cutting)}</td><td>{n3(reach.end.areas.cutting)}</td><td><strong>{n3(reach.volume)}</strong></td>
                {reach.materialVolumes.map((volume, j) => <td key={j}>{n3(volume)}</td>)}
              </tr>)}</tbody>
              <tfoot><tr><th colSpan={5}>Total</th><th>{n3(calcResult.totalVolume)}</th>{calcResult.materialVolumes.map((volume, i) => <th key={i}>{n3(volume)}</th>)}</tr></tfoot>
            </table>
          </div>
        </section>
      )}

      <section className="canal-earthwork-card">
        <div className="canal-preview-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="canal-cross-panel-title">
            Cross-Section Diagram Preview
            <small>{selectedCuttingSection
              ? `Showing Ch ${selectedCuttingSection.section.chainage} m · ${selectedCuttingSection.areas.filling > 0.001 ? 'Partial Cutting' : 'Full Cutting'} | Cut: ${selectedCuttingSection.areas.cutting.toFixed(2)} m² | Fill: ${selectedCuttingSection.areas.filling.toFixed(2)} m²`
              : 'Cutting sections preview'}</small>
          </div>
          {cuttingSections.length > 1 && <div className="canal-sim-section-picker"><label>
            <span>Select Cutting Section:</span>
            <select value={selectedSection?.id ?? ''} onChange={(e) => setSelectedSectionId(e.target.value)}>
              {cuttingSections.map(({ section, areas }) => <option key={section.id} value={section.id}>
                #{sections.findIndex(s => s.id === section.id) + 1} · Ch {section.chainage} m · {areas.filling > 0.001 ? 'Partial Cut' : 'Full Cut'} (Cut: {areas.cutting.toFixed(2)} m²)
              </option>)}
            </select>
          </label></div>}
        </div>
        {selectedCuttingSection && selectedSection ? <div className="canal-earthwork-section-view">
          <CanalSectionDiagram data={data} section={selectedSection} />
          {selectedCuttingSection.shelves.length > 0 && <p className="settings-note">
            Shelves in this section: {selectedCuttingSection.shelves.map(shelf => `${shelf.side} RL ${shelf.rl.toFixed(2)} m · ${shelf.width.toFixed(2)} m wide`).join('; ')}
          </p>}
          <div className="canal-cross-panel-title" style={{ marginTop: 14 }}>
            <span><Layers size={15} /> Section Calculation</span>
            <small>Each area is measured from the shaded excavation polygon, including the entered ground profile and the designed slopes and shelves.</small>
          </div>
          <table className="canal-bank-reach-table" style={{ width: '100%' }}>
            <thead><tr><th>Excavation zone</th><th>Bottom RL (m)</th><th>Top RL (m)</th><th>Area (m²)</th></tr></thead>
            <tbody>{selectedCuttingSection.geometry.cutPolygons.map((polygon, i) => <tr key={i}>
              <td>Cut zone {i + 1}</td><td>{n3(Math.min(...polygon.points.map(point => point.rl)))}</td>
              <td>{n3(Math.max(...polygon.points.map(point => point.rl)))}</td><td>{n3(polygon.area)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th colSpan={3}>Total cutting area</th><th>{n3(selectedCuttingSection.areas.cutting)}</th></tr></tfoot>
          </table>
          <div className="canal-cross-panel-title" style={{ marginTop: 14 }}>Excavation by Material
            <small>Areas are intersections of those same cut polygons with the entered geological layers.</small>
          </div>
          <table className="canal-bank-reach-table" style={{ width: '100%' }}>
            <thead><tr><th>Material</th><th>Top RL (m)</th><th>Bottom RL (m)</th><th>Area (m²)</th></tr></thead>
            <tbody>{selectedCuttingSection.strata.filter(band => band.area > 0).map(band => <tr key={band.id}>
              <td>{band.name}</td><td>{n3(band.topRl)}</td><td>{n3(band.bottomRl)}</td><td>{n3(band.area)}</td>
            </tr>)}
            {selectedCuttingSection.materialAreas[4] > 0 && <tr><td>Unclassified</td><td>—</td><td>—</td><td>{n3(selectedCuttingSection.materialAreas[4])}</td></tr>}
            </tbody>
          </table>
          {selectedCuttingSection.materialAreas[4] > 0 && <p className="settings-note">Enter the soil and rock levels in Soil &amp; Rock Strata to classify the uninvestigated excavation.</p>}
        </div> : <div className="canal-diagram-empty">
          No populated cutting sections are available in this reach.
          <small style={{ marginTop: 6, display: 'block', opacity: 0.8 }}>Populate the ground levels in Cross-Sections to preview cutting sections here.</small>
        </div>}
      </section>
    </section>
  )
}
