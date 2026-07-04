// Chart.js chart rendered inside a Univer floating-DOM layer. Univer passes a
// `data` prop (our { chartId }); the component subscribes to the chart bus for
// live config, renders, reports a PNG snapshot (for print), and offers edit/delete.

import Chart from 'chart.js/auto'
import { useEffect, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { reportPng, requestDelete, requestEdit, requestRefresh, subscribeConfig } from './chartBus'
import type { ChartJsConfig } from '../../lib/chartData'

// Fill the canvas with white behind the chart so the exported PNG used for
// print is opaque instead of showing the sheet/table through it.
const whiteBackground = {
  id: 'whiteBackground',
  beforeDraw: (chart: Chart): void => {
    const ctx = chart.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, chart.width, chart.height)
    ctx.restore()
  }
}

export default function ChartFloat({ data }: { data?: { chartId?: string } }): JSX.Element {
  const chartId = data?.chartId ?? ''
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const typeRef = useRef<string | null>(null)
  const pngTimer = useRef<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(
    chartId ? 'loading' : 'missing'
  )

  useEffect(() => {
    setStatus(chartId ? 'loading' : 'missing')
    if (!chartId) return undefined

    let missingTimer: number | null = window.setTimeout(() => setStatus('missing'), 1500)

    const render = (config: ChartJsConfig): void => {
      if (missingTimer) {
        window.clearTimeout(missingTimer)
        missingTimer = null
      }
      setStatus('ready')

      const canvas = canvasRef.current
      if (!canvas) return

      // Chart.js cannot change `type` via update(); recreate on type change.
      if (chartRef.current && typeRef.current !== config.type) {
        chartRef.current.destroy()
        chartRef.current = null
      }

      if (!chartRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartRef.current = new Chart(canvas, { ...(config as any), plugins: [whiteBackground] })
        typeRef.current = config.type
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartRef.current.data = config.data as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chartRef.current.options = config.options as any
        chartRef.current.update('none')
      }

      window.requestAnimationFrame(() => chartRef.current?.resize())

      if (pngTimer.current) window.clearTimeout(pngTimer.current)
      pngTimer.current = window.setTimeout(() => {
        try {
          reportPng(chartId, canvas.toDataURL('image/png'))
        } catch {
          /* tainted canvas etc. - ignore */
        }
      }, 300)
    }

    const unsub = subscribeConfig(chartId, render)
    requestRefresh(chartId)

    return () => {
      unsub()
      if (missingTimer) window.clearTimeout(missingTimer)
      if (pngTimer.current) window.clearTimeout(pngTimer.current)
      chartRef.current?.destroy()
      chartRef.current = null
      typeRef.current = null
    }
  }, [chartId])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#ffffff',
        border: '1px solid #e0e0e0',
        boxSizing: 'border-box',
        padding: 4
      }}
    >
      <div style={{ position: 'absolute', top: 2, right: 2, zIndex: 2, display: 'flex', gap: 3 }}>
        <button
          onClick={() => requestEdit(chartId)}
          title="Edit chart"
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 3,
            background: 'rgba(0,0,0,0.4)',
            color: '#fff',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => requestDelete(chartId)}
          title="Remove chart"
          style={{
            width: 20,
            height: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 3,
            background: 'rgba(0,0,0,0.4)',
            color: '#fff',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <X size={13} />
        </button>
      </div>

      {status !== 'ready' ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            font: '12px system-ui, -apple-system, Segoe UI, sans-serif',
            pointerEvents: 'none',
            padding: 16,
            textAlign: 'center'
          }}
        >
          {status === 'loading'
            ? 'Loading chart...'
            : 'Chart data is not linked. Open Charts and edit this chart.'}
        </div>
      ) : null}

      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
