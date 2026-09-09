/**
 * Assembles the project estimate book from each studio's own Typst.
 *
 * Cover, extra pages, the General Abstract, and every component/subcomponent
 * compile with the source saved in that studio (or that studio's default).
 * One Typst compile of a wrapper that `#include`s remapped part files —
 * not a PDF merge, and not a generic `project.typ` component loop.
 */

import type { EestimateProject, ProjectNode } from '../../types/project'
import { computeProjectPrintInputs } from '../projectPrintInputs'
import { collectDataSheets } from '../dataSheets'
import { buildDataFigureBundle } from '../dataSheetPrint'
import {
  COVER_STUDIO_SCOPE,
  coverCompileInputs,
  coverShadowFiles,
  resolvedCoverTypstSource
} from './coverTypst'
import {
  EE_ITEM_TABLE_PRELUDE,
  itemSheetCompileInputs,
  itemSheetShadowFiles,
  itemSheetTypstTemplate,
  resolveItemSheetDocumentSettings,
  itemSheetScopeKey
} from './itemTypst'
import { applyDocumentSettingsToTypst } from './documentSettings'
import { resolveComponentPrintPart } from './componentTypst'
import {
  dataSheetsCompileInputs,
  dataSignatureSettings,
  resolvedDataTypstSource
} from './dataTypst'
import {
  leadCompileInputs,
  leadCompileSource,
  leadMapCaptureFromProject,
  leadMapShadowFilesFromProject,
  resolvedLeadTypstSource
} from './leadTypst'
import {
  resolvedSeigniorageTypstSource,
  seigniorageCompileInputs
} from './seigniorageTypst'
import {
  PROJECT_ABSTRACT_SCOPE,
  projectCompileInputs,
  projectCompilePrelude,
  resolvedProjectTypstSource
} from './projectTypst'

export interface ProjectTypstPart {
  id: string
  label: string
  kind: 'cover' | 'page' | 'data' | 'lead' | 'seigniorage' | 'abstract' | 'component' | 'item'
  source: string
  prelude: string
  inputs: Record<string, string>
  shadowFiles?: Record<string, string>
}

