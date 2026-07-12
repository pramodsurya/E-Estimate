import {
  calculateRateAnalysis,
  invalidateRateAnalysisCalculation,
  labourRowsForDisplay,
  updateRateAnalysisLine
} from '../../lib/rateAnalysis'
import {
  defaultRateAnalysisLayout,
  descriptionRunsForDisplay,
  plainTextRun
} from '../../lib/rateAnalysisVisibility'
import type {
  LeadApplication,
  LeadRateCalculationDetail,
  LeadVariant
} from '../../types/project'
import type {
  RateAnalysisColumnLayout,
  RateAnalysisLine,
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
  RateAnalysisStoredRow,
  RateAnalysisTextRun
} from '../../types/rateAnalysis'

type StoredRowArea = 'labour' | 'abstract'

interface FormulaRef {
  token: string
  label: string
}

export default function RateAnalysisTable({
  recipe,
  editing,
  onChange,
  leadApplications = [],
  leadVariants = [],
  onLeadApplicationQuantityChange
}: {
  recipe: RateAnalysisRecipe
  editing: boolean
  onChange: (recipe: RateAnalysisRecipe) => void
  leadApplications?: LeadApplication[]
  leadVariants?: LeadVariant[]
  onLeadApplicationQuantityChange?: (applicationId: string, quantity: number) => void
}): JSX.Element {
  const summary = calculateRateAnalysis(recipe)
  const layout = recipe.layout ?? defaultRateAnalysisLayout(recipe.description)
  const recalculated = Boolean(recipe.recalculation)
  const labourRows = labourRowsForDisplay(recipe)
  const abstractRows = recipe.recalculation?.abstract ?? recipe.storedValues?.abstract ?? []
  const formulaRefs = buildFormulaRefs(recipe)

  const updateHeader = (
    field: 'description' | 'unit' | 'outputQuantity' | 'overheadPercent',
    value: string | number
  ): void => {
    if (field === 'description' && typeof value === 'string') {
      onChange(
        invalidateRateAnalysisCalculation({
          ...recipe,
          description: value,
          layout: { ...layout, descriptionRuns: [plainTextRun(value)] }
        })
      )
      return
    }
    onChange(invalidateRateAnalysisCalculation({ ...recipe, [field]: value }))
  }

  const updateLine = (
    sectionKey: RateAnalysisSectionKey,
    lineId: string,
    patch: Partial<RateAnalysisLine>
  ): void => {
    onChange(updateRateAnalysisLine(recipe, sectionKey, lineId, patch))
  }

  const setSectionLines = (
    sectionKey: RateAnalysisSectionKey,
    lines: RateAnalysisLine[]
  ): void => {
    onChange(
      invalidateRateAnalysisCalculation({
        ...recipe,
        sections: recipe.sections.map((section) =>
          section.key === sectionKey ? { ...section, lines } : section
        )
      })
    )
  }

  const insertSectionLine = (sectionKey: RateAnalysisSectionKey, index: number): void => {
    const section = recipe.sections.find((candidate) => candidate.key === sectionKey)
    if (!section) return
    const next = [...section.lines]
    next.splice(index, 0, newRateLine(sectionKey, index))
    setSectionLines(sectionKey, next)
  }

  const deleteSectionLine = (sectionKey: RateAnalysisSectionKey, lineId: string): void => {
    const section = recipe.sections.find((candidate) => candidate.key === sectionKey)
    if (!section) return
    setSectionLines(
      sectionKey,
      section.lines.filter((line) => line.id !== lineId)
    )
  }

  const setStoredRows = (area: StoredRowArea, rows: RateAnalysisStoredRow[]): void => {
    const storedValues = recipe.storedValues ?? {
      sectionTotals: {
        materials: formatMoney(summary.sectionTotals.materials),
        machinery: formatMoney(summary.sectionTotals.machinery),
        labour: formatMoney(summary.sectionTotals.labour)
      },
      labourExtract: labourRows,
      abstract: abstractRows
    }
    onChange(
      invalidateRateAnalysisCalculation({
        ...recipe,
        storedValues: {
          ...storedValues,
          labourExtract: area === 'labour' ? rows : labourRows,
          abstract: area === 'abstract' ? rows : abstractRows
        }
      })
    )
  }

  const labourLabels = layout.labourSummary.lines
  const abstractLabels = layout.abstract.lines

  return (
    <article className={`rate-sheet ${recalculated ? 'rate-sheet-recalculated' : 'rate-sheet-published'}`}>
      <div className="rate-document-header">
        {layout.codeVisible && <strong className="rate-sheet-code">{recipe.itemCode}</strong>}
        <div className="rate-document-meta">
          {recipe.documentTitle && <span>{recipe.documentTitle}</span>}
          <small>{recalculated ? 'Derived recalculation' : 'Published Supabase reconstruction'}</small>
        </div>
      </div>
      {layout.descriptionVisible &&
        (editing ? (
          <textarea
            className="rate-description-input"
            value={recipe.description}
            onChange={(event) => updateHeader('description', event.target.value)}
          />
        ) : (
          <div className="rate-description">
            <RichText
              runs={descriptionRunsForDisplay(recipe.description, layout.descriptionRuns)}
            />
          </div>
        ))}

      <div className="rate-sheet-heading">
        <span>DATA:</span>
        <strong>RATE ANALYSIS</strong>
        {layout.unitQuantityVisible ? (
          <span className="rate-basis">
            {layout.unitLabel}:
            {editing && !recipe.storedValues ? (
              <>
                <input
                  type="number"
                  value={recipe.outputQuantity}
                  onChange={(event) => updateHeader('outputQuantity', Number(event.target.value))}
                />
                <input
                  value={recipe.unit}
                  onChange={(event) => updateHeader('unit', event.target.value)}
                />
              </>
            ) : (
              <>
                <b>{formatQuantity(recipe.outputQuantity)}</b>
                <span>{recipe.unit}</span>
              </>
            )}
          </span>
        ) : (
          <span />
        )}
      </div>

      {recipe.sections.map((section) => {
        const sectionLayout = layout.sections[section.key]
        if (!sectionLayout.visible) return null
        const columns = sectionLayout.columns.filter((column) => column.visible)

        return (
          <section className={`rate-section rate-section-${section.key}`} key={section.key}>
            <div className="rate-section-title">{sectionLayout.title}</div>
            <table className="rate-table">
              <thead>
                <tr>
                  {columns.map((column) => {
                    const heading = splitHeading(column)
                    return (
                      <th
                        key={column.key}
                        rowSpan={heading.secondary ? 1 : 2}
                        className={columnClass(column.key)}
                      >
                        {heading.primary}
                      </th>
                    )
                  })}
                  {editing ? (
                    <th rowSpan={2} className="rate-row-tools">
                      Edit
                    </th>
                  ) : null}
                </tr>
                <tr>
                  {columns
                    .map((column) => ({ column, heading: splitHeading(column) }))
                    .filter(({ heading }) => heading.secondary)
                    .map(({ column, heading }) => (
                      <th key={column.key} className={columnClass(column.key)}>
                        {heading.secondary}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {section.lines.length === 0 ? (
                  <tr className="rate-empty-row">
                    <td colSpan={columns.length + (editing ? 1 : 0)}>
                      No {section.key} in this recipe.
                    </td>
                  </tr>
                ) : (
                  section.lines.map((line, lineIndex) => (
                    <tr key={line.id}>
                      {columns.map((column) => (
                        <td key={column.key} className={columnClass(column.key)}>
                          <LineValue
                            column={column}
                            line={line}
                            editing={editing}
                            showCalculatedAmount={recalculated}
                            onChange={(patch) => updateLine(section.key, line.id, patch)}
                          />
                        </td>
                      ))}
                      {editing ? (
                        <td className="rate-row-tools">
                          <RowEditControls
                            onInsertAbove={() => insertSectionLine(section.key, lineIndex)}
                            onInsertBelow={() => insertSectionLine(section.key, lineIndex + 1)}
                            onDelete={() => deleteSectionLine(section.key, line.id)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
                <TotalRow
                  columns={columns}
                  extraCell={editing}
                  label={sectionLayout.totalLabel}
                  value={
                    recipe.recalculation?.sectionTotals[section.key] ??
                    recipe.storedValues?.sectionTotals[section.key] ??
                    summary.sectionTotals[section.key]
                  }
                />
              </tbody>
            </table>
            {editing ? (
              <div className="section-edit-actions">
                <button
                  type="button"
                  onClick={() => insertSectionLine(section.key, section.lines.length)}
                >
                  Add {section.key} row
                </button>
              </div>
            ) : null}

            {section.key === 'labour' && layout.labourSummary.visible && (
              <div className="labour-component">
                {editing ? (
                  <StoredRowsEditor
                    area="labour"
                    rows={labourRows}
                    formulaRefs={formulaRefs}
                    onRowsChange={(rows) => setStoredRows('labour', rows)}
                  />
                ) : labourRows.length ? (
                  <StoredLabourRows rows={labourRows} />
                ) : (
                  <>
                    <SummaryLine
                      label={labourLabels[0] ?? 'Labour component / unit qty'}
                      value={summary.labourUnitBase}
                    />
                    <div className="summary-line">
                      <span>
                        {labourLabels[1] ?? "Add contractor's profit and overhead charges"}
                      </span>
                      {editing ? (
                        <label className="overhead-input">
                          <NumberInput
                            value={recipe.overheadPercent}
                            onChange={(value) => updateHeader('overheadPercent', value)}
                          />
                          %
                        </label>
                      ) : (
                        <span>{formatPercent(recipe.overheadPercent)}%</span>
                      )}
                      <strong>{formatMoney(summary.labourUnitProfit)}</strong>
                    </div>
                    <SummaryLine
                      label={
                        labourLabels[2] ??
                        "Labour component / unit qty (including contractor's profit)"
                      }
                      value={summary.labourUnitTotal}
                      strong
                    />
                  </>
                )}
              </div>
            )}
          </section>
        )
      })}

      {layout.abstract.visible && (
        <div className="rate-abstract">
          <div className="rate-section-title">{layout.abstract.title}</div>
          {editing ? (
            <StoredRowsEditor
              area="abstract"
              rows={abstractRows}
              formulaRefs={formulaRefs}
              onRowsChange={(rows) => setStoredRows('abstract', rows)}
            />
          ) : recipe.recalculation ? (
            <StoredAbstractRows rows={recipe.recalculation.abstract} />
          ) : recipe.storedValues ? (
            <StoredAbstractRows rows={recipe.storedValues.abstract} />
          ) : (
            <>
              <SummaryLine
                label={abstractLabels[0] ?? 'A. Cost of Materials'}
                value={summary.sectionTotals.materials}
                currency
              />
              <SummaryLine
                label={abstractLabels[1] ?? 'B. Hire charges of Machinery'}
                value={summary.sectionTotals.machinery}
                currency
              />
              <SummaryLine
                label={abstractLabels[2] ?? 'C. Cost of Labour'}
                value={summary.sectionTotals.labour}
                currency
              />
              <SummaryLine
                label={abstractLabels[3] ?? 'Total'}
                value={summary.baseCost}
                currency
              />
              <div className="summary-line">
                <span>
                  {abstractLabels[4] ?? "D. Add for contractor's profit and overheads on (A+B+C)"}
                </span>
                <span>{formatPercent(recipe.overheadPercent)}%</span>
                <span>Rs:</span>
                <strong>{formatMoney(summary.overheadAmount)}</strong>
              </div>
              <SummaryLine
                label={abstractLabels[5] ?? 'Total cost'}
                value={summary.totalCost}
                currency
                strong
              />
              <div className="summary-line rate-per-unit">
                <strong>{abstractLabels[6] ?? `Rate Per ${recipe.unit || 'unit'}`}</strong>
                <span>(A+B+C+D) / {formatQuantity(recipe.outputQuantity)}</span>
                <span>Rs:</span>
                <strong>{formatMoney(summary.ratePerUnit)}</strong>
              </div>
            </>
          )}
        </div>
      )}
      {leadApplications.length > 0 && (
          <LeadAdditions
            applications={leadApplications}
            variants={leadVariants}
            outputQuantity={recipe.outputQuantity}
            baseFinalAmount={summary.totalCost}
            baseRate={summary.ratePerUnit}
            editing={editing}
            onQuantityChange={onLeadApplicationQuantityChange}
          />
      )}
    </article>
  )
}

function LeadAdditions({
  applications,
  variants,
  outputQuantity,
  baseFinalAmount,
  baseRate,
  editing,
  onQuantityChange
}: {
  applications: LeadApplication[]
  variants: LeadVariant[]
  outputQuantity: number
  baseFinalAmount: number
  baseRate: number
  editing: boolean
  onQuantityChange?: (applicationId: string, quantity: number) => void
}): JSX.Element {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  const leadTotal = applications.reduce((sum, application) => sum + application.grossAmount, 0)
  const denominator = outputQuantity || 1
  const safeBaseAmount =
    Number.isFinite(baseFinalAmount) && baseFinalAmount > 0
      ? baseFinalAmount
      : baseRate * denominator
  const finalAmount = safeBaseAmount + leadTotal
  const finalRate = finalAmount / denominator
  const onlyDisposalLead =
    applications.length > 0 &&
    applications.every((application) => isDisposalLeadVariant(variantById.get(application.variantId)))
  const title = onlyDisposalLead ? 'Disposal Lead' : 'Lead Additions'
  const totalLabel = onlyDisposalLead ? 'Add Disposal Lead total' : 'Add Lead/Lift total'
  const finalAmountLabel = onlyDisposalLead
    ? 'Final amount with Disposal Lead'
    : 'Final amount with Lead'
  const finalRateLabel = onlyDisposalLead
    ? 'Rate per unit with Disposal Lead'
    : 'Rate per unit with Lead'

  return (
    <div className="lead-rate-extension">
      <div className="rate-section-title">{title}</div>
      <div className="lead-rate-row lead-rate-head">
        <span>Material / basis</span>
        <span>Quantity</span>
        <span>Rate</span>
        <span>Amount</span>
      </div>
      {applications.map((application) => {
        const variant = variantById.get(application.variantId)
        const disposalLead = isDisposalLeadVariant(variant)
        const material = disposalLead ? 'Disposal Lead' : variant?.materialName ?? 'Lead'
        const km = variant ? `${formatQuantity(variant.leadKm)} km` : ''
        const lift = variant?.liftM ? `, lift ${formatQuantity(variant.liftM)} m` : ''
        const warnings = leadApplicationWarnings(application, variant)
        return (
          <div className="lead-rate-entry" key={application.id}>
            {application.calculation && (
              <LeadDeductionLine
                calculation={application.calculation}
                unit={application.unit}
                disposalLead={disposalLead}
              />
            )}
            <div className="lead-rate-row">
              <span>
                <strong>{material}</strong>
                <small>
                  {application.quantitySource}
                  {km ? ` | ${km}${lift}` : ''}
                </small>
              </span>
              <span>
                {editing && disposalLead && onQuantityChange ? (
                  <span className="lead-quantity-edit">
                    <NumberInput
                      value={application.quantity}
                      onChange={(value) => onQuantityChange(application.id, value)}
                    />
                    <em>{application.unit}</em>
                  </span>
                ) : (
                  `${formatQuantity(application.quantity)} ${application.unit}`
                )}
              </span>
              <span>Rs: {formatMoney(application.grossRate)}</span>
              <strong>Rs: {formatMoney(application.grossAmount)}</strong>
            </div>
            {warnings.map((warning) => (
              <div className="lead-rate-row lead-rate-warning" key={warning.message}>
                <span>{warning.message}</span>
                <span />
                <span>{warning.detail}</span>
                <span />
              </div>
            ))}
          </div>
        )
      })}
      <div className="lead-rate-summary">
        <span>Base final amount</span>
        <strong>Rs: {formatMoney(safeBaseAmount)}</strong>
      </div>
      <div className="lead-rate-summary">
        <span>{totalLabel}</span>
        <strong>Rs: {formatMoney(leadTotal)}</strong>
      </div>
      <div className="lead-rate-summary final">
        <span>{finalAmountLabel}</span>
        <strong>Rs: {formatMoney(finalAmount)}</strong>
      </div>
      <div className="lead-rate-summary final">
        <span>{finalRateLabel}</span>
        <strong>Rs: {formatMoney(finalRate)}</strong>
      </div>
    </div>
  )
}

function leadApplicationWarnings(
  application: LeadApplication,
  variant: LeadVariant | undefined
): Array<{ message: string; detail: string }> {
  const warnings: Array<{ message: string; detail: string }> = []
  const deliveryWarning = deliveryAtSiteLeadWarning(application, variant)
  if (deliveryWarning) {
    warnings.push({
      message: deliveryWarning,
      detail: application.deliveryAtSiteOverrideReason
        ? `Reason: ${application.deliveryAtSiteOverrideReason}`
        : 'No override reason recorded'
    })
  }
  const handlingWarning = loadingUnloadingLeadWarning(application, variant)
  if (handlingWarning) {
    warnings.push({
      message: handlingWarning,
      detail: application.handlingOverrideReason
        ? `Reason: ${application.handlingOverrideReason}`
        : 'No override reason recorded'
    })
  }
  return warnings
}

function isDisposalLeadVariant(variant: LeadVariant | undefined): boolean {
  return variant?.materialName.trim().toLowerCase() === 'disposal lead'
}

function deliveryAtSiteLeadWarning(
  application: LeadApplication,
  variant: LeadVariant | undefined
): string {
  if (application.deliveryAtSiteWarning) return application.deliveryAtSiteWarning
  if (
    variant &&
    (variant.conveyanceClass === 'CEMENT' || variant.conveyanceClass === 'STEEL') &&
    variant.leadKm > 0.15
  ) {
    return 'Cement/steel basic rate is normally delivery at site. External lead may duplicate transport already included in the material rate.'
  }
  return ''
}

function loadingUnloadingLeadWarning(
  application: LeadApplication,
  variant: LeadVariant | undefined
): string {
  if (application.handlingWarning) return application.handlingWarning
  if (
    variant &&
    variant.handlingMode !== 'none' &&
    (application.loadingRate > 0 || application.unloadingRate > 0)
  ) {
    return 'Loading/unloading is added from the Lead variant. Use only when it is separately admissible and not already covered in the parent DATA item.'
  }
  return ''
}

function LeadDeductionLine({
  calculation,
  unit,
  disposalLead
}: {
  calculation: LeadRateCalculationDetail
  unit: string
  disposalLead: boolean
}): JSX.Element | null {
  if (!calculation.deductedLeadRate) return null
  const label = leadDeductionLabel(calculation, disposalLead)
  return (
    <div className="lead-rate-row lead-rate-deduction">
      <span>{label}</span>
      <span />
      <code>
        Rs: {formatMoney(calculation.fullLeadRate)} - Rs: {formatMoney(calculation.deductedLeadRate)}
      </code>
      <strong>
        Rs: {formatMoney(calculation.netLeadRate)}/{calculation.unit || unit}
      </strong>
    </div>
  )
}

function leadDeductionLabel(calculation: LeadRateCalculationDetail, disposalLead = false): string {
  const row = calculation.rows.find((candidate) => candidate.amount < 0)
  const label = row?.label ?? ''
  const km = label.match(/initial\s+([0-9.]+)\s*km/i)
  const prefix = disposalLead ? 'Disposal lead rate' : 'Rate of Lead'
  if (km) return `${prefix} after removing ${km[1]} km of Initial Lead`
  if (/all leads/i.test(label)) return `${prefix} after removing all included Initial Lead`
  return `${prefix} after removing included Initial Lead`
}

function RichText({ runs }: { runs: RateAnalysisTextRun[] }): JSX.Element {
  return (
    <>
      {runs.map((run, index) => {
        let content: JSX.Element = <>{run.text}</>
        if (run.bold) content = <strong>{content}</strong>
        if (run.italic) content = <em>{content}</em>
        if (run.underline) content = <u>{content}</u>
        return <span key={`${index}-${run.text.slice(0, 12)}`}>{content}</span>
      })}
    </>
  )
}

function LineValue({
  column,
  line,
  editing,
  showCalculatedAmount,
  onChange
}: {
  column: RateAnalysisColumnLayout
  line: RateAnalysisLine
  editing: boolean
  showCalculatedAmount: boolean
  onChange: (patch: Partial<RateAnalysisLine>) => void
}): JSX.Element {
  if (column.key === 'sl_no') {
    return editing ? (
      <input value={line.slNo} onChange={(event) => onChange({ slNo: event.target.value })} />
    ) : (
      <>{line.slNo}</>
    )
  }
  if (column.key === 'description') {
    return editing ? (
      <input
        value={line.description}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    ) : (
      <>{line.description}</>
    )
  }
  if (column.key === 'unit') {
    return editing ? (
      <input value={line.unit} onChange={(event) => onChange({ unit: event.target.value })} />
    ) : (
      <>{line.unit}</>
    )
  }

  const value = line[column.key]
  const storedValue =
    column.key === 'quantity'
      ? line.sourceValues?.quantity
      : column.key === 'rate'
        ? line.sourceValues?.rate
        : line.sourceValues?.amount

  if (editing && column.key === 'amount') {
    return <>{showCalculatedAmount ? formatMoney(value) : storedValue !== undefined ? storedValue : formatMoney(value)}</>
  }

  if (!editing && line.linkedRate && (column.key === 'rate' || column.key === 'amount')) {
    return (
      <span className="linked-rate-cell">
        <span>{column.key === 'rate' ? formatMoney(line.linkedRate.rate) : formatMoney(line.amount)}</span>
        <small>
          Linked SOR {line.linkedRate.year}, {zoneLabel(line.linkedRate.zone)}
        </small>
      </span>
    )
  }

  return editing ? (
    <NumberInput value={value} onChange={(next) => onChange({ [column.key]: next })} />
  ) : (
    <>
      {showCalculatedAmount && column.key === 'amount'
        ? formatMoney(value)
        : storedValue !== undefined
        ? storedValue
        : column.key === 'quantity'
          ? formatQuantity(value)
          : formatMoney(value)}
    </>
  )
}

function zoneLabel(zone: string): string {
  if (zone === 'zone_1') return 'Zone I'
  if (zone === 'zone_2') return 'Zone II'
  return 'Zone III'
}

function TotalRow({
  columns,
  extraCell = false,
  label,
  value
}: {
  columns: RateAnalysisColumnLayout[]
  extraCell?: boolean
  label: string
  value: number | string
}): JSX.Element {
  const displayValue = typeof value === 'string' ? value : formatMoney(value)
  const amountIndex = columns.findIndex((column) => column.key === 'amount')
  const rateIndex = columns.findIndex((column) => column.key === 'rate')
  if (amountIndex < 0 || rateIndex < 0) {
    return (
      <tr className="rate-total-row">
        <td colSpan={Math.max(columns.length - 1, 1)}>{label}</td>
        <td className="rate-number">{displayValue}</td>
        {extraCell ? <td className="rate-row-tools" /> : null}
      </tr>
    )
  }

  const leading = columns.slice(0, rateIndex)
  const hasSerial = leading[0]?.key === 'sl_no'
  const labelSpan = Math.max(leading.length - (hasSerial ? 1 : 0), 1)

  return (
    <tr className="rate-total-row">
      {hasSerial && <td />}
      <td colSpan={labelSpan}>{label}</td>
      <td>Rs:</td>
      <td className="rate-number">{displayValue}</td>
      {extraCell ? <td className="rate-row-tools" /> : null}
    </tr>
  )
}

function StoredLabourRows({ rows }: { rows: RateAnalysisStoredRow[] }): JSX.Element {
  const normalizedRows = normalizeLabourRows(rows)
  return (
    <>
      {normalizedRows.map((row, index) => {
        const hasAmount = Boolean(row.amount)
        return (
          <div
            className={[
              'labour-summary-row',
              hasAmount ? 'has-value' : '',
              row.kind === 'allowance' ? 'allowance-row' : '',
              row.kind === 'total' ? 'total-labour-row' : '',
              /^Add contractor/i.test(row.label) ? 'overhead-row' : '',
              row.kind === 'final' ? 'is-final' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            key={`${index}-${row.label}-${row.qualifier}`}
          >
            <span>{row.label}</span>
            <span>{row.percent}</span>
            <span>{row.qualifier}</span>
            <strong>{row.amount}</strong>
          </div>
        )
      })}
    </>
  )
}

function StoredAbstractRows({ rows }: { rows: RateAnalysisStoredRow[] }): JSX.Element {
  const normalizedRows = normalizeStoredRows(rows)
  return (
    <div className="stored-abstract">
      {normalizedRows.map((normalized, index) => {
        const label = normalized.label
        const isRate = /^rate per/i.test(label)
        const isTotalCost = /^total cost for/i.test(label)
        const isTotal = normalized.qualifier.toLowerCase() === 'total'
        const isCaption = /^vertical lift gates/i.test(label)
        const amountClass =
          isRate || isTotalCost || isTotal ? 'stored-amount ruled' : 'stored-amount'
        return (
          <div
            className={[
              'stored-abstract-row',
              isTotal ? 'total-row' : '',
              isTotalCost ? 'total-cost-row' : '',
              isRate ? 'rate-row' : '',
              isCaption ? 'caption-row' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            key={`${index}-${normalized.label}-${normalized.basis}-${normalized.qualifier}`}
          >
            <span className="stored-label">{label}</span>
            <span className="stored-basis">{normalized.basis}</span>
            <span className="stored-qualifier">{normalized.qualifier}</span>
            <span className="stored-currency">{normalized.amount ? 'Rs:' : ''}</span>
            <span className={amountClass}>{normalized.amount}</span>
          </div>
        )
      })}
    </div>
  )
}

function StoredRowsEditor({
  area,
  rows,
  formulaRefs,
  onRowsChange
}: {
  area: StoredRowArea
  rows: RateAnalysisStoredRow[]
  formulaRefs: FormulaRef[]
  onRowsChange: (rows: RateAnalysisStoredRow[]) => void
}): JSX.Element {
  const updateRow = (index: number, patch: Partial<RateAnalysisStoredRow>): void => {
    onRowsChange(
      rows.map((row, i) => {
        if (i !== index) return row
        const amountOverride =
          patch.amount !== undefined
            ? true
            : patch.percent !== undefined
              ? false
              : row.amountOverride
        return { ...row, ...patch, userAdded: true, amountOverride }
      })
    )
  }
  const insertRow = (index: number): void => {
    const next = [...rows]
    next.splice(index, 0, blankStoredRow(area))
    onRowsChange(next)
  }
  const deleteRow = (index: number): void => {
    onRowsChange(rows.filter((_, i) => i !== index))
  }
  const insertFormulaRef = (index: number, token: string): void => {
    if (!token) return
    const row = rows[index]
    const current = row.amount.trim()
    const next =
      current && current.startsWith('=')
        ? `${current} + ${token}`
        : current
          ? `=${current} + ${token}`
          : `=${token}`
    updateRow(index, { amount: next })
  }

  return (
    <div className={`stored-row-editor stored-row-editor-${area}`}>
      <div className="stored-row-editor-head">
        <span>Actions</span>
        <span>Label / wording</span>
        <span>Value</span>
        <span>%</span>
        <span>Unit / note</span>
        <span>Basis</span>
        <span>Amount / formula</span>
      </div>
      {rows.length === 0 ? (
        <div className="stored-row-editor-empty">
          No rows. Add a row to start editing this block.
        </div>
      ) : null}
      {rows.map((row, index) => (
        <div className="stored-row-editor-row" key={`${index}-${row.label}-${row.amount}`}>
          <RowEditControls
            onInsertAbove={() => insertRow(index)}
            onInsertBelow={() => insertRow(index + 1)}
            onDelete={() => deleteRow(index)}
          />
          <input
            value={row.label}
            onChange={(event) => updateRow(index, { label: event.target.value })}
            placeholder="Row wording"
          />
          <input
            value={row.value}
            onChange={(event) => updateRow(index, { value: event.target.value })}
            placeholder="Value"
          />
          <input
            value={row.percent}
            onChange={(event) => updateRow(index, { percent: event.target.value })}
            placeholder="13.615%"
          />
          <input
            value={row.unit}
            onChange={(event) => updateRow(index, { unit: event.target.value })}
            placeholder="Rs: / Total / unit"
          />
          <input
            value={row.basis}
            onChange={(event) => updateRow(index, { basis: event.target.value })}
            placeholder="Basis"
          />
          <div className="formula-cell">
            <input
              value={row.amount}
              onChange={(event) => updateRow(index, { amount: event.target.value })}
              placeholder="0.00 or =A+B+C"
              title="Use numbers or formulas. Available tokens include A, B, C, TOTAL, QTY, MAT1, MAC1, LAB1."
            />
            <select value="" onChange={(event) => insertFormulaRef(index, event.target.value)}>
              <option value="">Insert ref</option>
              {formulaRefs.map((ref) => (
                <option key={ref.token} value={ref.token}>
                  {ref.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button type="button" className="stored-row-add" onClick={() => insertRow(rows.length)}>
        Add {area} row
      </button>
      <div className="stored-row-formula-help">
        Formulas start with =. Examples: =A+B+C, =TOTAL*3%, =MAT1+LAB2. User-added
        abstract rows with an amount/formula are included in the running total.
      </div>
    </div>
  )
}

function RowEditControls({
  onInsertAbove,
  onInsertBelow,
  onDelete
}: {
  onInsertAbove: () => void
  onInsertBelow: () => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div className="row-edit-controls">
      <button type="button" title="Insert row above" onClick={onInsertAbove}>
        +^
      </button>
      <button type="button" title="Insert row below" onClick={onInsertBelow}>
        +v
      </button>
      <button type="button" title="Delete row" onClick={onDelete}>
        Del
      </button>
    </div>
  )
}

interface NormalizedStoredRow {
  label: string
  basis: string
  qualifier: string
  amount: string
}

function normalizeLabourRows(
  rows: RateAnalysisStoredRow[]
): Array<{
  label: string
  percent: string
  qualifier: string
  amount: string
  kind: 'allowance' | 'total' | 'component' | 'final'
}> {
  const result: Array<{
    label: string
    percent: string
    qualifier: string
    amount: string
    kind: 'allowance' | 'total' | 'component' | 'final'
  }> = []

  for (const source of rows) {
    const label = source.label.trim()
    const value = source.value.trim()
    const percent = uniqueText(source.percent, source.unit)

    if (!label && !value && percent && result.length) {
      result[result.length - 1].percent = uniqueText(result[result.length - 1].percent, percent)
      continue
    }
    if (!label && (!value || /^Rs:?$/i.test(value))) continue

    if (/^Add towards highly skilled labour charges/i.test(label)) {
      result.push({
        label,
        percent,
        qualifier: value && !numberText(value) ? value : '',
        amount: source.amount || (numberText(value) ? value : ''),
        kind: 'allowance'
      })
      continue
    }

    if (/^Total Cost of Labour$/i.test(label)) {
      result.push({
        label,
        percent,
        qualifier: value && !numberText(value) ? value : '',
        amount: source.amount || (numberText(value) ? value : ''),
        kind: 'total'
      })
      continue
    }

    const isFinal = /including contractor's/i.test(label)
    result.push({
      label: isFinal && /contractor's$/i.test(label) ? `${label} profit)` : label,
      percent,
      qualifier: value && !numberText(value) ? value : '',
      amount: source.amount || (numberText(value) ? value : ''),
      kind: isFinal ? 'final' : 'component'
    })
  }

  return result
}

function normalizeStoredRows(rows: RateAnalysisStoredRow[]): NormalizedStoredRow[] {
  const normalized: NormalizedStoredRow[] = []

  for (const row of rows) {
    const current = normalizeStoredRow(row)
    if (!current.label && normalized.length) {
      const previous = normalized[normalized.length - 1]
      if (/^F\.\s|^Total cost for/i.test(previous.label)) {
        previous.basis = uniqueText(previous.basis, current.basis)
        previous.qualifier = uniqueText(previous.qualifier, current.qualifier)
        if (previous.basis === previous.qualifier) previous.qualifier = ''
        if (!previous.amount) previous.amount = current.amount
        continue
      }
    }
    if (/^te per\b/i.test(current.label)) current.label = `Ra${current.label}`
    if (/^vertical lift gates/i.test(current.label) && current.basis) {
      current.label = `${current.label} ${current.basis}`
      current.basis = ''
    }
    normalized.push(current)
  }

  return normalized
}

function normalizeStoredRow(row: RateAnalysisStoredRow): {
  label: string
  basis: string
  qualifier: string
  amount: string
} {
  let label = row.label.trim()
  let qualifier = uniqueText(row.percent, row.unit)
  const brokenSuffix = row.unit.match(/^(.*?)(-?\d+(?:\.\d+)?%)$/)
  if (brokenSuffix && label && !/^(Rs:|Total)$/i.test(row.unit)) {
    const suffix = brokenSuffix[1].trim()
    if (suffix && /[A-Za-z)]/.test(suffix)) label = `${label} ${suffix}`.replace(/\s+/g, ' ')
    qualifier = brokenSuffix[2]
  }
  if (/^Rs:$/i.test(row.unit)) qualifier = ''
  return {
    label,
    basis: row.basis,
    qualifier,
    amount: row.amount || row.value
  }
}

function numberText(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value.trim())
}

function uniqueText(...values: string[]): string {
  const out: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (value && !out.includes(value)) out.push(value)
  }
  return out.join(' ')
}

function newRateLine(sectionKey: RateAnalysisSectionKey, index: number): RateAnalysisLine {
  return {
    id: `${sectionKey}-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    slNo: String(index + 1),
    description: '',
    unit: '',
    quantity: 0,
    rate: 0,
    amount: 0,
    sourceValues: {}
  }
}

function blankStoredRow(area: StoredRowArea): RateAnalysisStoredRow {
  return {
    label: area === 'abstract' ? 'Add custom row' : 'Add labour adjustment',
    value: '',
    unit: '',
    basis: '',
    percent: '',
    amount: '',
    userAdded: true
  }
}

function buildFormulaRefs(recipe: RateAnalysisRecipe): FormulaRef[] {
  const refs: FormulaRef[] = [
    { token: 'A', label: 'A materials' },
    { token: 'B', label: 'B machinery' },
    { token: 'C', label: 'C labour' },
    { token: 'TOTAL', label: 'Running total' },
    { token: 'QTY', label: 'Output qty' }
  ]
  const prefixes: Record<RateAnalysisSectionKey, string> = {
    materials: 'MAT',
    machinery: 'MAC',
    labour: 'LAB'
  }
  for (const section of recipe.sections) {
    section.lines.forEach((line, index) => {
      const n = index + 1
      const prefix = prefixes[section.key]
      const name = line.description || `${section.key} row ${n}`
      refs.push({ token: `${prefix}${n}`, label: `${prefix}${n} amount - ${name}` })
      refs.push({ token: `${prefix}${n}_RATE`, label: `${prefix}${n} rate - ${name}` })
    })
  }
  return refs
}

function splitHeading(column: RateAnalysisColumnLayout): {
  primary: string
  secondary: string
} {
  if (column.key !== 'rate' && column.key !== 'amount') {
    return { primary: column.label, secondary: '' }
  }
  const match = column.label.match(/^(.*?)\s+(in\s+Rs\.?)$/i)
  return match
    ? { primary: match[1], secondary: match[2] }
    : { primary: column.label, secondary: '' }
}

function columnClass(key: RateAnalysisColumnLayout['key']): string {
  if (key === 'sl_no') return 'rate-sl'
  if (key === 'unit') return 'rate-unit'
  if (key === 'quantity' || key === 'rate' || key === 'amount') return 'rate-number'
  return 'rate-particular'
}

function NumberInput({
  value,
  onChange
}: {
  value: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <input
      type="number"
      step="any"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

function SummaryLine({
  label,
  value,
  currency = false,
  strong = false
}: {
  label: string
  value: number
  currency?: boolean
  strong?: boolean
}): JSX.Element {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <span />
      {currency && <span>Rs:</span>}
      {strong ? <strong>{formatMoney(value)}</strong> : <span>{formatMoney(value)}</span>}
    </div>
  )
}

function formatMoney(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function formatQuantity(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000'
}
