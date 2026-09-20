use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Once;
use std::time::Instant;

use base64::Engine;
use rust_xlsxwriter::{
    Color, Format, FormatAlign, FormatBorder, Workbook, XlsxError,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone, Default)]
pub struct CostTableLine {
    #[serde(default)]
    pub sl: Option<serde_json::Value>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub quantity: Option<serde_json::Value>,
    #[serde(default)]
    pub rate: Option<serde_json::Value>,
    #[serde(default)]
    pub amount: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct Totals {
    #[serde(default, alias = "outputQuantity")]
    pub output_quantity: Option<f64>,
    #[serde(default, alias = "materialTotal")]
    pub material_total: Option<f64>,
    #[serde(default, alias = "machineryTotal")]
    pub machinery_total: Option<f64>,
    #[serde(default, alias = "labourTotal")]
    pub labour_total: Option<f64>,
    #[serde(default, alias = "overheadPercent")]
    pub overhead_percent: Option<f64>,
    #[serde(default, alias = "overheadAmount")]
    pub overhead_amount: Option<f64>,
    #[serde(default, alias = "baseCost")]
    pub base_cost: Option<f64>,
    #[serde(default, alias = "totalCost")]
    pub total_cost: Option<f64>,
    #[serde(default, alias = "ratePerUnit")]
    pub rate_per_unit: Option<f64>,
    #[serde(default, alias = "labourUnitBase")]
    pub labour_unit_base: Option<f64>,
    #[serde(default, alias = "labourUnitProfit")]
    pub labour_unit_profit: Option<f64>,
    #[serde(default, alias = "labourUnitTotal")]
    pub labour_unit_total: Option<f64>,
    #[serde(default, alias = "areaAllowancePercent")]
    pub area_allowance_percent: Option<f64>,
    #[serde(default, alias = "areaAllowanceAmount")]
    pub area_allowance_amount: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LabourSummaryRow {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub percent: Option<String>,
    #[serde(default)]
    pub amount: serde_json::Value,
    #[serde(default)]
    pub kind: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct AbstractRow {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub basis: Option<String>,
    #[serde(default)]
    pub qualifier: Option<String>,
    #[serde(default)]
    pub amount: serde_json::Value,
    #[serde(default, alias = "isCaption")]
    pub is_caption: Option<bool>,
    #[serde(default, alias = "isRate")]
    pub is_rate: Option<bool>,
    #[serde(default, alias = "isTotal")]
    pub is_total: Option<bool>,
    #[serde(default, alias = "isTotalCost")]
    pub is_total_cost: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadDeduction {
    #[serde(default)]
    pub label: String,
    #[serde(default, alias = "netRateText")]
    pub net_rate_text: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadRow {
    #[serde(default)]
    #[allow(dead_code)]
    pub sl: Option<serde_json::Value>,
    #[serde(default)]
    pub material: Option<String>,
    #[serde(default, alias = "distanceKm")]
    pub distance_km: Option<f64>,
    #[serde(default, alias = "liftM")]
    pub lift_m: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub quantity: Option<serde_json::Value>,
    #[serde(default)]
    pub rate: Option<serde_json::Value>,
    #[serde(default)]
    pub amount: Option<serde_json::Value>,
    #[serde(default)]
    pub deduction: Option<LeadDeduction>,
    #[serde(default, alias = "leadTypeTag")]
    pub lead_type_tag: Option<String>,
    #[serde(default, alias = "leadFormula")]
    pub lead_formula: Option<String>,
    #[serde(default, alias = "quantitySource")]
    pub quantity_source: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadSummary {
    #[serde(default, alias = "baseAmountText")]
    pub base_amount_text: Option<String>,
    #[serde(default, alias = "leadTotalText")]
    pub lead_total_text: Option<String>,
    #[serde(default, alias = "finalAmountText")]
    pub final_amount_text: Option<String>,
    #[serde(default, alias = "finalRateText")]
    pub final_rate_text: Option<String>,
    #[serde(default, alias = "disposalOnly")]
    pub disposal_only: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct OptionalAddition {
    #[serde(default)]
    pub label: String,
    #[serde(default, alias = "outputQuantityText")]
    pub output_quantity_text: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default, alias = "totalCostText")]
    pub total_cost_text: Option<String>,
    #[serde(default, alias = "baseRateText")]
    pub base_rate_text: Option<String>,
    #[serde(default, alias = "addonRateText")]
    pub addon_rate_text: Option<String>,
    #[serde(default, alias = "adoptedRateText")]
    pub adopted_rate_text: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RateVariant {
    #[serde(default, alias = "selectedLabel")]
    pub selected_label: Option<String>,
    #[serde(default, alias = "baseLabel")]
    pub base_label: Option<String>,
    #[serde(default)]
    pub percent: Option<f64>,
    #[serde(default, alias = "baseRateText")]
    pub base_rate_text: Option<String>,
    #[serde(default, alias = "additionText")]
    pub addition_text: Option<String>,
    #[serde(default, alias = "adoptedRateText")]
    pub adopted_rate_text: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct MultiRateNote {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub note: String,
    #[serde(default, alias = "adoptedRateText")]
    pub adopted_rate_text: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ExcelRecipe {
    pub code: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default, alias = "sectionHeading")]
    pub section_heading: Option<String>,
    #[serde(default, alias = "documentTitle")]
    pub document_title: Option<String>,
    #[serde(default, alias = "multiRateNote")]
    pub multi_rate_note: Option<MultiRateNote>,
    #[serde(default)]
    pub materials: Vec<CostTableLine>,
    #[serde(default)]
    pub machinery: Vec<CostTableLine>,
    #[serde(default)]
    pub labour: Vec<CostTableLine>,
    #[serde(default)]
    pub totals: Option<Totals>,
    #[serde(default, alias = "labourSummaryRows")]
    pub labour_summary_rows: Option<Vec<LabourSummaryRow>>,
    #[serde(default, alias = "abstractRows")]
    pub abstract_rows: Option<Vec<AbstractRow>>,
    #[serde(default)]
    pub leads: Option<Vec<LeadRow>>,
    #[serde(default, alias = "leadSummary")]
    pub lead_summary: Option<LeadSummary>,
    #[serde(default, alias = "optionalAddition")]
    pub optional_addition: Option<OptionalAddition>,
    #[serde(default, alias = "rateVariant")]
    pub rate_variant: Option<RateVariant>,
    #[serde(default, alias = "areaAllowanceLabel")]
    pub area_allowance_label: Option<String>,
    #[serde(default, alias = "scopeLabel")]
    pub scope_label: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ExcelSorItem {
    #[serde(default)]
    pub sl: usize,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub rate: Option<f64>,
    #[serde(default, alias = "rateText")]
    pub rate_text: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct ExcelCompileRequest {
    #[serde(default, alias = "projectName")]
    pub project_name: Option<String>,
    #[serde(default, alias = "sorYear")]
    pub sor_year: Option<String>,
    #[serde(default, alias = "sorZone")]
    #[allow(dead_code)]
    pub sor_zone: Option<String>,
    #[serde(default)]
    pub recipes: Vec<ExcelRecipe>,
    #[serde(default)]
    pub sor: Vec<ExcelSorItem>,
    /// Workbook selector. A missing value falls back to `data` so the
    /// existing DATA-sheet callers keep working unchanged.
    #[serde(default)]
    pub kind: ExcelKind,
    /// Kind-specific workbook data. Only the payload matching `kind` is read;
    /// the `data` path ignores all four (existing behaviour is unchanged).
    #[serde(default)]
    pub boq: Option<BoqPayload>,
    #[serde(default)]
    pub comparative: Option<ComparativePayload>,
    #[serde(default)]
    pub seigniorage: Option<SeignioragePayload>,
    #[serde(default)]
    pub lead: Option<LeadPayload>,
    /// When true, the workbook is written to the session cache dir and the
    /// result carries `filePath` instead of base64 `data`. Old callers get
    /// exactly today's base64 behavior.
    #[serde(default, alias = "preferPath")]
    pub prefer_path: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelCompileResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
}

fn val_to_f64(v: &Option<serde_json::Value>) -> f64 {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(serde_json::Value::String(s)) => {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            cleaned.parse::<f64>().unwrap_or(0.0)
        }
        _ => 0.0,
    }
}

fn val_to_string(v: &Option<serde_json::Value>) -> String {
    match v {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn parse_amount_val(v: &serde_json::Value) -> Result<f64, String> {
    match v {
        serde_json::Value::Number(n) => n.as_f64().ok_or_else(|| "not a valid float".into()),
        serde_json::Value::String(s) => {
            let cleaned: String = s
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            cleaned.parse::<f64>().map_err(|e| e.to_string())
        }
        _ => Err("not a number".into()),
    }
}

// ============================================================================
// Workbook kind discriminator + kind-specific payloads.
// JSON shape per kind (camelCase aliases accepted everywhere):
//   data        -> existing { projectName, sorYear, sorZone, recipes, sor }
//   boq         -> { projectName, componentName, isSubcomponent,
//                   rows: [{ sl, code, heading, description,
//                            quantity|null, unit, rate|null, amount|null }],
//                   totalCost }
//   comparative -> { projectName, rootName?, leftYear, rightYear, wholeEstimate,
//                   warnings: [{ message, detail? }],
//                   abstractRows, components: [{ name, rows,
//                     leftTotal, rightTotal, difference, percent }],
//                   leadRows }
//                 row = { slNo, label, description?, unit?, quantity|null,
//                         leftRate|null, rightRate|null, left|null, right|null,
//                         difference, percent|null, kind }
//   seigniorage -> { projectName, sorYear, permitBasis?,
//                   groups: [{ key, heading?, subtotalLabel?,
//                              rows: [{ itemCode, description,
//                                       workQty|null, workUnit,
//                                       seigQty|null, seigUnit, rate|null,
//                                       seigniorage, dmft, smft, permit,
//                                       permitPercent, permitNote? }] }],
//                   totals: { seigniorage, dmft, smft, permit,
//                             grandTotal, roundedGrandTotal },
//                   signatures: [{ designation, office }] }
//   lead        -> { project, title, subtitle, year, zone, notes?,
//                   rows: [{ sl, name, quarry, conveyanceClass,
//                            leadKm, liftM, rate, uses, leadTypeTag? }],
//                   materials: [{ sl, name, leadKm, leadTypeTag?, route,
//                                 rateUnit, liftM?, chargedLiftM?, rate,
//                                 avgLead?, weightedLead?, steps,
//                                 calculation? }],
//                   signatures: [{ designation, office }] }
// Lead numeric fields accept a JSON number or the TS display string
// ("28.50 km", "Rs. 1,234.50"); the first numeric token is used.
// Seigniorage descriptions, group headings and permit notes are pre-resolved
// by the frontend (resolveSeigniorageRowDescription / GroupHeading /
// signature footer) and passed through verbatim.
// ============================================================================

#[derive(Debug, Deserialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExcelKind {
    #[default]
    Data,
    Boq,
    Comparative,
    Seigniorage,
    Lead,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct BoqRowPayload {
    #[serde(default)]
    pub sl: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub heading: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub quantity: Option<f64>,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub rate: Option<f64>,
    #[serde(default)]
    pub amount: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct BoqPayload {
    #[serde(default, alias = "projectName")]
    pub project_name: String,
    #[serde(default, alias = "componentName")]
    pub component_name: String,
    #[serde(default, alias = "isSubcomponent")]
    pub is_subcomponent: bool,
    #[serde(default)]
    pub rows: Vec<BoqRowPayload>,
    #[serde(default, alias = "totalCost")]
    pub total_cost: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComparativeRowPayload {
    #[serde(default, alias = "slNo")]
    pub sl_no: Option<serde_json::Value>,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub quantity: Option<f64>,
    #[serde(default, alias = "leftRate")]
    pub left_rate: Option<f64>,
    #[serde(default, alias = "rightRate")]
    pub right_rate: Option<f64>,
    #[serde(default)]
    pub left: Option<f64>,
    #[serde(default)]
    pub right: Option<f64>,
    #[serde(default)]
    pub difference: Option<f64>,
    #[serde(default)]
    pub percent: Option<f64>,
    #[serde(default)]
    pub kind: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComparativeComponentPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub rows: Vec<ComparativeRowPayload>,
    #[serde(default, alias = "leftTotal")]
    pub left_total: Option<f64>,
    #[serde(default, alias = "rightTotal")]
    pub right_total: Option<f64>,
    #[serde(default)]
    pub difference: Option<f64>,
    #[serde(default)]
    pub percent: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComparativeWarningPayload {
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComparativePayload {
    #[serde(default, alias = "projectName")]
    pub project_name: String,
    #[serde(default, alias = "rootName")]
    pub root_name: Option<String>,
    #[serde(default, alias = "leftYear")]
    pub left_year: String,
    #[serde(default, alias = "rightYear")]
    pub right_year: String,
    #[serde(default, alias = "wholeEstimate")]
    pub whole_estimate: bool,
    #[serde(default)]
    pub warnings: Vec<ComparativeWarningPayload>,
    #[serde(default, alias = "abstractRows")]
    pub abstract_rows: Vec<ComparativeRowPayload>,
    #[serde(default)]
    pub components: Vec<ComparativeComponentPayload>,
    #[serde(default, alias = "leadRows")]
    pub lead_rows: Vec<ComparativeRowPayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SeigniorageRowPayload {
    #[serde(default, alias = "itemCode")]
    pub item_code: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, alias = "workQty")]
    pub work_qty: Option<f64>,
    #[serde(default, alias = "workUnit")]
    pub work_unit: String,
    #[serde(default, alias = "seigQty")]
    pub seig_qty: Option<f64>,
    #[serde(default, alias = "seigUnit")]
    pub seig_unit: String,
    #[serde(default)]
    pub rate: Option<f64>,
    #[serde(default)]
    pub seigniorage: Option<f64>,
    #[serde(default)]
    pub dmft: Option<f64>,
    #[serde(default)]
    pub smft: Option<f64>,
    #[serde(default)]
    pub permit: Option<f64>,
    #[serde(default, alias = "permitPercent")]
    pub permit_percent: f64,
    #[serde(default, alias = "permitNote")]
    pub permit_note: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SeigniorageGroupPayload {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub heading: Option<String>,
    #[serde(default, alias = "subtotalLabel")]
    pub subtotal_label: Option<String>,
    #[serde(default)]
    pub rows: Vec<SeigniorageRowPayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SeigniorageTotalsPayload {
    #[serde(default, alias = "totalSeigniorage")]
    pub total_seigniorage: f64,
    #[serde(default, alias = "totalDmft")]
    pub total_dmft: f64,
    #[serde(default, alias = "totalSmft")]
    pub total_smft: f64,
    #[serde(default, alias = "totalPermit")]
    pub total_permit: f64,
    #[serde(default, alias = "grandTotal")]
    pub grand_total: f64,
    #[serde(default, alias = "roundedGrandTotal")]
    pub rounded_grand_total: f64,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SignaturePayload {
    #[serde(default)]
    pub designation: String,
    #[serde(default)]
    pub office: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SeignioragePayload {
    #[serde(default, alias = "projectName")]
    pub project_name: String,
    #[serde(default, alias = "sorYear")]
    pub sor_year: String,
    #[serde(default, alias = "permitBasis")]
    pub permit_basis: Option<String>,
    #[serde(default)]
    pub groups: Vec<SeigniorageGroupPayload>,
    #[serde(default)]
    pub totals: SeigniorageTotalsPayload,
    #[serde(default)]
    pub signatures: Vec<SignaturePayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadSummaryRowPayload {
    #[serde(default)]
    pub sl: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub quarry: String,
    #[serde(default, alias = "conveyanceClass")]
    pub class: String,
    #[serde(default, alias = "leadKm")]
    pub lead_km: Option<serde_json::Value>,
    #[serde(default, alias = "liftM")]
    pub lift_m: Option<serde_json::Value>,
    #[serde(default)]
    pub rate: Option<serde_json::Value>,
    #[serde(default)]
    pub uses: String,
    #[serde(default, alias = "leadTypeTag")]
    pub tag: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadAvgRoutePayload {
    #[serde(default)]
    pub index: Option<serde_json::Value>,
    #[serde(default, alias = "chainageText")]
    pub chainage_text: String,
    #[serde(default, alias = "chainageM")]
    pub chainage_m: Option<f64>,
    #[serde(default, alias = "routeKmText")]
    pub route_km_text: String,
    #[serde(default, alias = "routeKm")]
    pub route_km: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadAvgPayload {
    #[serde(default, alias = "modeLabel")]
    pub mode_label: String,
    #[serde(default, alias = "componentName")]
    pub component_name: String,
    #[serde(default, alias = "pointCount")]
    pub point_count: Option<serde_json::Value>,
    #[serde(default, alias = "avgKmText")]
    pub avg_km_text: String,
    #[serde(default)]
    pub routes: Vec<LeadAvgRoutePayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadWeightedEntryPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "leadKm")]
    pub lead_km: Option<serde_json::Value>,
    #[serde(default, alias = "quantityText")]
    pub quantity_text: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub product: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadWeightedPayload {
    #[serde(default)]
    pub formula: String,
    #[serde(default)]
    pub entries: Vec<LeadWeightedEntryPayload>,
    #[serde(default, alias = "totalQuantityText")]
    pub total_quantity_text: String,
    #[serde(default, alias = "weightedAvgKmText")]
    pub weighted_avg_km_text: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadStepPayload {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub expression: String,
    #[serde(default)]
    pub amount: Option<serde_json::Value>,
    #[serde(default, alias = "amountValue")]
    pub amount_value: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadCalcPayload {
    #[serde(default, alias = "leadRate")]
    pub lead_rate: Option<f64>,
    #[serde(default, alias = "loadingRate")]
    pub loading_rate: Option<f64>,
    #[serde(default, alias = "unloadingRate")]
    pub unloading_rate: Option<f64>,
    #[serde(default, alias = "liftRate")]
    pub lift_rate: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadMaterialPayload {
    #[serde(default)]
    pub sl: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "leadKm")]
    pub lead_km_text: String,
    #[serde(default, alias = "leadTypeTag")]
    pub tag: Option<String>,
    #[serde(default)]
    pub route: String,
    #[serde(default, alias = "rateUnit")]
    pub rate_unit: String,
    #[serde(default, alias = "liftM")]
    pub lift_m: Option<serde_json::Value>,
    #[serde(default, alias = "chargedLiftM")]
    pub charged_lift_m: Option<serde_json::Value>,
    #[serde(default)]
    pub rate: Option<serde_json::Value>,
    #[serde(default, alias = "avgLead")]
    pub avg_lead: Option<LeadAvgPayload>,
    #[serde(default, alias = "weightedLead")]
    pub weighted_lead: Option<LeadWeightedPayload>,
    #[serde(default)]
    pub steps: Vec<LeadStepPayload>,
    #[serde(default)]
    pub calculation: Option<LeadCalcPayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadPayload {
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub year: String,
    #[serde(default)]
    pub zone: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub rows: Vec<LeadSummaryRowPayload>,
    #[serde(default)]
    pub materials: Vec<LeadMaterialPayload>,
    #[serde(default)]
    pub signature: Vec<SignaturePayload>,
}

/// First numeric token of a display string ("28.50 km" -> 28.5,
/// "Rs. 1,234.50" -> 1234.5). Mirrors the TS `num()` helper.
fn parse_first_number(text: &str) -> Option<f64> {
    let cleaned: String = text.chars().filter(|c| *c != ',').collect();
    let bytes = cleaned.as_bytes();
    let mut i = 0;
    while i < bytes.len()
        && !(bytes[i].is_ascii_digit() || bytes[i] == b'-' || bytes[i] == b'+')
    {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    let mut j = i;
    if bytes[j] == b'-' || bytes[j] == b'+' {
        j += 1;
    }
    while j < bytes.len() && (bytes[j].is_ascii_digit() || bytes[j] == b'.') {
        j += 1;
    }
    cleaned[i..j].parse::<f64>().ok()
}

/// A JSON number, or a display string holding a number — else None.
fn json_opt_f64(v: &Option<serde_json::Value>) -> Option<f64> {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        Some(serde_json::Value::String(s)) => parse_first_number(s),
        _ => None,
    }
}

/// 0-based column index -> Excel column letters (0 -> "A").
fn col_letter(col: u16) -> String {
    let mut n = u32::from(col) + 1;
    let mut s = String::new();
    while n > 0 {
        let rem = (n - 1) % 26;
        s.insert(0, (b'A' + rem as u8) as char);
        n = (n - 1) / 26;
    }
    s
}

/// Excel sheet name sanitised like the TS builders: forbids []:*?/\,
/// caps at 31 chars, falls back to "Component".
fn sanitize_sheet_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\'))
        .collect();
    let trimmed = cleaned.trim();
    let base = if trimmed.is_empty() {
        "Component"
    } else {
        trimmed
    };
    base.chars().take(31).collect()
}

/// Case-insensitive duplicate handling mirroring `uniqueSheetName`.
fn unique_sheet_name(base: &str, used: &mut Vec<String>) -> String {
    let clean = sanitize_sheet_name(base);
    let mut candidate = clean.clone();
    let mut suffix = 2u32;
    while used.iter().any(|u| u.eq_ignore_ascii_case(&candidate)) {
        let tail = format!(" ({})", suffix);
        let keep = 31usize.saturating_sub(tail.chars().count());
        candidate = format!(
            "{}{}",
            clean.chars().take(keep).collect::<String>(),
            tail
        );
        suffix += 1;
    }
    used.push(candidate.clone());
    candidate
}

/// Optional figure: a finite number, else a genuinely empty cell.
fn write_opt_number(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: Option<f64>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    match value {
        Some(v) if v.is_finite() => {
            ws.write_number_with_format(row, col, v, fmt)?;
        }
        _ => {
            ws.write_blank(row, col, fmt)?;
        }
    }
    Ok(())
}

pub fn generate_excel_data_workbook(req: &ExcelCompileRequest) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();

    // Constant palette
    let highlight_color = Color::RGB(0xCFEFEB);
    let sor_header_color = Color::RGB(0xF2F4F7);

    let border_box_bold_center = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let border_box_bold_right_num = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    // =========================================================================
    // SHEET 1: SSR Items (Rate Analysis Recipes)
    // =========================================================================
    let ws_ssr = workbook.add_worksheet();
    ws_ssr.set_name("SSR Items")?;

    // 1. Column widths: 6.71, 5.57, 42.71, 10.57, 10.57, 10.57, 12.43
    ws_ssr.set_column_width(0, 6.71)?;
    ws_ssr.set_column_width(1, 5.57)?;
    ws_ssr.set_column_width(2, 42.71)?;
    ws_ssr.set_column_width(3, 10.57)?;
    ws_ssr.set_column_width(4, 10.57)?;
    ws_ssr.set_column_width(5, 10.57)?;
    ws_ssr.set_column_width(6, 12.43)?;

    // 2. Page Setup
    ws_ssr.set_paper_size(9); // A4
    ws_ssr.set_portrait();
    ws_ssr.set_print_fit_to_pages(1, 0);
    ws_ssr.set_margins(0.7874, 0.3937, 0.3937, 0.3937, 0.1968, 0.1968);
    ws_ssr.set_print_center_horizontally(true);

    let project_name = req.project_name.as_deref().unwrap_or("STANDARD DATA");
    let ssr_header_text = format!(
        "&R{} - {}",
        if project_name.is_empty() {
            "STANDARD DATA"
        } else {
            project_name
        },
        req.sor_year.as_deref().unwrap_or("2026-27")
    );
    ws_ssr.set_header(&ssr_header_text);
    ws_ssr.set_footer("&RPage &P of &N");

    let mut r: u32 = 0;

    for item_data in &req.recipes {
        let default_totals = Totals::default();
        let totals = item_data.totals.as_ref().unwrap_or(&default_totals);
        let item_desc = item_data.description.as_deref().unwrap_or("");
        let item_unit = item_data.unit.as_deref().unwrap_or("unit");

        // Section heading if present
        if let Some(heading) = &item_data.section_heading {
            if !heading.trim().is_empty() {
                ws_ssr.set_row_height(r, 15.0)?;
                let head_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                let text = format!("{}:", heading.trim().to_uppercase());
                ws_ssr.merge_range(r, 1, r, 6, &text, &head_fmt)?;
                r += 1;
            }
        }

        // Item code
        ws_ssr.set_row_height(r, 15.0)?;
        let code_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        let code_text = if let Some(scope) = &item_data.scope_label {
            if !scope.trim().is_empty() {
                format!("{}  [Scope: {}]", item_data.code, scope.trim())
            } else {
                item_data.code.clone()
            }
        } else {
            item_data.code.clone()
        };
        ws_ssr.write_string_with_format(r, 0, &code_text, &code_fmt)?;
        r += 1;

        // Document title if present
        if let Some(doc_title) = &item_data.document_title {
            if !doc_title.trim().is_empty() {
                ws_ssr.set_row_height(r, 15.0)?;
                let doc_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                ws_ssr.merge_range(r, 1, r, 6, doc_title, &doc_fmt)?;
                r += 1;
            }
        }

        // Full description
        ws_ssr.set_row_height(r, 16.5)?;
        let desc_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap();
        ws_ssr.merge_range(r, 1, r, 6, item_desc, &desc_fmt)?;
        r += 1;

        // Dual measurement / Multi-rate note
        if let Some(note) = &item_data.multi_rate_note {
            ws_ssr.set_row_height(r, 15.0)?;
            let note_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_italic()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            let note_str = format!(
                "{}: {} (Adopted rate Rs. {})",
                note.label,
                note.note,
                note.adopted_rate_text.as_deref().unwrap_or("0.00")
            );
            ws_ssr.merge_range(r, 1, r, 6, &note_str, &note_fmt)?;
            r += 1;
        }

        // Rate Analysis Header Bar
        ws_ssr.set_row_height(r, 15.0)?;
        let bar_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        let bar_right_bold = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);
        let bar_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);
        let bar_qty_bold = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_num_format("0.00")
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        ws_ssr.write_string_with_format(r, 0, "Data:", &bar_left)?;
        ws_ssr.write_string_with_format(r, 2, "RATE ANALYSIS", &bar_right_bold)?;
        ws_ssr.write_string_with_format(r, 4, "UNIT :", &bar_center)?;
        ws_ssr.write_number_with_format(
            r,
            5,
            totals.output_quantity.unwrap_or(1.0),
            &bar_qty_bold,
        )?;
        ws_ssr.write_string_with_format(r, 6, item_unit, &bar_left)?;
        r += 1;

        // Render cost tables (A. Materials, B. Machinery, C. Labour)
        let cost_sections = [
            (
                "A",
                "MATERIALS",
                "particulars",
                &item_data.materials,
                "Total cost of Materials",
                totals.material_total.unwrap_or(0.0),
            ),
            (
                "B",
                "MACHINERY",
                "Description",
                &item_data.machinery,
                "Total hire charges of Machinery",
                totals.machinery_total.unwrap_or(0.0),
            ),
            (
                "C",
                "LABOUR",
                "Description",
                &item_data.labour,
                "Total cost of Labour",
                totals.labour_total.unwrap_or(0.0),
            ),
        ];

        for (letter, title, desc_header, lines, subtotal_label, subtotal_val) in cost_sections {
            // Section heading
            ws_ssr.set_row_height(r, 15.0)?;
            let sec_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(
                r,
                1,
                &format!("{}. {}:", letter, title),
                &sec_fmt,
            )?;
            r += 1;

            // 2-row table headers
            let rh1 = r;
            let rh2 = r + 1;
            ws_ssr.set_row_height(rh1, 15.0)?;
            ws_ssr.set_row_height(rh2, 15.0)?;

            ws_ssr.merge_range(rh1, 1, rh2, 1, "Sl No", &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 2, rh2, 2, desc_header, &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 3, rh2, 3, "Unit", &border_box_bold_center)?;
            ws_ssr.merge_range(rh1, 4, rh2, 4, "Quantity", &border_box_bold_center)?;

            ws_ssr.write_string_with_format(rh1, 5, "Rate", &border_box_bold_center)?;
            ws_ssr.write_string_with_format(rh2, 5, "in Rs.", &border_box_bold_center)?;

            ws_ssr.write_string_with_format(rh1, 6, "Amount", &border_box_bold_center)?;
            ws_ssr.write_string_with_format(rh2, 6, "in Rs.", &border_box_bold_center)?;

            r += 2;

            let empty_vec = vec![CostTableLine {
                sl: Some(serde_json::json!("1")),
                description: Some("NIL".into()),
                unit: Some("".into()),
                quantity: Some(serde_json::json!(0.0)),
                rate: Some(serde_json::json!(0.0)),
                amount: Some(serde_json::json!(0.0)),
            }];
            let effective_lines = if lines.is_empty() {
                &empty_vec
            } else {
                lines
            };

            for (idx, line) in effective_lines.iter().enumerate() {
                let is_last = idx == effective_lines.len() - 1;
                ws_ssr.set_row_height(r, 15.0)?;

                let mut sl_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    sl_fmt = sl_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut desc_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap();
                if is_last {
                    desc_fmt = desc_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut unit_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    unit_fmt = unit_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut qty_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    qty_fmt = qty_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut rate_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    rate_fmt = rate_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let mut amt_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_num_format("0.00")
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin);
                if is_last {
                    amt_fmt = amt_fmt.set_border_bottom(FormatBorder::Thin);
                }

                let sl_str = val_to_string(&line.sl);
                ws_ssr.write_string_with_format(r, 1, &sl_str, &sl_fmt)?;

                let desc_str = line.description.as_deref().unwrap_or("");
                ws_ssr.write_string_with_format(r, 2, desc_str, &desc_fmt)?;

                let unit_str = line.unit.as_deref().unwrap_or("");
                ws_ssr.write_string_with_format(r, 3, unit_str, &unit_fmt)?;

                let qty_val = val_to_f64(&line.quantity);
                ws_ssr.write_number_with_format(r, 4, qty_val, &qty_fmt)?;

                let rate_val = val_to_f64(&line.rate);
                ws_ssr.write_number_with_format(r, 5, rate_val, &rate_fmt)?;

                let amt_val = val_to_f64(&line.amount);
                ws_ssr.write_number_with_format(r, 6, amt_val, &amt_fmt)?;

                r += 1;
            }

            // Subtotal Row
            ws_ssr.set_row_height(r, 15.0)?;
            let sub_label_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Thin)
                .set_border_bottom(FormatBorder::Thin);
            ws_ssr.merge_range(r, 1, r, 4, subtotal_label, &sub_label_fmt)?;

            let sub_rs_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Thin)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin);
            ws_ssr.write_string_with_format(r, 5, "Rs:", &sub_rs_fmt)?;

            ws_ssr.write_number_with_format(r, 6, subtotal_val, &border_box_bold_right_num)?;
            r += 1;

            // Blank line
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
        }

        // Labour summary rows directly below Labour table
        if let Some(summary_rows) = &item_data.labour_summary_rows {
            if !summary_rows.is_empty() {
                for lr in summary_rows {
                    ws_ssr.set_row_height(r, 15.0)?;
                    let is_final = lr.kind.as_deref() == Some("final");
                    let mut l_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_final {
                        l_fmt = l_fmt.set_bold();
                    }
                    ws_ssr.merge_range(r, 1, r, 3, &lr.label, &l_fmt)?;

                    if let Some(pct) = &lr.percent {
                        let pct_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 3, pct, &pct_fmt)?;
                    }

                    let mut v_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_final {
                        v_fmt = v_fmt.set_bold();
                    }
                    if let Ok(num_val) = parse_amount_val(&lr.amount) {
                        v_fmt = v_fmt.set_num_format("0.00");
                        ws_ssr.write_number_with_format(r, 4, num_val, &v_fmt)?;
                    } else {
                        let s_val = val_to_string(&Some(lr.amount.clone()));
                        ws_ssr.write_string_with_format(r, 4, &s_val, &v_fmt)?;
                    }
                    r += 1;
                }
            } else {
                render_default_labour_breakdown(&mut *ws_ssr, &mut r, totals)?;
            }
        } else {
            render_default_labour_breakdown(&mut *ws_ssr, &mut r, totals)?;
        }

        // Blank row
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;

        // ABSTRACT BLOCK
        ws_ssr.set_row_height(r, 15.0)?;
        let abs_head_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        ws_ssr.write_string_with_format(r, 1, "ABSTRACT:", &abs_head_fmt)?;
        r += 1;

        if let Some(abstract_rows) = &item_data.abstract_rows {
            if !abstract_rows.is_empty() {
                for ar in abstract_rows {
                    ws_ssr.set_row_height(r, 15.0)?;
                    if ar.is_caption.unwrap_or(false) {
                        let cap_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_bold()
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.merge_range(r, 1, r, 6, &ar.label, &cap_fmt)?;
                        r += 1;
                        continue;
                    }

                    let is_bold = ar.is_rate.unwrap_or(false)
                        || ar.is_total_cost.unwrap_or(false)
                        || ar.is_total.unwrap_or(false);

                    let end_col = if ar.basis.is_some() { 2 } else { 4 };
                    let mut l_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_bold {
                        l_fmt = l_fmt.set_bold();
                    }
                    ws_ssr.merge_range(r, 1, r, end_col, &ar.label, &l_fmt)?;

                    if let Some(basis_str) = &ar.basis {
                        let mut b_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        if let Some(pct_clean) = basis_str.strip_suffix('%') {
                            if let Ok(p_num) = pct_clean.trim().parse::<f64>() {
                                b_fmt = b_fmt.set_num_format("0.000%");
                                ws_ssr.write_number_with_format(r, 3, p_num / 100.0, &b_fmt)?;
                            } else {
                                ws_ssr.write_string_with_format(r, 3, basis_str, &b_fmt)?;
                            }
                        } else if let Ok(num_b) = basis_str.trim().parse::<f64>() {
                            b_fmt = b_fmt.set_num_format("0.00");
                            ws_ssr.write_number_with_format(r, 3, num_b, &b_fmt)?;
                        } else {
                            ws_ssr.write_string_with_format(r, 3, basis_str, &b_fmt)?;
                        }
                    }

                    if let Some(qual_str) = &ar.qualifier {
                        let q_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 4, qual_str, &q_fmt)?;
                    }

                    let rs_str = if ar.is_rate.unwrap_or(false) {
                        "Rs."
                    } else {
                        "Rs:"
                    };
                    let rs_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter);
                    ws_ssr.write_string_with_format(r, 5, rs_str, &rs_fmt)?;

                    let mut v_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Right)
                        .set_align(FormatAlign::VerticalCenter);
                    if is_bold {
                        v_fmt = v_fmt.set_bold();
                    }
                    if ar.is_total.unwrap_or(false) {
                        v_fmt = v_fmt
                            .set_border_top(FormatBorder::Thin)
                            .set_border_bottom(FormatBorder::Thin);
                    }

                    if let Ok(num_val) = parse_amount_val(&ar.amount) {
                        v_fmt = v_fmt.set_num_format("0.00");
                        ws_ssr.write_number_with_format(r, 6, num_val, &v_fmt)?;
                    } else {
                        let s_val = val_to_string(&Some(ar.amount.clone()));
                        ws_ssr.write_string_with_format(r, 6, &s_val, &v_fmt)?;
                    }
                    r += 1;
                }
            } else {
                render_default_abstract(&mut *ws_ssr, &mut r, totals, item_unit)?;
            }
        } else {
            render_default_abstract(&mut *ws_ssr, &mut r, totals, item_unit)?;
        }

        // PROJECT LEADS BLOCK (if leads attached)
        if let Some(leads) = &item_data.leads {
            if !leads.is_empty() {
                ws_ssr.set_row_height(r, 15.0)?;
                r += 1;
                ws_ssr.set_row_height(r, 15.0)?;
                let is_disposal = item_data
                    .lead_summary
                    .as_ref()
                    .and_then(|s| s.disposal_only)
                    .unwrap_or(false);
                let lead_heading = if is_disposal {
                    "DISPOSAL LEAD:"
                } else {
                    "LEAD ADDITIONS:"
                };
                let lead_head_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                ws_ssr.write_string_with_format(r, 1, lead_heading, &lead_head_fmt)?;
                r += 1;

                // 2-row lead table headers
                let rlh1 = r;
                let rlh2 = r + 1;
                ws_ssr.set_row_height(rlh1, 15.0)?;
                ws_ssr.set_row_height(rlh2, 15.0)?;

                ws_ssr.merge_range(rlh1, 1, rlh2, 1, "Sl No", &border_box_bold_center)?;
                ws_ssr.merge_range(
                    rlh1,
                    2,
                    rlh2,
                    2,
                    "Material / Lead Details",
                    &border_box_bold_center,
                )?;
                ws_ssr.merge_range(rlh1, 3, rlh2, 3, "Unit", &border_box_bold_center)?;
                ws_ssr.merge_range(rlh1, 4, rlh2, 4, "Quantity", &border_box_bold_center)?;

                ws_ssr.write_string_with_format(rlh1, 5, "Rate", &border_box_bold_center)?;
                ws_ssr.write_string_with_format(rlh2, 5, "in Rs.", &border_box_bold_center)?;

                ws_ssr.write_string_with_format(rlh1, 6, "Amount", &border_box_bold_center)?;
                ws_ssr.write_string_with_format(rlh2, 6, "in Rs.", &border_box_bold_center)?;
                r += 2;

                for (l_idx, ld) in leads.iter().enumerate() {
                    let is_last_lead = l_idx == leads.len() - 1;

                    if let Some(ded) = &ld.deduction {
                        ws_ssr.set_row_height(r, 15.0)?;
                        let ded_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_italic()
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.merge_range(r, 1, r, 3, &ded.label, &ded_fmt)?;

                        let net_text = format!(
                            "Net: Rs {}/{}",
                            ded.net_rate_text.as_deref().unwrap_or("0.00"),
                            ded.unit.as_deref().unwrap_or("unit")
                        );
                        let net_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        ws_ssr.write_string_with_format(r, 4, &net_text, &net_fmt)?;
                        r += 1;
                    }

                    let has_formula = ld
                        .lead_formula
                        .as_ref()
                        .map_or(false, |f| !f.trim().is_empty());
                    ws_ssr.set_row_height(r, if has_formula { 30.0 } else { 15.0 })?;

                    let mut sl_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        sl_fmt = sl_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut mat_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Left)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_text_wrap();
                    if is_last_lead {
                        mat_fmt = mat_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut unit_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        unit_fmt = unit_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut qty_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        qty_fmt = qty_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut rate_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        rate_fmt = rate_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let mut amt_fmt = Format::new()
                        .set_font_name("Trebuchet MS")
                        .set_font_size(10.0)
                        .set_num_format("0.00")
                        .set_align(FormatAlign::Right)
                        .set_align(FormatAlign::VerticalCenter)
                        .set_border_left(FormatBorder::Thin)
                        .set_border_right(FormatBorder::Thin);
                    if is_last_lead {
                        amt_fmt = amt_fmt.set_border_bottom(FormatBorder::Thin);
                    }

                    let sl_text = format!("{}", l_idx + 1);
                    ws_ssr.write_string_with_format(r, 1, &sl_text, &sl_fmt)?;

                    let mut mat_text = ld.material.clone().unwrap_or_default();
                    if let Some(tag) = &ld.lead_type_tag {
                        if !tag.trim().is_empty() {
                            mat_text = format!("{}  [{}]", mat_text, tag.trim());
                        }
                    }
                    if let Some(dist) = ld.distance_km {
                        let lift_text = if let Some(lift) = ld.lift_m {
                            if lift > 0.0 {
                                format!(", lift {}m", lift)
                            } else {
                                String::new()
                            }
                        } else {
                            String::new()
                        };
                        mat_text = format!("{} [{} km{}]", mat_text, dist, lift_text);
                    }
                    if let Some(formula) = &ld.lead_formula {
                        if !formula.trim().is_empty() {
                            mat_text = format!("{}\nFormula: {}", mat_text, formula.trim());
                        }
                    }
                    ws_ssr.write_string_with_format(r, 2, &mat_text, &mat_fmt)?;

                    let unit_str = ld.unit.as_deref().unwrap_or("");
                    ws_ssr.write_string_with_format(r, 3, unit_str, &unit_fmt)?;

                    let qty_val = val_to_f64(&ld.quantity);
                    ws_ssr.write_number_with_format(r, 4, qty_val, &qty_fmt)?;

                    let rate_val = val_to_f64(&ld.rate);
                    ws_ssr.write_number_with_format(r, 5, rate_val, &rate_fmt)?;

                    let amt_val = val_to_f64(&ld.amount);
                    ws_ssr.write_number_with_format(r, 6, amt_val, &amt_fmt)?;
                    r += 1;
                }

                // Lead Totals
                if let Some(lsum) = &item_data.lead_summary {
                    let lead_totals = [
                        (
                            "Base final amount",
                            lsum.base_amount_text.as_deref().unwrap_or("0.00"),
                            false,
                        ),
                        (
                            if is_disposal {
                                "Add Disposal Lead total"
                            } else {
                                "Add Lead/Lift total"
                            },
                            lsum.lead_total_text.as_deref().unwrap_or("0.00"),
                            false,
                        ),
                        (
                            if is_disposal {
                                "Final amount with Disposal Lead"
                            } else {
                                "Final amount with Lead"
                            },
                            lsum.final_amount_text.as_deref().unwrap_or("0.00"),
                            true,
                        ),
                        (
                            if is_disposal {
                                "Rate per unit with Disposal Lead"
                            } else {
                                "Rate per unit with Lead"
                            },
                            lsum.final_rate_text.as_deref().unwrap_or("0.00"),
                            true,
                        ),
                    ];

                    for (lt_label, lt_val_text, highlight) in lead_totals {
                        ws_ssr.set_row_height(r, 15.0)?;
                        let mut label_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Left)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                        }
                        ws_ssr.merge_range(r, 1, r, 4, lt_label, &label_fmt)?;

                        let mut rs_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Center)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            rs_fmt = rs_fmt.set_background_color(highlight_color);
                        }
                        ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                        let mut val_fmt = Format::new()
                            .set_font_name("Trebuchet MS")
                            .set_font_size(10.0)
                            .set_align(FormatAlign::Right)
                            .set_align(FormatAlign::VerticalCenter);
                        if highlight {
                            val_fmt = val_fmt
                                .set_bold()
                                .set_background_color(highlight_color)
                                .set_border(FormatBorder::Thin);
                        }

                        let cleaned: String = lt_val_text
                            .chars()
                            .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                            .collect();
                        if let Ok(num_val) = cleaned.parse::<f64>() {
                            val_fmt = val_fmt.set_num_format("0.00");
                            ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                        } else {
                            ws_ssr.write_string_with_format(r, 6, lt_val_text, &val_fmt)?;
                        }
                        r += 1;
                    }
                }
            }
        }

        // SELECTED OPTIONAL ADDITION (if present)
        if let Some(opt_add) = &item_data.optional_addition {
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
            ws_ssr.set_row_height(r, 15.0)?;
            let add_head_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(r, 1, "SELECTED OPTIONAL ADDITION:", &add_head_fmt)?;
            r += 1;

            ws_ssr.set_row_height(r, 15.0)?;
            let desc_label = format!(
                "{} (Calculated from {} {} add-on DATA)",
                opt_add.label,
                opt_add.output_quantity_text.as_deref().unwrap_or("1"),
                opt_add.unit.as_deref().unwrap_or(item_unit)
            );
            ws_ssr.merge_range(r, 1, r, 6, &desc_label, &add_head_fmt)?;
            r += 1;

            let adopted_val_str = format!(
                "Rs. {} / {}",
                opt_add.adopted_rate_text.as_deref().unwrap_or("0.00"),
                item_unit
            );
            let total_cost_text = opt_add.total_cost_text.as_deref().unwrap_or("0.00");
            let base_rate_text = opt_add.base_rate_text.as_deref().unwrap_or("0.00");
            let addon_rate_text = opt_add.addon_rate_text.as_deref().unwrap_or("0.00");
            let addon_totals = [
                ("Total add-on cost", total_cost_text, false),
                (
                    "Calculated base DATA rate",
                    base_rate_text,
                    false,
                ),
                ("Selected add-on rate", addon_rate_text, false),
                ("Adopted rate", &adopted_val_str, true),
            ];

            for (at_label, at_val, highlight) in addon_totals {
                ws_ssr.set_row_height(r, 15.0)?;
                let mut label_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                }
                ws_ssr.merge_range(r, 1, r, 4, at_label, &label_fmt)?;

                let mut rs_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    rs_fmt = rs_fmt.set_background_color(highlight_color);
                }
                ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                let mut val_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    val_fmt = val_fmt
                        .set_bold()
                        .set_background_color(highlight_color)
                        .set_border(FormatBorder::Thin);
                }

                let cleaned: String = at_val
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                    .collect();
                if let Ok(num_val) = cleaned.parse::<f64>() {
                    val_fmt = val_fmt.set_num_format("0.00");
                    ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                } else {
                    ws_ssr.write_string_with_format(r, 6, at_val, &val_fmt)?;
                }
                r += 1;
            }
        }

        // SELECTED RATE VARIANT (if present)
        if let Some(rvar) = &item_data.rate_variant {
            ws_ssr.set_row_height(r, 15.0)?;
            r += 1;
            ws_ssr.set_row_height(r, 15.0)?;
            let var_head_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_bold()
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            ws_ssr.write_string_with_format(r, 1, "SELECTED RATE VARIANT:", &var_head_fmt)?;
            r += 1;

            ws_ssr.set_row_height(r, 15.0)?;
            let reg_fmt = Format::new()
                .set_font_name("Trebuchet MS")
                .set_font_size(10.0)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter);
            let rvar_selected = rvar.selected_label.as_deref().unwrap_or("Variant");
            let rvar_base = rvar.base_label.as_deref().unwrap_or("Base class");
            let rvar_pct = rvar.percent.unwrap_or(0.0);
            let var_sub_label = format!(
                "{} (+{}% adjustment over {})",
                rvar_selected, rvar_pct, rvar_base
            );
            ws_ssr.merge_range(r, 1, r, 6, &var_sub_label, &reg_fmt)?;
            r += 1;

            let base_lbl = format!("Calculated {} base rate", rvar_base);
            let add_lbl = format!("Add {}% for {}", rvar_pct, rvar_selected);
            let adopted_lbl = format!("Adopted {} rate", rvar_selected);
            let adopted_val_str = format!(
                "Rs. {} / {}",
                rvar.adopted_rate_text.as_deref().unwrap_or("0.00"),
                item_unit
            );

            let base_rate_text = rvar.base_rate_text.as_deref().unwrap_or("0.00");
            let addition_text = rvar.addition_text.as_deref().unwrap_or("0.00");
            let variant_rows = [
                (base_lbl, base_rate_text, false),
                (add_lbl, addition_text, false),
                (adopted_lbl, &adopted_val_str, true),
            ];

            for (vt_label, vt_val, highlight) in variant_rows {
                ws_ssr.set_row_height(r, 15.0)?;
                let mut label_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Left)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    label_fmt = label_fmt.set_bold().set_background_color(highlight_color);
                }
                ws_ssr.merge_range(r, 1, r, 4, &vt_label, &label_fmt)?;

                let mut rs_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    rs_fmt = rs_fmt.set_background_color(highlight_color);
                }
                ws_ssr.write_string_with_format(r, 5, "Rs:", &rs_fmt)?;

                let mut val_fmt = Format::new()
                    .set_font_name("Trebuchet MS")
                    .set_font_size(10.0)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter);
                if highlight {
                    val_fmt = val_fmt
                        .set_bold()
                        .set_background_color(highlight_color)
                        .set_border(FormatBorder::Thin);
                }

