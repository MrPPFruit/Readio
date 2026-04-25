#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$APP_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/apks"
VERSION="$(node -p "require('$APP_DIR/package.json').version")"
APK_NAME="readio-v${VERSION}-android-arm64-release.apk"
UNSIGNED_APK="$APP_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
SIGNED_APK="$OUTPUT_DIR/$APK_NAME"
DEBUG_KEYSTORE="$HOME/.android/debug.keystore"
BUILD_TOOLS_DIR="$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -type d | sort -V | tail -n 1)"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"
ALIGNED_APK="$OUTPUT_DIR/readio-v${VERSION}-android-arm64-release-aligned.apk"

mkdir -p "$OUTPUT_DIR"

env -u TURBOPACK \
  -u __NEXT_PRIVATE_STANDALONE_CONFIG \
  -u __NEXT_PRIVATE_ORIGIN \
  -u NEXT_PRIVATE_STANDALONE \
  PATH="/Users/ppg/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  pnpm -C "$PROJECT_DIR" --filter @readest/readest-app exec tauri android build --apk -t aarch64

rm -f "$ALIGNED_APK" "$SIGNED_APK"
"$ZIPALIGN" -p -f 4 "$UNSIGNED_APK" "$ALIGNED_APK"
"$APKSIGNER" sign \
  --ks "$DEBUG_KEYSTORE" \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$SIGNED_APK" \
  "$ALIGNED_APK"
rm -f "$ALIGNED_APK"

"$APKSIGNER" verify --verbose "$SIGNED_APK"
ls -lh "$SIGNED_APK"
