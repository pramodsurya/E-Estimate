use serde::Deserialize;

use super::common::default_true;
use super::grid::DetailGridPayload;

/// One project sheet: a pre-composed grid plus its orientation.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct ProjectSheetPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub grid: DetailGridPayload,
    #[serde(default = "default_true")]
    pub landscape: bool,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ProjectFormulaLink {
    #[serde(default)]
    pub sheet: String,
    #[serde(default)]
    pub r: u32,
    #[serde(default)]
    pub c: u32,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub key: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ProjectPayload {
    #[serde(default)]
    pub sheets: Vec<ProjectSheetPayload>,
    #[serde(default)]
    pub links: Vec<ProjectFormulaLink>,
    #[serde(default, alias = "seigniorageLinks")]
    pub seigniorage_links: Vec<ProjectSeigniorageLink>,
    #[serde(default, alias = "coverCostRef")]
    pub cover_cost_ref: String,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ProjectSeigniorageTermLink {
    #[serde(default)]
    pub formula: String,
    #[serde(default, alias = "leadVariantId")]
    pub lead_variant_id: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ProjectSeigniorageLink {
    #[serde(default)]
    pub key: String,
    #[serde(default, alias = "workQtyFormula")]
    pub work_qty_formula: Option<String>,
    #[serde(default)]
    pub terms: Vec<ProjectSeigniorageTermLink>,
}