                let cleaned: String = vt_val
                    .chars()
                    .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                    .collect();
                if let Ok(num_val) = cleaned.parse::<f64>() {
                    val_fmt = val_fmt.set_num_format("0.00");
                    ws_ssr.write_number_with_format(r, 6, num_val, &val_fmt)?;
                } else {
                    ws_ssr.write_string_with_format(r, 6, vt_val, &val_fmt)?;
                }
                r += 1;
            }
        }

        // Blank rows separation between DATA recipes
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;
        ws_ssr.set_row_height(r, 15.0)?;
        r += 1;
    }

    if r > 0 {
        ws_ssr.set_print_area(0, 0, r - 1, 6)?;
    }

    // =========================================================================
    // SHEET 2: SOR Items (If Any)
    // =========================================================================
    if !req.sor.is_empty() {
        let ws_sor = workbook.add_worksheet();
        ws_sor.set_name("SOR Items")?;

        // 1. Column widths: 8.0, 58.0, 14.0, 20.0
        ws_sor.set_column_width(0, 8.0)?;
        ws_sor.set_column_width(1, 58.0)?;
        ws_sor.set_column_width(2, 14.0)?;
        ws_sor.set_column_width(3, 20.0)?;

        // 2. Page Setup
        ws_sor.set_paper_size(9); // A4
        ws_sor.set_portrait();
        ws_sor.set_print_fit_to_pages(1, 0);
        ws_sor.set_margins(0.7874, 0.3937, 0.3937, 0.3937, 0.1968, 0.1968);
        ws_sor.set_print_center_horizontally(true);
        ws_sor.set_repeat_rows(1, 1)?; // Repeat table headers on every page

        let sor_header_text = format!(
            "&RSCHEDULE OF RATES (SOR) - {}",
            req.project_name
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("Estimate")
        );
        ws_sor.set_header(&sor_header_text);
        ws_sor.set_footer("&RPage &P of &N");

        let mut sor_r: u32 = 0;

        // Sheet Title
        ws_sor.set_row_height(sor_r, 20.0)?;
        let sor_title_fmt = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.5)
            .set_bold()
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        ws_sor.merge_range(sor_r, 0, sor_r, 3, "SCHEDULE OF RATES", &sor_title_fmt)?;
        sor_r += 1;

        // Table Header
        ws_sor.set_row_height(sor_r, 18.0)?;
        let sor_h_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        let sor_h_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);

        let sor_h_right = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_bold()
            .set_background_color(sor_header_color)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        ws_sor.write_string_with_format(sor_r, 0, "Sl No", &sor_h_center)?;
        ws_sor.write_string_with_format(sor_r, 1, "Description of Item", &sor_h_left)?;
        ws_sor.write_string_with_format(sor_r, 2, "Unit", &sor_h_center)?;
        ws_sor.write_string_with_format(sor_r, 3, "Published Rate in Rs.", &sor_h_right)?;
        sor_r += 1;

        let sor_cell_center = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter);

        let sor_cell_left = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap();

        let sor_cell_right_num = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_num_format("#,##0.00")
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        let sor_cell_right_str = Format::new()
            .set_font_name("Trebuchet MS")
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter);

        for item in &req.sor {
            ws_sor.set_row_height(sor_r, 16.5)?;
            ws_sor.write_number_with_format(sor_r, 0, item.sl as f64, &sor_cell_center)?;
            ws_sor.write_string_with_format(sor_r, 1, &item.description, &sor_cell_left)?;
            ws_sor.write_string_with_format(sor_r, 2, &item.unit, &sor_cell_center)?;

            if let Some(rate_num) = item.rate {
                ws_sor.write_number_with_format(sor_r, 3, rate_num, &sor_cell_right_num)?;
            } else {
                let r_text = item
                    .rate_text
                    .as_deref()
                    .unwrap_or("Rate not published");
                ws_sor.write_string_with_format(sor_r, 3, r_text, &sor_cell_right_str)?;
            }
            sor_r += 1;
        }

        if sor_r > 0 {
            ws_sor.set_print_area(0, 0, sor_r - 1, 3)?;
        }
    }

    workbook.save_to_buffer()
}

