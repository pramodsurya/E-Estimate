// Pure Typst Univer Spreadsheet Renderer
// ee-sheet-rev: 15 (installed General alignment, installed display text
// verbatim via cell._ee, UTF-16 run slicing, measured natural-width
// no-wrap lines with width-stability detection, rotated-WRAP cell-height
// budget with explicit-row frame, installed border widths/dashes/DOUBLE,
// white-edge suppression and merged perimeters, wrap-then-rotate with
// frozen layout, full-width align container, composed styles, resolved
// geometry).
// Unspecified ht resolves like the installed renderer: vertical text
// centers, rotated-down rights, numbers right, booleans center. Number
// patterns render the TS-provided display text verbatim (conditions,
// section colors as upfront theme hex, dates, scientific, fractions,
// zero-padding, negative parentheses). Rich-run offsets slice by UTF-16
// code units.
// Generated sources carrying this marker prove which renderer built them —
// the app bundles this file at build time, so a rebuild plus restart is
// required before exports reflect source edits.
// Decodes an IWorkbookData snapshot and produces a native Typst #table()
//
// Faithful-mapping notes (mirrors worksheetTypst.ts / printRender.ts):
// - Skeleton: sheetOrder selects the sheet; a hidden sheet renders a
//   placeholder. tabColor/freeze are sheet chrome with no table equivalent
//   (freeze print-titles are covered by repeat-header-rows).
// - Positions: cellData matrix (r, c) 1:1; merged non-origins are skipped.
// - Values: v + t (1 string / 2 number / 3 boolean / 4 force-string) + f.
//   A live formula (f) wins over rich runs: the cached v is shown unstyled.
// - Rich text: p.body { dataStream, textRuns [st, ed, ts], paragraphs }.
//   Run offsets are UTF-16 units and Typst slices by the same units
//   (BMP codepoints one unit, astral two). Paragraph breaks survive via the
//   stream; bullets/indents have no Typst table equivalent and are not
//   rendered.
// - Displayed numbers: itemSheetCompileInputs attaches installed-Univer
//   display text (the same getPatternPreview call the runtime preview uses,
//   via univerDisplayText.ts) as cell._ee = { d: text, c?: hex }; the
//   renderer consumes both verbatim and never reformats or probes color
//   names here. Excel keeps the original v plus the verbatim pattern. The
//   Typst format-number-pattern below is fallback-only for cells without
//   _ee. Fallback subset: decimal grouping/decimals, percent scaling,
//   quoted literals, negative parentheses/sections, [conditions], section
//   colors (negatives only), date/time serials (1900 system;
//   locale/DBNum/elapsed tokens unsupported), scientific notation,
//   fractions, integer zero-pad, quote-aware section splits. Everything
//   else renders general str(v).
// - Section ink wins over an explicit font color, mirroring the installed
//   composition ({ ...style, ...interceptStyle } in getStyleByCell): _ee.c
//   is theme hex resolved upfront in TS, and the fallback probe below takes
//   the same precedence. Plain booleans (t: 3, no pattern) never carry _ee
//   — the installed interceptor skips them — so TRUE/FALSE stays explicit.
// - Fonts/deco: ff, fs, it/bl, ul/bbl, st, ol, va (1 normal / 2 sub / 3 super),
//   inline or by style id, else row/col s fallback, else workbook/sheet
//   defaultStyle. Decoration flags accept { s: 0/1 } objects or bare 0/1.
// - Colour: bg, cl, bd.cl via normRgb parity with worksheetTypst.ts
//   (#RRGGBB[AA] with trailing alpha dropped, bare hex, rgb(r,g,b));
//   indexed theme (th) colours resolve ONLY on installed getColorStyle paths
//   (sheet borders, document font); plain font, fills and gridlines read rgb
//   only, matching the canvas. gridlinesColor is sheet-only.
// - halign: explicit ht 1 left / 2 center / 3 right / 4 JUSTIFIED / 5 BOTH /
//   6 DISTRIBUTED (BOTH/DIST fall back to justified via par). Unspecified ht
//   follows the installed General rule: vertical text centers, rotated-down
//   rights, numbers right, booleans center, else left.
// - valign: vt 0/missing is bottom (Excel default); vt 1 top / 2 middle /
//   3 bottom; td 1 ltr / 2 rtl plus the sheet rightToLeft flag drive text
//   direction.
// - wrap: tb 3 WRAP lays a width-wrapped paragraph; tb 0/1 (unspecified /
//   OVERFLOW) freeze each logical line in one measured natural-width box
//   that extends past the cell edge; tb 2 CLIP lays the same boxes inside
//   a clipped box. Measured lines cannot split at spaces, CJK boundaries,
//   hyphens or style runs; only explicit newlines break (separate logical
//   lines). Rotated WRAP pre-lays at the installed cell-height budget
//   (page width = cell/span height minus document margins) before
//   rotating, breaking lines by installed greedy word-first wrapping
//   (whole words move down; only overlong words slice mid-word) rather
//   than Typst's optimal packing. Installed overflow spans columns only
//   (rows never spill);
//   unrotated vertical spill stays unrestricted (documented limitation).
// - rotation: tr { a degrees, v vertical }. Univer canvas-rotates laid-out
//   lines (v == 1 forces 90 degrees). Auto-height rows grow to the rotated
//   extent; explicit-h rows keep rh while rotated paint spills horizontally
//   (installed overflow rect spans columns, never rows) and cuts vertically,
//   CLIP cutting both axes at the cell. Excel carries the same mode as
//   rotation -90 (continuous string, never stacked 255).
// - sizes: row { h, ia, ah, hd, s } + defaultRowHeight; col { w, hd, s } +
//   defaultColumnWidth. Resolved per the row manager: (ia absent or 1) with a
//   numeric ah yields ah; else numeric h, including zero; else the default.
//   Multi-row merges enforce the sum
//   over spanned visible rows when every one is explicit.
// - hidden: hd on row/col/sheet omits them. Zero-sized rows/columns also do
//   not paint. Hidden columns are dropped from
//   the grid entirely (never emitted as empty cells) and merge spans count
//   visible rows/columns only, so neighbouring columns never shift.
// - borders: bd { t, r, b, l } full enum s 0 NONE, 1 THIN, 2 HAIR,
//   3 DOTTED, 4 DASHED, 5 DASH_DOT, 6 DASH_DOT_DOT, 7 DOUBLE, 8 MEDIUM,
//   9 MEDIUM_DASHED, 10 MEDIUM_DASH_DOT, 11 MEDIUM_DASH_DOT_DOT,
//   12 SLANT_DASH_DOT, 13 THICK. Widths 0.75/1.5/2.25pt per installed
//   1/2/3px; explicit dash arrays per installed setLineType; DOUBLE paints
//   the outer cell edge plus an inner overlay stroke; white top/left edges
//   drop against facing neighbor edges; merged perimeters read edge cells;
//   shared-edge conflicts resolve per Typst's table rule (probed).
//   Diagonal keys (tl_br, ...) have no Typst equivalent.
// - padding: pd px -> Typst inset.
// - merges: mergeData entries are type-validated and clipped to the range.
// - drawings: caller-resolved `images` (charts arrive as PNGs via
//   extractItemMedia/shadowFiles on the TS side) are placed as overlays.
// - print: used-cell range or EE_PRINT range-override, gridlines toggle,
//   repeat-header-rows. Page setup lives in the caller templates'
//   document-settings blocks, which this prelude never touches.

#let ee-as-int(x, fallback: 0) = {
  if type(x) == int { x }
  else if type(x) == float { int(x) }
  // Snapshot indices/keys often arrive as strings; accept canonical numerals.
  else if type(x) == str and x.match(regex("^-?\\d+$")) != none { int(x) }
  else { fallback }
}

#let ee-as-num(x, fallback: 0) = {
  if type(x) == int or type(x) == float { x }
  else { fallback }
}

// BooleanNumber (0/1), bare 0/1, booleans, and { s: ... } decoration objects.
#let ee-is-on(x) = {
  if x == none { false }
  else if type(x) == bool { x }
  else if type(x) == dictionary { ee-is-on(x.at("s", default: 0)) }
  else { x == 1 }
}

#let resolve-style-id(s, styles) = {
  if s == none { return none }
  if type(s) == str or type(s) == int {
    return styles.at(str(s), default: none)
  }
  if type(s) == dictionary { return s }
  return none
}

#let resolve-style(cell, styles) = {
  if cell == none or type(cell) != dictionary { return none }
  return resolve-style-id(cell.at("s", default: none), styles)
}

// Installed Office theme palette (THEME_COLORS.Office, core
// theme-color-map.ts), indexed by {th} 0..11: DARK1, LIGHT1, DARK2, LIGHT2,
// ACCENT1..6, HYPERLINK, FOLLOWED_HYPERLINK. getColorStyle hardcodes "Office"
// (workbook UI-theme customization never changes it), so this literal mirrors
// the TS OFFICE_THEME_COLORS table in univerResolve.ts.
#let ee-office-theme = ("000000", "FFFFFF", "44546A", "E7E6E6", "4472C4", "ED7D31", "A5A5A5", "70AD47", "5B9BD5", "70AD47", "0563C1", "954F72")
#let ee-theme-hex(c) = {
  let th = if type(c) == dictionary { c.at("th", default: none) } else { none }
  if type(th) != int or th < 0 or th >= ee-office-theme.len() { return none }
  ee-office-theme.at(th)
}
#let parse-color(c, theme: false) = {
  if c == none { return none }
  let raw = if type(c) == dictionary {
    if "rgb" in c and c.rgb != none and c.rgb != "" { c.rgb } else if theme { ee-theme-hex(c) } else { none }
  } else { c }
  if type(raw) != str { return none }
  let s = raw.trim()
  if s == "" { return none }
  // rgb(r, g, b) functional form.
  let m = s.match(regex("^rgb\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)$"))
  if m != none {
    let hex-of(n) = {
      let v = calc.min(255, calc.max(0, ee-as-int(n, fallback: 0)))
      let h = "0123456789abcdef".clusters()
      h.at(int(calc.floor(v / 16))) + h.at(int(calc.rem(v, 16)))
    }
    return rgb("#" + hex-of(m.captures.at(0)) + hex-of(m.captures.at(1)) + hex-of(m.captures.at(2)))
  }
  let h = if s.starts-with("#") { s.slice(1) } else { s }
  if h.len() == 6 and h.match(regex("^[0-9a-fA-F]{6}$")) != none { return rgb("#" + h) }
  // 8-digit RRGGBBAA (trailing alpha): drop the alpha, like worksheetTypst.ts.
  if h.len() == 8 and h.match(regex("^[0-9a-fA-F]{8}$")) != none { return rgb("#" + h.slice(0, 6)) }
  return none
}

