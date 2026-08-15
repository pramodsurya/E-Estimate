import { Calculator, FilePlus2, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchSorItems,
  SOR_CATEGORIES,
  type MasterItem
} from '../../lib/masterData'
import {
  PROJECT_DATA_LEAD_MATERIALS,
  projectDataLeadMaterialFor,
  projectDataRate,
  projectSsrFormulaReferences,
  resolveProjectSsrSections
} from '../../lib/projectData'
import { fetchItemRate } from '../../lib/rateAnalysis'
import { useStore } from '../../store/useStore'
import {
  fetchSeigniorageCharges,
  matchMaterialToSeigniorage,
  type SeigniorageCharge
} from '../../lib/seigniorage'
import type {
  ConveyanceClass,
  LeadPolicy,
  ProjectNode,
  ProjectSsrDataDefinition
} from '../../types/project'
import type { RateAnalysisLine, RateAnalysisSection, RateAnalysisSectionKey } from '../../types/rateAnalysis'
import Modal from '../modals/Modal'
import ProjectDataImageField from './ProjectDataImageField'

export type ProjectSsrDataDraft = Pick<
  ProjectSsrDataDefinition,
  'description' | 'imageDataUrl' | 'unit' | 'outputQuantity' | 'overheadPercent' | 'sections' | 'lead'
>

const SECTION_KEYS: RateAnalysisSectionKey[] = ['materials', 'machinery', 'labour']
const sectionLabels: Record<RateAnalysisSectionKey, string> = {
  materials: 'A. Materials',
  machinery: 'B. Machinery',
  labour: 'C. Labour'
}

