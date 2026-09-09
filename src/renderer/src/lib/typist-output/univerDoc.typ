#metadata("ee-print-audit:v1")
// Pure Typst Univer Document Renderer
// Consumes parsed IDocumentData and renders native Typst paragraphs, runs, and images.

#let render-univer-doc(data-source) = {
  if data-source == none {
    return align(center)[#text(fill: luma(120))[No Document Data]]
  }

  let doc = if type(data-source) == str { json.decode(data-source) } else { data-source }
  let paras = doc.at("paragraphs", default: ())
  let floats = doc.at("floatingImages", default: ())

  if paras.len() == 0 and floats.len() == 0 {
    return align(center)[#text(fill: luma(120))[Empty Document]]
  }

  // Render floating drawings placed freely over the document
  for fl in floats {
    place(
      top + left,
      dx: fl.leftPt * 1pt,
      dy: fl.topPt * 1pt,
      image(fl.path, width: fl.widthPt * 1pt, height: fl.heightPt * 1pt)
    )
  }

  // Render paragraphs with alignments, rich text styling, and inline images
  for p in paras {
    metadata(p.at("_ee_print_id", default: ""))
    if p.at("pageBreakBefore", default: false) { pagebreak() }
    if p.at("table", default: none) != none {
      let tbl = p.table
      let cells = ()
      for row in tbl.at("rows", default: ()) {
        for cell in row.at("cells", default: ()) {
          let bg = cell.at("backgroundHex", default: none)
          let fill-color = if bg != none and bg.starts-with("#") { rgb(bg) } else { none }
          cells.push(table.cell(
            colspan: cell.at("colSpan", default: 1),
            rowspan: cell.at("rowSpan", default: 1),
            fill: fill-color,
            [#cell.at("text", default: "")]
          ))
        }
      }
      let table-align = if tbl.at("align", default: "left") == "center" { center }
        else if tbl.at("align", default: "left") == "right" { right }
        else { left }
      align(table-align)[
        #table(
          columns: tbl.at("columnsPt", default: (72,)).map(width => width * 1pt),
          stroke: 0.5pt + luma(150),
          inset: 4pt,
          ..cells
        )
      ]
      continue
    }
    let a = p.at("align", default: "left")
    let p-align = left
    if a == "center" { p-align = center }
    else if a == "right" { p-align = right }
    else if a == "justify" { p-align = left }

    let sa = p.at("spaceAbovePt", default: 0)
    if sa > 0 { v(sa * 1pt) }

    let runs = p.at("runs", default: ())
    let indent-start = p.at("indentStartPt", default: 0)
    let indent-end = p.at("indentEndPt", default: 0)
    let first-indent = p.at("firstLineIndentPt", default: 0)
    let hanging = p.at("hangingPt", default: 0)
    let marker = p.at("listMarker", default: none)
    let spacing = p.at("lineSpacing", default: 1)
    let is-blank = p.at("isBlank", default: false)
    let paragraph-content = [
      #for r in runs {
        if r.at("tab", default: false) {
          h(r.at("tabWidthPt", default: 36) * 1pt)
        } else if "inlineImage" in r and r.inlineImage != none {
          let img = r.inlineImage
          image(img.path, width: img.widthPt * 1pt, height: img.heightPt * 1pt)
        } else {
          let t = r.at("text", default: "")
          if t != "" {
            let c = [#t]
            if r.at("bold", default: false) { c = strong(c) }
            if r.at("italic", default: false) { c = emph(c) }
            if r.at("underline", default: false) { c = underline(c) }
            if r.at("strike", default: false) { c = strike(c) }
            if r.at("overline", default: false) { c = overline(c) }
            if r.at("baseline", default: none) == "superscript" { c = super(c) }
            if r.at("baseline", default: none) == "subscript" { c = sub(c) }
            if r.at("linkUrl", default: none) != none { c = link(r.linkUrl, c) }

            let txt-args = (:)
            if "sizePt" in r and r.sizePt != none {
              txt-args.insert("size", r.sizePt * 1pt)
            }
            if "colorHex" in r and r.colorHex != none {
              let col = r.colorHex
              if col.starts-with("#") and (col.len() == 7 or col.len() == 4) {
                txt-args.insert("fill", rgb(col))
              }
            }
            if "backgroundHex" in r and r.backgroundHex != none {
              let bg = r.backgroundHex
              if bg.starts-with("#") and (bg.len() == 7 or bg.len() == 4) {
                txt-args.insert("fill", txt-args.at("fill", default: black))
                c = highlight(c, fill: rgb(bg))
              }
            }
            if "fontFamily" in r and r.fontFamily != none and r.fontFamily != "" {
              txt-args.insert("font", r.fontFamily)
            }
            if "letterSpacingPt" in r and r.letterSpacingPt != none {
              txt-args.insert("tracking", r.letterSpacingPt * 1pt)
            }

            if txt-args.len() > 0 {
              text(..txt-args)[#c]
            } else {
              c
            }
          }
        }
      }
    ]

    // List items with markers always align left (numbers sit on the left margin),
    // even when the paragraph style is centered or justified.
    let item-align = if marker != none { left } else { p-align }
    align(item-align)[
      #pad(left: indent-start * 1pt, right: indent-end * 1pt)[
        #set par(
          leading: calc.max(0pt, (spacing - 1) * 1em),
          first-line-indent: if marker != none { 0pt } else { (first-indent - hanging) * 1pt },
          justify: p.at("justify", default: false)
        )
        #let laid-out = if is-blank {
          box(height: calc.max(1em, spacing * 1em))
        } else if marker != none {
          // Fixed marker column: Univer's hanging indent is the distance from the
          // number to the content column. Sharing one width across all items keeps
          // every number aligned on the same left edge and every content column
          // starting at the same position. 24pt fallback for missing hanging values.
          let marker-width = if hanging > 0 { hanging * 1pt } else { 24pt }
          grid(
            columns: (marker-width, 1fr),
            column-gutter: 6pt,
            align: (left + top, left + top),
            [#marker],
            [#paragraph-content]
          )
        } else {
          paragraph-content
        }
        #let bg = p.at("backgroundHex", default: none)
        #let fill-color = if bg != none and bg.starts-with("#") and (bg.len() == 7 or bg.len() == 4) {
          rgb(bg)
        } else {
          none
        }
        #block(
          width: 100%,
          breakable: not p.at("keepTogether", default: false),
          fill: fill-color,
          inset: 0pt
        )[#laid-out]
      ]
    ]

    let sb = p.at("spaceBelowPt", default: 0)
    if sb > 0 { v(sb * 1pt) }
  }
}
