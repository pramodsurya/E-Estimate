#metadata("ee-print-audit:v1")
// E-Estimate DEFAULT GUIDE WALL DESIGN — edit this file in Print Studio.
// The application passes JSON in sys.inputs["ee-guidewall"]. Data is NOT Typst code.
// Keep the JSON binding and data loops; customize headings, dimensions, colors, and layout.
//
// Variables are named after the guide-wall dashboard fields:
//   project-name, component-name, component-code, guidewall-meta
//   figures: typeCode, caption, svg            typical cross-sections
//   wall-groups / base-groups: heading, code, unit, description, rows, total
//     row operands: sl, chainage, side, length, formula, qty
//   excavation: {heading, code, unit, description, rows, total} | none
//     row operands: sl, fromCh, toCh, length, breadth, height, qty
//   signature: [{designation, office}] (empty = hidden)

#let GW = json(bytes(sys.inputs.at("ee-guidewall")))
#let project-name = GW.project
#let component-name = GW.name
#let component-code = GW.code
#let guidewall-meta = GW.meta
#let figures = GW.figures
#let wall-groups = GW.wall_groups
#let base-groups = GW.base_groups
#let excavation = GW.excavation
#let signature = GW.signature
#let GW_SIGNATURE = GW.at("signature", default: ())

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 18mm, right: 15mm, bottom: 18mm, left: 20mm)
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
#show heading.where(level: 1): set text(size: 1.25em, fill: rgb("#0f2d3f"))
#show heading.where(level: 2): it => block(width: 100%, above: 14pt, below: 8pt)[
  #grid(
    columns: (4pt, auto, 1fr),
    gutter: (7pt, 10pt),
    align: (horizon, horizon, horizon),
    [
      #rect(width: 4pt, height: 14pt, fill: rgb("#0284c7"), radius: 1pt)
    ],
    [
      #text(1.18em, weight: "bold", fill: rgb("#0f2d3f"))[#it.body]
    ],
    [
      #line(length: 100%, stroke: 0.9pt + rgb("#d1dbe2"))
    ]
  )
]
#show heading.where(level: 3): set text(size: 1.05em, fill: rgb("#163f57"))
// E-Estimate document settings: end

// Section Banner
#rect(
  width: 100%,
  fill: rgb("#edf5fa"),
  stroke: (left: 4.5pt + rgb("#163f57")),
  inset: (x: 14pt, y: 9pt),
  radius: (right: 4pt)
)[
  #text(0.70em, weight: "bold", tracking: 0.12em, fill: rgb("#3b6b88"))[DETAILED ESTIMATE] \
  #v(2pt)
  #text(1.32em, weight: "bold", fill: rgb("#0f2d3f"))[#component-name]
  #if component-code != "" [
    #h(6pt)
    #box(
      fill: rgb("#dbe9f1"),
      inset: (x: 6pt, y: 2pt),
      radius: 3pt,
      baseline: 8%
    )[
      #text(0.76em, weight: "bold", fill: rgb("#163f57"))[#component-code]
    ]
  ] \
  #v(3pt)
  #text(0.82em, fill: rgb("#557385"))[#guidewall-meta]
]

#v(8pt)

// ---------------------------------------------------------------------------
// 1. TYPICAL CROSS-SECTIONS
// ---------------------------------------------------------------------------
#heading(level: 2)[1. Typical cross-sections]

#for fig in figures [
  #metadata(fig.at("_ee_print_id", default: ""))
  #v(6pt)
  #block(breakable: false)[
    #text(0.86em, weight: "medium", fill: rgb("#222222"))[#fig.caption]
    #v(3pt)
    #align(center)[
      #rect(
        width: 100%,
        stroke: 0.5pt + rgb("#cccccc"),
        fill: rgb("#fbfbfa"),
        inset: 4pt,
        radius: 2pt,
        image(bytes(fig.svg), format: "svg", width: 95%)
      )
    ]
  ]
]

#v(10pt)

// ---------------------------------------------------------------------------
// 2. CONCRETE QUANTITIES
// ---------------------------------------------------------------------------
#heading(level: 2)[2. Concrete quantities]

