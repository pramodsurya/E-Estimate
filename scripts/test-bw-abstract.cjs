const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const fs = require('fs')
const path = require('path')

function generateBwOptimizedTypst() {
  const rootDir = path.resolve(__dirname, '..')
  const compiler = NodeCompiler.create({ workspace: rootDir })

  const typstCode = `
#set page(
  paper: "a4",
  margin: (x: 14mm, top: 16mm, bottom: 16mm),
  header: [
    #grid(
      columns: (1fr, 1fr),
      align: (left, right),
      text(8pt, fill: luma(80), weight: "bold")[Canal and Cross Drainage Works- 2025-26],
      text(8pt, fill: luma(80), weight: "bold")[RATE ANALYSIS (DATA BOOK) SOR: 2025-26]
    )
    #v(-2pt)
    #line(length: 100%, stroke: 0.5pt + luma(180))
  ],
  numbering: "1 of 1",
  number-align: center
)
#set text(font: ("Calibri", "Arial", "Liberation Sans", "Helvetica"), size: 9.5pt, fill: luma(20))

#block(breakable: true)[
  // Top metadata row
  #grid(
    columns: (1fr, 1fr),
    align: (left, right),
    text(13pt, weight: "bold", fill: rgb("#0b4d6c"))[IRR-CCDW-1-2],
    [
      #text(9pt, weight: "bold", fill: luma(30))[Canal and Cross Drainage Works- 2025-26] \\
      #text(7.5pt, weight: "bold", fill: rgb("#087e8b"))[PUBLISHED SUPABASE RECONSTRUCTION]
    ]
  )
  #v(3pt)

  // Description
  #text(9.5pt, fill: luma(20))[
    Earth work in excavation *in all kinds of soils* of foundation of structures as per drawing and technical specification, including setting out, construction of shoring and bracing, removal of stumps and other deleterious matter, dressing of sides and bottom and backfilling with approved material. \
    *Depth upto 3 m* \
    Unit = cum
  ]
  #v(8pt)

  // Full-width Header Banner - High contrast & B/W friendly
  #rect(
    width: 100%,
    fill: rgb("#0b3d5c"),
    stroke: (bottom: 2pt + rgb("#087e8b")),
    inset: (x: 10pt, y: 6pt),
    radius: 1pt
  )[
    #grid(
      columns: (1fr, 1.5fr, 1fr),
      align: (left + horizon, center + horizon, right + horizon),
      text(10pt, weight: "bold", fill: white)[DATA:],
      text(12pt, weight: "bold", fill: white)[RATE ANALYSIS],
      text(10pt, weight: "bold", fill: white)[UNIT: 240.00 CUM]
    )
  ]
  #v(8pt)

  // Section A: Materials
  #text(10.5pt, weight: "bold", fill: rgb("#087e8b"))[A. MATERIALS:]
  #v(2pt)
  #table(
    columns: (12mm, 1fr, 16mm, 20mm, 24mm, 28mm),
    align: (center, left, center, right, right, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.2pt + luma(50)) } else { 0.5pt + luma(200) },
    fill: (col, row) => if row == 0 { rgb("#007791") } else if row == 2 { rgb("#f1f5f9") } else { none },
    table.header(
      repeat: true,
      text(fill: white, weight: "bold")[Sl No],
      text(fill: white, weight: "bold")[Particulars],
      text(fill: white, weight: "bold")[Unit],
      text(fill: white, weight: "bold")[Quantity],
      text(fill: white, weight: "bold")[Rate in Rs.],
      text(fill: white, weight: "bold")[Amount in Rs.]
    ),
    [1], [NIL], [], [0.00], [0.00], [0.00],
    table.cell(colspan: 4, align: left)[*Total cost of Materials*], [*Rs:*], [*0.00*]
  )
  #v(8pt)

  // Section B: Machinery
  #text(10.5pt, weight: "bold", fill: rgb("#0b3d5c"))[B. MACHINERY:]
  #v(2pt)
  #table(
    columns: (12mm, 1fr, 16mm, 20mm, 24mm, 28mm),
    align: (center, left, center, right, right, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.2pt + luma(50)) } else { 0.5pt + luma(200) },
    fill: (col, row) => if row == 0 { rgb("#0b3d5c") } else if row == 3 { rgb("#f1f5f9") } else { none },
    table.header(
      repeat: true,
      text(fill: white, weight: "bold")[Sl No],
      text(fill: white, weight: "bold")[Description],
      text(fill: white, weight: "bold")[Unit],
      text(fill: white, weight: "bold")[Quantity],
      text(fill: white, weight: "bold")[Rate in Rs.],
      text(fill: white, weight: "bold")[Amount in Rs.]
    ),
    [1], [Hydraulic excavator 1.0 cum bucket capacity], [hour], [6.00], [1,827.70], [10,966.20],
    [2], [Fuel/ Energy charges], [hour], [6.00], [1,447.50], [8,685.00],
    table.cell(colspan: 4, align: left)[*Total hire charges of Machinery*], [*Rs:*], [*19,651.20*]
  )
  #v(8pt)

  // Section C: Labour
  #text(10.5pt, weight: "bold", fill: rgb("#6d28d9"))[C. LABOUR:]
  #v(2pt)
  #table(
    columns: (12mm, 1fr, 16mm, 20mm, 24mm, 28mm),
    align: (center, left, center, right, right, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.2pt + luma(50)) } else { 0.5pt + luma(200) },
    fill: (col, row) => if row == 0 { rgb("#5b21b6") } else if row == 3 { rgb("#f1edfa") } else { none },
    table.header(
      repeat: true,
      text(fill: white, weight: "bold")[Sl No],
      text(fill: white, weight: "bold")[Description],
      text(fill: white, weight: "bold")[Unit],
      text(fill: white, weight: "bold")[Quantity],
      text(fill: white, weight: "bold")[Rate in Rs.],
      text(fill: white, weight: "bold")[Amount in Rs.]
    ),
    [1], [Mazdoor (Unskilled)], [day], [12.00], [550.00], [6,600.00],
    [2], [Bhisthi (Waterman)], [day], [2.00], [550.00], [1,100.00],
    table.cell(colspan: 4, align: left)[*Total cost of Labour*], [*Rs:*], [*7,700.00*]
  )
  #v(6pt)

  // Labour component / unit qty amber block
  #rect(
    width: 100%,
    fill: rgb("#fffbf0"),
    stroke: (left: 3.5pt + rgb("#d97706"), rest: 0.5pt + rgb("#fde68a")),
    inset: (x: 10pt, y: 7pt),
    radius: 1pt
  )[
    #grid(
      columns: (1fr, 25mm, 10mm, 25mm),
      align: (left, right, center, right),
      row-gutter: 5pt,
      [labour component/unit qty], [], [], [32.08],
      [Add contractor's profit and overhead charges 13.615%], [13.615%], [], [4.37],
      grid.hline(start: 3, end: 4, stroke: 0.8pt + luma(40)),
      [*labour component/unit qty (including contractor's profit)*], [], [], [*36.45*],
      grid.hline(start: 3, end: 4, stroke: 1.2pt + luma(40))
    )
  ]
  #v(10pt)

  // ABSTRACT Table (exact match with user's screenshot)
  #text(10.5pt, weight: "bold", fill: rgb("#0b3d5c"))[ABSTRACT:]
  #v(2pt)
  #table(
    columns: (1fr, 25mm, 10mm, 28mm),
    align: (left, right, center, right),
    stroke: (x, y) => none,
    fill: (col, row) => if row == 1 { rgb("#f8fafc") } else if row == 5 { rgb("#edf7f6") } else if row == 6 { rgb("#d8efeb") } else { none },
    [A. Cost of Materials], [], [Rs:], [0.00],
    [B. Hire charges of Machinery], [], [Rs:], [19,651.20],
    [C. Cost of Labour], [], [Rs:], [7,700.00],
    table.hline(stroke: 0.5pt + luma(180)),
    table.cell(colspan: 2, align: right)[*Total*], [*Rs:*], table.cell(stroke: (top: 1pt + luma(40), bottom: 1pt + luma(40)))[*27,351.20*],
    [D. Add for contractor's profit and overheads on (A+B+C)], [13.615%], [Rs:], [3,723.87],
    table.hline(stroke: 0.5pt + luma(180)),
    [Total cost for], [240.00 cum], [Rs:], table.cell(stroke: (top: 1pt + luma(40), bottom: 1pt + luma(40)))[*31,075.07*],
    [*Rate per cum*], [(A+B+C+D)/240.00], [*Rs:*], table.cell(stroke: (top: 1pt + luma(40), bottom: 2pt + luma(40)))[*129.50*]
  )
]
`

  const targetFile = path.join(rootDir, 'tmp', 'test-bw-matched-typst.typ')
  compiler.addSource(targetFile, typstCode)
  const pdfBytes = compiler.pdf({ mainFilePath: targetFile })
  const outPdf = path.join(rootDir, 'tmp', 'test-bw-matched-output.pdf')
  fs.writeFileSync(outPdf, pdfBytes)
  console.log(`Generated B/W & UI-matched Typst PDF: ${pdfBytes.length} bytes in tmp/test-bw-matched-output.pdf`)
}

generateBwOptimizedTypst()

