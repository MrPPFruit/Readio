## Context

Reader AI now behaves like a small agent harness inside the reader. One user turn can involve UI state transitions, indexing checks, question routing, BM25/hybrid retrieval, entity sidecar lookup, context packing, model generation, citation validation, citation repair, source preview construction, local persistence, suggestions refresh, and Android/WebView rendering.

Recent work improved answer quality and citation behavior, but exposed a recurring problem: when a response is weak, delayed, insufficient, or visually odd, the system does not yet provide a single trace that explains which stage failed. Existing diagnostics are privacy-safe and useful, but they are mostly event breadcrumbs rather than a per-turn run trace.

This design treats Reader AI as a hybrid ReAct/function-calling harness:

```text
User question
  ↓
UI turn lifecycle ──────────────┐
  ↓                             │
Question routing                │
  ↓                             │
Retrieval plan/action results   │  runId links all stages
  ↓                             │
Context packing                 │
  ↓                             │
Generation                      │
  ↓                             │
Citation validation/repair      │
  ↓                             │
Persistence + UI rendering ─────┘
```

The first implementation slice should add observability without changing user-facing UI or answer behavior. A critical product constraint is first-answer latency: for indexed books, Readio should aim to start visible answer output around 10-15 seconds. Harness optimization must not become over-optimization that keeps users waiting for perfect retrieval or citation repair before seeing any answer.

## Goals / Non-Goals

**Goals:**

- Introduce a privacy-safe `runId` for each Reader AI user turn.
- Emit diagnostics that can reconstruct a turn's pipeline stages without storing user content or book content.
- Record retrieval action metadata: enabled paths, candidate counts, selected counts, fallback reasons, and stage durations.
- Record citation pipeline metadata: validation issue counts/types, repair attempts, repair outcomes, and insufficient-answer reasons.
- Define a minimal eval harness direction for ordinary-reader QA questions.
- Record stage timing so slow answers can be attributed to retrieval, provider/model first token, full generation, citation validation/repair, indexing, cancellation, timeout, or unknown.
- Keep diagnostics local/exportable and compatible with existing redaction rules.
- Preserve current UI, citation visuals, answer style, and existing Reader AI behavior in the first slice.

**Non-Goals:**

- No prompt rewrite for answer quality in the first slice.
- No new external observability service or telemetry upload.
- No raw question, raw answer, book title, book hash, local path, source text, or prompt logging.
- No React state-machine refactor in the first slice; that remains a later phase after trace observability.
- No NotebookLM automation dependency in tests; NotebookLM remains a manual/benchmark reference.
- No Android APK build for diagnostics-only changes unless UI lifecycle or Android WebView behavior changes.
- No retrieval, citation, or eval change may intentionally push indexed-book first visible answer output beyond the 10-15 second product target without explicit approval.

## Decisions

### Decision 1: Use a per-turn `runId` rather than relying on timestamps

Each Reader AI ask creates a stable opaque ID, passed from `ReaderAIAssistant` into `streamReaderAIAnswer` and downstream helpers. Every related diagnostic event includes this `runId`.

Alternatives considered:

- **Timestamp-only correlation**: simpler but fragile when suggestions, indexing, retries, or overlapping turns happen.
- **Conversation message ID as run ID**: tempting, but message IDs are UI/persistence concepts and should not become pipeline trace identity.

Rationale: `runId` gives the harness a single spine while keeping UI and storage IDs independent.

### Decision 2: Log metadata-only action results, not content

Diagnostics should record structured counts, enums, booleans, durations, and redacted identifiers. They must not log raw questions, answers, source snippets, prompts, book titles, author names, book hashes, file paths, or API keys.

Example safe fields:

```ts
{
  runId,
  stage: 'retrieval',
  intent: 'entity_lookup',
  scope: 'whole_book',
  action: 'entity_sidecar',
  candidateCount: 14,
  selectedCount: 6,
  durationMs: 18,
  fallbackReason: 'none'
}
```

Alternatives considered:

