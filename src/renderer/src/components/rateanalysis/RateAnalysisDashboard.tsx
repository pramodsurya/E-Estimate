import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Calculator,
  Eye,
  LayoutDashboard,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Wrench
} from 'lucide-react'
import { projectItemGroups } from '../../lib/projectItems'
import { adoptSavedRecipe, cloneRecipe } from '../../lib/dataSheets'
import {
  auditPublishedRateAnalysis,
  recalculateRateAnalysis
} from '../../lib/rateAnalysis'
import {
  calculateLeadVariantChargeFromRows,
  loadingUnloadingCautionForBreakdown,
  type LeadChargeBreakdown
} from '../../lib/lead'
import {
  fetchPipeLeadQuoteForMaterial,
  pipeLeadQuoteBreakdown
} from '../../lib/pipeLead'
import {
  addonLeadRuleForVariant,
  basisForData,
  handlingModeForData,
  liftInfoForData,
  parseLeadInfo,
  quantityForVariant
} from '../../lib/leadApplicability'
import { findNode } from '../../lib/tree'
import {
  dashboardContextMatches,
  dashboardItemIsSynced,
  syncDataDashboardSnapshot
} from '../../lib/dashboardSync'
import { useStore } from '../../store/useStore'
import { nodeDisplayName } from '../nodeVisual'
import type { LeadApplication, LeadVariant } from '../../types/project'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import RateAnalysisTable from './RateAnalysisTable'
import SignatureFooterPrint from '../signature/SignatureFooterPrint'
import { resolveSignatureFooter } from '../../lib/signatureFooter'

