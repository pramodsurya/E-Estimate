import type { CanalData, CanalLiningDesign, CanalLiningLayer, CanalLiningReach, CanalLiningSurface, CanalLiningSurfaceDesign, CanalLiningWork, CanalLiningWorkKind, TemplateMaterialRef } from '../types/project'
import { canalBedLevelAt, canalDesignAtChainage, canalGroundLevelAt, canalLiningReachQuantities, orderedCanalSections } from './canal'
import { liningCatalogueItem } from './canalLiningCatalogue'
import { newId } from './tree'

export const LINING_SURFACES: CanalLiningSurface[] = ['bed', 'left', 'right']
export const LINING_SURFACE_LABELS = { bed: 'Bed', left: 'Left side', right: 'Right side' }
const code = (number: number): string => `IRR-CAW-7-${number}`
const rounded = (value: number): number => Math.round(value * 1000) / 1000
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const nonnegative = (value: unknown, fallback = 0): number => Math.max(0, numeric(value) ?? fallback)

export interface LiningSpecification {
  code: string
  method: CanalLiningSurfaceDesign['method']
  label: string
  thicknessMm: number | null
  paver?: boolean
  slabSize?: [number, number, number]
  sidesOnly?: boolean
}

export const LINING_SPECIFICATIONS: LiningSpecification[] = [
  ...[
    [6, 'Mechanical paver · M15 · 75 mm · 20 mm aggregate', 75],
    [7, 'Mechanical paver · M15 · 80 mm · 20 mm aggregate', 80],
    [8, 'Mechanical paver · M15 · 100 mm · 20 mm aggregate', 100],
    [17, 'Mechanical paver · M15 · 150 mm · 20 mm aggregate', 150],
    [12, 'Mechanical paver · M10 · 100 mm · 40 mm aggregate', 100],
    [10, 'In-situ · M10 · 150 mm · 40 mm aggregate', 150],
    [11, 'In-situ · M10 · 100 mm · 40 mm aggregate', 100],
    [13, 'In-situ · M10 · specified thickness · 20 mm aggregate', null],
    [14, 'In-situ · M15 · 150 mm · 40 mm aggregate', 150],
    [15, 'In-situ · M15 · 100 mm · 20 mm aggregate', 100],
    [16, 'Manual in-situ · M15 · 100 mm · 40 mm aggregate', 100]
  ].map(([n, label, thickness]) => ({ code: code(n as number), method: 'concrete' as const, label: label as string, thicknessMm: thickness as number | null, paver: [6, 7, 8, 12, 17].includes(n as number) })),
  ...[
    [38, 550, 550, 55], [40, 450, 300, 30], [42, 600, 300, 100], [43, 400, 400, 30]
  ].map(([n, a, b, t]) => ({ code: code(n), method: 'pcc' as const, label: `PCC slab · ${a} × ${b} × ${t} mm`, thicknessMm: t, slabSize: [a, b, t] as [number, number, number], sidesOnly: true })),
  { code: code(27), method: 'stone', label: 'Stone slabs · 25–40 mm · CM 1:3 pointing', thicknessMm: null },
  { code: code(45), method: 'masonry', label: 'Quarry stones and chips · through stones · CM 1:5', thicknessMm: 300, sidesOnly: true },
  { code: code(46), method: 'masonry', label: 'Quarry stone · without pin headers · CM 1:5', thicknessMm: 300, sidesOnly: true },
  { code: code(47), method: 'masonry', label: 'Excavated stones and chips · through stones · CM 1:5', thicknessMm: null, sidesOnly: true },
  { code: code(48), method: 'masonry', label: 'Excavated stone · CM 1:5', thicknessMm: null, sidesOnly: true },
  { code: code(1), method: 'cns', label: 'CNS · borrow soil · 98% compaction', thicknessMm: null },
  { code: code(2), method: 'cns', label: 'CNS · borrow soil · 95% compaction', thicknessMm: null },
  { code: code(3), method: 'cns', label: 'CNS · approved excavated heaps · 95% compaction', thicknessMm: null }
]

export const LINING_WORK_LABELS: Record<CanalLiningWorkKind, string> = {
  'longitudinal-drain': 'Longitudinal bed drains', 'transverse-drain': 'Transverse bed drains',
  'graded-drain': 'Graded filter drains', plug: 'Porous plugs', relief: 'Pressure-relief assemblies',
  weep: 'PVC weep pipes', mastic: 'Mastic construction / contraction joints', expansion: 'Tarfelt expansion joints',
  template: 'Precast RCC templates', lug: 'PCC lug supports', steps: 'Steps', sleepers: 'Sleepers', coping: 'Coping', 'profile-wall': 'Cast-in-situ profile walls / soffit',
  'level-stone': 'Bed-level stones', reinforcement: 'Reinforcement', 'paver-shift': 'Paver shifting', drop: 'Field-channel drops'
}
export const DRAINAGE_WORKS: CanalLiningWorkKind[] = ['longitudinal-drain', 'transverse-drain', 'graded-drain', 'plug', 'relief', 'weep']

export function defaultLiningSurface(method: CanalLiningSurfaceDesign['method'] = 'concrete'): CanalLiningSurfaceDesign {
  const spec = LINING_SPECIFICATIONS.find((item) => item.method === method)
  return { method, code: spec?.code ?? '', thicknessMm: spec?.thicknessMm ?? null, manufacture: false, slabCount: null, jointWidthMm: 0 }
}

