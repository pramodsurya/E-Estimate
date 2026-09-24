use serde::Deserialize;

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
    #[serde(default, alias = "leadKey")]
    pub lead_key: String,
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
    #[serde(default, alias = "excelKey")]
    pub excel_key: String,
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
    #[serde(default, alias = "excelKey")]
    pub excel_key: String,
    #[serde(default)]
    pub sl: usize,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub rate: Option<f64>,
    #[serde(default, alias = "baseRate")]
    pub base_rate: Option<f64>,
    #[serde(default, alias = "outputQty")]
    pub output_qty: Option<f64>,
    #[serde(default, alias = "leadLinks")]
    pub lead_links: Vec<SorLeadLink>,
    #[serde(default, alias = "rateText")]
    pub rate_text: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SorLeadLink {
    #[serde(default, alias = "leadKey")]
    pub lead_key: String,
    #[serde(default)]
    pub quantity: Option<f64>,
}
