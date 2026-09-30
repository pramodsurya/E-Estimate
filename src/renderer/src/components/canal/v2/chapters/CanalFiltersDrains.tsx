import { useId, useState } from 'react'
import { Droplets, LockKeyhole, Pickaxe, Plus } from 'lucide-react'
import type { CanalBankDesignConfig, CanalBankTier, CanalData, CanalTierFoundationConfig } from '../../../../types/project'
import { canalSectionBankTier, canalTierToeProtectionQuantities, defaultCanalBankDesignConfig, defaultCanalTierFoundationConfig, orderedCanalSections } from '../../../../lib/canal'
import BundRockToeDiagram from '../../../bund/BundRockToeDiagram'
import BundToeDiagram from '../../../bund/BundToeDiagram'
import SsrCode from '../../../templates/SsrCode'

const n2 = (value: number | undefined | null): string => (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TOE_FILTER_ITEMS = {
  '5-7': { unit: 'CUM', description: 'Providing and constructing longitudinal and cross graded filter drains using sand and 20 mm-down graded aggregates satisfying the specified filter criteria, laid in layers to required slopes and compacted.', dimensions: 'Variable clear width and depth; layer arrangement follows the project specification', materials: 'Unscreened sand 76.8%; graded aggregate 23.2% (20–10 mm: 75% of aggregate; 10 mm-down: 25%)', basis: 'Length × clear width × depth' },
  '5-12': { unit: 'SQM', description: 'Providing toe-drain filter media consisting of two layers of 200 gsm polypropylene nonwoven filter fabric and 200 mm thick 20 mm-down graded coarse aggregate.', dimensions: 'Aggregate course 200 mm thick between two fabric layers', materials: '200 gsm PP fabric; aggregate blend: 75% 20–10 mm and 25% 10 mm-down', basis: 'Reach length × toe-drain width' },
  '5-13': { unit: 'SQM', description: 'Providing toe-drain filter media consisting of two layers of 250 gsm polypropylene nonwoven filter fabric and 200 mm thick 20 mm-down graded coarse aggregate.', dimensions: 'Aggregate course 200 mm thick between two fabric layers', materials: '250 gsm PP fabric; aggregate blend: 75% 20–10 mm and 25% 10 mm-down', basis: 'Reach length × toe-drain width' }
} as const

export function Details({ kind, quantity }: { kind: keyof typeof TOE_FILTER_ITEMS; quantity: number }): JSX.Element {
  const item = TOE_FILTER_ITEMS[kind]
  return <details className="canal-ssr-details"><summary>View SSR details</summary><dl><dt>SSR code</dt><dd>IRR-CAW-{kind}</dd><dt>Original description</dt><dd>{item.description}</dd><dt>Published unit</dt><dd>{item.unit}</dd><dt>Fixed dimensions</dt><dd>{item.dimensions}</dd><dt>Materials</dt><dd>{item.materials}</dd><dt>Quantity basis</dt><dd>{item.basis}</dd><dt>Current quantity</dt><dd>{n2(quantity)} {item.unit}</dd></dl></details>
}

function NumberInput({ label, value, onChange, min = 0, disabled = false, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; disabled?: boolean; suffix?: string }): JSX.Element {
  return <label className="canal-bank-field"><span>{label}</span><div className="canal-input-with-suffix"><input type="number" min={min} step="any" disabled={disabled} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value)))} />{suffix && <b>{suffix}</b>}</div></label>
}

function Locked({ label, value, source = 'SSR' }: { label: string; value: string; source?: string }): JSX.Element {
  return <div className="canal-locked-value"><span>{label}</span><strong>{value}</strong><small><LockKeyhole size={12} /> {source}</small></div>
}

