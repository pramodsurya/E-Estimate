// Canal component template: canal-level design (Chapter 1), chainage
// sections, derived section geometry, and the sync that writes computed
// quantities into ordinary item children (so totals and every print keep
// working). Chapters 2+ (cross-sections, earthwork, LA width, lining) plug
// into syncCanalItems; until then it leaves the tree unchanged.

import type {
  CanalData,
  CanalBankMaterialAllocation,
  CanalBankMaterialSource,
  CanalBankMaterialZone,
  CanalDesign,
  CanalExcavationBand,
  CanalFoundationExcavationReach,
  CanalFoundationFillReach,
  CanalFilterDrainReach,
  CanalFlowDirection,
  CanalItemRole,
  CanalLiningItemKey,
  CanalLiningReach,
  CanalBerm,
  CanalMaterialItem,
  CanalPoint,
  CanalSection,
  GuideWallPoint,
  TemplateMaterialRef,
  ProjectNode
} from '../types/project'
import { createNode, findNode, findParent, newId, patchNode, removeNode } from './tree'
import { chainageAtPoint, polylineLengthM } from './guideWall'

export const CANAL_NEW_HOMOGENEOUS_CODE = 'IRR-CAW-2-7'
export const CANAL_NEW_HEARTING_CODE = 'IRR-CAW-2-2'
export const CANAL_NEW_CASING_CODE = 'IRR-CAW-2-4'
export const CANAL_TRENCH_EXCAVATION_CODE = 'IRR-CAW-1-1'
export const CANAL_REPAIR_FORMATION_CODE = 'IRR-PMW-3-17'
export const CANAL_REPAIR_COMPACTION_CODE = 'IRR-PMW-3-18'
export const CANAL_REPAIR_HEARTING_CODE = 'IRR-PMW-3-8'
export const CANAL_REPAIR_CASING_CODE = 'IRR-PMW-3-9'
export const CANAL_EXC_ALL_SOILS_CODE = 'IRR-CAW-1-1'
export const CANAL_EXC_HDR_CODE = 'IRR-CAW-1-4'
export const CANAL_EXC_FF_CODE = 'IRR-CAW-1-6'
export const CANAL_EXC_HR_CODE = 'IRR-CAW-1-7'
export const CANAL_JUNGLE_CLEARANCE_CODE = 'IRR-PMW-1-2'

export interface CanalBankItemOption {
  code: string
  zone: CanalBankMaterialZone
  source: CanalBankMaterialSource
  compaction: 95 | 98
  watering: boolean
  label: string
}

/** CAW 2–4 bank items presented as engineering choices; codes remain internal. */
export const CANAL_BANK_ITEM_OPTIONS: CanalBankItemOption[] = [
  { code: 'IRR-CAW-2-1', zone: 'hearting', source: 'borrow-area', compaction: 98, watering: true, label: 'Impervious hearting from approved borrow area' },
  { code: 'IRR-CAW-2-2', zone: 'hearting', source: 'borrow-area', compaction: 95, watering: true, label: 'Impervious hearting from approved borrow area' },
  { code: 'IRR-CAW-2-3', zone: 'casing', source: 'borrow-area', compaction: 98, watering: true, label: 'Pervious or semi-pervious casing from approved borrow area' },
  { code: 'IRR-CAW-2-4', zone: 'casing', source: 'borrow-area', compaction: 95, watering: true, label: 'Pervious or semi-pervious casing from approved borrow area' },
  { code: 'IRR-CAW-2-5', zone: 'casing', source: 'borrow-area', compaction: 95, watering: false, label: 'Pervious or semi-pervious casing from approved borrow area' },
  { code: 'IRR-CAW-2-6', zone: 'homogeneous', source: 'borrow-area', compaction: 98, watering: true, label: 'Homogeneous fill from approved borrow area' },
  { code: 'IRR-CAW-2-7', zone: 'homogeneous', source: 'borrow-area', compaction: 95, watering: true, label: 'Homogeneous fill from approved borrow area' },
  { code: 'IRR-CAW-2-8', zone: 'homogeneous', source: 'borrow-area', compaction: 95, watering: false, label: 'Casing embankment with homogeneous soil from approved borrow area (applied to homogeneous bank)' },
  { code: 'IRR-CAW-3-1', zone: 'hearting', source: 'dump-area', compaction: 98, watering: true, label: 'Impervious hearting using approved dump-area soil' },
  { code: 'IRR-CAW-3-2', zone: 'hearting', source: 'dump-area', compaction: 95, watering: true, label: 'Impervious hearting using approved dump-area soil' },
  // In a homogeneous water-retaining bank the whole section performs the
  // impervious role, so the same source-specific placement items apply.
  { code: 'IRR-CAW-3-3', zone: 'homogeneous', source: 'dump-area', compaction: 98, watering: true, label: 'Homogeneous bank or casing fill using suitable approved dump-area soil' },
  { code: 'IRR-CAW-3-4', zone: 'homogeneous', source: 'dump-area', compaction: 95, watering: true, label: 'Homogeneous bank or casing fill using suitable approved dump-area soil' },
  { code: 'IRR-CAW-3-5', zone: 'homogeneous', source: 'dump-area', compaction: 95, watering: false, label: 'Homogeneous bank or casing fill using suitable approved dump-area soil' },
  { code: 'IRR-CAW-3-3', zone: 'casing', source: 'dump-area', compaction: 98, watering: true, label: 'Pervious or semi-pervious casing using approved dump-area soil' },
  { code: 'IRR-CAW-3-4', zone: 'casing', source: 'dump-area', compaction: 95, watering: true, label: 'Pervious or semi-pervious casing using approved dump-area soil' },
  { code: 'IRR-CAW-3-5', zone: 'casing', source: 'dump-area', compaction: 95, watering: false, label: 'Pervious or semi-pervious casing using approved dump-area soil' },
  { code: 'IRR-CAW-4-1', zone: 'hearting', source: 'canal-excavation', compaction: 98, watering: true, label: 'Impervious hearting using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-2', zone: 'hearting', source: 'canal-excavation', compaction: 95, watering: true, label: 'Impervious hearting using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-3', zone: 'homogeneous', source: 'canal-excavation', compaction: 98, watering: true, label: 'Homogeneous bank or casing fill using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-4', zone: 'homogeneous', source: 'canal-excavation', compaction: 95, watering: true, label: 'Homogeneous bank or casing fill using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-5', zone: 'homogeneous', source: 'canal-excavation', compaction: 95, watering: false, label: 'Homogeneous bank or casing fill using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-3', zone: 'casing', source: 'canal-excavation', compaction: 98, watering: true, label: 'Pervious or semi-pervious casing using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-4', zone: 'casing', source: 'canal-excavation', compaction: 95, watering: true, label: 'Pervious or semi-pervious casing using suitable canal-excavation material' },
  { code: 'IRR-CAW-4-5', zone: 'casing', source: 'canal-excavation', compaction: 95, watering: false, label: 'Pervious or semi-pervious casing using suitable canal-excavation material' }
]

export function canalBankItemForAllocation(allocation: CanalBankMaterialAllocation): CanalBankItemOption | null {
  return CANAL_BANK_ITEM_OPTIONS.find((option) =>
    option.zone === allocation.zone &&
    option.source === allocation.source &&
    option.compaction === allocation.compaction &&
    option.watering === allocation.watering
  ) ?? null
}

function defaultCanalBankMaterialAllocations(): CanalBankMaterialAllocation[] {
  return [
    { id: newId(), zone: 'homogeneous', source: 'canal-excavation', percentage: 0, compaction: 95, watering: true },
    { id: newId(), zone: 'homogeneous', source: 'borrow-area', percentage: 100, compaction: 95, watering: true },
    { id: newId(), zone: 'hearting', source: 'borrow-area', percentage: 100, compaction: 95, watering: true },
    { id: newId(), zone: 'casing', source: 'borrow-area', percentage: 100, compaction: 95, watering: true }
  ]
}

// Lining chapter (Chapter 6 new / 5 repair) default SSR codes.
export const CANAL_LINING_CODE = 'IRR-CAW-7-6'
export const CANAL_LINING_MODEL_WALL_CODE = 'IRR-CCDW-2-3'
export const CANAL_LINING_PLUG_CODE = 'IRR-CAW-5-9'
export const CANAL_LINING_MASTIC_JOINT_CODE = 'IRR-CAW-7-37'
export const CANAL_LINING_TARFELT_JOINT_CODE = 'IRR-CAW-7-36'

/** Automatic lining values; a null field on a reach falls back to these. */
export const CANAL_LINING_DEFAULT_THICKNESS_MM = 75
export const CANAL_LINING_DEFAULT_PANEL_M = 3.5
export const CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M = 17.5
export const CANAL_LINING_DEFAULT_STEPS_INTERVAL_M = 300
export const CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM = 40
export const CANAL_LINING_DEFAULT_PLUG_BED_SQM = 100
export const CANAL_LINING_LONGITUDINAL_PANEL_WIDTH_M = 5

/** Cast/creep dimensions of the lining accessories (m), fixed by the sheets. */
export const CANAL_LINING_MODEL_WALL_WIDTH_M = 0.25
export const CANAL_LINING_MODEL_WALL_DEPTH_M = 0.15
export const CANAL_LINING_STEPS_WIDTH_M = 2.1
export const CANAL_LINING_STEPS_DEPTH_M = 0.2
export const CANAL_LINING_SOFFIT_THICKNESS_M = 0.05
export const CANAL_LINING_SLEEPER_WIDTH_M = 0.2
export const CANAL_LINING_SLEEPER_DEPTH_M = 0.15
export const CANAL_LINING_SLEEPER_ROWS = 2

export function defaultCanalExcavationBands(): CanalExcavationBand[] {
  return [
    { id: newId(), label: 'All soils', pct: 100, bankReusePct: 100, material: { code: CANAL_EXC_ALL_SOILS_CODE } },
    { id: newId(), label: 'Hard disintegrated rock', pct: 0, bankReusePct: 0, material: { code: CANAL_EXC_HDR_CODE } },
    { id: newId(), label: 'Fissured and fractured rock', pct: 0, bankReusePct: 0, material: { code: CANAL_EXC_FF_CODE } },
    { id: newId(), label: 'Hard rock', pct: 0, bankReusePct: 0, material: { code: CANAL_EXC_HR_CODE } }
  ]
}

// The "Detailed" tree row under a Canal component is a synthetic selection
// (not a real node): the component id with this suffix. WorkArea detects it
// and shows the canal design dashboard instead of a node editor.
const CANAL_DETAIL_SUFFIX = '::canaldetail'

export function canalDetailId(componentId: string): string {
  return componentId + CANAL_DETAIL_SUFFIX
}

export function parseCanalDetailId(selectedId: string | null): string | null {
  if (!selectedId || !selectedId.endsWith(CANAL_DETAIL_SUFFIX)) return null
  const componentId = selectedId.slice(0, -CANAL_DETAIL_SUFFIX.length)
  return componentId ? componentId : null
}

export function defaultCanalDesign(): CanalDesign {
  return {
    bedLevelAtStart: 0,
    discharge: 2,
    bedWidth: 3,
    fullSupplyDepth: 1.5,
    freeBoard: 0.6,
    bedSlope: 2000,
    sideSlope: 1.5,
    leftBankCrestWidth: 2,
    leftBankOuterSlope: 2,
    rightBankCrestWidth: 2,
    rightBankOuterSlope: 2,
    berms: [],
    serviceRoadReaches: [],
    bankSectionType: 'homogeneous',
    zonedReaches: [],
    heartingLevelOffsetFromFsl: 0,
    minimumHeartingHeight: 2,
    heartingTopWidth: 1,
    heartingLeftSlope: 0.5,
    heartingRightSlope: 0.5,
    heartingTrenchEnabled: false,
    heartingTrenchWidth: 1,
    heartingTrenchLeftSlope: 0.5,
    heartingTrenchRightSlope: 0.5,
    bankMaterialAllocations: defaultCanalBankMaterialAllocations(),
    bankSoil: '',
    heartingSoil: '',
    billBankFormation: true,
    billBankCompaction: true,
    billHearting: true,
    billCasing: true,
    billHeartingTrench: true,
    bankFormationCodeOverride: '',
    bankCompactionCodeOverride: '',
    heartingCodeOverride: '',
    casingCodeOverride: '',
    offtake: ''
  }
}

export function defaultCanalData(): CanalData {
  return {
    configured: false,
    mode: 'new',
    source: 'map',
    alignment: [],
    lengthM: 0,
    flowDirection: null,
    flowInherited: false,
    sectionMode: 'continuous',
    intervalM: 100,
    breaks: [],
    design: defaultCanalDesign(),
    strippingDepth: 0.6,
    foundationExcavationReaches: [],
    foundationFillReaches: [],
    filterDrainReaches: [],
    excavationBands: defaultCanalExcavationBands(),
    trenchExcavationBands: defaultCanalExcavationBands(),
    jungleClearanceMode: 'automatic',
    jungleClearanceMaterial: { code: CANAL_JUNGLE_CLEARANCE_CODE },
    jungleClearanceRows: [],
    laLeftMargin: 3,
    laRightMargin: 3,
    liningReaches: [],
    sections: [],
    materialItems: []
  }
}

function normalizeCanalPoint(value: unknown): CanalPoint | null {
  if (!value || typeof value !== 'object') return null
  const point = value as Partial<CanalPoint>
  if (!Number.isFinite(point.offset) || !Number.isFinite(point.rl)) return null
  return { offset: point.offset as number, rl: point.rl as number }
}

function normalizeCanalSection(value: unknown): CanalSection | null {
  if (!value || typeof value !== 'object') return null
  const section = value as Partial<CanalSection>
  if (typeof section.id !== 'string' || !Number.isFinite(section.chainage)) return null
  const ground = Array.isArray(section.ground)
    ? section.ground.map(normalizeCanalPoint).filter((p): p is CanalPoint => p != null)
    : []
  ground.sort((a, b) => a.offset - b.offset)
  return {
    id: section.id,
    chainage: section.chainage as number,
    isManual: section.isManual === true,
    groundEntryMode: section.groundEntryMode === 'separate' ? 'separate' : 'average',
    leftToeRl: Number.isFinite(section.leftToeRl) ? section.leftToeRl as number : ground[0]?.rl ?? null,
    rightToeRl: Number.isFinite(section.rightToeRl) ? section.rightToeRl as number : ground[ground.length - 1]?.rl ?? null,
    ground,
    designPopulated: section.designPopulated !== false,
    designPointOffsets: Array.isArray(section.designPointOffsets)
      ? section.designPointOffsets.filter((offset): offset is number => Number.isFinite(offset))
      : []
  }
}

