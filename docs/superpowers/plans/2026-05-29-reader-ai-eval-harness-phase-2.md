---
change: reader-ai-eval-harness-phase-2
design-doc: docs/superpowers/specs/2026-05-29-reader-ai-eval-harness-phase-2-design.md
base-ref: 33c9e3144fafc403a6d89e7c88f43a044b72a1fa
archived-with: 2026-05-29-reader-ai-eval-harness-phase-2
---

# Reader AI Eval Harness Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build pure metadata-only Reader AI eval utilities that validate safe eval records, aggregate trace-like metadata by run id, and produce category-level report summaries.

**Architecture:** Extend the existing `readerAIEval.ts` module with focused type definitions, recursive privacy-field detection, trace aggregation, and report summary helpers. Keep the implementation pure and local to `apps/readest-app/src/services/ai/eval/`, with tests driving each behavior in `reader-ai-eval.test.ts`.

**Tech Stack:** TypeScript, Vitest, existing Readio path alias imports, OpenSpec/Comet workflow.

## archived-with: 2026-05-29-reader-ai-eval-harness-phase-2

## File Structure

- Modify `apps/readest-app/src/services/ai/eval/readerAIEval.ts`
  - Owns eval case/result types, validators, unsafe-field detection, trace-like aggregation, and report summary helpers.
  - Imports only type definitions from `@/services/diagnostics/readerAITrace`; no runtime diagnostics logging.
- Modify `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`
  - Adds TDD coverage for optional safe metadata, recursive unsafe-field rejection, trace aggregation, report summaries, and manual benchmark behavior.
- Modify `apps/readest-app/src/services/ai/eval/README.md`
  - Documents label-only manual benchmark observations and non-authoritative NotebookLM comparison metadata.
- Modify `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`
  - Check off completed OpenSpec tasks as implementation progresses.
- Modify `HANDOFF.md`
  - Record Phase 2 scope and validation evidence after implementation validation.

## Task 1: Harden eval schema validation and optional metadata

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIEval.ts`
- Modify: `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`

- [ ] **Step 1: Write failing tests for safe optional metadata and recursive unsafe fields**

Replace `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts` with tests that keep existing coverage and add Phase 2 validator expectations:

```ts
import { describe, expect, it } from 'vitest';

