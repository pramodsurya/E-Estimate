/** Shared helpers for waiting on Leaflet tiles and fonts before map capture. */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitUntil(check: () => boolean, timeoutMs: number, intervalMs = 80): Promise<boolean> {
  const started = performance.now()
  while (performance.now() - started < timeoutMs) {
    if (check()) return true
    await sleep(intervalMs)
  }
  return check()
}

export async function waitForMapAssets(page: HTMLElement | null): Promise<void> {
  if (!page) throw new Error('The route map page is not ready.')
  await document.fonts?.ready
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const mapReady = await waitUntil(() => {
    const frame = page.querySelector<HTMLElement>('.lead-print-map')
    return Boolean(frame && frame.offsetWidth > 8 && frame.offsetHeight > 8)
  }, 4000)
  if (!mapReady) {
    if (page.querySelector('.lead-print-empty')) {
      throw new Error('No mapped applied Lead routes are available to capture.')
    }
    throw new Error('The route map frame is not ready.')
  }

  await waitUntil(
    () => Boolean(page.querySelector('.leaflet-container[data-lead-map-ready="1"]')),
    2500
  )
  window.dispatchEvent(new Event('resize'))
  await sleep(120)

  await waitUntil(
    () => page.querySelectorAll('.lead-print-map img, img.leaflet-tile').length > 0,
    4000
  )

  const images = Array.from(page.querySelectorAll('img'))
  if (images.length > 0) {
    await Promise.race([
      Promise.all(images.map((image) => new Promise<void>((resolve) => {
        if (image.complete) return resolve()
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      }))),
      sleep(12000)
    ])
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await sleep(180)
}