const OVERALL_LEAD_OPTIONS: Array<{
  key: string
  label: string
  materialName: string
  conveyanceClass: ConveyanceClass
  policy?: LeadPolicy
}> = [
  {
    key: 'disposal',
    label: 'Disposal Lead — excavated earth',
    materialName: 'Disposal Lead',
    conveyanceClass: 'EARTH',
    policy: {
      purpose: 'EXCAVATED_DISPOSAL',
      includedLeadM: 0,
      includedLiftM: 0,
      includesAllLifts: false,
      quantityBasis: 'PARENT_CUM',
      allowLoading: true,
      allowUnloading: true,
      scrutinyRequired: false,
      defaultConveyanceClass: 'EARTH',
      haulLegs: 1
    }
  },
  {
    key: 'fabricated',
    label: 'Fabricated Parts — whole DATA',
    materialName: 'Fabricated Parts',
    conveyanceClass: 'STEEL',
    policy: {
      purpose: 'MATERIAL_SUPPLY',
      includedLeadM: 1000,
      includedLiftM: 0,
      includesAllLifts: true,
      quantityBasis: 'PUBLISHED_FABRICATED_WEIGHT_TONNE',
      allowLoading: false,
      allowUnloading: false,
      scrutinyRequired: false,
      defaultConveyanceClass: 'STEEL',
      haulLegs: 2
    }
  },
  ...PROJECT_DATA_LEAD_MATERIALS.map((material) => ({
    key: `material-${material.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: `${material.name} — whole DATA`,
    materialName: material.name,
    conveyanceClass: material.conveyanceClass
  }))
]

export function blankProjectSsrDataDraft(): ProjectSsrDataDraft {
  return {
    description: '',
    imageDataUrl: undefined,
    unit: 'Cum',
    outputQuantity: 1,
    overheadPercent: 0,
    lead: { applicable: false },
    sections: SECTION_KEYS.map((key) => ({ key, label: sectionLabels[key], lines: [] }))
  }
}

export default function ProjectSsrDataEditor({
  value,
  onChange,
  year,
  zone
}: {
  value: ProjectSsrDataDraft
  onChange: (value: ProjectSsrDataDraft) => void
  year: string
  zone: 'zone_1' | 'zone_2' | 'zone_3'
}): JSX.Element {
  const [pickerSection, setPickerSection] = useState<RateAnalysisSectionKey | null>(null)
  const [seigniorageCharges, setSeigniorageCharges] = useState<SeigniorageCharge[]>([])
  const [seigniorageChargesLoading, setSeigniorageChargesLoading] = useState(true)
  useEffect(() => {
    let active = true
    void fetchSeigniorageCharges()
      .then((charges) => { if (active) setSeigniorageCharges(charges) })
      .catch(() => { if (active) setSeigniorageCharges([]) })
      .finally(() => { if (active) setSeigniorageChargesLoading(false) })
    return () => { active = false }
  }, [])
  const resolvedSections = useMemo(() => resolveProjectSsrSections(value.sections), [value.sections])
  const previewRate = useMemo(
    () => projectDataRate({
      ...value,
      id: '',
      code: '',
      kind: 'ssr',
      lead: { applicable: false },
      seigniorage: { applicable: true },
      createdAt: '',
      updatedAt: ''
    }),
    [value]
  )
  const sectionTotals = useMemo(
    () => Object.fromEntries(resolvedSections.map((section) => [
      section.key,
      section.lines.reduce((total, line) => total + line.amount, 0)
    ])) as Record<RateAnalysisSectionKey, number>,
    [resolvedSections]
  )
  const subtotal = sectionTotals.materials + sectionTotals.machinery + sectionTotals.labour
  const overheadAmount = subtotal * Math.max(0, value.overheadPercent || 0) / 100

  const update = (patch: Partial<ProjectSsrDataDraft>): void => onChange({ ...value, ...patch })
  const updateLines = (sectionKey: RateAnalysisSectionKey, lines: RateAnalysisLine[]): void => {
    update({
      sections: value.sections.map((section) =>
        section.key === sectionKey ? { ...section, lines } : section
      )
    })
  }
  const addManualLine = (sectionKey: RateAnalysisSectionKey): void => {
    const section = value.sections.find((candidate) => candidate.key === sectionKey)
    const lines = section?.lines ?? []
    updateLines(sectionKey, [...lines, newProjectDataLine(lines.length, sectionKey)])
  }
  const updateLine = (
    sectionKey: RateAnalysisSectionKey,
    lineId: string,
    patch: Partial<RateAnalysisLine>
  ): void => {
    const lines = value.sections.find((candidate) => candidate.key === sectionKey)?.lines ?? []
    updateLines(sectionKey, lines.map((line) => {
      if (line.id !== lineId) return line
      const rateWasEdited =
        Object.prototype.hasOwnProperty.call(patch, 'rate') ||
        Object.prototype.hasOwnProperty.call(patch, 'rateFormula') ||
        Object.prototype.hasOwnProperty.call(patch, 'unit')
      const directlyEdited = Object.keys(patch).filter((key): key is NonNullable<RateAnalysisLine['editedFields']>[number] =>
        ['sl_no', 'description', 'unit', 'quantity', 'rate', 'amount'].includes(key)
      )
      const edited = rateWasEdited && !directlyEdited.includes('rate')
        ? [...directlyEdited, 'rate' as const]
        : directlyEdited
      return {
        ...line,
        ...patch,
        ...(edited.length
          ? { editedFields: Array.from(new Set([...(line.editedFields ?? []), ...edited])) }
          : {}),
        // A later global circular may update an auto-linked SOR resource, but it
        // must never overwrite a rate/formula/unit deliberately set by the estimator.
        ...(rateWasEdited ? { rateOverride: undefined } : {})
      }
    }))
  }
  const deleteLine = (sectionKey: RateAnalysisSectionKey, lineId: string): void => {
    const lines = value.sections.find((candidate) => candidate.key === sectionKey)?.lines ?? []
    updateLines(sectionKey, lines.filter((line) => line.id !== lineId))
  }
  const addSorResource = (sectionKey: RateAnalysisSectionKey, item: MasterItem, rate: number): void => {
    const section = value.sections.find((candidate) => candidate.key === sectionKey)
    const lines = section?.lines ?? []
    // Being a SOR resource alone is not enough for Seigniorage. It must also
    // resolve to an official mineral charge. Machinery never carries Seig.
    const seigniorageCharge = sectionKey === 'materials'
      ? matchMaterialToSeigniorage(item.description, item.code, seigniorageCharges)
      : null
    updateLines(sectionKey, [
      ...lines,
      {
        ...newProjectDataLine(lines.length, sectionKey),
        description: item.description,
        unit: item.unit ?? '',
        quantity: 1,
        rate,
        amount: rate,
        resourceCode: item.code,
        // Direct Material-table rows carry the monthly master code. Other SOR
        // resources still resolve through their description alias where available.
        materialCode: sectionKey === 'materials' && item.category === 'material'
          ? item.code
          : undefined,
        rateSource: `SOR ${item.category} · ${year}`,
        userAdded: false,
        editedFields: undefined,
        seigniorageApplicable: Boolean(seigniorageCharge),
        seigniorageCode: seigniorageCharge?.seig_code,
        // A selected SOR resource carries its own backend Lead decision. Text
        // matching is reserved for manual/extract rows, never source data.
        lead: item.lead
          ? {
              applicable: item.lead.applicable,
              conveyanceClass: item.lead.conveyanceClass,
              materialName: item.lead.materialName
            }
          : undefined
      }
    ])
    setPickerSection(null)
  }

  return (
    <div className="project-ssr-editor">
      <div className="project-ssr-header-grid">
        <div className="project-ssr-description-stack">
          <label className="project-ssr-description-field">
            SSR DATA description
            <textarea
              rows={3}
              autoFocus
              value={value.description}
              placeholder="Describe the work covered by this SSR DATA"
              onChange={(event) => update({ description: event.target.value })}
            />
          </label>
          <ProjectDataImageField
            value={value.imageDataUrl}
            onChange={(imageDataUrl) => update({ imageDataUrl })}
          />
        </div>
        <div className="project-ssr-header-values">
          <label>
            Unit
            <input
              className="text-input"
              value={value.unit}
              placeholder="Cum"
              onChange={(event) => update({ unit: event.target.value })}
            />
          </label>
          <label>
            Output quantity
            <input
              className="text-input"
              type="number"
              min="0.000001"
              step="any"
              value={value.outputQuantity}
              onChange={(event) => update({ outputQuantity: numeric(event.target.value, 1) })}
            />
          </label>
          <label>
            Profit / overhead (%)
            <input
              className="text-input"
              type="number"
              min="0"
              step="any"
              value={value.overheadPercent}
              onChange={(event) => update({ overheadPercent: Math.max(0, numeric(event.target.value, 0)) })}
            />
          </label>
        </div>
      </div>

      <OverallLeadField
        value={value.lead}
        onChange={(lead) => update({ lead })}
      />

      <div className="project-ssr-builder-note">
        <Calculator size={16} />
        <span>
          Select a SOR resource to adopt its rate, or add a manual/extract row. Formula fields are
          builder-only and are omitted from the final SSR DATA sheet. Lead and Seigniorage are
          selected per Material/Machinery row. Use Overall Lead only when the whole SSR carries
          one Lead rule, such as excavated disposal or fabricated parts.
        </span>
      </div>

      <div className="project-ssr-sections">
        {SECTION_KEYS.map((sectionKey) => {
          const source = value.sections.find((section) => section.key === sectionKey) ?? {
            key: sectionKey,
            label: sectionLabels[sectionKey],
            lines: []
          }
          const resolved = resolvedSections.find((section) => section.key === sectionKey) ?? source
          const formulaVisible = source.lines.some((line) => Boolean(line.rateFormula?.trim()))
          const resourceApplicability = sectionKey === 'materials' || sectionKey === 'machinery'
          return (
            <section className="project-ssr-section" key={sectionKey}>
              <div className="project-ssr-section-head">
                <div>
                  <strong>{sectionLabels[sectionKey]}</strong>
                  <small>₹ {money(sectionTotals[sectionKey])}</small>
                </div>
                <div>
                  <button type="button" className="btn-mini" onClick={() => setPickerSection(sectionKey)}>
                    <Search size={13} /> Add SOR resource
                  </button>
                  <button type="button" className="btn-mini" onClick={() => addManualLine(sectionKey)}>
                    <FilePlus2 size={13} /> Manual / extract
                  </button>
                </div>
              </div>
              {source.lines.length === 0 ? (
                <div className="project-ssr-empty-row">No {sectionKey} added.</div>
              ) : (
                <div className={`project-ssr-lines ${formulaVisible ? 'has-formula-column' : ''} ${resourceApplicability ? 'has-applicability-column' : ''}`}>
                  <div className="project-ssr-line-head">
                    <span>Particulars</span>
                    <span>Unit</span>
                    {resourceApplicability ? <span>Applicability</span> : null}
                    {formulaVisible ? <span>Rate formula</span> : null}
                    <span>Quantity</span>
                    <span>Rate</span>
                    <span>Amount</span>
                    <span></span>
                  </div>
                  {source.lines.map((line, index) => {
                    const resolvedLine = resolved.lines[index] ?? line
                    const formulaRefs = projectSsrFormulaReferences(value.sections, sectionKey, index)
                    const hasFormula = Boolean(line.rateFormula?.trim())
                    return (
                      <div className="project-ssr-line" key={line.id}>
                        <input
                          value={line.description}
                          placeholder="Description"
                          onChange={(event) => {
                            const description = event.target.value
                            const inferredLead = !line.lead
                              ? projectDataLeadMaterialFor(description)
                              : null
                            updateLine(sectionKey, line.id, {
                              description,
                              lead: inferredLead
                                ? { applicable: true, ...inferredLead }
                                : line.lead
                            })
                          }}
                        />
                        <input
                          value={line.unit}
                          placeholder="Unit"
                          onChange={(event) => updateLine(sectionKey, line.id, { unit: event.target.value })}
                        />
                        {resourceApplicability ? (
                          <ResourceApplicabilityCell
                            line={line}
                            isMaterial={sectionKey === 'materials'}
                            seigniorageCharges={seigniorageCharges}
                            seigniorageChargesLoading={seigniorageChargesLoading}
                            onChange={(patch) => updateLine(sectionKey, line.id, patch)}
                          />
                        ) : null}
                        {formulaVisible ? (
                          <div className={`project-ssr-formula-input ${hasFormula ? 'active' : ''}`}>
                            {hasFormula ? (
                              <>
                                <input
                                  value={line.rateFormula}
                                  placeholder="=MAT1_RATE * 10%"
                                  onChange={(event) => updateLine(sectionKey, line.id, { rateFormula: event.target.value })}
                                />
                                <select
                                  value=""
                                  aria-label="Insert formula reference"
                                  onChange={(event) => {
                                    const token = event.target.value
                                    if (!token) return
                                    updateLine(sectionKey, line.id, {
                                      rateFormula: insertFormulaToken(line.rateFormula ?? '=', token)
                                    })
                                  }}
                                >
                                  <option value="">Reference</option>
                                  {formulaRefs.map((ref) => <option key={ref.token} value={ref.token}>{ref.label}</option>)}
                                </select>
                                <button
                                  type="button"
                                  title="Use a fixed rate instead"
                                  onClick={() => updateLine(sectionKey, line.id, { rateFormula: undefined })}
                                >
                                  ×
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="project-ssr-enable-formula"
                                onClick={() => updateLine(sectionKey, line.id, { rateFormula: '=0' })}
                              >
                                ƒx
                              </button>
                            )}
                          </div>
                        ) : null}
                        <NumberCell
                          value={line.quantity}
                          onChange={(quantity) => updateLine(sectionKey, line.id, { quantity })}
                        />
                        {hasFormula ? (
                          <span className="project-ssr-calculated-rate" title={line.rateFormula}>
                            ₹ {money(resolvedLine.rate)}
                          </span>
                        ) : (
                          <NumberCell
                            value={line.rate}
                            onChange={(rate) => updateLine(sectionKey, line.id, { rate })}
                          />
                        )}
                        <strong>₹ {money(resolvedLine.amount)}</strong>
                        <div className="project-ssr-line-tools">
                          {!formulaVisible && (
                            <button
                              type="button"
                              title="Use a formula for this rate"
                              onClick={() => updateLine(sectionKey, line.id, { rateFormula: '=0' })}
                            >
                              ƒx
                            </button>
                          )}
                          <button type="button" title="Remove row" onClick={() => deleteLine(sectionKey, line.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <section className="project-ssr-abstract-preview" aria-label="Automatic SSR abstract">
        <div>
          <strong>Automatic Abstract</strong>
          <small>Calculated from the builder inputs; this is what the final DATA uses.</small>
        </div>
        <dl>
          <div><dt>A. Materials</dt><dd>₹ {money(sectionTotals.materials)}</dd></div>
          <div><dt>B. Machinery</dt><dd>₹ {money(sectionTotals.machinery)}</dd></div>
          <div><dt>C. Labour</dt><dd>₹ {money(sectionTotals.labour)}</dd></div>
          <div><dt>Subtotal</dt><dd>₹ {money(subtotal)}</dd></div>
          {value.overheadPercent > 0 ? (
            <div><dt>Profit / overhead ({value.overheadPercent}%)</dt><dd>₹ {money(overheadAmount)}</dd></div>
          ) : null}
          <div className="project-ssr-abstract-total"><dt>Rate per {value.unit || 'unit'}</dt><dd>₹ {money(previewRate)}</dd></div>
        </dl>
      </section>

      {pickerSection ? (
        <SorResourcePicker
          section={pickerSection}
          year={year}
          zone={zone}
          onClose={() => setPickerSection(null)}
          onPick={(item, rate) => addSorResource(pickerSection, item, rate)}
        />
      ) : null}
    </div>
  )
}

function SorResourcePicker({
  section,
  year,
  zone,
  onClose,
  onPick
}: {
  section: RateAnalysisSectionKey
  year: string
  zone: 'zone_1' | 'zone_2' | 'zone_3'
  onClose: () => void
  onPick: (item: MasterItem, rate: number) => void
}): JSX.Element {
  const defaultCategory = section === 'materials' ? 'material' : section === 'machinery' ? 'machinery' : 'labour'
  const materialRateOverrides = useStore(
    (state) => state.project?.meta.materialRateOverrides
  )
  const [category, setCategory] = useState(defaultCategory)
  const [items, setItems] = useState<MasterItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addingCode, setAddingCode] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void fetchSorItems(category)
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load SOR resources.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [category])

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rows = normalized
      ? items.filter((item) => `${item.code} ${item.description}`.toLowerCase().includes(normalized))
      : items
    return rows.slice(0, 150)
  }, [items, query])

  const choose = async (item: MasterItem): Promise<void> => {
    if (addingCode) return
    setAddingCode(item.code)
    setError('')
    try {
      const rate = await fetchItemRate(resourceNode(item), year, {
        zone,
        materialRateOverrides
      })
      if (rate === null) throw new Error(`No current SOR rate is available for ${item.code}.`)
      onPick(item, rate)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to apply this SOR rate.')
    } finally {
      setAddingCode('')
    }
  }

  return (
    <Modal
      title={`Add SOR resource to ${sectionLabels[section]}`}
      size="lg"
      onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Close</button>}
    >
      <div className="project-ssr-resource-toolbar">
        <select className="text-input" value={category} onChange={(event) => setCategory(event.target.value)}>
          {SOR_CATEGORIES.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
        </select>
        <label>
          <Search size={14} />
          <input
            value={query}
            autoFocus
            placeholder="Search code or description"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {error ? <div className="rate-warning project-ssr-resource-error">{error}</div> : null}
      <div className="project-ssr-resource-list">
        {loading ? <div className="list-empty">Loading SOR resources…</div> : null}
        {!loading && matches.length === 0 ? <div className="list-empty">No SOR resource found.</div> : null}
        {matches.map((item) => (
          <button type="button" key={item.code} onClick={() => void choose(item)} disabled={Boolean(addingCode)}>
            <span>
              <strong>{item.code}</strong>
              <small>{item.description}</small>
            </span>
            <em>{addingCode === item.code ? 'Applying rate…' : item.unit || 'No unit'}</em>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function resourceNode(item: MasterItem): ProjectNode {
  return {
    id: `project-data-resource-${item.code}`,
    kind: 'item',
    name: item.description,
    children: [],
    itemSource: 'SOR',
    itemCode: item.code,
    itemDescription: item.description,
    unit: item.unit,
    categoryKey: item.category
  }
}

function newProjectDataLine(index: number, sectionKey: RateAnalysisSectionKey): RateAnalysisLine {
  return {
    id: `project-ssr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slNo: String(index + 1),
    description: '',
    unit: '',
    quantity: 0,
    rate: 0,
    amount: 0,
    seigniorageApplicable: false,
    userAdded: true,
    editedFields: ['quantity', 'rate']
  }
}

function OverallLeadField({
  value,
  onChange
}: {
  value: ProjectSsrDataDraft['lead']
  onChange: (lead: ProjectSsrDataDraft['lead']) => void
}): JSX.Element {
  const enabled = Boolean(value?.applicable)
  const selected = OVERALL_LEAD_OPTIONS.find((option) =>
    option.materialName === value?.materialName &&
    option.conveyanceClass === value?.conveyanceClass
  ) ?? OVERALL_LEAD_OPTIONS[0]

  return (
    <fieldset className="project-ssr-overall-lead">
      <legend>Overall Lead</legend>
      <label className="project-ssr-overall-lead-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            if (!event.target.checked) {
              onChange({ applicable: false })
              return
            }
            onChange({
              applicable: true,
              materialName: value?.materialName ?? selected.materialName,
              conveyanceClass: value?.conveyanceClass ?? selected.conveyanceClass,
              policy: value?.policy ?? selected.policy
            })
          }}
        />
        <span>
          <strong>Add one Lead material for the whole DATA</strong>
          <small>
            Use this only where the published SSR applies Lead to the full work, not to an
            individual Material or Machinery line.
          </small>
        </span>
      </label>
      {enabled ? (
        <label className="project-ssr-overall-lead-choice">
          Overall Lead type
          <select
            value={selected.key}
            onChange={(event) => {
              const option = OVERALL_LEAD_OPTIONS.find((candidate) => candidate.key === event.target.value)
              if (!option) return
              onChange({
                applicable: true,
                materialName: option.materialName,
                conveyanceClass: option.conveyanceClass,
                policy: option.policy
              })
            }}
          >
            {OVERALL_LEAD_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
    </fieldset>
  )
}

function ResourceApplicabilityCell({
  line,
  isMaterial,
  seigniorageCharges,
  seigniorageChargesLoading,
  onChange
}: {
  line: RateAnalysisLine
  isMaterial: boolean
  seigniorageCharges: SeigniorageCharge[]
  seigniorageChargesLoading: boolean
  onChange: (patch: Partial<RateAnalysisLine>) => void
}): JSX.Element {
  const inferredLead = projectDataLeadMaterialFor(line.description)
  const lead = line.lead
  const leadMaterial = lead?.materialName || inferredLead?.name || 'Earth'
  const leadClass = lead?.conveyanceClass || inferredLead?.conveyanceClass || 'EARTH'
  const leadEnabled = Boolean(lead?.applicable)
  const seigniorageEnabled = isMaterial && Boolean(line.seigniorageApplicable)
  const manualResource = !line.resourceCode?.trim()
  const autoSeigniorage = Boolean(
    seigniorageEnabled && !manualResource && line.seigniorageCode?.trim()
  )
  return (
    <div className="project-ssr-applicability">
      <label title="Make this resource available for Lead">
        <input
          type="checkbox"
          checked={leadEnabled}
          onChange={(event) => onChange({
            lead: {
              applicable: event.target.checked,
              materialName: leadMaterial,
              conveyanceClass: leadClass
            }
          })}
        />
        Lead
      </label>
      {leadEnabled ? (
        <select
          aria-label="Lead material class"
          value={leadMaterial}
          onChange={(event) => {
            const selection = PROJECT_DATA_LEAD_MATERIALS.find((material) => material.name === event.target.value)
            if (!selection) return
            onChange({ lead: { applicable: true, ...selection } })
          }}
        >
          {PROJECT_DATA_LEAD_MATERIALS.map((material) => (
            <option key={material.name} value={material.name}>{material.name}</option>
          ))}
        </select>
      ) : null}
      {isMaterial ? (
        <label title={manualResource ? 'Select an official mineral rate after enabling Seigniorage' : 'Use or select an official mineral rate for this SOR resource'}>
          <input
            type="checkbox"
            checked={seigniorageEnabled}
            onChange={(event) => onChange({ seigniorageApplicable: event.target.checked })}
          />
          Seig
        </label>
      ) : null}
      {seigniorageEnabled && !autoSeigniorage ? (
        <select
          aria-label="Official Seigniorage mineral"
          value={line.seigniorageCode ?? ''}
          disabled={seigniorageChargesLoading}
          onChange={(event) => onChange({ seigniorageCode: event.target.value || undefined })}
        >
          <option value="">
            {seigniorageChargesLoading ? 'Loading rates…' : 'Choose mineral'}
          </option>
          {seigniorageCharges.map((charge) => (
            <option key={charge.seig_code} value={charge.seig_code}>
              {charge.mineral_name} · {seigniorageRateLabel(charge)}
            </option>
          ))}
        </select>
      ) : null}
      {autoSeigniorage ? (
        <small className="project-ssr-seig-auto">Auto SOR</small>
      ) : null}
    </div>
  )
}

function seigniorageRateLabel(charge: SeigniorageCharge): string {
  const rates = [
    charge.rate_per_m3 === null ? '' : `₹${charge.rate_per_m3}/Cum`,
    charge.rate_per_mt === null ? '' : `₹${charge.rate_per_mt}/MT`
  ].filter(Boolean)
  return rates.join(', ') || 'rate pending'
}

function NumberCell({ value, onChange }: { value: number; onChange: (value: number) => void }): JSX.Element {
  return (
    <input
      type="number"
      step="any"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(numeric(event.target.value, 0))}
    />
  )
}

function insertFormulaToken(formula: string, token: string): string {
  const current = formula.trim() || '='
  if (current === '=') return `=${token}`
  return /[+\-*/(]\s*$/.test(current) ? `${current}${token}` : `${current} + ${token}`
}

function numeric(value: string, fallback: number): number {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function money(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}
