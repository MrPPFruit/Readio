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
