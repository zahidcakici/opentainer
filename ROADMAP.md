# Opentainer Roadmap

A milestone-based plan for upcoming features. Each item is sized to be picked up and implemented one at a time. Items reference concrete files in this repo and the Tauri 2 plugins/APIs needed.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

Current baseline (v0.0.3):
- Tauri 2.9, single window `main`, identifier `com.opentainer.app`.
- Release pipeline (`.github/workflows/release.yml`) builds all platforms, signs + notarizes macOS, publishes draft GitHub Releases. **No updater artifacts yet.**
- App quits on window close (`CloseRequested` in `src-tauri/src/lib.rs` stops Colima if we started it).
- Capabilities: only `src-tauri/capabilities/default.json`.

---

## Milestone 1 — Auto Update

Goal: users can check for, download, and install updates without manually re-downloading from GitHub.

### 1a. Updater foundation `[ ]`
- Add `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` (JS).
- Generate an updater signing keypair (`npm run tauri signer generate`). Store the **private key + password as GitHub secrets** (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); commit the **public key** into `tauri.conf.json`.
- Add `plugins.updater` block to `src-tauri/tauri.conf.json`:
  - `pubkey`, `endpoints` (point at the GitHub Releases `latest.json`, e.g. `https://github.com/zahidcakici/opentainer/releases/latest/download/latest.json`).
  - `"windows": { "installMode": "passive" }`.
- Add `updater:default` permission to a capability file.
- **Release pipeline changes** (`release.yml`): set `createUpdaterArtifacts: true` (or `tauri.bundle.createUpdaterArtifacts`), inject the two signing-key env vars, and let `tauri-action` emit `latest.json` + `.sig` files into the release. Verify the macOS universal vs per-arch targets each get signatures.
- ⚠️ Updater requires the app to be **signed** — macOS is covered; confirm Windows artifacts are signed or the updater will refuse them.

### 1b. Manual "Check for updates" `[ ]`
- Backend command `check_for_update` (in `lib.rs` or a new `updater.rs` module) wrapping the updater plugin; expose via `AppApi` in `src/lib/api.ts` and register in `generate_handler!`.
- UI entry point in `Settings.tsx`: "Check for updates" button → shows current version (already have `get_app_version`), available version, release notes, and a Download/Install button.
- On install: download with progress events (reuse the existing event-streaming pattern like `pull_image`), then `relaunch()` from `plugin-process`.

### 1c. Background / automatic update checks `[ ]`
- On startup (after the Docker readiness gate in `App.tsx`), silently check once; if an update exists show a non-blocking banner/toast.
- Setting: "Automatically check for updates" (on/off) + cadence (on launch / daily). Persist via a settings store (see Milestone 4a).
- Optional: "Download and install automatically, notify when ready to restart."

---

## Milestone 2 — Background Operation + Menu Bar (Tray) Icon

Goal: behave like Docker Desktop / OrbStack — live in the macOS menu bar, keep running when the window is closed, quick actions without opening the full UI.

### 2a. System tray icon `[ ]`
- Use Tauri 2 built-in `TrayIcon` (`tauri::tray`) — no extra plugin needed. Build it in `run()` setup in `lib.rs`.
- Tray menu: Show/Hide Window · Docker status line (running/stopped) · Start/Stop Docker (reuse `start_docker` / Colima lifecycle in `docker_lifecycle.rs`) · Quick container count · Quit.
- Tray icon should reflect state (e.g. different icon/template image when Docker is running vs stopped). Add menu-bar template icons to `src-tauri/icons/` (monochrome template images for macOS dark/light menu bar).

### 2b. Close-to-tray instead of quit `[ ]`
- Change the `CloseRequested` handler in `lib.rs`: on window close, **hide** the window (`window.hide()` + `api.prevent_close()`) instead of exiting, when "keep running in background" is enabled.
- Add an explicit **Quit** path (tray menu + Cmd+Q) that performs the real shutdown — i.e. the existing "stop Colima if we started it" logic must move to the quit path, not the close path.
- macOS: set the app as an *accessory*/agent when only the tray is active so it doesn't keep a Dock icon (`tauri::ActivationPolicy::Accessory`), and restore Regular policy when the window is shown. Make this a setting.

### 2c. Launch at login (autostart) `[ ]`
- Add `tauri-plugin-autostart` + JS binding; permission in capability file.
- Setting in `Settings.tsx`: "Start Opentainer at login" (and optionally "start minimized to menu bar").

