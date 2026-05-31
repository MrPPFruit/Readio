import {
  validateReaderAIEvalCase,
  type ReaderAIEvalBenchmarkMode,
  type ReaderAIEvalCase,
  type ReaderAIEvalCaseCategory,
  type ReaderAIEvalSpoilerMode,
} from '@/services/ai/eval/readerAIEval';
import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';
import {
  runReaderAIServiceEval,
  type ReaderAIServiceEvalEnvelope,
  type ReaderAIServiceEvalStreamer,
} from '@/services/ai/eval/readerAIServiceEvalRunner';
import type { AIProviderName, AISettings } from '@/services/ai/types';

export type ReaderAILiveFixtureRuntimeBook = {
  label: string;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
};

export type ReaderAILiveFixtureSettings = {
  provider: AIProviderName;
  model: string;
  maxContextChunks?: number;
  spoilerProtection?: boolean;
};

export type ReaderAILiveFixtureOutputs = {
  envelope: string;
  reportJson?: string;
  reportMarkdown?: string;
};

export type ReaderAILiveFixture = {
  fixtureId: string;
  live: boolean;
  caseLimit?: number;
  timeoutMs?: number;
  settings: ReaderAILiveFixtureSettings;
  runtimeBook: ReaderAILiveFixtureRuntimeBook;
  outputs: ReaderAILiveFixtureOutputs;
  cases: ReaderAIEvalCase[];
};

export type ReaderAILiveFixtureValidationResult =
  | { ok: true; fixture: ReaderAILiveFixture }
  | { ok: false; issues: string[] };

const providerNames = new Set<AIProviderName>([
  'openrouter',
  'openai',
  'gemini',
  'deepseek',
  'dashscope',
  'kimi',
  'mimo',
  'custom-openai-compatible',
]);

const caseCategories = new Set<ReaderAIEvalCaseCategory>([
  'person_recall',
  'object_recall',
  'event_recap',
  'relationship_recall',
  'current_recap',
  'citation_grounding',
  'spoiler_safety',
]);
const spoilerModes = new Set<ReaderAIEvalSpoilerMode>([
  'read_so_far',
  'whole_book',
  'selected_text',
]);
const benchmarkModes = new Set<ReaderAIEvalBenchmarkMode>([
  'readio',
  'notebooklm_manual',
  'human_manual',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

const getRequiredString = (value: Record<string, unknown>, key: string): string => {
  const field = value[key];
  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new Error(`Expected validated string field: ${key}`);
  }
  return field;
};

const getOptionalString = (value: Record<string, unknown>, key: string): string | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== 'string') throw new Error(`Expected validated string field: ${key}`);
  return field;
};

const getRequiredBoolean = (value: Record<string, unknown>, key: string): boolean => {
  const field = value[key];
  if (typeof field !== 'boolean') throw new Error(`Expected validated boolean field: ${key}`);
  return field;
};

const getOptionalBoolean = (value: Record<string, unknown>, key: string): boolean | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== 'boolean') throw new Error(`Expected validated boolean field: ${key}`);
  return field;
};

const getRequiredNumber = (value: Record<string, unknown>, key: string): number => {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isFinite(field)) {
    throw new Error(`Expected validated number field: ${key}`);
  }
  return field;
};

const getOptionalNumber = (value: Record<string, unknown>, key: string): number | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== 'number' || !Number.isFinite(field)) {
    throw new Error(`Expected validated number field: ${key}`);
  }
  return field;
};

const getOptionalPositiveInteger = (
  value: Record<string, unknown>,
  key: string,
): number | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (!isPositiveInteger(field))
    throw new Error(`Expected validated positive integer field: ${key}`);
  return field;
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isProviderName = (value: unknown): value is AIProviderName =>
  typeof value === 'string' && providerNames.has(value as AIProviderName);

const isCaseCategory = (value: unknown): value is ReaderAIEvalCaseCategory =>
  typeof value === 'string' && caseCategories.has(value as ReaderAIEvalCaseCategory);

const isSpoilerMode = (value: unknown): value is ReaderAIEvalSpoilerMode =>
  typeof value === 'string' && spoilerModes.has(value as ReaderAIEvalSpoilerMode);

const isBenchmarkMode = (value: unknown): value is ReaderAIEvalBenchmarkMode =>
  typeof value === 'string' && benchmarkModes.has(value as ReaderAIEvalBenchmarkMode);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isRelativeLocalOutputPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.includes('..')) return false;
  return true;
};

const liveFixtureUnsafeFieldNames = new Set([
  'apiKey',
  'customProviderBaseUrl',
  'baseUrl',
  'token',
  'authorization',
]);

