// Guide Wall component template: chainage geometry, per-section cross-sections,
// quantity computation, and the sync that writes computed measurement sheets
// into ordinary item children (so totals and every print keep working).

import type {
  GuideWallData,
  GuideWallExcavationRow,
  GuideWallMaterialItem,
  GuideWallMaterialRef,
  GuideWallPoint,
  GuideWallSection,
  GuideWallSideMode,
  GuideWallWallParams,
  ProjectNode
} from '../types/project'
import { createNode, findNode, newId, patchNode, removeNode } from './tree'

export const GUIDE_WALL_DEFAULT_WALL_CODE = 'IRR-CCDW-2-9'
export const GUIDE_WALL_DEFAULT_BASE_CODE = 'IRR-CCDW-2-3'
export const GUIDE_WALL_DEFAULT_EXCAVATION_CODE = 'IRR-CCDW-1-2'

// The "Detailed" tree row under a Guide Wall component is a synthetic selection
// (not a real node): the component id with this suffix. WorkArea detects it and
// shows the guide-wall design dashboard instead of a node editor.
const GW_DETAIL_SUFFIX = '::gwdetail'

export function guideWallDetailId(componentId: string): string {
  return componentId + GW_DETAIL_SUFFIX
}

export function parseGuideWallDetailId(id: string | null | undefined): string | null {
  return id && id.endsWith(GW_DETAIL_SUFFIX) ? id.slice(0, -GW_DETAIL_SUFFIX.length) : null
}

export function defaultWallParams(): GuideWallWallParams {
  return { topWidth: 0.6, height: 3, faceSlope: 0.3 }
}

export function createSection(fromCh: number, toCh: number): GuideWallSection {
  return {
    id: newId(),
    fromCh,
    toCh,
    sideMode: 'mirror',
    left: defaultWallParams(),
    right: defaultWallParams(),
    gap: 6,
    baseWidth: 10,
    baseThickness: 0.5
  }
}

export function defaultGuideWallData(): GuideWallData {
  return {
    configured: false,
    source: 'map',
    alignment: [],
    lengthM: 0,
    sectionMode: 'continuous',
    intervalM: 25,
    breaks: [],
    sections: [],
    wallMaterial: { code: GUIDE_WALL_DEFAULT_WALL_CODE },
    baseMaterial: { code: GUIDE_WALL_DEFAULT_BASE_CODE },
    excavationMaterial: null,
    excavationRows: [],
    materialItems: []
  }
}

/** Effective wall/base code for a section: its own override, else the default. */
export function effectiveWallRef(data: GuideWallData, section: GuideWallSection): GuideWallMaterialRef {
  return section.wallMaterial ?? data.wallMaterial
}

export function effectiveBaseRef(data: GuideWallData, section: GuideWallSection): GuideWallMaterialRef {
  return section.baseMaterial ?? data.baseMaterial
}

export function hasLeftWall(section: GuideWallSection): boolean {
  return section.sideMode !== 'right'
}

export function hasRightWall(section: GuideWallSection): boolean {
  return section.sideMode !== 'left'
}

// ---------------------------------------------------------------------------
// Alignment geometry. Equirectangular metres are accurate well below 0.1% at
// guide-wall scales (a few km), which is beyond survey accuracy here.
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 111320

interface XY {
  x: number
  y: number
}

function toXY(p: GuideWallPoint, refLat: number): XY {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180)
  return { x: p.lng * mPerDegLng, y: p.lat * M_PER_DEG_LAT }
}

function toLatLng(xy: XY, refLat: number): GuideWallPoint {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180)
  return { lat: xy.y / M_PER_DEG_LAT, lng: xy.x / mPerDegLng }
}

export function polylineLengthM(points: GuideWallPoint[]): number {
  if (points.length < 2) return 0
  const refLat = points[0].lat
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = toXY(points[i - 1], refLat)
    const b = toXY(points[i], refLat)
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/** Point on the alignment at chainage `ch` metres from the drawn start. */
export function pointAtChainage(points: GuideWallPoint[], ch: number): GuideWallPoint | null {
  if (points.length < 2) return null
  const refLat = points[0].lat
  let remaining = Math.max(0, ch)
  for (let i = 1; i < points.length; i += 1) {
    const a = toXY(points[i - 1], refLat)
    const b = toXY(points[i], refLat)
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg)
      return toLatLng({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, refLat)
    }
    remaining -= seg
  }
  return points[points.length - 1]
}

