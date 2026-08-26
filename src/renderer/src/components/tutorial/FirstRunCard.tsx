import { FolderOpen, Sparkles } from 'lucide-react'
import { CHAPTERS } from '../../tutorial/chapters'
import { useTutorial } from '../../tutorial/useTutorial'

/**
 * The invitation on the Home screen.
 *
 * Shown until the reader has either taken the tour or waved it away. It is a
 * card rather than a modal on purpose: a first-time user who wants to open an
 * existing project should not have to dismiss anything first.
 */
export default function FirstRunCard(): JSX.Element | null {
  const greeted = useTutorial((s) => s.greeted)
  const resume = useTutorial((s) => s.resume)
  const start = useTutorial((s) => s.start)
  const dismissGreeting = useTutorial((s) => s.dismissGreeting)
  const openProjectFromDisk = (): void => {
    void import('../../store/useStore').then(({ useStore }) => useStore.getState().openProjectFromDisk())
  }

  const canResume = Boolean(resume)
  if (greeted && !canResume) return null

  const first = CHAPTERS[0]

  return (
    <div className="first-run-card">
      <div className="first-run-eyebrow">
        <Sparkles size={13} /> {canResume ? 'PICK UP WHERE YOU LEFT OFF' : 'FIRST TIME HERE'}
      </div>
      <h2>{canResume ? 'You were partway through the tutorial.' : 'Let’s build your first estimate together.'}</h2>
      <p>
        {canResume
          ? 'Nothing has moved. Carry on from the step you stopped at, or start the chapter again from the top.'
          : `Chapter 1 covers a whole estimate — project details, a component, items, measurement sheets, final ` +
            `numbers and print areas. I’ll point at what to press and explain why. About ${first.minutes} minutes; ` +
            `you can stop after the first step.`}
      </p>
      <div className="first-run-actions">
        {canResume && resume ? (
          <>
            <button className="btn" onClick={() => start(resume.chapterId, resume.stepIndex)}>
              → Resume the tutorial
            </button>
            <button className="btn ghost" onClick={() => start(resume.chapterId, 0)}>
              Start the chapter again
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => start(first.id)}>
              → Start guided setup
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                dismissGreeting()
                openProjectFromDisk()
              }}
            >
              <FolderOpen size={15} /> Open an existing project
            </button>
          </>
        )}
      </div>
    </div>
  )
}
