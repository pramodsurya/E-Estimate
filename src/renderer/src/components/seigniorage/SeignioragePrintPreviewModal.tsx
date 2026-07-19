import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Printer, Settings, X } from 'lucide-react'
import type { SeignioragePrintSettings, PaperSize, Orientation } from '../../types/project'
import type { SeigniorageCalculation, SeigniorageItemRow } from '../../lib/seigniorage'

interface Props {
  calc: SeigniorageCalculation; projectName: string
  printSettings?: SeignioragePrintSettings
  onUpdatePrintSettings: (s: SeignioragePrintSettings) => void; onClose: () => void
}

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const rateFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DEF: Required<SeignioragePrintSettings> = {
  pageSize: 'A4', orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 }
}

function norm(s?: SeignioragePrintSettings): Required<SeignioragePrintSettings> {
  return {
    pageSize: s?.pageSize ?? DEF.pageSize, orientation: s?.orientation ?? DEF.orientation,
    margins: s?.margins ?? DEF.margins
  }
}

function paperMm(ps: PaperSize): { w: number; h: number } {
  if (ps === 'A3') return { w: 297, h: 420 }
  if (ps === 'Letter') return { w: 216, h: 279 }
  if (ps === 'Legal') return { w: 216, h: 356 }
  return { w: 210, h: 297 }
}

function pageCSS(s: Required<SeignioragePrintSettings>, pageNum: number, total: number): CSSProperties {
  const { w, h } = paperMm(s.pageSize)
  const pw = s.orientation === 'landscape' ? h : w
  const ph = s.orientation === 'landscape' ? w : h
  const m = s.margins
  return {
    width: `${pw}mm`, height: `${ph}mm`,
    padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
    marginBottom: pageNum < total ? '24px' : '0'
  }
}

function seigQtyCalc(row: SeigniorageItemRow): string {
  if (row.conversionRequired) return 'Conversion required'
  const mode = row.mode
  if (mode === 'FULL_ITEM_QUANTITY') {
    return row.itemQuantity != null ? `${qtyFmt.format(row.itemQuantity)} ${row.itemUnit || row.unit}` : '-'
  }
  if (mode === 'DIRECT_RECIPE_QTY') {
    return row.recipeMaterialQty != null
      ? `${qtyFmt.format(row.recipeMaterialQty)} ${row.recipeMaterialUnit || row.unit}`
      : 'Review'
  }
  // RECIPE_MATERIAL_RATIO
  if (row.itemQuantity == null || row.quantityRatio == null) return '-'
  const p = [qtyFmt.format(row.itemQuantity), rateFmt.format(row.quantityRatio)]
  if (row.conversionFactor != null && row.conversionFactor !== 1) p.push(rateFmt.format(row.conversionFactor))
  const q = row.quantity
  return `${p.join(' × ')} = ${q != null ? `${qtyFmt.format(q)} ${row.unit}` : '—'}`
}

// --- Height estimates in mm ---
const HDR_H = 30       // page header
const SUMMARY_H = 38   // summary cards row
const SEC_HEADING_H = 12
const TBL_HEADER_H = 9
const ROW_H = 8
const SUBTOTAL_H = 8
const GRAND_H = 52      // grand total block
const PAGE_BREAK_PAD = 5

interface MatGroup { key: string; label: string; rows: SeigniorageItemRow[]; s: number; d: number; m: number }

