# Comet Design Handoff

- Change: reader-ai-eval-report-cli
- Phase: design
- Mode: compact
- Context hash: eee2eee0c5aafc78cc665eb82af9a298cffd5afaf877b334439c8c3cede97c38

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/reader-ai-eval-report-cli/proposal.md

- Source: openspec/changes/reader-ai-eval-report-cli/proposal.md
- Lines: 1-31
- SHA256: 6696ea1fedf99f9ef9c72d63804405354c6758bb616592b05fd5717f105d8c7c

```md
## Why

Reader AI eval reporting now has pure metadata-only report helpers, but there is no repeatable command entry point for turning local JSON envelopes into durable JSON and Markdown files. A thin local CLI wrapper makes the report runner usable in manual quality work and later CI artifact generation without expanding scope into model execution.

## What Changes

- Add a local Node/tsx command wrapper that reads one JSON envelope file containing `cases`, `results`, and optional `traces`.
- Invoke the existing pure `buildReaderAIEvalReportRun` helper and write deterministic JSON and Markdown outputs when validation succeeds.
- Return deterministic non-zero failures for invalid JSON, invalid envelopes, unsafe case/result fields, missing input, or missing output targets.
- Add a package script for the local report CLI and focused tests for file I/O behavior.
- Keep the wrapper local-only and non-invasive: no model calls, no real book loading, no indexing, no UI changes, no prompt/retrieval/citation behavior changes, no NotebookLM automation, and no telemetry upload.

## Capabilities

### New Capabilities

- `reader-ai-eval-report-cli`: Local command wrapper for metadata-only Reader AI eval JSON input and JSON/Markdown report output.

### Modified Capabilities

- `reader-ai-eval-report-runner`: Expose the existing pure report runner through a local file-based command while preserving the deterministic metadata-only privacy boundary.

## Impact

- Affected code areas:
  - `apps/readest-app/scripts/`
  - `apps/readest-app/package.json`
  - focused tests under `apps/readest-app/src/__tests__/ai/`
  - eval docs under `apps/readest-app/src/services/ai/eval/README.md`
  - OpenSpec specs under `openspec/specs/`
- No new runtime service, app UI, mobile WebView behavior, model provider integration, database migration, remote telemetry, or external dependency expected.
```

## openspec/changes/reader-ai-eval-report-cli/design.md

- Source: openspec/changes/reader-ai-eval-report-cli/design.md
- Lines: 1-77
- SHA256: f573d4ab18cfe70698087fed60f86898ef3626bd302bef3cf4d86a53606dbf2f

````md
## Context

`reader-ai-eval-report-runner` established a pure local helper that accepts parsed unknown JSON-like input and returns deterministic `ReaderAIEvalReport` JSON plus Markdown. It intentionally avoided file I/O and package scripts. The next useful layer is a minimal command wrapper so local quality work can turn exported/handwritten metadata envelopes into durable files without writing ad hoc glue each time.

## Goals / Non-Goals

**Goals:**

- Add a thin Node/tsx command that reads one local JSON envelope file and calls the existing pure report runner.
- Support deterministic output files for JSON report data and Markdown report text.
- Fail with stable non-zero exit behavior and concise validation issues for bad CLI usage, invalid JSON, invalid envelope shape, or unsafe case/result fields.
- Keep implementation testable without spawning model calls, loading real books, or touching app runtime behavior.

**Non-Goals:**

- No model/provider calls and no `streamReaderAIAnswer` execution.
- No real book loading, indexing, retrieval, citation repair, or answer generation.
- No UI/WebView changes.
- No NotebookLM automation and no LLM-as-judge.
- No remote telemetry or network uploads.
- No broad CLI framework or new external dependency.

## Decisions

### Decision 1: Put the wrapper in `apps/readest-app/scripts/`

The command should live beside existing project-local scripts and be invoked via a package script such as `reader-ai:report`. It should be outside app runtime bundles and depend only on Node built-ins plus the eval helper.

Alternatives considered:

- **Runtime route/API endpoint**: easier to call from the browser, but adds app surface area and privacy/security questions.
- **Root workspace script**: possible later, but the eval helper and tests live inside `apps/readest-app`, so the app package is the smallest boundary.

### Decision 2: Keep arguments explicit and minimal

Use flags rather than positional magic:

```text
--input <path> --json-out <path> --markdown-out <path>
```
````

All three are required for the first implementation. This avoids ambiguity about stdout/stderr, partial output, and CI artifact paths.

Alternatives considered:

- **Print Markdown to stdout**: convenient, but easier to mix errors and report content.
- **Optional outputs**: more flexible, but creates extra branches before the workflow is proven.

### Decision 3: Keep JSON output to the sanitized report object

On success, `--json-out` should contain `ReaderAIEvalReport`, not the full runner union, so the artifact is directly diffable and never includes validation issues or raw input. `--markdown-out` should contain the existing deterministic Markdown string.

On failure, do not write partial outputs. Print deterministic issue lines to stderr and exit non-zero.

### Decision 4: Test file I/O through a focused Vitest test

Expose a small command function that accepts argv plus injected `readFile`/`writeFile` hooks, or use a temp directory test around the script entry. This keeps tests deterministic without shelling out through pnpm for every case.

## Risks / Trade-offs

- **Risk: accidental raw input leak through output files** → Mitigation: write only `output.report` and `output.markdown` from the existing sanitized runner result.
- **Risk: CLI grows into eval execution** → Mitigation: document hard non-goals and keep this change to file wrapping only.
- **Risk: brittle path aliases in Node script** → Mitigation: run through `tsx` from the app package so TypeScript and existing path resolution behavior are available.
- **Risk: partial artifacts after validation failure** → Mitigation: validate and build report before writing either output file.

