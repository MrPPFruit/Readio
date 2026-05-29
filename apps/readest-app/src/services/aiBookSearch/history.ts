import { aiStore } from '@/services/ai/storage/aiStore';
import type {
  AIBookSearchHistoryRecord,
  AIBookSearchIntent,
  AIBookSearchProgressEvent,
  AIBookSearchResult,
  AIBookSearchSource,
} from './types';

export type { AIBookSearchHistoryRecord } from './types';

const MAX_HISTORY_RECORDS = 30;
const MAX_HISTORY_RESULTS = 30;
const MAX_HISTORY_PROGRESS_EVENTS = 3;

interface SaveAIBookSearchHistorySnapshotInput {
  query: string;
  results: AIBookSearchResult[];
  intent: AIBookSearchIntent | null;
  selectedSource: AIBookSearchSource | 'all';
  deepSearchStatus: 'idle' | 'done';
  progressEvents: AIBookSearchProgressEvent[];
  importStatuses?: Record<string, unknown>;
  rawResponse?: unknown;
  prompt?: string;
}

export const normalizeAIBookSearchHistoryQuery = (query: string) =>
  query.trim().replace(/\s+/g, ' ').toLowerCase();

const displayQuery = (query: string) => query.trim().replace(/\s+/g, ' ');

export const listAIBookSearchHistory = () => aiStore.getBookSearchHistoryRecords();

export const deleteAIBookSearchHistoryRecord = (id: string) =>
  aiStore.deleteBookSearchHistoryRecord(id);

export const deleteAIBookSearchHistoryRecords = (ids: string[]) =>
  aiStore.deleteBookSearchHistoryRecords(ids);

export async function saveAIBookSearchHistorySnapshot(
  input: SaveAIBookSearchHistorySnapshotInput,
): Promise<void> {
  const normalizedQuery = normalizeAIBookSearchHistoryQuery(input.query);
  if (!normalizedQuery) return;

  const existingRecords = await aiStore.getBookSearchHistoryRecords();
  const existingRecord = existingRecords.find(
    (record) => record.normalizedQuery === normalizedQuery,
  );
  const now = Date.now();
  const results = input.results.slice(0, MAX_HISTORY_RESULTS);
  const record: AIBookSearchHistoryRecord = {
    id: existingRecord?.id ?? normalizedQuery,
    query: displayQuery(input.query),
    normalizedQuery,
    createdAt: existingRecord?.createdAt ?? now,
    updatedAt: now,
    resultCount: results.length,
    results,
    intent: input.intent,
    selectedSource: input.selectedSource,
    deepSearchStatus: input.deepSearchStatus,
    progressSummary: input.progressEvents.slice(-MAX_HISTORY_PROGRESS_EVENTS),
    schemaVersion: 1,
  };

  await aiStore.saveBookSearchHistoryRecord(record);

  const retainedRecords = [
    record,
    ...existingRecords.filter((existing) => existing.id !== record.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
  const overflowRecordIds = retainedRecords
    .slice(MAX_HISTORY_RECORDS)
    .map((overflowRecord) => overflowRecord.id);
  if (overflowRecordIds.length > 0) await aiStore.deleteBookSearchHistoryRecords(overflowRecordIds);
}
