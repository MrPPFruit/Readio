---
comet_change: reader-ai-service-eval-runner
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-31-reader-ai-service-eval-runner
status: final
---

# Reader AI Service Eval Runner Design

## Status

Approved direction: implement option A first — a deterministic, dependency-injected service eval harness. Defer option C — real-book and live-provider evaluation — to a separate later change.

## Context

Reader AI already has a metadata-only eval stack:

```text
Reader AI eval schemas
  -> buildReaderAIEvalReportRun(input)
  -> reader-ai:report CLI for JSON/Markdown reports
```

This stack can summarize eval metadata, but it does not exercise the Reader AI service path. The production service path is represented by `streamReaderAIAnswer`, which coordinates classification, retrieval, source emission, model streaming, citation checks, repair, insufficient-evidence fallback, and `reader_ai.trace` diagnostics.

The next layer should validate the service path contract without introducing real book loading, live provider calls, UI changes, or NotebookLM automation.

## Selected Approach

Build a pure service-level eval runner under `apps/readest-app/src/services/ai/eval/`.

The runner accepts:

- eval cases with ordinary-reader questions;
- controlled Reader AI run context;
- an explicitly injected answer stream function compatible with the `streamReaderAIAnswer` contract;
- optional injected clock/run id/trace collection dependencies for deterministic tests.

The runner returns a metadata-only envelope compatible with the existing report runner:

```text
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
}
```

## Alternatives Considered

### A. Dependency-injected service eval harness — selected

Pros:

- keeps the slice deterministic and testable;
- does not default to live model calls;
- does not load real books;
- preserves the existing report CLI boundary;
- creates the missing adapter between Reader AI service behavior and metadata reports.

Cons:

- not yet a one-command real-book benchmark.

### B. Add a service eval CLI immediately

Pros:

- easier manual execution.

Cons:

- mixes file I/O, fixture format, service execution, and report orchestration before the harness contract is stable.

Decision: defer. The existing `reader-ai:report` CLI can already render envelopes.

### C. Real-book/live-provider runner

Pros:

- closest to final quality evaluation.

Cons:

- higher risk: copyrighted local content, provider cost, flakiness, privacy boundaries, and longer runtime.

Decision: explicitly defer to a later OpenSpec change after the injected harness is stable.

## Architecture

```text
ReaderAIEvalCase[]
  + controlled run context
  + injected streamAnswer()
  + injected trace/clock deps
        |
        v
runReaderAIServiceEval(input, deps)
        |
        +-- invokes injected streamer per case
        +-- collects onSources metadata
        +-- measures firstOutputMs
        +-- captures safe trace-like metadata
        +-- derives objective result labels
        v
metadata-only envelope
        |
        v
buildReaderAIEvalReportRun(envelope)
        |
        v
existing JSON/Markdown report path
```

## Component Boundaries

### `runReaderAIServiceEval`

Purpose: execute controlled eval cases through an injected Reader AI answer stream and return report-compatible metadata.

Responsibilities:

- iterate cases in stable order;
- assign deterministic run ids when missing;
- invoke the injected stream function with the case question and controlled run context;
- wire runner-owned callbacks for source collection and trace collection;
- measure first-output latency with an injected clock;
- convert service outcomes into `ReaderAIEvalResult` records;
- return only metadata accepted by existing eval/report validators.

Non-responsibilities:

- no file I/O;
- no CLI parsing;
- no model/provider selection;
- no real book loading;
- no UI integration;
- no remote telemetry.

### Injected streamer

Purpose: provide the Reader AI answer stream behavior.

In tests, this is a fake deterministic streamer. In a later change, callers may explicitly pass the real `streamReaderAIAnswer`.

The runner must never call a provider on its own. A live call can only happen if a future caller deliberately injects a real streamer.

### Trace collector

Purpose: collect privacy-safe, `reader_ai.trace`-style metadata for each run.

Allowed fields include run id, stage, action, status, duration, counts, over-budget stage, and recovery hints.

Forbidden fields include raw question text, prompt text, answer text, source text, book title, author, book hash, local paths, URLs, API keys, and stable private identifiers.

## Data Flow

For each case:

1. Build a controlled per-case run context.
2. Assign a deterministic run id if not provided.
3. Start timing with injected clock.
4. Invoke the injected stream function.
5. Track first emitted output time.
6. Count emitted sources via `onSources`.
7. Collect safe trace-like events.
8. Convert completion, insufficient evidence, thrown error, or abort into a metadata result.
9. Validate/report compatibility by feeding the output envelope to the existing report runner in tests.

## Scoring Rules

The initial scoring stays deterministic and metadata-only.

A case fails when:

- the stream throws or is aborted;
- no output is produced and the case did not expect insufficient evidence;
- insufficient evidence is returned when the case expected an answer;
- citations are required but zero sources are emitted;
- citation metadata indicates invalid citations.

A case passes when objective metadata satisfies the case expectations.

The runner records reason labels instead of free-form raw messages. LLM-as-judge and manual qualitative grading are out of scope for this change.

## Privacy Rules

The returned envelope must not include:

- raw answer text;
- raw source text;
- raw prompt text;
- raw question text if it contains user/private content beyond the eval case metadata already accepted by validators;
- book title;
- author name;
- book hash;
- local file path;
- URL;
- API key;
- stable private identifier;
- raw exception message.

Failures use safe reason labels such as `stream_error`, `aborted`, `no_output`, `missing_sources`, `citation_invalid`, or `unexpected_insufficient_answer`.

## Error Handling

- Invalid runner input should return or throw a typed local error suitable for tests, without writing files or mutating global state.
- Stream exceptions should produce failed metadata results with safe reason labels.
- Abort signals should produce aborted metadata results.
- Partial raw output may be inspected in memory for objective checks but must not be returned.
- If one case fails, later cases should still run unless the caller aborts the whole run.

## Testing Plan

Focused tests should cover:

- invoking an injected fake streamer with controlled context;
- deterministic run id generation;
- collecting source count and first-output latency;
- successful run result metadata;
- insufficient-answer expected vs unexpected behavior;
- thrown stream error with safe reason label;
- aborted run with safe reason label;
- privacy: no raw answer/source/prompt/book/path/API fields in output;
- compatibility: service eval envelope can be passed to `buildReaderAIEvalReportRun`;
- documentation: README explains fake-streamer path and deferred real-book/live-provider scope.

Verification commands:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts
pnpm --dir apps/readest-app lint
pnpm --dir apps/readest-app test
openspec validate --all --strict
```

## Deferred Follow-ups

- File-based service eval CLI that reads fixture JSON and writes an envelope.
- Explicit live-provider runner with cost and privacy guardrails.
- Real local book fixture strategy that avoids committing copyrighted content.
- NotebookLM comparison automation.
- LLM-as-judge or manual qualitative review layer.

## Success Criteria

This change is successful when:

- there is a pure service eval runner with deterministic fake-streamer tests;
- it produces metadata-only envelopes accepted by the existing report runner;
- no UI, provider defaults, real book loading, or CLI behavior changes are introduced;
- OpenSpec strict validation and focused tests pass;
- C-style real-book/live-provider evaluation remains documented as a later change, not hidden in this slice.
