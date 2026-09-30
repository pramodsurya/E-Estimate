import { useState } from 'react'
import { Layers, Shield, Sparkles, Check, ChevronRight, Droplets } from 'lucide-react'
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
  canalTierToeProtectionQuantities,
  orderedCanalSections
} from '../../../../lib/canal'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import SsrCode from '../../../templates/SsrCode'
import { Details as ToeFilterDetails, ToeFilterSketch } from './CanalFiltersDrains'

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
  if (f.blanket !== 'none') parts.push(f.blanket === '5-4' ? '25cm Blanket' : 'Var Blanket')
  if (f.horizontalFilter) parts.push('Filter')
  if (f.rockToe) parts.push('Chimney')
  if (f.toeFilter) parts.push('Toe Filter')
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
  const currentTierId = currentTier ? currentTier.id : ''
  const treatment: CanalTierFoundationConfig = {
    ...defaultCanalTierFoundationConfig(),
    ...(currentTier?.foundationTreatment ?? {})
  }

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
    if (s.designPopulated === false) return false
    const leftT = canalSectionBankTier(data, s, 'left')
    const rightT = canalSectionBankTier(data, s, 'right')
    const leftMatches = leftT != null && leftT.id === currentTierId
    const rightMatches = rightT != null && rightT.id === currentTierId
    return isSymmetrical
      ? leftMatches || rightMatches
      : activeSide === 'left' ? leftMatches : rightMatches
  })
  const requestedPreviewSection = sections.find((s) => s.id === selectedSectionId)
  const previewSection = requestedPreviewSection && sectionsInTier.some((section) => section.id === requestedPreviewSection.id)
    ? requestedPreviewSection
    : sectionsInTier[0]

  const tierSummary = canalTierFoundationQuantities(data, currentTier?.id)
  const grandSummary = canalTierFoundationQuantities(data)
  const tierToeSummary = canalTierToeProtectionQuantities(data, currentTier?.id)
  const grandToeSummary = canalTierToeProtectionQuantities(data)
  const selectedToeFilterQuantity = treatment.toeFilterKind === '5-7'
    ? tierToeSummary.toeFilterGradedVolume
    : treatment.toeFilterKind === '5-12'
      ? tierToeSummary.toeFilterFabric200Area
      : tierToeSummary.toeFilterFabric250Area

  return (
    <section className="canal-chapter">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Bund Drainage &amp; Filters</span>
          <h2>Bund Drainage &amp; Filters</h2>
          <p>
            Configure sand blankets and internal drainage filters by bank height tier.
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
          <span>Click a tier to configure its blanket and internal filters</span>
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
              <strong style={{ fontSize: 16 }}>{currentTier.name} Drainage &amp; Filter Settings</strong>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Height range: {currentTier.minFillHeight} m to {currentTier.maxFillHeight < 9000 ? `${currentTier.maxFillHeight} m` : 'top'} · {sectionsInTier.length} sections in this tier
              </div>
            </div>
          </div>

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
                      <span>Starts on the stripped level at the land-side toe and stops at the impervious core/trench where zoned.</span>
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
                      <span>Selected tier toe-filter quantity</span>
                      <SsrCode code={`IRR-CAW-${treatment.toeFilterKind}`} />
                      <strong>{n3(selectedToeFilterQuantity)} {treatment.toeFilterKind === '5-7' ? 'CUM' : 'SQM'}</strong>
                    </div>
                    <ToeFilterDetails kind={treatment.toeFilterKind} quantity={selectedToeFilterQuantity} />
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

          {/* Cross-Section Live Preview */}
          <div className="canal-foundation-section-preview" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <label className="canal-bank-field" style={{ minWidth: 320, maxWidth: 500 }}>
                <span>Cross-section preview</span>
                <select
                  value={previewSection?.id ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {sectionsInTier.map((s, idx) => {
                    const lTier = canalSectionBankTier(data, s, 'left')
                    const rTier = canalSectionBankTier(data, s, 'right')
                    const leftMatches = lTier?.id === currentTierId
                    const rightMatches = rTier?.id === currentTierId
                    const matchingBanks = isSymmetrical
                      ? [leftMatches ? 'L' : '', rightMatches ? 'R' : ''].filter(Boolean).join('+')
                      : activeSide === 'left' ? 'L' : 'R'
                    const matchingFillHeights = isSymmetrical
                      ? [
                          leftMatches ? canalSectionBankFillHeight(data, s, 'left') : null,
                          rightMatches ? canalSectionBankFillHeight(data, s, 'right') : null
                        ].filter((height): height is number => height != null)
                      : [canalSectionBankFillHeight(data, s, activeSide)]
                    const fillLabel = matchingFillHeights.map((height) => n3(height)).join(' / ')
                    return (
                      <option key={s.id} value={s.id}>
                        {idx + 1} · Ch {n3(s.chainage)} m ({matchingBanks} Fill {fillLabel} m · {currentTier.name})
                      </option>
                    )
                  })}
                </select>
              </label>
              {previewSection && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Active section: Ch {n3(previewSection.chainage)} m · {currentTier.name} · Blanket {treatment.blanket === 'none' ? 'not enabled' : `${treatment.blanket === '5-4' ? '0.25' : n3(treatment.blanketThickness)} m`}
                </div>
              )}
            </div>

            {previewSection ? (
              <CanalSectionDiagram
                data={data}
                section={previewSection}
                showFoundationExcavation={false}
              />
            ) : (
              <div className="canal-diagram-empty">No populated cross-section currently matches {currentTier.name}.</div>
            )}
          </div>

          {/* Quantities Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 8 }}>
            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--accent)' }}>{currentTier.name} Quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <span>Sand blanket: <strong>{n3(tierSummary.blanketQuantity)} {tierSummary.blanketUnit}</strong></span>
                <span>Horizontal filter drain: <strong>{n3(tierSummary.filterVolume)} cu.m</strong></span>
                <span>Chimney filter: <strong>{n3(tierSummary.chimneyVolume)} cu.m</strong></span>
                <span>Subsurface toe filter: <strong>{n3(selectedToeFilterQuantity)} {treatment.toeFilterKind === '5-7' ? 'cu.m' : 'sq.m'}</strong></span>
              </div>
            </div>

            <div className="canal-earthwork-summary" style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 8, background: 'var(--surface-2)' }}>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>Total Project Bund Drainage Quantities</strong>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                <span>Sand blanket ({grandSummary.blanketCode}): <strong>{n3(grandSummary.blanketQuantity)} {grandSummary.blanketUnit}</strong></span>
                <span>Horizontal filter drain (IRR-CAW-5-7): <strong>{n3(grandSummary.filterVolume)} cu.m</strong></span>
                <span>Chimney filter (IRR-CAW-5-10): <strong>{n3(grandSummary.chimneyVolume)} cu.m</strong></span>
                <span>Toe filter (IRR-CAW-5-7): <strong>{n3(grandToeSummary.toeFilterGradedVolume)} cu.m</strong></span>
                <span>Toe filter (IRR-CAW-5-12): <strong>{n3(grandToeSummary.toeFilterFabric200Area)} sq.m</strong></span>
                <span>Toe filter (IRR-CAW-5-13): <strong>{n3(grandToeSummary.toeFilterFabric250Area)} sq.m</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
