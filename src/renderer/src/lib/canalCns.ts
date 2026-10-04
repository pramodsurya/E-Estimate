import { canalStrataTopRl, ermClassIndex, ermLastEnteredLayer, ERM_CLASS_CODES } from './canalErm'
import type { CanalCnsChapter, CanalData, CanalLiningReach, CanalPoint, CanalSection, CanalBankMaterialZone } from '../types/project'
import { canalBedLevelAt, canalDesignAtChainage, canalDesignProfile, canalGroundLevelAt, canalHeartingSection, canalSectionBankTier, canalStrippingBands, canalFoundationExcavationBands, orderedCanalSections, profileDifferenceBands } from './canal'
import { liningBackingOffsets, measureLiningChapter } from './canalLiningChapter'

const EPS = 1e-8
type Polygon = CanalPoint[]
type Range = [number, number]
export const defaultCnsChapter = (): CanalCnsChapter => ({ version: 1, required: null, coverage: null, bedThicknessMm: null, sideThicknessMm: null, source: null, compaction: null })
export function normalizeCnsChapter(raw: CanalCnsChapter): CanalCnsChapter {
  const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
  return { version: 1, completed: raw.completed === true, required: typeof raw.required === 'boolean' ? raw.required : null,
    coverage: ['bed', 'bed-and-sides'].includes(raw.coverage ?? '') ? raw.coverage : null,
    bedThicknessMm: number(raw.bedThicknessMm), sideThicknessMm: number(raw.sideThicknessMm),
    source: ['borrow', 'excavated-heaps'].includes(raw.source ?? '') ? raw.source : null,
    compaction: raw.source === 'excavated-heaps' ? 95 : raw.compaction === 95 || raw.compaction === 98 ? raw.compaction : null }
}
export function cnsCode(c: CanalCnsChapter): string | null {
  if (c.required !== true) return null
  if (c.source === 'excavated-heaps') return 'IRR-CAW-7-3'
  return c.source === 'borrow' && c.compaction != null ? `IRR-CAW-7-${c.compaction === 98 ? 1 : 2}` : null
}
export interface CnsSectionRow {
  chainage: number; polygon: Polygon; ground: Polygon; profile: Polygon;
  cns: number; excavation: number; replacement: number; alreadyExcavated: number;
  zones: Record<CanalBankMaterialZone, number>; excavationByCode: Record<string, number>;
}
export interface CnsMeasurement {
  code: string | null; rows: CnsSectionRow[]; errors: string[];
  cns: number; excavation: number; replacement: number;
  zones: Record<CanalBankMaterialZone, number>; excavationByCode: Record<string, number>;
}
const emptyZones = (): Record<CanalBankMaterialZone, number> => ({ homogeneous: 0, hearting: 0, casing: 0 })

/** Build one offset polygon, with mitred corners shared by bed and sides. */
export function cnsSectionPolygon(data: CanalData, chainage: number, c: CanalCnsChapter): Polygon {
  return treatmentLayerPolygon(data, chainage, { bed: 0, left: 0, right: 0 }, { bed: (c.bedThicknessMm ?? 0) / 1000, left: c.coverage === 'bed-and-sides' ? (c.sideThicknessMm ?? 0) / 1000 : 0, right: c.coverage === 'bed-and-sides' ? (c.sideThicknessMm ?? 0) / 1000 : 0 })
}

