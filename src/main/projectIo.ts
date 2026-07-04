import { promises as fs } from 'fs'

export async function writeProject(path: string, data: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data), 'utf-8')
}

export async function readProject(path: string): Promise<unknown> {
  const raw = await fs.readFile(path, 'utf-8')
  return JSON.parse(raw)
}
