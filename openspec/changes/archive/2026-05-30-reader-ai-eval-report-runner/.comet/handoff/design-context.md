# Comet Design Handoff

- Change: reader-ai-eval-report-runner
- Phase: design
- Mode: compact
- Context hash: a08b5f2bee7044774df3c8329aad5b1ec595bc5953e5969eac228d7add6979a3

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-eval-report-runner/proposal.md

- Source: openspec/changes/reader-ai-eval-report-runner/proposal.md
- Lines: 1-31
- SHA256: 1458683bb3bceb835c0e76b3224f8db832e29840b5dfaeebfdccf33a54db6a4b

```md
## Why

Reader AI now has metadata-only eval schemas, trace aggregation, and summary helpers, but there is still no local entry point that turns exported diagnostics plus manual result records into a durable eval report. Without a runner, quality analysis remains manual glue work and is harder to repeat across providers, books, or Reader AI changes.

## What Changes

- Add a local Reader AI eval report runner that loads metadata-only eval cases, manually recorded eval results, and Reader AI trace-like diagnostics from local JSON files.
- Generate deterministic JSON and Markdown reports using the existing eval validation, trace aggregation, and report summary utilities.
- Validate all inputs before report generation and fail closed when case/result files contain unsafe content-bearing fields.
- Keep the runner local-only and non-invasive: no model calls, no real book loading, no UI changes, no prompt/retrieval/citation behavior changes, and no NotebookLM automation.

## Capabilities

### New Capabilities

- `reader-ai-eval-report-runner`: Local metadata-only report generation from eval cases, manual result records, and exported Reader AI diagnostics.

### Modified Capabilities

- `reader-ai-eval-harness`: Extend the existing eval harness contract from pure summary helpers to a local file-based report generation entry point.
- `reader-ai-harness-observability`: Clarify how exported trace diagnostics are consumed by the local report runner while preserving the metadata-only privacy boundary.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/ai/eval/`
  - focused tests under `apps/readest-app/src/__tests__/ai/`
  - optional package script wiring in `apps/readest-app/package.json` only if a CLI wrapper is needed
  - OpenSpec specs under `openspec/specs/`
- No new runtime service, telemetry upload, database migration, or external dependency expected.
- No Android APK validation expected unless implementation unexpectedly touches UI/WebView behavior.
```

## openspec/changes/reader-ai-eval-report-runner/design.md

- Source: openspec/changes/reader-ai-eval-report-runner/design.md
- Lines: 1-76
- SHA256: fa4579d882ab9fa138e9afc815b1838ee37fde26de3ff25767a11b696cc7b2c3

```md
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
```

## openspec/changes/reader-ai-eval-report-runner/tasks.md

- Source: openspec/changes/reader-ai-eval-report-runner/tasks.md
- Lines: 1-24
- SHA256: 3080f8ffd240d9b0b17a4e5a47e64db373ba46dcfc14ca1a1e8f7ff715a7bab4

```md
## 1. Runner Input Validation

- [ ] 1.1 Add a metadata-only report runner input type for local JSON envelopes containing `cases`, `results`, and optional `traces` arrays.
- [ ] 1.2 Add validation that rejects non-object inputs and non-array envelope fields with deterministic validation issues.
- [ ] 1.3 Reuse existing eval case/result validators so unsafe content-bearing case/result fields fail closed before report generation.

## 2. Report Generation

- [ ] 2.1 Add pure report runner helpers that compose case/result validation, trace aggregation, and eval report summary generation.
- [ ] 2.2 Add deterministic JSON report output that preserves the existing metadata-only `ReaderAIEvalReport` shape.
- [ ] 2.3 Add deterministic Markdown report rendering from sanitized report data with stable overview, category, latency, and run-summary sections.

## 3. Privacy and Documentation

- [ ] 3.1 Add tests proving unsafe trace-like fields are omitted from JSON and Markdown reports.
- [ ] 3.2 Document the local report runner input shape and scope in the eval README.
- [ ] 3.3 Keep NotebookLM/manual benchmark observations non-authoritative and separate from deterministic scoring.

## 4. Verification and Handoff

- [ ] 4.1 Run focused Reader AI eval/report tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with report runner scope, validation evidence, and deferred automation follow-ups.
```

## openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-eval-harness/spec.md

- Source: openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-eval-harness/spec.md
- Lines: 1-12
- SHA256: ad4020b96f37e5820a40ab9217fa56415fa9e9777e57db05b22d9116a5fa396d

```md
## ADDED Requirements

