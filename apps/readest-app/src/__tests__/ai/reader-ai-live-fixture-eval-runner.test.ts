import { describe, expect, it } from 'vitest';

import type { ReaderAIServiceEvalStreamer } from '@/services/ai/eval/readerAIServiceEvalRunner';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import {
  parseReaderAILiveFixture,
  runReaderAILiveFixtureEval,
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
