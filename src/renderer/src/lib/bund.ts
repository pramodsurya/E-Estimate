// Bund component template: cross-section areas per chainage, Mean Sectional
// Area quantities, and the sync that writes computed measurement into ordinary
// item children (so totals and every print keep working).
//
// Both reference estimates this was built from reduce to the same engine:
//   area per chainage → mean area with the previous chainage → × length
// A "new" bund derives its area from design parameters; a restoration derives
// it from surveyed level tables. Only the area step differs.

import type {
  BundBerm,
  BundBermSide,
  BundData,
  BundDesign,
  BundExcavationBands,
  BundExcavationRole,
  BundFillBasis,
  BundHeartingTrench,
  BundItemRole,
  BundMaterialItem,
  BundPoint,
  BundSection,
  BundSoilBand,
  BundToe,
  ItemSource,
  ProjectNode,
  TemplateMaterialRef
} from '../types/project'
import { createNode, findNode, newId, patchNode, removeNode } from './tree'

/** One chain = 30 m, the convention in the Sangareddy-style survey sheets. */
export const BUND_CHAIN_M = 30

export const BUND_DEFAULT_CLEARANCE_CODE = 'IRR-PMW-1-2'
export const BUND_DEFAULT_STRIPPING_CODE = 'IRR-CAW-1-1'
/** Central excavation classifications used by the completed tank estimate. */
export const BUND_EXC_ALL_SOILS_CODE = 'IRR-DAW-1-1'
export const BUND_EXC_HDR_CODE = 'IRR-DAW-1-2'
export const BUND_EXC_FF_CODE = 'IRR-DAW-1-3'
export const BUND_EXC_HR_CODE = 'IRR-DAW-1-5'
/** Canal/seating/filter-drain excavation classes (not structural foundations). */
export const BUND_CHANNEL_EXC_ALL_SOILS_CODE = 'IRR-CAW-1-1'
export const BUND_CHANNEL_EXC_HDR_CODE = 'IRR-CAW-1-4'
export const BUND_CHANNEL_EXC_FF_CODE = 'IRR-CAW-1-6'
export const BUND_CHANNEL_EXC_HR_CODE = 'IRR-CAW-1-7'
/** Combined billing: formation and compaction in one item. */
export const BUND_DEFAULT_FORMATION_CODE = 'IRR-DAW-5-6'
/** Split billing: formation without compaction, then rolling. */
export const BUND_SPLIT_FORMATION_CODE = 'IRR-PMW-3-17'
export const BUND_SPLIT_ROLLING_CODE = 'IRR-PMW-3-18'
/** Full zoned-embankment SSR items; each includes placement, watering and compaction. */
export const BUND_ZONED_DAW_HEARTING_CODE = 'IRR-DAW-5-1'
export const BUND_ZONED_DAW_CASING_CODE = 'IRR-DAW-5-3'
export const BUND_ZONED_PMW_BORROW_HEARTING_CODE = 'IRR-PMW-3-8'
export const BUND_ZONED_PMW_BORROW_CASING_CODE = 'IRR-PMW-3-9'
export const BUND_ZONED_PMW_DUMP_HEARTING_CODE = 'IRR-PMW-3-10'
export const BUND_ZONED_PMW_DUMP_CASING_CODE = 'IRR-PMW-3-11'
/**
 * Cut-off trench backfill under the hearting. The SSR carries this apart from
 * the hearting embankment item beside it (IRR-DAW-5-1): the trench is filled in
 * a confined cut rather than in open embankment layers, so it is rated and
 * measured on its own.
 */
export const BUND_HEARTING_TRENCH_FILL_CODE = 'IRR-DAW-5-2'
/** Optional surface/protection items (all in the IRR-CAW chapter). */
export const BUND_DEFAULT_TURFING_CODE = 'IRR-CAW-8-15'
/** 450 mm dry-rubble pitching without pin headers; matches the reference bund item. */
export const BUND_DEFAULT_PITCHING_CODE = 'IRR-CAW-8-8'
/**
 * Optional, design-specific clean-sand filter below revetment. This is not the
 * 150 mm granular backing shown in the standard tank-bund revetment detail.
 */
export const BUND_DEFAULT_PITCHING_BEDDING_CODE = 'IRR-DAW-6-7'
export const BUND_DEFAULT_ROCKTOE_CODE = 'IRR-CAW-5-6'
/** Graded filter layers below and behind the downstream rubble rock toe. */
export const BUND_DEFAULT_ROCKTOE_FILTER_CODE = 'IRR-CAW-5-11'
/** Horizontal drainage blanket: sand blanket below embankment, CUM. */
export const BUND_DEFAULT_HFILTER_CODE = 'IRR-CAW-5-5'
/** Vertical (chimney) filter: 45 cm sand chimney satisfying filter criteria, CUM. */
export const BUND_DEFAULT_VFILTER_CODE = 'IRR-DAW-6-8'
/** CAW-5-11 total filter thickness behind the inner rock-toe face. */
export const BUND_ROCKTOE_FILTER_BEHIND_M = 0.5
/** CAW-5-11 total filter thickness below the rock-toe base. */
export const BUND_ROCKTOE_FILTER_BELOW_M = 1
/** Toe elements: trench excavation and separately billed construction/protection. */
export const BUND_DEFAULT_TOE_EXC_CODE = BUND_CHANNEL_EXC_ALL_SOILS_CODE
/** Structural foundation excavation below the u/s anchorage and rock toe. */
export const BUND_DEFAULT_FOUNDATION_EXC_CODE = BUND_EXC_ALL_SOILS_CODE
/**
 * Default rigid anchorage below the u/s pitching: M15 plain concrete using
 * 40 mm down aggregate, measured in CUM. The approved drawing may instead
 * require masonry or a project-specific rock-filled anchor.
 */
export const BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE = 'IRR-DAW-2-11'
/** Alternative rigid u/s toe wall: UCR stone masonry in CM 1:4, measured in CUM. */
export const BUND_UPSTREAM_TOE_MASONRY_CODE = 'IRR-DAW-3-2'
/** 300 mm dry-rubble stone pitching, measured by protected surface area. */
export const BUND_DEFAULT_TOE_BUILD_CODE = 'IRR-CAW-8-6'
/** 100 mm M15 concrete lining over the toe-drain bed and sides, measured in CUM. */
export const BUND_DEFAULT_TOE_CC_CODE = 'IRR-CAW-7-15'
/** D/S chute drains: channel excavation and 100 mm M15 bed/side lining. */
export const BUND_DEFAULT_CHUTE_EXC_CODE = 'IRR-CAW-1-1'
export const BUND_DEFAULT_CHUTE_LINING_CODE = BUND_DEFAULT_TOE_CC_CODE
/** Mortar-set rubble pitching is safer for a water-carrying chute than dry pitching. */
export const BUND_DEFAULT_CHUTE_STONE_CODE = 'IRR-CAW-8-10'

// --- Berms ------------------------------------------------------------------
/** Minimum shelf width that still gives an inspection path (m). */
export const BUND_BERM_MIN_WIDTH = 2
/** Default shelf width — the usual 3 m inspection berm. */
export const BUND_DEFAULT_BERM_WIDTH = 3
/** Default vertical interval between berms on one face (m). */
export const BUND_DEFAULT_BERM_DROP = 6
/** Bund height above which practice expects a berm on the d/s face (m). */
export const BUND_BERM_HEIGHT_TRIGGER = 6
/** Default shelf cross-fall towards the berm drain, 1 in N. */
export const BUND_DEFAULT_BERM_CROSS_FALL = 40
/** Berm surfacing choices: grass, a murum/rubble blanket, or a CC path. */
export const BUND_DEFAULT_BERM_TURF_CODE = BUND_DEFAULT_TURFING_CODE
export const BUND_DEFAULT_BERM_MURUM_CODE = 'IRR-CAW-5-3'
export const BUND_DEFAULT_BERM_CC_CODE = 'IRR-CAW-7-12'
/** CAW-1-1 is the excavation item that names catch-water drains explicitly. */
export const BUND_DEFAULT_BERM_DRAIN_EXC_CODE = BUND_CHANNEL_EXC_ALL_SOILS_CODE
/** Berm catch-water drain protection: 100 mm M15 lining, or dry rubble. */
export const BUND_DEFAULT_BERM_DRAIN_LINING_CODE = BUND_DEFAULT_TOE_CC_CODE
export const BUND_DEFAULT_BERM_DRAIN_STONE_CODE = 'IRR-CAW-8-6'

export function defaultBundExcavationRows(
  allSoilsMaterial?: TemplateMaterialRef,
  family: 'foundation' | 'channel' = 'foundation'
): BundSoilBand[] {
  const channel = family === 'channel'
  return [
    {
      id: newId(),
      label: 'All Soils',
      pct: 100,
      material:
        allSoilsMaterial ?? {
          code: channel ? BUND_CHANNEL_EXC_ALL_SOILS_CODE : BUND_EXC_ALL_SOILS_CODE
        }
    },
    {
      id: newId(),
      label: 'HDR',
      pct: 0,
      material: { code: channel ? BUND_CHANNEL_EXC_HDR_CODE : BUND_EXC_HDR_CODE }
    },
    {
      id: newId(),
      label: 'F&F',
      pct: 0,
      material: { code: channel ? BUND_CHANNEL_EXC_FF_CODE : BUND_EXC_FF_CODE }
    },
    {
      id: newId(),
      label: 'HR',
      pct: 0,
      material: { code: channel ? BUND_CHANNEL_EXC_HR_CODE : BUND_EXC_HR_CODE }
    }
  ]
}

export function defaultBundExcavationBands(): BundExcavationBands {
  return {
    stripping: defaultBundExcavationRows(undefined, 'channel'),
    'ustoe-exc': defaultBundExcavationRows(),
    'dstoe-exc': defaultBundExcavationRows(undefined, 'channel'),
    'rocktoe-exc': defaultBundExcavationRows(),
    'chute-exc': defaultBundExcavationRows(undefined, 'channel'),
    'berm-drain-exc': defaultBundExcavationRows(undefined, 'channel'),
    // The cut-off trench is a structural foundation cut, not a channel one.
    'hearting-trench-exc': defaultBundExcavationRows()
  }
}

function normalizeChannelExcavationRows(rows: BundSoilBand[]): BundSoilBand[] {
  if (!rows.length) return defaultBundExcavationRows(undefined, 'channel')
  const normalizedLabel = (label: string): string =>
    label.toLowerCase().replaceAll(' ', '').replaceAll('&', '')
  const correctCodeByLabel: Record<string, string> = {
    allsoils: BUND_CHANNEL_EXC_ALL_SOILS_CODE,
    allsoil: BUND_CHANNEL_EXC_ALL_SOILS_CODE,
    hdr: BUND_CHANNEL_EXC_HDR_CODE,
    ff: BUND_CHANNEL_EXC_FF_CODE,
    hr: BUND_CHANNEL_EXC_HR_CODE
  }
  if (
    rows.length >= 4 &&
    rows.every((row) => {
      const expected = correctCodeByLabel[normalizedLabel(row.label)]
      return !expected || row.material.code === expected
    })
  ) {
    return rows
  }
  const recognized = new Set(['allsoils', 'allsoil', 'hdr', 'ff', 'hr', 'rock'])
  if (!rows.every((row) => recognized.has(normalizedLabel(row.label)))) return rows
  const upgradeableCodes = new Set([
    BUND_EXC_ALL_SOILS_CODE,
    BUND_EXC_HDR_CODE,
    BUND_EXC_FF_CODE,
    BUND_EXC_HR_CODE,
    BUND_CHANNEL_EXC_ALL_SOILS_CODE,
    BUND_CHANNEL_EXC_HDR_CODE,
    BUND_CHANNEL_EXC_FF_CODE,
    BUND_CHANNEL_EXC_HR_CODE,
    BUND_DEFAULT_STRIPPING_CODE,
    'IRR-CAW-1-2'
  ])
  if (!rows.every((row) => upgradeableCodes.has(row.material.code))) return rows
  const rockRow = rows.find((row) => normalizedLabel(row.label) === 'rock')
  // A positive generic "Rock" share is ambiguous; retain it for the user to
  // classify. The old two-row default used Rock = 0 and can be upgraded safely.
  if ((rockRow?.pct ?? 0) > 0) return rows
  const pctFor = (...labels: string[]): number =>
    rows.find((row) => labels.includes(normalizedLabel(row.label)))?.pct ?? 0
  const upgraded = defaultBundExcavationRows(undefined, 'channel')
  upgraded[0].pct = pctFor('allsoils', 'allsoil')
  upgraded[1].pct = pctFor('hdr')
  upgraded[2].pct = pctFor('ff')
  upgraded[3].pct = pctFor('hr')
  return upgraded
}

/** Upgrade the four standard foundation classes without overwriting custom rows/codes. */
function normalizeFoundationExcavationRows(rows: BundSoilBand[]): BundSoilBand[] {
  if (!rows.length) return defaultBundExcavationRows()
  const normalizedLabel = (label: string): string =>
    label.toLowerCase().replaceAll(' ', '').replaceAll('&', '')
  const correctCodeByLabel: Record<string, string> = {
    allsoils: BUND_EXC_ALL_SOILS_CODE,
    allsoil: BUND_EXC_ALL_SOILS_CODE,
    hdr: BUND_EXC_HDR_CODE,
    ff: BUND_EXC_FF_CODE,
    hr: BUND_EXC_HR_CODE
  }
  if (
    rows.length >= 4 &&
    rows.every((row) => {
      const expected = correctCodeByLabel[normalizedLabel(row.label)]
      return !expected || row.material.code === expected
    })
  ) {
    return rows
  }
  const recognized = new Set(['allsoils', 'allsoil', 'hdr', 'ff', 'hr', 'rock'])
  if (!rows.every((row) => recognized.has(normalizedLabel(row.label)))) return rows
  const upgradeableCodes = new Set([
    BUND_EXC_ALL_SOILS_CODE,
    BUND_EXC_HDR_CODE,
    BUND_EXC_FF_CODE,
    BUND_EXC_HR_CODE,
    BUND_CHANNEL_EXC_ALL_SOILS_CODE,
    BUND_CHANNEL_EXC_HDR_CODE,
    BUND_CHANNEL_EXC_FF_CODE,
    BUND_CHANNEL_EXC_HR_CODE,
    BUND_DEFAULT_STRIPPING_CODE,
    'IRR-CAW-1-2'
  ])
  if (!rows.every((row) => upgradeableCodes.has(row.material.code))) return rows
  const rockRow = rows.find((row) => normalizedLabel(row.label) === 'rock')
  if ((rockRow?.pct ?? 0) > 0) return rows
  const pctFor = (...labels: string[]): number =>
    rows.find((row) => labels.includes(normalizedLabel(row.label)))?.pct ?? 0
  const upgraded = defaultBundExcavationRows()
  upgraded[0].pct = pctFor('allsoils', 'allsoil')
  upgraded[1].pct = pctFor('hdr')
  upgraded[2].pct = pctFor('ff')
  upgraded[3].pct = pctFor('hr')
  return upgraded
}

/**
 * Switch the cut below the embankment between the CAW seating family and the
 * DAW foundation family, carrying every band's percentage across and leaving
 * any code the user chose himself alone. `fillBasis` follows: a foundation cut
 * starts the fill at the excavated surface, seating at existing ground.
 */
export function withStrippingExcavationFamily(
  data: BundData,
  next: BundData['strippingExcavationFamily']
): Partial<BundData> {
  const current =
    data.excavationBands?.stripping ??
    defaultBundExcavationRows(
      undefined,
      data.strippingExcavationFamily === 'foundation' ? 'foundation' : 'channel'
    )
  const seatingDefaults = defaultBundExcavationRows(undefined, 'channel')
  const foundationDefaults = defaultBundExcavationRows(undefined, 'foundation')
  const knownDefaultCodes = new Set(
    [...seatingDefaults, ...foundationDefaults].map((band) => band.material.code)
  )
  const key = (label: string): string =>
    label.toLowerCase().replaceAll(' ', '').replaceAll('&', '')
  const defaultByLabel = new Map(
    (next === 'foundation' ? foundationDefaults : seatingDefaults).map((band) => [
      key(band.label),
      band.material
    ])
  )
  const bands = current.map((band) => {
    const replacement = defaultByLabel.get(key(band.label))
    return replacement && knownDefaultCodes.has(band.material.code)
      ? { ...band, material: replacement }
      : band
  })
  return {
    strippingExcavationFamily: next,
    fillBasis: next === 'foundation' ? 'stripped' : 'existing',
    strippingMaterial: bands[0]?.material ?? data.strippingMaterial,
    excavationBands: { ...data.excavationBands, stripping: bands }
  }
}

/**
 * Cut-off trench, off until it is switched on. The dimensions are the ones a
 * small tank bund normally starts from: 1 m deep, 2 m wide at the bottom and
 * 1:1 sides, which a machine can cut and a roller can still compact inside.
 */
export function defaultBundHeartingTrench(): BundHeartingTrench {
  return {
    depth: 1,
    bottomWidth: 2,
    usSlope: 1,
    dsSlope: 1,
    fillMaterial: null,
    excavationMaterial: null
  }
}

/** A toe with no code attached (off) and sensible trench dimensions. */
export function defaultBundToe(dims: {
  topWidth: number
  bottomWidth: number
  depth: number
}): BundToe {
  return {
    excavationMaterial: null,
    topWidth: dims.topWidth,
    bottomWidth: dims.bottomWidth,
    depth: dims.depth,
    invertLevel: null,
    leftSlope: 1,
    rightSlope: 1,
    invertStartLevel: null,
    invertEndLevel: null,
    buildMaterial: null,
    buildArea: 0,
    liningThickness: 0
  }
}

// The "Detailed" tree row under a Bund component is a synthetic selection (not
// a real node): the component id with this suffix. WorkArea detects it and
// shows the bund design dashboard instead of a node editor.
const BUND_DETAIL_SUFFIX = '::bunddetail'

export function bundDetailId(componentId: string): string {
  return componentId + BUND_DETAIL_SUFFIX
}

export function parseBundDetailId(id: string | null | undefined): string | null {
  return id && id.endsWith(BUND_DETAIL_SUFFIX) ? id.slice(0, -BUND_DETAIL_SUFFIX.length) : null
}

export function defaultBundDesign(): BundDesign {
  // Repair-template defaults: 3 m crest, 1.5:1 u/s and 2:1 d/s slopes, with
  // 0.3 m of top-soil stripping. New-bund users can still apply the standard
  // tank-level sizing table from the design screen.
  return {
    topLevel: 100,
    mwl: null,
    ftl: null,
    deepBedLevel: null,
    freeBoard: null,
    topWidth: 3,
    usSlope: 1.5,
    dsSlope: 2,
    stripDepth: 0.3,
    berms: []
  }
}

/** A berm with no code attached (nothing billed) at the given face and RL. */
export function defaultBundBerm(side: BundBermSide, level: number): BundBerm {
  return {
    id: newId(),
    side,
    level: round3(level),
    width: BUND_DEFAULT_BERM_WIDTH,
    crossFall: BUND_DEFAULT_BERM_CROSS_FALL,
    slopeBelow: null,
    surfaceMaterial: null,
    surfaceThickness: 0.1,
    drainLiningMaterial: null,
    drainExcavationMaterial: null,
    drainWidth: 0.6,
    drainDepth: 0.3,
    drainLiningThickness: 0.1
  }
}

/**
 * Standard tank-bund crest width and free board for a given maximum water
 * depth, from the common design table (Table 26.1, "Common Dimensions of Tank
 * Bunds"). Top bund level is then FTL + free board.
 */
export function standardTankBundDims(maxWaterDepth: number): {
  freeBoard: number
  topWidth: number
} {
  if (maxWaterDepth > 6) return { freeBoard: 1.8, topWidth: 2.7 }
  if (maxWaterDepth > 4.5) return { freeBoard: 1.5, topWidth: 1.8 }
  if (maxWaterDepth > 3) return { freeBoard: 1.2, topWidth: 1.5 }
  return { freeBoard: 0.9, topWidth: 1.2 }
}

/**
 * Apply the standard table to a design: from FTL and the deepest bed level,
 * derive the crest width and set TBL = FTL + free board. Slopes and strip depth
 * are left untouched. Returns null if FTL or the bed level is missing.
 */
export function designedFromTankLevels(design: BundDesign): BundDesign | null {
  if (design.ftl == null || design.deepBedLevel == null) return null
  const depth = design.ftl - design.deepBedLevel
  if (!(depth > 0)) return null
  const { freeBoard, topWidth } = standardTankBundDims(depth)
  return { ...design, topLevel: round3(design.ftl + freeBoard), topWidth }
}

/**
 * TBL of a free-board design: the crest sits `freeBoard` above MWL, because the
 * bund is sized to keep the maximum flood out rather than to a typed crest RL.
 * Null while either level is still blank, so the last TBL stays in place.
 */
export function topLevelFromFreeBoard(
  design: Pick<BundDesign, 'mwl' | 'freeBoard'>
): number | null {
  if (design.mwl == null || design.freeBoard == null) return null
  return round3(design.mwl + design.freeBoard)
}

/**
 * True while a bund is designed from a free board rather than a typed TBL.
 * Every new bund is: nothing is standing yet, so the crest follows the flood
 * level. A repair keeps the crest RL it is being restored to.
 */
export function usesFreeBoardDesign(data: Pick<BundData, 'mode'>): boolean {
  return data.mode === 'new'
}

export interface BundZonedSsrCodePair {
  hearting: string
  casing: string
  category: 'IRR-DAW' | 'IRR-PMW'
}

/**
 * Dedicated combined-operation SSR pair for the selected zoned-work basis.
 *
 * New work and raising/strengthening use the DAW embankment pair. Only a
 * breached/damaged repair uses the PMW pair, split again by soil source.
 */
export function zonedSsrCodePair(
  data: Pick<BundData, 'mode' | 'zonedRepairKind' | 'zonedSoilSource'>
): BundZonedSsrCodePair {
  if (data.mode === 'new' || data.zonedRepairKind === 'raising') {
    return {
      hearting: BUND_ZONED_DAW_HEARTING_CODE,
      casing: BUND_ZONED_DAW_CASING_CODE,
      category: 'IRR-DAW'
    }
  }
  if (data.zonedSoilSource === 'dump') {
    return {
      hearting: BUND_ZONED_PMW_DUMP_HEARTING_CODE,
      casing: BUND_ZONED_PMW_DUMP_CASING_CODE,
      category: 'IRR-PMW'
    }
  }
  return {
    hearting: BUND_ZONED_PMW_BORROW_HEARTING_CODE,
    casing: BUND_ZONED_PMW_BORROW_CASING_CODE,
    category: 'IRR-PMW'
  }
}

export function defaultBundData(): BundData {
  return {
    configured: false,
    mode: 'restoration',
    embankmentType: 'homogeneous',
    zonedRepairKind: 'breached',
    zonedSoilSource: 'borrow',
    zonedSsrVersion: 1,
    source: 'map',
    alignment: [],
    lengthM: 0,
    chainageUnit: 'm',
    includePhreaticInPrint: false,
    sectionMode: 'continuous',
    intervalM: 30,
    breaks: [],
    datum: 0,
    design: defaultBundDesign(),
    heartingDesign: {
      topLevel: 100,
      topWidth: 1,
      usSlope: 0.5,
      dsSlope: 0.5,
      centerOffset: 0
    },
    heartingTrench: defaultBundHeartingTrench(),
    billing: 'combined',
    formationEnabled: true,
    compactionEnabled: true,
    earthworkOperationVersion: 2,
    fillBasis: 'existing',
    clearanceMaterial: { code: BUND_DEFAULT_CLEARANCE_CODE },
    clearanceMode: 'perimeter',
    clearanceManualRows: [],
    strippingMaterial: { code: BUND_DEFAULT_STRIPPING_CODE },
    formationMaterial: { code: BUND_DEFAULT_FORMATION_CODE },
    rollingMaterial: { code: BUND_SPLIT_ROLLING_CODE },
    heartingMaterial: { code: BUND_ZONED_PMW_BORROW_HEARTING_CODE },
    heartingRollingMaterial: { code: BUND_SPLIT_ROLLING_CODE },
    turfingMaterial: null,
    turfingThickness: 0.15,
    pitchingMaterial: null,
    pitchingThickness: 0.45,
    pitchingAsVolume: false,
    pitchingBeddingMaterial: null,
    pitchingBeddingThickness: 0.15,
    pitchingMetalEnabled: false,
    pitchingMetalMaterial: null,
    pitchingMetalThickness: 0.2,
    horizontalFilterMaterial: null,
    horizontalFilterLength: 6,
    horizontalFilterThickness: 0.6,
    verticalFilterMaterial: null,
    verticalFilterWidth: 0.45,
    verticalFilterHeight: 0,
    rockToeMaterial: null,
    rockToeFilterMaterial: null,
    rockToeTopWidth: 0,
    rockToeInnerSlope: 1,
    // Retained in saved data for backward compatibility. The exposed outer
    // face now follows the bund D/S slope so both lines remain continuous.
    rockToeOuterSlope: 2,
    // Retained for saved-project compatibility; the height is always entered.
    rockToeAutoHeight: false,
    rockToeHeight: 1.5,
    rockToeExcavationDepth: 0,
    rockToeExcavationMaterial: null,
    soilBands: [],
    excavationBands: defaultBundExcavationBands(),
    strippingExcavationFamily: 'seating',
    excavationClassificationVersion: 2,
    upstreamToe: defaultBundToe({ topWidth: 1.9, bottomWidth: 1.0, depth: 1.3 }),
    downstreamToe: defaultBundToe({ topWidth: 2.5, bottomWidth: 1.0, depth: 1.3 }),
    chuteDrainLiningMaterial: null,
    chuteDrainProtectionType: 'concrete',
    chuteDrainExcavationMaterial: null,
    chuteDrainUseSpacing: true,
    chuteDrainSpacing: 30,
    chuteDrainCount: 1,
    chuteDrainWidth: 0.6,
    chuteDrainDepth: 0.3,
    chuteDrainLiningThickness: 0.1,
    sameToeLevels: false,
    sections: [],
    materialItems: []
  }
}

