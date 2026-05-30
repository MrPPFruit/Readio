---
change: reader-ai-service-eval-runner
design-doc: docs/superpowers/specs/2026-05-30-reader-ai-service-eval-runner-design.md
base-ref: 076f2e8df5b3bdb70c3ab3f7d38b233e243e0877
---

# Reader AI Service Eval Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a deterministic, dependency-injected Reader AI service eval runner that turns controlled service runs into metadata-only envelopes accepted by the existing eval report runner.

**Architecture:** Add one pure module under `apps/readest-app/src/services/ai/eval/` and one focused test file. The runner accepts eval cases, controlled Reader AI context, and an injected async answer streamer; it records source counts, first-output latency, safe trace metadata, objective pass/fail labels, and returns `{ cases, results, traces }` without file I/O, UI changes, real-book loading, or provider calls by default.

**Tech Stack:** TypeScript, Vitest, existing Reader AI eval types, existing `StreamReaderAIAnswerOptions`/`ReaderAISource` types, existing `buildReaderAIEvalReportRun` validator/report runner.

---

## File Structure

- Create: `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`
  - Owns service eval runner input/output types and `runReaderAIServiceEval`.
  - Depends only on existing type imports and pure eval metadata types.
  - Does not import or call `streamReaderAIAnswer` directly.
  - Does not read/write files, parse CLI args, load books, or call providers.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`
  - Covers deterministic fake-streamer runs, source collection, first-output latency, failure labels, privacy boundaries, and report-runner compatibility.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Adds a short service eval runner section documenting fake-streamer usage and deferred real-book/live-provider scope.
- Existing files used but not structurally changed:
  - `apps/readest-app/src/services/ai/eval/readerAIEval.ts`
  - `apps/readest-app/src/services/ai/eval/readerAIEvalReportRunner.ts`
  - `apps/readest-app/src/services/ai/readerChatService.ts`

---

### Task 1: Add the failing service runner happy-path test

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`
- Create later: `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`

- [x] **Step 1: Write the failing test file with the happy path only**

Create `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  runReaderAIServiceEval,
  type ReaderAIServiceEvalStreamer,
} from '@/services/ai/eval/readerAIServiceEvalRunner';
import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';
import type { ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import type { AISettings } from '@/services/ai/types';

const settings: AISettings = {
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openai',
  providerApiKeys: { openai: 'not-used' },
  providerModels: { openai: 'gpt-test' },
  customProviderBaseUrl: '',
  spoilerProtection: true,
  maxContextChunks: 6,
  indexingMode: 'on-demand',
};

const baseCase: ReaderAIEvalCase = {
  id: 'person-azik-recall',
  category: 'person_recall',
  language: 'zh-CN',
  question: '阿兹克是谁？',
  expectedBehavior: 'Identify the person using cited read-so-far evidence.',
  spoilerMode: 'read_so_far',
};

const createClock = (values: number[]): (() => number) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

describe('runReaderAIServiceEval', () => {
  it('runs controlled cases through an injected streamer and returns a reportable metadata envelope', async () => {
    const calls: StreamReaderAIAnswerOptions[] = [];
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      calls.push(options);
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'private preview must not be returned',
          href: 'readio://private-source',
          confidence: 'exact',
        },
        {
          id: 'source-b',
          chapterTitle: 'Chapter 2',
          previewText: 'another private preview must not be returned',
          href: 'readio://private-source-b',
          confidence: 'section',
        },
      ]);
      yield 'private answer chunk must not be returned';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [baseCase],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          authorName: 'Private Author',
          currentPage: 42,
          currentAIPage: 40,
          messages: [],
        },
      },
      {
        streamAnswer: streamer,
        now: createClock([1000, 1000, 1300]),
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      settings,
      bookHash: 'private-book-hash',
      bookTitle: 'Private Book Title',
      authorName: 'Private Author',
      currentPage: 42,
      currentAIPage: 40,
      messages: [],
      question: '阿兹克是谁？',
      runId: 'person-azik-recall-1',
    });

    expect(envelope.cases).toEqual([baseCase]);
    expect(envelope.results).toEqual([
      {
        caseId: 'person-azik-recall',
        runId: 'person-azik-recall-1',
        classificationIntent: 'unknown',
        sourceCount: 2,
        citationValid: true,
        insufficientAnswer: false,
        firstOutputMs: 300,
        passed: true,
        reasons: ['service_eval_passed'],
        provider: 'openai',
        model: 'gpt-test',
        spoilerMode: 'read_so_far',
        overBudgetStage: 'none',
      },
    ]);
    expect(envelope.traces).toEqual([
      {
        runId: 'person-azik-recall-1',
        stage: 'generation',
        action: 'service_eval_stream',
        status: 'completed',
        durationMs: 300,
        sourceCount: 2,
        firstOutputMs: 300,
        overBudgetStage: 'none',
      },
    ]);

    expect(JSON.stringify(envelope)).not.toContain('private answer chunk');
    expect(JSON.stringify(envelope)).not.toContain('private preview');
    expect(JSON.stringify(envelope)).not.toContain('Private Book Title');
    expect(JSON.stringify(envelope)).not.toContain('Private Author');
    expect(JSON.stringify(envelope)).not.toContain('private-book-hash');
    expect(JSON.stringify(envelope)).not.toContain('readio://private-source');

    const reportOutput = buildReaderAIEvalReportRun(envelope);
    expect(reportOutput.ok).toBe(true);
    if (!reportOutput.ok) throw new Error(reportOutput.issues.join('\n'));
    expect(reportOutput.report.totalCases).toBe(1);
    expect(reportOutput.report.totalResults).toBe(1);
    expect(reportOutput.report.passed).toBe(1);
  });
});
```

