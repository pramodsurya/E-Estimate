import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CanalData, TemplateMaterialRef } from '../../../../types/project'
import { CANAL_JUNGLE_CLEARANCE_CODE, canalJungleClearanceTotal, canalLaArea, canalLaWidthRows } from '../../../../lib/canal'
import { newId } from '../../../../lib/tree'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'

const n3 = (value: number): string => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

const materialFromItem = (item: { code: string; description: string; unit?: string | null; category: string; side?: TemplateMaterialRef['side']; dataVariant?: TemplateMaterialRef['dataVariant'] }): TemplateMaterialRef => ({
  code: item.code, description: item.description, unit: item.dataVariant?.unit ?? item.unit,
  categoryKey: item.category, side: item.side, dataVariant: item.dataVariant
})

export default function CanalJungleLa({ data, onCommit }: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const [picker, setPicker] = useState(false)
  const jungleTotal = useMemo(() => canalJungleClearanceTotal(data), [data])
  const laRows = useMemo(() => canalLaWidthRows(data), [data])
  const laArea = useMemo(() => canalLaArea(data), [data])
  return <section className="canal-v2-section">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Jungle Cutting &amp; LA</span><h2>Jungle Cutting &amp; Land Acquisition</h2><p>Measure site clearance and the land corridor independently from earthwork.</p></div></header>

    <section className="canal-earthwork-card">
      <div className="canal-earthwork-card-head"><div><strong>Jungle Cutting / Clearance</strong><small>{data.mode === 'new' ? 'Automatic width follows the designed canal footprint.' : 'Automatic width follows the surveyed surface between toes.'}</small></div><div><strong>{n3(jungleTotal)} sq.m</strong></div></div>
      <div className="canal-bank-choice" role="radiogroup" aria-label="Jungle clearance measurement mode">
        <label className={data.jungleClearanceMode === 'automatic' ? 'is-selected' : ''}><input type="radio" checked={data.jungleClearanceMode === 'automatic'} onChange={() => onCommit((current) => ({ ...current, jungleClearanceMode: 'automatic' }))} /><span><strong>Automatic</strong><small>Mean cleared width × chainage length.</small></span></label>
        <label className={data.jungleClearanceMode === 'manual' ? 'is-selected' : ''}><input type="radio" checked={data.jungleClearanceMode === 'manual'} onChange={() => onCommit((current) => ({ ...current, jungleClearanceMode: 'manual', jungleClearanceRows: current.jungleClearanceRows.length ? current.jungleClearanceRows : [{ id: newId(), length: null, breadth: null }] }))} /><span><strong>Manual patches</strong><small>Enter length × breadth for each cleared patch.</small></span></label>
      </div>
      <div className="canal-earthwork-code-row">
        <button type="button" className="btn ghost" onClick={() => setPicker(true)}>{data.jungleClearanceMaterial?.code ? <SsrCode code={data.jungleClearanceMaterial.code} description={data.jungleClearanceMaterial.description} /> : 'Attach jungle-clearance item'}</button>
        <button type="button" className="btn ghost" onClick={() => onCommit((current) => ({ ...current, jungleClearanceMaterial: current.jungleClearanceMaterial ? null : { code: CANAL_JUNGLE_CLEARANCE_CODE } }))}>{data.jungleClearanceMaterial ? 'Remove item' : 'Add default item'}</button>
        {picker && <MaterialPicker initialCategory="IRR-PMW" initialSearch="jungle clearance" onClose={() => setPicker(false)} onPick={(item) => { onCommit((current) => ({ ...current, jungleClearanceMaterial: materialFromItem(item) })); setPicker(false) }} />}
      </div>
      {data.jungleClearanceMode === 'manual' && <div className="canal-clearance-table">
        <div className="canal-clearance-row is-head"><span>Patch</span><span>Length (m)</span><span>Breadth (m)</span><span>Area (sq.m)</span><span /></div>
        {data.jungleClearanceRows.map((row, index) => <div className="canal-clearance-row" key={row.id}><strong>{index + 1}</strong><input type="number" min={0} step="any" value={row.length ?? ''} onChange={(event) => onCommit((current) => ({ ...current, jungleClearanceRows: current.jungleClearanceRows.map((candidate) => candidate.id === row.id ? { ...candidate, length: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) } : candidate) }))} /><input type="number" min={0} step="any" value={row.breadth ?? ''} onChange={(event) => onCommit((current) => ({ ...current, jungleClearanceRows: current.jungleClearanceRows.map((candidate) => candidate.id === row.id ? { ...candidate, breadth: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) } : candidate) }))} /><strong>{n3((row.length ?? 0) * (row.breadth ?? 0))}</strong><button type="button" className="canal-earthwork-remove" aria-label={`Delete jungle-clearance patch ${index + 1}`} onClick={() => onCommit((current) => ({ ...current, jungleClearanceRows: current.jungleClearanceRows.filter((candidate) => candidate.id !== row.id) }))}><Trash2 size={14} /></button></div>)}
        <button type="button" className="btn ghost" onClick={() => onCommit((current) => ({ ...current, jungleClearanceRows: [...current.jungleClearanceRows, { id: newId(), length: null, breadth: null }] }))}><Plus size={13} /> Add patch</button>
      </div>}
    </section>

    {data.mode === 'new' && <section className="canal-earthwork-card">
      <div className="canal-earthwork-card-head"><div><strong>Land Acquisition Width</strong><small>Designed outer footprint plus the entered left and right acquisition margins.</small></div><div><strong>{n3(laArea)} sq.m</strong><span>{n3(laArea / 10_000)} ha</span></div></div>
      <div className="canal-road-grid"><label className="canal-bank-field"><span>Left-side LA margin (m)</span><input type="number" min={0} step="any" value={data.laLeftMargin} onChange={(event) => onCommit((current) => ({ ...current, laLeftMargin: Math.max(0, Number(event.target.value) || 0) }))} /></label><label className="canal-bank-field"><span>Right-side LA margin (m)</span><input type="number" min={0} step="any" value={data.laRightMargin} onChange={(event) => onCommit((current) => ({ ...current, laRightMargin: Math.max(0, Number(event.target.value) || 0) }))} /></label></div>
      <div className="canal-la-table"><div className="canal-la-row is-head"><span>Section</span><span>Chainage</span><span>Design footprint</span><span>LA width</span></div>{laRows.map((row, index) => <div className="canal-la-row" key={row.sectionId}><strong>{index + 1}</strong><span>Ch {n3(row.chainage)} m</span><span>{n3(row.designWidth)} m</span><strong>{n3(row.acquisitionWidth)} m</strong></div>)}</div>
    </section>}
  </section>
}
