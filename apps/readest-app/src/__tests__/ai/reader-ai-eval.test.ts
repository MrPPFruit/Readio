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