- [x] **Step 2: Run the focused test to verify it fails because the module does not exist**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: FAIL with an import/module resolution error for `readerAIServiceEvalRunner`.

- [x] **Step 3: Commit the failing test**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts
git commit -m "test(readio): cover reader ai service eval runner happy path"
```

---

### Task 2: Implement the minimal happy-path runner

**Files:**

- Create: `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`
- Test: `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`

- [x] **Step 1: Add the service eval runner module**

Create `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`:

```ts
import type {
  ReaderAIEvalCase,
  ReaderAIEvalResult,
  ReaderAITraceLike,
} from '@/services/ai/eval/readerAIEval';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import type { AISettings } from '@/services/ai/types';
import type { ReaderAISource } from '@/types/readerAI';

export type ReaderAIServiceEvalStreamer = (
  options: StreamReaderAIAnswerOptions,
) => AsyncGenerator<string>;

export type ReaderAIServiceEvalContext = {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
  messages: StreamReaderAIAnswerOptions['messages'];
  selectionText?: string;
  signal?: AbortSignal;
  loadSectionText?: StreamReaderAIAnswerOptions['loadSectionText'];
};

export type ReaderAIServiceEvalInput = {
  cases: ReaderAIEvalCase[];
  context: ReaderAIServiceEvalContext;
};

export type ReaderAIServiceEvalEnvelope = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
};

export type ReaderAIServiceEvalDeps = {
  streamAnswer: ReaderAIServiceEvalStreamer;
  now?: () => number;
};

const defaultNow = (): number => Date.now();

const createRunId = (evalCase: ReaderAIEvalCase, index: number): string =>
  `${evalCase.id}-${index + 1}`;

const getModelLabel = (settings: AISettings): string =>
  settings.providerModels[settings.provider] ?? '';

