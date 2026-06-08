## Why

The live fixture runner can now execute real Reader AI service paths safely, but the project still lacks a repeatable metadata-only quality baseline for ordinary reader questions before retrieval, citation, or answer synthesis tuning. Establishing a small local baseline now prevents tuning by anecdote and keeps real-book evaluation evidence inside the existing privacy boundary.

## What Changes

- Add a local-only quality baseline workflow for running a bounded set of Reader AI live fixture cases and summarizing objective metadata labels.
- Define baseline result metadata that can compare runs without storing raw answers, prompts, source text, runtime paths, API keys, book hashes, or stable private identifiers.
- Add deterministic validation/reporting around baseline coverage, case categories, provider/model labels, source counts, latency labels, failure labels, and optional manual observation labels.
- Keep NotebookLM comparison manual and non-authoritative; do not automate NotebookLM, copy answer text, or use LLM-as-judge scoring.
- Do not change Reader AI UI/runtime behavior for normal app usage.
- Do not tune Reader AI retrieval, citation, or answer synthesis quality in this change.

## Capabilities

### New Capabilities

- `reader-ai-live-fixture-quality-baseline`: Local-only metadata baseline workflow for summarizing bounded Reader AI live fixture quality evidence.

### Modified Capabilities

- `reader-ai-live-fixture-eval-runner`: Live fixture outputs can be consumed by the quality baseline workflow while preserving guarded execution and metadata-only artifacts.

## Impact

- Affected code:
  - Reader AI eval/report services under `apps/readest-app/src/services/ai/eval/`
  - Reader AI eval CLI scripts under `apps/readest-app/scripts/`
  - focused Reader AI eval tests
  - eval README / local workflow documentation
- Systems:
  - local-only eval CLI path
  - Reader AI service eval harness/reporting
  - OpenSpec Reader AI eval specs
- No production UI changes, no normal app runtime behavior changes, no NotebookLM automation, no LLM-as-judge, no committed real-book fixture artifacts, and no answer-quality tuning.
