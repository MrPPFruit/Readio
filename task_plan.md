# Readio Reader AI Phase B Plan

## Goal

Start Reader AI Phase B by separating question intent from spoiler/source scope, then add a tested pure classifier and pass the classification through reader chat prompt/context metadata.

## Current phase

- Status: complete
- Phase 1: Update roadmap and handoff with intent/scope design (complete)
- Phase 2: Add failing tests for intent/scope classification (complete)
- Phase 3: Implement minimal classifier (complete)
- Phase 4: Add prompt/API/Tauri integration tests for classification metadata (complete)
- Phase 5: Wire classifier into reader chat prompt/context metadata (complete)
- Phase 6: Run focused AI tests and lint (complete)
- Phase 7: Update planning notes and report results (complete)

## Key decision

Spoiler protection is not a question intent. It is a source scope that applies to every intent:

- `read_so_far`: spoiler protection enabled; answer only from content at or before current reading boundary.
- `whole_book_allowed`: spoiler protection disabled; whole-book evidence may be used, but answers should make the evidence range clear.

Question intent remains separate:

- `selection_explanation`
- `current_recap`
- `entity_lookup`
- `chapter_summary`
- `analysis`
- `general`

## Constraints

- Follow test-first development.
- Start with pure deterministic rules; do not call an LLM for classification.
- Do not introduce embedding, heavy preprocessing, or persistent cache changes.
- Keep this step small: classifier plus prompt/context metadata first; retrieval strategy routing can follow in a later step.
- Do not stage `.codepilot-uploads/` or unrelated `temp/` files.

## Verification plan

- First run the new classifier test and confirm it fails before implementation.
- Add integration tests that fail until prompt/API/Tauri paths carry classification metadata.
- After implementation, run focused AI tests.
- Run app lint after code changes.

## Verification evidence

- `pnpm -C apps/readest-app test -- --watch=false src/__tests__/ai/reader-chat-service.test.ts src/__tests__/ai/api-chat-route.test.ts src/__tests__/ai/question-routing.test.ts src/__tests__/ai/tauri-chat-adapter.test.ts` passed; Vitest selected the full app suite and reported `192 files / 3514 tests passed`, `2 files / 7 tests skipped`.
- `pnpm -C apps/readest-app lint` passed; `tsgo --noEmit && biome check .`, `813 files checked`.
- Final code review approved after fixing high-risk spoiler early-return routing and whole-book empty-context wording.

## Errors encountered

| Error                                                                                   | Attempt | Resolution                                                                                         |
| --------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| New test failed because `@/services/ai/questionRouting` did not exist                   | 1       | Expected RED phase; implemented minimal `questionRouting.ts`                                       |
| Entity lookup rule missed Chinese question marks                                        | 1       | Allowed trailing `？` / `?` in entity lookup regex                                                 |
| Entity-event rule misclassified `前面发生了什么？` as `entity_lookup`                   | 1       | Excluded recap prefixes such as `前面` / `之前` / `刚才` from the entity-event rule                |
| Code review found API accepted classification scope conflicting with spoiler protection | 1       | Added API validation requiring `classification.scope` to match effective `spoilerProtection`       |
| Code review found whole-book prompts still labeled passages with current `page_limit`   | 1       | Changed unprotected passage metadata to `source_scope="whole_book_allowed" reading_position="..."` |
