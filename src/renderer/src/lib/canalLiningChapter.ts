import type { CanalData, CanalLiningChapter, CanalLiningChapterSpec, CanalLiningReach, CanalLiningSurface } from '../types/project'
import { LINING_SPECIFICATIONS, liningGeometryAt, liningIntervals } from './canalLiningDesign'
import { liningCatalogueItem } from './canalLiningCatalogue'
import { measureTreatmentReach, treatmentLayerPolygon } from './canalCns'

export const chapterSurfaces: CanalLiningSurface[] = ['bed', 'left', 'right']
export const chapterSurfaceLabels = { bed: 'Bed', left: 'Left inner side', right: 'Right inner side' }
export const PCC_LUG_RECOMMENDATIONS: Record<string, string> = {
  'IRR-CAW-7-38': 'IRR-CAW-7-39',
  'IRR-CAW-7-40': 'IRR-CAW-7-41',
  'IRR-CAW-7-43': 'IRR-CAW-7-44'
}
export const PCC_LUG_LENGTHS_M: Record<string, number> = {
  'IRR-CAW-7-39': .55,
  'IRR-CAW-7-41': .45,
  'IRR-CAW-7-44': .4
}
/** Face-area equivalent only; the drawing determines cut pieces, joints and the final slab count. */
export function suggestedPccSlabCount(areaSqm: number, slabSizeMm: readonly [number, number, number] | undefined): number | null {
  if (!(Number.isFinite(areaSqm) && areaSqm > 0) || !slabSizeMm) return null
  const faceAreaSqm = slabSizeMm[0] * slabSizeMm[1] / 1e6
  if (!(Number.isFinite(faceAreaSqm) && faceAreaSqm > 0)) return null
  const count = Math.ceil(areaSqm / faceAreaSqm - 1e-9)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}
