import { useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import type { CellRange, ChartDef, ChartType } from '../../types/project'

interface Props {
  mode: 'insert' | 'edit'
  /** Existing chart when editing. */
  initial?: ChartDef
  /** Selection captured when the dialog opened (fallback range). */
  selection: CellRange | null
  /** Live read of the current sheet selection (for "Select on sheet"). */
  readActiveRange: () => CellRange | null
  onSubmit: (chart: ChartDef) => void
  onClose: () => void
}

const TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar / Column' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'doughnut', label: 'Doughnut' },
  { value: 'scatter', label: 'Scatter' }
]
const LEGEND_POS: ChartDef['legendPosition'][] = ['top', 'bottom', 'left', 'right']

function colLabel(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
function colToIndex(s: string): number {
  let n = 0
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
function rangeToA1(r: CellRange): string {
  return `${colLabel(r.startColumn)}${r.startRow + 1}:${colLabel(r.endColumn)}${r.endRow + 1}`
}
function parseA1Range(text: string): CellRange | null {
  const s = text.trim().toUpperCase()
  const pair = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(s)
  if (pair) {
    const c1 = colToIndex(pair[1])
    const r1 = Number(pair[2]) - 1
    const c2 = colToIndex(pair[3])
    const r2 = Number(pair[4]) - 1
    if ([c1, r1, c2, r2].some((n) => n < 0 || !Number.isFinite(n))) return null
    return {
      startRow: Math.min(r1, r2),
      startColumn: Math.min(c1, c2),
      endRow: Math.max(r1, r2),
      endColumn: Math.max(c1, c2)
    }
  }
  const single = /^([A-Z]+)(\d+)$/.exec(s)
  if (single) {
    const c = colToIndex(single[1])
    const r = Number(single[2]) - 1
    if (c < 0 || r < 0) return null
    return { startRow: r, startColumn: c, endRow: r, endColumn: c }
  }
  return null
}
function newId(): string {
  return 'chart_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

export default function ChartConfigModal({
  mode,
  initial,
  selection,
  readActiveRange,
  onSubmit,
  onClose
}: Props): JSX.Element {
  const [type, setType] = useState<ChartType>(initial?.type ?? 'bar')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(initial?.firstRowIsHeader ?? true)
  const [firstColumnIsLabels, setFirstColumnIsLabels] = useState(
    initial?.firstColumnIsLabels ?? true
  )
  const [transpose, setTranspose] = useState(initial?.transpose ?? false)
  const [xAxisTitle, setXAxisTitle] = useState(initial?.xAxisTitle ?? '')
  const [yAxisTitle, setYAxisTitle] = useState(initial?.yAxisTitle ?? '')
  const [showLegend, setShowLegend] = useState(initial?.showLegend ?? true)
  const [legendPosition, setLegendPosition] = useState<NonNullable<ChartDef['legendPosition']>>(
    initial?.legendPosition ?? 'top'
  )
  const [stacked, setStacked] = useState(initial?.stacked ?? false)

  const initialRange = initial?.range ?? selection
  const [range, setRange] = useState<CellRange | null>(initialRange)
  const [rangeText, setRangeText] = useState(initialRange ? rangeToA1(initialRange) : '')
  const [picking, setPicking] = useState(false)

  const isPie = type === 'pie' || type === 'doughnut'
  const supportsStack = type === 'bar' || type === 'area'

  const onRangeText = (v: string): void => {
    setRangeText(v)
    const r = parseA1Range(v)
    if (r) setRange(r)
  }
  const applyPick = (): void => {
    const r = readActiveRange()
    if (r) {
      setRange(r)
      setRangeText(rangeToA1(r))
    }
    setPicking(false)
  }

  const submit = (): void => {
    if (!range) return
    const base: ChartDef =
      mode === 'edit' && initial
        ? { ...initial }
        : {
            id: newId(),
            range,
            type,
            position: { startX: 64, startY: 64, width: 480, height: 300 }
          }
    onSubmit({
      ...base,
      range,
      type,
      title: title.trim() || undefined,
      firstRowIsHeader,
      firstColumnIsLabels,
      transpose,
      xAxisTitle: !isPie ? xAxisTitle.trim() || undefined : undefined,
      yAxisTitle: !isPie ? yAxisTitle.trim() || undefined : undefined,
      showLegend,
      legendPosition,
      stacked: supportsStack ? stacked : undefined
    })
    onClose()
  }

  return (
    <div
      className="pl-overlay"
      style={picking ? { pointerEvents: 'none' } : undefined}
      onMouseDown={picking ? undefined : onClose}
    >
      {picking ? (
        <div className="cc-pickbar" style={{ pointerEvents: 'auto' }}>
          <span>Drag to select the data range on the sheet, then click Apply.</span>
          <button className="btn" onClick={applyPick}>
            Apply
          </button>
          <button className="btn ghost" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      <div
        className="ic-dialog"
        style={picking ? { display: 'none' } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pl-head">
          <BarChart3 size={16} />
          <span className="pl-title">{mode === 'edit' ? 'Edit Chart' : 'Insert Chart'}</span>
          <button className="pl-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="ic-body">
          <div className="ic-field">
            <label className="field-label">Data range</label>
            <div className="ic-row">
              <input
                className="text-input"
                style={{ flex: 1, fontFamily: 'monospace' }}
                value={rangeText}
                onChange={(e) => onRangeText(e.target.value)}
                placeholder="e.g. D6:E10"
              />
              <button className="btn-mini" onClick={() => setPicking(true)}>
                Select on sheet
              </button>
            </div>
            {rangeText && !range ? (
              <div className="ic-hint">Not a valid range — use the form D6:E10.</div>
            ) : (
              <div className="ic-hint">
                Type a range, or click “Select on sheet” to drag-select on the spreadsheet.
              </div>
            )}
          </div>

          <div className="ic-field">
            <label className="field-label">Chart type</label>
            <div className="ic-types">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`pl-chip ${type === t.value ? 'on' : ''}`}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ic-field">
            <label className="field-label">Title (optional)</label>
            <input
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cost by component"
            />
          </div>

          <div className="ic-field">
            <label className="field-label">Data mapping (X / Y)</label>
            <label className="pl-toggle">
              <input
                type="checkbox"
                checked={firstColumnIsLabels}
                onChange={(e) => setFirstColumnIsLabels(e.target.checked)}
              />
              First column = X-axis categories
            </label>
            <label className="pl-toggle">
              <input
                type="checkbox"
                checked={firstRowIsHeader}
                onChange={(e) => setFirstRowIsHeader(e.target.checked)}
              />
              First row = series names (Y / legend)
            </label>
            <label className="pl-toggle">
              <input
                type="checkbox"
                checked={transpose}
                onChange={(e) => setTranspose(e.target.checked)}
              />
              Switch rows / columns (swap what is X vs Y)
            </label>
          </div>

          {!isPie ? (
            <div className="ic-row">
              <div className="ic-field" style={{ flex: 1 }}>
                <label className="field-label">X-axis title</label>
                <input
                  className="text-input"
                  value={xAxisTitle}
                  onChange={(e) => setXAxisTitle(e.target.value)}
                  placeholder="e.g. Month"
                />
              </div>
              <div className="ic-field" style={{ flex: 1 }}>
                <label className="field-label">Y-axis title</label>
                <input
                  className="text-input"
                  value={yAxisTitle}
                  onChange={(e) => setYAxisTitle(e.target.value)}
                  placeholder="e.g. Cost"
                />
              </div>
            </div>
          ) : null}

          <div className="ic-row">
            <label className="pl-toggle" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.target.checked)}
              />
              Legend
            </label>
            {showLegend ? (
              <select
                className="select-input"
                value={legendPosition}
                onChange={(e) =>
                  setLegendPosition(e.target.value as NonNullable<ChartDef['legendPosition']>)
                }
              >
                {LEGEND_POS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : null}
            {supportsStack ? (
              <label className="pl-toggle" style={{ marginBottom: 0, marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={stacked}
                  onChange={(e) => setStacked(e.target.checked)}
                />
                Stacked
              </label>
            ) : null}
          </div>
        </div>

        <div className="pl-foot">
          <span className="pl-foot-note">The chart updates live as the data changes.</span>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={!range}>
            {mode === 'edit' ? 'Save' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  )
}
