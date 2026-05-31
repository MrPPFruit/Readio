---
change: reader-ai-live-fixture-quality-baseline
design-doc: docs/superpowers/specs/2026-05-31-reader-ai-live-fixture-quality-baseline-design.md
base-ref: 38fe8c010a780f22475cdbf9fee2d98d900a0735
---

# Reader AI Live Fixture Quality Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only Reader AI quality baseline workflow that summarizes sanitized live fixture eval metadata into deterministic JSON/Markdown without UI changes, provider calls, NotebookLM automation, or answer-quality tuning.

**Architecture:** Add a pure baseline builder under `services/ai/eval` and a small local CLI wrapper under `scripts/`, mirroring the existing eval report runner pattern. The builder consumes the same metadata-only envelope shape as the report runner, validates case/result safety, rejects inconsistent metadata, aggregates safe labels/counts/buckets, and renders Markdown.

**Tech Stack:** TypeScript ES2022, Vitest, existing Reader AI eval types, existing package scripts via `pnpm --dir apps/readest-app`.

---

## File Structure

- Create: `apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts`
  - Pure validation, aggregation, JSON model, and Markdown rendering for baseline summaries.
  - Must not import streamer, runtime bridge, retrieval prep, UI, browser, or provider modules.
- Create: `apps/readest-app/scripts/reader-ai-quality-baseline.ts`
  - Local CLI wrapper with dependency-injected file IO for tests.
  - Reads one JSON envelope and writes JSON/Markdown outputs after successful validation.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts`
  - Unit tests for pure builder validation, aggregation, privacy, buckets, and manual observation behavior.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts`
  - Unit tests for CLI argument parsing, no-write failure behavior, success writes, and write failures.
- Modify: `apps/readest-app/package.json`
  - Add `reader-ai:baseline` script.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Document local baseline workflow and privacy boundaries.
- Modify: `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`
  - Check off tasks as they complete.

## Constraints

- Do not modify bookshelf UI, reader UI, Reader AI panels, settings UI, or normal app runtime behavior.
- Do not call real providers or networks in tests.
- Do not automate NotebookLM or introduce LLM-as-judge scoring.
- Do not store raw answer text, raw source text, prompts, API keys, custom base URLs, local paths, URLs, book hashes, stable private identifiers, or raw exception details.
- Do not use `any`; use `unknown`, concrete types, or existing exported types.

---

### Task 1: Pure baseline builder tests and implementation

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts`
- Create: `apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts`
- Modify: `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`

- [ ] **Step 1: Write failing tests for valid baseline aggregation**

Create `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts` with these initial tests:

```ts
import { describe, expect, it } from 'vitest';

import { buildReaderAIQualityBaselineRun } from '@/services/ai/eval/readerAIQualityBaselineRunner';

