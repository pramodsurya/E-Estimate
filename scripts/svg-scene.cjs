// Shared SVG scene reader for Typst-compiled sheet proofs.
// foreignObject rects are text LAYOUT (selection) boxes, not exact painted
// glyph bounds: callers must keep explicit tolerances on containment/edge
// asserts. Table-stroke segments exclude <defs> glyph outlines and
// unstroked fills; filled rects are collected separately (fills) for fill
// asserts; element-level transforms compose over ancestors. Segment paint
// (stroke color/width/dash) rides alongside coordinates, additively.
const assert = require('node:assert/strict')

// ---- SVG scene: foreignObject texts + segments, ancestors composed ----

function matMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}
const IDENT = [1, 0, 0, 1, 0, 0]

function parseTransformList(t) {
  let m = IDENT.slice()
  const rots = []
  const re = /(\w+)\(([^)]*)\)/g
  let part
  while ((part = re.exec(t))) {
    const nums = part[2].split(/[\s,]+/).filter(Boolean).map(Number)
    const name = part[1]
    if (name === 'translate') {
      m = matMul(m, [1, 0, 0, 1, nums[0] || 0, nums.length > 1 ? nums[1] : 0])
    } else if (name === 'matrix' && nums.length === 6) {
      m = matMul(m, nums)
      const ang = Math.atan2(nums[1], nums[0]) * 180 / Math.PI
      // Record any non-trivial rotation (backends may emit rotate() as a
      // matrix); identity/scale/translate matrices yield ~0 and are skipped.
      if (Math.abs(ang) > 3) rots.push(Math.round(ang))
    } else if (name === 'rotate') {
      const a = (nums[0] || 0) * Math.PI / 180
      const cx = nums.length > 2 ? nums[1] : 0
      const cy = nums.length > 2 ? nums[2] : 0
      const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
      m = matMul(m, matMul([1, 0, 0, 1, cx, cy], matMul(r, [1, 0, 0, 1, -cx, -cy])))
      rots.push(Math.round(nums[0] || 0))
    } else if (name === 'scale') {
      const sx = nums[0] || 1
      m = matMul(m, [sx, 0, 0, nums.length > 1 ? nums[1] : sx, 0, 0])
    } else {
      throw new Error(`unsupported SVG transform form: ${name}(...) — cannot resolve coordinates`)
    }
  }
  return { mat: m, rots }
}

function parseAttrs(s) {
  const out = {}
  const re = /([\w:-]+)="([^"]*)"/g
  let m
  while ((m = re.exec(s))) out[m[1]] = m[2]
  return out
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function applyMat(mat, x, y) {
  return [mat[0] * x + mat[2] * y + mat[4], mat[1] * x + mat[3] * y + mat[5]]
}

