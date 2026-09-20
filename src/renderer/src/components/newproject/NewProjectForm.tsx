import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { fetchSorYears } from '../../lib/masterData'
import { resolveManualAreaAllowance } from '../../lib/manualAreaAllowance'
import type { ProjectAreaAllowance, ProjectMeta } from '../../types/project'

const FALLBACK_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24']
export const ALLOWANCE_TYPES = [
  { value: 'GHMC', label: 'GHMC' },
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'MUNICIPALITY', label: 'Municipality' },
  { value: 'INDUSTRIAL', label: 'Industrial area' },
  { value: 'AGENCY_TRIBAL', label: 'Agency / Tribal' },
  { value: '', label: 'None' }
] as const

interface ProjectDetailsFormProps {
  mode?: 'create' | 'edit'
  initialMeta?: ProjectMeta
  onSaved?: () => void
}

export function ProjectDetailsForm({
  mode = 'create',
  initialMeta,
  onSaved
}: ProjectDetailsFormProps): JSX.Element {
  const createProject = useStore((s) => s.createProject)
  const updateMeta = useStore((s) => s.updateMeta)

  const [name, setName] = useState(initialMeta?.name ?? '')
  const [years, setYears] = useState<string[]>([])
  const [sorYear, setSorYear] = useState(initialMeta?.sorYear ?? '')
  const [sorZone, setSorZone] = useState<'zone_1' | 'zone_2' | 'zone_3'>(
    initialMeta?.sorZone ?? 'zone_3'
  )
  const [areaAllowance, setAreaAllowance] = useState<ProjectAreaAllowance | null>(
    initialMeta?.areaAllowance ??
      (initialMeta
        ? {
            type: null,
            label: initialMeta.areaAllowanceLabel ?? 'No area allowance (manual)',
            percent: initialMeta.areaAllowancePercent ?? 0
          }
        : null)
  )
  const [resolvingAllowance, setResolvingAllowance] = useState(false)
  const [allowanceError, setAllowanceError] = useState<string | null>(null)
  const [manualAllowanceType, setManualAllowanceType] = useState(
    initialMeta?.areaAllowance?.type ?? ''
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const hasSorZones = sorYear === '2026-27'

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const loaded = await fetchSorYears()
        if (!alive) return
        const base = loaded.length ? loaded : FALLBACK_YEARS
        const list = initialMeta?.sorYear && !base.includes(initialMeta.sorYear)
          ? [initialMeta.sorYear, ...base]
          : base
        setYears(list)
        setSorYear((current) => current || list[0] || '')
      } catch {
        if (!alive) return
        setYears(FALLBACK_YEARS)
        setSorYear((current) => current || FALLBACK_YEARS[0])
        setLoadError('Could not reach Supabase — using offline year defaults.')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!hasSorZones) setSorZone('zone_3')
  }, [hasSorZones])

  useEffect(() => {
    if (!sorYear) {
      setAreaAllowance(null)
      setAllowanceError(null)
      return
    }
    let alive = true
    setResolvingAllowance(true)
    setAllowanceError(null)
    void resolveManualAreaAllowance(manualAllowanceType || null, sorYear)
      .then((resolved) => {
        if (alive) setAreaAllowance(resolved)
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setAreaAllowance(null)
        setAllowanceError(
          reason instanceof Error ? reason.message : 'Could not determine area allowance.'
        )
      })
      .finally(() => {
        if (alive) setResolvingAllowance(false)
      })
    return () => {
      alive = false
    }
  }, [sorYear, manualAllowanceType])

  const valid =
    name.trim().length > 0 &&
    Boolean(sorYear) &&
    Boolean(areaAllowance) &&
    !resolvingAllowance &&
    !allowanceError

  const submit = (): void => {
    if (!valid || !areaAllowance) return
    const meta: ProjectMeta = {
      name: name.trim(),
      sorYear,
      sorZone,
      areaAllowancePercent: areaAllowance.percent,
      areaAllowanceLabel: areaAllowance.label,
      areaAllowance,
      location: mode === 'edit' ? (initialMeta?.location ?? null) : null,
      flags: areaAllowance.type ? [areaAllowance.type] : [],
      taxSettings: initialMeta?.taxSettings ?? {
        mode: 'automatic',
        recipientType: 'CENTRAL_STATE_UT_LOCAL'
      }
    }
    if (mode === 'edit') updateMeta(meta)
    else createProject(meta)
    onSaved?.()
  }

  return (
    <div className={`form-page project-details-form ${mode === 'edit' ? 'is-editing' : ''}`}>
      {mode === 'create' ? (
        <>
          <h1>New Project</h1>
          <p className="form-lead">
            Set up the project details. Choose the area classification for the labour allowance.
          </p>
        </>
      ) : (
        <p className="form-lead project-edit-lead">
          Edit the same project details used during creation. Changing the year or
          classification refreshes the area allowance automatically.
        </p>
      )}

      {loadError && <div className="settings-note project-form-warning">{loadError}</div>}

      <div className="form-section">
        <h2>Project</h2>
        <div className="field-row">
          <div className="field">
            <label className="field-label">
              Name of Project<span className="required-mark">*</span>
            </label>
            <input
              data-tour="np-name"
              className="text-input"
              placeholder="e.g. Repairs to Sluice at Kakarvani Tank"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus={mode === 'create'}
            />
          </div>
          <div className="field project-year-field">
            <label className="field-label">
              SOR / SSR Year<span className="required-mark">*</span>
            </label>
            <select
              data-tour="np-year"
              className="select-input"
              value={sorYear}
              onChange={(event) => setSorYear(event.target.value)}
            >
              <option value="" disabled>
                Select year…
              </option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {hasSorZones && (
            <div className="field project-zone-field">
              <label className="field-label">Zone</label>
              <select
                data-tour="np-zone"
                className="select-input"
                value={sorZone}
                onChange={(event) => setSorZone(event.target.value as typeof sorZone)}
              >
                <option value="zone_1">Zone I</option>
                <option value="zone_2">Zone II</option>
                <option value="zone_3">Zone III</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="form-section area-allowance-section" data-tour="np-allowance">
        <h2>Area Allowance</h2>
        <p className="form-lead">Select the area classification for this project.</p>
        <div className="allowance-flags" aria-label="Area classification">
          {ALLOWANCE_TYPES.map((option) => (
            <button
              type="button"
              key={option.value || 'none'}
              className={manualAllowanceType === option.value ? 'selected' : ''}
              onClick={() => setManualAllowanceType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {resolvingAllowance ? (
          <div className="allowance-status is-loading">
            <LoaderCircle size={18} className="spin" /> Looking up the allowance rule…
          </div>
        ) : allowanceError ? (
          <div className="allowance-status is-error">{allowanceError}</div>
        ) : areaAllowance ? (
          <div className="allowance-result">
            <div>
              <span>Allowance</span>
              <strong>{areaAllowance.label}</strong>
            </div>
            <div>
              <span>Labour percentage</span>
              <strong>{areaAllowance.percent.toFixed(2)}%</strong>
            </div>
            <div>
              <span>Rule source</span>
              <strong>
                {areaAllowance.ruleYear || sorYear}
                {areaAllowance.goReference ? ` · ${areaAllowance.goReference}` : ''}
              </strong>
            </div>
          </div>
        ) : (
          <div className="allowance-status">Select an area classification above to determine the allowance.</div>
        )}
        {areaAllowance?.description && (
          <p className="allowance-description">{areaAllowance.description}</p>
        )}
      </div>

      <div className="form-create-bar">
        <button className="btn lg" data-tour="np-create" disabled={!valid} onClick={submit}>
          <Check size={16} /> {mode === 'edit' ? 'Save Project Changes' : 'Create Project'}
        </button>
      </div>
    </div>
  )
}

export default function NewProjectForm(): JSX.Element {
  return <ProjectDetailsForm />
}
