import { Check, GraduationCap } from 'lucide-react'
import { CHAPTERS } from '../../tutorial/chapters'
import { useTutorial } from '../../tutorial/useTutorial'

/**
 * "Help ▸ Show me how" — the promise the last chapter makes.
 *
 * Any chapter can be replayed at any time, in any project. Nothing here
 * touches project data, so replaying is always safe.
 */
export default function HelpMenu({ onPick }: { onPick: () => void }): JSX.Element {
  const completed = useTutorial((s) => s.completed)
  const resume = useTutorial((s) => s.resume)
  const start = useTutorial((s) => s.start)
  const resetProgress = useTutorial((s) => s.resetProgress)

  const pick = (fn: () => void): void => {
    fn()
    onPick()
  }

  return (
    <div className="menu-dropdown" onClick={(e) => e.stopPropagation()}>
      <div className="menu-dd-head">
        <GraduationCap size={13} /> Show me how
      </div>
      {resume && (
        <button
          className="menu-dd-item"
          onClick={() => pick(() => start(resume.chapterId, resume.stepIndex))}
        >
          Resume where I stopped
        </button>
      )}
      {CHAPTERS.map((chapter) => (
        <button
          key={chapter.id}
          className="menu-dd-item"
          title={chapter.blurb}
          onClick={() => pick(() => start(chapter.id, 0))}
        >
          <span>
            {chapter.number}. {chapter.title}
          </span>
          {completed.includes(chapter.id) && <Check size={13} className="menu-dd-tick" />}
        </button>
      ))}
      <div className="menu-sep" />
      <button className="menu-dd-item" onClick={() => pick(resetProgress)}>
        Forget my tutorial progress
      </button>
    </div>
  )
}
