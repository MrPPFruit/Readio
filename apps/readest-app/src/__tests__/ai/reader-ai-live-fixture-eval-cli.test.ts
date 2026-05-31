import { describe, expect, it, vi } from 'vitest';

import type { ReaderAIServiceEvalStreamer } from '@/services/ai/eval/readerAIServiceEvalRunner';
import { runReaderAILiveFixtureEvalCli } from '../../../scripts/reader-ai-live-fixture-eval';

type MemoryCliIO = {
  files: Map<string, string>;
  errors: string[];
  logs: string[];
  writes: string[];
};

const validFixture = {
  fixtureId: 'local-cli-smoke-001',
  live: true,
  caseLimit: 1,
  timeoutMs: 60000,
  settings: {
    provider: 'openai',
    model: 'gpt-test',
  },
  runtimeBook: {
    label: 'private-local-label',
    bookHash: 'private-book-hash-cli',
    bookTitle: 'Private CLI Book Title',
    authorName: 'Private CLI Author',
    currentPage: 12,
    currentAIPage: 10,
  },
  outputs: {
    envelope: 'tmp/reader-ai/live-fixture/cli-envelope.json',
    reportJson: 'tmp/reader-ai/live-fixture/cli-report.json',
    reportMarkdown: 'tmp/reader-ai/live-fixture/cli-report.md',
  },
  cases: [
    {
      id: 'person-recall-cli',
      category: 'person_recall',
      language: 'zh-CN',
      question: '这个人物是谁？',
      expectedBehavior: 'Identify the person using cited read-so-far evidence.',
      spoilerMode: 'read_so_far',
    },
  ],
};

const privateTokens = [
  'private-book-hash-cli',
  'Private CLI Book Title',
  'Private CLI Author',
  'private-local-label',
  'raw answer secret should never be written',
  'raw preview secret should never be written',
  'provider prompt secret should never be written',
  'sk-live-fixture-secret',
  'https://private.example.test/v1/chat',
  '/Users/ppg/private/book.epub',
  'raw exception secret should never be written',
];

const createMemoryIO = (initialFiles: Record<string, string> = {}): MemoryCliIO => ({
  files: new Map(Object.entries(initialFiles)),
  errors: [],
  logs: [],
  writes: [],
});

const toCliIO = (memory: MemoryCliIO) => ({
  readFile: async (path: string): Promise<string> => {
    const value = memory.files.get(path);
    if (value === undefined)
      throw new Error(`missing file with private path /Users/ppg/private/book.epub: ${path}`);
    return value;
  },
  writeFile: async (path: string, content: string): Promise<void> => {
    memory.writes.push(path);
    memory.files.set(path, content);
  },
  stderr: (message: string): void => {
    memory.errors.push(message);
  },
  stdout: (message: string): void => {
    memory.logs.push(message);
  },
});

const combinedWrittenOutput = (memory: MemoryCliIO): string =>
  memory.writes.map((path) => memory.files.get(path) ?? '').join('\n');

const expectNoPrivateTokens = (content: string): void => {
  privateTokens.forEach((token) => expect(content).not.toContain(token));
};

