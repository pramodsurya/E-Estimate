// E-Estimate document settings: begin
#set page(paper: "a4", flipped: true, margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm))
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
// E-Estimate document settings: end

// DEFAULT BUND LAYOUT — NEW HOMOGENEOUS.
// This complete script is the layout appended to the Component Typ document.
// Only project values come from the JSON in the `ee-bund` input. The bund engine
// (bund.ts) does the measurement once; nothing is measured a second time here.
//
// Variables below are named after the bund dashboard fields:
//   project-name, component-name           identity
//   bund-length-m, datum-rl                length & reference level
//   top-bund-level-rl (-crest), crest-width-m, upstream-slope, downstream-slope
//   max-water-level-m (-MWL), full-tank-level-m (-FTL), freeboard-m
//   sections: chainage, average_toe_rl, height_m, base_width_m, svg, stations, bands
//   schedules: named optional works, each {rows, total}; row operands:
//     from_chainage, to_chainage, length_m, start_section, end_section,
//     average_section, quantity (work.unit is the quantity unit)
//   excavation: [{role, quantity, classes:[{soil, percent, code, description, quantity}]}]
//   payable-items: code, description, unit, quantity, role, measure
//   drawings: assembly, upstream_toe, downstream_drain, rock_toe, filters, chute (SVG; "" = none)
//   berms, phreatic, signature (empty = hidden)
// Missing optional schedules hide their whole block; zero is a valid survey level.

#let Bund = json(bytes(sys.inputs.at("ee-bund")))
#let project-name = Bund.project_name
#let component-name = Bund.component_name
#let design = Bund.design
#let bund-length-m = Bund.length_m
#let datum-rl = Bund.datum_rl
#let top-bund-level-rl = design.topLevel
#let crest-width-m = design.topWidth
#let upstream-slope = design.usSlope
#let downstream-slope = design.dsSlope
#let max-water-level-m = design.mwl
#let full-tank-level-m = design.ftl
#let freeboard-m = design.freeBoard
#let sections = Bund.sections
#let schedules = Bund.schedules
#let drawings = Bund.drawings
#let excavation-sources = Bund.excavation
#let payable-items = Bund.payable_items
#let berms = Bund.berms
#let phreatic = Bund.phreatic
#let signature = Bund.signature

#let number(value) = if value == none { [—] } else { str(calc.round(value, digits: 3)) }
#let navy = rgb("#17384a")
#let teal = rgb("#147d86")
#let slate = rgb("#496170")
#let grey = rgb("#5c788a")
#let hdr = rgb("#edf3f5")
#let accent = rgb("#b9c4cc")
#let gridln = rgb("#cbd8e0")

#set heading(numbering: none)
#set par(justify: false, leading: 0.52em)
#show heading.where(level: 1): set text(size: 1.18em, fill: navy, weight: "bold")
#show heading.where(level: 2): set text(size: 0.91em, fill: navy, weight: "bold")
#show heading.where(level: 3): set text(size: 0.85em, fill: teal, weight: "bold")
#set table(inset: 3.2pt, stroke: 0.4pt + gridln,
  fill: (col, row) => if row == 0 { hdr } else { none })
#set page(footer: context align(right)[#text(0.78em, fill: navy)[#component-name · #counter(page).display("1 / 1", both: true)]])

// Embed an SVG drawing as vector artwork.
#let vector(svg, height: 84mm) = if svg != "" {
  align(center, image.decode(bytes(svg), format: "svg", width: 96%, height: height, fit: "contain"))
}
// A short grey caption instead of a prose paragraph.
#let note(content) = text(size: 0.75em, fill: grey, content)
// Two-column geometry table: Dimension | Value.
#let dim-label(content) = text(size: 0.73em, fill: grey, content)
#let dim-value(content) = text(size: 0.84em, weight: "bold", fill: rgb("#163f57"), content)
#let dims(cells) = table(columns: (1.5fr, 1fr), align: (left, right),
  table.header([*Dimension*], [*Value*]), ..cells)
// A thin rule that opens a section.
#let rule() = line(length: 100%, stroke: 0.7pt + accent)
// A small boxed figure: grey label over a bold navy value.
#let chip(label, value) = [
  #text(size: 0.74em, fill: grey, weight: "medium")[#label]
  #v(1pt)
  #text(size: 1em, weight: "bold", fill: navy)[#value]
]