describe('Reader AI quality baseline runner output', () => {
  it('builds deterministic JSON and Markdown baseline summaries from valid metadata inputs', () => {
    const output = buildReaderAIQualityBaselineRun({
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
          id: 'event-recap',
          category: 'event_recap',
          language: 'en',
          question: 'What just happened?',
          expectedBehavior: 'Recap the current event without spoilers.',
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
          reasons: ['service_eval_passed'],
          provider: 'custom-openai-compatible',
          model: 'baseline-model',
          spoilerMode: 'read_so_far',
          overBudgetStage: 'none',
        },
        {
          caseId: 'event-recap',
          runId: 'run-b',
          classificationIntent: 'event_lookup',
          sourceCount: 0,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 8400,
          passed: false,
          reasons: ['missing_sources', 'unexpected_insufficient_answer'],
          provider: 'custom-openai-compatible',
          model: 'baseline-model',
          spoilerMode: 'read_so_far',
          overBudgetStage: 'retrieval',
        },
      ],
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));

    expect(output.baseline).toEqual({
      totalCases: 2,
      totalResults: 2,
      passed: 1,
      failed: 1,
      byCategory: {
        event_recap: {
          total: 1,
          passed: 0,
          failed: 1,
          citationValid: 0,
          insufficientAnswers: 1,
        },
        person_recall: {
          total: 1,
          passed: 1,
          failed: 0,
          citationValid: 1,
          insufficientAnswers: 0,
        },
      },
      byLanguage: {
        en: {
          total: 1,
          passed: 0,
          failed: 1,
          citationValid: 0,
          insufficientAnswers: 1,
        },
        'zh-CN': {
          total: 1,
          passed: 1,
          failed: 0,
          citationValid: 1,
          insufficientAnswers: 0,
        },
      },
      byProviderModel: {
        'custom-openai-compatible/baseline-model': {
          total: 2,
          passed: 1,
          failed: 1,
          citationValid: 1,
          insufficientAnswers: 1,
        },
      },
      reasonCounts: {
        missing_sources: 1,
        service_eval_passed: 1,
        unexpected_insufficient_answer: 1,
      },
      citation: { valid: 1, invalid: 1 },
      sourceCountBuckets: { '0': 1, '1-2': 0, '3-5': 1, '6+': 0 },
      firstOutputLatencyBuckets: { '0-1s': 0, '1-3s': 1, '3-8s': 0, '8s+': 1 },
      overBudgetStages: { none: 1, retrieval: 1 },
      manualObservationCounts: {},
    });
    expect(output.markdown).toContain('# Reader AI Quality Baseline');
    expect(output.markdown).toContain('## Overview');
    expect(output.markdown).toContain('## Category Summary');
    expect(output.markdown).toContain('| person_recall | 1 | 1 | 0 | 1 | 0 |');
    expect(output.markdown).not.toContain('阿兹克是谁');
    expect(output.markdown).not.toContain('What just happened');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts
```

Expected: FAIL because `readerAIQualityBaselineRunner` does not exist.

- [ ] **Step 3: Implement the pure baseline builder**

Create `apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts`:

```ts
import {
  type ReaderAIEvalCase,
  type ReaderAIEvalResult,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

export type ReaderAIQualityBaselineGroupSummary = {
  total: number;
  passed: number;
  failed: number;
  citationValid: number;
  insufficientAnswers: number;
};

export type ReaderAIQualityBaseline = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<string, ReaderAIQualityBaselineGroupSummary>;
  byLanguage: Record<string, ReaderAIQualityBaselineGroupSummary>;
  byProviderModel: Record<string, ReaderAIQualityBaselineGroupSummary>;
  reasonCounts: Record<string, number>;
  citation: { valid: number; invalid: number };
  sourceCountBuckets: Record<'0' | '1-2' | '3-5' | '6+', number>;
  firstOutputLatencyBuckets: Record<'0-1s' | '1-3s' | '3-8s' | '8s+', number>;
  overBudgetStages: Record<string, number>;
  manualObservationCounts: Record<string, number>;
};

export type ReaderAIQualityBaselineRunnerOutput =
  | { ok: true; baseline: ReaderAIQualityBaseline; markdown: string; issues: [] }
  | { ok: false; baseline: null; markdown: ''; issues: string[] };

type ParsedEnvelope = {
  cases: unknown[];
  results: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createGroupSummary = (): ReaderAIQualityBaselineGroupSummary => ({
  total: 0,
  passed: 0,
  failed: 0,
  citationValid: 0,
  insufficientAnswers: 0,
});

const addCount = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const incrementGroup = (
  groups: Record<string, ReaderAIQualityBaselineGroupSummary>,
  key: string,
  result: ReaderAIEvalResult,
): void => {
  const summary = groups[key] ?? createGroupSummary();
  groups[key] = summary;
  summary.total += 1;
  if (result.passed) summary.passed += 1;
  else summary.failed += 1;
  if (result.citationValid) summary.citationValid += 1;
  if (result.insufficientAnswer) summary.insufficientAnswers += 1;
};

const parseEnvelope = (
  input: unknown,
): { ok: true; envelope: ParsedEnvelope } | { ok: false; issues: string[] } => {
  if (!isRecord(input)) return { ok: false, issues: ['input must be an object'] };

  const issues: string[] = [];
  const cases = input['cases'];
  const results = input['results'];

  if (!Array.isArray(cases)) issues.push('cases must be an array');
  if (!Array.isArray(results)) issues.push('results must be an array');

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, envelope: { cases: cases as unknown[], results: results as unknown[] } };
};

const validateCases = (cases: unknown[]): { cases: ReaderAIEvalCase[]; issues: string[] } => {
  const validCases: ReaderAIEvalCase[] = [];
  const issues: string[] = [];

  cases.forEach((evalCase, index) => {
    const validation = validateReaderAIEvalCase(evalCase);
    if (validation.valid) validCases.push(evalCase as ReaderAIEvalCase);
    else issues.push(...validation.issues.map((issue) => `cases[${index}].${issue}`));
  });

  return { cases: validCases, issues };
};

const validateResults = (
  results: unknown[],
): { results: ReaderAIEvalResult[]; issues: string[] } => {
  const validResults: ReaderAIEvalResult[] = [];
  const issues: string[] = [];

  results.forEach((evalResult, index) => {
    const validation = validateReaderAIEvalResult(evalResult);
    if (validation.valid) validResults.push(evalResult as ReaderAIEvalResult);
    else issues.push(...validation.issues.map((issue) => `results[${index}].${issue}`));
  });

  return { results: validResults, issues };
};

const sourceCountBucket = (
  sourceCount: number,
): keyof ReaderAIQualityBaseline['sourceCountBuckets'] => {
  if (sourceCount === 0) return '0';
  if (sourceCount <= 2) return '1-2';
  if (sourceCount <= 5) return '3-5';
  return '6+';
};

const latencyBucket = (
  firstOutputMs: number,
): keyof ReaderAIQualityBaseline['firstOutputLatencyBuckets'] => {
  if (firstOutputMs < 1000) return '0-1s';
  if (firstOutputMs < 3000) return '1-3s';
  if (firstOutputMs < 8000) return '3-8s';
  return '8s+';
};

const providerModelKey = (result: ReaderAIEvalResult): string => {
  const provider = result.provider?.trim() || 'unknown_provider';
  const model = result.model?.trim() || 'unknown_model';
  return `${provider}/${model}`;
};

const createEmptyBaseline = (
  cases: ReaderAIEvalCase[],
  results: ReaderAIEvalResult[],
): ReaderAIQualityBaseline => {
  const passed = results.filter((result) => result.passed).length;
  return {
    totalCases: cases.length,
    totalResults: results.length,
    passed,
    failed: results.length - passed,
    byCategory: {},
    byLanguage: {},
    byProviderModel: {},
    reasonCounts: {},
    citation: { valid: 0, invalid: 0 },
    sourceCountBuckets: { '0': 0, '1-2': 0, '3-5': 0, '6+': 0 },
    firstOutputLatencyBuckets: { '0-1s': 0, '1-3s': 0, '3-8s': 0, '8s+': 0 },
    overBudgetStages: {},
    manualObservationCounts: {},
  };
};

const sortedEntries = (counts: Record<string, number>): Array<[string, number]> =>
  Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));

