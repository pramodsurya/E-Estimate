import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CanalCnsChapter, CanalData, CanalLiningReach } from '../../../../types/project'
import { canalBedLevelAt, canalDesignProfile, canalGroundLevelAt, canalSectionAreas, canalSectionBankTier, defaultCanalLiningReach, orderedCanalSections } from '../../../../lib/canal'
import { cnsCode, defaultCnsChapter, measureCnsReach, normalizeCnsChapter, treatmentSectionAt } from '../../../../lib/canalCns'
import { defaultLiningChapter, measureLiningChapter } from '../../../../lib/canalLiningChapter'
import { liningCatalogueItem } from '../../../../lib/canalLiningCatalogue'
import LiningChapterTwo from './LiningChapterTwo'
import LiningChapterThree from './LiningChapterThree'
import LiningChapterFour from './LiningChapterFour'
import LiningSectionPreview from './LiningSectionPreview'
import { defaultJointsChapter } from '../../../../lib/canalJoints'
import { defaultReliefChapter } from '../../../../lib/canalRelief'
import './canalLining.css'

const n = (v: number): string => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(v)
function reachProgress(reach: CanalLiningReach): string {
  const completed = [reach.cnsChapter?.completed && 1, reach.liningChapter?.completed && 2, reach.jointsChapter?.completed && 3, reach.reliefChapter?.completed && 4].filter(Boolean)
  return completed.length ? `Chapters designed: ${completed.join(', ')}` : 'Design in progress'
}
function Choice<T extends string | boolean | number>({ name, value, options, onChange }: { name: string; value: T | null; options: { value: T; label: string }[]; onChange: (value: T) => void }): JSX.Element {
  return <div className="cns-choices">{options.map(option => <label key={String(option.value)} className={value === option.value ? 'is-selected' : ''}><input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div>
}
function Thickness({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }): JSX.Element {
  return <label className="cns-number"><span>{label}</span><div><input type="number" min="1" step="1" value={value ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /><span>mm</span></div></label>
}
export default function CanalLining({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [selectedId, setSelectedId] = useState('')
  const [sectionCh, setSectionCh] = useState<number | null>(null)
  const [activeChapter, setActiveChapter] = useState<1 | 2 | 3 | 4>(1)
  const reaches = data.liningReaches ?? []
  const reach = reaches.find(r => r.id === selectedId) ?? reaches[0]
  const chapter = reach?.cnsChapter ? normalizeCnsChapter(reach.cnsChapter) : null
  const q = reach && chapter ? measureCnsReach(data, reach) : null
  const lining = reach?.liningChapter ? measureLiningChapter(data,reach) : null
  const updateReach = (patch: Partial<CanalLiningReach>): void => {
    if (!reach) return
    const extentChanged = patch.fromChainage != null || patch.toChainage != null
    onCommit(current => ({ ...current, liningReaches: current.liningReaches.map(r => r.id === reach.id ? {
      ...r, ...patch,
      ...(extentChanged && r.liningChapter ? {liningChapter:{...r.liningChapter,completed:false}}:{}),
      ...((extentChanged || patch.liningChapter) && r.jointsChapter ? {jointsChapter:{...r.jointsChapter,completed:false}}:{}),
      ...((extentChanged || (patch.liningChapter && patch.liningChapter.surfaces.length > 0 && r.reliefChapter?.outlets.some(outlet => outlet.surfaces.some(surface => !patch.liningChapter!.surfaces.includes(surface))))) && r.reliefChapter ? {reliefChapter:{...r.reliefChapter,completed:false}}:{})
    } : r) }))
  }
  const update = (patch: Partial<CanalCnsChapter>): void => updateReach({ cnsChapter: { ...(chapter ?? defaultCnsChapter()), ...patch, completed: false } })
  const add = (): void => {
    const next = { ...defaultCanalLiningReach(0, data.lengthM), cnsChapter: defaultCnsChapter() }
    onCommit(current => ({ ...current, liningReaches: [...current.liningReaches, next] })); setSelectedId(next.id); setSectionCh(null);setActiveChapter(1)
  }
  const openChapterTwo = (): void => {
    if (!reach) return
    if (!reach.liningChapter) updateReach({ liningChapter: defaultLiningChapter() })
    setActiveChapter(2)
  }
  const openChapterThree = (): void => {
    if (!reach) return
    if (!reach.jointsChapter) updateReach({ jointsChapter: defaultJointsChapter() })
    setActiveChapter(3)
  }
  const openChapterFour = (): void => {
    if (!reach) return
    if (!reach.reliefChapter) updateReach({ reliefChapter: defaultReliefChapter() })
    setActiveChapter(4)
  }
  const sections = orderedCanalSections(data).filter(s => !reach || (s.chainage >= reach.fromChainage && s.chainage <= reach.toChainage))
  const sectionDataPending = !!reach && [reach.fromChainage, reach.toChainage].some(ch => {
    const section = treatmentSectionAt(data, ch)
    return !section || section.ground.length < 2 || section.designPopulated === false
  })
  const rows = q?.rows.length ? q.rows : lining?.earthwork.rows ?? []
  const previewRow = rows.find(r => r.chainage === sectionCh) ?? rows[0]
  const fallback = sections.find(s => s.chainage === sectionCh) ?? sections[0]
  const basePreview = previewRow ?? (fallback ? { chainage: fallback.chainage, ground: fallback.ground, profile: canalDesignProfile(data, fallback), polygon: [] } : null)
  const preview = basePreview ? {...basePreview,polygon:q?.rows.find(r=>r.chainage===basePreview.chainage)?.polygon??[]} : null
  const sourceComplete = chapter && cnsCode(chapter) != null
  const chapterAnswersComplete = chapter?.required === false || (chapter?.required === true && !!chapter.coverage && (chapter.bedThicknessMm ?? 0) > 0 && (chapter.coverage === 'bed' || (chapter.sideThicknessMm ?? 0) > 0) && !!sourceComplete)
  const complete = q && q.errors.length === 0
  const previewSection = preview ? treatmentSectionAt(data,preview.chainage) : null
  const originalAreas = previewSection ? canalSectionAreas(data,previewSection) : null
  const liningRow = lining?.earthwork.rows.find(r=>r.chainage===preview?.chainage)
  const cnsRow = q?.rows.find(r=>r.chainage===preview?.chainage)
  return <section className="canal-chapter cns-workspace">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Design by reach</span><h2>Lining</h2><p>Choose a reach, prepare its supporting ground, then specify the lining.</p></div><button type="button" className="btn primary" onClick={add} disabled={data.lengthM <= 0}><Plus size={15} /> Add reach</button></header>
    <div className="cns-layout"><aside className="cns-reach-list"><h3>Your reaches</h3>{reaches.map((r,i) => <button type="button" className={r.id === reach?.id ? 'active' : ''} key={r.id} onClick={() => { setSelectedId(r.id); setSectionCh(null);setActiveChapter(r.reliefChapter?4:r.jointsChapter?3:r.liningChapter?2:1) }}><strong>Reach {i + 1}</strong><span>Ch {n(r.fromChainage)}–{n(r.toChainage)} m</span><small>{reachProgress(r)}</small></button>)}{!reaches.length && <p>No reaches yet.</p>}</aside>
    <main className="cns-editor">{!reach ? <div className="cns-empty"><h3>Start with a lining reach</h3><p>Use the section and tier information to choose its start and end chainages.</p><button type="button" className="btn primary" onClick={add} disabled={data.lengthM <= 0}>Create first reach</button></div> : <>
      <div className="cns-extent" id={`lining-extent-${reach.id}`}><label>Start chainage (m)<input type="number" min="0" value={reach.fromChainage} onChange={event => updateReach({ fromChainage: Number(event.target.value), ...(chapter ? { cnsChapter: { ...chapter, completed: false } } : {}) })} /></label><label>End chainage (m)<input type="number" min="0" max={data.lengthM} value={reach.toChainage} onChange={event => updateReach({ toChainage: Number(event.target.value), ...(chapter ? { cnsChapter: { ...chapter, completed: false } } : {}) })} /></label><button type="button" className="btn ghost" aria-label="Remove reach" onClick={() => onCommit(current => ({ ...current, liningReaches: current.liningReaches.filter(r => r.id !== reach.id) }))}><Trash2 size={16} /></button></div>
      {!reach.provide && <div className="cns-included">This saved reach is excluded from the estimate. <button type="button" className="btn secondary" onClick={() => updateReach({ provide: true })}>Include reach</button></div>}
      <details className="cns-ground-info"><summary>Section and tier information for this reach</summary><p>Section observations only. Choose reach limits yourself.</p><div className="cns-table-scroll"><table><thead><tr><th>Chainage m</th><th>At canal centre</th><th>Bank tiers L / R</th><th>Entered strata</th></tr></thead><tbody>{sections.map(s => {
        const bed = canalBedLevelAt(data,s.chainage), gl = canalGroundLevelAt(s.ground,0)
        const condition = bed == null || gl == null ? 'Ground pending' : gl > bed + .001 ? 'Cutting' : gl < bed - .001 ? 'Filling' : 'At ground level'
        const tier = (side: 'left' | 'right'): string => canalSectionBankTier(data,s,side)?.name ?? '—'
        return <tr key={s.id}><td>{n(s.chainage)}</td><td>{condition}</td><td>{tier('left')} / {tier('right')}</td><td>{s.strata?.map(t => `${t.name} (${n(t.thickness)} m)`).join(' · ') || 'Not entered'}</td></tr>
      })}</tbody></table></div></details>
      {chapter && <nav className="lining-chapter-nav" aria-label="Lining chapters">
        <button type="button" id="lining-chapter-one" className={`${activeChapter===1?'active':''} ${chapter.completed&&chapterAnswersComplete?'is-complete':''}`} onClick={()=>setActiveChapter(1)}>1. Soil treatment{chapter.completed&&chapterAnswersComplete?' ✓':''}</button>
        <button type="button" className={`${activeChapter===2?'active':''} ${reach.liningChapter?.completed?'is-complete':''}`} onClick={openChapterTwo}>2. Lining{reach.liningChapter?.completed?' ✓':''}</button>
        <button type="button" className={`${activeChapter===3?'active':''} ${reach.jointsChapter?.completed?'is-complete':''}`} onClick={openChapterThree}>3. Joints{reach.jointsChapter?.completed?' ✓':''}</button>
        <button type="button" className={`${activeChapter===4?'active':''} ${reach.reliefChapter?.completed?'is-complete':''}`} onClick={openChapterFour}>4. Drainage{reach.reliefChapter?.completed?' ✓':''}</button>
      </nav>}
      {chapter && sectionDataPending && <p className="cns-help">Section data is pending for this reach. You can continue through all lining chapters; quantities will remain pending until the sections are ready.</p>}
      {!chapter ? <div className="cns-saved"><h3>Replace the saved worksheet with Chapter 1</h3><p>The previous editor has been removed. Starting Chapter 1 replaces this reach’s active lining calculations; earlier settings remain stored.</p><button type="button" className="btn primary" onClick={() => updateReach({ cnsChapter: defaultCnsChapter() })}>Start Chapter 1</button></div> : activeChapter===4 && reach.reliefChapter ? <LiningChapterFour data={data} reach={reach} onChange={reliefChapter=>updateReach({reliefChapter})} onCommit={onCommit} /> : activeChapter===3 && reach.jointsChapter ? <LiningChapterThree data={data} reach={reach} onChange={jointsChapter=>updateReach({jointsChapter})} onNext={openChapterFour} onOpenLining={openChapterTwo} /> : activeChapter===2 && reach.liningChapter ? <LiningChapterTwo key={reach.id} data={data} reach={reach} onChange={liningChapter=>updateReach({liningChapter})} onNext={openChapterThree} /> : <div className="cns-chapter">
        <header><span>CHAPTER 1</span><h3>CNS Soil Treatment</h3><p>Only the treatment specified beneath the lining.</p></header>
        <fieldset><legend>1. Is CNS treatment required?</legend><Choice name={`required-${reach.id}`} value={chapter.required} options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} onChange={required => update({ required })} /></fieldset>
        {chapter.required === true && <>
          <fieldset><legend>2. Where is CNS required?</legend><Choice name={`coverage-${reach.id}`} value={chapter.coverage} options={[{ value: 'bed-and-sides', label: 'Bed and both inner sides' }, { value: 'bed', label: 'Bed only' }]} onChange={coverage => update({ coverage })} /></fieldset>
          {chapter.coverage && <>
            <fieldset><legend>3. What thickness is specified?</legend><div className="cns-thickness"><Thickness label="Bed thickness" value={chapter.bedThicknessMm} onChange={bedThicknessMm => update({ bedThicknessMm })} />{chapter.coverage === 'bed-and-sides' && <Thickness label="Side thickness (both sides)" value={chapter.sideThicknessMm} onChange={sideThicknessMm => update({ sideThicknessMm })} />}</div><p className="cns-help">Measured perpendicular to each surface. Side coverage follows the design up to bank-top level.</p></fieldset>
            {chapter.bedThicknessMm != null && chapter.bedThicknessMm > 0 && (chapter.coverage === 'bed' || (chapter.sideThicknessMm != null && chapter.sideThicknessMm > 0)) && <>
              <fieldset><legend>4. Where will the CNS soil come from?</legend><Choice name={`source-${reach.id}`} value={chapter.source} options={[{ value: 'borrow', label: 'Approved borrow area' }, { value: 'excavated-heaps', label: 'Suitable excavated CNS soil already collected beside the canal' }]} onChange={source => update({ source, compaction: source === 'excavated-heaps' ? 95 : null })} /></fieldset>
              {chapter.source === 'borrow' && <fieldset><legend>5. What compaction is specified?</legend><Choice name={`compaction-${reach.id}`} value={chapter.compaction} options={[{ value: 98, label: '98%' }, { value: 95, label: '95%' }]} onChange={compaction => update({ compaction })} /></fieldset>}
              {chapter.source === 'excavated-heaps' && <p className="cns-included">CAW 7-3 specifies 95% compaction. The collected soil must be suitable CNS material.</p>}
            </>}
          </>}
        </>}
        {chapter.required === false && <p className="cns-included">No CNS item or CNS earthwork adjustment will be generated for this reach.</p>}
        {lining && lining.errors.length>0 && chapter.required===true && <p className="cns-help">Chapter 2 is incomplete. This reach’s CNS and lining quantities are provisional and excluded from the estimate until its lining specification is resolved.</p>}
        {chapter.required === true && sourceComplete && q && <div className="cns-results"><strong>{q.code} · CUM</strong><div className="cns-result-grid"><div><span>CNS</span><b>{n(q.cns)} m³</b></div><div><span>Additional excavation</span><b>{n(q.excavation)} m³</b></div><div><span>Ordinary fill replaced</span><b>{n(q.replacement)} m³</b></div></div>{q.errors.length > 0 && <div className="cns-errors" role="status">{q.errors.map(error => <p key={error}>{error}</p>)}<p>These quantities are excluded until resolved.</p></div>}<details><summary>View calculation</summary><p>Average end area × interval length. Bed/side corners are joined once. Excavation follows the entered strata and configured earthwork items.</p><div className="cns-table-scroll"><table><thead><tr><th>Ch m</th><th>CNS m²</th><th>Extra cut m²</th><th>Fill replaced m²</th><th>Already excavated m²</th></tr></thead><tbody>{q.rows.map(row => <tr key={row.chainage}><td>{n(row.chainage)}</td><td>{n(row.cns)}</td><td>{n(row.excavation)}</td><td>{n(row.replacement)}</td><td>{n(row.alreadyExcavated)}</td></tr>)}</tbody></table></div><p>Excavation: {Object.entries(q.excavationByCode).map(([code,qty]) => `${code}: ${n(qty)} m³`).join(' · ') || 'None'}</p><p>Fill replaced: homogeneous {n(q.zones.homogeneous)}, hearting {n(q.zones.hearting)}, casing {n(q.zones.casing)} m³.</p><details><summary>SSR description</summary><p>{liningCatalogueItem(q.code ?? '')?.description}</p></details></details></div>}
        {chapter.required != null && q && !sourceComplete && q.errors.filter(e => !e.startsWith('Choose') && !e.startsWith('Enter a positive')).length > 0 && <div className="cns-errors" role="status">{q.errors.filter(e => !e.startsWith('Choose') && !e.startsWith('Enter a positive')).map(e => <p key={e}>{e}</p>)}</div>}
        <footer><span>{chapter.completed && chapterAnswersComplete ? complete ? 'Chapter 1 complete' : 'Chapter 1 design complete; quantities pending.' : 'Answers save automatically.'}</span><div className="lining-footer-actions"><button type="button" className={`btn ${chapter.completed&&chapterAnswersComplete?'secondary':'primary'}`} disabled={!chapterAnswersComplete} onClick={() => updateReach({ cnsChapter: { ...chapter, completed: true } })}>{chapter.completed && chapterAnswersComplete ? 'Completed' : 'Complete Chapter 1'}</button>{chapter.completed&&chapterAnswersComplete&&<button type="button" className="btn primary" onClick={openChapterTwo}>Next: Lining →</button>}</div></footer>
      </div>}
      {chapter && preview && <div className="cns-section-view">
        <div><strong>Section preview</strong><select aria-label="Preview section chainage" value={preview.chainage} onChange={event => setSectionCh(Number(event.target.value))}>{(rows.length ? rows : sections).map(s=><option key={s.chainage} value={s.chainage}>Ch {n(s.chainage)} m</option>)}</select></div>
        <LiningSectionPreview data={data} reach={reach} row={preview} />
        <p className="cns-help">The finished opening stays fixed. Layers follow the selected surfaces; thicknesses use the section scale. Thin LDPE and unfinished selections are enlarged for visibility. Material patterns and steel dots are schematic, not slab joints or bar spacing.</p>
        <div className="cns-table-scroll"><table><caption>Section areas at Ch {n(preview.chainage)} m · m²</caption><thead><tr><th>Original cutting</th><th>CNS</th><th>Lining + membrane</th><th>Extra cutting</th><th>Ordinary fill replaced</th></tr></thead><tbody><tr><td>{n(originalAreas?.cutting??0)}</td><td>{n(cnsRow?.cns??0)}</td><td>{n(liningRow?.cns??0)}</td><td>{n((cnsRow?.excavation??0)+(liningRow?.excavation??0))}</td><td>{n((cnsRow?.replacement??0)+(liningRow?.replacement??0))}</td></tr></tbody></table></div>
        <p className="cns-help">Reach volumes use average section areas × interval length. Incomplete answers show a provisional preview.</p>
      </div>}
    </> }</main></div>
  </section>
}