fn render_default_labour_breakdown(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: &mut u32,
    totals: &Totals,
) -> Result<(), XlsxError> {
    let reg_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let center_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let center_pct_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.000%")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let center_bold_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(*r, 1, *r, 3, "labour component/unit qty", &reg_fmt)?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_base.unwrap_or(0.0),
        &center_num_fmt,
    )?;
    *r += 1;

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        2,
        "Add contractor's profit and overhead charges",
        &reg_fmt,
    )?;
    let ovh_pct = totals.overhead_percent.unwrap_or(0.0) / 100.0;
    ws.write_number_with_format(*r, 3, ovh_pct, &center_pct_fmt)?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_profit.unwrap_or(0.0),
        &center_num_fmt,
    )?;
    *r += 1;

    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        3,
        "labour component/unit qty (including contractor's profit)",
        &reg_fmt,
    )?;
    ws.write_number_with_format(
        *r,
        4,
        totals.labour_unit_total.unwrap_or(0.0),
        &center_bold_num_fmt,
    )?;
    *r += 1;

    Ok(())
}

fn render_default_abstract(
    ws: &mut rust_xlsxwriter::Worksheet,
    r: &mut u32,
    totals: &Totals,
    unit: &str,
) -> Result<(), XlsxError> {
    let reg_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let bold_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let rs_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let val_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let val_bold_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_bold()
        .set_num_format("0.00")
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let val_tb_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_border_top(FormatBorder::Thin)
        .set_border_bottom(FormatBorder::Thin)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter);

    let abs_lines = [
        (
            "A. Cost of Materials",
            totals.material_total.unwrap_or(0.0),
        ),
        (
            "B. Hire charges of Machinery",
            totals.machinery_total.unwrap_or(0.0),
        ),
        (
            "C. Cost of Labour",
            totals.labour_total.unwrap_or(0.0),
        ),
    ];

    for (label, val) in abs_lines {
        ws.set_row_height(*r, 15.0)?;
        ws.merge_range(*r, 1, *r, 4, label, &reg_fmt)?;
        ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
        ws.write_number_with_format(*r, 6, val, &val_fmt)?;
        *r += 1;
    }

    // Total row
    ws.set_row_height(*r, 15.0)?;
    let center_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    ws.write_string_with_format(*r, 4, "Total", &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(
        *r,
        6,
        totals.base_cost.unwrap_or(0.0),
        &val_tb_fmt,
    )?;
    *r += 1;

    // Overhead row
    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(
        *r,
        1,
        *r,
        3,
        "D. Add for contractor's profit and overheads on (A+B+C)",
        &reg_fmt,
    )?;
    let center_pct_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.000%")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    let ovh_pct = totals.overhead_percent.unwrap_or(0.0) / 100.0;
    ws.write_number_with_format(*r, 4, ovh_pct, &center_pct_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(
        *r,
        6,
        totals.overhead_amount.unwrap_or(0.0),
        &val_fmt,
    )?;
    *r += 1;

    // Area Allowance row if present
    if let Some(allow_amt) = totals.area_allowance_amount {
        if allow_amt > 0.0 {
            ws.set_row_height(*r, 15.0)?;
            let allow_pct = totals.area_allowance_percent.unwrap_or(0.0);
            let label = format!("E. Add Area Allowance (+{:.2}%) on Labour", allow_pct);
            ws.merge_range(*r, 1, *r, 3, &label, &reg_fmt)?;
            ws.write_number_with_format(*r, 4, allow_pct / 100.0, &center_pct_fmt)?;
            ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
            ws.write_number_with_format(*r, 6, allow_amt, &val_fmt)?;
            *r += 1;
        }
    }

    // Total cost for row
    ws.set_row_height(*r, 15.0)?;
    ws.merge_range(*r, 1, *r, 2, "Total cost for", &reg_fmt)?;
    let center_num_fmt = Format::new()
        .set_font_name("Trebuchet MS")
        .set_font_size(10.0)
        .set_num_format("0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    ws.write_number_with_format(
        *r,
        3,
        totals.output_quantity.unwrap_or(1.0),
        &center_num_fmt,
    )?;
    ws.write_string_with_format(*r, 4, unit, &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs:", &rs_fmt)?;
    ws.write_number_with_format(
        *r,
        6,
        totals.total_cost.unwrap_or(0.0),
        &val_bold_fmt,
    )?;
    *r += 1;

    // Rate per Unit row
    ws.set_row_height(*r, 15.0)?;
    let rate_label = format!("Rate per {}", unit);
    ws.merge_range(*r, 1, *r, 2, &rate_label, &bold_fmt)?;
    let calc_expr = format!(
        "(A+B+C+D)/{}",
        totals.output_quantity.unwrap_or(1.0)
    );
    ws.write_string_with_format(*r, 3, &calc_expr, &center_fmt)?;
    ws.write_string_with_format(*r, 5, "Rs.", &rs_fmt)?;
    ws.write_number_with_format(
        *r,
        6,
        totals.rate_per_unit.unwrap_or(0.0),
        &val_bold_fmt,
    )?;
    *r += 1;

    Ok(())
}

// ============================================================================
// BOQ workbook (single "BOQ" sheet). Ports boqExcel.ts:
// merged title headers, column widths, header fill, money/quantity formats,
// frozen headings, autofiltered table, bold totals row. A missing quantity,
// rate or cost is a genuinely empty cell, never a zero.
// ============================================================================

const BOQ_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const BOQ_QTY_FMT: &str = "#,##0.000";

pub fn generate_excel_boq_workbook(payload: &BoqPayload) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ink = Color::RGB(0x1F2933);
    let header_fill = Color::RGB(0x1D3A54);
    let total_fill = Color::RGB(0xEFF3F6);
    let muted = Color::RGB(0x5C7080);
    let white = Color::RGB(0xFFFFFF);

    let ws = workbook.add_worksheet();
    ws.set_name("BOQ")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);

    let widths = [7.0, 20.0, 58.0, 15.0, 10.0, 17.0, 19.0];
    for (i, w) in widths.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
    }

    ws.merge_range(
        0,
        0,
        0,
        6,
        &payload.project_name,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(ink),
    )?;
    ws.set_row_height(0, 22.0)?;
    ws.merge_range(
        1,
        0,
        1,
        6,
        &format!("Bill of Quantities \u{2014} {}", payload.component_name),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(12.0)
            .set_bold()
            .set_font_color(ink),
    )?;
    ws.merge_range(
        2,
        0,
        2,
        6,
        if payload.is_subcomponent {
            "Sub-component BOQ"
        } else {
            "Component BOQ"
        },
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted),
    )?;
    ws.set_row_height(3, 6.0)?;

    let header_at: u32 = 4;
    let header_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    for (i, h) in [
        "S.No",
        "Code",
        "Description",
        "Quantity",
        "Unit",
        "Rate (Rs.)",
        "Cost (Rs.)",
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(header_at, i as u16, h, &header_fmt)?;
    }
    ws.set_row_height(header_at, 30.0)?;
    ws.set_freeze_panes(header_at + 1, 0)?;

    let text_center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let text_left = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let qty_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_num_format(BOQ_QTY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let money_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(ink)
        .set_num_format(BOQ_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let mut r = header_at + 1;
    for row in &payload.rows {
        let desc = if !row.description.trim().is_empty() && row.description != row.heading {
            format!("{}\n{}", row.heading, row.description)
        } else {
            row.heading.clone()
        };
        ws.write_string_with_format(r, 0, &row.sl, &text_center)?;
        ws.write_string_with_format(r, 1, &row.code, &text_center)?;
        ws.write_string_with_format(r, 2, &desc, &text_left)?;
        write_opt_number(ws, r, 3, row.quantity, &qty_fmt)?;
        ws.write_string_with_format(r, 4, &row.unit, &text_center)?;
        write_opt_number(ws, r, 5, row.rate, &money_fmt)?;
        write_opt_number(ws, r, 6, row.amount, &money_fmt)?;
        r += 1;
    }
    if !payload.rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, 6)?;
    }

    let total_center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let total_right = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    let total_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(ink)
        .set_background_color(total_fill)
        .set_num_format(BOQ_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_top(FormatBorder::Medium);
    ws.write_string_with_format(r, 0, "", &total_center)?;
    ws.write_string_with_format(r, 1, "", &total_center)?;
    ws.write_string_with_format(r, 2, "Total Cost", &total_right)?;
    ws.write_blank(r, 3, &total_center)?;
    ws.write_string_with_format(r, 4, "", &total_center)?;
    ws.write_blank(r, 5, &total_center)?;
    write_opt_number(ws, r, 6, payload.total_cost, &total_money)?;
    ws.set_row_height(r, 20.0)?;

    ws.set_print_area(0, 0, r, 6)?;
    workbook.save_to_buffer()
}

