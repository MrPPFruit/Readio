## Why

The current live fixture runner is a privacy-safe execution skeleton, but it cannot yet produce a meaningful real Reader AI quality report from a local Node CLI because provider credentials and indexed retrieval context are not supplied through a safe runtime-only bridge. This blocks the next step: running a small real-book fixture to collect objective metadata before tuning retrieval, citation, or answer synthesis.

## What Changes

- Add a runtime-only bridge for local live fixture execution that supplies provider credentials and retrieval context without committing secrets or raw book text.
- Keep the existing double opt-in live gates (`--live` and fixture `live: true`).
- Allow local fixtures to reference runtime-only environment/provider configuration and seeded eval chunks needed for a bounded smoke run.
- Preserve metadata-only output: no raw answer text, source text, prompt text, local paths, URLs, API keys, book hashes, or stable private identifiers in generated eval artifacts.
- Do not change Reader AI UI/runtime behavior for normal app usage.

## Capabilities

### New Capabilities

- `reader-ai-live-fixture-runtime-bridge`: Runtime-only local bridge for live fixture execution inputs, provider credentials, and seeded retrieval context.

### Modified Capabilities

- `reader-ai-live-fixture-eval-runner`: Live fixture runner can use the runtime bridge while preserving live execution gates and metadata-only artifacts.

## Impact

- Affected code:
  - `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
  - `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
  - `apps/readest-app/src/services/ai/eval/README.md`
  - focused Reader AI eval tests
- Systems:
  - local-only eval CLI path
  - Reader AI service eval harness
  - OpenSpec Reader AI eval specs
- No production UI changes, no NotebookLM automation, no LLM-as-judge, and no committed real-book fixture artifacts.
