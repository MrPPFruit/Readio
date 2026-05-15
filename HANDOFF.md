# HANDOFF — Readio alpha.13 current state

## Current goal and progress

- Product line: Readio on the Readest-based mainline.
- Repo: this repository checkout.
- Branch: `readio/restart-readest-base`.
- Upstream Readest baseline: `528a13e36aaba55b03ccf4b1039c5d8e91060f11`.
- Current app version: `0.1.0-alpha.13` in `./apps/readest-app/package.json`.
- Android package/identifier: `com.ppg.readio`.
- Android `versionCode`: `1001013` in `./apps/readest-app/src-tauri/tauri.conf.json`.
- Current release APK: `./apks/readio-v0.1.0-alpha.13-android-arm64-release.apk`.
- GitHub Release asset is the source of truth for distributed APKs.
- Working tree note: `./HANDOFF.md` is intentionally rewritten and `./HANDOFF_PRE_ALPHA10_ARCHIVE.md` intentionally archives old history. `./.codepilot-uploads/` is unrelated and should not be committed unless explicitly intended.

## Latest validated release state

- alpha.13 is the latest GitHub prerelease (2026-05-14).
- alpha.13 brightness fixes: follow-system brightness with numeric display + accent color, registered `reset_screen_brightness` permission, reverted to window-level brightness control.
- alpha.10 Reader AI / RAG / selection / annotator improvement batch remains the latest fully emulator-smoke-tested functional baseline:
  - APK build succeeded and APK signature verification passed with v2=true, v3=true, 1 signer.
  - GitHub Release downloaded asset hash matched the uploaded local artifact hash.
  - Emulator validation passed on `emulator-5554`: app launched, home/library displayed Continue Reading and Alice book, Alice reader opened, Reader AI entry opened via reader controls.
  - Reader AI entry Android WebView pointer timing issue is fixed by opening the `ReaderAIButton` on primary `pointerdown` and deduping the later `click`.
  - Same-location citation ordering preserves service ordering so citation `[1]` does not jump to the wrong source.
  - Android `selectionchange` during long-press/drag is cached and processed after `touchend`, avoiding loss of real long-press selections.

## Validation evidence to preserve

- Latest Reader AI/RAG Phase A verification (2026-05-15):
  - Committed as `e4a504bf feat(ai): improve reader retrieval context quality`.
  - Follow-up regression test committed as `c0a0dc10 test(ai): cover spoiler setting changes within conversation`.
  - `pnpm -C "./apps/readest-app" test -- --watch=false src/__tests__/ai/chunker.test.ts src/__tests__/ai/bm25-search.test.ts src/__tests__/ai/context-pack.test.ts src/__tests__/ai/rag-service.test.ts src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/tauri-chat-adapter.test.ts` passed after review fixes; Vitest selected the full app suite and reported `191 files / 3507 tests passed`, `2 files / 7 tests skipped`.
  - Same-conversation spoiler toggle regression test passed; subsequent full Vitest run reported `191 files / 3508 tests passed`.
  - `pnpm -C "./apps/readest-app" lint` passed after final blocker fix; `tsgo --noEmit && biome check .`, `811 files checked`.
- Reader AI/RAG Phase B classifier + prompt/context metadata verification (2026-05-15):
  - Committed as `fbf9f215 feat(ai): add reader question intent and scope routing`.
  - Added deterministic `intent + scope` classifier and passed classification metadata through `readerChatService`, `TauriChatAdapter`, and `/api/ai/chat` reader context validation into `buildSystemPrompt`.
  - Review fixes: API validation rejects classification scopes that conflict with effective spoiler protection; whole-book prompts use `source_scope="whole_book_allowed" reading_position="..."` instead of current `page_limit` metadata; high-risk spoiler wording now still routes through read-so-far retrieval/prompting instead of an early canned return; empty whole-book prompts no longer claim page-limited context.
  - `pnpm -C "./apps/readest-app" test -- --watch=false src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/api-chat-route.test.ts src/__tests__/ai/question-routing.test.ts src/__tests__/ai/tauri-chat-adapter.test.ts` passed; Vitest selected the full app suite and reported `192 files / 3514 tests passed`, `2 files / 7 tests skipped`.
  - `pnpm -C "./apps/readest-app" lint` passed; `tsgo --noEmit && biome check .`, `813 files checked`.
  - Final code review approved after blocker fixes.