export function defaultLiningDesign(): CanalLiningDesign {
  return { version: 2, name: '', sameSides: true, topMode: 'freeboard', leftFreeboard: null, rightFreeboard: null,
    topRl: null, surfaces: { bed: defaultLiningSurface(), left: defaultLiningSurface(), right: defaultLiningSurface() },
    layers: [], drainageDecision: 'pending', groundwaterRl: null, subgrade: 'unknown', reference: '', works: [], migrationNotes: [] }
}

export function defaultLiningWork(kind: CanalLiningWorkKind, referenceChainage: number, id = newId()): CanalLiningWork {
  const defaults: Partial<Record<CanalLiningWorkKind, string>> = {
    'longitudinal-drain': 'IRR-CAW-5-8', 'transverse-drain': 'IRR-CAW-5-8', 'graded-drain': 'IRR-CAW-5-7',
    plug: 'IRR-CAW-5-9', relief: code(19), weep: code(24), mastic: code(37), expansion: code(35),
    template: code(18), lug: code(29), 'level-stone': code(4), reinforcement: code(5), 'paver-shift': code(9), drop: code(30)
  }
  const continuous = ['longitudinal-drain', 'graded-drain', 'sleepers', 'coping', 'lug'].includes(kind)
  const quantity = ['reinforcement', 'paver-shift', 'drop'].includes(kind)
  return { id, kind, enabled: true, surfaces: kind === 'lug' ? ['left', 'right'] : ['bed'],
    fromChainage: null, toChainage: null, placement: quantity ? 'quantity' : continuous ? 'continuous' : 'spacing',
    referenceChainage, spacing: null, chainages: [], rows: 1, offsets: [0], widthM: null, depthM: null,
    lengthM: null, areaPerUnit: null, filterPocket: false, rockHole: false, distinctScope: false,
    material: defaults[kind] ? { code: defaults[kind], unit: liningCatalogueItem(defaults[kind])?.unit } : null,
    manufacture: false, manufactureCode: code(39), manualQuantity: null, note: '' }
}

/** Normalize the versioned worksheet without changing original legacy billing. */
export function normalizeLiningDesign(raw: CanalLiningDesign): CanalLiningDesign {
  const base = defaultLiningDesign()
  const surfaces = { bed: defaultLiningSurface('none'), left: defaultLiningSurface('none'), right: defaultLiningSurface('none') }
  for (const side of LINING_SURFACES) {
    const value = raw.surfaces?.[side]
    if (!value || typeof value !== 'object') continue
    surfaces[side] = { ...defaultLiningSurface('none'), ...value,
      method: ['none', 'concrete', 'pcc', 'stone', 'masonry', 'cns'].includes(value.method) ? value.method : 'none',
      thicknessMm: numeric(value.thicknessMm), slabCount: numeric(value.slabCount), jointWidthMm: nonnegative(value.jointWidthMm) }
  }
  if (raw.sameSides) surfaces.right = { ...surfaces.left }
  const selected = (value: unknown): CanalLiningSurface[] => Array.isArray(value) ? [...new Set(value.filter((side): side is CanalLiningSurface => LINING_SURFACES.includes(side)))] : []
  return { ...base, ...raw, version: 2, surfaces,
    topMode: ['fsl', 'freeboard', 'rl'].includes(raw.topMode) ? raw.topMode : 'freeboard',
    drainageDecision: ['pending', 'none', 'provided'].includes(raw.drainageDecision) ? raw.drainageDecision : 'pending',
    leftFreeboard: numeric(raw.leftFreeboard), rightFreeboard: raw.sameSides ? numeric(raw.leftFreeboard) : numeric(raw.rightFreeboard), topRl: numeric(raw.topRl), groundwaterRl: numeric(raw.groundwaterRl),
    layers: (Array.isArray(raw.layers) ? raw.layers : []).filter((layer) => layer && ['cns', 'ldpe'].includes(layer.kind)).map((layer) => ({ ...layer, surfaces: selected(layer.surfaces), thicknessMm: numeric(layer.thicknessMm), returnsArea: nonnegative(layer.returnsArea) })),
    works: (Array.isArray(raw.works) ? raw.works : []).filter((work) => work && Object.hasOwn(LINING_WORK_LABELS, work.kind)).map((work, index) => ({
      ...defaultLiningWork(work.kind, 0, work.id || `restored-work-${index}`), ...work, surfaces: selected(work.surfaces),
      placement: ['spacing', 'manual', 'area', 'continuous', 'quantity'].includes(work.placement) ? work.placement : 'manual',
      fromChainage: numeric(work.fromChainage), toChainage: numeric(work.toChainage), spacing: numeric(work.spacing),
      referenceChainage: numeric(work.referenceChainage) ?? 0, rows: Math.floor(nonnegative(work.rows, 1)),
      chainages: Array.isArray(work.chainages) ? [...new Set(work.chainages.filter((ch) => numeric(ch) !== null))].sort((a, b) => a - b) : [],
      offsets: Array.isArray(work.offsets) ? work.offsets.filter((offset) => numeric(offset) !== null) : [0],
      widthM: numeric(work.widthM), depthM: numeric(work.depthM), lengthM: numeric(work.lengthM), areaPerUnit: numeric(work.areaPerUnit), manualQuantity: numeric(work.manualQuantity)
    })), migrationNotes: Array.isArray(raw.migrationNotes) ? raw.migrationNotes : [] }
}