function groupByMat(rows: SeigniorageItemRow[]): MatGroup[] {
  const map = new Map<string, MatGroup>()
  for (const r of rows) {
    if (!r.materialKey && !r.charge && r.seigRate === null) continue
    const k = r.materialKey || r.materialLabel || r.charge?.seig_code || 'UNASSIGNED'
    const g = map.get(k) ?? { key: k, label: r.materialLabel || r.charge?.mineral_name || 'Unassigned', rows: [], s: 0, d: 0, m: 0 }
    g.rows.push(r); g.s += r.seigniorage ?? 0; g.d += r.dmft ?? 0; g.m += r.smft ?? 0
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Content on a single printed page. */
interface PageChunk {
  /** First page gets the full header + summary. */
  isFirst: boolean
  /** Each section fragment: { group, rowStart, rowEnd (exclusive), showSubtotal, showHeading, showTableHeader } */
  sections: SectionChunk[]
  /** True if this is the last page and should show the grand total. */
  showGrandTotal: boolean
}

interface SectionChunk {
  group: MatGroup
  rowStart: number
  rowEnd: number   // exclusive
  showHeading: boolean
  showTableHeader: boolean
  showSubtotal: boolean
}

function buildPages(groups: MatGroup[], pageH: number): PageChunk[] {
  const pages: PageChunk[] = []
  let pageIdx = 0
  let used = 0

  function pageHdrH(): number { return HDR_H }
  function newPage(): void { pageIdx++; used = 0; pages.push({ isFirst: false, sections: [], showGrandTotal: false }) }
  function addSection(chunk: SectionChunk): void {
    let h = 0
    if (chunk.showHeading) h += SEC_HEADING_H
    if (chunk.showTableHeader) h += TBL_HEADER_H
    h += (chunk.rowEnd - chunk.rowStart) * ROW_H
    if (chunk.showSubtotal) h += SUBTOTAL_H
    // If section heading alone at bottom, push to next page
    if (used > 0 && used + SEC_HEADING_H + TBL_HEADER_H > pageH && chunk.showHeading) {
      newPage()
    }
    // If doesn't fit at all on current page, new page
    if (used > 0 && used + h > pageH) newPage()
    // If still doesn't fit (first section on page), force split the rows
    if (used + h > pageH && chunk.showHeading) {
      // Try to fit at least heading + header + 1 row
      newPage()
    }
    pages[pageIdx].sections.push(chunk)
    used += h
  }

  // Page 1
  pages.push({ isFirst: true, sections: [], showGrandTotal: false })
  used = pageHdrH() + SUMMARY_H

  for (const g of groups) {
    let rowIdx = 0
    const totalRows = g.rows.length
    let firstChunk = true

    while (rowIdx < totalRows) {
      const remaining = totalRows - rowIdx
      const availForSection = pageH - used
      const headingH = firstChunk ? SEC_HEADING_H : 0
      const tblHdrH = firstChunk ? TBL_HEADER_H : 0
      const fitRows = Math.max(1, Math.floor((availForSection - headingH - tblHdrH - SUBTOTAL_H) / ROW_H))
      const rowsInChunk = Math.min(remaining, fitRows)
      const isLastChunk = rowIdx + rowsInChunk >= totalRows

      if (rowsInChunk <= 0) { newPage(); continue }

      addSection({
        group: g, rowStart: rowIdx, rowEnd: rowIdx + rowsInChunk,
        showHeading: firstChunk,
        showTableHeader: true,
        showSubtotal: isLastChunk
      })

      rowIdx += rowsInChunk
      firstChunk = false
    }
  }

  // Grand total
  if (pages.length === 0) return pages
  const lastPage = pages[pages.length - 1]
  if (used + GRAND_H <= pageH) {
    lastPage.showGrandTotal = true
  } else {
    newPage()
    pages[pages.length - 1].showGrandTotal = true
  }

  return pages
}

export default function SeignioragePrintPreviewModal({ calc, projectName, printSettings, onUpdatePrintSettings, onClose }: Props): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const layout = norm(printSettings)
  const groups = groupByMat(calc.rows)

  const pageH = (layout.orientation === 'landscape' ? paperMm(layout.pageSize).w : paperMm(layout.pageSize).h)
    - layout.margins.top - layout.margins.bottom

  const pages = useMemo(() => buildPages(groups, pageH), [groups, pageH])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="seig-print-overlay" role="dialog" aria-modal="true">
      <div className="seig-print-shell">
        <div className="seig-print-toolbar">
          <div><strong>Seigniorage Print Preview</strong><span>{projectName} | {calc.rows.length} row(s) | {pages.length} page(s)</span></div>
          <div>
            <button className={`btn ghost ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(o => !o)}><Settings size={14} /> Settings</button>
            <button className="btn ghost" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="btn ghost" onClick={onClose}><X size={14} /> Close</button>
          </div>
        </div>
        {settingsOpen && <SettingsPanel layout={layout} onChange={p => onUpdatePrintSettings({ ...layout, ...p })} />}
        <div className="seig-print-scroll">
          {pages.map((page, pi) => (
            <article key={pi} className={`seig-print-page ${layout.orientation}`} style={pageCSS(layout, pi + 1, pages.length)}>
              <header className="seig-print-page-header">
                <div>
                  <h1>Seigniorage Statement</h1>
                  <p>Project: {projectName}{pages.length > 1 ? ` — Page ${pi + 1} of ${pages.length}` : ''}</p>
                </div>
                <strong>E-Estimate</strong>
              </header>
              {page.isFirst && (
                <div className="seig-print-summary">
                  <Card label="Seigniorage" value={calc.totalSeigniorage} />
                  <Card label="DMFT 30%" value={calc.totalDmft} />
                  <Card label="SMFT 2%" value={calc.totalSmft} />
                  <Card label="Grand Total" value={calc.grandTotal} accent />
                </div>
              )}
              {page.sections.map((sec, si) => (
                <section key={`${sec.group.key}-${si}`} className="seig-print-group">
                  {sec.showHeading && <h2 className="seig-print-group-title">{sec.group.label}{!sec.showSubtotal ? ' (cont.)' : ''}</h2>}
                  <table className="seig-print-table">
                    {sec.showTableHeader && <thead><tr>
                      <th className="sp-sl">Sl</th><th className="sp-desc">Description</th>
                      <th className="sp-qty">Total Qty</th><th className="sp-calc">Seigniorage Qty</th>
                      <th className="sp-rate">Rate</th><th className="sp-seig">Seigniorage</th>
                      <th className="sp-dmft">DMFT</th><th className="sp-smft">SMFT</th>
                    </tr></thead>}
                    <tbody>
                      {sec.group.rows.slice(sec.rowStart, sec.rowEnd).map((r, i) => (
                        <tr key={r.id}>
                          <td className="sp-sl">{sec.rowStart + i + 1}</td>
                          <td className="sp-desc">
                            <div className="sp-code">{r.itemCode}</div>
                            {r.recipeMaterialDesc && <div className="sp-mat">{r.materialLabel} - {r.recipeMaterialDesc}</div>}
                            {r.mode && r.mode !== 'RECIPE_MATERIAL_RATIO' && <span className="sp-mode">{r.mode === 'FULL_ITEM_QUANTITY' ? 'Full Qty' : 'Recipe Qty'}</span>}
                            {r.status === 'REVIEW_REQUIRED' && <span className="sp-review">⚠ Review Required</span>}
                          </td>
                          <td className="sp-qty">{r.itemQuantity != null ? `${qtyFmt.format(r.itemQuantity)} ${r.itemUnit || r.unit}` : '-'}</td>
                          <td className="sp-calc">{seigQtyCalc(r)}</td>
                          <td className="sp-rate">{r.seigRate != null ? `Rs. ${rateFmt.format(r.seigRate)}` : '-'}</td>
                          <td className="sp-seig">{r.seigniorage != null ? `Rs. ${money.format(r.seigniorage)}` : '-'}</td>
                          <td className="sp-dmft">{r.dmft != null ? `Rs. ${money.format(r.dmft)}` : '-'}</td>
                          <td className="sp-smft">{r.smft != null ? `Rs. ${money.format(r.smft)}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {sec.showSubtotal && <tfoot><tr>
                      <td colSpan={5} className="sp-desc"><strong>Subtotal — {sec.group.label}</strong></td>
                      <td className="sp-seig">Rs. {money.format(sec.group.s)}</td>
                      <td className="sp-dmft">Rs. {money.format(sec.group.d)}</td>
                      <td className="sp-smft">Rs. {money.format(sec.group.m)}</td>
                    </tr></tfoot>}
                  </table>
                </section>
              ))}
              {page.showGrandTotal && (
                <section className="seig-print-total-section">
                  <table className="seig-print-table seig-print-grand-table">
                    <tbody>
                      <TotRow label="Seigniorage Total" seig={calc.totalSeigniorage} />
                      <TotRow label="DMFT 30%" dmft={calc.totalDmft} />
                      <TotRow label="SMFT 2%" smft={calc.totalSmft} />
                      <tr className="sp-gt"><th className="sp-desc">Grand Total</th><td className="sp-seig">Rs. {money.format(calc.grandTotal)}</td><td className="sp-dmft"></td><td className="sp-smft"></td></tr>
                    </tbody>
                  </table>
                  {calc.roundedGrandTotal !== calc.grandTotal && (
                    <p className="seig-print-rounding-note">Rounded Grand Total: Rs. {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(calc.roundedGrandTotal)}</p>
                  )}
                </section>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div className={`seig-print-summary-card${accent ? ' accent' : ''}`}><div className="spsc-label">{label}</div><div className="spsc-value">Rs. {money.format(value)}</div></div>
}
function TotRow({ label, seig, dmft, smft }: { label: string; seig?: number; dmft?: number; smft?: number }) {
  return <tr><th className="sp-desc">{label}</th><td className="sp-seig">{seig != null ? `Rs. ${money.format(seig)}` : ''}</td><td className="sp-dmft">{dmft != null ? `Rs. ${money.format(dmft)}` : ''}</td><td className="sp-smft">{smft != null ? `Rs. ${money.format(smft)}` : ''}</td></tr>
}
function SettingsPanel({ layout, onChange }: { layout: Required<SeignioragePrintSettings>; onChange: (p: Partial<SeignioragePrintSettings>) => void }) {
  return (
    <div className="seig-print-settings">
      <div className="seig-print-settings-grid">
        <label>Page size<select className="select-input" value={layout.pageSize} onChange={e => onChange({ pageSize: e.target.value as PaperSize })}><option value="A4">A4</option><option value="A3">A3</option><option value="Letter">Letter</option><option value="Legal">Legal</option></select></label>
        <label>Orientation<select className="select-input" value={layout.orientation} onChange={e => onChange({ orientation: e.target.value as Orientation })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        {(['top','right','bottom','left'] as const).map(side => (
          <label key={side}>Margin {side} mm<input className="text-input" type="number" min="0" value={layout.margins[side]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange({ margins: { ...layout.margins, [side]: n } }) }} /></label>
        ))}
      </div>
    </div>
  )
}