/**
 * A free-board design saved before the field existed still has the TBL that was
 * typed then. Reading the free board back out of it keeps the crest exactly
 * where the estimate put it, instead of blanking the derived TBL.
 */
function migrateBundDesign(design: BundDesign, raw: BundData): BundDesign {
  if (!usesFreeBoardDesign(raw) || design.freeBoard != null) return design
  if (design.mwl == null) return design
  return { ...design, freeBoard: round3(design.topLevel - design.mwl) }
}

/**
 * Backfill fields added after a project was saved, so older `.eestimate` files
 * (and bunds made before turfing/pitching/rock-toe/soil-split/clearance-mode
 * existed) open without crashing on a missing array or number.
 */
export function migrateBundData(raw: BundData): BundData {
  const d = defaultBundData()
  const includePhreaticInPrint = raw.includePhreaticInPrint ?? d.includePhreaticInPrint
  const zoned = raw.embankmentType === 'zoned'
  const formationEnabled = zoned ? true : raw.formationEnabled ?? true
  const compactionEnabled = zoned ? true : raw.compactionEnabled ?? true
  const zonedRepairKind = raw.zonedRepairKind ?? d.zonedRepairKind
  const zonedSoilSource = raw.zonedSoilSource ?? d.zonedSoilSource
  const zonedCodes = zonedSsrCodePair({
    mode: raw.mode,
    zonedRepairKind,
    zonedSoilSource
  })
  const formerHomogeneousCodes = new Set([
    BUND_DEFAULT_FORMATION_CODE,
    BUND_SPLIT_FORMATION_CODE,
    BUND_SPLIT_ROLLING_CODE
  ])
  const migrateZonedCasing =
    zoned &&
    (!raw.formationMaterial ||
      formerHomogeneousCodes.has(raw.formationMaterial.code))
  const migrateZonedHearting =
    zoned &&
    (!raw.heartingMaterial ||
      formerHomogeneousCodes.has(raw.heartingMaterial.code))
  const legacyEarthwork = raw.earthworkOperationVersion !== 2
  const knownFormationCode = [
    BUND_DEFAULT_FORMATION_CODE,
    BUND_SPLIT_FORMATION_CODE
  ].includes(raw.formationMaterial?.code)
  const legacyLength = raw.clearanceLength ?? 0
  const legacyBreadth = raw.clearanceBreadth ?? 0
  const clearanceManualRows =
    raw.clearanceManualRows ??
    (legacyLength || legacyBreadth
      ? [{ id: newId(), length: legacyLength, breadth: legacyBreadth }]
      : [])
  const incomingExcavationBands: BundExcavationBands = raw.excavationBands
    ? { ...defaultBundExcavationBands(), ...raw.excavationBands }
    : {
        stripping: normalizeChannelExcavationRows(
          raw.soilBands?.length
            ? raw.soilBands
            : defaultBundExcavationRows(
                raw.strippingMaterial ?? d.strippingMaterial,
                'channel'
              )
        ),
        'ustoe-exc': defaultBundExcavationRows(),
        'dstoe-exc': defaultBundExcavationRows(
          raw.downstreamToe?.excavationMaterial ?? undefined,
          'channel'
        ),
        'rocktoe-exc': defaultBundExcavationRows(),
        'chute-exc': defaultBundExcavationRows(
          raw.chuteDrainExcavationMaterial ?? undefined,
          'channel'
        ),
        'berm-drain-exc': defaultBundExcavationRows(undefined, 'channel'),
        'hearting-trench-exc': defaultBundExcavationRows()
      }
  const classifiedExcavationBands: BundExcavationBands =
    raw.excavationClassificationVersion === 2
      ? incomingExcavationBands
      : {
          ...incomingExcavationBands,
          stripping: normalizeChannelExcavationRows(incomingExcavationBands.stripping),
          'dstoe-exc': normalizeChannelExcavationRows(
            incomingExcavationBands['dstoe-exc']
          ),
          'chute-exc': normalizeChannelExcavationRows(
            incomingExcavationBands['chute-exc']
          )
        }
  const excavationBands: BundExcavationBands = {
    ...classifiedExcavationBands,
    'ustoe-exc': normalizeFoundationExcavationRows(
      classifiedExcavationBands['ustoe-exc']
    ),
    'rocktoe-exc': normalizeFoundationExcavationRows(
      classifiedExcavationBands['rocktoe-exc']
    ),
    'hearting-trench-exc': normalizeFoundationExcavationRows(
      classifiedExcavationBands['hearting-trench-exc'] ??
        defaultBundExcavationRows()
    )
  }
  const strippingExcavationFamily =
    raw.strippingExcavationFamily ??
    (new Set([
      BUND_EXC_ALL_SOILS_CODE,
      BUND_EXC_HDR_CODE,
      BUND_EXC_FF_CODE,
      BUND_EXC_HR_CODE
    ]).has(excavationBands.stripping[0]?.material.code)
      ? 'foundation'
      : 'seating')
  const pitchingMaterial = raw.pitchingMaterial
    ? raw.pitchingMaterial.code === BUND_DEFAULT_PITCHING_CODE
      ? raw.pitchingMaterial
      : { code: BUND_DEFAULT_PITCHING_CODE }
    : null
  return {
    ...d,
    ...raw,
    includePhreaticInPrint,
    billing: formationEnabled && compactionEnabled ? 'combined' : 'split',
    formationEnabled,
    compactionEnabled,
    earthworkOperationVersion: 2,
    zonedRepairKind,
    zonedSoilSource,
    zonedSsrVersion: 1,
    fillBasis: strippingExcavationFamily === 'foundation' ? 'stripped' : 'existing',
    formationMaterial:
      migrateZonedCasing
        ? { code: zonedCodes.casing }
        : legacyEarthwork && knownFormationCode
        ? {
            code:
              formationEnabled && compactionEnabled
                ? BUND_DEFAULT_FORMATION_CODE
                : BUND_SPLIT_FORMATION_CODE
          }
        : raw.formationMaterial ?? d.formationMaterial,
    rollingMaterial:
      legacyEarthwork && raw.rollingMaterial?.code === BUND_SPLIT_ROLLING_CODE
        ? { code: BUND_SPLIT_ROLLING_CODE }
        : raw.rollingMaterial ?? d.rollingMaterial,
    heartingDesign: {
      ...d.heartingDesign,
      ...(raw.heartingDesign ?? {}),
      topLevel: raw.heartingDesign?.topLevel ?? raw.design?.topLevel ?? d.design.topLevel
    },
    // The trench arrived with the new zoned template; an older project simply
    // has none, which is exactly the default with no codes attached.
    heartingTrench: { ...d.heartingTrench, ...(raw.heartingTrench ?? {}) },
    heartingMaterial: migrateZonedHearting
      ? { code: zonedCodes.hearting }
      : raw.heartingMaterial ?? d.heartingMaterial,
    heartingRollingMaterial: raw.heartingRollingMaterial ?? d.heartingRollingMaterial,
    // Berms arrived after the first saved projects; a design without them is a
    // plain-faced bund, which is exactly an empty berm list.
    design: migrateBundDesign({ ...d.design, ...raw.design, berms: raw.design?.berms ?? [] }, raw),
    // Older "footprint" projects migrate to the correct automatic perimeter
    // method; manual projects retain their legacy dimensions as the first row.
    clearanceMode: raw.clearanceMode === 'manual' ? 'manual' : 'perimeter',
    clearanceManualRows,
    turfingMaterial: raw.turfingMaterial ?? null,
    turfingThickness: raw.turfingThickness ?? d.turfingThickness,
    pitchingMaterial,
    pitchingThickness: pitchingMaterial ? 0.45 : raw.pitchingThickness ?? d.pitchingThickness,
    pitchingAsVolume: false,
    pitchingBeddingMaterial: raw.pitchingBeddingMaterial ?? null,
    pitchingBeddingThickness:
      raw.pitchingBeddingThickness ?? d.pitchingBeddingThickness,
    pitchingMetalEnabled: raw.pitchingMetalEnabled ?? false,
    pitchingMetalMaterial: raw.pitchingMetalMaterial ?? null,
    pitchingMetalThickness: raw.pitchingMetalThickness ?? d.pitchingMetalThickness,
    rockToeMaterial: raw.rockToeMaterial ?? null,
    horizontalFilterMaterial: raw.horizontalFilterMaterial ?? null,
    horizontalFilterLength: raw.horizontalFilterLength ?? d.horizontalFilterLength,
    horizontalFilterThickness: raw.horizontalFilterThickness ?? d.horizontalFilterThickness,
    verticalFilterMaterial: raw.verticalFilterMaterial ?? null,
    verticalFilterWidth: raw.verticalFilterWidth ?? d.verticalFilterWidth,
    verticalFilterHeight: raw.verticalFilterHeight ?? d.verticalFilterHeight,
    rockToeFilterMaterial: raw.rockToeFilterMaterial ?? null,
    rockToeTopWidth: raw.rockToeTopWidth ?? d.rockToeTopWidth,
    rockToeInnerSlope: raw.rockToeInnerSlope ?? d.rockToeInnerSlope,
    rockToeOuterSlope: raw.rockToeOuterSlope ?? d.rockToeOuterSlope,
    // The height is always the entered value; retained only for saved-project
    // compatibility with the earlier automatic-height experiment.
    rockToeAutoHeight: false,
    rockToeHeight: raw.rockToeHeight ?? d.rockToeHeight,
    rockToeExcavationDepth: raw.rockToeExcavationDepth ?? 0,
    // This nested reference only enables the structural cut. The actual
    // soil/rock codes are the DAW rows in excavationBands['rocktoe-exc'].
    rockToeExcavationMaterial:
      raw.rockToeExcavationMaterial ||
      (raw.rockToeExcavationDepth ?? 0) > 0 ||
      raw.rockToeFilterMaterial
        ? { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
        : null,
    soilBands: [],
    excavationBands,
    strippingExcavationFamily,
    excavationClassificationVersion: 2,
    upstreamToe: {
      ...d.upstreamToe,
      ...(raw.upstreamToe ?? {}),
      excavationMaterial: raw.upstreamToe?.excavationMaterial
        ? { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
        : null
    },
    downstreamToe: {
      ...d.downstreamToe,
      ...(raw.downstreamToe ?? {}),
      // Collapse the short-lived two-reference model to the user's requested
      // single bottom RL when an older project is reopened.
      invertLevel:
        raw.downstreamToe?.invertLevel ??
        raw.downstreamToe?.invertStartLevel ??
        d.downstreamToe.invertLevel
    },
    chuteDrainLiningMaterial: raw.chuteDrainLiningMaterial ?? null,
    chuteDrainProtectionType: raw.chuteDrainProtectionType ?? d.chuteDrainProtectionType,
    chuteDrainExcavationMaterial: raw.chuteDrainExcavationMaterial ?? null,
    chuteDrainUseSpacing: raw.chuteDrainUseSpacing ?? d.chuteDrainUseSpacing,
    chuteDrainSpacing: raw.chuteDrainSpacing ?? d.chuteDrainSpacing,
    chuteDrainCount: raw.chuteDrainCount ?? d.chuteDrainCount,
    chuteDrainWidth: raw.chuteDrainWidth ?? d.chuteDrainWidth,
    chuteDrainDepth: raw.chuteDrainDepth ?? d.chuteDrainDepth,
    chuteDrainLiningThickness:
      raw.chuteDrainLiningThickness ?? d.chuteDrainLiningThickness,
    sameToeLevels: raw.sameToeLevels ?? false,
    materialItems: raw.materialItems ?? []
  }
}

// ---------------------------------------------------------------------------
// Chainage display. Stored in metres always; shown in chains when asked.
// ---------------------------------------------------------------------------

export function toDisplayChainage(metres: number, unit: BundData['chainageUnit']): number {
  return unit === 'chains' ? metres / BUND_CHAIN_M : metres
}

export function fromDisplayChainage(value: number, unit: BundData['chainageUnit']): number {
  return unit === 'chains' ? value * BUND_CHAIN_M : value
}

export function chainageUnitLabel(unit: BundData['chainageUnit']): string {
  return unit === 'chains' ? 'chains' : 'm'
}

export function formatChainage(metres: number, unit: BundData['chainageUnit']): string {
  const v = toDisplayChainage(metres, unit)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

// ---------------------------------------------------------------------------
// Cross-section areas.
// ---------------------------------------------------------------------------

/**
 * Area under a surveyed profile, reduced to `datum`, by the trapezoidal rule
 * over consecutive offset pairs — the same arithmetic the survey sheets do
 * cell by cell: ((RL₁ + RL₂)/2 − datum) × Δoffset.
 *
 * Points are sorted by offset first, so a table entered out of order still
 * gives the right answer instead of a silently negative strip.
 */
export function profileArea(points: BundPoint[], datum: number): number {
  if (points.length < 2) return 0
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  let area = 0
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]
    const b = sorted[i]
    area += ((a.rl - datum + (b.rl - datum)) / 2) * (b.offset - a.offset)
  }
  return area
}

/** Replace or add explicitly overridden points in an otherwise automatic profile. */
function mergeProfileOverrides(base: BundPoint[], overrides?: BundPoint[]): BundPoint[] {
  if (!overrides?.length) return base
  const merged = new Map(base.map((point) => [round3(point.offset), { ...point }]))
  for (const point of overrides) merged.set(round3(point.offset), { ...point })
  return [...merged.values()].sort((a, b) => a.offset - b.offset)
}

/**
 * Automatic excavation level at one offset.
 *
 * Ordinary seating removes `stripDepth`. Where the surveyed ground stands
 * above the fixed bund design, the excavation continues down to the design
 * instead of lifting the design to suit the ground. This leaves no formation
 * fill at that offset when formation is measured from existing ground.
 */
export function automaticStrippedLevelAt(
  existingRl: number,
  proposedRl: number,
  design: BundDesign
): number {
  return existingRl > proposedRl + 1e-9
    ? proposedRl
    : existingRl - design.stripDepth
}

/**
 * The effective stripped/excavated surface within the proposed bund footprint.
 * It is sampled at every ground/design break point so both the diagram and the
 * quantity engine see the same section-specific cut.
 */
export function strippedProfile(section: BundSection, design: BundDesign): BundPoint[] {
  // A stored full profile is retained for imported/legacy projects. New edits
  // are sparse overrides so every other point keeps following stripDepth.
  let base: BundPoint[]
  if (section.stripped && section.stripped.length >= 2) {
    base = section.stripped
  } else if (section.pre.length >= 2) {
    const proposed = projectedProfile(section, design)
    if (proposed.length >= 2) {
      const minOffset = proposed[0].offset
      const maxOffset = proposed[proposed.length - 1].offset
      const offsets = [
        ...new Set(
          [
            minOffset,
            maxOffset,
            ...proposed.map((point) => point.offset),
            ...section.pre
              .filter(
                (point) =>
                  point.offset >= minOffset - 1e-9 && point.offset <= maxOffset + 1e-9
              )
              .map((point) => point.offset)
          ].map(round3)
        )
      ].sort((a, b) => a - b)
      const refinedOffsets: number[] = [offsets[0]]
      for (let index = 1; index < offsets.length; index += 1) {
        const from = offsets[index - 1]
        const to = offsets[index]
        const differenceAt = (offset: number): number =>
          existLevelAt(section.pre, offset) -
          existLevelAt(proposed, offset)
        const fromDifference = differenceAt(from)
        const toDifference = differenceAt(to)
        if (fromDifference * toDifference < -1e-12) {
          refinedOffsets.push(
            from +
              ((0 - fromDifference) / (toDifference - fromDifference)) * (to - from)
          )
        }
        refinedOffsets.push(to)
      }
      base = refinedOffsets.map((offset) => ({
        offset,
        rl: automaticStrippedLevelAt(
          existLevelAt(section.pre, offset),
          existLevelAt(proposed, offset),
          design
        )
      }))
    } else {
      base = section.pre.map((point) => ({
        offset: point.offset,
        rl: point.rl - design.stripDepth
      }))
    }
  } else {
    base = []
  }
  return mergeProfileOverrides(base, section.strippedOverrides).sort(
    (a, b) => a.offset - b.offset
  )
}

/**
 * A generated restoration section is measurable only after every one of its
 * seven design offsets has an existing-ground RL. This prevents the two entered
 * toe RLs from being incorrectly joined as one straight ground line.
 */
export function hasCompleteRestorationGround(section: BundSection): boolean {
  if (section.pre.length < 2) return false
  const offsets = section.designPointOffsets
  if (!offsets?.length) return true
  // A generated section is measurable as soon as at least one existing RL is
  // entered strictly *between* the two toes. Every level routine already
  // interpolates linearly between the entered points — that interpolated line
  // is exactly what the section chart draws — so missing intermediate points
  // simply follow it, and typing one overrides it. The one case still refused
  // is toe RLs alone: those two would join as a straight chord across the
  // existing bund and measure the whole of it away as new fill.
  const first = Math.min(...offsets)
  const last = Math.max(...offsets)
  return section.pre.some((p) => p.offset > first + 1e-6 && p.offset < last - 1e-6)
}

/**
 * Which existing-ground model a chainage measures from.
 *
 * A surveyed cross-section wins wherever one has been entered — that is how a
 * repair has always worked, and a new homogeneous bund is now set out the same
 * way, from the two toe RLs and the generated design points. The flat
 * single-RL model remains for a new bund with no survey yet (a new zoned bund,
 * and every new bund saved before the cross-section entry existed).
 */
export function usesFlatGround(data: BundData, section: BundSection): boolean {
  return data.mode === 'new' && section.pre.length < 2
}

/**
 * Which ground entry the dashboard offers. Every bund is now set out from the
 * surveyed cross-section table — a new bund from the two toe RLs and the
 * generated design points, a repair from its survey. The single-RL model is
 * kept only for reading projects saved before this existed, which is what
 * `usesFlatGround` decides per section.
 */
export function usesSurveyedGroundEntry(_data: BundData): boolean {
  return true
}

/**
 * Is there enough existing ground at this chainage to measure it?
 *
 * On a repair, two toe RLs alone are refused: joined as a straight chord they
 * would cut the existing bund away as new fill. A new bund has nothing standing
 * between its toes, so that chord *is* the natural ground and two RLs are
 * enough.
 */
export function hasMeasurableGround(data: BundData, section: BundSection): boolean {
  if (usesFlatGround(data, section)) return section.groundLevel != null
  if (data.mode === 'new') return section.pre.length >= 2
  return hasCompleteRestorationGround(section)
}

/**
 * Centre-relative offset of the upstream toe. Levels are *stored* relative to
 * the centre-line, because the crest and the two side slopes are defined about
 * it, but they are *shown* as a distance measured from the u/s toe — the way a
 * tape is actually run across a bund in the field. This is the origin for that
 * display, so u/s toe reads 0 and distances increase downstream.
 */
export function upstreamToeOffset(section: BundSection, data: BundData): number {
  const offsets = sectionDesignOffsets(section, data.design)
  if (offsets?.length) return round3(Math.min(...offsets))
  const projected = projectedProfile(section, data.design)
  if (projected.length) return round3(Math.min(...projected.map((p) => p.offset)))
  if (section.pre.length) return round3(Math.min(...section.pre.map((p) => p.offset)))
  return 0
}

/** Existing ground level at any offset, interpolated, flat beyond the survey. */
export function existLevelAt(points: BundPoint[], offset: number): number {
  if (points.length === 0) return 0
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  if (offset <= sorted[0].offset) return sorted[0].rl
  const last = sorted[sorted.length - 1]
  if (offset >= last.offset) return last.rl
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (offset >= a.offset && offset <= b.offset) {
      const t = b.offset === a.offset ? 0 : (offset - a.offset) / (b.offset - a.offset)
      return a.rl + (b.rl - a.rl) * t
    }
  }
  return last.rl
}

// ---------------------------------------------------------------------------
// Faces and berms. A face is a walk outward from the crest edge: a sloping run,
// then (where a berm is placed) a horizontal shelf, then the next run — which
// may carry a flatter slope below the berm. Everything berm-aware is built on
// `faceSegments`, so the drawn section, the toe search, the areas and the
// slope lengths cannot disagree about where a shelf is.
// ---------------------------------------------------------------------------

/** The face slope of one side (horizontal metres per 1 m of fall). */
function faceSlope(design: BundDesign, side: BundBermSide): number {
  return (side === 'us' ? design.usSlope : design.dsSlope) || 1
}

/** Berms on one face, highest first, ignoring rows that form no shelf. */
export function faceBerms(design: BundDesign, side: BundBermSide): BundBerm[] {
  return (design.berms ?? [])
    .filter(
      (berm) =>
        berm.side === side && berm.width > 0 && berm.level < design.topLevel - 1e-9
    )
    .sort((a, b) => b.level - a.level)
}

export interface BundFaceSegment {
  kind: 'slope' | 'shelf'
  /** Horizontal distance from the crest edge at each end of the segment. */
  fromDistance: number
  toDistance: number
  fromRl: number
  toRl: number
  /** The berm this shelf belongs to (shelf segments only). */
  berm?: BundBerm
}

/**
 * One face from the crest edge down to `baseRl`, as alternating sloping runs
 * and berm shelves. Berms at or below the base are never reached, so they
 * simply do not appear — which is how a berm disappears where the bund becomes
 * too shallow to carry it.
 */
export function faceSegments(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): BundFaceSegment[] {
  const out: BundFaceSegment[] = []
  if (!(baseRl < design.topLevel - 1e-9)) return out
  let level = design.topLevel
  let distance = 0
  let slope = faceSlope(design, side)
  for (const berm of faceBerms(design, side)) {
    // Buried by a higher berm, or below where this face already ends.
    if (berm.level >= level - 1e-9) continue
    if (berm.level <= baseRl + 1e-9) break
    const run = (level - berm.level) * slope
    out.push({
      kind: 'slope',
      fromDistance: distance,
      toDistance: distance + run,
      fromRl: level,
      toRl: berm.level
    })
    distance += run
    out.push({
      kind: 'shelf',
      fromDistance: distance,
      toDistance: distance + berm.width,
      fromRl: berm.level,
      toRl: berm.level,
      berm
    })
    distance += berm.width
    level = berm.level
    if (berm.slopeBelow != null && berm.slopeBelow > 0) slope = berm.slopeBelow
  }
  out.push({
    kind: 'slope',
    fromDistance: distance,
    toDistance: distance + (level - baseRl) * slope,
    fromRl: level,
    toRl: baseRl
  })
  return out
}

/** Horizontal distance from the crest edge at which a face reaches `rl`. */
export function faceDistanceToLevel(
  design: BundDesign,
  side: BundBermSide,
  rl: number
): number {
  const segments = faceSegments(design, side, rl)
  return segments.length ? round3(segments[segments.length - 1].toDistance) : 0
}

/** RL of a face at a horizontal distance beyond the crest edge. */
function faceLevelAtDistance(
  design: BundDesign,
  side: BundBermSide,
  distance: number
): number {
  if (distance <= 0) return design.topLevel
  let level = design.topLevel
  let remaining = distance
  let slope = faceSlope(design, side)
  for (const berm of faceBerms(design, side)) {
    if (berm.level >= level - 1e-9) continue
    const run = (level - berm.level) * slope
    if (remaining <= run) return level - remaining / slope
    remaining -= run
    level = berm.level
    if (remaining <= berm.width) return berm.level
    remaining -= berm.width
    if (berm.slopeBelow != null && berm.slopeBelow > 0) slope = berm.slopeBelow
  }
  return level - remaining / slope
}

