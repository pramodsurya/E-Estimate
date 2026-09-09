#metadata("ee-print-audit:v1")
// DEFAULT DATA / RATE-ANALYSIS DESIGN
// This is the complete editable layout, not generated code. Redesign any heading,
// colour, column or section below. Keep loops so newly added rows print automatically.
// Runtime JSON arrives via sys.inputs["ee-data"]. JSON strings are text, never code.
// DataBook.project, year: strings. DataBook.sor: published SOR item records.
// DataBook.recipes: rate analyses. Each RateAnalysis contains:
//   code, unit, description, section_heading, document_title: strings;
//   materials, machinery, labour: arrays of {sl, description, unit, quantity,
//     rate, amount, qty_text, rate_text, amount_text}; numbers + formatted strings;
//   leads: {material, distance_km, quantity, unit, rate, amount, qty_text,
//     rate_text, amount_text}; distance_km can be none;
//   totals: numeric material_total, labour_total, machinery_total, base_cost, overhead_percent,
//     overhead_amount, area_allowance_percent, area_allowance_amount, labour_unit_base, labour_unit_profit,
//     labour_unit_total, lead_total, total_cost, rate_per_unit, output_quantity;
//   display: the same totals formatted for printing; area_allowance_label: text.
// Optional arrays default to (). Guard optional fields with .at(..., default: ...).
// Empty sections disappear through the if conditions IN THIS SCRIPT.
// Keep page/font settings literal for the two-way Document Settings panel.

// E-Estimate document settings: begin
#set page(paper: "a4", flipped: false, margin: (top: 16mm, right: 14mm, bottom: 16mm, left: 14mm))
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
// E-Estimate document settings: end

#let DataBook = json(bytes(sys.inputs.at("ee-data")))
#set document(title: "Rate Analysis — DATA Book", author: "E-Estimate")
#show heading.where(level: 1): set text(size: 1.18em, fill: rgb("#0b3d5c"))
#show heading.where(level: 2): set text(size: 0.95em, fill: rgb("#087e8b"))

#let edit-red = rgb("#b42318")
#let render-runs(runs) = {
  for run in runs {
    let body = run.text
    if run.at("bold", default: false) { body = strong(body) }
    if run.at("italic", default: false) { body = emph(body) }
    if run.at("underline", default: false) { body = underline(body) }
    body
  }
}
#let edited-cell(body, edited: false, user-added: false) = if edited or user-added {
  underline(text(fill: edit-red, weight: "bold", body))
} else { body }

#let signature = DataBook.at("signature", default: (:))
#let signature-rows = signature.at("rows", default: ())
#let signature-block() = if signature-rows.len() > 0 {
  block(width: 100%, breakable: false)[
    #line(length: 100%, stroke: 0.65pt + rgb("#6f7d85"))
    #v(3mm)
    #grid(columns: (1fr,) * signature-rows.len(), gutter: 10mm, align: center,
      ..signature-rows.map(row => [
        #v(10mm)
        #line(length: 82%, stroke: 0.7pt + rgb("#273b47"))
        #v(2mm)
        #text(size: 9pt, weight: "bold", fill: rgb("#172f3d"))[#row.designation]
        #if row.office != "" [#linebreak() #text(size: 8pt, fill: rgb("#596a73"))[#row.office]]
      ]))
  ]
}
#if signature.at("placement", default: "subject_end") == "every_page" and signature-rows.len() > 0 {
  set page(footer: context {
    grid(
      rows: (auto, auto),
      row-gutter: 4pt,
      signature-block(),
      align(center)[#text(size: 8pt, fill: luma(90))[
        Page #counter(page).display("1 of 1", both: true)
      ]]
    )
  })
}

= RATE ANALYSIS (DATA BOOK)
#if DataBook.at("project", default: "") != "" [#align(center)[#DataBook.project]]
#if DataBook.at("year", default: "") != "" [#align(center)[Standard Schedule of Rates: #DataBook.year]]

