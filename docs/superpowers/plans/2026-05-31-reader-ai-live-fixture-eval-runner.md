---
change: reader-ai-live-fixture-eval-runner
design-doc: docs/superpowers/specs/2026-05-31-reader-ai-live-fixture-eval-runner-design.md
base-ref: 88855abbd10a74e07d971b97d9ff1e99523d8ee8
archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner
---

# Reader AI Live Fixture Eval Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guarded local Reader AI live fixture eval runner that reads an explicit metadata-only fixture, requires live opt-in for provider execution, delegates to the existing service eval runner, and writes sanitized eval/report artifacts.

**Architecture:** Add one focused script-facing module for fixture validation/orchestration and one thin CLI entry script. The module owns fixture parsing, safety checks, case limits, timeout/abort handling, and report writing; it reuses `runReaderAIServiceEval` and `buildReaderAIEvalReportRun` for scoring/reporting and never changes Reader AI runtime behavior.

**Tech Stack:** TypeScript, Vitest, Node `fs/promises`, existing `StreamReaderAIAnswerOptions`, existing Reader AI eval/report/service runner types, existing `tsx` script pattern.

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

## File Structure

- Create: `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
  - Thin Node/tsx CLI entrypoint.
  - Imports the script-facing runner module and wires real file I/O.
  - Exposes `runReaderAILiveFixtureEvalCli(argv, io, deps)` for tests.
  - Does not execute when imported by tests.
- Create: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
  - Owns live fixture input types, validation, argument parsing, safety gates, orchestration, and metadata-only output writing.
  - Depends on `runReaderAIServiceEval` and `buildReaderAIEvalReportRun`.
  - Accepts injected streamer dependencies for tests and explicit live runs.
  - Does not scan local library, change Reader AI behavior, or store raw answers/sources/prompts.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
  - Covers fixture validation, missing live opt-in, fake-streamer execution, case limit, timeout/abort, report writing, and privacy assertions.
- Modify: `apps/readest-app/package.json`
  - Add `reader-ai:live-fixture` script pointing to `tsx scripts/reader-ai-live-fixture-eval.ts`.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Document local live fixture usage, ignored/local fixture recommendation, explicit `--live`, privacy boundaries, and deferred scope.
- Modify: `HANDOFF.md`
  - Record scope, validation evidence, and deferred follow-ups after implementation.
- Modify: `openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md`
  - Check off tasks as they are completed.

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

### Task 1: Add fixture parser and validation tests

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Create later: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`

- [ ] **Step 1: Write failing tests for valid and unsafe fixture parsing**