/** Forward-compatible loader: old/partial canal state gains fresh defaults. */
export function migrateCanalData(raw: CanalData): CanalData {
  const design = { ...defaultCanalDesign(), ...(raw.design ?? {}) }
  const normalizeBands = (value: unknown): CanalExcavationBand[] => Array.isArray(value)
    ? value.filter((band) => band && typeof band === 'object').map((band, index) => {
        const row = band as Partial<CanalExcavationBand>
        return {
          id: typeof row.id === 'string' ? row.id : newId(),
          label: typeof row.label === 'string' ? row.label : `Other ${index + 1}`,
          pct: Math.min(100, Math.max(0, Number.isFinite(row.pct) ? row.pct as number : 0)),
          bankReusePct: Math.min(100, Math.max(0, Number.isFinite(row.bankReusePct)
            ? row.bankReusePct as number
            : index === 0 ? 100 : 0)),
          material: row.material && typeof row.material === 'object' ? row.material : { code: '' }
        }
      })
    : defaultCanalExcavationBands()
  design.heartingLevelOffsetFromFsl = Math.min(
    Math.max(Number.isFinite(design.heartingLevelOffsetFromFsl) ? design.heartingLevelOffsetFromFsl : 0, -999),
    Math.max(0, design.freeBoard)
  )
  design.minimumHeartingHeight = Math.max(
    0,
    Number.isFinite(design.minimumHeartingHeight) ? design.minimumHeartingHeight : 2
  )
  if (design.bankSectionType === 'homogeneous') design.heartingTrenchEnabled = false
  design.berms = Array.isArray(design.berms)
    ? design.berms.filter((berm) => berm && typeof berm.id === 'string' &&
        ['left-outer', 'left-canal', 'right-canal', 'right-outer'].includes(berm.face) &&
        Number.isFinite(berm.heightAboveBed) && Number.isFinite(berm.width)
      ).map((berm: CanalBerm) => ({
        ...berm,
        heightAboveBed: Math.max(0, berm.heightAboveBed),
        width: Math.max(0, berm.width)
      }))
    : []
  design.serviceRoadReaches = Array.isArray(design.serviceRoadReaches)
    ? design.serviceRoadReaches.filter((reach) => reach && typeof reach.id === 'string' &&
        Number.isFinite(reach.fromChainage) && Number.isFinite(reach.toChainage)
      ).map((reach) => ({
        ...reach,
        fromChainage: Math.min(reach.fromChainage, reach.toChainage),
        toChainage: Math.max(reach.fromChainage, reach.toChainage),
        side: reach.side === 'left' || reach.side === 'right' ? reach.side : 'both',
        heightMode: reach.heightMode === 'manual' ? 'manual' : 'tbl',
        heightAboveBed: Math.max(0, Number.isFinite(reach.heightAboveBed) ? reach.heightAboveBed : canalSectionDepth(design)),
        width: Math.max(0, Number.isFinite(reach.width) ? reach.width : 4),
        shoulderWidth: Math.max(0, Number.isFinite(reach.shoulderWidth) ? reach.shoulderWidth : 0.5),
        constructionType: reach.constructionType === 'traditional-metal' ? 'traditional-metal' : 'earthen',
        hardMetalThickness: Math.max(0, Number.isFinite(reach.hardMetalThickness) ? reach.hardMetalThickness : 0.05),
        hardMetalCode: reach.hardMetalCode === 'RB Road Work 1(i)(b)'
          ? 'RB_WORK_6411571526E0'
          : typeof reach.hardMetalCode === 'string' ? reach.hardMetalCode : 'RB_WORK_6411571526E0',
        blindageCode: typeof reach.blindageCode === 'string' ? reach.blindageCode : 'RB Road Work 8(a) — select/enter catalogue item'
      }))
    : []
  design.zonedReaches = Array.isArray(design.zonedReaches)
    ? design.zonedReaches.filter((reach) =>
        reach != null && typeof reach.id === 'string' &&
        Number.isFinite(reach.fromChainage) && Number.isFinite(reach.toChainage)
      ).map((reach) => ({
        ...reach,
        fromChainage: Math.min(reach.fromChainage, reach.toChainage),
        toChainage: Math.max(reach.fromChainage, reach.toChainage)
      }))
    : []
  design.bankMaterialAllocations = Array.isArray(design.bankMaterialAllocations)
    ? design.bankMaterialAllocations.filter((row) => row && typeof row.id === 'string' &&
        ['homogeneous', 'hearting', 'casing'].includes(row.zone) &&
        ['canal-excavation', 'dump-area', 'borrow-area'].includes(row.source)
      ).map((row) => ({
        ...row,
        percentage: Math.min(100, Math.max(0, Number.isFinite(row.percentage) ? row.percentage : 0)),
        compaction: row.compaction === 98 ? 98 : 95,
        watering: row.watering !== false
      }))
    : defaultCanalBankMaterialAllocations()
  return {
    ...defaultCanalData(),
    ...raw,
    source:
      raw.source === 'manual' || (raw.source as string) === 'skip' ? 'manual' : 'map',
    flowDirection:
      raw.flowDirection === 'start-to-end' || raw.flowDirection === 'end-to-start'
        ? raw.flowDirection
        : null,
    flowInherited: raw.flowInherited === true,
    design,
    strippingDepth: Math.max(0, Number.isFinite(raw.strippingDepth) ? raw.strippingDepth : 0.6),
    foundationExcavationReaches: Array.isArray(raw.foundationExcavationReaches)
      ? raw.foundationExcavationReaches.filter((reach) => reach && typeof reach.id === 'string' && Number.isFinite(reach.fromChainage) && Number.isFinite(reach.toChainage)).map((reach) => {
        const applicableGroundRls = (raw.sections ?? [])
          .filter((section) => section.chainage >= Math.min(reach.fromChainage, reach.toChainage) && section.chainage <= Math.max(reach.fromChainage, reach.toChainage))
          .flatMap((section) => section.ground ?? [])
          .map((point) => point.rl)
          .filter(Number.isFinite)
        const groundRl = applicableGroundRls.length ? Math.min(...applicableGroundRls) : design.bedLevelAtStart
        return {
          id: reach.id,
          fromChainage: Math.min(reach.fromChainage, reach.toChainage),
          toChainage: Math.max(reach.fromChainage, reach.toChainage),
          kind: reach.kind === 'stripping' ? 'stripping' as const : 'foundation' as const,
          foundationRl: Number.isFinite(reach.foundationRl)
            ? reach.foundationRl
            : groundRl - Math.max(0, Number.isFinite((reach as unknown as { depth?: number }).depth) ? ((reach as unknown as { depth?: number }).depth ?? 0.6) : 0.6),
          strippingDepth: Math.max(0, Number.isFinite(reach.strippingDepth) ? reach.strippingDepth : 0.6),
          bands: normalizeBands(reach.bands)
        }
      })
      : [],
    foundationFillReaches: Array.isArray(raw.foundationFillReaches)
      ? raw.foundationFillReaches.filter((reach) => reach && typeof reach.id === 'string').map((reach) => ({
          ...reach,
          workReachId: typeof reach.workReachId === 'string' ? reach.workReachId : reach.id,
          fromChainage: Math.min(reach.fromChainage, reach.toChainage),
          toChainage: Math.max(reach.fromChainage, reach.toChainage),
          percentage: Math.min(100, Math.max(0, Number.isFinite(reach.percentage) ? reach.percentage : 100)),
          foundationDepth: Math.max(0, Number.isFinite(reach.foundationDepth) ? reach.foundationDepth : 0.6),
          thickness: Math.max(0, reach.kind === '5-4' ? 0.25 : Number.isFinite(reach.thickness) ? reach.thickness : 0.25),
          width: Math.max(0, Number.isFinite(reach.width) ? reach.width : design.bedWidth),
          blanketWidthMode: reach.blanketWidthMode === 'manual' ? 'manual' : 'automatic',
          blanketLeftWidth: Math.max(0, Number.isFinite(reach.blanketLeftWidth) ? reach.blanketLeftWidth : (Number.isFinite(reach.width) ? reach.width / 2 : design.bedWidth / 2)),
          blanketRightWidth: Math.max(0, Number.isFinite(reach.blanketRightWidth) ? reach.blanketRightWidth : (Number.isFinite(reach.width) ? reach.width / 2 : design.bedWidth / 2)),
          height: Math.max(0, Number.isFinite(reach.height) ? reach.height : 1),
          side: reach.side === 'left' || reach.side === 'right' || reach.side === 'both' ? reach.side : 'both',
          material: reach.material && typeof reach.material === 'object' ? reach.material : { code: `IRR-CAW-${reach.kind}` }
        })) : [],
    filterDrainReaches: Array.isArray(raw.filterDrainReaches)
      ? raw.filterDrainReaches.filter((reach) => reach && typeof reach.id === 'string').map((reach) => ({
          ...reach,
          fromChainage: Math.min(reach.fromChainage, reach.toChainage),
          toChainage: Math.max(reach.fromChainage, reach.toChainage),
          orientation: reach.orientation === 'cross' || reach.orientation === 'local' ? reach.orientation : 'longitudinal',
          side: ['left', 'right', 'both', 'bed'].includes(reach.side) ? reach.side : 'both',
          width: Math.max(0, Number.isFinite(reach.width) ? reach.width : 0.6),
          depth: Math.max(0, Number.isFinite(reach.depth) ? reach.depth : 0.75),
          thickness: Math.max(0, Number.isFinite(reach.thickness) ? reach.thickness : 0.1),
          spacing: Math.max(0.01, Number.isFinite(reach.spacing) ? reach.spacing : 30),
          count: Math.max(1, Math.round(Number.isFinite(reach.count) ? reach.count : 1)),
          rockToeTopWidth: Math.max(0, typeof reach.rockToeTopWidth === 'number' && Number.isFinite(reach.rockToeTopWidth) ? reach.rockToeTopWidth : 0),
          rockToeInnerSlope: Math.max(0, typeof reach.rockToeInnerSlope === 'number' && Number.isFinite(reach.rockToeInnerSlope) ? reach.rockToeInnerSlope : 1),
          crossDrainLength: Math.max(0, typeof reach.crossDrainLength === 'number' && Number.isFinite(reach.crossDrainLength) ? reach.crossDrainLength : design.bedWidth),
          system: reach.system === 'rock-toe' || reach.system === 'toe-drain' || reach.system === 'bed-drainage' || reach.system === 'porous-plug'
            ? reach.system
            : reach.kind === '5-6' || reach.kind === '5-11'
              ? 'rock-toe'
              : reach.kind === '5-8'
                ? 'bed-drainage'
                : reach.kind === '5-9'
                  ? 'porous-plug'
                  : 'toe-drain',
          coverage: reach.coverage === 'entire' ? 'entire' : 'selected',
          placementMode: reach.placementMode === 'spacing' || reach.placementMode === 'manual' ? reach.placementMode : 'count',
          manualChainages: Array.isArray(reach.manualChainages) ? reach.manualChainages.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b) : [],
          plugLocations: Array.isArray(reach.plugLocations)
            ? reach.plugLocations.filter((value): value is 'bed' | 'left' | 'right' => value === 'bed' || value === 'left' || value === 'right')
            : reach.side === 'both' ? ['left', 'right'] : reach.side === 'bed' ? ['bed'] : [reach.side],
          offsetMode: reach.offsetMode === 'left' || reach.offsetMode === 'right' || reach.offsetMode === 'custom' ? reach.offsetMode : 'centre',
          offset: typeof reach.offset === 'number' && Number.isFinite(reach.offset) ? reach.offset : 0,
          material: reach.material && typeof reach.material === 'object' ? reach.material : { code: `IRR-CAW-${reach.kind}` }
        })) : [],
    excavationBands: normalizeBands(raw.excavationBands),
    trenchExcavationBands: normalizeBands(raw.trenchExcavationBands),
    jungleClearanceMode: raw.jungleClearanceMode === 'manual' ? 'manual' : 'automatic',
    jungleClearanceMaterial: raw.jungleClearanceMaterial && typeof raw.jungleClearanceMaterial === 'object'
      ? raw.jungleClearanceMaterial
      : { code: CANAL_JUNGLE_CLEARANCE_CODE },
    jungleClearanceRows: Array.isArray(raw.jungleClearanceRows)
      ? raw.jungleClearanceRows.filter((row) => row && typeof row === 'object').map((row) => ({
          id: typeof row.id === 'string' ? row.id : newId(),
          length: Number.isFinite(row.length) ? row.length : null,
          breadth: Number.isFinite(row.breadth) ? row.breadth : null
        }))
      : [],
    liningReaches: Array.isArray(raw.liningReaches)
      ? raw.liningReaches
          .filter((reach) =>
            reach != null && typeof reach.id === 'string' &&
            Number.isFinite(reach.fromChainage) && Number.isFinite(reach.toChainage)
          )
          .map((reach) => {
            const fallback = defaultCanalLiningReach(reach.fromChainage, reach.toChainage)
            return {
              ...fallback,
              ...reach,
              fromChainage: Math.min(reach.fromChainage, reach.toChainage),
              toChainage: Math.max(reach.fromChainage, reach.toChainage),
              provide: reach.provide !== false,
              thicknessMm: finiteOrNull(reach.thicknessMm),
              liningFb: finiteOrNull(reach.liningFb),
              copingWidthM: finiteOrNull(reach.copingWidthM),
              panelLengthM: finiteOrNull(reach.panelLengthM),
              modelWallIntervalM: finiteOrNull(reach.modelWallIntervalM),
              stepsIntervalM: finiteOrNull(reach.stepsIntervalM),
              plugSlopeSpacingSqm: finiteOrNull(reach.plugSlopeSpacingSqm),
              plugBedSpacingSqm: finiteOrNull(reach.plugBedSpacingSqm),
              bill: {
                ...fallback.bill,
                ...(reach.bill && typeof reach.bill === 'object' ? reach.bill : {})
              },
              itemOverrides:
                reach.itemOverrides && typeof reach.itemOverrides === 'object' ? reach.itemOverrides : {}
            }
          })
      : [],
    laLeftMargin: Math.max(0, Number.isFinite(raw.laLeftMargin) ? raw.laLeftMargin : 3),
    laRightMargin: Math.max(0, Number.isFinite(raw.laRightMargin) ? raw.laRightMargin : 3),
    sections: Array.isArray(raw.sections)
      ? raw.sections.map(normalizeCanalSection).filter((s): s is CanalSection => s != null)
      : [],
    breaks: Array.isArray(raw.breaks) ? raw.breaks : [],
    alignment: Array.isArray(raw.alignment) ? raw.alignment : [],
    materialItems: Array.isArray(raw.materialItems) ? raw.materialItems : []
  }
}

/** Full section depth D + FB (m). */
export function canalSectionDepth(design: CanalDesign): number {
  return design.fullSupplyDepth + design.freeBoard
}

/** Minimum non-inspection/other bank crest width from IS 10430:2000. */
export function recommendedCanalCrestWidth(discharge: number): number {
  if (discharge <= 1.5) return 1.5
  if (discharge <= 3) return 2
  if (discharge <= 10) return 2.5
  if (discharge < 30) return 4
  return 5
}

