import { useState } from 'react'
import { Layers, Shield, Sparkles, Check, ChevronRight } from 'lucide-react'
import type {
  CanalData,
  CanalBankTier,
  CanalBankDesignConfig,
  CanalTierFoundationConfig
} from '../../../../types/project'
import {
  defaultCanalBankDesignConfig,
  defaultCanalTierFoundationConfig,
  canalSectionBankTier,
  canalSectionBankFillHeight,
  canalTierFoundationQuantities,
  orderedCanalSections
} from '../../../../lib/canal'
import CanalSectionDiagram from '../../CanalSectionDiagram'

const FOUNDATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '5-1', label: 'Rubble-and-sand foundation filling (IRR-CAW-5-1)' },
  { value: '5-2', label: 'Sand filling below foundations (IRR-CAW-5-2)' },
  { value: '5-3', label: 'Rubble-and-murum foundation filling (IRR-CAW-5-3)' }
] as const

const BLANKET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '5-4', label: '25 cm sand blanket below embankment (IRR-CAW-5-4)' },
  { value: '5-5', label: 'Variable-thickness sand blanket below embankment (IRR-CAW-5-5)' }
] as const

const n3 = (v: number | undefined | null): string =>
  (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

function getTierBadgeText(tier: CanalBankTier): string {
  const f = tier.foundationTreatment
  if (!f) return 'No works'
  const parts: string[] = []
  if (f.foundation !== 'none') parts.push(`Fill ${f.foundation}`)
  if (f.blanket !== 'none') parts.push(f.blanket === '5-4' ? '25cm Blanket' : 'Var Blanket')
  if (f.horizontalFilter) parts.push('Filter')
  if (f.rockToe) parts.push('Chimney')
  return parts.length ? parts.join(' · ') : 'No works'
}

export default function CanalFoundationFilling({
  data,
  onCommit
}: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left')
  const [selectedTierId, setSelectedTierId] = useState<string>('')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')

  const bankConfig: CanalBankDesignConfig = data.design.bankConfig ?? defaultCanalBankDesignConfig(data.mode)
  const isSymmetrical = bankConfig.linkSymmetrical
  const activeTiers: CanalBankTier[] = isSymmetrical
    ? (bankConfig.leftTiers ?? [])
    : (activeSide === 'left' ? (bankConfig.leftTiers ?? []) : (bankConfig.rightTiers ?? []))

  const sortedTiers = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  const currentTier = sortedTiers.find((t) => t.id === selectedTierId) ?? sortedTiers[0]
  const treatment: CanalTierFoundationConfig = currentTier?.foundationTreatment ?? defaultCanalTierFoundationConfig()

  const patchTreatment = (patch: Partial<CanalTierFoundationConfig>): void => {
    if (!currentTier) return
    const updated: CanalTierFoundationConfig = { ...treatment, ...patch }
    onCommit((current) => {
      const cfg = current.design.bankConfig ?? defaultCanalBankDesignConfig(current.mode)
      const updateList = (tiers: CanalBankTier[]): CanalBankTier[] =>
        tiers.map((t) => (t.id === currentTier.id ? { ...t, foundationTreatment: updated } : t))
      const isSym = cfg.linkSymmetrical
      const newLeftTiers = (isSym || activeSide === 'left') ? updateList(cfg.leftTiers ?? []) : (cfg.leftTiers ?? [])
      const newRightTiers = (isSym || activeSide === 'right') ? updateList(cfg.rightTiers ?? []) : (cfg.rightTiers ?? [])

      return {
        ...current,
        design: {
          ...current.design,
          bankConfig: {
            ...cfg,
            leftTiers: newLeftTiers,
            rightTiers: newRightTiers
          }
        }
      }
    })
  }

  const sections = orderedCanalSections(data)
  const sectionsInTier = sections.filter((s) => {
    const leftT = canalSectionBankTier(data, s, 'left')
    const rightT = canalSectionBankTier(data, s, 'right')
    return leftT?.id === currentTier?.id || rightT?.id === currentTier?.id
  })
  const previewSection = sections.find((s) => s.id === selectedSectionId) ?? sectionsInTier[0] ?? sections[0]

  const tierSummary = canalTierFoundationQuantities(data, currentTier?.id)
  const grandSummary = canalTierFoundationQuantities(data)

  return (
    <section className="canal-chapter">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Bund Foundation &amp; Filters</span>
          <h2>Bund Foundation &amp; Filters</h2>
          <p>
            Configure bund foundation filling, sand blanket, and drainage filters by bank height tier.
            Works apply automatically to cross-sections matching each tier bracket.
          </p>
        </div>
      </header>

      {/* Symmetrical vs Left/Right Selector (if asymmetrical) */}
      {!isSymmetrical && (
        <div className="canal-bank-side-pills" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`canal-tier-zoning-pill ${activeSide === 'left' ? 'active-zoned' : ''}`}
            onClick={() => setActiveSide('left')}
          >
            Left Bund Tiers
          </button>
          <button
            type="button"
            className={`canal-tier-zoning-pill ${activeSide === 'right' ? 'active-zoned' : ''}`}
            onClick={() => setActiveSide('right')}
          >
            Right Bund Tiers
          </button>
        </div>
      )}

      {/* Height Tier Continuum / Selector */}
      <div className="canal-tier-continuum" style={{ marginBottom: 16 }}>
        <div className="canal-tier-continuum-header">
          <strong>Bank Height Tiers</strong>
          <span>Click a tier to configure its foundation treatment and filters</span>
        </div>
        <div className="canal-tier-bracket-track">
          {sortedTiers.map((tier) => {
            const isSelected = tier.id === (currentTier?.id ?? '')
            const badge = getTierBadgeText(tier)
            const hasWorks = badge !== 'No works'
            return (
              <button
                key={tier.id}
                type="button"
                className={`canal-tier-bracket-chip ${tier.sectionType === 'zoned' ? 'is-zoned' : 'is-homogeneous'} ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedTierId(tier.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{tier.name}</strong>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: hasWorks ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      color: hasWorks ? '#4ade80' : 'var(--text-dim)'
                    }}
                  >
                    {badge}
                  </span>
                </div>
                <small>
                  {tier.minFillHeight} m → {tier.maxFillHeight < 9000 ? `${tier.maxFillHeight} m` : 'above'}
                </small>
              </button>
            )
          })}
        </div>
      </div>

      {currentTier && (
        <div className="canal-earthwork-card" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <div>
              <strong style={{ fontSize: 16 }}>{currentTier.name} Foundation &amp; Filter Settings</strong>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Height range: {currentTier.minFillHeight} m to {currentTier.maxFillHeight < 9000 ? `${currentTier.maxFillHeight} m` : 'top'} · {sectionsInTier.length} sections in this tier
              </div>
            </div>
          </div>

          <div className="canal-foundation-work-groups">
            {/* 1. Foundation Filling Card */}
            <section className="canal-foundation-work-group group-foundation">
              <strong>1. Foundation Filling</strong>
              <small>Replaces excavated void beneath bund footprint with firm fill material.</small>
              <label className="canal-bank-field">
                <span>Selection</span>
                <select
                  value={treatment.foundation}
                  onChange={(e) => patchTreatment({ foundation: e.target.value as CanalTierFoundationConfig['foundation'] })}
                >
                  {FOUNDATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {treatment.foundation !== 'none' && (
                <>
                  <label className="canal-bank-field">
                    <span>Foundation filling (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={treatment.foundationPercentage}
                      onChange={(e) => patchTreatment({ foundationPercentage: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    />
                  </label>
                  <div className="canal-foundation-rule">
                    <strong>Bund footprint void replacement</strong>
                    <span>{treatment.foundationPercentage}% of foundation excavation depth below the bund footprint.</span>
                  </div>
                </>
              )}
            </section>

            {/* 2. Sand Blanket Card */}
            <section className="canal-foundation-work-group group-blanket">
              <strong>2. Sand Blanket</strong>
              <small>Horizontal drainage blanket placed across the stripped bund foundation plane.</small>
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
                      <option value="automatic">Automatic — full valid bund foundation width</option>
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
                      <span>Follows outer toe to canal bed boundary under each bund.</span>
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

            {/* 3. Filters Card */}
            <section className="canal-foundation-work-group group-rocktoe">
              <strong>3. Drainage Filters</strong>
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
                      <span>Outer toe to impervious-hearting toe (zoned) or half bund foundation width (homogeneous).</span>
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
            </section>
          </div>

          {/* Cross-Section Live Preview */}
          <div className="canal-foundation-section-preview" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <label className="canal-bank-field" style={{ minWidth: 320, maxWidth: 500 }}>
                <span>Cross-section preview</span>
                <select
                  value={previewSection?.id ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {sections.map((s, idx) => {
                    const lTier = canalSectionBankTier(data, s, 'left')
                    const rTier = canalSectionBankTier(data, s, 'right')
                    const fillH = canalSectionBankFillHeight(data, s, 'left')
                    const inThis = lTier?.id === currentTier.id || rTier?.id === currentTier.id
                    return (
                      <option key={s.id} value={s.id}>
                        {idx + 1} · Ch {n3(s.chainage)} m (Fill {n3(fillH)}m · {lTier?.name ?? 'Tier'}) {inThis ? '★' : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
              {previewSection && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Active section: Ch {n3(previewSection.chainage)} m · Left Fill: {n3(canalSectionBankFillHeight(data, previewSection, 'left'))} m
                </div>
              )}
            </div>

            {previewSection ? (
              <CanalSectionDiagram
                data={data}
                section={previewSection}
                showFoundationExcavation
                resolveSavedFoundationWorks
              />
            ) : (
              <div className="canal-diagram-empty">No cross-sections found. Add sections in Chapter 4.</div>
            )}
          </div>

          {/* Quantities Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 8 }}>
            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--accent)' }}>{currentTier.name} Quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <span>Foundation filling: <strong>{n3(tierSummary.foundationVolume)} cu.m</strong></span>
                <span>Sand blanket: <strong>{n3(tierSummary.blanketQuantity)} {tierSummary.blanketUnit}</strong></span>
                <span>Horizontal filter drain: <strong>{n3(tierSummary.filterVolume)} cu.m</strong></span>
                <span>Chimney filter: <strong>{n3(tierSummary.chimneyVolume)} cu.m</strong></span>
              </div>
            </div>

            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>Total Project Bund Foundation Quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <span>Foundation filling ({grandSummary.foundationCode}): <strong>{n3(grandSummary.foundationVolume)} cu.m</strong></span>
                <span>Sand blanket ({grandSummary.blanketCode}): <strong>{n3(grandSummary.blanketQuantity)} {grandSummary.blanketUnit}</strong></span>
                <span>Horizontal filter drain (IRR-CAW-5-7): <strong>{n3(grandSummary.filterVolume)} cu.m</strong></span>
                <span>Chimney filter (IRR-CAW-5-10): <strong>{n3(grandSummary.chimneyVolume)} cu.m</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
