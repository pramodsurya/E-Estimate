import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Printer, Settings, X } from 'lucide-react'
import type {
  SeignioragePrintSettings,
  PaperSize,
  Orientation,
  SignatureFooterSettings
} from '../../types/project'
import { PERMIT_GO_REFERENCE, seigniorageItemDisplayName } from '../../lib/seigniorage'
import type { SeigniorageCalculation, SeigniorageItemRow } from '../../lib/seigniorage'
import { buildPages, groupByMat, paperMm, seigQtyCalc } from '../../lib/seignioragePrintLayout'
import SignatureFooterPrint from '../signature/SignatureFooterPrint'

interface Props {
  calc: SeigniorageCalculation; projectName: string
  printSettings?: SeignioragePrintSettings
  signatureFooter?: SignatureFooterSettings
  onUpdatePrintSettings: (s: SeignioragePrintSettings) => void; onClose: () => void
}

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })
const rateFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DEF: Required<SeignioragePrintSettings> = {
  pageSize: 'A4', orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
  fontPercent: 100
}

function norm(s?: SeignioragePrintSettings): Required<SeignioragePrintSettings> {
  return {
    pageSize: s?.pageSize ?? DEF.pageSize, orientation: s?.orientation ?? DEF.orientation,
    margins: s?.margins ?? DEF.margins,
    fontPercent: s?.fontPercent ?? DEF.fontPercent
  }
}

function pageCSS(
  s: Required<SeignioragePrintSettings>,
  pageNum: number,
  total: number,
  signatureFooter?: SignatureFooterSettings
): CSSProperties {
  const { w, h } = paperMm(s.pageSize)
  const pw = s.orientation === 'landscape' ? h : w
  const ph = s.orientation === 'landscape' ? w : h
  const m = {
    ...s.margins,
    bottom:
      signatureFooter?.enabled && signatureFooter.placement === 'every_page'
        ? Math.max(s.margins.bottom, 28)
        : s.margins.bottom
  }
  return {
    width: `${pw}mm`, height: `${ph}mm`,
    padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
    marginBottom: pageNum < total ? '24px' : '0',
    // Every font-size inside the page is calc(Npx * var(--seig-font)). Passed
    // as a string so no renderer can append a unit to the multiplier.
    ['--seig-font' as string]: String(s.fontPercent / 100)
  }
}