describe('Reader AI live fixture eval CLI usage', () => {
  it('does not load the default streamer before --live gating succeeds', async () => {
    vi.resetModules();
    let defaultStreamerModuleLoaded = false;
    const streamReaderAIAnswer = vi.fn();
    vi.doMock('@/services/ai/readerChatService', () => {
      defaultStreamerModuleLoaded = true;
      return { streamReaderAIAnswer };
    });
    const { runReaderAILiveFixtureEvalCli: runCli } =
      await import('../../../scripts/reader-ai-live-fixture-eval');
    const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });

    const exitCode = await runCli(['--fixture', 'fixture.json'], toCliIO(memory));

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Live fixture execution requires --live']);
    expect(memory.writes).toEqual([]);
    expect(defaultStreamerModuleLoaded).toBe(false);
    expect(streamReaderAIAnswer).not.toHaveBeenCalled();
    vi.doUnmock('@/services/ai/readerChatService');
    vi.resetModules();
  });

  it('requires an explicit fixture file without writing outputs', async () => {
    const memory = createMemoryIO();
    let called = false;
    const streamAnswer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(['--live'], toCliIO(memory), {
      streamAnswer,
    });

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Missing required argument: --fixture']);
    expect(memory.writes).toEqual([]);
    expect(called).toBe(false);
  });

  it('fails closed without --live before calling the real streamer or writing outputs', async () => {
    const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });
    let called = false;
    const defaultRealStreamer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      if (called) throw new Error('raw exception secret should never be written');
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json'],
      toCliIO(memory),
      { streamAnswer: defaultRealStreamer },
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Live fixture execution requires --live']);
    expect(memory.writes).toEqual([]);
    expect(called).toBe(false);
    expectNoPrivateTokens(memory.errors.join('\n'));
  });

  it('rejects fixture JSON without live opt-in before loading the default streamer', async () => {
    vi.resetModules();
    let defaultStreamerModuleLoaded = false;
    const streamReaderAIAnswer = vi.fn();
    vi.doMock('@/services/ai/readerChatService', () => {
      defaultStreamerModuleLoaded = true;
      return { streamReaderAIAnswer };
    });
    const { runReaderAILiveFixtureEvalCli: runCli } =
      await import('../../../scripts/reader-ai-live-fixture-eval');
    const memory = createMemoryIO({
      'fixture.json': JSON.stringify({ ...validFixture, live: false }),
    });

    const exitCode = await runCli(['--fixture', 'fixture.json', '--live'], toCliIO(memory), {
      env: { READER_AI_LIVE_FIXTURE_API_KEY: 'sk-live-fixture-env-secret' },
    });

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Live fixture execution requires --live']);
    expect(memory.writes).toEqual([]);
    expect(defaultStreamerModuleLoaded).toBe(false);
    expect(streamReaderAIAnswer).not.toHaveBeenCalled();
    vi.doUnmock('@/services/ai/readerChatService');
    vi.resetModules();
  });

  it('rejects unreadable or invalid fixtures without leaking raw read errors or local paths', async () => {
    const memory = createMemoryIO();

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', '/Users/ppg/private/book.epub', '--live'],
      toCliIO(memory),
      {
        streamAnswer: async function* () {
          yield 'raw answer secret should never be written';
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Unable to read fixture']);
    expect(memory.writes).toEqual([]);
    expect(memory.errors.join('\n')).not.toContain('missing file with private path');
    expect(memory.errors.join('\n')).not.toContain('/Users/ppg/private/book.epub');
  });
});

describe('Reader AI live fixture eval CLI execution', () => {
  it('delegates live fixture execution and writes privacy-safe artifacts only', async () => {
    const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });
    const calls: Array<{ question: string; bookTitle?: string; openAIKey?: string }> = [];
    const streamAnswer: ReaderAIServiceEvalStreamer = async function* (options) {
      calls.push({
        question: options.question,
        bookTitle: options.bookTitle,
        openAIKey: options.settings.providerApiKeys.openai,
      });
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'raw preview secret should never be written',
          href: 'https://private.example.test/v1/chat',
          confidence: 'exact',
        },
      ]);
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--live'],
      toCliIO(memory),
      {
        streamAnswer,
        env: { READER_AI_LIVE_FIXTURE_API_KEY: 'sk-live-fixture-env-secret' },
        now: (() => {
          const values = [1000, 1125, 1125];
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)] ?? 0;
        })(),
      },
    );

    expect(exitCode).toBe(0);
    expect(memory.errors).toEqual([]);
    expect(memory.logs).toEqual([
      'Wrote tmp/reader-ai/live-fixture/cli-envelope.json',
      'Wrote tmp/reader-ai/live-fixture/cli-report.json',
      'Wrote tmp/reader-ai/live-fixture/cli-report.md',
    ]);
    expect(memory.writes).toEqual([
      'tmp/reader-ai/live-fixture/cli-envelope.json',
      'tmp/reader-ai/live-fixture/cli-report.json',
      'tmp/reader-ai/live-fixture/cli-report.md',
    ]);
    expect(calls).toEqual([
      {
        question: '这个人物是谁？',
        bookTitle: 'Private CLI Book Title',
        openAIKey: 'sk-live-fixture-env-secret',
      },
    ]);
    expectNoPrivateTokens(combinedWrittenOutput(memory));
  });

  it('does not leak prompts, keys, urls, paths, or raw exception messages from failed streams', async () => {
    const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });
    const streamAnswer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'provider prompt secret should never be written',
          contextText: 'sk-live-fixture-secret',
          href: 'https://private.example.test/v1/chat',
          cfi: '/Users/ppg/private/book.epub',
          confidence: 'exact',
        },
      ]);
      if (options.question.length > 0) {
        throw new Error(
          'raw exception secret should never be written with sk-live-fixture-secret and /Users/ppg/private/book.epub',
        );
      }
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--live'],
      toCliIO(memory),
      {
        streamAnswer,
        env: { READER_AI_LIVE_FIXTURE_API_KEY: 'sk-live-fixture-env-secret' },
      },
    );

    expect(exitCode).toBe(0);
    expect(memory.errors).toEqual([]);
    expect(memory.writes).toEqual([
      'tmp/reader-ai/live-fixture/cli-envelope.json',
      'tmp/reader-ai/live-fixture/cli-report.json',
      'tmp/reader-ai/live-fixture/cli-report.md',
    ]);
    expectNoPrivateTokens(combinedWrittenOutput(memory));
  });
});
