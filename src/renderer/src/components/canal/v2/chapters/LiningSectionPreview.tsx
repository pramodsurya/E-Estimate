import { useId } from 'react'
import type { CanalData, CanalLiningReach, CanalLiningSurface, CanalPoint } from '../../../../types/project'
import { canalGroundLevelAt, profileDifferenceBands } from '../../../../lib/canal'
import { treatmentLayerPolygon, type CnsSectionRow } from '../../../../lib/canalCns'
import { activeChapterSpec, chapterSurfaceLabels, chapterSurfaces, liningBackingOffsets, liningThicknesses, normalizeLiningChapter } from '../../../../lib/canalLiningChapter'
import { jointLocations, normalizeJointsChapter, type JointKind } from '../../../../lib/canalJoints'

type SectionRow = Pick<CnsSectionRow, 'polygon' | 'ground' | 'profile' | 'chainage'>
type Material = 'concrete-paver' | 'concrete' | 'pcc' | 'stone' | 'masonry' | 'pending'
type Layer = { surface: CanalLiningSurface; material: Material; thicknessMm: number | null; polygon: CanalPoint[]; reinforced: boolean }

const zero = { bed: 0, left: 0, right: 0 }
const materialNames: Record<Material, string> = {
  'concrete-paver': 'Mechanically paved concrete', concrete: 'Placed concrete', pcc: 'PCC slabs',
  stone: 'Stone slabs', masonry: 'Rubble masonry', pending: 'Lining detail pending'
}