/** Unit direction of the alignment at chainage `ch` (for perpendicular ticks). */
function directionAtChainage(points: GuideWallPoint[], ch: number): XY | null {
  if (points.length < 2) return null
  const refLat = points[0].lat
  let remaining = Math.max(0, ch)
  for (let i = 1; i < points.length; i += 1) {
    const a = toXY(points[i - 1], refLat)
    const b = toXY(points[i], refLat)
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if ((remaining <= seg && seg > 0) || i === points.length - 1) {
      if (seg === 0) return null
      return { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg }
    }
    remaining -= seg
  }
  return null
}

/** Bearing at `ch` in degrees clockwise from north (for rotating arrow icons). */
export function bearingAtChainage(points: GuideWallPoint[], ch: number): number | null {
  const dir = directionAtChainage(points, ch)
  if (!dir) return null
  return (Math.atan2(dir.x, dir.y) * 180) / Math.PI
}

/** Short line crossing the alignment at `ch`, `halfWidthM` to each side. */
export function perpendicularTick(
  points: GuideWallPoint[],
  ch: number,
  halfWidthM: number
): [GuideWallPoint, GuideWallPoint] | null {
  const at = pointAtChainage(points, ch)
  const dir = directionAtChainage(points, ch)
  if (!at || !dir) return null
  const refLat = points[0].lat
  const c = toXY(at, refLat)
  const n = { x: -dir.y, y: dir.x }
  return [
    toLatLng({ x: c.x + n.x * halfWidthM, y: c.y + n.y * halfWidthM }, refLat),
    toLatLng({ x: c.x - n.x * halfWidthM, y: c.y - n.y * halfWidthM }, refLat)
  ]
}

/** Vertices of the alignment between two chainages (for the highlight overlay). */
export function sublineBetween(
  points: GuideWallPoint[],
  fromCh: number,
  toCh: number
): GuideWallPoint[] {
  if (points.length < 2 || toCh <= fromCh) return []
  const refLat = points[0].lat
  const out: GuideWallPoint[] = []
  const start = pointAtChainage(points, fromCh)
  if (start) out.push(start)
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = toXY(points[i - 1], refLat)
    const b = toXY(points[i], refLat)
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    const vertexCh = walked + seg
    if (vertexCh > fromCh && vertexCh < toCh) out.push(points[i])
    walked = vertexCh
    if (walked >= toCh) break
  }
  const end = pointAtChainage(points, toCh)
  if (end) out.push(end)
  return out
}

/** Chainage of the closest point on the alignment to a clicked map point. */
export function chainageAtPoint(points: GuideWallPoint[], click: GuideWallPoint): number | null {
  if (points.length < 2) return null
  const refLat = points[0].lat
  const p = toXY(click, refLat)
  let best: { dist: number; ch: number } | null = null
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = toXY(points[i - 1], refLat)
    const b = toXY(points[i], refLat)
    const abx = b.x - a.x
    const aby = b.y - a.y
    const seg = Math.hypot(abx, aby)
    if (seg > 0) {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (seg * seg)))
      const qx = a.x + abx * t
      const qy = a.y + aby * t
      const dist = Math.hypot(p.x - qx, p.y - qy)
      if (!best || dist < best.dist) best = { dist, ch: walked + seg * t }
    }
    walked += seg
  }
  return best ? best.ch : null
}

// ---------------------------------------------------------------------------
// Section boundaries and materialization.
// ---------------------------------------------------------------------------

/** All section boundaries including 0 and the total length, sorted. */
export function sectionBoundaries(data: GuideWallData): number[] {
  const length = data.lengthM
  if (length <= 0) return []
  const out: number[] = [0]
  if (data.sectionMode === 'continuous' && data.intervalM > 0) {
    for (let ch = data.intervalM; ch < length - 1e-6; ch += data.intervalM) out.push(round3(ch))
  } else {
    for (const ch of [...data.breaks].sort((a, b) => a - b)) {
      if (ch > 1e-6 && ch < length - 1e-6) out.push(round3(ch))
    }
  }
  out.push(round3(length))
  return out
}

/**
 * Build the section list from the current boundaries, carrying over the
 * dimensions of any previous section that covered each new section's midpoint.
 * Called when setup finishes or length/interval/breaks change.
 */
export function materializeSections(
  data: GuideWallData,
  previous: GuideWallSection[]
): GuideWallSection[] {
  const bounds = sectionBoundaries(data)
  const out: GuideWallSection[] = []
  for (let i = 1; i < bounds.length; i += 1) {
    const fromCh = bounds[i - 1]
    const toCh = bounds[i]
    const mid = (fromCh + toCh) / 2
    const source = previous.find((s) => mid >= s.fromCh && mid < s.toCh)
    out.push(
      source
        ? {
            ...source,
            id: newId(),
            fromCh,
            toCh,
            left: { ...source.left },
            right: { ...source.right }
          }
        : createSection(fromCh, toCh)
    )
  }
  return out
}

