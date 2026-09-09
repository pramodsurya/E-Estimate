import { useMemo, useState } from 'react'
import { History, Mountain, Pencil, Settings2 } from 'lucide-react'
import { useStore } from '../../../store/useStore'
import { findNode } from '../../../lib/tree'
import type {
  BundData,
  BundDesign,
  BundHomogeneousSoilType,
  ProjectNode
} from '../../../types/project'
import {
  formationRows,
  migrateBundData,
  orderedSections,
  rowsTotal,
  topLevelFromFreeBoard
} from '../../../lib/bund'
import {
  applySoilPreset,
  recommendedHomogeneousSlopes
} from '../../../lib/bundSoilPresets'
import BundChapterNavigator, {
  type BundChapterDefinition
} from './BundChapterNavigator'
import ProposedBundDesign from './chapters/ProposedBundDesign'
import EmbankmentMaterialGeometry from './chapters/EmbankmentMaterialGeometry'
import CasingHeartingMaterialGeometry from './chapters/CasingHeartingMaterialGeometry'
import CrossSectionsBermDesign from './chapters/CrossSectionsBermDesign'
import FoundationExcavationClearance from './chapters/FoundationExcavationClearance'
import CutOffTrenchChapter from './chapters/CutOffTrenchChapter'
import OptionalProtectionDrainage from './chapters/OptionalProtectionDrainage'
import BundDashboard from '../BundDashboard'
import './bundDashboardV2.css'

/**
 * Dynamically provisions the exact chapter workflow based on the 4 possible
 * bund combinations:
 * 1. Homogeneous + New  (10 chapters)
 * 2. Homogeneous + Repair (9 chapters, filters omitted)
 * 3. Zoned + New (Casing/Hearting and Cut-off Trench)
 * 4. Zoned + Repair (Casing/Hearting; cut-off trench is new-zoned only)
 */
