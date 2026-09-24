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
import {
  BUND_CHAIN_M,
  BUND_DEFAULT_CLEARANCE_CODE,
  BUND_DEFAULT_STRIPPING_CODE,
  BUND_EXC_ALL_SOILS_CODE,
  BUND_EXC_HDR_CODE,
  BUND_EXC_FF_CODE,
  BUND_EXC_HR_CODE,
  BUND_CHANNEL_EXC_ALL_SOILS_CODE,
  BUND_CHANNEL_EXC_HDR_CODE,
  BUND_CHANNEL_EXC_FF_CODE,
  BUND_CHANNEL_EXC_HR_CODE,
  BUND_DEFAULT_FORMATION_CODE,
  BUND_SPLIT_FORMATION_CODE,
  BUND_SPLIT_ROLLING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  BUND_DEFAULT_TURFING_CODE,
  BUND_DEFAULT_FREEBOARD,
  BUND_DEFAULT_PITCHING_CODE,
  BUND_DAW_REVETMENT_OPTIONS,
  BUND_DAW_REVETMENT_CODES,
  revetmentOptionForCode,
  BUND_DEFAULT_PITCHING_BEDDING_CODE,
  BUND_DEFAULT_ROCKTOE_CODE,
  BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  BUND_DEFAULT_HFILTER_CODE,
  BUND_DEFAULT_VFILTER_CODE,
  BUND_ROCKTOE_FILTER_BEHIND_M,
  BUND_ROCKTOE_FILTER_BELOW_M,
  BUND_DEFAULT_TOE_EXC_CODE,
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
  BUND_UPSTREAM_TOE_MASONRY_CODE,
  BUND_DEFAULT_TOE_BUILD_CODE,
  BUND_DEFAULT_TOE_CC_CODE,
  BUND_DEFAULT_CHUTE_EXC_CODE,
  BUND_DEFAULT_CHUTE_LINING_CODE,
  BUND_DEFAULT_CHUTE_STONE_CODE,
  BUND_BERM_MIN_WIDTH,
  BUND_DEFAULT_BERM_WIDTH,
  BUND_DEFAULT_BERM_DROP,
  BUND_BERM_HEIGHT_TRIGGER,
  BUND_DEFAULT_BERM_CROSS_FALL,
  BUND_DEFAULT_BERM_TURF_CODE,
  BUND_DEFAULT_BERM_MURUM_CODE,
  BUND_DEFAULT_BERM_CC_CODE,
  BUND_DEFAULT_BERM_DRAIN_EXC_CODE,
  BUND_DEFAULT_BERM_DRAIN_LINING_CODE,
  BUND_DEFAULT_BERM_DRAIN_STONE_CODE,
  defaultBundExcavationRows,
  defaultBundExcavationBands,
  normalizeChannelExcavationRows,
  normalizeFoundationExcavationRows,
  withStrippingExcavationFamily,
  defaultBundHeartingTrench,
  defaultBundToe,
  BUND_DETAIL_SUFFIX,
  bundDetailId,
  parseBundDetailId,
  defaultBundDesign,
  bundSlopeFractions,
  parseBundSlopePart,
  parseBundSlope,
  defaultBundBerm,
  standardTankBundDims,
  designedFromTankLevels,
  standardHeartingTrenchDepth,
  topLevelFromFreeBoard,
  usesFreeBoardDesign,
  BundZonedSsrCodePair,
  zonedSsrCodePair,
  defaultBundData,
  migrateBundDesign,
  migrateBundData,
  toDisplayChainage,
  fromDisplayChainage,
  chainageUnitLabel,
  formatChainage
} from './configuration'
import {
  profileArea,
  mergeProfileOverrides,
  automaticStrippedLevelAt,
  strippedProfile,
  hasCompleteRestorationGround,
  usesFlatGround,
  usesSurveyedGroundEntry,
  hasMeasurableGround,
  upstreamToeOffset,
  existLevelAt,
  faceSlope,
  faceBerms,
  BundFaceSegment,
  faceSegments,
  faceDistanceToLevel,
  faceLevelAtDistance,
  bermHingeOffsets,
  designSurfaceAt,
  proposedLevelAt,
  faceToeDistance,
  sevenPointDesignProfile,
  sevenPointDesignFromGroundLevels,
  sectionDesignOffsets,
  deriveProposedProfile,
  extendProfileTo,
  profileWithin,
  BundProfileBand,
  positiveProfileBands,
  positiveProfileArea,
  profileBandsArea,
  profileBandLevelAt,
  intersectProfileBands,
  automaticLocalEarthworkBands,
  bundHeight,
  bundBaseWidth,
  faceAreaBeyondCrest,
  designedArea,
  projectedProfile,
  BundSectionAreas,
  BundLevelingLimits,
  BundLevelingGeometry,
  bundLevelingLimits,
  dedupeProfile,
  bundLevelingProposedProfile,
  earthworkBandsWithin,
  bundLevelingGeometry,
  faceSlopeLengths,
  sectionAreas,
  isZonedBund,
  isZonedRepair,
  proposedHeartingCrestProfile,
  heartingSupportProfile,
  heartingSideContact,
  BundHeartingGeometry,
  heartingGeometry,
  heartingBaseProfile,
  heartingRepairProfile,
  heartingRepairBands,
  heartingTrenchAvailable,
  heartingTrenchEnabled,
  BundDeepestToe,
  deepestBundToe,
  resolvedHeartingTrenchDepth,
  heartingTrenchArea,
  heartingTrenchTopWidth,
  heartingTrenchProfile,
  heartingTrenchRows,
  BundHeartingTrenchIssue,
  heartingTrenchIssues,
  BundZonedRepairAreas,
  zonedRepairAreas,
  BundHeartingIssue,
  heartingRepairIssues,
  profileWidth
} from './geometry'

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
  if (sections.length < 2) return []
  const computedAreas = sections.map((s) => round3(pick(sectionAreas(data, s))))
  const rows: BundQtyRow[] = []
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const lengthM = round3(to.chainage - from.chainage)
    if (lengthM <= 1e-6) continue
    const areaFrom = computedAreas[i - 1]
    const areaTo = computedAreas[i]
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
  if (sections.length < 2) return []
  const computedValues = sections.map((s) => round3(pick(s)))
  const rows: BundQtyRow[] = []
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const lengthM = round3(to.chainage - from.chainage)
    if (lengthM <= 1e-6) continue
    const areaFrom = computedValues[i - 1]
    const areaTo = computedValues[i]
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
 * Automatic jungle clearance: repair uses the developed surveyed-ground
 * perimeter; a new bund uses its width at stripped level between the designed
 * U/S and D/S toes. Values at sections
 * A and B are averaged, then multiplied by the chainage interval. Chainage
 * zero supplies P1 only; it never creates a standalone quantity.
 */
