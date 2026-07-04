import { useEffect, useMemo, useState } from 'react'
import { Calculator, Pencil, RotateCcw, Save, TableProperties } from 'lucide-react'
import {
  fetchLeadDetailReconstructions,
  recalculateLeadDetail,
  recalculateDerivation
} from '../../lib/leadDetail'
import { useStore } from '../../store/useStore'
import type {
  LeadDetailDerivation,
  LeadDetailLine,
  LeadDetailReconstruction
} from '../../types/project'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function DtlLeadDashboard(): JSX.Element {
  const project = useStore((state) => state.project)
  const saveLeadDetail = useStore((state) => state.saveLeadDetailReconstruction)
  const restoreLeadDetail = useStore((state) => state.restoreLeadDetailReconstruction)
  const [defaults, setDefaults] = useState<LeadDetailReconstruction[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [draft, setDraft] = useState<LeadDetailReconstruction | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const overrides = project?.leadDetailOverrides ?? {}
  const details = useMemo(
    () =>
      defaults.map((detail) => {
        const override = overrides[`${detail.detailCode}:${detail.year}`]
        return override ? cloneDetail(override) : detail
      }),
    [defaults, overrides]
  )
  const selected = details.find((detail) => detail.detailCode === selectedCode) ?? details[0] ?? null

  useEffect(() => {
    if (!project?.meta.sorYear) return
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchLeadDetailReconstructions(project.meta.sorYear)
      .then((rows) => {
        if (cancelled) return
        setDefaults(rows)
        setSelectedCode((current) => current || rows[0]?.detailCode || '')
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load DTL Lead.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project?.meta.sorYear])

  useEffect(() => {
    setDraft(selected ? cloneDetail(selected) : null)
    setEditing(false)
    setNotice('')
  }, [selected?.detailCode, selected?.year])

  if (!project) return <div className="rate-state">Open a project before editing DTL Lead.</div>

  const active = draft ?? selected

  const startEdit = (): void => {
    if (!selected) return
    setDraft(cloneDetail(selected))
    setEditing(true)
    setNotice('Editing project-local DTL reconstruction. Supabase source rows remain unchanged.')
  }

  const recalculate = (): void => {
    if (!draft) return
    setDraft(recalculateLeadDetail(draft))
    setNotice('DTL reconstruction recalculated from the edited rows.')
  }

  const save = (): void => {
    if (!draft) return
    const recalculated = recalculateLeadDetail(draft)
    saveLeadDetail(recalculated)
    setDraft(cloneDetail(recalculated))
    setEditing(false)
    setNotice('DTL Lead reconstruction saved in this project.')
  }

  const restore = (): void => {
    if (!selected) return
    restoreLeadDetail(selected.detailCode, selected.year)
    const source = defaults.find((detail) => detail.detailCode === selected.detailCode)
    setDraft(source ? cloneDetail(source) : null)
    setEditing(false)
    setNotice('Supabase DTL reconstruction restored for this item.')
  }

  return (
    <div className="dashboard dtl-lead-dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Supabase reconstruction</div>
          <h1 className="dash-title">
            <TableProperties size={22} />
            DTL Lead
          </h1>
        </div>
        <div className="dash-actions">
          {!editing ? (
            <button className="btn" onClick={startEdit} disabled={!active}>
              <Pencil size={14} /> Edit
            </button>
          ) : (
            <>
              <button className="btn ghost" onClick={() => selected && setDraft(cloneDetail(selected))}>
                Cancel
              </button>
              <button className="btn ghost" onClick={recalculate}>
                <Calculator size={14} /> Recalculate
              </button>
              <button className="btn" onClick={save}>
                <Save size={14} /> Save
              </button>
            </>
          )}
          <button className="btn ghost" onClick={restore} disabled={!active}>
            <RotateCcw size={14} /> Defaults
          </button>
        </div>
      </div>

      <div className="lead-status-row">
        <span>{project.meta.sorYear || 'No SOR year selected'}</span>
        <span>{details.length} DTL reconstruction item(s)</span>
        <span>{active?.derivations.length ?? 0} derivation block(s)</span>
      </div>
      {notice && <div className="rate-notice">{notice}</div>}
      {error && <div className="rate-warning">{error}</div>}
      {loading && <div className="rate-state">Loading DTL Lead reconstruction from Supabase...</div>}

      {!loading && details.length > 0 && (
        <div className="dtl-lead-layout">
          <aside className="dtl-lead-list">
            {details.map((detail) => (
              <button
                className={active?.detailCode === detail.detailCode ? 'selected' : ''}
                key={detail.detailCode}
                onClick={() => setSelectedCode(detail.detailCode)}
              >
                <strong>{detail.detailCode}</strong>
                <span>{detail.chargeCode}</span>
              </button>
            ))}
          </aside>
          {active && (
            <article className="dtl-reconstruction">
              <div className="dtl-reconstruction-head">
                <strong>{active.detailCode}</strong>
                <span>{active.chargeCode}</span>
                <p>{active.titleLines[0] || active.title}</p>
              </div>
              {active.derivations.map((derivation, index) => (
                <DltDerivationBlock
                  key={`${derivation.sequence ?? index}-${derivation.label}`}
                  derivation={derivation}
                  editing={editing}
                  onChange={(next) => {
                    if (!draft) return
                    setDraft({
                      ...draft,
                      derivations: draft.derivations.map((candidate, candidateIndex) =>
                        candidateIndex === index ? next : candidate
                      )
                    })
                  }}
                />
              ))}
            </article>
          )}
        </div>
      )}
    </div>
  )
}

function DltDerivationBlock({
  derivation,
  editing,
  onChange
}: {
  derivation: LeadDetailDerivation
  editing: boolean
  onChange: (derivation: LeadDetailDerivation) => void
}): JSX.Element {
  const updateLine = (index: number, patch: Partial<LeadDetailLine>): void => {
    const rows = derivation.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row
    )
    onChange(recalculateDerivation({ ...derivation, rows }))
  }

  return (
    <section className="dtl-derivation">
      {derivation.category && <div className="dtl-category">CATEGORY : {derivation.category}</div>}
      <div className="dtl-derivation-title">
        <strong>{derivation.label}</strong>
        <span>
          Unit: {formatNumber(derivation.unit_qty)} {derivation.unit}
        </span>
      </div>
      <table className="dtl-table">
        <thead>
          <tr>
            <th>Sl No</th>
            <th>Description</th>
            <th>Unit</th>
            <th>Quantity</th>
            <th>Rate in Rs.</th>
            <th>Amount in Rs.</th>
          </tr>
        </thead>
        <tbody>
          {derivation.rows.map((row, index) => (
            <tr key={`${index}-${row.description}`}>
              <td>{editing ? <input value={row.sl_no} onChange={(event) => updateLine(index, { sl_no: event.target.value })} /> : row.sl_no}</td>
              <td>{editing ? <input value={row.description} onChange={(event) => updateLine(index, { description: event.target.value })} /> : row.description}</td>
              <td>{editing ? <input value={row.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /> : row.unit}</td>
              <td>{editing ? <NumberInput value={row.quantity} onChange={(value) => updateLine(index, { quantity: value })} /> : formatNumber(row.quantity)}</td>
              <td>{editing ? <NumberInput value={row.rate} onChange={(value) => updateLine(index, { rate: value })} /> : formatMoney(row.rate)}</td>
              <td>{formatMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="dtl-total-row">
            <td colSpan={4}>Total</td>
            <td>Rs:</td>
            <td>{formatMoney(derivation.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="dtl-calc-lines">
        <div>
          <span>Contractor's profit and overhead charges</span>
          <span>{formatNumber(derivation.overhead_pct)}%</span>
          <strong>{formatMoney(derivation.overhead_amount)}</strong>
        </div>
        <div>
          <span>Total for materials under this Category</span>
          <span>
            {formatNumber(derivation.gross_qty)} {derivation.gross_unit}
          </span>
          <strong>{formatMoney(derivation.gross_total)}</strong>
        </div>
        <div className="final">
          <span>Rate per {derivation.rate_unit || derivation.unit}</span>
          <span>{derivation.rate_formula}</span>
          <strong>{formatMoney(derivation.rate)}</strong>
        </div>
        {derivation.summary_ref && (
          <div>
            <span>{derivation.summary_ref.charge_code} {derivation.summary_ref.slab_key}</span>
            <span>{derivation.summary_ref.column_key}</span>
            <strong>{formatMoney(derivation.summary_ref.summary_rate)}</strong>
          </div>
        )}
      </div>
    </section>
  )
}

function NumberInput({
  value,
  onChange
}: {
  value: number | null
  onChange: (value: number | null) => void
}): JSX.Element {
  return (
    <input
      type="number"
      step="any"
      value={value ?? ''}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        onChange(Number.isFinite(parsed) ? parsed : null)
      }}
    />
  )
}

function cloneDetail(detail: LeadDetailReconstruction): LeadDetailReconstruction {
  return JSON.parse(JSON.stringify(detail)) as LeadDetailReconstruction
}

function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '' : money.format(value)
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return Number.isInteger(value) ? String(value) : String(value)
}
