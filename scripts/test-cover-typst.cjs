const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/cover.typ'), 'utf8')
  .replace('[PROJECT_NAME]', 'Restoration of a Telangana Irrigation Tank')
  .replace('[VILLAGE_NAME]', 'Mallampet')
  .replace('[MANDAL_NAME]', 'Dharur')
  .replace('[DISTRICT_NAME]', 'Vikarabad')
  .replace('[SSR_YEAR]', '2025-26')
const emblem = fs.readFileSync(path.join(root, 'src/renderer/src/assets/emblem-telangana.svg')).toString('base64')
const compiler = NodeCompiler.create({ workspace: root })
compiler.mapShadow(path.join(root, 'telangana-emblem.svg'), Buffer.from(emblem, 'base64'))
const pdf = compiler.pdf({
  mainFileContent: source,
  inputs: { 'ee-cover': JSON.stringify({ estimated_cost: '₹ 1.23 Cr' }) }
})

assert(pdf?.length > 20_000, 'pure Typst cover with Telangana emblem must compile')
const out = path.join(root, 'tmp/pdfs/cover-typst.pdf')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, pdf)
console.log(`Pure Typst cover passed (${pdf.length} bytes)`)
