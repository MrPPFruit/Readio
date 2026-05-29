## Why

Reader AI has grown from a simple reader helper into a multi-stage RAG/agent loop: question classification, retrieval, entity sidecar lookup, context packing, answer generation, citation validation/repair, source preview, and Android/WebView rendering. The current product works, but quality issues are still hard to diagnose because one user-facing failure can come from many hidden stages.

This change adds a privacy-safe harness layer so Readio can understand, reproduce, and improve Reader AI quality without guessing from screenshots or one-off manual tests.

## What Changes

- Add per-turn Reader AI run tracing with a stable `runId` that links UI lifecycle, retrieval, generation, citation validation/repair, persistence, and diagnostics events.
- Add metadata-only retrieval and citation diagnostics that explain which internal actions ran, how many candidates/sources they produced, how long each stage took, and why a turn ended in success, insufficient evidence, timeout, cancellation, or error.
- Add latency observability for the user-facing first-output path so Readio can preserve the product target of starting visible answers around 10-15 seconds for indexed books.
- Add a minimal Reader AI evaluation harness for ordinary-reader questions such as remembering people, objects, events, relationships, and recaps.
- Keep all diagnostics privacy-safe: no raw book text, raw question text, full answer text, API keys, local paths, or book titles in diagnostic events.
- Document a staged optimization path for later React/UX state-machine hardening, including request freshness, cancellation, suggestions, Android Back ordering, and citation preview stability.
- Do not change the current Reader AI UI design, citation chip visuals, source preview visual design, or public answer style as part of the first implementation slice.

## Capabilities

### New Capabilities

- `reader-ai-harness-observability`: Privacy-safe Reader AI run tracing, retrieval/citation diagnostics, evaluation harness behavior, and reliability requirements for the Reader AI agent loop.

### Modified Capabilities

- None. There are no existing OpenSpec capabilities in this repository yet.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/diagnostics/`
  - `apps/readest-app/src/services/ai/readerChatService.ts`
  - `apps/readest-app/src/services/ai/ragService.ts`
  - `apps/readest-app/src/services/ai/citationGrounding.ts`
  - `apps/readest-app/src/services/ai/citationVerifier.ts`
  - `apps/readest-app/src/app/reader/components/ai/ReaderAIAssistant.tsx`
  - Reader AI tests under `apps/readest-app/src/__tests__/ai/`
  - Diagnostics tests under `apps/readest-app/src/__tests__/services/diagnostics/`
- No new external runtime dependency is planned for the first slice.
- No server-side logging is introduced; diagnostics remain local/exportable and redacted.
- Android APK validation is only required when UI lifecycle or Android/WebView-specific behavior changes; harness-only logic can be validated with focused tests, full tests, and lint first.
