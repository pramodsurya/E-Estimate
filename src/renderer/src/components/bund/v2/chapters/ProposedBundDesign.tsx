import { useEffect, useMemo, useRef, useState } from 'react'
import type { BundDesign } from '../../../../types/project'
import { topLevelFromFreeBoard } from '../../../../lib/bund'

type DraftKey = 'ftl' | 'mwl' | 'freeBoard'
type DesignPatch = Pick<BundDesign, DraftKey>

const displayValue = (value: number | null): string => value == null ? '' : String(value)

const parsedDraft = (raw: string): number | null | undefined => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

const formatLevel = (value: number): string =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

export default function ProposedBundDesign({
  design,
  onCommit,
  mode = 'new'
}: {
  design: BundDesign
  onCommit: (patch: Partial<BundDesign>) => void
  /** Repairs use the surveyed/design TBL directly; new bunds derive it from freeboard. */
  mode?: 'new' | 'repair'
}): JSX.Element {
  const [draft, setDraft] = useState<Record<DraftKey, string>>(() => ({
    ftl: displayValue(design.ftl),
    mwl: displayValue(design.mwl),
    freeBoard: displayValue(design.freeBoard)
  }))
  const [topLevelDraft, setTopLevelDraft] = useState(() => displayValue(design.topLevel))
  const focused = useRef<DraftKey | null>(null)
  const topLevelFocused = useRef(false)

  useEffect(() => {
    setDraft((current) => ({
      ftl: focused.current === 'ftl' ? current.ftl : displayValue(design.ftl),
      mwl: focused.current === 'mwl' ? current.mwl : displayValue(design.mwl),
      freeBoard:
        focused.current === 'freeBoard' ? current.freeBoard : displayValue(design.freeBoard)
    }))
  }, [design.ftl, design.freeBoard, design.mwl])

  useEffect(() => {
    if (!topLevelFocused.current) setTopLevelDraft(displayValue(design.topLevel))
  }, [design.topLevel])

  const draftValues = useMemo<DesignPatch>(() => ({
    ftl: parsedDraft(draft.ftl) ?? null,
    mwl: parsedDraft(draft.mwl) ?? null,
    freeBoard: parsedDraft(draft.freeBoard) ?? null
  }), [draft])

  const derivedTopLevel = topLevelFromFreeBoard({
    ...design,
    mwl: draftValues.mwl,
    freeBoard: draftValues.freeBoard
  })

  const dirty =
    draft.ftl !== displayValue(design.ftl) ||
    draft.mwl !== displayValue(design.mwl) ||
    draft.freeBoard !== displayValue(design.freeBoard)

  const commit = (key: DraftKey): void => {
    const value = parsedDraft(draft[key])
    if (value === undefined) {
      setDraft((current) => ({ ...current, [key]: displayValue(design[key]) }))
      return
    }
    if (value === design[key]) return
    const patch: Partial<BundDesign> = { [key]: value }
    if (key === 'mwl' || key === 'freeBoard') {
      const nextDesign = { ...design, ...patch }
      const nextTopLevel = topLevelFromFreeBoard(nextDesign)
      if (nextTopLevel != null) patch.topLevel = nextTopLevel
    }
    onCommit(patch)
  }

  const field = (
    key: DraftKey,
    label: string,
    placeholder: string
  ): JSX.Element => (
    <label className="bund-v2-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft[key]}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = key
        }}
        onChange={(event) => {
          const value = event.target.value
          setDraft((current) => ({ ...current, [key]: value }))
        }}
        onBlur={() => {
          focused.current = null
          commit(key)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft((current) => ({ ...current, [key]: displayValue(design[key]) }))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )

  return (
    <section className="bund-v2-section" aria-labelledby="bund-v2-proposed-design-title">
      <header className="bund-v2-section-header">
        <div>
          <span className="bund-v2-section-kicker">Design section</span>
          <h2 id="bund-v2-proposed-design-title">1. Proposed Bund Design</h2>
          <p>{mode === 'new'
            ? 'Set the common water levels and free board for the complete bund.'
            : 'Set the repair water levels and proposed top bund level for the complete bund.'}</p>
        </div>
        <span className={`bund-v2-save-state${dirty ? ' is-editing' : ''}`} aria-live="polite">
          {dirty ? 'Editing' : 'Saved'}
        </span>
      </header>

      <div className="bund-v2-panel">
        <div className="bund-v2-panel-title">Proposed Bund Levels</div>
        <div className="bund-v2-level-grid">
          {field('ftl', 'Full tank level, FTL (RL)', '—')}
          {field('mwl', 'Max water level, MWL (RL)', '—')}
          {mode === 'new' ? (
            <>
              {field('freeBoard', 'Free board above MWL (m)', '—')}
              <label className="bund-v2-field">
                <span>Calculated top bund level, TBL (RL)</span>
                <input
                  type="text"
                  value={derivedTopLevel == null ? '' : formatLevel(derivedTopLevel)}
                  placeholder="Calculated from MWL + freeboard"
                  readOnly
                  aria-readonly="true"
                  className="is-calculated"
                />
              </label>
            </>
          ) : (
            <label className="bund-v2-field">
              <span>Top bund level, TBL (RL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={topLevelDraft}
                placeholder="—"
                onFocus={() => { topLevelFocused.current = true }}
                onChange={(event) => setTopLevelDraft(event.target.value)}
                onBlur={() => {
                  topLevelFocused.current = false
                  const next = parsedDraft(topLevelDraft)
                  if (next === undefined || next == null) {
                    setTopLevelDraft(displayValue(design.topLevel))
                  } else if (next !== design.topLevel) {
                    onCommit({ topLevel: next })
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') {
                    setTopLevelDraft(displayValue(design.topLevel))
                    event.currentTarget.blur()
                  }
                }}
              />
            </label>
          )}
        </div>

        <div className="bund-v2-formula" role="note">
          {mode === 'repair' ? (
            <>Repair TBL is entered directly so it can match the approved repaired profile. It is not recalculated from free board.</>
          ) : derivedTopLevel == null || draftValues.mwl == null || draftValues.freeBoard == null ? (
            <>
              Enter MWL and the free board. TBL is calculated automatically and is not typed.
            </>
          ) : (
            <>
              TBL = MWL {formatLevel(draftValues.mwl)} + free board{' '}
              {formatLevel(draftValues.freeBoard)} = <strong>{formatLevel(derivedTopLevel)}</strong>.
              It is not typed here—change MWL or the free board and the crest follows.
            </>
          )}
        </div>
      </div>
    </section>
  )
}
