import { useMemo } from 'react'
import { CircleDot, Route } from 'lucide-react'
import {
  canonicalLeadMaterialRef,
  isDisposalLeadMaterial,
  materialRefsForLeadInfo,
  parseLeadInfo,
  type LeadMaterialRef
} from '../../lib/leadApplicability'
import { conveyanceClassLabel } from '../../lib/lead'
import { dashboardContextMatches } from '../../lib/dashboardSync'
import { projectItemGroups, type ProjectItemGroup } from '../../lib/projectItems'
import { pipeLeadMaterialName } from '../../lib/pipeLead'
import { useStore } from '../../store/useStore'
import type {
  ConveyanceClass,
  LeadApplication,
  LeadVariant,
  PipeLeadSource
} from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'

interface LeadAbstractItem {
  key: string
  name: string
  conveyanceClass: ConveyanceClass
  dataCount: number
  variantCount: number
  linkedCount: number
  amount: number
  pipeLead?: PipeLeadSource
}

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function EstimateLeadPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const selection = useStore((state) => state.leadSelection)

  const groups = useMemo(
    () => (project ? projectItemGroups(project.root) : []),
    [project]
  )
  const variants = project?.leadChart?.variants ?? []
  const applications = project?.leadChart?.applications ?? []
  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const metadata = useMemo(
    () =>
      new Map<string, unknown>(
        project && snapshotValid
          ? Object.entries(project.dashboardSnapshot?.leadApplicability ?? {})
          : []
      ),
    [project, snapshotValid]
  )

  const items = useMemo(
    () => buildLeadAbstract(groups.map((group) => ({
      code: group.code,
      description: group.description,
      metadata: activateGroupAddons(
        metadata.get(group.code),
        group.usages.map((usage) => usage.node.dataVariant?.addonId)
      ),
      source: group.source,
      pipeLead: pipeLeadForGroup(
        group,
        snapshotValid ? project?.dashboardSnapshot?.recipes : undefined
      )
    })), variants, applications),
    [groups, metadata, variants, applications, project?.dashboardSnapshot?.recipes, snapshotValid]
  )

  if (!project) return <div className="panel-reserved">Open a project before creating Lead.</div>

  return (
    <div className="lead-abstract-panel">
      <div className="lead-abstract-title">
        <strong>Materials</strong>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="lead-panel-empty">
          Add DATA items with lead-applicable materials to show Cement, Steel, Earth, and other Lead groups.
        </div>
      ) : (
        <div className="lead-abstract-list">
          {items.map((item) => {
            const selected =
              item.pipeLead
                ? selection?.pipeLead?.pipeLeadItemCode === item.pipeLead.pipeLeadItemCode
                : selection?.materialName === item.name &&
                  selection.conveyanceClass === item.conveyanceClass
            return (
              <button
                className={`lead-abstract-row ${selected ? 'selected' : ''}`}
                key={item.key}
                onClick={() =>
                  openLeadMaterial({
                    materialName: item.name,
                    conveyanceClass: item.conveyanceClass,
                    pipeLead: item.pipeLead
                  })
                }
                title={`${item.dataCount} DATA item(s), ${item.variantCount} variant(s)`}
              >
                <CircleDot size={12} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{leadAbstractClassLabel(item.name, item.conveyanceClass)}</small>
                  <small>
                    {item.variantCount} variant{item.variantCount === 1 ? '' : 's'} |{' '}
                    {item.linkedCount} linked component usage{item.linkedCount === 1 ? '' : 's'}
                  </small>
                </span>
                <b>Rs. {money.format(item.amount)}</b>
              </button>
            )
          })}
        </div>
      )}
      <div className="lead-abstract-foot">
        <Route size={12} />
        <span>Select a material to edit locations, variants, and DATA links on the right.</span>
      </div>
    </div>
  )
}

function activateGroupAddons(metadata: unknown, addonIds: Array<string | undefined>): unknown {
  const selected = Array.from(new Set(addonIds.filter((id): id is string => Boolean(id))))
  if (!selected.length || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata
  }
  return { ...(metadata as Record<string, unknown>), selected_addon_ids: selected }
}

function leadAbstractClassLabel(name: string, conveyanceClass: ConveyanceClass): string {
  if (conveyanceClass === 'RCC_PIPE') {
    return 'Public Health RCC pipe conveyance · loading, unloading & stacking included'
  }
  const material = name.trim().toLowerCase()
  if (material === 'sand') return 'Sand / fine aggregate'
  if (material === 'stone') return 'Stone / coarse aggregate'
  return conveyanceClassLabel(conveyanceClass)
}

function buildLeadAbstract(
  dataRows: Array<{
    code: string
    description: string
    metadata: unknown
    source: string
    pipeLead?: PipeLeadSource
  }>,
  variants: LeadVariant[],
  applications: LeadApplication[]
): LeadAbstractItem[] {
  const byKey = new Map<string, LeadAbstractItem>()

  const ensure = (ref: LeadMaterialRef, pipeLead?: PipeLeadSource): LeadAbstractItem => {
    const canonical = canonicalLeadMaterialRef(ref)
    const key = pipeLead
      ? `pipe:${pipeLead.pipeLeadItemCode}`
      : isDisposalLeadMaterial(canonical.name)
      ? `disposal:${canonical.name.toLowerCase()}`
      : `${canonical.conveyanceClass}:${canonical.name.toLowerCase()}`
    let item = byKey.get(key)
    if (!item) {
      item = {
        key,
        name: canonical.name,
        conveyanceClass: canonical.conveyanceClass,
        dataCount: 0,
        variantCount: 0,
        linkedCount: 0,
        amount: 0,
        pipeLead
      }
      byKey.set(key, item)
    }
    return item
  }

  for (const row of dataRows) {
    if (row.pipeLead) {
      ensure({
        name: pipeLeadMaterialName(row.pipeLead),
        conveyanceClass: 'RCC_PIPE',
        source: row.pipeLead.pipeLeadCatalogueCode
      }, row.pipeLead).dataCount += 1
      continue
    }
    if (row.source !== 'SSR' && row.source !== 'PROJECT_DATA') continue
    for (const ref of materialRefsForLeadInfo(parseLeadInfo(row.metadata), row.description)) {
      ensure(ref).dataCount += 1
    }
  }

  for (const variant of variants) {
    ensure(
      { name: variant.materialName, conveyanceClass: variant.conveyanceClass, source: '' },
      variant.pipeLead
    )
      .variantCount += 1
  }

  for (const application of applications) {
    const variant = variants.find((candidate) => candidate.id === application.variantId)
    if (!variant) continue
    const item = ensure(
      {
        name: variant.materialName,
        conveyanceClass: variant.conveyanceClass,
        source: ''
      },
      variant.pipeLead
    )
    item.linkedCount += 1
    item.amount += application.grossAmount
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )
}

function pipeLeadForGroup(
  group: ProjectItemGroup,
  recipes: Record<string, RateAnalysisRecipe> | undefined
): PipeLeadSource | undefined {
  for (const usage of group.usages) {
    const linked =
      usage.node.sorCatalogue?.pipeLead ??
      recipes?.[usage.node.id]?.sorCatalogueSource?.pipeLead
    if (linked) return linked
  }
  return undefined
}
