# Comet Design Handoff

- Change: reader-ai-eval-harness-phase-2
- Phase: design
- Mode: compact
- Context hash: 144ca1672290ceab46b0f34db632fccd4c6d90770a20084fc7616db09a195e68

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-eval-harness-phase-2/proposal.md

- Source: openspec/changes/reader-ai-eval-harness-phase-2/proposal.md
- Lines: 1-35
- SHA256: 085ce1f14b20aa3c187684899a3d3c374e52e13a5436c84b4710c7aff0c544bf

```md
## Why

Reader AI now has privacy-safe per-turn tracing, but Readio still lacks a repeatable way to turn those traces into ordinary-reader QA evidence. Without a local eval runner and summary report, quality work can regress into ad-hoc manual checks and subjective screenshots.

This change adds a Phase 2 evaluation harness that runs curated ordinary-reader cases against Reader AI plumbing, captures metadata-only outcomes, and summarizes latency, retrieval, citation, and insufficiency signals without committing copyrighted book text or user/private content.

## What Changes

- Add a local Reader AI eval runner foundation that can execute or record ordinary-reader QA cases and validate result shape.
- Add metadata-only trace/result aggregation so a run can summarize first-output latency, retrieval source counts, citation validity, insufficient-answer rates, and pass/fail reasons by category.
- Add a small committed fixture set using synthetic/non-copyrighted cases to prove the harness works without private book text.
- Add a report format for manual benchmark comparisons, including NotebookLM full-book notes, while keeping NotebookLM outside CI.
- Keep Reader AI UI, answer style, prompt behavior, retrieval ranking, and citation preview visuals out of scope unless a later change explicitly targets them.

## Capabilities

### New Capabilities

- `reader-ai-eval-harness`: Local metadata-only Reader AI evaluation execution, result validation, trace aggregation, and ordinary-reader QA reporting.

### Modified Capabilities

- `reader-ai-harness-observability`: Extend the existing harness contract from trace emission to trace consumption by the local eval/reporting layer; diagnostics must remain metadata-only and privacy-safe.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/ai/eval/`
  - Reader AI eval tests under `apps/readest-app/src/__tests__/ai/`
  - diagnostics/trace types only if additional safe aggregation metadata is needed
  - OpenSpec capability docs under `openspec/specs/`
- No new external runtime service.
- No server-side telemetry upload.
- NotebookLM remains manual benchmark context, not a CI dependency or oracle.
- No Android APK validation expected unless implementation changes Reader UI/WebView behavior.
```

## openspec/changes/reader-ai-eval-harness-phase-2/design.md

- Source: openspec/changes/reader-ai-eval-harness-phase-2/design.md
- Lines: 1-116
- SHA256: 9193dc9b4a7304c8c7dc5e53f9ff4ba2479902735f24211a88180be262b9d137

[TRUNCATED]

````md
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
````

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

````

Full source: openspec/changes/reader-ai-eval-harness-phase-2/design.md

## openspec/changes/reader-ai-eval-harness-phase-2/tasks.md

- Source: openspec/changes/reader-ai-eval-harness-phase-2/tasks.md
- Lines: 1-24
- SHA256: 766abeb4796eb0f18a2501630c3eaa83318b840abf585ca0dc4e31c62d642981

```md
## 1. Eval Schema Hardening

- [ ] 1.1 Extend Reader AI eval case/result types with safe optional metadata for run grouping, manual benchmark notes, and category reporting.
- [ ] 1.2 Harden eval validators to reject content-bearing fields in cases, results, manual notes, and trace-like inputs.
- [ ] 1.3 Add synthetic fixture tests proving valid ordinary-reader cases/results pass and unsafe private-content fields fail.

## 2. Trace Aggregation

- [ ] 2.1 Add pure trace aggregation helpers that group `reader_ai.trace`-style metadata by `runId`.
- [ ] 2.2 Summarize safe fields: stage durations, source/candidate counts, issue counts, first-output latency, over-budget stage, and final outcome.
- [ ] 2.3 Add tests showing unknown/content-bearing trace fields are ignored and never copied into summaries.

## 3. Eval Reporting

- [ ] 3.1 Add metadata-only eval summary helpers for total cases, category breakdown, pass/fail counts, insufficient-answer counts, citation-valid counts, latency summary, and over-budget stage breakdown.
- [ ] 3.2 Add report tests using synthetic cases/results and trace summaries.
- [ ] 3.3 Document manual NotebookLM full-book benchmark notes as non-authoritative metadata separate from deterministic pass/fail.

## 4. Verification and Handoff

- [ ] 4.1 Run focused eval and diagnostics tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with Phase 2 eval harness scope, validation evidence, and deferred quality-analysis follow-ups.
````

