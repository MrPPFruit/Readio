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
