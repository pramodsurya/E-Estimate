import type {
  MiSluiceMaterialItem,
  MiSluiceMaterialRole,
  MiSluiceNewData,
  ProjectNode,
  TemplateMaterialRef
} from '../types/project'
import { createNode, findNode, patchNode, removeNode } from './tree'

export const MI_SLUICE_SOURCE_URLS = {
  karnatakaManual:
    'https://minorirrigation.karnataka.gov.in/storage/pdf-files/Manuals/MIirrigationmanual.pdf',
  rehabilitationGuideline:
    'https://itigalgamuwa.lk/wp-content/uploads/2021/12/Rehabilitation-Guideline-for-Headworks-of-Minor-Irrigation-Final-2020-December-22.pdf'
} as const

export const MI_SLUICE_DEFAULT_CODES: Record<MiSluiceMaterialRole, string> = {
  excavation: 'IRR-CCDW-1-2',
  pcc: 'IRR-CCDW-2-5',
  rcc: 'IRR-CCDW-2-9',
  reinforcement: 'IRR-CCDW-2-1',
  embedded: 'IRR-GAW-2-13',
  gate: 'IRR-GAW-2-14',
  hoist: 'IRR-GAW-2-12',
  'embedded-paint': 'IRR-GAW-4-1',
  'gate-paint': 'IRR-GAW-4-2',
  'hoist-paint': 'IRR-GAW-3-2'
}

const DETAIL_SUFFIX = '::misluicenewdetail'

export function miSluiceNewDetailId(componentId: string): string {
  return componentId + DETAIL_SUFFIX
}

export function parseMiSluiceNewDetailId(id: string | null | undefined): string | null {
  return id && id.endsWith(DETAIL_SUFFIX) ? id.slice(0, -DETAIL_SUFFIX.length) : null
}

function bareMaterials(): MiSluiceNewData['materials'] {
  return Object.fromEntries(
    Object.entries(MI_SLUICE_DEFAULT_CODES).map(([role, code]) => [role, { code }])
  ) as MiSluiceNewData['materials']
}

export function defaultMiSluiceNewData(): MiSluiceNewData {
  return {
    configured: false,
    intakeType: 'headwall',
    openingShape: 'rectangular',
    vents: 1,
    levels: {
      sill: 100,
      minimumOperating: 101.5,
      ftl: 104.3,
      mwl: 105,
      tbl: 106.5
    },
    hydraulic: {
      designDischarge: 1,
      dischargeCoefficient: 0.6,
      minimumCrownCover: 0.3
    },
    opening: { width: 1.2, height: 1.2, diameter: 1.2 },
    barrel: { length: 18, outerWidth: 2.4, outerHeight: 2.4 },
    excavation: { length: 24, width: 6, depth: 4 },
    pcc: { length: 22, width: 4, thickness: 0.15 },
    intake: { length: 5.7, averageThickness: 2.4, height: 5.1 },
    downstreamHeadwall: { length: 4, averageThickness: 1, height: 3 },
    wingWalls: { count: 2, length: 10, averageThickness: 0.8, averageHeight: 3.5 },
    returnWalls: { count: 2, length: 2, averageThickness: 0.5, averageHeight: 1.5 },
    cutoffWalls: { count: 3, width: 4, thickness: 0.3, depth: 2 },
    stillingBasin: {
      length: 6,
      width: 3,
      slabThickness: 0.3,
      sideWallCount: 2,
      sideWallThickness: 0.3,
      sideWallHeight: 1.2
    },
    reinforcementKgPerCum: 31.4,
    mechanical: {
      embeddedTonnes: 0,
      gateTonnes: 0,
      hoistTonnes: 0,
      embeddedPaintSqm: 0,
      gatePaintSqm: 0,
      hoistPaintSqm: 0
    },
    materials: bareMaterials(),
    materialItems: []
  }
}

function objectOr<T extends object>(value: T | null | undefined, fallback: T): T {
  return value && typeof value === 'object' ? { ...fallback, ...value } : fallback
}

