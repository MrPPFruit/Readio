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