/** Copy every dimension (not the chainage range) from one section onto another. */
export function copySectionDimensions(
  target: GuideWallSection,
  source: GuideWallSection
): GuideWallSection {
  return {
    ...target,
    sideMode: source.sideMode,
    left: { ...source.left },
    right: { ...source.right },
    gap: source.gap,
    baseWidth: source.baseWidth,
    baseThickness: source.baseThickness
  }
}

// ---------------------------------------------------------------------------
// Quantities. Rows run in chainage order; a mirrored section is one row × 2.
// ---------------------------------------------------------------------------

export interface GuideWallQtyRow {
  fromCh: number
  toCh: number
  /** 'Left', 'Right', 'Left + Right' (mirror ×2), or 'Base'. */
  side: string
  lengthM: number
  formula: string
  qty: number
  /** Effective material code for this row (default or section override). */
  code: string
  /** Section this row measures, so the table can retarget its code. */
  sectionId: string
}

const f2 = (n: number): string => n.toFixed(2)

export function wallBottomWidth(p: GuideWallWallParams): number {
  return p.topWidth + p.height * p.faceSlope
}

function wallFormula(p: GuideWallWallParams, len: number, doubled: boolean): {
  formula: string
  qty: number
} {
  const bottom = wallBottomWidth(p)
  const area = ((p.topWidth + bottom) / 2) * p.height
  return {
    formula: `((${f2(p.topWidth)}+${f2(bottom)})/2 × ${f2(p.height)}) × ${f2(len)}${doubled ? ' × 2' : ''}`,
    qty: area * len * (doubled ? 2 : 1)
  }
}

/** Wall concrete: trapezium area × length, in chainage order, tagged by code. */
export function wallQuantityRows(data: GuideWallData): GuideWallQtyRow[] {
  const out: GuideWallQtyRow[] = []
  for (const section of data.sections) {
    const len = section.toCh - section.fromCh
    if (len <= 1e-6) continue
    const code = effectiveWallRef(data, section).code
    const push = (side: string, params: GuideWallWallParams, doubled: boolean): void => {
      const { formula, qty } = wallFormula(params, len, doubled)
      out.push({
        fromCh: section.fromCh,
        toCh: section.toCh,
        side,
        lengthM: round3(len),
        formula,
        qty: round3(qty),
        code,
        sectionId: section.id
      })
    }
    if (section.sideMode === 'mirror') push('Left + Right', section.left, true)
    else if (section.sideMode === 'left') push('Left', section.left, false)
    else if (section.sideMode === 'right') push('Right', section.right, false)
    else {
      push('Left', section.left, false)
      push('Right', section.right, false)
    }
  }
  return out
}

/** Base slab concrete: one rectangle per section, width × thickness × length. */
export function baseQuantityRows(data: GuideWallData): GuideWallQtyRow[] {
  const out: GuideWallQtyRow[] = []
  for (const section of data.sections) {
    const len = section.toCh - section.fromCh
    if (len <= 1e-6) continue
    out.push({
      fromCh: section.fromCh,
      toCh: section.toCh,
      side: 'Base',
      lengthM: round3(len),
      formula: `${f2(section.baseWidth)} × ${f2(section.baseThickness)} × ${f2(len)}`,
      qty: round3(section.baseWidth * section.baseThickness * len),
      code: effectiveBaseRef(data, section).code,
      sectionId: section.id
    })
  }
  return out
}

export function quantityRowsTotal(rows: GuideWallQtyRow[]): number {
  return round3(rows.reduce((sum, row) => sum + row.qty, 0))
}

// ---------------------------------------------------------------------------
// Grouping by code. When sections use different codes, each code becomes its
// own measurement table, print block, and abstract item.
// ---------------------------------------------------------------------------

export interface GuideWallMaterialGroup {
  role: 'wall' | 'base'
  ref: GuideWallMaterialRef
  rows: GuideWallQtyRow[]
  total: number
}

function groupRowsByCode(
  role: 'wall' | 'base',
  rows: GuideWallQtyRow[],
  refForCode: (code: string) => GuideWallMaterialRef
): GuideWallMaterialGroup[] {
  const order: string[] = []
  const byCode = new Map<string, GuideWallQtyRow[]>()
  for (const row of rows) {
    if (!byCode.has(row.code)) {
      byCode.set(row.code, [])
      order.push(row.code)
    }
    byCode.get(row.code)!.push(row)
  }
  return order.map((code) => {
    const groupRows = byCode.get(code)!
    return { role, ref: refForCode(code), rows: groupRows, total: quantityRowsTotal(groupRows) }
  })
}

