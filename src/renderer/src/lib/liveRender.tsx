/**
 * Render a preview component for real, then hand its DOM to the PDF renderer.
 *
 * Some print previews cannot be rebuilt as a string: the Lead route map only
 * exists once Leaflet has laid tiles out, and several preview components derive
 * their pages from measured sizes. Mounting them off-screen in this window lets
 * their effects run exactly as they do on the Project Print View, and the
 * settled markup is what gets printed — so the export is the preview, not a
 * second implementation of it.
 */

import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'

export interface LiveRenderOptions {
  /** Staging width in CSS pixels. Pages with their own mm width ignore it. */
  width?: number
  /** Give up waiting for images/tiles after this long. */
  timeoutMs?: number
  /** Extra settle time after the DOM stops changing. */
  quietMs?: number
  /** Abort the wait; the host is still torn down cleanly. */
  signal?: AbortSignal
  /**
   * Inspect the settled DOM before it is serialised. Sizes are only knowable
   * here — once the markup is a string, nothing has been laid out.
   */
  onMeasure?: (host: HTMLElement) => void
}

const POLL_MS = 120

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait until the mounted subtree stops growing and every image it holds has
 * finished loading. Leaflet adds tiles over several frames, so "stable" means
 * three consecutive polls with the same element and image count.
 */
async function waitForSettled(
  host: HTMLElement,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let previous = ''
  let stableCount = 0
  while (Date.now() < deadline && !signal?.aborted) {
    const images = Array.from(host.querySelectorAll('img'))
    const pending = images.filter((image) => !image.complete).length
    const signature = `${host.querySelectorAll('*').length}:${images.length}:${pending}`
    stableCount = signature === previous ? stableCount + 1 : 0
    previous = signature
    if (pending === 0 && stableCount >= 2) return
    await delay(POLL_MS)
  }
}

/**
 * Mount `element` off-screen, wait for it to settle, and return its markup.
 * The host is always removed, including when the caller's work throws.
 */
export async function renderLiveHtml(
  element: ReactElement,
  options: LiveRenderOptions = {}
): Promise<string> {
  const { width, timeoutMs = 15000, quietMs = 150, signal, onMeasure } = options
  const host = document.createElement('div')
  // Off-screen rather than hidden: the components need real layout, and
  // `display:none` would leave Leaflet with a zero-sized container.
  host.style.cssText = [
    'position:fixed',
    'left:-30000px',
    'top:0',
    'z-index:-1',
    'background:#fff',
    'pointer-events:none',
    width ? `width:${width}px` : ''
  ]
    .filter(Boolean)
    .join(';')
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    root.render(element)
    await nextFrame()
    await waitForSettled(host, timeoutMs, signal)
    await delay(quietMs)
    onMeasure?.(host)
    return host.innerHTML
  } finally {
    root.unmount()
    host.remove()
  }
}
