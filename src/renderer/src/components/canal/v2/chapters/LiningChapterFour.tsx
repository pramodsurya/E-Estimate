import { useState } from 'react'
import type { CanalData, CanalFilterDrainReach, CanalLiningReach, CanalLiningSurface, CanalReliefChapter, CanalReliefOutlet } from '../../../../types/project'
import { canalFilterDrainQuantity } from '../../../../lib/canal'
import { measureCnsReach } from '../../../../lib/canalCns'
import { chapterSurfaces, measureLiningChapter, normalizeLiningChapter } from '../../../../lib/canalLiningChapter'
import { liningCatalogueItem } from '../../../../lib/canalLiningCatalogue'
import { defaultReliefChapter, drainQuantityWithinReach, GI_RELIEF_CODES, measureReliefChapter, newReliefOutlet, normalizeReliefChapter, reliefDrainWorksForReach, reliefOutletLocations, reliefSurfaceName } from '../../../../lib/canalRelief'
import { newId } from '../../../../lib/tree'

const n = (value: number): string => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const boolOptions = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }]

function NumberField({ label, value, onChange, unit = '', min = 0, step = 'any' }: { label: string; value: number | null; onChange: (value: number | null) => void; unit?: string; min?: number; step?: string }): JSX.Element {
  return <label className="cns-number"><span>{label}</span><div><input type="number" min={min} step={step} value={value ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} />{unit && <span>{unit}</span>}</div></label>
}