export const defaultChapterSpec = (): CanalLiningChapterSpec => ({ method: null, placement: null, code: '', thicknessMm: null, slabSource: null, slabCount: null, lugs: null, lugCode: '', lugCount: null, lugMismatchConfirmed: null, lugDrawingReference: '', lugLengthM: null, lugLayout: null, lugRows: { bed: null, left: null, right: null }, lugFirstChainage: null, lugSpacingM: null, reinforced: null, steelMode: null, steelQuantity: null, steelSurfaces: [] })
export const defaultLiningChapter = (): CanalLiningChapter => ({ version: 1, surfaces: [], sameSpecification: null, specifications: { bed: defaultChapterSpec(), left: defaultChapterSpec(), right: defaultChapterSpec() }, membrane: null, membraneSurfaces: [], membraneMicrons: null })
export function normalizeLiningChapter(raw: CanalLiningChapter): CanalLiningChapter {
  const base = defaultLiningChapter()
  const selected = (v: unknown): CanalLiningSurface[] => Array.isArray(v) ? chapterSurfaces.filter(s => v.includes(s)) : []
  const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
  const specifications = { ...base.specifications }
  for (const surface of chapterSurfaces) {
    const r = raw.specifications?.[surface] ?? base.specifications[surface]
    specifications[surface] = { ...defaultChapterSpec(), ...r,
      method: ['concrete', 'pcc', 'stone', 'masonry'].includes(r.method ?? '') ? r.method : null,
      placement: r.placement === 'paver' || r.placement === 'conventional' ? r.placement : null,
      code: typeof r.code === 'string' ? r.code : '',
      thicknessMm: num(r.thicknessMm), slabCount: num(r.slabCount), lugCount: num(r.lugCount), lugLengthM: num(r.lugLengthM), steelQuantity: num(r.steelQuantity),
      lugLayout: ['along', 'across', 'approved'].includes(r.lugLayout ?? '') ? r.lugLayout : num(r.lugLengthM) != null ? 'approved' : null,
      lugRows: { bed: num(r.lugRows?.bed), left: num(r.lugRows?.left), right: num(r.lugRows?.right) },
      lugFirstChainage: num(r.lugFirstChainage), lugSpacingM: num(r.lugSpacingM),
      lugMismatchConfirmed: typeof r.lugMismatchConfirmed === 'boolean' ? r.lugMismatchConfirmed : null,
      lugDrawingReference: typeof r.lugDrawingReference === 'string' ? r.lugDrawingReference : '',
      steelSurfaces: selected(r.steelSurfaces),
      slabSource: r.slabSource === 'manufacture' || r.slabSource === 'supplied' ? r.slabSource : null,
      reinforced: typeof r.reinforced === 'boolean' ? r.reinforced : null,
      lugs: typeof r.lugs === 'boolean' ? r.lugs : null,
      steelMode: r.steelMode === 'schedule' || r.steelMode === 'area' ? r.steelMode : null }
  }
  return { ...base, ...raw, version: 1, completed: raw.completed === true, surfaces: selected(raw.surfaces), specifications,
    sameSpecification: typeof raw.sameSpecification === 'boolean' ? raw.sameSpecification : null,
    membrane: typeof raw.membrane === 'boolean' ? raw.membrane : null,
    membraneSurfaces: selected(raw.membraneSurfaces), membraneMicrons: [500, 750, 1000].includes(raw.membraneMicrons ?? 0) ? raw.membraneMicrons : null }
}
export function activeChapterSpec(c: CanalLiningChapter, s: CanalLiningSurface): CanalLiningChapterSpec {
  return c.specifications[c.sameSpecification === true ? c.surfaces[0] ?? s : s]
}
export function liningThicknesses(reach: CanalLiningReach): Record<CanalLiningSurface, number> {
  const c = reach.liningChapter ? normalizeLiningChapter(reach.liningChapter) : null
  return Object.fromEntries(chapterSurfaces.map(s => [s, c?.surfaces.includes(s) ? Math.max(0, activeChapterSpec(c, s).thicknessMm ?? 0) / 1000 : 0])) as Record<CanalLiningSurface, number>
}
export function liningBackingOffsets(reach: CanalLiningReach): Record<CanalLiningSurface, number> {
  const t = liningThicknesses(reach), c = reach.liningChapter
  for (const s of chapterSurfaces) if (c?.membrane === true && c.membraneSurfaces.includes(s)) t[s] += (c.membraneMicrons ?? 0) / 1e6
  return t
}
export function lugSupportMeasurement(data: CanalData, reach: CanalLiningReach, spec: CanalLiningChapterSpec, surfaces: CanalLiningSurface[]): { length: number; errors: string[]; count: number } {
  const errors: string[] = []
  const mode = spec.lugLayout ?? (spec.lugLengthM != null ? 'approved' : null)
  const lengthM = reach.toChainage - reach.fromChainage
  let length = 0, count = 0
  if (!mode) errors.push('Choose how the lug supports are arranged.')
  else if (mode === 'approved') {
    if (!(spec.lugLengthM != null && spec.lugLengthM > 0)) errors.push('Enter the approved lug support length.')
    else length = spec.lugLengthM
  } else if (!(lengthM > 0)) errors.push('Set a positive reach length.')
  else if (mode === 'along') {
    for (const surface of surfaces) {
      const rows = spec.lugRows?.[surface]
      if (!(rows != null && Number.isInteger(rows) && rows > 0)) errors.push(`Enter the number of full-reach lug lines on ${chapterSurfaceLabels[surface]}.`)
      else { count += rows; length += rows * lengthM }
    }
  } else {
    const first = spec.lugFirstChainage, spacing = spec.lugSpacingM
    if (first == null || first < reach.fromChainage || first > reach.toChainage) errors.push('Enter the first lug-support chainage within this reach.')
    if (!(spacing != null && spacing > 0)) errors.push('Enter a positive lug-support spacing.')
    if (!errors.length && first != null && spacing != null) {
      count = Math.floor((reach.toChainage - first + 1e-7) / spacing) + 1
      if (count > 10000) errors.push('More than 10,000 lug supports. Increase spacing or use the approved schedule.')
      else for (let i = 0; i < count; i++) {
        const geometry = liningGeometryAt(data, { ...reach, designV2: undefined }, first + i * spacing)
        for (const surface of surfaces) {
          if (!(geometry.widths[surface] > 0)) errors.push(`Complete the lug-support geometry on ${chapterSurfaceLabels[surface]}.`)
          else length += geometry.widths[surface]
        }
      }
    }
  }
  return { length: errors.length ? 0 : length, errors: [...new Set(errors)], count }
}
/** Indicative manufactured pieces; each separate support line is rounded up. */
export function suggestedPccLugCount(data: CanalData, reach: CanalLiningReach, spec: CanalLiningChapterSpec, surfaces: CanalLiningSurface[]): number | null {
  const pieceLength = PCC_LUG_LENGTHS_M[spec.lugCode]
  if (!pieceLength) return null
  const measured = lugSupportMeasurement(data, reach, spec, surfaces)
  if (measured.errors.length || !(measured.length > 0)) return null
  const pieces = (length: number): number => Math.ceil(length / pieceLength - 1e-9)
  let count = 0
  if (spec.lugLayout === 'along') {
    const lineCount = surfaces.reduce((sum, surface) => sum + (spec.lugRows?.[surface] ?? 0), 0)
    count = lineCount * pieces(reach.toChainage - reach.fromChainage)
  } else if (spec.lugLayout === 'across') {
    const first = spec.lugFirstChainage!, spacing = spec.lugSpacingM!
    for (let i = 0; i < measured.count; i++) {
      const widths = liningGeometryAt(data, { ...reach, designV2: undefined }, first + i * spacing).widths
      for (const surface of surfaces) count += pieces(widths[surface])
    }
  } else count = pieces(measured.length)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}
