use serde::Deserialize;

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
