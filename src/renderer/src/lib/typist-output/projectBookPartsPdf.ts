import { convertFileSrc } from '@tauri-apps/api/core'
import { PDFDocument } from 'pdf-lib'
import type { EestimateProject } from '../../types/project'
import { auditPrintContent, preparePrintAudit, type PrintIssue } from './printContentAudit'
import {
  collectProjectTypstPartsWithAssets,
  upgradeLegacySignatureLayout,
  upgradeLegacyTypstApis,
  type ProjectTypstPart
} from './projectPrintBook'

async function compileBytes(
  label: string,
  source: string,
  inputs: Record<string, string>,
  shadowFiles?: Record<string, string>,
  audit = false
): Promise<{ bytes: Uint8Array; issues: PrintIssue[] }> {
  const prepared = audit ? preparePrintAudit(inputs) : { inputs, obligations: [] }
  const result = await window.api.typst.compile(source, prepared.inputs, shadowFiles, { preferPath: true })
  if (!result.ok || !result.pdfPath) throw new Error(`${label}: ${result.error || 'Typst did not return a PDF.'}`)
  const response = await fetch(convertFileSrc(result.pdfPath))
  if (!response.ok) throw new Error(`${label}: could not read the compiled PDF.`)
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    issues: auditPrintContent(prepared.obligations, result.printedContent)
  }
}

export function projectBookIndexSource(): string {
  return `#let rows = json(bytes(sys.inputs.at("ee-data")))
#set document(title: "Project Estimate Index")
#set page(paper: "a4", margin: (top: 20mm, bottom: 18mm, x: 20mm))
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), size: 10pt)
= Project Estimate — Index
#v(5mm)
#for (i, row) in rows.enumerate() {
  if i > 0 and calc.rem(i, 27) == 0 { pagebreak() }
  block(width: 100%, below: 3mm)[
    #grid(columns: (12mm, 1fr, 28mm),
      [#str(i + 1)], [#row.label], [Page #row.page])
    #line(length: 100%, stroke: 0.35pt + rgb("#cbd5e1"))
  ]
}`
}

/**
 * A project book is intentionally compiled one studio at a time. A large bund
 * cannot force Typst to lay out every other component in the same document.
 * The generated index uses absolute PDF page numbers; individual studios keep
 * their own headers and local page numbering.
 */
export async function compileProjectBookInParts(
  project: EestimateProject,
  abstractSource: string,
  onPhase: (phase: string) => void
): Promise<{ bytes: Uint8Array; issues: PrintIssue[] }> {
  onPhase('Preparing project sections…')
  const parts = await collectProjectTypstPartsWithAssets(project, abstractSource)
  const cover = parts.find((part) => part.kind === 'cover')
  const content = parts.filter((part) => part !== cover)
  const ordered = cover ? [cover, ...content] : content
  if (ordered.length === 0) throw new Error('Nothing to print.')

  const outputs: Array<{ part: ProjectTypstPart; pdf: PDFDocument }> = []
  const issues: PrintIssue[] = []
  for (const [index, part] of ordered.entries()) {
    onPhase(`Rendering ${index + 1}/${ordered.length}: ${part.label}…`)
    const source = upgradeLegacySignatureLayout(upgradeLegacyTypstApis(
      `${part.prelude ? `${part.prelude}\n` : ''}${part.source}`
    ))
    const compiled = await compileBytes(part.label, source, part.inputs, part.shadowFiles, true)
    issues.push(...compiled.issues.map((issue) => ({ ...issue, label: `${part.label}: ${issue.label}` })))
    const bytes = compiled.bytes
    outputs.push({ part, pdf: await PDFDocument.load(bytes) })
  }

  // Reserve a stable number of index pages, then compile the index with the
  // actual page counts. If a font/layout change grows it, recompute once.
  let indexPages = Math.max(1, Math.ceil(content.length / 27))
  let indexPdf: PDFDocument | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    let page = (cover ? outputs[0]!.pdf.getPageCount() : 0) + indexPages + 1
    const rows = outputs.filter(({ part }) => part !== cover).map(({ part, pdf }) => {
      const row = { label: part.label, page }
      page += pdf.getPageCount()
      return row
    })
    onPhase('Building project index…')
    const compiledIndex = await compileBytes('Project index', projectBookIndexSource(), {
      'ee-data': JSON.stringify(rows)
    })
    indexPdf = await PDFDocument.load(compiledIndex.bytes)
    const actual = indexPdf.getPageCount()
    if (actual === indexPages) break
    indexPages = actual
  }
  if (!indexPdf) throw new Error('Could not build the project index.')

  onPhase('Combining project PDF…')
  const merged = await PDFDocument.create()
  const append = async (source: PDFDocument): Promise<void> => {
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }
  if (cover) await append(outputs[0]!.pdf)
  await append(indexPdf)
  for (const { part, pdf } of outputs) {
    if (part !== cover) await append(pdf)
  }
  return { bytes: new Uint8Array(await merged.save()), issues }
}