import {
  READER_AI_EVAL_CASE_CATEGORIES,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

describe('Reader AI eval foundation', () => {
  it('accepts ordinary-reader QA categories without committed book text', () => {
    expect(READER_AI_EVAL_CASE_CATEGORIES).toEqual([
      'person_recall',
      'object_recall',
      'event_recap',
      'relationship_recall',
      'current_recap',
      'citation_grounding',
      'spoiler_safety',
    ]);

    const result = validateReaderAIEvalCase({
      id: 'person-azik-recall',
      category: 'person_recall',
      language: 'zh-CN',
      question: '阿兹克是谁？',
      expectedBehavior: 'Identify the person using cited read-so-far evidence.',
      spoilerMode: 'read_so_far',
      tags: ['same_language', 'entity'],
      benchmarkMode: 'readio',
      notes: ['synthetic_fixture'],
    });

    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain('原文');
  });

  it('rejects eval cases that try to commit raw source text recursively', () => {
    const result = validateReaderAIEvalCase({
      id: 'unsafe-source-text',
      category: 'citation_grounding',
      language: 'zh-CN',
      question: '这段说明了什么？',
      expectedBehavior: 'Check citation support.',
      spoilerMode: 'read_so_far',
      metadata: {
        sourceText: 'private book passage',
        nested: { rawPrompt: 'private prompt' },
      },
    });

    expect(result).toEqual({
      valid: false,
      issues: [
        'metadata.sourceText is not allowed in Reader AI eval metadata',
        'metadata.nested.rawPrompt is not allowed in Reader AI eval metadata',
      ],
    });
  });

  it('validates objective result metadata and manual benchmark labels', () => {
    const result = validateReaderAIEvalResult({
      caseId: 'person-azik-recall',
      runId: 'run-123',
      classificationIntent: 'entity_lookup',
      sourceCount: 3,
      citationValid: true,
      insufficientAnswer: false,
      firstOutputMs: 4200,
      passed: true,
      reasons: ['cited correct supporting source'],
      provider: 'openai-compatible',
      model: 'reader-local-test',
      spoilerMode: 'read_so_far',
      overBudgetStage: 'none',
      manualBenchmark: {
        source: 'notebooklm',
        mode: 'whole_book',
        observations: ['more_complete', 'spoiler_boundary_diff'],
      },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('rejects unsafe result content recursively, including manual notes', () => {
    const result = validateReaderAIEvalResult({
      caseId: 'person-azik-recall',
      runId: 'run-123',
      classificationIntent: 'entity_lookup',
      sourceCount: 3,
      citationValid: true,
      insufficientAnswer: false,
      firstOutputMs: 4200,
      passed: true,
      reasons: ['cited correct supporting source'],
      manualBenchmark: {
        source: 'human',
        mode: 'read_so_far',
        observations: ['missed_citation'],
        answerText: 'private answer text',
      },
      evidence: { localPath: '/Users/ppg/private/book.epub' },
    });

    expect(result).toEqual({
      valid: false,
      issues: [
        'manualBenchmark.answerText is not allowed in Reader AI eval metadata',
        'evidence.localPath is not allowed in Reader AI eval metadata',
      ],
    });
  });
});
```

- [ ] **Step 2: Run the focused eval test and verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: FAIL because the current validators do not accept all optional metadata and do not recursively report unsafe nested fields.

- [ ] **Step 3: Implement safe metadata types and recursive unsafe-field detection**

Update `apps/readest-app/src/services/ai/eval/readerAIEval.ts` so it includes these definitions and validator behavior:

```ts
import type { ReaderAIOverBudgetStage } from '@/services/diagnostics/readerAITrace';

export const READER_AI_EVAL_CASE_CATEGORIES = [
  'person_recall',
  'object_recall',
  'event_recap',
  'relationship_recall',
  'current_recap',
  'citation_grounding',
  'spoiler_safety',
] as const;

export type ReaderAIEvalCaseCategory = (typeof READER_AI_EVAL_CASE_CATEGORIES)[number];
export type ReaderAIEvalSpoilerMode = 'read_so_far' | 'whole_book' | 'selected_text';
export type ReaderAIEvalBenchmarkMode = 'readio' | 'notebooklm_manual' | 'human_manual';

export type ReaderAIEvalCase = {
  id: string;
  category: ReaderAIEvalCaseCategory;
  language: string;
  question: string;
  expectedBehavior: string;
  spoilerMode: ReaderAIEvalSpoilerMode;
  tags?: string[];
  benchmarkMode?: ReaderAIEvalBenchmarkMode;
  notes?: string[];
};

export type ReaderAIManualBenchmark = {
  source: 'notebooklm' | 'human';
  mode: 'whole_book' | 'read_so_far';
  observations: string[];
};

export type ReaderAIEvalResult = {
  caseId: string;
  runId: string;
  classificationIntent: string;
  sourceCount: number;
  citationValid: boolean;
  insufficientAnswer: boolean;
  firstOutputMs: number;
  passed: boolean;
  reasons: string[];
  provider?: string;
  model?: string;
  spoilerMode?: ReaderAIEvalSpoilerMode;
  overBudgetStage?: ReaderAIOverBudgetStage | 'none';
  manualBenchmark?: ReaderAIManualBenchmark;
};

export type ReaderAIEvalValidationResult = {
  valid: boolean;
  issues: string[];
};

const caseCategories = new Set<string>(READER_AI_EVAL_CASE_CATEGORIES);
const spoilerModes = new Set<string>(['read_so_far', 'whole_book', 'selected_text']);
const benchmarkModes = new Set<string>(['readio', 'notebooklm_manual', 'human_manual']);
const manualBenchmarkSources = new Set<string>(['notebooklm', 'human']);
const manualBenchmarkModes = new Set<string>(['whole_book', 'read_so_far']);
const overBudgetStages = new Set<string>([
  'retrieval',
  'provider_first_token',
  'generation',
  'citation_validation',
  'citation_repair',
  'indexing',
  'cancelled',
  'timeout',
  'unknown',
  'none',
]);
const unsafeFieldNames = new Set([
  'answer',
  'answerText',
  'sourceText',
  'rawBookText',
  'snippet',
  'quote',
  'previewText',
  'chunkText',
  'prompt',
  'rawPrompt',
  'messages',
  'rawMessages',
  'bookTitle',
  'authorName',
  'bookHash',
  'localPath',
  'url',
  'apiKey',
  'token',
  'authorization',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const collectUnsafeFieldIssues = (value: unknown, path: string[] = []): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeFieldIssues(item, [...path, String(index)]));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nestedPath = [...path, key];
    const issue = unsafeFieldNames.has(key)
      ? [`${nestedPath.join('.')} is not allowed in Reader AI eval metadata`]
      : [];
    return [...issue, ...collectUnsafeFieldIssues(nestedValue, nestedPath)];
  });
};

export function validateReaderAIEvalCase(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['case must be an object'] };

  issues.push(...collectUnsafeFieldIssues(value));

  for (const field of ['id', 'language', 'question', 'expectedBehavior']) {
    if (!hasString(value, field)) issues.push(`${field} is required`);
  }

  const category = value['category'];
  if (typeof category !== 'string' || !caseCategories.has(category)) {
    issues.push('category must be an ordinary-reader QA category');
  }
  const spoilerMode = value['spoilerMode'];
  if (typeof spoilerMode !== 'string' || !spoilerModes.has(spoilerMode)) {
    issues.push('spoilerMode is required');
  }
  if ('tags' in value && !isStringArray(value['tags'])) {
    issues.push('tags must be a string array');
  }
  const benchmarkMode = value['benchmarkMode'];
  if (
    benchmarkMode !== undefined &&
    (typeof benchmarkMode !== 'string' || !benchmarkModes.has(benchmarkMode))
  ) {
    issues.push('benchmarkMode must be readio, notebooklm_manual, or human_manual');
  }
  if ('notes' in value && !isStringArray(value['notes'])) {
    issues.push('notes must be a string array');
  }

  return { valid: issues.length === 0, issues };
}

export function validateReaderAIEvalResult(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['result must be an object'] };

  issues.push(...collectUnsafeFieldIssues(value));

  for (const field of ['caseId', 'runId', 'classificationIntent']) {
    if (!hasString(value, field)) issues.push(`${field} is required`);
  }
  for (const field of ['sourceCount', 'firstOutputMs']) {
    if (typeof value[field] !== 'number' || value[field] < 0) {
      issues.push(`${field} must be non-negative`);
    }
  }
  for (const field of ['citationValid', 'insufficientAnswer', 'passed']) {
    if (typeof value[field] !== 'boolean') issues.push(`${field} is required`);
  }
  const reasons = value['reasons'];
  if (!isStringArray(reasons)) {
    issues.push('reasons must be a string array');
  }
  for (const field of ['provider', 'model']) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== 'string')
      issues.push(`${field} must be a string`);
  }
  const spoilerMode = value['spoilerMode'];
  if (
    spoilerMode !== undefined &&
    (typeof spoilerMode !== 'string' || !spoilerModes.has(spoilerMode))
  ) {
    issues.push('spoilerMode must be read_so_far, whole_book, or selected_text');
  }
  const overBudgetStage = value['overBudgetStage'];
  if (
    overBudgetStage !== undefined &&
    (typeof overBudgetStage !== 'string' || !overBudgetStages.has(overBudgetStage))
  ) {
    issues.push('overBudgetStage is invalid');
  }
  const manualBenchmark = value['manualBenchmark'];
  if (manualBenchmark !== undefined) {
    if (!isRecord(manualBenchmark)) {
      issues.push('manualBenchmark must be an object');
    } else {
      const source = manualBenchmark['source'];
      if (typeof source !== 'string' || !manualBenchmarkSources.has(source)) {
        issues.push('manualBenchmark.source must be notebooklm or human');
      }
      const mode = manualBenchmark['mode'];
      if (typeof mode !== 'string' || !manualBenchmarkModes.has(mode)) {
        issues.push('manualBenchmark.mode must be whole_book or read_so_far');
      }
      if (!isStringArray(manualBenchmark['observations'])) {
        issues.push('manualBenchmark.observations must be a string array');
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
```

- [ ] **Step 4: Run the focused eval test and verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: PASS for the four eval foundation tests.

- [ ] **Step 5: Mark OpenSpec schema hardening tasks complete**

In `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`, change these lines:

```md
- [ ] 1.1 Extend Reader AI eval case/result types with safe optional metadata for run grouping, manual benchmark notes, and category reporting.
- [ ] 1.2 Harden eval validators to reject content-bearing fields in cases, results, manual notes, and trace-like inputs.
- [ ] 1.3 Add synthetic fixture tests proving valid ordinary-reader cases/results pass and unsafe private-content fields fail.
```

to:

```md
- [x] 1.1 Extend Reader AI eval case/result types with safe optional metadata for run grouping, manual benchmark notes, and category reporting.
- [x] 1.2 Harden eval validators to reject content-bearing fields in cases, results, manual notes, and trace-like inputs.
- [x] 1.3 Add synthetic fixture tests proving valid ordinary-reader cases/results pass and unsafe private-content fields fail.
```

- [ ] **Step 6: Commit schema hardening**

Run:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts apps/readest-app/src/services/ai/eval/readerAIEval.ts openspec/changes/reader-ai-eval-harness-phase-2/tasks.md
git commit -m "feat(readio): harden reader ai eval schema"
```

Expected: commit succeeds with schema hardening changes only.

## Task 2: Add trace aggregation helpers

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIEval.ts`
- Modify: `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`

- [ ] **Step 1: Write failing tests for trace aggregation**

Add these imports to `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`:

```ts
  buildReaderAITraceRunSummaries,
```

Add this `describe` block after the existing eval foundation block:

```ts
describe('Reader AI trace aggregation', () => {
  it('groups trace-like metadata by runId and summarizes safe fields', () => {
    const summaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-a',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 120,
        candidateCount: 8,
        selectedCount: 3,
        sourceCount: 3,
      },
      {
        runId: 'run-a',
        stage: 'citation_validation',
        action: 'validate_citations',
        status: 'completed',
        durationMs: 40,
        issueCount: 2,
        issueTypeCounts: { missing: 1, stale: 1 },
      },
      {
        runId: 'run-a',
        stage: 'generation',
        action: 'generate_answer',
        status: 'completed',
        durationMs: 900,
        firstOutputMs: 1300,
        overBudgetStage: 'generation',
        recoveryHint: 'none',
      },
      {
        runId: 'run-b',
        stage: 'run',
        action: 'complete_run',
        status: 'failed',
        durationMs: 50,
        overBudgetStage: 'timeout',
        recoveryHint: 'ask_user_to_retry',
      },
    ]);

    expect(summaries).toEqual([
      {
        runId: 'run-a',
        eventCount: 3,
        statuses: { completed: 3 },
        stageDurationsMs: { retrieval: 120, citation_validation: 40, generation: 900 },
        candidateCount: 8,
        selectedCount: 3,
        sourceCount: 3,
        issueCount: 2,
        issueTypeCounts: { missing: 1, stale: 1 },
        firstOutputMs: 1300,
        overBudgetStage: 'generation',
        recoveryHint: 'none',
        finalStatus: 'completed',
      },
      {
        runId: 'run-b',
        eventCount: 1,
        statuses: { failed: 1 },
        stageDurationsMs: { run: 50 },
        candidateCount: 0,
        selectedCount: 0,
        sourceCount: 0,
        issueCount: 0,
        issueTypeCounts: {},
        firstOutputMs: null,
        overBudgetStage: 'timeout',
        recoveryHint: 'ask_user_to_retry',
        finalStatus: 'failed',
      },
    ]);
  });

  it('ignores unknown and unsafe trace fields', () => {
    const summaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-private',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 100,
        sourceText: 'private source text',
        prompt: 'private prompt',
        nested: { answerText: 'private answer' },
      },
    ]);

    expect(JSON.stringify(summaries)).not.toContain('sourceText');
    expect(JSON.stringify(summaries)).not.toContain('private');
    expect(summaries[0]).toEqual({
      runId: 'run-private',
      eventCount: 1,
      statuses: { completed: 1 },
      stageDurationsMs: { retrieval: 100 },
      candidateCount: 0,
      selectedCount: 0,
      sourceCount: 0,
      issueCount: 0,
      issueTypeCounts: {},
      firstOutputMs: null,
      overBudgetStage: 'none',
      recoveryHint: 'none',
      finalStatus: 'completed',
    });
  });
});
```

- [ ] **Step 2: Run the focused eval test and verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: FAIL because `buildReaderAITraceRunSummaries` is not implemented.

- [ ] **Step 3: Implement trace aggregation types and helper**

Append these exports to `apps/readest-app/src/services/ai/eval/readerAIEval.ts` after the validators:

```ts
export type ReaderAITraceLike = {
  runId?: unknown;
  stage?: unknown;
  action?: unknown;
  status?: unknown;
  durationMs?: unknown;
  candidateCount?: unknown;
  selectedCount?: unknown;
  sourceCount?: unknown;
  issueCount?: unknown;
  issueTypeCounts?: unknown;
  firstOutputMs?: unknown;
  overBudgetStage?: unknown;
  recoveryHint?: unknown;
};

