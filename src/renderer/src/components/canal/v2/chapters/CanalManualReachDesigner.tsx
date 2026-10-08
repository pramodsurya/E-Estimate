import { useState } from 'react'
import type { CanalBankDesignConfig, CanalBankReach, CanalBankTier, CanalData } from '../../../../types/project'
import { newId } from '../../../../lib/tree'
import { formatCanalReachChainage, canalReachDisplayLength } from '../../../../lib/canalTierReaches'
import { newCanalManualBankProfile, saveCanalManualBankReach, removeCanalManualBankReach } from '../../../../lib/canalManualBankReaches'
import './canalTierReaches.css'

export interface CanalManualReachDraft { reach: CanalBankReach; profile: CanalBankTier }

export default function CanalManualReachDesigner({ data, side, selectedProfileId, draft, onDraftChange, onSelect, onChange }: {
  data: CanalData; side: 'left' | 'right'; selectedProfileId?: string; draft: CanalManualReachDraft | null
  onDraftChange: (draft: CanalManualReachDraft | null) => void; onSelect: (id: string) => void
  onChange: (config: CanalBankDesignConfig) => void
}): JSX.Element {
  const [error, setError] = useState('')
  const config = data.design.bankConfig!
  const left = config.linkSymmetrical || side === 'left'
  const profiles = left ? config.leftTiers : config.rightTiers
  const rows = [...(left ? config.leftManualReaches ?? [] : config.rightManualReaches ?? [])]
    .filter(r => r.status === 'fill' && profiles.some(t => t.id === r.tierId)).sort((a, b) => a.from - b.from)
  const available: { from: number; to: number }[] = []
  let coveredTo = 0
  for (const row of rows) {
    const from = Math.max(0, Math.min(data.lengthM, row.from))
    const to = Math.max(from, Math.min(data.lengthM, row.to))
    if (from > coveredTo) available.push({ from: coveredTo, to: from })
    coveredTo = Math.max(coveredTo, to)
  }
  if (coveredTo < data.lengthM) available.push({ from: coveredTo, to: data.lengthM })
  const availableLength = available.reduce((total, range) => total + range.to - range.from, 0)
  const metres = (value: number): string => Math.round(value).toLocaleString('en-IN')
  const begin = (): void => {
    let from = 0, to = data.lengthM
    for (const row of rows) {
      if (row.from > from) { to = row.from; break }
      from = Math.max(from, row.to)
    }
    if (from >= to) { setError('All chainages already have reaches. Edit or remove an existing reach.'); return }
    const id = newId(), profile = newCanalManualBankProfile(id, newId(), `Reach ${rows.length + 1}`)
    onDraftChange({ reach: { id, from, to, tierId: profile.id, status: 'fill' }, profile }); setError('')
  }
  const save = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!draft) return
    const result = saveCanalManualBankReach(data, side, draft.reach, draft.profile)
    if (result.error) { setError(result.error); return }
    onChange(result.config); onSelect(draft.profile.id); onDraftChange(null); setError('')
  }
  return <div className="canal-manual-reach-designer">
    <div className="canal-tier-continuum-header"><strong>Manual chainage reaches</strong><button type="button" className="btn ghost" onClick={begin}><span aria-hidden="true">+</span> Add reach</button></div>
    <p className="settings-note">Create From Ch–To Ch ranges in metres. Select a reach card to configure its bund design.</p>
    <div className="canal-manual-reach-overview" aria-label="Manual reach totals">
      <div><strong>Total canal range</strong><span>From Ch 0 m → To Ch {metres(data.lengthM)} m</span><span>{formatCanalReachChainage(0)} → {formatCanalReachChainage(data.lengthM)}</span></div>
      <div><strong>Total saved reaches: {rows.length}</strong><span>Assigned length: {metres(data.lengthM - availableLength)} m</span></div>
      <div><strong>Available for new reaches: {metres(availableLength)} m</strong>{available.length ? <div className="canal-manual-available-ranges">{available.map(range => <span key={range.from}>From Ch {metres(range.from)} m → To Ch {metres(range.to)} m</span>)}</div> : <span>All chainages have saved reaches.</span>}</div>
    </div>
    {draft && <form className="canal-manual-reach-form" onSubmit={save}>
      <h4>{rows.some(r => r.id === draft.reach.id) ? 'Edit reach' : 'Create reach'}</h4>
      <div className="canal-tier-height-edit">
        {(['from', 'to'] as const).map(endpoint => <label key={endpoint}>{endpoint === 'from' ? 'From Ch (m)' : 'To Ch (m)'}<input aria-label={endpoint === 'from' ? 'Manual reach From Ch (m)' : 'Manual reach To Ch (m)'} type="number" min="0" max={data.lengthM} step="1" required value={Number.isFinite(draft.reach[endpoint]) ? draft.reach[endpoint] : ''} onChange={e => onDraftChange({ ...draft, reach: { ...draft.reach, [endpoint]: e.target.valueAsNumber } })} /></label>)}
      </div>
      <p>Configure this reach in the Bund Design card below, then save.</p>
      <div className="canal-reach-actions"><button type="submit" className="btn primary">Save reach</button><button type="button" className="btn ghost" onClick={() => { onDraftChange(null); setError('') }}>Cancel</button></div>
    </form>}
    <div className="canal-tier-bracket-track canal-bank-reach-track">{rows.map((reach, index) => {
      const profile = profiles.find(t => t.id === reach.tierId)!
      return <article key={reach.id} className={`canal-tier-bracket-chip canal-bank-reach-box ${selectedProfileId === profile.id && !draft ? 'selected' : ''}`}>
        <button type="button" className="canal-reach-box-heading" aria-pressed={selectedProfileId === profile.id && !draft} onClick={() => { onDraftChange(null); onSelect(profile.id); setError('') }}>
          <strong>{profile.name || `Reach ${index + 1}`}</strong><span>From Ch {formatCanalReachChainage(reach.from)} → To Ch {formatCanalReachChainage(reach.to)}</span>
          <small>{canalReachDisplayLength(reach.from, reach.to).toLocaleString('en-IN')} m · {profile.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'}</small>
        </button>
        <div className="canal-reach-actions">
          <button type="button" className="btn ghost" onClick={() => { onSelect(profile.id); onDraftChange({ reach: { ...reach }, profile: structuredClone(profile) }); setError('') }}>Edit reach</button>
          <button type="button" className="btn ghost" onClick={() => { onChange(removeCanalManualBankReach(config, side, reach.id)); onDraftChange(null); setError('') }}>Remove reach</button>
        </div>
      </article>
    })}</div>
    {!rows.length && !draft && <p>No manual reaches yet. Add a reach to configure its bund design.</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