export interface ProjectBookCompile {
  mainContent: string
  inputs: Record<string, string>
  shadowFiles: Record<string, string>
  parts: ProjectTypstPart[]
  partPaths: string[]
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function sanitizePartId(partId: string): string {
  return partId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'part'
}

/** Unique sys.inputs / JSON-file stem for one book part so every studio can keep `ee-data`. */
export function uniquePartInputKey(originalKey: string, partId: string): string {
  const safe = sanitizePartId(partId)
  if (originalKey === 'ee-data' || originalKey === 'ee-cover') {
    return `ee-part-${safe}`
  }
  return `${originalKey}-${safe}`
}

function sysInputsAtCallPattern(escapedKey: string): string {
  return `sys\\.inputs\\.at\\(\\s*(["'])${escapedKey}\\1(?:\\s*,[^)]*)?\\)`
}

/**
 * Point each part's `sys.inputs.at("ee-data")` / `ee-cover` / `ee-bund` reads at
 * that part's unique JSON file (and unique sys.inputs key as fallback).
 *
 * Saved Typst often still uses the studio keys. A book cannot share one
 * `ee-data` across parts, and `sys.inputs.at("ee-data", default: …)` plus
 * `json.decode(...)` variants were easy to miss. Binding via `json("….json")`
 * next to `parts/*.typ` does not depend on Typst 0.15 `sys.inputs` lookup.
 */
export function remapSysInputBindings(source: string, keyMap: Record<string, string>): string {
  let result = source
  for (const [from, to] of Object.entries(keyMap)) {
    if (from === to) continue
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const atCall = sysInputsAtCallPattern(escaped)
    const jsonRel = `"${to}.json"`
    result = result.replace(
      new RegExp(`json\\(\\s*bytes\\(\\s*${atCall}\\s*\\)\\s*\\)`, 'g'),
      () => `json(${jsonRel})`
    )
    result = result.replace(
      new RegExp(`json\\.decode\\(\\s*${atCall}\\s*\\)`, 'g'),
      () => `json(${jsonRel})`
    )
    result = result.replace(new RegExp(atCall, 'g'), () => `read(${jsonRel})`)
    result = result.replace(
      new RegExp(`sys\\.inputs\\.at\\(\\s*(["'])${escaped}\\1`, 'g'),
      `sys.inputs.at($1${to}$1`
    )
  }
  return result
}

/**
 * Keep saved layouts created for older Typst releases usable in the project book.
 * Typst 0.15 removed `image.decode(bytes)` because `image(bytes)` now accepts the
 * encoded image bytes directly. Apply this only to the in-memory compile copy so
 * the user's saved source is not rewritten behind their back.
 */
export function upgradeLegacyTypstApis(source: string): string {
  return source.replace(/\bimage\s*\.\s*decode\s*\(/g, 'image(')
}

/** Upgrade signature blocks saved before the shared bottom-footer design. */
export function upgradeLegacySignatureLayout(source: string): string {
  let result = source
  const replaceBlock = (pattern: RegExp, rows: string): void => {
    result = result.replace(pattern, `#if ${rows}.len() > 0 [\n  #signature-footer(${rows})\n]`)
  }
  replaceBlock(
    /#if\s+\(?EE_SIGNATURE\.len\(\)\s*>\s*0\)?\s*\[\s*#v\(18pt\)[\s\S]*?\.\.signature-cells\(EE_SIGNATURE\),?\s*\)\s*\]/g,
    'EE_SIGNATURE'
  )
  replaceBlock(
    /#if\s+\(?GW_SIGNATURE\.len\(\)\s*>\s*0\)?\s*\[\s*#v\(18pt\)[\s\S]*?\.\.signature-cells\(GW_SIGNATURE\),?\s*\)\s*\]/g,
    'GW_SIGNATURE'
  )
  replaceBlock(
    /#if\s+\(?Seigniorage\.signature\.len\(\)\s*>\s*0\)?\s*\[\s*#v\(18pt\)[\s\S]*?\.\.signature-cells\(Seigniorage\.signature\),?\s*\)\s*\]/g,
    'Seigniorage.signature'
  )
  replaceBlock(
    /#if\s+Lead\.signature\.len\(\)\s*>\s*0\s*\[\s*#v\(18pt\)[\s\S]*?\n\s*\]\s*(?=\n\s*#if Lead\.map)/g,
    'Lead.signature'
  )
  result = result.replace(
    /#if\s+signature\.len\(\)\s*>\s*0\s*\{\s*v\(16mm\)[\s\S]*?\n\s*\}/g,
    '#if signature.len() > 0 [\n  #signature-footer(signature)\n]'
  )
  if (result === source || result.includes('#let signature-footer(')) return result
  return `${EE_ITEM_TABLE_PRELUDE.split('// Renders rich text runs')[0]}\n${result}`
}

export function partVirtualPath(partId: string): string {
  const safe = partId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'part'
  return `parts/${safe}.typ`
}

export function normalizeShadowVirtualPath(vpath: string): string {
  return vpath.replace(/\\/g, '/').replace(/^\/+/, '')
}

/**
 * Typst resolves `#image("foo.svg")` relative to the file that contains it.
 * Book parts live in `parts/*.typ`, so a cover that references `telangana-emblem.svg`
 * looks in `parts/` — not the temp root where `coverShadowFiles()` writes it.
 * Alias every part asset under `parts/` while keeping the original key.
 */
export function aliasShadowPathForIncludedPart(
  shadowPath: string,
  partDir = 'parts'
): string | null {
  const normalized = normalizeShadowVirtualPath(shadowPath)
  if (!normalized || normalized === '.' || /(^|\/)\.\.(\/|$)/.test(normalized)) return null
  const prefix = `${partDir.replace(/\/+$/, '')}/`
  if (normalized.startsWith(prefix)) return null
  return `${prefix}${normalized}`
}

/** True when this component Typst already prints child items (avoid a second pass). */
export function typstSourcePrintsChildItems(source: string): boolean {
  return (
    /#for\s+(?:\([^)]*\)|[A-Za-z_][\w-]*)\s+in\s+EE\.items\b/.test(source) ||
    /#render-component-item\s*\(/.test(source)
  )
}

export function buildProjectBookWrapper(
  parts: Array<Pick<ProjectTypstPart, 'label' | 'kind'> & { path: string }>,
  title = 'Estimate'
): string {
  const coverIndex = parts.findIndex((part) => part.kind === 'cover')
  const contentParts = parts.filter((_, index) => index !== coverIndex)
  const indexRows = contentParts
    .map((part, index) => {
      const label = `ee-book-part-${index + 1}`
      return `  ee-index-row(${JSON.stringify(part.label)}, <${label}>, ${JSON.stringify(String(index + 1).padStart(2, '0'))}),`
    })
    .join('\n')
  const contentIncludes = contentParts
    .map((part, index) => {
      const label = `ee-book-part-${index + 1}`
      return `#pagebreak()\n#metadata(${JSON.stringify(part.label)}) <${label}>\n#include "${part.path}"`
    })
    .join('\n\n')
  const coverInclude = coverIndex >= 0 ? `#include "${parts[coverIndex]!.path}"\n#pagebreak()\n` : ''
  const escapedTitle = JSON.stringify(title)
  return `// E-Estimate project book — one compile of every Print Studio part.
// The cover is unnumbered. The generated index is page 1, followed by every
// independently-authored Print Studio part with continuous page numbering.
#set document(title: ${escapedTitle})
#set page(numbering: none)

${coverInclude}#counter(page).update(1)
#let ee-navy = rgb("#102f46")
#let ee-blue = rgb("#1676a3")
#let ee-gold = rgb("#c69a43")
#let ee-muted = rgb("#60717c")
#let ee-book-title = ${escapedTitle}

#set page(
  paper: "a4",
  flipped: false,
  margin: (top: 18mm, right: 20mm, bottom: 16mm, left: 24mm),
  numbering: "1 of 1",
  number-align: right + bottom,
  background: {
    place(left + top, dx: 10mm, line(start: (0pt, 0pt), end: (0pt, 100%), stroke: 1.2pt + ee-navy))
    place(left + top, dx: 13mm, line(start: (0pt, 0pt), end: (0pt, 100%), stroke: 0.6pt + ee-gold))
    place(right + top, circle(radius: 43mm, stroke: 0.55pt + rgb("#c8d3d8")))
    place(right + top, dx: -10mm, dy: 17mm, circle(radius: 24mm, stroke: 0.8pt + rgb("#d8dfe2")))
  }
)
#set text(font: ("Times New Roman", "Liberation Serif", "Noto Serif"), fill: ee-navy)

#let ee-index-row(title, target, ordinal) = block(
  width: 100%,
  inset: (x: 5mm, y: 3.4mm),
  radius: 1mm,
  stroke: (left: 1.3pt + ee-blue, bottom: 0.45pt + rgb("#aebbc1")),
)[
  #grid(
    columns: (12mm, 1fr, 22mm),
    column-gutter: 4mm,
    align: (center + horizon, left + horizon, center + horizon),
    [#box(width: 10mm, height: 10mm, radius: 50%, stroke: 0.8pt + ee-navy,
      align(center + horizon)[#text(7.5pt, weight: "bold", fill: ee-navy)[#ordinal]])],
    [#link(target)[#text(11.5pt, weight: "bold")[#title]]],
    [#link(target)[#box(width: 18mm, inset: (x: 2mm, y: 1.5mm), radius: 1mm,
      stroke: 0.55pt + rgb("#aebbc1"), align(center)[
        #text(7pt, tracking: 0.8pt, fill: ee-muted)[PAGE] #h(2pt)
        #text(11pt, weight: "bold", fill: ee-blue)[#context counter(page).at(target).first()]
      ])]]
  )
]

#text(8pt, tracking: 1.8pt, weight: "bold", fill: ee-gold)[PROJECT DOCUMENT]
#v(3mm)
#text(31pt, weight: "bold", fill: ee-navy)[INDEX]
#v(2mm)
#rect(width: 34mm, height: 1.4mm, fill: ee-gold)
#v(5mm)
#text(10pt, fill: ee-muted)[A structured register of estimates, schedules, statements and supporting data]
#v(11mm)
#grid(columns: (1fr, auto), align: (left, right),
  [#text(8pt, tracking: 1.2pt, weight: "bold", fill: ee-muted)[DOCUMENT SECTION]],
  [#text(8pt, tracking: 1.2pt, weight: "bold", fill: ee-muted)[REFERENCE]])
#v(3mm)
#grid(
  columns: 1,
  row-gutter: 3mm,
${indexRows}
)
#v(1fr)
#line(length: 100%, stroke: 0.8pt + ee-gold)
#v(4mm)
#grid(
  columns: (1fr, auto),
  align: (left + horizon, right + horizon),
  [
    #text(7.5pt, tracking: 1pt, weight: "bold", fill: ee-muted)[DETAILED ENGINEERING ESTIMATE]
    #linebreak()
    #text(12pt, weight: "bold", fill: ee-navy)[#ee-book-title]
  ],
  [#box(inset: (x: 4mm, y: 2.5mm), radius: 1.5mm, stroke: 0.8pt + ee-navy)[
    #text(8pt, weight: "bold", fill: ee-navy)[${contentParts.length} SECTIONS]
  ]]
)

#pagebreak()
#set page(background: none, numbering: "1 of 1", number-align: center + bottom)
${contentIncludes.replace(/^#pagebreak\(\)\n/, '')}
`
}

function pagePart(project: EestimateProject, node: ProjectNode): ProjectTypstPart {
  if (node.pageTemplate === 'front') {
    return {
      id: COVER_STUDIO_SCOPE,
      label: node.name || 'Front cover',
      kind: 'cover',
      source: resolvedCoverTypstSource(project, node),
      prelude: '',
      inputs: coverCompileInputs(project),
      shadowFiles: coverShadowFiles(project)
    }
  }
  const saved = project.printStudioDocuments?.[itemSheetScopeKey(node)]
  const settings = resolveItemSheetDocumentSettings(project, node)
  const source = saved ?? applyDocumentSettingsToTypst(itemSheetTypstTemplate(project, node), settings)
  return {
    id: itemSheetScopeKey(node),
    label: node.name,
    kind: 'page',
    source,
    prelude: EE_ITEM_TABLE_PRELUDE,
    inputs: itemSheetCompileInputs(project, node),
    shadowFiles: itemSheetShadowFiles(node)
  }
}

function itemPart(project: EestimateProject, node: ProjectNode): ProjectTypstPart {
  const saved = project.printStudioDocuments?.[itemSheetScopeKey(node)]
  const settings = resolveItemSheetDocumentSettings(project, node)
  const source = saved ?? applyDocumentSettingsToTypst(itemSheetTypstTemplate(project, node), settings)
  return {
    id: itemSheetScopeKey(node),
    label: node.name,
    kind: 'item',
    source,
    prelude: EE_ITEM_TABLE_PRELUDE,
    inputs: itemSheetCompileInputs(project, node),
    shadowFiles: itemSheetShadowFiles(node)
  }
}

function emitComponentBranch(
  project: EestimateProject,
  node: ProjectNode,
  recipes: ReturnType<typeof computeProjectPrintInputs>['recipes'],
  rateOf: ReturnType<typeof computeProjectPrintInputs>['rateOf'],
  parts: ProjectTypstPart[]
): void {
  const hasSubcomponents = node.children.some((child) => child.kind === 'subcomponent')
  const resolved = resolveComponentPrintPart(project, node, recipes, rateOf, {
    itemScope: hasSubcomponents ? 'direct' : 'all'
  })
  parts.push({
    id: resolved.scopeKey,
    label: resolved.label,
    kind: 'component',
    source: resolved.source,
    prelude: resolved.compilePrelude,
    inputs: resolved.compileInputs,
    shadowFiles: resolved.shadowFiles
  })

  for (const child of node.children) {
    if (child.kind === 'page') parts.push(pagePart(project, child))
  }

  if (!typstSourcePrintsChildItems(resolved.source)) {
    for (const child of node.children) {
      if (child.kind === 'item' && !child.templateGenerated) parts.push(itemPart(project, child))
    }
  }

  for (const child of node.children) {
    if (child.kind === 'subcomponent') emitComponentBranch(project, child, recipes, rateOf, parts)
  }
}

export function collectProjectTypstParts(
  project: EestimateProject,
  abstractSource?: string
): ProjectTypstPart[] {
  const { recipes, rateOf, seigniorage } = computeProjectPrintInputs(project)
  const parts: ProjectTypstPart[] = []
  const rootPages = project.root.children.filter((child) => child.kind === 'page')
  const cover = rootPages.find((page) => page.pageTemplate === 'front')
  if (cover) parts.push(pagePart(project, cover))
  for (const page of rootPages) {
    if (page.pageTemplate === 'front') continue
    parts.push(pagePart(project, page))
  }

  const leadEntries = project.dashboardSnapshot?.leadDashboardEntries ?? []
  const leadCapture = leadMapCaptureFromProject(project)
  const leadPart: ProjectTypstPart = {
    id: 'lead-statement',
    label: 'Lead Statement',
    kind: 'lead',
    source: leadCompileSource(resolvedLeadTypstSource(project, leadEntries)),
    prelude: '',
    inputs: leadCompileInputs(project, leadEntries, leadCapture),
    shadowFiles: leadMapShadowFilesFromProject(project)
  }

  const seignioragePart: ProjectTypstPart = {
    id: 'seigniorage-statement',
    label: 'Seigniorage Statement',
    kind: 'seigniorage',
    source: resolvedSeigniorageTypstSource(project, seigniorage),
    prelude: '',
    inputs: seigniorageCompileInputs(project, seigniorage)
  }

  const dataEntries = project.dashboardSnapshot?.dataDashboardEntries ?? []
  const dataSheets = collectDataSheets(project, dataEntries)
  const dataPart: ProjectTypstPart = {
    id: 'data-dashboard',
    label: 'DATA',
    kind: 'data',
    source: project.printStudioDocuments?.['data-dashboard'] ?? resolvedDataTypstSource(project),
    prelude: '',
    inputs: dataSheetsCompileInputs(dataSheets, {
      projectName: project.meta.name,
      sorYear: project.meta.sorYear,
      sorZone: project.meta.sorZone,
      signature: dataSignatureSettings(project)
    })
  }

  parts.push({
    id: PROJECT_ABSTRACT_SCOPE,
    label: 'General Abstract',
    kind: 'abstract',
    source: abstractSource ?? resolvedProjectTypstSource(project),
    prelude: projectCompilePrelude(),
    inputs: projectCompileInputs(project)
  })

  for (const child of project.root.children) {
    if (child.kind === 'component') emitComponentBranch(project, child, recipes, rateOf, parts)
  }

  parts.push(leadPart, seignioragePart, dataPart)

  return parts
}

export function assembleProjectBookFromParts(
  parts: ProjectTypstPart[],
  title = 'Estimate'
): ProjectBookCompile {
  const inputs: Record<string, string> = {}
  const shadowFiles: Record<string, string> = {}
  const partPaths: string[] = []

  for (const part of parts) {
    const keyMap: Record<string, string> = {}
    for (const [key, value] of Object.entries(part.inputs)) {
      const unique = uniquePartInputKey(key, part.id)
      keyMap[key] = unique
      inputs[unique] = value
    }
    const combined = `${part.prelude ? `${part.prelude}\n` : ''}${part.source}`
    const remapped = upgradeLegacySignatureLayout(
      upgradeLegacyTypstApis(remapSysInputBindings(combined, keyMap))
    )
    const vpath = partVirtualPath(part.id)
    partPaths.push(vpath)
    shadowFiles[vpath] = utf8ToBase64(remapped)
    for (const unique of Object.values(keyMap)) {
      const payload = inputs[unique]
      if (payload == null || payload === '') continue
      const jsonName = `${unique}.json`
      const jsonBytes = utf8ToBase64(payload)
      shadowFiles[jsonName] = jsonBytes
      shadowFiles[`parts/${jsonName}`] = jsonBytes
    }
    if (part.shadowFiles) {
      for (const [path, data] of Object.entries(part.shadowFiles)) {
        if (!data || !data.trim()) continue
        const original = normalizeShadowVirtualPath(path)
        if (!original) continue
        shadowFiles[original] = data
        const aliased = aliasShadowPathForIncludedPart(original)
        if (aliased) shadowFiles[aliased] = data
      }
    }
  }

  return {
    mainContent: buildProjectBookWrapper(
      parts.map((part, index) => ({ label: part.label, kind: part.kind, path: partPaths[index]! })),
      title
    ),
    inputs,
    shadowFiles,
    parts,
    partPaths
  }
}

export function assembleProjectBookCompile(
  project: EestimateProject,
  abstractSource?: string
): ProjectBookCompile {
  const parts = collectProjectTypstParts(project, abstractSource)
  return assembleProjectBookFromParts(parts, project.meta.name || project.root.name || 'Estimate')
}

/** Assemble the dashboard book with the same downloaded DATA figures as standalone DATA printing. */
export async function assembleProjectBookCompileWithAssets(
  project: EestimateProject,
  abstractSource?: string
): Promise<ProjectBookCompile> {
  const parts = collectProjectTypstParts(project, abstractSource)
  const dataPart = parts.find((part) => part.kind === 'data')
  if (dataPart) {
    const sheets = collectDataSheets(project, project.dashboardSnapshot?.dataDashboardEntries ?? [])
    const figures = await buildDataFigureBundle(sheets, () => undefined)
    dataPart.inputs = dataSheetsCompileInputs(sheets, {
      projectName: project.meta.name,
      sorYear: project.meta.sorYear,
      sorZone: project.meta.sorZone,
      figurePaths: figures.figurePaths,
      signature: dataSignatureSettings(project)
    })
    dataPart.shadowFiles = figures.shadowFiles
  }
  return assembleProjectBookFromParts(parts, project.meta.name || project.root.name || 'Estimate')
}

/** One Typst compile of the full project book (not a PDF merge). */
export async function compileProjectBookPdf(
  project: EestimateProject,
  abstractSource?: string
): Promise<Uint8Array> {
  const book = await assembleProjectBookCompileWithAssets(project, abstractSource)
  if (book.parts.length === 0) throw new Error('Nothing to print.')
  const result = await window.api.typst.compile(book.mainContent, book.inputs, book.shadowFiles)
  if (!result.ok || !result.data) {
    throw new Error(result.error || 'Typst compile failed.')
  }
  return decodeBase64(result.data)
}
