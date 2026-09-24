import type { EestimateProject, ProjectNode } from '../../types/project'
import { resolveProjectEstimatedCost } from '../projectPrintInputs'
import { resolveNodeSettings } from '../nodeSettings'
import {
  applyDocumentSettingsToTypst,
  normalizeDocumentSettings,
  resolveProjectDocumentSettings
} from './documentSettings'
import coverTemplate from './cover.typ?raw'
import bundledTelanganaEmblemSvg from '../../assets/emblem-telangana.svg?raw'
import { normalizePlaceName } from '../placeNormalization'
import { resolveProjectPrintLocation } from '../printLocation'

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
  if (!bundledEmblemBase64) bundledEmblemBase64 = utf8ToBase64(bundledTelanganaEmblemSvg)
  return bundledEmblemBase64
}

export function telanganaEmblemBase64(project?: EestimateProject): string {
  return project?.printStudioShadowFiles?.[TELANGANA_EMBLEM_SHADOW_PATH]
    || bundledTelanganaEmblemBase64()
}

/** The exact cover artwork as SVG text, including a project-stored override. */
export function telanganaEmblemSvg(project?: EestimateProject): string {
  const binary = atob(telanganaEmblemBase64(project))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
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

/**
 * Drop the VILLAGE/MANDAL/DISTRICT rows from a cover source (default template
 * or a saved studio copy whose tokens were already substituted). The SSR YEAR
 * row stays, and Typst/Excel flows that follow use `#v(1fr)` / packed rows, so
 * no blank space is reserved for the missing location.
 */
export function stripCoverLocationRows(source: string): string {
  return source.replace(
    /^[ \t]*\[#text\([^\r\n]*\[(?:VILLAGE|MANDAL|DISTRICT)\]\]\],[ \t]*\[[^\r\n]*\],[ \t]*\r?\n?/gm,
    ''
  )
}

export function coverTypstTemplate(project: EestimateProject): string {
  const fields = coverExcelFields(project)
  const literals: Record<string, string> = {
    '[PROJECT_NAME]': fields.workName,
    '[VILLAGE_NAME]': fields.village,
    '[MANDAL_NAME]': fields.mandal,
    '[DISTRICT_NAME]': fields.district,
    '[SSR_YEAR]': fields.ssrYear
  }
  const source = Object.entries(literals).reduce(
    (text, [token, value]) => text.replace(token, typstText(value)),
    coverTemplate
  )
  return resolveProjectPrintLocation(project).samePlace ? source : stripCoverLocationRows(source)
}

/**
 * Saved cover sources override the default template, so they need the same
 * treatment: hide the location rows when the components sit in different
 * places, otherwise leave the user's saved copy untouched.
 */
export function resolveSavedCoverSource(project: EestimateProject, saved: string): string {
  return resolveProjectPrintLocation(project).samePlace ? saved : stripCoverLocationRows(saved)
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

/** Resolved cover strings, shared by the Typst template and the Excel port. */
export interface CoverExcelFields {
  workName: string
  village: string
  mandal: string
  district: string
  ssrYear: string
  estimatedCost: string
}

const COVER_BLANK = '____________________________'

export function coverExcelFields(project: EestimateProject): CoverExcelFields {
  // Shared by the Typst template above and every Excel wire (front-page
  // workbook, project dashboard cover): when the components sit in different
  // places the location resolves to '' so each renderer omits it entirely
  // instead of printing underscore fillers or blank rows.
  const place = resolveProjectPrintLocation(project)
  return {
    workName: project.meta.name || 'NAME OF PROJECT',
    village: place.samePlace ? place.village || COVER_BLANK : '',
    mandal: place.samePlace ? place.mandal || COVER_BLANK : '',
    district: place.samePlace ? place.district || COVER_BLANK : '',
    ssrYear: project.meta.sorYear || COVER_BLANK,
    estimatedCost: coverEstimatedCost(project)
  }
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
  if (saved !== undefined) return resolveSavedCoverSource(project, saved)
  const source = saved ?? coverTypstTemplate(project)
  const settings = project.printStudioDocumentSettings?.[COVER_STUDIO_SCOPE]
    ?? coverDocumentSettings(project, node)
  return applyDocumentSettingsToTypst(source, settings)
}
