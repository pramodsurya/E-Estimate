use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, Once};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use typst::foundations::{NativeElement, Selector, Value};
use typst::introspection::{Introspector, MetadataElem};
use typst_pdf::PdfOptions;
use typst_world::World as TypstDiskWorld;

static COMPILE_QUEUE: Mutex<()> = Mutex::new(());

/// Rust side of the JS INVALIDATION spec
/// (`src/renderer/src/lib/typist-output/compileCache.ts`): the client
/// contentHash already covers source, inputs, shadow bytes, figure versions
/// and the compiler version. The server mixes in its own engine tag so a
/// compiler upgrade can never serve a stale cached PDF.
const RUST_COMPILER_TAG: &str = "typst:0.15.1/rust1";
const RESULT_CACHE_MAX: usize = 3;
const FIGURE_MAX_BYTES: usize = 10 * 1024 * 1024;
const FIGURE_TIMEOUT_SECS: u64 = 60;

struct CachedDoc {
    path: PathBuf,
    bytes_len: u64,
    printed: Vec<String>,
}

static RESULT_CACHE: Mutex<HashMap<String, CachedDoc>> = Mutex::new(HashMap::new());
static CACHE_INIT: Once = Once::new();
static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn cache_dir() -> PathBuf {
    std::env::temp_dir().join("e-estimate-compile-cache")
}

