//! In-app updates via `tauri-plugin-updater`.
//!
//! We drive the plugin from Rust rather than through its JS bindings, so the
//! frontend keeps talking to us through our own commands (see `api.ts`) and no
//! updater permissions have to be granted to the webview.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::docker_lifecycle;

/// Event carrying download progress while an update is being installed.
pub const PROGRESS_EVENT: &str = "update-progress";

/// The update found by the last check, so `install` applies exactly the
/// version the user was shown.
#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    /// Release notes from the update manifest, if any.
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    /// Total size in bytes, when the server reports it.
    pub total: Option<u64>,
}

/// Ask the update endpoint for a newer version. `None` means up to date.
pub async fn check(app: &AppHandle, pending: &PendingUpdate) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    let info = update.as_ref().map(|u| UpdateInfo {
        current_version: u.current_version.clone(),
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

/// Download + install the pending update, then relaunch into it.
///
/// Only returns on failure; on success the process restarts.
pub async fn install(app: &AppHandle, pending: &PendingUpdate) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("No pending update. Check for updates first.")?;

    let handle = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;
    update
        .download_and_install(
            move |chunk_len, total| {
                downloaded += chunk_len as u64;
                // Throttle to roughly every 1% (or 1 MB when size is unknown)
                // so a large download doesn't flood the IPC channel.
                let step = total.map_or(1024 * 1024, |t| (t / 100).max(1));
                if downloaded - last_emitted >= step || Some(downloaded) == total {
                    last_emitted = downloaded;
                    let _ = handle.emit(PROGRESS_EVENT, UpdateProgress { downloaded, total });
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    // Same shutdown contract as quitting: if we started Colima, stop it so the
    // relaunched app starts from a clean slate instead of orphaning the VM.
    // Done after install so a failed install leaves Docker untouched.
    if docker_lifecycle::did_we_start_docker() {
        let _ = app.emit("docker-stopping", ());
        let _ = docker_lifecycle::stop_docker_runtime().await;
    }

    app.restart()
}
