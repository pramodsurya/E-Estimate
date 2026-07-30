import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eraser, Mountain, Undo2, X } from 'lucide-react'
import type { BundData, ProjectNode } from '../../types/project'
import {
  BUND_DEFAULT_FORMATION_CODE,
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  BUND_SPLIT_ROLLING_CODE,
  chainageUnitLabel,
  fromDisplayChainage,
  materializeSections,
  toDisplayChainage,
  withStrippingExcavationFamily,
  zonedSsrCodePair
} from '../../lib/bund'
import { polylineLengthM } from '../../lib/guideWall'
import AlignmentMap from '../guidewall/AlignmentMap'

interface Props {
  node: ProjectNode
  data: BundData
  onDone: (data: BundData) => void
  /** Present only when re-editing an already configured bund. */
  onCancel?: () => void
  /** Open directly on a step ("Edit sections" jumps to step 2). */
  initialStep?: 1 | 2
}

type Step = 1 | 2

/**
 * Defaults a new bund starts from, applied when the wizard closes. Nothing is
 * standing yet, so the cut under the embankment is a foundation excavation, the
 * ground is normally levelled to one RL across the seating (so the single
 * average toe RL is the entry that fits), and there is no separate rock-toe cut
 * to pay for. A new zoned bund also carries the cut-off trench under its core:
 * an impervious zone built without one lets seepage pass straight beneath it.
 * Every one of them is still editable afterwards.
 */
const withNewBundDefaults = (data: BundData, previous: BundData): BundData => {
  const changedKind =
    !previous.configured ||
    previous.mode !== data.mode ||
    previous.embankmentType !== data.embankmentType
  // Only on the way in. Re-opening Edit setup on a bund that is already this
  // kind must not undo choices the user has since made on the dashboard.
  if (data.mode !== 'new' || !changedKind) return data
  const next: BundData = {
    ...data,
    ...withStrippingExcavationFamily(data, 'foundation'),
    sameToeLevels: true,
    rockToeExcavationMaterial: null
  }
  if (data.embankmentType !== 'zoned') return next
  return {
    ...next,
    heartingTrench: {
      ...next.heartingTrench,
      fillMaterial: { code: BUND_HEARTING_TRENCH_FILL_CODE },
      excavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
    }
  }
}

const withZonedSsrCodes = (data: BundData): BundData => {
  const codes = zonedSsrCodePair(data)
  return {
    ...data,
    formationEnabled: true,
    compactionEnabled: true,
    billing: 'combined',
    earthworkOperationVersion: 2,
    zonedSsrVersion: 1,
    formationMaterial: { code: codes.casing },
    heartingMaterial: { code: codes.hearting }
  }
}

/**
 * Pre-dashboard setup, deliberately the same two steps as the Guide Wall:
 * 1) what kind of bund and how long, 2) where the sections sit. Everything
 * about how quantities are billed is left to the dashboard, where the numbers
 * are visible while the choice is made.
 */
