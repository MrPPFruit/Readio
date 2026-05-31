## Context

The Reader AI eval stack currently has four local layers:

```text
metadata eval schemas
  -> buildReaderAIEvalReportRun(input)
  -> reader-ai:report CLI
  -> runReaderAIServiceEval(input, deps)
```

`runReaderAIServiceEval` can turn controlled service runs into metadata-only envelopes, but it deliberately requires an injected answer streamer and does not choose providers, load books, parse fixture files, or write reports. The next step is a thin local runner around that harness for one explicit live fixture at a time.

External eval guidance converges on the same shape: maintain a small golden dataset, separate retrieval/generation/citation evidence, track cost and latency, keep deterministic guardrails around live nondeterminism, and avoid storing private corpus text in eval artifacts.

## Goals / Non-Goals

**Goals:**

- Provide a local runner for explicit real-book/live-provider Reader AI fixture runs.
- Reuse `runReaderAIServiceEval` for execution metadata and `buildReaderAIEvalReportRun` / `reader-ai:report` for reporting.
- Accept a metadata-only fixture file with ordinary-reader questions, local book/session locator metadata, read boundary, provider/model labels, run limits, and output paths.
- Require an explicit live-run opt-in so tests and accidental invocations cannot call providers.
- Preserve strict privacy boundaries: no raw book text, answer text, prompt text, source text, API keys, local paths, book hashes, URLs, or stable private identifiers in committed fixtures or output envelopes.
- Keep tests deterministic with fake fixture loaders and fake streamers.

**Non-Goals:**

- No UI changes.
- No Reader AI prompt, retrieval ranking, citation repair, or answer behavior changes.
- No default provider calls in tests or normal report generation.
- No full library scan, batch benchmark suite, or automatic EPUB fixture repository.
- No NotebookLM automation and no LLM-as-judge.
- No remote telemetry upload.

## Decisions

### Decision 1: Build a thin file runner, not a new eval engine

Create a local Node/tsx runner under `apps/readest-app/scripts/` or a small script-facing module under `apps/readest-app/src/services/ai/eval/`. The runner reads one explicit fixture file, constructs `ReaderAIServiceEvalInput`, invokes `runReaderAIServiceEval` with an explicitly selected streamer, validates the output with `buildReaderAIEvalReportRun`, and writes metadata-only envelope/report artifacts.

Rationale: the service eval runner already owns scoring and trace sanitization. The live fixture runner should own only file orchestration, fixture validation, live-run guardrails, and report writing.

Alternatives considered:

- **Fold live fixture support into `runReaderAIServiceEval`**: rejected because it would mix pure service orchestration with file I/O and live-provider concerns.
- **Build a full benchmark framework now**: rejected because the first real signal should come from one small fixture before broader automation.

### Decision 2: Fixture files are metadata-only and local-explicit

The fixture file should contain:

- eval cases using existing `ReaderAIEvalCase` shape;
- opaque fixture/run labels safe for reports;
- local book/session locator fields needed at runtime but excluded from output;
- read boundary such as `currentPage` / `currentAIPage`;
- provider/model labels and optional settings overrides;
- run limits, timeout, and output paths.

Committed example fixtures must use fake placeholders only. Real local fixture files may exist outside git or under ignored local paths.

Rationale: real book execution needs runtime locators, but persistent eval artifacts should remain metadata-only.

### Decision 3: Live provider execution requires explicit opt-in

The runner should refuse to call the real streamer unless an explicit flag such as `--live` is present. Tests should cover this with fake dependencies and no provider calls. The runner should also support a small case limit and abort/timeout metadata.

Rationale: live evals spend money, can be flaky, and may touch private local books. Accidental execution should fail closed.

### Decision 4: Report outputs stay sanitized

The runner may write:

```text
envelope.json     # cases/results/traces only
report.json       # ReaderAIEvalReport only
report.md         # deterministic markdown summary
```

It must not write raw answers, prompts, source previews, provider request bodies, local paths, API keys, or raw exception messages.

Rationale: this preserves the existing report-runner privacy contract and makes outputs safe to inspect or archive.

## Risks / Trade-offs

- **Risk: accidental provider spend** → Mitigation: require explicit live flag, limit case count, and keep tests fake-only.
- **Risk: local book/private metadata leaks into outputs** → Mitigation: validate fixture and envelope boundaries; write only existing eval/report shapes.
- **Risk: fixture loader needs app runtime dependencies that are hard to run from Node** → Mitigation: start with a minimal explicit loader contract and fake it in tests; defer complex app library integration if needed.
- **Risk: live nondeterminism causes noisy pass/fail** → Mitigation: treat this as evidence collection first; do not change Reader AI behavior based on a single run.
- **Risk: scope creep into quality optimization** → Mitigation: this change only creates the runner and first metadata path; retrieval/prompt/citation tuning remain later changes.

## Migration Plan

1. Add fixture schema/validation and tests.
2. Add a local runner wrapper that defaults to dry/fake-safe behavior and refuses live provider calls without explicit opt-in.
3. Wire the runner to `runReaderAIServiceEval` and report generation.
4. Document local-only fixture usage and privacy boundaries.
5. Verify with focused tests, lint, app tests, and OpenSpec validation.

Rollback: remove the live fixture runner, tests, docs, and delta specs. Existing service eval runner and report CLI remain unchanged.

## Open Questions

- Exact runtime book locator mechanism should be selected during implementation after inspecting existing local book loading APIs.
- Whether the first real fixture file should live outside git only, or whether a sanitized template should be committed.
- Whether report writing belongs in the new runner directly or should shell out to/reuse the existing CLI module interface.