/** Top width at bank level: B + 2 * s * (D + FB) (m). */
export function canalTopWidth(design: CanalDesign): number {
  return design.bedWidth + 2 * design.sideSlope * canalSectionDepth(design)
}

/** Wetted perimeter at FSL: B + 2 * D * sqrt(1 + s^2) (m). */
export function canalWettedPerimeter(design: CanalDesign): number {
  return (
    design.bedWidth +
    2 * design.fullSupplyDepth * Math.sqrt(1 + design.sideSlope * design.sideSlope)
  )
}

/**
 * Lining thickness (m) from design discharge (Q is owned by Chapter 1;
 * the Lining chapter consumes it), per the IS 3873 note used in
 * the MNKLIS lining sheets: upto 3 cumecs 225 mm, 3–10 cumecs 350 mm,
 * above 10 cumecs 550 mm.
 */
export function liningThicknessForDischarge(dischargeCumecs: number): number {
  if (!(dischargeCumecs > 0)) return 0.225
  if (dischargeCumecs <= 3) return 0.225
  if (dischargeCumecs <= 10) return 0.35
  return 0.55
}

/**
 * Coping / lug width (m) from design discharge. This is the IS 3873 schedule
 * shown in the MNKLIS lining sheets' "Copping or Lug" column, and it is
 * separate from the lining thickness itself (60/75 mm in those sheets, see
 * CANAL_LINING_DEFAULT_THICKNESS_MM).
 */
export function canalCopingWidthForDischarge(dischargeCumecs: number): number {
  if (!(dischargeCumecs > 3)) return 0.225
  if (dischargeCumecs <= 10) return 0.35
  return 0.55
}

/** Chainages (m) carrying a cross-section: every interval, plus both ends. */
export function canalChainages(data: CanalData): number[] {
  const length = Math.max(0, data.lengthM)
  if (data.sectionMode === 'discontinuous') {
    const set = new Set<number>([0, length])
    for (const b of data.breaks) {
      if (Number.isFinite(b) && b > 0 && b < length) set.add(Math.round(b * 100) / 100)
    }
    return [...set].sort((a, b) => a - b)
  }
  const interval = data.intervalM > 0 ? data.intervalM : length
  const out: number[] = []
  if (length <= 0) return [0]
  for (let ch = 0; ch < length; ch += interval) {
    out.push(Math.round(ch * 100) / 100)
  }
  out.push(length)
  return [...new Set(out)].sort((a, b) => a - b)
}

export function orderedCanalSections(data: CanalData): CanalSection[] {
  return [...data.sections].sort((a, b) => a.chainage - b.chainage)
}

/** Rebuild sections for the current chainages, keeping prior sections by chainage. */
export function materializeCanalSections(
  data: CanalData,
  previous: CanalSection[]
): CanalSection[] {
  if (!(data.lengthM > 0)) return []
  const byChainage = new Map<number, CanalSection>()
  for (const section of previous) byChainage.set(section.chainage, section)
  const generated: CanalSection[] = canalChainages(data).map((chainage) => {
    const kept = byChainage.get(chainage)
    if (kept) return kept
    return { id: newId(), chainage, groundEntryMode: 'average', leftToeRl: null, rightToeRl: null, ground: [], designPopulated: false, designPointOffsets: [] }
  })
  const generatedChainages = new Set(generated.map((section) => section.chainage))
  const manual = previous.filter((section) =>
    section.isManual === true &&
    section.chainage >= 0 &&
    section.chainage <= data.lengthM &&
    !generatedChainages.has(section.chainage)
  )
  return [...generated, ...manual].sort((a, b) => a.chainage - b.chainage)
}

export function newManualCanalSection(chainage: number): CanalSection {
  return {
    id: newId(),
    chainage: Math.round(chainage * 100) / 100,
    isManual: true,
    groundEntryMode: 'average',
    leftToeRl: null,
    rightToeRl: null,
    ground: [],
    designPopulated: false,
    designPointOffsets: []
  }
}

/** Drawn alignment length (m); setup falls back to this when lengthM is unset. */
export function canalDrawnLengthM(alignment: GuideWallPoint[]): number {
  return polylineLengthM(alignment)
}

// ---------------------------------------------------------------------------
// Parent linkage and geometry. A canal sub-component (an offtake, reach,
// lining, bank...) may draw its own line that follows the parent canal
// alignment. When it does, its length is measured from that line and the
// parent's water-flow direction is inherited; when geometry is uncertain the
// user is asked instead of guessing.
// ---------------------------------------------------------------------------

/** How close (m) every drawn vertex must be to the parent line to "follow" it. */
export const CANAL_FOLLOW_TOLERANCE_M = 10

export interface LineFollowResult {
  /** True when the whole line lies within tolerance of the reference alignment. */
  follows: boolean
  /** True when the line runs opposite to the reference's chainage direction. */
  reversed: boolean
  /** Worst vertex-to-reference distance (m); Infinity when nothing to compare. */
  maxDistanceM: number
  /** Parent chainage nearest the line's first point; null without a reference. */
  fromCh: number | null
  /** Parent chainage nearest the line's last point; null without a reference. */
  toCh: number | null
}

const M_PER_DEG_LAT = 111320

interface MetreXY {
  x: number
  y: number
}

function toMetreXY(point: GuideWallPoint, refLat: number): MetreXY {
  return {
    x: point.lng * M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180),
    y: point.lat * M_PER_DEG_LAT
  }
}

function distanceToReferenceM(
  point: MetreXY,
  reference: GuideWallPoint[],
  refLat: number
): number {
  let nearest = Infinity
  for (let i = 1; i < reference.length; i += 1) {
    const a = toMetreXY(reference[i - 1], refLat)
    const b = toMetreXY(reference[i], refLat)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) {
      nearest = Math.min(nearest, Math.hypot(point.x - a.x, point.y - a.y))
      continue
    }
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
    nearest = Math.min(
      nearest,
      Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t))
    )
  }
  return nearest
}

/**
 * How a drawn line relates to a reference alignment. `follows` requires every
 * vertex of `line` to lie within `toleranceM` of the reference, so a line that
 * merely touches the parent at one end (e.g. a branch offtake leaving it) is
 * not treated as following.
 */
export function lineFollowsReference(
  line: GuideWallPoint[],
  reference: GuideWallPoint[],
  toleranceM: number = CANAL_FOLLOW_TOLERANCE_M
): LineFollowResult {
  const empty: LineFollowResult = {
    follows: false,
    reversed: false,
    maxDistanceM: Infinity,
    fromCh: null,
    toCh: null
  }
  if (line.length < 2 || reference.length < 2) return empty

  const refLat = reference[0].lat
  let maxDistanceM = 0
  for (const vertex of line) {
    maxDistanceM = Math.max(maxDistanceM, distanceToReferenceM(toMetreXY(vertex, refLat), reference, refLat))
  }
  const fromCh = chainageAtPoint(reference, line[0])
  const toCh = chainageAtPoint(reference, line[line.length - 1])
  const reversed = fromCh != null && toCh != null && toCh < fromCh
  return { follows: maxDistanceM <= toleranceM, reversed, maxDistanceM, fromCh, toCh }
}

/**
 * The flow direction along a sub-component line, inherited from the parent
 * canal. Returns null (ask the user) when the line does not follow the parent
 * alignment, the parent flow is unknown, or the parent alignment is unusable.
 */
export function inheritedFlowDirection(
  line: GuideWallPoint[],
  reference: GuideWallPoint[],
  parentFlow: CanalFlowDirection | null | undefined
): CanalFlowDirection | null {
  if (!parentFlow) return null
  const relation = lineFollowsReference(line, reference)
  if (!relation.follows) return null
  const alongLine: CanalFlowDirection = relation.reversed ? 'end-to-start' : 'start-to-end'
  if (parentFlow === 'start-to-end') return alongLine
  return alongLine === 'start-to-end' ? 'end-to-start' : 'start-to-end'
}

/**
 * Nearest ancestor that carries canal data (the sub-component's parent canal).
 * Prefers the nearest ancestor that has a usable alignment, so inheritance
 * still works if an intermediate node's own line was never drawn.
 */
export function findParentCanal(root: ProjectNode, nodeId: string): ProjectNode | null {
  let parent = findParent(root, nodeId)
  let nearestCanal: ProjectNode | null = null
  while (parent) {
    if (parent.canal) {
      if (!nearestCanal) nearestCanal = parent
      const alignment = parent.canal.alignment
      if (Array.isArray(alignment) && alignment.length >= 2) return parent
    }
    parent = findParent(root, parent.id)
  }
  return nearestCanal
}

/** Human label for a flow direction, e.g. "Start → End". */
export function canalFlowLabel(flow: CanalFlowDirection | null | undefined): string {
  if (flow === 'start-to-end') return 'Start → End'
  if (flow === 'end-to-start') return 'End → Start'
  return 'Not set'
}

// ---------------------------------------------------------------------------
// Chapter 2 — cross-sections. The designed profile is built from the Chapter 1
// waterway, then clipped against the entered ground at
// each chainage. Cut and fill areas are measured from the same piecewise-linear
// bands the drawing shows, so the picture is the measurement.
// ---------------------------------------------------------------------------

export interface CanalSectionAreas {
  /** Excavation area (m²): ground above the design. */
  cutting: number
  /** Bank fill area (m²): design above ground. */
  filling: number
}

export interface CanalDifferenceBand {
  /** True when the band is a cut (ground above design). */
  cutting: boolean
  /** Polygon between the two profiles; ground forward, design back. */
  points: CanalPoint[]
}

export function orderCanalPoints(points: CanalPoint[]): CanalPoint[] {
  return [...points].sort((a, b) => a.offset - b.offset)
}

/** Ground RL at an offset, linearly interpolated; null outside the surveyed span. */
export function canalGroundLevelAt(points: CanalPoint[], offset: number): number | null {
  if (points.length === 0) return null
  if (points.length === 1) return points[0].rl
  if (offset < points[0].offset || offset > points[points.length - 1].offset) return null
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    if (offset <= b.offset) {
      if (Math.abs(b.offset - a.offset) < 1e-9) return b.rl
      const t = (offset - a.offset) / (b.offset - a.offset)
      return a.rl + (b.rl - a.rl) * t
    }
  }
  return points[points.length - 1].rl
}

export function canalSectionHasGround(section: CanalSection): boolean {
  return orderCanalPoints(section.ground).length >= 2
}

/** Bed RL from the Chapter 1 start reference, falling at the design 1 in N slope. */
export function canalBedLevelAt(data: CanalData, chainage: number): number | null {
  const referenceBed = data.design.bedLevelAtStart
  if (!Number.isFinite(referenceBed)) return null
  const slope = data.design.bedSlope
  if (!(slope > 0)) return referenceBed
  return referenceBed - chainage / slope
}

export interface CanalHeartingLevel {
  fsl: number
  topRl: number
  preparedGroundRl: number
  height: number
}

export interface CanalHeartingProfile {
  bank: 'left' | 'right'
  points: CanalPoint[]
  trench: CanalPoint[]
  level: CanalHeartingLevel
}

/** Apply the service-road platform rules that are active at one chainage. */
export function canalDesignAtChainage(design: CanalDesign, chainage: number): CanalDesign {
  let leftBankCrestWidth = design.leftBankCrestWidth
  let rightBankCrestWidth = design.rightBankCrestWidth
  const berms = design.berms.map((berm) => ({ ...berm }))
  for (const reach of design.serviceRoadReaches ?? []) {
    if (chainage < reach.fromChainage || chainage > reach.toChainage || !(reach.width > 0)) continue
    const platformWidth = reach.width + 2 * Math.max(0, reach.shoulderWidth)
    for (const side of reach.side === 'both' ? ['left', 'right'] as const : [reach.side]) {
      if (reach.heightMode === 'tbl') {
        if (side === 'left') leftBankCrestWidth = Math.max(leftBankCrestWidth, platformWidth)
        else rightBankCrestWidth = Math.max(rightBankCrestWidth, platformWidth)
        continue
      }
      const face = `${side}-outer` as CanalBerm['face']
      const height = Math.max(0, Math.min(canalSectionDepth(design), reach.heightAboveBed))
      if (height >= canalSectionDepth(design) - 1e-6) {
        if (side === 'left') leftBankCrestWidth = Math.max(leftBankCrestWidth, platformWidth)
        else rightBankCrestWidth = Math.max(rightBankCrestWidth, platformWidth)
        continue
      }
      const existing = berms.find((berm) => berm.face === face && Math.abs(berm.heightAboveBed - height) < 1e-6)
      if (existing) existing.width = Math.max(existing.width, platformWidth)
      else berms.push({ id: `road-${reach.id}-${side}`, face, heightAboveBed: height, width: platformWidth })
    }
  }
  return { ...design, leftBankCrestWidth, rightBankCrestWidth, berms }
}

export interface CanalServiceRoadSegment {
  id: string
  side: 'left' | 'right'
  level: number
  fromOffset: number
  toOffset: number
  width: number
  carriagewayWidth: number
  shoulderWidth: number
}

/** Visible road and shoulder extents, located on the effective design shelf. */
export function canalServiceRoadSegments(data: CanalData, section: CanalSection): CanalServiceRoadSegment[] {
  const bed = canalBedLevelAt(data, section.chainage)
  if (bed == null) return []
  const profile = canalDesignProfile(data, section)
  const result: CanalServiceRoadSegment[] = []
  for (const reach of data.design.serviceRoadReaches ?? []) {
    if (section.chainage < reach.fromChainage || section.chainage > reach.toChainage || !(reach.width > 0)) continue
    const level = bed + (reach.heightMode === 'tbl' ? canalSectionDepth(data.design) : Math.max(0, Math.min(canalSectionDepth(data.design), reach.heightAboveBed)))
    for (const side of reach.side === 'both' ? ['left', 'right'] as const : [reach.side]) {
      const shelves = profile.slice(0, -1).map((point, index) => [point, profile[index + 1]] as const).filter(([a, b]) =>
        Math.abs(a.rl - level) < 1e-6 && Math.abs(b.rl - level) < 1e-6 &&
        (side === 'left' ? Math.max(a.offset, b.offset) <= 1e-6 : Math.min(a.offset, b.offset) >= -1e-6)
      )
      const shelf = shelves.sort((a, b) => Math.abs(b[1].offset - b[0].offset) - Math.abs(a[1].offset - a[0].offset))[0]
      if (!shelf) continue
      const lo = Math.min(shelf[0].offset, shelf[1].offset)
      const hi = Math.max(shelf[0].offset, shelf[1].offset)
      const width = Math.min(reach.width + 2 * Math.max(0, reach.shoulderWidth), hi - lo)
      const centre = (lo + hi) / 2
      result.push({ id: `${reach.id}-${side}`, side, level, fromOffset: centre - width / 2, toOffset: centre + width / 2, width, carriagewayWidth: Math.min(reach.width, width), shoulderWidth: Math.min(Math.max(0, reach.shoulderWidth), width / 2) })
    }
  }
  return result
}

