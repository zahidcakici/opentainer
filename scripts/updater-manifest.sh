#!/usr/bin/env bash
# Build the updater manifest (latest.json) for a GitHub release from the
# signed bundles already uploaded to it, and upload it (replacing any existing
# one).
#
# The release matrix builds each platform in a parallel job. Letting every job
# read-merge-write latest.json races (the last writer wins and drops the other
# platforms), so the build jobs skip it and this runs once after all of them.
#
# Usage: scripts/updater-manifest.sh <release-tag>      e.g. app-v0.2.0
# Requires: gh (authenticated, or GH_TOKEN), jq.
set -euo pipefail

TAG="${1:?usage: $0 <release-tag>}"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

release_json="$(gh release view "$TAG" --repo "$REPO" --json tagName,body,assets)"
version="${TAG##*v}"
notes="$(jq -r '.body // ""' <<<"$release_json")"
assets="$(jq -r '.assets[].name' <<<"$release_json")"

# Updater platform key -> glob for the signed bundle it should install.
# Plain `<os>-<arch>` keys are the fallback the updater uses when no
# installer-specific key matches; they point at the preferred bundle.
PLATFORMS=(
  "darwin-aarch64|*_aarch64.app.tar.gz"
  "darwin-x86_64|*_x64.app.tar.gz"
  "linux-x86_64|*.AppImage"
  "linux-x86_64-appimage|*.AppImage"
  "linux-x86_64-deb|*.deb"
  "linux-x86_64-rpm|*.rpm"
  "windows-x86_64|*-setup.exe"
  "windows-x86_64-nsis|*-setup.exe"
  "windows-x86_64-msi|*.msi"
)

platforms='{}'
for entry in "${PLATFORMS[@]}"; do
  key="${entry%%|*}"
  pattern="${entry#*|}"

  asset=""
  while IFS= read -r name; do
    # shellcheck disable=SC2053 # intentional glob match
    if [[ "$name" == $pattern ]] && grep -qxF "$name.sig" <<<"$assets"; then
      asset="$name"
      break
    fi
  done <<<"$assets"

  if [[ -z "$asset" ]]; then
    echo "• $key: no signed bundle — skipped"
    continue
  fi

  gh release download "$TAG" --repo "$REPO" --pattern "$asset.sig" --dir "$WORK" --clobber
  signature="$(cat "$WORK/$asset.sig")"
  url="https://github.com/$REPO/releases/download/$TAG/$asset"
  platforms="$(jq --arg k "$key" --arg s "$signature" --arg u "$url" \
    '. + {($k): {signature: $s, url: $u}}' <<<"$platforms")"
  echo "✓ $key: $asset"
done

if [[ "$platforms" == '{}' ]]; then
  echo "error: no signed bundles found on $TAG" >&2
  exit 1
fi

jq -n \
  --arg version "$version" \
  --arg notes "$notes" \
  --arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson platforms "$platforms" \
  '{version: $version, notes: $notes, pub_date: $pub_date, platforms: $platforms}' \
  >"$WORK/latest.json"

gh release upload "$TAG" "$WORK/latest.json" --repo "$REPO" --clobber
echo "✓ uploaded latest.json to $TAG"
