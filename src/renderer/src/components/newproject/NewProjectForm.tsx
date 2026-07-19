import { useEffect, useState } from 'react'
import { Check, LoaderCircle, MapPin, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { fetchSorYears, resolveAreaAllowance } from '../../lib/masterData'
import type { ProjectAreaAllowance, ProjectLocation, ProjectMeta } from '../../types/project'
import LocationMap from './LocationMap'

const FALLBACK_YEARS = ['2026-27', '2025-26', '2024-25', '2023-24']
const ALLOWANCE_TYPES = [
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
  const [location, setLocation] = useState<ProjectLocation | null>(initialMeta?.location ?? null)
  const [areaAllowance, setAreaAllowance] = useState<ProjectAreaAllowance | null>(
    initialMeta?.areaAllowance ??
      (initialMeta
        ? {
            type: null,
            label: initialMeta.areaAllowanceLabel ?? 'No location-based area allowance',
            percent: initialMeta.areaAllowancePercent ?? 0
          }
        : null)
  )
  const [resolvingAllowance, setResolvingAllowance] = useState(false)
  const [allowanceError, setAllowanceError] = useState<string | null>(null)
  const [allowanceMode, setAllowanceMode] = useState<'automatic' | 'manual'>(
    initialMeta?.areaAllowance?.source === 'manual' ? 'manual' : 'automatic'
  )
  const [manualAllowanceType, setManualAllowanceType] = useState(
    initialMeta?.areaAllowance?.source === 'manual' ? initialMeta.areaAllowance.type ?? '' : ''
  )

  const [searchText, setSearchText] = useState(initialMeta?.location?.label ?? '')
  const [searching, setSearching] = useState(false)
  const [recenterToken, setRecenterToken] = useState(0)
  const [latInput, setLatInput] = useState(
    initialMeta?.location ? initialMeta.location.lat.toFixed(6) : ''
  )
  const [lngInput, setLngInput] = useState(
    initialMeta?.location ? initialMeta.location.lng.toFixed(6) : ''
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
    if (!location || !sorYear) {
      setAreaAllowance(null)
      setAllowanceError(null)
      return
    }
    let alive = true
    setResolvingAllowance(true)
    setAllowanceError(null)
    void resolveAreaAllowance(
      location,
      sorYear,
      allowanceMode === 'manual' ? manualAllowanceType || null : undefined
    )
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
  }, [location?.lat, location?.lng, sorYear, allowanceMode, manualAllowanceType])

  const pick = (lat: number, lng: number, label?: string): void => {
    setLocation({ lat, lng, label })
    setLatInput(lat.toFixed(6))
    setLngInput(lng.toFixed(6))
  }

  const searchLocation = async (): Promise<void> => {
    const query = searchText.trim()
    if (!query) return
    setSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      )
      const data = (await response.json()) as { lat: string; lon: string; display_name: string }[]
      if (data[0]) {
        pick(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name)
        setRecenterToken((token) => token + 1)
      }
    } catch {
      setLoadError('Location search failed. You can still click the map or enter coordinates.')
    } finally {
      setSearching(false)
    }
  }

  const applyLatLng = (): void => {
    const lat = parseFloat(latInput)
    const lng = parseFloat(lngInput)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      pick(lat, lng)
      setRecenterToken((token) => token + 1)
    }
  }

  const valid =
    name.trim().length > 0 &&
    Boolean(sorYear) &&
    Boolean(location) &&
    Boolean(areaAllowance) &&
    !resolvingAllowance &&
    !allowanceError

  const submit = (): void => {
    if (!valid || !location || !areaAllowance) return
    const meta: ProjectMeta = {
      name: name.trim(),
      sorYear,
      sorZone,
      areaAllowancePercent: areaAllowance.percent,
      areaAllowanceLabel: areaAllowance.label,
      areaAllowance,
      location,
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
            Set up the project details. Area allowance is identified from the selected location.
          </p>
        </>
      ) : (
        <p className="form-lead project-edit-lead">
          Edit the same project details used during creation. Changing the location or year refreshes
          the area allowance automatically.
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

      <div className="form-section">
        <h2>
          Location<span className="required-mark">*</span>
        </h2>
        <div className="map-tools">
          <input
            className="text-input"
            placeholder="Search a place (OpenStreetMap)…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void searchLocation()
            }}
          />
          <button className="btn ghost" onClick={() => void searchLocation()} disabled={searching}>
            <Search size={14} /> {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div className="map-tools">
          <input
            className="text-input"
            placeholder="Latitude"
            value={latInput}
            onChange={(event) => setLatInput(event.target.value)}
          />
          <input
            className="text-input"
            placeholder="Longitude"
            value={lngInput}
            onChange={(event) => setLngInput(event.target.value)}
          />
          <button className="btn ghost" onClick={applyLatLng}>
            <MapPin size={14} /> Go
          </button>
        </div>
        <LocationMap value={location} onPick={pick} recenterToken={recenterToken} />
        <div className="latlng-display">
          {location
            ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${
                location.label ? ` · ${location.label}` : ''
              }`
            : 'Click the map, search, or enter coordinates to set the project location.'}
        </div>
      </div>

      <div className="form-section area-allowance-section">
        <h2>Area Allowance</h2>
        <div className="allowance-mode-control" role="group" aria-label="Area allowance classification mode">
          <button
            type="button"
            className={allowanceMode === 'automatic' ? 'active' : ''}
            onClick={() => setAllowanceMode('automatic')}
          >
            Automatic from map
          </button>
          <button
            type="button"
            className={allowanceMode === 'manual' ? 'active' : ''}
            onClick={() => setAllowanceMode('manual')}
          >
            Manual override
          </button>
        </div>
        {allowanceMode === 'manual' && (
          <div className="allowance-flags" aria-label="Manual area classification">
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
        )}
        {resolvingAllowance ? (
          <div className="allowance-status is-loading">
            <LoaderCircle size={18} className="spin" /> Checking the selected location…
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
              <span>Mapped location</span>
              <strong>
                {[areaAllowance.village, areaAllowance.mandal, areaAllowance.district]
                  .filter(Boolean)
                  .join(', ') || 'Outside a mapped allowance area'}
              </strong>
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
          <div className="allowance-status">Select the project location to determine allowance.</div>
        )}
        {areaAllowance?.description && (
          <p className="allowance-description">{areaAllowance.description}</p>
        )}
      </div>

      <div className="form-create-bar">
        <button className="btn lg" disabled={!valid} onClick={submit}>
          <Check size={16} /> {mode === 'edit' ? 'Save Project Changes' : 'Create Project'}
        </button>
      </div>
    </div>
  )
}

export default function NewProjectForm(): JSX.Element {
  return <ProjectDetailsForm />
}