/** Normal offsets preserve the finished opening and share mitred corners exactly once. */
export function treatmentLayerPolygon(data: CanalData, chainage: number, start: Record<'bed' | 'left' | 'right', number>, end: Record<'bed' | 'left' | 'right', number>): Polygon {
  const design = canalDesignAtChainage(data.design, chainage)
  const bed = canalBedLevelAt(data, chainage) ?? 0
  const half = design.bedWidth / 2
  if (!start.left && !start.right && !end.left && !end.right) return [{ offset: -half, rl: bed - start.bed }, { offset: half, rl: bed - start.bed }, { offset: half, rl: bed - end.bed }, { offset: -half, rl: bed - end.bed }]
  const height = design.fullSupplyDepth + design.freeBoard
  const side = (name: 'left' | 'right'): Polygon => {
    const sign = name === 'left' ? -1 : 1
    let x = half; let h = 0
    const p: Polygon = [{ offset: sign * x, rl: bed }]
    const shelves = design.berms.filter(b => b.face === `${name}-canal` && b.width > 0 && b.heightAboveBed > 0 && b.heightAboveBed < height).sort((a,b) => a.heightAboveBed - b.heightAboveBed)
    for (const b of shelves) {
      x += (b.heightAboveBed - h) * design.sideSlope; h = b.heightAboveBed
      p.push({ offset: sign * x, rl: bed + h }); x += b.width; p.push({ offset: sign * x, rl: bed + h })
    }
    x += (height - h) * design.sideSlope; p.push({ offset: sign * x, rl: bed + height })
    return p
  }
  const inner = [...side('left').reverse(), ...side('right')]
  const offsetProfile = (thickness: typeof start): Polygon => {
  const edges = inner.slice(1).map((b,i) => {
    const a = inner[i]; const dx = b.offset-a.offset; const dy=b.rl-a.rl; const length=Math.hypot(dx,dy)
    const t = Math.abs(a.rl-bed)<EPS && Math.abs(b.rl-bed)<EPS ? thickness.bed : thickness[(a.offset+b.offset)/2 < 0 ? 'left' : 'right']
    return { a: { offset:a.offset+dy/length*t, rl:a.rl-dx/length*t }, b:{offset:b.offset+dy/length*t,rl:b.rl-dx/length*t}, dx,dy }
  })
  const outer: Polygon = [edges[0].a]
  for(let i=1;i<edges.length;i++) {
    const a=edges[i-1];const b=edges[i];const det=a.dx*b.dy-a.dy*b.dx
    if(Math.abs(det)<EPS) { outer.push(a.b); continue }
    const u=((b.a.offset-a.a.offset)*b.dy-(b.a.rl-a.a.rl)*b.dx)/det
    outer.push({offset:a.a.offset+u*a.dx,rl:a.a.rl+u*a.dy})
  }
  outer.push(edges[edges.length-1].b)
  return outer
  }
  return [...offsetProfile(start), ...offsetProfile(end).reverse()]
}

function ranges(p: Polygon, x: number): Range[] {
  const ys: number[]=[]
  for(let i=0;i<p.length;i++) { const a=p[i],b=p[(i+1)%p.length]
    if(x>Math.min(a.offset,b.offset)&&x<Math.max(a.offset,b.offset)) ys.push(a.rl+(b.rl-a.rl)*(x-a.offset)/(b.offset-a.offset))
  }
  ys.sort((a,b)=>a-b);return ys.flatMap((y,i)=>i%2===0&&ys[i+1]!=null?[[y,ys[i+1]] as Range]:[])
}
const contains = (polys: Polygon[],x:number,y:number): boolean => polys.some(p=>ranges(p,x).some(([a,b])=>y>a-EPS&&y<b+EPS))

/** Exact vertical-slice integration: split at every edge vertex and intersection. */
function integrate(polys: Polygon[], apply: (x:number,y:number,area:number)=>void): void {
  const edges=polys.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]] as [CanalPoint,CanalPoint]))
  const xs=polys.flatMap(p=>p.map(v=>v.offset))
  for(let i=0;i<edges.length;i++) for(let j=i+1;j<edges.length;j++) {
    const [a,b]=edges[i], [c,d]=edges[j];const ux=b.offset-a.offset,uy=b.rl-a.rl,vx=d.offset-c.offset,vy=d.rl-c.rl
    const det=ux*vy-uy*vx;if(Math.abs(det)<EPS)continue
    const t=((c.offset-a.offset)*vy-(c.rl-a.rl)*vx)/det
    const u=((c.offset-a.offset)*uy-(c.rl-a.rl)*ux)/det
    if(t>0&&t<1&&u>0&&u<1)xs.push(a.offset+t*ux)
  }
  const sorted=[...new Set(xs)].sort((a,b)=>a-b)
  for(let i=1;i<sorted.length;i++) {
    const width=sorted[i]-sorted[i-1];if(width<EPS)continue
    const x=(sorted[i]+sorted[i-1])/2
    const ys=[...new Set(polys.flatMap(p=>ranges(p,x).flat()))].sort((a,b)=>a-b)
    for(let j=1;j<ys.length;j++)apply(x,(ys[j]+ys[j-1])/2,width*(ys[j]-ys[j-1]))
  }
}

