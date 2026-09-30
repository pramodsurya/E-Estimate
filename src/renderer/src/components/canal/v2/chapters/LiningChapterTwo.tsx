import { useState } from 'react'
import type { CanalData, CanalLiningChapter, CanalLiningChapterSpec, CanalLiningReach, CanalLiningSurface } from '../../../../types/project'
import { activeChapterSpec, chapterSpecErrors, chapterSurfaceLabels, chapterSurfaces, defaultChapterSpec, lugSupportMeasurement, measureLiningChapter, normalizeLiningChapter, PCC_LUG_LENGTHS_M, PCC_LUG_RECOMMENDATIONS, suggestedPccLugCount, suggestedPccSlabCount } from '../../../../lib/canalLiningChapter'
import { LINING_SPECIFICATIONS } from '../../../../lib/canalLiningDesign'
import { liningCatalogueItem } from '../../../../lib/canalLiningCatalogue'

const n = (v: number): string => v.toLocaleString('en-IN', { maximumFractionDigits: 3 })
function Radio<T extends string | boolean>({ label, value, options, onChange, name, id }: { label: string; value: T | null; options: [T, string][]; onChange: (v: T) => void; name: string; id?: string }): JSX.Element {
  return <fieldset id={id}><legend>{label}</legend><div className="cns-choices">{options.map(([v,text])=><label key={String(v)} className={v===value?'is-selected':''}><input type="radio" name={name} checked={v===value} onChange={()=>onChange(v)} /><span>{text}</span></label>)}</div></fieldset>
}
function Surfaces({ label, available, selected, onChange, id }: { label: string; available: CanalLiningSurface[]; selected: CanalLiningSurface[]; onChange: (v: CanalLiningSurface[]) => void; id?: string }): JSX.Element {
  return <fieldset id={id}><legend>{label}</legend><div className="cns-choices">{available.map(s=><label className={selected.includes(s)?'is-selected':''} key={s}><input type="checkbox" checked={selected.includes(s)} onChange={e=>onChange(e.target.checked?[...selected,s]:selected.filter(v=>v!==s))} /><span>{chapterSurfaceLabels[s]}</span></label>)}</div></fieldset>
}
function NumberAnswer({ label, unit, value, onChange, whole = false }: { label: string; unit: string; value: number | null; onChange: (v: number | null) => void; whole?: boolean }): JSX.Element {
  return <label className="cns-number"><span>{label}</span><div><input type="number" min="0" step={whole?'1':'any'} value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))} /><span>{unit}</span></div></label>
}
export default function LiningChapterTwo({ data, reach, onChange, onNext }: { data: CanalData; reach: CanalLiningReach; onChange: (c: CanalLiningChapter) => void; onNext: () => void }): JSX.Element {
  const [showMissing, setShowMissing] = useState(false)
  const c = normalizeLiningChapter(reach.liningChapter!)
  const q = measureLiningChapter(data, reach)
  const update = (patch: Partial<CanalLiningChapter>): void => onChange({ ...c, ...patch, completed: false })
  const groups = c.sameSpecification===true ? [c.surfaces] : c.surfaces.map(s=>[s])
  const showSpecs = c.surfaces.length===1 || (c.surfaces.length>1 && c.sameSpecification!=null)
  const specsComplete = showSpecs && groups.every(g=>{
    const spec=activeChapterSpec(c,g[0])
    return !chapterSpecErrors(spec,g).length && (!spec.lugs || !lugSupportMeasurement(data,reach,spec,g).errors.length)
  })
  // Section/earthwork errors affect quantities, but do not prevent finishing the lining design.
  const designErrors = q.errors.filter(error =>
    !q.earthwork.errors.includes(error) &&
    error !== 'Answer Chapter 1 before completing the lining design.' &&
    !error.startsWith('Lining reaches overlap on the same surface.') &&
    !error.includes('Complete the lug-support geometry on') &&
    !error.endsWith('Set a positive reach length.')
  )
  const quantityErrors = q.errors.filter(error => !designErrors.includes(error))
  const membraneTarget = showSpecs ? `lining-membrane-${reach.id}` : c.surfaces.length ? `lining-same-${reach.id}` : `lining-surfaces-${reach.id}`
  const issues = designErrors.map(message=>{
    const group = groups.find(surfaces=>message.startsWith(`${surfaces.map(side=>chapterSurfaceLabels[side]).join(' / ')}: `))
    if (group) {
      const title = group.map(side=>chapterSurfaceLabels[side]).join(' / ')
      return { message: message.slice(title.length+2), target: `lining-card-${reach.id}-${group[0]}`, title }
    }
    if (message.includes('same specification')) return { message, target: `lining-same-${reach.id}`, title: 'Lining surfaces' }
    if (message.includes('surfaces to line')) return { message, target: `lining-surfaces-${reach.id}`, title: 'Lining surfaces' }
    if (message.includes('LDPE surfaces')) return { message, target: c.membrane && showSpecs ? `lining-membrane-surfaces-${reach.id}` : membraneTarget, title: 'LDPE membrane' }
    if (message.includes('LDPE thickness')) return { message, target: c.membraneSurfaces.length && showSpecs ? `lining-membrane-thickness-${reach.id}` : `lining-membrane-surfaces-${reach.id}`, title: 'LDPE membrane' }
    if (message.includes('LDPE') || message.includes('membrane')) return { message, target: membraneTarget, title: 'LDPE membrane' }
    if (message.includes('Chapter 1')) return { message, target: 'lining-chapter-one', title: 'Soil treatment' }
    return { message, target: `lining-extent-${reach.id}`, title: 'Reach and section' }
  })
  const goToIssue = (target: string): void => {
    const element = document.getElementById(target) ?? document.getElementById(`lining-surfaces-${reach.id}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true })
      if (document.activeElement !== element) element.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
    }
  }
  const completeChapter = (): void => {
    if (!designErrors.length) { onChange({ ...c, completed: true }); return }
    setShowMissing(true)
    requestAnimationFrame(()=>goToIssue(issues[0].target))
  }
  return <div className="cns-chapter lining-chapter-two"><header><span>CHAPTER 2</span><h3>Lining</h3><p>Specify the lining forming the finished canal opening.</p></header>
    <Surfaces id={`lining-surfaces-${reach.id}`} label="1. Which surfaces will be lined?" available={chapterSurfaces} selected={c.surfaces} onChange={surfaces=>update({surfaces,sameSpecification:null})} />
    {c.surfaces.length>1 && <Radio id={`lining-same-${reach.id}`} label="2. Is the same lining specification used on all selected surfaces?" name={`same-${reach.id}`} value={c.sameSpecification} options={[[true,'Yes — same specification'],[false,'No — specify separately']]} onChange={sameSpecification=>update({sameSpecification})} />}
    {showSpecs && groups.map(surfaces=>{
      const key = surfaces[0], s = activeChapterSpec(c,key), title = surfaces.map(side=>chapterSurfaceLabels[side]).join(' / ')
      const patch = (p: Partial<CanalLiningChapterSpec>): void => update({specifications:{...c.specifications,[key]:{...s,...p}}})
      const specs = LINING_SPECIFICATIONS.filter(r=>r.method===s.method && (!r.sidesOnly||!surfaces.includes('bed')) && (s.method!=='concrete'||!!r.paver===(s.placement==='paver')))
      const spec = specs.find(r=>r.code===s.code)
      const resolved = !!spec && s.thicknessMm!=null && s.thicknessMm>0
      const selectedArea = surfaces.reduce((sum, surface) => sum + q.areas[surface], 0)
      const suggestedSlabs = s.method==='pcc' ? suggestedPccSlabCount(selectedArea, spec?.slabSize) : null
      const lugMeasure = s.lugs ? lugSupportMeasurement(data, reach, s, surfaces) : null
      const suggestedLugs = s.lugs && s.slabSource==='manufacture' ? suggestedPccLugCount(data, reach, s, surfaces) : null
      const recommendedLug = PCC_LUG_RECOMMENDATIONS[s.code] ?? null
      const lugOptions: [string,string][] = [['IRR-CAW-7-39','550 × 300 × 55 mm'],['IRR-CAW-7-41','450 × 150 × 30 mm'],['IRR-CAW-7-44','400 × 150 × 30 mm']]
      lugOptions.sort(([a],[b])=>Number(b===recommendedLug)-Number(a===recommendedLug))
      const cardIssues = issues.filter(issue=>issue.target===`lining-card-${reach.id}-${key}`)
      return <section className="lining-spec-card" id={`lining-card-${reach.id}-${key}`} tabIndex={-1} key={key}><h4>{title}</h4>
        {showMissing && cardIssues.length>0 && <div className="lining-card-missing"><strong>To complete this card:</strong><ul>{cardIssues.map((issue,i)=><li key={`${issue.message}-${i}`}>{issue.message}</li>)}</ul></div>}
        <Radio label="3. Which lining construction is specified?" name={`method-${reach.id}-${key}`} value={s.method} options={[
          ['concrete','Concrete placed on site'],['stone','Stone slabs'],...(!surfaces.includes('bed')?[['pcc','Precast PCC slabs'],['masonry','Rubble stone masonry']] as [NonNullable<CanalLiningChapterSpec['method']>,string][]:[])
        ]} onChange={method=>patch({...defaultChapterSpec(),method})} />
        {surfaces.includes('bed') && <p className="cns-help">PCC slab fixing and rubble masonry items in CAW 7 cover sides. Use separate specifications when selecting them for the sides.</p>}
        {s.method==='concrete' && <Radio label="How will the concrete be placed?" name={`placement-${reach.id}-${key}`} value={s.placement} options={[["paver","Mechanical paver"],["conventional","Conventional placement"]]} onChange={placement=>patch({placement,code:'',thicknessMm:null,reinforced:null})} />}
        {s.method && (s.method!=='concrete'||s.placement) && <fieldset><legend>{s.method==='concrete'?'Which grade, thickness and aggregate size are specified?':s.method==='pcc'?'Which PCC slab size is specified?':s.method==='masonry'?'Which stone source and masonry specification are specified?':'Stone slab specification'}</legend>
          <select aria-label={`Lining specification for ${title}`} value={s.code} onChange={e=>{const item=specs.find(r=>r.code===e.target.value);patch({code:item?.code??'',thicknessMm:item?.thicknessMm??null})}}><option value="">Choose specification</option>{specs.map(r=><option key={r.code} value={r.code}>{r.label}{s.method==='pcc'?'':` · ${r.code.replace('IRR-','')}`}</option>)}</select>
          {spec && spec.thicknessMm==null && <NumberAnswer label="Specified lining thickness" unit="mm" value={s.thicknessMm} onChange={thicknessMm=>patch({thicknessMm})} />}
          {spec?.thicknessMm!=null && <p className="cns-included">Specified thickness: {spec.thicknessMm} mm.</p>}
        </fieldset>}
        {resolved && s.method==='pcc' && <>
          <Radio label="Will the PCC slabs be manufactured for this work or supplied separately?" name={`slabs-${reach.id}-${key}`} value={s.slabSource} options={[["manufacture","Manufacture for this work"],["supplied","Supplied separately — fixing only"]]} onChange={slabSource=>patch({slabSource})} />
          {s.slabSource==='manufacture' && <fieldset><legend>Slabs to manufacture</legend>
            {suggestedSlabs != null && spec?.slabSize && <div className="lining-slab-suggestion"><div><strong>Starting estimate: {n(suggestedSlabs)} slabs</strong><span>{n(selectedArea)} m² ÷ ({n(spec.slabSize[0]/1000)} m × {n(spec.slabSize[1]/1000)} m), rounded up</span></div><button type="button" className="btn secondary" onClick={()=>patch({slabCount:suggestedSlabs})}>{s.slabCount == null ? 'Use estimate' : 'Replace count'}</button></div>}
            <p className="cns-help">Area gives a starting count only. Check the slab layout and adjust for cuts, edges and joints before completing this chapter.</p>
            <NumberAnswer label="PCC slabs to manufacture for these surfaces" unit="nos" whole value={s.slabCount} onChange={slabCount=>patch({slabCount})} />
          </fieldset>}
          <div className="lining-code-resolution" aria-live="polite">
            <strong>PCC slab items for {title.toLowerCase()}</strong>
            <div><span>Fix PCC slabs</span><b>CAW 7-28 · SQM</b></div>
            {s.slabSource==='manufacture' && <div><span>Manufacture PCC slabs</span><b>{s.code.replace('IRR-','')} · NOS</b></div>}
          </div>
          {s.slabSource && <Radio label="Are supporting lug slabs specified?" name={`lugs-${reach.id}-${key}`} value={s.lugs} options={[[true,'Yes'],[false,'No']]} onChange={lugs=>patch({lugs})} />}
          {s.lugs && <fieldset><legend>Lug slab supports</legend>
            {recommendedLug && <p className="cns-help">Suggested matching size: {lugOptions.find(([code])=>code===recommendedLug)?.[1]}.</p>}
            <select aria-label={`Lug slab size for ${title}`} value={s.lugCode} onChange={e=>patch({lugCode:e.target.value})}><option value="">Choose lug size</option>{lugOptions.map(([code,size])=><option key={code} value={code}>{size}{code===recommendedLug?' · suggested match':''}</option>)}</select>
            <fieldset><legend>How are the supporting lugs arranged?</legend><div className="cns-choices">{([['along','Full-reach lines'],['across','Across sides at regular chainages'],['approved','Approved total length']] as const).map(([mode,label])=><label key={mode} className={s.lugLayout===mode?'is-selected':''}><input type="radio" name={`lug-layout-${reach.id}-${key}`} checked={s.lugLayout===mode} onChange={()=>patch({lugLayout:mode})} />{label}</label>)}</div></fieldset>
            {s.lugLayout==='along'&&<div className="cns-thickness">{surfaces.map(surface=><NumberAnswer key={surface} label={`${chapterSurfaceLabels[surface]} — full-reach lug lines`} unit="lines" whole value={s.lugRows?.[surface]??null} onChange={value=>patch({lugRows:{bed:null,left:null,right:null,...s.lugRows,[surface]:value}})} />)}</div>}
            {s.lugLayout==='across'&&<div className="cns-thickness"><NumberAnswer label="First lug-support chainage" unit="m" value={s.lugFirstChainage??null} onChange={lugFirstChainage=>patch({lugFirstChainage})} /><NumberAnswer label="Spacing between supports" unit="m" value={s.lugSpacingM??null} onChange={lugSpacingM=>patch({lugSpacingM})} /></div>}
            {s.lugLayout==='approved'&&<NumberAnswer label="Approved total support length" unit="m" value={s.lugLengthM} onChange={lugLengthM=>patch({lugLengthM})} />}
            {lugMeasure&&!lugMeasure.errors.length&&<p className="cns-included">CAW 7-29 fixing: <strong>{n(lugMeasure.length)} RM</strong>{s.lugLayout==='along'?` = ${lugMeasure.count} lines × ${n(reach.toChainage-reach.fromChainage)} m reach` : s.lugLayout==='across'?` across ${lugMeasure.count} chainages` : ' from approved schedule'}.</p>}
            {s.lugLayout==='across'&&<p className="cns-help">At each chainage, the software adds the developed lengths of the selected inner sides. It does not insert an end support unless its chainage falls in the pattern.</p>}
            {s.slabSource==='manufacture'&&<>
              {suggestedLugs != null && <div className="lining-slab-suggestion"><div><strong>Starting estimate: {n(suggestedLugs)} lug slabs</strong><span>{n(lugMeasure?.length ?? 0)} m support length · {n(PCC_LUG_LENGTHS_M[s.lugCode])} m per lug{s.lugLayout==='approved'||s.lugLayout==null?' · rounded up':' · each support line rounded up'}</span></div><button type="button" className="btn secondary" onClick={()=>patch({lugCount:suggestedLugs})}>{s.lugCount == null ? 'Use estimate' : 'Replace count'}</button></div>}
              <NumberAnswer label="Lug slabs to manufacture" unit="nos" whole value={s.lugCount} onChange={lugCount=>patch({lugCount})} />
              <p className="cns-help">Check the support layout and adjust for cut and end pieces before completing this chapter.</p>
            </>}
            <div className="lining-code-resolution is-lug" aria-live="polite"><strong>Lug slab items</strong><div><span>Fix supporting lug slabs</span><b>CAW 7-29 · RM</b></div>{s.slabSource==='manufacture' && !!s.lugCode && <div><span>Manufacture lug slabs</span><b>{s.lugCode.replace('IRR-','')} · NOS</b></div>}</div>
          </fieldset>}
          <p className="cns-help">These PCC items describe plain concrete.</p>
        </>}
        {resolved && s.method==='concrete' && <Radio label="Is reinforcement specified in the lining drawing?" name={`steel-${reach.id}-${key}`} value={s.reinforced} options={[[true,'Yes'],[false,'No']]} onChange={reinforced=>patch({reinforced})} />}
        {resolved && s.method==='concrete' && s.reinforced && <div className="lining-sub-card">
          <Surfaces label="Which concrete surfaces are reinforced?" available={surfaces} selected={s.steelSurfaces} onChange={steelSurfaces=>patch({steelSurfaces})} />
          {!!s.steelSurfaces.length && <Radio label="How will steel quantity be entered?" name={`steel-mode-${reach.id}-${key}`} value={s.steelMode} options={[["schedule","Approved bar schedule"],["area","Specified kg per m²"]]} onChange={steelMode=>patch({steelMode,steelQuantity:null})} />}
          {s.steelMode && <NumberAnswer label={s.steelMode==='schedule'?'Total approved steel for these surfaces':'Specified steel per unit area'} unit={s.steelMode==='schedule'?'kg':'kg/m²'} value={s.steelQuantity} onChange={steelQuantity=>patch({steelQuantity})} />}
          <p className="cns-help">CAW 7-5 · kg. Steel sits inside the concrete thickness.</p>
        </div>}
        {resolved && <details className="lining-ssr"><summary>SSR description</summary><p>{liningCatalogueItem(s.method==='pcc'?'IRR-CAW-7-28':s.code)?.description}</p>{s.method==='pcc'&&<p>{liningCatalogueItem(s.code)?.description}</p>}</details>}
      </section>
    })}
    {showSpecs && <><Radio id={`lining-membrane-${reach.id}`} label="Is an LDPE membrane specified beneath the lining?" name={`membrane-${reach.id}`} value={c.membrane} options={[[true,'Yes'],[false,'No']]} onChange={membrane=>update({membrane})} />
      {c.membrane && <div className="lining-sub-card"><Surfaces id={`lining-membrane-surfaces-${reach.id}`} label="Where is the membrane specified?" available={c.surfaces} selected={c.membraneSurfaces} onChange={membraneSurfaces=>update({membraneSurfaces})} />{!!c.membraneSurfaces.length && <fieldset id={`lining-membrane-thickness-${reach.id}`}><legend>Which LDPE thickness is specified?</legend><div className="cns-choices">{([500,750,1000] as const).map(v=><label key={v} className={c.membraneMicrons===v?'is-selected':''}><input type="radio" name={`microns-${reach.id}`} checked={c.membraneMicrons===v} onChange={()=>update({membraneMicrons:v})} />{v} microns</label>)}</div></fieldset>}<p className="cns-help">CAW 7-31 / 7-32 / 7-33 · m². The membrane sits behind the lining and ahead of CNS.</p></div>}
    </>}
    {specsComplete && c.membrane!=null && <div className="cns-results"><strong>{q.errors.length?'Provisional lining items':'Resolved lining items'}</strong><div className="cns-table-scroll"><table><thead><tr><th>Item</th><th>Code</th><th>Quantity</th></tr></thead><tbody>{q.lines.map((line,i)=><tr key={`${line.code}-${i}`}><td>{line.label}</td><td>{line.code}</td><td>{n(line.quantity)} {line.unit}</td></tr>)}</tbody></table></div><div className="cns-result-grid"><div><span>Additional excavation for lining</span><b>{n(q.earthwork.excavation)} m³</b></div><div><span>Ordinary fill replaced by lining</span><b>{n(q.earthwork.replacement)} m³</b></div></div><details><summary>View calculation</summary><p>Developed surface area uses average end surface length × section interval. CUM items use surface area × specified thickness; SQM items use surface area. Slab manufacturing and steel schedules use approved quantities.</p>{chapterSurfaces.filter(s=>c.surfaces.includes(s)).map(s=><p key={s}>{chapterSurfaceLabels[s]}: {n(q.areas[s])} m²</p>)}</details>{!!q.errors.length&&<div className="cns-errors" role="status">{q.errors.map(e=><p key={e}>{e}</p>)}<p>This reach’s lining and CNS quantities are excluded until resolved.</p></div>}</div>}
    {showMissing && issues.length>0 && <div className="lining-missing-summary" role="alert"><strong>{issues.length} {issues.length===1?'answer needs':'answers need'} attention</strong><p>Select an item to go to its question.</p><ol>{issues.map((issue,i)=><li key={`${issue.message}-${i}`}><button type="button" onClick={()=>goToIssue(issue.target)}><span>{issue.title} — </span>{issue.message}</button></li>)}</ol></div>}
    {c.completed && !designErrors.length && !!quantityErrors.length && <p className="cns-help">Lining design complete. Quantities are pending the reach sections or other measurement details: {quantityErrors.join(' ')}</p>}
    <footer><span>{c.completed&&!designErrors.length?quantityErrors.length?'Chapter 2 design complete; quantities pending.':'Chapter 2 complete':issues.length?'Click Complete to find missing answers.':'Answers save automatically.'}</span><div className="lining-footer-actions"><button type="button" className={`btn ${c.completed&&!designErrors.length?'secondary':'primary'}`} onClick={completeChapter}>{c.completed&&!designErrors.length?'Completed':'Complete Chapter 2'}</button>{c.completed&&!designErrors.length&&<button type="button" className="btn primary" onClick={onNext}>Next: Joints →</button>}</div></footer>
  </div>
}
