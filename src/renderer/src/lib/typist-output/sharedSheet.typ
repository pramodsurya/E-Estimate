// One printed page flow for a shared workbook. Item identities and quantities
// remain in BOQ; this page prints only the spreadsheet and its signatories.
#let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_PRINT = EE.at("printConfig", default: (:))

// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 11pt)
// E-Estimate document settings: end

#render-univer-sheet(
  EE.univer,
  repeat-header-rows: EE_PRINT.at("repeatHeaderRows", default: 0),
  show-gridlines: EE_PRINT.at("showGridlines", default: true),
  range-override: EE_PRINT.at("range", default: none),
  images: EE.at("images", default: none),
  column-scale: EE_PRINT.at("columnScale", default: 1)
)

#if EE.signature.len() > 0 [
  #signature-footer(EE.signature)
]
