import { useEffect, useState } from 'react'
import {
  calculateBaseRateAnalysis,
  calculateOptionalAddition,
  calculateRateAnalysis,
  type CalculatedOptionalAddition,
  invalidateRateAnalysisCalculation,
  labourRowsForDisplay,
  updateRateAnalysisLine
} from '../../lib/rateAnalysis'
import { addonLeadRuleForVariant, parseLeadInfo } from '../../lib/leadApplicability'
import {
  defaultRateAnalysisLayout,
  descriptionRunsForDisplay,
  plainTextRun
} from '../../lib/rateAnalysisVisibility'
import { supabase } from '../../lib/supabase'
import type {
  LeadApplication,
  LeadRateCalculationDetail,
  LeadVariant
} from '../../types/project'
import type {
  RateAnalysisColumnLayout,
  RateAnalysisAddonLeadSummary,
  RateAnalysisAddonSeigniorageSummary,
  RateAnalysisFigure,
  RateAnalysisLine,
  RateAnalysisMultiRateClassification,
  RateAnalysisOptionalAdditionAnalysis,
  RateAnalysisPublishedBlock,
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
  if (recipe.itemSource === 'SOR') {
    return <SorDataSheet recipe={recipe} editing={editing} onChange={onChange} />
  }

  const summary = calculateBaseRateAnalysis(recipe)
  const adoptedSummary = calculateRateAnalysis(recipe)
  const calculatedAddon = calculateOptionalAddition(recipe)
  const selectedAddonId = recipe.dataVariant?.addonId
  const parsedLeadInfo = parseLeadInfo(recipe.leadApplicability)
  const addonLeadApplications = selectedAddonId
    ? leadApplications.filter((application) => {
        if (application.addonId) return application.addonId === selectedAddonId
        const variant = leadVariants.find((candidate) => candidate.id === application.variantId)
        return variant
          ? addonLeadRuleForVariant(parsedLeadInfo, variant)?.addonId === selectedAddonId
          : false
      })
    : []
  const addonLeadIds = new Set(addonLeadApplications.map((application) => application.id))
  const regularLeadApplications = leadApplications.filter(
    (application) => !application.addonId && !addonLeadIds.has(application.id)
  )
  const addonLeadTotal = addonLeadApplications.reduce(
    (total, application) => total + application.grossAmount,
    0
  )
  const layout = recipe.layout ?? defaultRateAnalysisLayout(recipe.description)
  const recalculated = Boolean(recipe.recalculation)
  const labourRows = labourRowsForDisplay(recipe)
  const abstractRows = recipe.recalculation?.abstract ?? recipe.storedValues?.abstract ?? []
  const publishedAbstractRows = recipe.storedValues?.abstract ?? []
  const affectedAbstractSections = new Set(recipe.recalculation?.affectedSections ?? [])
  const formulaRefs = buildFormulaRefs(recipe)
  const hasUserLineChanges = recipe.sections.some((section) =>
    section.lines.some((line) => line.userAdded || (line.editedFields?.length ?? 0) > 0)
  )
  const dualMeasurement =
    recipe.multiRateClassification?.kind === 'dual_measurement_basis' &&
    (recipe.publishedRateBlocks?.length ?? 0) > 1

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
          <small>
            {hasUserLineChanges
              ? 'Published SSR with marked project edits'
              : recipe.areaAllowancePercent
                ? 'Published SSR with project area allowance'
                : 'Published Supabase reconstruction'}
          </small>
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

      {recipe.sourceFigures && recipe.sourceFigures.length > 0 && (
        <SsrSourceFigures figures={recipe.sourceFigures} itemCode={recipe.itemCode} />
      )}

      <div className="rate-sheet-heading">
        <span>DATA:</span>
        <strong>RATE ANALYSIS</strong>
        {layout.unitQuantityVisible ? (
          <span className={`rate-basis ${dualMeasurement ? 'rate-basis-dual' : ''}`}>
            {layout.unitLabel}:
            {dualMeasurement ? (
              <span className="rate-basis-values">
                {recipe.publishedRateBlocks!.map((block) => (
                  <span key={block.key}>
                    <b>{formatQuantity(block.outputQuantity)}</b>
                    <span>{block.unit}</span>
                  </span>
                ))}
              </span>
            ) : editing && !recipe.storedValues ? (
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

      {!dualMeasurement && recipe.publishedRateBlocks && recipe.publishedRateBlocks.length > 1 && (
        <PublishedRateBlocks
          blocks={recipe.publishedRateBlocks}
          adoptedRate={recipe.dataVariant?.rate}
          includedRates={recipe.dataVariant?.componentRates}
          classification={recipe.multiRateClassification}
        />
      )}
      {recipe.multiRateClassification && (!recipe.publishedRateBlocks || recipe.publishedRateBlocks.length < 2) && (
        <div className="rate-notice">
          <strong>{recipe.multiRateClassification.label}:</strong>{' '}
          {recipe.multiRateClassification.note} Adopted rate Rs.{' '}
          {formatMoney(recipe.multiRateClassification.adoptedRate)}.
        </div>
      )}

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
                {section.lines.length > 0 ? (
                  section.lines.map((line, lineIndex) => (
                    <tr
                      className={isUserChangedLine(line) ? 'rate-user-edited-row' : undefined}
                      key={line.id}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={[
                            columnClass(column.key),
                            isDirectlyEditedField(line, column.key) ? 'rate-direct-edit' : ''
                          ].filter(Boolean).join(' ')}
                        >
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
                ) : null}
                <TotalRow
                  columns={columns}
                  extraCell={editing}
                  label={sectionLayout.totalLabel}
                  emphasized={section.lines.some(isFinanciallyChangedLine)}
                  value={
                    section.key === 'labour'
                      ? summary.labourBaseCost
                      : recipe.recalculation?.sectionTotals[section.key] ??
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

            {section.key === 'labour' && (
              <div className="area-allowance-analysis">
                <div className="area-allowance-analysis-title">Area Allowance</div>
                <div className="area-allowance-analysis-row">
                  <span>Allowance taken</span>
                  <strong>{recipe.areaAllowanceLabel ?? 'No location-based area allowance'}</strong>
                </div>
                <div className="area-allowance-analysis-row">
                  <span>Total Cost of Labour</span>
                  <span />
                  <span>Rs:</span>
                  <strong>{formatMoney(summary.labourBaseCost)}</strong>
                </div>
                <div className="area-allowance-analysis-row is-allowance">
                  <span>Area Allowance on Labour</span>
                  <span>{formatPercent(summary.areaAllowancePercent)}%</span>
                  <span>Rs:</span>
                  <strong>{formatMoney(summary.areaAllowanceAmount)}</strong>
                </div>
                <div className="area-allowance-analysis-row is-total">
                  <span>Total Labour Cost including Area Allowance</span>
                  <span />
                  <span>Rs:</span>
                  <strong>{formatMoney(summary.labourCostWithAreaAllowance)}</strong>
                </div>
              </div>
            )}

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
          ) : dualMeasurement ? (
            <DualMeasurementAbstractRows
              rows={abstractRows}
              blocks={recipe.publishedRateBlocks!}
              recalculated={recalculated}
              finalCost={summary.totalCost}
              publishedRows={publishedAbstractRows}
              affectedSections={affectedAbstractSections}
            />
          ) : recipe.recalculation ? (
            <StoredAbstractRows
              rows={recipe.recalculation.abstract}
              publishedRows={publishedAbstractRows}
              affectedSections={affectedAbstractSections}
            />
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
      {recipe.dataVariant?.kind === 'optional_addition' && recipe.dataVariant.addOnRate !== undefined && (
        <OptionalAdditionData
          label={recipe.dataVariant.label}
          baseRate={summary.ratePerUnit}
          addOnRate={calculatedAddon?.ratePerUnit ?? recipe.dataVariant.addOnRate}
          adoptedRate={adoptedSummary.ratePerUnit}
          unit={recipe.unit}
          analysis={recipe.dataVariant.additionAnalysis}
          calculatedAnalysis={calculatedAddon}
          addonLead={recipe.dataVariant.addonLead}
          addonSeigniorage={recipe.dataVariant.addonSeigniorage}
          leadApplications={addonLeadApplications}
          leadVariants={leadVariants}
          outputQuantity={recipe.outputQuantity}
        />
      )}
      {recipe.dataVariant?.postRate &&
        recipe.dataVariant.postRateSteps === undefined &&
        recipe.dataVariant.addPercent !== undefined && (
          <PercentVariantAdjustment
            selectedLabel={recipe.dataVariant.label}
            baseLabel={recipe.dataVariant.baseVariantLabel ?? 'Base class'}
            baseRate={summary.ratePerUnit}
            addPercent={recipe.dataVariant.addPercent}
            addOnRate={adoptedSummary.ratePerUnit - summary.ratePerUnit}
            adoptedRate={adoptedSummary.ratePerUnit}
            unit={recipe.unit}
          />
      )}
      {regularLeadApplications.length > 0 && (
          <LeadAdditions
            applications={regularLeadApplications}
            variants={leadVariants}
            outputQuantity={recipe.outputQuantity}
            baseFinalAmount={adoptedSummary.totalCost + addonLeadTotal}
            baseRate={(adoptedSummary.totalCost + addonLeadTotal) / (recipe.outputQuantity || 1)}
            editing={editing}
            onQuantityChange={onLeadApplicationQuantityChange}
          />
      )}
    </article>
  )
}

function PercentVariantAdjustment({
  selectedLabel,
  baseLabel,
  baseRate,
  addPercent,
  addOnRate,
  adoptedRate,
  unit
}: {
  selectedLabel: string
  baseLabel: string
  baseRate: number
  addPercent: number
  addOnRate: number
  adoptedRate: number
  unit: string
}): JSX.Element {
  return (
    <section className="percent-variant-data" aria-label="Selected post-rate adjustment">
      <div className="percent-variant-head">
        <span>SELECTED RATE VARIANT</span>
        <strong>{selectedLabel}</strong>
        <small>Percentage adjustment over the calculated {baseLabel} DATA</small>
      </div>
      <div className="optional-addition-rate-summary">
        <div>
          <span>Calculated {baseLabel} base rate</span>
          <strong>Rs. {formatMoney(baseRate)}</strong>
        </div>
        <div className="is-addition">
          <span>Add {formatPercent(addPercent)}% for {selectedLabel}</span>
          <strong>+ Rs. {formatMoney(addOnRate)}</strong>
        </div>
        <div className="is-adopted">
          <span>Adopted {selectedLabel} rate</span>
          <strong>Rs. {formatMoney(adoptedRate)} / {unit || 'unit'}</strong>
        </div>
      </div>
      <p>
        Materials, machinery and labour above form the {baseLabel} analysis. The percentage is
        applied to its calculated final rate after DATA recalculation and area allowance.
      </p>
    </section>
  )
}

function OptionalAdditionData({
  label,
  baseRate,
  addOnRate,
  adoptedRate,
  unit,
  analysis,
  calculatedAnalysis,
  addonLead,
  addonSeigniorage,
  leadApplications,
  leadVariants,
  outputQuantity
}: {
  label: string
  baseRate: number
  addOnRate: number
  adoptedRate: number
  unit: string
  analysis?: RateAnalysisOptionalAdditionAnalysis
  calculatedAnalysis?: CalculatedOptionalAddition | null
  addonLead?: RateAnalysisAddonLeadSummary
  addonSeigniorage?: RateAnalysisAddonSeigniorageSummary
  leadApplications: LeadApplication[]
  leadVariants: LeadVariant[]
  outputQuantity: number
}): JSX.Element {
  const leadRate = leadApplications.reduce((total, application) => {
    const divisor = application.outputQuantity || outputQuantity || 1
    const rate = application.rateAddition ?? application.grossAmount / divisor
    return total + (Number.isFinite(rate) ? rate : 0)
  }, 0)
  const addonBasisQuantity = analysis?.outputQuantity || outputQuantity || 1
  const leadCostForAddonBasis = leadRate * addonBasisQuantity
  const addonCostBeforeLead = calculatedAnalysis?.totalCost ?? analysis?.totalCost ?? 0
  const addonCostWithLead = addonCostBeforeLead + leadCostForAddonBasis
  const addOnRateWithLead = addOnRate + leadRate
  const adoptedRateWithLead = adoptedRate + leadRate
  return (
    <section className="optional-addition-data" aria-label="Selected optional addition">
      <div className="optional-addition-head">
        <span>SELECTED OPTIONAL ADDITION</span>
        <strong>{label}</strong>
        {analysis && (
          <small>
            Calculated from {formatQuantity(analysis.outputQuantity)} {analysis.unit || unit} add-on DATA
          </small>
        )}
      </div>

      {analysis?.sections.map((section) => (
        <div className={`optional-addition-section is-${section.key}`} key={section.key}>
          <h4>{section.label}</h4>
          <table className="optional-addition-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Rate (Rs.)</th>
                <th>Amount (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {section.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.unit}</td>
                  <td>{formatQuantity(line.quantity)}</td>
                  <td>{formatMoney(line.rate)}</td>
                  <td>{formatMoney(line.quantity * line.rate)}</td>
                </tr>
              ))}
              <tr className="optional-addition-total">
                <td colSpan={4}>Total {section.label}</td>
                <td>{formatMoney(calculatedAnalysis?.sectionTotals[section.key] ?? analysis.sectionTotals[section.key] ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {analysis && (
        <div className="optional-addition-costs">
          {(calculatedAnalysis?.labourAllowanceAmount ?? 0) > 0 && (
            <div>
              <span>Area allowance on add-on labour ({formatPercent(calculatedAnalysis!.labourAllowancePercent)}%)</span>
              <strong>Rs. {formatMoney(calculatedAnalysis!.labourAllowanceAmount)}</strong>
            </div>
          )}
          {(calculatedAnalysis || analysis.overheadAmount !== undefined) && (
            <div>
              <span>Contractor's profit and overheads ({formatPercent(calculatedAnalysis?.overheadPercent ?? analysis.overheadPercent ?? 0)}%)</span>
              <strong>Rs. {formatMoney(calculatedAnalysis?.overheadAmount ?? analysis.overheadAmount ?? 0)}</strong>
            </div>
          )}
        </div>
      )}

      {leadApplications.length > 0 && analysis && (
        <AddonLeadCosts
          applications={leadApplications}
          variants={leadVariants}
          parentOutputQuantity={outputQuantity}
          addonOutputQuantity={analysis.outputQuantity}
          addonUnit={analysis.unit || unit}
        />
      )}

      {analysis && (
        <div className="optional-addition-costs optional-addition-grand-total">
          {(calculatedAnalysis || analysis.totalCost !== undefined) && (
            <div>
              <span>
                Total add-on cost{leadApplications.length ? ' including Lead' : ''} for{' '}
                {formatQuantity(analysis.outputQuantity)} {analysis.unit || unit}
              </span>
              <strong>Rs. {formatMoney(addonCostWithLead)}</strong>
            </div>
          )}
        </div>
      )}

      <div className="optional-addition-rate-summary">
        <div>
          <span>Calculated base DATA rate</span>
          <strong>Rs. {formatMoney(baseRate)}</strong>
        </div>
        <div className="is-addition">
          <span>
            {leadApplications.length ? 'Selected add-on rate including Lead' : 'Calculated add-on DATA rate'}: {label}
          </span>
          <strong>+ Rs. {formatMoney(addOnRateWithLead)}</strong>
        </div>
        <div className="is-adopted">
          <span>Adopted rate</span>
          <strong>Rs. {formatMoney(adoptedRateWithLead)} / {unit || 'unit'}</strong>
        </div>
      </div>

      {addonLead?.applicable && (
        <p className="optional-addition-lead-note">
          Lead: {addonLead.materialName || 'add-on material'} uses the common{' '}
          <strong>{addonLead.conveyanceClass ?? 'applicable'} Lead schedule</strong>. Quantity is{' '}
          {addonLead.quantityRatio !== null
            ? `${formatQuantity(addonLead.quantityRatio)} ${addonLead.materialUnit} per ${unit || 'item unit'}`
            : 'quantity-based'}.
          {' '}{addonLead.distanceRule === 'CHARGE_BEYOND_INCLUDED'
            ? `Charge only beyond the included first ${formatQuantity(addonLead.includedLeadM)} m.`
            : 'Charge the full source-to-site distance.'}
          {addonLead.loadingIncluded ? ' Loading is already included; do not add it again.' : ''}
          {!addonLead.unloadingAddedByDefault ? ' Unloading is zero unless separately admitted.' : ''}
        </p>
      )}
      {addonLead && !addonLead.applicable && (
        <p className="optional-addition-lead-note">
          No separate Lead applies to this add-on{addonLead.note ? `: ${addonLead.note}` : '.'}
        </p>
      )}
      {addonSeigniorage?.applicable && (
        <p className="optional-addition-lead-note">
          Seigniorage policy activates automatically when this add-on is selected
          {addonSeigniorage.codes.length
            ? ` (${addonSeigniorage.codes.join(', ')})`
            : ''}.
          {addonSeigniorage.conversionRequired && !addonSeigniorage.conversionConfigured
            ? ' The amount is blocked until an approved CUM-to-MT conversion factor is configured.'
            : ' The applicable quantity and charge are calculated in Project Seigniorage.'}
        </p>
      )}
    </section>
  )
}

function AddonLeadCosts({
  applications,
  variants,
  parentOutputQuantity,
  addonOutputQuantity,
  addonUnit
}: {
  applications: LeadApplication[]
  variants: LeadVariant[]
  parentOutputQuantity: number
  addonOutputQuantity: number
  addonUnit: string
}): JSX.Element {
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))
  const rows = applications.map((application) => {
    const divisor = application.outputQuantity || parentOutputQuantity || 1
    const scale = addonOutputQuantity / divisor
    return {
      application,
      variant: variantById.get(application.variantId),
      quantity: application.quantity * scale,
      amount: application.grossAmount * scale
    }
  })
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return (
    <div className="optional-addition-lead-costs">
      <div className="optional-addition-lead-title">
        <strong>E. Add-on Lead after contractor's profit</strong>
        <span>For {formatQuantity(addonOutputQuantity)} {addonUnit}</span>
      </div>
      {rows.map(({ application, variant, quantity, amount }) => (
        <div className="optional-addition-lead-row" key={application.id}>
          <span>
            <strong>{variant?.materialName ?? 'Lead'}</strong>
            <small>{application.quantitySource}</small>
          </span>
          <span>{formatQuantity(quantity)} {application.unit}</span>
          <span>Rs. {formatMoney(application.grossRate)}</span>
          <strong>Rs. {formatMoney(amount)}</strong>
        </div>
      ))}
      <div className="optional-addition-lead-total">
        <span>Add-on Lead total</span>
        <strong>Rs. {formatMoney(total)}</strong>
      </div>
    </div>
  )
}

function SsrSourceFigures({
  figures,
  itemCode
}: {
  figures: RateAnalysisFigure[]
  itemCode: string
}): JSX.Element {
  const [loaded, setLoaded] = useState<Array<{
    figure: RateAnalysisFigure
    url?: string
    error?: string
  }>>(() => figures.map((figure) => ({ figure })))

  useEffect(() => {
    let cancelled = false
    const objectUrls: string[] = []
    setLoaded(figures.map((figure) => ({ figure })))

    void Promise.all(
      figures.map(async (figure) => {
        const { data, error } = await supabase.storage
          .from('ssr-figures')
          .download(figure.objectPath)
        if (error || !data) {
          return { figure, error: error?.message ?? 'Image download failed.' }
        }
        if (cancelled) return { figure }
        const url = URL.createObjectURL(data)
        objectUrls.push(url)
        return { figure, url }
      })
    ).then((results) => {
      if (!cancelled) setLoaded(results)
    })

    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [figures])

  return (
    <section className="ssr-source-figures" aria-label="Published SSR figures">
      {loaded.map(({ figure, url, error }) => (
        <figure key={figure.key}>
          <div className="ssr-source-figure-frame">
            {url ? (
              <img
                src={url}
                alt={`${itemCode} published SSR illustration`}
                loading="eager"
                decoding="async"
              />
            ) : error ? (
              <div className="ssr-source-figure-state error" title={error}>
                Published SSR figure could not be loaded.
              </div>
            ) : (
              <div className="ssr-source-figure-state">Loading published SSR figure...</div>
            )}
          </div>
        </figure>
      ))}
    </section>
  )
}

function SorDataSheet({
  recipe,
  editing,
  onChange
}: {
  recipe: RateAnalysisRecipe
  editing: boolean
  onChange: (recipe: RateAnalysisRecipe) => void
}): JSX.Element {
  const sourceSection = recipe.sections.find((section) => section.lines.length > 0)
  const sourceLine = sourceSection?.lines[0]
  const rate = recipe.publishedRate ?? sourceLine?.rate ?? 0

  const updateDescription = (description: string): void => {
    onChange({
      ...recipe,
      description,
      layout: recipe.layout
        ? { ...recipe.layout, descriptionRuns: [plainTextRun(description)] }
        : recipe.layout,
      sections: recipe.sections.map((section) => ({
        ...section,
        lines: section.lines.map((line, index) =>
          section.key === sourceSection?.key && index === 0
            ? { ...line, description }
            : line
        )
      })),
      recalculation: undefined,
      calculationStale: false
    })
  }

  const updateRate = (nextRate: number): void => {
    onChange({
      ...recipe,
      publishedRate: nextRate,
      sections: recipe.sections.map((section) => ({
        ...section,
        lines: section.lines.map((line, index) =>
          section.key === sourceSection?.key && index === 0
            ? { ...line, rate: nextRate, amount: nextRate }
            : line
        )
      })),
      recalculation: undefined,
      calculationStale: false
    })
  }

  return (
    <article className="rate-sheet sor-data-sheet">
      <div className="rate-document-header">
        <strong className="rate-sheet-code">{recipe.itemCode}</strong>
        <div className="rate-document-meta">
          <span>SOR {recipe.year}</span>
          <small>Published schedule rate</small>
        </div>
      </div>
      <div className="sor-data-title">
        <span>DATA</span>
        <strong>Schedule of Rates</strong>
      </div>
      <table className="sor-data-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {editing ? (
                <textarea
                  value={recipe.description}
                  onChange={(event) => updateDescription(event.target.value)}
                />
              ) : (
                recipe.description
              )}
            </td>
            <td>
              {editing ? (
                <div className="sor-rate-editor">
                  <span>Rs.</span>
                  <NumberInput value={rate} onChange={updateRate} />
                  <span>/ {recipe.unit || 'unit'}</span>
                </div>
              ) : (
                <strong>Rs. {formatMoney(rate)} / {recipe.unit || 'unit'}</strong>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  )
}

function PublishedRateBlocks({
  blocks,
  adoptedRate,
  includedRates,
  classification
}: {
  blocks: RateAnalysisPublishedBlock[]
  adoptedRate?: number
  includedRates?: number[]
  classification?: RateAnalysisMultiRateClassification
}): JSX.Element {
  return (
    <section className="published-rate-blocks">
      <div className="published-rate-blocks-head">
        <strong>Published quantity / rate bases</strong>
        <span>
          {classification ? `${classification.label}. ${classification.note}` : 'Complete SSR analysis blocks are kept separate.'}
        </span>
      </div>
      <div className="published-rate-block-grid">
        {blocks.map((block) => {
          const included = includedRates?.some((rate) => Math.abs(block.rate - rate) < 0.011) ?? false
          const adopted = included || (adoptedRate === undefined
            ? block.primary
            : Math.abs(block.rate - adoptedRate) < 0.011)
          return (
            <div className={`published-rate-block ${adopted ? 'is-adopted' : ''}`} key={block.key}>
              <span>
                {block.label}
                {adopted && (
                  <small>
                    {included ? 'Included in adopted DATA' : adoptedRate === undefined ? 'Primary DATA' : 'Adopted DATA'}
                  </small>
                )}
              </span>
              <strong>{formatQuantity(block.outputQuantity)} {block.unit}</strong>
              {block.totalCost !== undefined && <span>Cost Rs. {formatMoney(block.totalCost)}</span>}
              <b>Rate Rs. {formatMoney(block.rate)} / {block.unit || 'unit'}</b>
            </div>
          )
        })}
      </div>
      <p>
        {classification?.kind === 'optional_addition'
          ? 'The optional block is added to the base only when selected; it never replaces the base rate.'
          : 'Recalculation uses the adopted rule only, so a later embedded quantity cannot replace the primary DATA rate.'}
      </p>
    </section>
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
    !/^fabricated\s+parts?$/i.test(variant.materialName.trim()) &&
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

function isUserChangedLine(line: RateAnalysisLine): boolean {
  return Boolean(line.userAdded || (line.editedFields?.length ?? 0) > 0)
}

function isFinanciallyChangedLine(line: RateAnalysisLine): boolean {
  return Boolean(
    line.userAdded ||
      line.editedFields?.some(
        (field) => field === 'quantity' || field === 'rate' || field === 'amount'
      )
  )
}

function isDirectlyEditedField(
  line: RateAnalysisLine,
  column: RateAnalysisColumnLayout['key']
): boolean {
  return Boolean(line.editedFields?.includes(column))
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
  const directlyEdited = isDirectlyEditedField(line, column.key)
  const financiallyChanged = isFinanciallyChangedLine(line)
  const storedValue =
    column.key === 'quantity'
      ? line.sourceValues?.quantity
      : column.key === 'rate'
        ? line.sourceValues?.rate
        : line.sourceValues?.amount

  if (editing && column.key === 'amount') {
    return <>{showCalculatedAmount && financiallyChanged ? formatMoney(value) : storedValue !== undefined ? storedValue : formatMoney(value)}</>
  }

  if (!editing && line.linkedRate && (column.key === 'rate' || column.key === 'amount')) {
    const displayValue =
      directlyEdited || (column.key === 'amount' && financiallyChanged)
        ? formatMoney(value)
        : storedValue !== undefined
          ? storedValue
          : formatMoney(value)
    return (
      <span className="linked-rate-cell">
        <span>{displayValue}</span>
        <small>
          SOR reference {line.linkedRate.year}
          {line.linkedRate.year === '2026-27' ? `, ${zoneLabel(line.linkedRate.zone)}` : ''}
        </small>
      </span>
    )
  }

  return editing ? (
    <NumberInput value={value} onChange={(next) => onChange({ [column.key]: next })} />
  ) : (
    <>
      {showCalculatedAmount && column.key === 'amount' && financiallyChanged
        ? formatMoney(value)
        : !directlyEdited && storedValue !== undefined
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
  value,
  emphasized = false
}: {
  columns: RateAnalysisColumnLayout[]
  extraCell?: boolean
  label: string
  value: number | string
  emphasized?: boolean
}): JSX.Element {
  const displayValue = typeof value === 'string' ? value : formatMoney(value)
  const amountIndex = columns.findIndex((column) => column.key === 'amount')
  const rateIndex = columns.findIndex((column) => column.key === 'rate')
  if (amountIndex < 0 || rateIndex < 0) {
    return (
      <tr className={`rate-total-row ${emphasized ? 'rate-derived-total' : ''}`}>
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
    <tr className={`rate-total-row ${emphasized ? 'rate-derived-total' : ''}`}>
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

function StoredAbstractRows({
  rows,
  publishedRows = [],
  affectedSections = new Set<RateAnalysisSectionKey>()
}: {
  rows: RateAnalysisStoredRow[]
  publishedRows?: RateAnalysisStoredRow[]
  affectedSections?: Set<RateAnalysisSectionKey>
}): JSX.Element {
  const normalizedRows = normalizeStoredRows(rows)
  const normalizedPublishedRows = normalizeStoredRows(publishedRows)
  return (
    <div className="stored-abstract">
      {normalizedRows.map((normalized, index) => {
        const label = normalized.label
        const isRate = /^rate per/i.test(label)
        const isTotalCost = /^total cost for/i.test(label)
        const isTotal = normalized.qualifier.toLowerCase() === 'total'
        const isCaption = /^vertical lift gates/i.test(label)
        const sectionKey = abstractSectionKey(label)
        const published = normalizedPublishedRows[index]
        const derivedChanged = sectionKey
          ? affectedSections.has(sectionKey)
          : Boolean(
              published &&
                numericText(normalized.amount) !== null &&
                numericText(published.amount) !== null &&
                Math.abs(numericText(normalized.amount)! - numericText(published.amount)!) > 0.005
            )
        const amountClass =
          isRate || isTotalCost || isTotal ? 'stored-amount ruled' : 'stored-amount'
        return (
          <div
            className={[
              'stored-abstract-row',
              isTotal ? 'total-row' : '',
              isTotalCost ? 'total-cost-row' : '',
              isRate ? 'rate-row' : '',
              isCaption ? 'caption-row' : '',
              derivedChanged ? 'rate-derived-result' : ''
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

function DualMeasurementAbstractRows({
  rows,
  blocks,
  recalculated,
  finalCost,
  publishedRows,
  affectedSections
}: {
  rows: RateAnalysisStoredRow[]
  blocks: RateAnalysisPublishedBlock[]
  recalculated: boolean
  finalCost: number
  publishedRows: RateAnalysisStoredRow[]
  affectedSections: Set<RateAnalysisSectionKey>
}): JSX.Element {
  const resultStart = rows.findIndex((row) =>
    /total cost for/i.test(`${row.label} ${row.basis} ${row.unit}`)
  )
  const calculationRows = resultStart >= 0 ? rows.slice(0, resultStart) : rows
  const recalculatedRates = rows
    .filter((row) => /rate\s+per/i.test(`${row.label} ${row.basis} ${row.unit}`))
    .map((row) => Number(String(row.amount || row.value).replaceAll(',', '')))
    .filter(Number.isFinite)

  return (
    <>
      <StoredAbstractRows
        rows={calculationRows}
        publishedRows={publishedRows.slice(0, calculationRows.length)}
        affectedSections={affectedSections}
      />
      <div className="dual-measurement-result" aria-label="Dual measurement result">
        <div className="dual-measurement-result-title">
          One total cost, expressed on both published measurement bases
        </div>
        {blocks.map((block) => {
          const cost = recalculated ? finalCost : block.totalCost ?? finalCost
          return (
            <div className="dual-measurement-row is-cost" key={`cost-${block.key}`}>
              <span>Total cost for</span>
              <strong>{formatQuantity(block.outputQuantity)}</strong>
              <span>{block.unit}</span>
              <span>Rs:</span>
              <strong>{formatMoney(cost)}</strong>
            </div>
          )
        })}
        {blocks.map((block, index) => {
          const cost = recalculated ? finalCost : block.totalCost ?? finalCost
          const rate = recalculated
            ? recalculatedRates[index] ?? cost / (block.outputQuantity || 1)
            : block.rate
          return (
            <div
              className={`dual-measurement-row is-rate ${block.primary ? 'is-adopted' : ''}`}
              key={`rate-${block.key}`}
            >
              <strong>{block.label}</strong>
              <span />
              <span />
              <span>Rs:</span>
              <strong>{formatMoney(rate)}</strong>
            </div>
          )
        })}
      </div>
    </>
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

    if (/^Total (?:Cost of Labour|Labour Cost including Area Allowance)$/i.test(label)) {
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
    if (current.basis === current.qualifier) current.basis = ''
    if (!current.label && /^rate per\b/i.test(current.basis)) {
      current.label = uniqueText(current.basis, current.qualifier)
      current.basis = ''
      current.qualifier = ''
    }
    const previous = normalized.at(-1)
    if (
      previous &&
      /^F\.\s|contractor.*(?:profit|overhead)/i.test(previous.label) &&
      /^\([A-F](?:\+[A-F])+\)$/i.test(current.label)
    ) {
      previous.label = uniqueText(previous.label, current.label)
      previous.basis = uniqueText(previous.basis, current.basis)
      previous.qualifier = uniqueText(previous.qualifier, current.qualifier)
      if (previous.basis === previous.qualifier) previous.basis = ''
      if (!previous.amount) previous.amount = current.amount
      continue
    }
    if (!current.label && normalized.length) {
      const preceding = normalized[normalized.length - 1]
      if (/^F\.\s|^Total cost for/i.test(preceding.label)) {
        preceding.basis = uniqueText(preceding.basis, current.basis)
        preceding.qualifier = uniqueText(preceding.qualifier, current.qualifier)
        if (preceding.basis === preceding.qualifier) preceding.qualifier = ''
        if (!preceding.amount) preceding.amount = current.amount
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

function numericText(value: string): number | null {
  const normalized = value.replaceAll(',', '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function abstractSectionKey(label: string): RateAnalysisSectionKey | null {
  const text = label.trim().toLowerCase()
  if (/^a\s*[.)]?\s*(cost of )?materials?\b/.test(text)) return 'materials'
  if (/^b\s*[.)]?\s*(hire charges? of |cost of )?(machinery|plant)\b/.test(text)) {
    return 'machinery'
  }
  if (/^c\s*[.)]?\s*(cost of )?labou?r\b/.test(text)) return 'labour'
  return null
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
    sourceValues: {},
    userAdded: true,
    editedFields: []
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
