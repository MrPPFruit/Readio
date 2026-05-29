## Context

Phase 2 added pure metadata-only utilities in `apps/readest-app/src/services/ai/eval/`: case/result validation, trace aggregation by `runId`, and category-level report summaries. Diagnostics already emit Reader AI trace metadata through `readerAITrace.ts` and the OpenSpec specs now define the privacy boundary for trace consumers.

The missing layer is a local report runner that can be invoked during quality work to convert exported diagnostics and manually recorded result files into stable JSON/Markdown evidence. This should be a file-based local workflow first, not a model runner, because the current need is repeatable reporting from available metadata rather than automatic answer generation.

## Goals / Non-Goals

**Goals:**

- Load local JSON inputs containing eval cases, eval results, and Reader AI trace-like diagnostic events.
- Validate cases/results before report generation and fail closed on unsafe content-bearing fields.
- Reuse existing `buildReaderAITraceRunSummaries` and `buildReaderAIEvalReport` rather than duplicating report math.
- Produce deterministic JSON and Markdown output that is suitable for local review and future CI-style artifact comparison.
- Keep outputs metadata-only and exclude raw answers, source text, prompts, book identity, local paths, URLs, and credentials.

**Non-Goals:**

- No calls to `streamReaderAIAnswer` or any provider/model API.
- No real book loading, indexing, or retrieval execution.
- No UI, mobile WebView, citation preview, prompt, answer style, or retrieval ranking changes.
- No NotebookLM automation and no LLM-as-judge.
- No new persistent database tables or remote telemetry.

## Decisions

### Decision 1: Implement a pure file-to-report runner first

The runner should expose pure functions that accept parsed unknown JSON input and return validated report data plus Markdown text. A thin CLI or package script can wrap those functions only if needed.

Alternatives considered:

- **Direct service-level runner around `streamReaderAIAnswer`**: more automated, but couples this change to model behavior, real books, provider keys, and flaky quality checks.
- **Manual spreadsheet/reporting outside the app**: fast initially, but loses type safety and privacy validation.

Rationale: pure file-to-report functions are deterministic, easy to test, and preserve the existing privacy contract.

### Decision 2: Treat input files as untrusted boundaries

JSON inputs should be parsed as `unknown`. Cases and results must pass the existing validators. Trace-like diagnostics should only contribute through allowed metadata fields already consumed by `buildReaderAITraceRunSummaries`.

Rationale: local eval artifacts may be hand-edited or exported from diagnostics bundles, so the runner must not trust shape or privacy safety by default.

### Decision 3: Keep report output deterministic and diff-friendly

JSON output should preserve the existing `ReaderAIEvalReport` shape. Markdown output should be generated from that report with stable section order: overview, category table, latency/over-budget summary, run summaries, and validation issues when present.

Rationale: deterministic output supports review, regression tracking, and future automation without adding a database or UI.

### Decision 4: Do not mix manual benchmark notes into deterministic pass/fail scoring

Manual NotebookLM/human observations may remain attached to result metadata, but report scoring should continue to use explicit `passed`, `citationValid`, `insufficientAnswer`, and latency fields.

Rationale: NotebookLM is useful context but not an oracle, and spoiler-boundary differences must remain visible rather than hidden in an automated score.

## Risks / Trade-offs

- **Risk: file format sprawl** → Mitigation: support one simple input envelope first: `{ cases, results, traces }`, with arrays only.
- **Risk: unsafe fields leak through Markdown** → Mitigation: Markdown generation must render only the sanitized report object and validation issue strings, never raw input records.
- **Risk: users expect automatic answer evaluation** → Mitigation: document that this change is report generation only; automatic execution is a later change.
- **Risk: reports are too shallow for semantic quality** → Mitigation: focus this slice on reliable objective signals; keep LLM-as-judge deferred.

## Migration Plan

1. Add runner input/output types and validation helpers in the eval service area.
2. Add deterministic JSON/Markdown report generation helpers.
3. Add focused tests with synthetic safe inputs and unsafe input regressions.
4. Add README usage notes or package script only if it does not introduce runtime coupling.

Rollback: remove the runner helpers/tests/docs. Existing Reader AI runtime behavior remains unchanged because this change is local eval tooling only.

## Open Questions

- Should the first implementation include a thin Node CLI wrapper, or only pure service functions plus tests?
- Should validation issues be returned alongside partial reports, or should any invalid case/result fail the whole report generation?
- Should Markdown include individual run summaries by default, or keep them behind an option to reduce report size?