export interface CanalServiceRoadQuantities {
  length: number
  sideCount: number
  carriagewayArea: number
  shoulderArea: number
  platformArea: number
  additionalFormation: number
  hardMetalVolume: number
  blindageArea: number
}

/** Automatic road quantities for one reach; formation is only its incremental bank widening. */
export function canalServiceRoadQuantities(data: CanalData, reach: CanalDesign['serviceRoadReaches'][number]): CanalServiceRoadQuantities {
  const length = Math.max(0, reach.toChainage - reach.fromChainage)
  const sideCount = reach.side === 'both' ? 2 : 1
  const carriagewayArea = length * sideCount * Math.max(0, reach.width)
  const shoulderArea = length * sideCount * 2 * Math.max(0, reach.shoulderWidth)
  const platformArea = carriagewayArea + shoulderArea
  const withoutReach: CanalData = { ...data, design: { ...data.design, serviceRoadReaches: data.design.serviceRoadReaches.filter((item) => item.id !== reach.id) } }
  const rows = orderedCanalSections(data).filter((section) => section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage).map((section) => ({
    chainage: section.chainage,
    area: Math.max(0, canalSectionAreas(data, section).filling - canalSectionAreas(withoutReach, section).filling)
  }))
  let additionalFormation = 0
  for (let index = 1; index < rows.length; index += 1) {
    additionalFormation += (rows[index - 1].area + rows[index].area) / 2 * (rows[index].chainage - rows[index - 1].chainage)
  }
  return {
    length: round3(length), sideCount, carriagewayArea: round3(carriagewayArea), shoulderArea: round3(shoulderArea), platformArea: round3(platformArea),
    additionalFormation: round3(additionalFormation),
    hardMetalVolume: round3(carriagewayArea * Math.max(0, reach.hardMetalThickness)),
    blindageArea: round3(carriagewayArea)
  }
}

/**
 * Automatic hearting level check for one bank foundation at a chainage.
 * A zoned reach only makes the section eligible; the hydraulic/foundation
 * rules can still suppress hearting at that location.
 */
export function canalHeartingLevelAt(
  data: CanalData,
  chainage: number,
  preparedGroundRl: number
): CanalHeartingLevel | null {
  if (data.design.bankSectionType !== 'zoned') return null
  const inZonedReach = data.design.zonedReaches.some(
    (reach) => chainage >= reach.fromChainage && chainage <= reach.toChainage
  )
  if (!inZonedReach || !Number.isFinite(preparedGroundRl)) return null
  const bed = canalBedLevelAt(data, chainage)
  if (bed == null) return null
  const fsl = bed + data.design.fullSupplyDepth
  if (fsl < preparedGroundRl) return null
  const adjustment = Math.min(
    data.design.heartingLevelOffsetFromFsl,
    Math.max(0, data.design.freeBoard)
  )
  const topRl = fsl + adjustment
  const height = topRl - preparedGroundRl
  if (height < Math.max(0, data.design.minimumHeartingHeight)) return null
  return { fsl, topRl, preparedGroundRl, height }
}

/** Impervious hearting polygons for the left and right canal banks. */
export function canalHeartingProfiles(data: CanalData, section: CanalSection): CanalHeartingProfile[] {
  const ground = orderCanalPoints(section.ground)
  const bed = canalBedLevelAt(data, section.chainage)
  if (bed == null || ground.length < 2 || section.designPopulated === false) return []
  const design = canalDesignAtChainage(data.design, section.chainage)
  const profiles: CanalHeartingProfile[] = []
  for (const bank of ['left', 'right'] as const) {
    const direction = bank === 'left' ? -1 : 1
    const crestWidth = bank === 'left' ? design.leftBankCrestWidth : design.rightBankCrestWidth
    if (!(crestWidth > 0)) continue
    const innerFace = bank === 'left' ? 'left-canal' : 'right-canal'
    const halfTopCanal = design.bedWidth / 2 + design.sideSlope * canalSectionDepth(design) +
      design.berms.filter((berm) => berm.face === innerFace && berm.heightAboveBed > 0 && berm.heightAboveBed < canalSectionDepth(design)).reduce((sum, berm) => sum + Math.max(0, berm.width), 0)
    const centre = direction * (halfTopCanal + crestWidth / 2)
    const existingGroundRl = canalGroundLevelAt(ground, centre)
    if (existingGroundRl == null) continue
    const foundationRl = canalFoundationRlAt(data, section.chainage)
    const preparedGroundRl = foundationRl == null ? existingGroundRl : Math.min(existingGroundRl, foundationRl)
    const level = canalHeartingLevelAt(data, section.chainage, preparedGroundRl)
    if (!level) continue
    const topWidth = Math.min(Math.max(0.01, design.heartingTopWidth), crestWidth)
    const halfWidth = topWidth / 2
    const leftTop = centre - halfWidth
    const rightTop = centre + halfWidth
    const leftRun = Math.max(0, design.heartingLeftSlope) * level.height
    const rightRun = Math.max(0, design.heartingRightSlope) * level.height
    const leftBottomOffset = leftTop - leftRun
    const rightBottomOffset = rightTop + rightRun
    const leftGroundRl = canalGroundLevelAt(ground, leftBottomOffset) ?? existingGroundRl
    const rightGroundRl = canalGroundLevelAt(ground, rightBottomOffset) ?? existingGroundRl
    const leftBottomRl = foundationRl == null ? leftGroundRl : Math.min(leftGroundRl, foundationRl)
    const rightBottomRl = foundationRl == null ? rightGroundRl : Math.min(rightGroundRl, foundationRl)
    const points = [
      { offset: leftBottomOffset, rl: leftBottomRl },
      { offset: leftTop, rl: level.topRl },
      { offset: rightTop, rl: level.topRl },
      { offset: rightBottomOffset, rl: rightBottomRl }
    ]
    const trenchDepth = level.height / 2
    const trenchBottomHalf = Math.max(0, design.heartingTrenchWidth) / 2
    const trench = data.mode === 'new' && design.heartingTrenchEnabled && trenchDepth > 0
      ? [
          { offset: centre - trenchBottomHalf - Math.max(0, design.heartingTrenchLeftSlope) * trenchDepth, rl: preparedGroundRl },
          { offset: centre + trenchBottomHalf + Math.max(0, design.heartingTrenchRightSlope) * trenchDepth, rl: preparedGroundRl },
          { offset: centre + trenchBottomHalf, rl: preparedGroundRl - trenchDepth },
          { offset: centre - trenchBottomHalf, rl: preparedGroundRl - trenchDepth }
        ]
      : []
    profiles.push({ bank, points, trench, level })
  }
  return profiles
}

/** Spacing of the two quick ground-entry points when no survey exists yet. */
export function canalGroundSpreadM(data: CanalData, chainage?: number): number {
  const design = chainage == null
    ? data.design
    : canalDesignAtChainage(data.design, chainage)
  const halfTop =
    design.bedWidth / 2 + design.sideSlope * (design.fullSupplyDepth + design.freeBoard)
  const leftBerms = design.berms.filter((berm) => berm.face.startsWith('left-')).reduce((sum, berm) => sum + Math.max(0, berm.width), 0)
  const rightBerms = design.berms.filter((berm) => berm.face.startsWith('right-')).reduce((sum, berm) => sum + Math.max(0, berm.width), 0)
  const left = halfTop + leftBerms + design.leftBankCrestWidth + design.leftBankOuterSlope * canalSectionDepth(design)
  const right = halfTop + rightBerms + design.rightBankCrestWidth + design.rightBankOuterSlope * canalSectionDepth(design)
  return Math.max(5, left, right, halfTop + 3)
}

/**
 * Walk out along the design line until it meets the ground. Works both for a
 * descending bank slope (fill reaches) and a rising cut slope (deep cutting);
 * bisection finds the crossing to well below drawing accuracy.
 */
function designGroundToe(
  fromOffset: number,
  rlAtRun: (run: number) => number,
  dir: -1 | 1,
  ground: CanalPoint[],
  runLimit?: number
): { run: number; crossing: CanalPoint } | null {
  if (ground.length < 2) return null
  const limit = dir === 1 ? ground[ground.length - 1].offset : ground[0].offset
  const maxRun = Math.min(
    Math.max(0, dir * (limit - fromOffset)),
    runLimit == null ? Number.POSITIVE_INFINITY : Math.max(0, runLimit)
  )
  if (maxRun <= 0) return null
  const at = (run: number): CanalPoint => ({
    offset: fromOffset + dir * run,
    rl: rlAtRun(run)
  })
  const diff = (run: number): number | null => {
    const point = at(run)
    const g = canalGroundLevelAt(ground, point.offset)
    return g == null ? null : point.rl - g
  }
  const step = 0.2
  let prevRun = 0
  let prevDiff = diff(0)
  for (let run = step; run <= maxRun + 1e-9; run = Math.min(run + step, maxRun)) {
    const current = diff(run)
    if (current == null) return null
    if (prevDiff != null && (prevDiff === 0 || prevDiff * current <= 0)) {
      let lo = prevRun
      let hi = run
      for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2
        const midDiff = diff(mid)
        if (midDiff == null) break
        if (midDiff * prevDiff > 0) lo = mid
        else hi = mid
      }
      const crossRun = (lo + hi) / 2
      return { run: crossRun, crossing: at(crossRun) }
    }
    prevRun = run
    prevDiff = current
    if (run >= maxRun) break
  }
  return null
}

/** One canal side from the centre-line outward, clipped where its side slope meets ground. */
function canalSideProfile(
  data: CanalData,
  section: CanalSection,
  side: 'left' | 'right'
): CanalPoint[] {
  const design = canalDesignAtChainage(data.design, section.chainage)
  const bed = canalBedLevelAt(data, section.chainage)
  if (bed == null || design.bedWidth < 0 || !(design.fullSupplyDepth > 0)) return []
  const ground = orderCanalPoints(section.ground)
  const dir: -1 | 1 = side === 'left' ? -1 : 1
  const halfBed = design.bedWidth / 2
  const depth = canalSectionDepth(design)
  const top = bed + depth
  const points: CanalPoint[] = [
    { offset: 0, rl: bed },
    { offset: dir * halfBed, rl: bed }
  ]
  if (ground.length < 2) return points
  const innerFace = side === 'left' ? 'left-canal' : 'right-canal'
  const outerFace = side === 'left' ? 'left-outer' : 'right-outer'
  const innerBerms = design.berms.filter((berm) => berm.face === innerFace && berm.width > 0 && berm.heightAboveBed > 0 && berm.heightAboveBed < depth).sort((a, b) => a.heightAboveBed - b.heightAboveBed)
  const outerBerms = design.berms.filter((berm) => berm.face === outerFace && berm.width > 0 && berm.heightAboveBed > 0 && berm.heightAboveBed < depth).sort((a, b) => b.heightAboveBed - a.heightAboveBed)
  const innerSlope = Math.max(0.01, design.sideSlope)
  let offset = dir * halfBed
  let level = bed
  const climbTargets = [...innerBerms.map((berm) => ({ level: bed + berm.heightAboveBed, berm })), { level: top, berm: null as CanalBerm | null }]
  for (const target of climbTargets) {
    const rise = Math.max(0, target.level - level)
    const run = innerSlope * rise
    const crossing = designGroundToe(offset, (distance) => level + distance / innerSlope, dir, ground, run)
    // A canal inner face can begin below ground and emerge above it before
    // reaching bank top. That intersection separates canal cutting from bank
    // filling; it is not the end of the design profile. Only stop when the
    // design is still below ground at the end of this rising segment.
    if (crossing) {
      points.push(crossing.crossing)
      const targetOffset = offset + dir * run
      const targetGround = canalGroundLevelAt(ground, targetOffset)
      if (targetGround != null && target.level < targetGround - 1e-9) return points
    }
    offset += dir * run
    level = target.level
    points.push({ offset, rl: level })
    if (target.berm) {
      const shelfCrossing = designGroundToe(offset, () => level, dir, ground, target.berm.width)
      if (shelfCrossing) {
        points.push(shelfCrossing.crossing)
        const shelfEnd = offset + dir * target.berm.width
        const shelfEndGround = canalGroundLevelAt(ground, shelfEnd)
        if (shelfEndGround != null && level < shelfEndGround - 1e-9) return points
      }
      offset += dir * target.berm.width
      points.push({ offset, rl: level })
    }
  }
  const innerTopOffset = offset
  const limit = dir === 1 ? ground[ground.length - 1].offset : ground[0].offset
  const groundAtInnerTop = canalGroundLevelAt(ground, innerTopOffset)
  if (groundAtInnerTop != null && groundAtInnerTop >= top - 1e-9) {
    const continuingCut = designGroundToe(
      innerTopOffset,
      (distance) => top + distance / innerSlope,
      dir,
      ground
    )
    if (continuingCut) points.push(continuingCut.crossing)
    else {
      const run = Math.max(0, dir * (limit - innerTopOffset))
      if (run > 1e-6) points.push({ offset: limit, rl: top + run / innerSlope })
    }
    return points
  }
  const crestWidth = side === 'left' ? design.leftBankCrestWidth : design.rightBankCrestWidth
  const outerSlope = Math.max(0.01, side === 'left' ? design.leftBankOuterSlope : design.rightBankOuterSlope)
  offset = innerTopOffset + dir * Math.max(0, crestWidth)
  level = top
  if (crestWidth > 0) points.push({ offset, rl: level })
  for (const berm of outerBerms) {
    const targetLevel = bed + berm.heightAboveBed
    const drop = Math.max(0, level - targetLevel)
    const run = outerSlope * drop
    const crossing = designGroundToe(offset, (distance) => level - distance / outerSlope, dir, ground, run)
    if (crossing) { points.push(crossing.crossing); return points }
    offset += dir * run
    level = targetLevel
    points.push({ offset, rl: level })
    const shelfCrossing = designGroundToe(offset, () => level, dir, ground, berm.width)
    if (shelfCrossing) { points.push(shelfCrossing.crossing); return points }
    offset += dir * berm.width
    points.push({ offset, rl: level })
  }
  const outerRun = Math.max(0, dir * (limit - offset))
  const outerRlAtRun = (run: number): number => level - run / outerSlope
  const bank = designGroundToe(offset, outerRlAtRun, dir, ground)
  if (bank) points.push(bank.crossing)
  else if (outerRun > 1e-6) points.push({ offset: limit, rl: outerRlAtRun(outerRun) })
  return points
}

/**
 * The simple canal prism at a chainage: centre-line bed, left/right bed edges,
 * and side slopes clipped where they meet the entered ground.
 */
