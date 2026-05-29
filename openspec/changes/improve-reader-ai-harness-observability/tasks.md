## 1. Trace Schema, Privacy Guardrails, and Latency Budget

- [x] 1.1 Add Reader AI run trace types, action taxonomy, status enums, outcome/error enums, and recovery hint enums.
- [x] 1.2 Add diagnostics redaction/allowlist tests covering run trace payloads and sensitive field rejection.
- [x] 1.3 Add helper functions for metadata-only Reader AI trace events.
- [x] 1.4 Add first-output latency fields and normalized over-budget stage classification.

## 2. Per-Turn Run Trace

- [x] 2.1 Generate a stable `runId` for each Reader AI ask turn in the UI/controller boundary.
- [x] 2.2 Pass optional `runId` through `streamReaderAIAnswer` and downstream Reader AI service helpers.
- [x] 2.3 Emit ask lifecycle diagnostics for started, completed, failed, timeout, and cancelled outcomes.

## 3. Retrieval and Context Diagnostics

- [x] 3.1 Emit retrieval plan diagnostics with classification intent, scope, enabled actions, configured limits, and latency budget metadata.
- [x] 3.2 Emit retrieval action diagnostics for hybrid search, entity sidecar, source-language fallback, current context injection, and context packing.
- [x] 3.3 Emit stage timing diagnostics that can separate retrieval delay, provider first-token delay, generation delay, citation validation/repair delay, and indexing delay.
- [x] 3.4 Add focused tests proving retrieval diagnostics are correlated by `runId` and contain no raw content.

## 4. Citation Pipeline Diagnostics

- [x] 4.1 Emit citation validation diagnostics with issue counts and issue type counts.
- [x] 4.2 Emit citation repair attempt/result diagnostics.
- [x] 4.3 Emit insufficient-answer fallback diagnostics with normalized reasons.
- [x] 4.4 Add focused tests covering successful citation validation, repair failure, and insufficient fallback traces.

## 5. Minimal Eval Harness Foundation

- [x] 5.1 Add local Reader AI eval case/result schema documentation or fixtures for ordinary-reader QA categories.
- [x] 5.2 Add a lightweight script or test utility that can validate eval case shape without requiring private book text.
- [x] 5.3 Document how NotebookLM full-book mode should be used as a manual benchmark and how spoiler-mode validation differs.

## 6. Verification and Handoff

- [x] 6.1 Run focused diagnostics and Reader AI tests.
- [x] 6.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 6.3 Run `pnpm --dir apps/readest-app test`.
- [x] 6.4 Update `HANDOFF.md` with implementation summary, validation evidence, and remaining React state-machine follow-ups.
