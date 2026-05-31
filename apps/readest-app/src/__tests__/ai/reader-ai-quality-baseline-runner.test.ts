import { describe, expect, it } from 'vitest';

import { buildReaderAIQualityBaselineRun } from '@/services/ai/eval/readerAIQualityBaselineRunner';

describe('Reader AI quality baseline runner output', () => {
  it('builds deterministic JSON and Markdown baseline summaries from valid metadata inputs', () => {
    const output = buildReaderAIQualityBaselineRun({
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
          id: 'event-recap',
          category: 'event_recap',
          language: 'en',
          question: 'What just happened?',
          expectedBehavior: 'Recap the current event without spoilers.',
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
          spoilerMode: 'read_so_far',
          overBudgetStage: 'none',
        },
        {
          caseId: 'event-recap',
          runId: 'run-b',
          classificationIntent: 'event_lookup',
          sourceCount: 0,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 8400,
          passed: false,
          reasons: ['missing_sources', 'unexpected_insufficient_answer'],
          provider: 'custom-openai-compatible',
          model: 'baseline-model',
          spoilerMode: 'read_so_far',
          overBudgetStage: 'retrieval',
        },
      ],
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));

    expect(output.baseline).toEqual({
      totalCases: 2,
      totalResults: 2,
      passed: 1,
      failed: 1,
      byCategory: {
        event_recap: {
          total: 1,
          passed: 0,
          failed: 1,
          citationValid: 0,
          insufficientAnswers: 1,
        },
        person_recall: {
          total: 1,
          passed: 1,
          failed: 0,
          citationValid: 1,
          insufficientAnswers: 0,
        },
      },
      byLanguage: {
        en: {
          total: 1,
          passed: 0,
          failed: 1,
          citationValid: 0,
          insufficientAnswers: 1,
        },
        'zh-CN': {
          total: 1,
          passed: 1,
          failed: 0,
          citationValid: 1,
          insufficientAnswers: 0,
        },
      },
      byProviderModel: {
        'custom-openai-compatible/baseline-model': {
          total: 2,
          passed: 1,
          failed: 1,
          citationValid: 1,
          insufficientAnswers: 1,
        },
      },
      reasonCounts: {
        missing_sources: 1,
        service_eval_passed: 1,
        unexpected_insufficient_answer: 1,
      },
      citation: { valid: 1, invalid: 1 },
      sourceCountBuckets: { '0': 1, '1-2': 0, '3-5': 1, '6+': 0 },
      firstOutputLatencyBuckets: { '0-1s': 0, '1-3s': 1, '3-8s': 0, '8s+': 1 },
      overBudgetStages: { none: 1, retrieval: 1 },
      manualObservationCounts: {},
    });
    expect(output.markdown).toContain('# Reader AI Quality Baseline');
    expect(output.markdown).toContain('## Overview');
    expect(output.markdown).toContain('## Category Summary');
    expect(output.markdown).toContain('| person_recall | 1 | 1 | 0 | 1 | 0 |');
    expect(output.markdown).not.toContain('阿兹克是谁');
    expect(output.markdown).not.toContain('What just happened');
  });
});
