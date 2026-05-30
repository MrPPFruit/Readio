import type { ReaderAITraceLike } from '@/services/ai/eval/readerAIEval';
import type { ReaderAIEvalCase, ReaderAIEvalResult } from '@/services/ai/eval/readerAIEval';
import type { ReaderAIOverBudgetStage } from '@/services/diagnostics/readerAITrace';
import type { StreamReaderAIAnswerOptions } from '@/services/ai/readerChatService';
import type { AISettings } from '@/services/ai/types';
import type { ReaderAISource } from '@/types/readerAI';

export type ReaderAIServiceEvalStreamer = (
  options: StreamReaderAIAnswerOptions,
) => AsyncGenerator<string>;

export type ReaderAIServiceEvalContext = {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
  messages: StreamReaderAIAnswerOptions['messages'];
  selectionText?: string;
  signal?: AbortSignal;
  loadSectionText?: StreamReaderAIAnswerOptions['loadSectionText'];
};

export type ReaderAIServiceEvalInput = {
  cases: ReaderAIEvalCase[];
  context: ReaderAIServiceEvalContext;
  runIds?: Record<string, string>;
};

export type ReaderAIServiceEvalEnvelope = {
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces: ReaderAITraceLike[];
};

export type ReaderAIServiceEvalDeps = {
  streamAnswer: ReaderAIServiceEvalStreamer;
  now?: () => number;
  collectTraceEvents?: (input: {
    runId: string;
    evalCase: ReaderAIEvalCase;
  }) => ReaderAITraceLike[];
};

const defaultNow = (): number => Date.now();

const createRunId = (evalCase: ReaderAIEvalCase, index: number): string =>
  `${evalCase.id}-${index + 1}`;

const safeTraceStringValues = {
  stage: new Set(['retrieval', 'generation']),
  action: new Set(['hybrid_search', 'service_eval_stream']),
  status: new Set(['completed', 'failed', 'cancelled']),
  overBudgetStage: new Set(['none', 'unknown', 'cancelled']),
  recoveryHint: new Set(['stream_error', 'aborted']),
} as const;