// Texts (foreignObject inner text with composed rect corners) and axis-
// aligned segments (gridlines), ancestor transforms always composed. A
// foreignObject rect is the text LAYOUT (selection) box, not exact painted
// glyph bounds: containment and edge asserts below always carry an explicit
// tolerance and never demand exact ink equality.
function parseSvgScene(svg) {
  const texts = []
  const segs = []
  const fills = []
  let skippedDefs = 0
  let skippedUnstroked = 0
  const stack = [{ mat: IDENT.slice(), rots: [], font: null }]
  const openRe = /<(\/?)(g|defs|foreignObject|line|rect|path)([^>]*)>/g
  let m
  let defsDepth = 0
  // Table strokes are stroked elements: a filled-only rect/path is a fill
  // or a glyph outline — not a gridline — so rect/path require explicit
  // stroke paint (line elements are strokes by construction and need no
  // gate). Glyph outlines additionally live inside <defs>.
  const hasStroke = (attrs) => {
    if (attrs.stroke !== undefined) {
      const s = attrs.stroke.trim().toLowerCase()
      return s !== '' && s !== 'none'
    }
    const sm = /stroke\s*:\s*([^;]+)/i.exec(attrs.style || '')
    if (sm) return sm[1].trim().toLowerCase() !== 'none'
    return false
  }
  // Ancestor matrix composed with the element's own transform. foreignObject
  // already did this; line/rect/path dropped element transforms, misplacing
  // gridlines whenever the backend puts translation on the element itself.
  const elemMat = (attrs) => {
    const top = stack[stack.length - 1]
    if (!attrs.transform) return top.mat
    return matMul(top.mat, parseTransformList(attrs.transform).mat)
  }
  // Paint carried per segment (additive: existing x1/y1/x2/y2 fields
  // unchanged). Fill rects are collected separately for fill asserts.
  const paintOf = (attrs) => {
    const pick = (name) => {
      if (attrs[name] !== undefined) return attrs[name]
      const sm = new RegExp(name + '\\s*:\\s*([^;]+)', 'i').exec(attrs.style || '')
      return sm ? sm[1] : undefined
    }
    const stroke = pick('stroke')
    const dash = pick('stroke-dasharray')
    const fill = pick('fill')
    return {
      stroke: stroke === undefined ? null : String(stroke).trim(),
      width: num(pick('stroke-width')),
      dash: dash === undefined ? null : String(dash).trim(),
      fill: fill === undefined ? null : String(fill).trim()
    }
  }
  const pushSeg = (mat, x1, y1, x2, y2, paint) => {
    const [ax, ay] = applyMat(mat, x1, y1)
    const [bx, by] = applyMat(mat, x2, y2)
    if (Math.abs(ax - bx) < 0.75 || Math.abs(ay - by) < 0.75) {
      segs.push({ x1: ax, y1: ay, x2: bx, y2: by, paint: paint || null })
    }
  }
  const pushFill = (mat, x, y, w, h, fill) => {
    const corners = [applyMat(mat, x, y), applyMat(mat, x + w, y), applyMat(mat, x, y + h), applyMat(mat, x + w, y + h)]
    const xs = corners.map((p) => p[0])
    const ys = corners.map((p) => p[1])
    fills.push({
      x0: Math.min(...xs), x1: Math.max(...xs),
      y0: Math.min(...ys), y1: Math.max(...ys),
      fill
    })
  }
  while ((m = openRe.exec(svg))) {
    const closing = m[1] === '/'
    const kind = m[2]
    const attrs = parseAttrs(m[3])
    if (kind === 'g' && !closing) {
      const top = stack[stack.length - 1]
      let mat = top.mat
      let rots = top.rots.slice()
      if (attrs.transform) {
        const p = parseTransformList(attrs.transform)
        mat = matMul(top.mat, p.mat)
        rots = rots.concat(p.rots)
      }
      stack.push({ mat, rots, font: attrs['font-family'] || top.font })
    } else if (kind === 'g' && closing) {
      if (stack.length > 1) stack.pop()
    } else if (kind === 'defs') {
      if (closing) { defsDepth = Math.max(0, defsDepth - 1) }
      else if (!/\/\s*$/.test(m[3])) { defsDepth += 1 }
    } else if (defsDepth > 0) {
      // Inside <defs>: glyph outlines and symbols are font coordinates, not
      // rendered table strokes. A skipped foreignObject still advances the
      // scan cursor past its closing tag so inner tags never leak out.
      if (kind === 'foreignObject' && !closing) {
        const closeIdx = svg.indexOf('</foreignObject>', openRe.lastIndex)
        if (closeIdx >= 0) openRe.lastIndex = closeIdx + 16
      } else if ((kind === 'line' || kind === 'rect' || kind === 'path') && !closing) {
        skippedDefs += 1
      }
    } else if (kind === 'foreignObject' && !closing) {
      const top = stack[stack.length - 1]
      const closeIdx = svg.indexOf('</foreignObject>', openRe.lastIndex)
      if (closeIdx < 0) continue
      const inner = svg.slice(openRe.lastIndex, closeIdx).replace(/<[^>]*>/g, '')
      openRe.lastIndex = closeIdx + 16
      const x = num(attrs.x)
      const y = num(attrs.y)
      const w = num(attrs.width)
      const h = num(attrs.height)
      if (x === null || y === null || w === null || h === null) continue
      // Transforms may sit on the element itself, not only on ancestors.
      let emat = top.mat
      let erots = top.rots.slice()
      let efont = top.font
      if (attrs.transform) {
        const p = parseTransformList(attrs.transform)
        emat = matMul(top.mat, p.mat)
        erots = erots.concat(p.rots)
      }
      const corners = [applyMat(emat, x, y), applyMat(emat, x + w, y), applyMat(emat, x, y + h), applyMat(emat, x + w, y + h)]
      const xs = corners.map((p) => p[0])
      const ys = corners.map((p) => p[1])
      texts.push({
        x0: Math.min(...xs), x1: Math.max(...xs),
        y0: Math.min(...ys), y1: Math.max(...ys),
        cx: (Math.min(...xs) + Math.max(...xs)) / 2,
        cy: (Math.min(...ys) + Math.max(...ys)) / 2,
        lw: w,
        lh: h,
        mat: emat,
        rots: erots,
        font: attrs['font-family'] || efont,
        text: inner
      })
    } else if (kind === 'line' && !closing) {
      const x1 = num(attrs.x1)
      const y1 = num(attrs.y1)
      const x2 = num(attrs.x2)
      const y2 = num(attrs.y2)
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      // A line element is a stroke by construction (SVG cannot fill a line),
      // so no paint gate here — only the <defs> exclusion above applies.
      pushSeg(elemMat(attrs), x1, y1, x2, y2, paintOf(attrs))
    } else if (kind === 'rect' && !closing) {
      const x = num(attrs.x)
      const y = num(attrs.y)
      const w = num(attrs.width)
      const h = num(attrs.height)
      if (x === null || y === null || w === null || h === null) continue
      const rp = paintOf(attrs)
      if (rp.fill && rp.fill.toLowerCase() !== 'none') pushFill(elemMat(attrs), x, y, w, h, rp.fill)
      if (!hasStroke(attrs)) { skippedUnstroked += 1; continue }
      const em = elemMat(attrs)
      pushSeg(em, x, y, x + w, y, rp)
      pushSeg(em, x, y + h, x + w, y + h, rp)
      pushSeg(em, x, y, x, y + h, rp)
      pushSeg(em, x + w, y, x + w, y + h, rp)
    } else if (kind === 'path' && !closing && attrs.d) {
      const em = elemMat(attrs)
      const pp = paintOf(attrs)
      // Filled rect-shaped paths (table cell fills; the backend emits no
      // <rect>): collected as fills when every segment is axis-aligned and
      // the outline closes. Curves disqualify (tokenizer would misread
      // their numbers as line endpoints).
      if (pp.fill && pp.fill.toLowerCase() !== 'none' && !/[CcQqAaSsTtHhVv]/.test(attrs.d)) {
        const nums = [...attrs.d.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((m) => Number(m[0]))
        if (nums.length >= 8 && nums.length % 2 === 0) {
          const xs = nums.filter((_, i) => i % 2 === 0)
          const ys = nums.filter((_, i) => i % 2 === 1)
          const fx0 = Math.min(...xs)
          const fy0 = Math.min(...ys)
          const fx1 = Math.max(...xs)
          const fy1 = Math.max(...ys)
          // The backend closes a rectangle with Z without repeating its
          // first point. Require all four distinct corners and closure.
          const ux = [...new Set(xs.map((v) => Math.round(v * 100) / 100))]
          const uy = [...new Set(ys.map((v) => Math.round(v * 100) / 100))]
          const corners = new Set(xs.map((x, i) => `${Math.round(x * 100)}:${Math.round(ys[i] * 100)}`))
          if (ux.length === 2 && uy.length === 2 && corners.size === 4 &&
            /[Zz]\s*$/.test(attrs.d)) {
            pushFill(em, fx0, fy0, fx1 - fx0, fy1 - fy0, pp.fill)
          }
        }
      }
      if (!hasStroke(attrs)) { skippedUnstroked += 1; continue }
      const toks = attrs.d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []
      let pen = null
      let start = null
      let cmd = null
      const pt = (x, y) => {
        if (pen) pushSeg(em, pen[0], pen[1], x, y, pp)
        pen = [x, y]
      }
      let i = 0
      while (i < toks.length) {
        const t = toks[i++]
        if (/[MmLlHhVvZz]/.test(t)) {
          cmd = t
          if (cmd === 'Z' || cmd === 'z') {
            if (pen && start) pushSeg(em, pen[0], pen[1], start[0], start[1], pp)
            pen = start
          }
          continue
        }
        const n = parseFloat(t)
        const rel = cmd !== cmd.toUpperCase()
        const base = rel && pen ? pen : [0, 0]
        if (cmd === 'M' || cmd === 'm' || cmd === 'L' || cmd === 'l') {
          const n2 = parseFloat(toks[i++])
          const p = rel ? [base[0] + n, base[1] + n2] : [n, n2]
          if (cmd === 'L' || cmd === 'l') pt(p[0], p[1])
          else { pen = p; start = p }
        } else if (cmd === 'H' || cmd === 'h') {
          const p = rel ? [base[0] + n, base[1]] : [n, pen ? pen[1] : 0]
          pt(p[0], p[1])
        } else if (cmd === 'V' || cmd === 'v') {
          const p = rel ? [base[0], base[1] + n] : [pen ? pen[0] : 0, n]
          pt(p[0], p[1])
        }
      }
    }
  }
  return { texts, segs, fills, skippedDefs, skippedUnstroked }
}

// Length of a run's local height vector under its composed transform: the
// rendered line height. Unlike raw lh (which ignores ancestor scale, so
// equal local boxes at different point sizes compare equal) and unlike the
// AABB y1-y0 (which grows when a box rotates), the vector length is
// rotation-safe. Raw lw/lh keep their local meaning for orientation checks.
function textHeight(t) {
  const m = t.mat || IDENT
  return Math.hypot(m[2] * t.lh, m[3] * t.lh)
}

// First text run whose content includes the marker (whitespace-normalized).
function findText(texts, marker, label) {
  const norm = (s) => s.replace(/\s+/g, '')
  const hit = texts.find((t) => norm(t.text).includes(norm(marker)))
  if (!hit) {
    const sample = texts.map((t) => t.text).join('|').slice(0, 300)
    assert.fail(`${label}: marker ${marker} not found in SVG text runs (sample: ${sample})`)
  }
  return hit
}

function boundaries(segs) {
  const hs = segs.filter((s) => Math.abs(s.y1 - s.y2) < 0.75 && Math.abs(s.x2 - s.x1) > 0)
  const vs = segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.75 && Math.abs(s.y2 - s.y1) > 0)
  const maxH = Math.max(0, ...hs.map((s) => Math.abs(s.x2 - s.x1)))
  const maxV = Math.max(0, ...vs.map((s) => Math.abs(s.y2 - s.y1)))
  const uniq = (vals) => {
    const sorted = vals.slice().sort((a, b) => a - b)
    const out = []
    for (const v of sorted) {
      if (!out.length || v - out[out.length - 1] > 1.5) out.push(v)
    }
    return out
  }
  return {
    rows: uniq(hs.filter((s) => Math.abs(s.x2 - s.x1) > maxH * 0.4).map((s) => (s.y1 + s.y2) / 2)),
    cols: uniq(vs.filter((s) => Math.abs(s.y2 - s.y1) > maxV * 0.4).map((s) => (s.x1 + s.x2) / 2)),
    segCount: segs.length
  }
}

function bandContaining(bounds, v) {
  for (let i = 0; i + 1 < bounds.length; i++) {
    if (v >= bounds[i] - 2 && v <= bounds[i + 1] + 2) return i
  }
  return -1
}

module.exports = { matMul, parseTransformList, parseAttrs, parseSvgScene, findText, boundaries, bandContaining, textHeight }
