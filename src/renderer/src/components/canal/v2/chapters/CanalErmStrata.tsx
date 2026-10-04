import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { CanalData, CanalErmColumn, CanalSection } from '../../../../types/project'
import { canalCalculateExcavationPercentagesFromStrata, repopulateCanalQuickSections } from '../../../../lib/canal'
import { ERM_CLASSES, ERM_LAYERS, addErmColumn, applyErmRows, canalStrataTopRl, getErmColumns, parseErmPaste, validateErmRow, type ErmRow } from '../../../../lib/canalErm'
import { downloadErmExcelTemplate, ERM_ROCK_BOTTOM_LABEL, readErmExcel } from '../../../../lib/canalErmExcel'
import { newId } from '../../../../lib/tree'

function SectionRow({ section, columns, onSave }: { section: CanalSection; columns: CanalErmColumn[]; onSave: (row: ErmRow) => void }): JSX.Element {
  const top = canalStrataTopRl(section)
  const [cells, setCells] = useState(() => {
    let bottom = top
    const hasTop = section.strataTopRl != null || section.leftToeRl != null || section.ground.length > 0
    return [hasTop ? String(top) : '', ...columns.map((column, i) => {
      const index = section.strataTopRl == null ? ERM_LAYERS.findIndex((layer) => layer.name === column.name) : i
      const layer = section.strata?.[index]
      if (!layer) return index < 0 ? '-' : ''
      bottom -= layer.thickness
      return layer.thickness === 0 ? '-' : String(Math.round(bottom * 1000) / 1000)
    })]
  })
  const [rockRl, setRockRl] = useState(() => {
    if (section.strataHardRockBottomRl !== undefined) return String(section.strataHardRockBottomRl)
    const final = section.strata?.at(-1)
    if (final?.thickness && section.strataTopRl != null) return String(Math.round((top - section.strata!.reduce((sum, layer) => sum + layer.thickness, 0)) * 1000) / 1000)
    return section.strataExtent === 'limited' ? '-' : ''
  })
  const [message, setMessage] = useState('')
  const [cellColumnIds, setCellColumnIds] = useState(columns.map((column) => column.id))
  if (cellColumnIds.join(',') !== columns.map((column) => column.id).join(',')) {
    setCells([cells[0], ...columns.map((column) => {
      const index = cellColumnIds.indexOf(column.id)
      return index >= 0 ? cells[index + 1] : '-'
    })])
    setCellColumnIds(columns.map((column) => column.id))
  }

  const number = (cell: string): number => !cell.trim() ? NaN : Number(cell.replace(/,/g, ''))
  return <tr><th scope="row">{section.chainage}</th>{cells.map((cell, i) => <td key={i}><input type="text" inputMode="decimal" aria-label={`Ch ${section.chainage}: ${i === 0 ? 'Top RL' : columns[i - 1].name + ' bottom RL'}`} value={cell} placeholder={i === 0 ? 'RL' : 'RL or -'} onChange={(event) => { setMessage(''); setCells((values) => values.map((value, index) => index === i ? event.target.value : value)) }} /></td>)}
    <td><input type="text" inputMode="decimal" aria-label={`Ch ${section.chainage}: Hard Rock bottom RL`} value={rockRl} placeholder="RL or -" onChange={(event) => { setRockRl(event.target.value); setMessage('') }} /></td>
    <td className="canal-erm-row-actions"><button type="button" className="btn primary" onClick={() => {
      const row: ErmRow = { chainage: section.chainage, topRl: number(cells[0]), bottoms: cells.slice(1).map((cell) => cell.trim() === '-' || cell.trim() === '' ? null : number(cell)), end: rockRl.trim() === '-' || rockRl.trim() === '' ? 'unknown' : 'hard-rock', hardRockBottomRl: rockRl.trim() === '-' || rockRl.trim() === '' ? null : number(rockRl) }
      const error = validateErmRow(row, columns)
      setMessage(error ?? 'Saved')
      if (!error) onSave(row)
    }}>Save</button><small role="status">{message}</small></td></tr>
}