export interface LiningGeometry {
  chainage: number
  bedRl: number
  widths: Record<CanalLiningSurface, number>
  heights: { left: number; right: number }
}
export interface LiningInterval {
  from: number; to: number; length: number
  start: LiningGeometry; end: LiningGeometry
  areas: Record<CanalLiningSurface, number>
}
export interface LiningMeasurementLine {
  id: string; cardId: string; label: string; surface: string
  ref: TemplateMaterialRef; quantity: number; unit: string; formula: string
  errors: string[]; billable: boolean
}
export interface LiningWorksheet {
  intervals: LiningInterval[]
  areas: Record<CanalLiningSurface, number>
  lines: LiningMeasurementLine[]
  errors: string[]
  warnings: string[]
  conditions: string
}

/** Developed prism lengths include canal-side shelves; coping remains separate. */
export function liningGeometryAt(data: CanalData, reach: CanalLiningReach, chainage: number): LiningGeometry {
  const design = canalDesignAtChainage(data.design, chainage)
  const worksheet = reach.designV2 ?? defaultLiningDesign()
  const bedRl = canalBedLevelAt(data, chainage) ?? 0
  const height = (side: 'left' | 'right'): number => worksheet.topMode === 'rl'
    ? Math.max(0, (worksheet.topRl ?? bedRl) - bedRl)
    : Math.max(0, design.fullSupplyDepth + (worksheet.topMode === 'fsl' ? 0 : worksheet[side === 'left' ? 'leftFreeboard' : 'rightFreeboard'] ?? design.freeBoard))
  const widths = { bed: Math.max(0, design.bedWidth), left: 0, right: 0 }
  const heights = { left: height('left'), right: height('right') }
  for (const side of ['left', 'right'] as const) {
    widths[side] = heights[side] * Math.hypot(1, design.sideSlope) + design.berms
      .filter((berm) => berm.face === `${side}-canal` && berm.heightAboveBed > 0 && berm.heightAboveBed < heights[side])
      .reduce((sum, berm) => sum + Math.max(0, berm.width), 0)
  }
  return { chainage, bedRl, widths, heights }
}

export function liningIntervals(data: CanalData, reach: CanalLiningReach, from = reach.fromChainage, to = reach.toChainage): LiningInterval[] {
  if (!(to > from)) return []
  const points = [...new Set([from, to, ...orderedCanalSections(data).map((s) => s.chainage).filter((ch) => ch > from && ch < to)])].sort((a, b) => a - b)
  return points.slice(1).map((end, index) => {
    const start = points[index]
    const a = liningGeometryAt(data, reach, start)
    const b = liningGeometryAt(data, reach, end)
    return { from: start, to: end, length: end - start, start: a, end: b,
      areas: { bed: (a.widths.bed + b.widths.bed) / 2 * (end - start), left: (a.widths.left + b.widths.left) / 2 * (end - start), right: (a.widths.right + b.widths.right) / 2 * (end - start) } }
  })
}

/** A shared placement belongs to the following work; isolated ends stay included. */
export function liningWorkLocations(data: CanalData, reach: CanalLiningReach, work: CanalLiningWork): number[] {
  const from = work.fromChainage ?? reach.fromChainage
  const to = work.toChainage ?? reach.toChainage
  const endClaimed = data.liningReaches.some((otherReach) => otherReach.provide && otherReach.designV2?.works.some((other) => {
    if (!other.enabled || other.kind !== work.kind || !other.surfaces.some((side) => work.surfaces.includes(side))) return false
    if (otherReach.id === reach.id && other.id === work.id) return false
    if (Math.abs((other.fromChainage ?? otherReach.fromChainage) - to) > 1e-7) return false
    if (other.placement === 'manual') return other.chainages.some((ch) => Math.abs(ch - to) < 1e-7)
    return other.placement === 'spacing' && other.spacing != null && other.spacing > 0 && Math.abs((to - other.referenceChainage) / other.spacing - Math.round((to - other.referenceChainage) / other.spacing)) < 1e-7
  }))
  const inside = (ch: number): boolean => ch >= from - 1e-7 && ch <= to + 1e-7 && !(endClaimed && Math.abs(ch - to) < 1e-7)
  if (work.placement === 'manual') return [...new Set(work.chainages)].filter(inside).sort((a, b) => a - b)
  if (work.placement !== 'spacing' || !(work.spacing != null && work.spacing > 0)) return []
  const first = work.referenceChainage + Math.ceil((from - work.referenceChainage - 1e-7) / work.spacing) * work.spacing
  const count = Math.floor((to - first + 1e-7) / work.spacing) + 1
  if (count > 10000 || count < 0) return []
  return Array.from({ length: count }, (_, index) => first + index * (work.spacing as number)).filter(inside)
}

function surfaceConflict(a: CanalLiningDesign, b: CanalLiningDesign): boolean {
  return LINING_SURFACES.some((side) => a.surfaces[side].method !== 'none' && b.surfaces[side].method !== 'none') ||
    a.layers.some((layer) => layer.enabled && b.layers.some((other) => other.enabled && other.kind === layer.kind && layer.surfaces.some((side) => other.surfaces.includes(side))))
}

