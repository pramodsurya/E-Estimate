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
import {
  BundQtyRow,
  orderedSections,
  quantityRows,
  rowsTotal,
  quantityRowsBySection,
  developedGroundLength,
  clearancePerimeterRows,
  clearanceManualRowArea,
  clearanceTotal,
  strippingRows,
  grossFormationRows,
  formationRows,
  plainFormationRows,
  bermFillRows,
  grossBermFillRows,
  casingRows,
  heartingRows,
  parseThicknessM,
  pitchingThicknessM,
  revetmentFilterThicknessM,
  revetmentHasThroughStones,
  upstreamRevetmentBand,
  upstreamRevetmentToeKey,
  pitchingIsVolume,
  turfingSlopeLengthAt,
  turfingRows,
  averageDownstreamSlopeLength,
  resolvedChuteDrainCount,
  BundChuteDrainRow,
  downstreamSlopeLengthAtChainage,
  chuteDrainChainages,
  chuteDrainRows,
  chuteDrainTotalLength,
  chuteDrainExcavationQuantity,
  chuteDrainLiningQuantity,
  chuteDrainProtectionArea,
  chuteDrainProtectionMeasurement,
  chuteDrainWettedPerimeter,
  sameBundPoint,
  upstreamRevetmentRuns,
  pitchingSlopeLengthAt,
  pitchingRows,
  pitchingBeddingQuantity,
  pitchingMetalQuantity,
  upstreamToeTrenchEnabled,
  pitchingMeasuredQuantity,
  CasagrandePhreaticBasis,
  casagrandePhreaticBasis,
  downstreamToeFaceSlope,
  rockToeShelfLimit,
  rockToeMaxHeightAt,
  rockToeHeightAt,
  rockToeBaseWidth,
  rockToeBaseWidthAt,
  rockToeAreaAt,
  rockToeRows,
  rockToeFilterAreaAt,
  rockToeFilterRows,
  measureFromUnit,
  bermShelfOffsets,
  bermWidthAt,
  bermDrainTopWidth,
  bermSurfacedWidthAt,
  bermShelfRows,
  bermSurfaceRows,
  bermSurfaceMeasurement,
  bermDrainWettedPerimeter,
  bermDrainExcavationRows,
  bermDrainProtectionRows,
  bermDrainProtectionMeasurement,
  bermFaceSlopeLengthAt,
  bermPresentLength,
  bermSectionCoverage,
  maxBundHeight,
  suggestedBermLevels,
  BundBermIssueLevel,
  BundBermIssue,
  bermIssues,
  bermLabel,
  internalFiltersAvailable,
  horizontalFilterOutletOffsetAt,
  horizontalFilterInletOffsetAt,
  horizontalFilterLengthAt,
  automaticHorizontalFilterLength,
  filterFixedDimensionM,
  horizontalFilterThicknessM,
  horizontalFilterMeasure,
  verticalFilterWidthM,
  verticalFilterMeasure,
  rockToeFilterBelowThicknessM,
  rockToeFilterBehindThicknessM,
  horizontalFilterRows,
  verticalFilterHeightAt,
  verticalFilterRows,
  strippedBaseLevelAt,
  lowestStrippedLevelAt,
  criticalSection,
  steepestSection,
  PhreaticGeometry,
  casagrandeExitCorrectionRatio,
  phreaticGeometry,
  toeExcavationArea,
  proposedToeOffsets,
  BundSectionDesignIssue,
  sectionDesignIssues,
  downstreamToePointAt,
  upstreamDesignToePointAt,
  downstreamDesignToePointAt,
  downstreamToeGroundLevelAt,
  downstreamToeExistingLevelAt,
  automaticToeDrainInvertLevel,
  toeDrainInvertLevelAt,
  downstreamToeProposedLevelAt,
  toeDrainGroundLevelAt,
  BundToeDrainPlatform,
  BundToeDrainLayout,
  toeDrainLayoutAt,
  toePlatformAt,
  toeDrainPlatformAt,
  upstreamToePlatformAt,
  toeDrainDepthAt,
  toeDepthAt,
  toeUsesSideSlopes,
  toeDrainTopWidthAt,
  BundToeDrainCheck,
  toeDrainCheck,
  toeExcavationAreaAt,
  toeExcavationRows,
  toeLiningDevelopedWidth,
  toeLiningDevelopedWidthAt,
  toeBuildRows,
  toeBuildMeasure,
  toeBuildThicknessM,
  toeBuildMeasurement,
  rockToeFoundationExcavationDepth,
  BundRockToeExcavationSection,
  bandLevelAt,
  clipProfileBand,
  bundFootprintExcavationBands,
  cutIntersectionArea,
  rockToeExcavationAvailable,
  rockToeExcavationAt,
  excludeSpanFromBands,
  bundNetStrippingBands,
  rockToeExcavationRows,
  fillBasisDelta,
  createSection,
  sectionChainages,
  materializeSections,
  resizeBundSections,
  copySectionGeometry
} from './quantities'