export async function runReaderAIServiceEval(
  input: ReaderAIServiceEvalInput,
  deps: ReaderAIServiceEvalDeps,
): Promise<ReaderAIServiceEvalEnvelope> {
  const now = deps.now ?? defaultNow;
  const results: ReaderAIEvalResult[] = [];
  const traces: ReaderAITraceLike[] = [];

  for (const [index, evalCase] of input.cases.entries()) {
    const runId = createRunId(evalCase, index);
    const startedAt = now();
    let firstOutputMs = 0;
    let outputSeen = false;
    let sources: ReaderAISource[] = [];

    const stream = deps.streamAnswer({
      ...input.context,
      question: evalCase.question,
      runId,
      onSources: (emittedSources) => {
        sources = emittedSources;
      },
    });

    for await (const chunk of stream) {
      if (!outputSeen && chunk.length > 0) {
        outputSeen = true;
        firstOutputMs = Math.max(0, now() - startedAt);
      }
    }

    const durationMs = Math.max(firstOutputMs, now() - startedAt);
    const sourceCount = sources.length;
    const passed = outputSeen && sourceCount > 0;

    results.push({
      caseId: evalCase.id,
      runId,
      classificationIntent: 'unknown',
      sourceCount,
      citationValid: sourceCount > 0,
      insufficientAnswer: false,
      firstOutputMs,
      passed,
      reasons: passed ? ['service_eval_passed'] : ['no_output'],
      provider: input.context.settings.provider,
      model: getModelLabel(input.context.settings),
      spoilerMode: evalCase.spoilerMode,
      overBudgetStage: 'none',
    });

    traces.push({
      runId,
      stage: 'generation',
      action: 'service_eval_stream',
      status: passed ? 'completed' : 'failed',
      durationMs,
      sourceCount,
      firstOutputMs,
      overBudgetStage: 'none',
    });
  }

  return { cases: input.cases, results, traces };
}
```

- [x] **Step 2: Run the focused test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: PASS, 1 test passed.

- [x] **Step 3: Commit the minimal runner**

```bash
git add apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts
git commit -m "feat(readio): add reader ai service eval runner"
```

---

### Task 3: Add deterministic failure, insufficient, and abort coverage

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`

- [x] **Step 1: Add failing tests for objective result labels**

Append these tests inside the existing `describe('runReaderAIServiceEval', () => { ... })` block in `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`:

```ts
it('marks no-output runs as failed without storing raw content', async () => {
  const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
    options.onSources?.([]);
    if (options.question === 'never yield') yield '';
  };

  const envelope = await runReaderAIServiceEval(
    {
      cases: [{ ...baseCase, id: 'no-output-case', question: 'never yield' }],
      context: {
        settings,
        bookHash: 'private-book-hash',
        bookTitle: 'Private Book Title',
        authorName: 'Private Author',
        currentPage: 42,
        messages: [],
      },
    },
    { streamAnswer: streamer, now: createClock([2000, 2100]) },
  );

  expect(envelope.results[0]).toMatchObject({
    caseId: 'no-output-case',
    runId: 'no-output-case-1',
    sourceCount: 0,
    citationValid: false,
    insufficientAnswer: false,
    firstOutputMs: 0,
    passed: false,
    reasons: ['no_output', 'missing_sources'],
    overBudgetStage: 'none',
  });
  expect(envelope.traces[0]).toMatchObject({
    runId: 'no-output-case-1',
    status: 'failed',
    durationMs: 100,
    sourceCount: 0,
    firstOutputMs: 0,
  });
});

it('treats expected insufficient evidence as pass and unexpected insufficient evidence as fail', async () => {
  const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
    options.onSources?.([]);
    yield '抱歉，当前阅读进度内没有足够证据回答这个问题。';
  };

  const envelope = await runReaderAIServiceEval(
    {
      cases: [
        {
          ...baseCase,
          id: 'expected-insufficient',
          tags: ['expects_insufficient_evidence'],
        },
        { ...baseCase, id: 'unexpected-insufficient' },
      ],
      context: {
        settings,
        bookHash: 'private-book-hash',
        bookTitle: 'Private Book Title',
        currentPage: 42,
        messages: [],
      },
    },
    { streamAnswer: streamer, now: createClock([3000, 3100, 3200, 3300, 3400, 3500]) },
  );

  expect(envelope.results[0]).toMatchObject({
    caseId: 'expected-insufficient',
    insufficientAnswer: true,
    passed: true,
    reasons: ['expected_insufficient_answer'],
  });
  expect(envelope.results[1]).toMatchObject({
    caseId: 'unexpected-insufficient',
    insufficientAnswer: true,
    passed: false,
    reasons: ['unexpected_insufficient_answer', 'missing_sources'],
  });
});

it('records safe failure labels for thrown stream errors and aborts', async () => {
  const errorStreamer: ReaderAIServiceEvalStreamer = async function* () {
    throw new Error('private source text must not leak');
  };
  const abortedController = new AbortController();
  abortedController.abort();

  const errorEnvelope = await runReaderAIServiceEval(
    {
      cases: [{ ...baseCase, id: 'error-case' }],
      context: {
        settings,
        bookHash: 'private-book-hash',
        bookTitle: 'Private Book Title',
        currentPage: 42,
        messages: [],
      },
    },
    { streamAnswer: errorStreamer, now: createClock([4000, 4120]) },
  );

  const abortEnvelope = await runReaderAIServiceEval(
    {
      cases: [{ ...baseCase, id: 'abort-case' }],
      context: {
        settings,
        bookHash: 'private-book-hash',
        bookTitle: 'Private Book Title',
        currentPage: 42,
        messages: [],
        signal: abortedController.signal,
      },
    },
    { streamAnswer: errorStreamer, now: createClock([5000, 5010]) },
  );

  expect(errorEnvelope.results[0]).toMatchObject({
    caseId: 'error-case',
    passed: false,
    reasons: ['stream_error'],
    firstOutputMs: 0,
    overBudgetStage: 'unknown',
  });
  expect(errorEnvelope.traces[0]).toMatchObject({
    status: 'failed',
    recoveryHint: 'stream_error',
  });
  expect(JSON.stringify(errorEnvelope)).not.toContain('private source text');

  expect(abortEnvelope.results[0]).toMatchObject({
    caseId: 'abort-case',
    passed: false,
    reasons: ['aborted'],
    overBudgetStage: 'cancelled',
  });
  expect(abortEnvelope.traces[0]).toMatchObject({
    status: 'cancelled',
    recoveryHint: 'aborted',
    overBudgetStage: 'cancelled',
  });
});
```

