import { useEffect, useMemo, useState } from 'react'
import { Pencil, Settings2, Waves } from 'lucide-react'
import { useStore } from '../../../store/useStore'
import { findNode } from '../../../lib/tree'
import type { CanalData, CanalDesign, ProjectNode } from '../../../types/project'
import { migrateCanalData, canalDesignProfile, canalFlowLabel, canalGroundProfileBetweenToes, canalShowsFoundationFilling, orderedCanalSections } from '../../../lib/canal'
import CanalDesignLevels from './chapters/CanalDesignLevels'
import CanalCrossSections from './chapters/CanalCrossSections'
import CanalBankDesign from './chapters/CanalBankDesign'
import CanalEarthwork from './chapters/CanalEarthwork'
import CanalJungleLa from './chapters/CanalJungleLa'
import CanalFoundationFilling from './chapters/CanalFoundationFilling'
import CanalFiltersDrains from './chapters/CanalFiltersDrains'
import CanalLining from './chapters/CanalLining'
import CanalRoadsAccess from './chapters/CanalRoadsAccess'
import './canalDashboardV2.css'

export interface CanalChapterDefinition {
  id: string
  number: number
  title: string
  shortTitle: string
}

function getCanalChapters(mode: CanalData['mode'], showFoundationFilling: boolean): CanalChapterDefinition[] {
  const chapters: CanalChapterDefinition[] = [
    { id: 'design-levels', number: 1, title: 'Design Levels', shortTitle: 'Design' },
    { id: 'bank-design', number: 2, title: 'Bank Design', shortTitle: 'Bank Design' },
    { id: 'cross-sections', number: 3, title: 'Cross-Sections', shortTitle: 'Sections' },
    { id: 'earthwork', number: 4, title: 'Earthwork', shortTitle: 'Earthwork' }
  ]
  chapters.push({
    id: 'jungle-la',
    number: chapters.length + 1,
    title: mode === 'new' ? 'Jungle Cutting & LA' : 'Jungle Cutting',
    shortTitle: mode === 'new' ? 'Jungle & LA' : 'Jungle'
  })
  if (showFoundationFilling) chapters.push({ id: 'foundation-filling', number: chapters.length + 1, title: 'Foundation Filling & Filters', shortTitle: 'Foundation & Filters' })
  chapters.push(
    { id: 'filters-drains', number: chapters.length + 1, title: 'Rock Toe & Drainage', shortTitle: 'Rock Toe & Drainage' },
    { id: 'lining', number: chapters.length + 2, title: 'Lining', shortTitle: 'Lining' },
    { id: 'roads-access', number: chapters.length + 3, title: 'Roads & Access', shortTitle: 'Roads & Access' }
  )
  return chapters
}

export default function CanalDashboardV2({
  node,
  data,
  onEditSetup
}: {
  node: ProjectNode
  data: CanalData
  onEditSetup: (step: 1 | 2) => void
}): JSX.Element {
  const [activeChapter, setActiveChapter] = useState<string>('design-levels')
  const showFoundationFilling = useMemo(() => canalShowsFoundationFilling(data), [data])
  const chapters = useMemo(() => getCanalChapters(data.mode, showFoundationFilling), [data.mode, showFoundationFilling])
  const sections = useMemo(() => orderedCanalSections(data), [data])
  useEffect(() => { if (!chapters.some((chapter) => chapter.id === activeChapter)) setActiveChapter('earthwork') }, [activeChapter, chapters])

  const commitDesign = (patch: Partial<CanalDesign>): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.canal) return
    const current = migrateCanalData(currentNode.canal)
    const next: CanalData = { ...current, design: { ...current.design, ...patch } }
    // Quick-entry sections store surveyed toe RLs. Re-resolve their ground
    // extents whenever design geometry changes so the section and earthwork
    // diagrams update without requiring another Populate Design click.
    next.sections = next.sections.map((section) => {
      const left = section.leftToeRl
      const right = section.rightToeRl
      if (section.designPopulated === false || !Number.isFinite(left) || !Number.isFinite(right)) return section
      const refreshed = { ...section, ground: canalGroundProfileBetweenToes(next, section, left as number, right as number) }
      const offsets = canalDesignProfile(next, refreshed).map((point) => Math.round(point.offset * 1000) / 1000)
      return { ...refreshed, designPointOffsets: [...new Set(offsets)].sort((a, b) => a - b) }
    })
    state.setCanal(node.id, next)
  }

  const commitCanal = (update: (current: CanalData) => CanalData): void => {
    const state = useStore.getState()
    const currentNode = state.project ? findNode(state.project.root, node.id) : null
    if (!currentNode?.canal) return
    state.setCanal(node.id, update(migrateCanalData(currentNode.canal)))
  }

  return (
    <div className="canal-v2-dashboard">
      <header className="canal-v2-toolbar">
        <div className="canal-v2-identity">
          <span className="canal-v2-template-label">
            <Waves size={15} /> {node.name}
          </span>
          <div className="canal-v2-badges">
            <span>{data.mode === 'new' ? 'New canal' : 'Canal repair'}</span>
            <span>
              {data.lengthM > 0
                ? `${Math.round(data.lengthM).toLocaleString('en-IN')} m long`
                : 'Length not set'}
            </span>
            <span>{sections.length} cross-sections</span>
            {data.flowDirection && (
              <span>
                Water flows {canalFlowLabel(data.flowDirection)}
                {data.flowInherited ? ' · inherited' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="canal-v2-setup-actions">
          <button type="button" className="btn ghost" onClick={() => onEditSetup(1)}>
            <Settings2 size={14} /> Edit setup
          </button>
          <button type="button" className="btn ghost" onClick={() => onEditSetup(2)}>
            <Pencil size={14} /> Edit sections
          </button>
        </div>
      </header>

      <nav className="canal-v2-chapters" aria-label="Canal chapters">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            type="button"
            className={`canal-v2-chapter${activeChapter === chapter.id ? ' active' : ''}`}
            onClick={() => setActiveChapter(chapter.id)}
          >
            <span className="canal-v2-chapter-number">{chapter.number}</span>
            <span>{chapter.shortTitle}</span>
          </button>
        ))}
      </nav>

      <main className="canal-v2-content">
        {activeChapter === 'design-levels' && (
          <CanalDesignLevels design={data.design} onCommit={commitDesign} />
        )}
        {activeChapter === 'cross-sections' && (
          <CanalCrossSections data={data} onCommit={commitCanal} />
        )}
        {activeChapter === 'bank-design' && (
          <CanalBankDesign data={data} sections={sections} onCommit={commitDesign} />
        )}
        {activeChapter === 'earthwork' && <CanalEarthwork data={data} onCommit={commitCanal} />}
        {activeChapter === 'jungle-la' && <CanalJungleLa data={data} onCommit={commitCanal} />}
        {activeChapter === 'foundation-filling' && <CanalFoundationFilling data={data} onCommit={commitCanal} />}
        {activeChapter === 'filters-drains' && <CanalFiltersDrains data={data} onCommit={commitCanal} />}
        {activeChapter === 'lining' && <CanalLining data={data} onCommit={commitCanal} />}
        {activeChapter === 'roads-access' && <CanalRoadsAccess data={data} onCommit={commitCanal} />}
      </main>
    </div>
  )
}