// ============================================================================
// Comparative statement workbook. Ports comparativeExcel.ts:
// "Summary" sheet plus one sheet per component (plus "Lead charges" when
// lead rows exist), merged title block, frozen headings, autofiltered
// tables, bold totals, red qualification notes. Blanks stay blank — a row
// that exists in one year only has an empty cell, never a zero.
// ============================================================================

const CMP_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const CMP_PCT_FMT: &str = "0.00\"%\";[Red]-0.00\"%\"";
const CMP_QTY_FMT: &str = "#,##0.000";

enum CmpVal {
    Text(String),
    Num(f64, &'static str),
    Blank,
}

fn cmp_money(v: Option<f64>) -> CmpVal {
    match v {
        Some(n) => CmpVal::Num(n, CMP_MONEY_FMT),
        None => CmpVal::Blank,
    }
}

fn cmp_pct(v: Option<f64>) -> CmpVal {
    match v {
        Some(n) => CmpVal::Num(n, CMP_PCT_FMT),
        None => CmpVal::Blank,
    }
}

fn cmp_is_total_row(row: &ComparativeRowPayload) -> bool {
    row.kind == "total" || row.kind == "grand"
}

fn write_cmp_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    vals: &[CmpVal],
    desc_col: usize,
    total: bool,
) -> Result<(), XlsxError> {
    let ink = Color::RGB(0x1F2933);
    let total_fill = Color::RGB(0xEFF3F6);
    for (i, v) in vals.iter().enumerate() {
        let col = i as u16;
        let mut fmt = Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(ink)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        if total {
            fmt = fmt
                .set_bold()
                .set_background_color(total_fill)
                .set_border_top(FormatBorder::Medium);
        }
        match v {
            CmpVal::Text(s) => {
                if i == desc_col {
                    fmt = fmt.set_align(FormatAlign::Left).set_text_wrap();
                } else {
                    fmt = fmt.set_align(FormatAlign::Center);
                }
                ws.write_string_with_format(row, col, s, &fmt)?;
            }
            CmpVal::Num(n, nf) => {
                fmt = fmt.set_num_format(nf).set_align(FormatAlign::Right);
                if n.is_finite() {
                    ws.write_number_with_format(row, col, *n, &fmt)?;
                } else {
                    ws.write_blank(row, col, &fmt)?;
                }
            }
            CmpVal::Blank => {
                ws.write_blank(row, col, &fmt)?;
            }
        }
    }
    Ok(())
}

