import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ClipboardCopy, Plus, Trash2 } from 'lucide-react'
import type {
  BundBerm,
  BundBermSide,
  BundData,
  BundPoint,
  BundSection
} from '../../../../types/project'
import {
  automaticStrippedLevelAt,
  bermIssues,
  copySectionGeometry,
  defaultBundBerm,
  designSurfaceAt,
  existLevelAt,
  formatChainage,
  hasMeasurableGround,
  maxBundHeight,
  orderedSections,
  projectedProfile,
  sectionAreas,
  sectionDesignOffsets,
  sevenPointDesignFromGroundLevels,
  strippedProfile,
  upstreamToeOffset
} from '../../../../lib/bund'
import BundBermDiagram from '../../BundBermDiagram'
import BundSectionDiagram from '../../BundSectionDiagram'

interface LevelDraftRow {
  id: string
  offset: string
  existing: string
}

const n3 = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

const rowId = (): string => `level-${Date.now()}-${Math.random().toString(36).slice(2)}`

const exactLevel = (points: BundPoint[], offset: number): number | null =>
  points.find((point) => Math.abs(point.offset - offset) < 1e-6)?.rl ?? null

const usesSeparateToeLevels = (section: BundSection, defaultToAverage: boolean): boolean =>
  section.separateToeLevels ?? (
    !defaultToAverage ||
    (
      section.upstreamGroundLevel != null &&
      section.downstreamGroundLevel != null &&
      Math.abs(section.upstreamGroundLevel - section.downstreamGroundLevel) > 1e-6
    )
  )