- [x] **Step 2: Run the focused test to verify the new cases fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: FAIL because the runner does not yet handle missing source reasons, insufficient evidence tags, stream errors, or aborted signals.

- [x] **Step 3: Update the service runner with objective scoring and safe failure handling**

Replace the contents of `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts` with:

```ts
import type {
  ReaderAIEvalCase,
  ReaderAIEvalResult,
  ReaderAITraceLike,
} from '@/services/ai/eval/readerAIEval';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import type { AISettings } from '@/services/ai/types';
import type { ReaderAISource } from '@/types/readerAI';

export type ReaderAIServiceEvalStreamer = (
  options: StreamReaderAIAnswerOptions,
) => AsyncGenerator<string>;

export type ReaderAIServiceEvalContext = {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
  messages: StreamReaderAIAnswerOptions['messages'];
  selectionText?: string;
  signal?: AbortSignal;
  loadSectionText?: StreamReaderAIAnswerOptions['loadSectionText'];
};

export type ReaderAIServiceEvalInput = {
  cases: ReaderAIEvalCase[];
  context: ReaderAIServiceEvalContext;
};

export type ReaderAIServiceEvalEnvelope = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
};

export type ReaderAIServiceEvalDeps = {
  streamAnswer: ReaderAIServiceEvalStreamer;
  now?: () => number;
};

type ServiceRunOutcome = {
  status: 'completed' | 'failed' | 'cancelled';
  sourceCount: number;
  firstOutputMs: number;
  durationMs: number;
  outputSeen: boolean;
  insufficientAnswer: boolean;
  recoveryHint: 'none' | 'stream_error' | 'aborted';
  overBudgetStage: ReaderAIEvalResult['overBudgetStage'];
};

const insufficientAnswerPattern =
  /没有足够证据|无法基于当前|当前阅读进度内没有|insufficient evidence/i;
const expectedInsufficientTag = 'expects_insufficient_evidence';

const defaultNow = (): number => Date.now();

const createRunId = (evalCase: ReaderAIEvalCase, index: number): string =>
  `${evalCase.id}-${index + 1}`;

const getModelLabel = (settings: AISettings): string =>
  settings.providerModels[settings.provider] ?? '';

const isExpectedInsufficient = (evalCase: ReaderAIEvalCase): boolean =>
  evalCase.tags?.includes(expectedInsufficientTag) ?? false;

const buildReasons = ({
  outputSeen,
  sourceCount,
  insufficientAnswer,
  expectedInsufficient,
  status,
}: {
  outputSeen: boolean;
  sourceCount: number;
  insufficientAnswer: boolean;
  expectedInsufficient: boolean;
  status: ServiceRunOutcome['status'];
}): string[] => {
  if (status === 'cancelled') return ['aborted'];
  if (status === 'failed') return ['stream_error'];
  if (insufficientAnswer && expectedInsufficient) return ['expected_insufficient_answer'];

  const reasons: string[] = [];
  if (!outputSeen) reasons.push('no_output');
  if (insufficientAnswer && !expectedInsufficient) reasons.push('unexpected_insufficient_answer');
  if (sourceCount === 0 && !expectedInsufficient) reasons.push('missing_sources');
  if (reasons.length === 0) reasons.push('service_eval_passed');
  return reasons;
};

const isPassed = ({
  status,
  outputSeen,
  sourceCount,
  insufficientAnswer,
  expectedInsufficient,
}: {
  status: ServiceRunOutcome['status'];
  outputSeen: boolean;
  sourceCount: number;
  insufficientAnswer: boolean;
  expectedInsufficient: boolean;
}): boolean => {
  if (status !== 'completed') return false;
  if (expectedInsufficient) return insufficientAnswer;
  return outputSeen && sourceCount > 0 && !insufficientAnswer;
};

const buildTrace = ({
  runId,
  outcome,
}: {
  runId: string;
  outcome: ServiceRunOutcome;
}): ReaderAITraceLike => ({
  runId,
  stage: 'generation',
  action: 'service_eval_stream',
  status: outcome.status,
  durationMs: outcome.durationMs,
  sourceCount: outcome.sourceCount,
  firstOutputMs: outcome.firstOutputMs,
  overBudgetStage: outcome.overBudgetStage ?? 'none',
  ...(outcome.recoveryHint === 'none' ? {} : { recoveryHint: outcome.recoveryHint }),
});

const runCase = async ({
  evalCase,
  context,
  streamAnswer,
  now,
  runId,
}: {
  evalCase: ReaderAIEvalCase;
  context: ReaderAIServiceEvalContext;
  streamAnswer: ReaderAIServiceEvalStreamer;
  now: () => number;
  runId: string;
}): Promise<ServiceRunOutcome> => {
  const startedAt = now();
  let firstOutputMs = 0;
  let outputSeen = false;
  let answerPreview = '';
  let sources: ReaderAISource[] = [];

  try {
    const stream = streamAnswer({
      ...context,
      question: evalCase.question,
      runId,
      onSources: (emittedSources) => {
        sources = emittedSources;
      },
    });

    for await (const chunk of stream) {
      if (chunk.length === 0) continue;
      if (!outputSeen) {
        outputSeen = true;
        firstOutputMs = Math.max(0, now() - startedAt);
      }
      answerPreview += chunk;
    }

    const durationMs = Math.max(firstOutputMs, now() - startedAt);
    return {
      status: 'completed',
      sourceCount: sources.length,
      firstOutputMs,
      durationMs,
      outputSeen,
      insufficientAnswer: insufficientAnswerPattern.test(answerPreview),
      recoveryHint: 'none',
      overBudgetStage: 'none',
    };
  } catch {
    const durationMs = Math.max(0, now() - startedAt);
    const aborted = context.signal?.aborted ?? false;
    return {
      status: aborted ? 'cancelled' : 'failed',
      sourceCount: sources.length,
      firstOutputMs,
      durationMs,
      outputSeen,
      insufficientAnswer: false,
      recoveryHint: aborted ? 'aborted' : 'stream_error',
      overBudgetStage: aborted ? 'cancelled' : 'unknown',
    };
  }
};

export async function runReaderAIServiceEval(
  input: ReaderAIServiceEvalInput,
  deps: ReaderAIServiceEvalDeps,
): Promise<ReaderAIServiceEvalEnvelope> {
  const now = deps.now ?? defaultNow;
  const results: ReaderAIEvalResult[] = [];
  const traces: ReaderAITraceLike[] = [];

  for (const [index, evalCase] of input.cases.entries()) {
    const runId = createRunId(evalCase, index);
    const outcome = await runCase({
      evalCase,
      context: input.context,
      streamAnswer: deps.streamAnswer,
      now,
      runId,
    });
    const expectedInsufficient = isExpectedInsufficient(evalCase);
    const passed = isPassed({
      status: outcome.status,
      outputSeen: outcome.outputSeen,
      sourceCount: outcome.sourceCount,
      insufficientAnswer: outcome.insufficientAnswer,
      expectedInsufficient,
    });

    results.push({
      caseId: evalCase.id,
      runId,
      classificationIntent: 'unknown',
      sourceCount: outcome.sourceCount,
      citationValid: outcome.sourceCount > 0,
      insufficientAnswer: outcome.insufficientAnswer,
      firstOutputMs: outcome.firstOutputMs,
      passed,
      reasons: buildReasons({
        outputSeen: outcome.outputSeen,
        sourceCount: outcome.sourceCount,
        insufficientAnswer: outcome.insufficientAnswer,
        expectedInsufficient,
        status: outcome.status,
      }),
      provider: input.context.settings.provider,
      model: getModelLabel(input.context.settings),
      spoilerMode: evalCase.spoilerMode,
      overBudgetStage: outcome.overBudgetStage,
    });

    traces.push(buildTrace({ runId, outcome }));
  }

  return { cases: input.cases, results, traces };
}
```

