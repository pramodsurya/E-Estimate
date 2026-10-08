import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CanalBankMaterialAllocation, CanalBankMaterialSource, CanalBankMaterialZone } from '../../../../types/project'
import { CANAL_BANK_ITEM_OPTIONS, canalBankItemForAllocation, type CanalBankVolumeTotals } from '../../../../lib/canal'
import { newId } from '../../../../lib/tree'
import './canalTierReaches.css'

const SOURCE_LABELS: Record<CanalBankMaterialSource, string> = {
  'canal-excavation': 'Suitable canal-excavation material',
  'dump-area': 'Approved dump area',
  'borrow-area': 'Approved borrow area'
}
const ZONE_LABELS: Record<CanalBankMaterialZone, string> = {
  homogeneous: 'Homogeneous bank fill', hearting: 'Impervious hearting', casing: 'Casing / homogeneous bank soil'
}
function availableSources(zone: CanalBankMaterialZone): CanalBankMaterialSource[] {
  return [...new Set(CANAL_BANK_ITEM_OPTIONS.filter(option => option.zone === zone).map(option => option.source))]
}
function compatibleAllocation(row: CanalBankMaterialAllocation): CanalBankMaterialAllocation {
  if (canalBankItemForAllocation(row)) return row
  const fallback = CANAL_BANK_ITEM_OPTIONS.find(option => option.zone === row.zone && option.source === row.source)
    ?? CANAL_BANK_ITEM_OPTIONS.find(option => option.zone === row.zone)
  return fallback ? { ...row, source: fallback.source, compaction: fallback.compaction, watering: fallback.watering } : row
}

/** Draft edits are isolated from the chapter and its geometry/quantity calculations. */
export default function CanalBankMaterialEditor({ allocations, zones, volumes, onSave }: {
  allocations: CanalBankMaterialAllocation[]
  zones: CanalBankMaterialZone[]; volumes: CanalBankVolumeTotals
  onSave: (rows: CanalBankMaterialAllocation[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState<CanalBankMaterialAllocation[] | null>(null)
  const [error, setError] = useState('')
  const editing = draft !== null
  const patch = (id: string, changes: Partial<CanalBankMaterialAllocation>): void => {
    setDraft(rows => rows?.map(row => row.id === id ? compatibleAllocation({ ...row, ...changes }) : row) ?? null)
  }
  const add = (zone: CanalBankMaterialZone): void => {
    const row = compatibleAllocation({ id: `bank-source-${newId()}`, zone, source: availableSources(zone)[0] ?? 'borrow-area', percentage: 0, compaction: 95, watering: true })
    setDraft(rows => rows ? [...rows, row] : null)
  }
  const save = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!draft) return
    if (draft.some(row => !Number.isFinite(row.percentage) || row.percentage < 0 || row.percentage > 100)) {
      setError('Enter a percentage from 0 to 100 for every material source.'); return
    }
    onSave(draft.map(row => ({ ...row })))
    setDraft(null); setError('')
  }
  const displayedRows = draft ?? allocations
  return <form className="canal-bank-material-editor" onSubmit={save}>
    <div className="canal-bank-material-toolbar">
      <span>{editing ? 'Changes apply when you save allocations.' : 'Edit material sources and shares, then save to recalculate.'}</span>
      <div className="canal-reach-actions">{editing ? <>
        <button key="save" type="submit" className="btn primary">Save allocations</button>
        <button key="cancel" type="button" className="btn ghost" onClick={() => { setDraft(null); setError('') }}>Cancel</button>
      </> : <button key="edit" type="button" className="btn ghost" onClick={() => { setDraft(allocations.map(row => ({ ...row }))); setError('') }}>Edit allocations</button>}</div>
    </div>
    {zones.map(zone => {
      const rows = displayedRows.filter(row => row.zone === zone)
      const assignedPct = rows.reduce((total, row) => total + (Number.isFinite(row.percentage) ? row.percentage : 0), 0)
      return <div className="canal-bank-source-zone" key={zone}>
        <div className="canal-bank-source-zone-head"><div><strong>{ZONE_LABELS[zone]}</strong><small>{volumes[zone].toLocaleString('en-IN')} cu.m required · {assignedPct}% assigned{editing ? ' in draft' : ''}</small></div>
          {editing && <button type="button" className="btn ghost" onClick={() => add(zone)}><Plus size={14} /> Add source</button>}
        </div>
        {!rows.length && <div className="canal-zoned-empty">No source assigned.</div>}
        {rows.map(row => {
          const item = canalBankItemForAllocation(row)
          const quantity = volumes[zone] * (Number.isFinite(row.percentage) ? row.percentage : 0) / 100
          return <div className="canal-bank-source-row" key={row.id}>
            <label><span>Material source</span>{editing ? <select aria-label={`${ZONE_LABELS[zone]} material source`} value={row.source} onChange={event => patch(row.id, { source: event.target.value as CanalBankMaterialSource })}>{availableSources(zone).map(source => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}</select> : <strong>{SOURCE_LABELS[row.source]}</strong>}</label>
            <label><span>Share of {ZONE_LABELS[zone].toLowerCase()}</span>
              <div className="canal-bank-source-percent">{editing ? <input aria-label={`Share of ${ZONE_LABELS[zone].toLowerCase()} %`} type="number" min="0" max="100" step="any" required value={Number.isFinite(row.percentage) ? row.percentage : ''} onChange={event => patch(row.id, { percentage: event.target.valueAsNumber })} /> : <strong>{Number.isFinite(row.percentage) ? Number(row.percentage.toFixed(3)) : '—'}</strong>}<b>%</b></div>
              <small>{quantity.toLocaleString('en-IN')} cu.m</small>
            </label>
            <label><span>Compaction</span>{editing ? <select aria-label={`${ZONE_LABELS[zone]} compaction`} value={row.compaction} onChange={event => patch(row.id, { compaction: Number(event.target.value) === 98 ? 98 : 95 })}><option value={95}>Not less than 95%</option><option value={98}>Not less than 98%</option></select> : <strong>Not less than {row.compaction}%</strong>}</label>
            <label className="canal-bank-source-water">{editing && <input type="checkbox" checked={row.watering} disabled={!CANAL_BANK_ITEM_OPTIONS.some(option => option.zone === zone && option.source === row.source && option.compaction === row.compaction && !option.watering)} onChange={event => patch(row.id, { watering: event.target.checked })} />}<span>{editing || row.watering ? 'Watering included' : 'Watering excluded'}</span></label>
            <div className="canal-bank-source-result"><span>Resolved operation</span><strong>{item?.label ?? 'Choose a compatible combination'}</strong>{item && <span className="canal-bank-source-code">{item.code}</span>}</div>
            {editing && <button type="button" className="btn ghost icon" aria-label="Remove material source" onClick={() => setDraft(current => current?.filter(source => source.id !== row.id) ?? null)}><Trash2 size={14} /></button>}
          </div>
        })}
        {Math.abs(assignedPct - 100) > 0.001 && <div className="canal-road-warning">Source shares must total 100%. {assignedPct < 100 ? `${100 - assignedPct}% remains unassigned.` : `Allocation exceeds the zone by ${assignedPct - 100}%.`}</div>}
      </div>
    })}
    {error && <p role="alert">{error}</p>}
  </form>
}