const collectUnsafeLiveFixtureFields = (value: unknown, path: string, issues: string[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnsafeLiveFixtureFields(item, `${path}[${index}]`, issues),
    );
    return;
  }
  if (!isRecord(value)) return;

  Object.entries(value).forEach(([key, field]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    if (liveFixtureUnsafeFieldNames.has(key)) {
      issues.push(`${fieldPath} is not allowed in Reader AI eval metadata`);
    }
    collectUnsafeLiveFixtureFields(field, fieldPath, issues);
  });
};

const validateOutputPath = (
  value: Record<string, unknown>,
  key: keyof ReaderAILiveFixtureOutputs,
  issues: string[],
): void => {
  if (value[key] === undefined) return;
  if (!isRelativeLocalOutputPath(value[key])) {
    issues.push(`outputs.${key} must be a relative local output path`);
  }
};

const getRequiredRecord = (
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> => {
  const field = value[key];
  if (!isRecord(field)) throw new Error(`Expected validated object field: ${key}`);
  return field;
};

const getRequiredRecordArray = (
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] => {
  const field = value[key];
  if (!Array.isArray(field) || !field.every(isRecord)) {
    throw new Error(`Expected validated object array field: ${key}`);
  }
  return field;
};

const getRequiredProvider = (value: Record<string, unknown>, key: string): AIProviderName => {
  const field = value[key];
  if (!isProviderName(field)) throw new Error(`Expected validated provider field: ${key}`);
  return field;
};

const getRequiredCaseCategory = (
  value: Record<string, unknown>,
  key: string,
): ReaderAIEvalCaseCategory => {
  const field = value[key];
  if (!isCaseCategory(field)) throw new Error(`Expected validated category field: ${key}`);
  return field;
};

const getRequiredSpoilerMode = (
  value: Record<string, unknown>,
  key: string,
): ReaderAIEvalSpoilerMode => {
  const field = value[key];
  if (!isSpoilerMode(field)) throw new Error(`Expected validated spoiler mode field: ${key}`);
  return field;
};

const getOptionalStringArray = (
  value: Record<string, unknown>,
  key: string,
): string[] | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (!isStringArray(field)) throw new Error(`Expected validated string array field: ${key}`);
  return field;
};

const getOptionalBenchmarkMode = (
  value: Record<string, unknown>,
  key: string,
): ReaderAIEvalBenchmarkMode | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (!isBenchmarkMode(field)) throw new Error(`Expected validated benchmark mode field: ${key}`);
  return field;
};

const getRequiredOutputPath = (value: Record<string, unknown>, key: string): string => {
  const field = value[key];
  if (!isRelativeLocalOutputPath(field))
    throw new Error(`Expected validated output path field: ${key}`);
  return field;
};

const getOptionalOutputPath = (value: Record<string, unknown>, key: string): string | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  if (!isRelativeLocalOutputPath(field))
    throw new Error(`Expected validated output path field: ${key}`);
  return field;
};

const sanitizeReaderAIEvalCase = (value: Record<string, unknown>): ReaderAIEvalCase => {
  const fixtureCase: ReaderAIEvalCase = {
    id: getRequiredString(value, 'id'),
    category: getRequiredCaseCategory(value, 'category'),
    language: getRequiredString(value, 'language'),
    question: getRequiredString(value, 'question'),
    expectedBehavior: getRequiredString(value, 'expectedBehavior'),
    spoilerMode: getRequiredSpoilerMode(value, 'spoilerMode'),
  };

  const tags = getOptionalStringArray(value, 'tags');
  if (tags !== undefined) fixtureCase.tags = tags;
  const benchmarkMode = getOptionalBenchmarkMode(value, 'benchmarkMode');
  if (benchmarkMode !== undefined) fixtureCase.benchmarkMode = benchmarkMode;
  const notes = getOptionalStringArray(value, 'notes');
  if (notes !== undefined) fixtureCase.notes = notes;

  return fixtureCase;
};

