use tokio::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::time::sleep;
use tauri::Emitter;

/// Well-known directories where Homebrew (and other package managers) install binaries.
/// Bundled macOS .app processes do NOT inherit the user's shell PATH, so we must
/// search these locations explicitly.
#[cfg(target_os = "macos")]
const EXTRA_BIN_DIRS: &[&str] = &[
    "/opt/homebrew/bin",   // Apple Silicon Homebrew
    "/usr/local/bin",      // Intel Homebrew / manual installs
    "/usr/bin",
];

/// Build a PATH string that prepends well-known Homebrew directories to the
/// current PATH.  This ensures that child processes (and *their* children,
/// e.g. limactl spawned by colima) can find all required binaries.
pub fn enriched_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        // Collect dirs that aren't already in current PATH
        let mut extra: Vec<&str> = Vec::new();
        for dir in EXTRA_BIN_DIRS {
            if !current.split(':').any(|p| p == *dir) {
                extra.push(dir);
            }
        }
        if extra.is_empty() {
            return current;
        }
        // Prepend so they take priority
        format!("{}:{}", extra.join(":"), current)
    }

    #[cfg(not(target_os = "macos"))]
    {
        current
    }
}

/// Look up a binary by name, checking well-known directories first and falling
/// back to `which`.  Returns the full path (e.g. `/opt/homebrew/bin/colima`).
pub fn find_binary(name: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for dir in EXTRA_BIN_DIRS {
            let path = format!("{}/{}", dir, name);
            if std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    // Fallback: `which` (works in dev / when PATH is correct)
    std::process::Command::new("which")
        .arg(name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        })
}

/// Create a `Command` for colima with the resolved binary path and an enriched
/// PATH environment variable so that colima's own subprocesses (limactl, qemu,
/// docker, etc.) can also be found.
#[cfg(target_os = "macos")]
fn colima_command() -> Result<Command, String> {
    let bin = find_binary("colima")
        .ok_or_else(|| "Colima binary not found".to_string())?;
    let mut cmd = Command::new(bin);
    cmd.env("PATH", enriched_path());
    Ok(cmd)
}

/// Global flag to track if Opentainer started the Docker runtime
/// This is used to determine whether to stop Docker on app quit
static WE_STARTED_DOCKER: AtomicBool = AtomicBool::new(false);

/// Flag to prevent concurrent starts
static START_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Docker lifecycle management for Opentainer
///
/// Strategy:
/// 1. Check if Docker is RUNNING first (supports any provider: Orbstack, Podman, Docker Desktop)
/// 2. If running, use it without managing it
/// 3. If not running, check for Colima and start it
/// 4. On quit, only stop Docker if WE started it

#[derive(Debug, Clone, serde::Serialize)]
pub struct DockerStatus {
    pub running: bool,
    pub colima_installed: bool,
    pub we_started: bool,
    pub error: Option<String>,
}

/// Structured progress info emitted to the frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct ColimaProgress {
    /// The raw output line from colima
    pub message: String,
    /// Whether this is a download progress line
    pub is_download: bool,
    /// Download percentage (0-100) if available
    pub percent: Option<f64>,
    /// Download speed string if available (e.g. "5.2 MiB/s")
    pub speed: Option<String>,
    /// ETA string if available (e.g. "2m30s")
    pub eta: Option<String>,
}

