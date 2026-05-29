---
change: improve-reader-ai-harness-observability
design-doc: docs/superpowers/specs/2026-05-29-reader-ai-harness-observability-design.md
base-ref: 35c7713ae4f66224aa8af89fa4ae7a23369f4eaa
status: draft
created: 2026-05-29
archived-with: 2026-05-29-improve-reader-ai-harness-observability
---

# Reader AI Harness Observability Implementation Plan

## Implementation Principle

Do functional harness work only. Do not change UI/UX visuals or interactions unless separately approved.

The product latency constraint is first visible answer output around 10-15 seconds for indexed books. Phase 1 must measure this path and avoid adding work that makes it slower.

## Phase 1 Build Scope

### 1. Trace schema and privacy guardrails

- Add Reader AI trace types.
- Add action taxonomy:
  - `classify_question`
  - `check_index`
  - `hybrid_search`
  - `entity_sidecar_lookup`
  - `source_language_rewrite`
  - `current_context_injection`
  - `context_pack`
  - `generate_answer`
  - `validate_citations`
  - `repair_citations`
  - `persist_turn`
  - `refresh_suggestions`
- Add normalized statuses:
  - `started`
  - `completed`
  - `skipped`
  - `failed`
  - `timeout`
  - `cancelled`
- Add normalized over-budget stages:
  - `retrieval`
  - `provider_first_token`
  - `generation`
  - `citation_validation`
  - `citation_repair`
  - `indexing`
  - `cancelled`
  - `timeout`
  - `unknown`
- Use allowlisted metadata fields only.

### 2. Reader AI trace helper

- Add a dedicated helper for Reader AI trace diagnostics.
- Keep it local diagnostics only.
- Reject or sanitize sensitive fields before diagnostics persistence.
- Do not expose raw question, answer, source text, chapter title, book identity, prompt, API key, path, or snippet fields.

### 3. Per-turn runId

- Generate `runId` at the UI/controller boundary for Reader AI ask turns.
- Pass optional `runId` into `streamReaderAIAnswer` and downstream service helpers.
- If service tests call the function directly, allow service-side fallback runId generation.
- Do not use UI message IDs as run IDs.

### 4. Lifecycle and latency events

Emit metadata-only events for:

- run started;
- retrieval planned;
- retrieval action completed/failed/skipped;
- context packed;
- generation started;
- first output observed when measurable;
- generation completed/failed/timeout;
- citation validation completed;
- citation repair completed/failed/skipped;
- insufficient answer fallback;
- run completed/failed/cancelled.

Record durations with `durationMs` and configured budgets where relevant.

### 5. Focused tests

Add tests for:

- correlated runId across events;
- no raw content in Reader AI diagnostics;
- sensitive key rejection/redaction;
- latency fields and over-budget stage classification;
- retrieval diagnostics with safe candidate/source counts;
- citation diagnostics with issue type counts only.

### 6. Eval foundation

Add metadata-only eval schema docs or fixtures for ordinary-reader QA categories:

- person recall;
- object recall;
- event recap;
- relationship recall;
- current recap;
- citation grounding;
- spoiler safety.

Do not commit copyrighted book text.

## Explicitly Out of Scope for Phase 1

- UI/UX changes.
- Prompt changes.
- Answer style changes.
- Retrieval ranking changes.
- Citation chip/source preview visual changes.
- React reducer/state-machine refactor.
- NotebookLM automation.
- Android APK validation unless UI/WebView code changes.

## Verification

1. Run focused diagnostics and Reader AI tests.
2. Run `pnpm --dir apps/readest-app lint`.
3. Run `pnpm --dir apps/readest-app test`.
4. Update `HANDOFF.md` with implemented trace schema, validation evidence, and deferred follow-ups.

## Deferred Follow-ups

- Phase 2 eval harness execution utility.
- Phase 3 latency-aware streaming refactor if trace shows first output is blocked by full generation/citation repair.
- Phase 4 evidence sufficiency gate by intent.
- Phase 5 React state hardening with explicit user confirmation if it might affect interactions.
