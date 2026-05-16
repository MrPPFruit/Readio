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
- Reader AI/MiMo quality-test fix set verification (2026-05-16):
  - Committed `ceef48e5 fix(ai): align reader AI page boundaries and MiMo streaming output` and `6bfb95ae style(ai): apply reader AI formatting updates`.
  - Aligns reflowable reader display pages with AI chunk page boundaries via `getReflowableAIPageBoundary()` and `currentAIPage` fallback handling.
  - MiMo OpenAI-compatible parsing ignores `reasoning_content` and only emits visible answer content.
  - Question routing now classifies `这章目前讲了什么？` as `chapter_summary`.
  - `ReaderAIAnswerPanel` handles markdown `<br>` nodes in cited content.
  - Focused tests passed for page info, OpenAI-compatible model, question routing, reader chat service, reader AI assistant, and reader AI panels.
  - Lint/type check passed: `pnpm -C apps/readest-app lint`, `tsgo --noEmit && biome check .`, `813 files checked`.
  - AI target tests passed: `3 files / 68 tests passed` across `bm25-search.test.ts`, `reader-chat-service.test.ts`, and `reader-ai-panels.test.tsx`.
  - Full app tests passed: `pnpm -C apps/readest-app test -- --runInBand`, `192 files / 3526 tests passed`, `2 files / 7 tests skipped`.
  - Emulator + MiMo spot check passed for 《诡秘之主》 question `塔罗会当前成员有哪些？`: answer listed current members without future-member spoilers and cited `第五十一章 五人聚会` first.
- Reader AI spoiler boundary hardening verification (2026-05-16):
  - Root cause evidence: Readio + MiMo Q2 `克莱恩是谁？请按当前阅读进度简短回答并给出依据。` leaked later evidence such as `夏洛克·莫里亚蒂` / `贝克兰德` and cited future chapters including `第一百三十四章 超过一分钟了` while spoiler protection was on.
  - Added RED regression in `reader-chat-service.test.ts`: read-so-far entity answers must exclude later book-order chunks even when stale/estimated page numbers appear inside the current AI page boundary.
  - RED confirmed: focused test failed because `<BOOK_PASSAGES>` still contained `第一百三十四章 超过一分钟了` and `夏洛克·莫里亚蒂`.
  - Minimal fix: `isChunkWithinPageBoundary()` now also checks `sortIndex < (maxPage + 1) * SIZE_PER_PAGE` when `sortIndex` exists, so page-boundary filtering is tied back to absolute book offset and stale low page numbers cannot smuggle later chunks into spoiler-protected prompts.
  - Focused tests passed: `pnpm -C apps/readest-app exec vitest run src/__tests__/ai/reader-chat-service.test.ts`, `24 tests passed`; `pnpm -C apps/readest-app exec vitest run src/__tests__/ai/bm25-search.test.ts`, `8 tests passed`.
  - Lint/type check passed: `pnpm -C apps/readest-app lint`, `tsgo --noEmit && biome check .`, `813 files checked`.
  - Full app tests passed: `pnpm -C apps/readest-app test -- --runInBand`, `192 files / 3530 tests passed`, `2 files / 7 tests skipped`.
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
- Android/Tauri empty-answer fix is committed as `f7a045a0 fix(ai): handle empty Reader AI provider streams`.
- Current active work is the Readio + MiMo + NotebookLM quality-test setup. Page-boundary/MiMo formatting fixes are committed; spoiler boundary hardening has passed RED/GREEN focused tests, lint, and full app tests.
- NotebookLM CLI comparison is usable via temporary venv command: `/tmp/notebooklm-py-041/bin/notebooklm`. `Readio` notebook ID is `1f45c537-1155-4b4f-9ae8-436c5151ef61`; it contains source 《诡秘之主》精校版全文 EPUB with status `ready`.
- MiMo provider in emulator was updated with the user-provided valid token and a direct probe returned normal non-streaming text. Never print or persist the raw token in docs/logs.
- Readio simulator quality test exposed a key coordinate mismatch: displayed reader page around `3104` does not match AI chunk page boundary around `1988–1990`. This was fixed by `getReflowableAIPageBoundary()` / `currentAIPage` and committed in `ceef48e5`.
- Readio simulator Q2 then exposed a spoiler-source leak: with spoiler protection on, stale/estimated low page metadata allowed a later book-order chunk (`第一百三十四章 超过一分钟了`) into the final model prompt. The hardening filters by `sortIndex` absolute book offset when available.
- Phase B design decision: spoiler protection is not a question intent. Treat it as a source scope (`read_so_far` vs `whole_book_allowed`) that applies to every question intent.
- Next RAG work should use `intent + scope` to vary retrieval strategy, starting with entity lookup, selected-text explanation, and current recap.
- `.codepilot-uploads/` and `temp/` are untracked and likely unrelated; avoid accidental commit.
- Android generated files can be overwritten by `tauri android init` or icon generation. Recheck package paths, app label, and launcher resources after regeneration.
- Reader missing-source recovery still relies on a timed toast callback that returns to library after 5 seconds; if user reports confusion, replace with an explicit action in a focused batch.
- Footnote popup still uses an internal scrolled renderer as a non-reading-mode exception. Treat separately if product later requires absolutely no scrolling renderers.

## Next actions

1. Rebuild/install only if continuing emulator quality validation or producing a new APK. The source-level fix already passed focused tests, lint, and full tests.
2. Resume Readio vs NotebookLM quality test after installing the hardening fix in the emulator. Retest Q2 `克莱恩是谁？请按当前阅读进度简短回答并给出依据。` first; expected result: no `夏洛克·莫里亚蒂`, no `贝克兰德`, no future-chapter citations under spoiler protection.
3. Use 《诡秘之主》 in NotebookLM `Readio` notebook for the baseline. For NotebookLM CLI, use `/tmp/notebooklm-py-041/bin/notebooklm ask -n 1f45c537-1155-4b4f-9ae8-436c5151ef61 "<question>" --json`.
4. Continue the standard question set only after Q2 passes in Readio emulator: `白银城是什么地方？`, `这章目前讲了什么？`, `前面发生了什么？`, `这句话是什么意思？`, `最后谁是凶手？` with spoiler on/off, and same-conversation spoiler toggle.
5. If extending Reader AI retrieval/RAG beyond this fix, read `./READIO_AI_RETRIEVAL_ROADMAP.md` first; discuss before introducing heavier embedding, long preprocessing, or deep-analysis defaults.
6. If preparing alpha.14 or later, bump version and `versionCode` first, then build with `build-readio-apk`, install on emulator, smoke test, create a prerelease, upload APK plus `.sha256` with local `gh release upload`, download it back, and verify SHA-256.
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
- `./apps/readest-app/src/app/reader/utils/pageInfo.ts`
- `./apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx`
- `./apps/readest-app/src/app/reader/components/ai/ReaderAIAnswerPanel.tsx`
- `./apps/readest-app/src/__tests__/ai/question-routing.test.ts`
- `./apps/readest-app/src/__tests__/ai/openai-compatible-model.test.ts`
- `./apps/readest-app/src/__tests__/ai/reader-chat-service.test.ts`
- `./apps/readest-app/src/__tests__/ai/reader-ai-assistant.test.tsx`
- `./apps/readest-app/src/__tests__/ai/reader-ai-panels.test.tsx`
- `./apps/readest-app/src/__tests__/app/reader/page-info.test.ts`
- `./apps/readest-app/src/__tests__/ai/context-pack.test.ts`
- `./CLAUDE.md`
- `./apks/readio-v0.1.0-alpha.13-android-arm64-release.apk`
