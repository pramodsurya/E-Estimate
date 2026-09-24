use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::*;

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
    #[serde(default)]
    pub component: Option<ComponentPayload>,
    #[serde(default)]
    pub bund: Option<BundPayload>,
    #[serde(default)]
    pub guidewall: Option<GuideWallPayload>,
    #[serde(default)]
    pub cover: Option<CoverPayload>,
    #[serde(default)]
    pub page: Option<PagePayload>,
    #[serde(default)]
    pub project: Option<ProjectPayload>,
    /// Project/default document settings, followed by optional per-tab overrides.
    #[serde(default, alias = "printSettings")]
    pub print_settings: Option<ExcelPrintSettingsPayload>,
    #[serde(default, alias = "sheetPrintSettings")]
    pub sheet_print_settings: HashMap<String, ExcelPrintSettingsPayload>,
    /// DATA uses the same inherited sign-off settings as the PDF DATA book.
    #[serde(default, alias = "dataSignature")]
    pub data_signature: Option<DataSignaturePayload>,
    /// When true, the workbook is written to the session cache dir and the
    /// result carries `filePath` instead of base64 `data`. Old callers get
    /// exactly today's base64 behavior.
    #[serde(default, alias = "preferPath")]
    pub prefer_path: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct DataSignaturePayload {
    #[serde(default)]
    pub placement: String,
    #[serde(default)]
    pub rows: Vec<SignaturePayload>,
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
//   component   -> { projectName, componentName, componentCode, isSubcomponent,
//                   abstractRows: [{ sl, code, heading, description,
//                                    quantity|null, unit, rate|null, amount|null,
//                                    subtotal }],
//                   totalCost, items: [{ sl, code, name, unit, description }],
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
    Component,
    Cover,
    Page,
    Bund,
    Guidewall,
    Project,
}
