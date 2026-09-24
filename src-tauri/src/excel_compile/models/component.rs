use serde::Deserialize;

use super::common::default_true;
use super::grid::*;

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComponentAbstractRowPayload {
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
    #[serde(default, alias = "subtotal")]
    pub subtotal: bool,
    /// Live reference to the detail quantity cell; null = static value.
    #[serde(default, alias = "qtyFormula")]
    pub qty_formula: Option<String>,
    /// Qty Ã— abstract rate cell; null = static value.
    #[serde(default, alias = "amountFormula")]
    pub amount_formula: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComponentSignaturePayload {
    #[serde(default)]
    pub designation: String,
    #[serde(default)]
    pub office: String,
}

#[derive(Debug, Deserialize, Clone, Default)]

pub struct ComponentDetailSheetPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub grid: DetailGridPayload,
    #[serde(default = "default_true")]
    pub landscape: bool,
}

/// One bund template sheet: a pre-composed grid plus its orientation.
/// The statement sheet is always landscape; the rest follow the content
/// document settings (mirrors `bundDocumentSettings` / the mid-document
/// `#set page` in bund.typ).
#[derive(Debug, Deserialize, Clone, Default)]
pub struct BundSheetPayload {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub grid: DetailGridPayload,
    #[serde(default = "default_true")]
    pub landscape: bool,
}

/// Bund template workbook: the component payload (Abstract, Items register,
/// externally-added details) with the bund sheets injected between the
/// Items register and the details.
#[derive(Debug, Deserialize, Clone, Default)]
pub struct BundPayload {
    #[serde(default)]
    pub component: ComponentPayload,
    #[serde(default)]
    pub sheets: Vec<BundSheetPayload>,
}

/// Guide-wall template workbook: same wire shape as bund (the sheet payload
/// is template-agnostic: name + grid + orientation).
#[derive(Debug, Deserialize, Clone, Default)]
pub struct GuideWallPayload {
    #[serde(default)]
    pub component: ComponentPayload,
    #[serde(default)]
    pub sheets: Vec<BundSheetPayload>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ComponentPayload {
    #[serde(default, alias = "projectName")]
    pub project_name: String,
    #[serde(default, alias = "componentName")]
    pub component_name: String,
    #[serde(default, alias = "componentCode")]
    pub component_code: String,
    #[serde(default, alias = "isSubcomponent")]
    pub is_subcomponent: bool,
    #[serde(default, alias = "abstractRows")]
    pub abstract_rows: Vec<ComponentAbstractRowPayload>,
    #[serde(default, alias = "totalCost")]
    pub total_cost: Option<f64>,
    #[serde(default)]
    pub signatures: Vec<ComponentSignaturePayload>,
    #[serde(default, alias = "detailSheets")]
    pub detail_sheets: Vec<ComponentDetailSheetPayload>,
    /// Single stacked sheet (`Detailed_<name>`, Typst item order). When
    /// present it replaces the per-item `detail_sheets`.
    #[serde(default, alias = "detailedSheet")]
    pub detailed_sheet: Option<ComponentDetailSheetPayload>,
}