export function measureLiningWorksheet(data: CanalData, reach: CanalLiningReach): LiningWorksheet {
  const d = normalizeLiningDesign(reach.designV2 ?? defaultLiningDesign())
  const normalizedReach = { ...reach, designV2: d }
  const intervals = liningIntervals(data, normalizedReach)
  const areas = { bed: 0, left: 0, right: 0 }
  intervals.forEach((interval) => LINING_SURFACES.forEach((side) => { areas[side] += interval.areas[side] }))
  const errors: string[] = []
  const warnings: string[] = []
  const lines: LiningMeasurementLine[] = []
  if (!(reach.toChainage > reach.fromChainage) || reach.fromChainage < 0 || reach.toChainage > data.lengthM) errors.push('Set a positive reach within the canal length.')
  if (!(data.design.bedWidth > 0 && data.design.fullSupplyDepth > 0 && data.design.sideSlope >= 0)) errors.push('Complete the inherited bed width, supply depth and side-slope geometry.')
  if (d.topMode === 'rl' && d.topRl == null) errors.push('Enter the specified lining-top RL.')
  if (intervals.some((interval) => [interval.start, interval.end].some((g) => g.heights.left <= 0 || g.heights.right <= 0 || g.heights.left > data.design.fullSupplyDepth + data.design.freeBoard + 1e-7 || g.heights.right > data.design.fullSupplyDepth + data.design.freeBoard + 1e-7))) errors.push('Lining top must lie above the bed and within the designed canal-side height.')
  if (d.drainageDecision === 'pending') errors.push('Record whether under-drainage is provided or not specified.')
  for (const other of data.liningReaches) {
    if (other.id === reach.id || !other.provide || other.fromChainage >= reach.toChainage || reach.fromChainage >= other.toChainage) continue
    if (!other.designV2 || surfaceConflict(d, normalizeLiningDesign(other.designV2))) errors.push('Overlapping reaches treat the same surface or layer. Trim or split their extents.')
  }
  const add = (cardId: string, label: string, surface: string, itemCode: string, quantity: number, formula: string, problems: string[] = [], ref?: TemplateMaterialRef): void => {
    const item = liningCatalogueItem(itemCode)
    const unit = item?.unit ?? ref?.unit ?? ''
    const issues = [...problems]
    if (item && ref?.unit && ref.unit.toUpperCase() !== item.unit.toUpperCase()) issues.push('Selected unit differs from the published SSR unit.')
    if (!itemCode || !unit) issues.push('Select an item with a published measurement unit.')
    if (!Number.isFinite(quantity) || quantity < 0) issues.push('Quantity must be finite and non-negative.')
    const countUnit = ['NOS', 'PLUG', 'TEMPLETE', 'SHIFTING'].includes(unit.toUpperCase())
    if (countUnit && Math.abs(quantity - Math.round(quantity)) > 1e-7) issues.push('Enter a whole-number count.')
    lines.push({ id: `${cardId}-${lines.length}`, cardId, label, surface, ref: { ...(ref ?? {}), code: itemCode, unit, description: ref?.description ?? item?.description }, unit,
      quantity: Number.isFinite(quantity) ? rounded(quantity) : 0, formula, errors: issues,
      billable: reach.provide && !errors.length && !issues.length && quantity > 0 })
  }
  for (const side of LINING_SURFACES) {
    const surface = d.surfaces[side]
    if (surface.method === 'none') continue
    const spec = LINING_SPECIFICATIONS.find((item) => item.code === surface.code && item.method === surface.method)
    const problems: string[] = []
    if (!spec) problems.push('No exact SSR match for this treatment.')
    if (spec?.sidesOnly && side === 'bed') problems.push('This item describes side lining; select a matching bed treatment.')
    const unit = liningCatalogueItem(surface.code)?.unit
    const thickness = surface.thicknessMm
    if (spec?.thicknessMm != null && thickness !== spec.thicknessMm) problems.push('Thickness must match the selected SSR specification.')
    if (unit === 'CUM' && !(thickness != null && thickness > 0)) problems.push('Enter the designed layer thickness.')
    if (surface.method === 'stone' && !(thickness != null && thickness >= 25 && thickness <= 40)) problems.push('Select stone thickness between 25 and 40 mm.')
    const area = areas[side]
    if (surface.method === 'pcc') {
      const count = surface.slabCount ?? 0
      const cellArea = spec?.slabSize ? (spec.slabSize[0] + surface.jointWidthMm) * (spec.slabSize[1] + surface.jointWidthMm) / 1e6 : 0
      if (!(surface.slabCount != null && surface.slabCount > 0)) problems.push('Confirm the installed slab count from the layout/schedule.')
      else if (cellArea * count + 1e-6 < area) problems.push('The confirmed slab schedule does not cover the measured area.')
      add(`surface-${side}`, 'Fixing PCC slabs', side, code(28), area, `${area.toFixed(3)} m² measured side area; slabs excluded`, problems)
      if (surface.manufacture) add(`surface-${side}`, 'Manufacturing PCC slabs', side, surface.code, count, `${count} confirmed slabs; procurement allowance excluded`, problems)
    } else {
      const quantity = unit === 'CUM' ? area * (thickness ?? 0) / 1000 : area
      add(`surface-${side}`, spec?.label ?? 'Lining', side, surface.code, quantity,
        unit === 'CUM' ? `${area.toFixed(3)} m² × ${thickness ?? '—'} mm / 1000` : `Σ interval developed area = ${area.toFixed(3)} m²`, problems)
    }
  }
  for (const layer of d.layers.filter((item) => item.enabled)) {
    const area = layer.surfaces.reduce((sum, side) => sum + areas[side], 0)
    const problems: string[] = []
    const allowed = layer.kind === 'cns' ? [code(1), code(2), code(3)] : [code(31), code(32), code(33)]
    if (!allowed.includes(layer.code)) problems.push('Select a compatible layer item.')
    if (!layer.surfaces.length) problems.push('Select at least one surface.')
    if (layer.kind === 'cns' && !(layer.thicknessMm != null && layer.thicknessMm > 0)) problems.push('Enter CNS layer thickness normal to the surface.')
    if (d.layers.some((other) => other.id !== layer.id && other.enabled && other.kind === layer.kind && other.surfaces.some((side) => layer.surfaces.includes(side)))) problems.push('The same layer is already enabled on this surface.')
    if (layer.kind === 'cns' && layer.surfaces.some((side) => d.surfaces[side].method === 'cns')) problems.push('CNS is already selected as the surface treatment.')
    const quantity = layer.kind === 'cns' ? area * (layer.thicknessMm ?? 0) / 1000 : area + layer.returnsArea
    add(layer.id, layer.kind === 'cns' ? 'CNS subgrade layer' : 'LDPE membrane', layer.surfaces.join(', '), layer.code, quantity,
      layer.kind === 'cns' ? `${area.toFixed(3)} m² × ${layer.thicknessMm ?? '—'} mm / 1000` : `${area.toFixed(3)} m² coverage + ${layer.returnsArea} m² designed returns`, problems)
  }
  for (const work of d.works.filter((item) => item.enabled)) {
    const isDrain = DRAINAGE_WORKS.includes(work.kind)
    if (isDrain && d.drainageDecision !== 'provided') continue
    const from = work.fromChainage ?? reach.fromChainage
    const to = work.toChainage ?? reach.toChainage
    const problems: string[] = []
    if (from < reach.fromChainage || to > reach.toChainage || !(to > from)) problems.push('Work extent must lie within its lining reach.')
    if (!work.surfaces.length) problems.push('Select a surface/location.')
    if (isDrain && work.surfaces.some((side) => d.surfaces[side].method === 'none' && !d.layers.some((layer) => layer.enabled && layer.surfaces.includes(side)))) problems.push('Drainage must be attached to a treated surface.')
    if (work.placement === 'spacing' && !(work.spacing != null && work.spacing > 0)) problems.push('Enter a positive placement interval.')
    if (work.placement === 'spacing' && (to - from) / (work.spacing ?? 1) > 9999) problems.push('More than 10,000 locations: increase spacing or split the work.')
    if (work.placement === 'manual' && !liningWorkLocations(data, normalizedReach, work).length) problems.push('Add locations within this reach. Shared endpoints belong to the next reach.')
    if (work.chainages.some((ch) => ch < from || ch > to)) problems.push('A manual location lies outside the work extent.')
    if (!(work.rows >= 1)) problems.push('Enter at least one row/unit per location.')
    if (work.placement === 'continuous' && ['transverse-drain', 'plug', 'relief', 'weep', 'expansion', 'template', 'level-stone', 'reinforcement', 'paver-shift', 'drop'].includes(work.kind)) problems.push('This work requires discrete locations or an explicit schedule, not continuous rows.')
    const localAreas = { bed: 0, left: 0, right: 0 }
    liningIntervals(data, normalizedReach, from, to).forEach((interval) => LINING_SURFACES.forEach((side) => { localAreas[side] += interval.areas[side] }))
    const area = work.surfaces.reduce((sum, side) => sum + localAreas[side], 0)
    const points = liningWorkLocations(data, normalizedReach, work)
    const count = points.length * work.rows * work.surfaces.length
    const across = points.reduce((sum, ch) => sum + work.surfaces.reduce((total, side) => total + liningGeometryAt(data, normalizedReach, ch).widths[side], 0), 0) * work.rows
    const along = (to - from) * work.rows * work.surfaces.length
    const itemCode = work.material?.code ?? ''
    const unit = liningCatalogueItem(itemCode)?.unit ?? work.material?.unit ?? ''
    let quantity = count
    let formula = `${points.length} locations × ${work.rows} units × ${work.surfaces.length} surfaces`
    if (work.placement === 'quantity') {
      if (work.manualQuantity == null) problems.push('Enter the scheduled quantity.')
      quantity = work.manualQuantity ?? 0
      formula = `Explicit schedule: ${quantity} ${unit}`
      if (!work.note.trim()) problems.push('Enter the schedule/drawing or scope reference.')
    } else if (work.kind === 'longitudinal-drain' || work.kind === 'graded-drain') {
      const physical = work.placement === 'continuous' ? along : across
      quantity = physical
      formula = `${physical.toFixed(3)} m physical drain length`
      if (work.kind === 'graded-drain') {
        if (!(work.widthM != null && work.widthM > 0 && work.depthM != null && work.depthM > 0)) problems.push('Enter graded-drain width and depth.')
        quantity *= (work.widthM ?? 0) * (work.depthM ?? 0)
        formula += ` × ${work.widthM ?? '—'} m × ${work.depthM ?? '—'} m`
      }
      if (work.kind === 'longitudinal-drain') {
        if (work.surfaces.some((side) => side !== 'bed')) problems.push('Bed drain rows must be on the bed.')
        if (work.offsets.length !== work.rows || new Set(work.offsets).size !== work.rows) problems.push('Enter one distinct centre-line offset per drain row.')
        if (work.offsets.some((offset) => Math.abs(offset) + 0.3 > data.design.bedWidth / 2)) problems.push('A 600 mm drain extends outside the bed.')
      }
    } else if (work.kind === 'transverse-drain') {
      if (work.surfaces.some((side) => side !== 'bed')) problems.push('Transverse bed drains must be on the bed.')
      quantity = across
      formula = `Σ bed width at ${points.length} drain locations × ${work.rows} rows = ${quantity.toFixed(3)} m`
    } else if (work.kind === 'plug' && work.placement === 'area') {
      if (!(work.areaPerUnit != null && work.areaPerUnit > 0)) problems.push('Enter positive area per plug.')
      quantity = work.surfaces.reduce((sum, side) => sum + Math.ceil(localAreas[side] / (work.areaPerUnit || 1)), 0)
      formula = `Σ ceil(surface area / ${work.areaPerUnit ?? '—'} m² per plug); indicative count`
    } else if (work.kind === 'mastic' || work.kind === 'expansion') {
      quantity = work.placement === 'continuous' ? along : across
      formula = work.placement === 'continuous' ? `${to - from} m × ${work.rows} joint rows × ${work.surfaces.length} surfaces` : `Σ developed widths at ${points.length} joint locations × ${work.rows} rows`
      if (work.kind === 'mastic' && work.surfaces.some((side) => LINING_SPECIFICATIONS.find((spec) => spec.code === d.surfaces[side].code)?.paver) && !work.distinctScope) problems.push('Paver lining includes sealing strips. Identify a distinct mastic joint scope before billing.')
      if (work.kind === 'expansion') {
        const masonry = work.surfaces.some((side) => d.surfaces[side].method === 'masonry')
        if (masonry && itemCode !== code(34)) problems.push('Masonry expansion joints require the masonry board detail.')
        if (!masonry && itemCode === code(34)) problems.push('The masonry board item does not match concrete lining.')
        const depth = itemCode === code(35) ? 100 : itemCode === code(36) ? 150 : null
        if (depth != null && work.surfaces.some((side) => d.surfaces[side].thicknessMm !== depth)) problems.push('Board depth must match the specified lining detail; select a compatible thickness/item.')
      }
    } else if (work.kind === 'lug') {
      if (work.surfaces.some((side) => d.surfaces[side].method !== 'pcc')) problems.push('Lug supports require PCC slab lining on the selected side.')
      quantity = along
      formula = `${to - from} m × ${work.rows} support rows × ${work.surfaces.length} sides`
      if (work.manufacture) {
        const lugLengths: Record<string, number> = { [code(39)]: 0.55, [code(41)]: 0.45, [code(44)]: 0.4 }
        const length = lugLengths[work.manufactureCode]
        const manufacturingIssues = [...problems]
        if (!length) manufacturingIssues.push('Select a matching lug slab size.')
        if (work.manualQuantity == null || !(work.manualQuantity > 0)) manufacturingIssues.push('Confirm manufactured lug count from its schedule.')
        else if (length && work.manualQuantity * length < quantity - 1e-7) manufacturingIssues.push('Lug count does not cover the support length.')
        add(work.id, 'Manufacturing PCC lug slabs', work.surfaces.join(', '), work.manufactureCode, work.manualQuantity ?? 0, 'Confirmed lug slab schedule; fixing excludes slabs', manufacturingIssues)
      }
    } else if (['steps', 'sleepers', 'coping', 'profile-wall'].includes(work.kind)) {
      if (!(work.widthM != null && work.widthM > 0 && work.depthM != null && work.depthM > 0)) problems.push('Enter cross-section width and depth.')
      if (unit.toUpperCase() !== 'CUM') problems.push('Select a concrete item measured in CUM.')
      const length = work.placement === 'continuous' ? along : (work.lengthM != null ? count * work.lengthM : across)
      quantity = length * (work.widthM ?? 0) * (work.depthM ?? 0)
      formula = `${length.toFixed(3)} m × ${work.widthM ?? '—'} m × ${work.depthM ?? '—'} m`
    }
    const fixedCodes: Partial<Record<CanalLiningWorkKind, string[]>> = {
      'longitudinal-drain': ['IRR-CAW-5-8'], 'transverse-drain': ['IRR-CAW-5-8'], 'graded-drain': ['IRR-CAW-5-7'],
      plug: ['IRR-CAW-5-9'], relief: [19, 20, 21, 22, 23].map(code), weep: [code(24)],
      mastic: [code(37)], expansion: [34, 35, 36].map(code), template: [code(18)], lug: [code(29)],
      'level-stone': [code(4)], reinforcement: [code(5)], 'paver-shift': [code(9)], drop: [code(30)]
    }
    if (fixedCodes[work.kind] && !fixedCodes[work.kind]?.includes(itemCode)) problems.push('Select a compatible catalogue item for this work.')
    if (work.placement === 'area' && work.kind !== 'plug') problems.push('Area placement applies only to porous plugs.')
    if (work.kind === 'relief' && work.rockHole && d.subgrade !== 'rock') problems.push('Rock relief holes require the rock subgrade detail.')
    if (work.kind === 'mastic' && work.distinctScope && !work.note.trim()) problems.push('Describe the distinct joint scope / drawing reference.')
    if (work.kind === 'template' && !['spacing', 'manual'].includes(work.placement)) problems.push('Templates must be counted at specified locations.')
    if (work.kind === 'expansion' && work.surfaces.some((side) => !['concrete', 'masonry'].includes(d.surfaces[side].method))) problems.push('Expansion boards require a compatible concrete or masonry surface.')
    if (work.kind === 'mastic' && work.surfaces.some((side) => d.surfaces[side].method !== 'concrete')) problems.push('Mastic concrete joints require concrete surface lining.')
    if (work.kind === 'paver-shift' && !LINING_SURFACES.some((side) => LINING_SPECIFICATIONS.find((spec) => spec.code === d.surfaces[side].code && d.surfaces[side].method === 'concrete')?.paver)) problems.push('Paver shifting requires a mechanical-paver lining specification.')
    if (work.kind === 'paver-shift' && !work.distinctScope) problems.push('Record an obstruction shift; ordinary side-to-side shifting is included.')
    if (work.kind === 'reinforcement' && !work.distinctScope) problems.push('Confirm this steel excludes reinforcement already included in precast items.')
    if (work.kind === 'reinforcement' && work.placement !== 'quantity') problems.push('Reinforcement must use its approved scheduled weight in KG.')
    add(work.id, LINING_WORK_LABELS[work.kind], work.surfaces.join(', '), itemCode, quantity, formula, problems, work.material ?? undefined)
    if (work.kind === 'relief') {
      if (work.filterPocket) add(work.id, 'Filter pockets around relief pipes', work.surfaces.join(', '), code(26), quantity, `${quantity} pipe assemblies × 1 filter pocket`, problems)
      if (work.rockHole) add(work.id, 'Rock relief holes', work.surfaces.join(', '), code(25), quantity, `${quantity} pipe assemblies × 1 drilled hole`, problems)
    }
    if (work.kind === 'longitudinal-drain' || work.kind === 'transverse-drain') warnings.push('CAW 5-8 retains the published MT unit; the physical quantity is drain length. Verify its unit interpretation before issue.')
    if (work.kind === 'plug') warnings.push('Porous-plug item includes its local filter pocket; do not bill that pocket again.')
  }
  const enabledWorks = d.works.filter((work) => work.enabled && (!DRAINAGE_WORKS.includes(work.kind) || d.drainageDecision === 'provided'))
  for (let i = 0; i < enabledWorks.length; i += 1) for (let j = i + 1; j < enabledWorks.length; j += 1) {
    const a = enabledWorks[i]; const b = enabledWorks[j]
    if (a.kind !== b.kind || !a.surfaces.some((side) => b.surfaces.includes(side))) continue
    const overlap = (a.fromChainage ?? reach.fromChainage) < (b.toChainage ?? reach.toChainage) && (b.fromChainage ?? reach.fromChainage) < (a.toChainage ?? reach.toChainage)
    if (!overlap) continue
    let duplicate = ['area', 'quantity', 'continuous'].includes(a.placement) && ['area', 'quantity', 'continuous'].includes(b.placement)
    if (a.kind === 'longitudinal-drain') duplicate = a.offsets.some((offset) => b.offsets.includes(offset))
    if (!duplicate && ['spacing', 'manual'].includes(a.placement) && ['spacing', 'manual'].includes(b.placement)) {
      const locations = new Set(liningWorkLocations(data, normalizedReach, a))
      duplicate = liningWorkLocations(data, normalizedReach, b).some((ch) => locations.has(ch))
    }
    if (duplicate) for (const line of lines.filter((line) => line.cardId === a.id || line.cardId === b.id)) {
      line.errors.push('Another card measures the same work at overlapping locations. Use one card or separate its extent/locations.'); line.billable = false
    }
  }
  const legacyDrainage = data.filterDrainReaches.filter((work) => ['5-8', '5-9'].includes(work.kind) && work.fromChainage < reach.toChainage && work.toChainage > reach.fromChainage)
  if (legacyDrainage.length) {
    errors.push('Existing standalone bed drainage overlaps this reach. Adopt it into lining before billing the worksheet.')
    lines.forEach((line) => { line.billable = false })
  }
  const groundStates = orderedCanalSections(data).filter((s) => s.chainage >= reach.fromChainage && s.chainage <= reach.toChainage)
    .map((section) => { const ground = canalGroundLevelAt(section.ground, 0); const bed = canalBedLevelAt(data, section.chainage); return ground == null || bed == null ? 'unknown' : ground > bed + 1e-6 ? 'cutting' : ground < bed - 1e-6 ? 'filling' : 'at bed level' })
  const known = [...new Set(groundStates.filter((state) => state !== 'unknown'))]
  return { intervals, areas, lines, errors: [...new Set(errors)], warnings: [...new Set(warnings)], conditions: known.length > 1 ? 'Mixed ground conditions' : known[0] ?? 'Ground conditions not entered' }
}

