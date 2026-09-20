export interface SectionLayoutDecision {
  placement: 'left' | 'right' | 'full'
  columns: number
}

interface SectionLayoutInput {
  itemCount: number
  leftUsedRows: number
  rightUsedRows: number
  sideColumns: number
  fullColumns: number
  allowSidePlacement: boolean
}

/** Keep section summaries beside the shorter exhibit when they fit. */
export function chooseSectionItemLayout(input: SectionLayoutInput): SectionLayoutDecision {
  if (!input.allowSidePlacement || input.itemCount > input.sideColumns * 3) {
    return { placement: 'full', columns: Math.max(1, input.fullColumns) }
  }
  return {
    placement: input.leftUsedRows <= input.rightUsedRows ? 'left' : 'right',
    columns: Math.max(1, input.sideColumns)
  }
}

/** Format an RL compactly and flag values that need tighter table spacing. */
export function fitSectionNumber(value: number): { text: string; compact: boolean } {
  const text = Number.isFinite(value)
    ? value.toFixed(3).replace(/\.?0+$/, '')
    : '—'
  return { text, compact: text.length > 8 }
}
