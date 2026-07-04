import { useEffect, useMemo, useState } from 'react'
import { CircleDot, Gem, Search } from 'lucide-react'
import {
  fetchSeigniorageCharges,
  seigniorageRateLabel,
  type SeigniorageCharge
} from '../../lib/seigniorage'
import { useStore } from '../../store/useStore'

export default function SeignioragePanel(): JSX.Element {
  const selection = useStore((state) => state.seigniorageSelection)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const [charges, setCharges] = useState<SeigniorageCharge[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchSeigniorageCharges()
      .then((rows) => {
        if (!cancelled) setCharges(rows)
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to load seigniorage charges.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return charges
    return charges.filter((charge) =>
      [charge.seig_code, charge.mineral_name, charge.schedule, charge.go_reference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    )
  }, [charges, query])

  return (
    <div className="seig-panel">
      <div className="lead-abstract-title">
        <strong>Seigniorage</strong>
        <span>{charges.length}</span>
      </div>

      <label className="seig-search">
        <Search size={12} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search mineral..."
        />
      </label>

      {error ? <div className="lead-panel-error">{error}</div> : null}
      {loading ? <div className="lead-panel-empty">Loading seigniorage table...</div> : null}
      {!loading && filtered.length === 0 ? (
        <div className="lead-panel-empty">No seigniorage charge matches this search.</div>
      ) : null}

      <div className="seig-list">
        {filtered.map((charge) => {
          const selected = selection?.seigCode === charge.seig_code
          return (
            <button
              className={`seig-row ${selected ? 'selected' : ''}`}
              key={charge.seig_code}
              onClick={() => openSeigniorage({ seigCode: charge.seig_code })}
              title={charge.mineral_name}
            >
              <CircleDot size={12} />
              <span>
                <strong>{charge.mineral_name}</strong>
                <small>{charge.seig_code}</small>
              </span>
              <b>{seigniorageRateLabel(charge)}</b>
            </button>
          )
        })}
      </div>

      <button className="seig-open-all" onClick={() => openSeigniorage()}>
        <Gem size={12} />
        Open full table
      </button>
    </div>
  )
}