// Border ink: installed sheet borders resolve {th} (_setBorderProps
// getColorStyle), else installed black fallback (renderBorderByCell
// uses "rgb(0,0,0)" when getColorStyle yields nothing).
#let border-ink(b) = {
  let c = parse-color(b.at("cl", default: none), theme: true)
  if c == none { rgb("#000000") } else { c }
}
#let decode-border-side(b) = {
  if b == none or type(b) != dictionary { return none }
  let s = ee-as-int(b.at("s", default: 0), fallback: 0)
  if s == 0 { return none }
  let color = border-ink(b)
  // BorderStyleTypes per installed Univer defs: 0 NONE, 1 THIN, 2 HAIR,
  // 3 DOTTED, 4 DASHED, 5 DASH_DOT, 6 DASH_DOT_DOT, 7 DOUBLE, 8 MEDIUM,
  // 9 MEDIUM_DASHED, 10 MEDIUM_DASH_DOT, 11 MEDIUM_DASH_DOT_DOT,
  // 12 SLANT_DASH_DOT, 13 THICK.
  // Installed widths (getLineWidth) are 1px default, 2px MEDIUM*, 3px
  // THICK; 1 canvas px = 0.75pt (96dpi, same factor as w/h geometry), so
  // 0.75pt / 1.5pt / 2.25pt. Dash arrays mirror installed setLineType
  // ([1,1] HAIR; [2] DOTTED; [3] DASHED/MEDIUM_DASHED; [2,5,2]
  // DASH_DOT/MEDIUM_DASH_DOT/SLANT_DASH_DOT; [2,2,5,2,2]
  // DASH_DOT_DOT/MEDIUM_DASH_DOT_DOT), converted px to pt.
  // DOUBLE (7) has no single Typst stroke: the outer stroke returned here
  // is the table-cell edge; border-is-double flags the side so the inner
// stroke paints separately via double-inner (two strokes, never one).
  if s == 2 { return stroke(paint: color, thickness: 0.75pt, dash: (0.75pt, 0.75pt)) }
  if s == 3 { return stroke(paint: color, thickness: 0.75pt, dash: (1.5pt, 1.5pt)) }
  if s == 4 { return stroke(paint: color, thickness: 0.75pt, dash: (2.25pt, 2.25pt)) }
  if s == 5 { return stroke(paint: color, thickness: 0.75pt, dash: (1.5pt, 3.75pt, 1.5pt)) }
  if s == 6 { return stroke(paint: color, thickness: 0.75pt, dash: (1.5pt, 1.5pt, 3.75pt, 1.5pt, 1.5pt)) }
  if s == 7 { return 0.75pt + color }
  if s == 8 { return 1.5pt + color }
  if s == 9 { return stroke(paint: color, thickness: 1.5pt, dash: (2.25pt, 2.25pt)) }
  if s == 10 { return stroke(paint: color, thickness: 1.5pt, dash: (1.5pt, 3.75pt, 1.5pt)) }
  if s == 11 { return stroke(paint: color, thickness: 1.5pt, dash: (1.5pt, 1.5pt, 3.75pt, 1.5pt, 1.5pt)) }
  if s == 12 { return stroke(paint: color, thickness: 0.75pt, dash: (1.5pt, 3.75pt, 1.5pt)) }
  if s == 13 { return 2.25pt + color }
  return 0.75pt + color
}
// True when a border-side dict requests a DOUBLE edge: the caller paints
// the outer stroke via decode-border-side and the inner stroke via
// double-inner below.
#let border-is-double(b) = {
  if b == none or type(b) != dictionary { return false }
  ee-as-int(b.at("s", default: 0), fallback: 0) == 7
}
// Installed DOUBLE: two 1px strokes straddling the edge (outer center
// +0.5px, inner center -0.5px). The table-cell stroke paints the outer;
// this paints the inner 0.75pt line 0.75pt inside the CELL edge, per side,
// in that side's own color. The content starts after table.cell inset, so
// every placement must first move back across that inset. Row height comes
// from the saved grid geometry, not from the content's intrinsic height.
#let double-inner(content, din, cell-inset, row-height, cell-width) = context {
  let s = measure(content)
  let il = cell-inset.at("left", default: cell-inset.at("x", default: 0pt))
  let it = cell-inset.at("top", default: cell-inset.at("y", default: 0pt))
  let edge-w = cell-width - 1.5pt
  let edge-h = row-height - 1.5pt
  box(width: s.width, height: s.height, [
    #content
    #if "top" in din { place(left + top, float: false, dx: 0.75pt - il, dy: 0.75pt - it, line(length: edge-w, stroke: 0.75pt + din.at("top"))) }
    #if "bottom" in din { place(left + top, float: false, dx: 0.75pt - il, dy: row-height - 0.75pt - it, line(length: edge-w, stroke: 0.75pt + din.at("bottom"))) }
    #if "left" in din { place(left + top, float: false, dx: 0.75pt - il, dy: 0.75pt - it, line(start: (0pt, 0pt), end: (0pt, edge-h), stroke: 0.75pt + din.at("left"))) }
    #if "right" in din { place(left + top, float: false, dx: cell-width - il - 0.75pt, dy: 0.75pt - it, line(start: (0pt, 0pt), end: (0pt, edge-h), stroke: 0.75pt + din.at("right"))) }
  ])
}

