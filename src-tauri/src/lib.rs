mod docker_lifecycle;

use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::models::ContainerStatsResponse;
use bollard::exec::ResizeExecOptions;
use bollard::query_parameters::{
    CreateImageOptions, ListContainersOptions, ListImagesOptions, ListNetworksOptions,
    ListVolumesOptions, LogsOptions, RemoveImageOptions, RemoveVolumeOptions, StatsOptions,
};
use bollard::Docker;
use futures_util::stream::FuturesUnordered;
use futures_util::stream::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

/// Struct to hold the inner state including the connection path
struct InnerDockerState {
    client: Option<Docker>,
    path: String,
}

/// Connect to Docker, trying Colima's socket on macOS if default fails.
/// Returns (Docker, path_string)
fn connect_docker() -> Result<(Docker, String), bollard::errors::Error> {
    // First try the default connection
    if let Ok(docker) = Docker::connect_with_local_defaults() {
        return Ok((docker, "default".to_string()));
    }

    // On macOS, try Colima's socket path
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let colima_socket = format!("{home}/.colima/default/docker.sock");
            if std::path::Path::new(&colima_socket).exists() {
                let d = Docker::connect_with_socket(
                    &colima_socket,
                    120,
                    bollard::API_DEFAULT_VERSION,
                )?;
                return Ok((d, colima_socket));
            }
        }
    }

    // Fall back to default error
    let d = Docker::connect_with_local_defaults()?;
    Ok((d, "default".to_string()))
}

/// Singleton Docker client — lazily initialized and cached.
/// Uses `Mutex<InnerDockerState>` so it can reconnect if Docker wasn't available at startup.
struct DockerState(Mutex<InnerDockerState>);

impl DockerState {
    fn new() -> Self {
        // Try to connect immediately; if Docker isn't up yet, store None
        let (client, path) = match connect_docker() {
            Ok((d, p)) => (Some(d), p),
            Err(_) => (None, "".to_string()),
        };
        Self(Mutex::new(InnerDockerState { client, path }))
    }

    fn connect_with_retry(&self) -> Result<Docker, String> {
        let (docker, path) = connect_docker().map_err(|e| e.to_string())?;
        let mut guard = self.0.lock().unwrap();
        guard.client = Some(docker.clone());
        guard.path = path;
        Ok(docker)
    }

    /// Get (or reconnect) the Docker client. Caches the connection for reuse.
    fn client(&self) -> Result<Docker, String> {
        // Scope the lock to avoid holding it during connection attempt if simpler
        {
            let guard = self.0.lock().unwrap();
            if let Some(ref docker) = guard.client {
                return Ok(docker.clone());
            }
        }
        
        self.connect_with_retry()
    }

    fn get_path(&self) -> String {
        let guard = self.0.lock().unwrap();
        guard.path.clone()
    }
}

struct LogState(Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>);

struct ExecSession {
    handle: tauri::async_runtime::JoinHandle<()>,
    input_tx: mpsc::Sender<String>,
    docker: Docker,
    exec_id: Arc<Mutex<String>>,
}

struct ExecState(Mutex<HashMap<String, ExecSession>>);

struct PullState(Mutex<HashMap<String, AbortHandle>>);

#[derive(Deserialize)]
struct StartLogsOptions {
    timestamps: Option<bool>,
}

#[tauri::command]
fn start_logs(
    id: String,
    session_id: String,
    options: StartLogsOptions,
    app_handle: tauri::AppHandle,
    docker_state: State<'_, DockerState>,
    state: State<'_, LogState>,
) -> CommandResponse<()> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return CommandResponse::err(e),
    };
    if let Err(e) = validate_docker_id(&id) {
        return CommandResponse::err(e);
    }

    let logs_options = Some(LogsOptions {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: options.timestamps.unwrap_or(false),
        tail: "100".to_string(),
        ..Default::default()
    });

    let session_id_clone = session_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let mut stream = docker.logs(&id, logs_options);
        while let Some(Ok(log_output)) = stream.next().await {
            let log_str = log_output.to_string();
            let event_name = format!("logs-{}", session_id_clone);
            let _ = app_handle.emit(&event_name, log_str);
        }
    });

    let mut lock = state.inner().0.lock().unwrap();
    if let Some(old_handle) = lock.insert(session_id, handle) {
        old_handle.abort();
    }

    CommandResponse {
        success: true,
        data: None,
        error: None,
    }
}

