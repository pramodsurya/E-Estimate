import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Coins, RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import {
  circularsFromPeriods,
  fetchMaterialRatePeriods,
  fetchMonthlyMaterials,
  fetchYearlyMaterialRates,
  formatCircularMonth,
  invalidateMaterialRateCache,
  materialUsageForProject,
  periodAt,
  resolveMaterialRate,
  usageLabel,
  type MaterialRateCircular,
  type MaterialRatePeriod,
  type MaterialUsage,
  type MonthlyMaterial
} from '../../lib/materialRates'
import { useStore } from '../../store/useStore'
import type { MaterialRateOverride } from '../../types/project'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const CATEGORY_LABELS: Record<string, string> = {
  CEMENT: 'Cement',
  STEEL: 'Steel',
  STEEL_IRON: 'Steel and iron',
  PUBLIC_HEALTH: 'Public Health'
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** null stages a removal; undefined means "no staged change for this material". */
type StagedOverrides = Record<string, MaterialRateOverride | null>

export default function MaterialRatesPanel(): JSX.Element | null {
  const project = useStore((state) => state.project)
  const updateMeta = useStore((state) => state.updateMeta)

  const [materials, setMaterials] = useState<MonthlyMaterial[]>([])
  const [periods, setPeriods] = useState<MaterialRatePeriod[]>([])
  const [yearlyRates, setYearlyRates] = useState<Map<string, number>>(new Map())
  const [usage, setUsage] = useState<MaterialUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  // Rate edits stay local until Apply. Writing straight to project.meta on every
  // keystroke invalidated every dashboard snapshot and re-rendered the whole app.
  const [staged, setStaged] = useState<StagedOverrides>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Pricing date is audit data, too. Keep it staged with the rate changes so the
  // snapshot never says a circular was applied without saying which date was priced.
  const [stagedAsOf, setStagedAsOf] = useState<string | undefined>(undefined)

  const sorYear = project?.meta.sorYear ?? ''
  const savedAsOf = project?.meta.materialRateAsOf
  const asOf = stagedAsOf ?? savedAsOf ?? todayIso()
  const saved = useMemo(
    () => project?.meta.materialRateOverrides ?? {},
    [project?.meta.materialRateOverrides]
  )

  const load = useCallback(
    async (refresh: boolean): Promise<void> => {
      const current = useStore.getState().project
      if (!current) return
      setLoading(true)
      setError('')
      try {
        if (refresh) invalidateMaterialRateCache()
        const [nextMaterials, nextPeriods, nextYearly, nextUsage] = await Promise.all([
          fetchMonthlyMaterials(),
          fetchMaterialRatePeriods(),
          fetchYearlyMaterialRates(current.meta.sorYear ?? ''),
          materialUsageForProject(current)
        ])
        setMaterials(nextMaterials)
        setPeriods(nextPeriods)
        setYearlyRates(nextYearly)
        setUsage(nextUsage)
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : 'Unable to load material rates.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(false)
  }, [load, sorYear, project?.id])

  /** Effective view = saved overrides with the staged edits laid over them. */
  const overrides = useMemo(() => {
    const next: Record<string, MaterialRateOverride> = { ...saved }
    for (const [code, override] of Object.entries(staged)) {
      if (override === null) delete next[code]
      else next[code] = override
    }
    return next
  }, [saved, staged])

  const dirty = useMemo(() => {
    const ratesDirty = Object.entries(staged).some(([code, override]) => {
        const current = saved[code]
        if (override === null) return current !== undefined
        return (
          current?.rate !== override.rate ||
          current?.source !== override.source ||
          current?.effectiveFrom !== override.effectiveFrom ||
          current?.label !== override.label
        )
      })
    return ratesDirty || (stagedAsOf !== undefined && stagedAsOf !== savedAsOf)
  }, [staged, saved, stagedAsOf, savedAsOf])

  const usageByCode = useMemo(
    () => new Map(usage.map((entry) => [entry.materialCode, entry.usedBy])),
    [usage]
  )
  const circulars = useMemo(() => circularsFromPeriods(periods), [periods])
  // Indexed once so each row is not scanning the whole period list on every render.
  const periodsByCode = useMemo(() => {
    const map = new Map<string, MaterialRatePeriod[]>()
    for (const period of periods) {
      const list = map.get(period.materialCode) ?? []
      list.push(period)
      map.set(period.materialCode, list)
    }
    return map
  }, [periods])

  const visibleMaterials = useMemo(() => {
    const rows = showAll
      ? materials
      : materials.filter(
          (material) =>
            usageByCode.has(material.materialCode) || overrides[material.materialCode]
        )
    return [...rows].sort((a, b) => {
      const category = (CATEGORY_LABELS[a.category] ?? a.category).localeCompare(
        CATEGORY_LABELS[b.category] ?? b.category
      )
      return category !== 0 ? category : a.name.localeCompare(b.name)
    })
  }, [materials, showAll, usageByCode, overrides])

  const pendingCircular = useMemo((): MaterialRateCircular | null => {
    const adopted = Object.values(overrides)
      .map((override) => override.effectiveFrom ?? '')
      .filter(Boolean)
      .sort()
    const latestAdopted = adopted[adopted.length - 1] ?? ''
    const relevant = circulars.filter((circular) =>
      circular.materialCodes.some(
        (code) => usageByCode.has(code) || overrides[code] !== undefined
      )
    )
    const newest = relevant.find((circular) =>
      circular.effectiveFrom <= asOf &&
      (!circular.effectiveTo || circular.effectiveTo >= asOf)
    )
    if (!newest) return null
    return newest.effectiveFrom > latestAdopted ? newest : null
  }, [asOf, circulars, overrides, usageByCode])

  if (!project) return null

  const stage = (materialCode: string, override: MaterialRateOverride | null): void => {
    setStaged((current) => ({ ...current, [materialCode]: override }))
  }

  const stageCircular = (circular: MaterialRateCircular): void => {
    const next: StagedOverrides = { ...staged }
    const label = circular.source || `Circular ${formatCircularMonth(circular.effectiveFrom)}`
    for (const material of materials) {
      const alreadyTracked =
        usageByCode.has(material.materialCode) || overrides[material.materialCode]
      if (!showAll && !alreadyTracked) continue
      const period = periodAt(periods, material.materialCode, circular.effectiveFrom)
      if (!period) continue
      next[material.materialCode] = {
        rate: period.rate,
        source: 'MONTHLY_CIRCULAR',
        effectiveFrom: period.effectiveFrom,
        label,
        setAt: new Date().toISOString()
      }
    }
    setDrafts({})
    setStaged(next)
    setStagedAsOf(circular.effectiveFrom)
  }

  const commitDraft = (materialCode: string): void => {
    const raw = drafts[materialCode]
    if (raw === undefined) return
    setDrafts((current) => {
      const next = { ...current }
      delete next[materialCode]
      return next
    })
    const trimmed = raw.trim()
    if (!trimmed) {
      stage(materialCode, null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    stage(materialCode, {
      rate: parsed,
      source: 'MANUAL',
      label: 'Rate entered for this estimate',
      setAt: new Date().toISOString()
    })
  }

  const apply = (): void => {
    // One write, so dashboards invalidate once instead of once per edit.
    updateMeta({
      materialRateOverrides: overrides,
      ...(stagedAsOf !== undefined ? { materialRateAsOf: stagedAsOf } : {})
    })
    setStaged({})
    setDrafts({})
    setStagedAsOf(undefined)
  }

  const discard = (): void => {
    setStaged({})
    setDrafts({})
    setStagedAsOf(undefined)
  }

  const stageClearAll = (): void => {
    const next: StagedOverrides = { ...staged }
    for (const code of Object.keys(overrides)) next[code] = null
    setDrafts({})
    setStaged(next)
  }

  const overriddenCount = Object.keys(overrides).length
  const savedCount = Object.keys(saved).length

  return (
    <section className="material-rates-panel">
      <div className="material-rates-intro">
        <div>
          <strong>Cement / Steel rates</strong>
          <p>
            Rates here apply to <b>this estimate only</b> and never change other projects.
            Edit as many as you need, then press <b>Apply</b> — nothing re-prices until you
            do. Published and created SSR DATA follow the adopted rate; a manually entered
            resource rate stays locked.
          </p>
        </div>
        <div className="material-rates-actions">
          <button className="btn ghost" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rate-warning">
          <AlertTriangle size={14} /> {error}
        </div>
      ) : null}

      {pendingCircular ? (
        <div className="material-rates-update">
          <span>
            <AlertTriangle size={14} />
            A newer circular is available —{' '}
            <b>{formatCircularMonth(pendingCircular.effectiveFrom)}</b>
            {pendingCircular.source ? ` (${pendingCircular.source})` : ''}.
          </span>
          <button className="btn ghost" onClick={() => stageCircular(pendingCircular)}>
            <Check size={14} /> Use these rates
          </button>
        </div>
      ) : null}

      <div className="material-rates-toolbar">
        <label>
          Pricing date
          <input
            type="date"
            value={asOf}
            onChange={(event) => setStagedAsOf(event.target.value)}
          />
        </label>
        <label>
          Adopt a month
          <select
            value=""
            onChange={(event) => {
              const circular = circulars.find(
                (entry) => entry.effectiveFrom === event.target.value
              )
              if (circular) stageCircular(circular)
            }}
          >
            <option value="">Choose a published circular…</option>
            {circulars.map((circular) => (
              <option key={circular.effectiveFrom} value={circular.effectiveFrom}>
                {formatCircularMonth(circular.effectiveFrom)} ·{' '}
                {circular.materialCodes.length} materials
              </option>
            ))}
          </select>
        </label>
        <label className="material-rates-toggle">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show every monthly material
        </label>
        {overriddenCount > 0 ? (
          <button className="btn ghost" onClick={stageClearAll}>
            <RotateCcw size={14} /> Clear all ({overriddenCount})
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="backend-data-placeholder">
          <Coins size={22} />
          <strong>Loading material rates…</strong>
        </div>
      ) : visibleMaterials.length === 0 ? (
        <div className="backend-data-placeholder">
          <Coins size={22} />
          <strong>No cement or steel in this estimate yet</strong>
          <span>
            Add an item that consumes cement, steel or a Public Health material and it will
            appear here. Tick “Show every monthly material” to set a rate ahead of time.
          </span>
        </div>
      ) : (
        <div className="material-rates-table">
          <div className="material-rates-head">
            <span>Material</span>
            <span>Unit</span>
            <span>Used by</span>
            <span>Effective rate</span>
            <span>Rate for this estimate</span>
            <span />
          </div>
          {visibleMaterials.map((material) => {
            const resolved = resolveMaterialRate(material.materialCode, {
              overrides,
              periods: periodsByCode.get(material.materialCode) ?? [],
              yearlyRates,
              asOf,
              sorYear
            })
            const override = overrides[material.materialCode]
            const isStaged = staged[material.materialCode] !== undefined
            const usedBy = usageByCode.get(material.materialCode) ?? []
            const draft = drafts[material.materialCode]
            return (
              <div
                className={`material-rates-row ${isStaged ? 'staged' : ''}`}
                key={material.materialCode}
              >
                <span className="material-rates-name">
                  <strong>{material.name}</strong>
                  <small>
                    {CATEGORY_LABELS[material.category] ?? material.category} ·{' '}
                    {material.materialCode}
                  </small>
                </span>
                <span>{material.unit}</span>
                <span className="material-rates-usage">
                  {usedBy.length === 0 ? (
                    <small className="material-rates-unused">Not used in this estimate</small>
                  ) : (
                    usedBy.map((ref) => (
                      <small
                        key={`${ref.source}:${ref.code}:${ref.description}`}
                        className={`material-rates-ref ${ref.source.toLowerCase()}`}
                        title={
                          ref.source === 'SSR' && ref.description !== ref.code
                            ? ref.description
                            : undefined
                        }
                      >
                        {usageLabel(ref)}
                      </small>
                    ))
                  )}
                </span>
                <span className="material-rates-effective">
                  {resolved.rate === null ? (
                    <em>No rate available</em>
                  ) : (
                    <>
                      ₹ {money.format(resolved.rate)}
                      <small
                        className={`material-rates-origin ${resolved.origin.toLowerCase()}`}
                      >
                        {isStaged ? 'Not applied yet' : resolved.label}
                      </small>
                    </>
                  )}
                </span>
                <span className="material-rates-input">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={override ? '' : 'Use published rate'}
                    value={draft ?? (override ? String(override.rate) : '')}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [material.materialCode]: event.target.value
                      }))
                    }
                    onBlur={() => commitDraft(material.materialCode)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                  <small>per {material.unit}</small>
                </span>
                <span>
                  {override ? (
                    <button
                      className="btn-mini"
                      title="Return to the published rate"
                      onClick={() => stage(material.materialCode, null)}
                    >
                      Reset
                    </button>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="material-rates-footer">
        <span className="material-rates-note">
          {dirty ? (
            <>
              <b>Not applied yet.</b> Press Apply to save the selected pricing date and
              re-price the estimate, then re-run{' '}
              <b>Sync</b> on the DATA, Component and Project dashboards.
            </>
          ) : savedCount > 0 ? (
            <>
              {savedCount} rate{savedCount === 1 ? '' : 's'} applied to this estimate.
            </>
          ) : (
            <>No project rates set. Items price at the published SOR rate.</>
          )}
        </span>
        <span className="material-rates-footer-actions">
          <button className="btn ghost" onClick={discard} disabled={!dirty}>
            <Undo2 size={14} /> Discard changes
          </button>
          <button className="btn" onClick={apply} disabled={!dirty}>
            <Check size={14} /> Apply
          </button>
        </span>
      </div>
    </section>
  )
}
