import { useCallback, useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

/**
 * How many rasterised pages are held at once.
 *
 * Every page used to be rendered up front and kept for as long as the preview
 * was open: a 50-page component meant 50 PNGs, each a ~3 megapixel page, all
 * resident whether or not anyone scrolled to them. The pages near the viewport
 * are the only ones anybody can see, so those are the only ones worth keeping.
 * The cap is deliberately soft — a page that is actually on screen is never
 * dropped, however far the reader has zoomed out.
 */
const RETAINED_PAGES = 12
/** Render this far outside the viewport so scrolling lands on a drawn page. */
const PRERENDER_MARGIN = '150% 0px'

interface PageShape {
  /** Page box in CSS pixels, for the placeholder and the final image alike. */
  displayWidth: number
  aspectRatio: string
}

/**
 * The element that actually scrolls this list, walking out from the list.
 *
 * It is not always the same one. On a component dashboard the page list is its
 * own scroller; inside the Project Print View the list runs at its natural
 * height and an ancestor scrolls. Watching the wrong element ruins the margin
 * in opposite ways — against a non-scrolling root every sheet reads as visible
 * and the whole document rasterises at once, and against the viewport a sheet
 * scrolled out of its own container is clipped away before the margin applies,
 * so nothing renders until it is already being looked at. `null` means the
 * viewport, which is the right answer when nothing in between scrolls.
 */
function nearestScroller(element: HTMLElement | null): HTMLElement | null {
  for (let node = element; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) return node
  }
  return null
}

function PreviewPage({
  index,
  shape,
  url,
  zoom,
  observe
}: {
  index: number
  shape: PageShape
  url: string | undefined
  zoom: number
  observe: (element: HTMLElement) => () => void
}): JSX.Element {
  const ref = useRef<HTMLElement>(null)

  // Observing from the page's own effect keeps it out of the render path: a
  // zoom change re-renders every sheet, and an inline `ref` callback would
  // detach and re-attach all of them each time.
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(element)
  }, [observe])

  return (
    <figure
      ref={ref}
      className="component-print-html-page"
      data-page-index={index}
      style={{
        aspectRatio: shape.aspectRatio,
        width: shape.displayWidth * (zoom / 100)
      }}
    >
      {/* Until the pixels exist the figure is already a correctly sized white
          sheet, so nothing shifts under the scrollbar when they arrive. */}
      {url && <img src={url} alt={`Print page ${index + 1}`} />}
      <figcaption>Page {index + 1}</figcaption>
    </figure>
  )
}

/**
 * Rasterise on demand, in the order the reader actually needs.
 *
 * Page *shapes* are read up front — that is a page-dictionary parse, not a
 * render — so every sheet has its correct frame from the first paint and the
 * scrollbar never jumps as images arrive. Pixels are produced one page at a
 * time for what is on screen, and dropped again once a page is far behind.
 */
