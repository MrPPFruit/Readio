import { logDiagnosticEvent } from '@/services/diagnostics/logger';
import type { DiagnosticMetadataValue } from '@/services/diagnostics/types';

export type ReaderAITraceStage =
  | 'run'
  | 'retrieval'
  | 'context'
  | 'generation'
  | 'citation_validation'
  | 'citation_repair'
  | 'persistence'
  | 'suggestions';

export type ReaderAITraceAction =
  | 'start_run'
  | 'complete_run'
  | 'classify_question'
  | 'check_index'
  | 'hybrid_search'
  | 'entity_sidecar_lookup'
  | 'source_language_rewrite'
  | 'current_context_injection'
  | 'context_pack'
  | 'generate_answer'
  | 'insufficient_answer_fallback'
  | 'validate_citations'
  | 'repair_citations'
  | 'persist_turn'
  | 'refresh_suggestions';

export type ReaderAITraceStatus =
  | 'started'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export type ReaderAIOverBudgetStage =
  | 'retrieval'
  | 'provider_first_token'
  | 'generation'
  | 'citation_validation'
  | 'citation_repair'
  | 'indexing'
  | 'cancelled'
  | 'timeout'
  | 'unknown';

export type ReaderAIRecoveryHint =
  | 'retry_same_turn'
  | 'retry_after_indexing'
  | 'ask_user_to_retry'
  | 'fallback_answer_shown'
  | 'none';

export type ReaderAITraceMetadata = {
  runId: string;
  stage: ReaderAITraceStage;
  action: ReaderAITraceAction;
  status: ReaderAITraceStatus;
  durationMs?: number;
  candidateCount?: number;
  selectedCount?: number;
  sourceCount?: number;
  issueCount?: number;
  issueTypeCounts?: Record<string, number>;
  repairedCount?: number;
  classificationIntent?: string;
  classificationScope?: string;
  enabledActions?: string[];
  maxContextChunks?: number;
  retrievalK?: number;
  latencyBudgetMs?: number;
  firstOutputBudgetMs?: number;
  firstOutputMs?: number;
  overBudgetStage?: ReaderAIOverBudgetStage;
  recoveryHint?: ReaderAIRecoveryHint;
} & Record<string, unknown>;

const TRACE_SCHEMA_VERSION = 1;
const TRACE_EVENT = 'reader_ai.trace';

const ALLOWED_TRACE_KEYS = new Set<keyof ReaderAITraceMetadata>([
  'runId',
  'stage',
  'action',
  'status',
  'durationMs',
  'candidateCount',
  'selectedCount',
  'sourceCount',
  'issueCount',
  'issueTypeCounts',
  'repairedCount',
  'classificationIntent',
  'classificationScope',
  'enabledActions',
  'maxContextChunks',
  'retrievalK',
  'latencyBudgetMs',
  'firstOutputBudgetMs',
  'firstOutputMs',
  'overBudgetStage',
  'recoveryHint',
]);

const toDiagnosticValue = (value: unknown): DiagnosticMetadataValue | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const values = value
      .map(toDiagnosticValue)
      .filter((item): item is DiagnosticMetadataValue => item !== undefined);
    return values;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(
      (entry): entry is [string, DiagnosticMetadataValue] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean' ||
        entry[1] === null,
    );
    return Object.fromEntries(entries);
  }

  return undefined;
};

export const logReaderAITraceEvent = async (event: ReaderAITraceMetadata): Promise<void> => {
  const metadata: Record<string, DiagnosticMetadataValue> = {
    schemaVersion: TRACE_SCHEMA_VERSION,
    component: 'reader_ai_harness',
    privacyTier: 'metadata_only',
  };

  for (const key of ALLOWED_TRACE_KEYS) {
    const value = toDiagnosticValue(event[key]);
    if (value !== undefined) {
      metadata[key] = value;
    }
  }

  await logDiagnosticEvent(TRACE_EVENT, 'debug', metadata);
};