export type ReaderAITraceRunSummary = {
  runId: string;
  eventCount: number;
  statuses: Record<string, number>;
  stageDurationsMs: Record<string, number>;
  candidateCount: number;
  selectedCount: number;
  sourceCount: number;
  issueCount: number;
  issueTypeCounts: Record<string, number>;
  firstOutputMs: number | null;
  overBudgetStage: ReaderAIOverBudgetStage | 'none';
  recoveryHint: string;
  finalStatus: string;
};

const asNonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const asSafeString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const addCount = (counts: Record<string, number>, key: string, amount = 1): void => {
  counts[key] = (counts[key] ?? 0) + amount;
};

const createEmptyRunSummary = (runId: string): ReaderAITraceRunSummary => ({
  runId,
  eventCount: 0,
  statuses: {},
  stageDurationsMs: {},
  candidateCount: 0,
  selectedCount: 0,
  sourceCount: 0,
  issueCount: 0,
  issueTypeCounts: {},
  firstOutputMs: null,
  overBudgetStage: 'none',
  recoveryHint: 'none',
  finalStatus: 'unknown',
});

export function buildReaderAITraceRunSummaries(
  events: ReaderAITraceLike[],
): ReaderAITraceRunSummary[] {
  const summaries = new Map<string, ReaderAITraceRunSummary>();

  for (const event of events) {
    const runId = asSafeString(event.runId);
    if (runId === null) continue;

    const summary = summaries.get(runId) ?? createEmptyRunSummary(runId);
    summaries.set(runId, summary);
    summary.eventCount += 1;

    const status = asSafeString(event.status);
    if (status !== null) {
      addCount(summary.statuses, status);
      summary.finalStatus = status;
    }

    const stage = asSafeString(event.stage);
    const durationMs = asNonNegativeNumber(event.durationMs);
    if (stage !== null && durationMs !== null) {
      addCount(summary.stageDurationsMs, stage, durationMs);
    }

    summary.candidateCount = Math.max(
      summary.candidateCount,
      asNonNegativeNumber(event.candidateCount) ?? 0,
    );
    summary.selectedCount = Math.max(
      summary.selectedCount,
      asNonNegativeNumber(event.selectedCount) ?? 0,
    );
    summary.sourceCount = Math.max(
      summary.sourceCount,
      asNonNegativeNumber(event.sourceCount) ?? 0,
    );
    summary.issueCount += asNonNegativeNumber(event.issueCount) ?? 0;

    if (isRecord(event.issueTypeCounts)) {
      for (const [issueType, count] of Object.entries(event.issueTypeCounts)) {
        const safeCount = asNonNegativeNumber(count);
        if (safeCount !== null) addCount(summary.issueTypeCounts, issueType, safeCount);
      }
    }

    const firstOutputMs = asNonNegativeNumber(event.firstOutputMs);
    if (firstOutputMs !== null) {
      summary.firstOutputMs =
        summary.firstOutputMs === null
          ? firstOutputMs
          : Math.min(summary.firstOutputMs, firstOutputMs);
    }

    const overBudgetStage = asSafeString(event.overBudgetStage);
    if (overBudgetStage !== null && overBudgetStages.has(overBudgetStage)) {
      summary.overBudgetStage = overBudgetStage as ReaderAITraceRunSummary['overBudgetStage'];
    }

    const recoveryHint = asSafeString(event.recoveryHint);
    if (recoveryHint !== null) {
      summary.recoveryHint = recoveryHint;
    }
  }

  return Array.from(summaries.values());
}
```

- [ ] **Step 4: Run trace aggregation tests and verify they pass**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: PASS for eval foundation and trace aggregation tests.

- [ ] **Step 5: Mark OpenSpec trace aggregation tasks complete**

In `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`, change these lines:

```md
- [ ] 2.1 Add pure trace aggregation helpers that group `reader_ai.trace`-style metadata by `runId`.
- [ ] 2.2 Summarize safe fields: stage durations, source/candidate counts, issue counts, first-output latency, over-budget stage, and final outcome.
- [ ] 2.3 Add tests showing unknown/content-bearing trace fields are ignored and never copied into summaries.
```

to:

```md
- [x] 2.1 Add pure trace aggregation helpers that group `reader_ai.trace`-style metadata by `runId`.
- [x] 2.2 Summarize safe fields: stage durations, source/candidate counts, issue counts, first-output latency, over-budget stage, and final outcome.
- [x] 2.3 Add tests showing unknown/content-bearing trace fields are ignored and never copied into summaries.
```

- [ ] **Step 6: Commit trace aggregation**

Run:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts apps/readest-app/src/services/ai/eval/readerAIEval.ts openspec/changes/reader-ai-eval-harness-phase-2/tasks.md
git commit -m "feat(readio): aggregate reader ai eval traces"
```

