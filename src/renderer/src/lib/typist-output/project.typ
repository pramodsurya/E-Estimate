#metadata("ee-print-audit:v1")
// E-Estimate DEFAULT PROJECT DESIGN — General Abstract only.
// Cover, pages, and each component compile from their own Print Studio Typst.
// The application passes JSON in sys.inputs["ee-data"]. Data is NOT Typst code.

#let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_SIGNATURE = EE.at("signature", default: ())
#let Project = EE
#let ee-ink = rgb("#162a38")
#let ee-navy = rgb("#173f57")
#let ee-gold = rgb("#b47b20")
#let ee-silver = rgb("#e7ecef")
#let ee-warm = rgb("#f2ecdf")
#let ee-muted = rgb("#526773")

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt, fill: ee-ink)
#show heading.where(level: 1): set text(size: 1.25em, fill: ee-navy)
#show heading.where(level: 2): it => block(width: 100%, above: 14pt, below: 8pt)[
  #grid(
    columns: (4pt, auto, 1fr),
    gutter: (7pt, 10pt),
    align: (horizon, horizon, horizon),
    [
      #rect(width: 4pt, height: 14pt, fill: ee-gold, radius: 1pt)
    ],
    [
      #text(1.18em, weight: "bold", fill: ee-navy)[#it.body]
    ],
    [
      #line(length: 100%, stroke: 0.9pt + rgb("#b8c3c9"))
    ]
  )
]
#show heading.where(level: 3): set text(size: 1.02em, fill: ee-navy)
// E-Estimate document settings: end

// Book chrome — header/footer line and page numbers on every page.
// Kept outside the managed settings block so Document Settings can still edit paper/margins.
#set page(
  header: {
    set text(size: 8pt, fill: rgb("#557385"))
    grid(
      columns: (1fr, auto),
      align: (left + bottom, right + bottom),
      [#EE.at("project", default: "")],
      [#EE.at("year", default: "")]
    )
    v(3pt)
    line(length: 100%, stroke: 0.6pt + rgb("#163f57"))
  },
  footer: {
    line(length: 100%, stroke: 0.6pt + rgb("#163f57"))
    v(4pt)
    align(center)[
      #text(8.5pt, fill: rgb("#557385"))[
        Page #context counter(page).display("1 of 1", both: true)
      ]
    ]
  }
)

#set figure(numbering: "1")
#show figure.where(kind: image): set figure(supplement: [Fig.])
#show figure.where(kind: table): set figure(supplement: [Table])

#let abstract-row-fill(kind, row) = {
  // Deliberately different luminance keeps totals distinct in grayscale.
  if kind == "grand" { rgb("#d4dde2") }
  else if kind == "total" { ee-silver }
  else if kind == "gst" { ee-warm }
  else if calc.even(row) { rgb("#f7f7f5") }
  else { none }
}

#let abstract-row-weight(kind) = {
  if kind == "grand" or kind == "total" { "bold" } else { "regular" }
}

#block(width: 100%, inset: (x: 8mm, y: 6mm),
  stroke: (left: 3pt + ee-gold, top: 0.7pt + ee-navy, bottom: 0.7pt + ee-navy), radius: 1mm)[
  #text(7.5pt, tracking: 1.6pt, weight: "bold", fill: ee-gold)[DETAILED ENGINEERING ESTIMATE]
  #v(2.5mm)
  #text(22pt, weight: "bold", fill: ee-navy)[#EE.at("title", default: "GENERAL ABSTRACT OF ESTIMATE")]
]

#v(7mm)
#align(center)[#text(15pt, weight: "bold", fill: ee-navy)[#EE.at("project", default: "")]]
#if EE.at("village", default: "") != "" or EE.at("mandal", default: "") != "" or EE.at("district", default: "") [
  #v(2mm)
  #align(center)[#text(fill: ee-muted, style: "italic")[
    #if EE.at("village", default: "") != "" [Village: #EE.village]
    #if EE.at("mandal", default: "") != "" [ · Mandal: #EE.mandal]
    #if EE.at("district", default: "") != "" [ · District: #EE.district]
  ]]
]
#v(2mm)
#align(center)[#box(inset: (x: 5mm, y: 2mm), fill: ee-warm, radius: 1mm)[
  #text(9.5pt, weight: "bold")[Standard Schedule of Rates · #EE.at("year", default: "")#if EE.at("zone", default: "") != "" [ · #EE.zone]]
]]

#if EE.at("synced", default: true) == false [
  #v(6pt)
  #align(center)[#text(0.88em, fill: rgb("#b45309"))[Dashboard is not synced. Figures may be incomplete.]]
]

#v(9mm)

== General Abstract

#if EE.lines.len() == 0 [
  #text(fill: luma(120), italic: true)[No components yet. Add a component to start the abstract.]
] else {
  figure(
    table(
      columns: (18mm, 1fr, 38mm),
      align: (center + horizon, left + horizon, right + horizon),
      stroke: (x, y) => if y == 0 { (bottom: 1.8pt + ee-gold) } else { (bottom: 0.55pt + rgb("#b9c2c7")) },
      fill: (col, row) => if row == 0 { ee-silver } else {
        let line = EE.lines.at(row - 1, default: none)
        if line == none { none } else { abstract-row-fill(line.at("kind", default: ""), row) }
      },
      inset: (x: 6pt, y: 6pt),
      table.header(
        repeat: true,
        text(fill: ee-ink, weight: "bold")[Sl. No.],
        text(fill: ee-ink, weight: "bold")[Item of Work],
        text(fill: ee-ink, weight: "bold")[Amount (₹)],
      ),
      ..EE.lines.map(line => {
        let kind = line.at("kind", default: "")
        let weight = abstract-row-weight(kind)
        let basis = line.at("basis", default: "")
        (
          text(weight: weight)[#line.at("sl", default: "")],
          [
            #text(weight: weight)[#line.at("label", default: "")]
            #if basis != "" [
              #linebreak()
              #text(0.82em, fill: ee-muted)[#basis]
            ]
          ],
          text(weight: weight)[#metadata(line.at("_ee_print_id", default: ""))#line.at("amount", default: "—")],
        )
      }).flatten(),
    ),
    kind: table,
    caption: [General Abstract of Estimate],
  )
}

#v(6mm)
#align(right)[
  #block(width: 78mm, inset: (x: 6mm, y: 4mm),
    stroke: (left: 3pt + ee-gold, top: 0.7pt + ee-navy, bottom: 0.7pt + ee-navy), radius: 1mm)[
    #text(7.5pt, tracking: 0.8pt, weight: "bold", fill: ee-muted)[ESTIMATED PROJECT COST · INCLUDING GST]
    #v(1.5mm)
    #text(17pt, weight: "bold", fill: ee-navy)[₹ #EE.summary.grand_total]
  ]
]

#if EE_SIGNATURE.len() > 0 [
  #signature-footer(EE_SIGNATURE)
]
