// Every printed item page carries the DATA description header. The injection
// used to match a literal '<body>' tag, which silently dropped the header on
// the document renderer because that emits attributes on the tag.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

const modal = fs.readFileSync(
  path.join(root, 'src/renderer/src/components/print/PrintLayoutModal.tsx'),
  'utf8'
)

// --- The injection must tolerate attributes on the body tag ---------------

const withDescription = /function withDescription\([\s\S]*?\n\}/.exec(modal)
assert.ok(withDescription, 'withDescription not found')
assert.ok(
  !/replace\('<body>'/.test(withDescription[0]),
  'a literal <body> match drops the description whenever the tag has attributes'
)
assert.ok(
  /<body\[\^>\]\*>/.test(withDescription[0]),
  'withDescription must match the body tag with a pattern'
)

// --- Behavioural check, mirroring the real implementation ------------------

function withDescriptionImpl(html, description) {
  const css = '.ee-print-description{color:#111}'
  const withCss = html.includes('</style>')
    ? html.replace('</style>', `${css}</style>`)
    : html.replace('</head>', `<style>${css}</style></head>`)
  return withCss.replace(/<body[^>]*>/i, (tag) => `${tag}${description}`)
}

const description = '<section class="ee-print-description"><header><strong>IRR-DAW-1-1</strong></header></section>'

// The spreadsheet renderer emits a bare body tag.
const sheet = '<!doctype html><html><head><style>a{}</style></head><body><table></table></body></html>'
const sheetOut = withDescriptionImpl(sheet, description)
assert.ok(sheetOut.includes(description), 'description missing from the sheet page')
assert.ok(
  sheetOut.indexOf(description) < sheetOut.indexOf('<table>'),
  'the description must come before the sheet content'
)

// The document renderer emits attributes — the case that used to fail.
const doc =
  '<!doctype html><html><head><style>a{}</style></head><body data-project="COnst"><div class="doc-body"><p>x</p></div></body></html>'
const docOut = withDescriptionImpl(doc, description)
assert.ok(docOut.includes(description), 'description missing from the document page')
assert.ok(
  docOut.indexOf(description) < docOut.indexOf('doc-body'),
  'the description must come before the document content'
)
// The attributes on the tag survive.
assert.ok(docOut.includes('data-project="COnst"'), 'body attributes must be preserved')

// A page with no <style> block still receives the CSS and the description.
const noStyle = '<!doctype html><html><head></head><body data-x="1"><p>x</p></body></html>'
const noStyleOut = withDescriptionImpl(noStyle, description)
assert.ok(noStyleOut.includes('<style>'), 'CSS must be injected when no style block exists')
assert.ok(noStyleOut.includes(description), 'description missing when no style block exists')

// Replacement text containing $ patterns is inserted literally, not expanded.
const dollar = '<section>Cost $& rate $1 100%</section>'
const dollarOut = withDescriptionImpl(doc, dollar)
assert.ok(
  dollarOut.includes('Cost $& rate $1 100%'),
  'a description containing $ sequences must be inserted literally'
)

// Only the first body tag is touched.
const twice = '<html><body data-a="1"><p>one</p></body></html>'
assert.equal((withDescriptionImpl(twice, description).match(/ee-print-description/g) ?? []).length, 1)

// --- The document renderer emits a body the injector can find -------------

const documentPrint = fs.readFileSync(
  path.join(root, 'src/renderer/src/lib/documentPrint.ts'),
  'utf8'
)
assert.ok(/<body/.test(documentPrint), 'the document renderer must emit a body tag')

console.log('print description header: all assertions passed')
