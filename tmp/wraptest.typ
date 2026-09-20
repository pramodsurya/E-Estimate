#let EE_SETUP = (paper: "a4", flipped: false, marginTop: 20.0, marginRight: 15.0, marginBottom: 20.0, marginLeft: 25.0, fontSizePt: 9.5, fontFamily: ("Calibri","Arial"))
#set page(
  paper: EE_SETUP.paper,
  flipped: EE_SETUP.flipped,
  margin: (
    top: EE_SETUP.marginTop * 1mm,
    right: EE_SETUP.marginRight * 1mm,
    bottom: EE_SETUP.marginBottom * 1mm,
    left: EE_SETUP.marginLeft * 1mm,
  )
)
#set text(font: EE_SETUP.fontFamily, size: EE_SETUP.fontSizePt * 1pt)
Hello