const renderCountMap = (counts: Record<string, number>): string => {
  const entries = sortedEntries(counts);
  return entries.length === 0
    ? '- none'
    : entries.map(([key, count]) => `- ${key}: ${count}`).join('\n');
};

const renderGroupTable = (
  groups: Record<string, ReaderAIQualityBaselineGroupSummary>,
): string[] => {
  const rows = sortedEntries(groups).map(([key]) => {
    const summary = groups[key];
    if (summary === undefined) throw new Error(`Missing baseline group: ${key}`);
    return `| ${key} | ${summary.total} | ${summary.passed} | ${summary.failed} | ${summary.citationValid} | ${summary.insufficientAnswers} |`;
  });
  return rows.length > 0 ? rows : ['| none | 0 | 0 | 0 | 0 | 0 |'];
};

export function renderReaderAIQualityBaselineMarkdown(baseline: ReaderAIQualityBaseline): string {
  return [
    '# Reader AI Quality Baseline',
    '',
    '## Overview',
    '',
    `- Total cases: ${baseline.totalCases}`,
    `- Total results: ${baseline.totalResults}`,
    `- Passed: ${baseline.passed}`,
    `- Failed: ${baseline.failed}`,
    '',
    '## Category Summary',
    '',
    '| Category | Total | Passed | Failed | Citation Valid | Insufficient |',
    '|---|---:|---:|---:|---:|---:|',
    ...renderGroupTable(baseline.byCategory),
    '',
    '## Language Summary',
    '',
    '| Language | Total | Passed | Failed | Citation Valid | Insufficient |',
    '|---|---:|---:|---:|---:|---:|',
    ...renderGroupTable(baseline.byLanguage),
    '',
    '## Provider / Model Summary',
    '',
    '| Provider / Model | Total | Passed | Failed | Citation Valid | Insufficient |',
    '|---|---:|---:|---:|---:|---:|',
    ...renderGroupTable(baseline.byProviderModel),
    '',
    '## Reason Counts',
    '',
    renderCountMap(baseline.reasonCounts),
    '',
    '## Buckets',
    '',
    '### Source Count',
    '',
    renderCountMap(baseline.sourceCountBuckets),
    '',
    '### First Output Latency',
    '',
    renderCountMap(baseline.firstOutputLatencyBuckets),
    '',
    '## Over-Budget Stages',
    '',
    renderCountMap(baseline.overBudgetStages),
    '',
    '## Manual Observation Labels',
    '',
    renderCountMap(baseline.manualObservationCounts),
    '',
  ].join('\n');
}

