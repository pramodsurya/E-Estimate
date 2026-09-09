import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ClipboardCopy,
  Mountain,
  Pencil,
  Plus,
  Settings2,
  Trash2
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import type {
  BundBerm,
  BundBermSide,
  BundCasingSoilType,
  BundData,
  BundExcavationRole,
  BundItemRole,
  BundPoint,
  BundSection,
  BundHeartingSlopeProfile,
  BundHeartingSoilType,
  BundHomogeneousSoilType,
  BundSoilBand,
  BundToe,
  ProjectNode
} from '../../types/project'
import {
  BUND_DEFAULT_BERM_CC_CODE,
  BUND_DEFAULT_BERM_DRAIN_EXC_CODE,
  BUND_DEFAULT_BERM_DRAIN_LINING_CODE,
  BUND_DEFAULT_BERM_DRAIN_STONE_CODE,
  BUND_DEFAULT_BERM_DROP,
  BUND_DEFAULT_BERM_TURF_CODE,
  bermDrainExcavationRows,
  bermDrainProtectionMeasurement,
  bermDrainProtectionRows,
  bermIssues,
  bermLabel,
  bermPresentLength,
  bermSectionCoverage,
  bermShelfRows,
  bermSurfaceMeasurement,
  bermSurfaceRows,
  defaultBundBerm,
  downstreamToeFaceSlope,
  maxBundHeight,
  rockToeMaxHeightAt,
  rockToeShelfLimit,
  BUND_DEFAULT_CLEARANCE_CODE,
  BUND_DEFAULT_CHUTE_EXC_CODE,
  BUND_DEFAULT_CHUTE_LINING_CODE,
  BUND_DEFAULT_CHUTE_STONE_CODE,
  BUND_DEFAULT_FORMATION_CODE,
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_HEARTING_TRENCH_FILL_CODE,
  BUND_DAW_REVETMENT_OPTIONS,
  BUND_DEFAULT_PITCHING_CODE,
  BUND_DEFAULT_ROCKTOE_CODE,
  BUND_DEFAULT_HFILTER_CODE,
  BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  BUND_DEFAULT_VFILTER_CODE,
  BUND_DEFAULT_STRIPPING_CODE,
  BUND_DEFAULT_TOE_BUILD_CODE,
  BUND_DEFAULT_TOE_CC_CODE,
  BUND_DEFAULT_TOE_EXC_CODE,
  BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
  automaticToeDrainInvertLevel,
  automaticHorizontalFilterLength,
  BUND_DEFAULT_TURFING_CODE,
  BUND_SPLIT_FORMATION_CODE,
  BUND_SPLIT_ROLLING_CODE,
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE,
  BUND_UPSTREAM_TOE_MASONRY_CODE,
  automaticStrippedLevelAt,
  bundLevelingLimits,
  chainageUnitLabel,
  chuteDrainExcavationQuantity,
  chuteDrainProtectionMeasurement,
  chuteDrainRows,
  chuteDrainTotalLength,
  clearanceManualRowArea,
  clearancePerimeterRows,
  clearanceTotal,
  copySectionGeometry,
  deepestBundToe,
  designSurfaceAt,
  existLevelAt,
  upstreamToeOffset,
  casingRows,
  formationRows,
  formatChainage,
  hasMeasurableGround,
  heartingRepairIssues,
  heartingTrenchArea,
  heartingTrenchAvailable,
  heartingTrenchEnabled,
  heartingTrenchIssues,
  heartingTrenchRows,
  heartingTrenchTopWidth,
  heartingRows,
  isZonedBund,
  lowestStrippedLevelAt,
  orderedSections,
  parseBundSlope,
  parseThicknessM,
  pitchingMeasuredQuantity,
  pitchingRows,
  pitchingThicknessM,
  revetmentFilterThicknessM,
  revetmentOptionForCode,
  rockToeExcavationRows,
  rockToeExcavationAt,
  rockToeExcavationAvailable,
  steepestSection,
  defaultBundExcavationRows,
  horizontalFilterRows,
  horizontalFilterLengthAt,
  horizontalFilterMeasure,
  horizontalFilterThicknessM,
  filterFixedDimensionM,
  internalFiltersAvailable,
  rockToeFilterRows,
  verticalFilterHeightAt,
  verticalFilterMeasure,
  verticalFilterRows,
  verticalFilterWidthM,
  zonedSsrCodePair,
  zonedRepairAreas,
  rockToeFoundationExcavationDepth,
  rockToeHeightAt,
  rockToeRows,
  resolvedHeartingTrenchDepth,
  rowsTotal,
  sectionAreas,
  sectionDesignOffsets,
  sectionDesignIssues,
  toeBuildRows,
  toeBuildMeasurement,
  toeBuildThicknessM,
  toeDrainDepthAt,
  toeDrainInvertLevelAt,
  toeDrainTopWidthAt,
  toeExcavationArea,
  toeDrainPlatformAt,
  upstreamToePlatformAt,
  toeExcavationAreaAt,
  toeExcavationRows,
  toeLiningDevelopedWidth,
  toeLiningDevelopedWidthAt,
  upstreamToeTrenchEnabled,
  sevenPointDesignFromGroundLevels,
  strippingRows,
  topLevelFromFreeBoard,
  turfingRows,
  usesFreeBoardDesign,
  usesSurveyedGroundEntry,
  withStrippingExcavationFamily,
  type BundQtyRow
} from '../../lib/bund'
import {
  applySoilPreset,
  CASING_SOIL_OPTIONS,
  HEARTING_SOIL_OPTIONS,
  HOMOGENEOUS_SOIL_OPTIONS,
  homogeneousSoilSuitable,
  recommendedHomogeneousSlopes,
  recommendedZonedSlopes,
  soilPreset
} from '../../lib/bundSoilPresets'
import { normalizeBundSimulationData } from '../../lib/bundSimulation'
import { fetchSsrItems, type MasterItem } from '../../lib/masterData'
import { findNode, newId } from '../../lib/tree'
import MaterialPicker from '../templates/MaterialPicker'
import SsrCode from '../templates/SsrCode'
import TemplateDefaultVariantButton from '../templates/TemplateDefaultVariantButton'
import BundBermDiagram from './BundBermDiagram'
import BundChuteDiagram from './BundChuteDiagram'
import BundRockToeDiagram from './BundRockToeDiagram'
import BundDrainageDiagram from './BundDrainageDiagram'
import BundFilterDiagram from './BundFilterDiagram'
import BundSectionDiagram from './BundSectionDiagram'
import BundToeDiagram from './BundToeDiagram'

const qty3 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const zonedCombinedCodes = new Set([
  BUND_ZONED_DAW_CASING_CODE,
  BUND_ZONED_DAW_HEARTING_CODE,
  BUND_ZONED_PMW_BORROW_CASING_CODE,
  BUND_ZONED_PMW_BORROW_HEARTING_CODE,
  BUND_ZONED_PMW_DUMP_CASING_CODE,
  BUND_ZONED_PMW_DUMP_HEARTING_CODE
])

const withKnownZonedUnit = (item: MasterItem): MasterItem =>
  zonedCombinedCodes.has(item.code) && !item.unit
    ? { ...item, unit: 'CUM' }
    : item

interface Props {
  node: ProjectNode
  data: BundData
  onEditSetup: (step: 1 | 2) => void
  template?: 'homogeneous' | 'zoned'
}

/** A row of the unified level table: one offset, the three profiles' levels. */
interface LevelRow {
  offset: number
  pre: number | null
  stripped: number | null
  projected: number | null
}

const rlAt = (points: BundPoint[], offset: number): number | null =>
  points.find((p) => Math.abs(p.offset - offset) < 1e-6)?.rl ?? null

const blankLevelRow = (offset: number): LevelRow => ({
  offset,
  pre: null,
  stripped: null,
  projected: null
})

const LEVEL_REARRANGE_TOLERANCE = 0.001

type EffectiveLevelValues = Pick<LevelRow, 'pre' | 'stripped' | 'projected'>

const levelAtLinearSegment = (
  fromOffset: number,
  fromLevel: number,
  toOffset: number,
  toLevel: number,
  offset: number
): number => {
  if (Math.abs(toOffset - fromOffset) < 1e-9) return fromLevel
  const ratio = (offset - fromOffset) / (toOffset - fromOffset)
  return fromLevel + (toLevel - fromLevel) * ratio
}

const isOnLinearSegment = (
  before: LevelRow,
  candidate: LevelRow,
  after: LevelRow,
  key: 'pre' | 'stripped' | 'projected',
  values: Map<LevelRow, EffectiveLevelValues>
): boolean => {
  const beforeLevel = values.get(before)?.[key]
  const candidateLevel = values.get(candidate)?.[key]
  const afterLevel = values.get(after)?.[key]
  if (beforeLevel == null || candidateLevel == null || afterLevel == null) return false
  const expected = levelAtLinearSegment(
    before.offset,
    beforeLevel,
    after.offset,
    afterLevel,
    candidate.offset
  )
  return Math.abs(candidateLevel - expected) <= LEVEL_REARRANGE_TOLERANCE
}

interface DecimalInputProps {
  value: number | null
  onValueChange: (value: number | null) => void
  placeholder?: string
  disabled?: boolean
  title?: string
  allowBlank?: boolean
}

/**
 * Keeps partial decimal text intact while the parent persists valid values.
 * Native controlled number inputs sanitise "-", "92.", and ".5" during a
 * rerender, which made the caret appear to jump out of Existing RL cells.
 */
function DecimalInput({
  value,
  onValueChange,
  placeholder,
  disabled,
  title,
  allowBlank = true
}: DecimalInputProps): JSX.Element {
  const [draft, setDraft] = useState(() => (value == null ? '' : String(value)))
  const focused = useRef(false)
  const latestValue = useRef(value)
  latestValue.current = value

  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value))
  }, [value])

  const restoreCommittedValue = (): void => {
    const raw = draft.trim()
    if (raw === '') {
      setDraft(
        allowBlank || latestValue.current == null
          ? ''
          : String(latestValue.current)
      )
      return
    }
    const parsed = Number(raw)
    setDraft(
      Number.isFinite(parsed)
        ? String(parsed)
        : latestValue.current == null
          ? ''
          : String(latestValue.current)
    )
  }

  return (
    <input
      className="text-input"
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        restoreCommittedValue()
      }}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        if (raw.trim() === '') {
          if (allowBlank) onValueChange(null)
          return
        }
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) onValueChange(parsed)
      }}
    />
  )
}

/**
 * Build the table from a section. Only the existing ground and any *overrides*
 * of the stripped/proposed surfaces are shown as values — a derived surface
 * leaves its cell blank so the placeholder can show the auto value instead.
 */