const auditMoney = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function moneyChanged(left: number, right: number): boolean {
  return Math.abs((left || 0) - (right || 0)) > 0.005
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function zoneLabel(zone: string): string {
  if (zone === 'zone_1') return 'Zone I'
  if (zone === 'zone_2') return 'Zone II'
  return 'Zone III'
}

function leadApplicationChanged(left: LeadApplication, right: LeadApplication): boolean {
  return (
    left.itemCode !== right.itemCode ||
    left.itemNodeId !== right.itemNodeId ||
    left.addonId !== right.addonId ||
    moneyChanged(left.outputQuantity ?? 0, right.outputQuantity ?? 0) ||
    moneyChanged(left.rateAddition ?? 0, right.rateAddition ?? 0) ||
    left.quantityManuallyEdited !== right.quantityManuallyEdited ||
    left.quantitySource !== right.quantitySource ||
    left.unit !== right.unit ||
    left.handlingWarning !== right.handlingWarning ||
    left.handlingOverrideReason !== right.handlingOverrideReason ||
    left.deliveryAtSiteWarning !== right.deliveryAtSiteWarning ||
    left.rateZone !== right.rateZone ||
    left.rateYear !== right.rateYear ||
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
    variant.pipeLead?.pipeLeadItemCode ?? '',
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
  const setDashboardSnapshot = useStore((state) => state.setDashboardSnapshot)
  const [defaultRecipe, setDefaultRecipe] = useState<RateAnalysisRecipe | null>(null)
  const [current, setCurrent] = useState<RateAnalysisRecipe | null>(null)
  const [draft, setDraft] = useState<RateAnalysisRecipe | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [printView, setPrintView] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const groups = useMemo(
    () => (project ? projectItemGroups(project.root) : []),
    [project]
  )
  const group = groups.find((candidate) => candidate.key === selection?.key)
  const selectedNode = project && selection ? findNode(project.root, selection.nodeId) : null
  const scopeNode =
    project && selection?.scopeNodeId ? findNode(project.root, selection.scopeNodeId) : null
  const itemNode =
    selectedNode?.kind === 'item' ? selectedNode : group?.usages[0]?.node ?? null
  const globalOverride =
    project && selection ? project.rateAnalysisOverrides?.[selection.key] ?? null : null
  const scopedOverride =
    project && selection?.scopeNodeId
      ? project.rateAnalysisScopedOverrides?.[selection.scopeNodeId]?.[selection.key] ?? null
      : null
  const override = scopedOverride ?? globalOverride
  const leadVariants = project?.leadChart?.variants ?? []
  const syncedLeadRates =
    project && dashboardContextMatches(project.dashboardSnapshot, project)
      ? project.dashboardSnapshot?.leadRates ?? []
      : []
  const leadApplications =
    project && selection && itemNode
      ? (project.leadChart?.applications ?? []).filter(
          (application) =>
            application.itemKey === selection.key &&
            (application.itemNodeId
              ? application.itemNodeId === itemNode.id
              : group?.usages[0]?.node.id === itemNode.id)
        )
      : []
  const leadApplicationSignature = leadApplications
    .map(
      (application) =>
        `${application.id}:${application.variantId}:${application.grossRate}:${application.grossAmount}:${application.calculation?.deductedLeadRate ?? ''}:${application.rateYear ?? ''}`
    )
    .join('|')
  const leadVariantUpdateSignature = leadVariants.map(leadVariantSignature).join('|')

  const updateLeadApplicationQuantity = (applicationId: string, quantityValue: number): void => {
    const application = leadApplications.find((candidate) => candidate.id === applicationId)
    if (!application) return
    const quantity = Math.max(0, Number.isFinite(quantityValue) ? quantityValue : 0)
    const grossAmount = roundMoney(application.grossRate * quantity)
    const outputQuantity = application.outputQuantity ?? current?.outputQuantity ?? 1
    upsertLeadApplication({
      ...application,
      quantity,
      quantityManuallyEdited: true,
      quantitySource: `Edited disposal quantity: ${formatQuantity(quantity)} ${application.unit}`,
      grossAmount,
      outputQuantity,
      rateAddition: grossAmount / outputQuantity,
      netAmount: roundMoney(application.netRate * quantity),
      appliedAt: new Date().toISOString()
    })
  }

  useEffect(() => {
    if (!project || !selection || !itemNode) return
    const loaded =
      dashboardContextMatches(project.dashboardSnapshot, project) &&
      dashboardItemIsSynced(project.dashboardSnapshot, itemNode)
      ? project.dashboardSnapshot?.recipes[itemNode.id] ?? null
      : null
    setError('')
    setNotice('')
    setEditing(false)

    if (loaded) {
      const active = override ? adoptSavedRecipe(loaded, override) : cloneRecipe(loaded)
      setDefaultRecipe(loaded)
      setCurrent(active)
      setDraft(cloneRecipe(active))
    } else if (override) {
      const active = cloneRecipe(override)
      setDefaultRecipe(null)
      setCurrent(active)
      setDraft(cloneRecipe(active))
      setNotice('Showing the saved project recipe. Click Sync All DATA to refresh every source DATA.')
    } else {
      setDefaultRecipe(null)
      setCurrent(null)
      setDraft(null)
      setError('This DATA has not been synced yet.')
    }
  }, [
    project?.id,
    project?.meta.sorYear,
    project?.meta.sorZone,
    project?.meta.areaAllowancePercent,
    project?.meta.areaAllowanceLabel,
    selection?.key,
    selection?.nodeId,
    selection?.scopeNodeId,
    project?.dashboardSnapshot?.syncedAt
  ])

  useEffect(() => {
    if (
      !project ||
      !selection ||
      !current ||
      !group ||
      leadApplications.length === 0 ||
      (syncedLeadRates.length === 0 &&
        !leadApplications.some((application) =>
          leadVariants.find((variant) => variant.id === application.variantId)?.pipeLead
        ))
    ) {
      return
    }
    let cancelled = false
    const activeItemNodeId = itemNode?.id
    if (!activeItemNodeId) return

    const refreshLeadApplications = async (): Promise<void> => {
      const info = parseLeadInfo(current.leadApplicability)
      const liftInfo = liftInfoForData(info, `${group.description} ${current.description}`, group.code)
      const basis = (variant: LeadVariant) =>
        basisForData(
          info,
          variant.includedBasis,
          `${group.description} ${current.description}`,
          variant
        )

      for (const application of leadApplications) {
        if (cancelled) return
        const variant = leadVariants.find((candidate) => candidate.id === application.variantId)
        if (!variant) continue

        let effectiveQuantitySource: string
        let breakdown: LeadChargeBreakdown
        if (variant.pipeLead) {
          const quote = await fetchPipeLeadQuoteForMaterial({
            materialItemCode: group.code,
            sorYear: project.meta.sorYear,
            distanceKm: variant.actualLeadKm ?? variant.leadKm,
            quantity: current.outputQuantity || 1,
            zone: null
          })
          breakdown = pipeLeadQuoteBreakdown(quote, project.meta.sorZone ?? 'zone_3')
          effectiveQuantitySource =
            `Published ${current.outputQuantity || 1} ${quote.unit} SOR pipe-rate basis`
        } else {
          const quantity = quantityForVariant(current, variant, info)
          const effectiveQuantity = application.quantityManuallyEdited
            ? Math.max(0, application.quantity)
            : quantity.quantity
          effectiveQuantitySource = application.quantityManuallyEdited
            ? application.quantitySource || `Edited disposal quantity: ${formatQuantity(effectiveQuantity)} ${application.unit || quantity.unit}`
            : quantity.source
          breakdown = calculateLeadVariantChargeFromRows(syncedLeadRates, {
            year: project.meta.sorYear,
            zone: project.meta.sorZone ?? 'zone_3',
            conveyanceClass: variant.conveyanceClass,
            distanceKm: variant.leadKm,
            quantity: effectiveQuantity,
            liftM: variant.liftM,
            includedInitialLiftM: liftInfo.includedInitialLiftM,
            includesAllLifts: liftInfo.includesAllLifts,
            mechanicalConveyanceReachesFinalPoint:
              variant.mechanicalConveyanceReachesFinalPoint ?? variant.leadKm > 0.15,
            handlingMode: handlingModeForData(info, variant, variant.handlingMode),
            materialName: variant.materialName,
            includedBasis: basis(variant),
            customGrossRate: variant.rateSource === 'chart' ? null : variant.customGrossRate ?? null,
            chargeCode: variant.chargeCode,
            leadMultiplier: info.policy?.haulLegs ?? 1
          })
        }
        const next: LeadApplication = {
          ...application,
          addonId: variant.pipeLead
            ? application.addonId
            : addonLeadRuleForVariant(info, variant)?.addonId ?? application.addonId,
          itemCode: group.displayName,
          itemNodeId: application.itemNodeId ?? activeItemNodeId,
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
          outputQuantity: current.outputQuantity || 1,
          rateAddition: breakdown.grossAmount / (current.outputQuantity || 1),
          netRate: breakdown.netRate,
          netAmount: breakdown.netAmount,
          calculation: breakdown.calculation,
          rateZone: project.meta.sorZone ?? 'zone_3',
          rateYear: project.meta.sorYear,
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
    project?.meta.sorZone,
    selection?.key,
    itemNode?.id,
    current,
    group?.key,
    syncedLeadRates,
    leadApplicationSignature,
    leadVariantUpdateSignature
  ])

  if (!project || !selection || !group || !itemNode) {
    return <div className="rate-state">The selected item is no longer in this project.</div>
  }

  const syncAllData = async (): Promise<void> => {
    if (syncing || editing) return
    const sourceProject = useStore.getState().project
    if (!sourceProject || sourceProject.id !== project.id) return

    setSyncing(true)
    setError('')
    setNotice('')
    try {
      const next = await syncDataDashboardSnapshot(sourceProject)
      if (useStore.getState().project?.id === sourceProject.id) {
        setDashboardSnapshot(next)
        setNotice('All project DATA has been refreshed from the active sources.')
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSyncing(false)
    }
  }

  const startEdit = (): void => {
    if (!current) return
    setDraft(cloneRecipe(current))
    setEditing(true)
    setNotice(
      current.itemSource === 'SOR'
        ? 'Edit the SOR description or adopted rate. SSR calculations are not applied to this sheet.'
        : 'Published Supabase values stay unchanged. Edits are recalculated automatically.'
    )
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
    const updated =
      next.itemSource === 'SSR' && next.calculationStale
        ? recalculateRateAnalysis(next)
        : next
    setDraft(updated)
    if (next.itemSource === 'SSR' && next.calculationStale) {
      setNotice('Inputs changed. Recalculation updated automatically.')
    } else if (next.itemSource === 'SOR') {
      setNotice('SOR description/rate updated. Save to adopt it in this project.')
    }
  }

  const applyFixed = (): void => {
    if (!draft) return
    const saved = cloneRecipe(draft)
    saveRateAnalysis(saved, selection.scopeNodeId)
    setCurrent(saved)
    setDraft(cloneRecipe(saved))
    setEditing(false)
    setNotice(
      selection.scopeNodeId
        ? `Changes saved only for ${scopeNode?.name ?? 'the selected component'}.`
        : 'Shared DATA changes saved for every component usage. All Supabase values were left unchanged.'
    )
  }

  const applyDefaults = (): void => {
    if (!defaultRecipe) return
    const restored =
      selection.scopeNodeId && globalOverride
        ? adoptSavedRecipe(defaultRecipe, globalOverride)
        : cloneRecipe(defaultRecipe)
    restoreDefaults(restored, selection.scopeNodeId)
    setCurrent(restored)
    setDraft(cloneRecipe(restored))
    setEditing(false)
    setNotice(
      selection.scopeNodeId
        ? `${scopeNode?.name ?? 'This component'} now uses the shared DATA again.`
        : 'Supabase defaults restored for every usage of this item.'
    )
  }

  return (
    <div className={`rate-dashboard ${printView ? 'dashboard-print-view' : ''}`}>
      <div className="rate-toolbar">
        <button className="btn ghost" onClick={closeRateAnalysis}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="rate-toolbar-title">
          <strong>{group.displayName}</strong>
          <span>
            {group.source !== 'SOR' && group.displayName !== group.code
              ? `Source ${group.code} | `
              : ''}
            {project.meta.sorYear}
            {group.source === 'SOR'
              ? ` | ${zoneLabel(project.meta.sorZone ?? 'zone_3')} SOR rate`
              : ' | Published SSR values (not zoned)'}{' | '}
            {group.usages.length} project usage
            {group.usages.length === 1 ? '' : 's'}
            {scopeNode ? ` | Component scope: ${scopeNode.name}` : ' | Shared DATA'}
          </span>
        </div>
        <div className="rate-toolbar-actions">
          <button
            className="btn ghost"
            disabled={syncing || editing}
            onClick={() => void syncAllData()}
            title="Refresh every project DATA from the active SOR/SSR sources"
          >
            <RefreshCw className={syncing ? 'spin' : undefined} size={14} />
            {syncing ? 'Syncing all DATA…' : 'Sync All DATA'}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setPrintView(true)
              window.setTimeout(() => window.print(), 0)
            }}
          >
            <Printer size={14} /> Print Preview
          </button>
          <button className="btn ghost" onClick={() => setPrintView((value) => !value)}>
            {printView ? <LayoutDashboard size={14} /> : <Eye size={14} />}
            {printView ? 'Dashboard View' : 'View Print View'}
          </button>
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
              {draft?.itemSource !== 'SOR' && (
                <button className="btn ghost" onClick={recalculate} disabled={!draft}>
                  <Calculator size={14} /> Recalculate
                </button>
              )}
              <button className="btn" onClick={applyFixed}>
                <Save size={14} /> Save
              </button>
            </>
          )}
          <button className="btn ghost" onClick={applyDefaults} disabled={!defaultRecipe}>
            <RotateCcw size={14} /> {selection.scopeNodeId ? 'Use Shared DATA' : 'Defaults'}
          </button>
        </div>
      </div>

      {notice && <div className="rate-notice">{notice}</div>}
      {scopeNode && !notice && (
        <div className="rate-notice">
          Component-specific mode: saving affects only <strong>{scopeNode.name}</strong>. Open the
          main DATA row to edit every component.
        </div>
      )}
      {error && (
        <div className="rate-state error">
          <Wrench size={20} />
          <strong>Recipe unavailable</strong>
          <span>{error}</span>
          <button
            className="btn"
            disabled={syncing}
            onClick={() => void syncAllData()}
          >
            <RefreshCw className={syncing ? 'spin' : undefined} size={15} />
            {syncing ? 'Syncing all DATA…' : 'Sync All DATA'}
          </button>
        </div>
      )}
      {syncing && !draft && (
        <div className="rate-state syncing">
          <RefreshCw className="spin" size={20} />
          <strong>Syncing all DATA</strong>
          <span>Reading every active SOR/SSR source and rebuilding the DATA Dashboard…</span>
        </div>
      )}
      {!error && draft && (
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
          {draft.itemSource === 'SSR' && <RecalculationAudit recipe={draft} />}
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
                    onClick={() =>
                      openRateAnalysis(
                        group.key,
                        usage.node.id,
                        true,
                        usage.path[usage.path.length - 1]?.id
                      )
                    }
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
          {printView && itemNode && (
            <SignatureFooterPrint
              settings={resolveSignatureFooter(project, itemNode.id)}
              repeatEveryPage
            />
          )}
        </>
      )}
    </div>
  )
}

function RecalculationAudit({ recipe }: { recipe: RateAnalysisRecipe }): JSX.Element {
  // Snapshot recipes are stored without the trace to keep the project file small;
  // rebuild it here so the audit reads the same either way.
  const result =
    recipe.recalculation && !recipe.recalculation.trace.length
      ? recalculateRateAnalysis(recipe).recalculation
      : recipe.recalculation
  const audit = auditPublishedRateAnalysis(recipe)
  const hasUserEdits = recipe.sections.some((section) =>
    section.lines.some((line) => line.userAdded || (line.editedFields?.length ?? 0) > 0)
  )
  const issues = audit.rows.filter(
    (row) => row.status === 'mismatch' || row.status === 'rounding'
  )
  const sectionLabels = {
    materials: 'Materials',
    machinery: 'Machinery',
    labour: 'Labour'
  }

  const value = (amount: number | null): string =>
    amount === null ? 'Not independently verifiable' : `Rs. ${auditMoney.format(amount)}`

  return (
    <section className="rate-calculation-audit">
      <div className="rate-calculation-heading">
        <div>
          <span>Independent background check</span>
          <strong>Recalculation audit</strong>
        </div>
        <p>
          Published values remain adopted unless a user explicitly edits or adds a row.
        </p>
      </div>
      <div className={`rate-audit-adoption ${hasUserEdits ? 'has-edits' : ''}`}>
        {hasUserEdits
          ? 'Project edits detected — only marked rows and their dependent totals are recalculated.'
          : 'No user edits — published values adopted.'}
      </div>
      <div className="rate-audit-sections">
        {audit.sections.map((section) => (
          <div className="rate-audit-section" key={section.section}>
            <strong>{sectionLabels[section.section]}</strong>
            <span>Published/printed <b>{value(section.publishedTotal)}</b></span>
            <span>Reconciled published-row sum <b>{value(section.recalculatedTotal)}</b></span>
            <span>
              Difference <b>{value(section.difference)}</b>
            </span>
            <small>
              {section.verifiable
                ? `${section.mismatchedRows} displayed multiplication difference${section.mismatchedRows === 1 ? '' : 's'}`
                : `${section.unverifiableRows} contributing row${section.unverifiableRows === 1 ? '' : 's'} unavailable for verification`}
            </small>
          </div>
        ))}
      </div>
      {issues.length > 0 ? (
        <div className="rate-audit-issues">
          <div className="rate-audit-issue-head">
            <span>Section / published row</span>
            <span>Published</span>
            <span>Recalculated</span>
            <span>Difference</span>
            <span>Finding</span>
          </div>
          {issues.map((row) => (
            <div className={`rate-audit-issue ${row.status}`} key={`${row.section}-${row.lineId}`}>
              <span>
                <b>{sectionLabels[row.section]}</b>
                <small>{row.description || row.lineId}</small>
              </span>
              <span>{value(row.publishedAmount)}</span>
              <span>{value(row.recalculatedAmount)}</span>
              <span>{value(row.difference)}</span>
              <strong>{row.status === 'rounding' ? 'Rounding difference' : 'Displayed cells do not reproduce amount'}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="rate-audit-clean">
          No independently verifiable published row mismatch was found.
        </div>
      )}
      {result && result.warnings.length > 0 && (
        <div className="rate-calculation-warnings">
          {result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
      {result && (
        <details className="rate-calculation-trace">
          <summary>Adopted estimate calculation trace</summary>
          <div>
            {result.trace.map((entry, index) => (
              <p
                className={entry.contributes ? 'contributes' : 'display-only'}
                key={`${entry.kind}-${entry.section ?? entry.label ?? index}-${index}`}
              >
                <span>{entry.section ?? entry.label ?? entry.description}</span>
                <small>{entry.formula ?? entry.status}</small>
                <strong>{entry.amount}</strong>
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