/** Centre-line offsets of the two hinges of every shelf down to `baseRl`. */
export function bermHingeOffsets(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): number[] {
  const half = design.topWidth / 2
  return faceSegments(design, side, baseRl)
    .filter((segment) => segment.kind === 'shelf')
    .flatMap((segment) =>
      [segment.fromDistance, segment.toDistance].map((distance) =>
        round3(side === 'us' ? -half - distance : half + distance)
      )
    )
}

/**
 * RL of the designed bund surface at an offset: the crest at TBL, then the two
 * faces sloping down. Beyond the crest each 1 m of fall costs `slope` metres of
 * width (a 1:2.5 face drops 1 m over 2.5 m), interrupted by any berm shelf.
 */
export function designSurfaceAt(offset: number, design: BundDesign): number {
  const beyondCrest = Math.abs(offset) - design.topWidth / 2
  if (beyondCrest <= 0) return design.topLevel
  return faceLevelAtDistance(design, offset < 0 ? 'us' : 'ds', beyondCrest)
}

/**
 * The fixed proposed bund level at an offset. Existing ground is deliberately
 * not allowed to move this line: high ground is a local cut, low ground is
 * local fill, and the two quantities are measured independently.
 */
export function proposedLevelAt(
  offset: number,
  _existingRl: number,
  design: BundDesign
): number {
  return designSurfaceAt(offset, design)
}

/**
 * The seven standard design points for a restoration section:
 * upstream toe + face midpoint, three crest points, then the downstream face
 * midpoint + toe. Each toe is the outermost place where the designed face
 * leaves the surveyed ground while moving out from the crest.
 *
 * FTL and MWL do not locate a toe: they are reservoir reference levels. The
 * toe changes at every chainage with the existing ground and the selected face
 * slope. Berms add their two hinges to each face they interrupt, so the result
 * is seven points only on a plain-faced bund. Returns an empty array when the
 * survey is insufficient or the ground is already at/above TBL at a crest edge.
 */
/**
 * Distance from the crest edge at which the designed face meets the surveyed
 * ground, on one side. Beyond the last surveyed point the ground is taken as
 * flat — the convention `existLevelAt` already uses — so the crossing exists
 * even when the survey is narrower than the bund. Null means the designed face
 * never rises above the surveyed ground on that side.
 */
export function faceToeDistance(
  pre: BundPoint[],
  design: BundDesign,
  side: -1 | 1
): number | null {
  if (pre.length < 2 || design.topWidth <= 0 || design.usSlope <= 0 || design.dsSlope <= 0) {
    return null
  }
  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2
  // Deep enough that every berm on the face is reached and listed.
  const belowGround = Math.min(...sorted.map((point) => point.rl)) - 1

  const edge = side * half
  const gap = (distance: number): number => {
    const offset = edge + side * distance
    return designSurfaceAt(offset, design) - existLevelAt(sorted, offset)
  }

  // Both lines are piecewise linear, so checking every surveyed break point
  // and every berm hinge from the crest outwards finds all face/ground
  // crossings exactly; the outermost exit is the actual toe.
  const distances = [
    ...new Set(
      [
        0,
        ...sorted.map((point) => side * (point.offset - edge)),
        ...faceSegments(design, side < 0 ? 'us' : 'ds', belowGround).flatMap(
          (segment) => [segment.fromDistance, segment.toDistance]
        )
      ]
        .filter((distance) => distance >= 0)
        .map(round3)
    )
  ].sort((a, b) => a - b)

  const farthest = distances[distances.length - 1] ?? 0
  if (gap(farthest) > 0) {
    let outsideDistance = Math.max(farthest + 1, 1)
    while (gap(outsideDistance) > 0 && outsideDistance < 1_000_000) {
      outsideDistance *= 2
    }
    if (gap(outsideDistance) > 0) return null
    distances.push(outsideDistance)
  }

  // Past the survey the ground is flat and the designed face keeps falling, so
  // a crossing is guaranteed — this is the case a berm creates, by pushing the
  // toe further out than the tape was run.
  let outermostExit: number | null = null
  for (let index = 1; index < distances.length; index += 1) {
    const from = distances[index - 1]
    const to = distances[index]
    const fromGap = gap(from)
    const toGap = gap(to)
    if (fromGap > 1e-9 && toGap <= 1e-9) {
      outermostExit = from + (fromGap / (fromGap - toGap)) * (to - from)
    }
  }
  return outermostExit
}

export function sevenPointDesignProfile(pre: BundPoint[], design: BundDesign): BundPoint[] {
  if (pre.length < 2 || design.topWidth <= 0 || design.usSlope <= 0 || design.dsSlope <= 0) {
    return []
  }

  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2

  const upstreamDistance = faceToeDistance(sorted, design, -1)
  const downstreamDistance = faceToeDistance(sorted, design, 1)
  if (upstreamDistance == null || downstreamDistance == null) return []

  const upstreamToe = -half - upstreamDistance
  const downstreamToe = half + downstreamDistance
  const usToeRl = existLevelAt(sorted, upstreamToe)
  const dsToeRl = existLevelAt(sorted, downstreamToe)
  const offsets = [
    ...new Set(
      [
        upstreamToe,
        (upstreamToe - half) / 2,
        -half,
        0,
        half,
        (half + downstreamToe) / 2,
        downstreamToe,
        ...bermHingeOffsets(design, 'us', usToeRl),
        ...bermHingeOffsets(design, 'ds', dsToeRl)
      ]
        .map(round3)
        .filter((offset) => offset >= upstreamToe - 1e-9 && offset <= downstreamToe + 1e-9)
    )
  ].sort((a, b) => a - b)

  return offsets.map((offset) => ({
    offset,
    rl: round3(designSurfaceAt(offset, design))
  }))
}

/**
 * Seven design points from the two section-specific toe ground levels. This is
 * the direct design-button workflow: the side slopes determine each toe's
 * horizontal distance from the crest edge.
 */
