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
