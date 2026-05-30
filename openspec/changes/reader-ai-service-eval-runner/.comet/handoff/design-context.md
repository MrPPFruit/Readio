# Comet Design Handoff

- Change: reader-ai-service-eval-runner
- Phase: design
- Mode: compact
- Context hash: f98a6af0232cbc0778724278695821d41bd2b01ccbccdc7c134897b9f1173c95

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-service-eval-runner/proposal.md

- Source: openspec/changes/reader-ai-service-eval-runner/proposal.md
- Lines: 1-30
- SHA256: f57c72ea2926806a392b57eab668577615b9676dda3a73a449070054ef910ba9

```md
## Why

Reader AI now has metadata-only eval schemas, report helpers, and a local report CLI, but there is still no deterministic way to exercise the Reader AI service path and convert one or more service runs into the same reportable eval envelope. A service-level eval runner will let us measure retrieval, citation, insufficiency, and latency behavior with controlled fixtures before using real books or live provider calls.

## What Changes

- Add a local service-level eval runner that executes Reader AI eval cases through an injectable Reader AI answer stream function and records metadata-only eval results.
- Support controlled fixture inputs with book/session metadata, current page, spoiler mode, and ordinary-reader QA cases.
- Collect emitted sources, output timing, final answer metadata, and existing `reader_ai.trace`-style events without persisting raw book text, prompts, answer text, source text, API keys, local paths, or stable private identifiers.
- Produce a metadata envelope compatible with the existing `buildReaderAIEvalReportRun` and `reader-ai:report` CLI.
- Keep the first slice local and deterministic: fake model/fake retrieval tests first, no default live provider calls, no real book loading, no UI changes, no NotebookLM automation, and no LLM-as-judge.

## Capabilities

### New Capabilities

- `reader-ai-service-eval-runner`: Local service-level eval harness that turns controlled Reader AI answer runs into metadata-only eval result envelopes.

### Modified Capabilities

- `reader-ai-eval-report-runner`: Accept service-level runner envelopes without weakening the existing privacy and deterministic report contract.

## Impact

- Affected code areas:
  - `apps/readest-app/src/services/ai/eval/`
  - focused Reader AI eval tests under `apps/readest-app/src/__tests__/ai/`
  - eval documentation under `apps/readest-app/src/services/ai/eval/README.md`
  - OpenSpec specs under `openspec/specs/`
- No app UI, mobile WebView behavior, model provider defaults, database migration, remote telemetry, release version, APK build, or NotebookLM automation expected.
```

## openspec/changes/reader-ai-service-eval-runner/design.md

- Source: openspec/changes/reader-ai-service-eval-runner/design.md
- Lines: 1-105
- SHA256: d7c5eadf7e81e0e2889eae26e2c392c2b1cd556c4ff28331497c44fd748698c3

[TRUNCATED]

````md
## Context

The current Reader AI eval stack has three local layers:

```text
metadata schema + validators
  └─ report runner: buildReaderAIEvalReportRun(input)
      └─ CLI wrapper: reader-ai:report --input ... --json-out ... --markdown-out ...
```
````

This is enough to summarize manually recorded eval metadata, but it does not run the Reader AI service path. The service path currently lives in `streamReaderAIAnswer`, which performs classification, retrieval, source construction, model streaming, citation validation, citation repair, and insufficient-answer fallback while logging `reader_ai.trace` events.

The next useful layer is not a real-book batch runner yet. It is a service-level harness adapter that can execute eval cases through an injected answer-stream function and turn each run into the same metadata envelope consumed by the existing report runner.

## Goals / Non-Goals

**Goals:**