export function clearancePerimeterRows(data: BundData): BundQtyRow[] {
  const sections = orderedSections(data)
  if (sections.length < 2) return []
  const widthAt = (section: BundSection): number | null => {
    if (data.mode === 'new') {
      const geometry = bundLevelingGeometry(data, section)
      if (!geometry) return null
      return round3(geometry.limits.dsToeOffset - geometry.limits.usToeOffset)
    }
    if (!hasMeasurableGround(data, section)) return null
    const proposed = projectedProfile(section, data.design)
    if (proposed.length < 2) return null
    return developedGroundLength(
      profileWithin(section.pre, proposed[0].offset, proposed[proposed.length - 1].offset)
    )
  }
  const computedWidths = sections.map(widthAt)
  const rows: BundQtyRow[] = []
  for (let i = 1; i < sections.length; i += 1) {
    const from = sections[i - 1]
    const to = sections[i]
    const areaFrom = computedWidths[i - 1]
    const areaTo = computedWidths[i]
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

/** Gross formation before separately measured material zones are displaced. */
export function grossFormationRows(data: BundData): BundQtyRow[] {
  return quantityRows(data, (a) => a.formation)
}

/**
 * Net homogeneous/casing formation after deducting an enabled rubble rock toe.
 * Deduction is per chainage before MSA averaging.
 */
export function formationRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (section) =>
    round3(Math.max(
      0,
      sectionAreas(data, section).formation -
        (data.rockToeMaterial ? rockToeAreaAt(section, data) : 0)
    ))
  )
}

