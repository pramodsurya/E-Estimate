import type { CanalData, CanalErmColumn } from '../types/project'
import type { DetailGrid } from './excel-output/detailGrid'
import { getErmColumns } from './canalErm'

export const ERM_ROCK_BOTTOM_LABEL = 'Hard Rock bottom RL (m)'
export function ermExcelHeaders(columns: CanalErmColumn[]): string[] {
  return ['Chainage (m)', 'Top RL (m)', ...columns.map((column) => `${column.name} bottom RL (m)`), ERM_ROCK_BOTTOM_LABEL]
}

/** Input workbook only. Excavation quantities and SSR costs belong to the app. */
export function buildErmExcelTemplate(data: CanalData): unknown {
  const columns = getErmColumns(data)
  const headers = ermExcelHeaders(columns)
  const grid: DetailGrid = { cells: [], merges: [], images: [], rowBreaks: [], colWidthsChars: headers.map((_, i) => i < 2 ? 18 : 30), rowHeightsPt: [48] }
  headers.forEach((value, c) => grid.cells.push({ r: 0, c, value, style: { bold: true, wrap: true, colorRgb: 'FFFFFF', bgRgb: '164E63' } }))
  const sections = [...data.sections].sort((a, b) => a.chainage - b.chainage)
  for (let i = 0; i < Math.max(sections.length, 10); i++) {
    headers.forEach((_, c) => grid.cells.push({ r: i + 1, c, value: c === 0 && sections[i] ? sections[i].chainage : '', style: { colorRgb: '1D4ED8', bgRgb: i % 2 ? 'F0F9FF' : 'FFFFFF' } }))
    grid.rowHeightsPt.push(24)
  }
  const instructions = [
    'Soil & Rock Strata: how to fill this workbook',
    'Fill the Soil & Rock Strata sheet. Keep its headings and material columns unchanged. You can add chainage rows.',
    'Chainage (m): distance along the canal where the soil or rock investigation was carried out.',
    'Top RL (m): level where this geological profile starts. Use the levels in your investigation record.',
    'Material bottom RL (m): level where that material ends. Each next material starts at the previous bottom level.',
    'Enter the levels you have. Leave other material cells blank or enter -. Bottom levels must not increase down the profile.',
    'The app separates the excavation volume by material. Each excavation class uses its own selected SSR rate: cost = volume × rate.',
    'Add extra material columns in the app first, select their excavation class, then download a new template.',
    'Save as .xlsx, upload in Soil & Rock Strata, review the preview, and apply. Matching chainages are updated; new ones are added.'
  ]
  const help: DetailGrid = { cells: instructions.map((value, r) => ({ r, c: 0, value, style: { wrap: true, bold: r === 0, sizePt: r === 0 ? 15 : 11 } })), merges: [], images: [], rowBreaks: [], colWidthsChars: [105], rowHeightsPt: instructions.map((_, r) => r === 0 ? 30 : 42) }
  return { kind: 'page', page: { name: 'Soil & Rock Strata', landscape: true, grid, extraSheets: [{ name: 'Instructions', grid: help }] } }
}

export async function downloadErmExcelTemplate(data: CanalData): Promise<void> {
  if (!window.api?.excel?.compile) throw new Error('Open the desktop app to download the Excel template.')
  const result = await window.api.excel.compile(buildErmExcelTemplate(data))
  if (!result.ok || !result.data) throw new Error(result.error || 'Could not create the Excel template.')
  await window.api.export.workbook(result.data, 'Soil & Rock Strata Template.xlsx')
}

