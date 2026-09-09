import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { BundData, BundSoilBand, TemplateMaterialRef } from '../../../../types/project'
import {
  BUND_DAW_REVETMENT_OPTIONS,
  BUND_DEFAULT_BERM_DRAIN_EXC_CODE,
  BUND_DEFAULT_BERM_DRAIN_LINING_CODE,
  BUND_DEFAULT_BERM_DRAIN_STONE_CODE,
  BUND_DEFAULT_CHUTE_EXC_CODE,
  BUND_DEFAULT_CHUTE_LINING_CODE,
  BUND_DEFAULT_CHUTE_STONE_CODE,
  BUND_DEFAULT_FOUNDATION_EXC_CODE,
  BUND_DEFAULT_PITCHING_CODE,
  BUND_DEFAULT_ROCKTOE_CODE,
  BUND_DEFAULT_ROCKTOE_FILTER_CODE,
  BUND_DEFAULT_HFILTER_CODE,
  BUND_DEFAULT_VFILTER_CODE,
  BUND_DEFAULT_TURFING_CODE,
  BUND_DEFAULT_TOE_BUILD_CODE,
  BUND_DEFAULT_TOE_CC_CODE,
  BUND_DEFAULT_TOE_EXC_CODE,
  BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE,
  BUND_UPSTREAM_TOE_MASONRY_CODE,
  defaultBundExcavationRows,
  automaticToeDrainInvertLevel,
  bermSurfaceMeasurement,
  chuteDrainExcavationQuantity,
  chuteDrainProtectionMeasurement,
  chuteDrainRows,
  chuteDrainTotalLength,
  downstreamToeFaceSlope,
  formatChainage,
  horizontalFilterLengthAt,
  horizontalFilterMeasure,
  horizontalFilterRows,
  horizontalFilterThicknessM,
  lowestStrippedLevelAt,
  orderedSections,
  pitchingMeasuredQuantity,
  pitchingThicknessM,
  revetmentFilterThicknessM,
  revetmentOptionForCode,
  rockToeFilterRows,
  rockToeExcavationAvailable,
  rockToeExcavationRows,
  rockToeHeightAt,
  rockToeRows,
  rowsTotal,
  steepestSection,
  toeExcavationArea,
  toeExcavationAreaAt,
  toeExcavationRows,
  toeBuildMeasurement,
  toeDrainDepthAt,
  toeDrainInvertLevelAt,
  toeDrainPlatformAt,
  toeDrainTopWidthAt,
  toeLiningDevelopedWidthAt,
  turfingRows,
  verticalFilterHeightAt,
  verticalFilterMeasure,
  verticalFilterRows,
  verticalFilterWidthM
} from '../../../../lib/bund'
import { fetchSsrItems, type MasterItem } from '../../../../lib/masterData'
import { useStore } from '../../../../store/useStore'
import BundSectionDiagram from '../../BundSectionDiagram'
import BundRockToeDiagram from '../../BundRockToeDiagram'
import BundToeDiagram from '../../BundToeDiagram'
import BundFilterDiagram from '../../BundFilterDiagram'
import BundDrainageDiagram from '../../BundDrainageDiagram'
import BundChuteDiagram from '../../BundChuteDiagram'
import BundAssemblyDiagram from '../../BundAssemblyDiagram'
import BundBermDiagram from '../../BundBermDiagram'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode, { useSsrDescription } from '../../../templates/SsrCode'

const n3 = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

function BermProtectionOptionButton({
  option,
  isSelected,
  onSelect
}: {
  option: { code: string | null; label: string }
  isSelected: boolean
  onSelect: () => void
}): JSX.Element {
  const { title } = useSsrDescription(option.code)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      className={`btn ${isSelected ? 'primary' : 'ghost'}`}
      onClick={onSelect}
      title={option.code ? title : 'No protection applied'}
    >
      {option.label}
      {option.code ? (
        <> · <span className="ssr-code-hover">{option.code.replace('IRR-', '')}</span></>
      ) : ''}
    </button>
  )
}

function BermProtectionCard({
  berm,
  data,
  onSelectCode,
  onPickMaterial,
  onPatchBerm
}: {
  berm: BundData['design']['berms'][number]
  data: BundData
  onSelectCode: (code: string | null) => void
  onPickMaterial: (material: TemplateMaterialRef) => void
  onPatchBerm: (patch: Partial<BundData['design']['berms'][number]>) => void
}): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const label = `${berm.side === 'us' ? 'U/S' : 'D/S'} berm · RL ${n3(berm.level)}`
  const currentCode = berm.surfaceMaterial?.code ?? null
  const standardCodes = ['IRR-DAW-6-10', 'IRR-DAW-6-15', 'IRR-CAW-7-12']
  const isCustom = Boolean(currentCode && !standardCodes.includes(currentCode))
  const { title: customTitle } = useSsrDescription(
    isCustom ? currentCode : null,
    berm.surfaceMaterial?.description
  )
  const surfaceMeasure = berm.surfaceMaterial ? bermSurfaceMeasurement(data, berm) : null

  return (
    <article className="bund-v2-berm-protection-row">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <strong>{label}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {surfaceMeasure && (
            <small style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              <strong>{n3(surfaceMeasure.quantity)}</strong> {surfaceMeasure.measure === 'volume' ? 'cu.m' : 'sq.m'}
            </small>
          )}
          {isCustom && currentCode && (
            <small style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 600 }}>Custom code</small>
          )}
        </div>
      </div>
      <div role="radiogroup" aria-label={`${label} protection`}>
        {[
          { code: null, label: 'None' },
          { code: 'IRR-DAW-6-10', label: 'Stone revetment' },
          { code: 'IRR-DAW-6-15', label: 'Turfing' },
          { code: 'IRR-CAW-7-12', label: 'CC protection' }
        ].map((option) => (
          <BermProtectionOptionButton
            key={option.code ?? 'none'}
            option={option}
            isSelected={currentCode === option.code}
            onSelect={() => onSelectCode(option.code)}
          />
        ))}

        {isCustom && currentCode && (
          <button
            type="button"
            role="radio"
            aria-checked={true}
            className="btn primary"
            onClick={() => setPickerOpen(true)}
            title={customTitle}
          >
            <Search size={12} />
            <span className="ssr-code-hover">{currentCode.replace('IRR-', '')}</span>
          </button>
        )}

        <button
          type="button"
          className="btn ghost"
          onClick={() => setPickerOpen(true)}
          title="Search all SSR items to choose custom berm protection"
        >
          <Search size={12} /> {isCustom ? 'Change searched code' : 'Search code'}
        </button>
      </div>

      {surfaceMeasure?.measure === 'volume' && (
        <div style={{ marginTop: '8px', maxWidth: '220px' }}>
          <ToeNumberField
            label="Layer thickness (m)"
            value={berm.surfaceThickness ?? 0.1}
            onCommit={(surfaceThickness) => onPatchBerm({ surfaceThickness })}
          />
        </div>
      )}

      {pickerOpen && (
        <MaterialPicker
          initialCategory={currentCode?.startsWith('IRR-CAW') ? 'IRR-CAW' : 'IRR-DAW'}
          initialSearch=""
          selectionHint="Search and select any SSR item to apply as surface protection for this berm."
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            onPickMaterial(materialFromItem(item))
            setPickerOpen(false)
          }}
        />
      )}
    </article>
  )
}

