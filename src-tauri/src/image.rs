use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct EmbedRemotePayload {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct EmbedRemoteResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub async fn image_embed_remote(payload: EmbedRemotePayload) -> Result<EmbedRemoteResult, String> {
    let parsed = reqwest::Url::parse(&payload.url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Ok(EmbedRemoteResult {
            ok: false,
            data: None,
            error: Some("Only http(s) image URLs are supported.".into()),
        });
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(EmbedRemoteResult {
            ok: false,
            data: None,
            error: Some(format!("HTTP {}", response.status())),
        });
    }

    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();

    if !mime.starts_with("image/") {
        return Ok(EmbedRemoteResult {
            ok: false,
            data: None,
            error: Some("The URL is not an image.".into()),
        });
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(EmbedRemoteResult {
            ok: false,
            data: None,
            error: Some("The image is empty.".into()),
        });
    }
    if bytes.len() > 10 * 1024 * 1024 {
        return Ok(EmbedRemoteResult {
            ok: false,
            data: None,
            error: Some("The image exceeds the 10 MB project limit.".into()),
        });
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(EmbedRemoteResult {
        ok: true,
        data: Some(format!("data:{mime};base64,{b64}")),
        error: None,
    })
}