- [x] **Step 4: Run the focused test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: PASS, all service eval runner tests pass.

- [x] **Step 5: Commit objective scoring behavior**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts
git commit -m "test(readio): cover reader ai service eval outcomes"
```

---

### Task 4: Add trace injection and explicit run id support

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`

- [x] **Step 1: Add failing tests for explicit run ids and safe trace injection**

Append this test inside the existing `describe` block:

```ts
it('uses explicit run ids and sanitizes injected trace-like metadata', async () => {
  const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
    options.onSources?.([
      {
        id: 'source-a',
        chapterTitle: 'Chapter 1',
        previewText: 'private source preview',
        href: 'readio://private-source',
        confidence: 'exact',
      },
    ]);
    yield 'answer text must not be returned';
  };

  const envelope = await runReaderAIServiceEval(
    {
      cases: [baseCase],
      context: {
        settings,
        bookHash: 'private-book-hash',
        bookTitle: 'Private Book Title',
        currentPage: 42,
        messages: [],
      },
      runIds: { 'person-azik-recall': 'explicit-run-123' },
    },
    {
      streamAnswer: streamer,
      now: createClock([6000, 6200, 6300]),
      collectTraceEvents: ({ runId }) => [
        {
          runId,
          stage: 'retrieval',
          action: 'hybrid_search',
          status: 'completed',
          durationMs: 80,
          candidateCount: 4,
          selectedCount: 1,
          sourceCount: 1,
          sourceText: 'private source text',
          prompt: 'private prompt',
          nested: { answerText: 'private answer' },
        },
      ],
    },
  );

  expect(envelope.results[0]?.runId).toBe('explicit-run-123');
  expect(envelope.traces).toEqual([
    {
      runId: 'explicit-run-123',
      stage: 'retrieval',
      action: 'hybrid_search',
      status: 'completed',
      durationMs: 80,
      candidateCount: 4,
      selectedCount: 1,
      sourceCount: 1,
    },
    {
      runId: 'explicit-run-123',
      stage: 'generation',
      action: 'service_eval_stream',
      status: 'completed',
      durationMs: 300,
      sourceCount: 1,
      firstOutputMs: 200,
      overBudgetStage: 'none',
    },
  ]);
  expect(JSON.stringify(envelope)).not.toContain('sourceText');
  expect(JSON.stringify(envelope)).not.toContain('private source text');
  expect(JSON.stringify(envelope)).not.toContain('private prompt');
  expect(JSON.stringify(envelope)).not.toContain('private answer');
});
```