/** Backfill new fields without discarding geometry saved by earlier builds. */
export function migrateMiSluiceNewData(raw: MiSluiceNewData): MiSluiceNewData {
  const defaults = defaultMiSluiceNewData()
  const materials = { ...defaults.materials, ...(raw.materials ?? {}) }
  return {
    ...defaults,
    ...raw,
    levels: objectOr(raw.levels, defaults.levels),
    hydraulic: objectOr(raw.hydraulic, defaults.hydraulic),
    opening: objectOr(raw.opening, defaults.opening),
    barrel: objectOr(raw.barrel, defaults.barrel),
    excavation: objectOr(raw.excavation, defaults.excavation),
    pcc: objectOr(raw.pcc, defaults.pcc),
    intake: objectOr(raw.intake, defaults.intake),
    downstreamHeadwall: objectOr(raw.downstreamHeadwall, defaults.downstreamHeadwall),
    wingWalls: objectOr(raw.wingWalls, defaults.wingWalls),
    returnWalls: objectOr(raw.returnWalls, defaults.returnWalls),
    cutoffWalls: objectOr(raw.cutoffWalls, defaults.cutoffWalls),
    stillingBasin: objectOr(raw.stillingBasin, defaults.stillingBasin),
    mechanical: objectOr(raw.mechanical, defaults.mechanical),
    materials,
    materialItems: Array.isArray(raw.materialItems) ? raw.materialItems : []
  }
}