/// Parse a colima output line to extract download progress if present.
/// Colima uses QEMU/Lima which outputs lines like:
///   "downloading ... 45.2% 5.2 MiB/s ETA 2m30s"
///   or progress bars with percentage info
fn parse_colima_progress(line: &str) -> ColimaProgress {
    let trimmed = line.trim();

    // Try to extract percentage from common patterns
    let mut percent: Option<f64> = None;
    let mut speed: Option<String> = None;
    let mut eta: Option<String> = None;
    let mut is_download = false;

    // Pattern 1: Look for percentage like "45.2%" or "45%"
    if let Some(pct_pos) = trimmed.find('%') {
        // Walk backwards from '%' to find the number
        let before = &trimmed[..pct_pos];
        let num_start = before.rfind(|c: char| !c.is_ascii_digit() && c != '.')
            .map(|i| i + 1)
            .unwrap_or(0);
        if let Ok(pct) = before[num_start..].parse::<f64>() {
            if (0.0..=100.0).contains(&pct) {
                percent = Some(pct);
                is_download = true;
            }
        }
    }

    // Pattern 2: Look for speed indicators (MiB/s, MB/s, KiB/s, etc.)
    for unit in &["MiB/s", "MB/s", "KiB/s", "KB/s", "GiB/s", "GB/s", "B/s"] {
        if let Some(unit_pos) = trimmed.find(unit) {
            // Walk backwards from the unit to find the speed number
            let before = trimmed[..unit_pos].trim_end();
            let num_start = before.rfind(|c: char| !c.is_ascii_digit() && c != '.')
                .map(|i| i + 1)
                .unwrap_or(0);
            let speed_str = &before[num_start..];
            if !speed_str.is_empty() {
                speed = Some(format!("{} {}", speed_str, unit));
                is_download = true;
            }
            break;
        }
    }

    // Pattern 3: Look for ETA
    let lower = trimmed.to_lowercase();
    if let Some(eta_pos) = lower.find("eta") {
        let after = trimmed[eta_pos + 3..].trim();
        if !after.is_empty() {
            // Take until end of line or next whitespace block after time
            let eta_str: String = after.chars()
                .take_while(|c| c.is_ascii_digit() || *c == 'm' || *c == 's' || *c == 'h' || *c == ':' || *c == ' ')
                .collect();
            let eta_trimmed = eta_str.trim().to_string();
            if !eta_trimmed.is_empty() {
                eta = Some(eta_trimmed);
            }
        }
    }

    // Also detect download by keywords
    if !is_download {
        is_download = lower.contains("download")
            || lower.contains("pulling")
            || lower.contains("fetching");
    }

    ColimaProgress {
        message: trimmed.to_string(),
        is_download,
        percent,
        speed,
        eta,
    }
}

/// Check if Docker daemon is currently running by attempting to connect
/// Tries multiple socket paths including Colima's custom socket
pub async fn check_docker_running() -> bool {
    // First try the default connection (respects DOCKER_HOST env var)
    if let Ok(docker) = bollard::Docker::connect_with_local_defaults() {
        if docker.ping().await.is_ok() {
            return true;
        }
    }

    // On macOS, also try Colima's socket path
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let colima_socket = format!("unix://{home}/.colima/default/docker.sock");
            if let Ok(docker) = bollard::Docker::connect_with_socket(
                &colima_socket,
                120,
                bollard::API_DEFAULT_VERSION,
            ) {
                if docker.ping().await.is_ok() {
                    return true;
                }
            }
        }
    }

    false
}

/// Check if Colima is installed on the system (macOS)
pub async fn check_colima_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        find_binary("colima").is_some()
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, check for native Docker
        find_binary("docker").is_some()
    }

    #[cfg(target_os = "windows")]
    {
        // Windows - check for Docker in WSL or native
        false // TODO: Implement Windows support
    }
}

/// Start Docker runtime (Colima on macOS, systemd on Linux)
/// When an app_handle is provided, emits 'colima-output' events with real-time
/// progress so the UI can display download status on first run.
pub async fn start_docker_runtime(app_handle: Option<tauri::AppHandle>) -> Result<(), String> {
    // Prevent concurrent starts
    if START_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        log::info!("Start already in progress, skipping duplicate call");
        return Ok(());
    }

    // If we already started before, just return
    if WE_STARTED_DOCKER.load(Ordering::SeqCst) {
        START_IN_PROGRESS.store(false, Ordering::SeqCst);
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // First check if already running
        let status_output = colima_command().map_err(|e| {
            START_IN_PROGRESS.store(false, Ordering::SeqCst);
            e
        })?
            .arg("status")
            .output()
            .await;

        if let Ok(output) = status_output {
            if output.status.success() {
                // Already running - someone else started it
                START_IN_PROGRESS.store(false, Ordering::SeqCst);
                return Ok(());
            }
        }

        // Spawn Colima with piped stdout/stderr so we can stream progress to the UI.
        // On first run this downloads a ~300-800MB VM disk image and can take minutes.
        use std::process::Stdio;

        let child = colima_command().map_err(|e| {
            START_IN_PROGRESS.store(false, Ordering::SeqCst);
            e
        })?
            .args(["start", "--cpu", "2", "--memory", "4", "--disk", "60"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                START_IN_PROGRESS.store(false, Ordering::SeqCst);
                format!("Failed to start Colima: {}", e)
            })?;

        // Mark that we started Docker
        WE_STARTED_DOCKER.store(true, Ordering::SeqCst);

        log::info!(
            "Colima start spawned with PID: {:?}, WE_STARTED_DOCKER=true",
            child.id()
        );

        // Spawn a background task to read colima's output and emit events
        if let Some(handle) = app_handle {
            tokio::spawn(async move {
                stream_colima_output(child, handle).await;
            });
        }
        // If no app_handle, the child process just runs in the background (old behaviour)

        START_IN_PROGRESS.store(false, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, try to start via systemctl (may require sudo)
        let output = Command::new("systemctl")
            .args(["start", "docker"])
            .output()
            .await
            .map_err(|e| format!("Failed to start Docker: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to start Docker: {}", stderr));
        }

        WE_STARTED_DOCKER.store(true, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Err("Windows support not yet implemented".to_string())
    }
}

