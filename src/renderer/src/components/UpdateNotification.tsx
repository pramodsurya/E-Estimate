import { useEffect } from 'react'
import { useStore, type AppNotificationStatus } from '../store/useStore'

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

/**
 * Keeps the notification centre synchronized with electron-updater.
 *
 * This component is deliberately headless: update prompts and actions belong
 * in the title-bar bell, where they cannot cover an estimate or simulation.
 */
export default function UpdateNotification(): null {
  const upsert = useStore((state) => state.upsertAppNotification)
  const dismiss = useStore((state) => state.dismissAppNotification)

  useEffect(() => {
    const api = (window as Window & { api?: UpdateApi }).api
    if (!api?.update) return

    const unsubs: (() => void)[] = []
    let sawLiveEvent = false
    let knownInfo: UpdateInfo = {}

    const publish = (
      stage: UpdateStage,
      info: UpdateInfo = {},
      percent?: number,
      message?: string,
      markUnread = false
    ): void => {
      if (stage === 'idle' || stage === 'checking') return
      if (stage === 'not-available') {
        dismiss('app-update')
        return
      }

      knownInfo = { ...knownInfo, ...info }
      const updateInfo = knownInfo

      const status: AppNotificationStatus =
        stage === 'available'
          ? 'update-available'
          : stage === 'downloading'
            ? 'update-downloading'
            : stage === 'downloaded'
              ? 'update-downloaded'
              : 'update-error'
      const version = updateInfo.version ? `Version ${updateInfo.version}` : 'A newer version'
      const title =
        stage === 'available'
          ? 'Application update available'
          : stage === 'downloading'
            ? 'Downloading application update'
            : stage === 'downloaded'
              ? 'Application update ready'
              : 'Application update failed'
      const detail =
        stage === 'downloading'
          ? `${version} · ${Math.round(percent ?? 0)}% downloaded`
          : stage === 'downloaded'
            ? `${version} is ready. Restart the app to install it.`
            : stage === 'error'
              ? message || 'The update service returned an unexpected error.'
              : `${version} is ready to download.`

      upsert(
        {
          id: 'app-update',
          kind: 'update',
          status,
          title,
          message: detail,
          progress: percent === undefined ? undefined : Math.round(percent),
          version: updateInfo.version,
          releaseDate: updateInfo.releaseDate
        },
        markUnread
      )
    }

    unsubs.push(
      api.update.onChecking(() => {
        sawLiveEvent = true
      })
    )
    unsubs.push(
      api.update.onAvailable((value: unknown) => {
        sawLiveEvent = true
        publish('available', value as UpdateInfo, undefined, undefined, true)
      })
    )
    unsubs.push(
      api.update.onNotAvailable(() => {
        sawLiveEvent = true
        publish('not-available')
      })
    )
    unsubs.push(
      api.update.onDownloadProgress((progress) => {
        sawLiveEvent = true
        publish('downloading', {}, progress.percent)
      })
    )
    unsubs.push(
      api.update.onDownloaded((value: unknown) => {
        sawLiveEvent = true
        publish('downloaded', value as UpdateInfo, 100, undefined, true)
      })
    )
    unsubs.push(
      api.update.onError((message: string) => {
        sawLiveEvent = true
        publish('error', {}, undefined, message, true)
      })
    )

    // The startup check can finish before React mounts. Catch up without
    // overriding a newer live event that arrived while this request was open.
    void api.update.status().then((value) => {
      const state = value as
        | { stage: UpdateStage; info?: UpdateInfo; percent?: number; message?: string }
        | undefined
      if (!state || sawLiveEvent) return
      publish(state.stage, state.info, state.percent, state.message, state.stage !== 'downloading')
    })

    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [dismiss, upsert])

  return null
}
