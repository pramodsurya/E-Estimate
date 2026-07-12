import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { Check, MapPin, Plus, Printer, RefreshCcw, Route, Settings, Trash2 } from 'lucide-react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  calculateLeadVariantCharge,
  conveyanceClassLabel,
  fetchSsrLeadApplicability,
  loadingUnloadingCautionForBreakdown,
  LOADING_UNLOADING_CAUTION,
  type LeadChargeBreakdown,
  type LeadHandlingMode
} from '../../lib/lead'
import {
  basisForData,
  canonicalLeadConveyanceClass,
  isEligibleForLead,
  liftInfoForData,
  materialRefsForLeadInfo,
  parseLeadInfo,
  quantityForVariant,
  isDisposalLeadMaterial
} from '../../lib/leadApplicability'
import { calculateRateAnalysis, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { collectProjectItemGroups, type ProjectItemGroup } from '../../lib/projectItems'
import { newId } from '../../lib/tree'
import { useStore } from '../../store/useStore'
import LeadPrintPreviewModal from './LeadPrintPreviewModal'
import LeadMapDirectionEditor, {
  blankLeadMapDirectionDraft,
  draftFromLeadMapDirection,
  type LeadMapDirectionDraft
} from './LeadMapDirectionEditor'
import type {
  ConveyanceClass,
  LeadChargeCode,
  LeadApplication,
  LeadAssignment,
  LeadMapDirection,
  LeadPoint,
  LeadPointKind,
  LeadRateCalculationDetail,
  LeadRoadCondition,
  LeadVariant,
  ProjectNode,
  ProjectLocation
} from '../../types/project'

const TELANGANA_CENTER: [number, number] = [17.9, 79.6]

function leadMapPinIcon(label: string, color: string, className = ''): L.DivIcon {
  return L.divIcon({
    className: `lead-map-logo-pin ${className}`,
    html: `<span style="background:${color}"><b>${label}</b></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42]
  })
}

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const km = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3
})

const metre = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2
})

const POINT_KINDS: Array<{ value: LeadPointKind; label: string }> = [
  { value: 'quarry', label: 'Quarry' },
  { value: 'sand_reach', label: 'Sand reach' },
  { value: 'godown', label: 'Godown' },
  { value: 'stockyard', label: 'Stockyard' },
  { value: 'water', label: 'Water source' },
  { value: 'other', label: 'Other' }
]

const HANDLING_OPTIONS: Array<{ value: Exclude<LeadHandlingMode, 'none'>; label: string }> = [
  { value: 'manual_with_idle', label: 'Manual + idle hire (COM-LDLFT-4)' },
  { value: 'manual_no_idle', label: 'Manual only (COM-LDLFT-3)' },
  { value: 'mechanical', label: 'Machine loading (COM-LDLFT-5)' }
]

const CHARGE_OPTIONS: Array<{ value: LeadChargeCode; label: string }> = [
  { value: 'AUTO', label: 'Auto from checklist' },
  { value: 'COM-LDLFT-1', label: 'COM-LDLFT-1 Head load' },
  { value: 'COM-LDLFT-2', label: 'COM-LDLFT-2 Mechanical lead' },
  { value: 'COM-LDLFT-3', label: 'COM-LDLFT-3 Manual L/U' },
  { value: 'COM-LDLFT-4', label: 'COM-LDLFT-4 Manual L/U + idle' },
  { value: 'COM-LDLFT-5', label: 'COM-LDLFT-5 Mechanical L/U' },
  { value: 'COM-LDLFT-6', label: 'COM-LDLFT-6 Lift' }
]

const MANUAL_CHARGE_OPTIONS = CHARGE_OPTIONS.filter((option) => option.value !== 'AUTO')

const DISPOSAL_CLASS_OPTIONS: Array<{ value: ConveyanceClass; label: string }> = [
  { value: 'EARTH', label: 'Earth / soil / muck' },
  { value: 'STONE', label: 'Rock / stone / boulder' }
]

interface SourceDraft {
  code: string
  name: string
  kind: LeadPointKind
  role: 'start' | 'end'
  lat: string
  lon: string
}

type LeadSelectablePoint = LeadPoint & { deletable?: boolean }

interface VariantDraft {
  variantName: string
  startPointId: string
  endPointId: string
  distanceMode: 'auto' | 'manual'
  ruleMode: 'auto' | 'manual'
  chargeCode: LeadChargeCode
  conveyanceClass: ConveyanceClass
  roadCondition: LeadRoadCondition
  ghatSegmentKm: string
  ceSegmentKm: string
  ceMultiplier: string
  mechanicalConveyanceReachesFinalPoint: 'yes' | 'no'
  leadKm: string
  liftM: string
  handlingMode: LeadHandlingMode
}

interface TargetPreview {
  group: ProjectItemGroup
  quantitySource: string
  breakdown: LeadChargeBreakdown
  baseFinalAmount: number
  finalAmount: number
  finalRate: number
}

interface SplitDraft {
  group: ProjectItemGroup
  name: string
}

interface LeadOverrideDraft {
  group: ProjectItemGroup
  deliveryAtSite: boolean
  loadingUnloading: boolean
  reason: string
  otherReason: string
}

const DELIVERY_AT_SITE_WARNING =
  'Cement/steel basic rate is normally delivery at site. External lead may duplicate transport already included in the material rate.'

const PROJECT_WORK_POINT_ID = '__project_work_location__'
const NODE_POINT_PREFIX = 'node:'

const DELIVERY_AT_SITE_OVERRIDE_REASONS = [
  'Rate adopted is ex-godown / ex-market / ex-factory',
  'Separate stockyard to work-front movement',
  'Approved special case',
  'Other'
]

const LOADING_UNLOADING_OVERRIDE_REASONS = [
  'Separate loading/unloading operation not covered by DATA',
  'Separate stockyard or intermediate handling',
  'Approved special case',
  'Other'
]

const COMBINED_OVERRIDE_REASONS = [
  'Separately sanctioned movement and handling not covered by DATA',
  'Rate adopted excludes this transport/handling',
  'Approved special case',
  'Other'
]

function isDeliveryAtSiteMaterial(conveyanceClass: ConveyanceClass): boolean {
  return conveyanceClass === 'CEMENT' || conveyanceClass === 'STEEL'
}

function needsDeliveryAtSiteOverride(variant: LeadVariant | null | undefined): boolean {
  if (!variant) return false
  return isDeliveryAtSiteMaterial(variant.conveyanceClass) && variant.leadKm > 0.15
}

function needsLoadingUnloadingOverride(variant: LeadVariant | null | undefined): boolean {
  return Boolean(variant && variant.handlingMode !== 'none')
}

function overrideReasonsFor(deliveryAtSite: boolean, loadingUnloading: boolean): string[] {
  if (deliveryAtSite && loadingUnloading) return COMBINED_OVERRIDE_REASONS
  if (loadingUnloading) return LOADING_UNLOADING_OVERRIDE_REASONS
  return DELIVERY_AT_SITE_OVERRIDE_REASONS
}

export default function LeadDetailDashboard(): JSX.Element {
  const project = useStore((state) => state.project)
  const selection = useStore((state) => state.leadSelection)
  const closeLeadMaterial = useStore((state) => state.closeLeadMaterial)
  const upsertPoint = useStore((state) => state.upsertLeadPoint)
  const removePoint = useStore((state) => state.removeLeadPoint)
  const upsertAssignment = useStore((state) => state.upsertLeadAssignment)
  const upsertVariant = useStore((state) => state.upsertLeadVariant)
  const removeVariant = useStore((state) => state.removeLeadVariant)
  const upsertApplication = useStore((state) => state.upsertLeadApplication)
  const removeApplication = useStore((state) => state.removeLeadApplication)
  const upsertMapDirection = useStore((state) => state.upsertLeadMapDirection)
  const removeMapDirection = useStore((state) => state.removeLeadMapDirection)
  const updateLeadPrintSettings = useStore((state) => state.updateLeadPrintSettings)
  const splitDataItem = useStore((state) => state.splitDataItem)
  const openRateAnalysis = useStore((state) => state.openRateAnalysis)

  const chart = project?.leadChart ?? { points: [], assignments: [], itemChoices: [] }
  const points = chart.points ?? []
  const assignments = chart.assignments ?? []
  const variants = chart.variants ?? []
  const applications = chart.applications ?? []
  const mapDirections = chart.mapDirections ?? []
  const printSettings = chart.printSettings
  const site = project?.meta.location ?? null

  const materialName = selection?.materialName ?? ''
  const conveyanceClass = (selection?.conveyanceClass as ConveyanceClass | undefined) ?? 'CEMENT'
  const disposalLead = isDisposalLeadMaterial(materialName)
  const materialVariants = useMemo(
    () =>
      variants
        .map((variant) => ({
          ...variant,
          conveyanceClass: canonicalLeadConveyanceClass(variant.materialName, variant.conveyanceClass)
        }))
        .filter((variant) =>
          variant.materialName.toLowerCase() === materialName.toLowerCase() &&
          (disposalLead || variant.conveyanceClass === conveyanceClass)
        ),
    [conveyanceClass, disposalLead, materialName, variants]
  )
  const materialAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          (disposalLead ||
            (assignment.conveyanceClass &&
              canonicalLeadConveyanceClass(materialName, assignment.conveyanceClass) ===
                conveyanceClass)) &&
          (disposalLead
            ? assignment.materialCode === materialName
            : !assignment.materialCode || assignment.materialCode === materialName)
      ),
    [assignments, conveyanceClass, disposalLead, materialName]
  )

  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(() =>
    blankSourceDraft(points, materialName, isDisposalLeadMaterial(selection?.materialName ?? ''))
  )
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(() =>
    blankVariantDraft(isDisposalLeadMaterial(selection?.materialName ?? ''))
  )
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<Map<string, unknown>>(new Map())
  const [variantBreakdowns, setVariantBreakdowns] = useState<Record<string, LeadChargeBreakdown>>({})
  const [splitDraft, setSplitDraft] = useState<SplitDraft | null>(null)
  const [overrideDraft, setOverrideDraft] = useState<LeadOverrideDraft | null>(null)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [mapEditingOpen, setMapEditingOpen] = useState(false)
  const [directionDraft, setDirectionDraft] = useState<LeadMapDirectionDraft>(() =>
    blankLeadMapDirectionDraft()
  )
  const [directionDrawing, setDirectionDrawing] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const groups = useMemo(
    () => (project ? collectProjectItemGroups(project.root) : []),
    [project]
  )
  const workPoints = useMemo(
    () => (project ? collectWorkLocationPoints(project.root, project.meta.location) : []),
    [project?.root, project?.meta.location]
  )
  const variantPointOptions = useMemo<LeadSelectablePoint[]>(
    () => uniqueSelectablePoints([
      ...workPoints,
      ...points.map((point) => ({ ...point, deletable: true }))
    ]),
    [points, workPoints]
  )
  const pointsById = useMemo(
    () => new Map(variantPointOptions.map((point) => [point.id, point])),
    [variantPointOptions]
  )
  const selectedVariant =
    materialVariants.find((variant) => variant.id === selectedVariantId) ?? materialVariants[0] ?? null
  const selectedMaterialIsDeliveryAtSite =
    !disposalLead && isDeliveryAtSiteMaterial(conveyanceClass)
  const selectedVariantNeedsDeliveryOverride = needsDeliveryAtSiteOverride(selectedVariant)
  const selectedVariantNeedsLoadingUnloadingOverride = needsLoadingUnloadingOverride(selectedVariant)
  const selectedVariantNeedsAnyOverride =
    selectedVariantNeedsDeliveryOverride || selectedVariantNeedsLoadingUnloadingOverride
  const showDeliveryAtSiteNotice =
    selectedVariantNeedsDeliveryOverride || (selectedMaterialIsDeliveryAtSite && !selectedVariant)
  const availableGroups = groups.filter((group) =>
    materialInGroup(group, metadata.get(group.code), materialName, conveyanceClass, disposalLead)
  )
  const applyableGroups = selectedVariant
    ? availableGroups.filter((group) =>
        isEligibleForLead(group, selectedVariant, parseLeadInfo(metadata.get(group.code)))
      )
    : []
  const eligibleGroups = disposalLead
    ? availableGroups
    : selectedVariant
      ? applyableGroups.length > 0
        ? applyableGroups
        : availableGroups
      : availableGroups
  const eligibleMismatch =
    !disposalLead && selectedVariant && applyableGroups.length === 0 && availableGroups.length > 0
  const materialApplications = applications.filter((application) =>
    materialVariants.some((variant) => variant.id === application.variantId)
  )
  const draftRuleLabels = disposalLead
    ? disposalRuleLabelsForLeadKm(equivalentLeadKmForDraft(variantDraft))
    : ruleLabelsForDraft(variantDraft)
  const draftActualLeadKm = numeric(variantDraft.leadKm) ?? 0
  const draftLeadKm = equivalentLeadKmForDraft(variantDraft)
  const draftLiftM = numeric(variantDraft.liftM) ?? 0
  const draftLiftApplies = draftRuleLabels.includes('COM-LDLFT-6')
  const selectedVariantBreakdown = selectedVariant ? variantBreakdowns[selectedVariant.id] : null
  const selectedLoadingUnloadingCaution = selectedVariant
    ? selectedVariantBreakdown
      ? loadingUnloadingCautionForBreakdown(selectedVariantBreakdown, selectedVariant.handlingMode)
      : selectedVariant.handlingMode !== 'none'
        ? LOADING_UNLOADING_CAUTION
        : ''
    : ''

  useEffect(() => {
    if (!selectedVariantId && materialVariants.length) setSelectedVariantId(materialVariants[0].id)
  }, [materialVariants, selectedVariantId])

  useEffect(() => {
    if (directionDraft.variantId || directionDraft.points.length || directionDraft.id) return
    setDirectionDraft(blankLeadMapDirectionDraft(materialVariants[0]))
  }, [directionDraft.id, directionDraft.points.length, directionDraft.variantId, materialVariants])

  useEffect(() => {
    setSourceDraft(blankSourceDraft(points, materialName, disposalLead))
    setVariantDraft(blankVariantDraft(disposalLead))
    setSelectedVariantId(selection?.variantId ?? '')
    setSelectedTargetKeys(new Set())
    setVariantBreakdowns({})
    setNotice('')
    setError('')
  }, [materialName, conveyanceClass])

  useEffect(() => {
    if (!project) return
    const codes = groups
      .filter((group) => group.source === 'SSR')
      .map((group) => group.code)
    if (!codes.length) {
      setMetadata(new Map())
      return
    }
    let cancelled = false
    void fetchSsrLeadApplicability(codes)
      .then((items) => {
        if (cancelled) return
        const next = new Map<string, unknown>()
        for (const [code, item] of items) next.set(code, item.lead_applicability)
        setMetadata(next)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Lead metadata failed.')
      })
    return () => {
      cancelled = true
    }
  }, [project?.id, groups])

  useEffect(() => {
    if (variantDraft.distanceMode !== 'auto') return
    const start = pointLocationForId(variantDraft.startPointId, pointsById, site)
    const end = pointLocationForId(variantDraft.endPointId, pointsById, site)
    if (!start || !end) return
    const distance = haversineKm(start.lat, start.lng, end.lat, end.lng)
    setVariantDraft((current) => ({ ...current, leadKm: String(roundKm(distance)) }))
  }, [
    variantDraft.distanceMode,
    variantDraft.startPointId,
    variantDraft.endPointId,
    pointsById,
    site
  ])

  useEffect(() => {
    if (!project || materialVariants.length === 0) {
      setVariantBreakdowns({})
      return
    }
    let cancelled = false
    void Promise.all(
      materialVariants.map(async (variant) => {
        const breakdown = await calculateLeadVariantCharge({
          year: project.meta.sorYear,
          conveyanceClass: variant.conveyanceClass,
          distanceKm: variant.leadKm,
          quantity: 1,
          liftM: variant.liftM,
          includedInitialLiftM: 3,
          includesAllLifts: false,
          mechanicalConveyanceReachesFinalPoint:
            variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
          handlingMode: variant.handlingMode,
          materialName: variant.materialName,
          includedBasis: 'none',
          customGrossRate: variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
          chargeCode: variant.chargeCode
        })
        return [variant.id, breakdown] as const
      })
    )
      .then((entries) => {
        if (cancelled) return
        setVariantBreakdowns(Object.fromEntries(entries))
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load variant calculation.')
      })
    return () => {
      cancelled = true
    }
  }, [materialVariants, project?.meta.sorYear])

  if (!project || !selection) {
    return (
      <div className="rate-state">
        Select a material from the Lead tab to open its Lead/Lift details.
      </div>
    )
  }

  const addSource = (): void => {
    const code = sourceDraft.code.trim().toUpperCase()
    const lat = Number(sourceDraft.lat)
    const lon = Number(sourceDraft.lon)
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError('Pick a map point and enter a source code.')
      return
    }
    const point: LeadPoint = {
      id: newId(),
      code,
      name: sourceDraft.name.trim(),
      kind: sourceDraft.kind,
      lat,
      lon
    }
    const assignment: LeadAssignment = {
      id: newId(),
      pointId: point.id,
      conveyanceClass: disposalLead ? undefined : conveyanceClass,
      materialCode: materialName,
      manualKm: null,
      osmKm: null,
      active: true
    }
    upsertPoint(point)
    upsertAssignment(assignment)
    setVariantDraft((current) => ({
      ...current,
      startPointId: sourceDraft.role === 'start' ? point.id : current.startPointId,
      endPointId: sourceDraft.role === 'end' ? point.id : current.endPointId
    }))
    setSourceDraft(blankSourceDraft([...points, point], materialName, disposalLead))
    setNotice(`${code} added for ${materialName}.`)
    setError('')
  }

  const deleteMapPoint = (pointId: string): void => {
    const assignmentIds = new Set(
      materialAssignments
        .filter((assignment) => assignment.pointId === pointId)
        .map((assignment) => assignment.id)
    )
    for (const variant of materialVariants) {
      if (
        variant.startPointId === pointId ||
        variant.endPointId === pointId ||
        (variant.assignmentId && assignmentIds.has(variant.assignmentId))
      ) {
        removeVariant(variant.id)
      }
    }
    removePoint(pointId)
    setSelectedTargetKeys(new Set())
    setNotice('Point deleted from map.')
  }

  const saveVariant = (): void => {
    const actualLeadKm = numeric(variantDraft.leadKm)
    const equivalentLeadKm = equivalentLeadKmForDraft(variantDraft)
    const roadMultiplier = roadMultiplierForDraft(variantDraft)
    const roadSegmentKm = roadSegmentKmForDraft(variantDraft)
    const liftM = numeric(variantDraft.liftM)
    const startLocation = pointLocationForId(variantDraft.startPointId, pointsById, site)
    const endLocation = pointLocationForId(variantDraft.endPointId, pointsById, site)
    const manualWithoutMap =
      variantDraft.distanceMode === 'manual' &&
      !variantDraft.startPointId &&
      !variantDraft.endPointId
    if (variantDraft.distanceMode === 'auto' && (!startLocation || !endLocation)) {
      setError('Choose both starting and ending points for Auto lead, or switch Lead to Manual.')
      return
    }
    if (manualWithoutMap && !variantDraft.variantName.trim()) {
      setError('Enter a variant name when creating a manual lead without map points.')
      return
    }
    if (
      actualLeadKm === null ||
      actualLeadKm < 0 ||
      liftM === null ||
      liftM < 0
    ) {
      setError('Enter valid lead and lift values.')
      return
    }
    if (
      variantDraft.roadCondition === 'ce_exceptional' &&
      (roadMultiplier < 1 || roadMultiplier > 2.5)
    ) {
      setError('CE-approved exceptional multiplier must be between 1.0 and 2.5.')
      return
    }
    const mechanicalLead = isMechanicalLead(variantDraft)
    const variantConveyanceClass = disposalLead ? variantDraft.conveyanceClass : conveyanceClass
    const normalizedStartPointId = normalizeVariantPointId(variantDraft.startPointId)
    const normalizedEndPointId = normalizeVariantPointId(variantDraft.endPointId)
    const variant: LeadVariant = {
      id: newId(),
      variantName: variantDraft.variantName.trim() || undefined,
      materialName,
      conveyanceClass: variantConveyanceClass,
      assignmentId: materialAssignments.find(
        (assignment) =>
          assignment.pointId === (normalizedStartPointId || normalizedEndPointId)
      )?.id,
      startPointId: normalizedStartPointId,
      endPointId: normalizedEndPointId,
      chargeCode: disposalLead
        ? 'AUTO'
        : variantDraft.ruleMode === 'auto'
          ? 'AUTO'
          : variantDraft.chargeCode,
      mechanicalConveyanceReachesFinalPoint: disposalLead
        ? true
        : mechanicalLead
        ? variantDraft.mechanicalConveyanceReachesFinalPoint === 'yes'
        : false,
      actualLeadKm,
      roadCondition: variantDraft.roadCondition,
      roadSegmentKm,
      roadMultiplier,
      leadKm: equivalentLeadKm,
      liftM: disposalLead ? 0 : liftM,
      handlingMode: disposalLead ? 'none' : variantDraft.handlingMode,
      includedBasis: 'none',
      rateSource: 'chart',
      customGrossRate: null,
      active: true,
      createdAt: new Date().toISOString()
    }
    upsertVariant(variant)
    setSelectedVariantId(variant.id)
    setVariantDraft(blankVariantDraft(disposalLead))
    setNotice(
      disposalLead
        ? `${materialName} ${disposalClassLabel(variantConveyanceClass)} variant created.`
        : `${materialName} variant created.`
    )
    setError('')
  }

  const calculateTargetPreview = async (
    group: ProjectItemGroup,
    variant: LeadVariant
  ): Promise<TargetPreview> => {
    const recipe = await fetchRateAnalysis(group.usages[0].node, project.meta.sorYear)
    const info = parseLeadInfo(metadata.get(group.code) ?? recipe.leadApplicability)
    const liftInfo = liftInfoForData(info, group.description || recipe.description, group.code)
    const quantity = quantityForVariant(recipe, variant, info)
    const breakdown = await calculateLeadVariantCharge({
      year: project.meta.sorYear,
      conveyanceClass: variant.conveyanceClass,
      distanceKm: variant.leadKm,
      quantity: quantity.quantity,
      liftM: variant.liftM,
      includedInitialLiftM: liftInfo.includedInitialLiftM,
      includesAllLifts: liftInfo.includesAllLifts,
      mechanicalConveyanceReachesFinalPoint:
        variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
      handlingMode: variant.handlingMode,
      materialName: variant.materialName,
      includedBasis: basisForData(
        info,
        variant.includedBasis,
        `${group.description} ${recipe.description}`
      ),
      customGrossRate: variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
      chargeCode: variant.chargeCode
    })
    const summary = calculateRateAnalysis(recipe)
    const baseFinalAmount =
      Number.isFinite(summary.totalCost) && summary.totalCost > 0
        ? summary.totalCost
        : summary.ratePerUnit * (recipe.outputQuantity || 1)
    const finalAmount = baseFinalAmount + breakdown.grossAmount
    return {
      group,
      quantitySource: quantity.source,
      breakdown,
      baseFinalAmount,
      finalAmount,
      finalRate: finalAmount / (recipe.outputQuantity || 1)
    }
  }

  const previewToApplication = (
    preview: TargetPreview,
    variant: LeadVariant,
    overrideReasons: {
      deliveryAtSite?: string
      loadingUnloading?: string
    } = {}
  ): LeadApplication => {
    const existing = applications.find(
      (application) =>
        application.variantId === variant.id &&
        application.itemKey === preview.group.key
    )
    const handlingWarning = loadingUnloadingCautionForBreakdown(
      preview.breakdown,
      variant.handlingMode
    )
    return {
      id: existing?.id ?? newId(),
      variantId: variant.id,
      itemKey: preview.group.key,
      itemCode: preview.group.displayName,
      itemNodeId: preview.group.usages[0]?.node.id,
      quantity: preview.breakdown.quantity,
      quantitySource: preview.quantitySource,
      unit: preview.breakdown.unit,
      leadRate: preview.breakdown.leadRate,
      loadingRate: preview.breakdown.loadingRate,
      unloadingRate: preview.breakdown.unloadingRate,
      liftRate: preview.breakdown.liftRate,
      grossRate: preview.breakdown.grossRate,
      grossAmount: preview.breakdown.grossAmount,
      netRate: preview.breakdown.netRate,
      netAmount: preview.breakdown.netAmount,
      calculation: preview.breakdown.calculation,
      handlingWarning: handlingWarning || undefined,
      handlingOverrideReason:
        overrideReasons.loadingUnloading ?? existing?.handlingOverrideReason,
      deliveryAtSiteOverrideReason:
        overrideReasons.deliveryAtSite ?? existing?.deliveryAtSiteOverrideReason,
      deliveryAtSiteWarning: overrideReasons.deliveryAtSite
        ? DELIVERY_AT_SITE_WARNING
        : existing?.deliveryAtSiteWarning,
      appliedAt: new Date().toISOString()
    }
  }

  const applyGroups = async (groupsToApply: ProjectItemGroup[]): Promise<void> => {
    if (!selectedVariant || groupsToApply.length === 0) return
    if (selectedVariantNeedsAnyOverride) {
      setError('This Lead variant needs caution approval. Use Add anyway on each DATA item and record the reason.')
      return
    }
    setBusy('apply-all')
    setError('')
    try {
      for (const group of groupsToApply) {
        const preview = await calculateTargetPreview(group, selectedVariant)
        upsertApplication(previewToApplication(preview, selectedVariant))
      }
      setSelectedTargetKeys(new Set())
      setNotice(
        `${selectedVariant.materialName} ${selectedVariant.chargeCode ?? 'AUTO'} applied to ${groupsToApply.length} DATA item(s).`
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to apply Lead to selected DATA.')
    } finally {
      setBusy('')
    }
  }

  const openOverrideDialog = (group: ProjectItemGroup): void => {
    const deliveryAtSite = needsDeliveryAtSiteOverride(selectedVariant)
    const loadingUnloading = needsLoadingUnloadingOverride(selectedVariant)
    setOverrideDraft({
      group,
      deliveryAtSite,
      loadingUnloading,
      reason: overrideReasonsFor(deliveryAtSite, loadingUnloading)[0],
      otherReason: ''
    })
    setError('')
  }

  const confirmOverride = async (): Promise<void> => {
    if (!selectedVariant || !overrideDraft) return
    const reason =
      overrideDraft.reason === 'Other' ? overrideDraft.otherReason.trim() : overrideDraft.reason
    if (!reason) {
      setError('Enter the reason for adding this Lead variant.')
      return
    }
    setBusy(`override:${overrideDraft.group.key}`)
    setError('')
    try {
      const preview = await calculateTargetPreview(overrideDraft.group, selectedVariant)
      upsertApplication(previewToApplication(preview, selectedVariant, {
        deliveryAtSite: overrideDraft.deliveryAtSite ? reason : undefined,
        loadingUnloading: overrideDraft.loadingUnloading ? reason : undefined
      }))
      setNotice(`Lead added to ${overrideDraft.group.displayName} with caution reason.`)
      setOverrideDraft(null)
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Unable to add Cement/Steel lead.')
    } finally {
      setBusy('')
    }
  }

  const openSplitDialog = (group: ProjectItemGroup): void => {
    setSplitDraft({ group, name: `${group.displayName} - split` })
    setError('')
  }

  const confirmSplit = (): void => {
    if (!splitDraft) return
    const sourceNode = splitDraft.group.usages[0]?.node
    if (!sourceNode) {
      setError('Unable to find the source DATA item for this split.')
      return
    }
    const name = splitDraft.name.trim()
    if (!name) {
      setError('Enter a name for the split DATA item.')
      return
    }
    const splitId = splitDataItem(sourceNode.id, name)
    if (!splitId) {
      setError('Unable to split this DATA item.')
      return
    }
    setSplitDraft(null)
    setNotice(`Split DATA item "${name}" created.`)
    setError('')
  }

  return (
    <div className="dashboard lead-detail-dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Lead material detail</div>
          <h1 className="dash-title">
            <Route size={22} />
            {materialName}
          </h1>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" onClick={closeLeadMaterial}>
            Back
          </button>
          <button className="btn ghost" onClick={() => setPrintPreviewOpen(true)}>
            <Printer size={15} /> Print Preview
          </button>
          <button className="btn ghost" onClick={() => setVariantDraft(blankVariantDraft(disposalLead))}>
            <RefreshCcw size={15} /> Reset
          </button>
          <button className="btn" onClick={saveVariant}>
            <Plus size={15} /> Add Variant
          </button>
        </div>
      </div>

      <div className="lead-status-row">
        <span>
          {disposalLead
            ? 'Disposal Lead - choose Earth/Rock per variant'
            : `${conveyanceClass} - ${conveyanceClassLabel(conveyanceClass)}`}
        </span>
        <span>{eligibleGroups.length} lead-available DATA item(s)</span>
        <span>{materialApplications.length} linked DATA row(s)</span>
      </div>
      {notice && <div className="rate-notice">{notice}</div>}
      {error && <div className="rate-warning">{error}</div>}
      {printPreviewOpen && (
        <LeadPrintPreviewModal
          year={project.meta.sorYear}
          variants={variants}
          applications={applications}
          assignments={assignments}
          points={variantPointOptions}
          site={site}
          mapDirections={mapDirections}
          printSettings={printSettings}
          onUpdatePrintSettings={updateLeadPrintSettings}
          onUpsertPoint={upsertPoint}
          onUpsertMapDirection={upsertMapDirection}
          onRemoveMapDirection={removeMapDirection}
          onClose={() => setPrintPreviewOpen(false)}
        />
      )}
      {splitDraft && (
        <div className="lead-split-dialog-backdrop" role="presentation">
          <div
            className="lead-split-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Split DATA"
          >
            <div className="card-title">Split DATA</div>
            <label>
              New DATA name
              <input
                className="text-input"
                autoFocus
                value={splitDraft.name}
                onChange={(event) =>
                  setSplitDraft((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmSplit()
                  if (event.key === 'Escape') setSplitDraft(null)
                }}
              />
            </label>
            <div className="lead-split-source">
              <span>Original DATA</span>
              <div>
                <strong>{splitDraft.group.displayName}</strong>
                {splitDraft.group.displayName !== splitDraft.group.code && (
                  <em>{splitDraft.group.code}</em>
                )}
              </div>
            </div>
            <div className="lead-split-actions">
              <button className="btn ghost" type="button" onClick={() => setSplitDraft(null)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={confirmSplit}>
                <Plus size={15} /> Create DATA
              </button>
            </div>
          </div>
        </div>
      )}
      {overrideDraft && (
        <div className="lead-split-dialog-backdrop" role="presentation">
          <div
            className="lead-split-dialog lead-override-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Lead caution"
          >
            <div className="card-title">Add Lead Anyway?</div>
            {overrideDraft.deliveryAtSite && (
              <div className="lead-delivery-warning">{DELIVERY_AT_SITE_WARNING}</div>
            )}
            {overrideDraft.loadingUnloading && (
              <div className="lead-delivery-warning">{LOADING_UNLOADING_CAUTION}</div>
            )}
            <div className="lead-split-source">
              <span>DATA</span>
              <div>
                <strong>{overrideDraft.group.displayName}</strong>
                {overrideDraft.group.displayName !== overrideDraft.group.code && (
                  <em>{overrideDraft.group.code}</em>
                )}
              </div>
            </div>
            <label>
              Reason
              <select
                className="select-input"
                value={overrideDraft.reason}
                onChange={(event) =>
                  setOverrideDraft((current) =>
                    current ? { ...current, reason: event.target.value } : current
                  )
                }
              >
                {overrideReasonsFor(
                  overrideDraft.deliveryAtSite,
                  overrideDraft.loadingUnloading
                ).map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>
            {overrideDraft.reason === 'Other' && (
              <label>
                Other reason
                <input
                  className="text-input"
                  autoFocus
                  value={overrideDraft.otherReason}
                  onChange={(event) =>
                    setOverrideDraft((current) =>
                      current ? { ...current, otherReason: event.target.value } : current
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void confirmOverride()
                    if (event.key === 'Escape') setOverrideDraft(null)
                  }}
                />
              </label>
            )}
            <div className="lead-split-actions">
              <button className="btn ghost" type="button" onClick={() => setOverrideDraft(null)}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy.startsWith('override:')}
                onClick={() => void confirmOverride()}
              >
                <Plus size={15} /> {busy.startsWith('override:') ? 'Adding...' : 'Add anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lead-detail-layout">
        <section className="lead-main-panel">
          <div className="lead-panel-title-row">
            <div className="card-title">Map</div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setMapEditingOpen((open) => !open)}
            >
              <Settings size={15} /> Map Editing
            </button>
          </div>
          <LeadMap
            site={site}
            points={variantPointOptions}
            variants={materialVariants}
            assignments={assignments}
            directions={mapDirections}
            directionDraft={directionDraft}
            selectedVariantId={selectedVariant?.id ?? ''}
            draft={draftPosition(sourceDraft)}
            onDeletePoint={deleteMapPoint}
            onPick={(lat, lon) => {
              if (directionDrawing) {
                setDirectionDraft((current) => ({
                  ...current,
                  points: [...current.points, { lat, lon }]
                }))
                return
              }
              setSourceDraft((current) => ({
                ...current,
                lat: lat.toFixed(6),
                lon: lon.toFixed(6)
              }))
            }}
          />
          {mapEditingOpen && (
            <LeadMapDirectionEditor
              variants={materialVariants}
              assignments={assignments}
              directions={mapDirections}
              points={variantPointOptions}
              site={site}
              draft={directionDraft}
              drawing={directionDrawing}
              onDraftChange={setDirectionDraft}
              onDrawingChange={setDirectionDrawing}
              onSave={(direction) => {
                upsertMapDirection(direction)
                setDirectionDraft(draftFromLeadMapDirection(direction))
                setDirectionDrawing(false)
                setNotice('Map direction saved.')
              }}
              onDelete={(directionId) => {
                removeMapDirection(directionId)
                setNotice('Map direction deleted.')
              }}
            />
          )}
        </section>

        <section className="lead-side-panel">
          <div className="card-title">Create Point</div>
          <div className="lead-form-grid">
            {disposalLead ? (
              <div className="lead-rule-help span-2">
                Create approved dump area points. Disposal route is Work Location to selected dump area.
              </div>
            ) : (
              <label className="span-2">
                Point
                <select
                  className="select-input"
                  value={sourceDraft.role}
                  onChange={(event) =>
                    setSourceDraft((current) => ({
                      ...current,
                      role: event.target.value as SourceDraft['role']
                    }))
                  }
                >
                  <option value="start">Starting point</option>
                  <option value="end">Ending point</option>
                </select>
              </label>
            )}
            <label>
              Code
              <input
                className="text-input"
                value={sourceDraft.code}
                onChange={(event) =>
                  setSourceDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                }
              />
            </label>
            <label>
              Kind
              <select
                className="select-input"
                value={sourceDraft.kind}
                onChange={(event) =>
                  setSourceDraft((current) => ({
                    ...current,
                    kind: event.target.value as LeadPointKind
                  }))
                }
              >
                {POINT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>{kind.label}</option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Name
              <input
                className="text-input"
                value={sourceDraft.name}
                onChange={(event) =>
                  setSourceDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Latitude
              <input
                className="text-input"
                value={sourceDraft.lat}
                onChange={(event) =>
                  setSourceDraft((current) => ({ ...current, lat: event.target.value }))
                }
              />
            </label>
            <label>
              Longitude
              <input
                className="text-input"
                value={sourceDraft.lon}
                onChange={(event) =>
                  setSourceDraft((current) => ({ ...current, lon: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="lead-point-actions">
            <button className="btn" type="button" onClick={addSource}>
              <MapPin size={15} /> {disposalLead ? 'Add Dump Area' : 'Add Point'}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={!sourceDraft.lat && !sourceDraft.lon}
              onClick={() =>
                setSourceDraft((current) => ({
                  ...current,
                  lat: '',
                  lon: ''
                }))
              }
            >
              Clear Point
            </button>
          </div>
        </section>

        <section className="lead-main-panel">
          <div className="card-title">Variants and Linked DATA</div>
          <div className="lead-variant-list">
            {materialVariants.length === 0 ? (
              <div className="list-empty">Create the first {materialName} Lead/Lift variant.</div>
            ) : (
              materialVariants.map((variant) => {
                const assignment = assignments.find((candidate) => candidate.id === variant.assignmentId)
                const startPoint =
                  (variant.startPointId ? pointsById.get(variant.startPointId) : null) ??
                  (assignment ? pointsById.get(assignment.pointId) : null)
                const endPoint = variant.endPointId ? pointsById.get(variant.endPointId) : null
                const hasStoredRoute = Boolean(variant.startPointId || variant.endPointId || assignment)
                const startLabel = startPoint?.code ?? (hasStoredRoute ? 'Work Location' : '')
                const endLabel = endPoint?.code ?? (hasStoredRoute ? 'Work Location' : '')
                const variantTitle = variant.variantName || startLabel || endLabel || 'Manual lead'
                const routeLabel = hasStoredRoute
                  ? `${startLabel || 'Work Location'} - ${endLabel || 'Work Location'}`
                  : variant.variantName || 'Manual lead without map line'
                const linked = applications.filter((application) => application.variantId === variant.id)
                const variantRuleLabels = disposalLead
                  ? disposalRuleLabelsForLeadKm(variant.leadKm)
                  : ruleLabelsForVariant(variant)
                const variantLiftApplies = variantRuleLabels.includes('COM-LDLFT-6')
                const variantBreakdown = variantBreakdowns[variant.id]
                const variantHandlingCaution = variantBreakdown
                  ? loadingUnloadingCautionForBreakdown(variantBreakdown, variant.handlingMode)
                  : variant.handlingMode !== 'none'
                    ? LOADING_UNLOADING_CAUTION
                    : ''
                return (
                  <div
                    className={`lead-variant-card ${selectedVariant?.id === variant.id ? 'selected' : ''}`}
                    key={variant.id}
                  >
                    <button
                      className="lead-variant-main"
                      onClick={() => {
                        setSelectedVariantId(variant.id)
                        setSelectedTargetKeys(new Set())
                      }}
                    >
                      <strong>{variantTitle}</strong>
                      <span className="lead-variant-route">
                        {routeLabel}
                      </span>
                      <span className="lead-variant-measures">
                        {disposalLead && <span>{disposalClassLabel(variant.conveyanceClass)}</span>}
                        <span>{variantLeadMeasureLabel(variant)}</span>
                        {variantLiftApplies && <span>Lift {metre.format(variant.liftM)} m</span>}
                      </span>
                      <small>{variantRuleLabels.join(' + ') || 'No charge'}</small>
                      <b>{linked.length} DATA</b>
                    </button>
                    {variantBreakdown ? (
                      <LeadRateCalculation
                        calculation={variantBreakdown.calculation}
                        grossRate={variantBreakdown.grossRate}
                        unit={variantBreakdown.unit}
                        title={
                          disposalLead
                            ? 'Disposal lead calculation'
                            : 'Chart calculation before DATA initial-lead deduction'
                        }
                      />
                    ) : (
                      <div className="lead-variant-calculation-empty">Loading chart calculation...</div>
                    )}
                    {variantHandlingCaution && (
                      <div className="lead-delivery-warning">{variantHandlingCaution}</div>
                    )}
                    <div className="lead-linked-list">
                      {linked.length === 0 ? (
                        <span>No DATA linked.</span>
                      ) : (
                        linked.map((application) => (
                          <button
                            key={application.id}
                            onClick={() => openRateAnalysis(application.itemKey, application.itemNodeId ?? '')}
                          >
                            {application.itemCode} - Rs. {money.format(application.grossAmount)}
                          </button>
                        ))
                      )}
                    </div>
                    <button className="btn ghost lead-card-delete" onClick={() => removeVariant(variant.id)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section className="lead-side-panel">
          <div className="card-title">Create Variant</div>
          <div className="lead-form-grid">
            <label className="span-2">
              Variant name
              <input
                className="text-input"
                placeholder="Optional when start/end points are selected"
                value={variantDraft.variantName}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, variantName: event.target.value }))
                }
              />
            </label>
            {disposalLead && (
              <label className="span-2">
                Disposal material
                <select
                  className="select-input"
                  value={variantDraft.conveyanceClass}
                  onChange={(event) =>
                    setVariantDraft((current) => ({
                      ...current,
                      conveyanceClass: event.target.value as ConveyanceClass
                    }))
                  }
                >
                  {DISPOSAL_CLASS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="span-2">
              Starting
              <select
                className="select-input"
                value={variantDraft.startPointId}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, startPointId: event.target.value }))
                }
              >
                <option value="">No starting point / manual only</option>
                {variantPointOptions.map((point) => (
                  <option key={point.id} value={point.id}>
                    {pointOptionLabel(point)}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Ending
              <select
                className="select-input"
                value={variantDraft.endPointId}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, endPointId: event.target.value }))
                }
              >
                <option value="">No ending point / manual only</option>
                {variantPointOptions
                  .filter((point) => point.id !== variantDraft.startPointId)
                  .map((point) => (
                    <option key={point.id} value={point.id}>
                      {pointOptionLabel(point)}
                    </option>
                ))}
              </select>
            </label>
            <div className="lead-toggle-row span-2">
              <span>Lead</span>
              <div className="lead-segmented">
                <button
                  type="button"
                  className={variantDraft.distanceMode === 'auto' ? 'active' : ''}
                  onClick={() => setVariantDraft((current) => ({ ...current, distanceMode: 'auto' }))}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={variantDraft.distanceMode === 'manual' ? 'active' : ''}
                  onClick={() => setVariantDraft((current) => ({ ...current, distanceMode: 'manual' }))}
                >
                  Manual
                </button>
              </div>
            </div>
            <label className="span-2">
              {variantDraft.distanceMode === 'auto' ? 'Calculated actual route km' : 'Manual actual route km'}
              <input
                className="text-input"
                type="number"
                step="0.001"
                readOnly={variantDraft.distanceMode === 'auto'}
                value={variantDraft.leadKm}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, leadKm: event.target.value }))
                }
              />
            </label>
            <label className="span-2">
              Road condition
              <select
                className="select-input"
                value={variantDraft.roadCondition}
                onChange={(event) =>
                  setVariantDraft((current) => ({
                    ...current,
                    roadCondition: event.target.value as LeadRoadCondition
                  }))
                }
              >
                <option value="normal">Normal / rough / kuccha road - actual distance only</option>
                <option value="certified_ghat">Certified ghat road / steeper than 1 in 20 - 1.5x</option>
                <option value="ce_exceptional">CE-approved exceptional case - up to 2.5x</option>
              </select>
            </label>
            {variantDraft.roadCondition === 'certified_ghat' && (
              <>
                <div className="lead-road-warning span-2">
                  Use 1.5x only for ghat road or road steeper than 1 in 20 with Superintending Engineer certificate.
                </div>
                <label className="span-2">
                  Certified ghat / steeper than 1 in 20 segment km
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.001"
                    value={variantDraft.ghatSegmentKm}
                    onChange={(event) =>
                      setVariantDraft((current) => ({
                        ...current,
                        ghatSegmentKm: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            )}
            {variantDraft.roadCondition === 'ce_exceptional' && (
              <>
                <div className="lead-road-warning span-2">
                  Exceptional multiplier up to 2.5x requires Chief Engineer permission; enter only the approved segment and multiplier.
                </div>
                <label className="span-2">
                  CE-approved exceptional segment km
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.001"
                    value={variantDraft.ceSegmentKm}
                    onChange={(event) =>
                      setVariantDraft((current) => ({
                        ...current,
                        ceSegmentKm: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="span-2">
                  CE multiplier
                  <input
                    className="text-input"
                    type="number"
                    min="1"
                    max="2.5"
                    step="0.1"
                    value={variantDraft.ceMultiplier}
                    onChange={(event) =>
                      setVariantDraft((current) => ({
                        ...current,
                        ceMultiplier: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            )}
            <div className="lead-road-preview span-2">
              <span>{roadConditionSummary(variantDraft)}</span>
              <strong>
                Equivalent lead for chart: {km.format(draftLeadKm)} km
              </strong>
            </div>

            {disposalLead ? (
              <div className="lead-rule-help span-2">
                Disposal Lead variant records the full Work Location to Approved Dump Area lead using COM-LDLFT-2. Any initial-lead deduction is applied only in DATA.
              </div>
            ) : (
              <div className="lead-checklist span-2">
                <label className="lead-check-row">
                  <input
                    type="checkbox"
                    checked={variantDraft.handlingMode !== 'none'}
                    onChange={(event) =>
                      setVariantDraft((current) => ({
                        ...current,
                        handlingMode: event.target.checked ? 'manual_with_idle' : 'none'
                      }))
                    }
                  />
                  Loading + unloading
                </label>
                {variantDraft.handlingMode !== 'none' && (
                  <label>
                    Loading method
                    <select
                      className="select-input"
                      value={variantDraft.handlingMode}
                      onChange={(event) =>
                        setVariantDraft((current) => ({
                          ...current,
                          handlingMode: event.target.value as LeadHandlingMode
                        }))
                      }
                    >
                      {HANDLING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                {isMechanicalLead(variantDraft) && (
                  <div className="lead-toggle-row">
                    <span>Machine to final point?</span>
                    <div className="lead-segmented">
                      <button
                        type="button"
                        className={
                          variantDraft.mechanicalConveyanceReachesFinalPoint === 'yes' ? 'active' : ''
                        }
                        onClick={() =>
                          setVariantDraft((current) => ({
                            ...current,
                            mechanicalConveyanceReachesFinalPoint: 'yes',
                            liftM: '0'
                          }))
                        }
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={
                          variantDraft.mechanicalConveyanceReachesFinalPoint === 'no' ? 'active' : ''
                        }
                        onClick={() =>
                          setVariantDraft((current) => ({
                            ...current,
                            mechanicalConveyanceReachesFinalPoint: 'no'
                          }))
                        }
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}
                {isLiftBlocked(variantDraft) ? (
                <div className="lead-rule-help">
                  Lift is not payable because mechanical conveyance reaches the final placing point.
                </div>
                ) : (
                <>
                  <label className="lead-check-row">
                    <input
                      type="checkbox"
                      checked={isLiftSelected(variantDraft)}
                      onChange={(event) =>
                        setVariantDraft((current) => ({
                          ...current,
                          liftM: event.target.checked ? '4' : '0'
                        }))
                      }
                    />
                    Manual lift at final point
                  </label>
                  {isLiftSelected(variantDraft) && (
                    <>
                      <label>
                        Final manual lift m
                        <input
                          className="text-input"
                          type="number"
                          step="0.1"
                          value={variantDraft.liftM}
                          onChange={(event) =>
                            setVariantDraft((current) => ({ ...current, liftM: event.target.value }))
                          }
                        />
                      </label>
                    </>
                  )}
                </>
                )}
              </div>
            )}

            {!disposalLead && (
              <div className="lead-toggle-row span-2">
                <span>Code</span>
                <div className="lead-segmented">
                  <button
                    type="button"
                    className={variantDraft.ruleMode === 'auto' ? 'active' : ''}
                    onClick={() =>
                      setVariantDraft((current) => ({ ...current, ruleMode: 'auto', chargeCode: 'AUTO' }))
                    }
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    className={variantDraft.ruleMode === 'manual' ? 'active' : ''}
                    onClick={() =>
                      setVariantDraft((current) => {
                        const chargeCode =
                          current.chargeCode === 'AUTO' ? primaryLeadCode(current) : current.chargeCode
                        return applyChargePreset({ ...current, ruleMode: 'manual' }, chargeCode)
                      })
                    }
                  >
                    Choose
                  </button>
                </div>
              </div>
            )}
            {!disposalLead && variantDraft.ruleMode === 'manual' && (
              <label className="span-2">
                COM code
                <select
                  className="select-input"
                  value={variantDraft.chargeCode === 'AUTO' ? primaryLeadCode(variantDraft) : variantDraft.chargeCode}
                  onChange={(event) =>
                    setVariantDraft((current) =>
                      applyChargePreset(
                        { ...current, ruleMode: 'manual' },
                        event.target.value as LeadChargeCode
                      )
                    )
                  }
                >
                  {MANUAL_CHARGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="lead-variant-draft-summary span-2">
              {disposalLead && <span>{disposalClassLabel(variantDraft.conveyanceClass)}</span>}
              <span>Actual {km.format(draftActualLeadKm)} km</span>
              <span>Chart lead {km.format(draftLeadKm)} km</span>
              {draftLiftApplies && <span>Lift {metre.format(draftLiftM)} m</span>}
            </div>
            <div className="lead-code-summary span-2">
              {draftRuleLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
          <button className="btn lead-wide-btn" onClick={saveVariant}>
            <Plus size={15} /> Add Variant
          </button>
        </section>

        <section className="lead-main-panel">
          <div className="card-title">Lead Available DATA</div>
          {showDeliveryAtSiteNotice && (
            <div className="lead-delivery-warning">
              {DELIVERY_AT_SITE_WARNING}{' '}
              {selectedVariant
                ? 'Use Add anyway on a DATA row only when this extra movement is sanctioned.'
                : `Create a ${materialName} variant first; any external lead will require Add anyway with a reason.`}
            </div>
          )}
          {selectedLoadingUnloadingCaution && (
            <div className="lead-delivery-warning">{selectedLoadingUnloadingCaution}</div>
          )}
          <div className="lead-target-actions">
            <button
              className="btn ghost"
              disabled={
                !selectedVariant ||
                selectedVariantNeedsAnyOverride ||
                applyableGroups.length === 0 ||
                busy === 'apply-all'
              }
              onClick={() => void applyGroups(applyableGroups)}
              title={
                selectedVariantNeedsAnyOverride
                  ? 'This Lead variant needs Add anyway with a caution reason.'
                  : undefined
              }
            >
              <Check size={14} /> {busy === 'apply-all' ? 'Applying...' : 'Apply All'}
            </button>
            <button
              className="btn ghost"
              disabled={
                !selectedVariant ||
                selectedVariantNeedsAnyOverride ||
                selectedTargetKeys.size === 0 ||
                busy === 'apply-all'
              }
              onClick={() =>
                void applyGroups(
                  applyableGroups.filter((group) => selectedTargetKeys.has(group.key))
                )
              }
              title={
                selectedVariantNeedsAnyOverride
                  ? 'This Lead variant needs Add anyway with a caution reason.'
                  : undefined
              }
            >
              <Check size={14} /> Apply Checked
            </button>
          </div>
          <div className="lead-target-list">
            {eligibleGroups.length === 0 ? (
              <div className="list-empty">
                {eligibleMismatch
                  ? `This variant's material class (${conveyanceClassLabel(selectedVariant!.conveyanceClass)}) does not match the selected sidebar material (${conveyanceClassLabel(conveyanceClass)}). Delete and recreate this variant, or select the correct material from the sidebar.`
                  : `No DATA item currently exposes ${materialName} lead.`}
              </div>
            ) : (
              eligibleGroups.map((group) => {
                const applied = selectedVariant
                  ? applications.find(
                      (application) =>
                        application.variantId === selectedVariant.id && application.itemKey === group.key
                    )
                  : null
                const groupLeadRef = leadRefForGroup(
                  group,
                  metadata.get(group.code),
                  materialName,
                  conveyanceClass,
                  disposalLead
                )
                const canApplySelectedVariant = Boolean(
                  selectedVariant &&
                    isEligibleForLead(group, selectedVariant, parseLeadInfo(metadata.get(group.code)))
                )
                const needsOverride = needsDeliveryAtSiteOverride(selectedVariant)
                const needsLoadingOverride = needsLoadingUnloadingOverride(selectedVariant)
                const needsAnyOverride = needsOverride || needsLoadingOverride
                const showDeliveryWarning = needsOverride || (selectedMaterialIsDeliveryAtSite && !selectedVariant)
                const loadingUnloadingWarning =
                  applied?.handlingWarning ?? selectedLoadingUnloadingCaution
                return (
                  <div className={`lead-target-card ${applied ? 'applied' : ''}`} key={group.key}>
                    <label className="lead-target-check">
                      <input
                        type="checkbox"
                        disabled={!canApplySelectedVariant}
                        checked={selectedTargetKeys.has(group.key)}
                        onChange={(event) =>
                          setSelectedTargetKeys((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.add(group.key)
                            else next.delete(group.key)
                            return next
                          })
                        }
                      />
                    </label>
                    <button
                      className="lead-target-copy"
                      onClick={() =>
                        setSelectedTargetKeys((current) => {
                          const next = new Set(current)
                          if (next.has(group.key)) next.delete(group.key)
                          else next.add(group.key)
                          return next
                        })
                      }
                    >
                      <strong>{group.displayName}</strong>
                      {group.displayName !== group.code && <em>{group.code}</em>}
                      <span>{group.description}</span>
                      <small>
                        {applied
                          ? `Applied: Rs. ${money.format(applied.grossAmount)}`
                          : selectedVariant && !canApplySelectedVariant && groupLeadRef
                            ? `Needs ${disposalLead ? disposalClassLabel(groupLeadRef.conveyanceClass) : conveyanceClassLabel(groupLeadRef.conveyanceClass)} variant`
                          : needsOverride
                            ? 'Cement/Steel delivery-at-site guard: use Add anyway with reason'
                            : needsLoadingOverride
                              ? 'Loading/unloading caution: use Add anyway with reason'
                            : showDeliveryWarning
                              ? `Create a ${materialName} variant first; external lead will require Add anyway`
                            : 'Check this DATA and use Apply Checked'}
                      </small>
                      {showDeliveryWarning && (
                        <small className="lead-target-warning">
                          {applied?.deliveryAtSiteOverrideReason
                            ? `Override: ${applied.deliveryAtSiteOverrideReason}`
                            : DELIVERY_AT_SITE_WARNING}
                        </small>
                      )}
                      {loadingUnloadingWarning && (
                        <small className="lead-target-warning">{loadingUnloadingWarning}</small>
                      )}
                    </button>
                    <div className="lead-target-buttons">
                      {needsAnyOverride && !applied && (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy === `override:${group.key}`}
                          onClick={() => openOverrideDialog(group)}
                        >
                          Add anyway
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => openSplitDialog(group)}
                      >
                        Split
                      </button>
                      {applied && (
                        <button className="btn ghost" onClick={() => removeApplication(applied.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

function LeadRateCalculation({
  calculation,
  grossRate,
  unit,
  title
}: {
  calculation: LeadRateCalculationDetail
  grossRate: number
  unit: string
  title: string
}): JSX.Element {
  return (
    <div className="lead-calc-box">
      <strong>{title}</strong>
      {calculation.rows.map((row, index) => (
        <div className="lead-calc-line" key={`${row.label}-${index}`}>
          <span>{row.label}</span>
          <code>{row.expression}</code>
          <b>{formatSignedMoney(row.amount)}</b>
        </div>
      ))}
      <div className="lead-calc-line final">
        <span>Variant lead rate</span>
        <code>
          {money.format(calculation.netLeadRate)} / {calculation.unit || unit}
        </code>
        <b>Rs. {money.format(calculation.netLeadRate)}</b>
      </div>
      {grossRate !== calculation.netLeadRate && (
        <div className="lead-calc-line final">
          <span>With handling/lift</span>
          <code>{money.format(grossRate)} / {unit}</code>
          <b>Rs. {money.format(grossRate)}</b>
        </div>
      )}
    </div>
  )
}

function LeadMap({
  site,
  points,
  variants,
  assignments,
  directions,
  directionDraft,
  selectedVariantId,
  draft,
  onDeletePoint,
  onPick
}: {
  site: ProjectLocation | null
  points: LeadSelectablePoint[]
  variants: LeadVariant[]
  assignments: LeadAssignment[]
  directions: LeadMapDirection[]
  directionDraft: LeadMapDirectionDraft
  selectedVariantId: string
  draft: { lat: number; lon: number } | null
  onDeletePoint: (pointId: string) => void
  onPick: (lat: number, lon: number) => void
}): JSX.Element {
  const center: [number, number] = site
    ? [site.lat, site.lng]
    : points[0]
      ? [points[0].lat, points[0].lon]
      : TELANGANA_CENTER
  const mapLines = buildDashboardMapLines(variants, assignments, points, site, directions)
  const draftLine =
    directionDraft.points.length > 1
      ? {
          id: 'draft-direction',
          label: directionDraft.label || 'Draft direction',
          color: directionDraft.color || '#0e639c',
          points: directionDraft.points,
          dashed: true
        }
      : null

  return (
    <div className="lead-map">
      <MapContainer center={center} zoom={site || points.length ? 10 : 7} scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClick onPick={onPick} />
        {site && (
          <Marker
            position={[site.lat, site.lng]}
            icon={leadMapPinIcon('P', pointColorForCoordinate(site.lat, site.lng, mapLines) ?? '#0e639c', 'project')}
          >
            <Tooltip permanent direction="top" offset={[0, -38]}>
              Work Location
            </Tooltip>
          </Marker>
        )}
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={leadMapPinIcon(
              pointLogoLabel(point, assignments),
              pointColorForCoordinate(point.lat, point.lon, mapLines) ?? pointFallbackColor(point, assignments)
            )}
          >
            <Tooltip permanent direction="top" offset={[0, -38]}>
              {point.code}{point.name ? ` - ${point.name}` : ''}
            </Tooltip>
            <Popup>
              <div className="lead-map-popup">
                <strong>{point.code}</strong>
                <span>{point.name || point.kind.replaceAll('_', ' ')}</span>
                {point.deletable !== false && (
                  <button type="button" className="btn ghost" onClick={() => onDeletePoint(point.id)}>
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {mapLines.map((line) => (
          <Polyline
            key={line.id}
            positions={line.points.map((point) => [point.lat, point.lon])}
            pathOptions={{
              color: line.color,
              weight: line.variantId === selectedVariantId ? 5 : 3,
              opacity: line.variantId === selectedVariantId ? 0.95 : 0.75,
              dashArray: line.dashed ? '6 7' : undefined
            }}
          >
            <Tooltip sticky>{line.label}</Tooltip>
          </Polyline>
        ))}
        {mapLines.map((line) => {
          const end = line.points.at(-1)
          if (!end) return null
          return (
            <Marker
              key={`arrow-${line.id}`}
              position={[end.lat, end.lon]}
              icon={directionArrowIcon(line.color)}
              interactive={false}
            />
          )
        })}
        {draftLine && (
          <Polyline
            positions={draftLine.points.map((point) => [point.lat, point.lon])}
            pathOptions={{
              color: draftLine.color,
              weight: 4,
              opacity: 0.9,
              dashArray: '6 7'
            }}
          >
            <Tooltip sticky>{draftLine.label}</Tooltip>
          </Polyline>
        )}
        {draft && (
          <Marker position={[draft.lat, draft.lon]} icon={leadMapPinIcon('+', '#0e639c', 'draft')}>
            <Tooltip permanent direction="top" offset={[0, -38]}>Draft - Add Point</Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

interface DashboardMapLine {
  id: string
  label: string
  color: string
  points: Array<{ lat: number; lon: number }>
  variantId?: string
  dashed?: boolean
}

function buildDashboardMapLines(
  variants: LeadVariant[],
  assignments: LeadAssignment[],
  points: LeadSelectablePoint[],
  site: ProjectLocation | null,
  directions: LeadMapDirection[]
): DashboardMapLine[] {
  const customVariantIds = new Set(
    directions
      .filter((direction) => direction.active !== false && direction.variantId)
      .map((direction) => direction.variantId!)
  )
  const lines: DashboardMapLine[] = directions
    .filter((direction) => direction.active !== false && direction.points.length >= 2)
    .map((direction) => ({
      id: direction.id,
      label: direction.label,
      color: direction.color || '#0e639c',
      points: direction.points,
      variantId: direction.variantId
    }))
  const colors = ['#4ec9b0', '#ce9178', '#c586c0', '#dcdcaa', '#569cd6']
  for (const [index, variant] of variants.entries()) {
    if (customVariantIds.has(variant.id)) continue
    const route = routePointsForMapVariant(variant, assignments, points, site)
    if (!route) continue
    lines.push({
      id: `auto-${variant.id}`,
      label: variant.variantName || `${variant.materialName} ${km.format(variant.leadKm)} km`,
      color: colors[index % colors.length],
      points: route,
      variantId: variant.id,
      dashed: true
    })
  }
  return lines
}

function routePointsForMapVariant(
  variant: LeadVariant,
  assignments: LeadAssignment[],
  points: LeadSelectablePoint[],
  site: ProjectLocation | null
): Array<{ lat: number; lon: number }> | null {
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const assignment = variant.assignmentId
    ? assignments.find((candidate) => candidate.id === variant.assignmentId)
    : null
  const start =
    (variant.startPointId ? pointsById.get(variant.startPointId) : null) ??
    (assignment ? pointsById.get(assignment.pointId) : null) ??
    siteToLeadPoint(site)
  const end = (variant.endPointId ? pointsById.get(variant.endPointId) : null) ?? siteToLeadPoint(site)
  if (!start || !end || (start.lat === end.lat && pointLon(start) === pointLon(end))) return null
  return [
    { lat: start.lat, lon: pointLon(start) },
    { lat: end.lat, lon: pointLon(end) }
  ]
}

function siteToLeadPoint(site: ProjectLocation | null): (ProjectLocation & { lon: number }) | null {
  return site ? { ...site, lon: site.lng } : null
}

function pointLon(point: LeadSelectablePoint | (ProjectLocation & { lon: number })): number {
  return point.lon
}

function pointColorForCoordinate(
  lat: number,
  lon: number,
  lines: DashboardMapLine[]
): string | null {
  for (const line of lines) {
    if (
      line.points.some(
        (point) => Math.abs(point.lat - lat) < 0.000001 && Math.abs(point.lon - lon) < 0.000001
      )
    ) {
      return line.color
    }
  }
  return null
}

function pointLogoLabel(point: LeadSelectablePoint, assignments: LeadAssignment[]): string {
  if (point.kind === 'site') return 'P'
  const material = assignments
    .find((assignment) => assignment.pointId === point.id)
    ?.materialCode?.toLowerCase()
  if (material?.includes('cement')) return 'C'
  if (material?.includes('sand')) return 'S'
  if (material?.includes('stone')) return 'ST'
  if (material?.includes('disposal')) return 'D'
  if (point.kind === 'sand_reach') return 'S'
  if (point.kind === 'godown') return 'C'
  if (point.kind === 'stockyard') return 'ST'
  if (point.kind === 'water') return 'W'
  if (point.kind === 'quarry') return 'Q'
  return point.code.slice(0, 2).toUpperCase()
}

function pointFallbackColor(point: LeadSelectablePoint, assignments: LeadAssignment[]): string {
  const material = assignments
    .find((assignment) => assignment.pointId === point.id)
    ?.materialCode?.toLowerCase()
  if (point.kind === 'site') return '#0e639c'
  if (material?.includes('cement') || point.kind === 'godown') return '#8e8e93'
  if (material?.includes('sand') || point.kind === 'sand_reach') return '#d9a441'
  if (material?.includes('stone') || point.kind === 'quarry') return '#7a7f86'
  if (material?.includes('disposal') || point.kind === 'stockyard') return '#8f6a3d'
  if (point.kind === 'water') return '#2f9ed8'
  return '#ce9178'
}

function directionArrowIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'lead-map-arrow',
    html: `<span style="color:${color}">&rarr;</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

function MapClick({ onPick }: { onPick: (lat: number, lon: number) => void }): null {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng)
  })
  return null
}

function collectWorkLocationPoints(
  root: ProjectNode,
  projectLocation: ProjectLocation | null
): LeadSelectablePoint[] {
  const points: LeadSelectablePoint[] = []
  if (projectLocation) {
    points.push({
      id: PROJECT_WORK_POINT_ID,
      code: 'Work Location',
      name: projectLocation.label || 'Project working point',
      kind: 'site',
      lat: projectLocation.lat,
      lon: projectLocation.lng,
      deletable: false
    })
  }
  const visit = (node: ProjectNode): void => {
    if ((node.kind === 'component' || node.kind === 'subcomponent') && node.location) {
      points.push({
        id: `${NODE_POINT_PREFIX}${node.id}`,
        code: node.name,
        name: node.kind === 'component' ? 'Component work point' : 'Sub-component work point',
        kind: 'site',
        lat: node.location.lat,
        lon: node.location.lng,
        deletable: false
      })
    }
    node.children.forEach(visit)
  }
  visit(root)
  return points
}

function uniqueSelectablePoints(points: LeadSelectablePoint[]): LeadSelectablePoint[] {
  const seen = new Set<string>()
  const out: LeadSelectablePoint[] = []
  for (const point of points) {
    if (seen.has(point.id)) continue
    seen.add(point.id)
    out.push(point)
  }
  return out
}

function pointLocationForId(
  pointId: string,
  pointsById: Map<string, LeadSelectablePoint>,
  site: ProjectLocation | null
): { lat: number; lng: number } | null {
  if (!pointId) return null
  if (pointId === PROJECT_WORK_POINT_ID) {
    return site ? { lat: site.lat, lng: site.lng } : null
  }
  const point = pointsById.get(pointId)
  return point ? { lat: point.lat, lng: point.lon } : null
}

function normalizeVariantPointId(pointId: string): string | undefined {
  if (!pointId || pointId === PROJECT_WORK_POINT_ID) return undefined
  return pointId
}

function pointOptionLabel(point: LeadSelectablePoint): string {
  return point.name ? `${point.code} - ${point.name}` : point.code
}

function leadRefForGroup(
  group: ProjectItemGroup,
  metadata: unknown,
  materialName: string,
  conveyanceClass: ConveyanceClass,
  disposalLead = false
) {
  return materialRefsForLeadInfo(parseLeadInfo(metadata), group.description).find(
    (ref) =>
      (disposalLead || ref.conveyanceClass === conveyanceClass) &&
      ref.name.toLowerCase() === materialName.toLowerCase()
  )
}

function materialInGroup(
  group: ProjectItemGroup,
  metadata: unknown,
  materialName: string,
  conveyanceClass: ConveyanceClass,
  disposalLead = false
): boolean {
  if (group.source !== 'SSR') return false
  return materialRefsForLeadInfo(parseLeadInfo(metadata), group.description).some(
    (ref) =>
      (disposalLead || ref.conveyanceClass === conveyanceClass) &&
      ref.name.toLowerCase() === materialName.toLowerCase()
  )
}

function blankSourceDraft(points: LeadPoint[], materialName: string, disposalLead = false): SourceDraft {
  return {
    code: nextCode(points, materialName),
    name: '',
    kind: disposalLead
      ? 'stockyard'
      : materialName.toLowerCase().includes('cement')
        ? 'godown'
        : 'quarry',
    role: disposalLead ? 'end' : 'start',
    lat: '',
    lon: ''
  }
}

function blankVariantDraft(disposalLead = false): VariantDraft {
  return {
    variantName: '',
    startPointId: disposalLead ? PROJECT_WORK_POINT_ID : '',
    endPointId: disposalLead ? '' : PROJECT_WORK_POINT_ID,
    distanceMode: 'auto',
    ruleMode: 'auto',
    chargeCode: 'AUTO',
    conveyanceClass: 'EARTH',
    roadCondition: 'normal',
    ghatSegmentKm: '0',
    ceSegmentKm: '0',
    ceMultiplier: '2.5',
    mechanicalConveyanceReachesFinalPoint: 'yes',
    leadKm: '0',
    liftM: '0',
    handlingMode: 'none'
  }
}

function equivalentLeadKmForDraft(draft: VariantDraft): number {
  const actualLeadKm = numeric(draft.leadKm) ?? 0
  const segmentKm = roadSegmentKmForDraft(draft)
  const normalKm = Math.max(actualLeadKm - segmentKm, 0)
  return roundKm(normalKm + segmentKm * roadMultiplierForDraft(draft))
}

function roadMultiplierForDraft(draft: VariantDraft): number {
  if (draft.roadCondition === 'certified_ghat') {
    return 1.5
  }
  if (draft.roadCondition === 'ce_exceptional') {
    const multiplier = numeric(draft.ceMultiplier) ?? 1
    return Math.min(Math.max(multiplier, 1), 2.5)
  }
  return 1
}

function roadSegmentKmForDraft(draft: VariantDraft): number {
  const actualLeadKm = numeric(draft.leadKm) ?? 0
  if (draft.roadCondition === 'certified_ghat') {
    return clampKm(numeric(draft.ghatSegmentKm) ?? 0, actualLeadKm)
  }
  if (draft.roadCondition === 'ce_exceptional') {
    return clampKm(numeric(draft.ceSegmentKm) ?? 0, actualLeadKm)
  }
  return 0
}

function clampKm(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0))
}

function roadConditionSummary(draft: VariantDraft): string {
  const actualLeadKm = numeric(draft.leadKm) ?? 0
  const segmentKm = roadSegmentKmForDraft(draft)
  const normalKm = Math.max(actualLeadKm - segmentKm, 0)
  if (draft.roadCondition === 'certified_ghat') {
    return `${km.format(normalKm)} km normal + ${km.format(segmentKm)} km certified ghat/steep road x 1.5. SE certificate required.`
  }
  if (draft.roadCondition === 'ce_exceptional') {
    return `${km.format(normalKm)} km normal + ${km.format(segmentKm)} km CE-approved exceptional road x ${roadMultiplierForDraft(draft)}. CE permission required.`
  }
  return 'Normal / rough / kuccha road uses actual measured distance only.'
}

function variantLeadMeasureLabel(variant: LeadVariant): string {
  const actualLeadKm = variant.actualLeadKm ?? variant.leadKm
  const multiplier = variant.roadMultiplier ?? 1
  const segmentKm = variant.roadSegmentKm ?? 0
  if (multiplier > 1 && Math.abs(actualLeadKm - variant.leadKm) > 0.0005) {
    const normalKm = Math.max(actualLeadKm - segmentKm, 0)
    return `Lead ${km.format(variant.leadKm)} km (${km.format(normalKm)} + ${km.format(segmentKm)} x ${multiplier})`
  }
  return `Lead ${km.format(variant.leadKm)} km`
}

function disposalClassLabel(conveyanceClass: ConveyanceClass): string {
  if (conveyanceClass === 'STONE') return 'Rock / stone'
  if (conveyanceClass === 'EARTH') return 'Earth / soil'
  return conveyanceClassLabel(conveyanceClass)
}

function applyChargePreset(draft: VariantDraft, chargeCode: LeadChargeCode): VariantDraft {
  if (chargeCode === 'COM-LDLFT-1' || chargeCode === 'COM-LDLFT-2') {
    return { ...draft, chargeCode, handlingMode: 'none' }
  }
  if (chargeCode === 'COM-LDLFT-3') {
    return { ...draft, chargeCode, handlingMode: 'manual_no_idle' }
  }
  if (chargeCode === 'COM-LDLFT-4') {
    return { ...draft, chargeCode, handlingMode: 'manual_with_idle' }
  }
  if (chargeCode === 'COM-LDLFT-5') {
    return { ...draft, chargeCode, handlingMode: 'mechanical' }
  }
  if (chargeCode === 'COM-LDLFT-6') {
    const currentLift = numeric(draft.liftM)
    return {
      ...draft,
      chargeCode,
      handlingMode: 'none',
      liftM: currentLift !== null && currentLift > 3 ? draft.liftM : '4'
    }
  }
  return { ...draft, chargeCode }
}

function isLiftSelected(draft: Pick<VariantDraft, 'liftM'>): boolean {
  const liftM = numeric(draft.liftM)
  return liftM !== null && liftM > 0
}

function primaryLeadCode(draft: Pick<VariantDraft, 'leadKm'>): LeadChargeCode {
  const leadKm = 'roadCondition' in draft
    ? equivalentLeadKmForDraft(draft as VariantDraft)
    : numeric(draft.leadKm) ?? 0
  return leadKm <= 0.15 ? 'COM-LDLFT-1' : 'COM-LDLFT-2'
}

function isMechanicalLead(draft: Pick<VariantDraft, 'leadKm'> | VariantDraft): boolean {
  const leadKm = 'roadCondition' in draft
    ? equivalentLeadKmForDraft(draft)
    : numeric(draft.leadKm) ?? 0
  return leadKm > 0.15
}

function isLiftBlocked(
  draft: Pick<VariantDraft, 'leadKm' | 'mechanicalConveyanceReachesFinalPoint'>
): boolean {
  return isMechanicalLead(draft) && draft.mechanicalConveyanceReachesFinalPoint === 'yes'
}

function ruleLabelsForDraft(draft: VariantDraft): string[] {
  return ruleLabels({
    leadKm: equivalentLeadKmForDraft(draft),
    liftM: draft.liftM,
    mechanicalConveyanceReachesFinalPoint: draft.mechanicalConveyanceReachesFinalPoint === 'yes',
    handlingMode: draft.handlingMode
  })
}

function ruleLabelsForVariant(variant: LeadVariant): string[] {
  return ruleLabels({
    leadKm: variant.leadKm,
    liftM: variant.liftM,
    mechanicalConveyanceReachesFinalPoint:
      variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
    handlingMode: variant.handlingMode
  })
}

function disposalRuleLabelsForLeadKm(leadKm: number): string[] {
  if (leadKm <= 0) return ['No lead']
  return ['COM-LDLFT-2']
}

function ruleLabels({
  leadKm: leadKmValue,
  liftM: liftMValue,
  mechanicalConveyanceReachesFinalPoint,
  handlingMode
}: {
  leadKm: number | string
  liftM: number | string
  mechanicalConveyanceReachesFinalPoint: boolean
  handlingMode: LeadHandlingMode
}): string[] {
  const leadKm = typeof leadKmValue === 'number' ? leadKmValue : numeric(leadKmValue) ?? 0
  const liftM = typeof liftMValue === 'number' ? liftMValue : numeric(liftMValue) ?? 0
  const labels: string[] = []
  if (leadKm > 0.05) labels.push(leadKm <= 0.15 ? 'COM-LDLFT-1' : 'COM-LDLFT-2')
  if (handlingMode === 'manual_no_idle') labels.push('COM-LDLFT-3')
  if (handlingMode === 'manual_with_idle') labels.push('COM-LDLFT-4')
  if (handlingMode === 'mechanical') labels.push('COM-LDLFT-5')
  if (liftM > 0 && (leadKm <= 0.15 || mechanicalConveyanceReachesFinalPoint === false)) {
    labels.push('COM-LDLFT-6')
  }
  return labels
}

function draftPosition(draft: SourceDraft): { lat: number; lon: number } | null {
  const lat = Number(draft.lat)
  const lon = Number(draft.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

function nextCode(points: LeadPoint[], materialName: string): string {
  const used = new Set(points.map((point) => point.code.toUpperCase()))
  const upper = materialName.toUpperCase()
  const prefix = upper.startsWith('DISPOSAL')
    ? 'D'
    : upper.startsWith('C')
      ? 'C'
      : upper.startsWith('S')
        ? 'S'
        : 'L'
  for (let index = 1; index <= 99; index += 1) {
    const code = `${prefix}${index}`
    if (!used.has(code)) return code
  }
  return `${prefix}${points.length + 1}`
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function roundKm(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function numeric(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatSignedMoney(value: number): string {
  if (value < 0) return `-Rs. ${money.format(Math.abs(value))}`
  return `Rs. ${money.format(value)}`
}