- Add a local service-level eval runner that accepts eval cases plus controlled Reader AI run context.
- Run each case through an injectable Reader AI answer stream function compatible with `streamReaderAIAnswer`.
- Capture metadata-only result records: `caseId`, `runId`, `classificationIntent`, `sourceCount`, `citationValid`, `insufficientAnswer`, `firstOutputMs`, pass/fail, reasons, provider/model labels, spoiler mode, and over-budget stage.
- Capture privacy-safe trace-like events supplied by the harness and include them in the output envelope.
- Return an envelope compatible with `buildReaderAIEvalReportRun` and the existing local CLI.
- Keep unit tests deterministic with fake streamers, fake sources, and fake timing.

**Non-Goals:**

- No live model/provider call by default.
- No real book loading, EPUB parsing, indexing job, or local library scanning.
- No UI/WebView changes.
- No NotebookLM automation and no LLM-as-judge.
- No remote telemetry upload.
- No raw answer/source/prompt persistence in eval output.
- No package CLI in this slice unless the implementation plan later proves it is necessary; the current CLI can already render the envelope.

## Decisions

### Decision 1: Build a pure service eval runner, not a new CLI first

Create a module under `apps/readest-app/src/services/ai/eval/` that exposes a function such as `runReaderAIServiceEval(input, deps)`. The function returns a metadata envelope:

```text
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
}
```

Rationale: the previous change already added file I/O and Markdown/JSON output. This layer should focus on converting controlled service runs into reportable metadata.

Alternatives considered:

- **Add another CLI now**: convenient, but mixes service harness design with file orchestration.
- **Run real books directly**: useful later, but too much scope before the service harness contract is stable.

### Decision 2: Use dependency injection for the answer stream

The runner should accept an injected streamer compatible with the core `streamReaderAIAnswer` inputs and outputs. Tests can inject a fake streamer; future callers can pass the real function explicitly.

The runner-owned callback wiring should collect:

- emitted text chunks to detect whether an insufficient-answer fallback was returned;
- `onSources` calls to count sources;
- elapsed time to first yielded output;
- trace events supplied through an injected trace collector or safe test hook.

Rationale: this keeps the module deterministic, testable, and local-only while still matching the production service contract.

### Decision 3: Keep scoring rule-based and metadata-only

Initial pass/fail should be based on deterministic metadata and per-case expectations, not LLM judging. The minimum rule set:

- no output or known insufficient-answer fallback → fail unless the case expects insufficient evidence;
- required citations with zero sources or citation-invalid metadata → fail;
- otherwise pass with reasons based on objective metadata.

Rationale: the user wants data to locate latency/retrieval/citation failures, not another unconstrained model judging answers.

### Decision 4: Do not store raw answer text

````

Full source: openspec/changes/reader-ai-service-eval-runner/design.md

## openspec/changes/reader-ai-service-eval-runner/tasks.md

- Source: openspec/changes/reader-ai-service-eval-runner/tasks.md
- Lines: 1-24
- SHA256: 533eefc5265546f83c9e746cd0bc829d0760a5593c4c0cb0747c60a606508eca

```md
## 1. Service Eval Runner Contract

- [ ] 1.1 Add focused tests for a service eval runner that invokes an injected answer stream with controlled Reader AI context.
- [ ] 1.2 Define the service eval input, per-case run context, injected streamer, and metadata-only output envelope types.
- [ ] 1.3 Ensure deterministic run ids are assigned per case when explicit run ids are not provided.

## 2. Metadata Result Collection

- [ ] 2.1 Collect emitted sources, first-output latency, provider/model labels, spoiler mode, and safe trace-like metadata during each run.
- [ ] 2.2 Produce `ReaderAIEvalResult` records with objective pass/fail reasons for successful, insufficient, failed, and aborted runs.
- [ ] 2.3 Reject or omit raw answer text, source text, prompts, book titles, author names, book hashes, URLs, local paths, API keys, and stable private identifiers from returned output.

## 3. Report Compatibility and Documentation

- [ ] 3.1 Add tests proving the service eval output can be passed to `buildReaderAIEvalReportRun`.
- [ ] 3.2 Add tests proving unsafe service-runner envelope fields are rejected or omitted by existing report privacy rules.
- [ ] 3.3 Document the service eval runner scope, fake-streamer testing path, and out-of-scope real-book/live-provider automation in the eval README.

## 4. Verification and Handoff

- [ ] 4.1 Run focused service eval/report tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with service eval runner scope, validation evidence, and deferred follow-ups.
````

## openspec/changes/reader-ai-service-eval-runner/specs/reader-ai-eval-report-runner/spec.md

- Source: openspec/changes/reader-ai-service-eval-runner/specs/reader-ai-eval-report-runner/spec.md
- Lines: 1-15
- SHA256: 9eca75df5fb72cf17fbbef4d5ee1110c2cd1ae20f1d69d0481db6a0993d44d93

```md
## ADDED Requirements