const sanitizeReaderAILiveFixture = (value: Record<string, unknown>): ReaderAILiveFixture => {
  const settings = getRequiredRecord(value, 'settings');
  const runtimeBook = getRequiredRecord(value, 'runtimeBook');
  const outputs = getRequiredRecord(value, 'outputs');
  const cases = getRequiredRecordArray(value, 'cases');

  const fixture: ReaderAILiveFixture = {
    fixtureId: getRequiredString(value, 'fixtureId'),
    live: getRequiredBoolean(value, 'live'),
    settings: {
      provider: getRequiredProvider(settings, 'provider'),
      model: getRequiredString(settings, 'model'),
    },
    runtimeBook: {
      label: getRequiredString(runtimeBook, 'label'),
      bookHash: getRequiredString(runtimeBook, 'bookHash'),
      bookTitle: getRequiredString(runtimeBook, 'bookTitle'),
      currentPage: getRequiredNumber(runtimeBook, 'currentPage'),
    },
    outputs: {
      envelope: getRequiredOutputPath(outputs, 'envelope'),
    },
    cases: cases.map(sanitizeReaderAIEvalCase),
  };

  const caseLimit = getOptionalPositiveInteger(value, 'caseLimit');
  if (caseLimit !== undefined) fixture.caseLimit = caseLimit;
  const timeoutMs = getOptionalPositiveInteger(value, 'timeoutMs');
  if (timeoutMs !== undefined) fixture.timeoutMs = timeoutMs;
  const maxContextChunks = getOptionalPositiveInteger(settings, 'maxContextChunks');
  if (maxContextChunks !== undefined) fixture.settings.maxContextChunks = maxContextChunks;
  const spoilerProtection = getOptionalBoolean(settings, 'spoilerProtection');
  if (spoilerProtection !== undefined) fixture.settings.spoilerProtection = spoilerProtection;
  const authorName = getOptionalString(runtimeBook, 'authorName');
  if (authorName !== undefined) fixture.runtimeBook.authorName = authorName;
  const currentAIPage = getOptionalNumber(runtimeBook, 'currentAIPage');
  if (currentAIPage !== undefined) fixture.runtimeBook.currentAIPage = currentAIPage;
  const reportJson = getOptionalOutputPath(outputs, 'reportJson');
  if (reportJson !== undefined) fixture.outputs.reportJson = reportJson;
  const reportMarkdown = getOptionalOutputPath(outputs, 'reportMarkdown');
  if (reportMarkdown !== undefined) fixture.outputs.reportMarkdown = reportMarkdown;

  return fixture;
};

export function validateReaderAILiveFixture(value: unknown): ReaderAILiveFixtureValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ['fixture must be an object'] };

  collectUnsafeLiveFixtureFields(value, '', issues);

  if (!hasString(value, 'fixtureId')) issues.push('fixtureId is required');
  if (typeof value['live'] !== 'boolean') issues.push('live is required');

  const caseLimit = value['caseLimit'];
  if (caseLimit !== undefined && !isPositiveInteger(caseLimit)) {
    issues.push('caseLimit must be a positive integer');
  }
  const timeoutMs = value['timeoutMs'];
  if (timeoutMs !== undefined && !isPositiveInteger(timeoutMs)) {
    issues.push('timeoutMs must be a positive integer');
  }

  const settings = value['settings'];
  if (!isRecord(settings)) {
    issues.push('settings must be an object');
  } else {
    const provider = settings['provider'];
    if (!isProviderName(provider)) {
      issues.push('settings.provider is required');
    }
    if (!hasString(settings, 'model')) issues.push('settings.model is required');
    const maxContextChunks = settings['maxContextChunks'];
    if (maxContextChunks !== undefined && !isPositiveInteger(maxContextChunks)) {
      issues.push('settings.maxContextChunks must be a positive integer');
    }
    const spoilerProtection = settings['spoilerProtection'];
    if (spoilerProtection !== undefined && typeof spoilerProtection !== 'boolean') {
      issues.push('settings.spoilerProtection must be a boolean');
    }
  }

  const runtimeBook = value['runtimeBook'];
  if (!isRecord(runtimeBook)) {
    issues.push('runtimeBook must be an object');
  } else {
    for (const field of ['label', 'bookHash', 'bookTitle']) {
      if (!hasString(runtimeBook, field)) issues.push(`runtimeBook.${field} is required`);
    }
    if (runtimeBook['authorName'] !== undefined && typeof runtimeBook['authorName'] !== 'string') {
      issues.push('runtimeBook.authorName must be a string');
    }
    if (
      typeof runtimeBook['currentPage'] !== 'number' ||
      !Number.isFinite(runtimeBook['currentPage'])
    ) {
      issues.push('runtimeBook.currentPage must be a number');
    }
    if (
      runtimeBook['currentAIPage'] !== undefined &&
      (typeof runtimeBook['currentAIPage'] !== 'number' ||
        !Number.isFinite(runtimeBook['currentAIPage']))
    ) {
      issues.push('runtimeBook.currentAIPage must be a number');
    }
  }

  const cases = value['cases'];
  if (!Array.isArray(cases)) {
    issues.push('cases must be an array');
  } else {
    cases.forEach((fixtureCase, index) => {
      const validation = validateReaderAIEvalCase(fixtureCase);
      issues.push(...validation.issues.map((issue) => `cases[${index}].${issue}`));
    });
  }

  const outputs = value['outputs'];
  if (!isRecord(outputs)) {
    issues.push('outputs must be an object');
  } else {
    if (!isRelativeLocalOutputPath(outputs['envelope'])) {
      issues.push('outputs.envelope must be a relative local output path');
    }
    validateOutputPath(outputs, 'reportJson', issues);
    validateOutputPath(outputs, 'reportMarkdown', issues);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, fixture: sanitizeReaderAILiveFixture(value) };
}

