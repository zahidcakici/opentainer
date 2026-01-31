use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::time::sleep;

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
pub fn check_colima_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("which")
            .arg("colima")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, check for native Docker
        Command::new("which")
            .arg("docker")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(target_os = "windows")]
    {
        // Windows - check for Docker in WSL or native
        false // TODO: Implement Windows support
    }
}

/// Start Docker runtime (Colima on macOS, systemd on Linux)
/// Note: This spawns the process and returns immediately.
/// Use wait_for_docker_ready() to wait for Docker to be responsive.
pub async fn start_docker_runtime() -> Result<(), String> {
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
        let status_output = Command::new("colima").arg("status").output();

        if let Ok(output) = status_output {
            if output.status.success() {
                // Already running - someone else started it
                START_IN_PROGRESS.store(false, Ordering::SeqCst);
                return Ok(());
            }
        }

        // Spawn Colima in the background - don't wait for it
        // colima start can take several minutes on first run (downloads VM image)
        let child = Command::new("colima")
            .args(["start", "--cpu", "2", "--memory", "4", "--disk", "60"])
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

        START_IN_PROGRESS.store(false, Ordering::SeqCst);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, try to start via systemctl (may require sudo)
        let output = Command::new("systemctl")
            .args(["start", "docker"])
            .output()
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

/// Stop Docker runtime (only if we started it)
pub async fn stop_docker_runtime() -> Result<(), String> {
    // Only stop if we started it
    if !WE_STARTED_DOCKER.load(Ordering::SeqCst) {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("colima")
            .arg("stop")
            .output()
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
    let colima_installed = check_colima_installed();
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

    #[test]
    fn test_check_colima_installed() {
        let installed = check_colima_installed();
        println!("Colima installed: {}", installed);
    }
}