## openspec/changes/reader-ai-eval-harness-phase-2/specs/reader-ai-eval-harness/spec.md

- Source: openspec/changes/reader-ai-eval-harness-phase-2/specs/reader-ai-eval-harness/spec.md
- Lines: 1-52
- SHA256: 8a03e9362b6483c59bd26c4ee39f86f26a7b2dcffd69dececef51a77b5d4121d

```md
## ADDED Requirements

### Requirement: Eval case fixture validation

The system SHALL validate Reader AI eval case fixtures before execution or reporting, and MUST reject committed case data that contains raw source text, answer text, prompts, local paths, book hashes, API keys, or stable private book identifiers.

#### Scenario: Valid ordinary-reader case is accepted

- **WHEN** an eval case includes an id, ordinary-reader category, language, user-style question, expected behavior, and spoiler mode
- **THEN** the validator accepts the case without requiring private book text

#### Scenario: Content-bearing case fields are rejected

- **WHEN** an eval case includes source text, answer text, raw prompts, local paths, book hashes, API keys, or stable private book identifiers
- **THEN** the validator rejects the case and reports the unsafe fields

### Requirement: Eval result validation

The system SHALL validate Reader AI eval result records with objective metadata and MUST keep result records free of raw answers, raw source text, prompts, local paths, API keys, and private book identifiers.

#### Scenario: Valid metadata-only result is accepted

- **WHEN** an eval result records case id, run id, intent, source count, citation validity, insufficient-answer status, first-output latency, pass/fail status, and structured reasons
- **THEN** the validator accepts the result as metadata-only evidence

#### Scenario: Unsafe result content is rejected

- **WHEN** an eval result includes raw answer text, source text, prompts, local paths, API keys, or stable private book identifiers
- **THEN** the validator rejects the result and reports the unsafe fields

### Requirement: Trace aggregation by run identifier

The system SHALL aggregate Reader AI trace metadata by opaque run identifier and summarize only safe metadata fields.

#### Scenario: Run trace summary is produced

- **WHEN** trace events for a Reader AI run include retrieval, generation, citation, persistence, and completion metadata with the same run identifier
- **THEN** the aggregation result reports stage durations, source/candidate counts, citation issue counts, first-output latency, over-budget stage, and final outcome without raw content

#### Scenario: Unknown or unsafe trace fields are ignored

- **WHEN** trace input includes unknown fields or content-bearing fields
- **THEN** aggregation ignores those fields and does not copy them into the summary

### Requirement: Eval report summary

The system SHALL produce a compact metadata-only Reader AI eval report from validated cases, results, and optional trace summaries.

#### Scenario: Category-level report is produced

- **WHEN** eval results are grouped across ordinary-reader categories
- **THEN** the report includes total cases, pass/fail counts, citation-valid counts, insufficient-answer counts, first-output latency summary, and over-budget stage breakdown by category

#### Scenario: Report omits private content

- **WHEN** the report is generated from cases, results, and trace summaries
- **THEN** the report omits raw source text, raw answers, prompts, book titles, book hashes, local paths, URLs, and API keys

### Requirement: Manual benchmark notes remain non-authoritative

The system SHALL allow manual benchmark metadata to be recorded separately from deterministic eval pass/fail status.

#### Scenario: NotebookLM comparison is recorded as manual metadata

- **WHEN** a user compares a Readio answer with NotebookLM full-book mode
- **THEN** the eval record can note benchmark source, spoiler mode, and non-content observations without treating NotebookLM output as an automated oracle
```

## openspec/changes/reader-ai-eval-harness-phase-2/specs/reader-ai-harness-observability/spec.md

- Source: openspec/changes/reader-ai-eval-harness-phase-2/specs/reader-ai-harness-observability/spec.md
- Lines: 1-12
- SHA256: edf7bd910c73f55089d422a36c151088267c8be55ac88e10f7a375d42d22d3b1

```md
## ADDED Requirements

### Requirement: Reader AI trace consumers remain privacy-safe

The system SHALL allow local tools to consume Reader AI trace diagnostics for evaluation and reporting while preserving the same metadata-only privacy boundary as trace emission.

#### Scenario: Eval tooling consumes trace metadata

- **WHEN** local eval tooling reads Reader AI trace-like metadata for a run identifier
- **THEN** it uses only run id, stage/action/status enums, counts, durations, issue type counts, latency budgets, and normalized outcome metadata

#### Scenario: Eval tooling rejects content-bearing trace data

- **WHEN** trace-like input includes raw question text, answer text, source text, snippets, prompts, book identity, local paths, URLs, or credentials
- **THEN** local eval tooling does not copy those fields into summaries or reports
```
