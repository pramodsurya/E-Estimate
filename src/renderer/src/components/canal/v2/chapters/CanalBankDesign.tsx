import { useState } from 'react'
import { Plus, Trash2, Sparkles, Layers, Link2, Unlink, Shield, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react'
import type {
  CanalBankMaterialAllocation,
  CanalBankMaterialSource,
  CanalBankMaterialZone,
  CanalBerm,
  CanalData,
  CanalDesign,
  CanalSection,
  CanalBankTier,
  CanalBankBermStep,
  CanalBankDesignConfig
} from '../../../../types/project'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import { newId } from '../../../../lib/tree'
import {
  CANAL_BANK_ITEM_OPTIONS,
  canalBankItemForAllocation,
  canalEffectiveBankAllocations,
  canalBankRepairItems,
  canalBankVolumeTotals,
  canalEarthworkTotals,
  canalSuitableBankExcavation,
  recommendedCanalCrestWidth,
  defaultCanalBankDesignConfig,
  selectCanalBankTier,
  canalBedLevelAt,
  canalSectionDepth,
  canalGroundProfileBetweenToes
} from '../../../../lib/canal'

function NumberField({
  label,
  value,
  unit,
  min = 0,
  step = 'any',
  onChange
}: {
  label: string
  value: number
  unit?: string
  min?: number
  step?: number | string
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <label className="canal-bank-field">
      <span>{label}{unit ? ` (${unit})` : ''}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
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

export default function CanalBankDesign({
  data,
  sections,
  onCommit
}: {
  data: CanalData
  sections: CanalSection[]
  onCommit: (patch: Partial<CanalDesign>) => void
}): JSX.Element {
  const { design } = data
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [selectedTierId, setSelectedTierId] = useState<string>('')

  const bankConfig: CanalBankDesignConfig = design.bankConfig ?? defaultCanalBankDesignConfig(data.mode)
  const mode = bankConfig.mode
  const isTiered = mode === 'tiered'
  const linkSymmetrical = bankConfig.linkSymmetrical
  const activeTiers = linkSymmetrical
    ? (bankConfig.leftTiers ?? [])
    : (activeSide === 'left' ? (bankConfig.leftTiers ?? []) : (bankConfig.rightTiers ?? []))

  const sortedTiers = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  const currentTier = sortedTiers.find((t) => t.id === selectedTierId) ?? sortedTiers[0]
  const currentTierIdx = sortedTiers.findIndex((t) => t.id === currentTier?.id)

  const patchBankConfig = (patch: Partial<CanalBankDesignConfig>): void => {
    onCommit({
      bankConfig: { ...bankConfig, ...patch }
    })
  }

  // Tier operations
  const updateTiers = (newTiers: CanalBankTier[]): void => {
    if (linkSymmetrical) {
      patchBankConfig({ leftTiers: newTiers, rightTiers: newTiers })
    } else if (activeSide === 'left') {
      patchBankConfig({ leftTiers: newTiers })
    } else {
      patchBankConfig({ rightTiers: newTiers })
    }
  }

  const patchTier = (id: string, patch: Partial<CanalBankTier>): void => {
    const updated = activeTiers.map((t) => (t.id === id ? { ...t, ...patch } : t))
    updateTiers(updated)
  }

  const patchTierMaxHeight = (index: number, newMax: number): void => {
    const sorted = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
    if (index < 0 || index >= sorted.length) return
    const current = sorted[index]
    const val = Math.max(current.minFillHeight + 0.5, Number(newMax) || current.minFillHeight + 1.0)
    current.maxFillHeight = val
    if (index + 1 < sorted.length) {
      sorted[index + 1].minFillHeight = val
    }
    updateTiers(sorted)
  }

  const addTier = (): void => {
    const sorted = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
    const last = sorted[sorted.length - 1]
    const nextMin = last ? (last.maxFillHeight === 9999 ? last.minFillHeight + 3.0 : last.maxFillHeight) : 0
    if (last && last.maxFillHeight === 9999) {
      last.maxFillHeight = nextMin
    }
    const newTierId = `tier-${Date.now()}`
    const newTier: CanalBankTier = {
      id: newTierId,
      name: `Bund Tier ${sorted.length + 1}`,
      minFillHeight: nextMin,
      maxFillHeight: 9999,
      crestWidth: Math.max(3.0, (last?.crestWidth ?? 2.0) + 1.0),
      sectionType: 'homogeneous',
      baseSlope: last?.baseSlope ?? 1.5,
      berms: [
        {
          id: `berm-${Date.now()}-1`,
          dropHeight: 3.0,
          shelfWidth: 2.0,
          slopeAfterBerm: 2.0
        }
      ],
      heartingTopWidth: 1.5,
      heartingSideSlope: 1.0
    }
    updateTiers([...sorted, newTier])
    setSelectedTierId(newTierId)
  }

  const removeTier = (id: string): void => {
    if (activeTiers.length <= 1) return
    const sorted = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
    const idx = sorted.findIndex((t) => t.id === id)
    if (idx < 0) return
    let nextSelectedId = ''
    if (idx === 0 && sorted.length > 1) {
      sorted[1].minFillHeight = 0
      nextSelectedId = sorted[1].id
    } else if (idx === sorted.length - 1 && sorted.length > 1) {
      sorted[idx - 1].maxFillHeight = 9999
      nextSelectedId = sorted[idx - 1].id
    } else if (idx > 0 && idx < sorted.length - 1) {
      sorted[idx - 1].maxFillHeight = sorted[idx + 1].minFillHeight
      nextSelectedId = sorted[idx - 1].id
    }
    if (nextSelectedId) {
      setSelectedTierId(nextSelectedId)
    }
    updateTiers(sorted.filter((t) => t.id !== id))
  }

  const addBermToTier = (tierId: string): void => {
    const tier = activeTiers.find((t) => t.id === tierId)
    if (!tier) return
    const berms = tier.berms ?? []
    const lastBerm = berms[berms.length - 1]
    const newBerm: CanalBankBermStep = {
      id: `tier-berm-${Date.now()}`,
      dropHeight: 3.0,
      shelfWidth: 2.0,
      slopeAfterBerm: lastBerm ? Math.min(3.0, lastBerm.slopeAfterBerm + 0.5) : Math.min(3.0, tier.baseSlope + 0.5)
    }
    patchTier(tierId, { berms: [...berms, newBerm] })
  }

  const patchBermInTier = (tierId: string, bermId: string, patch: Partial<CanalBankBermStep>): void => {
    const tier = activeTiers.find((t) => t.id === tierId)
    if (!tier) return
    const berms = (tier.berms ?? []).map((b) => (b.id === bermId ? { ...b, ...patch } : b))
    patchTier(tierId, { berms })
  }

  const removeBermFromTier = (tierId: string, bermId: string): void => {
    const tier = activeTiers.find((t) => t.id === tierId)
    if (!tier) return
    const berms = (tier.berms ?? []).filter((b) => b.id !== bermId)
    patchTier(tierId, { berms })
  }

  // Legacy variables
  const zoned = design.bankSectionType === 'zoned'
  const recommended = recommendedCanalCrestWidth(design.discharge)
  const earthwork = canalEarthworkTotals(data)
  const bankVolumes = canalBankVolumeTotals(data)
  const suitableExcavation = canalSuitableBankExcavation(data)

  // Material allocation zones
  const activeZones: CanalBankMaterialZone[] = isTiered
    ? (() => {
        const anyZoned = (bankConfig.leftTiers ?? []).some((t) => t.sectionType === 'zoned') ||
          (!linkSymmetrical && (bankConfig.rightTiers ?? []).some((t) => t.sectionType === 'zoned'))
        const anyHomo = (bankConfig.leftTiers ?? []).some((t) => t.sectionType === 'homogeneous') ||
          (!linkSymmetrical && (bankConfig.rightTiers ?? []).some((t) => t.sectionType === 'homogeneous'))
        const zones: CanalBankMaterialZone[] = []
        if (anyHomo || bankVolumes.homogeneous > 0) zones.push('homogeneous')
        if (anyZoned || bankVolumes.hearting > 0 || bankVolumes.casing > 0) zones.push('hearting', 'casing')
        return zones.length > 0 ? zones : ['homogeneous']
      })()
    : zoned ? ['hearting', 'casing'] : ['homogeneous']

  const allocations = design.bankMaterialAllocations ?? []
  const zoneVolume = (zone: CanalBankMaterialZone): number => bankVolumes[zone]
  const effectiveRows = activeZones.flatMap((zone) => canalEffectiveBankAllocations(data, zone))
  const excavationAssignedTotal = effectiveRows
    .filter((row) => row.source === 'canal-excavation')
    .reduce((sum, row) => sum + (zoneVolume(row.zone) * row.percentage) / 100, 0)

  const patchAllocation = (id: string, patch: Partial<CanalBankMaterialAllocation>): void =>
    onCommit({
      bankMaterialAllocations: allocations.map((row) => (row.id === id ? compatibleAllocation({ ...row, ...patch }) : row))
    })

  const addAllocation = (zone: CanalBankMaterialZone): void => {
    const source = availableSources(zone)[0] ?? 'borrow-area'
    onCommit({
      bankMaterialAllocations: [
        ...allocations,
        compatibleAllocation({ id: `bank-source-${newId()}`, zone, source, percentage: 0, compaction: 95, watering: true })
      ]
    })
  }

  const removeAllocation = (id: string): void =>
    onCommit({ bankMaterialAllocations: allocations.filter((row) => row.id !== id) })

  // Legacy reaches & berms
  const reaches = design.zonedReaches ?? []
  const addReach = (): void => {
    const from = sections[0]?.chainage ?? 0
    const to = sections[sections.length - 1]?.chainage ?? from
    onCommit({ zonedReaches: [...reaches, { id: `zoned-${Date.now()}`, fromChainage: from, toChainage: to }] })
  }
  const patchReach = (id: string, patch: Partial<{ fromChainage: number; toChainage: number }>): void =>
    onCommit({ zonedReaches: reaches.map((reach) => (reach.id === id ? { ...reach, ...patch } : reach)) })

  const berms = design.berms ?? []
  const addBerm = (face: 'left-outer' | 'right-outer'): void => {
    onCommit({
      berms: [
        ...berms,
        {
          id: `bank-berm-${newId()}`,
          face,
          heightAboveBed: Math.min(design.fullSupplyDepth, Math.max(0.1, design.fullSupplyDepth + design.freeBoard - 0.1)),
          width: 3
        }
      ]
    })
  }
  const patchBerm = (id: string, patch: Partial<CanalBerm>): void => {
    onCommit({ berms: berms.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  }
  const removeBerm = (id: string): void => {
    onCommit({ berms: berms.filter((b) => b.id !== id) })
  }

  // Cross-section diagram preview (filtered to filling sections)
  const fillingSections = sections.filter((s) => {
    const bed = canalBedLevelAt(data, s.chainage) ?? design.bedLevelAtStart
    const tbl = bed + canalSectionDepth(design)
    const groundRls = (s.ground ?? []).map((p) => p.rl)
    const minGround = groundRls.length > 0 ? Math.min(...groundRls) : bed
    return tbl - minGround > 0.05
  })
  const availablePreviewSections = fillingSections.length > 0 ? fillingSections : sections
  const selectedSection = availablePreviewSections.find((s) => s.id === selectedSectionId) ?? availablePreviewSections[0]

  const previewSection = (() => {
    if (!selectedSection) return null
    const points = selectedSection.ground ?? []
    if (points.length < 2) return selectedSection
    const leftRl = selectedSection.leftToeRl ?? points[0].rl
    const rightRl = selectedSection.rightToeRl ?? points[points.length - 1].rl
    if (points.length === 2 || selectedSection.groundEntryMode) {
      const expandedGround = canalGroundProfileBetweenToes(data, selectedSection, leftRl, rightRl)
      return { ...selectedSection, ground: expandedGround }
    }
    return selectedSection
  })()

  const previewBed = previewSection ? (canalBedLevelAt(data, previewSection.chainage) ?? design.bedLevelAtStart) : 0
  const previewTbl = previewBed + canalSectionDepth(design)
  const previewGroundPoints = previewSection?.ground ?? []
  const previewLeftGround = previewGroundPoints[0]?.rl ?? previewBed
  const previewRightGround = previewGroundPoints[previewGroundPoints.length - 1]?.rl ?? previewBed
  const leftFillH = Math.max(0, previewTbl - previewLeftGround)
  const rightFillH = Math.max(0, previewTbl - previewRightGround)
  const matchedLeftTier = selectCanalBankTier(bankConfig, 'left', leftFillH)
  const matchedRightTier = selectCanalBankTier(bankConfig, 'right', rightFillH)

  return (
    <section className="canal-chapter canal-bank-chapter">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Chapter 2</span>
          <h2>Canal Bank / Bund Design</h2>
          <p className="settings-note">
            Programmatic embankment geometry, height brackets, outer berm shelves, and impervious zoned construction rules.
          </p>
        </div>
      </header>

      {/* PRIMARY MODE SELECTOR */}
      <div className="canal-bank-mode-tabs">
        <button
          type="button"
          className={`canal-bank-mode-tab ${isTiered ? 'active' : ''}`}
          onClick={() => patchBankConfig({ mode: 'tiered' })}
        >
          <Sparkles size={16} />
          <div className="canal-bank-tab-text">
            <strong>
              ⚡ Programmatic Height-Tiered Design
              <span className="canal-tier-badge" style={{ marginLeft: 6 }}>Recommended</span>
            </strong>
            <small>
              Embankment geometry, crests, berm shelves, and impervious core automatically adapt to fill height ($H$).
            </small>
          </div>
        </button>

        <button
          type="button"
          className={`canal-bank-mode-tab ${!isTiered ? 'active' : ''}`}
          onClick={() => patchBankConfig({ mode: 'legacy' })}
        >
          <Layers size={16} />
          <div className="canal-bank-tab-text">
            <strong>Fixed Slope &amp; Manual Berms (Standard)</strong>
            <small>Constant outer slope with manual berm elevations referenced to canal bed level.</small>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* OPTION A: PROGRAMMATIC HEIGHT-TIERED BUND DESIGN                          */}
      {/* ========================================================================= */}
      {isTiered && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title">
            Height-Tiered Bund Configuration
            <small>
              Rules descend from Bank Top to natural ground. Each tier defines crest width, upper slope, berm shelves, and zoning.
            </small>
          </div>

          {/* Top Controls: Symmetry Link + Safeguards */}
          <div className="canal-bank-top-controls">
            <div className="canal-bank-link-toggle">
              <button
                type="button"
                className={`canal-bank-link-btn ${linkSymmetrical ? 'active' : ''}`}
                onClick={() => patchBankConfig({ linkSymmetrical: !linkSymmetrical })}
              >
                {linkSymmetrical ? <Link2 size={14} /> : <Unlink size={14} />}
                <span>{linkSymmetrical ? 'Linked Symmetrical Banks' : 'Independent Left / Right Banks'}</span>
              </button>
              <small style={{ color: 'var(--text-dim)' }}>
                {linkSymmetrical ? 'Left and right banks use identical tiers' : 'Configure different rules for left & right banks'}
              </small>
            </div>

            <div className="canal-bank-safeguards">
              <label className="canal-bank-safeguard-item" title="Omit berm shelves when remaining vertical distance to ground is less than this threshold.">
                <Shield size={14} style={{ color: 'var(--accent)' }} />
                <span>Min Ground Clearance:</span>
                <input
                  type="number"
                  min={0.2}
                  step={0.1}
                  value={bankConfig.minClearanceToGround}
                  onChange={(e) => patchBankConfig({ minClearanceToGround: Math.max(0.2, Number(e.target.value) || 1.0) })}
                />
                <b>m</b>
              </label>

              <label className="canal-bank-safeguard-item" title="Minimum fill height required to construct hearting core; below this, casing fills 100%.">
                <Shield size={14} style={{ color: '#3b82f6' }} />
                <span>Min Hearting Height:</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={design.minimumHeartingHeight}
                  onChange={(e) => onCommit({ minimumHeartingHeight: Math.max(0.5, Number(e.target.value) || 1.0) })}
                />
                <b>m</b>
              </label>
            </div>
          </div>

          {/* Bank Side Switcher when Unlinked */}
          {!linkSymmetrical && (
            <div className="canal-bank-side-tabs">
              <button
                type="button"
                className={`canal-bank-side-tab ${activeSide === 'left' ? 'active' : ''}`}
                onClick={() => { setActiveSide('left'); setSelectedTierId('') }}
              >
                Left Bank Tiers ({(bankConfig.leftTiers ?? []).length})
              </button>
              <button
                type="button"
                className={`canal-bank-side-tab ${activeSide === 'right' ? 'active' : ''}`}
                onClick={() => { setActiveSide('right'); setSelectedTierId('') }}
              >
                Right Bank Tiers ({(bankConfig.rightTiers ?? []).length})
              </button>
            </div>
          )}

          {/* Continuous Height Bracket Continuum Bar */}
          <div className="canal-tier-continuum">
            <div className="canal-tier-continuum-header">
              <span>Continuous Fill-Height Bracket Scale</span>
              <button type="button" className="btn ghost" onClick={addTier}>
                <Plus size={13} /> Add Height Tier
              </button>
            </div>

            <div className="canal-tier-bracket-track">
              {sortedTiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  className={`canal-tier-bracket-chip ${tier.sectionType === 'zoned' ? 'is-zoned' : 'is-homogeneous'} ${tier.id === currentTier?.id ? 'selected' : ''}`}
                  title={`${tier.name}: ${tier.minFillHeight.toFixed(1)} m to ${tier.maxFillHeight === 9999 ? '∞' : `${tier.maxFillHeight.toFixed(1)} m`} fill height — click to edit`}
                  onClick={() => setSelectedTierId(tier.id)}
                >
                  <strong>{tier.name}</strong>
                  <small>
                    {tier.minFillHeight.toFixed(1)} m – {tier.maxFillHeight === 9999 ? 'Max (∞)' : `${tier.maxFillHeight.toFixed(1)} m`}
                    {' · '}
                    {tier.sectionType === 'zoned' ? '🛡️ Zoned' : '🌱 Homogeneous'}
                  </small>
                </button>
              ))}
            </div>
          </div>

          {/* Tier pager: one card at a time */}
          {sortedTiers.length > 1 && (
            <div className="canal-tier-pager">
              <button
                type="button"
                className="btn ghost"
                disabled={currentTierIdx <= 0}
                onClick={() => {
                  const prev = sortedTiers[Math.max(0, currentTierIdx - 1)]
                  if (prev) setSelectedTierId(prev.id)
                }}
              >
                <ChevronLeft size={14} /> Prev tier
              </button>
              <span className="canal-tier-pager-label">
                Tier {currentTierIdx + 1} of {sortedTiers.length}
                {currentTier ? ` · ${currentTier.name}` : ''}
              </span>
              <button
                type="button"
                className="btn ghost"
                disabled={currentTierIdx < 0 || currentTierIdx >= sortedTiers.length - 1}
                onClick={() => {
                  const next = sortedTiers[Math.min(sortedTiers.length - 1, currentTierIdx + 1)]
                  if (next) setSelectedTierId(next.id)
                }}
              >
                Next tier <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Single Selected Tier Card */}
          <div className="canal-tier-cards-container">
            {(() => {
              const tier = currentTier
              if (!tier) return <div className="canal-zoned-empty">No tiers configured.</div>
              const tierIdx = Math.max(0, currentTierIdx)
              const isZonedTier = tier.sectionType === 'zoned'
              const isTopTier = tier.maxFillHeight === 9999 || tierIdx === sortedTiers.length - 1
              const bermsList = tier.berms ?? []

              return (
                <div className="canal-tier-card" key={tier.id}>
                  {/* Card Header */}
                  <div className="canal-tier-card-header">
                    <div className="canal-tier-title-group">
                      <span className="canal-tier-badge">Tier {tierIdx + 1}</span>
                      <input
                        type="text"
                        className="canal-tier-name-input"
                        value={tier.name}
                        placeholder="Tier Name (e.g. Medium Bund)"
                        onChange={(e) => patchTier(tier.id, { name: e.target.value })}
                      />
                      <div className="canal-tier-range-controls">
                        <span>Fill Height:</span>
                        <b>{tier.minFillHeight.toFixed(1)} m</b>
                        <span>to</span>
                        {isTopTier ? (
                          <b>Max Fill (Top Tier)</b>
                        ) : (
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              min={tier.minFillHeight + 0.5}
                              step={0.5}
                              value={tier.maxFillHeight}
                              onChange={(e) => patchTierMaxHeight(tierIdx, Number(e.target.value) || tier.minFillHeight + 1.0)}
                            />
                            <b>m</b>
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="canal-tier-actions">
                      <button
                        type="button"
                        className="canal-earthwork-remove"
                        aria-label={`Remove ${tier.name}`}
                        disabled={sortedTiers.length <= 1}
                        onClick={() => removeTier(tier.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="canal-tier-body">
                    {/* Zoning Selection */}
                    <div className="canal-tier-zoning-row">
                      <span className="canal-tier-zoning-label">Embankment Type:</span>
                      <div className="canal-tier-zoning-pills">
                        <button
                          type="button"
                          className={`canal-tier-zoning-pill ${!isZonedTier ? 'active-homo' : ''}`}
                          onClick={() => patchTier(tier.id, { sectionType: 'homogeneous' })}
                        >
                          <Check size={12} style={{ display: !isZonedTier ? 'inline' : 'none' }} />
                          🌱 Homogeneous Fill (Single Soil)
                        </button>
                        <button
                          type="button"
                          className={`canal-tier-zoning-pill ${isZonedTier ? 'active-zoned' : ''}`}
                          onClick={() => patchTier(tier.id, {
                            sectionType: 'zoned',
                            heartingTopWidth: tier.heartingTopWidth ?? design.heartingTopWidth ?? 1.5,
                            heartingSideSlope: tier.heartingSideSlope ?? design.heartingLeftSlope ?? 1.0
                          })}
                        >
                          <Check size={12} style={{ display: isZonedTier ? 'inline' : 'none' }} />
                          🛡️ Impervious Zoned (Hearting Core + Casing)
                        </button>
                      </div>

                      {isZonedTier && (
                        <div className="canal-tier-zoned-params">
                          <NumberField
                            label="Core Top Width"
                            unit="m"
                            value={tier.heartingTopWidth ?? design.heartingTopWidth}
                            min={0.5}
                            step={0.25}
                            onChange={(v) => patchTier(tier.id, { heartingTopWidth: Math.max(0.5, v) })}
                          />
                          <NumberField
                            label="Core Side Slope"
                            unit="H : 1V"
                            value={tier.heartingSideSlope ?? design.heartingLeftSlope}
                            min={0.25}
                            step={0.25}
                            onChange={(v) => patchTier(tier.id, { heartingSideSlope: Math.max(0.25, v) })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Recipe: Crest & Upper Slope */}
                    <div className="canal-tier-recipe-grid">
                      <NumberField
                        label="Crest Width"
                        unit="m"
                        value={tier.crestWidth}
                        min={1.0}
                        step={0.5}
                        onChange={(v) => patchTier(tier.id, { crestWidth: Math.max(1.0, v) })}
                      />
                      <NumberField
                        label="Upper Slope from Crest"
                        unit="H : 1V"
                        value={tier.baseSlope}
                        min={0.5}
                        step={0.25}
                        onChange={(v) => patchTier(tier.id, { baseSlope: Math.max(0.5, v) })}
                      />
                    </div>

                    {/* Outer Berm Shelves (Drop & Flatten sequence) */}
                    <div className="canal-tier-berms-section">
                      <div className="canal-tier-berms-head">
                        <span>
                          Outer Berm Shelves ({bermsList.length})
                          <small style={{ color: 'var(--text-dim)', fontWeight: 'normal' }}>
                            Vertical drop before shelf &amp; subsequent slope
                          </small>
                        </span>
                        <button type="button" className="btn ghost" onClick={() => addBermToTier(tier.id)}>
                          <Plus size={13} /> Add Berm Shelf
                        </button>
                      </div>

                      {bermsList.length === 0 ? (
                        <div className="canal-zoned-empty">
                          No berm shelves in this tier. Outer slope descends continuously at {tier.baseSlope} : 1 to natural ground.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {bermsList.map((step, stepIdx) => (
                            <div className="canal-tier-berm-step-card" key={step.id}>
                              <span className="canal-tier-berm-num">Berm #{stepIdx + 1}</span>
                              <NumberField
                                label="Drop Height"
                                unit="m"
                                value={step.dropHeight}
                                min={0.5}
                                step={0.5}
                                onChange={(v) => patchBermInTier(tier.id, step.id, { dropHeight: Math.max(0.5, v) })}
                              />
                              <NumberField
                                label="Shelf Width"
                                unit="m"
                                value={step.shelfWidth}
                                min={0.5}
                                step={0.5}
                                onChange={(v) => patchBermInTier(tier.id, step.id, { shelfWidth: Math.max(0.5, v) })}
                              />
                              <NumberField
                                label="Slope After Berm"
                                unit="H : 1V"
                                value={step.slopeAfterBerm}
                                min={0.5}
                                step={0.25}
                                onChange={(v) => patchBermInTier(tier.id, step.id, { slopeAfterBerm: Math.max(0.5, v) })}
                              />
                              <button
                                type="button"
                                className="canal-earthwork-remove"
                                aria-label="Remove berm step"
                                onClick={() => removeBermFromTier(tier.id, step.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Visual Flow Representation */}
                      <div className="canal-tier-flow-visual">
                        <span className="canal-tier-flow-node">Bank Top (RL)</span>
                        <span className="canal-tier-flow-arrow">➔</span>
                        <span className="canal-tier-flow-node">Slope {tier.baseSlope} : 1</span>
                        {bermsList.map((b, i) => (
                          <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="canal-tier-flow-arrow">➔</span>
                            <span className="canal-tier-flow-node berm">
                              Berm #{i + 1} (Drop {b.dropHeight}m · Shelf {b.shelfWidth}m)
                            </span>
                            <span className="canal-tier-flow-arrow">➔</span>
                            <span className="canal-tier-flow-node">Slope {b.slopeAfterBerm} : 1</span>
                          </span>
                        ))}
                        <span className="canal-tier-flow-arrow">➔</span>
                        <span className="canal-tier-flow-node">Natural Ground</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="canal-bank-recommendation">
            IS 10430:2000 recommended minimum crest width for design discharge Q {design.discharge} m³/s: <strong>{recommended} m</strong>.
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* OPTION B: LEGACY FIXED-SLOPE BANK DESIGN                                  */}
      {/* ========================================================================= */}
      {!isTiered && (
        <>
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
                <button type="button" className="btn primary" disabled={sections.length === 0} onClick={addReach}>
                  + Add zoned reach
                </button>
              </div>
              {reaches.length === 0 ? (
                <div className="canal-zoned-empty">No zoned reach added. The full canal is still homogeneous.</div>
              ) : (
                <div className="canal-zoned-reach-list">
                  {reaches.map((reach, index) => (
                    <div className="canal-zoned-reach" key={reach.id}>
                      <strong>Reach {index + 1}</strong>
                      <label>
                        <span>From section</span>
                        <select
                          value={reach.fromChainage}
                          onChange={(event) => {
                            const fromChainage = Number(event.target.value)
                            patchReach(reach.id, { fromChainage, ...(fromChainage > reach.toChainage ? { toChainage: fromChainage } : {}) })
                          }}
                        >
                          {sections.map((section, sectionIndex) => (
                            <option key={section.id} value={section.chainage}>
                              {sectionIndex + 1} · Ch {section.chainage} m
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>To section</span>
                        <select
                          value={reach.toChainage}
                          onChange={(event) => {
                            const toChainage = Number(event.target.value)
                            patchReach(reach.id, { toChainage, ...(toChainage < reach.fromChainage ? { fromChainage: toChainage } : {}) })
                          }}
                        >
                          {sections.map((section, sectionIndex) => (
                            <option key={section.id} value={section.chainage}>
                              {sectionIndex + 1} · Ch {section.chainage} m
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="btn ghost" onClick={() => onCommit({ zonedReaches: reaches.filter((item) => item.id !== reach.id) })}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="canal-bank-design">
            <div className="canal-cross-panel-title">Left and right banks<small>Crest and outer-slope geometry.</small></div>
            <div className="canal-bank-design-columns">
              <div className="canal-bank-design-side">
                <h3>Left bank</h3>
                <NumberField label="Crest width" unit="m" value={design.leftBankCrestWidth} onChange={(leftBankCrestWidth) => onCommit({ leftBankCrestWidth })} />
                <NumberField label="Outer slope" unit="H : 1V" value={design.leftBankOuterSlope} onChange={(leftBankOuterSlope) => onCommit({ leftBankOuterSlope })} />
              </div>
              <div className="canal-bank-design-side">
                <h3>Right bank</h3>
                <NumberField label="Crest width" unit="m" value={design.rightBankCrestWidth} onChange={(rightBankCrestWidth) => onCommit({ rightBankCrestWidth })} />
                <NumberField label="Outer slope" unit="H : 1V" value={design.rightBankOuterSlope} onChange={(rightBankOuterSlope) => onCommit({ rightBankOuterSlope })} />
              </div>
            </div>
            <div className="canal-bank-recommendation">IS 10430:2000 recommended minimum crest width for Q {design.discharge} m³/s: <strong>{recommended} m</strong>.</div>
          </section>

          {zoned && (
            <section className="canal-bank-design">
              <div className="canal-cross-panel-title">Impervious hearting<small>The top level is referenced to FSL; applicability and height are checked separately at every section.</small></div>
              <div className="canal-design-grid">
                <label className="canal-bank-field">
                  <span>Hearting top adjustment from FSL (m)</span>
                  <input
                    type="number"
                    step="any"
                    max={Math.max(0, design.freeBoard)}
                    value={design.heartingLevelOffsetFromFsl}
                    onChange={(event) =>
                      onCommit({
                        heartingLevelOffsetFromFsl: Math.min(Number(event.target.value) || 0, Math.max(0, design.freeBoard))
                      })
                    }
                  />
                  <small>Maximum allowed: +{Math.max(0, design.freeBoard).toFixed(2)} m.</small>
                </label>
                <NumberField label="Minimum hearting height" unit="m" value={design.minimumHeartingHeight} onChange={(minimumHeartingHeight) => onCommit({ minimumHeartingHeight })} />
                <NumberField label="Hearting top width" unit="m" value={design.heartingTopWidth} onChange={(heartingTopWidth) => onCommit({ heartingTopWidth })} />
                <NumberField label="Left hearting slope" unit="H : 1V" value={design.heartingLeftSlope} onChange={(heartingLeftSlope) => onCommit({ heartingLeftSlope })} />
                <NumberField label="Right hearting slope" unit="H : 1V" value={design.heartingRightSlope} onChange={(heartingRightSlope) => onCommit({ heartingRightSlope })} />
              </div>
            </section>
          )}

          <section className="canal-bank-design canal-berm-design">
            <div className="canal-cross-panel-title">Outer Bank Berms<small>Berm levels are entered as vertical height above the canal bed.</small></div>
            <div className="canal-berm-columns">
              {([['left-outer', 'Left outer-bank berm'], ['right-outer', 'Right outer-bank berm']] as Array<['left-outer' | 'right-outer', string]>).map(([face, title]) => {
                const faceBerms = berms.filter((berm) => berm.face === face)
                return (
                  <section className="canal-berm-face" key={face}>
                    <header>
                      <strong>{title}</strong>
                      <button type="button" className="btn ghost" onClick={() => addBerm(face)}>
                        <Plus size={13} /> Add berm
                      </button>
                    </header>
                    {faceBerms.length === 0 ? (
                      <small>No berms.</small>
                    ) : (
                      <div className="canal-berm-list">
                        {faceBerms.map((berm, index) => (
                          <div className="canal-berm-row" key={berm.id}>
                            <strong>Berm {index + 1}</strong>
                            <NumberField label="Height above bed" unit="m" value={berm.heightAboveBed} onChange={(heightAboveBed) => patchBerm(berm.id, { heightAboveBed: Math.max(0, heightAboveBed) })} />
                            <NumberField label="Width" unit="m" value={berm.width} onChange={(width) => patchBerm(berm.id, { width: Math.max(0, width) })} />
                            <button type="button" className="canal-earthwork-remove" aria-label={`Remove ${title}`} onClick={() => removeBerm(berm.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </section>
        </>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: BANK CONSTRUCTION SOURCES & SSR ALLOCATIONS                    */}
      {/* ========================================================================= */}
      <section className="canal-earthwork-card">
        <div className="canal-cross-panel-title">
          Bank Material Sourcing &amp; SSR Operations
          <small>
            {data.mode === 'repair'
              ? 'Repair banks bill the PMW repair items below.'
              : 'Allocate material sources for homogeneous formation or impervious zoned (hearting & casing).'}
          </small>
        </div>

        <div className="canal-bank-source-summary">
          <span>Bank Fill Measured <strong>{bankVolumes.totalFill.toLocaleString('en-IN')} cu.m</strong></span>
          {bankVolumes.homogeneous > 0 && <span>Homogeneous <strong>{bankVolumes.homogeneous.toLocaleString('en-IN')} cu.m</strong></span>}
          {bankVolumes.hearting > 0 && <span>Hearting Core <strong>{bankVolumes.hearting.toLocaleString('en-IN')} cu.m</strong></span>}
          {bankVolumes.casing > 0 && <span>Casing Shell <strong>{bankVolumes.casing.toLocaleString('en-IN')} cu.m</strong></span>}
          <span>Suitable Cut Reuse <strong>{suitableExcavation.toLocaleString('en-IN')} cu.m</strong></span>
          <span>Stripping Excluded <strong>{earthwork.stripping.toLocaleString('en-IN')} cu.m</strong></span>
        </div>

        {data.mode === 'repair' &&
          canalBankRepairItems(data)
            .filter((item) => item.quantity > 0)
            .map((item) => (
              <div className="canal-bank-source-row" key={`${item.zone}-${item.code}`}>
                <div className="canal-bank-source-result">
                  <span>{REPAIR_ITEM_LABELS[item.code] ?? item.code} · {ZONE_LABELS[item.zone]}</span>
                  <strong>{item.code}</strong>
                </div>
                <small>{item.quantity.toLocaleString('en-IN')} cu.m billed</small>
              </div>
            ))}

        {data.mode !== 'repair' &&
          activeZones.map((zone) => {
            const rawRows = canalEffectiveBankAllocations(data, zone)
            const rows = isTiered && zone === 'homogeneous' && rawRows.some((r) => r.source === 'borrow-area' && r.percentage === 100) && rawRows.some((r) => r.source === 'canal-excavation' && r.percentage === 0)
              ? rawRows.filter((r) => r.source !== 'canal-excavation')
              : rawRows
            const assignedPct = rows.reduce((sum, row) => sum + row.percentage, 0)
            return (
              <div className="canal-bank-source-zone" key={zone}>
                <div className="canal-bank-source-zone-head">
                  <div>
                    <strong>{ZONE_LABELS[zone]}</strong>
                    <small>
                      {zoneVolume(zone).toLocaleString('en-IN')} cu.m required · {assignedPct}% assigned
                    </small>
                  </div>
                  <button type="button" className="btn ghost" onClick={() => addAllocation(zone)}>
                    <Plus size={14} /> Add source
                  </button>
                </div>
                {rows.length === 0 && <div className="canal-zoned-empty">No source assigned.</div>}
                {rows.map((row) => {
                  const item = canalBankItemForAllocation(row)
                  const sourceOptions = availableSources(zone)
                  return (
                    <div className="canal-bank-source-row" key={row.id}>
                      <label>
                        <span>Material source</span>
                        <select
                          value={row.source}
                          onChange={(event) => patchAllocation(row.id, { source: event.target.value as CanalBankMaterialSource })}
                        >
                          {sourceOptions.map((source) => (
                            <option value={source} key={source}>{SOURCE_LABELS[source]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Share of {ZONE_LABELS[zone].toLowerCase()}</span>
                        <div className="canal-bank-source-percent">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            value={Number(row.percentage.toFixed(3)) || ''}
                            onChange={(event) =>
                              patchAllocation(row.id, {
                                percentage: Math.min(100, Math.max(0, Number(event.target.value) || 0))
                              })
                            }
                          />
                          <b>%</b>
                        </div>
                        <small>
                          {((zoneVolume(zone) * row.percentage) / 100).toLocaleString('en-IN')} cu.m
                        </small>
                      </label>
                      <label>
                        <span>Compaction</span>
                        <select
                          value={row.compaction}
                          onChange={(event) =>
                            patchAllocation(row.id, { compaction: Number(event.target.value) === 98 ? 98 : 95 })
                          }
                        >
                          <option value={95}>Not less than 95%</option>
                          <option value={98}>Not less than 98%</option>
                        </select>
                      </label>
                      <label className="canal-bank-source-water">
                        <input
                          type="checkbox"
                          checked={row.watering}
                          disabled={
                            !CANAL_BANK_ITEM_OPTIONS.some(
                              (option) =>
                                option.zone === zone &&
                                option.source === row.source &&
                                option.compaction === row.compaction &&
                                option.watering === false
                            )
                          }
                          onChange={(event) => patchAllocation(row.id, { watering: event.target.checked })}
                        />
                        <span>Watering included</span>
                      </label>
                      <div className="canal-bank-source-result">
                        <span>Resolved operation</span>
                        <strong>{item?.label ?? 'Choose a compatible combination'}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn ghost icon"
                        aria-label="Remove material source"
                        onClick={() => removeAllocation(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
                {Math.abs(assignedPct - 100) > 0.001 && (
                  <div className="canal-road-warning">
                    Source shares must total 100%. {assignedPct < 100 ? `${100 - assignedPct}% remains unassigned.` : `Allocation exceeds the zone by ${assignedPct - 100}%.`}
                  </div>
                )}
              </div>
            )
          })}
        {data.mode !== 'repair' && excavationAssignedTotal > suitableExcavation + 0.001 && (
          <div className="canal-road-warning">
            Assigned canal-excavation material totals {excavationAssignedTotal.toLocaleString('en-IN')} cu.m, exceeding the {suitableExcavation.toLocaleString('en-IN')} cu.m marked suitable in Earthwork.
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: LIVE CROSS-SECTION DIAGRAM PREVIEW (FILLING SECTIONS)          */}
      {/* ========================================================================= */}
      <section className="canal-earthwork-card">
        <div className="canal-preview-toolbar">
          <div className="canal-cross-panel-title">
            Embankment Cross-Section Diagram Preview
            <small>
              {previewSection
                ? `Showing Ch ${previewSection.chainage} m in embankment (${isTiered ? 'Programmatic Height Tiers' : 'Fixed outer bank design'})`
                : 'Filling sections preview'}
            </small>
          </div>

          {availablePreviewSections.length > 1 && (
            <div className="canal-sim-section-picker">
              <label>
                <span>Select Filling Section:</span>
                <select
                  value={selectedSection?.id ?? ''}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  {availablePreviewSections.map((s) => {
                    const originalIdx = sections.findIndex((item) => item.id === s.id)
                    const bed = canalBedLevelAt(data, s.chainage) ?? design.bedLevelAtStart
                    const tbl = bed + canalSectionDepth(design)
                    const groundRls = (s.ground ?? []).map((p) => p.rl)
                    const minGround = groundRls.length > 0 ? Math.min(...groundRls) : bed
                    const fillH = Math.max(0, tbl - minGround)
                    return (
                      <option key={s.id} value={s.id}>
                        #{originalIdx + 1} · Ch {s.chainage} m (Fill: {fillH.toFixed(2)} m)
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Live Metrics Summary Bar */}
        {previewSection && isTiered && (
          <div className="canal-tier-summary-metrics">
            <div className="canal-tier-metric-item">
              <span>Left Fill ($H$)</span>
              <strong>{leftFillH.toFixed(2)} m</strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>Left Matched Tier</span>
              <strong>
                {matchedLeftTier ? `${matchedLeftTier.name} (${matchedLeftTier.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'})` : 'Standard'}
              </strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>Right Fill ($H$)</span>
              <strong>{rightFillH.toFixed(2)} m</strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>Right Matched Tier</span>
              <strong>
                {matchedRightTier ? `${matchedRightTier.name} (${matchedRightTier.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'})` : 'Standard'}
              </strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>Bank Top Level (TBL)</span>
              <strong>RL {previewTbl.toFixed(2)} m</strong>
            </div>
          </div>
        )}

        {previewSection ? (
          <div className="canal-earthwork-section-view">
            <CanalSectionDiagram data={data} section={previewSection} />
          </div>
        ) : (
          <div className="canal-diagram-empty">
            No embankment / filling sections found. All {sections.length} cross-sections are in excavation.
          </div>
        )}
      </section>
    </section>
  )
}
