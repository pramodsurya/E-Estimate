import { useEffect, useMemo, useState } from 'react'
import { CircleDot, Route } from 'lucide-react'
import {
  canonicalLeadMaterialRef,
  isDisposalLeadMaterial,
  materialRefsForLeadInfo,
  parseLeadInfo,
  type LeadMaterialRef
} from '../../lib/leadApplicability'
import { fetchSsrLeadApplicability, conveyanceClassLabel } from '../../lib/lead'
import { collectProjectItemGroups } from '../../lib/projectItems'
import { useStore } from '../../store/useStore'
import type { ConveyanceClass, LeadApplication, LeadVariant } from '../../types/project'

interface LeadAbstractItem {
  key: string
  name: string
  conveyanceClass: ConveyanceClass
  dataCount: number
  variantCount: number
  linkedCount: number
  amount: number
}

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function EstimateLeadPanel(): JSX.Element {
  const project = useStore((state) => state.project)
  const openLeadMaterial = useStore((state) => state.openLeadMaterial)
  const selection = useStore((state) => state.leadSelection)
  const [metadata, setMetadata] = useState<Map<string, unknown>>(new Map())
  const [error, setError] = useState('')

  const groups = useMemo(
    () => (project ? collectProjectItemGroups(project.root) : []),
    [project]
  )
  const variants = project?.leadChart?.variants ?? []
  const applications = project?.leadChart?.applications ?? []

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

  const items = useMemo(
    () => buildLeadAbstract(groups.map((group) => ({
      code: group.code,
      description: group.description,
      metadata: activateGroupAddons(
        metadata.get(group.code),
        group.usages.map((usage) => usage.node.dataVariant?.addonId)
      ),
      source: group.source
    })), variants, applications),
    [groups, metadata, variants, applications]
  )

  if (!project) return <div className="panel-reserved">Open a project before creating Lead.</div>

  return (
    <div className="lead-abstract-panel">
      <div className="lead-abstract-title">
        <strong>Materials</strong>
        <span>{items.length}</span>
      </div>
      {error && <div className="lead-panel-error">{error}</div>}
      {items.length === 0 ? (
        <div className="lead-panel-empty">
          Add DATA items with lead-applicable materials to show Cement, Steel, Earth, and other Lead groups.
        </div>
      ) : (
        <div className="lead-abstract-list">
          {items.map((item) => {
            const selected =
              selection?.materialName === item.name &&
              selection.conveyanceClass === item.conveyanceClass
            return (
              <button
                className={`lead-abstract-row ${selected ? 'selected' : ''}`}
                key={item.key}
                onClick={() =>
                  openLeadMaterial({
                    materialName: item.name,
                    conveyanceClass: item.conveyanceClass
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
  const material = name.trim().toLowerCase()
  if (material === 'sand') return 'Sand / fine aggregate'
  if (material === 'stone') return 'Stone / coarse aggregate'
  return conveyanceClassLabel(conveyanceClass)
}

function buildLeadAbstract(
  dataRows: Array<{ code: string; description: string; metadata: unknown; source: string }>,
  variants: LeadVariant[],
  applications: LeadApplication[]
): LeadAbstractItem[] {
  const byKey = new Map<string, LeadAbstractItem>()

  const ensure = (ref: LeadMaterialRef): LeadAbstractItem => {
    const canonical = canonicalLeadMaterialRef(ref)
    const key = isDisposalLeadMaterial(canonical.name)
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
        amount: 0
      }
      byKey.set(key, item)
    }
    return item
  }

  for (const row of dataRows) {
    if (row.source !== 'SSR') continue
    for (const ref of materialRefsForLeadInfo(parseLeadInfo(row.metadata), row.description)) {
      ensure(ref).dataCount += 1
    }
  }

  for (const variant of variants) {
    ensure({ name: variant.materialName, conveyanceClass: variant.conveyanceClass, source: '' })
      .variantCount += 1
  }

  for (const application of applications) {
    const variant = variants.find((candidate) => candidate.id === application.variantId)
    if (!variant) continue
    const item = ensure({
      name: variant.materialName,
      conveyanceClass: variant.conveyanceClass,
      source: ''
    })
    item.linkedCount += 1
    item.amount += application.grossAmount
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )
}