// One measured work item: compact schedule with a run, end sections and a total.
#let schedule(title, key, unit: none) = {
  let work = schedules.at(key, default: none)
  if work != none and work.rows.len() > 0 {
    let u = if unit == none { work.unit } else { unit }
    table(columns: (auto, auto, 1fr, 1fr, 1fr, 1fr, 1fr),
      align: (left, left, right, right, right, right, right),
      table.header([*From Ch.*], [*To Ch.*], [*Length (m)*], [*Start (m²)*], [*End (m²)*], [*Average*], [*Qty (#u)*]),
      ..work.rows.map(interval => (
        [#interval.from_chainage], [#interval.to_chainage], number(interval.length_m),
        number(interval.start_section), number(interval.end_section),
        number(interval.average_section), number(interval.quantity)
      )).flatten(),
      table.cell(colspan: 6, align: right)[*Total*], [*#number(work.total) #u*])
  }
}

// --------------------------------------------------------------------------
// Cover page — general arrangement of the proposed bund
// --------------------------------------------------------------------------
#block(
  width: 100%,
  inset: (x: 12pt, y: 7pt),
  fill: hdr,
  stroke: (left: 4.5pt + navy),
  radius: (right: 4pt),
)[
  #grid(
    columns: (1fr, auto),
    gutter: 12pt,
    align: (left, right),
    [
      #text(size: 1.36em, weight: "bold", fill: rgb("#0f2d3f"))[#component-name]
    ],
    align(right + horizon)[
      #box(inset: (x: 7pt, y: 3pt), fill: rgb("#dbe9f1"), radius: 3pt)[
        #text(size: 0.76em, fill: rgb("#163f57"), weight: "bold")[NEW · HOMOGENEOUS]
      ]
    ]
  )
  #v(3pt)
  #text(size: 0.82em, fill: rgb("#557385"))[
    #project-name · #sections.len() surveyed section(s) · Bund length #number(bund-length-m) m ·
    Datum #number(datum-rl) m · Crest width #number(crest-width-m) m
  ]
]

#v(4pt)
#table(columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr), align: center,
  stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 4pt, y: 4pt),
  chip([MWL (m)], number(max-water-level-m)), chip([Freeboard (m)], number(freeboard-m)),
  chip([TBL (m)], number(top-bund-level-rl)), chip([FTL (m)], number(full-tank-level-m)),
  chip([U/S slope], [#number(upstream-slope):1]), chip([D/S slope], [#number(downstream-slope):1]))

#v(3pt)
#vector(drawings.assembly, height: 120mm)

#pagebreak()
// --------------------------------------------------------------------------
// Statement of quantities
// --------------------------------------------------------------------------
#v(5pt)
#rule()
#heading(level: 1)[Statement of quantities]
#v(1pt)
#note[Mean-sectional measurement: average of the two end sections × interval length. Each schedule repeats its chainages so it stays readable across pages.]
#v(2pt)
#table(columns: (1fr, 1fr, 1fr, 1fr),
  table.header([*Chainage*], [*Average toe RL (m)*], [*Height (m)*], [*Base width (m)*]),
  ..sections.map(section => ([#section.chainage], number(section.average_toe_rl),
    number(section.height_m), number(section.base_width_m))).flatten())
#v(3pt)
#schedule([Jungle clearance], "clearance", unit: [m²])
#if Bund.clearance_manual.len() > 0 [
  #table(columns: (1fr, 1fr, 1fr), align: (left, right, right),
    table.header([*Length (m)*], [*Breadth (m)*], [*Area (m²)*]),
    ..Bund.clearance_manual.map(clearance => (number(clearance.length),
      number(clearance.breadth), number(clearance.quantity))).flatten())
]
#schedule([Foundation excavation], "foundation")
#schedule([Homogeneous embankment formation], "formation")
#schedule([Upstream toe excavation], "upstream_toe")
#schedule([Downstream drain excavation], "downstream_drain")
#schedule([Upstream toe protection], "upstream_protection")
#schedule([Downstream drain protection], "downstream_protection")
#schedule([Revetment], "revetment")
#schedule([Downstream turfing], "turfing", unit: [m²])
#schedule([Rock toe], "rock_toe")
#schedule([Rock-toe excavation — shared cut counted once], "rock_toe_excavation")
#schedule([Graded rock-toe filter], "rock_toe_filter")
#schedule([Horizontal drainage blanket], "horizontal_filter")
#schedule([Chimney filter], "chimney_filter")