// Number-format patterns (mirrors the installed numfmt/Excel semantics:
// section selection with [conditions], section colors, grouping, decimals,
// percent scaling, quoted literals, negative parentheses, date/time serials,
// scientific notation, fractions, and integer zero-padding).
// Quoted "..." runs are literals and [...] tokens (colors, conditions,
// locales) carry no placeholders, so both are dropped for analysis purposes.
#let numfmt-analysis-text(section) = {
  section.replace(regex("\"[^\"]*\""), "").replace(regex("\\[[^\\]]*\\]"), "")
}
// A [<op><number>] comparison token, or none.
#let numfmt-section-cond(section) = {
  let m = section.match(regex("\\[\\s*(<=|>=|<>|!=|<|>|=|==)\\s*(-?\\d+\\.?\\d*)\\s*\\]"))
  if m == none { return none }
  (op: m.captures.at(0), num: float(m.captures.at(1)))
}
#let numfmt-cond-holds(cond, value) = {
  let op = cond.op
  let t = cond.num
  if op == "<" { value < t }
  else if op == "<=" { value <= t }
  else if op == ">" { value > t }
  else if op == ">=" { value >= t }
  else if op == "<>" or op == "!=" { value != t }
  else { value == t }
}
// Empty arrays join to none, never to "": every array-to-string assembly in
// this renderer goes through here so empty runs stay empty strings. Defined
// before its callers: Typst closures capture their definition scope, so a
// helper must precede every function that uses it.
#let numfmt-join(parts) = {
  if parts.len() == 0 { "" } else { parts.join("") }
}
// Section split that respects quoted literals: a ';' inside "..." does not
// start a new section (ECMA-376 quoted separators).
#let numfmt-split-sections(pattern) = {
  let chars = pattern.clusters()
  let parts = ()
  let cur = ()
  let in-q = false
  for ch in chars {
    if ch == "\"" { in-q = not in-q; cur.push(ch) }
    else if ch == ";" and not in-q {
      parts.push(numfmt-join(cur))
      cur = ()
    }
    else { cur.push(ch) }
  }
  parts.push(numfmt-join(cur))
  parts
}
#let numfmt-pick-index(parts, value) = {
  let i = 0
  while i < parts.len() {
    let c = numfmt-section-cond(parts.at(i))
    if c != none and numfmt-cond-holds(c, value) { return (i, true) }
    i = i + 1
  }
  if value < 0 and parts.len() > 1 { return (1, false) }
  if value == 0 and parts.len() > 2 { return (2, false) }
  return (0, false)
}
// maybeAddMinus exception (installed parsePattern): a condition-selected
// section omits the automatic minus for [<op><n>] when (n < 0 and op is
// </<=/=) or (n == 0 and op is '<') — e.g. [<0] renders -2 as "2".
#let numfmt-cond-minus-exc(op, num) = {
  (num < 0 and (op == "<" or op == "<=" or op == "=" or op == "==")) or (
    num == 0 and op == "<"
  )
}
// Volatile minus for the winning section: literal '-' (when present) always
// prints via the prefix; this decides the automatic one. A
// condition-selected section follows the exception rule above; a positional
// winner carries one only for a single-section pattern (the generated
// missing-negative clone) or via the two-part else rule (an unconditioned
// second section inherits it from a '=' or non-negative '>'/'>=' first
// condition); three-part-plus positional winners follow their own cond.
#let numfmt-volatile-minus(parts, idx, cond-selected, value) = {
  if value >= 0 { return false }
  let section = parts.at(idx)
  let c = numfmt-section-cond(section)
  if cond-selected {
    if c == none { return true }
    return not numfmt-cond-minus-exc(c.op, c.num)
  }
  let any-cond = false
  for p in parts { if numfmt-section-cond(p) != none { any-cond = true; break } }
  if not any-cond { return parts.len() == 1 }
  if parts.len() > 2 {
    if c == none { return true }
    return not numfmt-cond-minus-exc(c.op, c.num)
  }
  if idx == 1 {
    // A conditioned second section whose condition did not hold still
    // follows its own maybeAddMinus rule (e.g. [<10]0;[>10]0 shows -3).
    if c != none { return not numfmt-cond-minus-exc(c.op, c.num) }
    let c1 = numfmt-section-cond(parts.at(0))
    if c1 == none { return true }
    return c1.op == "=" or c1.op == "==" or (
      (c1.op == ">" or c1.op == ">=") and c1.num >= 0
    )
  }
  return true
}
// First matching conditional section wins; otherwise Excel positional
// sections (positive;negative;zero;text).
#let numfmt-pick-section(parts, value) = {
  let pick = numfmt-pick-index(parts, value)
  parts.at(pick.at(0))
}
// Section ink ([Red], [Blue], ...); none when the section carries no color.
// Only the names present in the installed defaultTheme resolve (the runtime
// reads `<name>.500`): red/blue/green/yellow. black/white/cyan/magenta miss
// the theme lookup, so the canvas drops them to default ink — none here too.
#let numfmt-section-color(section) = {
  let m = section.match(regex("(?i)\\[\\s*(black|blue|cyan|green|magenta|red|white|yellow)\\s*\\]"))
  if m == none { return none }
  let cols = (
    blue: rgb("#3f83f8"), green: rgb("#0da471"),
    red: rgb("#f05252"), yellow: rgb("#d49d0f")
  )
  cols.at(lower(m.captures.at(0)), default: none)
}
// Section ink, mirroring the installed preview API (getPatternPreview
// surfaces the section color only for negative values) and the installed
// composition (the interceptor color spreads over the explicit font color,
// so the section wins here too). Fallback-only: cells carrying _ee resolve
// their ink from _ee.c in section-fill-for below and never reach this
// probe.
#let number-section-fill(cell, st) = {
  if cell == none or type(cell) != dictionary { return none }
  let v = cell.at("v", default: none)
  if type(v) != int and type(v) != float { return none }
  if v >= 0 { return none }
  if st == none or type(st) != dictionary { return none }
  let n = st.at("n", default: none)
  if type(n) != dictionary { return none }
  let pattern = n.at("pattern", default: none)
  if type(pattern) != str or pattern == "" { return none }
  let section = numfmt-pick-section(numfmt-split-sections(pattern), v)
  numfmt-section-color(section)
}
// Installed section ink for a cell: upfront _ee.c hex first (verbatim, no
// color-name probe), else the fallback pattern probe above.
#let section-fill-for(cell, st) = {
  if cell != none and type(cell) == dictionary {
    let ee = cell.at("_ee", default: none)
    if type(ee) == dictionary {
      let c = ee.at("c", default: none)
      if type(c) == str and c != "" {
        let parsed = parse-color(c)
        if parsed != none { return parsed }
      }
    }
  }
  number-section-fill(cell, st)
}
#let numfmt-pad(num, width) = {
  let s = str(num)
  while s.len() < width { s = "0" + s }
  s
}
#let numfmt-gcd(a, b) = {
  while b != 0 {
    let t = calc.rem(a, b)
    a = b
    b = t
  }
  a
}
// Date/time patterns carry tokens (y/m/d/h/s/...) and no 0#?E% placeholders.
#let numfmt-is-date-pattern(bare) = {
  if bare.match(regex("[0#?Ee%]")) != none { return false }
  bare.match(regex("(?i)y+|m+|d+|h+|s+")) != none
}
// Fraction patterns pair placeholders around a slash (dates use bare slashes).
#let numfmt-is-fraction-pattern(bare) = {
  bare.contains("/") and (bare.contains("?") or bare.contains("#"))
}
#let numfmt-is-scientific-pattern(bare) = {
  bare.match(regex("(?i)e[+-].*0")) != none
}
// Excel 1900 date system as civil (year, month, day). Serial 60 is the
// fictitious 1900-02-29; serials below 60 precede it, so the epoch offset
// differs by one (the leap bug shifts only later serials).
#let numfmt-serial-ymd(serial) = {
  if serial == 60 { return (1900, 2, 29) }
  let base = if serial > 60 { 25569 } else { 25568 }
  let z = serial - base + 719468
  let era = int(z / 146097)
  let doe = z - era * 146097
  let yoe = int((doe - int(doe / 1460) + int(doe / 36524) - int(doe / 146096)) / 365)
  let y = yoe + era * 400
  let doy = doe - (365 * yoe + int(yoe / 4) - int(yoe / 100))
  let mp = int((5 * doy + 2) / 153)
  let d = doy - int((153 * mp + 2) / 5) + 1
  let m = if mp < 10 { mp + 3 } else { mp - 9 }
  if m <= 2 { y = y + 1 }
  (y, m, d)
}
// Signed assembly shared by every branch: parenthesised sections already
// carry their own parens in the literals, so only add a minus otherwise.
// show-minus is the volatile-minus decision (numfmt-volatile-minus), never
// a blanket value<0 test: condition-selected sections like [<0] omit it.
#let numfmt-signed(core, trimmed, show-minus) = {
  let parens = trimmed.starts-with("(") and trimmed.ends-with(")")
  if show-minus and parens { core }
  else if show-minus { "-" + core }
  else { core }
}
#let numfmt-strip-literals(s) = {
  s.replace("\"", "").replace(regex("\\[[^\\]]*\\]"), "").replace(regex("_([\\)\\(,;:\\-\\s])"), " ").replace("_", "").replace("*", "").trim()
}
#let numfmt-month-names = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
#let numfmt-month-abbr = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
#let numfmt-day-names = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
#let numfmt-day-abbr = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
#let numfmt-format-date(value, section) = {
  if value < 0 { return "######" }
  let days = int(calc.floor(value))
  let frac = value - days
  // Sub-day rounding that reaches midnight rolls the date forward (a
  // fractional serial just below the next day renders as 00:00:00 there).
  // Serial 60 rolls to 61 (past the fictitious 1900-02-29) like the rest.
  let secs = int(calc.round(frac * 86400))
  if secs >= 86400 {
    days = days + 1
    secs = 0
  }
  let (y, m, d) = numfmt-serial-ymd(days)
  let hh = int(secs / 3600)
  let mi = int(calc.rem(secs, 3600) / 60)
  let ss = calc.rem(secs, 60)
  // Monday-first weekday for ddd/dddd (serial 1 was a Monday; the leap-bug
  // day shifts later serials by one). The +700000 (a multiple of 7) keeps
  // the operand non-negative for small serials.
  let dow = calc.rem(days - (if days >= 61 { 2 } else { 1 }) + 700000, 7)
  let chars = section.clusters()
  let out = ""
  let i = 0
  let seen-h = false
  while i < chars.len() {
    let ch = chars.at(i)
    if ch == "\"" {
      let j = i + 1
      while j < chars.len() and chars.at(j) != "\"" {
        out = out + chars.at(j)
        j = j + 1
      }
      i = if j < chars.len() { j + 1 } else { j }
      continue
    }
    if ch == "[" {
      while i < chars.len() and chars.at(i) != "]" { i = i + 1 }
      i = i + 1
      continue
    }
    if ch == "_" and i + 1 < chars.len() {
      out = out + " "
      i = i + 2
      continue
    }
    if ch == "*" and i + 1 < chars.len() {
      i = i + 2
      continue
    }
    let rest = lower(numfmt-join(chars.slice(i)))
    let tok = none
    for cand in ("yyyy", "mmmm", "dddd", "yyy", "mmm", "ddd", "yy", "mm", "dd", "hh", "ss", "am/pm", "a/p", "y", "m", "d", "h", "s") {
      if rest.starts-with(cand) { tok = cand; break }
    }
    if tok == none {
      out = out + ch
      i = i + 1
      continue
    }
    if tok == "yyyy" { out = out + numfmt-pad(y, 4) }
    else if tok == "yyy" { out = out + numfmt-pad(y, 4) }
    else if tok == "yy" { out = out + numfmt-pad(calc.rem(y, 100), 2) }
    else if tok == "y" { out = out + str(y) }
    else if tok == "mmmm" { out = out + numfmt-month-names.at(m - 1) }
    else if tok == "mmm" { out = out + numfmt-month-abbr.at(m - 1) }
    else if tok == "dddd" { out = out + numfmt-day-names.at(dow) }
    else if tok == "ddd" { out = out + numfmt-day-abbr.at(dow) }
    else if tok == "mm" or tok == "m" {
      // Excel minute rule: m after an h token, or before an s token, is a
      // minute; otherwise a month.
      let after = rest.slice(tok.len()).replace(regex("^[:\\-/\\s,.]+"), "")
      let minute = seen-h or after.starts-with("s")
      let num = if minute { mi } else { m }
      if tok == "mm" { out = out + numfmt-pad(num, 2) } else { out = out + str(num) }
    }
    else if tok == "dd" { out = out + numfmt-pad(d, 2) }
    else if tok == "d" { out = out + str(d) }
    else if tok == "hh" or tok == "h" {
      seen-h = true
      let h12 = hh
      if rest.contains("am/pm") or rest.contains("a/p") { h12 = calc.rem(hh + 11, 12) + 1 }
      if tok == "hh" { out = out + numfmt-pad(h12, 2) } else { out = out + str(h12) }
    }
    else if tok == "ss" { out = out + numfmt-pad(ss, 2) }
    else if tok == "s" { out = out + str(ss) }
    else if tok == "am/pm" { if hh < 12 { out = out + "AM" } else { out = out + "PM" } }
    else if tok == "a/p" { if hh < 12 { out = out + "A" } else { out = out + "P" } }
    i = i + tok.len()
  }
  out
}
#let numfmt-format-fraction(value, section, show-minus) = {
  let a = calc.abs(value)
  let whole = int(calc.floor(a))
  let frac = a - whole
  // Slash split, quote-aware (a '/' inside "..." is a literal).
  let schars = section.clusters()
  let slash-at = none
  let in-q = false
  let k = 0
  while k < schars.len() {
    let c = schars.at(k)
    if c == "\"" { in-q = not in-q }
    else if not in-q and c == "/" { slash-at = k; break }
    k = k + 1
  }
  if slash-at == none { return str(value) }
  let int-pat = numfmt-join(schars.slice(0, slash-at))
  let den-pat = numfmt-join(schars.slice(slash-at + 1))
  let bare-den = numfmt-analysis-text(den-pat)
  let q-count = bare-den.clusters().filter(ch => ch == "?").len()
  let max-den = if q-count > 0 { calc.min(calc.pow(10, q-count) - 1, 9999) } else { 99 }
  let best-n = 0
  let best-d = 1
  let best-err = none
  for den in range(1, int(max-den) + 1) {
    let num = int(calc.round(frac * den))
    let err = calc.abs(frac - num / den)
    // Strictly-smaller wins, so the smallest denominator breaks ties; the
    // two arms keep arithmetic off none regardless of `or` strictness.
    if best-err == none {
      best-err = err
      best-n = num
      best-d = den
    } else if err < best-err - 1e-12 {
      best-err = err
      best-n = num
      best-d = den
    }
  }
  let g = numfmt-gcd(best-n, best-d)
  let num = int(best-n / g)
  let den = int(best-d / g)
  // Literal prefix/suffix around the fraction (quote-aware scans so quoted
  // placeholder lookalikes stay literal).
  let first = none
  let in-q2 = false
  for (i, ch) in int-pat.clusters().enumerate() {
    if ch == "\"" { in-q2 = not in-q2 }
    else if first == none and not in-q2 and (ch == "0" or ch == "#" or ch == "?") { first = i }
  }
  let prefix = if first == none { numfmt-strip-literals(int-pat) } else { numfmt-strip-literals(numfmt-join(int-pat.clusters().slice(0, first))) }
  let last = none
  let in-q3 = false
  let den-clusters = den-pat.clusters()
  for (i, ch) in den-clusters.enumerate() {
    if ch == "\"" { in-q3 = not in-q3 }
    else if not in-q3 and (ch == "0" or ch == "#" or ch == "?") { last = i }
  }
  let suffix = if last == none { numfmt-strip-literals(den-pat) } else { numfmt-strip-literals(numfmt-join(den-clusters.slice(last + 1))) }
  let bare-int = numfmt-analysis-text(int-pat)
  let int-str = if whole == 0 {
    if bare-int.contains("0") { "0" } else { "" }
  } else { str(whole) }
  let core = if num == 0 {
    if int-str == "" { "0" } else { int-str }
  } else if int-str == "" {
    str(num) + "/" + str(den)
  } else {
    int-str + " " + str(num) + "/" + str(den)
  }
  numfmt-signed(prefix + core + suffix, section.replace(regex("\\[[^\\]]*\\]"), "").trim(), show-minus)
}
#let numfmt-format-scientific(value, section, show-minus) = {
  let a = calc.abs(value)
  // Exponent split, quote-aware (an 'e' inside "..." is a literal).
  let schars = section.clusters()
  let e-at-sec = none
  let in-q = false
  let k = 0
  while k < schars.len() {
    let c = schars.at(k)
    if c == "\"" { in-q = not in-q }
    else if not in-q and (c == "e" or c == "E") and k + 1 < schars.len() and (schars.at(k + 1) == "+" or schars.at(k + 1) == "-") {
      e-at-sec = k
      break
    }
    k = k + 1
  }
  if e-at-sec == none { return str(value) }
  let mant-pat = numfmt-join(schars.slice(0, e-at-sec))
  let exp-pat = numfmt-join(schars.slice(e-at-sec + 1))
  // Placeholder counts ignore quoted literals (a quoted '0' is text).
  let bare-mant = numfmt-analysis-text(mant-pat)
  let bare-exp = numfmt-analysis-text(exp-pat)
  let mant-clusters = bare-mant.clusters()
  let dot-at = none
  for (i, ch) in mant-clusters.enumerate() {
    if dot-at == none and ch == "." { dot-at = i }
  }
  let decimals = 0
  if dot-at != none {
    for ch in mant-clusters.slice(dot-at + 1) {
      if ch == "0" or ch == "#" { decimals = decimals + 1 }
    }
  }
  let exp-min = calc.max(1, bare-exp.clusters().filter(ch => ch == "0").len())
  let (m, e) = if a == 0 { (0, 0) } else {
    let mm = a
    let ee = 0
    while mm >= 10 { mm = mm / 10; ee = ee + 1 }
    while mm < 1 { mm = mm * 10; ee = ee - 1 }
    (mm, ee)
  }
  let factor = 1
  for i in range(decimals) { factor = factor * 10 }
  let rounded = int(calc.round(m * factor))
  if rounded >= factor * 10 {
    rounded = factor
    e = e + 1
  }
  let mant-whole = int(rounded / factor)
  let mant-frac = rounded - mant-whole * factor
  let mant = str(mant-whole)
  if decimals > 0 { mant = mant + "." + numfmt-pad(mant-frac, decimals) }
  let exp-sign = if e < 0 { "-" } else { "+" }
  let exp = exp-sign + numfmt-pad(int(calc.abs(e)), exp-min)
  // Literals: prefix before the mantissa run, middle up to E, suffix past
  // the exponent digits (quote-aware so quoted runs stay literal).
  let first = none
  let in-q2 = false
  let mant-chars = mant-pat.clusters()
  for (i, ch) in mant-chars.enumerate() {
    if ch == "\"" { in-q2 = not in-q2 }
    else if first == none and not in-q2 and (ch == "0" or ch == "#") { first = i }
  }
  let prefix = if first == none { numfmt-strip-literals(mant-pat) } else { numfmt-strip-literals(numfmt-join(mant-chars.slice(0, first))) }
  let last-m = none
  let in-q4 = false
  for (i, ch) in mant-chars.enumerate() {
    if ch == "\"" { in-q4 = not in-q4 }
    else if not in-q4 and (ch == "0" or ch == "#" or ch == "%" or ch == "," or ch == ".") { last-m = i }
  }
  let mid = if last-m == none { "" } else { numfmt-strip-literals(numfmt-join(mant-chars.slice(last-m + 1))) }
  // Suffix starts past the LAST exponent placeholder ('+00' keeps both
  // zeros in the exponent; only trailing literals become the suffix).
  let exp-last = none
  let in-q3 = false
  let exp-chars = exp-pat.clusters()
  for (i, ch) in exp-chars.enumerate() {
    if ch == "\"" { in-q3 = not in-q3 }
    else if not in-q3 and ch == "0" { exp-last = i }
  }
  let suffix = if exp-last == none {
    numfmt-strip-literals(exp-pat.replace(regex("^[+-]"), ""))
  } else {
    numfmt-strip-literals(numfmt-join(exp-chars.slice(exp-last + 1)))
  }
  let core = prefix + mant + mid + "E" + exp + suffix
  numfmt-signed(core, section.replace(regex("\\[[^\\]]*\\]"), "").trim(), show-minus)
}
#let format-general-num(v) = {
  if type(v) == int { return str(v) }
  if type(v) != float { return str(v) }
  let r = calc.round(v, digits: 8)
  if r == int(r) { return str(int(r)) }
  str(r)
}

