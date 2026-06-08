import {
  type ReaderAIEvalCase,
  type ReaderAIEvalResult,
  validateReaderAIEvalCase,
  validateReaderAIEvalResult,
} from '@/services/ai/eval/readerAIEval';

export type ReaderAIQualityBaselineGroupSummary = {
  total: number;
  passed: number;
  failed: number;
  citationValid: number;
  insufficientAnswers: number;
};

export type ReaderAIQualityBaseline = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<string, ReaderAIQualityBaselineGroupSummary>;
  byLanguage: Record<string, ReaderAIQualityBaselineGroupSummary>;
  byProviderModel: Record<string, ReaderAIQualityBaselineGroupSummary>;
  reasonCounts: Record<string, number>;
  citation: {
    valid: number;
    invalid: number;
  };
  sourceCountBuckets: Record<'0' | '1-2' | '3-5' | '6+', number>;
  firstOutputLatencyBuckets: Record<'0-1s' | '1-3s' | '3-8s' | '8s+', number>;
  overBudgetStages: Record<string, number>;
  manualObservationCounts: Record<string, number>;
};

export type ReaderAIQualityBaselineRunnerOutput =
  | {
      ok: true;
      baseline: ReaderAIQualityBaseline;
      markdown: string;
      issues: [];
    }
  | {
      ok: false;
      baseline: null;
      markdown: '';
      issues: string[];
    };

type ReaderAIQualityBaselineInput = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createGroupSummary = (): ReaderAIQualityBaselineGroupSummary => ({
  total: 0,
  passed: 0,
  failed: 0,
  citationValid: 0,
  insufficientAnswers: 0,
});

const incrementGroupSummary = (
  groups: Record<string, ReaderAIQualityBaselineGroupSummary>,
  key: string,
  result: ReaderAIEvalResult,
): void => {
  groups[key] = groups[key] ?? createGroupSummary();
  const summary = groups[key];
  summary.total += 1;
  if (result.passed) {
    summary.passed += 1;
  } else {
    summary.failed += 1;
  }
  if (result.citationValid) summary.citationValid += 1;
  if (result.insufficientAnswer) summary.insufficientAnswers += 1;
};

const incrementCount = (counts: Record<string, number>, key: string, amount = 1): void => {
  counts[key] = (counts[key] ?? 0) + amount;
};

const sourceCountBucketFor = (
  sourceCount: number,
): keyof ReaderAIQualityBaseline['sourceCountBuckets'] => {
  if (sourceCount === 0) return '0';
  if (sourceCount <= 2) return '1-2';
  if (sourceCount <= 5) return '3-5';
  return '6+';
};

const firstOutputLatencyBucketFor = (
  firstOutputMs: number,
): keyof ReaderAIQualityBaseline['firstOutputLatencyBuckets'] => {
  if (firstOutputMs < 1000) return '0-1s';
  if (firstOutputMs < 3000) return '1-3s';
  if (firstOutputMs < 8000) return '3-8s';
  return '8s+';
};

const sortedRecord = <Value>(record: Record<string, Value>): Record<string, Value> =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));

const providerModelLabelFor = (result: ReaderAIEvalResult): string => {
  const provider = result.provider?.trim() || 'unknown_provider';
  const model = result.model?.trim() || 'unknown_model';
  return `${provider}/${model}`;
};

const parseInput = (input: unknown): { input?: ReaderAIQualityBaselineInput; issues: string[] } => {
  if (!isRecord(input)) return { issues: ['input must be an object'] };

  const casesInput = input['cases'];
  const resultsInput = input['results'];
  const issues: string[] = [];
  const cases: ReaderAIEvalCase[] = [];
  const results: ReaderAIEvalResult[] = [];

  if (!Array.isArray(casesInput)) {
    issues.push('cases must be an array');
  } else {
    casesInput.forEach((value, index) => {
      const validation = validateReaderAIEvalCase(value);
      if (!validation.valid) {
        issues.push(...validation.issues.map((issue) => `cases[${index}].${issue}`));
        return;
      }
      cases.push(value as ReaderAIEvalCase);
    });
  }

  if (!Array.isArray(resultsInput)) {
    issues.push('results must be an array');
  } else {
    resultsInput.forEach((value, index) => {
      const validation = validateReaderAIEvalResult(value);
      if (!validation.valid) {
        issues.push(...validation.issues.map((issue) => `results[${index}].${issue}`));
        return;
      }
      results.push(value as ReaderAIEvalResult);
    });
  }

  if (issues.length > 0) return { issues };

  const caseIds = new Set<string>();
  cases.forEach((evalCase, index) => {
    if (caseIds.has(evalCase.id)) {
      issues.push(`cases[${index}].id duplicates an earlier input case`);
      return;
    }
    caseIds.add(evalCase.id);
  });

  if (issues.length > 0) return { issues };

  results.forEach((result, index) => {
    if (!caseIds.has(result.caseId)) {
      issues.push(`results[${index}].caseId does not match an input case`);
    }
  });

  return issues.length > 0 ? { issues } : { input: { cases, results }, issues: [] };
};

