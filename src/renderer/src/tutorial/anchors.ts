import type { TutorialTarget } from './types'

/**
 * Finding the control a step is about.
 *
 * Two strategies, in order: an explicit selector (`[data-tour="…"]` where the
 * markup was worth annotating), then the control's own visible text. Text
 * matching is what keeps this file small — the dashboards label their buttons
 * "Sync", "Add Item", and "Print Studio", and those labels are the contract the
 * user already reads, so they are a fair thing to point at.
 */

const CLICKABLE = 'button, a, [role="button"], input, select, textarea, label'

function visible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const style = window.getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function byText(text: string, within?: string): HTMLElement | null {
  const wanted = normalise(text)
  const roots: ParentNode[] = within
    ? Array.from(document.querySelectorAll(within))
    : [document]
  for (const root of roots) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE))
    // Exact first — "Sync" must not match "Syncing…" while a sync is running
    // if a plain "Sync" is also on screen.
    for (const el of candidates) {
      if (!visible(el)) continue
      if (normalise(el.textContent ?? '') === wanted) return el
    }
    for (const el of candidates) {
      if (!visible(el)) continue
      if (normalise(el.textContent ?? '').startsWith(wanted)) return el
    }
    for (const el of candidates) {
      if (!visible(el)) continue
      if (normalise(el.textContent ?? '').includes(wanted)) return el
    }
  }
  return null
}

export function resolveTarget(target?: TutorialTarget): HTMLElement | null {
  if (!target) return null
  if (target.selector) {
    const found = Array.from(document.querySelectorAll<HTMLElement>(target.selector)).find(visible)
    if (found) return found
  }
  if (target.text) return byText(target.text, target.within)
  return null
}

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export function rectOf(el: HTMLElement, pad: number): Rect {
  const r = el.getBoundingClientRect()
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: Math.min(window.innerWidth, r.width + pad * 2),
    height: Math.min(window.innerHeight, r.height + pad * 2)
  }
}

export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  )
}

/** Bring a target into view without yanking the page around unnecessarily. */
export function ensureVisible(el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  const offscreen = r.top < 8 || r.bottom > window.innerHeight - 8
  if (offscreen) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
