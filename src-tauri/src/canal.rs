use estimate_core::canal::{
    canal_earthwork_totals, canal_lining_totals, CanalData, CanalEarthworkTotals, CanalLiningTotals,
};
use estimate_core::canal_engine::{
    calculate_canal_cutting, calculate_canal_embankment, CanalCuttingCalculationResponse,
    CanalCuttingInput, CanalEmbankmentCalculationResponse, CanalEmbankmentInput,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanalQuantitiesResponse {
    pub earthwork: CanalEarthworkTotals,
    pub lining: CanalLiningTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanalCuttingExcelExportResponse {
    pub ok: bool,
    pub file_path: Option<String>,
    pub data: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn canal_calculate_quantities(data: CanalData) -> Result<CanalQuantitiesResponse, String> {
    let earthwork = canal_earthwork_totals(&data);
    let lining = canal_lining_totals(&data);
    Ok(CanalQuantitiesResponse { earthwork, lining })
}

#[tauri::command]
pub fn canal_engine_calculate_cutting(
    payload: CanalCuttingInput,
) -> Result<CanalCuttingCalculationResponse, String> {
    Ok(calculate_canal_cutting(&payload))
}

#[tauri::command]
pub fn canal_engine_export_cutting_excel(
    payload: CanalCuttingInput,
    prefer_path: Option<bool>,
) -> Result<CanalCuttingExcelExportResponse, String> {
    let calc = calculate_canal_cutting(&payload);
    match crate::canal_engine_excel::generate_canal_cutting_excel_bytes(&payload, &calc) {
        Ok(bytes) => {
            if prefer_path.unwrap_or(true) {
                let dir = std::env::temp_dir().join("e-estimate-compile-cache").join("excel");
                let _ = std::fs::create_dir_all(&dir);
                let path = dir.join(format!(
                    "canal-cutting-{}.xlsx",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                ));
                if let Err(e) = std::fs::write(&path, &bytes) {
                    return Err(e.to_string());
                }
                Ok(CanalCuttingExcelExportResponse {
                    ok: true,
                    file_path: Some(path.to_string_lossy().to_string()),
                    data: None,
                    error: None,
                })
            } else {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                Ok(CanalCuttingExcelExportResponse {
                    ok: true,
                    file_path: None,
                    data: Some(b64),
                    error: None,
                })
            }
        }
        Err(e) => Ok(CanalCuttingExcelExportResponse {
            ok: false,
            file_path: None,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanalEmbankmentExcelExportResponse {
    pub ok: bool,
    pub file_path: Option<String>,
    pub data: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn canal_engine_calculate_embankment(
    payload: CanalEmbankmentInput,
) -> Result<CanalEmbankmentCalculationResponse, String> {
    Ok(calculate_canal_embankment(&payload))
}

#[tauri::command]
pub fn canal_engine_export_embankment_excel(
    payload: CanalEmbankmentInput,
    prefer_path: Option<bool>,
) -> Result<CanalEmbankmentExcelExportResponse, String> {
    let calc = calculate_canal_embankment(&payload);
    match crate::canal_engine_embankment_excel::generate_canal_embankment_excel_bytes(&payload, &calc) {
        Ok(bytes) => {
            if prefer_path.unwrap_or(true) {
                let dir = std::env::temp_dir().join("e-estimate-compile-cache").join("excel");
                let _ = std::fs::create_dir_all(&dir);
                let path = dir.join(format!(
                    "canal-embankment-{}.xlsx",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                ));
                if let Err(e) = std::fs::write(&path, &bytes) {
                    return Err(e.to_string());
                }
                Ok(CanalEmbankmentExcelExportResponse {
                    ok: true,
                    file_path: Some(path.to_string_lossy().to_string()),
                    data: None,
                    error: None,
                })
            } else {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                Ok(CanalEmbankmentExcelExportResponse {
                    ok: true,
                    file_path: None,
                    data: Some(b64),
                    error: None,
                })
            }
        }
        Err(e) => Ok(CanalEmbankmentExcelExportResponse {
            ok: false,
            file_path: None,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}