export function treatmentSectionAt(data:CanalData,ch:number):CanalSection|null {
  const sections=orderedCanalSections(data);const exact=sections.find(s=>Math.abs(s.chainage-ch)<EPS)
  if(exact)return exact
  const left=sections.filter(s=>s.chainage<ch).at(-1),right=sections.find(s=>s.chainage>ch)
  if(!left||!right||left.ground.length<2||right.ground.length<2||left.designPopulated===false||right.designPopulated===false)return null
  const fraction=(ch-left.chainage)/(right.chainage-left.chainage)
  const offsets=[...new Set([...left.ground,...right.ground].map(p=>p.offset))].sort((a,b)=>a-b)
  const ground=offsets.map(offset=>({offset,rl:(canalGroundLevelAt(left.ground,offset)??0)*(1-fraction)+(canalGroundLevelAt(right.ground,offset)??0)*fraction}))
  const strata=left.strata?.map((s,i)=>({...s,thickness:s.thickness*(1-fraction)+(right.strata?.[i]?.thickness??s.thickness)*fraction}))
  return {...left,id:`cns-${ch}`,chainage:ch,ground,strata,strataLastEnteredId:undefined,strataTopRl:canalStrataTopRl(left)*(1-fraction)+canalStrataTopRl(right)*fraction,strataExtent:left.strataExtent==='limited'||right.strataExtent==='limited'?'limited':left.strataExtent,leftToeRl:ground[0]?.rl,rightToeRl:ground.at(-1)?.rl}
}

function rowAt(data:CanalData,section:CanalSection,polygon:Polygon):CnsSectionRow {
  const ground=section.ground;const profile=canalDesignProfile(data,section)
  const bands=profileDifferenceBands(ground,profile)
  const strip=canalStrippingBands(data,section)
  const coreSection=canalHeartingSection(data,section)
  const cores=coreSection.profiles
  const already=[...bands.filter(b=>b.cutting).map(b=>b.points),...strip,...canalFoundationExcavationBands(data,section),...coreSection.trenches]
  const fills=[...bands.filter(b=>!b.cutting).map(b=>b.points),...strip]
  const hearting=cores.flatMap(p=>p.pieces??[p.points])
  const row:CnsSectionRow={chainage:section.chainage,polygon,ground,profile,cns:0,excavation:0,replacement:0,alreadyExcavated:0,zones:emptyZones(),excavationByCode:{}}
  const min=Math.min(...polygon.map(p=>p.rl))-1
  const span=[Math.min(...polygon.map(p=>p.offset))-1,Math.max(...polygon.map(p=>p.offset))+1]
  const strata=section.strata??[];const gl=canalStrataTopRl(section)
  let current=gl
  const continuingIndex=ermLastEnteredLayer(section)?.index??(section.strataExtent!=='limited'?strata.length-1:-1)
  const geology=strata.map((s,i)=>{const top=current;current-=s.thickness;return {top,bottom:i===continuingIndex?Math.min(min,current):current,code:(s.ermClass?data.excavationBands.find(b=>b.material?.code===ERM_CLASS_CODES[ermClassIndex(s,i)])??data.excavationBands[ermClassIndex(s,i)]:data.excavationBands[i])?.material?.code??''}})
  const geologyPolys=geology.map(s=>[{offset:span[0],rl:s.top},{offset:span[1],rl:s.top},{offset:span[1],rl:s.bottom},{offset:span[0],rl:s.bottom}])
  const groundPoly=[...ground,{offset:ground.at(-1)!.offset,rl:min},{offset:ground[0].offset,rl:min}]
  integrate([polygon,groundPoly,...already,...fills,...hearting,...geologyPolys],(x,y,area)=>{
    if(!contains([polygon],x,y))return
    row.cns+=area
    if(contains(fills,x,y)) {
      row.replacement+=area
      const side=x<0?'left':'right';const tier=canalSectionBankTier(data,section,side)
      const legacyZoned=data.design.bankSectionType==='zoned'&&(data.design.zonedReaches??[]).length>0
      const zoned=legacyZoned?true:tier?tier.sectionType==='zoned':data.design.bankSectionType==='zoned'
      const zone:CanalBankMaterialZone=zoned?(contains(hearting,x,y)?'hearting':'casing'):'homogeneous'
      row.zones[zone]+=area
    } else if(contains([groundPoly],x,y)&&!contains(already,x,y)) {
      row.excavation+=area
      const code=geology.find(s=>y<=s.top+EPS&&y>=s.bottom-EPS)?.code
      if(code)row.excavationByCode[code]=(row.excavationByCode[code]??0)+area
    } else if(contains(already,x,y))row.alreadyExcavated+=area
  })
  // Without stratigraphy, use the explicitly configured excavation shares.
  if(!strata.length)for(const b of data.excavationBands)if(b.material?.code)row.excavationByCode[b.material.code]=(row.excavationByCode[b.material.code]??0)+row.excavation*Math.max(0,b.pct)/100
  return row
}