export function canalDesignProfile(data: CanalData, section: CanalSection): CanalPoint[] {
  if (section.designPopulated === false) return []
  const left = canalSideProfile(data, section, 'left')
  const right = canalSideProfile(data, section, 'right')
  if (left.length < 2 || right.length < 2) return []
  return [...left.slice().reverse(), ...right.slice(1)]
}

/**
 * Resolve the two entered toe RLs into a ground line whose endpoints are the
 * actual left and right design/ground contacts. Iteration is needed because a
 * sloping line between unequal toe RLs slightly changes both contact offsets.
 */
export function canalGroundProfileBetweenToes(
  data: CanalData,
  section: CanalSection,
  leftToeRl: number,
  rightToeRl: number
): CanalPoint[] {
  const design = canalDesignAtChainage(data.design, section.chainage)
  const spread = canalGroundSpreadM(data, section.chainage)
  const bed = canalBedLevelAt(data, section.chainage) ?? data.design.bedLevelAtStart
  const top = bed + canalSectionDepth(design)
  const halfTop = design.bedWidth / 2 + design.sideSlope * canalSectionDepth(design)
  const activeBermWidth = (prefix: 'left' | 'right', canalSideOnly = false): number =>
    design.berms.filter((berm) =>
      berm.face.startsWith(`${prefix}-`) &&
      (!canalSideOnly || berm.face === `${prefix}-canal`) &&
      berm.heightAboveBed > 0 && berm.heightAboveBed < canalSectionDepth(design)
    ).reduce((sum, berm) => sum + Math.max(0, berm.width), 0)
  const leftBermWidth = activeBermWidth('left')
  const rightBermWidth = activeBermWidth('right')
  const leftSpread = Math.max(
    spread,
    halfTop + leftBermWidth + design.leftBankCrestWidth + design.leftBankOuterSlope * Math.max(0, top - leftToeRl) + 1,
    design.bedWidth / 2 + activeBermWidth('left', true) + design.sideSlope * Math.max(0, leftToeRl - bed) + 1
  )
  const rightSpread = Math.max(
    spread,
    halfTop + rightBermWidth + design.rightBankCrestWidth + design.rightBankOuterSlope * Math.max(0, top - rightToeRl) + 1,
    design.bedWidth / 2 + activeBermWidth('right', true) + design.sideSlope * Math.max(0, rightToeRl - bed) + 1
  )
  let ground: CanalPoint[] = [
    { offset: -leftSpread, rl: leftToeRl },
    { offset: rightSpread, rl: rightToeRl }
  ]
  for (let pass = 0; pass < 10; pass += 1) {
    const candidate = { ...section, ground, designPopulated: true }
    const profile = canalDesignProfile(data, candidate)
    if (profile.length < 2) break
    const next: CanalPoint[] = [
      { offset: profile[0].offset, rl: leftToeRl },
      { offset: profile[profile.length - 1].offset, rl: rightToeRl }
    ]
    const settled = Math.abs(next[0].offset - ground[0].offset) < 1e-5 &&
      Math.abs(next[1].offset - ground[1].offset) < 1e-5
    ground = next
    if (settled) break
  }
  return orderCanalPoints(ground)
}

/** Rebuild only quick toe/average-RL sections after a geometry-setting change. */
export function repopulateCanalQuickSections(data: CanalData): CanalData {
  const sections = data.sections.map((section) => {
    if (section.designPopulated === false || section.ground.length > 2) return section
    const ordered = orderCanalPoints(section.ground)
    const left = section.leftToeRl ?? ordered[0]?.rl
    const right = section.groundEntryMode === 'separate'
      ? section.rightToeRl ?? ordered.at(-1)?.rl
      : left
    if (!Number.isFinite(left) || !Number.isFinite(right)) return section
    const ground = canalGroundProfileBetweenToes(data, section, left as number, right as number)
    const candidate = { ...section, ground, designPopulated: true }
    const designPointOffsets = [...new Set(canalDesignProfile(data, candidate).map((point) => Math.round(point.offset * 1000) / 1000))].sort((a, b) => a - b)
    return { ...candidate, designPointOffsets }
  })
  return { ...data, sections }
}

function segmentIntersectionOffsets(
  a: CanalPoint,
  b: CanalPoint,
  c: CanalPoint,
  d: CanalPoint
): number[] {
  const d1x = b.offset - a.offset
  const d1y = b.rl - a.rl
  const d2x = d.offset - c.offset
  const d2y = d.rl - c.rl
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-12) return []
  const t = ((c.offset - a.offset) * d2y - (c.rl - a.rl) * d2x) / denom
  const u = ((c.offset - a.offset) * d1y - (c.rl - a.rl) * d1x) / denom
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return []
  return [a.offset + d1x * t]
}

/**
 * Contiguous cut/fill bands between the ground and the design profile, split
 * at every vertex and crossing so each band has a single sign. Used by both
 * the area measurement and the drawing.
 */
export function profileDifferenceBands(
  groundInput: CanalPoint[],
  designInput: CanalPoint[]
): CanalDifferenceBand[] {
  const ground = orderCanalPoints(groundInput)
  const design = orderCanalPoints(designInput)
  if (ground.length < 2 || design.length < 2) return []
  const minOffset = Math.max(ground[0].offset, design[0].offset)
  const maxOffset = Math.min(ground[ground.length - 1].offset, design[design.length - 1].offset)
  if (!(maxOffset > minOffset)) return []

  const offsets = new Set<number>([minOffset, maxOffset])
  for (const point of ground) {
    if (point.offset > minOffset && point.offset < maxOffset) offsets.add(point.offset)
  }
  for (const point of design) {
    if (point.offset > minOffset && point.offset < maxOffset) offsets.add(point.offset)
  }
  for (let i = 1; i < ground.length; i += 1) {
    for (let j = 1; j < design.length; j += 1) {
      for (const offset of segmentIntersectionOffsets(
        ground[i - 1],
        ground[i],
        design[j - 1],
        design[j]
      )) {
        if (offset > minOffset && offset < maxOffset) offsets.add(offset)
      }
    }
  }

  const sorted = [...offsets].sort((a, b) => a - b)
  const levelAt = (points: CanalPoint[], offset: number): number =>
    canalGroundLevelAt(points, offset) ?? 0

  const bands: CanalDifferenceBand[] = []
  let current:
    | { cutting: boolean; groundPoints: CanalPoint[]; designPoints: CanalPoint[] }
    | null = null
  const flush = (): void => {
    if (!current) return
    const points = [
      ...current.groundPoints,
      ...[...current.designPoints].reverse()
    ]
    bands.push({ cutting: current.cutting, points })
    current = null
  }

  for (let i = 1; i < sorted.length; i += 1) {
    const from = sorted[i - 1]
    const to = sorted[i]
    if (to - from <= 1e-9) continue
    const mid = (from + to) / 2
    const cutting = levelAt(ground, mid) > levelAt(design, mid)
    const groundPoints: CanalPoint[] = [
      { offset: from, rl: levelAt(ground, from) },
      { offset: to, rl: levelAt(ground, to) }
    ]
    const designPoints: CanalPoint[] = [
      { offset: from, rl: levelAt(design, from) },
      { offset: to, rl: levelAt(design, to) }
    ]
    if (!current || current.cutting !== cutting) {
      flush()
      current = { cutting, groundPoints, designPoints }
    } else {
      current.groundPoints.push(...groundPoints.slice(1))
      current.designPoints.push(...designPoints.slice(1))
    }
  }
  flush()
  return bands
}

function polygonArea(points: CanalPoint[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.offset * b.rl - b.offset * a.rl
  }
  return Math.abs(sum) / 2
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

export function canalFoundationRlAt(data: CanalData, chainage: number): number | null {
  if (data.mode !== 'new') return null
  const levels = (data.foundationExcavationReaches ?? [])
    .filter((reach) => reach.kind !== 'stripping' && chainage >= reach.fromChainage && chainage <= reach.toChainage)
    .map((reach) => reach.foundationRl)
    .filter(Number.isFinite)
  return levels.length ? Math.min(...levels) : null
}

export function canalStrippingDepthAt(data: CanalData, chainage: number): number {
  if (data.mode === 'repair') return Math.max(0, data.strippingDepth)
  return Math.max(0, ...(data.foundationExcavationReaches ?? [])
    .filter((reach) => reach.kind === 'stripping' && chainage >= reach.fromChainage && chainage <= reach.toChainage)
    .map((reach) => Math.max(0, reach.strippingDepth)))
}

export function canalFoundationDepthAt(data: CanalData, chainage: number, groundRl?: number): number {
  if (data.mode !== 'new') return Math.max(0, data.strippingDepth)
  const foundationRl = canalFoundationRlAt(data, chainage)
  return foundationRl == null || !Number.isFinite(groundRl) ? 0 : Math.max(0, (groundRl as number) - foundationRl)
}

function canalFillFootprintWidth(data: CanalData, section: CanalSection): number {
  const design = canalDesignProfile(data, section)
  if (design.length < 2) return 0
  return profileDifferenceBands(section.ground, design).filter((band) => !band.cutting).reduce((sum, band) => {
    const offsets = band.points.map((point) => point.offset)
    return sum + Math.max(0, Math.max(...offsets) - Math.min(...offsets))
  }, 0)
}

/** Foundation-excavation polygons beneath the bank-fill footprint at a section. */
export function canalFoundationExcavationBands(data: CanalData, section: CanalSection): CanalPoint[][] {
  const foundationRl = canalFoundationRlAt(data, section.chainage)
  if (foundationRl == null) return []
  const ground = orderCanalPoints(section.ground)
  const design = canalDesignProfile(data, section)
  if (ground.length < 2 || design.length < 2) return []
  return profileDifferenceBands(ground, design).filter((band) => !band.cutting).map((band) => {
    const offsets = band.points.map((point) => point.offset)
    const from = Math.min(...offsets)
    const to = Math.max(...offsets)
    const topOffsets = [from, ...ground.filter((point) => point.offset > from && point.offset < to).map((point) => point.offset), to]
    const top = topOffsets.map((offset) => ({ offset, rl: canalGroundLevelAt(ground, offset) ?? 0 }))
    if (top.every((point) => point.rl <= foundationRl)) return null
    return [...top, ...[...top].reverse().map((point) => ({ offset: point.offset, rl: Math.min(point.rl, foundationRl) }))]
  }).filter((band): band is CanalPoint[] => band != null)
}

/** Deepest vertical foundation-excavation depth visible at this cross-section. */
export function canalFoundationDepthAtSection(data: CanalData, section: CanalSection): number {
  const bottom = canalFoundationRlAt(data, section.chainage)
  if (bottom == null) return 0
  const tops = canalFoundationExcavationBands(data, section).flat().map((point) => point.rl)
  return tops.length ? round3(Math.max(0, Math.max(...tops) - bottom)) : 0
}

export function canalFoundationWidthsAtSection(data: CanalData, section: CanalSection): { left: number; right: number; total: number } {
  let left = 0
  let right = 0
  const halfBed = Math.max(0, data.design.bedWidth / 2)
  for (const band of canalFoundationExcavationBands(data, section)) {
    const offsets = band.map((point) => point.offset)
    const from = Math.min(...offsets)
    const to = Math.max(...offsets)
    // A continuous fill polygon may span beneath both banks. Attribute only
    // the portions outside the canal bed to their respective bank footprints.
    left += Math.max(0, Math.min(to, -halfBed) - from)
    right += Math.max(0, to - Math.max(from, halfBed))
  }
  return { left: round3(left), right: round3(right), total: round3(left + right) }
}

/**
 * Automatic horizontal-filter lengths measured inward from each outer bank
 * toe. In a homogeneous bank the filter covers half the toe-to-canal
 * foundation width. In a zoned bank it stops at the outer toe of the
 * impervious hearting, keeping the drainage material outside the core.
 */
export function canalAutomaticFilterLengthsAtSection(data: CanalData, section: CanalSection): { left: number; right: number; total: number } {
  const available = canalFoundationWidthsAtSection(data, section)
  let left = available.left / 2
  let right = available.right / 2
  const foundationBands = canalFoundationExcavationBands(data, section)
  const outerLeft = foundationBands.length ? Math.min(...foundationBands.flat().map((point) => point.offset)) : null
  const outerRight = foundationBands.length ? Math.max(...foundationBands.flat().map((point) => point.offset)) : null
  for (const hearting of canalHeartingProfiles(data, section)) {
    const bottomOffsets = [hearting.points[0]?.offset, hearting.points[3]?.offset].filter(Number.isFinite) as number[]
    if (!bottomOffsets.length) continue
    if (hearting.bank === 'left' && outerLeft != null) {
      const outerHeartingToe = Math.min(...bottomOffsets)
      left = Math.min(available.left, Math.max(0, outerHeartingToe - outerLeft))
    }
    if (hearting.bank === 'right' && outerRight != null) {
      const outerHeartingToe = Math.max(...bottomOffsets)
      right = Math.min(available.right, Math.max(0, outerRight - outerHeartingToe))
    }
  }
  return { left: round3(left), right: round3(right), total: round3(left + right) }
}

/** Valid automatic sand-blanket width at its top RL. */
export function canalSandBlanketWidthsAtSection(data: CanalData, section: CanalSection, blanketTopRl: number): { left: number; right: number; total: number } {
  const bands = canalFoundationExcavationBands(data, section)
  const offsets = bands.flat().map((point) => point.offset)
  if (!offsets.length) return { left: 0, right: 0, total: 0 }
  const outerLeft = Math.min(...offsets)
  const outerRight = Math.max(...offsets)
  const bed = canalBedLevelAt(data, section.chainage)
  if (bed == null || bed >= blanketTopRl) {
    const left = Math.max(0, -outerLeft)
    const right = Math.max(0, outerRight)
    return { left: round3(left), right: round3(right), total: round3(outerRight - outerLeft) }
  }
  const design = canalDesignAtChainage(data.design, section.chainage)
  const cutHalfWidth = design.bedWidth / 2 + Math.max(0, design.sideSlope) * Math.max(0, blanketTopRl - bed)
  const left = Math.max(0, -cutHalfWidth - outerLeft)
  const right = Math.max(0, outerRight - cutHalfWidth)
  return { left: round3(left), right: round3(right), total: round3(left + right) }
}

function clipPolygonBelowRl(points: CanalPoint[], topRl: number): CanalPoint[] {
  if (!points.length) return []
  const output: CanalPoint[] = []
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const previous = points[(index + points.length - 1) % points.length]
    const currentInside = current.rl <= topRl
    const previousInside = previous.rl <= topRl
    if (currentInside !== previousInside) {
      const ratio = (topRl - previous.rl) / (current.rl - previous.rl)
      output.push({ offset: previous.offset + ratio * (current.offset - previous.offset), rl: topRl })
    }
    if (currentInside) output.push(current)
  }
  return output
}

