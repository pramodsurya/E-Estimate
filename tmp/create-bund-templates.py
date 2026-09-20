from pathlib import Path

folder = Path('src/renderer/src/lib/typist-output/bund')
common = r'''// E-Estimate document settings: begin
#set page(paper: "a4", flipped: true, margin: (top: 12mm, right: 12mm, bottom: 12mm, left: 12mm))
#set text(font: ("Calibri", "Arial", "Liberation Sans"), size: 9.5pt)
// E-Estimate document settings: end

// DEFAULT BUND LAYOUT — this complete script is editable and can be given to an AI.
// Headings and labels are literal Typst content. Only project values come from JSON.
// Preserve loops: new sections/items appear on opening Studio without rewriting this file.
// Save stores this design for this component AND bund type. Defaults replaces it only
// after confirmation. Recompile renders the current script with the loaded data.
// Bund.design: topLevel, topWidth, usSlope, dsSlope, mwl, ftl, freeBoard, stripDepth (m).
// Bund.hearting_design and Bund.cutoff_trench: dashboard geometry (m; slopes H:V).
// Bund.schedules: named optional schedules, each {rows, total}. Each row contains
// from_chainage, to_chainage (display strings), length_m, start_section, end_section,
// average_section, quantity. Section units are m² for volume works, m for area works.
// Bund.excavation: [{role, quantity, classes:[{soil,percent,code,description,quantity}]}].
// Bund.payable_items: code, description, unit, quantity, role, measure; already merged
// by the same engineering engine as the dashboard. Never sum rolling into fill volume.
// Bund.sections: chainage, average_toe_rl, height_m, base_width_m, svg, areas,
// stations, hearting_stations, fill_bands, cut_bands, hearting_bands.
// Station operands: distance_m, existing_rl, proposed_rl, width_m, start_depth_m,
// end_depth_m, signed_area_m2. Negative signed area means cut, not negative fill.
// Band operands: fromOffset, toOffset, upperFromRl, upperToRl, lowerFromRl, lowerToRl.
// Use the engine's positive cut/fill bands for payable areas, not the signed survey sum.
// Bund.drawings: assembly, upstream_toe, downstream_drain, rock_toe, filters, chute.
// Each drawing is an SVG string, embedded as vector artwork with image.decode.
// Empty SVG strings mean no drawing. No screenshot, HTML renderer or file path is needed.
// Bund.berms: configured dimensions, svg, optional surface/drain measurements and excavation.
// Bund.phreatic: none if hidden, otherwise baseline/selected calculation objects.
// Bund.configuration: all current dashboard inputs, including optional protection dimensions.
// Missing optional schedules hide their whole block. Zero is a valid survey level.
// You can change colours, headings, widths, order and page breaks below freely.
#let Bund = json(bytes(sys.inputs.at("ee-data")))
#let number(value) = if value == none { [—] } else { str(calc.round(value, digits: 3)) }
#let navy = rgb("#17384a")
#let teal = rgb("#147d86")
#show heading.where(level: 1): set text(size: 18pt, fill: navy)
#show heading.where(level: 2): set text(size: 12pt, fill: teal)
#show heading.where(level: 3): set text(size: 10pt, fill: navy)
#set heading(numbering: none)
#set par(justify: false, leading: 0.6em)
#set table(inset: 5pt, stroke: 0.35pt + rgb("#d5dfe4"),
  fill: (column, row) => if row == 0 { rgb("#edf3f5") } else { none })
#set page(footer: context align(right)[#text(8pt, fill: navy)[#Bund.component_name · #counter(page).display("1 / 1", both: true)]])
#let vector(svg, height: 118mm) = if svg != "" {
  align(center, image.decode(bytes(svg), format: "svg", width: 100%, height: height, fit: "contain"))
}
#let dimensions(cells) = table(columns: (1fr, auto, 1fr, auto), ..cells)
#let schedule(title, key, unit: [m³]) = {
  let work = Bund.schedules.at(key, default: none)
  if work != none and work.rows.len() > 0 {
    heading(level: 3, title)
    table(columns: (1fr, 1fr, auto, auto, auto, auto, auto), align: (left, left, right, right, right, right, right),
      table.header([*From Ch.*], [*To Ch.*], [*Length (m)*], [*Start section*], [*End section*], [*Average*], [*Quantity*]),
      ..work.rows.map(interval => (
        [#interval.from_chainage], [#interval.to_chainage], number(interval.length_m),
        number(interval.start_section), number(interval.end_section), number(interval.average_section), number(interval.quantity)
      )).flatten(),
      table.cell(colspan: 6)[*Total*], [*#number(work.total) #unit*]
    )
  }
}
#let band-calculations(title, bands) = if bands.len() > 0 {
  heading(level: 3, title)
  table(columns: (auto, auto, auto, auto, auto, 1fr),
    table.header([*From offset (m)*], [*To offset (m)*], [*Width (m)*], [*Start depth (m)*], [*End depth (m)*], [*Area (m²)*]),
    ..bands.map(band => {
      let width = band.toOffset - band.fromOffset
      let start = band.upperFromRl - band.lowerFromRl
      let end = band.upperToRl - band.lowerToRl
      (number(band.fromOffset), number(band.toOffset), number(width), number(start), number(end), [#number(width) × (#number(start) + #number(end)) / 2 = #number(width * (start + end) / 2)])
    }).flatten()
  )
}
#let station-table(stations) = if stations.len() > 0 {
  table(columns: (auto, auto, auto, 1fr, auto),
    table.header([*Distance (m)*], [*Existing RL*], [*Proposed RL*], [*Calculation*], [*Signed area (m²)*]),
    ..stations.map(station => (
      number(station.distance_m), number(station.existing_rl), number(station.proposed_rl),
      if station.width_m == none { [Start point] } else {
        [#number(station.width_m) × (#number(station.start_depth_m) + #number(station.end_depth_m)) / 2]
      }, number(station.signed_area_m2)
    )).flatten()
  )
}

'''
intro = r'''
*#Bund.project_name* \ #Bund.component_name
#v(4pt)
#dimensions((
  [Bund length (m)], number(Bund.length_m), [Datum RL (m)], number(Bund.datum_rl),
  [Top bund level (m)], number(Bund.design.topLevel), [Crest width (m)], number(Bund.design.topWidth),
  [Maximum water level (m)], number(Bund.design.mwl), [Full tank level (m)], number(Bund.design.ftl),
  [Upstream slope (H:V)], [#number(Bund.design.usSlope):1], [Downstream slope (H:V)], [#number(Bund.design.dsSlope):1]
))
'''
optional = r'''
#schedule([Upstream toe excavation], "upstream_toe")
#schedule([Downstream drain excavation], "downstream_drain")
#schedule([Upstream toe protection], "upstream_protection", unit: [#Bund.configuration.upstreamToe.buildMaterial.at("unit", default: "")])
#schedule([Downstream drain protection], "downstream_protection", unit: [#Bund.configuration.downstreamToe.buildMaterial.at("unit", default: "")])
#schedule([Revetment], "revetment", unit: [#if Bund.configuration.pitchingAsVolume { [m³] } else { [m²] }])
#schedule([Downstream turfing], "turfing", unit: [m²])
#schedule([Rock toe], "rock_toe")
#schedule([Rock-toe excavation — shared cut counted once], "rock_toe_excavation")
#schedule([Graded rock-toe filter], "rock_toe_filter")
#schedule([Horizontal drainage blanket], "horizontal_filter")
#schedule([Chimney filter], "chimney_filter")

#pagebreak(weak: true)
== Earthwork excavation classification
Percentages below are the selected dashboard classification applied to each measured source.
#let excavation-labels = (
  "stripping": [Foundation / stripping], "ustoe-exc": [Upstream toe wall],
  "dstoe-exc": [Downstream toe drain], "rocktoe-exc": [Rock-toe trench],
  "hearting-trench-exc": [Hearting cut-off trench], "chute-exc": [Chute drain],
  "berm-drain-exc": [Berm catch-water drain]
)
#for excavation in Bund.excavation {
  heading(level: 3, excavation-labels.at(excavation.role, default: [Excavation]))
  [*Measured excavation:* #number(excavation.quantity) m³]
  if excavation.classes.len() > 0 {
    table(columns: (1fr, auto, 1fr, 2fr, auto),
      table.header([*Soil / rock*], [*Share (%)*], [*Code*], [*Calculation*], [*Quantity (m³)*]),
      ..excavation.classes.map(soil => ([#soil.soil], number(soil.percent), [#soil.code],
        [#number(excavation.quantity) × #number(soil.percent) / 100], number(soil.quantity))).flatten()
    )
  } else { parbreak(); [No soil classification is assigned.] }
}

== Component details
#if Bund.drawings.upstream_toe != "" [
  === Upstream toe wall / anchorage
  #vector(Bund.drawings.upstream_toe, height: 85mm)
  #dimensions(([Top width (m)], number(Bund.configuration.upstreamToe.topWidth),
    [Bottom width (m)], number(Bund.configuration.upstreamToe.bottomWidth),
    [Depth (m)], number(Bund.configuration.upstreamToe.depth), [Side slope (H:V)], number(Bund.configuration.upstreamToe.leftSlope)))
]
#if Bund.drawings.downstream_drain != "" [
  === Downstream toe drain
  #vector(Bund.drawings.downstream_drain, height: 85mm)
]
#if Bund.drawings.rock_toe != "" [
  === Rock toe and graded filter
  The shared general excavation beneath the rock-toe foundation is assigned to the rock-toe trench and deducted from the general cut. It is counted once.
  #vector(Bund.drawings.rock_toe, height: 95mm)
]
#if Bund.drawings.filters != "" [
  === Internal drainage arrangement
  #vector(Bund.drawings.filters, height: 90mm)
]
#if Bund.drawings.chute != "" [
  === Chute drains
  #vector(Bund.drawings.chute, height: 90mm)
]
#for berm in Bund.berms [
  === Berm shelf and catch-water drain
  The shelf is included in the embankment geometry. Only its selected surfacing and drain works are additional quantities.
  #vector(berm.svg, height: 80mm)
  #if berm.surface != none [*Shelf surfacing:* #number(berm.surface.quantity) #if berm.surface.measure == "volume" { [m³] } else { [m²] }]
  #if berm.drain != none [*Drain protection:* #number(berm.drain.quantity) #if berm.drain.measure == "volume" { [m³] } else { [m²] }]
  #if berm.excavation != none [*Drain excavation:* #number(berm.excavation.total) m³]
]

#if Bund.phreatic != none [
  == Phreatic-line comparison
  Reference and selected drainage conditions at the governing cross-section. These are seepage geometry results, not a stability certification.
  #table(columns: (2fr, 1fr, 1fr),
    table.header([*Parameter*], [*Without drainage*], [*Selected drainage*]),
    [Focus datum RL (m)], number(if Bund.phreatic.baseline == none { none } else { Bund.phreatic.baseline.baseRl }), number(if Bund.phreatic.selected == none { none } else { Bund.phreatic.selected.baseRl }),
    [Water depth (m)], number(if Bund.phreatic.baseline == none { none } else { Bund.phreatic.baseline.waterDepth }), number(if Bund.phreatic.selected == none { none } else { Bund.phreatic.selected.waterDepth }),
    [Focal distance S (m)], number(if Bund.phreatic.baseline == none { none } else { Bund.phreatic.baseline.s }), number(if Bund.phreatic.selected == none { none } else { Bund.phreatic.selected.s })
  )
]

#pagebreak(weak: true)
== Payable quantities
Selected work codes and quantities from the same engine as the component dashboard. Distinct operations can share a measured volume; their quantities must not be added to obtain geometric fill.
#table(columns: (auto, 1fr, 4fr, auto, auto),
  table.header([*No.*], [*Code*], [*Description*], [*Unit*], [*Quantity*]),
  ..Bund.payable_items.enumerate().map(((index, item)) => (
    [#(index + 1)], [#item.code], [#item.description], [#item.unit], number(item.quantity)
  )).flatten()
)
'''
ending = r'''
#if Bund.signature.len() > 0 {
  v(18mm)
  grid(columns: (1fr,) * Bund.signature.len(), gutter: 12pt,
    ..Bund.signature.map(signatory => align(center)[*#signatory.designation* \ #signatory.office]))
}
'''
for mode in ('new', 'repair'):
  for kind in ('homogeneous', 'zoned'):
    source = common + f'= {"NEW" if mode == "new" else "REPAIR"} {kind.upper()} BUND\n' + intro
    if mode == 'new':
      source += '\n*Freeboard (m):* #number(Bund.design.freeBoard)\n\n== Proposed bund arrangement\n#vector(Bund.drawings.assembly)\n'
    else:
      source += '\n== Existing and proposed repair arrangement\nRepair is measured between the surveyed existing profile and the proposed section. Retained earth is excluded from the additional fill.\n#vector(Bund.drawings.assembly)\n'
    if kind == 'zoned':
      source += '\n== Zoned embankment design\nCasing and impervious hearting are measured separately. The core is contained within the proposed embankment, not added on top of it.\n'
      if mode == 'repair': source += '*Repair category:* #Bund.repair_kind \\ *Soil source:* #Bund.soil_source\n'
    source += r'''
#pagebreak(weak: true)
== Statement of quantities
Mean-sectional measurement: average of the two end sections × interval length. Each schedule repeats its chainages to remain readable on subsequent pages.
'''
    if mode == 'new':
      source += r'''
#table(columns: (1fr, 1fr, 1fr, 1fr),
  table.header([*Chainage*], [*Average toe RL (m)*], [*Height (m)*], [*Base width (m)*]),
  ..Bund.sections.map(section => ([#section.chainage], number(section.average_toe_rl), number(section.height_m), number(section.base_width_m))).flatten())
'''
    source += '#schedule([Jungle clearance], "clearance", unit: [m²])\n'
    source += '#schedule([' + ('Foundation excavation' if mode == 'new' else 'Stripping and excavation of existing ground') + '], "foundation")\n'
    if kind == 'zoned':
      source += '#schedule([Casing zone — ' + ('new fill' if mode == 'new' else 'additional repair fill') + '], "casing")\n#schedule([Impervious hearting zone], "hearting")\n'
      if mode == 'new': source += '#schedule([Hearting cut-off trench — excavation and impervious filling], "cutoff_trench")\n'
    else: source += '#schedule([' + ('Homogeneous embankment formation' if mode == 'new' else 'Additional homogeneous fill for restoration / strengthening') + '], "formation")\n'
    source += optional
    source += r'''
#for section in Bund.sections [
  #pagebreak(weak: true)
  == Surveyed cross-section
  *Chainage:* #section.chainage
  #vector(section.svg, height: 98mm)
  === Existing and proposed levels
  #station-table(section.stations)
  #band-calculations([Net excavation bands], section.cut_bands)
  #band-calculations([Formation bands], section.fill_bands)
'''
    if kind == 'zoned':
      source += r'''
  === Impervious hearting calculation
  #station-table(section.hearting_stations)
  #band-calculations([Hearting fill bands], section.hearting_bands)
  Casing is the remaining formation after the impervious hearting zone is deducted.
'''
    source += ']\n' + ending
    # Optional material dictionaries may be none; avoid eagerly accessing them.
    source=source.replace('Bund.configuration.upstreamToe.buildMaterial.at("unit", default: "")','if Bund.configuration.upstreamToe.buildMaterial == none { "" } else { Bund.configuration.upstreamToe.buildMaterial.at("unit", default: "") }')
    source=source.replace('Bund.configuration.downstreamToe.buildMaterial.at("unit", default: "")','if Bund.configuration.downstreamToe.buildMaterial == none { "" } else { Bund.configuration.downstreamToe.buildMaterial.at("unit", default: "") }')
    (folder / f'{mode}-{kind}.typ').write_text(source, encoding='utf-8')
