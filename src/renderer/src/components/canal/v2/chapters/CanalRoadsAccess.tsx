import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { CanalData, CanalServiceRoadReach } from '../../../../types/project'
import type { MasterItem } from '../../../../lib/masterData'
import { canalSectionDepth, canalServiceRoadQuantities, orderedCanalSections, repopulateCanalQuickSections } from '../../../../lib/canal'
import SsrCode from '../../../templates/SsrCode'
import UnifiedCodePicker from '../../../templates/UnifiedCodePicker'

function NumberField({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><input type="number" min={min} step="any" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>
}

export default function CanalRoadsAccess({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [picker, setPicker] = useState<{ reachId: string; kind: 'hard-metal' | 'blindage' } | null>(null)
  const sections = orderedCanalSections(data)
  const reaches = data.design.serviceRoadReaches ?? []
  const tblHeight = canalSectionDepth(data.design)
  const updateReaches = (serviceRoadReaches: CanalServiceRoadReach[]): void => onCommit((current) => repopulateCanalQuickSections({ ...current, design: { ...current.design, serviceRoadReaches } }))
  const patchReach = (id: string, patch: Partial<CanalServiceRoadReach>): void => updateReaches(reaches.map((reach) => reach.id === id ? { ...reach, ...patch } : reach))
  const materialFromItem = (item: MasterItem) => ({ code: item.code, description: item.description, unit: item.unit, categoryKey: item.category, side: item.side, dataVariant: item.dataVariant, sorCatalogue: item.sorCatalogue })
  const addReach = (): void => {
    const from = sections[0]?.chainage ?? 0
    const to = sections[sections.length - 1]?.chainage ?? from
    updateReaches([...reaches, { id: `road-${Date.now()}`, fromChainage: from, toChainage: to, side: 'left', heightMode: 'tbl', heightAboveBed: tblHeight, width: 4, shoulderWidth: 0.5, constructionType: 'earthen', hardMetalThickness: 0.05, hardMetalCode: 'RB_WORK_6411571526E0', blindageCode: 'RB Road Work 8(a) — select/enter catalogue item' }])
  }
  return <section className="canal-chapter canal-roads-chapter">
    <header className="canal-v2-section-header">
      <div><span className="canal-v2-section-kicker">Chapter {data.mode === 'new' ? 7 : 6}</span><h2>Roads &amp; Access</h2><p>Define service-road platforms by reach and bank.</p></div>
      <button type="button" className="btn primary" disabled={!sections.length} onClick={addReach}>+ Add service-road reach</button>
    </header>
    <div className="canal-bank-recommendation"><strong>Platform rule:</strong> Total platform width = service-road width + left shoulder + right shoulder. At Bank Top Level it shares the bank crest; at a manual height it shares the outer-bank berm. The crest or berm is widened only when this total platform is wider than the available width.</div>
    {!reaches.length ? <div className="canal-zoned-empty">No service-road reach added.</div> : <div className="canal-road-reach-list">
      {reaches.map((reach, index) => { const quantities = canalServiceRoadQuantities(data, reach); return <section className="canal-bank-design canal-road-reach" key={reach.id}>
        <div className="canal-road-reach-head"><div className="canal-cross-panel-title">Service-road reach {index + 1}<small>Ch {reach.fromChainage} m to Ch {reach.toChainage} m</small></div><button type="button" className="btn ghost" onClick={() => updateReaches(reaches.filter((item) => item.id !== reach.id))}>Remove</button></div>
        <div className="canal-road-grid">
          <label className="canal-bank-field"><span>From section</span><select value={reach.fromChainage} onChange={(event) => { const fromChainage = Number(event.target.value); patchReach(reach.id, { fromChainage, ...(fromChainage > reach.toChainage ? { toChainage: fromChainage } : {}) }) }}>{sections.map((section, i) => <option value={section.chainage} key={section.id}>{i + 1} · Ch {section.chainage} m</option>)}</select></label>
          <label className="canal-bank-field"><span>To section</span><select value={reach.toChainage} onChange={(event) => { const toChainage = Number(event.target.value); patchReach(reach.id, { toChainage, ...(toChainage < reach.fromChainage ? { fromChainage: toChainage } : {}) }) }}>{sections.map((section, i) => <option value={section.chainage} key={section.id}>{i + 1} · Ch {section.chainage} m</option>)}</select></label>
          <label className="canal-bank-field"><span>Service road side</span><select value={reach.side} onChange={(event) => patchReach(reach.id, { side: event.target.value as CanalServiceRoadReach['side'] })}><option value="left">Left bank</option><option value="right">Right bank</option><option value="both">Both banks</option></select></label>
          <label className="canal-bank-field"><span>Platform level</span><select value={reach.heightMode} onChange={(event) => patchReach(reach.id, { heightMode: event.target.value as CanalServiceRoadReach['heightMode'], ...(event.target.value === 'tbl' ? { heightAboveBed: tblHeight } : {}) })}><option value="tbl">Bank Top Level (default)</option><option value="manual">Manual height above bed</option></select></label>
          {reach.heightMode === 'manual' && <NumberField label="Height above canal bed (m)" value={reach.heightAboveBed} onChange={(heightAboveBed) => patchReach(reach.id, { heightAboveBed: Math.min(tblHeight, heightAboveBed) })} />}
          <NumberField label="Service-road width (m)" value={reach.width} onChange={(width) => patchReach(reach.id, { width })} />
          <NumberField label="Shoulder width, each side (m)" value={reach.shoulderWidth} onChange={(shoulderWidth) => patchReach(reach.id, { shoulderWidth })} />
        </div>
        <div className="canal-road-summary">Level: {reach.heightMode === 'tbl' ? `TBL · ${tblHeight.toFixed(2)} m above bed` : `${reach.heightAboveBed.toFixed(2)} m above bed`} · Total platform: {(reach.width + 2 * reach.shoulderWidth).toFixed(2)} m</div>
        <div className="canal-cross-panel-title">Construction type<small>Select one workflow. The application adds only the compatible items below.</small></div>
        <div className="canal-bank-choice canal-road-types">
          <label className={reach.constructionType === 'earthen' ? 'is-selected' : ''}><input type="radio" checked={reach.constructionType === 'earthen'} onChange={() => patchReach(reach.id, { constructionType: 'earthen' })} /><span><strong>Earthen Service Road</strong><small>Compacted formation only; no pavement layer.</small></span></label>
          <label className={reach.constructionType === 'traditional-metal' ? 'is-selected' : ''}><input type="radio" checked={reach.constructionType === 'traditional-metal'} onChange={() => patchReach(reach.id, { constructionType: 'traditional-metal' })} /><span><strong>Traditional Gravel / Hard-Metal</strong><small>Formation + Road Work 1(i) hard metal + Road Work 8(a) blindage.</small></span></label>
        </div>
        <div className="canal-bank-recommendation"><strong>Formation is billed in Chapter 2 – Bank Design.</strong> Any extra bank volume created by this road is included in the revised bank geometry and must not be billed again as a road item here.</div>
        {reach.constructionType === 'traditional-metal' && <><div className="canal-road-grid"><NumberField label="Hard-metal compacted thickness (m)" value={reach.hardMetalThickness} onChange={(hardMetalThickness) => patchReach(reach.id, { hardMetalThickness })} /><div className="canal-bank-field"><span>Hard-metal item</span><SsrCode code={reach.hardMetalItem?.code ?? reach.hardMetalCode} description={reach.hardMetalItem?.description} /><button type="button" className="btn ghost" onClick={() => setPicker({ reachId: reach.id, kind: 'hard-metal' })}><Pencil size={15} /> Change code</button><small>Select from SSR DATA or the current SOR catalogue.</small></div><div className="canal-bank-field"><span>Blindage item</span><SsrCode code={reach.blindageItem?.code ?? reach.blindageCode} description={reach.blindageItem?.description} /><button type="button" className="btn ghost" onClick={() => setPicker({ reachId: reach.id, kind: 'blindage' })}><Pencil size={15} /> Change code</button><small>Select the approved blindage item from SSR or SOR.</small></div></div>{picker?.reachId === reach.id && <UnifiedCodePicker title={picker.kind === 'hard-metal' ? 'Change hard-metal code' : 'Change blindage code'} hint="Search the same SSR and SOR sources available in Add Item." onClose={() => setPicker(null)} onPick={(item) => picker.kind === 'hard-metal' ? patchReach(reach.id, { hardMetalCode: item.code, hardMetalItem: materialFromItem(item) }) : patchReach(reach.id, { blindageCode: item.code, blindageItem: materialFromItem(item) })} />}<div className="canal-road-rate-status"><strong>Rate source:</strong> The selected catalogue item and its available rate data will be used; items without a published numeric rate remain subject to detailed analysis.</div></>}
        <div className="canal-road-items"><strong>Automatically measured road items</strong><div><span>Road length</span><b>{quantities.length.toFixed(2)} m × {quantities.sideCount} side{quantities.sideCount > 1 ? 's' : ''}</b></div><div><span>Bank widening transferred to Chapter 2</span><b>{quantities.additionalFormation.toFixed(3)} m³ · not billed here</b></div><div><span>Carriageway area</span><b>{quantities.carriagewayArea.toFixed(2)} m²</b></div><div><span>Shoulders</span><b>{quantities.shoulderArea.toFixed(2)} m²</b></div>
          {reach.constructionType === 'traditional-metal' && <><div><span>✓ {reach.hardMetalItem?.code ?? reach.hardMetalCode}</span><b>{quantities.hardMetalVolume.toFixed(3)} m³ · {(quantities.carriagewayArea / 10).toFixed(3)} per 10 m²</b></div><div><span>✓ {reach.blindageItem?.code ?? reach.blindageCode}</span><b>{quantities.blindageArea.toFixed(2)} m² · {(quantities.blindageArea / 10).toFixed(3)} per 10 m²</b></div></>}
        </div>
        <div className="canal-road-warning">Road Work 5 / 5(a) is excluded from new service roads because it starts with picking an existing metalled surface. It belongs to renewal/repair work.</div>
      </section>})}
    </div>}
  </section>
}
