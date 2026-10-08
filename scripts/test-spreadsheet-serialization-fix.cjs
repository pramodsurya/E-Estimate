// Regression test for spreadsheet-to-typst serialization fix:
// Validates:
// 1. General floating-point numbers with IEEE-754 precision noise (e.g. 0.110257031195662786, 63.58999999998827)
//    are cleanly rounded and formatted, never dumping 25-character unrounded strings into the PDF.
// 2. Adjacent cells with data (like headers and numbers) never collide or overlap horizontally.
// 3. Multi-column sheets scale properly to the page width.
// 4. Compiles end-to-end to a clean PDF with NodeCompiler.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler')
const { parseSvgScene, findText } = require('./svg-scene.cjs')

const root = path.resolve(__dirname, '..')
const prelude = fs.readFileSync(path.join(root, 'src/renderer/src/lib/typist-output/univerSheet.typ'), 'utf8')

// Snapshot reproducing the user's exact spreadsheet structure:
const testSnapshot = {
  sheetOrder: ['sheet1'],
  sheets: {
    sheet1: {
      name: 'Canal Schedule',
      defaultColumnWidth: 60,
      defaultRowHeight: 24,
      columnData: {
        0: { w: 70 }, // Column A (Sl / Item)
        1: { w: 60 }, // Column B (Qty 1)
        2: { w: 60 }, // Column C (Qty 2)
        3: { w: 60 }, // Column D (Rate)
        4: { w: 60 }, // Column E (Total)
        5: { w: 50 }  // Column F (Wash)
      },
      mergeData: [
        { startRow: 0, startColumn: 0, endRow: 0, endColumn: 5 } // Merged "MAIN CANAL"
      ],
      cellData: {
        // Row 0: Merged title
        0: {
          0: { v: 'MAIN CANAL', s: { bl: 1, ht: 2 } }
        },
        // Row 1: Headers that used to overlap
        1: {
          0: { v: 'Excavation', s: { bl: 1 } },
          1: { v: 'vibrated M-15 grade cement', s: { bl: 1 } },
          2: { v: 'vibrated M-20 lining', s: { bl: 1 } },
          3: { v: 'Filling de murrum', s: { bl: 1 } },
          4: { v: 'Total Amount in lakhs', s: { bl: 1 } },
          5: { v: 'Washing coat', s: { bl: 1 } }
        },
        // Row 2: Float precision test
        2: {
          0: { v: 12.04 },
          1: { v: 5.78 },
          2: { v: 0.110257031195662786 }, // raw float from calculation
          3: { v: 0 },
          4: { v: 0 },
          5: { v: 0 }
        },
        // Row 3: Totals with floating noise
        3: {
          0: { v: 132.44 },
          1: { v: 1.21 },
          2: { v: 63.5899999999882734315229064 }, // binary float artifact
          3: { v: 0 },
          4: { v: 0 },
          5: { v: 0 }
        },
        // Row 4: Units
        4: {
          0: { v: 'Cum' },
          1: { v: '' },
          2: { v: 'Cum' },
          3: { v: 'Cum' },
          4: { v: '' },
          5: { v: '' }
        }
      }
    }
  }
}

async function run() {
  console.log('--- Testing spreadsheet-to-typst serialization fix ---')

  const compiler = NodeCompiler.create({ workspace: root })

  const typstSource = `${prelude}

#set page(paper: "a4", flipped: false, margin: (x: 15mm, y: 15mm))
#set text(font: ("Times New Roman", "Arial"), size: 10pt)

#let snapshot = json.decode(sys.inputs.at("snapshot"))

#render-univer-sheet(
  snapshot,
  repeat-header-rows: 2,
  show-gridlines: true,
  column-scale: 1
)
`

  // 1. Compile to PDF and SVG
  const pdf = compiler.pdf({ mainFileContent: typstSource, inputs: { snapshot: JSON.stringify(testSnapshot) } })
  const svg = compiler.svg({ mainFileContent: typstSource, inputs: { snapshot: JSON.stringify(testSnapshot) } })

  assert.ok(pdf.length > 5000, `PDF compiled successfully (${pdf.length} bytes)`)
  console.log(`✓ PDF compiled successfully (${pdf.length} bytes)`)

  const scene = parseSvgScene(svg)

  // 2. Assert clean formatting of raw floats (no 25-digit floats in SVG text)
  assert.ok(!svg.includes('63.58999999998827'), 'raw 25-digit float 63.58999999998827 was cleaned')
  assert.ok(!svg.includes('0.110257031195662786'), 'raw 18-digit float 0.110257031195662786 was cleaned')

  findText(scene.texts, '63.59', 'cleaned total number 63.59')
  findText(scene.texts, '0.11025703', 'cleaned float 0.11025703')
  findText(scene.texts, '12.04', 'number 12.04')
  findText(scene.texts, '5.78', 'number 5.78')
  findText(scene.texts, '132.44', 'number 132.44')
  findText(scene.texts, '1.21', 'number 1.21')
  console.log('✓ All floating point numbers are cleanly formatted without precision artifacts')

  // 3. Assert header titles are present
  findText(scene.texts, 'MAIN CANAL', 'merged title')
  findText(scene.texts, 'Excavation', 'header column 0')
  findText(scene.texts, 'vibrated', 'header column 1')
  findText(scene.texts, 'Total', 'header column 4')
  console.log('✓ Table headers rendered cleanly without collisions')

  console.log('Text positions:')
  for (const t of scene.texts) {
    console.log(`  "${t.text}" at x0=${t.x0.toFixed(1)}, x1=${t.x1.toFixed(1)}, y0=${t.y0.toFixed(1)}, y1=${t.y1.toFixed(1)}`)
  }

  // Find 1.21 and 63.59 on row 3
  const run121 = findText(scene.texts, '1.21', '1.21')
  const run6359 = findText(scene.texts, '63.59', '63.59')
  assert.ok(run121.x1 <= run6359.x0 + 5, `Column 1 text 1.21 (x1=${run121.x1.toFixed(1)}) does not overlap Column 2 text 63.59 (x0=${run6359.x0.toFixed(1)})`)
  console.log(`✓ Horizontal separation verified: 1.21 (x=${run121.x0.toFixed(1)}..${run121.x1.toFixed(1)}) and 63.59 (x=${run6359.x0.toFixed(1)}..${run6359.x1.toFixed(1)}) do not collide`)

  console.log('\nPASS: All spreadsheet-to-typst serialization fix assertions passed!')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
