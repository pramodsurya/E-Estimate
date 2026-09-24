import { useState } from 'react'
import {
  Info,
  Plus,
  Trash2,
  Wrench,
  Sparkles
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
  defaultCanalStrataSlopeConfig,
  canalBedLevelAt,
  orderCanalPoints,
  canalGroundProfileBetweenToes,
  canalSectionAreas
} from '../../../../lib/canal'
import CanalSectionDiagram from '../../CanalSectionDiagram'

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 'any',
  unit
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  step?: string | number
  unit?: string
}): JSX.Element {
  return (
    <label className="canal-bank-field">
      <span>
        {label} {unit && <small>({unit})</small>}
      </span>
      <input
        type="number"
        min={min}
        step={step}
        value={value || ''}
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
  const mode = bermConfig.mode ?? 'programmatic'
  const manualBerms = bermConfig.manualBerms ?? []

  // TBL height above bed = FSD + Freeboard
  const tblHeight = Number((design.fullSupplyDepth + design.freeBoard).toFixed(2))

  // In Chapter 3 (Cut Design), only show sections that have excavation / cutting
  const cuttingSections = sections.filter((s) => {
    const bed = canalBedLevelAt(data, s.chainage) ?? design.bedLevelAtStart
    const points = orderCanalPoints(s.ground ?? [])
    const maxGround = points.length > 0
      ? Math.max(...points.map((p) => p.rl))
      : Math.max(s.leftToeRl ?? bed, s.rightToeRl ?? bed)
    const cut = maxGround - bed
    const areas = canalSectionAreas(data, s)
    return cut > 0.01 || areas.cutting > 0.001
  })

  const [selectedSectionId, setSelectedSectionId] = useState<string>('')

  const selectedSection = cuttingSections.find((s) => s.id === selectedSectionId) ?? cuttingSections[0] ?? null

  const bedRl = selectedSection
    ? (canalBedLevelAt(data, selectedSection.chainage) ?? design.bedLevelAtStart)
    : design.bedLevelAtStart

  // Dynamically ensure ground in preview covers the cut berm spread
  const previewSection = (() => {
    if (!selectedSection) return null
    const points = orderCanalPoints(selectedSection.ground ?? [])
    if (points.length < 2) return selectedSection
    const leftRl = selectedSection.leftToeRl ?? points[0].rl
    const rightRl = selectedSection.rightToeRl ?? points[points.length - 1].rl
    if (points.length === 2 || selectedSection.groundEntryMode) {
      const expandedGround = canalGroundProfileBetweenToes(data, selectedSection, leftRl, rightRl)
      return { ...selectedSection, ground: expandedGround }
    }
    return selectedSection
  })()

  const patchBermConfig = (patch: Partial<CanalCutBermConfig>): void => {
    onCommit({
      cutBermConfig: { ...bermConfig, ...patch }
    })
  }

  const patchStrataSlopes = (patch: Partial<CanalStrataSlopeConfig>): void => {
    onCommit({
      strataSlopes: { ...strataSlopes, ...patch }
    })
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
    patchBermConfig({
      manualBerms: [...manualBerms, newBerm]
    })
  }

  const patchManualBerm = (id: string, patch: Partial<CanalManualCutBerm>): void => {
    patchBermConfig({
      manualBerms: manualBerms.map((b) => (b.id === id ? { ...b, ...patch } : b))
    })
  }

  const removeManualBerm = (id: string): void => {
    patchBermConfig({
      manualBerms: manualBerms.filter((b) => b.id !== id)
    })
  }

  return (
    <section className="canal-chapter canal-cut-chapter">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Chapter 3</span>
          <h2>Cut Design &amp; Berms</h2>
          <p className="settings-note">
            Configure cut berms in deep excavation using either Programmatic Rules or Manual Benches with dynamic section discard.
          </p>
        </div>
      </header>

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
              checked={bermConfig.enabled}
              onChange={(e) => patchBermConfig({ enabled: e.target.checked })}
            />
            <span className="canal-checkbox-label">
              <strong>Enable Cut Berms in Deep Excavation</strong>
              <small>Place slope stability benches when canal excavation rises above bank level.</small>
            </span>
          </label>
        </div>

        {bermConfig.enabled && (
          <>
            {/* Mode Segmented Selector */}
            <div className="canal-cut-mode-tabs">
              <button
                type="button"
                className={`canal-cut-mode-tab ${mode === 'programmatic' ? 'active' : ''}`}
                onClick={() => patchBermConfig({ mode: 'programmatic' })}
              >
                <Sparkles size={15} />
                <div className="canal-cut-tab-text">
                  <strong>Programmatic Berm Rules</strong>
                  <small>Auto-spaced by interval with ground clearance threshold</small>
                </div>
              </button>
              <button
                type="button"
                className={`canal-cut-mode-tab ${mode === 'manual' ? 'active' : ''}`}
                onClick={() => patchBermConfig({ mode: 'manual' })}
              >
                <Wrench size={15} />
                <div className="canal-cut-tab-text">
                  <strong>Manual Cut Benches</strong>
                  <small>User-specified berm elevations &amp; subsequent slopes</small>
                </div>
              </button>
            </div>

            {/* OPTION A: Programmatic Rules Mode */}
            {mode === 'programmatic' && (
              <div className="canal-cut-programmatic-view">
                <div className="canal-cut-toggle-sub">
                  <label className="canal-checkbox-row">
                    <input
                      type="checkbox"
                      checked={bermConfig.firstBermAtTbl}
                      onChange={(e) => patchBermConfig({ firstBermAtTbl: e.target.checked })}
                    />
                    <span className="canal-checkbox-label">
                      <strong>First Berm at TBL (Top of Bank Level)</strong>
                      <small>
                        Place initial berm at TBL ({tblHeight.toFixed(2)} m above bed = FSD {design.fullSupplyDepth} m + Freeboard {design.freeBoard} m).
                      </small>
                    </span>
                  </label>
                </div>

                <div className="canal-cut-params-grid">
                  <NumberField
                    label="Berm Vertical Interval"
                    unit="m"
                    value={bermConfig.intervalM}
                    min={1}
                    step={0.5}
                    onChange={(v) => patchBermConfig({ intervalM: Math.max(1.0, v) })}
                  />
                  <NumberField
                    label="Minimum Clearance to Ground"
                    unit="m"
                    value={bermConfig.minTopClearanceM}
                    min={1}
                    step={0.5}
                    onChange={(v) => patchBermConfig({ minTopClearanceM: Math.max(1.0, v) })}
                  />
                  <NumberField
                    label="Berm Shelf Width"
                    unit="m"
                    value={bermConfig.width}
                    min={0.5}
                    step={0.25}
                    onChange={(v) => patchBermConfig({ width: Math.max(0.5, v) })}
                  />
                </div>

                <div className="canal-cut-rule-box">
                  <div className="canal-cut-rule-header">
                    <Info size={15} />
                    <strong>Departmental Clearance Rule Logic</strong>
                  </div>
                  <ul className="canal-cut-rule-list">
                    <li>
                      <strong>Core Water Prism:</strong> From bed (0.00 m) to TBL ({tblHeight.toFixed(2)} m), the canal uses the Chapter 1 design inner slope only.
                    </li>
                    <li>
                      <strong>First Berm Preference:</strong> Berm 1 is placed at TBL ({tblHeight.toFixed(2)} m) if the cut depth satisfies the minimum clearance threshold ({bermConfig.minTopClearanceM.toFixed(2)} m).
                    </li>
                    <li>
                      <strong>Interval Spacing:</strong> Subsequent berms are placed at vertical increments of <strong>+{bermConfig.intervalM.toFixed(2)} m</strong>.
                    </li>
                    <li>
                      <strong>Residual Clearance Gate:</strong> A candidate berm is <em>only placed</em> if at least <strong>{bermConfig.minTopClearanceM.toFixed(2)} m</strong> of vertical space exists between the last berm and natural ground level (GL). If less, it is omitted.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* OPTION B: Manual Cut Berms Mode */}
            {mode === 'manual' && (
              <div className="canal-cut-manual-view">
                <div className="canal-manual-base-slope-row">
                  <NumberField
                    label="Base Cut Slope above TBL (H : 1V)"
                    value={bermConfig.manualBaseSlope ?? 1.5}
                    min={0.1}
                    step={0.1}
                    onChange={(v) => patchBermConfig({ manualBaseSlope: Math.max(0.1, v) })}
                  />
                  <span className="canal-manual-note">
                    Applied to excavation climbing from TBL ({tblHeight.toFixed(2)} m) up to the first manual berm.
                  </span>
                </div>

                <div className="canal-manual-table-wrap">
                  <div className="canal-manual-table-head">
                    <strong>Manual Cut Berms Schedule</strong>
                    <button type="button" className="btn primary" onClick={addManualBerm}>
                      <Plus size={14} /> Add Cut Berm
                    </button>
                  </div>

                  {manualBerms.length === 0 ? (
                    <div className="canal-sim-empty">
                      <Info size={16} />
                      <span>No manual cut berms defined yet. Click &ldquo;Add Cut Berm&rdquo; above to create a bench.</span>
                    </div>
                  ) : (
                    <div className="canal-manual-berm-list">
                      {manualBerms
                        .slice()
                        .sort((a, b) => a.heightAboveBed - b.heightAboveBed)
                        .map((berm, idx) => {
                          const bermRl = Number((bedRl + berm.heightAboveBed).toFixed(2))

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
                                    min={0.1}
                                    step={0.05}
                                    value={berm.slope}
                                    onChange={(e) =>
                                      patchManualBerm(berm.id, {
                                        slope: Math.max(0.1, Number(e.target.value) || 1.0)
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <button
                                type="button"
                                className="canal-earthwork-remove"
                                title="Delete this berm"
                                onClick={() => removeManualBerm(berm.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                <div className="canal-cut-rule-box">
                  <div className="canal-cut-rule-header">
                    <Info size={15} />
                    <strong>Manual Berm &amp; Section Discard Rules</strong>
                  </div>
                  <ul className="canal-cut-rule-list">
                    <li>
                      <strong>Canal Prism Protected:</strong> From Canal Bed to TBL ({tblHeight.toFixed(2)} m), the inner section is governed strictly by Chapter 1 Design.
                    </li>
                    <li>
                      <strong>Dynamic Per-Section Discard Rule:</strong> If a section&apos;s natural ground cut height is less than or equal to a berm&apos;s height (e.g., berm is at 12.0 m, but ground surface is at 10.0 m), that berm is automatically <strong>DISCARDED</strong> for that section.
                    </li>
                    <li>
                      <strong>Subsequent Slope:</strong> The side slope specified for each placed berm governs the cut face climbing from that berm up to the next berm or natural ground.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* SECTION 2: Strata Cutting Slopes (Visible in Programmatic Mode) */}
      {bermConfig.enabled && mode === 'programmatic' && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title">
            Excavation Side Slopes by Geological Strata
            <small>
              Side slopes (H : 1V) applied to cut faces according to the geological strata configured in Chapter 4 (Sections).
            </small>
          </div>

          <div className="canal-strata-slopes-grid">
            <div className="canal-strata-slope-card">
              <div className="canal-strata-slope-header">
                <div className="stratum-color-dot" style={{ background: '#d97706' }} />
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
                    value={strataSlopes.allSoilsSlope}
                    onChange={(e) => patchStrataSlopes({ allSoilsSlope: Math.max(0.1, Number(e.target.value) || 1.5) })}
                  />
                </label>
                <span className="canal-slope-ratio-badge">{strataSlopes.allSoilsSlope} : 1</span>
              </div>
              <div className="canal-strata-slope-note">Standard soft excavation cut slope</div>
            </div>

            <div className="canal-strata-slope-card">
              <div className="canal-strata-slope-header">
                <div className="stratum-color-dot" style={{ background: '#b45309' }} />
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
                    value={strataSlopes.hdrSlope}
                    onChange={(e) => patchStrataSlopes({ hdrSlope: Math.max(0.1, Number(e.target.value) || 0.75) })}
                  />
                </label>
                <span className="canal-slope-ratio-badge">{strataSlopes.hdrSlope} : 1</span>
              </div>
              <div className="canal-strata-slope-note">Semi-stable rock cutting slope</div>
            </div>

            <div className="canal-strata-slope-card">
              <div className="canal-strata-slope-header">
                <div className="stratum-color-dot" style={{ background: '#64748b' }} />
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
                    value={strataSlopes.ffSlope}
                    onChange={(e) => patchStrataSlopes({ ffSlope: Math.max(0.1, Number(e.target.value) || 0.5) })}
                  />
                </label>
                <span className="canal-slope-ratio-badge">{strataSlopes.ffSlope} : 1</span>
              </div>
              <div className="canal-strata-slope-note">Fractured rock stable cut slope</div>
            </div>

            <div className="canal-strata-slope-card">
              <div className="canal-strata-slope-header">
                <div className="stratum-color-dot" style={{ background: '#334155' }} />
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
                    value={strataSlopes.hrSlope}
                    onChange={(e) => patchStrataSlopes({ hrSlope: Math.max(0.05, Number(e.target.value) || 0.25) })}
                  />
                </label>
                <span className="canal-slope-ratio-badge">{strataSlopes.hrSlope} : 1</span>
              </div>
              <div className="canal-strata-slope-note">Near-vertical blast rock cut</div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: Live Cross-Section Diagram Preview */}
      <section className="canal-earthwork-card">
        <div className="canal-preview-toolbar">
          <div className="canal-cross-panel-title">
            Cross-Section Diagram Preview
            <small>
              {previewSection
                ? `Showing Ch ${previewSection.chainage} m with ${mode === 'manual' ? 'manual cut benches' : 'programmatic cut berms'} and side slopes`
                : 'Cutting sections preview'}
            </small>
          </div>

          {cuttingSections.length > 1 && (
            <div className="canal-sim-section-picker">
              <label>
                <span>Select Cutting Section:</span>
                <select
                  value={selectedSection?.id ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {cuttingSections.map((s) => {
                    const originalIdx = sections.findIndex((item) => item.id === s.id)
                    const bed = canalBedLevelAt(data, s.chainage) ?? design.bedLevelAtStart
                    const groundRls = (s.ground ?? []).map((p) => p.rl)
                    const maxGround = groundRls.length > 0
                      ? Math.max(...groundRls)
                      : Math.max(s.leftToeRl ?? bed, s.rightToeRl ?? bed)
                    const cut = Math.max(0, maxGround - bed)
                    const areas = canalSectionAreas(data, s)
                    return (
                      <option key={s.id} value={s.id}>
                        #{originalIdx + 1} · Ch {s.chainage} m (Cut: {cut.toFixed(2)} m{areas.cutting > 0 ? ` · ${areas.cutting.toFixed(1)} m²` : ''})
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
          )}
        </div>

        {previewSection ? (
          <div className="canal-earthwork-section-view">
            <CanalSectionDiagram data={data} section={previewSection} />
          </div>
        ) : (
          <div className="canal-diagram-empty">
            No cutting sections found in this reach. All {sections.length} cross-sections are in embankment (filling).
            <small style={{ marginTop: '6px', display: 'block', opacity: 0.8 }}>
              Cut berms and side slopes apply to excavation reaches. Enter ground levels above canal bed in Chapter 4 (Cross-Sections) to preview cutting sections here.
            </small>
          </div>
        )}
      </section>
    </section>
  )
}
