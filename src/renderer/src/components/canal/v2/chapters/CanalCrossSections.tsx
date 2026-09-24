import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, ClipboardCopy, Plus, Trash2 } from 'lucide-react'
import type { CanalBermFace, CanalData, CanalPoint, CanalSection } from '../../../../types/project'
import {
  canalGroundProfileBetweenToes,
  canalDesignProfile,
  canalGroundLevelAt,
  canalSectionAreas,
  canalStrippedOrCutLevelAt,
  newManualCanalSection,
  orderedCanalSections,
  orderCanalPoints
} from '../../../../lib/canal'
import { formatChainage } from '../../../../lib/guideWall'
import { newId } from '../../../../lib/tree'
import CanalSectionDiagram from '../../CanalSectionDiagram'
import CanalSectionSoilProfile from './CanalSectionSoilProfile'

const n2 = (value: number | undefined | null): string => (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
type GroundMode = 'average' | 'separate'

function DraftNumber({ label, value, allowBlank = false, onCommit }: {
  label: string
  value: number | null
  allowBlank?: boolean
  onCommit: (value: number | null) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value))
  }, [value])
  const commit = (): void => {
    if (draft.trim() === '') {
      if (allowBlank && value != null) onCommit(null)
      else setDraft(value == null ? '' : String(value))
      return
    }
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(value == null ? '' : String(value))
      return
    }
    if (parsed !== value) onCommit(parsed)
  }
  return (
    <label className="canal-cross-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => { focused.current = true }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { focused.current = false; commit() }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value == null ? '' : String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function GroundPointRow({ offsetValue, existingLevel, cutLevel, proposedLevel, onCommit, onRemove }: {
  offsetValue: number
  existingLevel: number | null
  cutLevel: number | null
  proposedLevel: number | null
  onCommit: (point: CanalPoint) => void
  onRemove: (() => void) | null
}): JSX.Element {
  const [prevValues, setPrevValues] = useState({ offsetValue, existingLevel })
  const [offset, setOffset] = useState(n2(offsetValue))
  const [rl, setRl] = useState(existingLevel == null ? '' : n2(existingLevel))
  if (prevValues.offsetValue !== offsetValue || prevValues.existingLevel !== existingLevel) {
    setPrevValues({ offsetValue, existingLevel })
    setOffset(n2(offsetValue))
    setRl(existingLevel == null ? '' : n2(existingLevel))
  }
  const commit = (): void => {
    const next = { offset: Number(offset), rl: Number(rl) }
    if (rl.trim() !== '' && Number.isFinite(next.offset) && Number.isFinite(next.rl)) onCommit(next)
    else { setOffset(n2(offsetValue)); setRl(existingLevel == null ? '' : n2(existingLevel)) }
  }
  return (
    <tr>
      <td><input value={offset} inputMode="decimal" onChange={(e) => setOffset(e.target.value)} onBlur={commit} /></td>
      <td><input value={rl} inputMode="decimal" onChange={(e) => setRl(e.target.value)} onBlur={commit} /></td>
      <td><input value={cutLevel == null ? '' : n2(cutLevel)} readOnly aria-label="Stripped or cut level" /></td>
      <td><input value={proposedLevel == null ? '' : n2(proposedLevel)} readOnly aria-label="Proposed canal level" /></td>
      <td>{onRemove && <button type="button" onClick={onRemove} aria-label="Remove ground point"><Trash2 size={14} /></button>}</td>
    </tr>
  )
}

