import { validateReaderAIEvalCase, type ReaderAIEvalCase } from '@/services/ai/eval/readerAIEval';
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
