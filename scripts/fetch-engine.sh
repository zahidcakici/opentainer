#!/usr/bin/env bash
#
# Fetch + verify the Colima + Lima container engine that gets bundled inside the
# macOS .app (see src-tauri/tauri.macos.conf.json -> bundle.resources).
#
# We bundle the engine instead of asking users to `brew install` it, so a fresh
# Mac can run containers with zero prerequisites. Every binary is resolved +
# pinned by SHA256 in engine.lock.json (generated from engine.manifest.json) and
# verified on download. The resulting tree mirrors Lima's own layout so `limactl`
# resolves its `../share/lima` automatically:
#
#   src-tauri/resources/engine/
#     bin/{colima, limactl, ...}
#     share/lima/...
#
# To bump a pinned version: edit engine.manifest.json, then run
# scripts/lock-engine.sh (npm run engine:lock) — never hand-edit engine.lock.json.
#
# Usage:  scripts/fetch-engine.sh [arm64|x86_64]   (defaults to host arch)
#
set -euo pipefail

# ── Paths ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/engine.manifest.json"
LOCKFILE="$REPO_ROOT/engine.lock.json"
ENGINE_DIR="$REPO_ROOT/src-tauri/resources/engine"
BIN_DIR="$ENGINE_DIR/bin"
STAMP="$ENGINE_DIR/.engine-version"
ENTITLEMENTS="$REPO_ROOT/src-tauri/resources/lima-vz.entitlements"

# ── Tooling ──
need() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' is required but not installed" >&2; exit 1; }; }
need jq
need curl
need shasum
need tar
[[ -f "$LOCKFILE" ]] || { echo "error: lock file not found: $LOCKFILE (run: npm run engine:lock)" >&2; exit 1; }

# ── Drift guard: refuse to build from a lock that's stale vs. the manifest ──
# (offline — just compares versions; full integrity is enforced per-download below)
if [[ -f "$MANIFEST" ]]; then
  while IFS= read -r comp; do
    want="$(jq -r --arg c "$comp" '.dependencies[$c].version' "$MANIFEST")"
    have="$(jq -r --arg c "$comp" '.dependencies[$c].version // ""' "$LOCKFILE")"
    if [[ "$want" != "$have" ]]; then
      echo "error: engine.lock.json is out of date for '$comp' (manifest=$want lock=${have:-<missing>})" >&2
      echo "       run: npm run engine:lock" >&2
      exit 1
    fi
  done < <(jq -r '.dependencies | keys[]' "$MANIFEST")
fi

# ── Resolve target arch ──
ARCH="${1:-$(uname -m)}"
case "$ARCH" in
  arm64 | aarch64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="x86_64" ;;
  *)
    echo "error: unsupported arch '$ARCH' (expected arm64 or x86_64)" >&2
    exit 1
    ;;
esac

# ── Read pinned dependency metadata from the lock ──
lock() { jq -r "$1" "$LOCKFILE"; }
COLIMA_VERSION="$(lock '.dependencies.colima.version')"
LIMA_VERSION="$(lock '.dependencies.lima.version')"
COLIMA_URL="$(lock ".dependencies.colima.artifacts.\"$ARCH\".url")"
COLIMA_SHA="$(lock ".dependencies.colima.artifacts.\"$ARCH\".sha256")"
LIMA_URL="$(lock ".dependencies.lima.artifacts.\"$ARCH\".url")"
LIMA_SHA="$(lock ".dependencies.lima.artifacts.\"$ARCH\".sha256")"

for v in COLIMA_VERSION LIMA_VERSION COLIMA_URL COLIMA_SHA LIMA_URL LIMA_SHA; do
  if [[ -z "${!v}" || "${!v}" == "null" ]]; then
    echo "error: missing '$v' for arch '$ARCH' in $LOCKFILE" >&2
    exit 1
  fi
done

WANT="colima-${COLIMA_VERSION}+lima-${LIMA_VERSION}+${ARCH}"

# ── Idempotency: skip if the exact engine is already in place ──
if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$WANT" && -x "$BIN_DIR/colima" && -x "$BIN_DIR/limactl" ]]; then
  echo "engine already present ($WANT) — skipping"
  exit 0
fi

verify() { # file expected_sha
  local actual
  actual="$(shasum -a 256 "$1" | awk '{print $1}')"
  if [[ "$actual" != "$2" ]]; then
    echo "error: checksum mismatch for $(basename "$1")" >&2
    echo "  expected: $2" >&2
    echo "  actual:   $actual" >&2
    echo "  (if you intended to bump a version, run: npm run engine:update)" >&2
    exit 1
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching Colima ${COLIMA_VERSION} (${ARCH})…"
curl -fSL --retry 3 -o "$TMP/colima" "$COLIMA_URL"
verify "$TMP/colima" "$COLIMA_SHA"

echo "Fetching Lima ${LIMA_VERSION} (${ARCH})…"
curl -fSL --retry 3 -o "$TMP/lima.tar.gz" "$LIMA_URL"
verify "$TMP/lima.tar.gz" "$LIMA_SHA"

echo "Assembling engine at ${ENGINE_DIR}"
rm -rf "$ENGINE_DIR"
mkdir -p "$BIN_DIR"

# Lima tarball lays out ./bin and ./share at the root.
tar -xzf "$TMP/lima.tar.gz" -C "$ENGINE_DIR"
install -m 0755 "$TMP/colima" "$BIN_DIR/colima"
chmod 0755 "$BIN_DIR/limactl"

# Trim weight we don't need at runtime. We run the VZ backend (built into
# limactl), so the external krunkit driver and the MCP helper are dead weight.
# Colima drives limactl directly, so the docs/man pages aren't needed either.
rm -rf \
  "$ENGINE_DIR/share/doc" \
  "$ENGINE_DIR/share/man" \
  "$ENGINE_DIR/libexec/lima/lima-driver-krunkit" \
  "$ENGINE_DIR/libexec/lima/limactl-mcp"

# The Lima `vz` driver runs the VM in-process inside limactl, which macOS only
# permits if the binary carries the com.apple.security.virtualization
# entitlement. The upstream tarball ships limactl WITHOUT it (Homebrew re-signs
# on install), so we sign it here. An ad-hoc signature is enough for the
# entitlement to take effect locally; the release pipeline re-signs limactl with
# the Developer ID + this same entitlement before notarization (see release.yml).
if [[ -f "$ENTITLEMENTS" ]] && command -v codesign >/dev/null 2>&1; then
  echo "Signing limactl with the vz entitlement (ad-hoc)…"
  codesign --force --entitlements "$ENTITLEMENTS" --sign - "$BIN_DIR/limactl"
else
  echo "warning: skipping limactl vz signing (codesign or entitlements unavailable)" >&2
fi

echo "$WANT" > "$STAMP"
echo "✓ engine ready: $(du -sh "$ENGINE_DIR" | awk '{print $1}') at $ENGINE_DIR"
