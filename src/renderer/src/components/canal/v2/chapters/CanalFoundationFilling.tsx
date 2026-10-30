import { useMemo, useState } from 'react'
import { Droplets } from 'lucide-react'
import type {
  CanalData,
  CanalTierFoundationConfig
} from '../../../../types/project'
import {
  defaultCanalTierFoundationConfig,
  canalTierFoundationItems,
  canalTierFoundationQuantities,
  canalTierToeProtectionQuantities,
  canalDesignProfile,
  canalGroundLevelAt,
  orderedCanalSections
} from '../../../../lib/canal'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import SsrCode from '../../../templates/SsrCode'
import { Details as ToeFilterDetails, ToeFilterSketch } from './CanalFiltersDrains'
import { formatCanalReachChainage } from '../../../../lib/canalTierReaches'
import { canalDrainageMode, canalDrainageTiers, canalDrainageTierTreatment, canalDrainageWorkRanges, canalManualDrainageReaches, saveCanalDrainageTier, saveCanalBankDrainageReach } from '../../../../lib/canalDrainageDesign'
import { bankProtectionSectionAt } from '../../../../lib/canalBankProtection'
import { bankReachLabel } from './CanalBankReachPicker'

const BLANKET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '5-4', label: '25 cm sand blanket below embankment (IRR-CAW-5-4)' },
  { value: '5-5', label: 'Variable-thickness sand blanket below embankment (IRR-CAW-5-5)' }
] as const

