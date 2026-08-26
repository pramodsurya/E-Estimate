import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Lightbulb, Loader2 } from 'lucide-react'
import {
  ensureVisible,
  rectOf,
  rectsEqual,
  resolveTarget,
  type Rect
} from '../../tutorial/anchors'
import { advanceFor, isGated } from '../../tutorial/advance'
import { runStepEffect } from '../../tutorial/effects'
import {
  growthBaseline,
  isItemOpen,
  itemEditorIs,
  missingItemCodes,
  readCount,
  stateSatisfied,
  unmeasuredItemCodes
} from '../../tutorial/checks'
import {
  nextChapterAfter,
  sectionPosition,
  useActiveStep,
  useTutorial
} from '../../tutorial/useTutorial'
import { chapterById } from '../../tutorial/chapters'
import type { StepAdvance, TutorialStep } from '../../tutorial/types'

/**
 * The coach mark itself.
 *
 * Two rules hold this together.
 *
 * One: everything except the current target is dimmed, and the dim never
 * swallows a click. The reader is working in the real application, so the
 * highlighted control has to stay pressable.
 *
 * Two — and this is the one worth defending — the card cannot walk itself
 * forward. On any step that asks for an action there is no "Next"; the overlay
 * watches the application and moves on when the thing actually happened. A
 * button that advanced regardless would let the tutorial run ahead of the
 * screen, and then every later card describes somewhere the reader is not.
 */

const CARD_W = 340
const GAP = 14

function placeCard(
  rect: Rect | null,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto',
  cardH: number
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!rect) {
    return { top: Math.max(16, vh / 2 - cardH / 2), left: Math.max(16, vw / 2 - CARD_W / 2) }
  }

  const room = {
    top: rect.top,
    bottom: vh - (rect.top + rect.height),
    left: rect.left,
    right: vw - (rect.left + rect.width)
  }

  let side = placement
  if (side === 'auto') {
    if (room.bottom >= cardH + GAP) side = 'bottom'
    else if (room.top >= cardH + GAP) side = 'top'
    else if (room.right >= CARD_W + GAP) side = 'right'
    else side = 'left'
  }
  // A requested side that plainly does not fit is worse than no preference.
  if (side === 'bottom' && room.bottom < cardH + GAP && room.top >= cardH + GAP) side = 'top'
  if (side === 'top' && room.top < cardH + GAP && room.bottom >= cardH + GAP) side = 'bottom'
  if (side === 'right' && room.right < CARD_W + GAP && room.left >= CARD_W + GAP) side = 'left'
  if (side === 'left' && room.left < CARD_W + GAP && room.right >= CARD_W + GAP) side = 'right'

  let top: number
  let left: number
  switch (side) {
    case 'top':
      top = rect.top - cardH - GAP
      left = rect.left + rect.width / 2 - CARD_W / 2
      break
    case 'left':
      top = rect.top + rect.height / 2 - cardH / 2
      left = rect.left - CARD_W - GAP
      break
    case 'right':
      top = rect.top + rect.height / 2 - cardH / 2
      left = rect.left + rect.width + GAP
      break
    default:
      top = rect.top + rect.height + GAP
      left = rect.left + rect.width / 2 - CARD_W / 2
  }

  return {
    top: Math.min(Math.max(12, top), Math.max(12, vh - cardH - 12)),
    left: Math.min(Math.max(12, left), Math.max(12, vw - CARD_W - 12))
  }
}

/** A stable identity for a predicate-shaped gate, so the poll re-arms per step. */
function predicateKey(advance: StepAdvance | null): string {
  if (!advance) return ''
  switch (advance.on) {
    case 'state':
      return advance.check
    case 'itemOpen':
      return advance.code
    case 'itemEditorIs':
      return `${advance.code}:${advance.editor}`
    default:
      return ''
  }
}

/** What to name the thing the reader has to press. */
function actionName(step: TutorialStep): string {
  if (step.actionLabel) return step.actionLabel
  if (step.target?.text) return step.target.text
  return 'the highlighted control'
}

