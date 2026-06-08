# Comet Design Handoff

- Change: reader-ai-live-fixture-quality-baseline
- Phase: design
- Mode: compact
- Context hash: bb69319b99e901714c939fe54c02c2eac1ab4b73de813df4fa7a448483425603

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-live-fixture-quality-baseline/proposal.md

- Source: openspec/changes/reader-ai-live-fixture-quality-baseline/proposal.md
- Lines: 1-35
- SHA256: 14a79f690f64fe3b2b44c243690aecc88cec0603cb714e5eb8d18e901b33f290

```md
## Why

The live fixture runner can now execute real Reader AI service paths safely, but the project still lacks a repeatable metadata-only quality baseline for ordinary reader questions before retrieval, citation, or answer synthesis tuning. Establishing a small local baseline now prevents tuning by anecdote and keeps real-book evaluation evidence inside the existing privacy boundary.

## What Changes

- Add a local-only quality baseline workflow for running a bounded set of Reader AI live fixture cases and summarizing objective metadata labels.
- Define baseline result metadata that can compare runs without storing raw answers, prompts, source text, runtime paths, API keys, book hashes, or stable private identifiers.
- Add deterministic validation/reporting around baseline coverage, case categories, provider/model labels, source counts, latency labels, failure labels, and optional manual observation labels.
- Keep NotebookLM comparison manual and non-authoritative; do not automate NotebookLM, copy answer text, or use LLM-as-judge scoring.
- Do not change Reader AI UI/runtime behavior for normal app usage.
- Do not tune Reader AI retrieval, citation, or answer synthesis quality in this change.

## Capabilities

### New Capabilities

- `reader-ai-live-fixture-quality-baseline`: Local-only metadata baseline workflow for summarizing bounded Reader AI live fixture quality evidence.

### Modified Capabilities

- `reader-ai-live-fixture-eval-runner`: Live fixture outputs can be consumed by the quality baseline workflow while preserving guarded execution and metadata-only artifacts.

## Impact

- Affected code:
  - Reader AI eval/report services under `apps/readest-app/src/services/ai/eval/`
  - Reader AI eval CLI scripts under `apps/readest-app/scripts/`
  - focused Reader AI eval tests
  - eval README / local workflow documentation
- Systems:
  - local-only eval CLI path
  - Reader AI service eval harness/reporting
  - OpenSpec Reader AI eval specs
- No production UI changes, no normal app runtime behavior changes, no NotebookLM automation, no LLM-as-judge, no committed real-book fixture artifacts, and no answer-quality tuning.
```

## openspec/changes/reader-ai-live-fixture-quality-baseline/design.md

- Source: openspec/changes/reader-ai-live-fixture-quality-baseline/design.md
- Lines: 1-76
- SHA256: 55f2b19716a02415810087b4fc8d89c4ef09caf51faab4ff494b641e2b54a37d

````md
## Context

The Reader AI eval foundation already has sanitized eval cases/results, a pure report runner, a dependency-injected service eval runner, and a guarded live fixture runner with runtime-only provider/retrieval inputs. The missing layer is a local baseline workflow that turns one or more live fixture envelopes into a repeatable quality snapshot without adding UI, provider automation beyond the existing live runner, or raw answer/source storage.

This change sits above the existing live fixture runner:

```text
local runtime files + fixture
        │
        ▼
reader-ai:live-fixture  ──▶ metadata-only envelope/report
        │                         │
        └──────── existing guarded execution ───────┐
                                                     ▼
                              quality baseline summarizer
                                                     │
                                                     ▼
                              metadata-only baseline JSON/Markdown
```
````

## Goals / Non-Goals

**Goals:**

- Produce a deterministic local quality baseline from existing metadata-only live fixture envelopes/reports.
- Summarize ordinary-reader QA quality by category, provider/model label, source-count buckets, latency buckets, pass/fail reasons, and manual observation labels.
- Validate that baseline inputs and outputs stay metadata-only and fail closed on unsafe fields.
- Support optional manual NotebookLM/human observation labels already represented in eval result metadata, without treating them as authoritative scoring.
- Document a local workflow for preparing, running, reviewing, and discarding or explicitly reviewing generated artifacts.

