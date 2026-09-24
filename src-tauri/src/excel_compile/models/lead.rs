use serde::Deserialize;

use super::common::SignaturePayload;

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadSummaryRowPayload {
    #[serde(default)]
    pub key: String,
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
    pub key: String,
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
pub struct LeadWeightedRateCurvePayload {
    #[serde(default, alias = "head100m")]
    pub head_100m: Option<f64>,
    #[serde(default, alias = "head150m")]
    pub head_150m: Option<f64>,
    #[serde(default, alias = "upto1km")]
    pub upto_1km: Option<f64>,
    #[serde(default, alias = "upto2km")]
    pub upto_2km: Option<f64>,
    #[serde(default, alias = "upto3km")]
    pub upto_3km: Option<f64>,
    #[serde(default, alias = "upto4km")]
    pub upto_4km: Option<f64>,
    #[serde(default, alias = "upto5km")]
    pub upto_5km: Option<f64>,
    #[serde(default, alias = "perKm5To30")]
    pub per_km_5_to_30: Option<f64>,
    #[serde(default, alias = "perKmBeyond30")]
    pub per_km_beyond_30: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct LeadMaterialPayload {
    #[serde(default)]
    pub key: String,
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
    #[serde(default, alias = "weightedRateCurve")]
    pub weighted_rate_curve: Option<LeadWeightedRateCurvePayload>,
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
