import type { ReaderAIOverBudgetStage } from '@/services/diagnostics/readerAITrace';

export const READER_AI_EVAL_CASE_CATEGORIES = [
  'person_recall',
  'object_recall',
  'event_recap',
  'relationship_recall',
  'current_recap',
  'citation_grounding',
  'spoiler_safety',
] as const;

export type ReaderAIEvalCaseCategory = (typeof READER_AI_EVAL_CASE_CATEGORIES)[number];
export type ReaderAIEvalSpoilerMode = 'read_so_far' | 'whole_book' | 'selected_text';
export type ReaderAIEvalBenchmarkMode = 'readio' | 'notebooklm_manual' | 'human_manual';

export type ReaderAIEvalCase = {
  id: string;
  category: ReaderAIEvalCaseCategory;
  language: string;
  question: string;
  expectedBehavior: string;
  spoilerMode: ReaderAIEvalSpoilerMode;
  tags?: string[];
  benchmarkMode?: ReaderAIEvalBenchmarkMode;
  notes?: string[];
};

export type ReaderAIManualBenchmark = {
  source: 'notebooklm' | 'human';
  mode: 'whole_book' | 'read_so_far';
  observations: string[];
};

export type ReaderAIEvalResult = {
  caseId: string;
  runId: string;
  classificationIntent: string;
  sourceCount: number;
  citationValid: boolean;
  insufficientAnswer: boolean;
  firstOutputMs: number;
  passed: boolean;
  reasons: string[];
  provider?: string;
  model?: string;
  spoilerMode?: ReaderAIEvalSpoilerMode;
  overBudgetStage?: ReaderAIOverBudgetStage | 'none';
  manualBenchmark?: ReaderAIManualBenchmark;
};

export type ReaderAIEvalValidationResult = {
  valid: boolean;
  issues: string[];
};

const caseCategories = new Set<string>(READER_AI_EVAL_CASE_CATEGORIES);
const spoilerModes = new Set<string>(['read_so_far', 'whole_book', 'selected_text']);
const benchmarkModes = new Set<string>(['readio', 'notebooklm_manual', 'human_manual']);
const manualBenchmarkSources = new Set<string>(['notebooklm', 'human']);
const manualBenchmarkModes = new Set<string>(['whole_book', 'read_so_far']);
const overBudgetStages = new Set<string>([
  'retrieval',
  'provider_first_token',
  'generation',
  'citation_validation',
  'citation_repair',
  'indexing',
  'cancelled',
  'timeout',
  'unknown',
  'none',
]);
const unsafeFieldNames = new Set([
  'answer',
  'answerText',
  'sourceText',
  'rawBookText',
  'snippet',
  'quote',
  'previewText',
  'chunkText',
  'prompt',
  'rawPrompt',
  'messages',
  'rawMessages',
  'bookTitle',
  'authorName',
  'bookHash',
  'localPath',
  'url',
  'apiKey',
  'token',
  'authorization',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const collectUnsafeFieldIssues = (value: unknown, path: string[] = []): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeFieldIssues(item, [...path, String(index)]));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nestedPath = [...path, key];
    const issue = unsafeFieldNames.has(key)
      ? [`${nestedPath.join('.')} is not allowed in Reader AI eval metadata`]
      : [];
    return [...issue, ...collectUnsafeFieldIssues(nestedValue, nestedPath)];
  });
};

export function validateReaderAIEvalCase(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['case must be an object'] };

  issues.push(...collectUnsafeFieldIssues(value));

  for (const field of ['id', 'language', 'question', 'expectedBehavior']) {
    if (!hasString(value, field)) issues.push(`${field} is required`);
  }

  const category = value['category'];
  if (typeof category !== 'string' || !caseCategories.has(category)) {
    issues.push('category must be an ordinary-reader QA category');
  }
  const spoilerMode = value['spoilerMode'];
  if (typeof spoilerMode !== 'string' || !spoilerModes.has(spoilerMode)) {
    issues.push('spoilerMode is required');
  }
  if ('tags' in value && !isStringArray(value['tags'])) {
    issues.push('tags must be a string array');
  }
  const benchmarkMode = value['benchmarkMode'];
  if (
    benchmarkMode !== undefined &&
    (typeof benchmarkMode !== 'string' || !benchmarkModes.has(benchmarkMode))
  ) {
    issues.push('benchmarkMode must be readio, notebooklm_manual, or human_manual');
  }
  if ('notes' in value && !isStringArray(value['notes'])) {
    issues.push('notes must be a string array');
  }

  return { valid: issues.length === 0, issues };
}

