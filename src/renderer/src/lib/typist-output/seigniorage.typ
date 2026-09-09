#metadata("ee-print-audit:v1")
// E-Estimate document settings: begin
#set page(paper: "a4", flipped: true, margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 15mm))
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

// DATA: project, year, permit_basis (strings); summary (formatted totals);
// Seigniorage.material_groups: [{label, subtotal_label, rows, subtotal}], signature: [{designation, office}].
// Group rows: description, total_qty, seigniorage_qty, rate, seigniorage, dmft,
// smft, permit_fee, permit_note (formatted strings). Empty groups/signatures are ().

// All table helpers are visible and editable as part of this default design.
#let material-group-cells(material_group, desc) = {
  let cells = ()
  let row_index = 0
  for material_row in material_group.rows {
    cells.push([#(row_index + 1)])
    cells.push([#material_row.description])
    cells.push([#metadata(material_row.at("_ee_print_id", default: ""))#material_row.total_qty])
    cells.push([#material_row.seigniorage_qty])
    cells.push([#material_row.rate])
    cells.push([#material_row.seigniorage])
    cells.push([#material_row.dmft])
    cells.push([#material_row.smft])
    cells.push(if material_row.permit_note.len() > 0 { [#material_row.permit_fee #linebreak() #text(size: 0.88em)[#material_row.permit_note]] } else { [#material_row.permit_fee] })
    row_index = row_index + 1
  }
  cells
}

// Signature rows share the same flat-cell + spread pattern: each row is one cell.
#let signature-cells(rows) = {
  let cells = ()
  for signatory in rows {
    cells.push([
      #text(weight: "bold")[#signatory.designation]
      #linebreak()
      #signatory.office
    ])
  }
  cells
}

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

#let render-material-groups(
  data,
  headers: ([Sl], [Description], [Total Qty], [Seigniorage Qty], [Rate], [Seigniorage], [DMFT 30%], [SMFT 2%], [Permit fee]),
  subtotal-label: [Subtotal]
) = {
  let group-list = if type(data) == array { data } else { (data,) }
  for (group_index, material_group) in group-list.enumerate() [
    #show table.cell.where(y: 0): set text(fill: white, weight: "bold")
    #let heading-text = if "label" in material_group and material_group.label != "" { material_group.label } else { [] }
    #let sub-text = if "subtotal_label" in material_group and material_group.subtotal_label != "" { material_group.subtotal_label } else { [#subtotal-label — #heading-text] }
    #if heading-text != [] and heading-text != "" [
      #heading(level: 2)[#heading-text]
    ]
    #table(
      columns: (8mm, 1.7fr, 24mm, 34mm, 22mm, 25mm, 22mm, 22mm, 28mm),
      align: (center, left, right, left, right, right, right, right, right),
      stroke: 0.5pt + luma(190),
      fill: (col, row) => if row == 0 { rgb("#007791") } else if calc.even(row) { rgb("#f8fafc") } else { none },
      table.header(repeat: true, ..headers),
      ..material-group-cells(material_group, ()),
      table.cell(colspan: 5, align: right, fill: rgb("#edf7f6"))[#text(weight: "bold")[#sub-text]],
      [#text(weight: "bold")[#material_group.subtotal.seigniorage]], [#text(weight: "bold")[#material_group.subtotal.dmft]], [#text(weight: "bold")[#material_group.subtotal.smft]], [#text(weight: "bold")[#material_group.subtotal.permit_fee]]
    )
  ]
}


#let SeigniorageJson = sys.inputs.at("ee-data", default: "__SEIGNIORAGE_DATA_MISSING__")

#assert(
  SeigniorageJson != "__SEIGNIORAGE_DATA_MISSING__",
  message: "E-Estimate runtime input 'ee-data' was not supplied.",
)

#let Seigniorage = (material_groups: (), signature: (), year: "", permit_basis: "", summary: (seigniorage: "0.00", dmft: "0.00", smft: "0.00", permit_fee: "0.00", grand_total: "0.00", rounded_grand_total: "0.00"), ..json(bytes(SeigniorageJson)))

#show heading.where(level: 1): set text(size: 1.18em, weight: "bold", fill: rgb("#0b3d5c"))
#show heading.where(level: 1): it => align(center, it)
#show heading.where(level: 2): set text(size: 0.95em, weight: "bold", fill: rgb("#087e8b"))

= SEIGNIORAGE STATEMENT

#align(center)[Standard Schedule of Rates: #Seigniorage.year]

#grid(
  columns: 5,
  gutter: 5pt,
  [*Seigniorage* #linebreak() #Seigniorage.summary.seigniorage],
  [*DMFT 30%* #linebreak() #Seigniorage.summary.dmft],
  [*SMFT 2%* #linebreak() #Seigniorage.summary.smft],
  [*Permit fee* #linebreak() #Seigniorage.summary.permit_fee],
  [*Grand Total* #linebreak() #Seigniorage.summary.grand_total]
)

#if (Seigniorage.material_groups.len() == 0) [_No seigniorage rows are available._]

// Render all material groups as statutory tables. Headings, subtotals,
// and row descriptions are dynamically provided by runtime Seigniorage.material_groups.
#render-material-groups(
  Seigniorage.material_groups,
  headers: ([Sl], [Description], [Total Qty], [Seigniorage Qty], [Rate], [Seigniorage], [DMFT 30%], [SMFT 2%], [Permit fee]),
)

== Statement Total

#table(
  columns: (1fr, 38mm),
  align: (right, right),
  stroke: 0.5pt + luma(170),
  [Seigniorage Total], [#Seigniorage.summary.seigniorage],
  [DMFT 30%], [#Seigniorage.summary.dmft],
  [SMFT 2%], [#Seigniorage.summary.smft],
  [Permit fee], [#Seigniorage.summary.permit_fee],
  [#text(weight: "bold")[Grand Total]], [#text(weight: "bold")[#Seigniorage.summary.grand_total]],
  [#text(weight: "bold")[Rounded Grand Total]], [#text(weight: "bold")[#Seigniorage.summary.rounded_grand_total]]
)

#text(size: 0.88em, style: "italic")[Permit fee basis: #Seigniorage.permit_basis.]

#if (Seigniorage.signature.len() > 0) [
  #signature-footer(Seigniorage.signature)
]
