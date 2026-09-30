// No-wrap layout experiment: executable proof for the renderer's measured
// natural-width line (scripts use it; this suite proves it).
//
// Each probe compiles a minimal Typst source over the shipped prelude and
// asserts geometry on the SVG scene:
//   1. measured content cannot width-wrap (spaces, CJK, hyphens, emoji,
//      mixed direction in a 60pt block stay one band)
//   2. explicit newlines still break (separate logical lines)
//   3. natural width/height are measurable and nonzero (rendered numbers)
//   4. rotation applies to that measured content (signed 45)
//   5. alignment positions the final content (right edge anchors)
//   6. CLIP restricts painting to the intended rectangle
//   7. long content stays one line past the 20000pt measure base (growth
//      branch) and near the 100000pt ceiling (repeated doubling):
//      spaced text, long unbroken words, CJK and rich styles
//   8. measurement cost: a 300-line stress doc compiles within a generous
//      bound (guards accidental re-measure blowup, not a regression gate)
// Sources save BEFORE asserts; failures print full compiler diagnostics.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const { parseSvgScene } = require('./svg-scene.cjs')

const root = path.resolve(__dirname, '..')
const artifactDir = path.join(__dirname, 'output', 'nowrap-layout')
const bare = (s) => String(s).replace(/[\s\u200b]+/g, '')

const formatCompilerError = (err) => {
  try {
    const own = err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : []
    const info = {}
    for (const key of own) {
      try { info[key] = String(err[key]).slice(0, 2000) } catch { /* keep partial */ }
    }
    return JSON.stringify(info).slice(0, 4000)
  } catch {
    return String(err && err.message ? err.message : err)
  }
}

// Font fallback changes box centers even on one baseline. Require a shared
// vertical interval covering at least half the shortest run, rather than
// treating each font's center as its baseline. Explicit-newline probes below
// ensure genuinely separate lines are still separated.
function bandsOf(texts) {
  const bands = []
  for (const t of [...texts].sort((p, q) => p.cy - q.cy)) {
    const last = bands[bands.length - 1]
    const lo = last ? Math.max(last.lo, t.y0) : t.y0
    const hi = last ? Math.min(last.hi, t.y1) : t.y1
    const minHeight = last ? Math.min(last.minHeight, t.y1 - t.y0) : t.y1 - t.y0
    if (last && hi - lo >= minHeight * 0.5) {
      last.runs.push(t)
      last.lo = lo; last.hi = hi; last.minHeight = minHeight
    } else bands.push({ cy: t.cy, lo: t.y0, hi: t.y1, minHeight, runs: [t] })
  }
  return bands
}