Create `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  parseReaderAILiveFixture,
  validateReaderAILiveFixture,
} from '@/services/ai/eval/readerAILiveFixtureEvalRunner';

const validFixture = {
  fixtureId: 'local-smoke-001',
  live: false,
  caseLimit: 2,
  timeoutMs: 60000,
  settings: {
    provider: 'openai',
    model: 'gpt-test',
  },
  runtimeBook: {
    label: 'local-test-book',
    bookHash: 'runtime-private-book-hash',
    bookTitle: 'Runtime Private Title',
    authorName: 'Runtime Private Author',
    currentPage: 42,
    currentAIPage: 40,
  },
  outputs: {
    envelope: 'tmp/reader-ai/live-fixture/envelope.json',
    reportJson: 'tmp/reader-ai/live-fixture/report.json',
    reportMarkdown: 'tmp/reader-ai/live-fixture/report.md',
  },
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
};

describe('Reader AI live fixture validation', () => {
  it('accepts a metadata-only fixture with runtime-only book context', () => {
    const parsed = parseReaderAILiveFixture(JSON.stringify(validFixture));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
    expect(parsed.fixture.fixtureId).toBe('local-smoke-001');
    expect(parsed.fixture.cases).toHaveLength(1);
    expect(parsed.fixture.runtimeBook.currentPage).toBe(42);
  });

  it('rejects unsafe persisted fixture metadata before execution', () => {
    const fixture = {
      ...validFixture,
      cases: [
        {
          ...validFixture.cases[0],
          metadata: {
            sourceText: 'private source text must not be persisted',
          },
        },
      ],
      outputs: {
        ...validFixture.outputs,
        reportJson: 'https://example.invalid/report.json',
      },
    };

    const validation = validateReaderAILiveFixture(fixture);

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected validation failure');
    expect(validation.issues).toEqual([
      'cases[0].metadata.sourceText is not allowed in Reader AI eval metadata',
      'outputs.reportJson must be a relative local output path',
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because `readerAILiveFixtureEvalRunner` does not exist.

- [ ] **Step 3: Implement fixture types and validation helpers**

Create `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`:

```ts
import { validateReaderAIEvalCase, type ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
import type { AIProviderName } from '@/services/ai/types';

export type ReaderAILiveFixtureRuntimeBook = {
  label: string;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
};

export type ReaderAILiveFixtureSettings = {
  provider: AIProviderName;
  model: string;
  maxContextChunks?: number;
  spoilerProtection?: boolean;
};

export type ReaderAILiveFixtureOutputs = {
  envelope: string;
  reportJson?: string;
  reportMarkdown?: string;
};

export type ReaderAILiveFixture = {
  fixtureId: string;
  live: boolean;
  caseLimit?: number;
  timeoutMs?: number;
  settings: ReaderAILiveFixtureSettings;
  runtimeBook: ReaderAILiveFixtureRuntimeBook;
  outputs: ReaderAILiveFixtureOutputs;
  cases: ReaderAIEvalCase[];
};

type FixtureValidationResult =
  | { ok: true; fixture: ReaderAILiveFixture }
  | { ok: false; issues: string[] };

const providerNames = new Set<AIProviderName>([
  'openrouter',
  'openai',
  'gemini',
  'deepseek',
  'dashscope',
  'kimi',
  'mimo',
  'custom-openai-compatible',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const unsafeFixtureFieldNames = new Set([
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
  'apiKey',
  'token',
  'authorization',
  'localPath',
  'url',
]);

const collectUnsafeFixtureIssues = (value: unknown, path: string[] = []): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUnsafeFixtureIssues(item, [...path, String(index)]),
    );
  }

  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nestedPath = [...path, key];
    const issue = unsafeFixtureFieldNames.has(key)
      ? [`${nestedPath.join('.')} is not allowed in Reader AI live fixture metadata`]
      : [];
    return [...issue, ...collectUnsafeFixtureIssues(nestedValue, nestedPath)];
  });
};

const isRelativeLocalPath = (value: string): boolean =>
  value.trim().length > 0 &&
  !value.startsWith('/') &&
  !value.includes('://') &&
  !value.startsWith('..');

const validateOutputPath = (
  outputs: Record<string, unknown>,
  key: keyof ReaderAILiveFixtureOutputs,
  issues: string[],
): void => {
  const value = outputs[key];
  if (value === undefined && key !== 'envelope') return;
  if (typeof value !== 'string' || !isRelativeLocalPath(value)) {
    issues.push(`outputs.${key} must be a relative local output path`);
  }
};