/// Read stdout/stderr from the colima child process and emit events to the frontend
async fn stream_colima_output(mut child: tokio::process::Child, app_handle: tauri::AppHandle) {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let handle_stdout = app_handle.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let progress = parse_colima_progress(&line);
                log::info!("colima stdout: {}", line);
                let _ = handle_stdout.emit("colima-output", &progress);
            }
        }
    });

    let handle_stderr = app_handle.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let progress = parse_colima_progress(&line);
                log::info!("colima stderr: {}", line);
                let _ = handle_stderr.emit("colima-output", &progress);
            }
        }
    });

    // Wait for both stream readers to finish
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    // Wait for the child process to complete
    match child.wait().await {
        Ok(status) => {
            log::info!("Colima process exited with status: {}", status);
            if !status.success() {
                let _ = app_handle.emit("colima-output", &ColimaProgress {
                    message: format!("Colima exited with status: {}", status),
                    is_download: false,
                    percent: None,
                    speed: None,
                    eta: None,
                });
            }
        }
        Err(e) => {
            log::error!("Failed to wait for Colima process: {}", e);
        }
    }
}

/// Stop Docker runtime (only if we started it)
pub async fn stop_docker_runtime() -> Result<(), String> {
    // Only stop if we started it
    if !WE_STARTED_DOCKER.load(Ordering::SeqCst) {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let output = colima_command()?
            .arg("stop")
            .output()
            .await
            .map_err(|e| format!("Failed to stop Colima: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Ignore if not running
            if !stderr.contains("not running") {
                return Err(format!("Failed to stop Colima: {}", stderr));
            }
        }

        WE_STARTED_DOCKER.store(false, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let output = Command::new("systemctl")
            .args(["stop", "docker"])
            .output()
            .await
            .map_err(|e| format!("Failed to stop Docker: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to stop Docker: {}", stderr));
        }

        WE_STARTED_DOCKER.store(false, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Err("Windows support not yet implemented".to_string())
    }
}

/// Wait for Docker to be ready, with a timeout
pub async fn wait_for_docker_ready(timeout_secs: u64) -> Result<(), String> {
    let poll_interval = Duration::from_secs(2);
    let max_attempts = timeout_secs / 2;

    for _ in 0..max_attempts {
        if check_docker_running().await {
            return Ok(());
        }
        sleep(poll_interval).await;
    }

    Err(format!(
        "Docker did not become ready within {} seconds",
        timeout_secs
    ))
}

/// Get comprehensive Docker status
pub async fn get_docker_status() -> DockerStatus {
    let running = check_docker_running().await;
    let colima_installed = check_colima_installed().await;
    let we_started = WE_STARTED_DOCKER.load(Ordering::SeqCst);

    DockerStatus {
        running,
        colima_installed,
        we_started,
        error: None,
    }
}

/// Check if we started the Docker runtime (for quit behavior)
pub fn did_we_start_docker() -> bool {
    WE_STARTED_DOCKER.load(Ordering::SeqCst)
}

/// Get installation instructions for the current platform
pub fn get_install_instructions() -> String {
    #[cfg(target_os = "macos")]
    {
        "Install Colima and Docker CLI:\n\nbrew install colima docker\n\nOpentainer will manage Colima automatically.".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        "Install Docker Engine:\n\nhttps://docs.docker.com/engine/install/".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        "Windows support coming soon.".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_docker_running() {
        // This will depend on whether Docker is actually running
        let running = check_docker_running().await;
        println!("Docker running: {}", running);
    }

    #[tokio::test]
    async fn test_check_colima_installed() {
        let installed = check_colima_installed().await;
        println!("Colima installed: {}", installed);
    }
}
