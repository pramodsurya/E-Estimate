import { Save } from 'lucide-react'
import { useState } from 'react'
import {
  documentFontScale,
  resolveProjectDocumentSettings,
  type DocumentSettings
} from '../../lib/typist-output/documentSettings'
import { resolveProjectPrintSettings } from '../../lib/projectPrintSettings'
import { useStore } from '../../store/useStore'
import Modal from '../modals/Modal'
import DocumentSettingsPanel from './DocumentSettingsPanel'
import './documentSettings.css'

export default function ProjectDocumentSettingsModal({ onClose }: { onClose: () => void }): JSX.Element | null {
  const project = useStore((state) => state.project)
  const updateProjectPrintSettings = useStore((state) => state.updateProjectPrintSettings)
  const saveProject = useStore((state) => state.saveProject)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<DocumentSettings>(() =>
    resolveProjectDocumentSettings(project?.projectPrintSettings)
  )

  if (!project) return null

  const save = async (): Promise<void> => {
    setSaving(true)
    const current = resolveProjectPrintSettings(project.projectPrintSettings)
    updateProjectPrintSettings({
      ...current,
      ...draft,
      margins: { ...draft.margins },
      fontPercent: documentFontScale(draft.fontSizePt) * 100
    })
    try {
      await saveProject()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Whole Project Document Settings"
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <span className="modal-footer-note">These defaults flow to every Print Studio document unless it has its own override.</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving} onClick={() => void save()}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save defaults'}
          </button>
        </>
      )}
    >
      <DocumentSettingsPanel settings={draft} inherited onChange={setDraft} />
    </Modal>
  )
}