const n3 = (v: number | undefined | null): string =>
  (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

function getReachBadgeText(f: CanalTierFoundationConfig): string {
  const parts: string[] = []
  if (f.blanket !== 'none') parts.push(f.blanket === '5-4' ? '25cm Blanket' : 'Var Blanket')
  if (f.horizontalFilter) parts.push('Filter')
  if (f.rockToe) parts.push('Chimney')
  if (f.toeFilter) parts.push('Toe Filter')
  return parts.length ? parts.join(' · ') : 'No works'
}

function ReachDrainageEditor({ data, activeSide, ranges, title, saved, buildPreview, startEditing = false, onSave, onCancel, projectItems, grandToeSummary }: { data: CanalData; activeSide: 'left' | 'right'; ranges: Array<{ from: number; to: number }>; title: string; saved: CanalTierFoundationConfig; buildPreview: (patch: Partial<CanalTierFoundationConfig>) => CanalData; startEditing?: boolean; onSave: (patch: Partial<CanalTierFoundationConfig>) => boolean; onCancel?: () => void; projectItems: ReturnType<typeof canalTierFoundationItems>; grandToeSummary: ReturnType<typeof canalTierToeProtectionQuantities> }): JSX.Element {
  const [draft, setDraft] = useState<Partial<CanalTierFoundationConfig> | null>(startEditing ? {} : null)
  const [previewChainage, setPreviewChainage] = useState(ranges[0]?.from ?? 0)
  const isSymmetrical = data.design.bankConfig?.linkSymmetrical
  const treatment = { ...saved, ...draft }
  const diagramData = draft ? buildPreview(draft) : data
  const patchTreatment = (patch: Partial<CanalTierFoundationConfig>): void => setDraft(current => current ? { ...current, ...patch } : current)
  const stations = useMemo(() => [...new Set(ranges.flatMap(r => [r.from, ...orderedCanalSections(data).filter(s => s.chainage >= r.from && s.chainage < r.to && s.designPopulated !== false && s.ground.length >= 2).map(s => s.chainage), r.to]))].sort((a,b) => a-b), [data, ranges])
  const previewSection = useMemo(() => {
    const section = bankProtectionSectionAt(data, previewChainage)
    if (!section || !ranges.length) return undefined
    const ending = ranges.find(r => r.to === previewChainage)
    const lookup = ending ? Math.max(ending.from, previewChainage - 1e-6) : previewChainage
    const preview = { ...section, bankReachLookupChainageBySide: isSymmetrical ? { left: lookup, right: lookup } : { [activeSide]: lookup } }
    const profile = canalDesignProfile(data, preview)
    if (profile.length < 2) return preview
    const from = Math.min(...profile.map(p => p.offset)), to = Math.max(...profile.map(p => p.offset))
    const margin = Math.max(2, (to - from) * .12)
    const ground = [from - margin, ...preview.ground.map(p => p.offset).filter(x => x > from - margin && x < to + margin), to + margin].flatMap(offset => {
      const rl = canalGroundLevelAt(preview.ground, offset)
      return rl == null ? [] : [{ offset, rl }]
    }).sort((a,b) => a.offset-b.offset)
    return ground.length >= 2 ? { ...preview, ground } : preview
  }, [data, previewChainage, ranges, isSymmetrical, activeSide])
  const { tierSummary, tierToeSummary } = useMemo(() => {
    const scope = { from: 0, to: data.lengthM, ranges, side: isSymmetrical ? undefined : activeSide }
    return { tierSummary: canalTierFoundationQuantities(data, undefined, scope), tierToeSummary: canalTierToeProtectionQuantities(data, undefined, scope) }
  }, [data, ranges, isSymmetrical, activeSide])
  const selectedToeFilterQuantity = saved.toeFilterKind === '5-7' ? tierToeSummary.toeFilterGradedVolume : saved.toeFilterKind === '5-12' ? tierToeSummary.toeFilterFabric200Area : tierToeSummary.toeFilterFabric250Area
  return <div className="canal-earthwork-card" style={{ display: 'grid', gap: 16 }}>
    <header><h3>{title} · {isSymmetrical ? 'Both banks' : activeSide === 'left' ? 'Left bank' : 'Right bank'}</h3><p>Edit the settings, then save to recalculate. Quantities show saved settings; the diagram previews your edits.</p></header>
    <div className="canal-protection-choices">{draft ? <><button key="save" type="button" onClick={() => { if (onSave(draft)) setDraft(null) }}>Save drainage &amp; filters</button><button key="cancel" type="button" onClick={() => { setDraft(null); onCancel?.() }}>Cancel</button></> : <button key="edit" type="button" onClick={() => setDraft({})}>Edit drainage &amp; filters</button>}</div>
    <fieldset className="canal-reach-work-fields" disabled={!draft}>
          <div className="canal-foundation-work-groups">
            {/* 1. Sand Blanket Card */}
            <section className="canal-foundation-work-group group-blanket">
              <strong>1. Sand Blanket</strong>
              <small>Horizontal drainage blanket placed directly on the stripped/prepared bund level.</small>
              <label className="canal-bank-field">
                <span>Selection</span>
                <select
                  value={treatment.blanket}
                  onChange={(e) => patchTreatment({ blanket: e.target.value as CanalTierFoundationConfig['blanket'] })}
                >
                  {BLANKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {treatment.blanket !== 'none' && (
                <>
                  <label className="canal-bank-field">
                    <span>Width mode</span>
                    <select
                      value={treatment.blanketWidthMode}
                      onChange={(e) => patchTreatment({ blanketWidthMode: e.target.value as CanalTierFoundationConfig['blanketWidthMode'] })}
                    >
                      <option value="automatic">Automatic — valid prepared bund footprint</option>
                      <option value="manual">Manual left / right widths</option>
                    </select>
                  </label>

                  {treatment.blanketWidthMode === 'manual' ? (
                    <div className="canal-bank-grid">
                      <label className="canal-bank-field">
                        <span>Left width (m)</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={treatment.blanketLeftWidth}
                          onChange={(e) => patchTreatment({ blanketLeftWidth: Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                      <label className="canal-bank-field">
                        <span>Right width (m)</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={treatment.blanketRightWidth}
                          onChange={(e) => patchTreatment({ blanketRightWidth: Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="canal-foundation-rule">
                      <strong>Automatic extent</strong>
                      <span>Runs across both banks and beneath the bed on homogeneous sections without canal cutting. Stops at the impervious core/trench where zoned.</span>
                    </div>
                  )}

                  <label className="canal-bank-field">
                    <span>Thickness (m)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      disabled={treatment.blanket === '5-4'}
                      value={treatment.blanket === '5-4' ? 0.25 : treatment.blanketThickness}
                      onChange={(e) => patchTreatment({ blanketThickness: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>
                  <small className="canal-dimension-note">
                    {treatment.blanket === '5-4' ? '25 cm fixed thickness per SSR IRR-CAW-5-4.' : 'Custom thickness for IRR-CAW-5-5.'}
                  </small>
                </>
              )}
            </section>

            {/* 2. Filters Card */}
            <section className="canal-foundation-work-group group-rocktoe">
              <strong>2. Drainage Filters</strong>
              <small>Graded filter drains protecting downstream bund toe and relieving seepage pressures.</small>

              <label className="canal-check-row">
                <input
                  type="checkbox"
                  checked={treatment.horizontalFilter}
                  onChange={(e) => patchTreatment({ horizontalFilter: e.target.checked })}
                />
                <span>Provide horizontal graded filter drain (IRR-CAW-5-7)</span>
              </label>

              {treatment.horizontalFilter && (
                <>
                  <label className="canal-bank-field">
                    <span>Filter length calculation</span>
                    <select
                      value={treatment.filterLengthMode}
                      onChange={(e) => patchTreatment({ filterLengthMode: e.target.value as CanalTierFoundationConfig['filterLengthMode'] })}
                    >
                      <option value="automatic">Automatic — drainage rule</option>
                      <option value="manual">Manual entry</option>
                    </select>
                  </label>

                  {treatment.filterLengthMode === 'manual' ? (
                    <div className="canal-bank-grid">
                      <label className="canal-bank-field">
                        <span>Left filter length (m)</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={treatment.filterLeftLength}
                          onChange={(e) => patchTreatment({ filterLeftLength: Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                      <label className="canal-bank-field">
                        <span>Right filter length (m)</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={treatment.filterRightLength}
                          onChange={(e) => patchTreatment({ filterRightLength: Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="canal-foundation-rule">
                      <strong>Automatic filter length</strong>
                      <span>Outer toe to impervious-hearting toe (zoned) or half the prepared bund footprint (homogeneous).</span>
                    </div>
                  )}

                  <label className="canal-bank-field">
                    <span>Filter thickness (m)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={treatment.filterThickness}
                      onChange={(e) => patchTreatment({ filterThickness: Math.max(0, Number(e.target.value)) })}
                    />
                  </label>

                  <label className="canal-check-row" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={treatment.rockToe}
                      onChange={(e) => patchTreatment({ rockToe: e.target.checked })}
                    />
                    <span>Add vertical / inclined chimney filter (IRR-CAW-5-10)</span>
                  </label>

                  {treatment.rockToe && (
                    <>
                      <label className="canal-bank-field">
                        <span>Location</span>
                        <select
                          value={treatment.rockToeSide}
                          onChange={(e) => patchTreatment({ rockToeSide: e.target.value as CanalTierFoundationConfig['rockToeSide'] })}
                        >
                          <option value="left">Left bund only</option>
                          <option value="right">Right bund only</option>
                          <option value="both">Both bunds</option>
                        </select>
                      </label>
                      <div className="canal-bank-grid">
                        <label className="canal-bank-field">
                          <span>Code-fixed width (m)</span>
                          <input type="number" disabled value={0.5} />
                        </label>
                        <label className="canal-bank-field">
                          <span>Height (m, 0 = auto to FSL)</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={treatment.rockToeHeight}
                            onChange={(e) => patchTreatment({ rockToeHeight: Math.max(0, Number(e.target.value)) })}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="canal-foundation-rule" style={{ marginTop: 12 }}>
                <strong><Droplets size={15} /> Subsurface toe filter</strong>
                <span>Buried filter at the land-side toe. It receives seepage from the horizontal/chimney system and releases it toward the open toe ditch or a designed outlet.</span>
              </div>
              <label className="canal-check-row">
                <input
                  type="checkbox"
                  checked={treatment.toeFilter}
                  onChange={(e) => patchTreatment({ toeFilter: e.target.checked })}
                />
                <span>Provide subsurface toe filter</span>
              </label>
              {treatment.toeFilter && (
                <div className="canal-work-card-body canal-tier-work-layout">
                  <div className="canal-preview-stack">
                    <ToeFilterSketch kind={treatment.toeFilterKind} width={treatment.toeFilterWidth} depth={treatment.toeFilterDepth} />
                    <div className="canal-live-quantity">
                      <span>Saved reach toe-filter quantity</span>
                      <SsrCode code={`IRR-CAW-${saved.toeFilterKind}`} />
                      <strong>{n3(selectedToeFilterQuantity)} {saved.toeFilterKind === '5-7' ? 'CUM' : 'SQM'}</strong>
                    </div>
                    <ToeFilterDetails kind={saved.toeFilterKind} quantity={selectedToeFilterQuantity} />
                  </div>
                  <div className="canal-control-stack">
                    <label className="canal-bank-field">
                      <span>Apply at land-side toe of</span>
                      <select value={treatment.toeFilterSide} onChange={(e) => patchTreatment({ toeFilterSide: e.target.value as CanalTierFoundationConfig['toeFilterSide'] })}>
                        <option value="both">Both banks</option>
                        <option value="left">Left bank only</option>
                        <option value="right">Right bank only</option>
                      </select>
                    </label>
                    <fieldset className="canal-choice-group">
                      <legend>Filter construction</legend>
                      <label><input type="radio" checked={treatment.toeFilterKind === '5-7'} onChange={() => patchTreatment({ toeFilterKind: '5-7', toeFilterDepth: 0.6 })} /> Graded sand/aggregate filter (IRR-CAW-5-7)</label>
                      <label><input type="radio" checked={treatment.toeFilterKind !== '5-7'} onChange={() => patchTreatment({ toeFilterKind: '5-12' })} /> Geotextile + aggregate filter</label>
                    </fieldset>
                    {treatment.toeFilterKind !== '5-7' && (
                      <fieldset className="canal-choice-group compact">
                        <legend>Filter fabric</legend>
                        <label><input type="radio" checked={treatment.toeFilterKind === '5-12'} onChange={() => patchTreatment({ toeFilterKind: '5-12' })} /> 200 gsm (IRR-CAW-5-12)</label>
                        <label><input type="radio" checked={treatment.toeFilterKind === '5-13'} onChange={() => patchTreatment({ toeFilterKind: '5-13' })} /> 250 gsm (IRR-CAW-5-13)</label>
                      </fieldset>
                    )}
                    <label className="canal-bank-field"><span>Filter width (m)</span><input type="number" min="0" step="any" value={treatment.toeFilterWidth} onChange={(e) => patchTreatment({ toeFilterWidth: Math.max(0, Number(e.target.value)) })} /></label>
                    {treatment.toeFilterKind === '5-7' ? (
                      <label className="canal-bank-field"><span>Filter depth (m)</span><input type="number" min="0" step="any" value={treatment.toeFilterDepth} onChange={(e) => patchTreatment({ toeFilterDepth: Math.max(0, Number(e.target.value)) })} /></label>
                    ) : (
                      <div className="canal-foundation-rule"><strong>Code-fixed construction</strong><span>200 mm aggregate course between two polypropylene filter-fabric layers.</span></div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

    </fieldset>
          {/* Actual selected-reach cross-section using saved settings. */}
          <div className="canal-foundation-section-preview" style={{ marginTop: 12 }}>
            <p className="canal-protection-help">{data.sections.some(s => s.chainage === previewChainage && s.designPopulated !== false && s.ground.length >= 2) ? 'Uses saved section ground levels.' : 'Ground at this reach boundary is interpolated between adjoining populated sections.'} {draft ? 'Preview shows unsaved drainage and filters. Save to apply quantities.' : 'The cross-section shows saved drainage and filters.'}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <label className="canal-bank-field" style={{ minWidth: 320, maxWidth: 500 }}>
                <span>Cross-section preview</span>
                <select value={previewChainage} onChange={(e) => setPreviewChainage(Number(e.target.value))}>
                  {stations.map(ch => <option key={ch} value={ch}>{formatCanalReachChainage(ch)}</option>)}
                </select>
              </label>
              {previewSection && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Active section: {formatCanalReachChainage(previewChainage)}
                </div>
              )}
            </div>

            {previewSection ? (
              <CanalSectionDiagram
                data={diagramData}
                section={previewSection}
                showFoundationExcavation={false}
              />
            ) : (
              <div className="canal-diagram-empty">No populated cross-section is available at this chainage.</div>
            )}
          </div>

          {/* Quantities Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 8 }}>
            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--accent)' }}>Selected drainage quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                {tierSummary.blanketItems.length ? tierSummary.blanketItems.map(item => <span key={item.code}>{item.label}: <strong>{n3(item.quantity)} {item.unit}</strong></span>) : <span>Sand blanket: <strong>0.000</strong></span>}
                <span>Horizontal filter drain: <strong>{n3(tierSummary.filterVolume)} cu.m</strong></span>
                <span>Chimney filter: <strong>{n3(tierSummary.chimneyVolume)} cu.m</strong></span>
                <span>Subsurface toe filter: <strong>{n3(selectedToeFilterQuantity)} {saved.toeFilterKind === '5-7' ? 'cu.m' : 'sq.m'}</strong></span>
              </div>
            </div>

            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>Total Project Bund Drainage Quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                {projectItems.map(item => <span key={`${item.role}:${item.code}`}>{item.label} ({item.code}): <strong>{n3(item.quantity)} {item.unit}</strong></span>)}
                <span>Toe filter (IRR-CAW-5-7): <strong>{n3(grandToeSummary.toeFilterGradedVolume)} cu.m</strong></span>
                <span>Toe filter (IRR-CAW-5-12): <strong>{n3(grandToeSummary.toeFilterFabric200Area)} sq.m</strong></span>
                <span>Toe filter (IRR-CAW-5-13): <strong>{n3(grandToeSummary.toeFilterFabric250Area)} sq.m</strong></span>
              </div>
            </div>
          </div>
  </div>
}

export default function CanalFoundationFilling({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [selectedId, setSelectedId] = useState('')
  const config = data.design.bankConfig
  const mode = canalDrainageMode(data)
  const tiers = useMemo(() => canalDrainageTiers(data, side), [data, side])
  const ranges = useMemo(() => canalDrainageWorkRanges(data, side), [data, side])
  const manual = useMemo(() => canalManualDrainageReaches(data, side), [data, side])
  const selectedTier = tiers.find(t => t.id === selectedId) ?? tiers[0]
  const selectedManual = manual.find(r => r.id === selectedId) ?? manual[0]
  const editorRange = selectedManual
  const editorRanges = useMemo(() => mode === 'programmatic'
    ? ranges.filter(r => r.tierId === selectedTier?.id)
    : editorRange ? [editorRange] : [], [mode, ranges, selectedTier?.id, editorRange])
  const projectItems = useMemo(() => canalTierFoundationItems(data), [data])
  const grandToeSummary = useMemo(() => canalTierToeProtectionQuantities(data), [data])
  return <section className="canal-chapter canal-bank-protection">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Bund Drainage &amp; Filters</span><h2>Bund Drainage &amp; Filters</h2><p>Design mode and chainage assignments follow Bank Design.</p></div></header>
    <div className="canal-protection-context"><strong>{mode === 'programmatic' ? 'Programmatic design' : 'Manual reach design'}</strong> · Follows Bank Design. {mode === 'programmatic' ? 'Save one set of drainage and filter settings for all reaches of each design type.' : 'Configure the same manual reaches created in Bank Design. Edit their chainages in Bank Design.'}</div>
    <div className="canal-protection-context">{config?.linkSymmetrical ? 'Linked banks · the same choices apply to both banks.' : 'Independent banks · configure each bank separately.'}</div>
    {!config?.linkSymmetrical && <div className="canal-bank-side-pills"><button type="button" aria-pressed={side === 'left'} onClick={() => { setSide('left'); setSelectedId('') }}>Left bank</button><button type="button" aria-pressed={side === 'right'} onClick={() => { setSide('right'); setSelectedId('') }}>Right bank</button></div>}
    {mode === 'programmatic' ? <>
      <div className="canal-protection-reach-cards" aria-label="Drainage height tiers">{tiers.map(tier => {
        const assigned = ranges.filter(r => r.tierId === tier.id)
        return <button key={tier.id} type="button" className={`canal-tier-bracket-chip ${selectedTier?.id === tier.id ? 'selected' : ''}`} aria-pressed={selectedTier?.id === tier.id} onClick={() => setSelectedId(tier.id)}><strong>{tier.name}</strong><span>{n3(tier.minFillHeight)} m – {tier.maxFillHeight >= 9999 ? 'Max (∞)' : `${n3(tier.maxFillHeight)} m`}</span><small>{assigned.length} {assigned.length === 1 ? 'reach' : 'reaches'} · {n3(assigned.reduce((sum, r) => sum + r.to - r.from, 0))} m</small><small>{getReachBadgeText(canalDrainageTierTreatment(data, side, tier.id))}</small>{assigned.map(r => <small key={r.id}>{bankReachLabel(r)}</small>)}{!assigned.length && <small>No reaches in this tier.</small>}</button>
      })}</div>
      {selectedTier && <ReachDrainageEditor key={`tier:${config?.linkSymmetrical}:${side}:${selectedTier.id}:${editorRanges.map(r => `${r.from}:${r.to}`).join(',')}`} data={data} activeSide={side} title={selectedTier.name} ranges={editorRanges} saved={canalDrainageTierTreatment(data, side, selectedTier.id)} buildPreview={patch => saveCanalDrainageTier(data, side, selectedTier.id, patch)} projectItems={projectItems} grandToeSummary={grandToeSummary} onSave={patch => { onCommit(current => saveCanalDrainageTier(current, side, selectedTier.id, patch)); return true }}/>}
    </> : <>
      <div className="canal-drainage-reach-toolbar"><strong>{manual.length} manual Bank Design {manual.length === 1 ? 'reach' : 'reaches'}</strong><span>Chainages are managed in Bank Design.</span></div>
      <div className="canal-protection-reach-cards" aria-label="Manual drainage reaches">{manual.map((reach, index) => <button key={reach.id} type="button" className={`canal-tier-bracket-chip ${selectedManual?.id === reach.id ? 'selected' : ''}`} aria-pressed={selectedManual?.id === reach.id} onClick={() => setSelectedId(reach.id)}><strong>Reach {index + 1}</strong><span>{bankReachLabel(reach)}</span><small>Length {n3(reach.to - reach.from)} m</small><small>{getReachBadgeText({ ...defaultCanalTierFoundationConfig(), ...reach.treatment })}</small></button>)}</div>
      {selectedManual ? <ReachDrainageEditor key={`manual:${config?.linkSymmetrical}:${side}:${selectedManual.id}:${selectedManual.from}:${selectedManual.to}`} data={data} activeSide={side} title={bankReachLabel(selectedManual)} ranges={editorRanges} saved={{ ...defaultCanalTierFoundationConfig(), ...selectedManual.treatment }} buildPreview={patch => saveCanalBankDrainageReach(data, side, selectedManual.id, patch)} onSave={patch => { onCommit(current => saveCanalBankDrainageReach(current, side, selectedManual.id, patch)); return true }} projectItems={projectItems} grandToeSummary={grandToeSummary}/> : <p className="canal-protection-pending">Create manual reaches in Bank Design to configure their sand blankets and filters here.</p>}
    </>}
  </section>
}
