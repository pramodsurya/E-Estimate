import { useMemo, useState } from 'react'
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

  const parentName = useMemo(() => {
    if (!project) return ''
    return (parentId && findNode(project.root, parentId)?.name) || project.root.name
  }, [parentId, project])

  const confirm = (): void => {
    const trimmed = name.trim()
    if (!project || !trimmed) return
    createPage(parentId ?? project.root.id, trimmed)
    close()
  }

  const footer = (
    <>
      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        Adding to <b style={{ color: 'var(--text)' }}>{parentName}</b>
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn" disabled={!name.trim()} onClick={confirm}>
          <FilePlus2 size={15} /> Add Page
        </button>
      </div>
    </>
  )

  return (
    <Modal title="Add Page" onClose={close} footer={footer}>
      <div className="field">
        <label className="field-label" htmlFor="new-page-name">
          Page Name
        </label>
        <input
          id="new-page-name"
          className="text-input"
          value={name}
          placeholder="Enter a page name"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') confirm()
          }}
        />
      </div>
    </Modal>
  )
}
