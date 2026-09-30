use serde::Deserialize;

use super::grid::DetailGridPayload;

/// Front Page (cover) workbook. Ports cover.typ fed by `coverExcelFields`.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct CoverPayload {
    #[serde(default, alias = "workName")]
    pub work_name: String,
    #[serde(default)]
    pub village: String,
    #[serde(default)]
    pub mandal: String,
    #[serde(default)]
    pub district: String,
    #[serde(default, alias = "ssrYear")]
    pub ssr_year: String,
    #[serde(default, alias = "estimatedCost")]
    pub estimated_cost: String,
    #[serde(default, alias = "emblemBase64")]
    pub emblem_base64: Option<String>,
}

/// Introduction / item-sheet page workbook: one pre-composed grid (identity
/// header + estimator detail + signatures) on a single sheet.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct PagePayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub grid: DetailGridPayload,
    #[serde(default)]
    pub landscape: bool,
    /// Referenced item sheets, written as extra tabs so native cross-sheet
    /// formulas (`'Tab'!C18`) resolve. Empty keeps the legacy single sheet.
    #[serde(default, alias = "extraSheets")]
    pub extra_sheets: Vec<ExtraSheetPayload>,
}

/// One referenced grid exported as an extra tab at natural coordinates.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct ExtraSheetPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub grid: DetailGridPayload,
}