/** Replacement-fill polygons, limited by entered depth and actual excavation void. */
export function canalFoundationFillBands(data: CanalData, section: CanalSection, depth: number): CanalPoint[][] {
  const bottom = canalFoundationRlAt(data, section.chainage)
  if (bottom == null || !(depth > 0)) return []
  return canalFoundationExcavationBands(data, section)
    .map((band) => clipPolygonBelowRl(band, bottom + depth))
    .filter((band) => band.length >= 3)
}

/** Cutting and filling areas (m²) at one chainage. */
export function canalSectionAreas(data: CanalData, section: CanalSection): CanalSectionAreas {
  const design = canalDesignProfile(data, section)
  const bands = design.length >= 2 ? profileDifferenceBands(section.ground, design) : []
  let cutting = 0
  let filling = 0
  for (const band of bands) {
    if (band.cutting) cutting += polygonArea(band.points)
    else filling += polygonArea(band.points)
  }
  filling += canalFoundationExcavationBands(data, section).reduce((sum, band) => sum + polygonArea(band), 0)
  filling += canalFillFootprintWidth(data, section) * canalStrippingDepthAt(data, section.chainage)
  return { cutting: round3(cutting), filling: round3(filling) }
}

export interface CanalBankVolumeTotals {
  homogeneous: number
  hearting: number
  casing: number
  totalFill: number
}

/**
 * A section only enters mean-sectional-area totals when both the surveyed
 * ground and the design profile exist. Newly generated or cleared sections
 * (designPopulated false, fewer than two ground points, or no design
 * profile) are bridged over instead of being averaged as zero area, which
 * would dilute every volume they touch.
 */
function canalMeasurableSection(data: CanalData, section: CanalSection): boolean {
  if (section.designPopulated === false) return false
  if (orderCanalPoints(section.ground).length < 2) return false
  return canalDesignProfile(data, section).length >= 2
}

export interface CanalBankRepairItem {
  zone: CanalBankMaterialZone
  code: string
  quantity: number
}

/**
 * Repair banks bill the PMW repair items, never the CAW new-work options:
 * homogeneous formation excludes compaction (3-17) and its compaction
 * bills separately (3-18), while hearting and casing already include
 * compaction (3-8, 3-9). Zero-volume zones are kept; callers filter them.
 */
export function canalBankRepairItems(data: CanalData): CanalBankRepairItem[] {
  const volumes = canalBankVolumeTotals(data)
  const zones: CanalBankMaterialZone[] = data.design.bankSectionType === 'zoned' ? ['hearting', 'casing'] : ['homogeneous']
  const out: CanalBankRepairItem[] = []
  for (const zone of zones) {
    const quantity = round3(volumes[zone])
    if (zone === 'homogeneous') {
      out.push({ zone, code: CANAL_REPAIR_FORMATION_CODE, quantity }, { zone, code: CANAL_REPAIR_COMPACTION_CODE, quantity })
    } else {
      out.push({ zone, code: zone === 'hearting' ? CANAL_REPAIR_HEARTING_CODE : CANAL_REPAIR_CASING_CODE, quantity })
    }
  }
  return out
}

/** Bank fill measured above the stripped/prepared plane, split into billable zones. */
export function canalBankVolumeTotals(data: CanalData): CanalBankVolumeTotals {
  const rows = orderedCanalSections(data).filter((section) => canalMeasurableSection(data, section)).map((section) => {
    const totalFill = canalSectionAreas(data, section).filling
    const hearting = data.design.bankSectionType === 'zoned'
      ? canalHeartingProfiles(data, section).reduce((sum, profile) => sum + polygonArea(profile.points), 0)
      : 0
    return {
      chainage: section.chainage,
      totalFill,
      hearting: Math.min(totalFill, hearting),
      casing: Math.max(0, totalFill - hearting)
    }
  })
  let totalFill = 0
  let hearting = 0
  let casing = 0
  for (let index = 1; index < rows.length; index += 1) {
    const length = Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    totalFill += (rows[index - 1].totalFill + rows[index].totalFill) / 2 * length
    hearting += (rows[index - 1].hearting + rows[index].hearting) / 2 * length
    casing += (rows[index - 1].casing + rows[index].casing) / 2 * length
  }
  return {
    homogeneous: round3(data.design.bankSectionType === 'homogeneous' ? totalFill : 0),
    hearting: round3(hearting),
    casing: round3(casing),
    totalFill: round3(totalFill)
  }
}

/** Automatic prepared level at a section offset from the interpolated ground. */
export function canalStrippedOrCutLevelAt(
  data: CanalData,
  section: CanalSection,
  offset: number
): number | null {
  const groundRl = canalGroundLevelAt(orderCanalPoints(section.ground), offset)
  if (groundRl == null) return null
  const foundationRl = canalFoundationRlAt(data, section.chainage)
  const strippedRl = foundationRl == null
    ? groundRl - canalStrippingDepthAt(data, section.chainage)
    : Math.min(groundRl, foundationRl)
  const proposedRl = canalGroundLevelAt(canalDesignProfile(data, section), offset)
  return proposedRl == null ? strippedRl : Math.min(strippedRl, proposedRl)
}

/** Stripping polygons below existing ground wherever canal formation is in fill. */
export function canalStrippingBands(data: CanalData, section: CanalSection): CanalPoint[][] {
  const depth = canalStrippingDepthAt(data, section.chainage)
  const ground = orderCanalPoints(section.ground)
  const design = canalDesignProfile(data, section)
  if (!(depth > 0) || ground.length < 2 || design.length < 2) return []
  return profileDifferenceBands(ground, design)
    .filter((band) => !band.cutting)
    .map((band) => {
      const offsets = band.points.map((point) => point.offset)
      const from = Math.min(...offsets)
      const to = Math.max(...offsets)
      const topOffsets = [
        from,
        ...ground.filter((point) => point.offset > from && point.offset < to).map((point) => point.offset),
        to
      ]
      const top = topOffsets.map((offset) => ({ offset, rl: canalGroundLevelAt(ground, offset) ?? 0 }))
      const bottom = [...top].reverse().map((point) => ({ offset: point.offset, rl: point.rl - depth }))
      return [...top, ...bottom]
    })
}

export interface CanalEarthworkTotals {
  excavation: number
  stripping: number
  foundationExcavation: number
  cutoffTrench: number
}

/** Mean-sectional-area earthwork totals for all populated canal sections. */
export function canalEarthworkTotals(data: CanalData): CanalEarthworkTotals {
  const rows = orderedCanalSections(data).filter((section) => canalMeasurableSection(data, section)).map((section) => {
    const design = canalDesignProfile(data, section)
    const bands = design.length >= 2 ? profileDifferenceBands(section.ground, design) : []
    const areas = canalSectionAreas(data, section)
    const strippingWidth = bands.filter((band) => !band.cutting).reduce((sum, band) => {
      const offsets = band.points.map((point) => point.offset)
      return sum + Math.max(0, Math.max(...offsets) - Math.min(...offsets))
    }, 0)
    const cutoffTrench = data.mode === 'new'
      ? canalHeartingProfiles(data, section).reduce((sum, profile) => sum + polygonArea(profile.trench), 0)
      : 0
    return {
      chainage: section.chainage,
      excavation: areas.cutting,
      stripping: strippingWidth * canalStrippingDepthAt(data, section.chainage),
      foundationExcavation: data.mode === 'new' ? canalFoundationExcavationBands(data, section).reduce((sum, band) => sum + polygonArea(band), 0) : 0,
      cutoffTrench
    }
  })
  const totals: CanalEarthworkTotals = { excavation: 0, stripping: 0, foundationExcavation: 0, cutoffTrench: 0 }
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]
    const current = rows[index]
    const length = Math.max(0, current.chainage - previous.chainage)
    totals.excavation += (previous.excavation + current.excavation) / 2 * length
    totals.stripping += (previous.stripping + current.stripping) / 2 * length
    totals.foundationExcavation += (previous.foundationExcavation + current.foundationExcavation) / 2 * length
    totals.cutoffTrench += (previous.cutoffTrench + current.cutoffTrench) / 2 * length
  }
  return {
    excavation: round3(totals.excavation),
    stripping: round3(totals.stripping),
    foundationExcavation: round3(totals.foundationExcavation),
    cutoffTrench: round3(totals.cutoffTrench)
  }
}

export function canalFoundationExcavationReachTotal(data: CanalData, reach: CanalFoundationExcavationReach): number {
  if (reach.kind === 'stripping') return 0
  const reachOnly = { ...data, foundationExcavationReaches: [reach] }
  const rows = orderedCanalSections(data).filter((section) =>
    section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage && canalMeasurableSection(data, section)
  ).map((section) => ({ chainage: section.chainage, area: canalFoundationExcavationBands(reachOnly, section).reduce((sum, band) => sum + polygonArea(band), 0) }))
  let volume = 0
  for (let index = 1; index < rows.length; index += 1) {
    volume += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
  }
  return round3(volume)
}

export function canalStrippingReachTotal(data: CanalData, reach: CanalFoundationExcavationReach): number {
  if (reach.kind !== 'stripping') return 0
  const rows = orderedCanalSections(data).filter((section) =>
    section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage && canalMeasurableSection(data, section)
  ).map((section) => ({ chainage: section.chainage, area: canalFillFootprintWidth(data, section) * Math.max(0, reach.strippingDepth) }))
  let volume = 0
  for (let index = 1; index < rows.length; index += 1) {
    volume += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
  }
  return round3(volume)
}

function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)))
}

/**
 * Whether the Foundation Filling & Filters chapter is available. It shows
 * once a foundation-excavation reach exists — even while it still measures
 * zero because sections are not populated yet — so the chapter list never
 * hides the next step from the user.
 */
export function canalShowsFoundationFilling(data: CanalData): boolean {
  return data.mode === 'new' &&
    (data.foundationExcavationReaches ?? []).some((reach) => reach.kind !== 'stripping')
}

/** Foundation-excavation void available inside a proposed treatment reach. */
export function canalFoundationVoidInReach(data: CanalData, fromChainage: number, toChainage: number): number {
  return round3((data.foundationExcavationReaches ?? []).reduce((sum, source) => {
    if (source.kind === 'stripping') return sum
    const sourceLength = Math.max(0, source.toChainage - source.fromChainage)
    const shared = overlapLength(fromChainage, toChainage, source.fromChainage, source.toChainage)
    return sum + (sourceLength > 0 ? canalFoundationExcavationReachTotal(data, source) * shared / sourceLength : 0)
  }, 0))
}

export function canalFoundationFillQuantity(data: CanalData, reach: CanalFoundationFillReach): { quantity: number; unit: 'cu.m' | 'sq.m' } {
  const length = Math.max(0, reach.toChainage - reach.fromChainage)
  const sides = reach.side === 'both' ? 2 : 1
  if (reach.kind === '5-1' || reach.kind === '5-2' || reach.kind === '5-3') {
    const share = Math.min(100, Math.max(0, reach.percentage)) / 100
    const rows = orderedCanalSections(data).filter((section) => section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage).map((section) => ({ chainage: section.chainage, area: canalFoundationFillBands(data, section, canalFoundationDepthAtSection(data, section) * share).reduce((sum, band) => sum + polygonArea(band), 0) }))
    let volume = 0
    for (let index = 1; index < rows.length; index += 1) volume += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    return { quantity: round3(volume), unit: 'cu.m' }
  }
  if (reach.kind === '5-4' || reach.kind === '5-5') {
    const thickness = reach.kind === '5-4' ? 0.25 : Math.max(0, reach.thickness)
    const rows = orderedCanalSections(data).filter((section) => section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage).map((section) => {
      const bottom = canalFoundationRlAt(data, section.chainage) ?? 0
      const fill = data.foundationFillReaches.find((row) => row.workReachId === reach.workReachId && (row.kind === '5-1' || row.kind === '5-2' || row.kind === '5-3'))
      const fillDepth = fill ? canalFoundationDepthAtSection(data, section) * Math.min(100, Math.max(0, fill.percentage)) / 100 : 0
      const widths = reach.blanketWidthMode === 'manual'
        ? (() => {
            const available = canalFoundationWidthsAtSection(data, section)
            return {
              total: Math.min(Math.max(0, reach.blanketLeftWidth), available.left) +
                Math.min(Math.max(0, reach.blanketRightWidth), available.right)
            }
          })()
        : canalSandBlanketWidthsAtSection(data, section, bottom + fillDepth + thickness)
      return { chainage: section.chainage, area: widths.total }
    })
    let planArea = 0
    for (let index = 1; index < rows.length; index += 1) planArea += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    // IRR-CAW-5-4 is billed per sq.m at its code-fixed 0.25 m thickness; 5-5 bills by volume.
    if (reach.kind === '5-4') return { quantity: round3(planArea), unit: 'sq.m' }
    return { quantity: round3(planArea * thickness), unit: 'cu.m' }
  }
  if (reach.kind === '5-7') {
    const thickness = Math.max(0, reach.thickness)
    const rows = orderedCanalSections(data).filter((section) => section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage).map((section) => {
      const available = canalFoundationWidthsAtSection(data, section)
      const lengths = reach.blanketWidthMode === 'manual'
        ? { total: Math.min(Math.max(0, reach.blanketLeftWidth), available.left) + Math.min(Math.max(0, reach.blanketRightWidth), available.right) }
        : canalAutomaticFilterLengthsAtSection(data, section)
      return { chainage: section.chainage, area: lengths.total * thickness }
    })
    let volume = 0
    for (let index = 1; index < rows.length; index += 1) volume += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    return { quantity: round3(volume), unit: 'cu.m' }
  }
  if (reach.kind === '5-10') {
    const blanket = data.foundationFillReaches.find((row) => row.workReachId === reach.workReachId && (row.kind === '5-4' || row.kind === '5-5'))
    const horizontalFilter = data.foundationFillReaches.find((row) => row.workReachId === reach.workReachId && row.kind === '5-7')
    const fill = data.foundationFillReaches.find((row) => row.workReachId === reach.workReachId && (row.kind === '5-1' || row.kind === '5-2' || row.kind === '5-3'))
    const rows = orderedCanalSections(data).filter((section) => section.chainage >= reach.fromChainage && section.chainage <= reach.toChainage).map((section) => {
      const bottom = canalFoundationRlAt(data, section.chainage)
      const bed = canalBedLevelAt(data, section.chainage)
      const fillDepth = fill ? canalFoundationDepthAtSection(data, section) * Math.min(100, Math.max(0, fill.percentage)) / 100 : 0
      const blanketThickness = blanket ? (blanket.kind === '5-4' ? 0.25 : Math.max(0, blanket.thickness)) : Math.max(0, reach.thickness)
      const base = (bottom ?? bed ?? 0) + fillDepth + blanketThickness + Math.max(0, horizontalFilter?.thickness ?? 0)
      const autoHeight = bed == null ? 0 : Math.max(0, bed + data.design.fullSupplyDepth - base)
      const height = reach.height > 0 ? reach.height : autoHeight
      return { chainage: section.chainage, area: 0.5 * height * sides }
    })
    let volume = 0
    for (let index = 1; index < rows.length; index += 1) volume += (rows[index - 1].area + rows[index].area) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    return { quantity: round3(volume), unit: 'cu.m' }
  }
  return { quantity: round3(length * Math.max(0, reach.width) * Math.max(0, reach.height) * sides), unit: 'cu.m' }
}