function DraftNumber({
  label,
  value,
  allowBlank = false,
  onCommit
}: {
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
    if (draft.trim() === '' && allowBlank) {
      if (value != null) onCommit(null)
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
    <label className="bund-v2-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => { focused.current = true }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          focused.current = false
          commit()
        }}
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

export default function CrossSectionsBermDesign({
  data,
  onCommit
}: {
  data: BundData
  onCommit: (update: (current: BundData) => BundData) => void
}): JSX.Element {
  const sections = useMemo(() => orderedSections(data), [data])
  const sectionSummaries = useMemo(() => new Map(
    sections.map((section) => [section.id, {
      areas: sectionAreas(data, section),
      measurable: hasMeasurableGround(data, section)
    }])
  ), [data, sections])
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null)
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0] ?? null
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [copyFrom, setCopyFrom] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [rows, setRows] = useState<LevelDraftRow[]>([])
  const toeOrigin = selected ? upstreamToeOffset(selected, data) : 0

  useEffect(() => {
    if (!selected) {
      setRows([])
      return
    }
    const offsets = new Set(selected.pre.map((point) => point.offset))
    const hiddenOffsets = new Set(
      (selected.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
    )
    if ((selected.designPointOffsets?.length ?? 0) >= 2) {
      sectionDesignOffsets(selected, data.design).forEach((offset) => {
        const rounded = Math.round(offset * 1000) / 1000
        if (!hiddenOffsets.has(rounded) || exactLevel(selected.pre, offset) != null) {
          offsets.add(offset)
        }
      })
    }
    setRows(
      [...offsets]
        .sort((a, b) => a - b)
        .map((offset) => ({
          id: rowId(),
          offset: String(Math.round((offset - toeOrigin) * 1000) / 1000),
          existing: exactLevel(selected.pre, offset)?.toString() ?? ''
        }))
    )
    setMessage(null)
  }, [
    data.design,
    selected?.designPointOffsets,
    selected?.hiddenLevelOffsets,
    selected?.id,
    selected?.pre,
    toeOrigin
  ])

  const updateSection = (
    sectionId: string,
    patch: Partial<BundSection>
  ): void => onCommit((current) => ({
    ...current,
    sections: current.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch } : section
    )
  }))

  const commitLevelRow = (row: LevelDraftRow): void => {
    if (!selected) return
    const distance = Number(row.offset)
    const rl = Number(row.existing)
    if (!Number.isFinite(distance) || !Number.isFinite(rl) || row.existing.trim() === '') return
    const offset = distance + toeOrigin
    const next = selected.pre
      .filter((point) => Math.abs(point.offset - offset) >= 1e-6)
      .concat({ offset, rl })
      .sort((a, b) => a.offset - b.offset)
    updateSection(selected.id, { pre: next })
  }

  const removeLevelRow = (row: LevelDraftRow): void => {
    if (!selected) return
    const distance = Number(row.offset)
    const offset = distance + toeOrigin
    setRows((current) => current.filter((candidate) => candidate.id !== row.id))
    if (Number.isFinite(offset)) {
      updateSection(selected.id, {
        pre: selected.pre.filter((point) => Math.abs(point.offset - offset) >= 1e-6)
      })
    }
  }

  const rearrangePoints = (): void => {
    if (!selected) return
    const numericRows = rows
      .map((row) => {
        const distance = Number(row.offset)
        if (!Number.isFinite(distance)) return null
        const offset = distance + toeOrigin
        const typedExisting = row.existing.trim() === '' ? null : Number(row.existing)
        const existing =
          typedExisting != null && Number.isFinite(typedExisting)
            ? typedExisting
            : selected.pre.length >= 2
              ? existLevelAt(selected.pre, offset)
              : null
        const proposedLevel = proposedCleared
          ? null
          : projected.length >= 2
            ? existLevelAt(projected, offset)
            : designSurfaceAt(offset, data.design)
        const strippedLevel =
          existing == null || proposedLevel == null
            ? null
            : automaticStrippedLevelAt(existing, proposedLevel, data.design)
        return { row, offset, existing, stripped: strippedLevel, proposed: proposedLevel }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => a.offset - b.offset)

    if (numericRows.length < 3) {
      setRows(numericRows.map(({ row }) => row))
      setMessage('Points are arranged. At least three valid points are needed to remove a redundant middle point.')
      return
    }

    const designOffsets = sectionDesignOffsets(selected, data.design)
    const protectedOffsets = new Set<number>()
    if (designOffsets.length) {
      protectedOffsets.add(Math.round(Math.min(...designOffsets) * 1000) / 1000)
      protectedOffsets.add(Math.round(Math.max(...designOffsets) * 1000) / 1000)
    }
    const onLine = (
      beforeOffset: number,
      beforeValue: number | null,
      candidateOffset: number,
      candidateValue: number | null,
      afterOffset: number,
      afterValue: number | null
    ): boolean => {
      if (beforeValue == null || candidateValue == null || afterValue == null) return false
      if (Math.abs(afterOffset - beforeOffset) < 1e-9) return false
      const ratio = (candidateOffset - beforeOffset) / (afterOffset - beforeOffset)
      const expected = beforeValue + (afterValue - beforeValue) * ratio
      return Math.abs(candidateValue - expected) <= 0.001
    }

    const working = [...numericRows]
    const removedOffsets: number[] = []
    let removedOne = true
    while (removedOne && working.length >= 3) {
      removedOne = false
      for (let index = 1; index < working.length - 1; index += 1) {
        const before = working[index - 1]
        const candidate = working[index]
        const after = working[index + 1]
        if (protectedOffsets.has(Math.round(candidate.offset * 1000) / 1000)) continue
        if (
          onLine(before.offset, before.existing, candidate.offset, candidate.existing, after.offset, after.existing) &&
          onLine(before.offset, before.stripped, candidate.offset, candidate.stripped, after.offset, after.stripped) &&
          onLine(before.offset, before.proposed, candidate.offset, candidate.proposed, after.offset, after.proposed)
        ) {
          removedOffsets.push(candidate.offset)
          working.splice(index, 1)
          removedOne = true
          break
        }
      }
    }

    const generated = new Set(
      designOffsets.map((offset) => Math.round(offset * 1000) / 1000)
    )
    const hidden = new Set(
      (selected.hiddenLevelOffsets ?? []).map((offset) => Math.round(offset * 1000) / 1000)
    )
    removedOffsets.forEach((offset) => {
      const rounded = Math.round(offset * 1000) / 1000
      if (generated.has(rounded)) hidden.add(rounded)
    })
    const remainingPre = selected.pre.filter(
      (point) => !removedOffsets.some((offset) => Math.abs(offset - point.offset) < 1e-6)
    )
    updateSection(selected.id, {
      pre: remainingPre,
      hiddenLevelOffsets: [...hidden].sort((a, b) => a - b)
    })
    setRows(working.map(({ row }) => row))
    setMessage(
      removedOffsets.length
        ? `Points arranged. Removed ${removedOffsets.length} redundant point${removedOffsets.length === 1 ? '' : 's'}.`
        : 'Points were already arranged. No redundant points were removed.'
    )
  }

  const clearProposed = (): void => {
    if (!selected) return
    updateSection(selected.id, {
      projected: [],
      projectedOverrides: undefined,
      designPointOffsets: [],
      hiddenLevelOffsets: []
    })
    setMessage('Proposed design points cleared for this chainage.')
  }

  const populateDesignPoints = (): void => {
    if (!selected) return
    const upstream = selected.upstreamGroundLevel
    const downstream = selected.downstreamGroundLevel
    if (upstream == null || downstream == null) {
      setMessage('Enter both toe ground RLs for this chainage.')
      return
    }
    const points = sevenPointDesignFromGroundLevels(upstream, downstream, data.design)
    if (!points.length) {
      setMessage('Toe RLs must be below TBL, and crest width and slopes must be greater than zero.')
      return
    }
    const toeExisting = [
      { offset: points[0].offset, rl: upstream },
      { offset: points[points.length - 1].offset, rl: downstream }
    ]
    const manual = selected.pre.filter(
      (point) => !toeExisting.some((toe) => Math.abs(toe.offset - point.offset) < 1e-6)
    )
    updateSection(selected.id, {
      pre: [...manual, ...toeExisting].sort((a, b) => a.offset - b.offset),
      projected: null,
      projectedOverrides: undefined,
      designPointOffsets: points.map((point) => point.offset),
      hiddenLevelOffsets: []
    })
    setMessage(`${points.length} design points populated for this chainage.`)
  }

  const populateAllReadySections = (): void => {
    let populated = 0
    let incomplete = 0
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        const separate = usesSeparateToeLevels(section, current.sameToeLevels)
        const commonToe = section.upstreamGroundLevel ?? section.downstreamGroundLevel
        const upstream = separate ? section.upstreamGroundLevel : commonToe
        const downstream = separate ? section.downstreamGroundLevel : commonToe
        if (upstream == null || downstream == null) {
          incomplete += 1
          return section
        }
        const points = sevenPointDesignFromGroundLevels(upstream, downstream, current.design)
        if (!points.length) {
          incomplete += 1
          return section
        }
        const toeExisting = [
          { offset: points[0].offset, rl: upstream },
          { offset: points[points.length - 1].offset, rl: downstream }
        ]
        const manual = section.pre.filter(
          (point) => !toeExisting.some((toe) => Math.abs(toe.offset - point.offset) < 1e-6)
        )
        populated += 1
        return {
          ...section,
          upstreamGroundLevel: upstream,
          downstreamGroundLevel: downstream,
          pre: [...manual, ...toeExisting].sort((a, b) => a.offset - b.offset),
          projected: null,
          projectedOverrides: undefined,
          designPointOffsets: points.map((point) => point.offset),
          hiddenLevelOffsets: []
        }
      })
    }))
    setMessage(
      populated
        ? `Design points populated for ${populated} section${populated === 1 ? '' : 's'}${incomplete ? `; ${incomplete} incomplete section${incomplete === 1 ? '' : 's'} left unchanged` : ''}.`
        : 'No sections were ready. Enter the required toe RL value(s) first.'
    )
  }

  const copyFromSection = (sourceId: string): void => {
    if (!selected) return
    const source = sections.find((section) => section.id === sourceId)
    if (!source || source.id === selected.id) return
    updateSection(selected.id, copySectionGeometry(selected, source))
  }

  const copyTargets = sections.filter(
    (section) => checked.has(section.id) && section.id !== selected?.id
  )

  const applyToChecked = (): void => {
    if (!selected || copyTargets.length === 0) return
    const ids = new Set(copyTargets.map((section) => section.id))
    onCommit((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        ids.has(section.id) ? copySectionGeometry(section, selected) : section
      )
    }))
    setChecked(new Set())
  }

  const addBerm = (side: BundBermSide): void => {
    const height = maxBundHeight(data)
    const drop = height > 0 ? Math.min(6, height / 2) : 6
    onCommit((current) => ({
      ...current,
      design: {
        ...current.design,
        berms: [...current.design.berms, defaultBundBerm(side, current.design.topLevel - drop)]
      }
    }))
  }

  const patchBerm = (bermId: string, patch: Partial<BundBerm>): void =>
    onCommit((current) => ({
      ...current,
      design: {
        ...current.design,
        berms: current.design.berms.map((berm) =>
          berm.id === bermId ? { ...berm, ...patch } : berm
        )
      }
    }))

  const removeBerm = (bermId: string): void =>
    onCommit((current) => ({
      ...current,
      design: {
        ...current.design,
        berms: current.design.berms.filter((berm) => berm.id !== bermId)
      }
    }))

  const renderBerm = (berm: BundBerm, index: number): JSX.Element => {
    const issues = bermIssues(data, berm)
    return (
      <article key={berm.id} className="bund-v2-berm-row">
        <header>
          <strong>{berm.side === 'us' ? 'U/S' : 'D/S'} Berm {index + 1}</strong>
          <button
            type="button"
            onClick={() => removeBerm(berm.id)}
            aria-label={`Remove ${berm.side === 'us' ? 'upstream' : 'downstream'} berm ${index + 1}`}
          >
            <Trash2 size={14} />
          </button>
        </header>
        <div className="bund-v2-berm-card-body">
          <div className="bund-v2-berm-diagram">
            <BundBermDiagram data={data} berm={berm} />
          </div>
          <div className="bund-v2-berm-grid">
            <DraftNumber
              label="Shelf RL"
              value={berm.level}
              onCommit={(level) => level != null && patchBerm(berm.id, { level })}
            />
            <DraftNumber
              label="Shelf width (m)"
              value={berm.width}
              onCommit={(width) => width != null && patchBerm(berm.id, { width })}
            />
            <DraftNumber
              label="Slope below (blank = face slope)"
              value={berm.slopeBelow}
              allowBlank
              onCommit={(slopeBelow) => patchBerm(berm.id, { slopeBelow })}
            />
            <DraftNumber
              label="Cross-fall (1 in …)"
              value={berm.crossFall}
              onCommit={(crossFall) => crossFall != null && patchBerm(berm.id, { crossFall })}
            />
          </div>
        </div>
        {issues.map((issue, issueIndex) => (
          <div
            key={`${berm.id}-${issueIndex}`}
            className={`bund-v2-validation is-${issue.level}`}
          >
            {issue.message}
          </div>
        ))}
      </article>
    )
  }

  const proposedCleared = Boolean(
    selected && Array.isArray(selected.projected) && selected.projected.length === 0
  )
  const projected = selected ? projectedProfile(selected, data.design) : []
  const stripped = selected ? strippedProfile(selected, data.design) : []
  return (
    <section className="bund-v2-section" aria-labelledby="bund-v2-cross-sections-title">
      <header className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Chapter 3</span>
          <h2 id="bund-v2-cross-sections-title">3. Cross-Sections &amp; Berm Design</h2>
          <p>Enter surveyed ground by chainage and add shelves where the bund height requires them.</p>
        </div>
        <span className="bund-v2-save-state">Saved</span>
      </header>

      <div className="bund-v2-cross-layout">
        <aside className="bund-v2-section-list">
          <div className="bund-v2-section-list-head">
            <div>
              <strong>Cross-sections</strong>
              <small>One average or separate U/S and D/S RLs</small>
            </div>
            <label>
              <input
                type="checkbox"
                checked={sections.length > 0 && sections.every((section) => checked.has(section.id))}
                onChange={() => setChecked(
                  sections.every((section) => checked.has(section.id))
                    ? new Set()
                    : new Set(sections.map((section) => section.id))
                )}
              />
              Select all
            </label>
          </div>
          <div className="bund-v2-list-bulk-action">
            <button type="button" className="btn primary" onClick={populateAllReadySections}>
              Populate all ready sections
            </button>
          </div>
          <div className="bund-v2-section-rows">
            {sections.map((section, index) => {
              const summary = sectionSummaries.get(section.id)
              const areas = summary?.areas
              const filled = summary?.measurable ?? false
              const separateToeLevels = usesSeparateToeLevels(section, data.sameToeLevels)
              return (
                <div
                  key={section.id}
                  className={`bund-v2-section-row${section.id === selected?.id ? ' is-active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(section.id)}
                    onChange={() => setChecked((current) => {
                      const next = new Set(current)
                      if (next.has(section.id)) next.delete(section.id)
                      else next.add(section.id)
                      return next
                    })}
                    aria-label={`Select chainage ${formatChainage(section.chainage, data.chainageUnit)}`}
                  />
                  <div className="bund-v2-section-row-content">
                    <button type="button" onClick={() => setSelectedId(section.id)}>
                      <strong>{index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)} m</strong>
                      <small>
                        {filled && areas
                          ? `${n3(areas.formation)} m² fill · ${n3(areas.stripping)} m² exc.`
                          : 'No design points yet'}
                      </small>
                    </button>
                    <div className="bund-v2-section-toe-controls">
                      <div className="bund-v2-section-toe-mode" aria-label="Toe RL entry mode">
                        <button
                          type="button"
                          className={!separateToeLevels ? 'is-active' : ''}
                          onClick={() => {
                            const common = section.upstreamGroundLevel ?? section.downstreamGroundLevel ?? null
                            updateSection(section.id, {
                              separateToeLevels: false,
                              upstreamGroundLevel: common,
                              downstreamGroundLevel: common
                            })
                          }}
                        >
                          1 RL
                        </button>
                        <button
                          type="button"
                          className={separateToeLevels ? 'is-active' : ''}
                          onClick={() => updateSection(section.id, { separateToeLevels: true })}
                        >
                          U/S + D/S
                        </button>
                      </div>
                      <div className={`bund-v2-section-toes${separateToeLevels ? '' : ' is-average'}`}>
                        <DraftNumber
                          label={separateToeLevels ? 'U/S RL' : 'Toe RL'}
                          value={section.upstreamGroundLevel ?? null}
                          allowBlank
                          onCommit={(value) => updateSection(section.id, {
                            upstreamGroundLevel: value,
                            ...(!separateToeLevels ? { downstreamGroundLevel: value } : {})
                          })}
                        />
                        {separateToeLevels && (
                          <DraftNumber
                            label="D/S RL"
                            value={section.downstreamGroundLevel ?? null}
                            allowBlank
                            onCommit={(value) => updateSection(section.id, { downstreamGroundLevel: value })}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="bund-v2-copy-tools">
            <button
              type="button"
              className="btn ghost"
              disabled={!selected || sections.findIndex((section) => section.id === selected.id) <= 0}
              onClick={() => {
                if (!selected) return
                const index = sections.findIndex((section) => section.id === selected.id)
                if (index > 0) copyFromSection(sections[index - 1].id)
              }}
            >
              <ClipboardCopy size={13} /> Copy previous
            </button>
            <select
              value={copyFrom}
              onChange={(event) => {
                setCopyFrom(event.target.value)
                if (event.target.value) copyFromSection(event.target.value)
                setCopyFrom('')
              }}
            >
              <option value="">Copy from a section…</option>
              {sections.filter((section) => section.id !== selected?.id).map((section, index) => (
                <option key={section.id} value={section.id}>
                  {index + 1} · Ch {formatChainage(section.chainage, data.chainageUnit)}
                </option>
              ))}
            </select>
            {copyTargets.length > 0 && (
              <button type="button" className="btn" onClick={applyToChecked}>
                Apply profile to {copyTargets.length} selected
              </button>
            )}
          </div>
        </aside>

        <div className="bund-v2-cross-workspace">
          {selected && (
            <>
              <div className="bund-v2-chainage-chips">
                {sections.map((section, index) => (
                  <button
                    key={section.id}
                    type="button"
                    className={section.id === selected.id ? 'is-active' : ''}
                    onClick={() => setSelectedId(section.id)}
                  >
                    <b>{index + 1}</b> Ch {formatChainage(section.chainage, data.chainageUnit)}
                  </button>
                ))}
              </div>

              <div className="bund-v2-diagram-wrap">
                <BundSectionDiagram data={data} section={selected} />
              </div>

              <div className="bund-v2-section-editor">
                <section className="bund-v2-toe-entry">
                  <div className="bund-v2-toe-heading">
                    <div className="bund-v2-panel-title">Ground at Design Toes</div>
                    <small>Choose one level for flat seating or separate levels where the ground falls across the section.</small>
                  </div>
                  <div className="bund-v2-toe-mode" role="radiogroup" aria-label="Toe ground entry mode">
                    <label className="bund-v2-radio">
                      <input
                        type="radio"
                        checked={!usesSeparateToeLevels(selected, data.sameToeLevels)}
                        onChange={() => {
                          const common = selected.upstreamGroundLevel ?? selected.downstreamGroundLevel ?? null
                          updateSection(selected.id, {
                            separateToeLevels: false,
                            upstreamGroundLevel: common,
                            downstreamGroundLevel: common
                          })
                        }}
                      />
                      One average RL
                    </label>
                    <label className="bund-v2-radio">
                      <input
                        type="radio"
                        checked={usesSeparateToeLevels(selected, data.sameToeLevels)}
                        onChange={() => updateSection(selected.id, { separateToeLevels: true })}
                      />
                      Separate U/S and D/S RLs
                    </label>
                  </div>
                  <div className="bund-v2-toe-fields">
                    <DraftNumber
                      label={usesSeparateToeLevels(selected, data.sameToeLevels) ? 'Upstream toe RL' : 'Average toe RL'}
                      value={selected.upstreamGroundLevel ?? null}
                      allowBlank
                      onCommit={(value) => updateSection(selected.id, {
                        upstreamGroundLevel: value,
                        ...(!usesSeparateToeLevels(selected, data.sameToeLevels) ? { downstreamGroundLevel: value } : {})
                      })}
                    />
                    {usesSeparateToeLevels(selected, data.sameToeLevels) && (
                      <DraftNumber
                        label="Downstream toe RL"
                        value={selected.downstreamGroundLevel ?? null}
                        allowBlank
                        onCommit={(value) => updateSection(selected.id, { downstreamGroundLevel: value })}
                      />
                    )}
                  </div>
                  <button type="button" className="btn primary bund-v2-populate" onClick={populateDesignPoints}>
                    Populate this section
                  </button>
                  {message && <div className="bund-v2-inline-message" role="status">{message}</div>}
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <>
                <div className="bund-v2-level-editor">
                  <div className="bund-v2-level-actions">
                    <div>
                      <strong>Section Levels</strong>
                      <small>Enter only surveyed existing-ground points; design levels remain automatic.</small>
                    </div>
                    <span className="bund-v2-level-action-buttons">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setRows((current) => [
                        ...current,
                        { id: rowId(), offset: '', existing: '' }
                      ])}
                    >
                      <Plus size={13} /> Add a point
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={rearrangePoints}
                    >
                      <ArrowUpDown size={13} /> Rearrange points
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        updateSection(selected.id, {
                          pre: [],
                          upstreamGroundLevel: null,
                          downstreamGroundLevel: null,
                          designPointOffsets: []
                        })
                      }}
                    >
                      <Trash2 size={13} /> Clear Existing
                    </button>
                    <button type="button" className="btn ghost" onClick={clearProposed}>
                      <Trash2 size={13} /> Clear Proposed
                    </button>
                    </span>
                  </div>
                  <div className="bund-v2-level-table-wrap">
                    <table className="bund-v2-level-table">
                      <thead>
                        <tr>
                          <th>Distance from U/S toe (m)</th>
                          <th>Existing ground level</th>
                          <th>Stripped / cut level</th>
                          <th>Proposed bund level</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const distance = Number(row.offset)
                          const offset = distance + toeOrigin
                          const existing = row.existing.trim() === '' ? null : Number(row.existing)
                          const proposedLevel = proposedCleared
                            ? null
                            : Number.isFinite(offset) && projected.length >= 2
                              ? existLevelAt(projected, offset)
                              : Number.isFinite(offset) ? designSurfaceAt(offset, data.design) : null
                          const strippedLevel =
                            Number.isFinite(existing) && proposedLevel != null
                              ? automaticStrippedLevelAt(existing as number, proposedLevel, data.design)
                              : Number.isFinite(offset) && stripped.length >= 2
                                ? existLevelAt(stripped, offset)
                                : null
                          return (
                            <tr key={row.id}>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.offset}
                                  onChange={(event) => setRows((current) => current.map((candidate) =>
                                    candidate.id === row.id ? { ...candidate, offset: event.target.value } : candidate
                                  ))}
                                  onBlur={() => commitLevelRow(row)}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.existing}
                                  onChange={(event) => setRows((current) => current.map((candidate) =>
                                    candidate.id === row.id ? { ...candidate, existing: event.target.value } : candidate
                                  ))}
                                  onBlur={() => commitLevelRow(row)}
                                />
                              </td>
                              <td><input readOnly value={strippedLevel == null ? '' : n3(strippedLevel)} /></td>
                              <td><input readOnly value={proposedLevel == null ? '' : n3(proposedLevel)} /></td>
                              <td>
                                <button type="button" onClick={() => removeLevelRow(row)} aria-label="Remove point">
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              <section className="bund-v2-berms">
                <div className="bund-v2-berm-heading">
                  <div>
                    <div className="bund-v2-panel-title">Berm Add-on</div>
                    <p>Add horizontal shelves to either face. Changes appear in every applicable cross-section.</p>
                  </div>
                </div>
                <div className="bund-v2-berm-columns">
                  <section className="bund-v2-berm-face is-upstream">
                    <header>
                      <div>
                        <strong>Upstream Berms</strong>
                        <small>Left face</small>
                      </div>
                      <button type="button" className="btn ghost" onClick={() => addBerm('us')}>
                        <Plus size={13} /> Add U/S berm
                      </button>
                    </header>
                    {data.design.berms.filter((berm) => berm.side === 'us').length === 0 ? (
                      <div className="bund-v2-empty-state">No upstream berms.</div>
                    ) : (
                      <div className="bund-v2-berm-list">
                        {data.design.berms
                          .filter((berm) => berm.side === 'us')
                          .map(renderBerm)}
                      </div>
                    )}
                  </section>

                  <section className="bund-v2-berm-face is-downstream">
                    <header>
                      <div>
                        <strong>Downstream Berms</strong>
                        <small>Right face</small>
                      </div>
                      <button type="button" className="btn ghost" onClick={() => addBerm('ds')}>
                        <Plus size={13} /> Add D/S berm
                      </button>
                    </header>
                    {data.design.berms.filter((berm) => berm.side === 'ds').length === 0 ? (
                      <div className="bund-v2-empty-state">No downstream berms.</div>
                    ) : (
                      <div className="bund-v2-berm-list">
                        {data.design.berms
                          .filter((berm) => berm.side === 'ds')
                          .map(renderBerm)}
                      </div>
                    )}
                  </section>
                </div>
              </section>

            </>
          )}
    </section>
  )
}