- [x] **Step 2: Run focused tests and verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: FAIL because `runIds` and `collectTraceEvents` are not yet part of the runner contract.

- [x] **Step 3: Add explicit run ids and safe trace collection**

Update `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts` as follows:

1. Change `ReaderAIServiceEvalInput` to include optional run ids:

```ts
export type ReaderAIServiceEvalInput = {
  cases: ReaderAIEvalCase[];
  context: ReaderAIServiceEvalContext;
  runIds?: Record<string, string>;
};
```

2. Change `ReaderAIServiceEvalDeps` to include trace collection:

```ts
export type ReaderAIServiceEvalDeps = {
  streamAnswer: ReaderAIServiceEvalStreamer;
  now?: () => number;
  collectTraceEvents?: (input: {
    runId: string;
    evalCase: ReaderAIEvalCase;
  }) => ReaderAITraceLike[];
};
```

3. Add this helper near `buildTrace`:

```ts
const safeTraceKeys = new Set([
  'runId',
  'stage',
  'action',
  'status',
  'durationMs',
  'candidateCount',
  'selectedCount',
  'sourceCount',
  'issueCount',
  'issueTypeCounts',
  'firstOutputMs',
  'overBudgetStage',
  'recoveryHint',
]);

const sanitizeTraceEvent = (event: ReaderAITraceLike): ReaderAITraceLike => {
  const sanitized: ReaderAITraceLike = {};
  for (const [key, value] of Object.entries(event)) {
    if (safeTraceKeys.has(key)) sanitized[key] = value;
  }
  return sanitized;
};
```

