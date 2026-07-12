import { useEffect, useState } from 'react'

type UpdateStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'not-available'

interface UpdateInfo {
  version?: string
  releaseDate?: string
  releaseName?: string
}

type UpdateApi = Window['api']

export default function UpdateNotification(): JSX.Element | null {
  const [stage, setStage] = useState<UpdateStage>('idle')
  const [info, setInfo] = useState<UpdateInfo>({})
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = (window as Window & { api?: UpdateApi }).api
    if (!api?.update) return

    const unsubs: (() => void)[] = []

    unsubs.push(
      api.update.onChecking(() => {
        setStage('checking')
        setErrorMsg('')
      })
    )

    unsubs.push(
      api.update.onAvailable((i: unknown) => {
        const u = i as UpdateInfo
        setInfo(u)
        setStage('available')
        setDismissed(false)
      })
    )

    unsubs.push(
      api.update.onNotAvailable(() => {
        setStage('not-available')
      })
    )

    unsubs.push(
      api.update.onDownloadProgress((p) => {
        setProgress(Math.round(p.percent))
        setStage('downloading')
      })
    )

    unsubs.push(
      api.update.onDownloaded((i: unknown) => {
        setInfo(i as UpdateInfo)
        setStage('downloaded')
      })
    )

    unsubs.push(
      api.update.onError((msg: string) => {
        setErrorMsg(msg)
        setStage('error')
      })
    )

    return () => unsubs.forEach((u) => u())
  }, [])

  // ── Actions ──
  const handleDownload = () => {
    const api = (window as Window & { api?: UpdateApi }).api
    api?.update.download()
  }

  const handleInstall = () => {
    const api = (window as Window & { api?: UpdateApi }).api
    api?.update.install()
  }

  const handleDismiss = () => setDismissed(true)

  // Don't show anything in idle / checking state (unless checking takes long)
  if (stage === 'idle' || stage === 'not-available') return null
  if (dismissed && stage === 'available') return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: 360,
      background: '#2d2d2d',
      border: '1px solid #555',
      borderRadius: 10,
      padding: '16px 20px',
      color: '#e0e0e0',
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>
          {stage === 'checking' && '⏳ Checking for updates…'}
          {stage === 'available' && '🆕 Update Available'}
          {stage === 'downloading' && '⬇️ Downloading…'}
          {stage === 'downloaded' && '✅ Ready to Install'}
          {stage === 'error' && '❌ Update Error'}
        </strong>
        {stage === 'available' && (
          <button
            onClick={handleDismiss}
            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      {/* Version info */}
      {info.version && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#aaa' }}>
          Version <b>{info.version}</b>
          {info.releaseDate && ` — ${new Date(info.releaseDate).toLocaleDateString()}`}
        </p>
      )}

      {/* Progress bar */}
      {stage === 'downloading' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            height: 6,
            background: '#444',
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #4a9eff, #7c5cfc)',
              borderRadius: 3,
              transition: 'width 0.3s'
            }} />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{progress}%</p>
        </div>
      )}

      {/* Error message */}
      {stage === 'error' && errorMsg && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#ff6b6b' }}>{errorMsg}</p>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {stage === 'available' && (
          <>
            <button onClick={handleDownload} style={btnPrimary}>Download Update</button>
            <button onClick={handleDismiss} style={btnSecondary}>Later</button>
          </>
        )}
        {stage === 'downloaded' && (
          <button onClick={handleInstall} style={btnPrimary}>
            Restart & Install
          </button>
        )}
        {stage === 'error' && (
          <button onClick={handleDismiss} style={btnSecondary}>Dismiss</button>
        )}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  background: 'linear-gradient(135deg, #4a9eff, #7c5cfc)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13
}

const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  background: '#444',
  color: '#ccc',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13
}
