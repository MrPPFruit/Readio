---
change: reader-ai-eval-report-cli
design-doc: docs/superpowers/specs/2026-05-30-reader-ai-eval-report-cli-design.md
base-ref: 130dd1ed59715b52c84d1c33c9419a903d0e3a53
archived-with: 2026-05-30-reader-ai-eval-report-cli
---

# Reader AI Eval Report CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin local CLI/file wrapper that turns a Reader AI eval metadata JSON envelope into sanitized JSON and Markdown report artifacts.

**Architecture:** Create one focused script under `apps/readest-app/scripts/` that parses required flags, reads and parses input JSON as `unknown`, delegates all validation/reporting to `buildReaderAIEvalReportRun`, and writes outputs only after success. Keep report math, trace aggregation, privacy validation, and Markdown rendering inside the existing pure runner.

**Tech Stack:** TypeScript strict mode, Node built-ins (`node:fs/promises`), `tsx` package script, Vitest, existing Reader AI eval utilities. No CLI framework, no model calls, no real book loading, no UI/runtime changes.

## archived-with: 2026-05-30-reader-ai-eval-report-cli

## File Structure

- Create: `apps/readest-app/scripts/reader-ai-eval-report.ts`
  - Owns CLI argument parsing, file read/JSON parse, delegation to the existing runner, output writes, stderr messages, and exit code mapping.
  - Exports `runReaderAIEvalReportCli(argv, io)` for focused tests.
- Create: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts`
  - Focused tests for required arguments, unknown flags, invalid JSON, unsafe input, and successful file output.
- Modify: `apps/readest-app/package.json`
  - Add `reader-ai:report` script using `tsx scripts/reader-ai-eval-report.ts`.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Document command usage, outputs, failure/no-partial-output behavior, and scope boundaries.
- Modify: `openspec/changes/reader-ai-eval-report-cli/tasks.md`
  - Mark implementation tasks complete as each task lands.
- Modify: `HANDOFF.md`
  - Add CLI wrapper scope and validation evidence after implementation.

## Task 1: CLI Contract and Usage Validation

**Files:**

- Create: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts`
- Create: `apps/readest-app/scripts/reader-ai-eval-report.ts`
- Modify: `openspec/changes/reader-ai-eval-report-cli/tasks.md`

- [ ] **Step 1: Write failing tests for missing arguments and unknown flags**

Create `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { runReaderAIEvalReportCli } from '../../../scripts/reader-ai-eval-report';

type MemoryCliIO = {
  files: Map<string, string>;
  errors: string[];
  writes: string[];
};

const createMemoryIO = (initialFiles: Record<string, string> = {}): MemoryCliIO => ({
  files: new Map(Object.entries(initialFiles)),
  errors: [],
  writes: [],
});

const toCliIO = (memory: MemoryCliIO) => ({
  readFile: async (path: string): Promise<string> => {
    const value = memory.files.get(path);
    if (value === undefined) throw new Error(`missing file: ${path}`);
    return value;
  },
  writeFile: async (path: string, content: string): Promise<void> => {
    memory.writes.push(path);
    memory.files.set(path, content);
  },
  stderr: (message: string): void => {
    memory.errors.push(message);
  },
});

describe('Reader AI eval report CLI usage', () => {
  it('rejects missing required file arguments without writing outputs', async () => {
    const memory = createMemoryIO();

    const exitCode = await runReaderAIEvalReportCli(['--input', 'input.json'], toCliIO(memory));

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual([
      'Missing required argument: --json-out',
      'Missing required argument: --markdown-out',
    ]);
    expect(memory.writes).toEqual([]);
  });

  it('rejects unknown flags without writing outputs', async () => {
    const memory = createMemoryIO();

    const exitCode = await runReaderAIEvalReportCli(
      [
        '--input',
        'input.json',
        '--json-out',
        'report.json',
        '--markdown-out',
        'report.md',
        '--verbose',
      ],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Unknown argument: --verbose']);
    expect(memory.writes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts
```

Expected: FAIL because `apps/readest-app/scripts/reader-ai-eval-report.ts` does not exist.

- [ ] **Step 3: Implement minimal argument parser and CLI IO contract**