export function validateReaderAILiveFixture(value: unknown): FixtureValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ['fixture must be an object'] };

  issues.push(...collectUnsafeFixtureIssues(value));

  if (!hasString(value, 'fixtureId')) issues.push('fixtureId is required');
  if (typeof value['live'] !== 'boolean') issues.push('live is required');
  if (value['caseLimit'] !== undefined && !isPositiveInteger(value['caseLimit'])) {
    issues.push('caseLimit must be a positive integer');
  }
  if (value['timeoutMs'] !== undefined && !isPositiveInteger(value['timeoutMs'])) {
    issues.push('timeoutMs must be a positive integer');
  }

  const settings = value['settings'];
  if (!isRecord(settings)) {
    issues.push('settings must be an object');
  } else {
    const provider = settings['provider'];
    if (typeof provider !== 'string' || !providerNames.has(provider as AIProviderName)) {
      issues.push('settings.provider is invalid');
    }
    if (!hasString(settings, 'model')) issues.push('settings.model is required');
    if (
      settings['maxContextChunks'] !== undefined &&
      !isPositiveInteger(settings['maxContextChunks'])
    ) {
      issues.push('settings.maxContextChunks must be a positive integer');
    }
    if (
      settings['spoilerProtection'] !== undefined &&
      typeof settings['spoilerProtection'] !== 'boolean'
    ) {
      issues.push('settings.spoilerProtection must be boolean');
    }
  }

  const runtimeBook = value['runtimeBook'];
  if (!isRecord(runtimeBook)) {
    issues.push('runtimeBook must be an object');
  } else {
    for (const field of ['label', 'bookHash', 'bookTitle']) {
      if (!hasString(runtimeBook, field)) issues.push(`runtimeBook.${field} is required`);
    }
    if (!isNonNegativeInteger(runtimeBook['currentPage'])) {
      issues.push('runtimeBook.currentPage must be a non-negative integer');
    }
    if (
      runtimeBook['currentAIPage'] !== undefined &&
      !isNonNegativeInteger(runtimeBook['currentAIPage'])
    ) {
      issues.push('runtimeBook.currentAIPage must be a non-negative integer');
    }
  }

  const outputs = value['outputs'];
  if (!isRecord(outputs)) {
    issues.push('outputs must be an object');
  } else {
    validateOutputPath(outputs, 'envelope', issues);
    validateOutputPath(outputs, 'reportJson', issues);
    validateOutputPath(outputs, 'reportMarkdown', issues);
  }

  const cases = value['cases'];
  if (!Array.isArray(cases)) {
    issues.push('cases must be an array');
  } else {
    cases.forEach((evalCase, index) => {
      const result = validateReaderAIEvalCase(evalCase);
      if (!result.valid) {
        issues.push(...result.issues.map((issue) => `cases[${index}].${issue}`));
      }
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, fixture: value as ReaderAILiveFixture };
}

export function parseReaderAILiveFixture(content: string): FixtureValidationResult {
  try {
    return validateReaderAILiveFixture(JSON.parse(content) as unknown);
  } catch {
    return { ok: false, issues: ['fixture JSON is invalid'] };
  }
}
```

- [ ] **Step 4: Run focused test and adjust exact issue text if needed**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS for the two fixture validation tests.

- [ ] **Step 5: Commit fixture validation**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts
git commit -m "feat(readio): add live fixture eval validation"
```

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

### Task 2: Add guarded runner orchestration

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`

- [ ] **Step 1: Add failing tests for live opt-in, execution, and case limit**

Append to `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`:

```ts
import type { ReaderAIServiceEvalStreamer } from '@/services/ai/eval/readerAIServiceEvalRunner';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import { runReaderAILiveFixtureEval } from '@/services/ai/eval/readerAILiveFixtureEvalRunner';

const createWritableMemory = () => {
  const writes = new Map<string, string>();
  return {
    writes,
    writeFile: async (path: string, content: string): Promise<void> => {
      writes.set(path, content);
    },
  };
};

describe('runReaderAILiveFixtureEval guarded execution', () => {
  it('refuses to call the streamer without explicit live opt-in', async () => {
    const memory = createWritableMemory();
    let called = false;
    const streamer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      yield 'private answer must not be returned';
    };

    const output = await runReaderAILiveFixtureEval(validFixture, {
      live: false,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: () => 1000,
    });

    expect(output.ok).toBe(false);
    if (output.ok) throw new Error('expected guarded failure');
    expect(output.issues).toEqual(['Live fixture execution requires --live']);
    expect(called).toBe(false);
    expect(memory.writes.size).toBe(0);
  });

  it('executes bounded live fixture cases through the injected streamer', async () => {
    const memory = createWritableMemory();
    const calls: StreamReaderAIAnswerOptions[] = [];
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      calls.push(options);
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'private preview must not be written',
          href: 'readio://private-source',
          confidence: 'exact',
        },
      ]);
      yield 'private answer must not be written';
    };

    const fixture = {
      ...validFixture,
      live: true,
      caseLimit: 1,
      cases: [
        validFixture.cases[0],
        { ...validFixture.cases[0], id: 'second-case', question: '第二个问题是什么？' },
      ],
    };

    const output = await runReaderAILiveFixtureEval(fixture, {
      live: true,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: (() => {
        const values = [1000, 1200, 1200];
        let index = 0;
        return () => values[Math.min(index++, values.length - 1)] ?? 0;
      })(),
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      bookHash: 'runtime-private-book-hash',
      bookTitle: 'Runtime Private Title',
      authorName: 'Runtime Private Author',
      currentPage: 42,
      currentAIPage: 40,
      question: '阿兹克是谁？',
    });
    expect(memory.writes.has('tmp/reader-ai/live-fixture/envelope.json')).toBe(true);
    expect(memory.writes.has('tmp/reader-ai/live-fixture/report.json')).toBe(true);
    expect(memory.writes.has('tmp/reader-ai/live-fixture/report.md')).toBe(true);
    expect(output.envelope.results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run focused test to verify new cases fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because `runReaderAILiveFixtureEval` is not implemented.

- [ ] **Step 3: Implement guarded runner orchestration**

Update `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`:

```ts
import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';
import {
  runReaderAIServiceEval,
  type ReaderAIServiceEvalEnvelope,
  type ReaderAIServiceEvalStreamer,
} from '@/services/ai/eval/readerAIServiceEvalRunner';
import { validateReaderAIEvalCase, type ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
import type { AIProviderName, AISettings } from '@/services/ai/types';

// Keep existing types and validation helpers from Task 1 above.

export type ReaderAILiveFixtureEvalDeps = {
  live: boolean;
  streamAnswer: ReaderAIServiceEvalStreamer;
  writeFile: (path: string, content: string) => Promise<void>;
  now?: () => number;
};

export type ReaderAILiveFixtureEvalOutput =
  | {
      ok: true;
      envelope: ReaderAIServiceEvalEnvelope;
      writtenPaths: string[];
      issues: [];
    }
  | {
      ok: false;
      envelope: null;
      writtenPaths: [];
      issues: string[];
    };

const toAISettings = (fixture: ReaderAILiveFixture): AISettings => ({
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: fixture.settings.provider,
  providerApiKeys: {},
  providerModels: { [fixture.settings.provider]: fixture.settings.model },
  customProviderBaseUrl: '',
  spoilerProtection: fixture.settings.spoilerProtection ?? true,
  maxContextChunks: fixture.settings.maxContextChunks ?? 6,
  indexingMode: 'on-demand',
});

const limitCases = (fixture: ReaderAILiveFixture): ReaderAIEvalCase[] =>
  fixture.cases.slice(0, fixture.caseLimit ?? fixture.cases.length);

export async function runReaderAILiveFixtureEval(
  fixtureInput: unknown,
  deps: ReaderAILiveFixtureEvalDeps,
): Promise<ReaderAILiveFixtureEvalOutput> {
  const validation = validateReaderAILiveFixture(fixtureInput);
  if (!validation.ok) {
    return { ok: false, envelope: null, writtenPaths: [], issues: validation.issues };
  }

  const fixture = validation.fixture;
  if (!deps.live || !fixture.live) {
    return {
      ok: false,
      envelope: null,
      writtenPaths: [],
      issues: ['Live fixture execution requires --live'],
    };
  }

  const cases = limitCases(fixture);
  const controller = new AbortController();
  const timeout = fixture.timeoutMs
    ? setTimeout(() => controller.abort(), fixture.timeoutMs)
    : undefined;

  try {
    const envelope = await runReaderAIServiceEval(
      {
        cases,
        context: {
          settings: toAISettings(fixture),
          bookHash: fixture.runtimeBook.bookHash,
          bookTitle: fixture.runtimeBook.bookTitle,
          authorName: fixture.runtimeBook.authorName,
          currentPage: fixture.runtimeBook.currentPage,
          currentAIPage: fixture.runtimeBook.currentAIPage,
          messages: [],
          signal: controller.signal,
        },
      },
      {
        streamAnswer: deps.streamAnswer,
        now: deps.now,
      },
    );

    const reportOutput = buildReaderAIEvalReportRun(envelope);
    if (!reportOutput.ok) {
      return { ok: false, envelope: null, writtenPaths: [], issues: reportOutput.issues };
    }

    const writtenPaths: string[] = [];
    await deps.writeFile(fixture.outputs.envelope, `${JSON.stringify(envelope, null, 2)}\n`);
    writtenPaths.push(fixture.outputs.envelope);

    if (fixture.outputs.reportJson !== undefined) {
      await deps.writeFile(
        fixture.outputs.reportJson,
        `${JSON.stringify(reportOutput.report, null, 2)}\n`,
      );
      writtenPaths.push(fixture.outputs.reportJson);
    }

    if (fixture.outputs.reportMarkdown !== undefined) {
      await deps.writeFile(fixture.outputs.reportMarkdown, reportOutput.markdown);
      writtenPaths.push(fixture.outputs.reportMarkdown);
    }

    return { ok: true, envelope, writtenPaths, issues: [] };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
```

When applying this code, merge imports with the Task 1 file instead of duplicating imports.

- [ ] **Step 4: Run focused test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS for fixture validation and guarded execution tests.

- [ ] **Step 5: Commit guarded orchestration**

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts
git commit -m "feat(readio): add guarded live fixture eval runner"
```

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

### Task 3: Add CLI wrapper and privacy output coverage

**Files:**

- Create: `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
- Modify: `apps/readest-app/package.json`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`

- [ ] **Step 1: Add failing tests for CLI args and output privacy**

Append to `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`:

```ts
import { runReaderAILiveFixtureEvalCli } from '../../../scripts/reader-ai-live-fixture-eval';

describe('Reader AI live fixture CLI', () => {
  it('rejects missing live flag without reading or writing provider outputs', async () => {
    const errors: string[] = [];
    const writes = new Map<string, string>();
    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json'],
      {
        readFile: async () => JSON.stringify(validFixture),
        writeFile: async (path, content) => {
          writes.set(path, content);
        },
        stderr: (message) => errors.push(message),
      },
      {
        streamAnswer: async function* () {
          throw new Error('streamer should not be called');
        },
        now: () => 1000,
      },
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual(['Live fixture execution requires --live']);
    expect(writes.size).toBe(0);
  });

  it('writes metadata-only artifacts when live flag and fake streamer are provided', async () => {
    const errors: string[] = [];
    const writes = new Map<string, string>();
    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--live'],
      {
        readFile: async () => JSON.stringify({ ...validFixture, live: true }),
        writeFile: async (path, content) => {
          writes.set(path, content);
        },
        stderr: (message) => errors.push(message),
      },
      {
        streamAnswer: async function* (options) {
          options.onSources?.([
            {
              id: 'source-a',
              chapterTitle: 'Chapter 1',
              previewText: 'private preview must not be written',
              href: 'readio://private-source',
              confidence: 'exact',
            },
          ]);
          yield 'private answer must not be written';
        },
        now: (() => {
          const values = [5000, 5100, 5100];
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)] ?? 0;
        })(),
      },
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    const combined = Array.from(writes.values()).join('\n');
    expect(combined).toContain('# Reader AI Eval Report');
    expect(combined).not.toContain('private answer must not be written');
    expect(combined).not.toContain('private preview must not be written');
    expect(combined).not.toContain('Runtime Private Title');
    expect(combined).not.toContain('Runtime Private Author');
    expect(combined).not.toContain('runtime-private-book-hash');
    expect(combined).not.toContain('readio://private-source');
  });
});
```

- [ ] **Step 2: Run focused test to verify CLI cases fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because the CLI wrapper does not exist.

- [ ] **Step 3: Implement CLI wrapper**

Create `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';

