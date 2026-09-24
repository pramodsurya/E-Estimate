use serde::Deserialize;

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