#[tauri::command]
fn stop_logs(session_id: String, state: State<'_, LogState>) -> CommandResponse<()> {
    let mut lock = state.inner().0.lock().unwrap();
    if let Some(handle) = lock.remove(&session_id) {
        handle.abort();
    }
    CommandResponse {
        success: true,
        data: None,
        error: None,
    }
}

#[tauri::command]
fn start_exec(
    session_id: String,
    container_id: String,
    cols: u16,
    rows: u16,
    app_handle: tauri::AppHandle,
    docker_state: State<'_, DockerState>,
    state: State<'_, ExecState>,
) -> CommandResponse<()> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return CommandResponse::err(e),
    };
    if let Err(e) = validate_docker_id(&container_id) {
        return CommandResponse::err(e);
    }
    let cols = if cols == 0 { 80 } else { cols };
    let rows = if rows == 0 { 24 } else { rows };

    let session_id_clone = session_id.clone();
    let docker_for_resize = docker.clone();

    let (input_tx, mut input_rx) = mpsc::channel::<String>(100);
    let exec_id_shared: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let exec_id_writer = exec_id_shared.clone();

    let handle = tauri::async_runtime::spawn(async move {
        // Create exec instance
        let exec_opts = CreateExecOptions {
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            attach_stdin: Some(true),
            tty: Some(true),
            cmd: Some(vec![
                "/bin/sh",
                "-c",
                "if command -v bash > /dev/null; then exec bash; else exec sh; fi",
            ]),
            ..Default::default()
        };

        let exec = match docker.create_exec(&container_id, exec_opts).await {
            Ok(e) => e,
            Err(e) => {
                let event_name = format!("exec-{}", session_id_clone);
                let _ = app_handle.emit(&event_name, format!("\r\nError creating exec: {}\r\n", e));
                return;
            }
        };

        // Store exec_id for later resize calls
        *exec_id_writer.lock().unwrap() = exec.id.clone();

        // Start exec
        let start_result = docker.start_exec(&exec.id, None).await;

        match start_result {
            Ok(StartExecResults::Attached {
                mut output,
                mut input,
            }) => {
                // Resize TTY in background so it doesn't block starting the session
                let docker_c = docker.clone();
                let exec_id_c = exec.id.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = docker_c.resize_exec(&exec_id_c, ResizeExecOptions { width: cols, height: rows }).await;
                });

                let event_name = format!("exec-{}", session_id_clone);
                let app_clone = app_handle.clone();

                // Spawn task to read output
                let output_task = tauri::async_runtime::spawn(async move {
                    while let Some(Ok(msg)) = output.next().await {
                        let data = msg.to_string();
                        let _ = app_clone.emit(&event_name, data);
                    }
                });

                // Read input from channel and send to container
                while let Some(data) = input_rx.recv().await {
                    use tokio::io::AsyncWriteExt;
                    if input.write_all(data.as_bytes()).await.is_err() {
                        break;
                    }
                }

                output_task.abort();
            }
            Ok(StartExecResults::Detached) => {
                let event_name = format!("exec-{}", session_id_clone);
                let _ = app_handle.emit(
                    &event_name,
                    "\r\nExec started in detached mode\r\n".to_string(),
                );
            }
            Err(e) => {
                let event_name = format!("exec-{}", session_id_clone);
                let _ = app_handle.emit(&event_name, format!("\r\nError starting exec: {}\r\n", e));
            }
        }
    });

    let mut lock = state.inner().0.lock().unwrap();
    if let Some(old_session) = lock.insert(session_id, ExecSession { handle, input_tx, docker: docker_for_resize, exec_id: exec_id_shared }) {
        old_session.handle.abort();
    }

    CommandResponse {
        success: true,
        data: None,
        error: None,
    }
}

