import { promises as fs } from 'fs'

const pendingWrites = new Map<string, Promise<void>>()

export async function writeProject(path: string, data: unknown): Promise<void> {
  const previous = pendingWrites.get(path) ?? Promise.resolve()
  const write = previous.catch(() => undefined).then(async () => {
    const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(data), 'utf-8')
      await fs.rename(temporaryPath, path)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  })

  pendingWrites.set(path, write)
  try {
    await write
  } finally {
    if (pendingWrites.get(path) === write) pendingWrites.delete(path)
  }
}

export async function readProject(path: string): Promise<unknown> {
  const raw = await fs.readFile(path, 'utf-8')
  return JSON.parse(raw)
}
