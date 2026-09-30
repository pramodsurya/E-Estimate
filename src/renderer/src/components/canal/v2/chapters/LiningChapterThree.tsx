import { useState } from 'react'
import type { CanalData, CanalJointLayout, CanalJointsChapter, CanalLiningReach, CanalLiningSurface } from '../../../../types/project'
import { defaultJointsChapter, jointNames, jointSurfaceCode, longitudinalJointMeasurement, measureJointsChapter, normalizeJointsChapter, paverJointSurfaces, type JointKind, type JointMeasurement } from '../../../../lib/canalJoints'
import { activeChapterSpec, chapterSurfaceLabels, chapterSurfaces, normalizeLiningChapter } from '../../../../lib/canalLiningChapter'
import { LINING_SPECIFICATIONS } from '../../../../lib/canalLiningDesign'
import { liningCatalogueItem } from '../../../../lib/canalLiningCatalogue'

const n=(v:number):string=>v.toLocaleString('en-IN',{maximumFractionDigits:3})
function YesNo({label,value,name,onChange}:{label:string;value:boolean|null;name:string;onChange:(v:boolean)=>void}):JSX.Element {
  return <fieldset><legend>{label}</legend><div className="cns-choices">{[true,false].map(v=><label key={String(v)} className={value===v?'is-selected':''}><input type="radio" name={name} checked={value===v} onChange={()=>onChange(v)} />{v?'Yes':'No'}</label>)}</div></fieldset>
}
function NumberField({label,value,onChange,unit='m',whole=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;unit?:string;whole?:boolean}):JSX.Element {
  return <label className="cns-number"><span>{label}</span><div><input type="number" min="0" step={whole?'1':'any'} value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))} /><span>{unit}</span></div></label>
}
function LayoutPreview({reach,layout,work}:{reach:CanalLiningReach;layout:CanalJointLayout;work:JointMeasurement|undefined}):JSX.Element {
  const surfaces:CanalLiningSurface[]=['left','bed','right']
  const y=(ch:number):number=>48+Math.max(0,Math.min(1,(ch-reach.fromChainage)/Math.max(1,reach.toChainage-reach.fromChainage)))*150
  const locations=work?.locations??[]
  const shown=locations.length>10?Array.from({length:10},(_,i)=>locations[Math.round(i*(locations.length-1)/9)]):locations
  return <figure className="joint-layout-preview"><strong>Joint positions along this reach</strong><svg viewBox="0 0 620 230" role="img" aria-label={`${layout.direction==='longitudinal'?'Longitudinal':'Transverse'} joint layout on unfolded canal surfaces. Teal surfaces have selected joints; grey surfaces have none. Orange lines represent joints.`}>
    {surfaces.map((s,i)=><g key={s}><rect x={104+i*145} y="42" width="140" height="160" rx="4" fill={layout.surfaces.includes(s)?'#213c3a':'#252c32'} stroke={layout.surfaces.includes(s)?'#58b6a8':'#53616c'} strokeWidth="1.5" /><text x={174+i*145} y="25" textAnchor="middle" fill="#b9c9d6" fontSize="12">{chapterSurfaceLabels[s]}</text>
      {layout.surfaces.includes(s)&&layout.direction==='transverse'&&shown.map(ch=><line key={ch} x1={110+i*145} x2={238+i*145} y1={y(ch)} y2={y(ch)} stroke="#f6b767" strokeWidth="2" />)}
      {layout.surfaces.includes(s)&&layout.direction==='longitudinal'&&(layout.longitudinalMode==='parts'?layout.longitudinalRuns?.[s]??[]:[{fromChainage:reach.fromChainage,toChainage:reach.toChainage,lines:layout.longitudinalMode==='full'?layout.longitudinalLines?.[s]??0:1}]).flatMap((run,runIndex)=>Array.from({length:Math.min(7,Math.max(0,run.lines??0))},(_,lineIndex)=><line key={`${runIndex}-${lineIndex}`} x1={130+i*145+lineIndex*14} x2={130+i*145+lineIndex*14} y1={y(run.fromChainage??reach.fromChainage)} y2={y(run.toChainage??reach.toChainage)} stroke="#f6b767" strokeWidth="2" strokeDasharray={layout.longitudinalMode==='approved'?'7 4':undefined} />))}
      {!layout.surfaces.includes(s)&&<text x={174+i*145} y="125" textAnchor="middle" fill="#aab5bd" fontSize="12">No joints selected</text>}
    </g>)}<text x="8" y="52" fill="#b9c9d6" fontSize="12">Ch {n(reach.fromChainage)}</text><text x="8" y="202" fill="#b9c9d6" fontSize="12">Ch {n(reach.toChainage)}</text>
  </svg><figcaption><span className="joint-preview-key"><span className="joint-preview-swatch selected" /> Selected joint surface</span><span className="joint-preview-key"><span className="joint-preview-swatch joint" /> Joint line</span><span className="joint-preview-key"><span className="joint-preview-swatch empty" /> No joint selected</span><span className="joint-preview-note">{layout.direction==='longitudinal'?layout.longitudinalMode==='approved'?'Illustrative paths only; measured length comes from the approved schedule.':'Orange lines show the entered extents and counts (up to seven lines per surface).':shown.length?`${locations.length} joint positions in this reach${locations.length>shown.length?`; ${shown.length} evenly spaced examples shown`:''}. The full count is used for measurement.`:'Enter spacing or chainages to see joint positions.'} This is an unfolded plan view: chainage runs from top to bottom.</span></figcaption></figure>
}
export default function LiningChapterThree({data,reach,onChange,onNext,onOpenLining}:{data:CanalData;reach:CanalLiningReach;onChange:(c:CanalJointsChapter)=>void;onNext:()=>void;onOpenLining:()=>void}):JSX.Element {
  const [activeIssue, setActiveIssue] = useState<{ message: string; target: string } | null>(null)
  const c=normalizeJointsChapter(reach.jointsChapter??defaultJointsChapter())
  const q=measureJointsChapter(data,reach)
  const designErrors=q.errors.filter(error=>
    error!=='Complete valid soil treatment and lining specifications before measuring joints.' &&
    !error.includes('Complete the joint surface geometry at Ch')
  )
  const quantityErrors=c.required===false?[]:q.errors.filter(error=>!designErrors.includes(error))
  const issues = designErrors.map(message => {
    const kind = (['mastic', 'expansion'] as const).find(kind => message.startsWith(`${jointNames[kind]}: `))
    const target = kind ? `joint-card-${reach.id}-${kind}` : message.includes('overlap') ? `joint-card-${reach.id}-expansion` : message.includes('joint type') ? `joint-types-${reach.id}` : `joint-required-${reach.id}`
    return { message, target }
  })
  const goToIssue = (issue: { message: string; target: string }): void => {
    setActiveIssue(issue)
    requestAnimationFrame(() => {
      const element = document.getElementById(issue.target)
      if (!element) return
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      element.focus({ preventScroll: true })
      if (document.activeElement !== element) element.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
    })
  }
  const completeChapter = (): void => {
    if (issues.length) { goToIssue(issues[0]); return }
    setActiveIssue(null)
    onChange({ ...c, completed: true })
  }
  const paver=paverJointSurfaces(reach)
  const lining=reach.liningChapter?normalizeLiningChapter(reach.liningChapter):null
  const liningSummary=lining?.surfaces.map(surface=>{
    const selected=activeChapterSpec(lining,surface)
    const specification=LINING_SPECIFICATIONS.find(item=>item.code===selected.code)
    const included=selected.method==='pcc'?'Mortar pointing included in PCC slab fixing':selected.method==='stone'?'Mortar pointing included in stone slab fixing':paver.includes(surface)?'Contraction joints and PVC strips included in paver lining':null
    return {surface,specification:specification?.label??'Specification pending',included}
  })??[]
  const eligible={
    mastic:chapterSurfaces.filter(surface=>!!jointSurfaceCode(reach,'mastic',surface)),
    expansion:chapterSurfaces.filter(surface=>!!jointSurfaceCode(reach,'expansion',surface))
  }
  const update=(patch:Partial<CanalJointsChapter>):void=>{ setActiveIssue(null); onChange({...c,...patch,completed:false}) }
  if (!reach.liningChapter?.completed) return <div className="cns-chapter lining-chapter-three"><header><span>CHAPTER 3</span><h3>Joints</h3></header><div className="joint-issue-notice"><strong>Complete Chapter 2 lining choices first.</strong><p>The lining type, thickness and placement method determine which joint questions and SSR items apply. Section quantities can remain pending.</p><button type="button" className="btn primary" onClick={onOpenLining}>Go to Chapter 2: Lining →</button></div></div>
  return <div className="cns-chapter lining-chapter-three"><header><span>CHAPTER 3</span><h3>Joints</h3><p>Review the selected lining, then add only joint work specified separately from it.</p></header>
    <div className="joint-lining-summary"><strong>Selected in Chapter 2</strong>{liningSummary.length?liningSummary.map(row=><div key={row.surface}><span>{chapterSurfaceLabels[row.surface]}</span><div>{row.specification}{row.included&&<small>{row.included}</small>}</div></div>):<p>Choose the lining surfaces and specification in Chapter 2 to see compatible joint items here.</p>}</div>
    <div id={`joint-required-${reach.id}`} tabIndex={-1} className={activeIssue?.target===`joint-required-${reach.id}`?'joint-problem-target':''}>
      {activeIssue?.target===`joint-required-${reach.id}`&&<p className="joint-issue-notice" role="alert">{activeIssue.message}</p>}
      <YesNo label="1. Are any joint works specified separately from the selected lining items?" name={`joints-required-${reach.id}`} value={c.required} onChange={required=>update({required})} />
    </div>
    {c.required===false&&<p className="cns-included">No separate joint item will be added. Joint work included in the lining rate remains included.</p>}
    {c.required===true&&<>
      <div id={`joint-types-${reach.id}`} tabIndex={-1} className={activeIssue?.target===`joint-types-${reach.id}`?'joint-problem-target':''}>
        {activeIssue?.target===`joint-types-${reach.id}`&&<p className="joint-issue-notice" role="alert">{activeIssue.message}</p>}
      <fieldset><legend>2. Which separate joint types are specified?</legend><div className="cns-choices">{(['mastic','expansion'] as const).filter(kind=>eligible[kind].length>0||c[kind].enabled).map(kind=><label key={kind} className={c[kind].enabled?'is-selected':''}><input type="checkbox" checked={c[kind].enabled} onChange={e=>update({[kind]:{...c[kind],enabled:e.target.checked}})} />{jointNames[kind]}{!eligible[kind].length?' — no longer matches Chapter 2':''}</label>)}</div>{!eligible.mastic.length&&!eligible.expansion.length&&<p className="cns-help">No separate CAW 7 mastic or tarfelt item matches these surfaces. Ordinary pointing for stone and PCC slabs is included in their fixing rates.</p>}<p className="cns-help">Mastic fills a shallow concrete joint; tarfelt fills an expansion gap. Both can be used in one reach at different joint lines, but not on the same line.</p></fieldset>
      </div>
      {(['mastic','expansion'] as JointKind[]).filter(kind=>c[kind].enabled).map(kind=>{
        const layout=c[kind],work=q.works.find(w=>w.kind===kind)
        const available=chapterSurfaces.filter(s=>jointSurfaceCode(reach,kind,s)||layout.surfaces.includes(s))
        const patch=(v:Partial<CanalJointLayout>):void=>update({[kind]:{...layout,...v}})
        const codes=[...new Set(layout.surfaces.map(s=>jointSurfaceCode(reach,kind,s)).filter((code):code is string=>!!code))]
        const needsScope=kind==='mastic'&&layout.surfaces.some(s=>paver.includes(s))
        return <section id={`joint-card-${reach.id}-${kind}`} tabIndex={-1} className={`lining-spec-card ${activeIssue?.target===`joint-card-${reach.id}-${kind}`?'joint-problem-target':''}`} key={kind}><h4>{jointNames[kind]}</h4>
          {activeIssue?.target===`joint-card-${reach.id}-${kind}`&&<p className="joint-issue-notice" role="alert">{activeIssue.message}</p>}
          <fieldset><legend>3. Which lined surfaces contain these joints?</legend><div className="cns-choices">{available.map(s=><label className={layout.surfaces.includes(s)?'is-selected':''} key={s}><input type="checkbox" checked={layout.surfaces.includes(s)} onChange={e=>patch({surfaces:e.target.checked?[...layout.surfaces,s]:layout.surfaces.filter(v=>v!==s)})} />{chapterSurfaceLabels[s]}</label>)}</div>{!available.length&&<p className="cns-errors">No compatible CAW 7 item for this lining. Mastic applies to concrete; expansion boards cover 100/150 mm concrete and the specified masonry detail.</p>}</fieldset>
          {!!layout.surfaces.length&&<>
            <div className="joint-code-details">{codes.map(code=><div key={code}><strong>{code} · RM</strong><p>{code.endsWith('-37')?'35 mm wide × 10 mm deep mastic joint':code.endsWith('-34')?'12 mm thick × 380 mm deep tarfelt board for masonry':code.endsWith('-35')?'20 mm thick × 100 mm deep tarfelt board':'20 mm thick × 150 mm deep tarfelt board'}</p></div>)}</div>
            {kind==='expansion'&&codes.some(code=>code.endsWith('-35')||code.endsWith('-36'))&&<p className="cns-help">The board depth is matched to the concrete lining thickness here. Confirm the expansion-board detail in the drawing.</p>}
            {codes.includes('IRR-CAW-7-34')&&<p className="cns-help">The masonry board is 380 mm deep. Check its seating against the approved drawing; board depth alone does not define a soil trench or excavation quantity.</p>}
            {needsScope&&<YesNo label="Is this mastic detail separate from the contraction joints and PVC strips included in the paver rate?" name={`separate-${reach.id}-${kind}`} value={layout.distinctScope} onChange={distinctScope=>patch({distinctScope})} />}
            <fieldset><legend>4. Which direction do the joints run?</legend><div className="cns-choices">{([['transverse','Across the canal'],['longitudinal','Along the canal']] as const).map(([v,label])=><label className={layout.direction===v?'is-selected':''} key={v}><input type="radio" name={`direction-${reach.id}-${kind}`} checked={layout.direction===v} onChange={()=>patch({direction:v})} />{label}</label>)}</div></fieldset>
            {layout.direction==='transverse'&&<>
              <fieldset><legend>5. How are the joint positions specified?</legend><div className="cns-choices">{([['spacing','Regular spacing'],['locations','Specified chainages']] as const).map(([v,label])=><label className={layout.placement===v?'is-selected':''} key={v}><input type="radio" name={`positions-${reach.id}-${kind}`} checked={layout.placement===v} onChange={()=>patch({placement:v})} />{label}</label>)}</div></fieldset>
              {layout.placement==='spacing'&&<div className="cns-thickness joint-spacing-fields"><NumberField label="First joint chainage" value={layout.firstChainage} onChange={firstChainage=>patch({firstChainage})} /><NumberField label="Distance between joints" value={layout.spacingM} onChange={spacingM=>patch({spacingM})} /></div>}
              {layout.placement==='locations'&&<label className="joint-text-field"><span>Joint chainages (m)</span><textarea placeholder="For example: 10, 20, 35" value={layout.locationsText} onChange={e=>patch({locationsText:e.target.value})} /></label>}
              <p className="cns-help">Chainages are absolute metres along the canal. Only entered or generated positions count; reach ends are not added automatically. Repeated chainages count once. A shared boundary joint scheduled in both reaches belongs to the following reach.</p>
            </>}
            {layout.direction==='longitudinal'&&<fieldset><legend>5. How far do these joint lines run?</legend>
              <div className="cns-choices">{([['full','Entire reach'],['parts','Specified chainage intervals'],['approved','Approved schedule total']] as const).map(([mode,label])=><label key={mode} className={layout.longitudinalMode===mode?'is-selected':''}><input type="radio" name={`joint-length-mode-${reach.id}-${kind}`} checked={layout.longitudinalMode===mode} onChange={()=>patch({longitudinalMode:mode})} />{label}</label>)}</div>
              {layout.longitudinalMode==='full'&&<><p className="cns-help">Reach length: {n(reach.toChainage-reach.fromChainage)} m. Enter how many full-length lines the drawing shows on each surface.</p><div className="cns-thickness">{layout.surfaces.map(s=><NumberField key={s} label={`${chapterSurfaceLabels[s]} — joint lines`} unit="lines" whole value={layout.longitudinalLines?.[s]??null} onChange={value=>patch({longitudinalLines:{bed:null,left:null,right:null,...layout.longitudinalLines,[s]:value}})} />)}</div></>}
              {layout.longitudinalMode==='parts'&&layout.surfaces.map(surface=>{
                const runs=layout.longitudinalRuns?.[surface]??[]
                const setRuns=(next:typeof runs):void=>patch({longitudinalRuns:{bed:[],left:[],right:[],...layout.longitudinalRuns,[surface]:next}})
                return <div className="joint-run-group" key={surface}><strong>{chapterSurfaceLabels[surface]}</strong>{runs.map((run,index)=><div className="joint-run-row" key={index}><NumberField label="From chainage" value={run.fromChainage} onChange={fromChainage=>setRuns(runs.map((v,i)=>i===index?{...v,fromChainage}:v))} /><NumberField label="To chainage" value={run.toChainage} onChange={toChainage=>setRuns(runs.map((v,i)=>i===index?{...v,toChainage}:v))} /><NumberField label="Parallel lines" unit="lines" whole value={run.lines} onChange={lines=>setRuns(runs.map((v,i)=>i===index?{...v,lines}:v))} /><button type="button" className="joint-run-remove" onClick={()=>setRuns(runs.filter((_,i)=>i!==index))}>Remove</button></div>)}<button type="button" className="joint-run-add" onClick={()=>setRuns([...runs,{fromChainage:null,toChainage:null,lines:null}])}>Add joint run</button></div>
              })}
              {layout.longitudinalMode==='approved'&&<div className="cns-thickness">{layout.surfaces.map(s=><NumberField key={s} label={`${chapterSurfaceLabels[s]} — approved total`} value={layout.longitudinalLengths[s]} onChange={v=>patch({longitudinalLengths:{...layout.longitudinalLengths,[s]:v}})} />)}</div>}
              {layout.longitudinalMode&&<p className="cns-help">{layout.longitudinalMode==='approved'?'Use the approved drawing quantity for irregular paths.':'Measured RM = sum of each line count × its chainage interval. Confirm the locations and number of lines against the drawing.'}</p>}
              {layout.longitudinalMode&&longitudinalJointMeasurement(reach,layout).errors.length===0&&<p className="cns-included">Calculated joint length: <strong>{n(Object.values(longitudinalJointMeasurement(reach,layout).lengths).reduce((sum,v)=>sum+v,0))} RM</strong>.</p>}
            </fieldset>}
            {layout.direction&&<LayoutPreview reach={reach} layout={layout} work={work} />}
          </>}
          {work&&<div className="cns-results"><strong>{layout.direction==='transverse'?`${work.locations.length} scheduled locations`:layout.longitudinalMode==='approved'?'Approved longitudinal schedule':'Calculated longitudinal layout'} · {n(work.totalLength)} running metres</strong>
            {work.lines.map(line=><p key={line.code}>{line.code}: <b>{n(line.quantity)} RM</b></p>)}
            {layout.direction==='transverse'&&<p>At each joint: selected bed width + selected developed side lengths. Total = sum of these lengths at every joint chainage.</p>}
            {layout.direction==='longitudinal'&&<p>Total = {layout.longitudinalMode==='approved'?'approved joint lengths':'calculated line lengths'} on the selected surfaces, grouped by their resolved SSR code.</p>}
            {!!work.errors.length&&<div className="cns-errors" role="status">{work.errors.map(e=><p key={e}>{e}</p>)}</div>}
            {!!work.rows.length&&<details><summary>View length at each joint</summary><div className="cns-table-scroll"><table><thead><tr><th>Ch m</th><th>Bed m</th><th>Left m</th><th>Right m</th><th>Total RM</th></tr></thead><tbody>{work.rows.map(row=><tr key={row.chainage}><td>{n(row.chainage)}</td>{chapterSurfaces.map(s=><td key={s}>{row.shared.includes(s)?'Following reach':row.lengths[s]!=null?n(row.lengths[s]!):'—'}</td>)}<td>{n(row.total)}</td></tr>)}</tbody></table></div></details>}
            {codes.map(code=><details className="lining-ssr" key={code}><summary>{code} description</summary><p>{liningCatalogueItem(code)?.description}</p></details>)}
          </div>}
        </section>
      })}
    </>}
    <div className="joint-excavation"><strong>Automatic extra excavation for these joints: 0 m³</strong><p>The listed joint items form or fill gaps in the lining. Chapters 1 and 2 already measure lining and CNS preparation. A separately drawn soil trench or seating recess needs its own excavation measurement; it is not inferred from joint spacing or board depth.</p></div>
    {c.required===true&&!!q.errors.length&&<div className="cns-errors" role="status">{quantityErrors.map(e=><p key={e}>{e}</p>)}<p>Separate Chapter 3 items are excluded until resolved. Chapters 1 and 2 retain their valid quantities.</p></div>}
    {!!issues.length&&<div className="joint-issue-links">{issues.map(issue=><button type="button" key={issue.message} onClick={()=>goToIssue(issue)}>{issue.message} →</button>)}</div>}
    <footer><span>{c.completed&&!designErrors.length?quantityErrors.length?'Chapter 3 design complete; quantities pending.':'Chapter 3 complete':issues.length?'Click Complete to find and fix the missing answers.':'Answers save automatically.'}</span><div className="lining-footer-actions"><button type="button" className={`btn ${c.completed&&!designErrors.length?'secondary':'primary'}`} onClick={completeChapter}>{c.completed&&!designErrors.length?'Completed':'Complete Chapter 3'}</button>{c.completed&&!designErrors.length&&<button type="button" className="btn primary" onClick={onNext}>Next: Drainage →</button>}</div></footer>
  </div>
}