import { streamReaderAIAnswer } from '@/services/ai/readerChatService';
import {
  parseReaderAILiveFixture,
  runReaderAILiveFixtureEval,
  type ReaderAILiveFixtureEvalDeps,
} from '@/services/ai/eval/readerAILiveFixtureEvalRunner';

export type ReaderAILiveFixtureEvalCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

type ReaderAILiveFixtureCliArgs = {
  fixture?: string;
  live: boolean;
};

type ReaderAILiveFixtureCliDeps = Pick<ReaderAILiveFixtureEvalDeps, 'streamAnswer' | 'now'>;

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAILiveFixtureCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAILiveFixtureCliArgs = { live: false };
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (index === 0 && token === '--') continue;

    if (token === '--live') {
      args.live = true;
      continue;
    }

    if (token === '--fixture') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --fixture');
      } else {
        args.fixture = value;
        index += 1;
      }
      continue;
    }

    issues.push(`Unknown argument: ${token}`);
  }

  if (issues.length === 0 && args.fixture === undefined) {
    issues.push('Missing required argument: --fixture');
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, args };
};

export async function runReaderAILiveFixtureEvalCli(
  argv: string[],
  io: ReaderAILiveFixtureEvalCliIO,
  deps: ReaderAILiveFixtureCliDeps = { streamAnswer: streamReaderAIAnswer },
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const { fixture, live } = parsedArgs.args;
  if (fixture === undefined) {
    io.stderr('Missing required argument: --fixture');
    return 1;
  }

  let fixtureContent: string;
  try {
    fixtureContent = await io.readFile(fixture);
  } catch {
    io.stderr(`Unable to read fixture: ${fixture}`);
    return 1;
  }

  const parsedFixture = parseReaderAILiveFixture(fixtureContent);
  if (!parsedFixture.ok) {
    parsedFixture.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const output = await runReaderAILiveFixtureEval(parsedFixture.fixture, {
    live,
    streamAnswer: deps.streamAnswer,
    writeFile: io.writeFile,
    now: deps.now,
  });

  if (!output.ok) {
    output.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nodeIO: ReaderAILiveFixtureEvalCliIO = {
    readFile: (path: string): Promise<string> => readFile(path, 'utf8'),
    writeFile,
    stderr: (message: string): void => {
      console.error(message);
    },
  };

  process.exitCode = await runReaderAILiveFixtureEvalCli(process.argv.slice(2), nodeIO);
}
```

- [ ] **Step 4: Add package script**

Modify `apps/readest-app/package.json` scripts to add:

```json
"reader-ai:live-fixture": "tsx scripts/reader-ai-live-fixture-eval.ts"
```

Place it next to the existing `reader-ai:report` script.

- [ ] **Step 5: Run focused test to verify CLI and privacy coverage passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit CLI wrapper and privacy coverage**

```bash
git add apps/readest-app/scripts/reader-ai-live-fixture-eval.ts apps/readest-app/package.json apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts
git commit -m "feat(readio): add live fixture eval cli"
```

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

### Task 4: Document and verify the live fixture runner

**Files:**

- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `HANDOFF.md`
- Modify: `openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md`

- [ ] **Step 1: Update eval README**

Append to `apps/readest-app/src/services/ai/eval/README.md`:

````md
## Live fixture eval runner

The live fixture eval runner is a guarded local wrapper for running an explicit metadata-only Reader AI fixture through the real service path.

Run it from the app package only when you intentionally want a live provider call:

```bash
pnpm --dir apps/readest-app reader-ai:live-fixture -- \
  --fixture path/to/local-fixture.json \
  --live
```
````

The fixture should be local-only or ignored. It may contain runtime fields needed to execute on this machine, but committed fixtures and generated outputs must not include raw book text, answer text, source text, prompts, API keys, URLs, local paths, book hashes, or stable private identifiers.

The runner refuses provider execution unless `--live` is present. Tests use fake streamers. The runner writes only metadata envelopes and sanitized report artifacts, and it reuses `runReaderAIServiceEval` plus `buildReaderAIEvalReportRun` rather than changing Reader AI prompt, retrieval, citation, or UI behavior.

Batch library scans, NotebookLM automation, LLM-as-judge, and Reader AI quality tuning are deferred follow-ups.

````

- [ ] **Step 2: Run focused eval tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-service-eval-runner.test.ts src/__tests__/ai/reader-ai-eval-report-cli.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts
````

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS.

- [ ] **Step 4: Run full app tests**

Run in background if needed:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS.

- [ ] **Step 5: Run OpenSpec validation**

Run:

```bash
openspec validate --all --strict
```

Expected: PASS.

- [ ] **Step 6: Update OpenSpec tasks**

Mark every completed item in `openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md` from `- [ ]` to `- [x]` only after the corresponding implementation and validation evidence exists.

- [ ] **Step 7: Update HANDOFF**

Add a concise section to `HANDOFF.md`:

```md
## Reader AI Live Fixture Eval Runner

- Change: `reader-ai-live-fixture-eval-runner`.
- Scope: guarded local live fixture runner for explicit metadata-only Reader AI fixture runs. No UI or Reader AI behavior changes.
- Implemented:
  - fixture validation and unsafe metadata rejection;
  - explicit `--live` opt-in before provider execution;
  - service eval runner delegation and report generation;
  - metadata-only CLI outputs.
- Validation evidence:
  - focused live/service/report tests: PASS;
  - `pnpm --dir apps/readest-app lint`: PASS;
  - `pnpm --dir apps/readest-app test`: PASS;
  - `openspec validate --all --strict`: PASS.
- Deferred:
  - real local fixture preparation outside git;
  - batch library benchmark runner;
  - NotebookLM/manual comparison workflow;
  - LLM-as-judge;
  - Reader AI prompt/retrieval/citation tuning.
```

- [ ] **Step 8: Commit docs and validation metadata**

```bash
git add apps/readest-app/src/services/ai/eval/README.md HANDOFF.md openspec/changes/reader-ai-live-fixture-eval-runner/tasks.md
git commit -m "docs(readio): document live fixture eval runner"
```

## archived-with: 2026-05-31-reader-ai-live-fixture-eval-runner

## Self-Review Notes

- Spec coverage:
  - Fixture validation: Task 1.
  - Explicit live opt-in and bounded execution: Task 2.
  - Metadata-only artifacts and report compatibility: Task 3.
  - Documentation and verification: Task 4.
- No UI files are touched.
- No Reader AI prompt, retrieval, citation, or answer generation logic is changed.
- Tests use fake streamers; the real streamer is only wired by the CLI default dependency and is guarded by `--live`.
- Plan uses existing `runReaderAIServiceEval` and `buildReaderAIEvalReportRun` rather than duplicating scoring/report logic.
