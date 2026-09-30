import type { CanalData, CanalJointLayout, CanalJointsChapter, CanalLiningReach, CanalLiningSurface } from '../types/project'
import { activeChapterSpec, chapterSurfaceLabels, chapterSurfaces, measureLiningChapter, normalizeLiningChapter } from './canalLiningChapter'
import { LINING_SPECIFICATIONS, liningGeometryAt } from './canalLiningDesign'
import { measureCnsReach } from './canalCns'

export type JointKind = 'mastic' | 'expansion'
export const jointNames = { mastic: 'Mastic construction / contraction joints', expansion: 'Tarfelt expansion joints' }
export const defaultJointLayout = (): CanalJointLayout => ({ enabled: false, surfaces: [], direction: null, placement: null, firstChainage: null, spacingM: null, locationsText: '', longitudinalLengths: {bed:null,left:null,right:null}, longitudinalMode: null, longitudinalLines: {bed:null,left:null,right:null}, longitudinalRuns: {bed:[],left:[],right:[]}, distinctScope: null, reference: '' })
export const defaultJointsChapter = (): CanalJointsChapter => ({ version: 1, required: null, mastic: defaultJointLayout(), expansion: defaultJointLayout() })
export function normalizeJointsChapter(raw: CanalJointsChapter): CanalJointsChapter {
  const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
  const layout = (r: CanalJointLayout): CanalJointLayout => ({ ...defaultJointLayout(), ...r, enabled: r?.enabled === true,
    surfaces: chapterSurfaces.filter(s=>r?.surfaces?.includes(s)), direction: r?.direction === 'transverse' || r?.direction === 'longitudinal' ? r.direction : null,
    placement: r?.placement === 'spacing' || r?.placement === 'locations' ? r.placement : null,
    firstChainage: num(r?.firstChainage), spacingM: num(r?.spacingM), longitudinalLengths: {bed:num(r?.longitudinalLengths?.bed),left:num(r?.longitudinalLengths?.left),right:num(r?.longitudinalLengths?.right)},
    longitudinalMode: ['full','parts','approved'].includes(r?.longitudinalMode ?? '') ? r.longitudinalMode : chapterSurfaces.some(s=>num(r?.longitudinalLengths?.[s])!=null) ? 'approved' : null,
    longitudinalLines: {bed:num(r?.longitudinalLines?.bed),left:num(r?.longitudinalLines?.left),right:num(r?.longitudinalLines?.right)},
    longitudinalRuns: Object.fromEntries(chapterSurfaces.map(s=>[s,Array.isArray(r?.longitudinalRuns?.[s]) ? r.longitudinalRuns[s].map(run=>({fromChainage:num(run.fromChainage),toChainage:num(run.toChainage),lines:num(run.lines)})) : []])) as NonNullable<CanalJointLayout['longitudinalRuns']>,
    locationsText: typeof r?.locationsText === 'string' ? r.locationsText : '', reference: typeof r?.reference === 'string' ? r.reference : '', distinctScope: typeof r?.distinctScope === 'boolean' ? r.distinctScope : null })
  return { version: 1, required: typeof raw.required === 'boolean' ? raw.required : null, completed: raw.completed === true, mastic: layout(raw.mastic), expansion: layout(raw.expansion) }
}
export function jointSurfaceCode(reach: CanalLiningReach, kind: JointKind, surface: CanalLiningSurface): string | null {
  if (!reach.liningChapter) return null
  const c = normalizeLiningChapter(reach.liningChapter)
  if (!c.surfaces.includes(surface)) return null
  const s = activeChapterSpec(c,surface)
  if (kind === 'mastic') return s.method === 'concrete' ? 'IRR-CAW-7-37' : null
  if (s.method === 'masonry') return 'IRR-CAW-7-34'
  return s.method === 'concrete' && [100,150].includes(s.thicknessMm ?? 0) ? `IRR-CAW-7-${s.thicknessMm === 100 ? 35 : 36}` : null
}
export function paverJointSurfaces(reach: CanalLiningReach): CanalLiningSurface[] {
  if (!reach.liningChapter) return []
  const c = normalizeLiningChapter(reach.liningChapter)
  return c.surfaces.filter(s=>LINING_SPECIFICATIONS.find(r=>r.code===activeChapterSpec(c,s).code)?.paver)
}
export function jointLocations(reach: CanalLiningReach, layout: CanalJointLayout): { locations: number[]; errors: string[] } {
  const errors: string[] = []
  let locations: number[] = []
  if (layout.direction !== 'transverse') return {locations,errors}
  if (layout.placement === 'spacing') {
    const first = layout.firstChainage, spacing = layout.spacingM
    if (first == null || first < reach.fromChainage || first > reach.toChainage) errors.push('Enter the first joint chainage within this reach.')
    if (!(spacing != null && spacing > 0)) errors.push('Enter a positive joint spacing.')
    if (!errors.length && first != null && spacing != null) {
      const count = Math.floor((reach.toChainage-first+1e-7)/spacing)+1
      if (count > 10000) errors.push('More than 10,000 joints. Increase spacing or split the reach.')
      else locations=Array.from({length:count},(_,i)=>first+i*spacing)
    }
  } else if (layout.placement === 'locations') {
    const tokens=layout.locationsText.trim().split(/[\s,;]+/).filter(Boolean)
    if (!tokens.length) errors.push('Enter at least one joint chainage.')
    if (tokens.length > 10000) errors.push('More than 10,000 joint entries. Split the reach.')
    else {
      if (tokens.some(t=>!/^\d+(?:\.\d+)?$/.test(t))) errors.push('Use numeric chainages separated by commas, spaces or new lines.')
      locations=[...new Set(tokens.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b)
      if (locations.some(ch=>ch<reach.fromChainage||ch>reach.toChainage)) errors.push('Every joint chainage must lie within this reach.')
    }
  } else errors.push('Choose spacing or specified joint chainages.')
  return { locations: errors.length ? [] : locations, errors }
}
export function longitudinalJointMeasurement(reach: CanalLiningReach, layout: CanalJointLayout): { lengths: Record<CanalLiningSurface, number>; errors: string[] } {
  const lengths = { bed: 0, left: 0, right: 0 }
  const errors: string[] = []
  const mode = layout.longitudinalMode ?? (layout.surfaces.some(s=>layout.longitudinalLengths[s]!=null) ? 'approved' : null)
  if (!mode) errors.push('Choose how the longitudinal joints are laid out.')
  for (const surface of layout.surfaces) {
    const label = chapterSurfaceLabels[surface]
    if (mode === 'approved') {
      const value = layout.longitudinalLengths[surface]
      if (!(value != null && value > 0)) errors.push(`Enter the approved joint length on ${label}.`)
      else lengths[surface] = value
    } else if (mode === 'full') {
      const count = layout.longitudinalLines?.[surface]
      if (!(count != null && Number.isInteger(count) && count > 0)) errors.push(`Enter the number of full-reach joint lines on ${label}.`)
      else if (!(reach.toChainage > reach.fromChainage)) errors.push('Set a positive reach length.')
      else lengths[surface] = count * (reach.toChainage - reach.fromChainage)
    } else if (mode === 'parts') {
      const runs = layout.longitudinalRuns?.[surface] ?? []
      if (!runs.length) errors.push(`Add a joint run on ${label}.`)
      runs.forEach((run,index)=>{
        const {fromChainage:from,toChainage:to,lines} = run
        if (from == null || to == null || from < reach.fromChainage || to > reach.toChainage || !(to > from)) errors.push(`${label} run ${index+1}: enter start and end chainages within this reach.`)
        if (!(lines != null && Number.isInteger(lines) && lines > 0)) errors.push(`${label} run ${index+1}: enter a positive whole-number of lines.`)
        if (from != null && to != null && to > from && lines != null && Number.isInteger(lines) && lines > 0) lengths[surface] += (to-from)*lines
      })
    }
  }
  return { lengths, errors }
}
export interface JointLocationRow { chainage: number; lengths: Partial<Record<CanalLiningSurface, number>>; total: number; shared: CanalLiningSurface[] }
export interface JointMeasurement {
  kind: JointKind; locations: number[]; rows: JointLocationRow[]; totalLength: number;
  lines: { code: string; quantity: number; unit: 'RM' }[]; errors: string[];
}
/** Never transfer a shared joint to an incomplete worksheet that cannot bill it. */
function claimableChapter(data:CanalData,reach:CanalLiningReach):boolean {
  if(!reach.jointsChapter||!reach.liningChapter)return false
  const c=normalizeJointsChapter(reach.jointsChapter)
  if(c.required!==true||!c.mastic.enabled&&!c.expansion.enabled||measureLiningChapter(data,reach).errors.length||measureCnsReach(data,reach).errors.length)return false
  const paver=paverJointSurfaces(reach)
  for(const kind of ['mastic','expansion'] as const){
    const l=c[kind];if(!l.enabled)continue
    if(!l.surfaces.length||l.surfaces.some(s=>!jointSurfaceCode(reach,kind,s))||!l.direction)return false
    if(kind==='mastic'&&l.surfaces.some(s=>paver.includes(s))&&l.distinctScope!==true)return false
    if(l.direction==='transverse'&&jointLocations(reach,l).errors.length)return false
    if(l.direction==='longitudinal'&&longitudinalJointMeasurement(reach,l).errors.length)return false
  }
  if(c.mastic.enabled&&c.expansion.enabled&&c.mastic.direction===c.expansion.direction&&c.mastic.surfaces.some(s=>c.expansion.surfaces.includes(s))){
    if(c.mastic.direction==='longitudinal'||jointLocations(reach,c.mastic).locations.some(a=>jointLocations(reach,c.expansion).locations.some(b=>Math.abs(a-b)<1e-7)))return false
  }
  return true
}
export function measureJointsChapter(data: CanalData, reach: CanalLiningReach) {
  const c=normalizeJointsChapter(reach.jointsChapter??defaultJointsChapter())
  const errors: string[]=[]
  const works: JointMeasurement[]=[]
  if (!reach.liningChapter || measureLiningChapter(data,reach).errors.length || measureCnsReach(data,reach).errors.length) errors.push('Complete valid soil treatment and lining specifications before measuring joints.')
  if (c.required==null) errors.push('Answer whether separate joint items are specified.')
  if(c.required!==true)return {works,errors,lines:[],extraExcavation:0,totalLength:0}
  if (!c.mastic.enabled&&!c.expansion.enabled) errors.push('Select at least one separately specified joint type.')
  const paver=paverJointSurfaces(reach)
  for(const kind of ['mastic','expansion'] as const) {
    const layout=c[kind];if(!layout.enabled)continue
    const located=jointLocations(reach,layout)
    const work: JointMeasurement={kind,locations:located.locations,rows:[],totalLength:0,lines:[],errors:[...located.errors]}
    const codes=new Map<CanalLiningSurface,string>()
    if(!layout.surfaces.length)work.errors.push('Choose the joint surfaces.')
    for(const s of layout.surfaces) {
      const code=jointSurfaceCode(reach,kind,s)
      if(!code)work.errors.push(`${chapterSurfaceLabels[s]}: no compatible CAW 7 joint item for the selected lining. Expansion boards cover 100/150 mm concrete or the specified masonry detail.`)
      else codes.set(s,code)
    }
    if(!layout.direction)work.errors.push('Choose whether joints run across or along the canal.')
    if(kind==='mastic'&&layout.surfaces.some(s=>paver.includes(s))) {
      if(layout.distinctScope!==true)work.errors.push('Paver lining includes contraction joints and PVC strips. Confirm a separate mastic scope outside that included work.')
    }
    if(layout.direction==='longitudinal') {
      const measured=longitudinalJointMeasurement(reach,layout)
      work.errors.push(...measured.errors)
      if(!work.errors.length){
        const sums=new Map<string,number>()
        for(const [s,code]of codes){const length=measured.lengths[s];sums.set(code,(sums.get(code)??0)+length);work.totalLength+=length}
        work.lines=[...sums].map(([code,quantity])=>({code,quantity,unit:'RM'}))
      }
    } else if(layout.direction==='transverse'&&!work.errors.length) {
      const sums=new Map<string,number>()
      for(const ch of work.locations) {
        const geometry=liningGeometryAt(data,{...reach,designV2:undefined},ch)
        const row: JointLocationRow={chainage:ch,lengths:{},total:0,shared:[]}
        for(const [surface,code]of codes) {
          // A boundary joint belongs to the following reach when that reach schedules it too.
          const claimed=Math.abs(ch-reach.toChainage)<1e-7&&data.liningReaches.some(other=>{
            if(other.id===reach.id||!other.provide||Math.abs(other.fromChainage-ch)>1e-7||other.jointsChapter?.required!==true)return false
            if(!claimableChapter(data,other))return false
            const next=normalizeJointsChapter(other.jointsChapter)
            return (['mastic','expansion'] as const).some(nextKind=>{
              const l=next[nextKind]
              return l.enabled&&l.direction==='transverse'&&l.surfaces.includes(surface)&&jointLocations(other,l).locations.some(v=>Math.abs(v-ch)<1e-7)
            })
          })
          if(claimed){row.shared.push(surface);continue}
          const length=geometry.widths[surface]
          if(!(length>0))work.errors.push(`Complete the joint surface geometry at Ch ${ch} m.`)
          row.lengths[surface]=length;row.total+=length;sums.set(code,(sums.get(code)??0)+length)
        }
        work.rows.push(row);work.totalLength+=row.total
      }
      work.lines=[...sums].map(([code,quantity])=>({code,quantity,unit:'RM'}))
    }
    works.push(work)
    errors.push(...work.errors.map(e=>`${jointNames[kind]}: ${e}`))
  }
  // Construction/contraction and expansion details must not silently occupy the same joint line.
  if(c.mastic.enabled&&c.expansion.enabled&&c.mastic.direction===c.expansion.direction&&c.mastic.surfaces.some(s=>c.expansion.surfaces.includes(s))) {
    if(c.mastic.direction==='longitudinal'||works[0]?.locations.some(a=>works[1]?.locations.some(b=>Math.abs(a-b)<1e-7)))errors.push('Joint types overlap on the same surface and location. Separate their schedules to avoid duplicate joint work.')
  }
  return {works,errors:[...new Set(errors)],lines:works.flatMap(w=>w.lines),extraExcavation:0,totalLength:works.reduce((sum,w)=>sum+w.totalLength,0)}
}
