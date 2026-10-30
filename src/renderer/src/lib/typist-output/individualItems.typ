#let EE = json(bytes(sys.inputs.at("ee-individual-items", default: "{}")))
#set document(title: "Individual Items")
#set page(paper: "a4", margin: (top: 18mm, bottom: 18mm, left: 20mm, right: 15mm), numbering: "1")
#set text(font: ("Trebuchet MS", "Arial", "Liberation Sans"), size: 9pt, fill: rgb("#18384b"))
#let navy = rgb("#0b3d5c")
#let muted = rgb("#617383")
#text(17pt, weight: "bold", fill: navy)[Individual Items]
#v(3mm)
#text(11pt, weight: "bold")[#EE.project_name]
#h(1fr)
#text(fill: muted)[#EE.year · #EE.zone.replace("_", " ")]
#v(3mm)
#text(fill: muted)[Adopted resource rates used in the project DATA and its appendices.]
#v(5mm)
#for (kind, heading) in (("materials", "Materials"), ("machinery", "Machinery"), ("labour", "Labour")) {
  let rows = EE.individual_items.filter(row => row.kind == kind)
  if rows.len() > 0 {
    block(above: 4mm, below: 2mm)[#text(12pt, weight: "bold", fill: navy)[#heading]]
    table(
      columns: (7mm, 1fr, 15mm, 22mm, 42mm),
      inset: 5pt,
      align: (center, left, center, right, left),
      stroke: 0.4pt + rgb("#bccbd4"),
      table.header(repeat: true,
        ..("No", "Resource / source", "Unit", "Rate (Rs.)", "Used in DATA").map(label => table.cell(fill: navy)[#text(fill: white, weight: "bold")[#label]])
      ),
      ..rows.enumerate().map(((index, row)) => {
        let source-color = if row.owner == "MORTH" { rgb("#a95508") } else { rgb("#827014") }
        (
          [#metadata(row.at("_ee_print_id", default: ""))#(index + 1)],
          [*#row.description* #linebreak() #text(8pt, fill: source-color, weight: "bold")[#row.source_label] #if row.local { text(8pt, fill: muted)[ · Local DATA rate] } #if row.source != "" { linebreak(); text(7.5pt, fill: muted)[#row.source] }],
          [#row.unit], [#row.rate_text],
          [#text(7.5pt)[#row.usages.join("\n")]],
        )
      }).flatten()
    )
  }
}
#if EE.individual_items.len() == 0 { [No individual resources are used in this project.] }
