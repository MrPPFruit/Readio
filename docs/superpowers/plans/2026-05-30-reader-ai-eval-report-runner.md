---
change: reader-ai-eval-report-runner
design-doc: docs/superpowers/specs/2026-05-30-reader-ai-eval-report-runner-design.md
base-ref: 4522c6cac2866e116ab6cc5e2602f012e409f18a
archived-with: 2026-05-30-reader-ai-eval-report-runner
---

# Reader AI Eval Report Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build pure local Reader AI eval report runner helpers that validate metadata-only inputs and produce deterministic JSON/Markdown reports.

**Architecture:** Add a focused `readerAIEvalReportRunner.ts` module next to the existing eval foundation. It accepts unknown JSON-like input, validates the envelope and case/result records, reuses existing trace aggregation/report summary helpers, and renders Markdown only from sanitized report data.

**Tech Stack:** TypeScript strict mode, Vitest, existing Reader AI eval utilities, no CLI, no file I/O, no model calls, no UI changes.

## archived-with: 2026-05-30-reader-ai-eval-report-runner

## File Structure

- Create: `apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts`
  - Owns the untrusted input boundary, validation issue formatting, report-run orchestration, and Markdown rendering.
  - Depends only on `readerAIEval.ts` types/functions.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`
  - Focused TDD coverage for valid inputs, invalid envelope fields, unsafe case/result fields, unsafe trace omission, and Markdown stability.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Document local report runner input shape and scope boundaries.
- Modify: `openspec/changes/reader-ai-eval-report-runner/tasks.md`
  - Mark tasks complete as implementation progresses.
- Modify: `HANDOFF.md`
  - Add report runner scope and validation evidence after implementation.

## Task 1: Runner Input Validation

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`
- Create: `apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts`
- Modify: `openspec/changes/reader-ai-eval-report-runner/tasks.md`

- [ ] **Step 1: Write failing tests for invalid envelopes and unsafe case/result fields**

