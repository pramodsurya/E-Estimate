/**
 * Front Page (cover) Excel payload — native rust_xlsxwriter path, no ExcelJS.
 *
 * Mirrors the Typst algorithm in `../typist-output/cover.typ` fed by
 * `coverExcelFields`: government header, work name, estimated-cost box and
 * the village/mandal/district/SSR-year table, stacked center-aligned. The
 * exact Typst emblem asset is rasterized once for rust_xlsxwriter.
 */
import type { EestimateProject } from '../../types/project'
import { coverExcelFields, telanganaEmblemSvg } from '../typist-output/coverTypst'
import { rasterizeSvg } from './svgRaster'

export interface CoverExcelPayload {
  workName: string
  village: string
  mandal: string
  district: string
  ssrYear: string
  estimatedCost: string
  emblemBase64?: string
}

export async function buildCoverExcelPayload(project: EestimateProject): Promise<CoverExcelPayload> {
  const fields = coverExcelFields(project)
  const emblem = await rasterizeSvg(telanganaEmblemSvg(project), 144)
  return {
    workName: fields.workName,
    village: fields.village,
    mandal: fields.mandal,
    district: fields.district,
    ssrYear: fields.ssrYear,
    estimatedCost: fields.estimatedCost,
    emblemBase64: emblem?.dataBase64
  }
}

export function coverExcelFileName(projectName: string): string {
  const clean = (projectName || '').replace(/[\\/:*?"<>|]/g, '').trim() || 'Estimate'
  return `${clean} — Front Page.xlsx`
}
