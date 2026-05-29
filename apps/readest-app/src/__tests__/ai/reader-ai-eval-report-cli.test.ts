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