fn cmp_title_block(
    ws: &mut rust_xlsxwriter::Worksheet,
    project: &str,
    heading: &str,
    sub: &str,
    last_col: u16,
) -> Result<(), XlsxError> {
    let ink = Color::RGB(0x1F2933);
    let muted = Color::RGB(0x5C7080);
    ws.merge_range(
        0,
        0,
        0,
        last_col,
        project,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(ink)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(0, 22.0)?;
    ws.merge_range(
        1,
        0,
        1,
        last_col,
        heading,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(12.0)
            .set_bold()
            .set_font_color(ink),
    )?;
    ws.merge_range(
        2,
        0,
        2,
        last_col,
        sub,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted),
    )?;
    ws.set_row_height(3, 6.0)?;
    Ok(())
}

fn cmp_header_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    headers: &[(String, f64)],
) -> Result<(), XlsxError> {
    let header_fill = Color::RGB(0x1D3A54);
    let white = Color::RGB(0xFFFFFF);
    let header_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(header_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    for (i, (h, w)) in headers.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
        ws.write_string_with_format(row, i as u16, h, &header_fmt)?;
    }
    ws.set_row_height(row, 30.0)?;
    ws.set_freeze_panes(row + 1, 0)?;
    Ok(())
}

fn write_comparative_summary(
    workbook: &mut Workbook,
    payload: &ComparativePayload,
    project: &str,
    heading: &str,
    sub: &str,
) -> Result<(), XlsxError> {
    let headers = vec![
        ("Sl.".to_string(), 6.0),
        ("Description".to_string(), 52.0),
        (format!("Amount {}", payload.left_year), 18.0),
        (format!("Amount {}", payload.right_year), 18.0),
        ("Difference".to_string(), 18.0),
        ("%".to_string(), 11.0),
    ];
    let last_col = headers.len() as u16 - 1;
    let ws = workbook.add_worksheet();
    ws.set_name("Summary")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    cmp_title_block(ws, project, heading, sub, last_col)?;
    let header_at: u32 = 4;
    cmp_header_row(ws, header_at, &headers)?;

    let mut r = header_at + 1;
    for row in &payload.abstract_rows {
        let vals = [
            CmpVal::Text(val_to_string(&row.sl_no)),
            CmpVal::Text(row.label.clone()),
            cmp_money(row.left),
            cmp_money(row.right),
            cmp_money(row.difference),
            cmp_pct(row.percent),
        ];
        write_cmp_row(ws, r, &vals, 1, cmp_is_total_row(row))?;
        r += 1;
    }
    if !payload.abstract_rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, last_col)?;
    }

    if !payload.warnings.is_empty() {
        let mut at = header_at + payload.abstract_rows.len() as u32 + 3;
        ws.merge_range(
            at,
            0,
            at,
            last_col,
            "Read with these qualifications",
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(11.0)
                .set_bold()
                .set_font_color(Color::RGB(0x9C2B22)),
        )?;
        at += 1;
        for warning in &payload.warnings {
            let text = match &warning.detail {
                Some(d) if !d.trim().is_empty() => {
                    format!("{} {}", warning.message, d)
                }
                _ => warning.message.clone(),
            };
            ws.merge_range(
                at,
                0,
                at,
                last_col,
                &text,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_font_color(Color::RGB(0x7A2018))
                    .set_text_wrap()
                    .set_align(FormatAlign::VerticalCenter),
            )?;
            ws.set_row_height(at, 28.0)?;
            at += 1;
        }
        r = at;
    }

    if r > 0 {
        ws.set_print_area(0, 0, r - 1, last_col)?;
    }
    Ok(())
}

fn write_comparative_component(
    workbook: &mut Workbook,
    payload: &ComparativePayload,
    component: &ComparativeComponentPayload,
    project: &str,
    used: &mut Vec<String>,
) -> Result<(), XlsxError> {
    let headers = vec![
        ("Sl.".to_string(), 6.0),
        ("Description".to_string(), 62.0),
        ("Unit".to_string(), 9.0),
        ("Quantity".to_string(), 14.0),
        (format!("Rate {}", payload.left_year), 15.0),
        (format!("Rate {}", payload.right_year), 15.0),
        (format!("Amount {}", payload.left_year), 18.0),
        (format!("Amount {}", payload.right_year), 18.0),
        ("Difference".to_string(), 18.0),
        ("%".to_string(), 11.0),
    ];
    let last_col = headers.len() as u16 - 1;
    let name = unique_sheet_name(&component.name, used);
    let ws = workbook.add_worksheet();
    ws.set_name(&name)?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    let sub = format!(
        "Component Abstract \u{00B7} {} compared with {}",
        payload.left_year, payload.right_year
    );
    cmp_title_block(ws, project, &component.name, &sub, last_col)?;
    let header_at: u32 = 4;
    cmp_header_row(ws, header_at, &headers)?;

    let mut r = header_at + 1;
    for row in &component.rows {
        let desc = match &row.description {
            Some(d) if !d.trim().is_empty() => {
                format!("{}\n{}", row.label, d)
            }
            _ => row.label.clone(),
        };
        let vals = [
            CmpVal::Text(val_to_string(&row.sl_no)),
            CmpVal::Text(desc),
            CmpVal::Text(row.unit.clone().unwrap_or_default()),
            match row.quantity {
                Some(n) => CmpVal::Num(n, CMP_QTY_FMT),
                None => CmpVal::Blank,
            },
            cmp_money(row.left_rate),
            cmp_money(row.right_rate),
            cmp_money(row.left),
            cmp_money(row.right),
            cmp_money(row.difference),
            cmp_pct(row.percent),
        ];
        write_cmp_row(ws, r, &vals, 1, false)?;
        r += 1;
    }
    if !component.rows.is_empty() {
        ws.autofilter(header_at, 0, r - 1, last_col)?;
    }

    let total_vals = [
        CmpVal::Text(String::new()),
        CmpVal::Text("COMPONENT TOTAL".to_string()),
        CmpVal::Text(String::new()),
        CmpVal::Blank,
        CmpVal::Blank,
        CmpVal::Blank,
        cmp_money(component.left_total),
        cmp_money(component.right_total),
        cmp_money(component.difference),
        cmp_pct(component.percent),
    ];
    write_cmp_row(ws, r, &total_vals, 1, true)?;
    ws.set_print_area(0, 0, r, last_col)?;
    Ok(())
}

pub fn generate_excel_comparative_workbook(
    payload: &ComparativePayload,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let project = {
        let p = payload.project_name.trim();
        if !p.is_empty() {
            p.to_string()
        } else {
            match &payload.root_name {
                Some(r) if !r.trim().is_empty() => r.trim().to_string(),
                _ => "Estimate".to_string(),
            }
        }
    };
    let heading = if payload.whole_estimate {
        "Comparative Statement \u{2014} General Abstract"
    } else {
        "Comparative Statement \u{2014} Selected Work"
    };
    let mut sub = format!(
        "{} compared with {}",
        payload.left_year, payload.right_year
    );
    if !payload.whole_estimate {
        sub.push_str(
            " \u{00B7} part of the estimate only; charges and GST are levied on the whole work and are not shown",
        );
    }

    let mut used = vec!["summary".to_string()];
    write_comparative_summary(&mut workbook, payload, &project, heading, &sub)?;

    if !payload.lead_rows.is_empty() {
        let body: Vec<ComparativeRowPayload> = payload
            .lead_rows
            .iter()
            .filter(|row| row.kind != "total")
            .cloned()
            .collect();
        let last_total = payload.lead_rows.iter().rev().find(|row| row.kind == "total");
        let lead_component = ComparativeComponentPayload {
            name: "Lead charges".to_string(),
            rows: body,
            left_total: last_total.and_then(|t| t.left).or(Some(0.0)),
            right_total: last_total.and_then(|t| t.right).or(Some(0.0)),
            difference: Some(0.0),
            percent: None,
        };
        write_comparative_component(&mut workbook, payload, &lead_component, &project, &mut used)?;
    }
    for component in &payload.components {
        write_comparative_component(&mut workbook, payload, component, &project, &mut used)?;
    }

    workbook.save_to_buffer()
}

// ============================================================================
// Seigniorage statement workbook ("Seigniorage Statement" sheet).
// Ports excel-output/seigniorageExcel.ts: title block, KPI cards linked by
// formula to the grand totals, one material-group block each with live
// ROUND/SUM formulas, grand totals, net-payable breakdown, rounded net,
// statutory note and signature block. Columns F/H feed I (`ROUND(F*H,2)`),
// I feeds J/K/L (`ROUND(I*0.30/0.02/permit%,2)`), subtotals SUM their group,
// the grand row SUMs the subtotals.
// ============================================================================

const SEIG_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const SEIG_QTY_FMT: &str = "#,##0.000";
const SEIG_ROUND_FMT: &str = "#,##0;[Red]-#,##0";
const SEIG_DEFAULT_PERMIT_BASIS: &str = "G.O.Ms.No.21, dt. 31.03.2022, w.e.f. 01.04.2022";

fn seig_permit_note(row: &SeigniorageRowPayload) -> String {
    if let Some(n) = &row.permit_note {
        return n.clone();
    }
    if row.permit.is_none() {
        return String::new();
    }
    if row.permit_percent == 0.0 {
        return "Exempt".to_string();
    }
    if row.permit_percent.fract() == 0.0 {
        format!("@ {}%", row.permit_percent as i64)
    } else {
        format!("@ {}%", row.permit_percent)
    }
}

