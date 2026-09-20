const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')
const output = path.join(__dirname, 'seigniorage-quantity-explanation.pdf')
const appCss = fs.readFileSync(path.join(root, 'src/renderer/src/styles/styles.css'), 'utf8')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${appCss}</style><style>
  html, body { margin: 0; padding: 0; background: #fff; }
  @media print {
    body, body * { visibility: visible !important; }
    .seig-print-page { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; break-after: page; page-break-after: always; }
    .seig-print-page:last-child { break-after: auto; page-break-after: auto; }
  }
</style></head><body>
  <article class="seig-print-page landscape" style="width:297mm;min-height:210mm;padding:12mm">
    <header class="seig-print-page-header"><div><h1>Seigniorage Statement</h1><p>Quantity calculation explanation</p></div></header>
    <section class="seig-print-group">
      <h2 class="seig-print-group-title">Building materials</h2>
      <table class="seig-print-table"><thead><tr>
        <th class="sp-sl">Sl</th><th class="sp-desc">Description</th><th class="sp-qty">Total Qty</th><th class="sp-calc">Seigniorage Qty</th><th class="sp-rate">Rate</th><th class="sp-seig">Seigniorage</th><th class="sp-dmft">DMFT</th><th class="sp-smft">SMFT</th><th class="sp-permit">Permit fee</th>
      </tr></thead><tbody>
        <tr><td class="sp-sl">1</td><td class="sp-desc"><div class="sp-code">IRR-CCDW-2-3</div><div class="sp-mat">Sand - Fine aggregate / natural sand</div></td><td class="sp-qty">100 CUM</td><td class="sp-calc"><span>100 × 0.349828 = 34.983 CUM</span><small class="sp-calc-basis">Material ratio: Fine aggregate / natural sand</small></td><td class="sp-rate">Rs. 27.00</td><td class="sp-seig">Rs. 944.54</td><td class="sp-dmft">Rs. 283.36</td><td class="sp-smft">Rs. 18.89</td><td class="sp-permit">Rs. 0.00</td></tr>
        <tr><td class="sp-sl">2</td><td class="sp-desc"><div class="sp-code">IRR-CCDW-2-4</div><div class="sp-mat">Sand - Fine aggregate / natural sand</div></td><td class="sp-qty">1,200 CUM</td><td class="sp-calc"><span>1,200 × 0.399756 = 479.707 CUM</span><small class="sp-calc-basis">Material ratio: Fine aggregate / natural sand</small></td><td class="sp-rate">Rs. 27.00</td><td class="sp-seig">Rs. 12,952.09</td><td class="sp-dmft">Rs. 3,885.63</td><td class="sp-smft">Rs. 259.04</td><td class="sp-permit">Rs. 0.00</td></tr>
      </tbody></table>
    </section>
  </article>
</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const bytes = await win.webContents.printToPDF({
      pageSize: 'A4', landscape: true, margins: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true, scale: 1, displayHeaderFooter: false,
      headerTemplate: '<span></span>', footerTemplate: '<span></span>', preferCSSPageSize: false
    })
    fs.writeFileSync(output, bytes)
  } finally {
    win.destroy()
    app.quit()
  }
})
