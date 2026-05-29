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