export function sevenPointDesignFromGroundLevels(
  upstreamGroundLevel: number,
  downstreamGroundLevel: number,
  design: BundDesign
): BundPoint[] {
  if (
    !Number.isFinite(upstreamGroundLevel) ||
    !Number.isFinite(downstreamGroundLevel) ||
    design.topWidth <= 0 ||
    design.usSlope <= 0 ||
    design.dsSlope <= 0 ||
    upstreamGroundLevel >= design.topLevel ||
    downstreamGroundLevel >= design.topLevel
  ) {
    return []
  }

  const half = design.topWidth / 2
  const upstreamToe = -half - faceDistanceToLevel(design, 'us', upstreamGroundLevel)
  const downstreamToe = half + faceDistanceToLevel(design, 'ds', downstreamGroundLevel)
  const offsets = [
    ...new Set(
      [
        upstreamToe,
        (upstreamToe - half) / 2,
        -half,
        0,
        half,
        (half + downstreamToe) / 2,
        downstreamToe,
        ...bermHingeOffsets(design, 'us', upstreamGroundLevel),
        ...bermHingeOffsets(design, 'ds', downstreamGroundLevel)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  return offsets.map((offset) => ({
    offset,
    rl: round3(designSurfaceAt(offset, design))
  }))
}

/**
 * Generated offsets refreshed against the current design.
 *
 * Stored offsets describe the design at the moment the button was pressed.
 * Berms and slope edits can widen it later, so when the two toe RLs are known
 * those RLs are the durable input and the offsets are regenerated from them.
 */
export function sectionDesignOffsets(
  section: BundSection,
  design: BundDesign
): number[] {
  if (
    section.upstreamGroundLevel != null &&
    section.downstreamGroundLevel != null
  ) {
    const regenerated = sevenPointDesignFromGroundLevels(
      section.upstreamGroundLevel,
      section.downstreamGroundLevel,
      design
    )
    if (regenerated.length >= 2) return regenerated.map((point) => point.offset)
  }
  const stored = section.designPointOffsets ?? []
  if (stored.length >= 2 && section.pre.length >= 2) {
    const oldUsToe = Math.min(...stored)
    const oldDsToe = Math.max(...stored)
    const regenerated = sevenPointDesignFromGroundLevels(
      existLevelAt(section.pre, oldUsToe),
      existLevelAt(section.pre, oldDsToe),
      design
    )
    if (regenerated.length >= 2) return regenerated.map((point) => point.offset)
  }
  return stored
}

/**
 * Proposed profile derived from the design for a restoration, sampled at the
 * survey offsets plus the two crest corners so the crest draws crisply. The
 * profile is the fixed design surface; it is never raised by a high surveyed
 * point. Cut and fill are classified locally later.
 *
 * The profile always runs the full width of the proposed bund — out to where
 * each designed face meets the ground — even when that is past the end of the
 * survey. Berms make this ordinary: every shelf pushes its toe another shelf
 * width outward, and a face that stopped at the last surveyed offset would hang
 * in mid-air on the drawing and lose its outer wedge of fill.
 */
export function deriveProposedProfile(
  pre: BundPoint[],
  design: BundDesign,
  additionalOffsets: number[] = []
): BundPoint[] {
  if (pre.length < 2) return []
  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  const half = design.topWidth / 2
  const fixedOffsets = additionalOffsets.filter(Number.isFinite).map(round3)
  const fixedMin = fixedOffsets.length >= 2 ? Math.min(...fixedOffsets) : null
  const fixedMax = fixedOffsets.length >= 2 ? Math.max(...fixedOffsets) : null
  const usToeDistance = fixedMin == null ? faceToeDistance(sorted, design, -1) : null
  const dsToeDistance = fixedMax == null ? faceToeDistance(sorted, design, 1) : null
  // A face that never rises above the surveyed ground has no toe: the design
  // section never closes against this ground, so there is no bund to draw and
  // nothing to measure. Falling back to the ends of the tape would instead
  // sweep the designed face on downwards below the ground and bill the whole
  // surveyed width as excavation. The section reports the problem instead —
  // see sectionDesignIssues.
  if (fixedMin == null && usToeDistance == null) return []
  if (fixedMax == null && dsToeDistance == null) return []
  const usToe = fixedMin ?? round3(-half - (usToeDistance as number))
  const dsToe = fixedMax ?? round3(half + (dsToeDistance as number))
  const minOff = Math.min(usToe, dsToe)
  const maxOff = Math.max(usToe, dsToe)
  const offsets = new Set(
    sorted
      .filter((point) => point.offset >= minOff - 1e-9 && point.offset <= maxOff + 1e-9)
      .map((point) => point.offset)
  )
  offsets.add(round3(minOff))
  offsets.add(round3(maxOff))
  // Each toe is a kink in the proposed line. Unless it is sampled, the profile
  // cuts a chord straight across it — which draws the toe rounded off and
  // measures a wedge of fill that is not there.
  offsets.add(usToe)
  offsets.add(dsToe)
  for (const offset of additionalOffsets) {
    if (offset >= minOff && offset <= maxOff) offsets.add(round3(offset))
  }
  for (const edge of [-half, half]) {
    if (edge > minOff && edge < maxOff) offsets.add(Math.round(edge * 1000) / 1000)
  }
  // Berm hinges too, or a shelf would be cut off at the neighbouring survey
  // offsets and drawn (and measured) as a plain slope.
  const lowestGround = Math.min(...sorted.map((point) => point.rl))
  for (const side of ['us', 'ds'] as BundBermSide[]) {
    for (const offset of bermHingeOffsets(design, side, lowestGround)) {
      if (offset > minOff && offset < maxOff) offsets.add(offset)
    }
  }
  return [...offsets]
    .sort((a, b) => a - b)
    .map((offset) => ({ offset, rl: designSurfaceAt(offset, design) }))
}

/**
 * Carry a surveyed line flat when the fixed design footprint is wider than the
 * entered survey. Existing points outside that footprint are left intact; the
 * positive-band integrator clips both lines to their shared design span.
 */
export function extendProfileTo(
  points: BundPoint[],
  minOffset: number,
  maxOffset: number
): BundPoint[] {
  if (points.length < 2) return points
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  const out = [...sorted]
  if (minOffset < sorted[0].offset - 1e-9) {
    out.unshift({ offset: round3(minOffset), rl: sorted[0].rl })
  }
  if (maxOffset > sorted[sorted.length - 1].offset + 1e-9) {
    out.push({ offset: round3(maxOffset), rl: sorted[sorted.length - 1].rl })
  }
  return out
}

/** Piece of a profile inside an exact offset span, with interpolated ends. */
export function profileWithin(
  points: BundPoint[],
  minOffset: number,
  maxOffset: number
): BundPoint[] {
  if (points.length < 2 || maxOffset <= minOffset) return []
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  return [
    { offset: minOffset, rl: existLevelAt(sorted, minOffset) },
    ...sorted.filter(
      (point) => point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
    ),
    { offset: maxOffset, rl: existLevelAt(sorted, maxOffset) }
  ]
}

export interface BundProfileBand {
  fromOffset: number
  toOffset: number
  upperFromRl: number
  upperToRl: number
  lowerFromRl: number
  lowerToRl: number
}

/**
 * Positive-only pieces between two piecewise-linear profiles.
 *
 * Every ground/design crossing is inserted explicitly. Consequently a cut on
 * one part of a section can never cancel fill on another part, and the SVG can
 * hatch precisely the same pieces that are measured.
 */
export function positiveProfileBands(
  upper: BundPoint[],
  lower: BundPoint[]
): BundProfileBand[] {
  if (upper.length < 2 || lower.length < 2) return []
  const upperSorted = [...upper].sort((a, b) => a.offset - b.offset)
  const lowerSorted = [...lower].sort((a, b) => a.offset - b.offset)
  // Callers first extend a short survey to the design limits. Intersecting the
  // spans here prevents either profile being measured outside the fixed bund
  // footprint.
  const minOffset = Math.max(upperSorted[0].offset, lowerSorted[0].offset)
  const maxOffset = Math.min(
    upperSorted[upperSorted.length - 1].offset,
    lowerSorted[lowerSorted.length - 1].offset
  )
  if (maxOffset <= minOffset + 1e-9) return []

  const offsets = [
    ...new Set(
      [
        minOffset,
        maxOffset,
        ...upperSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset),
        ...lowerSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  const refined: number[] = [offsets[0]]
  for (let index = 1; index < offsets.length; index += 1) {
    const from = offsets[index - 1]
    const to = offsets[index]
    const fromDifference =
      existLevelAt(upperSorted, from) - existLevelAt(lowerSorted, from)
    const toDifference = existLevelAt(upperSorted, to) - existLevelAt(lowerSorted, to)
    if (fromDifference * toDifference < -1e-12) {
      const crossing =
        from + ((0 - fromDifference) / (toDifference - fromDifference)) * (to - from)
      refined.push(crossing)
    }
    refined.push(to)
  }

  const bands: BundProfileBand[] = []
  for (let index = 1; index < refined.length; index += 1) {
    const fromOffset = refined[index - 1]
    const toOffset = refined[index]
    if (toOffset <= fromOffset + 1e-9) continue
    const middle = (fromOffset + toOffset) / 2
    if (existLevelAt(upperSorted, middle) <= existLevelAt(lowerSorted, middle) + 1e-9) {
      continue
    }
    bands.push({
      fromOffset,
      toOffset,
      upperFromRl: existLevelAt(upperSorted, fromOffset),
      upperToRl: existLevelAt(upperSorted, toOffset),
      lowerFromRl: existLevelAt(lowerSorted, fromOffset),
      lowerToRl: existLevelAt(lowerSorted, toOffset)
    })
  }
  return bands
}

/** Area of positive-only bands between two profiles. */
export function positiveProfileArea(upper: BundPoint[], lower: BundPoint[]): number {
  return profileBandsArea(positiveProfileBands(upper, lower))
}

/** Area represented by profile bands. */
export function profileBandsArea(bands: BundProfileBand[]): number {
  return bands.reduce(
    (total, band) =>
      total +
      (((band.upperFromRl - band.lowerFromRl +
        (band.upperToRl - band.lowerToRl)) /
        2) *
        (band.toOffset - band.fromOffset)),
    0
  )
}

function profileBandLevelAt(
  band: BundProfileBand,
  offset: number,
  edge: 'upper' | 'lower'
): number {
  const span = band.toOffset - band.fromOffset
  const fraction = span <= 1e-12 ? 0 : (offset - band.fromOffset) / span
  const from = edge === 'upper' ? band.upperFromRl : band.lowerFromRl
  const to = edge === 'upper' ? band.upperToRl : band.lowerToRl
  return from + fraction * (to - from)
}

/**
 * Geometrical overlap of two sets of positive profile bands.
 *
 * Zoned repair uses this to keep hearting strictly inside the already measured
 * repair fill. This makes casing + hearting equal the ordinary formation
 * quantity, even where the existing bund surface is irregular.
 */
export function intersectProfileBands(
  first: BundProfileBand[],
  second: BundProfileBand[]
): BundProfileBand[] {
  const out: BundProfileBand[] = []
  for (const a of first) {
    for (const b of second) {
      const from = Math.max(a.fromOffset, b.fromOffset)
      const to = Math.min(a.toOffset, b.toOffset)
      if (to <= from + 1e-9) continue

      const offsets = [from, to]
      for (const edge of ['upper', 'lower'] as const) {
        const fromDiff =
          profileBandLevelAt(a, from, edge) - profileBandLevelAt(b, from, edge)
        const toDiff =
          profileBandLevelAt(a, to, edge) - profileBandLevelAt(b, to, edge)
        if (fromDiff * toDiff < -1e-12) {
          offsets.push(from + (fromDiff / (fromDiff - toDiff)) * (to - from))
        }
      }
      offsets.sort((x, y) => x - y)

      for (let index = 1; index < offsets.length; index += 1) {
        const left = offsets[index - 1]
        const right = offsets[index]
        if (right <= left + 1e-9) continue
        const topAt = (offset: number): number =>
          Math.min(
            profileBandLevelAt(a, offset, 'upper'),
            profileBandLevelAt(b, offset, 'upper')
          )
        const bottomAt = (offset: number): number =>
          Math.max(
            profileBandLevelAt(a, offset, 'lower'),
            profileBandLevelAt(b, offset, 'lower')
          )
        const leftGap = topAt(left) - bottomAt(left)
        const rightGap = topAt(right) - bottomAt(right)
        const refined =
          leftGap * rightGap < -1e-12
            ? [
                left,
                left + (leftGap / (leftGap - rightGap)) * (right - left),
                right
              ]
            : [left, right]
        for (let part = 1; part < refined.length; part += 1) {
          const partFrom = refined[part - 1]
          const partTo = refined[part]
          const middle = (partFrom + partTo) / 2
          if (topAt(middle) <= bottomAt(middle) + 1e-9) continue
          out.push({
            fromOffset: partFrom,
            toOffset: partTo,
            upperFromRl: topAt(partFrom),
            upperToRl: topAt(partTo),
            lowerFromRl: bottomAt(partFrom),
            lowerToRl: bottomAt(partTo)
          })
        }
      }
    }
  }
  return out
}

/**
 * Automatic local cut/fill classification over one fixed design footprint.
 *
 * Where existing ground is above design, only that excess is cut and there is
 * no fill. Everywhere else the ordinary strip depth applies. Formation is then
 * measured from existing ground for seating, or from the stripped surface for
 * foundation excavation.
 */
export function automaticLocalEarthworkBands(
  existing: BundPoint[],
  proposed: BundPoint[],
  design: BundDesign,
  fillBasis: BundFillBasis
): { stripping: BundProfileBand[]; formation: BundProfileBand[] } {
  if (existing.length < 2 || proposed.length < 2) {
    return { stripping: [], formation: [] }
  }
  const existingSorted = [...existing].sort((a, b) => a.offset - b.offset)
  const proposedSorted = [...proposed].sort((a, b) => a.offset - b.offset)
  const minOffset = Math.max(existingSorted[0].offset, proposedSorted[0].offset)
  const maxOffset = Math.min(
    existingSorted[existingSorted.length - 1].offset,
    proposedSorted[proposedSorted.length - 1].offset
  )
  if (maxOffset <= minOffset + 1e-9) {
    return { stripping: [], formation: [] }
  }

  const baseOffsets = [
    ...new Set(
      [
        minOffset,
        maxOffset,
        ...existingSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset),
        ...proposedSorted
          .filter(
            (point) =>
              point.offset > minOffset + 1e-9 && point.offset < maxOffset - 1e-9
          )
          .map((point) => point.offset)
      ].map(round3)
    )
  ].sort((a, b) => a - b)

  const offsets: number[] = [baseOffsets[0]]
  for (let index = 1; index < baseOffsets.length; index += 1) {
    const from = baseOffsets[index - 1]
    const to = baseOffsets[index]
    const fromGap =
      existLevelAt(existingSorted, from) - existLevelAt(proposedSorted, from)
    const toGap = existLevelAt(existingSorted, to) - existLevelAt(proposedSorted, to)
    if (fromGap * toGap < -1e-12) {
      offsets.push(from + (fromGap / (fromGap - toGap)) * (to - from))
    }
    offsets.push(to)
  }

  const stripping: BundProfileBand[] = []
  const formation: BundProfileBand[] = []
  for (let index = 1; index < offsets.length; index += 1) {
    const fromOffset = offsets[index - 1]
    const toOffset = offsets[index]
    if (toOffset <= fromOffset + 1e-9) continue
    const middle = (fromOffset + toOffset) / 2
    const existingAt = (offset: number): number =>
      existLevelAt(existingSorted, offset)
    const proposedAt = (offset: number): number =>
      existLevelAt(proposedSorted, offset)
    const isCut = existingAt(middle) > proposedAt(middle) + 1e-9

    const existingFrom = existingAt(fromOffset)
    const existingTo = existingAt(toOffset)
    const proposedFrom = proposedAt(fromOffset)
    const proposedTo = proposedAt(toOffset)
    stripping.push({
      fromOffset,
      toOffset,
      upperFromRl: existingFrom,
      upperToRl: existingTo,
      lowerFromRl: isCut ? proposedFrom : existingFrom - design.stripDepth,
      lowerToRl: isCut ? proposedTo : existingTo - design.stripDepth
    })

    if (!isCut) {
      const lowerFrom =
        fillBasis === 'stripped' ? existingFrom - design.stripDepth : existingFrom
      const lowerTo =
        fillBasis === 'stripped' ? existingTo - design.stripDepth : existingTo
      if (
        proposedAt(middle) >
        (fillBasis === 'stripped'
          ? existingAt(middle) - design.stripDepth
          : existingAt(middle)) +
          1e-9
      ) {
        formation.push({
          fromOffset,
          toOffset,
          upperFromRl: proposedFrom,
          upperToRl: proposedTo,
          lowerFromRl: lowerFrom,
          lowerToRl: lowerTo
        })
      }
    }
  }
  return { stripping, formation }
}

/**
 * Height of the bund at a chainage, measured from the stripped surface at the
 * centre-line up to the top bund level. Zero where the ground is already at or
 * above TBL, matching `IF(GL > TBL, 0, ...)` in the parametric sheets.
 */
export function bundHeight(groundLevel: number, design: BundDesign): number {
  if (groundLevel >= design.topLevel) return 0
  const strippedLevel = groundLevel - design.stripDepth
  return Math.max(0, design.topLevel - strippedLevel)
}

/** Width of the bund where it meets the stripped surface. */
export function bundBaseWidth(height: number, design: BundDesign): number {
  if (height <= 0) return 0
  const baseRl = design.topLevel - height
  return round3(
    design.topWidth +
      faceDistanceToLevel(design, 'us', baseRl) +
      faceDistanceToLevel(design, 'ds', baseRl)
  )
}

/**
 * Area between one face and the vertical line dropped from its crest edge,
 * down to `baseRl`. A shelf has no area of its own; it pushes everything below
 * it outward, which the running distance of the next slope run already
 * carries — so berm fill is measured, and paid, inside the formation item.
 */
function faceAreaBeyondCrest(
  design: BundDesign,
  side: BundBermSide,
  baseRl: number
): number {
  let area = 0
  for (const segment of faceSegments(design, side, baseRl)) {
    if (segment.kind === 'shelf') continue
    const drop = segment.fromRl - segment.toRl
    const run = segment.toDistance - segment.fromDistance
    area += segment.fromDistance * drop + (run * drop) / 2
  }
  return area
}

/**
 * Designed cross-section area for a 'new' bund: the crest rectangle plus each
 * face, which is a plain trapezium wing until a berm interrupts it.
 */
export function designedArea(height: number, design: BundDesign): number {
  if (height <= 0) return 0
  const baseRl = design.topLevel - height
  return round3(
    design.topWidth * height +
      faceAreaBeyondCrest(design, 'us', baseRl) +
      faceAreaBeyondCrest(design, 'ds', baseRl)
  )
}

/** The proposed profile as offsets and levels, for areas and the diagram. */
export function projectedProfile(section: BundSection, design: BundDesign): BundPoint[] {
  let base: BundPoint[]
  // A stored full profile is retained for imported/legacy projects.
  if (section.projected && section.projected.length >= 2) {
    base = section.projected
  } else if (section.pre.length >= 2) {
    // Restoration: derive from the design against the surveyed ground.
    base = deriveProposedProfile(section.pre, design, sectionDesignOffsets(section, design))
  } else {
    // New bund: a trapezium from the single ground level at the centre-line,
    // stepped wherever a berm interrupts one of the faces.
    if (section.groundLevel == null) return []
    const h = bundHeight(section.groundLevel, design)
    if (h <= 0) return []
    const strippedLevel = section.groundLevel - design.stripDepth
    const halfTop = design.topWidth / 2
    const facePoints = (side: BundBermSide): BundPoint[] =>
      faceSegments(design, side, strippedLevel).map((segment) => ({
        offset: round3(
          side === 'us' ? -(halfTop + segment.toDistance) : halfTop + segment.toDistance
        ),
        rl: round3(segment.toRl)
      }))
    base = [
      ...facePoints('us').reverse(),
      { offset: -halfTop, rl: design.topLevel },
      { offset: halfTop, rl: design.topLevel },
      ...facePoints('ds')
    ]
  }
  return mergeProfileOverrides(base, section.projectedOverrides).sort(
    (a, b) => a.offset - b.offset
  )
}

export interface BundSectionAreas {
  /** Ground area cleared of jungle growth (sq.m of plan area per metre run). */
  clearanceWidth: number
  stripping: number
  formation: number
  /** Slope length of the upstream (left) proposed face — for pitching (m). */
  usFace: number
  /** Slope length of the downstream (right) proposed face — for turfing (m). */
  dsFace: number
}

export interface BundLevelingLimits {
  /** Outer edge of the U/S toe-wall platform. */
  startOffset: number
  /** The generated U/S toe of the proposed bund. */
  usToeOffset: number
  /** The generated D/S toe of the proposed bund, after any berm widening. */
  dsToeOffset: number
  /** Outer edge of the D/S toe-drain platform. */
  endOffset: number
  usToeLevel: number
  dsToeLevel: number
}

export interface BundLevelingGeometry {
  limits: BundLevelingLimits
  /** Existing ground, including surveyed points entered outside the bund toes. */
  existing: BundPoint[]
  /** Proposed bund plus the level U/S toe-wall and D/S toe-drain platforms. */
  proposed: BundPoint[]
  /** Gross cut/stripping before any overlap is assigned to rock-toe excavation. */
  stripping: BundProfileBand[]
  formation: BundProfileBand[]
}

/**
 * Limits of the one continuous bund-leveling operation.
 *
 * The design toes remain the ends of the embankment faces. When the respective
 * component is enabled, leveling continues one top width beyond that toe so the
 * toe wall or toe drain is constructed only after its platform is formed.
 */
export function bundLevelingLimits(
  section: BundSection,
  data: BundData
): BundLevelingLimits | null {
  const toes = proposedToeOffsets(section, data)
  const projected = projectedProfile(section, data.design)
  if (!toes || projected.length < 2) return null
  const usWidth = upstreamToeTrenchEnabled(data)
    ? Math.max(0, data.upstreamToe.topWidth || 0)
    : 0
  const dsWidth = data.downstreamToe.excavationMaterial
    ? Math.max(0, toeDrainTopWidthAt(section, data))
    : 0
  return {
    startOffset: round3(toes.us - usWidth),
    usToeOffset: round3(toes.us),
    dsToeOffset: round3(toes.ds),
    endOffset: round3(toes.ds + dsWidth),
    usToeLevel: round3(existLevelAt(projected, toes.us)),
    dsToeLevel: round3(existLevelAt(projected, toes.ds))
  }
}

function dedupeProfile(points: BundPoint[]): BundPoint[] {
  const byOffset = new Map<number, BundPoint>()
  for (const point of points) {
    byOffset.set(round3(point.offset), {
      ...point,
      offset: round3(point.offset)
    })
  }
  return [...byOffset.values()].sort((a, b) => a.offset - b.offset)
}

/** Proposed bund and the two level construction platforms measured with it. */
export function bundLevelingProposedProfile(
  section: BundSection,
  data: BundData
): BundPoint[] {
  const limits = bundLevelingLimits(section, data)
  if (!limits) return []
  const core = profileWithin(
    projectedProfile(section, data.design),
    limits.usToeOffset,
    limits.dsToeOffset
  )
  return dedupeProfile([
    { offset: limits.startOffset, rl: limits.usToeLevel },
    { offset: limits.usToeOffset, rl: limits.usToeLevel },
    ...core,
    { offset: limits.dsToeOffset, rl: limits.dsToeLevel },
    { offset: limits.endOffset, rl: limits.dsToeLevel }
  ])
}

function earthworkBandsWithin(
  existing: BundPoint[],
  proposed: BundPoint[],
  design: BundDesign,
  fillBasis: BundFillBasis,
  fromOffset: number,
  toOffset: number
): { stripping: BundProfileBand[]; formation: BundProfileBand[] } {
  if (toOffset <= fromOffset + 1e-9) return { stripping: [], formation: [] }
  return automaticLocalEarthworkBands(
    profileWithin(existing, fromOffset, toOffset),
    profileWithin(proposed, fromOffset, toOffset),
    design,
    fillBasis
  )
}

/**
 * Full section geometry for bund seating/foundation leveling.
 *
 * Surveyed RLs outside the generated toes are used when present. Where they
 * are absent, `extendProfileTo` carries the nearest entered RL level outward.
 * The U/S and D/S component trenches are deliberately excluded: they are dug
 * only after this surface has been leveled.
 */
export function bundLevelingGeometry(
  data: BundData,
  section: BundSection
): BundLevelingGeometry | null {
  const limits = bundLevelingLimits(section, data)
  const proposed = bundLevelingProposedProfile(section, data)
  if (!limits || proposed.length < 2) return null

  const sourceExisting = usesFlatGround(data, section)
    ? section.groundLevel == null
      ? []
      : [
          { offset: limits.startOffset, rl: section.groundLevel },
          { offset: limits.endOffset, rl: section.groundLevel }
        ]
    : section.pre
  if (sourceExisting.length < 2) return null
  const existing = profileWithin(
    extendProfileTo(sourceExisting, limits.startOffset, limits.endOffset),
    limits.startOffset,
    limits.endOffset
  )

  const hasManualStripped =
    !usesFlatGround(data, section) &&
    ((section.stripped?.length ?? 0) >= 2 ||
      (section.strippedOverrides?.length ?? 0) > 0)
  if (!hasManualStripped) {
    const bands = automaticLocalEarthworkBands(
      existing,
      proposed,
      data.design,
      data.fillBasis
    )
    return { limits, existing, proposed, ...bands }
  }

  // Manual stripped/cut overrides apply to the embankment footprint. The two
  // outside platforms remain automatic so an entered outside EGL is always
  // compared with its fixed proposed toe level.
  const stripped = strippedProfile(section, data.design)
  const coreExisting = profileWithin(
    existing,
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const coreProposed = profileWithin(
    proposed,
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const coreStripped = profileWithin(
    extendProfileTo(stripped, limits.usToeOffset, limits.dsToeOffset),
    limits.usToeOffset,
    limits.dsToeOffset
  )
  const left = earthworkBandsWithin(
    existing,
    proposed,
    data.design,
    data.fillBasis,
    limits.startOffset,
    limits.usToeOffset
  )
  const right = earthworkBandsWithin(
    existing,
    proposed,
    data.design,
    data.fillBasis,
    limits.dsToeOffset,
    limits.endOffset
  )
  const coreFormationBase =
    data.fillBasis === 'stripped' ? coreStripped : coreExisting
  return {
    limits,
    existing,
    proposed,
    stripping: [
      ...left.stripping,
      ...positiveProfileBands(coreExisting, coreStripped),
      ...right.stripping
    ],
    formation: [
      ...left.formation,
      ...positiveProfileBands(coreProposed, coreFormationBase),
      ...right.formation
    ]
  }
}

/**
 * Slope lengths of the two proposed faces at a chainage. A face segment is one
 * whose midpoint lies beyond the crest edge; the flat crest between the corners
 * is excluded, and so is every berm shelf — a shelf is walked on, not pitched
 * or turfed, and carries its own surfacing item instead. Turfing and pitching
 * are these lengths × the chainage run.
 */
export function faceSlopeLengths(
  section: BundSection,
  design: BundDesign
): { us: number; ds: number } {
  const proj = [...projectedProfile(section, design)].sort((a, b) => a.offset - b.offset)
  if (proj.length < 2) return { us: 0, ds: 0 }
  const half = design.topWidth / 2
  const isShelf = (side: BundBermSide, a: BundPoint, b: BundPoint): boolean =>
    Math.abs(a.rl - b.rl) < 1e-6 &&
    faceBerms(design, side).some((berm) => Math.abs(berm.level - a.rl) < 1e-6)
  let us = 0
  let ds = 0
  for (let i = 1; i < proj.length; i += 1) {
    const a = proj[i - 1]
    const b = proj[i]
    const len = Math.hypot(b.offset - a.offset, b.rl - a.rl)
    const mid = (a.offset + b.offset) / 2
    if (mid < -half + 1e-9) {
      if (!isShelf('us', a, b)) us += len
    } else if (mid > half - 1e-9) {
      if (!isShelf('ds', a, b)) ds += len
    }
  }
  return { us: round3(us), ds: round3(ds) }
}

/**
 * The three areas at one chainage.
 *
 * Restoration reads the surveyed tables; a new bund derives them from the
 * design. The excavation-basis selector derives `fillBasis`: seating starts
 * formation at existing ground; foundation excavation starts it at the
 * excavated/stripped surface.
 */
export function sectionAreas(
  data: BundData,
  section: BundSection
): BundSectionAreas {
  const { design } = data

  const zero = { clearanceWidth: 0, stripping: 0, formation: 0, usFace: 0, dsFace: 0 }

  if (!hasMeasurableGround(data, section)) return zero
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return zero
  const faces = faceSlopeLengths(section, design)
  const grossStripping = profileBandsArea(leveling.stripping)
  // When rock-toe excavation is enabled, the cut already lying inside its
  // footprint belongs to that union and is removed from general stripping.
  const rockToeOverlap =
    rockToeExcavationAt(section, data)?.levelingOverlapArea ?? 0
  return {
    clearanceWidth: profileWidth(leveling.proposed),
    stripping: round3(Math.max(0, grossStripping - rockToeOverlap)),
    formation: round3(profileBandsArea(leveling.formation)),
    usFace: faces.us,
    dsFace: faces.ds
  }
}

/** Horizontal extent of a profile — the width cleared/occupied at a chainage. */
export function isZonedBund(data: BundData): boolean {
  return data.embankmentType === 'zoned'
}

export function isZonedRepair(data: BundData): boolean {
  return data.mode === 'restoration' && isZonedBund(data)
}

/** Top and short side runs used to preview the proposed hearting immediately. */
export function proposedHeartingCrestProfile(
  data: BundData,
  verticalDrop = 1
): BundPoint[] {
  const design = data.heartingDesign
  const drop = Math.max(0.1, verticalDrop)
  if (design.topWidth <= 0 || design.usSlope < 0 || design.dsSlope < 0) return []
  const halfTop = design.topWidth / 2
  const leftCrest = design.centerOffset - halfTop
  const rightCrest = design.centerOffset + halfTop
  return [
    {
      offset: round3(leftCrest - design.usSlope * drop),
      rl: round3(design.topLevel - drop)
    },
    { offset: round3(leftCrest), rl: round3(design.topLevel) },
    { offset: round3(rightCrest), rl: round3(design.topLevel) },
    {
      offset: round3(rightCrest + design.dsSlope * drop),
      rl: round3(design.topLevel - drop)
    }
  ]
}

/**
 * Surface that the full hearting side lines meet.
 *
 * Repair uses the actual surveyed Existing RL profile — the sides stop where
 * they first touch the bund that is already there. New work uses the prepared
 * formation base instead: the zone is built up from the excavated surface, so
 * that surface is what closes it. A new bund set out from a surveyed
 * cross-section takes the stripped profile of that survey; one still on the
 * single-RL model takes its flat base.
 */
export function heartingSupportProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  if (!isZonedBund(data)) return []
  if (data.mode === 'restoration') {
    return [...section.pre].sort((a, b) => a.offset - b.offset)
  }
  if (!usesFlatGround(data, section)) {
    const stripped = strippedProfile(section, data.design)
    return stripped.length >= 2 ? stripped : []
  }
  if (section.groundLevel == null) return []
  const casing = projectedProfile(section, data.design)
  if (casing.length < 2) return []
  const baseRl = round3(section.groundLevel - Math.max(0, data.design.stripDepth))
  return [
    { offset: casing[0].offset, rl: baseRl },
    { offset: casing[casing.length - 1].offset, rl: baseRl }
  ]
}

function heartingSideContact(
  support: BundPoint[],
  side: 'us' | 'ds',
  crestOffset: number,
  topLevel: number,
  slope: number
): BundPoint | null {
  if (support.length < 2 || slope < 0) return null
  const sorted = [...support].sort((a, b) => a.offset - b.offset)
  const minOffset = sorted[0].offset
  const maxOffset = sorted[sorted.length - 1].offset

  // A zero batter is a vertical side. Its contact is directly below its crest.
  if (slope <= 1e-9) {
    if (crestOffset < minOffset - 1e-9 || crestOffset > maxOffset + 1e-9) {
      return null
    }
    const rl = existLevelAt(sorted, crestOffset)
    return rl < topLevel - 1e-9
      ? { offset: round3(crestOffset), rl: round3(rl) }
      : null
  }

  const sideLevelAt = (offset: number): number =>
    side === 'us'
      ? topLevel - (crestOffset - offset) / slope
      : topLevel - (offset - crestOffset) / slope
  const domainContains = (offset: number): boolean =>
    side === 'us' ? offset <= crestOffset + 1e-9 : offset >= crestOffset - 1e-9
  const candidates: number[] = []

  for (let index = 1; index < sorted.length; index += 1) {
    const a = sorted[index - 1]
    const b = sorted[index]
    const from = side === 'us' ? a.offset : Math.max(a.offset, crestOffset)
    const to = side === 'us' ? Math.min(b.offset, crestOffset) : b.offset
    if (to < from - 1e-9 || !domainContains(from) || !domainContains(to)) continue

    const differenceAt = (offset: number): number =>
      sideLevelAt(offset) - existLevelAt([a, b], offset)
    const fromDifference = differenceAt(from)
    const toDifference = differenceAt(to)
    if (Math.abs(fromDifference) <= 1e-8) candidates.push(from)
    if (Math.abs(toDifference) <= 1e-8) candidates.push(to)
    if (fromDifference * toDifference < -1e-12) {
      candidates.push(
        from +
          ((0 - fromDifference) * (to - from)) /
            (toDifference - fromDifference)
      )
    }
  }

  const valid = candidates
    .filter(
      (offset) =>
        domainContains(offset) &&
        offset >= minOffset - 1e-9 &&
        offset <= maxOffset + 1e-9
    )
    .sort((a, b) => (side === 'us' ? b - a : a - b))
  const offset = valid[0]
  if (offset == null) return null
  return {
    offset: round3(offset),
    rl: round3(existLevelAt(sorted, offset))
  }
}

interface BundHeartingGeometry {
  upper: BundPoint[]
  base: BundPoint[]
}

function heartingGeometry(data: BundData, section: BundSection): BundHeartingGeometry {
  const design = data.heartingDesign
  const support = heartingSupportProfile(data, section)
  if (
    support.length < 2 ||
    design.topWidth <= 0 ||
    design.usSlope < 0 ||
    design.dsSlope < 0
  ) {
    return { upper: [], base: [] }
  }
  const halfTop = design.topWidth / 2
  const leftCrest = design.centerOffset - halfTop
  const rightCrest = design.centerOffset + halfTop
  const leftContact = heartingSideContact(
    support,
    'us',
    leftCrest,
    design.topLevel,
    design.usSlope
  )
  const rightContact = heartingSideContact(
    support,
    'ds',
    rightCrest,
    design.topLevel,
    design.dsSlope
  )
  if (!leftContact || !rightContact || rightContact.offset <= leftContact.offset + 1e-9) {
    return { upper: [], base: [] }
  }
  return {
    upper: [
      leftContact,
      { offset: round3(leftCrest), rl: round3(design.topLevel) },
      { offset: round3(rightCrest), rl: round3(design.topLevel) },
      rightContact
    ],
    base: profileWithin(support, leftContact.offset, rightContact.offset)
  }
}

/** Existing RL/formation-base portion enclosed by the full hearting zone. */
export function heartingBaseProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  return heartingGeometry(data, section).base
}

/**
 * Full proposed hearting boundary. In repair, each side stops at its first
 * contact with Existing RL. In new work it stops at the formation base.
 */
export function heartingRepairProfile(
  data: BundData,
  section: BundSection
): BundPoint[] {
  if (!isZonedBund(data)) return []
  return heartingGeometry(data, section).upper
}

/**
 * Hearting actually placed. It is intersected with ordinary formation, so it
 * cannot include existing earth, excavation, or space outside the casing.
 */
export function heartingRepairBands(
  data: BundData,
  section: BundSection
): BundProfileBand[] {
  const upper = heartingRepairProfile(data, section)
  const lower = heartingBaseProfile(data, section)
  const leveling = bundLevelingGeometry(data, section)
  if (upper.length < 2 || lower.length < 2 || !leveling) return []
  return intersectProfileBands(
    positiveProfileBands(upper, lower),
    leveling.formation
  )
}

// ---------------------------------------------------------------------------
// Cut-off trench under the hearting. A key cut from the prepared formation base
// down into tighter soil, backfilled with the same impervious material as the
// core, so seepage cannot travel under it. New work only: on a repair the bund
// already stands on its foundation and the trench cannot be dug without taking
// that bund down first.
// ---------------------------------------------------------------------------

/** Is the cut-off trench offered on this bund at all? */
export function heartingTrenchAvailable(data: BundData): boolean {
  return isZonedBund(data) && data.mode === 'new'
}

/** Trench on, with a backfill code attached and a real section to measure. */
export function heartingTrenchEnabled(data: BundData): boolean {
  return (
    heartingTrenchAvailable(data) &&
    Boolean(data.heartingTrench?.fillMaterial) &&
    heartingTrenchArea(data) > 0
  )
}

/**
 * Trapezoidal cut area: bottom width at the invert, widening by the two side
 * batters over the depth. Excavation and backfill are the same solid — the
 * trench is dug and filled back with impervious soil — so one area serves both.
 */
export function heartingTrenchArea(data: BundData): number {
  const trench = data.heartingTrench
  if (!trench) return 0
  const depth = Math.max(0, trench.depth || 0)
  const bottom = Math.max(0, trench.bottomWidth || 0)
  const us = Math.max(0, trench.usSlope || 0)
  const ds = Math.max(0, trench.dsSlope || 0)
  if (depth <= 0 || bottom <= 0) return 0
  return round3((bottom + ((us + ds) * depth) / 2) * depth)
}

/** Trench top width at the formation base — bottom width plus both batters. */
export function heartingTrenchTopWidth(data: BundData): number {
  const trench = data.heartingTrench
  if (!trench) return 0
  const depth = Math.max(0, trench.depth || 0)
  return round3(
    Math.max(0, trench.bottomWidth || 0) +
      (Math.max(0, trench.usSlope || 0) + Math.max(0, trench.dsSlope || 0)) * depth
  )
}

/**
 * The trench outline at one chainage, in section coordinates: the two top
 * corners on the formation base under the hearting, and the two invert corners
 * below them. Centred on the hearting's own centre offset, because the trench
 * exists to carry that core down — it follows the core, not the bund axis.
 */
export function heartingTrenchProfile(
  data: BundData,
  section: BundSection
): { top: BundPoint[]; bottom: BundPoint[] } {
  const empty = { top: [], bottom: [] }
  if (!heartingTrenchAvailable(data)) return empty
  const trench = data.heartingTrench
  const area = heartingTrenchArea(data)
  if (!trench || area <= 0) return empty
  const support = heartingSupportProfile(data, section)
  if (support.length < 2) return empty

  const centre = data.heartingDesign.centerOffset
  const halfTop = heartingTrenchTopWidth(data) / 2
  const leftTop = centre - halfTop
  const rightTop = centre + halfTop
  const sorted = [...support].sort((a, b) => a.offset - b.offset)
  if (
    leftTop < sorted[0].offset - 1e-9 ||
    rightTop > sorted[sorted.length - 1].offset + 1e-9
  ) {
    return empty
  }

  // The invert is level: a key trench is cut to one RL, taken from the base
  // directly under the core so the depth entered is the depth actually got.
  const baseAtCentre = existLevelAt(sorted, centre)
  const depth = Math.max(0, trench.depth || 0)
  const invertRl = round3(baseAtCentre - depth)
  const us = Math.max(0, trench.usSlope || 0)
  const ds = Math.max(0, trench.dsSlope || 0)
  return {
    top: profileWithin(sorted, leftTop, rightTop),
    bottom: [
      { offset: round3(leftTop + us * depth), rl: invertRl },
      { offset: round3(rightTop - ds * depth), rl: invertRl }
    ]
  }
}

/** Cut-off trench excavation / backfill, MSA'd along the chainage. */
export function heartingTrenchRows(data: BundData): BundQtyRow[] {
  if (!heartingTrenchEnabled(data)) return []
  const area = heartingTrenchArea(data)
  return quantityRowsBySection(data, () => area)
}

export interface BundHeartingTrenchIssue {
  code: 'too-wide' | 'below-hearting' | 'no-code'
  message: string
}

/** What would stop the trench being buildable or measurable as entered. */
export function heartingTrenchIssues(
  data: BundData,
  section: BundSection | null
): BundHeartingTrenchIssue[] {
  if (!heartingTrenchAvailable(data) || !data.heartingTrench?.fillMaterial) return []
  const issues: BundHeartingTrenchIssue[] = []
  if (heartingTrenchArea(data) <= 0) {
    issues.push({
      code: 'below-hearting',
      message:
        'Enter a trench depth and bottom width greater than zero before the cut-off trench can be measured.'
    })
    return issues
  }
  const topWidth = heartingTrenchTopWidth(data)
  const heartingBottom = section ? heartingBaseProfile(data, section) : []
  if (heartingBottom.length >= 2) {
    const heartingWidth =
      heartingBottom[heartingBottom.length - 1].offset - heartingBottom[0].offset
    if (topWidth > heartingWidth + 1e-6) {
      issues.push({
        code: 'too-wide',
        message:
          `The trench is ${round3(topWidth)} m wide at the formation base but the hearting ` +
          `only lands ${round3(heartingWidth)} m wide there. Narrow the trench, or widen the ` +
          `hearting, so the core sits over its own cut-off.`
      })
    }
  }
  if (!data.heartingTrench.excavationMaterial) {
    issues.push({
      code: 'no-code',
      message:
        'The trench backfill is billed but its excavation is not. Attach a foundation excavation code so the cut is paid for.'
    })
  }
  return issues
}

export interface BundZonedRepairAreas {
  totalFormation: number
  casing: number
  hearting: number
}

/** Material split of one zoned section. */
export function zonedRepairAreas(
  data: BundData,
  section: BundSection
): BundZonedRepairAreas {
  const totalFormation = sectionAreas(data, section).formation
  const hearting = round3(profileBandsArea(heartingRepairBands(data, section)))
  return {
    totalFormation,
    hearting,
    casing: round3(Math.max(0, totalFormation - hearting))
  }
}

export interface BundHeartingIssue {
  code:
    | 'missing-boundary'
    | 'no-intersection'
    | 'level-order'
    | 'outside-casing'
    | 'invalid-dimensions'
  message: string
}

/** Checks for the automatically terminated full hearting zone. */
export function heartingRepairIssues(
  data: BundData,
  section: BundSection
): BundHeartingIssue[] {
  if (!isZonedBund(data)) return []
  const design = data.heartingDesign
  const issues: BundHeartingIssue[] = []
  if (design.topWidth <= 0 || design.usSlope < 0 || design.dsSlope < 0) {
    issues.push({
      code: 'invalid-dimensions',
      message: 'Hearting top width must be greater than zero and its side slopes cannot be negative.'
    })
    return issues
  }
  const support = heartingSupportProfile(data, section)
  if (support.length < 2) {
    return [{
      code: 'missing-boundary',
      message:
        data.mode === 'restoration'
          ? 'Enter the surveyed Existing RL points to draw the full hearting zone.'
          : 'Enter the ground level for this chainage to draw the full hearting zone.'
    }]
  }
  const halfTop = design.topWidth / 2
  const supportBelowTop = profileWithin(
    support,
    design.centerOffset - halfTop,
    design.centerOffset + halfTop
  )
  const highestSupportAtCrest = Math.max(
    ...supportBelowTop.map((point) => point.rl)
  )
  if (design.topLevel <= highestSupportAtCrest + 1e-9) {
    issues.push({
      code: 'level-order',
      message:
        data.mode === 'restoration'
          ? 'Hearting top RL must be above the Existing RL beneath its top width.'
          : 'Hearting top RL must be above the new bund formation base.'
    })
  }
  if (design.topLevel > data.design.topLevel + 1e-9) {
    issues.push({
      code: 'outside-casing',
      message: 'Proposed hearting top RL cannot be above the proposed casing TBL.'
    })
  }
  const hearting = heartingRepairProfile(data, section)
  if (hearting.length < 4 && !issues.some((issue) => issue.code === 'level-order')) {
    issues.push({
      code: 'no-intersection',
      message:
        data.mode === 'restoration'
          ? 'The hearting side lines do not both touch the surveyed Existing RL. Enter enough survey width or adjust the hearting width, slopes, top RL, or offset.'
          : 'The hearting side lines do not both reach the new bund formation base inside the casing.'
    })
  }
  const casing = projectedProfile(section, data.design)
  if (
    hearting.length >= 2 &&
    casing.length >= 2 &&
    hearting.some(
      (point) =>
        point.offset < casing[0].offset - 1e-9 ||
        point.offset > casing[casing.length - 1].offset + 1e-9 ||
        point.rl > existLevelAt(casing, point.offset) + 1e-6
    )
  ) {
    issues.push({
      code: 'outside-casing',
      message: 'The proposed hearting extends outside the casing at this chainage. Reduce its width, slopes, top RL, or centre offset.'
    })
  }
  return issues
}

export function profileWidth(points: BundPoint[]): number {
  if (points.length < 2) return 0
  const offsets = points.map((p) => p.offset)
  return Math.max(...offsets) - Math.min(...offsets)
}

// ---------------------------------------------------------------------------
// Mean Sectional Area quantities. One row per consecutive pair of chainages.
// ---------------------------------------------------------------------------

export interface BundQtyRow {
  fromCh: number
  toCh: number
  lengthM: number
  areaFrom: number
  areaTo: number
  meanArea: number
  qty: number
}

/** Sections in chainage order, ignoring any that carry no usable geometry. */
export function orderedSections(data: BundData): BundSection[] {
  return [...data.sections].sort((a, b) => a.chainage - b.chainage)
}

/**
 * Mean Sectional Area rows for one measured quantity. `pick` selects which of
 * the three areas this run measures.
 */
export function quantityRows(
  data: BundData,
  pick: (areas: BundSectionAreas) => number
): BundQtyRow[] {
  const sections = orderedSections(data)
  const rows: BundQtyRow[] = []
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const lengthM = round3(to.chainage - from.chainage)
    if (lengthM <= 1e-6) continue
    const areaFrom = round3(pick(sectionAreas(data, from)))
    const areaTo = round3(pick(sectionAreas(data, to)))
    const meanArea = round3((areaFrom + areaTo) / 2)
    rows.push({
      fromCh: from.chainage,
      toCh: to.chainage,
      lengthM,
      areaFrom,
      areaTo,
      meanArea,
      qty: round3(meanArea * lengthM)
    })
  }
  return rows
}

export function rowsTotal(rows: BundQtyRow[]): number {
  return round3(rows.reduce((sum, row) => sum + row.qty, 0))
}

/** MSA rows from a value taken per whole section (rather than from its areas). */
export function quantityRowsBySection(
  data: BundData,
  pick: (section: BundSection) => number
): BundQtyRow[] {
  const sections = orderedSections(data)
  const rows: BundQtyRow[] = []
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const lengthM = round3(to.chainage - from.chainage)
    if (lengthM <= 1e-6) continue
    const areaFrom = round3(pick(from))
    const areaTo = round3(pick(to))
    const meanArea = round3((areaFrom + areaTo) / 2)
    rows.push({
      fromCh: from.chainage,
      toCh: to.chainage,
      lengthM,
      areaFrom,
      areaTo,
      meanArea,
      qty: round3(meanArea * lengthM)
    })
  }
  return rows
}

/** Developed length of a surveyed ground line — the surface distance across it. */
export function developedGroundLength(pre: BundPoint[]): number {
  if (pre.length < 2) return 0
  const sorted = [...pre].sort((a, b) => a.offset - b.offset)
  let len = 0
  for (let i = 1; i < sorted.length; i += 1) {
    len += Math.hypot(sorted[i].offset - sorted[i - 1].offset, sorted[i].rl - sorted[i - 1].rl)
  }
  return round3(len)
}

/**
 * Automatic jungle clearance: restoration uses the developed surveyed-ground
 * length; a new bund uses its designed seating/base width. Values at sections
 * A and B are averaged, then multiplied by the chainage interval. Chainage
 * zero supplies P1 only; it never creates a standalone quantity.
 */
export function clearancePerimeterRows(data: BundData): BundQtyRow[] {
  const sections = orderedSections(data)
  const rows: BundQtyRow[] = []
  const widthAt = (section: BundSection): number | null => {
    if (usesFlatGround(data, section)) {
      if (section.groundLevel == null) return null
      return sectionAreas(data, section).clearanceWidth
    }
    if (!hasMeasurableGround(data, section)) return null
    const proposed = projectedProfile(section, data.design)
    if (proposed.length < 2) return null
    return developedGroundLength(
      profileWithin(section.pre, proposed[0].offset, proposed[proposed.length - 1].offset)
    )
  }
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const areaFrom = widthAt(from)
    const areaTo = widthAt(to)
    if (areaFrom == null || areaTo == null) continue
    const lengthM = round3(to.chainage - from.chainage)
    if (lengthM <= 1e-6) continue
    const meanArea = round3((areaFrom + areaTo) / 2)
    rows.push({
      fromCh: from.chainage,
      toCh: to.chainage,
      lengthM,
      areaFrom,
      areaTo,
      meanArea,
      qty: round3(meanArea * lengthM)
    })
  }
  return rows
}

/** Area of one manual Length × Breadth clearance row. */
export function clearanceManualRowArea(
  row: BundData['clearanceManualRows'][number]
): number {
  return round3((row.length ?? 0) * (row.breadth ?? 0))
}

/** The clearance quantity (sq.m), honouring the chosen measurement mode. */
export function clearanceTotal(data: BundData): number {
  if (data.clearanceMode === 'manual') {
    return round3(
      (data.clearanceManualRows ?? []).reduce(
        (sum, row) => sum + clearanceManualRowArea(row),
        0
      )
    )
  }
  return rowsTotal(clearancePerimeterRows(data))
}

export function strippingRows(data: BundData): BundQtyRow[] {
  return quantityRows(data, (a) => a.stripping)
}

export function formationRows(data: BundData): BundQtyRow[] {
  return quantityRows(data, (a) => a.formation)
}

/** MSA rows for the outer casing portion of a zoned repair. */
export function casingRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => zonedRepairAreas(data, section).casing)
}

