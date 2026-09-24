import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { CanalData, CanalLiningItemKey, CanalLiningReach, TemplateMaterialRef } from '../../../../types/project'
import type { CanalLiningTotals } from '../../../../types/eestimateApi'
import type { MasterItem } from '../../../../lib/masterData'
import {
  CANAL_LINING_CODE,
  CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M,
  CANAL_LINING_DEFAULT_PANEL_M,
  CANAL_LINING_DEFAULT_PLUG_BED_SQM,
  CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM,
  CANAL_LINING_DEFAULT_STEPS_INTERVAL_M,
  CANAL_LINING_DEFAULT_THICKNESS_MM,
  CANAL_LINING_MASTIC_JOINT_CODE,
  CANAL_LINING_MODEL_WALL_CODE,
  CANAL_LINING_PLUG_CODE,
  CANAL_LINING_TARFELT_JOINT_CODE,
  canalCopingWidthForDischarge,
  canalLiningReachQuantities,
  canalLiningTotals,
  defaultCanalLiningReach,
  orderedCanalSections
} from '../../../../lib/canal'
import SsrCode from '../../../templates/SsrCode'
import UnifiedCodePicker from '../../../templates/UnifiedCodePicker'

const n3 = (value: number | undefined | null): string => (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

const ITEM_META: Array<{ key: CanalLiningItemKey; label: string; code: string; note: string }> = [
  { key: 'lining', label: 'Canal lining concrete', code: CANAL_LINING_CODE, note: 'In-situ M-15 lining in bed and slopes, measured in sq.m.' },
  { key: 'modelWall', label: 'Model / profile walls', code: CANAL_LINING_MODEL_WALL_CODE, note: 'Walls at the model-section interval, with soffit.' },
  { key: 'steps', label: 'Steps', code: CANAL_LINING_MODEL_WALL_CODE, note: 'Steps at the entered interval across the reach.' },
  { key: 'sleepers', label: 'Sleepers', code: CANAL_LINING_MODEL_WALL_CODE, note: 'Two sleeper courses along the reach.' },
  { key: 'porousPlugs', label: 'Porous plugs', code: CANAL_LINING_PLUG_CODE, note: 'Precast plugs in bed and slopes at the entered spacing.' },
  { key: 'masticJoints', label: 'Mastic joints', code: CANAL_LINING_MASTIC_JOINT_CODE, note: 'Longitudinal and transverse contraction joints.' },
  { key: 'tarfeltJoints', label: 'Tarfelt joints', code: CANAL_LINING_TARFELT_JOINT_CODE, note: 'Expansion joint boards at every model section.' }
]

function OptionalNumberField({ label, value, placeholder, onChange }: {
  label: string
  value: number | null
  placeholder: string
  onChange: (value: number | null) => void
}): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><input type="number" min={0} step="any" value={value ?? ''} placeholder={placeholder} onChange={(event) => {
    const raw = event.target.value
    onChange(raw === '' ? null : Math.max(0, Number(raw) || 0))
  }} /></label>
}

function SectionSelect({ label, value, sections, onChange }: {
  label: string
  value: number
  sections: CanalData['sections']
  onChange: (value: number) => void
}): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><select value={value} onChange={(event) => onChange(Number(event.target.value))}>
    {sections.map((section, index) => <option value={section.chainage} key={section.id}>{index + 1} · Ch {section.chainage} m</option>)}
  </select></label>
}

