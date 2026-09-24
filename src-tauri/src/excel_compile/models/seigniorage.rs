use serde::Deserialize;

use super::common::SignaturePayload;

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SeigniorageRowPayload {
    #[serde(default)]
    pub key: String,
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
