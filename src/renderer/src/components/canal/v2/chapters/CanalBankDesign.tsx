import { useState, useMemo } from 'react'
import { Plus, Trash2, Sparkles, Layers, Link2, Unlink, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react'
import type {
  CanalBankMaterialZone,
  CanalBerm,
  CanalData,
  CanalDesign,
  CanalSection,
  CanalBankTier,
  CanalBankReach,
  CanalBankBermStep,
  CanalBankDesignConfig
} from '../../../../types/project'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import { newId } from '../../../../lib/tree'
import CanalBankReachEditor from './CanalBankReachEditor'
import CanalManualReachDesigner, { type CanalManualReachDraft } from './CanalManualReachDesigner'
import CanalTierHeightEditor from './CanalTierHeightEditor'
import CanalBankMaterialEditor from './CanalBankMaterialEditor'
import { saveCanalBankTierHeightRange } from '../../../../lib/canalBankTiers'
import { switchCanalBankDesignMode } from '../../../../lib/canalManualBankReaches'
import { formatCanalReachChainage } from '../../../../lib/canalTierReaches'
import {
  canalBankRepairItems,
  canalBankVolumeTotals,
  canalEarthworkTotals,
  recommendedCanalCrestWidth,
  defaultCanalBankDesignConfig,
  canalSectionBankTier,
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

function CoreConnection({ design, name, onCommit }: { design: CanalDesign; name: string; onCommit: (patch: Partial<CanalDesign>) => void }): JSX.Element {
  return <fieldset className="canal-core-connection">
    <legend>How should the impervious bank cores connect?</legend>
    <div className="canal-core-options">
      {(['separate', 'continuous'] as const).map((mode) => {
        const joined = mode === 'continuous'
        const selected = (design.heartingConnection ?? 'separate') === mode
        return <label key={mode} className={`canal-core-option${selected ? ' is-selected' : ''}`}>
          <span><input type="radio" name={name} checked={selected} onChange={() => onCommit({ heartingConnection: mode })} /><strong>{joined ? 'Continuous core beneath bed' : 'Separate bank cores'}</strong></span>
          <svg viewBox={`0 0 420 ${design.heartingTrenchEnabled ? 212 : 190}`} role="img" aria-label={joined ? 'Left and right impervious cores meet below the canal bed, with a connected cutoff trench when provided' : 'Separate bank cores and separate cutoff trenches when provided'}>
            <path d="M20 160 L80 40 H150 L190 100 H230 L270 40 H340 L400 160 Z" fill="#64748b" fillOpacity="0.45" />
            <path d="M155 48 L190 100 H230 L265 48 Z" fill="#38bdf8" fillOpacity="0.2" />
            {joined ? <path d="M50 160 L90 70 H115 L200 140 L285 70 H310 L350 160 Z" fill="#d69b62" /> : <><path d="M50 160 L90 70 H115 L150 160 Z" fill="#d69b62" /><path d="M250 160 L285 70 H310 L350 160 Z" fill="#d69b62" /></>}
            {design.heartingTrenchEnabled && (joined ? <path d="M50 160 H350 L340 174 H60 Z" fill="#d69b62" stroke="#f1c394" /> : <><path d="M50 160 H150 L140 174 H60 Z" fill="#d69b62" stroke="#f1c394" /><path d="M250 160 H350 L340 174 H260 Z" fill="#d69b62" stroke="#f1c394" /></>)}
            <path d="M80 40 H150 L190 100 H230 L270 40 H340" fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <text x="210" y="25" textAnchor="middle" fill="#cbd5e1" fontSize="12">Canal opening</text>
            <text x="210" y="88" textAnchor="middle" fill="#7dd3fc" fontSize="11">Bed</text>
            <text x="85" y="122" textAnchor="middle" fill="#241b12" fontSize="11">Core</text>
            <text x="325" y="122" textAnchor="middle" fill="#241b12" fontSize="11">Core</text>
            <text x="210" y="182" textAnchor="middle" fill="#cbd5e1" fontSize="12">{joined ? 'Cores meet below the bed' : 'Casing soil remains between cores'}</text>
            {design.heartingTrenchEnabled && <text x="210" y="204" textAnchor="middle" fill="#f1c394" fontSize="12">{joined ? 'One connected cutoff trench' : 'Separate bank cutoff trenches'}</text>}
          </svg>
          <small>{joined ? 'Where the two cores overlap below the bed, they form one connected impervious soil zone. The shared soil is measured once.' : 'Each bank has its own impervious core. Their shapes must remain apart.'}</small>
        </label>
      })}
    </div>
    <p className="settings-note">Schematic figures. Connection choice applies to both banks across the impervious tiers. Your entered widths and slopes determine whether the cores actually meet; selecting continuous does not add a connecting layer across a gap.</p>
    {design.heartingTrenchEnabled && <p className="settings-note">When the cores meet in continuous mode, the cutoff trench also connects across the full span beneath them. Trench depth and outside slopes remain as entered.</p>}
  </fieldset>
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
  const [manualDraft, setManualDraft] = useState<CanalManualReachDraft | null>(null)

  const bankConfig: CanalBankDesignConfig = design.bankConfig ?? defaultCanalBankDesignConfig(data.mode)
  const mode = bankConfig.mode
  const isProgrammatic = mode === 'tiered'
  const isManual = mode === 'manual'
  const isTiered = isProgrammatic || isManual
  const linkSymmetrical = bankConfig.linkSymmetrical
  const activeTiers = linkSymmetrical
    ? (bankConfig.leftTiers ?? [])
    : (activeSide === 'left' ? (bankConfig.leftTiers ?? []) : (bankConfig.rightTiers ?? []))

  const manualRows = linkSymmetrical || activeSide === 'left' ? bankConfig.leftManualReaches ?? [] : bankConfig.rightManualReaches ?? []
  const sortedTiers = isManual ? [...manualRows].sort((a, b) => a.from - b.from).flatMap(r => {
    const profile = activeTiers.find(t => t.id === r.tierId)
    return r.status === 'fill' && profile ? [profile] : []
  }) : [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  const currentTier = isManual && manualDraft ? manualDraft.profile : sortedTiers.find((t) => t.id === selectedTierId) ?? sortedTiers[0]
  const currentTierIdx = sortedTiers.findIndex((t) => t.id === currentTier?.id)

  const patchBankConfig = (patch: Partial<CanalBankDesignConfig>): void => {
    onCommit({
      bankConfig: { ...bankConfig, ...patch }
    })
  }
  const changeMode = (next: CanalBankDesignConfig['mode']): void => {
    onCommit({ bankConfig: switchCanalBankDesignMode(bankConfig, next, defaultCanalBankDesignConfig(data.mode)) })
    setSelectedTierId(''); setManualDraft(null)
  }

  const saveReaches = (rows: CanalBankReach[]): void => {
    const leftKey = isManual ? 'leftManualReaches' : 'leftReachOverrides'
    const rightKey = isManual ? 'rightManualReaches' : 'rightReachOverrides'
    patchBankConfig(linkSymmetrical ? { [leftKey]: rows, [rightKey]: rows } : { [activeSide === 'left' ? leftKey : rightKey]: rows })
  }
  const regenerateReaches = (): void => {
    patchBankConfig(linkSymmetrical ? { leftReachOverrides: undefined, rightReachOverrides: undefined }
      : activeSide === 'left' ? { leftReachOverrides: undefined } : { rightReachOverrides: undefined })
  }

  // Tier operations
  const updateTiers = (newTiers: CanalBankTier[], recalculate = false): void => {
    const reset = recalculate && isProgrammatic
      ? linkSymmetrical ? { leftReachOverrides: undefined, rightReachOverrides: undefined }
        : activeSide === 'left' ? { leftReachOverrides: undefined } : { rightReachOverrides: undefined }
      : {}
    if (linkSymmetrical) {
      patchBankConfig({ leftTiers: newTiers, rightTiers: newTiers, ...(isManual ? { leftManualTiers: newTiers, rightManualTiers: newTiers } : {}), ...reset })
    } else if (activeSide === 'left') {
      patchBankConfig({ leftTiers: newTiers, ...(isManual ? { leftManualTiers: newTiers } : {}), ...reset })
    } else {
      patchBankConfig({ rightTiers: newTiers, ...(isManual ? { rightManualTiers: newTiers } : {}), ...reset })
    }
  }

  const patchTier = (id: string, patch: Partial<CanalBankTier>): void => {
    if (isManual && manualDraft?.profile.id === id) { setManualDraft({ ...manualDraft, profile: { ...manualDraft.profile, ...patch } }); return }
    const updated = activeTiers.map((t) => (t.id === id ? { ...t, ...patch } : t))
    updateTiers(updated)
  }

  const saveTierHeights = (id: string, min: number, max: number): string | null => {
    const result = saveCanalBankTierHeightRange(activeTiers, id, min, max)
    if (result.error) return result.error
    if (result.tiers !== activeTiers) updateTiers(result.tiers, true)
    return null
  }

  const addTier = (): void => {
    const sorted = activeTiers.map(t => ({ ...t })).sort((a, b) => a.minFillHeight - b.minFillHeight)
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
    updateTiers([...sorted, newTier], true)
    setSelectedTierId(newTierId)
  }

  const removeTier = (id: string): void => {
    if (activeTiers.length <= 1) return
    const sorted = activeTiers.map(t => ({ ...t })).sort((a, b) => a.minFillHeight - b.minFillHeight)
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
    updateTiers(sorted.filter((t) => t.id !== id), true)
  }

  const addBermToTier = (tierId: string): void => {
    const tier = manualDraft?.profile.id === tierId ? manualDraft.profile : activeTiers.find((t) => t.id === tierId)
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
    const tier = manualDraft?.profile.id === tierId ? manualDraft.profile : activeTiers.find((t) => t.id === tierId)
    if (!tier) return
    const berms = (tier.berms ?? []).map((b) => (b.id === bermId ? { ...b, ...patch } : b))
    patchTier(tierId, { berms })
  }

  const removeBermFromTier = (tierId: string, bermId: string): void => {
    const tier = manualDraft?.profile.id === tierId ? manualDraft.profile : activeTiers.find((t) => t.id === tierId)
    if (!tier) return
    const berms = (tier.berms ?? []).filter((b) => b.id !== bermId)
    patchTier(tierId, { berms })
  }

  // Legacy variables
  const zoned = design.bankSectionType === 'zoned'
  const recommended = recommendedCanalCrestWidth(design.discharge)
  const earthwork = useMemo(() => canalEarthworkTotals(data), [data])
  const bankVolumes = useMemo(() => canalBankVolumeTotals(data), [data])

  // Material allocation zones
  const activeZones: CanalBankMaterialZone[] = useMemo(() => {
    if (!isTiered) return zoned ? ['hearting', 'casing'] : ['homogeneous']
    const anyZoned = (bankConfig.leftTiers ?? []).some((t) => t.sectionType === 'zoned') ||
      (!linkSymmetrical && (bankConfig.rightTiers ?? []).some((t) => t.sectionType === 'zoned'))
    const anyHomo = (bankConfig.leftTiers ?? []).some((t) => t.sectionType === 'homogeneous') ||
      (!linkSymmetrical && (bankConfig.rightTiers ?? []).some((t) => t.sectionType === 'homogeneous'))
    const zones: CanalBankMaterialZone[] = []
    if (anyHomo || bankVolumes.homogeneous > 0) zones.push('homogeneous')
    if (anyZoned || bankVolumes.hearting > 0 || bankVolumes.casing > 0) zones.push('hearting', 'casing')
    return zones.length > 0 ? zones : ['homogeneous']
  }, [isTiered, zoned, bankConfig.leftTiers, bankConfig.rightTiers, linkSymmetrical, bankVolumes])

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
  const populatedSections = sections.filter(s => s.designPopulated !== false && s.ground.length >= 2)
  const fillingSections = populatedSections.filter((s) => {
    const bed = canalBedLevelAt(data, s.chainage) ?? design.bedLevelAtStart
    const tbl = bed + canalSectionDepth(design)
    const groundRls = (s.ground ?? []).map((p) => p.rl)
    const minGround = groundRls.length > 0 ? Math.min(...groundRls) : bed
    return tbl - minGround > 0.05
  })
  const availablePreviewSections = fillingSections.length > 0 ? fillingSections : populatedSections
  const selectedSection = availablePreviewSections.find((s) => s.id === selectedSectionId) ?? availablePreviewSections[0]

  const previewSection = (() => {
    if (!selectedSection) return null
    const points = selectedSection.ground ?? []
    if (points.length < 2) return { ...selectedSection, ground: points.map(p => ({ ...p })) }
    const leftRl = selectedSection.leftToeRl ?? points[0].rl
    const rightRl = selectedSection.rightToeRl ?? points[points.length - 1].rl
    if (points.length === 2 || selectedSection.groundEntryMode) {
      const expandedGround = canalGroundProfileBetweenToes(data, selectedSection, leftRl, rightRl)
      return { ...selectedSection, ground: expandedGround }
    }
    return { ...selectedSection, ground: points.map(p => ({ ...p })) }
  })()

  const previewBed = previewSection ? (canalBedLevelAt(data, previewSection.chainage) ?? design.bedLevelAtStart) : 0
  const previewTbl = previewBed + canalSectionDepth(design)
  const previewGroundPoints = previewSection?.ground ?? []
  const previewLeftGround = previewGroundPoints[0]?.rl ?? previewBed
  const previewRightGround = previewGroundPoints[previewGroundPoints.length - 1]?.rl ?? previewBed
  const leftFillH = Math.max(0, previewTbl - previewLeftGround)
  const rightFillH = Math.max(0, previewTbl - previewRightGround)
  const matchedLeftTier = previewSection ? canalSectionBankTier(data, previewSection, 'left') : null
  const matchedRightTier = previewSection ? canalSectionBankTier(data, previewSection, 'right') : null

  return (
    <section className="canal-chapter canal-bank-chapter">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Chapter 3</span>
          <h2>Canal Bank / Bund Design</h2>
          <p className="settings-note">
            Programmatic embankment geometry, height brackets, outer berm shelves, and impervious zoned construction rules.
          </p>
        </div>
      </header>

      {(data.design.serviceRoadReaches?.length ?? 0) > 0 && <div className="canal-bank-recommendation"><strong>Roads &amp; Access applied:</strong> Active road platforms widen the crest or outer berm on their selected bank and chainages. The section preview and bank quantities include this formation; the tier widths below remain your base bank rules.</div>}

      {/* PRIMARY MODE SELECTOR */}
      <div className="canal-bank-mode-tabs">
        <button
          type="button"
          className={`canal-bank-mode-tab ${isProgrammatic ? 'active' : ''}`}
          onClick={() => changeMode('tiered')}
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
          className={`canal-bank-mode-tab ${isManual ? 'active' : ''}`}
          onClick={() => changeMode('manual')}
        >
          <Layers size={16} />
          <div className="canal-bank-tab-text">
            <strong>Manual Reach Design</strong>
            <small>Create chainage reaches and configure a separate bund design for each reach.</small>
          </div>
        </button>
      </div>

      <button type="button" className="btn ghost" onClick={() => changeMode('legacy')}>Fixed slope &amp; manual berms (existing standard design)</button>

      {/* ========================================================================= */}
      {/* OPTION A: PROGRAMMATIC HEIGHT-TIERED BUND DESIGN                          */}
      {/* ========================================================================= */}
      {isTiered && (
        <section className="canal-earthwork-card">
          <div className="canal-cross-panel-title">
            {isManual ? 'Manual Reach Design' : 'Height-Tiered Bund Configuration'}
            <small>
              {isManual ? 'Create chainage ranges and configure each reach’s bund design below.' : 'Reaches are derived from bank-top RL minus Soil & Rock Strata Top RL. Edit them here; all bank works use these same assignments.'}
            </small>
          </div>

          {/* Top Controls: Symmetry Link */}
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
                {linkSymmetrical ? `Left and right banks use identical ${isManual ? 'reaches and designs' : 'tiers'}` : 'Configure different rules for left & right banks'}
              </small>
            </div>


          </div>

          {/* Bank Side Switcher when Unlinked */}
          {!linkSymmetrical && (
            <div className="canal-bank-side-tabs">
              <button
                type="button"
                className={`canal-bank-side-tab ${activeSide === 'left' ? 'active' : ''}`}
                onClick={() => { setActiveSide('left'); setSelectedTierId(''); setManualDraft(null) }}
              >
                Left Bank {isManual ? 'Reaches' : 'Tiers'} ({(bankConfig.leftTiers ?? []).length})
              </button>
              <button
                type="button"
                className={`canal-bank-side-tab ${activeSide === 'right' ? 'active' : ''}`}
                onClick={() => { setActiveSide('right'); setSelectedTierId(''); setManualDraft(null) }}
              >
                Right Bank {isManual ? 'Reaches' : 'Tiers'} ({(bankConfig.rightTiers ?? []).length})
              </button>
            </div>
          )}

          {/* Continuous Height Bracket Continuum Bar */}
          {isManual && <CanalManualReachDesigner data={data} side={activeSide} selectedProfileId={currentTier?.id} draft={manualDraft} onDraftChange={setManualDraft} onSelect={setSelectedTierId} onChange={config => onCommit({ bankConfig: config })} />}
          {isProgrammatic && <div className="canal-tier-continuum">
            {isProgrammatic && <p className="settings-note">Reach boundaries use entered Soil Strata and Sections chainages. Each interval uses its starting chainage’s height tier. Soil Strata Top RL takes priority; populated sections supply bank ground where Top RL is absent.</p>}
            <div className="canal-tier-continuum-header">
              <span>{isManual ? 'Bank Profiles & Chainage Reaches' : 'Continuous Fill-Height Bracket Scale'}</span>
              {isProgrammatic && <button type="button" className="btn ghost" onClick={regenerateReaches}>Regenerate from Top RL</button>}
              <button type="button" className="btn ghost" onClick={addTier}>
                <Plus size={13} /> {isManual ? 'Add Bank Profile' : 'Add Height Tier'}
              </button>
            </div>

            <div className="canal-tier-bracket-track canal-bank-reach-track">
              {sortedTiers.map(tier => <article key={tier.id}
                className={`canal-tier-bracket-chip canal-bank-reach-box ${tier.sectionType === 'zoned' ? 'is-zoned' : 'is-homogeneous'} ${tier.id === currentTier?.id ? 'selected' : ''}`}>
                <button type="button" className="canal-reach-box-heading" onClick={() => setSelectedTierId(tier.id)} aria-pressed={tier.id === currentTier?.id}>
                  <strong>{tier.name}</strong><small>{isProgrammatic && <>{tier.minFillHeight.toFixed(1)} m – {tier.maxFillHeight === 9999 ? 'Max (∞)' : tier.maxFillHeight.toFixed(1) + ' m'} · </>}{tier.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'}</small>
                </button>
                <CanalTierHeightEditor key={`${activeSide}:${tier.id}:${tier.minFillHeight}:${tier.maxFillHeight}`} tier={tier} first={tier.id === sortedTiers[0]?.id} last={tier.id === sortedTiers[sortedTiers.length - 1]?.id} onSave={saveTierHeights} />
                <CanalBankReachEditor data={data} side={activeSide} tier={tier} onChange={saveReaches} />
              </article>)}
            </div>
            <div className="canal-bank-other-reaches">
              {(['level', 'unassigned', 'missing'] as const).map(status => <article className="canal-bank-reach-box" key={status}>
                <strong>{status === 'level' ? 'At bank-top level' : status === 'missing' ? 'Missing Top RL' : 'Unassigned reaches'}</strong>
                <CanalBankReachEditor data={data} side={activeSide} status={status} onChange={saveReaches} />
              </article>)}
            </div>
            <p className="settings-note">Height limits share boundaries: the upper limit belongs to the next tier. Click Edit heights, then Save heights to adjust neighbouring tiers and recalculate reaches. Saving height changes replaces reach edits. Reach edits adjust adjoining bund ranges. Mixed filling and cutting is allowed; pure cutting cannot be assigned to a bund. Each reach shows From Ch, To Ch and every underlying chainage interval.</p>
          </div>}

          {/* Tier pager: one card at a time */}
          {isProgrammatic && sortedTiers.length > 1 && (
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
              if (!tier) return <div className="canal-zoned-empty">{isManual ? 'Create or select a reach to show its Bund Design card.' : 'No tiers configured.'}</div>
              const tierIdx = Math.max(0, currentTierIdx)
              const isZonedTier = tier.sectionType === 'zoned'
              const bermsList = tier.berms ?? []
              const manualReach = manualDraft?.reach ?? manualRows.find(r => r.tierId === tier.id)

              return (
                <div className="canal-tier-card" key={tier.id}>
                  {/* Card Header */}
                  <div className="canal-tier-card-header">
                    <div className="canal-tier-title-group">
                      <span className="canal-tier-badge">{isManual ? manualDraft ? 'Reach design' : `Reach ${tierIdx + 1}` : `Tier ${tierIdx + 1}`}</span>
                      <input
                        type="text"
                        className="canal-tier-name-input"
                        value={tier.name}
                        aria-label={isManual ? 'Reach name' : 'Tier name'}
                        placeholder={isManual ? 'Reach name' : 'Tier Name (e.g. Medium Bund)'}
                        onChange={(e) => patchTier(tier.id, { name: e.target.value })}
                      />
                      {isManual && manualReach && <span>From Ch {formatCanalReachChainage(manualReach.from)} → To Ch {formatCanalReachChainage(manualReach.to)}</span>}
                      {isProgrammatic && <CanalTierHeightEditor key={`${activeSide}:${tier.id}:${tier.minFillHeight}:${tier.maxFillHeight}`} tier={tier} first={tierIdx === 0} last={tierIdx === sortedTiers.length - 1} onSave={saveTierHeights} />}
                    </div>

                    {!isManual && <div className="canal-tier-actions">
                      <button
                        type="button"
                        className="canal-earthwork-remove"
                        aria-label={`Remove ${tier.name}`}
                        disabled={sortedTiers.length <= 1}
                        onClick={() => removeTier(tier.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>}
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
                          onClick={() => {
                            patchTier(tier.id, {
                              sectionType: 'zoned',
                              heartingTopWidth: tier.heartingTopWidth ?? design.heartingTopWidth ?? 1.5,
                              heartingSideSlope: tier.heartingSideSlope ?? design.heartingLeftSlope ?? 1.0
                            })
                            if (!design.heartingTrenchEnabled) onCommit({ heartingTrenchEnabled: true })
                          }}
                        >
                          <Check size={12} style={{ display: isZonedTier ? 'inline' : 'none' }} />
                          🛡️ Impervious Zoned (Hearting Core + Casing)
                        </button>
                      </div>

                      {isZonedTier && (
                        <div className="canal-tier-zoned-params">
                          <CoreConnection design={design} name={`hearting-connection-${activeSide}-${tier.id}`} onCommit={onCommit} />
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
                          <label className="canal-bank-field">
                            <span>Hearting top adjustment from FSL (m)</span>
                            <input
                              type="number"
                              step="any"
                              max={Math.max(0, design.freeBoard)}
                              value={design.heartingLevelOffsetFromFsl}
                              onChange={(event) => onCommit({ heartingLevelOffsetFromFsl: Math.min(Number(event.target.value) || 0, Math.max(0, design.freeBoard)) })}
                            />
                            <small>Maximum allowed: +{Math.max(0, design.freeBoard).toFixed(2)} m.</small>
                          </label>
                          <div className="canal-tier-impervious-trench">
                            <div className="canal-cross-panel-title">
                              Impervious Cutoff Trench
                              <small>Provided only below impervious hearting.</small>
                            </div>
                            <label className="canal-earthwork-check"><input type="checkbox" checked={design.heartingTrenchEnabled} onChange={(event) => onCommit({ heartingTrenchEnabled: event.target.checked })} /> Provide impervious cutoff trench</label>
                            {design.heartingTrenchEnabled && <>
                              <div className="canal-design-grid">
                                <NumberField label="Trench depth below prepared level" unit="m" value={design.heartingTrenchDepth} onChange={(heartingTrenchDepth) => onCommit({ heartingTrenchDepth })} />
                                <NumberField label="Trench bottom width" unit="m" value={design.heartingTrenchWidth} onChange={(heartingTrenchWidth) => onCommit({ heartingTrenchWidth })} />
                                <NumberField label="Left trench slope" unit="H : 1V" value={design.heartingTrenchLeftSlope} onChange={(heartingTrenchLeftSlope) => onCommit({ heartingTrenchLeftSlope })} />
                                <NumberField label="Right trench slope" unit="H : 1V" value={design.heartingTrenchRightSlope} onChange={(heartingTrenchRightSlope) => onCommit({ heartingTrenchRightSlope })} />
                              </div>
                              <div className="canal-bank-recommendation"><strong>Trench datum:</strong> depth is measured below the stripped/prepared bund foundation level.</div>
                            </>}
                          </div>
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

      {!isTiered && zoned && (
        <section className="canal-bank-design">
          <div className="canal-cross-panel-title">
            Impervious Zones
            <small>Applies only to the selected impervious zoned reaches.</small>
          </div>
          <CoreConnection design={design} name="hearting-connection-legacy" onCommit={onCommit} />
          <div className="canal-design-grid">
            <label className="canal-bank-field">
              <span>Hearting top adjustment from FSL (m)</span>
              <input
                type="number"
                step="any"
                max={Math.max(0, design.freeBoard)}
                value={design.heartingLevelOffsetFromFsl}
                onChange={(event) => onCommit({ heartingLevelOffsetFromFsl: Math.min(Number(event.target.value) || 0, Math.max(0, design.freeBoard)) })}
              />
              <small>Maximum allowed: +{Math.max(0, design.freeBoard).toFixed(2)} m.</small>
            </label>
            <NumberField label="Hearting top width" unit="m" value={design.heartingTopWidth} onChange={(heartingTopWidth) => onCommit({ heartingTopWidth })} />
            <NumberField label="Left hearting slope" unit="H : 1V" value={design.heartingLeftSlope} onChange={(heartingLeftSlope) => onCommit({ heartingLeftSlope })} />
            <NumberField label="Right hearting slope" unit="H : 1V" value={design.heartingRightSlope} onChange={(heartingRightSlope) => onCommit({ heartingRightSlope })} />
          </div>

          <div className="canal-cross-panel-title">
            Impervious Cutoff Trench
            <small>The trench is provided only below impervious hearting and remains part of Bank Design.</small>
          </div>
          <label className="canal-earthwork-check"><input type="checkbox" checked={design.heartingTrenchEnabled} onChange={(event) => onCommit({ heartingTrenchEnabled: event.target.checked })} /> Provide impervious cutoff trench</label>
          {design.heartingTrenchEnabled && <>
            <div className="canal-design-grid">
              <NumberField label="Trench depth below prepared level" unit="m" value={design.heartingTrenchDepth} onChange={(heartingTrenchDepth) => onCommit({ heartingTrenchDepth })} />
              <NumberField label="Trench bottom width" unit="m" value={design.heartingTrenchWidth} onChange={(heartingTrenchWidth) => onCommit({ heartingTrenchWidth })} />
              <NumberField label="Left trench slope" unit="H : 1V" value={design.heartingTrenchLeftSlope} onChange={(heartingTrenchLeftSlope) => onCommit({ heartingTrenchLeftSlope })} />
              <NumberField label="Right trench slope" unit="H : 1V" value={design.heartingTrenchRightSlope} onChange={(heartingTrenchRightSlope) => onCommit({ heartingTrenchRightSlope })} />
            </div>
            <div className="canal-bank-recommendation"><strong>Trench datum:</strong> depth is measured below the stripped/prepared bund foundation level.</div>
          </>}
        </section>
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
          <span>Canal Excavation Quantity <strong>{earthwork.excavation.toLocaleString('en-IN')} cu.m</strong></span>
          <span>Material Quantity Needed <strong>{bankVolumes.totalFill.toLocaleString('en-IN')} cu.m</strong></span>
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

        {data.mode !== 'repair' && <CanalBankMaterialEditor allocations={design.bankMaterialAllocations ?? []} zones={activeZones} volumes={bankVolumes} onSave={bankMaterialAllocations => onCommit({ bankMaterialAllocations })} />}
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
                ? `Showing Ch ${previewSection.chainage} m in embankment (${isManual ? 'Manual Reach Design' : isProgrammatic ? 'Programmatic Height Tiers' : 'Fixed outer bank design'})`
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
              <span>{isManual ? 'Left Reach' : 'Left Matched Tier'}</span>
              <strong>
                {matchedLeftTier ? `${matchedLeftTier.name} (${matchedLeftTier.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'})` : isManual ? 'No reach assigned' : 'Standard'}
              </strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>Right Fill ($H$)</span>
              <strong>{rightFillH.toFixed(2)} m</strong>
            </div>
            <div className="canal-tier-metric-item">
              <span>{isManual ? 'Right Reach' : 'Right Matched Tier'}</span>
              <strong>
                {matchedRightTier ? `${matchedRightTier.name} (${matchedRightTier.sectionType === 'zoned' ? 'Zoned' : 'Homogeneous'})` : isManual ? 'No reach assigned' : 'Standard'}
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
