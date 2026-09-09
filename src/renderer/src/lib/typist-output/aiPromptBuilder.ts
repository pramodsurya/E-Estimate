import {
  clampDocumentFontSize,
  type DocumentSettings
} from './documentSettings'

export interface BuildAiPromptOptions {
  title?: string
  subtitle?: string
  runtimeData?: unknown
  documentSettings: DocumentSettings
  /** Complete source currently visible in Print Studio, including unsaved edits. */
  typstSource?: string
}

export function statementDataRoot(data: Record<string, unknown>): string | null {
  if (typeof data.layout_kind === 'string' && Array.isArray(data.sections)) return 'Bund'
  if (Array.isArray(data.materials) && Array.isArray(data.breakdowns)) return 'Lead'
  if (Array.isArray(data.material_groups)) return 'Seigniorage'
  if (Array.isArray(data.recipes)) return 'DataBook'
  return null
}

export function buildAiPrompt({
  title,
  subtitle,
  runtimeData,
  documentSettings,
  typstSource
}: BuildAiPromptOptions): string {
  const obj =
    typeof runtimeData === 'object' && runtimeData !== null
      ? (runtimeData as Record<string, unknown>)
      : {}

  // Redesign prompts are source-first. Runtime payloads—especially Bund
  // geometry and section arrays—must never displace the editable Typst code.
  if (typstSource?.trim()) {
    const root = statementDataRoot(obj) ?? 'EE'
    const documentName = title || root
    return `You are redesigning an existing production Typst template for E-Estimate.

DOCUMENT
- Name: ${documentName}${subtitle ? `\n- Context: ${subtitle}` : ''}
- Runtime data root: ${root}

TASK
Redesign the COMPLETE Typst source below. Improve hierarchy, typography, spacing, tables, page flow, print economy, and grayscale legibility while preserving every calculation, condition, loop, image reference, helper, and runtime binding.

NON-NEGOTIABLE RULES
1. Treat the attached Typst source as the single source of truth. Do not invent a replacement template from sample data.
2. Return the entire revised .typ file from its first line to its last line—not a fragment, patch, explanation, JSON, or runtime-data dump.
3. Preserve the marked "E-Estimate document settings: begin/end" block with concrete literal page, margin, font, and heading values so the visual settings editor can continue to parse it.
4. Preserve sys.inputs bindings and all dynamic collection loops. Never hardcode values currently supplied by runtime JSON.
5. Preserve optional-field guards, audit metadata, virtual image paths, table headers, calculations, figures, page numbering, and mixed page-size transitions.
6. Preserve the shared signature-footer call and keep signatures bottom-aligned. Do not replace it with an inline signature table.
7. Use low-ink, grayscale-safe styling suitable for government engineering estimates.
8. Do not include the live runtime JSON payload in your response. The application supplies it during compilation.

ACTIVE COMPLETE TYPST SOURCE
\`\`\`\`typst
${typstSource.trimEnd()}
\`\`\`\`

OUTPUT
Return only one complete Typst code block containing the fully redesigned source.`
  }

  // Item/document prompts keep their existing workflow. Statement templates use
  // descriptive roots and expose their own complete layout and optional sections.
  const statementRoot = statementDataRoot(obj)
  if (statementRoot) {
    const fields: string[] = []
    const describe = (name: string, value: unknown, depth = 0): void => {
      if (depth > 6) return
      if (Array.isArray(value)) {
        fields.push(`- ${name}: array (${value.length} records currently)`)
        if (value.length) describe(`${name}[]`, value[0], depth + 1)
      } else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) describe(`${name}.${key}`, child, depth + 1)
      } else {
        fields.push(`- ${name}: ${value === null ? 'optional; currently none' : typeof value}`)
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'gallery' || key === 'images') continue
      if (statementRoot === 'Lead' && ['rows', 'breakdowns', 'title', 'subtitle'].includes(key)) continue
      if (statementRoot === 'Seigniorage' && key === 'groups') continue
      describe(`${statementRoot}.${key}`, value)
    }
    return `Redesign the attached complete Typst script for ${title || statementRoot}.
Keep the data binding: #let ${statementRoot} = json(bytes(sys.inputs.at("ee-data")))
Use meaningful local names such as material, calculation_step, material_group, and RateAnalysis.
Headings, subtitles, labels, tables, formatting and conditions belong in the script.
Project figures arrive as JSON values; never hardcode them or generate/evaluate code from them.
Preserve collection loops so new materials and rows appear automatically.
Keep conditional sections: absent or zero loading/unloading/lift must not leave empty charge rows.
Use .at("optional_field", default: none) and check applicability before rendering optional data.
Read the template's comments for units and fields that have no current example record.
Keep the marked Document Settings block with literal page, margin and font settings so the panel can edit it.
You may redesign the rest of the script, including every visible table helper.
Opening Studio refreshes values; Recompile renders current code with loaded values.
Return the complete .typ script, not fragments.

Current data contract:
${fields.join('\n')}`
  }

  // General Abstract + book chrome only. Components print from their own studios.
  if (obj.layout_kind === 'general-abstract') {
    return `Redesign the attached complete Typst script for the General Abstract (${obj.project || title || 'Project'}).
Keep the data binding: #let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_SIGNATURE = EE.at("signature", default: ())

Keep the marked Document Settings block with literal #set page / #set text values.
Keep the book chrome after that block: header line, footer line, and page numbers.
Keep figure/table numbering (#set figure, Fig. / Table supplements).

This script is the General Abstract plus book chrome. Do not loop components or items here
(#for comp in EE.components, #render-project-component). Those compile from each node's own
Print Studio Typst in the project book.

Sections:
1. General Abstract from EE.lines (sl, label, amount, kind, basis) and EE.summary.
2. Signatures: preserve the bottom-anchored #signature-footer(EE_SIGNATURE) design. Never place signatures inline between content sections.

Return the complete .typ script, not fragments.`
  }

  // Component Report AI prompt
  if (obj.component && obj.abstract && Array.isArray(obj.items)) {
    const comp = obj.component as Record<string, unknown>
    return `Redesign the attached complete Typst script for the Component Report (${comp.name || title || 'Component'}).
Keep the data binding: #let EE = json(bytes(sys.inputs.at("ee-data")))
#let EE_SIGNATURE = EE.at("signature", default: ())
#let COMP = EE.component

Keep the marked Document Settings block:
// E-Estimate document settings: begin
#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 20mm, right: 15mm, bottom: 20mm, left: 25mm)
)
#set text(font: ("Calibri", "Arial", "Liberation Sans", "Helvetica"), size: 9.5pt)
#show heading.where(level: 1): set text(size: 13.0pt)
#show heading.where(level: 2): set text(size: 10.5pt)
#show heading.where(level: 3): set text(size: 10.0pt)
// E-Estimate document settings: end
(IMPORTANT: Keep literal values in #set page and #set text so the visual Document Settings panel can edit them!)

Component Report Sections & Available Helpers:
1. Component Banner / Cover:
   - #COMP.name, #COMP.code, #COMP.totalFormatted, #EE.project
2. Abstract of Estimate Summary:
   - #render-component-abstract(EE.abstract, total: COMP.at("totalFormatted", default: none))
   - Or iterate manually: #for row in EE.abstract [ ... ]
     Fields in each row: row.sl, row.heading, row.description, row.qty, row.unit, row.rate, row.amount
3. Detailed Estimates (Child Items):
   - Iterate child items: #for item in EE.items [ #pagebreak() #render-component-item(item) ]
   - Or render individually:
     #if item.editorType == "spreadsheet" [
       #render-univer-sheet(item.univer, repeat-header-rows: 0, show-gridlines: true)
     ] else if item.editorType == "document" [
       #render-univer-doc(item.document)
     ]
4. Signatures:
   - Preserve #signature-footer(EE_SIGNATURE) at the end of the document. It must remain bottom-anchored, never inline between content sections.

Return the complete .typ script, not fragments.`
  }

  const vars: Array<{ key: string; value: string; snippet: string }> = []
  const add = (k: string, v: unknown): void => {
    if (v === undefined || v === null) return
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      vars.push({ key: `EE.${k}`, value: String(v), snippet: `#EE.${k}` })
    }
  }

  add('project', obj.project)
  add('item', obj.item)
  add('code', obj.code)
  add('unit', obj.unit)
  add('description', obj.description)
  if (obj.final && typeof obj.final === 'object') {
    const fin = obj.final as Record<string, unknown>
    add('final.qty', fin.qty)
    add('final.rate', fin.rate)
    add('final.amount', fin.amount)
    add('final.unit', fin.unit)
  }

  const mediaList: Array<Record<string, unknown>> =
    Array.isArray(obj.gallery) && obj.gallery.length > 0
      ? (obj.gallery as Array<Record<string, unknown>>)
      : Array.isArray(obj.images) && obj.images.length > 0
        ? (obj.images as Array<Record<string, unknown>>)
        : []

  const bodyPt = clampDocumentFontSize(documentSettings.fontSizePt)
  const headingPt = (bodyPt * 1.37).toFixed(1)
  const subheadingPt = (bodyPt * 1.11).toFixed(1)
  const minorHeadingPt = (bodyPt * 1.05).toFixed(1)
  const notePt = (bodyPt * 0.95).toFixed(1)

  const fontStacks: Record<string, string> = {
    sans: '("Calibri", "Arial", "Liberation Sans", "Helvetica")',
    arial: '("Arial", "Liberation Sans", "Helvetica")',
    times: '("Times New Roman", "Liberation Serif", "Noto Serif")'
  }
  const fontStack = fontStacks[documentSettings.fontFamily] || fontStacks.sans

  let prompt = `I am designing an engineering estimate document layout in Typst for E-Estimate.
${title ? `Document: ${title}${subtitle ? ` · ${subtitle}` : ''}\n` : ''}
Runtime JSON data is passed to Typst via sys.inputs:
\`#let EE = json(bytes(sys.inputs.at("ee-data")))\`

---

## 1. Document Settings Block (MANDATORY at the very top):
Your .typ file MUST start with this exact block using concrete literal values (NOT variables):

\`\`\`typst
// E-Estimate document settings: begin
#set page(
  paper: "${documentSettings.pageSize.toLowerCase()}",
  flipped: ${documentSettings.orientation === 'landscape'},
  margin: (top: ${documentSettings.margins.top}mm, right: ${documentSettings.margins.right}mm, bottom: ${documentSettings.margins.bottom}mm, left: ${documentSettings.margins.left}mm)
)
#set text(font: ${fontStack}, size: ${bodyPt}pt)
#show heading.where(level: 1): set text(size: ${headingPt}pt)
#show heading.where(level: 2): set text(size: ${subheadingPt}pt)
#show heading.where(level: 3): set text(size: ${minorHeadingPt}pt)
#let ee-note(body) = text(size: ${notePt}pt, body)
#let ee-comment(body) = text(size: ${notePt}pt, style: "italic", body)
// E-Estimate document settings: end
\`\`\`

⚠️ CRITICAL RULE FOR DOCUMENT SETTINGS:
- Do NOT use abstract variables like \`paper: EE.setup.paper\` or \`EE_SETUP.*\` in this block!
- Use literal strings and numbers as shown above.
- Reason: E-Estimate's interactive GUI Document Setup panel scans and updates this exact block live.

---

## 2. Multi-Page & Mixed Page Size Rules (e.g. Page 1 A4, Page 2 A3 Landscape):
Typst natively supports mixed page sizes and orientations in a single document!
If you need different page sizes (for example: Page 1 A4 Portrait for the summary/identity header, and Page 2 A3 Landscape for wide Univer spreadsheets, site drawings, or large engineering schedules):
Transition smoothly using \`#pagebreak()\` followed by a new \`#set page(...)\`:

\`\`\`typst
// Page 1: A4 Portrait (inherited from top document settings)
= Estimate Summary & Overview
...

// Page 2: Transition to A3 Landscape for wide engineering sheets or charts
#pagebreak()
#set page(paper: "a3", flipped: true, margin: (x: 15mm, y: 15mm))
= Detailed Engineering Schedule (A3 Landscape)
// Wide spreadsheet or drawing layout here

// Page 3: Transition back to A4 Portrait if needed
#pagebreak()
#set page(paper: "a4", flipped: false, margin: (x: 20mm, y: 20mm))
= Signatures & Approvals (A4 Portrait)
\`\`\`

In E-Estimate Print Studio and exported PDFs, each page automatically renders in its exact aspect ratio and physical dimensions.

---

## 3. Available Document Variables:
${vars.length > 0 ? vars.map((v) => `- \`${v.key}\`: "${v.value}" (Typst: \`${v.snippet}\`)`).join('\n') : '*(No scalar variables)*'}
- \`EE.univer\`: Active Univer spreadsheet workbook data. Rendered natively using \`#render-univer-sheet(EE.univer)\`.
- \`EE.document\`: Active Univer document data. Rendered natively using \`#render-univer-doc(EE.document)\`.

---

## 4. Available Images & Charts (In-Memory Virtual Shadow Files):
`

  if (mediaList.length === 0) {
    prompt += `*(No images or charts attached to this item yet)*\n`
  } else {
    prompt += mediaList
      .map((m) => {
        const name = String(m.name || 'Image')
        const type = String(m.type || 'image').toUpperCase()
        const path = String(m.path || '')
        const width = Number(m.width || 0)
        const height = Number(m.height || 0)
        const directUsage = `#image("${path}", width: 80%)`
        const positionedUsage =
          String(m.typstSnippet || '') ||
          `#place(top + left, dx: ${(Number(m.relLeftPx ?? m.left ?? 0) * 0.75).toFixed(0)}pt, dy: ${(Number(m.relTopPx ?? m.top ?? 0) * 0.75).toFixed(0)}pt, image("${path}", width: ${(width * 0.75).toFixed(0)}pt))`
        return `- **${name}** (${type})\n  Virtual Path: \`${path}\`\n  Dimensions: ${width}×${height} px\n  Inline: \`${directUsage}\`\n  Positioned: \`${positionedUsage}\``
      })
      .join('\n\n')
  }

  prompt += `
⚠️ NOTE ON IMAGES:
Images and charts are bundled in memory inside the \`.eestimate\` file as virtual shadow files.
Reference them strictly by their virtual paths shown above (e.g. \`#image("images/drawing_1.png")\`).
Do NOT use local disk paths (like \`C:\\...\`) or web URLs.

---

## 5. Standard Engineering Heading Layout (CRITICAL):
Do NOT use centered, colored heading banners or hardcoded description text!
Format the item header following standard engineering estimate layout (Title on left, Unit on right, Description as dynamic variable beneath):

\`\`\`typst
// Item heading: Title on left, Unit on right (matches standard engineering format)
#grid(
  columns: (1fr, auto),
  align: (left + bottom, right + bottom),
  [
    #text(13pt, weight: "bold")[
      #if EE.code != "" and not EE.item.starts-with(EE.code) [#EE.code — ]#EE.item
    ]
  ],
  [#if EE.unit != "" [#text(9.5pt)[Unit: #EE.unit]]]
)

#if EE.description != "" and EE.description != EE.item [
  #v(4pt)
  #text(9.5pt)[#render-description(EE)]
]

#v(8pt)
\`\`\`

⚠️ CRITICAL RULE FOR DESCRIPTION & RICH FORMATTING:
- The description MUST be rendered dynamically via \`#render-description(EE)\` (or \`#EE.description\`).
- NEVER hardcode static description strings into the template.
- Reason 1: If the user edits the description in the software DATA, it automatically supplies the fresh text on recompilation.
- Reason 2: \`#render-description(EE)\` natively preserves rich text formatting (bolds, underlines, italics, and line breaks) passed in \`EE.descriptionRuns\` from government SSR and engineering specifications!

---

## 6. Output Instructions:
Please generate a clean, elegant, production-ready Typst document layout (.typ) following these exact rules, maintaining the Document Settings block at the top and referencing all data via \`EE.*\` variables.`

  return prompt
}
