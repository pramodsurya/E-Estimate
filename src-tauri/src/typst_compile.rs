use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

use base64::Engine;
use comemo;
use serde::{Deserialize, Serialize};
use typst::foundations::{NativeElement, Selector, Value};
use typst::introspection::{Introspector, MetadataElem};
use typst_pdf::PdfOptions;
use typst_world::World as TypstDiskWorld;

static COMPILE_QUEUE: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileRequest {
    pub main_content: String,
    pub inputs: Option<HashMap<String, String>>,
    pub shadow_files: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileResult {
    pub ok: bool,
    pub printed_content: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
}

fn decode_shadow_payload(raw: &str) -> Option<Vec<u8>> {
    let clean = raw
        .trim()
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(";base64,").map(|(_, b64)| b64))
        .unwrap_or(raw)
        .replace(['\n', '\r', ' '], "");
    if clean.is_empty() {
        return None;
    }
    base64::engine::general_purpose::STANDARD.decode(clean).ok()
}

fn write_shadow_files(root: &Path, shadow_files: &HashMap<String, String>) -> Result<(), String> {
    for (vpath, payload) in shadow_files {
        let Some(bytes) = decode_shadow_payload(payload) else {
            continue;
        };
        let normalized = vpath.replace('\\', "/");
        let stripped = normalized.trim_start_matches('/');
        let target = root.join(stripped);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn compile_once(req: TypstCompileRequest) -> TypstCompileResult {
    let start = Instant::now();
    if req.main_content.trim().is_empty() {
        return TypstCompileResult {
            ok: false,
            printed_content: Vec::new(),
            data: None,
            error: Some("Invalid Typst compile request: mainContent is required".into()),
            duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
        };
    }

    let temp = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(err) => {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                error: Some(err.to_string()),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        }
    };

    let main_path = temp.path().join("main.typ");
    if let Err(err) = fs::write(&main_path, &req.main_content) {
        return TypstCompileResult {
            ok: false,
            printed_content: Vec::new(),
            data: None,
            error: Some(err.to_string()),
            duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
        };
    }

    if let Some(shadow_files) = &req.shadow_files {
        if let Err(err) = write_shadow_files(temp.path(), shadow_files) {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                error: Some(err),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        }
    }

    let mut world = match TypstDiskWorld::with_root(&main_path, temp.path()) {
        Ok(world) => world,
        Err(err) => {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                error: Some(format!("Typst world setup failed: {err}")),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        }
    };

    // Bundled Libertinus / New Computer Modern — without this, Typst 0.15 lays
    // out rules and rects but emits no glyphs (empty header/table chrome).
    world = world.with_fonts();

    if let Some(inputs) = req.inputs {
        if !inputs.is_empty() {
            world.set_inputs(
                inputs
                    .iter()
                    .map(|(key, value)| (key.as_str(), value.clone())),
            );
        }
    }

    // Desktop compiler is Typst 0.15 (`typst = "0.15.1"`). Templates must use
    // `image(bytes, format: "svg")` — `image.decode` was removed in 0.13+.
    // The Node test compiler (`@myriaddreamin/typst-ts-node-compiler`) may still
    // accept the old API; desktop compile is the source of truth.
    let result = typst::compile(&world);
    comemo::evict(30);

    let duration_ms = (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;

    let document: typst_layout::PagedDocument = match result.output {
        Ok(doc) => doc,
        Err(errors) => {
            let message = errors
                .into_iter()
                .map(|err| format!("{err:?}"))
                .collect::<Vec<_>>()
                .join("\n");
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                error: Some(if message.is_empty() {
                    "Typst compilation failed.".into()
                } else {
                    message
                }),
                duration_ms: Some(duration_ms),
            };
        }
    };

    let printed_content = document
        .introspector()
        .query(&Selector::Elem(MetadataElem::ELEM, None))
        .iter()
        .filter_map(|content| match content.field_by_name("value") {
            Ok(Value::Str(value)) if value.as_str().starts_with("ee-print") => {
                Some(value.to_string())
            }
            _ => None,
        })
        .collect();

    let pdf = match typst_pdf::pdf(&document, &PdfOptions::default()) {
        Ok(bytes) => bytes,
        Err(err) => {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                error: Some(format!("Could not generate PDF: {err:?}")),
                duration_ms: Some(duration_ms),
            };
        }
    };

    TypstCompileResult {
        ok: true,
        printed_content,
        data: Some(base64::engine::general_purpose::STANDARD.encode(pdf)),
        error: None,
        duration_ms: Some(duration_ms),
    }
}

#[tauri::command]
pub fn typst_compile(req: TypstCompileRequest) -> Result<TypstCompileResult, String> {
    let _guard = COMPILE_QUEUE.lock().map_err(|e| e.to_string())?;
    Ok(compile_once(req))
}