Expected: commit succeeds with trace aggregation changes only.

## Task 3: Add eval report summary helpers and documentation

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIEval.ts`
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`

- [ ] **Step 1: Write failing tests for report summaries**

Add these imports to `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts`:

```ts
  buildReaderAIEvalReport,
```

Add this `describe` block after the trace aggregation block:

```ts
describe('Reader AI eval report summary', () => {
  it('calculates category pass rates, citations, latency, over-budget stages, and traces', () => {
    const runSummaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-a',
        stage: 'generation',
        action: 'generate_answer',
        status: 'completed',
        firstOutputMs: 1200,
      },
    ]);

    const report = buildReaderAIEvalReport({
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
          caseId: 'person-azik-recall',
          runId: 'run-b',
          classificationIntent: 'entity_lookup',
          sourceCount: 1,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 3600,
          passed: false,
          reasons: ['missing citation'],
          overBudgetStage: 'citation_validation',
        },
        {
          caseId: 'object-clock-recall',
          runId: 'run-c',
          classificationIntent: 'object_lookup',
          sourceCount: 2,
          citationValid: true,
          insufficientAnswer: false,
          firstOutputMs: 2400,
          passed: true,
          reasons: ['grounded answer'],
          overBudgetStage: 'retrieval',
          manualBenchmark: {
            source: 'notebooklm',
            mode: 'whole_book',
            observations: ['more_complete'],
          },
        },
      ],
      runSummaries,
    });

    expect(report).toEqual({
      totalCases: 2,
      totalResults: 3,
      passed: 2,
      failed: 1,
      byCategory: {
        person_recall: {
          total: 2,
          passed: 1,
          insufficientAnswers: 1,
          citationValid: 1,
          firstOutputMs: { min: 1200, max: 3600, average: 2400 },
          overBudgetStages: { none: 1, citation_validation: 1 },
        },
        object_recall: {
          total: 1,
          passed: 1,
          insufficientAnswers: 0,
          citationValid: 1,
          firstOutputMs: { min: 2400, max: 2400, average: 2400 },
          overBudgetStages: { retrieval: 1 },
        },
      },
      runSummaries,
    });
    expect(JSON.stringify(report)).not.toContain('more_complete');
  });
});
```

