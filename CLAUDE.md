# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Opentainer is a lightweight desktop Docker management app built with **Tauri 2** (Rust backend + React 19/TypeScript frontend). The Rust side talks to the Docker daemon via the **Bollard** crate; the React side calls into Rust exclusively through Tauri `invoke` commands and `listen` events.

## Commands

```bash
npm run dev          # Run the full app (Tauri + Vite) with hot reload — the normal dev loop
npm run build        # Production build of the desktop app (tauri build)
npm run lint         # ESLint over the frontend
npm run type-check   # tsc --noEmit (type errors only, no emit)
npm test             # Vitest (watch mode by default)
npm test -- run                              # Single non-watch run
npm test -- src/hooks/__tests__/useSortable.test.ts   # Run one test file
npm run dev:vite     # Frontend-only Vite server (no Rust); useful for pure UI work
```

Rust-only checks run from `src-tauri/`: `cargo check`, `cargo test` (Rust tests live in `src-tauri/src/tests.rs`).

## Architecture

### The Rust ↔ React boundary

This is the single most important thing to understand. All communication crosses one bridge:

- **`src/lib/api.ts`** — the typed frontend facade. The `AppApi` interface lists every backend capability the UI uses. Every method wraps a Tauri `invoke("<command>")` call (or, for streaming, sets up `listen` event subscriptions and returns an unsubscribe function).
- **`src-tauri/src/lib.rs`** — defines every `#[tauri::command]` and registers them in the `tauri::generate_handler![...]` macro inside `run()`. **A command is only callable from the frontend if it appears in that macro.** When adding a backend feature you must touch three places: the `fn` + `#[tauri::command]`, the `generate_handler!` list, and the `AppApi` interface in `api.ts`.

Command results follow a consistent `{ success: boolean; data?: T; error?: string }` envelope on the TS side.

### Streaming (logs, exec, image pull, Colima output)

Long-lived/streaming operations don't return data directly — they emit Tauri **events** that the frontend subscribes to via `listen`. Patterns:
- **Logs** (`start_logs`/`stop_logs`) and **exec** (`start_exec`/`exec_input`/`exec_resize`/`stop_exec`) stream output through events; the TS wrappers expose callback-based APIs and return a `dispose`/unsubscribe function. The xterm.js terminal (`@xterm/xterm`) renders exec sessions.
- **Image pull** (`pull_image`/`stop_pull`) streams progress events.
- Background streaming tasks are tracked by `AbortHandle`s so they can be cancelled cleanly.

### Docker connection & state

`DockerState` in `lib.rs` is a singleton `Mutex<InnerDockerState>` holding a lazily-initialized, cached Bollard `Docker` client. It can reconnect if Docker wasn't running at startup (`connect_with_retry`). `connect_docker()` tries the default socket first, then falls back to Colima's socket (`~/.colima/default/docker.sock`) on macOS.

### Docker lifecycle / Colima management (`src-tauri/src/docker_lifecycle.rs`)

Opentainer can act as a Docker Desktop replacement on macOS by managing **Colima**. Key behaviors:
- It detects whether *any* Docker provider is already running (OrbStack, Podman, Docker Desktop) and, if so, connects without managing it.
- If nothing is running but Colima is installed, it starts/stops Colima itself. Whether the app started Docker is tracked (`did_we_start_docker`) so it only shuts Colima down on app close (`CloseRequested` window event in `lib.rs`) if *we* started it.
- Bundled macOS `.app` processes do **not** inherit the user's shell PATH. `enriched_path()` prepends Homebrew bin dirs (`/opt/homebrew/bin`, `/usr/local/bin`) so child processes (colima → limactl) can find their binaries. Always use `enriched_path()` when spawning external commands.

The app's startup flow lives in `App.tsx` (`checkAndStartDocker`): check running → check Colima installed → start Colima (streaming `colima-output` progress events) → `waitForDocker`. The `DockerStatus` component renders the gating UI (`checking`/`ready`/`not-installed`/etc.) before the main UI is shown.

### Frontend structure

- **`src/App.tsx`** — root: tab state (`containers`/`images`/`volumes`/`networks`/settings) and the Docker readiness gate.
- **`src/hooks/`** — one data hook per resource (`useContainers`, `useImages`, `useVolumes`, `useNetworks`), plus `useBatchContainerStats` (live CPU/mem via `get_batch_stats`) and `useSortable`. Hooks own fetching/polling against `api`.
- **`src/components/`** — list views per resource, `ContainerDrawer`/`ContainerItem` for detail, `LogsView`/`ExecView` for streaming, `Layout` for shell.
- **`src/context/ThemeContext.tsx`** — light/dark theme; terminal theming in `src/lib/terminalTheme.ts`.

## Conventions

- Release builds are aggressively size-optimized (`opt-level = "s"`, `lto`, `strip`, `panic = "abort"` in `Cargo.toml`) — the small binary is a product goal. Avoid changes that pull in heavy dependencies.
- Keep frontend↔backend types in sync manually: there is no codegen between Rust structs and TS interfaces.
- `MAX_LOG_LINES` and `DOCKER_TIMEOUT_SECONDS` in `App.tsx` cap log retention and first-run Colima VM download time respectively.
