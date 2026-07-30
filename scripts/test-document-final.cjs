// Fixing a final number in a document stores character offsets, which drift
// when text above them is edited. These checks pin the drift guard: a live
// re-read when the range still holds a number, a flagged fallback when it does
// not — never a silently wrong quantity.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  })
  const loadedModule = new Module(filePath, module)
  loadedModule.filename = filePath
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  loadedModule._compile(outputText, filePath)
  return loadedModule.exports
}

const {
  parseFixableNumber,
  documentParagraphs,
  resolveDocumentFinal,
  createDocumentFinal,
  resolvePrintArea,
  paragraphInPrintArea
} = loadTsModule(path.join(root, 'src/renderer/src/lib/documentFinal.ts'))

/** Builds a document from paragraph texts, the way Univer stores them. */
function doc(paragraphTexts) {
  let dataStream = ''
  const paragraphs = []
  for (const text of paragraphTexts) {
    dataStream += text
    paragraphs.push({ startIndex: dataStream.length })
    dataStream += '\r'
  }
  dataStream += '\n'
  return { id: 'd1', documentStyle: {}, body: { dataStream, paragraphs, textRuns: [] } }
}

function itemWith(documentData, documentFinal) {
  return { id: 'i1', kind: 'item', name: 'x', children: [], itemEditorType: 'document', documentData, documentFinal }
}

// --- Number parsing tolerates how estimators write figures -----------------

assert.equal(parseFixableNumber('1234'), 1234)
assert.equal(parseFixableNumber('1,447.666'), 1447.666)
assert.equal(parseFixableNumber('1,447.666 CUM'), 1447.666)
assert.equal(parseFixableNumber('Rs. 12,345.50'), 12345.5)
assert.equal(parseFixableNumber('-42.5'), -42.5)
assert.equal(parseFixableNumber('.75'), 0.75)
assert.equal(parseFixableNumber('no digits here'), null)
assert.equal(parseFixableNumber(''), null)
assert.equal(parseFixableNumber(null), null)
assert.equal(parseFixableNumber(undefined), null)

// --- Paragraph splitting ---------------------------------------------------

const sample = doc(['Total quantity', '1,447.666', 'Signed'])
const paras = documentParagraphs(sample)
assert.equal(paras.length, 3)
assert.deepEqual(paras.map((p) => p.text), ['Total quantity', '1,447.666', 'Signed'])
// Offsets address exactly the paragraph text.
for (const para of paras) {
  assert.equal(sample.body.dataStream.slice(para.startIndex, para.endIndex), para.text)
}
assert.deepEqual(documentParagraphs(undefined), [])

// --- Fixing a selection ----------------------------------------------------

const numberPara = paras[1]
const fixed = createDocumentFinal(numberPara.startIndex, numberPara.endIndex, numberPara.text)
assert.ok(fixed)
assert.equal(fixed.capturedValue, 1447.666)
assert.equal(fixed.capturedText, '1,447.666')
// A selection with no number cannot be fixed.
assert.equal(createDocumentFinal(0, 5, 'Total'), null)

// --- Unchanged document reads live ----------------------------------------

let resolved = resolveDocumentFinal(itemWith(sample, fixed))
assert.equal(resolved.value, 1447.666)
assert.equal(resolved.needsRefix, false)

// No fixed number at all.
resolved = resolveDocumentFinal(itemWith(sample, undefined))
assert.equal(resolved.value, null)
assert.equal(resolved.needsRefix, false)

// --- Editing the number in place updates the estimate ---------------------

const edited = doc(['Total quantity', '2,000.500', 'Signed'])
// Same offsets: the replacement number is the same length.
resolved = resolveDocumentFinal(itemWith(edited, fixed))
assert.equal(resolved.value, 2000.5, 'editing the figure must update the quantity live')
assert.equal(resolved.needsRefix, false)

// --- Drift is caught, not silently mis-read -------------------------------

// Text inserted above pushes the offsets onto non-numeric text.
const drifted = doc(['Total quantity of excavated material', '1,447.666', 'Signed'])
resolved = resolveDocumentFinal(itemWith(drifted, fixed))
assert.equal(resolved.needsRefix, true, 'drift onto non-numeric text must be flagged')
assert.equal(resolved.value, 1447.666, 'the captured value is the fallback')

// The document shrank below the stored range.
resolved = resolveDocumentFinal(itemWith(doc(['x']), fixed))
assert.equal(resolved.needsRefix, true)
assert.equal(resolved.value, 1447.666)

// A degenerate range is treated as drift rather than read.
resolved = resolveDocumentFinal(
  itemWith(sample, { startIndex: 5, endIndex: 5, capturedValue: 9, capturedText: '9' })
)
assert.equal(resolved.needsRefix, true)
assert.equal(resolved.value, 9)

// --- Print area is clamped to paragraphs that exist -----------------------

assert.deepEqual(resolvePrintArea(sample, { startParagraph: 0, endParagraph: 1 }), {
  startParagraph: 0,
  endParagraph: 1
})
// Past the end of a shortened document.
assert.deepEqual(resolvePrintArea(sample, { startParagraph: 1, endParagraph: 99 }), {
  startParagraph: 1,
  endParagraph: 2
})
// Inverted range collapses rather than excluding everything.
assert.deepEqual(resolvePrintArea(sample, { startParagraph: 2, endParagraph: 0 }), {
  startParagraph: 2,
  endParagraph: 2
})
assert.equal(resolvePrintArea(sample, undefined), null)
assert.equal(resolvePrintArea(doc([]), { startParagraph: 0, endParagraph: 1 }), null)

// No print area means every paragraph prints.
assert.equal(paragraphInPrintArea(0, null), true)
assert.equal(paragraphInPrintArea(99, undefined), true)
const area = { startParagraph: 1, endParagraph: 2 }
assert.equal(paragraphInPrintArea(0, area), false)
assert.equal(paragraphInPrintArea(1, area), true)
assert.equal(paragraphInPrintArea(2, area), true)
assert.equal(paragraphInPrintArea(3, area), false)

console.log('document final number: all assertions passed')
