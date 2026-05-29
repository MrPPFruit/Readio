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
