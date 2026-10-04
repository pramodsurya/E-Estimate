/** SLRB's calculation owner. The UI, generated items, PDF and Excel all consume
 * this model. It measures adopted geometry; it does not reuse the audited
 * spreadsheets' structural-safety labels or substitute a guessed missing value. */
import type { ProjectNode } from '../types/project'
import type { SlrbData, SlrbSolid, SlrbSpan, SlrbSupport, SlrbWork, SlrbMeasurement, SlrbOutputModel } from '../types/slrb'
import { createNode, findNode, newId, patchNode } from './tree'
import { resolveSlrbContext } from './slrbContext'

export const SLRB_CALCULATION_VERSION = 'slrb-measurement/1.0.0'
export const slrbDetailId = (id: string): string => id + '::slrbdetail'
export const parseSlrbDetailId = (id: string | null | undefined): string | null => id?.endsWith('::slrbdetail') ? id.slice(0,-12) : null
export const slrbSolid = (): SlrbSolid => ({shape:'rectangle',length:null,width:null,bottomWidth:null,height:null,grade:'unknown'})
export function slrbSupport(id: string, kind: SlrbSupport['kind']): SlrbSupport {
  return {id,kind,body:slrbSolid(),capPresence:'unknown',cap:slrbSolid(),bearingStack:null,
    footingType:'unknown',footing:slrbSolid(),footingLevelMode:'absolute',footingTopRl:null,footingBedOffset:null,
    beddingPresence:'unknown',bedding:slrbSolid(),excavationPresence:'unknown',excavation:slrbSolid()}
}
export function defaultSlrbData(): SlrbData {
  return {schemaVersion:1,packageVersion:'1.0.0',purpose:'unknown',reference:'',sourceStatus:'unknown',loadingBasis:'',datum:'',estimateBasis:'unknown',structuralReview:'',
    crossingAngle:null,slabWidth:null,carriagewayWidth:null,spans:[{id:newId(),clearSpan:null,panelLength:null,thickness:null,grade:'unknown'}],
    supports:[slrbSupport('A1','abutment'),slrbSupport('A2','abutment')],roadLevelMode:'absolute',roadRl:null,roadBankOffset:null,chainageOverride:null,
    wearingPresence:'unknown',wearingThickness:null,wearingGrade:'unknown',wearingWidth:null,
    approaches:['AP1','AP2'].map(id => ({id,presence:'unknown',slab:slrbSolid(),backingPresence:'unknown',backingDepth:null})),
    wallsPresence:'unknown',walls:[],fittingsPresence:'unknown',works:[],reinforcementPresence:'unknown',bars:[],materials:{},materialItems:[],sourceConflicts:[]}
}
export function resizeSlrbLayout(data: SlrbData, count: number): SlrbData {
  const n = Math.max(1,Math.min(12,Math.trunc(count)))
  const spans: SlrbSpan[] = Array.from({length:n},(_,i) => data.spans[i] ?? {id:newId(),clearSpan:null,panelLength:null,thickness:null,grade:'unknown'})
  const ids = ['A1',...Array.from({length:n-1},(_,i) => `P${i+1}`),'A2']
  const supports = ids.map(id => data.supports.find(s => s.id === id) ?? slrbSupport(id,id.startsWith('P') ? 'pier' : 'abutment'))
  return {...data,spans,supports}
}
const positive = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const nonnegative = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
export function slrbUnitKey(unit:string):string {
  const key=unit.trim().toUpperCase().replace(/[\s.]/g,'').replace('³','3').replace('²','2')
  return ({M3:'CUM',CUM:'CUM',KG:'KG',KGS:'KG',SQM:'SQM',M2:'SQM','1SQM':'SQM',RM:'RM',M:'RM',NO:'NO',NOS:'NO',NUMBER:'NO'})[key]??key
}
export function slrbSolidVolume(solid: SlrbSolid, height = solid.height): number | null {
  if (![solid.length,solid.width,height].every(positive)) return null
  const l=solid.length!,w=solid.width!,h=height!
  if (solid.shape === 'stadium') return l >= w ? ((l-w)*w+Math.PI*w*w/4)*h : null
  if (solid.shape === 'trapezoid') return positive(solid.bottomWidth) ? l*(w+solid.bottomWidth)/2*h : null
  return l*w*h
}
export function slrbSolidExpression(solid: SlrbSolid, height = solid.height): string {
  const l=solid.length ?? '?',w=solid.width ?? '?',h=height ?? '?'
  return solid.shape === 'stadium' ? `((${l} − ${w}) × ${w} + π × ${w}² / 4) × ${h}`
    : solid.shape === 'trapezoid' ? `${l} × (${w} + ${solid.bottomWidth ?? '?'}) / 2 × ${h}` : `${l} × ${w} × ${h}`
}
export function slrbWorkUnit(kind: SlrbWork['kind']): SlrbMeasurement['unit'] {
  return kind === 'drain' ? 'NO' : kind === 'joint' ? 'RM' : kind === 'formwork' ? 'SQM' : 'CUM'
}

