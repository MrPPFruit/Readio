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

export type ReaderAIEvalCase = {
  id: string;
  category: ReaderAIEvalCaseCategory;
  language: string;
  question: string;
  expectedBehavior: string;
  spoilerMode: ReaderAIEvalSpoilerMode;
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
};

export type ReaderAIEvalValidationResult = {
  valid: boolean;
  issues: string[];
};

const caseCategories = new Set<string>(READER_AI_EVAL_CASE_CATEGORIES);
const spoilerModes = new Set<string>(['read_so_far', 'whole_book', 'selected_text']);
const disallowedCaseFields = new Set(['sourceText', 'answerText', 'rawBookText', 'rawPrompt']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

export function validateReaderAIEvalCase(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['case must be an object'] };

  for (const field of disallowedCaseFields) {
    if (field in value) issues.push(`${field} is not allowed in committed eval cases`);
  }

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

  return { valid: issues.length === 0, issues };
}

export function validateReaderAIEvalResult(value: unknown): ReaderAIEvalValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['result must be an object'] };

  for (const field of ['caseId', 'runId', 'classificationIntent']) {
    if (!hasString(value, field)) issues.push(`${field} is required`);
  }
  for (const field of ['sourceCount', 'firstOutputMs']) {
    if (typeof value[field] !== 'number' || value[field] < 0)
      issues.push(`${field} must be non-negative`);
  }
  for (const field of ['citationValid', 'insufficientAnswer', 'passed']) {
    if (typeof value[field] !== 'boolean') issues.push(`${field} is required`);
  }
  const reasons = value['reasons'];
  if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === 'string')) {
    issues.push('reasons must be a string array');
  }

  return { valid: issues.length === 0, issues };
}