- **Log snippets for easier debugging**: rejected because Readio handles copyrighted/private books.
- **Hash raw text**: avoided initially because even hashes can become stable content fingerprints. Prefer source IDs already used internally, or counts only.

### Decision 3: Start with observability before changing ranking/prompt behavior

The first implementation slice should not change retrieval ranking, prompts, answer generation, or UI. It only makes the existing loop explainable.

Rationale: recent answer-quality improvements added multiple heuristics. Without trace/eval, more heuristics may make future regressions harder to diagnose.

### Decision 3a: Treat 10-15 second first visible output as a harness budget

Reader AI should not keep users waiting for full retrieval expansion, original source preview loading, complete generation, citation validation, or citation repair if those stages prevent visible output from starting in roughly 10-15 seconds for already-indexed books. Phase 1 records enough metadata to determine which stage blocks first output. Later phases may split fast evidence retrieval from deferred citation/source refinement, but only with tests and without changing UI/UX visuals.

### Decision 4: Treat eval harness as deterministic first, LLM judge later

The eval harness should begin with deterministic checks:

- intent classification;
- retrieval candidate/source counts;
- expected evidence tag/chunk presence for fixtures;
- citation validation status;
- spoiler boundary safety;
- latency and outcome classification.

LLM-as-judge can later assess completeness/style, but it should not replace hard grounding/citation checks.

Alternatives considered:

- **NotebookLM as automated oracle**: useful benchmark, but not reliable as CI dependency and may not honor Readio's spoiler boundary.
- **LLM judge first**: flexible but costly and less deterministic.

### Decision 5: React state-machine hardening comes after trace spine

React/UX issues exist: distributed state, stale async writes, suggestions races, Android Back layering, citation preview positioning. However, refactoring UI state before adding trace would make it harder to prove where behavior changed.

Plan:

1. Add trace spine and diagnostics.
2. Add minimal eval/diagnostic tests.
3. Then refactor UI state with request IDs/reducer if diagnostics show lifecycle issues.

## Risks / Trade-offs

- **Risk: diagnostics accidentally capture sensitive content** → Mitigation: schema-level tests for redaction; event payloads use enums/counts only; extend diagnostics tests before adding events.
- **Risk: extra logging adds complexity/noise** → Mitigation: centralize event helpers and use a small fixed event taxonomy.
- **Risk: runId plumbing touches many files** → Mitigation: start with optional `runId` fields and preserve existing call sites; no behavior change if absent.
- **Risk: action counts are not enough to debug every quality issue** → Mitigation: this is phase 1; eval harness and optional private local artifacts can add deeper debugging later.
- **Risk: tests overfit mocked flows** → Mitigation: include at least one integration-style Reader AI service test that asserts event sequence and privacy constraints.
- **Risk: current worktree is already dirty** → Mitigation: keep this change focused; do not clean, reset, or reformat unrelated files; avoid committing unless explicitly asked.

## Migration Plan

1. Add trace types and diagnostic helper functions.
2. Thread optional `runId` through Reader AI UI/service boundaries.
3. Emit ask lifecycle, retrieval action, context packing, citation validation/repair, and final outcome events.
4. Add focused tests for event sequence, error classification, and privacy redaction.
5. Add a minimal eval harness document or fixture structure without requiring CI integration yet.
6. Run focused tests, lint, and full tests.
7. Only build/install Android APK if UI lifecycle or Android-specific code changes.

Rollback strategy: disable or remove new diagnostic event calls while keeping existing Reader AI behavior unchanged. Because the first slice is observability-only, rollback should not affect answer generation.

## Open Questions

- Should the first eval harness live under `apps/readest-app/evals/reader-ai/` or under test fixtures in `src/__tests__/ai/fixtures/`?
- Should diagnostic exports include a summary grouped by `runId`, or only raw JSONL events for now?
- Should `runId` be generated in UI (`ReaderAIAssistant`) or service (`streamReaderAIAnswer`) when service is called directly in tests?
- How aggressively should citation validation/repair events classify issue types before stabilizing the event taxonomy?
