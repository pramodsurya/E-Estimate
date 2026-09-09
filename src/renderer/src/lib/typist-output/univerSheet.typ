// Pure Typst Univer Spreadsheet Renderer
// Decodes an IWorkbookData snapshot and produces a native Typst #table()

#let resolve-style(cell, styles) = {
  if cell == none or "s" not in cell or cell.s == none { return none }
  if type(cell.s) == str or type(cell.s) == int {
    return styles.at(str(cell.s), default: none)
  }
  return cell.s
}

#let parse-color(c) = {
  if c == none { return none }
  let hex = if type(c) == dictionary and "rgb" in c { c.rgb } else { c }
  if hex == none { return none }
  let s = str(hex).trim()
  if s.starts-with("#") and s.len() == 7 { rgb(s) }
  else if s.starts-with("#") and s.len() == 9 { rgb(s.slice(0, 7)) }
  else if s.len() == 6 { rgb("#" + s) }
  else { none }
}

#let decode-border-side(b) = {
  if b == none or "s" not in b or b.s == 0 { return none }
  let color = parse-color(b.at("cl", default: none))
  if color == none { color = rgb("#000000") }
  let width = if b.s in (1, 2, 3) { 0.5pt }
              else if b.s in (8, 9, 10, 11, 12) { 1pt }
              else if b.s in (7, 13) { 1.5pt }
              else { 0.5pt }
  return width + color
}

#let extract-cell-text(cell) = {
  if cell == none { return "" }
  if "p" in cell and cell.p != none and "body" in cell.p and cell.p.body != none {
    let stream = cell.p.body.at("dataStream", default: "")
    return stream.replace("\r\n", "\n").replace("\r", "\n").trim()
  }
  if "v" in cell and cell.v != none {
    return str(cell.v)
  }
  return ""
}

// Formats cell text and enables character-level breaking for long tokens when wrapping is on
#let format-cell-text(raw-text, is-wrapped: true) = {
  if raw-text == "" { return "" }
  if is-wrapped {
    raw-text.split("\n").map(line => {
      line.split(" ").map(w => {
        if w.clusters().len() > 12 {
          w.clusters().join(sym.zws)
        } else {
          w
        }
      }).join(" ")
    }).join("\n")
  } else {
    raw-text
  }
}

