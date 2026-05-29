## Context

Phase 1 added Reader AI run traces and a minimal eval schema under `apps/readest-app/src/services/ai/eval/`. That gives Readio safe raw signals, but not yet a repeatable evaluation workflow.

The next useful layer is a deterministic local harness:

```text
Synthetic / manual eval cases
        │
        ▼
case validation ──▶ eval execution or manual result import
        │                         │
        ▼                         ▼
metadata-only result records ◀── trace aggregation by runId
        │
        ▼
category + latency + citation summary report
```

Constraints:

- Committed fixtures must avoid copyrighted source text, answer text, raw prompts, local paths, book hashes, API keys, and stable private book identifiers.
- Same-language ordinary-reader recall is the priority: people, objects, events, relationships, current recap, citation grounding, and spoiler safety.
- NotebookLM is useful as a manual full-book benchmark, but it must not become a CI dependency.
- Phase 2 should not change Reader AI UI, prompts, retrieval ranking, source preview, citation chip visuals, or answer style.

## Goals / Non-Goals

**Goals:**

- Provide an executable or importable local eval harness for Reader AI ordinary-reader cases.
- Validate case and result records before they are committed or reported.
- Aggregate existing `reader_ai.trace` metadata by `runId` into stage timings, source/candidate counts, citation stats, insufficient-answer status, and over-budget categories.
- Produce a compact metadata-only report that can guide later quality work.
- Include synthetic fixtures and tests proving the harness works without private book text.

**Non-Goals:**

- No model quality changes in this slice.
- No UI or mobile WebView behavior changes.
- No LLM-as-judge in CI.
- No NotebookLM automation dependency.
- No embedding index, knowledge graph, or new retrieval ranking system.
- No committed real book passages, model answers, or user-private questions.

## Decisions

### Decision 1: Keep eval execution deterministic first

The harness should validate, run, aggregate, and summarize structured metadata. It should not rely on an LLM judge for pass/fail.

Alternatives considered:

- **LLM judge first**: flexible, but unstable and expensive. It can hide grounding problems.
- **NotebookLM oracle**: useful manually, but not reliable as automated truth and does not share Readio's spoiler boundary.

Rationale: deterministic checks create a stable baseline. Human/NotebookLM notes can be attached later as manual metadata.

### Decision 2: Separate case definitions from result evidence

Eval cases describe ordinary-reader tasks: category, language, question, expected behavior, spoiler mode, and optional tags. Results record run metadata: runId, intent, source count, citation validity, insufficient-answer status, first-output latency, outcome, and reasons.

Rationale: a case can be reused across model/provider/settings runs, while results are per run.

### Decision 3: Aggregate traces by `runId`, not by content

Trace aggregation should consume diagnostics-like objects and group only by opaque `runId`. It should calculate stage durations and counts from allowed metadata fields.

Rejected fields include raw question, answer, source text, snippet, prompt, book title, author, book hash, path, URL, and API key.

Rationale: this preserves the privacy boundary from Phase 1 while making traces useful.

### Decision 4: Make reports metadata-only and diff-friendly

The report should be a plain object or markdown/text generator with:

- total cases/results;
- category breakdown;
- pass/fail counts;
- insufficient-answer counts;
- citation-valid counts;
- first-output latency summary;
- over-budget stage breakdown;
- manual benchmark notes only as non-content labels or links controlled by the user.

Rationale: reports should be easy to test and review without exposing private reading data.

### Decision 5: Start inside app service code, not a separate CLI

Phase 2 should extend `apps/readest-app/src/services/ai/eval/` with pure functions and tests. A CLI can come later once the data contract is stable.

Rationale: pure functions avoid new dependencies and can be tested quickly. They also keep the first slice small.

## Risks / Trade-offs

- **Risk: reports are too shallow to explain answer quality** → Mitigation: focus Phase 2 on measurable blockers: latency, retrieval counts, citation validity, insufficiency, and category-level outcomes. Deeper semantic scoring is a later change.
- **Risk: committed cases leak private reading context** → Mitigation: validation rejects content-bearing fields and tests include privacy regressions.
- **Risk: result pass/fail becomes subjective** → Mitigation: require structured reasons and keep deterministic metadata separate from optional manual notes.
- **Risk: trace aggregation overfits the current event taxonomy** → Mitigation: ignore unknown stages/actions and summarize only known safe fields.
- **Risk: adding a runner accidentally changes product code paths** → Mitigation: implement pure eval utilities first; no UI/runtime invocation in Phase 2.

## Migration Plan

1. Extend eval schema with safe optional metadata needed for execution/reporting.
2. Add trace aggregation helpers that consume `reader_ai.trace`-style metadata.
3. Add result summary/report helpers.
4. Add synthetic fixtures and tests for case validation, result validation, trace aggregation, and report output.
5. Document manual same-language full-book benchmarking workflow and NotebookLM comparison notes.

Rollback: remove the new eval utilities and tests. Product Reader AI behavior remains unchanged because this change does not alter runtime UI or generation logic.

## Open Questions

- Should Phase 2 include an actual service-level runner around `streamReaderAIAnswer`, or only pure result/trace aggregation utilities?
- Should manual benchmark notes live in committed synthetic fixtures, ignored local files, or exported diagnostics bundles?
- Should first-output latency targets remain fixed at 15 seconds or be configurable per provider/model in eval metadata?
