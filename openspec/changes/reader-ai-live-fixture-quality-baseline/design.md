## Context

The Reader AI eval foundation already has sanitized eval cases/results, a pure report runner, a dependency-injected service eval runner, and a guarded live fixture runner with runtime-only provider/retrieval inputs. The missing layer is a local baseline workflow that turns one or more live fixture envelopes into a repeatable quality snapshot without adding UI, provider automation beyond the existing live runner, or raw answer/source storage.

This change sits above the existing live fixture runner:

```text
local runtime files + fixture
        │
        ▼
reader-ai:live-fixture  ──▶ metadata-only envelope/report
        │                         │
        └──────── existing guarded execution ───────┐
                                                     ▼
                              quality baseline summarizer
                                                     │
                                                     ▼
                              metadata-only baseline JSON/Markdown
```

## Goals / Non-Goals

**Goals:**

- Produce a deterministic local quality baseline from existing metadata-only live fixture envelopes/reports.
- Summarize ordinary-reader QA quality by category, provider/model label, source-count buckets, latency buckets, pass/fail reasons, and manual observation labels.
- Validate that baseline inputs and outputs stay metadata-only and fail closed on unsafe fields.
- Support optional manual NotebookLM/human observation labels already represented in eval result metadata, without treating them as authoritative scoring.
- Document a local workflow for preparing, running, reviewing, and discarding or explicitly reviewing generated artifacts.

**Non-Goals:**

- No Reader AI UI changes.
- No normal app runtime behavior changes.
- No retrieval, citation, or answer synthesis tuning.
- No NotebookLM automation.
- No LLM-as-judge scoring.
- No fixture discovery over a user library.
- No committed real-book text, raw answers, prompts, source previews, local paths, API keys, URLs, book hashes, or stable private identifiers.

## Decisions

### Decision: Build baseline as a pure metadata summarizer

The baseline layer should accept existing eval envelopes/reports and produce derived counts/labels only. It should not call `streamReaderAIAnswer`, read runtime provider settings, prepare retrieval seeds, or inspect raw answers.

- Chosen: pure summarizer over sanitized envelope/report metadata.
- Rejected: extend the live fixture runner to own baseline scoring directly, because that couples provider execution with quality analysis and increases privacy/cost blast radius.

### Decision: Keep deterministic labels, not semantic grading

The baseline should summarize objective metadata already available: case category, pass/fail, reasons, citation validity, source count, first output latency, over-budget stage, provider/model labels, and optional manual observation labels.

- Chosen: deterministic aggregation and label buckets.
- Rejected: LLM-as-judge or NotebookLM oracle scoring, because this would introduce non-determinism, additional provider cost, and raw answer handling pressure.

### Decision: Preserve manual benchmark as non-authoritative metadata

Manual NotebookLM/human observations can appear as short labels in `manualBenchmark.observations`, but they must not change deterministic pass/fail or require copied answer text.

- Chosen: count observation labels separately.
- Rejected: compute direct Readio-vs-NotebookLM win/loss from copied answers, because it violates the current privacy model and conflates whole-book comparison with read-so-far behavior.

### Decision: Add a local CLI only if needed by tests/tasks

The implementation can expose a pure baseline builder first, then add a small local file CLI if that is the minimal path to make the workflow usable from generated live fixture artifacts.

- Chosen: pure core with optional CLI wrapper.
- Rejected: UI surface or persistent app feature, because baseline is a developer workflow.

## Risks / Trade-offs

- **Risk: Baseline appears like final answer quality scoring** → Mitigation: name/report it as a baseline snapshot and clearly separate deterministic metadata from manual observations.
- **Risk: Raw answer/source content leaks into baseline artifacts** → Mitigation: reuse unsafe-field validation and add focused privacy tests for baseline outputs.
- **Risk: Baseline overfits to one small fixture** → Mitigation: report coverage counts by category/language/provider/model and avoid global quality claims when coverage is small.
- **Risk: Workflow creates local files that look committable** → Mitigation: README guidance and tests that generated outputs are metadata-only; explicitly warn that generated artifacts need review before commit.
