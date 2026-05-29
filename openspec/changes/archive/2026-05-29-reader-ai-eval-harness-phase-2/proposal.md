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