Create `apps/readest-app/scripts/reader-ai-eval-report.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';

export type ReaderAIEvalReportCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

type ReaderAIEvalReportCliArgs = {
  input?: string;
  jsonOut?: string;
  markdownOut?: string;
};

const requiredArgs: Array<[keyof ReaderAIEvalReportCliArgs, string]> = [
  ['input', '--input'],
  ['jsonOut', '--json-out'],
  ['markdownOut', '--markdown-out'],
];

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAIEvalReportCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAIEvalReportCliArgs = {};
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === '--input') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --input');
      } else {
        args.input = value;
        index += 1;
      }
      continue;
    }

    if (token === '--json-out') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --json-out');
      } else {
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

export async function runReaderAIEvalReportCli(
  argv: string[],
  io: ReaderAIEvalReportCliIO,
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  return 0;
}

const nodeIO: ReaderAIEvalReportCliIO = {
  readFile,
  writeFile,
  stderr: (message: string): void => {
    console.error(message);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runReaderAIEvalReportCli(process.argv.slice(2), nodeIO);
}
```

- [ ] **Step 4: Run usage tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts
```

Expected: PASS for the two usage tests.

- [ ] **Step 5: Mark Task 1 OpenSpec items complete and commit**

Update `openspec/changes/reader-ai-eval-report-cli/tasks.md`:

```md
- [x] 1.1 Add a focused script entry under `apps/readest-app/scripts/` for Reader AI eval report generation.
- [x] 1.2 Parse explicit `--input`, `--json-out`, and `--markdown-out` arguments with deterministic usage errors for missing values or unknown flags.
- [x] 1.3 Add tests proving missing required file arguments exit non-zero and do not write outputs.
```

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts apps/readest-app/scripts/reader-ai-eval-report.ts openspec/changes/reader-ai-eval-report-cli/tasks.md
git commit -m "feat(readio): add eval report cli contract"
```