**Non-Goals:**

- No Reader AI UI changes.
- No normal app runtime behavior changes.
- No retrieval, citation, or answer synthesis tuning.
- No NotebookLM automation.
- No LLM-as-judge scoring.
- No fixture discovery over a user library.
- No committed real-book text, raw answers, prompts, source previews, local paths, API keys, URLs, book hashes, or stable private identifiers.

## Decisions

### Decision: Build baseline as a pure metadata summarizer

The baseline layer should accept existing eval envelopes/reports and produce derived counts/labels only. It should not call `streamReaderAIAnswer`, read runtime provider settings, prepare retrieval seeds, or inspect raw answers.

- Chosen: pure summarizer over sanitized envelope/report metadata.
- Rejected: extend the live fixture runner to own baseline scoring directly, because that couples provider execution with quality analysis and increases privacy/cost blast radius.

### Decision: Keep deterministic labels, not semantic grading

The baseline should summarize objective metadata already available: case category, pass/fail, reasons, citation validity, source count, first output latency, over-budget stage, provider/model labels, and optional manual observation labels.

- Chosen: deterministic aggregation and label buckets.
- Rejected: LLM-as-judge or NotebookLM oracle scoring, because this would introduce non-determinism, additional provider cost, and raw answer handling pressure.

### Decision: Preserve manual benchmark as non-authoritative metadata

Manual NotebookLM/human observations can appear as short labels in `manualBenchmark.observations`, but they must not change deterministic pass/fail or require copied answer text.

- Chosen: count observation labels separately.
- Rejected: compute direct Readio-vs-NotebookLM win/loss from copied answers, because it violates the current privacy model and conflates whole-book comparison with read-so-far behavior.

### Decision: Add a local CLI only if needed by tests/tasks

The implementation can expose a pure baseline builder first, then add a small local file CLI if that is the minimal path to make the workflow usable from generated live fixture artifacts.

- Chosen: pure core with optional CLI wrapper.
- Rejected: UI surface or persistent app feature, because baseline is a developer workflow.

## Risks / Trade-offs

- **Risk: Baseline appears like final answer quality scoring** → Mitigation: name/report it as a baseline snapshot and clearly separate deterministic metadata from manual observations.
- **Risk: Raw answer/source content leaks into baseline artifacts** → Mitigation: reuse unsafe-field validation and add focused privacy tests for baseline outputs.
- **Risk: Baseline overfits to one small fixture** → Mitigation: report coverage counts by category/language/provider/model and avoid global quality claims when coverage is small.
- **Risk: Workflow creates local files that look committable** → Mitigation: README guidance and tests that generated outputs are metadata-only; explicitly warn that generated artifacts need review before commit.

````

## openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md

- Source: openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md
- Lines: 1-17
- SHA256: df3bea57d45a70abbbb66da59a3a3c5c96f173f7cdaf86948d51ae7bb6a3efa9

```md
## 1. Baseline Metadata Contract

- [ ] 1.1 Add failing tests for building a quality baseline summary from valid metadata-only eval envelopes.
- [ ] 1.2 Add failing tests for rejecting unsafe baseline input fields and preventing partial artifact writes.
- [ ] 1.3 Implement baseline metadata validation and deterministic aggregation by category, language, provider/model label, pass/fail, reason, citation, source-count bucket, latency bucket, and over-budget stage.

## 2. Baseline Runner and CLI Workflow

- [ ] 2.1 Add failing tests for a local baseline runner or CLI wrapper that reads sanitized eval artifacts and writes JSON/Markdown outputs.
- [ ] 2.2 Implement the minimal local baseline runner or CLI wrapper without calling providers, reading runtime settings, preparing retrieval, automating NotebookLM, or changing UI/runtime app behavior.
- [ ] 2.3 Ensure invalid input, unsafe metadata, and output write failures fail closed without partial baseline artifacts.

## 3. Manual Observation and Documentation

- [ ] 3.1 Add tests proving manual NotebookLM/human observation labels are reported separately and do not affect deterministic pass/fail totals.
- [ ] 3.2 Update eval README with the quality baseline workflow, privacy boundaries, and guidance that generated artifacts require review before commit.
- [ ] 3.3 Run focused eval tests, lint, full app test suite, and `openspec validate --all --strict`.
````

## openspec/changes/reader-ai-live-fixture-quality-baseline/specs/reader-ai-live-fixture-eval-runner/spec.md

- Source: openspec/changes/reader-ai-live-fixture-quality-baseline/specs/reader-ai-live-fixture-eval-runner/spec.md
- Lines: 1-15
- SHA256: 77c04a53a333dd9a66438fa296f94adcfcd8b10d3b26cde9d3025145509f3563

```md
## ADDED Requirements

