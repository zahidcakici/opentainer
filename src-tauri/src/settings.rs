//! Persistent app settings (engine choice + Colima resource profile).
//!
//! Stored as a small JSON file in the platform config dir. The backend reads it
//! at startup to decide whether to show the engine wizard and how to start
//! Colima, so it deliberately avoids a plugin and stays serde-only.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::docker_lifecycle::ColimaResources;

/// Which container engine the user opted into during onboarding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    /// The Colima engine we bundle and manage ourselves.
    #[default]
    Colima,
    /// A user-managed provider (OrbStack, Docker Desktop, Podman, …).
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    /// Whether the engine wizard has been completed at least once.
    #[serde(default)]
    pub setup_completed: bool,
    /// The engine the user chose.
    #[serde(default)]
    pub engine: EngineKind,
    /// Colima VM resource profile (only meaningful when `engine == Colima`).
    #[serde(default)]
    pub colima: ColimaResources,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// Load settings, falling back to defaults if the file is missing or unreadable.
pub fn load(app: &tauri::AppHandle) -> AppSettings {
    settings_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist settings atomically (temp file + rename).
pub fn save(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