Create `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';

import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';

describe('Reader AI eval report runner validation', () => {
  it('rejects non-object input and non-array envelope fields', () => {
    expect(buildReaderAIEvalReportRun(null)).toEqual({
      ok: false,
      report: null,
      markdown: '',
      issues: ['input must be an object'],
    });

    expect(
      buildReaderAIEvalReportRun({
        cases: {},
        results: [],
        traces: {},
      }),
    ).toEqual({
      ok: false,
      report: null,
      markdown: '',
      issues: ['cases must be an array', 'traces must be an array when provided'],
    });
  });

  it('fails closed when cases or results contain unsafe content-bearing fields', () => {
    const output = buildReaderAIEvalReportRun({
      cases: [
        {
          id: 'unsafe-case',
          category: 'citation_grounding',
          language: 'zh-CN',
          question: '这段说明了什么？',
          expectedBehavior: 'Check citation support.',
          spoilerMode: 'read_so_far',
          metadata: { sourceText: 'private source passage' },
        },
      ],
      results: [
        {
          caseId: 'unsafe-case',
          runId: 'run-private',
          classificationIntent: 'citation_check',
          sourceCount: 1,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 1500,
          passed: false,
          reasons: ['missing citation'],
          evidence: { rawPrompt: 'private prompt text' },
        },
      ],
    });

    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([
      'cases[0].metadata.sourceText is not allowed in Reader AI eval metadata',
      'results[0].evidence.rawPrompt is not allowed in Reader AI eval metadata',
    ]);
    expect(JSON.stringify(output)).not.toContain('private source passage');
    expect(JSON.stringify(output)).not.toContain('private prompt text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: FAIL because `@/services/ai/eval/readerAIEvalReportRunner` does not exist or `buildReaderAIEvalReportRun` is not implemented.

- [ ] **Step 3: Implement the minimal runner validation module**

Create `apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts`:

```ts
import {
  type ReaderAIEvalCase,
  type ReaderAIEvalReport,
  type ReaderAIEvalResult,
  type ReaderAITraceLike,
  buildReaderAIEvalReport,
  buildReaderAITraceRunSummaries,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

export type ReaderAIEvalReportRunnerInput = {
  cases: unknown[];
  results: unknown[];
  traces?: unknown[];
};

export type ReaderAIEvalReportRunnerOutput =
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const prefixIssue = (prefix: string, issue: string): string => `${prefix}.${issue}`;

const parseInputEnvelope = (
  input: unknown,
): { ok: true; input: ReaderAIEvalReportRunnerInput } | { ok: false; issues: string[] } => {
  if (!isRecord(input)) {
    return { ok: false, issues: ['input must be an object'] };
  }

  const issues: string[] = [];
  const cases = input['cases'];
  const results = input['results'];
  const traces = input['traces'];

  if (!Array.isArray(cases)) issues.push('cases must be an array');
  if (!Array.isArray(results)) issues.push('results must be an array');
  if (traces !== undefined && !Array.isArray(traces)) {
    issues.push('traces must be an array when provided');
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    input: {
      cases: cases as unknown[],
      results: results as unknown[],
      traces: traces as unknown[] | undefined,
    },
  };
};

const validateCases = (cases: unknown[]): { validCases: ReaderAIEvalCase[]; issues: string[] } => {
  const validCases: ReaderAIEvalCase[] = [];
  const issues: string[] = [];

  cases.forEach((evalCase, index) => {
    const result = validateReaderAIEvalCase(evalCase);
    if (result.valid) {
      validCases.push(evalCase as ReaderAIEvalCase);
    } else {
      issues.push(...result.issues.map((issue) => prefixIssue(`cases[${index}]`, issue)));
    }
  });

  return { validCases, issues };
};

const validateResults = (
  results: unknown[],
): { validResults: ReaderAIEvalResult[]; issues: string[] } => {
  const validResults: ReaderAIEvalResult[] = [];
  const issues: string[] = [];

  results.forEach((evalResult, index) => {
    const result = validateReaderAIEvalResult(evalResult);
    if (result.valid) {
      validResults.push(evalResult as ReaderAIEvalResult);
    } else {
      issues.push(...result.issues.map((issue) => prefixIssue(`results[${index}]`, issue)));
    }
  });

  return { validResults, issues };
};

export function renderReaderAIEvalReportMarkdown(report: ReaderAIEvalReport): string {
  return `# Reader AI Eval Report\n\nTotal cases: ${report.totalCases}\nTotal results: ${report.totalResults}\nPassed: ${report.passed}\nFailed: ${report.failed}\n`;
}

export function buildReaderAIEvalReportRun(input: unknown): ReaderAIEvalReportRunnerOutput {
  const envelope = parseInputEnvelope(input);
  if (!envelope.ok) {
    return { ok: false, report: null, markdown: '', issues: envelope.issues };
  }

  const { validCases, issues: caseIssues } = validateCases(envelope.input.cases);
  const { validResults, issues: resultIssues } = validateResults(envelope.input.results);
  const issues = [...caseIssues, ...resultIssues];

  if (issues.length > 0) {
    return { ok: false, report: null, markdown: '', issues };
  }

  const runSummaries = buildReaderAITraceRunSummaries(
    (envelope.input.traces ?? []) as ReaderAITraceLike[],
  );
  const report = buildReaderAIEvalReport({
    cases: validCases,
    results: validResults,
    runSummaries,
  });

  return { ok: true, report, markdown: renderReaderAIEvalReportMarkdown(report), issues: [] };
}
```

- [ ] **Step 4: Run validation tests to verify Task 1 passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: PASS for the two validation tests.

- [ ] **Step 5: Mark OpenSpec validation tasks complete and commit**

Update `openspec/changes/reader-ai-eval-report-runner/tasks.md`:

```md
- [x] 1.1 Add a metadata-only report runner input type for local JSON envelopes containing `cases`, `results`, and optional `traces` arrays.
- [x] 1.2 Add validation that rejects non-object inputs and non-array envelope fields with deterministic validation issues.
- [x] 1.3 Reuse existing eval case/result validators so unsafe content-bearing case/result fields fail closed before report generation.
```

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts openspec/changes/reader-ai-eval-report-runner/tasks.md
git commit -m "feat(readio): validate reader ai eval report inputs"
```

## Task 2: Deterministic Report and Markdown Output

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts`
- Modify: `openspec/changes/reader-ai-eval-report-runner/tasks.md`

- [ ] **Step 1: Add failing tests for successful report generation and Markdown sections**

Append to `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`:

```ts
describe('Reader AI eval report runner output', () => {
  it('builds deterministic JSON and Markdown reports from valid metadata inputs', () => {
    const output = buildReaderAIEvalReportRun({
      cases: [
        {
          id: 'person-azik-recall',
          category: 'person_recall',
          language: 'zh-CN',
          question: '阿兹克是谁？',
          expectedBehavior: 'Identify the person using cited read-so-far evidence.',
          spoilerMode: 'read_so_far',
        },
        {
          id: 'object-clock-recall',
          category: 'object_recall',
          language: 'zh-CN',
          question: '那只钟有什么用？',
          expectedBehavior: 'Describe the object without quoting source text.',
          spoilerMode: 'read_so_far',
        },
      ],
      results: [
        {
          caseId: 'person-azik-recall',
          runId: 'run-a',
          classificationIntent: 'entity_lookup',
          sourceCount: 3,
          citationValid: true,
          insufficientAnswer: false,
          firstOutputMs: 1200,
          passed: true,
          reasons: ['cited correct source'],
          overBudgetStage: 'none',
        },
        {
          caseId: 'object-clock-recall',
          runId: 'run-b',
          classificationIntent: 'object_lookup',
          sourceCount: 2,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 3600,
          passed: false,
          reasons: ['missing citation'],
          overBudgetStage: 'citation_validation',
          manualBenchmark: {
            source: 'notebooklm',
            mode: 'whole_book',
            observations: ['more_complete'],
          },
        },
      ],
      traces: [
        {
          runId: 'run-a',
          stage: 'retrieval',
          action: 'hybrid_search',
          status: 'completed',
          durationMs: 100,
          candidateCount: 6,
          selectedCount: 3,
          sourceCount: 3,
        },
        {
          runId: 'run-b',
          stage: 'citation_validation',
          action: 'validate_citations',
          status: 'failed',
          durationMs: 80,
          issueCount: 2,
          issueTypeCounts: { missing: 2 },
          overBudgetStage: 'citation_validation',
        },
      ],
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));

    expect(output.report).toEqual({
      totalCases: 2,
      totalResults: 2,
      passed: 1,
      failed: 1,
      byCategory: {
        person_recall: {
          total: 1,
          passed: 1,
          insufficientAnswers: 0,
          citationValid: 1,
          firstOutputMs: { min: 1200, max: 1200, average: 1200 },
          overBudgetStages: { none: 1 },
        },
        object_recall: {
          total: 1,
          passed: 0,
          insufficientAnswers: 1,
          citationValid: 0,
          firstOutputMs: { min: 3600, max: 3600, average: 3600 },
          overBudgetStages: { citation_validation: 1 },
        },
      },
      runSummaries: [
        {
          runId: 'run-a',
          eventCount: 1,
          statuses: { completed: 1 },
          stageDurationsMs: { retrieval: 100 },
          candidateCount: 6,
          selectedCount: 3,
          sourceCount: 3,
          issueCount: 0,
          issueTypeCounts: {},
          firstOutputMs: null,
          overBudgetStage: 'none',
          recoveryHint: 'none',
          finalStatus: 'completed',
        },
        {
          runId: 'run-b',
          eventCount: 1,
          statuses: { failed: 1 },
          stageDurationsMs: { citation_validation: 80 },
          candidateCount: 0,
          selectedCount: 0,
          sourceCount: 0,
          issueCount: 2,
          issueTypeCounts: { missing: 2 },
          firstOutputMs: null,
          overBudgetStage: 'citation_validation',
          recoveryHint: 'none',
          finalStatus: 'failed',
        },
      ],
    });

    expect(output.markdown).toContain('# Reader AI Eval Report');
    expect(output.markdown).toContain('## Overview');
    expect(output.markdown).toContain('## Category Summary');
    expect(output.markdown).toContain('## Over-Budget Stages');
    expect(output.markdown).toContain('## Run Summaries');
    expect(output.markdown).toContain(
      '| Category | Total | Passed | Citation Valid | Insufficient | First Output Min | First Output Max | First Output Avg |',
    );
    expect(output.markdown).toContain(
      '| person_recall | 1 | 1 | 1 | 0 | 1200ms | 1200ms | 1200ms |',
    );
    expect(output.markdown).toContain(
      '| run-b | failed | 1 | 0 | 0 | 0 | 2 | citation_validation |',
    );
    expect(output.markdown).not.toContain('more_complete');
  });
});
```

- [ ] **Step 2: Run output test to verify it fails on Markdown detail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: FAIL because the initial Markdown renderer does not include stable sections/tables.

- [ ] **Step 3: Implement deterministic Markdown rendering**

Replace `renderReaderAIEvalReportMarkdown` in `readerAIEvalReportRunner.ts` with:

```ts
const formatMs = (value: number | null): string => (value === null ? 'n/a' : `${value}ms`);

const renderCountMap = (counts: Record<string, number>): string => {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '- none';
  return entries.map(([key, count]) => `- ${key}: ${count}`).join('\n');
};

export function renderReaderAIEvalReportMarkdown(report: ReaderAIEvalReport): string {
  const categoryRows = Object.entries(report.byCategory)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, summary]) =>
      [
        category,
        String(summary.total),
        String(summary.passed),
        String(summary.citationValid),
        String(summary.insufficientAnswers),
        formatMs(summary.firstOutputMs.min),
        formatMs(summary.firstOutputMs.max),
        formatMs(summary.firstOutputMs.average),
      ].join(' | '),
    )
    .map((row) => `| ${row} |`);

  const overBudgetStages = Object.entries(report.byCategory)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, summary]) => `### ${category}\n\n${renderCountMap(summary.overBudgetStages)}`);

  const runRows = report.runSummaries.map((summary) =>
    [
      summary.runId,
      summary.finalStatus,
      String(summary.eventCount),
      String(summary.candidateCount),
      String(summary.selectedCount),
      String(summary.sourceCount),
      String(summary.issueCount),
      summary.overBudgetStage,
    ].join(' | '),
  );

  return [
    '# Reader AI Eval Report',
    '',
    '## Overview',
    '',
    `- Total cases: ${report.totalCases}`,
    `- Total results: ${report.totalResults}`,
    `- Passed: ${report.passed}`,
    `- Failed: ${report.failed}`,
    '',
    '## Category Summary',
    '',
    '| Category | Total | Passed | Citation Valid | Insufficient | First Output Min | First Output Max | First Output Avg |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...(categoryRows.length > 0 ? categoryRows : ['| none | 0 | 0 | 0 | 0 | n/a | n/a | n/a |']),
    '',
    '## Over-Budget Stages',
    '',
    ...(overBudgetStages.length > 0 ? overBudgetStages : ['- none']),
    '',
    '## Run Summaries',
    '',
    '| Run ID | Final Status | Events | Candidates | Selected | Sources | Issues | Over-Budget Stage |',
    '|---|---|---:|---:|---:|---:|---:|---|',
    ...(runRows.length > 0
      ? runRows.map((row) => `| ${row} |`)
      : ['| none | unknown | 0 | 0 | 0 | 0 | 0 | none |']),
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run report output tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: PASS for validation and output tests.

- [ ] **Step 5: Mark report generation tasks complete and commit**

Update `openspec/changes/reader-ai-eval-report-runner/tasks.md`:

```md
- [x] 2.1 Add pure report runner helpers that compose case/result validation, trace aggregation, and eval report summary generation.
- [x] 2.2 Add deterministic JSON report output that preserves the existing metadata-only `ReaderAIEvalReport` shape.
- [x] 2.3 Add deterministic Markdown report rendering from sanitized report data with stable overview, category, latency, and run-summary sections.
```

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts openspec/changes/reader-ai-eval-report-runner/tasks.md
git commit -m "feat(readio): render reader ai eval reports"
```

## Task 3: Privacy Regression Tests and Documentation

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `openspec/changes/reader-ai-eval-report-runner/tasks.md`

- [ ] **Step 1: Add failing privacy regression test for trace fields**

Append to `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts`:

```ts
describe('Reader AI eval report runner privacy', () => {
  it('omits unsafe trace-like fields from JSON and Markdown output', () => {
    const output = buildReaderAIEvalReportRun({
      cases: [
        {
          id: 'trace-privacy-case',
          category: 'citation_grounding',
          language: 'zh-CN',
          question: '引用是否可靠？',
          expectedBehavior: 'Check citation support without storing source text.',
          spoilerMode: 'read_so_far',
        },
      ],
      results: [
        {
          caseId: 'trace-privacy-case',
          runId: 'run-private',
          classificationIntent: 'citation_check',
          sourceCount: 1,
          citationValid: true,
          insufficientAnswer: false,
          firstOutputMs: 900,
          passed: true,
          reasons: ['citation metadata is valid'],
        },
      ],
      traces: [
        {
          runId: 'run-private',
          stage: 'retrieval',
          action: 'hybrid_search',
          status: 'completed',
          durationMs: 120,
          sourceText: 'private source text',
          prompt: 'private prompt',
          nested: { answerText: 'private answer' },
        },
      ],
    });

    expect(output.ok).toBe(true);
    expect(JSON.stringify(output)).not.toContain('sourceText');
    expect(JSON.stringify(output)).not.toContain('private source text');
    expect(JSON.stringify(output)).not.toContain('private prompt');
    expect(JSON.stringify(output)).not.toContain('private answer');
    expect(output.markdown).toContain('| run-private | completed | 1 | 0 | 0 | 0 | 0 | none |');
  });
});
```

- [ ] **Step 2: Run privacy test**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: PASS if Task 1 and Task 2 reused trace aggregation correctly. If it fails, fix only the runner path that copied raw trace input.

- [ ] **Step 3: Document report runner scope**

Append to `apps/readest-app/src/services/ai/eval/README.md`:

````md
## Local report runner

The report runner accepts a parsed local JSON-style envelope:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```
````

It validates cases and results, aggregates trace-like metadata by opaque `runId`, and returns a deterministic metadata-only JSON report plus Markdown. Invalid case/result input fails closed and does not produce a partial report.

The runner is intentionally pure: it does not read files, write files, call model providers, load books, run indexing, automate NotebookLM, or change Reader AI UI/runtime behavior. A CLI wrapper can be added later after this data contract stabilizes.

````

- [ ] **Step 4: Mark privacy/documentation tasks complete and commit**

Update `openspec/changes/reader-ai-eval-report-runner/tasks.md`:

```md
- [x] 3.1 Add tests proving unsafe trace-like fields are omitted from JSON and Markdown reports.
- [x] 3.2 Document the local report runner input shape and scope in the eval README.
- [x] 3.3 Keep NotebookLM/manual benchmark observations non-authoritative and separate from deterministic scoring.
````

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval-report-runner.test.ts apps/readest-app/src/services/ai/eval/README.md openspec/changes/reader-ai-eval-report-runner/tasks.md
git commit -m "docs(readio): document reader ai eval report runner"
```

## Task 4: Verification and Handoff

**Files:**

- Modify: `HANDOFF.md`
- Modify: `openspec/changes/reader-ai-eval-report-runner/tasks.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts src/__tests__/ai/reader-ai-eval.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts
```

Expected: PASS, 3 files pass.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS with TypeScript and Biome checks.

- [ ] **Step 3: Run full test suite**

Run:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS. Use background execution if this may take long.

- [ ] **Step 4: Update handoff**

Add a short section near the top of `HANDOFF.md`:

```md
## Reader AI Eval Report Runner

- Change: `reader-ai-eval-report-runner`.
- Scope: pure local report runner helpers under `apps/readest-app/src/services/ai/eval/`; no CLI, file I/O, model calls, real book loading, UI changes, prompt changes, retrieval changes, citation visual changes, or NotebookLM automation.
- Implemented:
  - untrusted JSON-like envelope validation for `cases`, `results`, and optional `traces`;
  - fail-closed case/result privacy validation before report generation;
  - reuse of existing trace aggregation and eval report summary helpers;
  - deterministic metadata-only JSON report and Markdown rendering.
- Validation:
  - `pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts src/__tests__/ai/reader-ai-eval.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts` passed.
  - `pnpm --dir apps/readest-app lint` passed.
  - `pnpm --dir apps/readest-app test` passed.
- Deferred:
  - CLI JSON-in/Markdown-out wrapper;
  - file-system report loading/writing;
  - real `streamReaderAIAnswer` eval execution;
  - NotebookLM automation;
  - LLM-as-judge.
```

- [ ] **Step 5: Mark verification tasks complete and commit**

Update `openspec/changes/reader-ai-eval-report-runner/tasks.md`:

```md
- [x] 4.1 Run focused Reader AI eval/report tests.
- [x] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.3 Run `pnpm --dir apps/readest-app test`.
- [x] 4.4 Update `HANDOFF.md` with report runner scope, validation evidence, and deferred automation follow-ups.
```

Commit:

```bash
git add HANDOFF.md openspec/changes/reader-ai-eval-report-runner/tasks.md
git commit -m "docs(readio): record eval report runner validation"
```

- [ ] **Step 6: Run Comet build guard**

Run:

```bash
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills")
COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"
bash "$COMET_GUARD" reader-ai-eval-report-runner build --apply
```

Expected: guard passes and transitions `.comet.yaml` to `phase: verify`.

## Self-Review

- Spec coverage: covered local input loading, privacy validation, deterministic JSON/Markdown output, local/non-invasive scope, helper composition, and trace-consumer privacy.
- Placeholder scan: no placeholder tasks remain; all commands and expected outcomes are explicit.
- Type consistency: function/type names match the design doc and are reused consistently across tasks.
