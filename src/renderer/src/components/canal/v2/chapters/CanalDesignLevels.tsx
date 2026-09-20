import type { CanalDesign } from '../../../../types/project'
import {
  canalSectionDepth,
  canalTopWidth,
  canalWettedPerimeter,
  liningThicknessForDischarge,
  recommendedCanalCrestWidth
} from '../../../../lib/canal'

const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

function NumField({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        className="text-input"
        type="number"
        min={0}
        step="any"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {hint && <div className="settings-note">{hint}</div>}
    </div>
  )
}

/**
 * Chapter 1 — Design Levels. The canal-level typical section every later
 * chapter builds on: bed width, full supply depth, freeboard, bed slope,
 * side slopes, with live derived geometry. Q heads the table; lining consumes it.
 * Per-reach designs arrive with the discontinuous-reach work.
 */
export default function CanalDesignLevels({
  design,
  onCommit
}: {
  design: CanalDesign
  onCommit: (patch: Partial<CanalDesign>) => void
}): JSX.Element {
  const depth = canalSectionDepth(design)
  const liningMm = Math.round(liningThicknessForDischarge(design.discharge) * 1000)
  const topWidth = canalTopWidth(design)
  const wettedPerimeter = canalWettedPerimeter(design)
  const updateDischarge = (discharge: number): void => {
    const previousRecommendation = recommendedCanalCrestWidth(design.discharge)
    const nextRecommendation = recommendedCanalCrestWidth(discharge)
    const followsRecommendation = (width: number): boolean => Math.abs(width - previousRecommendation) < 1e-9
    onCommit({
      discharge,
      ...(followsRecommendation(design.leftBankCrestWidth) ? { leftBankCrestWidth: nextRecommendation } : {}),
      ...(followsRecommendation(design.rightBankCrestWidth) ? { rightBankCrestWidth: nextRecommendation } : {})
    })
  }

  return (
    <div className="canal-chapter">
      <h2>Design levels</h2>
      <p className="settings-note">
        The typical section for this canal. Cross-sections, earthwork and lining
        all derive from these six numbers, headed by Q.
      </p>
      <div className="canal-design-grid">
        <NumField
          label="Bed level at start, Ch 0 (m)"
          hint="Reference RL for the longitudinal canal bed profile."
          value={design.bedLevelAtStart}
          onChange={(v) => onCommit({ bedLevelAtStart: v })}
        />
        <NumField
          label="Design discharge Q (cumecs)"
          hint={`IS 3873 lining: ${liningMm} mm for this discharge.`}
          value={design.discharge}
          onChange={updateDischarge}
        />
        <NumField label="Bed width B (m)" value={design.bedWidth} onChange={(v) => onCommit({ bedWidth: v })} />
        <NumField
          label="Full supply depth FSD (m)"
          value={design.fullSupplyDepth}
          onChange={(v) => onCommit({ fullSupplyDepth: v })}
        />
        <NumField
          label="Freeboard above FSL (m)"
          value={design.freeBoard}
          onChange={(v) => onCommit({ freeBoard: v })}
        />
        <NumField
          label="Bed slope (1 in N)"
          hint="Longitudinal fall, e.g. 2000 for 1 in 2000."
          value={design.bedSlope}
          onChange={(v) => onCommit({ bedSlope: v })}
        />
        <NumField
          label="Side slope (H : 1V)"
          hint="Horizontal metres per 1 m vertical, e.g. 1.5."
          value={design.sideSlope}
          onChange={(v) => onCommit({ sideSlope: v })}
        />
      </div>
      <div className="field">
        <label className="field-label">Offtake reference</label>
        <input
          className="text-input"
          type="text"
          placeholder="e.g. MC RD 12.400 — canal Ch 0 starts here"
          value={design.offtake}
          onChange={(e) => onCommit({ offtake: e.target.value })}
        />
      </div>
      {(design.bedWidth <= 0 || design.fullSupplyDepth <= 0 || design.sideSlope <= 0) && (
        <div className="project-load-warning">
          Bed width, full supply depth and side slope must all be above zero before
          earthwork and lining can be worked out.
        </div>
      )}
      <div className="canal-readouts">
        <div>
          <span>Section depth (D + FB)</span>
          <strong>{qtyFmt.format(depth)} m</strong>
        </div>
        <div>
          <span>Top width at bank level</span>
          <strong>{qtyFmt.format(topWidth)} m</strong>
        </div>
        <div>
          <span>Wetted perimeter at FSL</span>
          <strong>{qtyFmt.format(wettedPerimeter)} m</strong>
        </div>
        <div>
          <span>IS 3873 lining thickness</span>
          <strong>{liningMm} mm</strong>
        </div>
      </div>
    </div>
  )
}