export function canalFilterDrainQuantity(data: CanalData, reach: CanalFilterDrainReach): { quantity: number; unit: 'cu.m' | 'sq.m' | 'PLUG' | 'MT' } {
  const length = Math.max(0, reach.toChainage - reach.fromChainage)
  const sides = reach.side === 'both' ? 2 : 1
  const selectedSlopes = reach.side === 'left'
    ? [data.design.leftBankOuterSlope]
    : reach.side === 'right'
      ? [data.design.rightBankOuterSlope]
      : [data.design.leftBankOuterSlope, data.design.rightBankOuterSlope]
  const height = Math.max(0, reach.depth)
  const crest = Math.max(0, reach.rockToeTopWidth ?? 0)
  const inner = Math.max(0, reach.rockToeInnerSlope ?? 1)
  if (reach.kind === '5-6') {
    const area = selectedSlopes.reduce((sum, outer) => sum + crest * height + 0.5 * height * height * (inner + Math.max(0, outer)), 0)
    return { quantity: round3(length * area), unit: 'cu.m' }
  }
  if (reach.kind === '5-11') {
    const area = selectedSlopes.reduce((sum, outer) => {
      const baseWidth = crest + height * (inner + Math.max(0, outer))
      const innerFace = Math.hypot(height, inner * height)
      return sum + baseWidth * 1 + innerFace * 0.5
    }, 0)
    return { quantity: round3(length * area), unit: 'cu.m' }
  }
  if (reach.kind === '5-9') {
    const placements = reach.placementMode === 'manual'
      ? (reach.manualChainages?.filter((chainage) => chainage >= reach.fromChainage && chainage <= reach.toChainage).length ?? 0)
      : reach.placementMode === 'spacing'
        ? Math.max(0, Math.floor(length / Math.max(0.01, reach.spacing)) + 1)
        : Math.max(1, Math.round(reach.count))
    const locations = reach.plugLocations == null ? 1 : reach.plugLocations.length
    return { quantity: placements * locations, unit: 'PLUG' }
  }
  if (reach.kind === '5-12' || reach.kind === '5-13') return { quantity: round3(length * Math.max(0, reach.width) * sides), unit: 'sq.m' }
  const transverseCount = reach.placementMode === 'manual'
    ? (reach.manualChainages?.filter((chainage) => chainage >= reach.fromChainage && chainage <= reach.toChainage).length ?? 0)
    : Math.max(0, Math.floor(length / Math.max(0.01, reach.spacing)) + 1)
  const drainLength = reach.orientation === 'cross'
    ? transverseCount * Math.max(0, reach.crossDrainLength ?? data.design.bedWidth)
    : reach.orientation === 'local'
      ? Math.max(1, Math.round(reach.count)) * Math.max(0, reach.crossDrainLength ?? data.design.bedWidth)
      : length * sides
  if (reach.kind === '5-8') return { quantity: round3(drainLength), unit: 'MT' }
  return { quantity: round3(drainLength * Math.max(0, reach.width) * Math.max(0, reach.depth)), unit: 'cu.m' }
}

/** Excavation (never stripping) confirmed suitable for reuse in bank construction. */
export function canalSuitableBankExcavation(data: CanalData): number {
  const excavation = canalEarthworkTotals(data).excavation
  const suitableShare = (data.excavationBands ?? []).reduce(
    (sum, band) => sum + Math.max(0, band.pct) / 100 * Math.max(0, band.bankReusePct ?? 0) / 100,
    0
  )
  const foundationSuitable = data.mode === 'new' ? (data.foundationExcavationReaches ?? []).reduce((sum, reach) => {
    if (reach.kind === 'stripping') return sum
    const reachShare = reach.bands.reduce(
      (share, band) => share + Math.max(0, band.pct) / 100 * Math.max(0, band.bankReusePct ?? 0) / 100,
      0
    )
    return sum + canalFoundationExcavationReachTotal(data, reach) * Math.min(1, reachShare)
  }, 0) : 0
  return round3(excavation * Math.min(1, suitableShare) + foundationSuitable)
}

/**
 * Homogeneous-bank reuse is balanced automatically: suitable canal excavation
 * is consumed first, explicit dump-area shares next, and borrow soil fills the
 * remainder. Zoned allocations remain user-controlled because suitability is
 * different for impervious hearting and casing.
 */
export function canalEffectiveBankAllocations(
  data: CanalData,
  zone: CanalBankMaterialZone
): CanalBankMaterialAllocation[] {
  const rows = (data.design.bankMaterialAllocations ?? []).filter((row) => row.zone === zone)
  if (zone !== 'homogeneous') return rows
  const required = canalBankVolumeTotals(data).homogeneous
  const reusablePct = required > 0
    ? Math.min(100, canalSuitableBankExcavation(data) / required * 100)
    : 0
  const dumpPct = rows.filter((row) => row.source === 'dump-area').reduce((sum, row) => sum + row.percentage, 0)
  const borrowPct = Math.max(0, 100 - reusablePct - dumpPct)
  let canalApplied = false
  let borrowApplied = false
  return rows.map((row) => {
    if (row.source === 'canal-excavation') {
      const percentage = canalApplied ? 0 : reusablePct
      canalApplied = true
      return { ...row, percentage }
    }
    if (row.source === 'borrow-area') {
      const percentage = borrowApplied ? 0 : borrowPct
      borrowApplied = true
      return { ...row, percentage }
    }
    return row
  })
}

export function canalJungleClearanceTotal(data: CanalData): number {
  if (data.jungleClearanceMode === 'manual') {
    return round3(data.jungleClearanceRows.reduce(
      (sum, row) => sum + Math.max(0, row.length ?? 0) * Math.max(0, row.breadth ?? 0),
      0
    ))
  }
  const rows = orderedCanalSections(data).map((section) => {
    const ground = orderCanalPoints(section.ground)
    let width = 0
    if (ground.length >= 2) {
      if (data.mode === 'new') {
        width = Math.max(0, ground[ground.length - 1].offset - ground[0].offset)
      } else {
        for (let index = 1; index < ground.length; index += 1) {
          width += Math.hypot(
            ground[index].offset - ground[index - 1].offset,
            ground[index].rl - ground[index - 1].rl
          )
        }
      }
    }
    return { chainage: section.chainage, width }
  })
  let area = 0
  for (let index = 1; index < rows.length; index += 1) {
    const length = Math.max(0, rows[index].chainage - rows[index - 1].chainage)
    area += (rows[index - 1].width + rows[index].width) / 2 * length
  }
  return round3(area)
}

export interface CanalLaWidthRow {
  sectionId: string
  chainage: number
  designWidth: number
  acquisitionWidth: number
}

export function canalLaWidthRows(data: CanalData): CanalLaWidthRow[] {
  return orderedCanalSections(data).map((section) => {
    const profile = canalDesignProfile(data, section)
    const designWidth = profile.length >= 2 ? Math.max(0, profile.at(-1)!.offset - profile[0].offset) : 0
    return {
      sectionId: section.id,
      chainage: section.chainage,
      designWidth: round3(designWidth),
      acquisitionWidth: round3(designWidth + Math.max(0, data.laLeftMargin) + Math.max(0, data.laRightMargin))
    }
  })
}

/** Plan area acquired by mean width between consecutive cross-sections. */
export function canalLaArea(data: CanalData): number {
  const rows = canalLaWidthRows(data)
  let area = 0
  for (let index = 1; index < rows.length; index += 1) {
    area += (rows[index - 1].acquisitionWidth + rows[index].acquisitionWidth) / 2 * Math.max(0, rows[index].chainage - rows[index - 1].chainage)
  }
  return round3(area)
}

// ---------------------------------------------------------------------------
// Chapter 6 (new) / 5 (repair) — lining. A reach is a chainage range; numbers
// the user leaves blank fall back to the automatic defaults above, so adding a
// reach measures immediately and every field can stay untouched.
// ---------------------------------------------------------------------------

export function defaultCanalLiningBill(): Record<CanalLiningItemKey, boolean> {
  return {
    lining: true,
    modelWall: true,
    steps: true,
    sleepers: true,
    porousPlugs: true,
    masticJoints: true,
    tarfeltJoints: true
  }
}

export function defaultCanalLiningReach(fromChainage = 0, toChainage = fromChainage): CanalLiningReach {
  return {
    id: newId(),
    fromChainage: Math.min(fromChainage, toChainage),
    toChainage: Math.max(fromChainage, toChainage),
    provide: true,
    thicknessMm: null,
    liningFb: null,
    copingWidthM: null,
    panelLengthM: null,
    modelWallIntervalM: null,
    stepsIntervalM: null,
    plugSlopeSpacingSqm: null,
    plugBedSpacingSqm: null,
    bill: defaultCanalLiningBill(),
    itemOverrides: {}
  }
}

/** Resolved values (blank fields replaced) plus measured lining quantities. */
export interface CanalLiningReachQuantities {
  id: string
  fromChainage: number
  toChainage: number
  length: number
  sectionCount: number
  bedWidth: number
  fullSupplyDepth: number
  freeBoard: number
  sideSlope: number
  discharge: number
  liningFb: number
  copingWidth: number
  thicknessM: number
  panelLengthM: number
  modelWallIntervalM: number
  stepsIntervalM: number
  plugSlopeSpacingSqm: number
  plugBedSpacingSqm: number
  /** One-bank slope length up to the lining top (m). */
  slopeLength: number
  /** Wetted perimeter up to the lining top, B + 2 × slopeLength (m). */
  perimeter: number
  /** Both slopes plus both copings, the measured lining width on slopes (m). */
  slopeWidth: number
  liningBedArea: number
  liningSlopeArea: number
  modelWallCount: number
  modelWallVolume: number
  soffitVolume: number
  stepsCount: number
  stepsVolume: number
  sleepersVolume: number
  plugsSlope: number
  plugsBed: number
  longitudinalJoints: number
  masticLongitudinal: number
  masticTransverse: number
  tarfeltCount: number
  tarfeltLength: number
}