## Task 2: File-Based Report Generation

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts`
- Modify: `apps/readest-app/scripts/reader-ai-eval-report.ts`
- Modify: `openspec/changes/reader-ai-eval-report-cli/tasks.md`

- [ ] **Step 1: Add failing tests for invalid JSON, unsafe input, and valid outputs**

Append to `apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts`:

```ts
describe('Reader AI eval report CLI file generation', () => {
  it('rejects invalid JSON without writing outputs', async () => {
    const memory = createMemoryIO({ 'input.json': '{not json' });

    const exitCode = await runReaderAIEvalReportCli(
      ['--input', 'input.json', '--json-out', 'report.json', '--markdown-out', 'report.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Invalid JSON input: input.json']);
    expect(memory.writes).toEqual([]);
  });

  it('rejects unsafe eval metadata without writing partial outputs', async () => {
    const memory = createMemoryIO({
      'input.json': JSON.stringify({
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
        results: [],
      }),
    });

    const exitCode = await runReaderAIEvalReportCli(
      ['--input', 'input.json', '--json-out', 'report.json', '--markdown-out', 'report.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual([
      'cases[0].metadata.sourceText is not allowed in Reader AI eval metadata',
    ]);
    expect(memory.writes).toEqual([]);
    expect(memory.files.has('report.json')).toBe(false);
    expect(memory.files.has('report.md')).toBe(false);
  });

  it('writes sanitized JSON and Markdown report files for valid input', async () => {
    const memory = createMemoryIO({
      'input.json': JSON.stringify({
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
            reasons: ['cited correct source'],
            manualBenchmark: {
              source: 'notebooklm',
              mode: 'whole_book',
              observations: ['private_observation_label'],
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
            sourceText: 'private source text',
          },
        ],
      }),
    });

    const exitCode = await runReaderAIEvalReportCli(
      ['--input', 'input.json', '--json-out', 'report.json', '--markdown-out', 'report.md'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(0);
    expect(memory.errors).toEqual([]);
    expect(memory.writes).toEqual(['report.json', 'report.md']);

    const jsonReport = JSON.parse(memory.files.get('report.json') ?? 'null') as unknown;
    expect(jsonReport).toEqual({
      totalCases: 1,
      totalResults: 1,
      passed: 1,
      failed: 0,
      byCategory: {
        person_recall: {
          total: 1,
          passed: 1,
          insufficientAnswers: 0,
          citationValid: 1,
          firstOutputMs: { min: 1200, max: 1200, average: 1200 },
          overBudgetStages: { none: 1 },
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
      ],
    });

    const combinedOutput = `${memory.files.get('report.json') ?? ''}\n${memory.files.get('report.md') ?? ''}`;
    expect(combinedOutput).toContain('# Reader AI Eval Report');
    expect(combinedOutput).not.toContain('private source text');
    expect(combinedOutput).not.toContain('private_observation_label');
  });
});
```

- [ ] **Step 2: Run file generation tests to verify they fail**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts
```

Expected: FAIL because the CLI currently returns success after argument parsing and does not read/write files.

- [ ] **Step 3: Implement file read, JSON parse, runner delegation, and output writes**

Update `apps/readest-app/scripts/reader-ai-eval-report.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';

import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';

export type ReaderAIEvalReportCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

type ReaderAIEvalReportCliArgs = {
  input?: string;
  jsonOut?: string;
  markdownOut?: string;
};

const requiredArgs: Array<[keyof ReaderAIEvalReportCliArgs, string]> = [
  ['input', '--input'],
  ['jsonOut', '--json-out'],
  ['markdownOut', '--markdown-out'],
];

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAIEvalReportCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAIEvalReportCliArgs = {};
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === '--input') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --input');
      } else {
        args.input = value;
        index += 1;
      }
      continue;
    }

    if (token === '--json-out') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --json-out');
      } else {
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

export async function runReaderAIEvalReportCli(
  argv: string[],
  io: ReaderAIEvalReportCliIO,
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const { input, jsonOut, markdownOut } = parsedArgs.args;
  if (input === undefined || jsonOut === undefined || markdownOut === undefined) {
    io.stderr('Missing required report file paths');
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

  const output = buildReaderAIEvalReportRun(parsedJson.value);
  if (!output.ok) {
    output.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  await io.writeFile(jsonOut, `${JSON.stringify(output.report, null, 2)}\n`);
  await io.writeFile(markdownOut, output.markdown);
  return 0;
}

const nodeIO: ReaderAIEvalReportCliIO = {
  readFile,
  writeFile,
  stderr: (message: string): void => {
    console.error(message);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runReaderAIEvalReportCli(process.argv.slice(2), nodeIO);
}
```

- [ ] **Step 4: Run file generation tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts
```

Expected: PASS for usage and file generation tests.

- [ ] **Step 5: Mark Task 2 OpenSpec items complete and commit**

Update `openspec/changes/reader-ai-eval-report-cli/tasks.md`:

```md
- [x] 2.1 Read and parse the input JSON envelope as `unknown` and report deterministic errors for invalid JSON or unreadable input.
- [x] 2.2 Delegate validation and report generation to `buildReaderAIEvalReportRun` without duplicating eval scoring or trace aggregation logic.
- [x] 2.3 Write only sanitized `ReaderAIEvalReport` JSON and deterministic Markdown outputs after successful validation.
- [x] 2.4 Add tests proving valid input writes both files and invalid/unsafe input writes no partial artifacts.
```

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-eval-report-cli.test.ts apps/readest-app/scripts/reader-ai-eval-report.ts openspec/changes/reader-ai-eval-report-cli/tasks.md
git commit -m "feat(readio): generate eval reports from local files"
```

## Task 3: Package Script and Documentation

**Files:**

- Modify: `apps/readest-app/package.json`
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `openspec/changes/reader-ai-eval-report-cli/tasks.md`

- [ ] **Step 1: Add package script**

Modify `apps/readest-app/package.json` scripts block to include:

```json
"reader-ai:report": "tsx scripts/reader-ai-eval-report.ts"
```

Place it near the existing test/eval/developer utility scripts, for example after `test:coverage`.

- [ ] **Step 2: Document CLI usage and scope**

Append to `apps/readest-app/src/services/ai/eval/README.md`:

````md
## Local report CLI

Run the local file wrapper from the app package:

```bash
pnpm --dir apps/readest-app reader-ai:report -- \
  --input eval-input.json \
  --json-out report.json \
  --markdown-out report.md
```
````

The input file must contain the same parsed envelope accepted by the pure report runner:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```

On success, `--json-out` contains only the sanitized `ReaderAIEvalReport` object, and `--markdown-out` contains deterministic Markdown generated from that report. On usage errors, invalid JSON, invalid envelopes, or unsafe case/result metadata, the command exits non-zero and does not write partial report files.

The CLI is intentionally a local file wrapper only. It does not call model providers, load books, run indexing or retrieval, automate NotebookLM, upload telemetry, or change Reader AI UI/runtime behavior.

```

```

- [ ] **Step 3: Mark Task 3 OpenSpec items complete and commit**

Update `openspec/changes/reader-ai-eval-report-cli/tasks.md`:

```md
- [x] 3.1 Add a package script for invoking the local report CLI from `apps/readest-app`.
- [x] 3.2 Document CLI usage, output shape, and scope boundaries in the eval README.
- [x] 3.3 Keep model execution, real book loading, NotebookLM automation, telemetry, and UI/runtime behavior explicitly out of scope.
```

Commit:

```bash
git add apps/readest-app/package.json apps/readest-app/src/services/ai/eval/README.md openspec/changes/reader-ai-eval-report-cli/tasks.md
git commit -m "docs(readio): document eval report cli"
```

## Task 4: Verification and Handoff

**Files:**

- Modify: `HANDOFF.md`
- Modify: `openspec/changes/reader-ai-eval-report-cli/tasks.md`

- [ ] **Step 1: Run focused CLI and runner tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS with TypeScript and Biome checks.

- [ ] **Step 3: Run full app test suite**

Run in background if needed:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS for the full Vitest suite.

- [ ] **Step 4: Update handoff**

Add a short section near the top of `HANDOFF.md`:

```md
## Reader AI Eval Report CLI

- Change: `reader-ai-eval-report-cli`.
- Scope: thin local file wrapper around the existing pure Reader AI eval report runner; no model calls, real book loading, indexing, retrieval execution, UI/runtime changes, NotebookLM automation, or telemetry upload.
- Implemented:
  - `pnpm --dir apps/readest-app reader-ai:report -- --input <input.json> --json-out <report.json> --markdown-out <report.md>`;
  - deterministic required-argument and unknown-flag validation;
  - JSON file reading/parsing with deterministic invalid JSON and unreadable input errors;
  - delegation to `buildReaderAIEvalReportRun` for all case/result privacy validation, trace aggregation, and report summary logic;
  - no partial output writes on usage, parse, or validation failure;
  - sanitized JSON report and Markdown file writes on success.
- Validation:
  - `pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval-report-cli.test.ts src/__tests__/ai/reader-ai-eval-report-runner.test.ts` passed.
  - `pnpm --dir apps/readest-app lint` passed.
  - `pnpm --dir apps/readest-app test` passed.
- Deferred:
  - stdout mode;
  - multi-file/batch mode;
  - CI snapshot comparison;
  - service-level eval execution around `streamReaderAIAnswer`;
  - NotebookLM automation;
  - LLM-as-judge.
```

- [ ] **Step 5: Mark Task 4 OpenSpec items complete and commit**

Update `openspec/changes/reader-ai-eval-report-cli/tasks.md`:

```md
- [x] 4.1 Run focused Reader AI eval/report CLI tests.
- [x] 4.2 Run `pnpm --dir apps/readest-app lint`.
- [x] 4.3 Run `pnpm --dir apps/readest-app test`.
- [x] 4.4 Update `HANDOFF.md` with CLI wrapper scope, validation evidence, and deferred follow-ups.
```

Commit:

```bash
git add HANDOFF.md openspec/changes/reader-ai-eval-report-cli/tasks.md
git commit -m "docs(readio): record eval report cli validation"
```

- [ ] **Step 6: Run Comet build guard**

Run:

```bash
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills")
COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"
bash "$COMET_GUARD" reader-ai-eval-report-cli build --apply
```

Expected: guard passes and transitions `.comet.yaml` to `phase: verify`.

## Self-Review

- Spec coverage: covers explicit file args, deterministic usage failures, valid JSON/Markdown output files, invalid/no-partial-output behavior, local-only non-invasive scope, and delegation to the pure runner.
- Placeholder scan: no TODO/TBD placeholders remain; every implementation step includes concrete file paths, code, commands, and expected outcomes.
- Type consistency: `runReaderAIEvalReportCli`, `ReaderAIEvalReportCliIO`, `--input`, `--json-out`, and `--markdown-out` are used consistently across tests, implementation, docs, and handoff.
