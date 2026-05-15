import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AISettings, BookIndexMeta } from '@/services/ai/types';

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  isIndexed: vi.fn(),
  getMeta: vi.fn(),
  saveChunks: vi.fn(),
  saveBM25Index: vi.fn(),
  saveMeta: vi.fn(),
  clearBook: vi.fn(),
  getEmbeddingModel: vi.fn(),
}));

vi.mock('ai', () => ({
  embed: vi.fn(),
  embedMany: mocks.embedMany,
}));

vi.mock('@/services/ai/storage/aiStore', () => ({
  aiStore: {
    isIndexed: mocks.isIndexed,
    getMeta: mocks.getMeta,
    saveChunks: mocks.saveChunks,
    saveBM25Index: mocks.saveBM25Index,
    saveMeta: mocks.saveMeta,
    clearBook: mocks.clearBook,
  },
}));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({
    getEmbeddingModel: mocks.getEmbeddingModel,
  }),
}));

vi.mock('@/services/ai/utils/retry', async () => {
  const actual = await vi.importActual<typeof import('@/services/ai/utils/retry')>(
    '@/services/ai/utils/retry',
  );
  return {
    ...actual,
    withRetryAndTimeout: (fn: () => Promise<unknown>) => fn(),
  };
});

vi.mock('@/services/ai/logger', () => ({
  aiLogger: {
    rag: {
      isIndexed: vi.fn(),
      indexStart: vi.fn(),
      indexProgress: vi.fn(),
      indexComplete: vi.fn(),
      indexError: vi.fn(),
    },
    chunker: {
      section: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
    },
    embedding: {
      start: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
    },
    store: {
      saveChunks: vi.fn(),
      saveBM25: vi.fn(),
      saveMeta: vi.fn(),
      clear: vi.fn(),
    },
    search: {
      query: vi.fn(),
      hybridResults: vi.fn(),
    },
  },
}));

import { BM25_ONLY_EMBEDDING_MODEL, indexBook, isBookIndexed } from '@/services/ai/ragService';

const settings: AISettings = {
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openai',
  providerApiKeys: { openai: 'openai-key' },
  providerModels: { openai: 'gpt-4o-mini' },
  providerEmbeddingModels: { openai: 'text-embedding-3-small' },
  spoilerProtection: true,
  maxContextChunks: 3,
  indexingMode: 'on-demand',
};

function createDocument(html: string): Document {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    'text/html',
  );
}

const bookDoc = {
  metadata: { title: 'Book', author: 'Author' },
  toc: [{ id: 0, label: 'Chapter 1', href: 'chapter-1.xhtml' }],
  sections: [
    {
      id: 'section-1',
      href: 'chapter-1.xhtml',
      cfi: 'epubcfi(/6/2)',
      size: 1200,
      linear: 'yes',
      createDocument: async () => createDocument(`<p>${'Readable content. '.repeat(80)}</p>`),
    },
  ],
};

const currentMeta: BookIndexMeta = {
  bookHash: 'book-hash',
  bookTitle: 'Book',
  authorName: 'Author',
  totalSections: 1,
  totalChunks: 3,
  embeddingModel: 'text-embedding-3-small',
  indexVersion: 1,
  chunkerVersion: 3,
  bm25Version: 1,
  estimatedBytes: 4096,
  lastUpdated: 1,
};

