# Comet Design Handoff

- Change: reader-ai-live-fixture-eval-runner
- Phase: design
- Mode: compact
- Context hash: cf8dbc6d8d9457d9f0d2c3a07c048128672145fe23563ef09ea606fe078b36d1

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-live-fixture-eval-runner/proposal.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/proposal.md
- Lines: 1-33
- SHA256: 163efb5c7f3e0d1365533eebd50e2a4b08b06ce0fb32b8d2611cdb9ac29626e2

```md
## Why

Reader AI now has deterministic metadata schemas, report generation, and a dependency-injected service eval runner, but it still cannot run a controlled real local book fixture through the real Reader AI service path. The next useful step is a guarded live fixture runner that produces real quality evidence before changing retrieval, prompts, citations, or UI behavior.

## What Changes

- Add a local live fixture eval runner that reads an explicit metadata-only fixture file, wires the real `streamReaderAIAnswer` path through the existing service eval runner, and writes a reportable metadata envelope.
- Add fixture contract support for ordinary-reader questions, book/session metadata needed to run the service path, explicit provider/model settings, read boundary, and output paths without storing raw book text or answer text.
- Add opt-in cost and safety guardrails: explicit live-run flag, case-count limit, provider/model labels, timeout/abort handling, and no default provider execution in tests.
- Reuse `runReaderAIServiceEval`, `buildReaderAIEvalReportRun`, and the existing `reader-ai:report` output contract rather than duplicating scoring/report logic.
- Keep this slice local and small: one-book/small-question-set fixtures first; no batch library scan, no UI changes, no prompt/retrieval behavior changes, no automatic NotebookLM or LLM-as-judge.

## Capabilities

### New Capabilities

- `reader-ai-live-fixture-eval-runner`: Local guarded runner for explicit real-book/live-provider Reader AI eval fixtures that emits metadata-only eval envelopes and optional reports.

### Modified Capabilities

- `reader-ai-service-eval-runner`: Allow a future caller to explicitly inject the real Reader AI streamer for live fixtures while preserving the existing dependency-injected metadata-only boundary.
- `reader-ai-eval-report-cli`: Allow live fixture runner output envelopes to be rendered by the existing report CLI/report runner without changing report privacy rules.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/ai/eval/`
  - `apps/readest-app/scripts/`
  - focused Reader AI eval tests under `apps/readest-app/src/__tests__/ai/`
  - eval documentation under `apps/readest-app/src/services/ai/eval/README.md`
  - OpenSpec specs under `openspec/specs/`
- Requires local explicit fixture inputs and user-provided provider credentials/settings for actual live runs.
- No app UI, mobile WebView behavior, default model provider setting, database migration, APK build, remote telemetry, NotebookLM automation, or LLM-as-judge expected.
```

## openspec/changes/reader-ai-live-fixture-eval-runner/design.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/design.md
- Lines: 1-106
- SHA256: d74442f1eefdca1895452549d1d015577afc0bcfb808700f1a1eeb186961c9ef

[TRUNCATED]

````md
## Context

The Reader AI eval stack currently has four local layers:

```text
metadata eval schemas
  -> buildReaderAIEvalReportRun(input)
  -> reader-ai:report CLI
  -> runReaderAIServiceEval(input, deps)