function ReliefFigure({ kind, rock = false, pocket = false }: { kind: 'bed' | 'plug' | 'gi' | 'pvc'; rock?: boolean; pocket?: boolean }): JSX.Element {
  const title = kind === 'bed' ? 'Drain below the lined canal bed' : kind === 'plug' ? 'Porous plug through the lining' : kind === 'gi' ? 'GI pressure-relief pipe through the lining' : 'PVC weep-hole pipe through the lining'
  return <figure className="relief-figure"><svg viewBox="0 0 520 210" role="img" aria-label={title}>
    <defs><marker id={`relief-arrow-${kind}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="#66cbe5" /></marker></defs>
    <rect x="40" y="103" width="440" height="16" fill="#9bb7c7" /><text x="45" y="94" fill="#dceaf0" fontSize="12">CANAL LINING</text>
    <rect x="40" y="120" width="440" height="70" fill={rock ? '#59636b' : '#6c604e'} /><text x="420" y="178" fill="#e2e5e7" fontSize="12">{rock ? 'ROCK' : 'SOIL'}</text>
    {kind === 'bed' && <><rect x="185" y="124" width="150" height="52" fill="#58929e" stroke="#a7e5e8" strokeWidth="2" /><circle cx="207" cy="140" r="5" fill="#c9e3d1" /><circle cx="236" cy="155" r="6" fill="#c9e3d1" /><circle cx="270" cy="140" r="5" fill="#c9e3d1" /><circle cx="306" cy="155" r="6" fill="#c9e3d1" /><text x="260" y="62" textAnchor="middle" fill="#dceaf0" fontSize="12">AGGREGATE + SAND DRAIN</text><path d="M260 68 V120" stroke="#66cbe5" strokeWidth="2" markerEnd={`url(#relief-arrow-${kind})`} /><text x="43" y="203" fill="#c5d5dd" fontSize="11">Water is collected along or across the canal bed.</text></>}
    {kind === 'plug' && <><rect x="190" y="125" width="140" height="53" fill="#58929e" stroke="#a7e5e8" strokeWidth="2" /><rect x="249" y="76" width="22" height="73" fill="#ddd7bb" stroke="#f1eccf" strokeWidth="2" /><path d="M260 161 V83" stroke="#66cbe5" strokeWidth="3" markerEnd={`url(#relief-arrow-${kind})`} /><text x="286" y="67" fill="#dceaf0" fontSize="12">POROUS CC PLUG</text><text x="43" y="203" fill="#c5d5dd" fontSize="11">Local filter pocket and excavation are included in CAW 5-9.</text></>}
    {(kind === 'gi' || kind === 'pvc') && <><rect x="249" y="81" width="22" height="77" fill={kind === 'gi' ? '#bdc8ce' : '#ead3a5'} stroke="#e8f0f2" strokeWidth="2" /><path d="M260 165 V89" stroke="#66cbe5" strokeWidth="3" markerEnd={`url(#relief-arrow-${kind})`} /><text x="285" y="70" fill="#dceaf0" fontSize="12">{kind === 'gi' ? 'GI RELIEF PIPE' : 'PVC WEEP PIPE'}</text>{pocket && <><rect x="223" y="132" width="75" height="51" fill="none" stroke="#80d2a0" strokeWidth="3" /><text x="49" y="157" fill="#a8e9b7" fontSize="11">FILTER POCKET</text></>}{rock && <><path d="M260 158 V188" stroke="#f6b767" strokeWidth="5" /><text x="289" y="183" fill="#f6c58b" fontSize="11">DRILLED HOLE</text></>}<text x="43" y="203" fill="#c5d5dd" fontSize="11">Schematic section; pipe length and outlet count come from the selected detail.</text></>}
  </svg><figcaption>{title}. The figure explains the parts; it does not set their size or spacing.</figcaption></figure>
}

function BedDrainPlan({ data, work }: { data: CanalData; work: CanalFilterDrainReach }): JSX.Element {
  const longitudinal = work.orientation === 'longitudinal'
  const length = work.toChainage - work.fromChainage
  const validExtent = Number.isFinite(length) && length > 0
  const manual = [...new Set(work.manualChainages ?? [])].filter(ch => Number.isFinite(ch) && ch >= work.fromChainage && ch <= work.toChainage).sort((a, b) => a - b)
  const spacing = Math.max(0.01, work.spacing)
  const count = !validExtent ? 0 : work.placementMode === 'manual' ? manual.length : Number.isFinite(work.spacing) && work.spacing > 0 ? Math.floor(length / spacing) + 1 : 0
  const shown = Array.from({ length: Math.min(12, count) }, (_, i) => {
    const index = count <= 12 ? i : Math.round(i * (count - 1) / 11)
    return work.placementMode === 'manual' ? manual[index] : work.fromChainage + index * spacing
  })
  const bedWidth = Math.max(0, data.design.bedWidth)
  const offset = work.offsetMode === 'left' ? -bedWidth / 4 : work.offsetMode === 'right' ? bedWidth / 4 : work.offsetMode === 'custom' ? work.offset ?? 0 : 0
  const offsetInsideBed = Number.isFinite(offset) && (bedWidth > 0 ? Math.abs(offset) <= bedWidth / 2 : offset === 0)
  const x = bedWidth > 0 ? 335 + offset / bedWidth * 270 : 335
  const y = (ch: number): number => 55 + (ch - work.fromChainage) / length * 170
  const crossLength = Math.max(0, work.crossDrainLength ?? bedWidth)
  const crossWidth = bedWidth > 0 ? Math.min(270, crossLength / bedWidth * 270) : 270
  return <figure className="joint-layout-preview relief-drain-plan"><strong>{longitudinal ? 'Longitudinal drain · along the canal' : 'Cross drains · across the canal bed'}</strong>
    <svg viewBox="0 0 620 255" role="img" aria-label={longitudinal ? 'Top view of the canal bed with a cyan longitudinal drain line at the selected position.' : `Top view of the canal bed with cyan cross-drain lines at the entered chainages. ${count} positions; up to twelve shown.`}>
      <rect x="135" y="48" width="55" height="184" rx="4" fill="#252c32" stroke="#53616c" /><rect x="195" y="48" width="280" height="184" rx="4" fill="#213c3a" stroke="#58b6a8" /><rect x="480" y="48" width="55" height="184" rx="4" fill="#252c32" stroke="#53616c" />
      <text x="162" y="28" textAnchor="middle" fill="#b9c9d6" fontSize="12">Left side</text><text x="335" y="28" textAnchor="middle" fill="#b9c9d6" fontSize="12">Canal bed</text><text x="507" y="28" textAnchor="middle" fill="#b9c9d6" fontSize="12">Right side</text>
      <line x1="335" x2="335" y1="55" y2="225" stroke="#587978" strokeDasharray="4 5" />
      {validExtent && longitudinal && offsetInsideBed && <line x1={x} x2={x} y1="55" y2="225" stroke="#66cbe5" strokeWidth="4" />}
      {!longitudinal && crossLength > 0 && shown.map(ch => <line key={ch} x1={335 - crossWidth / 2} x2={335 + crossWidth / 2} y1={y(ch)} y2={y(ch)} stroke="#66cbe5" strokeWidth="3" />)}
      <text x="8" y="58" fill="#b9c9d6" fontSize="12">Ch {n(work.fromChainage)}</text><text x="8" y="230" fill="#b9c9d6" fontSize="12">Ch {n(work.toChainage)}</text>
      <path d="M568 92 V180 M560 170 L568 180 L576 170" fill="none" stroke="#b9c9d6" strokeWidth="2" /><text x="568" y="77" textAnchor="middle" fill="#b9c9d6" fontSize="11">Chainage</text><text x="568" y="200" textAnchor="middle" fill="#b9c9d6" fontSize="11">increases</text>
    </svg>
    <figcaption><span className="joint-preview-key"><span className="joint-preview-swatch drain" /> Drain line</span><span className="joint-preview-note">{!validExtent ? 'Enter increasing work chainages to show the layout.' : longitudinal ? offsetInsideBed ? 'One line follows the selected bed position for the full work length.' : 'The entered offset lies outside the canal bed.' : count ? `${n(count)} cross-drain positions${count > shown.length ? `; ${shown.length} representative lines shown` : ''}. Each drain is ${n(crossLength)} m long.` : 'Enter positive spacing or specific chainages to show the cross drains.'} Top view; chainage runs from top to bottom.{!longitudinal && crossLength > bedWidth && bedWidth > 0 ? ' The picture is clipped to the bed width; the entered length is used for measurement.' : ''}</span></figcaption>
  </figure>
}

function ManualDrainChainages({ work, onUpdate }: { work: CanalFilterDrainReach; onUpdate: (patch: Partial<CanalFilterDrainReach>) => void }): JSX.Element {
  const [text, setText] = useState((work.manualChainages ?? []).join(', '))
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean)
  const valid = tokens.every(token => /^\d+(?:\.\d+)?$/.test(token) && Number(token) >= work.fromChainage && Number(token) <= work.toChainage)
  return <label className="joint-text-field"><span>Installation chainages (m)</span><textarea value={text} placeholder="For example: 100, 200, 300" onChange={event => { const next = event.target.value; setText(next); const parts = next.trim().split(/[\s,;]+/).filter(Boolean); if (parts.every(token => /^\d+(?:\.\d+)?$/.test(token) && Number(token) >= work.fromChainage && Number(token) <= work.toChainage)) onUpdate({ manualChainages: [...new Set(parts.map(Number))].sort((a, b) => a - b) }) }} />{!valid && <small className="cns-errors">Enter numeric chainages within this work’s start and end.</small>}</label>
}

function DrainCard({ data, reach, work, issue, onUpdate, onRemove }: { data: CanalData; reach: CanalLiningReach; work: CanalFilterDrainReach; issue?: string; onUpdate: (patch: Partial<CanalFilterDrainReach>) => void; onRemove: () => void }): JSX.Element {
  const spansOtherReaches = work.fromChainage < reach.fromChainage || work.toChainage > reach.toChainage
  const plug = work.kind === '5-9'
  const quantity = canalFilterDrainQuantity(data, work)
  const localQuantity = drainQuantityWithinReach(data, work, reach)
  return <div id={`relief-work-${work.id}`} tabIndex={-1} className={`relief-work-card ${issue ? 'joint-problem-target' : ''}`}><div className="relief-work-head"><strong>{plug ? 'Porous CC plugs' : work.orientation === 'cross' ? 'Cross bed drains' : 'Longitudinal bed drain'} · IRR-CAW-{work.kind}</strong><button type="button" className="joint-run-remove" onClick={onRemove}>Remove</button></div>
    {issue && <p className="joint-issue-notice" role="alert">{issue}</p>}
    {spansOtherReaches && <p className="relief-scope-note">This saved work covers more than the selected lining reach. Its start, end and quantity are editable here; changes affect the entire saved work.</p>}
    <div className="cns-thickness relief-scope-fields"><NumberField label="Work starts at Ch" value={work.fromChainage} unit="m" onChange={fromChainage => onUpdate({ fromChainage: fromChainage ?? work.fromChainage, coverage: 'selected' })} /><NumberField label="Work ends at Ch" value={work.toChainage} unit="m" onChange={toChainage => onUpdate({ toChainage: toChainage ?? work.toChainage, coverage: 'selected' })} /></div>
    {plug && <fieldset><legend>Where is a plug placed at each location?</legend><div className="cns-choices">{chapterSurfaces.map(surface => <label key={surface} className={work.plugLocations?.includes(surface) ? 'is-selected' : ''}><input type="checkbox" checked={work.plugLocations?.includes(surface) ?? false} onChange={event => onUpdate({ plugLocations: event.target.checked ? [...(work.plugLocations ?? []), surface] : (work.plugLocations ?? []).filter(item => item !== surface) })} />{reliefSurfaceName(surface)}</label>)}</div></fieldset>}
    {work.orientation === 'longitudinal' && !plug ? <><p className="cns-help">One drain line runs for the entered work length. Choose its position in the bed.</p><label className="relief-select"><span>Position</span><select value={work.offsetMode ?? 'centre'} onChange={event => onUpdate({ offsetMode: event.target.value as CanalFilterDrainReach['offsetMode'] })}><option value="centre">At bed centre</option><option value="left">Left of centre</option><option value="right">Right of centre</option><option value="custom">Custom offset</option></select></label>{work.offsetMode === 'custom' && <div className="cns-thickness"><NumberField label="Offset from centre" value={work.offset ?? 0} unit="m" onChange={offset => onUpdate({ offset: offset ?? 0 })} /></div>}</> : <>
      <fieldset><legend>How are {plug ? 'plug' : 'cross-drain'} locations given?</legend><div className="cns-choices">{([['spacing', 'Regular spacing'], ...(plug ? [['count', 'Approved number']] : []), ['manual', 'Specific chainages']] as Array<['spacing' | 'count' | 'manual', string]>).map(([mode, label]) => <label key={mode} className={work.placementMode === mode ? 'is-selected' : ''}><input type="radio" name={`drain-placement-${work.id}`} checked={work.placementMode === mode} onChange={() => onUpdate({ placementMode: mode })} />{label}</label>)}</div></fieldset>
      {work.placementMode === 'spacing' && <><div className="cns-thickness"><NumberField label="Distance between locations" value={work.spacing} unit="m" min={0.01} onChange={spacing => onUpdate({ spacing: spacing ?? 0 })} /></div><p className="cns-help">First location is at the work start chainage. The last is included only if the spacing reaches it.</p></>}
      {work.placementMode === 'count' && plug && <div className="cns-thickness"><NumberField label="Approved location count" value={work.count} step="1" unit="locations" onChange={count => onUpdate({ count: count ?? 1 })} /></div>}
      {work.placementMode === 'manual' && <ManualDrainChainages key={work.id} work={work} onUpdate={onUpdate} />}
      {!plug && <div className="cns-thickness"><NumberField label="Length of one cross drain" value={work.crossDrainLength ?? data.design.bedWidth} unit="m" onChange={crossDrainLength => onUpdate({ crossDrainLength: crossDrainLength ?? 0 })} /></div>}
    </>}
    {!plug && <BedDrainPlan data={data} work={work} />}
    {plug && <p className="cns-help">One plug is counted on every selected surface at each location. CAW 5-9 includes its local filter and excavation.</p>}
    <div className="cns-included"><strong>Total saved-work quantity: {n(quantity.quantity)} {quantity.unit}</strong>{spansOtherReaches && <span>{localQuantity == null ? ' This record uses an approved total, so its share within this lining reach cannot be inferred.' : ` About ${n(localQuantity)} ${quantity.unit} lies within this lining reach. The full saved work is billed once.`}</span>}</div>
    <details className="lining-ssr"><summary>SSR description</summary><p>{liningCatalogueItem(`IRR-CAW-${work.kind}`)?.description}</p></details>
  </div>
}

function OutletCard({ reach, outlet, index, lined, issue, onChange, onRemove }: { reach: CanalLiningReach; outlet: CanalReliefOutlet; index: number; lined: CanalLiningSurface[]; issue?: string; onChange: (patch: Partial<CanalReliefOutlet>) => void; onRemove: () => void }): JSX.Element {
  const gi = outlet.kind === 'gi'
  const measured = reliefOutletLocations(reach, outlet)
  return <div id={`relief-outlet-${outlet.id}`} tabIndex={-1} className={`relief-work-card ${issue ? 'joint-problem-target' : ''}`}><div className="relief-work-head"><strong>Group {index + 1} · {gi ? 'GI pressure-relief pipes' : 'PVC weep-hole pipes'}</strong><button type="button" className="joint-run-remove" onClick={onRemove}>Remove</button></div>
    {issue && <p className="joint-issue-notice" role="alert">{issue}</p>}
    <fieldset><legend>Which lined surfaces have these outlets?</legend><div className="cns-choices">{chapterSurfaces.map(surface => <label key={surface} className={outlet.surfaces.includes(surface) ? 'is-selected' : ''}><input type="checkbox" checked={outlet.surfaces.includes(surface)} onChange={event => onChange({ surfaces: event.target.checked ? [...outlet.surfaces, surface] : outlet.surfaces.filter(item => item !== surface) })} />{reliefSurfaceName(surface)}{!lined.includes(surface) ? ' · lining pending' : ''}</label>)}</div></fieldset>
    {gi ? <label className="relief-select"><span>Which GI pipe length is specified?</span><select value={outlet.code} onChange={event => onChange({ code: event.target.value })}><option value="">Choose length</option>{GI_RELIEF_CODES.map(item => <option key={item.code} value={item.code}>{item.lengthCm} cm · {item.code}</option>)}</select></label> : <p className="cns-included">100 mm diameter × 40 cm PVC pipe · <strong>IRR-CAW-7-24</strong></p>}
    <fieldset><legend>How are the outlet positions specified?</legend><div className="cns-choices">{([['spacing', 'Regular spacing'], ['chainages', 'Selected chainages'], ['approved', 'Approved total count']] as const).map(([value, label]) => <label key={value} className={outlet.placement === value ? 'is-selected' : ''}><input type="radio" name={`relief-placement-${outlet.id}`} checked={outlet.placement === value} onChange={() => onChange({ placement: value })} />{label}</label>)}</div></fieldset>
    {outlet.placement === 'spacing' && <div className="cns-thickness"><NumberField label="First outlet chainage" value={outlet.firstChainage} unit="m" onChange={firstChainage => onChange({ firstChainage })} /><NumberField label="Spacing" value={outlet.spacingM} unit="m" onChange={spacingM => onChange({ spacingM })} /></div>}
    {outlet.placement === 'chainages' && <label className="joint-text-field"><span>Outlet chainages (m)</span><textarea value={outlet.chainagesText} onChange={event => onChange({ chainagesText: event.target.value })} placeholder="For example: 10, 25, 40" /></label>}
    {outlet.placement === 'approved' && <div className="cns-thickness"><NumberField label="Approved total pipes on all selected surfaces" value={outlet.approvedCount} unit="nos" step="1" onChange={approvedCount => onChange({ approvedCount })} /></div>}
    {outlet.placement && <p className="cns-help">{outlet.placement === 'approved' ? 'This is the total across all selected surfaces.' : 'For each listed chainage, one pipe is counted on each selected surface.'} Reach ends are counted only when included in the schedule.</p>}
    {gi && <div className="relief-extras"><strong>Additional work at these GI pipes, if specified</strong><p>Enter 0 when absent. These are separate items and are never added automatically from the pipe count.</p><div className="cns-thickness"><NumberField label="Drilled holes below pipes on rock · CAW 7-25" value={outlet.rockHoleCount} unit="nos" step="1" onChange={rockHoleCount => onChange({ rockHoleCount })} /><NumberField label="Filter pockets around pipes · CAW 7-26" value={outlet.filterPocketCount} unit="nos" step="1" onChange={filterPocketCount => onChange({ filterPocketCount })} /></div><p className="cns-help">CAW 7-25 applies only where lining is laid on rock. CAW 7-26 already includes its filter-pit excavation.</p></div>}
    {outlet.placement && <div className="cns-included">{measured.errors.length ? 'Finish the position answers to calculate the pipe count.' : <><strong>{n(measured.count)} pipes</strong> · {outlet.code || 'Choose GI length'}{gi && <> · {n(outlet.rockHoleCount ?? 0)} rock holes · {n(outlet.filterPocketCount ?? 0)} filter pockets</>}</>}</div>}
    {outlet.code && <details className="lining-ssr"><summary>SSR description</summary><p>{liningCatalogueItem(outlet.code)?.description}</p></details>}
  </div>
}

export default function LiningChapterFour({ data, reach, onChange, onCommit }: { data: CanalData; reach: CanalLiningReach; onChange: (chapter: CanalReliefChapter) => void; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [activeIssue, setActiveIssue] = useState<{ message: string; target: string } | null>(null)
  const chapter = normalizeReliefChapter(reach.reliefChapter ?? defaultReliefChapter())
  const measure = measureReliefChapter(data, reach)
  const works = reliefDrainWorksForReach(data, reach)
  const lined = reach.liningChapter ? normalizeLiningChapter(reach.liningChapter).surfaces : []
  const designErrors = measure.errors.filter(error => lined.length > 0 || !error.includes('is not selected for lining in Chapter 2.'))
  const issues = designErrors.map(message => {
    const outletIndex = message.match(/^Outlet (\d+):/)
    const workIndex = message.match(/^Drainage work (\d+):/)
    const outlet = outletIndex ? chapter.outlets[Number(outletIndex[1]) - 1] : null
    const work = workIndex ? works[Number(workIndex[1]) - 1] : null
    return { message, target: outlet ? `relief-outlet-${outlet.id}` : work ? `relief-work-${work.id}` : message.startsWith('Add a bed drain') ? `relief-choices-${reach.id}` : `relief-required-${reach.id}` }
  })
  const goToIssue = (issue: { message: string; target: string }): void => {
    setActiveIssue(issue)
    requestAnimationFrame(() => {
      const element = document.getElementById(issue.target)
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      element?.focus({ preventScroll: true })
    })
  }
  const completeChapter = (): void => {
    if (issues.length) { goToIssue(issues[0]); return }
    setActiveIssue(null)
    onChange({ ...chapter, completed: true })
  }
  const outletQuantitiesReady = !!reach.liningChapter && !measureCnsReach(data, reach).errors.length && !measureLiningChapter(data, reach).errors.length
  const patch = (update: Partial<CanalReliefChapter>): void => { setActiveIssue(null); onChange({ ...chapter, ...update, completed: false }) }
  const addDrain = (kind: '5-8' | '5-9', orientation: CanalFilterDrainReach['orientation']): void => {
    setActiveIssue(null)
    const work: CanalFilterDrainReach = { id: newId(), fromChainage: reach.fromChainage, toChainage: reach.toChainage, kind, orientation, side: 'bed', width: 0.6, depth: 0.75, thickness: 0.1, spacing: 25, count: 1, crossDrainLength: data.design.bedWidth, system: kind === '5-8' ? 'bed-drainage' : 'porous-plug', coverage: 'selected', placementMode: kind === '5-9' ? 'count' : 'spacing', plugLocations: kind === '5-9' ? ['bed'] : undefined, material: { code: `IRR-CAW-${kind}` } }
    onCommit(current => ({ ...current, filterDrainReaches: [...current.filterDrainReaches, work], liningReaches: current.liningReaches.map(item => item.id === reach.id && item.reliefChapter ? { ...item, reliefChapter: { ...item.reliefChapter, completed: false } } : item) }))
  }
  const updateDrain = (id: string, update: Partial<CanalFilterDrainReach>): void => onCommit(current => ({ ...current, filterDrainReaches: current.filterDrainReaches.map(work => work.id === id ? { ...work, ...update } : work), liningReaches: current.liningReaches.map(item => item.id === reach.id && item.reliefChapter ? { ...item, reliefChapter: { ...item.reliefChapter, completed: false } } : item) }))
  const removeDrain = (id: string): void => onCommit(current => ({ ...current, filterDrainReaches: current.filterDrainReaches.filter(work => work.id !== id), liningReaches: current.liningReaches.map(item => item.id === reach.id && item.reliefChapter ? { ...item, reliefChapter: { ...item.reliefChapter, completed: false } } : item) }))
  return <div className="cns-chapter lining-chapter-four"><header><span>CHAPTER 4</span><h3>Drainage and pressure relief</h3><p>Show how water beneath the lining is collected or released. Add only details specified for this reach.</p></header>
    <fieldset id={`relief-required-${reach.id}`} tabIndex={-1} className={activeIssue?.target===`relief-required-${reach.id}` ? 'joint-problem-target' : ''}><legend>1. Is any under-lining drainage or pressure-relief work needed?</legend>{activeIssue?.target===`relief-required-${reach.id}` && <p className="joint-issue-notice" role="alert">{activeIssue.message}</p>}<div className="cns-choices">{boolOptions.map(option => <label key={String(option.value)} className={chapter.required === option.value ? 'is-selected' : ''}><input type="radio" name={`relief-required-${reach.id}`} checked={chapter.required === option.value} onChange={() => patch({ required: option.value })} />{option.label}</label>)}</div></fieldset>
    {chapter.required === false && <p className="cns-included">No Chapter 4 outlet will be added. If drainage or outlets already exist here, select Yes to review or remove them before completing this answer.</p>}
    {chapter.required === true && <>
      <div className="relief-overview"><strong>Choose the actual work shown in the design</strong><p>A bed drain collects water below the lining. A porous plug, GI relief pipe or PVC weep pipe lets water pass through the lining. They are separate works; one outlet position must not be counted as two pipe types.</p></div>
      <section id={`relief-choices-${reach.id}`} tabIndex={-1} className={`lining-spec-card ${activeIssue?.target===`relief-choices-${reach.id}` ? 'joint-problem-target' : ''}`}><h4>Bed drains and porous plugs</h4>{activeIssue?.target===`relief-choices-${reach.id}` && <p className="joint-issue-notice" role="alert">{activeIssue.message}</p>}<p className="cns-help">CAW 5-8 and 5-9 include their own excavation. Each saved work is edited here and billed once.</p>
        <div className="relief-choice-grid">
          <div className={`relief-choice-box ${works.some(work => work.kind === '5-8') ? 'has-work' : ''}`}>
            <ReliefFigure kind="bed" />
            <div className="relief-add-actions"><button type="button" className="btn secondary" onClick={() => addDrain('5-8', 'longitudinal')}>+ Longitudinal drain</button><button type="button" className="btn secondary" onClick={() => addDrain('5-8', 'cross')}>+ Cross drains</button></div>
            {works.filter(work => work.kind === '5-8').map(work => <DrainCard key={work.id} data={data} reach={reach} work={work} issue={activeIssue?.target===`relief-work-${work.id}` && designErrors.includes(activeIssue.message) ? activeIssue.message : undefined} onUpdate={update => updateDrain(work.id, update)} onRemove={() => removeDrain(work.id)} />)}
          </div>
          <div className={`relief-choice-box ${works.some(work => work.kind === '5-9') ? 'has-work' : ''}`}>
            <ReliefFigure kind="plug" />
            <div className="relief-add-actions"><button type="button" className="btn secondary" onClick={() => addDrain('5-9', 'local')}>+ Porous plugs</button></div>
            {works.filter(work => work.kind === '5-9').map(work => <DrainCard key={work.id} data={data} reach={reach} work={work} issue={activeIssue?.target===`relief-work-${work.id}` && designErrors.includes(activeIssue.message) ? activeIssue.message : undefined} onUpdate={update => updateDrain(work.id, update)} onRemove={() => removeDrain(work.id)} />)}
          </div>
        </div>
      </section>
      <section className="lining-spec-card"><h4>Pressure-relief and weep pipes</h4><p className="cns-help">A GI group uses one selected pipe length. Add another group if another length or outlet schedule is specified. PVC weep pipes use CAW 7-24.</p>
        <div className="relief-choice-grid">
          <div className={`relief-choice-box ${chapter.outlets.some(outlet => outlet.kind === 'gi') ? 'has-work' : ''}`}>
            <ReliefFigure kind="gi" rock={chapter.outlets.some(outlet => outlet.kind === 'gi' && (outlet.rockHoleCount ?? 0) > 0)} pocket={chapter.outlets.some(outlet => outlet.kind === 'gi' && (outlet.filterPocketCount ?? 0) > 0)} />
            <div className="relief-add-actions"><button type="button" className="btn secondary" onClick={() => patch({ outlets: [...chapter.outlets, newReliefOutlet('gi', newId())] })}>+ GI pressure-relief pipes</button></div>
            {chapter.outlets.filter(outlet => outlet.kind === 'gi').map((outlet, index) => <OutletCard key={outlet.id} reach={reach} outlet={outlet} index={index} lined={lined} issue={activeIssue?.target===`relief-outlet-${outlet.id}` && designErrors.includes(activeIssue.message) ? activeIssue.message : undefined} onChange={update => patch({ outlets: chapter.outlets.map(item => item.id === outlet.id ? { ...item, ...update } : item) })} onRemove={() => patch({ outlets: chapter.outlets.filter(item => item.id !== outlet.id) })} />)}
          </div>
          <div className={`relief-choice-box ${chapter.outlets.some(outlet => outlet.kind === 'pvc') ? 'has-work' : ''}`}>
            <ReliefFigure kind="pvc" />
            <div className="relief-add-actions"><button type="button" className="btn secondary" onClick={() => patch({ outlets: [...chapter.outlets, newReliefOutlet('pvc', newId())] })}>+ PVC weep-hole pipes</button></div>
            {chapter.outlets.filter(outlet => outlet.kind === 'pvc').map((outlet, index) => <OutletCard key={outlet.id} reach={reach} outlet={outlet} index={index} lined={lined} issue={activeIssue?.target===`relief-outlet-${outlet.id}` && designErrors.includes(activeIssue.message) ? activeIssue.message : undefined} onChange={update => patch({ outlets: chapter.outlets.map(item => item.id === outlet.id ? { ...item, ...update } : item) })} onRemove={() => patch({ outlets: chapter.outlets.filter(item => item.id !== outlet.id) })} />)}
          </div>
        </div>
      </section>
    </>}
    {!!issues.length && <div className="joint-issue-links">{issues.map(issue => <button type="button" key={issue.message} onClick={() => goToIssue(issue)}>{issue.message} →</button>)}</div>}
    {chapter.required === true && !outletQuantitiesReady && <p className="cns-help">CAW 7 outlet counts can be designed here, but their estimate items remain provisional until Chapters 1 and 2 have valid quantities. CAW 5 drains and plugs use their own saved quantities.</p>}
    {chapter.required === true && !measure.errors.length && <div className="cns-results"><strong>Chapter 4 items</strong>{works.map(work => <p key={work.id}>IRR-CAW-{work.kind}: {n(canalFilterDrainQuantity(data, work).quantity)} {canalFilterDrainQuantity(data, work).unit}</p>)}{measure.lines.map((line, index) => <p key={`${line.code}-${index}`}>{line.code}: {n(line.quantity)} {line.unit}</p>)}</div>}
    <footer><span>{chapter.completed && !designErrors.length ? outletQuantitiesReady || chapter.required === false ? 'Chapter 4 complete' : 'Chapter 4 design complete; outlet quantities pending.' : issues.length ? 'Click Complete to find the problem.' : 'Answers save automatically.'}</span><button type="button" className="btn primary" onClick={completeChapter}>{chapter.completed && !designErrors.length ? 'Completed' : 'Complete Chapter 4'}</button></footer>
  </div>
}
