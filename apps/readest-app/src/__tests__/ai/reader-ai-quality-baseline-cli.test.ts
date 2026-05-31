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