export function ToeFilterSketch({ kind, width, depth }: { kind: '5-7' | '5-12' | '5-13'; width: number; depth: number }): JSX.Element {
  const rawId = useId().replace(/:/g, '')
  const aggregatePatternId = `toe-drain-aggregate-${rawId}`
  const finePatternId = `toe-drain-fine-${rawId}`
  const arrowId = `toe-drain-arrow-${rawId}`
  const dimensionArrowId = `toe-drain-dimension-${rawId}`
  const fabric = kind !== '5-7'
  const shownDepth = fabric ? 0.2 : depth
  const methodLabel = fabric
    ? `${kind === '5-12' ? '200' : '250'} gsm geotextile + aggregate`
    : 'Conventional graded filter drain'

  return <svg
    className="canal-system-sketch canal-toe-drain-sketch"
    viewBox="0 0 620 350"
    role="img"
    aria-label={`${methodLabel} cross-section at the land-side bank toe`}
  >
    <defs>
      <pattern id={aggregatePatternId} width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="5" r="2.5" fill="#67e8f9" />
        <circle cx="13" cy="12" r="3" fill="#22d3ee" />
      </pattern>
      <pattern id={finePatternId} width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#86efac" />
        <circle cx="6" cy="6" r="1" fill="#86efac" />
      </pattern>
      <marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0 0 L8 4 L0 8 Z" fill="#38bdf8" />
      </marker>
      <marker id={dimensionArrowId} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
        <path d="M0 3.5 L7 0 L7 7 Z" fill="#a3a3a3" />
      </marker>
    </defs>

    <text x="22" y="27" className="toe-sketch-title">TOE-DRAIN CROSS-SECTION</text>
    <text x="598" y="27" textAnchor="end" className="toe-sketch-method">{methodLabel}</text>

    {/* The drawing is intentionally zoomed into the land-side toe. */}
    <path d="M28 116 H166 L310 196" fill="none" stroke="#5eb4ea" strokeWidth="7" strokeLinejoin="round" />
    <path d="M28 196 H310 M310 196 H592" fill="none" stroke="#94a3b8" strokeWidth="3" />
    <path d="M166 116 L310 196 L28 196 Z" fill="rgba(94,180,234,.08)" stroke="none" />
    <text x="67" y="103">BANK SHELL</text>
    <text x="243" y="174" className="toe-sketch-label">LAND-SIDE TOE</text>
    <circle cx="310" cy="196" r="5" fill="#fbbf24" />

    {fabric ? <>
      {/* SSR 5-12/5-13: one fabric layer above and one below a 200 mm aggregate course. */}
      <path d="M326 196 H506 V244 H326 Z" fill={`url(#${aggregatePatternId})`} stroke="#22d3ee" strokeWidth="2" />
      <path d="M322 194 H510" fill="none" stroke="#d8b4fe" strokeWidth="5" />
      <path d="M322 246 H510" fill="none" stroke="#a855f7" strokeWidth="5" />
      <text x="416" y="216" textAnchor="middle" className="toe-sketch-material">200 mm graded aggregate course</text>
      <text x="416" y="232" textAnchor="middle" className="toe-sketch-note">75% 20–10 mm + 25% 10 mm-down</text>
      <path d="M510 194 H568 M510 246 H568" stroke="#a855f7" strokeWidth="2" />
      <text x="568" y="185" textAnchor="end" className="toe-sketch-note">upper PP fabric layer</text>
      <text x="568" y="263" textAnchor="end" className="toe-sketch-note">lower PP fabric layer</text>
    </> : <>
      {/* SSR 5-7: sand and 20 mm-down graded aggregate laid in specification-controlled layers. */}
      <path d="M326 196 H506 V276 H326 Z" fill="#27343b" stroke="#22d3ee" strokeWidth="3" />
      <path d="M326 196 H506 V257 H326 Z" fill={`url(#${finePatternId})`} />
      <path d="M326 257 H506 V276 H326 Z" fill={`url(#${aggregatePatternId})`} />
      <path d="M326 257 H506" stroke="#67e8f9" strokeWidth="1.5" />
      <text x="416" y="222" textAnchor="middle" className="toe-sketch-material">unscreened sand filter layer</text>
      <text x="416" y="240" textAnchor="middle" className="toe-sketch-note">76.8% of drain material</text>
      <text x="416" y="270" textAnchor="middle" className="toe-sketch-material">20 mm-down graded aggregate · 23.2%</text>
      <text x="326" y="290" className="toe-sketch-note">Layer order and individual thicknesses: as per specification</text>
    </>}

    {/* Seepage enters from the bank; collected water runs longitudinally. */}
    <path d="M248 153 C280 159 300 174 338 209" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="5 4" markerEnd={`url(#${arrowId})`} />
    <path d="M272 176 C294 179 310 190 344 224" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="5 4" markerEnd={`url(#${arrowId})`} />
    <text x="220" y="143" className="toe-sketch-water">SEEPAGE</text>

    {/* Width and depth dimensions follow the selected configuration. */}
    <path d={`M326 ${fabric ? 280 : 308} V${fabric ? 293 : 321} M506 ${fabric ? 280 : 308} V${fabric ? 293 : 321} M330 ${fabric ? 289 : 317} H502`} stroke="#a3a3a3" strokeWidth="1.5" markerStart={`url(#${dimensionArrowId})`} markerEnd={`url(#${dimensionArrowId})`} />
    <text x="416" y={fabric ? 309 : 337} textAnchor="middle">width {n2(width)} m</text>
    <path d={`M${fabric ? 532 : 528} 198 H548 M${fabric ? 532 : 528} ${fabric ? 244 : 276} H548 M542 202 V${fabric ? 240 : 272}`} stroke="#a3a3a3" strokeWidth="1.5" markerStart={`url(#${dimensionArrowId})`} markerEnd={`url(#${dimensionArrowId})`} />
    <text x="556" y={fabric ? 224 : 241} className="toe-sketch-depth">{n2(shownDepth)} m</text>
    <path d={`M344 ${fabric ? 266 : 299} H488`} stroke="#67e8f9" strokeWidth="2" markerEnd={`url(#${arrowId})`} />
    <text x="416" y={fabric ? 261 : 304} textAnchor="middle" className="toe-sketch-note">LONGITUDINAL DRAIN</text>
  </svg>
}

