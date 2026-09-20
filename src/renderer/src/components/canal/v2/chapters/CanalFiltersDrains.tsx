import { useMemo, useState } from 'react'
import { CircleDot, Droplets, LockKeyhole, Pickaxe, Plus, Trash2, Waves } from 'lucide-react'
import type { CanalData, CanalFilterDrainKind, CanalFilterDrainReach } from '../../../../types/project'
import { canalFilterDrainQuantity, orderedCanalSections } from '../../../../lib/canal'
import { formatChainage } from '../../../../lib/guideWall'
import { newId } from '../../../../lib/tree'
import BundRockToeDiagram from '../../../bund/BundRockToeDiagram'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import SsrCode from '../../../templates/SsrCode'

type System = NonNullable<CanalFilterDrainReach['system']>
type PlugLocation = NonNullable<CanalFilterDrainReach['plugLocations']>[number]
type Sections = ReturnType<typeof orderedCanalSections>

const n2 = (value: number): string => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isToe = (row: CanalFilterDrainReach): boolean => row.system === 'toe-drain' || ['5-7', '5-12', '5-13'].includes(row.kind)
const isBed = (row: CanalFilterDrainReach): boolean => row.system === 'bed-drainage' || row.kind === '5-8'
const isPlug = (row: CanalFilterDrainReach): boolean => row.system === 'porous-plug' || row.kind === '5-9'
const isRock = (row: CanalFilterDrainReach): boolean => row.system === 'rock-toe' || row.kind === '5-6' || row.kind === '5-11'

const SSR = {
  '5-7': { unit: 'CUM', description: 'Providing and constructing longitudinal and cross graded filter drains, laid to required slopes and compacted.', dimensions: 'Variable clear width and depth', materials: 'Sand; 20–10 mm coarse aggregate; 10 mm-down coarse aggregate', basis: 'Length × clear width × depth' },
  '5-8': { unit: 'MT', description: 'Laying longitudinal and transverse drains in the canal bed, including excavation and filling.', dimensions: 'SSR source: 600 × 600 × 750 mm', materials: '12–40 mm HG machine-crushed metal and sand', basis: 'Physical running length; published SSR source unit retained as MT' },
  '5-9': { unit: 'PLUG', description: 'Providing 100 mm diameter porous precast cement-concrete plugs in a local filter pocket.', dimensions: 'Pocket 600 × 600 × 750 mm; plug Ø100 × 300 mm', materials: 'Precast porous CC plug with sand/aggregate local filter', basis: 'Number of plugs' },
  '5-12': { unit: 'SQM', description: 'Providing filter media with two layers of 200 gsm polypropylene nonwoven fabric and 200 mm aggregate.', dimensions: 'Aggregate 200 mm; two fabric layers', materials: '20 mm-down aggregate and 200 gsm nonwoven fabric', basis: 'Reach length × toe-drain width' },
  '5-13': { unit: 'SQM', description: 'Providing filter media with two layers of 250 gsm polypropylene nonwoven fabric and 200 mm aggregate.', dimensions: 'Aggregate 200 mm; two fabric layers', materials: '20 mm-down aggregate and 250 gsm nonwoven fabric', basis: 'Reach length × toe-drain width' }
} as const
type DrainKind = keyof typeof SSR

function makeWork(kind: CanalFilterDrainKind, system: System, data: CanalData, orientation: CanalFilterDrainReach['orientation'] = 'longitudinal'): CanalFilterDrainReach {
  const fabric = kind === '5-12' || kind === '5-13'
  return {
    id: newId(), system, kind, orientation, fromChainage: 0, toChainage: data.lengthM, coverage: 'entire',
    side: system === 'toe-drain' ? 'left' : system === 'rock-toe' ? 'both' : 'bed',
    width: fabric ? 0.6 : kind === '5-6' || kind === '5-11' ? 0 : 0.6,
    depth: kind === '5-6' || kind === '5-11' ? 1.2 : kind === '5-8' || kind === '5-9' ? 0.75 : fabric ? 0.2 : 0.6,
    thickness: fabric ? 0.2 : 0.1, spacing: 25, count: 1,
    rockToeTopWidth: 0, rockToeInnerSlope: 1, crossDrainLength: data.design.bedWidth,
    placementMode: kind === '5-9' || orientation === 'cross' ? 'spacing' : undefined,
    manualChainages: [], plugLocations: kind === '5-9' ? ['bed'] : undefined,
    offsetMode: kind === '5-8' && orientation === 'longitudinal' ? 'centre' : undefined,
    offset: 0, material: { code: `IRR-CAW-${kind}` }
  }
}

