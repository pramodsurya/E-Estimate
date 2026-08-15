import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export default function ProjectDataImageField({
  value,
  onChange
}: {
  value?: string
  onChange: (next?: string) => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  const chooseImage = (file: File | undefined): void => {
    setError('')
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Choose a PNG, JPEG, WebP, or GIF image.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Choose an image up to 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setError('The image could not be read.')
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') onChange(result)
      else setError('The image could not be read.')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="project-data-image-field">
      <div className="project-data-image-heading">
        <span>Reference image <small>Optional</small></span>
        {value ? (
          <button type="button" className="btn ghost compact" onClick={() => onChange(undefined)}>
            <Trash2 size={14} /> Remove image
          </button>
        ) : null}
      </div>
      {value ? <img className="project-data-image-preview" src={value} alt="DATA reference" /> : null}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          chooseImage(event.target.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      <button type="button" className="btn ghost compact" onClick={() => inputRef.current?.click()}>
        <ImagePlus size={15} /> {value ? 'Replace image' : 'Add image'}
      </button>
      {error ? <small className="project-data-image-error">{error}</small> : null}
    </div>
  )
}