#[tauri::command]
fn exec_input(
    session_id: String,
    data: String,
    state: State<'_, ExecState>,
) -> CommandResponse<()> {
    let lock = state.inner().0.lock().unwrap();
    if let Some(session) = lock.get(&session_id) {
        let tx = session.input_tx.clone();
        drop(lock);
        let _ = tx.blocking_send(data);
    }
    CommandResponse {
        success: true,
        data: None,
        error: None,
    }
}

#[tauri::command]
fn exec_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, ExecState>,
) -> CommandResponse<()> {
    let (docker, exec_id) = {
        let lock = state.inner().0.lock().unwrap();
        match lock.get(&session_id) {
            Some(s) => {
                let eid = s.exec_id.lock().unwrap().clone();
                if eid.is_empty() {
                    return CommandResponse::ok_empty();
                }
                (s.docker.clone(), eid)
            }
            None => return CommandResponse::ok_empty(),
        }
    };
    tauri::async_runtime::spawn(async move {
        let _ = docker.resize_exec(&exec_id, ResizeExecOptions { width: cols, height: rows }).await;
    });
    CommandResponse::ok_empty()
}

#[tauri::command]
fn stop_exec(session_id: String, state: State<'_, ExecState>) -> CommandResponse<()> {
    let mut lock = state.inner().0.lock().unwrap();
    if let Some(session) = lock.remove(&session_id) {
        session.handle.abort();
    }
    CommandResponse {
        success: true,
        data: None,
        error: None,
    }
}

/// Validate a Docker resource identifier (container ID/name, image ref, volume name).
/// Allows hex IDs (12/64 chars), names with alphanumeric + `-_./:@`, and rejects
/// anything with shell metacharacters or suspicious patterns.
fn validate_docker_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Identifier cannot be empty".to_string());
    }
    if id.len() > 256 {
        return Err("Identifier too long".to_string());
    }
    // Allow: alphanumeric, hyphen, underscore, dot, slash, colon, @ (for image digests)
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_./:@".contains(c))
    {
        return Err(format!("Invalid identifier: {}", id));
    }
    Ok(())
}

#[derive(Serialize, PartialEq, Debug)]
struct CommandResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> CommandResponse<T> {
    fn ok(data: T) -> Self {
        Self { success: true, data: Some(data), error: None }
    }

    fn ok_empty() -> Self {
        Self { success: true, data: None, error: None }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self { success: false, data: None, error: Some(msg.into()) }
    }
}

#[derive(Serialize)]
struct ContainerStatsResult {
    id: String,
    success: bool,
    data: Option<ContainerStatsResponse>,
    error: Option<String>,
}

#[tauri::command]
async fn get_batch_stats(
    ids: Vec<String>,
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<Vec<ContainerStatsResult>>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };
    for id in &ids {
        if let Err(e) = validate_docker_id(id) {
            return Ok(CommandResponse::err(e));
        }
    }

    let mut futures = FuturesUnordered::new();

    for id in ids {
        let docker_clone = docker.clone();
        futures.push(async move {
            let mut stream = docker_clone.stats(
                &id,
                Some(StatsOptions {
                    stream: false,
                    ..Default::default()
                }),
            );
            match stream.next().await {
                Some(Ok(stats)) => ContainerStatsResult {
                    id,
                    success: true,
                    data: Some(stats),
                    error: None,
                },
                Some(Err(e)) => ContainerStatsResult {
                    id,
                    success: false,
                    data: None,
                    error: Some(e.to_string()),
                },
                None => ContainerStatsResult {
                    id,
                    success: false,
                    data: None,
                    error: Some("No stats found".to_string()),
                },
            }
        });
    }

    let mut results = Vec::new();
    while let Some(res) = futures.next().await {
        results.push(res);
    }

    Ok(CommandResponse::ok(results))
}