// --------------------------------------------------------------------------
// Earthwork excavation classification
// --------------------------------------------------------------------------
#v(5pt)
#rule()
#heading(level: 1)[Earthwork excavation classification]
#v(1pt)
#note[Percentages are the selected dashboard classification applied to each measured source.]
#v(2pt)
#let excavation-labels = (
  "stripping": [Foundation / stripping], "ustoe-exc": [Upstream toe wall],
  "dstoe-exc": [Downstream toe drain], "rocktoe-exc": [Rock-toe trench],
  "hearting-trench-exc": [Hearting cut-off trench], "chute-exc": [Chute drain],
  "berm-drain-exc": [Berm catch-water drain]
)
#for excavation-source in excavation-sources {
  let eLabel = excavation-labels.at(excavation-source.role, default: [Excavation])
  heading(level: 2)[#eLabel · #number(excavation-source.quantity) m³]
  if excavation-source.classes.len() > 0 {
    table(columns: (1fr, auto, 1fr, 2fr, auto), align: (left, center, center, left, right),
      table.header([*Soil / rock*], [*Share (%)*], [*Code*], [*Calculation*], [*Quantity (m³)*]),
      ..excavation-source.classes.map(soil => ([#soil.soil], number(soil.percent), [#soil.code],
        [#number(excavation-source.quantity) × #number(soil.percent) / 100], number(soil.quantity))).flatten())
  } else {
    note[No soil classification is assigned.]
  }
}

// --------------------------------------------------------------------------
// Component details
// --------------------------------------------------------------------------
#if drawings.upstream_toe != "" or drawings.downstream_drain != "" or drawings.rock_toe != "" or drawings.filters != "" or drawings.chute != "" or berms.len() > 0 [
  #v(5pt)
  #rule()
  #heading(level: 1)[Component details]
]
#if drawings.upstream_toe != "" [
  #heading(level: 2)[Upstream toe wall / anchorage]
  #vector(drawings.upstream_toe, height: 62mm)
  #dims((dim-label([Top width (m)]), dim-value(number(Bund.configuration.upstreamToe.topWidth)),
    dim-label([Bottom width (m)]), dim-value(number(Bund.configuration.upstreamToe.bottomWidth)),
    dim-label([Depth (m)]), dim-value(number(Bund.configuration.upstreamToe.depth)),
    dim-label([Side slope (H:V)]), dim-value(number(Bund.configuration.upstreamToe.leftSlope))))
]
#if drawings.downstream_drain != "" [
  #heading(level: 2)[Downstream toe drain]
  #vector(drawings.downstream_drain, height: 62mm)
]
#if drawings.rock_toe != "" [
  #heading(level: 2)[Rock toe and graded filter]
  #note[The shared general excavation beneath the rock-toe foundation is assigned to the rock-toe trench and deducted from the general cut. It is counted once.]
  #vector(drawings.rock_toe, height: 66mm)
]
#if drawings.filters != "" [
  #heading(level: 2)[Internal drainage arrangement]
  #vector(drawings.filters, height: 62mm)
]
#if drawings.chute != "" [
  #heading(level: 2)[Chute drains]
  #table(columns: (1fr, 1fr, 1fr, 1fr), align: (left, right, right, right),
    table.header([*Chainage (m)*], [*Developed length (m)*], [*Excavation (m³)*], [*Protection qty*]),
    ..Bund.chute_rows.map(chute => (number(chute.chainage), number(chute.slopeLength),
      number(chute.excavationQty), number(chute.protectionQty))).flatten())
  #vector(drawings.chute, height: 62mm)
]
#for berm in berms [
  #heading(level: 2)[Berm shelf and catch-water drain]
  #note[The shelf is included in the embankment geometry; only its selected surfacing and drain works are additional quantities.]
  #vector(berm.svg, height: 58mm)
  #if berm.surface != none [#note[Shelf surfacing: #number(berm.surface.quantity) #if berm.surface.measure == "volume" { [m³] } else { [m²] }]]
  #if berm.drain != none [#note[Drain protection: #number(berm.drain.quantity) #if berm.drain.measure == "volume" { [m³] } else { [m²] }]]
  #if berm.excavation != none [#note[Drain excavation: #number(berm.excavation.total) m³]]
]

// --------------------------------------------------------------------------
// Phreatic-line comparison
// --------------------------------------------------------------------------
#if phreatic != none [
  #v(5pt)
  #rule()
  #heading(level: 1)[Phreatic-line comparison]
  #v(1pt)
  #note[Reference and selected drainage conditions at the governing cross-section.]
  #table(columns: (2fr, 1fr, 1fr), align: (left, right, right),
    table.header([*Parameter*], [*Without drainage*], [*Selected drainage*]),
    [Focus datum RL (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.baseRl }), number(if phreatic.selected == none { none } else { phreatic.selected.baseRl }),
    [Water depth (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.waterDepth }), number(if phreatic.selected == none { none } else { phreatic.selected.waterDepth }),
    [Focal distance S; q = K × S (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.s }), number(if phreatic.selected == none { none } else { phreatic.selected.s }))
  #vector(phreatic.svg, height: 62mm)
]

// --------------------------------------------------------------------------
// Payable quantities
// --------------------------------------------------------------------------
#v(5pt)
#rule()
#heading(level: 1)[Payable quantities]
#v(1pt)
#note[Selected work codes and quantities from the same engine as the component dashboard. Distinct operations can share a measured volume; their quantities must not be added to obtain geometric fill.]
#v(2pt)
#table(columns: (auto, 1fr, 4fr, auto, auto), align: (center, center, left, center, right),
  table.header([*No.*], [*Code*], [*Description*], [*Unit*], [*Quantity*]),
  ..payable-items.enumerate().map(((index, item)) => (
    [#(index + 1)], [#item.code], [#item.description], [#item.unit], number(item.quantity)
  )).flatten())

// --------------------------------------------------------------------------
// Signature
// --------------------------------------------------------------------------
#if signature.len() > 0 {
  v(16mm)
  grid(columns: (1fr,) * signature.len(), gutter: 12pt,
    ..signature.map(signatory => align(center)[*#signatory.designation* \ #signatory.office]))
}