// Shared row layout is visible here so an AI can freely redesign it.
#let cost-table(cost_rows, subtotal) = table(
  columns: (12mm, 1fr, 16mm, 20mm, 24mm, 28mm),
  align: (center, left, center, right, right, right),
  stroke: 0.5pt + luma(190),
  fill: (_, row) => if row == 0 { rgb("#e8eff2") } else { none },
  table.header(repeat: true, [*Sl No*], [*Description*], [*Unit*], [*Quantity*], [*Rate (Rs)*], [*Amount (Rs)*]),
  ..cost_rows.map(cost_row => (
    [#edited-cell(cost_row.sl, edited: cost_row.edited.sl_no, user-added: cost_row.user_added)],
    [#edited-cell(cost_row.description, edited: cost_row.edited.description, user-added: cost_row.user_added)],
    [#edited-cell(cost_row.unit, edited: cost_row.edited.unit, user-added: cost_row.user_added)],
    [#metadata(cost_row.at("_ee_print_id", default: ""))#edited-cell(cost_row.qty_text, edited: cost_row.edited.quantity, user-added: cost_row.user_added)],
    [#edited-cell(cost_row.rate_text, edited: cost_row.edited.rate, user-added: cost_row.user_added)],
    [#edited-cell(cost_row.amount_text, edited: cost_row.edited.amount, user-added: cost_row.user_added)]
  )).flatten(),
  table.cell(colspan: 5)[*Subtotal*], [*Rs. #subtotal*]
)

#if DataBook.at("sor", default: ()).len() > 0 [
  == SCHEDULE OF RATES
  #table(
    columns: (10mm, 1fr, 20mm, 35mm),
    align: (center, left, center, right),
    stroke: 0.5pt + luma(190),
    table.header(repeat: true, [*Sl No*], [*Description of Item*], [*Unit*], [*Published Rate*]),
    ..DataBook.sor.map(sor_item => ([#metadata(sor_item.at("_ee_print_id", default: ""))#sor_item.sl], [#sor_item.description], [#sor_item.unit], [#sor_item.rate_text])).flatten()
  )
]

#for RateAnalysis in DataBook.at("recipes", default: ()) [
  #metadata(RateAnalysis.at("_ee_print_id", default: ""))
  #let visible = RateAnalysis.at("visibility", default: (:))
  #if visible.at("code", default: true) [#text(weight: "bold")[#RateAnalysis.code] #linebreak()]
  #if RateAnalysis.document_title != "" [*#RateAnalysis.document_title* #linebreak()]
  #if RateAnalysis.section_heading != "" [#RateAnalysis.section_heading #linebreak()]
  #if visible.at("description", default: true) [#render-runs(RateAnalysis.at("description_runs", default: ())) #linebreak()]
  #if visible.at("unit_quantity", default: true) [*Output quantity:* #RateAnalysis.display.output_quantity #RateAnalysis.unit]

  #if RateAnalysis.published_blocks.len() > 1 [
    #block(fill: rgb("#f3f7f9"), stroke: 0.5pt + rgb("#9dc7d8"), inset: 6pt, width: 100%)[
      *Published quantity / rate bases*
      #grid(
        columns: (1fr,) * calc.min(3, RateAnalysis.published_blocks.len()), gutter: 6pt,
        ..RateAnalysis.published_blocks.map(block-data => block(
          fill: if block-data.adopted { rgb("#cfefeb") } else { white },
          stroke: 0.5pt + rgb("#9dc7d8"), inset: 5pt
        )[
          *#block-data.label* #if block-data.adopted [#linebreak() #text(size: 0.72em, fill: rgb("#087e8b"))[#block-data.adopted_label]]
          #linebreak() #block-data.quantity_text #block-data.unit
          #if block-data.cost_text != "" [#linebreak() Cost Rs. #block-data.cost_text]
          #linebreak() *Rate Rs. #block-data.rate_text / #block-data.unit*
        ])
      )
      #if RateAnalysis.multi_rate_note != none [#linebreak() #text(size: 0.78em)[#RateAnalysis.multi_rate_note.note]]
    ]
  ] else if RateAnalysis.multi_rate_note != none [
    #block(fill: rgb("#fff7dd"), inset: 6pt, width: 100%)[
      *#RateAnalysis.multi_rate_note.label:* #RateAnalysis.multi_rate_note.note Adopted rate Rs. #RateAnalysis.multi_rate_note.adopted_rate_text.
    ]
  ]

  #for figure-data in RateAnalysis.at("figures", default: ()) [
    #figure(image(figure-data.path, width: 100%), caption: figure-data.caption)
  ]

  #if visible.at("materials", default: true) and RateAnalysis.materials.len() > 0 [
    == A. MATERIALS
    #cost-table(RateAnalysis.materials, RateAnalysis.display.material_total)
  ]
  #if visible.at("machinery", default: true) and RateAnalysis.machinery.len() > 0 [
    == B. MACHINERY
    #cost-table(RateAnalysis.machinery, RateAnalysis.display.machinery_total)
  ]
  #if visible.at("labour", default: true) and RateAnalysis.labour.len() > 0 [
    == C. LABOUR
    #cost-table(RateAnalysis.labour, RateAnalysis.display.labour_total)
    #if visible.at("labour_summary", default: true) [
      #if RateAnalysis.labour_summary_rows.len() > 0 [
        #table(
          columns: (1fr, 24mm, 35mm, 32mm), align: (left, right, right, right), stroke: none,
          ..RateAnalysis.labour_summary_rows.map(row => (
            [#if row.kind == "final" [*#row.label*] else [#row.label]],
            [#row.percent], [#row.qualifier],
            [#if row.kind == "final" or row.kind == "total" [*#row.amount*] else [#row.amount]]
          )).flatten()
        )
      ] else [
        #table(
          columns: (1fr, 30mm), align: (left, right), stroke: none,
          [Labour component per unit], [#RateAnalysis.display.labour_unit_base],
          [Contractor's profit and overheads (#RateAnalysis.totals.overhead_percent%)], [#RateAnalysis.display.labour_unit_profit],
          [*Labour component including profit*], [*#RateAnalysis.display.labour_unit_total*]
        )
      ]
    ]
  ]

  #if visible.at("abstract", default: true) [
  == ABSTRACT
  #if RateAnalysis.abstract_rows.len() > 0 [
    #table(
      columns: (1fr, 30mm, 24mm, 12mm, 34mm), align: (left, right, center, center, right),
      stroke: 0.5pt + rgb("#c7dce5"),
      fill: (_, row) => if calc.odd(row) { rgb("#edf8f6") } else { none },
      ..RateAnalysis.abstract_rows.map(row => (
        table.cell(colspan: if row.basis == "" and row.qualifier == "" { 3 } else { 1 })[
          #if row.is_rate or row.is_total [*#row.label*] else [#row.label]
        ],
        ..(if row.basis == "" and row.qualifier == "" { () } else { ([#row.basis], [#row.qualifier]) }),
        [#if row.amount != "" [Rs:]],
        [#if row.is_rate or row.is_total_cost or row.is_total [*#row.amount*] else [#row.amount]]
      )).flatten()
    )
    #if RateAnalysis.dual_measurement != none [
      #block(fill: rgb("#e7f4f8"), inset: 6pt, width: 100%)[*One total cost, expressed on both published measurement bases*]
      #table(
        columns: (1fr, 25mm, 22mm, 12mm, 34mm), align: (left, right, center, center, right), stroke: 0.5pt + rgb("#c7dce5"),
        ..RateAnalysis.dual_measurement.rows.map(row => (
          [Total cost for], [#row.quantity_text], [#row.unit], [Rs:], [*#row.cost_text*],
          [#if row.primary [*#row.label*] else [#row.label]], [], [], [Rs:], [*#row.rate_text*]
        )).flatten()
      )
    ]
  ] else [
    #table(
      columns: (1fr, 38mm), align: (left, right), stroke: 0.5pt + luma(190),
      [A. Cost of materials], [#RateAnalysis.display.material_total],
      [B. Hire charges of machinery], [#RateAnalysis.display.machinery_total],
      [C. Cost of labour], [#RateAnalysis.display.labour_total],
      [*Base cost*], [*#RateAnalysis.display.base_cost*],
      [Contractor's profit and overheads (#RateAnalysis.totals.overhead_percent%)], [#RateAnalysis.display.overhead_amount],
      ..(if RateAnalysis.totals.area_allowance_percent > 0 {
        ([Area allowance on labour (#RateAnalysis.area_allowance_label)], [#RateAnalysis.display.area_allowance_amount])
      } else { () }),
      [*Total cost*], [*Rs. #RateAnalysis.display.total_cost*],
      [*Rate per #RateAnalysis.unit*], [*Rs. #RateAnalysis.display.rate_per_unit*]
    )
  ]]

  #if RateAnalysis.leads.len() > 0 [
    == #if RateAnalysis.lead_summary.disposal_only [DISPOSAL LEAD] else [LEAD ADDITIONS]
    #table(
      columns: (1fr, 28mm, 28mm, 32mm), align: (left, right, right, right),
      stroke: 0.5pt + rgb("#9dc7d8"), fill: (_, row) => if row == 0 { rgb("#e7f4f8") } else { none },
      table.header(repeat: true, [*Material / basis*], [*Quantity*], [*Rate*], [*Amount*]),
      ..RateAnalysis.leads.map(lead_charge => (
        ..(if lead_charge.deduction != none { (
          table.cell(colspan: 2)[#lead_charge.deduction.label],
          [#text(font: "DejaVu Sans Mono", size: 0.82em)[Rs. #lead_charge.deduction.full_rate_text − Rs. #lead_charge.deduction.deducted_rate_text]],
          [*Rs. #lead_charge.deduction.net_rate_text/#lead_charge.deduction.unit*]
        ) } else { () }),
        [*#lead_charge.material* #linebreak() #text(size: 0.78em, fill: luma(90))[
          #lead_charge.quantity_source#if lead_charge.distance_km != none [ | #lead_charge.distance_km km]#if lead_charge.lift_m > 0 [, lift #lead_charge.lift_m m]
        ]],
        [#edited-cell([#metadata(lead_charge.at("_ee_print_id", default: ""))#lead_charge.qty_text #lead_charge.unit], edited: lead_charge.quantity_edited)],
        [Rs. #lead_charge.rate_text], [*Rs. #lead_charge.amount_text*],
        ..lead_charge.warnings.map(warning => (
          table.cell(colspan: 2)[#text(size: 0.75em, fill: edit-red)[#warning.message]],
          table.cell(colspan: 2)[#text(size: 0.75em, fill: edit-red)[#warning.detail]]
        )).flatten()
      )).flatten(),
      table.cell(colspan: 3)[Base final amount], [*Rs. #RateAnalysis.lead_summary.base_amount_text*],
      table.cell(colspan: 3)[#if RateAnalysis.lead_summary.disposal_only [Add Disposal Lead total] else [Add Lead/Lift total]], [*Rs. #RateAnalysis.lead_summary.lead_total_text*],
      table.cell(colspan: 3, fill: rgb("#cfefeb"))[*#if RateAnalysis.lead_summary.disposal_only [Final amount with Disposal Lead] else [Final amount with Lead]*],
      table.cell(fill: rgb("#cfefeb"))[*Rs. #RateAnalysis.lead_summary.final_amount_text*],
      table.cell(colspan: 3, fill: rgb("#cfefeb"))[*#if RateAnalysis.lead_summary.disposal_only [Rate per unit with Disposal Lead] else [Rate per unit with Lead]*],
      table.cell(fill: rgb("#cfefeb"))[*Rs. #RateAnalysis.lead_summary.final_rate_text*]
    )
  ]

  #let addon = RateAnalysis.at("optional_addition", default: none)
  #if addon != none [
    == SELECTED OPTIONAL ADDITION
    #block(fill: rgb("#e7f4f8"), inset: 7pt, width: 100%)[
      *#addon.label* #h(1fr) Calculated from #addon.output_quantity_text #addon.unit add-on DATA
    ]
    #for section in addon.sections [
      === #section.label
      #cost-table(section.rows, section.total_text)
    ]
    #if addon.labour_allowance_percent > 0 [Area allowance on add-on labour (#addon.labour_allowance_percent%): #h(1fr) *Rs. #addon.labour_allowance_text* #linebreak()]
    #if addon.overhead_percent > 0 [Contractor's profit and overheads (#addon.overhead_percent%): #h(1fr) *Rs. #addon.overhead_text* #linebreak()]
    #if addon.lead_rows.len() > 0 [
      === E. Add-on Lead after contractor's profit
      #table(
        columns: (1fr, 28mm, 28mm, 32mm), align: (left, right, right, right), stroke: 0.5pt + rgb("#9dc7d8"),
        ..addon.lead_rows.map(row => (
          [*#row.material* #linebreak() #text(size: 0.78em, fill: luma(90))[#row.quantity_source]],
          [#row.qty_text #row.unit], [Rs. #row.rate_text], [*Rs. #row.amount_text*]
        )).flatten(),
        table.cell(colspan: 3)[*Add-on Lead total*], [*Rs. #addon.lead_total_text*]
      )
    ]
    #table(
      columns: (1fr, 42mm), align: (left, right), stroke: 0.5pt + rgb("#9dc7d8"),
      [Total add-on cost#if addon.lead_rows.len() > 0 [ including Lead]], [*Rs. #addon.total_cost_text*],
      [Calculated base DATA rate], [*Rs. #addon.base_rate_text*],
      [Selected add-on rate#if addon.lead_rows.len() > 0 [ including Lead]], [*+ Rs. #addon.addon_rate_text*],
      table.cell(fill: rgb("#cfefeb"))[*Adopted rate*], table.cell(fill: rgb("#cfefeb"))[*Rs. #addon.adopted_rate_text / #RateAnalysis.unit*]
    )
    #if addon.lead_note != none [
      #if addon.lead_note.applicable [
        #text(size: 0.82em)[*Lead:* #addon.lead_note.material uses the common *#addon.lead_note.conveyance_class Lead schedule*. Quantity is #addon.lead_note.quantity_basis. #addon.lead_note.distance_note #addon.lead_note.handling_note]
      ] else [#text(size: 0.82em)[No separate Lead applies to this add-on#if addon.lead_note.note != "" [: #addon.lead_note.note].]]
    ]
    #if addon.seigniorage_note != none and addon.seigniorage_note.applicable [
      #text(size: 0.82em)[*Seigniorage:* activates automatically#if addon.seigniorage_note.codes != "" [ (#addon.seigniorage_note.codes)]. #if addon.seigniorage_note.blocked [The amount is blocked until an approved CUM-to-MT conversion factor is configured.] else [The applicable quantity and charge are calculated in Project Seigniorage.]]
    ]
  ]

  #let rate-variant = RateAnalysis.at("rate_variant", default: none)
  #if rate-variant != none [
    == SELECTED RATE VARIANT
    #block(fill: rgb("#e7f4f8"), inset: 7pt, width: 100%)[
      *#rate-variant.selected_label* #linebreak()
      #text(size: 0.8em)[Percentage adjustment over the calculated #rate-variant.base_label DATA]
    ]
    #table(
      columns: (1fr, 42mm), align: (left, right), stroke: 0.5pt + rgb("#9dc7d8"),
      [Calculated #rate-variant.base_label base rate], [*Rs. #rate-variant.base_rate_text*],
      [Add #rate-variant.percent% for #rate-variant.selected_label], [*+ Rs. #rate-variant.addition_text*],
      table.cell(fill: rgb("#cfefeb"))[*Adopted #rate-variant.selected_label rate*],
      table.cell(fill: rgb("#cfefeb"))[*Rs. #rate-variant.adopted_rate_text / #RateAnalysis.unit*]
    )
  ]
  #v(16pt)
]

#if signature.at("placement", default: "subject_end") == "subject_end" and signature-rows.len() > 0 [
  #block(width: 100%, height: 1fr, breakable: false)[#align(bottom)[#signature-block()]]
]
