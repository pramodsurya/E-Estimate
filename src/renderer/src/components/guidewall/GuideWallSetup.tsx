import { useMemo, useState } from 'react'
import { Check, Ruler, X } from 'lucide-react'
import type { GuideWallData, ProjectNode } from '../../types/project'
import { formatChainage, materializeSections, polylineLengthM } from '../../lib/guideWall'
import AlignmentMap from './AlignmentMap'

interface Props {
  node: ProjectNode
  data: GuideWallData
  onDone: (data: GuideWallData) => void
  /** Present only when re-editing an already configured guide wall. */
  onCancel?: () => void
}

/**
 * Pre-dashboard setup: one sections screen. Alignment and length always
 * arrive from component creation, so there is no alignment step here — the
 * length box below only covers data saved before that contract (or edited
 * back to zero), and the map only previews or places section marks.
 * Which side(s) carry a wall is edited any time on the dashboard.
 */
export default function GuideWallSetup({
  node,
  data,
  onDone,
  onCancel
}: Props): JSX.Element {
  const [draft, setDraft] = useState<GuideWallData>(data)
  const [manualBreak, setManualBreak] = useState('')

  const drawnLength = useMemo(() => polylineLengthM(draft.alignment), [draft.alignment])
  const effectiveLength =
    draft.source === 'map' ? (draft.lengthM > 0 ? draft.lengthM : Math.round(drawnLength)) : draft.lengthM
  // Length (and usually the alignment) arrives from component creation; the
  // box below only rescues records that predate that contract.
  const hasPresetLength = data.lengthM > 0 || data.alignment.length >= 2

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

  const canFinish =
    effectiveLength > 0 && (draft.sectionMode === 'continuous' ? draft.intervalM > 0 : true)

  const finish = (): void => {
    if (!canFinish) return
    const length = effectiveLength
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

  return (
    <div className="gw-setup">
      <div className="gw-setup-header">
        <div>
          <span className="component-section-label">
            <Ruler size={15} /> Guide wall setup — {node.name}
          </span>
          <h2>Sections</h2>
        </div>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            <X size={14} /> Cancel
          </button>
        )}
      </div>

      <div className="gw-setup-body">
        <div className="gw-setup-fields">
          <div className="field">
            {data.lengthM > 0 && (
              <div className="latlng-display">
                {`Length: ${Math.round(effectiveLength).toLocaleString('en-IN')} m — from component creation`}
              </div>
            )}
            {!hasPresetLength && (
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

      <div className="gw-setup-footer">
        <button className="btn" disabled={!canFinish} onClick={finish}>
          <Check size={14} /> Finish setup
        </button>
      </div>
    </div>
  )
}