#[tauri::command]
async fn list_containers(
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<Vec<bollard::models::ContainerSummary>>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };

    let options = Some(ListContainersOptions {
        all: true,
        ..Default::default()
    });

    match docker.list_containers(options).await {
        Ok(containers) => Ok(CommandResponse::ok(containers)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn container_action(
    id: String,
    action: String,
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<()>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };
    if let Err(e) = validate_docker_id(&id) {
        return Ok(CommandResponse::err(e));
    }

    let res = match action.as_str() {
        "start" => docker.start_container(&id, None).await,
        "stop" => docker.stop_container(&id, None).await,
        "restart" => docker.restart_container(&id, None).await,
        "remove" => docker.remove_container(&id, None).await,
        _ => {
            return Ok(CommandResponse::err("Invalid action"))
        }
    };

    match res {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn list_images(
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<Vec<bollard::models::ImageSummary>>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };

    match docker.list_images(None::<ListImagesOptions>).await {
        Ok(images) => Ok(CommandResponse::ok(images)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn list_volumes(
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<Vec<bollard::models::Volume>>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };

    let mut volumes = match docker.list_volumes(None::<ListVolumesOptions>).await {
        Ok(res) => res.volumes.unwrap_or_default(),
        Err(e) => return Ok(CommandResponse::err(e.to_string())),
    };

    // Use CLI directly for usage data as API is unreliable for this specific data
    log::info!("Fetching volume usage data via CLI");
    let path = docker_state.get_path();
    let mut cmd = std::process::Command::new("docker");
    
    if path != "default" && !path.is_empty() {
            cmd.arg("-H").arg(format!("unix://{}", path));
    }

    cmd.args(&["system", "df", "-v", "--format", "{{json .Volumes}}"]);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // Output is a JSON array of objects
                if let Ok(cli_items) = serde_json::from_str::<Vec<serde_json::Value>>(&stdout) {
                    log::info!("Found {} volume usage items via CLI", cli_items.len());
                    for item in cli_items {
                            let name = item.get("Name")
                            .or_else(|| item.get("name"))
                            .and_then(|v| v.as_str());

                        let usage_data = item.get("UsageData")
                            .or_else(|| item.get("usageData"));
                        
                        // Also check for "Size" directly if UsageData is not nested
                        // CLI format might put Size at top level
                        let direct_size = item.get("Size").and_then(|v| v.as_str());

                        if let Some(name) = name {
                            if let Some(vol) = volumes.iter_mut().find(|v| v.name == name) {
                                if let Some(usage_val) = usage_data {
                                    if let Ok(usage) = serde_json::from_value::<bollard::models::VolumeUsageData>(usage_val.clone()) {
                                        vol.usage_data = Some(usage);
                                    }
                                } else if let Some(size_str) = direct_size {
                                    let size_bytes = parse_docker_size(size_str);
                                    // Try to get ref count too
                                    let ref_count = item.get("Links")
                                        .and_then(|v| v.as_i64())
                                        .unwrap_or(-1);

                                    let usage = bollard::models::VolumeUsageData {
                                        size: size_bytes,
                                        ref_count,
                                    };
                                    vol.usage_data = Some(usage);
                                }
                            }
                        }
                    }
                } else {
                    log::warn!("Failed to parse CLI JSON output: {}", stdout);
                }
            } else {
                    log::warn!("CLI command failed: {}", String::from_utf8_lossy(&output.stderr));
            }
        },
        Err(e) => {
            log::warn!("Failed to execute docker CLI: {}", e);
        }
    }

    Ok(CommandResponse::ok(volumes))
}

/// Helper to parse Docker's human-readable size strings (e.g. "10MB", "5.5GB", "1024B")
fn parse_docker_size(s: &str) -> i64 {
    let s = s.trim();
    if s.is_empty() { return 0; }

    let digits: String = s.chars()
        .take_while(|c| c.is_digit(10) || *c == '.')
        .collect();
    
    let unit = s[digits.len()..].trim();
    let val: f64 = digits.parse().unwrap_or(0.0);

    let multiplier: f64 = match unit {
        "B" => 1.0,
        "kB" | "KB" | "kb" => 1000.0,
        "MB" | "mb" => 1000.0 * 1000.0,
        "GB" | "gb" => 1000.0 * 1000.0 * 1000.0,
        "TB" | "tb" => 1000.0 * 1000.0 * 1000.0 * 1000.0,
        "KiB" | "KIB" => 1024.0,
        "MiB" | "MIB" => 1024.0 * 1024.0,
        "GiB" | "GIB" => 1024.0 * 1024.0 * 1024.0,
        "TiB" | "TIB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };

    (val * multiplier) as i64
}

#[tauri::command]
async fn list_networks(
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<Vec<bollard::models::Network>>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };

    match docker.list_networks(None::<ListNetworksOptions>).await {
        Ok(networks) => Ok(CommandResponse::ok(networks)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn remove_image(
    id: String,
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<()>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };
    if let Err(e) = validate_docker_id(&id) {
        return Ok(CommandResponse::err(e));
    }

    match docker
        .remove_image(&id, None::<RemoveImageOptions>, None)
        .await
    {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn remove_volume(
    name: String,
    docker_state: State<'_, DockerState>,
) -> Result<CommandResponse<()>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };
    if let Err(e) = validate_docker_id(&name) {
        return Ok(CommandResponse::err(e));
    }

    match docker
        .remove_volume(&name, None::<RemoveVolumeOptions>)
        .await
    {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
async fn pull_image(
    image: String,
    app_handle: tauri::AppHandle,
    session_id: String,
    docker_state: State<'_, DockerState>,
    state: State<'_, PullState>,
) -> Result<CommandResponse<()>, String> {
    let docker = match docker_state.client() {
        Ok(d) => d,
        Err(e) => return Ok(CommandResponse::err(e)),
    };
    if let Err(e) = validate_docker_id(&image) {
        return Ok(CommandResponse::err(e));
    }

    let session_id_clone = session_id.clone();
    let handle = tokio::spawn(async move {
        let options = Some(CreateImageOptions {
            from_image: Some(image),
            ..Default::default()
        });

        let event_name = format!("pull-{}", session_id_clone);
        let mut stream = docker.create_image(options, None, None);

        while let Some(Ok(output)) = stream.next().await {
            let _ = app_handle.emit(&event_name, output);
        }
    });

    let abort_handle = handle.abort_handle();
    {
        let mut lock = state.inner().0.lock().unwrap();
        if let Some(old_handle) = lock.insert(session_id.clone(), abort_handle) {
            old_handle.abort();
        }
    }

    let res = handle.await;

    {
        let mut lock = state.inner().0.lock().unwrap();
        lock.remove(&session_id);
    }

    match res {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(_) => Ok(CommandResponse::err("Pull cancelled or failed")),
    }
}

#[tauri::command]
fn stop_pull(session_id: String, state: State<'_, PullState>) -> CommandResponse<()> {
    let mut lock = state.inner().0.lock().unwrap();
    if let Some(handle) = lock.remove(&session_id) {
        handle.abort();
    }
    CommandResponse::ok_empty()
}

#[tauri::command]
fn get_app_version(app_handle: tauri::AppHandle) -> String {
    app_handle.package_info().version.to_string()
}

// Docker lifecycle commands
#[tauri::command]
async fn check_colima_installed() -> CommandResponse<bool> {
    let installed = docker_lifecycle::check_colima_installed().await;
    CommandResponse::ok(installed)
}

#[tauri::command]
async fn check_docker_running() -> Result<CommandResponse<bool>, String> {
    let running = docker_lifecycle::check_docker_running().await;
    Ok(CommandResponse::ok(running))
}

#[tauri::command]
async fn get_docker_status() -> Result<CommandResponse<docker_lifecycle::DockerStatus>, String> {
    let status = docker_lifecycle::get_docker_status().await;
    Ok(CommandResponse::ok(status))
}

#[tauri::command]
async fn start_docker() -> Result<CommandResponse<()>, String> {
    match docker_lifecycle::start_docker_runtime().await {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(e) => Ok(CommandResponse::err(e)),
    }
}

#[tauri::command]
async fn wait_for_docker(timeout_secs: u64) -> Result<CommandResponse<()>, String> {
    match docker_lifecycle::wait_for_docker_ready(timeout_secs).await {
        Ok(_) => Ok(CommandResponse::ok_empty()),
        Err(e) => Ok(CommandResponse::err(e)),
    }
}

#[tauri::command]
fn get_install_instructions() -> CommandResponse<String> {
    let instructions = docker_lifecycle::get_install_instructions();
    CommandResponse::ok(instructions)
}

#[tauri::command]
fn did_we_start_docker() -> CommandResponse<bool> {
    let we_started = docker_lifecycle::did_we_start_docker();
    CommandResponse::ok(we_started)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DockerState::new())
        .manage(LogState(Mutex::new(HashMap::new())))
        .manage(ExecState(Mutex::new(HashMap::new())))
        .manage(PullState(Mutex::new(HashMap::new())))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Build a custom macOS app menu so that Cmd+Q closes windows
            // instead of calling NSApplication terminate (which skips ExitRequested)
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem};

                let quit_item = MenuItemBuilder::with_id("custom-quit", "Quit Opentainer")
                    .accelerator("CmdOrCtrl+Q")
                    .build(app)?;

                let app_submenu = SubmenuBuilder::new(app, "Opentainer")
                    .items(&[
                        &PredefinedMenuItem::about(app, Some("About Opentainer"), None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, Some("Hide Opentainer"))?,
                        &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
                        &PredefinedMenuItem::show_all(app, Some("Show All"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &quit_item,
                    ])
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_submenu)
                    .build()?;

                app.set_menu(menu)?;

                // Handle our custom quit menu item — emit stopping event and handle shutdown directly
                // (calling win.close() programmatically clears the webview before prevent_close saves it)
                let handle = app.handle().clone();
                app.on_menu_event(move |_app, event| {
                    if event.id().as_ref() == "custom-quit" {
                        log::info!("Custom Quit menu item triggered (Cmd+Q)");

                        if docker_lifecycle::did_we_start_docker() {
                            // Emit stopping event so frontend shows the stopping UI
                            let _ = handle.emit("docker-stopping", ());

                            let h = handle.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = docker_lifecycle::stop_docker_runtime().await;
                                log::info!("Colima stopped (via Cmd+Q). Exiting app.");
                                h.exit(0);
                            });
                        } else {
                            // We didn't start Docker, just exit immediately
                            handle.exit(0);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            list_containers,
            container_action,
            get_batch_stats,
            list_images,
            list_volumes,
            list_networks,
            start_logs,
            stop_logs,
            remove_image,
            remove_volume,
            start_exec,
            exec_input,
            exec_resize,
            stop_exec,
            pull_image,
            stop_pull,
            // Docker lifecycle commands
            check_colima_installed,
            check_docker_running,
            get_docker_status,
            start_docker,
            wait_for_docker,
            get_install_instructions,
            did_we_start_docker
        ])
        .on_window_event(|window, event| {
            // Handle window close request (red X button OR custom Cmd+Q) - stop Docker if we started it
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if docker_lifecycle::did_we_start_docker() {
                    // Prevent window from closing immediately
                    api.prevent_close();

                    // Emit event to frontend to show stopping UI
                    let _ = window.emit("docker-stopping", ());

                    log::info!("Opentainer started Colima, stopping it on close...");

                    // Spawn async task to stop Docker then close
                    let win = window.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = docker_lifecycle::stop_docker_runtime().await;
                        log::info!("Colima stopped. Closing window now.");
                        // Now actually close the window (WE_STARTED_DOCKER is now false,
                        // so the next CloseRequested won't prevent close again)
                        let _ = win.close();
                    });
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Log when app actually exits
            if let tauri::RunEvent::Exit = event {
                log::info!("Opentainer RunEvent::Exit fired");

                // Safety fallback: stop Docker if it's still marked as running
                // (should be a no-op since CloseRequested already stopped it)
                if docker_lifecycle::did_we_start_docker() {
                    log::info!(
                        "Docker still marked as running in Exit event. Executing blocking stop..."
                    );
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    let _ = rt.block_on(docker_lifecycle::stop_docker_runtime());
                    log::info!("Colima stopped (in Exit fallback).");
                }
            }
        });
}

#[cfg(test)]
mod tests;