- [ ] **Step 2: Run the focused eval test and verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: FAIL because `buildReaderAIEvalReport` is not implemented.

- [ ] **Step 3: Implement report summary types and helper**

Append these exports to `apps/readest-app/src/services/ai/eval/readerAIEval.ts` after the trace aggregation helper:

```ts
export type ReaderAIEvalCategorySummary = {
  total: number;
  passed: number;
  insufficientAnswers: number;
  citationValid: number;
  firstOutputMs: {
    min: number | null;
    max: number | null;
    average: number | null;
  };
  overBudgetStages: Record<string, number>;
};

export type ReaderAIEvalReport = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<string, ReaderAIEvalCategorySummary>;
  runSummaries: ReaderAITraceRunSummary[];
};

export type BuildReaderAIEvalReportInput = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  runSummaries?: ReaderAITraceRunSummary[];
};

const createEmptyCategorySummary = (): ReaderAIEvalCategorySummary => ({
  total: 0,
  passed: 0,
  insufficientAnswers: 0,
  citationValid: 0,
  firstOutputMs: { min: null, max: null, average: null },
  overBudgetStages: {},
});

export function buildReaderAIEvalReport({
  cases,
  results,
  runSummaries = [],
}: BuildReaderAIEvalReportInput): ReaderAIEvalReport {
  const casesById = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const byCategory: Record<string, ReaderAIEvalCategorySummary> = {};
  const latencyTotals: Record<string, { total: number; count: number }> = {};

  for (const result of results) {
    const evalCase = casesById.get(result.caseId);
    if (evalCase === undefined) continue;

    const category = evalCase.category;
    const summary = byCategory[category] ?? createEmptyCategorySummary();
    byCategory[category] = summary;
    latencyTotals[category] = latencyTotals[category] ?? { total: 0, count: 0 };

    summary.total += 1;
    if (result.passed) summary.passed += 1;
    if (result.insufficientAnswer) summary.insufficientAnswers += 1;
    if (result.citationValid) summary.citationValid += 1;

    summary.firstOutputMs.min =
      summary.firstOutputMs.min === null
        ? result.firstOutputMs
        : Math.min(summary.firstOutputMs.min, result.firstOutputMs);
    summary.firstOutputMs.max =
      summary.firstOutputMs.max === null
        ? result.firstOutputMs
        : Math.max(summary.firstOutputMs.max, result.firstOutputMs);
    latencyTotals[category].total += result.firstOutputMs;
    latencyTotals[category].count += 1;

    addCount(summary.overBudgetStages, result.overBudgetStage ?? 'none');
  }

  for (const [category, totals] of Object.entries(latencyTotals)) {
    byCategory[category].firstOutputMs.average =
      totals.count === 0 ? null : totals.total / totals.count;
  }

  const passed = results.filter((result) => result.passed).length;

  return {
    totalCases: cases.length,
    totalResults: results.length,
    passed,
    failed: results.length - passed,
    byCategory,
    runSummaries,
  };
}
```