/** Ref carrying a code's metadata: prefer a section override, else the default. */
function refForWallCode(data: GuideWallData, code: string): GuideWallMaterialRef {
  if (data.wallMaterial.code === code) return data.wallMaterial
  for (const s of data.sections) if (s.wallMaterial?.code === code) return s.wallMaterial
  return { code }
}

function refForBaseCode(data: GuideWallData, code: string): GuideWallMaterialRef {
  if (data.baseMaterial.code === code) return data.baseMaterial
  for (const s of data.sections) if (s.baseMaterial?.code === code) return s.baseMaterial
  return { code }
}

export function wallMaterialGroups(data: GuideWallData): GuideWallMaterialGroup[] {
  return groupRowsByCode('wall', wallQuantityRows(data), (code) => refForWallCode(data, code))
}

export function baseMaterialGroups(data: GuideWallData): GuideWallMaterialGroup[] {
  return groupRowsByCode('base', baseQuantityRows(data), (code) => refForBaseCode(data, code))
}

/** Effective length: derived from the chainage span when both are given. */
export function excavationRowLength(row: GuideWallExcavationRow): number | null {
  if (row.fromCh != null && row.toCh != null && row.toCh > row.fromCh) {
    return round3(row.toCh - row.fromCh)
  }
  return row.length
}

export function excavationRowTotal(row: GuideWallExcavationRow): number | null {
  const length = excavationRowLength(row)
  const { breadth, height } = row
  if (length == null || breadth == null || height == null) return null
  return round3(length * breadth * height)
}

export function excavationGrandTotal(rows: GuideWallExcavationRow[]): number {
  return round3(rows.reduce((sum, row) => sum + (excavationRowTotal(row) ?? 0), 0))
}

export interface ChainageRange {
  fromCh: number
  toCh: number
}