const traceNumberKeys = [
  'durationMs',
  'candidateCount',
  'selectedCount',
  'sourceCount',
  'issueCount',
  'firstOutputMs',
] as const satisfies readonly (keyof ReaderAITraceLike)[];

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const isSafeTraceNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const sanitizeIssueTypeCounts = (value: unknown): Record<string, number> | undefined => {
  if (!isPlainRecord(value)) return undefined;

  const sanitized: Record<string, number> = {};
  for (const [issueType, count] of Object.entries(value)) {
    if (isSafeTraceNumber(count)) sanitized[issueType] = count;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

const sanitizeTraceEvent = (event: ReaderAITraceLike, expectedRunId: string): ReaderAITraceLike => {
  const sanitized: ReaderAITraceLike = {};

  if (event.runId === expectedRunId) sanitized.runId = event.runId;

  for (const key of traceNumberKeys) {
    const value = event[key];
    if (isSafeTraceNumber(value)) sanitized[key] = value;
  }

  for (const key of Object.keys(safeTraceStringValues) as (keyof typeof safeTraceStringValues)[]) {
    const value = event[key];
    if (typeof value === 'string' && safeTraceStringValues[key].has(value)) sanitized[key] = value;
  }

  const issueTypeCounts = sanitizeIssueTypeCounts(event.issueTypeCounts);
  if (issueTypeCounts) sanitized.issueTypeCounts = issueTypeCounts;

  return sanitized;
};

const getModelLabel = (settings: AISettings): string =>
  settings.providerModels[settings.provider] ?? '';

const insufficientEvidencePatterns = [
  '没有足够证据',
  '没有充分证据',
  '不足以回答',
  '无法回答',
  'insufficient evidence',
  'not enough evidence',
] as const;

const isInsufficientAnswer = (answer: string): boolean => {
  const normalizedAnswer = answer.trim().toLocaleLowerCase();
  return insufficientEvidencePatterns.some((pattern) =>
    normalizedAnswer.includes(pattern.toLocaleLowerCase()),
  );
};

const expectsInsufficientEvidence = (evalCase: ReaderAIEvalCase): boolean =>
  evalCase.tags?.includes('expects_insufficient_evidence') ?? false;

const buildReasons = ({
  outputSeen,
  sourceCount,
  insufficientAnswer,
  expectedInsufficient,
}: {
  outputSeen: boolean;
  sourceCount: number;
  insufficientAnswer: boolean;
  expectedInsufficient: boolean;
}): string[] => {
  if (insufficientAnswer) {
    return expectedInsufficient
      ? ['expected_insufficient_answer']
      : ['unexpected_insufficient_answer', ...(sourceCount === 0 ? ['missing_sources'] : [])];
  }

  const reasons: string[] = [];
  if (!outputSeen) reasons.push('no_output');
  if (sourceCount === 0) reasons.push('missing_sources');
  return reasons.length === 0 ? ['service_eval_passed'] : reasons;
};

const createBaseResult = ({
  evalCase,
  runId,
  sourceCount,
  citationValid,
  insufficientAnswer,
  firstOutputMs,
  passed,
  reasons,
  settings,
  overBudgetStage,
}: {
  evalCase: ReaderAIEvalCase;
  runId: string;
  sourceCount: number;
  citationValid: boolean;
  insufficientAnswer: boolean;
  firstOutputMs: number;
  passed: boolean;
  reasons: string[];
  settings: AISettings;
  overBudgetStage: ReaderAIOverBudgetStage | 'none';
}): ReaderAIEvalResult => ({
  caseId: evalCase.id,
  runId,
  classificationIntent: 'unknown',
  sourceCount,
  citationValid,
  insufficientAnswer,
  firstOutputMs,
  passed,
  reasons,
  provider: settings.provider,
  model: getModelLabel(settings),
  spoilerMode: evalCase.spoilerMode,
  overBudgetStage,
});

export async function runReaderAIServiceEval(
  input: ReaderAIServiceEvalInput,
  deps: ReaderAIServiceEvalDeps,
): Promise<ReaderAIServiceEvalEnvelope> {
  const now = deps.now ?? defaultNow;
  const results: ReaderAIEvalResult[] = [];
  const traces: ReaderAITraceLike[] = [];

  for (const [index, evalCase] of input.cases.entries()) {
    const runId = input.runIds?.[evalCase.id] ?? createRunId(evalCase, index);
    const startedAt = now();
    let firstOutputMs: number | null = null;
    let outputSeen = false;
    let answerBuffer = '';
    let sources: ReaderAISource[] = [];

    try {
      const stream = deps.streamAnswer({
        ...input.context,
        question: evalCase.question,
        runId,
        onSources: (emittedSources) => {
          sources = emittedSources;
        },
      });

      for await (const chunk of stream) {
        if (chunk.length > 0) {
          answerBuffer += chunk;
          if (firstOutputMs === null) {
            firstOutputMs = Math.max(0, now() - startedAt);
          }
          outputSeen = true;
        }
      }
    } catch (_error: unknown) {
      const aborted = input.context.signal?.aborted ?? false;
      const safeFirstOutputMs = firstOutputMs ?? 0;
      const durationMs = Math.max(safeFirstOutputMs, now() - startedAt);
      const sourceCount = sources.length;
      const overBudgetStage: ReaderAIOverBudgetStage = aborted ? 'cancelled' : 'unknown';
      const recoveryHint = aborted ? 'aborted' : 'stream_error';

      results.push(
        createBaseResult({
          evalCase,
          runId,
          sourceCount,
          citationValid: sourceCount > 0,
          insufficientAnswer: false,
          firstOutputMs: safeFirstOutputMs,
          passed: false,
          reasons: [recoveryHint],
          settings: input.context.settings,
          overBudgetStage,
        }),
      );

      traces.push(
        ...(deps
          .collectTraceEvents?.({ runId, evalCase })
          .map((event) => sanitizeTraceEvent(event, runId)) ?? []),
      );
      traces.push({
        runId,
        stage: 'generation',
        action: 'service_eval_stream',
        status: aborted ? 'cancelled' : 'failed',
        durationMs,
        sourceCount,
        firstOutputMs: safeFirstOutputMs,
        overBudgetStage,
        recoveryHint,
      });
      continue;
    }

    const safeFirstOutputMs = firstOutputMs ?? 0;
    const durationMs = Math.max(safeFirstOutputMs, now() - startedAt);
    const sourceCount = sources.length;
    const insufficientAnswer = outputSeen && isInsufficientAnswer(answerBuffer);
    const expectedInsufficient = expectsInsufficientEvidence(evalCase);
    const passed = insufficientAnswer ? expectedInsufficient : outputSeen && sourceCount > 0;
    const reasons = buildReasons({
      outputSeen,
      sourceCount,
      insufficientAnswer,
      expectedInsufficient,
    });

    results.push(
      createBaseResult({
        evalCase,
        runId,
        sourceCount,
        citationValid: sourceCount > 0,
        insufficientAnswer,
        firstOutputMs: safeFirstOutputMs,
        passed,
        reasons,
        settings: input.context.settings,
        overBudgetStage: 'none',
      }),
    );

    traces.push(
      ...(deps
        .collectTraceEvents?.({ runId, evalCase })
        .map((event) => sanitizeTraceEvent(event, runId)) ?? []),
    );
    traces.push({
      runId,
      stage: 'generation',
      action: 'service_eval_stream',
      status: passed ? 'completed' : 'failed',
      durationMs,
      sourceCount,
      firstOutputMs: safeFirstOutputMs,
      overBudgetStage: 'none',
    });
  }

  return { cases: input.cases, results, traces };
}