#let format-number-pattern(value, pattern) = {
  if type(pattern) != str or pattern == "" or pattern == "General" { return format-general-num(value) }
  if type(value) != int and type(value) != float { return str(value) }
  let parts = numfmt-split-sections(pattern)
  let pick = numfmt-pick-index(parts, value)
  let section = parts.at(pick.at(0))
  // Installed minus (maybeAddMinus): never a blanket value<0 test, so
  // condition-selected sections like [<0] render -2 as "2".
  let show-minus = numfmt-volatile-minus(parts, pick.at(0), pick.at(1), value)
  let bare = numfmt-analysis-text(section)
  // Date/time serials, fractions and scientific notation each render from
  // the value directly; everything else flows through the generic decimal
  // pipeline below.
  if numfmt-is-date-pattern(bare) { return numfmt-format-date(value, section) }
  if numfmt-is-fraction-pattern(bare) { return numfmt-format-fraction(value, section, show-minus) }
  if numfmt-is-scientific-pattern(bare) { return numfmt-format-scientific(value, section, show-minus) }
  // [Red]-style conditions carry no digits: drop them before measuring.
  let clean = section.replace(regex("\\[[^\\]]*\\]"), "")
  if clean.trim() == "" { return str(value) }
  let trimmed = clean.trim()
  let percents = clean.split("%").len() - 1
  // Count 0/# placeholders after the decimal point.
  let chars = clean.clusters()
  let dot-at = none
  for (i, ch) in chars.enumerate() {
    if dot-at == none and ch == "." { dot-at = i }
  }
  let decimals = 0
  if dot-at != none {
    let k = dot-at + 1
    while k < chars.len() {
      if chars.at(k) == "0" or chars.at(k) == "#" { decimals = decimals + 1 }
      k = k + 1
    }
  }
  if decimals > 8 { decimals = 8 }
  let int-phrase = if dot-at != none { numfmt-join(chars.slice(0, dot-at)) } else { clean }
  let grouped = int-phrase.contains(",")
  let scale = calc.pow(100, percents) * calc.pow(10, decimals)
  let units = int(calc.round(calc.abs(value) * scale))
  let factor = calc.pow(10, decimals)
  let whole = int(calc.floor(units / factor))
  let frac = units - whole * factor
  // Integer minimum width: '0' placeholders print leading zeros ('00000').
  let min-int = int-phrase.clusters().filter(ch => ch == "0").len()
  let digits = str(whole)
  while digits.len() < min-int { digits = "0" + digits }
  let grouped-digits = ""
  let n = digits.len()
  for (i, ch) in digits.clusters().enumerate() {
    if grouped and i > 0 and calc.rem(n - i, 3) == 0 { grouped-digits = grouped-digits + "," }
    grouped-digits = grouped-digits + ch
  }
  let frac-str = if decimals > 0 {
    let f = str(frac)
    while f.len() < decimals { f = "0" + f }
    "." + f
  } else { "" }
  let number = grouped-digits + frac-str
  for i in range(percents) { number = number + "%" }
  // Literal prefix/suffix around the 0#%., placeholder run.
  let first = none
  for (i, ch) in chars.enumerate() {
    if first == none and (ch == "0" or ch == "#") { first = i }
  }
  if first == none { return str(value) }
  let last = first
  let k = first
  while k < chars.len() and chars.at(k) in ("0", "#", "%", ",", ".") {
    last = k
    k = k + 1
  }
  let prefix = numfmt-strip-literals(numfmt-join(chars.slice(0, first)))
  let suffix = numfmt-strip-literals(numfmt-join(chars.slice(last + 1)).replace("%", ""))
  numfmt-signed(prefix + number + suffix, trimmed, show-minus)
}

#let has-live-formula(cell) = {
  if cell == none or type(cell) != dictionary { return false }
  let f = cell.at("f", default: none)
  return type(f) == str and f.trim() != ""
}

// Rich stream unless a live formula wins (cached v is shown instead).
#let rich-stream(cell) = {
  if cell == none or type(cell) != dictionary { return none }
  if has-live-formula(cell) { return none }
  if "p" not in cell or cell.p == none or type(cell.p) != dictionary { return none }
  let body = cell.p.at("body", default: none)
  if body == none or type(body) != dictionary { return none }
  let stream = body.at("dataStream", default: none)
  if type(stream) != str or stream == "" { return none }
  return stream.replace("\r\n", "\n").replace("\r", "\n").replace(regex("[\\u0000-\\u0008\\u000B-\\u001F\\u007F]"), "")
}

#let rich-runs(cell) = {
  if cell == none or type(cell) != dictionary { return () }
  if "p" not in cell or cell.p == none or type(cell.p) != dictionary { return () }
  let body = cell.p.at("body", default: none)
  if body == none or type(body) != dictionary { return () }
  let runs = body.at("textRuns", default: ())
  if type(runs) != array { return () }
  // textRuns offsets index the *saved* UTF-16 dataStream. rich-stream
  // normalizes CRLF/CR and strips controls before layout, so remap the
  // offsets by the same transformation before rich-segments slices it.
  let raw = body.at("dataStream", default: none)
  if type(raw) != str { return runs }
  let offsets = (0,)
  let normalized = 0
  let after-cr = false
  for cp in raw.codepoints() {
    let units = if cp > "\u{ffff}" { 2 } else { 1 }
    let emitted = if cp == "\n" and after-cr { 0 }
      else if cp == "\r" { 1 }
      else if cp.match(regex("^[\\u0000-\\u0008\\u000B-\\u001F\\u007F]$")) != none { 0 }
      else { units }
    for j in range(1, units + 1) { offsets.push(normalized + calc.min(j, emitted)) }
    normalized += emitted
    after-cr = cp == "\r"
  }
  let end = offsets.len() - 1
  return runs.map(run => {
    if type(run) != dictionary { return run }
    let a = calc.max(0, calc.min(ee-as-int(run.at("st", default: 0), fallback: 0), end))
    let b = calc.max(0, calc.min(ee-as-int(run.at("ed", default: 0), fallback: 0), end))
    let mapped = run
    mapped.insert("st", offsets.at(a))
    mapped.insert("ed", offsets.at(b))
    mapped
  })
}

// Plain display text: installed _ee text verbatim, else the numeric-pattern
// fallback, else the rich stream, else cached v.
#let cell-display-text(cell, st) = {
  if cell == none or type(cell) != dictionary { return "" }
  // Verbatim installed display text: the TS layer ran the same
  // getPatternPreview call as the runtime preview, so this is consumed
  // as-is and never reformatted here. An empty result falls through like
  // the runtime, which skips interception on empty text.
  let ee = cell.at("_ee", default: none)
  if type(ee) == dictionary {
    let d = ee.at("d", default: none)
    if type(d) == str and d != "" { return d }
  }
  let v = cell.at("v", default: none)
  let t = cell.at("t", default: none)
  // The installed numfmt interceptor skips booleans (t:3) and forced text
  // (t:4), even when their stored value happens to be numeric.
  if t != 3 and t != 4 and (type(v) == int or type(v) == float) and st != none and type(st) == dictionary {
    let n = st.at("n", default: none)
    if type(n) == dictionary {
      let pattern = n.at("pattern", default: none)
      if type(pattern) == str and pattern != "" {
        return format-number-pattern(v, pattern)
      }
    }
  }
  if not has-live-formula(cell) {
    let stream = rich-stream(cell)
    if stream != none {
      let s = stream.replace(regex("\\n+$"), "")
      if s != "" { return s }
    }
  }
  if v == none { return "" }
  if type(v) == bool { return if v { "TRUE" } else { "FALSE" } }
  // t: 3 boolean prints TRUE/FALSE even when stored as 1/0.
  if t == 3 {
    if v == 1 { return "TRUE" }
    if v == 0 { return "FALSE" }
  }
  return format-general-num(v)
}

#let extract-cell-text(cell) = {
  cell-display-text(cell, none)
}

#let cell-has-content(r, c, cell-data) = {
  let r-key = str(r)
  if not (r-key in cell-data) or type(cell-data.at(r-key)) != dictionary { return false }
  let c-key = str(c)
  if not (c-key in cell-data.at(r-key)) { return false }
  let cell = cell-data.at(r-key).at(c-key)
  if cell == none or type(cell) != dictionary { return false }
  let v = cell.at("v", default: none)
  if v != none and v != "" { return true }
  let f = cell.at("f", default: none)
  if f != none and type(f) == str and f.trim() != "" { return true }
  let txt = extract-cell-text(cell)
  if txt != none and txt.trim() != "" { return true }
  return false
}