/** MSA rows for hearting between the surveyed existing and proposed zones. */
export function heartingRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => zonedRepairAreas(data, section).hearting)
}

// Turfing, pitching and the rock toe are all measured on the *proposed* bund.
// The slope length of each face is taken directly from the developed proposed
// points, so the upstream and downstream faces are measured independently — the
// two toe grounds are usually at different levels, giving each face its own
// length. This is not the single-height Excel formula on purpose.

/**
 * The layer thickness written into a pitching/revetment code, e.g. "45 cm thick"
 * → 0.45 m, "225 mm" → 0.225 m. Used for the drawing and for volume billing.
 */
export function parseThicknessM(text: string | undefined): number | null {
  if (!text) return null
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/i)
  if (!m) return null
  const value = Number(m[1])
  const unit = m[2].toLowerCase()
  const metres = unit === 'mm' ? value / 1000 : unit === 'cm' ? value / 100 : value
  return metres > 0 && metres < 2 ? metres : null
}

/** Pitching thickness (m): from the chosen code's description, else the fallback. */
export function pitchingThicknessM(data: BundData): number {
  return parseThicknessM(data.pitchingMaterial?.description) ?? data.pitchingThickness ?? 0.3
}

/** A CUM code bills pitching by volume (area × thickness); an SQM code by area. */
export function pitchingIsVolume(data: BundData): boolean {
  return /cu\.?\s*m|cum/i.test(data.pitchingMaterial?.unit ?? '')
}

/** Downstream face length left exposed after a rock toe covers its lower slope. */
export function turfingSlopeLengthAt(section: BundSection, data: BundData): number {
  const fullFace = faceSlopeLengths(section, data.design).ds
  if (!data.rockToeMaterial) return fullFace
  const rockToeHeight = rockToeHeightAt(section, data)
  const coveredFace = rockToeHeight * Math.hypot(1, downstreamToeFaceSlope(section, data))
  return round3(Math.max(0, fullFace - coveredFace))
}

/**
 * Turfing on the exposed downstream face: mean slope length × chainage →
 * sq.m. The lower face occupied by an enabled rock toe is not paid again as
 * turfing.
 */
export function turfingRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (s) => turfingSlopeLengthAt(s, data))
}

/** Average developed length from the bund crest to the downstream toe (m). */
export function averageDownstreamSlopeLength(data: BundData): number {
  const sections = orderedSections(data)
  if (sections.length === 0) return 0
  if (sections.length === 1) return round3(faceSlopeLengths(sections[0], data.design).ds)
  const run = sections[sections.length - 1].chainage - sections[0].chainage
  if (run <= 1e-6) {
    return round3(
      sections.reduce((sum, section) => sum + faceSlopeLengths(section, data.design).ds, 0) /
        sections.length
    )
  }
  const fullFaceRows = quantityRowsBySection(
    data,
    (section) => faceSlopeLengths(section, data.design).ds
  )
  return round3(rowsTotal(fullFaceRows) / run)
}

/** Number of downstream chutes: derived from spacing, or entered manually. */
export function resolvedChuteDrainCount(data: BundData): number {
  if (!data.chuteDrainLiningMaterial) return 0
  if (!data.chuteDrainUseSpacing) return Math.max(0, Math.round(data.chuteDrainCount || 0))
  const spacing = Math.max(0, data.chuteDrainSpacing || 0)
  if (spacing <= 1e-6) return 0
  const sections = orderedSections(data)
  const sectionRun =
    sections.length > 1 ? sections[sections.length - 1].chainage - sections[0].chainage : 0
  const bundRun = data.lengthM > 0 ? data.lengthM : sectionRun
  return bundRun > 0 ? Math.max(1, Math.ceil(bundRun / spacing)) : 0
}

export interface BundChuteDrainRow {
  index: number
  chainage: number
  /** Developed downstream slope length at this chute's chainage (m). */
  slopeLength: number
  excavationQty: number
  protectionArea: number
  liningQty: number
  protectionQty: number
}

/** Interpolated developed d/s slope length at an arbitrary chute chainage. */
export function downstreamSlopeLengthAtChainage(data: BundData, chainage: number): number {
  const sections = orderedSections(data)
  if (!sections.length) return 0
  const slopeAt = (section: BundSection): number =>
    faceSlopeLengths(section, data.design).ds
  if (chainage <= sections[0].chainage) return round3(slopeAt(sections[0]))
  const last = sections[sections.length - 1]
  if (chainage >= last.chainage) return round3(slopeAt(last))

  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    if (chainage > to.chainage) continue
    const run = to.chainage - from.chainage
    if (run <= 1e-9) return round3(slopeAt(to))
    const fraction = (chainage - from.chainage) / run
    return round3(slopeAt(from) + fraction * (slopeAt(to) - slopeAt(from)))
  }
  return 0
}

/** Chainage assigned to each chute for spacing or manual-count mode. */
export function chuteDrainChainages(data: BundData): number[] {
  const count = resolvedChuteDrainCount(data)
  if (count <= 0) return []
  const sections = orderedSections(data)
  const start = sections[0]?.chainage ?? 0
  const sectionEnd = sections.at(-1)?.chainage ?? start
  const sectionRun = Math.max(0, sectionEnd - start)
  const run = data.lengthM > 0 ? data.lengthM : sectionRun
  if (run <= 1e-9) return Array.from({ length: count }, () => round3(start))

  if (data.chuteDrainUseSpacing) {
    const spacing = Math.max(0, data.chuteDrainSpacing || 0)
    return Array.from({ length: count }, (_, index) =>
      round3(Math.min(start + index * spacing, start + run))
    )
  }

  if (count === 1) return [round3(start + run / 2)]
  return Array.from({ length: count }, (_, index) =>
    round3(start + (run * index) / (count - 1))
  )
}

/**
 * One calculation row per chute. Its developed length comes from the local
 * section, linearly interpolated when a chute falls between entered chainages.
 */
export function chuteDrainRows(data: BundData): BundChuteDrainRow[] {
  const width = Math.max(0, data.chuteDrainWidth || 0)
  const depth = Math.max(0, data.chuteDrainDepth || 0)
  const wettedPerimeter = chuteDrainWettedPerimeter(data)
  const liningThickness = Math.max(0, data.chuteDrainLiningThickness || 0)
  const measuredByArea = /sq\.?\s*m|sqm/i.test(
    data.chuteDrainLiningMaterial?.unit ?? ''
  )

  return chuteDrainChainages(data).map((chainage, index) => {
    const slopeLength = downstreamSlopeLengthAtChainage(data, chainage)
    const protectionArea = round3(slopeLength * wettedPerimeter)
    const liningQty = round3(protectionArea * liningThickness)
    return {
      index: index + 1,
      chainage,
      slopeLength,
      excavationQty: round3(slopeLength * width * depth),
      protectionArea,
      liningQty,
      protectionQty: measuredByArea ? protectionArea : liningQty
    }
  })
}

/** Total developed chute length down the local d/s faces. */
export function chuteDrainTotalLength(data: BundData): number {
  return round3(chuteDrainRows(data).reduce((sum, row) => sum + row.slopeLength, 0))
}

/** Excavated rectangular channel volume for all downstream chutes (cu.m). */
export function chuteDrainExcavationQuantity(data: BundData): number {
  return round3(chuteDrainRows(data).reduce((sum, row) => sum + row.excavationQty, 0))
}

/**
 * Concrete lining volume for the bed and two sides of a rectangular chute.
 * Per running metre: (clear width + 2 × depth) × lining thickness.
 */
export function chuteDrainLiningQuantity(data: BundData): number {
  return round3(chuteDrainRows(data).reduce((sum, row) => sum + row.liningQty, 0))
}

/** Bed-and-side surface area protected inside all chute channels (sq.m). */
export function chuteDrainProtectionArea(data: BundData): number {
  return round3(chuteDrainRows(data).reduce((sum, row) => sum + row.protectionArea, 0))
}

/**
 * The selected SSR unit controls measurement:
 * - SQM stone pitching/slab lining → protected bed-and-side area.
 * - CUM concrete/masonry lining → area × entered thickness.
 */
export function chuteDrainProtectionMeasurement(data: BundData): {
  quantity: number
  measure: 'area' | 'volume'
} {
  if (/sq\.?\s*m|sqm/i.test(data.chuteDrainLiningMaterial?.unit ?? '')) {
    return { quantity: chuteDrainProtectionArea(data), measure: 'area' }
  }
  return { quantity: chuteDrainLiningQuantity(data), measure: 'volume' }
}

function chuteDrainWettedPerimeter(data: BundData): number {
  return Math.max(0, data.chuteDrainWidth || 0) + 2 * Math.max(0, data.chuteDrainDepth || 0)
}

/** Stone pitching on the upstream face: mean slope length × chainage → sq.m. */
export function pitchingRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (s) => faceSlopeLengths(s, data.design).us)
}

/** Compacted graded-sand filter volume below the u/s revetment (cu.m). */
export function pitchingBeddingQuantity(data: BundData): number {
  if (!data.pitchingMaterial || !data.pitchingBeddingMaterial) return 0
  return round3(
    rowsTotal(pitchingRows(data)) * Math.max(0, data.pitchingBeddingThickness || 0)
  )
}

/** Graded-coarse-aggregate transition volume below u/s revetment (cu.m). */
export function pitchingMetalQuantity(data: BundData): number {
  if (!data.pitchingMaterial || !data.pitchingMetalEnabled) return 0
  return round3(
    rowsTotal(pitchingRows(data)) * Math.max(0, data.pitchingMetalThickness || 0)
  )
}

/** The u/s toe trench exists only as an anchorage detail of stone pitching. */
export function upstreamToeTrenchEnabled(data: BundData): boolean {
  return Boolean(data.upstreamToe.excavationMaterial)
}

/**
 * Quantity billed by the selected pitching code.
 * Pitching is restricted to the developed u/s slope. A SQM code includes the
 * thickness written into its rate; a CUM code measures slope area × thickness.
 * The toe anchorage is always a separate construction item.
 */
export function pitchingMeasuredQuantity(data: BundData): {
  quantity: number
  measure: 'area' | 'volume'
} {
  const slopeArea = rowsTotal(pitchingRows(data))
  if (!pitchingIsVolume(data)) return { quantity: slopeArea, measure: 'area' }

  return {
    quantity: round3(slopeArea * pitchingThicknessM(data)),
    measure: 'volume'
  }
}

interface CasagrandePhreaticBasis {
  g: number
  H: number
  proj: BundPoint[]
  /** The finished design toe used to locate the selected drainage boundary. */
  dsToe: BundPoint
  usToeX: number
  dsToeX: number
  waterRl: number
  entryX: number
  startX: number
  focusX: number
  s: number
  yAt: (offset: number) => number
}

/**
 * Casagrande base-parabola construction for a selected drainage boundary.
 * Without an override the focus is the true downstream design toe. A
 * horizontal blanket moves it to the blanket inlet; a rock toe moves it to the
 * upstream heel. The visible line is subsequently corrected to meet the
 * inclined rock-toe face above that mathematical focus.
 */
function casagrandePhreaticBasis(
  data: BundData,
  section: BundSection,
  boundary?: { focusX: number; datumRl: number }
): CasagrandePhreaticBasis | null {
  const { design } = data
  const proj = [...projectedProfile(section, design)].sort(
    (a, b) => a.offset - b.offset
  )
  if (proj.length < 2 || design.mwl == null) return null
  // The seepage runs through the bund, so the construction is set out from the
  // finished design toes, not from wherever the survey happens to stop.
  const dsToe = downstreamDesignToePointAt(section, data)
  if (!dsToe) return null
  // Casagrande's simple construction needs a horizontal datum through the
  // drainage outlet. Using the lowest stripped point anywhere under a widened
  // berm makes the whole curve drop merely because the footprint grew.
  const g = boundary?.datumRl ?? dsToe.rl
  const waterRl = Math.min(design.mwl, design.topLevel)
  const H = waterRl - g
  if (H <= 0) return null
  const toes = proposedToeOffsets(section, data)
  const usToeX = toes ? toes.us : proj[0].offset
  const dsToeX = dsToe.offset

  let entryX = -design.topWidth / 2
  for (let i = 1; i < proj.length; i += 1) {
    const a = proj[i - 1]
    const c = proj[i]
    if (a.offset > 0) break
    if (a.rl < waterRl && c.rl >= waterRl) {
      const t = (waterRl - a.rl) / (c.rl - a.rl || 1)
      entryX = a.offset + t * (c.offset - a.offset)
      break
    }
  }

  const startX = entryX - 0.3 * (entryX - usToeX)
  const focusX = boundary?.focusX ?? dsToeX
  const b = Math.max(0.5, focusX - startX)
  const s = round3(Math.sqrt(b * b + H * H) - b)
  const yAt = (offset: number): number => {
    const x = focusX - offset
    return Math.min(H, Math.sqrt(Math.max(0, s * s + 2 * x * s)))
  }

  return {
    g,
    H,
    proj,
    dsToe,
    usToeX,
    dsToeX,
    waterRl,
    entryX,
    startX,
    focusX,
    s,
    yAt
  }
}

/**
 * Slope of the downstream face where it lands on its toe (horizontal metres per
 * 1 m of fall). Without berms this is simply the d/s slope; below the lowest
 * shelf it is whatever slope that shelf hands down. The rock toe's exposed face
 * follows this, so the rock toe and the bund stay one continuous line.
 */
export function downstreamToeFaceSlope(section: BundSection, data: BundData): number {
  const fallback = Math.max(0, data.design.dsSlope || 0)
  const toeRl = downstreamDesignToePointAt(section, data)?.rl ?? null
  if (toeRl == null) return fallback
  const runs = faceSegments(data.design, 'ds', toeRl).filter(
    (segment) => segment.kind === 'slope'
  )
  const last = runs[runs.length - 1]
  if (!last) return fallback
  const drop = last.fromRl - last.toRl
  if (drop <= 1e-9) return fallback
  return Math.max(0, round3((last.toDistance - last.fromDistance) / drop))
}

/**
 * The downstream shelf that limits how tall the rock toe may be at a section,
 * if there is one. The rock toe is built against the outside of the face below
 * it; growing past the shelf would bury the berm it sits under.
 */
export function rockToeShelfLimit(section: BundSection, data: BundData): BundBerm | null {
  const toeRl = downstreamDesignToePointAt(section, data)?.rl ?? null
  if (toeRl == null) return null
  let lowest: BundBerm | null = null
  for (const berm of faceBerms(data.design, 'ds')) {
    if (berm.level <= toeRl + 1e-6) continue
    if (bermWidthAt(section, data, berm) <= 0) continue
    if (!lowest || berm.level < lowest.level) lowest = berm
  }
  return lowest
}

/** Tallest rock toe a section can carry: up to the crest, or to the shelf above it. */
export function rockToeMaxHeightAt(section: BundSection, data: BundData): number | null {
  const toeRl = downstreamDesignToePointAt(section, data)?.rl ?? null
  if (toeRl == null) return null
  const shelf = rockToeShelfLimit(section, data)
  const ceiling = shelf ? Math.min(data.design.topLevel, shelf.level) : data.design.topLevel
  return Math.max(0, round3(ceiling - toeRl))
}

/**
 * Height of the rubble rock toe at a section: the entered height, capped by the
 * face available above the toe — the crest, or the lowest berm shelf, which the
 * toe cannot rise through.
 */
export function rockToeHeightAt(section: BundSection, data: BundData): number {
  const limit = rockToeMaxHeightAt(section, data)
  const height = Math.max(0, data.rockToeHeight || 0)
  return round3(limit == null ? height : Math.min(height, limit))
}

/**
 * Base width of the rock toe where it meets the ground (m). `outerSlope`
 * defaults to the plain d/s slope; pass the local face slope at the toe when a
 * berm hands a different one down.
 */
export function rockToeBaseWidth(
  height: number,
  data: BundData,
  outerSlope: number = Math.max(0, data.design.dsSlope)
): number {
  return height <= 0
    ? 0
    : data.rockToeTopWidth + height * (data.rockToeInnerSlope + Math.max(0, outerSlope))
}

/** Base width at a section, following the face slope the toe actually lands at. */
export function rockToeBaseWidthAt(section: BundSection, data: BundData): number {
  return rockToeBaseWidth(
    rockToeHeightAt(section, data),
    data,
    downstreamToeFaceSlope(section, data)
  )
}

/** Rock-toe cross-section area (sq.m): a trapezium of the crest, height and slopes. */
export function rockToeAreaAt(section: BundSection, data: BundData): number {
  const h = rockToeHeightAt(section, data)
  if (h <= 0) return 0
  return (
    data.rockToeTopWidth * h +
    0.5 * h * h * (data.rockToeInnerSlope + downstreamToeFaceSlope(section, data))
  )
}

/** Rubble rock toe volume: mean cross-section × chainage → cu.m. */
export function rockToeRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (s) => rockToeAreaAt(s, data))
}

/**
 * Cross-sectional area of the standard IRR-CAW-5-11 filter:
 * - Behind: 0.20 m sand + 0.15 m 20 mm down CA + 0.15 m 40 mm down CA;
 * - Below: 0.15 m sand + 0.20 m 20 mm down CA + 0.65 m 40 mm down CA.
 *
 * The SSR rate is per CUM, so these code-defined layer thicknesses are not
 * exposed as duplicate user inputs.
 */
export function rockToeFilterAreaAt(section: BundSection, data: BundData): number {
  if (!data.rockToeMaterial || !data.rockToeFilterMaterial) return 0
  const h = rockToeHeightAt(section, data)
  if (h <= 0) return 0
  const baseWidth = rockToeBaseWidthAt(section, data)
  const innerFaceLength = Math.hypot(h, data.rockToeInnerSlope * h)
  return round3(
    baseWidth * BUND_ROCKTOE_FILTER_BELOW_M +
      innerFaceLength * BUND_ROCKTOE_FILTER_BEHIND_M
  )
}