function NumberInput({ label, value, onChange, min = 0, disabled = false, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; disabled?: boolean; suffix?: string }): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><div className="canal-input-with-suffix"><input type="number" min={min} step="any" disabled={disabled} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value)))} />{suffix && <b>{suffix}</b>}</div></label>
}

function Locked({ label, value, source = 'SSR' }: { label: string; value: string; source?: string }): JSX.Element {
  return <div className="canal-locked-value"><span>{label}</span><strong>{value}</strong><small><LockKeyhole size={12} /> {source}</small></div>
}

function ReachFields({ row, sections, onChange }: { row: CanalFilterDrainReach; sections: Sections; onChange: (patch: Partial<CanalFilterDrainReach>) => void }): JSX.Element {
  const last = sections.at(-1)?.chainage ?? row.toChainage
  return <div className="canal-reach-fields"><div className="canal-inline-options"><label><input type="radio" checked={(row.coverage ?? 'selected') === 'entire'} onChange={() => onChange({ coverage: 'entire', fromChainage: 0, toChainage: last })} /> Entire canal reach</label><label><input type="radio" checked={row.coverage === 'selected'} onChange={() => onChange({ coverage: 'selected' })} /> Selected reach</label></div><div className="canal-bank-grid"><label className="canal-bank-field"><span>Start chainage</span><select disabled={row.coverage !== 'selected'} value={row.fromChainage} onChange={(event) => onChange({ fromChainage: Number(event.target.value) })}>{sections.map((section) => <option key={section.id} value={section.chainage}>{formatChainage(section.chainage)}</option>)}</select></label><label className="canal-bank-field"><span>End chainage</span><select disabled={row.coverage !== 'selected'} value={row.toChainage} onChange={(event) => onChange({ toChainage: Number(event.target.value) })}>{sections.map((section) => <option key={section.id} value={section.chainage}>{formatChainage(section.chainage)}</option>)}</select></label></div><div className="canal-calculated-line"><span>Calculated length</span><strong>{n2(Math.max(0, row.toChainage - row.fromChainage))} m <LockKeyhole size={12} /></strong></div></div>
}

function Details({ kind, quantity }: { kind: DrainKind; quantity: number }): JSX.Element {
  const item = SSR[kind]
  return <details className="canal-ssr-details"><summary>View SSR details</summary><dl><dt>SSR code</dt><dd>IRR-CAW-{kind}</dd><dt>Original description</dt><dd>{item.description}</dd><dt>Published unit</dt><dd>{item.unit}</dd><dt>Fixed dimensions</dt><dd>{item.dimensions}</dd><dt>Materials</dt><dd>{item.materials}</dd><dt>Quantity basis</dt><dd>{item.basis}</dd><dt>Current quantity</dt><dd>{n2(quantity)} {item.unit}</dd></dl></details>
}

