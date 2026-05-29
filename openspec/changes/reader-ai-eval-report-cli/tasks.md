## 1. CLI Contract and Usage Validation

- [x] 1.1 Add a focused script entry under `apps/readest-app/scripts/` for Reader AI eval report generation.
- [x] 1.2 Parse explicit `--input`, `--json-out`, and `--markdown-out` arguments with deterministic usage errors for missing values or unknown flags.
- [x] 1.3 Add tests proving missing required file arguments exit non-zero and do not write outputs.

## 2. File-Based Report Generation

- [x] 2.1 Read and parse the input JSON envelope as `unknown` and report deterministic errors for invalid JSON or unreadable input.
- [x] 2.2 Delegate validation and report generation to `buildReaderAIEvalReportRun` without duplicating eval scoring or trace aggregation logic.
- [x] 2.3 Write only sanitized `ReaderAIEvalReport` JSON and deterministic Markdown outputs after successful validation.
- [x] 2.4 Add tests proving valid input writes both files and invalid/unsafe input writes no partial artifacts.

## 3. Package Script and Documentation

- [x] 3.1 Add a package script for invoking the local report CLI from `apps/readest-app`.
- [x] 3.2 Document CLI usage, output shape, and scope boundaries in the eval README.
- [x] 3.3 Keep model execution, real book loading, NotebookLM automation, telemetry, and UI/runtime behavior explicitly out of scope.

## 4. Verification and Handoff

- [x] 4.1 Run focused Reader AI eval/report CLI tests.
- [x] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.3 Run `pnpm --dir apps/readest-app test`.
- [x] 4.4 Update `HANDOFF.md` with CLI wrapper scope, validation evidence, and deferred follow-ups.