```
````

`runReaderAIServiceEval` can turn controlled service runs into metadata-only envelopes, but it deliberately requires an injected answer streamer and does not choose providers, load books, parse fixture files, or write reports. The next step is a thin local runner around that harness for one explicit live fixture at a time.

External eval guidance converges on the same shape: maintain a small golden dataset, separate retrieval/generation/citation evidence, track cost and latency, keep deterministic guardrails around live nondeterminism, and avoid storing private corpus text in eval artifacts.

## Goals / Non-Goals

**Goals:**

- Provide a local runner for explicit real-book/live-provider Reader AI fixture runs.
- Reuse `runReaderAIServiceEval` for execution metadata and `buildReaderAIEvalReportRun` / `reader-ai:report` for reporting.
- Accept a metadata-only fixture file with ordinary-reader questions, local book/session locator metadata, read boundary, provider/model labels, run limits, and output paths.
- Require an explicit live-run opt-in so tests and accidental invocations cannot call providers.
- Preserve strict privacy boundaries: no raw book text, answer text, prompt text, source text, API keys, local paths, book hashes, URLs, or stable private identifiers in committed fixtures or output envelopes.
- Keep tests deterministic with fake fixture loaders and fake streamers.

**Non-Goals:**

- No UI changes.
- No Reader AI prompt, retrieval ranking, citation repair, or answer behavior changes.
- No default provider calls in tests or normal report generation.
- No full library scan, batch benchmark suite, or automatic EPUB fixture repository.
- No NotebookLM automation and no LLM-as-judge.
- No remote telemetry upload.

## Decisions

### Decision 1: Build a thin file runner, not a new eval engine

Create a local Node/tsx runner under `apps/readest-app/scripts/` or a small script-facing module under `apps/readest-app/src/services/ai/eval/`. The runner reads one explicit fixture file, constructs `ReaderAIServiceEvalInput`, invokes `runReaderAIServiceEval` with an explicitly selected streamer, validates the output with `buildReaderAIEvalReportRun`, and writes metadata-only envelope/report artifacts.

Rationale: the service eval runner already owns scoring and trace sanitization. The live fixture runner should own only file orchestration, fixture validation, live-run guardrails, and report writing.

Alternatives considered:

- **Fold live fixture support into `runReaderAIServiceEval`**: rejected because it would mix pure service orchestration with file I/O and live-provider concerns.
- **Build a full benchmark framework now**: rejected because the first real signal should come from one small fixture before broader automation.

### Decision 2: Fixture files are metadata-only and local-explicit

The fixture file should contain:

- eval cases using existing `ReaderAIEvalCase` shape;
- opaque fixture/run labels safe for reports;
- local book/session locator fields needed at runtime but excluded from output;
- read boundary such as `currentPage` / `currentAIPage`;
- provider/model labels and optional settings overrides;
- run limits, timeout, and output paths.

Committed example fixtures must use fake placeholders only. Real local fixture files may exist outside git or under ignored local paths.

Rationale: real book execution needs runtime locators, but persistent eval artifacts should remain metadata-only.

### Decision 3: Live provider execution requires explicit opt-in

The runner should refuse to call the real streamer unless an explicit flag such as `--live` is present. Tests should cover this with fake dependencies and no provider calls. The runner should also support a small case limit and abort/timeout metadata.

Rationale: live evals spend money, can be flaky, and may touch private local books. Accidental execution should fail closed.

### Decision 4: Report outputs stay sanitized

The runner may write:

```text
envelope.json     # cases/results/traces only
report.json       # ReaderAIEvalReport only
report.md         # deterministic markdown summary
```

It must not write raw answers, prompts, source previews, provider request bodies, local paths, API keys, or raw exception messages.

````

Full source: openspec/changes/reader-ai-live-fixture-eval-runner/design.md

## openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md
- Lines: 1-27
- SHA256: e0ac91728e5824d333d89783cb9e81b8435e6e397d6db5ecea2faa2163d62aca

```md
## 1. Fixture Contract and Validation

- [ ] 1.1 Add focused tests for a live fixture parser that accepts metadata-only eval cases, safe run labels, Reader AI settings labels, read boundary metadata, and output paths.
- [ ] 1.2 Implement the fixture input types and validation helpers without allowing raw answer text, source text, prompt text, API keys, URLs, local paths, book hashes, or stable private identifiers in persisted metadata fields.
- [ ] 1.3 Add tests proving unsafe fixture content fails closed before live execution or output file writes.

## 2. Guarded Live Runner Orchestration

- [ ] 2.1 Add focused tests proving the runner refuses real provider execution unless an explicit live flag is present.
- [ ] 2.2 Implement a local runner wrapper that converts a valid fixture into `ReaderAIServiceEvalInput` and delegates execution to `runReaderAIServiceEval`.
- [ ] 2.3 Add case-count limit and timeout/abort handling that records safe failure labels instead of raw exception messages.
- [ ] 2.4 Add tests proving the real streamer is injected only through the existing `StreamReaderAIAnswerOptions` contract and that fake streamers remain the default test path.

## 3. Metadata Output and Report Compatibility

- [ ] 3.1 Add tests proving successful fixture runs write a metadata-only envelope and optional sanitized JSON/Markdown report artifacts.
- [ ] 3.2 Reuse `buildReaderAIEvalReportRun` or the existing report CLI path for report generation without duplicating report validation/scoring rules.
- [ ] 3.3 Add tests proving output artifacts exclude raw answers, source previews, prompts, book identity, API keys, URLs, local paths, and raw exception messages.

## 4. Documentation and Verification

- [ ] 4.1 Document local live fixture usage, explicit live opt-in, privacy boundaries, and deferred real-book batch/NotebookLM/LLM-as-judge scope in the eval README.
- [ ] 4.2 Run focused live fixture runner and existing service/report tests.
- [ ] 4.3 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.4 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.5 Run `openspec validate --all --strict`.
- [ ] 4.6 Update `HANDOFF.md` with live fixture runner scope, validation evidence, and deferred follow-ups.
````

## openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-eval-report-cli/spec.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-eval-report-cli/spec.md
- Lines: 1-15
- SHA256: b7f101968e38e52f9f1b2fd0f38d65c1c757c638970d4c357854c60d0c418dc3

```md
## ADDED Requirements

### Requirement: Report CLI can render live fixture envelopes

The system SHALL allow metadata-only envelopes produced by the live fixture eval runner to be rendered through the existing local report runner and report CLI contract.

#### Scenario: Live fixture envelope is reportable

- **WHEN** the live fixture runner writes a valid metadata-only envelope containing cases, results, and trace-like metadata
- **THEN** the existing report runner or CLI path can produce sanitized deterministic JSON and Markdown reports from that envelope

#### Scenario: Report rendering preserves privacy for live fixture outputs

- **WHEN** live fixture output metadata is rendered into reports
- **THEN** the report artifacts contain only sanitized eval summaries and do not include raw answers, source text, prompts, local paths, URLs, credentials, book hashes, or stable private book identifiers
```

## openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-live-fixture-eval-runner/spec.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-live-fixture-eval-runner/spec.md
- Lines: 1-43
- SHA256: 5a3cb1a09a624f7f26251a9572a6e7d102ff231847bb6c89a8b84d8a0b7919cd

```md
## ADDED Requirements

### Requirement: Live fixture runner accepts explicit metadata-only fixtures

The system SHALL provide a local live fixture eval runner that accepts an explicit metadata-only fixture file for one controlled Reader AI real-book run set.

#### Scenario: Valid fixture is accepted

- **WHEN** the live fixture runner receives a fixture containing eval cases, safe run labels, Reader AI settings labels, read boundary metadata, and output paths
- **THEN** it validates the fixture and prepares a service eval input without requiring raw book text, raw answer text, prompts, source text, API keys, local paths, URLs, book hashes, or stable private identifiers in committed fixture data

#### Scenario: Unsafe fixture content is rejected

- **WHEN** a fixture contains raw answer text, raw source text, prompt text, API keys, URLs, local paths, book hashes, or stable private identifiers in persisted metadata fields
- **THEN** the runner rejects the fixture with deterministic validation issues and does not execute a live run or write partial output artifacts

### Requirement: Live fixture runner requires explicit provider execution opt-in

The system SHALL prevent accidental live model/provider execution by default.

#### Scenario: Missing live opt-in blocks provider execution

- **WHEN** the runner is invoked without the explicit live execution flag
- **THEN** it refuses to call the real Reader AI answer streamer and exits with a deterministic safety message

#### Scenario: Live opt-in executes bounded cases

- **WHEN** the runner is invoked with explicit live execution enabled and a valid fixture
- **THEN** it executes no more than the configured case limit through the real Reader AI service path and records provider/model labels, source counts, first-output latency, pass/fail labels, and safe trace metadata

### Requirement: Live fixture runner writes metadata-only eval artifacts

The system SHALL write only metadata-only eval artifacts from live fixture runs.

#### Scenario: Successful live fixture run writes envelope and report artifacts

- **WHEN** a live fixture run completes and report validation succeeds
- **THEN** the runner writes a reportable eval envelope and optional sanitized JSON/Markdown report outputs using the existing eval report shape

#### Scenario: Live fixture run failure remains metadata-only

- **WHEN** the real Reader AI stream throws, times out, or is aborted
- **THEN** the runner records safe failure labels and trace metadata without writing raw exception messages, answer text, prompt text, source previews, book identity, API keys, or local paths
```

## openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-service-eval-runner/spec.md

- Source: openspec/changes/reader-ai-live-fixture-eval-runner/specs/reader-ai-service-eval-runner/spec.md
- Lines: 1-15
- SHA256: 3f8c93202e5be783645bb8383858599b19b71dbb57c8c37817782bcae3c5db0c

```md
## ADDED Requirements

### Requirement: Service eval runner supports explicit live streamer callers

The system SHALL allow an external local runner to explicitly pass the real Reader AI answer streamer into the service eval runner without weakening the service eval runner privacy boundary.

#### Scenario: Explicit real streamer injection uses existing service contract

- **WHEN** a local live fixture runner passes the real Reader AI answer streamer as the injected `streamAnswer` dependency
- **THEN** the service eval runner invokes it through the same controlled `StreamReaderAIAnswerOptions` contract used by fake streamers

#### Scenario: Service eval output remains metadata-only for live callers

- **WHEN** the service eval runner is used by a live fixture caller
- **THEN** it still returns only eval cases, eval results, and sanitized trace-like metadata without raw answer text, source text, prompts, book titles, author names, book hashes, local paths, URLs, API keys, or stable private identifiers
```
