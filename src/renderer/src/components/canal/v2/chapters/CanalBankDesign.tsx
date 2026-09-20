import { Plus, Trash2 } from 'lucide-react'
import type { CanalBankMaterialAllocation, CanalBankMaterialSource, CanalBankMaterialZone, CanalData, CanalDesign, CanalSection } from '../../../../types/project'
import {
  CANAL_BANK_ITEM_OPTIONS,
  canalBankItemForAllocation,
  canalEffectiveBankAllocations,
  canalBankRepairItems,
  canalBankVolumeTotals,
  canalEarthworkTotals,
  canalSuitableBankExcavation,
  recommendedCanalCrestWidth
} from '../../../../lib/canal'

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }): JSX.Element {
  return (
    <label className="canal-bank-field">
      <span>{label}</span>
      <input type="number" min={0} step="any" value={value || ''} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  )
}

const SOURCE_LABELS: Record<CanalBankMaterialSource, string> = {
  'canal-excavation': 'Suitable canal-excavation material',
  'dump-area': 'Approved dump area',
  'borrow-area': 'Approved borrow area'
}

const REPAIR_ITEM_LABELS: Record<string, string> = {
  'IRR-PMW-3-17': 'Homogeneous formation, placed without compaction',
  'IRR-PMW-3-18': 'Compaction of homogeneous formation to 95%',
  'IRR-PMW-3-8': 'Impervious hearting for damaged portion, 98% compaction included',
  'IRR-PMW-3-9': 'Casing for damaged portion, 98% compaction included'
}

const ZONE_LABELS: Record<CanalBankMaterialZone, string> = {
  homogeneous: 'Homogeneous bank fill',
  hearting: 'Impervious hearting',
  casing: 'Casing / homogeneous bank soil'
}

function availableSources(zone: CanalBankMaterialZone): CanalBankMaterialSource[] {
  return [...new Set(CANAL_BANK_ITEM_OPTIONS.filter((option) => option.zone === zone).map((option) => option.source))]
}

function compatibleAllocation(allocation: CanalBankMaterialAllocation): CanalBankMaterialAllocation {
  if (canalBankItemForAllocation(allocation)) return allocation
  const fallback = CANAL_BANK_ITEM_OPTIONS.find((option) => option.zone === allocation.zone && option.source === allocation.source)
    ?? CANAL_BANK_ITEM_OPTIONS.find((option) => option.zone === allocation.zone)
  return fallback ? { ...allocation, source: fallback.source, compaction: fallback.compaction, watering: fallback.watering } : allocation
}

