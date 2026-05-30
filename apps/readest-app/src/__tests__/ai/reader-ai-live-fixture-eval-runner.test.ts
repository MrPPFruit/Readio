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
