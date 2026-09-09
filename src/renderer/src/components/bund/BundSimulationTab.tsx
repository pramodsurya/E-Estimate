import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CircleHelp, Gem, Trash2 } from 'lucide-react'
import type { ProjectNode, BundData, BundSection, BundChainageUnit } from '../../types/project'
import type {
  BundFoundationSource,
  BundSeepField,
  BundSimulationCaseId,
  BundSimulationMaterial,
  BundSimulationRun
} from '../../types/bundSimulation'
import { BUND_SIMULATION_CASES } from '../../types/bundSimulation'
import { useStore } from '../../store/useStore'
import {
  orderedSections,
  resolvedHeartingTrenchDepth,
  steepestSection,
  formatChainage
} from '../../lib/bund'
import {
  buildBundSimulationRequest,
  caseJobs,
  defaultBundSimulationWaterInputs,
  isUnresolvedPartialPoolJob,
  normalizeBundSimulationData,
  requestFingerprint,
  simulationEmbankmentLine,
  validateBundSimulationInputs
} from '../../lib/bundSimulation'
import type { BundSimulationJob } from '../../lib/bundSimulation'

/**
 * Stability & seepage simulation tab (BUND_SIMULATION_PLAN.md). The engineer
 * enters soil properties from their investigation, picks one analysis family
 * from the choices the XSLOPE engine genuinely supports, and the live bund
 * section is transferred verbatim to the headless bridge. Nothing in this tab
 * can change quantities, BOQ or drawings.
 *
 * Results are a run history: every completed analysis is appended and stays
 * selectable in the Simulation runs list, so old results remain visible for
 * comparison; the newest run opens by default.
 */

/** Every IS 7894 case family the bridge implements (plan §4). */
const ALL_CASES: BundSimulationCaseId[] = [
  'construction',
  'partial-pool',
  'drawdown-us',
  'drawdown-ds',
  'steady-seepage',
  'rainfall',
  'quake-seepage',
  'quake-full'
]

/** Every analysis the installed engine contract implements — XSLOPE's full set. */
type AnalysisChoice =
  | 'ordinary'
  | 'bishop'
  | 'janbu'
  | 'corps'
  | 'lowe'
  | 'spencer'
  | 'mprice'
  | 'fem-ssrm'

const ANALYSIS_CHOICES: {
  id: AnalysisChoice
  label: string
  hint: string
  /** IS 7894:1975 explicitly describes this analysis procedure. */
  is7894Method?: boolean
}[] = [
  {
    id: 'ordinary',
    label: 'Ordinary / Fellenius',
    hint:
      'Circular-arc Swedish / slip-circle procedure described by IS 7894:1975, clause 7.2 and Appendix C.',
    is7894Method: true
  },
  {
    id: 'bishop',
    label: 'Bishop simplified',
    hint: 'Circular slip-surface search by Bishop\u2019s simplified method.'
  },
  {
    id: 'janbu',
    label: 'Janbu simplified',
    hint: 'Circular search with Janbu\u2019s simplified interslice forces.'
  },
  {
    id: 'corps',
    label: 'Corps of Engineers',
    hint: 'US Army Corps modified Swedish method with inclined interslice forces.'
  },
  {
    id: 'lowe',
    label: 'Lowe & Karafiath',
    hint: 'Interslice forces inclined to the average of the ground and slip surfaces.'
  },
  {
    id: 'spencer',
    label: 'Spencer',
    hint: 'Strict equilibrium with parallel interslice forces.'
  },
  {
    id: 'mprice',
    label: 'Morgenstern\u2013Price',
    hint: 'Strict equilibrium with a variable interslice force function.'
  },
  {
    id: 'fem-ssrm',
    label: 'FEM strength reduction (SSRM)',
    hint: 'Finite-element elasto-plastic solve with strength reduction.'
  }
]

const METHOD_LABELS: Record<string, string> = {
  oms: 'Ordinary method of slices (Fellenius)',
  ordinary: 'Ordinary method of slices (Fellenius)',
  bishop: 'Bishop simplified',
  janbu: 'Janbu simplified',
  corps: 'Corps of Engineers',
  lowe: 'Lowe & Karafiath',
  spencer: 'Spencer',
  mprice: 'Morgenstern–Price',
  'fem-ssrm': 'FEM strength reduction (SSRM)'
}

const is7894AnalysisMethod = (method: string): boolean =>
  method === 'ordinary' || method === 'oms' || method === 'fellenius'

interface LemControlState {
  slices: number
}

interface FemControlState {
  meshSizeM: number
  tolerance: number
  maxIterations: number
}

/** Keyboard- and touch-accessible help shown beside technical UI terms. */
function HelpTip({ term, text }: { term: string; text: string }): JSX.Element {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState({
    left: -9999,
    top: -9999,
    arrowLeft: 20,
    below: false
  })

  const placeTooltip = (): void => {
    window.requestAnimationFrame(() => {
      const anchor = anchorRef.current
      const tooltip = tooltipRef.current
      if (!anchor || !tooltip) return

      const anchorRect = anchor.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()
      const workspaceRect = anchor.closest('.bund-sim')?.getBoundingClientRect()
      const viewportGap = 12
      const workspaceGap = 8
      const leftLimit = Math.max(
        viewportGap,
        workspaceRect ? workspaceRect.left + workspaceGap : viewportGap
      )
      const rightLimit = Math.min(
        window.innerWidth - viewportGap,
        workspaceRect ? workspaceRect.right - workspaceGap : window.innerWidth - viewportGap
      )
      const usableWidth = Math.max(1, rightLimit - leftLimit)
      const width = Math.min(tooltipRect.width, usableWidth)
      const idealLeft = anchorRect.left + anchorRect.width / 2 - width / 2
      const left = Math.min(Math.max(idealLeft, leftLimit), rightLimit - width)
      const aboveTop = anchorRect.top - tooltipRect.height - 8
      const below = aboveTop < viewportGap
      const top = below
        ? Math.min(anchorRect.bottom + 8, window.innerHeight - tooltipRect.height - viewportGap)
        : aboveTop
      const arrowLeft = Math.min(
        width - 12,
        Math.max(12, anchorRect.left + anchorRect.width / 2 - left)
      )

      setPosition({ left, top, arrowLeft, below })
    })
  }

  const tooltipStyle = {
    left: position.left,
    top: position.top,
    maxWidth: 'min(310px, calc(100vw - 24px))',
    '--bund-sim-tooltip-arrow': `${position.arrowLeft}px`
  } as CSSProperties

  return (
    <span
      ref={anchorRef}
      className="bund-sim-help"
      role="button"
      tabIndex={0}
      aria-label={`${term}. ${text}`}
      onMouseEnter={placeTooltip}
      onFocus={placeTooltip}
    >
      <CircleHelp size={13} aria-hidden="true" />
      <span
        ref={tooltipRef}
        className={`bund-sim-tooltip${position.below ? ' is-below' : ''}`}
        role="tooltip"
        style={tooltipStyle}
      >
        <strong>{term}</strong>
        <span>{text}</span>
      </span>
    </span>
  )
}

/** Keeps a field name and its help control together above the input. */
function FieldHelp({ label, help }: { label: string; help: string }): JSX.Element {
  return (
    <span className="bund-sim-field-label">
      <span>{label}</span>
      <HelpTip term={label} text={help} />
    </span>
  )
}

/** The study text shown on each case tab — what the case means and why. */
const CASE_STUDY: Record<
  BundSimulationCaseId,
  { title: string; study: string; notes: string[] }
> = {
  construction: {
    title: 'End of construction',
    study:
      'The bund is at its full height but the fill has had no time to consolidate, ' +
      'so pore water in the fresh embankment carries load as undrained pressure. ' +
      'This is checked with zero pore pressure (total-stress view) on both slopes — ' +
      'the condition that most often governs the upstream slope of new work.',
    notes: [
      'Analyses the upstream and downstream slopes.',
      'Pore pressures assumed fully undissipated (u = 0).',
      'Minimum desired FS ≥ 1.0 (IS 7894 Case I).'
    ]
  },
  'partial-pool': {
    title: 'Reservoir partial pool',
    study:
      'During first filling or a prolonged drawdown of the tank, the reservoir sits ' +
      'partway up the upstream face. Seepage is solved for each trial pool and the ' +
      'upstream slope is checked at roughly one-third and two-thirds of the full ' +
      'head — intermediate levels are where the critical circle tends to sit.',
    notes: [
      'Analyses the upstream slope at two automatic pool levels.',
      'The governing (lower-FS) pool level is reported on each run.',
      'Minimum desired FS ≥ 1.3 (IS 7894 Case II).'
    ]
  },
  'drawdown-us': {
    title: 'Sudden drawdown — upstream',
    study:
      'The reservoir drops from full to the minimum head-water faster than the fill ' +
      'can drain. The pore pressure built up under full pool is still inside the ' +
      'embankment while the stabilising water support has gone. XSLOPE\u2019s staged ' +
      'rapid-drawdown procedure solves both steady fields and reduces the drained ' +
      'strength envelope (d, ψ) of the low-permeability zones.',
    notes: [
      'Analyses the upstream slope.',
      'Needs d/ψ drained-strength parameters on at least one material.',
      'Minimum desired FS ≥ 1.3 (IS 7894 Case III-A).'
    ]
  },
  'drawdown-ds': {
    title: 'Sudden tail-water drawdown',
    study:
      'The tail water downstream falls quickly from its maximum to its minimum while ' +
      'the reservoir stays full. The downstream slope loses the stabilising weight of ' +
      'the tail water while the seepage field still reflects the higher tail level — ' +
      'the same staged procedure as Case III-A applied to the downstream face.',
    notes: [
      'Analyses the downstream slope.',
      'Needs maximum and minimum tail-water levels and d/ψ parameters.',
      'Minimum desired FS ≥ 1.3 (IS 7894 Case III-B).'
    ]
  },
  'steady-seepage': {
    title: 'Steady seepage — reservoir full',
    study:
      'The long-term condition: the tank stands at full level and flow through the ' +
      'section has reached equilibrium. The finite-element seepage solution gives the ' +
      'phreatic surface and pore pressures, which feed directly into the stability of ' +
      'the downstream slope — usually the governing case for a bund in service.',
    notes: [
      'Analyses the downstream slope.',
      'Draws the phreatic line and head-contour figure with the result.',
      'Minimum desired FS ≥ 1.5 (IS 7894 Case IV).'
    ]
  },
  rainfall: {
    title: 'Steady seepage with sustained rainfall',
    study:
      'Prolonged rain keeps the downstream shell wetter than the seepage solution alone ' +
      'would leave it. The level you enter is held on the downstream face as a ' +
      'saturation boundary — the adopted rainfall condition, stored with the result. ' +
      'Enter the level your department\u2019s approved assumption prescribes.',
    notes: [
      'Analyses the downstream slope.',
      'The rainfall level is your engineering decision — the app never invents it.',
      'Minimum desired FS ≥ 1.3 (IS 7894 Case V).'
    ]
  },
  'quake-seepage': {
    title: 'Earthquake — steady seepage',
    study:
      'The service condition with the reservoir full, shaken by a pseudo-static ' +
      'horizontal force kh on every slice. This is the downstream-slope earthquake ' +
      'check; the coefficient comes from your code clause or departmental memo and ' +
      'its source is stored with the run.',
    notes: [
      'Analyses the downstream slope under steady seepage.',
      'kv is recorded for the report; the engine applies the horizontal coefficient.',
      'Minimum desired FS ≥ 1.0 (IS 7894 Case VI-A).'
    ]
  },
  'quake-full': {
    title: 'Earthquake — reservoir full',
    study:
      'The same pseudo-static shake applied with the tank at full level, checking the ' +
      'upstream slope where the reservoir adds both pore pressure and seismic load. ' +
      'Used with Case VI-A together they bracket the seismic condition of the bund.',
    notes: [
      'Analyses the upstream slope under steady seepage.',
      'kv is recorded for the report; the engine applies the horizontal coefficient.',
      'Minimum desired FS ≥ 1.0 (IS 7894 Case VI-B).'
    ]
  }
}

