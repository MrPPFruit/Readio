import { describe, expect, it } from 'vitest';

import type { ReaderAIServiceEvalStreamer } from '@/services/ai/eval/readerAIServiceEvalRunner';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import {
  parseReaderAILiveFixture,
  runReaderAILiveFixtureEval,
  validateReaderAILiveFixture,
} from '@/services/ai/eval/readerAILiveFixtureEvalRunner';
import {
  buildReaderAILiveFixtureRuntimeBridge,
  parseReaderAILiveFixtureRuntimeSettings,
  runtimeBridgeInputFromEnv,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';

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

const validRuntime = {
  provider: { apiKey: 'sk-runtime-provider-secret' },
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

  it('omits unknown safe-looking fields from parsed fixtures', () => {
    const fixture = {
      ...validFixture,
      displayName: 'safe extra top-level field',
      settings: {
        ...validFixture.settings,
        temperature: 0.2,
        label: 'safe extra settings field',
      },
      runtimeBook: {
        ...validFixture.runtimeBook,
        readingProgressLabel: 'safe extra runtime field',
      },
      outputs: {
        ...validFixture.outputs,
        summary: 'safe extra output field',
      },
      cases: [
        {
          ...validFixture.cases[0],
          difficulty: 'easy',
          tags: ['recall'],
          notes: ['safe declared notes field'],
        },
      ],
    };

    const parsed = parseReaderAILiveFixture(JSON.stringify(fixture));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
    expect(parsed.fixture).toEqual({
      ...validFixture,
      cases: [
        {
          ...validFixture.cases[0],
          tags: ['recall'],
          notes: ['safe declared notes field'],
        },
      ],
    });
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

describe('Reader AI live fixture runtime provider bridge', () => {
  it('builds in-memory AI settings from a runtime API key without changing fixture metadata', () => {
    const parsed = parseReaderAILiveFixture(JSON.stringify(validFixture));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: { apiKey: 'sk-runtime-provider-secret' },
    });

    expect(bridge.ok).toBe(true);
    if (!bridge.ok) throw new Error(bridge.issues.join('\n'));
    expect(bridge.settings).toMatchObject({
      enabled: true,
      showReaderAIEntrypoints: true,
      provider: 'openai',
      providerModels: { openai: 'gpt-test' },
      spoilerProtection: true,
      maxContextChunks: 6,
      indexingMode: 'on-demand',
    });
    expect(bridge.settings.providerApiKeys.openai).toBe('sk-runtime-provider-secret');
    expect(parsed.fixture.settings).toEqual({ provider: 'openai', model: 'gpt-test' });
  });

  it('fails closed when runtime provider credentials are missing', () => {
    const parsed = parseReaderAILiveFixture(JSON.stringify(validFixture));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {});

    expect(bridge.ok).toBe(false);
    if (bridge.ok) throw new Error('expected provider preflight failure');
    expect(bridge.issues).toEqual(['runtime provider API key is required']);
  });

  it('accepts an explicitly allowed custom local testing proxy without an API key', () => {
    const parsed = parseReaderAILiveFixture(
      JSON.stringify({
        ...validFixture,
        settings: { provider: 'custom-openai-compatible', model: 'local-model' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: {
        customProviderBaseUrl: 'http://127.0.0.1:11434/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
    });

    expect(bridge.ok).toBe(true);
    if (!bridge.ok) throw new Error(bridge.issues.join('\n'));
    expect(bridge.settings.customProviderBaseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(bridge.settings.allowUnsafeCustomProviderBaseUrl).toBe(true);
    expect(bridge.settings.providerApiKeys['custom-openai-compatible']).toBeUndefined();
  });

  it('rejects invalid custom provider base URLs with safe deterministic issues', () => {
    const parsed = parseReaderAILiveFixture(
      JSON.stringify({
        ...validFixture,
        settings: { provider: 'custom-openai-compatible', model: 'local-model' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: {
        customProviderBaseUrl: 'http://public.example.invalid/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
    });

    expect(bridge.ok).toBe(false);
    if (bridge.ok) throw new Error('expected custom URL failure');
    expect(bridge.issues).toEqual(['runtime custom provider base URL is invalid']);
  });

  it('rejects provider secrets and base URLs persisted in fixture JSON', () => {
    const validation = validateReaderAILiveFixture({
      ...validFixture,
      settings: {
        ...validFixture.settings,
        apiKey: 'sk-fixture-secret',
        customProviderBaseUrl: 'https://private.example.test/v1',
      },
    });

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected fixture secret rejection');
    expect(validation.issues).toContain(
      'settings.apiKey is not allowed in Reader AI eval metadata',
    );
    expect(validation.issues).toContain(
      'settings.customProviderBaseUrl is not allowed in Reader AI eval metadata',
    );
  });

  it('parses runtime settings JSON and eval-specific environment variables', () => {
    const parsed = parseReaderAILiveFixtureRuntimeSettings(
      JSON.stringify({
        provider: {
          apiKey: 'sk-runtime-file-secret',
          customProviderBaseUrl: 'https://private.example.test/v1',
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
    expect(parsed.runtime.provider?.apiKey).toBe('sk-runtime-file-secret');
    expect(parsed.runtime.provider?.customProviderBaseUrl).toBe('https://private.example.test/v1');

    expect(
      runtimeBridgeInputFromEnv({
        READER_AI_LIVE_FIXTURE_API_KEY: 'sk-runtime-env-secret',
        READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL: 'https://env.example.test/v1',
        READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY: 'true',
        READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED: 'tmp/reader-ai/live-fixture/seed.local.json',
      }),
    ).toEqual({
      provider: {
        apiKey: 'sk-runtime-env-secret',
        customProviderBaseUrl: 'https://env.example.test/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
      retrievalSeedPath: 'tmp/reader-ai/live-fixture/seed.local.json',
    });
  });

  it('rejects present runtime settings fields with wrong types without echoing values', () => {
    const parsed = parseReaderAILiveFixtureRuntimeSettings(
      JSON.stringify({
        provider: {
          apiKey: 123,
          customProviderBaseUrl: ['https://private.example.test/v1'],
          allowUnsafeCustomProviderBaseUrl: 'true',
        },
        retrievalSeedPath: { path: 'tmp/reader-ai/live-fixture/seed.local.json' },
      }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error('expected runtime settings type failure');
    expect(parsed.issues).toEqual([
      'provider.apiKey must be a string',
      'provider.customProviderBaseUrl must be a string',
      'provider.allowUnsafeCustomProviderBaseUrl must be a boolean',
      'retrievalSeedPath must be a string',
    ]);
    expect(parsed.issues.join('\n')).not.toContain('123');
    expect(parsed.issues.join('\n')).not.toContain('private.example.test');
    expect(parsed.issues.join('\n')).not.toContain('tmp/reader-ai/live-fixture/seed.local.json');
  });
});

const createWritableMemory = () => {
  const writes = new Map<string, string>();
  return {
    writes,
    writeFile: async (path: string, content: string): Promise<void> => {
      writes.set(path, content);
    },
  };
};

const expectMetadataOnlyOutput = (content: string): void => {
  expect(content).not.toContain('runtime-private-book-hash');
  expect(content).not.toContain('Runtime Private Title');
  expect(content).not.toContain('Runtime Private Author');
  expect(content).not.toContain('local-test-book');
  expect(content).not.toContain('private answer must not be written');
  expect(content).not.toContain('private preview must not be written');
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

  it('refuses to call the streamer unless the fixture is marked live', async () => {
    const memory = createWritableMemory();
    let called = false;
    const streamer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      yield 'private answer must not be returned';
    };

    const output = await runReaderAILiveFixtureEval(validFixture, {
      live: true,
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
      runtime: validRuntime,
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

    const writtenOutput = Array.from(memory.writes.values()).join('\n');
    expectMetadataOnlyOutput(writtenOutput);
  });

  it('fails provider preflight before calling the streamer or writing artifacts', async () => {
    const memory = createWritableMemory();
    let called = false;
    const streamer: ReaderAIServiceEvalStreamer = async function* () {
      called = true;
      yield 'private answer must not be written';
    };

    const output = await runReaderAILiveFixtureEval(
      { ...validFixture, live: true },
      {
        live: true,
        streamAnswer: streamer,
        writeFile: memory.writeFile,
        now: () => 1000,
      },
    );

    expect(output.ok).toBe(false);
    if (output.ok) throw new Error('expected provider preflight failure');
    expect(output.issues).toEqual(['runtime provider API key is required']);
    expect(called).toBe(false);
    expect(memory.writes.size).toBe(0);
  });

  it('passes runtime AI settings to the streamer after provider preflight succeeds', async () => {
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

    const output = await runReaderAILiveFixtureEval(
      { ...validFixture, live: true },
      {
        live: true,
        runtime: validRuntime,
        streamAnswer: streamer,
        writeFile: memory.writeFile,
        now: (() => {
          const values = [1000, 1200, 1200];
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)] ?? 0;
        })(),
      },
    );

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    if (firstCall === undefined) throw new Error('expected streamer call');
    expect(firstCall.settings.providerApiKeys.openai).toBe('sk-runtime-provider-secret');
    expect(firstCall.settings.providerModels.openai).toBe('gpt-test');
  });

  it('records safe metadata only when live fixture streaming is aborted', async () => {
    const memory = createWritableMemory();
    const rawErrorMessage =
      'raw provider timeout leaked Runtime Private Title private answer must not be written';
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      await new Promise<void>((resolve) =>
        options.signal?.addEventListener('abort', () => resolve()),
      );
      if (options.signal?.aborted) throw new Error(rawErrorMessage);
      yield 'private answer must not be written';
    };

    const fixture = {
      ...validFixture,
      live: true,
      timeoutMs: 1,
    };

    const output = await runReaderAILiveFixtureEval(fixture, {
      live: true,
      runtime: validRuntime,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: (() => {
        const values = [1000, 1005, 1005];
        let index = 0;
        return () => values[Math.min(index++, values.length - 1)] ?? 0;
      })(),
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));
    expect(output.envelope.results).toHaveLength(1);
    expect(output.envelope.results[0]).toMatchObject({
      passed: false,
      reasons: ['aborted'],
      overBudgetStage: 'cancelled',
    });
    expect(output.envelope.traces).toContainEqual(
      expect.objectContaining({
        status: 'cancelled',
        recoveryHint: 'aborted',
        overBudgetStage: 'cancelled',
      }),
    );

    const serializedOutput = [
      JSON.stringify(output.envelope),
      ...Array.from(memory.writes.values()),
    ].join('\n');
    expect(serializedOutput).not.toContain(rawErrorMessage);
    expectMetadataOnlyOutput(serializedOutput);
  });
});
