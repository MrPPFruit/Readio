# HANDOFF — Readio alpha.10 current state

## Current goal and progress

- Product line: Readio on the Readest-based mainline.
- Repo: `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest`.
- Branch: `readio/restart-readest-base`.
- Upstream Readest baseline: `528a13e36aaba55b03ccf4b1039c5d8e91060f11`.
- Current app version: `0.1.0-alpha.10` in `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apps/readest-app/package.json`.
- Android package/identifier: `com.ppg.readio`.
- Android `versionCode`: `1001010` in `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apps/readest-app/src-tauri/tauri.conf.json`.
- Current release APK: `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apks/readio-v0.1.0-alpha.10-android-arm64-release.apk`.
- GitHub Release asset is the source of truth for distributed APKs. Verified alpha.10 release asset SHA-256: `d8ebcf40edb698d0dd1c9f7c1cf4fbe5291079200345898ae81a584db6ff8769`.
- Working tree note for this handoff rewrite: `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/HANDOFF.md` is intentionally rewritten and `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/HANDOFF_PRE_ALPHA10_ARCHIVE.md` intentionally archives old history. `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/.codepilot-uploads/` is unrelated and should not be committed unless explicitly intended.

## Latest validated alpha.10 state

- alpha.10 Reader AI / RAG / selection / annotator improvement batch is implemented, validated, and release-verified.
- APK build succeeded and APK signature verification passed with v2=true, v3=true, 1 signer.
- GitHub Release downloaded asset hash matched the uploaded local artifact hash; use the downloaded GitHub asset for user-facing regression tests when validating the distributed package.
- Emulator validation passed on `emulator-5554`:
  - `adb install -r ...alpha.10...apk` returned `Success`.
  - `com.ppg.readio/.MainActivity` launched.
  - Home/library displayed Continue Reading and Alice book.
  - Alice reader opened successfully.
  - Reader AI entry opened via reader controls; Android WebView pointer timing issue is fixed by opening the `ReaderAIButton` on primary `pointerdown` and deduping the later `click`.
- Additional alpha.10 fixes already included:
  - Same-location citation ordering preserves service ordering so citation `[1]` does not jump to the wrong source.
  - Android `selectionchange` during long-press/drag is cached and processed after `touchend`, avoiding loss of real long-press selections.

## Validation evidence to preserve

- Full Vitest run passed: `189 files / 3475 tests passed`.
- App lint passed: `pnpm --filter @readest/readest-app lint`, `808 files checked`.
- Type check passed: `pnpm --filter @readest/readest-app exec tsgo --noEmit`.
- APK rebuild/install/smoke test passed.
- Reader AI final screenshot evidence: `/tmp/readio_review_fixed_ai_panel_2.png`.

## Rules and gotchas

- Release distribution rule:
  - GitHub Release asset is the public APK source of truth.
  - After uploading an APK, download it back from GitHub Release and verify SHA-256 against the pre-upload local artifact.
  - Do not infer a published APK hash from a later local rebuild; Android builds may not be byte-for-byte reproducible and local `apks/` outputs can be overwritten.
  - If regression testing the package users receive, install the GitHub-downloaded APK rather than whatever local APK happens to be newest.
- Version bump rule:
  - Every APK given to the user or promoted for real-device testing must bump `apps/readest-app/package.json` prerelease and Android `versionCode` in `apps/readest-app/src-tauri/tauri.conf.json`.
  - `versionCode = major*1000000 + minor*10000 + patch*1000 + alphaN`; example alpha.10 is `1001010`.
- Build rule:
  - Prefer `pnpm --filter @readest/readest-app build-readio-apk` for signed release APKs into `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apks/`.
  - Clean host Next private env vars if running raw builds: unset `__NEXT_PRIVATE_STANDALONE_CONFIG`, `__NEXT_PRIVATE_ORIGIN`, `NEXT_PRIVATE_STANDALONE`, `TURBOPACK`.
  - Android/Tauri builds may need stable cargo first in PATH: `/Users/ppg/.rustup/toolchains/stable-aarch64-apple-darwin/bin`.
  - Use generated Android Gradle wrapper / Tauri flow, not system Gradle 9.4.1.
- Android validation rule:
  - Before giving the user an APK, install it on emulator and perform basic functional verification.
  - Check `adb devices` first and keep adb/emulator commands short or backgrounded.
- Product/UI rule:
  - Readio UI must use theme tokens; avoid fixed colors.
  - Reader AI should remain an in-reader bottom sheet / full panel interaction, not a generic chat page or system dialog.
  - Readio mainline is this repo/branch; do not use old `feature/m0-spikes` as PR or release base unless explicitly inspecting archive history.

## Current blockers and risks

- No known alpha.10 release blocker at this handoff.
- `.codepilot-uploads/` is untracked and likely unrelated; avoid accidental commit.
- Android generated files can be overwritten by `tauri android init` or icon generation. Recheck package paths, app label, and launcher resources after regeneration.
- Reader missing-source recovery still relies on a timed toast callback that returns to library after 5 seconds; if user reports confusion, replace with an explicit action in a focused batch.
- Footnote popup still uses an internal scrolled renderer as a non-reading-mode exception. Treat separately if product later requires absolutely no scrolling renderers.

## Next actions

1. If continuing alpha.10 stabilization, start from targeted tests around Reader AI, Android selection, and citation ordering; then run type check, lint, and focused emulator validation.
2. If preparing alpha.11 or later, bump version and `versionCode` first, then build with `build-readio-apk`, install on emulator, smoke test, upload release asset, download it back, and verify SHA-256.
3. If committing, review `git diff` and stage only intentional source/docs changes; do not stage `.codepilot-uploads/` by default.
4. If needing historical context, read `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/HANDOFF_PRE_ALPHA10_ARCHIVE.md` instead of expanding this handoff.

## Key files

- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/HANDOFF.md`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/HANDOFF_PRE_ALPHA10_ARCHIVE.md`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apps/readest-app/package.json`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apps/readest-app/src-tauri/tauri.conf.json`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apps/readest-app/src/config/features.ts`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/READIO_UI_DESIGN.md`
- `/Users/ppg/Documents/CloudCodeWorkSpace/Program_Readio_Readest/apks/readio-v0.1.0-alpha.10-android-arm64-release.apk`
