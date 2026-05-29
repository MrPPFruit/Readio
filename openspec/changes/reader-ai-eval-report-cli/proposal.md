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
