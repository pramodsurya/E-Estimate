// E-Estimate DEFAULT BOQ DESIGN — edit this file in Print Studio.
// The application passes JSON in sys.inputs["ee-data"]. Data is NOT Typst code.
// Keep the JSON binding and document settings; customize headers, fonts, and styles.

#let EE = json(bytes(sys.inputs.at("ee-data")))
#let COMP = EE.component

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 10pt)
#show heading.where(level: 1): set text(size: 1.25em, fill: rgb("#0f2d3f"))
// E-Estimate document settings: end

// BOQ Title Banner
#rect(
  width: 100%,
  fill: rgb("#edf5fa"),
  stroke: (left: 4.5pt + rgb("#163f57")),
  inset: (x: 14pt, y: 9pt),
  radius: (right: 4pt)
)[
  #text(0.70em, weight: "bold", tracking: 0.12em, fill: rgb("#3b6b88"))[
    BILL OF QUANTITIES
  ]
  #v(2pt)
  #text(1.30em, weight: "bold", fill: rgb("#0f2d3f"))[#COMP.name]
  #if EE.at("project", default: "") != "" [
    #v(3pt)
    #text(0.82em, fill: rgb("#557385"))[#EE.project]
  ]
  #if COMP.at("isSubcomponent", default: false) [
    #v(2pt)
    #text(0.78em, style: "italic", fill: rgb("#557385"))[Sub-component BOQ]
  ]
]

#v(10pt)

// BOQ Schedule — every item in this section, flat S.No order.
#table(
  columns: (11mm, 20mm, 1fr, 20mm, 12mm, 22mm, 25mm),
  align: (center + top, center + top, left + top, right + top, center + top, right + top, right + top),
  stroke: (x, y) => if y == 0 { (bottom: 1pt + luma(80)) } else { (bottom: 0.4pt + luma(190)) },
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
  inset: (x: 4pt, y: 4pt),
  table.header(
    repeat: true,
    [*S.No*],
    [*Code*],
    [*Description*],
    [*Quantity*],
    [*Unit*],
    [*Rate (₹)*],
    [*Cost (₹)*]
  ),
  ..EE.rows.map(row => (
    [#row.at("sl", default: "")],
    [#text(size: 0.92em)[#row.at("code", default: "")]],
    [
      #text(weight: "bold", size: 1.0em, fill: rgb("#163f57"))[#row.at("heading", default: "")]
      #let subtext = row.at("description", default: "")
      #if subtext != "" and subtext != row.at("heading", default: "") [
        \ #v(2pt)
        #text(size: 0.88em, fill: rgb("#2a3b47"))[#render-markup(subtext)]
      ]
    ],
    [#row.at("qty", default: "—")],
    [#row.at("unit", default: "")],
    [#row.at("rate", default: "—")],
    [#text(weight: "bold")[#row.at("amount", default: "—")]]
  )).flatten(),
  table.cell(colspan: 6, align: right, stroke: (top: 1pt + luma(80), bottom: 1.5pt + luma(80)))[
    #text(weight: "bold", size: 0.86em)[Total Cost:]
  ],
  table.cell(align: right, stroke: (top: 1pt + luma(80), bottom: 1.5pt + luma(80)))[
    #text(weight: "bold", size: 0.86em)[₹ #EE.at("totalFormatted", default: "0.00")]
  ]
)