### Requirement: Live fixture artifacts can feed quality baseline workflows

The system SHALL keep live fixture eval outputs compatible with local quality baseline workflows while preserving guarded execution and metadata-only artifacts.

#### Scenario: Successful live fixture output is baseline-compatible

- **WHEN** a guarded live fixture run completes and writes a sanitized eval envelope or report
- **THEN** the output contains the case/result/trace metadata needed by the local quality baseline workflow without requiring raw answer text, source text, prompts, provider secrets, runtime file paths, book hashes, or stable private identifiers

#### Scenario: Failed live fixture output remains safe for baseline validation

- **WHEN** a guarded live fixture run fails before or during provider execution
- **THEN** any reported failure metadata uses safe deterministic labels that the quality baseline workflow can validate or reject without exposing raw exception messages, raw answers, source previews, runtime paths, API keys, URLs, book hashes, or stable private identifiers
```

## openspec/changes/reader-ai-live-fixture-quality-baseline/specs/reader-ai-live-fixture-quality-baseline/spec.md

- Source: openspec/changes/reader-ai-live-fixture-quality-baseline/specs/reader-ai-live-fixture-quality-baseline/spec.md
- Lines: 1-43
- SHA256: 8b930315a02f6476484a9682318b938c618252d5ab816286ee3aa76e0c23f65c

```md
## ADDED Requirements

### Requirement: Quality baseline summarizes live fixture metadata

The system SHALL provide a local-only Reader AI quality baseline workflow that summarizes one or more metadata-only live fixture eval envelopes without calling model providers or reading raw book content.

#### Scenario: Baseline summarizes ordinary-reader QA coverage

- **WHEN** the baseline workflow receives valid live fixture eval metadata containing cases and results
- **THEN** it reports coverage counts by ordinary-reader QA category, language, provider label, model label, pass/fail label, failure reason label, citation-valid label, source-count bucket, and first-output latency bucket

#### Scenario: Baseline rejects invalid eval metadata

- **WHEN** the baseline workflow receives missing, malformed, or internally inconsistent case/result metadata
- **THEN** it fails closed with deterministic validation issues and writes no partial baseline artifact

### Requirement: Quality baseline preserves metadata-only artifacts

The system MUST keep quality baseline inputs and generated artifacts free of raw private or provider data.

#### Scenario: Unsafe baseline content is rejected

- **WHEN** baseline input metadata contains raw answer text, raw source text, prompt text, API keys, custom base URLs, local paths, URLs, book hashes, stable private identifiers, or raw exception details
- **THEN** the baseline workflow rejects the input with deterministic validation issues and writes no partial baseline artifact

#### Scenario: Baseline output contains only safe labels and counts

- **WHEN** the baseline workflow writes JSON or Markdown output
- **THEN** the output contains only safe labels, counts, buckets, aggregate timings, and non-authoritative manual observation labels, without raw answers, prompts, source previews, runtime paths, API keys, URLs, book hashes, or stable private identifiers

### Requirement: Quality baseline treats manual comparisons as non-authoritative observations

The system SHALL support manual NotebookLM or human comparison observations only as short non-authoritative metadata labels.

#### Scenario: Manual observations do not affect deterministic scoring

- **WHEN** baseline input includes manual NotebookLM or human observation labels
- **THEN** the baseline workflow reports observation-label counts separately and does not use them to alter deterministic pass/fail totals

#### Scenario: Manual comparison text is not accepted

- **WHEN** baseline input attempts to include copied NotebookLM output, copied Readio answer text, or other raw comparison text
- **THEN** the baseline workflow rejects the input as unsafe metadata
```