export function chapterSpecErrors(s: CanalLiningChapterSpec, surfaces: CanalLiningSurface[]): string[] {
  const errors: string[] = []
  const spec = LINING_SPECIFICATIONS.find(r => r.code === s.code && r.method === s.method)
  if (!s.method) return ['Choose the lining construction.']
  if (!spec) errors.push('Choose the specified lining grade, thickness or slab/masonry specification.')
  if (spec?.sidesOnly && surfaces.includes('bed')) errors.push('This SSR item covers side lining only. Specify the bed separately.')
  if (!(s.thicknessMm != null && s.thicknessMm > 0)) errors.push('Enter a positive lining thickness.')
  if (spec?.thicknessMm != null && s.thicknessMm !== spec.thicknessMm) errors.push('Thickness must match the selected SSR specification.')
  if (s.method === 'stone' && !(s.thicknessMm != null && s.thicknessMm >= 25 && s.thicknessMm <= 40)) errors.push('Stone slab thickness must be 25–40 mm.')
  if (s.method === 'concrete') {
    if (!s.placement || spec && !!spec.paver !== (s.placement === 'paver')) errors.push('Choose the matching concrete placement method.')
    if (s.reinforced == null) errors.push('Answer whether reinforcement is specified.')
    if (s.reinforced && (!s.steelMode || !(s.steelQuantity != null && s.steelQuantity > 0))) errors.push('Enter the approved steel schedule quantity or specified kg per m².')
    if (s.reinforced && (!s.steelSurfaces.length || s.steelSurfaces.some(side=>!surfaces.includes(side)))) errors.push('Choose reinforced surfaces within this concrete specification.')
  }
  if (s.method === 'pcc') {
    if (!s.slabSource) errors.push('Choose whether PCC slabs are manufactured or supplied.')
    if (s.slabSource === 'manufacture' && !(s.slabCount != null && s.slabCount > 0 && Number.isInteger(s.slabCount))) errors.push('Enter a whole-number PCC slab count to manufacture.')
    if (s.lugs == null) errors.push('Answer whether supporting lug slabs are specified.')
    if (s.lugs) {
      if (!['IRR-CAW-7-39', 'IRR-CAW-7-41', 'IRR-CAW-7-44'].includes(s.lugCode)) errors.push('Choose the specified lug slab size.')
      if (s.slabSource === 'manufacture' && !(s.lugCount != null && s.lugCount > 0 && Number.isInteger(s.lugCount))) errors.push('Enter a whole-number lug slab count to manufacture.')
    }
  }
  return errors
}
export function measureLiningChapter(data: CanalData, reach: CanalLiningReach) {
  const c = normalizeLiningChapter(reach.liningChapter ?? defaultLiningChapter())
  const errors: string[] = []
  const lines: { code: string; unit: string; quantity: number; label: string }[] = []
  // Ignore the stored old worksheet: the new chapter inherits the current full canal profile.
  const areas = { bed: 0, left: 0, right: 0 }
  for (const interval of liningIntervals(data, { ...reach, designV2: undefined })) for (const s of chapterSurfaces) areas[s] += interval.areas[s]
  if (!c.surfaces.length) errors.push('Choose the surfaces to line.')
  if (c.surfaces.length > 1 && c.sameSpecification == null) errors.push('Answer whether the same specification is used.')
  const groups = c.sameSpecification === true ? [c.surfaces] : c.surfaces.map(s => [s])
  const add = (code: string, quantity: number, label: string): void => { lines.push({ code, unit: liningCatalogueItem(code)?.unit ?? '', quantity, label }) }
  for (const surfaces of groups) {
    if (!surfaces.length) continue
    const s = activeChapterSpec(c, surfaces[0]), area = surfaces.reduce((sum, side) => sum + areas[side], 0)
    const groupLabel = surfaces.map(side => chapterSurfaceLabels[side]).join(' / ')
    errors.push(...chapterSpecErrors(s, surfaces).map(e => `${groupLabel}: ${e}`))
    const lugs = s.method === 'pcc' && s.lugs ? lugSupportMeasurement(data, reach, s, surfaces) : null
    if (lugs) errors.push(...lugs.errors.map(e => `${groupLabel}: ${e}`))
    if (s.method === 'pcc') {
      add('IRR-CAW-7-28', area, 'Fix PCC slabs')
      if (s.slabSource === 'manufacture') add(s.code, s.slabCount ?? 0, 'Manufacture PCC slabs')
      if (s.lugs) { add('IRR-CAW-7-29', lugs?.length ?? 0, 'Fix supporting lug slabs'); if (s.slabSource === 'manufacture') add(s.lugCode, s.lugCount ?? 0, 'Manufacture lug slabs') }
    } else if (s.code) add(s.code, liningCatalogueItem(s.code)?.unit === 'CUM' ? area * (s.thicknessMm ?? 0) / 1000 : area, 'Lining')
    if (s.method === 'concrete' && s.reinforced) add('IRR-CAW-7-5', (s.steelQuantity ?? 0) * (s.steelMode === 'area' ? s.steelSurfaces.reduce((sum,side)=>sum+areas[side],0) : 1), 'Reinforcement steel')
  }
  if (c.membrane == null) errors.push('Answer whether an LDPE membrane is specified.')
  if (c.membrane) {
    if (!c.membraneSurfaces.length || c.membraneSurfaces.some(s => !c.surfaces.includes(s))) errors.push('Choose LDPE surfaces within the selected lining surfaces.')
    if (!c.membraneMicrons) errors.push('Choose the specified LDPE thickness.')
    if (c.membraneMicrons) add(`IRR-CAW-7-${c.membraneMicrons === 500 ? 31 : c.membraneMicrons === 750 ? 32 : 33}`, c.membraneSurfaces.reduce((sum, s) => sum + areas[s], 0), 'LDPE membrane')
  }
  if (reach.cnsChapter?.required == null) errors.push('Answer Chapter 1 before completing the lining design.')
  for (const other of data.liningReaches) if (other.id !== reach.id && other.provide && other.fromChainage < reach.toChainage && reach.fromChainage < other.toChainage && (!other.liningChapter || c.surfaces.some(s => other.liningChapter?.surfaces.includes(s)))) errors.push('Lining reaches overlap on the same surface. Adjust their limits.')
  const t = liningBackingOffsets(reach)
  const earthwork = measureTreatmentReach(data, reach, ch => treatmentLayerPolygon(data, ch, { bed: 0, left: 0, right: 0 }, t))
  errors.push(...earthwork.errors)
  if (lines.some(l => !l.code || !l.unit || !Number.isFinite(l.quantity) || l.quantity < 0)) errors.push('Complete the item specifications and quantities.')
  return { areas, lines, errors: [...new Set(errors)], earthwork }
}