export function liningWorkItemOptions(kind: CanalLiningWorkKind): Array<{ code: string; label: string }> {
  const numbers: Partial<Record<CanalLiningWorkKind, number[]>> = { relief: [19, 20, 21, 22, 23], expansion: [34, 35, 36] }
  const labels: Record<number, string> = { 19: 'GI Ø50 mm · 125 mm long', 20: 'GI Ø50 mm · 225 mm long', 21: 'GI Ø50 mm · 300 mm long', 22: 'GI Ø50 mm · 450 mm long', 23: 'GI Ø50 mm · 750 mm long', 34: 'Masonry · 12 mm × 380 mm board', 35: 'Concrete · 20 mm × 100 mm board', 36: 'Concrete · 20 mm × 150 mm board' }
  return (numbers[kind] ?? []).map((n) => ({ code: code(n), label: labels[n] }))
}

/** Explicit conversion keeps old dimensions/quantities visible, never runs on load. */
export function convertLegacyLining(data: CanalData, reach: CanalLiningReach): CanalLiningDesign {
  const d = defaultLiningDesign()
  const q = canalLiningReachQuantities(data, reach)
  d.leftFreeboard = d.rightFreeboard = reach.liningFb
  const oldCode = reach.itemOverrides.lining?.code ?? code(6)
  const spec = LINING_SPECIFICATIONS.find((item) => item.code === oldCode)
  for (const side of LINING_SURFACES) d.surfaces[side] = reach.bill.lining ? { ...defaultLiningSurface(spec?.method ?? 'concrete'), code: oldCode, thicknessMm: reach.thicknessMm ?? spec?.thicknessMm ?? 75 } : defaultLiningSurface('none')
  d.migrationNotes.push('Converted explicitly from the original worksheet. Coping is separate from side area. Review all inherited accessory scopes and drainage before billing.')
  const manual: Array<['modelWall' | 'steps' | 'sleepers', CanalLiningWorkKind, number]> = [['modelWall', 'template', q.modelWallVolume + q.soffitVolume], ['steps', 'steps', q.stepsVolume], ['sleepers', 'sleepers', q.sleepersVolume]]
  for (const [key, kind, quantity] of manual) {
    if (!reach.bill[key]) continue
    const work = defaultLiningWork(kind === 'template' ? 'profile-wall' : kind, reach.fromChainage)
    work.placement = 'quantity'; work.manualQuantity = quantity
    work.material = reach.itemOverrides[key] ?? { code: 'IRR-CCDW-2-3', unit: 'CUM' }
    work.note = `Legacy ${key}: ${quantity} CUM. Review the original drawing and scope.`
    d.works.push(work)
  }
  if (reach.bill.porousPlugs) for (const side of LINING_SURFACES) {
    const work = defaultLiningWork('plug', reach.fromChainage)
    work.surfaces = [side]; work.placement = 'area'; work.areaPerUnit = side === 'bed' ? q.plugBedSpacingSqm : q.plugSlopeSpacingSqm
    d.works.push(work)
  }
  for (const kind of ['mastic', 'expansion'] as const) {
    if (!reach.bill[kind === 'mastic' ? 'masticJoints' : 'tarfeltJoints']) continue
    const work = defaultLiningWork(kind, reach.fromChainage)
    work.surfaces = [...LINING_SURFACES]; work.spacing = kind === 'mastic' ? q.panelLengthM : q.modelWallIntervalM
    work.material = reach.itemOverrides[kind === 'mastic' ? 'masticJoints' : 'tarfeltJoints'] ?? work.material
    d.works.push(work)
  }
  return d
}

