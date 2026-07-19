import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { ArrowDown, ArrowUp, Check, MapPin, Pencil, Plus, Printer, RefreshCcw, Route, Settings, Trash2 } from 'lucide-react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
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
  addonLeadRuleForVariant,
  basisForData,
  canonicalLeadConveyanceClass,
  handlingModeForData,
  isEligibleForLead,
  liftInfoForData,
  materialRefsForLeadInfo,
  parseLeadInfo,
  quantityForVariant,
  isDisposalLeadMaterial
} from '../../lib/leadApplicability'
import { calculateRateAnalysis, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { calculateRoadRoute } from '../../lib/roadRouting'
import {
  collectProjectItemGroups,
  rateAnalysisOverrideForNode,
  type ItemUsage,
  type ProjectItemGroup
} from '../../lib/projectItems'
import { newId } from '../../lib/tree'
import { useStore } from '../../store/useStore'
import LeadPrintPreviewModal from './LeadPrintPreviewModal'
import MapLayers from '../map/MapLayers'
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
  LeadMapCoordinate,
  LeadPoint,
  LeadPointKind,
  LeadRateCalculationDetail,
  LeadRoadCondition,
  LeadVariant,
  ProjectNode,
  ProjectLocation
} from '../../types/project'

const TELANGANA_CENTER: [number, number] = [17.9, 79.6]
const ROAD_DIRECTION_CLICK_MAX_KM = 0.15
const ROAD_JOIN_SNAP_MAX_KM = 0.5

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
  viaPointIds: string[]
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
  manualRouteGeometry: LeadMapCoordinate[]
  firstMileMode: 'auto' | 'manual'
  firstMileKm: string
  firstMileGeometry: LeadMapCoordinate[]
  lastMileMode: 'auto' | 'manual'
  lastMileKm: string
  lastMileGeometry: LeadMapCoordinate[]
  liftM: string
  handlingMode: LeadHandlingMode
}

type AccessDrawingTarget = 'route' | 'first' | 'last'
type AccessDrawingOrientation = 'location_to_road' | 'road_to_location'

interface DraftRoadRoute {
  status: 'idle' | 'routing' | 'ready' | 'error'
  signature: string
  points: LeadMapCoordinate[]
  distanceKm: number | null
  firstMileAutoKm: number
  lastMileAutoKm: number
  durationSeconds: number | null
  error?: string
}

interface DraftRouteStop extends LeadMapCoordinate {
  id: string
  label: string
}

interface TargetPreview {
  target: LeadTarget
  addonId?: string
  quantitySource: string
  breakdown: LeadChargeBreakdown
  outputQuantity: number
  baseFinalAmount: number
  finalAmount: number
  finalRate: number
}

interface LeadTarget {
  key: string
  group: ProjectItemGroup
  usage: ItemUsage
  pathLabel: string
}

interface LeadOverrideDraft {
  target: LeadTarget
  deliveryAtSite: boolean
  loadingUnloading: boolean
  reason: string
  otherReason: string
}

function leadTargetForUsage(group: ProjectItemGroup, usage: ItemUsage): LeadTarget {
  return {
    key: `${group.key}::${usage.node.id}`,
    group,
    usage,
    pathLabel: usage.path.map((node) => node.name).join(' > ') || 'Project'
  }
}

function leadTargetForApplication(
  group: ProjectItemGroup,
  application: LeadApplication
): LeadTarget | null {
  const usage = application.itemNodeId
    ? group.usages.find((candidate) => candidate.node.id === application.itemNodeId)
    : group.usages[0]
  return usage ? leadTargetForUsage(group, usage) : null
}

