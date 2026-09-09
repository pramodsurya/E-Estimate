import { Check } from 'lucide-react'

export type BundChapterCategory = 'embankment' | 'foundation' | 'protection'

export interface BundChapterDefinition {
  id: string
  number: number
  title: string
  shortTitle: string
  category: BundChapterCategory
  status: 'reference' | 'current' | 'complete' | 'attention' | 'upcoming'
}

export default function BundChapterNavigator({
  chapters,
  activeId,
  onSelect
}: {
  chapters: BundChapterDefinition[]
  activeId: string
  onSelect: (id: string) => void
}): JSX.Element {
  const topChapters = chapters.slice(0, 5)
  const remainingChapters = chapters.slice(5)
  const remainingRows = Array.from(
    { length: Math.ceil(remainingChapters.length / 6) },
    (_, index) => remainingChapters.slice(index * 6, (index + 1) * 6)
  )

  const renderChapter = (chapter: BundChapterDefinition): JSX.Element => {
    const active = chapter.id === activeId
    const available = chapter.status !== 'upcoming'

    return (
      <button
        key={chapter.id}
        type="button"
        role="tab"
        className={`bund-v2-chapter-tab is-${chapter.status}${active ? ' is-active' : ''}`}
        aria-selected={active}
        aria-label={`${chapter.number}. ${chapter.title}`}
        title={`${chapter.number}. ${chapter.title}`}
        disabled={!available}
        onClick={() => available && onSelect(chapter.id)}
      >
        <span className="bund-v2-chapter-badge" aria-hidden="true">
          {chapter.status === 'complete' ? <Check size={12} /> : chapter.number}
        </span>
        <span className="bund-v2-chapter-label">{chapter.title}</span>
      </button>
    )
  }

  return (
    <nav className="bund-v2-nav-container" aria-label="Bund design chapters">
      <div className="bund-v2-chapter-track" role="tablist" aria-label="Bund design chapters">
        <div className="bund-v2-chapter-row bund-v2-chapter-row--top">{topChapters.map(renderChapter)}</div>
        {remainingRows.map((row, index) => (
          <div className="bund-v2-chapter-row" key={`chapter-row-${index}`}>
            {row.map(renderChapter)}
          </div>
        ))}
      </div>
    </nav>
  )
}
