import type { NormalizedLeadPrintSettings } from '../leadPrintLayout'
import type { EestimateProject, SignatureFooterSettings } from '../../types/project'
import { LEAD_MAP_IMAGE_PATH } from '../leadMapGeometry'
import { captureLeadMapPng, prepareLeadMapForCapture } from '../leadMapCapture'
import {
  applyLeadMapLayoutToTypst,
  extractLeadMapPageTypst,
  LEAD_MAP_PAGE_BEGIN,
  leadMapCaptureFromProject,
  leadTypstTemplate
} from './leadTypst'

export function leadMapShadowFiles(pngDataUrl: string): Record<string, string> {
  return { [LEAD_MAP_IMAGE_PATH]: pngDataUrl }
}

/** Map-only Typst extracted from lead.typ after GUI layout injection. */
export function resolvedLeadMapTypstSource(
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings,
  interactive = true
): string {
  return extractLeadMapPageTypst(
    applyLeadMapLayoutToTypst(leadTypstTemplate(), layout, signatureFooter, interactive)
  )
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Capture the map frame, compile the map page from lead.typ, return PDF bytes. */
export async function compileLeadMapPdfFromPage({
  pageRoot,
  layout,
  signatureFooter,
  interactive = true,
  onPhase = () => undefined,
  capture
}: {
  pageRoot: HTMLElement | null
  layout: NormalizedLeadPrintSettings
  signatureFooter?: SignatureFooterSettings
  interactive?: boolean
  onPhase?: (detail: string) => void
  capture?: { dataUrl: string; widthPx: number; heightPx: number }
}): Promise<Uint8Array> {
  let png = capture
  if (!png) {
    onPhase('Waiting for map tiles…')
    await prepareLeadMapForCapture(pageRoot)
    onPhase('Capturing route map…')
    png = await captureLeadMapPng(pageRoot, layout, signatureFooter, interactive)
  }
  onPhase('Compiling map PDF with Typst…')
  const result = await window.api.typst.compile(
    resolvedLeadMapTypstSource(layout, signatureFooter, interactive),
    {},
    leadMapShadowFiles(png.dataUrl)
  )
  if (!result.ok || !result.data) {
    throw new Error(result.error || 'Map PDF generation failed.')
  }
  return decodeBase64(result.data)
}

/** Base64 PDF for export IPC. */
export async function compileLeadMapPdfBase64FromPage(
  options: Parameters<typeof compileLeadMapPdfFromPage>[0]
): Promise<string> {
  const bytes = await compileLeadMapPdfFromPage(options)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Compile the map page from Typst saved by Map Print Studio Save. */
export async function compileSavedLeadMapPdf(project: EestimateProject): Promise<Uint8Array> {
  const png = leadMapCaptureFromProject(project)
  const saved = project.printStudioDocuments?.['lead-statement']
  if (!png || !saved?.includes(LEAD_MAP_PAGE_BEGIN)) {
    throw new Error('Save the map before printing.')
  }
  const result = await window.api.typst.compile(
    extractLeadMapPageTypst(saved),
    {},
    leadMapShadowFiles(png.dataUrl)
  )
  if (!result.ok || !result.data) {
    throw new Error(result.error || 'Map PDF generation failed.')
  }
  return decodeBase64(result.data)
}
