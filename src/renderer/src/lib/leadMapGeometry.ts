import type { CSSProperties } from 'react'
import type { NormalizedLeadPrintSettings } from './leadPrintLayout'
import type { PaperSize, SignatureFooterSettings } from '../types/project'
import { PX_PER_MM } from './printRender'

/** Raster resolution for map capture and Typst image embedding. */
export const LEAD_MAP_PRINT_DPI = 300

export const LEAD_MAP_IMAGE_PATH = 'images/lead-route-map.png'
export const LEAD_MAP_TILE_CACHE_PREFIX = 'images/lead-map-cache/'

const HEADER_RULE_MM = 8
const TITLE_LINE_MM = 8
const SUBTITLE_LINE_MM = 5
const SIGNATURE_BLOCK_MM = 22

export interface LeadMapMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface LeadMapPageGeometry {
  paper: PaperSize
  flipped: boolean
  page: { widthMm: number; heightMm: number }
  margins: LeadMapMargins
  content: { widthMm: number; heightMm: number }
  header: { show: boolean; heightMm: number }
  mapBox: { widthMm: number; heightMm: number; widthPercent: number; fixedHeightMm: number }
  signatureReservedMm: number
}

export function paperSizeMm(size: PaperSize): { width: number; height: number } {
  if (size === 'A2') return { width: 420, height: 594 }
  if (size === 'A3') return { width: 297, height: 420 }
  if (size === 'Letter') return { width: 216, height: 279 }
  if (size === 'Legal') return { width: 216, height: 356 }
  return { width: 210, height: 297 }
}

function signatureBottomMargin(
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings
): number {
  if (signatureFooter?.enabled && signatureFooter.placement === 'every_page') {
    return Math.max(layout.margins.bottom, 28)
  }
  return layout.margins.bottom
}

function estimateHeaderHeightMm(layout: NormalizedLeadPrintSettings): number {
  if (!layout.showMapHeader) return 0
  const subtitle = layout.mapSubtitle.trim()
  return HEADER_RULE_MM + TITLE_LINE_MM + (subtitle ? SUBTITLE_LINE_MM : 0)
}

/**
 * Single source of truth for map-page paper, margins, and map-frame geometry.
 * Used by the React preview (`mapPageStyle`) and Typst compile inputs.
 */
export function computeLeadMapPageGeometry(
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings,
  interactive = true
): LeadMapPageGeometry {
  const size = paperSizeMm(layout.mapPageSize)
  const flipped = layout.pages.map.orientation === 'landscape'
  const pageWidthMm = flipped ? size.height : size.width
  const pageHeightMm = flipped ? size.width : size.height
  const margins: LeadMapMargins = {
    top: layout.margins.top,
    right: layout.margins.right,
    bottom: signatureBottomMargin(layout, signatureFooter),
    left: layout.margins.left
  }
  const contentWidthMm = pageWidthMm - margins.left - margins.right
  const contentHeightMm = pageHeightMm - margins.top - margins.bottom
  const headerHeightMm = estimateHeaderHeightMm(layout)
  const signatureReservedMm =
    signatureFooter?.enabled && signatureFooter.placement === 'every_page'
      ? SIGNATURE_BLOCK_MM
      : 0
  const widthPercent = interactive ? layout.mapBoxWidthPercent : 100
  const fixedHeightMm = layout.mapBoxHeightMm
  const mapWidthMm = contentWidthMm * widthPercent / 100
  const mapHeightMm = fixedHeightMm > 0
    ? fixedHeightMm
    : Math.max(40, contentHeightMm - headerHeightMm - signatureReservedMm)

  return {
    paper: layout.mapPageSize,
    flipped,
    page: { widthMm: pageWidthMm, heightMm: pageHeightMm },
    margins,
    content: { widthMm: contentWidthMm, heightMm: contentHeightMm },
    header: { show: layout.showMapHeader, heightMm: headerHeightMm },
    mapBox: {
      widthMm: mapWidthMm,
      heightMm: mapHeightMm,
      widthPercent,
      fixedHeightMm
    },
    signatureReservedMm
  }
}

/** CSS for the outer `.lead-print-page.map-page` shell — mirrors Typst page setup. */
export function mapPageStyle(
  layout: NormalizedLeadPrintSettings,
  signatureFooter?: SignatureFooterSettings
): CSSProperties {
  const geometry = computeLeadMapPageGeometry(layout, signatureFooter, true)
  return {
    width: `${geometry.page.widthMm}mm`,
    height: `${geometry.page.heightMm}mm`,
    minHeight: `${geometry.page.heightMm}mm`,
    overflow: 'hidden',
    padding: `${geometry.margins.top}mm ${geometry.margins.right}mm ${geometry.margins.bottom}mm ${geometry.margins.left}mm`
  }
}

export function mmToPrintPx(mm: number): number {
  return Math.max(1, Math.round(mm * LEAD_MAP_PRINT_DPI / 25.4))
}

export function leadMapCapturePixels(
  geometry: LeadMapPageGeometry,
  mapElement: HTMLElement
): { widthPx: number; heightPx: number; pixelRatio: number } {
  const widthPx = mmToPrintPx(geometry.mapBox.widthMm)
  const heightPx = mmToPrintPx(geometry.mapBox.heightMm)
  const displayWidth = Math.max(1, mapElement.offsetWidth)
  const displayHeight = Math.max(1, mapElement.offsetHeight)
  const pixelRatio = Math.max(
    widthPx / displayWidth,
    heightPx / displayHeight,
    LEAD_MAP_PRINT_DPI / (PX_PER_MM * 25.4)
  )
  return { widthPx, heightPx, pixelRatio }
}
