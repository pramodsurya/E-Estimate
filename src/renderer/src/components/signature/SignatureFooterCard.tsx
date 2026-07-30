import { Plus, RotateCcw, Signature, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { SignatureFooterSettings } from '../../types/project'
import {
  DEFAULT_SIGNATURE_FOOTER,
  hasSignatureFooterOverride,
  normalizeSignatureFooter,
  PROJECT_SIGNATURE_SCOPE,
  resolveSignatureFooter
} from '../../lib/signatureFooter'

function newRow(): SignatureFooterSettings['rows'][number] {
  return {
    id: crypto.randomUUID(),
    designation: '',
    office: ''
  }
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
  const local = hasSignatureFooterOverride(project, scopeKey)
  const settings = resolveSignatureFooter(project, scopeKey)
  const save = (next: SignatureFooterSettings): void => update(scopeKey, next)
  const customize = (): void =>
    save({
      ...normalizeSignatureFooter(settings),
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
                : local
                  ? 'Local settings for this dashboard only'
                  : 'Using the Project default'}
            </small>
          </div>
        </div>
        {!isProject && (
          local ? (
            <button className="btn-mini" onClick={() => update(scopeKey, null)}>
              <RotateCcw size={12} /> Use Project default
            </button>
          ) : (
            <button className="btn-mini" onClick={customize}>Customize here</button>
          )
        )}
      </div>

      {(isProject || local) && (
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
                <input
                  value={row.designation}
                  placeholder="e.g. Assistant Engineer"
                  onChange={(event) =>
                    save({
                      ...settings,
                      rows: settings.rows.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, designation: event.target.value }
                          : candidate
                      )
                    })
                  }
                />
                <input
                  value={row.office}
                  placeholder="e.g. Irrigation Division"
                  onChange={(event) =>
                    save({
                      ...settings,
                      rows: settings.rows.map((candidate) =>
                        candidate.id === row.id
                          ? { ...candidate, office: event.target.value }
                          : candidate
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
          </p>
        </>
      )}
    </section>
  )
}