/** Graded rock-toe filter volume: mean filter cross-section × chainage. */
export function rockToeFilterRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (s) => rockToeFilterAreaAt(s, data))
}

// ---------------------------------------------------------------------------
// Berms. The shelf itself is fill, so it is already inside the formation
// quantity — widening the section is exactly what a berm does. What a berm
// adds as separate items is the surfacing on the shelf and the longitudinal
// catch-water drain along its inner edge. Both are measured the way every
// other longitudinal element here is: a value per section, averaged with the
// next section, times the length between them.
// ---------------------------------------------------------------------------

/** SQM codes bill by area, CUM codes by volume; `fallback` covers a bare code. */
function measureFromUnit(
  ref: TemplateMaterialRef | null | undefined,
  fallback: 'area' | 'volume'
): 'area' | 'volume' {
  const unit = ref?.unit ?? ''
  if (/sq\.?\s*m|sqm/i.test(unit)) return 'area'
  if (/cu\.?\s*m|cum/i.test(unit)) return 'volume'
  return fallback
}

/** Centre-line offsets of one berm's two hinges, or null if it forms no shelf. */
export function bermShelfOffsets(
  design: BundDesign,
  berm: BundBerm
): [number, number] | null {
  const shelf = faceSegments(design, berm.side, berm.level - 1e-6).find(
    (segment) => segment.kind === 'shelf' && segment.berm?.id === berm.id
  )
  if (!shelf) return null
  const half = design.topWidth / 2
  const toOffset = (distance: number): number =>
    round3(berm.side === 'us' ? -half - distance : half + distance)
  return [toOffset(shelf.fromDistance), toOffset(shelf.toDistance)]
}

/**
 * Shelf width measured at one chainage: the full width wherever the shelf
 * occurs inside the fixed proposed profile, otherwise nothing. High existing
 * ground does not delete or lift the shelf; it is cut back to the design. A
 * berm stops only where that section's designed face is too shallow to reach
 * its RL, and the mean-sectional rows taper across that transition.
 */
export function bermWidthAt(section: BundSection, data: BundData, berm: BundBerm): number {
  if (!(berm.width > 0)) return 0
  const offsets = bermShelfOffsets(data.design, berm)
  if (!offsets) return 0
  const proposed = projectedProfile(section, data.design)
  if (proposed.length < 2) return 0
  const minOffset = proposed[0].offset
  const maxOffset = proposed[proposed.length - 1].offset
  for (const offset of offsets) {
    if (offset < minOffset - 1e-6 || offset > maxOffset + 1e-6) return 0
    if (Math.abs(existLevelAt(proposed, offset) - berm.level) > 1e-6) return 0
  }
  return berm.width
}

/** Top width of the berm's catch-water drain — a rectangular channel (m). */
export function bermDrainTopWidth(berm: BundBerm): number {
  return Math.max(0, berm.drainWidth || 0)
}

/**
 * Width actually surfaced. The catch-water drain is cut into the shelf and
 * carries its own protection item, so its channel is not surfaced twice.
 */
export function bermSurfacedWidthAt(
  section: BundSection,
  data: BundData,
  berm: BundBerm
): number {
  const width = bermWidthAt(section, data, berm)
  if (width <= 0) return 0
  const drain = berm.drainLiningMaterial ? bermDrainTopWidth(berm) : 0
  return round3(Math.max(0, width - drain))
}

/** Shelf plan area rows (sq.m) — the full shelf, before any drain deduction. */
export function bermShelfRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => bermWidthAt(section, data, berm))
}

/** Surfaced plan area rows (sq.m). */
export function bermSurfaceRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => bermSurfacedWidthAt(section, data, berm))
}

/**
 * Berm surfacing payment: an SQM code bills the shelf area (its thickness is
 * already in the rate); a CUM code bills that area × the entered thickness.
 */
export function bermSurfaceMeasurement(
  data: BundData,
  berm: BundBerm
): { quantity: number; measure: 'area' | 'volume' } {
  const area = rowsTotal(bermSurfaceRows(data, berm))
  const measure = measureFromUnit(
    berm.surfaceMaterial,
    berm.surfaceMaterial?.code === BUND_DEFAULT_BERM_MURUM_CODE ? 'volume' : 'area'
  )
  return {
    measure,
    quantity:
      measure === 'volume'
        ? round3(area * Math.max(0, berm.surfaceThickness || 0))
        : area
  }
}

/** Bed-and-side perimeter protected inside the berm drain (m per metre run). */
export function bermDrainWettedPerimeter(berm: BundBerm): number {
  return round3(
    Math.max(0, berm.drainWidth || 0) + 2 * Math.max(0, berm.drainDepth || 0)
  )
}

/** Berm-drain channel excavation rows (cu.m), over the length the berm exists. */
export function bermDrainExcavationRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  const channel = Math.max(0, berm.drainWidth || 0) * Math.max(0, berm.drainDepth || 0)
  return quantityRowsBySection(data, (section) =>
    bermWidthAt(section, data, berm) > 0 ? channel : 0
  )
}

/** Protected bed-and-side area rows for the berm drain (sq.m). */
export function bermDrainProtectionRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  const perimeter = bermDrainWettedPerimeter(berm)
  return quantityRowsBySection(data, (section) =>
    bermWidthAt(section, data, berm) > 0 ? perimeter : 0
  )
}

/** As for the toe drain: SQM stone → protected area, CUM lining → × thickness. */
export function bermDrainProtectionMeasurement(
  data: BundData,
  berm: BundBerm
): { quantity: number; measure: 'area' | 'volume' } {
  const area = rowsTotal(bermDrainProtectionRows(data, berm))
  const measure = measureFromUnit(
    berm.drainLiningMaterial,
    berm.drainLiningMaterial?.code === BUND_DEFAULT_BERM_DRAIN_STONE_CODE
      ? 'area'
      : 'volume'
  )
  return {
    measure,
    quantity:
      measure === 'volume'
        ? round3(area * Math.max(0, berm.drainLiningThickness || 0))
        : area
  }
}

/** Length of bund over which the berm actually forms a shelf (m). */
export function bermPresentLength(data: BundData, berm: BundBerm): number {
  if (!(berm.width > 0)) return 0
  return round3(rowsTotal(bermShelfRows(data, berm)) / berm.width)
}

/** How many entered sections carry this berm, for the card's status line. */
export function bermSectionCoverage(
  data: BundData,
  berm: BundBerm
): { present: number; total: number } {
  const sections = orderedSections(data)
  return {
    present: sections.filter((section) => bermWidthAt(section, data, berm) > 0).length,
    total: sections.length
  }
}

/** Tallest section of the proposed bund, above its lowest stripped base (m). */
export function maxBundHeight(data: BundData): number {
  let tallest = 0
  for (const section of data.sections) {
    const base = lowestStrippedLevelAt(section, data)
    if (base == null) continue
    tallest = Math.max(tallest, data.design.topLevel - base)
  }
  return round3(tallest)
}

/**
 * Berm levels suggested for one face: one every `drop` metres of fall below the
 * crest, stopping before the toe so the lowest shelf is not left sitting on the
 * ground. Below the trigger height a bund is normally built without berms, so
 * nothing is suggested.
 */
export function suggestedBermLevels(
  data: BundData,
  drop: number = BUND_DEFAULT_BERM_DROP
): number[] {
  const height = maxBundHeight(data)
  const step = Math.max(1, drop)
  if (height <= BUND_BERM_HEIGHT_TRIGGER) return []
  const baseRl = data.design.topLevel - height
  const levels: number[] = []
  for (
    let level = data.design.topLevel - step;
    level > baseRl + step / 2;
    level -= step
  ) {
    levels.push(round3(level))
  }
  return levels
}

export type BundBermIssueLevel = 'error' | 'warning' | 'note'

export interface BundBermIssue {
  level: BundBermIssueLevel
  message: string
}

/** Everything worth telling the user about one berm, worst first. */
export function bermIssues(data: BundData, berm: BundBerm): BundBermIssue[] {
  const issues: BundBermIssue[] = []
  const { design } = data
  const faceSlopeValue = berm.side === 'us' ? design.usSlope : design.dsSlope

  if (berm.level >= design.topLevel - 1e-9) {
    issues.push({
      level: 'error',
      message: `RL ${round3(berm.level)} is at or above the crest (TBL ${round3(
        design.topLevel
      )}), so no shelf is formed and nothing is measured.`
    })
  } else if (
    (design.berms ?? []).some(
      (other) =>
        other.id !== berm.id &&
        other.side === berm.side &&
        Math.abs(other.level - berm.level) < 1e-6 &&
        other.width > 0
    )
  ) {
    issues.push({
      level: 'error',
      message: `Another ${
        berm.side === 'us' ? 'upstream' : 'downstream'
      } shelf is already at RL ${round3(
        berm.level
      )}. Only one of them is formed — widen that one instead of adding a second at the same level.`
    })
  } else if (data.sections.length && bermPresentLength(data, berm) <= 1e-6) {
    issues.push({
      level: 'error',
      message:
        'The face never falls below this RL at any entered chainage, so this berm forms no shelf. Lower it, or check the section levels.'
    })
  }

  if (berm.width > 0 && berm.width < BUND_BERM_MIN_WIDTH) {
    issues.push({
      level: 'warning',
      message: `A ${round3(
        berm.width
      )} m shelf is below the ${BUND_BERM_MIN_WIDTH} m normally needed for inspection access.`
    })
  }

  const neighbour = (design.berms ?? []).find(
    (other) =>
      other.id !== berm.id &&
      other.side === berm.side &&
      Math.abs(other.level - berm.level) < 3 - 1e-9
  )
  if (neighbour) {
    issues.push({
      level: 'warning',
      message: `Another ${
        berm.side === 'us' ? 'upstream' : 'downstream'
      } berm sits at RL ${round3(
        neighbour.level
      )}, less than 3 m away vertically. Berms are normally spaced 6 to 10 m apart.`
    })
  }

  if (berm.slopeBelow != null && berm.slopeBelow > 0 && berm.slopeBelow < faceSlopeValue) {
    issues.push({
      level: 'warning',
      message: `The face below this berm (1:${round3(
        berm.slopeBelow
      )}) is steeper than above it (1:${round3(
        faceSlopeValue
      )}). Slopes normally flatten downwards.`
    })
  }

  if (berm.drainLiningMaterial) {
    if (bermDrainTopWidth(berm) >= berm.width - 1e-9) {
      issues.push({
        level: 'error',
        message: 'The drain is as wide as the shelf — nothing is left to surface or walk on.'
      })
    }
    if (!data.chuteDrainLiningMaterial) {
      issues.push({
        level: 'warning',
        message:
          'This berm drain has no outfall: enable chute drains so the water it collects is carried down the face instead of over it.'
      })
    }
  }

  return issues
}

/** Short label for a berm, e.g. "D/S berm at RL 96.500". */
export function bermLabel(berm: BundBerm): string {
  return `${berm.side === 'us' ? 'U/S' : 'D/S'} berm at RL ${berm.level.toFixed(3)}`
}

// ---------------------------------------------------------------------------
// Internal drainage filters and the phreatic (seepage) line.
//
// The phreatic line follows Casagrande's base parabola (Garg ch. 20.12):
// focus F at the inner end of the drainage, directrix distance S, and
//   S = √(b² + H²) − b,   y = √(S² + 2·x·S)   (x measured from F toward u/s)
// where H is the water depth above the stripped base and b runs from A — the
// point 0.3·(u/s wetted projection) upstream of where MWL meets the u/s face —
// to F. The drainage exists to keep this line inside the d/s face.
// ---------------------------------------------------------------------------

/**
 * Internal filters can only be built into NEW fill: the horizontal blanket sits
 * on the foundation under the embankment, and the chimney is raised inside the
 * body as the fill goes up. Neither can be placed beneath a bund that already
 * exists, so on a repair they are not offered or billed. A rock toe is
 * different — it is placed against the outside of the d/s toe, so it remains
 * available as a retrofit.
 */
export function internalFiltersAvailable(data: BundData): boolean {
  return data.mode === 'new'
}

/** Horizontal blanket: fixed section = length × thickness, × chainage → cu.m. */
export function horizontalFilterRows(data: BundData): BundQtyRow[] {
  const area = round3(
    Math.max(0, data.horizontalFilterLength) * Math.max(0, data.horizontalFilterThickness)
  )
  return quantityRowsBySection(data, () => area)
}

/**
 * Chimney height at a section: manual when typed, else up to MWL above the
 * stripped base (capped just below the crest), so it intercepts everything
 * below the phreatic entry.
 */
export function verticalFilterHeightAt(section: BundSection, data: BundData): number {
  if (data.verticalFilterHeight > 0) return data.verticalFilterHeight
  const g = lowestStrippedLevelAt(section, data)
  if (g == null) return 0
  const crestHeight = Math.max(0, data.design.topLevel - g)
  if (data.design.mwl == null) return round3(Math.max(0, crestHeight - 0.3))
  return round3(Math.min(Math.max(0, data.design.mwl - g), Math.max(0, crestHeight - 0.3)))
}

/** Vertical (chimney) filter: width × height per section, × chainage → cu.m. */
export function verticalFilterRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (s) =>
    round3(Math.max(0, data.verticalFilterWidth) * verticalFilterHeightAt(s, data))
  )
}

/** Stripped base RL at the centre-line of a section, or null before levels exist. */
export function strippedBaseLevelAt(section: BundSection, data: BundData): number | null {
  if (usesFlatGround(data, section)) {
    return section.groundLevel == null ? null : section.groundLevel - data.design.stripDepth
  }
  if (section.pre.length < 2) return null
  const stripped = strippedProfile(section, data.design)
  return stripped.length >= 2 ? existLevelAt(stripped, 0) : null
}

/**
 * Lowest stripped ground RL of a section — the u/s and d/s toes usually sit at
 * different levels, and the deepest submergence is measured from the lowest.
 */
export function lowestStrippedLevelAt(section: BundSection, data: BundData): number | null {
  if (usesFlatGround(data, section)) {
    return section.groundLevel == null ? null : section.groundLevel - data.design.stripDepth
  }
  if (section.pre.length < 2) return null
  // `strippedProfile` is already clipped to the bund footprint and includes
  // deeper local cuts where existing ground stands above the fixed design.
  const stripped = strippedProfile(section, data.design)
  return stripped.length ? Math.min(...stripped.map((point) => point.rl)) : null
}

/**
 * The dangerous section the drainage is designed at: the one with the lowest
 * ground RL, i.e. the deepest water against it (with MWL and TBL fixed along
 * the bund, deepest water and tallest bund are the same section).
 */
export function criticalSection(data: BundData): BundSection | null {
  let best: BundSection | null = null
  let bestDepth = -Infinity
  const waterRl = data.design.mwl ?? data.design.topLevel
  for (const s of data.sections) {
    const g = lowestStrippedLevelAt(s, data)
    if (g == null) continue
    const depth = waterRl - g
    if (depth > bestDepth) {
      bestDepth = depth
      best = s
    }
  }
  return best
}

/**
 * Section with the longest developed downstream face. The design slope ratio
 * is common to the bund, so this is the tallest/steepest visible section and
 * is the clearest single section for the phreatic-line schematic.
 */
export function steepestSection(data: BundData): BundSection | null {
  let best: BundSection | null = null
  let longestFace = -Infinity
  for (const section of data.sections) {
    const length = faceSlopeLengths(section, data.design).ds
    if (length > longestFace) {
      longestFace = length
      best = section
    }
  }
  return longestFace > 0 ? best : criticalSection(data)
}

export interface PhreaticGeometry {
  /** RL of the selected focus datum (design toe, rock-toe heel or drain level). */
  baseRl: number
  /** Water depth above the selected focus datum (m). */
  waterDepth: number
  /** Offsets of the u/s and d/s toes of the proposed bund. */
  usToeX: number
  dsToeX: number
  /** Entry point B on the u/s face, start point A, and the focus F. */
  entryX: number
  startX: number
  focusX: number
  /** Casagrande focal distance S (also the seepage q = K·S). */
  s: number
  /** Polyline of the phreatic line for this selected drainage boundary. */
  points: BundPoint[]
  /** True when no enabled drainage intercepts the line before the d/s face. */
  cutsFace: boolean
  /** Which drainage element controls the selected line, if any. */
  interceptedBy: 'chimney' | 'rocktoe' | 'blanket' | null
  /** Offset where the line is caught (chimney face / rock-toe entry); null = runs to the toe. */
  interceptX: number | null
  /** RL of the exact interception point, used to draw the line to the drainage boundary. */
  interceptRl: number | null
}

function casagrandeExitCorrectionRatio(alphaDegrees: number): number {
  const table = [
    { alpha: 30, ratio: 0.36 },
    { alpha: 60, ratio: 0.32 },
    { alpha: 90, ratio: 0.26 },
    { alpha: 120, ratio: 0.18 },
    { alpha: 135, ratio: 0.14 },
    { alpha: 150, ratio: 0.1 },
    { alpha: 180, ratio: 0 }
  ]
  const alpha = Math.max(
    table[0].alpha,
    Math.min(table[table.length - 1].alpha, alphaDegrees)
  )
  for (let i = 1; i < table.length; i += 1) {
    const low = table[i - 1]
    const high = table[i]
    if (alpha <= high.alpha) {
      const t = (alpha - low.alpha) / (high.alpha - low.alpha)
      return low.ratio + t * (high.ratio - low.ratio)
    }
  }
  return 0
}

/**
 * Casagrande phreatic line through the proposed design bund. The focus follows
 * the active drainage boundary: d/s toe without drainage, upstream heel for a
 * rock toe, and blanket inlet for a horizontal filter. The actual rock-toe line
 * is corrected to meet its inclined upstream face above the focus. A connected
 * chimney terminates the line on its upstream face and the blanket carries the
 * water downstream.
 */
export function phreaticGeometry(data: BundData, section: BundSection): PhreaticGeometry | null {
  const { design } = data
  const referenceBasis = casagrandePhreaticBasis(data, section)
  if (!referenceBasis) return null

  const hfOn =
    internalFiltersAvailable(data) &&
    Boolean(data.horizontalFilterMaterial) &&
    data.horizontalFilterLength > 0
  const blanketInletX = hfOn
    ? Math.max(
        referenceBasis.dsToeX - data.horizontalFilterLength,
        design.topWidth / 2
      )
    : null

  const rockToeHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  const rockToeOuterSlope = downstreamToeFaceSlope(section, data)
  const rockToeInnerBaseX =
    rockToeHeight > 0
      ? referenceBasis.dsToeX -
        rockToeBaseWidth(rockToeHeight, data, rockToeOuterSlope)
      : null
  const rockToeInnerCrestX =
    rockToeHeight > 0
      ? referenceBasis.dsToeX -
        Math.max(0, data.rockToeTopWidth || 0) -
        rockToeOuterSlope * rockToeHeight
      : null

  const selectedBoundary =
    blanketInletX != null
      ? { focusX: blanketInletX, datumRl: referenceBasis.g }
      : rockToeInnerBaseX != null
        ? { focusX: rockToeInnerBaseX, datumRl: referenceBasis.dsToe.rl }
        : null
  let basis = selectedBoundary
    ? casagrandePhreaticBasis(data, section, selectedBoundary)
    : referenceBasis
  if (!basis) return null

  let { g, H, usToeX, dsToeX, entryX, startX, focusX, s, yAt } = basis

  let interceptedBy: PhreaticGeometry['interceptedBy'] = null
  let interceptX: number | null = null
  let interceptRl: number | null = null

  // A horizontal blanket moves the focus to its upstream inlet. A connected
  // chimney is the first drainage boundary only when its entered height reaches
  // the phreatic line at that face; otherwise the blanket remains controlling.
  if (blanketInletX != null) {
    interceptX = focusX
    interceptRl = g + yAt(focusX)
    const chimneyTop =
      data.horizontalFilterThickness + verticalFilterHeightAt(section, data)
    if (data.verticalFilterMaterial && chimneyTop >= yAt(focusX) - 5e-3) {
      interceptedBy = 'chimney'
    } else {
      interceptedBy = 'blanket'
    }
  }

  let rockToeBaseCutX: number | null = null
  if (
    !interceptedBy &&
    rockToeHeight > 0 &&
    rockToeInnerBaseX != null &&
    rockToeInnerCrestX != null
  ) {
    const h = rockToeHeight
    if (h > 0) {
      const baseAboveDatum = basis.dsToe.rl - g
      const faceRiseAt = (offset: number): number => {
        const run = Math.max(1e-9, rockToeInnerCrestX - rockToeInnerBaseX)
        const t = Math.max(
          0,
          Math.min(1, (offset - rockToeInnerBaseX) / run)
        )
        return baseAboveDatum + t * h
      }
      const residual = (offset: number): number => faceRiseAt(offset) - yAt(offset)

      if (residual(rockToeInnerCrestX) >= -5e-3) {
        let low = rockToeInnerBaseX
        let high = rockToeInnerCrestX
        for (let i = 0; i < 48; i += 1) {
          const mid = (low + high) / 2
          if (residual(mid) < 0) low = mid
          else high = mid
        }
        rockToeBaseCutX = (low + high) / 2

        // Casagrande's egress correction moves the actual attachment point
        // down the inclined pervious face from the base-parabola intersection.
        const run = Math.max(1e-9, rockToeInnerCrestX - rockToeInnerBaseX)
        const theta = Math.atan2(h, run)
        const alpha = 180 - (theta * 180) / Math.PI
        const correction = casagrandeExitCorrectionRatio(alpha)
        const baseCutRise = faceRiseAt(rockToeBaseCutX) - baseAboveDatum
        const baseCutLength = Math.hypot(
          rockToeBaseCutX - rockToeInnerBaseX,
          baseCutRise
        )
        const actualLength = baseCutLength * (1 - correction)
        const scale = baseCutLength > 1e-9 ? actualLength / baseCutLength : 1
        interceptedBy = 'rocktoe'
        interceptX =
          rockToeInnerBaseX +
          (rockToeBaseCutX - rockToeInnerBaseX) * scale
        interceptRl = basis.dsToe.rl + baseCutRise * scale
      }
    }
  }

  // A rock toe controls the seepage boundary only when its inclined upstream
  // face actually catches the heel-focused parabola. If the entered toe is too
  // short, that construction has no valid outlet. Show the unsafe plain-bund
  // phreatic line instead of allowing the heel-focused parabola to plunge past
  // the missed toe and create a false downward tail.
  if (
    blanketInletX == null &&
    rockToeInnerBaseX != null &&
    interceptedBy !== 'rocktoe'
  ) {
    basis = referenceBasis
    g = basis.g
    H = basis.H
    usToeX = basis.usToeX
    dsToeX = basis.dsToeX
    entryX = basis.entryX
    startX = basis.startX
    focusX = basis.focusX
    s = basis.s
    yAt = basis.yAt
    interceptX = null
    interceptRl = null
    rockToeBaseCutX = null
  }

  const points: BundPoint[] = []
  if (
    interceptedBy === 'rocktoe' &&
    interceptX != null &&
    interceptRl != null &&
    rockToeBaseCutX != null
  ) {
    // Blend the base parabola into the corrected rock-toe attachment point.
    const transitionStartX = Math.max(
      startX,
      focusX - Math.max(0.5, rockToeBaseCutX - focusX)
    )
    const baseSteps = 18
    for (let i = 0; i <= baseSteps; i += 1) {
      const offset =
        startX + ((transitionStartX - startX) * i) / baseSteps
      points.push({ offset: round3(offset), rl: round3(g + yAt(offset)) })
    }
    const start = points[points.length - 1]
    const control = { offset: focusX, rl: g + yAt(focusX) }
    const correctionSteps = 8
    for (let i = 1; i <= correctionSteps; i += 1) {
      const t = i / correctionSteps
      const mt = 1 - t
      points.push({
        offset: round3(
          mt * mt * start.offset +
            2 * mt * t * control.offset +
            t * t * interceptX
        ),
        rl: round3(
          mt * mt * start.rl +
            2 * mt * t * control.rl +
            t * t * interceptRl
        )
      })
    }
  } else {
    const endX = interceptX ?? dsToeX
    const steps = 24
    const drawLength = Math.max(0, endX - startX)
    for (let i = 0; i <= steps; i += 1) {
      const offset = startX + (drawLength * i) / steps
      points.push({ offset: round3(offset), rl: round3(g + yAt(offset)) })
    }
  }

  return {
    baseRl: g,
    waterDepth: round3(H),
    usToeX: round3(usToeX),
    dsToeX: round3(dsToeX),
    entryX: round3(entryX),
    startX: round3(startX),
    focusX: round3(focusX),
    s,
    points,
    cutsFace: interceptedBy == null,
    interceptedBy,
    interceptX: interceptX == null ? null : round3(interceptX),
    interceptRl: interceptRl == null ? null : round3(interceptRl)
  }
}