### 2d. Single instance `[ ]`
- Add `tauri-plugin-single-instance` so launching again focuses the existing window instead of spawning a second process (important once it lives in the background).

---

## Milestone 3 — Notifications & Status Awareness

### 3a. Native notifications `[ ]`
- Add `tauri-plugin-notification`. Notify on: update ready, Docker/Colima started or crashed, long pull finished.
- Respect a "show notifications" setting.

### 3b. Richer tray/status feedback `[ ]`
- Tray tooltip with running/total container counts and Docker provider name (default vs Colima — `connect_docker` already knows the path).
- Optional: badge/animation while Colima is starting (reuse `colima-output` progress events).

---

## Milestone 5 — Engine Install Wizard (macOS first-run onboarding)

Goal: replace the bare "run this `brew` command" fallback (currently in `DockerStatus.tsx` when `dockerState === 'not-installed'`) with a guided, no-CLI onboarding flow. A user with no container engine should be able to get from a fresh install to a running Docker entirely from the UI.

Current behavior to replace: `App.tsx` → `checkAndStartDocker` resolves to `not-installed` when no engine is running and Colima isn't installed; `DockerStatus` then surfaces a copy-paste `brew install colima` command. The wizard supersedes that screen.

### 5a. Engine selection step `[ ]`
- New onboarding UI (a multi-step wizard rendered by `DockerStatus`, or a dedicated `EngineWizard` component gated on the `not-installed` state).
- Step 1: choose an engine.
  - **Colima** — recommended/default. Opentainer can install and manage it directly (we already drive Colima via `docker_lifecycle.rs`).
  - **Other engines** (OrbStack, Docker Desktop, Podman) — link out to their installers via `openExternal`; once installed and running, our existing `checkDockerRunning` provider detection picks them up with no further management.