export default function BundSetup({
  node,
  data,
  onDone,
  onCancel,
  initialStep
}: Props): JSX.Element {
  const [step, setStep] = useState<Step>(initialStep ?? 1)
  const [draft, setDraft] = useState<BundData>(data)
  const [manualBreak, setManualBreak] = useState('')

  const drawnLength = useMemo(() => polylineLengthM(draft.alignment), [draft.alignment])
  const effectiveLength =
    draft.source === 'map'
      ? draft.lengthM > 0
        ? draft.lengthM
        : Math.round(drawnLength)
      : draft.lengthM

  const unit = draft.chainageUnit
  const unitLabel = chainageUnitLabel(unit)

  const patch = (partial: Partial<BundData>): void => setDraft((d) => ({ ...d, ...partial }))

  const addBreak = (chDisplay: number): void => {
    const ch = fromDisplayChainage(chDisplay, unit)
    if (!Number.isFinite(ch) || ch <= 0 || ch >= effectiveLength) return
    setDraft((d) => ({
      ...d,
      breaks: [...new Set([...d.breaks, Math.round(ch * 100) / 100])].sort((a, b) => a - b)
    }))
  }

  const removeBreak = (ch: number): void =>
    setDraft((d) => ({ ...d, breaks: d.breaks.filter((b) => b !== ch) }))

  const canNext =
    step === 1
      ? true
      : effectiveLength > 0 &&
        (draft.sectionMode === 'continuous' ? draft.intervalM > 0 : true)

  const goNext = (): void => {
    const length = effectiveLength
    if (step === 1) {
      setStep(2)
      return
    }
    const next: BundData = withNewBundDefaults(
      {
        ...draft,
        lengthM: length,
        breaks: draft.breaks.filter((b) => b > 0 && b < length),
        configured: true
      },
      data
    )
    onDone({ ...next, sections: materializeSections(next, draft.sections) })
  }

  const sectionCount =
    draft.sectionMode === 'continuous' && draft.intervalM > 0 && effectiveLength > 0
      ? Math.ceil(effectiveLength / draft.intervalM) + 1
      : draft.breaks.length + 2

  return (
    <div className="gw-setup">
      <div className="gw-setup-header">
        <div>
          <span className="component-section-label">
            <Mountain size={15} /> Small earthen bund setup — {node.name}
          </span>
          <h2>
            Step {step} of 2 · {step === 1 ? 'Bund type' : 'Length and sections'}
          </h2>
        </div>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            <X size={14} /> Cancel
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="gw-setup-body is-single">
          <div className="bund-setup-questions">
            <div className="field">
              <label className="field-label">What are you estimating?</label>
              <label className={`bund-choice${draft.mode === 'restoration' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.mode === 'restoration'}
                  onChange={() =>
                    setDraft((current) => {
                      const next = { ...current, mode: 'restoration' as const }
                      return next.embankmentType === 'zoned'
                        ? withZonedSsrCodes(next)
                        : next
                    })
                  }
                />
                <span>
                  <strong>Repair of an existing bund</strong>
                  <em className="bund-radio-hint">
                    Restoring, raising or strengthening a bund that is already there. You survey and
                    enter the existing ground; the proposed bund and the fill are worked out for you.
                  </em>
                </span>
              </label>
              <label className={`bund-choice${draft.mode === 'new' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.mode === 'new'}
                  onChange={() =>
                    setDraft((current) => {
                      const next = { ...current, mode: 'new' as const }
                      return next.embankmentType === 'zoned'
                        ? withZonedSsrCodes(next)
                        : next
                    })
                  }
                />
                <span>
                  <strong>New bund</strong>
                  <em className="bund-radio-hint">
                    Forming a new homogeneous or zoned bund where there is none.
                  </em>
                </span>
              </label>
            </div>

            <div className="field">
              <label className="field-label">What type of embankment?</label>
              <label className={`bund-choice${draft.embankmentType === 'homogeneous' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.embankmentType === 'homogeneous'}
                  onChange={() =>
                    patch({
                      embankmentType: 'homogeneous',
                      formationMaterial: { code: BUND_DEFAULT_FORMATION_CODE },
                      rollingMaterial: { code: BUND_SPLIT_ROLLING_CODE }
                    })
                  }
                />
                <span>
                  <strong>Homogeneous embankment</strong>
                  <em className="bund-radio-hint">
                    A single fill material across the whole section.
                  </em>
                </span>
              </label>
              <label className={`bund-choice${draft.embankmentType === 'zoned' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.embankmentType === 'zoned'}
                  onChange={() =>
                    setDraft((current) =>
                      withZonedSsrCodes({
                        ...current,
                        embankmentType: 'zoned',
                        heartingDesign: {
                          ...current.heartingDesign,
                          topLevel: current.design.topLevel
                        }
                      })
                    )
                  }
                />
                <span>
                  <strong>Zoned embankment (impervious zone)</strong>
                  <em className="bund-radio-hint">
                    Casing with a separate impervious hearting zone.
                  </em>
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={`gw-setup-body${draft.source === 'map' ? '' : ' is-single'}`}>
          <div className="gw-setup-fields">
            <div className="field">
              <label className="field-label">Length source</label>
              <label className="gw-radio">
                <input
                  type="radio"
                  checked={draft.source === 'map'}
                  onChange={() => patch({ source: 'map' })}
                />
                Draw the bund alignment on the map
              </label>
              <label className="gw-radio">
                <input
                  type="radio"
                  checked={draft.source === 'manual'}
                  onChange={() => patch({ source: 'manual' })}
                />
                Enter the length manually (no map)
              </label>
            </div>

            {draft.source === 'map' ? (
              <>
                <div className="settings-note">
                  Click the map to add points along the bund. Ch 0 is the first point you click —
                  the arrow on the line shows the chainage direction.
                </div>
                <div className="map-tools">
                  <button
                    className="btn ghost"
                    disabled={!draft.alignment.length}
                    onClick={() => patch({ alignment: draft.alignment.slice(0, -1), lengthM: 0 })}
                  >
                    <Undo2 size={14} /> Undo point
                  </button>
                  <button
                    className="btn ghost"
                    disabled={!draft.alignment.length}
                    onClick={() => patch({ alignment: [], lengthM: 0 })}
                  >
                    <Eraser size={14} /> Clear
                  </button>
                </div>
                <div className="latlng-display">
                  {draft.alignment.length >= 2
                    ? `Drawn length: ${Math.round(drawnLength).toLocaleString('en-IN')} m (${draft.alignment.length} points)`
                    : 'Click at least two points to form the alignment.'}
                </div>
                <div className="field">
                  <label className="field-label">
                    Design length (m) — overrides the drawn length
                  </label>
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    placeholder={drawnLength ? String(Math.round(drawnLength)) : '0'}
                    value={draft.lengthM || ''}
                    onChange={(e) => patch({ lengthM: Number(e.target.value) || 0 })}
                  />
                </div>
              </>
            ) : (
              <div className="field">
                <label className="field-label">Total length (m)</label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  autoFocus
                  value={draft.lengthM || ''}
                  onChange={(e) => patch({ lengthM: Number(e.target.value) || 0 })}
                />
              </div>
            )}

            <div className="settings-note">
              A cross-section is measured at every chainage below. Quantities between two chainages
              use the mean of their two areas — so more sections means a closer measurement.
            </div>

            <div className="field">
              <label className="field-label">Section spacing</label>
              <label className="gw-radio">
                <input
                  type="radio"
                  checked={draft.sectionMode === 'continuous'}
                  onChange={() => patch({ sectionMode: 'continuous' })}
                />
                Continuous — a section every fixed interval
              </label>
              <label className="gw-radio">
                <input
                  type="radio"
                  checked={draft.sectionMode === 'discontinuous'}
                  onChange={() => patch({ sectionMode: 'discontinuous' })}
                />
                Discontinuous — sections only where you have survey levels
              </label>
            </div>

            {draft.sectionMode === 'continuous' ? (
              <div className="field">
                <label className="field-label">Interval ({unitLabel})</label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.intervalM ? toDisplayChainage(draft.intervalM, unit) : ''}
                  onChange={(e) =>
                    patch({ intervalM: fromDisplayChainage(Number(e.target.value) || 0, unit) })
                  }
                />
                <div className="settings-note">
                  {draft.intervalM > 0 && effectiveLength > 0
                    ? `${sectionCount} cross-sections over ${Math.round(effectiveLength)} m.`
                    : 'Chainage runs 0 to the total length; a cross-section is placed at each interval.'}
                </div>
              </div>
            ) : (
              <>
                <div className="settings-note">
                  {draft.source === 'map'
                    ? 'Click on the drawn line to place a section (or type a chainage below). A section is always placed at 0 and at the far end.'
                    : 'Type each section chainage. A section is always placed at 0 and at the far end.'}
                </div>
                <div className="field">
                  <label className="field-label">Add a section at chainage ({unitLabel})</label>
                  <div className="gw-inline-add">
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      step="any"
                      value={manualBreak}
                      onChange={(e) => setManualBreak(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addBreak(Number(manualBreak))
                          setManualBreak('')
                        }
                      }}
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        addBreak(Number(manualBreak))
                        setManualBreak('')
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="gw-break-chips">
                  {draft.breaks.length ? (
                    draft.breaks.map((ch) => (
                      <span key={ch} className="gw-chip">
                        Ch {toDisplayChainage(ch, unit)}
                        <button onClick={() => removeBreak(ch)} title="Remove">
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="latlng-display">
                      No sections marked yet — one at 0 and one at the end.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          {draft.source === 'map' && (
            <div className="gw-setup-aside">
              <AlignmentMap
                points={draft.alignment}
                mode="draw"
                totalLengthM={effectiveLength}
                onAddPoint={(p) => setDraft((d) => ({ ...d, alignment: [...d.alignment, p] }))}
                fallbackCenter={node.location ?? null}
              />
              {draft.sectionMode === 'discontinuous' && (
                <>
                  <div className="settings-note">
                    Click the drawn line to place a section at that chainage.
                  </div>
                  <AlignmentMap
                    points={draft.alignment}
                    mode="mark"
                    totalLengthM={effectiveLength}
                    onPlaceBreak={(ch) => addBreak(toDisplayChainage(ch, unit))}
                    ticks={draft.breaks}
                    fallbackCenter={node.location ?? null}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="gw-setup-footer">
        <button className="btn ghost" disabled={step === 1} onClick={() => setStep(1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn" disabled={!canNext} onClick={goNext}>
          {step === 2 ? (
            <>
              <Check size={14} /> Finish setup
            </>
          ) : (
            <>
              Next <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