export function parseReaderAILiveFixture(source: string): ReaderAILiveFixtureValidationResult {
  try {
    return validateReaderAILiveFixture(JSON.parse(source) as unknown);
  } catch (_error: unknown) {
    return { ok: false, issues: ['fixture must be valid JSON'] };
  }
}

export type ReaderAILiveFixtureEvalDeps = {
  live: boolean;
  streamAnswer: ReaderAIServiceEvalStreamer;
  writeFile: (path: string, content: string) => Promise<void>;
  now?: () => number;
};

export type ReaderAILiveFixtureEvalOutput =
  | {
      ok: true;
      envelope: ReaderAIServiceEvalEnvelope;
      writtenPaths: string[];
      issues: [];
    }
  | {
      ok: false;
      envelope: null;
      writtenPaths: [];
      issues: string[];
    };

const toAISettings = (fixture: ReaderAILiveFixture): AISettings => ({
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: fixture.settings.provider,
  providerApiKeys: {},
  providerModels: { [fixture.settings.provider]: fixture.settings.model },
  customProviderBaseUrl: '',
  spoilerProtection: fixture.settings.spoilerProtection ?? true,
  maxContextChunks: fixture.settings.maxContextChunks ?? 6,
  indexingMode: 'on-demand',
});

const limitCases = (fixture: ReaderAILiveFixture): ReaderAIEvalCase[] =>
  fixture.cases.slice(0, fixture.caseLimit ?? fixture.cases.length);

export async function runReaderAILiveFixtureEval(
  fixtureInput: unknown,
  deps: ReaderAILiveFixtureEvalDeps,
): Promise<ReaderAILiveFixtureEvalOutput> {
  const validation = validateReaderAILiveFixture(fixtureInput);
  if (!validation.ok) {
    return { ok: false, envelope: null, writtenPaths: [], issues: validation.issues };
  }

  const fixture = validation.fixture;
  if (!deps.live || !fixture.live) {
    return {
      ok: false,
      envelope: null,
      writtenPaths: [],
      issues: ['Live fixture execution requires --live'],
    };
  }

  const controller = new AbortController();
  const timeout = fixture.timeoutMs
    ? globalThis.setTimeout(() => controller.abort(), fixture.timeoutMs)
    : undefined;

  try {
    const envelope = await runReaderAIServiceEval(
      {
        cases: limitCases(fixture),
        context: {
          settings: toAISettings(fixture),
          bookHash: fixture.runtimeBook.bookHash,
          bookTitle: fixture.runtimeBook.bookTitle,
          authorName: fixture.runtimeBook.authorName,
          currentPage: fixture.runtimeBook.currentPage,
          currentAIPage: fixture.runtimeBook.currentAIPage,
          messages: [],
          signal: controller.signal,
        },
      },
      {
        streamAnswer: deps.streamAnswer,
        now: deps.now,
      },
    );

    const reportOutput = buildReaderAIEvalReportRun(envelope);
    if (!reportOutput.ok) {
      return { ok: false, envelope: null, writtenPaths: [], issues: reportOutput.issues };
    }

    const writtenPaths: string[] = [];
    await deps.writeFile(fixture.outputs.envelope, `${JSON.stringify(envelope, null, 2)}\n`);
    writtenPaths.push(fixture.outputs.envelope);

    if (fixture.outputs.reportJson !== undefined) {
      await deps.writeFile(
        fixture.outputs.reportJson,
        `${JSON.stringify(reportOutput.report, null, 2)}\n`,
      );
      writtenPaths.push(fixture.outputs.reportJson);
    }

    if (fixture.outputs.reportMarkdown !== undefined) {
      await deps.writeFile(fixture.outputs.reportMarkdown, reportOutput.markdown);
      writtenPaths.push(fixture.outputs.reportMarkdown);
    }

    return { ok: true, envelope, writtenPaths, issues: [] };
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}