function ManualLocations({ values, from, to, noun, onChange }: { values: number[]; from: number; to: number; noun: string; onChange: (values: number[]) => void }): JSX.Element {
  const [next, setNext] = useState(from)
  const add = (): void => {
    if (next >= from && next <= to) onChange([...new Set([...values, next])].sort((a, b) => a - b))
  }
  return <div className="canal-manual-chainages"><strong>{noun} locations</strong><div className="canal-chainage-chips">{values.map((value) => <span key={value}>{formatChainage(value)}<button type="button" onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}</div><div><NumberInput label="Chainage (m)" value={next} min={from} onChange={setNext} /><button className="btn secondary" type="button" onClick={add}><Plus size={13} /> Add {noun}</button></div></div>
}

function ToeSketch({ fabric }: { fabric: boolean }): JSX.Element {
  return <svg className="canal-system-sketch" viewBox="0 0 520 210"><defs><pattern id="toeAgg" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="#67e8f9" /><circle cx="11" cy="10" r="2" fill="#67e8f9" /></pattern></defs><path d="M20 160 H250 L355 45 L445 160 H500" fill="none" stroke="#5eb4ea" strokeWidth="6" /><path d="M444 160 H495 V122 H462 Z" fill="url(#toeAgg)" stroke="#22d3ee" strokeWidth="4" />{fabric && <path d="M457 119 H500 V165 H440" fill="none" stroke="#c084fc" strokeWidth="4" />}<text x="214" y="29">EMBANKMENT</text><text x="344" y="194">{fabric ? '2 fabric layers · 200 mm aggregate' : 'graded filter zone'}</text></svg>
}

function BedPlan({ longitudinal, transverse, count }: { longitudinal: boolean; transverse: boolean; count: number }): JSX.Element {
  return <svg className="canal-system-sketch" viewBox="0 0 520 210"><text x="22" y="26">FLOW →</text><path d="M20 50 H500 M20 180 H500" stroke="#5eb4ea" strokeWidth="4" />{longitudinal && <path d="M20 115 H500" stroke="#22d3ee" strokeWidth="9" />}{transverse && Array.from({ length: Math.min(9, count) }, (_, i) => <path key={i} d={`M${55 + i * 45} 52 V178`} stroke="#67e8f9" strokeWidth="7" />)}<text x="22" y="204">centre line = longitudinal · bars = transverse</text></svg>
}

function PlugSketch(): JSX.Element {
  return <svg className="canal-system-sketch" viewBox="0 0 520 210"><defs><pattern id="plugAgg" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="#67e8f9" /><circle cx="10" cy="10" r="2" fill="#67e8f9" /></pattern></defs><path d="M20 55 H500" stroke="#5eb4ea" strokeWidth="4" /><rect x="150" y="55" width="220" height="125" fill="url(#plugAgg)" stroke="#22d3ee" strokeWidth="4" /><path d="M258 112 H455" stroke="#f1f5f9" strokeWidth="18" /><path d="M258 112 H455" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4 7" /><text x="166" y="83">600 × 600 × 750 pocket</text><text x="374" y="102">Ø100 × 300 plug</text></svg>
}

export default function CanalFiltersDrains({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const sections = useMemo(() => orderedCanalSections(data), [data])
  const rows = data.filterDrainReaches
  const rockRows = rows.filter(isRock), toeRows = rows.filter(isToe), bedRows = rows.filter(isBed), plugRows = rows.filter(isPlug)
  const [previewId, setPreviewId] = useState(sections[0]?.id ?? '')
  const preview = sections.find((section) => section.id === previewId) ?? sections[0]
  const replace = (predicate: (row: CanalFilterDrainReach) => boolean, replacements: CanalFilterDrainReach[]): void => onCommit((current) => ({ ...current, filterDrainReaches: [...current.filterDrainReaches.filter((row) => !predicate(row)), ...replacements] }))
  const update = (id: string, patch: Partial<CanalFilterDrainReach>): void => onCommit((current) => ({ ...current, filterDrainReaches: current.filterDrainReaches.map((row) => row.id === id ? { ...row, ...patch } : row) }))
  const remove = (id: string): void => onCommit((current) => ({ ...current, filterDrainReaches: current.filterDrainReaches.filter((row) => row.id !== id) }))
  const append = (row: CanalFilterDrainReach): void => onCommit((current) => ({ ...current, filterDrainReaches: [...current.filterDrainReaches, row] }))
  const rock = rockRows.find((row) => row.kind === '5-6'), rockFilter = rockRows.find((row) => row.kind === '5-11')
  const patchRock = (patch: Partial<CanalFilterDrainReach>): void => onCommit((current) => ({ ...current, filterDrainReaches: current.filterDrainReaches.map((row) => isRock(row) ? { ...row, ...patch } : row) }))
  const long = bedRows.find((row) => row.orientation === 'longitudinal'), cross = bedRows.find((row) => row.orientation === 'cross')
  const plug = plugRows[0]
  const conflicts = useMemo(() => toeRows.flatMap((a, i) => toeRows.slice(i + 1).flatMap((b) => {
    const from = Math.max(a.fromChainage, b.fromChainage), to = Math.min(a.toChainage, b.toChainage)
    return a.side === b.side && a.kind !== b.kind && to > from ? [{ a, b, from, to }] : []
  })), [toeRows])

  const setToeBank = (row: CanalFilterDrainReach, side: CanalFilterDrainReach['side']): void => {
    if (side !== 'both') return update(row.id, { side })
    onCommit((current) => ({ ...current, filterDrainReaches: current.filterDrainReaches.flatMap((item) => item.id === row.id ? [{ ...row, id: newId(), side: 'left' }, { ...row, id: newId(), side: 'right' }] : [item]) }))
  }
  const toggleRock = (enabled: boolean): void => enabled ? replace(isRock, [makeWork('5-6', 'rock-toe', data), makeWork('5-11', 'rock-toe', data)]) : replace(isRock, [])
  const toggleBed = (enabled: boolean): void => enabled ? replace(isBed, [makeWork('5-8', 'bed-drainage', data)]) : replace(isBed, [])
  const toggleArrangement = (orientation: 'longitudinal' | 'cross', enabled: boolean): void => {
    const current = orientation === 'longitudinal' ? long : cross
    if (!enabled && current) remove(current.id)
    else if (enabled && !current) append(makeWork('5-8', 'bed-drainage', data, orientation))
  }
  const cardHeader = (icon: JSX.Element, title: string, subtitle: string, enabled: boolean, toggle: (enabled: boolean) => void): JSX.Element => <header><span className="canal-work-icon">{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><label className="canal-card-switch"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} /><span>{enabled ? 'Included' : 'Not included'}</span></label></header>

  return <section className="canal-chapter canal-drainage-designer">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Rock Toe &amp; Drainage</span><h2>Physical drainage systems</h2><p>Select the engineering system first. SSR mapping, fixed dimensions and quantities follow automatically.</p></div></header>

    <section className={`canal-independent-work-card rocktoe${rock ? ' is-enabled' : ''}`}>
      {cardHeader(<Pickaxe size={20} />, 'Rock Toe', 'Bund-style toe protection continuing the bank’s outer batter.', Boolean(rock), toggleRock)}
      {rock && <div className="canal-work-card-body canal-designer-split"><div className="canal-control-stack"><label className="canal-bank-field"><span>Bank</span><select value={rock.side} onChange={(event) => patchRock({ side: event.target.value as CanalFilterDrainReach['side'] })}><option value="left">Left bank</option><option value="right">Right bank</option><option value="both">Both banks</option></select></label><NumberInput label="Crest width" value={rock.rockToeTopWidth ?? 0} suffix="m" onChange={(rockToeTopWidth) => patchRock({ rockToeTopWidth })} /><NumberInput label="Height" value={rock.depth} suffix="m" onChange={(depth) => patchRock({ depth })} /><NumberInput label="Inner slope (H : 1V)" value={rock.rockToeInnerSlope ?? 1} onChange={(rockToeInnerSlope) => patchRock({ rockToeInnerSlope })} /><Locked label="Outer slope" value={`${rock.side === 'left' ? data.design.leftBankOuterSlope : rock.side === 'right' ? data.design.rightBankOuterSlope : Math.max(data.design.leftBankOuterSlope, data.design.rightBankOuterSlope)} H : 1V`} source="Bank design" /><label className="canal-check-row"><input type="checkbox" checked={Boolean(rockFilter)} onChange={(event) => event.target.checked ? append({ ...makeWork('5-11', 'rock-toe', data), side: rock.side, depth: rock.depth, rockToeTopWidth: rock.rockToeTopWidth, rockToeInnerSlope: rock.rockToeInnerSlope }) : rockFilter && remove(rockFilter.id)} /> Graded filter below and behind</label>{rockFilter && <div className="canal-fixed-spec-grid"><Locked label="Below rock toe" value="1.00 m total" source="IRR-CAW-5-11" /><Locked label="Behind rock toe" value="0.50 m total" source="IRR-CAW-5-11" /></div>}</div><BundRockToeDiagram topWidth={rock.rockToeTopWidth ?? 0} innerSlope={rock.rockToeInnerSlope ?? 1} outerSlope={rock.side === 'left' ? data.design.leftBankOuterSlope : data.design.rightBankOuterSlope} height={rock.depth} excavationDepth={0} filterEnabled={Boolean(rockFilter)} /></div>}
      <footer>{rock ? <div className="canal-card-quantity-list"><span><SsrCode code="IRR-CAW-5-6" /><strong>{n2(canalFilterDrainQuantity(data, rock).quantity)} CUM</strong></span>{rockFilter && <span><SsrCode code="IRR-CAW-5-11" /><strong>{n2(canalFilterDrainQuantity(data, rockFilter).quantity)} CUM</strong></span>}</div> : <span>Enable to add Bund-style rock toe protection.</span>}</footer>
    </section>

    <div className="canal-drainage-heading"><span>DRAINAGE</span><h3>Independent drainage systems</h3><p>Toe drains, bed drains and porous outlets may coexist over the same chainages.</p></div>

    <section className={`canal-independent-work-card drainage toe${toeRows.length ? ' is-enabled' : ''}`}>
      {cardHeader(<Droplets size={20} />, 'Toe Drain', 'Controls seepage at the land-side toe of the embankment.', toeRows.length > 0, (enabled) => enabled ? append(makeWork('5-7', 'toe-drain', data)) : replace(isToe, []))}
      {toeRows.length > 0 && <div className="canal-work-card-body canal-object-list">{conflicts.map((conflict) => <div className="canal-validation warning canal-conflict" key={`${conflict.a.id}-${conflict.b.id}`}><span>⚠ Different toe-drain methods overlap on the {conflict.a.side} bank between Ch {formatChainage(conflict.from)} and {formatChainage(conflict.to)}.</span><div><button className="btn ghost" onClick={() => update(conflict.a.id, conflict.a.fromChainage < conflict.b.fromChainage ? { toChainage: conflict.b.fromChainage, coverage: 'selected' } : { fromChainage: conflict.b.toChainage, coverage: 'selected' })}>Trim reach A</button><button className="btn ghost" onClick={() => update(conflict.b.id, conflict.b.fromChainage < conflict.a.fromChainage ? { toChainage: conflict.a.fromChainage, coverage: 'selected' } : { fromChainage: conflict.a.toChainage, coverage: 'selected' })}>Trim reach B</button></div></div>)}{toeRows.map((row, index) => {
        const quantity = canalFilterDrainQuantity(data, row).quantity, fabric = row.kind === '5-12' || row.kind === '5-13'
        const invalid = row.fromChainage >= row.toChainage || row.width <= 0 || (!fabric && row.depth <= 0)
        return <article className="canal-design-object" key={row.id}><header><div><b>Toe-drain reach {index + 1}</b><span>{row.side === 'left' ? 'Left bank' : 'Right bank'} · Ch {formatChainage(row.fromChainage)}–{formatChainage(row.toChainage)}</span></div><button className="btn ghost" onClick={() => remove(row.id)}><Trash2 size={14} /> Remove</button></header><div className="canal-designer-split"><div className="canal-control-stack"><label className="canal-bank-field"><span>Bank</span><select value={row.side} onChange={(event) => setToeBank(row, event.target.value as CanalFilterDrainReach['side'])}><option value="left">Left bank</option><option value="right">Right bank</option><option value="both">Both banks — create separate objects</option></select></label><ReachFields row={row} sections={sections} onChange={(patch) => update(row.id, patch)} /><fieldset className="canal-choice-group"><legend>Construction method</legend><label><input type="radio" checked={row.kind === '5-7'} onChange={() => update(row.id, { kind: '5-7', depth: 0.6, material: { code: 'IRR-CAW-5-7' } })} /> Conventional graded filter drain</label><label><input type="radio" checked={fabric} onChange={() => update(row.id, { kind: '5-12', depth: 0.2, thickness: 0.2, material: { code: 'IRR-CAW-5-12' } })} /> Geotextile + aggregate filter</label></fieldset>{fabric && <fieldset className="canal-choice-group compact"><legend>Filter fabric</legend><label><input type="radio" checked={row.kind === '5-12'} onChange={() => update(row.id, { kind: '5-12', material: { code: 'IRR-CAW-5-12' } })} /> 200 gsm</label><label><input type="radio" checked={row.kind === '5-13'} onChange={() => update(row.id, { kind: '5-13', material: { code: 'IRR-CAW-5-13' } })} /> 250 gsm</label></fieldset>}<NumberInput label={fabric ? 'Toe-drain width' : 'Clear width'} value={row.width} suffix="m" onChange={(width) => update(row.id, { width })} />{!fabric && <NumberInput label="Depth" value={row.depth} suffix="m" onChange={(depth) => update(row.id, { depth })} />}{fabric && <div className="canal-fixed-spec-grid"><Locked label="Aggregate thickness" value="0.20 m" source={`IRR-CAW-${row.kind}`} /><Locked label="Fabric layers" value="2" /><Locked label="Aggregate" value="20 mm down" /></div>}<div className={`canal-validation ${invalid ? 'error' : 'success'}`}>{invalid ? '✕ Enter a valid width, depth and reach.' : `✓ Valid reach · fixed values locked · quantity maps to ${fabric ? 'SQM' : 'CUM'}.`}</div></div><div className="canal-preview-stack"><ToeSketch fabric={fabric} /><div className="canal-live-quantity"><span>SSR quantity</span><SsrCode code={`IRR-CAW-${row.kind}`} /><strong>{n2(quantity)} {SSR[row.kind as DrainKind].unit}</strong>{fabric && <small>Aggregate {n2(quantity * .2)} m³ · fabric {n2(quantity * 2.1)} m²</small>}</div><Details kind={row.kind as DrainKind} quantity={quantity} /></div></div></article>
      })}<button className="btn secondary canal-add-object" onClick={() => append(makeWork('5-7', 'toe-drain', data))}><Plus size={14} /> Add another reach</button></div>}
      <footer>{toeRows.length ? <span>{toeRows.length} physical object{toeRows.length === 1 ? '' : 's'} · identical SSR codes aggregate in BOQ</span> : <span>Enable to design a conventional or geotextile toe drain.</span>}</footer>
    </section>

    <section className={`canal-independent-work-card drainage bed${bedRows.length ? ' is-enabled' : ''}`}>
      {cardHeader(<Waves size={20} />, 'Bed Drainage', 'Longitudinal and transverse drains within the canal bed.', bedRows.length > 0, toggleBed)}
      {bedRows.length > 0 && <div className="canal-work-card-body canal-designer-split"><div className="canal-control-stack"><fieldset className="canal-choice-group"><legend>Arrangement</legend><label><input type="checkbox" checked={Boolean(long)} onChange={(event) => toggleArrangement('longitudinal', event.target.checked)} /> Longitudinal drain</label><label><input type="checkbox" checked={Boolean(cross)} onChange={(event) => toggleArrangement('cross', event.target.checked)} /> Transverse drains</label></fieldset>{long && <div className="canal-subsystem"><h4>Longitudinal drain</h4><label className="canal-bank-field"><span>Position</span><select value={long.offsetMode ?? 'centre'} onChange={(event) => update(long.id, { offsetMode: event.target.value as CanalFilterDrainReach['offsetMode'] })}><option value="centre">Centre</option><option value="left">Offset left</option><option value="right">Offset right</option><option value="custom">Custom offset</option></select></label>{long.offsetMode === 'custom' && <NumberInput label="Offset from centre" value={long.offset ?? 0} suffix="m" onChange={(offset) => update(long.id, { offset })} />}<ReachFields row={long} sections={sections} onChange={(patch) => update(long.id, patch)} /></div>}{cross && <div className="canal-subsystem"><h4>Transverse drains</h4><ReachFields row={cross} sections={sections} onChange={(patch) => update(cross.id, patch)} /><fieldset className="canal-choice-group compact"><legend>Placement</legend><label><input type="radio" checked={cross.placementMode !== 'manual'} onChange={() => update(cross.id, { placementMode: 'spacing' })} /> By spacing</label><label><input type="radio" checked={cross.placementMode === 'manual'} onChange={() => update(cross.id, { placementMode: 'manual' })} /> Manual chainages</label></fieldset>{cross.placementMode === 'manual' ? <ManualLocations values={cross.manualChainages ?? []} from={cross.fromChainage} to={cross.toChainage} noun="drain" onChange={(manualChainages) => update(cross.id, { manualChainages })} /> : <NumberInput label="Spacing" value={cross.spacing} min={.01} suffix="m" onChange={(spacing) => update(cross.id, { spacing })} />}</div>}<div className="canal-fixed-spec-grid"><Locked label="Nominal width" value="0.60 m" source="Validated geometry" /><Locked label="Nominal depth" value="0.75 m" source="Validated geometry" /></div></div><div className="canal-preview-stack"><BedPlan longitudinal={Boolean(long)} transverse={Boolean(cross)} count={cross ? (cross.placementMode === 'manual' ? cross.manualChainages?.length ?? 0 : Math.floor((cross.toChainage - cross.fromChainage) / Math.max(.01, cross.spacing)) + 1) : 0} /><div className="canal-live-quantity"><span>Published SSR quantity</span><SsrCode code="IRR-CAW-5-8" /><strong>{n2(bedRows.reduce((sum, row) => sum + canalFilterDrainQuantity(data, row).quantity, 0))} MT</strong><small>Physical running lengths remain available to the geometry engine.</small></div><Details kind="5-8" quantity={bedRows.reduce((sum, row) => sum + canalFilterDrainQuantity(data, row).quantity, 0)} /></div></div>}
      <footer>{bedRows.length ? <span>IRR-CAW-5-8 · original 600 × 600 × 750 mm source dimension retained</span> : <span>Enable to add longitudinal and/or transverse bed drains.</span>}</footer>
    </section>

    <section className={`canal-independent-work-card drainage plugs${plug ? ' is-enabled' : ''}`}>
      {cardHeader(<CircleDot size={20} />, 'Local Filter / Porous CC Plug', 'Discrete local seepage outlet in the canal bed or sides.', Boolean(plug), (enabled) => enabled ? replace(isPlug, [makeWork('5-9', 'porous-plug', data, 'local')]) : replace(isPlug, []))}
      {plug && (() => { const quantity = canalFilterDrainQuantity(data, plug).quantity, locations = plug.plugLocations ?? []; return <div className="canal-work-card-body canal-designer-split"><div className="canal-control-stack"><ReachFields row={plug} sections={sections} onChange={(patch) => update(plug.id, patch)} /><fieldset className="canal-choice-group"><legend>Installation location</legend>{([['bed', 'Canal bed'], ['left', 'Left side'], ['right', 'Right side']] as Array<[PlugLocation, string]>).map(([value, label]) => <label key={value}><input type="checkbox" checked={locations.includes(value)} onChange={(event) => update(plug.id, { plugLocations: event.target.checked ? [...locations, value] : locations.filter((item) => item !== value) })} /> {label}</label>)}</fieldset><fieldset className="canal-choice-group compact"><legend>Placement method</legend><label><input type="radio" checked={plug.placementMode === 'spacing'} onChange={() => update(plug.id, { placementMode: 'spacing' })} /> By spacing</label><label><input type="radio" checked={plug.placementMode === 'count'} onChange={() => update(plug.id, { placementMode: 'count' })} /> By number</label><label><input type="radio" checked={plug.placementMode === 'manual'} onChange={() => update(plug.id, { placementMode: 'manual' })} /> Manual chainages</label></fieldset>{plug.placementMode === 'manual' ? <ManualLocations values={plug.manualChainages ?? []} from={plug.fromChainage} to={plug.toChainage} noun="plug" onChange={(manualChainages) => update(plug.id, { manualChainages })} /> : plug.placementMode === 'count' ? <NumberInput label="Number per selected location" value={plug.count} min={1} onChange={(count) => update(plug.id, { count: Math.round(count) })} /> : <NumberInput label="Spacing" value={plug.spacing} min={.01} suffix="m" onChange={(spacing) => update(plug.id, { spacing })} />}<div className="canal-fixed-spec-grid"><Locked label="Plug" value="Ø100 × 300 mm" source="IRR-CAW-5-9" /><Locked label="Local filter pocket" value="600 × 600 × 750 mm" source="IRR-CAW-5-9" /><Locked label="Pocket excavation" value="0.27 m³ / plug" source="Calculated" /></div><div className={`canal-validation ${locations.length ? 'success' : 'error'}`}>{locations.length ? `✓ ${quantity} plugs across ${locations.length} selected location${locations.length === 1 ? '' : 's'}.` : '✕ Select at least one installation location.'}</div></div><div className="canal-preview-stack"><PlugSketch /><div className="canal-live-quantity"><span>SSR quantity</span><SsrCode code="IRR-CAW-5-9" /><strong>{n2(quantity)} PLUG</strong></div><Details kind="5-9" quantity={quantity} /></div></div> })()}
      <footer>{plug ? <span>Discrete filter pocket with porous CC outlet — not a toe drain</span> : <span>Enable to place discrete local porous outlets.</span>}</footer>
    </section>

    {preview && <section className="canal-finished-section-preview"><header><div><span className="canal-step-badge">✓</span><div><strong>Finished section after adding works</strong><small>Select a section to inspect the combined result.</small></div></div><label className="canal-bank-field"><span>Section</span><select value={preview.id} onChange={(event) => setPreviewId(event.target.value)}>{sections.map((section) => <option key={section.id} value={section.id}>Ch {formatChainage(section.chainage)}</option>)}</select></label></header><CanalSectionDiagram data={data} section={preview} filterDrainWorks={rows.filter((row) => preview.chainage >= row.fromChainage && preview.chainage <= row.toChainage)} /><div className="canal-preview-legend"><span className="rocktoe">Rock toe / graded filter</span><span className="drainage">Toe drain, bed drainage and local filter</span></div></section>}
  </section>
}
