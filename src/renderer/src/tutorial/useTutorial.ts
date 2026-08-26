import { create } from 'zustand'
import { CHAPTERS, chapterById } from './chapters'
import { resetGrowthBaselines } from './checks'
import type { TutorialChapter, TutorialStep } from './types'

/**
 * Tutorial state, kept deliberately apart from the project store.
 *
 * The estimate store is about a document that must be saved correctly; this is
 * about whether someone has been shown around. Mixing the two would put
 * teaching state into the undo history and the project file, which is exactly
 * where it does not belong.
 */

const STORAGE_KEY = 'e-estimate.tutorial.v1'

interface Persisted {
  /** Set once the first-launch invitation has been shown and answered. */
  greeted: boolean
  /** Chapter ids the reader has reached the end of. */
  completed: string[]
  /** Where they stopped, so "Resume" is honest. */
  resume: { chapterId: string; stepIndex: number } | null
}

const EMPTY: Persisted = { greeted: false, completed: [], resume: null }

function read(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      greeted: Boolean(parsed.greeted),
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((v) => typeof v === 'string') : [],
      resume:
        parsed.resume && typeof parsed.resume.chapterId === 'string'
          ? { chapterId: parsed.resume.chapterId, stepIndex: Number(parsed.resume.stepIndex) || 0 }
          : null
    }
  } catch {
    // A corrupt or unavailable store must never stop the app opening.
    return EMPTY
  }
}

function write(value: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* ignore — the tutorial is not worth an error dialog */
  }
}

export type TutorialPhase = 'idle' | 'running' | 'complete'

interface TutorialState extends Persisted {
  phase: TutorialPhase
  chapterId: string | null
  stepIndex: number
  /** True while the reader has parked the tutorial rather than dismissed it. */
  paused: boolean

  start: (chapterId: string, stepIndex?: number) => void
  next: () => void
  back: () => void
  goTo: (stepIndex: number) => void
  finishChapter: () => void
  /** Leave the tutorial but remember the place. */
  pause: () => void
  /** Leave the tutorial and stop offering to resume it. */
  skip: () => void
  dismissGreeting: () => void
  resetProgress: () => void
}

export const useTutorial = create<TutorialState>((set, get) => ({
  ...read(),
  phase: 'idle',
  chapterId: null,
  stepIndex: 0,
  paused: false,

  start: (chapterId, stepIndex = 0) => {
    const chapter = chapterById(chapterId)
    if (!chapter) return
    const clamped = Math.min(Math.max(0, stepIndex), chapter.steps.length - 1)
    const persisted: Persisted = {
      greeted: true,
      completed: get().completed,
      resume: { chapterId, stepIndex: clamped }
    }
    write(persisted)
    // Counts recorded during an earlier run mean nothing now.
    resetGrowthBaselines()
    set({ ...persisted, phase: 'running', chapterId, stepIndex: clamped, paused: false })
  },

  next: () => {
    const { chapterId, stepIndex } = get()
    const chapter = chapterId ? chapterById(chapterId) : null
    if (!chapter) return
    if (stepIndex >= chapter.steps.length - 1) {
      get().finishChapter()
      return
    }
    get().goTo(stepIndex + 1)
  },

  back: () => {
    const { stepIndex, phase, chapterId } = get()
    if (phase === 'complete' && chapterId) {
      const chapter = chapterById(chapterId)
      if (chapter) set({ phase: 'running', stepIndex: chapter.steps.length - 1 })
      return
    }
    if (stepIndex > 0) get().goTo(stepIndex - 1)
  },

  goTo: (stepIndex) => {
    const { chapterId, completed } = get()
    if (!chapterId) return
    const chapter = chapterById(chapterId)
    if (!chapter) return
    const clamped = Math.min(Math.max(0, stepIndex), chapter.steps.length - 1)
    const persisted: Persisted = { greeted: true, completed, resume: { chapterId, stepIndex: clamped } }
    write(persisted)
    set({ ...persisted, phase: 'running', stepIndex: clamped })
  },

  finishChapter: () => {
    const { chapterId, completed } = get()
    if (!chapterId) return
    const nextCompleted = completed.includes(chapterId) ? completed : [...completed, chapterId]
    const persisted: Persisted = { greeted: true, completed: nextCompleted, resume: null }
    write(persisted)
    set({ ...persisted, phase: 'complete' })
  },

  pause: () => {
    const { chapterId, stepIndex, completed } = get()
    const persisted: Persisted = {
      greeted: true,
      completed,
      resume: chapterId ? { chapterId, stepIndex } : null
    }
    write(persisted)
    set({ ...persisted, phase: 'idle', paused: true })
  },

  skip: () => {
    const persisted: Persisted = { greeted: true, completed: get().completed, resume: null }
    write(persisted)
    set({ ...persisted, phase: 'idle', chapterId: null, stepIndex: 0, paused: false })
  },

  dismissGreeting: () => {
    const persisted: Persisted = { ...read(), greeted: true }
    write(persisted)
    set({ ...persisted })
  },

  resetProgress: () => {
    write(EMPTY)
    set({ ...EMPTY, phase: 'idle', chapterId: null, stepIndex: 0, paused: false })
  }
}))

/** The chapter and step currently on screen, if any. */
export function useActiveStep(): { chapter: TutorialChapter; step: TutorialStep } | null {
  const phase = useTutorial((s) => s.phase)
  const chapterId = useTutorial((s) => s.chapterId)
  const stepIndex = useTutorial((s) => s.stepIndex)
  if (phase !== 'running' || !chapterId) return null
  const chapter = chapterById(chapterId)
  if (!chapter) return null
  const step = chapter.steps[stepIndex]
  if (!step) return null
  return { chapter, step }
}

/**
 * "STEP 3 OF 12" — counted within the step's own section, so the coached run
 * and each assignment block each count from one, as the design does.
 */
export function sectionPosition(chapter: TutorialChapter, stepIndex: number): { index: number; total: number } | null {
  const step = chapter.steps[stepIndex]
  if (!step?.section) return null
  const peers = chapter.steps.filter((s) => s.section === step.section)
  const index = peers.findIndex((s) => s.id === step.id)
  if (index < 0) return null
  return { index: index + 1, total: peers.length }
}

export function nextChapterAfter(chapterId: string): TutorialChapter | null {
  const at = CHAPTERS.findIndex((c) => c.id === chapterId)
  if (at < 0 || at === CHAPTERS.length - 1) return null
  return CHAPTERS[at + 1]
}