#let render-univer-sheet(
  data-source,
  sheet-index: 0,
  show-gridlines: true,
  repeat-header-rows: 0,
  range-override: none,
  images: none
) = {
  if data-source == none {
    return align(center)[#text(fill: luma(120))[No Spreadsheet Data]]
  }
  let wb = if type(data-source) == str { json.decode(data-source) } else { data-source }
  if "sheets" not in wb or wb.sheets.len() == 0 {
    return align(center)[#text(fill: luma(120))[Empty Workbook]]
  }

  let styles = wb.at("styles", default: (:))
  let sheet-order = wb.at("sheetOrder", default: ())
  let sheet-id = if sheet-order.len() > sheet-index { sheet-order.at(sheet-index) } else { wb.sheets.keys().first() }
  let sheet = wb.sheets.at(sheet-id)

  let cell-data = sheet.at("cellData", default: (:))
  let merge-data = sheet.at("mergeData", default: ())
  let default-w = sheet.at("defaultColumnWidth", default: 88)
  let col-data = sheet.at("columnData", default: (:))
  let row-data = sheet.at("rowData", default: (:))

  let repeat-rows = if type(repeat-header-rows) == str { int(repeat-header-rows) } else if type(repeat-header-rows) == int { repeat-header-rows } else { 0 }

  // Determine bounds (Used Range or Range Override)
  let min-r = 0
  let min-c = 0
  let max-r = -1
  let max-c = -1

  if range-override != none {
    if type(range-override) == array {
      if range-override.len() >= 4 {
        min-r = int(range-override.at(0))
        min-c = int(range-override.at(1))
        max-r = int(range-override.at(2))
        max-c = int(range-override.at(3))
      }
    } else if type(range-override) == dictionary {
      min-r = int(range-override.at("startRow", default: 0))
      min-c = int(range-override.at("startColumn", default: 0))
      max-r = int(range-override.at("endRow", default: 0))
      max-c = int(range-override.at("endColumn", default: 0))
    }
  } else {
    for (r-str, cols) in cell-data {
      let r = int(r-str)
      if type(cols) == dictionary {
        for (c-str, cell) in cols {
          let c = int(c-str)
          let txt = extract-cell-text(cell)
          if txt != "" or ("s" in cell and cell.s != none) {
            if r > max-r { max-r = r }
            if c > max-c { max-c = c }
          }
        }
      }
    }
    for m in merge-data {
      if m.startRow <= max-r or m.startColumn <= max-c {
        if m.endRow > max-r { max-r = m.endRow }
        if m.endColumn > max-c { max-c = m.endColumn }
      }
    }
  }

  if max-r < 0 or max-c < 0 {
    return align(center)[#text(fill: luma(120))[Empty Sheet]]
  }

  // Column widths
  let col-widths = ()
  for c in range(min-c, max-c + 1) {
    let is-hidden = if str(c) in col-data { col-data.at(str(c)).at("hd", default: 0) == 1 } else { false }
    if not is-hidden {
      let w = if str(c) in col-data { col-data.at(str(c)).at("w", default: default-w) } else { default-w }
      col-widths.push(w * 0.75pt)
    }
  }

  // Merges mapping
  let merges = (:)
  let skip-cells = (:)
  for m in merge-data {
    if m.startRow > max-r or m.startColumn > max-c or m.endRow < min-r or m.endColumn < min-c {
      continue
    }
    let eff-start-r = calc.max(m.startRow, min-r)
    let eff-start-c = calc.max(m.startColumn, min-c)
    let eff-end-r = calc.min(m.endRow, max-r)
    let eff-end-c = calc.min(m.endColumn, max-c)

    let key = str(eff-start-r) + ":" + str(eff-start-c)
    merges.insert(key, (
      colspan: eff-end-c - eff-start-c + 1,
      rowspan: eff-end-r - eff-start-r + 1
    ))
    for r in range(eff-start-r, eff-end-r + 1) {
      for c in range(eff-start-c, eff-end-c + 1) {
        if r != eff-start-r or c != eff-start-c {
          skip-cells.insert(str(r) + ":" + str(c), true)
        }
      }
    }
  }

  // Render cells
  let header-cells = ()
  let body-cells = ()

  for r in range(min-r, max-r + 1) {
    let row-hidden = if str(r) in row-data { row-data.at(str(r)).at("hd", default: 0) == 1 } else { false }
    if row-hidden { continue }

    for c in range(min-c, max-c + 1) {
      let key = str(r) + ":" + str(c)
      if key in skip-cells { continue }

      let cell = if str(r) in cell-data and str(c) in cell-data.at(str(r)) {
        cell-data.at(str(r)).at(str(c))
      } else {
        none
      }
      let st = resolve-style(cell, styles)
      let raw-text = extract-cell-text(cell)

      // Text properties (STYLE_KEYS)
      let font-weight = if st != none and st.at("bl", default: 0) == 1 { "bold" } else { "regular" }
      let font-style = if st != none and st.at("it", default: 0) == 1 { "italic" } else { "normal" }
      let font-size = if st != none and "fs" in st and st.fs != none and st.fs > 0 { st.fs * 1pt } else { 8.5pt }
      let font-family = if st != none and "ff" in st and st.ff != none { (st.ff, "Arial") } else { ("Arial",) }
      let text-color = if st != none and "cl" in st { parse-color(st.cl) } else { rgb("#111111") }
      if text-color == none { text-color = rgb("#111111") }

      // Wrap strategy (tb: 1 Overflow, 2 Clip, 3 Wrap)
      // Default to wrapping if tb is unspecified or tb == 3
      let is-wrapped = if st != none and "tb" in st and st.tb != none { st.tb == 3 } else { true }
      let display-text = format-cell-text(raw-text, is-wrapped: is-wrapped)

      let formatted-text = text(
        font: font-family,
        size: font-size,
        weight: font-weight,
        style: font-style,
        fill: text-color,
        display-text
      )
      // Underline (ul) & Bottom border line (bbl)
      if st != none and (("ul" in st and st.ul != none and st.ul != 0) or ("bbl" in st and st.bbl != none and st.bbl != 0)) {
        formatted-text = underline(formatted-text)
      }
      // Strikethrough (st)
      if st != none and "st" in st and st.st != none and st.st != 0 {
        formatted-text = strike(formatted-text)
      }
      // Overline (ol)
      if st != none and "ol" in st and st.ol != none and st.ol != 0 {
        formatted-text = overline(formatted-text)
      }
      // Baseline offset: Subscript (va: 2) or Superscript (va: 3)
      if st != none and "va" in st and st.va != none {
        if st.va == 2 { formatted-text = sub(formatted-text) }
        else if st.va == 3 { formatted-text = super(formatted-text) }
      }
      // Text rotation (tr: { a: angle })
      if st != none and "tr" in st and st.tr != none and "a" in st.tr and st.tr.a != 0 {
        formatted-text = rotate(st.tr.a * 1deg, formatted-text)
      }

      // Alignments
      let h-align = if st != none and "ht" in st {
        if st.ht == 2 { center } else if st.ht == 3 { right } else { left }
      } else { left }
      let v-align = if st != none and "vt" in st {
        if st.vt == 2 { horizon } else if st.vt == 3 { bottom } else { top }
      } else { horizon }

      let cell-content = align(h-align + v-align, [#if cell != none { metadata(cell.at("_ee_print_id", default: "")) }#formatted-text])

      // Spans & Fill
      let m = merges.at(key, default: none)
      let colspan = if m != none { m.colspan } else { 1 }
      let rowspan = if m != none { m.rowspan } else { 1 }
      let bg = if st != none and "bg" in st { parse-color(st.bg) } else { none }

      // Borders
      let strokes = (:)
      if st != none and "bd" in st and st.bd != none {
        let bd = st.bd
        if "t" in bd { strokes.insert("top", decode-border-side(bd.t)) }
        if "r" in bd { strokes.insert("right", decode-border-side(bd.r)) }
        if "b" in bd { strokes.insert("bottom", decode-border-side(bd.b)) }
        if "l" in bd { strokes.insert("left", decode-border-side(bd.l)) }
      }
      let cell-stroke = if strokes.len() > 0 { strokes }
                        else if show-gridlines { 0.5pt + rgb("#d0d0d0") }
                        else { none }

      // Padding (pd)
      let cell-inset = if st != none and "pd" in st and st.pd != none {
        (
          top: st.pd.at("t", default: 3) * 0.75pt,
          bottom: st.pd.at("b", default: 3) * 0.75pt,
          left: st.pd.at("l", default: 4) * 0.75pt,
          right: st.pd.at("r", default: 4) * 0.75pt
        )
      } else {
        (x: 4pt, y: 3pt)
      }

      let final-cell = table.cell(
        colspan: colspan,
        rowspan: rowspan,
        fill: bg,
        stroke: cell-stroke,
        inset: cell-inset,
        cell-content
      )

      if (r - min-r) < repeat-rows {
        header-cells.push(final-cell)
      } else {
        body-cells.push(final-cell)
      }
    }
  }

  // Generate Table
  let table-element = if repeat-rows > 0 and header-cells.len() > 0 {
    table(
      columns: col-widths,
      table.header(repeat: true, ..header-cells),
      ..body-cells
    )
  } else {
    table(
      columns: col-widths,
      ..body-cells
    )
  }

  let overlay-images = if images != none and images.len() > 0 {
    for img in images [
      #let dx = if "relLeftPx" in img { img.relLeftPx } else { img.left }
      #let dy = if "relTopPx" in img { img.relTopPx } else { img.top }
      #let img-path = img.at("path", default: "")
      #if img-path != "" and img-path != none [
        #place(
          top + left,
          dx: dx * 0.75pt,
          dy: dy * 0.75pt,
          image(img-path, width: img.width * 0.75pt, height: img.height * 0.75pt)
        )
      ]
    ]
  } else { () }

  block[
    #table-element
    #overlay-images
  ]
}