/** Move complete old records atomically; no hidden copy remains in standalone billing. */
export function adoptStandaloneLiningDrainage(data: CanalData, reachId: string, recordId: string): CanalData {
  const reach = data.liningReaches.find((item) => item.id === reachId)
  const record = data.filterDrainReaches.find((item) => item.id === recordId)
  if (!reach?.designV2 || !record || !['5-8', '5-9'].includes(record.kind)) return data
  if (record.fromChainage < reach.fromChainage || record.toChainage > reach.toChainage) return data
  const kind = record.kind === '5-9' ? 'plug' : record.orientation === 'cross' ? 'transverse-drain' : 'longitudinal-drain'
  const work = defaultLiningWork(kind, record.fromChainage)
  work.fromChainage = record.fromChainage; work.toChainage = record.toChainage
  work.surfaces = record.kind === '5-9' ? record.plugLocations ?? (record.side === 'both' ? ['left', 'right'] : [record.side]) : ['bed']
  work.placement = record.placementMode === 'manual' ? 'manual' : record.placementMode === 'count' || (record.kind === '5-9' && !record.placementMode) ? 'quantity' : kind === 'longitudinal-drain' ? 'continuous' : 'spacing'
  work.spacing = record.spacing; work.chainages = record.manualChainages ?? []
  work.manualQuantity = record.count * work.surfaces.length; work.material = { ...record.material, unit: record.kind === '5-9' ? 'PLUG' : 'MT' }
  work.offsets = [record.offset ?? 0]; work.note = 'Adopted from standalone drainage. Review locations and connections.'
  return { ...data, filterDrainReaches: data.filterDrainReaches.filter((item) => item.id !== recordId), liningReaches: data.liningReaches.map((item) => item.id !== reachId ? item : { ...item, designV2: { ...reach.designV2 as CanalLiningDesign, drainageDecision: 'provided', works: [...(reach.designV2 as CanalLiningDesign).works, work] } }) }
}