/** Formation rows for the plain bund body, excluding every berm widening. */
export function plainFormationRows(data: BundData): BundQtyRow[] {
  return formationRows({ ...data, design: { ...data.design, berms: [] } })
}

/**
 * Incremental fill created by one berm. Berms are accumulated in their stored
 * order so the plain body plus all berm rows exactly reconciles to formationRows.
 */
export function bermFillRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  const index = (data.design.berms ?? []).findIndex((candidate) => candidate.id === berm.id)
  if (index < 0) return []
  const before = formationRows({
    ...data,
    design: { ...data.design, berms: data.design.berms.slice(0, index) }
  })
  const after = formationRows({
    ...data,
    design: { ...data.design, berms: data.design.berms.slice(0, index + 1) }
  })
  return after.map((row, rowIndex) => {
    const prior = before[rowIndex]
    const areaFrom = round3(row.areaFrom - (prior?.areaFrom ?? 0))
    const areaTo = round3(row.areaTo - (prior?.areaTo ?? 0))
    const meanArea = round3((areaFrom + areaTo) / 2)
    return { ...row, areaFrom, areaTo, meanArea, qty: round3(meanArea * row.lengthM) }
  })
}

/** Gross incremental berm fill, used to expose the printed rock-toe deduction. */
export function grossBermFillRows(data: BundData, berm: BundBerm): BundQtyRow[] {
  const index = (data.design.berms ?? []).findIndex((candidate) => candidate.id === berm.id)
  if (index < 0) return []
  const before = grossFormationRows({
    ...data,
    design: { ...data.design, berms: data.design.berms.slice(0, index) }
  })
  const after = grossFormationRows({
    ...data,
    design: { ...data.design, berms: data.design.berms.slice(0, index + 1) }
  })
  return after.map((row, rowIndex) => {
    const prior = before[rowIndex]
    const areaFrom = round3(row.areaFrom - (prior?.areaFrom ?? 0))
    const areaTo = round3(row.areaTo - (prior?.areaTo ?? 0))
    const meanArea = round3((areaFrom + areaTo) / 2)
    return { ...row, areaFrom, areaTo, meanArea, qty: round3(meanArea * row.lengthM) }
  })
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

/** Stone thickness included in the selected DAW revetment/riprap item. */
export function pitchingThicknessM(data: BundData): number {
  return (
    revetmentOptionForCode(data.pitchingMaterial?.code)?.stoneThickness ??
    parseThicknessM(data.pitchingMaterial?.description) ??
    data.pitchingThickness ??
    0.6
  )
}

/** Graded filter backing included in the same DAW SQM revetment rate. */
export function revetmentFilterThicknessM(data: BundData): number {
  return revetmentOptionForCode(data.pitchingMaterial?.code)?.filterThickness ?? 0.45
}

export function revetmentHasThroughStones(data: BundData): boolean {
  return revetmentOptionForCode(data.pitchingMaterial?.code)?.throughStones ?? false
}

/** One physical band between two slope-normal offsets from the bund face. */
export function upstreamRevetmentBand(
  run: BundPoint[],
  innerThickness: number,
  outerThickness: number
): BundPoint[] {
  if (run.length < 2 || outerThickness <= innerThickness) return []
  const offset = (distance: number): BundPoint[] =>
    run.map((point, index) => {
      const a = run[Math.max(0, index - 1)]
      const b = run[Math.min(run.length - 1, index + 1)]
      const dx = b.offset - a.offset
      const dy = b.rl - a.rl
      const length = Math.hypot(dx, dy) || 1
      return {
        offset: round3(point.offset - (dy / length) * distance),
        rl: round3(point.rl + (dx / length) * distance)
      }
    })
  return [...offset(innerThickness), ...offset(outerThickness).reverse()]
}

/** Drawing-only stone key joining the exposed revetment to the u/s toe anchor. */
export function upstreamRevetmentToeKey(
  run: BundPoint[],
  stoneThickness: number,
  toeTopWidth: number
): BundPoint[] {
  if (run.length < 2 || stoneThickness <= 0 || toeTopWidth <= 0) return []
  const band = upstreamRevetmentBand(run, 0, stoneThickness)
  const surfaceStart = run[0]
  const outerStart = band[band.length - 1]
  const keyWidth = Math.min(toeTopWidth, Math.max(0.2, stoneThickness))
  return [
    surfaceStart,
    outerStart,
    { offset: round3(surfaceStart.offset - keyWidth), rl: surfaceStart.rl }
  ]
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

export function chuteDrainWettedPerimeter(data: BundData): number {
  return Math.max(0, data.chuteDrainWidth || 0) + 2 * Math.max(0, data.chuteDrainDepth || 0)
}

export function sameBundPoint(a: BundPoint, b: BundPoint): boolean {
  return Math.abs(a.offset - b.offset) < 1e-6 && Math.abs(a.rl - b.rl) < 1e-6
}

/**
 * Revetment runs on one upstream cross-section. Berm shelves are omitted. In
 * the default MWL mode, each sloping run is clipped at MWL; consequently the
 * run becomes zero at a chainage where MWL meets or falls below ground.
 */
export function upstreamRevetmentRuns(
  section: BundSection,
  data: BundData
): BundPoint[][] {
  const proj = [...projectedProfile(section, data.design)].sort(
    (a, b) => a.offset - b.offset
  )
  if (proj.length < 2) return []
  const half = data.design.topWidth / 2
  const maxRl = data.pitchingExtent === 'full' ? Number.POSITIVE_INFINITY : data.design.mwl
  if (maxRl == null) return []
  const berms = faceBerms(data.design, 'us')
  const runs: BundPoint[][] = []
  let current: BundPoint[] = []
  const finish = (): void => {
    if (current.length >= 2) runs.push(current)
    current = []
  }

  for (let i = 1; i < proj.length; i += 1) {
    const a = proj[i - 1]
    const b = proj[i]
    if ((a.offset + b.offset) / 2 >= -half + 1e-9) break
    const shelf =
      Math.abs(a.rl - b.rl) < 1e-6 &&
      berms.some((berm) => Math.abs(berm.level - a.rl) < 1e-6)
    if (shelf || (a.rl > maxRl && b.rl > maxRl)) {
      finish()
      continue
    }

    let from = a
    let to = b
    if (a.rl > maxRl || b.rl > maxRl) {
      const fraction = (maxRl - a.rl) / (b.rl - a.rl)
      const crossing: BundPoint = {
        offset: round3(a.offset + fraction * (b.offset - a.offset)),
        rl: round3(maxRl)
      }
      if (a.rl > maxRl) from = crossing
      else to = crossing
    }
    if (!current.length || !sameBundPoint(current[current.length - 1], from)) finish()
    if (!current.length) current.push(from)
    current.push(to)
    if (to.rl >= maxRl && Number.isFinite(maxRl)) finish()
  }
  finish()
  return runs
}

/** Developed upstream length protected by revetment at one chainage (m). */
export function pitchingSlopeLengthAt(section: BundSection, data: BundData): number {
  return round3(
    upstreamRevetmentRuns(section, data).reduce((total, run) => {
      let length = 0
      for (let i = 1; i < run.length; i += 1) {
        length += Math.hypot(
          run[i].offset - run[i - 1].offset,
          run[i].rl - run[i - 1].rl
        )
      }
      return total + length
    }, 0)
  )
}

/** Revetment on the upstream face: mean protected length × chainage → sq.m. */
export function pitchingRows(data: BundData): BundQtyRow[] {
  return quantityRowsBySection(data, (section) => pitchingSlopeLengthAt(section, data))
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
 * Revetment is restricted to the selected developed u/s extent. A SQM code includes the
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

export interface CasagrandePhreaticBasis {
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
export function casagrandePhreaticBasis(
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
 * Cross-sectional area of the selected rock-toe filter. DAW-6-4 uses 0.85 m
 * both below and behind; the CAW-5-11 alternative uses 1.00 m below and
 * 0.50 m behind.
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
  const below = rockToeFilterBelowThicknessM(data)
  const behind = rockToeFilterBehindThicknessM(data)
  return round3(
    baseWidth * below + innerFaceLength * behind
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
export function measureFromUnit(
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
  const drain = berm.drainLiningMaterial || berm.drainExcavationMaterial
    ? bermDrainTopWidth(berm)
    : 0
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

/**
 * Developed slope length (m) below a berm at one section down to the next lower
 * berm or down to the toe. Returns 0 if the berm does not exist at this section.
 */
export function bermFaceSlopeLengthAt(
  section: BundSection,
  data: BundData,
  berm: BundBerm
): number {
  if (!(berm.width > 0)) return 0
  if (bermWidthAt(section, data, berm) <= 0) return 0

  const faceSlopeVal =
    berm.slopeBelow != null && berm.slopeBelow > 0
      ? berm.slopeBelow
      : berm.side === 'us'
        ? data.design.usSlope
        : data.design.dsSlope

  const lowerBerms = faceBerms(data.design, berm.side).filter(
    (b) => b.level < berm.level - 1e-6 && bermWidthAt(section, data, b) > 0
  )

  let drop = 0
  if (lowerBerms.length > 0) {
    const nextLevel = Math.max(...lowerBerms.map((b) => b.level))
    drop = Math.max(0, berm.level - nextLevel)
  } else {
    const toe =
      berm.side === 'us'
        ? upstreamDesignToePointAt(section, data)
        : downstreamDesignToePointAt(section, data)
    const toeRl = toe?.rl ?? (data.design.topLevel - maxBundHeight(data))
    drop = Math.max(0, berm.level - toeRl)
  }

  return round3(drop * Math.hypot(1, Math.max(0.01, faceSlopeVal)))
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

/** Active D/S outlet of the blanket: rock-toe inner face, otherwise the bund toe. */
export function horizontalFilterOutletOffsetAt(
  section: BundSection,
  data: BundData
): number | null {
  const toe = downstreamDesignToePointAt(section, data)
  if (!toe) return null
  const rockHeight = data.rockToeMaterial ? rockToeHeightAt(section, data) : 0
  return round3(
    rockHeight > 0
      ? toe.offset -
          rockToeBaseWidth(rockHeight, data, downstreamToeFaceSlope(section, data))
      : toe.offset
  )
}

/** Inner blanket limit: centreline for homogeneous; D/S edge of hearting for zoned. */
export function horizontalFilterInletOffsetAt(
  section: BundSection,
  data: BundData
): number | null {
  const outlet = horizontalFilterOutletOffsetAt(section, data)
  if (data.horizontalFilterLengthMode === 'manual') {
    if (outlet == null) return null
    return round3(Math.max(0, outlet - Math.max(0, data.horizontalFilterLength || 0)))
  }
  if (!isZonedBund(data)) return 0
  const hearting = heartingRepairProfile(data, section)
  if (!hearting.length) return null
  return round3(Math.max(...hearting.map((point) => point.offset)))
}

/** Effective blanket length at one section, geometry-driven unless manually overridden. */
export function horizontalFilterLengthAt(section: BundSection, data: BundData): number {
  if (data.horizontalFilterLengthMode === 'manual') {
    return Math.max(0, data.horizontalFilterLength || 0)
  }
  const outlet = horizontalFilterOutletOffsetAt(section, data)
  const inlet = horizontalFilterInletOffsetAt(section, data)
  return outlet == null || inlet == null ? 0 : round3(Math.max(0, outlet - inlet))
}

/** Auto length displayed in the UI, taken at the section governing seepage. */
export function automaticHorizontalFilterLength(data: BundData): number {
  const section = steepestSection(data) ?? orderedSections(data)[0] ?? null
  return section ? horizontalFilterLengthAt(section, data) : 0
}

/** Dimension fixed by a DAW filter item, or null when the selected item needs design input. */
export function filterFixedDimensionM(
  ref: TemplateMaterialRef | null | undefined
): number | null {
  switch (ref?.code) {
    case 'IRR-DAW-6-3':
      return 1.4
    case 'IRR-DAW-6-4':
      return 0.85
    case 'IRR-DAW-6-5':
      return 0.3
    case 'IRR-DAW-6-6':
      return 0.4
    case 'IRR-DAW-6-8':
      return 0.45
    case 'IRR-DAW-6-9':
      return 0.9
    default:
      return parseThicknessM(ref?.description)
  }
}

export function horizontalFilterThicknessM(data: BundData): number {
  return (
    filterFixedDimensionM(data.horizontalFilterMaterial) ??
    Math.max(0, data.horizontalFilterThickness)
  )
}

export function horizontalFilterMeasure(data: BundData): 'area' | 'volume' {
  return measureFromUnit(
    data.horizontalFilterMaterial,
    data.horizontalFilterMaterial?.code === BUND_DEFAULT_HFILTER_CODE ? 'area' : 'volume'
  )
}

export function verticalFilterWidthM(data: BundData): number {
  return (
    filterFixedDimensionM(data.verticalFilterMaterial) ??
    Math.max(0, data.verticalFilterWidth)
  )
}

export function verticalFilterMeasure(data: BundData): 'area' | 'volume' {
  return measureFromUnit(data.verticalFilterMaterial, 'volume')
}

export function rockToeFilterBelowThicknessM(data: BundData): number {
  if (data.rockToeFilterMaterial?.code === 'IRR-CAW-5-11' || data.rockToeFilterMaterial?.code === 'IRR-DAW-6-4') return 1
  return filterFixedDimensionM(data.rockToeFilterMaterial) ?? BUND_ROCKTOE_FILTER_BELOW_M
}

export function rockToeFilterBehindThicknessM(data: BundData): number {
  if (data.rockToeFilterMaterial?.code === 'IRR-CAW-5-11' || data.rockToeFilterMaterial?.code === 'IRR-DAW-6-4') return 0.5
  return filterFixedDimensionM(data.rockToeFilterMaterial) ?? BUND_ROCKTOE_FILTER_BEHIND_M
}

/** Horizontal blanket: SQM items bill plan area; CUM items bill volume. */
export function horizontalFilterRows(data: BundData): BundQtyRow[] {
  const measure = horizontalFilterMeasure(data)
  const thickness = horizontalFilterThicknessM(data)
  return quantityRowsBySection(data, (section) =>
    round3(horizontalFilterLengthAt(section, data) * (measure === 'area' ? 1 : thickness))
  )
}

/**
 * Chimney height at a section: manual when typed, else up to MWL above the
 * stripped base (capped just below the crest), so it intercepts everything
 * below the phreatic entry.
 */
export function verticalFilterHeightAt(section: BundSection, data: BundData): number {
  const g = lowestStrippedLevelAt(section, data)
  if (g == null) return 0
  const crestHeight = Math.max(0, data.design.topLevel - g)
  const requested = data.verticalFilterHeight > 0
    ? data.verticalFilterHeight
    : data.design.mwl == null
      ? Math.max(0, crestHeight - 0.3)
      : Math.min(Math.max(0, data.design.mwl - g), Math.max(0, crestHeight - 0.3))

  // The chimney stands at the blanket inlet and must remain inside the
  // downstream casing. Its downhill edge governs because the face falls in
  // that direction. This also keeps the drawn height and billed quantity equal.
  const inlet = horizontalFilterInletOffsetAt(section, data)
  const toe = downstreamDesignToePointAt(section, data)
  if (inlet == null || toe == null) return round3(Math.max(0, requested))
  const profile = projectedProfile(section, data.design)
  if (profile.length < 2) return round3(Math.max(0, requested))
  const outerEdge = inlet + verticalFilterWidthM(data)
  const faceRl = existLevelAt(profile, outerEdge)
  const chimneyBaseRl = toe.rl + horizontalFilterThicknessM(data)
  const available = Math.max(0, faceRl - chimneyBaseRl)
  return round3(Math.min(Math.max(0, requested), available))
}

/** Vertical filter: SQM items bill face area; CUM items bill width × height. */
export function verticalFilterRows(data: BundData): BundQtyRow[] {
  const measure = verticalFilterMeasure(data)
  const width = verticalFilterWidthM(data)
  return quantityRowsBySection(data, (s) =>
    round3(verticalFilterHeightAt(s, data) * (measure === 'area' ? 1 : width))
  )
}

/** Stripped base RL at the centre-line of a section, or null before levels exist. */
export function strippedBaseLevelAt(section: BundSection, data: BundData): number | null {
  if (usesFlatGround(data, section)) {
    return section.groundLevel == null ? null : section.groundLevel - data.design.stripDepth
  }
  if ((section.pre?.length ?? 0) < 2) return null
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
  if ((section.pre?.length ?? 0) < 2) return null
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

export function casagrandeExitCorrectionRatio(alphaDegrees: number): number {
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
    horizontalFilterLengthAt(section, data) > 0

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
  const blanketOutletX = rockToeInnerBaseX ?? referenceBasis.dsToeX
  const blanketInletX = hfOn
    ? horizontalFilterInletOffsetAt(section, data)
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
    const chimneyTop = verticalFilterHeightAt(section, data)
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
  if ((section.pre?.length ?? 0) >= 2) {
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
  if (usesFlatGround(data, section) || (section.pre?.length ?? 0) < 2) return []
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
    const last = [...(section.pre || [])].sort((a, b) => a.offset - b.offset).at(-1)
    return last ?? null
  }
  const rl =
    (section.pre?.length ?? 0) >= 2
      ? existLevelAt(section.pre, toes.ds)
      : (section.groundLevel as number) - data.design.stripDepth
  return { offset: toes.ds, rl: round3(rl) }
}

/**
 * The theoretical upstream toe of the final designed bund profile.
 */
export function upstreamDesignToePointAt(
  section: BundSection,
  data: BundData
): BundPoint | null {
  const projected = projectedProfile(section, data.design)
  if (projected.length < 2) return null
  const toes = proposedToeOffsets(section, data)
  if (!toes) return projected[0] ?? null
  return {
    offset: toes.us,
    rl: round3(existLevelAt(projected, toes.us))
  }
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

/** Existing, unstripped D/S toe RL used to establish the standard drain invert. */
export function downstreamToeExistingLevelAt(
  section: BundSection,
  data: BundData
): number | null {
  if (usesFlatGround(data, section)) return section.groundLevel ?? null
  const toes = proposedToeOffsets(section, data)
  if (!toes || (section.pre?.length ?? 0) < 2) return null
  return round3(existLevelAt(section.pre, toes.ds))
}

/** Lowest D/S toe RL minus stripping and the standard drain depth. */
export function automaticToeDrainInvertLevel(data: BundData): number | null {
  const levels = orderedSections(data)
    .map((section) => downstreamToeExistingLevelAt(section, data))
    .filter((level): level is number => level != null && Number.isFinite(level))
  if (!levels.length) return null
  return round3(
    Math.min(...levels) -
      Math.max(0, data.design.stripDepth || 0) -
      Math.max(0, data.downstreamToe.depth || 0.3)
  )
}

/**
 * Longitudinal toe-drain invert RL at a chainage. Start/end reference levels
 * define one straight falling grade; a single entered end is treated as level.
 */
export function toeDrainInvertLevelAt(section: BundSection, data: BundData): number | null {
  const toe = data.downstreamToe
  const legacyManual = toe.invertMode == null && toe.invertLevel != null
  if (toe.invertMode === 'auto' || (!legacyManual && toe.invertMode == null)) {
    return automaticToeDrainInvertLevel(data)
  }
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

/** Offsets of the standard berm–drain–berm arrangement outside the D/S toe. */
export interface BundToeDrainLayout {
  platformFrom: number
  drainFrom: number
  drainTo: number
  platformTo: number
}

export function toeDrainLayoutAt(section: BundSection, data: BundData): BundToeDrainLayout | null {
  const toe = downstreamDesignToePointAt(section, data)
  if (!toe) return null
  const berm = Math.max(0, data.downstreamToe.bermWidth || 0)
  const width = toeDrainTopWidthAt(section, data)
  return {
    platformFrom: toe.offset,
    drainFrom: round3(toe.offset + berm),
    drainTo: round3(toe.offset + berm + width),
    platformTo: round3(toe.offset + berm + width + berm)
  }
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
    (section.pre?.length ?? 0) >= 2
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
  return toePlatformAt(
    section,
    data,
    'ds',
    toeDrainTopWidthAt(section, data) + 2 * Math.max(0, data.downstreamToe.bermWidth || 0)
  )
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

export function toeDepthAt(section: BundSection, data: BundData, toe: BundToe): number {
  return toe === data.downstreamToe ? toeDrainDepthAt(section, data) : Math.max(0, toe.depth || 0)
}

export function toeUsesSideSlopes(data: BundData, toe: BundToe): boolean {
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
  if (toe.buildMaterial?.code === BUND_DEFAULT_TOE_CC_CODE) return 0.1
  if (toe.buildMaterial?.code === BUND_DEFAULT_TOE_BUILD_CODE) return 0.225
  return (
    parseThicknessM(toe.buildMaterial?.description) ??
    (toe.liningThickness > 0 ? toe.liningThickness : 0.225)
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
 * For DAW-6-4 this is the 0.85 m thickness of filter media below the toe; it
 * is not assumed to be 0.85 m of additional payable excavation. The payable
 * cut is derived below from the union of this bed and the already-prepared
 * bund surface at every section.
 */
export function rockToeFoundationExcavationDepth(data: BundData): number {
  return data.rockToeFilterMaterial
    ? rockToeFilterBelowThicknessM(data)
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

export function bandLevelAt(
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

export function clipProfileBand(
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

/** General bund excavation clipped to the embankment footprint only. */
export function bundFootprintExcavationBands(
  leveling: BundLevelingGeometry,
  data: BundData
): BundProfileBand[] {
  if (data.mode === 'new') {
    const upper = profileWithin(
      leveling.existing,
      leveling.limits.usToeOffset,
      leveling.limits.dsToeOffset
    )
    const depth = Math.max(0, data.design.stripDepth || 0)
    const lower = upper.map((point) => ({ ...point, rl: point.rl - depth }))
    return positiveProfileBands(upper, lower)
  }
  return leveling.stripping
    .map((band) =>
      clipProfileBand(
        band,
        leveling.limits.usToeOffset,
        leveling.limits.dsToeOffset
      )
    )
    .filter((band): band is BundProfileBand => band != null)
}

/**
 * Intersection of a general cut band with a construction cut. The common part
 * ends at the shallower (higher) of their two piecewise-linear floors.
 */
export function cutIntersectionArea(
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
  // The selected filter behind the inner face projects upstream of the
  // rubble base at its heel. Only that cap can add excavation outside the
  // below-filter footprint; the rest lies above the base and is already inside
  // the deeper foundation cut.
  const innerSlope = Math.max(0, data.rockToeInnerSlope || 0)
  const behindThickness = rockToeFilterBehindThicknessM(data)
  const behindHorizontal =
    data.rockToeFilterMaterial
      ? behindThickness / Math.hypot(1, innerSlope)
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
      (behindThickness * innerSlope) /
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

export function excludeSpanFromBands(
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
  const footprint = bundFootprintExcavationBands(leveling, data)
  const rockToe = rockToeExcavationAt(section, data)
  return rockToe
    ? excludeSpanFromBands(footprint, rockToe.fromOffset, rockToe.toOffset)
    : footprint
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
            : undefined,
          hiddenLevelOffsets: source.hiddenLevelOffsets
            ? [...source.hiddenLevelOffsets]
            : undefined
        }
      : createSection(chainage)
  })
}

/**
 * Keep the cross-sections consistent when the component length is edited
 * outside the setup wizard (Edit length, geometry import). Interior breaks
 * beyond the new length are dropped and the section chainages are
 * re-materialized from the current mode/interval/breaks, carrying over the
 * dimensions of every section that still covers the same chainage — the same
 * contract the setup wizard uses. Unconfigured data only takes the length.
 */
export function resizeBundSections(data: BundData, lengthM: number): BundData {
  const next: BundData = {
    ...data,
    lengthM,
    breaks: data.breaks.filter((b) => b > 0 && b < lengthM)
  }
  if (!data.configured || data.sections.length === 0) return next
  next.sections = materializeSections(next, data.sections)
  return next
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
    separateToeLevels: source.separateToeLevels,
    designPointOffsets: source.designPointOffsets ? [...source.designPointOffsets] : undefined,
    hiddenLevelOffsets: source.hiddenLevelOffsets ? [...source.hiddenLevelOffsets] : undefined
  }
}

// ---------------------------------------------------------------------------