export default function PdfPageStack({ src, zoom = 100 }: { src: string; zoom?: number }): JSX.Element {
  const [shapes, setShapes] = useState<PageShape[]>([])
  const [images, setImages] = useState<ReadonlyMap<number, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const imagesRef = useRef(new Map<number, string>())
  const visibleRef = useRef(new Set<number>())
  const queueRef = useRef<number[]>([])
  const drawingRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  /**
   * Bumped whenever the source changes. A render already awaiting the old
   * document must not publish its page into the new one's stack.
   */
  const generationRef = useRef(0)

  /** Drop the rendered page furthest from anything on screen. */
  const evictFurthest = useCallback((): void => {
    const held = imagesRef.current
    if (held.size <= RETAINED_PAGES) return
    const visible = [...visibleRef.current]
    let victim: number | null = null
    let worst = -1
    for (const index of held.keys()) {
      if (visibleRef.current.has(index)) continue
      const distance = visible.length
        ? Math.min(...visible.map((seen) => Math.abs(seen - index)))
        : index
      if (distance > worst) {
        worst = distance
        victim = index
      }
    }
    // Everything held is on screen. Keeping it is the point of the cap.
    if (victim === null) return
    URL.revokeObjectURL(held.get(victim) as string)
    held.delete(victim)
  }, [])

  const drainQueue = useCallback(async (): Promise<void> => {
    if (drawingRef.current) return
    drawingRef.current = true
    const generation = generationRef.current
    const current = (): boolean => generationRef.current === generation
    try {
      // One page at a time. Rasterising is the expensive half of a preview, and
      // running several at once only takes the thread away from scrolling.
      while (current() && queueRef.current.length > 0) {
        const index = queueRef.current.shift() as number
        const pdf = documentRef.current
        if (!pdf || imagesRef.current.has(index)) continue

        const page = await pdf.getPage(index + 1)
        if (!current()) return
        const scale = Math.min(3.5, Math.max(2.5, window.devicePixelRatio * 1.6))
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Could not create the page preview canvas.')
        await page.render({ canvasContext: context, viewport }).promise
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (value) => value ? resolve(value) : reject(new Error('Could not create the page preview.')),
            'image/png'
          )
        })
        // The PNG is the only thing worth keeping; the canvas behind it is
        // megabytes of backing store.
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
        if (!current()) return

        imagesRef.current.set(index, URL.createObjectURL(blob))
        evictFurthest()
        setImages(new Map(imagesRef.current))
      }
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      drawingRef.current = false
    }
  }, [evictFurthest])

  const request = useCallback(
    (index: number): void => {
      if (imagesRef.current.has(index) || queueRef.current.includes(index)) return
      queueRef.current.push(index)
      void drainQueue()
    },
    [drainQueue]
  )

  /**
   * Hand a page its place in the viewport watch. Created on first use rather
   * than in an effect, because a page's own effect runs before its parent's —
   * and by then the container ref is already attached, which is what this needs.
   */
  const observe = useCallback(
    (element: HTMLElement): (() => void) => {
      if (!observerRef.current) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const index = Number((entry.target as HTMLElement).dataset.pageIndex)
              if (!Number.isInteger(index)) continue
              if (entry.isIntersecting) {
                visibleRef.current.add(index)
                request(index)
              } else {
                visibleRef.current.delete(index)
              }
            }
          },
          { root: nearestScroller(containerRef.current), rootMargin: PRERENDER_MARGIN }
        )
      }
      const observer = observerRef.current
      observer.observe(element)
      return () => {
        observer.unobserve(element)
        visibleRef.current.delete(Number(element.dataset.pageIndex))
      }
    },
    [request]
  )

  // Open the document and read every page's shape. Nothing is drawn here.
  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    const held = imagesRef.current
    setShapes([])
    setImages(new Map())
    setError(null)

    const open = async (): Promise<void> => {
      const response = await fetch(src)
      const data = new Uint8Array(await response.arrayBuffer())
      const pdf = await getDocument({ data }).promise
      if (generationRef.current !== generation) {
        await pdf.destroy()
        return
      }
      documentRef.current = pdf
      const measured: PageShape[] = []
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number)
        if (generationRef.current !== generation) return
        const viewport = page.getViewport({ scale: 1 })
        measured.push({
          // PDF points are 72 dpi and CSS is 96; keeping this conversion fixed
          // makes different paper sizes and orientations visibly relative.
          displayWidth: viewport.width * (96 / 72),
          aspectRatio: `${viewport.width} / ${viewport.height}`
        })
        page.cleanup()
      }
      if (generationRef.current !== generation) return
      setShapes(measured)
    }

    void open().catch((reason) => {
      if (generationRef.current === generation) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    })

    return () => {
      generationRef.current += 1
      queueRef.current = []
      visibleRef.current.clear()
      held.forEach((url) => URL.revokeObjectURL(url))
      held.clear()
      observerRef.current?.disconnect()
      observerRef.current = null
      const pdf = documentRef.current
      documentRef.current = null
      void pdf?.destroy()
    }
  }, [src])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (shapes.length === 0) {
    return <div className="component-print-preview-message">Rendering pages...</div>
  }

  return (
    <div className="component-print-html-pages" ref={containerRef}>
      {shapes.map((shape, index) => (
        <PreviewPage
          key={index}
          index={index}
          shape={shape}
          url={images.get(index)}
          zoom={zoom}
          observe={observe}
        />
      ))}
    </div>
  )
}
