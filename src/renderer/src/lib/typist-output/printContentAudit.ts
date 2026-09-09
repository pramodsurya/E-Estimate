/** Content obligations, never a list of every runtime/layout variable. See docs/PRINT-CONTENT-AUDIT.md. */
export interface PrintObligation {
  id: string
  path: string
  label: string
  expected: string
}
export interface PrintIssue extends PrintObligation { status: 'missing' | 'unverified' }
type RecordData = Record<string, any>
const object = (value: unknown): value is RecordData => !!value && typeof value === 'object' && !Array.isArray(value)
const rows = (value: unknown): RecordData[] => Array.isArray(value) ? value.filter(object) : []
export const PRINT_AUDIT_VERSION = 'ee-print-audit:v1'

/** Clone and annotate CURRENT compiler inputs. Saved source cannot remove obligations. */
export function preparePrintAudit(inputs: Record<string, string> = {}) {
  const annotated = { ...inputs }
  const obligations: PrintObligation[] = []
  function add(record: RecordData, path: string, label: string) {
    const id = `ee-print:${path}`
    record._ee_print_id = id
    const expected = Object.entries(record)
      .filter(([key, value]) => !key.startsWith('_') && /quantity|qty|amount|total|rate|unit|chainage|code|label|name|description|text|role|value|estimated_cost|^v$/i.test(key)
        && (typeof value === 'number' || typeof value === 'string'))
      .map(([key, value]) => `${key}: ${String(value).slice(0, 400)}`).join('; ')
    obligations.push({ id, path, label, expected })
  }
  function collection(parent: RecordData, key: string, path: string, label: string, visit?: (r: RecordData, p: string) => void) {
    rows(parent[key]).forEach((record, index) => {
      const p = `${path}.${key}[${index}]`
      const name = record.name ?? record.label ?? record.heading ?? record.description ?? record.code ?? record.chainage ?? index + 1
      add(record, p, `${label} — ${String(name).slice(0, 160)}`)
      visit?.(record, p)
    })
  }
  function document(data: unknown, path: string) {
    if (!object(data)) return
    // Paragraphs are content records; font, margins, spacing and blank paragraphs are not obligations.
    rows(data.paragraphs).forEach((p, index) => {
      if (!p.isBlank && (p.table || rows(p.runs).some(r => r.text || r.inlineImage))) {
        add(p, `${path}.paragraphs[${index}]`, `Document paragraph ${index + 1}`)
      }
    })
  }
  function workbook(data: unknown, path: string, config: RecordData = {}) {
    if (!object(data) || !object(data.sheets)) return
    const sheetId = data.sheetOrder?.[0] ?? Object.keys(data.sheets)[0]
    const sheet = data.sheets[sheetId]
    if (!object(sheet)) return
    const range = config.range
    const bounds = Array.isArray(range) ? range : range ? [range.startRow, range.startColumn, range.endRow, range.endColumn] : null
    for (const [r, cells] of Object.entries(sheet.cellData ?? {})) {
      if (!object(cells) || sheet.rowData?.[r]?.hd === 1) continue
      for (const [c, cell] of Object.entries(cells)) {
        if (!object(cell) || (cell.v == null || cell.v === '') && !cell.p?.body?.dataStream?.trim()) continue
        if (bounds && (+r < bounds[0] || +c < bounds[1] || +r > bounds[2] || +c > bounds[3])) continue
        if (rows(sheet.mergeData).some(m => +r >= m.startRow && +r <= m.endRow && +c >= m.startColumn && +c <= m.endColumn && (+r !== m.startRow || +c !== m.startColumn))) continue
        add(cell, `${path}.sheets[${sheetId}].cellData[${r}][${c}]`, `Sheet ${sheet.name ?? sheetId}: row ${+r + 1}, column ${+c + 1}`)
      }
    }
  }
  for (const [inputKey, json] of Object.entries(inputs)) {
    let data: RecordData
    try { data = JSON.parse(json) } catch { continue }
    if (!object(data)) continue
    const p = inputKey
    if (data.schedules && data.payable_by_code) {
      collection(data, 'sections', p, `${data.component_name}: cross-section`)
      for (const key of ['payable_by_code', 'excavation_by_code']) {
        collection(data, key, p, `${data.component_name}: payable work`, (r, rp) =>
          collection(r, 'terms', rp, `${data.component_name}: ${r.code} contribution`))
        for (const obligation of obligations.filter(o => o.path.startsWith(`${p}.${key}[`))) {
          const match = obligation.path.match(/\[(\d+)\]/)
          const code = match ? data[key][Number(match[1])]?.code : undefined
          const roles = [...new Set(rows(data.payable_items).filter(item => item.code === code).map(item => String(item.role).replace(/[-_]/g, ' ')))]
          if (roles.length) obligation.label += ` (${roles.join(', ')})`
        }
      }
      collection(data, 'berms', p, `${data.component_name}: berm`)
    } else if (data.wall_groups && data.base_groups) {
      for (const key of ['wall_groups', 'base_groups']) collection(data, key, p, `${data.name}: guide wall`, (r, rp) => collection(r, 'rows', rp, `${r.heading}: measurement`))
      if (object(data.excavation)) collection(data.excavation, 'rows', `${p}.excavation`, 'Guide wall excavation')
      collection(data, 'figures', p, 'Guide wall figure')
    } else if (data.material_groups) {
      rows(data.material_groups).forEach((group, i) => collection(group, 'rows', `${p}.material_groups[${i}]`, `Seigniorage: ${group.label}`))
    } else if (data.materials && data.breakdowns) {
      collection(data, 'materials', p, 'Lead material')
      collection(data, 'breakdowns', p, 'Lead calculation', (r, rp) => collection(r, 'steps', rp, `${r.name}: calculation step`))
      if (data.map?.available) add(data.map, `${p}.map`, 'Saved lead route map')
    } else if (data.recipes || data.sor) {
      collection(data, 'sor', p, 'SOR item')
      collection(data, 'recipes', p, 'Rate analysis', (r, rp) => {
        // The data adapter's visibility flags are intentional frontend print selections.
        const visible = r.visible ?? r.visibility ?? {}
        for (const key of ['materials', 'machinery', 'labour', 'leads']) {
          if (visible[key] !== false) collection(r, key, rp, `${r.code}: ${key}`)
        }
      })
    } else if (data.component && data.abstract) {
      collection(data, 'abstract', p, 'Component abstract item')
      rows(data.items).forEach((item, index) => {
        if (item.templateGenerated) return // detailed quantities belong to the Bund/GW contract
        add(item, `${p}.items[${index}]`, `Item details: ${item.name}`)
        document(item.document, `${p}.items[${index}].document`)
        workbook(item.univer, `${p}.items[${index}].univer`, item.printConfig)
      })
    } else if (data.lines && data.summary) {
      collection(data, 'lines', p, 'General abstract work')
    }
    document(data.document, `${p}.document`)
    document(data, p)
    workbook(data.univer, `${p}.univer`, data.printConfig)
    if ('estimated_cost' in data) add(data, p, 'Cover estimated cost')
    annotated[inputKey] = JSON.stringify(data)
  }
  return { inputs: annotated, obligations }
}

