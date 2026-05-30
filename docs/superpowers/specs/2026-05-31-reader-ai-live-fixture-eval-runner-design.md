---
comet_change: reader-ai-live-fixture-eval-runner
role: technical-design
canonical_spec: openspec
---

# Reader AI Live Fixture Eval Runner Design

## Status

Selected direction: build a small guarded local runner that reads an explicit metadata-only fixture file, requires an explicit live opt-in, injects the real Reader AI answer streamer only when requested, and writes metadata-only eval/report artifacts. Do not scan the library, change Reader AI behavior, or automate NotebookLM in this slice.

## Context

Reader AI now has a layered local eval foundation:

```text
ReaderAIEvalCase / ReaderAIEvalResult / ReaderAITraceLike
  -> buildReaderAIEvalReportRun(input)
  -> reader-ai:report CLI
  -> runReaderAIServiceEval(input, deps)
```

The missing layer is a safe bridge from a real local reading fixture to the service eval runner. Current code can already execute controlled cases through an injected streamer and convert them to metadata. This change should not create a second scoring engine; it should create the local fixture orchestration needed to run the real service path intentionally.

External eval guidance supports this order: use a small golden dataset, evaluate retrieval/generation/citation signals separately, track latency/cost metadata, keep deterministic guardrails around live runs, and avoid persisting private corpus content.

## Design Goals

- Run one explicit real local book fixture through Reader AI service behavior.
- Keep fixture inputs and outputs metadata-only.
- Require explicit live opt-in before any provider/model call.
- Reuse existing service eval and report-runner code paths.
- Keep deterministic fake-streamer tests as the default verification path.
- Produce evidence that can guide later retrieval/prompt/citation tuning, without tuning in this change.

## Non-Goals

- No UI changes.
- No Reader AI prompt, retrieval ranking, citation repair, or answer synthesis changes.
- No default provider calls in tests or normal report generation.
- No automatic local library scan.
- No committed real book fixture with private identifiers.
- No NotebookLM automation.
- No LLM-as-judge.
- No remote telemetry.

## Recommended Architecture

```text
local ignored fixture.json
        |
        v
parse + validate fixture
        |
        +-- missing --live? -> fail closed before provider execution
        |
        v
build ReaderAIServiceEvalInput
        |
        v
runReaderAIServiceEval(input, {
  streamAnswer: real streamReaderAIAnswer only when --live is present,
  now,
  collectTraceEvents
})
        |
        v
metadata envelope { cases, results, traces }
        |
        v
buildReaderAIEvalReportRun(envelope)
        |
        v
write envelope.json / report.json / report.md
```

## Component Boundaries

### Fixture parser and validator

Purpose: load a JSON fixture and reject unsafe or incomplete metadata before any live execution.

Responsibilities:

- parse a local JSON fixture;
- validate `cases` with the existing eval case expectations;
- validate fixture-owned run settings, limits, timeouts, and output paths;
- reject unsafe persisted metadata fields such as raw answers, source text, prompts, API keys, URLs, local paths, book hashes, and stable private identifiers;
- keep runtime-only book/session fields out of committed examples and final output artifacts.

Non-responsibilities:

- no provider execution;
- no report generation;
- no local library scan.

### Live runner wrapper

Purpose: convert a valid fixture into `ReaderAIServiceEvalInput` and delegate execution to the existing service eval runner.

Responsibilities:

- enforce `--live` before injecting `streamReaderAIAnswer`;
- cap case count for cost control;
- attach timeout/abort behavior;
- pass controlled context into `runReaderAIServiceEval`;
- call `buildReaderAIEvalReportRun` after execution;
- write only sanitized outputs.

Non-responsibilities:

- no scoring rules beyond existing service eval/report code;
- no answer capture;
- no prompt/retrieval/citation changes.

### Report writer

Purpose: write metadata-only artifacts after report validation succeeds.

Allowed outputs:

```text
envelope.json     # cases/results/traces metadata only
report.json       # ReaderAIEvalReport only
report.md         # deterministic Markdown summary
```

Disallowed outputs:

- raw answer text;
- raw source previews;
- raw prompts/messages;
- provider request/response bodies;
- local paths;
- URLs;
- API keys/tokens;
- book hashes or stable private book identifiers;
- raw exception messages.

## Fixture Shape

The implementation should keep the first fixture shape minimal. A representative local-only fixture can look like this conceptually:

```json
{
  "fixtureId": "local-reader-ai-smoke-001",
  "live": false,
  "caseLimit": 5,
  "timeoutMs": 60000,
  "settings": {
    "provider": "openai",
    "model": "gpt-test"
  },
  "runtimeBook": {
    "label": "local-test-book",
    "currentPage": 42,
    "currentAIPage": 40
  },
  "outputs": {
    "envelope": "tmp/reader-ai/live-fixture/envelope.json",
    "reportJson": "tmp/reader-ai/live-fixture/report.json",
    "reportMarkdown": "tmp/reader-ai/live-fixture/report.md"
  },
  "cases": []
}
```

Real runtime fields needed by `streamReaderAIAnswer`, such as local book identity values, should be supported only as local runtime inputs and must not be copied into eval outputs. If exact local locator fields are required during implementation, keep them in ignored local fixtures or environment/config inputs and test that they are omitted from artifacts.

## Safety Rules

1. No `--live`, no real streamer call.
2. Fixture validation runs before any provider execution.
3. Case limit defaults small and can only reduce accidental blast radius.
4. Timeout/abort produces safe labels such as `aborted`, `stream_error`, or `timeout`; raw error messages are never persisted.
5. Tests use fake loaders and fake streamers only.
6. Outputs are validated by `buildReaderAIEvalReportRun` before report artifacts are written.

## Testing Strategy

Focused tests should cover:

- valid fixture parsing;
- unsafe fixture rejection;
- missing `--live` blocks provider execution;
- fake-streamer execution path writes envelope/report artifacts;
- case count limit;
- timeout/abort metadata;
- output privacy assertions;
- compatibility with `runReaderAIServiceEval` and `buildReaderAIEvalReportRun`.

Full verification should include:

- focused live fixture runner tests;
- existing service eval/report tests;
- `pnpm --dir apps/readest-app lint`;
- `pnpm --dir apps/readest-app test`;
- `openspec validate --all --strict`.

## Implementation Notes

- Prefer a small script-facing module plus a thin `tsx` CLI wrapper if the existing report CLI pattern already supports that split.
- Keep provider settings labels explicit, but do not write API keys to fixtures or outputs.
- Reuse current eval validators instead of creating parallel validation rules where possible.
- If implementation discovers that local book loading cannot be safely done from a Node script, stop at the fixture/runner boundary and document the required follow-up instead of adding brittle app-runtime hacks.

## Deferred Follow-ups

- Real local book fixture preparation outside git.
- Larger batch benchmark runner.
- NotebookLM manual comparison workflow integration.
- LLM-as-judge/manual qualitative layer.
- Reader AI prompt/retrieval/citation tuning based on collected evidence.