pub fn generate_excel_seigniorage_workbook(
    payload: &SeignioragePayload,
) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let navy = Color::RGB(0x0B3D5C);
    let accent = Color::RGB(0x087E8B);
    let page_header = Color::RGB(0x1D3A54);
    let col_header = Color::RGB(0x007791);
    let group_fill = Color::RGB(0xE6F4F1);
    let subtotal_fill = Color::RGB(0xEDF7F6);
    let grand_fill = Color::RGB(0xD4EBF2);
    let net_fill = Color::RGB(0x0B3D5C);
    let even_fill = Color::RGB(0xF8FAFC);
    let kpi_fill = Color::RGB(0xF0F9FF);
    let dark = Color::RGB(0x0F172A);
    let muted = Color::RGB(0x475569);
    let white = Color::RGB(0xFFFFFF);

    let ws = workbook.add_worksheet();
    ws.set_name("Seigniorage Statement")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);

    let widths = [
        6.0, 18.0, 44.0, 14.0, 10.0, 16.0, 10.0, 14.0, 18.0, 16.0, 14.0, 17.0, 15.0,
    ];
    for (i, w) in widths.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
    }

    ws.merge_range(
        0,
        0,
        0,
        12,
        &payload.project_name.to_uppercase(),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(15.0)
            .set_bold()
            .set_font_color(navy)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(0, 28.0)?;
    ws.merge_range(
        1,
        0,
        1,
        12,
        "SEIGNIORAGE STATEMENT",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(13.0)
            .set_bold()
            .set_font_color(page_header)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(1, 24.0)?;
    ws.merge_range(
        2,
        0,
        2,
        12,
        &format!("Standard Schedule of Rates: {}", payload.sor_year),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(muted)
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(2, 18.0)?;
    ws.set_row_height(3, 6.0)?;

    // KPI cards (values are patched with formulas once totals are known).
    let kpi_label_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(9.0)
        .set_bold()
        .set_font_color(muted)
        .set_background_color(kpi_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let kpi_val_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(kpi_fill)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    for (s, e, label) in [
        (1u16, 2u16, "TOTAL SEIGNIORAGE"),
        (3, 4, "DMFT (30%)"),
        (5, 6, "SMFT (2%)"),
        (7, 8, "PERMIT FEE"),
        (9, 11, "GRAND TOTAL (ROUNDED)"),
    ] {
        ws.merge_range(4, s, 4, e, label, &kpi_label_fmt)?;
        ws.merge_range(5, s, 5, e, "", &kpi_val_fmt)?;
    }
    ws.set_row_height(4, 18.0)?;
    ws.set_row_height(5, 24.0)?;
    ws.set_row_height(6, 8.0)?;

    // Table header (row 7, 0-based).
    let header_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(col_header)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    for (i, h) in [
        "Sl.",
        "Item Code",
        "Description of Item & Mineral",
        "Work Qty",
        "Work Unit",
        "Seigniorage Qty",
        "Unit",
        "Rate (Rs.)",
        "Seigniorage (Rs.)",
        "DMFT 30% (Rs.)",
        "SMFT 2% (Rs.)",
        "Permit Fee (Rs.)",
        "Permit Rate",
    ]
    .iter()
    .enumerate()
    {
        ws.write_string_with_format(7, i as u16, h, &header_fmt)?;
    }
    ws.set_row_height(7, 32.0)?;
    ws.set_freeze_panes(8, 0)?;
    ws.set_repeat_rows(7, 7)?;

    let body_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let money_r = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let qty_r = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(dark)
        .set_num_format(SEIG_QTY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);

    let mut r: u32 = 8;
    let mut sl: u32 = 1;
    let mut subtotal_rows: Vec<u32> = Vec::new();

    if payload.groups.iter().all(|g| g.rows.is_empty()) {
        ws.merge_range(
            r,
            0,
            r,
            12,
            "No seigniorage DATA rows available in this project.",
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(11.0)
                .set_italic()
                .set_font_color(muted)
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter),
        )?;
        ws.set_row_height(r, 30.0)?;
        r += 1;
    }

    for group in &payload.groups {
        if group.rows.is_empty() {
            continue;
        }
        let heading = group
            .heading
            .clone()
            .filter(|h| !h.trim().is_empty())
            .unwrap_or_else(|| group.key.clone());
        ws.merge_range(
            r,
            0,
            r,
            12,
            &format!("MATERIAL GROUP: {}", heading.to_uppercase()),
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.5)
                .set_bold()
                .set_font_color(accent)
                .set_background_color(group_fill)
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin),
        )?;
        ws.set_row_height(r, 24.0)?;
        r += 1;

        let start_excel = r + 1;
        let mut pos_in_group = 0usize;
        for row in &group.rows {
            let excel = r + 1;
            let even_fill_opt = if pos_in_group % 2 == 1 {
                Some(even_fill)
            } else {
                None
            };
            let mut cell_fmt = body_fmt.clone();
            let mut cell_money = money_r.clone();
            let mut cell_qty = qty_r.clone();
            if let Some(fill) = even_fill_opt {
                cell_fmt = cell_fmt.set_background_color(fill);
                cell_money = cell_money.set_background_color(fill);
                cell_qty = cell_qty.set_background_color(fill);
            }

            ws.write_number_with_format(
                r,
                0,
                sl as f64,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            sl += 1;
            ws.write_string_with_format(
                r,
                1,
                &row.item_code,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            ws.write_string_with_format(
                r,
                2,
                &row.description,
                &cell_fmt.clone().set_align(FormatAlign::Left).set_text_wrap(),
            )?;
            write_opt_number(ws, r, 3, row.work_qty, &cell_qty)?;
            ws.write_string_with_format(
                r,
                4,
                &row.work_unit,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            write_opt_number(ws, r, 5, row.seig_qty, &cell_qty)?;
            ws.write_string_with_format(
                r,
                6,
                &row.seig_unit,
                &cell_fmt.clone().set_align(FormatAlign::Center),
            )?;
            write_opt_number(ws, r, 7, row.rate, &cell_money)?;

            let f_col = col_letter(5);
            let h_col = col_letter(7);
            if row.seig_qty.is_some() && row.rate.is_some() {
                ws.write_formula(
                    r,
                    8,
                    format!("=ROUND({f}{e}*{h}{e},2)", f = f_col, h = h_col, e = excel)
                        .as_str(),
                    &cell_money,
                )?;
            } else {
                ws.write_number_with_format(r, 8, row.seigniorage.unwrap_or(0.0), &cell_money)?;
            }
            ws.write_formula(
                r,
                9,
                format!("=ROUND(I{excel}*0.30,2)", excel = excel).as_str(),
                &cell_money,
            )?;
            ws.write_formula(
                r,
                10,
                format!("=ROUND(I{excel}*0.02,2)", excel = excel).as_str(),
                &cell_money,
            )?;
            if row.permit_percent > 0.0 {
                let factor = format!("{:.4}", row.permit_percent / 100.0);
                ws.write_formula(
                    r,
                    11,
                    format!("=ROUND(I{excel}*{factor},2)", excel = excel, factor = factor)
                        .as_str(),
                    &cell_money,
                )?;
            } else {
                ws.write_number_with_format(r, 11, 0.0, &cell_money)?;
            }
            ws.write_string_with_format(
                r,
                12,
                &seig_permit_note(row),
                &cell_fmt.set_align(FormatAlign::Center),
            )?;

            ws.set_row_height(r, 22.0)?;
            r += 1;
            pos_in_group += 1;
        }
        let end_excel = r; // 0-based r now past last row, so Excel row = r

        let sub_label = group.subtotal_label.clone().unwrap_or_else(|| {
            format!("Subtotal \u{2014} {}", heading)
        });
        ws.merge_range(
            r,
            0,
            r,
            7,
            &sub_label,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(dark)
                .set_background_color(subtotal_fill)
                .set_align(FormatAlign::Right)
                .set_align(FormatAlign::VerticalCenter)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_left(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin),
        )?;
        for (col, letter) in [(8u16, "I"), (9, "J"), (10, "K"), (11, "L")] {
            ws.write_formula(
                r,
                col,
                format!("=SUM({l}{s}:{l}{e})", l = letter, s = start_excel, e = end_excel)
                    .as_str(),
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(dark)
                    .set_background_color(subtotal_fill)
                    .set_num_format(SEIG_MONEY_FMT)
                    .set_align(FormatAlign::Right)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_top(FormatBorder::Medium)
                    .set_border_bottom(FormatBorder::Thin)
                    .set_border_left(FormatBorder::Thin)
                    .set_border_right(FormatBorder::Thin),
            )?;
        }
        ws.write_string_with_format(
            r,
            12,
            "",
            &Format::new()
                .set_background_color(subtotal_fill)
                .set_border_top(FormatBorder::Medium)
                .set_border_bottom(FormatBorder::Thin)
                .set_border_left(FormatBorder::Thin)
                .set_border_right(FormatBorder::Thin),
        )?;
        ws.set_row_height(r, 22.0)?;
        subtotal_rows.push(r);
        r += 1;
    }

    ws.set_row_height(r, 8.0)?;
    r += 1;

    // Grand total row.
    let grand = r;
    let grand1 = grand + 1;
    ws.merge_range(
        grand,
        0,
        grand,
        7,
        "GRAND TOTAL (ALL MATERIAL GROUPS)",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.0)
            .set_bold()
            .set_font_color(navy)
            .set_background_color(grand_fill)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    let grand_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(grand_fill)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_top(FormatBorder::Medium)
        .set_border_bottom(FormatBorder::Double)
        .set_border_left(FormatBorder::Thin)
        .set_border_right(FormatBorder::Thin);
    if subtotal_rows.is_empty() {
        for col in 8u16..=11u16 {
            ws.write_number_with_format(grand, col, 0.0, &grand_money)?;
        }
    } else {
        for (col, letter) in [(8u16, "I"), (9, "J"), (10, "K"), (11, "L")] {
            let refs: Vec<String> = subtotal_rows
                .iter()
                .map(|sr| format!("{}{}", letter, sr + 1))
                .collect();
            ws.write_formula(
                grand,
                col,
                format!("=SUM({})", refs.join(",")).as_str(),
                &grand_money,
            )?;
        }
    }
    ws.write_string_with_format(
        grand,
        12,
        "",
        &Format::new()
            .set_background_color(grand_fill)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    ws.set_row_height(grand, 25.0)?;
    r = grand + 1;
    ws.set_row_height(r, 8.0)?;
    r += 1;

    // Net-payable breakdown box.
    let breakdown: [(String, String, bool); 5] = [
        (
            "Total Seigniorage Fee".to_string(),
            format!("I{grand1}", grand1 = grand1),
            false,
        ),
        (
            "District Mineral Foundation Trust (DMFT 30%)".to_string(),
            format!("J{grand1}", grand1 = grand1),
            false,
        ),
        (
            "State Mineral Exploration Trust (SMFT 2%)".to_string(),
            format!("K{grand1}", grand1 = grand1),
            false,
        ),
        (
            "Mineral Transit Permit Fee".to_string(),
            format!("L{grand1}", grand1 = grand1),
            false,
        ),
        (
            "NET TOTAL SEIGNIORAGE CHARGES".to_string(),
            format!(
                "I{grand1}+J{grand1}+K{grand1}+L{grand1}",
                grand1 = grand1
            ),
            true,
        ),
    ];
    for (label, formula, bold) in &breakdown {
        let mut lbl = Format::new()
            .set_font_name("Calibri")
            .set_font_size(if *bold { 11.0 } else { 10.0 })
            .set_font_color(if *bold { navy } else { dark })
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        let mut val = Format::new()
            .set_font_name("Calibri")
            .set_font_size(if *bold { 11.0 } else { 10.0 })
            .set_font_color(if *bold { navy } else { dark })
            .set_num_format(SEIG_MONEY_FMT)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin);
        if *bold {
            lbl = lbl
                .set_bold()
                .set_background_color(grand_fill)
                .set_border_top(FormatBorder::Medium);
            val = val
                .set_bold()
                .set_background_color(grand_fill)
                .set_border_top(FormatBorder::Medium);
        }
        ws.merge_range(r, 5, r, 7, label, &lbl)?;
        ws.merge_range(r, 8, r, 11, "", &val)?;
        ws.write_formula(r, 8, format!("={}", formula).as_str(), &val)?;
        ws.set_row_height(r, if *bold { 24.0 } else { 20.0 })?;
        r += 1;
    }
    let net = r - 1;
    let net1 = net + 1;

    // Rounded net total payable.
    ws.merge_range(
        r,
        5,
        r,
        7,
        "ROUNDED NET TOTAL PAYABLE (Rs.)",
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.5)
            .set_bold()
            .set_font_color(white)
            .set_background_color(net_fill)
            .set_align(FormatAlign::Right)
            .set_align(FormatAlign::VerticalCenter)
            .set_border_top(FormatBorder::Medium)
            .set_border_bottom(FormatBorder::Double)
            .set_border_left(FormatBorder::Thin)
            .set_border_right(FormatBorder::Thin),
    )?;
    let round_val = Format::new()
        .set_font_name("Calibri")
        .set_font_size(12.0)
        .set_bold()
        .set_font_color(white)
        .set_background_color(net_fill)
        .set_num_format(SEIG_ROUND_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_border_top(FormatBorder::Medium)
        .set_border_bottom(FormatBorder::Double)
        .set_border_left(FormatBorder::Thin)
        .set_border_right(FormatBorder::Thin);
    ws.merge_range(r, 8, r, 11, "", &round_val)?;
    ws.write_formula(
        r,
        8,
        format!("=ROUND(I{net1},0)", net1 = net1).as_str(),
        &round_val,
    )?;
    ws.set_row_height(r, 26.0)?;
    let rounded = r;
    let rounded1 = rounded + 1;
    r += 1;

    // Link the top KPI cards to the grand/rounded rows.
    let kpi_money = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(navy)
        .set_background_color(kpi_fill)
        .set_num_format(SEIG_MONEY_FMT)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let kpi_round = Format::new()
        .set_font_name("Calibri")
        .set_font_size(11.0)
        .set_bold()
        .set_font_color(Color::RGB(0x007791))
        .set_background_color(kpi_fill)
        .set_num_format(SEIG_ROUND_FMT)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    ws.write_formula(
        5,
        1,
        format!("=I{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula(
        5,
        3,
        format!("=J{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula(
        5,
        5,
        format!("=K{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula(
        5,
        7,
        format!("=L{grand1}", grand1 = grand1).as_str(),
        &kpi_money,
    )?;
    ws.write_formula(
        5,
        9,
        format!("=I{rounded1}", rounded1 = rounded1).as_str(),
        &kpi_round,
    )?;

    ws.set_row_height(r, 12.0)?;
    r += 1;

    let basis = payload
        .permit_basis
        .clone()
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| SEIG_DEFAULT_PERMIT_BASIS.to_string());
    ws.merge_range(
        r,
        0,
        r,
        12,
        &format!(
            "Note: Transit permit fee is charged in accordance with {}. DMFT @ 30% and SMFT @ 2% are statutory levies computed on basic seigniorage.",
            basis
        ),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(9.5)
            .set_italic()
            .set_font_color(muted)
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(r, 20.0)?;
    r += 1;

    if !payload.signatures.is_empty() {
        ws.set_row_height(r, 18.0)?;
        r += 1;
        let n = payload.signatures.len().min(3);
        let span = (13 - 2) / n as u16;
        let sig_top = r + 2;
        for (idx, sig) in payload.signatures.iter().take(3).enumerate() {
            let start_col = 1 + idx as u16 * span;
            let end_col = start_col + span - 1;
            ws.merge_range(
                sig_top,
                start_col,
                sig_top,
                end_col,
                &sig.designation,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(navy)
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_border_top(FormatBorder::Thin),
            )?;
            if !sig.office.trim().is_empty() {
                ws.merge_range(
                    sig_top + 1,
                    start_col,
                    sig_top + 1,
                    end_col,
                    &sig.office,
                    &Format::new()
                        .set_font_name("Calibri")
                        .set_font_size(9.0)
                        .set_font_color(muted)
                        .set_align(FormatAlign::Center)
                        .set_align(FormatAlign::VerticalCenter),
                )?;
            }
        }
        ws.set_row_height(sig_top - 1, 25.0)?;
        ws.set_row_height(sig_top, 20.0)?;
        ws.set_row_height(sig_top + 1, 18.0)?;
        r = sig_top + 3;
    }

    ws.set_landscape();
    ws.set_header("&R&8&\"Calibri\"Generated by E-Estimate");
    ws.set_footer(&format!(
        "&L&8&\"Calibri\"{}&R&8&\"Calibri\"Page &P of &N",
        payload.project_name
    ));
    ws.set_print_area(0, 0, r.saturating_sub(1), 12)?;
    workbook.save_to_buffer()
}

// ============================================================================
// Lead statement workbook ("Lead Statement" sheet).
// Ports excel-output/leadExcel.ts: title block, A. Summary table, B.
// per-material detail (route, average/weighted audits, slab steps, handling
// and adopted rate), signature block. Missing figures render as an em dash.
// ============================================================================

const LEAD_MONEY_FMT: &str = "#,##0.00;[Red]-#,##0.00";
const LEAD_KM_FMT: &str = "#,##0.00";
const LEAD_SPAN: u16 = 7;

struct LeadCell {
    text: String,
    num: Option<f64>,
    fmt: Option<&'static str>,
    bold: bool,
    fill: Option<Color>,
    align: FormatAlign,
}

impl LeadCell {
    fn text(value: &str) -> Self {
        LeadCell {
            text: value.to_string(),
            num: None,
            fmt: None,
            bold: false,
            fill: None,
            align: FormatAlign::Left,
        }
    }
    fn num(value: Option<f64>, fmt: &'static str, align: FormatAlign) -> Self {
        LeadCell {
            text: "\u{2014}".to_string(),
            num: value,
            fmt: Some(fmt),
            bold: false,
            fill: None,
            align,
        }
    }
}

fn lead_title_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    text: &str,
) -> Result<(), XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        LEAD_SPAN,
        text,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(14.0)
            .set_bold()
            .set_font_color(Color::RGB(0xFFFFFF))
            .set_background_color(Color::RGB(0x0B3D5C))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(row, 24.0)?;
    Ok(())
}

fn lead_section_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    text: &str,
) -> Result<u32, XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        LEAD_SPAN,
        text,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(11.0)
            .set_bold()
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(Color::RGB(0xDBEAFE))
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter)
            .set_border(FormatBorder::Thin),
    )?;
    ws.set_row_height(row, 20.0)?;
    Ok(row + 1)
}

