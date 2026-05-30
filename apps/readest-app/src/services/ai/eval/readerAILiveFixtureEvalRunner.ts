import { validateReaderAIEvalCase, type ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
import type { AIProviderName } from '@/services/ai/types';

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === 'string' && value[key].trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isRelativeLocalOutputPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.includes('..')) return false;
  return true;
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

const sanitizeReaderAIEvalCase = (value: Record<string, unknown>): ReaderAIEvalCase => {
  const fixtureCase: ReaderAIEvalCase = {
    id: value['id'] as ReaderAIEvalCase['id'],
    category: value['category'] as ReaderAIEvalCase['category'],
    language: value['language'] as ReaderAIEvalCase['language'],
    question: value['question'] as ReaderAIEvalCase['question'],
    expectedBehavior: value['expectedBehavior'] as ReaderAIEvalCase['expectedBehavior'],
    spoilerMode: value['spoilerMode'] as ReaderAIEvalCase['spoilerMode'],
  };

  if (value['tags'] !== undefined) fixtureCase.tags = value['tags'] as ReaderAIEvalCase['tags'];
  if (value['benchmarkMode'] !== undefined) {
    fixtureCase.benchmarkMode = value['benchmarkMode'] as ReaderAIEvalCase['benchmarkMode'];
  }
  if (value['notes'] !== undefined) fixtureCase.notes = value['notes'] as ReaderAIEvalCase['notes'];

  return fixtureCase;
};

const sanitizeReaderAILiveFixture = (value: Record<string, unknown>): ReaderAILiveFixture => {
  const settings = value['settings'] as Record<string, unknown>;
  const runtimeBook = value['runtimeBook'] as Record<string, unknown>;
  const outputs = value['outputs'] as Record<string, unknown>;
  const cases = value['cases'] as Record<string, unknown>[];

  const fixture: ReaderAILiveFixture = {
    fixtureId: value['fixtureId'] as ReaderAILiveFixture['fixtureId'],
    live: value['live'] as ReaderAILiveFixture['live'],
    settings: {
      provider: settings['provider'] as ReaderAILiveFixtureSettings['provider'],
      model: settings['model'] as ReaderAILiveFixtureSettings['model'],
    },
    runtimeBook: {
      label: runtimeBook['label'] as ReaderAILiveFixtureRuntimeBook['label'],
      bookHash: runtimeBook['bookHash'] as ReaderAILiveFixtureRuntimeBook['bookHash'],
      bookTitle: runtimeBook['bookTitle'] as ReaderAILiveFixtureRuntimeBook['bookTitle'],
      currentPage: runtimeBook['currentPage'] as ReaderAILiveFixtureRuntimeBook['currentPage'],
    },
    outputs: {
      envelope: outputs['envelope'] as ReaderAILiveFixtureOutputs['envelope'],
    },
    cases: cases.map(sanitizeReaderAIEvalCase),
  };

  if (value['caseLimit'] !== undefined)
    fixture.caseLimit = value['caseLimit'] as ReaderAILiveFixture['caseLimit'];
  if (value['timeoutMs'] !== undefined)
    fixture.timeoutMs = value['timeoutMs'] as ReaderAILiveFixture['timeoutMs'];
  if (settings['maxContextChunks'] !== undefined) {
    fixture.settings.maxContextChunks = settings[
      'maxContextChunks'
    ] as ReaderAILiveFixtureSettings['maxContextChunks'];
  }
  if (settings['spoilerProtection'] !== undefined) {
    fixture.settings.spoilerProtection = settings[
      'spoilerProtection'
    ] as ReaderAILiveFixtureSettings['spoilerProtection'];
  }
  if (runtimeBook['authorName'] !== undefined) {
    fixture.runtimeBook.authorName = runtimeBook[
      'authorName'
    ] as ReaderAILiveFixtureRuntimeBook['authorName'];
  }
  if (runtimeBook['currentAIPage'] !== undefined) {
    fixture.runtimeBook.currentAIPage = runtimeBook[
      'currentAIPage'
    ] as ReaderAILiveFixtureRuntimeBook['currentAIPage'];
  }
  if (outputs['reportJson'] !== undefined) {
    fixture.outputs.reportJson = outputs['reportJson'] as ReaderAILiveFixtureOutputs['reportJson'];
  }
  if (outputs['reportMarkdown'] !== undefined) {
    fixture.outputs.reportMarkdown = outputs[
      'reportMarkdown'
    ] as ReaderAILiveFixtureOutputs['reportMarkdown'];
  }

  return fixture;
};

export function validateReaderAILiveFixture(value: unknown): ReaderAILiveFixtureValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ['fixture must be an object'] };

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
    if (typeof provider !== 'string' || !providerNames.has(provider as AIProviderName)) {
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
