import { useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Waves, X } from 'lucide-react'
import type { MiSluiceNewData, ProjectNode } from '../../types/project'
import {
  crownCover,
  hydraulicCapacity,
  miSluiceIssues,
  openingArea,
  openingCrownLevel
} from '../../lib/miSluiceNew'
import NumberField from './NumberField'

interface Props {
  node: ProjectNode
  data: MiSluiceNewData
  onDone: (data: MiSluiceNewData) => void
  /** Present only when re-opening setup on a sluice that is already configured. */
  onCancel?: () => void
  initialStep?: 1 | 2
}

type Step = 1 | 2

/**
 * Pre-dashboard setup, the same two steps as the other component templates:
 * 1) what kind of sluice and how big the vent is, 2) the tank levels it works
 * between. Everything that only affects quantities is left to the dashboard,
 * where the numbers are visible while they are edited.
 */
export default function MiSluiceSetup({
  node,
  data,
  onDone,
  onCancel,
  initialStep
}: Props): JSX.Element {
  const [step, setStep] = useState<Step>(initialStep ?? 1)
  const [draft, setDraft] = useState<MiSluiceNewData>(data)

  const patch = (partial: Partial<MiSluiceNewData>): void =>
    setDraft((current) => ({ ...current, ...partial }))

  const issues = miSluiceIssues(draft)
  const blocking = issues.filter((issue) => issue.kind === 'error')
  const capacity = hydraulicCapacity(draft)

  const goNext = (): void => {
    if (step === 1) {
      setStep(2)
      return
    }
    onDone({ ...draft, configured: true })
  }

  return (
    <div className="gw-setup">
      <div className="gw-setup-header">
        <div>
          <span className="component-section-label">
            <Waves size={15} /> New MI tank sluice — {node.name}
          </span>
          <h2>
            Step {step} of 2 · {step === 1 ? 'Sluice type and vent' : 'Tank levels'}
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
              <label className="field-label">How is the sluice controlled?</label>
              <label className={`bund-choice${draft.intakeType === 'headwall' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.intakeType === 'headwall'}
                  onChange={() => patch({ intakeType: 'headwall' })}
                />
                <span>
                  <strong>Headwall sluice</strong>
                  <em className="bund-radio-hint">
                    Gate on the upstream headwall, operated from a hoist bridge over the bund top.
                  </em>
                </span>
              </label>
              <label className={`bund-choice${draft.intakeType === 'tower' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.intakeType === 'tower'}
                  onChange={() => patch({ intakeType: 'tower' })}
                />
                <span>
                  <strong>Intake tower sluice</strong>
                  <em className="bund-radio-hint">
                    Gate in a tower standing in the tank, reached by a footbridge from the bund.
                  </em>
                </span>
              </label>
            </div>

            <div className="field">
              <label className="field-label">What shape is the vent?</label>
              <label className={`bund-choice${draft.openingShape === 'rectangular' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.openingShape === 'rectangular'}
                  onChange={() => patch({ openingShape: 'rectangular' })}
                />
                <span>
                  <strong>Rectangular barrel</strong>
                  <em className="bund-radio-hint">Clear width × height, the usual box sluice.</em>
                </span>
              </label>
              <label className={`bund-choice${draft.openingShape === 'circular' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  checked={draft.openingShape === 'circular'}
                  onChange={() => patch({ openingShape: 'circular' })}
                />
                <span>
                  <strong>Circular pipe barrel</strong>
                  <em className="bund-radio-hint">A single clear diameter per vent.</em>
                </span>
              </label>
            </div>

            <div className="field">
              <label className="field-label">Vent size</label>
              <div className="mis-grid">
                <NumberField
                  label="Number of vents"
                  value={draft.vents}
                  min={1}
                  onChange={(vents) => patch({ vents })}
                />
                {draft.openingShape === 'circular' ? (
                  <NumberField
                    label="Clear diameter"
                    suffix="m"
                    value={draft.opening.diameter}
                    onChange={(diameter) => patch({ opening: { ...draft.opening, diameter } })}
                  />
                ) : (
                  <>
                    <NumberField
                      label="Clear width"
                      suffix="m"
                      value={draft.opening.width}
                      onChange={(width) => patch({ opening: { ...draft.opening, width } })}
                    />
                    <NumberField
                      label="Clear height"
                      suffix="m"
                      value={draft.opening.height}
                      onChange={(height) => patch({ opening: { ...draft.opening, height } })}
                    />
                  </>
                )}
                <NumberField
                  label="Design discharge"
                  suffix="m³/s"
                  value={draft.hydraulic.designDischarge}
                  onChange={(designDischarge) =>
                    patch({ hydraulic: { ...draft.hydraulic, designDischarge } })
                  }
                />
              </div>
              <div className="settings-note">
                Total clear area {openingArea(draft).toFixed(3)} m². The discharge entered here is
                what the vent is checked against on the next step.
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="gw-setup-body is-single">
          <div className="bund-setup-questions">
            <div className="field">
              <label className="field-label">Tank levels (m RL)</label>
              <div className="mis-grid">
                <NumberField
                  label="Sill level"
                  min={-Infinity}
                  value={draft.levels.sill}
                  onChange={(sill) => patch({ levels: { ...draft.levels, sill } })}
                />
                <NumberField
                  label="Minimum operating level"
                  min={-Infinity}
                  title="Lowest tank level at which the sluice must still pass the design discharge"
                  value={draft.levels.minimumOperating}
                  onChange={(minimumOperating) =>
                    patch({ levels: { ...draft.levels, minimumOperating } })
                  }
                />
                <NumberField
                  label="F.T.L"
                  min={-Infinity}
                  value={draft.levels.ftl}
                  onChange={(ftl) => patch({ levels: { ...draft.levels, ftl } })}
                />
                <NumberField
                  label="M.W.L"
                  min={-Infinity}
                  value={draft.levels.mwl}
                  onChange={(mwl) => patch({ levels: { ...draft.levels, mwl } })}
                />
                <NumberField
                  label="T.B.L"
                  min={-Infinity}
                  value={draft.levels.tbl}
                  onChange={(tbl) => patch({ levels: { ...draft.levels, tbl } })}
                />
              </div>
            </div>

            <div className="mis-check-card">
              <div className="gw-panel-label">Check at the minimum operating level</div>
              <ul className="mis-check-list">
                <li>
                  <span>Vent crown</span>
                  <b>{openingCrownLevel(draft).toFixed(2)} m</b>
                </li>
                <li>
                  <span>Cover over the crown</span>
                  <b>{crownCover(draft).toFixed(2)} m</b>
                </li>
                <li>
                  <span>Full-open capacity</span>
                  <b>{capacity.toFixed(3)} m³/s</b>
                </li>
                <li>
                  <span>Design discharge</span>
                  <b>{draft.hydraulic.designDischarge.toFixed(3)} m³/s</b>
                </li>
              </ul>
              {issues.length === 0 ? (
                <div className="settings-note">The vent passes the design discharge.</div>
              ) : (
                issues.map((issue, index) => (
                  <div key={index} className={`mis-issue is-${issue.kind}`}>
                    <AlertTriangle size={13} /> {issue.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="gw-setup-footer">
        <button className="btn ghost" disabled={step === 1} onClick={() => setStep(1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <button
          className="btn"
          disabled={step === 2 && blocking.length > 0}
          title={
            step === 2 && blocking.length > 0
              ? 'Resolve the levels and vent size flagged above first'
              : undefined
          }
          onClick={goNext}
        >
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
