import { useEffect, useMemo, useRef, useState } from 'react'
import type { BundData, BundDesign, BundHomogeneousSoilType } from '../../../../types/project'
import SsrCode from '../../../templates/SsrCode'
import {
  BUND_DEFAULT_FORMATION_CODE,
  BUND_SPLIT_FORMATION_CODE,
  BUND_SPLIT_ROLLING_CODE,
  formationRows,
  rowsTotal
} from '../../../../lib/bund'
import {
  HOMOGENEOUS_SOIL_OPTIONS,
  homogeneousSoilSuitable,
  recommendedHomogeneousSlopes,
  soilPreset
} from '../../../../lib/bundSoilPresets'

const numberText = (value: number): string => Number.isFinite(value) ? String(value) : ''

function DraftDecimalField({
  label,
  value,
  onCommit
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(() => numberText(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(numberText(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(numberText(value))
      return
    }
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <label className="bund-v2-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => { focused.current = true }}
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

  const blurIfLeavingRatio = (nextTarget: EventTarget | null): void => {
    if (nextTarget instanceof Node && nextTarget.parentElement?.closest('.bund-v2-slope-ratio')) return
    focused.current = false
    commit()
  }

  return (
    <div className="bund-v2-field">
      <span>{label}</span>
      <div className="bund-v2-slope-ratio">
        <input
          aria-label={`${label}, horizontal`}
          type="text"
          inputMode="decimal"
          value={horizontal}
          onFocus={() => { focused.current = true }}
          onChange={(event) => setHorizontal(event.target.value)}
          onBlur={(event) => blurIfLeavingRatio(event.relatedTarget)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setHorizontal(numberText(value))
              setVertical('1')
              event.currentTarget.blur()
            }
          }}
        />
        <strong aria-hidden="true">:</strong>
        <input
          aria-label={`${label}, vertical`}
          type="text"
          inputMode="decimal"
          value={vertical}
          onFocus={() => { focused.current = true }}
          onChange={(event) => setVertical(event.target.value)}
          onBlur={(event) => blurIfLeavingRatio(event.relatedTarget)}
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

export default function EmbankmentMaterialGeometry({
  soilType,
  data,
  design,
  slopeMode,
  onSelectSoil,
  onCommitDesign,
  onReapplyRecommendation,
  onCommitBund
}: {
  soilType: BundHomogeneousSoilType | null | undefined
  data: BundData
  design: BundDesign
  slopeMode: 'automatic' | 'manual'
  onSelectSoil: (soil: BundHomogeneousSoilType) => void
  onCommitDesign: (patch: Partial<BundDesign>) => void
  onReapplyRecommendation: () => void
  onCommitBund: (update: (current: BundData) => BundData) => void
}): JSX.Element {
  const selected = soilPreset(soilType)
  const suitable = homogeneousSoilSuitable(soilType)
  const recommendation = soilType ? recommendedHomogeneousSlopes(soilType) : null
  const formationTotal = useMemo(() => rowsTotal(formationRows(data)), [data])
  const formationEnabled = data.formationEnabled ?? true
  const compactionEnabled = data.compactionEnabled ?? true
  const combinedEarthwork = formationEnabled && compactionEnabled
  const earthworkCode = combinedEarthwork
    ? BUND_DEFAULT_FORMATION_CODE
    : formationEnabled
      ? BUND_SPLIT_FORMATION_CODE
      : compactionEnabled
        ? BUND_SPLIT_ROLLING_CODE
        : null

  const setEarthworkOperations = (
    nextFormationEnabled: boolean,
    nextCompactionEnabled: boolean
  ): void => {
    const combined = nextFormationEnabled && nextCompactionEnabled
    const formationCode = combined ? BUND_DEFAULT_FORMATION_CODE : BUND_SPLIT_FORMATION_CODE
    onCommitBund((current) => ({
      ...current,
      formationEnabled: nextFormationEnabled,
      compactionEnabled: nextCompactionEnabled,
      earthworkOperationVersion: 2,
      billing: combined ? 'combined' : 'split',
      formationMaterial: current.formationMaterial.code === formationCode
        ? current.formationMaterial
        : { code: formationCode },
      rollingMaterial: current.rollingMaterial.code === BUND_SPLIT_ROLLING_CODE
        ? current.rollingMaterial
        : { code: BUND_SPLIT_ROLLING_CODE },
      heartingMaterial: current.heartingMaterial.code === formationCode
        ? current.heartingMaterial
        : { code: formationCode },
      heartingRollingMaterial: current.heartingRollingMaterial.code === BUND_SPLIT_ROLLING_CODE
        ? current.heartingRollingMaterial
        : { code: BUND_SPLIT_ROLLING_CODE }
    }))
  }

  return (
    <section className="bund-v2-section" aria-labelledby="bund-v2-material-geometry-title">
      <header className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Design section</span>
          <h2 id="bund-v2-material-geometry-title">2. Embankment Material &amp; Section Geometry</h2>
          <p>Select the homogeneous fill and define the crest and face slopes.</p>
        </div>
        <span className={`bund-v2-save-state${soilType ? '' : ' is-editing'}`}>
          {soilType ? 'Saved' : 'Soil required'}
        </span>
      </header>

      <div className="bund-v2-panel">
        <div className="bund-v2-material-selector">
          <div>
            <div className="bund-v2-panel-title">Homogeneous Embankment Material</div>
            <p>
              Select the single fill soil used throughout the bund. Preliminary properties are
              copied to Simulation and remain editable there.
            </p>
          </div>
          <label className="bund-v2-field">
            <span>Embankment soil type</span>
            <select
              value={soilType ?? ''}
              onChange={(event) => {
                if (event.target.value) {
                  onSelectSoil(event.target.value as BundHomogeneousSoilType)
                }
              }}
            >
              <option value="">Select soil type…</option>
              {HOMOGENEOUS_SOIL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.homogeneousSuitable === false ? ' — pervious, not suitable alone' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selected?.summary && <div className="bund-v2-soil-summary">{selected.summary}</div>}
        {soilType && !suitable && (
          <div className="bund-v2-validation is-error" role="alert">
            This soil is too pervious for a homogeneous water-retaining embankment. Select a
            suitable fine-bearing soil or use a zoned section with an impervious core.
          </div>
        )}

        <div className="bund-v2-geometry-grid">
          <DraftDecimalField
            label="Crest width (m)"
            value={design.topWidth}
            onCommit={(topWidth) => onCommitDesign({ topWidth })}
          />
          <SlopeRatioField
            label="Upstream slope, left"
            value={design.usSlope}
            onCommit={(usSlope) => onCommitDesign({ usSlope })}
          />
          <SlopeRatioField
            label="Downstream slope, right"
            value={design.dsSlope}
            onCommit={(dsSlope) => onCommitDesign({ dsSlope })}
          />
        </div>

        <div className="bund-v2-slope-source">
          <span>{slopeMode === 'automatic' ? 'Recommended slopes applied' : 'Manual slope values'}</span>
          {slopeMode === 'manual' && recommendation && (
            <button type="button" className="btn ghost" onClick={onReapplyRecommendation}>
              Reapply recommendation
            </button>
          )}
          <small>
            Preliminary geometry only—confirm with project-specific stability and seepage analysis.
          </small>
        </div>
      </div>

      <section className="bund-v2-earthwork" aria-labelledby="bund-v2-earthwork-title">
        <header className="bund-v2-earthwork-heading">
          <div>
            <span className="bund-v2-section-kicker">Homogeneous embankment</span>
            <h3 id="bund-v2-earthwork-title">Operations to be billed</h3>
            <p>
              Both operations use the same computed embankment volume. The selected combination
              determines the SSR code.
            </p>
          </div>
          <div className="bund-v2-earthwork-summary">
            <strong>{earthworkCode ? <SsrCode code={earthworkCode} /> : 'No SSR item'}</strong>
            <span>{formationTotal.toLocaleString('en-IN', { maximumFractionDigits: 3 })} cu.m</span>
          </div>
        </header>

        <div className="bund-v2-earthwork-options">
          <label className={`bund-v2-operation${formationEnabled ? ' is-selected' : ''}`}>
            <input
              type="checkbox"
              checked={formationEnabled}
              onChange={(event) => setEarthworkOperations(event.target.checked, compactionEnabled)}
            />
            <span>
              <strong>Formation</strong>
              <small>Approved soil: excavation from the borrow area, transport, spreading and sectioning.</small>
            </span>
          </label>
          <label className={`bund-v2-operation${compactionEnabled ? ' is-selected' : ''}`}>
            <input
              type="checkbox"
              checked={compactionEnabled}
              onChange={(event) => setEarthworkOperations(formationEnabled, event.target.checked)}
            />
            <span>
              <strong>Compaction</strong>
              <small>Watering and rolling to the specified density.</small>
            </span>
          </label>
        </div>

        <div className="bund-v2-earthwork-result" role="status">
          {combinedEarthwork ? (
            <>Both selected → <strong><SsrCode code={BUND_DEFAULT_FORMATION_CODE} /></strong>, one combined item for formation and compaction.</>
          ) : formationEnabled ? (
            <>Formation only → <strong><SsrCode code={BUND_SPLIT_FORMATION_CODE} /></strong>. Watering and rolling are not billed.</>
          ) : compactionEnabled ? (
            <>Compaction only → <strong><SsrCode code={BUND_SPLIT_ROLLING_CODE} /></strong>. Use when formation is paid elsewhere.</>
          ) : (
            <><strong>No formation or compaction item will be generated.</strong></>
          )}
        </div>
      </section>
    </section>
  )
}