export function buildSlrbOutputModel(root: ProjectNode, node: ProjectNode): SlrbOutputModel {
  const data = node.slrb ?? defaultSlrbData()
  if(data.schemaVersion!==1) throw new Error('Unsupported SLRB schema. Retain the saved data and install a compatible addon.')
  const context = resolveSlrbContext(root,node,data)
  const issues: SlrbOutputModel['issues'] = []
  const measurements: SlrbMeasurement[] = []
  const heights: SlrbOutputModel['heights'] = {}
  const issue = (chapter:number,memberId:string,message:string): void => {issues.push({chapter,memberId,message})}
  if (context.issue) issue(2,'crossing',context.issue)
  if (!data.reference.trim()) issue(1,'references','Record the drawing, survey or dimension source and revision.')
  if (data.sourceStatus !== 'reviewed') issue(1,'references','Source review remains pending; measurements are a draft.')
  for (const conflict of data.sourceConflicts) if (!conflict.resolved || !conflict.resolution.trim()) issue(1,conflict.id,conflict.message)
  const geometrySupported = data.crossingAngle === 90
  if (!geometrySupported) issue(3,'layout','Confirm a straight, square (90°) crossing. Skew/curved geometry needs a reviewed measurement extension.')
  const widthsValid = positive(data.slabWidth) && positive(data.carriagewayWidth) && data.carriagewayWidth <= data.slabWidth
  if (!widthsValid) issue(3,'width','Enter structural slab and carriageway widths; the carriageway must fit inside the slab.')
  if (data.supports.length !== data.spans.length+1) issue(3,'layout','Rebuild the ordered supports for this span arrangement.')
  const unresolvedConflicts = data.sourceConflicts.some(c => !c.resolved || !c.resolution.trim())
  const canMeasure = geometrySupported && !unresolvedConflicts && !context.needsParentReview
  const add = (id:string,memberId:string,label:string,mappingKey:string,unit:SlrbMeasurement['unit'],quantity:number|null,expression:string,chapter:number,problem?:string): void => {
    const material = data.materials[mappingKey]
    const q = canMeasure && quantity !== null && Number.isFinite(quantity) && quantity >= 0 ? quantity : null
    const message = q === null ? problem ?? (unresolvedConflicts ? 'Resolve the source disagreement before adopting this quantity.' : 'Confirm the supported geometry and complete the shown dimensions.') : undefined
    if (message) issue(chapter,memberId,`${label}: ${message}`)
    const unitValid = material?.unit ? slrbUnitKey(material.unit) === unit : false
    const knownGrades:Record<string,string>={'IRR-CCDW-2-25':'M20','IRR-CCDW-2-10':'M20','IRR-CCDW-2-11':'M15','IRR-CCDW-2-9':'M15','IRR-CCDW-2-3':'M15','IRR-CCDW-2-5':'M10','IRR-CCDW-2-29':'M20'}
    const specifiedGrade=mappingKey.includes('.')?mappingKey.split('.').at(-1):undefined
    const gradeValid=specifiedGrade!=='unknown' && (!material||!knownGrades[material.code]||specifiedGrade===knownGrades[material.code])
    const excavationDepth=data.supports.find(s=>s.id===memberId)?.excavation.height
    const depthValid=material?.code!=='IRR-CCDW-1-2'||!(excavationDepth!==null&&excavationDepth!==undefined&&excavationDepth>3)
    const completeWork=material?.categoryKey ? !['material','labour','machinery'].includes(material.categoryKey) : true
    const billable = Boolean(material?.reviewed && material.scopeNote.trim() && material.code && unitValid && gradeValid && depthValid && completeWork && data.estimateBasis!=='unknown')
    if (q !== null && !billable) issue(8,memberId,`${label}: ${!gradeValid?'the source concrete grade does not match or remains unknown':!depthValid?'this excavation item stops at 3 m depth':!completeWork?'a supply/ingredient price does not cover completed work':`choose and review a compatible ${unit} rate item (${mappingKey})`}.`)
    measurements.push({id,memberId,label,mappingKey,unit,quantity:q,expression,chapter,issue:message,material,billable})
  }
  const wearingDepth = data.wearingPresence === 'none' ? 0 : data.wearingPresence === 'provided' && positive(data.wearingThickness) ? data.wearingThickness : null
  const roadRl = context.mode === 'canal' && data.roadLevelMode === 'above-bank'
    ? context.bankRl !== null && nonnegative(data.roadBankOffset) ? context.bankRl+data.roadBankOffset : null
    : Number.isFinite(data.roadRl) && data.roadRl !== null ? data.roadRl : null
  data.spans.forEach((span,index) => {
    if(!positive(span.clearSpan)) issue(3,span.id,`Span ${index+1}: confirm the clear opening between support faces.`)
    const panelValid = positive(data.slabWidth) && positive(span.panelLength) && (span.clearSpan===null||positive(span.clearSpan)&&span.panelLength>=span.clearSpan)
    const valid = panelValid && positive(span.thickness)
    add(`${span.id}.deck`,span.id,`Span ${index+1} — deck concrete`,`deck.${span.grade}`,'CUM',valid ? span.panelLength!*data.slabWidth!*span.thickness! : null,`${span.panelLength ?? '?'} × ${data.slabWidth ?? '?'} × ${span.thickness ?? '?'}`,4)
    if (data.wearingPresence !== 'none') {
      const wearingValid = panelValid && data.wearingPresence === 'provided' && positive(wearingDepth) && positive(data.wearingWidth) && data.wearingWidth <= data.slabWidth!
      add(`${span.id}.wearing`,span.id,`Span ${index+1} — wearing coat`,`wearing.${data.wearingGrade}`,'CUM',wearingValid ? span.panelLength!*data.wearingWidth!*wearingDepth! : null,`${span.panelLength ?? '?'} × ${data.wearingWidth ?? '?'} × ${wearingDepth ?? '?'}`,4,'Confirm the wearing layer, thickness and covered width, or explicitly mark it absent.')
    }
  })
  const solidRow = (id:string,memberId:string,label:string,solid:SlrbSolid,role:string,chapter:number,height=solid.height): void =>
    add(id,memberId,label,`${role}.${solid.grade}`,'CUM',slrbSolidVolume(solid,height),slrbSolidExpression(solid,height),chapter)
  data.supports.forEach((support,index) => {
    let height = support.body.height
    if (context.mode === 'canal') {
      const panels = [data.spans[index-1],data.spans[index]].filter((s):s is SlrbSpan => Boolean(s))
      const uniform = panels.length > 0 && panels.every(s => positive(s.thickness) && s.thickness === panels[0].thickness)
      const capDepth = support.capPresence === 'none' ? 0 : support.capPresence === 'provided' && positive(support.cap.height) ? support.cap.height : null
      const footingRl = support.footingLevelMode === 'below-bed' ? context.bedRl !== null && nonnegative(support.footingBedOffset) ? context.bedRl-support.footingBedOffset : null : support.footingTopRl
      height = !context.issue && data.datum.trim() && roadRl !== null && uniform && wearingDepth !== null && capDepth !== null && nonnegative(support.bearingStack) && footingRl !== null && Number.isFinite(footingRl)
        ? roadRl-wearingDepth-panels[0].thickness!-support.bearingStack-capDepth-footingRl : null
      if (!positive(height)) height = null
      if (height === null) issue(2,support.id,`${support.id}: height needs a confirmed crossing, common level datum, road level, deck/wearing/bearing/cap stack and footing-top level. Unequal adjacent deck depths need a reviewed stepped-support detail.`)
    }
    heights[support.id] = positive(height) && !context.needsParentReview ? height : null
    solidRow(`${support.id}.body`,support.id,`${support.id} — ${support.kind} body`,support.body,support.kind,5,heights[support.id])
    if (support.capPresence !== 'none') solidRow(`${support.id}.cap`,support.id,`${support.id} — cap`,support.cap,'cap',5,support.capPresence === 'provided' ? support.cap.height : null)
    if (support.footingType === 'spread') solidRow(`${support.id}.footing`,support.id,`${support.id} — spread footing`,support.footing,'footing',5)
    else add(`${support.id}.footing`,support.id,`${support.id} — foundation`,'foundation.unknown','CUM',null,'Await foundation detail',5,support.footingType === 'other' ? 'Piles or other foundations need a reviewed schedule/extension.' : 'Identify the specified foundation type.')
    if (support.beddingPresence !== 'none') solidRow(`${support.id}.bedding`,support.id,`${support.id} — bedding`,support.bedding,'bedding',5,support.beddingPresence === 'provided' ? support.bedding.height : null)
    if (support.excavationPresence !== 'none') add(`${support.id}.excavation`,support.id,`${support.id} — excavation`,'excavation','CUM',support.excavationPresence === 'provided' ? slrbSolidVolume({...support.excavation,shape:'rectangle'}) : null,slrbSolidExpression({...support.excavation,shape:'rectangle'}),5)
  })
  for (const approach of data.approaches) {
    if (approach.presence === 'none') continue
    solidRow(`${approach.id}.slab`,approach.id,`${approach.id} — approach slab`,approach.slab,'approach',4,approach.presence === 'provided' ? approach.slab.height : null)
    if (approach.backingPresence !== 'none') add(`${approach.id}.backing`,approach.id,`${approach.id} — gravel backing`,'gravel','CUM',approach.presence === 'provided' && approach.backingPresence === 'provided' && [approach.slab.length,approach.slab.width,approach.backingDepth].every(positive) ? approach.slab.length!*approach.slab.width!*approach.backingDepth! : null,`${approach.slab.length ?? '?'} × ${approach.slab.width ?? '?'} × ${approach.backingDepth ?? '?'}`,4)
  }
  if (data.wallsPresence === 'unknown' || data.wallsPresence === 'provided' && !data.walls.length) issue(6,'walls','Confirm the end walls, add each wall detail, or mark walls absent.')
  if (data.wallsPresence === 'provided') for (const wall of data.walls) {
    const valid = [wall.length,wall.topThickness,wall.bottomThickness].every(positive) && [wall.startHeight,wall.endHeight].every(nonnegative) && (wall.startHeight!+wall.endHeight!) > 0
    add(`${wall.id}.wall`,wall.id,wall.label,`wall.${wall.grade}`,'CUM',valid ? wall.length!*(wall.topThickness!+wall.bottomThickness!)/2*(wall.startHeight!+wall.endHeight!)/2 : null,`${wall.length ?? '?'} × (${wall.topThickness ?? '?'} + ${wall.bottomThickness ?? '?'}) / 2 × (${wall.startHeight ?? '?'} + ${wall.endHeight ?? '?'}) / 2`,6)
    if (wall.footingPresence !== 'none') solidRow(`${wall.id}.footing`,wall.id,`${wall.label} — footing`,wall.footing,'footing',6,wall.footingPresence === 'provided' ? wall.footing.height : null)
  }
  if (data.fittingsPresence === 'unknown' || data.fittingsPresence === 'provided' && !data.works.length) issue(6,'fittings','Confirm kerbs, edge protection, joints and drains; unknown fittings remain pending.')
  if (data.fittingsPresence === 'provided') for (const work of data.works) {
    if (work.presence === 'none') continue
    const unit = slrbWorkUnit(work.kind)
    const isConcrete = work.kind === 'kerb' || work.kind === 'rail-concrete'
    const quantity = work.presence !== 'provided' ? null : isConcrete
      ? [work.length,work.width,work.depth,work.count].every(positive) && Number.isInteger(work.count) ? work.length!*work.width!*work.depth!*work.count! : null
      : positive(work.quantity) && (unit !== 'NO' || Number.isInteger(work.quantity)) ? work.quantity : null
    const key = isConcrete ? `${work.kind}.${work.grade}` : work.kind
    add(`${work.id}.work`,work.id,work.label,key,unit,quantity,isConcrete ? `${work.count ?? '?'} × ${work.length ?? '?'} × ${work.width ?? '?'} × ${work.depth ?? '?'}` : `Reviewed measurement: ${work.quantity ?? '?'}`,6)
    const row = measurements[measurements.length-1]
    const overlaps = work.kind === 'formwork' && measurements.some(m => m.material?.includesFormwork) || work.kind === 'fill' && measurements.some(m => m.material?.includesBackfill)
    if (overlaps && (!work.distinctScope || !work.reference.trim())) {row.billable=false;issue(8,work.id,`${work.label}: the chosen completed-work item already includes this work. Identify a distinct physical scope and reference before billing it separately.`)}
  }
  if (data.reinforcementPresence !== 'none') {
    if (data.reinforcementPresence === 'unknown' || !data.bars.length) issue(7,'steel','Use the complete reviewed bar schedule; spacing alone cannot establish steel tonnage.')
    const memberIds = new Set([...data.spans.map(s=>s.id),...data.supports.map(s=>s.id),...data.approaches.map(s=>s.id),...data.walls.map(s=>s.id),...data.works.map(s=>s.id)])
    for (const bar of data.bars) {
      const valid = data.reinforcementPresence === 'provided' && memberIds.has(bar.memberId) && positive(bar.diameterMm) && positive(bar.count) && Number.isInteger(bar.count) && positive(bar.cutLengthM) && bar.reviewed && bar.shape.trim() && bar.reference.trim()
      add(`${bar.id}.steel`,bar.memberId,`${bar.memberId} — bar ${bar.mark || '?'}`,'steel','KG',valid ? Math.PI/4*(bar.diameterMm!/1000)**2*7850*bar.cutLengthM!*bar.count! : null,`${bar.count ?? '?'} × ${bar.cutLengthM ?? '?'} × π / 4 × (${bar.diameterMm ?? '?'} / 1000)² × 7850`,7,'Provide diameter, whole bar count, full cut length including bends/hooks/laps, shape, source and schedule review.')
    }
  }
  const measurementsReady = measurements.every(m=>m.quantity!==null) && !issues.some(i=>i.chapter===3||i.chapter===6||i.chapter===7) && !unresolvedConflicts && geometrySupported
  return {version:SLRB_CALCULATION_VERSION,context,roadRl,heights,measurements,issues,measurementsReady,
    mappingsReady:measurementsReady&&measurements.every(m=>m.billable),designStatus:'Review required'}
}

