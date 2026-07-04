// Module-level pub/sub bridging the app's React tree (UniverSpreadsheet) and
// the chart components rendered inside Univer's separate floating-DOM React
// tree. Both sides import this singleton.
//
//  - Editor publishes a fresh Chart.js config when cell data changes;
//    ChartFloat subscribes and re-renders.
//  - ChartFloat reports its rendered PNG (for print) and delete requests;
//    the editor subscribes and updates the store.

import type { ChartJsConfig } from '../../lib/chartData'

type ConfigListener = (config: ChartJsConfig) => void
type PngListener = (chartId: string, png: string) => void
type IdListener = (chartId: string) => void
type VoidListener = () => void

const latestConfig = new Map<string, ChartJsConfig>()
const configListeners = new Map<string, Set<ConfigListener>>()
const pngListeners = new Set<PngListener>()
const deleteListeners = new Set<IdListener>()
const editListeners = new Set<IdListener>()
const insertListeners = new Set<VoidListener>()
const refreshListeners = new Set<IdListener>()

/** Editor -> chart: push a new config for a chart id. */
export function publishConfig(chartId: string, config: ChartJsConfig): void {
  latestConfig.set(chartId, config)
  configListeners.get(chartId)?.forEach((cb) => cb(config))
}

/** Chart -> subscribe to config updates; immediately receives the latest. */
export function subscribeConfig(chartId: string, cb: ConfigListener): () => void {
  let set = configListeners.get(chartId)
  if (!set) {
    set = new Set()
    configListeners.set(chartId, set)
  }
  set.add(cb)
  const current = latestConfig.get(chartId)
  if (current) cb(current)
  return () => {
    set?.delete(cb)
  }
}

export function clearConfig(chartId: string): void {
  latestConfig.delete(chartId)
  configListeners.delete(chartId)
}

/** Chart -> editor: request a fresh config, usually after a restored float mounts. */
export function requestRefresh(chartId: string): void {
  refreshListeners.forEach((cb) => cb(chartId))
}
export function subscribeRefresh(cb: IdListener): () => void {
  refreshListeners.add(cb)
  return () => refreshListeners.delete(cb)
}

/** Chart -> editor: report rendered PNG. */
export function reportPng(chartId: string, png: string): void {
  pngListeners.forEach((cb) => cb(chartId, png))
}
export function subscribePng(cb: PngListener): () => void {
  pngListeners.add(cb)
  return () => pngListeners.delete(cb)
}

/** Chart -> editor: request deletion. */
export function requestDelete(chartId: string): void {
  deleteListeners.forEach((cb) => cb(chartId))
}
export function subscribeDelete(cb: IdListener): () => void {
  deleteListeners.add(cb)
  return () => deleteListeners.delete(cb)
}

/** Chart -> editor: request the edit panel for a chart. */
export function requestEdit(chartId: string): void {
  editListeners.forEach((cb) => cb(chartId))
}
export function subscribeEdit(cb: IdListener): () => void {
  editListeners.add(cb)
  return () => editListeners.delete(cb)
}

/** Ribbon command -> editor: open the insert-chart panel. */
export function requestInsert(): void {
  insertListeners.forEach((cb) => cb())
}
export function subscribeInsert(cb: VoidListener): () => void {
  insertListeners.add(cb)
  return () => insertListeners.delete(cb)
}