// ---------------------------------------------------------------------------
// Toe elements (u/s toe trench, d/s toe drain). Each is a fixed trapezoidal
// trench dug the whole length. The d/s drain may have revetment over its bed
// and two sloping sides.
// ---------------------------------------------------------------------------

/** Trench cross-section area (sq.m): a trapezium of top, bottom and depth. */
export function toeExcavationArea(toe: BundToe): number {
  return round3(((toe.topWidth + toe.bottomWidth) / 2) * toe.depth)
}

/**
 * The two toes of the proposed bund: where each designed face meets the ground.
 *
 * This is NOT the same as the ends of the projected profile. That profile is
 * also sampled at every surveyed offset, so when the tape was run wider than
 * the bund its last point is a point of open ground well beyond the toe.
 * This locates the designed toe offsets only. Rock-toe and phreatic geometry
 * must combine the downstream offset with the proposed design RL via
 * `downstreamDesignToePointAt`; excavation/ground checks use the existing RL
 * via `downstreamToePointAt`.
 */
export function proposedToeOffsets(
  section: BundSection,
  data: BundData
): { us: number; ds: number } | null {
  const { design } = data
  const half = design.topWidth / 2
  const refreshedOffsets = sectionDesignOffsets(section, design)
  if (refreshedOffsets.length >= 2) {
    return {
      us: round3(Math.min(...refreshedOffsets)),
      ds: round3(Math.max(...refreshedOffsets))
    }
  }
  if (section.projected && section.projected.length >= 2) {
    return {
      us: round3(Math.min(...section.projected.map((point) => point.offset))),
      ds: round3(Math.max(...section.projected.map((point) => point.offset)))
    }
  }
  if (section.pre.length >= 2) {
    const us = faceToeDistance(section.pre, design, -1)
    const ds = faceToeDistance(section.pre, design, 1)
    if (us == null || ds == null) return null
    return { us: round3(-half - us), ds: round3(half + ds) }
  }
  if (section.groundLevel == null) return null
  if (bundHeight(section.groundLevel, design) <= 0) return null
  const baseRl = section.groundLevel - design.stripDepth
  if (baseRl >= design.topLevel) return null
  return {
    us: round3(-half - faceDistanceToLevel(design, 'us', baseRl)),
    ds: round3(half + faceDistanceToLevel(design, 'ds', baseRl))
  }
}

export interface BundSectionDesignIssue {
  side: BundBermSide
  message: string
}

/**
 * Why a section cannot be measured, if it cannot.
 *
 * A face only has a toe if the designed surface rises above the surveyed
 * ground somewhere and then comes back down to meet it. When the existing
 * ground stays above the design all the way out — an old bund taller than the
 * new section, or a crest RL set too low — the section never closes and there
 * is no footprint to measure. That is a design to correct, not a quantity to
 * bill, so it is reported here rather than measured.
 */
export function sectionDesignIssues(
  section: BundSection,
  data: BundData
): BundSectionDesignIssue[] {
  if (usesFlatGround(data, section) || section.pre.length < 2) return []
  if (section.designPointOffsets?.length) return []
  const issues: BundSectionDesignIssue[] = []
  const { design } = data
  for (const [side, direction] of [
    ['us', -1],
    ['ds', 1]
  ] as [BundBermSide, -1 | 1][]) {
    if (faceToeDistance(section.pre, design, direction) != null) continue
    const edge = (direction * design.topWidth) / 2
    const groundAtEdge = existLevelAt(section.pre, edge)
    issues.push({
      side,
      message:
        `The ${side === 'us' ? 'upstream' : 'downstream'} face cannot be located from these ` +
        `levels alone: existing RL ${round3(groundAtEdge)} at the crest edge is above the ` +
        `design surface (TBL ${round3(design.topLevel)}), and the ground stays above it all ` +
        `the way out, so there is no point where the face meets the ground. Enter the two toe ` +
        `ground RLs and press Populate design points to set the section out explicitly — that ` +
        `fixes the toes and the chart draws. If the toes are genuinely above TBL, the bund ` +
        `would sit below ground here: check TBL, the crest width and the face slopes.`
    })
  }
  return issues
}

/**
 * Existing-ground point at the designed downstream-toe offset.
 *
 * This is deliberately not the rock-toe anchor when formation raises the
 * proposed toe above existing ground. Use `downstreamDesignToePointAt` for
 * geometry attached to the finished bund.
 */
export function downstreamToePointAt(
  section: BundSection,
  data: BundData
): BundPoint | null {
  const toes = proposedToeOffsets(section, data)
  if (!toes) {
    // No usable design: fall back to the outermost thing that is known.
    const projected = projectedProfile(section, data.design)
    if (projected.length >= 2) return projected[projected.length - 1]
    const last = [...section.pre].sort((a, b) => a.offset - b.offset).at(-1)
    return last ?? null
  }
  const rl =
    section.pre.length >= 2
      ? existLevelAt(section.pre, toes.ds)
      : (section.groundLevel as number) - data.design.stripDepth
  return { offset: toes.ds, rl: round3(rl) }
}

/**
 * The theoretical downstream toe of the final designed bund profile, before a
 * rock toe is added. With no berm this is where the normal downstream slope
 * ends; with berms it is where the final outer face ends. It is independent of
 * any extra surveyed point beyond the bund footprint.
 */
export function downstreamDesignToePointAt(
  section: BundSection,
  data: BundData
): BundPoint | null {
  const projected = projectedProfile(section, data.design)
  if (projected.length < 2) return null
  const toes = proposedToeOffsets(section, data)
  if (!toes) return projected[projected.length - 1] ?? null
  return {
    offset: toes.ds,
    rl: round3(existLevelAt(projected, toes.ds))
  }
}

/** Existing/proposed ground RL at the downstream toe of a cross-section. */
export function downstreamToeGroundLevelAt(
  section: BundSection,
  data: BundData
): number | null {
  return downstreamToePointAt(section, data)?.rl ?? null
}

/**
 * Longitudinal toe-drain invert RL at a chainage. Start/end reference levels
 * define one straight falling grade; a single entered end is treated as level.
 */
export function toeDrainInvertLevelAt(section: BundSection, data: BundData): number | null {
  const toe = data.downstreamToe
  if (toe.invertLevel != null) return toe.invertLevel
  if (toe.invertStartLevel == null && toe.invertEndLevel == null) return null
  const startLevel = toe.invertStartLevel ?? toe.invertEndLevel!
  const endLevel = toe.invertEndLevel ?? toe.invertStartLevel!
  const sections = orderedSections(data)
  const startChainage = sections[0]?.chainage ?? 0
  const endChainage = sections.at(-1)?.chainage ?? startChainage
  if (Math.abs(endChainage - startChainage) < 1e-9) return startLevel
  const fraction = (section.chainage - startChainage) / (endChainage - startChainage)
  return round3(startLevel + fraction * (endLevel - startLevel))
}

/** Calculated D/S toe-drain depth from local ground down to the invert grade. */
/**
 * Existing ground along the toe drain itself.
 *
 * The drain is cut *outside* the bund, starting at the d/s toe and running
 * outward, where the ground normally keeps falling. Measuring its depth from
 * the RL at the toe therefore overstates it — often badly, since the trench
 * batters back on both sides and every false metre of depth widens it by
 * (left + right) metres as well. Any levels surveyed beyond the toe describe
 * that ground, so they are what the depth is taken from.
 *
 * Trench width depends on depth and depth depends on the ground across that
 * width, so the two are settled together; it converges in a pass or two. With
 * no levels beyond the toe this returns the toe RL, exactly as before.
 */
/**
 * Proposed (finished) level at the downstream toe — the level the drawn design
 * line ends at, which is not the same as the existing ground there whenever the
 * land falls away outside the bund.
 */
export function downstreamToeProposedLevelAt(
  section: BundSection,
  data: BundData
): number | null {
  return downstreamDesignToePointAt(section, data)?.rl ?? null
}

/** The level the toe drain is formed at: the proposed level, not the ground. */
export function toeDrainGroundLevelAt(section: BundSection, data: BundData): number | null {
  return (
    downstreamToeProposedLevelAt(section, data) ??
    downstreamToePointAt(section, data)?.rl ??
    null
  )
}

export interface BundToeDrainPlatform {
  /** Finished level the drain is formed at — the proposed level at the toe. */
  level: number
  /** Offsets the platform runs between (the drain's own top width). */
  fromOffset: number
  toOffset: number
  /** Earth needed to bring the ground up to that level (sq.m per metre run). */
  fillArea: number
  /** Ground standing above it that has to come off first (sq.m per metre run). */
  cutArea: number
}

/**
 * The formation platform for a toe element, on either face.
 *
 * Both toe elements are built to the *proposed* level, not on whatever the
 * existing ground is doing outside the bund. Where the ground is lower it is
 * filled up to that level across the element's own width; where an old bund
 * stands higher it is cut down to it. Only then is the trench dug and the wall
 * or lining built. Both platform cut and platform fill belong to the one
 * general bund-leveling operation; neither is added again to the component
 * trench quantity.
 *
 * Beyond the last surveyed level the ground is taken as flat — `existLevelAt`
 * carries the end RL outward — so a survey that stops at the toe simply means
 * level land, and any levels that are entered out there are used instead.
 */
export function toePlatformAt(
  section: BundSection,
  data: BundData,
  side: BundBermSide,
  width: number
): BundToeDrainPlatform | null {
  const toes = proposedToeOffsets(section, data)
  if (!toes) return null
  const projected = projectedProfile(section, data.design)
  if (projected.length < 2) return null
  const toeOffset = side === 'us' ? toes.us : toes.ds
  const level = round3(existLevelAt(projected, toeOffset))
  const span = Math.max(0, width)
  if (span <= 1e-9) return null
  const fromOffset = round3(side === 'us' ? toeOffset - span : toeOffset)
  const toOffset = round3(side === 'us' ? toeOffset : toeOffset + span)
  const platform: BundPoint[] = [
    { offset: fromOffset, rl: level },
    { offset: toOffset, rl: level }
  ]
  const ground: BundPoint[] =
    section.pre.length >= 2
      ? section.pre
      : [
          { offset: fromOffset, rl: level },
          { offset: toOffset, rl: level }
        ]
  return {
    level,
    fromOffset,
    toOffset,
    fillArea: round3(positiveProfileArea(platform, ground)),
    cutArea: round3(positiveProfileArea(ground, platform))
  }
}

export function toeDrainPlatformAt(
  section: BundSection,
  data: BundData
): BundToeDrainPlatform | null {
  return toePlatformAt(section, data, 'ds', toeDrainTopWidthAt(section, data))
}

/** Platform for the u/s pitching toe wall, formed to the proposed toe level. */
export function upstreamToePlatformAt(
  section: BundSection,
  data: BundData
): BundToeDrainPlatform | null {
  return toePlatformAt(section, data, 'us', Math.max(0, data.upstreamToe.topWidth || 0))
}

export function toeDrainDepthAt(section: BundSection, data: BundData): number {
  const invert = toeDrainInvertLevelAt(section, data)
  // Preserve older saved projects until the user supplies invert reference RLs.
  if (invert == null) return Math.max(0, data.downstreamToe.depth || 0)
  const ground = toeDrainGroundLevelAt(section, data)
  if (ground == null) return 0
  return round3(Math.max(0, ground - invert))
}

function toeDepthAt(section: BundSection, data: BundData, toe: BundToe): number {
  return toe === data.downstreamToe ? toeDrainDepthAt(section, data) : Math.max(0, toe.depth || 0)
}

function toeUsesSideSlopes(data: BundData, toe: BundToe): boolean {
  return (
    toe === data.downstreamToe &&
    (toe.invertLevel != null ||
      toe.invertStartLevel != null ||
      toe.invertEndLevel != null)
  )
}

/** Calculated top width of the trapezoidal D/S drain at one chainage. */
export function toeDrainTopWidthAt(section: BundSection, data: BundData): number {
  const depth = toeDrainDepthAt(section, data)
  return round3(
    Math.max(0, data.downstreamToe.bottomWidth || 0) +
      depth *
        (Math.max(0, data.downstreamToe.leftSlope || 0) +
          Math.max(0, data.downstreamToe.rightSlope || 0))
  )
}

export interface BundToeDrainCheck {
  depth: number
  topWidth: number
  invert: number | null
  /** Stripped base the embankment stands on at its downstream toe. */
  baseRl: number | null
  undercutsBase: boolean
}

/**
 * The toe drain is a shallow seepage collector cut outside the bund, not a
 * foundation trench. Its invert belongs above the stripped base the embankment
 * stands on — below that it undercuts the bund it exists to protect. Depth is
 * also expensive twice over: the sides batter back, so every extra metre widens
 * the trench by (left + right) metres and inflates both the excavation and the
 * revetment with it.
 */
export function toeDrainCheck(section: BundSection, data: BundData): BundToeDrainCheck {
  const invert = toeDrainInvertLevelAt(section, data)
  const ground = downstreamToeGroundLevelAt(section, data)
  const baseRl = ground == null ? null : round3(ground - data.design.stripDepth)
  return {
    depth: toeDrainDepthAt(section, data),
    topWidth: toeDrainTopWidthAt(section, data),
    invert,
    baseRl,
    undercutsBase: invert != null && baseRl != null && invert < baseRl - 1e-6
  }
}

/** Trapezoidal toe-trench area at one chainage. */
export function toeExcavationAreaAt(
  section: BundSection,
  data: BundData,
  toe: BundToe
): number {
  const depth = toeDepthAt(section, data, toe)
  if (toeUsesSideSlopes(data, toe)) {
    return round3(
      Math.max(0, toe.bottomWidth || 0) * depth +
        0.5 *
          depth *
          depth *
          (Math.max(0, toe.leftSlope || 0) + Math.max(0, toe.rightSlope || 0))
    )
  }
  return round3(((toe.topWidth + toe.bottomWidth) / 2) * depth)
}

/** Excavation rows for a toe; D/S depth follows its longitudinal invert RL. */
export function toeExcavationRows(data: BundData, toe: BundToe): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => toeExcavationAreaAt(section, data, toe))
}

/**
 * Developed width of the toe-drain revetment (m): bottom bed plus both sloping
 * sides. The open top is not protected.
 */
export function toeLiningDevelopedWidth(toe: BundToe): number {
  const top = Math.max(0, toe.topWidth || 0)
  const bottom = Math.max(0, toe.bottomWidth || 0)
  const depth = Math.max(0, toe.depth || 0)
  const sideRun = Math.abs(top - bottom) / 2
  return round3(bottom + 2 * Math.hypot(depth, sideRun))
}

/** Developed bed-and-side width at one chainage using its calculated depth. */
export function toeLiningDevelopedWidthAt(
  section: BundSection,
  data: BundData,
  toe: BundToe
): number {
  const depth = toeDepthAt(section, data, toe)
  if (toeUsesSideSlopes(data, toe)) {
    return round3(
      Math.max(0, toe.bottomWidth || 0) +
        depth * Math.hypot(1, Math.max(0, toe.leftSlope || 0)) +
        depth * Math.hypot(1, Math.max(0, toe.rightSlope || 0))
    )
  }
  const top = Math.max(0, toe.topWidth || 0)
  const bottom = Math.max(0, toe.bottomWidth || 0)
  const sideRun = Math.abs(top - bottom) / 2
  return round3(bottom + 2 * Math.hypot(depth, sideRun))
}

/** Toe-drain revetment rows: variable developed width × chainage → sq.m. */
export function toeBuildRows(data: BundData, toe: BundToe): BundQtyRow[] {
  return quantityRowsBySection(data, (section) =>
    toeLiningDevelopedWidthAt(section, data, toe)
  )
}

/** Whether the selected toe-drain protection is paid by concrete volume. */
export function toeBuildMeasure(toe: BundToe): 'area' | 'volume' {
  const unit = toe.buildMaterial?.unit ?? ''
  if (/sq\.?\s*m|sqm/i.test(unit)) return 'area'
  if (/cu\.?\s*m|cum/i.test(unit)) return 'volume'
  return toe.buildMaterial?.code === BUND_DEFAULT_TOE_CC_CODE ? 'volume' : 'area'
}

/** Effective lining thickness for a CUM toe-drain protection item. */
export function toeBuildThicknessM(toe: BundToe): number {
  return (
    (toe.liningThickness > 0 ? toe.liningThickness : null) ??
    parseThicknessM(toe.buildMaterial?.description) ??
    (toe.buildMaterial?.code === BUND_DEFAULT_TOE_CC_CODE ? 0.1 : 0.3)
  )
}

/**
 * Toe-drain protection payment:
 * - rubble/SQM code → developed bed-and-side area;
 * - CC/CUM code → that developed area × concrete thickness.
 */
export function toeBuildMeasurement(
  data: BundData,
  toe: BundToe
): { quantity: number; measure: 'area' | 'volume' } {
  const developedArea = rowsTotal(toeBuildRows(data, toe))
  const measure = toeBuildMeasure(toe)
  return {
    measure,
    quantity:
      measure === 'volume'
        ? round3(developedArea * toeBuildThicknessM(toe))
        : developedArea
  }
}

/**
 * Vertical construction depth below the rock-toe base.
 *
 * For CAW-5-11 this is the 1.00 m thickness of filter media below the toe; it
 * is not assumed to be 1.00 m of additional payable excavation. The payable
 * cut is derived below from the union of this bed and the already-prepared
 * bund surface at every section.
 */
export function rockToeFoundationExcavationDepth(data: BundData): number {
  return data.rockToeFilterMaterial
    ? BUND_ROCKTOE_FILTER_BELOW_M
    : Math.max(0, data.rockToeExcavationDepth)
}

export interface BundRockToeExcavationSection {
  fromOffset: number
  toOffset: number
  baseRl: number
  bottomRl: number
  /** General bund cut/stripping inside the rock-toe footprint. */
  levelingOverlapArea: number
  /** Additional cut below that prepared surface to form the toe/filter bed. */
  additionalArea: number
  /** One payable union, never the sum of two overlapping rectangles. */
  unionArea: number
}

function bandLevelAt(
  band: BundProfileBand,
  offset: number,
  edge: 'upper' | 'lower'
): number {
  const span = band.toOffset - band.fromOffset
  const fraction = span <= 1e-12 ? 0 : (offset - band.fromOffset) / span
  const from = edge === 'upper' ? band.upperFromRl : band.lowerFromRl
  const to = edge === 'upper' ? band.upperToRl : band.lowerToRl
  return from + fraction * (to - from)
}

function clipProfileBand(
  band: BundProfileBand,
  fromOffset: number,
  toOffset: number
): BundProfileBand | null {
  const from = Math.max(band.fromOffset, fromOffset)
  const to = Math.min(band.toOffset, toOffset)
  if (to <= from + 1e-9) return null
  return {
    fromOffset: from,
    toOffset: to,
    upperFromRl: bandLevelAt(band, from, 'upper'),
    upperToRl: bandLevelAt(band, to, 'upper'),
    lowerFromRl: bandLevelAt(band, from, 'lower'),
    lowerToRl: bandLevelAt(band, to, 'lower')
  }
}

/**
 * Intersection of a general cut band with a construction cut. The common part
 * ends at the shallower (higher) of their two piecewise-linear floors.
 */
function cutIntersectionArea(
  band: BundProfileBand,
  constructionFloor: BundPoint[]
): number {
  const offsets = [band.fromOffset, band.toOffset]
  const fromGap =
    band.lowerFromRl - existLevelAt(constructionFloor, band.fromOffset)
  const toGap =
    band.lowerToRl - existLevelAt(constructionFloor, band.toOffset)
  if (fromGap * toGap < -1e-12) {
    offsets.push(
      band.fromOffset +
        (fromGap / (fromGap - toGap)) * (band.toOffset - band.fromOffset)
    )
  }
  offsets.sort((a, b) => a - b)
  const upper = offsets.map((offset) => ({
    offset,
    rl: bandLevelAt(band, offset, 'upper')
  }))
  const lower = offsets.map((offset) => ({
    offset,
    rl: Math.max(
      bandLevelAt(band, offset, 'lower'),
      existLevelAt(constructionFloor, offset)
    )
  }))
  return positiveProfileArea(upper, lower)
}

/**
 * Is a separate rock-toe foundation excavation measured at all?
 *
 * Only on a repair. On a new bund the rock toe is built up with the embankment
 * on ground the general foundation excavation has already taken out, so there
 * is no second, deeper cut to pay for — measuring one would bill the same soil
 * twice.
 */
export function rockToeExcavationAvailable(data: BundData): boolean {
  return data.mode !== 'new'
}

/**
 * Rock-toe foundation excavation at one cross-section.
 *
 * The excavation is the union of the general bund cut passing through the
 * rock-toe footprint and the cut needed to reach the rock-toe/filter bed. Its
 * overlap is assigned only to the rock-toe excavation code.
 */
export function rockToeExcavationAt(
  section: BundSection,
  data: BundData
): BundRockToeExcavationSection | null {
  if (!rockToeExcavationAvailable(data)) return null
  if (!data.rockToeMaterial || !data.rockToeExcavationMaterial) return null
  if (!hasMeasurableGround(data, section)) return null
  const constructionDepth = rockToeFoundationExcavationDepth(data)
  const height = rockToeHeightAt(section, data)
  const dsToe = downstreamDesignToePointAt(section, data)
  const leveling = bundLevelingGeometry(data, section)
  if (!dsToe || !leveling || height <= 0 || constructionDepth <= 0) return null

  const toOffset = dsToe.offset
  const baseFromOffset = toOffset - rockToeBaseWidthAt(section, data)
  // The 0.50 m filter behind the inner face projects slightly upstream of the
  // rubble base at its heel. Only that cap can add excavation outside the
  // below-filter footprint; the rest lies above the base and is already inside
  // the deeper foundation cut.
  const innerSlope = Math.max(0, data.rockToeInnerSlope || 0)
  const behindHorizontal =
    data.rockToeFilterMaterial
      ? BUND_ROCKTOE_FILTER_BEHIND_M / Math.hypot(1, innerSlope)
      : 0
  const fromOffset = baseFromOffset - behindHorizontal
  const bottomRl = dsToe.rl - constructionDepth
  const clippedGeneralBase = leveling.stripping
    .map((band) => clipProfileBand(band, baseFromOffset, toOffset))
    .filter((band): band is BundProfileBand => band != null)
  const clippedGeneralBehind = leveling.stripping
    .map((band) => clipProfileBand(band, fromOffset, baseFromOffset))
    .filter((band): band is BundProfileBand => band != null)
  const levelingOverlapArea =
    profileBandsArea(clippedGeneralBase) +
    profileBandsArea(clippedGeneralBehind)
  const existing = profileWithin(leveling.existing, baseFromOffset, toOffset)
  const foundationBottom = [
    { offset: baseFromOffset, rl: bottomRl },
    { offset: toOffset, rl: bottomRl }
  ]
  const foundationArea = positiveProfileArea(existing, foundationBottom)
  const commonBaseArea = clippedGeneralBase.reduce(
    (sum, band) => sum + cutIntersectionArea(band, foundationBottom),
    0
  )
  const baseUnionArea = Math.max(
    0,
    profileBandsArea(clippedGeneralBase) + foundationArea - commonBaseArea
  )
  let behindUnionArea = profileBandsArea(clippedGeneralBehind)
  if (behindHorizontal > 1e-9) {
    const behindRise =
      (BUND_ROCKTOE_FILTER_BEHIND_M * innerSlope) /
      Math.hypot(1, innerSlope)
    const behindFloor = [
      { offset: fromOffset, rl: dsToe.rl + behindRise },
      { offset: baseFromOffset, rl: dsToe.rl }
    ]
    const behindArea = positiveProfileArea(
      profileWithin(leveling.existing, fromOffset, baseFromOffset),
      behindFloor
    )
    const commonBehindArea = clippedGeneralBehind.reduce(
      (sum, band) => sum + cutIntersectionArea(band, behindFloor),
      0
    )
    behindUnionArea = Math.max(
      0,
      profileBandsArea(clippedGeneralBehind) +
        behindArea -
        commonBehindArea
    )
  }
  const unionArea = baseUnionArea + behindUnionArea
  return {
    fromOffset: round3(fromOffset),
    toOffset: round3(toOffset),
    baseRl: round3(dsToe.rl),
    bottomRl: round3(bottomRl),
    levelingOverlapArea: round3(levelingOverlapArea),
    additionalArea: round3(Math.max(0, unionArea - levelingOverlapArea)),
    unionArea: round3(unionArea)
  }
}

