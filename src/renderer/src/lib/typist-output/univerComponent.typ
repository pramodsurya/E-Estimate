#metadata("ee-print-audit:v1")
// Pure Typst Component Report Helpers
// Provides Abstract of Estimate and Child Item rendering for component reports.

#let render-component-abstract(abstract-rows, total: none, total-label: "Component Total") = {
  if abstract-rows == none or abstract-rows.len() == 0 {
    return text(fill: luma(120), italic: true)[No items in abstract.]
  }

  table(
    columns: (32pt, 1fr, 52pt, 42pt, 55pt, 75pt),
    align: (center + top, left + top, right + top, center + top, right + top, right + top),
    stroke: (x, y) => if y == 0 { (bottom: 1pt + luma(80)) } else { (bottom: 0.4pt + luma(190)) },
    fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else { none },
    inset: (x: 5pt, y: 5pt),
    table.header(
      [*Sl.*],
      [*Description of Item*],
      [*Quantity*],
      [*Unit*],
      [*Rate (₹)*],
      [*Amount (₹)*]
    ),
    ..abstract-rows.map(row => (
      [#row.at("sl", default: "")],
      [
        #text(weight: "bold", size: 1.02em, fill: rgb("#163f57"))[#row.at("heading", default: "")]
        #let subtext = row.at("description", default: "")
        #if subtext != "" and subtext != row.at("heading", default: "") [
          \ #v(2pt)
          #text(size: 0.90em, fill: rgb("#2a3b47"))[#render-markup(subtext)]
        ]
      ],
      [#metadata(row.at("_ee_print_id", default: ""))#row.at("qty", default: "—")],
      [#row.at("unit", default: "")],
      [#row.at("rate", default: "—")],
      [#text(weight: "bold")[#row.at("amount", default: "—")]]
    )).flatten(),
    // Grand Total Row
    ..(if total != none and total != "" {
      (
        table.cell(colspan: 5, align: right, stroke: (top: 1pt + luma(80), bottom: 1.5pt + luma(80)))[
          #text(weight: "bold", size: 0.86em)[#total-label:]
        ],
        table.cell(align: right, stroke: (top: 1pt + luma(80), bottom: 1.5pt + luma(80)))[
          #text(weight: "bold", size: 0.86em)[₹ #total]
        ]
      )
    } else {
      ()
    })
  )
}

#let render-component-item(item) = [
  #metadata(item.at("_ee_print_id", default: ""))
  // Heading: Code & Title on left, Unit on right
  #grid(
    columns: (1fr, auto),
    align: (left + bottom, right + bottom),
    [
      #text(1.09em, weight: "bold")[
        #let item-name = item.at("name", default: item.at("item", default: ""))
        #let item-code = item.at("code", default: "")
        #if item-code != "" and not item-name.starts-with(item-code) [#item-code — ]#item-name
      ]
    ],
    [
      #let unit-text = item.at("unit", default: "")
      #if unit-text != "" [#text(0.86em)[Unit: #unit-text]]
    ]
  )

  #let desc = item.at("description", default: "")
  #let item-name = item.at("name", default: item.at("item", default: ""))
  #if desc != "" and desc != item-name [
    #v(4pt)
    #text(0.95em)[#render-description(item)]
  ]

  #v(8pt)

  #let editor = item.at("editorType", default: "spreadsheet")
  #if editor == "document" [
    #render-univer-doc(item.at("document", default: (:)))
  ] else [
    #let print-cfg = item.at("printConfig", default: (:))
    #render-univer-sheet(
      item.at("univer", default: (:)),
      repeat-header-rows: print-cfg.at("repeatHeaderRows", default: 0),
      show-gridlines: print-cfg.at("showGridlines", default: true),
      range-override: print-cfg.at("range", default: none),
      images: item.at("images", default: none)
    )
  ]
]
