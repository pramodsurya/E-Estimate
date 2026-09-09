// Compatibility helpers for existing saved designs. Not a default layout.
#let ee-group-cells(g, desc) = {
  let cells = ()
  let i = 0
  for r in g.rows {
    cells.push([#(i + 1)])
    cells.push([#r.description])
    cells.push([#r.total_qty])
    cells.push([#r.seigniorage_qty])
    cells.push([#r.rate])
    cells.push([#r.seigniorage])
    cells.push([#r.dmft])
    cells.push([#r.smft])
    cells.push(if r.permit_note.len() > 0 { [#r.permit_fee #linebreak() #text(size: 0.88em)[#r.permit_note]] } else { [#r.permit_fee] })
    i = i + 1
  }
  cells
}

// Signature rows share the same flat-cell + spread pattern: each row is one cell.
#let signature-cells(rows) = {
  let cells = ()
  for s in rows {
    cells.push([
      #text(weight: "bold")[#s.designation]
      #linebreak()
      #s.office
    ])
  }
  cells
}

#let ee-group-table(
  data,
  headers: ([Sl], [Description], [Total Qty], [Seigniorage Qty], [Rate], [Seigniorage], [DMFT 30%], [SMFT 2%], [Permit fee]),
  subtotal-label: [Subtotal]
) = {
  let group-list = if type(data) == array { data } else { (data,) }
  for (gi, g) in group-list.enumerate() [
    #show table.cell.where(y: 0): set text(fill: white, weight: "bold")
    #let heading-text = if "label" in g and g.label != "" { g.label } else { [] }
    #let sub-text = if "subtotal_label" in g and g.subtotal_label != "" { g.subtotal_label } else { [#subtotal-label — #heading-text] }
    #if heading-text != [] and heading-text != "" [
      #heading(level: 2)[#heading-text]
    ]
    #table(
      columns: (8mm, 1.7fr, 24mm, 34mm, 22mm, 25mm, 22mm, 22mm, 28mm),
      align: (center, left, right, left, right, right, right, right, right),
      stroke: 0.5pt + luma(190),
      fill: (col, row) => if row == 0 { rgb("#007791") } else if calc.even(row) { rgb("#f8fafc") } else { none },
      table.header(repeat: true, ..headers),
      ..ee-group-cells(g, ()),
      table.cell(colspan: 5, align: right, fill: rgb("#edf7f6"))[#text(weight: "bold")[#sub-text]],
      [#text(weight: "bold")[#g.subtotal.seigniorage]], [#text(weight: "bold")[#g.subtotal.dmft]], [#text(weight: "bold")[#g.subtotal.smft]], [#text(weight: "bold")[#g.subtotal.permit_fee]]
    )
  ]
}
