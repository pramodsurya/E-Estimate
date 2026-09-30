import { useEffect } from 'react'
import { useStore, type AppNotificationStatus } from '../store/useStore'
import { useClusterStore } from '../store/useClusterStore'
import {
  canPrepareAutomaticUpdate,
  UPDATE_CHECK_INTERVAL_MS
} from '../lib/autoUpdatePolicy'

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

async function saveAndInstallUpdate(
  install: () => Promise<void>,
  stillSafe: () => boolean
): Promise<boolean> {
  let project = useStore.getState()
  let cluster = useClusterStore.getState()
  if (project.project && project.dirty) await project.saveProject({ requireSaved: true })
  if (cluster.cluster && cluster.clusterDirty) await cluster.saveCluster()
  project = useStore.getState()
  cluster = useClusterStore.getState()
  // A save can finish after another edit. Never exit with pending changes.
  if (!stillSafe() || project.dirty || cluster.clusterDirty) return false
  await install()
  return true
}

/**
 * Keeps the notification centre synchronized with the shell updater API.
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
    let downloaded = false
    let installing = false
    let lastActivityAt = Date.now()

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
            ? message || `${version} is ready. After 10 minutes idle, the app will save, install and reopen. Save any untitled project or cluster first.`
            : stage === 'error'
              ? message || 'The update service returned an unexpected error.'
              : `${version} was found. Its verified installer will download automatically.`

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

    const recordActivity = (): void => {
      lastActivityAt = Date.now()
    }

    const safeToPrepare = (): boolean => {
      const project = useStore.getState()
      const cluster = useClusterStore.getState()
      return canPrepareAutomaticUpdate({
        idleForMs: Date.now() - lastActivityAt,
        unsavedProject: Boolean(project.project && !project.filePath),
        unsavedCluster: Boolean(cluster.cluster && !cluster.clusterPath),
        creatingProject: project.view === 'newproject',
        editorOpen: project.addItem.open || project.addPage.open ||
          project.addStructure.open || project.settings.open,
        simulationRunning: Object.keys(project.bundSimulationJobs).length > 0,
        clusterLoading: cluster.loading
      })
    }

    const installWhenSafe = (): void => {
      if (!downloaded || installing || !safeToPrepare()) return
      installing = true
      void saveAndInstallUpdate(api.update.install, safeToPrepare)
        .then((installed) => {
          if (!installed) recordActivity()
        })
        .catch((error: unknown) => {
          // Delay retries after a save failure; the native updater reports its
          // own install errors through update:error.
          recordActivity()
          if (downloaded) {
            publish('downloaded', {}, 100,
              `Automatic update is waiting for work to be saved: ${error instanceof Error ? error.message : String(error)}`, true)
          }
        })
        .finally(() => {
          installing = false
        })
    }

    const checkPeriodically = (): void => {
      if (downloaded || installing) return
      void api.update.status().then((value) => {
        const status = value as { stage?: UpdateStage } | undefined
        if (status?.stage === 'checking' || status?.stage === 'available' ||
          status?.stage === 'downloading' || status?.stage === 'downloaded') return
        return api.update.check()
      }).catch(() => undefined)
    }

    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    activityEvents.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }))
    const onVisibilityChange = (): void => {
      if (!document.hidden) recordActivity()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const installTimer = window.setInterval(installWhenSafe, 30_000)
    const checkTimer = window.setInterval(checkPeriodically, UPDATE_CHECK_INTERVAL_MS)

    unsubs.push(
      api.update.onChecking(() => {
        sawLiveEvent = true
        downloaded = false
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
        downloaded = false
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
        downloaded = true
        publish('downloaded', value as UpdateInfo, 100, undefined, true)
        installWhenSafe()
      })
    )
    unsubs.push(
      api.update.onError((message: string) => {
        sawLiveEvent = true
        downloaded = false
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
      downloaded = state.stage === 'downloaded'
      publish(state.stage, state.info, state.percent, state.message, state.stage !== 'downloading')
      if (downloaded) installWhenSafe()
    })

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe())
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(installTimer)
      window.clearInterval(checkTimer)
    }
  }, [dismiss, upsert])

  return null
}