/** Read just workbook cells; macros, formulas and external links are never executed. */
export async function readErmExcel(file: File, columns: CanalErmColumn[]): Promise<string> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Upload an Excel .xlsx workbook.')
  if (file.size > 10 * 1024 * 1024) throw new Error('The workbook is too large. Upload a file smaller than 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length < 22) throw new Error('This is not a readable .xlsx workbook.')
  const view = new DataView(bytes.buffer)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < Math.max(0, bytes.length - 65557)) throw new Error('This is not a readable .xlsx workbook.')
  const files = new Map<string, { offset: number; size: number; expanded: number; method: number }>()
  let cursor = view.getUint32(end + 16, true)
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('The workbook archive is damaged.')
    const nameLength = view.getUint16(cursor + 28, true)
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    files.set(name, { method: view.getUint16(cursor + 10, true), size: view.getUint32(cursor + 20, true), expanded: view.getUint32(cursor + 24, true), offset: view.getUint32(cursor + 42, true) })
    cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
  }
  const xml = async (path: string): Promise<Document> => {
    const entry = files.get(path)
    if (!entry) throw new Error(`Workbook part is missing: ${path}.`)
    if (entry.expanded > 20 * 1024 * 1024) throw new Error('The worksheet is too large to import.')
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
    const packed = bytes.slice(start, start + entry.size)
    if (entry.method !== 0 && entry.method !== 8) throw new Error('Unsupported workbook compression. Save it as .xlsx in Excel.')
    const unpacked = entry.method === 0 ? packed : new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(unpacked), 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error('The workbook contains unreadable worksheet data.')
    return doc
  }
  const workbook = await xml('xl/workbook.xml')
  const sheets = Array.from(workbook.getElementsByTagNameNS('*', 'sheet'))
  const sheet = sheets.find((item) => item.getAttribute('name') === 'Soil & Rock Strata') ?? sheets.find((item) => item.getAttribute('name') === 'ERM Strata') ?? sheets[0]
  if (!sheet) throw new Error('The workbook has no worksheet.')
  const relationships = await xml('xl/_rels/workbook.xml.rels')
  const relationship = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).find((item) => item.getAttribute('Id') === sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
  const target = relationship?.getAttribute('Target')
  if (!target || relationship?.getAttribute('TargetMode') === 'External') throw new Error('Could not find the soil and rock worksheet.')
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`.replace(/^xl\/\.\//, 'xl/')
  const strings = files.has('xl/sharedStrings.xml') ? Array.from((await xml('xl/sharedStrings.xml')).getElementsByTagNameNS('*', 'si')).map((si) => Array.from(si.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join('')) : []
  const worksheet = await xml(path)
  const expected = ermExcelHeaders(columns)
  const rows = Array.from(worksheet.getElementsByTagNameNS('*', 'row')).map((row) => {
    const values = Array<string>(expected.length).fill('')
    for (const cell of Array.from(row.getElementsByTagNameNS('*', 'c'))) {
      const letters = /^[A-Z]+/.exec(cell.getAttribute('r') ?? '')?.[0]
      if (!letters) continue
      const c = Array.from(letters).reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1
      if (c >= expected.length) throw new Error('The worksheet has extra columns. Download a template matching the current material columns.')
      if (cell.getElementsByTagNameNS('*', 'f').length) throw new Error(`Cell ${cell.getAttribute('r')}: enter a level directly instead of a formula.`)
      const value = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? ''
      values[c] = cell.getAttribute('t') === 's' ? strings[Number(value)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? Array.from(cell.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join('') : value
    }
    if (values.some((value) => /[\t\r\n]/.test(value))) throw new Error('Enter one level or answer per cell, without line breaks.')
    return values
  }).filter((row) => row.some((value) => value.trim()))
  if (!rows.length || rows[0].some((value, i) => value.trim() !== expected[i])) throw new Error('The headings do not match your current material columns. Download a new template and keep its headings unchanged.')
  if (rows.length === 1) throw new Error('The workbook has no entered rows.')
  if (rows.slice(1).every((row) => row.slice(1).every((cell) => !cell.trim()))) {
    throw new Error('This workbook contains chainages only. Top RL and material levels are blank. Upload the filled workbook, not the blank Excel template.')
  }
  return rows.map((row) => row.join('\t')).join('\n')
}
