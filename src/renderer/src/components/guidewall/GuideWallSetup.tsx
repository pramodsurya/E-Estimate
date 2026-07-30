import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eraser, Ruler, Undo2, X } from 'lucide-react'
import type { GuideWallData, ProjectNode } from '../../types/project'
import { formatChainage, materializeSections, polylineLengthM } from '../../lib/guideWall'
import AlignmentMap from './AlignmentMap'

interface Props {
  node: ProjectNode
  data: GuideWallData
  onDone: (data: GuideWallData) => void
  /** Present only when re-editing an already configured guide wall. */
  onCancel?: () => void
  /** Open directly on a step ("Edit sections" jumps to step 2). */
  initialStep?: 1 | 2
}

type Step = 1 | 2

/**
 * Pre-dashboard setup: 1) length (drawn on map or typed), 2) sections
 * (continuous interval or discontinuous marks). Which side(s) carry a wall is
 * edited any time on the dashboard. "Edit setup" returns here with everything
 * preserved.
 */
export default function GuideWallSetup({
  node,
  data,
  onDone,
  onCancel,
  initialStep
}: Props): JSX.Element {
  const [step, setStep] = useState<Step>(initialStep ?? 1)
  const [draft, setDraft] = useState<GuideWallData>(data)
  const [manualBreak, setManualBreak] = useState('')

  const drawnLength = useMemo(() => polylineLengthM(draft.alignment), [draft.alignment])
  const effectiveLength =
    draft.source === 'map' ? (draft.lengthM > 0 ? draft.lengthM : Math.round(drawnLength)) : draft.lengthM

  const patch = (partial: Partial<GuideWallData>): void => setDraft((d) => ({ ...d, ...partial }))

  const addBreak = (ch: number): void => {
    if (!Number.isFinite(ch) || ch <= 0 || ch >= effectiveLength) return
    setDraft((d) => ({
      ...d,
      breaks: [...new Set([...d.breaks, Math.round(ch * 10) / 10])].sort((a, b) => a - b)
    }))
  }

  const removeBreak = (ch: number): void =>
    setDraft((d) => ({ ...d, breaks: d.breaks.filter((b) => b !== ch) }))

  const canNext =
    step === 1
      ? effectiveLength > 0
      : draft.sectionMode === 'continuous'
        ? draft.intervalM > 0
        : true

  const goNext = (): void => {
    const length = effectiveLength
    if (step === 1) {
      setDraft((d) => ({ ...d, lengthM: length }))
      setStep(2)
      return
    }
    // Re-materialize the section list; dimensions of sections that still cover
    // the same chainage are carried over.
    const next: GuideWallData = {
      ...draft,
      lengthM: length,
      breaks: draft.breaks.filter((b) => b > 0 && b < length),
      configured: true
    }
    onDone({ ...next, sections: materializeSections(next, draft.sections) })
  }

  const stepTitle = step === 1 ? 'Alignment and length' : 'Sections'

  return (
    <div className="gw-setup">
      <div className="gw-setup-header">
        <div>
          <span className="component-section-label">
            <Ruler size={15} /> Guide wall setup — {node.name}
          </span>
          <h2>
            Step {step} of 2 · {stepTitle}
          </h2>
        </div>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            <X size={14} /> Cancel
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="gw-setup-body">
          <div className="gw-setup-fields">
            <div className="field">
              <label className="field-label">Length source</label>
              <label className="gw-radio">
                <input
                  type="radio"
                  checked={draft.source === 'map'}
                  onChange={() => patch({ source: 'map' })}
                />
                Draw the alignment on the map
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
                  Click the map to add points along the wall. Ch 0 is the first point you click —
                  the arrow on the line shows the chainage direction.
                </div>
                <div className="map-tools">
                  <button
                    className="btn ghost"
                    disabled={!draft.alignment.length}
                    onClick={() =>
                      patch({ alignment: draft.alignment.slice(0, -1), lengthM: 0 })
                    }
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
                  <label className="field-label">Design length (m) — overrides the drawn length</label>
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
          </div>
          {draft.source === 'map' && (
            <AlignmentMap
              points={draft.alignment}
              mode="draw"
              totalLengthM={effectiveLength}
              onAddPoint={(p) => setDraft((d) => ({ ...d, alignment: [...d.alignment, p] }))}
              fallbackCenter={node.location ?? null}
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="gw-setup-body">
          <div className="gw-setup-fields">
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
                Discontinuous — sections only at marked chainages
              </label>
            </div>

            {draft.sectionMode === 'continuous' ? (
              <div className="field">
                <label className="field-label">Interval (m)</label>
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  value={draft.intervalM || ''}
                  onChange={(e) => patch({ intervalM: Number(e.target.value) || 0 })}
                />
                <div className="settings-note">
                  {draft.intervalM > 0 && effectiveLength > 0
                    ? `${Math.ceil(effectiveLength / draft.intervalM)} sections over ${formatChainage(effectiveLength)} m.`
                    : 'Chainage runs 0 to the total length; a measurement row is generated per interval.'}
                </div>
              </div>
            ) : (
              <>
                <div className="settings-note">
                  {draft.source === 'map'
                    ? 'Click on the drawn line to place a section mark (or type a chainage below). Chainages run 0 → first mark → next mark → end.'
                    : 'Type each section chainage. Chainages run 0 → first mark → next mark → end.'}
                </div>
                <div className="field">
                  <label className="field-label">Add section at chainage (m)</label>
                  <div className="gw-inline-add">
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={effectiveLength}
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
                        Ch {formatChainage(ch)}
                        <button onClick={() => removeBreak(ch)} title="Remove">
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="latlng-display">No section marks yet — 0 to end is one section.</span>
                  )}
                </div>
              </>
            )}
          </div>
          {draft.source === 'map' && (
            <AlignmentMap
              points={draft.alignment}
              mode={draft.sectionMode === 'discontinuous' ? 'mark' : 'view'}
              totalLengthM={effectiveLength}
              onPlaceBreak={addBreak}
              ticks={draft.sectionMode === 'discontinuous' ? draft.breaks : []}
              fallbackCenter={node.location ?? null}
            />
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
