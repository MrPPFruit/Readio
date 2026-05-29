import { describe, expect, it } from 'vitest';

import {
  READER_AI_EVAL_CASE_CATEGORIES,
  buildReaderAIEvalReport,
  buildReaderAITraceRunSummaries,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

describe('Reader AI eval foundation', () => {
  it('accepts ordinary-reader QA categories without committed book text', () => {
    expect(READER_AI_EVAL_CASE_CATEGORIES).toEqual([
      'person_recall',
      'object_recall',
      'event_recap',
      'relationship_recall',
      'current_recap',
      'citation_grounding',
      'spoiler_safety',
    ]);

    const result = validateReaderAIEvalCase({
      id: 'person-azik-recall',
      category: 'person_recall',
      language: 'zh-CN',
      question: '阿兹克是谁？',
      expectedBehavior: 'Identify the person using cited read-so-far evidence.',
      spoilerMode: 'read_so_far',
      tags: ['same_language', 'entity'],
      benchmarkMode: 'readio',
      notes: ['synthetic_fixture'],
    });

    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain('原文');
  });

  it('rejects eval cases that try to commit raw source text recursively', () => {
    const result = validateReaderAIEvalCase({
      id: 'unsafe-source-text',
      category: 'citation_grounding',
      language: 'zh-CN',
      question: '这段说明了什么？',
      expectedBehavior: 'Check citation support.',
      spoilerMode: 'read_so_far',
      metadata: {
        sourceText: 'private book passage',
        nested: { rawPrompt: 'private prompt' },
      },
    });

    expect(result).toEqual({
      valid: false,
      issues: [
        'metadata.sourceText is not allowed in Reader AI eval metadata',
        'metadata.nested.rawPrompt is not allowed in Reader AI eval metadata',
      ],
    });
  });

  it('validates objective result metadata and manual benchmark labels', () => {
    const result = validateReaderAIEvalResult({
      caseId: 'person-azik-recall',
      runId: 'run-123',
      classificationIntent: 'entity_lookup',
      sourceCount: 3,
      citationValid: true,
      insufficientAnswer: false,
      firstOutputMs: 4200,
      passed: true,
      reasons: ['cited correct supporting source'],
      provider: 'openai-compatible',
      model: 'reader-local-test',
      spoilerMode: 'read_so_far',
      overBudgetStage: 'none',
      manualBenchmark: {
        source: 'notebooklm',
        mode: 'whole_book',
        observations: ['more_complete', 'spoiler_boundary_diff'],
      },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('rejects unsafe result content recursively, including manual notes', () => {
    const result = validateReaderAIEvalResult({
      caseId: 'person-azik-recall',
      runId: 'run-123',
      classificationIntent: 'entity_lookup',
      sourceCount: 3,
      citationValid: true,
      insufficientAnswer: false,
      firstOutputMs: 4200,
      passed: true,
      reasons: ['cited correct supporting source'],
      manualBenchmark: {
        source: 'human',
        mode: 'read_so_far',
        observations: ['missed_citation'],
        answerText: 'private answer text',
      },
      evidence: { localPath: '/Users/ppg/private/book.epub' },
    });

    expect(result).toEqual({
      valid: false,
      issues: [
        'manualBenchmark.answerText is not allowed in Reader AI eval metadata',
        'evidence.localPath is not allowed in Reader AI eval metadata',
      ],
    });
  });
});

describe('Reader AI trace aggregation', () => {
  it('groups trace-like metadata by runId and summarizes safe fields', () => {
    const summaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-a',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 120,
        candidateCount: 8,
        selectedCount: 3,
        sourceCount: 3,
      },
      {
        runId: 'run-a',
        stage: 'citation_validation',
        action: 'validate_citations',
        status: 'completed',
        durationMs: 40,
        issueCount: 2,
        issueTypeCounts: { missing: 1, stale: 1 },
      },
      {
        runId: 'run-a',
        stage: 'generation',
        action: 'generate_answer',
        status: 'completed',
        durationMs: 900,
        firstOutputMs: 1300,
        overBudgetStage: 'generation',
        recoveryHint: 'none',
      },
      {
        runId: 'run-b',
        stage: 'run',
        action: 'complete_run',
        status: 'failed',
        durationMs: 50,
        overBudgetStage: 'timeout',
        recoveryHint: 'ask_user_to_retry',
      },
    ]);

    expect(summaries).toEqual([
      {
        runId: 'run-a',
        eventCount: 3,
        statuses: { completed: 3 },
        stageDurationsMs: { retrieval: 120, citation_validation: 40, generation: 900 },
        candidateCount: 8,
        selectedCount: 3,
        sourceCount: 3,
        issueCount: 2,
        issueTypeCounts: { missing: 1, stale: 1 },
        firstOutputMs: 1300,
        overBudgetStage: 'generation',
        recoveryHint: 'none',
        finalStatus: 'completed',
      },
      {
        runId: 'run-b',
        eventCount: 1,
        statuses: { failed: 1 },
        stageDurationsMs: { run: 50 },
        candidateCount: 0,
        selectedCount: 0,
        sourceCount: 0,
        issueCount: 0,
        issueTypeCounts: {},
        firstOutputMs: null,
        overBudgetStage: 'timeout',
        recoveryHint: 'ask_user_to_retry',
        finalStatus: 'failed',
      },
    ]);
  });

  it('ignores unknown and unsafe trace fields', () => {
    const summaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-private',
        stage: 'retrieval',
        action: 'hybrid_search',
        status: 'completed',
        durationMs: 100,
        sourceText: 'private source text',
        prompt: 'private prompt',
        nested: { answerText: 'private answer' },
      },
    ]);

    expect(JSON.stringify(summaries)).not.toContain('sourceText');
    expect(JSON.stringify(summaries)).not.toContain('private source text');
    expect(JSON.stringify(summaries)).not.toContain('private prompt');
    expect(JSON.stringify(summaries)).not.toContain('private answer');
    expect(summaries[0]).toEqual({
      runId: 'run-private',
      eventCount: 1,
      statuses: { completed: 1 },
      stageDurationsMs: { retrieval: 100 },
      candidateCount: 0,
      selectedCount: 0,
      sourceCount: 0,
      issueCount: 0,
      issueTypeCounts: {},
      firstOutputMs: null,
      overBudgetStage: 'none',
      recoveryHint: 'none',
      finalStatus: 'completed',
    });
  });
});

