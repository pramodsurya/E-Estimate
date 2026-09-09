// TELANGANA ESTIMATE COVER — pure Typst, with estimated cost as its only variable.
#let Cover = json(bytes(sys.inputs.at("ee-cover")))
#let green = rgb("#155d45")
#let wine = rgb("#722f37")
#let gold = rgb("#a98543")
#let ink = rgb("#18231f")
#let muted = rgb("#56615d")

// E-Estimate document settings: begin
#set page(paper: "a4", flipped: false, margin: 12mm)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt, fill: ink)
// E-Estimate document settings: end

#set page(background: context {
  rect(width: 100%, height: 100%, inset: 4mm, stroke: 1.4pt + green)[
    #rect(width: 100%, height: 100%, stroke: 0.45pt + gold)
  ]
})

#align(center)[
  #text(size: 9pt, tracking: 1.4pt, weight: "bold", fill: green)[GOVERNMENT OF TELANGANA]
  #v(4mm)
  #image("telangana-emblem.svg", width: 36mm, height: 36mm, fit: "contain")
  #v(3mm)
  #text(size: 8pt, tracking: 1.8pt, weight: "bold", fill: wine)[DETAILED ESTIMATE]
]

#v(10mm)
#align(center)[
  #line(length: 34mm, stroke: 1pt + gold)
  #v(5mm)
  #text(size: 9pt, tracking: 1pt, weight: "bold", fill: muted)[NAME OF WORK]
  #v(3mm)
  #box(width: 160mm)[
    #text(size: 19pt, weight: "bold")[[PROJECT_NAME]]
  ]
  #v(5mm)
  #line(length: 34mm, stroke: 1pt + gold)
]

#v(12mm)
#block(width: 100%, inset: 7mm, fill: rgb("#f3f0e8"),
  stroke: (left: 3pt + green, right: 3pt + wine), radius: 2pt)[
  #align(center)[
    #text(size: 8pt, tracking: 1.1pt, weight: "bold", fill: muted)[ESTIMATED COST]
    #v(2mm)
    #text(size: 22pt, weight: "bold")[#metadata(Cover.at("_ee_print_id", default: ""))#Cover.estimated_cost]
  ]
]

#v(13mm)
#table(
  columns: (31mm, 1fr), align: (left, left),
  stroke: (x, y) => if y == 0 { none } else { (bottom: 0.5pt + rgb("#9aa39f")) },
  inset: (x: 3mm, y: 3.2mm),
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[VILLAGE]], [[VILLAGE_NAME]],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[MANDAL]], [[MANDAL_NAME]],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[DISTRICT]], [[DISTRICT_NAME]],
  [#text(size: 8pt, tracking: 0.7pt, weight: "bold", fill: muted)[SSR YEAR]], [[SSR_YEAR]],
)

#v(1fr)
#align(center)[
  #text(size: 8pt, tracking: 0.8pt, fill: muted)[ENGINEERING ESTIMATE]
  #v(2mm)
  #line(length: 55mm, stroke: 0.8pt + gold)
  #v(2mm)
  #text(size: 7.5pt, fill: muted)[Prepared through E-Estimate]
]
