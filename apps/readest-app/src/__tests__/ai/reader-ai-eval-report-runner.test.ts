import { describe, expect, it } from 'vitest';

import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';

describe('Reader AI eval report runner validation', () => {
  it('rejects non-object input and non-array envelope fields', () => {
    expect(buildReaderAIEvalReportRun(null)).toEqual({
      ok: false,
      report: null,
      markdown: '',
      issues: ['input must be an object'],
    });

    expect(
      buildReaderAIEvalReportRun({
        cases: {},
        results: [],
        traces: {},
      }),
    ).toEqual({
      ok: false,
      report: null,
      markdown: '',
      issues: ['cases must be an array', 'traces must be an array when provided'],
    });
  });

  it('fails closed when cases or results contain unsafe content-bearing fields', () => {
    const output = buildReaderAIEvalReportRun({
      cases: [
        {
          id: 'unsafe-case',
          category: 'citation_grounding',
          language: 'zh-CN',
          question: '这段说明了什么？',
          expectedBehavior: 'Check citation support.',
          spoilerMode: 'read_so_far',
          metadata: { sourceText: 'private source passage' },
        },
      ],
      results: [
        {
          caseId: 'unsafe-case',
          runId: 'run-private',
          classificationIntent: 'citation_check',
          sourceCount: 1,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 1500,
          passed: false,
          reasons: ['missing citation'],
          evidence: { rawPrompt: 'private prompt text' },
        },
      ],
    });

    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([
      'cases[0].metadata.sourceText is not allowed in Reader AI eval metadata',
      'results[0].evidence.rawPrompt is not allowed in Reader AI eval metadata',
    ]);
    expect(JSON.stringify(output)).not.toContain('private source passage');
    expect(JSON.stringify(output)).not.toContain('private prompt text');
  });
});

describe('Reader AI eval report runner output', () => {
  it('builds deterministic JSON and Markdown reports from valid metadata inputs', () => {
    const output = buildReaderAIEvalReportRun({
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
          caseId: 'object-clock-recall',
          runId: 'run-b',
          classificationIntent: 'object_lookup',
          sourceCount: 2,
          citationValid: false,
          insufficientAnswer: true,
          firstOutputMs: 3600,
          passed: false,
          reasons: ['missing citation'],
          overBudgetStage: 'citation_validation',
          manualBenchmark: {
            source: 'notebooklm',
            mode: 'whole_book',
            observations: ['more_complete'],
          },
        },
      ],
      traces: [
        {
          runId: 'run-a',
          stage: 'retrieval',
          action: 'hybrid_search',
          status: 'completed',
          durationMs: 100,
          candidateCount: 6,
          selectedCount: 3,
          sourceCount: 3,
        },
        {
          runId: 'run-b',
          stage: 'citation_validation',
          action: 'validate_citations',
          status: 'failed',
          durationMs: 80,
          issueCount: 2,
          issueTypeCounts: { missing: 2 },
          overBudgetStage: 'citation_validation',
        },
      ],
    });

    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issues.join('\n'));

    expect(output.report).toEqual({
      totalCases: 2,
      totalResults: 2,
      passed: 1,
      failed: 1,
      byCategory: {
        person_recall: {
          total: 1,
          passed: 1,
          insufficientAnswers: 0,
          citationValid: 1,
          firstOutputMs: { min: 1200, max: 1200, average: 1200 },
          overBudgetStages: { none: 1 },
        },
        object_recall: {
          total: 1,
          passed: 0,
          insufficientAnswers: 1,
          citationValid: 0,
          firstOutputMs: { min: 3600, max: 3600, average: 3600 },
          overBudgetStages: { citation_validation: 1 },
        },
      },
      runSummaries: [
        {
          runId: 'run-a',
          eventCount: 1,
          statuses: { completed: 1 },
          stageDurationsMs: { retrieval: 100 },
          candidateCount: 6,
          selectedCount: 3,
          sourceCount: 3,
          issueCount: 0,
          issueTypeCounts: {},
          firstOutputMs: null,
          overBudgetStage: 'none',
          recoveryHint: 'none',
          finalStatus: 'completed',
        },
        {
          runId: 'run-b',
          eventCount: 1,
          statuses: { failed: 1 },
          stageDurationsMs: { citation_validation: 80 },
          candidateCount: 0,
          selectedCount: 0,
          sourceCount: 0,
          issueCount: 2,
          issueTypeCounts: { missing: 2 },
          firstOutputMs: null,
          overBudgetStage: 'citation_validation',
          recoveryHint: 'none',
          finalStatus: 'failed',
        },
      ],
    });

    expect(output.markdown).toContain('# Reader AI Eval Report');
    expect(output.markdown).toContain('## Overview');
    expect(output.markdown).toContain('## Category Summary');
    expect(output.markdown).toContain('## Over-Budget Stages');
    expect(output.markdown).toContain('## Run Summaries');
    expect(output.markdown).toContain(
      '| Category | Total | Passed | Citation Valid | Insufficient | First Output Min | First Output Max | First Output Avg |',
    );
    expect(output.markdown).toContain(
      '| person_recall | 1 | 1 | 1 | 0 | 1200ms | 1200ms | 1200ms |',
    );
    expect(output.markdown).toContain(
      '| run-b | failed | 1 | 0 | 0 | 0 | 2 | citation_validation |',
    );
    expect(output.markdown).not.toContain('more_complete');
  });
});
