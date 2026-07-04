import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Calculator, Pencil, RotateCcw, Save, Wrench } from 'lucide-react'
import { collectProjectItemGroups } from '../../lib/projectItems'
import { fetchRateAnalysis, recalculateRateAnalysis } from '../../lib/rateAnalysis'
import { calculateLeadVariantCharge, loadingUnloadingCautionForBreakdown } from '../../lib/lead'
import {
  basisForData,
  liftInfoForData,
  parseLeadInfo,
  quantityForVariant
} from '../../lib/leadApplicability'
import { findNode } from '../../lib/tree'
import { useStore } from '../../store/useStore'
import { nodeDisplayName } from '../nodeVisual'
import type { LeadApplication, LeadVariant } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import RateAnalysisTable from './RateAnalysisTable'

function cloneRecipe(recipe: RateAnalysisRecipe): RateAnalysisRecipe {
  return JSON.parse(JSON.stringify(recipe)) as RateAnalysisRecipe
}

function moneyChanged(left: number, right: number): boolean {
  return Math.abs((left || 0) - (right || 0)) > 0.005
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function leadApplicationChanged(left: LeadApplication, right: LeadApplication): boolean {
  return (
    left.itemCode !== right.itemCode ||
    left.itemNodeId !== right.itemNodeId ||
    left.quantityManuallyEdited !== right.quantityManuallyEdited ||
    left.quantitySource !== right.quantitySource ||
    left.unit !== right.unit ||
    left.handlingWarning !== right.handlingWarning ||
    left.handlingOverrideReason !== right.handlingOverrideReason ||
    left.deliveryAtSiteWarning !== right.deliveryAtSiteWarning ||
    moneyChanged(left.quantity, right.quantity) ||
    moneyChanged(left.leadRate, right.leadRate) ||
    moneyChanged(left.loadingRate, right.loadingRate) ||
    moneyChanged(left.unloadingRate, right.unloadingRate) ||
    moneyChanged(left.liftRate, right.liftRate) ||
    moneyChanged(left.grossRate, right.grossRate) ||
    moneyChanged(left.grossAmount, right.grossAmount) ||
    moneyChanged(left.netRate, right.netRate) ||
    moneyChanged(left.netAmount, right.netAmount) ||
    moneyChanged(left.calculation?.fullLeadRate ?? 0, right.calculation?.fullLeadRate ?? 0) ||
    moneyChanged(left.calculation?.deductedLeadRate ?? 0, right.calculation?.deductedLeadRate ?? 0) ||
    moneyChanged(left.calculation?.netLeadRate ?? 0, right.calculation?.netLeadRate ?? 0)
  )
}

function leadVariantSignature(variant: LeadVariant): string {
  return [
    variant.id,
    variant.conveyanceClass,
    variant.materialName,
    variant.leadKm,
    variant.liftM,
    variant.handlingMode,
    variant.mechanicalConveyanceReachesFinalPoint,
    variant.includedBasis,
    variant.rateSource,
    variant.customGrossRate ?? ''
  ].join(':')
}

export default function RateAnalysisDashboard(): JSX.Element {
  const project = useStore((state) => state.project)
  const selection = useStore((state) => state.analysisSelection)
  const closeRateAnalysis = useStore((state) => state.closeRateAnalysis)
  const openRateAnalysis = useStore((state) => state.openRateAnalysis)
  const saveRateAnalysis = useStore((state) => state.saveRateAnalysis)
  const restoreDefaults = useStore((state) => state.restoreRateAnalysisDefaults)
  const upsertLeadApplication = useStore((state) => state.upsertLeadApplication)
  const [defaultRecipe, setDefaultRecipe] = useState<RateAnalysisRecipe | null>(null)
  const [current, setCurrent] = useState<RateAnalysisRecipe | null>(null)
  const [draft, setDraft] = useState<RateAnalysisRecipe | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const groups = useMemo(
    () => (project ? collectProjectItemGroups(project.root) : []),
    [project]
  )
  const group = groups.find((candidate) => candidate.key === selection?.key)
  const selectedNode = project && selection ? findNode(project.root, selection.nodeId) : null
  const itemNode =
    selectedNode?.kind === 'item' ? selectedNode : group?.usages[0]?.node ?? null
  const override =
    project && selection ? project.rateAnalysisOverrides?.[selection.key] ?? null : null
  const leadVariants = project?.leadChart?.variants ?? []
  const leadApplications =
    project && selection
      ? (project.leadChart?.applications ?? []).filter(
          (application) => application.itemKey === selection.key
        )
      : []
  const leadApplicationSignature = leadApplications
    .map(
      (application) =>
        `${application.id}:${application.variantId}:${application.grossRate}:${application.grossAmount}:${application.calculation?.deductedLeadRate ?? ''}`
    )
    .join('|')
  const leadVariantUpdateSignature = leadVariants.map(leadVariantSignature).join('|')

  const updateLeadApplicationQuantity = (applicationId: string, quantityValue: number): void => {
    const application = leadApplications.find((candidate) => candidate.id === applicationId)
    if (!application) return
    const quantity = Math.max(0, Number.isFinite(quantityValue) ? quantityValue : 0)
    upsertLeadApplication({
      ...application,
      quantity,
      quantityManuallyEdited: true,
      quantitySource: `Edited disposal quantity: ${formatQuantity(quantity)} ${application.unit}`,
      grossAmount: roundMoney(application.grossRate * quantity),
      netAmount: roundMoney(application.netRate * quantity),
      appliedAt: new Date().toISOString()
    })
  }

  useEffect(() => {
    if (!project || !selection || !itemNode) return
    let cancelled = false
    setLoading(true)
    setError('')
    setNotice('')
    setEditing(false)

    void fetchRateAnalysis(itemNode, project.meta.sorYear)
      .then((loaded) => {
        if (cancelled) return
        const active = override
          ? cloneRecipe({ ...loaded, ...override, layout: loaded.layout })
          : cloneRecipe(loaded)
        setDefaultRecipe(loaded)
        setCurrent(active)
        setDraft(cloneRecipe(active))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        if (override) {
          const active = cloneRecipe(override)
          setDefaultRecipe(null)
          setCurrent(active)
          setDraft(cloneRecipe(active))
          setNotice('Showing the saved project recipe because Supabase could not be reached.')
        } else {
          setError(reason instanceof Error ? reason.message : 'Unable to load this recipe.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [project?.id, project?.meta.sorYear, selection?.key, selection?.nodeId])

  useEffect(() => {
    if (!project || !selection || !current || !group || leadApplications.length === 0) return
    let cancelled = false

    const refreshLeadApplications = async (): Promise<void> => {
      const info = parseLeadInfo(current.leadApplicability)
      const liftInfo = liftInfoForData(info, `${group.description} ${current.description}`, group.code)
      const basis = (variant: LeadVariant) =>
        basisForData(info, variant.includedBasis, `${group.description} ${current.description}`)

      for (const application of leadApplications) {
        if (cancelled) return
        const variant = leadVariants.find((candidate) => candidate.id === application.variantId)
        if (!variant) continue

        const quantity = quantityForVariant(current, variant, info)
        const effectiveQuantity = application.quantityManuallyEdited
          ? Math.max(0, application.quantity)
          : quantity.quantity
        const effectiveQuantitySource = application.quantityManuallyEdited
          ? application.quantitySource || `Edited disposal quantity: ${formatQuantity(effectiveQuantity)} ${application.unit || quantity.unit}`
          : quantity.source
        const breakdown = await calculateLeadVariantCharge({
          year: project.meta.sorYear,
          conveyanceClass: variant.conveyanceClass,
          distanceKm: variant.leadKm,
          quantity: effectiveQuantity,
          liftM: variant.liftM,
          includedInitialLiftM: liftInfo.includedInitialLiftM,
          includesAllLifts: liftInfo.includesAllLifts,
          mechanicalConveyanceReachesFinalPoint:
            variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
          handlingMode: variant.handlingMode,
          materialName: variant.materialName,
          includedBasis: basis(variant),
          customGrossRate: variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
          chargeCode: variant.chargeCode
        })
        const next: LeadApplication = {
          ...application,
          itemCode: group.displayName,
          itemNodeId: group.usages[0]?.node.id,
          quantity: breakdown.quantity,
          quantityManuallyEdited: application.quantityManuallyEdited,
          quantitySource: effectiveQuantitySource,
          unit: breakdown.unit,
          leadRate: breakdown.leadRate,
          loadingRate: breakdown.loadingRate,
          unloadingRate: breakdown.unloadingRate,
          liftRate: breakdown.liftRate,
          grossRate: breakdown.grossRate,
          grossAmount: breakdown.grossAmount,
          netRate: breakdown.netRate,
          netAmount: breakdown.netAmount,
          calculation: breakdown.calculation,
          handlingWarning:
            loadingUnloadingCautionForBreakdown(breakdown, variant.handlingMode) || undefined
        }
        if (!cancelled && leadApplicationChanged(application, next)) {
          upsertLeadApplication(next)
        }
      }
    }

    void refreshLeadApplications().catch((reason: unknown) => {
      if (!cancelled) {
        console.error('Unable to refresh lead application calculations', reason)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    project?.id,
    project?.meta.sorYear,
    selection?.key,
    current,
    group?.key,
    leadApplicationSignature,
    leadVariantUpdateSignature
  ])

  if (!project || !selection || !group || !itemNode) {
    return <div className="rate-state">The selected item is no longer in this project.</div>
  }

  const startEdit = (): void => {
    if (!current) return
    setDraft(cloneRecipe(current))
    setEditing(true)
    setNotice('Published Supabase values stay unchanged. Edits are recalculated automatically.')
  }

  const recalculate = (): void => {
    if (!draft) return
    const recalculated = recalculateRateAnalysis(draft)
    setDraft(recalculated)
    const result = recalculated.recalculation
    if (!result) return
    setNotice(
      `Recalculated final cost: ${result.finalCost}; rate: ${result.calculatedRate || 'unavailable'}.`
    )
  }

  const updateDraft = (next: RateAnalysisRecipe): void => {
    const updated = next.calculationStale ? recalculateRateAnalysis(next) : next
    setDraft(updated)
    if (next.calculationStale) {
      setNotice('Inputs changed. Recalculation updated automatically.')
    }
  }

  const applyFixed = (): void => {
    if (!draft) return
    const saved = cloneRecipe(draft)
    saveRateAnalysis(saved)
    setCurrent(saved)
    setDraft(cloneRecipe(saved))
    setEditing(false)
    setNotice('Changes saved. All other Supabase values were left unchanged.')
  }

  const applyDefaults = (): void => {
    if (!defaultRecipe) return
    const restored = cloneRecipe(defaultRecipe)
    restoreDefaults(restored)
    setCurrent(restored)
    setDraft(cloneRecipe(restored))
    setEditing(false)
    setNotice('Supabase defaults restored for every usage of this item.')
  }

  return (
    <div className="rate-dashboard">
      <div className="rate-toolbar">
        <button className="btn ghost" onClick={closeRateAnalysis}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="rate-toolbar-title">
          <strong>{group.code}</strong>
          <span>
            {project.meta.sorYear} | {group.usages.length} project usage
            {group.usages.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="rate-toolbar-actions">
          {!editing ? (
            <button className="btn" onClick={startEdit} disabled={!current}>
              <Pencil size={14} /> Edit
            </button>
          ) : (
            <>
              <button
                className="btn ghost"
                onClick={() => {
                  if (current) setDraft(cloneRecipe(current))
                  setEditing(false)
                  setNotice('')
                }}
              >
                Cancel
              </button>
              <button className="btn ghost" onClick={recalculate} disabled={!draft}>
                <Calculator size={14} /> Recalculate
              </button>
              <button className="btn" onClick={applyFixed}>
                <Save size={14} /> Save
              </button>
            </>
          )}
          <button className="btn ghost" onClick={applyDefaults} disabled={!defaultRecipe}>
            <RotateCcw size={14} /> Defaults
          </button>
        </div>
      </div>

      {notice && <div className="rate-notice">{notice}</div>}
      {loading && (
        <div className="rate-state">
          Loading the {project.meta.sorYear} recipe from Supabase...
        </div>
      )}
      {error && (
        <div className="rate-state error">
          <Wrench size={20} />
          <strong>Recipe unavailable</strong>
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && draft && (
        <>
          {draft.unresolvedLines ? (
            <div className="rate-warning">
              {draft.unresolvedLines} database line{draft.unresolvedLines === 1 ? '' : 's'} could
              not be resolved automatically and currently show a zero rate.
            </div>
          ) : null}
          <RateAnalysisTable
            recipe={draft}
            editing={editing}
            onChange={updateDraft}
            leadApplications={leadApplications}
            leadVariants={leadVariants}
            onLeadApplicationQuantityChange={updateLeadApplicationQuantity}
          />
          {draft.recalculation && <RecalculationAudit recipe={draft} />}
          {!selection.recipeOnly && (
            <section className="rate-usages">
              <div className="rate-usages-heading">
                <div>
                  <span>Used In</span>
                  <strong>
                    {group.usages.length} component location
                    {group.usages.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <p>Names stay live with Explorer. Select a location to show only its recipe.</p>
              </div>
              <div className="rate-usage-list">
                {group.usages.map((usage) => (
                  <button
                    key={usage.node.id}
                    className="rate-usage"
                    onClick={() => openRateAnalysis(group.key, usage.node.id, true)}
                  >
                    <span>
                      {usage.path.map((part) => part.name).join(' / ') || project.root.name}
                    </span>
                    <small>{nodeDisplayName(usage.node)}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function RecalculationAudit({ recipe }: { recipe: RateAnalysisRecipe }): JSX.Element {
  const result = recipe.recalculation
  if (!result) return <></>
  const contributions = result.trace.filter((entry) => entry.contributes)
  const excluded = result.trace.filter((entry) => !entry.contributes)

  return (
    <section className="rate-calculation-audit">
      <div className="rate-calculation-heading">
        <div>
          <span>Derived Result</span>
          <strong>Recalculation audit</strong>
        </div>
        <p>
          Final cost {result.finalCost || 'unavailable'} | Calculated rate{' '}
          {result.calculatedRate || 'unavailable'} | Published rate{' '}
          {result.publishedBaseRate || 'unavailable'}
        </p>
      </div>
      {result.warnings.length > 0 && (
        <div className="rate-calculation-warnings">
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
      <details className="rate-calculation-trace">
        <summary>
          {contributions.length} contributing entries; {excluded.length} display-only entries
        </summary>
        <div>
          {result.trace.map((entry, index) => (
            <p
              className={entry.contributes ? 'contributes' : 'display-only'}
              key={`${entry.kind}-${entry.section ?? entry.label ?? index}-${index}`}
            >
              <span>{entry.section ?? entry.label ?? entry.description}</span>
              <small>{entry.contributes ? entry.formula ?? entry.status : `not added: ${entry.formula ?? entry.status}`}</small>
              <strong>{entry.amount}</strong>
            </p>
          ))}
        </div>
      </details>
    </section>
  )
}
