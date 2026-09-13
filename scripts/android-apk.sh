#!/usr/bin/env bash
# android-apk.sh — Build a debug APK for Writer on Android.
#
# Prerequisites:
#   - Android SDK ($ANDROID_HOME) with build-tools and platform android-34+
#   - Android NDK ($ANDROID_NDK_HOME or $ANDROID_HOME/ndk/)
#   - Java 17+ (for Gradle)
#   - Rust stable with aarch64-linux-android target (via rustup)
#   - Node.js + pnpm (for frontend build)
#
# Usage:
#   ./scripts/android-apk.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$ROOT_DIR/apps/desktop/src-tauri"
ANDROID_DIR="$TAURI_DIR/gen/android"

error() { echo "ERROR: $1" >&2; exit 1; }

# --- Preflight ---
[[ -n "${ANDROID_HOME:-}" ]] || error "ANDROID_HOME not set."
command -v java >/dev/null 2>&1 || error "Java not found. Install JDK 17+."
command -v cargo >/dev/null 2>&1 || error "cargo not found."

if [[ -n "${ANDROID_NDK_HOME:-}" ]] && [[ -d "$ANDROID_NDK_HOME" ]]; then
  echo "NDK: $ANDROID_NDK_HOME"
elif [[ -d "$ANDROID_HOME/ndk" ]]; then
  NDK_VERSION=$(ls "$ANDROID_HOME/ndk/" 2>/dev/null | head -1)
  [[ -n "$NDK_VERSION" ]] || error "No NDK found. Install: sdkmanager 'ndk;27.2.12479018'"
  export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"
  echo "NDK: $ANDROID_NDK_HOME"
else
  error "No NDK found. Install: sdkmanager 'ndk;27.2.12479018'"
fi

if ! cargo target list --installed 2>/dev/null | grep -q aarch64-linux-android; then
  echo "Installing aarch64-linux-android target..."
  rustup target add aarch64-linux-android
fi

# --- Initialize Android project if needed ---
if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "Initializing Android project..."
  cd "$ROOT_DIR/apps/desktop"
  npx tauri android init
  cd "$ROOT_DIR"
fi

# --- Build debug APK ---
echo "Building debug APK..."
cd "$ROOT_DIR/apps/desktop"
npx tauri android build -- --debug --target aarch64
cd "$ROOT_DIR"

# --- Locate output ---
APK=$(find "$ANDROID_DIR" -name "*.apk" 2>/dev/null | head -1)
if [[ -n "$APK" ]]; then
  echo ""
  echo "APK: $APK"
  echo "Install: adb install $APK"
fi
