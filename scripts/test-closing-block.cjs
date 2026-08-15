// The closing block — signatures at the end of a subject — must never buy a
// sheet of its own. These tests drive the placement ladder against a fake print
// engine whose page counts are scripted, so every rung is exercised without
// needing Chromium.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const { PDFDocument } = require('pdf-lib')

const root = path.resolve(__dirname, '..')

/** Load a renderer TS module, transpiling relative TS imports on demand. */
const cache = new Map()
function loadTs(file) {
  const resolved = path.resolve(file)
  if (cache.has(resolved)) return cache.get(resolved)
  const source = fs.readFileSync(resolved, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: resolved
  })
  const loaded = new Module(resolved, module)
  loaded.filename = resolved
  loaded.paths = Module._nodeModulePaths(path.dirname(resolved))
  cache.set(resolved, loaded.exports)
  const shim = (request) =>
    request.startsWith('.')
      ? loadTs(path.join(path.dirname(resolved), `${request}.ts`))
      : require(request)
  new Function('module', 'exports', 'require', outputText)(loaded, loaded.exports, shim)
  cache.set(resolved, loaded.exports)
  return loaded.exports
}

const { renderSignedPdf } = loadTs(
  path.join(root, 'src/renderer/src/lib/closingBlock.ts')
)

const A4 = [595.28, 841.89]
async function blankPdf(pages) {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) doc.addPage(A4)
  return doc.save()
}

const MARGIN = 10 / 25.4
const options = {
  pageSize: 'A4',
  landscape: false,
  margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  printBackground: true,
  scale: 1,
  displayHeaderFooter: false,
  headerTemplate: '<span></span>',
  footerTemplate: '<span></span>',
  preferCSSPageSize: false
}

const rows = [
  { id: 'a', designation: 'Assistant Executive Engineer', office: 'Sub Division' },
  { id: 'b', designation: 'Executive Engineer', office: 'Irrigation Division' }
]
const subjectEnd = { enabled: true, placement: 'subject_end', rows }

const BODY = '<!doctype html><html><head></head><body><h3>Bund</h3></body></html>'

/** A print engine whose page count for each call is scripted in advance. */
function engine(counts) {
  const calls = []
  const render = async (html, opts) => {
    calls.push({ html, options: opts })
    const pages = counts[calls.length - 1]
    assert.ok(pages, `unexpected render call ${calls.length}`)
    return blankPdf(pages)
  }
  return { calls, render }
}

const signed = (call) => call.html.includes('estimate-signature-footer')
const compact = (call) => /class="estimate-signature-footer subject-end compact"/.test(call.html)

async function main() {
  // --- Signatures off: one render, nothing added ------------------------------
  {
    const { calls, render } = engine([2])
    await renderSignedPdf(
      { html: BODY, options, signature: { enabled: false, placement: 'subject_end', rows } },
      render
    )
    assert.equal(calls.length, 1, 'an unsigned document is rendered once')
    assert.equal(signed(calls[0]), false)
  }

  // --- Every-page mode is Chromium's footer margin and cannot orphan ---------
  {
    const { calls, render } = engine([2])
    await renderSignedPdf(
      { html: BODY, options, signature: { ...subjectEnd, placement: 'every_page' } },
      render
    )
    assert.equal(calls.length, 1, 'every-page mode needs no probing')
    assert.equal(calls[0].options.displayHeaderFooter, true)
    assert.ok(calls[0].options.margins.bottom >= 24 / 25.4, 'the footer margin is reserved')
  }

  // --- A document that only continues the subject does not sign it off -------
  {
    const { calls, render } = engine([2])
    await renderSignedPdf(
      { html: BODY, options, signature: subjectEnd, carriesClosing: false },
      render
    )
    assert.equal(calls.length, 1)
    assert.equal(signed(calls[0]), false, 'a bund schedule mid-subject carries no signatures')
  }

  // --- A document that planned its own pages is trusted, not probed ----------
  {
    const { calls, render } = engine([2])
    await renderSignedPdf(
      { html: BODY, options, signature: subjectEnd, closingReserved: true },
      render
    )
    assert.equal(calls.length, 1, 'a reserved layout is rendered once')
    assert.equal(signed(calls[0]), true)
    assert.equal(calls[0].options.margins.bottom, MARGIN, 'and its page box is untouched')
  }

  // --- The block fits: output is exactly what it always was ------------------
  {
    const { calls, render } = engine([3, 3])
    const bytes = await renderSignedPdf({ html: BODY, options, signature: subjectEnd }, render)
    assert.equal(calls.length, 2, 'one probe, one real render')
    assert.equal(signed(calls[0]), false, 'the probe measures the work alone')
    assert.equal(signed(calls[1]), true)
    assert.equal(compact(calls[1]), false, 'a block that fits is never tightened')
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3)
  }

  // --- The block orphans, tightening rescues it ------------------------------
  {
    const { calls, render } = engine([3, 4, 3])
    const bytes = await renderSignedPdf({ html: BODY, options, signature: subjectEnd }, render)
    assert.equal(calls.length, 3)
    assert.equal(compact(calls[2]), true, 'the second rung tightens the block')
    assert.equal(
      (await PDFDocument.load(bytes)).getPageCount(),
      3,
      'the signatures cost no sheet'
    )
  }

  // --- Nothing fits in flow: the block leaves the flow and is drawn ----------
  {
    const { calls, render } = engine([3, 4, 4, 3])
    const bytes = await renderSignedPdf({ html: BODY, options, signature: subjectEnd }, render)
    assert.equal(calls.length, 4)
    const last = calls[3]
    assert.equal(signed(last), false, 'the final render carries no in-flow block')
    assert.ok(
      last.options.margins.bottom > MARGIN,
      'it reserves a band at the foot of every sheet instead'
    )
    const pdf = await PDFDocument.load(bytes)
    const pages = pdf.getPages()
    assert.equal(pages.length, 3, 'still no sheet bought by the signatures')
    assert.ok(pages[2].node.Contents(), 'the closing sheet carries the drawn signatures')
    assert.equal(pages[0].node.Contents(), undefined, 'and no other sheet does')
  }

  // --- The band must not cost more sheets than the orphan it replaces -------
  {
    const { calls, render } = engine([3, 4, 4, 5])
    const bytes = await renderSignedPdf({ html: BODY, options, signature: subjectEnd }, render)
    assert.equal(calls.length, 4)
    const pdf = await PDFDocument.load(bytes)
    assert.equal(pdf.getPageCount(), 4, 'the cheaper in-flow arrangement is kept')
    assert.equal(
      pdf.getPages()[3].node.Contents(),
      undefined,
      'and nothing is drawn over it'
    )
  }

  // --- Text the standard fonts cannot draw keeps the browser-rendered block --
  {
    const telugu = [{ id: 'a', designation: 'కార్యనిర్వాహక ఇంజనీరు', office: 'Division' }]
    const { calls, render } = engine([3, 4, 4])
    const bytes = await renderSignedPdf(
      { html: BODY, options, signature: { ...subjectEnd, rows: telugu } },
      render
    )
    assert.equal(calls.length, 3, 'the drawn rung is skipped rather than mangling the text')
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4)
  }

  console.log('closing block placement OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