describe('Reader AI eval report summary', () => {
  it('calculates category pass rates, citations, latency, over-budget stages, and traces', () => {
    const runSummaries = buildReaderAITraceRunSummaries([
      {
        runId: 'run-a',
        stage: 'generation',
        action: 'generate_answer',
        status: 'completed',
        firstOutputMs: 1200,
      },
    ]);

    const report = buildReaderAIEvalReport({
      cases: [
        {
          id: 'person-azik-recall',
          category: 'person_recall',
          language: 'zh-CN',
          question: '阿兹克是谁？',
          expectedBehavior: 'Identify the person using cited read-so-far evidence.',
          spoilerMode: 'read_so_far',
        },
        {
          id: 'object-clock-recall',
          category: 'object_recall',
          language: 'zh-CN',
          question: '那只钟有什么用？',
          expectedBehavior: 'Describe the object without quoting source text.',
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
          overBudgetStage: 'none',
        },
        {
          caseId: 'person-azik-recall',
          runId: 'run-b',
          classificationIntent: 'entity_lookup',
          sourceCount: 1,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 3600,
          passed: false,
          reasons: ['missing citation'],
          overBudgetStage: 'citation_validation',
        },
        {
          caseId: 'object-clock-recall',
          runId: 'run-c',
          classificationIntent: 'object_lookup',
          sourceCount: 2,
          citationValid: true,
          insufficientAnswer: false,
          firstOutputMs: 2400,
          passed: true,
          reasons: ['grounded answer'],
          overBudgetStage: 'retrieval',
          manualBenchmark: {
            source: 'notebooklm',
            mode: 'whole_book',
            observations: ['more_complete'],
          },
        },
      ],
      runSummaries,
    });

    expect(report).toEqual({
      totalCases: 2,
      totalResults: 3,
      passed: 2,
      failed: 1,
      byCategory: {
        person_recall: {
          total: 2,
          passed: 1,
          insufficientAnswers: 1,
          citationValid: 1,
          firstOutputMs: { min: 1200, max: 3600, average: 2400 },
          overBudgetStages: { none: 1, citation_validation: 1 },
        },
        object_recall: {
          total: 1,
          passed: 1,
          insufficientAnswers: 0,
          citationValid: 1,
          firstOutputMs: { min: 2400, max: 2400, average: 2400 },
          overBudgetStages: { retrieval: 1 },
        },
      },
      runSummaries,
    });
    expect(JSON.stringify(report)).not.toContain('more_complete');
  });
});
