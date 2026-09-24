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
} from '../../types/project'
import { createNode, findNode, newId, patchNode, removeNode } from '../tree'
import { round3 } from './math'

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
/** Optional surface/protection items from the DAW embankment chapter. */
export const BUND_DEFAULT_TURFING_CODE = 'IRR-DAW-6-15'
/** Default freeboard for a newly formed bund; repairs retain their entered TBL. */
export const BUND_DEFAULT_FREEBOARD = 1.5
/** 600 mm through-stone revetment over 450 mm graded filter backing. */
export const BUND_DEFAULT_PITCHING_CODE = 'IRR-DAW-6-10'
export const BUND_DAW_REVETMENT_OPTIONS = [
  {
    code: 'IRR-DAW-6-10',
    construction: 'Through-stone revetment',
    stoneThickness: 0.6,
    filterThickness: 0.45,
    throughStones: true
  },
  {
    code: 'IRR-DAW-6-11',
    construction: 'Through-stone revetment',
    stoneThickness: 0.6,
    filterThickness: 0.6,
    throughStones: true
  },
  {
    code: 'IRR-DAW-6-12',
    construction: 'Riprap',
    stoneThickness: 0.6,
    filterThickness: 0.45,
    throughStones: false
  },
  {
    code: 'IRR-DAW-6-13',
    construction: 'Riprap',
    stoneThickness: 0.75,
    filterThickness: 0.45,
    throughStones: false
  },
  {
    code: 'IRR-DAW-6-14',
    construction: 'Riprap',
    stoneThickness: 0.9,
    filterThickness: 0.45,
    throughStones: false
  }
] as const
export const BUND_DAW_REVETMENT_CODES = BUND_DAW_REVETMENT_OPTIONS.map(
  (option) => option.code
)

export function revetmentOptionForCode(code: string | undefined) {
  return BUND_DAW_REVETMENT_OPTIONS.find((option) => option.code === code)
}
/**
 * Optional, design-specific clean-sand filter below revetment. This is not the
 * 150 mm granular backing shown in the standard tank-bund revetment detail.
 */
export const BUND_DEFAULT_PITCHING_BEDDING_CODE = 'IRR-DAW-6-7'
export const BUND_DEFAULT_ROCKTOE_CODE = 'IRR-DAW-5-9'
/** DAW graded filter layers below and behind the downstream rubble rock toe. */
export const BUND_DEFAULT_ROCKTOE_FILTER_CODE = 'IRR-DAW-6-4'
/** DAW horizontal blanket: two geotextile layers plus 400 mm graded aggregate, SQM. */
export const BUND_DEFAULT_HFILTER_CODE = 'IRR-DAW-6-6'
/** Vertical (chimney) filter: 45 cm sand chimney satisfying filter criteria, CUM. */
export const BUND_DEFAULT_VFILTER_CODE = 'IRR-DAW-6-8'
/** DAW-6-4 total graded-filter thickness behind the inner rock-toe face. */
export const BUND_ROCKTOE_FILTER_BEHIND_M = 0.85
/** DAW-6-4 total graded-filter thickness below the rock-toe base. */
export const BUND_ROCKTOE_FILTER_BELOW_M = 0.85
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
/** 225 mm dry-rubble stone pitching without pin headers (maintenance-work SSR item). */
export const BUND_DEFAULT_TOE_BUILD_CODE = 'IRR-CAW-8-4'
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

