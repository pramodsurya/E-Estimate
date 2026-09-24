import { useActionState, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../../store/useStore'
import { findNode } from '../../lib/tree'

export default function AddPageModal(): JSX.Element {
  const parentId = useStore((s) => s.addPage.parentId)
  const project = useStore((s) => s.project)
  const close = useStore((s) => s.closeAddPage)
  const createPage = useStore((s) => s.createPage)
  const [name, setName] = useState('')

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const pageName = (formData.get('name') as string)?.trim()
      if (!project || !pageName) {
        return { error: 'Please enter a valid page name.' }
      }
      try {
        createPage(parentId ?? project.root.id, pageName)
        close()
        return { error: null }
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Failed to add page' }
      }
    },
    { error: null }
  )

  const parentName = (() => {
    if (!project) return ''
    return (parentId && findNode(project.root, parentId)?.name) || project.root.name
  })()

  const footer = (
    <>
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        Adding to <b style={{ color: 'var(--text)' }}>{parentName}</b>
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button type="submit" form="add-page-form" className="btn" disabled={!name.trim() || isPending}>
          <FilePlus2 size={15} /> {isPending ? 'Adding...' : 'Add Page'}
        </button>
      </div>
    </>
  )

  return (
    <Modal title="Add Page" onClose={close} footer={footer}>
      <form id="add-page-form" action={formAction}>
        <div className="field">
          <label className="field-label" htmlFor="new-page-name">
            Page Name
          </label>
          <input
            id="new-page-name"
            name="name"
            className="text-input"
            value={name}
            placeholder="Enter a page name"
            autoFocus
            disabled={isPending}
            onChange={(event) => setName(event.target.value)}
          />
          {state.error && (
            <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>
              {state.error}
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