/** Host-controlled projection into ordinary items. Stable measurement keys keep
 * quantities attached to the same members and never overwrite hand-added rows. */
export function syncSlrbItems(root: ProjectNode, componentId: string): ProjectNode {
  const node=findNode(root,componentId)
  if (!node?.slrb || node.templateId!=='slrb') return root
  if(node.slrb.schemaVersion!==1) return root
  const model=buildSlrbOutputModel(root,node)
  const previous=new Map(node.slrb.materialItems.map(entry=>[entry.key,entry.itemNodeId]))
  const nextRegistry: SlrbData['materialItems']=[]
  const generated: ProjectNode[]=[]
  for (const row of model.measurements) {
    if (row.quantity===null||!row.billable||!row.material) continue
    const ref=row.material
    const id=previous.get(row.id)
    const existing=id ? node.children.find(child=>child.id===id&&child.templateGenerated&&child.templateOwnerId===node.id) : undefined
    const patch: Partial<ProjectNode>={name:row.label,itemCode:ref.code,itemDescription:ref.description??row.label,
      itemSource:ref.side??'SSR',categoryKey:ref.categoryKey??'ssr_item',unit:row.unit,projectDataId:ref.projectDataId,
      dataVariant:ref.dataVariant,sorCatalogue:ref.sorCatalogue,computedQuantity:row.quantity,templateGenerated:true,
      templateOwnerId:node.id,templateItemRole:'slrb',templateMeasurementKey:row.id,itemEditorType:'spreadsheet',spreadsheet:undefined,finalCell:undefined}
    const item=existing ? {...existing,...patch} : createNode('item',row.label,patch)
    generated.push(item);nextRegistry.push({key:row.id,itemNodeId:item.id})
  }
  const context=model.context
  const data: SlrbData={...node.slrb,materialItems:nextRegistry,
    acceptedParentId:node.slrb.acceptedParentId===undefined ? context.mode==='canal' ? context.parentId : null : node.slrb.acceptedParentId,
    ...(context.mode==='canal'&&!context.issue ? {lastResolvedParent:{parentId:context.parentId,parentName:context.parentName,revision:context.revision,chainage:context.chainage,bedRl:context.bedRl,fsl:context.fsl,bankRl:context.bankRl}} : {})}
  const children=[...node.children.filter(child=>!(child.templateGenerated&&child.templateOwnerId===node.id)),...generated]
  if (JSON.stringify(data)===JSON.stringify(node.slrb)&&JSON.stringify(children)===JSON.stringify(node.children)) return root
  return patchNode(root,node.id,{slrb:data,children})
}
export function syncAllSlrbItems(root: ProjectNode): ProjectNode {
  let next=root
  const visit=(node:ProjectNode):void=>{if(node.templateId==='slrb') next=syncSlrbItems(next,node.id);node.children.forEach(visit)}
  visit(root);return next
}