4. In `runReaderAIServiceEval`, replace run id creation with:

```ts
const runId = input.runIds?.[evalCase.id] ?? createRunId(evalCase, index);
```

5. Before pushing the generated trace, collect and sanitize injected traces:

```ts
traces.push(
  ...(deps.collectTraceEvents?.({ runId, evalCase }).map(sanitizeTraceEvent) ?? []),
  buildTrace({ runId, outcome }),
);
```

Remove the old single `traces.push(buildTrace({ runId, outcome }));` line.

- [x] **Step 4: Run focused tests and verify they pass**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts
```

Expected: PASS, all service eval runner tests pass.

- [x] **Step 5: Commit trace injection and run id support**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts
git commit -m "feat(readio): capture service eval trace metadata"
```

---

### Task 5: Document the service eval runner scope

**Files:**

- Modify: `apps/readest-app/src/services/ai/eval/README.md`

- [x] **Step 1: Update the eval README**

Append this section to `apps/readest-app/src/services/ai/eval/README.md`:

```md
## Service eval runner

The service eval runner converts controlled Reader AI service runs into the same metadata-only envelope accepted by `buildReaderAIEvalReportRun` and the `reader-ai:report` CLI.

It is intentionally dependency-injected:

- callers provide the answer stream function;
- tests should use fake streamers;
- a real `streamReaderAIAnswer` call must be wired explicitly by a future caller;
- the runner itself does not choose providers, call APIs, load real books, scan the library, parse EPUB files, write files, upload telemetry, or change Reader AI UI/runtime behavior.

The runner may inspect streamed chunks in memory to derive objective labels such as `no_output`, `unexpected_insufficient_answer`, `stream_error`, or `aborted`, but it must not return raw answer text, source text, prompts, book titles, author names, book hashes, local paths, URLs, API keys, or stable private identifiers.

Real-book fixtures, live-provider cost guardrails, file-based service eval CLI support, NotebookLM automation, and LLM-as-judge are deferred follow-ups.
```

- [x] **Step 2: Commit README update**

```bash
git add apps/readest-app/src/services/ai/eval/README.md
git commit -m "docs(readio): document reader ai service eval runner"
```

---

### Task 6: Run focused and full verification

**Files:**

- No source edits expected.

- [x] **Step 1: Run focused service/report tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: PASS. The output should show both files passing.

- [x] **Step 2: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS. `tsgo --noEmit` and `biome check .` both pass.

- [x] **Step 3: Run full tests in background if needed**

Run:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS. Previous baseline was 214 passed / 2 skipped files and 3869 passed / 7 skipped tests; exact counts may increase by the new test file.

- [x] **Step 4: Run OpenSpec strict validation**

Run:

```bash
openspec validate --all --strict
```