/** The waiting line, phrased for how this particular step completes. */
function waitingLine(step: TutorialStep, advance: StepAdvance, found: boolean): string {
  if (!found) {
    // Deliberately not "open X" — the reader is often already there and the
    // control simply has not rendered yet. Saying otherwise reads as a bug.
    return step.screen
      ? `Looking for ${actionName(step)} on ${step.screen} — this card waits for you.`
      : `Looking for ${actionName(step)} — this card waits for you.`
  }
  switch (advance.on) {
    case 'click':
      return `Press ${actionName(step)} to carry on.`
    case 'input':
      return 'Fill this in to carry on.'
    case 'appears':
    case 'disappears':
      return 'Do it in the app — this card moves on by itself.'
    case 'itemsExist':
    case 'itemsMeasured':
      return 'Do it in the app — this card moves on by itself.'
    case 'state':
      // A state gate is usually "go somewhere" or "make something exist", and
      // the generic line reads as a shrug. Steps that carry a hint say the
      // actual thing; the rest fall back to the honest generic.
      return advance.hint ?? 'Do it in the app — this card moves on by itself.'
    case 'grew':
      return advance.hint ?? 'Do it in the app — this card moves on by itself.'
    case 'itemOpen':
      return `Open ${advance.code} to carry on.`
    case 'itemEditorIs':
      return `Save the change — this card waits for ${advance.code} to become a ${advance.editor}.`
    default:
      return ''
  }
}

/**
 * For an assignment, the useful thing to show is not "waiting" but *what is
 * still outstanding*. Being told two codes are needed and then having to work
 * out which one you already added is a puzzle nobody asked for.
 */
function outstandingLine(missing: string[], needsQuantity: boolean): string {
  if (missing.length === 0) return 'All done — moving on.'
  const what = needsQuantity ? 'Still to measure' : 'Still to add'
  return `${what}: ${missing.join(', ')}`
}

