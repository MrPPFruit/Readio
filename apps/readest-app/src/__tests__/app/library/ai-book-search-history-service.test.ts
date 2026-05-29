import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIBookSearchProgressEvent, AIBookSearchResult } from '@/services/aiBookSearch/types';

const aiStoreMock = vi.hoisted(() => ({
  getBookSearchHistoryRecords: vi.fn(),
  saveBookSearchHistoryRecord: vi.fn(),
  deleteBookSearchHistoryRecord: vi.fn(),
  deleteBookSearchHistoryRecords: vi.fn(),
}));

vi.mock('@/services/ai/storage/aiStore', () => ({
  aiStore: aiStoreMock,
}));

import {
  deleteAIBookSearchHistoryRecord,
  deleteAIBookSearchHistoryRecords,
  listAIBookSearchHistory,
  normalizeAIBookSearchHistoryQuery,
  saveAIBookSearchHistorySnapshot,
} from '@/services/aiBookSearch/history';

const createResult = (index: number): AIBookSearchResult => ({
  id: `result-${index}`,
  title: `Book ${index}`,
  authors: [`Author ${index}`],
  source: 'gutendex',
  language: 'en',
  risk: 'direct-open',
  sourceLinks: [
    {
      source: 'gutendex',
      url: `https://www.gutenberg.org/ebooks/${index}`,
      label: 'Project Gutenberg',
      risk: 'external-warning',
    },
  ],
  downloadLinks: [],
  externalUrl: `https://www.gutenberg.org/ebooks/${index}`,
});

describe('AI book search history service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiStoreMock.getBookSearchHistoryRecords.mockResolvedValue([]);
    aiStoreMock.saveBookSearchHistoryRecord.mockResolvedValue(undefined);
    aiStoreMock.deleteBookSearchHistoryRecord.mockResolvedValue(undefined);
    aiStoreMock.deleteBookSearchHistoryRecords.mockResolvedValue(undefined);
  });

  it('normalizes search queries for deduping repeated searches', () => {
    expect(normalizeAIBookSearchHistoryQuery('  三体   刘慈欣  ')).toBe('三体 刘慈欣');
    expect(normalizeAIBookSearchHistoryQuery('  Frankenstein   EPUB  ')).toBe('frankenstein epub');
  });

  it('saves a trimmed result snapshot without UI-only or provider-sensitive fields', async () => {
    const results = Array.from({ length: 31 }, (_, index) => createResult(index));

    await saveAIBookSearchHistorySnapshot({
      query: ' Frankenstein   EPUB ',
      results,
      intent: null,
      selectedSource: 'all',
      deepSearchStatus: 'idle',
      progressEvents: [
        { step: 'intent', message: 'AI 正在理解书名、作者和语言偏好', timestamp: 1 },
        { step: 'tier1-sources', message: 'Open Library 找到 1 条线索', timestamp: 2 },
        { step: 'done', message: '已整理出 31 个结果', timestamp: 3 },
        { step: 'done', message: '只保留最近可见日志', timestamp: 4 },
      ],
      importStatuses: { 'result-0:epub:url': 'imported' },
      rawResponse: { provider: 'hidden' },
      prompt: 'hidden prompt',
    });

    expect(aiStoreMock.saveBookSearchHistoryRecord).toHaveBeenCalledTimes(1);
    const savedRecord = aiStoreMock.saveBookSearchHistoryRecord.mock.calls[0]?.[0];
    expect(savedRecord).toMatchObject({
      id: 'frankenstein epub',
      query: 'Frankenstein EPUB',
      normalizedQuery: 'frankenstein epub',
      resultCount: 30,
      selectedSource: 'all',
      deepSearchStatus: 'idle',
      schemaVersion: 1,
    });
    expect(savedRecord.results).toHaveLength(30);
    expect(
      savedRecord.progressSummary.map((event: AIBookSearchProgressEvent) => event.message),
    ).toEqual(['Open Library 找到 1 条线索', '已整理出 31 个结果', '只保留最近可见日志']);
    expect('importStatuses' in savedRecord).toBe(false);
    expect('rawResponse' in savedRecord).toBe(false);
    expect('prompt' in savedRecord).toBe(false);
  });

  it('overwrites an existing normalized query while preserving its creation time', async () => {
    aiStoreMock.getBookSearchHistoryRecords.mockResolvedValue([
      {
        id: '三体 刘慈欣',
        query: '三体 刘慈欣',
        normalizedQuery: '三体 刘慈欣',
        createdAt: 100,
        updatedAt: 120,
        resultCount: 1,
        results: [createResult(1)],
        intent: null,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
    ]);

    await saveAIBookSearchHistorySnapshot({
      query: '  三体   刘慈欣 ',
      results: [createResult(2), createResult(3)],
      intent: null,
      selectedSource: 'github',
      deepSearchStatus: 'done',
      progressEvents: [],
    });

    const savedRecord = aiStoreMock.saveBookSearchHistoryRecord.mock.calls[0]?.[0];
    expect(savedRecord.id).toBe('三体 刘慈欣');
    expect(savedRecord.createdAt).toBe(100);
    expect(savedRecord.updatedAt).toBeGreaterThan(120);
    expect(savedRecord.resultCount).toBe(2);
    expect(savedRecord.selectedSource).toBe('github');
    expect(savedRecord.deepSearchStatus).toBe('done');
  });

  it('keeps only the latest 30 records after saving', async () => {
    const existingRecords = Array.from({ length: 30 }, (_, index) => ({
      id: `old-${index}`,
      query: `Old ${index}`,
      normalizedQuery: `old-${index}`,
      createdAt: index,
      updatedAt: index,
      resultCount: 1,
      results: [createResult(index)],
      intent: null,
      selectedSource: 'all' as const,
      deepSearchStatus: 'idle' as const,
      progressSummary: [],
      schemaVersion: 1 as const,
    }));
    aiStoreMock.getBookSearchHistoryRecords.mockResolvedValue(existingRecords);

    await saveAIBookSearchHistorySnapshot({
      query: 'new query',
      results: [createResult(99)],
      intent: null,
      selectedSource: 'all',
      deepSearchStatus: 'idle',
      progressEvents: [],
    });

    expect(aiStoreMock.deleteBookSearchHistoryRecords).toHaveBeenCalledWith(['old-0']);
  });

  it('delegates list, single delete, and batch delete to the AI store', async () => {
    const records = [
      {
        id: '三体',
        query: '三体',
        normalizedQuery: '三体',
        createdAt: 100,
        updatedAt: 200,
        resultCount: 1,
        results: [createResult(1)],
        intent: null,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
    ];
    aiStoreMock.getBookSearchHistoryRecords.mockResolvedValue(records);

    await expect(listAIBookSearchHistory()).resolves.toBe(records);
    await deleteAIBookSearchHistoryRecord('三体');
    await deleteAIBookSearchHistoryRecords(['三体', '红楼梦']);

    expect(aiStoreMock.deleteBookSearchHistoryRecord).toHaveBeenCalledWith('三体');
    expect(aiStoreMock.deleteBookSearchHistoryRecords).toHaveBeenCalledWith(['三体', '红楼梦']);
  });
});
