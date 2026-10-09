import { Database, Layers3, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { materialRefsForLeadInfo, parseLeadInfo } from '../../lib/leadApplicability'
import type { MasterItem } from '../../lib/masterData'
import { fetchItemRate, fetchRateAnalysis } from '../../lib/rateAnalysis'
import { projectDataSsrRateLinks } from '../../lib/projectDataRateLinks'
import { useStore } from '../../store/useStore'
import type {
  ProjectDataDefinition,
  ProjectDataDefinitionInput,
  ProjectDataRateSource,
  ProjectNode
} from '../../types/project'
import type { RateAnalysisRecipe, SeigniorageMaterialPolicy } from '../../types/rateAnalysis'
import Modal from '../modals/Modal'
import { SorCodeSelectionColumn, SsrCodeSelectionColumn } from '../modals/AddItemModal'
import ProjectDataImageField from './ProjectDataImageField'
import ProjectSsrDataEditor, {
  blankProjectSsrDataDraft,
  type ProjectSsrDataDraft
} from './ProjectSsrDataEditor'

export default function CreateProjectDataModal({
  onClose,
  onSaved,
  editingDefinition,
  prefillRecipe,
  prefillItem
}: {
  onClose: () => void
  onSaved: (definition: ProjectDataDefinition) => void
  editingDefinition?: ProjectDataDefinition
  prefillRecipe?: RateAnalysisRecipe
  prefillItem?: MasterItem
}): JSX.Element {
  const project = useStore((state) => state.project)
  const createProjectData = useStore((state) => state.createProjectData)
  const updateProjectData = useStore((state) => state.updateProjectData)
  const [screen, setScreen] = useState<'choose' | 'sor' | 'ssr'>(
    editingDefinition?.kind ?? (prefillRecipe ? prefillRecipe.itemSource === 'SOR' ? 'sor' : 'ssr' : 'choose')
  )
  const [description, setDescription] = useState(
    editingDefinition?.kind === 'sor' ? editingDefinition.description : prefillRecipe?.description ?? ''
  )
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(
    editingDefinition?.kind === 'sor' ? editingDefinition.imageDataUrl : undefined
  )
  const [unit, setUnit] = useState(editingDefinition?.kind === 'sor' ? editingDefinition.unit : prefillRecipe?.unit ?? 'Cum')
  const [rate, setRate] = useState(
    editingDefinition?.kind === 'sor' ? String(editingDefinition.rate) : prefillRecipe?.publishedRate !== undefined ? String(prefillRecipe.publishedRate) : ''
  )
  const [timelyRates,setTimelyRates] = useState(Boolean(editingDefinition?.timelyRates))
  const [rateSource,setRateSource] = useState<ProjectDataRateSource | undefined>(editingDefinition?.rateSource ??
    (prefillItem ? {itemSource:prefillItem.side,itemCode:prefillItem.code,categoryKey:prefillItem.category,sorCatalogue:prefillItem.sorCatalogue} : undefined))
  const [ssrDraft, setSsrDraft] = useState<ProjectSsrDataDraft>(() =>
    editingDefinition ? draftFromProjectData(editingDefinition)
      : prefillRecipe?.itemSource === 'SSR' ? draftFromBackendSsr(prefillRecipe) : blankProjectSsrDataDraft()
  )
  const [error, setError] = useState('')

  const beginNewSor = (): void => {
    setDescription('')
    setImageDataUrl(undefined)
    setUnit('Cum')
    setRate('')
    setTimelyRates(false)
    setRateSource(undefined)
    setError('')
    setScreen('sor')
  }

  const beginNewSsr = (): void => {
    setSsrDraft(blankProjectSsrDataDraft())
    setError('')
    setScreen('ssr')
  }

  const saveDefinition = (input: ProjectDataDefinitionInput): void => {
    const definition = editingDefinition
      ? updateProjectData(editingDefinition.id, input)
      : createProjectData(input)
    if (!definition) {
      setError('The project DATA library is not available.')
      return
    }
    onSaved(definition)
  }

  const createSor = (): void => {
    const normalizedDescription = description.trim()
    const normalizedUnit = unit.trim()
    const parsedRate = Number(rate)
    if (!normalizedDescription) return setError('Enter a DATA description.')
    if (!normalizedUnit) return setError('Enter the unit for this DATA.')
    if (!rate.trim() || !Number.isFinite(parsedRate) || parsedRate < 0) {
      return setError('Enter a valid non-negative rate.')
    }
    saveDefinition({
      kind: 'sor',
      description: normalizedDescription,
      imageDataUrl,
      unit: normalizedUnit,
      rate: parsedRate,
      timelyRates,
      rateSource
    })
  }

  const createSsr = (): void => {
    const normalizedDescription = ssrDraft.description.trim()
    const normalizedUnit = ssrDraft.unit.trim()
    if (!normalizedDescription) return setError('Enter an SSR DATA description.')
    if (!normalizedUnit) return setError('Enter the output unit for this SSR DATA.')
    if (!Number.isFinite(ssrDraft.outputQuantity) || ssrDraft.outputQuantity <= 0) {
      return setError('Output quantity must be greater than zero.')
    }
    saveDefinition({
      kind: 'ssr',
      description: normalizedDescription,
      imageDataUrl: ssrDraft.imageDataUrl,
      unit: normalizedUnit,
      outputQuantity: ssrDraft.outputQuantity,
      overheadPercent: Math.max(0, ssrDraft.overheadPercent || 0),
      lead: ssrDraft.lead,
      timelyRates: ssrDraft.timelyRates,
      timelyOverhead: ssrDraft.timelyOverhead,
      rateSource: ssrDraft.rateSource,
      sections: structuredClone(ssrDraft.sections)
    })
  }

  if (screen === 'choose') {
    return (
      <Modal
        title="Create New DATA"
        size="lg"
        onClose={onClose}
        footer={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      >
        <div className="project-data-create-intro">
          <Database size={21} />
          <div>
            <strong>Build a reusable project DATA definition</strong>
            <p>
              It is stored in the DATA library only. Add it to a Component or Sub-component later
              from <b>Add Item → Project DATA</b>.
            </p>
          </div>
        </div>
        <div className="project-data-create-choices">
          <button type="button" className="project-data-create-choice" onClick={beginNewSor}>
            <span className="project-data-create-choice-icon"><Plus size={19} /></span>
            <span>
              <strong>Create a new SOR DATA</strong>
              <small>Enter a fixed rate, or select a SOR code and enable Timely rates.</small>
            </span>
          </button>
          <button type="button" className="project-data-create-choice" onClick={beginNewSsr}>
            <span className="project-data-create-choice-icon"><Layers3 size={19} /></span>
            <span>
              <strong>Create a new SSR DATA</strong>
              <small>Build Materials, Machinery, and Labour with an automatically calculated Abstract.</small>
            </span>
          </button>
        </div>
      </Modal>
    )
  }

  if (screen === 'ssr') {
    return (
      <Modal
        title={editingDefinition ? 'Edit SSR DATA' : 'Create SSR DATA'}
        size="lg"
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={() => editingDefinition ? onClose() : setScreen('choose')}>Back</button>
            <div className="project-data-form-actions">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn" onClick={createSsr}>
                <Plus size={15} /> {editingDefinition ? 'Save SSR DATA' : 'Create SSR DATA'}
              </button>
            </div>
          </>
        }
      >
        <div className="project-data-form project-ssr-create-form">
          <p className="project-data-form-note">
            {editingDefinition?.kind === 'ssr' && editingDefinition.builtIn
              ? 'Edit this DATA using the same Materials, Machinery and Labour builder.'
              : editingDefinition
              ? 'Edit this independent project DATA. You may also use a backend SSR code to replace the current fields.'
              : 'Start blank, or select an SSR code to prefill the editable form. Enable Timely rates for the whole DATA or selected rows.'}
          </p>
          {editingDefinition?.kind === 'ssr' && editingDefinition.builtIn ? (
            <p className="project-data-form-note">
              Built-in M25 wearing coat. Input rates refresh from SSR {project?.meta.sorYear} when
              the project year or zone changes while Timely rates is checked. Edit quantities here; typing a rate turns its yearly update off.
            </p>
          ) : <BackendSsrPrefill
            year={project?.meta.sorYear ?? ''}
            zone={project?.meta.sorZone ?? 'zone_3'}
            onPrefilled={(draft) => {
              setSsrDraft(draft)
              setError('')
            }}
          />}
          <ProjectSsrDataEditor
            value={ssrDraft}
            onChange={setSsrDraft}
            year={project?.meta.sorYear ?? ''}
            zone={project?.meta.sorZone ?? 'zone_3'}
          />
          {error ? <div className="rate-warning project-data-form-error">{error}</div> : null}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={editingDefinition ? 'Edit SOR DATA' : 'Create SOR DATA'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => editingDefinition ? onClose() : setScreen('choose')}>Back</button>
          <div className="project-data-form-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={createSor}>
              <Plus size={15} /> {editingDefinition ? 'Save DATA' : 'Create DATA'}
            </button>
          </div>
        </>
      }
    >
      <div className="project-data-form">
        <p className="project-data-form-note">
          {editingDefinition
            ? 'Changes are saved only to this project DATA definition. Estimate Items using it will use the updated DATA after Sync.'
            : 'This creates a library definition only; it does not add an estimate Item.'}
        </p>
        <BackendSorPrefill year={project?.meta.sorYear ?? ''} zone={project?.meta.sorZone ?? 'zone_3'}
          onPrefilled={(item,rate) => {
            setDescription(item.description);setUnit(item.unit ?? '');setRate(String(rate))
            setRateSource({itemSource:'SOR',categoryKey:item.category,itemCode:item.code,sorCatalogue:item.sorCatalogue})
            setError('')
          }} />
        <div className="project-data-timely-rates">
          <label><input type="checkbox" checked={timelyRates} disabled={!rateSource}
            onChange={event => setTimelyRates(event.target.checked)} /><strong>Timely rates — whole DATA</strong></label>
          <small>{rateSource ? `Source: ${rateSource.itemCode}. ` : 'Select a SOR code first. '}
            When checked, use that code's price for the project or comparison year. When unchecked, keep the entered rate.</small>
        </div>
        <label>
          Description
          <textarea
            value={description}
            rows={4}
            autoFocus
            placeholder="Describe the SOR-type work or material"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <ProjectDataImageField value={imageDataUrl} onChange={setImageDataUrl} />
        <div className="project-data-form-grid">
          <label>
            Unit
            <input className="text-input" value={unit} placeholder="Cum" onChange={(event) => {setUnit(event.target.value);setTimelyRates(false)}} />
          </label>
          <label>
            Rate per unit (₹)
            <input className="text-input" inputMode="decimal" value={rate} placeholder="0.00" onChange={(event) => {setRate(event.target.value);setTimelyRates(false)}} />
          </label>
        </div>
        {error ? <div className="rate-warning project-data-form-error">{error}</div> : null}
      </div>
    </Modal>
  )
}

function draftFromProjectData(definition?: ProjectDataDefinition): ProjectSsrDataDraft {
  if (definition?.kind !== 'ssr') return blankProjectSsrDataDraft()
  return {
    description: definition.description,
    imageDataUrl: definition.imageDataUrl,
    unit: definition.unit,
    outputQuantity: definition.outputQuantity,
    overheadPercent: definition.overheadPercent,
    lead: definition.lead,
    timelyRates: definition.timelyRates,
    timelyOverhead: definition.timelyOverhead ?? Boolean(definition.builtIn && definition.overheadPercent === definition.builtIn.sourceOverheadPercent),
    rateSource: definition.rateSource ?? (definition.builtIn
      ? {itemSource:'SSR',categoryKey:'ssr_item',itemCode:definition.builtIn.sourceItemCode} : undefined),
    sections: structuredClone(definition.sections).map(section => ({...section,lines:section.lines.map(line => ({...line,
      timelyRates: line.timelyRates ?? Boolean(definition.builtIn && !line.editedFields?.includes('rate'))
    }))}))
  }
}

function BackendSorPrefill({year,zone,onPrefilled}: {
  year: string
  zone: 'zone_1' | 'zone_2' | 'zone_3'
  onPrefilled: (item: MasterItem,rate: number) => void
}): JSX.Element {
  const [open,setOpen] = useState(false)
  const [loading,setLoading] = useState('')
  const [error,setError] = useState('')
  const pick = async (item: MasterItem): Promise<void> => {
    if (loading) return
    setLoading(item.code);setError('')
    try {
      const rate = await fetchItemRate({id:`data-source:${item.code}`,kind:'item',name:item.description,children:[],
        itemSource:'SOR',itemCode:item.code,categoryKey:item.category,sorCatalogue:item.sorCatalogue},year,{zone})
      if (rate === null) throw new Error(`No numeric ${year} SOR rate is available for ${item.code}.`)
      onPrefilled(item,rate);setOpen(false)
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to load SOR price.')}
    finally {setLoading('')}
  }
  return <section className="project-data-backend-prefill">
    <div><strong>Use an existing SOR code</strong><small>Copy its price and keep a source link for optional yearly updates.</small></div>
    <button type="button" className="btn ghost compact" onClick={() => setOpen(!open)}><Search size={15} /> {open ? 'Hide codes' : 'Select a code'}</button>
    {loading && <small>Loading {loading}…</small>}
    {open && <div className="project-data-backend-prefill-picker"><SorCodeSelectionColumn sorYear={year} sorZone={zone} onPick={item => void pick(item)} /></div>}
    {error && <div className="rate-warning">{error}</div>}
  </section>
}

function BackendSsrPrefill({
  year,
  zone,
  onPrefilled
}: {
  year: string
  zone: 'zone_1' | 'zone_2' | 'zone_3'
  onPrefilled: (draft: ProjectSsrDataDraft) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [loadingCode, setLoadingCode] = useState('')
  const [error, setError] = useState('')
  const [loadedCode, setLoadedCode] = useState('')
  const materialRateOverrides = useStore(
    (state) => state.project?.meta.materialRateOverrides
  )

  const prefill = async (item: MasterItem): Promise<void> => {
    if (loadingCode) return
    setLoadingCode(item.code)
    setError('')
    try {
      const recipe = await fetchRateAnalysis(backendSsrNode(item), year, {
        zone,
        materialRateOverrides
      })
      onPrefilled(draftFromBackendSsr(recipe))
      setLoadedCode(item.code)
      setOpen(false)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load this backend SSR DATA.')
    } finally {
      setLoadingCode('')
    }
  }

  return (
    <section className="project-data-backend-prefill">
      <div>
        <strong>Use an existing SSR code</strong>
        <small>Opens the same AI-assisted SSR code selector used by Add Item, then copies its analysis into this editable form.</small>
      </div>
      <button type="button" className="btn ghost compact" onClick={() => setOpen((value) => !value)}>
        <Search size={15} /> {open ? 'Hide codes' : 'Select a code'}
      </button>
      {loadedCode ? <small className="project-data-prefill-success">Prefilled from {loadedCode}.</small> : null}
      {open ? (
        <div className="project-data-backend-prefill-picker">
          {loadingCode ? <p>Loading {loadingCode} into the SSR form…</p> : null}
          <SsrCodeSelectionColumn onPick={(item) => void prefill(item)} />
        </div>
      ) : null}
      {error ? <div className="rate-warning project-data-form-error">{error}</div> : null}
    </section>
  )
}

function backendSsrNode(item: MasterItem): ProjectNode {
  return {
    id: `project-data-backend-ssr-${item.code}`,
    kind: 'item',
    name: item.description,
    children: [],
    itemSource: 'SSR',
    itemCode: item.code,
    itemDescription: item.description,
    unit: item.unit ?? undefined,
    categoryKey: 'ssr_item'
  }
}

function draftFromBackendSsr(recipe: RateAnalysisRecipe): ProjectSsrDataDraft {
  const leadInfo = parseLeadInfo(recipe.leadApplicability)
  const leadRefs = materialRefsForLeadInfo(leadInfo, recipe.description)
  const sourceSeigniorageRows = recipe.seigniorageApplicability?.rows ??
    recipe.seigniorageApplicability?.materials ?? []
  const sourceSeigniorageKnown = Boolean(recipe.seigniorageApplicability)
  return {
    description: recipe.description,
    imageDataUrl: undefined,
    unit: recipe.unit,
    outputQuantity: recipe.outputQuantity,
    overheadPercent: recipe.overheadPercent,
    timelyRates: false,
    timelyOverhead: false,
    rateSource: {itemSource:'SSR',itemCode:recipe.itemCode,categoryKey:'ssr_item'},
    lead: overallLeadFromBackend(leadInfo, leadRefs),
    sections: projectDataSsrRateLinks(structuredClone(recipe)).map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        const leadRef = (section.key === 'materials' || section.key === 'machinery')
          ? leadRefs.find((ref) => descriptionsMatch(line.description, ref.name))
          : undefined
        const seigniorageRow = section.key === 'materials'
          ? sourceSeigniorageRows.find((row) => seigniorageMatches(line, row))
          : undefined
        return {
          ...line,
          lead: leadRef
            ? {
                applicable: true,
                conveyanceClass: leadRef.conveyanceClass,
                materialName: leadRef.name
              }
            : section.key === 'materials' || section.key === 'machinery'
              ? { applicable: false }
              : line.lead,
          // Only a material row with a stated backend mineral mapping may be
          // preselected. Never carry a stale Seig flag into machinery/fuel.
          seigniorageApplicable: section.key === 'materials'
            ? sourceSeigniorageKnown
              ? Boolean(seigniorageRow)
              : Boolean(line.seigniorageCode?.trim())
            : false,
          seigniorageCode: section.key === 'materials'
            ? seigniorageRow?.seig_code ?? line.seigniorageCode
            : undefined
        }
      })
    }))
  }
}

function overallLeadFromBackend(
  leadInfo: ReturnType<typeof parseLeadInfo>,
  refs: ReturnType<typeof materialRefsForLeadInfo>
): ProjectSsrDataDraft['lead'] {
  if (!leadInfo.policy || leadInfo.policy.purpose === 'NO_EXTRA_LEAD' || leadInfo.policy.purpose === 'REVIEW_REQUIRED') {
    return { applicable: false }
  }
  const ref = refs[0]
  if (!ref) return { applicable: false }
  return {
    applicable: true,
    materialName: ref.name,
    conveyanceClass: ref.conveyanceClass,
    policy: leadInfo.policy
  }
}

function seigniorageMatches(
  line: { description: string; resourceCode?: string },
  policy: SeigniorageMaterialPolicy
): boolean {
  if (policy.material_code && line.resourceCode) return policy.material_code === line.resourceCode
  return descriptionsMatch(line.description, policy.material_desc ?? policy.recipe_material_desc ?? '')
}

function descriptionsMatch(left: string, right: string): boolean {
  const normalize = (value: string): string => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}