export function normalizeChannelExcavationRows(rows: BundSoilBand[]): BundSoilBand[] {
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
export function normalizeFoundationExcavationRows(rows: BundSoilBand[]): BundSoilBand[] {
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
 * Cut-off trench, off until it is switched on. The standard section starts at
 * the minimum 0.60 m depth, with a 3 m bottom and 0.5:1 side slopes. When the
 * FTL and deepest-bed RL are known, its depth is raised to half the F.R.L. depth.
 */
export function defaultBundHeartingTrench(): BundHeartingTrench {
  return {
    depthMode: 'auto',
    depth: 0.6,
    bottomWidth: 3,
    usSlope: 0.5,
    dsSlope: 0.5,
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
    invertMode: 'auto',
    invertLevel: null,
    leftSlope: 1,
    rightSlope: 1,
    bermWidth: 1,
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
export const BUND_DETAIL_SUFFIX = '::bunddetail'

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

export const bundSlopeFractions: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8
}

export function parseBundSlopePart(raw: string): number | null {
  const value = raw.replace(/[hHvV]/g, '').trim()
  if (!value) return null

  const unicodeFraction = value.match(/^([+-])(\d+(?:\.\d+)?|\.\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/)
  if (unicodeFraction) {
    const sign = unicodeFraction[1] === '-' ? -1 : 1
    const whole = unicodeFraction[2] ? Number(unicodeFraction[2]) : 0
    return sign * (whole + bundSlopeFractions[unicodeFraction[3]])
  }

  const unsignedUnicodeFraction = value.match(/^(\d+(?:\.\d+)?|\.\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/)
  if (unsignedUnicodeFraction) {
    const whole = unsignedUnicodeFraction[1] ? Number(unsignedUnicodeFraction[1]) : 0
    return whole + bundSlopeFractions[unsignedUnicodeFraction[2]]
  }

  const mixedFraction = value.match(/^([+-]?)(\d+(?:\.\d+)?|\.\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixedFraction) {
    const denominator = Number(mixedFraction[4])
    if (denominator === 0) return null
    const sign = mixedFraction[1] === '-' ? -1 : 1
    return sign * (Number(mixedFraction[2]) + Number(mixedFraction[3]) / denominator)
  }

  const simpleFraction = value.match(/^([+-]?)(\d+)\s*\/\s*(\d+)$/)
  if (simpleFraction) {
    const denominator = Number(simpleFraction[3])
    if (denominator === 0) return null
    const sign = simpleFraction[1] === '-' ? -1 : 1
    return sign * Number(simpleFraction[2]) / denominator
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse the horizontal:vertical notation used for bund side slopes.
 *
 * The geometry stores the horizontal run for 1 m vertical, so `2:1`,
 * `2½:1`, and `2.5` all resolve to the stored value 2.5.
 */
export function parseBundSlope(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null

  const value = raw.trim()
  if (!value) return null

  const ratio = value.match(/^(.+?)\s*:\s*(.+)$/)
  const parsed = ratio
    ? (() => {
        const horizontal = parseBundSlopePart(ratio[1])
        const vertical = parseBundSlopePart(ratio[2])
        return horizontal != null && vertical != null && vertical > 0
          ? horizontal / vertical
          : null
      })()
    : (() => {
        const oneIn = value.match(/^1\s+in\s+(.+)$/i)
        return parseBundSlopePart(oneIn ? oneIn[1] : value)
      })()

  return parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
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
    drainLiningThickness: 0.1,
    chuteDrainLiningMaterial: null,
    chuteDrainExcavationMaterial: null,
    chuteDrainProtectionType: 'concrete'
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

/** Standard cut-off depth: half the water-level-to-lowest-toe depth, minimum 0.60 m. */
export function standardHeartingTrenchDepth(
  waterLevel: number | null,
  deepestToeRl: number | null
): number {
  if (waterLevel == null || deepestToeRl == null) return 0.6
  const waterDepth = waterLevel - deepestToeRl
  return round3(Math.max(0.6, waterDepth > 0 ? waterDepth / 2 : 0))
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
    waterSide: 'left',
    chainageUnit: 'm',
    includePhreaticInPrint: true,
    sectionMode: 'continuous',
    intervalM: 30,
    breaks: [],
    datum: 0,
    design: defaultBundDesign(),
    heartingDesign: {
      topLevel: 100,
      topWidth: 2.4,
      usSlope: 0.5,
      dsSlope: 0.5,
      centerOffset: 0
    },
    casingSoilType: null,
    heartingSoilType: null,
    heartingSlopeProfile: 'compact-core',
    zonedSlopeMode: 'manual',
    homogeneousSoilType: null,
    homogeneousSlopeMode: 'manual',
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
    pitchingExtent: 'mwl',
    pitchingThickness: 0.6,
    pitchingAsVolume: false,
    pitchingBeddingMaterial: null,
    pitchingBeddingThickness: 0.15,
    pitchingMetalEnabled: false,
    pitchingMetalMaterial: null,
    pitchingMetalThickness: 0.2,
    horizontalFilterMaterial: null,
    horizontalFilterLengthMode: 'auto',
    horizontalFilterLength: 6,
    horizontalFilterThickness: 0.4,
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
    rockToeHeight: 1.2,
    rockToeExcavationDepth: 0,
    rockToeExcavationMaterial: null,
    soilBands: [],
    excavationBands: defaultBundExcavationBands(),
    strippingExcavationFamily: 'seating',
    excavationClassificationVersion: 2,
    upstreamToe: defaultBundToe({ topWidth: 0.6, bottomWidth: 0.6, depth: 0.6 }),
    downstreamToe: defaultBundToe({ topWidth: 1.6, bottomWidth: 1.0, depth: 0.3 }),
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
export function migrateBundDesign(design: BundDesign, raw: BundData): BundDesign {
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
    ? (BUND_DAW_REVETMENT_CODES as readonly string[]).includes(raw.pitchingMaterial.code)
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
    waterSide: raw.waterSide === 'right' ? 'right' : 'left',
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
      topLevel:
        raw.heartingDesign?.topLevel ??
        raw.design?.mwl ??
        raw.design?.topLevel ??
        d.design.topLevel
    },
    casingSoilType: raw.casingSoilType ?? null,
    heartingSoilType: raw.heartingSoilType ?? null,
    heartingSlopeProfile: raw.heartingSlopeProfile ?? 'compact-core',
    zonedSlopeMode: raw.zonedSlopeMode ?? 'manual',
    homogeneousSoilType: raw.homogeneousSoilType ?? null,
    homogeneousSlopeMode: raw.homogeneousSlopeMode ?? 'manual',
    // The trench arrived with the new zoned template; an older project simply
    // has none, which is exactly the default with no codes attached.
    heartingTrench: {
      ...d.heartingTrench,
      ...(raw.heartingTrench ?? {}),
      depthMode:
        raw.heartingTrench?.depthMode === 'auto' || raw.heartingTrench?.depthMode === 'manual'
          ? raw.heartingTrench.depthMode
          : raw.heartingTrench
            ? 'manual'
            : 'auto'
    },
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
    pitchingExtent: raw.pitchingExtent === 'full' ? 'full' : 'mwl',
    pitchingThickness:
      revetmentOptionForCode(pitchingMaterial?.code)?.stoneThickness ??
      raw.pitchingThickness ??
      d.pitchingThickness,
    pitchingAsVolume: false,
    // DAW-6-10 through 6-14 already include their graded filter backing.
    pitchingBeddingMaterial: null,
    pitchingBeddingThickness:
      raw.pitchingBeddingThickness ?? d.pitchingBeddingThickness,
    pitchingMetalEnabled: false,
    pitchingMetalMaterial: null,
    pitchingMetalThickness: raw.pitchingMetalThickness ?? d.pitchingMetalThickness,
    rockToeMaterial: raw.rockToeMaterial ?? null,
    horizontalFilterMaterial: raw.horizontalFilterMaterial ?? null,
    horizontalFilterLengthMode: raw.horizontalFilterLengthMode ?? 'auto',
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
      invertMode:
        raw.downstreamToe?.invertMode ??
        (raw.downstreamToe?.invertLevel != null ||
        raw.downstreamToe?.invertStartLevel != null ||
        raw.downstreamToe?.invertEndLevel != null
          ? 'manual'
          : 'auto'),
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