export default function CanalBankDesign({ data, sections, onCommit }: {
  data: CanalData
  sections: CanalSection[]
  onCommit: (patch: Partial<CanalDesign>) => void
}): JSX.Element {
  const { design } = data
  const zoned = design.bankSectionType === 'zoned'
  const recommended = recommendedCanalCrestWidth(design.discharge)
  const bankVolumes = canalBankVolumeTotals(data)
  const earthwork = canalEarthworkTotals(data)
  const suitableExcavation = canalSuitableBankExcavation(data)
  const activeZones: CanalBankMaterialZone[] = zoned ? ['hearting', 'casing'] : ['homogeneous']
  const allocations = design.bankMaterialAllocations ?? []
  const zoneVolume = (zone: CanalBankMaterialZone): number => bankVolumes[zone]
  const effectiveRows = activeZones.flatMap((zone) => canalEffectiveBankAllocations(data, zone))
  const excavationAssignedTotal = effectiveRows.filter((row) => row.source === 'canal-excavation')
    .reduce((sum, row) => sum + zoneVolume(row.zone) * row.percentage / 100, 0)
  const patchAllocation = (id: string, patch: Partial<CanalBankMaterialAllocation>): void => onCommit({
    bankMaterialAllocations: allocations.map((row) => row.id === id ? compatibleAllocation({ ...row, ...patch }) : row)
  })
  const addAllocation = (zone: CanalBankMaterialZone): void => {
    const source = availableSources(zone)[0] ?? 'borrow-area'
    onCommit({ bankMaterialAllocations: [...allocations, compatibleAllocation({ id: `bank-source-${Date.now()}`, zone, source, percentage: 0, compaction: 95, watering: true })] })
  }
  const removeAllocation = (id: string): void => onCommit({ bankMaterialAllocations: allocations.filter((row) => row.id !== id) })
  const reaches = design.zonedReaches ?? []
  const addReach = (): void => {
    const from = sections[0]?.chainage ?? 0
    const to = sections[sections.length - 1]?.chainage ?? from
    onCommit({ zonedReaches: [...reaches, { id: `zoned-${Date.now()}`, fromChainage: from, toChainage: to }] })
  }
  const patchReach = (id: string, patch: Partial<{ fromChainage: number; toChainage: number }>): void =>
    onCommit({ zonedReaches: reaches.map((reach) => reach.id === id ? { ...reach, ...patch } : reach) })
  return (
    <section className="canal-chapter canal-bank-chapter">
      <header>
        <span className="canal-v2-section-kicker">Chapter 2</span>
        <h2>Bank Design</h2>
        <p className="settings-note">Define the bank material arrangement, geometry and billable operations.</p>
      </header>

      <div className="canal-bank-choice" role="radiogroup" aria-label="Bank section type">
        <label className={!zoned ? 'is-selected' : ''}>
          <input type="radio" checked={!zoned} onChange={() => onCommit({ bankSectionType: 'homogeneous', heartingTrenchEnabled: false })} />
          <span><strong>Homogeneous</strong><small>One selected soil throughout the bank.</small></span>
        </label>
        <label className={zoned ? 'is-selected' : ''}>
          <input type="radio" checked={zoned} onChange={() => onCommit({ bankSectionType: 'zoned' })} />
          <span><strong>Impervious Zoned</strong><small>Impervious hearting with outer bank material.</small></span>
        </label>
      </div>

      {zoned && (
        <section className="canal-bank-design canal-zoned-reaches">
          <div className="canal-zoned-reaches-head">
            <div className="canal-cross-panel-title">
              Impervious Zoned Reaches
              <small>Only the selected section ranges use hearting and casing. All other sections remain homogeneous.</small>
            </div>
            <button type="button" className="btn primary" disabled={sections.length === 0} onClick={addReach}>+ Add zoned reach</button>
          </div>
          {reaches.length === 0 ? (
            <div className="canal-zoned-empty">No zoned reach added. The full canal is still homogeneous.</div>
          ) : (
            <div className="canal-zoned-reach-list">
              {reaches.map((reach, index) => (
                <div className="canal-zoned-reach" key={reach.id}>
                  <strong>Reach {index + 1}</strong>
                  <label><span>From section</span><select value={reach.fromChainage} onChange={(event) => {
                    const fromChainage = Number(event.target.value)
                    patchReach(reach.id, { fromChainage, ...(fromChainage > reach.toChainage ? { toChainage: fromChainage } : {}) })
                  }}>{sections.map((section, sectionIndex) => <option key={section.id} value={section.chainage}>{sectionIndex + 1} · Ch {section.chainage} m</option>)}</select></label>
                  <label><span>To section</span><select value={reach.toChainage} onChange={(event) => {
                    const toChainage = Number(event.target.value)
                    patchReach(reach.id, { toChainage, ...(toChainage < reach.fromChainage ? { fromChainage: toChainage } : {}) })
                  }}>{sections.map((section, sectionIndex) => <option key={section.id} value={section.chainage}>{sectionIndex + 1} · Ch {section.chainage} m</option>)}</select></label>
                  <button type="button" className="btn ghost" onClick={() => onCommit({ zonedReaches: reaches.filter((item) => item.id !== reach.id) })}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="canal-bank-design">
        <div className="canal-cross-panel-title">Left and right banks<small>Crest and outer-slope geometry.</small></div>
        <div className="canal-bank-design-columns">
          <div className="canal-bank-design-side"><h3>Left bank</h3>
            <NumberField label="Crest width (m)" value={design.leftBankCrestWidth} onChange={(leftBankCrestWidth) => onCommit({ leftBankCrestWidth })} />
            <NumberField label="Outer slope (H : 1V)" value={design.leftBankOuterSlope} onChange={(leftBankOuterSlope) => onCommit({ leftBankOuterSlope })} />
          </div>
          <div className="canal-bank-design-side"><h3>Right bank</h3>
            <NumberField label="Crest width (m)" value={design.rightBankCrestWidth} onChange={(rightBankCrestWidth) => onCommit({ rightBankCrestWidth })} />
            <NumberField label="Outer slope (H : 1V)" value={design.rightBankOuterSlope} onChange={(rightBankOuterSlope) => onCommit({ rightBankOuterSlope })} />
          </div>
        </div>
        <div className="canal-bank-recommendation">IS 10430:2000 recommended minimum crest width for Q {design.discharge} m³/s: <strong>{recommended} m</strong>. User overrides are permitted.</div>
      </section>

      {zoned && (
        <section className="canal-bank-design">
          <div className="canal-cross-panel-title">Impervious hearting<small>The top level is referenced to FSL; applicability and height are checked separately at every section.</small></div>
          <div className="canal-bank-recommendation">
            <strong>Automatic rule:</strong> Hearting Top RL = FSL + entered adjustment, limited to Bank Top RL (FSL + Freeboard). No hearting is provided where FSL is below the prepared ground or where the resulting height above prepared ground is less than the entered minimum—even inside a selected zoned reach.
          </div>
          <div className="canal-design-grid">
            <label className="canal-bank-field">
              <span>Hearting top adjustment from FSL (m)</span>
              <input
                type="number"
                step="any"
                max={Math.max(0, design.freeBoard)}
                value={design.heartingLevelOffsetFromFsl}
                onChange={(event) => onCommit({
                  heartingLevelOffsetFromFsl: Math.min(Number(event.target.value) || 0, Math.max(0, design.freeBoard))
                })}
              />
              <small>Examples: 1 = FSL + 1.00 m; −0.5 = FSL − 0.50 m. Maximum allowed now: +{Math.max(0, design.freeBoard).toFixed(2)} m.</small>
            </label>
            <NumberField label="Minimum hearting height (m)" value={design.minimumHeartingHeight} onChange={(minimumHeartingHeight) => onCommit({ minimumHeartingHeight })} />
            <NumberField label="Hearting top width (m)" value={design.heartingTopWidth} onChange={(heartingTopWidth) => onCommit({ heartingTopWidth })} />
            <NumberField label="Left hearting slope (H : 1V)" value={design.heartingLeftSlope} onChange={(heartingLeftSlope) => onCommit({ heartingLeftSlope })} />
            <NumberField label="Right hearting slope (H : 1V)" value={design.heartingRightSlope} onChange={(heartingRightSlope) => onCommit({ heartingRightSlope })} />
          </div>
        </section>
      )}

      <section className="canal-bank-design">
        <div className="canal-cross-panel-title">Bank construction sources<small>{data.mode === 'repair' ? 'Repair banks bill the PMW repair items below — source shares do not apply.' : 'Add one or more sources. The estimate item is selected automatically from source, zone, compaction and watering.'}</small></div>
        <div className="canal-bank-source-summary">
          <span>Bank fill from prepared plane <strong>{bankVolumes.totalFill.toLocaleString('en-IN')} cu.m</strong></span>
          <span>Suitable canal excavation <strong>{suitableExcavation.toLocaleString('en-IN')} cu.m</strong></span>
          <span>Stripping excluded from reuse <strong>{earthwork.stripping.toLocaleString('en-IN')} cu.m</strong></span>
        </div>
        {data.mode === 'repair' && canalBankRepairItems(data).filter((item) => item.quantity > 0).map((item) => (
          <div className="canal-bank-source-row" key={`${item.zone}-${item.code}`}>
            <div className="canal-bank-source-result"><span>{REPAIR_ITEM_LABELS[item.code] ?? item.code} · {ZONE_LABELS[item.zone]}</span><strong>{item.code}</strong></div>
            <small>{item.quantity.toLocaleString('en-IN')} cu.m billed</small>
          </div>
        ))}
        {data.mode !== 'repair' && activeZones.map((zone) => {
          const rows = canalEffectiveBankAllocations(data, zone)
          const assignedPct = rows.reduce((sum, row) => sum + row.percentage, 0)
          return <div className="canal-bank-source-zone" key={zone}>
            <div className="canal-bank-source-zone-head">
              <div><strong>{ZONE_LABELS[zone]}</strong><small>{zoneVolume(zone).toLocaleString('en-IN')} cu.m required · {assignedPct}% assigned</small></div>
              <button type="button" className="btn ghost" onClick={() => addAllocation(zone)}><Plus size={14} /> Add source</button>
            </div>
            {rows.length === 0 && <div className="canal-zoned-empty">No source assigned.</div>}
            {rows.map((row) => {
              const item = canalBankItemForAllocation(row)
              const sourceOptions = availableSources(zone)
              return <div className="canal-bank-source-row" key={row.id}>
                <label><span>Material source</span><select value={row.source} onChange={(event) => patchAllocation(row.id, { source: event.target.value as CanalBankMaterialSource })}>{sourceOptions.map((source) => <option value={source} key={source}>{SOURCE_LABELS[source]}</option>)}</select></label>
                <label><span>Share of {ZONE_LABELS[zone].toLowerCase()}</span><div className="canal-bank-source-percent"><input type="number" min={0} max={100} step="any" value={Number(row.percentage.toFixed(3)) || ''} readOnly={zone === 'homogeneous' && row.source !== 'dump-area'} onChange={(event) => patchAllocation(row.id, { percentage: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /><b>%</b></div><small>{(zoneVolume(zone) * row.percentage / 100).toLocaleString('en-IN')} cu.m{zone === 'homogeneous' && row.source !== 'dump-area' ? ' · automatic' : ''}</small></label>
                <label><span>Compaction</span><select value={row.compaction} onChange={(event) => patchAllocation(row.id, { compaction: Number(event.target.value) === 98 ? 98 : 95 })}><option value={95}>Not less than 95%</option><option value={98}>Not less than 98%</option></select></label>
                <label className="canal-bank-source-water"><input type="checkbox" checked={row.watering} disabled={!CANAL_BANK_ITEM_OPTIONS.some((option) => option.zone === zone && option.source === row.source && option.compaction === row.compaction && option.watering === false)} onChange={(event) => patchAllocation(row.id, { watering: event.target.checked })} /><span>Watering included</span></label>
                <div className="canal-bank-source-result"><span>Resolved operation</span><strong>{item?.label ?? 'Choose a compatible combination'}</strong></div>
                <button type="button" className="btn ghost icon" aria-label="Remove material source" onClick={() => removeAllocation(row.id)}><Trash2 size={14} /></button>
              </div>
            })}
            {Math.abs(assignedPct - 100) > 0.001 && <div className="canal-road-warning">Source shares must total 100%. {assignedPct < 100 ? `${100 - assignedPct}% remains unassigned.` : `Allocation exceeds the zone by ${assignedPct - 100}%.`}</div>}
          </div>
        })}
        {data.mode !== 'repair' && excavationAssignedTotal > suitableExcavation + 0.001 && <div className="canal-road-warning">Assigned canal-excavation material totals {excavationAssignedTotal.toLocaleString('en-IN')} cu.m, exceeding the {suitableExcavation.toLocaleString('en-IN')} cu.m marked suitable in Earthwork.</div>}
        {data.mode !== 'repair' && <div className="canal-bank-recommendation">For a homogeneous bank, suitable canal excavation is consumed automatically and borrow-area soil fills the remaining percentage. In a zoned bank, casing is the same soil used for the homogeneous portions; wherever bank height is too small for hearting, the full measured fill is automatically included in casing.</div>}
      </section>
    </section>
  )
}