fn lead_header_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    headers: &[&str],
) -> Result<u32, XlsxError> {
    for (i, h) in headers.iter().enumerate() {
        ws.write_string_with_format(
            row,
            i as u16,
            h,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(Color::RGB(0xFFFFFF))
                .set_background_color(Color::RGB(0x0369A1))
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap()
                .set_border(FormatBorder::Thin),
        )?;
    }
    ws.set_row_height(row, 30.0)?;
    Ok(row + 1)
}

/// Body formats for merged detail rows: (center, left-wrap, right).
/// Only the merge top-left cells are ever written; interior merged cells are
/// left untouched.
fn lead_detail_fmts(even: bool) -> (Format, Format, Format) {
    let mut center = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut left = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut right = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    if even {
        let fill = Color::RGB(0xF8FAFC);
        center = center.set_background_color(fill);
        left = left.set_background_color(fill);
        right = right.set_background_color(fill);
    }
    (center, left, right)
}

fn lead_body_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    cells: &[LeadCell],
    even: bool,
) -> Result<u32, XlsxError> {
    let even_fill = Color::RGB(0xF8FAFC);
    for (i, entry) in cells.iter().enumerate() {
        let col = i as u16;
        let mut fmt = Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(Color::RGB(0x0F172A))
            .set_align(entry.align)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin);
        if entry.bold {
            fmt = fmt.set_bold();
        }
        let fill = entry.fill.or(if even { Some(even_fill) } else { None });
        if let Some(fill) = fill {
            fmt = fmt.set_background_color(fill);
        }
        match entry.num {
            Some(n) if n.is_finite() => {
                if let Some(nf) = entry.fmt {
                    fmt = fmt.set_num_format(nf);
                }
                ws.write_number_with_format(row, col, n, &fmt)?;
            }
            _ => {
                ws.write_string_with_format(row, col, &entry.text, &fmt)?;
            }
        }
    }
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_note_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    label: &str,
    value: &str,
    fill: Color,
) -> Result<u32, XlsxError> {
    ws.merge_range(
        row,
        0,
        row,
        1,
        label,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_bold()
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(fill)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin),
    )?;
    ws.merge_range(
        row,
        2,
        row,
        LEAD_SPAN,
        value,
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(fill)
            .set_align(FormatAlign::VerticalCenter)
            .set_text_wrap()
            .set_border(FormatBorder::Thin),
    )?;
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_span_header(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    spans: &[(u16, u16, &str)],
) -> Result<u32, XlsxError> {
    for (from, to, _) in spans {
        if *to > *from {
            ws.merge_range(
                row,
                *from,
                row,
                *to,
                "",
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0xFFFFFF))
                    .set_background_color(Color::RGB(0x0369A1))
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
        }
    }
    for (from, _, text) in spans {
        ws.write_string_with_format(
            row,
            *from,
            text,
            &Format::new()
                .set_font_name("Calibri")
                .set_font_size(10.0)
                .set_bold()
                .set_font_color(Color::RGB(0xFFFFFF))
                .set_background_color(Color::RGB(0x0369A1))
                .set_align(FormatAlign::Center)
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap()
                .set_border(FormatBorder::Thin),
        )?;
    }
    ws.set_row_height(row, 30.0)?;
    Ok(row + 1)
}

fn lead_amount_row(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    label: &str,
    amount: Option<f64>,
    bold: bool,
    fill: Option<Color>,
) -> Result<u32, XlsxError> {
    let mut label_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    let mut amount_fmt = Format::new()
        .set_font_name("Calibri")
        .set_font_size(10.0)
        .set_font_color(Color::RGB(0x0F172A))
        .set_num_format(LEAD_MONEY_FMT)
        .set_align(FormatAlign::Right)
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_border(FormatBorder::Thin);
    if bold {
        label_fmt = label_fmt.set_bold();
        amount_fmt = amount_fmt.set_bold();
    }
    if let Some(fill) = fill {
        label_fmt = label_fmt.set_background_color(fill);
        amount_fmt = amount_fmt.set_background_color(fill);
    }
    ws.merge_range(row, 0, row, 5, label, &label_fmt)?;
    ws.merge_range(
        row,
        6,
        row,
        LEAD_SPAN,
        match amount {
            Some(_) => "",
            None => "\u{2014}",
        },
        &amount_fmt,
    )?;
    if let Some(n) = amount {
        if n.is_finite() {
            ws.write_number_with_format(row, 6, n, &amount_fmt)?;
        }
    }
    ws.set_row_height(row, 18.0)?;
    Ok(row + 1)
}

fn lead_step_amount(step: &LeadStepPayload) -> Option<f64> {
    if let Some(n) = json_opt_f64(&step.amount_value) {
        return Some(n);
    }
    match &step.amount {
        Some(serde_json::Value::String(s)) => parse_first_number(s),
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        _ => None,
    }
}

fn lead_display(v: &Option<serde_json::Value>, missing: &str) -> String {
    match v {
        Some(serde_json::Value::String(s)) => {
            if s.trim().is_empty() {
                missing.to_string()
            } else {
                s.clone()
            }
        }
        Some(serde_json::Value::Number(n)) => {
            if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 {
                    format!("{}", f as i64)
                } else {
                    format!("{}", f)
                }
            } else {
                missing.to_string()
            }
        }
        _ => missing.to_string(),
    }
}

pub fn generate_excel_lead_workbook(payload: &LeadPayload) -> Result<Vec<u8>, XlsxError> {
    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();
    ws.set_name("Lead Statement")?;
    ws.set_landscape();
    ws.set_print_fit_to_pages(1, 0);
    for (i, w) in [6.0, 42.0, 38.0, 12.0, 12.0, 10.0, 16.0, 10.0]
        .iter()
        .enumerate()
    {
        ws.set_column_width(i as u16, *w)?;
    }

    let project = if payload.project.trim().is_empty() {
        "Estimate"
    } else {
        payload.project.trim()
    };
    let mut r: u32 = 0;
    lead_title_row(ws, r, project)?;
    r += 1;
    lead_title_row(
        ws,
        r,
        if payload.title.trim().is_empty() {
            "LEAD STATEMENT & CONVEYANCE CHARGES"
        } else {
            payload.title.trim()
        },
    )?;
    r += 1;
    ws.merge_range(
        r,
        0,
        r,
        LEAD_SPAN,
        &format!(
            "{} \u{00B7} {} \u{00B7} {}",
            payload.subtitle, payload.year, payload.zone
        ),
        &Format::new()
            .set_font_name("Calibri")
            .set_font_size(10.0)
            .set_italic()
            .set_font_color(Color::RGB(0x475569))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter),
    )?;
    ws.set_row_height(r, 18.0)?;
    r += 1;
    if let Some(notes) = &payload.notes {
        if !notes.trim().is_empty() {
            ws.merge_range(
                r,
                0,
                r,
                LEAD_SPAN,
                notes,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(9.0)
                    .set_font_color(Color::RGB(0x475569))
                    .set_align(FormatAlign::Center)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap(),
            )?;
            r += 1;
        }
    }
    r += 1;

    r = lead_section_row(ws, r, "A. Summary")?;
    let summary_header = r;
    r = lead_header_row(
        ws,
        r,
        &[
            "Sl.",
            "Material",
            "Route / Quarry",
            "Class",
            "Lead (km)",
            "Lift (m)",
            "Rate (Rs)",
            "Uses",
        ],
    )?;
    for (i, item) in payload.rows.iter().enumerate() {
        let name = match &item.tag {
            Some(t) if !t.trim().is_empty() => {
                format!("{} [{}]", item.name, t.trim())
            }
            _ => item.name.clone(),
        };
        let mut rate_cell = LeadCell::num(
            json_opt_f64(&item.rate),
            LEAD_MONEY_FMT,
            FormatAlign::Right,
        );
        rate_cell.bold = true;
        let cells = [
            LeadCell {
                text: item.sl.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
            LeadCell::text(&name),
            LeadCell::text(&item.quarry),
            LeadCell {
                text: item.class.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
            LeadCell::num(json_opt_f64(&item.lead_km), LEAD_KM_FMT, FormatAlign::Right),
            LeadCell::num(json_opt_f64(&item.lift_m), LEAD_KM_FMT, FormatAlign::Right),
            rate_cell,
            LeadCell {
                text: item.uses.clone(),
                num: None,
                fmt: None,
                bold: false,
                fill: None,
                align: FormatAlign::Center,
            },
        ];
        r = lead_body_row(ws, r, &cells, i % 2 == 1)?;
    }
    if !payload.rows.is_empty() {
        ws.autofilter(summary_header, 0, r - 1, LEAD_SPAN)?;
    }
    ws.set_freeze_panes(summary_header + 1, 0)?;
    r += 1;

    r = lead_section_row(ws, r, "B. Detailed Lead Rate Calculations")?;
    let avg_fill = Color::RGB(0xF0FDF4);
    let weighted_fill = Color::RGB(0xEFF6FF);
    let total_fill = Color::RGB(0xDBEAFE);
    let note_white = Color::RGB(0xFFFFFF);
    for material in &payload.materials {
        let heading = format!(
            "{}. {} ({}){}",
            material.sl,
            material.name,
            material.lead_km_text,
            match &material.tag {
                Some(t) if !t.trim().is_empty() => format!(" \u{2014} {}", t.trim()),
                _ => String::new(),
            }
        );
        r = lead_section_row(ws, r, &heading)?;
        r = lead_note_row(ws, r, "Route", &material.route, note_white)?;

        if let Some(avg) = &material.avg_lead {
            r = lead_note_row(ws, r, "Sampling Mode", &avg.mode_label, avg_fill)?;
            r = lead_note_row(ws, r, "Component", &avg.component_name, avg_fill)?;
            r = lead_note_row(
                ws,
                r,
                "Total Points",
                &lead_display(&avg.point_count, "\u{2014}"),
                avg_fill,
            )?;
            r = lead_note_row(
                ws,
                r,
                "Adopted Average",
                &format!("{} km", avg.avg_km_text),
                avg_fill,
            )?;
            if !avg.routes.is_empty() {
                r = lead_span_header(
                    ws,
                    r,
                    &[
                        (0, 0, "Pt"),
                        (1, 4, "Chainage along line"),
                        (5, 7, "Route Distance"),
                    ],
                )?;
                for (pi, point) in avg.routes.iter().enumerate() {
                    let chainage = if !point.chainage_text.trim().is_empty() {
                        format!("Ch {} (along line)", point.chainage_text.trim())
                    } else if let Some(m) = point.chainage_m {
                        format!("Ch {} m (along line)", m)
                    } else {
                        "\u{2014}".to_string()
                    };
                    let route_km = if !point.route_km_text.trim().is_empty() {
                        parse_first_number(&point.route_km_text)
                    } else {
                        json_opt_f64(&point.route_km)
                    };
                    let pt_text = lead_display(&point.index, "");
                    let pt_num = json_opt_f64(&point.index);
                    let (pt_fmt, chain_fmt, km_fmt) = lead_detail_fmts(pi % 2 == 1);
                    match pt_num {
                        Some(n) if n.is_finite() => {
                            ws.write_number_with_format(r, 0, n, &pt_fmt)?;
                        }
                        _ => {
                            let t = if pt_text.is_empty() {
                                (pi + 1).to_string()
                            } else {
                                pt_text
                            };
                            ws.write_string_with_format(r, 0, &t, &pt_fmt)?;
                        }
                    }
                    ws.merge_range(r, 1, r, 4, &chainage, &chain_fmt)?;
                    ws.merge_range(r, 5, r, LEAD_SPAN, "", &km_fmt)?;
                    match route_km {
                        Some(n) if n.is_finite() => {
                            ws.write_number_with_format(
                                r,
                                5,
                                n,
                                &km_fmt.clone().set_num_format(LEAD_KM_FMT),
                            )?;
                        }
                        _ => {
                            ws.write_string_with_format(r, 5, "\u{2014}", &km_fmt)?;
                        }
                    }
                    ws.set_row_height(r, 18.0)?;
                    r += 1;
                }
            }
        }

        if let Some(weighted) = &material.weighted_lead {
            r = lead_note_row(ws, r, "Formula", &weighted.formula, weighted_fill)?;
            r = lead_span_header(
                ws,
                r,
                &[
                    (0, 2, "Source Variant"),
                    (3, 4, "Lead (km)"),
                    (5, 5, "Quantity"),
                    (6, 7, "Weight \u{00D7} Lead"),
                ],
            )?;
            for (ei, entry) in weighted.entries.iter().enumerate() {
                let qty = format!("{} {}", entry.quantity_text, entry.unit);
                let (_, name_fmt, right_fmt) = lead_detail_fmts(ei % 2 == 1);
                ws.merge_range(r, 0, r, 2, &entry.name, &name_fmt)?;
                ws.merge_range(r, 3, r, 4, "", &right_fmt)?;
                match json_opt_f64(&entry.lead_km) {
                    Some(n) if n.is_finite() => {
                        ws.write_number_with_format(
                            r,
                            3,
                            n,
                            &right_fmt.clone().set_num_format(LEAD_KM_FMT),
                        )?;
                    }
                    _ => {
                        ws.write_string_with_format(r, 3, "\u{2014}", &right_fmt)?;
                    }
                }
                ws.write_string_with_format(r, 5, &qty, &right_fmt)?;
                ws.merge_range(r, 6, r, LEAD_SPAN, "", &right_fmt)?;
                match json_opt_f64(&entry.product) {
                    Some(n) if n.is_finite() => {
                        ws.write_number_with_format(
                            r,
                            6,
                            n,
                            &right_fmt.clone().set_num_format(LEAD_MONEY_FMT),
                        )?;
                    }
                    _ => {
                        ws.write_string_with_format(r, 6, "\u{2014}", &right_fmt)?;
                    }
                }
                ws.set_row_height(r, 18.0)?;
                r += 1;
            }
            let merge_border = Format::new().set_border(FormatBorder::Thin);
            ws.merge_range(r, 0, r, 4, "", &merge_border)?;
            ws.merge_range(r, 5, r, LEAD_SPAN, "", &merge_border)?;
            ws.write_string_with_format(
                r,
                0,
                &format!("Total Quantity (W): {}", weighted.total_quantity_text),
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_background_color(total_fill)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
            ws.write_string_with_format(
                r,
                5,
                &format!("Weighted Avg: {} km", weighted.weighted_avg_km_text),
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_background_color(total_fill)
                    .set_align(FormatAlign::VerticalCenter)
                    .set_text_wrap()
                    .set_border(FormatBorder::Thin),
            )?;
            ws.set_row_height(r, 18.0)?;
            r += 1;
        }

        r = lead_span_header(
            ws,
            r,
            &[
                (0, 3, "Calculation Step / Slab"),
                (4, 5, "Distance / Mode"),
                (6, 7, "Amount (Rs)"),
            ],
        )?;
        for (si, step) in material.steps.iter().enumerate() {
            let label = if step.label.trim().is_empty() {
                "\u{2014}"
            } else {
                step.label.trim()
            };
            let expr = if step.expression.trim().is_empty() {
                "\u{2014}"
            } else {
                step.expression.trim()
            };
            let (expr_fmt, label_fmt, amt_fmt) = lead_detail_fmts(si % 2 == 1);
            ws.merge_range(r, 0, r, 3, label, &label_fmt)?;
            ws.merge_range(r, 4, r, 5, expr, &expr_fmt)?;
            ws.merge_range(r, 6, r, LEAD_SPAN, "", &amt_fmt)?;
            match lead_step_amount(step) {
                Some(n) if n.is_finite() => {
                    ws.write_number_with_format(
                        r,
                        6,
                        n,
                        &amt_fmt.clone().set_num_format(LEAD_MONEY_FMT),
                    )?;
                }
                _ => {
                    ws.write_string_with_format(r, 6, "\u{2014}", &amt_fmt)?;
                }
            }
            ws.set_row_height(r, 18.0)?;
            r += 1;
        }

        if let Some(calc) = &material.calculation {
            r = lead_amount_row(ws, r, "Material lead rate", calc.lead_rate, false, None)?;
            if calc.loading_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!("Loading ({})", material.rate_unit),
                    calc.loading_rate,
                    false,
                    None,
                )?;
            }
            if calc.unloading_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!("Unloading ({})", material.rate_unit),
                    calc.unloading_rate,
                    false,
                    None,
                )?;
            }
            if calc.lift_rate.unwrap_or(0.0) != 0.0 {
                r = lead_amount_row(
                    ws,
                    r,
                    &format!(
                        "Lift ({} m; chargeable {} m)",
                        lead_display(&material.lift_m, "0"),
                        lead_display(&material.charged_lift_m, "0")
                    ),
                    calc.lift_rate,
                    false,
                    None,
                )?;
            }
            let handling = calc.loading_rate.unwrap_or(0.0)
                + calc.unloading_rate.unwrap_or(0.0)
                + calc.lift_rate.unwrap_or(0.0);
            if handling != 0.0 {
                let adopted = json_opt_f64(&material.rate)
                    .or_else(|| calc.lead_rate.map(|lead| lead + handling));
                r = lead_amount_row(ws, r, "With handling/lift", adopted, true, None)?;
            }
        }
        r = lead_amount_row(
            ws,
            r,
            &format!("Adopted Rate per {}", material.rate_unit),
            json_opt_f64(&material.rate),
            true,
            Some(total_fill),
        )?;
        r += 1;
    }

    if !payload.signature.is_empty() {
        r = lead_section_row(ws, r, "Signature")?;
        for entry in &payload.signature {
            ws.merge_range(
                r,
                0,
                r,
                3,
                &entry.designation,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_bold()
                    .set_font_color(Color::RGB(0x0F172A))
                    .set_border(FormatBorder::Thin),
            )?;
            ws.merge_range(
                r,
                4,
                r,
                LEAD_SPAN,
                &entry.office,
                &Format::new()
                    .set_font_name("Calibri")
                    .set_font_size(10.0)
                    .set_font_color(Color::RGB(0x475569))
                    .set_border(FormatBorder::Thin),
            )?;
            ws.set_row_height(r, 30.0)?;
            r += 1;
        }
    }

    ws.set_repeat_rows(summary_header, summary_header)?;
    ws.set_header("&R&8&\"Calibri\"Generated by E-Estimate");
    ws.set_footer(&format!(
        "&L&8&\"Calibri\"{}&R&8&\"Calibri\"Page &P of &N",
        project
    ));
    ws.set_print_area(0, 0, r.saturating_sub(1), LEAD_SPAN)?;
    workbook.save_to_buffer()
}