export function splitLiningReach(reach: CanalLiningReach, chainage: number): CanalLiningReach[] {
  if (!reach.designV2 || !(chainage > reach.fromChainage && chainage < reach.toChainage)) return [reach]
  const d = reach.designV2
  // Scheduled totals need an explicit allocation; never duplicate them on split.
  if (LINING_SURFACES.some((side) => d.surfaces[side].slabCount != null) || d.layers.some((layer) => layer.returnsArea > 0) || d.works.some((work) => work.manualQuantity != null || work.placement === 'area')) return [reach]
  const segment = (from: number, to: number, id: string): CanalLiningReach => {
    const design = structuredClone(d)
    design.works = design.works.map((work) => {
      const start = Math.max(from, work.fromChainage ?? reach.fromChainage)
      const end = Math.min(to, work.toChainage ?? reach.toChainage)
      return { ...work, enabled: work.enabled && end > start, fromChainage: start, toChainage: end, chainages: work.chainages.filter((ch) => ch >= start && ch <= end) }
    })
    return { ...reach, id, fromChainage: from, toChainage: to, designV2: design }
  }
  return [segment(reach.fromChainage, chainage, reach.id), segment(chainage, reach.toChainage, newId())]
}

export function defaultLiningLayer(kind: CanalLiningLayer['kind']): CanalLiningLayer {
  return { id: newId(), kind, enabled: true, surfaces: [...LINING_SURFACES], code: kind === 'cns' ? code(1) : code(31), thicknessMm: null, returnsArea: 0 }
}