export function measureCnsReach(data:CanalData,reach:CanalLiningReach):CnsMeasurement {
  const c=normalizeCnsChapter(reach.cnsChapter??defaultCnsChapter())
  const result:CnsMeasurement={code:cnsCode(c),rows:[],errors:[],cns:0,excavation:0,replacement:0,zones:emptyZones(),excavationByCode:{}}
  const error=(s:string):void=>{if(!result.errors.includes(s))result.errors.push(s)}
  if(!(reach.toChainage>reach.fromChainage)||reach.fromChainage<0||reach.toChainage>data.lengthM)error('Enter a valid reach within the canal length.')
  if(c.required==null)error('Choose whether CNS treatment is required.')
  if(c.required!==true)return result
  if(!c.coverage)error('Choose the CNS surfaces.')
  if(!(c.bedThicknessMm!=null&&c.bedThicknessMm>0))error('Enter a positive bed thickness.')
  if(c.coverage==='bed-and-sides'&&!(c.sideThicknessMm!=null&&c.sideThicknessMm>0))error('Enter a positive side thickness.')
  if(!result.code)error('Choose the soil source and required compaction.')
  if(data.mode!=='new')error('Chapter 1 earthwork adjustments require a new canal design.')
  if(!(data.design.bedWidth>0&&data.design.fullSupplyDepth>0&&data.design.sideSlope>=0))error('Complete the canal dimensions before measuring CNS.')
  for(const other of data.liningReaches)if(other.id!==reach.id&&other.provide&&other.cnsChapter?.required===true&&other.fromChainage<reach.toChainage&&reach.fromChainage<other.toChainage)error('CNS reaches overlap. Adjust their chainages to avoid counting treatment twice.')
  if(result.errors.some(e=>e!=='Choose the soil source and required compaction.'))return result
  const start = liningBackingOffsets(reach)
  const end = { bed: start.bed + (c.bedThicknessMm ?? 0)/1000, left: start.left + (c.coverage==='bed-and-sides' ? (c.sideThicknessMm ?? 0)/1000 : 0), right: start.right + (c.coverage==='bed-and-sides' ? (c.sideThicknessMm ?? 0)/1000 : 0) }
  const measured = measureTreatmentReach(data, reach, ch => treatmentLayerPolygon(data,ch,start,end))
  return { ...measured, code: result.code, errors: [...result.errors,...measured.errors] }
}

