use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum RateAnalysisSectionKey {
    Materials,
    Machinery,
    Labour,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateAnalysisLine {
    pub id: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default)]
    pub quantity: f64,
    #[serde(default)]
    pub rate: f64,
    #[serde(default)]
    pub amount: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(default)]
    pub user_added: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateAnalysisSection {
    pub key: RateAnalysisSectionKey,
    pub lines: Vec<RateAnalysisLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateAnalysisSectionTotals {
    pub materials: f64,
    pub machinery: f64,
    pub labour: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateAnalysisRecipe {
    #[serde(alias = "itemKey")]
    pub id: String,
    #[serde(alias = "itemCode")]
    pub code: String,
    pub description: String,
    #[serde(default)]
    pub item_source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default = "default_output_quantity")]
    pub output_quantity: f64,
    #[serde(default = "default_overhead_percent")]
    pub overhead_percent: f64,
    #[serde(default)]
    pub area_allowance_percent: f64,
    pub sections: Vec<RateAnalysisSection>,
    #[serde(default)]
    pub published_rate: Option<f64>,
    #[serde(default)]
    pub recalculation: Option<Value>,
    #[serde(default)]
    pub stored_values: Option<Value>,
    #[serde(default)]
    pub published_rate_blocks: Option<Vec<Value>>,
    #[serde(default)]
    pub data_variant: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_rate_multiplier: Option<f64>,
}

fn default_output_quantity() -> f64 {
    1.0
}

fn default_overhead_percent() -> f64 {
    14.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateAnalysisSummary {
    pub section_totals: RateAnalysisSectionTotals,
    pub labour_base_cost: f64,
    pub area_allowance_percent: f64,
    pub area_allowance_amount: f64,
    pub labour_cost_with_area_allowance: f64,
    pub base_cost: f64,
    pub overhead_amount: f64,
    pub total_cost: f64,
    pub rate_per_unit: f64,
    pub labour_unit_base: f64,
    pub labour_unit_profit: f64,
    pub labour_unit_total: f64,
}