- [ ] **Step 4: Update manual benchmark documentation**

Replace `apps/readest-app/src/services/ai/eval/README.md` with:

```md
# Reader AI eval foundation

This directory contains the local schema foundation for Reader AI ordinary-reader QA evals.

Case categories:

- `person_recall`
- `object_recall`
- `event_recap`
- `relationship_recall`
- `current_recap`
- `citation_grounding`
- `spoiler_safety`

Committed eval cases must avoid raw copyrighted book text, raw prompts, answer text, API keys, local paths, book hashes, and stable private book identifiers. Store only metadata, the user-style question, expected behavior, spoiler mode, optional tags, and label-style notes.

NotebookLM benchmark usage is manual only: compare Readio answers against NotebookLM full-book mode for the same ordinary-reader question set, then record objective metadata in `ReaderAIEvalResult.manualBenchmark`. Do not treat NotebookLM output as a CI oracle and do not copy NotebookLM or Readio answer text into eval records. Manual observations must be short labels such as `more_complete`, `missed_citation`, or `spoiler_boundary_diff`.

For spoiler-protected Readio runs, evaluate only read-so-far evidence. For whole-book manual checks, record `manualBenchmark.mode: 'whole_book'` separately so results are not mixed with deterministic pass/fail.
```

- [ ] **Step 5: Run the focused eval test and verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts
```

Expected: PASS for schema hardening, trace aggregation, and report summary tests.

- [ ] **Step 6: Mark OpenSpec reporting tasks complete**

In `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`, change these lines:

```md
- [ ] 3.1 Add metadata-only eval summary helpers for total cases, category breakdown, pass/fail counts, insufficient-answer counts, citation-valid counts, latency summary, and over-budget stage breakdown.
- [ ] 3.2 Add report tests using synthetic cases/results and trace summaries.
- [ ] 3.3 Document manual NotebookLM full-book benchmark notes as non-authoritative metadata separate from deterministic pass/fail.
```

to:

```md
- [x] 3.1 Add metadata-only eval summary helpers for total cases, category breakdown, pass/fail counts, insufficient-answer counts, citation-valid counts, latency summary, and over-budget stage breakdown.
- [x] 3.2 Add report tests using synthetic cases/results and trace summaries.
- [x] 3.3 Document manual NotebookLM full-book benchmark notes as non-authoritative metadata separate from deterministic pass/fail.
```

- [ ] **Step 7: Commit report summary and docs**

Run:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts apps/readest-app/src/services/ai/eval/readerAIEval.ts apps/readest-app/src/services/ai/eval/README.md openspec/changes/reader-ai-eval-harness-phase-2/tasks.md
git commit -m "feat(readio): summarize reader ai eval reports"
```