function toLevelRows(section: BundSection, data: BundData): LevelRow[] {
  const overrideStripped =
    section.strippedOverrides ??
    (section.stripped && section.stripped.length >= 2 ? section.stripped : [])
  const overrideProjected =
    section.projectedOverrides ??
    (section.projected && section.projected.length >= 2 ? section.projected : [])
  // The generated proposal points belong to the Proposed column. Do not keep
  // showing their blank rows after that column has been cleared.
  const hasGeneratedDesignPoints = (section.designPointOffsets?.length ?? 0) >= 2
  const levelingLimits = hasGeneratedDesignPoints ? bundLevelingLimits(section, data) : null
  const hiddenOffsets = new Set(
    (section.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
  )
  const explicitOffsets = new Set(
    [
      ...section.pre,
      ...(section.strippedOverrides ?? []),
      ...(section.projectedOverrides ?? [])
    ].map(
      (point) => Math.round(point.offset * 1000) / 1000
    )
  )
  const offsets = [
    ...new Set(
      [
        ...section.pre.map((p) => p.offset),
        ...overrideStripped.map((p) => p.offset),
        ...overrideProjected.map((p) => p.offset),
        ...(hasGeneratedDesignPoints ? sectionDesignOffsets(section, data.design) : []),
        ...(levelingLimits
          ? [levelingLimits.startOffset, levelingLimits.endOffset]
          : [])
      ].map((o) => Math.round(o * 1000) / 1000)
    )
  ]
    .filter((offset) => !hiddenOffsets.has(offset) || explicitOffsets.has(offset))
    .sort((a, b) => a - b)

  return offsets.map((offset) => ({
    offset,
    pre: rlAt(section.pre, offset),
    stripped: rlAt(overrideStripped, offset),
    projected: rlAt(overrideProjected, offset)
  }))
}

export default function BundDashboard({
  node,
  data,
  onEditSetup,
  template = 'homogeneous'
}: Props): JSX.Element {
  const setBund = useStore((s) => s.setBund)
  const setBundMaterial = useStore((s) => s.setBundMaterial)
  const zonedRepair = template === 'zoned' && isZonedBund(data)
  const homogeneous = !isZonedBund(data)

  const sections = useMemo(() => orderedSections(data), [data])
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null)
  const selected = sections.find((s) => s.id === selectedId) ?? sections[0] ?? null
  // Levels are stored about the centre-line but shown as a tape distance
  // measured from the upstream toe, so the u/s toe reads 0.
  const toeOrigin = selected ? upstreamToeOffset(selected, data) : 0
  const designPointsGenerated = (selected?.designPointOffsets?.length ?? 0) >= 2
  const selectedLevelingLimits =
    selected && designPointsGenerated ? bundLevelingLimits(selected, data) : null
  const [picker, setPicker] = useState<BundItemRole | null>(null)
  // Berm codes live inside design.berms, so their picker needs the berm too.
  const [bermPicker, setBermPicker] = useState<{
    bermId: string
    field: 'surfaceMaterial' | 'drainLiningMaterial'
  } | null>(null)
  // Chainages ticked to receive the current section's levels (bulk copy).
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copyFrom, setCopyFrom] = useState('')
  const automaticToeInvert = useMemo(() => automaticToeDrainInvertLevel(data), [data])
  const [designMessage, setDesignMessage] = useState<string | null>(null)
  const selectedIndex = selected ? sections.findIndex((s) => s.id === selected.id) : -1

  const unit = data.chainageUnit
  const unitLabel = chainageUnitLabel(unit)

  const update = (patch: Partial<BundData>): void => setBund(node.id, { ...data, ...patch })

  const zonedSlopeMode = data.zonedSlopeMode ?? 'manual'
  const homogeneousSlopeMode = data.homogeneousSlopeMode ?? 'manual'
  const selectedCasingSoil = CASING_SOIL_OPTIONS.find(
    (option) => option.id === data.casingSoilType
  )
  const selectedHeartingSoil = HEARTING_SOIL_OPTIONS.find(
    (option) => option.id === data.heartingSoilType
  )

  const recommendationPatch = (
    soil: BundHeartingSoilType,
    profile: BundHeartingSlopeProfile
  ): Pick<BundData, 'design' | 'heartingDesign'> => {
    const recommendation = recommendedZonedSlopes(soil, profile)
    return {
      design: {
        ...data.design,
        usSlope: recommendation.casing,
        dsSlope: recommendation.casing
      },
      heartingDesign: {
        ...data.heartingDesign,
        usSlope: recommendation.hearting,
        dsSlope: recommendation.hearting
      }
    }
  }

  const selectCasingSoil = (soil: BundCasingSoilType): void => {
    const simulation = normalizeBundSimulationData(data, data.simulation)
    update({
      casingSoilType: soil,
      simulation: {
        ...simulation,
        materials: simulation.materials.map((material) =>
          material.role === 'embankment'
            ? applySoilPreset(material, soil, 'embankment')
            : material
        )
      }
    })
  }

  const selectHeartingSoil = (soil: BundHeartingSoilType): void => {
    const nextProfile: BundHeartingSlopeProfile = 'compact-core'
    const simulation = normalizeBundSimulationData(data, data.simulation)
    update({
      heartingSoilType: soil,
      heartingSlopeProfile: nextProfile,
      zonedSlopeMode: 'automatic',
      ...recommendationPatch(soil, nextProfile),
      simulation: {
        ...simulation,
        materials: simulation.materials.map((material) =>
          material.role === 'hearting' || material.role === 'cutoff-trench'
            ? applySoilPreset(material, soil, material.role)
            : material
        )
      }
    })
  }

  const setAutomaticZonedSlopes = (): void => {
    const soil = data.heartingSoilType
    update({
      zonedSlopeMode: 'automatic',
      heartingSlopeProfile: 'compact-core',
      ...(soil ? recommendationPatch(soil, 'compact-core') : {})
    })
  }

  const selectHomogeneousSoil = (soil: BundHomogeneousSoilType): void => {
    const recommendation = recommendedHomogeneousSlopes(soil)
    const simulation = normalizeBundSimulationData(data, data.simulation)
    update({
      homogeneousSoilType: soil,
      homogeneousSlopeMode: recommendation ? 'automatic' : 'manual',
      ...(recommendation
        ? {
            design: {
              ...data.design,
              usSlope: recommendation.upstream,
              dsSlope: recommendation.downstream
            }
          }
        : {}),
      simulation: {
        ...simulation,
        materials: simulation.materials.map((material) =>
          material.role === 'embankment'
            ? applySoilPreset(material, soil, 'embankment')
            : material
        )
      }
    })
  }

  const setAutomaticHomogeneousSlopes = (): void => {
    const soil = data.homogeneousSoilType
    if (!soil) return
    const recommendation = recommendedHomogeneousSlopes(soil)
    if (!recommendation) return
    update({
      homogeneousSlopeMode: 'automatic',
      design: {
        ...data.design,
        usSlope: recommendation.upstream,
        dsSlope: recommendation.downstream
      }
    })
  }

  const updateSection = (id: string, patch: Partial<BundSection>): void =>
    update({ sections: data.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  // A new bund is designed to a free board, not to a typed crest RL: TBL is
  // shown but never edited, and follows MWL and the free board.
  const freeBoardDesign = usesFreeBoardDesign(data)
  // A new homogeneous bund is set out exactly like a repair: the two toe RLs
  // generate the design points, and the levels are typed into the same table.
  const surveyEntry = usesSurveyedGroundEntry(data)
  // A new bund's rock toe stands on ground the general foundation excavation
  // has already taken out, so it carries no excavation item of its own.
  const rockToeExcavation = rockToeExcavationAvailable(data)
  const trenchAvailable = heartingTrenchAvailable(data)
  const trenchOn = Boolean(data.heartingTrench?.fillMaterial)
  const trenchTotal = useMemo(() => rowsTotal(heartingTrenchRows(data)), [data])
  const governingDeepestToe = useMemo(() => deepestBundToe(data), [data])
  const effectiveTrenchDepth = useMemo(() => resolvedHeartingTrenchDepth(data), [data])
  const autoTrenchWaterLevel = data.design.ftl ?? data.design.mwl
  const autoTrenchWaterLabel = data.design.ftl != null ? 'FTL/FRL' : 'MWL'
  const derivedTopLevel = freeBoardDesign ? topLevelFromFreeBoard(data.design) : null

  /** Write MWL / free board and carry TBL with them while both are known. */
  const setFreeBoardLevels = (patch: {
    mwl?: number | null
    freeBoard?: number | null
  }): void => {
    const design = { ...data.design, ...patch }
    const topLevel = topLevelFromFreeBoard(design)
    const nextDesign = topLevel == null ? design : { ...design, topLevel }
    const heartingFollowsMwl =
      isZonedBund(data) &&
      (data.heartingDesign.topLevel === (data.design.mwl ?? data.design.topLevel))
    update({
      design: nextDesign,
      ...(patch.mwl !== undefined && heartingFollowsMwl && patch.mwl != null
        ? { heartingDesign: { ...data.heartingDesign, topLevel: patch.mwl } }
        : {})
    })
  }

  const setRepairMwl = (mwl: number | null): void => {
    const heartingFollowsMwl =
      isZonedBund(data) &&
      data.heartingDesign.topLevel === (data.design.mwl ?? data.design.topLevel)
    update({
      design: { ...data.design, mwl },
      ...(heartingFollowsMwl && mwl != null
        ? { heartingDesign: { ...data.heartingDesign, topLevel: mwl } }
        : {})
    })
  }

  const setEarthworkOperations = (
    formationEnabled: boolean,
    compactionEnabled: boolean
  ): void => {
    const combined = formationEnabled && compactionEnabled
    const formationCode = combined
      ? BUND_DEFAULT_FORMATION_CODE
      : BUND_SPLIT_FORMATION_CODE
    update({
      formationEnabled,
      compactionEnabled,
      earthworkOperationVersion: 2,
      billing: combined ? 'combined' : 'split',
      formationMaterial: { code: formationCode },
      rollingMaterial: { code: BUND_SPLIT_ROLLING_CODE },
      heartingMaterial: { code: formationCode },
      heartingRollingMaterial: { code: BUND_SPLIT_ROLLING_CODE }
    })
    void Promise.all([fetchSsrItems('IRR-DAW'), fetchSsrItems('IRR-PMW')]).then(
      ([daw, pmw]) => {
        if (!useStore.getState().project) return
        const formation = [...daw, ...pmw].find((item) => item.code === formationCode)
        const rolling = pmw.find((item) => item.code === BUND_SPLIT_ROLLING_CODE)
        if (formation) setBundMaterial(node.id, 'formation', formation)
        if (rolling) setBundMaterial(node.id, 'rolling', rolling)
        if (zonedRepair && formation) setBundMaterial(node.id, 'hearting', formation)
        if (zonedRepair && rolling) setBundMaterial(node.id, 'hearting-rolling', rolling)
      }
    )
  }

  const setZonedSsrBasis = (
    zonedRepairKind: BundData['zonedRepairKind'],
    zonedSoilSource: BundData['zonedSoilSource']
  ): void => {
    const next = {
      ...data,
      zonedRepairKind,
      zonedSoilSource
    }
    const codes = zonedSsrCodePair(next)
    update({
      zonedRepairKind,
      zonedSoilSource,
      zonedSsrVersion: 1,
      formationEnabled: true,
      compactionEnabled: true,
      billing: 'combined',
      earthworkOperationVersion: 2,
      formationMaterial: { code: codes.casing },
      heartingMaterial: { code: codes.hearting }
    })
    void fetchSsrItems(codes.category).then((items) => {
      if (!useStore.getState().project) return
      const casing = items.find((item) => item.code === codes.casing)
      const hearting = items.find((item) => item.code === codes.hearting)
      if (casing) setBundMaterial(node.id, 'casing', withKnownZonedUnit(casing))
      if (hearting) setBundMaterial(node.id, 'hearting', withKnownZonedUnit(hearting))
    })
  }

  // Turn an optional item on with its default code, then enrich the code's
  // metadata (unit, description) from the master list so prints read right.
  const enableOptional = (role: BundItemRole, key: keyof BundData, code: string): void => {
    update({ [key]: { code } } as Partial<BundData>)
    const category = code.startsWith('IRR-DAW-') ? 'IRR-DAW' : 'IRR-CAW'
    void fetchSsrItems(category).then((items) => {
      const master = items.find((i) => i.code === code)
      if (master && useStore.getState().project) setBundMaterial(node.id, role, master)
    })
  }

  const enableChuteDrains = (): void => {
    update({
      chuteDrainExcavationMaterial: { code: BUND_DEFAULT_CHUTE_EXC_CODE },
      chuteDrainLiningMaterial: { code: BUND_DEFAULT_CHUTE_LINING_CODE },
      chuteDrainProtectionType: 'concrete',
      chuteDrainLiningThickness: 0.1
    })
    void fetchSsrItems('IRR-CAW').then((items) => {
      if (!useStore.getState().project) return
      const excavation = items.find((item) => item.code === BUND_DEFAULT_CHUTE_EXC_CODE)
      const lining = items.find((item) => item.code === BUND_DEFAULT_CHUTE_LINING_CODE)
      if (excavation) setBundMaterial(node.id, 'chute-exc', excavation)
      if (lining) setBundMaterial(node.id, 'chute-lining', lining)
    })
  }

  const selectRevetmentCode = (code: string): void => {
    const option = revetmentOptionForCode(code)
    update({
      pitchingMaterial: { code },
      pitchingThickness: option?.stoneThickness ?? 0.6,
      pitchingBeddingMaterial: null,
      pitchingMetalEnabled: false,
      pitchingMetalMaterial: null
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      const material = items.find((item) => item.code === code)
      if (material && useStore.getState().project) {
        setBundMaterial(node.id, 'pitching', material)
      }
    })
  }

  const enableRockToe = (): void => {
    update({
      rockToeMaterial: { code: BUND_DEFAULT_ROCKTOE_CODE },
      rockToeFilterMaterial: { code: BUND_DEFAULT_ROCKTOE_FILTER_CODE },
      // The graded filter is the default rock-toe build-up. On a repair its
      // below-filter also needs a separately measured foundation excavation;
      // on new work it lies within the general bund foundation cut.
      ...(rockToeExcavation
        ? {
            rockToeExcavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
            rockToeExcavationDepth:
              data.rockToeExcavationDepth > 0 ? data.rockToeExcavationDepth : 0.3
          }
        : {})
    })
    void fetchSsrItems('IRR-DAW').then((daw) => {
      if (!useStore.getState().project) return
      const rockToe = daw.find((item) => item.code === BUND_DEFAULT_ROCKTOE_CODE)
      const filter = daw.find((item) => item.code === BUND_DEFAULT_ROCKTOE_FILTER_CODE)
      const excavation = daw.find(
        (item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE
      )
      if (rockToe) setBundMaterial(node.id, 'rocktoe', rockToe)
      if (filter) setBundMaterial(node.id, 'rocktoe-filter', filter)
      if (rockToeExcavation && excavation) {
        setBundMaterial(node.id, 'rocktoe-exc', excavation)
      }
    })
  }

  const enableRockToeFilter = (): void => {
    update({
      rockToeFilterMaterial: { code: BUND_DEFAULT_ROCKTOE_FILTER_CODE },
      // On a repair the 0.85 m below-filter cannot be constructed without
      // excavating its full footprint, so the filter brings its excavation with
      // it. On a new bund that footprint is already inside the general
      // foundation cut and no second excavation is measured.
      ...(rockToeExcavation
        ? {
            rockToeExcavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
            rockToeExcavationDepth:
              data.rockToeExcavationDepth > 0 ? data.rockToeExcavationDepth : 0.3
          }
        : {})
    })
    void fetchSsrItems('IRR-DAW').then((daw) => {
      const filter = daw.find((item) => item.code === BUND_DEFAULT_ROCKTOE_FILTER_CODE)
      const excavation = daw.find(
        (item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE
      )
      if (filter && useStore.getState().project) {
        setBundMaterial(node.id, 'rocktoe-filter', filter)
      }
      if (rockToeExcavation && excavation && useStore.getState().project) {
        setBundMaterial(node.id, 'rocktoe-exc', excavation)
      }
    })
  }

  const enableRockToeExcavation = (): void => {
    update({
      rockToeExcavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
      rockToeExcavationDepth:
        data.rockToeExcavationDepth > 0 ? data.rockToeExcavationDepth : 0.3
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      const excavation = items.find(
        (item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE
      )
      if (excavation && useStore.getState().project) {
        setBundMaterial(node.id, 'rocktoe-exc', excavation)
      }
    })
  }

  // ---- Hearting cut-off trench (new zoned bunds only) ----------------------
  const patchHeartingTrench = (patch: Partial<BundData['heartingTrench']>): void =>
    update({ heartingTrench: { ...data.heartingTrench, ...patch } })

  const enableHeartingTrench = (): void => {
    patchHeartingTrench({
      fillMaterial: { code: BUND_HEARTING_TRENCH_FILL_CODE },
      excavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE }
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      if (!useStore.getState().project) return
      const fill = items.find((item) => item.code === BUND_HEARTING_TRENCH_FILL_CODE)
      const excavation = items.find(
        (item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE
      )
      const current = findNode(useStore.getState().project!.root, node.id)?.bund
      if (!current) return
      setBund(node.id, {
        ...current,
        heartingTrench: {
          ...current.heartingTrench,
          fillMaterial: fill
            ? {
                code: fill.code,
                description: fill.description,
                unit: fill.unit,
                categoryKey: fill.category,
                side: fill.side,
                dataVariant: fill.dataVariant
              }
            : current.heartingTrench.fillMaterial,
          excavationMaterial: excavation
            ? {
                code: excavation.code,
                description: excavation.description,
                unit: excavation.unit,
                categoryKey: excavation.category,
                side: excavation.side
              }
            : current.heartingTrench.excavationMaterial
        }
      })
    })
  }

  const disableHeartingTrench = (): void =>
    patchHeartingTrench({ fillMaterial: null, excavationMaterial: null })

  const enableHorizontalFilter = (): void => {
    update({
      horizontalFilterMaterial: { code: BUND_DEFAULT_HFILTER_CODE },
      horizontalFilterThickness: 0.4,
      verticalFilterMaterial: { code: BUND_DEFAULT_VFILTER_CODE },
      verticalFilterWidth: 0.45,
      verticalFilterHeight: 0
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      if (!useStore.getState().project) return
      const blanket = items.find((item) => item.code === BUND_DEFAULT_HFILTER_CODE)
      const chimney = items.find((item) => item.code === BUND_DEFAULT_VFILTER_CODE)
      if (blanket) setBundMaterial(node.id, 'hfilter', blanket)
      if (chimney) setBundMaterial(node.id, 'vfilter', chimney)
    })
  }

  const enableVerticalFilter = (): void => {
    update({
      verticalFilterMaterial: { code: BUND_DEFAULT_VFILTER_CODE },
      verticalFilterWidth: 0.45,
      verticalFilterHeight: 0
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      const m = items.find((item) => item.code === BUND_DEFAULT_VFILTER_CODE)
      if (m && useStore.getState().project) setBundMaterial(node.id, 'vfilter', m)
    })
  }

  const setChuteProtectionType = (type: BundData['chuteDrainProtectionType']): void => {
    const code =
      type === 'stone' ? BUND_DEFAULT_CHUTE_STONE_CODE : BUND_DEFAULT_CHUTE_LINING_CODE
    update({
      chuteDrainProtectionType: type,
      chuteDrainLiningMaterial: { code },
      chuteDrainLiningThickness: type === 'stone' ? 0.3 : 0.1
    })
    void fetchSsrItems('IRR-CAW').then((items) => {
      const material = items.find((item) => item.code === code)
      if (material && useStore.getState().project) {
        setBundMaterial(node.id, 'chute-lining', material)
      }
    })
  }

  // ---- Toe elements (nested materials, set directly rather than via the store)
  type ToeKey = 'upstreamToe' | 'downstreamToe'
  const patchToe = (which: ToeKey, patch: Partial<BundToe>): void =>
    update({ [which]: { ...data[which], ...patch } } as Partial<BundData>)

  const setToeMaterial = (
    which: ToeKey,
    field: 'excavationMaterial' | 'buildMaterial',
    item: MasterItem,
    extra: Partial<BundToe> = {}
  ): void =>
    patchToe(which, {
      [field]: {
        code: item.code,
        description: item.description,
        unit: item.unit,
        categoryKey: item.category,
        side: item.side,
        dataVariant: item.dataVariant
      },
      ...extra
    } as Partial<BundToe>)

  // Attach a code to a toe field with its default, then enrich the metadata.
  const attachToe = (
    which: ToeKey,
    field: 'excavationMaterial' | 'buildMaterial',
    code: string,
    extra: Partial<BundToe> = {}
  ): void => {
    patchToe(which, { [field]: { code }, ...extra } as Partial<BundToe>)
    const category = code.split('-').slice(0, 2).join('-')
    void fetchSsrItems(category).then((items) => {
      const m = items.find((i) => i.code === code)
      if (m && useStore.getState().project) setToeMaterial(which, field, m, extra)
    })
  }

  const enableUpstreamToe = (): void => {
    patchToe('upstreamToe', {
      excavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
      buildMaterial: { code: BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE },
      buildArea: 0,
      liningThickness: 0
    })
    void fetchSsrItems('IRR-DAW').then((daw) => {
      if (!useStore.getState().project) return
      const excavation = daw.find(
        (item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE
      )
      const construction = daw.find(
        (item) => item.code === BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE
      )
      patchToe('upstreamToe', {
        excavationMaterial: excavation
          ? {
              code: excavation.code,
              description: excavation.description,
              unit: excavation.unit,
              categoryKey: excavation.category,
              side: excavation.side
            }
          : { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
        buildMaterial: construction
          ? {
              code: construction.code,
              description: construction.description,
              unit: construction.unit,
              categoryKey: construction.category,
              side: construction.side
            }
          : { code: BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE }
      })
    })
  }

  // ---- Berms (nested in design.berms, like the toes' nested materials) ------
  // Every write goes through the freshest stored bund, because the SSR lookups
  // that follow an "attach code" land after this render has closed over `data`.
  const patchBerm = (id: string, patch: Partial<BundBerm>): void => {
    const state = useStore.getState()
    const current = state.project ? findNode(state.project.root, node.id)?.bund : null
    if (!current) return
    state.setBund(node.id, {
      ...current,
      design: {
        ...current.design,
        // The stored node is pre-migration data, so an older project reaching
        // here for the first time has no berm list yet.
        berms: (current.design.berms ?? []).map((berm) =>
          berm.id === id ? { ...berm, ...patch } : berm
        )
      }
    })
  }

  type BermMaterialField =
    | 'surfaceMaterial'
    | 'drainLiningMaterial'
    | 'drainExcavationMaterial'

  const setBermMaterial = (id: string, field: BermMaterialField, item: MasterItem): void =>
    patchBerm(id, {
      [field]: {
        code: item.code,
        description: item.description,
        unit: item.dataVariant?.unit ?? item.unit,
        categoryKey: item.category,
        side: item.side,
        dataVariant: item.dataVariant
      }
    } as Partial<BundBerm>)

  /** Attach a code with its default, then enrich it from the master list. */
  const attachBerm = (
    id: string,
    field: BermMaterialField,
    code: string,
    extra: Partial<BundBerm> = {}
  ): void => {
    patchBerm(id, { [field]: { code }, ...extra } as Partial<BundBerm>)
    void fetchSsrItems(code.split('-').slice(0, 2).join('-')).then((items) => {
      const master = items.find((item) => item.code === code)
      if (master && useStore.getState().project) setBermMaterial(id, field, master)
    })
  }

  const setBerms = (berms: BundBerm[]): void =>
    update({ design: { ...data.design, berms } })

  const bermHeight = useMemo(() => maxBundHeight(data), [data])

  const addBerm = (side: BundBermSide): void => {
    // Start halfway down a short bund, one standard drop below the crest on a
    // tall one — either way inside the section, so the shelf exists at once.
    const drop =
      bermHeight > 0 ? Math.min(BUND_DEFAULT_BERM_DROP, bermHeight / 2) : BUND_DEFAULT_BERM_DROP
    setBerms([...data.design.berms, defaultBundBerm(side, data.design.topLevel - drop)])
  }

  const removeBerm = (id: string): void =>
    setBerms(data.design.berms.filter((berm) => berm.id !== id))

  /**
   * Re-order on request only. The list is otherwise left in the order shelves
   * were added, so typing an RL never slides the row being edited away.
   */
  const sortBermsByLevel = (): void =>
    setBerms(
      [...data.design.berms].sort((a, b) =>
        a.side === b.side ? b.level - a.level : a.side === 'us' ? -1 : 1
      )
    )

  const setBermSurface = (id: string, preset: 'stone' | 'turf' | 'cc'): void => {
    const code =
      preset === 'stone'
        ? BUND_DEFAULT_PITCHING_CODE
        : preset === 'turf'
        ? BUND_DEFAULT_BERM_TURF_CODE
        : BUND_DEFAULT_BERM_CC_CODE
    attachBerm(id, 'surfaceMaterial', code, {
      surfaceThickness: 0.1
    })
    setBermPicker(null)
  }

  const enableBermDrain = (id: string): void => {
    attachBerm(id, 'drainLiningMaterial', BUND_DEFAULT_BERM_DRAIN_LINING_CODE)
    attachBerm(id, 'drainExcavationMaterial', BUND_DEFAULT_BERM_DRAIN_EXC_CODE)
  }

  const stripRows = useMemo(() => strippingRows(data), [data])
  const formRows = useMemo(() => formationRows(data), [data])
  const casingFormRows = useMemo(() => casingRows(data), [data])
  const heartingFormRows = useMemo(() => heartingRows(data), [data])
  const formationTotal = rowsTotal(formRows)
  const casingTotal = rowsTotal(casingFormRows)
  const heartingTotal = rowsTotal(heartingFormRows)
  const strippingTotal = rowsTotal(stripRows)
  const formationEnabled = data.formationEnabled ?? true
  const compactionEnabled = data.compactionEnabled ?? true
  const combinedEarthwork = formationEnabled && compactionEnabled
  const zonedCodes = zonedRepair ? zonedSsrCodePair(data) : null
  const earthworkCode = combinedEarthwork
    ? BUND_DEFAULT_FORMATION_CODE
    : formationEnabled
      ? BUND_SPLIT_FORMATION_CODE
      : compactionEnabled
        ? BUND_SPLIT_ROLLING_CODE
        : null
  const turfRows = useMemo(() => turfingRows(data), [data])
  const turfingTotal = rowsTotal(turfRows)
  const pitchRows = useMemo(() => pitchingRows(data), [data])
  const pitchingMeasurement = useMemo(() => pitchingMeasuredQuantity(data), [data])
  const revetmentStoneThickness = pitchingThicknessM(data)
  const revetmentFilterThickness = revetmentFilterThicknessM(data)
  const selectedRevetment = revetmentOptionForCode(data.pitchingMaterial?.code)
  const pitchingDisplayRows =
    pitchingMeasurement.measure === 'volume'
      ? scaleQuantityRows(pitchRows, pitchingThicknessM(data))
      : pitchRows
  const pitchingQtyText =
    pitchingMeasurement.measure === 'volume'
      ? `${qty3.format(pitchingMeasurement.quantity)} cu.m`
      : `${qty3.format(pitchingMeasurement.quantity)} sq.m`
  const upstreamToeOn = upstreamToeTrenchEnabled(data)
  const upstreamToeRows = useMemo(
    () => toeExcavationRows(data, data.upstreamToe),
    [data]
  )
  const upstreamToeExcTotal = rowsTotal(upstreamToeRows)
  const downstreamToeRows = useMemo(
    () => toeExcavationRows(data, data.downstreamToe),
    [data]
  )
  const downstreamToeBuildRows = useMemo(
    () => toeBuildRows(data, data.downstreamToe),
    [data]
  )
  const downstreamToeBuild = useMemo(
    () => toeBuildMeasurement(data, data.downstreamToe),
    [data]
  )
  const downstreamToeBuildDisplayRows =
    downstreamToeBuild.measure === 'volume'
      ? scaleQuantityRows(
          downstreamToeBuildRows,
          toeBuildThicknessM(data.downstreamToe)
        )
      : downstreamToeBuildRows
  const rockToeTotal = useMemo(() => rowsTotal(rockToeRows(data)), [data])
  const rockToeFilterTotal = useMemo(() => rowsTotal(rockToeFilterRows(data)), [data])
  const rockToeExcavationTotal = useMemo(
    () => rowsTotal(rockToeExcavationRows(data)),
    [data]
  )
  const hFilterTotal = useMemo(() => rowsTotal(horizontalFilterRows(data)), [data])
  const vFilterTotal = useMemo(() => rowsTotal(verticalFilterRows(data)), [data])
  const hFilterMeasure = horizontalFilterMeasure(data)
  const vFilterMeasure = verticalFilterMeasure(data)
  const effectiveHFilterThickness = horizontalFilterThicknessM(data)
  const effectiveVFilterWidth = verticalFilterWidthM(data)
  const hFilterDimensionFixed =
    filterFixedDimensionM(data.horizontalFilterMaterial) != null
  const vFilterDimensionFixed = filterFixedDimensionM(data.verticalFilterMaterial) != null
  const drainageSection = useMemo(() => steepestSection(data), [data])
  const baselinePhreaticData = useMemo<BundData>(
    () => ({
      ...data,
      design: { ...data.design, berms: [] },
      rockToeMaterial: null,
      rockToeFilterMaterial: null,
      horizontalFilterMaterial: null,
      verticalFilterMaterial: null
    }),
    [data]
  )
  const activePhreaticOptions = [
    data.rockToeMaterial ? 'Rock toe' : null,
    data.horizontalFilterMaterial ||
    data.verticalFilterMaterial ||
    data.rockToeFilterMaterial
      ? 'Filter'
      : null,
    data.design.berms.length ? 'Berm' : null
  ].filter((option): option is string => option != null)
  const activePhreaticCombination =
    activePhreaticOptions.length === 0
      ? 'No option enabled'
      : activePhreaticOptions.length === 1
        ? activePhreaticOptions[0]
        : `${activePhreaticOptions.length === 2 ? '3C2' : '3C3'} · ${activePhreaticOptions.join(
            ' + '
          )}`
  const rockToeExcavationDepth = rockToeFoundationExcavationDepth(data)
  const governingRockToeExcavation = drainageSection
    ? rockToeExcavationAt(drainageSection, data)
    : null
  const rockToeDisplaySection = drainageSection ?? sections[0] ?? null
  const rockToeDiagramHeight =
    rockToeDisplaySection
      ? rockToeHeightAt(rockToeDisplaySection, data)
      : data.rockToeHeight
  // The rock toe's exposed face follows the face slope where it lands, which a
  // shelf above it may have flattened; and a shelf caps how tall it can grow.
  const rockToeFaceSlope =
    rockToeDisplaySection
      ? downstreamToeFaceSlope(rockToeDisplaySection, data)
      : data.design.dsSlope
  const rockToeShelf = rockToeDisplaySection
    ? rockToeShelfLimit(rockToeDisplaySection, data)
    : null
  const rockToeCapHeight = rockToeDisplaySection
    ? rockToeMaxHeightAt(rockToeDisplaySection, data)
    : null
  const rockToeCapped =
    rockToeShelf != null &&
    rockToeCapHeight != null &&
    rockToeDiagramHeight >= rockToeCapHeight - 1e-6
  // The filter detail is drawn on the same governing section as the phreatic
  // chart, so the two read as one story about the same chainage.
  const filterBaseLevel = rockToeDisplaySection
    ? lowestStrippedLevelAt(rockToeDisplaySection, data)
    : null
  const filterDiagramHeight =
    filterBaseLevel == null ? 0 : Math.max(0, data.design.topLevel - filterBaseLevel)
  const filterDiagramChimneyHeight = rockToeDisplaySection
    ? verticalFilterHeightAt(rockToeDisplaySection, data)
    : data.verticalFilterHeight
  const filterDiagramMwlRise =
    filterBaseLevel == null || data.design.mwl == null
      ? null
      : data.design.mwl - filterBaseLevel
  const filterDiagramLength = rockToeDisplaySection
    ? horizontalFilterLengthAt(rockToeDisplaySection, data)
    : automaticHorizontalFilterLength(data)
  const chuteRows = useMemo(() => chuteDrainRows(data), [data])
  const chuteCount = chuteRows.length
  const chuteLength = useMemo(() => chuteDrainTotalLength(data), [data])
  const chuteExcavation = useMemo(() => chuteDrainExcavationQuantity(data), [data])
  const bermDrainExcavationTotal = useMemo(
    () =>
      data.design.berms.reduce(
        (sum, berm) =>
          berm.drainLiningMaterial && berm.drainExcavationMaterial
            ? sum + rowsTotal(bermDrainExcavationRows(data, berm))
            : sum,
        0
      ),
    [data]
  )
  const chuteProtection = useMemo(() => chuteDrainProtectionMeasurement(data), [data])
  const chuteProtectionQtyText =
    chuteProtection.measure === 'area'
      ? `${qty3.format(chuteProtection.quantity)} sq.m stone/channel protection`
      : `${qty3.format(chuteProtection.quantity)} cu.m lining`
  const strippingExcavationFamily = data.strippingExcavationFamily ?? 'seating'
  const setStrippingExcavationFamily = (
    next: BundData['strippingExcavationFamily']
  ): void => update(withStrippingExcavationFamily(data, next))
  const excavationSources: Array<{
    role: BundExcavationRole
    title: string
    purpose: string
    family: 'foundation' | 'channel'
    quantity: number
    enabled: boolean
  }> = [
    {
      role: 'stripping',
      title:
        data.mode === 'new'
          ? 'Bund Foundation Excavation'
          : 'Bund Stripping',
      purpose:
        data.mode === 'new'
          ? 'Foundation excavation below the bund footprint. The measured cut is classified with the selected excavation-code basis.'
          : 'Shallow removal and seating across the bund footprint. Keep rock classes at zero unless the measured cut actually enters rock.',
      family: strippingExcavationFamily === 'foundation' ? 'foundation' : 'channel',
      quantity: strippingTotal,
      enabled: true
    },
    {
      role: 'ustoe-exc',
      title: 'U/S revetment toe wall / anchorage',
      purpose: 'Structural foundation trench below the upstream revetment anchorage.',
      family: 'foundation',
      quantity: upstreamToeExcTotal,
      enabled: upstreamToeOn
    },
    {
      role: 'dstoe-exc',
      title: 'D/S toe drain',
      purpose: 'Seepage-collection filter-drain trench; classified with CAW drain excavation.',
      family: 'channel',
      quantity: rowsTotal(downstreamToeRows),
      enabled: Boolean(data.downstreamToe.excavationMaterial)
    },
    {
      role: 'rocktoe-exc',
      title: 'Rock toe foundation',
      purpose:
        'Union of the general leveling cut under the rock-toe footprint and the additional rock-toe/filter bed cut.',
      family: 'foundation',
      quantity: rockToeExcavationTotal,
      enabled: Boolean(
        data.rockToeMaterial &&
          data.rockToeExcavationMaterial &&
          rockToeExcavationDepth > 0
      )
    },
    {
      role: 'chute-exc',
      title: 'D/S chute channel cutting',
      purpose:
        'Discrete runoff channels cut down the downstream face; this is drain/channel excavation, not foundation excavation.',
      family: 'channel',
      quantity: chuteExcavation,
      enabled: Boolean(
        data.chuteDrainLiningMaterial && data.chuteDrainExcavationMaterial
      )
    },
    {
      role: 'berm-drain-exc',
      title: 'Berm catch-water drains',
      purpose:
        'Longitudinal channels cut along the inner edge of each berm shelf; drain/channel excavation, not foundation excavation.',
      family: 'channel',
      quantity: bermDrainExcavationTotal,
      enabled: data.design.berms.some(
        (berm) => berm.drainLiningMaterial && berm.drainExcavationMaterial
      )
    },
    {
      role: 'hearting-trench-exc',
      title: 'Hearting cut-off trench',
      purpose:
        'Key trench cut from the formation base into tighter soil under the impervious core; a structural foundation cut, and normally where rock is first met.',
      family: 'foundation',
      quantity: trenchTotal,
      enabled: heartingTrenchEnabled(data)
    }
  ]
  const excavationSource = (role: BundExcavationRole) =>
    excavationSources.find((source) => source.role === role)!

  const renderExcavationClassCard = (
    source: (typeof excavationSources)[number]
  ): JSX.Element => {
    const bands =
      data.excavationBands?.[source.role] ??
      defaultBundExcavationRows(undefined, source.family)
    const totalPct = bands.reduce((sum, band) => sum + (band.pct || 0), 0)
    const measuredQuantity = source.enabled ? source.quantity : 0
    return (
      <section
        className={`bund-excavation-source is-compact${
          source.role === 'hearting-trench-exc' ? ' is-hearting-trench' : ''
        }${source.enabled ? '' : ' is-disabled'}`}
        key={source.role}
      >
        <div className="bund-excavation-source-heading">
          <div>
            <strong>{source.title}</strong>
            <small>{source.purpose}</small>
          </div>
          <div className="bund-excavation-total">
            <b>{qty3.format(measuredQuantity)} cu.m</b>
            <span className={Math.abs(totalPct - 100) > 0.01 ? 'warn' : ''}>
              {qty3.format(totalPct)}% {Math.abs(totalPct - 100) > 0.01 ? '!' : '✓'}
            </span>
          </div>
        </div>
        <div className="bund-excavation-rows">
          {bands.map((band, index) => {
            const pickerKey = `exc:${source.role}:${band.id}` as BundItemRole
            return (
              <div className="bund-excavation-row" key={band.id}>
                {index < 4 ? (
                  <span className="bund-excavation-class">{band.label}</span>
                ) : (
                  <input
                    className="text-input bund-excavation-class-input"
                    value={band.label}
                    placeholder="Class"
                    onChange={(event) =>
                      update({
                        excavationBands: {
                          ...data.excavationBands,
                          [source.role]: bands.map((candidate) =>
                            candidate.id === band.id
                              ? { ...candidate, label: event.target.value }
                              : candidate
                          )
                        }
                      })
                    }
                  />
                )}
                <label className="bund-excavation-percent">
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={band.pct}
                    onChange={(event) =>
                      update({
                        excavationBands: {
                          ...data.excavationBands,
                          [source.role]: bands.map((candidate) =>
                            candidate.id === band.id
                              ? { ...candidate, pct: Number(event.target.value) || 0 }
                              : candidate
                          )
                        }
                      })
                    }
                  />
                  <span>%</span>
                </label>
                <button
                  className="btn ghost bund-excavation-code"
                  onClick={() => setPicker(pickerKey)}
                  title={band.material.description}
                >
                  {band.material.code}
                </button>
                <span className="bund-excavation-share">
                  {qty3.format((measuredQuantity * band.pct) / 100)} cu.m
                </span>
                {index >= 4 ? (
                  <button
                    className="panel-iconbtn"
                    title="Remove excavation code"
                    onClick={() =>
                      update({
                        excavationBands: {
                          ...data.excavationBands,
                          [source.role]: bands.filter(
                            (candidate) => candidate.id !== band.id
                          )
                        }
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span className="bund-excavation-row-spacer" />
                )}
                {picker === pickerKey && (
                  <MaterialPicker
                    initialCategory={source.family === 'foundation' ? 'IRR-DAW' : 'IRR-CAW'}
                    initialSearch={
                      source.family === 'foundation'
                        ? 'excavation foundation'
                        : 'excavation drain seating embankment'
                    }
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      update({
                        excavationBands: {
                          ...data.excavationBands,
                          [source.role]: bands.map((candidate) =>
                            candidate.id === band.id
                              ? {
                                  ...candidate,
                                  material: {
                                    code: item.code,
                                    description: item.description,
                                    unit: item.unit,
                                    categoryKey: item.category,
                                    side: item.side,
                                    dataVariant: item.dataVariant
                                  }
                                }
                              : candidate
                          )
                        }
                      })
                      setPicker(null)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="bund-excavation-card-foot">
          <button
            className="btn ghost"
            onClick={() => {
              const defaultRef = defaultBundExcavationRows(undefined, source.family)[0].material
              update({
                excavationBands: {
                  ...data.excavationBands,
                  [source.role]: [
                    ...bands,
                    {
                      id: newId(),
                      label: 'Additional class',
                      pct: 0,
                      material: defaultRef
                    }
                  ]
                }
              })
            }}
          >
            <Plus size={13} /> Add code
          </button>
          {Math.abs(totalPct - 100) > 0.01 && (
            <small className="warn">Percentages must total 100%.</small>
          )}
        </div>
      </section>
    )
  }

  // The level grid is edited through a local buffer so half-filled and still
  // empty rows survive — a row with no levels yet stores nothing, so if the
  // grid were rebuilt from the saved profiles every render, a fresh "Add
  // offset" row would vanish the instant it appeared. The buffer reloads on a
  // chainage switch or when a toe width/design change moves an automatic
  // leveling limit, never on the re-render from an ordinary level edit.
  const [levelRows, setLevelRows] = useState<LevelRow[]>([])
  useEffect(() => {
    if (!selected) {
      setLevelRows([])
      setDesignMessage(null)
      return
    }
    setLevelRows(toLevelRows(selected, data))
    setDesignMessage(null)
    // Ordinary level edits keep the buffer authoritative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selected?.id,
    selectedLevelingLimits?.startOffset,
    selectedLevelingLimits?.endOffset
  ])

  const writeLevels = (rows: LevelRow[], sectionPatch: Partial<BundSection> = {}): void => {
    if (!selected) return
    const preRows = rows
      .filter((r) => r.pre != null)
      .sort((a, b) => a.offset - b.offset)
    const pre = preRows.map((r) => ({ offset: r.offset, rl: r.pre as number }))

    // Only typed cells are stored as overrides. Every other cell remains
    // derived and therefore continues to respond to design changes.
    const strippedOverrides = preRows
      .filter((r) => r.stripped != null)
      .map((r) => ({ offset: r.offset, rl: r.stripped as number }))
    const projectedOverrides = rows
      .filter((r) => r.projected != null)
      .map((r) => ({ offset: r.offset, rl: r.projected as number }))
    // An empty array is an intentional "Clear Proposed" state. Keep it while
    // editing Existing points, so the blue design line does not return until
    // the user deliberately generates proposed points again.
    const proposedWasCleared =
      Array.isArray(selected.projected) && selected.projected.length === 0
    const sectionPatchSetsProjected = Object.prototype.hasOwnProperty.call(
      sectionPatch,
      'projected'
    )

    updateSection(selected.id, {
      pre,
      stripped: null,
      projected:
        proposedWasCleared && !sectionPatchSetsProjected && projectedOverrides.length === 0
          ? []
          : null,
      strippedOverrides: strippedOverrides.length ? strippedOverrides : undefined,
      projectedOverrides: projectedOverrides.length ? projectedOverrides : undefined,
      ...sectionPatch
    })
  }

  /** Update the local buffer and persist the profiles it now describes. */
  const applyLevels = (rows: LevelRow[], sectionPatch: Partial<BundSection> = {}): void => {
    setLevelRows(rows)
    writeLevels(rows, sectionPatch)
  }

  const editLevel = (
    index: number,
    key: keyof LevelRow,
    value: number | null
  ): void => {
    applyLevels(
      levelRows.map((candidate, i) =>
        i === index ? { ...candidate, [key]: value } : candidate
      )
    )
  }

  const addLevelRow = (): void => {
    const last = levelRows[levelRows.length - 1]
    applyLevels([...levelRows, blankLevelRow(last ? last.offset + 1 : 0)])
  }

  const removeLevelRow = (index: number): void => {
    applyLevels(levelRows.filter((_, i) => i !== index))
  }

  /**
   * Clear every Existing Ground input and discard its generated design-grid
   * rows. A separately typed Proposed point is left intact until its own
   * clear button is pressed.
   */
  const clearExistingLevels = (): void => {
    applyLevels(
      levelRows.filter((row) => row.projected != null),
      {
        groundLevel: null,
        upstreamGroundLevel: null,
        downstreamGroundLevel: null,
        designPointOffsets: [],
        hiddenLevelOffsets: []
      }
    )
  }

  const enableDownstreamToe = (): void => {
    patchToe('downstreamToe', {
      excavationMaterial: { code: BUND_DEFAULT_TOE_EXC_CODE },
      buildMaterial: { code: BUND_DEFAULT_TOE_BUILD_CODE },
      bottomWidth: 1,
      depth: 0.3,
      leftSlope: 1,
      rightSlope: 1,
      bermWidth: 1,
      invertMode: 'auto',
      invertLevel: null,
      invertStartLevel: null,
      invertEndLevel: null,
      liningThickness: 0.225
    })
    void fetchSsrItems('IRR-CAW').then((items) => {
      if (!useStore.getState().project) return
      const excavation = items.find((item) => item.code === BUND_DEFAULT_TOE_EXC_CODE)
      const protection = items.find((item) => item.code === BUND_DEFAULT_TOE_BUILD_CODE)
      patchToe('downstreamToe', {
        excavationMaterial: excavation
          ? {
              code: excavation.code,
              description: excavation.description,
              unit: excavation.unit,
              categoryKey: excavation.category,
              side: excavation.side
            }
          : { code: BUND_DEFAULT_TOE_EXC_CODE },
        buildMaterial: protection
          ? {
              code: protection.code,
              description: protection.description,
              unit: protection.unit,
              categoryKey: protection.category,
              side: protection.side
            }
          : { code: BUND_DEFAULT_TOE_BUILD_CODE }
      })
    })
  }

  /** Clear Proposed points and their generated design-grid rows. */
  const clearProposedLevels = (): void => {
    applyLevels(
      levelRows.filter((row) => row.pre != null),
      {
        projected: [],
        projectedOverrides: undefined,
        designPointOffsets: [],
        hiddenLevelOffsets: []
      }
    )
  }

  /**
   * Sort the table from upstream to downstream and remove only points that do
   * not change either the existing-ground or proposed profile. The displayed
   * placeholders are used for derived values, so generated rows can be
   * simplified just like typed rows. Toe and platform control rows are always
   * retained.
   */
  const rearrangeLevelRows = (): void => {
    if (!selected) return

    let workingRows = [...levelRows].sort((a, b) => a.offset - b.offset)
    const removedRows: LevelRow[] = []
    const generatedOffsets = new Set(
      sectionDesignOffsets(selected, data.design).map(
        (offset) => Math.round(offset * 1000) / 1000
      )
    )
    const protectedOffsets = new Set<number>()
    const protectOffset = (offset: number | null | undefined): void => {
      if (offset != null && Number.isFinite(offset)) {
        protectedOffsets.add(Math.round(offset * 1000) / 1000)
      }
    }
    const designOffsets = sectionDesignOffsets(selected, data.design)
    if (designOffsets.length > 0) {
      protectOffset(Math.min(...designOffsets))
      protectOffset(Math.max(...designOffsets))
    }
    if (selectedLevelingLimits) {
      protectOffset(selectedLevelingLimits.startOffset)
      protectOffset(selectedLevelingLimits.endOffset)
    }

    let removedOne = true
    while (removedOne && workingRows.length >= 3) {
      removedOne = false
      const existingProfile = workingRows
        .filter((row) => row.pre != null)
        .map((row) => ({ offset: row.offset, rl: row.pre as number }))
      const effectiveValues = new Map<LevelRow, EffectiveLevelValues>()

      for (const row of workingRows) {
        const pre =
          row.pre ??
          (existingProfile.length >= 2 ? existLevelAt(existingProfile, row.offset) : null)
        const projected =
          row.projected ??
          (selectedLevelingLimits &&
          row.offset < selectedLevelingLimits.usToeOffset - 1e-9
            ? selectedLevelingLimits.usToeLevel
            : selectedLevelingLimits &&
                row.offset > selectedLevelingLimits.dsToeOffset + 1e-9
              ? selectedLevelingLimits.dsToeLevel
              : designSurfaceAt(row.offset, data.design))
        const stripped =
          row.stripped ??
          (pre != null
            ? automaticStrippedLevelAt(pre, projected, data.design)
            : null)
        effectiveValues.set(row, { pre, stripped, projected })
      }

      for (let index = 1; index < workingRows.length - 1; index += 1) {
        const candidate = workingRows[index]
        const roundedOffset = Math.round(candidate.offset * 1000) / 1000
        if (protectedOffsets.has(roundedOffset)) continue

        const before = workingRows[index - 1]
        const after = workingRows[index + 1]
        const redundant =
          isOnLinearSegment(before, candidate, after, 'pre', effectiveValues) &&
          isOnLinearSegment(before, candidate, after, 'projected', effectiveValues) &&
          isOnLinearSegment(before, candidate, after, 'stripped', effectiveValues)
        if (!redundant) continue

        removedRows.push(candidate)
        workingRows = [...workingRows.slice(0, index), ...workingRows.slice(index + 1)]
        removedOne = true
        break
      }
    }

    const hiddenOffsets = new Set(
      (selected.hiddenLevelOffsets ?? []).map(
        (offset) => Math.round(offset * 1000) / 1000
      )
    )
    for (const row of removedRows) {
      if (generatedOffsets.has(Math.round(row.offset * 1000) / 1000)) {
        hiddenOffsets.add(Math.round(row.offset * 1000) / 1000)
      }
    }

    applyLevels(workingRows, {
      hiddenLevelOffsets: [...hiddenOffsets].sort((a, b) => a - b)
    })

    if (removedRows.length === 0) {
      setDesignMessage('Points were already arranged. No redundant points were removed.')
      return
    }

    const removedDisplayOffsets = removedRows
      .map((row) => qty3.format(row.offset - toeOrigin))
      .join(', ')
    setDesignMessage(
      `Points rearranged. Removed ${removedRows.length} redundant point${
        removedRows.length === 1 ? '' : 's'
      } at ${removedDisplayOffsets} m.`
    )
  }

  // The proposed level is derived from the design until the design points are
  // laid out, so there is nothing meaningful to override before that.
  const populateSevenDesignPoints = (): void => {
    if (!selected) return
    const upstreamGroundLevel = selected.upstreamGroundLevel
    const downstreamGroundLevel = selected.downstreamGroundLevel

    if (upstreamGroundLevel == null || downstreamGroundLevel == null) {
      setDesignMessage('Enter both toe ground RLs for this chainage.')
      return
    }

    const designPoints = sevenPointDesignFromGroundLevels(
      upstreamGroundLevel,
      downstreamGroundLevel,
      data.design
    )
    // Seven on a plain-faced bund; every berm adds its two shelf hinges, so the
    // count is not fixed. An empty result is the only real failure.
    if (designPoints.length === 0) {
      setDesignMessage(
        'Both toe ground RLs must be below TBL, and crest width and slopes must be greater than zero.'
      )
      return
    }

    const oldGenerated = new Set(
      (selected.designPointOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
    )
    const manualRows = levelRows.filter(
      (row) => !oldGenerated.has(Math.round(row.offset * 1000) / 1000)
    )

    const generatedRows = designPoints.map((point, index) => {
      const sameOffset = levelRows.find((row) => Math.abs(row.offset - point.offset) < 1e-6)
      return {
        offset: point.offset,
        pre:
          sameOffset?.pre ??
          (index === 0
            ? upstreamGroundLevel
            : index === designPoints.length - 1
              ? downstreamGroundLevel
              : null),
        stripped: sameOffset?.stripped ?? null,
        projected: sameOffset?.projected ?? null
      }
    })

    const merged = [...manualRows]
    for (const generated of generatedRows) {
      const existingIndex = merged.findIndex(
        (row) => Math.abs(row.offset - generated.offset) < 1e-6
      )
      if (existingIndex < 0) merged.push(generated)
    }
    merged.sort((a, b) => a.offset - b.offset)

    applyLevels(merged, {
      projected: null,
      designPointOffsets: designPoints.map((point) => point.offset),
      hiddenLevelOffsets: []
    })
    setDesignMessage(
      `${designPoints.length} design points populated for the selected chainage.`
    )
  }

  // Pull another chainage's levels onto the current one, refreshing the buffer.
  const copyLevelsFrom = (sourceId: string): void => {
    if (!selected) return
    const source = sections.find((s) => s.id === sourceId)
    if (!source || source.id === selected.id) return
    updateSection(selected.id, copySectionGeometry(selected, source))
    setLevelRows(toLevelRows(source, data))
  }

  const toggleChecked = (id: string): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allChecked = sections.length > 0 && sections.every((s) => checked.has(s.id))
  const toggleAll = (): void =>
    setChecked(allChecked ? new Set() : new Set(sections.map((s) => s.id)))

  // The current section is the source; ticked chainages other than it are the
  // targets that receive its levels.
  const copyTargets = sections.filter((s) => checked.has(s.id) && s.id !== selected?.id)

  const applyLevelsToChecked = (): void => {
    if (!selected || copyTargets.length === 0) return
    const ids = new Set(copyTargets.map((t) => t.id))
    update({
      sections: data.sections.map((s) =>
        ids.has(s.id) ? copySectionGeometry(s, selected) : s
      )
    })
    setChecked(new Set())
  }

  const renderToeModule = (
    which: ToeKey,
    title: string,
    desc: string,
    buildRole: BundItemRole
  ): JSX.Element => {
    const toe = data[which]
    const on = Boolean(toe.excavationMaterial)
    const longitudinalDrain = which === 'downstreamToe'
    const selectedDepth =
      longitudinalDrain && selected ? toeDrainDepthAt(selected, data) : toe.depth
    const selectedInvert =
      longitudinalDrain && selected ? toeDrainInvertLevelAt(selected, data) : null
    const selectedTopWidth =
      longitudinalDrain && selected ? toeDrainTopWidthAt(selected, data) : toe.topWidth
    const selectedExcArea =
      selected ? toeExcavationAreaAt(selected, data, toe) : toeExcavationArea(toe)
    const selectedDevelopedWidth =
      selected
        ? toeLiningDevelopedWidthAt(selected, data, toe)
        : toeLiningDevelopedWidth(toe)
    const excTotal = rowsTotal(toeExcavationRows(data, toe))
    const buildAreaTotal = rowsTotal(toeBuildRows(data, toe))
    const buildMeasurement = toeBuildMeasurement(data, toe)
    const buildThickness = toeBuildThicknessM(toe)
    const fixedProtectionThickness =
      toe.buildMaterial?.code === BUND_DEFAULT_TOE_BUILD_CODE ||
      toe.buildMaterial?.code === BUND_DEFAULT_TOE_CC_CODE ||
      /(?:mm|cm)\s+(?:thick|lining)|(?:thick|lining).*?(?:mm|cm)/i.test(
        toe.buildMaterial?.description ?? ''
      )
    return (
      <div className={`bund-option-module${on ? ' is-enabled' : ''}`}>
        <label className="bund-optional-head">
          <input
            type="checkbox"
            checked={on}
            onChange={() =>
              on
                ? patchToe(
                    which,
                    longitudinalDrain
                      ? { excavationMaterial: null, buildMaterial: null }
                      : { excavationMaterial: null }
                  )
                : longitudinalDrain
                  ? enableDownstreamToe()
                  : attachToe(which, 'excavationMaterial', BUND_DEFAULT_TOE_EXC_CODE)
            }
          />
          <span className="bund-option-module-title">{title}</span>
        </label>
        <small>{desc}</small>
        <BundToeDiagram
          topWidth={selectedTopWidth}
          bottomWidth={toe.bottomWidth}
          depth={selectedDepth}
          leftSlope={
            longitudinalDrain && selectedInvert != null ? toe.leftSlope : undefined
          }
          rightSlope={
            longitudinalDrain && selectedInvert != null ? toe.rightSlope : undefined
          }
          bermWidth={longitudinalDrain ? toe.bermWidth : 0}
          lined={Boolean(toe.buildMaterial)}
        />
        {on && (
          <>
            <div className="gw-param-grid">
              {longitudinalDrain ? (
                <>
                  <label className="field">
                    <span className="field-label">Invert RL calculation</span>
                    <select
                      className="text-input"
                      value={toe.invertMode ?? ''}
                      onChange={(event) => {
                        const mode = event.target.value as 'auto' | 'manual'
                        patchToe(which, {
                          invertMode: mode,
                          invertLevel:
                            mode === 'manual'
                              ? (selectedInvert ?? automaticToeInvert)
                              : null,
                          invertStartLevel: null,
                          invertEndLevel: null
                        })
                      }}
                    >
                      <option value="auto">Auto — lowest D/S toe</option>
                      <option value="manual">Manual entry</option>
                    </select>
                  </label>
                  <NullField
                    label="Toe-drain bottom / invert RL"
                    value={
                      toe.invertMode === 'auto'
                        ? automaticToeInvert
                        : (toe.invertLevel ?? toe.invertStartLevel ?? null)
                    }
                    disabled={toe.invertMode === 'auto'}
                    onChange={(v) =>
                      patchToe(which, {
                        invertMode: 'manual',
                        invertLevel: v,
                        invertStartLevel: null,
                        invertEndLevel: null
                      })
                    }
                  />
                  <NumField
                    label="Base width at invert (m)"
                    value={toe.bottomWidth}
                    onChange={(v) => patchToe(which, { bottomWidth: v })}
                  />
                  <SlopeField
                    label="Left side slope"
                    value={toe.leftSlope}
                    onChange={(v) => patchToe(which, { leftSlope: v })}
                  />
                  <SlopeField
                    label="Right side slope"
                    value={toe.rightSlope}
                    onChange={(v) => patchToe(which, { rightSlope: v })}
                  />
                  <NumField
                    label="Berm width on each side (m)"
                    value={toe.bermWidth}
                    onChange={(v) => patchToe(which, { bermWidth: v })}
                  />
                </>
              ) : (
                <>
                  <NumField
                    label="Top width (m)"
                    value={toe.topWidth}
                    onChange={(v) => patchToe(which, { topWidth: v })}
                  />
                  <NumField
                    label="Bottom width (m)"
                    value={toe.bottomWidth}
                    onChange={(v) => patchToe(which, { bottomWidth: v })}
                  />
                  <NumField
                    label="Depth (m)"
                    value={toe.depth}
                    onChange={(v) => patchToe(which, { depth: v })}
                  />
                </>
              )}
            </div>
            {longitudinalDrain && (
              <div className="settings-note">
                {selected && selectedInvert != null ? (
                  <>
                    {toe.invertMode === 'auto' ? (
                      <>
                        Auto RL = lowest D/S toe RL − {qty3.format(data.design.stripDepth)} m{' '}
                        {data.mode === 'new' ? 'foundation excavation' : 'stripping'} −{' '}
                        {qty3.format(toe.depth)} m drain depth.{' '}
                      </>
                    ) : (
                      <>Manual constant invert. </>
                    )}
                    At {formatChainage(selected.chainage, data.chainageUnit)}: invert RL{' '}
                    <b>{qty3.format(selectedInvert)}</b>, calculated depth{' '}
                    <b>{qty3.format(selectedDepth)} m</b>, calculated top width{' '}
                    <b>{qty3.format(selectedTopWidth)} m</b>. The trapezoidal section is derived
                    from the base width and left/right side slopes.
                  </>
                ) : (
                  <>
                    Enter D/S toe levels to calculate the automatic invert, or select Manual
                    entry and enter one bottom RL.
                  </>
                )}
                <br />
                One constant RL prevents the drain bottom from following ground undulations, but
                it creates a level longitudinal invert. It does not provide gravity fall by
                itself; the drain still needs a free outfall or a separately designed
                longitudinal grade.
              </div>
            )}
            {longitudinalDrain &&
              selected &&
              (() => {
                const platform = toeDrainPlatformAt(selected, data)
                if (!platform) return null
                return (
                  <div className="settings-note bund-toe-line">
                    The drain is excavated <b>below stripped level</b> RL{' '}
                    {qty3.format(platform.level)}. Its opening is separated from the bund by a{' '}
                    {qty3.format(toe.bermWidth)} m berm, with the same berm beyond it. The full{' '}
                    {qty3.format(platform.toOffset - platform.fromOffset)} m platform is shown;
                    only the trapezoidal drain is included in the drain excavation quantity.
                  </div>
                )
              })()}
            <div className="settings-note bund-toe-line">
              Excavation geometry ·{' '}
              {longitudinalDrain ? (
                <>
                  selected section {qty3.format(selectedExcArea)} m²; variable-depth MSA →{' '}
                  <b>{qty3.format(excTotal)}</b> cu.m
                </>
              ) : (
                <>
                  {qty3.format(selectedExcArea)} m² section → <b>{qty3.format(excTotal)}</b> cu.m
                </>
              )}
              . The soil/rock codes and percentages are{' '}
              {longitudinalDrain
                ? 'set in the drain-excavation rows below.'
                : 'set in the excavation rows in this card.'}
            </div>
            {longitudinalDrain &&
              renderExcavationClassCard(excavationSource('dstoe-exc'))}

            <label className="bund-check">
              <input
                type="checkbox"
                checked={Boolean(toe.buildMaterial)}
                onChange={(e) =>
                  e.target.checked
                    ? attachToe(which, 'buildMaterial', BUND_DEFAULT_TOE_BUILD_CODE, {
                        liningThickness: 0.225
                      })
                    : patchToe(which, { buildMaterial: null })
                }
              />
              Include bed-and-side protection in the trench
            </label>
            {toe.buildMaterial && (
              <>
                {longitudinalDrain && (
                  <div className="bund-upstream-toe-code-choices">
                    <span>Toe-drain protection:</span>
                    <button
                      className={`btn ghost${
                        toe.buildMaterial.code === BUND_DEFAULT_TOE_BUILD_CODE
                          ? ' active'
                          : ''
                      }`}
                      onClick={() =>
                        attachToe(which, 'buildMaterial', BUND_DEFAULT_TOE_BUILD_CODE, {
                          liningThickness: 0.225
                        })
                      }
                    >
                      225 mm rubble revetment (maintenance)
                    </button>
                    <button
                      className={`btn ghost${
                        toe.buildMaterial.code === BUND_DEFAULT_TOE_CC_CODE
                          ? ' active'
                          : ''
                      }`}
                      onClick={() =>
                        attachToe(which, 'buildMaterial', BUND_DEFAULT_TOE_CC_CODE, {
                          liningThickness: 0.1
                        })
                      }
                    >
                      100 mm M15 CC lining
                    </button>
                    <button className="btn ghost" onClick={() => setPicker(buildRole)}>
                      <Pencil size={12} /> custom code
                    </button>
                  </div>
                )}
                {longitudinalDrain &&
                  buildMeasurement.measure === 'volume' &&
                  !fixedProtectionThickness && (
                  <div className="gw-param-grid">
                    <NumField
                      label="CC lining thickness (m)"
                      value={buildThickness}
                      onChange={(v) => patchToe(which, { liningThickness: v })}
                    />
                  </div>
                )}
                {longitudinalDrain &&
                  buildMeasurement.measure === 'volume' &&
                  fixedProtectionThickness && (
                    <div className="settings-note">
                      Thickness is fixed by the selected SSR item:{' '}
                      <b>{(buildThickness * 1000).toFixed(0)} mm</b>. No second thickness entry is
                      required.
                    </div>
                  )}
                <div className="settings-note bund-toe-line">
                  <SsrCode
                    code={toe.buildMaterial.code}
                    description={toe.buildMaterial.description}
                  />{' '}
                  · developed width{' '}
                  {qty3.format(selectedDevelopedWidth)} m
                  {longitudinalDrain
                    ? ' at selected section; variable-width MSA'
                    : ' × bund length'}{' '}
                  →{' '}
                  {buildMeasurement.measure === 'volume' ? (
                    <>
                      {qty3.format(buildAreaTotal)} sq.m ×{' '}
                      {qty3.format(buildThickness)} m →{' '}
                      <b>{qty3.format(buildMeasurement.quantity)}</b> cu.m
                    </>
                  ) : (
                    <>
                      <b>{qty3.format(buildMeasurement.quantity)}</b> sq.m
                    </>
                  )}
                  {!longitudinalDrain && (
                    <button className="btn ghost" onClick={() => setPicker(buildRole)}>
                      <Pencil size={12} /> code
                    </button>
                  )}
                </div>
                {longitudinalDrain && (
                  <TemplateDefaultVariantButton
                    ownerId={node.id}
                    code={toe.buildMaterial.code}
                    defaultCode={BUND_DEFAULT_TOE_BUILD_CODE}
                    selection={toe.buildMaterial.dataVariant}
                  />
                )}
                <div className="settings-note">
                  Protection follows the base and both side slopes.{' '}
                  {buildMeasurement.measure === 'volume'
                    ? `CC is measured by developed area × ${(buildThickness * 1000).toFixed(0)} mm lining thickness.`
                    : `The selected SQM rubble code includes its ${(buildThickness * 1000).toFixed(0)} mm thickness.`}
                </div>
                {picker === buildRole && (
                  <MaterialPicker
                    initialCategory="IRR-CAW"
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      setToeMaterial(which, 'buildMaterial', item)
                      setPicker(null)
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    )
  }

  const chuteDrainCard = (
    <OptionalCard
      title="Chute drains"
      desc="Surface drains from the crest or berms to the downstream toe."
      enabled={Boolean(data.chuteDrainLiningMaterial)}
      code={data.chuteDrainLiningMaterial?.code}
      description={data.chuteDrainLiningMaterial?.description}
      unit={data.chuteDrainLiningMaterial?.unit}
      qtyText={chuteProtectionQtyText}
      onEnable={enableChuteDrains}
      onDisable={() =>
        update({
          chuteDrainLiningMaterial: null,
          chuteDrainExcavationMaterial: null
        })
      }
      onChangeCode={() => setPicker('chute-lining')}
      extra={
        data.chuteDrainLiningMaterial ? (
          <div className="bund-rocktoe-fields">
            <label className="field">
              <span className="field-label">Channel protection</span>
              <select
                className="text-input"
                value={data.chuteDrainProtectionType}
                onChange={(e) =>
                  setChuteProtectionType(
                    e.target.value as BundData['chuteDrainProtectionType']
                  )
                }
              >
                <option value="concrete">Concrete lining</option>
                <option value="stone">Stone pitching / masonry</option>
              </select>
            </label>
            <TemplateDefaultVariantButton
              ownerId={node.id}
              code={data.chuteDrainLiningMaterial.code}
              defaultCode={BUND_DEFAULT_CHUTE_STONE_CODE}
              selection={data.chuteDrainLiningMaterial.dataVariant}
            />
            <label className="bund-check">
              <input
                type="checkbox"
                checked={data.chuteDrainUseSpacing}
                onChange={(e) => update({ chuteDrainUseSpacing: e.target.checked })}
              />
              Calculate count from spacing
            </label>
            <div className="gw-param-grid">
              {data.chuteDrainUseSpacing ? (
                <NumField
                  label="Spacing (m)"
                  value={data.chuteDrainSpacing}
                  onChange={(v) => update({ chuteDrainSpacing: v })}
                />
              ) : (
                <NumField
                  label="Number of chutes"
                  value={data.chuteDrainCount}
                  onChange={(v) => update({ chuteDrainCount: v })}
                />
              )}
              <NumField
                label="Width (m)"
                value={data.chuteDrainWidth}
                onChange={(v) => update({ chuteDrainWidth: v })}
              />
              <NumField
                label="Depth (m)"
                value={data.chuteDrainDepth}
                onChange={(v) => update({ chuteDrainDepth: v })}
              />
              {chuteProtection.measure === 'volume' && (
                <NumField
                  label="Thickness (m)"
                  value={data.chuteDrainLiningThickness}
                  onChange={(v) => update({ chuteDrainLiningThickness: v })}
                />
              )}
            </div>
            <BundChuteDiagram
              width={data.chuteDrainWidth}
              depth={data.chuteDrainDepth}
              liningThickness={data.chuteDrainLiningThickness}
              protection={data.chuteDrainProtectionType}
              lined={Boolean(data.chuteDrainLiningMaterial)}
            />
            <div className="bund-inline-measure">
              <span>
                <b>{chuteCount}</b> chute{chuteCount === 1 ? '' : 's'}
              </span>
              <span><b>{qty3.format(chuteLength)}</b> m total</span>
              <span><b>{qty3.format(chuteExcavation)}</b> cu.m excavation</span>
            </div>
            {renderExcavationClassCard(excavationSource('chute-exc'))}
          </div>
        ) : null
      }
      picker={
        picker === 'chute-lining' && (
          <MaterialPicker
            initialCategory="IRR-CAW"
            initialSearch={
              data.chuteDrainProtectionType === 'stone'
                ? 'rubble stone pitching'
                : '100 mm M15 lining'
            }
            onClose={() => setPicker(null)}
            onPick={(item) => {
              setBundMaterial(node.id, 'chute-lining', item)
              setPicker(null)
            }}
          />
        )
      }
    />
  )

  return (
    <div className="gw-dashboard">
      <div className="gw-toolbar">
        <span className="component-section-label">
          <Mountain size={15} /> {node.name}
        </span>
        <span className="gw-badge">
          {zonedRepair
            ? data.mode === 'new'
              ? 'New zoned bund'
              : 'Zoned bund repair'
            : data.mode === 'new'
              ? 'New bund'
              : 'Repair of existing bund'}
        </span>
        {zonedRepair && <span className="gw-badge">Casing + hearting</span>}
        <span className="gw-badge">{Math.round(data.lengthM).toLocaleString('en-IN')} m long</span>
        <span className="gw-badge">{sections.length} cross-sections</span>
        {data.source === 'manual' && <span className="gw-badge">Manual length (no map)</span>}
        <button
          className="btn ghost"
          onClick={() => onEditSetup(1)}
        >
          <Settings2 size={14} /> Edit setup
        </button>
        <button className="btn ghost" onClick={() => onEditSetup(2)}>
          <Pencil size={14} /> Edit sections
        </button>
      </div>

      {/* ---- Proposed bund design ---- */}
      <section className="gw-materials">
        <div className="gw-materials-title">
          {zonedRepair ? 'Proposed zoned bund - casing design' : 'Proposed bund - design'}
        </div>

        {data.mode === 'restoration' ? (
          <div className="bund-autosize">
            <div className="gw-panel-label">Repair levels</div>
            <div className="gw-param-grid">
              <NullField
                label="Full tank level, FTL (RL)"
                value={data.design.ftl}
                onChange={(v) => update({ design: { ...data.design, ftl: v } })}
              />
              <NullField
                label="Max water level, MWL (RL)"
                value={data.design.mwl}
                onChange={setRepairMwl}
              />
              <NumField
                label="Top bund level, TBL (RL)"
                value={data.design.topLevel}
                onChange={(v) => update({ design: { ...data.design, topLevel: v } })}
              />
            </div>
            <div className="settings-note">
              FTL, MWL and TBL apply to every chainage. Crest width, side slopes and stripping depth
              are set once in the design row below.
            </div>
          </div>
        ) : (
          <div className="bund-autosize">
            <div className="gw-panel-label">Proposed bund levels</div>
            <div className="gw-param-grid">
              <NullField
                label="Full tank level, FTL (RL)"
                value={data.design.ftl}
                onChange={(v) => update({ design: { ...data.design, ftl: v } })}
              />
              <NullField
                label="Max water level, MWL (RL)"
                value={data.design.mwl}
                onChange={(v) => setFreeBoardLevels({ mwl: v })}
              />
              <NullField
                label="Free board above MWL (m)"
                value={data.design.freeBoard}
                onChange={(v) => setFreeBoardLevels({ freeBoard: v })}
              />
              <label className="field">
                <span className="field-label">Calculated top bund level, TBL (RL)</span>
                <input
                  className="text-input"
                  type="number"
                  readOnly
                  disabled
                  tabIndex={-1}
                  aria-label="Calculated top bund level"
                  title="Calculated automatically as MWL plus free board"
                  placeholder="Calculated from MWL + free board"
                  value={derivedTopLevel ?? ''}
                />
              </label>
            </div>
            <div className="settings-note">
              {derivedTopLevel != null ? (
                <>
                  TBL = MWL {qty3.format(data.design.mwl as number)} + free board{' '}
                  {qty3.format(data.design.freeBoard as number)} ={' '}
                  <b>{qty3.format(derivedTopLevel)}</b>. It is not typed here — change MWL or the
                  free board and the crest follows.
                </>
              ) : (
                <>
                  Enter MWL and the free board; TBL is derived from them, not typed. FTL is carried
                  as the reference line drawn on every section.
                </>
              )}
            </div>
          </div>
        )}

        {homogeneous && (
          <div className="bund-soil-selector bund-homogeneous-soil-selector">
            <div>
              <div className="gw-panel-label">Homogeneous embankment material</div>
              <small>
                Select the single fill soil used throughout the bund. Preliminary properties
                are copied to Simulation and remain editable there.
              </small>
            </div>
            <label className="field">
              <span className="field-label">Embankment soil type</span>
              <select
                className="text-input"
                value={data.homogeneousSoilType ?? ''}
                onChange={(event) =>
                  event.target.value &&
                  selectHomogeneousSoil(event.target.value as BundHomogeneousSoilType)
                }
              >
                <option value="">Select soil type…</option>
                {HOMOGENEOUS_SOIL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                    {option.homogeneousSuitable === false
                      ? ' — pervious, not suitable alone'
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            {soilPreset(data.homogeneousSoilType)?.summary && (
              <p className="bund-soil-summary">
                {soilPreset(data.homogeneousSoilType)?.summary}
              </p>
            )}
            {data.homogeneousSoilType &&
              !homogeneousSoilSuitable(data.homogeneousSoilType) && (
                <div className="bund-soil-unsuitable" role="alert">
                  This clean gravel or sand is too pervious for a homogeneous water-retaining
                  embankment. Use a zoned section with an impervious core or select a suitable
                  fine-bearing soil.
                </div>
              )}
          </div>
        )}

        {zonedRepair && (
          <div className="bund-soil-selector bund-zoned-material-selector">
            <div className="bund-zoned-material-heading">
              <div className="gw-panel-label">Zoned embankment materials & slope basis</div>
              <small>
                Choose both materials before entering casing and core dimensions. The core soil
                determines the applicable standard case; both soil choices load preliminary
                properties into Simulation.
              </small>
            </div>
            <label className="field">
              <span className="field-label">Casing soil type</span>
              <select
                className="text-input"
                value={data.casingSoilType ?? ''}
                onChange={(event) =>
                  event.target.value &&
                  selectCasingSoil(event.target.value as BundCasingSoilType)
                }
              >
                <option value="">Select soil type…</option>
                {CASING_SOIL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedCasingSoil && <small>{selectedCasingSoil.summary}</small>}
            </label>
            <label className="field">
              <span className="field-label">Impervious core soil type</span>
              <select
                className="text-input"
                value={data.heartingSoilType ?? ''}
                onChange={(event) =>
                  event.target.value &&
                  selectHeartingSoil(event.target.value as BundHeartingSoilType)
                }
              >
                <option value="">Select soil type…</option>
                {HEARTING_SOIL_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedHeartingSoil && <small>{selectedHeartingSoil.summary}</small>}
            </label>
            <div className="bund-preliminary-note bund-zoned-material-note" role="note">
              Automatic geometry uses the standard 0.5 horizontal to 1 vertical core case. These
              are preliminary selections; verify classification, properties and slopes using
              project investigation and stability analysis before approval.
            </div>
          </div>
        )}

        {zonedRepair && (
          <div className="bund-section-material-selection">
            <span>Casing dimensions</span>
            <strong>{selectedCasingSoil?.label ?? 'No casing soil selected'}</strong>
          </div>
        )}
        <div className="gw-param-grid bund-design-grid">
          <NumField
            label={zonedRepair ? 'Casing crest width (m)' : 'Crest width (m)'}
            value={data.design.topWidth}
            onChange={(v) => update({ design: { ...data.design, topWidth: v } })}
          />
          <SlopeField
            label="Upstream slope, left"
            value={data.design.usSlope}
            onChange={(v) =>
              update({
                design: { ...data.design, usSlope: v },
                ...(zonedRepair
                  ? { zonedSlopeMode: 'manual' as const }
                  : { homogeneousSlopeMode: 'manual' as const })
              })
            }
          />
          <SlopeField
            label="Downstream slope, right"
            value={data.design.dsSlope}
            onChange={(v) =>
              update({
                design: { ...data.design, dsSlope: v },
                ...(zonedRepair
                  ? { zonedSlopeMode: 'manual' as const }
                  : { homogeneousSlopeMode: 'manual' as const })
              })
            }
          />
        </div>
        {zonedRepair && (
          <div className="bund-slope-source-row">
            <span className={`bund-source-badge is-${zonedSlopeMode}`}>
              {zonedSlopeMode === 'automatic'
                ? 'Recommended slopes applied'
                : 'Manual slope values'}
            </span>
            {zonedSlopeMode === 'manual' && data.heartingSoilType && (
              <button type="button" className="btn ghost" onClick={setAutomaticZonedSlopes}>
                Reapply recommendation
              </button>
            )}
            <small>
              Preliminary geometry only—confirm with project-specific stability and seepage
              analysis.
            </small>
          </div>
        )}
        {homogeneous && data.homogeneousSoilType && (
          <div className="bund-slope-source-row">
            <span className={`bund-source-badge is-${homogeneousSlopeMode}`}>
              {homogeneousSlopeMode === 'automatic'
                ? 'Recommended slopes applied'
                : 'Manual slope values'}
            </span>
            {homogeneousSlopeMode === 'manual' &&
              homogeneousSoilSuitable(data.homogeneousSoilType) && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={setAutomaticHomogeneousSlopes}
                >
                  Reapply recommendation
                </button>
              )}
            <small>
              Preliminary geometry only—confirm with project-specific stability and seepage
              analysis.
            </small>
          </div>
        )}
        <div className="settings-note">
          {zonedRepair
            ? 'The casing is the proposed outer bund section. Existing ground, stripping, toe levels, berms and all outer protection remain exactly as in the repair workflow.'
            : !surveyEntry
              ? `The bund widens by (${data.design.usSlope} + ${data.design.dsSlope}) m per 1 m of height, on top of the ${data.design.topWidth} m crest. Enter the ground level at each chainage below.`
              : data.mode === 'new'
                ? `The bund widens by (${data.design.usSlope} + ${data.design.dsSlope}) m per 1 m of height, on top of the ${data.design.topWidth} m crest. This draws the proposed bund (blue) at every chainage, so you only enter the surveyed ground it stands on. Upstream is the left face, downstream the right. MWL and FTL are drawn as reference lines.`
                : 'This draws the proposed bund (blue) at every chainage, so you only enter the existing ground. Upstream is the left face, downstream the right. MWL and FTL are drawn as reference lines.'}
        </div>
        <div className="settings-note">
          Every slope uses two entries: <b>horizontal run : vertical rise</b>. Enter one value
          in each box, for example <b>2 : 1</b> or <b>2½ : 1</b>.
        </div>

        {zonedRepair && (
          <div className="bund-hearting-design">
            <div className="bund-section-material-selection is-hearting">
              <span>Impervious core (hearting zone)</span>
              <strong>{selectedHeartingSoil?.label ?? 'No core soil selected'}</strong>
            </div>
            <div className="bund-hearting-fields">
              <NumField
                label="Top RL (default = MWL)"
                value={data.heartingDesign.topLevel}
                onChange={(value) =>
                  update({
                    heartingDesign: { ...data.heartingDesign, topLevel: value }
                  })
                }
              />
              <NumField
                label="Top width (m)"
                value={data.heartingDesign.topWidth}
                onChange={(value) =>
                  update({
                    heartingDesign: { ...data.heartingDesign, topWidth: value }
                  })
                }
              />
              <SlopeField
                label="U/S slope"
                value={data.heartingDesign.usSlope}
                onChange={(value) =>
                  update({
                    heartingDesign: { ...data.heartingDesign, usSlope: value },
                    zonedSlopeMode: 'manual'
                  })
                }
              />
              <SlopeField
                label="D/S slope"
                value={data.heartingDesign.dsSlope}
                onChange={(value) =>
                  update({
                    heartingDesign: { ...data.heartingDesign, dsSlope: value },
                    zonedSlopeMode: 'manual'
                  })
                }
              />
              <NumField
                label="Centre offset (m)"
                value={data.heartingDesign.centerOffset}
                onChange={(value) =>
                  update({
                    heartingDesign: { ...data.heartingDesign, centerOffset: value }
                  })
                }
              />
            </div>

          </div>
        )}
      </section>

      <div className="gw-main">
        <div className="bund-left-column">
        <aside className="gw-reaches">
          <div className="gw-reaches-head">
            <div className="gw-panel-label">Cross-sections</div>
            {sections.length > 1 && (
              <label className="gw-selectall">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                Select all
              </label>
            )}
          </div>
          <div className="gw-sections-list">
            {sections.map((s, i) => {
              const areas = sectionAreas(data, s)
              const filled = hasMeasurableGround(data, s)
              return (
                <div className={`gw-reach-row${s.id === selected?.id ? ' active' : ''}`} key={s.id}>
                  {sections.length > 1 && (
                    <input
                      type="checkbox"
                      className="gw-reach-check"
                      title="Tick to copy the current section's levels here"
                      checked={checked.has(s.id)}
                      onChange={() => toggleChecked(s.id)}
                    />
                  )}
                  <button className="gw-reach-main" onClick={() => setSelectedId(s.id)}>
                    <b>
                      {i + 1} · Ch {formatChainage(s.chainage, unit)} {unitLabel}
                    </b>
                    <small>
                      {filled
                        ? zonedRepair
                          ? (() => {
                              const split = zonedRepairAreas(data, s)
                              return `${qty3.format(split.casing)} m² casing · ${qty3.format(split.hearting)} m² hearting`
                            })()
                          : `${qty3.format(areas.formation)} m² fill · ${qty3.format(areas.stripping)} m² ${
                              data.mode === 'new' ? 'foundation excavation' : 'cut / stripping'
                            }`
                        : 'No levels yet'}
                    </small>
                  </button>
                </div>
              )
            })}
          </div>
          {selected && sections.length > 1 && (
            <div className="gw-copy-tools">
              <button
                className="btn ghost"
                disabled={selectedIndex <= 0}
                onClick={() => selectedIndex > 0 && copyLevelsFrom(sections[selectedIndex - 1].id)}
              >
                <ClipboardCopy size={13} /> Copy previous section
              </button>
              <select
                className="text-input"
                value={copyFrom}
                onChange={(e) => {
                  if (e.target.value) copyLevelsFrom(e.target.value)
                  setCopyFrom('')
                }}
              >
                <option value="">Copy from a section…</option>
                {sections.map(
                  (s, index) =>
                    s.id !== selected.id && (
                      <option key={s.id} value={s.id}>
                        {index + 1} · Ch {formatChainage(s.chainage, unit)} {unitLabel}
                      </option>
                    )
                )}
              </select>
              {copyTargets.length > 0 && (
                <div className="gw-bulk-apply">
                  <div className="settings-note">
                    Apply <b>Ch {formatChainage(selected.chainage, unit)}</b> to the{' '}
                    {copyTargets.length} ticked chainage{copyTargets.length > 1 ? 's' : ''}.
                  </div>
                  <button className="btn" onClick={applyLevelsToChecked}>
                    <ClipboardCopy size={13} /> Apply to {copyTargets.length} selected
                  </button>
                  <button className="btn ghost" onClick={() => setChecked(new Set())}>
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
          {selected && surveyEntry && (
            <aside className="bund-design-card">
          <div className="bund-design-populate">
            <div className="gw-panel-label">Generate this chainage&rsquo;s design points</div>
            <div className="bund-toe-mode">
              <label className="gw-radio">
                <input
                  type="radio"
                  name="bund-toe-entry"
                  checked={!data.sameToeLevels}
                  onChange={() => update({ sameToeLevels: false })}
                />
                Enter the upstream and downstream toe RLs
              </label>
              <label className="gw-radio">
                <input
                  type="radio"
                  name="bund-toe-entry"
                  checked={data.sameToeLevels}
                  onChange={() => {
                    update({ sameToeLevels: true })
                    // Both toes take the single value already typed.
                    if (selected.upstreamGroundLevel != null) {
                      updateSection(selected.id, {
                        downstreamGroundLevel: selected.upstreamGroundLevel
                      })
                    }
                  }}
                />
                Use one average RL for both toes
              </label>
            </div>
            {data.mode === 'new' && (
              <div className="settings-note">
                A new bund is usually set out on ground levelled to one RL across the seating,
                so the single average toe RL is the default here. Switch to two RLs where the
                ground genuinely falls across the section.
              </div>
            )}
            <div className="bund-section-design-row">
              <label className="field">
                <span className="field-label">
                  {data.sameToeLevels
                    ? 'Average toe ground level (RL)'
                    : 'Upstream toe ground level (RL)'}
                </span>
                <input
                  className="text-input"
                  type="number"
                  step="any"
                  value={selected.upstreamGroundLevel ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim() === '' ? null : Number(e.target.value)
                    updateSection(selected.id, {
                      upstreamGroundLevel: v,
                      ...(data.sameToeLevels ? { downstreamGroundLevel: v } : {})
                    })
                  }}
                />
              </label>
              {!data.sameToeLevels && (
                <label className="field">
                  <span className="field-label">Downstream toe ground level (RL)</span>
                  <input
                    className="text-input"
                    type="number"
                    step="any"
                    value={selected.downstreamGroundLevel ?? ''}
                    onChange={(e) =>
                      updateSection(selected.id, {
                        downstreamGroundLevel:
                          e.target.value.trim() === '' ? null : Number(e.target.value)
                      })
                    }
                  />
                </label>
              )}
              <button className="btn" onClick={populateSevenDesignPoints}>
                Populate design points
              </button>
              {selected && (selected.projectedOverrides?.length ?? 0) > 0 && (
                <button
                  className="btn ghost"
                  title="Discard every typed proposed level here and follow the design again"
                  onClick={() =>
                    updateSection(selected.id, { projectedOverrides: undefined, projected: null })
                  }
                >
                  Reset proposed levels to the design
                </button>
              )}
            </div>
          </div>
            </aside>
          )}
        </div>

        <section className="gw-center">
          <div className="bund-chainage-bar">
            {sections.map((s, i) => {
              const filled = hasMeasurableGround(data, s)
              return (
                <button
                  key={s.id}
                  className={`bund-ch-chip${s.id === selected?.id ? ' active' : ''}${
                    filled ? ' filled' : ''
                  }`}
                  onClick={() => setSelectedId(s.id)}
                  title={filled ? 'Levels entered' : 'No levels yet'}
                >
                  <b>{i + 1}</b>
                  <span>
                    Ch {formatChainage(s.chainage, unit)}
                  </span>
                </button>
              )
            })}
          </div>

          {selected ? (
            <>
              <div className="gw-section-head">
                <span className="gw-badge">
                  Chainage {formatChainage(selected.chainage, unit)} {unitLabel}
                </span>
              </div>

              <BundSectionDiagram data={data} section={selected} />

              {sectionDesignIssues(selected, data).map((issue) => (
                <div
                  key={`design-issue-${issue.side}`}
                  className="settings-note bund-berm-issue is-error"
                >
                  {issue.message}
                </div>
              ))}
              {zonedRepair &&
                heartingRepairIssues(data, selected).map((issue, index) => (
                  <div
                    key={`hearting-issue-${issue.code}-${index}`}
                    className={`settings-note bund-berm-issue ${
                      issue.code === 'missing-boundary' ? 'is-warning' : 'is-error'
                    }`}
                  >
                    {issue.message}
                  </div>
                ))}

              {!surveyEntry ? (
                <div className="gw-wall-form">
                  <div className="gw-panel-label">Ground level at this chainage</div>
                  <div className="gw-param-grid">
                    <NumField
                      label="Existing ground level"
                      value={selected.groundLevel ?? 0}
                      onChange={(v) => updateSection(selected.id, { groundLevel: v })}
                    />
                  </div>
                  <div className="settings-note">
                    Everything else comes from the design section above. Where the ground is already
                    at or above TBL, the bund height is zero and nothing is billed.
                  </div>
                </div>
              ) : (
                <div className="gw-wall-form">
                  <div className="gw-panel-label">Cross-section levels at this chainage</div>
                  <div className="settings-note bund-table-intro">
                    One row per surveyed point across the full leveling width: from the outer
                    edge of the U/S toe-wall platform, through the proposed bund, to the outer
                    edge of the D/S toe-drain platform. Distance is measured from the generated
                    U/S bund toe, so that toe is <b>0.000 m</b>; upstream values are negative and
                    downstream values are positive.
                    {data.mode === 'new' && (
                      <>
                        {' '}Nothing is standing here yet, so the two toe RLs alone already
                        describe the natural ground; add points between them wherever the
                        ground actually falls away from that line.
                      </>
                    )}
                    {zonedRepair && (
                      <>
                        {' '}The hearting side lines automatically stop at their first contact
                        with this Existing RL profile.
                      </>
                    )}
                  </div>
                  <div className="bund-level-actions">
                    <button className="btn ghost" onClick={addLevelRow}>
                      <Plus size={13} /> Add a point
                    </button>
                    <button
                      className="btn ghost"
                      title="Sort points and remove redundant points that do not change either profile"
                      disabled={levelRows.length < 3}
                      onClick={rearrangeLevelRows}
                    >
                      <ArrowDownUp size={13} /> Rearrange points
                    </button>
                    <button
                      className="btn ghost"
                      title="Remove all Existing Ground points for this chainage"
                      disabled={
                        !levelRows.some((row) => row.pre != null) &&
                        selected.upstreamGroundLevel == null &&
                        selected.downstreamGroundLevel == null
                      }
                      onClick={clearExistingLevels}
                    >
                      <Trash2 size={13} /> Clear Existing
                    </button>
                    <button
                      className="btn ghost"
                      title="Remove all Proposed Bund points for this chainage"
                      disabled={
                        !levelRows.some((row) => row.projected != null) &&
                        !(selected.projected && selected.projected.length >= 2) &&
                        !(selected.projectedOverrides && selected.projectedOverrides.length > 0) &&
                        !designPointsGenerated
                      }
                      onClick={clearProposedLevels}
                    >
                      <Trash2 size={13} /> Clear Proposed
                    </button>
                  </div>
                  <table className="bund-levels">
                    <thead>
                      <tr>
                        <th>Distance from u/s toe (m)</th>
                        <th>{zonedRepair ? 'Existing RL' : 'Existing ground level'}</th>
                        <th>Stripped / cut level</th>
                        <th>Proposed bund level</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {levelRows.map((row, i) => {
                        // Toe rows are the outermost generated design points.
                        const designOffsets = sectionDesignOffsets(selected, data.design)
                        const isUsToe =
                          designOffsets.length > 0 &&
                          Math.abs(row.offset - Math.min(...designOffsets)) < 1e-6
                        const isDsToe =
                          designOffsets.length > 0 &&
                          Math.abs(row.offset - Math.max(...designOffsets)) < 1e-6
                        const isUsLevelingLimit =
                          selectedLevelingLimits != null &&
                          selectedLevelingLimits.startOffset <
                            selectedLevelingLimits.usToeOffset - 1e-9 &&
                          Math.abs(
                            row.offset - selectedLevelingLimits.startOffset
                          ) < 1e-6
                        const isDsLevelingLimit =
                          selectedLevelingLimits != null &&
                          selectedLevelingLimits.endOffset >
                            selectedLevelingLimits.dsToeOffset + 1e-9 &&
                          Math.abs(
                            row.offset - selectedLevelingLimits.endOffset
                          ) < 1e-6
                        const isLevelingPlatform =
                          selectedLevelingLimits != null &&
                          (row.offset <
                            selectedLevelingLimits.usToeOffset - 1e-9 ||
                            row.offset >
                              selectedLevelingLimits.dsToeOffset + 1e-9)
                        // A blank existing RL follows the line through the RLs that
                        // *are* entered — the same interpolation the chart draws and
                        // the quantities measure. Typing a value overrides it.
                        const autoPre =
                          row.pre == null && selected.pre.length >= 2
                            ? existLevelAt(selected.pre, row.offset)
                            : null
                        const effectivePre = row.pre ?? autoPre
                        const automaticProposed =
                          selectedLevelingLimits &&
                          row.offset < selectedLevelingLimits.usToeOffset - 1e-9
                            ? selectedLevelingLimits.usToeLevel
                            : selectedLevelingLimits &&
                                row.offset >
                                  selectedLevelingLimits.dsToeOffset + 1e-9
                              ? selectedLevelingLimits.dsToeLevel
                              : designSurfaceAt(row.offset, data.design)
                        const effectiveProposed = row.projected ?? automaticProposed
                        return (
                        <tr
                          key={i}
                          className={
                            isUsToe ||
                            isDsToe ||
                            isUsLevelingLimit ||
                            isDsLevelingLimit
                              ? 'bund-row-toe'
                              : undefined
                          }
                        >
                          <td>
                            <div className="bund-offset-cell">
                              <DecimalInput
                                value={Math.round((row.offset - toeOrigin) * 1000) / 1000}
                                allowBlank={false}
                                onValueChange={(typed) => {
                                  if (typed == null) return
                                  // Stored centre-relative; typed from the u/s toe.
                                  editLevel(
                                    i,
                                    'offset',
                                    Math.round((toeOrigin + typed) * 1000) / 1000
                                  )
                                }}
                              />
                              {(isUsToe ||
                                isDsToe ||
                                isUsLevelingLimit ||
                                isDsLevelingLimit) && (
                                <span className="bund-toe-tag">
                                  {isUsLevelingLimit
                                    ? 'U/S toe-wall limit'
                                    : isUsToe
                                      ? 'U/S bund toe'
                                      : isDsToe
                                        ? 'D/S bund toe'
                                        : 'D/S toe-drain limit'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <DecimalInput
                              value={row.pre}
                              placeholder={autoPre != null ? autoPre.toFixed(3) : undefined}
                              onValueChange={(value) => editLevel(i, 'pre', value)}
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={row.stripped}
                              placeholder={
                                effectivePre != null
                                  ? automaticStrippedLevelAt(
                                      effectivePre,
                                      effectiveProposed,
                                      data.design
                                    ).toFixed(3)
                                  : undefined
                              }
                              onValueChange={(value) => editLevel(i, 'stripped', value)}
                            />
                          </td>
                          <td>
                            <DecimalInput
                              value={row.projected}
                              placeholder={automaticProposed.toFixed(3)}
                              disabled={!designPointsGenerated || isLevelingPlatform}
                              title={
                                isLevelingPlatform
                                  ? 'Fixed leveling platform at the proposed toe RL'
                                  : designPointsGenerated
                                  ? 'Overrides the design level at this offset'
                                  : 'Generate the design points first — the proposed level is derived from the design until then'
                              }
                              onValueChange={(value) => editLevel(i, 'projected', value)}
                            />
                          </td>
                          <td>
                            <button
                              className="panel-iconbtn"
                              title="Remove this offset"
                              onClick={() => removeLevelRow(i)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="settings-note">
                    The toe ground RLs and global design dimensions generate the bund points. The
                    U/S toe-wall and D/S toe-drain limits are then added automatically from their
                    top widths. Enter every <b>existing ground</b> RL surveyed outside the toes;
                    when an outside RL is blank, the nearest entered ground RL is carried level to
                    that limit. Intermediate blanks follow the straight line through the entered
                    RLs. The chart and quantities use that same line. The <b>proposed</b> line stays
                    at the fixed design RL, with level platforms outside the two bund toes. The automatic{' '}
                    <b>stripped / cut</b> level uses the normal strip depth where the bund is above
                    ground. Where existing ground is higher than design, it stops at the design RL,
                    so only the excess is removed and the bund is never raised or reshaped.
                  </div>
                  {designMessage ? (
                    <div className="settings-note bund-design-message">
                      <b>{designMessage}</b>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <div className="latlng-display">No cross-sections yet — use Edit sections.</div>
          )}
        </section>
      </div>

      <section className="gw-materials bund-stripping-section">
        <div className="gw-materials-title">
          {data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping'}
        </div>
        <div className="bund-stripping-layout">
          <div className="bund-option-card bund-stripping-excavation-card">
            <div className="bund-stripping-family">
              <span>Excavation basis</span>
              <label className={strippingExcavationFamily === 'seating' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  checked={strippingExcavationFamily === 'seating'}
                  onChange={() => setStrippingExcavationFamily('seating')}
                />
                <span>
                  <b>{data.mode === 'new' ? 'Bund Foundation Excavation' : 'Bund Stripping'}</b>
                  <small>CAW excavation codes</small>
                </span>
              </label>
              <label className={strippingExcavationFamily === 'foundation' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  checked={strippingExcavationFamily === 'foundation'}
                  onChange={() => setStrippingExcavationFamily('foundation')}
                />
                <span>
                  <b>Bund Foundation Excavation</b>
                  <small>DAW excavation codes</small>
                </span>
              </label>
            </div>
            <div className="gw-param-grid bund-stripping-depth-grid">
              <NumField
                label={
                  data.mode === 'new'
                    ? 'Foundation excavation depth (m)'
                    : 'Depth of top soil stripped (m)'
                }
                value={data.design.stripDepth}
                onChange={(v) => update({ design: { ...data.design, stripDepth: v } })}
              />
            </div>
            {renderExcavationClassCard(excavationSource('stripping'))}
            <div className="settings-note">
              The default is All Soils 100%. HDR, F&amp;F and HR are used only when the measured
              cut actually enters those strata.{' '}
              {data.mode === 'new'
                ? 'A new bund starts on foundation excavation: the whole foundation is cut and prepared before any fill is placed. Select the CAW code basis only when required by the approved specification.'
                : 'Select foundation excavation only when the approved section treats the cut below the embankment as a foundation.'}
            </div>
            {trenchAvailable && (
              <div
                className={`bund-option-module bund-hearting-trench-card${
                  trenchOn ? ' is-enabled' : ''
                }`}
              >
                <label className="bund-optional-head">
                  <input
                    type="checkbox"
                    checked={trenchOn}
                    onChange={() =>
                      trenchOn ? disableHeartingTrench() : enableHeartingTrench()
                    }
                  />
                  <span className="bund-option-module-title">
                    Hearting cut-off trench (foundation of the hearting)
                  </span>
                </label>
                <small>
                  The core carried below the formation base into tighter soil, so seepage
                  cannot pass underneath it. The trench is excavated and then filled back
                  with the same selected impervious soil — one solid, so the cut and the
                  filling carry the same volume.
                </small>
                {trenchOn && (
                  <>
                    <div className="gw-param-grid">
                      <label className="field">
                        <span className="field-label">Depth calculation</span>
                        <select
                          className="text-input"
                          value={data.heartingTrench.depthMode}
                          onChange={(event) =>
                            patchHeartingTrench({
                              depthMode: event.target.value as 'auto' | 'manual'
                            })
                          }
                        >
                          <option value="auto">Auto — ½ water depth</option>
                          <option value="manual">Manual entry</option>
                        </select>
                      </label>
                      {data.heartingTrench.depthMode === 'auto' ? (
                        <label className="field">
                          <span className="field-label">Calculated depth (m)</span>
                          <input
                            className="text-input"
                            type="number"
                            readOnly
                            disabled
                            tabIndex={-1}
                            title="Calculated automatically from FTL/FRL (or MWL when FTL is blank) and the lowest toe RL"
                            value={effectiveTrenchDepth}
                          />
                        </label>
                      ) : (
                        <NumField
                          label="Manual depth (m)"
                          value={data.heartingTrench.depth}
                          onChange={(v) => patchHeartingTrench({ depth: v })}
                        />
                      )}
                      <NumField
                        label="Bottom width (m)"
                        value={data.heartingTrench.bottomWidth}
                        onChange={(v) => patchHeartingTrench({ bottomWidth: v })}
                      />
                      <SlopeField
                        label="U/S side slope"
                        value={data.heartingTrench.usSlope}
                        onChange={(v) => patchHeartingTrench({ usSlope: v })}
                      />
                      <SlopeField
                        label="D/S side slope"
                        value={data.heartingTrench.dsSlope}
                        onChange={(v) => patchHeartingTrench({ dsSlope: v })}
                      />
                    </div>
                    <div className="settings-note">
                      {data.heartingTrench.depthMode === 'auto' ? (
                        governingDeepestToe && autoTrenchWaterLevel != null ? (
                          <>
                            Auto depth = ½ × ({autoTrenchWaterLabel}{' '}
                            {qty3.format(autoTrenchWaterLevel)} − lowest{' '}
                            {governingDeepestToe.side.toUpperCase()} toe RL{' '}
                            {qty3.format(governingDeepestToe.rl)} at{' '}
                            {formatChainage(governingDeepestToe.chainage, data.chainageUnit)}) ={' '}
                            <b>{qty3.format(effectiveTrenchDepth)} m</b>, subject to the 0.60 m
                            minimum.
                          </>
                        ) : (
                          <>
                            Auto mode needs FTL/FRL and at least one measurable toe section. MWL
                            is used only when FTL/FRL is blank. Until a water level and toe are
                            available, the minimum <b>0.60 m</b> depth is used.
                          </>
                        )
                      ) : (
                        <>Manual mode uses the entered depth for every section.</>
                      )}
                    </div>
                    <div className="bund-inline-measure">
                      <span>
                        <b>{qty3.format(heartingTrenchArea(data))}</b> sq.m section
                      </span>
                      <span>
                        top width <b>{qty3.format(heartingTrenchTopWidth(data))}</b> m
                      </span>
                      <span>
                        <b>{qty3.format(trenchTotal)}</b> cu.m over{' '}
                        {Math.round(data.lengthM).toLocaleString('en-IN')} m
                      </span>
                    </div>

                    {data.heartingTrench.fillMaterial && (
                      <div className="bund-inline-measure">
                        <SsrCode
                          code={data.heartingTrench.fillMaterial.code}
                          description={data.heartingTrench.fillMaterial.description}
                          className="gw-material-code"
                        />
                        <span>Impervious filling · {qty3.format(trenchTotal)} cu.m</span>
                        <button
                          className="btn ghost"
                          onClick={() => setPicker('hearting-trench')}
                        >
                          <Pencil size={12} /> filling code
                        </button>
                      </div>
                    )}
                    {picker === 'hearting-trench' && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="cut-off trench filling"
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          patchHeartingTrench({
                            fillMaterial: {
                              code: item.code,
                              description: item.description,
                              unit: item.unit,
                              categoryKey: item.category,
                              side: item.side,
                              dataVariant: item.dataVariant
                            }
                          })
                          setPicker(null)
                        }}
                      />
                    )}
                    <div className="settings-note">
                      The filling is billed apart from the hearting embankment above it:
                      the SSR rates a confined trench fill separately from open
                      embankment layers.
                    </div>
                    {data.heartingTrench.excavationMaterial &&
                      renderExcavationClassCard(excavationSource('hearting-trench-exc'))}
                    {heartingTrenchIssues(data, selected).map((issue) => (
                      <div
                        key={`trench-${issue.code}`}
                        className={`settings-note bund-berm-issue ${
                          issue.code === 'below-hearting' ? 'is-error' : 'is-warning'
                        }`}
                      >
                        {issue.message}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="bund-stripping-side">
            <div className="gw-material-card bund-clearance-card">
              <div className="gw-panel-label">Jungle clearance</div>
              {data.clearanceMaterial ? (
                <>
                  <SsrCode
                    code={data.clearanceMaterial.code}
                    description={data.clearanceMaterial.description}
                    className="gw-material-code"
                  />
                  <small>
                    {data.clearanceMaterial.unit
                      ? `${data.clearanceMaterial.unit} · `
                      : ''}
                    Plan area cleared along the bund.
                  </small>
                  <TemplateDefaultVariantButton
                    ownerId={node.id}
                    code={data.clearanceMaterial.code}
                    defaultCode={BUND_DEFAULT_CLEARANCE_CODE}
                    selection={data.clearanceMaterial.dataVariant}
                  />
                </>
              ) : (
                <small>Not billed — no jungle-clearance item is generated.</small>
              )}
              <div className="gw-card-actions">
                <button className="btn ghost" onClick={() => setPicker('clearance')}>
                  <Pencil size={13} />{' '}
                  {data.clearanceMaterial ? 'Change code' : 'Attach code'}
                </button>
                <button
                  className="btn ghost"
                  onClick={() =>
                    update({
                      clearanceMaterial: data.clearanceMaterial
                        ? null
                        : { code: BUND_DEFAULT_CLEARANCE_CODE }
                    })
                  }
                >
                  {data.clearanceMaterial ? 'Remove' : 'Add back'}
                </button>
              </div>
              {picker === 'clearance' && (
                <MaterialPicker
                  initialCategory="IRR-PMW"
                  onClose={() => setPicker(null)}
                  onPick={(item) => {
                    setBundMaterial(node.id, 'clearance', item)
                    setPicker(null)
                  }}
                />
              )}
            </div>
            {data.clearanceMaterial && (
              <div className="bund-clearance-measure-card">
                <div className="bund-clearance-measure-head">
                  <div>
                    <b>Jungle clearance — how it is measured</b>
                    <small>Choose the applicable plan-area method.</small>
                  </div>
                  <strong>{qty3.format(clearanceTotal(data))} sq.m</strong>
                </div>
                <div className="bund-clearance-mode is-compact">
                  <label className="gw-radio">
                    <input
                      type="radio"
                      checked={data.clearanceMode === 'perimeter'}
                      onChange={() => update({ clearanceMode: 'perimeter' })}
                    />
                    <span>
                      <strong>Automatic</strong>
                      <em className="bund-radio-hint">
                        {data.mode === 'new'
                          ? 'Average width at stripped level × chainage length.'
                          : 'Average surveyed ground perimeter × chainage length.'}
                      </em>
                    </span>
                  </label>
                  <label className="gw-radio">
                    <input
                      type="radio"
                      checked={data.clearanceMode === 'manual'}
                      onChange={() =>
                        update({
                          clearanceMode: 'manual',
                          clearanceManualRows: data.clearanceManualRows.length
                            ? data.clearanceManualRows
                            : [{ id: newId(), length: null, breadth: null }]
                        })
                      }
                    />
                    <span>
                      <strong>Manual patches</strong>
                      <em className="bund-radio-hint">Length × breadth for each cleared patch.</em>
                    </span>
                  </label>
                </div>
                {data.clearanceMode === 'manual' && (
                  <div className="bund-clearance-manual-compact">
                    {data.clearanceManualRows.map((row, index) => (
                      <div className="bund-clearance-manual-row" key={row.id}>
                        <span>{index + 1}</span>
                        <label className="field">
                          <span className="field-label">Length (m)</span>
                          <input
                            className="text-input"
                            type="number"
                            step="any"
                            value={row.length ?? ''}
                            onChange={(e) =>
                              update({
                                clearanceManualRows: data.clearanceManualRows.map((candidate) =>
                                  candidate.id === row.id
                                    ? {
                                        ...candidate,
                                        length:
                                          e.target.value.trim() === ''
                                            ? null
                                            : Number(e.target.value)
                                      }
                                    : candidate
                                )
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Breadth (m)</span>
                          <input
                            className="text-input"
                            type="number"
                            step="any"
                            value={row.breadth ?? ''}
                            onChange={(e) =>
                              update({
                                clearanceManualRows: data.clearanceManualRows.map((candidate) =>
                                  candidate.id === row.id
                                    ? {
                                        ...candidate,
                                        breadth:
                                          e.target.value.trim() === ''
                                            ? null
                                            : Number(e.target.value)
                                      }
                                    : candidate
                                )
                              })
                            }
                          />
                        </label>
                        <b>{qty3.format(clearanceManualRowArea(row))}</b>
                        <button
                          className="panel-iconbtn"
                          title="Delete row"
                          onClick={() =>
                            update({
                              clearanceManualRows: data.clearanceManualRows.filter(
                                (candidate) => candidate.id !== row.id
                              )
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn ghost bund-clearance-add-row"
                      onClick={() =>
                        update({
                          clearanceManualRows: [
                            ...data.clearanceManualRows,
                            { id: newId(), length: null, breadth: null }
                          ]
                        })
                      }
                    >
                      <Plus size={13} /> Add patch
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="gw-materials bund-earthwork-section">
        <div className="gw-materials-title">
          {zonedRepair ? 'Zoned embankment - casing and hearting' : 'Homogeneous embankment'}
        </div>
        <div className="bund-earthwork-operation-card">
          <div className="bund-earthwork-operation-head">
            <div>
              <div className="gw-panel-label">
                {zonedRepair ? 'Complete zoned SSR items' : 'Operations to be billed'}
              </div>
              <small>
                {zonedRepair
                  ? 'The embankment fill is split into casing and impervious hearting. Each selected SSR item already includes its required formation and compaction operations.'
                  : 'Both operations use the same computed embankment volume. The selected combination determines the SSR code.'}
              </small>
            </div>
            <div className="bund-earthwork-code-status">
              {zonedRepair ? (
                <>
                  <b>Total embankment fill</b>
                  <small>{qty3.format(formationTotal)} cu.m</small>
                </>
              ) : earthworkCode ? (
                <>
                  <SsrCode
                    code={earthworkCode}
                    description={
                      combinedEarthwork
                        ? data.formationMaterial.description
                        : formationEnabled
                          ? data.formationMaterial.description
                          : data.rollingMaterial.description
                    }
                    className="gw-material-code"
                  />
                  <TemplateDefaultVariantButton
                    ownerId={node.id}
                    code={earthworkCode}
                    defaultCode={earthworkCode}
                    selection={
                      formationEnabled
                        ? data.formationMaterial.dataVariant
                        : data.rollingMaterial.dataVariant
                    }
                  />
                </>
              ) : (
                <b>No embankment operation billed</b>
              )}
              {!zonedRepair && <small>{qty3.format(formationTotal)} cu.m</small>}
            </div>
          </div>

          {zonedRepair && (
            <div className="bund-zoned-ssr-basis">
              <div>
                <div className="gw-panel-label">Zoned SSR basis</div>
                <small>
                  These are complete embankment items. Placement, watering and compaction
                  are already included in both the casing and hearting codes.
                </small>
              </div>

              {data.mode === 'restoration' ? (
                <>
                  <div className="bund-earthwork-checks">
                    <label
                      className={`bund-earthwork-check${
                        data.zonedRepairKind === 'breached' ? ' is-on' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="zoned-repair-kind"
                        checked={data.zonedRepairKind === 'breached'}
                        onChange={() =>
                          setZonedSsrBasis('breached', data.zonedSoilSource)
                        }
                      />
                      <span>
                        <strong>Breached or damaged portion</strong>
                        <small>Use the PMW repair pair in 10–15 cm layers at 98% density.</small>
                      </span>
                    </label>
                    <label
                      className={`bund-earthwork-check${
                        data.zonedRepairKind === 'raising' ? ' is-on' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="zoned-repair-kind"
                        checked={data.zonedRepairKind === 'raising'}
                        onChange={() =>
                          setZonedSsrBasis('raising', data.zonedSoilSource)
                        }
                      />
                      <span>
                        <strong>Raising or strengthening</strong>
                        <small>Use the DAW zoned-embankment pair in 25–30 cm layers.</small>
                      </span>
                    </label>
                  </div>

                  {data.zonedRepairKind === 'breached' && (
                    <div className="bund-zoned-source">
                      <span className="field-label">Where will the soil come from?</span>
                      <label className="gw-radio">
                        <input
                          type="radio"
                          name="zoned-soil-source"
                          checked={data.zonedSoilSource === 'borrow'}
                          onChange={() => setZonedSsrBasis('breached', 'borrow')}
                        />
                        Approved borrow area
                      </label>
                      <label className="gw-radio">
                        <input
                          type="radio"
                          name="zoned-soil-source"
                          checked={data.zonedSoilSource === 'dump'}
                          onChange={() => setZonedSsrBasis('breached', 'dump')}
                        />
                        Approved dump area
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <div className="settings-note">
                  New zoned bund · approved borrow soil · DAW earth/rockfill embankment items.
                  {trenchOn
                    ? ' The cut-off trench under the core is billed separately, on the SSR’s own confined trench-filling item.'
                    : ''}
                </div>
              )}

              {zonedCodes && (
                <div className="settings-note">
                  Selected pair: casing <b>{zonedCodes.casing}</b> · impervious hearting{' '}
                  <b>{zonedCodes.hearting}</b>. No separate compaction item will be generated.
                </div>
              )}
            </div>
          )}

          {zonedRepair && (
            <div className="bund-zoned-material-grid">
              {(
                [
                  {
                    key: 'casing',
                    title: 'Casing',
                    description: 'Outer shell and all embankment fill outside the hearting zone.',
                    quantity: casingTotal,
                    role: 'casing' as BundItemRole,
                    material: data.formationMaterial
                  },
                  {
                    key: 'hearting',
                    title: 'Hearting',
                    description:
                      data.mode === 'restoration'
                        ? 'Impervious zone whose side lines stop automatically at the surveyed Existing RL.'
                        : 'Impervious zone extending from its top to the new bund formation base.',
                    quantity: heartingTotal,
                    role: 'hearting' as BundItemRole,
                    material: data.heartingMaterial
                  }
                ] as const
              ).map((zone) => (
                <div className="bund-zoned-material-card" key={zone.key}>
                  <div>
                    <div className="gw-panel-label">{zone.title}</div>
                    <small>{zone.description}</small>
                  </div>
                  <b>{qty3.format(zone.quantity)} cu.m</b>
                  <SsrCode
                    code={zone.material.code}
                    description={zone.material.description}
                    className="gw-material-code"
                  />
                  <button className="btn ghost" onClick={() => setPicker(zone.role)}>
                    <Pencil size={13} /> Select {zone.title.toLowerCase()} code
                  </button>
                  {picker === zone.role && (
                    <MaterialPicker
                      initialCategory={
                        zone.material.code.startsWith('IRR-PMW')
                          ? 'IRR-PMW'
                          : 'IRR-DAW'
                      }
                      initialSearch={
                        zone.key === 'hearting'
                          ? 'impervious hearting'
                          : 'pervious casing'
                      }
                      selectionHint={`${zone.title} material`}
                      onClose={() => setPicker(null)}
                      onPick={(item) => {
                        setBundMaterial(node.id, zone.role, withKnownZonedUnit(item))
                        setPicker(null)
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {!zonedRepair && (
            <>
              <div className="bund-earthwork-checks">
                <label className={`bund-earthwork-check${formationEnabled ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={formationEnabled}
                    onChange={(e) =>
                      setEarthworkOperations(e.target.checked, compactionEnabled)
                    }
                  />
                  <span>
                    <strong>Formation</strong>
                    <small>
                      Approved soil: excavation from the borrow area, transport, spreading and
                      sectioning.
                    </small>
                  </span>
                </label>

                <label className={`bund-earthwork-check${compactionEnabled ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={compactionEnabled}
                    onChange={(e) =>
                      setEarthworkOperations(formationEnabled, e.target.checked)
                    }
                  />
                  <span>
                    <strong>Compaction</strong>
                    <small>Watering and rolling to the specified density.</small>
                  </span>
                </label>
              </div>

              <div className="settings-note">
                {combinedEarthwork ? (
                  <>
                    Both selected → <b>{BUND_DEFAULT_FORMATION_CODE}</b>, one combined item for
                    formation and compaction.
                  </>
                ) : formationEnabled ? (
                  <>
                    Formation only → <b>{BUND_SPLIT_FORMATION_CODE}</b>. Watering and rolling are
                    not billed.
                  </>
                ) : compactionEnabled ? (
                  <>
                    <b>Compaction only → {BUND_SPLIT_ROLLING_CODE}.</b> Use this only when the soil
                    is already placed and formation is paid elsewhere or was completed earlier.
                    It is not the normal selection for a new bund.
                  </>
                ) : (
                  <>
                    <b>No formation or compaction item will be generated.</b> Use this only when
                    the entire embankment earthwork is covered elsewhere.
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- Optional extras: enable only what this bund actually has ---- */}
      <section className="gw-materials">
        <div className="gw-materials-title">
          Optional items 
        </div>
        <div className="bund-optional-layout">
          <OptionalCard
            title="Revetment — upstream slope"
            desc="Choose the DAW construction and its protection extent. Stone and graded-filter dimensions are fixed by the selected code."
            enabled={Boolean(data.pitchingMaterial)}
            code={data.pitchingMaterial?.code}
            description={data.pitchingMaterial?.description}
            unit={data.pitchingMaterial?.unit}
            qtyText={pitchingQtyText}
            onEnable={() => selectRevetmentCode(BUND_DEFAULT_PITCHING_CODE)}
            onDisable={() =>
              update({
                pitchingMaterial: null,
                pitchingBeddingMaterial: null,
                pitchingMetalEnabled: false,
                pitchingMetalMaterial: null
              })
            }
            horizontal
            showStatus={false}
            extra={
              data.pitchingMaterial ? (
                <div className="bund-revetment-panel">
                  <div className="bund-revetment-controls">
                    <div className="bund-revetment-selected">
                      <span>Selected system</span>
                      <SsrCode
                        code={data.pitchingMaterial.code}
                        description={data.pitchingMaterial.description}
                      />
                      <strong>{selectedRevetment?.construction ?? 'DAW revetment'}</strong>
                      <small>
                        {Math.round(revetmentStoneThickness * 1000)} mm stone +{' '}
                        {Math.round(revetmentFilterThickness * 1000)} mm graded filter
                      </small>
                      <b>{pitchingQtyText}</b>
                    </div>

                    <div className="bund-pitching-presets bund-revetment-extent">
                      <span>Protection extent</span>
                      <button
                        type="button"
                        className={`btn small${data.pitchingExtent !== 'full' ? ' active' : ''}`}
                        onClick={() => update({ pitchingExtent: 'mwl' })}
                      >
                        Up to MWL
                      </button>
                      <button
                        type="button"
                        className={`btn small${data.pitchingExtent === 'full' ? ' active' : ''}`}
                        onClick={() => update({ pitchingExtent: 'full' })}
                      >
                        Full U/S face
                      </button>
                      <small>
                        {data.pitchingExtent === 'full'
                          ? 'Complete upstream face.'
                          : data.design.mwl == null
                            ? 'MWL is required.'
                            : 'Ends where MWL meets ground.'}
                      </small>
                    </div>
                  </div>

                  <div
                    className="bund-revetment-options"
                    role="radiogroup"
                    aria-label="DAW revetment system"
                  >
                    <div className="bund-revetment-option-head" aria-hidden="true">
                      <span>DAW item</span>
                      <span>Construction</span>
                      <span>Stone</span>
                      <span>Filter</span>
                      <span>Anchoring</span>
                    </div>
                    {BUND_DAW_REVETMENT_OPTIONS.map((option) => {
                      const selected = data.pitchingMaterial?.code === option.code
                      return (
                        <button
                          key={option.code}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={`bund-revetment-option${selected ? ' is-selected' : ''}`}
                          onClick={() => selectRevetmentCode(option.code)}
                        >
                          <span className="bund-revetment-option-code">
                            {option.code.replace('IRR-', '')}
                            {option.code === BUND_DEFAULT_PITCHING_CODE && <em>Default</em>}
                          </span>
                          <span>{option.construction}</span>
                          <strong>{Math.round(option.stoneThickness * 1000)} mm</strong>
                          <strong>{Math.round(option.filterThickness * 1000)} mm</strong>
                          <span>{option.throughStones ? 'Through stones' : 'None'}</span>
                        </button>
                      )
                    })}
                  </div>

                  <small className="bund-revetment-footnote">
                    Each row is one integrated SQM item covering both displayed layers. Toe anchorage is measured separately.
                  </small>
                </div>
              ) : null
            }
          />

          <div
            className={`bund-option-card bund-upstream-toe${
              upstreamToeOn ? ' is-enabled' : ''
            }`}
          >
            <div className="bund-option-summary">
              <div className="bund-option-intro">
                <label className="bund-optional-head">
                  <input
                    type="checkbox"
                    checked={upstreamToeOn}
                    onChange={(e) =>
                      e.target.checked
                        ? enableUpstreamToe()
                        : patchToe('upstreamToe', {
                            excavationMaterial: null,
                            buildMaterial: null,
                            buildArea: 0,
                            liningThickness: 0
                          })
                    }
                  />
                  <span className="gw-panel-label">U/S toe wall / anchorage</span>
                </label>
                <small>
                  Cut-off trench at the upstream toe, with an optional PCC or masonry wall built
                  into it. Anchors the slope revetment when revetment is used, but stands on its own
                  otherwise.
                </small>
              </div>
            </div>

            {upstreamToeOn && (
              <div className="bund-option-details">
                <div className="bund-upstream-toe-layout">
                  <div className="bund-upstream-toe-visual">
                    <BundToeDiagram
                      topWidth={data.upstreamToe.topWidth}
                      bottomWidth={data.upstreamToe.bottomWidth}
                      depth={data.upstreamToe.depth}
                      lined={false}
                      solid={Boolean(data.upstreamToe.buildMaterial)}
                    />
                  </div>
                  <div className="gw-param-grid bund-upstream-toe-fields">
                    <NumField
                      label="Top width (m)"
                      value={data.upstreamToe.topWidth}
                      onChange={(v) => patchToe('upstreamToe', { topWidth: v })}
                    />
                    <NumField
                      label="Bottom width (m)"
                      value={data.upstreamToe.bottomWidth}
                      onChange={(v) => patchToe('upstreamToe', { bottomWidth: v })}
                    />
                    <NumField
                      label="Depth (m)"
                      value={data.upstreamToe.depth}
                      onChange={(v) => patchToe('upstreamToe', { depth: v })}
                    />
                  </div>
                </div>
                <div className="settings-note bund-toe-line">
                  Excavation geometry ·{' '}
                  {qty3.format(toeExcavationArea(data.upstreamToe))} m² section →{' '}
                  <b>{qty3.format(upstreamToeExcTotal)}</b> cu.m.
                </div>
                  {selected &&
                    (() => {
                      const platform = upstreamToePlatformAt(selected, data)
                      if (!platform) return null
                      return (
                        <div className="settings-note bund-toe-line">
                          Formed at the <b>proposed</b> toe level RL{' '}
                          {qty3.format(platform.level)}. General bund leveling starts at the
                          outer edge of this {qty3.format(
                            platform.toOffset - platform.fromOffset
                          )} m top width and includes any cut or fill needed to reach the
                          platform. This card measures only the trench dug afterward and its
                          anchorage construction.
                        </div>
                      )
                    })()}
                {renderExcavationClassCard(excavationSource('ustoe-exc'))}
                <div className="bund-upstream-toe-code-choices">
                  <span>Anchorage construction:</span>
                  <button
                    className={`btn ghost${
                      data.upstreamToe.buildMaterial?.code ===
                      BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE
                        ? ' active'
                        : ''
                    }`}
                    onClick={() =>
                      attachToe(
                        'upstreamToe',
                        'buildMaterial',
                        BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE
                      )
                    }
                  >
                    M15 PCC
                  </button>
                  <button
                    className={`btn ghost${
                      data.upstreamToe.buildMaterial?.code ===
                      BUND_UPSTREAM_TOE_MASONRY_CODE
                        ? ' active'
                        : ''
                    }`}
                    onClick={() =>
                      attachToe(
                        'upstreamToe',
                        'buildMaterial',
                        BUND_UPSTREAM_TOE_MASONRY_CODE
                      )
                    }
                  >
                    UCR masonry CM 1:4
                  </button>
                  <button className="btn ghost" onClick={() => setPicker('ustoe-build')}>
                    <Pencil size={12} /> custom code
                  </button>
                </div>
                {data.upstreamToe.buildMaterial ? (
                  <div className="settings-note bund-toe-line">
                    Construction{' '}
                    <SsrCode
                      code={data.upstreamToe.buildMaterial.code}
                      description={data.upstreamToe.buildMaterial.description}
                    />{' '}
                    · full modelled toe section × bund length →{' '}
                    <b>{qty3.format(upstreamToeExcTotal)}</b> cu.m
                  </div>
                ) : (
                  <div className="settings-note">
                    Excavation only. Attach the approved PCC, masonry, or project-specific
                    rock-filled anchorage code before generating the estimate.
                  </div>
                )}
                {picker === 'ustoe-build' && (
                  <MaterialPicker
                    initialCategory="IRR-DAW"
                    initialSearch="plain concrete works M-15"
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      setToeMaterial('upstreamToe', 'buildMaterial', item)
                      setPicker(null)
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="bund-option-card bund-downstream-card">
            <div className="bund-option-card-heading">
              <div>
                <div className="gw-panel-label">Downstream slope protection & toe drainage</div>
                <small>
                  Land-side protection collected in one place: the berms that break the face,
                  turfing on what is left of it, a stability rock toe, and the
                  seepage-collection toe drain.
                </small>
              </div>
              <span className="bund-option-kicker">DOWNSTREAM</span>
            </div>

            {!isZonedBund(data) && <div className="bund-drainage-designer">
              <div className="bund-drainage-head">
                <div>
                  <div className="gw-panel-label">Phreatic line — reference + actual</div>
                  <small>
                    Both derivations are overlaid at the same governing chainage. Reference =
                    plain bund; actual = {activePhreaticCombination}.
                  </small>
                </div>
                {drainageSection && (
                  <span className="bund-option-kicker">
                    Ch {formatChainage(drainageSection.chainage, data.chainageUnit)}
                  </span>
                )}
              </div>
              <BundDrainageDiagram
                data={data}
                section={drainageSection}
                referenceData={baselinePhreaticData}
                referenceSection={drainageSection}
              />
              <label className="bund-check bund-phreatic-print">
                <input
                  type="checkbox"
                  checked={data.includePhreaticInPrint}
                  onChange={(e) => update({ includePhreaticInPrint: e.target.checked })}
                />
                Include in print
              </label>
              <small className="bund-phreatic-print-note">
                Prints this optional seepage check after the compulsory Bund Diagram. It
                shows only the bund, filters and rock toe.
              </small>
            </div>}

            <div className="bund-option-pair bund-drainage-berm-pair">
            {chuteDrainCard}
            <div
              className={`bund-option-module bund-berm-card${
                data.design.berms.length ? ' is-enabled' : ''
              }`}
            >
              <div className="bund-berm-block-head">
                <div>
                  <span className="bund-option-module-title">Berms</span>
                  <small>Horizontal shelves on either bund face.</small>
                </div>
                <span className="bund-option-kicker">
                  {data.design.berms.length || 'NONE'}
                </span>
              </div>

              <div className="bund-berm-guidance">
                <div className="bund-berm-actions">
                  <button type="button" className="btn ghost" onClick={() => addBerm('ds')}>
                    <Plus size={13} /> Add D/S
                  </button>
                  <button type="button" className="btn ghost" onClick={() => addBerm('us')}>
                    <Plus size={13} /> Add U/S
                  </button>
                  {data.design.berms.length > 1 && (
                    <button type="button" className="btn ghost" onClick={sortBermsByLevel}>
                      Sort by RL
                    </button>
                  )}
                </div>
              </div>

              {data.design.berms.length > 0 && (
                <div className="bund-berm-list">
                  {/* Deliberately NOT sorted on every render: the RL field is
                      typed digit by digit, and re-ordering the list mid-entry
                      slides the row out from under the cursor. Order is the
                      order they were added, and Sort by RL is explicit. */}
                  {data.design.berms.map((berm, bermIndex) => {
                      const faceSlopeValue =
                        berm.side === 'us' ? data.design.usSlope : data.design.dsSlope
                      const coverage = bermSectionCoverage(data, berm)
                      const presentLength = bermPresentLength(data, berm)
                      const shelfArea = rowsTotal(bermShelfRows(data, berm))
                      const surfacing = bermSurfaceMeasurement(data, berm)
                      const drain = bermDrainProtectionMeasurement(data, berm)
                      const drainExcavation = rowsTotal(bermDrainExcavationRows(data, berm))
                      const issues = bermIssues(data, berm)
                      return (
                        <div className="bund-option-module bund-berm-row" key={berm.id}>
                          <div className="bund-berm-row-head">
                            {/* A fixed number, so the row keeps an identity of
                                its own while its RL is being typed. */}
                            <span className="bund-berm-index">#{bermIndex + 1}</span>
                            <span className="bund-option-module-title">{bermLabel(berm)}</span>
                            <small>
                              {qty3.format(presentLength)} m of bund · {coverage.present}/
                              {coverage.total} sections · shelf {qty3.format(shelfArea)} sq.m
                            </small>
                            <button
                              className="panel-iconbtn"
                              title="Remove this berm"
                              onClick={() => removeBerm(berm.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="bund-berm-row-body">
                            <BundBermDiagram data={data} berm={berm} />
                            <div className="bund-berm-controls">
                              <div className="gw-param-grid">
                                <label className="field">
                                  <span className="field-label">Face</span>
                                  <select
                                    className="text-input"
                                    value={berm.side}
                                    onChange={(e) =>
                                      patchBerm(berm.id, {
                                        side: e.target.value as BundBermSide
                                      })
                                    }
                                  >
                                    <option value="ds">Downstream</option>
                                    <option value="us">Upstream</option>
                                  </select>
                                </label>
                                <NumField
                                  label="Shelf RL"
                                  value={berm.level}
                                  onChange={(v) => patchBerm(berm.id, { level: v })}
                                />
                                <NumField
                                  label="Shelf width (m)"
                                  value={berm.width}
                                  onChange={(v) => patchBerm(berm.id, { width: v })}
                                />
                                <NullSlopeField
                                  label={`Slope below (blank = ${qty3.format(faceSlopeValue)} : 1)`}
                                  value={berm.slopeBelow}
                                  onChange={(v) => patchBerm(berm.id, { slopeBelow: v })}
                                />
                                <NumField
                                  label="Cross-fall (1 in …)"
                                  value={berm.crossFall}
                                  onChange={(v) => patchBerm(berm.id, { crossFall: v })}
                                />
                              </div>

                              {berm.side === 'us' &&
                                (data.design.ftl != null || data.design.mwl != null) && (
                                  <div className="bund-berm-presets">
                                    <span>Set RL to</span>
                                    {data.design.ftl != null && (
                                      <button
                                        className="btn ghost"
                                        onClick={() =>
                                          patchBerm(berm.id, { level: data.design.ftl as number })
                                        }
                                      >
                                        FTL {qty3.format(data.design.ftl)}
                                      </button>
                                    )}
                                    {data.design.mwl != null && (
                                      <button
                                        className="btn ghost"
                                        onClick={() =>
                                          patchBerm(berm.id, { level: data.design.mwl as number })
                                        }
                                      >
                                        MWL {qty3.format(data.design.mwl)}
                                      </button>
                                    )}
                                  </div>
                                )}

                              {issues.map((issue, index) => (
                                <div
                                  key={`${berm.id}-issue-${index}`}
                                  className={`settings-note bund-berm-issue is-${issue.level}`}
                                >
                                  {issue.message}
                                </div>
                              ))}

                              <div
                                className={`bund-option-module${
                                  berm.surfaceMaterial ? ' is-enabled' : ''
                                }`}
                              >
                                <label className="bund-optional-head">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(berm.surfaceMaterial)}
                                    onChange={() => {
                                      if (berm.surfaceMaterial) {
                                        patchBerm(berm.id, { surfaceMaterial: null })
                                        if (
                                          bermPicker?.bermId === berm.id &&
                                          bermPicker.field === 'surfaceMaterial'
                                        ) {
                                          setBermPicker(null)
                                        }
                                      } else {
                                        setBermSurface(berm.id, 'stone')
                                      }
                                    }}
                                  />
                                  <span className="bund-option-module-title">
                                    Surface this shelf (optional)
                                  </span>
                                </label>
                                {berm.surfaceMaterial && (
                                  <>
                                    <div className="bund-inline-measure bund-berm-selected-code">
                                      <span>Selected SSR code</span>
                                      <SsrCode
                                        code={berm.surfaceMaterial.code}
                                        description={berm.surfaceMaterial.description}
                                        className="gw-material-code"
                                      />
                                      <span>
                                        {qty3.format(surfacing.quantity)}{' '}
                                        {surfacing.measure === 'volume' ? 'cu.m' : 'sq.m'}
                                      </span>
                                    </div>
                                    <div className="bund-berm-presets">
                                      <span>Choose finish</span>
                                      <button
                                        type="button"
                                        className={`btn ghost${
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_TURF_CODE
                                            ? ' active'
                                            : ''
                                        }`}
                                        aria-pressed={
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_TURF_CODE
                                        }
                                        onClick={() => setBermSurface(berm.id, 'turf')}
                                      >
                                        Stone revetment
                                      </button>
                                      <button
                                        type="button"
                                        className={`btn ghost${
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_TURF_CODE
                                            ? ' active'
                                            : ''
                                        }`}
                                        aria-pressed={
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_TURF_CODE
                                        }
                                        onClick={() => setBermSurface(berm.id, 'turf')}
                                      >
                                        Turfing
                                      </button>
                                      <button
                                        type="button"
                                        className={`btn ghost${
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_CC_CODE
                                            ? ' active'
                                            : ''
                                        }`}
                                        aria-pressed={
                                          berm.surfaceMaterial.code === BUND_DEFAULT_BERM_CC_CODE
                                        }
                                        onClick={() => setBermSurface(berm.id, 'cc')}
                                      >
                                        CC protection
                                      </button>
                                      <button
                                        type="button"
                                        className="btn ghost"
                                        onClick={() =>
                                          setBermPicker({
                                            bermId: berm.id,
                                            field: 'surfaceMaterial'
                                          })
                                        }
                                      >
                                        <Pencil size={12} /> Choose another SSR code
                                      </button>
                                    </div>
                                    {bermPicker?.bermId === berm.id &&
                                      bermPicker.field === 'surfaceMaterial' && (
                                        <div className="bund-berm-picker">
                                          <MaterialPicker
                                            initialCategory="IRR-CAW"
                                            selectionHint="Select a code row below. If that code has DATA options, choose the applicable option and then press Apply code."
                                            onClose={() => setBermPicker(null)}
                                            onPick={(item) => {
                                              setBermMaterial(berm.id, 'surfaceMaterial', item)
                                              setBermPicker(null)
                                            }}
                                          />
                                        </div>
                                      )}
                                    {surfacing.measure === 'volume' && (
                                      <div className="gw-param-grid">
                                        <NumField
                                          label="Layer thickness (m)"
                                          value={berm.surfaceThickness}
                                          onChange={(v) =>
                                            patchBerm(berm.id, { surfaceThickness: v })
                                          }
                                        />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>

                              <div
                                className={`bund-option-module${
                                  berm.drainLiningMaterial ? ' is-enabled' : ''
                                }`}
                              >
                                <label className="bund-optional-head">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(berm.drainLiningMaterial)}
                                    onChange={() => {
                                      if (berm.drainLiningMaterial) {
                                        patchBerm(berm.id, {
                                            drainLiningMaterial: null,
                                            drainExcavationMaterial: null
                                          })
                                        if (
                                          bermPicker?.bermId === berm.id &&
                                          bermPicker.field === 'drainLiningMaterial'
                                        ) {
                                          setBermPicker(null)
                                        }
                                      } else {
                                        enableBermDrain(berm.id)
                                      }
                                    }}
                                  />
                                  <span className="bund-option-module-title">
                                    Catch-water drain on the shelf
                                  </span>
                                </label>
                                {berm.drainLiningMaterial && (
                                  <>
                                    <div className="gw-param-grid">
                                      <NumField
                                        label="Channel width (m)"
                                        value={berm.drainWidth}
                                        onChange={(v) => patchBerm(berm.id, { drainWidth: v })}
                                      />
                                      <NumField
                                        label="Channel depth (m)"
                                        value={berm.drainDepth}
                                        onChange={(v) => patchBerm(berm.id, { drainDepth: v })}
                                      />
                                      {drain.measure === 'volume' && (
                                        <NumField
                                          label="Lining thickness (m)"
                                          value={berm.drainLiningThickness}
                                          onChange={(v) =>
                                            patchBerm(berm.id, { drainLiningThickness: v })
                                          }
                                        />
                                      )}
                                    </div>
                                    <div className="bund-berm-presets">
                                      <span>Protection</span>
                                      <button
                                        type="button"
                                        className={`btn ghost${
                                          berm.drainLiningMaterial.code ===
                                          BUND_DEFAULT_BERM_DRAIN_LINING_CODE
                                            ? ' active'
                                            : ''
                                        }`}
                                        onClick={() =>
                                          attachBerm(
                                            berm.id,
                                            'drainLiningMaterial',
                                            BUND_DEFAULT_BERM_DRAIN_LINING_CODE,
                                            { drainLiningThickness: 0.1 }
                                          )
                                        }
                                      >
                                        M15 CC lining
                                      </button>
                                      <button
                                        type="button"
                                        className={`btn ghost${
                                          berm.drainLiningMaterial.code ===
                                          BUND_DEFAULT_BERM_DRAIN_STONE_CODE
                                            ? ' active'
                                            : ''
                                        }`}
                                        onClick={() =>
                                          attachBerm(
                                            berm.id,
                                            'drainLiningMaterial',
                                            BUND_DEFAULT_BERM_DRAIN_STONE_CODE
                                          )
                                        }
                                      >
                                        Dry rubble pitching
                                      </button>
                                      <button
                                        type="button"
                                        className="btn ghost"
                                        onClick={() =>
                                          setBermPicker({
                                            bermId: berm.id,
                                            field: 'drainLiningMaterial'
                                          })
                                        }
                                      >
                                        <Pencil size={12} /> Choose another SSR code
                                      </button>
                                    </div>
                                    {bermPicker?.bermId === berm.id &&
                                      bermPicker.field === 'drainLiningMaterial' && (
                                        <div className="bund-berm-picker">
                                          <MaterialPicker
                                            initialCategory="IRR-CAW"
                                            selectionHint="Select the approved drain-protection code. If DATA options appear, choose one and press Apply code."
                                            onClose={() => setBermPicker(null)}
                                            onPick={(item) => {
                                              setBermMaterial(
                                                berm.id,
                                                'drainLiningMaterial',
                                                item
                                              )
                                              setBermPicker(null)
                                            }}
                                          />
                                        </div>
                                      )}
                                    <div className="bund-inline-measure">
                                      <SsrCode
                                        code={berm.drainLiningMaterial.code}
                                        description={berm.drainLiningMaterial.description}
                                        className="gw-material-code"
                                      />
                                      <span>
                                        {qty3.format(drain.quantity)}{' '}
                                        {drain.measure === 'volume' ? 'cu.m' : 'sq.m'}
                                      </span>
                                      <span>Excavation {qty3.format(drainExcavation)} cu.m</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>
                      )
                    })}
                </div>
              )}

              {data.design.berms.some((berm) => berm.drainExcavationMaterial) &&
                renderExcavationClassCard(excavationSource('berm-drain-exc'))}
            </div>
            </div>

            <div
              className={`bund-downstream-turf${data.turfingMaterial ? ' is-enabled' : ''}`}
            >
              <label className="bund-optional-head">
                <input
                  type="checkbox"
                  checked={Boolean(data.turfingMaterial)}
                  onChange={() =>
                    data.turfingMaterial
                      ? update({ turfingMaterial: null })
                      : enableOptional(
                          'turfing',
                          'turfingMaterial',
                          BUND_DEFAULT_TURFING_CODE
                        )
                  }
                />
                <span className="bund-option-module-title">Turfing on downstream face</span>
              </label>
              <small>
                Grass sods over the exposed developed land-side slope. Any lower slope occupied
                by the enabled rock toe is deducted automatically.
              </small>
              {data.turfingMaterial && (
                <>
                  <div className="bund-inline-measure">
                    <SsrCode
                      code={data.turfingMaterial.code}
                      description={data.turfingMaterial.description}
                      className="gw-material-code"
                    />
                    <span>{qty3.format(turfingTotal)} sq.m</span>
                    <button className="btn ghost" onClick={() => setPicker('turfing')}>
                      <Pencil size={12} /> Change code
                    </button>
                  </div>
                  {picker === 'turfing' && (
                    <MaterialPicker
                      initialCategory="IRR-DAW"
                      initialSearch="turfing"
                      onClose={() => setPicker(null)}
                      onPick={(item) => {
                        setBundMaterial(node.id, 'turfing', item)
                        setPicker(null)
                      }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="bund-downstream-modules">
              <div
                className={`bund-option-module${data.rockToeMaterial ? ' is-enabled' : ''}`}
              >
                <label className="bund-optional-head">
                  <input
                    type="checkbox"
                    checked={Boolean(data.rockToeMaterial)}
                    onChange={() =>
                      data.rockToeMaterial
                        ? update({
                            rockToeMaterial: null,
                            rockToeFilterMaterial: null,
                            rockToeExcavationMaterial: null
                          })
                        : enableRockToe()
                    }
                  />
                  <span className="bund-option-module-title">Rock toe</span>
                </label>
                <small>
                  Rubble zone integrated into the lower downstream face for stability and free
                  drainage. It always sits at the downstream toe — a berm moves that toe
                  outward, and the rock toe follows it there.
                </small>
                {rockToeShelf && (
                  <div className="settings-note bund-berm-issue is-warning">
                    The lowest downstream shelf is at RL {qty3.format(rockToeShelf.level)}, so
                    the rock toe is limited to the{' '}
                    {qty3.format(rockToeCapHeight ?? 0)} m of face beneath it — it cannot rise
                    through the berm.
                    {rockToeCapped
                      ? ' It is at that limit now: to catch the seepage line higher, lower the shelf or widen the rock toe crest instead of raising it.'
                      : ''}
                  </div>
                )}
                {data.rockToeMaterial && (
                  <div className="gw-param-grid">
                    <NumField
                      label="Crest width (m)"
                      value={data.rockToeTopWidth}
                      onChange={(v) => update({ rockToeTopWidth: v })}
                    />
                    <NumField
                      label="Height (m)"
                      value={data.rockToeHeight}
                      onChange={(v) => update({ rockToeHeight: v })}
                    />
                    <SlopeField
                      label="Inner slope"
                      value={data.rockToeInnerSlope}
                      onChange={(v) => update({ rockToeInnerSlope: v })}
                    />
                  </div>
                )}
                <BundRockToeDiagram
                  topWidth={data.rockToeTopWidth}
                  innerSlope={data.rockToeInnerSlope}
                  outerSlope={rockToeFaceSlope}
                  height={rockToeDiagramHeight}
                  excavationDepth={
                    rockToeExcavation && data.rockToeExcavationMaterial
                      ? rockToeExcavationDepth
                      : 0
                  }
                  filterEnabled={Boolean(data.rockToeFilterMaterial)}
                />
                {data.rockToeMaterial && (
                  <>
                    <div className="bund-inline-measure">
                      <SsrCode
                        code={data.rockToeMaterial.code}
                        description={data.rockToeMaterial.description}
                        className="gw-material-code"
                      />
                      <span>{qty3.format(rockToeTotal)} cu.m</span>
                      <button className="btn ghost" onClick={() => setPicker('rocktoe')}>
                        <Pencil size={12} /> code
                      </button>
                    </div>
                    {picker === 'rocktoe' && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="rock-toe"
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          setBundMaterial(node.id, 'rocktoe', item)
                          setPicker(null)
                        }}
                        />
                    )}
                    <label className="bund-check">
                      <input
                        type="checkbox"
                        checked={Boolean(data.rockToeFilterMaterial)}
                        onChange={() =>
                          data.rockToeFilterMaterial
                            ? update({ rockToeFilterMaterial: null })
                            : enableRockToeFilter()
                        }
                      />
                      Include graded filter below and behind the rock toe
                    </label>
                    {data.rockToeFilterMaterial && (
                      <>
                        <div className="bund-inline-measure">
                          <SsrCode
                            code={data.rockToeFilterMaterial.code}
                            description={data.rockToeFilterMaterial.description}
                            className="gw-material-code"
                          />
                          <span>{qty3.format(rockToeFilterTotal)} cu.m</span>
                          <button
                            className="btn ghost"
                            onClick={() => setPicker('rocktoe-filter')}
                          >
                            <Pencil size={12} /> filter code
                          </button>
                        </div>
                        <div className="settings-note">
                          DAW-6-4 default: 20 cm sand + 25 cm 20–4.75 mm aggregate +
                          40 cm 80–20 mm aggregate, totaling 0.85 m below and behind.
                          Selecting CAW-5-11 manually changes the geometry to 1.00 m below
                          and 0.50 m behind.
                          {rockToeExcavation
                            ? ' Its bottom RL is compared with the prepared bund surface to derive the section-specific excavation union.'
                            : ' It is laid inside the formation as the bund goes up, so only the filter media are measured here.'}
                        </div>
                        {picker === 'rocktoe-filter' && (
                          <MaterialPicker
                            initialCategory="IRR-DAW"
                            initialSearch="filter below behind rock toe"
                            onClose={() => setPicker(null)}
                            onPick={(item) => {
                              setBundMaterial(node.id, 'rocktoe-filter', item)
                              setPicker(null)
                            }}
                          />
                        )}
                      </>
                    )}
                    {rockToeExcavation ? (
                      <label className="bund-check">
                        <input
                          type="checkbox"
                          checked={Boolean(data.rockToeExcavationMaterial)}
                          onChange={() =>
                            data.rockToeExcavationMaterial
                              ? update({
                                  rockToeExcavationMaterial: null,
                                  // The selected below-filter occupies this cut,
                                  // so it cannot remain when excavation is off.
                                  rockToeFilterMaterial: null
                                })
                              : enableRockToeExcavation()
                          }
                        />
                        Include rock-toe foundation excavation (section union)
                      </label>
                    ) : (
                      <div className="settings-note">
                        No separate rock-toe excavation is measured on a new bund: the toe is
                        built up with the embankment on ground the foundation excavation above
                        has already taken out, so a second cut here would bill the same soil
                        twice.
                      </div>
                    )}
                    {rockToeExcavation && data.rockToeExcavationMaterial && (
                      <>
                        {!data.rockToeFilterMaterial && (
                          <div className="gw-param-grid">
                            <NumField
                              label="Excavation depth (m)"
                              value={data.rockToeExcavationDepth}
                              onChange={(v) => update({ rockToeExcavationDepth: v })}
                            />
                          </div>
                        )}
                        <div className="bund-inline-measure">
                          <b>Excavation geometry</b>
                          <span>
                            {qty3.format(rockToeExcavationTotal)} cu.m
                          </span>
                        </div>
                        <div className="settings-note">
                          This is one geometric union, not base width × a fixed excavation
                          depth. The part of the general bund strip/cut lying under the rock toe
                          is transferred to this code; only the deeper bed cut is added.
                          {governingRockToeExcavation
                            ? ` At the governing section: ${qty3.format(
                                governingRockToeExcavation.levelingOverlapArea
                              )} m² transferred from general leveling + ${qty3.format(
                                governingRockToeExcavation.additionalArea
                              )} m² additional bed cut = ${qty3.format(
                                governingRockToeExcavation.unionArea
                              )} m² payable union. Rock-toe base RL ${qty3.format(
                                governingRockToeExcavation.baseRl
                              )}; bed bottom RL ${qty3.format(
                                governingRockToeExcavation.bottomRl
                              )}.`
                            : ''}
                          {data.rockToeFilterMaterial
                            ? ' The selected code controls the below/behind filter thicknesses. The union includes the below-filter bed and any behind-filter cap that cuts existing ground, but the additional excavation still varies with the section’s already-prepared level. Turning excavation off also turns that dependent filter off.'
                            : ''}
                        </div>
                        {renderExcavationClassCard(excavationSource('rocktoe-exc'))}
                      </>
                    )}
                    {rockToeCapHeight != null &&
                      data.rockToeHeight > rockToeCapHeight + 1e-6 && (
                        <div className="settings-note bund-berm-issue is-warning">
                          The entered {qty3.format(data.rockToeHeight)} m does not fit: only{' '}
                          {qty3.format(rockToeCapHeight)} m of face is available above the toe
                          {rockToeShelf
                            ? `, up to the shelf at RL ${qty3.format(rockToeShelf.level)}`
                            : ', up to the crest'}
                          . It is measured at {qty3.format(rockToeCapHeight)} m.
                        </div>
                      )}
                    <div className="settings-note">
                      The exposed outer face is automatically locked to the face the toe lands
                      on (1:{qty3.format(rockToeFaceSlope)}
                      {Math.abs(rockToeFaceSlope - data.design.dsSlope) > 1e-6
                        ? ` — the slope handed down below the lowest shelf, not the ${qty3.format(
                            data.design.dsSlope
                          )} above it`
                        : ''}
                      ), so the rock toe and proposed bund line remain aligned.
                      {data.rockToeFilterMaterial
                        ? ' The thickness shown below the toe is filter construction thickness, not a fixed payable excavation depth.'
                        : ''}
                    </div>
                    <div className="settings-note">
                      Set the height from the approved section. The seepage diagram above shows
                      whether this toe catches the phreatic line — raise it, widen its crest, or
                      add a filter until it does.
                    </div>
                  </>
                )}
              </div>

              {internalFiltersAvailable(data) && (
              <div
                className={`bund-option-module${data.horizontalFilterMaterial ? ' is-enabled' : ''}`}
              >
                <label className="bund-optional-head">
                  <input
                    type="checkbox"
                    checked={Boolean(data.horizontalFilterMaterial)}
                    onChange={() =>
                      data.horizontalFilterMaterial
                        ? update({
                            horizontalFilterMaterial: null,
                            verticalFilterMaterial: null
                          })
                        : enableHorizontalFilter()
                    }
                  />
                  <span className="bund-option-module-title">Horizontal filter</span>
                </label>
                <small>
                  Sand/gravel blanket laid below toe RL (under new fill only — a repair cannot
                  reach beneath the existing bund). Auto length runs from the d/s toe—or the
                  rock toe&rsquo;s inner face—to the centreline in a homogeneous bund, and only to
                  the downstream edge of hearting in a zoned bund. A chimney stands on its
                  inner end to intercept seepage.
                </small>
                {data.horizontalFilterMaterial && (
                  <>
                    <div className="gw-param-grid">
                      <label className="field">
                        <span className="field-label">Length calculation</span>
                        <select
                          className="text-input"
                          value={data.horizontalFilterLengthMode}
                          onChange={(event) => {
                            const mode = event.target.value as 'auto' | 'manual'
                            update({
                              horizontalFilterLengthMode: mode,
                              horizontalFilterLength:
                                mode === 'manual'
                                  ? filterDiagramLength
                                  : data.horizontalFilterLength
                            })
                          }}
                        >
                          <option value="auto">Auto — from bund geometry</option>
                          <option value="manual">Manual entry</option>
                        </select>
                      </label>
                      <NullField
                        label={
                          data.rockToeMaterial
                            ? 'Length inward from rock-toe inner face (m)'
                            : 'Length inward from d/s toe (m)'
                        }
                        value={filterDiagramLength}
                        disabled={data.horizontalFilterLengthMode === 'auto'}
                        onChange={(v) =>
                          update({
                            horizontalFilterLengthMode: 'manual',
                            horizontalFilterLength: Math.max(0, v ?? 0)
                          })
                        }
                      />
                      {hFilterDimensionFixed ? (
                        <NullField
                          label="Code-fixed thickness (m)"
                          value={effectiveHFilterThickness}
                          disabled
                          onChange={() => undefined}
                        />
                      ) : (
                        <NumField
                          label="Design thickness (m)"
                          value={data.horizontalFilterThickness}
                          onChange={(v) => update({ horizontalFilterThickness: v })}
                        />
                      )}
                    </div>
                    <BundFilterDiagram
                      crestWidth={data.design.topWidth}
                      usSlope={data.design.usSlope}
                      dsSlope={data.design.dsSlope}
                      height={filterDiagramHeight}
                      blanketLength={filterDiagramLength}
                      blanketThickness={effectiveHFilterThickness}
                      chimneyOn={Boolean(data.verticalFilterMaterial)}
                      chimneyWidth={effectiveVFilterWidth}
                      chimneyHeight={filterDiagramChimneyHeight}
                      mwlRise={filterDiagramMwlRise}
                      rockToeOn={Boolean(data.rockToeMaterial)}
                      rockToeFilterOn={Boolean(data.rockToeFilterMaterial)}
                      rockToeTopWidth={data.rockToeTopWidth}
                      rockToeHeight={rockToeDiagramHeight}
                      rockToeInnerSlope={data.rockToeInnerSlope}
                      rockToeOuterSlope={rockToeFaceSlope}
                    />
                    {drainageSection && (
                      <div className="settings-note">
                        Drawn at Ch{' '}
                        {formatChainage(drainageSection.chainage, data.chainageUnit)} — the
                        section that governs the seepage check above.
                      </div>
                    )}
                    <div className="bund-inline-measure">
                      <SsrCode
                        code={data.horizontalFilterMaterial.code}
                        description={data.horizontalFilterMaterial.description}
                        className="gw-material-code"
                      />
                      <span>
                        {qty3.format(hFilterTotal)} {hFilterMeasure === 'area' ? 'sq.m' : 'cu.m'}
                      </span>
                      <button className="btn ghost" onClick={() => setPicker('hfilter')}>
                        <Pencil size={12} /> code
                      </button>
                    </div>
                    {picker === 'hfilter' && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="filter"
                        categoryLocked
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          setBundMaterial(node.id, 'hfilter', item)
                          setPicker(null)
                        }}
                      />
                    )}
                    <div className="settings-note">
                      DAW choices: 6-2 longitudinal/cross graded drains; 6-3 1.40 m
                      vertical or inclined graded filter; 6-4 and 6-5 rock-toe filters;
                      6-6 the 400 mm fabric-and-aggregate horizontal, vertical or inclined
                      blanket; 6-7 sand below revetment; 6-8 the 450 mm sand chimney; and
                      6-9 the 900 mm transition/filter behind rockfill. Select “code” to choose
                      one; this picker is restricted to DAW.
                    </div>

                    <label className="bund-check">
                      <input
                        type="checkbox"
                        checked={Boolean(data.verticalFilterMaterial)}
                        onChange={() =>
                          data.verticalFilterMaterial
                            ? update({ verticalFilterMaterial: null })
                            : enableVerticalFilter()
                        }
                      />
                      Add a vertical (chimney) filter on the blanket
                    </label>
                    {data.verticalFilterMaterial && (
                      <>
                        <small>
                          A sand wall standing on the blanket at its inner end — the two are
                          always connected. It intercepts the seepage and drops it onto the
                          blanket, which carries it out to the toe; set the blanket length to
                          position the chimney deeper inside the bund.
                        </small>
                        <div className="gw-param-grid">
                          {vFilterDimensionFixed ? (
                            <NullField
                              label="Code-fixed width (m)"
                              value={effectiveVFilterWidth}
                              disabled
                              onChange={() => undefined}
                            />
                          ) : (
                            <NumField
                              label="Design width (m)"
                              value={data.verticalFilterWidth}
                              onChange={(v) => update({ verticalFilterWidth: v })}
                            />
                          )}
                          <NumField
                            label="Height (m, 0 = auto to MWL)"
                            value={data.verticalFilterHeight}
                            onChange={(v) => update({ verticalFilterHeight: v })}
                          />
                        </div>
                        <div className="bund-inline-measure">
                          <SsrCode
                            code={data.verticalFilterMaterial.code}
                            description={data.verticalFilterMaterial.description}
                            className="gw-material-code"
                          />
                          <span>
                            {drainageSection
                              ? `h ${qty3.format(verticalFilterHeightAt(drainageSection, data))} m · `
                              : ''}
                            {qty3.format(vFilterTotal)}{' '}
                            {vFilterMeasure === 'area' ? 'sq.m' : 'cu.m'}
                          </span>
                          <button className="btn ghost" onClick={() => setPicker('vfilter')}>
                            <Pencil size={12} /> code
                          </button>
                        </div>
                        {picker === 'vfilter' && (
                          <MaterialPicker
                            initialCategory="IRR-DAW"
                            initialSearch="filter"
                            categoryLocked
                            onClose={() => setPicker(null)}
                            onPick={(item) => {
                              setBundMaterial(node.id, 'vfilter', item)
                              setPicker(null)
                            }}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              )}

              {renderToeModule(
                'downstreamToe',
                'Toe drain',
                'Seepage-collection trench at the d/s toe, with optional rubble revetment or CC lining.',
                'dstoe-build'
              )}
            </div>
          </div>

        </div>
      </section>

      {data.clearanceMaterial && data.clearanceMode === 'perimeter' && (
        <QuantityTable
          title={`Computed — ${data.clearanceMaterial.code} (jungle clearance)`}
          rows={clearancePerimeterRows(data)}
          data={data}
          startLabel={data.mode === 'new' ? 'Width at stripped level A (m)' : 'Perimeter at A (m)'}
          endLabel={data.mode === 'new' ? 'Width at stripped level B (m)' : 'Perimeter at B (m)'}
          areaLabel={data.mode === 'new' ? 'Avg width at stripped level (m)' : 'Avg perimeter (m)'}
          qtyLabel="Area (sq.m)"
        />
      )}
      <QuantityTable
        title={
          data.mode === 'new'
            ? 'Computed — Bund Foundation Excavation (pay quantity before soil classification)'
            : 'Computed — Bund Stripping (pay quantity before soil classification)'
        }
        rows={stripRows}
        data={data}
        areaLabel="Mean area (sq.m)"
        qtyLabel="Volume (cu.m)"
        note="Each cross-section is measured from the U/S toe-wall limit to the D/S toe-drain limit. If rock-toe excavation is enabled, its overlapping cut is removed here and billed once in the rock-toe union."
      />
      {excavationSources.filter((source) => source.enabled).map((source) => {
        const bands = data.excavationBands?.[source.role] ?? []
        const totalPct = bands.reduce((sum, band) => sum + (band.pct || 0), 0)
        return (
        <section className="gw-panel" key={`excavation-summary-${source.role}`}>
          <div className="gw-panel-heading">
            Computed — {source.title} excavation classification
          </div>
          <table className="gw-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>SSR code</th>
                <th>Share (%)</th>
                <th>Source excavation (cu.m)</th>
                <th>Pay quantity (cu.m)</th>
              </tr>
            </thead>
            <tbody>
              {bands
                .filter((band) => band.pct > 0 && band.material.code)
                .map((band) => (
                  <tr key={band.id}>
                    <td>{band.label}</td>
                    <td>{band.material.code}</td>
                    <td>{qty3.format(band.pct)}</td>
                    <td>{qty3.format(source.quantity)}</td>
                    <td>{qty3.format((source.quantity * band.pct) / 100)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {Math.abs(totalPct - 100) > 0.01 && (
            <div className="settings-note">
              The split totals {qty3.format(totalPct)}%; adjust it to 100% before finalising
              the estimate.
            </div>
          )}
        </section>
        )
      })}
      {earthworkCode && (
        zonedRepair ? (
          <>
            <QuantityTable
              title={`Computed - ${
                formationEnabled
                  ? data.formationMaterial.code
                  : data.rollingMaterial.code
              } (zoned casing)`}
              rows={casingFormRows}
              data={data}
              areaLabel="Mean casing area (sq.m)"
              qtyLabel="Casing volume (cu.m)"
              note="Casing is the total outer embankment fill after deducting the automatically bounded hearting zone at the same chainages."
            />
            <QuantityTable
              title={`Computed - ${
                formationEnabled
                  ? data.heartingMaterial.code
                  : data.heartingRollingMaterial.code
              } (zoned hearting)`}
              rows={heartingFormRows}
              data={data}
              areaLabel="Mean hearting area (sq.m)"
              qtyLabel="Hearting volume (cu.m)"
              note={
                data.mode === 'restoration'
                  ? 'Each hearting side stops where it first intersects the surveyed Existing RL; no start/end markers or separate repair foundation RL are used.'
                  : 'The full hearting zone extends automatically to the new bund formation base.'
              }
            />
          </>
        ) : (
          <QuantityTable
            title={
              combinedEarthwork
                ? `Computed — ${BUND_DEFAULT_FORMATION_CODE} (homogeneous embankment: formation + compaction)`
                : formationEnabled
                  ? `Computed — ${BUND_SPLIT_FORMATION_CODE} (homogeneous embankment: formation only)`
                  : `Computed — ${BUND_SPLIT_ROLLING_CODE} (homogeneous embankment: compaction only)`
            }
            rows={formRows}
            data={data}
            areaLabel="Mean area (sq.m)"
            qtyLabel="Volume (cu.m)"
            note={
              compactionEnabled && !formationEnabled
                ? 'Compaction-only billing assumes the soil is already placed and its formation is paid elsewhere or was completed earlier. The measured volume includes the level U/S toe-wall and D/S toe-drain platforms.'
                : 'The embankment volume includes the level U/S toe-wall and D/S toe-drain platforms. Their actual trenches are separate post-leveling excavations.'
            }
          />
        )
      )}
      {data.turfingMaterial && (
        <QuantityTable
          title={`Computed — ${data.turfingMaterial.code} (turfing, d/s slope)`}
          rows={turfRows}
          data={data}
          startLabel="Slope length at start (m)"
          endLabel="Slope length at end (m)"
          areaLabel="Mean slope length (m)"
          qtyLabel="Area (sq.m)"
          note={
            data.rockToeMaterial
              ? 'Net exposed slope: the lower face covered by the rock toe is deducted independently at every chainage.'
              : undefined
          }
        />
      )}
      {data.pitchingMaterial && (
        <>
          <QuantityTable
            title={`Computed — ${data.pitchingMaterial.code} (revetment, u/s slope)`}
            rows={pitchingDisplayRows}
            data={data}
            startLabel={
              pitchingMeasurement.measure === 'volume'
                ? 'Revetment section at start (sq.m)'
                : 'Slope length at start (m)'
            }
            endLabel={
              pitchingMeasurement.measure === 'volume'
                ? 'Revetment section at end (sq.m)'
                : 'Slope length at end (m)'
            }
            areaLabel={
              pitchingMeasurement.measure === 'volume'
                ? 'Mean revetment section (sq.m)'
                : 'Mean slope length (m)'
            }
            qtyLabel={
              pitchingMeasurement.measure === 'volume'
                ? 'Volume (cu.m)'
                : 'Area (sq.m)'
            }
            note="The upstream anchorage trench starts outside the bund toe, so it does not overlap or reduce the measured upstream slope."
          />
        </>
      )}
      {upstreamToeOn && (
        <>
          <QuantityTable
            title="Computed — u/s revetment toe-trench excavation (gross)"
            rows={upstreamToeRows}
            data={data}
            startLabel="Trench section at start (sq.m)"
            endLabel="Trench section at end (sq.m)"
            areaLabel="Mean trench section (sq.m)"
            qtyLabel="Volume (cu.m)"
          />
          {data.upstreamToe.buildMaterial && (
            <QuantityTable
              title={`Computed — ${data.upstreamToe.buildMaterial.code} (u/s toe anchorage construction)`}
              rows={upstreamToeRows}
              data={data}
              startLabel="Built section at start (sq.m)"
              endLabel="Built section at end (sq.m)"
              areaLabel="Mean built section (sq.m)"
              qtyLabel="Volume (cu.m)"
            />
          )}
        </>
      )}
      {data.downstreamToe.excavationMaterial && (
        <>
          <QuantityTable
            title="Computed — d/s toe-drain excavation (gross)"
            rows={downstreamToeRows}
            data={data}
            startLabel="Trench section at start (sq.m)"
            endLabel="Trench section at end (sq.m)"
            areaLabel="Mean trench section (sq.m)"
            qtyLabel="Volume (cu.m)"
          />
          {data.downstreamToe.buildMaterial && (
            <QuantityTable
              title={`Computed — ${data.downstreamToe.buildMaterial.code} (d/s toe-drain protection)`}
              rows={downstreamToeBuildDisplayRows}
              data={data}
              startLabel={
                downstreamToeBuild.measure === 'volume'
                  ? 'Lining section at start (sq.m)'
                  : 'Protected width at start (m)'
              }
              endLabel={
                downstreamToeBuild.measure === 'volume'
                  ? 'Lining section at end (sq.m)'
                  : 'Protected width at end (m)'
              }
              areaLabel={
                downstreamToeBuild.measure === 'volume'
                  ? 'Mean lining section (sq.m)'
                  : 'Mean protected width (m)'
              }
              qtyLabel={
                downstreamToeBuild.measure === 'volume'
                  ? 'Volume (cu.m)'
                  : 'Area (sq.m)'
              }
            />
          )}
        </>
      )}
      {data.chuteDrainLiningMaterial && (
        <ChuteComputedTables data={data} />
      )}
      {data.design.berms.map((berm) => (
        <BermComputedTables key={`berm-computed-${berm.id}`} data={data} berm={berm} />
      ))}
      {data.rockToeMaterial && (
        <QuantityTable
          title={`Computed — ${data.rockToeMaterial.code} (rock toe, d/s)`}
          rows={rockToeRows(data)}
          data={data}
          areaLabel="Toe section (sq.m)"
          qtyLabel="Volume (cu.m)"
        />
      )}
      {internalFiltersAvailable(data) && data.horizontalFilterMaterial && (
        <QuantityTable
          title={`Computed — ${data.horizontalFilterMaterial.code} (horizontal filter blanket)`}
          rows={horizontalFilterRows(data)}
          data={data}
          startLabel={
            hFilterMeasure === 'area'
              ? 'Blanket width at start (m)'
              : 'Filter section at start (sq.m)'
          }
          endLabel={
            hFilterMeasure === 'area'
              ? 'Blanket width at end (m)'
              : 'Filter section at end (sq.m)'
          }
          areaLabel={
            hFilterMeasure === 'area'
              ? 'Mean blanket width (m)'
              : 'Mean filter section (sq.m)'
          }
          qtyLabel={hFilterMeasure === 'area' ? 'Area (sq.m)' : 'Volume (cu.m)'}
        />
      )}
      {internalFiltersAvailable(data) &&
        data.horizontalFilterMaterial &&
        data.verticalFilterMaterial && (
          <QuantityTable
            title={`Computed — ${data.verticalFilterMaterial.code} (vertical chimney filter)`}
            rows={verticalFilterRows(data)}
            data={data}
            startLabel={
              vFilterMeasure === 'area'
                ? 'Filter height at start (m)'
                : 'Filter section at start (sq.m)'
            }
            endLabel={
              vFilterMeasure === 'area'
                ? 'Filter height at end (m)'
                : 'Filter section at end (sq.m)'
            }
            areaLabel={
              vFilterMeasure === 'area'
                ? 'Mean filter height (m)'
                : 'Mean filter section (sq.m)'
            }
            qtyLabel={vFilterMeasure === 'area' ? 'Area (sq.m)' : 'Volume (cu.m)'}
          />
        )}
      {data.rockToeMaterial && data.rockToeFilterMaterial && (
        <QuantityTable
          title={`Computed — ${data.rockToeFilterMaterial.code} (graded filter below/behind rock toe)`}
          rows={rockToeFilterRows(data)}
          data={data}
          areaLabel="Filter section (sq.m)"
          qtyLabel="Volume (cu.m)"
        />
      )}
      {data.rockToeMaterial &&
        data.rockToeExcavationMaterial &&
        rockToeExcavationDepth > 0 && (
        <QuantityTable
          title="Computed — rock toe foundation excavation (payable union before classification)"
          rows={rockToeExcavationRows(data)}
          data={data}
          startLabel="Union section at start (sq.m)"
          endLabel="Union section at end (sq.m)"
          areaLabel="Mean union section (sq.m)"
          qtyLabel="Volume (cu.m)"
          note={`General leveling overlap is removed from ${
            data.mode === 'new' ? 'foundation excavation' : 'stripping'
          } and included here once; the additional bed cut is then added section by section.`}
          />
        )}
    </div>
  )
}

/** One optional-item card: a description, an enable/disable toggle, its code and
 *  computed quantity, plus an optional extra field (e.g. the rock-toe area). */
function OptionalCard({
  title,
  desc,
  enabled,
  code,
  description,
  unit,
  qtyText,
  onEnable,
  onDisable,
  onChangeCode,
  extra,
  picker,
  horizontal = false,
  showStatus = true
}: {
  title: string
  desc: string
  enabled: boolean
  code?: string
  description?: string
  unit?: string | null
  qtyText: string
  onEnable: () => void
  onDisable: () => void
  onChangeCode?: () => void
  extra?: JSX.Element | null
  picker?: JSX.Element | false
  horizontal?: boolean
  showStatus?: boolean
}): JSX.Element {
  return (
    <div
      className={`bund-option-card${enabled ? ' is-enabled' : ''}${
        horizontal ? ' is-horizontal' : ''
      }`}
    >
      <div className="bund-option-summary">
        <div className="bund-option-intro">
          <label className="bund-optional-head">
            <input type="checkbox" checked={enabled} onChange={enabled ? onDisable : onEnable} />
            <span className="gw-panel-label">{title}</span>
          </label>
          <small>{desc}</small>
        </div>
        {enabled && showStatus && (
          <div className="bund-option-status">
            <div className="bund-option-code">
              <SsrCode
                code={code ?? 'No code'}
                description={description}
                className="gw-material-code"
              />
              <small>
                {unit ? `${unit} · ` : ''}
                {qtyText}
              </small>
            </div>
            {onChangeCode && (
              <button className="btn ghost" onClick={onChangeCode}>
                <Pencil size={13} /> Change code
              </button>
            )}
          </div>
        )}
      </div>
      {enabled && (
        <>
          {extra && <div className="bund-option-details">{extra}</div>}
          {picker}
        </>
      )}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  )
}

function SlopeField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <SlopeFieldCore
      label={label}
      value={value}
      onChange={(next) => {
        if (next != null) onChange(next)
      }}
    />
  )
}

function NullSlopeField({
  label,
  value,
  onChange
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}): JSX.Element {
  return <SlopeFieldCore label={label} value={value} onChange={onChange} allowBlank />
}

function SlopeFieldCore({
  label,
  value,
  onChange,
  allowBlank = false
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  allowBlank?: boolean
}): JSX.Element {
  const ratioText = (next: number | null): [string, string] =>
    next == null ? ['', ''] : [String(next), '1']
  const [horizontal, setHorizontal] = useState(() => ratioText(value)[0])
  const [vertical, setVertical] = useState(() => ratioText(value)[1])
  const wrapper = useRef<HTMLDivElement>(null)
  const editing = useRef(false)
  const committed = useRef(value)
  committed.current = value

  useEffect(() => {
    if (!editing.current) {
      const [nextHorizontal, nextVertical] = ratioText(value)
      setHorizontal(nextHorizontal)
      setVertical(nextVertical)
    }
  }, [value])

  const parseDraft = (nextHorizontal: string, nextVertical: string): number | null => {
    const parsed = parseBundSlope(`${nextHorizontal}:${nextVertical}`)
    return parsed != null && parsed > 0 ? parsed : null
  }

  const commit = (): void => {
    if (allowBlank && horizontal.trim() === '' && vertical.trim() === '') {
      onChange(null)
      return
    }
    const parsed = parseDraft(horizontal, vertical)
    if (parsed != null) {
      onChange(parsed)
    } else {
      const [nextHorizontal, nextVertical] = ratioText(committed.current)
      setHorizontal(nextHorizontal)
      setVertical(nextVertical)
    }
  }

  const change = (
    side: 'horizontal' | 'vertical',
    raw: string
  ): void => {
    const nextHorizontal = side === 'horizontal' ? raw : horizontal
    const nextVertical = side === 'vertical' ? raw : vertical
    if (side === 'horizontal') setHorizontal(raw)
    else setVertical(raw)
    if (allowBlank && nextHorizontal.trim() === '' && nextVertical.trim() === '') {
      onChange(null)
      return
    }
    const parsed = parseDraft(nextHorizontal, nextVertical)
    if (parsed != null) onChange(parsed)
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div
        ref={wrapper}
        className="bund-slope-ratio"
        onFocus={() => {
          editing.current = true
        }}
        onBlur={(event) => {
          if (wrapper.current?.contains(event.relatedTarget as Node | null)) return
          editing.current = false
          commit()
        }}
      >
        <input
          className="text-input"
          type="text"
          inputMode="decimal"
          placeholder="_"
          aria-label={`${label} horizontal run`}
          value={horizontal}
          onChange={(event) => change('horizontal', event.target.value)}
        />
        <b aria-hidden="true">:</b>
        <input
          className="text-input"
          type="text"
          inputMode="decimal"
          placeholder="_"
          aria-label={`${label} vertical rise`}
          value={vertical}
          onChange={(event) => change('vertical', event.target.value)}
        />
      </div>
    </div>
  )
}

/** Like NumField but optional — a blank clears it to null (used for MWL / FTL). */
function NullField({
  label,
  value,
  disabled = false,
  onChange
}: {
  label: string
  value: number | null
  disabled?: boolean
  onChange: (v: number | null) => void
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        type="number"
        step="any"
        placeholder="—"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.trim() === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}

/** Apply a thickness/factor to every section value and quantity in an MSA table. */
function scaleQuantityRows(rows: BundQtyRow[], factor: number): BundQtyRow[] {
  const safeFactor = Math.max(0, Number.isFinite(factor) ? factor : 0)
  return rows.map((row) => ({
    ...row,
    areaFrom: row.areaFrom * safeFactor,
    areaTo: row.areaTo * safeFactor,
    meanArea: row.meanArea * safeFactor,
    qty: row.qty * safeFactor
  }))
}

/** Explicit chute workings; chutes are discrete units, not longitudinal MSA rows. */
function ChuteComputedTables({ data }: { data: BundData }): JSX.Element {
  const rows = chuteDrainRows(data)
  const totalLength = chuteDrainTotalLength(data)
  const excavation = chuteDrainExcavationQuantity(data)
  const protection = chuteDrainProtectionMeasurement(data)
  const wettedPerimeter =
    Math.max(0, data.chuteDrainWidth || 0) +
    2 * Math.max(0, data.chuteDrainDepth || 0)

  return (
    <section className="gw-panel">
      <div className="gw-panel-heading">
        Computed — d/s chute schedule
        {data.chuteDrainExcavationMaterial ? ' · gross excavation' : ''}
        {' · '}
        {data.chuteDrainLiningMaterial?.code} protection
      </div>
      {rows.length ? (
        <div className="bund-chute-schedule-wrap">
          <table className="gw-table bund-chute-schedule">
            <thead>
              <tr>
                <th>No.</th>
                <th>Chute chainage</th>
                <th>Local d/s slope length (m)</th>
                {data.chuteDrainExcavationMaterial && <th>Excavation (cu.m)</th>}
                <th>
                  Protection ({protection.measure === 'volume' ? 'cu.m' : 'sq.m'})
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.index}-${row.chainage}`}>
                  <td>{row.index}</td>
                  <td>{formatChainage(row.chainage, data.chainageUnit)}</td>
                  <td>{qty3.format(row.slopeLength)}</td>
                  {data.chuteDrainExcavationMaterial && (
                    <td>{qty3.format(row.excavationQty)}</td>
                  )}
                  <td>{qty3.format(row.protectionQty)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td>{qty3.format(totalLength)} m</td>
                {data.chuteDrainExcavationMaterial && (
                  <td>{qty3.format(excavation)} cu.m</td>
                )}
                <td>
                  {qty3.format(protection.quantity)}{' '}
                  {protection.measure === 'volume' ? 'cu.m' : 'sq.m'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="latlng-display">
          Nothing measured yet — enter chute spacing/count and usable cross-sections.
        </div>
      )}
      <div className="settings-note">
        Each chute uses the local d/s slope at its chainage; positions between entered sections
        are linearly interpolated. Excavation per row = slope ×{' '}
        {qty3.format(data.chuteDrainWidth)} m width × {qty3.format(data.chuteDrainDepth)} m depth.
        Protection uses {qty3.format(wettedPerimeter)} m wetted perimeter
        {protection.measure === 'volume'
          ? ` × ${qty3.format(data.chuteDrainLiningThickness)} m thickness`
          : ''}
        .
      </div>
    </section>
  )
}

/**
 * Berm workings. The shelf itself is deliberately not given a quantity table —
 * it is fill, and it is already inside the formation table above. What is shown
 * is the surfacing and the catch-water drain, each measured over the length the
 * shelf actually exists.
 */
function BermComputedTables({ data, berm }: { data: BundData; berm: BundBerm }): JSX.Element {
  const surfacing = bermSurfaceMeasurement(data, berm)
  const surfaceRows =
    surfacing.measure === 'volume'
      ? scaleQuantityRows(bermSurfaceRows(data, berm), berm.surfaceThickness)
      : bermSurfaceRows(data, berm)
  const drain = bermDrainProtectionMeasurement(data, berm)
  const drainRows =
    drain.measure === 'volume'
      ? scaleQuantityRows(bermDrainProtectionRows(data, berm), berm.drainLiningThickness)
      : bermDrainProtectionRows(data, berm)

  return (
    <>
      {berm.surfaceMaterial && (
        <QuantityTable
          title={`Computed — ${berm.surfaceMaterial.code} (${bermLabel(berm)} — shelf surfacing)`}
          rows={surfaceRows}
          data={data}
          startLabel={
            surfacing.measure === 'volume'
              ? 'Surfacing section at start (sq.m)'
              : 'Surfaced width at start (m)'
          }
          endLabel={
            surfacing.measure === 'volume'
              ? 'Surfacing section at end (sq.m)'
              : 'Surfaced width at end (m)'
          }
          areaLabel={
            surfacing.measure === 'volume'
              ? 'Mean surfacing section (sq.m)'
              : 'Mean surfaced width (m)'
          }
          qtyLabel={surfacing.measure === 'volume' ? 'Volume (cu.m)' : 'Area (sq.m)'}
          note="A width of nothing means the face no longer falls below the shelf RL at that chainage, so the berm has run out there."
        />
      )}
      {berm.drainLiningMaterial && (
        <>
          {berm.drainExcavationMaterial && (
            <QuantityTable
              title={`Computed — ${bermLabel(berm)} — catch-water drain excavation (gross)`}
              rows={bermDrainExcavationRows(data, berm)}
              data={data}
              startLabel="Channel section at start (sq.m)"
              endLabel="Channel section at end (sq.m)"
              areaLabel="Mean channel section (sq.m)"
              qtyLabel="Volume (cu.m)"
            />
          )}
          <QuantityTable
            title={`Computed — ${berm.drainLiningMaterial.code} (${bermLabel(
              berm
            )} — drain protection)`}
            rows={drainRows}
            data={data}
            startLabel={
              drain.measure === 'volume'
                ? 'Lining section at start (sq.m)'
                : 'Protected width at start (m)'
            }
            endLabel={
              drain.measure === 'volume'
                ? 'Lining section at end (sq.m)'
                : 'Protected width at end (m)'
            }
            areaLabel={
              drain.measure === 'volume'
                ? 'Mean lining section (sq.m)'
                : 'Mean protected width (m)'
            }
            qtyLabel={drain.measure === 'volume' ? 'Volume (cu.m)' : 'Area (sq.m)'}
          />
        </>
      )}
    </>
  )
}

/** Mean Sectional Area working, shown the way the measurement sheets lay it out. */
function QuantityTable({
  title,
  rows,
  data,
  startLabel = 'Area at start',
  endLabel = 'Area at end',
  areaLabel,
  qtyLabel,
  note
}: {
  title: string
  rows: BundQtyRow[]
  data: BundData
  startLabel?: string
  endLabel?: string
  areaLabel: string
  qtyLabel: string
  note?: string
}): JSX.Element {
  const unit = data.chainageUnit
  const total = rowsTotal(rows)
  return (
    <section className="gw-panel">
      <div className="gw-panel-heading">{title}</div>
      {rows.length ? (
        <table className="gw-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>{startLabel}</th>
              <th>{endLabel}</th>
              <th>{areaLabel}</th>
              <th>Length (m)</th>
              <th>{qtyLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.fromCh}-${r.toCh}`}>
                <td>{formatChainage(r.fromCh, unit)}</td>
                <td>{formatChainage(r.toCh, unit)}</td>
                <td>{qty3.format(r.areaFrom)}</td>
                <td>{qty3.format(r.areaTo)}</td>
                <td>{qty3.format(r.meanArea)}</td>
                <td>{qty3.format(r.lengthM)}</td>
                <td>{qty3.format(r.qty)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total</td>
              <td>{qty3.format(total)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="latlng-display">
          Nothing measured yet — enter levels at two or more chainages.
        </div>
      )}
      {note && <div className="settings-note">{note}</div>}
    </section>
  )
}
