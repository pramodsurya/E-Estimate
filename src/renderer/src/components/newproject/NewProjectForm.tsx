import { useEffect, useState } from 'react'
import { Check, MapPin, Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { fetchFlags, fetchSorYears, type FlagDef } from '../../lib/masterData'
import type { ProjectLocation } from '../../types/project'
import LocationMap from './LocationMap'

const FALLBACK_YEARS = ['2025-26']
const FALLBACK_FLAGS: FlagDef[] = [
  { type: 'GHMC', label: 'GHMC', description: null },
  { type: 'MUNICIPALITY', label: 'Municipality', description: null },
  { type: 'CORPORATION', label: 'Corporation', description: null },
  { type: 'AGENCY_TRIBAL', label: 'Agency Tribal', description: null },
  { type: 'INDUSTRIAL', label: 'Industrial', description: null },
  { type: 'GHAT_NORMAL', label: 'Ghat Normal', description: null },
  { type: 'GHAT_EXCEPTIONAL', label: 'Ghat Exceptional', description: null },
  { type: 'JAIL', label: 'Jail', description: null },
  { type: 'NIGHT_WORK', label: 'Night Work', description: null }
]

export default function NewProjectForm(): JSX.Element {
  const createProject = useStore((s) => s.createProject)

  const [name, setName] = useState('')
  const [years, setYears] = useState<string[]>([])
  const [sorYear, setSorYear] = useState('')
  const [flagDefs, setFlagDefs] = useState<FlagDef[]>([])
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [location, setLocation] = useState<ProjectLocation | null>(null)

  const [searchText, setSearchText] = useState('')
  const [searching, setSearching] = useState(false)
  const [recenterToken, setRecenterToken] = useState(0)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const y = await fetchSorYears()
        if (!alive) return
        const list = y.length ? y : FALLBACK_YEARS
        setYears(list)
        setSorYear((cur) => cur || list[0] || '')
      } catch {
        if (!alive) return
        setYears(FALLBACK_YEARS)
        setSorYear((cur) => cur || FALLBACK_YEARS[0])
        setLoadError('Could not reach Supabase — using offline defaults.')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!sorYear) return
    let alive = true
    void (async () => {
      try {
        const f = await fetchFlags(sorYear)
        if (alive) setFlagDefs(f.length ? f : FALLBACK_FLAGS)
      } catch {
        if (alive) setFlagDefs(FALLBACK_FLAGS)
      }
    })()
    return () => {
      alive = false
    }
  }, [sorYear])

  const pick = (lat: number, lng: number, label?: string): void => {
    setLocation({ lat, lng, label })
    setLatInput(lat.toFixed(6))
    setLngInput(lng.toFixed(6))
  }

  const searchLocation = async (): Promise<void> => {
    const q = searchText.trim()
    if (!q) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
      )
      const data = (await res.json()) as { lat: string; lon: string; display_name: string }[]
      if (data[0]) {
        pick(parseFloat(data[0].lat), parseFloat(data[0].lon), data[0].display_name)
        setRecenterToken((t) => t + 1)
      }
    } catch {
      /* ignore search failures */
    } finally {
      setSearching(false)
    }
  }

  const applyLatLng = (): void => {
    const lat = parseFloat(latInput)
    const lng = parseFloat(lngInput)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      pick(lat, lng)
      setRecenterToken((t) => t + 1)
    }
  }

  const toggleFlag = (type: string): void => {
    setFlags((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const valid = name.trim().length > 0 && !!sorYear && !!location

  const submit = (): void => {
    if (!valid || !location) return
    createProject({
      name: name.trim(),
      sorYear,
      location,
      flags: Array.from(flags)
    })
  }

  return (
    <div className="form-page">
      <h1>New Project</h1>
      <p className="form-lead">
        Set up the project details. Required fields are marked
        <span className="required-mark">*</span>.
      </p>
      {loadError && (
        <div className="settings-note" style={{ borderColor: 'rgba(244,135,113,.4)' }}>
          {loadError}
        </div>
      )}

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
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field" style={{ maxWidth: 220 }}>
            <label className="field-label">
              SOR / SSR Year<span className="required-mark">*</span>
            </label>
            <select
              className="select-input"
              value={sorYear}
              onChange={(e) => setSorYear(e.target.value)}
            >
              <option value="" disabled>
                Select year…
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h2>Location<span className="required-mark">*</span></h2>
        <div className="map-tools">
          <input
            className="text-input"
            placeholder="Search a place (OpenStreetMap)…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void searchLocation()
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
            onChange={(e) => setLatInput(e.target.value)}
          />
          <input
            className="text-input"
            placeholder="Longitude"
            value={lngInput}
            onChange={(e) => setLngInput(e.target.value)}
          />
          <button className="btn ghost" onClick={applyLatLng}>
            <MapPin size={14} /> Go
          </button>
        </div>
        <LocationMap value={location} onPick={pick} recenterToken={recenterToken} />
        <div className="latlng-display">
          {location
            ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${
                location.label ? `  ·  ${location.label}` : ''
              }`
            : 'Click the map, search, or enter coordinates to set the project location.'}
        </div>
      </div>

      <div className="form-section">
        <h2>Flags</h2>
        <p className="form-lead" style={{ marginTop: -6 }}>
          Master flags from Supabase. Location-based auto-selection arrives in a later part — set
          them manually for now.
        </p>
        <div className="flags-grid">
          {flagDefs.map((f) => {
            const on = flags.has(f.type)
            return (
              <button
                key={f.type}
                className={`flag-chip ${on ? 'selected' : ''}`}
                title={f.description ?? f.label}
                onClick={() => toggleFlag(f.type)}
              >
                <span className="flag-check">{on && <Check size={11} />}</span>
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="form-create-bar">
        <button className="btn lg" disabled={!valid} onClick={submit}>
          <Check size={16} /> Create Project
        </button>
      </div>
    </div>
  )
}