- Engine strategy: **bundle Colima (and its required Lima engine) inside the `.app` at build time**, verified by SHA256. (Decision: no `brew install` — that hard-requires Homebrew and pollutes the user's `brew list`; no runtime download-and-manage of the binaries — we ship them in the bundle. The only thing fetched at runtime is the VM image, see 5c.) Accepted trade-off: this grows the macOS bundle by ~40 MB per architecture; that's the cost of a zero-prerequisite, fully offline-capable install.

#### Bundling (build/CI)
- "Bundle Colima" means **Colima + Lima together** — Colima alone can't run; it drives `limactl` plus Lima's `share/` tree (guest agents/templates).
- Pin known-good Colima/Lima versions as constants. In `.github/workflows/release.yml`, before the Tauri build, download the matching-arch artifacts and **verify SHA256 against the published sums** (non-negotiable — we're shipping executables):
  - **Colima** — standalone binary `colima-Darwin-{arm64,x86_64}` (+ `.sha256sum`).
  - **Lima** — `lima-<ver>-Darwin-{arch}.tar.gz` (~25–37 MB) verified against `SHA256SUMS`, then extracted (`limactl` + `share/`).
  - The macOS matrix already builds per-arch (aarch64 + x86_64 as separate jobs), so each job fetches/bundles only its own arch — no fat universal-engine penalty.
- Ship them via Tauri `bundle.resources` (a folder tree, since Lima needs its `share/` dir alongside `limactl`) rather than a single `externalBin` sidecar. They land in the app's resource dir and are covered by our existing codesign + notarization step, so they run without a Gatekeeper prompt.

#### Engine resolution (the "change all colima commands" part)
- **All Colima/Lima invocations must resolve to the bundled binaries** — no code path may reach for a system `colima`/`limactl`. Centralize this: `find_binary()` (and anything spawning the engine in `docker_lifecycle.rs`) resolves the bundled paths via the Tauri resource dir (`app.path().resource_dir()` / `resolve_resource`), and `enriched_path()` prepends that dir. Set `LIMA_HOME` so Colima finds Lima's `share/` tree. Audit every existing `colima` call site so none use a bare PATH lookup.
- Make the binaries executable at runtime if extraction/copy doesn't preserve the mode; strip `com.apple.quarantine` defensively (bundled, notarized files shouldn't carry it).
- No `install_colima` download command is needed for the binaries anymore — selecting Colima in 5a just enables the bundled engine; the only first-run wait is the VM image (5c).

### 5b. Resource configuration step `[ ]`
- After Colima is selected, let the user set VM resources before first start, with **recommended defaults that mirror Docker Desktop** (e.g. CPUs, ~6 GB memory, disk size). Show recommended values pre-filled; advanced users can override.
- Pass these to Colima start as flags (`colima start --cpu N --memory G --disk G`). Today `start_docker` / the Colima start path uses defaults — extend it to accept a resource profile (and persist it via the settings store from **4a** so subsequent starts reuse it).
- Keep a single source of truth for default values so the UI and the start command agree.

### 5c. First-run image/VM download messaging `[ ]`
- With the engine binaries now bundled (5a), the **VM image is the only thing fetched at runtime** — downloaded once on the first Colima start when the user opts into Colima. This is slow. Surface a clear **"This is a one-time setup, it may take a few minutes"** message, with the existing `colima-output` progress (percent/speed/ETA already parsed in `App.tsx`'s `ColimaProgressEvent`).
- Distinguish first-run (downloading image) from normal starts in the UI copy so users aren't alarmed by the wait.
- On completion, fall through to the normal `waitForDocker` → `ready` path.

### 5d. Re-entry & failure handling `[ ]`
- If install/start fails (no Homebrew, no network, insufficient disk), show actionable errors with a retry, not a dead end.
- Make the wizard re-runnable from `Settings.tsx` (e.g. "Reconfigure engine") so users can change engine or bump resources later.


---

## Milestone 4 — Developer Experience (inspired by Docker Desktop / OrbStack / Podman Desktop)

### 4a. Persistent settings store `[ ]`
- Foundation for nearly everything above. Add `tauri-plugin-store` (or a small JSON config in the app config dir) to persist: theme, auto-update prefs, autostart, close-to-tray, notifications.
- Today theme lives only in `ThemeContext.tsx`; centralize prefs.

### 4b. Container creation / run wizard `[ ]`
- Currently you can manage existing containers but not create them. Add a "Run" flow: pick image, ports, env vars, volumes, name, restart policy → `container_create` + `container_start` commands (Bollard supports this).
- This is the single biggest gap vs. Docker Desktop.

### 4c. Image pull from UI search `[ ]`
- Search Docker Hub and pull by tag from within the app (pull plumbing `pull_image` already exists; add a search/registry-browse front end).

### 4d. Compose support `[ ]`
- Detect and list `docker compose` projects; up/down/logs per project. Big feature — likely shells out to the `docker compose` CLI via `enriched_path()` rather than Bollard.

### 4e. Container inspect / file browser `[ ]`
- Tabs in `ContainerDrawer.tsx`: full inspect JSON, mounted volumes, env, and a basic exec-backed file browser. (OrbStack-style.)

### 4f. Resource dashboard `[ ]`
- Aggregate CPU/mem/disk across containers (extend `useBatchContainerStats`), plus image/volume disk usage and a one-click "prune" (dangling images, stopped containers, unused volumes/networks).

### 4g. Port / quick-open helpers `[ ]`
- Show published ports as clickable links (open in browser via existing `openExternal`). OrbStack-style "open in browser" for web containers.

### 4h. Keyboard shortcuts & command palette `[ ]`
- Global shortcuts (start/stop/restart selected, search) and a `Cmd+K` palette for power users.

### 4i. Multi-window / detached logs `[ ]`
- Pop out logs or a terminal into its own window for monitoring while working elsewhere.

---

## Suggested implementation order

1. **4a** settings store (unblocks update prefs, tray prefs, and the wizard's resource profile in 5b).
2. **Milestone 5** engine install wizard (first impression for any user without an engine — removes the only remaining required CLI step).
3. **Milestone 1** auto-update (highest user value, infra mostly exists).
4. **Milestone 2** tray + background (the headline "like Docker Desktop" feature).
5. **3** notifications.
6. **4b/4c** container creation + image search (close the biggest functional gaps).
7. Remaining DX items as appetite allows.

## Cross-cutting notes
- Every new backend capability requires touching three places (see `CLAUDE.md`): the `#[tauri::command]` fn, the `generate_handler!` list in `lib.rs`, and the `AppApi` interface in `src/lib/api.ts`.
- Each new plugin needs a matching permission in a `src-tauri/capabilities/*.json` file or calls will be denied.
- Keep the small-binary goal in mind (release profile is size-optimized); prefer built-in Tauri APIs (e.g. tray) over heavy deps where possible.