// Long-token breaking for WRAP cells (column-constrained layout). Non-WRAP
// cells never call this: each logical line is frozen whole by natural()
// below, so no per-word/per-character unbreaking is needed.
#let format-cell-text(raw-text) = {
  if raw-text == "" { return "" }
  raw-text.split("\n").map(line => {
    line.split(" ").map(w => {
      if w.clusters().len() > 12 {
        w.clusters().join(sym.zws)
      } else {
        w
      }
    }).join(" ")
  }).join("\n")
}

// Measured natural-width line for non-WRAP cells: the complete styled
// logical line is laid once at a width past any real content and frozen
// in a box of exactly the measured size, so spaces, CJK boundaries,
// hyphens, emoji clusters and mixed-direction runs cannot split it.
// Shaping is preserved because nothing is re-boxed per character or run
// (this replaces the old nbsp-glue/per-cluster boxing). Only explicit
// newlines break, via separate logical lines at the call site.
// Width policy: the ceiling 100000pt is the largest width proven to
// compile in this toolchain (mixed spaces/emoji/hyphen/CJK/Arabic stays
// on one line; right alignment and fixed-rectangle clipping verified);
// larger values risk Typst length limits, so content past the ceiling
// soft-wraps instead of overflowing the layout. Detection is width
// STABILITY across constraints, never a cap-relative threshold: a wrapped
// layout refills the wider constraint (widths diverge — a wrapped
// 20000pt layout can report 19992.5pt, just under any threshold), while
// an unwrapped line reports its natural width under both (widths agree
// within 0.5pt, threshold kept, not raised). Measurement starts at
// 20000pt — past every realistic line (about 7m; the longest fixture
// line is 52 chars) — and doubles while widths diverge, so an ordinary
// line pays two measures and only a near-ceiling line pays up to seven.
#let ee-natural-base = 20000pt
#let ee-natural-ceiling = 100000pt
#let natural-at(body, w) = {
  let cap = calc.min(w * 2, ee-natural-ceiling)
  let m = measure(body, width: w)
  if w >= ee-natural-ceiling or calc.abs(m.width - measure(body, width: cap).width) <= 0.5pt {
    (box-w: m.width, box-h: m.height)
  } else {
    natural-at(body, cap)
  }
}
#let natural(body) = context {
  let s = natural-at(body, ee-natural-base)
  box(width: s.box-w, height: s.box-h, body)
}

// Groups line tokens into per-logical-line piece arrays. Typst bindings
// never rebind, so the grouping recurses over the token tail. A break
// with nothing accumulated still opens an empty group, preserving blank
// lines through the join.
#let ee-group-lines(toks, cur, out) = {
  if toks.len() == 0 {
    if cur.len() > 0 { out.push(cur) }
    return out
  }
  let head = toks.at(0)
  let tail = toks.slice(1)
  if head.br {
    if cur.len() > 0 { out.push(cur) } else { out.push(()) }
    ee-group-lines(tail, (), out)
  } else {
    cur.push(head.c)
    ee-group-lines(tail, cur, out)
  }
}

// One inline run: cell style merged under per-run ts (ts wins when present).
// sec-fill carries a number-format section color ([Red] as _ee.c theme hex
// or the fallback probe) and wins over run/cell font colors, mirroring the
// installed { ...style, ...interceptStyle } composition.
#let style-piece(txt, st, ts, dir: auto, sec-fill: none, font-theme: false) = {
  let pick(key) = {
    if ts != none and type(ts) == dictionary and key in ts and ts.at(key) != none { ts.at(key) }
    else if st != none and type(st) == dictionary and key in st and st.at(key) != none { st.at(key) }
    else { none }
  }
  let ff = pick("ff")
  let fs = pick("fs")
  // Installed font-colour resolution differs by paint path: document cells
  // (rich `p` or nonzero rotation) resolve `{th}` through getColorStyle,
  // plain-text font reads `.rgb` only (engine-render _renderText).
  let cl = parse-color(pick("cl"), theme: font-theme)
  // Effective font: explicit ff/fs win; otherwise Univer DEFAULT_STYLES
  // (Arial 11) so sheet text never inherits the template's serif body font.
  let out = text(
    font: if type(ff) == str and ff != "" { (ff, "Arial") } else { ("Arial",) },
    size: if (type(fs) == int or type(fs) == float) and fs > 0 { fs * 1pt } else { 11pt },
    weight: if ee-is-on(pick("bl")) { "bold" } else { "regular" },
    style: if ee-is-on(pick("it")) { "italic" } else { "normal" },
    // Installed precedence: the numfmt section ink spreads over the cell
    // style ({ ...style, ...interceptStyle }), so sec-fill wins over cl.
    fill: if sec-fill != none { sec-fill } else if cl != none { cl } else { rgb("#111111") },
    dir: dir,
    txt
  )
  if ee-is-on(pick("ul")) or ee-is-on(pick("bbl")) { out = underline(out) }
  if ee-is-on(pick("st")) { out = strike(out) }
  if ee-is-on(pick("ol")) { out = overline(out) }
  let va = pick("va")
  if va == 2 { out = sub(out) }
  else if va == 3 { out = super(out) }
  out
}

// Clamp + sort runs, then slice the text into (text, ts) segments.
// Offsets are UTF-16 code units (Univer textRuns index the JS dataStream):
// BMP codepoints are one unit, astral codepoints two. A single-codepoint
// string above U+FFFF is astral (string comparison is codepoint-ordered,
// matching UTF-8 byte order), so combining marks — one unit each — slice
// exactly like the runtime does.
#let rich-segments(txt, runs) = {
  let cps = txt.codepoints()
  let widths = ()
  for cp in cps {
    widths.push(if cp > "\u{ffff}" { 2 } else { 1 })
  }
  let starts = ()
  let total = 0
  for w in widths {
    starts.push(total)
    total = total + w
  }
  let n = total
  let slice-units(a, b) = {
    let out = ()
    for (i, cp) in cps.enumerate() {
      let s0 = starts.at(i)
      if s0 < b and s0 + widths.at(i) > a { out.push(cp) }
    }
    numfmt-join(out)
  }
  let valid = ()
  for r in runs {
    if type(r) != dictionary { continue }
    let a = ee-as-int(r.at("st", default: 0), fallback: 0)
    let b = ee-as-int(r.at("ed", default: 0), fallback: 0)
    if a < 0 { a = 0 }
    if b > n { b = n }
    if b <= a { continue }
    valid.push((st: a, ed: b, ts: r.at("ts", default: none)))
  }
  valid = valid.sorted(key: r => r.st)
  let segs = ()
  let cursor = 0
  for r in valid {
    let a = if r.st < cursor { cursor } else { r.st }
    if a > cursor {
      segs.push((text: slice-units(cursor, a), ts: none))
      cursor = a
    }
    if r.ed > cursor {
      segs.push((text: slice-units(cursor, r.ed), ts: r.ts))
      cursor = r.ed
    }
  }
  if cursor < n {
    segs.push((text: slice-units(cursor, n), ts: none))
  }
  segs
}

// Styled cell body: run segments (or one plain segment) with line breaks.
// Wrapping is driven ONLY by tb (wrap strategy): vertical text (tr.v == 1)
// wraps first per tb exactly like ordinary text — B1's tb:3 slices its long
// token greedily (rotated-WRAP path below) into two
// lines — and apply-rotation then rotates the whole laid-out block, which is
// how Univer produces two vertical runs instead of one horizontal row.
//
// Text rotation (tr: { a angle, v vertical }). Define these before the
// wrapping helpers, which need the effective angle when styling text runs.
#let is-vertical-text(st) = {
  if st == none or type(st) != dictionary { return false }
  let tr = st.at("tr", default: none)
  if tr == none or type(tr) != dictionary { return false }
  return ee-is-on(tr.at("v", default: 0))
}
#let rotation-angle(st) = {
  if is-vertical-text(st) { return 90 }
  if st == none or type(st) != dictionary { return 0 }
  let tr = st.at("tr", default: none)
  if tr == none or type(tr) != dictionary { return 0 }
  return ee-as-num(tr.at("a", default: 0), fallback: 0)
}

