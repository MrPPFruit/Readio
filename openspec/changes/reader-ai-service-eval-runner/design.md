## Context

The current Reader AI eval stack has three local layers:

```text
metadata schema + validators
  └─ report runner: buildReaderAIEvalReportRun(input)
      └─ CLI wrapper: reader-ai:report --input ... --json-out ... --markdown-out ...
```

This is enough to summarize manually recorded eval metadata, but it does not run the Reader AI service path. The service path currently lives in `streamReaderAIAnswer`, which performs classification, retrieval, source construction, model streaming, citation validation, citation repair, and insufficient-answer fallback while logging `reader_ai.trace` events.

The next useful layer is not a real-book batch runner yet. It is a service-level harness adapter that can execute eval cases through an injected answer-stream function and turn each run into the same metadata envelope consumed by the existing report runner.

## Goals / Non-Goals

**Goals:**

- Add a local service-level eval runner that accepts eval cases plus controlled Reader AI run context.
- Run each case through an injectable Reader AI answer stream function compatible with `streamReaderAIAnswer`.
- Capture metadata-only result records: `caseId`, `runId`, `classificationIntent`, `sourceCount`, `citationValid`, `insufficientAnswer`, `firstOutputMs`, pass/fail, reasons, provider/model labels, spoiler mode, and over-budget stage.
- Capture privacy-safe trace-like events supplied by the harness and include them in the output envelope.
- Return an envelope compatible with `buildReaderAIEvalReportRun` and the existing local CLI.
- Keep unit tests deterministic with fake streamers, fake sources, and fake timing.

**Non-Goals:**

- No live model/provider call by default.
- No real book loading, EPUB parsing, indexing job, or local library scanning.
- No UI/WebView changes.
- No NotebookLM automation and no LLM-as-judge.
- No remote telemetry upload.
- No raw answer/source/prompt persistence in eval output.
- No package CLI in this slice unless the implementation plan later proves it is necessary; the current CLI can already render the envelope.

## Decisions

### Decision 1: Build a pure service eval runner, not a new CLI first

Create a module under `apps/readest-app/src/services/ai/eval/` that exposes a function such as `runReaderAIServiceEval(input, deps)`. The function returns a metadata envelope:

```text
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
}
```

Rationale: the previous change already added file I/O and Markdown/JSON output. This layer should focus on converting controlled service runs into reportable metadata.

Alternatives considered:

- **Add another CLI now**: convenient, but mixes service harness design with file orchestration.
- **Run real books directly**: useful later, but too much scope before the service harness contract is stable.

### Decision 2: Use dependency injection for the answer stream

The runner should accept an injected streamer compatible with the core `streamReaderAIAnswer` inputs and outputs. Tests can inject a fake streamer; future callers can pass the real function explicitly.

The runner-owned callback wiring should collect:

- emitted text chunks to detect whether an insufficient-answer fallback was returned;
- `onSources` calls to count sources;
- elapsed time to first yielded output;
- trace events supplied through an injected trace collector or safe test hook.

Rationale: this keeps the module deterministic, testable, and local-only while still matching the production service contract.

### Decision 3: Keep scoring rule-based and metadata-only

Initial pass/fail should be based on deterministic metadata and per-case expectations, not LLM judging. The minimum rule set:

- no output or known insufficient-answer fallback → fail unless the case expects insufficient evidence;
- required citations with zero sources or citation-invalid metadata → fail;
- otherwise pass with reasons based on objective metadata.

Rationale: the user wants data to locate latency/retrieval/citation failures, not another unconstrained model judging answers.

### Decision 4: Do not store raw answer text

The runner can inspect streamed chunks in memory for objective checks, but the returned envelope MUST NOT include answer text, prompt text, source text, book title, author name, book hash, local paths, URLs, or API keys.

Rationale: this preserves the privacy boundary already enforced by eval validators and report runner.

## Risks / Trade-offs

- **Risk: service runner becomes a hidden model executor** → Mitigation: require explicit injected streamer and keep default tests fake/local.
- **Risk: raw answer/source data leaks through results or traces** → Mitigation: output only existing eval result fields and validate the envelope with `buildReaderAIEvalReportRun` in tests.
- **Risk: deterministic scoring is too shallow** → Mitigation: record reasons and leave LLM-as-judge/manual review as later layers.
- **Risk: dependency injection diverges from production behavior** → Mitigation: type the injected streamer against the production `StreamReaderAIAnswerOptions` shape and include integration-style unit tests around `onSources`, first output timing, and trace metadata.

## Migration Plan

1. Add the service eval runner module and focused tests with fake streamer dependencies.
2. Reuse existing eval validators/report runner to validate privacy and report compatibility.
3. Document the runner in the eval README.
4. Keep current CLI unchanged; users can feed the returned envelope to `reader-ai:report`.

Rollback: remove the service eval runner module, tests, README section, and delta specs. Existing eval/report CLI functionality remains unchanged.

## Open Questions

- Future change: whether to add a file-based service-runner CLI that imports fixture files and writes envelope JSON.
- Future change: how to safely wire real local book fixtures without storing copyrighted content in repo.
