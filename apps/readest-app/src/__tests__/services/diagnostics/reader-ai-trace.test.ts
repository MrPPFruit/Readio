import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logReaderAITraceEvent } from '@/services/diagnostics/readerAITrace';

const { logDiagnosticEventMock } = vi.hoisted(() => ({
  logDiagnosticEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticEvent: logDiagnosticEventMock,
}));

describe('reader AI trace diagnostics', () => {
  beforeEach(() => {
    logDiagnosticEventMock.mockClear();
  });

  it('emits metadata-only action traces with run correlation and latency fields', async () => {
    await logReaderAITraceEvent({
      runId: 'run-123',
      stage: 'retrieval',
      action: 'entity_sidecar_lookup',
      status: 'completed',
      durationMs: 24,
      candidateCount: 12,
      selectedCount: 5,
      latencyBudgetMs: 3_000,
      firstOutputBudgetMs: 15_000,
      overBudgetStage: 'retrieval',
      recoveryHint: 'retry_same_turn',
    });

    expect(logDiagnosticEventMock).toHaveBeenCalledWith('reader_ai.trace', 'debug', {
      schemaVersion: 1,
      component: 'reader_ai_harness',
      privacyTier: 'metadata_only',
      runId: 'run-123',
      stage: 'retrieval',
      action: 'entity_sidecar_lookup',
      status: 'completed',
      durationMs: 24,
      candidateCount: 12,
      selectedCount: 5,
      latencyBudgetMs: 3_000,
      firstOutputBudgetMs: 15_000,
      overBudgetStage: 'retrieval',
      recoveryHint: 'retry_same_turn',
    });
  });

  it('supports lifecycle run boundary trace actions', async () => {
    await logReaderAITraceEvent({
      runId: 'run-lifecycle',
      stage: 'run',
      action: 'start_run',
      status: 'started',
      firstOutputBudgetMs: 15_000,
    });

    expect(logDiagnosticEventMock).toHaveBeenCalledWith('reader_ai.trace', 'debug', {
      schemaVersion: 1,
      component: 'reader_ai_harness',
      privacyTier: 'metadata_only',
      runId: 'run-lifecycle',
      stage: 'run',
      action: 'start_run',
      status: 'started',
      firstOutputBudgetMs: 15_000,
    });
  });

  it('drops content-bearing and stable book identity fields before logging', async () => {
    await logReaderAITraceEvent({
      runId: 'run-privacy',
      stage: 'generation',
      action: 'generate_answer',
      status: 'completed',
      durationMs: 100,
      question: '阿兹克是谁？',
      answer: '阿兹克是克莱恩的老师。',
      sourceText: 'private source text',
      snippet: 'private snippet',
      prompt: 'private prompt',
      bookTitle: 'private title',
      authorName: 'private author',
      bookHash: 'stable-book-hash',
      localPath: '/Users/ppg/private/book.epub',
      chapterTitle: 'private chapter',
      rawMessages: [{ role: 'user', content: 'private' }],
    });

    const [, , metadata] = logDiagnosticEventMock.mock.calls[0] ?? [];
    expect(metadata).toEqual({
      schemaVersion: 1,
      component: 'reader_ai_harness',
      privacyTier: 'metadata_only',
      runId: 'run-privacy',
      stage: 'generation',
      action: 'generate_answer',
      status: 'completed',
      durationMs: 100,
    });
  });
});