function CanalDrainageDesigner({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const sections = (orderedCanalSections(data))
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left')
  const [selectedTierId, setSelectedTierId] = useState('')
  const bankConfig: CanalBankDesignConfig = data.design.bankConfig ?? defaultCanalBankDesignConfig(data.mode)
  const activeTiers: CanalBankTier[] = bankConfig.linkSymmetrical
    ? (bankConfig.leftTiers ?? [])
    : activeSide === 'left' ? (bankConfig.leftTiers ?? []) : (bankConfig.rightTiers ?? [])
  const sortedTiers = [...activeTiers].sort((a, b) => a.minFillHeight - b.minFillHeight)
  const currentTier = sortedTiers.find((tier) => tier.id === selectedTierId) ?? sortedTiers[0]
  const treatment: CanalTierFoundationConfig = {
    ...defaultCanalTierFoundationConfig(),
    ...(currentTier?.foundationTreatment ?? {})
  }
  const outerToeSlope = Math.max(0, currentTier?.berms.at(-1)?.slopeAfterBerm ?? currentTier?.baseSlope ?? 0)
  const tierSummary = canalTierToeProtectionQuantities(data, currentTier?.id)
  const toeDrainTopWidth = Math.max(0, treatment.toeDrainBottomWidth) +
    Math.max(0, treatment.toeDrainDepth) *
    (Math.max(0, treatment.toeDrainLeftSlope) + Math.max(0, treatment.toeDrainRightSlope))
  const tierSections = currentTier ? sections.filter((section) =>
    canalSectionBankTier(data, section, 'left')?.id === currentTier.id ||
    canalSectionBankTier(data, section, 'right')?.id === currentTier.id
  ) : []
  const patchTreatment = (patch: Partial<CanalTierFoundationConfig>): void => {
    if (!currentTier) return
    onCommit((current) => {
      const config = current.design.bankConfig ?? defaultCanalBankDesignConfig(current.mode)
      const updated = { ...treatment, ...patch }
      const updateTiers = (tiers: CanalBankTier[]): CanalBankTier[] => tiers.map((tier) =>
        tier.id === currentTier.id ? { ...tier, foundationTreatment: updated } : tier
      )
      return {
        ...current,
        design: {
          ...current.design,
          bankConfig: {
            ...config,
            leftTiers: config.linkSymmetrical || activeSide === 'left' ? updateTiers(config.leftTiers ?? []) : (config.leftTiers ?? []),
            rightTiers: config.linkSymmetrical || activeSide === 'right' ? updateTiers(config.rightTiers ?? []) : (config.rightTiers ?? [])
          }
        }
      }
    })
  }
  const cardHeader = (icon: JSX.Element, title: string, subtitle: string, enabled: boolean, toggle: (enabled: boolean) => void): JSX.Element => <header><span className="canal-work-icon">{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div><label className="canal-card-switch"><input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} /><span>{enabled ? 'Included' : 'Not included'}</span></label></header>

  return <section className="canal-chapter canal-drainage-designer">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Rock Toe &amp; Surface Drainage</span><h2>Tier-based toe protection and open ditch</h2><p>Use the same bank-height tiers as Bank Design. Rock protection follows the bank toe; the open ditch collects rainfall runoff and discharged seepage outside it.</p></div></header>

    {!bankConfig.linkSymmetrical && <div className="canal-bank-side-pills"><button type="button" className={`canal-tier-zoning-pill ${activeSide === 'left' ? 'active-zoned' : ''}`} onClick={() => setActiveSide('left')}>Left Bank Tiers</button><button type="button" className={`canal-tier-zoning-pill ${activeSide === 'right' ? 'active-zoned' : ''}`} onClick={() => setActiveSide('right')}>Right Bank Tiers</button></div>}

    <div className="canal-tier-continuum">
      <div className="canal-tier-continuum-header"><strong>Bank Height Tiers</strong><span>Select a Bank Design tier—no separate chainage reach is required</span></div>
      <div className="canal-tier-bracket-track">{sortedTiers.map((tier) => {
        const configured = { ...defaultCanalTierFoundationConfig(), ...(tier.foundationTreatment ?? {}) }
        const status = [configured.rockToeProtection && 'Rock Toe', configured.toeDrain && 'Open Toe Ditch'].filter(Boolean).join(' + ') || 'Not enabled'
        return <button key={tier.id} type="button" className={`canal-tier-bracket-chip ${tier.sectionType === 'zoned' ? 'is-zoned' : 'is-homogeneous'} ${tier.id === currentTier?.id ? 'selected' : ''}`} onClick={() => setSelectedTierId(tier.id)}><strong>{tier.name}</strong><small>{tier.minFillHeight} m → {tier.maxFillHeight < 9000 ? `${tier.maxFillHeight} m` : 'above'} · {status}</small></button>
      })}</div>
    </div>

    {currentTier && <section className="canal-tier-toe-panel">
      <header><div><strong>{currentTier.name}</strong><small>{tierSections.length} cross-sections currently match this tier · final outer batter {outerToeSlope}H:1V</small></div><span>Automatic by tier</span></header>

      <div className="canal-tier-toe-grid">
        {/* 1. Rock Toe (Left side) */}
        <section className={`canal-independent-work-card rocktoe${treatment.rockToeProtection ? ' is-enabled' : ''}`}>
          {cardHeader(<Pickaxe size={20} />, 'Rock Toe', 'Permeable rock support continuing the final outer bank batter.', treatment.rockToeProtection, (rockToeProtection) => patchTreatment({ rockToeProtection }))}
          {treatment.rockToeProtection ? (
            <div className="canal-tier-side-card-body">
              <div className="canal-toe-visual-frame">
                <BundRockToeDiagram
                  topWidth={treatment.rockToeTopWidth}
                  innerSlope={treatment.rockToeInnerSlope}
                  outerSlope={outerToeSlope}
                  height={treatment.rockToeProtectionHeight}
                  excavationDepth={0}
                  filterEnabled={treatment.rockToeFilter}
                />
              </div>

              <div className="canal-toe-live-metric">
                <div className="canal-toe-metric-info">
                  <span>Selected tier rock toe</span>
                  <SsrCode code="IRR-CAW-5-6" />
                </div>
                <div className="canal-toe-metric-val">
                  <strong>{n2(tierSummary.rockToeVolume)} CUM</strong>
                  {treatment.rockToeFilter && <small>Graded filter: {n2(tierSummary.rockToeFilterVolume)} CUM</small>}
                </div>
              </div>

              <div className="canal-control-stack">
                <label className="canal-bank-field">
                  <span>Apply at land-side toe of</span>
                  <select
                    value={treatment.rockToeProtectionSide}
                    onChange={(event) =>
                      patchTreatment({
                        rockToeProtectionSide: event.target.value as CanalTierFoundationConfig['rockToeProtectionSide']
                      })
                    }
                  >
                    <option value="both">Both banks</option>
                    <option value="left">Left bank only</option>
                    <option value="right">Right bank only</option>
                  </select>
                </label>

                <div className="canal-bank-grid">
                  <NumberInput
                    label="Top width"
                    value={treatment.rockToeTopWidth}
                    suffix="m"
                    onChange={(rockToeTopWidth) => patchTreatment({ rockToeTopWidth })}
                  />
                  <NumberInput
                    label="Height"
                    value={treatment.rockToeProtectionHeight}
                    suffix="m"
                    onChange={(rockToeProtectionHeight) => patchTreatment({ rockToeProtectionHeight })}
                  />
                </div>

                <div className="canal-bank-grid">
                  <NumberInput
                    label="Inner slope (H : 1V)"
                    value={treatment.rockToeInnerSlope}
                    onChange={(rockToeInnerSlope) => patchTreatment({ rockToeInnerSlope })}
                  />
                  <Locked label="Outer slope" value={`${outerToeSlope} H : 1V`} source="Selected Bank Design tier" />
                </div>

                <label className="canal-check-row">
                  <input
                    type="checkbox"
                    checked={treatment.rockToeFilter}
                    onChange={(event) => patchTreatment({ rockToeFilter: event.target.checked })}
                  />
                  <span>Graded filter below and behind rock toe</span>
                </label>

                {treatment.rockToeFilter && (
                  <div className="canal-fixed-spec-grid">
                    <Locked label="Below rock toe" value="1.00 m total" source="IRR-CAW-5-11" />
                    <Locked label="Behind rock toe" value="0.50 m total" source="IRR-CAW-5-11" />
                  </div>
                )}

                <div className="canal-validation success">✓ Outer face follows the final batter of this bank tier.</div>
              </div>
            </div>
          ) : (
            <div className="canal-toe-empty-state">
              <span className="canal-toe-empty-icon"><Pickaxe size={26} /></span>
              <h4>Rock Toe is not included</h4>
              <p>Add a rubble rock toe at the outer embankment toe for slope stability and free drainage.</p>
              <button type="button" className="btn secondary" onClick={() => patchTreatment({ rockToeProtection: true })}>
                <Plus size={14} /> Enable Rock Toe
              </button>
            </div>
          )}
          <footer>
            {treatment.rockToeProtection ? (
              <div className="canal-card-quantity-list">
                <span><SsrCode code="IRR-CAW-5-6" /><strong>{n2(tierSummary.rockToeVolume)} CUM</strong></span>
                {treatment.rockToeFilter && <span><SsrCode code="IRR-CAW-5-11" /><strong>{n2(tierSummary.rockToeFilterVolume)} CUM</strong></span>}
              </div>
            ) : (
              <span>Enable for this bank-height tier.</span>
            )}
          </footer>
        </section>

        {/* 2. Open Toe Ditch (Right side) */}
        <section className={`canal-independent-work-card drainage toe${treatment.toeDrain ? ' is-enabled' : ''}`}>
          {cardHeader(<Droplets size={20} />, 'Open Toe Ditch', 'Open longitudinal channel collecting rainfall runoff and discharged bank seepage.', treatment.toeDrain, (toeDrain) => patchTreatment({ toeDrain }))}
          {treatment.toeDrain ? (
            <div className="canal-tier-side-card-body">
              <div className="canal-toe-visual-frame">
                <BundToeDiagram
                  topWidth={toeDrainTopWidth}
                  bottomWidth={treatment.toeDrainBottomWidth}
                  depth={treatment.toeDrainDepth}
                  leftSlope={treatment.toeDrainLeftSlope}
                  rightSlope={treatment.toeDrainRightSlope}
                  bermWidth={treatment.toeDrainBermWidth}
                  lined={treatment.toeDrainProtection !== 'none'}
                />
              </div>

              <div className="canal-toe-live-metric">
                <div className="canal-toe-metric-info">
                  <span>Selected tier ditch excavation</span>
                  <SsrCode code="IRR-CAW-1-1" />
                </div>
                <div className="canal-toe-metric-val">
                  <strong>{n2(tierSummary.toeDrainExcavationVolume)} CUM</strong>
                  {treatment.toeDrainProtection === 'rubble' && <small>Rubble protection: {n2(tierSummary.toeDrainRubbleArea)} SQM</small>}
                  {treatment.toeDrainProtection === 'concrete' && <small>M15 lining: {n2(tierSummary.toeDrainConcreteVolume)} CUM</small>}
                </div>
              </div>

              <div className="canal-control-stack">
                <label className="canal-bank-field">
                  <span>Apply outside land-side toe of</span>
                  <select
                    value={treatment.toeDrainSide}
                    onChange={(event) =>
                      patchTreatment({
                        toeDrainSide: event.target.value as CanalTierFoundationConfig['toeDrainSide']
                      })
                    }
                  >
                    <option value="both">Both banks</option>
                    <option value="left">Left bank only</option>
                    <option value="right">Right bank only</option>
                  </select>
                </label>

                <div className="canal-bank-grid">
                  <NumberInput
                    label="Bottom width at invert"
                    value={treatment.toeDrainBottomWidth}
                    suffix="m"
                    onChange={(toeDrainBottomWidth) => patchTreatment({ toeDrainBottomWidth })}
                  />
                  <NumberInput
                    label="Depth"
                    value={treatment.toeDrainDepth}
                    suffix="m"
                    onChange={(toeDrainDepth) => patchTreatment({ toeDrainDepth })}
                  />
                </div>

                <div className="canal-bank-grid">
                  <NumberInput
                    label="Bank-side slope (H:1V)"
                    value={treatment.toeDrainLeftSlope}
                    onChange={(toeDrainLeftSlope) => patchTreatment({ toeDrainLeftSlope })}
                  />
                  <NumberInput
                    label="Land-side slope (H:1V)"
                    value={treatment.toeDrainRightSlope}
                    onChange={(toeDrainRightSlope) => patchTreatment({ toeDrainRightSlope })}
                  />
                </div>

                <div className="canal-bank-grid">
                  <NumberInput
                    label="Clear berm from bank toe"
                    value={treatment.toeDrainBermWidth}
                    suffix="m"
                    onChange={(toeDrainBermWidth) => patchTreatment({ toeDrainBermWidth })}
                  />
                  <label className="canal-bank-field">
                    <span>Bed-and-side protection</span>
                    <select
                      value={treatment.toeDrainProtection}
                      onChange={(event) =>
                        patchTreatment({
                          toeDrainProtection: event.target.value as CanalTierFoundationConfig['toeDrainProtection']
                        })
                      }
                    >
                      <option value="none">Unlined earth ditch</option>
                      <option value="rubble">225 mm rubble protection</option>
                      <option value="concrete">100 mm M15 concrete lining</option>
                    </select>
                  </label>
                </div>

                <div className="canal-validation success">✓ Open to the sky; runoff and released seepage flow longitudinally to an outlet.</div>
              </div>
            </div>
          ) : (
            <div className="canal-toe-empty-state">
              <span className="canal-toe-empty-icon"><Droplets size={26} /></span>
              <h4>Open Toe Ditch is not included</h4>
              <p>Excavate an open longitudinal channel to collect and convey rainfall runoff and seepage.</p>
              <button type="button" className="btn secondary" onClick={() => patchTreatment({ toeDrain: true })}>
                <Plus size={14} /> Enable Open Toe Ditch
              </button>
            </div>
          )}
          <footer>
            {treatment.toeDrain ? (
              <div className="canal-card-quantity-list">
                <span><SsrCode code="IRR-CAW-1-1" /><strong>{n2(tierSummary.toeDrainExcavationVolume)} CUM</strong></span>
                {treatment.toeDrainProtection === 'rubble' && <span><small>Rubble</small><strong>{n2(tierSummary.toeDrainRubbleArea)} SQM</strong></span>}
                {treatment.toeDrainProtection === 'concrete' && <span><small>M15 concrete</small><strong>{n2(tierSummary.toeDrainConcreteVolume)} CUM</strong></span>}
              </div>
            ) : (
              <span>Enable for this bank-height tier.</span>
            )}
          </footer>
        </section>
      </div>
    </section>}

  </section>
}

type DrainageChapterProps = { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }

export default function CanalFiltersDrains(props: DrainageChapterProps): JSX.Element {
  return <CanalDrainageDesigner {...props} />
}
