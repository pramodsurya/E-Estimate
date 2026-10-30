import type { CanalData } from '../../../../types/project'
import { canalBankReaches, formatCanalReachChainage, type CanalAssignedBankReach } from '../../../../lib/canalTierReaches'
import './canalBankProtection.css'

export const bankReachLabel = (reach: { from: number; to: number }): string => `From Ch ${formatCanalReachChainage(reach.from)} → To Ch ${formatCanalReachChainage(reach.to)}`

export default function CanalBankReachPicker({ data, side, selected, onSelect, status, selectedTierId, onSelectTier, tierStatus }: { data: CanalData; side: 'left' | 'right'; selected?: CanalAssignedBankReach; onSelect: (reach: CanalAssignedBankReach) => void; status: (reach: CanalAssignedBankReach) => string; selectedTierId?: string; onSelectTier?: (id: string) => void; tierStatus?: (id: string) => string }): JSX.Element {
  const partition = canalBankReaches(data, side)
  const config = data.design.bankConfig
  const tiers = config?.linkSymmetrical || side === 'left' ? config?.leftTiers : config?.rightTiers
  const grouped = config?.mode === 'tiered' && !!onSelectTier
  const x = (ch: number): number => 28 + ch / Math.max(1, data.lengthM) * 944
  return <>
    <figure className="canal-protection-chainage"><figcaption>Bank Design reaches · chainage in kilometres</figcaption><svg viewBox="0 0 1000 116" role="img" aria-label="Bank Design chainage diagram">
      <line x1="28" x2="972" y1="60" y2="60" stroke="currentColor"/>
      {partition.map(reach => <rect key={reach.id} x={x(reach.from)} y="34" width={Math.max(1, x(reach.to) - x(reach.from))} height="34" rx="2" fill={reach.status === 'fill' ? (grouped ? reach.tierId === selectedTierId : reach.id === selected?.id) ? '#35c9ba' : '#368ac1' : '#606773'} opacity={reach.status === 'fill' ? 1 : 0.4}><title>{bankReachLabel(reach)} · {reach.status === 'fill' ? tiers?.find(t => t.id === reach.tierId)?.name : 'No assigned bund'}</title></rect>)}
      <text x="28" y="100">{formatCanalReachChainage(0)}</text><text x="972" y="100" textAnchor="end">{formatCanalReachChainage(data.lengthM)}</text>
      {grouped ? <text x="500" y="22" textAnchor="middle">{tiers?.find(t => t.id === selectedTierId)?.name} · all assigned reaches highlighted</text> : selected && <><text x={Math.min(840, Math.max(160, (x(selected.from) + x(selected.to)) / 2))} y="22" textAnchor="middle">{formatCanalReachChainage(selected.from)} → {formatCanalReachChainage(selected.to)}</text><line x1={x(selected.from)} x2={x(selected.from)} y1="30" y2="78" stroke="#35c9ba"/><line x1={x(selected.to)} x2={x(selected.to)} y1="30" y2="78" stroke="#35c9ba"/></>}
    </svg></figure>
    {grouped ? <div className="canal-protection-reach-cards" aria-label="Bank protection design groups">{tiers?.map(tier => {
      const assigned = partition.filter(r => r.status === 'fill' && r.tierId === tier.id)
      const length = assigned.reduce((sum, r) => sum + r.to - r.from, 0)
      return <button key={tier.id} type="button" className={`canal-tier-bracket-chip ${selectedTierId === tier.id ? 'selected' : ''}`} aria-pressed={selectedTierId === tier.id} onClick={() => onSelectTier!(tier.id)}><strong>{tier.name}</strong><span>{tier.minFillHeight} m – {tier.maxFillHeight >= 9999 ? 'Max (∞)' : `${tier.maxFillHeight} m`}</span><small>{assigned.length} {assigned.length === 1 ? 'reach' : 'reaches'} · {length.toLocaleString('en-IN')} m</small><small>{tierStatus?.(tier.id)}</small>{assigned.map(reach => <span key={reach.id}>{bankReachLabel(reach)}</span>)}{!assigned.length && <small>No reaches in this design.</small>}</button>
    })}</div> : <div className="canal-protection-reach-cards" aria-label="Bank Design reaches">{partition.filter(r => r.status === 'fill' && r.tierId).map((reach, index) => <button key={reach.id} type="button" className={`canal-tier-bracket-chip ${selected?.id === reach.id ? 'selected' : ''}`} aria-pressed={selected?.id === reach.id} onClick={() => onSelect(reach)}><strong>{tiers?.find(t => t.id === reach.tierId)?.name ?? `Reach ${index + 1}`}</strong><span>{bankReachLabel(reach)}</span><small>Length {(reach.to - reach.from).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m</small><small>{status(reach)}</small></button>)}</div>}
  </>
}
