---
comet_change: reader-ai-eval-report-runner
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-30-reader-ai-eval-report-runner
status: final
---

# Reader AI Eval Report Runner Design

## Context

`reader-ai-eval-harness-phase-2` added pure metadata-only utilities under `apps/readest-app/src/services/ai/eval/`: eval case/result validators, trace aggregation by opaque `runId`, and category-level report summaries. The next useful layer is not automatic answer execution yet; it is a deterministic local report runner that turns already-available metadata inputs into repeatable JSON and Markdown evidence.

OpenSpec remains canonical for requirements. This design only defines implementation shape, boundaries, and verification strategy for `reader-ai-eval-report-runner`.

## Recommended Approach

Use a pure function runner first. Do not add a CLI, file-system reader, package script, model call, or real book loader in this change.

Rejected alternatives:

- **Thin CLI now**: useful, but adds path/stdout/stderr concerns before the data contract is proven.
- **Service-level runner around `streamReaderAIAnswer`**: too early; it couples this phase to providers, API keys, real books, indexing, and nondeterministic model behavior.
- **External spreadsheet/manual report**: fast but loses TypeScript validation and privacy checks.

Rationale: the goal is to make metadata reporting deterministic and safe. Pure functions are the smallest testable slice.

## Architecture

Add a focused runner module:

```text
apps/readest-app/src/services/ai/eval/
├── readerAIEval.ts
├── readerAIEvalReportRunner.ts   # new
└── README.md
```

Data flow:

```text
unknown JSON-like input
        │
        ▼
envelope validation: { cases[], results[], traces?[] }
        │
        ▼
case/result validators
        │
        ├── invalid → validation issues, no report
        │
        ▼
trace aggregation
        │
        ▼
ReaderAIEvalReport JSON
        │
        ▼
stable Markdown renderer
```

The runner reuses existing helpers instead of duplicating report logic:

- `validateReaderAIEvalCase`
- `validateReaderAIEvalResult`
- `buildReaderAITraceRunSummaries`
- `buildReaderAIEvalReport`

## Public API Shape

Use `unknown` at the input boundary.

```ts
type ReaderAIEvalReportRunnerInput = {
  cases: unknown[];
  results: unknown[];
  traces?: unknown[];
};

type ReaderAIEvalReportRunnerOutput =
  | {
      ok: true;
      report: ReaderAIEvalReport;
      markdown: string;
      issues: [];
    }
  | {
      ok: false;
      report: null;
      markdown: '';
      issues: string[];
    };
```

Primary functions:

```ts
buildReaderAIEvalReportRun(input: unknown): ReaderAIEvalReportRunnerOutput;
renderReaderAIEvalReportMarkdown(report: ReaderAIEvalReport): string;
```

No `any`. No file-system dependency. No runtime app integration.

## Validation Rules

The runner treats all inputs as untrusted.

- If `input` is not an object, fail.
- If `cases` or `results` is missing or not an array, fail.
- If `traces` exists and is not an array, fail.
- If any case/result validator fails, fail the whole report.
- Do not generate partial reports when case/result input is invalid.
- Trace inputs may contain unknown fields, but only the existing trace aggregation safe fields can contribute to summaries.

Validation issue strings should be deterministic and path-like enough for tests, for example:

```text
cases[0].metadata.sourceText is not allowed in Reader AI eval metadata
results must be an array
traces must be an array when provided
```

## Markdown Rendering

Markdown must be generated only from sanitized `ReaderAIEvalReport`, not from raw input records.

Stable section order:

1. `# Reader AI Eval Report`
2. Overview totals
3. Category summary table
4. Over-budget stages
5. Run summaries

Markdown should include objective metadata only:

- total cases/results;
- pass/fail counts;
- category totals;
- citation-valid counts;
- insufficient-answer counts;
- first-output min/max/average;
- over-budget stage counts;
- run id, final status, event count, source/candidate/issue counts.

Do not render raw questions, expected behavior, answer text, source text, prompts, book identity, local paths, URLs, API keys, or manual benchmark observation labels unless they are already part of the sanitized report object. Current `ReaderAIEvalReport` does not include manual benchmark labels, so Markdown should not include them.

## Error Handling

Use a simple discriminated union instead of exceptions for expected invalid input. Exceptions should not be needed because the runner only handles local parsed JSON-like values.

Design choice: invalid case/result input returns `ok: false`, `report: null`, `markdown: ''`, and deterministic issues. This avoids accidentally treating partial reports as valid evidence.

## Testing Strategy

Extend focused eval tests, likely in:

`apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`

or split to:

`apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`

Recommended tests:

1. Valid envelope returns `ok: true`, JSON report totals, and Markdown with stable sections.
2. Non-object input and non-array envelope fields return deterministic issues.
3. Unsafe case/result fields fail closed and raw values do not appear in output.
4. Unsafe trace-like fields are ignored while safe trace metadata still appears in report summaries.
5. Markdown output does not include raw trace/private strings.

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval*.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts
pnpm --dir apps/readest-app lint
pnpm --dir apps/readest-app test
```

## Scope Boundaries

This change must not:

- add a CLI;
- read or write local files;
- modify `package.json` scripts;
- call model providers;
- call `streamReaderAIAnswer`;
- load real books;
- alter indexing/retrieval/citation behavior;
- alter Reader AI UI or mobile WebView behavior;
- automate NotebookLM;
- introduce LLM-as-judge.

## Future Follow-ups

After this data contract is stable, useful follow-ups are:

1. Thin local CLI wrapper for JSON-in/Markdown-out.
2. Optional service-level runner around `streamReaderAIAnswer` using synthetic/local fixtures.
3. CI artifact comparison for deterministic report snapshots.
4. LLM-as-judge only after deterministic grounding and citation checks are stable.
