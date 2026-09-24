import type { EestimateProject } from '../../types/project'
import type { SeigniorageCalculation } from '../seigniorage'
import { groupByMat } from '../seignioragePrintLayout'
import {
  resolveSeigniorageGroupHeading,
  resolveSeigniorageGroupSubtotal,
  resolveSeigniorageRowDescription
} from '../typist-output/seigniorageTypst'
import { resolveSignatureFooter, SEIGNIORAGE_SIGNATURE_SCOPE } from '../signatureFooter'

const DEFAULT_PERMIT_BASIS = 'G.O.Ms.No.21, dt. 31.03.2022, w.e.f. 01.04.2022'

/** Shared native payload used by both standalone and whole-project Excel. */
export function buildSeigniorageExcelPayload(
  project: EestimateProject,
  calculation: SeigniorageCalculation
) {
  const overrides = project.seignioragePrintOverrides
  const signature = resolveSignatureFooter(project, SEIGNIORAGE_SIGNATURE_SCOPE)
  return {
    projectName: overrides?.title || project.meta.name || project.root.name || 'Detailed Estimate',
    sorYear: overrides?.year || project.meta.sorYear || '2025-26',
    permitBasis: overrides?.permitBasis || DEFAULT_PERMIT_BASIS,
    groups: groupByMat(calculation.rows).map((group) => ({
      key: group.key,
      heading: resolveSeigniorageGroupHeading(project, group),
      subtotalLabel: resolveSeigniorageGroupSubtotal(project, group),
      rows: group.rows.map((row) => ({
        key: row.id,
        itemCode: row.itemCode || '',
        description: resolveSeigniorageRowDescription(project, row),
        workQty: row.itemQuantity ?? null,
        workUnit: row.itemUnit || '',
        seigQty: row.quantity ?? null,
        seigUnit: row.unit || row.recipeMaterialUnit || '',
        rate: row.seigRate ?? null,
        seigniorage: row.seigniorage ?? null,
        dmft: row.dmft ?? null,
        smft: row.smft ?? null,
        permit: row.permit ?? null,
        permitPercent: row.permitPercent || 0,
        permitNote:
          row.permit == null
            ? ''
            : row.permitPercent === 0
              ? 'Exempt'
              : `@ ${row.permitPercent}%`
      }))
    })),
    totals: {
      totalSeigniorage: calculation.totalSeigniorage,
      totalDmft: calculation.totalDmft,
      totalSmft: calculation.totalSmft,
      totalPermit: calculation.totalPermit,
      grandTotal: calculation.grandTotal,
      roundedGrandTotal: calculation.roundedGrandTotal
    },
    signatures: signature?.enabled
      ? signature.rows
          .filter((row) => row.designation.trim() !== '' || row.office.trim() !== '')
          .map((row) => ({ designation: row.designation, office: row.office }))
      : []
  }
}