// Wall concrete blocks
#for g in wall-groups [
  #metadata(g.at("_ee_print_id", default: ""))
  #v(8pt)
  #block(breakable: false)[
    #heading(level: 3)[
      #g.heading
      #if g.unit != "" [ #text(weight: "regular", size: 0.82em, fill: luma(80))[— Unit: #g.unit] ]
    ]
    #if g.description != "" [
      #v(2pt)
      #text(0.95em, fill: rgb("#333333"))[#render-description(g)]
    ]
  ]

  #v(4pt)
  #table(
    columns: (28pt, 85pt, 45pt, 55pt, 1fr, 60pt),
    align: (center + top, left + top, center + top, right + top, left + top, right + top),
    stroke: (x, y) => if y == 0 { (bottom: 1pt + rgb("#333333")) } else { 0.4pt + rgb("#cccccc") },
    fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
    inset: (x: 5pt, y: 4.5pt),
    table.header(
      [*S.No*], [*Chainage*], [*Side*], [*Length*], [*Calculation*], [*Qty (cum)*]
    ),
    ..g.rows.map(row => (
      [#row.sl],
      [Ch #row.chainage],
      [#row.side],
      [#row.length],
      [#text(font: ("Consolas", "Courier New"), size: 0.73em)[#row.formula]],
      [#metadata(row.at("_ee_print_id", default: ""))#row.qty]
    )).flatten(),
    table.cell(colspan: 5, align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*Total*],
    table.cell(align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*#g.total*]
  )
]

// Base slab concrete blocks
#for g in base-groups [
  #metadata(g.at("_ee_print_id", default: ""))
  #v(8pt)
  #block(breakable: false)[
    #heading(level: 3)[
      #g.heading
      #if g.unit != "" [ #text(weight: "regular", size: 0.82em, fill: luma(80))[— Unit: #g.unit] ]
    ]
    #if g.description != "" [
      #v(2pt)
      #text(0.95em, fill: rgb("#333333"))[#render-description(g)]
    ]
  ]

  #v(4pt)
  #table(
    columns: (28pt, 85pt, 45pt, 55pt, 1fr, 60pt),
    align: (center + top, left + top, center + top, right + top, left + top, right + top),
    stroke: (x, y) => if y == 0 { (bottom: 1pt + rgb("#333333")) } else { 0.4pt + rgb("#cccccc") },
    fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
    inset: (x: 5pt, y: 4.5pt),
    table.header(
      [*S.No*], [*Chainage*], [*Side*], [*Length*], [*Calculation*], [*Qty (cum)*]
    ),
    ..g.rows.map(row => (
      [#row.sl],
      [Ch #row.chainage],
      [#row.side],
      [#row.length],
      [#text(font: ("Consolas", "Courier New"), size: 0.73em)[#row.formula]],
      [#metadata(row.at("_ee_print_id", default: ""))#row.qty]
    )).flatten(),
    table.cell(colspan: 5, align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*Total*],
    table.cell(align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*#g.total*]
  )
]

// ---------------------------------------------------------------------------
// 3. EXCAVATION
// ---------------------------------------------------------------------------
#if excavation != none and excavation.rows.len() > 0 [
  #v(10pt)
  #heading(level: 2)[3. Excavation]
  #v(6pt)
  #block(breakable: false)[
    #heading(level: 3)[
      #excavation.heading
      #if excavation.unit != "" [ #text(weight: "regular", size: 0.82em, fill: luma(80))[— Unit: #excavation.unit] ]
    ]
    #if excavation.description != "" [
      #v(2pt)
      #text(0.95em, fill: rgb("#333333"))[#render-description(excavation)]
    ]
  ]

  #v(4pt)
  #table(
    columns: (28pt, 65pt, 65pt, 55pt, 55pt, 55pt, 65pt),
    align: (center + top, left + top, left + top, right + top, right + top, right + top, right + top),
    stroke: (x, y) => if y == 0 { (bottom: 1pt + rgb("#333333")) } else { 0.4pt + rgb("#cccccc") },
    fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
    inset: (x: 5pt, y: 4.5pt),
    table.header(
      [*S.No*], [*From Ch*], [*To Ch*], [*L (m)*], [*B (m)*], [*H (m)*], [*Qty (cum)*]
    ),
    ..excavation.rows.map(row => (
      [#row.sl],
      [#row.fromCh],
      [#row.toCh],
      [#row.length],
      [#row.breadth],
      [#row.height],
      [#metadata(row.at("_ee_print_id", default: ""))#row.qty]
    )).flatten(),
    table.cell(colspan: 6, align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*Total*],
    table.cell(align: right, stroke: (top: 1pt + rgb("#555555"), bottom: 1.5pt + rgb("#555555")))[*#excavation.total*]
  )
]

// ---------------------------------------------------------------------------
// 4. SIGNATURES
// ---------------------------------------------------------------------------
#if (GW_SIGNATURE.len() > 0) [
  #signature-footer(GW_SIGNATURE)
]
