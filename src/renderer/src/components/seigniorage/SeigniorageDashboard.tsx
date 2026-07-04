import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Gem, IndianRupee, ShieldCheck, TableProperties, X } from 'lucide-react'
import {
  fetchSeigniorageCharges,
  seigniorageRateLabel,
  type SeigniorageCharge
} from '../../lib/seigniorage'
import { useStore } from '../../store/useStore'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function SeigniorageDashboard(): JSX.Element {
  const selection = useStore((state) => state.seigniorageSelection)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const closeSeigniorage = useStore((state) => state.closeSeigniorage)
  const [charges, setCharges] = useState<SeigniorageCharge[]>([])
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
          setError(reason instanceof Error ? reason.message : 'Unable to load seigniorage table.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => charges.find((charge) => charge.seig_code === selection?.seigCode) ?? null,
    [charges, selection?.seigCode]
  )

  if (loading) return <div className="rate-state">Loading seigniorage charges from Supabase...</div>
  if (error) {
    return (
      <div className="rate-state error">
        <strong>Seigniorage table could not load.</strong>
        <span>{error}</span>
      </div>
    )
  }

  const verifiedCount = charges.filter((charge) => charge.confidence === 'VERIFIED').length
  const mtRates = charges.filter((charge) => charge.rate_per_mt !== null).length
  const m3Rates = charges.filter((charge) => charge.rate_per_m3 !== null).length

  return (
    <div className="dashboard seig-dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">Supabase seigniorage table</div>
          <h1 className="dash-title">
            <Gem size={22} />
            Seigniorage
          </h1>
        </div>
        <div className="dash-actions">
          <button className="btn ghost" onClick={closeSeigniorage}>
            <X size={14} /> Close
          </button>
        </div>
      </div>

      <div className="lead-status-row">
        <span>{charges.length} charge item(s)</span>
        <span>{verifiedCount} verified</span>
        <span>{mtRates} MT rate(s)</span>
        <span>{m3Rates} m3 rate(s)</span>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <div className="card-title">
            <span>{selected ? 'Selected charge' : 'Table status'}</span>
            <TableProperties size={14} />
          </div>
          {selected ? (
            <>
              <h2 className="seig-selected-title">{selected.mineral_name}</h2>
              <div className="meta-row">
                <span className="meta-key">Code</span>
                <span className="meta-val">{selected.seig_code}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Schedule</span>
                <span className="meta-val">{selected.schedule ?? '-'}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Confidence</span>
                <span className="meta-val">{selected.confidence ?? '-'}</span>
              </div>
            </>
          ) : (
            <div className="placeholder-box">
              Select a mineral from the Seigniorage tab to inspect its rate and source.
            </div>
          )}
        </section>

        <section className="dash-card">
          <div className="card-title">
            <span>Rates</span>
            <IndianRupee size={14} />
          </div>
          {selected ? (
            <div className="seig-rate-grid">
              <RateBlock label="Per MT" value={selected.rate_per_mt} suffix="/ MT" />
              <RateBlock label="Per m3" value={selected.rate_per_m3} suffix="/ m3" />
            </div>
          ) : (
            <div className="seig-rate-grid">
              <Metric label="MT rates" value={mtRates} />
              <Metric label="m3 rates" value={m3Rates} />
            </div>
          )}
        </section>

        <section className="dash-card span-2">
          <div className="card-title">
            <span>Source</span>
            <CalendarDays size={14} />
          </div>
          <div className="meta-row">
            <span className="meta-key">Effective from</span>
            <span className="meta-val">{selected?.effective_from ?? latestEffectiveDate(charges)}</span>
          </div>
          <div className="meta-row">
            <span className="meta-key">GO reference</span>
            <span className="meta-val">{selected?.go_reference ?? commonGoReference(charges)}</span>
          </div>
          {selected?.notes ? (
            <div className="seig-note">
              <ShieldCheck size={14} />
              <span>{selected.notes}</span>
            </div>
          ) : null}
        </section>

        <section className="dash-card span-2">
          <div className="card-title">
            <span>Seigniorage rate schedule</span>
            <span>{charges.length}</span>
          </div>
          <div className="seig-table">
            <div className="seig-table-head">
              <span>Code</span>
              <span>Mineral</span>
              <span>Rate</span>
              <span>Schedule</span>
            </div>
            {charges.map((charge) => (
              <button
                className={`seig-table-row ${
                  selected?.seig_code === charge.seig_code ? 'selected' : ''
                }`}
                key={charge.seig_code}
                onClick={() => openSeigniorage({ seigCode: charge.seig_code })}
              >
                <span>{charge.seig_code}</span>
                <span>{charge.mineral_name}</span>
                <span>{seigniorageRateLabel(charge)}</span>
                <span>{charge.schedule ?? '-'}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function RateBlock({
  label,
  value,
  suffix
}: {
  label: string
  value: number | null
  suffix: string
}): JSX.Element {
  return (
    <div className="seig-rate-block">
      <span>{label}</span>
      <strong>{value === null ? '-' : `Rs. ${money.format(value)} ${suffix}`}</strong>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="seig-rate-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function latestEffectiveDate(charges: SeigniorageCharge[]): string {
  const dates = charges
    .map((charge) => charge.effective_from)
    .filter((value): value is string => Boolean(value))
    .sort()
  return dates[dates.length - 1] ?? '-'
}

function commonGoReference(charges: SeigniorageCharge[]): string {
  const refs = charges
    .map((charge) => charge.go_reference)
    .filter((value): value is string => Boolean(value))
  return refs[0] ?? '-'
}