### Requirement: Eval harness exposes report runner composition

The system SHALL allow local eval tooling to compose existing case validation, result validation, trace aggregation, and report summary helpers into a single report generation workflow.

#### Scenario: Existing helpers are reused for report generation

- **WHEN** the report runner builds a report from validated local inputs
- **THEN** it uses the eval harness validation, trace aggregation, and report summary behavior rather than duplicating separate scoring or aggregation rules

#### Scenario: Manual benchmark notes remain separate from scoring

- **WHEN** eval results include manual NotebookLM or human benchmark metadata
- **THEN** the report runner preserves deterministic pass/fail scoring from explicit result metadata and does not treat manual benchmark observations as an automated oracle
```

## openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-eval-report-runner/spec.md

- Source: openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-eval-report-runner/spec.md
- Lines: 1-41
- SHA256: 6463f414c1140e160bc156ffd707853357832d2647eb795012cde194f9e0c961

```md
## ADDED Requirements

### Requirement: Local eval report input loading

The system SHALL load local metadata-only Reader AI eval report inputs from JSON data containing eval cases, eval results, and optional Reader AI trace-like events.

#### Scenario: Valid report input is accepted

- **WHEN** a report input contains arrays of eval cases, eval results, and trace-like metadata events
- **THEN** the runner accepts the input and prepares the data for validation and report generation

#### Scenario: Invalid report input is rejected

- **WHEN** a report input is not an object or contains non-array cases, results, or traces fields
- **THEN** the runner rejects the input with validation issues instead of generating a report

### Requirement: Report runner validates metadata privacy

The system MUST validate report runner inputs with the Reader AI eval validators and MUST fail closed when cases or results contain unsafe content-bearing fields.

#### Scenario: Unsafe case or result blocks report generation

- **WHEN** a report input contains raw answer text, source text, prompts, local paths, book hashes, URLs, API keys, or stable private book identifiers
- **THEN** the runner returns validation issues and does not include those raw values in JSON or Markdown output

#### Scenario: Unsafe trace fields are omitted from summaries

- **WHEN** trace-like input includes raw question text, answer text, source text, snippets, prompts, book identity, local paths, URLs, or credentials
- **THEN** trace aggregation ignores those fields and the generated report output does not copy them

### Requirement: Deterministic JSON and Markdown reports

The system SHALL generate deterministic metadata-only JSON and Markdown reports from validated eval inputs.

#### Scenario: JSON report is produced

- **WHEN** the runner receives valid eval cases, eval results, and optional traces
- **THEN** it returns a JSON report with totals, pass/fail counts, category summaries, latency summaries, over-budget stage breakdowns, and trace run summaries

#### Scenario: Markdown report is produced

- **WHEN** the runner receives valid eval cases, eval results, and optional traces
- **THEN** it returns Markdown with stable overview, category, latency, and run-summary sections derived only from sanitized report data

### Requirement: Report runner remains local and non-invasive

The system SHALL keep Reader AI eval report runner execution local and MUST NOT call model providers, load real books, alter Reader AI runtime behavior, or upload telemetry.

#### Scenario: Report generation uses existing metadata only

- **WHEN** a report is generated
- **THEN** the runner uses only provided local metadata inputs and does not invoke answer generation, indexing, retrieval, UI rendering, NotebookLM automation, or remote telemetry
```

## openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-harness-observability/spec.md

- Source: openspec/changes/reader-ai-eval-report-runner/specs/reader-ai-harness-observability/spec.md
- Lines: 1-12
- SHA256: 352727ea05c6c38e5444bc15f2332562c9948e4db390efe1e9582257cf2e87f2

```md
## ADDED Requirements

### Requirement: Exported Reader AI traces support local report generation

The system SHALL allow exported Reader AI trace diagnostics to be consumed by the local eval report runner as metadata-only trace-like events.

#### Scenario: Exported trace events are summarized by run id

- **WHEN** local report generation receives exported Reader AI trace diagnostics containing run identifiers, stages, actions, statuses, counts, durations, issue counts, latency budgets, and normalized outcomes
- **THEN** the runner summarizes them by opaque run id without requiring raw user questions, answers, source text, book identity, local paths, URLs, prompts, or credentials

#### Scenario: Trace privacy boundary is preserved in report output

- **WHEN** exported diagnostics contain unknown or unsafe content-bearing trace fields
- **THEN** local report generation omits those fields from trace summaries, JSON reports, and Markdown reports
```
