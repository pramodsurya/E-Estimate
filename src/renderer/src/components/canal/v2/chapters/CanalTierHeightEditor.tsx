import { useState } from 'react'
import type { CanalBankTier } from '../../../../types/project'
import './canalTierReaches.css'

/** Keystrokes stay in this editor so they do not rerender the bank calculations. */
export default function CanalTierHeightEditor({ tier, first, last, onSave }: {
  tier: CanalBankTier; first: boolean; last: boolean
  onSave: (id: string, min: number, max: number) => string | null
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(String(tier.minFillHeight))
  const [to, setTo] = useState(String(tier.maxFillHeight))
  const [error, setError] = useState('')
  const begin = (): void => {
    setFrom(String(tier.minFillHeight)); setTo(String(tier.maxFillHeight)); setError(''); setEditing(true)
  }
  if (!editing) return <div className="canal-tier-height-summary">
    <span>Fill height: {tier.minFillHeight} m – {last ? 'Max (∞)' : `${tier.maxFillHeight} m`}</span>
    <button type="button" className="btn ghost" aria-label={`Edit ${tier.name} height limits`} onClick={begin}>Edit heights</button>
  </div>
  return <form className="canal-tier-height-form" onSubmit={event => {
    event.preventDefault()
    const message = onSave(tier.id, from.trim() === '' ? NaN : Number(from), to.trim() === '' ? NaN : Number(to))
    if (message) { setError(message); return }
    setEditing(false); setError('')
  }}>
    <div className="canal-tier-height-edit">
      <label>From height (m)<input aria-label={`${tier.name} from height (m)`} type="number" min="0" step="0.1" required disabled={first} value={from} onChange={event => setFrom(event.target.value)} /></label>
      {last ? <span>To height: Max (∞)</span> : <label>To height (m)<input aria-label={`${tier.name} to height (m)`} type="number" min="0.1" step="0.1" required value={to} onChange={event => setTo(event.target.value)} /></label>}
    </div>
    <div className="canal-reach-actions"><button type="submit" className="btn primary" aria-label={`Save ${tier.name} height limits`}>Save heights</button><button type="button" className="btn ghost" onClick={() => { setEditing(false); setError('') }}>Cancel</button></div>
    {error && <p role="alert">{error}</p>}
  </form>
}