const buildBaseline = ({
  cases,
  results,
}: ReaderAIQualityBaselineInput): ReaderAIQualityBaseline => {
  const casesById = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const byCategory: Record<string, ReaderAIQualityBaselineGroupSummary> = {};
  const byLanguage: Record<string, ReaderAIQualityBaselineGroupSummary> = {};
  const byProviderModel: Record<string, ReaderAIQualityBaselineGroupSummary> = {};
  const reasonCounts: Record<string, number> = {};
  const overBudgetStages: Record<string, number> = {};
  const manualObservationCounts: Record<string, number> = {};
  const sourceCountBuckets: ReaderAIQualityBaseline['sourceCountBuckets'] = {
    '0': 0,
    '1-2': 0,
    '3-5': 0,
    '6+': 0,
  };
  const firstOutputLatencyBuckets: ReaderAIQualityBaseline['firstOutputLatencyBuckets'] = {
    '0-1s': 0,
    '1-3s': 0,
    '3-8s': 0,
    '8s+': 0,
  };
  let passed = 0;
  let failed = 0;
  let citationValid = 0;
  let citationInvalid = 0;

  for (const result of results) {
    const evalCase = casesById.get(result.caseId);
    if (evalCase) {
      incrementGroupSummary(byCategory, evalCase.category, result);
      incrementGroupSummary(byLanguage, evalCase.language, result);
    }
    incrementGroupSummary(byProviderModel, providerModelLabelFor(result), result);

    if (result.passed) {
      passed += 1;
    } else {
      failed += 1;
    }
    if (result.citationValid) {
      citationValid += 1;
    } else {
      citationInvalid += 1;
    }

    for (const reason of result.reasons) incrementCount(reasonCounts, reason);
    sourceCountBuckets[sourceCountBucketFor(result.sourceCount)] += 1;
    firstOutputLatencyBuckets[firstOutputLatencyBucketFor(result.firstOutputMs)] += 1;
    incrementCount(overBudgetStages, result.overBudgetStage ?? 'none');

    const manualBenchmark = result.manualBenchmark;
    if (manualBenchmark) {
      for (const observation of manualBenchmark.observations) {
        incrementCount(manualObservationCounts, observation);
      }
    }
  }

  return {
    totalCases: cases.length,
    totalResults: results.length,
    passed,
    failed,
    byCategory: sortedRecord(byCategory),
    byLanguage: sortedRecord(byLanguage),
    byProviderModel: sortedRecord(byProviderModel),
    reasonCounts: sortedRecord(reasonCounts),
    citation: { valid: citationValid, invalid: citationInvalid },
    sourceCountBuckets,
    firstOutputLatencyBuckets,
    overBudgetStages: sortedRecord(overBudgetStages),
    manualObservationCounts: sortedRecord(manualObservationCounts),
  };
};

const groupSummaryTable = (
  title: string,
  groups: Record<string, ReaderAIQualityBaselineGroupSummary>,
): string[] => [
  `## ${title}`,
  '',
  '| Group | Total | Passed | Failed | Citation Valid | Insufficient Answers |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...Object.entries(groups).map(
    ([group, summary]) =>
      `| ${group} | ${summary.total} | ${summary.passed} | ${summary.failed} | ${summary.citationValid} | ${summary.insufficientAnswers} |`,
  ),
  '',
];

const countTable = (title: string, counts: Record<string, number>): string[] => [
  `## ${title}`,
  '',
  '| Key | Count |',
  '| --- | ---: |',
  ...Object.entries(counts).map(([key, count]) => `| ${key} | ${count} |`),
  '',
];

const countList = (title: string, counts: Record<string, number>): string[] => [
  `## ${title}`,
  '',
  ...Object.entries(counts).map(([key, count]) => `- ${key}: ${count}`),
  '',
];

export function renderReaderAIQualityBaselineMarkdown(baseline: ReaderAIQualityBaseline): string {
  return [
    '# Reader AI Quality Baseline',
    '',
    '## Overview',
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Total cases | ${baseline.totalCases} |`,
    `| Total results | ${baseline.totalResults} |`,
    `| Passed | ${baseline.passed} |`,
    `| Failed | ${baseline.failed} |`,
    `| Citation valid | ${baseline.citation.valid} |`,
    `| Citation invalid | ${baseline.citation.invalid} |`,
    '',
    ...groupSummaryTable('Category Summary', baseline.byCategory),
    ...groupSummaryTable('Language Summary', baseline.byLanguage),
    ...groupSummaryTable('Provider/Model Summary', baseline.byProviderModel),
    ...countTable('Reason Counts', baseline.reasonCounts),
    ...countTable('Source Count Buckets', baseline.sourceCountBuckets),
    ...countTable('First Output Latency Buckets', baseline.firstOutputLatencyBuckets),
    ...countTable('Over-Budget Stages', baseline.overBudgetStages),
    ...countList('Manual Observation Counts', baseline.manualObservationCounts),
  ].join('\n');
}

export function buildReaderAIQualityBaselineRun(
  input: unknown,
): ReaderAIQualityBaselineRunnerOutput {
  const parsed = parseInput(input);
  if (!parsed.input) {
    return { ok: false, baseline: null, markdown: '', issues: parsed.issues };
  }

  const baseline = buildBaseline(parsed.input);
  return {
    ok: true,
    baseline,
    markdown: renderReaderAIQualityBaselineMarkdown(baseline),
    issues: [],
  };
}
