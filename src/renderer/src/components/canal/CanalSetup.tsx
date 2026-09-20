import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Droplets, Eraser, MapPin, Undo2, Waves, X } from 'lucide-react'
import type { CanalData, CanalFlowDirection, ProjectNode } from '../../types/project'
import {
  CANAL_FOLLOW_TOLERANCE_M,
  canalFlowLabel,
  findParentCanal,
  inheritedFlowDirection,
  lineFollowsReference,
  materializeCanalSections,
  migrateCanalData
} from '../../lib/canal'
import { polylineLengthM, formatChainage } from '../../lib/guideWall'
import { useStore } from '../../store/useStore'
import AlignmentMap from '../guidewall/AlignmentMap'
import AlignmentUploadButton from '../guidewall/AlignmentUploadButton'

interface Props {
  node: ProjectNode
  data: CanalData
  onDone: (data: CanalData) => void
  /** Present only when re-editing an already configured canal. */
  onCancel?: () => void
  /** Open directly on a step ("Edit sections" jumps to step 2). */
  initialStep?: 1 | 2
}

type Step = 1 | 2

const lengthFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/**
 * Pre-dashboard setup, deliberately the same two steps as the Bund:
 * 1) new canal or repair, 2) water-flow direction, offtake point and sections.
 * The length arrives from component creation; the setup only still asks for it
 * when the component carries none (sub-component fallback). Fallback length rules
 * depend on the component's place in the tree:
 *  - A top-level component may draw its alignment or type a length; either
 *    way a length is compulsory.
 *  - A sub-component whose line follows the parent canal alignment gets its
 *    length measured from that line (and inherits the parent's water-flow
 *    direction); otherwise the length is compulsory and the flow is asked.
 *  - The offtake point (parent canal chainage reference) is asked normally for
 *    a top-level component and is compulsory for a sub-component.
 */
