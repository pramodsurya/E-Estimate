import { useMemo, useState } from 'react'
import type { CanalBankProtectionConfig, CanalBankReachProtection, CanalData } from '../../../../types/project'
import { canalDesignProfile, canalGroundLevelAt, defaultCanalBankDesignConfig, orderedCanalSections } from '../../../../lib/canal'
import { bankProtectionForReach, bankProtectionItem, bankProtectionQuantities, bankProtectionSectionAt, bankProtectionSegments, saveBankReachProtection, type BankProtectionQuantity } from '../../../../lib/canalBankProtection'
import { canalBankReaches, formatCanalReachChainage, type CanalAssignedBankReach } from '../../../../lib/canalTierReaches'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import './canalBankProtection.css'
import CanalBankReachPicker from './CanalBankReachPicker'

const number = (value: number): string => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const range = (reach: { from: number; to: number }): string => `From Ch ${formatCanalReachChainage(reach.from)} → To Ch ${formatCanalReachChainage(reach.to)}`
type Treatments = Pick<CanalBankReachProtection, 'slopes' | 'berms'>

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }): JSX.Element {
  return <fieldset className="canal-protection-question"><legend>{label}</legend><div className="canal-protection-choices">{options.map(([id, text]) => <button type="button" key={id} aria-pressed={id === value} className={id === value ? 'selected' : ''} onClick={() => onChange(id)}><span aria-hidden="true">{id === value ? '●' : '○'}</span>{text}</button>)}</div></fieldset>
}

const treatmentLabel = (spec: CanalBankProtectionConfig): string => spec.kind === 'stone' ? 'Stone pitching' : spec.kind === 'grass' ? 'Grass turfing' : 'No protection'

function TreatmentSettings({ label, spec, mode, onChange }: { label: string; spec: CanalBankProtectionConfig; mode: CanalData['mode']; onChange: (spec: CanalBankProtectionConfig) => void }): JSX.Element {
  const patch = (change: Partial<CanalBankProtectionConfig>): void => {
    const next = { ...spec, ...change }
    if (next.stone === 'khandki') { next.headers = true; next.thickness = next.thickness === 0.45 ? 0.45 : 0.3 }
    if (next.stone === 'rubble' && next.bedding === 'mortar') next.thickness = 0.3
    if (mode === 'new' && next.thickness === 0.225) next.thickness = 0.25
    onChange(next)
  }
  const thicknesses = spec.stone === 'khandki' ? [0.3, 0.45] : spec.bedding === 'mortar' ? [0.3] : mode === 'repair' ? [0.225, 0.25, 0.3, 0.45] : [0.25, 0.3, 0.45]
  return <section className="canal-protection-treatment"><h4>{label}</h4>
    <Choices label="What protection is required?" value={spec.kind} options={[['none', 'No protection'], ['stone', 'Stone pitching'], ['grass', 'Grass turfing']]} onChange={(kind) => patch({ kind })}/>
    {spec.kind === 'stone' && <>
      <Choices label="Which stone is used?" value={spec.stone} options={[['rubble', 'Rubble stone'], ['khandki', 'Khandki stone']]} onChange={(stone) => patch({ stone })}/>
      <Choices label="How are the stones placed?" value={spec.bedding} options={[['dry', 'Dry · packed without mortar'], ['mortar', 'Set in cement mortar 1:5']]} onChange={(bedding) => patch({ bedding })}/>
      <label className="canal-bank-field"><span>Pitching thickness</span><select value={spec.thickness} onChange={(event) => patch({ thickness: Number(event.target.value) })}>{thicknesses.map((value) => <option value={value} key={value}>{value * 100} cm{value === 0.225 ? ' · maintenance only' : ''}</option>)}</select></label>
      {spec.stone === 'rubble' ? <Choices label="Are pin headers required?" value={spec.headers ? 'yes' : 'no'} options={[['yes', 'Yes · 2 per m²'], ['no', 'No']]} onChange={(value) => patch({ headers: value === 'yes' })}/> : <p>Khandki items include 2 pin headers per m².</p>}
    </>}
    {spec.kind === 'grass' && <><p>10 cm grass turfing, including watering for at least 15 days.</p><Choices label="Is sand used for the turfing?" value={spec.sand ? 'yes' : 'no'} options={[['yes', 'With sand'], ['no', 'Without sand']]} onChange={(value) => patch({ sand: value === 'yes' })}/></>}
  </section>
}

