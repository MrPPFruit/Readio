---
comet_change: reader-ai-live-fixture-quality-baseline
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-31-reader-ai-live-fixture-quality-baseline
status: final
---

# Reader AI Live Fixture Quality Baseline Design

## Scope

Build a local-only quality baseline layer above the existing guarded Reader AI live fixture runner. The layer consumes metadata-only eval envelopes produced by the live fixture workflow and produces deterministic JSON/Markdown baseline summaries. It must not call model providers, read runtime provider settings, prepare retrieval seeds, automate NotebookLM, inspect raw answers, or change any production UI/runtime behavior.

```text
local runtime files + fixture
        │
        ▼
reader-ai:live-fixture
        │
        ▼
metadata-only eval envelope/report
        │
        ▼
buildReaderAIQualityBaselineRun(input)
        │
        ├─ validate sanitized eval metadata
        ├─ reject unsafe fields
        ├─ aggregate deterministic counts/buckets
        └─ render baseline JSON + Markdown
        │
        ▼
reader-ai:baseline CLI
```

## Architecture

### Pure baseline builder

Add a focused eval module, likely `apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts`, with a pure entrypoint:

```ts
buildReaderAIQualityBaselineRun(input: unknown):
  | { ok: true; baseline: ReaderAIQualityBaseline; markdown: string; issues: [] }
  | { ok: false; baseline: null; markdown: ''; issues: string[] }
```

The builder should parse the same envelope shape used by `buildReaderAIEvalReportRun`:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```

It should reuse existing validation where possible:

- `validateReaderAIEvalCase`
- `validateReaderAIEvalResult`
- existing trace summarization where useful

It may add baseline-specific consistency checks, such as every result `caseId` matching an input case. Invalid input returns deterministic issues and no output.

### CLI wrapper

Add a local file wrapper, likely `apps/readest-app/scripts/reader-ai-quality-baseline.ts`, exposed as a package script such as:

```bash
pnpm --dir apps/readest-app reader-ai:baseline -- \
  --input tmp/reader-ai/live-fixture/envelope.json \
  --json-out tmp/reader-ai/live-fixture/baseline.json \
  --markdown-out tmp/reader-ai/live-fixture/baseline.md
```

The CLI should mirror the existing `reader-ai:report` wrapper style:

- parse `--input`, `--json-out`, and `--markdown-out`;
- read one JSON input file;
- call only the pure baseline builder;
- write JSON and Markdown only after validation succeeds;
- return non-zero with safe issue strings on usage, read, parse, validation, or write failure.

The CLI must not import or call `streamReaderAIAnswer`, runtime bridge loaders, retrieval seed preparation, provider settings, browser APIs, or UI modules.

## Baseline Data Model

The baseline JSON should be an aggregate snapshot, not a semantic grade. Use safe labels and counts only.

Recommended shape:

```ts
type ReaderAIQualityBaseline = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<string, BaselineGroupSummary>;
  byLanguage: Record<string, BaselineGroupSummary>;
  byProviderModel: Record<string, BaselineGroupSummary>;
  reasonCounts: Record<string, number>;
  citation: { valid: number; invalid: number };
  sourceCountBuckets: Record<'0' | '1-2' | '3-5' | '6+', number>;
  firstOutputLatencyBuckets: Record<'0-1s' | '1-3s' | '3-8s' | '8s+', number>;
  overBudgetStages: Record<string, number>;
  manualObservationCounts: Record<string, number>;
};
```

`BaselineGroupSummary` should stay small and deterministic:

```ts
type BaselineGroupSummary = {
  total: number;
  passed: number;
  failed: number;
  citationValid: number;
  insufficientAnswers: number;
};
```

Provider/model grouping should use labels already present in `ReaderAIEvalResult.provider` and `ReaderAIEvalResult.model`. Missing labels should be grouped under explicit safe placeholders such as `unknown_provider/unknown_model`.

## Bucketing Rules

Use stable buckets so reports are comparable across runs:

- source count:
  - `0`
  - `1-2`
  - `3-5`
  - `6+`
- first output latency:
  - `0-1s` for `0 <= ms < 1000`
  - `1-3s` for `1000 <= ms < 3000`
  - `3-8s` for `3000 <= ms < 8000`
  - `8s+` for `ms >= 8000`

All counts should be deterministic and sorted in Markdown output where practical.

## Manual Observations

Manual NotebookLM/human comparison remains non-authoritative metadata. If `ReaderAIEvalResult.manualBenchmark.observations` exists, count each short observation label in `manualObservationCounts`.

Manual observations must not:

- alter `passed` or `failed` totals;
- introduce copied NotebookLM answer text;
- introduce copied Readio answer text;
- appear as freeform long analysis in baseline output.

Existing unsafe-field validation already rejects common raw-content keys. Add tests for copied-answer-like fields if needed, but keep implementation simple and metadata-key based.

## Privacy and Safety Boundaries

Baseline artifacts must exclude:

- raw answer text;
- raw source text;
- prompt text;
- API keys;
- custom base URLs;
- local paths;
- URLs;
- book hashes;
- stable private identifiers;
- raw exception details;
- copied NotebookLM output;
- copied Readio output.

Do not add real-book fixture artifacts to the repo. README guidance should say generated local artifacts are developer evidence and require explicit review before commit.

## Error Handling

The pure builder should fail closed:

- non-object input;
- missing or non-array `cases` / `results`;
- invalid case/result metadata;
- unsafe metadata fields;
- result `caseId` with no matching case.

The CLI should avoid partial writes by validating first and preparing both output strings before writing either output path. If a write fails after the first write succeeds, the CLI cannot reliably roll back without adding file deletion behavior; avoid extra cleanup complexity and document/test that validation failures do not write partial artifacts. Tests should cover invalid input no-write behavior and write-failure exit behavior.

## Testing Strategy

Add focused tests near existing Reader AI eval tests:

1. valid envelope builds expected baseline JSON and Markdown;
2. malformed input returns deterministic issues;
3. unsafe fields are rejected and no CLI writes occur;
4. result with missing `caseId` is rejected;
5. source-count and latency buckets are stable;
6. manual observation labels are counted separately and do not affect pass/fail;
7. CLI reads input and writes JSON/Markdown on success;
8. CLI does not write outputs on usage, invalid JSON, or validation failure;
9. CLI write failure returns non-zero with safe issue text;
10. no tests call real providers or networks.

Final verification should include focused eval tests, lint, full app tests, and `openspec validate --all --strict`.

## Implementation Order

1. Add baseline builder tests first.
2. Implement the pure baseline builder and Markdown renderer.
3. Add CLI wrapper tests.
4. Implement CLI and package script.
5. Add privacy/manual-observation tests.
6. Update eval README.
7. Run focused and full validation.

## Explicit Non-UI Decision

This change has no UI work. It is a developer-only eval workflow. Do not modify bookshelf UI, reader UI, Reader AI panels, settings UI, or normal runtime behavior.
