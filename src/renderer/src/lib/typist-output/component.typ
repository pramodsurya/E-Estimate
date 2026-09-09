// E-Estimate DEFAULT COMPONENT DESIGN — edit this file in Print Studio.
// The application passes JSON in sys.inputs["ee-data"]. Data is NOT Typst code.
// Keep the JSON binding and document settings; customize headers, fonts, and styles.

#let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_SIGNATURE = EE.at("signature", default: ())
#let COMP = EE.component

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
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
#show heading.where(level: 3): set text(size: 1.02em, fill: rgb("#163f57"))
// E-Estimate document settings: end

// Component Title Banner
#rect(
  width: 100%,
  fill: rgb("#edf5fa"),
  stroke: (left: 4.5pt + rgb("#163f57")),
  inset: (x: 14pt, y: 9pt),
  radius: (right: 4pt)
)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    [
      #text(0.70em, weight: "bold", tracking: 0.12em, fill: rgb("#3b6b88"))[
        #if COMP.at("isSubcomponent", default: false) [SUB-COMPONENT ESTIMATE] else [COMPONENT ESTIMATE]
      ]
      #v(2pt)
      #text(1.36em, weight: "bold", fill: rgb("#0f2d3f"))[#COMP.name]
      #if COMP.code != "" [
        #h(6pt)
        #box(
          fill: rgb("#dbe9f1"),
          inset: (x: 6pt, y: 2pt),
          radius: 3pt,
          baseline: 8%
        )[
          #text(0.76em, weight: "bold", fill: rgb("#163f57"))[#COMP.code]
        ]
      ]
      #if EE.at("project", default: "") != "" [
        #v(3pt)
        #text(0.82em, fill: rgb("#557385"))[#EE.project]
      ]
    ],
    [
      #if COMP.at("totalFormatted", default: none) != none and COMP.totalFormatted != "" [
        #rect(
          fill: rgb("#ffffff"),
          stroke: 0.75pt + rgb("#cbdde7"),
          inset: (x: 10pt, y: 5pt),
          radius: 3pt
        )[
          #align(center)[
            #text(0.66em, weight: "bold", tracking: 0.08em, fill: rgb("#627d8d"))[ESTIMATED COST] \
            #v(1pt)
            #text(1.15em, weight: "bold", fill: rgb("#0d5c3a"))[₹ #COMP.totalFormatted]
          ]
        ]
      ]
    ]
  )
]

#v(10pt)

// Section 1: Abstract of Estimate
#heading(level: 2)[Abstract of Estimate]
#v(6pt)
#render-component-abstract(
  EE.abstract,
  total: COMP.at("totalFormatted", default: none),
  total-label: if COMP.at("isSubcomponent", default: false) [Sub-component Total] else [Component Total]
)

// Section 2: Detailed Estimates (Child Items)
#pagebreak()
#for (index, item) in EE.items.enumerate() [
  #if index > 0 [
    #v(14pt)
    #line(length: 100%, stroke: 0.6pt + rgb("#cbd5dc"))
    #v(10pt)
  ]
  #render-component-item(item)
]

// Section 3: Signatures
#if (EE_SIGNATURE.len() > 0) [
  #signature-footer(EE_SIGNATURE)
]