- Reader AI Android/Tauri empty-answer fix verification (2026-05-15):
  - Root cause: local retrieval could surface citations before provider text, while Tauri native HTTP may return stream text via `response.text()` without a readable `body`; this produced an AI answer panel with citations but no answer body.
  - Fixed `openAICompatibleModel.ts` to parse OpenAI-compatible SSE from `response.text()` when a Tauri response has no readable stream body.
  - Fixed `ReaderAIAssistant.tsx` to show `AI 没有返回正文，请重试或切换模型。` when generation completes with sources but no answer text.
  - Focused tests passed: `openai-compatible-model.test.ts` reported `4 passed`; `reader-ai-assistant.test.tsx` reported `29 passed`.
  - AI test suite passed: `pnpm -C "./apps/readest-app" test src/__tests__/ai -- --runInBand`, `21 files / 212 tests passed`.
  - Lint/type check passed: `pnpm -C "./apps/readest-app" lint`, `tsgo --noEmit && biome check .`, `813 files checked`.
  - Rebuilt signed APK at `./apks/readio-v0.1.0-alpha.13-android-arm64-release.apk`, installed on `emulator-5554`, opened Reader AI in 《诡秘之主》 page `2868 / 14955`, asked `总结本章到这里`, and verified DOM contained the clear empty-answer message plus citations and the original question. Recent logcat showed no app crash.
- Previous alpha.10/alpha.13 release evidence:
  - Full Vitest run passed: `189 files / 3475 tests passed`.
  - App lint passed: `pnpm --filter @readest/readest-app lint`, `809 files checked`.
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
  - `versionCode = major*1000000 + minor*10000 + patch*1000 + alphaN`; example alpha.13 is `1001013`.
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
  - Reader AI retrieval/answer-quality roadmap is documented in `./READIO_AI_RETRIEVAL_ROADMAP.md`; future RAG work should start there before implementation.
  - Readio mainline is this repo/branch; do not use old `feature/m0-spikes` as PR or release base unless explicitly inspecting archive history.

## Current blockers and risks

- Reader AI/RAG Phase A source changes are committed.
- Phase B classifier + prompt/context metadata work is committed.
- Android/Tauri empty-answer fix has focused test, lint, rebuilt APK install, and emulator DOM verification evidence; commit it before starting unrelated work if not already committed.
- Phase B design decision: spoiler protection is not a question intent. Treat it as a source scope (`read_so_far` vs `whole_book_allowed`) that applies to every question intent.
- Next RAG work should use `intent + scope` to vary retrieval strategy, starting with entity lookup, selected-text explanation, and current recap.
- No known alpha.13 release blocker at this handoff.
- `.codepilot-uploads/` is untracked and likely unrelated; avoid accidental commit.
- Android generated files can be overwritten by `tauri android init` or icon generation. Recheck package paths, app label, and launcher resources after regeneration.
- Reader missing-source recovery still relies on a timed toast callback that returns to library after 5 seconds; if user reports confusion, replace with an explicit action in a focused batch.
- Footnote popup still uses an internal scrolled renderer as a non-reading-mode exception. Treat separately if product later requires absolutely no scrolling renderers.

## Next actions

1. If committing current work, stage only the Android/Tauri empty-answer fix files and `HANDOFF.md`; do not stage `.codepilot-uploads/` or unrelated `temp/` helpers by default.
2. For the next Phase B retrieval-routing increment, add tests first for entity lookup, selected-text explanation, and current recap under both `read_so_far` and `whole_book_allowed` where relevant.
3. If continuing alpha.13 stabilization, start from targeted tests around brightness, Reader AI, and citation ordering; then run type check, lint, and focused emulator validation.
4. If extending Reader AI retrieval/RAG beyond Phase B, read `./READIO_AI_RETRIEVAL_ROADMAP.md` first; discuss before introducing heavier embedding, long preprocessing, or deep-analysis defaults.
5. If preparing alpha.14 or later, bump version and `versionCode` first, then build with `build-readio-apk`, install on emulator, smoke test, create a prerelease, upload APK plus `.sha256` with local `gh release upload`, download it back, and verify SHA-256.
6. If committing, review `git diff` and stage only intentional source/docs changes; do not stage `.codepilot-uploads/` or unrelated `temp/` files by default.
7. If needing historical context, read `./HANDOFF_PRE_ALPHA10_ARCHIVE.md` instead of expanding this handoff.

## Key files

- `./HANDOFF.md`
- `./HANDOFF_PRE_ALPHA10_ARCHIVE.md`
- `./apps/readest-app/package.json`
- `./apps/readest-app/src-tauri/tauri.conf.json`
- `./apps/readest-app/src/config/features.ts`
- `./READIO_UI_DESIGN.md`
- `./READIO_AI_RETRIEVAL_ROADMAP.md`
- `./apps/readest-app/src/services/ai/utils/chunker.ts`
- `./apps/readest-app/src/services/ai/search/bm25.ts`
- `./apps/readest-app/src/services/ai/search/contextPack.ts`
- `./apps/readest-app/src/services/ai/questionRouting.ts`
- `./apps/readest-app/src/services/ai/prompts.ts`
- `./apps/readest-app/src/services/ai/readerChatService.ts`
- `./apps/readest-app/src/services/ai/adapters/TauriChatAdapter.ts`
- `./apps/readest-app/src/app/api/ai/chat/route.ts`
- `./apps/readest-app/src/__tests__/ai/question-routing.test.ts`
- `./apps/readest-app/src/__tests__/ai/context-pack.test.ts`
- `./CLAUDE.md`
- `./apks/readio-v0.1.0-alpha.13-android-arm64-release.apk`
