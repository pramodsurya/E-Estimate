#metadata("ee-print-audit:v1")
// E-Estimate document settings: begin
#set page(paper: "a4", flipped: true, margin: (top: 12mm, right: 12mm, bottom: 12mm, left: 12mm))
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
// E-Estimate document settings: end

// DEFAULT BUND LAYOUT — shared by every bund template.
// Template-specific blocks are gated by flags in the `ee-bund` JSON (is_new,
// is_zoned, show_freeboard, show_hearting, show_cutoff_trench, show_repair_kind).
// The bund engine (bund.ts) measures once; nothing is measured a second time here.
// drawings.assembly is the same general-arrangement SVG as the dashboard.

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
#let chute-geometry = Bund.chute_geometry
#let excavation-sources = Bund.excavation
#let excavation-by-code = Bund.at("excavation_by_code", default: ())
#let payable-by-code = Bund.at("payable_by_code", default: ())
#let payable-items = Bund.payable_items
// Same roles as BundExcavationRole / excavation_by_code. Those DATA items are
// paid in "Payable quantities of Excavation" and must not be billed again.
#let excavation-payable-roles = (
  "stripping", "ustoe-exc", "dstoe-exc", "rocktoe-exc",
  "chute-exc", "berm-drain-exc", "hearting-trench-exc",
)
#let excavation-payable-codes = excavation-by-code.map(item => item.code)
#let other-payable-items = payable-items.filter(item => {
  not excavation-payable-roles.any(role => role == item.role) and not excavation-payable-codes.any(code => code == item.code)
})
#let berms = Bund.berms
#let phreatic = Bund.phreatic
#let signature = Bund.signature
#let hearting-design = Bund.at("hearting_design", default: none)
#let cutoff-trench = Bund.at("cutoff_trench", default: none)
#let clearance-manual = Bund.at("clearance_manual", default: ())
#let is-new = Bund.at("is_new", default: true)
#let is-zoned = Bund.at("is_zoned", default: false)
#let show-freeboard = Bund.at("show_freeboard", default: is-new)
#let show-hearting = Bund.at("show_hearting", default: is-zoned)
#let show-cutoff-trench = Bund.at("show_cutoff_trench", default: false)
#let show-repair-kind = Bund.at("show_repair_kind", default: false)
#let layout-label = Bund.at("layout_label", default: "NEW · HOMOGENEOUS")
#let repair-kind = Bund.at("repair_kind", default: none)
#let soil-source = Bund.at("soil_source", default: none)
#let document-settings = Bund.at("document_settings", default: (
  paper: "a4", flipped: false,
  margins: (top: 20, right: 15, bottom: 20, left: 25),
))

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
#show heading.where(level: 2): it => block(width: 100%, above: 14pt, below: 8pt)[
  #grid(
    columns: (4pt, auto, 1fr), gutter: (7pt, 10pt),
    align: (horizon, horizon, horizon),
    [#rect(width: 4pt, height: 14pt, fill: rgb("#0284c7"), radius: 1pt)],
    [#text(size: 1.18em, weight: "bold", fill: rgb("#0f2d3f"))[#it.body]],
    [#line(length: 100%, stroke: 0.9pt + rgb("#d1dbe2"))]
  )
]
#show heading.where(level: 3): set text(size: 1.05em, fill: rgb("#163f57"), weight: "bold")
#set table(inset: 3.2pt, stroke: 0.4pt + gridln,
  fill: (col, row) => if row == 0 { hdr } else { none })
#set page(footer: context align(right)[#text(0.78em, fill: navy)[#component-name · #counter(page).display("1 / 1", both: true)]])

// Embed an SVG drawing as vector artwork.
// Desktop Typst 0.15: image.decode was removed; pass bytes to image().
#let vector(svg, height: auto) = if svg != "" {
  align(center, image(bytes(svg), format: "svg", width: 100%, height: height, fit: "contain"))
}
// A short grey caption instead of a prose paragraph.
#let note(content) = text(size: 0.75em, fill: grey, content)
// DATA descriptions are one continuous paragraph here. Formatting survives,
// while embedded source newlines become spaces as requested.
#let excavation-description-runs(runs) = {
  for run in runs {
    let content = [#run.text.replace(regex("\\s*\\n\\s*"), " ")]
    if run.at("bold", default: false) { content = strong(content) }
    if run.at("italic", default: false) { content = emph(content) }
    if run.at("underline", default: false) { content = underline(content) }
    content
  }
}
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