/** The exact page stack used inside the Seigniorage Print Preview dialog. */
export function SeignioragePrintPages({
  calc,
  projectName,
  printSettings,
  signatureFooter
}: {
  calc: SeigniorageCalculation
  projectName: string
  printSettings?: SeignioragePrintSettings
  signatureFooter?: SignatureFooterSettings
}): JSX.Element {
  const layout = norm(printSettings)
  const groups = groupByMat(calc.rows)
  const pageH =
    (layout.orientation === 'landscape'
      ? paperMm(layout.pageSize).w
      : paperMm(layout.pageSize).h) -
    layout.margins.top -
    (signatureFooter?.enabled && signatureFooter.placement === 'every_page'
      ? Math.max(layout.margins.bottom, 28)
      : layout.margins.bottom)
  const pages = useMemo(
    () => buildPages(groups, pageH, layout.fontPercent / 100),
    [groups, pageH, layout.fontPercent]
  )

  return (
    <div className="seig-print-scroll seig-print-embedded">
      {pages.map((page, pi) => (
        <article key={pi} className={`seig-print-page ${layout.orientation}`} style={pageCSS(layout, pi + 1, pages.length, signatureFooter)}>
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
              <Card label="Permit fee" value={calc.totalPermit} />
              <Card label="Grand Total" value={calc.grandTotal} accent />
            </div>
          )}
          {page.sections.map((sec, si) => (
            <section key={`${sec.group.key}-${si}`} className="seig-print-group">
              <h2 className="seig-print-group-title">
                {sec.group.label}
                {sec.isContinuation && <span className="seig-print-cont"> (continued)</span>}
              </h2>
              <table className="seig-print-table">
                <thead><tr>
                  <th className="sp-sl">Sl</th><th className="sp-desc">Description</th>
                  <th className="sp-qty">Total Qty</th><th className="sp-calc">Seigniorage Qty</th>
                  <th className="sp-rate">Rate</th><th className="sp-seig">Seigniorage</th>
                  <th className="sp-dmft">DMFT</th><th className="sp-smft">SMFT</th>
                  <th className="sp-permit">Permit fee<br />(% of seigniorage)</th>
                </tr></thead>
                <tbody>
                  {sec.group.rows.slice(sec.rowStart, sec.rowEnd).map((r, i) => (
                    <tr key={r.id}>
                      <td className="sp-sl">{sec.rowStart + i + 1}</td>
                      <td className="sp-desc">
                        <div className="sp-code">{seigniorageItemDisplayName(r)}</div>
                        {(r.materialLabel || r.recipeMaterialDesc) && (
                          <div className="sp-mat">
                            {[r.materialLabel, r.recipeMaterialDesc].filter(Boolean).join(' - ')}
                          </div>
                        )}
                        {r.mode && r.mode !== 'RECIPE_MATERIAL_RATIO' && (
                          <span className="sp-mode">{printModeLabel(r.mode)}</span>
                        )}
                        {r.status === 'REVIEW_REQUIRED' && <span className="sp-review">⚠ Review Required</span>}
                      </td>
                      <td className="sp-qty">{r.itemQuantity != null ? `${qtyFmt.format(r.itemQuantity)} ${r.itemUnit || r.unit}` : '-'}</td>
                      <td className="sp-calc">{seigQtyCalc(r)}</td>
                      <td className="sp-rate">{r.seigRate != null ? `Rs. ${rateFmt.format(r.seigRate)}` : '-'}</td>
                      <td className="sp-seig">{r.seigniorage != null ? `Rs. ${money.format(r.seigniorage)}` : '-'}</td>
                      <td className="sp-dmft">{r.dmft != null ? `Rs. ${money.format(r.dmft)}` : '-'}</td>
                      <td className="sp-smft">{r.smft != null ? `Rs. ${money.format(r.smft)}` : '-'}</td>
                      <td className="sp-permit">{r.permit != null ? <>Rs. {money.format(r.permit)}<span className="sp-permit-pct">@ {r.permitPercent}%</span></> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                {sec.showSubtotal && <tfoot><tr>
                  <td colSpan={5} className="sp-desc"><strong>Subtotal — {sec.group.label}</strong></td>
                  <td className="sp-seig">Rs. {money.format(sec.group.s)}</td>
                  <td className="sp-dmft">Rs. {money.format(sec.group.d)}</td>
                  <td className="sp-smft">Rs. {money.format(sec.group.m)}</td>
                  <td className="sp-permit">Rs. {money.format(sec.group.p)}</td>
                </tr></tfoot>}
              </table>
            </section>
          ))}
          {page.showGrandTotal && (
            <section className="seig-print-total-section">
              <table className="seig-print-table seig-print-grand-table"><tbody>
                <TotRow label="Seigniorage Total" seig={calc.totalSeigniorage} />
                <TotRow label="DMFT 30%" dmft={calc.totalDmft} />
                <TotRow label="SMFT 2%" smft={calc.totalSmft} />
                <TotRow label={PERMIT_BASIS_NOTE} permit={calc.totalPermit} />
                <tr className="sp-gt"><th className="sp-desc">Grand Total</th><td className="sp-seig">Rs. {money.format(calc.grandTotal)}</td><td className="sp-dmft"></td><td className="sp-smft"></td><td className="sp-permit"></td></tr>
              </tbody></table>
              {calc.roundedGrandTotal !== calc.grandTotal && <p className="seig-print-rounding-note">Rounded Grand Total: Rs. {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(calc.roundedGrandTotal)}</p>}
            </section>
          )}
          {signatureFooter?.enabled &&
            (signatureFooter.placement === 'every_page' || pi === pages.length - 1) && (
              <SignatureFooterPrint settings={signatureFooter} />
            )}
        </article>
      ))}
    </div>
  )
}

export default function SeignioragePrintPreviewModal({ calc, projectName, printSettings, signatureFooter, onUpdatePrintSettings, onClose }: Props): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const layout = norm(printSettings)
  const groups = groupByMat(calc.rows)

  const pageH = (layout.orientation === 'landscape' ? paperMm(layout.pageSize).w : paperMm(layout.pageSize).h)
    - layout.margins.top -
    (signatureFooter?.enabled && signatureFooter.placement === 'every_page'
      ? Math.max(layout.margins.bottom, 28)
      : layout.margins.bottom)

  const pages = useMemo(
    () => buildPages(groups, pageH, layout.fontPercent / 100),
    [groups, pageH, layout.fontPercent]
  )

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
            <article key={pi} className={`seig-print-page ${layout.orientation}`} style={pageCSS(layout, pi + 1, pages.length, signatureFooter)}>
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
                  <Card label="Permit fee" value={calc.totalPermit} />
                  <Card label="Grand Total" value={calc.grandTotal} accent />
                </div>
              )}
              {page.sections.map((sec, si) => (
                <section key={`${sec.group.key}-${si}`} className="seig-print-group">
                  <h2 className="seig-print-group-title">
                    {sec.group.label}
                    {sec.isContinuation && <span className="seig-print-cont"> (continued)</span>}
                  </h2>
                  <table className="seig-print-table">
                    <thead><tr>
                      <th className="sp-sl">Sl</th><th className="sp-desc">Description</th>
                      <th className="sp-qty">Total Qty</th><th className="sp-calc">Seigniorage Qty</th>
                      <th className="sp-rate">Rate</th><th className="sp-seig">Seigniorage</th>
                      <th className="sp-dmft">DMFT</th><th className="sp-smft">SMFT</th>
                      <th className="sp-permit">Permit fee<br />(% of seigniorage)</th>
                    </tr></thead>
                    <tbody>
                      {sec.group.rows.slice(sec.rowStart, sec.rowEnd).map((r, i) => (
                        <tr key={r.id}>
                          <td className="sp-sl">{sec.rowStart + i + 1}</td>
                          <td className="sp-desc">
                            <div className="sp-code">{seigniorageItemDisplayName(r)}</div>
                            {(r.materialLabel || r.recipeMaterialDesc) && (
                              <div className="sp-mat">
                                {[r.materialLabel, r.recipeMaterialDesc].filter(Boolean).join(' - ')}
                              </div>
                            )}
                            {r.mode && r.mode !== 'RECIPE_MATERIAL_RATIO' && (
                              <span className="sp-mode">{printModeLabel(r.mode)}</span>
                            )}
                            {r.status === 'REVIEW_REQUIRED' && <span className="sp-review">⚠ Review Required</span>}
                          </td>
                          <td className="sp-qty">{r.itemQuantity != null ? `${qtyFmt.format(r.itemQuantity)} ${r.itemUnit || r.unit}` : '-'}</td>
                          <td className="sp-calc">{seigQtyCalc(r)}</td>
                          <td className="sp-rate">{r.seigRate != null ? `Rs. ${rateFmt.format(r.seigRate)}` : '-'}</td>
                          <td className="sp-seig">{r.seigniorage != null ? `Rs. ${money.format(r.seigniorage)}` : '-'}</td>
                          <td className="sp-dmft">{r.dmft != null ? `Rs. ${money.format(r.dmft)}` : '-'}</td>
                          <td className="sp-smft">{r.smft != null ? `Rs. ${money.format(r.smft)}` : '-'}</td>
                          <td className="sp-permit">{r.permit != null ? <>Rs. {money.format(r.permit)}<span className="sp-permit-pct">@ {r.permitPercent}%</span></> : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {sec.showSubtotal && <tfoot><tr>
                      <td colSpan={5} className="sp-desc"><strong>Subtotal — {sec.group.label}</strong></td>
                      <td className="sp-seig">Rs. {money.format(sec.group.s)}</td>
                      <td className="sp-dmft">Rs. {money.format(sec.group.d)}</td>
                      <td className="sp-smft">Rs. {money.format(sec.group.m)}</td>
                      <td className="sp-permit">Rs. {money.format(sec.group.p)}</td>
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
                      <TotRow label={PERMIT_BASIS_NOTE} permit={calc.totalPermit} />
                      <tr className="sp-gt"><th className="sp-desc">Grand Total</th><td className="sp-seig">Rs. {money.format(calc.grandTotal)}</td><td className="sp-dmft"></td><td className="sp-smft"></td><td className="sp-permit"></td></tr>
                    </tbody>
                  </table>
                  {calc.roundedGrandTotal !== calc.grandTotal && (
                    <p className="seig-print-rounding-note">Rounded Grand Total: Rs. {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(calc.roundedGrandTotal)}</p>
                  )}
                </section>
              )}
              {signatureFooter?.enabled &&
                (signatureFooter.placement === 'every_page' || pi === pages.length - 1) && (
                  <SignatureFooterPrint settings={signatureFooter} />
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
function printModeLabel(mode: string): string {
  if (mode === 'FULL_ITEM_QUANTITY') return 'Full Qty'
  if (mode === 'ADDON_MATERIAL_RATIO') return 'Selected Add-on'
  return 'Recipe Qty'
}
function TotRow({ label, seig, dmft, smft, permit }: { label: string; seig?: number; dmft?: number; smft?: number; permit?: number }) {
  return <tr><th className="sp-desc">{label}</th><td className="sp-seig">{seig != null ? `Rs. ${money.format(seig)}` : ''}</td><td className="sp-dmft">{dmft != null ? `Rs. ${money.format(dmft)}` : ''}</td><td className="sp-smft">{smft != null ? `Rs. ${money.format(smft)}` : ''}</td><td className="sp-permit">{permit != null ? `Rs. ${money.format(permit)}` : ''}</td></tr>
}

/** The permit fee basis, fixed by the G.O. and shown on the total row. */
const PERMIT_BASIS_NOTE = `Permit fee (80% of seigniorage; 40% for Colour and Black Granite) — ${PERMIT_GO_REFERENCE}`
function SettingsPanel({ layout, onChange }: { layout: Required<SeignioragePrintSettings>; onChange: (p: Partial<SeignioragePrintSettings>) => void }) {
  return (
    <div className="seig-print-settings">
      <div className="seig-print-settings-grid">
        <label>Page size<select className="select-input" value={layout.pageSize} onChange={e => onChange({ pageSize: e.target.value as PaperSize })}><option value="A4">A4</option><option value="A3">A3</option><option value="Letter">Letter</option><option value="Legal">Legal</option></select></label>
        <label>Orientation<select className="select-input" value={layout.orientation} onChange={e => onChange({ orientation: e.target.value as Orientation })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <label>Text size {layout.fontPercent}%<input type="range" min="70" max="150" step="5" value={layout.fontPercent} onChange={e => onChange({ fontPercent: Number(e.target.value) })} /></label>
        {(['top','right','bottom','left'] as const).map(side => (
          <label key={side}>Margin {side} mm<input className="text-input" type="number" min="0" value={layout.margins[side]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange({ margins: { ...layout.margins, [side]: n } }) }} /></label>
        ))}
      </div>
    </div>
  )
}