export interface CanalLiningTotals {
  reaches: number
  length: number
  liningBedArea: number
  liningSlopeArea: number
  modelWallVolume: number
  soffitVolume: number
  stepsVolume: number
  sleepersVolume: number
  plugsSlope: number
  plugsBed: number
  masticLongitudinal: number
  masticTransverse: number
  tarfeltLength: number
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** Positive input if present, else the documented automatic default. */
const positiveOrDefault = (value: number | null | undefined, fallback: number): number => {
  const numeric = finiteOrNull(value)
  return numeric != null && numeric > 0 ? numeric : fallback
}

/**
 * Measured lining quantities for one reach. Section geometry comes from
 * Chapter 1 (averaged across the reach by mean sectional area); everything
 * else is lining-specific and editable on the reach.
 */
export function canalLiningReachQuantities(data: CanalData, reach: CanalLiningReach): CanalLiningReachQuantities {
  const from = Math.min(reach.fromChainage, reach.toChainage)
  const to = Math.max(reach.fromChainage, reach.toChainage)
  const length = Math.max(0, to - from)
  const sections = orderedCanalSections(data).filter(
    (section) => section.chainage >= from - 1e-9 && section.chainage <= to + 1e-9
  )
  const midDesign = canalDesignAtChainage(data.design, (from + to) / 2)
  const rows = sections.length >= 2
    ? sections.slice(1).map((section, index) => ({
        length: Math.max(0, section.chainage - sections[index].chainage),
        design: canalDesignAtChainage(data.design, (section.chainage + sections[index].chainage) / 2)
      }))
    : [{ length, design: midDesign }]
  const rowLength = rows.reduce((sum, row) => sum + row.length, 0)
  const weighted = (pick: (design: CanalDesign) => number): number =>
    rowLength > 0 ? rows.reduce((sum, row) => sum + pick(row.design) * row.length, 0) / rowLength : pick(midDesign)

  const bedWidth = weighted((design) => design.bedWidth)
  const fullSupplyDepth = weighted((design) => design.fullSupplyDepth)
  const freeBoard = weighted((design) => design.freeBoard)
  const sideSlope = weighted((design) => Math.max(0.01, design.sideSlope))
  const discharge = midDesign.discharge

  const liningFbValue = finiteOrNull(reach.liningFb)
  const liningFb = liningFbValue != null ? Math.max(0, liningFbValue) : freeBoard
  const copingValue = finiteOrNull(reach.copingWidthM)
  const copingWidth = copingValue != null ? Math.max(0, copingValue) : canalCopingWidthForDischarge(discharge)
  const thicknessM = positiveOrDefault(reach.thicknessMm, CANAL_LINING_DEFAULT_THICKNESS_MM) / 1000
  const panelLengthM = positiveOrDefault(reach.panelLengthM, CANAL_LINING_DEFAULT_PANEL_M)
  const modelWallIntervalM = positiveOrDefault(reach.modelWallIntervalM, CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M)
  const stepsIntervalM = positiveOrDefault(reach.stepsIntervalM, CANAL_LINING_DEFAULT_STEPS_INTERVAL_M)
  const plugSlopeSpacingSqm = positiveOrDefault(reach.plugSlopeSpacingSqm, CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM)
  const plugBedSpacingSqm = positiveOrDefault(reach.plugBedSpacingSqm, CANAL_LINING_DEFAULT_PLUG_BED_SQM)

  const slopeLength = Math.sqrt(1 + sideSlope * sideSlope) * (fullSupplyDepth + liningFb)
  const perimeter = bedWidth + 2 * slopeLength
  const slopeWidth = 2 * slopeLength + 2 * copingWidth
  const liningBedArea = round3(bedWidth * length)
  const liningSlopeArea = round3(slopeWidth * length)
  const modelWallCount = length > 0 ? Math.floor(length / modelWallIntervalM) + 2 : 0
  const modelWallVolume = round3(
    modelWallCount * slopeWidth * CANAL_LINING_MODEL_WALL_WIDTH_M * CANAL_LINING_MODEL_WALL_DEPTH_M
  )
  const stepsCount = length > 0 ? Math.ceil(length / stepsIntervalM) : 0
  const soffitVolume = round3(stepsCount * slopeLength * CANAL_LINING_STEPS_WIDTH_M * CANAL_LINING_SOFFIT_THICKNESS_M)
  const stepsVolume = round3(stepsCount * slopeLength * CANAL_LINING_STEPS_WIDTH_M * CANAL_LINING_STEPS_DEPTH_M)
  const sleepersVolume = round3(
    CANAL_LINING_SLEEPER_ROWS * length * CANAL_LINING_SLEEPER_WIDTH_M * CANAL_LINING_SLEEPER_DEPTH_M
  )
  const plugsSlope = Math.round(2 * slopeLength * length / plugSlopeSpacingSqm)
  const plugsBed = Math.round(liningBedArea / plugBedSpacingSqm)
  const longitudinalJoints = length > 0
    ? Math.max(1, Math.ceil(perimeter / CANAL_LINING_LONGITUDINAL_PANEL_WIDTH_M) - 1)
    : 0
  const masticLongitudinal = round3(longitudinalJoints * length)
  const masticTransverse = round3((length > 0 ? Math.ceil(length / panelLengthM) : 0) * perimeter)
  const tarfeltCount = modelWallCount
  const tarfeltLength = round3(tarfeltCount * perimeter)

  return {
    id: reach.id,
    fromChainage: from,
    toChainage: to,
    length: round3(length),
    sectionCount: sections.length,
    bedWidth,
    fullSupplyDepth,
    freeBoard,
    sideSlope,
    discharge,
    liningFb,
    copingWidth,
    thicknessM,
    panelLengthM,
    modelWallIntervalM,
    stepsIntervalM,
    plugSlopeSpacingSqm,
    plugBedSpacingSqm,
    slopeLength,
    perimeter,
    slopeWidth,
    liningBedArea,
    liningSlopeArea,
    modelWallCount,
    modelWallVolume,
    soffitVolume,
    stepsCount,
    stepsVolume,
    sleepersVolume,
    plugsSlope,
    plugsBed,
    longitudinalJoints,
    masticLongitudinal,
    masticTransverse,
    tarfeltCount,
    tarfeltLength
  }
}

/** Totals across every reach that is provided. */
export function canalLiningTotals(data: CanalData): CanalLiningTotals {
  const totals: CanalLiningTotals = {
    reaches: 0,
    length: 0,
    liningBedArea: 0,
    liningSlopeArea: 0,
    modelWallVolume: 0,
    soffitVolume: 0,
    stepsVolume: 0,
    sleepersVolume: 0,
    plugsSlope: 0,
    plugsBed: 0,
    masticLongitudinal: 0,
    masticTransverse: 0,
    tarfeltLength: 0
  }
  for (const reach of data.liningReaches ?? []) {
    if (!reach.provide) continue
    const quantities = canalLiningReachQuantities(data, reach)
    if (!(quantities.length > 0)) continue
    totals.reaches += 1
    totals.length += quantities.length
    totals.liningBedArea += quantities.liningBedArea
    totals.liningSlopeArea += quantities.liningSlopeArea
    totals.modelWallVolume += quantities.modelWallVolume
    totals.soffitVolume += quantities.soffitVolume
    totals.stepsVolume += quantities.stepsVolume
    totals.sleepersVolume += quantities.sleepersVolume
    totals.plugsSlope += quantities.plugsSlope
    totals.plugsBed += quantities.plugsBed
    totals.masticLongitudinal += quantities.masticLongitudinal
    totals.masticTransverse += quantities.masticTransverse
    totals.tarfeltLength += quantities.tarfeltLength
  }
  return {
    ...totals,
    length: round3(totals.length),
    liningBedArea: round3(totals.liningBedArea),
    liningSlopeArea: round3(totals.liningSlopeArea),
    modelWallVolume: round3(totals.modelWallVolume),
    soffitVolume: round3(totals.soffitVolume),
    stepsVolume: round3(totals.stepsVolume),
    sleepersVolume: round3(totals.sleepersVolume),
    masticLongitudinal: round3(totals.masticLongitudinal),
    masticTransverse: round3(totals.masticTransverse),
    tarfeltLength: round3(totals.tarfeltLength)
  }
}

/**
 * Write computed quantities into ordinary item children. Jungle, earthwork,
 * bank fill and lining chapters all feed the estimate through it.
 * Foundation treatment, toe/bed drains and road pavement sync by code, bund-style.
 */
export function syncCanalItems(root: ProjectNode, componentId: string): ProjectNode {
  // Item sync. One generated item per distinct (role, code) in use; each
  // carries its grand-total quantity via `computedQuantity` (no
  // spreadsheet). The DATA/rate resolves from the item code, so totals,
  // seigniorage, and prints work unchanged.
  interface CanalRequiredItem {
    role: CanalItemRole
    ref: TemplateMaterialRef
    quantity: number
  }
  // Default SSR code per lining operation. A reach-level item override
  // replaces the default for that operation; keep in step with the lining
  // chapter's ITEM_META.
  const LINING_DEFAULT_CODES: Record<CanalLiningItemKey, string> = {
    lining: CANAL_LINING_CODE,
    modelWall: CANAL_LINING_MODEL_WALL_CODE,
    steps: CANAL_LINING_MODEL_WALL_CODE,
    sleepers: CANAL_LINING_MODEL_WALL_CODE,
    porousPlugs: CANAL_LINING_PLUG_CODE,
    masticJoints: CANAL_LINING_MASTIC_JOINT_CODE,
    tarfeltJoints: CANAL_LINING_TARFELT_JOINT_CODE
  }
  const requiredKey = (role: CanalItemRole, ref: TemplateMaterialRef): string => {
    const variant = ref.dataVariant ? `${ref.dataVariant.key}:${ref.dataVariant.addonId ?? ''}` : ''
    // One SSR code billed at one rate is one estimate line, however many
    // reaches or chapters it came from. Banking stays split by role (the
    // zoned-roles equivalent): zones must never merge into each other.
    if (role === 'banking') return `${role}::${ref.code}::${variant}`
    return `${ref.code}::${variant}`
  }
  const pushRequired = (out: CanalRequiredItem[], role: CanalItemRole, ref: TemplateMaterialRef | null | undefined, quantity: number): void => {
    if (!ref || !ref.code || !(quantity > 0)) return
    out.push({ role, ref, quantity: round3(quantity) })
  }
  const requiredSources = (canal: CanalData): CanalRequiredItem[] => {
    const out: CanalRequiredItem[] = []
    // Jungle clearance.
    pushRequired(out, 'clearance', canal.jungleClearanceMaterial ?? { code: CANAL_JUNGLE_CLEARANCE_CODE }, canalJungleClearanceTotal(canal))
    // Canal cut, classified by soil/rock bands. In repair mode the same
    // bands classify stripping (the Earthwork chapter measures them
    // together there).
    const totals = canalEarthworkTotals(canal)
    const cutBase = totals.excavation + (canal.mode === 'repair' ? totals.stripping : 0)
    for (const band of canal.excavationBands ?? []) {
      pushRequired(out, 'excavation', band.material, cutBase * Math.max(0, band.pct) / 100)
    }
    // Bank-foundation excavation and stripping reaches, each classified by
    // its own bands.
    for (const reach of canal.foundationExcavationReaches ?? []) {
      const reachTotal = reach.kind === 'stripping'
        ? canalStrippingReachTotal(canal, reach)
        : canalFoundationExcavationReachTotal(canal, reach)
      for (const band of reach.bands ?? []) {
        pushRequired(out, 'excavation', band.material, reachTotal * Math.max(0, band.pct) / 100)
      }
    }
    // Hearting cut-off trench excavation (zero unless a zoned trench is on).
    if (canal.mode === 'new') {
      for (const band of canal.trenchExcavationBands ?? []) {
        pushRequired(out, 'excavation', band.material, totals.cutoffTrench * Math.max(0, band.pct) / 100)
      }
    }
    // Bank fill, split into the active zones and allocated to sources. The
    // homogeneous shares are already auto-balanced against suitable canal
    // excavation, matching the Bank Design chapter.
    const volumes = canalBankVolumeTotals(canal)
    const zones: CanalBankMaterialZone[] = canal.design.bankSectionType === 'zoned'
      ? ['hearting', 'casing']
      : ['homogeneous']
    for (const zone of zones) {
      const zoneVolume = volumes[zone]
      // Repair banks bill the PMW repair items, never the CAW new-work
      // options: homogeneous formation excludes compaction (3-17) and its
      // compaction bills separately (3-18), while hearting and casing
      // already include compaction (3-8, 3-9).
      if (canal.mode === 'repair') {
        for (const repairItem of canalBankRepairItems(canal).filter((entry) => entry.zone === zone)) {
          pushRequired(out, 'banking', { code: repairItem.code }, repairItem.quantity)
        }
        continue
      }
      for (const allocation of canalEffectiveBankAllocations(canal, zone)) {
        const option = canalBankItemForAllocation(allocation)
        if (!option) continue
        pushRequired(out, 'banking', { code: option.code }, zoneVolume * Math.max(0, allocation.percentage) / 100)
      }
    }
    // Lining operations, per provided reach. Operations sharing a resolved
    // code merge into one item further down.
    for (const reach of canal.liningReaches ?? []) {
      if (!reach.provide) continue
      const measured = canalLiningReachQuantities(canal, reach)
      const refFor = (key: CanalLiningItemKey): TemplateMaterialRef =>
        reach.itemOverrides?.[key] ?? { code: LINING_DEFAULT_CODES[key] }
      const bill = reach.bill ?? defaultCanalLiningBill()
      if (bill.lining) pushRequired(out, 'lining', refFor('lining'), measured.liningBedArea + measured.liningSlopeArea)
      if (bill.modelWall) pushRequired(out, 'lining', refFor('modelWall'), measured.modelWallVolume + measured.soffitVolume)
      if (bill.steps) pushRequired(out, 'lining', refFor('steps'), measured.stepsVolume)
      if (bill.sleepers) pushRequired(out, 'lining', refFor('sleepers'), measured.sleepersVolume)
      if (bill.porousPlugs) pushRequired(out, 'lining', refFor('porousPlugs'), measured.plugsSlope + measured.plugsBed)
      if (bill.masticJoints) pushRequired(out, 'lining', refFor('masticJoints'), measured.masticLongitudinal + measured.masticTransverse)
      if (bill.tarfeltJoints) pushRequired(out, 'lining', refFor('tarfeltJoints'), measured.tarfeltLength)
    }
    // Foundation treatment reaches, each billed under its own SSR code.
    for (const reach of canal.foundationFillReaches ?? []) {
      const role: CanalItemRole =
        reach.kind === '5-4' || reach.kind === '5-5' ? 'sand-blanket'
        : reach.kind === '5-7' ? 'filter'
        : reach.kind === '5-10' ? 'rock-toe'
        : 'foundation'
      pushRequired(out, role, reach.material, canalFoundationFillQuantity(canal, reach).quantity)
    }
    // Toe, bed and filter drains, each billed under its own SSR code.
    for (const reach of canal.filterDrainReaches ?? []) {
      const role: CanalItemRole =
        reach.kind === '5-6' || reach.kind === '5-11' ? 'rock-toe' : 'filter'
      pushRequired(out, role, reach.material, canalFilterDrainQuantity(canal, reach).quantity)
    }
    // Road pavement. Formation already bills inside Bank Design (the Roads
    // chapter states it must not bill again here), so only hard metal and
    // blindage are new — and only for metalled roads. The blindage default
    // is a pick-me placeholder, not a code: it bills once a catalogue item
    // is chosen.
    for (const reach of canal.design.serviceRoadReaches ?? []) {
      if (reach.constructionType !== 'traditional-metal') continue
      const measuredRoad = canalServiceRoadQuantities(canal, reach)
      pushRequired(out, 'road-metal', reach.hardMetalItem ?? { code: reach.hardMetalCode }, measuredRoad.hardMetalVolume)
      pushRequired(out, 'road-blindage', reach.blindageItem ?? null, measuredRoad.blindageArea)
    }
    return out
  }
  const requiredItems = (canal: CanalData): CanalRequiredItem[] => {
    const combined = new Map<string, CanalRequiredItem>()
    for (const item of requiredSources(canal)) {
      const key = requiredKey(item.role, item.ref)
      const existing = combined.get(key)
      combined.set(key, existing
        ? { ...existing, quantity: round3(existing.quantity + item.quantity) }
        : item)
    }
    return [...combined.values()]
  }
  const component = findNode(root, componentId)
  const data = component?.canal
  if (!component || !data) return root
  const required = requiredItems(data)
  const registry = data.materialItems ?? []
  if (required.length === 0 && registry.length === 0) {
    const hasOrphans = (component.children ?? []).some((child) =>
      child.kind === 'item' && child.templateGenerated && child.templateOwnerId === componentId)
    if (!hasOrphans) return root
  }
  let next = root
  const nextRegistry: CanalMaterialItem[] = []
  const usedKeys = new Set<string>()
  for (const req of required) {
    const key = requiredKey(req.role, req.ref)
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    const existingNode = registry.find((m) => m.role === req.role && m.code === req.ref.code)
    const prior = existingNode ? findNode(next, existingNode.itemNodeId) : null
    // A bare ref must never overwrite metadata a resolved one already
    // wrote: losing categoryKey makes the recipe panel report a perfectly
    // ordinary SSR item as custom.
    const keep = <T,>(incoming: T | undefined, held: T | undefined): T | undefined =>
      incoming ?? held
    const patch = {
      name: req.ref.code,
      itemSource: keep(req.ref.side, prior?.itemSource),
      itemCode: req.ref.code,
      itemDescription: keep(req.ref.description, prior?.itemDescription),
      itemEditorType: 'spreadsheet' as const,
      unit: keep(req.ref.unit ?? undefined, prior?.unit ?? undefined),
      categoryKey: keep(req.ref.categoryKey, prior?.categoryKey),
      dataVariant: keep(req.ref.dataVariant, prior?.dataVariant),
      sorCatalogue: keep(req.ref.sorCatalogue, prior?.sorCatalogue),
      computedQuantity: req.quantity,
      spreadsheet: undefined,
      finalCell: undefined,
      templateGenerated: true,
      templateOwnerId: componentId,
      templateItemRole: req.role
    }
    if (existingNode && findNode(next, existingNode.itemNodeId)) {
      next = patchNode(next, existingNode.itemNodeId, patch)
      nextRegistry.push(existingNode)
    } else {
      const item = createNode('item', req.ref.code, patch)
      const parent = findNode(next, componentId)
      if (!parent) continue
      next = patchNode(next, componentId, { children: [...parent.children, item] })
      nextRegistry.push({ role: req.role, code: req.ref.code, itemNodeId: item.id })
    }
  }
  // Drop every generated item this component owns that the new registry
  // does not claim. Sweeping by ownership (not the old registry) repairs
  // orphaned items from earlier snapshots instead of accumulating them.
  const claimed = new Set(nextRegistry.map((entry) => entry.itemNodeId))
  const synced = findNode(next, componentId)
  for (const child of synced?.children ?? []) {
    if (child.kind === 'item' && child.templateGenerated && child.templateOwnerId === componentId && !claimed.has(child.id)) {
      next = removeNode(next, child.id)
    }
  }
  return patchNode(next, componentId, { canal: { ...data, materialItems: nextRegistry } })
}
