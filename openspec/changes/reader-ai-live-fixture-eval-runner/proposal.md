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
