import type { EestimateProject, ProjectNode } from '../types/project'
import type { SlrbOutputModel } from '../types/slrb'
import { buildSlrbOutputModel } from './slrb'
import { slrbDrawingSvg } from './slrbDrawing'
import type { ComponentDetailSheetPayload } from './excel-output/componentExcel'
import type { GridCell } from './excel-output/detailGrid'

/** The workbook needs member occurrences, whereas DATA intentionally groups
 * shared catalogue codes. Keep those two identities separate for SLRB rows. */
export function slrbExcelItemKey(node:ProjectNode,dataKey:string):string {
  return node.templateItemRole==='slrb' && node.templateMeasurementKey
    ? `${dataKey}::SLRB:${node.templateOwnerId}:${node.templateMeasurementKey}` : dataKey
}

export function slrbReportData(project:EestimateProject,node:ProjectNode) {
  const model=buildSlrbOutputModel(project.root,node)
  return {name:node.name,version:model.version,reference:node.slrb?.reference??'',source_status:node.slrb?.sourceStatus??'unknown',
    design_review:node.slrb?.structuralReview||'Structural verification has not been performed by this measurement addon.',
    location:node.location ? `${node.location.lat}, ${node.location.lng}` : 'Location pending',
    context:model.context.mode==='canal' ? `${model.context.parentName}; crossing ${model.context.chainage??'pending'} m; revision ${model.context.revision}` : 'Standalone / other parent — entered member heights',
    canal:model.context.mode==='canal' ? {bed:model.context.bedRl,fsl:model.context.fsl,bank:model.context.bankRl}:null,
    readiness:{measurements:model.measurementsReady?'Ready':'Partial — needs information',mappings:model.mappingsReady?'Mapped — use host Sync for prices':'Rate-item review pending',design:model.designStatus},
    drawing:node.slrb?slrbDrawingSvg(node.slrb,model.heights):'',
    rows:model.measurements.map(row=>({member:row.memberId,label:row.label,expression:row.expression,quantity:row.quantity,unit:row.unit,code:row.material?.code??'',status:row.quantity===null?'Needs dimensions':row.billable?'Mapped':'Rate item pending'})),
    issues:model.issues.map(issue=>`Chapter ${issue.chapter} · ${issue.memberId}: ${issue.message}`)}
}

/** The same immutable measurement values feed the native workbook and PDF.
 * Abstract quantities reference these numeric cells; no second geometry solver. */
export function slrbExcelPlan(model:SlrbOutputModel,name='SLRB Measurements'): {sheet:ComponentDetailSheetPayload;refs:Map<string,{r:number;c:number}>} {
  const cells:GridCell[]=[]
  const refs=new Map<string,{r:number;c:number}>()
  const add=(r:number,values:Array<string|number|null>):void=>{values.forEach((value,c)=>cells.push({r,c,value,style:{wrap:true,...(r<5?{bold:true}:{} )}}))}
  add(0,['SLRB measurement statement',model.version])
  add(1,['Measurements',model.measurementsReady?'Ready':'Partial — needs information'])
  add(2,['Rate items',model.mappingsReady?'Mapped; use host Sync':'Pending'])
  add(3,['Design checks',model.designStatus])
  add(4,['Member','Work','Expression','Quantity','Unit','Code','Status'])
  model.measurements.forEach((row,index)=>{
    const r=index+5
    add(r,[row.memberId,row.label,row.expression,row.quantity,row.unit,row.material?.code??'',row.quantity===null?'Needs information':row.billable?'Mapped':'Code pending'])
    if(row.quantity!==null&&row.billable) refs.set(row.id,{r,c:3})
  })
  let r=model.measurements.length+6
  for(const issue of model.issues) add(r++,[`Chapter ${issue.chapter}`,issue.memberId,issue.message])
  return {sheet:{name,landscape:true,grid:{cells,merges:[],colWidthsChars:[14,34,50,16,10,24,32],rowHeightsPt:Array(r).fill(32),images:[],rowBreaks:[]}},refs}
}
