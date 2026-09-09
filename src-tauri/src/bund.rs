use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::{self, Duration};

const RUN_TIMEOUT_MS: u64 = 10 * 60 * 1000;

static ACTIVE: Lazy<AsyncMutex<HashMap<String, ActiveBundProcess>>> =
    Lazy::new(|| AsyncMutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum BundSimulationPhase {
    Starting,
    #[serde(rename = "preparing-model")]
    PreparingModel,
    #[serde(rename = "seepage-stage-1")]
    SeepageStage1,
    #[serde(rename = "seepage-stage-2")]
    SeepageStage2,
    #[serde(rename = "slip-search")]
    SlipSearch,
    #[serde(rename = "strength-reduction")]
    StrengthReduction,
    Finalizing,
}

#[derive(Debug, Clone, Serialize)]
pub struct BundSimulationProgress {
    #[serde(rename = "runId")]
    pub run_id: String,
    pub phase: BundSimulationPhase,
    pub message: String,
    pub at: String,
}

struct ActiveBundProcess {
    child: Arc<AsyncMutex<tokio::process::Child>>,
    cancel_requested: Arc<Mutex<bool>>,
}

struct AnalysisEngineLaunch {
    command: PathBuf,
    args: Vec<String>,
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn analysis_engine_launch(app: &AppHandle) -> Option<AnalysisEngineLaunch> {
    if cfg!(debug_assertions) {
        let script = project_root().join("analysis").join("bund_analysis.py");
        if script.exists() {
            let python = std::env::var("EESTIMATE_PYTHON").unwrap_or_else(|_| "python".to_string());
            return Some(AnalysisEngineLaunch {
                command: PathBuf::from(python),
                args: vec![
                    "-X".into(),
                    "utf8".into(),
                    script.to_string_lossy().into(),
                ],
            });
        }
        let exe = project_root()
            .join("vendor")
            .join("bund-analysis")
            .join("bund-analysis.exe");
        if exe.exists() {
            return Some(AnalysisEngineLaunch {
                command: exe,
                args: vec![],
            });
        }
        return None;
    }

    let resource_dir = app.path().resource_dir().ok()?;
    let exe = resource_dir
        .join("analysis-engine")
        .join("bund-analysis.exe");
    if exe.exists() {
        Some(AnalysisEngineLaunch {
            command: exe,
            args: vec![],
        })
    } else {
        None
    }
}

fn engine_failure_detail(stderr: &str) -> String {
    let detail = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .last()
        .unwrap_or("")
        .to_string();
    if detail.is_empty() {
        "No diagnostic output was produced.".into()
    } else if detail.len() > 500 {
        format!("{}...", &detail[..497])
    } else {
        detail
    }
}

fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Renderer only uses this as opaque metadata; keep a monotonic UTC-ish stamp.
    format!("{ms}")
}

async fn emit_progress(app: &AppHandle, progress: BundSimulationProgress) {
    let _ = app.emit("bund:simulation-progress", &progress);
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundSimulateArgs {
    request: serde_json::Value,
}

#[tauri::command]
pub async fn bund_simulate(
    app: AppHandle,
    args: BundSimulateArgs,
) -> Result<serde_json::Value, String> {
    let request = args.request;
    let run_id = request
        .get("runId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if run_id.is_empty() {
        return Ok(error_response("", "Missing runId in simulation request."));
    }

    if ACTIVE.lock().await.contains_key(&run_id) {
        return Ok(error_response(
            &run_id,
            "This simulation run is already active.",
        ));
    }

    let Some(launch) = analysis_engine_launch(&app) else {
        let expected = if cfg!(debug_assertions) {
            project_root()
                .join("analysis")
                .join("bund_analysis.py")
                .to_string_lossy()
                .to_string()
        } else {
            app.path()
                .resource_dir()
                .ok()
                .map(|p| {
                    p.join("analysis-engine")
                        .join("bund-analysis.exe")
                        .to_string_lossy()
                        .to_string()
                })
                .unwrap_or_else(|| "analysis-engine/bund-analysis.exe".into())
        };
        return Ok(serde_json::json!({
            "schemaVersion": 1,
            "runId": run_id,
            "status": "error",
            "message": "The analysis engine is missing. Build it with npm run build:analysis-engine, or reinstall from a complete installer.",
            "diagnostics": { "expectedEngine": expected }
        }));
    };

    emit_progress(
        &app,
        BundSimulationProgress {
            run_id: run_id.clone(),
            phase: BundSimulationPhase::Starting,
            message: "Starting the XSLOPE analysis engine.".into(),
            at: iso_now(),
        },
    )
    .await;

    let cancel_requested = Arc::new(Mutex::new(false));

    let child = match Command::new(&launch.command)
        .args(&launch.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            ACTIVE.lock().await.remove(&run_id);
            return Ok(error_response(
                &run_id,
                &format!("Could not start the analysis engine: {err}"),
            ));
        }
    };

    let child_handle = Arc::new(AsyncMutex::new(child));
    ACTIVE.lock().await.insert(
        run_id.clone(),
        ActiveBundProcess {
            child: child_handle.clone(),
            cancel_requested: cancel_requested.clone(),
        },
    );

    let mut child = child_handle.lock().await;

    emit_progress(
        &app,
        BundSimulationProgress {
            run_id: run_id.clone(),
            phase: BundSimulationPhase::PreparingModel,
            message: "Preparing the section geometry and material model.".into(),
            at: iso_now(),
        },
    )
    .await;

    if let Some(mut stdin) = child.stdin.take() {
        let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        if let Err(err) = stdin.write_all(request_json.as_bytes()).await {
            ACTIVE.lock().await.remove(&run_id);
            return Ok(error_response(
                &run_id,
                &format!("Could not send the simulation request: {err}"),
            ));
        }
    }

    let mut stdout = child.stdout.take().ok_or_else(|| "Missing stdout.".to_string())?;
    let mut stderr = child.stderr.take().ok_or_else(|| "Missing stderr.".to_string())?;

    let app_progress = app.clone();
    let run_id_progress = run_id.clone();
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let mut seepage_count = 0u32;
        let mut last_phase: Option<BundSimulationPhase> = None;
        let _ = stderr.read_to_end(&mut buf).await;
        let text = String::from_utf8_lossy(&buf);
        for chunk in text.split_inclusive('\n') {
            if regex_like_seepage(chunk) {
                seepage_count += 1;
                let phase = if seepage_count == 1 {
                    BundSimulationPhase::SeepageStage1
                } else {
                    BundSimulationPhase::SeepageStage2
                };
                let message = if seepage_count == 1 {
                    "Solving the initial seepage and pore-pressure field."
                } else {
                    "Solving the post-drawdown seepage boundary field."
                };
                if last_phase.as_ref() != Some(&phase) {
                    last_phase = Some(phase.clone());
                    emit_progress(
                        &app_progress,
                        BundSimulationProgress {
                            run_id: run_id_progress.clone(),
                            phase,
                            message: message.into(),
                            at: iso_now(),
                        },
                    )
                    .await;
                }
            } else if regex_like_slip(chunk) {
                let phase = BundSimulationPhase::SlipSearch;
                if last_phase.as_ref() != Some(&phase) {
                    last_phase = Some(phase.clone());
                    emit_progress(
                        &app_progress,
                        BundSimulationProgress {
                            run_id: run_id_progress.clone(),
                            phase,
                            message: "Searching trial slip circles for the critical surface.".into(),
                            at: iso_now(),
                        },
                    )
                    .await;
                }
            } else if regex_like_ssrm(chunk) {
                let phase = BundSimulationPhase::StrengthReduction;
                if last_phase.as_ref() != Some(&phase) {
                    last_phase = Some(phase.clone());
                    emit_progress(
                        &app_progress,
                        BundSimulationProgress {
                            run_id: run_id_progress.clone(),
                            phase,
                            message: "Running the finite-element strength-reduction search.".into(),
                            at: iso_now(),
                        },
                    )
                    .await;
                }
            }
        }
        text.into_owned()
    });

    let stdout_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).into_owned()
    });

    let status = match time::timeout(Duration::from_millis(RUN_TIMEOUT_MS), child.wait()).await {
        Ok(result) => result.map_err(|e| e.to_string())?,
        Err(_) => {
            let _ = child.start_kill();
            drop(child);
            ACTIVE.lock().await.remove(&run_id);
            return Ok(error_response(&run_id, "The analysis timed out."));
        }
    };
    drop(child);

    let stdout = stdout_task.await.unwrap_or_default();
    let stderr_tail = stderr_task.await.unwrap_or_default();
    let stderr_tail = if stderr_tail.len() > 4000 {
        stderr_tail[stderr_tail.len() - 4000..].to_string()
    } else {
        stderr_tail
    };

    ACTIVE.lock().await.remove(&run_id);

    if *cancel_requested.lock().unwrap() {
        return Ok(serde_json::json!({
            "schemaVersion": 1,
            "runId": run_id,
            "status": "not-evaluated",
            "message": "Simulation cancelled by the user.",
            "warnings": [],
            "diagnostics": {}
        }));
    }

    if !status.success() {
        let code = status.code().map(|c| format!("exit code {c}"));
        let reason = code.unwrap_or_else(|| "unknown".into());
        return Ok(serde_json::json!({
            "schemaVersion": 1,
            "runId": run_id,
            "status": "error",
            "message": format!(
                "The analysis engine stopped before producing a result ({reason}). {}",
                engine_failure_detail(&stderr_tail)
            ),
            "diagnostics": {
                "exitCode": status.code(),
                "stderrTail": stderr_tail
            }
        }));
    }

    emit_progress(
        &app,
        BundSimulationProgress {
            run_id: run_id.clone(),
            phase: BundSimulationPhase::Finalizing,
            message: "Reading and storing the completed analysis result.".into(),
            at: iso_now(),
        },
    )
    .await;

    let last_line = stdout
        .trim()
        .lines()
        .last()
        .unwrap_or("")
        .trim();
    match serde_json::from_str::<serde_json::Value>(last_line) {
        Ok(parsed)
            if parsed.get("schemaVersion").and_then(|v| v.as_i64()) == Some(1) =>
        {
            Ok(parsed)
        }
        Ok(_) | Err(_) => Ok(serde_json::json!({
            "schemaVersion": 1,
            "runId": run_id,
            "status": "error",
            "message": format!(
                "The analysis engine completed but returned an unreadable result. {}",
                engine_failure_detail(&stderr_tail)
            ),
            "diagnostics": { "stderrTail": stderr_tail }
        })),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundCancelArgs {
    run_id: String,
}

#[tauri::command]
pub async fn bund_cancel(args: BundCancelArgs) -> Result<bool, String> {
    let run_id = args.run_id;
    let entry = ACTIVE.lock().await.remove(&run_id);
    if let Some(entry) = entry {
        *entry.cancel_requested.lock().unwrap() = true;
        let mut child = entry.child.lock().await;
        let _ = child.start_kill();
        return Ok(true);
    }
    Ok(false)
}

fn error_response(run_id: &str, message: &str) -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "runId": run_id,
        "status": "error",
        "message": message
    })
}

fn regex_like_seepage(chunk: &str) -> bool {
    let lower = chunk.to_ascii_lowercase();
    lower.contains("solving") && lower.contains("seep problem")
}

fn regex_like_slip(chunk: &str) -> bool {
    let lower = chunk.to_ascii_lowercase();
    lower.contains("searching for the critical")
        || lower.contains("grid seed")
        || lower.contains("iteration")
}

fn regex_like_ssrm(chunk: &str) -> bool {
    let lower = chunk.to_ascii_lowercase();
    lower.contains("ssrm") || lower.contains("strength reduction")
}