export default function LiningSectionPreview({ data, reach, row }: { data: CanalData; reach: CanalLiningReach; row: SectionRow }): JSX.Element {
  const uid = useId().replace(/:/g, '')
  const pattern = (name: string): string => `url(#${uid}-${name})`
  const chapter = reach.liningChapter ? normalizeLiningChapter(reach.liningChapter) : null
  const thickness = liningThicknesses(reach)
  const backing = liningBackingOffsets(reach)
  const layers: Layer[] = chapter ? chapterSurfaces.filter(surface => chapter.surfaces.includes(surface)).map(surface => {
    const spec = activeChapterSpec(chapter, surface)
    const material: Material = spec.method === 'concrete' ? (spec.placement === 'paver' ? 'concrete-paver' : 'concrete') : spec.method ?? 'pending'
    const end = { ...zero, [surface]: Math.max(thickness[surface], .001) }
    return { surface, material, thicknessMm: spec.thicknessMm, polygon: treatmentLayerPolygon(data, row.chainage, zero, end), reinforced: spec.method === 'concrete' && spec.reinforced === true && spec.steelSurfaces.includes(surface) }
  }) : []
  const liningPolygon = chapter && layers.length ? treatmentLayerPolygon(data, row.chainage, zero, Object.fromEntries(chapterSurfaces.map(s => [s, chapter.surfaces.includes(s) ? Math.max(thickness[s], .001) : 0])) as typeof zero) : []
  const membraneSurfaces = chapter?.membrane === true ? chapterSurfaces.filter(s => chapter.membraneSurfaces.includes(s) && chapter.surfaces.includes(s)) : []
  const membranes = membraneSurfaces.map(surface => ({ surface, polygon: treatmentLayerPolygon(data, row.chainage, thickness, { ...thickness, [surface]: Math.max(backing[surface], thickness[surface] + .001) }) }))
  const joints = reach.jointsChapter ? normalizeJointsChapter(reach.jointsChapter) : null
  const jointKinds: JointKind[] = joints?.required === true ? ['mastic', 'expansion'] : []
  const transverse = jointKinds.flatMap(kind => {
    const layout = joints![kind]
    if (!layout.enabled || layout.direction !== 'transverse') return []
    const locations = jointLocations(reach, layout)
    return locations.errors.length ? [] : [{ kind, surfaces: layout.surfaces, locations: locations.locations }]
  })
  const scheduled = transverse.filter(joint => joint.locations.some(ch => Math.abs(ch - row.chainage) < 1e-6))
  const longitudinal = jointKinds.filter(kind => joints![kind].enabled && joints![kind].direction === 'longitudinal')

  const focus = [...row.polygon, ...row.profile, ...liningPolygon, ...membranes.flatMap(m => m.polygon)]
  const left = focus.length ? Math.min(...focus.map(p => p.offset)) : row.ground[0]?.offset ?? 0
  const right = focus.length ? Math.max(...focus.map(p => p.offset)) : row.ground.at(-1)?.offset ?? 0
  const margin = Math.max(.5, (right - left) * .08)
  const ground = row.ground.length > 1 ? [
    { offset: left - margin, rl: canalGroundLevelAt(row.ground, left - margin) ?? row.ground[0].rl },
    ...row.ground.filter(p => p.offset > left - margin && p.offset < right + margin),
    { offset: right + margin, rl: canalGroundLevelAt(row.ground, right + margin) ?? row.ground.at(-1)!.rl }
  ] : row.ground
  const points = [...focus, ...ground]
  if (!points.length) return <p>Enter section ground and design to see the preview.</p>
  const xmin = Math.min(...points.map(p => p.offset)), xmax = Math.max(...points.map(p => p.offset))
  const ymin = Math.min(...points.map(p => p.rl)), ymax = Math.max(...points.map(p => p.rl))
  const scale = Math.min(550 / Math.max(1, xmax - xmin), 190 / Math.max(1, ymax - ymin))
  const screen = (p: CanalPoint): [number, number] => [310 + (p.offset - (xmin + xmax) / 2) * scale, 225 - (p.rl - ymin) * scale]
  const xy = (p: CanalPoint): string => screen(p).join(',')
  const cutting = profileDifferenceBands(row.ground, row.profile).filter(b => b.cutting)
  // A tiny side offset exposes the full finished bed-and-sides path, including any berms.
  const guide = treatmentLayerPolygon(data, row.chainage, zero, { bed: 0, left: .000001, right: .000001 })
  const inner = guide.slice(0, guide.length / 2)
  const membraneFacePolygon = treatmentLayerPolygon(data, row.chainage, { ...thickness, left: Math.max(thickness.left, .000001), right: Math.max(thickness.right, .000001) }, { ...backing, left: Math.max(backing.left, .000001), right: Math.max(backing.right, .000001) })
  const membraneFace = membraneFacePolygon.slice(0, membraneFacePolygon.length / 2)
  const bedRl = Math.min(...inner.map(p => p.rl))
  const segments = inner.slice(1).map((b, i) => {
    const a = inner[i]
    const surface: CanalLiningSurface = Math.abs(a.rl - bedRl) < 1e-7 && Math.abs(b.rl - bedRl) < 1e-7 ? 'bed' : (a.offset + b.offset) / 2 < 0 ? 'left' : 'right'
    return { a, b, surface }
  })

  return <figure className="cns-preview lining-section-preview">
    <svg viewBox="0 0 620 260" role="img" aria-label={`Canal section at chainage ${row.chainage} metres showing the selected CNS, lining materials, LDPE and joints`}>
      <defs>
        <pattern id={`${uid}-cns`} patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#9d7442"/><circle cx="3" cy="3" r="1.1" fill="#e5c38a"/><circle cx="9" cy="8" r="1" fill="#d5ad74"/></pattern>
        <pattern id={`${uid}-concrete`} patternUnits="userSpaceOnUse" width="14" height="14"><rect width="14" height="14" fill="#91a8b8"/><circle cx="3" cy="4" r="1" fill="#c8d6dc"/><circle cx="10" cy="10" r="1" fill="#667f91"/></pattern>
        <pattern id={`${uid}-concrete-paver`} patternUnits="userSpaceOnUse" width="20" height="20"><rect width="20" height="20" fill="#8aafc2"/><path d="M0 17H20" stroke="#bcd6df" strokeWidth="1"/><circle cx="5" cy="8" r="1" fill="#d8e7ec"/></pattern>
        <pattern id={`${uid}-pcc`} patternUnits="userSpaceOnUse" width="22" height="16"><rect width="22" height="16" fill="#c5c5ba"/><path d="M0 0H22M0 8H22M11 0V8M0 8V16M22 8V16" stroke="#7c8380" strokeWidth="1.4"/></pattern>
        <pattern id={`${uid}-stone`} patternUnits="userSpaceOnUse" width="26" height="20"><rect width="26" height="20" fill="#9b9a90"/><path d="M0 8L8 6 13 10 26 7M4 20L6 8M18 20L16 9" fill="none" stroke="#ceccc1" strokeWidth="1.3"/></pattern>
        <pattern id={`${uid}-masonry`} patternUnits="userSpaceOnUse" width="29" height="22"><rect width="29" height="22" fill="#a18d7a"/><path d="M0 7L9 5 17 8 29 6M0 16L8 18 16 14 29 17M9 5L8 18M17 8L16 14" fill="none" stroke="#d3bca2" strokeWidth="1.5"/></pattern>
        <pattern id={`${uid}-pending`} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="#596b76"/><path d="M-2 8L8 -2M2 10L10 2" stroke="#a9bfcc" strokeWidth="1"/></pattern>
        <pattern id={`${uid}-steel`} patternUnits="userSpaceOnUse" width="13" height="13"><circle cx="6" cy="6" r="2.3" fill="#355a70" stroke="#e8f4fb" strokeWidth="1"/></pattern>
        <clipPath id={`${uid}-lining-clip`}><polygon points={liningPolygon.map(xy).join(' ')} /></clipPath>
      </defs>
      {cutting.map((band, i) => <polygon key={i} points={band.points.map(xy).join(' ')} fill="#6387a7" fillOpacity=".18" />)}
      {row.polygon.length > 2 && <polygon points={row.polygon.map(xy).join(' ')} fill={pattern('cns')} stroke="#d9ae69" strokeWidth="1.2" />}
      {!!liningPolygon.length && <g clipPath={`url(#${uid}-lining-clip)`}>
        <polygon points={liningPolygon.map(xy).join(' ')} fill={pattern('pending')} />
        {layers.map(layer => <g key={layer.surface}><polygon points={layer.polygon.map(xy).join(' ')} fill={pattern(layer.material)} />{layer.reinforced && <polygon points={layer.polygon.map(xy).join(' ')} fill={pattern('steel')} />}</g>)}
      </g>}
      {!!liningPolygon.length && <polygon points={liningPolygon.map(xy).join(' ')} fill="none" stroke="#cbdde4" strokeWidth="1.5" />}
      {membranes.map(m => <polygon key={m.surface} points={m.polygon.map(xy).join(' ')} fill="#b960da" fillOpacity=".8" />)}
      {segments.map((segment, i) => membraneSurfaces.includes(segment.surface) && membraneFace[i + 1] ? <line key={`membrane-${i}`} x1={screen(membraneFace[i])[0]} y1={screen(membraneFace[i])[1]} x2={screen(membraneFace[i + 1])[0]} y2={screen(membraneFace[i + 1])[1]} stroke="#df94f1" strokeWidth="2" /> : null)}
      <polyline points={ground.map(xy).join(' ')} fill="none" stroke="#8495a2" strokeWidth="2" strokeDasharray="6 4" />
      <polyline points={row.profile.map(xy).join(' ')} fill="none" stroke="#37c8b5" strokeWidth="2.5" />
      {scheduled.flatMap(({ kind, surfaces }) => segments.filter(s => surfaces.includes(s.surface)).map((segment, i) => <line key={`${kind}-${i}`} x1={xy(segment.a).split(',')[0]} y1={xy(segment.a).split(',')[1]} x2={xy(segment.b).split(',')[0]} y2={xy(segment.b).split(',')[1]} stroke={kind === 'mastic' ? '#f6b75b' : '#f48482'} strokeWidth="4" strokeDasharray={kind === 'mastic' ? '7 3' : undefined} />))}
    </svg>
    <figcaption>
      <span><i className="is-design" />Finished profile</span><span><i className="is-cut" />Original cutting</span>
      {row.polygon.length > 2 && <span><i className="is-cns" />CNS soil</span>}
      {membranes.length > 0 && <span><i className="is-membrane" />LDPE on {membraneSurfaces.map(s => chapterSurfaceLabels[s].toLowerCase()).join(', ')}</span>}
      <span><i className="is-ground" />Natural ground</span>
    </figcaption>
    {!!layers.length && <div className="lining-section-materials">{layers.map(layer => <span key={layer.surface}><i className={`is-${layer.material}`} /><strong>{chapterSurfaceLabels[layer.surface]}:</strong> {materialNames[layer.material]}{layer.thicknessMm != null && layer.thicknessMm > 0 ? ` · ${layer.thicknessMm} mm` : ''}{layer.reinforced ? ' · steel specified' : ''}</span>)}</div>}
    {scheduled.length > 0 && <p className="lining-section-joints">At this chainage: {scheduled.map(j => `${j.kind === 'mastic' ? 'mastic' : 'expansion'} transverse joint on ${j.surfaces.map(s => chapterSurfaceLabels[s].toLowerCase()).join(', ')}`).join('; ')}. Colored lines mark the scheduled surfaces.</p>}
    {transverse.filter(joint => !scheduled.includes(joint)).map(joint => <p className="lining-section-joints" key={joint.kind}>{joint.kind === 'mastic' ? 'Mastic' : 'Expansion'} transverse joints: {joint.locations.length} scheduled on {joint.surfaces.map(s => chapterSurfaceLabels[s].toLowerCase()).join(', ')}. None crosses this selected section{joint.locations.length ? `; nearest at Ch ${Math.round(joint.locations.reduce((a, b) => Math.abs(a - row.chainage) < Math.abs(b - row.chainage) ? a : b) * 1000) / 1000} m` : ''}.</p>)}
    {longitudinal.length > 0 && <p className="lining-section-joints">Longitudinal {longitudinal.map(kind => kind === 'mastic' ? 'mastic' : 'expansion').join(' and ')} joints are specified; their exact cross-section positions follow the drawing and are not shown here.</p>}
    {chapter && chapterSurfaces.some(s => chapter.surfaces.includes(s) && activeChapterSpec(chapter, s).method === 'pcc' && activeChapterSpec(chapter, s).lugs === true) && <p className="lining-section-joints">PCC lug supports are specified. Their exact size and position follow the selected SSR detail and drawing.</p>}
  </figure>
}
