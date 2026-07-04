import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { resolveNodeSettings } from '../../lib/nodeSettings'
import { buildPrintHtml } from '../../lib/printRender'
import type {
  CellRange,
  Margins,
  Orientation,
  PaperSize,
  PrintConfig,
  ProjectNode,
  ScaleMode
} from '../../types/project'
import { nodeDisplayName } from '../nodeVisual'

interface Props {
  node: ProjectNode
  getSnapshot: () => unknown | null
  readActiveRange: () => CellRange | null
  onClose: () => void
}

const MARGIN_PRESETS: Record<string, Margins> = {
  Normal: { top: 20, right: 15, bottom: 20, left: 25 },
  Narrow: { top: 10, right: 10, bottom: 10, left: 10 },
  Wide: { top: 25, right: 25, bottom: 25, left: 30 }
}

function colLabel(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function rangeToA1(r: CellRange): string {
  return `${colLabel(r.startColumn)}${r.startRow + 1}:${colLabel(r.endColumn)}${r.endRow + 1}`
}

function marginsEqual(a: Margins, b: Margins): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left
}

export default function PrintLayoutModal({
  node,
  getSnapshot,
  readActiveRange,
  onClose
}: Props): JSX.Element {
  const project = useStore((s) => s.project)
  const setNodePrint = useStore((s) => s.setNodePrint)

  const settings = useMemo(
    () => (project ? resolveNodeSettings(project.root, node.id) : null),
    [project, node.id]
  )

  const [cfg, setCfg] = useState<PrintConfig>(() => {
    const s = settings
    return {
      range: node.print?.range ?? null,
      pageSize: node.print?.pageSize ?? s?.pageSize ?? 'A4',
      orientation: node.print?.orientation ?? s?.orientation ?? 'portrait',
      margins: node.print?.margins ?? s?.margins ?? MARGIN_PRESETS.Normal,
      scaleMode: node.print?.scaleMode ?? 'percent',
      scalePercent: node.print?.scalePercent ?? 100,
      fitToWidthPages: node.print?.fitToWidthPages ?? 1,
      showHeader: node.print?.showHeader ?? false,
      header: node.print?.header ?? { center: '{title}' },
      showFooter: node.print?.showFooter ?? true,
      footer: node.print?.footer ?? {
        left: '{project}',
        center: 'Page {page} of {pages}',
        right: '{date}'
      },
      showGridlines: node.print?.showGridlines ?? true,
      repeatHeaderRows: node.print?.repeatHeaderRows ?? 0,
      showRowColHeaders: node.print?.showRowColHeaders ?? false
    }
  })

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'rendering' | 'error' | 'empty'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const genToken = useRef(0)

  const update = (patch: Partial<PrintConfig>): void => setCfg((c) => ({ ...c, ...patch }))
  const updateMargin = (side: keyof Margins, value: number): void =>
    setCfg((c) => ({ ...c, margins: { ...(c.margins ?? MARGIN_PRESETS.Normal), [side]: value } }))
  const updateHeader = (key: 'left' | 'center' | 'right', value: string): void =>
    setCfg((c) => ({ ...c, header: { ...c.header, [key]: value } }))
  const updateFooter = (key: 'left' | 'center' | 'right', value: string): void =>
    setCfg((c) => ({ ...c, footer: { ...c.footer, [key]: value } }))

  // Persist config (cheap, no undo history) whenever it changes.
  useEffect(() => {
    setNodePrint(node.id, cfg)
  }, [cfg, node.id, setNodePrint])

  // Debounced preview regeneration.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void regenerate()
    }, 350)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg])

  const regenerate = async (): Promise<void> => {
    const token = ++genToken.current
    setStatus('rendering')
    setErrorMsg(null)
    const snapshot = getSnapshot()
    if (!snapshot || !settings) {
      setStatus('error')
      setErrorMsg('Could not read the spreadsheet.')
      return
    }
    const geom = {
      pageSize: (cfg.pageSize ?? settings.pageSize) as PaperSize,
      orientation: (cfg.orientation ?? settings.orientation) as Orientation,
      margins: cfg.margins ?? settings.margins
    }
    const ctx = {
      projectName: project?.meta.name || 'E-Estimate',
      title: nodeDisplayName(node)
    }
    let built: ReturnType<typeof buildPrintHtml>
    try {
      built = buildPrintHtml(snapshot as never, cfg, geom, ctx, node.charts ?? [])
    } catch (err) {
      if (token !== genToken.current) return
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
      return
    }
    if (built.empty) {
      if (token !== genToken.current) return
      setStatus('empty')
      setPdfUrl(null)
      return
    }
    try {
      const res = await window.api.print.toPdf(built.html, built.pdfOptions)
      if (token !== genToken.current) return
      if (res.ok && res.data) {
        setPdfUrl(`data:application/pdf;base64,${res.data}`)
        setStatus('idle')
      } else {
        setStatus('error')
        setErrorMsg(res.error ?? 'Failed to render PDF.')
      }
    } catch (err) {
      if (token !== genToken.current) return
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const setAreaFromSelection = (): void => {
    const r = readActiveRange()
    if (r) update({ range: r })
  }

  const activePreset =
    Object.keys(MARGIN_PRESETS).find(
      (k) => cfg.margins && marginsEqual(cfg.margins, MARGIN_PRESETS[k])
    ) ?? 'Custom'

  const margins = cfg.margins ?? MARGIN_PRESETS.Normal

  return (
    <div className="pl-overlay" onMouseDown={onClose}>
      <div className="pl-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pl-head">
          <Printer size={16} />
          <span className="pl-title">Print Layout</span>
          <span className="pl-sub">{nodeDisplayName(node)}</span>
          <button className="pl-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="pl-body">
          {/* ---------------- Settings ---------------- */}
          <div className="pl-settings">
            <section className="pl-sec">
              <h4>Print Area</h4>
              <div className="pl-area">
                <span className="pl-area-val">
                  {cfg.range ? rangeToA1(cfg.range) : 'Whole used range'}
                </span>
                <div className="pl-area-btns">
                  <button className="btn-mini" onClick={setAreaFromSelection}>
                    Set from selection
                  </button>
                  {cfg.range ? (
                    <button className="btn-mini ghost" onClick={() => update({ range: null })}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="pl-sec">
              <h4>Page</h4>
              <div className="pl-row">
                <label className="pl-field">
                  <span>Paper size</span>
                  <select
                    value={cfg.pageSize}
                    onChange={(e) => update({ pageSize: e.target.value as PaperSize })}
                  >
                    {(['A4', 'A3', 'A2', 'Letter', 'Legal'] as PaperSize[]).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pl-field">
                  <span>Orientation</span>
                  <select
                    value={cfg.orientation}
                    onChange={(e) => update({ orientation: e.target.value as Orientation })}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="pl-sec">
              <h4>Margins (mm)</h4>
              <div className="pl-presets">
                {Object.keys(MARGIN_PRESETS).map((k) => (
                  <button
                    key={k}
                    className={`pl-chip ${activePreset === k ? 'on' : ''}`}
                    onClick={() => update({ margins: { ...MARGIN_PRESETS[k] } })}
                  >
                    {k}
                  </button>
                ))}
                <span className={`pl-chip ${activePreset === 'Custom' ? 'on' : ''}`}>Custom</span>
              </div>
              <div className="pl-row">
                {(['top', 'right', 'bottom', 'left'] as (keyof Margins)[]).map((side) => (
                  <label className="pl-field" key={side}>
                    <span>{side}</span>
                    <input
                      type="number"
                      min={0}
                      value={margins[side]}
                      onChange={(e) => updateMargin(side, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="pl-sec">
              <h4>Scaling</h4>
              <label className="pl-field">
                <span>Mode</span>
                <select
                  value={cfg.scaleMode}
                  onChange={(e) => update({ scaleMode: e.target.value as ScaleMode })}
                >
                  <option value="percent">Adjust to %</option>
                  <option value="fit-width">Fit columns to 1 page wide</option>
                  <option value="fit-page">Fit columns to N pages wide</option>
                </select>
              </label>
              {cfg.scaleMode === 'percent' ? (
                <label className="pl-field">
                  <span>Scale %</span>
                  <input
                    type="number"
                    min={10}
                    max={400}
                    value={cfg.scalePercent}
                    onChange={(e) => update({ scalePercent: Number(e.target.value) })}
                  />
                </label>
              ) : null}
              {cfg.scaleMode === 'fit-page' ? (
                <label className="pl-field">
                  <span>Pages wide</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={cfg.fitToWidthPages}
                    onChange={(e) => update({ fitToWidthPages: Number(e.target.value) })}
                  />
                </label>
              ) : null}
            </section>

            <section className="pl-sec">
              <h4>
                <label className="pl-toggle">
                  <input
                    type="checkbox"
                    checked={cfg.showHeader}
                    onChange={(e) => update({ showHeader: e.target.checked })}
                  />
                  Header
                </label>
              </h4>
              {cfg.showHeader ? (
                <div className="pl-row pl-hf">
                  <input
                    placeholder="Left"
                    value={cfg.header?.left ?? ''}
                    onChange={(e) => updateHeader('left', e.target.value)}
                  />
                  <input
                    placeholder="Center"
                    value={cfg.header?.center ?? ''}
                    onChange={(e) => updateHeader('center', e.target.value)}
                  />
                  <input
                    placeholder="Right"
                    value={cfg.header?.right ?? ''}
                    onChange={(e) => updateHeader('right', e.target.value)}
                  />
                </div>
              ) : null}
              <h4 style={{ marginTop: 10 }}>
                <label className="pl-toggle">
                  <input
                    type="checkbox"
                    checked={cfg.showFooter}
                    onChange={(e) => update({ showFooter: e.target.checked })}
                  />
                  Footer
                </label>
              </h4>
              {cfg.showFooter ? (
                <div className="pl-row pl-hf">
                  <input
                    placeholder="Left"
                    value={cfg.footer?.left ?? ''}
                    onChange={(e) => updateFooter('left', e.target.value)}
                  />
                  <input
                    placeholder="Center"
                    value={cfg.footer?.center ?? ''}
                    onChange={(e) => updateFooter('center', e.target.value)}
                  />
                  <input
                    placeholder="Right"
                    value={cfg.footer?.right ?? ''}
                    onChange={(e) => updateFooter('right', e.target.value)}
                  />
                </div>
              ) : null}
              <p className="pl-hint">
                Tokens: {'{page}'} {'{pages}'} {'{date}'} {'{project}'} {'{title}'}
              </p>
            </section>

            <section className="pl-sec">
              <h4>Sheet options</h4>
              <label className="pl-toggle">
                <input
                  type="checkbox"
                  checked={cfg.showGridlines}
                  onChange={(e) => update({ showGridlines: e.target.checked })}
                />
                Show gridlines
              </label>
              <label className="pl-toggle">
                <input
                  type="checkbox"
                  checked={cfg.showRowColHeaders}
                  onChange={(e) => update({ showRowColHeaders: e.target.checked })}
                />
                Row &amp; column headers
              </label>
              <label className="pl-field">
                <span>Repeat first rows on every page</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={cfg.repeatHeaderRows}
                  onChange={(e) => update({ repeatHeaderRows: Number(e.target.value) })}
                />
              </label>
            </section>
          </div>

          {/* ---------------- Preview ---------------- */}
          <div className="pl-preview">
            <div className="pl-preview-bar">
              <span>Preview</span>
              {status === 'rendering' ? <span className="pl-spin">Rendering…</span> : null}
              <button className="btn-mini" onClick={() => void regenerate()}>
                Refresh
              </button>
            </div>
            <div className="pl-preview-stage">
              {status === 'error' ? (
                <div className="pl-preview-msg error">{errorMsg}</div>
              ) : status === 'empty' ? (
                <div className="pl-preview-msg">Nothing to print — the sheet is empty.</div>
              ) : pdfUrl ? (
                <iframe className="pl-frame" title="Print preview" src={pdfUrl} />
              ) : (
                <div className="pl-preview-msg">Preparing preview…</div>
              )}
            </div>
          </div>
        </div>

        <div className="pl-foot">
          <span className="pl-foot-note">View only — close when done.</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