/** Project books read shadow JSON files; keep them identical to the annotated sys.inputs. */
export function auditShadowFiles(inputs: Record<string, string>, files?: Record<string, string>) {
  if (!files) return files
  const result = { ...files }
  for (const [key, json] of Object.entries(inputs)) {
    for (const path of [`${key}.json`, `parts/${key}.json`]) {
      if (!(path in result)) continue
      const bytes = new TextEncoder().encode(json)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      result[path] = btoa(binary)
    }
  }
  return result
}

export function auditPrintContent(obligations: PrintObligation[], markers?: string[]): PrintIssue[] {
  const printed = new Set(markers ?? [])
  return obligations.filter(item => !printed.has(item.id)).map(item => ({
    ...item,
    // A legacy/custom template without markers cannot truthfully be declared missing.
    status: markers && printed.has(PRINT_AUDIT_VERSION) ? 'missing' : 'unverified'
  }))
}

export function printIssuesForAi(issues: PrintIssue[]): string {
  return `Required project content was not verified in this print. Preserve the custom layout and print the current data dynamically; do not hardcode values.\n${issues.map(i => `- ${i.label}\n  Variable: ${i.path}\n  Expected: ${i.expected}\n  Status: ${i.status}`).join('\n')}\n\nInside each rendered record, next to its actual quantity/content, emit #metadata(record.at("_ee_print_id", default: "")). Emit #metadata("${PRINT_AUDIT_VERSION}") once in the template. Do not emit markers for omitted records or in a separate checklist loop. Keep markers attached to the corresponding visible content. Layout settings are not printing obligations.`
}