/** Chainage stretches not yet covered by any excavation row. */
export function excavationGaps(rows: GuideWallExcavationRow[], lengthM: number): ChainageRange[] {
  if (lengthM <= 0) return []
  const covered = rows
    .filter((r) => r.fromCh != null && r.toCh != null && r.toCh > r.fromCh)
    .map((r) => ({ fromCh: Math.max(0, r.fromCh as number), toCh: Math.min(lengthM, r.toCh as number) }))
    .sort((a, b) => a.fromCh - b.fromCh)
  const gaps: ChainageRange[] = []
  let cursor = 0
  for (const range of covered) {
    if (range.fromCh > cursor + 0.01) gaps.push({ fromCh: cursor, toCh: range.fromCh })
    cursor = Math.max(cursor, range.toCh)
  }
  if (cursor < lengthM - 0.01) gaps.push({ fromCh: round3(cursor), toCh: round3(lengthM) })
  return gaps
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function formatChainage(ch: number): string {
  return Number.isInteger(ch) ? String(ch) : ch.toFixed(1)
}

export function chainageRangeLabel(range: ChainageRange): string {
  return `${formatChainage(range.fromCh)}–${formatChainage(range.toCh)}`
}

export function sideModeLabel(mode: GuideWallSideMode): string {
  if (mode === 'mirror') return 'Both · mirrored'
  if (mode === 'both') return 'Both · independent'
  return mode === 'left' ? 'Left only' : 'Right only'
}

// ---------------------------------------------------------------------------
// Migration from the earlier reach-based shape (pre per-section editing).
// Older saved projects carry `reaches` and side extents; rebuild sections.
// ---------------------------------------------------------------------------

interface LegacyReach {
  fromCh: number
  toCh: number
  mirror?: boolean
  left?: Partial<GuideWallWallParams> & { baseWidth?: number; baseThickness?: number }
}

interface LegacyLink {
  code: string
  itemNodeId?: string
}

export function migrateGuideWallData(raw: GuideWallData): GuideWallData {
  let data = raw
  if (!Array.isArray(raw.sections)) {
    const legacy = raw as GuideWallData & { reaches?: LegacyReach[] }
    const base: GuideWallData = { ...raw, sections: [] }
    const reaches = legacy.reaches ?? []
    base.sections = materializeSections(base, []).map((section) => {
      const mid = (section.fromCh + section.toCh) / 2
      const reach = reaches.find((r) => mid >= r.fromCh && mid < r.toCh)
      if (!reach?.left) return section
      return {
        ...section,
        left: {
          topWidth: reach.left.topWidth ?? section.left.topWidth,
          height: reach.left.height ?? section.left.height,
          faceSlope: reach.left.faceSlope ?? section.left.faceSlope
        },
        right: {
          topWidth: reach.left.topWidth ?? section.right.topWidth,
          height: reach.left.height ?? section.right.height,
          faceSlope: reach.left.faceSlope ?? section.right.faceSlope
        },
        baseWidth: reach.left.baseWidth ?? section.baseWidth,
        baseThickness: reach.left.baseThickness ?? section.baseThickness
      }
    })
    data = base
  }
  // Backfill the (role, code) → item registry from the earlier single-item links.
  if (!Array.isArray(data.materialItems)) {
    const items: GuideWallMaterialItem[] = []
    const add = (link: LegacyLink | null | undefined, role: GuideWallMaterialItem['role']): void => {
      if (link?.itemNodeId) items.push({ role, code: link.code, itemNodeId: link.itemNodeId })
    }
    add(data.wallMaterial as LegacyLink, 'wall')
    add(data.baseMaterial as LegacyLink, 'base')
    add(data.excavationMaterial as LegacyLink | null, 'excavation')
    data = { ...data, materialItems: items }
  }
  return data
}

// ---------------------------------------------------------------------------
// Item sync. One generated item per distinct (role, code) in use; each carries
// its grand-total quantity via `computedQuantity` (no spreadsheet). The DATA/
// rate resolves from the item code, so totals, seigniorage, and prints work.
// ---------------------------------------------------------------------------

interface RequiredItem {
  role: GuideWallMaterialItem['role']
  ref: GuideWallMaterialRef
  quantity: number
}

function requiredItems(data: GuideWallData): RequiredItem[] {
  const out: RequiredItem[] = []
  for (const group of wallMaterialGroups(data)) {
    out.push({ role: 'wall', ref: group.ref, quantity: group.total })
  }
  for (const group of baseMaterialGroups(data)) {
    out.push({ role: 'base', ref: group.ref, quantity: group.total })
  }
  if (data.excavationMaterial) {
    out.push({
      role: 'excavation',
      ref: data.excavationMaterial,
      quantity: excavationGrandTotal(data.excavationRows)
    })
  }
  return out
}

/** Create/update/remove the component's generated items to match the codes in use. */
export function syncGuideWallItems(root: ProjectNode, componentId: string): ProjectNode {
  const component = findNode(root, componentId)
  const data = component?.guideWall
  if (!component || !data) return root

  const required = requiredItems(data)
  const registry = data.materialItems ?? []
  const keyOf = (role: string, code: string): string => `${role}::${code}`

  let next = root
  const nextRegistry: GuideWallMaterialItem[] = []
  const usedKeys = new Set<string>()

  for (const req of required) {
    const key = keyOf(req.role, req.ref.code)
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    const patch = {
      name: req.ref.code,
      itemSource: req.ref.side,
      itemCode: req.ref.code,
      itemDescription: req.ref.description,
      itemEditorType: 'spreadsheet' as const,
      unit: req.ref.unit,
      categoryKey: req.ref.categoryKey,
      dataVariant: req.ref.dataVariant,
      computedQuantity: req.quantity,
      spreadsheet: undefined,
      finalCell: undefined,
      templateGenerated: true,
      templateOwnerId: componentId,
      templateItemRole: req.role
    }
    const existing = registry.find((m) => m.role === req.role && m.code === req.ref.code)
    if (existing && findNode(next, existing.itemNodeId)) {
      next = patchNode(next, existing.itemNodeId, patch)
      nextRegistry.push(existing)
    } else {
      const item = createNode('item', req.ref.code, patch)
      next = addChildAt(next, componentId, item)
      nextRegistry.push({ role: req.role, code: req.ref.code, itemNodeId: item.id })
    }
  }

  // Remove items for (role, code) combinations no longer used.
  for (const entry of registry) {
    if (!usedKeys.has(keyOf(entry.role, entry.code)) && findNode(next, entry.itemNodeId)) {
      next = removeNode(next, entry.itemNodeId)
    }
  }

  return patchNode(next, componentId, {
    guideWall: { ...data, materialItems: nextRegistry }
  })
}

/** addChild that keeps generated items grouped after any manual items. */
function addChildAt(root: ProjectNode, parentId: string, child: ProjectNode): ProjectNode {
  const parent = findNode(root, parentId)
  if (!parent) return root
  return patchNode(root, parentId, { children: [...parent.children, child] })
}
