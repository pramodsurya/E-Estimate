import { useEffect, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

interface RenderedPage {
  url: string
  width: number
  height: number
  displayWidth: number
}

export default function PdfPageStack({ src }: { src: string }): JSX.Element {
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    setPages([])
    setError(null)

    const render = async (): Promise<void> => {
      const response = await fetch(src)
      const data = new Uint8Array(await response.arrayBuffer())
      const pdf = await getDocument({ data }).promise
      const rendered: RenderedPage[] = []
      const renderScale = Math.min(3.5, Math.max(2.5, window.devicePixelRatio * 1.6))

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled) return
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: renderScale })
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
        const url = URL.createObjectURL(blob)
        urls.push(url)
        rendered.push({
          url,
          width: viewport.width,
          height: viewport.height,
          // PDF points use 72 dpi; CSS uses 96 dpi. Keeping this conversion
          // constant makes different paper sizes/orientations visibly relative.
          displayWidth: (viewport.width / renderScale) * (96 / 72)
        })
        if (!cancelled) setPages([...rendered])
        page.cleanup()
      }
      await pdf.destroy()
    }

    void render().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
    })

    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [src])

  if (error) return <div className="component-print-preview-message error">{error}</div>
  if (pages.length === 0) {
    return <div className="component-print-preview-message">Rendering pages...</div>
  }

  return (
    <div className="component-print-html-pages">
      {pages.map((page, index) => (
        <figure
          key={page.url}
          className="component-print-html-page"
          style={{
            aspectRatio: `${page.width} / ${page.height}`,
            width: page.displayWidth,
            maxWidth: '94%'
          }}
        >
          <img src={page.url} alt={`Print page ${index + 1}`} />
          <figcaption>Page {index + 1}</figcaption>
        </figure>
      ))}
    </div>
  )
}