export default function CanalErmStrata({ data, onCommit }: { data: CanalData; onCommit: (update: (current: CanalData) => CanalData) => void }): JSX.Element {
  const [paste, setPaste] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [newChainage, setNewChainage] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [columnName, setColumnName] = useState('')
  const [columnClass, setColumnClass] = useState<CanalErmColumn['excavationClass'] | ''>('')
  const [afterColumn, setAfterColumn] = useState('')
  const columns = getErmColumns(data)
  const parsed = parseErmPaste(paste, columns)
  const errors = [...parsed.errors, ...parsed.rows.filter((row) => data.lengthM > 0 && row.chainage > data.lengthM).map((row) => `Ch ${row.chainage}: exceeds canal length ${data.lengthM} m.`)]
  const save = (rows: ErmRow[]): void => {
    onCommit((current) => {
      const next = repopulateCanalQuickSections(applyErmRows(current, rows))
      const shares = canalCalculateExcavationPercentagesFromStrata(next)
      return { ...next, excavationBands: next.excavationBands.map((band, i) => {
        const share = shares.find((item) => item.code === band.material.code) ?? shares[i]
        return share ? { ...band, pct: share.pct } : band
      }) }
    })
    setMessage(`Saved soil and rock levels for ${rows.length} chainage${rows.length === 1 ? '' : 's'}.`)
  }
  return <section className="canal-v2-section canal-erm-chapter">
    <header className="canal-v2-section-header"><div><span className="canal-v2-section-kicker">Chapter 2</span><h2>Soil & Rock Strata</h2><p>Enter the soil and rock levels found by the investigation.</p></div></header>
    <div className="canal-bank-recommendation canal-erm-explanation">
      <p><strong>How to enter the levels</strong></p>
      <p>Top RL is the level where the soil investigation starts. For each material, enter the bottom RL where that layer ends. The next layer starts at that level. All levels are in metres.</p>
      <p>Enter the levels you have. Leave other material cells blank or enter <strong>-</strong>.</p>
      <p><strong>How this affects excavation cost</strong></p>
      <p>The app uses these boundaries and the canal sections to separate excavation volume into All Soils, HDR, F&amp;F and Hard Rock. Each class uses its own selected SSR rate in Earthwork. <strong>Cost = material excavation volume × its rate.</strong> Extra material columns use the excavation class you select.</p>
    </div>
    <div className="canal-erm-excel-actions">
      <button type="button" className="btn primary" disabled={excelBusy} onClick={async () => {
        setExcelBusy(true)
        try { await downloadErmExcelTemplate(data) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not download the template.') }
        finally { setExcelBusy(false) }
      }}>Download Excel template</button>
      <button type="button" className="btn ghost" disabled={excelBusy} onClick={() => uploadRef.current?.click()}>Upload filled Excel</button>
      <input ref={uploadRef} type="file" accept=".xlsx" hidden aria-label="Upload soil and rock Excel workbook" onChange={async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setExcelBusy(true)
        setPaste('')
        try { const text = await readErmExcel(file, columns); setPaste(text); setImportOpen(true); setMessage(`Loaded ${file.name}. Review the rows below, then apply.`) }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read the workbook.') }
        finally { setExcelBusy(false) }
      }} />
      <p>Fill the template in Excel, save it as .xlsx, then upload it. The template includes your current material columns and an Instructions sheet.</p>
    </div>
    <details className="canal-ssr-details" open={importOpen} onToggle={(event) => setImportOpen(event.currentTarget.open)}><summary>Upload preview / paste rows from Excel</summary><p>Copy {columns.length + 3} columns in the current table order. A header row is optional for pasted cells.</p><p><strong>{['Chainage', 'Top RL', ...columns.map((column) => column.name + ' bottom RL'), ERM_ROCK_BOTTOM_LABEL].join(' | ')}</strong></p><p>Enter bottom RLs for the materials, or <strong>-</strong> for an absent layer.</p>
      <textarea aria-label="Paste soil and rock rows from Excel" rows={4} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste tab-separated Excel cells here" />
      {paste.trim() && <><p>{parsed.rows.length} valid rows ready.</p>{errors.map((error, i) => <p role="alert" key={i}>{error}</p>)}{parsed.rows.length > 0 && <div className="canal-soil-table-container"><table className="canal-soil-table"><thead><tr><th>Chainage</th><th>Top RL</th>{columns.map((column) => <th key={column.id}>{column.name}</th>)}<th>{ERM_ROCK_BOTTOM_LABEL}</th></tr></thead><tbody>{parsed.rows.map((row) => <tr key={row.chainage}><td>{row.chainage}</td><td>{row.topRl}</td>{row.bottoms.map((rl, i) => <td key={i}>{rl ?? 'Absent'}</td>)}<td>{row.hardRockBottomRl ?? 'Absent'}</td></tr>)}</tbody></table></div>}<button type="button" className="btn primary" disabled={!parsed.rows.length || errors.length > 0} onClick={() => { save(parsed.rows); setPaste('') }}>Apply rows</button></>}
      <p>Matching chainages are updated. New chainages are added as sections ready for ground entry.</p>
    </details>
    {message && <p className="canal-erm-status" role="status">{message}</p>}
    <div className="canal-erm-toolbar"><button type="button" className="btn primary" onClick={() => setAddingColumn((value) => !value)}><Plus size={16} /> Add material column</button><div className="canal-erm-add-chainage"><label className="canal-bank-field"><span>New chainage (m)</span><input type="number" min="0" max={data.lengthM || undefined} step="any" value={newChainage} onChange={(event) => setNewChainage(event.target.value)} placeholder="e.g. 37.5" /></label><button type="button" className="btn ghost" onClick={() => {
      const chainage = newChainage.trim() === '' ? NaN : Number(newChainage)
      if (!Number.isFinite(chainage) || chainage < 0 || (data.lengthM > 0 && chainage > data.lengthM)) { setMessage('Enter a chainage within the canal length.'); return }
      if (data.sections.some((section) => Math.abs(section.chainage - chainage) < 1e-6)) { setMessage(`Ch ${chainage} already has a row below.`); return }
      onCommit((current) => ({ ...current, sections: [...current.sections, { id: newId(), chainage, isManual: true, ground: [], designPopulated: false }].sort((a, b) => a.chainage - b.chainage) }))
      setNewChainage('')
      setMessage(`Added Ch ${chainage}. Enter its soil and rock levels below.`)
    }}>Add chainage</button></div></div>
    {addingColumn && <div className="canal-erm-column-form"><label className="canal-bank-field"><span>Material name</span><input autoFocus value={columnName} onChange={(event) => setColumnName(event.target.value)} placeholder="e.g. Murrum" /></label><label className="canal-bank-field"><span>Excavation class</span><select value={columnClass} onChange={(event) => setColumnClass(event.target.value as CanalErmColumn['excavationClass'])}><option value="">Choose class</option>{ERM_CLASSES.map((kind, i) => <option key={kind} value={kind}>{ERM_LAYERS[i].name}</option>)}</select></label><label className="canal-bank-field"><span>Insert column</span><select value={afterColumn} onChange={(event) => setAfterColumn(event.target.value)}><option value="">Before final hard rock</option><option value="first">Before first material</option>{columns.map((column) => <option key={column.id} value={column.id}>After {column.name}</option>)}</select></label><div className="canal-erm-column-actions"><button type="button" className="btn primary" disabled={!columnName.trim() || !columnClass} onClick={() => {
      if (!columnClass) return
      if (columns.some((column) => column.name.toLowerCase() === columnName.trim().toLowerCase())) { setMessage('A material column with this name already exists.'); return }
      const column = { id: newId(), name: columnName.trim(), excavationClass: columnClass }
      const at = afterColumn === 'first' ? 0 : afterColumn ? columns.findIndex((item) => item.id === afterColumn) + 1 : columns.length
      onCommit((current) => addErmColumn(current, column, at))
      setColumnName(''); setColumnClass(''); setAddingColumn(false)
      setMessage(`Added ${column.name}. Existing saved rows mark it absent until you enter its levels.`)
    }}>Add column</button><button type="button" className="btn ghost" onClick={() => setAddingColumn(false)}>Cancel</button></div><p>The selected excavation class determines which cutting slope and SSR excavation rate apply to this material.</p></div>}
    <div className="canal-soil-table-container canal-erm-table-wrap"><table className="canal-soil-table canal-erm-entry-table" style={{ minWidth: 590 + columns.length * 145 }}><colgroup><col style={{ width: 110 }} /><col style={{ width: 125 }} />{columns.map((column) => <col key={column.id} style={{ width: 145 }} />)}<col style={{ width: 145 }} /><col style={{ width: 95 }} /></colgroup><thead><tr><th>Chainage<small>m</small></th><th>Top RL<small>m</small></th>{columns.map((column) => <th key={column.id} title={column.name}>{column.name}<small>Bottom RL / - absent</small></th>)}<th>Hard Rock<small>Bottom RL / - absent</small></th><th>Save</th></tr></thead><tbody>{[...data.sections].sort((a, b) => a.chainage - b.chainage).map((section) => <SectionRow key={`${section.id}-${section.strataTopRl}-${section.strataExtent}-${section.strataHardRockBottomRl}-${section.strata?.filter((layer) => layer.thickness > 0).map((layer) => layer.name + ':' + layer.thickness).join(',')}`} section={section} columns={columns} onSave={(row) => save([row])} />)}</tbody></table></div>
    {!data.sections.length && <p>Paste Excel rows to add chainages, or create sections in setup.</p>}
    <p>Sections use these levels to show the material layers. Earthwork calculates quantities and costs by excavation class. </p>
  </section>
}