async function main() {
  console.log('--- No-wrap layout experiment ---')
  fs.mkdirSync(artifactDir, { recursive: true })
  const prelude = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/univerSheet.typ'), 'utf8')
  const longLine = 'w '.repeat(60) + 'well-known 中文混合 \u{1F600} tail'
  // ~54000pt at 11pt: spaced latin + CJK + a 5000-char unbroken word.
  // Past the 20000pt base, forces repeated doubling (stability check).
  const longGrowth = `${'w '.repeat(500)}${'中'.repeat(2000)}${'x'.repeat(5000)}`
  // ~93000pt at 11pt: forces repeated doubling up to the 100000pt ceiling.
  const longCeiling = `${'w '.repeat(1000)}${'中'.repeat(8000)}`
  // Rich-styled long line (~42000pt): bold + italic + underline runs with
  // CJK tail. Measurement applies to the complete styled line, never runs.
  const richSegs = [`#text(weight: "bold")[${'Bold '.repeat(400)}]`, `#text(style: "italic")[${'tilt '.repeat(400)}]`, `#underline[${'line '.repeat(400)}]`, `${'中'.repeat(1500)}`]
  const longRichSource = `#natural([${richSegs.join('')}])`
  const longRichText = `${'Bold '.repeat(400)}${'tilt '.repeat(400)}${'line '.repeat(400)}${'中'.repeat(1500)}`
  const stressLines = Array.from({ length: 300 }, (_, i) =>
    `#natural("line ${i} w well-known 中文混合 \u{1F600} tail ${'x'.repeat(i % 40)}")`).join('\n\n')
  const probes = [
    ['core', `#block(width: 60pt, [#natural("A plain \u{1F600} well-known 中文 العربية")])`],
    ['newlines', `#natural("first line")#linebreak()#natural("second")`],
    ['measure', `#context { let m = measure(natural("A 中文 well-known \u{1F600}")); [MEASURED w=#m.width h=#m.height] }`],
    ['rotation', `#rotate(45deg, natural("Rotate 123 中"))`],
    ['alignment', `#block(width: 200pt, [#align(right, natural("${longLine}"))])`],
    ['clip', `#box(width: 100pt, height: 24pt, clip: true, natural("${longLine}"))`],
    ['long-growth', `#natural("${longGrowth}")`],
    ['long-ceiling', `#natural("${longCeiling}")`],
    ['long-rich', longRichSource],
    ['cost', stressLines]
  ]
  const compiler = NodeCompiler.create({ workspace: root })
  const scenes = {}
  const raws = {}
  const durations = {}
  try {
    for (const [name, body] of probes) {
      const source = `${prelude}\n#set page(margin: 20pt)\n// nowrap experiment: ${name}\n${body}\n`
      const probePath = path.join(artifactDir, `nowrap-${name}.typ`)
      fs.writeFileSync(probePath, source)
      let svg
      const started = Date.now()
      try {
        svg = compiler.svg({ mainFileContent: source, inputs: {} })
      } catch (err) {
        console.error(`[nowrap:${name}] Typst compile failed: ${formatCompilerError(err)}`)
        console.error(`[nowrap:${name}] failing source saved at ${probePath}`)
        throw err
      }
      durations[name] = Date.now() - started
      scenes[name] = parseSvgScene(svg)
      raws[name] = svg
    }
  } finally {
    compiler.resetShadow()
  }

  // 1. No width-driven wrap: every run shares one band, order preserved.
  const coreBands = bandsOf(scenes.core.texts)
  assert.equal(coreBands.length, 1, `nowrap core single band (saw ${coreBands.length})`)
  const coreText = coreBands[0].runs.sort((p, q) => p.x0 - q.x0).map((t) => bare(t.text)).join('')
  assert.equal(coreText, 'Aplain\u{1F600}well-known中文العربية', 'nowrap core order preserved')
  console.log('✓ 1. natural-width line cannot width-wrap (spaces/CJK/hyphen/emoji/RTL)')

  // 2. Explicit newlines still break.
  const nlBands = bandsOf(scenes.newlines.texts)
  assert.equal(nlBands.length, 2, 'explicit newline breaks')
  const nlText = (band) => bare(band.runs.sort((p, q) => p.x0 - q.x0).map((t) => t.text).join(''))
  assert.equal(nlText(nlBands[0]), 'firstline', 'line one text')
  assert.equal(nlText(nlBands[1]), 'second', 'line two text')
  console.log('✓ 2. explicit newlines honored')

  // 3. Natural extents measurable and nonzero (numbers rendered by Typst).
  const measured = scenes.measure.texts.map((t) => t.text).join(' ')
  const nums = [...measured.matchAll(/([\d.]+)pt/g)].map((m) => Number(m[1]))
  assert.ok(nums.length >= 2 && nums.every((n) => n > 0), `measured extents nonzero (${measured})`)
  console.log(`✓ 3. measurable natural size (${nums.map((n) => n.toFixed(1)).join(' x ')}pt)`)

  // 4. Rotation applies to the constructed content.
  const rotRuns = scenes.rotation.texts.filter((t) => bare(t.text).length > 0)
  assert.ok(rotRuns.length > 0, 'rotated runs exist')
  assert.ok(rotRuns.some((t) => t.rots.some((a) => Math.abs(a - 45) < 4)), 'signed 45 rotation present')
  assert.ok(rotRuns.every((t) => t.x1 - t.x0 > 0 && t.y1 - t.y0 > 0), 'rotated extents nonzero')
  console.log('✓ 4. rotation applies with nonzero extents')

  // 5. Right alignment anchors the over-wide line at the block edge.
  const alignMax = Math.max(...scenes.alignment.texts.map((t) => t.x1))
  assert.ok(Math.abs(alignMax - (20 + 200)) < 4, `right edge anchors at page margin + 200 (saw ${alignMax.toFixed(1)})`)
  console.log('✓ 5. alignment positions over-wide content')

  // 6. CLIP restricts painting to the intended rectangle: the backend
  // must gate paint behind a clip path matching the box (SVG FO rects
  // report unclipped line extents, so structure, not x1, is asserted).
  const clipPaths = [...raws.clip.matchAll(/<clipPath[^>]*>([\s\S]*?)<\/clipPath>/g)]
  assert.ok(clipPaths.length > 0, 'clip backend emits a clip path')
  const rects = [...clipPaths[0][1].matchAll(/width="([\d.]+)"[^>]*height="([\d.]+)"|height="([\d.]+)"[^>]*width="([\d.]+)"/g)]
  const rectMatches = rects.some((m) => {
    const w = Number(m[1] ?? m[4])
    const h = Number(m[2] ?? m[3])
    return Math.abs(w - 100) < 3 && Math.abs(h - 24) < 3
  })
  // This backend emits a rectangle as a closed M/L path rather than <rect>.
  const pathMatches = /<path\b[^>]*d="M 0 0(?: M 0 0)? L 100 0 L 100 24 L 0 24 Z\s*"/.test(clipPaths[0][1])
  assert.ok(rectMatches || pathMatches, `clip path matches the 100x24 box (${JSON.stringify(clipPaths[0][1].slice(0, 160))})`)
  const clipId = /\bid="([^"]+)"/.exec(clipPaths[0][0])?.[1]
  assert.ok(clipId && raws.clip.includes(`clip-path="url(#${clipId})"`), 'rectangle clip is applied to rendered content')
  console.log('✓ 6. clip restricts painting to the cell rectangle')

  // 7. Long content stays one line past the base and near the ceiling:
  // the growth branch only refires measurement, never breaks the line.
  // Threshold kept at 0.5pt, never raised: stability across constraints
  // decides, and per-probe timings expose the extra layout passes.
  for (const [name, text] of [['long-growth', longGrowth], ['long-ceiling', longCeiling], ['long-rich', longRichText]]) {
    const bands = bandsOf(scenes[name].texts)
    assert.equal(bands.length, 1, `${name} single band (saw ${bands.length})`)
    const spelled = bands[0].runs.sort((p, q) => p.x0 - q.x0).map((t) => t.text).join('')
    assert.equal(bare(spelled), bare(text), `${name} order preserved end to end`)
  }
  console.log(`✓ 7. long content unbroken past base and near ceiling (growth ${durations['long-growth']}ms, ceiling ${durations['long-ceiling']}ms, rich ${durations['long-rich']}ms)`)

  // 8. Measurement cost: 300 mixed lines compile inside a generous bound.
  // This guards accidental re-measure blowup, not a regression threshold.
  const costMs = durations.cost
  assert.ok(scenes.cost.texts.length >= 300, `stress lines rendered (${scenes.cost.texts.length})`)
  assert.ok(costMs < 120000, `stress compile within bound (saw ${costMs}ms)`)
  console.log(`✓ 8. measurement cost (${costMs}ms for 300 lines, ${(costMs / 300).toFixed(1)}ms/line)`)

  console.log('\nPASS: no-wrap layout experiment (8 properties)')
}

main().catch((err) => { console.error(err); process.exit(1) })
