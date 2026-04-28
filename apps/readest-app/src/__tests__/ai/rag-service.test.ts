import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AISettings } from '@/services/ai/types';

const mocks = vi.hoisted(() => ({
  embedMany: vi.fn(),
  isIndexed: vi.fn(),
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

import { indexBook } from '@/services/ai/ragService';

const settings: AISettings = {
  enabled: true,
  provider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  ollamaEmbeddingModel: 'nomic-embed-text',
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
  toc: [{ id: 0, label: 'Chapter 1' }],
  sections: [
    {
      id: 'section-1',
      size: 1200,
      linear: 'yes',
      createDocument: async () => createDocument(`<p>${'Readable content. '.repeat(80)}</p>`),
    },
  ],
};

describe('indexBook cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isIndexed.mockResolvedValue(false);
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
      indexBook(bookDoc, 'book-hash', settings, undefined, controller.signal),
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
      indexBook(bookDoc, 'book-hash', settings, undefined, controller.signal),
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
      indexBook(bookDoc, 'book-hash', settings, undefined, controller.signal),
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

    const firstIndexing = indexBook(
      bookDoc,
      'book-hash',
      settings,
      undefined,
      firstController.signal,
    );
    const secondIndexing = indexBook(
      bookDoc,
      'book-hash',
      settings,
      undefined,
      secondController.signal,
    );

    secondController.abort();

    await expect(firstIndexing).resolves.toBeUndefined();
    await expect(secondIndexing).resolves.toBeUndefined();
    expect(mocks.embedMany).toHaveBeenCalledTimes(1);
    expect(mocks.clearBook).not.toHaveBeenCalled();
  });
});