export function validateReaderAIEvalResult(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['result must be an object'] };

  issues.push(...collectUnsafeFieldIssues(value));

  for (const field of ['caseId', 'runId', 'classificationIntent']) {
    if (!hasString(value, field)) issues.push(`${field} is required`);
  }
  for (const field of ['sourceCount', 'firstOutputMs']) {
    if (typeof value[field] !== 'number' || value[field] < 0) {
      issues.push(`${field} must be non-negative`);
    }
  }
  for (const field of ['citationValid', 'insufficientAnswer', 'passed']) {
    if (typeof value[field] !== 'boolean') issues.push(`${field} is required`);
  }
  const reasons = value['reasons'];
  if (!isStringArray(reasons)) {
    issues.push('reasons must be a string array');
  }
  for (const field of ['provider', 'model']) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== 'string') {
      issues.push(`${field} must be a string`);
    }
  }
  const spoilerMode = value['spoilerMode'];
  if (
    spoilerMode !== undefined &&
    (typeof spoilerMode !== 'string' || !spoilerModes.has(spoilerMode))
  ) {
    issues.push('spoilerMode must be read_so_far, whole_book, or selected_text');
  }
  const overBudgetStage = value['overBudgetStage'];
  if (
    overBudgetStage !== undefined &&
    (typeof overBudgetStage !== 'string' || !overBudgetStages.has(overBudgetStage))
  ) {
    issues.push('overBudgetStage is invalid');
  }
  const manualBenchmark = value['manualBenchmark'];
  if (manualBenchmark !== undefined) {
    if (!isRecord(manualBenchmark)) {
      issues.push('manualBenchmark must be an object');
    } else {
      const source = manualBenchmark['source'];
      if (typeof source !== 'string' || !manualBenchmarkSources.has(source)) {
        issues.push('manualBenchmark.source must be notebooklm or human');
      }
      const mode = manualBenchmark['mode'];
      if (typeof mode !== 'string' || !manualBenchmarkModes.has(mode)) {
        issues.push('manualBenchmark.mode must be whole_book or read_so_far');
      }
      if (!isStringArray(manualBenchmark['observations'])) {
        issues.push('manualBenchmark.observations must be a string array');
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export type ReaderAITraceLike = {
  runId?: unknown;
  stage?: unknown;
  action?: unknown;
  status?: unknown;
  durationMs?: unknown;
  candidateCount?: unknown;
  selectedCount?: unknown;
  sourceCount?: unknown;
  issueCount?: unknown;
  issueTypeCounts?: unknown;
  firstOutputMs?: unknown;
  overBudgetStage?: unknown;
  recoveryHint?: unknown;
} & Record<string, unknown>;

export type ReaderAITraceRunSummary = {
  runId: string;
  eventCount: number;
  statuses: Record<string, number>;
  stageDurationsMs: Record<string, number>;
  candidateCount: number;
  selectedCount: number;
  sourceCount: number;
  issueCount: number;
  issueTypeCounts: Record<string, number>;
  firstOutputMs: number | null;
  overBudgetStage: ReaderAIOverBudgetStage | 'none';
  recoveryHint: string;
  finalStatus: string;
};

const asNonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const asSafeString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const addCount = (counts: Record<string, number>, key: string, amount = 1): void => {
  counts[key] = (counts[key] ?? 0) + amount;
};

const createEmptyRunSummary = (runId: string): ReaderAITraceRunSummary => ({
  runId,
  eventCount: 0,
  statuses: {},
  stageDurationsMs: {},
  candidateCount: 0,
  selectedCount: 0,
  sourceCount: 0,
  issueCount: 0,
  issueTypeCounts: {},
  firstOutputMs: null,
  overBudgetStage: 'none',
  recoveryHint: 'none',
  finalStatus: 'unknown',
});

export function buildReaderAITraceRunSummaries(
  events: ReaderAITraceLike[],
): ReaderAITraceRunSummary[] {
  const summaries = new Map<string, ReaderAITraceRunSummary>();

  for (const event of events) {
    const runId = asSafeString(event.runId);
    if (runId === null) continue;

    const summary = summaries.get(runId) ?? createEmptyRunSummary(runId);
    summaries.set(runId, summary);
    summary.eventCount += 1;

    const status = asSafeString(event.status);
    if (status !== null) {
      addCount(summary.statuses, status);
      summary.finalStatus = status;
    }

    const stage = asSafeString(event.stage);
    const durationMs = asNonNegativeNumber(event.durationMs);
    if (stage !== null && durationMs !== null) {
      addCount(summary.stageDurationsMs, stage, durationMs);
    }

    summary.candidateCount = Math.max(
      summary.candidateCount,
      asNonNegativeNumber(event.candidateCount) ?? 0,
    );
    summary.selectedCount = Math.max(
      summary.selectedCount,
      asNonNegativeNumber(event.selectedCount) ?? 0,
    );
    summary.sourceCount = Math.max(
      summary.sourceCount,
      asNonNegativeNumber(event.sourceCount) ?? 0,
    );
    summary.issueCount += asNonNegativeNumber(event.issueCount) ?? 0;

    if (isRecord(event.issueTypeCounts)) {
      for (const [issueType, count] of Object.entries(event.issueTypeCounts)) {
        const safeCount = asNonNegativeNumber(count);
        if (safeCount !== null) addCount(summary.issueTypeCounts, issueType, safeCount);
      }
    }

    const firstOutputMs = asNonNegativeNumber(event.firstOutputMs);
    if (firstOutputMs !== null) {
      summary.firstOutputMs =
        summary.firstOutputMs === null
          ? firstOutputMs
          : Math.min(summary.firstOutputMs, firstOutputMs);
    }

    const overBudgetStage = asSafeString(event.overBudgetStage);
    if (overBudgetStage !== null && overBudgetStages.has(overBudgetStage)) {
      summary.overBudgetStage = overBudgetStage as ReaderAITraceRunSummary['overBudgetStage'];
    }

    const recoveryHint = asSafeString(event.recoveryHint);
    if (recoveryHint !== null) {
      summary.recoveryHint = recoveryHint;
    }
  }

  return Array.from(summaries.values());
}

export type ReaderAIEvalCategorySummary = {
  total: number;
  passed: number;
  insufficientAnswers: number;
  citationValid: number;
  firstOutputMs: {
    min: number | null;
    max: number | null;
    average: number | null;
  };
  overBudgetStages: Record<string, number>;
};

export type ReaderAIEvalReport = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<string, ReaderAIEvalCategorySummary>;
  runSummaries: ReaderAITraceRunSummary[];
};

export type BuildReaderAIEvalReportInput = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  runSummaries?: ReaderAITraceRunSummary[];
};

const createEmptyCategorySummary = (): ReaderAIEvalCategorySummary => ({
  total: 0,
  passed: 0,
  insufficientAnswers: 0,
  citationValid: 0,
  firstOutputMs: { min: null, max: null, average: null },
  overBudgetStages: {},
});

export function buildReaderAIEvalReport({
  cases,
  results,
  runSummaries = [],
}: BuildReaderAIEvalReportInput): ReaderAIEvalReport {
  const casesById = new Map(cases.map((evalCase) => [evalCase.id, evalCase]));
  const byCategory: Record<string, ReaderAIEvalCategorySummary> = {};
  const latencyTotals: Record<string, { total: number; count: number }> = {};

  for (const result of results) {
    const evalCase = casesById.get(result.caseId);
    if (evalCase === undefined) continue;

    const category = evalCase.category;
    const summary = byCategory[category] ?? createEmptyCategorySummary();
    const latencyTotal = latencyTotals[category] ?? { total: 0, count: 0 };
    byCategory[category] = summary;
    latencyTotals[category] = latencyTotal;

    summary.total += 1;
    if (result.passed) summary.passed += 1;
    if (result.insufficientAnswer) summary.insufficientAnswers += 1;
    if (result.citationValid) summary.citationValid += 1;

    summary.firstOutputMs.min =
      summary.firstOutputMs.min === null
        ? result.firstOutputMs
        : Math.min(summary.firstOutputMs.min, result.firstOutputMs);
    summary.firstOutputMs.max =
      summary.firstOutputMs.max === null
        ? result.firstOutputMs
        : Math.max(summary.firstOutputMs.max, result.firstOutputMs);
    latencyTotal.total += result.firstOutputMs;
    latencyTotal.count += 1;

    addCount(summary.overBudgetStages, result.overBudgetStage ?? 'none');
  }

  for (const [category, totals] of Object.entries(latencyTotals)) {
    const summary = byCategory[category];
    if (summary !== undefined) {
      summary.firstOutputMs.average = totals.count === 0 ? null : totals.total / totals.count;
    }
  }

  const passed = results.filter((result) => result.passed).length;

  return {
    totalCases: cases.length,
    totalResults: results.length,
    passed,
    failed: results.length - passed,
    byCategory,
    runSummaries,
  };
}
