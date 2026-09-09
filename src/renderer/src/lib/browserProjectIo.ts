/**
 * Chrome/Vite session: open and save `.eestimate` JSON with the file picker.
 * Paths are `browser:<filename>` — Chrome cannot reopen a real disk path later.
 */

import type { OpenResult, RecentEntry, SaveResult } from '../types/eestimateApi'

// File System Access API (Chromium-only). Not in the default DOM lib, so declare
// it locally; the renderer never calls these on the Tauri/WebView2 shell.
interface FilePickerAcceptType {
  description: string
  accept: Record<string, string[]>
}
interface FilePickerOptions {
  multiple?: boolean
  types?: FilePickerAcceptType[]
}
declare global {
  interface Window {
    showOpenFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

const RECENT_KEY = 'eestimate-browser-recent'
const PATH_PREFIX = 'browser:'

type HandleStore = Map<string, FileSystemFileHandle>

const handles: HandleStore = new Map()

function isProjectShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Boolean(record.root) && Boolean(record.meta)
}

function toBrowserPath(name: string): string {
  const fileName = name.replace(/^.*[/\\]/, '') || 'Project.eestimate'
  const withExt = fileName.endsWith('.eestimate') ? fileName : `${fileName}.eestimate`
  return `${PATH_PREFIX}${withExt}`
}

function displayName(path: string): string {
  return path.startsWith(PATH_PREFIX) ? path.slice(PATH_PREFIX.length) : path
}

function readRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRecent(path: string): RecentEntry[] {
  const name = displayName(path).replace(/\.eestimate$/i, '')
  const next: RecentEntry[] = [
    { path, name, openedAt: new Date().toISOString() },
    ...readRecent().filter((entry) => entry.path !== path)
  ].slice(0, 12)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  return next
}

async function parseProjectFile(file: File): Promise<Record<string, unknown>> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!isProjectShape(parsed)) {
    throw new Error('That file is not an E-Estimate project.')
  }
  return parsed
}

function pickFileWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.eestimate,application/json'
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      input.remove()
      resolve(file)
    })
    document.body.appendChild(input)
    input.click()
  })
}

async function pickOpenFile(): Promise<{ file: File; handle?: FileSystemFileHandle } | null> {
  const picker = window.showOpenFilePicker
  if (typeof picker === 'function') {
    try {
      const [handle] = await picker.call(window, {
        multiple: false,
        types: [
          {
            description: 'E-Estimate Project',
            accept: { 'application/json': ['.eestimate'] }
          }
        ]
      })
      return { file: await handle.getFile(), handle }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      // Fall through to the input picker if the types filter is rejected.
    }
  }
  const file = await pickFileWithInput()
  return file ? { file } : null
}

function downloadProject(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.eestimate') ? fileName : `${fileName}.eestimate`
  link.click()
  URL.revokeObjectURL(url)
}

async function writeHandle(handle: FileSystemFileHandle, data: unknown): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(data))
  await writable.close()
}

export async function browserListRecent(): Promise<RecentEntry[]> {
  return readRecent()
}

export async function browserClearRecent(): Promise<RecentEntry[]> {
  localStorage.removeItem(RECENT_KEY)
  return []
}

export async function browserOpenProject(): Promise<OpenResult> {
  try {
    const picked = await pickOpenFile()
    if (!picked) return { canceled: true }
    const data = await parseProjectFile(picked.file)
    const path = toBrowserPath(picked.file.name)
    if (picked.handle) handles.set(path, picked.handle)
    writeRecent(path)
    return { canceled: false, path, data: data as unknown as OpenResult['data'] }
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function browserOpenPath(path: string): Promise<OpenResult> {
  const handle = handles.get(path)
  if (!handle) {
    return {
      canceled: false,
      error: 'Chrome cannot reopen that path. Use File → Open Project and pick the .eestimate file again.'
    }
  }
  try {
    const data = await parseProjectFile(await handle.getFile())
    writeRecent(path)
    return { canceled: false, path, data: data as unknown as OpenResult['data'] }
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function browserSaveProject(
  data: unknown,
  currentPath: string | null,
  name: string
): Promise<SaveResult> {
  const path = currentPath && currentPath.startsWith(PATH_PREFIX) ? currentPath : toBrowserPath(name)
  const handle = handles.get(path)
  if (handle) {
    try {
      await writeHandle(handle, data)
      writeRecent(path)
      return { canceled: false, path }
    } catch {
      // Permission or handle lost — ask for a new file.
    }
  }
  return browserSaveProjectAs(data, displayName(path).replace(/\.eestimate$/i, '') || name)
}

export async function browserSaveProjectAs(data: unknown, name: string): Promise<SaveResult> {
  const suggested = name.replace(/[\\/:*?"<>|]/g, '_') || 'Project'
  const picker = window.showSaveFilePicker
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: `${suggested}.eestimate`,
        types: [
          {
            description: 'E-Estimate Project',
            accept: { 'application/json': ['.eestimate'] }
          }
        ]
      })
      await writeHandle(handle, data)
      const path = toBrowserPath(handle.name || `${suggested}.eestimate`)
      handles.set(path, handle)
      writeRecent(path)
      return { canceled: false, path }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { canceled: true }
    }
  }
  downloadProject(data, `${suggested}.eestimate`)
  const path = toBrowserPath(`${suggested}.eestimate`)
  writeRecent(path)
  return { canceled: false, path }
}