describe('indexBook metadata freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isIndexed.mockResolvedValue(false);
    mocks.getMeta.mockResolvedValue(null);
    mocks.getEmbeddingModel.mockReturnValue('embedding-model');
    mocks.saveChunks.mockResolvedValue(undefined);
    mocks.saveBM25Index.mockResolvedValue(undefined);
    mocks.saveMeta.mockResolvedValue(undefined);
    mocks.clearBook.mockResolvedValue(undefined);
  });

  it('treats legacy metadata without version fields as stale', async () => {
    mocks.getMeta.mockResolvedValue({
      bookHash: 'book-hash',
      bookTitle: 'Book',
      authorName: 'Author',
      totalSections: 1,
      totalChunks: 3,
      embeddingModel: 'text-embedding-3-small',
      lastUpdated: 1,
    });

    await expect(isBookIndexed('book-hash', settings)).resolves.toBe(false);
  });

  it('treats stale index, chunker, or BM25 versions as not indexed', async () => {
    mocks.getMeta.mockResolvedValue({ ...currentMeta, bm25Version: 0 });

    await expect(isBookIndexed('book-hash', settings)).resolves.toBe(false);
  });

  it('treats an embedding model change as stale when embeddings are configured', async () => {
    mocks.getMeta.mockResolvedValue({ ...currentMeta, embeddingModel: 'old-embedding-model' });

    await expect(isBookIndexed('book-hash', settings)).resolves.toBe(false);
  });

  it('accepts current metadata as indexed', async () => {
    mocks.getMeta.mockResolvedValue(currentMeta);

    await expect(isBookIndexed('book-hash', settings)).resolves.toBe(true);
  });

  it('accepts a BM25-only fallback index as indexed when embedding settings are enabled', async () => {
    mocks.getMeta.mockResolvedValue({ ...currentMeta, embeddingModel: BM25_ONLY_EMBEDDING_MODEL });

    await expect(isBookIndexed('book-hash', settings)).resolves.toBe(true);
  });

  it('saves versioned metadata with a storage estimate after indexing', async () => {
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));

    await indexBook(bookDoc, 'book-hash', settings);

    expect(mocks.saveMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        indexVersion: 1,
        chunkerVersion: 3,
        bm25Version: 1,
        estimatedBytes: expect.any(Number),
      }),
    );
    expect(mocks.saveMeta.mock.calls[0]![0].estimatedBytes).toBeGreaterThan(0);
  });

  it('stores section jump targets and specific nested chapter labels on chunks', async () => {
    const nestedBookDoc = {
      metadata: { title: 'Book', author: 'Author' },
      toc: [
        {
          id: 0,
          label: '第一部 小丑',
          href: 'part-1.xhtml',
          subitems: [{ id: 0, label: '第五章 线索', href: 'chapter-5.xhtml' }],
        },
      ],
      sections: [
        {
          id: 'chapter-5',
          href: 'chapter-5.xhtml',
          cfi: 'epubcfi(/6/10)',
          size: 1200,
          linear: 'yes',
          createDocument: async () =>
            createDocument(`<p>${'灰雾之上的线索再次出现。'.repeat(80)}</p>`),
        },
      ],
    };

    await indexBook(nestedBookDoc, 'book-hash', { ...settings, providerEmbeddingModels: {} });

    expect(mocks.saveChunks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          chapterTitle: '第一部 小丑 · 第五章 线索',
          href: 'chapter-5.xhtml',
          cfi: 'epubcfi(/6/10)',
        }),
      ]),
    );
  });

  it('uses BM25-only indexing without embeddings when no embedding model is configured', async () => {
    const bm25OnlySettings: AISettings = {
      ...settings,
      providerEmbeddingModels: {},
    };

    await indexBook(bookDoc, 'book-hash', bm25OnlySettings);

    expect(mocks.embedMany).not.toHaveBeenCalled();
    expect(mocks.saveMeta).toHaveBeenCalledWith(
      expect.objectContaining({ embeddingModel: BM25_ONLY_EMBEDDING_MODEL }),
    );
  });

  it('stores BM25-only metadata when configured embeddings fail', async () => {
    mocks.embedMany.mockRejectedValue(new Error('embedding unavailable'));

    await indexBook(bookDoc, 'book-hash', settings);

    expect(mocks.saveMeta).toHaveBeenCalledWith(
      expect.objectContaining({ embeddingModel: BM25_ONLY_EMBEDDING_MODEL }),
    );
  });

  it('does not reuse an in-flight index job with a different embedding model', async () => {
    const alternateSettings: AISettings = {
      ...settings,
      providerEmbeddingModels: { openai: 'text-embedding-3-large' },
    };
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));

    await Promise.all([
      indexBook(bookDoc, 'book-hash', settings),
      indexBook(bookDoc, 'book-hash', alternateSettings),
    ]);

    expect(mocks.embedMany).toHaveBeenCalledTimes(2);
    expect(mocks.saveMeta.mock.calls.map((call) => call[0].embeddingModel)).toEqual(
      expect.arrayContaining(['text-embedding-3-small', 'text-embedding-3-large']),
    );
  });
});

describe('indexBook cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isIndexed.mockResolvedValue(false);
    mocks.getMeta.mockResolvedValue(null);
    mocks.getEmbeddingModel.mockReturnValue('embedding-model');
    mocks.saveChunks.mockResolvedValue(undefined);
    mocks.saveBM25Index.mockResolvedValue(undefined);
    mocks.saveMeta.mockResolvedValue(undefined);
    mocks.clearBook.mockResolvedValue(undefined);
  });

  it('does not persist chunks, BM25, or meta when aborted after embedding', async () => {
    const controller = new AbortController();
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => {
      controller.abort();
      return { embeddings: values.map(() => [0.1, 0.2, 0.3]) };
    });

    await expect(
      indexBook(bookDoc, 'book-hash', settings, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(mocks.saveChunks).not.toHaveBeenCalled();
    expect(mocks.saveBM25Index).not.toHaveBeenCalled();
    expect(mocks.saveMeta).not.toHaveBeenCalled();
    expect(mocks.clearBook).not.toHaveBeenCalled();
  });

  it('cleans up partial index data when aborted during chunk persistence', async () => {
    const controller = new AbortController();
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));
    mocks.saveChunks.mockImplementation(async () => {
      controller.abort();
    });

    await expect(
      indexBook(bookDoc, 'book-hash', settings, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(mocks.saveChunks).toHaveBeenCalledTimes(1);
    expect(mocks.clearBook).toHaveBeenCalledWith('book-hash');
    expect(mocks.saveBM25Index).not.toHaveBeenCalled();
    expect(mocks.saveMeta).not.toHaveBeenCalled();
  });

  it('cleans up partial index data when aborted during meta persistence', async () => {
    const controller = new AbortController();
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));
    mocks.saveMeta.mockImplementation(async () => {
      controller.abort();
    });

    await expect(
      indexBook(bookDoc, 'book-hash', settings, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(mocks.saveChunks).toHaveBeenCalledTimes(1);
    expect(mocks.saveBM25Index).toHaveBeenCalledTimes(1);
    expect(mocks.saveMeta).toHaveBeenCalledTimes(1);
    expect(mocks.clearBook).toHaveBeenCalledWith('book-hash');
  });

  it('deduplicates concurrent indexing for the same book so one abort cannot clear another index', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    mocks.embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));
    mocks.saveChunks.mockImplementation(async () => undefined);

    const firstIndexing = indexBook(bookDoc, 'book-hash', settings, {
      signal: firstController.signal,
    });
    const secondIndexing = indexBook(bookDoc, 'book-hash', settings, {
      signal: secondController.signal,
    });

    secondController.abort();

    await expect(firstIndexing).resolves.toBeUndefined();
    await expect(secondIndexing).resolves.toBeUndefined();
    expect(mocks.embedMany).toHaveBeenCalledTimes(1);
    expect(mocks.clearBook).not.toHaveBeenCalled();
  });
});