function applicationForLeadTarget(
  applications: LeadApplication[],
  target: LeadTarget
): LeadApplication | null {
  const exact = applications.find(
    (application) =>
      application.itemKey === target.group.key &&
      application.itemNodeId === target.usage.node.id
  )
  if (exact) return exact
  if (target.group.usages[0]?.node.id !== target.usage.node.id) return null
  return applications.find(
    (application) => application.itemKey === target.group.key && !application.itemNodeId
  ) ?? null
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

function isDeliveryAtSiteMaterial(
  conveyanceClass: ConveyanceClass,
  materialName = ''
): boolean {
  if (/^fabricated\s+parts?$/i.test(materialName.trim())) return false
  return conveyanceClass === 'CEMENT' || conveyanceClass === 'STEEL'
}

function needsDeliveryAtSiteOverride(variant: LeadVariant | null | undefined): boolean {
  if (!variant) return false
  return isDeliveryAtSiteMaterial(variant.conveyanceClass, variant.materialName) && variant.leadKm > 0.15
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
  const [draftRoadRoute, setDraftRoadRoute] = useState<DraftRoadRoute>({
    status: 'idle',
    signature: '',
    points: [],
    distanceKm: null,
    firstMileAutoKm: 0,
    lastMileAutoKm: 0,
    durationSeconds: null
  })
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<Set<string>>(new Set())
  const [metadata, setMetadata] = useState<Map<string, unknown>>(new Map())
  const [variantBreakdowns, setVariantBreakdowns] = useState<Record<string, LeadChargeBreakdown>>({})
  const [overrideDraft, setOverrideDraft] = useState<LeadOverrideDraft | null>(null)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [mapEditingOpen, setMapEditingOpen] = useState(false)
  const [pointDialogOpen, setPointDialogOpen] = useState(false)
  const [pointPicking, setPointPicking] = useState(false)
  const [pointLocationPicked, setPointLocationPicked] = useState(false)
  const [variantDialogOpen, setVariantDialogOpen] = useState(false)
  const [editingVariantId, setEditingVariantId] = useState('')
  const [accessDrawing, setAccessDrawing] = useState<AccessDrawingTarget | null>(null)
  const [accessDrawingOrientation, setAccessDrawingOrientation] =
    useState<AccessDrawingOrientation | null>(null)
  const [accessDrawingOriginal, setAccessDrawingOriginal] = useState<LeadMapCoordinate[]>([])
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
  const materialMapPointIds = useMemo(() => {
    const ids = new Set(materialAssignments.map((assignment) => assignment.pointId))
    for (const variant of materialVariants) {
      if (variant.startPointId) ids.add(variant.startPointId)
      for (const pointId of variant.viaPointIds ?? []) ids.add(pointId)
      if (variant.endPointId) ids.add(variant.endPointId)
    }
    return ids
  }, [materialAssignments, materialVariants])
  const materialMapPoints = useMemo(
    () =>
      variantPointOptions.filter(
        (point) => point.id !== PROJECT_WORK_POINT_ID && materialMapPointIds.has(point.id)
      ),
    [materialMapPointIds, variantPointOptions]
  )
  const pointsById = useMemo(
    () => new Map(variantPointOptions.map((point) => [point.id, point])),
    [variantPointOptions]
  )
  const draftRouteStopIds = useMemo(
    () => [
      variantDraft.startPointId,
      ...variantDraft.viaPointIds.filter(Boolean),
      variantDraft.endPointId
    ].filter(Boolean),
    [variantDraft.endPointId, variantDraft.startPointId, variantDraft.viaPointIds]
  )
  const draftRouteStops = useMemo<DraftRouteStop[]>(
    () =>
      draftRouteStopIds.flatMap((pointId) => {
        const location = pointLocationForId(pointId, pointsById, site)
        const point = pointsById.get(pointId)
        if (!location) return []
        return [{
          id: pointId,
          label: point ? pointOptionLabel(point) : 'Work Location',
          lat: location.lat,
          lon: location.lng
        }]
      }),
    [draftRouteStopIds, pointsById, site]
  )
  const draftRouteSignature = draftRouteStops
    .map((stop) => `${stop.id}:${stop.lat},${stop.lon}`)
    .join('|')
  const selectedVariant =
    materialVariants.find((variant) => variant.id === selectedVariantId) ?? materialVariants[0] ?? null
  const selectedMaterialIsDeliveryAtSite =
    !disposalLead && isDeliveryAtSiteMaterial(conveyanceClass, materialName)
  const selectedVariantNeedsDeliveryOverride = needsDeliveryAtSiteOverride(selectedVariant)
  const selectedVariantNeedsLoadingUnloadingOverride = needsLoadingUnloadingOverride(selectedVariant)
  const selectedVariantNeedsAnyOverride =
    selectedVariantNeedsDeliveryOverride || selectedVariantNeedsLoadingUnloadingOverride
  const showDeliveryAtSiteNotice =
    selectedVariantNeedsDeliveryOverride || (selectedMaterialIsDeliveryAtSite && !selectedVariant)
  const availableGroups = groups.filter((group) =>
    materialInGroup(
      group,
      leadMetadataForGroup(group, metadata.get(group.code)),
      materialName,
      conveyanceClass,
      disposalLead
    )
  )
  const applyableGroups = selectedVariant
    ? availableGroups.filter((group) =>
        isEligibleForLead(
          group,
          selectedVariant,
          parseLeadInfo(leadMetadataForGroup(group, metadata.get(group.code)))
        )
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
  const applyableTargets = applyableGroups.flatMap((group) =>
    group.usages.map((usage) => leadTargetForUsage(group, usage))
  )
  const incompleteApplicationSignature = materialApplications
    .filter(
      (application) =>
        !application.itemNodeId ||
        application.outputQuantity === undefined ||
        application.rateAddition === undefined
    )
    .map((application) => `${application.id}:${application.variantId}:${application.itemKey}`)
    .join('|')
  const draftRuleLabels = disposalLead
    ? disposalRuleLabelsForLeadKm(equivalentLeadKmForDraft(variantDraft))
    : ruleLabelsForDraft(variantDraft)
  const draftFirstMileAutoKm = draftRoadRoute.firstMileAutoKm
  const draftLastMileAutoKm = draftRoadRoute.lastMileAutoKm
  const draftFirstMileKm = variantDraft.firstMileMode === 'auto'
    ? draftFirstMileAutoKm
    : nonNegativeNumber(variantDraft.firstMileKm) ?? 0
  const draftLastMileKm = variantDraft.lastMileMode === 'auto'
    ? draftLastMileAutoKm
    : nonNegativeNumber(variantDraft.lastMileKm) ?? 0
  const draftFirstMileOrientation = accessOrientationForGeometry(
    draftRoadRoute.points,
    variantDraft.firstMileGeometry
  )
  const draftLastMileOrientation = accessOrientationForGeometry(
    draftRoadRoute.points,
    variantDraft.lastMileGeometry
  )
  const draftAdoptedRoadRoute = useMemo(
    () => trimRoadRouteForAccessLines(
      draftRoadRoute.points,
      draftRoadRoute.distanceKm,
      variantDraft.firstMileMode === 'manual' && accessDrawing !== 'first'
        ? variantDraft.firstMileGeometry
        : [],
      variantDraft.lastMileMode === 'manual' && accessDrawing !== 'last'
        ? variantDraft.lastMileGeometry
        : []
    ),
    [
      draftRoadRoute.distanceKm,
      draftRoadRoute.points,
      accessDrawing,
      variantDraft.firstMileGeometry,
      variantDraft.firstMileMode,
      variantDraft.lastMileGeometry,
      variantDraft.lastMileMode
    ]
  )
  const draftRoadSectionKm = draftAdoptedRoadRoute.distanceKm
  const draftRouteTotalKm = roundKm(draftRoadSectionKm + draftFirstMileKm + draftLastMileKm)
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
    if (variantDraft.distanceMode !== 'auto') {
      setDraftRoadRoute({
        status: 'idle',
        signature: '',
        points: [],
        distanceKm: null,
        firstMileAutoKm: 0,
        lastMileAutoKm: 0,
        durationSeconds: null
      })
      return
    }
    if (draftRouteStopIds.length < 2 || draftRouteStops.length !== draftRouteStopIds.length) {
      setDraftRoadRoute({
        status: 'idle',
        signature: draftRouteSignature,
        points: [],
        distanceKm: null,
        firstMileAutoKm: 0,
        lastMileAutoKm: 0,
        durationSeconds: null
      })
      setVariantDraft((current) => ({ ...current, leadKm: '' }))
      return
    }

    const controller = new AbortController()
    setDraftRoadRoute({
      status: 'routing',
      signature: draftRouteSignature,
      points: [],
      distanceKm: null,
      firstMileAutoKm: 0,
      lastMileAutoKm: 0,
      durationSeconds: null
    })
    const handle = window.setTimeout(() => {
      void calculateRoadRoute(draftRouteStops, controller.signal)
        .then((route) => {
          const distanceKm = roundKm(route.distanceKm)
          const firstMileAutoKm = roundKm(
            haversineKm(
              draftRouteStops[0].lat,
              draftRouteStops[0].lon,
              route.points[0].lat,
              route.points[0].lon
            )
          )
          const lastStop = draftRouteStops.at(-1)!
          const lastRoutePoint = route.points.at(-1)!
          const lastMileAutoKm = roundKm(
            haversineKm(
              lastRoutePoint.lat,
              lastRoutePoint.lon,
              lastStop.lat,
              lastStop.lon
            )
          )
          setDraftRoadRoute({
            status: 'ready',
            signature: draftRouteSignature,
            points: route.points,
            distanceKm,
            firstMileAutoKm,
            lastMileAutoKm,
            durationSeconds: route.durationSeconds
          })
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return
          setDraftRoadRoute({
            status: 'error',
            signature: draftRouteSignature,
            points: [],
            distanceKm: null,
            firstMileAutoKm: 0,
            lastMileAutoKm: 0,
            durationSeconds: null,
            error: reason instanceof Error ? reason.message : 'Unable to calculate the road route.'
          })
          setVariantDraft((current) => ({ ...current, leadKm: '' }))
        })
    }, 350)

    return () => {
      window.clearTimeout(handle)
      controller.abort()
    }
  }, [
    draftRouteSignature,
    draftRouteStopIds.length,
    draftRouteStops,
    variantDraft.distanceMode,
  ])

  useEffect(() => {
    if (variantDraft.distanceMode !== 'auto') return
    if (draftRoadRoute.status !== 'ready' || draftRoadRoute.distanceKm === null) return
    const firstMileKm = variantDraft.firstMileMode === 'auto'
      ? draftFirstMileAutoKm
      : nonNegativeNumber(variantDraft.firstMileKm)
    const lastMileKm = variantDraft.lastMileMode === 'auto'
      ? draftLastMileAutoKm
      : nonNegativeNumber(variantDraft.lastMileKm)
    setVariantDraft((current) => ({
      ...current,
      leadKm:
        firstMileKm === null || lastMileKm === null
          ? ''
          : String(roundKm(draftRoadSectionKm + firstMileKm + lastMileKm))
    }))
  }, [
    draftRoadRoute.status,
    draftFirstMileAutoKm,
    draftLastMileAutoKm,
    draftRoadSectionKm,
    variantDraft.distanceMode,
    variantDraft.firstMileKm,
    variantDraft.firstMileMode,
    variantDraft.lastMileKm,
    variantDraft.lastMileMode
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

  useEffect(() => {
    if (!project || !incompleteApplicationSignature) return
    let cancelled = false

    void (async () => {
      const incomplete = materialApplications.filter(
        (application) =>
          !application.itemNodeId ||
          application.outputQuantity === undefined ||
          application.rateAddition === undefined
      )
      for (const application of incomplete) {
        if (cancelled) return
        const group = groups.find((candidate) => candidate.key === application.itemKey)
        const variant = materialVariants.find((candidate) => candidate.id === application.variantId)
        const target = group ? leadTargetForApplication(group, application) : null
        if (!target || !variant) continue
        const preview = await calculateTargetPreview(target, variant)
        if (!cancelled) upsertApplication(previewToApplication(preview, variant))
      }
    })().catch((reason: unknown) => {
      if (!cancelled) console.error('Unable to migrate scoped Lead applications', reason)
    })

    return () => {
      cancelled = true
    }
  }, [incompleteApplicationSignature, project?.id])

  if (!project || !selection) {
    return (
      <div className="rate-state">
        Select a material from the Lead tab to open its Lead/Lift details.
      </div>
    )
  }

  const addSource = (): void => {
    const code = sourceDraft.code.trim().toUpperCase()
    const lat = coordinateNumber(sourceDraft.lat, -90, 90)
    const lon = coordinateNumber(sourceDraft.lon, -180, 180)
    if (!code) {
      setError('Enter a source code.')
      return
    }
    if (!pointLocationPicked || lat === null || lon === null) {
      setError('Pick and confirm a valid location on the map before creating the point.')
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
    setVariantDraft((current) => clearDrawnRouteGeometry({
      ...current,
      startPointId: sourceDraft.role === 'start' ? point.id : current.startPointId,
      endPointId: sourceDraft.role === 'end' ? point.id : current.endPointId
    }))
    setSourceDraft(blankSourceDraft([...points, point], materialName, disposalLead))
    setPointDialogOpen(false)
    setPointPicking(false)
    setPointLocationPicked(false)
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
        variant.viaPointIds?.includes(pointId) ||
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

  const startAccessDrawing = (target: AccessDrawingTarget): void => {
    const selectedStart = draftRouteStops[0]
    const selectedEnd = draftRouteStops.at(-1)
    if (!selectedStart || !selectedEnd) {
      setError('Choose both starting and ending points before drawing a line.')
      return
    }
    if (target !== 'route' && (draftRoadRoute.status !== 'ready' || draftRoadRoute.points.length < 2)) {
      setError('Wait for the road route before drawing the access line.')
      return
    }
    const geometryKey = target === 'route'
      ? 'manualRouteGeometry'
      : target === 'first'
        ? 'firstMileGeometry'
        : 'lastMileGeometry'
    const existing = variantDraft[geometryKey]
    setAccessDrawingOriginal(existing.map((point) => ({ ...point })))
    setAccessDrawing(target)
    setAccessDrawingOrientation(null)
    setVariantDraft((current) => ({
      ...current,
      ...(target === 'first'
        ? { firstMileMode: 'manual' as const }
        : target === 'last'
          ? { lastMileMode: 'manual' as const }
          : {}),
      [geometryKey]: target === 'route'
        ? [{ lat: selectedStart.lat, lon: selectedStart.lon }]
        : []
    }))
    setError('')
    window.setTimeout(() => {
      document.querySelector('.lead-variant-preview-map')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }, 0)
  }

  const addAccessDrawingPoint = (lat: number, lon: number): void => {
    if (!accessDrawing) return
    const geometryKey = accessDrawing === 'route'
      ? 'manualRouteGeometry'
      : accessDrawing === 'first'
        ? 'firstMileGeometry'
        : 'lastMileGeometry'
    const geometry = variantDraft[geometryKey]
    let nextPoint = { lat, lon }
    if (accessDrawing !== 'route' && geometry.length === 0) {
      const join = nearestPointOnRoute(nextPoint, draftRoadRoute.points)
      if (join && join.distanceKm <= ROAD_DIRECTION_CLICK_MAX_KM) {
        setAccessDrawingOrientation('road_to_location')
        setError('')
        setVariantDraft((current) => ({
          ...current,
          [geometryKey]: [join.point]
        }))
        return
      }
      const selectedLocation = accessDrawing === 'first'
        ? draftRouteStops[0]
        : draftRouteStops.at(-1)
      if (!selectedLocation) return
      setAccessDrawingOrientation('location_to_road')
      const initialGeometry: LeadMapCoordinate[] = [
        { lat: selectedLocation.lat, lon: selectedLocation.lon }
      ]
      if (haversineKm(selectedLocation.lat, selectedLocation.lon, lat, lon) >= 0.001) {
        initialGeometry.push(nextPoint)
      }
      setError('')
      setVariantDraft((current) => ({
        ...current,
        [geometryKey]: initialGeometry
      }))
      return
    }
    const previous = geometry.at(-1)
    if (
      previous &&
      haversineKm(previous.lat, previous.lon, nextPoint.lat, nextPoint.lon) < 0.001
    ) return
    setError('')
    setVariantDraft((current) => ({
      ...current,
      [geometryKey]: [...current[geometryKey], nextPoint]
    }))
  }

  const undoAccessDrawingPoint = (): void => {
    if (!accessDrawing) return
    const geometryKey = accessDrawing === 'route'
      ? 'manualRouteGeometry'
      : accessDrawing === 'first'
        ? 'firstMileGeometry'
        : 'lastMileGeometry'
    if (accessDrawing !== 'route') {
      const resetThreshold = accessDrawingOrientation === 'location_to_road' ? 2 : 1
      if (variantDraft[geometryKey].length <= resetThreshold) {
        setVariantDraft((current) => ({ ...current, [geometryKey]: [] }))
        setAccessDrawingOrientation(null)
        return
      }
    }
    setVariantDraft((current) => ({
      ...current,
      [geometryKey]: current[geometryKey].length > 1
        ? current[geometryKey].slice(0, -1)
        : current[geometryKey]
    }))
  }

  const cancelAccessDrawing = (): void => {
    if (!accessDrawing) return
    const geometryKey = accessDrawing === 'route'
      ? 'manualRouteGeometry'
      : accessDrawing === 'first'
        ? 'firstMileGeometry'
        : 'lastMileGeometry'
    setVariantDraft((current) => ({
      ...current,
      [geometryKey]: accessDrawingOriginal.map((point) => ({ ...point }))
    }))
    setAccessDrawing(null)
    setAccessDrawingOrientation(null)
    setAccessDrawingOriginal([])
  }

  const finishAccessDrawing = (): void => {
    if (!accessDrawing) return
    const selectedStart = draftRouteStops[0]
    const selectedEnd = draftRouteStops.at(-1)
    const geometryKey = accessDrawing === 'route'
      ? 'manualRouteGeometry'
      : accessDrawing === 'first'
        ? 'firstMileGeometry'
        : 'lastMileGeometry'
    const distanceKey = accessDrawing === 'route'
      ? 'leadKm'
      : accessDrawing === 'first'
        ? 'firstMileKm'
        : 'lastMileKm'
    const geometry = variantDraft[geometryKey]
    const roadToLocation = accessDrawingOrientation === 'road_to_location'
    const minimumPoints = accessDrawing === 'route' ? 2 : roadToLocation ? 1 : 2
    if (!selectedStart || !selectedEnd || geometry.length < minimumPoints) {
      setError(
        accessDrawing !== 'route' && !accessDrawingOrientation
          ? accessDrawing === 'first'
            ? 'Click once: click the road for Road to Starting, or elsewhere for Starting to Road.'
            : 'Click once: click the road for Road to Ending, or elsewhere for Ending to Road.'
          : 'Click at least one point on the map, then click Finish.'
      )
      return
    }
    let completedGeometry: LeadMapCoordinate[]
    if (accessDrawing !== 'route' && accessDrawingOrientation === 'location_to_road') {
      const join = nearestPointOnRoute(geometry.at(-1)!, draftRoadRoute.points)
      if (!join || join.distanceKm > ROAD_JOIN_SNAP_MAX_KM) {
        setError(`Finish the ${accessDrawing === 'first' ? 'First' : 'Last'} mile by clicking on or close to the blue road route.`)
        return
      }
      completedGeometry = [...geometry.slice(0, -1), join.point]
    } else {
      const destination = accessDrawing === 'route'
        ? selectedEnd
        : accessDrawing === 'first'
          ? selectedStart
          : selectedEnd
      const lastPoint = geometry.at(-1)!
      completedGeometry = haversineKm(
        lastPoint.lat,
        lastPoint.lon,
        destination.lat,
        destination.lon
      ) < 0.002
        ? [...geometry.slice(0, -1), { lat: destination.lat, lon: destination.lon }]
        : [...geometry, { lat: destination.lat, lon: destination.lon }]
    }
    const distanceKm = polylineDistanceKm(completedGeometry)
    setVariantDraft((current) => ({
      ...current,
      [geometryKey]: completedGeometry,
      [distanceKey]: String(distanceKm)
    }))
    setAccessDrawing(null)
    setAccessDrawingOrientation(null)
    setAccessDrawingOriginal([])
    setError('')
  }

  const saveVariant = async (): Promise<void> => {
    const existingVariant = editingVariantId
      ? materialVariants.find((variant) => variant.id === editingVariantId) ?? null
      : null
    const autoRouteReady =
      draftRoadRoute.status === 'ready' &&
      draftRoadRoute.signature === draftRouteSignature &&
      draftRoadRoute.points.length >= 2 &&
      draftRoadRoute.distanceKm !== null
    const firstMileKm = variantDraft.firstMileMode === 'auto'
      ? draftFirstMileAutoKm
      : nonNegativeNumber(variantDraft.firstMileKm)
    const lastMileKm = variantDraft.lastMileMode === 'auto'
      ? draftLastMileAutoKm
      : nonNegativeNumber(variantDraft.lastMileKm)
    const actualLeadKm = variantDraft.distanceMode === 'auto'
      ? firstMileKm === null || lastMileKm === null || draftRoadRoute.distanceKm === null
        ? null
        : roundKm(draftRoadSectionKm + firstMileKm + lastMileKm)
      : numeric(variantDraft.leadKm)
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
    if (accessDrawing) {
      setError('Finish or cancel the access-line drawing before saving the variant.')
      return
    }
    if (variantDraft.viaPointIds.some((pointId) => !pointId)) {
      setError('Choose a point for every intermediate stop, or remove the empty stop.')
      return
    }
    if (variantDraft.distanceMode === 'auto' && (!startLocation || !endLocation)) {
      setError('Choose both starting and ending points for Auto lead, or switch Lead to Manual.')
      return
    }
    if (variantDraft.distanceMode === 'auto' && !autoRouteReady) {
      setError(
        draftRoadRoute.status === 'routing'
          ? 'Wait for the road route calculation to finish.'
          : draftRoadRoute.error || 'A valid road route is required for Auto lead.'
      )
      return
    }
    if (variantDraft.distanceMode === 'auto' && !draftAdoptedRoadRoute.valid) {
      setError(
        'The two access-line road joins cross each other. Redraw one line so the adopted blue road section remains between the two joins.'
      )
      return
    }
    if (
      variantDraft.distanceMode === 'auto' &&
      (firstMileKm === null || lastMileKm === null)
    ) {
      setError('Enter valid non-negative Manual distances for the first-mile and last-mile access gaps.')
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
      id: existingVariant?.id ?? newId(),
      variantName: variantDraft.variantName.trim() || undefined,
      materialName,
      conveyanceClass: variantConveyanceClass,
      assignmentId: materialAssignments.find(
        (assignment) =>
          assignment.pointId === (normalizedStartPointId || normalizedEndPointId)
      )?.id,
      startPointId: normalizedStartPointId,
      viaPointIds: variantDraft.viaPointIds.filter(Boolean),
      endPointId: normalizedEndPointId,
      routeGeometry:
        variantDraft.distanceMode === 'auto'
          ? draftAdoptedRoadRoute.points
          : variantDraft.manualRouteGeometry.length >= 2
            ? variantDraft.manualRouteGeometry
            : undefined,
      firstMileGeometry:
        variantDraft.distanceMode === 'auto' && startLocation && endLocation && draftRoadRoute.points[0]
          ? variantDraft.firstMileMode === 'manual' && variantDraft.firstMileGeometry.length >= 2
            ? variantDraft.firstMileGeometry
            : [
                { lat: startLocation.lat, lon: startLocation.lng },
                draftRoadRoute.points[0]
              ]
          : undefined,
      lastMileGeometry:
        variantDraft.distanceMode === 'auto' && startLocation && endLocation && draftRoadRoute.points.at(-1)
          ? variantDraft.lastMileMode === 'manual' && variantDraft.lastMileGeometry.length >= 2
            ? variantDraft.lastMileGeometry
            : [
                draftRoadRoute.points.at(-1)!,
                { lat: endLocation.lat, lon: endLocation.lng }
              ]
          : undefined,
      routeSource: variantDraft.distanceMode === 'auto' ? 'osrm' : 'manual',
      routeCalculatedAt:
        variantDraft.distanceMode === 'auto' ? new Date().toISOString() : undefined,
      roadRouteKm:
        variantDraft.distanceMode === 'auto' ? draftRoadSectionKm : undefined,
      firstMileMode: variantDraft.distanceMode === 'auto' ? variantDraft.firstMileMode : undefined,
      firstMileKm: variantDraft.distanceMode === 'auto' ? firstMileKm ?? undefined : undefined,
      lastMileMode: variantDraft.distanceMode === 'auto' ? variantDraft.lastMileMode : undefined,
      lastMileKm: variantDraft.distanceMode === 'auto' ? lastMileKm ?? undefined : undefined,
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
      createdAt: existingVariant?.createdAt ?? new Date().toISOString()
    }
    setBusy('save-variant')
    setError('')
    try {
      const linkedTargets = existingVariant
        ? applications
            .filter((application) => application.variantId === existingVariant.id)
            .flatMap((application) => {
              const group = groups.find((candidate) => candidate.key === application.itemKey)
              const target = group ? leadTargetForApplication(group, application) : null
              return target ? [target] : []
            })
        : []
      const refreshedPreviews = await Promise.all(
        linkedTargets.map((target) => calculateTargetPreview(target, variant))
      )

      upsertVariant(variant)
      for (const preview of refreshedPreviews) {
        upsertApplication(previewToApplication(preview, variant))
      }
      setSelectedVariantId(variant.id)
      setVariantDraft(blankVariantDraft(disposalLead))
      setEditingVariantId('')
      setVariantDialogOpen(false)
      setAccessDrawing(null)
      setAccessDrawingOriginal([])
      setNotice(
        existingVariant
          ? `${materialName} variant updated. ${refreshedPreviews.length} linked component usage(s) refreshed.`
          : disposalLead
            ? `${materialName} ${disposalClassLabel(variantConveyanceClass)} variant created.`
            : `${materialName} variant created.`
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this variant.')
    } finally {
      setBusy('')
    }
  }

  const calculateTargetPreview = async (
    target: LeadTarget,
    variant: LeadVariant
  ): Promise<TargetPreview> => {
    const fetchedRecipe = await fetchRateAnalysis(target.usage.node, project.meta.sorYear)
    const recipe = rateAnalysisOverrideForNode(project, target.usage.node) ?? fetchedRecipe
    const info = parseLeadInfo(
      leadMetadataForGroup(
        target.group,
        metadata.get(target.group.code) ?? recipe.leadApplicability
      )
    )
    const liftInfo = liftInfoForData(
      info,
      target.group.description || recipe.description,
      target.group.code
    )
    const quantity = quantityForVariant(recipe, variant, info)
    const addonId = addonLeadRuleForVariant(info, variant)?.addonId
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
      handlingMode: handlingModeForData(info, variant, variant.handlingMode),
      materialName: variant.materialName,
      includedBasis: basisForData(
        info,
        variant.includedBasis,
        `${target.group.description} ${recipe.description}`,
        variant
      ),
      customGrossRate: variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
      chargeCode: variant.chargeCode,
      leadMultiplier: info.policy?.haulLegs ?? 1
    })
    const summary = calculateRateAnalysis(recipe)
    const outputQuantity = recipe.outputQuantity || 1
    const baseFinalAmount =
      Number.isFinite(summary.totalCost) && summary.totalCost > 0
        ? summary.totalCost
        : summary.ratePerUnit * outputQuantity
    const finalAmount = baseFinalAmount + breakdown.grossAmount
    return {
      target,
      addonId,
      quantitySource: quantity.source,
      breakdown,
      outputQuantity,
      baseFinalAmount,
      finalAmount,
      finalRate: finalAmount / outputQuantity
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
    const existing = applicationForLeadTarget(materialApplications, preview.target)
    const handlingWarning = loadingUnloadingCautionForBreakdown(
      preview.breakdown,
      variant.handlingMode
    )
    return {
      id: existing?.id ?? newId(),
      variantId: variant.id,
      addonId: preview.addonId ?? existing?.addonId,
      itemKey: preview.target.group.key,
      itemCode: `${preview.target.group.displayName} · ${preview.target.pathLabel}`,
      itemNodeId: preview.target.usage.node.id,
      quantity: preview.breakdown.quantity,
      quantitySource: preview.quantitySource,
      unit: preview.breakdown.unit,
      leadRate: preview.breakdown.leadRate,
      loadingRate: preview.breakdown.loadingRate,
      unloadingRate: preview.breakdown.unloadingRate,
      liftRate: preview.breakdown.liftRate,
      grossRate: preview.breakdown.grossRate,
      grossAmount: preview.breakdown.grossAmount,
      outputQuantity: preview.outputQuantity,
      rateAddition: preview.breakdown.grossAmount / preview.outputQuantity,
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

  const openVariantEditor = (variant: LeadVariant): void => {
    const assignmentPointId = variant.assignmentId
      ? assignments.find((assignment) => assignment.id === variant.assignmentId)?.pointId ?? ''
      : ''
    setEditingVariantId(variant.id)
    setVariantDraft(variantDraftForEdit(variant, disposalLead, assignmentPointId))
    setAccessDrawing(null)
    setAccessDrawingOriginal([])
    setVariantDialogOpen(true)
    setError('')
  }

  const applyTargets = async (targetsToApply: LeadTarget[]): Promise<void> => {
    if (!selectedVariant || targetsToApply.length === 0) return
    if (selectedVariantNeedsAnyOverride) {
      setError('This Lead variant needs caution approval. Use Add anyway on each DATA item and record the reason.')
      return
    }
    setBusy('apply-all')
    setError('')
    try {
      for (const target of targetsToApply) {
        const preview = await calculateTargetPreview(target, selectedVariant)
        upsertApplication(previewToApplication(preview, selectedVariant))
      }
      setSelectedTargetKeys(new Set())
      setNotice(
        `${selectedVariant.materialName} ${selectedVariant.chargeCode ?? 'AUTO'} applied to ${targetsToApply.length} component usage(s).`
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to apply Lead to selected DATA.')
    } finally {
      setBusy('')
    }
  }

  const openOverrideDialog = (target: LeadTarget): void => {
    const deliveryAtSite = needsDeliveryAtSiteOverride(selectedVariant)
    const loadingUnloading = needsLoadingUnloadingOverride(selectedVariant)
    setOverrideDraft({
      target,
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
    setBusy(`override:${overrideDraft.target.key}`)
    setError('')
    try {
      const preview = await calculateTargetPreview(overrideDraft.target, selectedVariant)
      upsertApplication(previewToApplication(preview, selectedVariant, {
        deliveryAtSite: overrideDraft.deliveryAtSite ? reason : undefined,
        loadingUnloading: overrideDraft.loadingUnloading ? reason : undefined
      }))
      setNotice(
        `Lead added to ${overrideDraft.target.group.displayName} in ${overrideDraft.target.pathLabel} with caution reason.`
      )
      setOverrideDraft(null)
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Unable to add Cement/Steel lead.')
    } finally {
      setBusy('')
    }
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
          <button
            className="btn"
            onClick={() => {
              setEditingVariantId('')
              setVariantDraft(blankVariantDraft(disposalLead))
              setAccessDrawing(null)
              setAccessDrawingOriginal([])
              setVariantDialogOpen(true)
              setError('')
            }}
          >
            <Plus size={15} /> Create Variant
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
        <span>{materialApplications.length} linked component usage(s)</span>
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
      {pointDialogOpen && (
        <div className="lead-split-dialog-backdrop" role="presentation">
          <div
            className="lead-split-dialog lead-point-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={disposalLead ? 'Create dump area' : 'Create point'}
          >
            <div className="lead-dialog-title-row">
              <div>
                <div className="card-title">{disposalLead ? 'Create Dump Area' : 'Create Point'}</div>
                <small>Create a mapped point for {materialName}.</small>
              </div>
              <button
                className="btn ghost"
                type="button"
                disabled={pointPicking}
                onClick={() => {
                  setPointDialogOpen(false)
                  setPointPicking(false)
                  setPointLocationPicked(false)
                }}
              >
                Cancel
              </button>
            </div>
            {disposalLead && (
              <div className="lead-rule-help">
                Disposal routes run from the work location to the selected approved dump area.
              </div>
            )}
            <fieldset className="lead-point-form" disabled={pointPicking}>
              <div className="lead-form-grid">
              {!disposalLead && (
                <label className="span-2">
                  Point role
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
                  autoFocus
                  value={sourceDraft.code}
                  onChange={(event) =>
                    setSourceDraft((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase()
                    }))
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
                  readOnly
                  value={sourceDraft.lat}
                  placeholder="Select on map"
                />
              </label>
              <label>
                Longitude
                <input
                  className="text-input"
                  readOnly
                  value={sourceDraft.lon}
                  placeholder="Select on map"
                />
              </label>
              </div>
            </fieldset>
            <div className={`lead-point-picker-shell ${pointPicking ? 'picking' : ''}`}>
              <div className="lead-point-picker-heading">
                <span>
                  {pointPicking
                    ? 'Click the required position on the map'
                    : pointLocationPicked
                      ? 'Location confirmed'
                      : 'Location is required'}
                </span>
                {pointPicking && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setPointPicking(false)}
                  >
                    Cancel picking
                  </button>
                )}
              </div>
              <PointPickerMap
                site={site}
                points={materialMapPoints}
                value={mapCoordinateFromDraft(sourceDraft)}
                active={pointPicking}
                onPick={(lat, lon) => {
                  setSourceDraft((current) => ({
                    ...current,
                    lat: lat.toFixed(6),
                    lon: lon.toFixed(6)
                  }))
                  setPointLocationPicked(true)
                  setPointPicking(false)
                  setError('')
                }}
              />
            </div>
            <button
              className="btn ghost lead-point-map-picker"
              type="button"
              disabled={pointPicking}
              onClick={() => {
                setPointPicking(true)
                setError('')
              }}
            >
              <MapPin size={15} /> {pointLocationPicked ? 'Change map location' : 'Pick location on the map'}
            </button>
            {error && <div className="rate-warning">{error}</div>}
            <div className="lead-split-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setSourceDraft((current) => ({ ...current, lat: '', lon: '' }))
                  setPointLocationPicked(false)
                }}
                disabled={pointPicking || !pointLocationPicked}
              >
                Clear Location
              </button>
              <button
                className="btn"
                type="button"
                onClick={addSource}
                disabled={
                  pointPicking ||
                  !pointLocationPicked ||
                  !sourceDraft.code.trim() ||
                  !validMapCoordinate(sourceDraft)
                }
              >
                <Plus size={15} /> {disposalLead ? 'Create Dump Area' : 'Create Point'}
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
                <strong>{overrideDraft.target.group.displayName}</strong>
                {overrideDraft.target.group.displayName !== overrideDraft.target.group.code && (
                  <em>{overrideDraft.target.group.code}</em>
                )}
              </div>
              <span>{overrideDraft.target.pathLabel}</span>
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
        <section className="lead-main-panel lead-map-view-panel">
          <div className="lead-panel-title-row">
            <div>
              <div className="card-title">Route Viewer</div>
              <small>Viewing {materialName} points, variants, and linked component usages.</small>
            </div>
            <div className="lead-map-heading-actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSourceDraft(blankSourceDraft(points, materialName, disposalLead))
                  setPointDialogOpen(true)
                  setPointPicking(false)
                  setPointLocationPicked(false)
                  setError('')
                }}
              >
                <MapPin size={15} /> {disposalLead ? 'Create Dump Area' : 'Create Point'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setMapEditingOpen((open) => !open)}
              >
                <Settings size={15} /> Map Editing
              </button>
            </div>
          </div>
          <LeadMap
            site={site}
            points={materialMapPoints}
            variants={materialVariants}
            applications={materialApplications}
            assignments={assignments}
            directions={mapDirections}
            directionDraft={directionDraft}
            draftVariantRoute={
              variantDialogOpen && variantDraft.distanceMode === 'auto'
                ? {
                    status: draftRoadRoute.status,
                    points:
                      draftRoadRoute.signature === draftRouteSignature
                        ? draftRoadRoute.points
                        : [],
                    stops: draftRouteStops,
                    distanceKm:
                      draftRoadRoute.signature === draftRouteSignature
                        ? draftRoadRoute.distanceKm
                        : null,
                    error: draftRoadRoute.error
                  }
                : null
            }
            selectedVariantId={selectedVariant?.id ?? ''}
            draft={null}
            onDeletePoint={deleteMapPoint}
            onPick={(lat, lon) => {
              if (directionDrawing) {
                setDirectionDraft((current) => ({
                  ...current,
                  points: [...current.points, { lat, lon }]
                }))
                return
              }
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
                const viaLabels = (variant.viaPointIds ?? []).map(
                  (pointId) => pointsById.get(pointId)?.code ?? 'Work Location'
                )
                const hasStoredRoute = Boolean(
                  variant.startPointId ||
                  variant.endPointId ||
                  variant.viaPointIds?.length ||
                  variant.routeGeometry?.length ||
                  assignment
                )
                const startLabel = startPoint?.code ?? (hasStoredRoute ? 'Work Location' : '')
                const endLabel = endPoint?.code ?? (hasStoredRoute ? 'Work Location' : '')
                const variantTitle = variant.variantName || startLabel || endLabel || 'Manual lead'
                const routeLabel = hasStoredRoute
                  ? [startLabel || 'Work Location', ...viaLabels, endLabel || 'Work Location'].join(' → ')
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
                      <b>{linked.length} component{linked.length === 1 ? '' : 's'}</b>
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
                        <span>No component usage linked.</span>
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
                    <div className="lead-card-actions">
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => openVariantEditor(variant)}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        className="btn ghost lead-card-delete"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => removeVariant(variant.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {variantDialogOpen && (
          <div className="lead-split-dialog-backdrop" role="presentation">
            <section
              className="lead-split-dialog lead-variant-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={editingVariantId ? 'Edit variant' : 'Create variant'}
            >
          <div className="lead-dialog-title-row">
            <div>
              <div className="card-title">{editingVariantId ? 'Edit Variant' : 'Create Variant'}</div>
              <small>Choose the ordered route. Lead is calculated from the displayed road route.</small>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setVariantDialogOpen(false)
                setEditingVariantId('')
                setVariantDraft(blankVariantDraft(disposalLead))
                setAccessDrawing(null)
                setAccessDrawingOriginal([])
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
          <VariantRoutePreviewMap
            site={site}
            points={variantPointOptions}
            stops={draftRouteStops}
            route={draftRoadRoute}
            distanceMode={variantDraft.distanceMode}
            manualRoute={variantDraft.manualRouteGeometry}
            adoptedRoadRoute={draftAdoptedRoadRoute.points}
            adoptedRoadDistanceKm={draftRoadSectionKm}
            firstMile={{
              mode: variantDraft.firstMileMode,
              distanceKm: draftFirstMileKm,
              geometry: variantDraft.firstMileGeometry
            }}
            lastMile={{
              mode: variantDraft.lastMileMode,
              distanceKm: draftLastMileKm,
              geometry: variantDraft.lastMileGeometry
            }}
            drawing={accessDrawing}
            drawingOrientation={accessDrawingOrientation}
            onDrawPoint={addAccessDrawingPoint}
            onUndoDrawing={undoAccessDrawingPoint}
            onFinishDrawing={finishAccessDrawing}
            onCancelDrawing={cancelAccessDrawing}
          />
          {error && <div className="rate-warning">{error}</div>}
          <div
            className={`lead-form-grid ${accessDrawing ? 'access-drawing' : ''}`}
            aria-disabled={Boolean(accessDrawing)}
          >
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
                  setVariantDraft((current) => clearDrawnRouteGeometry({
                    ...current,
                    startPointId: event.target.value
                  }))
                }
              >
                <option value="">No starting point / manual only</option>
                {variantPointOptions
                  .filter(
                    (point) =>
                      point.id === variantDraft.startPointId ||
                      (point.id !== variantDraft.endPointId &&
                        !variantDraft.viaPointIds.includes(point.id))
                  )
                  .map((point) => (
                    <option key={point.id} value={point.id}>
                      {pointOptionLabel(point)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="lead-via-stops span-2">
              <div className="lead-via-heading">
                <span>Intermediate stops</span>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() =>
                    setVariantDraft((current) => clearDrawnRouteGeometry({
                      ...current,
                      viaPointIds: [...current.viaPointIds, '']
                    }))
                  }
                >
                  <Plus size={14} /> Add stop
                </button>
              </div>
              {variantDraft.viaPointIds.length === 0 ? (
                <small>No intermediate stops. The route will go directly from start to end.</small>
              ) : (
                variantDraft.viaPointIds.map((pointId, index) => (
                  <div className="lead-via-row" key={`via-${index}`}>
                    <b>{index + 1}</b>
                    <select
                      className="select-input"
                      value={pointId}
                      onChange={(event) =>
                        setVariantDraft((current) => clearDrawnRouteGeometry({
                          ...current,
                          viaPointIds: current.viaPointIds.map((candidate, candidateIndex) =>
                            candidateIndex === index ? event.target.value : candidate
                          )
                        }))
                      }
                    >
                      <option value="">Choose intermediate point</option>
                      {variantPointOptions
                        .filter(
                          (point) =>
                            point.id === pointId ||
                            (point.id !== variantDraft.startPointId &&
                              point.id !== variantDraft.endPointId &&
                              !variantDraft.viaPointIds.includes(point.id))
                        )
                        .map((point) => (
                          <option key={point.id} value={point.id}>
                            {pointOptionLabel(point)}
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn ghost icon-only"
                      type="button"
                      title="Move stop up"
                      disabled={index === 0}
                      onClick={() =>
                        setVariantDraft((current) => clearDrawnRouteGeometry({
                          ...current,
                          viaPointIds: moveArrayItem(current.viaPointIds, index, index - 1)
                        }))
                      }
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="btn ghost icon-only"
                      type="button"
                      title="Move stop down"
                      disabled={index === variantDraft.viaPointIds.length - 1}
                      onClick={() =>
                        setVariantDraft((current) => clearDrawnRouteGeometry({
                          ...current,
                          viaPointIds: moveArrayItem(current.viaPointIds, index, index + 1)
                        }))
                      }
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="btn ghost icon-only"
                      type="button"
                      title="Remove stop"
                      onClick={() =>
                        setVariantDraft((current) => clearDrawnRouteGeometry({
                          ...current,
                          viaPointIds: current.viaPointIds.filter(
                            (_, candidateIndex) => candidateIndex !== index
                          )
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <label className="span-2">
              Ending
              <select
                className="select-input"
                value={variantDraft.endPointId}
                onChange={(event) =>
                  setVariantDraft((current) => clearDrawnRouteGeometry({
                    ...current,
                    endPointId: event.target.value
                  }))
                }
              >
                <option value="">No ending point / manual only</option>
                {variantPointOptions
                  .filter(
                    (point) =>
                      point.id === variantDraft.endPointId ||
                      (point.id !== variantDraft.startPointId &&
                        !variantDraft.viaPointIds.includes(point.id))
                  )
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
            {variantDraft.distanceMode === 'auto' ? (
              <label className="span-2">
                Calculated total lead km
                <input className="text-input" type="number" step="0.001" readOnly value={variantDraft.leadKm} />
              </label>
            ) : (
              <div className="lead-manual-route-entry span-2">
                <label>
                  Manual adopted lead km
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.001"
                    value={variantDraft.leadKm}
                    onChange={(event) =>
                      setVariantDraft((current) => ({ ...current, leadKm: event.target.value }))
                    }
                  />
                </label>
                <div className="lead-access-draw-action">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={accessDrawing !== null || draftRouteStops.length < 2}
                    onClick={() => startAccessDrawing('route')}
                  >
                    <Route size={14} />
                    {variantDraft.manualRouteGeometry.length >= 2 ? 'Redraw line' : 'Draw line'}
                  </button>
                  <small>
                    {variantDraft.manualRouteGeometry.length >= 2
                      ? `${variantDraft.manualRouteGeometry.length} line points saved; distance follows the drawn line.`
                      : 'Draw the complete manually adopted route from starting to ending location.'}
                  </small>
                </div>
              </div>
            )}
            {variantDraft.distanceMode === 'auto' && (
              <div className={`lead-routing-status ${draftRoadRoute.status} span-2`}>
                {draftRoadRoute.status === 'idle' && (
                  <span>Choose start and end points to calculate the road route.</span>
                )}
                {draftRoadRoute.status === 'routing' && (
                  <span>Calculating the road route through {Math.max(draftRouteStops.length - 2, 0)} intermediate stop(s)…</span>
                )}
                {draftRoadRoute.status === 'ready' && draftRoadRoute.distanceKm !== null && (
                  <>
                    <strong>Total lead: {km.format(draftRouteTotalKm)} km</strong>
                    <span>
                      Road {km.format(draftRoadSectionKm)} km + first mile{' '}
                      {km.format(draftFirstMileKm)} km + last mile {km.format(draftLastMileKm)} km
                    </span>
                    <span>
                      {draftRouteStops.map((stop) => stop.label).join(' → ')}
                    </span>
                  </>
                )}
                {draftRoadRoute.status === 'error' && (
                  <>
                    <strong>Road route unavailable</strong>
                    <span>{draftRoadRoute.error}</span>
                    <small>Retry by changing a stop, or choose Manual and enter an approved distance.</small>
                  </>
                )}
              </div>
            )}
            {variantDraft.distanceMode === 'auto' &&
              draftRoadRoute.status === 'ready' &&
              !draftAdoptedRoadRoute.valid && (
                <div className="rate-warning span-2">
                  The two access-line road joins cross each other. Redraw one line so the adopted
                  blue road section remains between the two road joins.
                </div>
              )}
            {variantDraft.distanceMode === 'auto' && (
              <>
                <AccessDistanceControl
                  title="First mile"
                  description={variantDraft.firstMileMode === 'manual' && variantDraft.firstMileGeometry.length >= 2
                    ? draftFirstMileOrientation === 'road_to_location'
                      ? 'Detected: Road → Starting location.'
                      : 'Detected: Starting location → Road.'
                    : 'First map click decides: road click = Road → Starting; elsewhere = Starting → Road.'}
                  mode={variantDraft.firstMileMode}
                  manualValue={variantDraft.firstMileKm}
                  autoKm={draftFirstMileAutoKm}
                  drawnPointCount={variantDraft.firstMileGeometry.length}
                  drawing={accessDrawing === 'first'}
                  canDraw={draftRoadRoute.status === 'ready' && accessDrawing === null}
                  onModeChange={(mode) =>
                    setVariantDraft((current) => ({ ...current, firstMileMode: mode }))
                  }
                  onManualValueChange={(value) =>
                    setVariantDraft((current) => ({ ...current, firstMileKm: value }))
                  }
                  onDraw={() => startAccessDrawing('first')}
                />
                <AccessDistanceControl
                  title="Last mile"
                  description={variantDraft.lastMileMode === 'manual' && variantDraft.lastMileGeometry.length >= 2
                    ? draftLastMileOrientation === 'road_to_location'
                      ? 'Detected: Road → Ending location.'
                      : 'Detected: Ending location → Road.'
                    : 'First map click decides: road click = Road → Ending; elsewhere = Ending → Road.'}
                  mode={variantDraft.lastMileMode}
                  manualValue={variantDraft.lastMileKm}
                  autoKm={draftLastMileAutoKm}
                  drawnPointCount={variantDraft.lastMileGeometry.length}
                  drawing={accessDrawing === 'last'}
                  canDraw={draftRoadRoute.status === 'ready' && accessDrawing === null}
                  onModeChange={(mode) =>
                    setVariantDraft((current) => ({ ...current, lastMileMode: mode }))
                  }
                  onManualValueChange={(value) =>
                    setVariantDraft((current) => ({ ...current, lastMileKm: value }))
                  }
                  onDraw={() => startAccessDrawing('last')}
                />
              </>
            )}
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
          <div className="lead-variant-dialog-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                const editingVariant = materialVariants.find((variant) => variant.id === editingVariantId)
                if (editingVariant) openVariantEditor(editingVariant)
                else setVariantDraft(blankVariantDraft(disposalLead))
                setAccessDrawing(null)
                setAccessDrawingOriginal([])
                setError('')
              }}
            >
              <RefreshCcw size={15} /> Reset
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setVariantDialogOpen(false)
                setEditingVariantId('')
                setVariantDraft(blankVariantDraft(disposalLead))
                setAccessDrawing(null)
                setAccessDrawingOriginal([])
                setError('')
              }}
            >
              Cancel
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy === 'save-variant'}
              onClick={() => void saveVariant()}
            >
              {editingVariantId ? <Check size={15} /> : <Plus size={15} />}
              {busy === 'save-variant'
                ? 'Saving…'
                : editingVariantId
                  ? 'Save Variant'
                  : 'Create Variant'}
            </button>
          </div>
            </section>
          </div>
        )}

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
              className="btn"
              disabled={
                !selectedVariant ||
                selectedVariantNeedsAnyOverride ||
                !applyableTargets.some((target) => selectedTargetKeys.has(target.key)) ||
                busy === 'apply-all'
              }
              onClick={() =>
                void applyTargets(
                  applyableTargets.filter((target) => selectedTargetKeys.has(target.key))
                )
              }
              title={
                selectedVariantNeedsAnyOverride
                  ? 'This Lead variant needs Add anyway with a caution reason.'
                  : undefined
              }
            >
              <Check size={14} /> {busy === 'apply-all' ? 'Applying...' : 'Apply Checked'}
            </button>
            <button
              className="btn ghost"
              disabled={
                !selectedVariant ||
                selectedVariantNeedsAnyOverride ||
                applyableTargets.length === 0 ||
                busy === 'apply-all'
              }
              onClick={() => {
                if (!selectedVariant) return
                const confirmed = window.confirm(
                  `Apply ${selectedVariant.variantName || `${km.format(selectedVariant.leadKm)} km ${selectedVariant.materialName}`} to every eligible component usage (${applyableTargets.length})? Existing variants on those usages will be replaced.`
                )
                if (confirmed) void applyTargets(applyableTargets)
              }}
              title={
                selectedVariantNeedsAnyOverride
                  ? 'This Lead variant needs Add anyway with a caution reason.'
                  : undefined
              }
            >
              <Check size={14} /> Apply to every component
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
                const groupLeadRef = leadRefForGroup(
                  group,
                  leadMetadataForGroup(group, metadata.get(group.code)),
                  materialName,
                  conveyanceClass,
                  disposalLead
                )
                const groupCanApplySelectedVariant = Boolean(
                  selectedVariant &&
                    isEligibleForLead(
                      group,
                      selectedVariant,
                      parseLeadInfo(leadMetadataForGroup(group, metadata.get(group.code)))
                    )
                )
                const needsOverride = needsDeliveryAtSiteOverride(selectedVariant)
                const needsLoadingOverride = needsLoadingUnloadingOverride(selectedVariant)
                const needsAnyOverride = needsOverride || needsLoadingOverride
                const showDeliveryWarning = needsOverride || (selectedMaterialIsDeliveryAtSite && !selectedVariant)
                const targets = group.usages.map((usage) => leadTargetForUsage(group, usage))
                const anyApplied = targets.some((target) =>
                  Boolean(applicationForLeadTarget(materialApplications, target))
                )
                return (
                  <div className={`lead-target-card ${anyApplied ? 'applied' : ''}`} key={group.key}>
                    <div className="lead-target-data-head">
                      <div>
                        <strong>{group.displayName}</strong>
                        {group.displayName !== group.code && <em>{group.code}</em>}
                        <span>{group.description}</span>
                      </div>
                      <b>
                        Used in {targets.length} component{targets.length === 1 ? '' : 's'}
                      </b>
                    </div>
                    <div className="lead-target-scopes">
                      {targets.map((target) => {
                        const applied = applicationForLeadTarget(materialApplications, target)
                        const appliedVariant = applied
                          ? materialVariants.find((variant) => variant.id === applied.variantId) ?? null
                          : null
                        const appliedToSelectedVariant = applied?.variantId === selectedVariant?.id
                        const canSelect = groupCanApplySelectedVariant && !needsAnyOverride
                        const loadingUnloadingWarning =
                          applied?.handlingWarning ?? selectedLoadingUnloadingCaution
                        const appliedVariantLabel = appliedVariant
                          ? appliedVariant.variantName || `${km.format(appliedVariant.leadKm)} km variant`
                          : 'Stored variant'
                        return (
                          <div
                            className={`lead-target-scope ${applied ? 'applied' : ''} ${selectedTargetKeys.has(target.key) ? 'selected' : ''}`}
                            key={target.key}
                          >
                            <label className="lead-target-check">
                              <input
                                type="checkbox"
                                disabled={!canSelect}
                                checked={selectedTargetKeys.has(target.key)}
                                onChange={(event) =>
                                  setSelectedTargetKeys((current) => {
                                    const next = new Set(current)
                                    if (event.target.checked) next.add(target.key)
                                    else next.delete(target.key)
                                    return next
                                  })
                                }
                              />
                            </label>
                            <button
                              className="lead-target-copy"
                              disabled={!canSelect}
                              onClick={() =>
                                setSelectedTargetKeys((current) => {
                                  const next = new Set(current)
                                  if (next.has(target.key)) next.delete(target.key)
                                  else next.add(target.key)
                                  return next
                                })
                              }
                            >
                              <strong>{target.pathLabel}</strong>
                              <small>
                                {applied
                                  ? appliedToSelectedVariant
                                    ? `${appliedVariantLabel} applied · Rs. ${money.format(applied.grossAmount)}`
                                    : `${appliedVariantLabel} applied · Rs. ${money.format(applied.grossAmount)}`
                                  : selectedVariant && !groupCanApplySelectedVariant && groupLeadRef
                                    ? `Needs ${disposalLead ? disposalClassLabel(groupLeadRef.conveyanceClass) : conveyanceClassLabel(groupLeadRef.conveyanceClass)} variant`
                                    : needsOverride
                                      ? 'Cement/Steel delivery-at-site guard: use Add anyway with reason'
                                      : needsLoadingOverride
                                        ? 'Loading/unloading caution: use Add anyway with reason'
                                        : showDeliveryWarning
                                          ? `Create a ${materialName} variant first; external lead will require Add anyway`
                                          : 'Not applied'}
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
                              {needsAnyOverride && groupCanApplySelectedVariant && !appliedToSelectedVariant && (
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busy === `override:${target.key}`}
                                  onClick={() => openOverrideDialog(target)}
                                >
                                  Add anyway
                                </button>
                              )}
                              {applied && (
                                <button
                                  className="btn ghost"
                                  type="button"
                                  onClick={() => removeApplication(applied.id)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
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

function AccessDistanceControl({
  title,
  description,
  mode,
  manualValue,
  autoKm,
  drawnPointCount,
  drawing,
  canDraw,
  onModeChange,
  onManualValueChange,
  onDraw
}: {
  title: string
  description: string
  mode: 'auto' | 'manual'
  manualValue: string
  autoKm: number
  drawnPointCount: number
  drawing: boolean
  canDraw: boolean
  onModeChange: (mode: 'auto' | 'manual') => void
  onManualValueChange: (value: string) => void
  onDraw: () => void
}): JSX.Element {
  return (
    <div className="lead-access-distance span-2">
      <div className="lead-access-distance-heading">
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <div className="lead-segmented">
          <button
            type="button"
            className={mode === 'auto' ? 'active' : ''}
            onClick={() => onModeChange('auto')}
          >
            Auto
          </button>
          <button
            type="button"
            className={mode === 'manual' ? 'active' : ''}
            onClick={() => onModeChange('manual')}
          >
            Manual
          </button>
        </div>
      </div>
      {mode === 'auto' ? (
        <div className="lead-access-distance-value">
          Straight-line gap: <strong>{km.format(autoKm)} km</strong>
        </div>
      ) : (
        <div className="lead-access-manual">
          <label>
            Adopted access distance km
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.001"
              placeholder="Required"
              value={manualValue}
              onChange={(event) => onManualValueChange(event.target.value)}
            />
          </label>
          <div className="lead-access-draw-action">
            <button
              className="btn ghost"
              type="button"
              disabled={!canDraw || drawing}
              onClick={onDraw}
            >
              <Route size={14} />
              {drawing ? 'Drawing…' : drawnPointCount >= 2 ? 'Redraw line' : 'Draw line'}
            </button>
            <small>
              {drawing
                ? 'Click the map to add line points.'
                : drawnPointCount >= 2
                  ? `${drawnPointCount} line points saved; distance follows the drawn line.`
                  : canDraw
                    ? 'Draw the unrecorded access path on the map.'
                    : 'Road route must finish before drawing.'}
            </small>
          </div>
        </div>
      )}
    </div>
  )
}

interface DraftVariantRouteView {
  status: DraftRoadRoute['status']
  points: LeadMapCoordinate[]
  stops: DraftRouteStop[]
  distanceKm: number | null
  error?: string
}

function PointPickerMap({
  site,
  points,
  value,
  active,
  onPick
}: {
  site: ProjectLocation | null
  points: LeadSelectablePoint[]
  value: LeadMapCoordinate | null
  active: boolean
  onPick: (lat: number, lon: number) => void
}): JSX.Element {
  const center: [number, number] = value
    ? [value.lat, value.lon]
    : site
      ? [site.lat, site.lng]
      : points[0]
        ? [points[0].lat, points[0].lon]
        : TELANGANA_CENTER
  const visibleCoordinates: LeadMapCoordinate[] = value
    ? [value]
    : site
      ? [{ lat: site.lat, lon: site.lng }]
      : points.map((point) => ({ lat: point.lat, lon: point.lon }))

  return (
    <div className="lead-point-picker-map">
      <MapContainer center={center} zoom={value ? 14 : site || points.length ? 11 : 7} scrollWheelZoom>
        <MapLayers />
        <MapPointsViewport points={visibleCoordinates} singleZoom={value ? 14 : 11} />
        <PointPickerClick active={active} onPick={onPick} />
        {site && (
          <Marker
            position={[site.lat, site.lng]}
            icon={leadMapPinIcon('P', '#0e639c', 'project')}
          >
            <Tooltip direction="top" offset={[0, -38]}>Work Location</Tooltip>
          </Marker>
        )}
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lon]}
            icon={leadMapPinIcon(point.code.slice(0, 1) || 'P', '#777')}
          >
            <Tooltip direction="top" offset={[0, -38]}>
              {point.code}{point.name ? ` - ${point.name}` : ''}
            </Tooltip>
          </Marker>
        ))}
        {value && (
          <Marker
            position={[value.lat, value.lon]}
            icon={leadMapPinIcon('✓', '#16a085', 'draft')}
            zIndexOffset={1000}
          >
            <Tooltip permanent direction="top" offset={[0, -38]}>Selected location</Tooltip>
          </Marker>
        )}
      </MapContainer>
      {active && <div className="lead-point-picker-overlay">Click map to confirm location</div>}
    </div>
  )
}

function VariantRoutePreviewMap({
  site,
  points,
  stops,
  route,
  distanceMode,
  manualRoute,
  adoptedRoadRoute,
  adoptedRoadDistanceKm,
  firstMile,
  lastMile,
  drawing,
  drawingOrientation,
  onDrawPoint,
  onUndoDrawing,
  onFinishDrawing,
  onCancelDrawing
}: {
  site: ProjectLocation | null
  points: LeadSelectablePoint[]
  stops: DraftRouteStop[]
  route: DraftRoadRoute
  distanceMode: 'auto' | 'manual'
  manualRoute: LeadMapCoordinate[]
  adoptedRoadRoute: LeadMapCoordinate[]
  adoptedRoadDistanceKm: number
  firstMile: { mode: 'auto' | 'manual'; distanceKm: number; geometry: LeadMapCoordinate[] }
  lastMile: { mode: 'auto' | 'manual'; distanceKm: number; geometry: LeadMapCoordinate[] }
  drawing: AccessDrawingTarget | null
  drawingOrientation: AccessDrawingOrientation | null
  onDrawPoint: (lat: number, lon: number) => void
  onUndoDrawing: () => void
  onFinishDrawing: () => void
  onCancelDrawing: () => void
}): JSX.Element {
  const center: [number, number] = site
    ? [site.lat, site.lng]
    : stops[0]
      ? [stops[0].lat, stops[0].lon]
      : TELANGANA_CENTER
  const roadGuideRoute = route.status === 'ready' && route.points.length >= 2 ? route.points : []
  const displayedRoute = distanceMode === 'auto' ? adoptedRoadRoute : manualRoute
  const defaultFirstMile = roadGuideRoute[0] && stops[0]
    ? [stops[0], roadGuideRoute[0]]
    : []
  const defaultLastMile = roadGuideRoute.at(-1) && stops.at(-1)
    ? [roadGuideRoute.at(-1)!, stops.at(-1)!]
    : []
  const firstMilePoints = firstMile.mode === 'manual' && firstMile.geometry.length
    ? firstMile.geometry
    : defaultFirstMile
  const lastMilePoints = lastMile.mode === 'manual' && lastMile.geometry.length
    ? lastMile.geometry
    : defaultLastMile
  const drawingGeometry = drawing === 'route'
    ? manualRoute
    : drawing === 'first'
      ? firstMile.geometry
      : drawing === 'last'
        ? lastMile.geometry
        : []
  const viewportPoints = [
    ...roadGuideRoute,
    ...(drawing ? [] : displayedRoute),
    ...stops,
    ...(drawing || distanceMode === 'manual' ? [] : [...firstMilePoints, ...lastMilePoints])
  ]
  const drawingRoadToLocation = drawingOrientation === 'road_to_location'
  const drawingCanUndo = drawingRoadToLocation
    ? drawingGeometry.length > 0
    : drawingGeometry.length > 1
  const drawingCanFinish = drawingRoadToLocation
    ? drawingGeometry.length >= 1
    : drawingGeometry.length >= 2
  const selectedPointIds = new Set(stops.map((stop) => stop.id))

  return (
    <div className="lead-variant-preview">
      <div className="lead-variant-preview-heading">
        <strong>Route preview</strong>
        <span>
          {distanceMode === 'manual'
            ? manualRoute.length >= 2
              ? `${km.format(polylineDistanceKm(manualRoute))} km drawn manual lead`
              : 'Enter a distance or draw the manual lead'
            : route.status === 'routing'
            ? 'Calculating road route…'
            : route.status === 'ready' && route.distanceKm !== null
              ? `${km.format(
                  roundKm(adoptedRoadDistanceKm + firstMile.distanceKm + lastMile.distanceKm)
                )} km total lead`
              : route.status === 'error'
                ? 'Road route unavailable'
                : 'Choose starting and ending points'}
        </span>
      </div>
      <div className={`lead-variant-preview-map ${drawing ? 'drawing' : ''}`}>
        {drawing && (
          <div className="lead-access-draw-toolbar" role="toolbar" aria-label="Access line drawing tools">
            <span>
              <Route size={15} /> Line tool:{' '}
              {drawing === 'route' ? 'Manual lead' : drawing === 'first' ? 'First mile' : 'Last mile'}
              <small>
                {drawing === 'route'
                  ? 'Starting location is fixed. Add turns; Finish connects to the ending location.'
                  : !drawingOrientation
                    ? drawing === 'first'
                      ? 'First click decides: click the road for Road → Starting; click elsewhere for Starting → Road.'
                      : 'First click decides: click the road for Road → Ending; click elsewhere for Ending → Road.'
                  : drawingRoadToLocation
                    ? `Snapped to the blue road. Add turns toward the ${drawing === 'first' ? 'starting' : 'ending'} location.`
                    : `${drawing === 'first' ? 'Starting' : 'Ending'} location is fixed. Add turns and finish on the blue road.`}
              </small>
            </span>
            <button
              className="btn ghost"
              type="button"
              disabled={!drawingCanUndo}
              onClick={onUndoDrawing}
            >
              <RefreshCcw size={14} /> Undo
            </button>
            <button className="btn ghost" type="button" onClick={onCancelDrawing}>
              Cancel
            </button>
            <button
              className="btn"
              type="button"
              disabled={!drawingCanFinish}
              onClick={onFinishDrawing}
            >
              <Check size={14} /> Finish
            </button>
          </div>
        )}
        <MapContainer center={center} zoom={site || stops.length ? 10 : 7} scrollWheelZoom>
          <MapLayers />
          <MapPointsViewport points={viewportPoints} singleZoom={12} />
          <AccessLineDrawingEvents active={Boolean(drawing)} onDrawPoint={onDrawPoint} />
          {points
            .filter((point) => !selectedPointIds.has(point.id) && point.id !== PROJECT_WORK_POINT_ID)
            .map((point) => (
              <Marker
                key={point.id}
                position={[point.lat, point.lon]}
                icon={leadMapPinIcon(point.code.slice(0, 1) || 'P', '#666')}
                opacity={0.65}
              >
                <Tooltip direction="top" offset={[0, -38]}>{pointOptionLabel(point)}</Tooltip>
              </Marker>
            ))}
          {distanceMode === 'auto' && roadGuideRoute.length >= 2 && (
            <Polyline
              positions={roadGuideRoute.map((point) => [point.lat, point.lon])}
              pathOptions={{ color: '#64748b', weight: 7, opacity: 0.55, dashArray: '3 7' }}
            >
              <Tooltip sticky>Full OSRM road route · click anywhere on this line to join</Tooltip>
            </Polyline>
          )}
          {displayedRoute.length >= 2 && (
            <Polyline
              positions={displayedRoute.map((point) => [point.lat, point.lon])}
              pathOptions={{
                color: '#00a6ff',
                weight: 6,
                opacity: 0.95,
              }}
            />
          )}
          {distanceMode === 'auto' && firstMilePoints.length >= 2 && (
            <Polyline
              positions={firstMilePoints.map((point) => [point.lat, point.lon])}
              pathOptions={{ color: '#f59e0b', weight: 5, opacity: 0.95, dashArray: '7 7' }}
            >
              <Tooltip sticky>
                First mile · {firstMile.mode === 'auto' ? 'Auto' : 'Manual'} ·{' '}
                {km.format(firstMile.distanceKm)} km
              </Tooltip>
            </Polyline>
          )}
          {distanceMode === 'auto' && lastMilePoints.length >= 2 && (
            <Polyline
              positions={lastMilePoints.map((point) => [point.lat, point.lon])}
              pathOptions={{ color: '#f59e0b', weight: 5, opacity: 0.95, dashArray: '7 7' }}
            >
              <Tooltip sticky>
                Last mile · {lastMile.mode === 'auto' ? 'Auto' : 'Manual'} ·{' '}
                {km.format(lastMile.distanceKm)} km
              </Tooltip>
            </Polyline>
          )}
          {(drawingRoadToLocation ? drawingGeometry : drawingGeometry.slice(1)).map((point, index) => (
            <CircleMarker
              key={`access-drawing-${index}-${point.lat}-${point.lon}`}
              center={[point.lat, point.lon]}
              radius={drawingRoadToLocation && index === 0 ? 8 : 5}
              pathOptions={{
                color: '#ffffff',
                weight: drawingRoadToLocation && index === 0 ? 3 : 2,
                fillColor: drawingRoadToLocation && index === 0 ? '#22c55e' : '#f59e0b',
                fillOpacity: 1
              }}
            >
              <Tooltip
                permanent={drawingRoadToLocation && index === 0}
                direction="top"
                offset={[0, -8]}
              >
                {drawingRoadToLocation && index === 0 ? 'Snapped to road' : `Line point ${index + 1}`}
              </Tooltip>
            </CircleMarker>
          ))}
          {stops.map((stop, index) => (
            <Marker
              key={`${stop.id}-${index}`}
              position={[stop.lat, stop.lon]}
              icon={routeStopIcon(
                index === 0 ? 'A' : index === stops.length - 1 ? 'B' : String(index)
              )}
              zIndexOffset={1000}
            >
              <Tooltip permanent direction="top" offset={[0, -18]}>{stop.label}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}

function LeadMap({
  site,
  points,
  variants,
  applications,
  assignments,
  directions,
  directionDraft,
  draftVariantRoute,
  selectedVariantId,
  draft,
  onDeletePoint,
  onPick
}: {
  site: ProjectLocation | null
  points: LeadSelectablePoint[]
  variants: LeadVariant[]
  applications: LeadApplication[]
  assignments: LeadAssignment[]
  directions: LeadMapDirection[]
  directionDraft: LeadMapDirectionDraft
  draftVariantRoute: DraftVariantRouteView | null
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
  const mapLines = buildDashboardMapLines(
    variants,
    applications,
    directions
  )
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
        <MapLayers />
        <MapRouteViewport
          lines={mapLines}
          extraPoints={
            draftVariantRoute?.points.length
              ? draftVariantRoute.points
              : draftVariantRoute?.stops ?? []
          }
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
              weight: line.variantId === selectedVariantId ? 6 : 4,
              opacity: line.variantId === selectedVariantId ? 1 : 0.88,
              dashArray: line.dashed ? '6 7' : undefined
            }}
          >
            <Tooltip
              permanent
              direction="center"
              className={`lead-map-route-tooltip ${line.variantId === selectedVariantId ? 'selected' : ''}`}
            >
              <div className="lead-map-route-label">
                <strong>
                  <i style={{ background: line.color }} />
                  {line.label}
                </strong>
                {line.variantId && (
                  <small>
                    {routeKindLabel(line.routeKind)} ·{' '}
                    {km.format(line.displayDistanceKm)} km ·{' '}
                    {line.dataLabels.length ? `${line.dataLabels.length} DATA` : 'Not applied'}
                  </small>
                )}
              </div>
            </Tooltip>
            <Popup>
              <div className="lead-map-route-popup">
                <strong>{line.label}</strong>
                <span>
                  Display: {routeKindDescription(line.routeKind)}
                </span>
                <span>Displayed length: {km.format(line.displayDistanceKm)} km</span>
                {line.distanceKm != null && (
                  <span>Adopted lead distance: {km.format(line.distanceKm)} km</span>
                )}
                {line.variantId && (
                  line.dataLabels.length ? (
                    <>
                      <span>Applied to {line.dataLabels.length} DATA item(s):</span>
                      <ul>
                        {line.dataLabels.map((label) => <li key={label}>{label}</li>)}
                      </ul>
                    </>
                  ) : (
                    <span>Not applied to any DATA item.</span>
                  )
                )}
              </div>
            </Popup>
          </Polyline>
        ))}
        {mapLines.flatMap((line) =>
          (line.accessConnectors ?? []).map((connector) => (
            <Polyline
              key={connector.id}
              positions={connector.points.map((point) => [point.lat, point.lon])}
              pathOptions={{
                color: '#f59e0b',
                weight: line.variantId === selectedVariantId ? 5 : 4,
                opacity: line.variantId === selectedVariantId ? 1 : 0.9,
                dashArray: '7 7'
              }}
            >
              <Tooltip sticky>
                {connector.label} · {connector.mode === 'auto' ? 'Auto straight-line gap' : 'Manual adopted distance'} ·{' '}
                {km.format(connector.distanceKm)} km
              </Tooltip>
              <Popup>
                <div className="lead-map-route-popup">
                  <strong>{connector.label}</strong>
                  <span>{connector.mode === 'auto' ? 'Auto straight-line access gap' : 'Manual access distance'}</span>
                  <span>Adopted distance: {km.format(connector.distanceKm)} km</span>
                </div>
              </Popup>
            </Polyline>
          ))
        )}
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
        {draftVariantRoute?.points.length ? (
          <Polyline
            positions={draftVariantRoute.points.map((point) => [point.lat, point.lon])}
            pathOptions={{
              color: '#00a6ff',
              weight: 7,
              opacity: 0.95
            }}
          >
            <Tooltip permanent direction="center" className="lead-map-route-tooltip selected">
              <div className="lead-map-route-label">
                <strong>
                  <i style={{ background: '#00a6ff' }} />
                  Creating variant
                </strong>
                <small>
                  Road route · {km.format(draftVariantRoute.distanceKm ?? 0)} km ·{' '}
                  {Math.max(draftVariantRoute.stops.length - 2, 0)} via
                </small>
              </div>
            </Tooltip>
          </Polyline>
        ) : null}
        {draftVariantRoute?.stops.map((stop, index) => {
          const stopLabel = index === 0
            ? 'A'
            : index === draftVariantRoute.stops.length - 1
              ? 'B'
              : String(index)
          return (
            <Marker
              key={`draft-route-stop-${stop.id}-${index}`}
              position={[stop.lat, stop.lon]}
              icon={routeStopIcon(stopLabel)}
              zIndexOffset={1000}
            >
              <Tooltip direction="top" offset={[0, -18]}>{stop.label}</Tooltip>
            </Marker>
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
      <div className="lead-map-variant-legend">
        <strong>Variant routes</strong>
        {draftVariantRoute && draftVariantRoute.stops.length > 0 && (
          <div className="lead-map-variant-row creating">
            <i style={{ background: '#00a6ff' }} />
            <span>
              <b>Creating variant</b>
              <small>
                {draftVariantRoute.status === 'routing'
                  ? 'Calculating road route…'
                  : draftVariantRoute.status === 'ready'
                    ? `Road route · ${km.format(draftVariantRoute.distanceKm ?? 0)} km`
                    : draftVariantRoute.status === 'error'
                      ? 'Road route unavailable'
                      : 'Choose start and end points'}
              </small>
              <small>{draftVariantRoute.stops.map((stop) => stop.label).join(' → ')}</small>
            </span>
          </div>
        )}
        {variants.length === 0 ? (
          <span>No variants created.</span>
        ) : (
          variants.map((variant, index) => {
            const line = mapLines.find((candidate) => candidate.variantId === variant.id)
            const linked = uniqueApplicationLabels(
              applications.filter((application) => application.variantId === variant.id)
            )
            return (
              <div
                className={`lead-map-variant-row ${variant.id === selectedVariantId ? 'selected' : ''}`}
                key={variant.id}
              >
                <i style={{ background: line?.color ?? mapColor(index) }} />
                <span>
                  <b>{variantMapLabel(variant)}</b>
                  <small>
                    {line
                      ? `${routeKindLabel(line.routeKind)} · ${km.format(line.displayDistanceKm)} km`
                      : variant.routeSource === 'osrm'
                        ? 'Saved road route is unavailable'
                        : 'Road route not calculated'}
                  </small>
                  {line?.accessConnectors?.map((connector) => (
                    <small key={connector.id}>
                      {connector.label}: {connector.mode === 'auto' ? 'Auto' : 'Manual'} ·{' '}
                      {km.format(connector.distanceKm)} km
                    </small>
                  ))}
                  <small>Adopted lead: {km.format(variant.actualLeadKm ?? variant.leadKm)} km</small>
                  <small>{linked.length ? `Applied: ${linked.join(', ')}` : 'Not applied to DATA'}</small>
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

interface DashboardMapLine {
  id: string
  label: string
  color: string
  points: Array<{ lat: number; lon: number }>
  variantId?: string
  dataLabels: string[]
  distanceKm?: number
  displayDistanceKm: number
  routeKind: 'road' | 'straight' | 'mapped'
  dashed?: boolean
  accessConnectors?: Array<{
    id: string
    label: string
    mode: 'auto' | 'manual'
    distanceKm: number
    points: LeadMapCoordinate[]
  }>
}

function buildDashboardMapLines(
  variants: LeadVariant[],
  applications: LeadApplication[],
  directions: LeadMapDirection[]
): DashboardMapLine[] {
  const variantIds = new Set(variants.map((variant) => variant.id))
  const routedVariantIds = new Set(
    variants
      .filter((variant) => (variant.routeGeometry?.length ?? 0) >= 2)
      .map((variant) => variant.id)
  )
  const validDirections = directions.filter(
    (direction) =>
      direction.active !== false &&
      direction.points.length >= 2 &&
      (!direction.variantId ||
        (variantIds.has(direction.variantId) && !routedVariantIds.has(direction.variantId)))
  )
  const customVariantIds = new Set(
    validDirections
      .filter((direction) => direction.variantId)
      .map((direction) => direction.variantId!)
  )
  const lines: DashboardMapLine[] = validDirections.map((direction) => {
    const variant = direction.variantId
      ? variants.find((candidate) => candidate.id === direction.variantId)
      : null
    return {
      id: direction.id,
      label: variant ? variantMapLabel(variant) : direction.label,
      color: direction.color || '#0e639c',
      points: direction.points,
      variantId: direction.variantId,
      dataLabels: direction.variantId
        ? uniqueApplicationLabels(
            applications.filter((application) => application.variantId === direction.variantId)
          )
        : [],
      distanceKm: variant?.actualLeadKm ?? variant?.leadKm,
      displayDistanceKm: pathDistanceKm(direction.points),
      routeKind: 'mapped'
    }
  })
  for (const [index, variant] of variants.entries()) {
    if (customVariantIds.has(variant.id)) continue
    if ((variant.routeGeometry?.length ?? 0) < 2) continue
    const route = variant.routeGeometry!
    lines.push({
      id: `auto-${variant.id}`,
      label: variantMapLabel(variant),
      color: mapColor(index),
      points: route,
      variantId: variant.id,
      dataLabels: uniqueApplicationLabels(
        applications.filter((application) => application.variantId === variant.id)
      ),
      distanceKm: variant.actualLeadKm ?? variant.leadKm,
      displayDistanceKm: pathDistanceKm(route),
      routeKind: variant.routeSource === 'osrm' ? 'road' : 'mapped',
      accessConnectors: variant.routeSource === 'osrm' ? [
        ...((variant.firstMileGeometry?.length ?? 0) >= 2
          ? [{
              id: `${variant.id}:first-mile`,
              label: 'First mile',
              mode: variant.firstMileMode ?? 'auto',
              distanceKm: variant.firstMileKm ?? 0,
              points: variant.firstMileGeometry!
            }]
          : []),
        ...((variant.lastMileGeometry?.length ?? 0) >= 2
          ? [{
              id: `${variant.id}:last-mile`,
              label: 'Last mile',
              mode: variant.lastMileMode ?? 'auto',
              distanceKm: variant.lastMileKm ?? 0,
              points: variant.lastMileGeometry!
            }]
          : [])
      ] : undefined
    })
  }
  return lines
}

function variantMapLabel(variant: LeadVariant): string {
  return variant.variantName?.trim() || `${variant.materialName} · ${km.format(variant.actualLeadKm ?? variant.leadKm)} km`
}

function routeKindLabel(kind: DashboardMapLine['routeKind']): string {
  if (kind === 'road') return 'Road route'
  if (kind === 'mapped') return 'Mapped path'
  return 'Straight-line preview'
}

function routeKindDescription(kind: DashboardMapLine['routeKind']): string {
  if (kind === 'road') return 'Road-following route calculated by OSRM'
  if (kind === 'mapped') return 'Manually mapped path'
  return 'Straight line between legacy/manual points'
}

function uniqueApplicationLabels(applications: LeadApplication[]): string[] {
  return Array.from(new Set(applications.map((application) => application.itemCode)))
}

function mapColor(index: number): string {
  const colors = ['#16a085', '#e67e22', '#8e44ad', '#c49a00', '#2471a3', '#c0392b']
  return colors[index % colors.length]
}

function pathDistanceKm(points: Array<{ lat: number; lon: number }>): number {
  let distance = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    distance += haversineKm(previous.lat, previous.lon, current.lat, current.lon)
  }
  return roundKm(distance)
}

function MapRouteViewport({
  lines,
  extraPoints
}: {
  lines: DashboardMapLine[]
  extraPoints: LeadMapCoordinate[]
}): null {
  const map = useMap()
  const signature = [
    ...lines.flatMap((line) => line.points),
    ...lines.flatMap((line) => line.accessConnectors?.flatMap((connector) => connector.points) ?? []),
    ...extraPoints
  ]
    .map((point) => `${point.lat},${point.lon}`)
    .join('|')

  useEffect(() => {
    const coordinates = [
      ...lines.flatMap((line) => line.points),
      ...lines.flatMap((line) => line.accessConnectors?.flatMap((connector) => connector.points) ?? []),
      ...extraPoints
    ].map((point) => L.latLng(point.lat, point.lon))
    if (coordinates.length < 2) return
    map.fitBounds(L.latLngBounds(coordinates), {
      paddingTopLeft: [48, 64],
      paddingBottomRight: [320, 64],
      maxZoom: 13,
      animate: false
    })
  }, [map, signature])

  return null
}

function routeStopIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: 'lead-map-route-stop',
    html: `<span>${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
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

function PointPickerClick({
  active,
  onPick
}: {
  active: boolean
  onPick: (lat: number, lon: number) => void
}): null {
  useMapEvents({
    click: (event) => {
      if (active) onPick(event.latlng.lat, event.latlng.lng)
    }
  })
  return null
}

function AccessLineDrawingEvents({
  active,
  onDrawPoint
}: {
  active: boolean
  onDrawPoint: (lat: number, lon: number) => void
}): null {
  useMapEvents({
    click: (event) => {
      if (active) onDrawPoint(event.latlng.lat, event.latlng.lng)
    }
  })
  return null
}

function MapPointsViewport({
  points,
  singleZoom
}: {
  points: LeadMapCoordinate[]
  singleZoom: number
}): null {
  const map = useMap()
  const signature = points.map((point) => `${point.lat},${point.lon}`).join('|')

  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 0)
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], singleZoom, { animate: false })
      return
    }
    if (points.length > 1) {
      map.fitBounds(
        L.latLngBounds(points.map((point) => L.latLng(point.lat, point.lon))),
        { padding: [42, 42], maxZoom: 13, animate: false }
      )
    }
  }, [map, signature, singleZoom])

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

function leadMetadataForGroup(group: ProjectItemGroup, metadata: unknown): unknown {
  const addonIds = Array.from(new Set(
    group.usages.map((usage) => usage.node.dataVariant?.addonId).filter(Boolean)
  ))
  if (!addonIds.length || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata
  }
  return {
    ...(metadata as Record<string, unknown>),
    selected_addon_ids: addonIds
  }
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
    viaPointIds: [],
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
    manualRouteGeometry: [],
    firstMileMode: 'auto',
    firstMileKm: '',
    firstMileGeometry: [],
    lastMileMode: 'auto',
    lastMileKm: '',
    lastMileGeometry: [],
    liftM: '0',
    handlingMode: 'none'
  }
}

function clearDrawnRouteGeometry(draft: VariantDraft): VariantDraft {
  return {
    ...draft,
    manualRouteGeometry: [],
    firstMileGeometry: [],
    firstMileKm: draft.firstMileMode === 'manual' ? '' : draft.firstMileKm,
    lastMileGeometry: [],
    lastMileKm: draft.lastMileMode === 'manual' ? '' : draft.lastMileKm
  }
}

function variantDraftForEdit(
  variant: LeadVariant,
  disposalLead: boolean,
  assignmentPointId: string
): VariantDraft {
  const hasMappedRoute = Boolean(
    variant.startPointId ||
      variant.endPointId ||
      (variant.viaPointIds?.length ?? 0) > 0 ||
      assignmentPointId
  )
  const inferredStartPointId = disposalLead
    ? PROJECT_WORK_POINT_ID
    : assignmentPointId
  const inferredEndPointId = disposalLead
    ? assignmentPointId
    : PROJECT_WORK_POINT_ID
  const multiplier = variant.roadMultiplier ?? 1
  const roadCondition = variant.roadCondition ?? (
    multiplier === 1.5
      ? 'certified_ghat'
      : multiplier > 1
        ? 'ce_exceptional'
        : 'normal'
  )
  const chargeCode = variant.chargeCode ?? 'AUTO'

  return {
    variantName: variant.variantName ?? '',
    startPointId: variant.startPointId ?? (hasMappedRoute ? inferredStartPointId : ''),
    viaPointIds: [...(variant.viaPointIds ?? [])],
    endPointId: variant.endPointId ?? (hasMappedRoute ? inferredEndPointId : ''),
    distanceMode:
      variant.routeSource === 'osrm' ||
      (variant.routeSource !== 'manual' && variant.roadRouteKm !== undefined)
        ? 'auto'
        : 'manual',
    ruleMode: chargeCode === 'AUTO' ? 'auto' : 'manual',
    chargeCode,
    conveyanceClass: variant.conveyanceClass,
    roadCondition,
    ghatSegmentKm: String(roadCondition === 'certified_ghat' ? variant.roadSegmentKm ?? 0 : 0),
    ceSegmentKm: String(roadCondition === 'ce_exceptional' ? variant.roadSegmentKm ?? 0 : 0),
    ceMultiplier: String(roadCondition === 'ce_exceptional' ? multiplier : 2.5),
    mechanicalConveyanceReachesFinalPoint:
      variant.mechanicalConveyanceReachesFinalPoint === false ? 'no' : 'yes',
    leadKm: String(variant.actualLeadKm ?? variant.leadKm),
    manualRouteGeometry:
      variant.routeSource === 'manual'
        ? (variant.routeGeometry ?? []).map((point) => ({ ...point }))
        : [],
    firstMileMode: variant.firstMileMode ?? 'auto',
    firstMileKm: variant.firstMileKm === undefined ? '' : String(variant.firstMileKm),
    firstMileGeometry: (variant.firstMileGeometry ?? []).map((point) => ({ ...point })),
    lastMileMode: variant.lastMileMode ?? 'auto',
    lastMileKm: variant.lastMileKm === undefined ? '' : String(variant.lastMileKm),
    lastMileGeometry: (variant.lastMileGeometry ?? []).map((point) => ({ ...point })),
    liftM: String(variant.liftM),
    handlingMode: variant.handlingMode
  }
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
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

function coordinateNumber(value: string, min: number, max: number): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function mapCoordinateFromDraft(draft: SourceDraft): LeadMapCoordinate | null {
  const lat = coordinateNumber(draft.lat, -90, 90)
  const lon = coordinateNumber(draft.lon, -180, 180)
  return lat === null || lon === null ? null : { lat, lon }
}

function validMapCoordinate(draft: SourceDraft): boolean {
  return mapCoordinateFromDraft(draft) !== null
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

interface RouteProjection {
  point: LeadMapCoordinate
  segmentIndex: number
  fraction: number
  distanceKm: number
}

interface TrimmedRoadRoute {
  points: LeadMapCoordinate[]
  distanceKm: number
  valid: boolean
}

function nearestPointOnRoute(
  target: LeadMapCoordinate,
  route: LeadMapCoordinate[]
): RouteProjection | null {
  if (route.length < 2) return null
  const longitudeScale = Math.cos(toRad(target.lat))
  let nearest: RouteProjection | null = null
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index]
    const end = route[index + 1]
    const startX = start.lon * longitudeScale
    const startY = start.lat
    const endX = end.lon * longitudeScale
    const endY = end.lat
    const targetX = target.lon * longitudeScale
    const targetY = target.lat
    const deltaX = endX - startX
    const deltaY = endY - startY
    const lengthSquared = deltaX * deltaX + deltaY * deltaY
    const fraction = lengthSquared > 0
      ? Math.min(
          Math.max(((targetX - startX) * deltaX + (targetY - startY) * deltaY) / lengthSquared, 0),
          1
        )
      : 0
    const point = {
      lat: start.lat + (end.lat - start.lat) * fraction,
      lon: start.lon + (end.lon - start.lon) * fraction
    }
    const distanceKm = haversineKm(target.lat, target.lon, point.lat, point.lon)
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { point, segmentIndex: index, fraction, distanceKm }
    }
  }
  return nearest
}

function accessOrientationForGeometry(
  route: LeadMapCoordinate[],
  geometry: LeadMapCoordinate[]
): AccessDrawingOrientation | null {
  if (route.length < 2 || geometry.length < 2) return null
  const firstProjection = nearestPointOnRoute(geometry[0], route)
  const lastProjection = nearestPointOnRoute(geometry.at(-1)!, route)
  if (!firstProjection || !lastProjection) return null
  return firstProjection.distanceKm <= lastProjection.distanceKm
    ? 'road_to_location'
    : 'location_to_road'
}

function roadJoinForAccessGeometry(
  route: LeadMapCoordinate[],
  geometry: LeadMapCoordinate[]
): RouteProjection | null {
  if (route.length < 2 || geometry.length < 2) return null
  const firstProjection = nearestPointOnRoute(geometry[0], route)
  const lastProjection = nearestPointOnRoute(geometry.at(-1)!, route)
  if (!firstProjection || !lastProjection) return null
  return firstProjection.distanceKm <= lastProjection.distanceKm
    ? firstProjection
    : lastProjection
}

function trimRoadRouteForAccessLines(
  route: LeadMapCoordinate[],
  roadDistanceKm: number | null,
  firstMileGeometry: LeadMapCoordinate[],
  lastMileGeometry: LeadMapCoordinate[]
): TrimmedRoadRoute {
  if (route.length < 2) return { points: [], distanceKm: 0, valid: true }
  const startJoin = firstMileGeometry.length >= 2
    ? roadJoinForAccessGeometry(route, firstMileGeometry)
    : { point: route[0], segmentIndex: 0, fraction: 0, distanceKm: 0 }
  const lastSegmentIndex = route.length - 2
  const endJoin = lastMileGeometry.length >= 2
    ? roadJoinForAccessGeometry(route, lastMileGeometry)
    : { point: route.at(-1)!, segmentIndex: lastSegmentIndex, fraction: 1, distanceKm: 0 }
  if (!startJoin || !endJoin) return { points: route, distanceKm: roadDistanceKm ?? 0, valid: true }
  const startPosition = startJoin.segmentIndex + startJoin.fraction
  const endPosition = endJoin.segmentIndex + endJoin.fraction
  if (startPosition > endPosition + 0.000001) {
    return { points: [], distanceKm: 0, valid: false }
  }
  const middlePoints = route.slice(startJoin.segmentIndex + 1, endJoin.segmentIndex + 1)
  const points = dedupeAdjacentCoordinates([startJoin.point, ...middlePoints, endJoin.point])
  const fullGeometryKm = polylineDistanceKm(route)
  const adoptedGeometryKm = polylineDistanceKm(points)
  const distanceKm = roadDistanceKm !== null && fullGeometryKm > 0
    ? roundKm(roadDistanceKm * (adoptedGeometryKm / fullGeometryKm))
    : adoptedGeometryKm
  return { points, distanceKm, valid: true }
}

function dedupeAdjacentCoordinates(points: LeadMapCoordinate[]): LeadMapCoordinate[] {
  return points.filter((point, index) => {
    if (index === 0) return true
    const previous = points[index - 1]
    return haversineKm(previous.lat, previous.lon, point.lat, point.lon) >= 0.001
  })
}

function polylineDistanceKm(points: LeadMapCoordinate[]): number {
  let distanceKm = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    distanceKm += haversineKm(previous.lat, previous.lon, point.lat, point.lon)
  }
  return roundKm(distanceKm)
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

function nonNegativeNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatSignedMoney(value: number): string {
  if (value < 0) return `-Rs. ${money.format(Math.abs(value))}`
  return `Rs. ${money.format(value)}`
}