export function buildReaderAIQualityBaselineRun(
  input: unknown,
): ReaderAIQualityBaselineRunnerOutput {
  const parsed = parseEnvelope(input);
  if (!parsed.ok) return { ok: false, baseline: null, markdown: '', issues: parsed.issues };

  const caseValidation = validateCases(parsed.envelope.cases);
  const resultValidation = validateResults(parsed.envelope.results);
  const issues = [...caseValidation.issues, ...resultValidation.issues];
  if (issues.length > 0) return { ok: false, baseline: null, markdown: '', issues };

  const casesById = new Map(caseValidation.cases.map((evalCase) => [evalCase.id, evalCase]));
  resultValidation.results.forEach((result, index) => {
    if (!casesById.has(result.caseId)) {
      issues.push(`results[${index}].caseId does not match an input case`);
    }
  });
  if (issues.length > 0) return { ok: false, baseline: null, markdown: '', issues };

  const baseline = createEmptyBaseline(caseValidation.cases, resultValidation.results);

  for (const result of resultValidation.results) {
    const evalCase = casesById.get(result.caseId);
    if (evalCase === undefined) throw new Error(`Expected validated caseId: ${result.caseId}`);

    incrementGroup(baseline.byCategory, evalCase.category, result);
    incrementGroup(baseline.byLanguage, evalCase.language, result);
    incrementGroup(baseline.byProviderModel, providerModelKey(result), result);

    result.reasons.forEach((reason) => addCount(baseline.reasonCounts, reason));
    if (result.citationValid) baseline.citation.valid += 1;
    else baseline.citation.invalid += 1;
    baseline.sourceCountBuckets[sourceCountBucket(result.sourceCount)] += 1;
    baseline.firstOutputLatencyBuckets[latencyBucket(result.firstOutputMs)] += 1;
    addCount(baseline.overBudgetStages, result.overBudgetStage ?? 'none');
    result.manualBenchmark?.observations.forEach((observation) =>
      addCount(baseline.manualObservationCounts, observation),
    );
  }

  return {
    ok: true,
    baseline,
    markdown: renderReaderAIQualityBaselineMarkdown(baseline),
    issues: [],
  };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mark OpenSpec task 1.1 and 1.3 complete**

Edit `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`:

```md
- [x] 1.1 Add failing tests for building a quality baseline summary from valid metadata-only eval envelopes.
- [ ] 1.2 Add failing tests for rejecting unsafe baseline input fields and preventing partial artifact writes.
- [x] 1.3 Implement baseline metadata validation and deterministic aggregation by category, language, provider/model label, pass/fail, reason, citation, source-count bucket, latency bucket, and over-budget stage.
```

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md
git commit -m "$(cat <<'EOF'
test(readio): add reader ai quality baseline summary

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Baseline privacy and manual observation tests

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts`
- Modify: `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`

- [ ] **Step 1: Add failing tests for invalid, inconsistent, unsafe, and manual-observation behavior**

Append these tests to `reader-ai-quality-baseline-runner.test.ts`:

```ts
describe('Reader AI quality baseline runner validation', () => {
  it('rejects malformed envelope fields', () => {
    expect(buildReaderAIQualityBaselineRun(null)).toEqual({
      ok: false,
      baseline: null,
      markdown: '',
      issues: ['input must be an object'],
    });

    expect(buildReaderAIQualityBaselineRun({ cases: {}, results: [] })).toEqual({
      ok: false,
      baseline: null,
      markdown: '',
      issues: ['cases must be an array'],
    });
  });

  it('rejects unsafe metadata without returning private values', () => {
    const output = buildReaderAIQualityBaselineRun({
      cases: [
        {
          id: 'unsafe-case',
          category: 'citation_grounding',
          language: 'zh-CN',
          question: '引用是否可靠？',
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

  it('rejects result caseIds that do not match input cases', () => {
    const output = buildReaderAIQualityBaselineRun({
      cases: [
        {
          id: 'known-case',
          category: 'person_recall',
          language: 'zh-CN',
          question: '这个人是谁？',
          expectedBehavior: 'Identify the person.',
          spoilerMode: 'read_so_far',
        },
      ],
      results: [
        {
          caseId: 'missing-case',
          runId: 'run-a',
          classificationIntent: 'entity_lookup',
          sourceCount: 1,
          citationValid: true,
          insufficientAnswer: false,
          firstOutputMs: 900,
          passed: true,
          reasons: ['service_eval_passed'],
        },
      ],
    });

    expect(output).toEqual({
      ok: false,
      baseline: null,
      markdown: '',
      issues: ['results[0].caseId does not match an input case'],
    });
  });

  it('counts manual observation labels separately without changing pass/fail totals', () => {
    const output = buildReaderAIQualityBaselineRun({
      cases: [
        {
          id: 'manual-case',
          category: 'relationship_recall',
          language: 'zh-CN',
          question: '他们是什么关系？',
          expectedBehavior: 'Describe relationship using safe metadata.',
          spoilerMode: 'read_so_far',
        },
      ],
      results: [
        {
          caseId: 'manual-case',
          runId: 'run-manual',
          classificationIntent: 'relationship_lookup',
          sourceCount: 2,
          citationValid: false,
          insufficientAnswer: false,
          firstOutputMs: 2600,
          passed: false,
          reasons: ['missed_citation'],
          manualBenchmark: {
            source: 'notebooklm',
            mode: 'whole_book',
            observations: ['more_complete', 'missed_citation'],
          },
        },
      ],
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));
    expect(output.baseline.passed).toBe(0);
    expect(output.baseline.failed).toBe(1);
    expect(output.baseline.manualObservationCounts).toEqual({
      missed_citation: 1,
      more_complete: 1,
    });
    expect(output.markdown).toContain('- more_complete: 1');
  });
});
```

- [ ] **Step 2: Run focused tests and verify failures if implementation is incomplete**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts
```

Expected: PASS if Task 1 implementation already includes all validation; otherwise FAIL on missing consistency/manual behavior.

- [ ] **Step 3: Patch implementation only if tests fail**

If the tests fail, update `readerAIQualityBaselineRunner.ts` so it:

```ts
resultValidation.results.forEach((result, index) => {
  if (!casesById.has(result.caseId)) {
    issues.push(`results[${index}].caseId does not match an input case`);
  }
});
```

and counts manual observations with:

```ts
result.manualBenchmark?.observations.forEach((observation) =>
  addCount(baseline.manualObservationCounts, observation),
);
```

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mark OpenSpec tasks 1.2 and 3.1 complete**

Edit `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`:

```md
- [x] 1.2 Add failing tests for rejecting unsafe baseline input fields and preventing partial artifact writes.
- [x] 3.1 Add tests proving manual NotebookLM/human observation labels are reported separately and do not affect deterministic pass/fail totals.
```

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIQualityBaselineRunner.ts openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md
git commit -m "$(cat <<'EOF'
test(readio): enforce quality baseline privacy labels

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Baseline CLI tests and implementation

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts`
- Create: `apps/readest-app/scripts/reader-ai-quality-baseline.ts`
- Modify: `apps/readest-app/package.json`
- Modify: `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`

- [ ] **Step 1: Write failing CLI tests**

Create `apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { runReaderAIQualityBaselineCli } from '../../../scripts/reader-ai-quality-baseline';

type MemoryCliIO = {
  files: Map<string, string>;
  errors: string[];
  writes: string[];
  failWrites: Set<string>;
};

const createMemoryIO = (initialFiles: Record<string, string> = {}): MemoryCliIO => ({
  files: new Map(Object.entries(initialFiles)),
  errors: [],
  writes: [],
  failWrites: new Set(),
});

const toCliIO = (memory: MemoryCliIO) => ({
  readFile: async (path: string): Promise<string> => {
    const value = memory.files.get(path);
    if (value === undefined) throw new Error(`missing file: ${path}`);
    return value;
  },
  writeFile: async (path: string, content: string): Promise<void> => {
    if (memory.failWrites.has(path)) throw new Error(`write failed: ${path}`);
    memory.writes.push(path);
    memory.files.set(path, content);
  },
  stderr: (message: string): void => {
    memory.errors.push(message);
  },
});

const validEnvelope = {
  cases: [
    {
      id: 'person-azik-recall',
      category: 'person_recall',
      language: 'zh-CN',
      question: '阿兹克是谁？',
      expectedBehavior: 'Identify the person using cited read-so-far evidence.',
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
      reasons: ['service_eval_passed'],
      provider: 'custom-openai-compatible',
      model: 'baseline-model',
      overBudgetStage: 'none',
    },
  ],
};

describe('Reader AI quality baseline CLI usage', () => {
  it('rejects missing required arguments without writing outputs', async () => {
    const memory = createMemoryIO();

    const exitCode = await runReaderAIQualityBaselineCli(
      ['--input', 'input.json'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual([
      'Missing required argument: --json-out',
      'Missing required argument: --markdown-out',
    ]);
    expect(memory.writes).toEqual([]);
  });

  it('rejects invalid JSON without writing outputs', async () => {
    const memory = createMemoryIO({ 'input.json': '{not json' });

    const exitCode = await runReaderAIQualityBaselineCli(
      ['--input', 'input.json', '--json-out', 'baseline.json', '--markdown-out', 'baseline.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Invalid JSON input: input.json']);
    expect(memory.writes).toEqual([]);
  });

  it('rejects unsafe metadata without writing outputs', async () => {
    const memory = createMemoryIO({
      'input.json': JSON.stringify({
        cases: [
          {
            id: 'unsafe-case',
            category: 'citation_grounding',
            language: 'zh-CN',
            question: '引用是否可靠？',
            expectedBehavior: 'Check citation support.',
            spoilerMode: 'read_so_far',
            metadata: { sourceText: 'private source passage' },
          },
        ],
        results: [],
      }),
    });

    const exitCode = await runReaderAIQualityBaselineCli(
      ['--input', 'input.json', '--json-out', 'baseline.json', '--markdown-out', 'baseline.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual([
      'cases[0].metadata.sourceText is not allowed in Reader AI eval metadata',
    ]);
    expect(memory.writes).toEqual([]);
    expect(memory.files.has('baseline.json')).toBe(false);
    expect(memory.files.has('baseline.md')).toBe(false);
  });

  it('writes sanitized baseline JSON and Markdown for valid input', async () => {
    const memory = createMemoryIO({ 'input.json': JSON.stringify(validEnvelope) });

    const exitCode = await runReaderAIQualityBaselineCli(
      [
        '--',
        '--input',
        'input.json',
        '--json-out',
        'baseline.json',
        '--markdown-out',
        'baseline.md',
      ],
      toCliIO(memory),
    );

    expect(exitCode).toBe(0);
    expect(memory.errors).toEqual([]);
    expect(memory.writes).toEqual(['baseline.json', 'baseline.md']);

    const baselineJson = memory.files.get('baseline.json') ?? '';
    const baselineMarkdown = memory.files.get('baseline.md') ?? '';
    expect(JSON.parse(baselineJson)).toMatchObject({
      totalCases: 1,
      totalResults: 1,
      passed: 1,
      failed: 0,
      sourceCountBuckets: { '0': 0, '1-2': 0, '3-5': 1, '6+': 0 },
    });
    expect(baselineMarkdown).toContain('# Reader AI Quality Baseline');
    expect(`${baselineJson}\n${baselineMarkdown}`).not.toContain('阿兹克是谁');
  });

  it('returns non-zero when an output write fails', async () => {
    const memory = createMemoryIO({ 'input.json': JSON.stringify(validEnvelope) });
    memory.failWrites.add('baseline.json');

    const exitCode = await runReaderAIQualityBaselineCli(
      ['--input', 'input.json', '--json-out', 'baseline.json', '--markdown-out', 'baseline.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Unable to write baseline output']);
    expect(memory.files.has('baseline.json')).toBe(false);
    expect(memory.files.has('baseline.md')).toBe(false);
  });
});
```

- [ ] **Step 2: Run CLI tests and verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts
```

Expected: FAIL because `scripts/reader-ai-quality-baseline.ts` does not exist.

- [ ] **Step 3: Implement CLI wrapper**

Create `apps/readest-app/scripts/reader-ai-quality-baseline.ts`:

```ts
import { buildReaderAIQualityBaselineRun } from '@/services/ai/eval/readerAIQualityBaselineRunner';

export type ReaderAIQualityBaselineCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

type ReaderAIQualityBaselineCliArgs = {
  input?: string;
  jsonOut?: string;
  markdownOut?: string;
};

const requiredArgs: Array<[keyof ReaderAIQualityBaselineCliArgs, string]> = [
  ['input', '--input'],
  ['jsonOut', '--json-out'],
  ['markdownOut', '--markdown-out'],
];

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAIQualityBaselineCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAIQualityBaselineCliArgs = {};
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (index === 0 && token === '--') continue;

    if (token === '--input') {
      if (value === undefined || value.startsWith('--'))
        issues.push('Missing value for argument: --input');
      else {
        args.input = value;
        index += 1;
      }
      continue;
    }

    if (token === '--json-out') {
      if (value === undefined || value.startsWith('--'))
        issues.push('Missing value for argument: --json-out');
      else {
        args.jsonOut = value;
        index += 1;
      }
      continue;
    }

    if (token === '--markdown-out') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --markdown-out');
      } else {
        args.markdownOut = value;
        index += 1;
      }
      continue;
    }

    issues.push(`Unknown argument: ${token}`);
  }

  if (issues.length === 0) {
    requiredArgs.forEach(([key, flag]) => {
      if (args[key] === undefined) issues.push(`Missing required argument: ${flag}`);
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, args };
};

const parseJsonInput = (content: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch {
    return { ok: false };
  }
};

export async function runReaderAIQualityBaselineCli(
  argv: string[],
  io: ReaderAIQualityBaselineCliIO,
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const { input, jsonOut, markdownOut } = parsedArgs.args;
  if (input === undefined || jsonOut === undefined || markdownOut === undefined) {
    io.stderr('Missing required baseline file paths');
    return 1;
  }

  let inputContent: string;
  try {
    inputContent = await io.readFile(input);
  } catch {
    io.stderr(`Unable to read input: ${input}`);
    return 1;
  }

  const parsedJson = parseJsonInput(inputContent);
  if (!parsedJson.ok) {
    io.stderr(`Invalid JSON input: ${input}`);
    return 1;
  }

  const output = buildReaderAIQualityBaselineRun(parsedJson.value);
  if (!output.ok) {
    output.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const jsonOutput = `${JSON.stringify(output.baseline, null, 2)}\n`;
  const markdownOutput = output.markdown;

  try {
    await io.writeFile(jsonOut, jsonOutput);
    await io.writeFile(markdownOut, markdownOutput);
  } catch {
    io.stderr('Unable to write baseline output');
    return 1;
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const nodeIO: ReaderAIQualityBaselineCliIO = {
    readFile: (path: string): Promise<string> => readFile(path, 'utf8'),
    writeFile,
    stderr: (message: string): void => {
      console.error(message);
    },
  };

  process.exitCode = await runReaderAIQualityBaselineCli(process.argv.slice(2), nodeIO);
}
```

- [ ] **Step 4: Add package script**

Modify `apps/readest-app/package.json` scripts section:

```json
"reader-ai:report": "tsx scripts/reader-ai-eval-report.ts",
"reader-ai:baseline": "tsx scripts/reader-ai-quality-baseline.ts",
"reader-ai:live-fixture": "tsx scripts/reader-ai-live-fixture-eval.ts"
```

- [ ] **Step 5: Run CLI focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run both baseline focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts
```

Expected: PASS.

- [ ] **Step 7: Mark OpenSpec tasks 2.1, 2.2, and 2.3 complete**

Edit `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`:

```md
- [x] 2.1 Add failing tests for a local baseline runner or CLI wrapper that reads sanitized eval artifacts and writes JSON/Markdown outputs.
- [x] 2.2 Implement the minimal local baseline runner or CLI wrapper without calling providers, reading runtime settings, preparing retrieval, automating NotebookLM, or changing UI/runtime app behavior.
- [x] 2.3 Ensure invalid input, unsafe metadata, and output write failures fail closed without partial baseline artifacts.
```

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts apps/readest-app/scripts/reader-ai-quality-baseline.ts apps/readest-app/package.json openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md
git commit -m "$(cat <<'EOF'
feat(readio): add reader ai quality baseline cli

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Documentation and final validation

**Files:**

- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`
- Modify if needed: baseline runner/CLI test files for final privacy coverage gaps

- [ ] **Step 1: Update eval README**

In `apps/readest-app/src/services/ai/eval/README.md`, add this section after the local live fixture runner section:

````md
## Local quality baseline runner

The quality baseline runner summarizes metadata-only Reader AI live fixture envelopes into deterministic JSON and Markdown baseline snapshots. It is a local developer workflow only: it does not call model providers, load books, prepare retrieval seeds, automate NotebookLM, upload telemetry, or change Reader AI UI/runtime behavior.

```bash
pnpm --dir apps/readest-app reader-ai:baseline -- \
  --input tmp/reader-ai/live-fixture/envelope.json \
  --json-out tmp/reader-ai/live-fixture/baseline.json \
  --markdown-out tmp/reader-ai/live-fixture/baseline.md
```
````

The baseline summarizes safe metadata only:

- total cases and results;
- category, language, and provider/model counts;
- pass/fail totals;
- failure reason labels;
- citation-valid counts;
- source-count buckets;
- first-output latency buckets;
- over-budget stage counts;
- optional manual NotebookLM/human observation label counts.

Manual NotebookLM or human observations are non-authoritative labels. They do not change deterministic pass/fail totals, and copied NotebookLM or Readio answer text must not be stored in eval cases, results, or baseline artifacts.

Generated baseline artifacts are developer evidence, not telemetry. Do not commit generated baseline files unless they have been reviewed for the metadata-only contract. They must not contain raw answer text, source text, prompt text, API keys, custom base URLs, local paths, URLs, book hashes, stable private identifiers, raw exception details, or copied NotebookLM/Readio output.

````

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-quality-baseline-runner.test.ts src/__tests__/ai/reader-ai-quality-baseline-cli.test.ts
````

Expected: PASS.

- [ ] **Step 3: Run eval report regression tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-runner.test.ts src/__tests__/ai/reader-ai-eval-report-cli.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS.

- [ ] **Step 5: Run full app tests**

Because this can be long-running, run it in background if using Claude Code tools:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS.

- [ ] **Step 6: Run OpenSpec strict validation**

Run:

```bash
openspec validate --all --strict
```

Expected: PASS.

- [ ] **Step 7: Mark OpenSpec tasks 3.2 and 3.3 complete**

Edit `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md`:

```md
- [x] 3.2 Update eval README with the quality baseline workflow, privacy boundaries, and guidance that generated artifacts require review before commit.
- [x] 3.3 Run focused eval tests, lint, full app test suite, and `openspec validate --all --strict`.
```

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/readest-app/src/services/ai/eval/README.md openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md
git commit -m "$(cat <<'EOF'
docs(readio): document reader ai quality baseline workflow

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Build-Phase Checklist

- [ ] `openspec/changes/reader-ai-live-fixture-quality-baseline/tasks.md` has all tasks checked.
- [ ] Focused baseline tests pass.
- [ ] Eval report/live fixture regression tests pass.
- [ ] `pnpm --dir apps/readest-app lint` passes.
- [ ] `pnpm --dir apps/readest-app test` passes.
- [ ] `openspec validate --all --strict` passes.
- [ ] No generated real-book baseline artifacts are staged.
- [ ] No UI files are modified.
- [ ] All implementation changes are committed.

## Self-Review Notes

Spec coverage:

- Quality baseline metadata summary: Task 1 implements category/language/provider/model/pass/fail/reason/citation/source/latency/over-budget aggregation.
- Invalid and unsafe metadata rejection: Task 2 and Task 3 cover pure builder and CLI no-write behavior.
- Manual observations non-authoritative: Task 2 verifies manual labels are counted separately and pass/fail totals remain deterministic.
- Live fixture output compatibility: Task 3 consumes existing envelope shape and Task 4 runs live fixture/report regression tests.
- No UI/runtime behavior changes: documented in constraints and final checklist.

Placeholder scan: no implementation placeholders are required; all code-oriented tasks include concrete snippets and commands.

Type consistency: runner exports `buildReaderAIQualityBaselineRun`, `ReaderAIQualityBaseline`, and `ReaderAIQualityBaselineRunnerOutput`; CLI exports `runReaderAIQualityBaselineCli`, matching test imports.