fn ensure_cache_dir() -> Result<PathBuf, String> {
    let dir = cache_dir();
    CACHE_INIT.call_once(|| {
        // Session-bounded: a fresh boot starts clean, so unique (uncached)
        // outputs from a previous run can never accumulate.
        let _ = fs::remove_dir_all(&dir);
    });
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn sanitize_file_stem(raw: &str) -> String {
    let kept: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(64)
        .collect();
    if kept.is_empty() {
        "output".to_string()
    } else {
        kept
    }
}

fn cache_key_for(content_hash: &str) -> String {
    format!("{RUST_COMPILER_TAG}:{content_hash}")
}

/// Reject absolute paths and `..` escapes: figure refs arrive over the bridge.
fn join_sandbox(root: &Path, vpath: &str) -> Option<PathBuf> {
    let normalized = vpath.replace('\\', "/");
    let stripped = normalized.trim_start_matches('/');
    let mut target = root.to_path_buf();
    for part in stripped.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return None;
        }
        target.push(part);
    }
    Some(target)
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FigureRef {
    pub path: String,
    pub url: String,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileRequest {
    pub main_content: String,
    pub inputs: Option<HashMap<String, String>>,
    pub shadow_files: Option<HashMap<String, String>>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub figure_refs: Option<Vec<FigureRef>>,
    #[serde(default)]
    pub prefer_path: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstCompileResult {
    pub ok: bool,
    pub printed_content: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pdf_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_hit: Option<bool>,
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

/// Fetch figure bytes server-side so images never cross the IPC bridge.
/// Runs BEFORE the compile lock: downloads for one request do not block another.
async fn fetch_figure_refs(refs: &[FigureRef]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .timeout(Duration::from_secs(FIGURE_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(refs.len());
    for figure in refs {
        let parsed = reqwest::Url::parse(&figure.url).map_err(|e| format!("figure {}: {e}", figure.path))?;
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(format!("figure {}: only http(s) URLs are supported", figure.path));
        }
        let mut request = client.get(parsed);
        if let Some(headers) = &figure.headers {
            let mut map = reqwest::header::HeaderMap::new();
            for (name, value) in headers {
                let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
                    .map_err(|_| format!("figure {}: bad header name", figure.path))?;
                let header_value = reqwest::header::HeaderValue::from_str(value)
                    .map_err(|_| format!("figure {}: bad header value", figure.path))?;
                map.insert(header_name, header_value);
            }
            request = request.headers(map);
        }
        let response = request.send().await.map_err(|e| format!("figure {}: {e}", figure.path))?;
        if !response.status().is_success() {
            return Err(format!("figure {}: HTTP {}", figure.path, response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| format!("figure {}: {e}", figure.path))?;
        if bytes.is_empty() {
            return Err(format!("figure {}: empty download", figure.path));
        }
        if bytes.len() > FIGURE_MAX_BYTES {
            return Err(format!("figure {}: exceeds 10 MiB", figure.path));
        }
        out.push((figure.path.clone(), bytes.to_vec()));
    }
    Ok(out)
}

fn cache_lookup(key: &str) -> Option<CachedDoc> {
    let mut cache = RESULT_CACHE.lock().ok()?;
    let entry = cache.get(key)?;
    // Serve only a real file: a missing or empty path is a miss, never stale output.
    let len = fs::metadata(&entry.path).ok()?.len();
    if len == 0 || len != entry.bytes_len {
        return None;
    }
    // Refresh recency.
    let entry = cache.remove(key)?;
    cache.insert(key.to_string(), CachedDoc { path: entry.path.clone(), bytes_len: entry.bytes_len, printed: entry.printed.clone() });
    Some(CachedDoc { path: entry.path, bytes_len: entry.bytes_len, printed: entry.printed })
}

fn cache_store(key: String, path: PathBuf, bytes_len: u64, printed: Vec<String>) {
    let Ok(mut cache) = RESULT_CACHE.lock() else { return };
    while cache.len() >= RESULT_CACHE_MAX {
        let Some(victim) = cache.keys().next().cloned() else { break };
        if let Some(evicted) = cache.remove(&victim) {
            let _ = fs::remove_file(evicted.path);
        }
    }
    cache.insert(key, CachedDoc { path, bytes_len, printed });
}

async fn compile_once(req: TypstCompileRequest, fetched: Vec<(String, Vec<u8>)>) -> TypstCompileResult {
    let start = Instant::now();
    if req.main_content.trim().is_empty() {
        return TypstCompileResult {
            ok: false,
            printed_content: Vec::new(),
            data: None,
            pdf_path: None,
            cache_hit: None,
            error: Some("Invalid Typst compile request: mainContent is required".into()),
            duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
        };
    }

    let prefer_path = req.prefer_path.unwrap_or(false);

    // Result cache: the client contentHash covers source, inputs, shadow
    // bytes, figure versions and compiler version; the server key adds its own
    // engine tag. A hit skips the temp dir, fonts, compile and render.
    if let Some(content_hash) = req.content_hash.as_deref() {
        let key = cache_key_for(content_hash);
        if let Some(hit) = cache_lookup(&key) {
            let duration_ms = (start.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0;
            if prefer_path {
                return TypstCompileResult {
                    ok: true,
                    printed_content: hit.printed,
                    data: None,
                    pdf_path: Some(hit.path.to_string_lossy().to_string()),
                    cache_hit: Some(true),
                    error: None,
                    duration_ms: Some(duration_ms),
                };
            }
            match fs::read(&hit.path) {
                Ok(bytes) => {
                    return TypstCompileResult {
                        ok: true,
                        printed_content: hit.printed,
                        data: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
                        pdf_path: None,
                        cache_hit: Some(true),
                        error: None,
                        duration_ms: Some(duration_ms),
                    };
                }
                Err(_) => {
                    // Fall through to a fresh compile; never serve a miss as a hit.
                }
            }
        }
    }

    let temp = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(err) => {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                pdf_path: None,
                cache_hit: None,
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
            pdf_path: None,
            cache_hit: None,
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
                pdf_path: None,
                cache_hit: None,
                error: Some(err),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        }
    }

    for (vpath, bytes) in &fetched {
        let Some(target) = join_sandbox(temp.path(), vpath) else {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                pdf_path: None,
                cache_hit: None,
                error: Some(format!("figure {vpath}: path escapes the compile dir")),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        };
        if let Some(parent) = target.parent() {
            if let Err(err) = fs::create_dir_all(parent) {
                return TypstCompileResult {
                    ok: false,
                    printed_content: Vec::new(),
                    data: None,
                    pdf_path: None,
                    cache_hit: None,
                    error: Some(err.to_string()),
                    duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
                };
            }
        }
        if let Err(err) = fs::write(&target, bytes) {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                pdf_path: None,
                cache_hit: None,
                error: Some(err.to_string()),
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
                pdf_path: None,
                cache_hit: None,
                error: Some(format!("Typst world setup failed: {err}")),
                duration_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
            };
        }
    };

    // Bundled Libertinus / New Computer Modern — without this, Typst 0.15 lays
    // out rules and rects but emits no glyphs (empty header/table chrome).
    // NOTE (speed): this reloads + parses every bundled font on each compile.
    // Hoist to a process-static font book when the typst-world API available
    // here exposes the underlying book type; unverifiable without a local
    // cargo build, so left per-compile for now.
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
                pdf_path: None,
                cache_hit: None,
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
                pdf_path: None,
                cache_hit: None,
                error: Some(format!("Could not generate PDF: {err:?}")),
                duration_ms: Some(duration_ms),
            };
        }
    };

    // Persist the PDF to the session cache dir so prefer_path callers (and
    // future identical compiles) read a file instead of base64. Old callers
    // without prefer_path/contentHash get exactly today's base64 behavior.
    let dir = match ensure_cache_dir() {
        Ok(dir) => dir,
        Err(err) => {
            return TypstCompileResult {
                ok: false,
                printed_content: Vec::new(),
                data: None,
                pdf_path: None,
                cache_hit: None,
                error: Some(err),
                duration_ms: Some(duration_ms),
            };
        }
    };
    let stem = match req.content_hash.as_deref() {
        Some(hash) => sanitize_file_stem(hash),
        None => {
            let n = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
            format!("uncached-{}", sanitize_file_stem(&format!("{n}-{}", start.elapsed().as_nanos())))
        }
    };
    let pdf_path = dir.join(format!("{stem}.pdf"));
    if let Err(err) = fs::write(&pdf_path, &pdf) {
        return TypstCompileResult {
            ok: false,
            printed_content: Vec::new(),
            data: None,
            pdf_path: None,
            cache_hit: None,
            error: Some(err.to_string()),
            duration_ms: Some(duration_ms),
        };
    }
    if let Some(content_hash) = req.content_hash.as_deref() {
        cache_store(
            cache_key_for(content_hash),
            pdf_path.clone(),
            pdf.len() as u64,
            printed_content.clone(),
        );
    }

    if prefer_path {
        return TypstCompileResult {
            ok: true,
            printed_content,
            data: None,
            pdf_path: Some(pdf_path.to_string_lossy().to_string()),
            cache_hit: Some(false),
            error: None,
            duration_ms: Some(duration_ms),
        };
    }

    TypstCompileResult {
        ok: true,
        printed_content,
        data: Some(base64::engine::general_purpose::STANDARD.encode(pdf)),
        pdf_path: None,
        cache_hit: Some(false),
        error: None,
        duration_ms: Some(duration_ms),
    }
}

#[tauri::command]
pub async fn typst_compile(req: TypstCompileRequest) -> Result<TypstCompileResult, String> {
    // Figure downloads run outside the compile lock so one request's network
    // wait never blocks another request's compile.
    let fetched = match req.figure_refs.clone() {
        Some(refs) if !refs.is_empty() => fetch_figure_refs(&refs).await?,
        _ => Vec::new(),
    };
    let _guard = COMPILE_QUEUE.lock().map_err(|e| e.to_string())?;
    Ok(compile_once(req, fetched).await)
}
