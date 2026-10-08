import { useState, useMemo } from 'react'
import type { CanalBankReach, CanalBankTier, CanalData } from '../../../../types/project'
import { canalBankReaches, canalBankReachStations, editCanalBankReach, assignCanalBankReach, formatCanalReachChainage, canalReachDisplayLength } from '../../../../lib/canalTierReaches'
import { newId } from '../../../../lib/tree'
import { ReachIntervals } from './CanalTierReachSummary'
import './canalTierReaches.css'

/** Other bank chapters display the same assignments; edits stay in Bank Design. */
export function CanalBankReachLabels({ data, side, tierId }: { data: CanalData; side: 'left' | 'right'; tierId: string }): JSX.Element {
  const reaches = canalBankReaches(data, side).filter(r => r.status === 'fill' && r.tierId === tierId)
  return <span className="canal-shared-reach-labels">{reaches.length ? reaches.map(r => <span key={r.id}>From Ch {formatCanalReachChainage(r.from)} → To Ch {formatCanalReachChainage(r.to)}</span>) : <span>No assigned reaches</span>}</span>
}

export default function CanalBankReachEditor({ data, side, tier, status, onChange }: {
  data: CanalData
  side: 'left' | 'right'
  tier?: CanalBankTier
  status?: CanalBankReach['status']
  onChange: (rows: CanalBankReach[]) => void
}): JSX.Element {
  const [editing, setEditing] = useState<CanalBankReach | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const all = useMemo(() => canalBankReaches(data, side), [data, side])
  const rows = useMemo(() => all.filter(r => tier ? r.tierId === tier.id && r.status === 'fill' : r.status === status), [all, tier, status])
  const config = data.design.bankConfig!
  const manual = config.mode === 'manual'
  const stations = useMemo(() => canalBankReachStations(data), [data])
  const tiers = config.linkSymmetrical || side === 'left' ? config.leftTiers : config.rightTiers
  const assignments = (): CanalBankReach[] => all.map(({ id, from, to, tierId, status }) => ({ id, from, to, tierId, status }))
  const add = (): void => {
    const gap = all.find(r => r.status === 'unassigned' || r.status === 'missing')
    if (!gap) { setError('There is no unassigned range. Edit or remove an existing reach first.'); return }
    setEditing({ id: newId(), from: gap.from, to: gap.to, tierId: tier?.id ?? null, status: tier ? 'fill' : status ?? 'unassigned' })
    setAdding(true); setError('')
  }
  const save = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!editing) return
    const fields = new FormData(event.currentTarget)
    const assignment = String(fields.get('assignment'))
    const selectedTier = tiers.find(t => t.id === assignment)
    const patch = { from: manual ? Math.round(Number(fields.get('from')) * 1000) : Number(fields.get('from')), to: manual ? Math.round(Number(fields.get('to')) * 1000) : Number(fields.get('to')),
      tierId: selectedTier?.id ?? null, status: (selectedTier ? 'fill' : assignment) as CanalBankReach['status'] }
    let next: CanalBankReach[], problem: string | null
    if (adding) {
      const result = assignCanalBankReach(data, side, assignments(), { ...editing, ...patch })
      next = result.rows; problem = result.error
    } else {
      const result = editCanalBankReach(data, side, assignments(), editing.id, patch)
      next = result.rows; problem = result.error
    }
    if (problem) { setError(problem); return }
    onChange(next); setEditing(null); setError('')
  }
  const chooseTier = (reach: CanalBankReach, tierId: string): void => {
    if (!tierId) return
    const result = editCanalBankReach(data, side, assignments(), reach.id, { tierId, status: 'fill' })
    if (result.error) { setError(result.error); return }
    onChange(result.rows); setEditing(null); setError('')
  }
  return <div className="canal-bank-reaches canal-tier-reach-summary">
    <p><strong>{rows.length} {rows.length === 1 ? 'reach' : 'reaches'} · {rows.reduce((sum, r) => sum + canalReachDisplayLength(r.from, r.to), 0).toLocaleString('en-IN')} m</strong></p>
    <div className="canal-reach-list">{rows.map(reach => <div className="canal-reach-row" key={reach.id}>
      <div><strong>From Ch {formatCanalReachChainage(reach.from)} → To Ch {formatCanalReachChainage(reach.to)}</strong><span>Length {canalReachDisplayLength(reach.from, reach.to).toLocaleString('en-IN')} m</span>
        {!manual && reach.minHeight != null && reach.maxHeight != null && <span>{reach.status === 'cut'
          ? `Top RL above bank top ${Math.max(0, -reach.maxHeight).toFixed(3)} – ${Math.max(0, -reach.minHeight).toFixed(3)} m`
          : `Signed fill height ${reach.minHeight.toFixed(3)} – ${reach.maxHeight.toFixed(3)} m`}</span>}
        {!manual && reach.status === 'fill' && reach.minHeight != null && reach.minHeight < 0 && reach.maxHeight != null && reach.maxHeight > 0 && <span>Mixed filling and cutting</span>}
      </div>
      <ReachIntervals reach={reach} />
      {reach.status === 'unassigned' && <label className="canal-reach-assign">Assign to bund<select aria-label={`Assign ${formatCanalReachChainage(reach.from)} to ${formatCanalReachChainage(reach.to)} to bund`} value="" onChange={e => chooseTier(reach, e.target.value)}>
        <option value="">Choose a bund tier</option>{tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>}
      <div className="canal-reach-actions">
        <button type="button" className="btn ghost" onClick={() => { setEditing(reach); setAdding(false); setError('') }}>Edit reach</button>
        <button type="button" className="btn ghost" onClick={() => { onChange(assignments().filter(r => r.id !== reach.id)); setEditing(null); setError('') }}>Remove reach</button>
      </div>
    </div>)}</div>
    {!rows.length && <p>{manual ? 'Create a reach and assign this profile.' : 'No reaches assigned.'}</p>}
    {tier && <button type="button" className="btn ghost" onClick={add}>Add reach</button>}
    {editing && <form className="canal-reach-edit" onSubmit={save} key={editing.id}>
      {(['from', 'to'] as const).map(endpoint => <label key={endpoint}>{endpoint === 'from' ? 'From Ch' : 'To Ch'} (km)
        {manual ? <input name={endpoint} type="number" min="0" max={data.lengthM / 1000} step="0.001" defaultValue={Number((editing[endpoint] / 1000).toFixed(3))} required />
          : <select name={endpoint} defaultValue={editing[endpoint]} required>{stations.map(ch => <option key={ch} value={ch}>{formatCanalReachChainage(ch)}</option>)}</select>}
      </label>)}
      <label>Assignment<select name="assignment" defaultValue={editing.tierId ?? editing.status}>
        {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        {manual && <><option value="cut">Cutting</option><option value="level">At bank-top level</option><option value="missing">Missing levels</option></>}
        {!manual && editing.status !== 'fill' && editing.status !== 'unassigned' && <option value={editing.status} disabled>{editing.status === 'missing' ? 'Missing levels' : 'No positive bund height'}</option>}
        <option value="unassigned">Unassigned</option>
      </select></label>
      <div className="canal-reach-actions"><button type="submit" className="btn primary">Save reach</button><button type="button" className="btn ghost" onClick={() => { setEditing(null); setError('') }}>Cancel</button></div>
      <small>{!manual && 'Choose chainages from Soil Strata or Sections. Mixed filling and cutting is allowed; pure cutting cannot be assigned to a bund. '}Adjoining reaches adjust automatically without overlap.</small>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>
}
