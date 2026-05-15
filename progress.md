# Progress

## 2026-05-15 — Reader AI Phase B

- User corrected Phase B design: spoiler protection is not a standalone question type; it affects every question.
- Decision: use two layers: `intent` describes what the user wants, `scope` describes allowed source range.
- Updated `READIO_AI_RETRIEVAL_ROADMAP.md` Phase B to document intent/scope routing.
- Updated `HANDOFF.md` to mark Phase A commits and same-conversation spoiler toggle test as completed.
- Current task: add pure rule-based classifier with TDD before any retrieval-routing integration.
- RED confirmed: `question-routing.test.ts` failed because `@/services/ai/questionRouting` did not exist.
- Implemented `questionRouting.ts` with `ReaderQuestionIntent`, `ReaderAnswerScope`, and `classifyReaderQuestion`.
- Added coverage for entity lookup under both spoiler scopes, selected-text explanation, recap, chapter summary, analysis, and general fallback.
- GREEN verified: `pnpm -C apps/readest-app test -- --watch=false src/__tests__/ai/question-routing.test.ts` passed; Vitest ran full suite and reported `192 files / 3511 tests passed`, `2 files / 7 tests skipped`.
- Added integration coverage so Reader AI prompt/API/Tauri paths carry `classification` metadata into `buildSystemPrompt`.
- Wired `classifyReaderQuestion` into `readerChatService` and `TauriChatAdapter`; browser API route now validates bounded `readerContext.classification` before building the server-side prompt.
- Fixed entity-event classification so `戴里克发生了什么？` remains an entity lookup while recap questions like `前面发生了什么？` stay `current_recap`.
- Code review found four issues before completion: API accepted classification scope conflicting with spoiler protection, unprotected whole-book prompts still marked passages as `page_limit`, high-risk spoiler wording still used an early canned return, and empty whole-book prompts still used read-so-far wording.
- Added RED tests for those issues; they failed as expected, then fixed API scope consistency validation, whole-book passage metadata, high-risk spoiler routing, and scope-aware empty-context wording.
- Focused AI verification passed: `pnpm -C apps/readest-app test -- --watch=false src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/api-chat-route.test.ts src/__tests__/ai/question-routing.test.ts src/__tests__/ai/tauri-chat-adapter.test.ts`; Vitest selected the full app suite and reported `192 files / 3514 tests passed`, `2 files / 7 tests skipped`.
- Lint verified: `pnpm -C apps/readest-app lint` passed; `tsgo --noEmit && biome check .`, `813 files checked`.
- Final code review approved after blocker fixes.
