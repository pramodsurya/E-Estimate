#metadata("ee-print-audit:v1")
// E-Estimate document settings: begin
#set page(paper: "a4", flipped: false, margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm))
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
// E-Estimate document settings: end

// E-Estimate DEFAULT DESIGN — edit this entire file or ask an AI to redesign it.
// The application passes JSON in sys.inputs["ee-data"]. Data is NOT Typst code.
// Keep the JSON binding and the data loops; redesign all headings, cells and styles.
// Optional data must be guarded with .at("field", default: ...) or an if condition.
// Empty arrays render no rows. A zero charge hides only a section explicitly guarded.
// Do not replace loops with fixed rows or hardcode project figures.
// Opening Studio supplies current data; Recompile uses those loaded values.
// Save retains your design. Restore Defaults replaces it only after confirmation.

// Lead.materials: array; each material has name, lead_km (formatted km), rate,
// rate_unit, lift_m (numeric metres), steps, calculation, and summary.
// summary: sl, name, quarry, conveyance_class, lead_km, lift_m, rate, uses (strings).
// Lead.project, year, zone, notes: strings; signature: [{designation, office}].
// Missing collection fields are defaulted below; optional charges are tested in Typst.
// Layout, headings, columns, colours and row formatting below are editable Typst code.
// Lead.charts: SOR source tables (COM-LDLFT-1..6) for applied Lead variants.
// Each chart has code, title, note, columns (key, label), and rows (sl, label, values).
// Lead.map: route-map PNG captured from Map Print Layout. available is true
// after capture. The marked "lead map page" block is rewritten from the GUI
// (paper, orientation, title, box size). Keep those begin/end comments.
// Lead contains project data only. Keep the Lead.materials loops so new
// materials and calculations appear when you open Print Studio, without rewriting this script.
// Each material.calculation exposes numeric leadRate, loadingRate, unloadingRate, liftRate,
// grossRate, quantity, distanceKm, chargedKm, grossAmount, netRate and notes.
// Steps expose quantity, unit_rate, amount_value; formatted expressions remain available.
// Lift: material.lift_m, included_lift_m, charged_lift_m, lift_unit_rate.
// calculation is none for older snapshots until refreshed on opening, and for published pipe rates.
#let Lead = (
  materials: (),
  signature: (),
  notes: "",
  project: "",
  year: "",
  zone: "",
  map: (available: false, path: "images/lead-route-map.png", title: "", subtitle: "", width_mm: 0, height_mm: 0),
  charts: (),
  ..json(bytes(sys.inputs.at("ee-data")))
)

#let signature-footer(rows) = if rows.len() > 0 {
  block(width: 100%, height: 1fr, breakable: false)[#align(bottom)[
    #line(length: 100%, stroke: 0.65pt + rgb("#6f7d85"))
    #v(3mm)
    #grid(columns: (1fr,) * rows.len(), gutter: 10mm, align: center,
      ..rows.map(signatory => [
        #v(11mm)
        #line(length: 82%, stroke: 0.7pt + rgb("#273b47"))
        #v(2mm)
        #text(9pt, weight: "bold", fill: rgb("#172f3d"))[#signatory.designation]
        #if signatory.office != "" [#linebreak() #text(8pt, fill: rgb("#596a73"))[#signatory.office]]
      ]))
  ]]
}



#show heading.where(level: 1): set text(size: 1.18em, weight: "bold", fill: rgb("#0b3d5c"))
#show heading.where(level: 1): it => align(center, it)
#show heading.where(level: 2): set text(size: 0.95em, weight: "bold", fill: rgb("#087e8b"))
#show heading.where(level: 3): set text(size: 0.91em, weight: "bold", fill: rgb("#0b3d5c"))

= LEAD STATEMENT & CONVEYANCE CHARGES

#align(center)[*#Lead.project*]
#align(center)[#emph[Lead Statement & Conveyance Charges]]
#align(center)[Standard Schedule of Rates (SOR: #Lead.year · #Lead.zone)]

