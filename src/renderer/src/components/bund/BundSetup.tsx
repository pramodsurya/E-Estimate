import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eraser, Mountain, Undo2, X } from 'lucide-react'
import type { BundData, ProjectNode, TemplateMaterialRef } from '../../types/project'
import {
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_DEFAULT_FREEBOARD,
  BUND_DEFAULT_HFILTER_CODE,
  BUND_DEFAULT_VFILTER_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  chainageUnitLabel,
  defaultBundData,
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

const sameDefault = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

// Master-data resolution enriches a template default with description, unit,
// category and source. Those fields do not turn the default into a user
// override: template switching should compare the selected DATA code/variant.
const sameMaterialDefault = (
  left: TemplateMaterialRef | null,
  right: TemplateMaterialRef | null
): boolean => {
  if (!left || !right) return left === right
  return (
    left.code === right.code &&
    sameDefault(left.dataVariant ?? null, right.dataVariant ?? null)
  )
}

/**
 * Apply a newly selected bund template like spreadsheet defaults: a value that
 * still matches the previous template follows the new template, while a value
 * the user changed is retained as an override.
 */
const withSelectedTemplateDefaults = (data: BundData, previous: BundData): BundData => {
  const changedKind =
    !previous.configured ||
    previous.mode !== data.mode ||
    previous.embankmentType !== data.embankmentType
  if (!changedKind) return data

  const defaultsFor = (
    source: BundData,
    mode: BundData['mode'],
    embankmentType: BundData['embankmentType']
  ): BundData => {
    const base = defaultBundData()
    let defaults: BundData = {
      ...base,
      mode,
      embankmentType,
      zonedRepairKind: source.zonedRepairKind,
      zonedSoilSource: source.zonedSoilSource,
      design: {
        ...base.design,
        ...source.design,
        freeBoard: mode === 'new' ? BUND_DEFAULT_FREEBOARD : null
      },
      heartingDesign: {
        ...base.heartingDesign,
        topLevel: source.design.mwl ?? source.design.topLevel
      }
    }
    defaults =
      mode === 'new'
        ? {
            ...defaults,
            ...withStrippingExcavationFamily(defaults, 'foundation'),
            sameToeLevels: true,
            rockToeExcavationMaterial: null,
            horizontalFilterMaterial: { code: BUND_DEFAULT_HFILTER_CODE },
            horizontalFilterThickness: 0.4,
            verticalFilterMaterial: { code: BUND_DEFAULT_VFILTER_CODE },
            verticalFilterWidth: 0.45,
            verticalFilterHeight: 0
          }
        : {
            ...defaults,
            ...withStrippingExcavationFamily(defaults, 'seating'),
            sameToeLevels: false
          }
    if (embankmentType === 'zoned') defaults = withZonedSsrCodes(defaults)
    if (mode === 'new' && embankmentType === 'zoned') {
      defaults = {
        ...defaults,
        heartingTrench: {
          ...defaults.heartingTrench,
          fillMaterial: { code: BUND_HEARTING_TRENCH_FILL_CODE },
          excavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
        }
      }
    }
    return defaults
  }

  const oldDefaults = defaultsFor(previous, previous.mode, previous.embankmentType)
  const nextDefaults = defaultsFor(data, data.mode, data.embankmentType)
  const force = !previous.configured
  const follow = <T,>(current: T, oldValue: T, nextValue: T): T =>
    force || sameDefault(current, oldValue) ? nextValue : current
  const followMaterial = <T extends TemplateMaterialRef | null>(
    current: T,
    oldValue: T,
    nextValue: T
  ): T => force || sameMaterialDefault(current, oldValue) ? nextValue : current

  const followsOldExcavationDefault =
    force ||
    (data.strippingExcavationFamily === oldDefaults.strippingExcavationFamily &&
      sameDefault(
        data.excavationBands.stripping.map(({ label, pct, material }) => ({
          label,
          pct,
          code: material.code
        })),
        oldDefaults.excavationBands.stripping.map(({ label, pct, material }) => ({
          label,
          pct,
          code: material.code
        }))
      ))
  const excavationAdjusted: BundData = followsOldExcavationDefault
    ? {
        ...data,
        ...withStrippingExcavationFamily(data, nextDefaults.strippingExcavationFamily)
      }
    : data

  return {
    ...excavationAdjusted,
    design: {
      ...data.design,
      freeBoard: follow(
        data.design.freeBoard,
        oldDefaults.design.freeBoard,
        nextDefaults.design.freeBoard
      )
    },
    sameToeLevels: follow(
      data.sameToeLevels,
      oldDefaults.sameToeLevels,
      nextDefaults.sameToeLevels
    ),
    formationMaterial: followMaterial(
      data.formationMaterial,
      oldDefaults.formationMaterial,
      nextDefaults.formationMaterial
    ),
    heartingMaterial: followMaterial(
      data.heartingMaterial,
      oldDefaults.heartingMaterial,
      nextDefaults.heartingMaterial
    ),
    horizontalFilterMaterial: followMaterial(
      data.horizontalFilterMaterial,
      oldDefaults.horizontalFilterMaterial,
      nextDefaults.horizontalFilterMaterial
    ),
    horizontalFilterThickness: follow(
      data.horizontalFilterThickness,
      oldDefaults.horizontalFilterThickness,
      nextDefaults.horizontalFilterThickness
    ),
    verticalFilterMaterial: followMaterial(
      data.verticalFilterMaterial,
      oldDefaults.verticalFilterMaterial,
      nextDefaults.verticalFilterMaterial
    ),
    verticalFilterWidth: follow(
      data.verticalFilterWidth,
      oldDefaults.verticalFilterWidth,
      nextDefaults.verticalFilterWidth
    ),
    verticalFilterHeight: follow(
      data.verticalFilterHeight,
      oldDefaults.verticalFilterHeight,
      nextDefaults.verticalFilterHeight
    ),
    heartingDesign: {
      topLevel: follow(
        data.heartingDesign.topLevel,
        oldDefaults.heartingDesign.topLevel,
        nextDefaults.heartingDesign.topLevel
      ),
      topWidth: follow(
        data.heartingDesign.topWidth,
        oldDefaults.heartingDesign.topWidth,
        nextDefaults.heartingDesign.topWidth
      ),
      usSlope: follow(
        data.heartingDesign.usSlope,
        oldDefaults.heartingDesign.usSlope,
        nextDefaults.heartingDesign.usSlope
      ),
      dsSlope: follow(
        data.heartingDesign.dsSlope,
        oldDefaults.heartingDesign.dsSlope,
        nextDefaults.heartingDesign.dsSlope
      ),
      centerOffset: follow(
        data.heartingDesign.centerOffset,
        oldDefaults.heartingDesign.centerOffset,
        nextDefaults.heartingDesign.centerOffset
      )
    },
    heartingTrench: {
      depthMode: follow(
        data.heartingTrench.depthMode,
        oldDefaults.heartingTrench.depthMode,
        nextDefaults.heartingTrench.depthMode
      ),
      depth: follow(
        data.heartingTrench.depth,
        oldDefaults.heartingTrench.depth,
        nextDefaults.heartingTrench.depth
      ),
      bottomWidth: follow(
        data.heartingTrench.bottomWidth,
        oldDefaults.heartingTrench.bottomWidth,
        nextDefaults.heartingTrench.bottomWidth
      ),
      usSlope: follow(
        data.heartingTrench.usSlope,
        oldDefaults.heartingTrench.usSlope,
        nextDefaults.heartingTrench.usSlope
      ),
      dsSlope: follow(
        data.heartingTrench.dsSlope,
        oldDefaults.heartingTrench.dsSlope,
        nextDefaults.heartingTrench.dsSlope
      ),
      fillMaterial: followMaterial(
        data.heartingTrench.fillMaterial,
        oldDefaults.heartingTrench.fillMaterial,
        nextDefaults.heartingTrench.fillMaterial
      ),
      excavationMaterial: followMaterial(
        data.heartingTrench.excavationMaterial,
        oldDefaults.heartingTrench.excavationMaterial,
        nextDefaults.heartingTrench.excavationMaterial
      )
    }
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
  const [mapAction, setMapAction] = useState<'draw' | 'mark'>('draw')

  const drawnLength = useMemo(() => polylineLengthM(draft.alignment), [draft.alignment])
  const effectiveLength =
    draft.source === 'map'
      ? draft.lengthM > 0
        ? draft.lengthM
        : Math.round(drawnLength)
      : draft.lengthM

  const unit = draft.chainageUnit
  const unitLabel = chainageUnitLabel(unit)
  const activeMapAction =
    draft.sectionMode === 'discontinuous' && draft.alignment.length >= 2 ? mapAction : 'draw'

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
    const next: BundData = withSelectedTemplateDefaults(
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
                  onChange={() => patch({ mode: 'restoration' })}
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
                  onChange={() => patch({ mode: 'new' })}
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
                  onChange={() => patch({ embankmentType: 'homogeneous' })}
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
                  onChange={() => patch({ embankmentType: 'zoned' })}
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
                    : 'Click the map to add points along the bund alignment.'}
                </div>
              )}
              <AlignmentMap
                points={draft.alignment}
                mode={activeMapAction}
                totalLengthM={effectiveLength}
                onAddPoint={(p) => setDraft((d) => ({ ...d, alignment: [...d.alignment, p] }))}
                onPlaceBreak={(ch) => addBreak(toDisplayChainage(ch, unit))}
                ticks={activeMapAction === 'mark' ? draft.breaks : []}
                fallbackCenter={node.location ?? null}
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
