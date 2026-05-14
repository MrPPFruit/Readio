# Readio Project Operating Rules

This file is for Claude/agent instances working in this repository. Follow these rules before changing code, building APKs, or publishing releases.

## Project identity

- Product: Readio, based on the Readest mainline.
- Primary repo: this repository checkout.
- Product mainline branch: `readio/restart-readest-base`.
- Do not use the old `feature/m0-spikes` branch as implementation, PR, or release base unless the user explicitly asks to inspect archive history.
- Android package/application id: `com.ppg.readio`.

## Change discipline

- Make the smallest change that satisfies the current task.
- Do not refactor unrelated code, reformat unrelated files, or clean up unrelated dead code.
- Stage/commit only intentional files. Never include `.codepilot-uploads/` unless the user explicitly asks.
- Before release or handoff, inspect `git status` and note any untracked or unrelated files.

## Versioning rules for APKs

Every APK given to the user or promoted for real-device testing must bump both:

1. `apps/readest-app/package.json` prerelease version.
2. Android `versionCode` in `apps/readest-app/src-tauri/tauri.conf.json`.

`versionCode` formula:

```text
versionCode = major*1000000 + minor*10000 + patch*1000 + alphaN
```

Example: `0.1.0-alpha.11` => `1001011`.

## APK build rules

- Prefer the project script for signed release APKs:

```bash
pnpm --filter @readest/readest-app build-readio-apk
```

- Expected local output directory:

```text
./apks/
```

- If running raw builds, clean host Next private env vars first:

```bash
unset __NEXT_PRIVATE_STANDALONE_CONFIG __NEXT_PRIVATE_ORIGIN NEXT_PRIVATE_STANDALONE TURBOPACK
```

- Android/Tauri builds may need the stable Rust toolchain first in `PATH`.
- Use the generated Android Gradle wrapper / Tauri flow, not an arbitrary system Gradle installation.

## APK validation rules

Before giving the user an APK:

1. Install the exact APK on an emulator with `adb install -r`.
2. Launch `com.ppg.readio/.MainActivity`.
3. Smoke test the changed area and at least confirm app launch/home/library.
4. For reader UI changes, open a book and verify the reader surface.
5. Keep adb/emulator commands short or run long tasks in background to avoid idle timeouts.

When validating the distributed package, install the GitHub-downloaded release asset, not a later local rebuild.

## GitHub release rules

GitHub Release assets are the public source of truth for distributed APKs.

For alpha releases:

- Release must be a prerelease, not a normal/latest-style release.
- Release title format:

```text
Readio v0.1.0-alpha.N
```

- Tag format:

```text
v0.1.0-alpha.N
```

- APK asset filename format:

```text
readio-v0.1.0-alpha.N-android-arm64-release.apk
readio-v0.1.0-alpha.N-android-arm64-release.apk.sha256
```

- Do not upload unrelated assets, especially KOReader plugin zips, to Readio APK releases.
- Avoid duplicate releases/drafts for the same alpha tag. If duplicates exist, clean them before publishing.

## Proven alpha release upload workflow

Historical alpha8/alpha9/alpha10/alpha11 APK assets were reliably attached by local/manual GitHub CLI upload. Do not treat the GitHub Actions release workflow as the source of truth for alpha APK publishing.

Use this traditional flow:

```bash
# 1. Create or ensure clean prerelease/tag
gh -R MrPPFruit/Readio release create v0.1.0-alpha.N \
  --target <commit-sha> \
  --title "Readio v0.1.0-alpha.N" \
  --notes "<concise release notes>" \
  --prerelease

# 2. Upload APK and checksum
gh -R MrPPFruit/Readio release upload v0.1.0-alpha.N \
  apks/readio-v0.1.0-alpha.N-android-arm64-release.apk \
  apks/readio-v0.1.0-alpha.N-android-arm64-release.apk.sha256 \
  --clobber

# 3. Verify release metadata/assets
gh -R MrPPFruit/Readio release view v0.1.0-alpha.N \
  --json tagName,isDraft,isPrerelease,assets,url
```

If APK upload stalls or fails:

- Do not repeatedly delete/recreate a clean release.
- Check current assets first.
- Keep the published prerelease/tag if they are correct.
- Retry only missing assets after network/proxy changes.
- Use background upload for the 55MB+ APK and poll with short non-blocking checks.

## Release hash verification

After uploading an APK:

1. Compute local SHA-256 before upload:

```bash
shasum -a 256 apks/readio-v0.1.0-alpha.N-android-arm64-release.apk
```

2. Verify GitHub asset digest from release metadata when available.
3. Download the GitHub release asset back and verify SHA-256 against the pre-upload local artifact.
4. Do not infer a published APK hash from a later local rebuild; Android builds may not be byte-for-byte reproducible and local `apks/` outputs can be overwritten.

## Known GitHub Actions caveat

GitHub `/releases/latest` does not return prereleases. Workflows relying on latest release may 404 for alpha versions. For alpha release automation, query the explicit tag instead.

## UI/product rules

- Readio UI must use theme tokens; avoid fixed colors because reading themes are user-configurable.
- Reader AI should remain an in-reader bottom sheet / full panel interaction, not a generic chat page or system dialog.
- Future Reader AI/RAG work should prioritize citation-first answers and spoiler-safe retrieval boundaries.

## Handoff rules

Before starting a new session or compacting after meaningful work, update `HANDOFF.md` with:

- Current goal and progress.
- What was tried and what worked/failed.
- Current blockers and risks.
- Next executable actions.
- Key file paths and verification evidence.
