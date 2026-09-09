// E-Estimate DEFAULT ITEM DOCUMENT DESIGN — edit this file in Print Studio.
// The application passes JSON in sys.inputs["ee-data"]. Data is NOT Typst code.
// Keep the JSON binding and #render-univer-doc; customize headers, fonts, and styles.

#let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_SIGNATURE = EE.signature

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
#show heading.where(level: 1): set text(size: 1.18em)
#show heading.where(level: 2): set text(size: 0.95em)
#show heading.where(level: 3): set text(size: 0.91em)
// E-Estimate document settings: end

// Item heading: Title on left, Unit on right (matches standard engineering format)
#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  [
    #text(1.18em, weight: "bold")[
      #if EE.code != "" and not EE.item.starts-with(EE.code) [#EE.code — ]#EE.item
    ]
  ],
  [#if EE.unit != "" [#text(0.86em)[Unit: #EE.unit]]]
)

#if EE.description != "" and EE.description != EE.item [
  #v(4pt)
  #text(0.95em)[#render-description(EE)]
]

#v(8pt)

// The document body, rendered natively from the live Univer document
#render-univer-doc(EE.at("document", default: (:)))

#if (EE_SIGNATURE.len() > 0) [
  #signature-footer(EE_SIGNATURE)
]