export function getBundV2Chapters(
  embankmentType: 'homogeneous' | 'zoned',
  mode: 'new' | 'restoration'
): BundChapterDefinition[] {
  const isZoned = embankmentType === 'zoned'
  const isRepair = mode === 'restoration'

  if (isZoned) {
    const list: BundChapterDefinition[] = [
      {
        id: 'proposed-bund-design',
        number: 1,
        title: isRepair ? 'Repair Bund Design' : 'Proposed Bund Design',
        shortTitle: isRepair ? 'Repair Levels' : 'Design Levels',
        category: 'embankment',
        status: 'current'
      },
      {
        id: 'casing-hearting-slopes',
        number: 2,
        title: 'Casing & Hearting Slopes',
        shortTitle: 'Casing & Hearting',
        category: 'embankment',
        status: 'current'
      },
      {
        id: 'cross-sections-berm-design',
        number: 3,
        title: 'Crossections',
        shortTitle: 'Crossections',
        category: 'embankment',
        status: 'current'
      },
      {
        id: 'foundation-stripping',
        number: 4,
        title: 'Excavation/Stripping',
        shortTitle: 'Excavation/Stripping',
        category: 'foundation',
        status: 'current'
      },
      ...(isRepair
        ? []
        : [
            {
              id: 'cut-off-trench',
              number: 5,
              title: 'COT (Cut-off Trench)',
              shortTitle: 'COT (Cut-off Trench)',
              category: 'foundation' as const,
              status: 'current' as const
            }
          ]),
      {
        id: 'slopes-protection',
        number: 6,
        title: 'Slope Protection',
        shortTitle: 'Slope Protection',
        category: 'protection',
        status: 'current'
      },
      {
        id: 'upstream-toe-wall-anchorage',
        number: 7,
        title: 'U/S Toe Wall',
        shortTitle: 'U/S Toe Wall',
        category: 'protection',
        status: 'current'
      },
      {
        id: 'rock-toe',
        number: 8,
        title: 'D/S Rock Toe',
        shortTitle: 'D/S Rock Toe',
        category: 'protection',
        status: 'current'
      },
      ...(isRepair
        ? []
        : [
            {
              id: 'filters',
              number: 9,
              title: 'Sand Filters',
              shortTitle: 'Sand Filters',
              category: 'protection' as const,
              status: 'current' as const
            }
          ]),
      {
        id: 'downstream-toe-drain',
        number: isRepair ? 9 : 10,
        title: 'D/S Toe Drain',
        shortTitle: 'D/S Toe Drain',
        category: 'protection',
        status: 'current'
      },
      {
        id: 'chute-drains',
        number: 0,
        title: 'D/S Chute Drains',
        shortTitle: 'Chute Drains',
        category: 'protection',
        status: 'current'
      },
    ]
    return list.map((c, i) => ({ ...c, number: i + 1 }))
  }

  // Homogeneous bund (New: 10 chapters, Repair: 9 chapters)
  const list: BundChapterDefinition[] = [
    {
      id: 'proposed-bund-design',
      number: 1,
      title: isRepair ? 'Repair Bund Design' : 'Proposed Bund Design',
      shortTitle: isRepair ? 'Repair Levels' : 'Design Levels',
      category: 'embankment',
      status: 'current'
    },
    {
      id: 'embankment-material-geometry',
      number: 2,
      title: 'Slopes',
      shortTitle: 'Slopes',
      category: 'embankment',
      status: 'current'
    },
    {
      id: 'cross-sections-berm-design',
      number: 3,
      title: 'Crossections',
      shortTitle: 'Crossections',
      category: 'embankment',
      status: 'current'
    },
    {
      id: 'foundation-excavation-clearance',
      number: 4,
      title: 'Excavation/Stripping',
      shortTitle: 'Excavation/Stripping',
      category: 'foundation',
      status: 'current'
    },
    {
      id: 'slopes-protection',
      number: 5,
      title: 'Slope Protection',
      shortTitle: 'Slope Protection',
      category: 'protection',
      status: 'current'
    },
    {
      id: 'upstream-toe-wall-anchorage',
      number: 6,
      title: 'U/S Toe Wall',
      shortTitle: 'U/S Toe Wall',
      category: 'protection',
      status: 'current'
    },
    {
      id: 'rock-toe',
      number: 7,
      title: 'D/S Rock Toe',
      shortTitle: 'D/S Rock Toe',
      category: 'protection',
      status: 'current'
    },
    ...(isRepair
      ? []
      : [
          {
            id: 'filters',
            number: 8,
            title: 'Sand Filters',
            shortTitle: 'Sand Filters',
            category: 'protection' as const,
            status: 'current' as const
          }
        ]),
    {
      id: 'downstream-toe-drain',
      number: isRepair ? 8 : 9,
      title: 'D/S Toe Drain',
      shortTitle: 'D/S Toe Drain',
      category: 'protection',
      status: 'current'
    },
    {
      id: 'chute-drains',
      number: 0,
      title: 'D/S Chute Drains',
      shortTitle: 'Chute Drains',
      category: 'protection',
      status: 'current'
    },
  ]
  return list.map((c, i) => ({ ...c, number: i + 1 }))
}

