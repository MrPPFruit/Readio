import { describe, expect, it } from 'vitest';

import {
  READER_AI_EVAL_CASE_CATEGORIES,
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
    });

    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain('原文');
  });

  it('rejects eval cases that try to commit raw source text', () => {
    const result = validateReaderAIEvalCase({
      id: 'unsafe-source-text',
      category: 'citation_grounding',
      language: 'zh-CN',
      question: '这段说明了什么？',
      expectedBehavior: 'Check citation support.',
      spoilerMode: 'read_so_far',
      sourceText: 'private book passage',
    });

    expect(result).toEqual({
      valid: false,
      issues: ['sourceText is not allowed in committed eval cases'],
    });
  });

  it('validates objective result metadata without answer text', () => {
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
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });
});
