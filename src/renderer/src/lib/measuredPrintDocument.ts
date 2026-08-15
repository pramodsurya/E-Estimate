/**
 * Lay a print document out for real, in this window, before it is paginated.
 *
 * Documents that are built as HTML strings have a problem the on-screen
 * previews do not: their page planner runs before anything has been laid out,
 * so every height it plans against is a guess. Guessing low strands a row on a
 * page of its own; guessing high leaves a third of the sheet empty. Both were
 * happening in the component abstract.
 *
 * Mounting the same markup in a hidden frame at the exact printable width
 * removes the guess. What comes back is what Chromium will do with it — the
 * frame runs the same engine as the print renderer, at the same 96 dpi.
 *
 * Everything here degrades to `null` rather than throwing: the node test
 * scripts import these modules without a DOM, and a document that cannot be
 * measured is expected to fall back to its estimates.
 */

/** Never let the measuring frame grow a scrollbar — that steals content width. */
const MEASURE_CSS = 'html,body{margin:0;padding:0;overflow:hidden;background:#fff}'

/** Font loading is normally already settled; this only caps a cold start. */
const FONT_WAIT_MS = 400

function withMeasurementCss(html: string): string {
  if (html.includes('</style>')) return html.replace('</style>', `${MEASURE_CSS}</style>`)
  if (html.includes('</head>')) return html.replace('</head>', `<style>${MEASURE_CSS}</style></head>`)
  return `<style>${MEASURE_CSS}</style>${html}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function settle(inner: Document): Promise<void> {
  const fonts = (inner as Document & { fonts?: FontFaceSet }).fonts
  if (fonts?.ready) await Promise.race([fonts.ready.then(() => undefined, () => undefined), delay(FONT_WAIT_MS)])
  const view = inner.defaultView
  if (!view) return
  await new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => resolve())
  })
}

/**
 * Render `html` in a hidden frame `widthPx` wide and read sizes off it.
 *
 * `widthPx` must be the *printable* width — the paper less its page margins —
 * because that is the width the body will have when the print engine renders
 * the same markup.
 */
export async function readMeasuredDocument<T>(
  html: string,
  widthPx: number,
  read: (root: Document) => T | null
): Promise<T | null> {
  if (typeof document === 'undefined' || !document.body || !(widthPx > 0)) return null
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.style.cssText =
    `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:1200px;` +
    'border:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(frame)
  try {
    const inner = frame.contentDocument
    if (!inner) return null
    inner.open()
    inner.write(withMeasurementCss(html))
    inner.close()
    await settle(inner)
    return read(inner)
  } catch {
    return null
  } finally {
    frame.remove()
  }
}

/**
 * Height an element costs its parent's flow, margins included. Table rows carry
 * no margins, but the blocks around them — a heading, a signature band — do,
 * and a page plan that ignores those margins plans a page that is too tall.
 */
export function outerHeight(element: Element | null | undefined): number {
  if (!element) return 0
  const rect = element.getBoundingClientRect()
  const view = element.ownerDocument?.defaultView
  if (!view) return rect.height
  const style = view.getComputedStyle(element)
  const top = Number.parseFloat(style.marginTop) || 0
  const bottom = Number.parseFloat(style.marginBottom) || 0
  return rect.height + top + bottom
}
