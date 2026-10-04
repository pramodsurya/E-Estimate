import { defaultSlrbData, resizeSlrbLayout } from './slrb'
import type { SlrbData } from '../types/slrb'
/** Source candidates, not completed defaults: actual panel lengths, support
 * details and bar schedules remain unknown. Conflicting widths must be resolved. */
export function slrbReferenceExample(key:'100835'|'102215'):SlrbData {
  const large=key==='102215'
  const data=resizeSlrbLayout(defaultSlrbData(),large?3:2)
  return {...data,purpose:'drawing',sourceStatus:'draft',reference:`Historical SLRB at km ${large?'102.215':'100.835'} — supplied DOC/XLS/DWG package; verify active drawing/revision`,
    loadingBasis:'Historical IRC Class A; source editions circa 2000 — current project basis needs review',
    crossingAngle:90,slabWidth:5.2,carriagewayWidth:4.25,
    spans:data.spans.map(span=>({...span,clearSpan:large?6:4.7,thickness:large?0.57:0.46,grade:'M20'})),
    supports:data.supports.map(support=>support.kind==='pier'?{...support,footingType:'spread',footing:{...support.footing,length:large?3.2:2.5,width:large?3.6:3.3,height:0.6,grade:'M20'}}:support),
    roadRl:large?382.9:379.846,wearingPresence:'provided',wearingThickness:0.075,wearingGrade:'M25',
    approaches:data.approaches.map(approach=>({...approach,presence:'provided',slab:{...approach.slab,length:3.5,height:0.225},backingPresence:'provided',backingDepth:0.15})),
    sourceConflicts:[{id:'deck-width',message:'Deck workbook uses 5.20 m slab width; pier workbook says 4.70 m. Confirm the active structural width and which width each member needs.',resolved:false,resolution:''},
      ...(!large?[{id:'pier-count',message:'The design paragraph has two spans and one pier; later text says two piers. Confirm the layout against the active plan.',resolved:false,resolution:''}]:[])]}
}