function ReachProtectionEditor({ data, side, reach, quantities, onCommit }: { data: CanalData; side: 'left' | 'right'; reach: CanalAssignedBankReach; quantities: BankProtectionQuantity[]; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const saved = bankProtectionForReach(data, side, reach)
  const [draft, setDraft] = useState<Treatments | null>(null)
  const [chainage, setChainage] = useState(reach.from)
  const linked = data.design.bankConfig?.linkSymmetrical
  const selectedRows = quantities.filter(row => linked ? row.from === reach.from && row.to === reach.to && row.tierId === reach.tierId : row.reachId === reach.id && row.side === side)
  const stations = [...new Set([reach.from, ...orderedCanalSections(data).filter(s => s.chainage >= reach.from && s.chainage < reach.to && s.designPopulated !== false && s.ground.length >= 2).map(s => s.chainage), reach.to])].sort((a, b) => a - b)
  const previewChainage = stations.includes(chainage) ? chainage : reach.from
  // Keep survey interpolation and diagram geometry unchanged during local treatment edits.
  const { preview, framed } = useMemo(() => {
    const sample = bankProtectionSectionAt(data, previewChainage)
    // At a shared endpoint show this reach's bank, keeping the opposite independent bank at its actual chainage.
    const midpoint = (reach.from + reach.to) / 2
    const preview = sample ? { ...sample, bankReachLookupChainageBySide: linked ? { left: midpoint, right: midpoint } : { [side]: midpoint } } : undefined
    const profile = preview ? canalDesignProfile(data, preview) : []
    const from = Math.min(...profile.map(p => p.offset)), to = Math.max(...profile.map(p => p.offset))
    const margin = Math.max(2, (to - from) * 0.12)
    const ground = preview && profile.length >= 2 ? [from - margin, ...preview.ground.map(p => p.offset).filter(x => x > from - margin && x < to + margin), to + margin].flatMap(offset => {
      const rl = canalGroundLevelAt(preview.ground, offset)
      return rl == null ? [] : [{ offset, rl }]
    }).sort((a, b) => a.offset - b.offset) : []
    return { preview, framed: preview && ground.length >= 2 ? { ...preview, ground } : preview }
  }, [data, previewChainage, reach.from, reach.to, linked, side])
  return <section className="canal-earthwork-card canal-protection-card">
    <header><h3>{range(reach)} · {linked ? 'Both banks' : `${side === 'left' ? 'Left' : 'Right'} bank`}</h3><p>Protection applies only to this Bank Design reach.</p></header>
    <section className="canal-protection-section"><label className="canal-bank-field"><span>Cross-section chainage</span><select value={previewChainage} onChange={event => setChainage(Number(event.target.value))}>{stations.map(ch => <option value={ch} key={ch}>{formatCanalReachChainage(ch)}</option>)}</select></label>
      {framed ? <><h4>Cross-section at {formatCanalReachChainage(previewChainage)}</h4><CanalSectionDiagram data={data} section={framed}/><p className="canal-protection-help">{data.sections.some(s => s.chainage === previewChainage && s.designPopulated !== false && s.ground.length >= 2) ? 'Uses the saved section ground levels.' : 'Ground interpolated between the adjoining populated sections at this reach boundary.'} The diagram shows the saved protection.</p>
      <div className="canal-protection-colors"><span style={{ color: '#f1bc75' }}>▰ Stone pitching</span><span style={{ color: '#74d68a' }}>▰ Grass turfing</span></div>
      <p className="canal-protection-help">{(linked ? ['left', 'right'] as const : [side]).map(bank => `${bank === 'left' ? 'Left' : 'Right'} berm width ${number(bankProtectionSegments(data, preview!, bank, 'berms').reduce((sum, [a, b]) => sum + Math.abs(b.offset - a.offset), 0))} m`).join(' · ')}</p></> : <p className="canal-protection-pending">No populated section is available at this chainage. Enter ground levels in Sections to show the actual diagram and measure protection.</p>}
    </section>
    {draft ? <>
      <TreatmentSettings label="Outer bank slopes" spec={draft.slopes} mode={data.mode} onChange={slopes => setDraft({ ...draft, slopes })}/>
      <TreatmentSettings label="Berm shelves in this reach" spec={draft.berms} mode={data.mode} onChange={berms => setDraft({ ...draft, berms })}/>
      <p className="canal-protection-help">Berm treatment covers the horizontal shelves that exist in this reach. Crest and road platforms are excluded. Save to recalculate.</p>
      <div className="canal-protection-choices"><button key="save" type="button" onClick={() => { onCommit(current => saveBankReachProtection(current, side, reach, draft)); setDraft(null) }}>Save protection</button><button key="cancel" type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </> : <><div className="canal-protection-saved">{(['slopes', 'berms'] as const).map(surface => {
      const item = bankProtectionItem(saved[surface])
      const area = selectedRows.filter(row => row.surface === surface).reduce((sum, row) => sum + row.area, 0)
      return <div key={surface}><h4>{surface === 'slopes' ? 'Outer bank slopes' : 'Berm shelves'}</h4><strong>{treatmentLabel(saved[surface])}</strong><p>{number(area)} m²{item ? ` · ${item.code}` : ''}</p>{item && <details><summary>SSR description</summary><p>{item.description}</p></details>}</div>
    })}</div><div className="canal-protection-choices"><button key="edit" type="button" onClick={() => setDraft(structuredClone(saved))}>Edit protection</button></div></>}
    <p className="canal-protection-help">Area = average developed slope length or berm width × chainage distance, split at reach and road boundaries.</p>
  </section>
}

export default function CanalBankProtection({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [reachId, setReachId] = useState('')
  const config = data.design.bankConfig ?? defaultCanalBankDesignConfig(data.mode)
  const partition = canalBankReaches(data, side)
  const reaches = partition.filter(r => r.status === 'fill' && r.tierId)
  const selected = reaches.find(r => r.id === reachId) ?? reaches[0]
  const quantities = useMemo(() => bankProtectionQuantities(data), [data])
  return <section className="canal-chapter canal-bank-protection">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Bank Protection</span><h2>Bank Protection</h2><p>Select a Bank Design reach to protect its outer slopes and berm shelves.</p></div></header>
    <div className="canal-protection-context">{config.linkSymmetrical ? 'Linked banks · the same choices apply to both banks.' : 'Independent banks · configure the left and right banks separately.'} Chainages follow the {config.mode === 'manual' ? 'manual reaches' : 'reaches'} saved in Bank Design.</div>
    {!config.linkSymmetrical && <Choices label="Which bank?" value={side} options={[['left', 'Left bank'], ['right', 'Right bank']]} onChange={value => { setSide(value); setReachId('') }}/>}
    {reaches.length ? <>
      <CanalBankReachPicker data={data} side={side} selected={selected} onSelect={r => setReachId(r.id)} status={r => { const spec = bankProtectionForReach(data, side, r); return `Slopes · ${treatmentLabel(spec.slopes)} · Berms · ${treatmentLabel(spec.berms)}` }}/>
      {selected && <ReachProtectionEditor key={`${config.mode}:${config.linkSymmetrical ? 'both' : side}:${selected.id}:${selected.from}:${selected.to}`} data={data} side={side} reach={selected} quantities={quantities} onCommit={onCommit}/>}
    </> : <p className="canal-protection-pending">{config.mode === 'legacy' ? 'Choose programmatic or manual reaches in Bank Design to configure protection by chainage.' : 'Create or assign bund reaches in Bank Design. The same reaches will appear here.'}</p>}
    <section className="canal-earthwork-card canal-protection-card"><h3>All bank protection quantities</h3>{quantities.length ? <div className="canal-protection-table"><table><thead><tr><th>Bank / reach</th><th>Surface</th><th>SSR item</th><th>Area (m²)</th></tr></thead><tbody>{quantities.map(row => <tr key={`${row.side}:${row.reachId}:${row.surface}:${row.code}`}><td>{row.side === 'left' ? 'Left' : 'Right'} · {range(row)}</td><td>{row.surface === 'slopes' ? 'Outer slopes' : 'Berm shelves'}</td><td>{row.code}</td><td>{number(row.area)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Total protected area</th><td>{number(quantities.reduce((sum, row) => sum + row.area, 0))}</td></tr></tfoot></table></div> : <p>Save protection and populate sections to calculate quantities.</p>}</section>
  </section>
}
