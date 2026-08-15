import { Database, Layers3, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { materialRefsForLeadInfo, parseLeadInfo } from '../../lib/leadApplicability'
import type { MasterItem } from '../../lib/masterData'
import { fetchRateAnalysis } from '../../lib/rateAnalysis'
import { useStore } from '../../store/useStore'
import type {
  ProjectDataDefinition,
  ProjectDataDefinitionInput,
  ProjectNode
} from '../../types/project'
import type { RateAnalysisRecipe, SeigniorageMaterialPolicy } from '../../types/rateAnalysis'
import Modal from '../modals/Modal'
import { SsrCodeSelectionColumn } from '../modals/AddItemModal'
import ProjectDataImageField from './ProjectDataImageField'
import ProjectSsrDataEditor, {
  blankProjectSsrDataDraft,
  type ProjectSsrDataDraft
} from './ProjectSsrDataEditor'

export default function CreateProjectDataModal({
  onClose,
  onSaved,
  editingDefinition
}: {
  onClose: () => void
  onSaved: (definition: ProjectDataDefinition) => void
  editingDefinition?: ProjectDataDefinition
}): JSX.Element {
  const project = useStore((state) => state.project)
  const createProjectData = useStore((state) => state.createProjectData)
  const updateProjectData = useStore((state) => state.updateProjectData)
  const [screen, setScreen] = useState<'choose' | 'sor' | 'ssr'>(
    editingDefinition?.kind ?? 'choose'
  )
  const [description, setDescription] = useState(
    editingDefinition?.kind === 'sor' ? editingDefinition.description : ''
  )
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(
    editingDefinition?.kind === 'sor' ? editingDefinition.imageDataUrl : undefined
  )
  const [unit, setUnit] = useState(editingDefinition?.kind === 'sor' ? editingDefinition.unit : 'Cum')
  const [rate, setRate] = useState(
    editingDefinition?.kind === 'sor' ? String(editingDefinition.rate) : ''
  )
  const [ssrDraft, setSsrDraft] = useState<ProjectSsrDataDraft>(() =>
    draftFromProjectData(editingDefinition)
  )
  const [error, setError] = useState('')

  const beginNewSor = (): void => {
    setDescription('')
    setImageDataUrl(undefined)
    setUnit('Cum')
    setRate('')
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
      rate: parsedRate
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
              <small>Enter a description, unit, and fixed rate.</small>
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
            {editingDefinition
              ? 'Edit this independent project DATA. You may also use a backend SSR code to replace the current fields.'
              : 'Start blank, or select an existing backend SSR code to prefill this same editable form. The new DATA remains independent of its source.'}
          </p>
          <BackendSsrPrefill
            year={project?.meta.sorYear ?? ''}
            zone={project?.meta.sorZone ?? 'zone_3'}
            onPrefilled={(draft) => {
              setSsrDraft(draft)
              setError('')
            }}
          />
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
            <input className="text-input" value={unit} placeholder="Cum" onChange={(event) => setUnit(event.target.value)} />
          </label>
          <label>
            Rate per unit (₹)
            <input className="text-input" inputMode="decimal" value={rate} placeholder="0.00" onChange={(event) => setRate(event.target.value)} />
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
    sections: structuredClone(definition.sections)
  }
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
    lead: overallLeadFromBackend(leadInfo, leadRefs),
    sections: structuredClone(recipe.sections).map((section) => ({
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
