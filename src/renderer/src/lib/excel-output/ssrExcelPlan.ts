import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import type { buildRateAnalysisRenderData } from '../typist-output/dataTypst'

/** Excel uses the same sequential SSR percentage bases as the calculation trace. */
export function attachSsrExcelPlan(
  recipe: RateAnalysisRecipe,
  data: ReturnType<typeof buildRateAnalysisRenderData>
) {
  const round = (value: string, digits = 2) => `ROUND(${value},${digits})`
  const num = (value: unknown) =>
    Number(String(value ?? '').replaceAll(',', '')) || 0
  let labour = `({L}+${round(`{L}*${recipe.areaAllowancePercent || 0}/100`)})`
  let unitBase = round(`${labour}/{Q}`, 1),
    unitProfit = round(`${unitBase}*${recipe.overheadPercent || 0}/100`, 1)
  let unitMode = false
  const labourRows = data.labour_summary_rows.map((row) => {
    const text = row.label.toLowerCase(),
      percent = num((row.percent || row.qualifier || '').replace('%', ''))
    let formula: string | undefined
    if (/component\/unit qty/.test(text)) {
      unitMode = true
      unitBase = round(`${labour}/{Q}`, 1)
      formula = /including/.test(text)
        ? round(`${unitBase}+${unitProfit}`, 1)
        : unitBase
    } else if (/contractor|overhead/.test(text)) {
      unitMode = true
      unitProfit = round(
        `${unitBase}*${percent || recipe.overheadPercent || 0}/100`,
        1
      )
      formula = unitProfit
    } else if (!unitMode && /\badd\b/.test(text) && percent) {
      formula = round(`${labour}*${percent}/100`)
      labour = round(`${labour}+${formula}`)
    } else if (/total.*labour/.test(text)) formula = labour
    return { ...row, excel_formula: formula }
  })
  const sections: Record<string, string> = {
    materials: '{M}',
    machinery: '{H}',
    labour
  }
  const subtotal = round(`{M}+{H}+${labour}`)
  let running = subtotal
  let runningValue = data.totals.base_cost
  const nativeExpression = (source: string): string | undefined => {
    if (!source.startsWith('=')) return undefined
    const variables: Record<string, string> = {
      A: '{M}',
      B: '{H}',
      C: labour,
      MATERIALS: '{M}',
      MACHINERY: '{H}',
      LABOUR: labour,
      LABOR: labour,
      MATERIAL_LINES: '{M}',
      MACHINERY_LINES: '{H}',
      LABOUR_LINES: '{L}',
      LABOR_LINES: '{L}',
      ABC: subtotal,
      SUBTOTAL: subtotal,
      TOTAL: running,
      CURRENT: running,
      QTY: '{Q}',
      QUANTITY: '{Q}',
      OUTPUT: '{Q}',
      OVERHEAD: String(recipe.overheadPercent || 0),
      RATE: `(${running}/{Q})`
    }
    let valid = true
    const expression = source
      .slice(1)
      .replace(/([0-9.]+)\s*%/g, '($1/100)')
      .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
        const name = token.toUpperCase()
        if (variables[name]) return `(${variables[name]})`
        if (
          /^(MAT|MATERIAL|MAC|MACHINERY|LAB|LABOUR|LABOR)[0-9]+(_RATE)?$/.test(
            name
          )
        )
          return `{${name}}`
        valid = false
        return '0'
      })
    return valid && /^[0-9+*/().{}A-Z_\s-]+$/.test(expression)
      ? round(expression)
      : undefined
  }
  const trace =
    recipe.recalculation?.trace?.filter((row) => row.kind === 'abstract_row') ??
    []
  const abstractRows = data.abstract_rows.map((row) => {
    const text = row.label.toLowerCase(),
      amount = num(row.amount)
    const evidence =
      trace.find((item) => item.label === row.label)?.formula || ''
    let formula: string | undefined
    const explicit = nativeExpression(evidence)
    const section = /^a[ .)]*.*materials?/.test(text)
      ? 'materials'
      : /^b[ .)]*.*machinery/.test(text)
        ? 'machinery'
        : /^c[ .)]*.*labou?r/.test(text)
          ? 'labour'
          : undefined
    if (section) formula = sections[section]
    else if (row.is_rate) {
      const denominator = evidence.match(/running total \/ ([0-9.]+)/)?.[1]
      formula = explicit ?? round(`${running}/${denominator || '{Q}'}`)
    } else if (row.is_total_cost) {
      formula = running
      runningValue = amount
    } else if (row.is_total || /total/.test(text) || (!text && row.amount)) {
      formula = explicit ?? running
      if (explicit) running = explicit
      runningValue = amount
    } else if (explicit) {
      formula = explicit
      running = round(`${running}${/deduct/.test(text) ? '-' : '+'}${formula}`)
      runningValue += /deduct/.test(text) ? -amount : amount
    } else {
      const percentText = `${row.basis} ${row.qualifier} ${row.label}`.match(
        /(-?[0-9.]+)\s*%/
      )
      if (
        percentText &&
        /\badd\b|profit|overhead|transport/.test(text) &&
        !/deduct/.test(text)
      ) {
        let basis = running
        if (!evidence && !/profit|overhead|transport/.test(text)) {
          const materials = data.totals.material_total,
            machinery = data.totals.machinery_total,
            labourValue = data.totals.base_cost - materials - machinery,
            percent = Number(percentText[1])
          const options = [
            { expression: running, value: runningValue },
            { expression: subtotal, value: data.totals.base_cost },
            { expression: '{M}', value: materials },
            { expression: '{H}', value: machinery },
            { expression: labour, value: labourValue },
            { expression: `({H}+${labour})`, value: machinery + labourValue },
            {
              expression: `(({H}+${labour})*0.75)`,
              value: (machinery + labourValue) * 0.75
            }
          ]
          basis = options.reduce((closest, option) =>
            Math.abs(Math.round(option.value * percent) - amount * 100) <
            Math.abs(Math.round(closest.value * percent) - amount * 100)
              ? option
              : closest
          ).expression
        }
        if (/% of materials$/.test(evidence) || /transport/.test(text))
          basis = '{M}'
        else if (/% of machinery$/.test(evidence)) basis = '{H}'
        else if (/% of labour$/.test(evidence)) basis = labour
        else if (/% of machinery \+ labour$/.test(evidence))
          basis = `({H}+${labour})`
        else if (/75% excluding materials/.test(evidence))
          basis = `(({H}+${labour})*0.75)`
        else if (/A \+ B \+ C/.test(evidence)) basis = subtotal
        formula = round(`${basis}*${Number(percentText[1])}/100`)
        running = round(`${running}+${formula}`)
        runningValue += amount
      } else if (/add|deduct|adjust|rounding/.test(text) && amount) {
        running = round(`${running}${/deduct/.test(text) ? '-' : '+'}${amount}`)
        runningValue += /deduct/.test(text) ? -amount : amount
      }
    }
    return { ...row, excel_formula: formula }
  })
  if (!abstractRows.length) {
    const overhead = round(`${subtotal}*${recipe.overheadPercent || 0}/100`),
      total = round(`${subtotal}+${overhead}`)
    for (const [label, formula, is_rate, is_total_cost] of [
      ['A. Cost of Materials', '{M}', false, false],
      ['B. Hire charges of Machinery', '{H}', false, false],
      ['C. Cost of Labour', labour, false, false],
      ['Total', subtotal, false, false],
      ['D. Add contractor profit and overheads', overhead, false, false],
      ['Total cost for', total, false, true],
      [
        `Rate per ${recipe.unit || 'unit'}`,
        round(
          `${total}/{Q}`,
          recipe.recalculation || recipe.storedValues ? 2 : 1
        ),
        true,
        false
      ]
    ] as const)
      abstractRows.push({
        label,
        excel_formula: formula,
        amount: String(
          is_rate
            ? data.totals.rate_per_unit
            : is_total_cost
              ? data.totals.total_cost
              : label.startsWith('A')
                ? data.totals.material_total
                : label.startsWith('B')
                  ? data.totals.machinery_total
                  : label.startsWith('C')
                    ? data.totals.labour_cost_with_area_allowance
                    : label.startsWith('D')
                      ? data.totals.overhead_amount
                      : data.totals.base_cost
        ),
        basis: '',
        qualifier: '',
        is_rate,
        is_total_cost,
        is_total: false,
        is_caption: false
      })
  }
  return {
    ...data,
    labour_summary_rows: labourRows,
    abstract_rows: abstractRows
  }
}
