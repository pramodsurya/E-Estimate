import { useState } from 'react'
import type { CanalBankTier, CanalData, CanalSection } from '../../../../types/project'
import { canalBedLevelAt, canalSectionDepth } from '../../../../lib/canal'
import { canalTierReaches, formatCanalReachChainage, canalReachDisplayLength, type CanalTierReach, type CanalTierReachStatus } from '../../../../lib/canalTierReaches'
import './canalTierReaches.css'

const km = formatCanalReachChainage
const rl = (value: number | null): string => value == null ? '—' : value.toFixed(3)
const length = (reaches: CanalTierReach[]): number => reaches.reduce((sum, r) => sum + r.to - r.from, 0)

export function ReachIntervals({ reach }: { reach: CanalTierReach }): JSX.Element {
  const [open, setOpen] = useState(false)
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Show {reach.intervals.length} chainage {reach.intervals.length === 1 ? 'interval' : 'intervals'}</summary>
    {open && <div className="canal-soil-table-container canal-tier-intervals"><table className="canal-soil-table">
      <thead><tr><th>From Ch</th><th>To Ch</th><th>Length (m)</th><th>Strata Top RL<br />From → To (m)</th><th>Bank-top RL<br />From → To (m)</th><th>Signed height<br />From → To (m)</th></tr></thead>
      <tbody>{reach.intervals.map(interval => <tr key={interval.from}>
        <td>{km(interval.from)}</td><td>{km(interval.to)}</td><td>{canalReachDisplayLength(interval.from, interval.to)}</td>
        <td>{rl(interval.fromTopRl)} → {rl(interval.toTopRl)}</td>
        <td>{rl(interval.fromBankTopRl)} → {rl(interval.toBankTopRl)}</td>
        <td>{rl(interval.fromHeight)} → {rl(interval.toHeight)}</td>
      </tr>)}</tbody>
    </table></div>}
  </details>
}

function ReachGroup({ title, reaches, empty }: { title: string; reaches: CanalTierReach[]; empty: string }): JSX.Element {
  const range = (reach: CanalTierReach): string => {
    if (reach.status === 'missing') return '—'
    return reach.status === 'cut'
      ? `${rl(Math.max(0, -(reach.maxHeight ?? 0)))} – ${rl(-(reach.minHeight ?? 0))}`
      : `${rl(reach.minHeight)} – ${rl(reach.maxHeight)}`
  }
  const heightLabel = reaches[0]?.status === 'cut' ? 'Top RL above bank top (m)' : 'Fill height (m)'
  return <div>
    <h4>{title} · {reaches.length} {reaches.length === 1 ? 'reach' : 'reaches'} · {(length(reaches) / 1000).toFixed(3)} km</h4>
    {reaches.length ? <div className="canal-soil-table-container"><table className="canal-soil-table">
      <thead><tr><th>From Ch</th><th>To Ch</th><th>Length (m)</th><th>{heightLabel}</th><th>Chainages &amp; levels</th></tr></thead>
      <tbody>{reaches.map(reach => <tr key={reach.from}>
        <td>{km(reach.from)}</td><td>{km(reach.to)}</td><td>{canalReachDisplayLength(reach.from, reach.to)}</td><td>{range(reach)}</td><td><ReachIntervals reach={reach} /></td>
      </tr>)}</tbody>
    </table></div> : <p>{empty}</p>}
  </div>
}

export default function CanalTierReachSummary({ data, sections, tiers }: { data: CanalData; sections: CanalSection[]; tiers: CanalBankTier[] }): JSX.Element {
  const reaches = canalTierReaches(data, sections, tiers)
  const group = (status: CanalTierReachStatus): CanalTierReach[] => reaches.filter(r => r.status === status)
  const accounted = length(reaches)
  const classified = length(reaches.filter(r => r.status === 'fill' || r.status === 'cut' || r.status === 'level'))
  const entered = new Set(sections.filter(s => s.chainage >= 0 && s.chainage <= accounted && Number.isFinite(s.strataTopRl)).map(s => s.chainage)).size
  const bankAt = (ch: number): number | null => {
    const bed = canalBedLevelAt(data, ch)
    const top = bed == null ? null : bed + canalSectionDepth(data.design)
    return top != null && Number.isFinite(top) ? top : null
  }
  return <section className="canal-earthwork-card canal-tier-reach-summary">
    <h4>Reaches by height tier · Soil &amp; Rock Strata Top RL</h4>
    <p>Bank-top RL = design bed RL at each chainage + full supply depth + freeboard. Signed height = bank-top RL − strata Top RL. Positive heights belong to bund tiers; negative heights are listed separately as cutting.</p>
    <p><strong>{entered} entered Top RL chainages · {(classified / 1000).toFixed(3)} km classified · {(length(group('missing')) / 1000).toFixed(3)} km missing levels · {(length(group('unassigned')) / 1000).toFixed(3)} km outside tiers</strong></p>
    <p>Alignment accounted for: {(accounted / 1000).toFixed(3)} km. Bank-top RL: {rl(bankAt(0))} m at {km(0)} → {rl(bankAt(accounted))} m at {km(accounted)}. Chapter 1 bed slope: {data.design.bedSlope > 0 ? `1 in ${data.design.bedSlope}` : 'flat'}.</p>
    <p>Each interval uses its starting chainage’s height tier. Boundaries use entered Soil Strata and Sections chainages. Expand a reach to inspect every interval and its levels. Missing levels are shown as a gap. Section geometry uses surveyed bank ground.</p>
    {tiers.map(tier => <ReachGroup key={tier.id} title={tier.name} reaches={reaches.filter(r => r.tierId === tier.id)} empty="No positive fill reaches in this tier." />)}
    <ReachGroup title="Cutting reaches · strata Top RL above bank top" reaches={group('cut')} empty="No cutting reaches." />
    <p>Cutting rows show height above bank top. Excavation depth to canal bed also includes full supply depth and freeboard.</p>
    {group('level').length > 0 && <ReachGroup title="At bank-top level · zero fill" reaches={group('level')} empty="" />}
    {group('unassigned').length > 0 && <ReachGroup title="Positive fill outside configured tiers" reaches={group('unassigned')} empty="" />}
    {group('missing').length > 0 && <ReachGroup title="Missing Top RL or design level · includes uninvestigated ends" reaches={group('missing')} empty="" />}
  </section>
}