// Installed greedy word-first wrapping for rotated WRAP (engine-render
// layout-ruler.ts _divideOperator): a word that fits the remainder of the
// line stays on it; a word that does not fit moves whole to the next line;
// only a word longer than the full budget is sliced mid-word, per cluster.
// Typst's optimal breaker would instead pack word fragments behind completed
// words (fewer, fuller lines — the orange cell laid 2 lines instead of the
// installed 3), so breaks are decided here with measured widths and frozen
// as explicit linebreaks. Words spanning rich runs keep every cluster's own
// ts; inter-word spaces ride with the following word, so a wrapped line
// never starts with a space. Trailing spaces of a logical line are dropped
// (invisible under both engines); leading spaces of a fresh line are dropped
// too (Typst collapses them while Univer indents — documented gap).
#let ee-greedy-wrap(txt, runs, st, budget, dir: auto, sec-fill: none) = context {
  // Flatten the styled stream to (cluster, ts) pairs so a word spanning
  // rich-run boundaries still breaks as one word.
  let flat = ()
  for seg in rich-segments(txt, runs) {
    for cl in seg.text.clusters() {
      if cl == "\n" or cl == "\r\n" or cl == "\r" { flat.push((br: true)) } else { flat.push((br: false, c: cl, ts: seg.ts)) }
    }
  }
  let log-lines = ()
  let acc-ln = ()
  for it in flat {
    if it.br { log-lines.push(acc-ln); acc-ln = () } else { acc-ln.push(it) }
  }
  log-lines.push(acc-ln)
  // One ts-run of clusters as a single text() so shaping survives inside
  // the run; breaks only fall between runs, as elsewhere. ts compares by
  // repr: none and dicts mix here and repr never fails the compile.
  let style-run(items) = {
    if items.len() == 0 { return "" }
    let bounds = (0,)
    let i = 1
    while i < items.len() {
      if repr(items.at(i).ts) != repr(items.at(i - 1).ts) { bounds.push(i) }
      i += 1
    }
    bounds.push(items.len())
    let parts = ()
    let b = 0
    while b + 1 < bounds.len() {
      let span = items.slice(bounds.at(b), bounds.at(b + 1))
      parts.push(style-piece(span.map(p => p.c).join(""), st, span.at(0).ts, dir: dir, sec-fill: sec-fill, font-theme: runs.len() > 0 or rotation-angle(st) != 0))
      b += 1
    }
    parts.join()
  }
  let out = ()
  for (li, ln) in log-lines.enumerate() {
    if li > 0 { out.push(linebreak()) }
    if ln.len() == 0 { continue }
    // Tokens: inter-word spaces ride with the following word; trailing
    // spaces of the line are dropped (invisible under both engines).
    let toks = ()
    let pending = ()
    let word = ()
    for p in ln {
      if p.c == " " {
        if word.len() > 0 { toks.push((sp: pending, items: word)); pending = (); word = () }
        pending.push(p)
      } else { word.push(p) }
    }
    if word.len() > 0 { toks.push((sp: pending, items: word)) }
    // Greedy placement against measured widths (installed: a trial strictly
    // wider than the budget opens a new line).
    let cur = ()
    for tok in toks {
      let w = style-run(tok.items)
      if cur.len() > 0 {
        let spc = style-run(tok.sp)
        if measure(cur.join() + spc + w).width <= budget {
          if tok.sp.len() > 0 { cur.push(spc) }
          cur.push(w)
          continue
        }
        out.push(cur.join())
        out.push(linebreak())
        cur = ()
      }
      // Fresh line: place whole or slice the overlong word per cluster.
      // A single cluster wider than the budget still advances (progress
      // guard, mirroring the installed slice loop).
      if measure(w).width <= budget { cur.push(w) } else {
        let frag = ()
        for p in tok.items {
          if measure(style-run(frag + (p,))).width <= budget or frag.len() == 0 { frag.push(p) } else {
            out.push(style-run(frag))
            out.push(linebreak())
            frag = (p,)
          }
        }
        cur.push(style-run(frag))
      }
    }
    if cur.len() > 0 { out.push(cur.join()) }
  }
  let body = if out.len() == 0 { "" } else { out.join() }
  box(width: budget, body)
}
#let render-cell-body(txt, runs, st, dir: auto, is-wrapped: false, sec-fill: none, wrap-width: none) = {
  let body-text = txt.replace(regex("\\n+$"), "")
  // Document paint path (rich runs or nonzero rotation) resolves font
  // `{th}`; plain font reads `.rgb` only (engine-render _renderText).
  let font-theme = runs.len() > 0 or rotation-angle(st) != 0
  if is-wrapped {
    let pieces = ()
    for seg in rich-segments(body-text, runs) {
      for (i, ln) in seg.text.split("\n").enumerate() {
        if i > 0 { pieces.push(linebreak()) }
        let t = format-cell-text(ln)
        if t != "" { pieces.push(style-piece(t, st, seg.ts, dir: dir, sec-fill: sec-fill, font-theme: font-theme)) }
      }
    }
    if pieces.len() == 0 { return "" }
    let joined = pieces.join()
    // Rotated WRAP (wrap-width from the call site) breaks by installed
    // greedy word-first wrapping (ee-greedy-wrap, frozen in its own
    // fixed-width box). Horizontal WRAP lays the ZWSP-prepared paragraph;
    if wrap-width != none { return ee-greedy-wrap(body-text, runs, st, wrap-width, dir: dir, sec-fill: sec-fill) }
    return joined
  }
  // Non-WRAP: tokenize logical lines (explicit \n only), style every run
  // whole — runs stay inline so shaping crosses run boundaries — then
  // freeze each logical line in ONE measured natural box. Blank lines
  // survive as empty groups (the join keeps their linebreaks).
  let toks = ()
  for seg in rich-segments(body-text, runs) {
    for (i, ln) in seg.text.split("\n").enumerate() {
      if i > 0 { toks.push((br: true)) }
      if ln != "" { toks.push((br: false, c: style-piece(ln, st, seg.ts, dir: dir, sec-fill: sec-fill, font-theme: font-theme))) }
    }
  }
  let lines = ee-group-lines(toks, (), ())
  if lines.len() == 0 { return "" }
  lines.map(ln => if ln.len() == 0 { "" } else { natural(ln.join()) }).join(linebreak())
}

// Univer canvas-rotates the whole laid-out line (convertTextRotation: v == 1
// forces 90 degrees). Reserve the rotated bounding box so text stays in-cell.
#let apply-rotation(content, st, target-h) = {
  let angle = rotation-angle(st)
  if angle == 0 { return content }
  // measure() needs a layout context: this whole box is evaluated while the
  // table lays out, so wrapping resolves against the real column width and
  // the measured content carries the effective font and size. The measured
  // layout is then FROZEN in a box of exactly the measured size before
  // rotating: re-laying greedy content at its own max line width reproduces
  // identical breaks, so the narrower rotated box cannot trigger a second
  // wrap pass (that rewrap manufactured extra vertical runs and spread them
  // across neighbouring columns). The outer box reserves the larger of the
  // rotated bounds and the resolved content height, so the text never
  // protrudes and short rotated text still fills a tall row.
  context {
    let s = measure(content)
    let rad = angle * calc.pi / 180
    let (c, sn) = (calc.abs(calc.cos(rad)), calc.abs(calc.sin(rad)))
    let bw = s.width * c + s.height * sn
    let bh = s.width * sn + s.height * c
    let hh = if target-h != none and target-h > bh { target-h } else { bh }
    box(
      width: bw,
      height: hh,
      align(center + horizon, rotate(angle * 1deg, box(width: s.width, height: s.height, content), reflow: false))
    )
  }
}

// Resolved row height in px, mirroring the row manager's getRowHeight:
// hidden rows are skipped by the caller; (ia absent or ia == 1) with a
// numeric ah yields ah (an absent ia still allows ah); otherwise a numeric
// h wins, including zero, else the worksheet default. The resolved height is always
// supplied — including the default — so every row keeps Univer's geometry.
#let row-resolved-px(r, row-data, default-h) = {
  let rd = row-data.at(str(r), default: none)
  if rd == none or type(rd) != dictionary { return default-h }
  let ia = rd.at("ia", default: none)
  let ah = ee-as-num(rd.at("ah", default: none), fallback: none)
  if (ia == none or ia == 1) and ah != none { return ah }
  let h = ee-as-num(rd.at("h", default: none), fallback: none)
  if h != none { return h }
  return default-h
}
// True when the resolved height came from an explicit h (not ah/default):
// installed auto-heights ah/default rows, but an explicit h is enforced —
// rotated paint may spill past it, never resize it.
#let row-explicit-at(r, row-data) = {
  let rd = row-data.at(str(r), default: none)
  if type(rd) != dictionary { return false }
  let ia = rd.at("ia", default: none)
  let ah = ee-as-num(rd.at("ah", default: none), fallback: none)
  if (ia == none or ia == 1) and ah != none { return false }
  let h = ee-as-num(rd.at("h", default: none), fallback: none)
  return h != none
}
// Installed document side margin for the rotated-WRAP budget (core
// _updateConfigAndGetDocumentModel: t defaults 0, b/l/r default 2px).
#let ee-doc-margin(st, key, fallback) = {
  let pd = if st != none and type(st.at("pd", default: none)) == dictionary { st.pd } else { none }
  let v = if pd == none { fallback } else { ee-as-num(pd.at(key, default: fallback), fallback: fallback) }
  v * 0.75pt
}
// Fixed frame for rotated content in explicit-height rows: the row keeps
// rh while paint spills horizontally (installed overflow spans columns,
// never rows) and cuts vertically at the row span; CLIP cuts both axes at
// the cell rectangle. Alignment positions the framed content per ht/vt.
#let ee-rotated-frame(content, h-a, v-a, fixed-h, cut) = context {
  let m = measure(content)
  let inner = if cut {
    box(width: 100%, height: fixed-h, clip: true, align(h-a + v-a, content))
  } else {
    box(width: m.width, height: fixed-h, clip: true, align(h-a + v-a, content))
  }
  box(width: 100%, height: fixed-h, clip: false, align(h-a + v-a, inner))
}

#let dim-style-id(dim-data, idx, styles) = {
  let d = dim-data.at(str(idx), default: none)
  if d == none or type(d) != dictionary { return none }
  return resolve-style-id(d.at("s", default: none), styles)
}

// Effective style, composed property by property like Univer's
// composeStyles(default, col, row, themeStyle, cell). Row-versus-column order
// follows the active renderer: the render skeleton forces
// isRowStylePrecedeColumnStyle to false (the app never configures it), so
// column precedes row unless row-precedes is set. Only absent keys fall
// through — an explicit null (none), 0 or false wins and blocks lower
// layers. Objects are replaced wholesale, never deep-merged.
#let compose-style(cell, r, c, row-data, col-data, styles, default-st, row-precedes: false) = {
  let pick-ref(ref) = {
    if ref == none { return none }
    if type(ref) == str or type(ref) == int {
      let found = styles.at(str(ref), default: none)
      if type(found) == dictionary { return found }
      return none
    }
    if type(ref) == dictionary { return ref }
    return none
  }
  let row-d = row-data.at(str(r), default: none)
  if type(row-d) != dictionary { row-d = none }
  let col-d = col-data.at(str(c), default: none)
  if type(col-d) != dictionary { col-d = none }
  let row-st = if row-d == none { none } else { pick-ref(row-d.at("s", default: none)) }
  let col-st = if col-d == none { none } else { pick-ref(col-d.at("s", default: none)) }
  let cell-st = resolve-style(cell, styles)
  let theme-st = if cell != none and type(cell) == dictionary {
    let ts = cell.at("themeStyle", default: none)
    if type(ts) == dictionary { ts } else { none }
  } else { none }
  // Low → high precedence in the list; traverse back-to-front keeping the
  // first defined property — exactly composeStyles, so the highest-priority
  // layer wins.
  let layers = if row-precedes {
    (default-st, col-st, row-st, theme-st, cell-st)
  } else {
    (default-st, row-st, col-st, theme-st, cell-st)
  }
  let out = (:)
  for i in range(layers.len(), 0, step: -1) {
    let layer = layers.at(i - 1)
    if type(layer) != dictionary { continue }
    for key in layer.keys() {
      if key not in out { out.insert(key, layer.at(key)) }
    }
  }
  if out.len() == 0 { return none }
  return out
}

