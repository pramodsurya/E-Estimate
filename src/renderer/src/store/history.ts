/**
 * Undo history policy.
 *
 * Kept apart from the store so the rule can be read — and tested — on its own.
 * The store owns the snapshots; this owns the question of when a new edit earns
 * an entry of its own.
 */

/** Snapshots kept on each side of the present. */
export const MAX_HISTORY = 100

/**
 * How long a run of the same kind of edit keeps folding into one undo step.
 *
 * A document editor persists on a 600 ms debounce, so typing used to spend an
 * undo entry every 600 ms — and each entry holds the whole previous document
 * snapshot, images and all. Twenty minutes of typing filled the history with
 * one document, and undo walked back through it 600 ms at a time.
 *
 * The window is longer than that debounce, so continuous typing folds together,
 * and short enough that a pause to think starts a fresh step — which is the
 * behaviour every editor already has.
 */
export const HISTORY_COALESCE_MS = 1500

/** What produced the newest history entry, and when. */
export interface HistoryRun {
  key: string
  at: number
}

/**
 * True when this edit belongs to the run that produced the newest entry, so it
 * should share that entry instead of spending another.
 *
 * `historyDepth` guards the first edit after a project is opened: there is no
 * entry to fold into, so one has to be spent whatever the run says.
 */
export function foldsIntoPreviousEntry(
  run: HistoryRun | null,
  key: string | undefined,
  now: number,
  historyDepth: number
): boolean {
  if (!key || !run || historyDepth === 0) return false
  return run.key === key && now - run.at < HISTORY_COALESCE_MS
}
