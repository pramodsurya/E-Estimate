import { useEffect, useState } from 'react'
import { Check, Tags } from 'lucide-react'
import { fetchDataVariantSpecs, type DataVariantSpec } from '../../lib/dataVariants'
import { useStore } from '../../store/useStore'
import type { DataVariantSelection } from '../../types/project'
import Modal from '../modals/Modal'
import DataVariantReview, {
  defaultSelectionForVariantSpec,
  selectionForVariantOption
} from './DataVariantReview'

/**
 * Default template codes bypass the manual material picker. If that exact
 * default has a real DATA choice/add-on, expose it explicitly without
 * interrupting the user. Replacing the code makes this button disappear.
 */
export default function TemplateDefaultVariantButton({
  ownerId,
  code,
  defaultCode,
  selection
}: {
  ownerId: string
  code?: string
  defaultCode: string
  selection?: DataVariantSelection
}): JSX.Element | null {
  const year = useStore((state) => state.project?.meta.sorYear ?? '')
  const setTemplateCodeVariant = useStore((state) => state.setTemplateCodeVariant)
  const [spec, setSpec] = useState<DataVariantSpec | null>(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<DataVariantSelection | undefined>(selection)

  useEffect(() => {
    setOpen(false)
    setSpec(null)
    setChosen(selection)
    if (!year || code !== defaultCode) return
    let cancelled = false
    void fetchDataVariantSpecs([code], year).then((found) => {
      if (cancelled) return
      const next = found[code]
      if (!next) return
      setSpec(next)
      setChosen(selection ?? defaultSelectionForVariantSpec(next))
    })
    return () => {
      cancelled = true
    }
  }, [code, defaultCode, selection, year])

  if (code !== defaultCode || !spec) return null

  return (
    <>
      <button className="btn ghost template-default-variant-btn" onClick={() => setOpen(true)}>
        <Tags size={13} />
        Variants / Add-ons
        {selection?.label ? <small>{selection.label}</small> : null}
      </button>
      {open && (
        <Modal
          title="Default code variants / add-ons"
          size="lg"
          onClose={() => setOpen(false)}
          bodyFlush
          footer={
            <button
              className="btn"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return
                setTemplateCodeVariant(ownerId, code, chosen)
                setOpen(false)
              }}
            >
              <Check size={15} /> Apply selection
            </button>
          }
        >
          <DataVariantReview
            heading={`${code} · choose the required published option`}
            specs={{ [code]: spec }}
            selections={chosen ? { [code]: chosen } : {}}
            onSelect={(_, variantSpec, option) =>
              setChosen(selectionForVariantOption(variantSpec, option))
            }
          />
        </Modal>
      )}
    </>
  )
}