// HTML-equivalent cross-section statement. Each work occupies Section / Average /
// Total columns; continuation panels keep the same column-number sequence.
#let statement-value(work, index) = if index == 0 {
  work.rows.first().start_section
} else {
  let interval = work.rows.at(index - 1, default: none)
  if interval == none { none } else { interval.end_section }
}
#let statement-average(work, index) = if index == 0 { none } else {
  let interval = work.rows.at(index - 1, default: none)
  if interval == none { none } else { (interval.start_section + interval.end_section) / 2 }
}
#let statement-quantity(work, index) = if index == 0 { none } else {
  let interval = work.rows.at(index - 1, default: none)
  if interval == none { none } else { interval.quantity }
}
// A work has Section / Average / Total. Fixed, readable number cells let us
// calculate the number of complete work groups that fit in the current width.
#let statement-number-column = 16.5mm
#let statement-panel(title, definitions, include-geometry: false, first: false, column-start: 1) = {
  let visible = definitions.filter(definition => {
    let work = schedules.at(definition.key, default: none)
    work != none and work.rows.len() > 0
  })
  if visible.len() > 0 {
    if not first { pagebreak() }
    heading(level: 2)[#title]
    if first {
      note[Average section value = (A1 + A2) / 2. Interval quantity = average section value × length.]
      v(4pt)
    }
    // Chainage and interval length identify every row, so retain them on each
    // continuation panel. The three extra geometry columns belong only to the
    // first panel.
    let fixed-count = if include-geometry { 5 } else { 2 }
    let fixed-columns = if fixed-count == 5 {
      (16mm, 15mm, 18mm, 17mm, 20mm)
    } else if fixed-count == 2 {
      (18mm, 16mm)
    } else { () }
    let work-columns = (statement-number-column,) * (visible.len() * 3)
    let fixed-headers = if fixed-count == 5 {
      ([Chainage], [Length (m)], [Average toe RL (m)], [Bund height (m)], [Bund width / surveyed ground perimeter (m)])
    } else if fixed-count == 2 { ([Chainage], [Length (m)]) } else { () }
    // Each header is constrained to its own cell, so long work names wrap
    // rather than widening the table or colliding with adjacent numbers.
    let grouped = visible.map(definition => table.cell(colspan: 3, align: center)[
      #box(width: 100%)[*#definition.label*]
    ])
    let labels = visible.map(_ => (
      [#box(width: 100%)[*Section*]], [#box(width: 100%)[*Average*]], [#box(width: 100%)[*Total*]]
    )).flatten()
    let units = visible.map(definition => (
      [#box(width: 100%)[#definition.section-unit]],
      [#box(width: 100%)[#definition.section-unit]],
      [#box(width: 100%)[#definition.total-unit]]
    )).flatten()
    let numbers = visible.enumerate().map(((work-index, _)) => {
      let start = column-start + (if first { fixed-count } else { 0 }) + work-index * 3
      ([(#start)], [(#(start + 1))], [(#(start + 2))])
    }).flatten()
    let fixed-numbering = range(fixed-count).map(index => [(#(index + 1))])
    let header = (
      ..fixed-headers.map(cell => table.cell(rowspan: 3, align: center + horizon)[*#cell*]),
      ..grouped,
      ..labels,
      ..units,
      ..fixed-numbering,
      ..numbers,
    )
    let body = sections.enumerate().map(((index, section)) => {
      let previous = if index == 0 { none } else { sections.at(index - 1) }
      let length = if previous == none { none } else { section.chainage_m - previous.chainage_m }
      let fixed = if fixed-count == 5 {
        ([#metadata(section.at("_ee_print_id", default: ""))#section.chainage], number(length), [
          #number(section.average_toe_rl)#if section.at("detailed_ground_profile", default: false) { super[\*] }
        ],
          number(section.height_m), number(section.base_width_m))
      } else if fixed-count == 2 { ([#metadata(section.at("_ee_print_id", default: ""))#section.chainage], number(length)) } else { () }
      let works = visible.map(definition => {
        let work = schedules.at(definition.key)
        (number(statement-value(work, index)), number(statement-average(work, index)),
          strong(number(statement-quantity(work, index))))
      }).flatten()
      (..fixed, ..works)
    }).flatten()
    let total-length = if sections.len() < 2 { 0 } else {
      sections.last().chainage_m - sections.first().chainage_m
    }
    let fixed-total = if fixed-count == 5 {
      ([*Total*], strong(number(total-length)), [], [], [])
    } else if fixed-count == 2 { ([*Total*], strong(number(total-length))) } else { () }
    let work-totals = visible.enumerate().map(((index, definition)) => {
      let work = schedules.at(definition.key)
      ([], [], strong(number(work.total)))
    }).flatten()
    table(
      columns: fixed-columns + work-columns,
      align: (col, row) => if col < fixed-count and col == 0 { left } else { right },
      stroke: 0.45pt + rgb("#aebbc4"),
      fill: (col, row) => if row < 4 { rgb("#f1f5f9") } else { none },
      inset: (x: 2pt, y: 3.5pt),
      table.header(repeat: true, ..header),
      ..body,
      ..fixed-total,
      ..work-totals,
    )
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
        #text(size: 0.76em, fill: rgb("#163f57"), weight: "bold")[#layout-label]
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
#if show-freeboard {
  table(columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr), align: center,
    stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 4pt, y: 4pt),
    chip([MWL (m)], number(max-water-level-m)), chip([Freeboard (m)], number(freeboard-m)),
    chip([TBL (m)], number(top-bund-level-rl)), chip([FTL (m)], number(full-tank-level-m)),
    chip([U/S slope], [#number(upstream-slope):1]), chip([D/S slope], [#number(downstream-slope):1]))
} else {
  table(columns: (1fr, 1fr, 1fr, 1fr, 1fr), align: center,
    stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 4pt, y: 4pt),
    chip([MWL (m)], number(max-water-level-m)), chip([TBL (m)], number(top-bund-level-rl)),
    chip([FTL (m)], number(full-tank-level-m)),
    chip([U/S slope], [#number(upstream-slope):1]), chip([D/S slope], [#number(downstream-slope):1]))
}

#if is-zoned and show-hearting and hearting-design != none {
  // Keep all zoned construction values in one compact band. The former two
  // stacked tables left too little room for the unbreakable assembly drawing.
  let zoned-cells = (
    chip([Hearting top RL (m)], number(hearting-design.topLevel)),
    chip([Hearting top width (m)], number(hearting-design.topWidth)),
    chip([U/S hearting slope], [#number(hearting-design.usSlope):1]),
    chip([D/S hearting slope], [#number(hearting-design.dsSlope):1]),
  )
  if show-cutoff-trench and cutoff-trench != none {
    zoned-cells.push(chip([Cut-off depth (m)], number(cutoff-trench.resolved_depth_m)))
    zoned-cells.push(chip([Cut-off area (m²)], number(cutoff-trench.area_m2)))
    zoned-cells.push(chip([Cut-off bottom width (m)], number(cutoff-trench.at("bottomWidth", default: none))))
  }
  v(3pt)
  table(columns: (1fr,) * zoned-cells.len(), align: center,
    stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 3pt, y: 3pt),
    ..zoned-cells)
  v(1.5pt)
  note[Casing and impervious hearting are measured separately. The core is contained within the proposed embankment.]
} else {
  if show-hearting and hearting-design != none {
    v(4pt)
    table(columns: (1fr, 1fr, 1fr, 1fr), align: center,
      stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 4pt, y: 4pt),
      chip([Hearting top RL (m)], number(hearting-design.topLevel)),
      chip([Hearting top width (m)], number(hearting-design.topWidth)),
      chip([U/S hearting slope], [#number(hearting-design.usSlope):1]),
      chip([D/S hearting slope], [#number(hearting-design.dsSlope):1]))
  }

  if show-cutoff-trench and cutoff-trench != none {
    v(4pt)
    table(columns: (1fr, 1fr, 1fr), align: center,
      stroke: 0.5pt + accent, fill: rgb("#f7fafc"), inset: (x: 4pt, y: 4pt),
      chip([Cut-off trench depth (m)], number(cutoff-trench.resolved_depth_m)),
      chip([Cut-off trench area (m²)], number(cutoff-trench.area_m2)),
      chip([Cut-off trench bottom width (m)], number(cutoff-trench.at("bottomWidth", default: none))))
  }
}

#if show-repair-kind {
  v(3pt)
  note[Repair category: #repair-kind · Soil source: #soil-source. Repair is measured between the surveyed existing profile and the proposed section; retained earth is excluded from additional fill.]
} else if not is-new {
  v(3pt)
  note[Repair is measured between the surveyed existing profile and the proposed section. Retained earth is excluded from the additional fill.]
}

#v(if is-zoned { 2pt } else { 3pt })
#vector(drawings.assembly, height: if is-zoned { 98mm } else { auto })

#pagebreak()
// --------------------------------------------------------------------------
// Statement of quantities
// --------------------------------------------------------------------------
#let earthwork-columns = (
  (key: "clearance", label: [Jungle clearance], section-unit: [(m)], total-unit: [(m²)]),
  (key: "foundation", label: if is-new {
    [Bund foundation excavation — depth #number(design.stripDepth) m]
  } else {
    [Stripping and excavation of existing ground — depth #number(design.stripDepth) m]
  }, section-unit: [(m²)], total-unit: [(m³)]),
  (key: "formation", label: if is-new {
    [Homogeneous bund filling (excluding berms)]
  } else {
    [Additional homogeneous fill for restoration / strengthening]
  }, section-unit: [(m²)], total-unit: [(m³)]),
  (key: "casing", label: [Casing zone (earthwork fill)], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "hearting", label: [Hearting zone (impervious core fill)], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "cutoff_trench", label: [Hearting cut-off trench], section-unit: [(m²)], total-unit: [(m³)]),
)
#let protection-columns = (
  (key: "upstream_toe", label: [U/S toe-wall excavation], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "downstream_drain", label: [D/S toe-drain excavation], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "upstream_protection", label: [U/S toe protection], section-unit: [(m²)], total-unit: [(m³ / m²)]),
  (key: "downstream_protection", label: [D/S drain protection], section-unit: [(m²)], total-unit: [(m³ / m²)]),
  (key: "revetment", label: [U/S revetment], section-unit: [(m²)], total-unit: [(m³ / m²)]),
  (key: "turfing", label: [D/S turfing], section-unit: [(m)], total-unit: [(m²)]),
  (key: "rock_toe", label: [Rock toe], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "rock_toe_excavation", label: [Rock-toe foundation excavation], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "rock_toe_filter", label: [Rock-toe graded filter], section-unit: [(m²)], total-unit: [(m³)]),
)
#let filter-columns = (
  (key: "horizontal_filter", label: [Horizontal filter], section-unit: [(m² / m)], total-unit: [(m³ / m²)]),
  (key: "chimney_filter", label: [Vertical filter], section-unit: [(m² / m)], total-unit: [(m³ / m²)]),
  (key: "chute_excavation", label: [Chute-drain excavation], section-unit: [(m²)], total-unit: [(m³)]),
  (key: "chute_lining", label: [Chute-drain lining], section-unit: [(#chute-geometry.equivalent_section_unit)], total-unit: [(#chute-geometry.protection_unit)]),
)
#let berm-columns = berms.enumerate().map(((index, berm)) => {
  let side = if berm.side == "us" { [U/S] } else { [D/S] }
  let rl = number(berm.level)
  let columns = ()
  columns.push((key: "berm_fill_" + str(index), label: [Berm filling (#side, RL #rl)],
    section-unit: [(m²)], total-unit: [(m³)]))
  if berm.surface != none {
    columns.push((key: "berm_surface_" + str(index), label: [Berm protection (#side, RL #rl)],
      section-unit: [(m)], total-unit: if berm.surface.measure == "volume" { [(m³)] } else { [(m²)] }))
  }
  if berm.drain != none {
    columns.push((key: "berm_drain_" + str(index), label: [Berm drain protection (#side, RL #rl)],
      section-unit: [(m)], total-unit: if berm.drain.measure == "volume" { [(m³)] } else { [(m²)] }))
  }
  if berm.excavation != none {
    columns.push((key: "berm_drain_exc_" + str(index), label: [Berm drain excavation (#side, RL #rl)],
      section-unit: [(m²)], total-unit: [(m³)]))
  }
  columns
}).flatten()
#let statement-columns = (earthwork-columns + protection-columns + filter-columns + berm-columns).filter(
  it => {
    let work = schedules.at(it.key, default: none)
    work != none and work.rows.len() > 0
  }
)
// Typst tables only break vertically. Work out the capacity from the actual
// landscape paper width and its configured side margins, then start a new
// continuation page before another full group would exceed it.
#let statement-pages(definitions, available-width) = {
  let first-fixed-width = 86mm
  let continued-fixed-width = 34mm
  let group-width = statement-number-column * 3
  let first-capacity = calc.max(1, calc.floor((available-width - first-fixed-width) / group-width))
  let first-count = calc.min(definitions.len(), first-capacity)
  statement-panel(
    [Statement of quantities], definitions.slice(0, first-count),
    include-geometry: true, first: true, column-start: 1,
  )
  if definitions.len() > first-count {
    let continued-capacity = calc.max(1, calc.floor((available-width - continued-fixed-width) / group-width))
    for panel-start in range(first-count, definitions.len(), step: continued-capacity) {
      let panel-end = calc.min(panel-start + continued-capacity, definitions.len())
      statement-panel(
        [Statement of quantities — continued],
        definitions.slice(panel-start, panel-end),
        column-start: 6 + panel-start * 3,
      )
    }
  }
}
// The renderer supplies the selected landscape paper width less side margins.
// Keep the fallback for older saved render data.
#let statement-available-width = Bund.at("document_settings").at("statement_page_width_mm", default: 273) * 1mm
#statement-pages(statement-columns, statement-available-width)
#if clearance-manual.len() > 0 [
  #v(6pt)
  #heading(level: 3)[Manual jungle clearance]
  #table(columns: (1fr, 1fr, 1fr), table.header([*Length (m)*], [*Breadth (m)*], [*Area (m²)*]),
    ..clearance-manual.map(clearance => (number(clearance.length), number(clearance.breadth), number(clearance.quantity))).flatten())
]
#let detailed-sections = sections.filter(section => section.at("detailed_ground_profile", default: false))
#let exhibit-sections = if is-new { detailed-sections } else { sections }
#if detailed-sections.len() > 0 {
  v(4pt)
  text(size: 0.74em, fill: slate)[\* Detailed existing-ground cross-section; bund width is the surveyed ground perimeter between the designed toes.]
}

// New bunds only exhibit surveyed EGL that breaks from the two-toe line.
// Repair always prints every chainage because fill is measured against the existing profile.
#if exhibit-sections.len() > 0 {
  pagebreak()
  heading(level: 2)[Cross-sections]
  for (section-index, section) in exhibit-sections.enumerate() {
    if is-zoned and section-index > 0 and calc.rem(section-index, 2) == 0 {
      pagebreak()
      heading(level: 2)[Cross-sections — continued]
    }
    block(breakable: false, below: if is-zoned { 5pt } else { 9pt })[
      #if is-zoned { set text(size: 7pt) }
      #heading(level: 3)[Ch #section.chainage · Average toe RL #number(section.average_toe_rl) m]
      #v(if is-zoned { 1.5pt } else { 3pt })
      #let total-area = section.stations.fold(0, (sum, station) =>
        sum + if station.signed_area_m2 == none { 0 } else { station.signed_area_m2 })
      #let section-summary = [
        #table(
          columns: (1fr, 1fr), align: center,
          inset: (x: 3pt, y: if is-zoned { 1.5pt } else { 3pt }),
          fill: rgb("#edf5f7"),
          [#dim-label([SURVEYED GROUND PERIMETER]) #linebreak() #dim-value([#number(section.ground_perimeter_m) m])],
          [#dim-label([FOUNDATION / STRIPPING AREA]) #linebreak() #dim-value([#number(section.areas.stripping) m²])],
        )
        #v(1.5pt)
        #vector(section.svg, height: if is-zoned { 39mm } else { 55mm })
      ]
      #let formation-calculation = [
        #table(
          columns: (12mm, 17mm, 17mm, 1fr, 20mm),
          align: (right, right, right, left, right),
          inset: (x: if is-zoned { 2pt } else { 2.2pt }, y: if is-zoned { 0.6pt } else { 2.2pt }),
          table.header([*Ch*], [*EL*], [*RL*], [*Calculation*], [*Quantity*]),
          ..section.stations.map(station => (
            number(station.distance_m), number(station.existing_rl), number(station.proposed_rl),
            if station.width_m == none { [Start point] } else [
              #number(station.width_m) × [(#number(station.start_depth_m)) + (#number(station.end_depth_m))] / 2
            ],
            number(station.signed_area_m2),
          )).flatten(),
          table.cell(colspan: 4, align: right)[*Total formation quantity*],
          [*#number(total-area) m²*],
        )
      ]
      #if is-zoned and show-hearting and section.at("hearting_stations", default: ()).len() > 0 {
        grid(columns: (0.48fr, 1.52fr), gutter: 8pt, align: (center + horizon, center + horizon),
          [
            #table(
              columns: (1fr, 1fr), align: center,
              inset: (x: 2pt, y: 1pt), fill: rgb("#edf5f7"),
              [#dim-label([GROUND PERIMETER]) #linebreak() #dim-value([#number(section.ground_perimeter_m) m])],
              [#dim-label([STRIPPING AREA]) #linebreak() #dim-value([#number(section.areas.stripping) m²])],
            )
          ],
          vector(section.svg, height: 24mm),
        )
        v(1.5pt)
        grid(
          columns: (1.16fr, 0.84fr),
          gutter: 8pt,
          align: (left + top, left + top),
          formation-calculation,
          [
            #text(weight: "bold", fill: rgb("#163f57"))[Impervious hearting]
            #h(4pt)
            #note[Casing = formation less hearting.]
            #v(1pt)
            #table(
              columns: (12mm, 17mm, 17mm, 1fr, 20mm),
              align: (right, right, right, left, right),
              inset: (x: 2pt, y: 0.6pt),
              table.header([*Ch*], [*EL*], [*RL*], [*Calculation*], [*Qty*]),
              ..section.hearting_stations.map(station => (
                number(station.distance_m), number(station.existing_rl), number(station.proposed_rl),
                if station.width_m == none { [Start point] } else [
                  #number(station.width_m) × [(#number(station.start_depth_m)) + (#number(station.end_depth_m))] / 2
                ],
                number(station.signed_area_m2),
              )).flatten(),
            )
          ],
        )
      } else {
        grid(
          columns: (0.92fr, 1.08fr),
          gutter: 10pt,
          align: (center + top, left + top),
          section-summary,
          [
            #formation-calculation
            #if show-hearting and section.at("hearting_stations", default: ()).len() > 0 {
              v(6pt)
              heading(level: 3)[Impervious hearting]
              note[Casing is the remaining formation after the impervious hearting zone is deducted.]
              v(2pt)
              table(
                columns: (12mm, 17mm, 17mm, 1fr, 20mm),
                align: (right, right, right, left, right),
                inset: (x: 2.2pt, y: 2.2pt),
                table.header([*Ch*], [*EL*], [*RL*], [*Calculation*], [*Quantity*]),
                ..section.hearting_stations.map(station => (
                  number(station.distance_m), number(station.existing_rl), number(station.proposed_rl),
                  if station.width_m == none { [Start point] } else [
                    #number(station.width_m) × [(#number(station.start_depth_m)) + (#number(station.end_depth_m))] / 2
                  ],
                  number(station.signed_area_m2),
                )).flatten(),
              )
            }
          ],
        )
      }
    ]
  }
}
#pagebreak()
#set page(
  paper: document-settings.paper,
  flipped: document-settings.flipped,
  margin: (
    top: document-settings.margins.top * 1mm,
    right: document-settings.margins.right * 1mm,
    bottom: document-settings.margins.bottom * 1mm,
    left: document-settings.margins.left * 1mm,
  ),
)

// --------------------------------------------------------------------------
// Earthwork excavation classification
// --------------------------------------------------------------------------
#heading(level: 2)[Earthwork excavation classification]
#v(1pt)
#note[Percentages are the selected dashboard classification applied to each measured source.]
#v(2pt)
#let excavation-labels = (
  "stripping": if is-new { [Foundation / stripping] } else { [Bund stripping] },
  "ustoe-exc": [Upstream toe wall],
  "dstoe-exc": [Downstream toe drain], "rocktoe-exc": [Rock-toe trench],
  "hearting-trench-exc": [Hearting cut-off trench], "chute-exc": [Chute drain],
  "berm-drain-exc": [Berm catch-water drains]
)
#for excavation-source in excavation-sources {
  let eLabel = excavation-labels.at(excavation-source.role, default: [Excavation])
  heading(level: 3)[#eLabel · #number(excavation-source.quantity) m³]
  if excavation-source.classes.len() > 0 {
    table(columns: (1fr, auto, 1fr, 2fr, auto), align: (left, center, center, left, right),
      table.header([*Soil / rock*], [*Share (%)*], [*Code*], [*Calculation*], [*Quantity (m³)*]),
      ..excavation-source.classes.map(soil => ([#soil.soil], number(soil.percent), [#soil.code],
        [#number(excavation-source.quantity) × #number(soil.percent) / 100], number(soil.quantity))).flatten())
  } else {
    note[No soil classification is assigned.]
  }
}

#heading(level: 2)[Payable quantities of Excavation.]
#v(1pt)
#note[Each excavation DATA code is shown once, followed by the works contributing to its total.]
#v(4pt)
#for excavation-code in excavation-by-code {
  block(breakable: false, below: 12pt)[
    #par(leading: 0.58em)[
      #strong([#excavation-code.code.]) #excavation-description-runs(excavation-code.descriptionRuns)
    ]
    #v(5pt)
    #table(
      columns: (1fr,) * excavation-code.terms.len() + (auto,),
      align: (col, row) => if col == excavation-code.terms.len() { right } else { center },
      stroke: none,
      inset: (x: 4pt, y: 2pt),
      ..excavation-code.terms.map(term => [#term.label]),
      [*Total*],
      ..excavation-code.terms.enumerate().map(((index, term)) => [
        #if index > 0 { text("+"); h(3pt) }#metadata(term.at("_ee_print_id", default: ""))#number(term.quantity)
      ]),
      [#text("=") #metadata(excavation-code.at("_ee_print_id", default: ""))#underline(strong(number(excavation-code.total))) m³],
    )
  ]
}

// --------------------------------------------------------------------------
// Payable quantities (excluding excavation DATA already listed above)
// --------------------------------------------------------------------------
#if payable-by-code.len() > 0 [
  #heading(level: 2)[Payable quantities]
  #v(1pt)
  #note[Each work code is shown once, followed by the components that add to its total. Excavation quantities are in Payable quantities of Excavation above and are not repeated here. Distinct operations can share a measured volume; their quantities must not be added to obtain geometric fill.]
  #v(4pt)
  #for payable-code in payable-by-code {
    block(breakable: false, below: 12pt)[
      #par(leading: 0.58em)[
        #strong([#payable-code.code.]) #excavation-description-runs(payable-code.descriptionRuns)
      ]
      #v(5pt)
      #table(
        columns: (1fr,) * payable-code.terms.len() + (auto,),
        align: (col, row) => if col == payable-code.terms.len() { right } else { center },
        stroke: none,
        inset: (x: 4pt, y: 2pt),
        ..payable-code.terms.map(term => [#term.label]),
        [*Total*],
        ..payable-code.terms.enumerate().map(((index, term)) => [
          #if index > 0 { text("+"); h(3pt) }#metadata(term.at("_ee_print_id", default: ""))#number(term.quantity)
        ]),
        [#text("=") #metadata(payable-code.at("_ee_print_id", default: ""))#underline(strong(number(payable-code.total))) #payable-code.unit],
      )
    ]
  }
]

// --------------------------------------------------------------------------
// Component details
// --------------------------------------------------------------------------
#if drawings.upstream_toe != "" or drawings.downstream_drain != "" or drawings.rock_toe != "" or drawings.filters != "" or drawings.chute != "" or berms.len() > 0 [
  #heading(level: 2)[Component details]
]
#if drawings.upstream_toe != "" [
  #block(breakable: false)[
    #heading(level: 3)[Upstream toe wall / anchorage]
    #grid(
      columns: (1.4fr, 1fr),
      gutter: 14pt,
      align: (center + horizon, left + horizon),
      vector(drawings.upstream_toe),
      dims((
        dim-label([Top width (m)]), dim-value(number(Bund.configuration.upstreamToe.topWidth)),
        dim-label([Bottom width (m)]), dim-value(number(Bund.configuration.upstreamToe.bottomWidth)),
        dim-label([Depth (m)]), dim-value(number(Bund.configuration.upstreamToe.depth)),
        dim-label([Side slope (H:V)]), dim-value(number(Bund.configuration.upstreamToe.leftSlope)),
      )),
    )
  ]
]
#if drawings.downstream_drain != "" [
  #block(breakable: false)[
    #heading(level: 3)[Downstream toe drain]
    #vector(drawings.downstream_drain)
  ]
]
#if drawings.rock_toe != "" [
  #block(breakable: false)[
    #heading(level: 3)[Rock toe and graded filter]
    #note[The shared general excavation beneath the rock-toe foundation is assigned to the rock-toe trench and deducted from the general cut. It is counted once.]
    #vector(drawings.rock_toe)
  ]
]
#if drawings.filters != "" [
  #block(breakable: false)[
    #heading(level: 3)[Internal drainage arrangement]
    #vector(drawings.filters)
  ]
]
#if drawings.chute != "" [
  #block(breakable: false)[
    #heading(level: 3)[Chute drains]
    Excavation area: A = W × D = #number(chute-geometry.width_m) × #number(chute-geometry.depth_m) = #number(chute-geometry.excavation_area_m2) m². Lined perimeter: P = W + 2D = #number(chute-geometry.lined_perimeter_m) m. Per chute, excavation = A × developed length; protection = P × developed length#if chute-geometry.protection_measure == "volume" [ × lining thickness].
    #vector(drawings.chute)
  ]
]
#let berm-card(berm) = {
  metadata(berm.at("_ee_print_id", default: ""))
  let side = if berm.side == "us" { [U/S] } else { [D/S] }
  block(breakable: false, width: 100%)[
    #text(size: 1.02em, weight: "bold", fill: rgb("#163f57"))[#side berm · Shelf RL #number(berm.level) m]
    #v(3pt)
    #note[The shelf is included in the embankment geometry; only its selected surfacing and drain works are additional quantities.]
    #vector(berm.svg)
    #if berm.surface != none [#note[Shelf surfacing: #number(berm.surface.quantity) #if berm.surface.measure == "volume" { [m³] } else { [m²] }]]
    #if berm.drain != none [#note[Drain protection: #number(berm.drain.quantity) #if berm.drain.measure == "volume" { [m³] } else { [m²] }]]
    #if berm.excavation != none [#note[Drain excavation: #number(berm.excavation.total) m³]]
  ]
}
#let us-berms = berms.filter(berm => berm.side == "us")
#let ds-berms = berms.filter(berm => berm.side == "ds")
#if berms.len() > 0 [
  #heading(level: 3)[Berm shelves]
  #note[U/S shelves sit on the left (water face, mirrored); D/S shelves sit on the right. Each figure is labelled with its shelf RL.]
  #grid(
    columns: (1fr, 1fr),
    gutter: 12pt,
    align: (top, top),
    stack(spacing: 10pt,
      text(size: 0.82em, weight: "bold", fill: navy)[U/S berms],
      ..us-berms.map(berm-card),
    ),
    stack(spacing: 10pt,
      text(size: 0.82em, weight: "bold", fill: navy)[D/S berms],
      ..ds-berms.map(berm-card),
    ),
  )
]

// --------------------------------------------------------------------------
// Phreatic-line comparison
// --------------------------------------------------------------------------
#if phreatic != none [
  #block(breakable: false)[
    #heading(level: 2)[Phreatic-line comparison]
    #v(1pt)
    #note[Reference and selected drainage conditions at the governing cross-section.]
    #table(columns: (2fr, 1fr, 1fr), align: (left, right, right),
      table.header([*Parameter*], [*Without drainage*], [*Selected drainage*]),
      [Focus datum RL (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.baseRl }), number(if phreatic.selected == none { none } else { phreatic.selected.baseRl }),
      [Water depth (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.waterDepth }), number(if phreatic.selected == none { none } else { phreatic.selected.waterDepth }),
      [Focal distance S; q = K × S (m)], number(if phreatic.baseline == none { none } else { phreatic.baseline.s }), number(if phreatic.selected == none { none } else { phreatic.selected.s }))
    #vector(phreatic.svg)
  ]
]

// --------------------------------------------------------------------------
// Signature
// --------------------------------------------------------------------------
#if signature.len() > 0 {
  block(width: 100%, height: 1fr, breakable: false)[#align(bottom)[
    #line(length: 100%, stroke: 0.65pt + rgb("#6f7d85"))
    #v(3mm)
    #grid(columns: (1fr,) * signature.len(), gutter: 10mm, align: center,
      ..signature.map(signatory => [
        #v(11mm)
        #line(length: 82%, stroke: 0.7pt + rgb("#273b47"))
        #v(2mm)
        #text(9pt, weight: "bold", fill: navy)[#signatory.designation]
        #if signatory.office != "" [#linebreak() #text(8pt, fill: luma(90))[#signatory.office]]
      ]))
  ]]
}
