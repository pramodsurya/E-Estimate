import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Signature, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { SignatureFooterSettings } from '../../types/project'
import {
  DEFAULT_SIGNATURE_FOOTER,
  normalizeSignatureFooter,
  printableSignatureRows,
  PROJECT_SIGNATURE_SCOPE,
  resolveSignatureFooterSource
} from '../../lib/signatureFooter'

function newRow(): SignatureFooterSettings['rows'][number] {
  return {
    id: crypto.randomUUID(),
    designation: '',
    office: ''
  }
}

/**
 * A field that reaches the project once, when you have finished typing in it.
 *
 * Writing straight through on every keystroke replaced the whole project and
 * pushed an undo step per character, and everything watching the project woke
 * up each time — including any open print preview, which answered by
 * re-assembling a PDF. Typing a designation is 25 of those. The text lives here
 * while the field has the caret and is committed on blur, on Enter, and on
 * unmount, so nothing typed is ever lost.
 */
function CommitOnBlurInput({
  value,
  placeholder,
  onCommit
}: {
  value: string
  placeholder: string
  onCommit: (next: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  // Refs so the unmount commit sees the last keystroke, not the first render.
  const pending = useRef({ draft: value, value, editing: false, onCommit })
  pending.current = { draft, value, editing, onCommit }

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useEffect(
    () => () => {
      const last = pending.current
      if (last.editing && last.draft !== last.value) last.onCommit(last.draft)
    },
    []
  )

  const commit = (): void => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  return (
    <input
      value={editing ? draft : value}
      placeholder={placeholder}
      onFocus={() => {
        setDraft(value)
        setEditing(true)
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      onBlur={commit}
    />
  )
}

export default function SignatureFooterCard({
  scopeKey,
  compact = false
}: {
  scopeKey: string
  compact?: boolean
}): JSX.Element | null {
  const project = useStore((state) => state.project)
  const update = useStore((state) => state.updateSignatureFooter)
  if (!project) return null

  const isProject = scopeKey === PROJECT_SIGNATURE_SCOPE
  const { settings, sourceName, isLocal } = resolveSignatureFooterSource(project, scopeKey)
  const local = isProject || isLocal
  const inheritedRows = printableSignatureRows(settings)
  const save = (next: SignatureFooterSettings): void => update(scopeKey, next)
  /** Take over this branch by copying whatever is currently inherited. */
  const customize = (enabled = settings.enabled): void =>
    save({
      ...normalizeSignatureFooter(settings),
      enabled,
      rows: settings.rows.map((row) => ({ ...row }))
    })

  return (
    <section className={`signature-footer-card ${compact ? 'compact' : ''}`}>
      <div className="signature-card-heading">
        <div>
          <span className="signature-card-icon"><Signature size={15} /></span>
          <div>
            <h3>Signature / Footer</h3>
            <small>
              {isProject
                ? 'Project default for dashboards, DATA and Pages (Front Page excluded)'
                : isLocal
                  ? 'Set here — also applies to everything under this subject'
                  : `Inherited from ${sourceName}`}
            </small>
          </div>
        </div>
        {!isProject && (
          isLocal ? (
            <button className="btn-mini" onClick={() => update(scopeKey, null)}>
              <RotateCcw size={12} /> Use inherited
            </button>
          ) : (
            <div className="signature-card-actions">
              <button className="btn-mini" onClick={() => customize()}>Customize here</button>
              {settings.enabled && inheritedRows.length > 0 && (
                <button className="btn-mini" onClick={() => customize(false)}>
                  No signature here
                </button>
              )}
            </div>
          )
        )}
      </div>

      {!local && (
        <div className="signature-inherited">
          {settings.enabled && inheritedRows.length > 0 ? (
            <>
              <div className="signature-inherited-meta">
                {settings.placement === 'every_page'
                  ? 'Prints on every page'
                  : 'Prints at the end of this subject'}
              </div>
              <div className="signature-inherited-rows">
                {inheritedRows.map((row) => (
                  <div className="signature-inherited-item" key={row.id}>
                    <strong>{row.designation}</strong>
                    <small>{row.office}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="signature-inherited-meta">
              No signature prints here — {sourceName} has it turned off.
            </div>
          )}
        </div>
      )}

      {local && (
        <>
          <div className="signature-card-options">
            <label className="signature-enable">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => save({ ...settings, enabled: event.target.checked })}
              />
              <span>Enabled</span>
            </label>
            <label>
              Placement
              <select
                value={settings.placement}
                onChange={(event) =>
                  save({
                    ...settings,
                    placement:
                      event.target.value === 'every_page' ? 'every_page' : 'subject_end'
                  })
                }
              >
                <option value="every_page">Every printed page</option>
                <option value="subject_end">End of this subject</option>
              </select>
            </label>
          </div>

          <div className="signature-row-editor">
            <div className="signature-row-head">
              <span>Designation</span>
              <span>Office</span>
              <span></span>
            </div>
            {settings.rows.map((row) => (
              <div className="signature-row" key={row.id}>
                <CommitOnBlurInput
                  value={row.designation}
                  placeholder="e.g. Assistant Engineer"
                  onCommit={(designation) =>
                    save({
                      ...settings,
                      rows: settings.rows.map((candidate) =>
                        candidate.id === row.id ? { ...candidate, designation } : candidate
                      )
                    })
                  }
                />
                <CommitOnBlurInput
                  value={row.office}
                  placeholder="e.g. Irrigation Division"
                  onCommit={(office) =>
                    save({
                      ...settings,
                      rows: settings.rows.map((candidate) =>
                        candidate.id === row.id ? { ...candidate, office } : candidate
                      )
                    })
                  }
                />
                <button
                  className="btn-mini icon-only"
                  title="Remove signatory"
                  onClick={() =>
                    save({
                      ...settings,
                      rows: settings.rows.filter((candidate) => candidate.id !== row.id)
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              className="btn-mini signature-add-row"
              onClick={() =>
                save({
                  ...(settings ?? DEFAULT_SIGNATURE_FOOTER),
                  rows: [...settings.rows, newRow()]
                })
              }
            >
              <Plus size={12} /> Add signatory
            </button>
          </div>
          <p className="signature-card-note">
            Signatories print from left to right in the order shown above.
            {isProject
              ? ' Every component, sub-component, DATA, Lead, Seigniorage and Page uses this unless it sets its own.'
              : ' Everything under this subject uses these unless it sets its own.'}
          </p>
        </>
      )}
    </section>
  )
}