// ============================================================================
// Dispatcher: routes the excel_compile payload to the matching builder.
// ============================================================================

pub fn generate_workbook(req: &ExcelCompileRequest) -> Result<Vec<u8>, String> {
    let run = |result: Result<Vec<u8>, XlsxError>| {
        result.map_err(|e| format!("Excel compilation error: {:?}", e))
    };
    match req.kind {
        ExcelKind::Data => run(generate_excel_data_workbook(req)),
        ExcelKind::Boq => match &req.boq {
            Some(p) => run(generate_excel_boq_workbook(p)),
            None => Err(
                "Excel compilation error: kind is 'boq' but no 'boq' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Comparative => match &req.comparative {
            Some(p) => run(generate_excel_comparative_workbook(p)),
            None => Err(
                "Excel compilation error: kind is 'comparative' but no 'comparative' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Seigniorage => match &req.seigniorage {
            Some(p) => run(generate_excel_seigniorage_workbook(p)),
            None => Err(
                "Excel compilation error: kind is 'seigniorage' but no 'seigniorage' payload was provided."
                    .to_string(),
            ),
        },
        ExcelKind::Lead => match &req.lead {
            Some(p) => run(generate_excel_lead_workbook(p)),
            None => Err(
                "Excel compilation error: kind is 'lead' but no 'lead' payload was provided."
                    .to_string(),
            ),
        },
    }
}

static EXCEL_CACHE_INIT: Once = Once::new();
static EXCEL_UNIQUE: AtomicU64 = AtomicU64::new(0);

/// Session cache dir for prefer_path workbooks (own subdir so the Typst and
/// Excel cleaners never wipe each other's files). Cleared once per boot.
fn excel_cache_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("e-estimate-compile-cache").join("excel");
    EXCEL_CACHE_INIT.call_once(|| {
        let _ = fs::remove_dir_all(&dir);
    });
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn excel_compile(payload: ExcelCompileRequest) -> Result<ExcelCompileResult, String> {
    let start = Instant::now();
    let duration_ms = || (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;
    // `kind` selects the builder; a missing kind means the legacy DATA path,
    // whose bytes are identical to before.
    match generate_workbook(&payload) {
        Ok(bytes) => {
            if payload.prefer_path.unwrap_or(false) {
                let dir = excel_cache_dir()?;
                let n = EXCEL_UNIQUE.fetch_add(1, Ordering::Relaxed);
                let path = dir.join(format!("workbook-{n}.xlsx"));
                fs::write(&path, &bytes).map_err(|e| e.to_string())?;
                return Ok(ExcelCompileResult {
                    ok: true,
                    data: None,
                    file_path: Some(path.to_string_lossy().to_string()),
                    error: None,
                    duration_ms: Some(duration_ms()),
                });
            }
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            Ok(ExcelCompileResult {
                ok: true,
                data: Some(b64),
                file_path: None,
                error: None,
                duration_ms: Some(duration_ms()),
            })
        }
        Err(msg) => Ok(ExcelCompileResult {
            ok: false,
            data: None,
            file_path: None,
            error: Some(msg),
            duration_ms: Some(duration_ms()),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_excel_compile_basic() {
        let req = ExcelCompileRequest {
            project_name: Some("Test Project".into()),
            sor_year: Some("2026-27".into()),
            sor_zone: Some("zone_3".into()),
            recipes: vec![ExcelRecipe {
                code: "SSR-1.1".into(),
                description: Some("Earth work excavation in ordinary soil".into()),
                unit: Some("cum".into()),
                section_heading: Some("Earthwork".into()),
                document_title: None,
                multi_rate_note: None,
                materials: vec![],
                machinery: vec![],
                labour: vec![CostTableLine {
                    sl: Some(serde_json::json!("1")),
                    description: Some("Mazdoor".into()),
                    unit: Some("day".into()),
                    quantity: Some(serde_json::json!(0.5)),
                    rate: Some(serde_json::json!(450.0)),
                    amount: Some(serde_json::json!(225.0)),
                }],
                totals: Some(Totals {
                    output_quantity: Some(1.0),
                    material_total: Some(0.0),
                    machinery_total: Some(0.0),
                    labour_total: Some(225.0),
                    overhead_percent: Some(14.0),
                    overhead_amount: Some(31.5),
                    base_cost: Some(225.0),
                    total_cost: Some(256.5),
                    rate_per_unit: Some(256.5),
                    labour_unit_base: Some(225.0),
                    labour_unit_profit: Some(31.5),
                    labour_unit_total: Some(256.5),
                    area_allowance_percent: Some(0.0),
                    area_allowance_amount: Some(0.0),
                }),
                labour_summary_rows: None,
                abstract_rows: None,
                leads: None,
                lead_summary: None,
                optional_addition: None,
                rate_variant: None,
                area_allowance_label: None,
                scope_label: None,
            }],
            sor: vec![ExcelSorItem {
                sl: 1,
                description: "PCC 1:2:4".into(),
                unit: "cum".into(),
                rate: Some(5400.0),
                rate_text: None,
            }],
            ..Default::default()
        };

        let res = generate_excel_data_workbook(&req);
        assert!(res.is_ok());
        let bytes = res.unwrap();
        assert!(!bytes.is_empty());
        // Verify ZIP / XLSX magic bytes
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_excel_boq_workbook() {
        let req = ExcelCompileRequest {
            kind: ExcelKind::Boq,
            boq: Some(BoqPayload {
                project_name: "Test Project".into(),
                component_name: "Bund".into(),
                is_subcomponent: false,
                rows: vec![BoqRowPayload {
                    sl: "1".into(),
                    code: "IRR-CAW-1-1".into(),
                    heading: "Earth work".into(),
                    description: "Excavation in ordinary soil".into(),
                    quantity: Some(100.0),
                    unit: "cum".into(),
                    rate: Some(50.0),
                    amount: Some(5000.0),
                }],
                total_cost: Some(5000.0),
            }),
            ..Default::default()
        };
        let bytes = generate_workbook(&req).expect("boq workbook");
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_excel_comparative_workbook() {
        let row = |label: &str, left: Option<f64>, right: Option<f64>| ComparativeRowPayload {
            sl_no: Some(serde_json::json!(1)),
            label: label.into(),
            description: None,
            unit: None,
            quantity: None,
            left_rate: None,
            right_rate: None,
            left,
            right,
            difference: match (left, right) {
                (Some(l), Some(r)) => Some(r - l),
                _ => None,
            },
            percent: Some(25.0),
            kind: "item".into(),
        };
        let req = ExcelCompileRequest {
            kind: ExcelKind::Comparative,
            comparative: Some(ComparativePayload {
                project_name: "Test Project".into(),
                root_name: None,
                left_year: "2024-25".into(),
                right_year: "2025-26".into(),
                whole_estimate: true,
                warnings: vec![],
                abstract_rows: vec![row("Bund", Some(100.0), Some(125.0))],
                components: vec![ComparativeComponentPayload {
                    name: "Bund".into(),
                    rows: vec![row("Earth work", Some(100.0), None)],
                    left_total: Some(100.0),
                    right_total: None,
                    difference: None,
                    percent: None,
                }],
                lead_rows: vec![],
            }),
            ..Default::default()
        };
        let bytes = generate_workbook(&req).expect("comparative workbook");
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_excel_seigniorage_workbook() {
        let req = ExcelCompileRequest {
            kind: ExcelKind::Seigniorage,
            seigniorage: Some(SeignioragePayload {
                project_name: "Test Project".into(),
                sor_year: "2025-26".into(),
                permit_basis: None,
                groups: vec![SeigniorageGroupPayload {
                    key: "STONE".into(),
                    heading: Some("Stone".into()),
                    subtotal_label: None,
                    rows: vec![SeigniorageRowPayload {
                        item_code: "IRR-A-1".into(),
                        description: "Building stone".into(),
                        work_qty: Some(10.0),
                        work_unit: "cum".into(),
                        seig_qty: Some(10.0),
                        seig_unit: "cum".into(),
                        rate: Some(100.0),
                        seigniorage: Some(1000.0),
                        dmft: Some(300.0),
                        smft: Some(20.0),
                        permit: Some(800.0),
                        permit_percent: 80.0,
                        permit_note: None,
                    }],
                }],
                totals: SeigniorageTotalsPayload {
                    total_seigniorage: 1000.0,
                    total_dmft: 300.0,
                    total_smft: 20.0,
                    total_permit: 800.0,
                    grand_total: 2120.0,
                    rounded_grand_total: 2120.0,
                },
                signatures: vec![],
            }),
            ..Default::default()
        };
        let bytes = generate_workbook(&req).expect("seigniorage workbook");
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_excel_lead_workbook() {
        let req = ExcelCompileRequest {
            kind: ExcelKind::Lead,
            lead: Some(LeadPayload {
                project: "Test Project".into(),
                title: "LEAD STATEMENT & CONVEYANCE CHARGES".into(),
                subtitle: "Sub".into(),
                year: "2025-26".into(),
                zone: "zone_3".into(),
                notes: None,
                rows: vec![LeadSummaryRowPayload {
                    sl: "1".into(),
                    name: "Coarse aggregate".into(),
                    quarry: "Quarry A".into(),
                    class: "METAL".into(),
                    lead_km: Some(serde_json::json!("12.50 km")),
                    lift_m: None,
                    rate: Some(serde_json::json!(150.0)),
                    uses: "2".into(),
                    tag: None,
                }],
                materials: vec![LeadMaterialPayload {
                    sl: "1".into(),
                    name: "Coarse aggregate".into(),
                    lead_km_text: "12.50 km".into(),
                    tag: None,
                    route: "Quarry A".into(),
                    rate_unit: "cum".into(),
                    lift_m: None,
                    charged_lift_m: None,
                    rate: Some(serde_json::json!(150.0)),
                    avg_lead: None,
                    weighted_lead: None,
                    steps: vec![LeadStepPayload {
                        label: "Cartage".into(),
                        expression: "12.5 km".into(),
                        amount: Some(serde_json::json!(140.0)),
                        amount_value: None,
                    }],
                    calculation: Some(LeadCalcPayload {
                        lead_rate: Some(140.0),
                        loading_rate: Some(10.0),
                        unloading_rate: None,
                        lift_rate: None,
                    }),
                }],
                signature: vec![],
            }),
            ..Default::default()
        };
        let bytes = generate_workbook(&req).expect("lead workbook");
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn test_excel_missing_kind_payload_errors() {
        let req = ExcelCompileRequest {
            kind: ExcelKind::Boq,
            ..Default::default()
        };
        assert!(generate_workbook(&req).is_err());
    }
}
