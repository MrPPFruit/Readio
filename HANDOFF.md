# HANDOFF — Readio alpha.11 current state

## Current goal and progress

- Product line: Readio on the Readest-based mainline.
- Repo: this repository checkout.
- Branch: `readio/restart-readest-base`.
- Upstream Readest baseline: `528a13e36aaba55b03ccf4b1039c5d8e91060f11`.
- Current app version: `0.1.0-alpha.11` in `./apps/readest-app/package.json`.
- Android package/identifier: `com.ppg.readio`.
- Android `versionCode`: `1001011` in `./apps/readest-app/src-tauri/tauri.conf.json`.
- Current release APK: `./apks/readio-v0.1.0-alpha.11-android-arm64-release.apk`.
- GitHub Release asset is the source of truth for distributed APKs. Verified alpha.11 release asset SHA-256: `89d10a22b626b1710d9bb69ff0a9cb679d757ea3243c3dc30f38ecae5db5d7bf`.
- Working tree note for this handoff rewrite: `./HANDOFF.md` is intentionally rewritten and `./HANDOFF_PRE_ALPHA10_ARCHIVE.md` intentionally archives old history. `./.codepilot-uploads/` is unrelated and should not be committed unless explicitly intended.

## Latest validated release state

- alpha.11 release is clean on GitHub: one prerelease/tag, no duplicate draft, APK plus `.sha256` assets present.
- alpha.11 APK asset SHA-256 is `89d10a22b626b1710d9bb69ff0a9cb679d757ea3243c3dc30f38ecae5db5d7bf`.
- alpha.10 Reader AI / RAG / selection / annotator improvement batch remains the latest fully emulator-smoke-tested functional baseline:
  - APK build succeeded and APK signature verification passed with v2=true, v3=true, 1 signer.
  - GitHub Release downloaded asset hash matched the uploaded local artifact hash.
  - Emulator validation passed on `emulator-5554`: app launched, home/library displayed Continue Reading and Alice book, Alice reader opened, Reader AI entry opened via reader controls.
  - Reader AI entry Android WebView pointer timing issue is fixed by opening the `ReaderAIButton` on primary `pointerdown` and deduping the later `click`.
  - Same-location citation ordering preserves service ordering so citation `[1]` does not jump to the wrong source.
  - Android `selectionchange` during long-press/drag is cached and processed after `touchend`, avoiding loss of real long-press selections.

## Validation evidence to preserve

- Full Vitest run passed: `189 files / 3475 tests passed`.
- App lint passed: `pnpm --filter @readest/readest-app lint`, `808 files checked`.
- Type check passed: `pnpm --filter @readest/readest-app exec tsgo --noEmit`.
- APK rebuild/install/smoke test passed.
- Reader AI final screenshot evidence: `/tmp/readio_review_fixed_ai_panel_2.png`.

## Rules and gotchas

- Project-level agent rules now live in `./CLAUDE.md`; read it before code, build, or release work.
- Release distribution rule:
  - GitHub Release asset is the public APK source of truth.
  - Alpha releases must be GitHub prereleases with title format `Readio v0.1.0-alpha.N`, tag format `v0.1.0-alpha.N`, and APK asset format `readio-v0.1.0-alpha.N-android-arm64-release.apk` plus `.sha256`.
  - Do not upload unrelated assets, especially KOReader plugin zips, to Readio APK releases.
  - Avoid duplicate releases/drafts for the same alpha tag. If duplicates exist, clean them before publishing.
  - Proven upload path is local/manual `gh release upload`; GitHub Actions release workflow is not currently the source of truth for alpha APK publishing.
  - If a large APK upload stalls, do not repeatedly recreate a clean release. Check current assets, keep the correct prerelease/tag, and retry only missing assets after network/proxy changes.
  - After uploading an APK, download it back from GitHub Release and verify SHA-256 against the pre-upload local artifact.
  - Do not infer a published APK hash from a later local rebuild; Android builds may not be byte-for-byte reproducible and local `apks/` outputs can be overwritten.
  - If regression testing the package users receive, install the GitHub-downloaded APK rather than whatever local APK happens to be newest.
- Version bump rule:
  - Every APK given to the user or promoted for real-device testing must bump `apps/readest-app/package.json` prerelease and Android `versionCode` in `apps/readest-app/src-tauri/tauri.conf.json`.
  - `versionCode = major*1000000 + minor*10000 + patch*1000 + alphaN`; example alpha.11 is `1001011`.
- Build rule:
  - Prefer `pnpm --filter @readest/readest-app build-readio-apk` for signed release APKs into `./apks/`.
  - Clean host Next private env vars if running raw builds: unset `__NEXT_PRIVATE_STANDALONE_CONFIG`, `__NEXT_PRIVATE_ORIGIN`, `NEXT_PRIVATE_STANDALONE`, `TURBOPACK`.
  - Android/Tauri builds may need the stable Rust toolchain first in `PATH`.
  - Use generated Android Gradle wrapper / Tauri flow, not an arbitrary system Gradle installation.
- Android validation rule:
  - Before giving the user an APK, install it on emulator and perform basic functional verification.
  - Check `adb devices` first and keep adb/emulator commands short or backgrounded.
- Product/UI rule:
  - Readio UI must use theme tokens; avoid fixed colors.
  - Reader AI should remain an in-reader bottom sheet / full panel interaction, not a generic chat page or system dialog.
  - Readio mainline is this repo/branch; do not use old `feature/m0-spikes` as PR or release base unless explicitly inspecting archive history.

## Current blockers and risks

- No known alpha.11 release blocker at this handoff.
- `.codepilot-uploads/` is untracked and likely unrelated; avoid accidental commit.
- Android generated files can be overwritten by `tauri android init` or icon generation. Recheck package paths, app label, and launcher resources after regeneration.
- Reader missing-source recovery still relies on a timed toast callback that returns to library after 5 seconds; if user reports confusion, replace with an explicit action in a focused batch.
- Footnote popup still uses an internal scrolled renderer as a non-reading-mode exception. Treat separately if product later requires absolutely no scrolling renderers.

## Next actions

1. If continuing alpha.11 stabilization, start from targeted tests around Reader AI, Android selection, and citation ordering; then run type check, lint, and focused emulator validation.
2. If preparing alpha.12 or later, bump version and `versionCode` first, then build with `build-readio-apk`, install on emulator, smoke test, create a prerelease, upload APK plus `.sha256` with local `gh release upload`, download it back, and verify SHA-256.
3. If committing, review `git diff` and stage only intentional source/docs changes; do not stage `.codepilot-uploads/` by default.
4. If needing historical context, read `./HANDOFF_PRE_ALPHA10_ARCHIVE.md` instead of expanding this handoff.

## Key files

- `./HANDOFF.md`
- `./HANDOFF_PRE_ALPHA10_ARCHIVE.md`
- `./apps/readest-app/package.json`
- `./apps/readest-app/src-tauri/tauri.conf.json`
- `./apps/readest-app/src/config/features.ts`
- `./READIO_UI_DESIGN.md`
- `./CLAUDE.md`
- `./apks/readio-v0.1.0-alpha.11-android-arm64-release.apk`
