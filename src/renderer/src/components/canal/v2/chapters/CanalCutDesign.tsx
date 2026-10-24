import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
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
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import type {
  CanalData,
  CanalDesign,
  CanalSection,
  CanalCutBermConfig,
  CanalStrataSlopeConfig,
  CanalManualCutBerm
} from '../../../../types/project'
import type {
  CanalCuttingCalculationResponse,
  CanalCuttingInput,
  CanalEmbankmentInput
} from '../../../../types/eestimateApi'
import {
  defaultCanalCutBermConfig,
  defaultCanalStrataSlopeConfig
} from '../../../../lib/canal'

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

  // Rust Engine Calculation & Export State
  const [calcResult, setCalcResult] = useState<CanalCuttingCalculationResponse | null>(null)
  const [isCalculating, setIsCalculating] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)

  // Selected Section for Cross-Section View
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')

  // Sync draft when design props update from outside and we are NOT editing
  useEffect(() => {
    if (!isEditing) {
      setDraftConfig(design.cutBermConfig ?? defaultCanalCutBermConfig())
      setDraftStrata(design.strataSlopes ?? defaultCanalStrataSlopeConfig())
    }
  }, [design.cutBermConfig, design.strataSlopes, isEditing])

  // Active configuration (draft when editing, committed when viewing)
  const activeConfig = isEditing ? draftConfig : bermConfig
  const activeStrata = isEditing ? draftStrata : strataSlopes
  const mode = activeConfig.mode ?? 'manual'
  const manualBerms = activeConfig.manualBerms ?? []
  const tblHeight = Number((design.fullSupplyDepth + design.freeBoard).toFixed(2))

  // Helper to build Rust payload
  const buildPayload = useCallback(
    (cfg: CanalCutBermConfig, str: CanalStrataSlopeConfig): CanalCuttingInput => {
      const bandSoil = data.excavationBands?.find((b) => b.label.toLowerCase().includes('soil'))
      const bandHdr = data.excavationBands?.find((b) => b.label.toLowerCase().includes('hdr') || b.label.toLowerCase().includes('disintegrated'))
      const bandFf = data.excavationBands?.find((b) => b.label.toLowerCase().includes('fissured') || b.label.toLowerCase().includes('f&f'))
      const bandHr = data.excavationBands?.find((b) => b.label.toLowerCase().includes('hard rock') || b.label.toLowerCase().includes('hr'))
      const hasBands = (bandSoil?.pct ?? 0) + (bandHdr?.pct ?? 0) + (bandFf?.pct ?? 0) + (bandHr?.pct ?? 0) > 0

      return {
        bedWidth: design.bedWidth,
        fullSupplyDepth: design.fullSupplyDepth,
        freeBoard: design.freeBoard,
        sideSlope: design.sideSlope,
        bedSlope: design.bedSlope,
        bedLevelAtStart: design.bedLevelAtStart,
        bermConfig: cfg,
        strataSlopes: str,
        sections: sections.map((s) => {
          const groundPoints = s.ground ?? []
          const gl = groundPoints.length > 0
            ? groundPoints.find((p) => Math.abs(p.offset) < 0.01)?.rl ?? Math.max(...groundPoints.map((p) => p.rl))
            : Math.max(s.leftToeRl ?? design.bedLevelAtStart, s.rightToeRl ?? design.bedLevelAtStart)

          let soilDepth: number | undefined
          let hdrDepth: number | undefined
          let ffDepth: number | undefined
          let hrDepth: number | undefined

          if (s.strata && s.strata.length > 0) {
            for (const layer of s.strata) {
              const nameLower = layer.name.toLowerCase()
              const cls = layer.ermClass ?? (nameLower.includes('soil') ? 'all-soils' : nameLower.includes('hdr') || nameLower.includes('disintegrated') ? 'hdr' : nameLower.includes('f&f') || nameLower.includes('fissured') ? 'ff' : 'hr')
              if (cls === 'all-soils') soilDepth = (soilDepth ?? 0) + layer.thickness
              else if (cls === 'hdr') hdrDepth = (hdrDepth ?? 0) + layer.thickness
              else if (cls === 'ff') ffDepth = (ffDepth ?? 0) + layer.thickness
              else if (cls === 'hr') hrDepth = (hrDepth ?? 0) + layer.thickness
            }
          }

          const hasExplicitDepths = soilDepth != null || hdrDepth != null || ffDepth != null || hrDepth != null

          return {
            id: s.id,
            chainage: s.chainage,
            groundLevel: gl,
            bedLevel: undefined,
            soilDepth,
            hdrDepth,
            ffDepth,
            hrDepth,
            soilPct: hasExplicitDepths ? undefined : (hasBands ? bandSoil?.pct : 35),
            hdrPct: hasExplicitDepths ? undefined : (hasBands ? bandHdr?.pct : 25),
            ffPct: hasExplicitDepths ? undefined : (hasBands ? bandFf?.pct : 25),
            hrPct: hasExplicitDepths ? undefined : (hasBands ? bandHr?.pct : 15),
          }
        })
      }
    },
    [design, sections, data.excavationBands]
  )

  // Execute Rust Calculation
  const runRustCalculation = useCallback(
    async (cfg: CanalCutBermConfig, str: CanalStrataSlopeConfig) => {
      if (!window.api?.canal?.calculateCutting) return
      setIsCalculating(true)
      setCalcError(null)
      try {
        const payload = buildPayload(cfg, str)
        const response = await window.api.canal.calculateCutting(payload)
        setCalcResult(response)
      } catch (err: unknown) {
        console.error('Rust Canal Engine calculation error:', err)
        setCalcError(String(err))
      } finally {
        setIsCalculating(false)
      }
    },
    [buildPayload]
  )

  // Run calculation on initial load
  useEffect(() => {
    void runRustCalculation(bermConfig, strataSlopes)
  }, [runRustCalculation, bermConfig, strataSlopes])

  // Filter cutting sections based on Rust result or ground level
  const cuttingSectionResults = useMemo(() => {
    if (!calcResult) return []
    return calcResult.sections.filter((s) => s.cutDepth > 0.01)
  }, [calcResult])

  const activeSectionResult = useMemo(() => {
    if (cuttingSectionResults.length === 0) return null
    return cuttingSectionResults.find((s) => s.sectionId === selectedSectionId) ?? cuttingSectionResults[0]
  }, [cuttingSectionResults, selectedSectionId])

  // Draft Mutators (Only modify local state, never freeze React!)
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

  // Handle Save & Recalculate
  const handleSaveAndCalculate = async (): Promise<void> => {
    setIsCalculating(true)
    try {
      await runRustCalculation(draftConfig, draftStrata)
      onCommit({
        cutBermConfig: draftConfig,
        strataSlopes: draftStrata
      })
      setIsEditing(false)
    } finally {
      setIsCalculating(false)
    }
  }

  // Handle Cancel Edit
  const handleCancelEdit = (): void => {
    setDraftConfig(bermConfig)
    setDraftStrata(strataSlopes)
    setIsEditing(false)
  }

  // Handle Excel Export with Native File Selector Dialog
  const handleExportExcel = async (): Promise<void> => {
    if (!window.api?.canal?.exportCuttingExcel) return
    setIsExporting(true)
    setExportNotice(null)
    try {
      const payload = buildPayload(activeConfig, activeStrata)
      const res = await window.api.canal.exportCuttingExcel(payload, true)
      if (res.ok && res.filePath) {
        if (typeof window.api.export?.workbook === 'function') {
          const fromCh = sections[0]?.chainage ?? 0
          const toCh = sections[sections.length - 1]?.chainage ?? fromCh
          const defaultFileName = `Canal Earthwork Cutting (Ch ${fromCh} to ${toCh}).xlsx`
          const saveRes = await window.api.export.workbook(
            '',
            defaultFileName,
            undefined,
            { sourcePath: res.filePath }
          )
          if (saveRes && !saveRes.canceled && saveRes.path) {
            setExportNotice(`Exported Canal Cutting Excel to: ${saveRes.path}`)
          }
        } else {
          setExportNotice(`Exported Excel to: ${res.filePath}`)
        }
      } else if (res.error) {
        setExportNotice(`Export Error: ${res.error}`)
      }
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
          <span className="canal-v2-section-kicker">Chapter 4 · Rust Canal Engine</span>
          <h2>Cut Design &amp; Berms</h2>
          <p className="settings-note">
            Calculated natively in Rust with dynamic bench discards, trapezoidal layers, continuous reaches, and pure vector SVG cross-sections.
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
                disabled={isCalculating}
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#059669', color: '#fff', fontWeight: 600 }}
                onClick={handleSaveAndCalculate}
                disabled={isCalculating}
              >
                {isCalculating ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                Save &amp; Calculate (Rust)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => void runRustCalculation(bermConfig, strataSlopes)}
                disabled={isCalculating}
                title="Recalculate with Rust Engine"
              >
                <RefreshCw size={14} className={isCalculating ? 'animate-spin' : ''} />
                Recalculate
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#3b82f6', color: '#60a5fa' }}
                onClick={handleExportExcel}
                disabled={isExporting || isCalculating}
                title="Export Canal Cutting spreadsheet with live formulas (select save location)"
              >
                <FileSpreadsheet size={15} />
                {isExporting ? 'Exporting...' : 'Export Cutting (.xlsx)'}
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => setIsEditing(true)}
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
              <strong>Draft Mode Active:</strong> You can edit berm elevations, slopes, and widths freely with zero application lag. Click <strong>&ldquo;Save &amp; Calculate (Rust)&rdquo;</strong> to run the native engine.
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

      {calcError && (
        <div style={{ padding: '8px 14px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, fontSize: '0.82rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} />
          <span>{calcError}</span>
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
                    <strong>Dynamic Section Discard Rule (Rust Engine)</strong>
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

      {/* SECTION 2: ABSTRACT OF CUTTING REACHES (FROM RUST) */}
      {calcResult && calcResult.reaches.length > 0 && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              Abstract of Cutting Reaches (Rust Native Engine)
              <small>
                Continuous reaches grouped by identical bench configurations with prismoidal excavation volumes.
              </small>
            </div>
            <div style={{ background: '#1e293b', padding: '6px 14px', borderRadius: 6, border: '1px solid #334155' }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Excavation: </span>
              <strong style={{ fontSize: '1.05rem', color: '#38bdf8' }}>{calcResult.totalCuttingVolumeM3.toLocaleString()} m³</strong>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="canal-bank-reach-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Reach Description</th>
                  <th>From Ch</th>
                  <th>To Ch</th>
                  <th>Length (m)</th>
                  <th>Active Berms</th>
                  <th>Volume (m³)</th>
                  <th>Soil (m³)</th>
                  <th>HDR (m³)</th>
                  <th>F&amp;F (m³)</th>
                  <th>HR (m³)</th>
                </tr>
              </thead>
              <tbody>
                {calcResult.reaches.map((r) => (
                  <tr key={r.reachIndex}>
                    <td style={{ textAlign: 'center' }}>{r.reachIndex}</td>
                    <td><strong>{r.reachName}</strong></td>
                    <td style={{ textAlign: 'right' }}>{r.fromChainage.toFixed(1)} m</td>
                    <td style={{ textAlign: 'right' }}>{r.toChainage.toFixed(1)} m</td>
                    <td style={{ textAlign: 'right' }}>{r.lengthM.toFixed(1)} m</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge" style={{ background: r.bermCount > 0 ? '#7c3aed' : '#334155', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem' }}>
                        {r.bermCount} Berm{r.bermCount === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>{r.totalVolumeM3.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{r.soilVolumeM3.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{r.hdrVolumeM3.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{r.ffVolumeM3.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{r.hrVolumeM3.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 3: LIVE CROSS-SECTION DIAGRAM GENERATED IN RUST */}
      <section className="canal-earthwork-card">
        <div className="canal-preview-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="canal-cross-panel-title">
            Cross-Section Diagram (Rust Vector SVG)
            <small>
              {activeSectionResult
                ? `Showing Ch ${activeSectionResult.chainage} m · ${activeSectionResult.cutDepth >= tblHeight - 0.05 ? 'Full Cutting' : 'Partial Cutting'} | Cut Depth: ${activeSectionResult.cutDepth.toFixed(2)} m | Area: ${activeSectionResult.totalCutArea.toFixed(2)} m²`
                : 'Cutting sections preview'}
            </small>
          </div>

          {cuttingSectionResults.length > 1 && (
            <div className="canal-sim-section-picker">
              <label>
                <span>Select Cutting Section:</span>
                <select
                  value={activeSectionResult?.sectionId ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {cuttingSectionResults.map((s, idx) => {
                    const isFullCut = s.cutDepth >= tblHeight - 0.05
                    return (
                      <option key={s.sectionId} value={s.sectionId}>
                        #{idx + 1} · Ch {s.chainage} m · {isFullCut ? 'Full Cut' : 'Partial Cut'} (Cut: {s.cutDepth.toFixed(2)} m · {s.totalCutArea.toFixed(1)} m² · {(s.activeBerms?.length ?? 0)} Berms)
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
          )}
        </div>

        {activeSectionResult ? (
          <div className="canal-earthwork-section-view">
            {/* Status of Active and Discarded Berms for this specific section */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
              {(activeSectionResult.activeBerms?.length ?? 0) > 0 ? (
                activeSectionResult.activeBerms.map((b) => (
                  <div key={b.index} style={{ padding: '6px 12px', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: 6, fontSize: '0.8rem', color: '#c084fc' }}>
                    <strong>Berm #{b.index}:</strong> RL {b.rl.toFixed(2)} m (Shelf: {b.shelfWidth} m, Slope: {b.slopeAfter}:1) — <span style={{ color: '#10b981', fontWeight: 600 }}>ACTIVE</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '6px 12px', background: 'rgba(51, 65, 85, 0.4)', borderRadius: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  No berms active (cut height {activeSectionResult.cutDepth.toFixed(2)} m is single cut).
                </div>
              )}

              {(activeSectionResult.discardedBerms ?? []).map((db) => (
                <div key={db.id} style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#f87171' }}>
                  Berm at {db.heightAboveBed.toFixed(2)} m above bed — <strong>DISCARDED</strong> (Cut depth {activeSectionResult.cutDepth.toFixed(2)} m &le; {db.heightAboveBed.toFixed(2)} m)
                </div>
              ))}
            </div>

            {/* RUST GENERATED VECTOR SVG DIAGRAM */}
            <div
              className="canal-rust-diagram-viewport"
              style={{ width: '100%', minHeight: 380, margin: '8px 0', borderRadius: 8, overflow: 'hidden' }}
              dangerouslySetInnerHTML={{ __html: activeSectionResult.diagramSvg }}
            />

            {/* DYNAMIC TRAPEZOID TIERS & STRATA SLICES BREAKDOWN TABLE */}
            {(activeSectionResult.tiers?.length ?? 0) > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={15} style={{ color: '#38bdf8' }} />
                    <span>Multi-Tier Trapezoid &amp; Strata Slices Breakdown</span>
                  </div>
                  {activeSectionResult.strataAreas && (
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: '#94a3b8', flexWrap: 'wrap' }}>
                      <span>Soil: <strong style={{ color: '#facc15' }}>{activeSectionResult.strataAreas.soilArea.toFixed(2)} m²</strong></span>
                      <span>HDR: <strong style={{ color: '#fb923c' }}>{activeSectionResult.strataAreas.hdrArea.toFixed(2)} m²</strong></span>
                      <span>F&amp;F: <strong style={{ color: '#c084fc' }}>{activeSectionResult.strataAreas.ffArea.toFixed(2)} m²</strong></span>
                      <span>HR: <strong style={{ color: '#f87171' }}>{activeSectionResult.strataAreas.hrArea.toFixed(2)} m²</strong></span>
                      <span>Total Area: <strong style={{ color: '#38bdf8' }}>{activeSectionResult.totalCutArea.toFixed(2)} m²</strong></span>
                    </div>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="canal-bank-reach-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Tier / Stratum</th>
                        <th>Bottom RL (m)</th>
                        <th>Top RL (m)</th>
                        <th>Depth (m)</th>
                        <th>Bottom Width (m)</th>
                        <th>Top Width (m)</th>
                        <th>Side Slope (H:1V)</th>
                        <th>Berm Shelf (L/R)</th>
                        <th>Area (m²)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeSectionResult.tiers ?? []).map((t) => (
                        <Fragment key={t.tierIndex}>
                          {/* Tier Summary Header Row */}
                          <tr style={{ background: 'rgba(56, 189, 248, 0.08)', borderTop: '2px solid rgba(56, 189, 248, 0.2)' }}>
                            <td colSpan={3} style={{ fontWeight: 700, color: '#38bdf8' }}>
                              Trapezoid #{t.tierIndex}: {t.tierName}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#38bdf8' }}>{t.totalDepth.toFixed(2)} m</td>
                            <td style={{ textAlign: 'right', color: '#94a3b8' }}>{t.startingBottomWidth.toFixed(2)} m</td>
                            <td style={{ textAlign: 'right', color: '#94a3b8' }}>{t.endingTopWidth.toFixed(2)} m</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                              {t.strataSlices && t.strataSlices.length > 0 ? `${t.strataSlices[0].slope}:1` : '-'}
                            </td>
                            <td style={{ textAlign: 'center', color: t.leftShelfWidth > 0 ? '#c084fc' : '#64748b' }}>
                              {t.leftShelfWidth > 0 || t.rightShelfWidth > 0
                                ? `L: ${t.leftShelfWidth.toFixed(1)}m | R: ${t.rightShelfWidth.toFixed(1)}m`
                                : '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{t.totalTierArea.toFixed(3)}</td>
                          </tr>

                          {/* Individual Strata Slices inside this Tier */}
                          {(t.strataSlices ?? []).map((s, sIdx) => {
                            const stratumColor =
                              s.stratumName === 'Hard Rock'
                                ? '#f87171'
                                : s.stratumName === 'F&F Rock'
                                  ? '#c084fc'
                                  : s.stratumName === 'HDR'
                                    ? '#fb923c'
                                    : '#facc15'
                            return (
                              <tr key={`${t.tierIndex}-${sIdx}`} style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                                <td style={{ paddingLeft: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: stratumColor, display: 'inline-block' }} />
                                  <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{s.stratumName}</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>{s.bottomRl.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{s.topRl.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.depth.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{s.bottomWidth.toFixed(2)}</td>
                                <td style={{ textAlign: 'right' }}>{s.topWidth.toFixed(2)}</td>
                                <td style={{ textAlign: 'center' }}>{s.slope.toFixed(2)} : 1</td>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>-</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: stratumColor }}>
                                  {s.area.toFixed(3)}
                                </td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="canal-diagram-empty">
            No cutting sections found in this reach. All sections are in embankment (filling).
            <small style={{ marginTop: '6px', display: 'block', opacity: 0.8 }}>
              Cut berms and side slopes apply to excavation reaches where ground level rises above canal bed level.
            </small>
          </div>
        )}
      </section>
    </section>
  )
}
