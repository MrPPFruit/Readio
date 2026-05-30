import { describe, expect, it } from 'vitest';

import {
  runReaderAIServiceEval,
  type ReaderAIServiceEvalStreamer,
} from '@/services/ai/eval/readerAIServiceEvalRunner';
import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';
import type { ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import type { AISettings } from '@/services/ai/types';

const settings: AISettings = {
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openai',
  providerApiKeys: { openai: 'not-used' },
  providerModels: { openai: 'gpt-test' },
  customProviderBaseUrl: '',
  spoilerProtection: true,
  maxContextChunks: 6,
  indexingMode: 'on-demand',
};

const baseCase: ReaderAIEvalCase = {
  id: 'person-azik-recall',
  category: 'person_recall',
  language: 'zh-CN',
  question: '阿兹克是谁？',
  expectedBehavior: 'Identify the person using cited read-so-far evidence.',
  spoilerMode: 'read_so_far',
};

const createClock = (values: number[]): (() => number) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

describe('runReaderAIServiceEval', () => {
  it('runs controlled cases through an injected streamer and returns a reportable metadata envelope', async () => {
    const calls: StreamReaderAIAnswerOptions[] = [];
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      calls.push(options);
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'private preview must not be returned',
          href: 'readio://private-source',
          confidence: 'exact',
        },
        {
          id: 'source-b',
          chapterTitle: 'Chapter 2',
          previewText: 'another private preview must not be returned',
          href: 'readio://private-source-b',
          confidence: 'section',
        },
      ]);
      yield 'private answer chunk must not be returned';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [baseCase],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          authorName: 'Private Author',
          currentPage: 42,
          currentAIPage: 40,
          messages: [],
        },
      },
      {
        streamAnswer: streamer,
        now: createClock([1000, 1300, 1300]),
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      settings,
      bookHash: 'private-book-hash',
      bookTitle: 'Private Book Title',
      authorName: 'Private Author',
      currentPage: 42,
      currentAIPage: 40,
      messages: [],
      question: '阿兹克是谁？',
      runId: 'person-azik-recall-1',
    });

    expect(envelope.cases).toEqual([baseCase]);
    expect(envelope.results).toEqual([
      {
        caseId: 'person-azik-recall',
        runId: 'person-azik-recall-1',
        classificationIntent: 'unknown',
        sourceCount: 2,
        citationValid: true,
        insufficientAnswer: false,
        firstOutputMs: 300,
        passed: true,
        reasons: ['service_eval_passed'],
        provider: 'openai',
        model: 'gpt-test',
        spoilerMode: 'read_so_far',
        overBudgetStage: 'none',
      },
    ]);
    expect(envelope.traces).toEqual([
      {
        runId: 'person-azik-recall-1',
        stage: 'generation',
        action: 'service_eval_stream',
        status: 'completed',
        durationMs: 300,
        sourceCount: 2,
        firstOutputMs: 300,
        overBudgetStage: 'none',
      },
    ]);

    expect(JSON.stringify(envelope)).not.toContain('private answer chunk');
    expect(JSON.stringify(envelope)).not.toContain('private preview');
    expect(JSON.stringify(envelope)).not.toContain('Private Book Title');
    expect(JSON.stringify(envelope)).not.toContain('Private Author');
    expect(JSON.stringify(envelope)).not.toContain('private-book-hash');
    expect(JSON.stringify(envelope)).not.toContain('readio://private-source');

    const reportOutput = buildReaderAIEvalReportRun(envelope);
    expect(reportOutput.ok).toBe(true);
    if (!reportOutput.ok) throw new Error(reportOutput.issues.join('\n'));
    expect(reportOutput.report.totalCases).toBe(1);
    expect(reportOutput.report.totalResults).toBe(1);
    expect(reportOutput.report.passed).toBe(1);
  });

  it('preserves zero millisecond first output when the first chunk arrives immediately', async () => {
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([
        {
          id: 'immediate-source',
          chapterTitle: 'Immediate Chapter',
          previewText: 'private immediate preview must not be returned',
          href: 'readio://private-immediate-source',
          confidence: 'exact',
        },
      ]);
      yield 'private immediate answer must not be returned';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [{ ...baseCase, id: 'immediate-output-case' }],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          authorName: 'Private Author',
          currentPage: 42,
          messages: [],
        },
      },
      { streamAnswer: streamer, now: createClock([7000, 7000, 7500]) },
    );

    expect(envelope.results[0]).toMatchObject({
      caseId: 'immediate-output-case',
      runId: 'immediate-output-case-1',
      sourceCount: 1,
      firstOutputMs: 0,
      passed: true,
      reasons: ['service_eval_passed'],
    });
    expect(envelope.traces[0]).toMatchObject({
      runId: 'immediate-output-case-1',
      status: 'completed',
      durationMs: 500,
      sourceCount: 1,
      firstOutputMs: 0,
    });
    expect(JSON.stringify(envelope)).not.toContain('private immediate answer');
    expect(JSON.stringify(envelope)).not.toContain('private immediate preview');
    expect(JSON.stringify(envelope)).not.toContain('Private Book Title');
    expect(JSON.stringify(envelope)).not.toContain('Private Author');
    expect(JSON.stringify(envelope)).not.toContain('private-book-hash');
    expect(JSON.stringify(envelope)).not.toContain('readio://private-immediate-source');
  });

  it('marks no-output runs as failed without storing raw content', async () => {
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([]);
      if (options.question === 'never yield') yield '';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [{ ...baseCase, id: 'no-output-case', question: 'never yield' }],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          authorName: 'Private Author',
          currentPage: 42,
          messages: [],
        },
      },
      { streamAnswer: streamer, now: createClock([2000, 2100]) },
    );

    expect(envelope.results[0]).toMatchObject({
      caseId: 'no-output-case',
      runId: 'no-output-case-1',
      sourceCount: 0,
      citationValid: false,
      insufficientAnswer: false,
      firstOutputMs: 0,
      passed: false,
      reasons: ['no_output', 'missing_sources'],
      overBudgetStage: 'none',
    });
    expect(envelope.traces[0]).toMatchObject({
      runId: 'no-output-case-1',
      status: 'failed',
      durationMs: 100,
      sourceCount: 0,
      firstOutputMs: 0,
    });
  });

  it('treats expected insufficient evidence as pass and unexpected insufficient evidence as fail', async () => {
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([]);
      yield '抱歉，当前阅读进度内没有足够证据回答这个问题。';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [
          {
            ...baseCase,
            id: 'expected-insufficient',
            tags: ['expects_insufficient_evidence'],
          },
          { ...baseCase, id: 'unexpected-insufficient' },
        ],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          currentPage: 42,
          messages: [],
        },
      },
      { streamAnswer: streamer, now: createClock([3000, 3100, 3200, 3300, 3400, 3500]) },
    );

    expect(envelope.results[0]).toMatchObject({
      caseId: 'expected-insufficient',
      insufficientAnswer: true,
      passed: true,
      reasons: ['expected_insufficient_answer'],
    });
    expect(envelope.results[1]).toMatchObject({
      caseId: 'unexpected-insufficient',
      insufficientAnswer: true,
      passed: false,
      reasons: ['unexpected_insufficient_answer', 'missing_sources'],
    });
  });

  it('records safe failure labels for thrown stream errors and aborts', async () => {
    const errorStreamer: ReaderAIServiceEvalStreamer = async function* (options) {
      if (options.question === 'unreachable') yield '';
      throw new Error('private source text must not leak');
    };
    const abortedController = new AbortController();
    abortedController.abort();

    const errorEnvelope = await runReaderAIServiceEval(
      {
        cases: [{ ...baseCase, id: 'error-case' }],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          currentPage: 42,
          messages: [],
        },
      },
      { streamAnswer: errorStreamer, now: createClock([4000, 4120]) },
    );

    const abortEnvelope = await runReaderAIServiceEval(
      {
        cases: [{ ...baseCase, id: 'abort-case' }],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          currentPage: 42,
          messages: [],
          signal: abortedController.signal,
        },
      },
      { streamAnswer: errorStreamer, now: createClock([5000, 5010]) },
    );

    expect(errorEnvelope.results[0]).toMatchObject({
      caseId: 'error-case',
      passed: false,
      reasons: ['stream_error'],
      firstOutputMs: 0,
      overBudgetStage: 'unknown',
    });
    expect(errorEnvelope.traces[0]).toMatchObject({
      status: 'failed',
      recoveryHint: 'stream_error',
    });
    expect(JSON.stringify(errorEnvelope)).not.toContain('private source text');

    expect(abortEnvelope.results[0]).toMatchObject({
      caseId: 'abort-case',
      passed: false,
      reasons: ['aborted'],
      overBudgetStage: 'cancelled',
    });
    expect(abortEnvelope.traces[0]).toMatchObject({
      status: 'cancelled',
      recoveryHint: 'aborted',
      overBudgetStage: 'cancelled',
    });
  });

  it('uses explicit run ids and sanitizes injected trace-like metadata', async () => {
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'private source preview',
          href: 'readio://private-source',
          confidence: 'exact',
        },
      ]);
      yield 'answer text must not be returned';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [baseCase],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          currentPage: 42,
          messages: [],
        },
        runIds: { 'person-azik-recall': 'explicit-run-123' },
      },
      {
        streamAnswer: streamer,
        now: createClock([6000, 6200, 6300]),
        collectTraceEvents: ({ runId }) => [
          {
            runId,
            stage: 'retrieval',
            action: 'hybrid_search',
            status: 'completed',
            durationMs: 80,
            candidateCount: 4,
            selectedCount: 1,
            sourceCount: 1,
            sourceText: 'private source text',
            prompt: 'private prompt',
            nested: { answerText: 'private answer' },
          },
        ],
      },
    );

    expect(envelope.results[0]?.runId).toBe('explicit-run-123');
    expect(envelope.traces).toEqual([
      {
        runId: 'explicit-run-123',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 80,
        candidateCount: 4,
        selectedCount: 1,
        sourceCount: 1,
      },
      {
        runId: 'explicit-run-123',
        stage: 'generation',
        action: 'service_eval_stream',
        status: 'completed',
        durationMs: 300,
        sourceCount: 1,
        firstOutputMs: 200,
        overBudgetStage: 'none',
      },
    ]);
    expect(JSON.stringify(envelope)).not.toContain('sourceText');
    expect(JSON.stringify(envelope)).not.toContain('private source text');
    expect(JSON.stringify(envelope)).not.toContain('private prompt');
    expect(JSON.stringify(envelope)).not.toContain('private answer');
  });

  it('drops unsafe values from injected trace-like metadata allowlist keys', async () => {
    const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
      options.onSources?.([
        {
          id: 'source-a',
          chapterTitle: 'Chapter 1',
          previewText: 'private source preview',
          href: 'readio://private-source',
          confidence: 'exact',
        },
      ]);
      yield 'private answer chunk must not be returned';
    };

    const envelope = await runReaderAIServiceEval(
      {
        cases: [baseCase],
        context: {
          settings,
          bookHash: 'private-book-hash',
          bookTitle: 'Private Book Title',
          currentPage: 42,
          messages: [],
        },
        runIds: { 'person-azik-recall': 'safe-run-456' },
      },
      {
        streamAnswer: streamer,
        now: createClock([8000, 8050, 8200]),
        collectTraceEvents: () => [
          {
            runId: 'private alternate run id',
            stage: 'private prompt stage text',
            action: 'private prompt action text',
            status: 'private answer status text',
            durationMs: 42,
            candidateCount: Number.NaN,
            selectedCount: -1,
            sourceCount: 2,
            issueCount: Number.POSITIVE_INFINITY,
            issueTypeCounts: { safe_issue: 2, unsafe_issue: -1 },
            firstOutputMs: 0,
            overBudgetStage: 'private source over-budget text',
            recoveryHint: 'private source recovery text',
          },
          {
            runId: 'safe-run-456',
            stage: 'retrieval',
            action: 'hybrid_search',
            status: 'completed',
            durationMs: 12,
            candidateCount: 4,
            selectedCount: 2,
            sourceCount: 2,
            issueCount: 1,
            issueTypeCounts: { missing_citation: 1 },
            firstOutputMs: 0,
            overBudgetStage: 'none',
            recoveryHint: 'stream_error',
          },
        ],
      },
    );

    expect(JSON.stringify(envelope)).not.toContain('private prompt');
    expect(JSON.stringify(envelope)).not.toContain('private source');
    expect(JSON.stringify(envelope)).not.toContain('private answer');
    expect(JSON.stringify(envelope)).not.toContain('private alternate run id');
    expect(envelope.traces).toEqual([
      {
        durationMs: 42,
        sourceCount: 2,
        issueTypeCounts: { safe_issue: 2 },
        firstOutputMs: 0,
      },
      {
        runId: 'safe-run-456',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 12,
        candidateCount: 4,
        selectedCount: 2,
        sourceCount: 2,
        issueCount: 1,
        issueTypeCounts: { missing_citation: 1 },
        firstOutputMs: 0,
        overBudgetStage: 'none',
        recoveryHint: 'stream_error',
      },
      {
        runId: 'safe-run-456',
        stage: 'generation',
        action: 'service_eval_stream',
        status: 'completed',
        durationMs: 200,
        sourceCount: 1,
        firstOutputMs: 50,
        overBudgetStage: 'none',
      },
    ]);
  });
});