### Requirement: Report runner accepts service eval envelopes

The system SHALL allow service-level Reader AI eval runner envelopes to be passed into the existing metadata-only report runner without changing the report privacy contract.

#### Scenario: Service eval envelope is reportable

- **WHEN** the service eval runner returns an envelope with eval cases, eval results, and trace-like metadata
- **THEN** `buildReaderAIEvalReportRun` accepts the envelope and produces deterministic JSON and Markdown reports using the existing report shape

#### Scenario: Unsafe service eval fields are rejected

- **WHEN** a service eval envelope includes raw answer text, source text, prompt text, local paths, URLs, credentials, book hashes, or stable private book identifiers
- **THEN** the report runner rejects the envelope or omits unsafe trace fields according to the existing eval privacy rules
```

## openspec/changes/reader-ai-service-eval-runner/specs/reader-ai-service-eval-runner/spec.md

- Source: openspec/changes/reader-ai-service-eval-runner/specs/reader-ai-service-eval-runner/spec.md
- Lines: 1-43
- SHA256: 0ed55e9ab496a31aec8084a7b498623758b5eafd1376f21940620ad7fce4b78e

```md
## ADDED Requirements

### Requirement: Service eval runner executes controlled Reader AI cases

The system SHALL provide a local service-level eval runner that executes Reader AI eval cases through an explicitly provided answer stream function and controlled run context.

#### Scenario: Case run invokes injected answer stream

- **WHEN** the service eval runner receives a valid eval case, Reader AI settings, book/session metadata, and an injected answer stream function
- **THEN** it invokes the injected stream function with the case question and controlled Reader AI context without loading books, scanning the library, or calling providers on its own

#### Scenario: Multiple cases produce stable run identifiers

- **WHEN** the service eval runner executes multiple eval cases
- **THEN** each case result receives a deterministic run identifier derived from the case id and run order unless an explicit run id is provided

### Requirement: Service eval runner produces metadata-only result envelopes

The system SHALL convert service-level Reader AI runs into metadata-only eval result envelopes compatible with the existing report runner.

#### Scenario: Successful run records objective metadata

- **WHEN** an injected answer stream yields output and emits sources
- **THEN** the runner records safe result metadata including case id, run id, classification intent label, source count, citation validity label, insufficient-answer flag, first-output latency, pass/fail, reasons, provider/model labels, spoiler mode, and over-budget stage

#### Scenario: Failed run records safe failure metadata

- **WHEN** an injected answer stream throws or is aborted
- **THEN** the runner records a failed metadata result with a safe reason label and does not include raw exception messages that may contain private content

### Requirement: Service eval runner preserves privacy boundaries

The system MUST NOT include raw answer text, source text, prompt text, book title, author name, book hash, local paths, URLs, API keys, or stable private identifiers in service eval output.

#### Scenario: Output envelope excludes raw service content

- **WHEN** the service eval runner returns cases, results, and trace-like metadata
- **THEN** the returned envelope contains only metadata fields accepted by the Reader AI eval validators and no raw service content

#### Scenario: Trace collection remains metadata-only

- **WHEN** trace-like events are included in the service eval output
- **THEN** they include only privacy-safe trace metadata such as run id, stage, action, status, durations, counts, over-budget stage, and recovery hints
```
