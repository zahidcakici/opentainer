mod docker_lifecycle;

use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::models::ContainerStatsResponse;
use bollard::query_parameters::{
    CreateImageOptions, ListContainersOptions, ListImagesOptions, ListNetworksOptions,
    ListVolumesOptions, LogsOptions, RemoveImageOptions, RemoveVolumeOptions, StatsOptions,
};
use bollard::Docker;
use futures_util::stream::FuturesUnordered;
use futures_util::stream::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, State};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

/// Connect to Docker, trying Colima's socket on macOS if default fails
fn get_docker() -> Result<Docker, bollard::errors::Error> {
    // First try the default connection
    if let Ok(docker) = Docker::connect_with_local_defaults() {
        return Ok(docker);
    }

    // On macOS, try Colima's socket path
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let colima_socket = format!("{home}/.colima/default/docker.sock");
            if std::path::Path::new(&colima_socket).exists() {
                return Docker::connect_with_socket(&colima_socket, 120, bollard::API_DEFAULT_VERSION);
            }
        }
    }

    // Fall back to default error
    Docker::connect_with_local_defaults()
}

struct LogState(Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>);

struct ExecSession {
    handle: tauri::async_runtime::JoinHandle<()>,
    input_tx: mpsc::Sender<String>,
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
    state: State<'_, LogState>,
) -> CommandResponse<()> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }
        }
    };

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
    app_handle: tauri::AppHandle,
    state: State<'_, ExecState>,
) -> CommandResponse<()> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }
        }
    };

    let (input_tx, mut input_rx) = mpsc::channel::<String>(100);
    let session_id_clone = session_id.clone();

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

        // Start exec
        let start_result = docker.start_exec(&exec.id, None).await;

        match start_result {
            Ok(StartExecResults::Attached {
                mut output,
                mut input,
            }) => {
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
    if let Some(old_session) = lock.insert(session_id, ExecSession { handle, input_tx }) {
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

#[derive(Serialize)]
struct CommandResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
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
) -> Result<CommandResponse<Vec<ContainerStatsResult>>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

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

    Ok(CommandResponse {
        success: true,
        data: Some(results),
        error: None,
    })
}

#[tauri::command]
async fn list_containers() -> Result<CommandResponse<Vec<bollard::models::ContainerSummary>>, String>
{
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    let options = Some(ListContainersOptions {
        all: true,
        ..Default::default()
    });

    match docker.list_containers(options).await {
        Ok(containers) => Ok(CommandResponse {
            success: true,
            data: Some(containers),
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn container_action(id: String, action: String) -> Result<CommandResponse<()>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    let res = match action.as_str() {
        "start" => docker.start_container(&id, None).await,
        "stop" => docker.stop_container(&id, None).await,
        "restart" => docker.restart_container(&id, None).await,
        "remove" => docker.remove_container(&id, None).await,
        _ => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some("Invalid action".to_string()),
            })
        }
    };

    match res {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn list_images() -> Result<CommandResponse<Vec<bollard::models::ImageSummary>>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    match docker.list_images(None::<ListImagesOptions>).await {
        Ok(images) => Ok(CommandResponse {
            success: true,
            data: Some(images),
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn list_volumes() -> Result<CommandResponse<Vec<bollard::models::Volume>>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    match docker.list_volumes(None::<ListVolumesOptions>).await {
        Ok(res) => Ok(CommandResponse {
            success: true,
            data: res.volumes,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn list_networks() -> Result<CommandResponse<Vec<bollard::models::Network>>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    match docker.list_networks(None::<ListNetworksOptions>).await {
        Ok(networks) => Ok(CommandResponse {
            success: true,
            data: Some(networks),
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn remove_image(id: String) -> Result<CommandResponse<()>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    match docker
        .remove_image(&id, None::<RemoveImageOptions>, None)
        .await
    {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn remove_volume(name: String) -> Result<CommandResponse<()>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

    match docker
        .remove_volume(&name, None::<RemoveVolumeOptions>)
        .await
    {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
async fn pull_image(
    image: String,
    app_handle: tauri::AppHandle,
    session_id: String,
    state: State<'_, PullState>,
) -> Result<CommandResponse<()>, String> {
    let docker = match get_docker() {
        Ok(d) => d,
        Err(e) => {
            return Ok(CommandResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            })
        }
    };

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
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(_) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some("Pull cancelled or failed".to_string()),
        }),
    }
}

#[tauri::command]
fn stop_pull(session_id: String, state: State<'_, PullState>) -> CommandResponse<()> {
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
fn get_app_version(app_handle: tauri::AppHandle) -> String {
    app_handle.package_info().version.to_string()
}

// Docker lifecycle commands
#[tauri::command]
fn check_colima_installed() -> CommandResponse<bool> {
    let installed = docker_lifecycle::check_colima_installed();
    CommandResponse {
        success: true,
        data: Some(installed),
        error: None,
    }
}

#[tauri::command]
async fn check_docker_running() -> Result<CommandResponse<bool>, String> {
    let running = docker_lifecycle::check_docker_running().await;
    Ok(CommandResponse {
        success: true,
        data: Some(running),
        error: None,
    })
}

#[tauri::command]
async fn get_docker_status() -> Result<CommandResponse<docker_lifecycle::DockerStatus>, String> {
    let status = docker_lifecycle::get_docker_status().await;
    Ok(CommandResponse {
        success: true,
        data: Some(status),
        error: None,
    })
}

#[tauri::command]
async fn start_docker() -> Result<CommandResponse<()>, String> {
    match docker_lifecycle::start_docker_runtime().await {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
async fn stop_docker() -> Result<CommandResponse<()>, String> {
    match docker_lifecycle::stop_docker_runtime().await {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
async fn wait_for_docker(timeout_secs: u64) -> Result<CommandResponse<()>, String> {
    match docker_lifecycle::wait_for_docker_ready(timeout_secs).await {
        Ok(_) => Ok(CommandResponse {
            success: true,
            data: None,
            error: None,
        }),
        Err(e) => Ok(CommandResponse {
            success: false,
            data: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
fn get_install_instructions() -> CommandResponse<String> {
    let instructions = docker_lifecycle::get_install_instructions();
    CommandResponse {
        success: true,
        data: Some(instructions),
        error: None,
    }
}

#[tauri::command]
fn did_we_start_docker() -> CommandResponse<bool> {
    let we_started = docker_lifecycle::did_we_start_docker();
    CommandResponse {
        success: true,
        data: Some(we_started),
        error: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            stop_exec,
            pull_image,
            stop_pull,
            // Docker lifecycle commands
            check_colima_installed,
            check_docker_running,
            get_docker_status,
            start_docker,
            stop_docker,
            wait_for_docker,
            get_install_instructions,
            did_we_start_docker
        ])
        .on_window_event(|window, event| {
            // Handle window close request (red X button) - stop Docker if we started it
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                
                if docker_lifecycle::did_we_start_docker() {
                    // Prevent window from closing immediately
                    api.prevent_close();
                    
                    // Emit event to frontend to show stopping UI
                    let _ = window.emit("docker-stopping", ());
                    
                    log::info!("Opentainer started Colima, stopping it on exit...");
                    
                    // Clone window handle for the closure
                    let win = window.clone();
                    
                    // Spawn thread to stop Docker then close
                    std::thread::spawn(move || {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        let _ = rt.block_on(docker_lifecycle::stop_docker_runtime());
                        log::info!("Colima stopped.");
                        // Now actually close the window
                        let _ = win.close();
                    });
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Handle Cmd+Q (macOS app menu quit)
            if let tauri::RunEvent::ExitRequested { ref api, .. } = event {
                // log
                log::info!("Opentainer received Cmd+Q, checking if we started Docker...");
                
                if docker_lifecycle::did_we_start_docker() {
                    // Prevent immediate exit
                    api.prevent_exit();
                    
                    // Emit event to frontend to show stopping UI
                    let _ = app_handle.emit("docker-stopping", ());
                    
                    log::info!("Opentainer started Colima (Cmd+Q), stopping it on exit...");
                    
                    let handle = app_handle.clone();
                    
                    std::thread::spawn(move || {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        let _ = rt.block_on(docker_lifecycle::stop_docker_runtime());
                        log::info!("Colima stopped.");
                        handle.exit(0);
                    });
                }
            }
            
            // Log when app actually exits
            if let tauri::RunEvent::Exit = event {
                log::info!("Opentainer RunEvent::Exit fired");

                // Reliable fallback: If Docker is still running check failed or skipped (e.g. forced exit),
                // we MUST stop it here, blocking the main thread to ensure completion.
                if docker_lifecycle::did_we_start_docker() {
                    log::info!("Docker still marked as running in Exit event. Executing blocking stop...");
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    let _ = rt.block_on(docker_lifecycle::stop_docker_runtime());
                    log::info!("Colima stopped (in Exit fallback).");
                }
            }
        });
}
