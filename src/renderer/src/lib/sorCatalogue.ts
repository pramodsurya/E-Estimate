import type { SorCatalogueCommercialTerms, SorCatalogueDimensionValue, SorPublishedReference } from '../types/project'
import { record } from './sorSource'

export function sorCommercialTerms(
  sourceContext: Record<string, unknown>
): SorCatalogueCommercialTerms | undefined {
  const terms = record(sourceContext.commercial_terms)
  const basis = typeof terms.basis === 'string' ? terms.basis : undefined
  const transportation =
    typeof terms.transportation === 'string' ? terms.transportation : undefined
  const taxes = typeof terms.taxes === 'string' ? terms.taxes : undefined
  return basis || transportation || taxes ? { basis, transportation, taxes } : undefined
}

export function sourceContextTitle(sourceContext: Record<string, unknown>): string | null {
  return typeof sourceContext.title === 'string' ? sourceContext.title : null
}

function printedText(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || undefined
    : undefined
}

/** Read printed cells by their header, never from a hash, sort order or matrix row index. */
export function sorPublishedReference(
  catalogueName: string,
  sourceContext: Record<string, unknown>,
  dimensions: Record<string, SorCatalogueDimensionValue> = {}
): SorPublishedReference {
  const headers = Array.isArray(sourceContext.headers) ? sourceContext.headers : []
  const row = Array.isArray(sourceContext.raw_row) ? sourceContext.raw_row : []
  const cell = (names: string[]): string | undefined => {
    const index = headers.findIndex((header) =>
      names.includes(String(header).toLowerCase().replace(/[^a-z0-9]/g, ''))
    )
    return index >= 0 ? printedText(row[index]) : undefined
  }
  return {
    tableName: printedText(sourceContext.table_name) || printedText(sourceContext.title) || catalogueName,
    serialNumber: printedText(sourceContext.serial_number) || cell(['slno', 'sno', 'serialno', 'serialnumber']),
    scheduleItemNumber: printedText(sourceContext.schedule_item_number) || cell(['ssitemno', 'ssitemnumber', 'itemno', 'itemnumber']),
    rowLabel: printedText(dimensions.row_label),
    columnLabel: printedText(dimensions.column_label)
  }
}

export function sorPublishedReferenceLabel(reference: SorPublishedReference): string {
  return [
    reference.tableName,
    reference.serialNumber ? `Sl. No. ${reference.serialNumber}` : reference.rowLabel,
    !reference.serialNumber ? reference.columnLabel : undefined
  ].filter(Boolean).join(' · ')
}