Expected: PASS, including `reader-ai-service-eval-runner`.

---

### Task 7: Update handoff and Comet metadata

**Files:**

- Modify: `HANDOFF.md`
- Modify via Comet scripts/skills: `openspec/changes/reader-ai-service-eval-runner/.comet.yaml`

- [x] **Step 1: Update `HANDOFF.md` with concise state**

Add or update the current section in `HANDOFF.md` with:

```md
## Reader AI service eval runner

Current goal: add an A-first dependency-injected service eval harness that turns controlled Reader AI answer streams into metadata-only eval envelopes. Real-book/live-provider runner remains deferred.

Implemented:

- `runReaderAIServiceEval(input, deps)` under `apps/readest-app/src/services/ai/eval/readerAIServiceEvalRunner.ts`.
- Focused tests under `apps/readest-app/src/__tests__/ai/reader-ai-service-eval-runner.test.ts`.
- Eval README section documenting fake-streamer scope and deferred live/real-book work.

Validation evidence:

- `pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-service-eval-runner.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts`: PASS.
- `pnpm --dir apps/readest-app lint`: PASS.
- `pnpm --dir apps/readest-app test`: PASS.
- `openspec validate --all --strict`: PASS.

Deferred:

- file-based service eval CLI;
- live-provider runner with cost/privacy guardrails;
- real local book fixtures;
- NotebookLM automation;
- LLM-as-judge/manual qualitative layer.
```

- [x] **Step 2: Commit implementation and handoff state if any uncommitted files remain**

Check:

```bash
git status --short
```

If only `HANDOFF.md` and Comet metadata remain changed, commit them:

```bash
git add HANDOFF.md openspec/changes/reader-ai-service-eval-runner/.comet.yaml
git commit -m "docs(readio): record service eval runner validation"
```

Expected: commit succeeds. Do not add `.claude/`, `.codepilot/`, or `.codepilot-uploads/`.

---

### Task 8: Comet verify/archive handoff

**Files:**

- OpenSpec/Comet artifacts under `openspec/changes/reader-ai-service-eval-runner/`
- Verification report under `docs/superpowers/reports/`
- Archive artifacts after Comet archive

- [x] **Step 1: Run Comet verify**

Run via skill:

```text
/comet-verify reader-ai-service-eval-runner
```

Expected: Comet verify passes after checking tasks, implementation, validation evidence, branch status, and OpenSpec strict validation.

- [x] **Step 2: Run Comet archive when verify moves to archive phase**

Run via skill:

```text
/comet-archive reader-ai-service-eval-runner
```

Expected: change moves to `openspec/changes/archive/YYYY-MM-DD-reader-ai-service-eval-runner/`, main specs are updated, and archive metadata is written.

- [x] **Step 3: Validate all OpenSpec specs after archive**

Run:

```bash
openspec validate --all --strict
```

Expected: PASS. If archive tooling overwrites an existing main spec with delta-only content, restore the main spec format with `## Purpose` and `## Requirements`, preserving previous requirements and adding the new service eval runner requirements.

- [x] **Step 4: Commit archive artifacts**

Run:

```bash
git status --short
git add docs/superpowers openspec
git commit -m "docs(comet): archive reader ai service eval runner"
```

Expected: archive commit succeeds. Do not add `.claude/`, `.codepilot/`, or `.codepilot-uploads/`.

---

## Self-Review Notes

- Spec coverage: Tasks cover the injected streamer contract, deterministic run ids, metadata-only output, trace-like metadata, report-runner compatibility, README documentation, verification, and deferred C-style real-book/live-provider runner.
- Scope: Single subsystem only — pure service eval harness. No CLI, UI, provider default, real-book loading, NotebookLM, or LLM-as-judge implementation.
- Type consistency: Plan uses existing `ReaderAIEvalCase`, `ReaderAIEvalResult`, `ReaderAITraceLike`, `StreamReaderAIAnswerOptions`, `AISettings`, and `ReaderAISource` names confirmed in the codebase.
- Privacy: Tests explicitly assert raw answer/source/prompt/book/path/API-like content is not returned; implementation sanitizes injected traces by allowlist.