export default function CanalSetup({
  node,
  data,
  onDone,
  onCancel,
  initialStep
}: Props): JSX.Element {
  const project = useStore((store) => store.project)
  const [step, setStep] = useState<Step>(initialStep ?? 1)
  const [draft, setDraft] = useState<CanalData>(data)
  const [manualBreak, setManualBreak] = useState('')
  const [mapAction, setMapAction] = useState<'draw' | 'mark'>('draw')
  // An auto-measured sub-component length is shown read-only until the user
  // asks to override it.
  const [lengthEdited, setLengthEdited] = useState(false)

  const isSub = node.kind === 'subcomponent'
  // Length (and usually the alignment) arrives from component creation, so
  // step 2 no longer asks for it — only flow, offtake and sections.
  const lengthPreset = data.lengthM > 0 || data.alignment.length >= 2

  const parentCanalNode = useMemo(
    () => (isSub && project ? findParentCanal(project.root, node.id) : null),
    [isSub, project, node.id]
  )
  const parentCanal = useMemo(
    () => (parentCanalNode?.canal ? migrateCanalData(parentCanalNode.canal) : null),
    [parentCanalNode]
  )

  const drawnLength = useMemo(() => polylineLengthM(draft.alignment), [draft.alignment])
  const alignmentDrawn = draft.alignment.length >= 2

  // A sub-component line only counts as usable when it clearly follows the
  // parent canal alignment; otherwise its length must be entered by hand.
  const follow = useMemo(() => {
    if (!isSub || !alignmentDrawn || !parentCanal || parentCanal.alignment.length < 2) return null
    return lineFollowsReference(draft.alignment, parentCanal.alignment, CANAL_FOLLOW_TOLERANCE_M)
  }, [isSub, alignmentDrawn, draft.alignment, parentCanal])

  const autoLength = isSub && follow?.follows === true && drawnLength > 0
  const lengthOverridden =
    draft.lengthM > 0 && Math.abs(draft.lengthM - Math.round(drawnLength)) > 0.5
  const showCalculatedLength = autoLength && !lengthOverridden && !lengthEdited

  const inheritedFlow = useMemo(() => {
    if (!autoLength || !parentCanal) return null
    return inheritedFlowDirection(draft.alignment, parentCanal.alignment, parentCanal.flowDirection)
  }, [autoLength, draft.alignment, parentCanal])

  const flowValue: CanalFlowDirection | null = inheritedFlow ?? draft.flowDirection

  // Offtake point: the parent-canal chainage the canal takes off from. When a
  // sub-component line follows the parent alignment the chainage is known from
  // the drawing; otherwise the reference is entered by hand.
  const suggestedOfftake = useMemo(() => {
    if (!isSub || !parentCanalNode || follow?.follows !== true || follow.fromCh == null) return null
    return `${parentCanalNode.name} · Ch ${formatChainage(follow.fromCh)}`
  }, [isSub, parentCanalNode, follow])

  const offtakeReference = draft.design.offtake.trim() || suggestedOfftake || ''

  const useDrawnLength = draft.source === 'map' && (!isSub || autoLength)
  const effectiveLength = useDrawnLength
    ? draft.lengthM > 0
      ? draft.lengthM
      : Math.round(drawnLength)
    : draft.lengthM

  const activeMapAction =
    draft.sectionMode === 'discontinuous' && draft.alignment.length >= 2 ? mapAction : 'draw'

  const patch = (partial: Partial<CanalData>): void => setDraft((d) => ({ ...d, ...partial }))

  const patchDesign = (partial: Partial<CanalData['design']>): void =>
    setDraft((d) => ({ ...d, design: { ...d.design, ...partial } }))

  const addBreak = (ch: number): void => {
    if (!Number.isFinite(ch) || ch <= 0 || ch >= effectiveLength) return
    setDraft((d) => ({
      ...d,
      breaks: [...new Set([...d.breaks, Math.round(ch * 100) / 100])].sort((a, b) => a - b)
    }))
  }

  const removeBreak = (ch: number): void =>
    setDraft((d) => ({ ...d, breaks: d.breaks.filter((b) => b !== ch) }))

  const lengthSatisfied = effectiveLength > 0
  const sectionsSatisfied =
    effectiveLength <= 0 || (draft.sectionMode === 'continuous' ? draft.intervalM > 0 : true)
  // Flow is only asked when an alignment is on the map and it could not be
  // inherited from the parent canal.
  const asksFlow = draft.source === 'map' && alignmentDrawn && inheritedFlow == null
  const flowSatisfied = !asksFlow || flowValue != null
  // A sub-component must state where it takes off; a top-level component is
  // asked normally and may leave it blank.
  const offtakeSatisfied = !isSub || offtakeReference !== ''
  const canNext =
    step === 1
      ? true
      : lengthSatisfied && sectionsSatisfied && flowSatisfied && offtakeSatisfied

  const goNext = (): void => {
    const length = effectiveLength
    if (step === 1) {
      setStep(2)
      return
    }
    const next: CanalData = {
      ...draft,
      design: { ...draft.design, offtake: offtakeReference },
      lengthM: length,
      flowDirection: flowValue,
      flowInherited: inheritedFlow != null,
      breaks: length > 0 ? draft.breaks.filter((b) => b > 0 && b < length) : [],
      configured: true
    }
    onDone({
      ...next,
      sections: length > 0 ? materializeCanalSections(next, draft.sections) : []
    })
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
            <Waves size={15} /> Canal setup — {node.name}
          </span>
          <h2>
            Step {step} of 2 · {step === 1 ? 'Canal type' : lengthPreset ? 'Flow, offtake and sections' : 'Length and sections'}
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
              <label className={`bund-choice${draft.mode === 'new' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.mode === 'new'}
                  onChange={() => patch({ mode: 'new' })}
                />
                <span>
                  <strong>New canal</strong>
                  <em className="bund-radio-hint">
                    Forming a new canal where there is none. Alignment, design
                    levels, earthwork and lining are worked out chapter by chapter.
                  </em>
                </span>
              </label>
              <label className="bund-choice" title="Repair chapters arrive later">
                <input type="radio" disabled checked={false} onChange={() => undefined} />
                <span>
                  <strong>Repair of an existing canal</strong>
                  <em className="bund-radio-hint">
                    Desilting, raising or relining a canal that is already there —
                    coming in a later step.
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
              <label className="field-label">Length</label>
              {lengthPreset && (
                <div className="latlng-display">
                  {`Length: ${lengthFmt.format(effectiveLength)} m — from component creation`}
                </div>
              )}
              {lengthPreset ? null : showCalculatedLength ? (
                <div className="canal-length-auto">
                  <span>
                    <strong>Length: {lengthFmt.format(effectiveLength)} m</strong> — Calculated from
                    drawing
                  </span>
                  {parentCanalNode && (
                    <small>
                      Follows {parentCanalNode.name}
                      {follow?.fromCh != null && follow?.toCh != null
                        ? ` · Ch ${Math.round(follow.fromCh)} to Ch ${Math.round(follow.toCh)}`
                        : ''}
                    </small>
                  )}
                  <small>
                    Length is filled in from the drawn line. Edit it only if a survey length differs.
                  </small>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setLengthEdited(true)}
                  >
                    Edit length manually
                  </button>
                </div>
              ) : (
                <>
                  <label className="gw-radio">
                    <input
                      type="radio"
                      checked={draft.source === 'map'}
                      onChange={() => patch({ source: 'map' })}
                    />
                    {isSub
                      ? 'Draw the sub-component alignment on the map'
                      : 'Draw the canal alignment on the map'}
                  </label>
                  <label className="gw-radio">
                    <input
                      type="radio"
                      checked={draft.source === 'manual'}
                      onChange={() => patch({ source: 'manual' })}
                    />
                    Enter length manually
                  </label>
                  {isSub && (
                    <div className="settings-note">
                      Length is required unless the line follows the parent canal alignment, in
                      which case it is measured automatically.
                    </div>
                  )}
                </>
              )}
            </div>

            {!lengthPreset && draft.source === 'map' && (
              <>
                <div className="settings-note">
                  Click the map to add points along the canal — or upload a line file instead.
                  Ch 0 is the first point; once the water-flow direction is set, the arrows show it.
                  <AlignmentUploadButton
                    onAlignment={(points) => patch({ alignment: points, lengthM: 0, source: 'map' })}
                  />
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
                {!showCalculatedLength &&
                  (isSub ? (
                    <>
                      {alignmentDrawn && follow && !follow.follows && (
                        <div className="project-load-warning">
                          This line is not close enough to{' '}
                          {parentCanalNode?.name ?? 'the parent canal'} alignment to measure the
                          length from it automatically. Enter the length below.
                        </div>
                      )}
                      <div className="field">
                        <label className="field-label">Length (m) — required</label>
                        <input
                          className="text-input"
                          type="number"
                          min={0}
                          value={draft.lengthM || ''}
                          onChange={(e) => patch({ lengthM: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </>
                  ) : (
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
                  ))}
              </>
            )}

            {!lengthPreset && draft.source === 'manual' && (
              <div className="field">
                <label className="field-label">
                  {isSub ? 'Length (m) — required' : 'Total length (m) — required'}
                </label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  autoFocus
                  value={draft.lengthM || ''}
                  onChange={(e) => patch({ lengthM: Number(e.target.value) || 0 })}
                />
                {isSub && (
                  <div className="settings-note">
                    Length is required because there is no mapped line to measure.
                  </div>
                )}
              </div>
            )}

            {draft.source === 'map' && alignmentDrawn && (
              <div className="field">
                <label className="field-label">
                  <Droplets size={14} /> Water flow direction
                </label>
                {inheritedFlow ? (
                  <div className="canal-flow-inherited">
                    Water flows from <strong>{canalFlowLabel(inheritedFlow)}</strong> — inherited
                    from {parentCanalNode?.name ?? 'the parent canal'}.
                  </div>
                ) : (
                  <>
                    <label className="gw-radio">
                      <input
                        type="radio"
                        checked={draft.flowDirection === 'start-to-end'}
                        onChange={() =>
                          patch({ flowDirection: 'start-to-end', flowInherited: false })
                        }
                      />
                      Water flows from Start → End
                    </label>
                    <label className="gw-radio">
                      <input
                        type="radio"
                        checked={draft.flowDirection === 'end-to-start'}
                        onChange={() =>
                          patch({ flowDirection: 'end-to-start', flowInherited: false })
                        }
                      />
                      Water flows from End → Start
                    </label>
                    <div className="settings-note">
                      {isSub && follow && !follow.follows
                        ? `This line is not close enough to ${parentCanalNode?.name ?? 'the parent canal'} alignment, so the parent flow direction cannot be inherited. Choose it here.`
                        : isSub && parentCanal && !parentCanal.flowDirection
                          ? 'The parent canal has no water-flow direction set, so choose one for this line.'
                          : draft.flowDirection
                            ? `Water flows from ${canalFlowLabel(draft.flowDirection)}. Start is the first drawn point (Ch 0); End is the last.`
                            : 'Choose the direction in which water moves. Start is the first drawn point (Ch 0); End is the last.'}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="field">
              <label className="field-label">
                <MapPin size={14} /> Offtake point
                {isSub && <span className="canal-required"> *</span>}
              </label>
              <input
                className="text-input"
                type="text"
                placeholder={suggestedOfftake ?? 'e.g. MC RD 12.400 — canal Ch 0 starts here'}
                value={draft.design.offtake}
                onChange={(e) => patchDesign({ offtake: e.target.value })}
              />
              {isSub ? (
                suggestedOfftake ? (
                  <div className="settings-note">
                    Suggested from the parent canal alignment:{' '}
                    <strong>{suggestedOfftake}</strong>. Edit if the take-off differs.
                  </div>
                ) : (
                  <div className="settings-note">
                    Required for a sub-component: name the parent canal and the chainage/RD it
                    takes off from.
                  </div>
                )
              ) : (
                <div className="settings-note">
                  Where the canal takes off — parent canal and chainage/RD. Leave blank if it does
                  not take off from another canal.
                </div>
              )}
            </div>

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
                <label className="field-label">Interval (m)</label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.intervalM || ''}
                  onChange={(e) => patch({ intervalM: Number(e.target.value) || 0 })}
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
                  <label className="field-label">Add a section at chainage (m)</label>
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
                        Ch {ch}
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
              {draft.sectionMode === 'discontinuous' && draft.alignment.length >= 2 && (
                <div className="map-tools">
                  <button
                    className={`btn${mapAction === 'draw' ? '' : ' ghost'}`}
                    aria-pressed={mapAction === 'draw'}
                    onClick={() => setMapAction('draw')}
                  >
                    Draw alignment
                  </button>
                  <button
                    className={`btn${mapAction === 'mark' ? '' : ' ghost'}`}
                    aria-pressed={mapAction === 'mark'}
                    onClick={() => setMapAction('mark')}
                  >
                    Place sections
                  </button>
                </div>
              )}
              {draft.sectionMode === 'discontinuous' && (
                <div className="settings-note">
                  {activeMapAction === 'mark'
                    ? 'Click the drawn line to place a section at that chainage.'
                    : 'Click the map to add points along the canal alignment.'}
                </div>
              )}
              <AlignmentMap
                points={draft.alignment}
                mode={activeMapAction}
                totalLengthM={effectiveLength}
                onAddPoint={(p) => setDraft((d) => ({ ...d, alignment: [...d.alignment, p] }))}
                onPlaceBreak={(ch) => addBreak(ch)}
                ticks={activeMapAction === 'mark' ? draft.breaks : []}
                fallbackCenter={node.location ?? null}
                flowDirection={alignmentDrawn ? flowValue : null}
              />
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