export default function CanalLining({ data, onCommit }: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const [picker, setPicker] = useState<{ reachId: string; key: CanalLiningItemKey } | null>(null)
  const sections = (orderedCanalSections(data))
  const reaches = data.liningReaches ?? []
  const totals = canalLiningTotals(data)
  const updateReaches = (liningReaches: CanalLiningReach[]): void => onCommit((current) => ({ ...current, liningReaches }))
  const patchReach = (id: string, patch: Partial<CanalLiningReach>): void =>
    updateReaches(reaches.map((reach) => reach.id === id ? { ...reach, ...patch } : reach))
  const materialFromItem = (item: MasterItem): TemplateMaterialRef => ({
    code: item.code,
    description: item.description,
    unit: item.unit,
    categoryKey: item.category,
    side: item.side,
    dataVariant: item.dataVariant,
    sorCatalogue: item.sorCatalogue
  })
  const addReach = (): void => {
    const from = sections[0]?.chainage ?? 0
    const to = sections[sections.length - 1]?.chainage ?? from
    updateReaches([...reaches, defaultCanalLiningReach(from, to)])
  }
  const autoCoping = canalCopingWidthForDischarge(data.design.discharge)
  const overlapping = reaches.some((reach, index) => reaches.some((other, otherIndex) =>
    index < otherIndex &&
    reach.fromChainage < other.toChainage &&
    other.fromChainage < reach.toChainage
  ))

  return <section className="canal-chapter canal-lining-chapter">
    <header className="canal-v2-section-header">
      <div>
        <span className="canal-v2-section-kicker">Chapter {data.mode === 'new' ? 6 : 5}</span>
        <h2>Lining</h2>
        <p>Add a reach, keep the Chapter 1 geometry, and leave a blank wherever the automatic value is acceptable.</p>
      </div>
      <button type="button" className="btn primary" disabled={!sections.length} onClick={addReach}>+ Add lining reach</button>
    </header>

    <div className="canal-bank-recommendation">
      <strong>Kept automatically:</strong> bed width, FSD, freeboard, side slope and bed fall come from Design Levels; lining freeboard, coping width, thickness, panel and plug spacing fall back to the defaults shown as placeholders. Blank fields stay blank.
    </div>

    {overlapping && <div className="canal-road-warning">Two lining reaches overlap. Overlapping chainage is measured twice — trim one of the reaches.</div>}

    {!reaches.length ? <div className="canal-zoned-empty">No lining reach added. The canal is currently unlined.</div> : <div className="canal-road-reach-list">
      {reaches.map((reach, index) => {
        const quantities = canalLiningReachQuantities(data, reach)
        const rows: Array<[string, string]> = []
        if (reach.bill.lining) {
          rows.push(['Lining in bed', `${n3(quantities.liningBedArea)} sq.m`])
          rows.push(['Lining in slopes', `${n3(quantities.liningSlopeArea)} sq.m`])
        }
        if (reach.bill.modelWall) {
          rows.push(['Model / profile walls', `${n3(quantities.modelWallVolume)} cu.m · ${quantities.modelWallCount} nos`])
          rows.push(['Soffit', `${n3(quantities.soffitVolume)} cu.m`])
        }
        if (reach.bill.steps) rows.push(['Steps', `${n3(quantities.stepsVolume)} cu.m · ${quantities.stepsCount} nos`])
        if (reach.bill.sleepers) rows.push(['Sleepers', `${n3(quantities.sleepersVolume)} cu.m`])
        if (reach.bill.porousPlugs) {
          rows.push(['Porous plugs — slopes', `${quantities.plugsSlope} nos`])
          rows.push(['Porous plugs — bed', `${quantities.plugsBed} nos`])
        }
        if (reach.bill.masticJoints) {
          rows.push(['Mastic joints — longitudinal', `${n3(quantities.masticLongitudinal)} rmt`])
          rows.push(['Mastic joints — transverse', `${n3(quantities.masticTransverse)} rmt`])
        }
        if (reach.bill.tarfeltJoints) rows.push(['Tarfelt expansion joints', `${n3(quantities.tarfeltLength)} rmt · ${quantities.tarfeltCount} nos`])
        return <section className="canal-bank-design canal-road-reach" key={reach.id}>
          <div className="canal-road-reach-head">
            <div className="canal-cross-panel-title">Lining reach {index + 1}<small>Ch {quantities.fromChainage} m to Ch {quantities.toChainage} m · {quantities.sectionCount} sections</small></div>
            <button type="button" className="btn ghost" onClick={() => updateReaches(reaches.filter((item) => item.id !== reach.id))}><Trash2 size={14} /> Remove</button>
          </div>

          <label className="canal-earthwork-check"><input type="checkbox" checked={reach.provide} onChange={(event) => patchReach(reach.id, { provide: event.target.checked })} /> Provide lining in this reach</label>

          <div className="canal-road-grid">
            <SectionSelect label="From section" value={reach.fromChainage} sections={sections} onChange={(fromChainage) => patchReach(reach.id, { fromChainage, ...(fromChainage > reach.toChainage ? { toChainage: fromChainage } : {}) })} />
            <SectionSelect label="To section" value={reach.toChainage} sections={sections} onChange={(toChainage) => patchReach(reach.id, { toChainage, ...(toChainage < reach.fromChainage ? { fromChainage: toChainage } : {}) })} />
          </div>

          <div className="canal-earthwork-summary">
            <span>Bed width <strong>{n3(quantities.bedWidth)} m</strong></span>
            <span>FSD <strong>{n3(quantities.fullSupplyDepth)} m</strong></span>
            <span>Freeboard <strong>{n3(quantities.freeBoard)} m</strong></span>
            <span>Side slope <strong>{n3(quantities.sideSlope)} H : 1V</strong></span>
            <span>Discharge <strong>{n3(quantities.discharge)} cumecs</strong></span>
          </div>

          <div className="canal-cross-panel-title">Reach inputs<small>Blank keeps the automatic value shown in the placeholder. Coping auto value for this discharge: {n3(autoCoping)} m.</small></div>
          <div className="canal-road-grid">
            <OptionalNumberField label="Lining thickness (mm)" value={reach.thicknessMm} placeholder={`${CANAL_LINING_DEFAULT_THICKNESS_MM} (auto)`} onChange={(thicknessMm) => patchReach(reach.id, { thicknessMm })} />
            <small className="canal-dimension-note">SSR IRR-CAW-7-6 rate is for 75 mm lining; the billed area does not vary with this field.</small>
            <OptionalNumberField label="Lining freeboard (m)" value={reach.liningFb} placeholder={`${n3(quantities.freeBoard)} (design FB)`} onChange={(liningFb) => patchReach(reach.id, { liningFb })} />
            <OptionalNumberField label="Coping / lug width (m)" value={reach.copingWidthM} placeholder={`${n3(autoCoping)} (auto)`} onChange={(copingWidthM) => patchReach(reach.id, { copingWidthM })} />
            <OptionalNumberField label="Panel length (m)" value={reach.panelLengthM} placeholder={`${CANAL_LINING_DEFAULT_PANEL_M} (auto)`} onChange={(panelLengthM) => patchReach(reach.id, { panelLengthM })} />
            <OptionalNumberField label="Model wall interval (m)" value={reach.modelWallIntervalM} placeholder={`${CANAL_LINING_DEFAULT_MODEL_WALL_INTERVAL_M} (auto)`} onChange={(modelWallIntervalM) => patchReach(reach.id, { modelWallIntervalM })} />
            <OptionalNumberField label="Steps interval (m)" value={reach.stepsIntervalM} placeholder={`${CANAL_LINING_DEFAULT_STEPS_INTERVAL_M} (auto)`} onChange={(stepsIntervalM) => patchReach(reach.id, { stepsIntervalM })} />
            <OptionalNumberField label="Plug spacing, slopes (sq.m)" value={reach.plugSlopeSpacingSqm} placeholder={`${CANAL_LINING_DEFAULT_PLUG_SLOPE_SQM} (auto)`} onChange={(plugSlopeSpacingSqm) => patchReach(reach.id, { plugSlopeSpacingSqm })} />
            <OptionalNumberField label="Plug spacing, bed (sq.m)" value={reach.plugBedSpacingSqm} placeholder={`${CANAL_LINING_DEFAULT_PLUG_BED_SQM} (auto)`} onChange={(plugBedSpacingSqm) => patchReach(reach.id, { plugBedSpacingSqm })} />
          </div>

          <div className="canal-cross-panel-title">Operations to be billed<small>Unchecked operations are kept out of the measurement below.</small></div>
          <div className="canal-bank-operations">
            {ITEM_META.map((meta) => {
              const override = reach.itemOverrides[meta.key]
              return <div className="canal-lining-bill-row" key={meta.key}>
                <label className={reach.bill[meta.key] ? 'is-selected' : ''}>
                  <input type="checkbox" checked={reach.bill[meta.key]} onChange={(event) => patchReach(reach.id, { bill: { ...reach.bill, [meta.key]: event.target.checked } })} />
                  <span><strong>{meta.label} · <SsrCode code={override?.code ?? meta.code} description={override?.description} /></strong><small>{meta.note}</small></span>
                </label>
                <button type="button" className="btn ghost" onClick={() => setPicker({ reachId: reach.id, key: meta.key })}><Pencil size={14} /> Change code</button>
              </div>
            })}
          </div>

          <div className="canal-road-items"><strong>Automatically measured lining</strong>
            {!reach.provide ? <div><span>Reach skipped</span><b>Nothing billed from this reach</b></div> : rows.length ? rows.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>) : <div><span>No operation selected</span><b>Choose at least one operation above</b></div>}
          </div>
          <div className="canal-road-rate-status"><strong>Rate source:</strong> each billed operation resolves its rate from the selected SSR code; blank code fields keep the defaults. Quantities update automatically whenever Chapter 1 or the reach limits change.</div>

          {picker?.reachId === reach.id && <UnifiedCodePicker
            title={`Change ${ITEM_META.find((meta) => meta.key === picker.key)?.label ?? 'lining'} code`}
            hint="Search the same SSR and SOR sources available in Add Item."
            onClose={() => setPicker(null)}
            onPick={(item) => {
              patchReach(reach.id, { itemOverrides: { ...reach.itemOverrides, [picker.key]: materialFromItem(item) } })
              setPicker(null)
            }}
          />}
        </section>
      })}
    </div>}

    {reaches.some((reach) => reach.provide) && <div className="canal-road-items"><strong>Lining totals · {totals.reaches} reach{totals.reaches === 1 ? '' : 'es'} · {n3(totals.length)} m</strong>
      <div><span>Lining in bed</span><b>{n3(totals.liningBedArea)} sq.m</b></div>
      <div><span>Lining in slopes</span><b>{n3(totals.liningSlopeArea)} sq.m</b></div>
      <div><span>Model walls / soffit</span><b>{n3(totals.modelWallVolume)} / {n3(totals.soffitVolume)} cu.m</b></div>
      <div><span>Steps / sleepers</span><b>{n3(totals.stepsVolume)} / {n3(totals.sleepersVolume)} cu.m</b></div>
      <div><span>Porous plugs, slopes / bed</span><b>{totals.plugsSlope} / {totals.plugsBed} nos</b></div>
      <div><span>Mastic joints, long. / transverse</span><b>{n3(totals.masticLongitudinal)} / {n3(totals.masticTransverse)} rmt</b></div>
      <div><span>Tarfelt expansion joints</span><b>{n3(totals.tarfeltLength)} rmt</b></div>
    </div>}

    <button type="button" className="btn ghost" disabled={!sections.length} onClick={addReach}><Plus size={14} /> Add lining reach</button>
  </section>
}