function nn(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

export interface MiSluiceQuantityRow {
  role: MiSluiceMaterialRole
  label: string
  formula: string
  quantity: number
  unit: 'CUM' | 'KG' | 'TONNE' | 'SQM'
}

export function openingArea(data: MiSluiceNewData): number {
  const vents = Math.max(1, Math.round(nn(data.vents)))
  const one =
    data.openingShape === 'circular'
      ? (Math.PI * nn(data.opening.diameter) ** 2) / 4
      : nn(data.opening.width) * nn(data.opening.height)
  return round3(vents * one)
}

/** Clear height of one vent — the diameter when the opening is circular. */
export function openingHeight(data: MiSluiceNewData): number {
  return data.openingShape === 'circular' ? nn(data.opening.diameter) : nn(data.opening.height)
}

/** Clear width of one vent, for the drawing and the opening description. */
export function openingWidth(data: MiSluiceNewData): number {
  return data.openingShape === 'circular' ? nn(data.opening.diameter) : nn(data.opening.width)
}

export function openingLabel(data: MiSluiceNewData): string {
  const vents = Math.max(1, Math.round(nn(data.vents)))
  const prefix = vents > 1 ? `${vents} × ` : ''
  return data.openingShape === 'circular'
    ? `${prefix}⌀ ${nn(data.opening.diameter).toFixed(2)} m`
    : `${prefix}${nn(data.opening.width).toFixed(2)} × ${nn(data.opening.height).toFixed(2)} m`
}

export function openingCrownLevel(data: MiSluiceNewData): number {
  return data.levels.sill + openingHeight(data)
}

export function openingCentreLevel(data: MiSluiceNewData): number {
  return data.levels.sill + (openingCrownLevel(data) - data.levels.sill) / 2
}

export function hydraulicCapacity(data: MiSluiceNewData): number {
  const head = Math.max(0, data.levels.minimumOperating - openingCentreLevel(data))
  return round3(nn(data.hydraulic.dischargeCoefficient) * openingArea(data) * Math.sqrt(2 * 9.81 * head))
}

export function crownCover(data: MiSluiceNewData): number {
  return round3(data.levels.minimumOperating - openingCrownLevel(data))
}

function row(
  role: MiSluiceMaterialRole,
  label: string,
  formula: string,
  quantity: number,
  unit: MiSluiceQuantityRow['unit']
): MiSluiceQuantityRow {
  return { role, label, formula, quantity: round3(Math.max(0, quantity)), unit }
}

/** Auditable quantity rows matching the civil/mechanical split in the sample estimate. */
export function miSluiceQuantityRows(data: MiSluiceNewData): MiSluiceQuantityRow[] {
  const opening = openingArea(data)
  const barrelGross = nn(data.barrel.length) * nn(data.barrel.outerWidth) * nn(data.barrel.outerHeight)
  const barrelVoid = nn(data.barrel.length) * opening
  const barrelNet = Math.max(0, barrelGross - barrelVoid)
  const intake = nn(data.intake.length) * nn(data.intake.averageThickness) * nn(data.intake.height)
  const downstream =
    nn(data.downstreamHeadwall.length) *
    nn(data.downstreamHeadwall.averageThickness) *
    nn(data.downstreamHeadwall.height)
  const wings =
    nn(data.wingWalls.count) *
    nn(data.wingWalls.length) *
    nn(data.wingWalls.averageThickness) *
    nn(data.wingWalls.averageHeight)
  const returns =
    nn(data.returnWalls.count) *
    nn(data.returnWalls.length) *
    nn(data.returnWalls.averageThickness) *
    nn(data.returnWalls.averageHeight)
  const cutoffs =
    nn(data.cutoffWalls.count) *
    nn(data.cutoffWalls.width) *
    nn(data.cutoffWalls.thickness) *
    nn(data.cutoffWalls.depth)
  const stillingSlab =
    nn(data.stillingBasin.length) *
    nn(data.stillingBasin.width) *
    nn(data.stillingBasin.slabThickness)
  const stillingWalls =
    nn(data.stillingBasin.sideWallCount) *
    nn(data.stillingBasin.length) *
    nn(data.stillingBasin.sideWallThickness) *
    nn(data.stillingBasin.sideWallHeight)
  const rccTotal = barrelNet + intake + downstream + wings + returns + cutoffs + stillingSlab + stillingWalls

  return [
    row(
      'excavation',
      'Excavation for sluice structure',
      `${data.excavation.length} × ${data.excavation.width} × ${data.excavation.depth}`,
      nn(data.excavation.length) * nn(data.excavation.width) * nn(data.excavation.depth),
      'CUM'
    ),
    row(
      'pcc',
      'M10 levelling / foundation concrete',
      `${data.pcc.length} × ${data.pcc.width} × ${data.pcc.thickness}`,
      nn(data.pcc.length) * nn(data.pcc.width) * nn(data.pcc.thickness),
      'CUM'
    ),
    row(
      'rcc',
      'Barrel concrete less clear vent',
      `${data.barrel.length} × (${data.barrel.outerWidth} × ${data.barrel.outerHeight} − ${opening.toFixed(3)})`,
      barrelNet,
      'CUM'
    ),
    row(
      'rcc',
      `${data.intakeType === 'tower' ? 'Intake tower' : 'Upstream headwall'} concrete`,
      `${data.intake.length} × ${data.intake.averageThickness} × ${data.intake.height}`,
      intake,
      'CUM'
    ),
    row(
      'rcc',
      'Downstream headwall concrete',
      `${data.downstreamHeadwall.length} × ${data.downstreamHeadwall.averageThickness} × ${data.downstreamHeadwall.height}`,
      downstream,
      'CUM'
    ),
    row(
      'rcc',
      'Wing walls concrete',
      `${data.wingWalls.count} × ${data.wingWalls.length} × ${data.wingWalls.averageThickness} × ${data.wingWalls.averageHeight}`,
      wings,
      'CUM'
    ),
    row(
      'rcc',
      'Return walls concrete',
      `${data.returnWalls.count} × ${data.returnWalls.length} × ${data.returnWalls.averageThickness} × ${data.returnWalls.averageHeight}`,
      returns,
      'CUM'
    ),
    row(
      'rcc',
      'Cut-off walls / collars concrete',
      `${data.cutoffWalls.count} × ${data.cutoffWalls.width} × ${data.cutoffWalls.thickness} × ${data.cutoffWalls.depth}`,
      cutoffs,
      'CUM'
    ),
    row(
      'rcc',
      'Stilling basin slab and side walls',
      `${data.stillingBasin.length} × ${data.stillingBasin.width} × ${data.stillingBasin.slabThickness} + ${data.stillingBasin.sideWallCount} × ${data.stillingBasin.length} × ${data.stillingBasin.sideWallThickness} × ${data.stillingBasin.sideWallHeight}`,
      stillingSlab + stillingWalls,
      'CUM'
    ),
    row(
      'reinforcement',
      'Nominal reinforcement for structural concrete',
      `${round3(rccTotal)} CUM × ${data.reinforcementKgPerCum} kg/CUM`,
      rccTotal * nn(data.reinforcementKgPerCum),
      'KG'
    ),
    row('embedded', 'Embedded parts', 'Approved mechanical BOM', nn(data.mechanical.embeddedTonnes), 'TONNE'),
    row('gate', 'Sluice gate', 'Approved mechanical BOM', nn(data.mechanical.gateTonnes), 'TONNE'),
    row('hoist', 'Hoist and hoist bridge', 'Approved mechanical BOM', nn(data.mechanical.hoistTonnes), 'TONNE'),
    row('embedded-paint', 'Painting embedded parts', 'Approved paint schedule', nn(data.mechanical.embeddedPaintSqm), 'SQM'),
    row('gate-paint', 'Painting sluice gate', 'Approved paint schedule', nn(data.mechanical.gatePaintSqm), 'SQM'),
    row('hoist-paint', 'Painting hoist and hoist bridge', 'Approved paint schedule', nn(data.mechanical.hoistPaintSqm), 'SQM')
  ]
}

export function quantityForRole(data: MiSluiceNewData, role: MiSluiceMaterialRole): number {
  return round3(
    miSluiceQuantityRows(data)
      .filter((entry) => entry.role === role)
      .reduce((sum, entry) => sum + entry.quantity, 0)
  )
}

export interface MiSluiceQuantityGroup {
  role: MiSluiceMaterialRole
  label: string
  ref: TemplateMaterialRef | null
  rows: MiSluiceQuantityRow[]
  unit: MiSluiceQuantityRow['unit']
  total: number
}

/**
 * Quantity rows gathered under the SSR item each one is billed to — the shape
 * both the dashboard table and the printed measurement sheets are built from.
 * Roles with nothing to measure (an unused paint line, say) are dropped.
 */
export function miSluiceQuantityGroups(data: MiSluiceNewData): MiSluiceQuantityGroup[] {
  const rows = miSluiceQuantityRows(data)
  return (Object.keys(MI_SLUICE_DEFAULT_CODES) as MiSluiceMaterialRole[])
    .map((role) => {
      const roleRows = rows.filter((entry) => entry.role === role)
      return {
        role,
        label: miSluiceRoleLabel(role),
        ref: data.materials[role],
        rows: roleRows,
        unit: roleRows[0]?.unit ?? 'CUM',
        total: round3(roleRows.reduce((sum, entry) => sum + entry.quantity, 0))
      }
    })
    .filter((group) => group.total > 0)
}

export interface MiSluiceIssue {
  kind: 'error' | 'warning'
  message: string
}

export function miSluiceIssues(data: MiSluiceNewData): MiSluiceIssue[] {
  const issues: MiSluiceIssue[] = []
  if (data.levels.minimumOperating <= openingCentreLevel(data)) {
    issues.push({ kind: 'error', message: 'Minimum operating level must be above the opening centre.' })
  }
  if (crownCover(data) < data.hydraulic.minimumCrownCover) {
    issues.push({
      kind: 'warning',
      message: `Opening crown cover is ${crownCover(data).toFixed(2)} m; adopted minimum is ${data.hydraulic.minimumCrownCover.toFixed(2)} m.`
    })
  }
  if (hydraulicCapacity(data) < nn(data.hydraulic.designDischarge)) {
    issues.push({
      kind: 'error',
      message: `Calculated full-open capacity ${hydraulicCapacity(data).toFixed(3)} m³/s is below the design discharge.`
    })
  }
  if (data.levels.ftl > data.levels.mwl || data.levels.mwl > data.levels.tbl) {
    issues.push({ kind: 'error', message: 'Expected level order is FTL ≤ MWL ≤ TBL.' })
  }
  if (openingArea(data) >= data.barrel.outerWidth * data.barrel.outerHeight) {
    issues.push({ kind: 'error', message: 'Clear opening area must be smaller than the barrel outer section.' })
  }
  if (
    data.mechanical.embeddedTonnes <= 0 ||
    data.mechanical.gateTonnes <= 0 ||
    data.mechanical.hoistTonnes <= 0
  ) {
    issues.push({ kind: 'warning', message: 'Enter approved embedded-parts, gate and hoist BOM weights before issue.' })
  }
  return issues
}

interface RequiredItem {
  role: MiSluiceMaterialRole
  ref: TemplateMaterialRef
  quantity: number
}

function requiredItems(data: MiSluiceNewData): RequiredItem[] {
  return (Object.keys(data.materials) as MiSluiceMaterialRole[])
    .map((role) => ({ role, ref: data.materials[role], quantity: quantityForRole(data, role) }))
    .filter((entry): entry is RequiredItem => Boolean(entry.ref) && entry.quantity > 0)
}

/** Create/update/remove ordinary SSR item children driven by the template. */
export function syncMiSluiceNewItems(root: ProjectNode, componentId: string): ProjectNode {
  const component = findNode(root, componentId)
  const raw = component?.miSluiceNew
  if (!component || !raw) return root
  const data = migrateMiSluiceNewData(raw)
  const required = requiredItems(data)
  const registry = data.materialItems ?? []
  const keyOf = (role: string, code: string): string => `${role}::${code}`
  let next = root
  const nextRegistry: MiSluiceMaterialItem[] = []
  const used = new Set<string>()

  for (const req of required) {
    const key = keyOf(req.role, req.ref.code)
    if (used.has(key)) continue
    used.add(key)
    const patch = {
      name: req.ref.code,
      itemSource: req.ref.side ?? ('SSR' as const),
      itemCode: req.ref.code,
      itemDescription: req.ref.description,
      itemEditorType: 'spreadsheet' as const,
      unit: req.ref.unit,
      categoryKey: req.ref.categoryKey ?? 'ssr_item',
      dataVariant: req.ref.dataVariant,
      computedQuantity: req.quantity,
      spreadsheet: undefined,
      finalCell: undefined,
      templateGenerated: true,
      templateOwnerId: componentId,
      templateItemRole: req.role
    }
    const existing = registry.find((entry) => entry.role === req.role && entry.code === req.ref.code)
    if (existing && findNode(next, existing.itemNodeId)) {
      next = patchNode(next, existing.itemNodeId, patch)
      nextRegistry.push(existing)
    } else {
      const item = createNode('item', req.ref.code, patch)
      const parent = findNode(next, componentId)
      if (parent) next = patchNode(next, componentId, { children: [...parent.children, item] })
      nextRegistry.push({ role: req.role, code: req.ref.code, itemNodeId: item.id })
    }
  }

  for (const entry of registry) {
    if (!used.has(keyOf(entry.role, entry.code)) && findNode(next, entry.itemNodeId)) {
      next = removeNode(next, entry.itemNodeId)
    }
  }

  return patchNode(next, componentId, {
    miSluiceNew: { ...data, materialItems: nextRegistry }
  })
}

export function unresolvedMiSluiceNewMaterialCodes(data: MiSluiceNewData): string[] {
  return Array.from(
    new Set(
      (Object.values(data.materials).filter(Boolean) as TemplateMaterialRef[])
        .filter((ref) => !ref.unit || !ref.description || !ref.categoryKey || !ref.side)
        .map((ref) => ref.code)
    )
  )
}

export interface MiSluiceMasterMetadata {
  code: string
  description: string
  unit: string | null
  category: string
  side: 'SSR' | 'SOR'
  dataVariant?: TemplateMaterialRef['dataVariant']
}

export function applyMiSluiceNewMasterMetadata(
  data: MiSluiceNewData,
  masters: MiSluiceMasterMetadata[]
): MiSluiceNewData {
  const byCode = new Map(masters.map((master) => [master.code, master]))
  const materials = { ...data.materials }
  for (const role of Object.keys(materials) as MiSluiceMaterialRole[]) {
    const ref = materials[role]
    const master = ref ? byCode.get(ref.code) : undefined
    if (!ref || !master) continue
    materials[role] = {
      ...ref,
      description: master.description,
      unit: master.dataVariant?.unit ?? master.unit,
      categoryKey: master.category,
      side: master.side,
      dataVariant: master.dataVariant ?? ref.dataVariant
    }
  }
  return { ...data, materials }
}

export function miSluiceRoleLabel(role: MiSluiceMaterialRole): string {
  const labels: Record<MiSluiceMaterialRole, string> = {
    excavation: 'Excavation',
    pcc: 'M10 concrete',
    rcc: 'Structural concrete',
    reinforcement: 'Reinforcement',
    embedded: 'Embedded parts',
    gate: 'Sluice gate',
    hoist: 'Hoist & bridge',
    'embedded-paint': 'Embedded-parts painting',
    'gate-paint': 'Gate painting',
    'hoist-paint': 'Hoist painting'
  }
  return labels[role]
}