// Item sync. One generated item per role in use, each carrying its grand-total
// quantity via `computedQuantity` (no spreadsheet). The DATA/rate resolves from
// the item code, so totals, seigniorage, and prints work unchanged.
// ---------------------------------------------------------------------------

export const BUND_EXCAVATION_ROLES: readonly BundExcavationRole[] = [
  'stripping',
  'ustoe-exc',
  'dstoe-exc',
  'rocktoe-exc',
  'chute-exc',
  'berm-drain-exc',
  'hearting-trench-exc'
]

export function isBundExcavationRole(role: string): role is BundExcavationRole {
  return (BUND_EXCAVATION_ROLES as readonly string[]).includes(role)
}

/** Print label for a berm contribution: `u/s Berm (RL 97)`. */
export function bermSourceLabel(berm: BundBerm): string {
  const side = berm.side === 'us' ? 'u/s Berm' : 'd/s Berm'
  return `${side} (RL ${round3(berm.level)})`
}

export interface BundRequiredItem {
  role: BundItemRole
  ref: TemplateMaterialRef
  quantity: number
  /** Measurement basis used to generate the estimate item. */
  measure: 'area' | 'volume'
  /** Named source when several works share one payable code. */
  sourceLabel?: string
}

/** Unmerged measured works, including one row per berm when those share a code. */
export function requiredItemSources(data: BundData): BundRequiredItem[] {
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
        : centralBands && centralBands.length > 0
        ? centralBands
        : ['stripping', 'dstoe-exc', 'chute-exc', 'berm-drain-exc'].includes(role)
        ? defaultBundExcavationRows(legacyRef, 'channel')
        : []
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

  // Optional surface/protection items. Turfing and revetment are slope areas;
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
    if (
      data.pitchingBeddingMaterial &&
      !(BUND_DAW_REVETMENT_CODES as readonly string[]).includes(
        data.pitchingMaterial.code
      )
    ) {
      out.push({
        role: 'pitching-bedding',
        ref: data.pitchingBeddingMaterial,
        quantity: pitchingBeddingQuantity(data),
        measure: 'volume'
      })
    }
  }
  // U/S anchorage is controlled by revetment, but its excavation and built
  // volume are deliberately separate from the slope-revetment payment.
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
        measure: surfacing.measure,
        sourceLabel: bermSourceLabel(berm)
      })
    }
    if (berm.drainExcavationMaterial) {
      pushExcavation(
        'berm-drain-exc',
        rowsTotal(bermDrainExcavationRows(data, berm)),
        berm.drainExcavationMaterial
      )
    }
    if (berm.drainLiningMaterial) {
      const protection = bermDrainProtectionMeasurement(data, berm)
      out.push({
        role: 'berm-drain-lining',
        ref: berm.drainLiningMaterial,
        quantity: protection.quantity,
        measure: protection.measure,
        sourceLabel: bermSourceLabel(berm)
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
      measure: horizontalFilterMeasure(data)
    })
    if (data.verticalFilterMaterial) {
      out.push({
        role: 'vfilter',
        ref: data.verticalFilterMaterial,
        quantity: rowsTotal(verticalFilterRows(data)),
        measure: verticalFilterMeasure(data)
      })
    }
  }

  return out.filter((candidate) => candidate.quantity > 0)
}

/**
 * The items this bund should generate. Rolling repeats the formation volume —
 * it is the same earth billed as a second operation, which is exactly why the
 * split only exists for codes that leave compaction out of the formation item.
 * One SSR code billed at one rate is one line, however many places on the
 * bund it came from: the four excavations that all run on CAW-1-1 must not
 * reach the abstract as four identical rows. Merging is by code and DATA
 * variant, not by role — except for the zoned roles, where casing and
 * hearting are deliberately kept apart even when they share a code.
 */
export function requiredItems(data: BundData): BundRequiredItem[] {
  return combineRequiredItems(requiredItemSources(data))
}

export function requiredItemGroupKey(item: BundRequiredItem): string {
  const separatelyNamed = new Set<BundItemRole>([
    'casing',
    'casing-rolling',
    'hearting',
    'hearting-rolling',
    'hearting-trench'
  ])
  const variant = item.ref.dataVariant
    ? `${item.ref.dataVariant.key}:${item.ref.dataVariant.addonId ?? ''}`
    : ''
  return separatelyNamed.has(item.role)
    ? `${item.role}::${item.ref.code}::${variant}`
    : `${item.ref.code}::${variant}::${item.measure}`
}

export function combineRequiredItems(items: BundRequiredItem[]): BundRequiredItem[] {
  const combined = new Map<string, BundRequiredItem>()
  for (const item of items) {
    const key = requiredItemGroupKey(item)
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
        drainExcavationMaterial: opt(berm.drainExcavationMaterial),
        chuteDrainLiningMaterial: opt(berm.chuteDrainLiningMaterial),
        chuteDrainExcavationMaterial: opt(berm.chuteDrainExcavationMaterial)
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
export function addChildAt(root: ProjectNode, parentId: string, child: ProjectNode): ProjectNode {
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
  if (role === 'pitching') return 'Revetment (u/s slope)'
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
