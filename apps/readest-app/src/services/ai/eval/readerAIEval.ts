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