function ToeNumberField({
  label,
  value,
  onCommit,
  disabled = false
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = Math.max(0, parsed)
    if (next !== value) onCommit(next)
    setDraft(String(next))
  }

  return (
    <label className="bund-v2-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onFocus={() => { focused.current = true }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { focused.current = false; commit() }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

const materialFromItem = (item: MasterItem): TemplateMaterialRef => ({
  code: item.code,
  description: item.description,
  unit: item.dataVariant?.unit ?? item.unit,
  categoryKey: item.category,
  side: item.side,
  dataVariant: item.dataVariant
})

export default function OptionalProtectionDrainage({
  nodeId,
  data,
  onCommit,
  chapter = 5
}: {
  nodeId: string
  data: BundData
  onCommit: (update: (current: BundData) => BundData) => void
  chapter?: 5 | 6 | 7 | 8 | 9 | 10
}): JSX.Element {
  const sections = useMemo(() => orderedSections(data), [data])
  const highest = useMemo(() => steepestSection(data) ?? sections[0] ?? null, [data, sections])
  const [selectedId, setSelectedId] = useState<string | null>(highest?.id ?? null)
  const [picker, setPicker] = useState<string | null>(null)
  const selected = sections.find((section) => section.id === selectedId) ?? highest
  const isZoned = data.embankmentType === 'zoned'

  useEffect(() => {
    if (!selectedId || !sections.some((section) => section.id === selectedId)) {
      setSelectedId(highest?.id ?? null)
    }
  }, [highest?.id, sections, selectedId])

  const measurement = useMemo(() => pitchingMeasuredQuantity(data), [data])
  const turfingTotal = useMemo(() => rowsTotal(turfingRows(data)), [data])
  const upstreamToeEnabled = Boolean(data.upstreamToe.excavationMaterial)
  const upstreamToeTotal = useMemo(
    () => rowsTotal(toeExcavationRows(data, data.upstreamToe)),
    [data]
  )
  const upstreamBands = data.excavationBands?.['ustoe-exc'] ?? defaultBundExcavationRows()
  const upstreamBandPct = upstreamBands.reduce((sum, band) => sum + (band.pct || 0), 0)
  const downstreamToeEnabled = Boolean(data.downstreamToe.excavationMaterial)
  const downstreamToeTotal = useMemo(
    () => rowsTotal(toeExcavationRows(data, data.downstreamToe)),
    [data]
  )
  const downstreamBands = data.excavationBands?.['dstoe-exc'] ?? defaultBundExcavationRows(undefined, 'channel')
  const downstreamBandPct = downstreamBands.reduce((sum, band) => sum + (band.pct || 0), 0)
  const automaticDrainInvert = useMemo(() => automaticToeDrainInvertLevel(data), [data])
  const selectedDrainInvert = selected ? toeDrainInvertLevelAt(selected, data) : null
  const selectedDrainDepth = selected ? toeDrainDepthAt(selected, data) : data.downstreamToe.depth
  const selectedDrainTopWidth = selected ? toeDrainTopWidthAt(selected, data) : data.downstreamToe.topWidth
  const selectedDrainArea = selected
    ? toeExcavationAreaAt(selected, data, data.downstreamToe)
    : toeExcavationArea(data.downstreamToe)
  const selectedDrainDevelopedWidth = selected
    ? toeLiningDevelopedWidthAt(selected, data, data.downstreamToe)
    : 0
  const downstreamBuildMeasurement = useMemo(
    () => toeBuildMeasurement(data, data.downstreamToe),
    [data]
  )
  const downstreamDrainPlatform = useMemo(
    () => selected ? toeDrainPlatformAt(selected, data) : null,
    [data, selected]
  )
  const rockToeTotal = useMemo(() => rowsTotal(rockToeRows(data)), [data])
  const rockToeFilterTotal = useMemo(() => rowsTotal(rockToeFilterRows(data)), [data])
  const rockToeExcavationTotal = useMemo(() => rowsTotal(rockToeExcavationRows(data)), [data])
  const rockToeExcavation = rockToeExcavationAvailable(data)
  const rockToeBands = data.excavationBands?.['rocktoe-exc'] ?? defaultBundExcavationRows()
  const rockToeBandPct = rockToeBands.reduce((sum, band) => sum + (band.pct || 0), 0)
  const rockToeDisplayHeight = selected ? rockToeHeightAt(selected, data) : data.rockToeHeight
  const rockToeFaceSlope = selected ? downstreamToeFaceSlope(selected, data) : data.design.dsSlope
  const horizontalFilterTotal = useMemo(() => rowsTotal(horizontalFilterRows(data)), [data])
  const verticalFilterTotal = useMemo(() => rowsTotal(verticalFilterRows(data)), [data])
  const horizontalFilterMeasureType = horizontalFilterMeasure(data)
  const verticalFilterMeasureType = verticalFilterMeasure(data)
  const filterBaseLevel = selected ? lowestStrippedLevelAt(selected, data) : null
  const filterDiagramHeight = filterBaseLevel == null
    ? 0
    : Math.max(0, data.design.topLevel - filterBaseLevel)
  const filterDiagramMwlRise = filterBaseLevel == null || data.design.mwl == null
    ? null
    : data.design.mwl - filterBaseLevel
  const filterLength = selected ? horizontalFilterLengthAt(selected, data) : data.horizontalFilterLength
  const horizontalThickness = horizontalFilterThicknessM(data)
  const verticalWidth = verticalFilterWidthM(data)
  const verticalHeight = selected ? verticalFilterHeightAt(selected, data) : data.verticalFilterHeight
  const chuteRows = useMemo(() => chuteDrainRows(data), [data])
  const chuteLength = useMemo(() => chuteDrainTotalLength(data), [data])
  const chuteExcavation = useMemo(() => chuteDrainExcavationQuantity(data), [data])
  const chuteProtection = useMemo(() => chuteDrainProtectionMeasurement(data), [data])
  const selectedSystem = revetmentOptionForCode(data.pitchingMaterial?.code)
  const quantityText = `${n3(measurement.quantity)} ${measurement.measure === 'volume' ? 'cu.m' : 'sq.m'}`
  const diagramData = useMemo<BundData>(() => chapter === 5
    ? {
        ...data,
        upstreamToe: {
          ...data.upstreamToe,
          excavationMaterial: null,
          buildMaterial: null
        }
      }
    : data,
  [chapter, data])
  const referencePhreaticData = useMemo<BundData>(() => ({
    ...data,
    design: { ...data.design, berms: [] },
    rockToeMaterial: null,
    rockToeFilterMaterial: null,
    horizontalFilterMaterial: null,
    verticalFilterMaterial: null
  }), [data])

  const selectRevetmentCode = (code: string): void => {
    const option = revetmentOptionForCode(code)
    onCommit((current) => ({
      ...current,
      pitchingMaterial: { code },
      pitchingThickness: option?.stoneThickness ?? 0.6,
      pitchingBeddingMaterial: null,
      pitchingMetalEnabled: false,
      pitchingMetalMaterial: null
    }))
    void fetchSsrItems('IRR-DAW').then((items) => {
      const material = items.find((item) => item.code === code)
      if (material && useStore.getState().project) {
        useStore.getState().setBundMaterial(nodeId, 'pitching', material)
      }
    })
  }

  const disableRevetment = (): void => onCommit((current) => ({
    ...current,
    pitchingMaterial: null,
    pitchingBeddingMaterial: null,
    pitchingMetalEnabled: false,
    pitchingMetalMaterial: null
  }))

  const enableTurfing = (): void => {
    onCommit((current) => ({
      ...current,
      turfingMaterial: { code: BUND_DEFAULT_TURFING_CODE }
    }))
    void fetchSsrItems('IRR-DAW').then((items) => {
      const material = items.find((item) => item.code === BUND_DEFAULT_TURFING_CODE)
      if (material && useStore.getState().project) {
        useStore.getState().setBundMaterial(nodeId, 'turfing', material)
      }
    })
  }

  const enableRockToe = (): void => {
    onCommit((current) => ({
      ...current,
      rockToeMaterial: { code: BUND_DEFAULT_ROCKTOE_CODE },
      rockToeFilterMaterial: { code: BUND_DEFAULT_ROCKTOE_FILTER_CODE },
      ...(rockToeExcavation
        ? {
            rockToeExcavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
            rockToeExcavationDepth: current.rockToeExcavationDepth > 0 ? current.rockToeExcavationDepth : 0.3
          }
        : { rockToeExcavationMaterial: null })
    }))
    void fetchSsrItems('IRR-DAW').then((items) => {
      if (!useStore.getState().project) return
      const rock = items.find((item) => item.code === BUND_DEFAULT_ROCKTOE_CODE)
      const filter = items.find((item) => item.code === BUND_DEFAULT_ROCKTOE_FILTER_CODE)
      if (rock) useStore.getState().setBundMaterial(nodeId, 'rocktoe', rock)
      if (filter) useStore.getState().setBundMaterial(nodeId, 'rocktoe-filter', filter)
    })
  }

  const enableHorizontalFilter = (): void => {
    onCommit((current) => ({
      ...current,
      horizontalFilterMaterial: { code: BUND_DEFAULT_HFILTER_CODE },
      horizontalFilterThickness: 0.4,
      // Keep the present workflow aligned with the old dashboard: the
      // horizontal blanket is commissioned together with its chimney.
      verticalFilterMaterial: { code: BUND_DEFAULT_VFILTER_CODE },
      verticalFilterWidth: 0.45,
      verticalFilterHeight: 0
    }))
    void fetchSsrItems('IRR-DAW').then((items) => {
      if (!useStore.getState().project) return
      const blanket = items.find((item) => item.code === BUND_DEFAULT_HFILTER_CODE)
      const chimney = items.find((item) => item.code === BUND_DEFAULT_VFILTER_CODE)
      if (blanket) useStore.getState().setBundMaterial(nodeId, 'hfilter', blanket)
      if (chimney) useStore.getState().setBundMaterial(nodeId, 'vfilter', chimney)
    })
  }

  const enableVerticalFilter = (): void => {
    onCommit((current) => ({
      ...current,
      verticalFilterMaterial: { code: BUND_DEFAULT_VFILTER_CODE },
      verticalFilterWidth: 0.45,
      verticalFilterHeight: 0
    }))
    void fetchSsrItems('IRR-DAW').then((items) => {
      const material = items.find((item) => item.code === BUND_DEFAULT_VFILTER_CODE)
      if (material && useStore.getState().project) {
        useStore.getState().setBundMaterial(nodeId, 'vfilter', material)
      }
    })
  }

  const patchUpstreamToe = (patch: Partial<BundData['upstreamToe']>): void =>
    onCommit((current) => ({
      ...current,
      upstreamToe: { ...current.upstreamToe, ...patch }
    }))

  const patchUpstreamBands = (bands: BundSoilBand[]): void =>
    onCommit((current) => ({
      ...current,
      excavationBands: { ...current.excavationBands, 'ustoe-exc': bands }
    }))

  const patchDownstreamToe = (patch: Partial<BundData['downstreamToe']>): void =>
    onCommit((current) => ({
      ...current,
      downstreamToe: { ...current.downstreamToe, ...patch }
    }))

  const patchDownstreamBands = (bands: BundSoilBand[]): void =>
    onCommit((current) => ({
      ...current,
      excavationBands: { ...current.excavationBands, 'dstoe-exc': bands }
    }))

  const patchRockToeBands = (bands: BundSoilBand[]): void =>
    onCommit((current) => ({
      ...current,
      excavationBands: { ...current.excavationBands, 'rocktoe-exc': bands }
    }))

  const patchBerm = (bermId: string, patch: Partial<BundData['design']['berms'][number]>): void =>
    onCommit((current) => ({
      ...current,
      design: {
        ...current.design,
        berms: current.design.berms.map((berm) => berm.id === bermId ? { ...berm, ...patch } : berm)
      }
    }))

  const selectBermProtection = (bermId: string, code: string | null): void => {
    patchBerm(bermId, { surfaceMaterial: code ? { code } : null })
    if (!code) return
    void fetchSsrItems(code.startsWith('IRR-CAW') ? 'IRR-CAW' : 'IRR-DAW').then((items) => {
      const material = items.find((item) => item.code === code)
      if (material) patchBerm(bermId, { surfaceMaterial: materialFromItem(material) })
    })
  }

  const toggleBermDrain = (bermId: string, enabled: boolean): void => {
    patchBerm(bermId, enabled ? {
      drainLiningMaterial: { code: BUND_DEFAULT_BERM_DRAIN_LINING_CODE },
      drainExcavationMaterial: { code: BUND_DEFAULT_BERM_DRAIN_EXC_CODE }
    } : { drainLiningMaterial: null, drainExcavationMaterial: null })
  }

  const selectBermDrainProtection = (
    bermId: string,
    protection: 'none' | 'concrete' | 'stone'
  ): void => {
    if (protection === 'none') {
      patchBerm(bermId, { drainLiningMaterial: null })
      return
    }
    const code = protection === 'stone'
      ? BUND_DEFAULT_BERM_DRAIN_STONE_CODE
      : BUND_DEFAULT_BERM_DRAIN_LINING_CODE
    patchBerm(bermId, {
      drainLiningMaterial: { code },
      drainLiningThickness: protection === 'stone' ? 0.3 : 0.1
    })
    void fetchSsrItems('IRR-CAW').then((items) => {
      const material = items.find((item) => item.code === code)
      if (material) patchBerm(bermId, { drainLiningMaterial: materialFromItem(material) })
    })
  }

  const enableChuteDrains = (): void => {
    onCommit((current) => ({
      ...current,
      chuteDrainExcavationMaterial: { code: BUND_DEFAULT_CHUTE_EXC_CODE },
      chuteDrainLiningMaterial: { code: BUND_DEFAULT_CHUTE_LINING_CODE },
      chuteDrainProtectionType: 'concrete',
      chuteDrainLiningThickness: 0.1
    }))
    void fetchSsrItems('IRR-CAW').then((items) => {
      const excavation = items.find((item) => item.code === BUND_DEFAULT_CHUTE_EXC_CODE)
      const lining = items.find((item) => item.code === BUND_DEFAULT_CHUTE_LINING_CODE)
      onCommit((current) => ({
        ...current,
        chuteDrainExcavationMaterial: excavation
          ? materialFromItem(excavation)
          : current.chuteDrainExcavationMaterial,
        chuteDrainLiningMaterial: lining ? materialFromItem(lining) : current.chuteDrainLiningMaterial
      }))
    })
  }

  const setChuteProtectionType = (type: BundData['chuteDrainProtectionType']): void => {
    const code = type === 'stone' ? BUND_DEFAULT_CHUTE_STONE_CODE : BUND_DEFAULT_CHUTE_LINING_CODE
    onCommit((current) => ({
      ...current,
      chuteDrainProtectionType: type,
      chuteDrainLiningMaterial: { code },
      chuteDrainLiningThickness: type === 'stone' ? 0.3 : 0.1
    }))
    void fetchSsrItems('IRR-CAW').then((items) => {
      const lining = items.find((item) => item.code === code)
      if (lining) onCommit((current) => ({ ...current, chuteDrainLiningMaterial: materialFromItem(lining) }))
    })
  }

  const setDownstreamToeMaterial = (
    field: 'excavationMaterial' | 'buildMaterial',
    item: MasterItem
  ): void => patchDownstreamToe({ [field]: materialFromItem(item) })

  const attachDownstreamToeMaterial = (
    field: 'excavationMaterial' | 'buildMaterial',
    code: string,
    liningThickness?: number
  ): void => {
    patchDownstreamToe({ [field]: { code }, ...(liningThickness == null ? {} : { liningThickness }) })
    void fetchSsrItems('IRR-CAW').then((items) => {
      const item = items.find((candidate) => candidate.code === code)
      if (item && useStore.getState().project) setDownstreamToeMaterial(field, item)
    })
  }

  const enableDownstreamToe = (): void => {
    patchDownstreamToe({
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
      onCommit((current) => ({
        ...current,
        downstreamToe: {
          ...current.downstreamToe,
          excavationMaterial: excavation ? materialFromItem(excavation) : { code: BUND_DEFAULT_TOE_EXC_CODE },
          buildMaterial: protection ? materialFromItem(protection) : { code: BUND_DEFAULT_TOE_BUILD_CODE }
        }
      }))
    })
  }

  const setUpstreamToeMaterial = (
    field: 'excavationMaterial' | 'buildMaterial',
    item: MasterItem
  ): void => patchUpstreamToe({ [field]: materialFromItem(item) })

  const attachUpstreamToeMaterial = (
    field: 'excavationMaterial' | 'buildMaterial',
    code: string
  ): void => {
    patchUpstreamToe({ [field]: { code } })
    void fetchSsrItems('IRR-DAW').then((items) => {
      const item = items.find((candidate) => candidate.code === code)
      if (item && useStore.getState().project) setUpstreamToeMaterial(field, item)
    })
  }

  const enableUpstreamToe = (): void => {
    patchUpstreamToe({
      excavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
      buildMaterial: { code: BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE },
      buildArea: 0,
      liningThickness: 0
    })
    void fetchSsrItems('IRR-DAW').then((items) => {
      const excavation = items.find((item) => item.code === BUND_DEFAULT_FOUNDATION_EXC_CODE)
      const construction = items.find((item) => item.code === BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE)
      if (!useStore.getState().project) return
      onCommit((current) => ({
        ...current,
        upstreamToe: {
          ...current.upstreamToe,
          excavationMaterial: excavation ? materialFromItem(excavation) : { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
          buildMaterial: construction ? materialFromItem(construction) : { code: BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE }
        }
      }))
    })
  }

  return (
    <section className="bund-v2-section" aria-labelledby="bund-v2-optional-title">
      <header className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Optional items</span>
          <h2 id="bund-v2-optional-title">
            {chapter === 5
              ? '5. Slopes Protection'
              : chapter === 6
                ? '6. U/S Toe Wall & Anchorage'
                : chapter === 7
                  ? '7. Rock Toe'
                  : chapter === 8
                    ? '8. Filters'
                    : '9. D/S Toe Drain'}
          </h2>
          <p>
            {chapter === 5
              ? 'Configure upstream revetment and downstream turfing as separate slope-protection items.'
              : chapter === 6
                ? 'Configure the upstream cut-off trench and its approved anchorage construction.'
                : chapter === 7
                  ? 'Configure the downstream rubble rock toe and its graded bedding.'
                  : chapter === 8
                    ? 'Configure the connected horizontal blanket and vertical chimney filters.'
                  : 'Configure the downstream seepage-collection drain, excavation classes, and bed-and-side protection.'}
          </p>
        </div>
        <span className="bund-v2-save-state">Saved</span>
      </header>

      {chapter === 5 && (
        <section className={`bund-v2-turfing-card${data.turfingMaterial ? ' is-enabled' : ''}`}>
          <label className="bund-v2-turfing-toggle">
            <input
              type="checkbox"
              checked={Boolean(data.turfingMaterial)}
              onChange={(event) => event.target.checked
                ? enableTurfing()
                : onCommit((current) => ({ ...current, turfingMaterial: null }))
              }
            />
            <strong>Turfing on downstream face</strong>
          </label>
          <p>
            Grass sods over the exposed developed land-side slope. Any lower slope occupied by
            an enabled rock toe is deducted automatically.
          </p>
          {data.turfingMaterial && (
            <div className="bund-v2-turfing-result">
              <SsrCode code={data.turfingMaterial.code} description={data.turfingMaterial.description} />
              <span>{n3(turfingTotal)} sq.m</span>
              <button type="button" className="btn ghost" onClick={() => setPicker('turfing')}>
                <Pencil size={13} /> Change code
              </button>
              {picker === 'turfing' && (
                <MaterialPicker
                  initialCategory="IRR-DAW"
                  initialSearch="turfing"
                  onClose={() => setPicker(null)}
                  onPick={(item) => {
                    onCommit((current) => ({ ...current, turfingMaterial: materialFromItem(item) }))
                    setPicker(null)
                  }}
                />
              )}
            </div>
          )}
        </section>
      )}

      {chapter === 5 && <section className={`bund-v2-revetment-card${data.pitchingMaterial ? ' is-enabled' : ''}`}>
        <label className="bund-v2-revetment-toggle">
          <input
            type="checkbox"
            checked={Boolean(data.pitchingMaterial)}
            onChange={(event) => event.target.checked
              ? selectRevetmentCode(BUND_DEFAULT_PITCHING_CODE)
              : disableRevetment()
            }
          />
          <span>Revetment — Upstream Slope</span>
        </label>
        <p>
          Choose the DAW construction and its protection extent. Stone and graded-filter dimensions
          are fixed by the selected code.
        </p>

        {data.pitchingMaterial && (
          <div className="bund-v2-revetment-details">
            <div className="bund-v2-revetment-controls">
              <div className="bund-v2-revetment-selected">
                <span>Selected system</span>
                <SsrCode code={data.pitchingMaterial?.code ?? ''} description={data.pitchingMaterial?.description} className="bund-v2-revetment-code" />
                <b>{selectedSystem?.construction ?? 'DAW revetment'}</b>
                <small>
                  {Math.round(pitchingThicknessM(data) * 1000)} mm stone +{' '}
                  {Math.round(revetmentFilterThicknessM(data) * 1000)} mm graded filter
                </small>
                <strong className="bund-v2-revetment-quantity">{quantityText}</strong>
              </div>

              <div className="bund-v2-revetment-extent">
                <span>Protection extent</span>
                <div>
                  <button
                    type="button"
                    className={`btn${data.pitchingExtent !== 'full' ? ' primary' : ' ghost'}`}
                    onClick={() => onCommit((current) => ({ ...current, pitchingExtent: 'mwl' }))}
                  >
                    Up to MWL
                  </button>
                  <button
                    type="button"
                    className={`btn${data.pitchingExtent === 'full' ? ' primary' : ' ghost'}`}
                    onClick={() => onCommit((current) => ({ ...current, pitchingExtent: 'full' }))}
                  >
                    Full U/S face
                  </button>
                </div>
                <small>
                  {data.pitchingExtent === 'full'
                    ? 'Complete upstream face.'
                    : data.design.mwl == null
                      ? 'MWL is required.'
                      : 'Ends where MWL meets ground.'}
                </small>
              </div>
            </div>

            <div className="bund-v2-revetment-options" role="radiogroup" aria-label="DAW revetment system">
              <div className="bund-v2-revetment-option-head" aria-hidden="true">
                <span>DAW item</span>
                <span>Construction</span>
                <span>Stone</span>
                <span>Filter</span>
                <span>Anchoring</span>
              </div>
              {BUND_DAW_REVETMENT_OPTIONS.map((option) => {
                const isSelected = data.pitchingMaterial?.code === option.code
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`bund-v2-revetment-option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => selectRevetmentCode(option.code)}
                  >
                    <span className="bund-v2-revetment-option-code">
                      <SsrCode code={option.code}>{option.code.replace('IRR-', '')}</SsrCode>
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
            <small className="bund-v2-revetment-footnote">
              Each row is one integrated SQM item covering both displayed layers. Toe anchorage is measured separately.
            </small>
          </div>
        )}
      </section>}

      {chapter === 5 && data.design.berms.length > 0 && (
        <section className="bund-v2-revetment-card bund-v2-berm-protection-card">
          <div className="bund-v2-panel-title">Berm Protection</div>
          <p>Select protection independently for each berm created in Berm Design. Nothing is measured when None is selected.</p>
          <div className="bund-v2-berm-columns">
            <section className="bund-v2-berm-face is-upstream">
              <header>
                <div>
                  <strong>Upstream Berms</strong>
                  <small>Left face</small>
                </div>
              </header>
              {data.design.berms.filter((berm) => berm.side === 'us').length === 0 ? (
                <div className="bund-v2-empty-state">No upstream berms.</div>
              ) : (
                <div className="bund-v2-berm-protection-list">
                  {data.design.berms
                    .filter((berm) => berm.side === 'us')
                    .map((berm) => (
                      <BermProtectionCard
                        key={berm.id}
                        berm={berm}
                        data={data}
                        onSelectCode={(code) => selectBermProtection(berm.id, code)}
                        onPickMaterial={(material) => patchBerm(berm.id, { surfaceMaterial: material })}
                        onPatchBerm={(patch) => patchBerm(berm.id, patch)}
                      />
                    ))}
                </div>
              )}
            </section>

            <section className="bund-v2-berm-face is-downstream">
              <header>
                <div>
                  <strong>Downstream Berms</strong>
                  <small>Right face</small>
                </div>
              </header>
              {data.design.berms.filter((berm) => berm.side === 'ds').length === 0 ? (
                <div className="bund-v2-empty-state">No downstream berms.</div>
              ) : (
                <div className="bund-v2-berm-protection-list">
                  {data.design.berms
                    .filter((berm) => berm.side === 'ds')
                    .map((berm) => (
                      <BermProtectionCard
                        key={berm.id}
                        berm={berm}
                        data={data}
                        onSelectCode={(code) => selectBermProtection(berm.id, code)}
                        onPickMaterial={(material) => patchBerm(berm.id, { surfaceMaterial: material })}
                        onPatchBerm={(patch) => patchBerm(berm.id, patch)}
                      />
                    ))}
                </div>
              )}
            </section>
          </div>
        </section>
      )}

      {chapter === 5 && <section className="bund-v2-optional-diagram-card">
        <header>
          <div>
            <div className="bund-v2-panel-title">Full Bund Diagram</div>
            <small>
              Enabled slope and per-berm protection are shown on the selected section.
            </small>
          </div>
          <label className="bund-v2-diagram-section-select">
            <span>Diagram chainage</span>
            <select
              value={selected?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={!sections.length}
            >
              {sections.map((section, index) => (
                <option key={section.id} value={section.id}>
                  {index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)} m
                  {section.id === highest?.id ? ' · Highest' : ''}
                </option>
              ))}
            </select>
          </label>
        </header>
        {selected ? (
          <div className="bund-v2-optional-diagram bund-v2-slope-protection-diagram">
            <BundAssemblyDiagram data={diagramData} section={selected} />
          </div>
        ) : (
          <div className="bund-v2-empty-state">No cross-sections are available.</div>
        )}
      </section>}

      {chapter === 6 && <section className={`bund-v2-revetment-card bund-v2-upstream-toe-card${upstreamToeEnabled ? ' is-enabled' : ''}`}>
        <label className="bund-v2-revetment-toggle">
          <input
            type="checkbox"
            checked={upstreamToeEnabled}
            onChange={(event) => event.target.checked
              ? enableUpstreamToe()
              : patchUpstreamToe({
                  excavationMaterial: null,
                  buildMaterial: null,
                  buildArea: 0,
                  liningThickness: 0
                })
            }
          />
          <span>U/S Toe Wall / Anchorage</span>
        </label>
        <p>
          Cut-off trench at the upstream toe, with an optional PCC or masonry wall built into it.
          It anchors the slope revetment when revetment is used, but can also stand on its own.
        </p>

        {upstreamToeEnabled && (
          <div className="bund-v2-toe-option-details">
            <div className="bund-v2-us-toe-workspace">
              <div className="bund-v2-single-detail-diagram">
                <BundToeDiagram
                  topWidth={data.upstreamToe.topWidth}
                  bottomWidth={data.upstreamToe.bottomWidth}
                  depth={data.upstreamToe.depth}
                  lined={false}
                  solid={Boolean(data.upstreamToe.buildMaterial)}
                />
              </div>
              <div className="bund-v2-toe-geometry-grid">
                <ToeNumberField
                  label="Top width (m)"
                  value={data.upstreamToe.topWidth}
                  onCommit={(topWidth) => patchUpstreamToe({ topWidth })}
                />
                <ToeNumberField
                  label="Bottom width (m)"
                  value={data.upstreamToe.bottomWidth}
                  onCommit={(bottomWidth) => patchUpstreamToe({ bottomWidth })}
                />
                <ToeNumberField
                  label="Depth (m)"
                  value={data.upstreamToe.depth}
                  onCommit={(depth) => patchUpstreamToe({ depth })}
                />
                <div className="bund-v2-toe-geometry-result">
                  <span>Calculated excavation</span>
                  <strong>{n3(toeExcavationArea(data.upstreamToe))} m² section</strong>
                  <b>{n3(upstreamToeTotal)} cu.m total</b>
                </div>
              </div>
            </div>

            <section className="bund-v2-excavation-classes">
              <header>
                <div>
                  <strong>U/S revetment toe wall / anchorage excavation</strong>
                  <small>Structural foundation trench below the upstream anchorage.</small>
                </div>
                <div className="bund-v2-excavation-summary">
                  <strong>{n3(upstreamToeTotal)} cu.m</strong>
                  <span className={Math.abs(upstreamBandPct - 100) > 0.01 ? 'is-warning' : ''}>
                    {n3(upstreamBandPct)}% {Math.abs(upstreamBandPct - 100) > 0.01 ? '!' : '✓'}
                  </span>
                </div>
              </header>
              <div className="bund-v2-excavation-table">
                {upstreamBands.map((band, index) => (
                  <div className="bund-v2-excavation-row" key={band.id}>
                    {index < 4 ? <strong>{band.label}</strong> : (
                      <input
                        value={band.label}
                        aria-label="Excavation class"
                        onChange={(event) => patchUpstreamBands(upstreamBands.map((candidate) =>
                          candidate.id === band.id ? { ...candidate, label: event.target.value } : candidate
                        ))}
                      />
                    )}
                    <span className="bund-v2-percent-field">
                      <ToeNumberField
                        label=""
                        value={band.pct}
                        onCommit={(pct) => patchUpstreamBands(upstreamBands.map((candidate) =>
                          candidate.id === band.id ? { ...candidate, pct: Math.min(100, pct) } : candidate
                        ))}
                      />
                      <span>%</span>
                    </span>
                    <button
                      type="button"
                      className="btn ghost bund-v2-excavation-code"
                      onClick={() => setPicker(`ustoe-band:${band.id}`)}
                    >
                      {band.material.code ? (
                        <SsrCode code={band.material.code} description={band.material.description} />
                      ) : (
                        'Select code'
                      )}
                    </button>
                    <span>{n3((upstreamToeTotal * band.pct) / 100)} cu.m</span>
                    {index >= 4 ? (
                      <button
                        type="button"
                        className="bund-v2-icon-button"
                        aria-label={`Remove ${band.label || 'excavation'} code`}
                        onClick={() => patchUpstreamBands(upstreamBands.filter((candidate) => candidate.id !== band.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : <span />}
                    {picker === `ustoe-band:${band.id}` && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="excavation foundation"
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          patchUpstreamBands(upstreamBands.map((candidate) => candidate.id === band.id
                            ? { ...candidate, material: materialFromItem(item) }
                            : candidate
                          ))
                          setPicker(null)
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={() => patchUpstreamBands([
                  ...upstreamBands,
                  { id: `ustoe-${Date.now()}`, label: 'Other', pct: 0, material: { code: '' } }
                ])}
              >
                <Plus size={13} /> Add code
              </button>
            </section>

            <div className="bund-v2-anchorage-options">
              <span>Anchorage construction</span>
              <button
                type="button"
                className={`btn${data.upstreamToe.buildMaterial?.code === BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE ? ' primary' : ' ghost'}`}
                onClick={() => attachUpstreamToeMaterial('buildMaterial', BUND_DEFAULT_UPSTREAM_TOE_BUILD_CODE)}
              >
                M15 PCC
              </button>
              <button
                type="button"
                className={`btn${data.upstreamToe.buildMaterial?.code === BUND_UPSTREAM_TOE_MASONRY_CODE ? ' primary' : ' ghost'}`}
                onClick={() => attachUpstreamToeMaterial('buildMaterial', BUND_UPSTREAM_TOE_MASONRY_CODE)}
              >
                UCR masonry CM 1:4
              </button>
              <button type="button" className="btn ghost" onClick={() => setPicker('ustoe-build')}>
                <Pencil size={13} /> Custom code
              </button>
              {picker === 'ustoe-build' && (
                <MaterialPicker
                  initialCategory="IRR-DAW"
                  initialSearch="plain concrete works M-15"
                  onClose={() => setPicker(null)}
                  onPick={(item) => {
                    setUpstreamToeMaterial('buildMaterial', item)
                    setPicker(null)
                  }}
                />
              )}
            </div>

            {data.upstreamToe.buildMaterial ? (
              <div className="bund-v2-formula">
                Construction <SsrCode code={data.upstreamToe.buildMaterial.code} description={data.upstreamToe.buildMaterial.description} /> · full modelled
                toe section × Bund length → <strong>{n3(upstreamToeTotal)} cu.m</strong>
              </div>
            ) : (
              <div className="bund-v2-formula">
                Excavation only. Attach the approved PCC, masonry, or project-specific anchorage code.
              </div>
            )}
          </div>
        )}
      </section>}

      {chapter === 7 && <section className={`bund-v2-revetment-card bund-v2-rocktoe-card${data.rockToeMaterial ? ' is-enabled' : ''}`}>
        <label className="bund-v2-revetment-toggle">
          <input
            type="checkbox"
            checked={Boolean(data.rockToeMaterial)}
            onChange={(event) => event.target.checked
              ? enableRockToe()
              : onCommit((current) => ({
                  ...current,
                  rockToeMaterial: null,
                  rockToeFilterMaterial: null,
                  rockToeExcavationMaterial: null
                }))
            }
          />
          <span>Rock Toe</span>
        </label>
        <p>
          Rubble zone integrated into the lower downstream face for stability and free drainage.
          It follows the downstream toe at every chainage.
        </p>

        {data.rockToeMaterial && (
          <div className="bund-v2-rocktoe-details">
            <div className="bund-v2-rocktoe-layout">
              <div className="bund-v2-rocktoe-visual">
                <BundRockToeDiagram
                  topWidth={data.rockToeTopWidth}
                  innerSlope={data.rockToeInnerSlope}
                  outerSlope={rockToeFaceSlope}
                  height={rockToeDisplayHeight}
                  excavationDepth={rockToeExcavation && data.rockToeExcavationMaterial ? data.rockToeExcavationDepth : 0}
                  filterEnabled={Boolean(data.rockToeFilterMaterial)}
                />
              </div>
              <div className="bund-v2-rocktoe-controls">
                <ToeNumberField
                  label="Crest width (m)"
                  value={data.rockToeTopWidth}
                  onCommit={(rockToeTopWidth) => onCommit((current) => ({ ...current, rockToeTopWidth }))}
                />
                <ToeNumberField
                  label="Height (m)"
                  value={data.rockToeHeight}
                  onCommit={(rockToeHeight) => onCommit((current) => ({ ...current, rockToeHeight }))}
                />
                <ToeNumberField
                  label="Inner slope (H:1V)"
                  value={data.rockToeInnerSlope}
                  onCommit={(rockToeInnerSlope) => onCommit((current) => ({ ...current, rockToeInnerSlope }))}
                />
                <div className="bund-v2-rocktoe-code-line">
                  <SsrCode code={data.rockToeMaterial.code} description={data.rockToeMaterial.description} />
                  <span>{n3(rockToeTotal)} cu.m</span>
                  <button type="button" className="btn ghost" onClick={() => setPicker('rocktoe')}>
                    <Pencil size={13} /> Change code
                  </button>
                </div>
                {picker === 'rocktoe' && (
                  <MaterialPicker
                    initialCategory="IRR-DAW"
                    initialSearch="rock toe"
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      onCommit((current) => ({ ...current, rockToeMaterial: materialFromItem(item) }))
                      setPicker(null)
                    }}
                  />
                )}
                <label className="bund-v2-rocktoe-filter-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(data.rockToeFilterMaterial)}
                    onChange={(event) => event.target.checked
                      ? onCommit((current) => ({
                          ...current,
                          rockToeFilterMaterial: { code: BUND_DEFAULT_ROCKTOE_FILTER_CODE }
                        }))
                      : onCommit((current) => ({ ...current, rockToeFilterMaterial: null }))
                    }
                  />
                  Include graded filter below and behind the rock toe
                </label>
                {data.rockToeFilterMaterial && (
                  <div className="bund-v2-rocktoe-code-line">
                    <SsrCode code={data.rockToeFilterMaterial.code} description={data.rockToeFilterMaterial.description} />
                    <span>{n3(rockToeFilterTotal)} cu.m</span>
                    <button type="button" className="btn ghost" onClick={() => setPicker('rocktoe-filter')}>
                      <Pencil size={13} /> Filter code
                    </button>
                    {picker === 'rocktoe-filter' && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="filter below behind rock toe"
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          onCommit((current) => ({ ...current, rockToeFilterMaterial: materialFromItem(item) }))
                          setPicker(null)
                        }}
                      />
                    )}
                  </div>
                )}
                {rockToeExcavation && (
                  <>
                    <label className="bund-v2-rocktoe-filter-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(data.rockToeExcavationMaterial)}
                        onChange={(event) => event.target.checked
                          ? onCommit((current) => ({
                              ...current,
                              rockToeExcavationMaterial: { code: BUND_DEFAULT_FOUNDATION_EXC_CODE },
                              rockToeExcavationDepth: current.rockToeExcavationDepth > 0
                                ? current.rockToeExcavationDepth : 0.3
                            }))
                          : onCommit((current) => ({
                              ...current,
                              rockToeExcavationMaterial: null,
                              rockToeFilterMaterial: null
                            }))
                        }
                      />
                      Include rock-toe foundation excavation (section union)
                    </label>
                    {data.rockToeExcavationMaterial && (
                      <>
                        <div className="bund-v2-formula">
                          <strong>Excavation geometry · {n3(rockToeExcavationTotal)} cu.m</strong><br />
                          This is one geometric union, not base width × a fixed excavation depth. General bund cut under the rock-toe footprint transfers to this code; only the deeper rock-toe/filter bed cut is added. Turning excavation off also turns its dependent filter off.
                        </div>
                        <section className="bund-v2-excavation-classes">
                          <header>
                            <div>
                              <strong>Rock toe foundation</strong>
                              <small>Union of the general levelling cut under the rock-toe footprint and the additional rock-toe/filter bed cut.</small>
                            </div>
                            <div className="bund-v2-excavation-summary">
                              <strong>{n3(rockToeExcavationTotal)} cu.m</strong>
                              <span className={Math.abs(rockToeBandPct - 100) > 0.01 ? 'is-warning' : ''}>
                                {n3(rockToeBandPct)}% {Math.abs(rockToeBandPct - 100) > 0.01 ? '!' : '✓'}
                              </span>
                            </div>
                          </header>
                          <div className="bund-v2-excavation-table">
                            {rockToeBands.map((band, index) => (
                              <div className="bund-v2-excavation-row" key={band.id}>
                                {index < 4 ? <strong>{band.label}</strong> : (
                                  <input value={band.label} aria-label="Excavation class" onChange={(event) => patchRockToeBands(rockToeBands.map((candidate) => candidate.id === band.id ? { ...candidate, label: event.target.value } : candidate))} />
                                )}
                                <span className="bund-v2-percent-field">
                                  <ToeNumberField label="" value={band.pct} onCommit={(pct) => patchRockToeBands(rockToeBands.map((candidate) => candidate.id === band.id ? { ...candidate, pct: Math.min(100, pct) } : candidate))} />
                                  <span>%</span>
                                </span>
                                <button type="button" className="btn ghost bund-v2-excavation-code" onClick={() => setPicker(`rocktoe-band:${band.id}`)}>
                                  {band.material.code ? (
                                    <SsrCode code={band.material.code} description={band.material.description} />
                                  ) : (
                                    'Select code'
                                  )}
                                </button>
                                <span>{n3((rockToeExcavationTotal * band.pct) / 100)} cu.m</span>
                                {index >= 4 ? <button type="button" className="bund-v2-icon-button" aria-label={`Remove ${band.label || 'excavation'} code`} onClick={() => patchRockToeBands(rockToeBands.filter((candidate) => candidate.id !== band.id))}><Trash2 size={14} /></button> : <span />}
                                {picker === `rocktoe-band:${band.id}` && (
                                  <MaterialPicker initialCategory="IRR-DAW" initialSearch="excavation foundation" onClose={() => setPicker(null)} onPick={(item) => {
                                    patchRockToeBands(rockToeBands.map((candidate) => candidate.id === band.id ? { ...candidate, material: materialFromItem(item) } : candidate))
                                    setPicker(null)
                                  }} />
                                )}
                              </div>
                            ))}
                          </div>
                          <button type="button" className="btn ghost" onClick={() => patchRockToeBands([...rockToeBands, { id: `rocktoe-${Date.now()}`, label: 'Other', pct: 0, material: { code: '' } }])}>
                            <Plus size={13} /> Add code
                          </button>
                        </section>
                        <div className="bund-v2-formula">
                          The exposed outer face is locked to the downstream face the toe lands on, keeping the rock toe aligned with the proposed bund. Filter thickness below the toe is construction thickness, not a fixed payable excavation depth.
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="bund-v2-formula">
                  The exposed outer face follows the Bund downstream slope at the selected chainage.
                  Entered height is automatically limited where a lower downstream berm controls it.
                  {rockToeExcavation ? ' Repair work measures its rock-toe foundation cut separately.' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>}

      {chapter === 8 && <section className={`bund-v2-revetment-card bund-v2-filter-card${data.horizontalFilterMaterial ? ' is-enabled' : ''}`}>
        <label className="bund-v2-revetment-toggle">
          <input
            type="checkbox"
            checked={Boolean(data.horizontalFilterMaterial)}
            onChange={(event) => event.target.checked
              ? enableHorizontalFilter()
              : onCommit((current) => ({
                  ...current,
                  horizontalFilterMaterial: null,
                  verticalFilterMaterial: null
                }))
            }
          />
          <span>Horizontal Filter</span>
        </label>
        <p>
          Sand/gravel blanket below toe RL. Automatic length runs inward from the downstream toe,
          or from the rock toe&rsquo;s inner face when Rock Toe is enabled. A chimney stands on its
          inner end and remains connected to the blanket.
        </p>

        {data.horizontalFilterMaterial && (
          <div className="bund-v2-filter-details">
            <div className="bund-v2-filter-control-grid">
              <label className="bund-v2-field">
                <span>Length calculation</span>
                <select
                  value={data.horizontalFilterLengthMode}
                  onChange={(event) => {
                    const horizontalFilterLengthMode = event.target.value as 'auto' | 'manual'
                    onCommit((current) => ({
                      ...current,
                      horizontalFilterLengthMode,
                      horizontalFilterLength: horizontalFilterLengthMode === 'manual'
                        ? filterLength
                        : current.horizontalFilterLength
                    }))
                  }}
                >
                  <option value="auto">Auto — from Bund geometry</option>
                  <option value="manual">Manual entry</option>
                </select>
              </label>
              <ToeNumberField
                label={data.rockToeMaterial
                  ? 'Length inward from rock-toe inner face (m)'
                  : 'Length inward from D/S toe (m)'}
                value={filterLength}
                disabled={data.horizontalFilterLengthMode === 'auto'}
                onCommit={(horizontalFilterLength) => onCommit((current) => ({
                  ...current,
                  horizontalFilterLengthMode: 'manual',
                  horizontalFilterLength
                }))}
              />
              <ToeNumberField
                label="Code-fixed thickness (m)"
                value={horizontalThickness}
                disabled
                onCommit={() => undefined}
              />
            </div>

            <div className="bund-v2-filter-layout">
              <div className="bund-v2-filter-visual">
                <BundFilterDiagram
                  crestWidth={data.design.topWidth}
                  usSlope={data.design.usSlope}
                  dsSlope={data.design.dsSlope}
                  height={filterDiagramHeight}
                  blanketLength={filterLength}
                  blanketThickness={horizontalThickness}
                  chimneyOn={Boolean(data.verticalFilterMaterial)}
                  chimneyWidth={verticalWidth}
                  chimneyHeight={verticalHeight}
                  mwlRise={filterDiagramMwlRise}
                  rockToeOn={Boolean(data.rockToeMaterial)}
                  rockToeFilterOn={Boolean(data.rockToeFilterMaterial)}
                  rockToeTopWidth={data.rockToeTopWidth}
                  rockToeHeight={rockToeDisplayHeight}
                  rockToeInnerSlope={data.rockToeInnerSlope}
                  rockToeOuterSlope={rockToeFaceSlope}
                />
              </div>
              <div className="bund-v2-filter-options">
                <div className="bund-v2-rocktoe-code-line">
                  <SsrCode code={data.horizontalFilterMaterial.code} description={data.horizontalFilterMaterial.description} />
                  <span>
                    {n3(horizontalFilterTotal)}{' '}
                    {horizontalFilterMeasureType === 'area' ? 'sq.m' : 'cu.m'}
                  </span>
                  <button type="button" className="btn ghost" onClick={() => setPicker('hfilter')}>
                    <Pencil size={13} /> Change code
                  </button>
                </div>
                {picker === 'hfilter' && (
                  <MaterialPicker
                    initialCategory="IRR-DAW"
                    initialSearch="filter"
                    categoryLocked
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      onCommit((current) => ({ ...current, horizontalFilterMaterial: materialFromItem(item) }))
                      setPicker(null)
                    }}
                  />
                )}

                <div className="bund-v2-formula">
                  DAW filter choices remain restricted to the approved DAW filter chapter. The
                  selected item controls fixed dimensions wherever its SSR description specifies them.
                </div>

                <label className="bund-v2-rocktoe-filter-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(data.verticalFilterMaterial)}
                    onChange={(event) => event.target.checked
                      ? enableVerticalFilter()
                      : onCommit((current) => ({ ...current, verticalFilterMaterial: null }))
                    }
                  />
                  Add a vertical (chimney) filter on the blanket
                </label>

                {data.verticalFilterMaterial && (
                  <div className="bund-v2-chimney-controls">
                    <ToeNumberField
                      label="Code-fixed width (m)"
                      value={verticalWidth}
                      disabled
                      onCommit={() => undefined}
                    />
                    <ToeNumberField
                      label="Height (m, 0 = auto to MWL)"
                      value={data.verticalFilterHeight}
                      onCommit={(verticalFilterHeight) => onCommit((current) => ({
                        ...current,
                        verticalFilterHeight
                      }))}
                    />
                    <div className="bund-v2-rocktoe-code-line">
                      <SsrCode code={data.verticalFilterMaterial.code} description={data.verticalFilterMaterial.description} />
                      <span>
                        h {n3(verticalHeight)} m · {n3(verticalFilterTotal)}{' '}
                        {verticalFilterMeasureType === 'area' ? 'sq.m' : 'cu.m'}
                      </span>
                      <button type="button" className="btn ghost" onClick={() => setPicker('vfilter')}>
                        <Pencil size={13} /> Change code
                      </button>
                    </div>
                    {picker === 'vfilter' && (
                      <MaterialPicker
                        initialCategory="IRR-DAW"
                        initialSearch="filter"
                        categoryLocked
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          onCommit((current) => ({ ...current, verticalFilterMaterial: materialFromItem(item) }))
                          setPicker(null)
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>}

      {isZoned ? (
        <section className="bund-v2-optional-diagram-card bund-v2-hearting-drainage-card">
          <header>
            <div>
              <div className="bund-v2-panel-title">Zoned Embankment Cross-Section (Hearting Core &amp; Drainage)</div>
              <small>
                Full cross-section showing central impervious clay hearting core, outer casing shoulders, downstream rock toe, and filter interfaces. Seepage is contained within the clay core (no phreatic line breakout).
              </small>
            </div>
            <label className="bund-v2-diagram-section-select">
              <span>Diagram chainage</span>
              <select
                value={selected?.id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
                disabled={!sections.length}
              >
                {sections.map((section, index) => (
                  <option key={section.id} value={section.id}>
                    {index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)} m
                    {section.id === highest?.id ? ' · Highest' : ''}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <div className="bund-v2-full-section-canvas">
            <BundSectionDiagram data={data} section={selected} />
          </div>
          <div className="bund-v2-full-section-footer" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <div className="bund-v2-full-section-legend">
              <div className="bund-v2-full-section-legend-item">
                <span className="bund-v2-full-section-legend-swatch" style={{ background: '#3b82f6' }} />
                <span>Impervious Hearting Core (Clay)</span>
              </div>
              <div className="bund-v2-full-section-legend-item">
                <span className="bund-v2-full-section-legend-swatch" style={{ background: '#94a3b8' }} />
                <span>Outer Casing Shoulder (Pervious Fill)</span>
              </div>
              {data.rockToeMaterial && (
                <div className="bund-v2-full-section-legend-item">
                  <span className="bund-v2-full-section-legend-swatch" style={{ background: '#78716c' }} />
                  <span>D/S Rock Toe &amp; Filter Media</span>
                </div>
              )}
              {data.downstreamToe.excavationMaterial && (
                <div className="bund-v2-full-section-legend-item">
                  <span className="bund-v2-full-section-legend-swatch" style={{ background: '#0284c7' }} />
                  <span>Toe Drain</span>
                </div>
              )}
              <div className="bund-v2-full-section-legend-item">
                <span className="bund-v2-full-section-legend-swatch" style={{ background: '#64748b' }} />
                <span>Ground Profile</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        (chapter === 7 || chapter === 8) && (
          <section className="bund-v2-optional-diagram-card bund-v2-phreatic-card">
            <header>
              <div>
                <div className="bund-v2-panel-title">Bund &amp; Phreatic Line</div>
                <small>
                  The enabled rock toe, horizontal blanket and chimney filter are drawn in their
                  actual positions. Solid blue is the selected design; the dashed line is the plain
                  Bund reference without berms, rock toe, or filters.
                </small>
              </div>
              <label className="bund-v2-diagram-section-select">
                <span>Diagram chainage</span>
                <select
                  value={selected?.id ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                  disabled={!sections.length}
                >
                  {sections.map((section, index) => (
                    <option key={section.id} value={section.id}>
                      {index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)} m
                      {section.id === highest?.id ? ' · Highest' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            <div className="bund-v2-phreatic-diagram">
              <BundDrainageDiagram
                data={data}
                section={selected}
                referenceData={referencePhreaticData}
                referenceSection={selected}
              />
            </div>
          </section>
        )
      )}

      {chapter === 9 && data.design.berms.length > 0 && (
        <section className="bund-v2-revetment-card bund-v2-berm-protection-card">
          <div className="bund-v2-panel-title">Berm Catch-Water Drainage</div>
          <p>Enable and size drainage independently for each corresponding berm.</p>
          <div className="bund-v2-berm-columns">
            <section className="bund-v2-berm-face is-upstream">
              <header>
                <div>
                  <strong>Upstream Berms</strong>
                  <small>Left face</small>
                </div>
              </header>
              {data.design.berms.filter((berm) => berm.side === 'us').length === 0 ? (
                <div className="bund-v2-empty-state">No upstream berms.</div>
              ) : (
                <div className="bund-v2-berm-protection-list">
                  {data.design.berms
                    .filter((berm) => berm.side === 'us')
                    .map((berm) => (
                      <article key={berm.id} className="bund-v2-berm-protection-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(berm.drainExcavationMaterial || berm.drainLiningMaterial)}
                            onChange={(event) => toggleBermDrain(berm.id, event.target.checked)}
                          />
                          <strong>U/S berm · RL {n3(berm.level)}</strong>
                        </label>
                        <div className="bund-v2-berm-diagram">
                          <BundBermDiagram data={data} berm={berm} />
                        </div>
                        {(berm.drainExcavationMaterial || berm.drainLiningMaterial) && (
                          <div className="bund-v2-berm-drain-fields">
                            <ToeNumberField
                              label="Drain width (m)"
                              value={berm.drainWidth}
                              onCommit={(drainWidth) => patchBerm(berm.id, { drainWidth })}
                            />
                            <ToeNumberField
                              label="Drain depth (m)"
                              value={berm.drainDepth}
                              onCommit={(drainDepth) => patchBerm(berm.id, { drainDepth })}
                            />
                            <label className="bund-v2-field">
                              <span>Protection</span>
                              <select
                                value={!berm.drainLiningMaterial
                                  ? 'none'
                                  : berm.drainLiningMaterial.code === BUND_DEFAULT_BERM_DRAIN_STONE_CODE
                                    ? 'stone'
                                    : berm.drainLiningMaterial.code === BUND_DEFAULT_BERM_DRAIN_LINING_CODE
                                      ? 'concrete'
                                      : 'custom'}
                                onChange={(event) => selectBermDrainProtection(
                                  berm.id,
                                  event.target.value as 'none' | 'concrete' | 'stone'
                                )}
                              >
                                <option value="none">None</option>
                                <option value="concrete">M15 CC lining</option>
                                <option value="stone">Dry rubble pitching</option>
                                {berm.drainLiningMaterial &&
                                  ![BUND_DEFAULT_BERM_DRAIN_LINING_CODE, BUND_DEFAULT_BERM_DRAIN_STONE_CODE]
                                    .includes(berm.drainLiningMaterial.code) && (
                                    <option value="custom" disabled>Custom SSR code</option>
                                  )}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setPicker(`berm-drain:${berm.id}`)}
                            >
                              <Pencil size={13} /> Change protection code
                            </button>
                            {picker === `berm-drain:${berm.id}` && (
                              <MaterialPicker
                                initialCategory="IRR-CAW"
                                initialSearch="drain protection"
                                onClose={() => setPicker(null)}
                                onPick={(item) => {
                                  patchBerm(berm.id, { drainLiningMaterial: materialFromItem(item) })
                                  setPicker(null)
                                }}
                              />
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              )}
            </section>

            <section className="bund-v2-berm-face is-downstream">
              <header>
                <div>
                  <strong>Downstream Berms</strong>
                  <small>Right face</small>
                </div>
              </header>
              {data.design.berms.filter((berm) => berm.side === 'ds').length === 0 ? (
                <div className="bund-v2-empty-state">No downstream berms.</div>
              ) : (
                <div className="bund-v2-berm-protection-list">
                  {data.design.berms
                    .filter((berm) => berm.side === 'ds')
                    .map((berm) => (
                      <article key={berm.id} className="bund-v2-berm-protection-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(berm.drainExcavationMaterial || berm.drainLiningMaterial)}
                            onChange={(event) => toggleBermDrain(berm.id, event.target.checked)}
                          />
                          <strong>D/S berm · RL {n3(berm.level)}</strong>
                        </label>
                        <div className="bund-v2-berm-diagram">
                          <BundBermDiagram data={data} berm={berm} />
                        </div>
                        {(berm.drainExcavationMaterial || berm.drainLiningMaterial) && (
                          <div className="bund-v2-berm-drain-fields">
                            <ToeNumberField
                              label="Drain width (m)"
                              value={berm.drainWidth}
                              onCommit={(drainWidth) => patchBerm(berm.id, { drainWidth })}
                            />
                            <ToeNumberField
                              label="Drain depth (m)"
                              value={berm.drainDepth}
                              onCommit={(drainDepth) => patchBerm(berm.id, { drainDepth })}
                            />
                            <label className="bund-v2-field">
                              <span>Protection</span>
                              <select
                                value={!berm.drainLiningMaterial
                                  ? 'none'
                                  : berm.drainLiningMaterial.code === BUND_DEFAULT_BERM_DRAIN_STONE_CODE
                                    ? 'stone'
                                    : berm.drainLiningMaterial.code === BUND_DEFAULT_BERM_DRAIN_LINING_CODE
                                      ? 'concrete'
                                      : 'custom'}
                                onChange={(event) => selectBermDrainProtection(
                                  berm.id,
                                  event.target.value as 'none' | 'concrete' | 'stone'
                                )}
                              >
                                <option value="none">None</option>
                                <option value="concrete">M15 CC lining</option>
                                <option value="stone">Dry rubble pitching</option>
                                {berm.drainLiningMaterial &&
                                  ![BUND_DEFAULT_BERM_DRAIN_LINING_CODE, BUND_DEFAULT_BERM_DRAIN_STONE_CODE]
                                    .includes(berm.drainLiningMaterial.code) && (
                                    <option value="custom" disabled>Custom SSR code</option>
                                  )}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setPicker(`berm-drain:${berm.id}`)}
                            >
                              <Pencil size={13} /> Change protection code
                            </button>
                            {picker === `berm-drain:${berm.id}` && (
                              <MaterialPicker
                                initialCategory="IRR-CAW"
                                initialSearch="drain protection"
                                onClose={() => setPicker(null)}
                                onPick={(item) => {
                                  patchBerm(berm.id, { drainLiningMaterial: materialFromItem(item) })
                                  setPicker(null)
                                }}
                              />
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              )}
            </section>
          </div>
        </section>
      )}

      {chapter === 9 && (
        <section className={`bund-v2-revetment-card bund-v2-drain-card${downstreamToeEnabled ? ' is-enabled' : ''}`}>
          <label className="bund-v2-revetment-toggle">
            <input
              type="checkbox"
              checked={downstreamToeEnabled}
              onChange={(event) => event.target.checked
                ? enableDownstreamToe()
                : patchDownstreamToe({ excavationMaterial: null, buildMaterial: null })
              }
            />
            <span>Toe Drain</span>
          </label>
          <p>
            Seepage-collection trench at the downstream toe, with optional rubble revetment or
            cement-concrete lining. The drain is generated at every chainage that has a D/S toe RL.
          </p>

          {downstreamToeEnabled && (
            <div className="bund-v2-drain-details">
              <div className="bund-v2-drain-workspace">
                <div className="bund-v2-single-detail-diagram bund-v2-single-drain-diagram">
                  <BundToeDiagram
                    topWidth={selectedDrainTopWidth}
                    bottomWidth={data.downstreamToe.bottomWidth}
                    depth={selectedDrainDepth}
                    leftSlope={selectedDrainInvert != null ? data.downstreamToe.leftSlope : undefined}
                    rightSlope={selectedDrainInvert != null ? data.downstreamToe.rightSlope : undefined}
                    bermWidth={data.downstreamToe.bermWidth}
                    lined={Boolean(data.downstreamToe.buildMaterial)}
                  />
                </div>
                <div className="bund-v2-drain-parameter-panel">
                  <label className="bund-v2-field bund-v2-drain-chainage">
                    <span>Design section</span>
                    <select
                      value={selected?.id ?? ''}
                      onChange={(event) => setSelectedId(event.target.value)}
                      disabled={!sections.length}
                    >
                      {sections.map((section, index) => (
                        <option key={section.id} value={section.id}>
                          {index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)} m
                          {section.id === highest?.id ? ' · Highest' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="bund-v2-drain-control-grid">
                <label className="bund-v2-field">
                  <span>Invert RL calculation</span>
                  <select
                    value={data.downstreamToe.invertMode ?? ''}
                    onChange={(event) => {
                      const invertMode = event.target.value as 'auto' | 'manual'
                      patchDownstreamToe({
                        invertMode,
                        invertLevel: invertMode === 'manual'
                          ? (selectedDrainInvert ?? automaticDrainInvert)
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
                <ToeNumberField
                  label="Toe-drain bottom / invert RL"
                  value={data.downstreamToe.invertMode === 'auto'
                    ? (automaticDrainInvert ?? 0)
                    : (data.downstreamToe.invertLevel ?? 0)}
                  disabled={data.downstreamToe.invertMode === 'auto'}
                  onCommit={(invertLevel) => patchDownstreamToe({
                    invertMode: 'manual',
                    invertLevel,
                    invertStartLevel: null,
                    invertEndLevel: null
                  })}
                />
                <ToeNumberField
                  label="Base width at invert (m)"
                  value={data.downstreamToe.bottomWidth}
                  onCommit={(bottomWidth) => patchDownstreamToe({ bottomWidth })}
                />
                <ToeNumberField
                  label="Left side slope (H:1V)"
                  value={data.downstreamToe.leftSlope}
                  onCommit={(leftSlope) => patchDownstreamToe({ leftSlope })}
                />
                <ToeNumberField
                  label="Right side slope (H:1V)"
                  value={data.downstreamToe.rightSlope}
                  onCommit={(rightSlope) => patchDownstreamToe({ rightSlope })}
                />
                <ToeNumberField
                  label="Berm width on each side (m)"
                  value={data.downstreamToe.bermWidth}
                  onCommit={(bermWidth) => patchDownstreamToe({ bermWidth })}
                />
                  </div>

                  <div className="bund-v2-formula bund-v2-drain-summary">
                    {selected && selectedDrainInvert != null ? (
                      <>
                        Invert RL <strong>{n3(selectedDrainInvert)}</strong> · depth{' '}
                        <strong>{n3(selectedDrainDepth)} m</strong> · top width{' '}
                        <strong>{n3(selectedDrainTopWidth)} m</strong> · excavation{' '}
                        <strong>{n3(selectedDrainArea)} m²</strong>
                      </>
                    ) : (
                      <>Enter D/S toe levels to calculate the drain geometry.</>
                    )}
                  </div>

                  {downstreamDrainPlatform && (
                    <div className="bund-v2-drain-note">
                      Formed at proposed D/S toe RL <strong>{n3(downstreamDrainPlatform.level)}</strong>.
                      Clear berm: {n3(data.downstreamToe.bermWidth)} m each side.
                    </div>
                  )}
                </div>
              </div>

              <section className="bund-v2-excavation-classes">
                <header>
                  <div>
                    <strong>D/S toe drain excavation</strong>
                    <small>Variable-depth seepage-collection trench, classified with CAW drain excavation.</small>
                  </div>
                  <div className="bund-v2-excavation-summary">
                    <strong>{n3(downstreamToeTotal)} cu.m</strong>
                    <span className={Math.abs(downstreamBandPct - 100) > 0.01 ? 'is-warning' : ''}>
                      {n3(downstreamBandPct)}% {Math.abs(downstreamBandPct - 100) > 0.01 ? '!' : '✓'}
                    </span>
                  </div>
                </header>
                <div className="bund-v2-excavation-table">
                  {downstreamBands.map((band, index) => (
                    <div className="bund-v2-excavation-row" key={band.id}>
                      {index < 4 ? <strong>{band.label}</strong> : (
                        <input
                          value={band.label}
                          aria-label="Drain excavation class"
                          onChange={(event) => patchDownstreamBands(downstreamBands.map((candidate) =>
                            candidate.id === band.id ? { ...candidate, label: event.target.value } : candidate
                          ))}
                        />
                      )}
                      <span className="bund-v2-percent-field">
                        <ToeNumberField
                          label=""
                          value={band.pct}
                          onCommit={(pct) => patchDownstreamBands(downstreamBands.map((candidate) =>
                            candidate.id === band.id ? { ...candidate, pct: Math.min(100, pct) } : candidate
                          ))}
                        />
                        <span>%</span>
                      </span>
                      <button
                        type="button"
                        className="btn ghost bund-v2-excavation-code"
                        onClick={() => setPicker(`dstoe-band:${band.id}`)}
                      >
                        {band.material.code ? (
                          <SsrCode code={band.material.code} description={band.material.description} />
                        ) : (
                          'Select code'
                        )}
                      </button>
                      <span>{n3((downstreamToeTotal * band.pct) / 100)} cu.m</span>
                      {index >= 4 ? (
                        <button
                          type="button"
                          className="bund-v2-icon-button"
                          aria-label={`Remove ${band.label || 'drain excavation'} code`}
                          onClick={() => patchDownstreamBands(downstreamBands.filter((candidate) => candidate.id !== band.id))}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : <span />}
                      {picker === `dstoe-band:${band.id}` && (
                        <MaterialPicker
                          initialCategory="IRR-CAW"
                          initialSearch="drain excavation"
                          onClose={() => setPicker(null)}
                          onPick={(item) => {
                            patchDownstreamBands(downstreamBands.map((candidate) => candidate.id === band.id
                              ? { ...candidate, material: materialFromItem(item) }
                              : candidate
                            ))
                            setPicker(null)
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => patchDownstreamBands([
                    ...downstreamBands,
                    { id: `dstoe-${Date.now()}`, label: 'Other', pct: 0, material: { code: '' } }
                  ])}
                >
                  <Plus size={13} /> Add code
                </button>
              </section>

              <label className="bund-v2-rocktoe-filter-toggle bund-v2-drain-protection-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(data.downstreamToe.buildMaterial)}
                  onChange={(event) => event.target.checked
                    ? attachDownstreamToeMaterial('buildMaterial', BUND_DEFAULT_TOE_BUILD_CODE, 0.225)
                    : patchDownstreamToe({ buildMaterial: null })
                  }
                />
                Include bed-and-side protection in the trench
              </label>

              {data.downstreamToe.buildMaterial && (
                <div className="bund-v2-drain-protection">
                  <div className="bund-v2-anchorage-options">
                    <span>Toe-drain protection</span>
                    <button
                      type="button"
                      className={`btn${data.downstreamToe.buildMaterial.code === BUND_DEFAULT_TOE_BUILD_CODE ? ' primary' : ' ghost'}`}
                      onClick={() => attachDownstreamToeMaterial('buildMaterial', BUND_DEFAULT_TOE_BUILD_CODE, 0.225)}
                    >
                      225 mm rubble revetment (maintenance)
                    </button>
                    <button
                      type="button"
                      className={`btn${data.downstreamToe.buildMaterial.code === BUND_DEFAULT_TOE_CC_CODE ? ' primary' : ' ghost'}`}
                      onClick={() => attachDownstreamToeMaterial('buildMaterial', BUND_DEFAULT_TOE_CC_CODE, 0.1)}
                    >
                      100 mm M15 CC lining
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setPicker('dstoe-build')}>
                      <Pencil size={13} /> Custom code
                    </button>
                    {picker === 'dstoe-build' && (
                      <MaterialPicker
                        initialCategory="IRR-CAW"
                        initialSearch="toe drain protection"
                        onClose={() => setPicker(null)}
                        onPick={(item) => {
                          setDownstreamToeMaterial('buildMaterial', item)
                          setPicker(null)
                        }}
                      />
                    )}
                  </div>
                  <div className="bund-v2-formula">
                    <SsrCode code={data.downstreamToe.buildMaterial.code} description={data.downstreamToe.buildMaterial.description} /> · developed width{' '}
                    {n3(selectedDrainDevelopedWidth)} m at the selected section; variable-width MSA →{' '}
                    <strong>{n3(downstreamBuildMeasurement.quantity)}</strong>{' '}
                    {downstreamBuildMeasurement.measure === 'volume' ? 'cu.m' : 'sq.m'}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {chapter === 10 && (
        <section className={`bund-v2-revetment-card bund-v2-chute-card${data.chuteDrainLiningMaterial ? ' is-enabled' : ''}`}>
          <label className="bund-v2-revetment-toggle">
            <input
              type="checkbox"
              checked={Boolean(data.chuteDrainLiningMaterial)}
              onChange={(event) => event.target.checked
                ? enableChuteDrains()
                : onCommit((current) => ({
                    ...current,
                    chuteDrainLiningMaterial: null,
                    chuteDrainExcavationMaterial: null
                  }))
              }
            />
            <span>Downstream Chute Drains</span>
          </label>
          <p>
            Protected channels carry runoff from the crest and berm catch-water drains down the
            downstream face. Developed length is calculated at each chute chainage.
          </p>

          {data.chuteDrainLiningMaterial && (
            <div className="bund-v2-chute-workspace">
              <div className="bund-v2-chute-controls">
                <label className="bund-v2-field">
                  <span>Channel protection</span>
                  <select
                    value={data.chuteDrainProtectionType}
                    onChange={(event) => setChuteProtectionType(
                      event.target.value as BundData['chuteDrainProtectionType']
                    )}
                  >
                    <option value="concrete">Concrete lining</option>
                    <option value="stone">Stone pitching / masonry</option>
                  </select>
                </label>
                <label className="bund-v2-rocktoe-filter-toggle">
                  <input
                    type="checkbox"
                    checked={data.chuteDrainUseSpacing}
                    onChange={(event) => onCommit((current) => ({
                      ...current,
                      chuteDrainUseSpacing: event.target.checked
                    }))}
                  />
                  Calculate number of chutes from spacing
                </label>
                <div className="bund-v2-chute-field-grid">
                  {data.chuteDrainUseSpacing ? (
                    <ToeNumberField label="Spacing (m)" value={data.chuteDrainSpacing}
                      onCommit={(chuteDrainSpacing) => onCommit((current) => ({ ...current, chuteDrainSpacing }))} />
                  ) : (
                    <ToeNumberField label="Number of chutes" value={data.chuteDrainCount}
                      onCommit={(chuteDrainCount) => onCommit((current) => ({ ...current, chuteDrainCount }))} />
                  )}
                  <ToeNumberField label="Clear width (m)" value={data.chuteDrainWidth}
                    onCommit={(chuteDrainWidth) => onCommit((current) => ({ ...current, chuteDrainWidth }))} />
                  <ToeNumberField label="Depth (m)" value={data.chuteDrainDepth}
                    onCommit={(chuteDrainDepth) => onCommit((current) => ({ ...current, chuteDrainDepth }))} />
                  {chuteProtection.measure === 'volume' && (
                    <ToeNumberField label="Lining thickness (m)" value={data.chuteDrainLiningThickness}
                      onCommit={(chuteDrainLiningThickness) => onCommit((current) => ({ ...current, chuteDrainLiningThickness }))} />
                  )}
                </div>
                <div className="bund-v2-rocktoe-code-line">
                  <SsrCode code={data.chuteDrainLiningMaterial.code} description={data.chuteDrainLiningMaterial.description} />
                  <span>{n3(chuteProtection.quantity)} {chuteProtection.measure === 'area' ? 'sq.m' : 'cu.m'}</span>
                  <button type="button" className="btn ghost" onClick={() => setPicker('chute-lining')}>
                    <Pencil size={13} /> Change protection code
                  </button>
                </div>
                {picker === 'chute-lining' && (
                  <MaterialPicker
                    initialCategory="IRR-CAW"
                    initialSearch={data.chuteDrainProtectionType === 'stone' ? 'rubble stone pitching' : 'M15 lining'}
                    onClose={() => setPicker(null)}
                    onPick={(item) => {
                      onCommit((current) => ({ ...current, chuteDrainLiningMaterial: materialFromItem(item) }))
                      setPicker(null)
                    }}
                  />
                )}
                <div className="bund-v2-inline-summary">
                  <span><strong>{chuteRows.length}</strong> chute{chuteRows.length === 1 ? '' : 's'}</span>
                  <span><strong>{n3(chuteLength)}</strong> m developed length</span>
                  <span><strong>{n3(chuteExcavation)}</strong> cu.m excavation</span>
                </div>
              </div>
              <div className="bund-v2-single-detail-diagram">
                <BundChuteDiagram
                  width={data.chuteDrainWidth}
                  depth={data.chuteDrainDepth}
                  liningThickness={data.chuteDrainLiningThickness}
                  protection={data.chuteDrainProtectionType}
                  lined
                />
              </div>
            </div>
          )}
        </section>
      )}

    </section>
  )
}