## Migration Plan

1. Add the script module and package script.
2. Add focused tests using temporary files or injected file operations.
3. Document command usage in the eval README.
4. Validate with focused tests, lint, and relevant OpenSpec checks.

Rollback: remove the script, package script, focused tests, and README section. The pure report runner remains unchanged.

## Open Questions

- None for this slice. Future work can decide whether to support stdout output, multiple input files, CI snapshot comparisons, or service-level eval execution.

````

## openspec/changes/reader-ai-eval-report-cli/tasks.md

- Source: openspec/changes/reader-ai-eval-report-cli/tasks.md
- Lines: 1-25
- SHA256: c89a4ddb70f95a8f6b814a297a851a2e1c56c4c1d279eabdd43a489f298f17a1

```md
## 1. CLI Contract and Usage Validation

- [ ] 1.1 Add a focused script entry under `apps/readest-app/scripts/` for Reader AI eval report generation.
- [ ] 1.2 Parse explicit `--input`, `--json-out`, and `--markdown-out` arguments with deterministic usage errors for missing values or unknown flags.
- [ ] 1.3 Add tests proving missing required file arguments exit non-zero and do not write outputs.

## 2. File-Based Report Generation

- [ ] 2.1 Read and parse the input JSON envelope as `unknown` and report deterministic errors for invalid JSON or unreadable input.
- [ ] 2.2 Delegate validation and report generation to `buildReaderAIEvalReportRun` without duplicating eval scoring or trace aggregation logic.
- [ ] 2.3 Write only sanitized `ReaderAIEvalReport` JSON and deterministic Markdown outputs after successful validation.
- [ ] 2.4 Add tests proving valid input writes both files and invalid/unsafe input writes no partial artifacts.

## 3. Package Script and Documentation

- [ ] 3.1 Add a package script for invoking the local report CLI from `apps/readest-app`.
- [ ] 3.2 Document CLI usage, output shape, and scope boundaries in the eval README.
- [ ] 3.3 Keep model execution, real book loading, NotebookLM automation, telemetry, and UI/runtime behavior explicitly out of scope.

## 4. Verification and Handoff

- [ ] 4.1 Run focused Reader AI eval/report CLI tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with CLI wrapper scope, validation evidence, and deferred follow-ups.
````

## openspec/changes/reader-ai-eval-report-cli/specs/reader-ai-eval-report-cli/spec.md

- Source: openspec/changes/reader-ai-eval-report-cli/specs/reader-ai-eval-report-cli/spec.md
- Lines: 1-38
- SHA256: 8239ae1e22982030c30e458f8bc3b5ba0ec28a8c30786fee6b856fd1244db91b

```md
## ADDED Requirements

### Requirement: Local report CLI accepts explicit file paths

The system SHALL provide a local command wrapper that accepts explicit input, JSON output, and Markdown output file paths for Reader AI eval reports.

#### Scenario: Required file arguments are provided

- **WHEN** the local report CLI is invoked with `--input`, `--json-out`, and `--markdown-out` paths
- **THEN** the command reads the input path and prepares to write both output paths after validation succeeds

#### Scenario: Required file arguments are missing

- **WHEN** the local report CLI is invoked without one or more required file path arguments
- **THEN** the command exits non-zero with deterministic usage issues and does not write report outputs

### Requirement: Local report CLI writes deterministic artifacts

The system SHALL write deterministic metadata-only JSON and Markdown report files from a valid local Reader AI eval report envelope.

#### Scenario: Valid input produces both report files

- **WHEN** the local report CLI receives a valid JSON envelope containing eval cases, eval results, and optional trace-like metadata
- **THEN** it writes the sanitized `ReaderAIEvalReport` JSON to the JSON output path and deterministic Markdown to the Markdown output path

#### Scenario: Invalid input produces no partial report files

- **WHEN** the input file is invalid JSON, has invalid envelope fields, or contains unsafe case/result metadata
- **THEN** the command exits non-zero, reports deterministic issues, and does not write partial JSON or Markdown report files

### Requirement: Local report CLI remains non-invasive

The system SHALL keep the CLI wrapper local-only and MUST NOT execute Reader AI answers, load books, call model providers, alter app runtime behavior, or upload telemetry.

#### Scenario: CLI uses existing metadata only

- **WHEN** the local report CLI generates a report
- **THEN** it uses only the provided local metadata envelope and the existing pure report runner without invoking answer generation, indexing, retrieval, UI rendering, NotebookLM automation, or remote telemetry
```

## openspec/changes/reader-ai-eval-report-cli/specs/reader-ai-eval-report-runner/spec.md

- Source: openspec/changes/reader-ai-eval-report-cli/specs/reader-ai-eval-report-runner/spec.md
- Lines: 1-15
- SHA256: b48ea7bcbfdb7c27033a94d8820837694e93f75b6ce3d7e623e4c61b8083a786

```md
## ADDED Requirements

### Requirement: Report runner supports file-based local command wrapping

The system SHALL allow the existing pure Reader AI eval report runner to be used by a local file-based command without changing the runner privacy contract or report shape.

#### Scenario: CLI wrapper delegates report generation

- **WHEN** the local CLI wrapper reads a parsed metadata envelope from disk
- **THEN** it delegates validation and report generation to the existing pure report runner rather than duplicating case validation, result validation, trace aggregation, or report summary rules

#### Scenario: CLI wrapper preserves sanitized output boundary

- **WHEN** the local CLI wrapper writes report artifacts
- **THEN** it writes only the sanitized `ReaderAIEvalReport` JSON and deterministic Markdown returned by the report runner, without copying raw input records into outputs
```