export function measureTreatmentReach(data:CanalData,reach:CanalLiningReach,polygonAt:(ch:number)=>Polygon):CnsMeasurement {
  const result:CnsMeasurement={code:null,rows:[],errors:[],cns:0,excavation:0,replacement:0,zones:emptyZones(),excavationByCode:{}}
  const error=(s:string):void=>{if(!result.errors.includes(s))result.errors.push(s)}
  if (!(reach.toChainage>reach.fromChainage)||reach.fromChainage<0||reach.toChainage>data.lengthM) { error('Enter a valid reach within the canal length.'); return result }
  if (data.mode!=='new') { error('Lining earthwork adjustments require a new canal design.'); return result }
  if (!(data.design.bedWidth>0 && data.design.fullSupplyDepth>0 && data.design.sideSlope>=0)) { error('Complete the canal dimensions before measuring treatment.'); return result }
  const chainages=[...new Set([reach.fromChainage,reach.toChainage,...data.sections.map(s=>s.chainage).filter(ch=>ch>reach.fromChainage&&ch<reach.toChainage)])].sort((a,b)=>a-b)
  for(const ch of chainages) {
    const section=treatmentSectionAt(data,ch)
    if(!section||section.ground.length<2||section.designPopulated===false||canalDesignProfile(data,section).length<2){error(`Complete ground and design at Ch ${ch} m.`);continue}
    const polygon = polygonAt(ch)
    if (!polygon.length || polygon.some(p=>!Number.isFinite(p.offset)||!Number.isFinite(p.rl))) {error(`Complete lining geometry at Ch ${ch} m.`);continue}
    const row=rowAt(data,section,polygon);result.rows.push(row)
    const p=row.polygon
    for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++) {
      if(i===0&&j===p.length-1)continue
      const a=p[i],b=p[(i+1)%p.length],v=p[j],w=p[(j+1)%p.length]
      const dx=b.offset-a.offset,dy=b.rl-a.rl,ex=w.offset-v.offset,ey=w.rl-v.rl,det=dx*ey-dy*ex
      if(Math.abs(det)<EPS)continue
      const t=((v.offset-a.offset)*ey-(v.rl-a.rl)*ex)/det,u=((v.offset-a.offset)*dy-(v.rl-a.rl)*dx)/det
      if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)error(`Treatment offsets intersect at Ch ${ch} m. Review thickness and shelf geometry.`)
    }
    if(row.cns-row.replacement-row.excavation-row.alreadyExcavated>1e-5)error(`Treatment extends beyond the supporting earthwork at Ch ${ch} m. Review the section.`)
    const classified=Object.values(row.excavationByCode).reduce((a,b)=>a+b,0)
    if(row.excavation>EPS&&Math.abs(classified-row.excavation)>1e-5)error(`Complete excavation material classification at Ch ${ch} m.`)
    if(row.replacement>EPS&&data.design.bankConfig?.mode==='tiered')for(const side of ['left','right'] as const){
      const f=canalSectionBankTier(data,section,side)?.foundationTreatment
      if(f&&(f.blanket!=='none'||f.horizontalFilter))error('Resolve CNS placement against existing embedded blanket/filter layers before billing fill replacement.')
    }
  }
  for(let i=1;i<result.rows.length;i++) {
    const a=result.rows[i-1],b=result.rows[i];const length=b.chainage-a.chainage
    for(const key of ['cns','excavation','replacement'] as const)result[key]+=(a[key]+b[key])/2*length
    for(const zone of ['homogeneous','hearting','casing'] as const)result.zones[zone]+=(a.zones[zone]+b.zones[zone])/2*length
    for(const code of new Set([...Object.keys(a.excavationByCode),...Object.keys(b.excavationByCode)]))result.excavationByCode[code]=(result.excavationByCode[code]??0)+((a.excavationByCode[code]??0)+(b.excavationByCode[code]??0))/2*length
  }
  return result
}
/** Only fully reviewed chapter-1 reaches may alter estimate earthwork. */
export function canalCnsTotals(data:CanalData):CnsMeasurement {
  const total:CnsMeasurement={code:null,rows:[],errors:[],cns:0,excavation:0,replacement:0,zones:emptyZones(),excavationByCode:{}}
  for(const reach of data.liningReaches.filter(r=>r.provide&&r.cnsChapter)) {
    const q=measureCnsReach(data,reach)
    const lining=reach.liningChapter?measureLiningChapter(data,reach):null
    if(q.errors.length||lining?.errors.length)continue
    for(const key of ['cns','excavation','replacement'] as const)total[key]+=q[key]
    for(const zone of ['homogeneous','hearting','casing'] as const)total.zones[zone]+=q.zones[zone]
    for(const [code,qty]of Object.entries(q.excavationByCode))total.excavationByCode[code]=(total.excavationByCode[code]??0)+qty
    if(lining) {
      const l=lining.earthwork
      total.excavation+=l.excavation;total.replacement+=l.replacement
      for(const zone of ['homogeneous','hearting','casing'] as const)total.zones[zone]+=l.zones[zone]
      for(const [code,qty]of Object.entries(l.excavationByCode))total.excavationByCode[code]=(total.excavationByCode[code]??0)+qty
    }
  }
  return total
}