export default function CanalCrossSections({ data, onCommit }: {
  data: CanalData
  onCommit: (update: (current: CanalData) => CanalData) => void
}): JSX.Element {
  const sections = (orderedCanalSections(data))
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null)
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0] ?? null
  const [message, setMessage] = useState<string | null>(null)

  const computeInitialGround = (sel: CanalSection | null): {
    left: number | null
    right: number | null
    average: number | null
    mode: GroundMode
  } => {
    const points = sel ? orderCanalPoints(sel.ground) : []
    if (points.length < 2) {
      return {
        left: null,
        right: null,
        average: null,
        mode: data.mode === 'repair' ? 'separate' : 'average'
      }
    }
    const left = points[0].rl
    const right = points[points.length - 1].rl
    return {
      left,
      right,
      average: (left + right) / 2,
      mode: Math.abs(left - right) < 1e-9 ? 'average' : 'separate'
    }
  }

  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(selected?.id ?? null)
  const [groundMode, setGroundMode] = useState<GroundMode>(() => computeInitialGround(selected).mode)
  const [averageRl, setAverageRl] = useState<number | null>(() => computeInitialGround(selected).average)
  const [leftRl, setLeftRl] = useState<number | null>(() => computeInitialGround(selected).left)
  const [rightRl, setRightRl] = useState<number | null>(() => computeInitialGround(selected).right)

  if (prevSelectedId !== (selected?.id ?? null)) {
    const next = computeInitialGround(selected)
    setPrevSelectedId(selected?.id ?? null)
    setGroundMode(next.mode)
    setAverageRl(next.average)
    setLeftRl(next.left)
    setRightRl(next.right)
  }

  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const [creatingSection, setCreatingSection] = useState(false)
  const [newSectionChainage, setNewSectionChainage] = useState('')

  const sectionSummaries = (new Map(sections.map((section) => [section.id, canalSectionAreas(data, section)])))

  const updateSection = (sectionId: string, patch: Partial<CanalSection>): void =>
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section)
    }))

  const populatedSection = (source: CanalData, section: CanalSection, left: number, right: number): CanalSection => {
    const toeGround = canalGroundProfileBetweenToes(source, section, left, right)
    const candidate: CanalSection = {
      ...section,
      groundEntryMode: Math.abs(left - right) < 1e-9 ? 'average' : 'separate',
      leftToeRl: left,
      rightToeRl: right,
      ground: toeGround,
      designPopulated: true
    }
    const withCandidate = { ...source, sections: source.sections.map((item) => item.id === section.id ? candidate : item) }
    const offsets = canalDesignProfile(withCandidate, candidate).map((point) => Math.round(point.offset * 1000) / 1000)
    return { ...candidate, designPointOffsets: [...new Set(offsets)].sort((a, b) => a - b) }
  }

  const updateToeRls = (section: CanalSection, left: number | null, right: number | null): void => {
    if (left != null && right != null && (section.ground.length <= 2 || section.isManual || !section.designPopulated)) {
      onCommit((current) => ({
        ...current,
        sections: current.sections.map((item) => item.id === section.id ? populatedSection(current, section, left, right) : item)
      }))
    } else {
      updateSection(section.id, {
        leftToeRl: left,
        rightToeRl: right
      })
    }
  }

  const requestedGround = (): { left: number; right: number } | null => {
    if (groundMode === 'average') return averageRl == null ? null : { left: averageRl, right: averageRl }
    return leftRl == null || rightRl == null ? null : { left: leftRl, right: rightRl }
  }

  const sectionGround = (section: CanalSection): { left: number; right: number } | null => {
    const points = orderCanalPoints(section.ground)
    const left = section.leftToeRl ?? points[0]?.rl ?? null
    const right = section.groundEntryMode === 'separate'
      ? section.rightToeRl ?? points[points.length - 1]?.rl ?? null
      : left
    return left == null || right == null ? null : { left, right }
  }

  const populate = (): void => {
    if (!selected) return
    const ground = requestedGround()
    if (!ground) return
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === selected.id
        ? populatedSection(current, section, ground.left, ground.right)
        : section)
    }))
    setMessage(`Canal design populated at Ch ${formatChainage(selected.chainage)}.`)
  }

  const populateAll = (): void => {
    const ground = requestedGround()
    if (!ground) return
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => populatedSection(current, section, ground.left, ground.right))
    }))
    setMessage(`Canal design populated at all ${sections.length} chainages.`)
  }

  const populateChecked = (): void => {
    if (checked.size === 0) return
    let populatedCount = 0
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        const ground = checked.has(section.id) ? sectionGround(section) : null
        if (!ground) return section
        populatedCount += 1
        return populatedSection(current, section, ground.left, ground.right)
      })
    }))
    setMessage(`Canal design populated at ${populatedCount} ready selected chainage${populatedCount === 1 ? '' : 's'}.`)
  }

  const copyActiveGround = (target: 'checked' | 'all'): void => {
    if (!selected) return
    const ground = sectionGround(selected) ?? requestedGround()
    if (!ground) return
    const mode = selected.groundEntryMode ?? groundMode
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        const applies = target === 'all' || checked.has(section.id)
        return applies ? {
          ...section,
          groundEntryMode: mode,
          leftToeRl: ground.left,
          rightToeRl: mode === 'average' ? ground.left : ground.right
        } : section
      })
    }))
    setMessage(`Ground-entry values copied to ${target === 'all' ? 'all sections' : `${checked.size} selected sections`}.`)
  }

  const copyPrevious = (): void => {
    if (!selected) return
    const index = sections.findIndex((section) => section.id === selected.id)
    if (index <= 0) return
    const source = sections[index - 1]
    updateSection(selected.id, { ground: source.ground.map((point) => ({ ...point })), designPopulated: source.designPopulated })
    const points = orderCanalPoints(source.ground)
    if (points.length >= 2) {
      setLeftRl(points[0].rl)
      setRightRl(points[points.length - 1].rl)
      setAverageRl((points[0].rl + points[points.length - 1].rl) / 2)
      setGroundMode(Math.abs(points[0].rl - points[points.length - 1].rl) < 1e-9 ? 'average' : 'separate')
    }
    setMessage(`Ground copied from Ch ${formatChainage(source.chainage)}.`)
  }

  const createSection = (): void => {
    const chainage = Math.round(Number(newSectionChainage) * 100) / 100
    if (!Number.isFinite(chainage) || chainage < 0 || chainage > data.lengthM) {
      setMessage(`Enter a chainage from 0 to ${formatChainage(data.lengthM)} m.`)
      return
    }
    if (sections.some((section) => Math.abs(section.chainage - chainage) < 0.005)) {
      setMessage(`A cross-section already exists at Ch ${formatChainage(chainage)} m.`)
      return
    }
    const created = newManualCanalSection(chainage)
    onCommit((current) => ({ ...current, sections: [...current.sections, created].sort((a, b) => a.chainage - b.chainage) }))
    setSelectedId(created.id)
    setNewSectionChainage('')
    setCreatingSection(false)
    setMessage(`New independent section created at Ch ${formatChainage(chainage)} m.`)
  }

  const ready = groundMode === 'average' ? averageRl != null : leftRl != null && rightRl != null

  // Saved data only: nothing draws until Populate Design runs and stores
  // the resolved ground and design profile on the section.
  const displayedSection = selected


  const groundPoints = displayedSection ? orderCanalPoints(displayedSection.ground) : []
  const proposedProfile = displayedSection ? canalDesignProfile(data, displayedSection) : []
  const levelOffsets = [...new Set([
    ...groundPoints.map((point) => Math.round(point.offset * 1000) / 1000),
    ...(displayedSection?.designPointOffsets ?? [])
  ])].sort((a, b) => a - b)
  const setGroundPoint = (index: number, point: CanalPoint): void => {
    if (!selected) return
    updateSection(selected.id, { ground: orderCanalPoints(groundPoints.map((item, i) => i === index ? point : item)) })
  }
  const addGroundPoint = (): void => {
    if (!selected) return
    const nextOffset = groundPoints.length ? groundPoints[groundPoints.length - 1].offset + 1 : 0
    const nextRl = groundPoints.length ? groundPoints[groundPoints.length - 1].rl : averageRl ?? data.design.bedLevelAtStart
    updateSection(selected.id, { ground: [...groundPoints, { offset: nextOffset, rl: nextRl }] })
  }
  const upsertGroundPoint = (rowOffset: number, point: CanalPoint): void => {
    if (!selected) return
    const index = groundPoints.findIndex((item) => Math.abs(item.offset - rowOffset) < 1e-6)
    if (index >= 0) setGroundPoint(index, point)
    else updateSection(selected.id, { ground: orderCanalPoints([...groundPoints, point]) })
  }

  return (
    <section className="canal-v2-section" aria-labelledby="canal-cross-title">
      <header className="canal-v2-section-header">
        <div>
          <span className="canal-v2-section-kicker">Chapter 4</span>
          <h2 id="canal-cross-title">4. Canal Cross-Sections</h2>
          <p>Enter the ground level and populate the Chapter 1 canal design at each chainage.</p>
        </div>
        <div className="canal-cross-header-actions">
          {message && <span className="canal-cross-message" role="status">{message}</span>}
          <button type="button" className="btn primary" onClick={() => setCreatingSection(true)}><Plus size={14} /> Create New Section</button>
        </div>
      </header>

      {creatingSection && (
        <div className="canal-create-section" role="dialog" aria-label="Create new canal cross-section">
          <label className="canal-cross-field">
            <span>Chainage (m)</span>
            <input autoFocus type="number" min={0} max={data.lengthM} step="any" value={newSectionChainage} onChange={(event) => setNewSectionChainage(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') createSection()
              if (event.key === 'Escape') setCreatingSection(false)
            }} />
          </label>
          <small>This section is independent of the continuous interval and will remain at its entered chainage.</small>
          <button type="button" className="btn primary" onClick={createSection}>Create Section</button>
          <button type="button" className="btn ghost" onClick={() => { setCreatingSection(false); setNewSectionChainage('') }}>Cancel</button>
        </div>
      )}

      <div className="canal-cross-layout">
        <aside className="canal-cross-list">
          <div className="canal-cross-list-head">
            <div><strong>Cross-sections</strong><small>Ground profile at each chainage</small></div>
            <label className="canal-cross-select-all">
              <input type="checkbox" checked={sections.length > 0 && sections.every((section) => checked.has(section.id))} onChange={() => setChecked(sections.every((section) => checked.has(section.id)) ? new Set() : new Set(sections.map((section) => section.id)))} />
              Select all
            </label>
          </div>
          <button type="button" className="btn primary canal-cross-populate-selected" disabled={checked.size === 0} onClick={populateChecked}>
            Populate {checked.size > 0 ? `${checked.size} selected` : 'selected'} sections
          </button>
          <div className="canal-cross-copy-tools">
            <button type="button" className="btn ghost" disabled={!selected || checked.size === 0 || !sectionGround(selected)} onClick={() => copyActiveGround('checked')}>Copy active to selected</button>
            <button type="button" className="btn ghost" disabled={!selected || !sectionGround(selected)} onClick={() => copyActiveGround('all')}>Copy active to all</button>
          </div>
          <div className="canal-cross-rows">
            {sections.map((section, index) => {
              const areas = sectionSummaries.get(section.id)
              const populated = section.ground.length >= 2
              const bucket = areas ? (areas.cutting > 0.001 && areas.filling > 0.001 ? 'Partial' : areas.cutting > 0.001 ? 'Cutting' : 'Embankment') : null
              return (
                <div key={section.id} className={`canal-cross-row${section.id === selected?.id ? ' is-active' : ''}`}>
                  <input type="checkbox" checked={checked.has(section.id)} onChange={() => setChecked((current) => {
                    const next = new Set(current)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })} aria-label={`Select chainage ${formatChainage(section.chainage)}`} />
                  <div className="canal-cross-row-content">
                  <button type="button" className="canal-cross-row-select" onClick={() => setSelectedId(section.id)}>
                    <span className="canal-cross-row-index">{index + 1}</span>
                    <span className="canal-cross-row-main">
                      <strong>Ch {formatChainage(section.chainage)} m{bucket ? ` · ${bucket}` : ''}</strong>
                      <small>{populated && areas ? `Cut ${n2(areas.cutting)} · Fill ${n2(areas.filling)} m²` : 'No ground entered'}</small>
                    </span>
                  </button>
                  <div className="canal-cross-row-ground">
                    <div className="canal-cross-row-mode">
                      <button type="button" className={(section.groundEntryMode ?? 'average') === 'average' ? 'is-active' : ''} onClick={() => {
                        const rl = section.leftToeRl ?? orderCanalPoints(section.ground)[0]?.rl ?? null
                        if (rl != null) {
                          updateToeRls(section, rl, rl)
                        } else {
                          updateSection(section.id, { groundEntryMode: 'average' })
                        }
                      }}>1 RL</button>
                      <button type="button" className={section.groundEntryMode === 'separate' ? 'is-active' : ''} onClick={() => updateSection(section.id, { groundEntryMode: 'separate' })}>Left + Right</button>
                    </div>
                    <div className={`canal-cross-row-fields${section.groundEntryMode === 'separate' ? '' : ' is-average'}`}>
                      <DraftNumber label={section.groundEntryMode === 'separate' ? 'Left toe RL' : 'Average RL'} value={section.leftToeRl ?? orderCanalPoints(section.ground)[0]?.rl ?? null} allowBlank onCommit={(value) => {
                        const right = section.groundEntryMode === 'separate' ? (section.rightToeRl ?? value) : value
                        updateToeRls(section, value, right)
                      }} />
                      {section.groundEntryMode === 'separate' && <DraftNumber label="Right toe RL" value={section.rightToeRl ?? orderCanalPoints(section.ground).at(-1)?.rl ?? null} allowBlank onCommit={(value) => {
                        const left = section.leftToeRl ?? value
                        updateToeRls(section, left, value)
                      }} />}
                    </div>
                  </div>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
        <div className="canal-cross-workspace">
        {selected ? (
          <>
            <div className="canal-cross-chainage-bar">
              <div className="canal-cross-chips">
                {sections.map((section, index) => {
                  const areas = sectionSummaries.get(section.id)
                  const populated = section.ground.length >= 2
                  const bucket = areas ? (areas.cutting > 0.001 && areas.filling > 0.001 ? 'Partial' : areas.cutting > 0.001 ? 'Cutting' : 'Embankment') : null
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={section.id === selected.id ? 'is-active' : ''}
                      onClick={() => setSelectedId(section.id)}
                      title={populated && areas ? `Cut ${n2(areas.cutting)} m² · Fill ${n2(areas.filling)} m² · ${bucket}` : 'Not populated'}
                    >
                      <b>{index + 1}</b> Ch {formatChainage(section.chainage)}{bucket ? ` [${bucket[0]}]` : ''}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="canal-cross-diagram-wrap">
              <CanalSectionDiagram data={data} section={displayedSection ?? selected} />
            </div>

            <section className="canal-cross-ground">
              <div className="canal-cross-panel-title">
                Ground at Ch {formatChainage(selected.chainage)} m
                <small>New canals normally use an average ground RL. Repair canals may use the known left and right bank-toe RLs.</small>
              </div>
              <div className="canal-cross-ground-mode" role="radiogroup" aria-label="Ground level entry mode">
                <label>
                  <input type="radio" checked={groundMode === 'average'} onChange={() => setGroundMode('average')} />
                  Average Ground RL
                </label>
                <label>
                  <input type="radio" checked={groundMode === 'separate'} onChange={() => setGroundMode('separate')} />
                  Left Bank Toe RL + Right Bank Toe RL
                </label>
              </div>
              <div className="canal-cross-ground-quick">
                {groundMode === 'average' ? (
                  <DraftNumber label="Average Ground RL (m)" value={averageRl} allowBlank onCommit={setAverageRl} />
                ) : (
                  <>
                    <DraftNumber label="Left Bank Toe RL (m)" value={leftRl} allowBlank onCommit={setLeftRl} />
                    <DraftNumber label="Right Bank Toe RL (m)" value={rightRl} allowBlank onCommit={setRightRl} />
                  </>
                )}
                <button type="button" className="btn primary" disabled={!ready} onClick={populate}>Populate Design</button>
                <button type="button" className="btn ghost" disabled={!ready} onClick={populateAll}>Populate All Chainages</button>
                <button type="button" className="btn ghost" disabled={sections.findIndex((section) => section.id === selected.id) <= 0} onClick={copyPrevious}>
                  <ClipboardCopy size={13} /> Copy Previous
                </button>
              </div>
            </section>
          </>
        ) : (
          <div className="canal-cross-empty">This canal has no chainages yet.</div>
        )}
        </div>
      </div>

      {selected && (
        <section className="canal-cross-ground canal-section-levels">
          <div className="canal-section-levels-head">
            <div className="canal-cross-panel-title">
              Section Levels
              <small>Enter only surveyed existing-ground points; design levels remain automatic.</small>
            </div>
            <div className="canal-cross-ground-actions">
              <button type="button" className="btn ghost" onClick={addGroundPoint}><Plus size={13} /> Add a point</button>
              <button type="button" className="btn ghost" onClick={() => updateSection(selected.id, { ground: orderCanalPoints(groundPoints) })}><ArrowUpDown size={13} /> Rearrange points</button>
              <button type="button" className="btn ghost" disabled={!groundPoints.length} onClick={() => updateSection(selected.id, { ground: [] })}><Trash2 size={13} /> Clear Existing</button>
              <button type="button" className="btn ghost" disabled={selected.designPopulated === false} onClick={() => updateSection(selected.id, { designPopulated: false, designPointOffsets: [] })}><Trash2 size={13} /> Clear Proposed</button>
            </div>
          </div>
          <div className="canal-cross-level-wrap">
            <table className="canal-cross-level-table">
              <thead><tr><th>Distance from centre-line (m)</th><th>Existing ground level</th><th>Stripped / cut level</th><th>Proposed canal level</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {levelOffsets.map((offset) => {
                  const groundIndex = groundPoints.findIndex((point) => Math.abs(point.offset - offset) < 1e-6)
                  const existing = groundIndex >= 0 ? groundPoints[groundIndex].rl : null
                  const isToe = groundIndex === 0 || groundIndex === groundPoints.length - 1
                  // The first and last surveyed points are the resolved bank
                  // toes. They are exact design/ground contacts, so preserve
                  // their entered RL even when iterative toe solving leaves a
                  // sub-millimetre offset between the two profiles.
                  const proposed = isToe && existing != null
                    ? existing
                    : canalGroundLevelAt(proposedProfile, offset)
                  const cut = canalStrippedOrCutLevelAt(data, displayedSection ?? selected, offset)
                  return (
                    <GroundPointRow
                      key={offset}
                      offsetValue={offset}
                      existingLevel={existing}
                      cutLevel={cut}
                      proposedLevel={proposed}
                      onCommit={(next) => upsertGroundPoint(offset, next)}
                      onRemove={groundIndex >= 0 ? () => updateSection(selected.id, { ground: groundPoints.filter((_, i) => i !== groundIndex) }) : null}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* After Section Levels: Soil Strata Depth Variation */}
      {selected && (
        <CanalSectionSoilProfile
          data={data}
          section={displayedSection ?? selected}
          sections={sections}
          checkedSections={checked}
          onCommit={onCommit}
        />
      )}
    </section>
  )
}
