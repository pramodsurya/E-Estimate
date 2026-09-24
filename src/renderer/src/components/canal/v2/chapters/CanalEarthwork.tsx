import { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import type { CanalData, CanalExcavationBand, CanalFoundationExcavationReach, TemplateMaterialRef } from '../../../../types/project'
import type { CanalEarthworkTotals } from '../../../../types/eestimateApi'
import {
  canalCalculateExcavationPercentagesFromStrata,
  canalEarthworkTotals,
  canalFoundationExcavationReachTotal,
  canalStrippingReachTotal,
  defaultCanalExcavationBands,
  orderedCanalSections
} from '../../../../lib/canal'
import { newId } from '../../../../lib/tree'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'
import CanalSectionDiagram from '../../CanalSectionDiagram'

const n3 = (value: number | undefined | null): string => (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const sectionGroundRl = (section: CanalData['sections'][number] | undefined): number | null => {
  if (!section?.ground.length) return null
  return (section.ground[0].rl + section.ground[section.ground.length - 1].rl) / 2
}
const lowestGroundRl = (sections: CanalData['sections']): number | null => {
  const levels = sections.flatMap((section) => section.ground.map((point) => point.rl)).filter(Number.isFinite)
  return levels.length ? Math.min(...levels) : null
}

const materialFromItem = (item: {
  code: string
  description: string
  unit?: string | null
  category: string
  side?: TemplateMaterialRef['side']
  dataVariant?: TemplateMaterialRef['dataVariant']
}): TemplateMaterialRef => ({
  code: item.code,
  description: item.description,
  unit: item.dataVariant?.unit ?? item.unit,
  categoryKey: item.category,
  side: item.side,
  dataVariant: item.dataVariant
})

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>
}

function ExcavationBands({ title, quantity, bands, onChange, onAutoCalculate }: {
  title: string
  quantity: number
  bands: CanalExcavationBand[]
  onChange: (bands: CanalExcavationBand[]) => void
  onAutoCalculate?: () => void
}): JSX.Element {
  const [picker, setPicker] = useState<string | null>(null)
  const totalPct = bands.reduce((sum, band) => sum + band.pct, 0)
  return (
    <section className="canal-earthwork-card">
      <header className="canal-earthwork-card-head">
        <div><strong>{title}</strong><small>Add any applicable CAW excavation code. The code identifies excavation work; bank suitability is assessed separately.</small></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onAutoCalculate && (
            <button
              type="button"
              className="btn ghost"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', fontSize: '0.8rem' }}
              onClick={onAutoCalculate}
              title="Calculate excavation class share percentages from geological strata"
            >
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              <span>Calculate % from Strata</span>
            </button>
          )}
          <strong>{n3(quantity)} cu.m</strong><span className={Math.abs(totalPct - 100) > 0.01 ? 'is-warning' : ''}>{n3(totalPct)}% {Math.abs(totalPct - 100) > 0.01 ? '!' : '✓'}</span>
        </div>
      </header>
      <div className="canal-earthwork-bands">
        <div className="canal-earthwork-band is-head"><span>Material / excavation class</span><span>Class share</span><span>CAW excavation item</span><span>Quantity</span><span>Suitable for casing / homogeneous bank</span><span /></div>
        {bands.map((band) => (
          <div className="canal-earthwork-band" key={band.id}>
            <input value={band.label} aria-label="Material or excavation class" onChange={(event) => onChange(bands.map((row) => row.id === band.id ? { ...row, label: event.target.value } : row))} />
            <label className="canal-earthwork-percent"><input type="number" min={0} max={100} step="any" value={band.pct} onChange={(event) => onChange(bands.map((row) => row.id === band.id ? { ...row, pct: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : row))} /><span>%</span></label>
            <button type="button" className="btn ghost" onClick={() => setPicker(band.id)}>{band.material.code ? <SsrCode code={band.material.code} description={band.material.description} /> : 'Select code'}</button>
            <span>{n3(quantity * band.pct / 100)} cu.m</span>
            <label className="canal-earthwork-percent"><input type="number" min={0} max={100} step="any" value={band.bankReusePct ?? 0} onChange={(event) => onChange(bands.map((row) => row.id === band.id ? { ...row, bankReusePct: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : row))} /><span>%</span></label>
            <button type="button" className="canal-earthwork-remove" aria-label="Remove excavation code" onClick={() => onChange(bands.filter((row) => row.id !== band.id))}><Trash2 size={14} /></button>
            {picker === band.id && <MaterialPicker initialCategory="IRR-CAW" initialSearch="IRR-CAW-1" onClose={() => setPicker(null)} onPick={(item) => {
              onChange(bands.map((row) => row.id === band.id ? { ...row, label: item.description || row.label, material: materialFromItem(item) } : row))
              setPicker(null)
            }} />}
          </div>
        ))}
      </div>
      <div className="canal-bank-recommendation"><strong>Suitability rule:</strong> enter only the tested and approved reusable percentage. Excavation code alone never makes soil suitable for casing or homogeneous embankment.</div>
      <button type="button" className="btn ghost" onClick={() => onChange([...bands, { id: newId(), label: 'Select material / excavation class', pct: 0, bankReusePct: 0, material: { code: '' } }])}><Plus size={13} /> Add any CAW excavation code</button>
    </section>
  )
}

export default function CanalEarthwork({ data, onCommit }: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const totals = canalEarthworkTotals(data)

  const sections = (orderedCanalSections(data))
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => sections[0]?.id ?? '')
  const [showFoundationExcavation, setShowFoundationExcavation] = useState(true)
  const [draftReach, setDraftReach] = useState<CanalFoundationExcavationReach | null>(null)
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0] ?? null
  if (selectedSection && selectedSection.id !== selectedSectionId) {
    setSelectedSectionId(selectedSection.id)
  }
  const updateDesign = (patch: Partial<CanalData['design']>): void => onCommit((current) => ({ ...current, design: { ...current.design, ...patch } }))
  return (
    <section className="canal-v2-section" aria-labelledby="canal-earthwork-title">
      <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Chapter 5</span><h2 id="canal-earthwork-title">5. {data.mode === 'new' ? 'Canal & Bund Excavation' : 'Bund Stripping & Excavation'}</h2><p>{data.mode === 'new' ? 'Canal prism excavation and bund foundation excavation / stripping are measured separately by mean sectional area.' : 'Measure canal cut and bund formation stripping by mean sectional area.'}</p></div></header>

      <section className="canal-earthwork-card">
        <div className="canal-cross-panel-title">Excavation quantities<small>{data.mode === 'new' ? 'The two coloured quantities never overwrite or replace one another.' : 'Stripping is measured below the repair fill footprint.'}</small></div>
        {data.mode === 'new' && <div className="canal-excavation-key" style={{ display: 'flex', gap: 16 }}>
          <div className="is-canal"><i /><span><strong>Canal excavation</strong><small>Soil or rock removed within canal prism between existing ground and designed cut profile, including bed, side slopes, and cut berms.</small></span></div>
          <div className="is-foundation"><i style={{ background: '#3b82f6' }} /><span><strong>Bund excavation</strong><small>Ground preparation excavation (foundation excavation or stripping) strictly beneath the left and right bund footprints.</small></span></div>
        </div>}
        <div className="canal-earthwork-summary"><span>Canal excavation <strong>{n3(totals.excavation)} cu.m</strong></span>{data.mode === 'new' && <span>Bund excavation <strong>{n3(totals.foundationExcavation)} cu.m</strong></span>}<span>Bund stripping <strong>{n3(totals.stripping)} cu.m</strong></span></div>
        {data.mode === 'repair' && <NumberField label="Bund stripping depth (m)" value={data.strippingDepth} onChange={(strippingDepth) => onCommit((current) => ({ ...current, strippingDepth }))} />}
      </section>

      {data.mode === 'new' && <section className="canal-earthwork-card">
        <div className="canal-zoned-reaches-head"><div className="canal-cross-panel-title">Bund excavation reaches<small>Add a reach, choose Bund Foundation Excavation or Bund Stripping, then Save. Bund excavation applies strictly to ground beneath the left and right bunds.</small></div><button type="button" className="btn primary" disabled={sections.length < 2 || draftReach != null} onClick={() => setDraftReach({ id: newId(), fromChainage: sections[0]?.chainage ?? 0, toChainage: sections.at(-1)?.chainage ?? 0, kind: 'foundation', foundationRl: (lowestGroundRl(sections) ?? data.design.bedLevelAtStart) - 0.6, strippingDepth: 0.6, bands: defaultCanalExcavationBands() })}><Plus size={14} /> Add bund reach</button></div>
        {data.foundationExcavationReaches.length === 0 && !draftReach && <div className="canal-zoned-empty">No bund excavation reach has been saved.</div>}
        <div className="canal-excavation-reach-summaries">{data.foundationExcavationReaches.filter((reach) => reach.id !== draftReach?.id).map((reach, index) => {
          const quantity = reach.kind === 'stripping' ? canalStrippingReachTotal(data, reach) : canalFoundationExcavationReachTotal(data, reach)
          const fromIndex = sections.findIndex((section) => section.chainage === reach.fromChainage)
          const toIndex = sections.findIndex((section) => section.chainage === reach.toChainage)
          const fromGroundRl = sectionGroundRl(sections[fromIndex])
          const toGroundRl = sectionGroundRl(sections[toIndex])
          return <div className="canal-excavation-reach-summary" key={reach.id}>
            <div><strong>{reach.kind === 'stripping' ? 'Bund Stripping' : 'Bund Foundation Excavation'} · Reach {index + 1}</strong><span>Section {fromIndex + 1} · Ch {n3(reach.fromChainage)} m → Section {toIndex + 1} · Ch {n3(reach.toChainage)} m</span><span className="canal-reach-actions"><button type="button" className="btn ghost" disabled={draftReach != null} onClick={() => setDraftReach({ ...reach, bands: reach.bands.map((band) => ({ ...band, material: { ...band.material } })) })}><Pencil size={13} /> Edit</button><button type="button" className="btn ghost" disabled={draftReach != null} onClick={() => onCommit((current) => ({ ...current, foundationExcavationReaches: current.foundationExcavationReaches.filter((row) => row.id !== reach.id) }))}><Trash2 size={13} /> Remove</button></span></div>
            <div>{reach.kind === 'stripping' ? <span>Depth <strong>{n3(reach.strippingDepth)} m</strong></span> : <><span>Bottom <strong>RL {n3(reach.foundationRl)} m</strong></span><span>Depth: first <strong>{n3(Math.max(0, (fromGroundRl ?? reach.foundationRl) - reach.foundationRl))} m</strong> · last <strong>{n3(Math.max(0, (toGroundRl ?? reach.foundationRl) - reach.foundationRl))} m</strong></span></>}<span>Quantity <strong>{n3(quantity)} cu.m</strong></span></div>
          </div>
        })}</div>
        {draftReach && (() => {
          const patchDraft = (patch: Partial<CanalFoundationExcavationReach>): void => setDraftReach((current) => current ? { ...current, ...patch } : current)
          const previewData = { ...data, foundationExcavationReaches: [...data.foundationExcavationReaches.filter((reach) => reach.id !== draftReach.id), draftReach] }
          const quantity = draftReach.kind === 'stripping' ? canalStrippingReachTotal(previewData, draftReach) : canalFoundationExcavationReachTotal(previewData, draftReach)
          const validClassification = draftReach.kind === 'stripping' || Math.abs(draftReach.bands.reduce((sum, band) => sum + band.pct, 0) - 100) <= 0.01
          return <div className="canal-foundation-reach is-editing">
            <div className="canal-zoned-reaches-head"><strong>{data.foundationExcavationReaches.some((reach) => reach.id === draftReach.id) ? 'Edit bund excavation reach' : 'New bund excavation reach'}</strong><button type="button" className="btn ghost" onClick={() => setDraftReach(null)}><X size={14} /> Cancel</button></div>
            <div className="canal-road-grid"><label className="canal-bank-field"><span>From section</span><select value={draftReach.fromChainage} onChange={(event) => { const value = Number(event.target.value); patchDraft({ fromChainage: value, ...(value > draftReach.toChainage ? { toChainage: value } : {}) }) }}>{sections.map((section, i) => <option key={section.id} value={section.chainage}>{i + 1} · Ch {section.chainage} m</option>)}</select></label><label className="canal-bank-field"><span>To section</span><select value={draftReach.toChainage} onChange={(event) => { const value = Number(event.target.value); patchDraft({ toChainage: value, ...(value < draftReach.fromChainage ? { fromChainage: value } : {}) }) }}>{sections.map((section, i) => <option key={section.id} value={section.chainage}>{i + 1} · Ch {section.chainage} m</option>)}</select></label></div>
            <div className="canal-bank-choice" role="radiogroup" aria-label="Bund ground preparation type"><label className={draftReach.kind === 'foundation' ? 'is-selected' : ''}><input type="radio" checked={draftReach.kind === 'foundation'} onChange={() => patchDraft({ kind: 'foundation' })} /><span><strong>Bund Foundation Excavation</strong><small>Excavate to one bottom RL below the bund footprint and classify the excavated soil or rock.</small></span></label><label className={draftReach.kind === 'stripping' ? 'is-selected' : ''}><input type="radio" checked={draftReach.kind === 'stripping'} onChange={() => patchDraft({ kind: 'stripping' })} /><span><strong>Bund Stripping</strong><small>Strip a constant depth below existing ground under the bund footprint.</small></span></label></div>
            <div className="canal-road-grid">{draftReach.kind === 'foundation' ? <label className="canal-bank-field"><span>Bund foundation excavation bottom RL (m)</span><input type="number" step="any" value={draftReach.foundationRl} onChange={(event) => patchDraft({ foundationRl: Number(event.target.value) || 0 })} /><small>Default: lowest ground point in all sections − 0.60 m.</small></label> : <NumberField label="Bund stripping depth (m)" value={draftReach.strippingDepth} onChange={(strippingDepth) => patchDraft({ strippingDepth })} />}</div>
            <div className="canal-earthwork-summary"><span>Preview quantity <strong>{n3(quantity)} cu.m</strong></span></div>
            {draftReach.kind === 'foundation' && <ExcavationBands title="Bund foundation soil / rock classification" quantity={quantity} bands={draftReach.bands} onChange={(bands) => patchDraft({ bands })} />}
            <div className="canal-reach-editor-actions"><button type="button" className="btn primary" disabled={!validClassification} onClick={() => { onCommit((current) => ({ ...current, foundationExcavationReaches: current.foundationExcavationReaches.some((reach) => reach.id === draftReach.id) ? current.foundationExcavationReaches.map((reach) => reach.id === draftReach.id ? draftReach : reach) : [...current.foundationExcavationReaches, draftReach] })); setDraftReach(null) }}><Save size={14} /> Save bund reach</button><button type="button" className="btn ghost" onClick={() => setDraftReach(null)}>Cancel</button></div>
          </div>
        })()}
      </section>}

      <ExcavationBands
        title={data.mode === 'new' ? 'Canal excavation classification' : 'Canal stripping / excavation classification'}
        quantity={data.mode === 'new' ? totals.excavation : totals.excavation + totals.stripping}
        bands={data.excavationBands}
        onAutoCalculate={() => {
          const autoPercentages = canalCalculateExcavationPercentagesFromStrata(data)
          onCommit((current) => ({
            ...current,
            excavationBands: current.excavationBands.map((band, idx) => {
              const match = autoPercentages.find((p) => p.code === band.material.code) ?? autoPercentages[idx]
              return match ? { ...band, pct: match.pct } : band
            })
          }))
        }}
        onChange={(excavationBands) => onCommit((current) => ({ ...current, excavationBands }))}
      />

      {data.mode === 'new' && data.design.bankSectionType === 'zoned' && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title">Impervious hearting cutoff trench<small>These are the same Chapter 2 dimensions. Editing them here updates Bank Design.</small></div>
          <label className="canal-earthwork-check"><input type="checkbox" checked={data.design.heartingTrenchEnabled} onChange={(event) => updateDesign({ heartingTrenchEnabled: event.target.checked })} /> Provide cutoff trench</label>
          {data.design.heartingTrenchEnabled && <>
            <div className="canal-design-grid"><NumberField label="Trench bottom width (m)" value={data.design.heartingTrenchWidth} onChange={(heartingTrenchWidth) => updateDesign({ heartingTrenchWidth })} /><NumberField label="Left trench slope (H : 1V)" value={data.design.heartingTrenchLeftSlope} onChange={(heartingTrenchLeftSlope) => updateDesign({ heartingTrenchLeftSlope })} /><NumberField label="Right trench slope (H : 1V)" value={data.design.heartingTrenchRightSlope} onChange={(heartingTrenchRightSlope) => updateDesign({ heartingTrenchRightSlope })} /></div>
            <div className="canal-bank-recommendation"><strong>Automatic depth:</strong> half of the calculated hearting height at each qualifying bank and section.</div>
            <div className="canal-earthwork-summary"><span>Calculated cutoff-trench excavation <strong>{n3(totals.cutoffTrench)} cu.m</strong></span></div>
          </>}
        </section>
      )}

      {data.mode === 'new' && data.design.bankSectionType === 'zoned' && data.design.heartingTrenchEnabled && <ExcavationBands title="Cutoff-trench excavation classification" quantity={totals.cutoffTrench} bands={data.trenchExcavationBands} onChange={(trenchExcavationBands) => onCommit((current) => ({ ...current, trenchExcavationBands }))} />}

      <section className="canal-earthwork-card">
        <div className="canal-zoned-reaches-head">
          <div className="canal-cross-panel-title">Excavation cross-section<small>Select a section. Use the checkable legend below the diagram to show or hide canal foundation excavation.</small></div>
          {sections.length > 0 && <label className="canal-earthwork-section-select"><span>Section</span><select value={selectedSection?.id ?? ''} onChange={(event) => setSelectedSectionId(event.target.value)}>{sections.map((section, index) => <option key={section.id} value={section.id}>{index + 1} · Ch {n3(section.chainage)} m</option>)}</select></label>}
        </div>
        {selectedSection
          ? <div className="canal-earthwork-section-view"><CanalSectionDiagram data={data} section={selectedSection} showFoundationExcavation={showFoundationExcavation} onToggleFoundationExcavation={data.mode === 'new' ? setShowFoundationExcavation : undefined} /></div>
          : <div className="canal-zoned-empty">Add and populate cross-sections to view excavation geometry.</div>}
      </section>
    </section>
  )
}
