use estimate_core::canal::{
    canal_earthwork_totals, canal_lining_totals, CanalData, CanalEarthworkTotals, CanalLiningTotals,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalQuantitiesResponse {
    pub earthwork: CanalEarthworkTotals,
    pub lining: CanalLiningTotals,
}

#[tauri::command]
pub fn canal_calculate_quantities(data: CanalData) -> Result<CanalQuantitiesResponse, String> {
    let earthwork = canal_earthwork_totals(&data);
    let lining = canal_lining_totals(&data);
    Ok(CanalQuantitiesResponse { earthwork, lining })
}