#let render-univer-sheet(
  data-source,
  sheet-index: 0,
  show-gridlines: true,
  repeat-header-rows: 0,
  range-override: none,
  images: none,
  column-scale: 1
) = {
  if data-source == none {
    return align(center)[#text(fill: luma(120))[No Spreadsheet Data]]
  }
  let wb = if type(data-source) == str { json.decode(data-source) } else { data-source }
  if type(wb) != dictionary or "sheets" not in wb or type(wb.sheets) != dictionary or wb.sheets.len() == 0 {
    return align(center)[#text(fill: luma(120))[Empty Workbook]]
  }

  let raw-styles = wb.at("styles", default: (:))
  let styles = if type(raw-styles) == dictionary { raw-styles } else { (:) }
  let sheet-order = wb.at("sheetOrder", default: ())
  if type(sheet-order) != array { sheet-order = () }
  let want-index = ee-as-int(sheet-index, fallback: 0)
  let sheet-id = if want-index >= 0 and want-index < sheet-order.len() { sheet-order.at(want-index) } else { wb.sheets.keys().first() }
  if not (sheet-id in wb.sheets) { sheet-id = wb.sheets.keys().first() }
  let sheet = wb.sheets.at(sheet-id)
  if type(sheet) != dictionary {
    return align(center)[#text(fill: luma(120))[Empty Sheet]]
  }
  if ee-is-on(sheet.at("hidden", default: 0)) {
    return align(center)[#text(fill: luma(120))[Hidden Sheet]]
  }
  let sheet-rtl = ee-is-on(sheet.at("rightToLeft", default: 0))

  let raw-cell-data = sheet.at("cellData", default: (:))
  let cell-data = if type(raw-cell-data) == dictionary { raw-cell-data } else { (:) }
  let raw-merge-data = sheet.at("mergeData", default: ())
  let merge-data = if type(raw-merge-data) == array { raw-merge-data } else { () }
  let default-w = ee-as-num(sheet.at("defaultColumnWidth", default: 88), fallback: 88)
  let default-h = ee-as-num(sheet.at("defaultRowHeight", default: 24), fallback: 24)
  let raw-col-data = sheet.at("columnData", default: (:))
  let col-data = if type(raw-col-data) == dictionary { raw-col-data } else { (:) }
  let raw-row-data = sheet.at("rowData", default: (:))
  let row-data = if type(raw-row-data) == dictionary { raw-row-data } else { (:) }

  // Workbook/sheet default style: last fallback after cell, row, column.
  let default-st = resolve-style-id(sheet.at("defaultStyle", default: wb.at("defaultStyle", default: none)), styles)

  // Gridline colour is sheet-only.
  let grid-color = parse-color(sheet.at("gridlinesColor", default: none))
  if grid-color == none { grid-color = rgb("#d0d0d0") }

  let repeat-rows = ee-as-int(repeat-header-rows, fallback: 0)
  if repeat-rows < 0 { repeat-rows = 0 }

  // Determine bounds (Used Range or Range Override)
  let min-r = 0
  let min-c = 0
  let max-r = -1
  let max-c = -1

  if range-override != none {
    if type(range-override) == array {
      if range-override.len() >= 4 {
        min-r = ee-as-int(range-override.at(0), fallback: 0)
        min-c = ee-as-int(range-override.at(1), fallback: 0)
        max-r = ee-as-int(range-override.at(2), fallback: 0)
        max-c = ee-as-int(range-override.at(3), fallback: 0)
      }
    } else if type(range-override) == dictionary {
      min-r = ee-as-int(range-override.at("startRow", default: 0), fallback: 0)
      min-c = ee-as-int(range-override.at("startColumn", default: 0), fallback: 0)
      max-r = ee-as-int(range-override.at("endRow", default: 0), fallback: 0)
      max-c = ee-as-int(range-override.at("endColumn", default: 0), fallback: 0)
    }
    if min-r < 0 { min-r = 0 }
    if min-c < 0 { min-c = 0 }
  } else {
    for (r-str, cols) in cell-data {
      let r = ee-as-int(r-str, fallback: -1)
      if r < 0 or type(cols) != dictionary { continue }
      for (c-str, cell) in cols {
        let c = ee-as-int(c-str, fallback: -1)
        if c < 0 or cell == none or type(cell) != dictionary { continue }
        let txt = extract-cell-text(cell)
        let has-style = "s" in cell and cell.s != none
        let has-value = "v" in cell and cell.v != none
        let has-formula = has-live-formula(cell)
        if txt != "" or has-style or has-value or has-formula {
          if r > max-r { max-r = r }
          if c > max-c { max-c = c }
        }
      }
    }
    for m in merge-data {
      if type(m) != dictionary { continue }
      let sr = ee-as-int(m.at("startRow", default: 0), fallback: 0)
      let sc = ee-as-int(m.at("startColumn", default: 0), fallback: 0)
      let er = ee-as-int(m.at("endRow", default: sr), fallback: sr)
      let ec = ee-as-int(m.at("endColumn", default: sc), fallback: sc)
      if sr <= max-r or sc <= max-c {
        if er > max-r { max-r = er }
        if ec > max-c { max-c = ec }
      }
    }
  }

  if max-r < 0 or max-c < 0 {
    return align(center)[#text(fill: luma(120))[Empty Sheet]]
  }
  if max-r < min-r { max-r = min-r }
  if max-c < min-c { max-c = min-c }
  if repeat-rows > max-r - min-r + 1 { repeat-rows = max-r - min-r + 1 }

  // Visible columns: hidden columns leave the grid entirely.
  let vis-cols = ()
  for c in range(min-c, max-c + 1) {
    let cd = col-data.at(str(c), default: none)
    let col-hidden = type(cd) == dictionary and ee-is-on(cd.at("hd", default: 0))
    let col-width = if type(cd) == dictionary { ee-as-num(cd.at("w", default: default-w), fallback: default-w) } else { default-w }
    if not col-hidden and col-width > 0 { vis-cols.push(c) }
  }
  if vis-cols.len() == 0 {
    return align(center)[#text(fill: luma(120))[No Visible Columns]]
  }
  let col-visible = (:)
  for c in vis-cols { col-visible.insert(str(c), true) }
  let row-hidden-at(r) = {
    let rd = row-data.at(str(r), default: none)
    (type(rd) == dictionary and ee-is-on(rd.at("hd", default: 0))) or row-resolved-px(r, row-data, default-h) <= 0
  }

  // Effective column scale (from argument or range-override dict)
  let eff-scale = if column-scale != none and ee-as-num(column-scale, fallback: 0) > 0 { ee-as-num(column-scale, fallback: 1) }
    else if type(range-override) == dictionary and "columnScale" in range-override { ee-as-num(range-override.at("columnScale", default: 1), fallback: 1) }
    else { 1 }

  // Column widths scaled to fit
  let col-widths = vis-cols.map(c => {
    let w = default-w
    let cd = col-data.at(str(c), default: none)
    if type(cd) == dictionary {
      let cw = ee-as-num(cd.at("w", default: default-w), fallback: default-w)
      w = cw
    }
    w * 0.75pt * eff-scale
  })

  // Merges mapping (validated, clipped; spans count visible rows/cols only)
  let merges = (:)
  let skip-cells = (:)
  for m in merge-data {
    if type(m) != dictionary { continue }
    let sr = ee-as-int(m.at("startRow", default: 0), fallback: 0)
    let sc = ee-as-int(m.at("startColumn", default: 0), fallback: 0)
    let er = ee-as-int(m.at("endRow", default: sr), fallback: sr)
    let ec = ee-as-int(m.at("endColumn", default: sc), fallback: sc)
    if er < sr or ec < sc { continue }
    if sr > max-r or sc > max-c or er < min-r or ec < min-c { continue }
    let eff-start-r = calc.max(sr, min-r)
    let eff-start-c = calc.max(sc, min-c)
    let eff-end-r = calc.min(er, max-r)
    let eff-end-c = calc.min(ec, max-c)
    // Anchor must be printable; otherwise the whole merge stays hidden.
    if row-hidden-at(eff-start-r) { continue }
    if not (str(eff-start-c) in col-visible) { continue }
    let vis-rows = 0
    for r in range(eff-start-r, eff-end-r + 1) {
      if not row-hidden-at(r) { vis-rows = vis-rows + 1 }
    }
    let vis-span-cols = 0
    for c in range(eff-start-c, eff-end-c + 1) {
      if str(c) in col-visible { vis-span-cols = vis-span-cols + 1 }
    }
    if vis-rows == 0 or vis-span-cols == 0 { continue }

    let key = str(eff-start-r) + ":" + str(eff-start-c)
    merges.insert(key, (
      colspan: vis-span-cols,
      rowspan: vis-rows,
      r1: eff-start-r,
      r2: eff-end-r,
      c1: eff-start-c,
      c2: eff-end-c
    ))
    for r in range(eff-start-r, eff-end-r + 1) {
      for c in range(eff-start-c, eff-end-c + 1) {
        if r != eff-start-r or c != eff-start-c {
          skip-cells.insert(str(r) + ":" + str(c), true)
        }
      }
    }
  }

  // Spanned height: sum of resolved heights over the visible source rows,
  // each defaulting to the sheet default — the total row height, padding
  // included, exactly as Univer resolves it.
  let span-height-pt(span-r1, span-r2, default-h) = {
    let total = 0pt
    for rr in range(span-r1, span-r2 + 1) {
      if row-hidden-at(rr) { continue }
      total += row-resolved-px(rr, row-data, default-h) * 0.75pt
    }
    return total
  }

  // Render cells
  let header-cells = ()
  let body-cells = ()

  for r in range(min-r, max-r + 1) {
    if row-hidden-at(r) { continue }
    let row-height-pt = row-resolved-px(r, row-data, default-h) * 0.75pt

    for c in vis-cols {
      let key = str(r) + ":" + str(c)
      if key in skip-cells { continue }

      let cell = if str(r) in cell-data and type(cell-data.at(str(r))) == dictionary and str(c) in cell-data.at(str(r)) {
        cell-data.at(str(r)).at(str(c))
      } else {
        none
      }
      if cell != none and type(cell) != dictionary { cell = none }
      // Effective style composed property by property (default, column,
      // row, theme, cell) — partial styles inherit, like Univer.
      let st = compose-style(cell, r, c, row-data, col-data, styles, default-st)
      // Resolved row height (total, padding included): merged spans sum the
      // visible source rows, each defaulting to the sheet default.
      let span-m = merges.at(key, default: none)
      let rh = if span-m != none and span-m.at("rowspan", default: 1) > 1 {
        span-height-pt(span-m.at("r1", default: r), span-m.at("r2", default: r), default-h)
      } else {
        row-height-pt
      }
      // Explicit rows never grow (see row-explicit-at). A multi-row span
      // is explicit only when every visible spanned row is.
      let span-is-explicit = if span-m == none or span-m.at("rowspan", default: 1) <= 1 {
        row-explicit-at(r, row-data)
      } else {
        let flags = range(span-m.at("r1", default: r), span-m.at("r2", default: r) + 1).map(rr => row-hidden-at(rr) or row-explicit-at(rr, row-data))
        not (false in flags)
      }
      // Cell padding: the resolved height is the total row height, so the
      // content block below reserves rh minus the vertical inset.
      let pd-dict = if st != none and type(st.at("pd", default: none)) == dictionary { st.pd } else { none }
      let inset-top = if pd-dict == none { 3pt } else { ee-as-num(pd-dict.at("t", default: 3), fallback: 3) * 0.75pt }
      let inset-bottom = if pd-dict == none { 3pt } else { ee-as-num(pd-dict.at("b", default: 3), fallback: 3) * 0.75pt }
      let v-pad = inset-top + inset-bottom
      // Absent cells still paint their inherited styles and occupy the saved
      // grid geometry, but have no text to format, align, rotate or measure.
      let cell-content = if cell == none {
        block(width: 100%, height: calc.max(rh - v-pad, 1pt), breakable: false)[]
      } else {
        let is-rotated = rotation-angle(st) != 0

        // Text direction: td 1 ltr / 2 rtl, else the sheet RTL flag.
        let td = if st != none { st.at("td", default: 0) } else { 0 }
        let dir = if td == 2 or (td != 1 and sheet-rtl) { rtl } else if td == 1 { ltr } else { auto }

        // Cell values & types
        let cv = if cell != none { cell.at("v", default: none) } else { none }
        let ct = if cell != none { cell.at("t", default: none) } else { none }
        let is-numeric = ct != 4 and ct != 3 and (type(cv) == int or type(cv) == float or ct == 2)
        let is-bool = ct == 3 or type(cv) == bool

        // Adjacent cell content detection (for safe, non-colliding overflow)
        let last-c = if span-m != none { span-m.at("c2", default: c) } else { c }
        let first-c = if span-m != none { span-m.at("c1", default: c) } else { c }
        let right-has-content = (last-c < max-c and cell-has-content(r, last-c + 1, cell-data))
        let left-has-content = (first-c > min-c and cell-has-content(r, first-c - 1, cell-data))

        // Wrap strategy (tb: 0 Unspecified, 1 Overflow, 2 Clip, 3 Wrap)
        let tb-mode = if st != none { st.at("tb", default: 0) } else { 0 }
        let is-explicit-wrap = st != none and st.at("tb", default: 0) == 3
        let is-header-row = (r - min-r) < repeat-rows
        let auto-wrap-text = not is-numeric and not is-bool and tb-mode != 2 and (is-header-row or right-has-content)
        let is-wrapped = is-explicit-wrap or auto-wrap-text

        // Formula cells show the cached value; otherwise rich runs style the stream.
        let stream = rich-stream(cell)
        let runs = if stream == none { () } else { rich-runs(cell) }
        let use-runs = stream != none and runs.len() > 0
        let body-text = if use-runs { stream } else { cell-display-text(cell, st) }
        let body-runs = if use-runs { runs } else { () }

        let sec-fill = section-fill-for(cell, st)
        let rot-now = rotation-angle(st)
        let body = if is-wrapped and rot-now != 0 {
          let wrap-w = calc.max(rh - ee-doc-margin(st, "l", 2) - ee-doc-margin(st, "r", 2), 1pt)
          render-cell-body(body-text, body-runs, st, dir: dir, is-wrapped: true, sec-fill: sec-fill, wrap-width: wrap-w)
        } else {
          render-cell-body(body-text, body-runs, st, dir: dir, is-wrapped: is-wrapped, sec-fill: sec-fill)
        }
        body = apply-rotation(body, st, rh - v-pad)

        // Alignment resolution (explicit ht wins; General infers from type/rotation)
        let ht-raw = if st != none { st.at("ht", default: 0) } else { 0 }
        let is-justified = ht-raw == 4 or ht-raw == 5 or ht-raw == 6
        let tr-d = if st != none { st.at("tr", default: none) } else { none }
        let tr-a = if type(tr-d) == dictionary { ee-as-num(tr-d.at("a", default: 0), fallback: 0) } else { 0 }
        let tr-v = is-vertical-text(st)
        let h-align = if ht-raw == 1 or ht-raw == "l" { left }
          else if ht-raw == 2 or ht-raw == "c" { center }
          else if ht-raw == 3 or ht-raw == "r" { right }
          else if is-justified { left }
          else if tr-v { center }
          else if (tr-a > 0 and tr-a != 90) or tr-a == -90 { right }
          else if is-numeric { right }
          else if is-bool { center }
          else { left }
        if is-justified { body = par(justify: true, body) }
        let v-align = if st != none {
          let vt = st.at("vt", default: 0)
          if vt == 1 { top } else if vt == 2 { horizon } else { bottom }
        } else { bottom }

        // Neighbor-aware overflow: numbers NEVER overflow; text only overflows if neighbor is truly empty.
        let can-overflow = if is-wrapped or tb-mode == 2 or is-numeric or is-bool {
          false
        } else if h-align == right {
          first-c > min-c and not left-has-content
        } else if h-align == center {
          (first-c > min-c and not left-has-content) and (last-c < max-c and not right-has-content)
        } else {
          last-c < max-c and not right-has-content
        }

        let overflow-extra-w = 0pt
        if can-overflow and h-align != right {
          let check-c = last-c + 1
          while check-c <= max-c {
            if not (str(check-c) in col-visible) { check-c += 1; continue }
            if cell-has-content(r, check-c, cell-data) { break }
            let cd-check = col-data.at(str(check-c), default: none)
            let check-w = if type(cd-check) == dictionary { ee-as-num(cd-check.at("w", default: default-w), fallback: default-w) } else { default-w }
            overflow-extra-w += check-w * 0.75pt * eff-scale
            check-c += 1
          }
        }

        let cell-inner = [#if cell != none { metadata(cell.at("_ee_print_id", default: "")) }#body]
        let fixed-h = calc.max(rh - v-pad, 1pt)
        let cell-content = if not is-rotated {
          if is-wrapped {
            if span-is-explicit {
              box(width: 100%, height: fixed-h, clip: true, align(h-align + v-align, cell-inner))
            } else {
              block(width: 100%, breakable: false, align(h-align + v-align, cell-inner))
            }
          } else if can-overflow and overflow-extra-w > 0pt {
            box(width: 100% + overflow-extra-w, height: fixed-h, clip: true, align(h-align + v-align, cell-inner))
          } else if can-overflow {
            block(width: 100%, height: fixed-h, breakable: false, align(h-align + v-align, cell-inner))
          } else {
            box(width: 100%, height: fixed-h, clip: true, align(h-align + v-align, cell-inner))
          }
        } else if span-is-explicit {
          ee-rotated-frame(cell-inner, h-align, v-align, fixed-h, tb-mode == 2)
        } else {
          block(width: 100%, align(h-align + v-align, cell-inner))
        }

        cell-content
      }

      // Spans & Fill
      let m = span-m
      let colspan = if m != none { m.colspan } else { 1 }
      let rowspan = if m != none { m.rowspan } else { 1 }
      let bg = if st != none { parse-color(st.at("bg", default: none)) } else { none }

      // Borders mirror the installed cache (engine-render
      // _setBorderProps/_setMergeBorderProps): each side comes from its own
      // cell's composed style. Explicit NONE (s: 0) and absent sides both
      // omit the override, inheriting the table gridline — installed draws
      // nothing for NONE over separately painted gridlines. White top/left
      // edges are dropped when the facing neighbor edge exists (Excel
      // compat, univer pro/issues/344). Merged perimeters read each edge
      // cell's own style; a heterogeneous side keeps the first defined
      // segment (Typst draws one stroke per merged edge). Shared-edge
      // conflicts between two custom sides resolve per Typst's table rule
      // (probed in test-orange-wrap; installed paints both, later
      // row-major on top). Gridlines stay the lower-priority table default
      // (never stroke:auto, which the installed compiler rejects — the
      // argument is omitted when no custom side exists).
      let strokes = (:)
      let doubled = (:)
      let own-bd = if st != none and type(st.at("bd", default: none)) == dictionary { st.at("bd") } else { (:) }
      // Facing-neighbor edge presence (white suppression). Neighbor style
      // data is read directly; composition matches the main path.
      let facing-present(nr, nc, nside) = {
        let ncell = if str(nr) in cell-data and type(cell-data.at(str(nr))) == dictionary and str(nc) in cell-data.at(str(nr)) and type(cell-data.at(str(nr)).at(str(nc))) == dictionary {
          cell-data.at(str(nr)).at(str(nc))
        } else { none }
        let nst = compose-style(ncell, nr, nc, row-data, col-data, styles, default-st)
        let nbd = if nst != none and type(nst.at("bd", default: none)) == dictionary { nst.at("bd") } else { (:) }
        nside in nbd
      }
      let edge-is-white(bside) = {
        let wc = parse-color(bside.at("cl", default: none), theme: true)
        wc != none and wc == rgb("#ffffff")
      }
      // Merged perimeter side from its edge cells' own composed styles
      // (installed _setMergeBorderProps): first defined segment wins.
      let merge-edge(ukey) = {
        let r1 = span-m.at("r1", default: r)
        let r2 = span-m.at("r2", default: r)
        let c1 = span-m.at("c1", default: c)
        let c2 = span-m.at("c2", default: c)
        let poses = if ukey == "t" { range(c1, c2 + 1).map(cc => (r: r1, c: cc)) }
          else if ukey == "b" { range(c1, c2 + 1).map(cc => (r: r2, c: cc)) }
          else if ukey == "l" { range(r1, r2 + 1).map(rr => (r: rr, c: c1)) }
          else { range(r1, r2 + 1).map(rr => (r: rr, c: c2)) }
        let found = none
        for pos in poses {
          let pcell = if str(pos.r) in cell-data and type(cell-data.at(str(pos.r))) == dictionary and str(pos.c) in cell-data.at(str(pos.r)) and type(cell-data.at(str(pos.r)).at(str(pos.c))) == dictionary {
            cell-data.at(str(pos.r)).at(str(pos.c))
          } else { none }
          let pst = compose-style(pcell, pos.r, pos.c, row-data, col-data, styles, default-st)
          let pbd = if pst != none and type(pst.at("bd", default: none)) == dictionary { pst.at("bd") } else { (:) }
          if found == none and ukey in pbd { found = pbd.at(ukey) }
        }
        found
      }
      let is-merged-cell = span-m != none and (span-m.at("rowspan", default: 1) > 1 or span-m.at("colspan", default: 1) > 1)
      for (side-key, side-name) in (("t", "top"), ("r", "right"), ("b", "bottom"), ("l", "left")) {
        let bside = if is-merged-cell { merge-edge(side-key) }
          else if side-key in own-bd { own-bd.at(side-key) }
          else { none }
        if bside == none { continue }
        // White top/left suppression against the facing neighbor edge.
        if side-key == "t" and edge-is-white(bside) and facing-present(r - 1, c, "b") { continue }
        if side-key == "l" and edge-is-white(bside) and facing-present(r, c - 1, "r") { continue }
        let side = decode-border-side(bside)
        if side != none { strokes.insert(side-name, side) }
        if border-is-double(bside) { doubled.insert(side-name, border-ink(bside)) }
      }
      // Gridlines belong to the table default, not a neighboring cell
      // override: otherwise they can erase a custom shared-edge border.

      // Padding (pd, px) — vertical parts shared with the content block above.
      let cell-inset = if pd-dict == none { (x: 4pt, y: 3pt) } else { (
        top: inset-top,
        bottom: inset-bottom,
        left: ee-as-num(pd-dict.at("l", default: 4), fallback: 4) * 0.75pt,
        right: ee-as-num(pd-dict.at("r", default: 4), fallback: 4) * 0.75pt
      ) }

      // DOUBLE inner strokes overlay the framed content (the outer stroke
      // is the table-cell edge emitted below).
      if doubled.len() > 0 {
        let last-col = if m != none { m.at("c2", default: c) } else { c }
        let cell-width = 0pt
        for (i, vc) in vis-cols.enumerate() {
          if vc >= c and vc <= last-col { cell-width += col-widths.at(i) }
        }
        cell-content = double-inner(cell-content, doubled, cell-inset, rh, cell-width)
      }

      let final-cell = table.cell(
        colspan: colspan,
        rowspan: rowspan,
        fill: bg,
        ..(if strokes.len() > 0 { (stroke: strokes) } else { (:) }),
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
      stroke: if show-gridlines { 0.75pt + grid-color } else { none },
      columns: col-widths,
      table.header(repeat: true, ..header-cells),
      ..body-cells
    )
  } else {
    table(
      stroke: if show-gridlines { 0.75pt + grid-color } else { none },
      columns: col-widths,
      ..body-cells
    )
  }

  let overlay-images = if type(images) == array and images.len() > 0 {
    for img in images [
      #if type(img) == dictionary [
        #let dx = ee-as-num(img.at("relLeftPx", default: img.at("left", default: 0)), fallback: 0)
        #let dy = ee-as-num(img.at("relTopPx", default: img.at("top", default: 0)), fallback: 0)
        #let img-w = ee-as-num(img.at("width", default: 0), fallback: 0)
        #let img-h = ee-as-num(img.at("height", default: 0), fallback: 0)
        #let img-path = img.at("path", default: "")
        #if type(img-path) == str and img-path != "" and img-w > 0 and img-h > 0 [
          #place(
            top + left,
            dx: dx * 0.75pt,
            dy: dy * 0.75pt,
            image(img-path, width: img-w * 0.75pt, height: img-h * 0.75pt)
          )
        ]
      ]
    ]
  } else { none }

  block[
    #table-element
    #overlay-images
  ]
}