function excludeSpanFromBands(
  bands: BundProfileBand[],
  fromOffset: number,
  toOffset: number
): BundProfileBand[] {
  const result: BundProfileBand[] = []
  for (const band of bands) {
    const left = clipProfileBand(band, band.fromOffset, Math.min(fromOffset, band.toOffset))
    const right = clipProfileBand(band, Math.max(toOffset, band.fromOffset), band.toOffset)
    if (left) result.push(left)
    if (right) result.push(right)
  }
  return result
}

/** Net general cut/stripping after rock-toe overlap is assigned to its code. */
export function bundNetStrippingBands(
  data: BundData,
  section: BundSection
): BundProfileBand[] {
  const leveling = bundLevelingGeometry(data, section)
  if (!leveling) return []
  const rockToe = rockToeExcavationAt(section, data)
  return rockToe
    ? excludeSpanFromBands(leveling.stripping, rockToe.fromOffset, rockToe.toOffset)
    : leveling.stripping
}

/** Foundation-excavation union under the rock toe, integrated by MSA. */
export function rockToeExcavationRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(
    data,
    (section) => rockToeExcavationAt(section, data)?.unionArea ?? 0
  )
}

/**
 * How much the fill basis is worth, so the dashboard can show the cost of the
 * choice instead of making the user work it out.
 */
export function fillBasisDelta(data: BundData): { existing: number; stripped: number } {
  const at = (basis: BundFillBasis): number =>
    rowsTotal(formationRows({ ...data, fillBasis: basis }))
  return { existing: at('existing'), stripped: at('stripped') }
}

// ---------------------------------------------------------------------------
// Sections. Chainages are materialized from the interval or the break list,
// carrying over the geometry of any previous section at the same chainage.
// ---------------------------------------------------------------------------

export function createSection(chainage: number): BundSection {
  return {
    id: newId(),
    chainage,
    groundLevel: null,
    pre: [],
    stripped: null,
    projected: null
  }
}

/** Every chainage a section sits at, including 0 and the far end. */
export function sectionChainages(data: BundData): number[] {
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
 * Rebuild the section list from the current chainages, keeping the geometry of
 * any existing section that sat at the same chainage.
 */
export function materializeSections(data: BundData, previous: BundSection[]): BundSection[] {
  return sectionChainages(data).map((chainage) => {
    const source = previous.find((s) => Math.abs(s.chainage - chainage) < 0.01)
    return source
      ? {
          ...source,
          chainage,
          pre: source.pre.map((p) => ({ ...p })),
          stripped: source.stripped?.map((p) => ({ ...p })) ?? null,
          projected: source.projected?.map((p) => ({ ...p })) ?? null,
          strippedOverrides: source.strippedOverrides?.map((p) => ({ ...p })),
          projectedOverrides: source.projectedOverrides?.map((p) => ({ ...p })),
          upstreamGroundLevel: source.upstreamGroundLevel ?? null,
          downstreamGroundLevel: source.downstreamGroundLevel ?? null,
          designPointOffsets: source.designPointOffsets
            ? [...source.designPointOffsets]
            : undefined
        }
      : createSection(chainage)
  })
}

/** Copy the surveyed/derived geometry of one section onto another. */
export function copySectionGeometry(target: BundSection, source: BundSection): BundSection {
  return {
    ...target,
    groundLevel: source.groundLevel,
    pre: source.pre.map((p) => ({ ...p })),
    stripped: source.stripped?.map((p) => ({ ...p })) ?? null,
    projected: source.projected?.map((p) => ({ ...p })) ?? null,
    strippedOverrides: source.strippedOverrides?.map((p) => ({ ...p })),
    projectedOverrides: source.projectedOverrides?.map((p) => ({ ...p })),
    upstreamGroundLevel: source.upstreamGroundLevel ?? null,
    downstreamGroundLevel: source.downstreamGroundLevel ?? null,
    designPointOffsets: source.designPointOffsets ? [...source.designPointOffsets] : undefined
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Item sync. One generated item per role in use, each carrying its grand-total
// quantity via `computedQuantity` (no spreadsheet). The DATA/rate resolves from
// the item code, so totals, seigniorage, and prints work unchanged.
// ---------------------------------------------------------------------------

export interface BundRequiredItem {
  role: BundItemRole
  ref: TemplateMaterialRef
  quantity: number
  /** Measurement basis used to generate the estimate item. */
  measure: 'area' | 'volume'
}

/**
 * The items this bund should generate. Rolling repeats the formation volume —
 * it is the same earth billed as a second operation, which is exactly why the
 * split only exists for codes that leave compaction out of the formation item.
 */
export function requiredItems(data: BundData): BundRequiredItem[] {
  const out: BundRequiredItem[] = []
  const pushExcavation = (
    role: BundExcavationRole,
    quantity: number,
    legacyRef: TemplateMaterialRef
  ): void => {
    const centralBands = data.excavationBands?.[role]
    const configuredBands =
      role === 'stripping' && data.soilBands?.length
        ? data.soilBands
        : centralBands ?? []
    const bands = configuredBands.filter(
      (band) => band.pct > 0 && band.material.code
    )
    if (!bands.length) {
      // Only truly legacy data has no central rows. If rows exist but all are
      // zero, keep the excavation visibly unbilled instead of silently falling
      // back to an old individual-card code.
      if (centralBands === undefined && !data.soilBands?.length) {
        out.push({ role, ref: legacyRef, quantity, measure: 'volume' })
      }
      return
    }
    for (const band of bands) {
      out.push({
        role,
        ref: band.material,
        quantity: round3((quantity * band.pct) / 100),
        measure: 'volume'
      })
    }
  }

  if (data.clearanceMaterial) {
    out.push({
      role: 'clearance',
      ref: data.clearanceMaterial,
      quantity: clearanceTotal(data),
      measure: 'area'
    })
  }

  // Every excavation quantity is classified centrally by soil/rock percentage.
  const strippingTotal = rowsTotal(strippingRows(data))
  pushExcavation('stripping', strippingTotal, data.strippingMaterial)

  // Formation already includes the level U/S toe-wall and D/S toe-drain
  // platforms. The component trenches below them are measured later.
  const formation = rowsTotal(formationRows(data))
  const formationEnabled = data.formationEnabled ?? true
  const compactionEnabled = data.compactionEnabled ?? true
  if (isZonedBund(data)) {
    const casing = rowsTotal(casingRows(data))
    const hearting = rowsTotal(heartingRows(data))
    out.push({
      role: 'casing',
      ref: data.formationMaterial,
      quantity: casing,
      measure: 'volume'
    })
    out.push({
      role: 'hearting',
      ref: data.heartingMaterial,
      quantity: hearting,
      measure: 'volume'
    })
    // The cut-off trench below the core: one solid, dug and filled back, so the
    // excavation and the impervious backfill carry the same volume.
    if (heartingTrenchEnabled(data)) {
      const trench = rowsTotal(heartingTrenchRows(data))
      out.push({
        role: 'hearting-trench',
        ref: data.heartingTrench.fillMaterial as TemplateMaterialRef,
        quantity: trench,
        measure: 'volume'
      })
      if (data.heartingTrench.excavationMaterial) {
        pushExcavation(
          'hearting-trench-exc',
          trench,
          data.heartingTrench.excavationMaterial
        )
      }
    }
  } else {
    if (formationEnabled) {
      out.push({
        role: 'formation',
        ref: data.formationMaterial,
        quantity: formation,
        measure: 'volume'
      })
    }
    if (compactionEnabled && !formationEnabled) {
      out.push({
        role: 'rolling',
        ref: data.rollingMaterial,
        quantity: formation,
        measure: 'volume'
      })
    }
  }

  // Optional surface / protection items. Turfing and pitching are slope areas;
  // the rock toe is a fixed rubble section along the downstream toe.
  if (data.turfingMaterial) {
    out.push({
      role: 'turfing',
      ref: data.turfingMaterial,
      quantity: rowsTotal(turfingRows(data)),
      measure: 'area'
    })
  }
  if (data.pitchingMaterial) {
    // The chosen code decides everything: an SQM code bills the slope area
    // (thickness is already in the rate); a CUM code bills volume = slope area ×
    // the thickness written into that code.
    const pitching = pitchingMeasuredQuantity(data)
    out.push({
      role: 'pitching',
      ref: data.pitchingMaterial,
      quantity: pitching.quantity,
      measure: pitching.measure
    })
    if (data.pitchingBeddingMaterial) {
      out.push({
        role: 'pitching-bedding',
        ref: data.pitchingBeddingMaterial,
        quantity: pitchingBeddingQuantity(data),
        measure: 'volume'
      })
    }
  }
  // U/S anchorage is controlled by pitching, but its excavation and built
  // volume are deliberately separate from the slope-pitching payment.
  if (upstreamToeTrenchEnabled(data)) {
    const toeVolume = rowsTotal(toeExcavationRows(data, data.upstreamToe))
    pushExcavation(
      'ustoe-exc',
      toeVolume,
      data.upstreamToe.excavationMaterial!
    )
    if (data.upstreamToe.buildMaterial) {
      out.push({
        role: 'ustoe-build',
        ref: data.upstreamToe.buildMaterial,
        quantity: toeVolume,
        measure: 'volume'
      })
    }
  }

  const downstreamToe = data.downstreamToe
  if (downstreamToe.excavationMaterial) {
    pushExcavation(
      'dstoe-exc',
      rowsTotal(toeExcavationRows(data, downstreamToe)),
      downstreamToe.excavationMaterial
    )
    if (downstreamToe.buildMaterial) {
      const protection = toeBuildMeasurement(data, downstreamToe)
      out.push({
        role: 'dstoe-build',
        ref: downstreamToe.buildMaterial,
        quantity: protection.quantity,
        measure: protection.measure
      })
    }
  }

  // Chutes are independent surface drains down the d/s slope. Their lining
  // material is the enable flag; excavation remains a separately paid item.
  if (data.chuteDrainLiningMaterial) {
    if (data.chuteDrainExcavationMaterial) {
      pushExcavation(
        'chute-exc',
        chuteDrainExcavationQuantity(data),
        data.chuteDrainExcavationMaterial
      )
    }
    const protection = chuteDrainProtectionMeasurement(data)
    out.push({
      role: 'chute-lining',
      ref: data.chuteDrainLiningMaterial,
      quantity: protection.quantity,
      measure: protection.measure
    })
  }

  // Berms. The shelf is fill and is already paid inside the formation item;
  // only its surfacing and its catch-water drain are billed here. Identical
  // berms sharing a code merge into one item further down.
  for (const berm of data.design.berms ?? []) {
    if (berm.surfaceMaterial) {
      const surfacing = bermSurfaceMeasurement(data, berm)
      out.push({
        role: 'berm-surface',
        ref: berm.surfaceMaterial,
        quantity: surfacing.quantity,
        measure: surfacing.measure
      })
    }
    if (berm.drainLiningMaterial) {
      if (berm.drainExcavationMaterial) {
        pushExcavation(
          'berm-drain-exc',
          rowsTotal(bermDrainExcavationRows(data, berm)),
          berm.drainExcavationMaterial
        )
      }
      const protection = bermDrainProtectionMeasurement(data, berm)
      out.push({
        role: 'berm-drain-lining',
        ref: berm.drainLiningMaterial,
        quantity: protection.quantity,
        measure: protection.measure
      })
    }
  }

  if (data.rockToeMaterial) {
    out.push({
      role: 'rocktoe',
      ref: data.rockToeMaterial,
      quantity: rowsTotal(rockToeRows(data)),
      measure: 'volume'
    })
    if (data.rockToeFilterMaterial) {
      out.push({
        role: 'rocktoe-filter',
        ref: data.rockToeFilterMaterial,
        quantity: rowsTotal(rockToeFilterRows(data)),
        measure: 'volume'
      })
    }
    // Excavation is the union of the rock-toe/filter bed cut and the general
    // leveling cut inside its footprint; the overlap is billed here only.
    if (
      rockToeExcavationAvailable(data) &&
      data.rockToeExcavationMaterial &&
      rockToeFoundationExcavationDepth(data) > 0
    ) {
      pushExcavation(
        'rocktoe-exc',
        rowsTotal(rockToeExcavationRows(data)),
        data.rockToeExcavationMaterial
      )
    }
  }

  // Internal drainage filters. The chimney only bills while the horizontal
  // blanket is on — it needs the blanket to carry its water to the toe.
  // Internal filters need new fill — never generated on a repair.
  if (internalFiltersAvailable(data) && data.horizontalFilterMaterial) {
    out.push({
      role: 'hfilter',
      ref: data.horizontalFilterMaterial,
      quantity: rowsTotal(horizontalFilterRows(data)),
      measure: 'volume'
    })
    if (data.verticalFilterMaterial) {
      out.push({
        role: 'vfilter',
        ref: data.verticalFilterMaterial,
        quantity: rowsTotal(verticalFilterRows(data)),
        measure: 'volume'
      })
    }
  }

  // One SSR code billed at one rate is one line, however many places on the
  // bund it came from: the four excavations that all run on CAW-1-1 must not
  // reach the abstract as four identical rows. Merging is by code and DATA
  // variant, not by role — except for the zoned roles, where casing and
  // hearting are deliberately kept apart even when they share a code.
  const separatelyNamed = new Set<BundItemRole>([
    'casing',
    'casing-rolling',
    'hearting',
    'hearting-rolling',
    'hearting-trench'
  ])
  const combined = new Map<string, BundRequiredItem>()
  for (const item of out.filter((candidate) => candidate.quantity > 0)) {
    const variant = item.ref.dataVariant
      ? `${item.ref.dataVariant.key}:${item.ref.dataVariant.addonId ?? ''}`
      : ''
    const key = separatelyNamed.has(item.role)
      ? `${item.role}::${item.ref.code}::${variant}`
      : `${item.ref.code}::${variant}::${item.measure}`
    const existing = combined.get(key)
    combined.set(
      key,
      existing
        ? { ...existing, quantity: round3(existing.quantity + item.quantity) }
        : item
    )
  }
  return [...combined.values()]
}

// ---------------------------------------------------------------------------
// Material-ref resolution
//
// Codes are seeded as bare `{ code }` refs, so a ref carries no description,
// unit, category or source until its master row has been looked up. An item
// node built from a bare ref has no categoryKey, which makes `fetchRateAnalysis`
// treat a perfectly ordinary SSR item as a custom one and refuse to load its
// recipe — and leaves the abstract with no description to print. Everything
// below exists so that resolution is driven off the data itself rather than a
// hand-maintained list of fields that new roles keep falling out of.
// ---------------------------------------------------------------------------

/** Master metadata needed to turn a bare code into a usable ref. */
export interface BundMasterMetadata {
  description?: string
  unit?: string | null
  category?: string
  side?: ItemSource
}

/** True once a ref carries enough to build a working item node. */
export function isResolvedMaterialRef(ref: TemplateMaterialRef | null | undefined): boolean {
  return Boolean(ref && ref.code && ref.categoryKey && ref.unit != null)
}

/**
 * Rebuild a bund with every material ref passed through `visit`, wherever that
 * ref lives — top level, inside either toe, on a berm, or in a soil band. One
 * traversal serves both "which codes still need looking up" and "fill them in".
 */
export function mapBundMaterialRefs(
  data: BundData,
  visit: (ref: TemplateMaterialRef) => TemplateMaterialRef
): BundData {
  const opt = (ref: TemplateMaterialRef | null | undefined): TemplateMaterialRef | null =>
    ref ? visit(ref) : null
  const toe = (t: BundToe): BundToe => ({
    ...t,
    excavationMaterial: opt(t.excavationMaterial),
    buildMaterial: opt(t.buildMaterial)
  })
  const bands = (list: BundSoilBand[] | undefined): BundSoilBand[] | undefined =>
    list?.map((band) => ({ ...band, material: visit(band.material) }))

  return {
    ...data,
    clearanceMaterial: opt(data.clearanceMaterial),
    strippingMaterial: visit(data.strippingMaterial),
    formationMaterial: visit(data.formationMaterial),
    rollingMaterial: visit(data.rollingMaterial),
    heartingMaterial: visit(data.heartingMaterial),
    heartingRollingMaterial: visit(data.heartingRollingMaterial),
    heartingTrench: data.heartingTrench
      ? {
          ...data.heartingTrench,
          fillMaterial: opt(data.heartingTrench.fillMaterial),
          excavationMaterial: opt(data.heartingTrench.excavationMaterial)
        }
      : data.heartingTrench,
    turfingMaterial: opt(data.turfingMaterial),
    pitchingMaterial: opt(data.pitchingMaterial),
    pitchingBeddingMaterial: opt(data.pitchingBeddingMaterial),
    pitchingMetalMaterial: opt(data.pitchingMetalMaterial),
    horizontalFilterMaterial: opt(data.horizontalFilterMaterial),
    verticalFilterMaterial: opt(data.verticalFilterMaterial),
    rockToeMaterial: opt(data.rockToeMaterial),
    rockToeFilterMaterial: opt(data.rockToeFilterMaterial),
    rockToeExcavationMaterial: opt(data.rockToeExcavationMaterial),
    chuteDrainLiningMaterial: opt(data.chuteDrainLiningMaterial),
    chuteDrainExcavationMaterial: opt(data.chuteDrainExcavationMaterial),
    upstreamToe: toe(data.upstreamToe),
    downstreamToe: toe(data.downstreamToe),
    soilBands: bands(data.soilBands) ?? data.soilBands,
    excavationBands: data.excavationBands
      ? (Object.fromEntries(
          Object.entries(data.excavationBands).map(([role, list]) => [role, bands(list) ?? []])
        ) as BundData['excavationBands'])
      : data.excavationBands,
    design: {
      ...data.design,
      berms: (data.design.berms ?? []).map((berm) => ({
        ...berm,
        surfaceMaterial: opt(berm.surfaceMaterial),
        drainLiningMaterial: opt(berm.drainLiningMaterial),
        drainExcavationMaterial: opt(berm.drainExcavationMaterial)
      }))
    }
  }
}

/** Distinct codes still missing their master metadata. */
export function unresolvedBundMaterialCodes(data: BundData): string[] {
  const codes = new Set<string>()
  mapBundMaterialRefs(data, (ref) => {
    if (ref.code && !isResolvedMaterialRef(ref)) codes.add(ref.code)
    return ref
  })
  return [...codes]
}

/**
 * Fill every ref whose code appears in `byCode`. Anything already resolved, or
 * whose master was not found, is left exactly as it was — a partial lookup
 * improves what it can rather than discarding the rest.
 */
export function applyBundMasterMetadata(
  data: BundData,
  byCode: Map<string, BundMasterMetadata>
): BundData {
  return mapBundMaterialRefs(data, (ref) => {
    if (isResolvedMaterialRef(ref)) return ref
    const master = byCode.get(ref.code)
    if (!master) return ref
    return {
      ...ref,
      description: ref.description ?? master.description,
      unit: ref.unit ?? master.unit,
      categoryKey: ref.categoryKey ?? master.category,
      side: ref.side ?? master.side
    }
  })
}

/** Create/update/remove the component's generated items to match what is in use. */
export function syncBundItems(root: ProjectNode, componentId: string): ProjectNode {
  const component = findNode(root, componentId)
  const data = component?.bund
  if (!component || !data) return root

  const required = requiredItems(data)
  const registry = data.materialItems ?? []
  const keyOf = (role: string, code: string): string => `${role}::${code}`

  let next = root
  const nextRegistry: BundMaterialItem[] = []
  const usedKeys = new Set<string>()

  for (const req of required) {
    const key = keyOf(req.role, req.ref.code)
    if (usedKeys.has(key)) continue
    usedKeys.add(key)
    const zonedRole = new Set<BundItemRole>([
      'casing',
      'casing-rolling',
      'hearting',
      'hearting-rolling',
      'hearting-trench'
    ]).has(req.role)
    const existingNode = registry.find(
      (m) => m.role === req.role && m.code === req.ref.code
    )
    const prior = existingNode ? findNode(next, existingNode.itemNodeId) : null
    // A bare ref must never overwrite metadata a resolved one already wrote:
    // losing categoryKey here is what makes the recipe panel report a perfectly
    // ordinary SSR item as custom.
    const keep = <T,>(incoming: T | undefined, held: T | undefined): T | undefined =>
      incoming ?? held
    const patch = {
      name: zonedRole ? `${req.ref.code} - ${roleLabel(req.role)}` : req.ref.code,
      itemSource: keep(req.ref.side, prior?.itemSource),
      itemCode: req.ref.code,
      itemDescription: keep(req.ref.description, prior?.itemDescription),
      itemEditorType: 'spreadsheet' as const,
      unit: keep(req.ref.unit ?? undefined, prior?.unit ?? undefined),
      categoryKey: keep(req.ref.categoryKey, prior?.categoryKey),
      dataVariant: keep(req.ref.dataVariant, prior?.dataVariant),
      computedQuantity: req.quantity,
      spreadsheet: undefined,
      finalCell: undefined,
      templateGenerated: true,
      templateOwnerId: componentId,
      templateItemRole: req.role
    }
    const existing = existingNode
    if (existing && findNode(next, existing.itemNodeId)) {
      next = patchNode(next, existing.itemNodeId, patch)
      nextRegistry.push(existing)
    } else {
      const item = createNode('item', req.ref.code, patch)
      next = addChildAt(next, componentId, item)
      nextRegistry.push({ role: req.role, code: req.ref.code, itemNodeId: item.id })
    }
  }

  // Drop every generated item this component owns that the new registry does
  // not claim.
  //
  // This deliberately sweeps the component's children rather than walking the
  // old registry. A node only reachable through a registry entry is orphaned
  // the moment that entry is lost — which happens whenever the sync runs
  // against a bund whose materialItems came from a stale snapshot. Those
  // orphans are invisible to a registry-based cleanup, so they survive every
  // later sync, accumulate, and reach the abstract as repeated codes with no
  // description. Sweeping by ownership also repairs projects that already
  // carry them.
  const claimed = new Set(nextRegistry.map((entry) => entry.itemNodeId))
  const component2 = findNode(next, componentId)
  for (const child of component2?.children ?? []) {
    if (
      child.kind === 'item' &&
      child.templateGenerated &&
      child.templateOwnerId === componentId &&
      !claimed.has(child.id)
    ) {
      next = removeNode(next, child.id)
    }
  }

  return patchNode(next, componentId, { bund: { ...data, materialItems: nextRegistry } })
}

/** addChild that keeps generated items grouped after any manual items. */
function addChildAt(root: ProjectNode, parentId: string, child: ProjectNode): ProjectNode {
  const parent = findNode(root, parentId)
  if (!parent) return root
  return patchNode(root, parentId, { children: [...parent.children, child] })
}

export function bundModeLabel(mode: BundData['mode']): string {
  return mode === 'new' ? 'New bund' : 'Repair'
}

export function roleLabel(role: BundItemRole): string {
  if (role === 'clearance') return 'Jungle clearance'
  if (role === 'stripping') return 'Stripping / bund seating excavation'
  if (role === 'rolling') return 'Rolling for compaction'
  if (role === 'casing') return 'Zoned embankment - casing formation'
  if (role === 'casing-rolling') return 'Zoned embankment - casing compaction'
  if (role === 'hearting') return 'Zoned embankment - hearting formation'
  if (role === 'hearting-rolling') return 'Zoned embankment - hearting compaction'
  if (role === 'hearting-trench') return 'Hearting cut-off trench - impervious filling'
  if (role === 'hearting-trench-exc') return 'Hearting cut-off trench - foundation excavation'
  if (role === 'turfing') return 'Turfing (d/s slope)'
  if (role === 'pitching') return 'Stone pitching (u/s slope)'
  if (role === 'pitching-bedding') return 'Designed sand filter below u/s revetment'
  if (role === 'pitching-metal') return 'Legacy upstream graded-metal item'
  if (role === 'rocktoe') return 'Rock toe (d/s)'
  if (role === 'rocktoe-filter') return 'Graded filter below and behind rock toe (d/s)'
  if (role === 'rocktoe-exc') return 'Rock toe foundation excavation'
  if (role === 'hfilter') return 'Horizontal drainage filter (sand blanket)'
  if (role === 'vfilter') return 'Vertical chimney filter'
  if (role === 'ustoe-exc') return 'U/S pitching toe anchorage — excavation'
  if (role === 'ustoe-build') return 'U/S pitching toe wall / anchorage'
  if (role === 'dstoe-exc') return 'D/S toe drain — filter-drain trench excavation'
  if (role === 'dstoe-build') return 'D/S toe drain — bed and side protection'
  if (role === 'chute-exc') return 'D/S chute drains — channel cutting'
  if (role === 'chute-lining') return 'D/S chute drains — channel protection'
  if (role === 'berm-surface') return 'Berm shelf surfacing'
  if (role === 'berm-drain-exc') return 'Berm catch-water drain — channel cutting'
  if (role === 'berm-drain-lining') return 'Berm catch-water drain — protection'
  return 'Embankment formation'
}