Expected: commit succeeds with report summary and README changes only.

## Task 4: Verify, hand off, and close build phase

**Files:**

- Modify: `HANDOFF.md`
- Modify: `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`

- [ ] **Step 1: Run focused eval and diagnostics tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts
```

Expected: PASS for Reader AI eval and diagnostics trace tests.

- [ ] **Step 2: Run app lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS for TypeScript and Biome checks.

- [ ] **Step 3: Run full app test suite**

Run in the background if it is slow:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS for the full Vitest suite.

- [ ] **Step 4: Update HANDOFF.md with scope and validation evidence**

Add a Phase 2 section near the top of `HANDOFF.md` with this content, updating command evidence if any command output differs:

```md
## Reader AI Eval Harness Phase 2

- Change: `reader-ai-eval-harness-phase-2`
- Scope: pure metadata-only utilities under `apps/readest-app/src/services/ai/eval/`; no model calls, real book loading, Reader AI UI changes, prompt changes, retrieval ranking changes, or citation preview changes.
- Implemented:
  - safe optional eval case/result metadata;
  - recursive unsafe-field rejection for persisted eval records;
  - trace-like metadata aggregation by opaque `runId`;
  - category-level report summaries for pass/fail, insufficient answers, citation validity, first-output latency, and over-budget stages;
  - manual NotebookLM benchmark metadata as non-authoritative label-only observations.
