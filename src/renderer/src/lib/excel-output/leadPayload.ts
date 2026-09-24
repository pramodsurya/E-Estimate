import { buildLeadRenderData, leadMapCaptureFromProject } from '../typist-output/leadTypst'
import type { CompiledLeadDashboardEntry, EestimateProject } from '../../types/project'

function weightedRateCurve(project: EestimateProject, variantId: string) {
  const variant = project.leadChart?.variants?.find((candidate) => candidate.id === variantId)
  if (!variant?.weightedLead || variant.rateSource !== 'chart') return null
  const rows = project.dashboardSnapshot?.leadRates ?? []
  const rate = (chargeCode: string, slabKey: string): number | null => {
    const row = rows.find(
      (candidate) =>
        candidate.charge_code === chargeCode &&
        candidate.slab_key === slabKey &&
        candidate.applies_to.includes(variant.conveyanceClass)
    )
    return row && Number.isFinite(row.rate) ? row.rate : null
  }
  const values = {
    head100m: rate('COM-LDLFT-1', 'upto_100m'),
    head150m: rate('COM-LDLFT-1', 'upto_150m'),
    upto1km: rate('COM-LDLFT-2', 'upto_1km'),
    upto2km: rate('COM-LDLFT-2', 'upto_2km'),
    upto3km: rate('COM-LDLFT-2', 'upto_3km'),
    upto4km: rate('COM-LDLFT-2', 'upto_4km'),
    upto5km: rate('COM-LDLFT-2', 'upto_5km'),
    perKm5To30: rate('COM-LDLFT-2', 'per_km_5_30'),
    perKmBeyond30: rate('COM-LDLFT-2', 'per_km_beyond_30')
  }
  return Object.values(values).every((value) => typeof value === 'number') ? values : null
}

/**
 * Build the native Lead Statement payload once for both the standalone Lead
 * export and the combined Project workbook. `key` is the stable variant id
 * used by the DATA sheets to reference the matching Lead summary rate cell.
 */
export function buildLeadExcelPayload(
  project: EestimateProject,
  entries: CompiledLeadDashboardEntry[]
) {
  const data = buildLeadRenderData(project, entries, leadMapCaptureFromProject(project))
  const variantsById = new Map((project.leadChart?.variants ?? []).map((variant) => [variant.id, variant]))
  return {
    project: data.project,
    title: data.title,
    subtitle: data.subtitle,
    year: data.year,
    zone: data.zone,
    notes: data.notes,
    rows: data.rows.map((item, index) => ({
      key: entries[index]?.variantId || '',
      sl: item.sl,
      name: item.name,
      quarry: item.quarry,
      conveyanceClass: item.conveyance_class,
      leadKm: item.lead_km,
      liftM: item.lift_m,
      rate: item.rate,
      uses: item.uses,
      leadTypeTag: item.lead_type_tag ?? null
    })),
    materials: data.breakdowns.map((material, materialIndex) => ({
      key: entries[materialIndex]?.variantId || '',
      sl: material.sl,
      name: material.name,
      leadKm: material.lead_km,
      leadTypeTag: material.lead_type_tag ?? null,
      route: material.route,
      rateUnit: material.rate_unit,
      liftM: material.lift_m ?? null,
      chargedLiftM: material.charged_lift_m ?? null,
      rate: material.rate,
      avgLead: material.avg_lead
        ? {
            modeLabel: material.avg_lead.mode_label,
            componentName: material.avg_lead.component_name,
            pointCount: material.avg_lead.point_count,
            avgKmText: material.avg_lead.avg_km_text,
            routes: material.avg_lead.routes.map((point) => ({
              index: point.index,
              chainageText: point.chainage_text,
              chainageM: point.chainage_m ?? null,
              routeKmText: point.route_km_text,
              routeKm: point.route_km ?? null
            }))
          }
        : null,
      weightedLead: material.weighted_lead
        ? {
            formula: material.weighted_lead.formula,
            entries: material.weighted_lead.entries.map((entry, entryIndex) => ({
              key:
                variantsById.get(entries[materialIndex]?.variantId)?.weightedLead?.entries[entryIndex]
                  ?.variantId || '',
              name: entry.name,
              leadKm: entry.lead_km,
              quantityText: entry.quantity_text,
              unit: entry.unit,
              product: entry.product
            })),
            totalQuantityText: material.weighted_lead.total_quantity_text,
            weightedAvgKmText: material.weighted_lead.weighted_avg_km_text
          }
        : null,
      weightedRateCurve: weightedRateCurve(project, entries[materialIndex]?.variantId || ''),
      steps: material.steps.map((step) => ({
        label: step.label,
        expression: step.expression,
        amount: step.amount,
        amountValue: step.amount_value
      })),
      calculation: material.calculation
        ? {
            leadRate: material.calculation.leadRate,
            loadingRate: material.calculation.loadingRate,
            unloadingRate: material.calculation.unloadingRate,
            liftRate: material.calculation.liftRate
          }
        : null
    })),
    signature: data.signature.map((sig) => ({
      designation: sig.designation,
      office: sig.office
    }))
  }
}
