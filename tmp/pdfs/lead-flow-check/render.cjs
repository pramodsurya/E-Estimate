const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')
const output = path.join(__dirname, 'lead-statement-flow.pdf')
const appCss = fs.readFileSync(path.join(root, 'src/renderer/src/styles/styles.css'), 'utf8')

const sourceRows = [
  ['1', 'Lead upto 1 km', '48.20', '46.50', '29.00', '68.30', '28.30', '77.40'],
  ['2', 'Lead upto 2 km', '67.50', '65.10', '40.70', '95.70', '39.60', '108.40'],
  ['3', 'Lead upto 3 km', '90.00', '90.00', '56.20', '132.30', '52.80', '144.60'],
  ['4', 'Lead upto 4 km', '109.30', '109.30', '68.30', '160.70', '64.20', '175.50'],
  ['5', 'Lead upto 5 km', '128.60', '128.60', '80.30', '189.10', '75.50', '206.50'],
  ['6', 'for every km beyond 5 km upto 30 km', '19.30', '19.30', '12.10', '28.40', '11.30', '31.00'],
  ['7', 'for every km beyond 30 km', '16.10', '16.10', '10.00', '23.60', '9.40', '25.80']
]

const rowHtml = sourceRows
  .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
  .join('')

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${appCss}</style><style>
  html, body { margin: 0; padding: 0; background: #fff; }
  @media print {
    body, body * { visibility: visible !important; }
    .lead-print-page { width: auto !important; height: auto !important; min-height: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; overflow: visible !important; break-after: page; page-break-after: always; }
    .lead-print-page:last-child { break-after: auto; page-break-after: auto; }
    table { break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
  }
</style></head><body>
  <article class="lead-print-page lead-print-flow-page portrait" style="width:210mm;min-height:297mm;padding:15mm 12mm">
    <header class="lead-print-page-header"><div><h1>Lead/Lift/Loading &amp; Unloading Charges 2026-27</h1><p>Zone III SOR rates used by the applied Lead entries in this project.</p></div></header>
    <section class="lead-print-source-block"><h2>COM-LDLFT-2</h2><h3>B. (Lead) Conveyance charges for machinery per kilometer for transporting materials by tippers and trucks.</h3><table class="lead-print-source-table"><thead><tr><th>Sl No.</th><th>Distance</th><th>Earth / Sand / Gravel / Murrum / Lime / Surki Rs / cum</th><th>Rubble / Size stones / Cut stones Rs / cum</th><th>Cement / Steel / RCC poles Rs / tonne</th><th>PCC slab / Shabhabad slab Rs / cum</th><th>Water Rs / 1000 litres</th><th>Bricks Rs / 1000 Nos.</th></tr></thead><tbody>${rowHtml}</tbody></table><p class="lead-print-note">Note: The Lead Charges are inclusive of Contractor Profit and Overhead charges.</p></section>
    <section class="lead-print-calculation-section"><header class="lead-print-section-header"><h2>Lead Rate Details</h2></header><div class="lead-print-calculation-grid"><section class="lead-print-calc-block"><div class="lead-print-calc-heading"><div><strong>Sand</strong><span>S1 -&gt; Apron</span></div><b>COM-LDLFT-2 · Zone III</b></div><table class="lead-print-calc-table"><tbody><tr><th>Material class</th><td>Earth / embankment</td><th>Lead</th><td>94.682 km</td></tr><tr><th>Lead rate</th><td>Lead up to 5 km</td><td>128.60</td><td>Rs. 128.60</td></tr><tr><td></td><td>Lead from 5 to 30 km</td><td>25 x 19.30</td><td>Rs. 482.50</td></tr><tr><td></td><td>Lead beyond 30 km</td><td>65 x 16.10</td><td>Rs. 1,046.50</td></tr><tr class="lead-print-total-row"><th>Gross rate</th><td colspan="2">Lead/Lift/Loading-Unloading rate</td><td>Rs. 1,657.60 / cum</td></tr></tbody></table></section></div></section>
  </article>
  <article class="lead-print-page map-page landscape" style="width:297mm;min-height:210mm;padding:15mm 12mm"><header class="lead-print-section-header"><h2>Lead Route Map</h2><p>Map remains on its own page.</p></header><div class="lead-print-map" style="height:120mm;display:grid;place-items:center">Route map</div></article>
</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const bytes = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: false,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      scale: 1,
      displayHeaderFooter: false,
      headerTemplate: '<span></span>',
      footerTemplate: '<span></span>',
      preferCSSPageSize: false
    })
    fs.writeFileSync(output, bytes)
  } finally {
    win.destroy()
    app.quit()
  }
})