- Validation:
  - `pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts` passed.
  - `pnpm --dir apps/readest-app lint` passed.
  - `pnpm --dir apps/readest-app test` passed.
- Deferred:
  - CLI report generation from exported diagnostics;
  - real service-level eval runner around `streamReaderAIAnswer`;
  - LLM-as-judge after deterministic grounding checks stabilize;
  - NotebookLM automation, if ever useful, as a separate change.
```

- [ ] **Step 5: Mark OpenSpec verification tasks complete**

In `openspec/changes/reader-ai-eval-harness-phase-2/tasks.md`, change these lines:

```md
- [ ] 4.1 Run focused eval and diagnostics tests.
- [ ] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [ ] 4.3 Run `pnpm --dir apps/readest-app test`.
- [ ] 4.4 Update `HANDOFF.md` with Phase 2 eval harness scope, validation evidence, and deferred quality-analysis follow-ups.
```

to:

```md
- [x] 4.1 Run focused eval and diagnostics tests.
- [x] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.3 Run `pnpm --dir apps/readest-app test`.
- [x] 4.4 Update `HANDOFF.md` with Phase 2 eval harness scope, validation evidence, and deferred quality-analysis follow-ups.
```

- [ ] **Step 6: Commit verification handoff**

Run:

```bash
git add HANDOFF.md openspec/changes/reader-ai-eval-harness-phase-2/tasks.md
git commit -m "docs(readio): record reader ai eval harness validation"
```

Expected: commit succeeds with verification and handoff docs only.

- [ ] **Step 7: Run Comet build guard**

Run:

```bash
bash "/Users/ppg/.claude/skills/comet/scripts/comet-guard.sh" reader-ai-eval-harness-phase-2 build --apply
```

Expected: all checks pass and `.comet.yaml` transitions to `phase: verify` with `verify_result: pending`.

## Self-Review

- Spec coverage:
  - Eval case/result validation is covered by Task 1.
  - Recursive privacy rejection is covered by Task 1.
  - Trace aggregation by `runId` and safe-field summarization is covered by Task 2.
  - Report summaries and manual benchmark non-authoritative metadata are covered by Task 3.
  - Focused tests, lint, full tests, and handoff are covered by Task 4.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or vague placeholder steps remain.
- Type consistency: `ReaderAITraceRunSummary`, `ReaderAIEvalReport`, `buildReaderAITraceRunSummaries`, and `buildReaderAIEvalReport` signatures are introduced before they are used in later tasks.
