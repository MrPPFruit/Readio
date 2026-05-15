import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_PROVIDER_CATALOG, DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';

const {
  generateTextMock,
  streamTextMock,
  getAIProviderMock,
  hybridSearchMock,
  isBookIndexedMock,
  packReaderContextMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
  getAIProviderMock: vi.fn(),
  hybridSearchMock: vi.fn(),
  isBookIndexedMock: vi.fn(),
  packReaderContextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
}));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: getAIProviderMock,
}));

vi.mock('@/services/ai/ragService', () => ({
  hybridSearch: hybridSearchMock,
  isBookIndexed: isBookIndexedMock,
}));

vi.mock('@/services/ai/search/contextPack', () => ({
  packReaderContext: packReaderContextMock,
}));

vi.mock('@/services/ai/logger', () => ({
  aiLogger: {
    chat: {
      send: vi.fn(),
      context: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
    },
  },
}));

import { createTauriAdapter } from '@/services/ai/adapters/TauriChatAdapter';
import type { ChatModelRunResult } from '@assistant-ui/react';

const settings: AISettings = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openrouter',
  providerApiKeys: { openrouter: 'openrouter-key' },
  providerModels: { openrouter: AI_PROVIDER_CATALOG.openrouter.defaultModel },
};

const runWithAppPlatform = async (platform: string | undefined, fn: () => Promise<void>) => {
  const originalPlatform = process.env['NEXT_PUBLIC_APP_PLATFORM'];
  if (platform) {
    process.env['NEXT_PUBLIC_APP_PLATFORM'] = platform;
  } else {
    delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
  }
  try {
    await fn();
  } finally {
    if (originalPlatform) {
      process.env['NEXT_PUBLIC_APP_PLATFORM'] = originalPlatform;
    } else {
      delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
    }
  }
};

describe('createTauriAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateTextMock.mockResolvedValue({ text: 'adapter-ok' });
    streamTextMock.mockReturnValue({
      textStream: (async function* () {
        yield 'adapter-';
        yield 'ok';
      })(),
    });
    getAIProviderMock.mockReturnValue({ getModel: () => 'mock-model' });
    isBookIndexedMock.mockResolvedValue(false);
    hybridSearchMock.mockResolvedValue([]);
    packReaderContextMock.mockImplementation(({ chunks }) => chunks);
  });

  it('asks the user to index before answering when the book is not indexed', async () => {
    const adapter = createTauriAdapter(() => ({
      settings,
      bookHash: 'book-hash',
      bookTitle: 'Book',
      authorName: 'Author',
      currentPage: 42,
    }));
    const chunks: ChatModelRunResult[] = [];
    const result = adapter.run({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: '继续讲讲' }],
        },
      ],
    } as never) as AsyncGenerator<ChatModelRunResult>;

    for await (const chunk of result) {
      chunks.push(chunk);
    }

    expect(chunks.at(-1)).toEqual({
      content: [
        {
          type: 'text',
          text: '这本书还没有完成 AI 索引。请先点击“开始索引”，完成后我就可以基于书本内容继续回答。',
        },
      ],
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('oversamples and packs retrieval context before prompting in the Tauri adapter', async () => {
    isBookIndexedMock.mockResolvedValue(true);
    const searchChunk = {
      id: 'book-1-0',
      bookHash: 'book-hash',
      sectionIndex: 1,
      chapterTitle: 'Chapter',
      pageNumber: 40,
      text: '戴里克在白银城点亮蜡烛。',
      score: 2,
      searchMethod: 'bm25' as const,
    };
    hybridSearchMock.mockResolvedValue([searchChunk]);
    packReaderContextMock.mockReturnValue([searchChunk]);

    const adapter = createTauriAdapter(() => ({
      settings: { ...settings, maxContextChunks: 2, spoilerProtection: true },
      bookHash: 'book-hash',
      bookTitle: 'Book',
      authorName: 'Author',
      currentPage: 42,
    }));
    const result = adapter.run({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: '戴里克发生了什么？' }],
        },
      ],
    } as never) as AsyncGenerator<ChatModelRunResult>;

    for await (const _chunk of result) {
      // drain stream
    }

    expect(hybridSearchMock).toHaveBeenCalledWith(
      'book-hash',
      '戴里克发生了什么？',
      expect.objectContaining({ maxContextChunks: 2 }),
      8,
      42,
    );
    expect(packReaderContextMock).toHaveBeenCalledWith({
      question: '戴里克发生了什么？',
      chunks: [searchChunk],
      currentPage: 42,
      maxContextChunks: 2,
      spoilerProtection: true,
    });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('戴里克在白银城点亮蜡烛。'),
      }),
    );
  });

  it('passes disabled spoiler protection through to the Tauri system prompt', async () => {
    isBookIndexedMock.mockResolvedValue(true);
    hybridSearchMock.mockResolvedValue([]);

    const adapter = createTauriAdapter(() => ({
      settings: { ...settings, spoilerProtection: false },
      bookHash: 'book-hash',
      bookTitle: 'Book',
      authorName: 'Author',
      currentPage: 42,
    }));
    const result = adapter.run({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: '结局是什么？' }],
        },
      ],
    } as never) as AsyncGenerator<ChatModelRunResult>;

    for await (const _chunk of result) {
      // drain stream
    }

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Spoiler mode is allowed for this request'),
      }),
    );
  });

  it('streams direct provider generation in the Tauri app even when window exists', async () => {
    isBookIndexedMock.mockResolvedValue(true);

    await runWithAppPlatform('tauri', async () => {
      const originalWindow = globalThis.window;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => new Response('<!DOCTYPE html>'));
      Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
      Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true });

      try {
        const adapter = createTauriAdapter(() => ({
          settings,
          bookHash: 'book-hash',
          bookTitle: 'Book',
          authorName: 'Author',
          currentPage: 42,
        }));
        const chunks: ChatModelRunResult[] = [];
        const result = adapter.run({
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: '发生了什么？' }],
            },
          ],
        } as never) as AsyncGenerator<ChatModelRunResult>;

        for await (const chunk of result) {
          chunks.push(chunk);
        }

        expect(chunks).toEqual([
          { content: [{ type: 'text', text: 'adapter-' }] },
          { content: [{ type: 'text', text: 'adapter-ok' }] },
        ]);
        expect(JSON.stringify(chunks)).not.toContain('<!DOCTYPE html>');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(streamTextMock).toHaveBeenCalledWith(
          expect.objectContaining({
            model: 'mock-model',
            messages: [{ role: 'user', content: '发生了什么？' }],
          }),
        );
        expect(generateTextMock).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
        Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true });
      }
    });
  });
});
