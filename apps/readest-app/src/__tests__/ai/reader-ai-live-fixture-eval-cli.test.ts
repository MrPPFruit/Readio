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

const validRuntimeSettings = {
  provider: {
    apiKey: 'sk-live-fixture-secret',
    customProviderBaseUrl: 'https://private.example.test/v1/chat',
  },
  retrievalSeed: {
    bookHash: 'private-book-hash-cli',
    chunks: [
      {
        id: 'private-seed-chunk-cli',
        sectionIndex: 1,
        chapterTitle: 'Private Seed Chapter',
        text: 'raw seed text should never be written',
        pageNumber: 10,
      },
    ],
  },
};

const validSeedFile = {
  bookHash: 'private-book-hash-cli',
  chunks: [
    {
      id: 'private-seed-chunk-file-cli',
      sectionIndex: 2,
      chapterTitle: 'Private Seed File Chapter',
      text: 'raw seed file text should never be written',
      pageNumber: 11,
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
  '/Users/ppg/private/runtime.local.json',
  '/Users/ppg/private/seed.local.json',
  'raw exception secret should never be written',
  'raw seed text should never be written',
  'private-seed-chunk-cli',
  'raw seed file text should never be written',
  'private-seed-chunk-file-cli',
  'runtime.local.json',
  'seed.local.json',
  'sk-env-should-be-overridden',
  'https://env.example.test/v1/chat',
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

  it('does not load the default streamer when runtime preflight fails', async () => {
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
      'fixture.json': JSON.stringify(validFixture),
      'runtime.local.json': JSON.stringify({ provider: {} }),
    });

    const exitCode = await runCli(
      ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['runtime provider API key is required']);
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
  it('fails closed before streaming until CLI runtime seed parsing is implemented', async () => {
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

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['runtime retrieval seed is required']);
    expect(memory.logs).toEqual([]);
    expect(memory.writes).toEqual([]);
    expect(calls).toEqual([]);
    expectNoPrivateTokens(memory.errors.join('\n'));
  });

  it('does not read runtime settings before --live succeeds', async () => {
    const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });
    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Live fixture execution requires --live']);
    expect(memory.writes).toEqual([]);
    expect(memory.files.has('runtime.local.json')).toBe(false);
  });

  it('does not read runtime settings when fixture validation fails', async () => {
    const memory = createMemoryIO({ 'fixture.json': '{ not-json' });
    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['fixture must be valid JSON']);
    expect(memory.writes).toEqual([]);
    expect(memory.files.has('runtime.local.json')).toBe(false);
  });

  it('does not read runtime settings when fixture is not marked live', async () => {
    const memory = createMemoryIO({
      'fixture.json': JSON.stringify({ ...validFixture, live: false }),
    });
    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
      toCliIO(memory),
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['Live fixture execution requires --live']);
    expect(memory.writes).toEqual([]);
    expect(memory.files.has('runtime.local.json')).toBe(false);
  });

  it('lets runtime file values override env provider and retrieval seed path values', async () => {
    const memory = createMemoryIO({
      'fixture.json': JSON.stringify(validFixture),
      'runtime.local.json': JSON.stringify({
        provider: {
          apiKey: 'sk-live-fixture-secret',
          customProviderBaseUrl: 'https://private.example.test/v1/chat',
        },
        retrievalSeedPath: 'seed.local.json',
      }),
      'seed.local.json': JSON.stringify(validSeedFile),
      'env-seed.local.json': JSON.stringify({ ...validSeedFile, bookHash: 'env-wrong-book-hash' }),
    });
    const calls: Array<{ openAIKey?: string; baseUrl?: string }> = [];
    const streamAnswer: ReaderAIServiceEvalStreamer = async function* (options) {
      calls.push({
        openAIKey: options.settings.providerApiKeys.openai,
        baseUrl: options.settings.customProviderBaseUrl,
      });
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
      toCliIO(memory),
      {
        streamAnswer,
        prepareRetrievalContext: async () => undefined,
        env: {
          READER_AI_LIVE_FIXTURE_API_KEY: 'sk-env-should-be-overridden',
          READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL: 'https://env.example.test/v1/chat',
          READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED: 'env-seed.local.json',
        },
        now: (() => {
          const values = [1000, 1125, 1125];
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)] ?? 0;
        })(),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { openAIKey: 'sk-live-fixture-secret', baseUrl: 'https://private.example.test/v1/chat' },
    ]);
    expectNoPrivateTokens(memory.logs.join('\n'));
    expectNoPrivateTokens(memory.errors.join('\n'));
    expectNoPrivateTokens(combinedWrittenOutput(memory));
  });

  it('fails closed with safe issues when runtime settings are missing provider or retrieval inputs', async () => {
    const memory = createMemoryIO({
      'fixture.json': JSON.stringify(validFixture),
      '/Users/ppg/private/runtime.local.json': JSON.stringify({
        provider: {},
        retrievalSeedPath: '/Users/ppg/private/seed.local.json',
      }),
      '/Users/ppg/private/seed.local.json': JSON.stringify(validSeedFile),
    });
    let called = false;
    const streamAnswer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      yield 'raw answer secret should never be written';
    };

    const exitCode = await runReaderAILiveFixtureEvalCli(
      ['--fixture', 'fixture.json', '--runtime', '/Users/ppg/private/runtime.local.json', '--live'],
      toCliIO(memory),
      { streamAnswer, prepareRetrievalContext: async () => undefined },
    );

    expect(exitCode).toBe(1);
    expect(memory.errors).toEqual(['runtime provider API key is required']);
    expect(memory.writes).toEqual([]);
    expect(called).toBe(false);
    expectNoPrivateTokens(memory.errors.join('\n'));
  });

  it('does not leak prompts, keys, urls, paths, or raw exception messages after runtime inputs are used', async () => {
    const memory = createMemoryIO({
      'fixture.json': JSON.stringify(validFixture),
      '/Users/ppg/private/runtime.local.json': JSON.stringify(validRuntimeSettings),
    });
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
      ['--fixture', 'fixture.json', '--runtime', '/Users/ppg/private/runtime.local.json', '--live'],
      toCliIO(memory),
      {
        streamAnswer,
        prepareRetrievalContext: async () => undefined,
        env: { READER_AI_LIVE_FIXTURE_API_KEY: 'sk-live-fixture-env-secret' },
        now: (() => {
          const values = [1000, 1010, 1010];
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)] ?? 0;
        })(),
      },
    );

    expect(exitCode).toBe(0);
    expect(memory.errors).toEqual([]);
    expect(memory.writes).toEqual([
      'tmp/reader-ai/live-fixture/cli-envelope.json',
      'tmp/reader-ai/live-fixture/cli-report.json',
      'tmp/reader-ai/live-fixture/cli-report.md',
    ]);
    expectNoPrivateTokens(memory.logs.join('\n'));
    expectNoPrivateTokens(combinedWrittenOutput(memory));
  });
});