export default function BundSimulationTab({
  node,
  data
}: {
  node: ProjectNode
  data: BundData
}): JSX.Element {
  const setBund = useStore((s) => s.setBund)
  const projectId = useStore((s) => s.project?.id ?? '')
  const activeJob = useStore((s) => s.bundSimulationJobs[node.id] ?? null)
  const anyActiveJob = useStore(
    (s) => Object.values(s.bundSimulationJobs)[0] ?? null
  )
  const startSimulationJob = useStore((s) => s.startBundSimulationJob)
  const patchSimulationJob = useStore((s) => s.patchBundSimulationJob)
  const finishSimulationJob = useStore((s) => s.finishBundSimulationJob)
  const appendSimulationRuns = useStore((s) => s.appendBundSimulationRuns)
  const cancelSimulationJob = useStore((s) => s.cancelBundSimulationJob)
  const sections = useMemo(() => orderedSections(data), [data])
  const critical = useMemo(() => steepestSection(data), [data])
  const [selectedId, setSelectedId] = useState<string | null>(critical?.id ?? sections[0]?.id ?? null)
  const selected: BundSection | null =
    sections.find((s) => s.id === selectedId) ?? sections[0] ?? null

  const sim = useMemo(
    () => normalizeBundSimulationData(data, data.simulation),
    [data]
  )

  /** The loading case whose dedicated tab is open. */
  const [activeCase, setActiveCase] = useState<BundSimulationCaseId>(
    activeJob?.caseId ?? 'steady-seepage'
  )
  const water = sim.water ?? defaultBundSimulationWaterInputs()
  const loading = sim.loading ?? { kh: 0, kv: 0, source: '' }
  const patchWater = (patch: Partial<typeof water>): void =>
    updateSim({ water: { ...water, ...patch } })
  const patchLoading = (patch: Partial<typeof loading>): void =>
    updateSim({ loading: { ...loading, ...patch } })

  /**
   * The u/s toe RL of the section exactly as the engine receives it — the
   * first point of the embankment line. Section.groundLevel (centre-line
   * ground) is often blank, so the toe geometry is the honest source.
   */
  const toeLevel = useMemo(() => {
    if (!selected) return null
    const emb = simulationEmbankmentLine(data, selected)
    if (emb && emb.length > 0) return emb[0][1]
    return selected.upstreamGroundLevel ?? selected.groundLevel ?? null
  }, [data, selected])

  /** Per-case analysis method — each case keeps its own choice. FEM is not
   * offered on the staged-drawdown cases: rapid drawdown is limit-equilibrium
   * machinery and does not exist in the FEM solver. */
  const femAvailable = activeCase !== 'drawdown-us' && activeCase !== 'drawdown-ds'
  const storedChoice = sim.analysisChoices?.[activeCase] as AnalysisChoice | undefined
  const choice: AnalysisChoice =
    (!femAvailable && storedChoice === 'fem-ssrm' ? 'ordinary' : storedChoice) ?? 'ordinary'
  const setChoice = (c: AnalysisChoice): void =>
    updateSim({ analysisChoices: { ...sim.analysisChoices, [activeCase]: c } })

  const [lem, setLem] = useState<LemControlState>({ slices: 40 })
  const [fem, setFem] = useState<FemControlState>({
    meshSizeM: 2,
    tolerance: 0.02,
    maxIterations: 3000
  })
  const controls = useMemo(
    () =>
      choice === 'fem-ssrm'
        ? { analysisType: 'fem-ssrm' as const, method: 'fem-ssrm' as const, ...fem }
        : { analysisType: 'lem' as const, method: choice, slices: lem.slices },
    [choice, lem.slices, fem]
  )
  const activeChoice = ANALYSIS_CHOICES.find((c) => c.id === choice)
  const caseMeta = BUND_SIMULATION_CASES[activeCase]
  const study = CASE_STUDY[activeCase]
  const rapidDrawdown = activeCase === 'drawdown-us' || activeCase === 'drawdown-ds'
  const hasRapidStrengthPair = sim.materials.some(
    (material) =>
      material.rapidD != null &&
      material.rapidPsi != null &&
      (material.rapidD !== 0 || material.rapidPsi !== 0)
  )

  const runningJobs = activeJob?.queuedJobs ?? null
  const [blocked, setBlocked] = useState<string[] | null>(null)

  const unit: BundChainageUnit = data.chainageUnit
  const repair = data.mode === 'restoration'
  const updateSim = (patch: Partial<typeof sim>): void =>
    setBund(node.id, { ...data, simulation: { ...sim, ...patch } })

  const patchMaterial = (index: number, patch: Partial<BundSimulationMaterial>): void =>
    updateSim({
      materials: sim.materials.map((m, i) =>
        i === index ? { ...m, ...patch, propertiesSource: 'engineer-entered' } : m
      )
    })

  const currentFingerprints = useMemo(() => {
    if (!selected) return {} as Partial<Record<BundSimulationCaseId, string>>
    return Object.fromEntries(
      ALL_CASES.flatMap((caseId) => {
        const request = buildBundSimulationRequest(
          data,
          selected,
          sim,
          caseId,
          'fingerprint',
          controls
        )
        return request ? [[caseId, requestFingerprint(request)]] : []
      })
    ) as Partial<Record<BundSimulationCaseId, string>>
  }, [data, selected, sim, controls])

  /**
   * Newest-first history across every analysed section; each case tab lists
   * the runs that belong to it.
   */
  const completedRuns = useMemo(
    () => [...sim.results].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sim.results]
  )
  const caseRuns = useMemo(
    () => completedRuns.filter((r) => r.caseId === activeCase),
    [completedRuns, activeCase]
  )
  /**
   * Runs executed in one press share a group id (Case II's two pool levels)
   * and display as a single run; the governing (lowest-FS) result leads.
   */
  const caseRunGroups = useMemo(() => {
    const groups: { key: string; runs: BundSimulationRun[] }[] = []
    const byKey = new Map<string, { key: string; runs: BundSimulationRun[] }>()
    for (const r of caseRuns) {
      const key = r.groupId ?? r.id
      let group = byKey.get(key)
      if (!group) {
        group = { key, runs: [] }
        byKey.set(key, group)
        groups.push(group)
      }
      group.runs.push(r)
    }
    for (const group of groups) {
      group.runs.sort((a, b) => {
        const fa = a.calculatedFs ?? Number.POSITIVE_INFINITY
        const fb = b.calculatedFs ?? Number.POSITIVE_INFINITY
        return fa - fb
      })
    }
    return groups
  }, [caseRuns])
  /** Explicitly opened run group; falls back to the newest of this case. */
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  /** Run groups checked for deletion in the currently open case tab. */
  const [selectedRunGroupIds, setSelectedRunGroupIds] = useState<string[]>([])
  const activeGroup = useMemo(
    () =>
      (selectedGroupId && caseRunGroups.find((g) => g.key === selectedGroupId)) ||
      caseRunGroups[0] ||
      null,
    [caseRunGroups, selectedGroupId]
  )
  const visibleRunGroupIds = caseRunGroups.map((group) => group.key)
  const selectedVisibleRunGroupIds = selectedRunGroupIds.filter((id) =>
    visibleRunGroupIds.includes(id)
  )
  const allVisibleRunsSelected =
    visibleRunGroupIds.length > 0 &&
    selectedVisibleRunGroupIds.length === visibleRunGroupIds.length

  const toggleRunGroupSelection = (groupId: string, checked: boolean): void => {
    setSelectedRunGroupIds((current) =>
      checked
        ? current.includes(groupId)
          ? current
          : [...current, groupId]
        : current.filter((id) => id !== groupId)
    )
  }

  const toggleAllVisibleRuns = (): void => {
    setSelectedRunGroupIds(allVisibleRunsSelected ? [] : visibleRunGroupIds)
  }

  const deleteSelectedRuns = (): void => {
    const selectedKeys = new Set(selectedVisibleRunGroupIds)
    if (selectedKeys.size === 0) return
    const storedResultsToDelete = sim.results.filter((run) =>
      selectedKeys.has(run.groupId ?? run.id)
    ).length
    const groupCount = selectedKeys.size
    const confirmed = window.confirm(
      `Delete ${groupCount} selected run${groupCount === 1 ? '' : 's'} from ` +
        `${caseMeta.short}? This removes ${storedResultsToDelete} stored result` +
        `${storedResultsToDelete === 1 ? '' : 's'} from this project and cannot be undone.`
    )
    if (!confirmed) return
    updateSim({
      results: sim.results.filter((run) => !selectedKeys.has(run.groupId ?? run.id))
    })
    setSelectedRunGroupIds([])
    if (selectedGroupId && selectedKeys.has(selectedGroupId)) setSelectedGroupId(null)
  }

  /**
   * Execute one case family and return only its fresh runs, or the validation
   * errors that blocked it. The store atomically merges fresh runs into the
   * latest project node after completion. Case II expands into two pool jobs.
   */
  const executeCase = async (
    caseId: BundSimulationCaseId
  ): Promise<{ runs: BundSimulationRun[] } | { errors: string[] }> => {
    if (!selected) return { errors: ['No analysis section selected.'] }
    const reservoirLevel =
      water.reservoirFull ?? data.design.ftl ?? data.design.mwl ?? null
    const check = validateBundSimulationInputs(
      sim,
      [caseId],
      reservoirLevel,
      controls.analysisType,
      controls,
      toeLevel
    )
    if (check.errors.length > 0) return { errors: check.errors }
    const jobs = caseJobs(caseId, water, toeLevel, data.design.topLevel)
    // One press of Run = one run row: Case II's two pool levels share a group
    // id so their results travel and display together.
    const groupId = `${Date.now()}-${caseId}`
    const started = startSimulationJob({
      projectId,
      nodeId: node.id,
      groupId,
      caseId,
      sectionId: selected.id,
      chainage: selected.chainage,
      startedAt: new Date().toISOString(),
      queuedJobs: jobs.map((job) => ({
        caseId: job.caseId,
        ...(job.subcase ? { subcase: job.subcase } : {})
      })),
      totalJobs: jobs.length,
      completedJobs: 0,
      currentRunId: null,
      phase: 'starting',
      message: 'Preparing the simulation request.',
      cancelRequested: false
    })
    if (!started) {
      return { errors: ['Another bund simulation is already running. Wait for it or cancel it.'] }
    }

    const runs: BundSimulationRun[] = []
    for (const [index, job] of jobs.entries()) {
      const liveJob = useStore.getState().bundSimulationJobs[node.id]
      if (!liveJob || liveJob.cancelRequested) break
      // A derived trial pool below the ground or above the crest cannot be
      // solved — record why instead of sending the engine a singular model.
      if (job.invalid) {
          runs.push(
            notEvaluatedRun(
              job,
              selected,
              `The trial ${job.subcase ?? 'pool level'} is not a partial pool — it sits ` +
                'outside the section (below the ground surface or at/above the crest). ' +
                'Check the full reservoir level and the section levels.',
              controls,
              groupId
            )
          )
          patchSimulationJob(node.id, { completedJobs: index + 1 })
          continue
      }
      // Only Case II gets its reservoir level from the expanded job. Other
      // seepage cases deliberately leave this null and use the full level
      // while their engine request is built.
      if (isUnresolvedPartialPoolJob(job)) {
          runs.push(
            notEvaluatedRun(
              job,
              selected,
              `The trial pool levels could not be derived. Full reservoir level: ` +
                `${water.reservoirFull != null ? `${water.reservoirFull.toFixed(2)} m RL` : 'not entered'}; ` +
                `u/s toe (ground) level at this section: ` +
                `${toeLevel != null ? `${toeLevel.toFixed(2)} m RL` : 'not recorded'}. ` +
                `The full level must sit above the toe level for a partial pool to exist.`,
              controls,
              groupId
            )
          )
          patchSimulationJob(node.id, { completedJobs: index + 1 })
          continue
      }
      const runId = `${groupId}-${index}`
      const request = buildBundSimulationRequest(
          data,
          selected,
          sim,
          job.caseId,
          runId,
          controls,
          job
      )
      if (!request) {
          runs.push(
            notEvaluatedRun(job, selected, 'This section cannot be mapped for analysis.', controls, groupId)
          )
          patchSimulationJob(node.id, { completedJobs: index + 1 })
          continue
      }
      patchSimulationJob(node.id, {
        currentRunId: runId,
        phase: 'starting',
        message:
          job.subcase != null
            ? `Starting ${job.subcase}.`
            : `Starting ${BUND_SIMULATION_CASES[job.caseId].short}.`
      })
      const response = await window.api.bund.simulate(request)
      runs.push(toRun(response, job, selected, request, check.warnings, groupId))
      patchSimulationJob(node.id, {
        completedJobs: index + 1,
        currentRunId: null,
        phase: 'finalizing',
        message: 'Finishing the simulation run.'
      })
      if (useStore.getState().bundSimulationJobs[node.id]?.cancelRequested) break
    }
    return { runs }
  }

  /** Run the open case family. */
  const runCase = async (caseId: BundSimulationCaseId): Promise<void> => {
    if (anyActiveJob) {
      setBlocked([
        anyActiveJob.nodeId === node.id
          ? `${BUND_SIMULATION_CASES[anyActiveJob.caseId].short} is already running for this bund.`
          : `Another bund simulation (${BUND_SIMULATION_CASES[anyActiveJob.caseId].short}) is already running.`
      ])
      return
    }
    setBlocked(null)
    try {
      const outcome = await executeCase(caseId)
      if ('errors' in outcome) {
        setBlocked(outcome.errors)
        return
      }
      const finishedJob = useStore.getState().bundSimulationJobs[node.id]
      const cancelled = finishedJob?.cancelRequested ?? false
      if (cancelled) {
        finishSimulationJob(
          node.id,
          'cancelled',
          `${BUND_SIMULATION_CASES[caseId].short} was cancelled; no unfinished result was stored.`
        )
        return
      }
      const attached = appendSimulationRuns(projectId, node.id, sim, outcome.runs)
      if (!attached) {
        finishSimulationJob(
          node.id,
          'error',
          'The simulation finished after its project was closed or replaced, so the result could not be attached.'
        )
        return
      }
      const failed = outcome.runs.some(
        (run) => run.status === 'error' || run.status === 'not-evaluated'
      )
      finishSimulationJob(
        node.id,
        failed ? 'error' : 'complete',
        failed
          ? `${BUND_SIMULATION_CASES[caseId].short} finished without a usable result. Open Simulation for details.`
          : `${BUND_SIMULATION_CASES[caseId].short} completed and its result was added to the run history.`
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      if (useStore.getState().bundSimulationJobs[node.id]) {
        finishSimulationJob(
          node.id,
          'error',
          `The analysis could not return a result: ${detail || 'unknown application error'}.`
        )
      } else {
        setBlocked([
          `The analysis could not start or return a result: ${detail || 'unknown application error'}.`
        ])
      }
    }
  }

  const cancelCurrentRun = (): void => {
    if (!activeJob || activeJob.cancelRequested) return
    if (
      window.confirm(
        `Cancel the running ${BUND_SIMULATION_CASES[activeJob.caseId].short} analysis? ` +
          'Its unfinished numerical result will not be available.'
      )
    ) {
      void cancelSimulationJob(node.id)
    }
  }

  const caseRunsOf = (caseId: BundSimulationCaseId): number =>
    completedRuns.filter((r) => r.caseId === caseId).length

  return (
    <div className="workarea-scroll">
      <div className="bund-sim">
        <header className="bund-sim-header">
          <div>
            <h2>Stability &amp; seepage simulation</h2>
            <small>
              Verification tool — analyses the designed section without touching
              the estimate. Soil properties must come from your investigation or
              an approved report.
            </small>
          </div>
        </header>

        <div className="bund-sim-help-banner">
          <CircleHelp size={15} aria-hidden="true" />
          <span>
            Hover over or focus any <strong>?</strong> for a plain-language meaning.
            <strong> RL</strong> means Reduced Level: an absolute elevation relative to the
            project datum, not a water depth.
          </span>
        </div>

        <section className="bund-sim-card bund-sim-sectionbar">
          <div className="bund-sim-sectionbar-head">
            <h3>
              Analysis section{' '}
              <HelpTip
                term="Analysis section"
                text="The cross-section of the bund sent to the solver. Different chainages can have different heights and slopes, so the lowest factor of safety may occur at only one section."
              />
            </h3>
            {critical && selected?.id === critical.id && (
              <span className="bund-sim-badge">
                Suggested critical section — tallest / steepest
              </span>
            )}
          </div>
          <div className="bund-sim-chainages">
            {sections.map((s) => (
              <button
                key={s.id}
                className={`btn ghost${s.id === selected?.id ? ' active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                Ch. {formatChainage(s.chainage, unit)}
                {critical && s.id === critical.id ? ' ◆' : ''}
              </button>
            ))}
          </div>
          {selected && (
            <dl className="bund-sim-geometry bund-sim-geometry-inline">
              <div>
                <dt>
                  Crest level{' '}
                  <HelpTip
                    term="Crest level"
                    text="Absolute elevation of the top of the bund, expressed as RL."
                  />
                </dt>
                <dd>{data.design.topLevel.toFixed(2)} m</dd>
              </div>
              <div>
                <dt>
                  Crest width{' '}
                  <HelpTip
                    term="Crest width"
                    text="Horizontal width across the top of the completed bund."
                  />
                </dt>
                <dd>{data.design.topWidth.toFixed(2)} m</dd>
              </div>
              <div>
                <dt>
                  Upstream slope{' '}
                  <HelpTip
                    term="Upstream slope"
                    text="The reservoir-facing side. A value 2:1 means 2 metres horizontal for 1 metre vertical."
                  />
                </dt>
                <dd>{data.design.usSlope}:1</dd>
              </div>
              <div>
                <dt>
                  Downstream slope{' '}
                  <HelpTip
                    term="Downstream slope"
                    text="The land-facing side away from the reservoir. A value 2:1 means 2 metres horizontal for 1 metre vertical."
                  />
                </dt>
                <dd>{data.design.dsSlope}:1</dd>
              </div>
            </dl>
          )}
        </section>

        <nav className="bund-sim-tabs" role="tablist">
          {ALL_CASES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === activeCase}
              className={`bund-sim-tab${id === activeCase ? ' active' : ''}`}
              onClick={() => {
                setActiveCase(id)
                setBlocked(null)
                setSelectedRunGroupIds([])
              }}
            >
              <span>{BUND_SIMULATION_CASES[id].short}</span>
              <small>
                FS ≥ {BUND_SIMULATION_CASES[id].requiredFs}
                {caseRunsOf(id) > 0 ? ` · ${caseRunsOf(id)} run${caseRunsOf(id) > 1 ? 's' : ''}` : ''}
              </small>
            </button>
          ))}
        </nav>

        <section className="bund-sim-card bund-sim-study">
          <h3>
            {caseMeta.label} — {study.title}
          </h3>
          <p className="bund-sim-study-text">{study.study}</p>
          <ul className="bund-sim-study-notes">
            {study.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>

        <section className="bund-sim-card bund-sim-bc">
          <h3>
            Boundary conditions — {caseMeta.short}{' '}
            <HelpTip
              term="Boundary conditions"
              text="The water levels or earthquake loading applied at the edges of this section. They define the physical condition being analysed; they are not calculated soil properties."
            />
          </h3>
          {blocked && (
            <ul className="bund-sim-errors">
              {blocked.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <CaseBoundaryConditions
            caseId={activeCase}
            water={water}
            loading={loading}
            patchWater={patchWater}
            patchLoading={patchLoading}
            groundLevel={toeLevel}
            missing={missingBcFields(activeCase, water, loading, toeLevel)}
          />
        </section>

        <section className="bund-sim-card">
          <h3>
            Analysis type — {caseMeta.short}{' '}
            <HelpTip
              term="Analysis type"
              text="The numerical procedure used to calculate stability. Limit-equilibrium methods search possible sliding surfaces; FEM strength reduction progressively weakens the model until a failure mechanism develops."
            />
          </h3>
          <div className="bund-sim-methods">
            {ANALYSIS_CHOICES.map((c) => {
              if (c.id === 'fem-ssrm' && !femAvailable) return null
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`bund-sim-method-btn${choice === c.id ? ' active' : ''}`}
                  title={c.hint}
                  aria-label={`${c.label}${c.is7894Method ? ' — method described in IS 7894' : ''}`}
                  onClick={() => setChoice(c.id)}
                >
                  {c.is7894Method && (
                    <span className="bund-sim-is-diamond" title="Method described in IS 7894:1975">
                      <Gem size={14} aria-hidden="true" />
                    </span>
                  )}
                  <span>{c.label}</span>
                </button>
              )
            })}
          </div>
          <div className="bund-sim-is-legend">
            <Gem size={13} aria-hidden="true" />
            <span>
              IS 7894 method — the diamond marks an analysis procedure described by the
              code. It does not by itself approve the soil inputs, loading treatment or result.
            </span>
          </div>
          <p className="bund-sim-hint">
            {activeChoice?.hint}
            {!femAvailable &&
              ' FEM strength reduction is not available for the staged drawdown cases — rapid drawdown is a limit-equilibrium procedure.'}
          </p>
          {controls.analysisType === 'lem' ? (
            <div className="bund-param-grid">
              <label>
                <FieldHelp
                  label="Slice count (10–500)"
                  help="A slip mass is divided into vertical slices for calculation. More slices describe the arc more finely but take longer; about 40 is a normal starting value."
                />
                <NumberInput
                  value={lem.slices}
                  onChange={(v) => setLem({ ...lem, slices: Math.round(v ?? 40) })}
                />
              </label>
            </div>
          ) : (
            <div className="bund-param-grid three">
              <label>
                <FieldHelp
                  label="Mesh size (m)"
                  help="Target size of finite-element triangles. A smaller value gives a finer mesh and usually a slower calculation; refine it to check that FS is not sensitive to mesh size."
                />
                <NumberInput
                  value={fem.meshSizeM}
                  onChange={(v) => setFem({ ...fem, meshSizeM: v ?? 2 })}
                />
              </label>
              <label>
                <FieldHelp
                  label="SSRM tolerance"
                  help="How closely the strength-reduction solver must narrow the stable/failed FS bracket. A smaller tolerance is stricter and may require more work."
                />
                <NumberInput
                  value={fem.tolerance}
                  onChange={(v) => setFem({ ...fem, tolerance: v ?? 0.02 })}
                />
              </label>
              <label>
                <FieldHelp
                  label="Maximum iterations"
                  help="Safety limit on the numerical iterations. Reaching it means the solution was not allowed to continue, not that the bund automatically failed."
                />
                <NumberInput
                  value={fem.maxIterations}
                  onChange={(v) => setFem({ ...fem, maxIterations: Math.round(v ?? 3000) })}
                />
              </label>
            </div>
          )}
        </section>

        <div className="bund-sim-layout">
          <div className="bund-sim-col">
            <section className="bund-sim-card">
              <h3>
                Material properties{' '}
                <HelpTip
                  term="Material properties"
                  text="Engineer-entered soil parameters for each zone. These values strongly control the calculated FS and should come from laboratory/field testing or an approved geotechnical report."
                />
              </h3>
              <p className="bund-sim-preliminary-warning" role="note">
                Soil-type values loaded from Design are preliminary screening defaults. Replace
                them with project laboratory or field results before relying on an analysis.
                Editing any value marks that material as engineer-entered; it does not mark it as
                laboratory-tested.
              </p>
              {rapidDrawdown && !hasRapidStrengthPair && (
                <p className="bund-sim-material-gate" role="note">
                  {caseMeta.short} cannot start yet. Enter both <strong>d</strong> and{' '}
                  <strong>ψ</strong> for at least one low-permeability soil material below.
                  These must come from the adopted rapid-drawdown strength procedure.
                </p>
              )}
              <div className="bund-mat-grid">
                {sim.materials.map((m, i) => (
                  <article key={m.role ?? i} className="bund-mat-card">
                    <header>
                      <input
                        className="bund-mat-name"
                        value={m.name}
                        onChange={(e) => patchMaterial(i, { name: e.target.value })}
                      />
                       <span className={`bund-mat-role is-${m.role ?? 'embankment'}`}>
                        {m.role === 'foundation'
                          ? 'foundation'
                          : m.role === 'hearting'
                          ? 'impervious core'
                          : m.role === 'cutoff-trench'
                          ? 'cut-off'
                          : m.role === 'rocktoe'
                          ? 'rock toe'
                          : m.role === 'rocktoe-filter'
                          ? 'toe filter'
                          : 'fill'}
                       </span>
                     </header>
                    <div className={`bund-material-source is-${m.propertiesSource ?? 'legacy'}`}>
                      {m.propertiesSource === 'preliminary-default'
                        ? 'Preliminary soil-type defaults'
                        : m.propertiesSource === 'engineer-entered'
                          ? 'Engineer-entered values — verification required'
                          : 'Existing project values — source not recorded'}
                    </div>
                    <div className="bund-mat-fields">
                      <label>
                        <FieldHelp
                          label="γ moist"
                          help="Moist or bulk unit weight of soil above saturation, in kN/m³. It controls the self-weight of each slice."
                        />
                        <NumberInput value={m.gamma} onChange={(v) => patchMaterial(i, { gamma: v })} />
                      </label>
                      <label>
                        <FieldHelp
                          label="γ saturated"
                          help="Saturated unit weight in kN/m³, used where soil pores are filled with water."
                        />
                        <NumberInput value={m.gammaSat} onChange={(v) => patchMaterial(i, { gammaSat: v })} />
                      </label>
                      <label>
                        <FieldHelp
                          label="c′ (kPa)"
                          help="Effective cohesion: the intercept of the drained shear-strength envelope, in kPa. Use the effective-stress value supported by testing."
                        />
                        <NumberInput value={m.cPrime} onChange={(v) => patchMaterial(i, { cPrime: v })} />
                      </label>
                      <label>
                        <FieldHelp
                          label="φ′ (degrees)"
                          help="Effective angle of internal friction. Higher φ′ generally provides more shear resistance under effective stress."
                        />
                        <NumberInput value={m.phiPrime} onChange={(v) => patchMaterial(i, { phiPrime: v })} />
                      </label>
                      <label>
                        <FieldHelp
                          label="kx (m/s)"
                          help="Horizontal hydraulic conductivity (permeability). A smaller value means water drains more slowly. If ky is not separately available, the model treats permeability as isotropic."
                        />
                        <NumberInput value={m.kx} onChange={(v) => patchMaterial(i, { kx: v })} />
                      </label>
                      <label>
                        <FieldHelp
                          label="E (kPa)"
                          help="Young’s modulus: soil stiffness used only by FEM strength reduction. It affects computed deformation and numerical response, not the LEM slice equations."
                        />
                        <NumberInput
                          value={m.elasticModulusKpa}
                          onChange={(v) => patchMaterial(i, { elasticModulusKpa: v })}
                        />
                      </label>
                      <label>
                        <FieldHelp
                          label="ν (Poisson’s ratio)"
                          help="Dimensionless FEM parameter describing lateral strain caused by axial strain. It must be at least 0 and below 0.5."
                        />
                        <NumberInput
                          value={m.poissonRatio}
                          onChange={(v) => patchMaterial(i, { poissonRatio: v })}
                        />
                      </label>
                      <label>
                        <FieldHelp
                          label="d (kPa, drawdown)"
                          help="Intercept of the special rapid-drawdown drained-strength envelope used in Cases III-A and III-B. Obtain it from the adopted drawdown-strength procedure; it is not automatically equal to c′."
                        />
                        <NumberInput
                          value={m.rapidD ?? null}
                          onChange={(v) => patchMaterial(i, { rapidD: v })}
                        />
                      </label>
                      <label>
                        <FieldHelp
                          label="ψ (degrees, drawdown)"
                          help="Angle of the special rapid-drawdown strength envelope used with d in Cases III-A and III-B. It is a strength parameter, not a dilation angle in this form."
                        />
                        <NumberInput
                          value={m.rapidPsi ?? null}
                          onChange={(v) => patchMaterial(i, { rapidPsi: v })}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
              {sim.materials.some(
                (material) =>
                  material.role === 'rocktoe' || material.role === 'rocktoe-filter'
              ) && (
                <p className="bund-sim-zone-note">
                  Rock toe and filter are enabled in Design. Simulation imports their section
                  geometry and treats them as separate strength, weight and drainage zones. The
                  engineering properties above remain subject to geotechnical verification.
                </p>
              )}
              <p className="bund-sim-hint">
                γ, c′, φ′ feed every analysis; kx feeds the seepage cases; E and
                ν feed only the FEM strength-reduction solve; d and ψ are the
                drained envelope used by the staged drawdown cases (III-A/III-B).
              </p>
            </section>
          </div>

          <div className="bund-sim-col">
            <section className="bund-sim-card">
              <h3>
                Foundation model{' '}
                <HelpTip
                  term="Foundation model"
                  text="The soil layer included below the bund so slip surfaces and seepage can extend into the foundation. It is an analysis model and should be matched to the investigated strata."
                />
              </h3>
              {repair ? (
                <p className="bund-sim-note">
                  A repair survey measures the existing bund surface only — the
                  foundation beneath it is not known. The thickness and soil
                  properties below are your engineer-entered assumptions unless
                  you attach test evidence.
                </p>
              ) : (
                <ImportedGeometrySummary data={data} section={selected} />
              )}
              <div className="bund-param-grid">
                <label>
                  <FieldHelp
                    label="Modelled foundation thickness (m)"
                    help="Vertical depth of foundation soil included beneath the bund in the numerical domain. It is not automatically the real geological-layer thickness; make it deep enough that the critical mechanism is not cut off by the model boundary."
                  />
                  <NumberInput
                    value={sim.foundationThicknessM}
                    onChange={(v) => updateSim({ foundationThicknessM: v ?? 0 })}
                  />
                </label>
                <label>
                  <FieldHelp
                    label="Soil property source"
                    help="Choose Tested only when the foundation parameters are supported by an investigation or approved report. Assumed values should remain clearly identified as assumptions."
                  />
                  <select
                    value={sim.foundationSource ?? 'assumed'}
                    onChange={(e) =>
                      updateSim({
                        foundationSource:
                          (e.target.value === 'tested' ? 'tested' : 'assumed') as BundFoundationSource
                      })
                    }
                  >
                    <option value="assumed">Assumed</option>
                    <option value="tested">Tested / approved report</option>
                  </select>
                </label>
                {(sim.foundationSource ?? 'assumed') === 'tested' && (
                  <label>
                    <FieldHelp
                      label="Investigation / report reference"
                      help="Report number, borehole/test reference, date or other traceable source supporting the adopted foundation parameters."
                    />
                    <input
                      type="text"
                      value={sim.foundationReference ?? ''}
                      onChange={(e) => updateSim({ foundationReference: e.target.value })}
                    />
                  </label>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="bund-sim-card bund-sim-runs-card">
          <div className="bund-sim-sectionbar-head">
            <h3>Simulation runs — {caseMeta.short}</h3>
            <div className="bund-sim-run-actions">
              {!runningJobs && caseRunGroups.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={toggleAllVisibleRuns}
                  >
                    {allVisibleRunsSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost bund-sim-delete-runs"
                    disabled={selectedVisibleRunGroupIds.length === 0}
                    onClick={deleteSelectedRuns}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete selected
                    {selectedVisibleRunGroupIds.length > 0
                      ? ` (${selectedVisibleRunGroupIds.length})`
                      : ''}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={!!anyActiveJob || !selected}
                onClick={() => void runCase(activeCase)}
              >
                {activeJob
                  ? 'Analysing…'
                  : anyActiveJob
                  ? 'Another simulation is running'
                  : `Run ${caseMeta.short}`}
              </button>
              {activeJob && (
                <button
                  type="button"
                  className="btn ghost bund-sim-delete-runs"
                  disabled={activeJob.cancelRequested}
                  onClick={cancelCurrentRun}
                >
                  {activeJob.cancelRequested ? 'Cancelling…' : 'Cancel simulation'}
                </button>
              )}
            </div>
          </div>
          {runningJobs && (
            <div className="bund-sim-state is-running" role="status">
              <span className="bund-sim-pulse" aria-hidden="true" />
              <div className="bund-sim-running-copy">
                <div className="bund-sim-current-run-head">
                  <span className="bund-sim-run-status is-running">RUNNING</span>
                  <strong>
                    Current run —{' '}
                    {runningJobs
                      .map(
                        (job) =>
                          `${BUND_SIMULATION_CASES[job.caseId].short}${
                            job.subcase ? ` (${job.subcase})` : ''
                          }`
                      )
                      .join(', ')}
                  </strong>
                  <span>Ch. {formatChainage(activeJob.chainage, unit)}</span>
                </div>
                <span>{activeJob.message}</span>
                <span>
                  This result will be added above the stored history when it finishes.
                </span>
                {(activeJob.caseId === 'drawdown-us' ||
                  activeJob.caseId === 'drawdown-ds') && (
                  <span className="bund-sim-running-detail">
                    The two seepage stages run first; the slip-circle search can take several
                    minutes.
                  </span>
                )}
              </div>
            </div>
          )}
          {!runningJobs && blocked && (
            <div className="bund-sim-state is-error" role="alert" aria-live="assertive">
              <strong>Run {caseMeta.short} did not start.</strong>
              <ul className="bund-sim-errors">
                {blocked.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
              <span>Correct the listed inputs and press Run again.</span>
            </div>
          )}
          {!runningJobs && !blocked && caseRunGroups.length === 0 && (
            <div className="bund-sim-state is-empty">
              No {caseMeta.short} runs yet. Complete the boundary conditions
              above and press <strong>Run {caseMeta.short}</strong>.
            </div>
          )}
          {caseRunGroups.length > 0 && (
            <>
              <div className="bund-sim-runs-label">
                <strong>{runningJobs ? 'Previous completed runs' : 'Stored runs'}</strong>
                <span>
                  {caseRunGroups.length} run{caseRunGroups.length === 1 ? '' : 's'} · newest first
                </span>
              </div>
              <ul className="bund-sim-runs">
              {caseRunGroups.map((group) => {
                // The governing (lowest-FS) result leads the row; multi-pool
                // groups name every pool they solved.
                const governing = group.runs[0]
                const subcases = group.runs
                  .map((r) => r.subcase)
                  .filter((s): s is string => !!s)
                return (
                  <li
                    key={group.key}
                    className={`bund-sim-run-entry${
                      selectedRunGroupIds.includes(group.key) ? ' is-selected' : ''
                    }`}
                  >
                    {!runningJobs && (
                      <label
                        className="bund-sim-run-select"
                        title={`Select this ${caseMeta.short} run for deletion`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRunGroupIds.includes(group.key)}
                          onChange={(event) =>
                            toggleRunGroupSelection(group.key, event.target.checked)
                          }
                          aria-label={`Select ${caseMeta.short} run from ${new Date(
                            governing.createdAt
                          ).toLocaleString()} for deletion`}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className={`bund-sim-run-row${activeGroup?.key === group.key ? ' active' : ''}`}
                      onClick={() => setSelectedGroupId(group.key)}
                    >
                      <RunStatusChip run={governing} />
                      <span className="bund-sim-run-case">
                        {BUND_SIMULATION_CASES[governing.caseId].short}
                        {subcases.length > 1
                          ? ` · ${subcases.join(' & ')}`
                          : subcases[0]
                          ? ` · ${subcases[0]}`
                          : ''}
                        {group.runs.length > 1 ? ` (${group.runs.length} pools)` : ''}
                      </span>
                      <span className="bund-sim-run-fs">
                        {governing.calculatedFs != null
                          ? `FS ${governing.calculatedFs.toFixed(3)}${
                              group.runs.length > 1 ? ' (governing)' : ''
                            }`
                          : '—'}
                      </span>
                      <span className="bund-sim-run-meta">
                        Ch. {formatChainage(governing.chainage, unit)} ·{' '}
                        {is7894AnalysisMethod(governing.method) && (
                          <Gem size={12} aria-label="Method described in IS 7894" />
                        )}
                        {METHOD_LABELS[governing.method] ?? governing.method.toUpperCase()} ·{' '}
                        {new Date(governing.createdAt).toLocaleTimeString()}
                      </span>
                    </button>
                  </li>
                )
              })}
              </ul>
            </>
          )}
        </section>

        <section className="bund-sim-card bund-sim-results-card">
          <h3>
            Result
            {activeGroup
              ? ` — ${BUND_SIMULATION_CASES[activeGroup.runs[0].caseId].short}` +
                (activeGroup.runs.length > 1
                  ? ` · governing of ${activeGroup.runs.length} pools`
                  : activeGroup.runs[0].subcase
                  ? ` · ${activeGroup.runs[0].subcase}`
                  : '')
              : ''}{' '}
            <HelpTip
              term="Result"
              text="The calculated factor of safety and the numerical failure mechanism for the selected run. Meeting the displayed FS target is a calculation outcome, not automatic approval of the inputs or design."
            />
          </h3>
          <details className="bund-sim-result-guide">
            <summary>
              <CircleHelp size={14} aria-hidden="true" /> How to read the result
            </summary>
            <dl>
              <div>
                <dt>FS</dt>
                <dd>
                  Available resisting shear strength divided by the shear demand needed
                  for sliding. FS above the case target means the numerical target is met.
                </dd>
              </div>
              <div>
                <dt>Slip circle</dt>
                <dd>
                  A mathematical circular trial surface—not a hole in the bund. The soil
                  mass above its solid arc is the potential rotating/sliding mass.
                </dd>
              </div>
              <div>
                <dt>Seepage colours</dt>
                <dd>
                  Hydraulic total head from lower (purple/blue) to higher (yellow/red).
                  These colours show water energy, not pass/fail or soil danger.
                </dd>
              </div>
              <div>
                <dt>Phreatic line</dt>
                <dd>
                  Dashed blue zero-pressure line. Soil below it is generally saturated
                  with positive pore-water pressure in this model.
                </dd>
              </div>
            </dl>
          </details>
          {!activeGroup ? (
            <div className="bund-sim-state is-empty">
              Click a completed {caseMeta.short} run above to see its full
              result here.
            </div>
          ) : (
            <div className="bund-sim-results">
              {activeGroup.runs.map((run) => (
                <ResultCard
                  key={run.id}
                  run={run}
                  currentFingerprint={
                    run.sectionId === selected?.id
                      ? currentFingerprints[run.caseId] ?? null
                      : null
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Boundary-condition blanks this case still needs before it can run. Mirrors
 * the run gate so the empty field itself can be highlighted, not just named.
 */
type MissingBcKey =
  | 'reservoirFull'
  | 'minHeadwater'
  | 'tailWaterMax'
  | 'tailWaterMin'
  | 'rainfallLevel'
  | 'kh'

function missingBcFields(
  caseId: BundSimulationCaseId,
  water: ReturnType<typeof defaultBundSimulationWaterInputs>,
  loading: { kh: number; kv: number; source?: string },
  toeLevel: number | null = null
): MissingBcKey[] {
  const missing: MissingBcKey[] = []
  if (caseId === 'construction') return missing
  if (water.reservoirFull == null) missing.push('reservoirFull')
  if (caseId === 'drawdown-us') {
    if (water.minHeadwater == null) missing.push('minHeadwater')
    if (water.tailWaterMax == null || (toeLevel != null && water.tailWaterMax <= toeLevel))
      missing.push('tailWaterMax')
  }
  if (caseId === 'drawdown-ds') {
    if (water.tailWaterMax == null || (toeLevel != null && water.tailWaterMax <= toeLevel))
      missing.push('tailWaterMax')
    if (
      water.tailWaterMin == null ||
      (toeLevel != null && water.tailWaterMin <= toeLevel) ||
      (water.tailWaterMax != null && water.tailWaterMin >= water.tailWaterMax)
    )
      missing.push('tailWaterMin')
  }
  if (caseId === 'rainfall' && (water.rainfallLevel == null || (toeLevel != null && water.rainfallLevel <= toeLevel)))
    missing.push('rainfallLevel')
  if ((caseId === 'quake-seepage' || caseId === 'quake-full') && !(loading.kh > 0))
    missing.push('kh')
  return missing
}

const MISSING_BC_TEXT: Record<MissingBcKey, string> = {
  reservoirFull: 'Enter the full reservoir level.',
  minHeadwater: 'Enter the minimum head-water after drawdown.',
  tailWaterMax: 'Enter the maximum tail-water as an absolute RL above the ground surface (e.g. 1 m depth above a toe at 90 m = RL 91).',
  tailWaterMin: 'Enter the minimum tail-water as an absolute RL — above the ground surface and below the maximum.',
  rainfallLevel: 'Enter the rainfall saturation level as an absolute RL above the ground surface.',
  kh: 'Enter kh greater than zero.'
}

/**
 * Only the boundary-condition blanks the open case actually needs (plan §D).
 * Levels shared by several cases stay single-sourced in the simulation record —
 * editing them here updates every case that uses them, and the label says so.
 */
function CaseBoundaryConditions({
  caseId,
  water,
  loading,
  patchWater,
  patchLoading,
  groundLevel,
  missing
}: {
  caseId: BundSimulationCaseId
  water: ReturnType<typeof defaultBundSimulationWaterInputs>
  loading: { kh: number; kv: number; source?: string }
  patchWater: (patch: Partial<typeof water>) => void
  patchLoading: (patch: Partial<typeof loading>) => void
  groundLevel: number | null
  /** Keys the run gate is missing — the empty blanks are highlighted. */
  missing: MissingBcKey[]
}): JSX.Element {
  const fullLabel = 'shared by every seepage case'
  const mark = (key: MissingBcKey): string =>
    missing.includes(key) ? ' is-missing' : ''
  const note = (key: MissingBcKey): JSX.Element | null =>
    missing.includes(key) ? (
      <span className="bund-sim-missing-note">{MISSING_BC_TEXT[key]}</span>
    ) : null
  const reservoirField = (
    <label className={mark('reservoirFull').trim() || undefined}>
      <FieldHelp
        label={`Full reservoir level (m RL) — ${fullLabel}`}
        help="The upstream water-surface elevation when the reservoir is full. Enter an absolute RL, not the water depth above ground. This establishes the initial seepage and pore-pressure field."
      />
      <NumberInput
        value={water.reservoirFull}
        onChange={(v) => patchWater({ reservoirFull: v })}
      />
      {note('reservoirFull')}
    </label>
  )
  switch (caseId) {
    case 'construction':
      return (
        <p className="bund-sim-note">
          No water boundary — the construction case is solved with zero pore
          pressure (undrained total-stress view). Nothing else is required for
          this case.
        </p>
      )
    case 'partial-pool': {
      const full = water.reservoirFull
      const base = groundLevel
      const third = full != null && base != null ? base + (full - base) / 3 : null
      const twoThird = full != null && base != null ? base + ((full - base) * 2) / 3 : null
      const fullBelowGround = full != null && base != null && full <= base
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
          </div>
          <p className="bund-sim-note">
            Two automatic trial pools are solved for this case, rising from the
            ground level — the u/s toe of this section (
            {base != null ? `${base.toFixed(2)} m RL` : 'not recorded'})
            {third != null && twoThird != null
              ? ` — to ${third.toFixed(2)} m and ${twoThird.toFixed(2)} m RL.`
              : ' — enter the full reservoir level to compute them.'}
          </p>
          {fullBelowGround && (
            <p className="bund-sim-missing-note">
              The full reservoir level ({full?.toFixed(2)} m RL) is at or below the
              ground level ({base?.toFixed(2)} m RL) of this section, so no partial
              pool can exist here. Case II applies where the reservoir actually
              stands against this bund — check the level or analyse a section the
              reservoir reaches.
            </p>
          )}
        </>
      )
    }
    case 'drawdown-us':
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
            <label className={mark('minHeadwater').trim() || undefined}>
              <FieldHelp
                label="Minimum head-water after drawdown (m RL)"
                help="The final upstream water-surface elevation immediately after the reservoir falls. It must be below the full reservoir RL. A lower value means a larger loss of stabilising water support."
              />
              <NumberInput
                value={water.minHeadwater}
                onChange={(v) => patchWater({ minHeadwater: v })}
              />
              {note('minHeadwater')}
            </label>
            <label className={mark('tailWaterMax').trim() || undefined}>
              <FieldHelp
                label="Maximum tail-water (m RL) — shared with Case III-B"
                help="The highest downstream water-surface elevation expected against the bund. It supports the downstream slope. Enter absolute RL, not depth: if downstream ground is RL 90 and water is 1 m deep, enter RL 91—not 1."
              />
              <NumberInput
                value={water.tailWaterMax}
                onChange={(v) => patchWater({ tailWaterMax: v })}
              />
              {note('tailWaterMax')}
            </label>
          </div>
          <p className="bund-sim-note">
            The staged solve holds the full-pool pore field, then drops the pool
            to the minimum head-water with the tail still at its maximum.
          </p>
        </>
      )
    case 'drawdown-ds':
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
            <label className={mark('tailWaterMax').trim() || undefined}>
              <FieldHelp
                label="Maximum tail-water (m RL) — shared with Case III-A"
                help="The downstream water-surface elevation before sudden drawdown. It provides stabilising pressure and weight against the downstream face. Enter absolute RL, not water depth."
              />
              <NumberInput
                value={water.tailWaterMax}
                onChange={(v) => patchWater({ tailWaterMax: v })}
              />
              {note('tailWaterMax')}
            </label>
            <label className={mark('tailWaterMin').trim() || undefined}>
              <FieldHelp
                label="Minimum tail-water after drawdown (m RL)"
                help="The final downstream water-surface elevation after a rapid fall. It must be below the maximum tail-water RL. The calculation retains the earlier pore pressure while removing part of the external water support."
              />
              <NumberInput
                value={water.tailWaterMin}
                onChange={(v) => patchWater({ tailWaterMin: v })}
              />
              {note('tailWaterMin')}
            </label>
          </div>
          <p className="bund-sim-note">
            The reservoir stays full; the tail water drops from its maximum to
            its minimum and the d/s slope is re-staged against the lowered
            support.
          </p>
        </>
      )
    case 'steady-seepage':
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
          </div>
          <p className="bund-sim-note">
            The reservoir stands at the full level; the phreatic surface and
            pore-pressure field are solved from this level.
          </p>
        </>
      )
    case 'rainfall':
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
            <label className={mark('rainfallLevel').trim() || undefined}>
              <FieldHelp
                label="Rainfall saturation level on d/s face (m RL)"
                help="The elevation up to which the downstream face is held saturated for the approved sustained-rainfall assumption. This is a water-surface RL, not rainfall depth in millimetres. The colours then show the resulting hydraulic head."
              />
              <NumberInput
                value={water.rainfallLevel}
                onChange={(v) => patchWater({ rainfallLevel: v })}
              />
              {note('rainfallLevel')}
            </label>
          </div>
          <p className="bund-sim-note">
            Enter the saturation level your approved rainfall assumption
            prescribes — it is held on the downstream face and stored with the
            result.
          </p>
        </>
      )
    case 'quake-seepage':
    case 'quake-full':
      return (
        <>
          <div className="bund-param-grid">
            {reservoirField}
            <label className={mark('kh').trim() || undefined}>
              <FieldHelp
                label="Horizontal seismic coefficient kh (×g)"
                help="Pseudo-static horizontal earthquake acceleration divided by gravity. For example, kh = 0.10 represents a horizontal acceleration of 0.10g. Use the value and source required for the project."
              />
              <NumberInput
                value={loading.kh}
                onChange={(v) => patchLoading({ kh: v ?? 0 })}
              />
              {note('kh')}
            </label>
            <label>
              <FieldHelp
                label="Vertical seismic coefficient kv (×g, recorded)"
                help="Vertical earthquake coefficient stored with the run for reporting. The current engine does not apply kv in the stability calculation; it applies kh only."
              />
              <NumberInput
                value={loading.kv}
                onChange={(v) => patchLoading({ kv: v ?? 0 })}
              />
            </label>
            <label>
              <FieldHelp
                label="Coefficient source"
                help="The code clause, seismic-zone reference, departmental instruction or approved report from which kh and kv were adopted."
              />
              <input
                type="text"
                value={loading.source ?? ''}
                onChange={(e) => patchLoading({ source: e.target.value })}
              />
            </label>
          </div>
          <p className="bund-sim-note">
            The horizontal coefficient acts pseudo-statically on every slice;
            kv is recorded with the run but the engine applies kh only.
          </p>
        </>
      )
  }
}

/** Read-only recap of construction geometry imported from the bund template. */
function ImportedGeometrySummary({
  data,
  section
}: {
  data: BundData
  section: BundSection | null
}): JSX.Element {
  const zoned = data.embankmentType === 'zoned'
  const formationBase =
    section?.groundLevel != null ? section.groundLevel - data.design.stripDepth : null
  const trenchDepth = resolvedHeartingTrenchDepth(data)
  const trenchOn = Boolean(
    zoned && data.mode === 'new' && data.heartingTrench?.fillMaterial && trenchDepth > 0
  )
  return (
    <>
      <p className="bund-sim-note">
        New work — the geometry below is imported from the bund template and
        cannot be edited here; only the soil properties are yours to enter.
      </p>
      <dl className="bund-sim-geometry">
        <div>
          <dt>Prepared formation base</dt>
          <dd>{formationBase != null ? `${formationBase.toFixed(2)} m RL` : '—'}</dd>
        </div>
        <div>
          <dt>Topsoil strip</dt>
          <dd>{data.design.stripDepth.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Casing / shell</dt>
          <dd>
            full embankment, faces {data.design.usSlope}:1 u/s and {data.design.dsSlope}:1 d/s
          </dd>
        </div>
        {zoned && (
          <div>
            <dt>Hearting top</dt>
            <dd>
              {data.heartingDesign.topLevel.toFixed(2)} m RL, {data.heartingDesign.topWidth.toFixed(1)} m wide
            </dd>
          </div>
        )}
        <div>
          <dt>Cut-off trench</dt>
          <dd>
            {trenchOn
              ? `enabled, ${trenchDepth.toFixed(2)} m deep (${data.heartingTrench.depthMode === 'auto' ? 'auto' : 'manual'})`
              : 'not included'}
          </dd>
        </div>
      </dl>
    </>
  )
}

function NumberInput({
  value,
  onChange
}: {
  value: number | null
  onChange: (v: number | null) => void
}): JSX.Element {
  return (
    <input
      type="number"
      step="any"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? null : Number(raw))
      }}
    />
  )
}

function notEvaluatedRun(
  job: BundSimulationJob,
  section: BundSection,
  message: string,
  controls: { analysisType: 'lem' | 'fem-ssrm'; method: string; slices?: number },
  groupId?: string
): BundSimulationRun {
  return {
    id: `${Date.now()}-${job.caseId}-ne`,
    createdAt: new Date().toISOString(),
    caseId: job.caseId,
    sectionId: section.id,
    chainage: section.chainage,
    analysisType: controls.analysisType,
    method: controls.method,
    slices: controls.slices ?? 0,
    requiredFs: BUND_SIMULATION_CASES[job.caseId].requiredFs,
    calculatedFs: null,
    status: 'not-evaluated',
    message,
    subcase: job.subcase ?? undefined,
    ...(groupId ? { groupId } : {}),
    treatment: BUND_SIMULATION_CASES[job.caseId].treatment,
    engine: null,
    criticalSurface: null,
    phreaticLine: [],
    geometry: null,
    warnings: [],
    diagnostics: {},
    geometryFingerprint: ''
  }
}

function toRun(
  response: Awaited<ReturnType<typeof window.api.bund.simulate>>,
  job: BundSimulationJob,
  section: BundSection,
  request: NonNullable<ReturnType<typeof buildBundSimulationRequest>>,
  extraWarnings: string[],
  groupId?: string
): BundSimulationRun {
  const requiredFs = BUND_SIMULATION_CASES[job.caseId].requiredFs
  const lemSlices =
    request.controls.analysisType === 'lem' ? request.controls.slices : 0
  if (response.status !== 'ok') {
    return {
      id: request.runId,
      createdAt: new Date().toISOString(),
      caseId: job.caseId,
      sectionId: section.id,
      chainage: section.chainage,
      analysisType: request.controls.analysisType,
      method: request.controls.method,
      slices: lemSlices,
      requiredFs,
      calculatedFs: null,
      status: response.status === 'error' ? 'error' : 'not-evaluated',
      message: response.message,
      subcase: job.subcase ?? undefined,
      ...(groupId ? { groupId } : {}),
      treatment: BUND_SIMULATION_CASES[job.caseId].treatment,
      engine: response.engine ?? null,
      criticalSurface: null,
      phreaticLine: [],
      geometry: request.geometry,
      warnings: [...(response.warnings ?? []), ...extraWarnings],
      diagnostics: response.diagnostics ?? {},
      geometryFingerprint: requestFingerprint(request)
    }
  }
  const fs = response.factorOfSafety
  return {
    id: request.runId,
    createdAt: new Date().toISOString(),
    caseId: job.caseId,
    sectionId: section.id,
    chainage: section.chainage,
    analysisType: response.analysisType,
    method: response.method,
    slices: lemSlices,
    requiredFs,
    calculatedFs: fs,
    status: fs >= requiredFs ? 'pass' : 'fail',
    engine: response.engine,
    subcase: job.subcase ?? undefined,
    ...(groupId ? { groupId } : {}),
    treatment: response.treatment ?? BUND_SIMULATION_CASES[job.caseId].treatment,
    criticalSurface: response.criticalSurface
      ? {
          center: response.criticalSurface.center,
          radius: response.criticalSurface.radius,
          surface: response.criticalSurface.surface
        }
      : null,
    phreaticLine: response.phreaticLine ?? [],
    ...(response.seepField ? { seepField: response.seepField } : {}),
    ...(response.postDrawdownPhreaticLine
      ? { postDrawdownPhreaticLine: response.postDrawdownPhreaticLine }
      : {}),
    ...(response.postDrawdownSeepField
      ? { postDrawdownSeepField: response.postDrawdownSeepField }
      : {}),
    geometry: request.geometry,
    warnings: [...response.warnings, ...extraWarnings],
    diagnostics: response.diagnostics ?? {},
    ...(response.femResult ? { femResult: response.femResult } : {}),
    geometryFingerprint: requestFingerprint(request)
  }
}

/** Compact status chip for the simulation-runs list. */
function RunStatusChip({ run }: { run: BundSimulationRun }): JSX.Element {
  const label =
    run.status === 'pass'
      ? 'TARGET MET'
      : run.status === 'fail'
      ? 'BELOW TARGET'
      : run.status === 'not-evaluated'
      ? 'NOT EVALUATED'
      : run.engine == null
      ? 'UNAVAILABLE'
      : run.status === 'error'
      ? 'FAILED'
      : 'NOT EVALUATED'
  return <span className={`bund-sim-run-status is-${run.status}`}>{label}</span>
}

function ResultCard({
  run,
  currentFingerprint
}: {
  run: BundSimulationRun
  currentFingerprint: string | null
}): JSX.Element {
  const stale =
    currentFingerprint != null &&
    run.geometryFingerprint !== '' &&
    run.geometryFingerprint !== currentFingerprint
  const meta = BUND_SIMULATION_CASES[run.caseId]
  const statusLabel =
    run.status === 'pass'
      ? 'FS TARGET MET'
      : run.status === 'fail'
      ? 'FS BELOW TARGET'
      : run.status === 'not-evaluated'
      ? 'NOT EVALUATED'
      : run.engine == null
      ? 'UNAVAILABLE'
      : run.status === 'error'
      ? 'FAILED'
      : 'NOT EVALUATED'
  const isFem = run.analysisType === 'fem-ssrm'
  const methodLabel = METHOD_LABELS[run.method] ?? run.method.toUpperCase()
  return (
    <article className={`bund-sim-result is-${run.status}`}>
      <header>
        <strong>{meta.label}</strong>
        <span className={`bund-sim-status is-${run.status}`}>
          {statusLabel}{' '}
          <HelpTip
            term={statusLabel}
            text={
              run.status === 'pass'
                ? 'The calculated FS equals or exceeds this case’s displayed minimum target. This does not certify the soil data, boundary conditions or design.'
                : run.status === 'fail'
                ? 'The calculated FS is below this case’s displayed minimum target. Review the governing surface, inputs and design with the responsible engineer.'
                : 'The solver did not produce an FS that can be compared with the case target. Read the message below for the reason.'
            }
          />
        </span>
        {run.subcase && <span className="bund-sim-stale">{run.subcase}</span>}
        <span className="bund-sim-method">{meta.slope}</span>
        {stale && <span className="bund-sim-stale">Out of date — re-run after the geometry change</span>}
      </header>
      {run.calculatedFs != null ? (
        <div className="bund-sim-fs">
          <span className="bund-sim-fs-value">
            FS = {run.calculatedFs.toFixed(3)}{' '}
            <HelpTip
              term="Factor of safety (FS)"
              text="Ratio of available resisting shear strength to the shear demand required for sliding along the reported mechanism. FS = 1.0 is the calculated limiting condition; the design target is higher."
            />
          </span>
          <span className="bund-sim-required">
            required ≥ {run.requiredFs}{' '}
            <HelpTip
              term="Required FS"
              text="Minimum desired factor of safety configured for this IS case. It is the comparison threshold used by the status badge."
            />
          </span>
          <span className="bund-sim-margin">
            margin {(run.calculatedFs - run.requiredFs >= 0 ? '+' : '') +
              (run.calculatedFs - run.requiredFs).toFixed(3)}{' '}
            <HelpTip
              term="FS margin"
              text="Calculated FS minus the required FS. Positive means above the displayed target; negative means below it."
            />
          </span>
          <span className="bund-sim-method">
            {is7894AnalysisMethod(run.method) && (
              <Gem size={12} aria-label="Method described in IS 7894" />
            )}
            {isFem
              ? methodLabel
              : `${methodLabel} · ${run.slices} slices`}{' '}
            · {run.treatment ?? BUND_SIMULATION_CASES[run.caseId].treatment} ·{' '}
            {run.engine?.name} {run.engine?.version}
          </span>
        </div>
      ) : (
        <p className="bund-sim-message">
          {run.message ??
            (run.engine == null && run.status !== 'error'
              ? 'The analysis engine is unavailable on this machine.'
              : 'Not evaluated.')}
        </p>
      )}
      {isFem && run.femResult && (
        <p className="bund-sim-message">
          SSRM bracket {run.femResult.finalInterval
            ? `[${run.femResult.finalInterval[0]}, ${run.femResult.finalInterval[1]}]`
            : '—'}{' '}
          · {run.femResult.failureCriterion} criterion
          {run.femResult.iterations != null ? ` · ${run.femResult.iterations} iterations` : ''}
          {run.femResult.elementCount != null ? ` · ${run.femResult.elementCount} elements` : ''}
          {run.femResult.maxDisplacementM != null
            ? ` · max displacement ${run.femResult.maxDisplacementM.toExponential(2)} m`
            : ''}
        </p>
      )}
      {isFem && <FemDiagram run={run} />}
      {run.seepField &&
        (run.caseId === 'drawdown-us' || run.caseId === 'drawdown-ds' ? (
          <DrawdownSeepageComparison run={run} />
        ) : (
          <SeepDiagram run={run} />
        ))}
      {run.criticalSurface && (
        <SlipDiagram run={run} />
      )}
      <footer className="bund-sim-foot">
        Ch. {run.chainage} m · {new Date(run.createdAt).toLocaleString()}
        {typeof run.diagnostics.runtimeSeconds === 'number'
          ? ` · ${run.diagnostics.runtimeSeconds}s`
          : ''}
        {typeof run.diagnostics.trialSurfacesEvaluated === 'number'
          ? ` · ${run.diagnostics.trialSurfacesEvaluated} trial surfaces`
          : ''}
        {typeof run.diagnostics.ssrmTrials === 'number'
          ? ` · ${run.diagnostics.ssrmTrials} SSRM trials`
          : ''}
      </footer>
      {run.warnings.length > 0 && (
        <ul className="bund-sim-warnings">
          {run.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

/** Native SVG of the analysed section with the critical circle and phreatic line. */
function SlipDiagram({ run }: { run: BundSimulationRun }): JSX.Element | null {
  const surface = run.criticalSurface?.surface ?? []
  if (surface.length < 2) return null
  const embankment = run.geometry?.embankment ?? []
  const ground = run.geometry?.ground ?? []
  const materialPolygons = run.geometry?.materialPolygons ?? []
  const allPts = [
    ...surface,
    ...embankment,
    ...ground,
    ...materialPolygons.flatMap((polygon) => polygon.points)
  ]
  const xs = allPts.map((p) => p[0])
  const ys = allPts.map((p) => p[1])
  let minX = Math.min(...xs) - 4
  let maxX = Math.max(...xs) + 4
  let minY = Math.min(...ys) - 1
  let maxY = Math.max(...ys) + 3
  // The circle can reach outside the surface envelope.
  const center = run.criticalSurface?.center
  const radius = run.criticalSurface?.radius
  if (center && radius) {
    minX = Math.min(minX, center[0] - radius)
    maxX = Math.max(maxX, center[0] + radius)
    minY = Math.min(minY, center[1] - radius)
    maxY = Math.max(maxY, center[1] + radius)
  }
  const W = 640
  const H = 320
  const pad = 24
  const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY))
  const px = (x: number): number => pad + (x - minX) * scale
  const py = (y: number): number => H - pad - (y - minY) * scale
  const pts = (line: [number, number][]): string =>
    line.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')
  return (
    <figure className="bund-sim-figure">
      <div className="bund-sim-figure-title">
        <strong>Critical slip surface</strong>
        <HelpTip
          term="Slip circle"
          text="A mathematical circle used to test rotational sliding. It is not a physical circular crack, tunnel or void. Only the solid arc passing through the soil is the potential sliding surface; the soil mass above that arc may rotate outward."
        />
      </div>
      <svg
        className="bund-sim-diagram"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Bund cross-section showing the calculated critical slip surface"
      >
        <title>Critical slip-surface diagram</title>
        <desc>
          The solid coral arc is the potential sliding surface. The dashed coral circle
          shows the complete mathematical circle used to define that arc.
        </desc>
        {materialPolygons.map((polygon, index) => (
          <polygon
            key={`${polygon.role}-${index}`}
            points={pts(polygon.points)}
            className={`material-zone is-${polygon.role}`}
          />
        ))}
        {ground.length >= 2 && <polyline points={pts(ground)} className="groundline" />}
        {embankment.length >= 2 && materialPolygons.length === 0 && (
          <polygon points={pts([...embankment])} className="embankment" />
        )}
        {embankment.length >= 2 && materialPolygons.length > 0 && (
          <polyline points={pts(embankment)} className="proposed-outline" />
        )}
        {run.phreaticLine.length >= 2 && (
          <polyline points={pts(run.phreaticLine)} className="phreatic" />
        )}
        {center && radius && (
          <circle cx={px(center[0])} cy={py(center[1])} r={radius * scale} className="slip" />
        )}
        <polyline points={pts(surface)} className="slipsurface" />
        <text x={pad} y={H - 6} className="axis-label">
          metres · RL
        </text>
      </svg>
      <figcaption className="bund-sim-figure-legend">
        <span>
          <i className="bund-sim-key-line is-slip-surface" aria-hidden="true" />
          Solid coral: critical sliding arc used for FS
        </span>
        {center && radius && (
          <span>
            <i className="bund-sim-key-line is-slip-circle" aria-hidden="true" />
            Dashed coral: complete mathematical trial circle
          </span>
        )}
        {run.phreaticLine.length >= 2 && (
          <span>
            <i className="bund-sim-key-line is-phreatic" aria-hidden="true" />
            Dashed blue: phreatic line (zero pore pressure)
          </span>
        )}
        <span>
          <i className="bund-sim-key-box is-material" aria-hidden="true" />
          Shaded zones: modelled soil materials
        </span>
      </figcaption>
      <p className="bund-sim-figure-note">
        The reported FS belongs to the solid critical arc. The remainder of the dashed
        circle is shown only to explain the circle geometry and is not a crack through air
        or foundation.
      </p>
    </figure>
  )
}

/** Yellow→red ramp in the spirit of XSLOPE's FEM contour figures. */
const FEM_RAMP: { t: number; c: [number, number, number] }[] = [
  { t: 0.0, c: [255, 255, 204] },
  { t: 0.25, c: [254, 217, 118] },
  { t: 0.5, c: [254, 178, 76] },
  { t: 0.75, c: [240, 59, 32] },
  { t: 1.0, c: [189, 0, 38] }
]

/** Matplotlib's Spectral reversed — the colormap XSLOPE fills head contours with. */
const SPECTRAL_R: [number, number, number][] = [
  [94, 79, 162],
  [50, 136, 189],
  [102, 194, 165],
  [230, 245, 152],
  [254, 224, 139],
  [253, 174, 97],
  [244, 109, 67],
  [213, 62, 79],
  [158, 1, 66]
]

function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t))
  const stops = FEM_RAMP
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i].t && x <= stops[i + 1].t) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi.t - lo.t || 1
  const f = (x - lo.t) / span
  const rgb = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * f))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

function spectralRampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t))
  const span = 1 / (SPECTRAL_R.length - 1)
  const idx = Math.min(SPECTRAL_R.length - 2, Math.floor(x / span))
  const f = (x - idx * span) / span
  const lo = SPECTRAL_R[idx]
  const hi = SPECTRAL_R[idx + 1]
  const rgb = lo.map((v, i) => Math.round(v + (hi[i] - v) * f))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

/**
 * Native FEM result figure for the SSRM analysis, drawn after XSLOPE's own
 * strength-reduction output: the mesh contoured by viscoplastic shear strain
 * (displacement where no strain field shipped), with the failure mechanism
 * visible as the hot band and an exaggerated deformed surface outline.
 */
function FemDiagram({ run }: { run: BundSimulationRun }): JSX.Element | null {
  const field = run.femResult?.field
  if (!field || field.nodes.length < 3 || field.triangles.length < 1) return null
  const nodes = field.nodes

  // Per-triangle contour value: shear strain when present, else the mean nodal
  // displacement magnitude. The top of the scale sits at the 98th percentile so
  // one hot cell cannot wash the rest of the picture out.
  let values: number[] | null = null
  let unitLabel = 'shear strain'
  if (field.shearStrain && field.shearStrain.length === field.triangles.length) {
    values = field.shearStrain
  } else if (field.dispMag && field.dispMag.length === nodes.length) {
    values = field.triangles.map(([a, b, c]) => {
      const trio = [field.dispMag![a], field.dispMag![b], field.dispMag![c]]
      return (trio[0] + trio[1] + trio[2]) / 3
    })
    unitLabel = '|u| (m)'
  }
  let vmin = 0
  let vmax = 0
  if (values) {
    const sorted = [...values].sort((a, b) => a - b)
    vmax = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] ?? 0
    vmin = sorted[0] ?? 0
    if (vmax - vmin < 1e-15) vmax = vmin + 1e-15
  }

  const xs = nodes.map((p) => p[0])
  const ys = nodes.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const W = 640
  const H = 320
  const pad = 24
  const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY))
  const px = (x: number): number => pad + (x - minX) * scale
  const py = (y: number): number => H - pad - (y - minY) * scale

  const deformScale = field.deformScale ?? 1
  const hasComponents =
    !!field.dispX && !!field.dispY && field.dispX.length === nodes.length && field.dispY.length === nodes.length

  /**
   * Deformed outline: the section's own boundary lines (embankment + ground)
   * displaced by the nodal displacement field, inverse-distance interpolated
   * at each boundary point. Drawing mesh-node silhouettes instead made the
   * line zigzag with mesh irregularity.
   */
  let deformedLines: string[] = []
  if (hasComponents && deformScale > 1) {
    const dx = field.dispX!
    const dy = field.dispY!
    const displaced = (point: [number, number]): [number, number] => {
      // 4 nearest nodes, inverse-distance squared weighting.
      let wx = 0
      let wy = 0
      let wsum = 0
      const best: { i: number; d2: number }[] = []
      for (let i = 0; i < nodes.length; i++) {
        const ddx = nodes[i][0] - point[0]
        const ddy = nodes[i][1] - point[1]
        const d2 = ddx * ddx + ddy * ddy
        if (best.length < 4) {
          best.push({ i, d2 })
          best.sort((a, b) => a.d2 - b.d2)
        } else if (d2 < best[3].d2) {
          best[3] = { i, d2 }
          best.sort((a, b) => a.d2 - b.d2)
        }
      }
      for (const { i, d2 } of best) {
        const w = 1 / (d2 + 1e-9)
        wx += w * dx[i]
        wy += w * dy[i]
        wsum += w
      }
      if (wsum <= 0) return point
      return [
        point[0] + (wx / wsum) * deformScale,
        point[1] + (wy / wsum) * deformScale
      ]
    }
    for (const line of [run.geometry?.embankment ?? [], run.geometry?.ground ?? []]) {
      if (line.length >= 2) {
        deformedLines.push(
          line
            .map((p) => {
              const [x, y] = displaced(p)
              return `${px(x).toFixed(1)},${py(y).toFixed(1)}`
            })
            .join(' ')
        )
      }
    }
  }

  return (
    <figure className="bund-sim-figure bund-sim-fem">
      <div className="bund-sim-figure-title">
        <strong>FEM strength-reduction mechanism</strong>
        <HelpTip
          term="FEM coloured graph"
          text="The mesh colour shows where computed shear strain—or displacement when strain is unavailable—concentrates as strength is reduced toward failure. Warmer colours mean a higher value on this plot, not automatic code failure by themselves."
        />
      </div>
      <svg
        className="bund-sim-diagram"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Finite-element strength-reduction contour and exaggerated deformed outline"
      >
        <title>Finite-element strength-reduction result</title>
        <desc>
          Yellow to red colours show increasing shear strain or displacement. The blue
          deformed outline is exaggerated by the scale printed at the bottom.
        </desc>
        {(run.geometry?.materialPolygons ?? []).map((polygon, index) => (
          <polygon
            key={`${polygon.role}-${index}`}
            points={polygon.points
              .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
              .join(' ')}
            className={`material-zone is-${polygon.role}`}
          />
        ))}
        {field.triangles.map((tri, index) => {
          const [a, b, c] = tri
          const pointsStr = `${px(nodes[a][0]).toFixed(1)},${py(nodes[a][1]).toFixed(1)} ${px(
            nodes[b][0]
          ).toFixed(1)},${py(nodes[b][1]).toFixed(1)} ${px(nodes[c][0]).toFixed(1)},${py(
            nodes[c][1]
          ).toFixed(1)}`
          const fill = values ? rampColor(((values[index] ?? vmin) - vmin) / (vmax - vmin)) : 'none'
          return (
            <polygon
              key={index}
              points={pointsStr}
              fill={fill}
              stroke={values ? fill : 'rgba(210,214,220,0.35)'}
              strokeWidth={values ? 0.3 : 0.4}
            />
          )
        })}
        {deformedLines.map((line, i) => (
          <polyline key={i} points={line} className="bund-sim-fem-deformed" />
        ))}
        {run.phreaticLine.length >= 2 && (
          <polyline
            points={run.phreaticLine
              .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
              .join(' ')}
            className="phreatic"
          />
        )}
        <text x={pad} y={H - 6} className="axis-label">
          metres · RL · deformed outline ×{deformScale.toFixed(0)}
        </text>
      </svg>
      {values && (
        <figcaption className="bund-sim-fem-legend">
          <span>lower {unitLabel}</span>
          <span className="bund-sim-fem-ramp" />
          <span>
            higher {unitLabel} · {vmin.toExponential(1)} – {vmax.toExponential(1)}
          </span>
        </figcaption>
      )}
      <div className="bund-sim-figure-legend">
        <span>
          <i className="bund-sim-key-line is-deformed" aria-hidden="true" />
          Blue outline: calculated deformation, magnified ×{deformScale.toFixed(0)}
        </span>
        {run.phreaticLine.length >= 2 && (
          <span>
            <i className="bund-sim-key-line is-phreatic" aria-hidden="true" />
            Dashed blue: phreatic line
          </span>
        )}
      </div>
      <p className="bund-sim-figure-note">
        Read the hot-colour band as the likely failure mechanism. The deformation outline
        is deliberately enlarged for visibility and must not be read as the true movement
        at drawing scale.
      </p>
    </figure>
  )
}

/**
 * Steady-seepage figure drawn the way XSLOPE draws its seepage solutions: the
 * mesh filled by total-head contour bands (Spectral_r), with the phreatic
 * (p = 0) line overlaid. The phreatic line arrives from the bridge as a true
 * interpolated zero-pressure contour, not a stepped node polyline.
 */
interface SeepDiagramProps {
  run: BundSimulationRun
  field?: BundSeepField
  phreaticLine?: [number, number][]
  title?: string
  stageDescription?: string
  headRange?: [number, number]
  showExplanation?: boolean
}

/**
 * Cases III-A and III-B use two seepage solutions in the staged FS procedure.
 * Showing both prevents their common full-pool starting field from making the
 * two cases appear identical, while the shared colour scale keeps the visual
 * comparison numerically meaningful.
 */
function DrawdownSeepageComparison({ run }: { run: BundSimulationRun }): JSX.Element {
  const before = run.seepField as BundSeepField
  const after = run.postDrawdownSeepField
  const allHead = after ? [...before.head, ...after.head] : before.head
  const sharedRange: [number, number] | undefined = after
    ? [Math.min(...allHead), Math.max(...allHead)]
    : undefined
  const isUpstream = run.caseId === 'drawdown-us'

  return (
    <section className="bund-sim-drawdown" aria-label="Rapid-drawdown seepage stages">
      <div className="bund-sim-figure-title">
        <strong>Rapid-drawdown seepage stages</strong>
        <HelpTip
          term="Why two seepage graphs?"
          text="The staged Case III factor of safety uses a pre-drawdown pore-pressure field and a second field with the post-drawdown water boundaries. Showing both makes the changed boundary condition visible."
        />
      </div>
      <p className="bund-sim-drawdown-treatment">
        {run.treatment ?? BUND_SIMULATION_CASES[run.caseId].treatment}
        {after ? ' · both diagrams use one shared head-colour scale' : ''}
      </p>
      <div className={`bund-sim-drawdown-grid${after ? '' : ' is-single'}`}>
        <SeepDiagram
          run={run}
          field={before}
          phreaticLine={run.phreaticLine}
          title="Stage 1 — Before drawdown"
          stageDescription="Full reservoir and maximum tail-water boundaries."
          headRange={sharedRange}
          showExplanation={false}
        />
        {after && (
          <SeepDiagram
            run={run}
            field={after}
            phreaticLine={run.postDrawdownPhreaticLine ?? []}
            title="Stage 2 — After drawdown"
            stageDescription={
              isUpstream
                ? 'Upstream pool lowered; maximum tail-water retained.'
                : 'Tail-water lowered; full reservoir retained.'
            }
            headRange={sharedRange}
            showExplanation={false}
          />
        )}
      </div>
      {!after && (
        <p className="bund-sim-figure-note is-warning">
          This saved run predates post-drawdown visualization. Its stored FS is unchanged;
          rerun this case to inspect the Stage 2 field used by the solver.
        </p>
      )}
      <p className="bund-sim-figure-note">
        Both fields feed the staged FS calculation. Stage 2 is the seepage solution for the
        post-drawdown boundary levels; it is not a time-history or transient seepage simulation.
        The dashed line is the phreatic line (pore pressure = 0), and the colours show total
        hydraulic head—not safety or danger.
      </p>
    </section>
  )
}

function SeepDiagram({
  run,
  field = run.seepField,
  phreaticLine = run.phreaticLine,
  title = 'Seepage total-head field',
  stageDescription,
  headRange,
  showExplanation = true
}: SeepDiagramProps): JSX.Element | null {
  if (!field || field.nodes.length < 3 || field.triangles.length < 1) return null
  const nodes = field.nodes
  const head = field.head

  let vmin = headRange?.[0] ?? Math.min(...head)
  let vmax = headRange?.[1] ?? Math.max(...head)
  if (vmax - vmin < 1e-9) vmax = vmin + 1e-9

  const xs = nodes.map((p) => p[0])
  const ys = nodes.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const W = 640
  const H = 320
  const pad = 24
  const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY))
  const px = (x: number): number => pad + (x - minX) * scale
  const py = (y: number): number => H - pad - (y - minY) * scale
  const nd = (i: number): string =>
    `${px(nodes[i][0]).toFixed(1)},${py(nodes[i][1]).toFixed(1)}`

  return (
    <figure className="bund-sim-figure bund-sim-fem">
      <div className="bund-sim-figure-title">
        <strong>{title}</strong>
        <HelpTip
          term="Seepage coloured graph"
          text="Each coloured triangle is part of the finite-element seepage mesh. Colour represents total hydraulic head: elevation head plus pressure head, in metres. Purple/blue is lower head and yellow/red is higher head. It is not a safety or danger colour scale."
        />
      </div>
      {stageDescription && <p className="bund-sim-seep-stage">{stageDescription}</p>}
      <svg
        className="bund-sim-diagram"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Seepage mesh coloured by total hydraulic head with a dashed phreatic line"
      >
        <title>Seepage total-head contours</title>
        <desc>
          Purple and blue areas have lower total hydraulic head; yellow and red areas have
          higher head. The dashed blue curve is the phreatic line where pore-water pressure
          is zero.
        </desc>
        {field.triangles.map((tri, index) => {
          const [a, b, c] = tri
          // Mean head per triangle — discrete contour bands, no interpolation needed.
          const meanHead = (head[a] + head[b] + head[c]) / 3
          const fill = spectralRampColor((meanHead - vmin) / (vmax - vmin))
          return (
            <polygon
              key={index}
              points={`${nd(a)} ${nd(b)} ${nd(c)}`}
              fill={fill}
              stroke={fill}
              strokeWidth={0.3}
            />
          )
        })}
        {(run.geometry?.materialPolygons ?? []).map((polygon, index) => (
          <polyline
            key={`z-${index}`}
            points={polygon.points
              .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
              .join(' ')}
            className="bund-sim-seep-zone"
          />
        ))}
        {phreaticLine.length >= 2 && (
          <polyline
            points={phreaticLine
              .map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`)
              .join(' ')}
            className="bund-sim-seep-phreatic"
          />
        )}
        <text x={pad} y={H - 6} className="axis-label">
          metres · RL · total head contours · blue dashed = phreatic line (p = 0)
        </text>
      </svg>
      <figcaption className="bund-sim-fem-legend">
        <span>lower head · {vmin.toFixed(2)} m</span>
        <span className="bund-sim-fem-ramp bund-sim-seep-ramp" />
        <span>higher head · {vmax.toFixed(2)} m</span>
      </figcaption>
      <div className="bund-sim-figure-legend">
        <span>
          <i className="bund-sim-key-line is-seep-phreatic" aria-hidden="true" />
          Dashed dark blue: phreatic line, pore pressure = 0
        </span>
        <span>
          <i className="bund-sim-key-line is-zone" aria-hidden="true" />
          Thin dark outlines: boundaries between soil-material zones
        </span>
      </div>
      {showExplanation && (
        <p className="bund-sim-figure-note">
          Below the phreatic line the model generally has positive pore-water pressure;
          above it the soil is generally unsaturated or at atmospheric pressure. Closely
          changing colours indicate a stronger hydraulic gradient, not automatically an
          unsafe slope.
        </p>
      )}
    </figure>
  )
}
