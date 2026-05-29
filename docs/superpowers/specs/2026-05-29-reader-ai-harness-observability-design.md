---
comet_change: improve-reader-ai-harness-observability
change: improve-reader-ai-harness-observability
role: technical-design
canonical_spec: openspec
status: draft
created: 2026-05-29
archived-with: 2026-05-29-improve-reader-ai-harness-observability
status: final
---

# Reader AI Harness Observability Design

## Goal

Improve Readio Reader AI as an agent harness without changing the mature UI/UX. The optimization target is not maximum retrieval complexity; it is a reliable reader assistant that can start answering within a reasonable user wait budget and can explain failures through privacy-safe traces.

## Hard Constraints

1. UI/UX freeze: do not change the Reader AI panel visual design, citation chips, source preview visuals, source preview interaction, answer typography, or Android back behavior in this change.
2. Functional-only first slice: add harness observability and safe internal contracts before changing answer strategy.
3. Privacy-safe diagnostics: never log raw user questions, raw answers, book text, snippets, chapter titles, book titles, authors, book hashes, local paths, prompts, or API keys.
4. Latency budget: indexed-book questions should begin visible answer output around 10-15 seconds. Any optimization that delays first output beyond this budget is suspect unless the book is still indexing or the provider is unavailable.
5. NotebookLM is a benchmark, not an oracle. Use it for full-book manual quality reference; do not make CI depend on NotebookLM and do not assume it respects Readio spoiler boundaries.

## Multi-Agent Review Summary

### Agent Loop perspective

Current risk: Reader AI looks streamed from the UI, but service-level generation can still accumulate a full answer and run citation validation/repair before yielding. That makes first output latency depend on retrieval, full generation, and repair. The harness should distinguish:

- fast retrieval before generation;
- first chunk time;
- full generation time;
- post-generation validation/repair time.

Recommended direction:

- add per-turn `runId`;
- make async writes stale-safe in later phases;
- eventually move toward fast evidence packet + visible streaming + deferred source refinement;
- keep displayed answer content append-only once visible.

Phase 1 should instrument this path first. It may add invisible request freshness guards if needed, but should not change UI or answer style.

### Tool/action-space perspective

Reader AI internal actions need stable contracts, not ad-hoc debug logs. Use a small action taxonomy:

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

Each event should record metadata-only fields:

- `schemaVersion`
- `runId`
- `stage`
- `action`
- `status`
- `durationMs`
- `candidateCount` / `selectedCount` where applicable
- `timeoutBudgetMs` where applicable
- `fallbackReason` / `failureCategory` / `recoveryHint` as enums

Prefer a Reader AI trace helper with allowlisted payload fields over arbitrary diagnostic metadata.

### Context/RAG perspective

Do not keep expanding context blindly. For 10-15s first output, retrieval should be staged:

1. current page/chapter context for local/recap questions;
2. primary BM25/hybrid topK and context packing;
3. sidecar/entity expansion only for entity/object/event recall or weak evidence;
4. citation/source preview refinement after answer start or as a separately budgeted phase.

Quality bottlenecks should be evaluated through evidence coverage, not only final prose. Future eval should track:

- key fact recall;
- source count;
- citation validity;
- spoiler violations;
- insufficient-answer reason;
- first output latency;
- total latency.

### React/state perspective

Do not refactor visible UI now. However, diagnostics can be polluted by stale async writes unless run identity is explicit. Later phases should add:

- active `runId` freshness checks;
- suggestion request IDs;
- cancellation and retry guards;
- citation preview instrumentation.

If Phase 1 only observes, it should at least avoid introducing new visible state changes.

## Phased Plan

### Phase 1: Trace spine and latency observability

Scope:

- Add Reader AI trace schema and helper.
- Add `runId` to Reader AI turn boundaries.
- Emit metadata-only lifecycle/action events.
- Record stage durations including first-output related timings where possible.
- Add privacy tests.
- Add OpenSpec/eval documentation for future ordinary-reader QA.

Explicitly do not:

- change prompt;
- change ranking;
- change UI/UX;
- change citation visuals;
- change source preview behavior;
- introduce NotebookLM automation;
- require Android APK unless UI/WebView code is touched.

Success criteria:

- A successful turn can be reconstructed by `runId` from local diagnostics.
- A failed/timeout/cancelled turn has normalized outcome and recovery hints.
- Diagnostics contain no raw content or stable book identity.
- Trace includes enough timing data to determine whether first output is blocked by retrieval, model, citation repair, or UI.

### Phase 2: Eval harness foundation

Add ordinary-reader eval cases for:

- person recall;
- object/term recall;
- event recap;
- relationship recall;
- current recap;
- citation grounding;
- spoiler safety.

Keep fixtures metadata-only or synthetic. NotebookLM may provide manual full-book benchmark notes, but not committed copyrighted content.

### Phase 3: Latency-aware answer loop optimization

Only after trace data confirms bottlenecks:

- split fast evidence retrieval from deferred refinement;
- enforce first-output budget;
- make citation repair non-blocking or tightly budgeted;
- preserve displayed answer stability.

This may change answer timing behavior and should have tests before implementation.

### Phase 4: Retrieval quality upgrades

Only after eval baseline:

- evidence sufficiency gate by intent;
- sidecar fact-role buckets;
- context packing by answer intent;
- partial answer with explicit missing evidence.

Avoid full knowledge graph or embedding-heavy work until data shows it is necessary.

### Phase 5: React/tool-loop hardening

Requires separate confirmation if visible interaction changes are possible:

- reducer/state machine;
- active run freshness guard;
- suggestion race guard;
- cancellation/retry semantics;
- Android Back stack refinements.

## Design Decisions

### Decision A: Latency budget is a product requirement

The harness should not optimize for perfect citation refinement at the cost of making users stare at a spinner. For indexed books, the design target is visible answer output around 10-15 seconds. When this cannot happen, diagnostics must show why.

### Decision B: Trace before behavior change

Recent answer-quality work already changed retrieval and sidecar behavior. The next safest step is trace/eval, not more heuristics.

### Decision C: Metadata allowlist over redaction-only

Redaction remains a safety net, but Reader AI trace events should be constructed from allowlisted enums/counts/durations. Avoid content fields by design.

### Decision D: Do not overfit to current benchmark book

Azik and 0-08 exposed issues, but the solution must remain generic for ordinary-reader recall across books.

## Open Questions

1. Should Phase 1 include invisible run freshness guards, or only diagnostics?
2. Should eval fixtures live under `apps/readest-app/evals/reader-ai/` or `src/__tests__/ai/fixtures/`?
3. Should diagnostic export gain a per-run summary in this change, or remain raw JSONL events first?
4. How much citation validation timing should be recorded before stable taxonomy is finalized?