function CompletionCard(): JSX.Element | null {
  const chapterId = useTutorial((s) => s.chapterId)
  const start = useTutorial((s) => s.start)
  const skip = useTutorial((s) => s.skip)
  const chapter = chapterId ? chapterById(chapterId) : null
  if (!chapter) return null
  const upNext = nextChapterAfter(chapter.id)

  return (
    <div className="tut-scrim" role="dialog" aria-modal="true" aria-label={`Chapter ${chapter.number} complete`}>
      <div className="tut-complete">
        <div className="tut-complete-eyebrow">
          <Check size={13} /> CHAPTER {chapter.number} COMPLETE
        </div>
        <h2>{chapter.complete.title}</h2>
        <ul className="tut-checklist">
          {chapter.complete.checklist.map((line) => (
            <li key={line}>
              <Check size={13} /> <span>{line}</span>
            </li>
          ))}
        </ul>
        {chapter.complete.body && <p className="tut-complete-body">{chapter.complete.body}</p>}

        <div className="tut-complete-foot">
          {upNext ? (
            <div className="tut-upnext">
              <strong>
                Chapter {upNext.number} — {upNext.title}
              </strong>
              <span>
                {upNext.blurb} About {upNext.minutes} minutes.
              </span>
            </div>
          ) : (
            <div className="tut-upnext" />
          )}
          <div className="tut-complete-actions">
            {upNext && (
              <button className="btn" onClick={() => start(upNext.id)}>
                Start chapter {upNext.number} →
              </button>
            )}
            <button className="btn ghost" onClick={() => start(chapter.id, 0)}>
              Replay chapter {chapter.number}
            </button>
            {!upNext && (
              <button className="btn" onClick={skip}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TutorialOverlay(): JSX.Element | null {
  const phase = useTutorial((s) => s.phase)
  const stepIndex = useTutorial((s) => s.stepIndex)
  const next = useTutorial((s) => s.next)
  const back = useTutorial((s) => s.back)
  const goTo = useTutorial((s) => s.goTo)
  const pause = useTutorial((s) => s.pause)
  const skip = useTutorial((s) => s.skip)
  const active = useActiveStep()

  const [rect, setRect] = useState<Rect | null>(null)
  const [found, setFound] = useState(false)
  const [preSatisfied, setPreSatisfied] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  /** True once an assignment card has been read and set aside. */
  const [taskAside, setTaskAside] = useState(false)
  const [cardH, setCardH] = useState(200)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)

  const step = active?.step ?? null
  const chapter = active?.chapter ?? null
  const advance = chapter && step ? advanceFor(chapter.id, step) : null
  // Already where the step wanted you? Then there is nothing to wait for.
  const gated = advance ? isGated(advance) && !preSatisfied : false

  // Track the target's position. Layout in this app moves for reasons the
  // overlay cannot subscribe to — spreadsheets virtualise, panels animate — so
  // a modest polling loop is more honest than a pile of observers.
  useLayoutEffect(() => {
    if (!step) {
      setRect(null)
      setFound(false)
      anchorRef.current = null
      return
    }
    let raf = 0
    let scrolled = false
    const pad = step.target?.pad ?? 6

    const tick = (): void => {
      const el = resolveTarget(step.target)
      anchorRef.current = el
      setFound((prev) => (prev === Boolean(el) ? prev : Boolean(el)))
      if (el) {
        if (!scrolled) {
          scrolled = true
          ensureVisible(el)
        }
        const nextRect = rectOf(el, pad)
        setRect((prev) => (rectsEqual(prev, nextRect) ? prev : nextRect))
      } else {
        setRect((prev) => (prev === null ? prev : null))
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [step])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [step, rect, found, preSatisfied])

  useEffect(() => {
    if (!chapter || !step) return
    runStepEffect(chapter.id, step.id)
  }, [chapter, step])

  useEffect(() => {
    setTaskAside(false)
  }, [stepIndex])

  /**
   * Some controls only exist on hover — the per-row buttons in the Explorer, for
   * one. A coach mark cannot point at something that is `display: none`, and the
   * reader cannot hover a row and read a card about it at the same time. So while
   * the tutorial is running, those controls stay put.
   */
  useEffect(() => {
    const root = document.documentElement
    if (phase !== 'running') {
      root.classList.remove('tutorial-running')
      return
    }
    root.classList.add('tutorial-running')
    return () => root.classList.remove('tutorial-running')
  }, [phase])

  // ---- completion watchers -------------------------------------------------
  // Each of these advances only when the application has visibly changed. None
  // of them can be triggered from the card.

  const wantsClick = advance?.on === 'click'
  const clickSelector = step?.target?.selector
  useEffect(() => {
    if (!wantsClick) return
    const onClick = (event: MouseEvent): void => {
      const target = event.target as Element | null
      if (!target) return

      // A repeated control — every row's "+" carries the same anchor — must
      // count wherever it was pressed, not only on the one the ring happens to
      // be sitting on. So match the selector, and fall back to the ringed
      // element only when the step had no selector to match against.
      const hit = clickSelector
        ? target.closest?.(clickSelector)
        : anchorRef.current?.contains(target)
          ? anchorRef.current
          : null
      if (!hit) return
      if (hit instanceof HTMLButtonElement && hit.disabled) return

      // Let the app handle the click first, then move on.
      window.setTimeout(() => useTutorial.getState().next(), 240)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [wantsClick, clickSelector, stepIndex])

  const wantsInput = advance?.on === 'input'
  useEffect(() => {
    if (!wantsInput) return
    const onEdit = (event: Event): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const target = event.target as Node | null
      if (!target || !anchor.contains(target)) return
      const field = event.target as HTMLInputElement | HTMLSelectElement
      if (typeof field.value === 'string' && field.value.trim().length === 0) return
      window.setTimeout(() => useTutorial.getState().next(), 400)
    }
    document.addEventListener('change', onEdit, true)
    document.addEventListener('blur', onEdit, true)
    return () => {
      document.removeEventListener('change', onEdit, true)
      document.removeEventListener('blur', onEdit, true)
    }
  }, [wantsInput, stepIndex])

  // "appears" and "disappears" both need to know the state at the moment the
  // step opened — otherwise a dialog that is already closed would satisfy a
  // "wait for it to close" step instantly.
  // Cleared for every step, not only the watched ones — otherwise a step that
  // resolved itself leaves the flag set and the next gated step opens unlocked.
  useEffect(() => {
    setPreSatisfied(false)
  }, [stepIndex])

  const watchTarget = advance && (advance.on === 'appears' || advance.on === 'disappears') ? advance : null
  useEffect(() => {
    if (!watchTarget) return
    let raf = 0
    let armed = false
    let settled = 0
    let checkedStart = false
    const wantPresent = watchTarget.on === 'appears'

    const tick = (): void => {
      const present = Boolean(resolveTarget(watchTarget.target))

      if (!checkedStart) {
        checkedStart = true
        if (present === wantPresent) {
          // The reader is already where this step was going to send them —
          // replaying a chapter, or arriving from a different direction. Waiting
          // for a change that has already happened would strand them, so this
          // becomes a card they simply read and dismiss.
          setPreSatisfied(true)
          return
        }
      }

      if (!armed) {
        // Arm only once the starting condition is confirmed, so we are
        // genuinely watching for a change rather than reading a coincidence.
        if (present !== wantPresent) armed = true
      } else if (present === wantPresent) {
        settled += 1
        if (settled > 3) {
          useTutorial.getState().next()
          return
        }
      } else {
        settled = 0
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [watchTarget, stepIndex])

  /**
   * State gates.
   *
   * The same shape as `appears`/`disappears`, and for the same reason: a check
   * that is already true when the step opens is not something to wait for. The
   * reader replaying a chapter, or arriving from a screen they had already
   * visited, would otherwise be stranded in front of a card waiting for work
   * that is done. So a pre-satisfied gate becomes a card to read and continue.
   *
   * Polled rather than subscribed: several of these read derived project data,
   * and a 250ms look is both cheaper and more truthful than trying to enumerate
   * every store path that could change the answer.
   */
  const predicate = useMemo<(() => boolean) | null>(() => {
    if (!advance) return null
    switch (advance.on) {
      case 'state':
        return () => stateSatisfied(advance.check)
      case 'itemOpen':
        return () => isItemOpen(advance.code)
      case 'itemEditorIs':
        return () => itemEditorIs(advance.code, advance.editor)
      default:
        return null
    }
    // Keyed on the reading itself, so the effect below re-arms when the step
    // changes but not on every render of the same step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance?.on, predicateKey(advance)])

  useEffect(() => {
    if (!predicate) return
    if (predicate()) {
      setPreSatisfied(true)
      return
    }
    const timer = window.setInterval(() => {
      if (!predicate()) return
      window.clearInterval(timer)
      useTutorial.getState().next()
    }, 250)
    return () => window.clearInterval(timer)
  }, [predicate, stepIndex])

  /**
   * Growth gates.
   *
   * Deliberately *not* pre-satisfiable. "A point exists" was letting readers
   * past a step they had not done, because the project already had points from
   * an earlier session. What this step is really asking is that the reader make
   * one now, so the baseline is taken when the card opens and the card waits for
   * the number to rise above it.
   */
  const growCount = advance?.on === 'grew' ? advance.count : null
  const growBy = advance?.on === 'grew' ? advance.by ?? 1 : 1
  const growKey = chapter && step ? `${chapter.id}:${step.id}` : ''
  useEffect(() => {
    if (!growCount) return
    const target = growthBaseline(growKey, growCount) + growBy
    const timer = window.setInterval(() => {
      if (readCount(growCount) < target) return
      window.clearInterval(timer)
      useTutorial.getState().next()
    }, 250)
    return () => window.clearInterval(timer)
  }, [growCount, growBy, growKey, stepIndex])

  // Assignments are checked against the project itself, on a slow poll — the
  // reader is off doing several minutes of work, and there is nothing to
  // subscribe to that would be simpler or more truthful than looking.
  const wantedCodes =
    advance?.on === 'itemsExist' || advance?.on === 'itemsMeasured' ? advance.codes : null
  const needsQuantity = advance?.on === 'itemsMeasured'
  const wantedKey = `${needsQuantity ? 'qty' : 'add'}:${wantedCodes?.join('|') ?? ''}`
  useEffect(() => {
    if (!wantedCodes) {
      setMissing([])
      return
    }
    const check = (): void => {
      let outstanding: string[] = []
      try {
        outstanding = needsQuantity
          ? unmeasuredItemCodes(wantedCodes)
          : missingItemCodes(wantedCodes)
      } catch {
        // A project that cannot be read yet is not a reason to strand the reader.
        return
      }
      setMissing((prev) =>
        prev.length === outstanding.length && prev.every((c, i) => c === outstanding[i])
          ? prev
          : outstanding
      )
      if (outstanding.length === 0) useTutorial.getState().next()
    }
    check()
    const timer = window.setInterval(check, 700)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, stepIndex])

  const onKey = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        pause()
      } else if (event.key === 'ArrowLeft' && !(event.target as HTMLElement)?.closest?.('input, textarea')) {
        // Backwards only. There is deliberately no keyboard shortcut forward:
        // the app decides when a step is done.
        back()
      }
    },
    [back, pause]
  )

  useEffect(() => {
    if (phase === 'idle') return
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKey, phase])

  if (phase === 'complete') return <CompletionCard />
  if (!step || !chapter || !advance) return null

  const position = sectionPosition(chapter, stepIndex)
  const eyebrow =
    step.eyebrow ?? (position ? `STEP ${position.index} OF ${position.total}` : `CHAPTER ${chapter.number}`)
  const card = placeCard(rect, step.target?.placement ?? 'auto', cardH)
  const waiting = gated ? waitingLine(step, advance, found) : ''

  return (
    <div className="tut-root" aria-live="polite">
      {/* Dimming. Four panes around the cut-out, so the hole is genuinely
          click-through rather than relying on pointer-events trickery.

          When there is no target — an assignment, or a step whose control is not
          on screen — nothing is dimmed at all. Blacking out the whole window
          points at nothing, and on a step that asks the reader to go and work it
          reads as "you are locked out" even though every click passes through. */}
      {rect ? (
        <>
          <div className="tut-dim" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <div className="tut-dim" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tut-dim" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
          <div
            className="tut-dim"
            style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
          />
          <div
            className={`tut-ring ${gated ? 'waiting' : ''}`}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : null}

      {/* An assignment says so at the top of the screen, where it cannot be
          mistaken for one more thing to read and dismiss. */}
      {step.assignment && (
        <div className="tut-task-banner">
          <span className="tut-task-tag">ASSIGNMENT</span>
          Please complete the task
          {wantedCodes && <span className="tut-task-detail">{outstandingLine(missing, needsQuantity)}</span>}
          {taskAside && (
            <button className="tut-task-reopen" onClick={() => setTaskAside(false)}>
              Show the task
            </button>
          )}
        </div>
      )}

      <div
        className="tut-card"
        ref={cardRef}
        style={{
          top: card.top,
          left: card.left,
          width: CARD_W,
          display: taskAside ? 'none' : undefined
        }}
        role="dialog"
        aria-label={step.title}
      >
        <div className={`tut-eyebrow ${step.assignment ? 'assignment' : ''}`}>
          <Lightbulb size={12} /> {eyebrow}
        </div>
        <h3>{step.title}</h3>
        {step.body && <p>{step.body}</p>}

        {gated ? (
          <>
            <p className={`tut-waiting ${found ? '' : 'elsewhere'}`}>
              <Loader2 size={13} className="tut-spin" />
              <span>{wantedCodes ? outstandingLine(missing, needsQuantity) : waiting}</span>
            </p>
            <div className="tut-actions">
              {step.assignment && (
                // Understood, and out of the way. Not "done" — the banner keeps
                // the task in view and the work still has to actually exist.
                <button className="btn tut-primary" onClick={() => setTaskAside(true)}>
                  {step.primary}
                </button>
              )}
              {stepIndex > 0 && (
                <button className="tut-quiet" onClick={back}>
                  ← Back a step
                </button>
              )}
              <button className="tut-quiet" onClick={skip}>
                {step.secondary ?? 'Skip tutorial'}
              </button>
            </div>
          </>
        ) : (
          <div className="tut-actions">
            <button className="btn tut-primary" onClick={next}>
              {step.primary}
            </button>
            <button className="tut-quiet" onClick={skip}>
              {step.secondary ?? 'Skip tutorial'}
            </button>
          </div>
        )}
      </div>

      <div className="tut-rail" role="tablist" aria-label="Tutorial steps">
        <button className="tut-rail-nav" onClick={back} disabled={stepIndex === 0}>
          Back
        </button>
        <div className="tut-rail-steps">
          {chapter.steps.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === stepIndex}
              // Steps ahead are not reachable from here. Jumping forward is the
              // same mistake as a self-advancing button.
              disabled={i > stepIndex}
              title={i > stepIndex ? 'Not reached yet' : `Back to: ${s.rail}`}
              className={`tut-chip ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
              onClick={() => goTo(i)}
            >
              <span className="tut-chip-n">{i + 1}</span>
              {s.rail}
            </button>
          ))}
        </div>
        <span className="tut-rail-hint">
          {gated ? 'Waiting on you' : 'Read, then continue'} · Esc to park it
        </span>
      </div>
    </div>
  )
}
