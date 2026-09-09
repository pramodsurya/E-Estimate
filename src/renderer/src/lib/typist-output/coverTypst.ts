import type { EestimateProject, ProjectNode } from '../../types/project'
import { resolveProjectEstimatedCost } from '../projectPrintInputs'
import { resolveNodeSettings } from '../nodeSettings'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  resolveProjectDocumentSettings
} from './documentSettings'
import coverTemplate from './cover.typ?raw'
import telanganaEmblemSvg from '../../assets/emblem-telangana.svg?raw'
import { normalizePlaceName } from '../placeNormalization'

export const COVER_STUDIO_SCOPE = 'front-cover'
export const TELANGANA_EMBLEM_SHADOW_PATH = 'telangana-emblem.svg'

let bundledEmblemBase64 = ''

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Seed artwork that ships with the app; copied into each `.eestimate` once. */
export function bundledTelanganaEmblemBase64(): string {
  if (!bundledEmblemBase64) bundledEmblemBase64 = utf8ToBase64(telanganaEmblemSvg)
  return bundledEmblemBase64
}

export function telanganaEmblemBase64(project?: EestimateProject): string {
  return project?.printStudioShadowFiles?.[TELANGANA_EMBLEM_SHADOW_PATH]
    || bundledTelanganaEmblemBase64()
}

/** Write the emblem into the project file payload when it is missing. */
export function ensureProjectHasCoverEmblem(project: EestimateProject): EestimateProject {
  if (project.printStudioShadowFiles?.[TELANGANA_EMBLEM_SHADOW_PATH]) return project
  return {
    ...project,
    printStudioShadowFiles: {
      ...(project.printStudioShadowFiles ?? {}),
      [TELANGANA_EMBLEM_SHADOW_PATH]: bundledTelanganaEmblemBase64()
    }
  }
}

function telanganaEmblemGalleryItem(project?: EestimateProject) {
  const data = telanganaEmblemBase64(project)
  return {
    id: 'telangana-emblem',
    name: 'Telangana emblem',
    path: TELANGANA_EMBLEM_SHADOW_PATH,
    width: 152,
    height: 152,
    type: 'drawing' as const,
    typstSnippet: `#image("${TELANGANA_EMBLEM_SHADOW_PATH}", width: 36mm, height: 36mm, fit: "contain")`,
    previewUrl: `data:image/svg+xml;base64,${data}`
  }
}

function typstText(value: string): string {
  return value.replace(/([\\#\[\]])/g, '\\$1')
}

export function normalizeSavedCoverTypst(source: string): string {
  return source.replace(
    /(\[#text\([^)]*?\)\s*\[(?:VILLAGE|MANDAL|DISTRICT)\]\],\s*\[)([^\]\r\n]+)(\])/g,
    (_, prefix, val, suffix) => `${prefix}${normalizePlaceName(val)}${suffix}`
  )
}

export function coverTypstTemplate(project: EestimateProject): string {
  const location = project.meta.areaAllowance
  const village = normalizePlaceName(location?.village) || '____________________________'
  const mandal = normalizePlaceName(location?.mandal) || '____________________________'
  const district =
    normalizePlaceName(location?.district || project.meta.location?.label) ||
    '____________________________'
  const literals: Record<string, string> = {
    '[PROJECT_NAME]': project.meta.name || 'NAME OF PROJECT',
    '[VILLAGE_NAME]': village,
    '[MANDAL_NAME]': mandal,
    '[DISTRICT_NAME]': district,
    '[SSR_YEAR]': project.meta.sorYear || '____________________________'
  }
  return Object.entries(literals).reduce(
    (source, [token, value]) => source.replace(token, typstText(value)),
    coverTemplate
  )
}

function compactEstimatedCost(value: number): string {
  const format = (amount: number, suffix: string): string => {
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2
    return `₹ ${amount.toLocaleString('en-IN', { maximumFractionDigits: digits })} ${suffix}`
  }
  if (value >= 10_000_000) return format(value / 10_000_000, 'Cr')
  if (value >= 100_000) return format(value / 100_000, 'Lakh')
  if (value >= 1_000) return format(value / 1_000, 'Thousand')
  return `₹ ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function coverEstimatedCost(project: EestimateProject): string {
  const cost = resolveProjectEstimatedCost(project) ?? project.meta.estimatedCost ?? null
  return cost == null ? '—' : compactEstimatedCost(cost)
}

export function coverRenderData(project: EestimateProject) {
  return {
    estimated_cost: coverEstimatedCost(project),
    gallery: [telanganaEmblemGalleryItem(project)]
  }
}

export function coverCompileInputs(project: EestimateProject): Record<string, string> {
  return { 'ee-cover': JSON.stringify({ estimated_cost: coverEstimatedCost(project) }) }
}

export function coverShadowFiles(project?: EestimateProject): Record<string, string> {
  return {
    ...(project?.printStudioShadowFiles ?? {}),
    [TELANGANA_EMBLEM_SHADOW_PATH]: telanganaEmblemBase64(project)
  }
}

export function coverDocumentSettings(project: EestimateProject, node: ProjectNode) {
  const base = resolveProjectDocumentSettings(project.projectPrintSettings)
  const inherited = resolveNodeSettings(project.root, node.id)
  return normalizeDocumentSettings({
    pageSize: inherited.pageSize ?? 'A4',
    orientation: 'portrait',
    margins: inherited.margins
  }, base)
}

export function resolvedCoverTypstSource(project: EestimateProject, node: ProjectNode): string {
  const saved = project.printStudioDocuments?.[COVER_STUDIO_SCOPE]
  if (saved !== undefined) return saved
  const source = saved ?? coverTypstTemplate(project)
  const settings = project.printStudioDocumentSettings?.[COVER_STUDIO_SCOPE]
    ?? coverDocumentSettings(project, node)
  return applyDocumentSettingsToTypst(source, settings)
}