export default function BundDashboardV2({
  node,
  data,
  onEditSetup
}: {
  node: ProjectNode
  data: BundData
  onEditSetup: (step: 1 | 2) => void
}): JSX.Element {
  const [activeChapter, setActiveChapter] = useState<string>('proposed-bund-design')

  const isZoned = data.embankmentType === 'zoned'
  const isRepair = data.mode === 'restoration'
  const variant = isRepair ? 'repair' : 'new'

  // Dynamic chapter list based on the chosen combination
  const chapters = useMemo(
    () => getBundV2Chapters(data.embankmentType ?? 'homogeneous', data.mode ?? 'new'),
    [data.embankmentType, data.mode]
  )

  const sections = useMemo(() => orderedSections(data), [data])
  const totalEarthwork = useMemo(() => rowsTotal(formationRows(data)), [data])

  const variantBadgeText = useMemo(() => {
    if (isZoned) {
      return isRepair ? 'Zoned bund repair' : 'New zoned bund'
    }
    return isRepair ? 'Homogeneous bund repair' : 'New homogeneous bund'
  }, [isZoned, isRepair])

  // State update dispatchers
  const commitBundUpdate = (update: (current: BundData) => BundData): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.bund) return
    const current = migrateBundData(currentNode.bund)
    state.setBund(node.id, update(current))
  }

  const commitDesign = (patch: Partial<BundDesign>): void => {
    commitBundUpdate((current) => {
      const nextDesign = { ...current.design, ...patch }
      const derivedTop = topLevelFromFreeBoard(nextDesign)
      const finalizedDesign =
        derivedTop != null ? { ...nextDesign, topLevel: derivedTop } : nextDesign

      if (isZoned) {
        // Follow MWL for hearting top level if applicable
        const heartingFollowsMwl =
          current.heartingDesign.topLevel === (current.design.mwl ?? current.design.topLevel)
        const nextHearting =
          heartingFollowsMwl && finalizedDesign.mwl != null
            ? { ...current.heartingDesign, topLevel: finalizedDesign.mwl }
            : current.heartingDesign

        return {
          ...current,
          design: finalizedDesign,
          heartingDesign: nextHearting
        }
      }

      return {
        ...current,
        design: finalizedDesign
      }
    })
  }

  // Homogeneous-specific soil selection handlers
  const selectHomogeneousSoil = (soil: BundHomogeneousSoilType): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.bund) return
    const current = migrateBundData(currentNode.bund)
    const recommendation = recommendedHomogeneousSlopes(soil)
    const simulation = current.simulation
    state.setBund(node.id, {
      ...current,
      homogeneousSoilType: soil,
      homogeneousSlopeMode: recommendation ? 'automatic' : 'manual',
      ...(recommendation
        ? {
            design: {
              ...current.design,
              usSlope: recommendation.upstream,
              dsSlope: recommendation.downstream
            }
          }
        : {}),
      ...(simulation
        ? {
            simulation: {
              ...simulation,
              materials: simulation.materials.map((material) =>
                material.role === 'embankment'
                  ? applySoilPreset(material, soil, 'embankment')
                  : material
              )
            }
          }
        : {})
    })
  }

  const commitManualGeometry = (patch: Partial<BundDesign>): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.bund) return
    const current = migrateBundData(currentNode.bund)
    state.setBund(node.id, {
      ...current,
      homogeneousSlopeMode:
        patch.usSlope !== undefined || patch.dsSlope !== undefined
          ? 'manual'
          : current.homogeneousSlopeMode,
      design: { ...current.design, ...patch }
    })
  }

  const reapplyHomogeneousRecommendation = (): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.bund) return
    const current = migrateBundData(currentNode.bund)
    const soil = current.homogeneousSoilType
    if (!soil) return
    const recommendation = recommendedHomogeneousSlopes(soil)
    if (!recommendation) return
    state.setBund(node.id, {
      ...current,
      homogeneousSlopeMode: 'automatic',
      design: {
        ...current.design,
        usSlope: recommendation.upstream,
        dsSlope: recommendation.downstream
      }
    })
  }

  return (
    <div className="bund-v2-dashboard">
      <header className="bund-v2-toolbar">
        <div className="bund-v2-identity">
          <span className="bund-v2-template-label">
            <Mountain size={15} /> {node.name}
          </span>
          <div className="bund-v2-badges">
            <span>{variantBadgeText}</span>
            <span>{Math.round(data.lengthM).toLocaleString('en-IN')} m long</span>
            <span>{sections.length} cross-sections</span>
            {isZoned && (
              <span>{Math.round(totalEarthwork).toLocaleString('en-IN')} cu.m formation</span>
            )}
          </div>
        </div>

        <div className="bund-v2-setup-actions">
          <button
            type="button"
            className={`btn ghost${activeChapter === 'old-bund-dashboard' ? ' active is-reference' : ''}`}
            onClick={() =>
              setActiveChapter((prev) =>
                prev === 'old-bund-dashboard' ? 'proposed-bund-design' : 'old-bund-dashboard'
              )
            }
            title="Toggle classic reference dashboard"
          >
            <History size={14} /> {activeChapter === 'old-bund-dashboard' ? 'Exit classic view' : 'Classic view'}
          </button>
          <button type="button" className="btn ghost" onClick={() => onEditSetup(1)}>
            <Settings2 size={14} /> Edit setup
          </button>
          <button type="button" className="btn ghost" onClick={() => onEditSetup(2)}>
            <Pencil size={14} /> Edit sections
          </button>
        </div>
      </header>

      <BundChapterNavigator
        chapters={chapters}
        activeId={activeChapter}
        onSelect={setActiveChapter}
      />

      <main className="bund-v2-content">
        {activeChapter === 'old-bund-dashboard' && (
          <div className="bund-v2-reference-dashboard">
            <div className="bund-v2-reference-note" role="note">
              <span>
                Viewing classic reference dashboard. Compare inputs and quantities with the modern workflow.
              </span>
              <button
                type="button"
                className="btn small primary"
                onClick={() => setActiveChapter('proposed-bund-design')}
                style={{ marginLeft: '12px' }}
              >
                Return to design workflow
              </button>
            </div>
            <BundDashboard
              node={node}
              data={data}
              onEditSetup={onEditSetup}
              template={isZoned ? 'zoned' : 'homogeneous'}
            />
          </div>
        )}

        {/* Chapter 1: Proposed Bund Design */}
        {activeChapter === 'proposed-bund-design' && (
          <ProposedBundDesign
            design={data.design}
            onCommit={commitDesign}
            mode={variant}
          />
        )}

        {/* Chapter 2: Embankment Material & Slopes (Homogeneous vs Zoned) */}
        {activeChapter === 'embankment-material-geometry' && !isZoned && (
          <EmbankmentMaterialGeometry
            soilType={data.homogeneousSoilType}
            data={data}
            design={data.design}
            slopeMode={data.homogeneousSlopeMode ?? 'manual'}
            onSelectSoil={selectHomogeneousSoil}
            onCommitDesign={commitManualGeometry}
            onReapplyRecommendation={reapplyHomogeneousRecommendation}
            onCommitBund={commitBundUpdate}
          />
        )}
        {activeChapter === 'casing-hearting-slopes' && isZoned && (
          <CasingHeartingMaterialGeometry
            data={data}
            onCommitBund={commitBundUpdate}
          />
        )}

        {/* Chapter 3: Cross-Sections & Berm Design */}
        {activeChapter === 'cross-sections-berm-design' && (
          <CrossSectionsBermDesign
            data={data}
            onCommit={commitBundUpdate}
          />
        )}

        {/* Chapter 4: Foundation Excavation & Clearance / Stripping */}
        {(activeChapter === 'foundation-excavation-clearance' ||
          activeChapter === 'foundation-stripping') && (
          <FoundationExcavationClearance
            data={data}
            onCommit={commitBundUpdate}
          />
        )}

        {/* Chapter 5 (Zoned): Cut-Off Trench (COT) */}
        {activeChapter === 'cut-off-trench' && isZoned && (
          <CutOffTrenchChapter
            data={data}
            onCommitBund={commitBundUpdate}
          />
        )}

        {/* Optional Protection & Drainage Chapters (IS:12169 Standards) */}
        {activeChapter === 'slopes-protection' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={5}
          />
        )}
        {activeChapter === 'upstream-toe-wall-anchorage' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={6}
          />
        )}
        {activeChapter === 'rock-toe' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={7}
          />
        )}
        {!isRepair && activeChapter === 'filters' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={8}
          />
        )}
        {activeChapter === 'downstream-toe-drain' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={9}
          />
        )}
        {activeChapter === 'chute-drains' && (
          <OptionalProtectionDrainage
            nodeId={node.id}
            data={data}
            onCommit={commitBundUpdate}
            chapter={10}
          />
        )}

      </main>
    </div>
  )
}
