import { useState } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import type { CanalData, CanalExcavationBand, TemplateMaterialRef } from '../../../../types/project'
import {
  canalCalculateExcavationPercentagesFromStrata,
  canalEarthworkTotals,
  orderedCanalSections
} from '../../../../lib/canal'
import { newId } from '../../../../lib/tree'
import { canalCnsTotals } from '../../../../lib/canalCns'
import MaterialPicker from '../../../templates/MaterialPicker'
import SsrCode from '../../../templates/SsrCode'
import CanalSectionDiagram from '../../CanalSectionDiagram'

const n3 = (value: number | undefined | null): string => (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
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

function ExcavationBands({ title, quantity, bands, extraByCode = {}, onChange, onAutoCalculate }: {
  title: string
  quantity: number
  bands: CanalExcavationBand[]
  extraByCode?: Record<string, number>
  onChange: (bands: CanalExcavationBand[]) => void
  onAutoCalculate?: () => void
}): JSX.Element {
  const [picker, setPicker] = useState<string | null>(null)
  const totalPct = bands.reduce((sum, band) => sum + band.pct, 0)
  return (
    <section className="canal-earthwork-card">
      <header className="canal-earthwork-card-head">
        <div><strong>{title}</strong><small>Add any applicable CAW excavation code.</small></div>
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
          <strong>{n3(quantity + Object.values(extraByCode).reduce((sum, value) => sum + value, 0))} cu.m</strong><span className={Math.abs(totalPct - 100) > 0.01 ? 'is-warning' : ''}>{n3(totalPct)}% {Math.abs(totalPct - 100) > 0.01 ? '!' : '✓'}</span>
        </div>
      </header>
      <div className="canal-earthwork-bands">
        <div className="canal-earthwork-band is-head"><span>Material / excavation class</span><span>Class share</span><span>CAW excavation item</span><span>Quantity</span><span /></div>
        {bands.map((band, index) => (
          <div className="canal-earthwork-band" key={band.id}>
            <input value={band.label} aria-label="Material or excavation class" onChange={(event) => onChange(bands.map((row) => row.id === band.id ? { ...row, label: event.target.value } : row))} />
            <label className="canal-earthwork-percent"><input type="number" min={0} max={100} step="any" value={band.pct} onChange={(event) => onChange(bands.map((row) => row.id === band.id ? { ...row, pct: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : row))} /><span>%</span></label>
            <button type="button" className="btn ghost" onClick={() => setPicker(band.id)}>{band.material.code ? <SsrCode code={band.material.code} description={band.material.description} /> : 'Select code'}</button>
            <span>{n3(quantity * band.pct / 100 + (bands.findIndex((row) => row.material.code === band.material.code) === index ? extraByCode[band.material.code] ?? 0 : 0))} cu.m</span>
            <button type="button" className="canal-earthwork-remove" aria-label="Remove excavation code" onClick={() => onChange(bands.filter((row) => row.id !== band.id))}><Trash2 size={14} /></button>
            {picker === band.id && <MaterialPicker initialCategory="IRR-CAW" initialSearch="IRR-CAW-1" onClose={() => setPicker(null)} onPick={(item) => {
              onChange(bands.map((row) => row.id === band.id ? { ...row, label: item.description || row.label, material: materialFromItem(item) } : row))
              setPicker(null)
            }} />}
          </div>
        ))}
      </div>
      {Object.values(extraByCode).some((value) => value > 0) && <p>Lining and CNS preparation excavation is added by its soil or rock class; class percentages apply to the original canal excavation.</p>}
      <button type="button" className="btn ghost" onClick={() => onChange([...bands, { id: newId(), label: 'Select material / excavation class', pct: 0, bankReusePct: 0, material: { code: '' } }])}><Plus size={13} /> Add any CAW excavation code</button>
    </section>
  )
}

export default function CanalEarthwork({ data, onCommit }: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const totals = canalEarthworkTotals(data)
  const cns = canalCnsTotals(data)
  const hasErm = data.sections.some((section) => section.strataTopRl != null)
  const ermClassifiedPct = hasErm ? canalCalculateExcavationPercentagesFromStrata(data).reduce((sum, band) => sum + band.pct, 0) : 100

  const sections = (orderedCanalSections(data))
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => sections[0]?.id ?? '')
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0] ?? null
  if (selectedSection && selectedSection.id !== selectedSectionId) {
    setSelectedSectionId(selectedSection.id)
  }
  return (
    <section className="canal-v2-section" aria-labelledby="canal-earthwork-title">
      <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Chapter 6</span><h2 id="canal-earthwork-title">6. Canal Excavation & Bund Stripping</h2><p>Canal prism excavation and bund stripping are measured separately by mean sectional area.</p></div></header>

      {(data.design.serviceRoadReaches?.length ?? 0) > 0 && <div className="canal-bank-recommendation"><strong>Roads &amp; Access applied:</strong> Excavation includes cutting needed for road benches and shoulders. Stripping uses the revised section footprint. Extra bank filling is included in Bank Design; pavement is measured in Roads &amp; Access.</div>}
      {hasErm && ermClassifiedPct < 99.99 && totals.excavation > 0 && <div className="canal-road-warning" role="status">ERM levels classify {n3(ermClassifiedPct)}% of the canal cutting. Enter missing chainage strata or extend the investigation where excavation goes below its limit. Uninvestigated material is not assigned to hard rock.</div>}

      <section className="canal-earthwork-card">
        <div className="canal-cross-panel-title">Bund Stripping<small>Only applies to sections which have bund.</small></div>
        <NumberField label="Stripping depth (m)" value={data.strippingDepth} onChange={(strippingDepth) => onCommit((current) => ({ ...current, strippingDepth }))} />
        <div className="canal-earthwork-summary"><span>Bund stripping <strong>{n3(totals.stripping)} cu.m</strong></span></div>
      </section>

      <ExcavationBands
        title={data.mode === 'new' ? 'Canal excavation classification' : 'Canal stripping / excavation classification'}
        quantity={data.mode === 'new' ? Math.max(0, totals.excavation - cns.excavation) : totals.excavation + totals.stripping}
        extraByCode={cns.excavationByCode}
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

      <section className="canal-earthwork-card">
        <div className="canal-zoned-reaches-head">
          <div className="canal-cross-panel-title">Excavation cross-section<small>Select a section to review the canal excavation and bund stripping geometry.</small></div>
          {sections.length > 0 && <label className="canal-earthwork-section-select"><span>Section</span><select value={selectedSection?.id ?? ''} onChange={(event) => setSelectedSectionId(event.target.value)}>{sections.map((section, index) => <option key={section.id} value={section.id}>{index + 1} · Ch {n3(section.chainage)} m</option>)}</select></label>}
        </div>
        {selectedSection
          ? <div className="canal-earthwork-section-view"><CanalSectionDiagram data={data} section={selectedSection} showFoundationExcavation={false} /></div>
          : <div className="canal-zoned-empty">Add and populate cross-sections to view excavation geometry.</div>}
      </section>
    </section>
  )
}
