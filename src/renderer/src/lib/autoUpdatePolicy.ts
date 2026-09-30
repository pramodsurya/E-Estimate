/** Keep an update from interrupting active editing or an unfinished calculation. */
export const AUTO_UPDATE_IDLE_MS = 10 * 60 * 1000
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface AutoUpdateSafety {
  idleForMs: number
  unsavedProject: boolean
  unsavedCluster: boolean
  creatingProject: boolean
  editorOpen: boolean
  simulationRunning: boolean
  clusterLoading: boolean
}

/** Dirty documents with paths can be saved before installation; pathless ones cannot. */
export function canPrepareAutomaticUpdate(safety: AutoUpdateSafety): boolean {
  return safety.idleForMs >= AUTO_UPDATE_IDLE_MS &&
    !safety.unsavedProject &&
    !safety.unsavedCluster &&
    !safety.creatingProject &&
    !safety.editorOpen &&
    !safety.simulationRunning &&
    !safety.clusterLoading
}