#if Lead.charts.len() > 0 [
  == Lead Chart — Source tables

  #for chart in Lead.charts [
    #heading(level: 3)[#chart.code]
    #emph[#chart.title]
    #table(
      columns: (12mm, 1.6fr, ..chart.columns.map(column => 1fr)),
      align: (center, left, ..chart.columns.map(column => center)),
      stroke: 0.45pt + luma(180),
      inset: 4pt,
      fill: (col, row) => if row == 0 { rgb("#0b3d5c") } else if calc.even(row) { rgb("#f8fafc") } else { none },
      table.header(
        repeat: true,
        [#text(fill: white, size: 0.72em)[*Sl*]],
        [#text(fill: white, size: 0.72em)[*Description*]],
        ..chart.columns.map(column => [#text(fill: white, size: 0.62em)[*#column.label*]])
      ),
      ..chart.rows.map(chart_row => (
        [#text(size: 0.72em)[#chart_row.sl]],
        [#text(size: 0.72em)[#chart_row.label]],
        ..chart_row.values.map(value => [#text(size: 0.72em)[#value]])
      )).flatten()
    )
    #text(size: 0.72em, style: "italic")[#chart.note]
    #v(10pt)
  ]
]

== A. Summary of Material Leads & Adopted Rates

*#Lead.materials.len() Materials*

#table(
  columns: (10mm, 1.6fr, 1.4fr, 24mm, 20mm, 18mm, 30mm, 14mm),
  align: (center, left, left, center, right, right, right, center),
  stroke: (x, y) => if y == 0 { (bottom: 1.2pt + luma(50)) } else { 0.5pt + luma(200) },
  fill: (col, row) => if row == 0 { rgb("#007791") } else if calc.even(row) { rgb("#f8fafc") } else { none },
  table.header(
    repeat: true,
    [*Sl No*],
    [*Material / Description*],
    [*Quarry / Source*],
    [*Class*],
    [*Lead (Km)*],
    [*Lift (m)*],
    [*Rate (Rs / Unit)*],
    [*Uses*]
  ),
  ..Lead.materials.map(material => (
    [#metadata(material.at("_ee_print_id", default: ""))#material.summary.sl],
    [#material.summary.name],
    [#material.summary.quarry],
    [#material.summary.conveyance_class],
    [#material.summary.lead_km],
    [#material.summary.lift_m],
    [*#material.summary.rate*],
    [#material.summary.uses]
  )).flatten()
)

== B. Detailed Lead Rate Calculations

#for material in Lead.breakdowns [
  #metadata(material.at("_ee_print_id", default: ""))
  #heading(level: 3)[#material.sl. #material.name (#material.lead_km)]

  #emph[Route: #material.route]

  #table(
    columns: (1fr, 32mm, 35mm),
    align: (left, center, right),
    stroke: 0.5pt + luma(200),
    fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
    table.header(
      [*Calculation Step / Slab*],
      [*Distance / Mode*],
      [*Amount (Rs)*]
    ),
    ..material.steps.map(calculation_step => (
      [#calculation_step.label],
      [#calculation_step.expression],
      [#metadata(calculation_step.at("_ee_print_id", default: ""))#calculation_step.amount]
    )).flatten(),
    ..(if material.calculation != none {
      (
        [*Material lead rate*], [#material.material_rate / #material.rate_unit], [*Rs. #material.material_rate*],
        ..(if material.calculation.loadingRate != 0 {
          ([Loading], [#material.loading_rate / #material.rate_unit], [Rs. #material.loading_rate])
        } else { () }),
        ..(if material.calculation.unloadingRate != 0 {
          ([Unloading], [#material.unloading_rate / #material.rate_unit], [Rs. #material.unloading_rate])
        } else { () }),
        ..(if material.calculation.liftRate != 0 {
          ([Lift (#material.lift_m m; chargeable #material.charged_lift_m m)], [#material.charged_lift_m × #material.lift_unit_rate], [Rs. #material.lift_rate])
        } else { () }),
        ..(if material.calculation.grossRate != material.calculation.leadRate {
          ([*With handling/lift*], [#material.rate / #material.rate_unit], [*Rs. #material.rate*])
        } else { () }),
      )
    } else { () }),
    [],
    [Adopted Rate per #material.rate_unit],
    [*Rs. #material.rate*]
  )
  #if material.calculation != none [
    #for note in material.calculation.notes [
      #text(size: 0.73em)[#note] #linebreak()
    ]
  ]
]

#if Lead.notes != "" [
  #heading(level: 2)[Notes / Remarks]

  #Lead.notes
]

#if Lead.signature.len() > 0 [
  #signature-footer(Lead.signature)
]

#if Lead.map.at("available", default: false) {
  pagebreak()
  // E-Estimate lead map page: begin
  set page(paper: "a4", flipped: true, margin: (top: 15mm, right: 12mm, bottom: 15mm, left: 12mm))
  [
    #block(width: 100%)[
      #text(size: 1.25em, weight: "bold", fill: rgb("#18201d"))[Lead Route Map]
      #v(8pt)
      #line(length: 100%, stroke: 1.5pt + rgb("#354b44"))
    ]
    #v(10pt)
    #align(center)[
      #box(
        width: 186mm,
        height: 140mm,
        stroke: 0.8pt + rgb("#9fb1c0"),
        radius: 3pt,
        clip: true
      )[#image("images/lead-route-map.png", width: 186mm, height: 140mm, fit: "cover")]
    ]
  ]
  // E-Estimate lead map page: end
}
