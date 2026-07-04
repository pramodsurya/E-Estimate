import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export interface RecentEntry {
  path: string
  name: string
  openedAt: string
}

const MAX_RECENT = 30

function storeFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

function read(): RecentEntry[] {
  try {
    const f = storeFile()
    if (!existsSync(f)) return []
    const parsed = JSON.parse(readFileSync(f, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as RecentEntry[]) : []
  } catch {
    return []
  }
}

function save(list: RecentEntry[]): void {
  try {
    writeFileSync(storeFile(), JSON.stringify(list, null, 2), 'utf-8')
  } catch {
    /* best-effort */
  }
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return (parts[parts.length - 1] || p).replace(/\.eestimate$/i, '')
}

export function listRecent(): RecentEntry[] {
  return read()
}

export function addRecent(path: string, name?: string): void {
  const list = read().filter((e) => e.path !== path)
  list.unshift({ path, name: name || baseName(path), openedAt: new Date().toISOString() })
  save(list.slice(0, MAX_RECENT))
}

export function removeRecent(path: string): void {
  save(read().filter((e) => e.path !== path))
}

export function clearRecent(): void {
  save([])
}
